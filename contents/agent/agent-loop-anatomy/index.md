---
date: '2026-06-02'
title: 'AI Agent 루프: 한 턴의 요청이 처리되는 6단계'
category: 'AI Agent'
series: 'agent'
seriesOrder: 5
tags: ['Agent Loop', 'AI Agent', 'Claude Code', 'Codex', 'queryLoop']
summary: '에이전트 루프 한 턴의 내부 구조를 해부합니다. Claude Code queryLoop()의 6단계 파이프라인과 Codex Responses API의 상태 없는 재구성 방식을 비교하며, 도구 실행 동시성, 퍼미션, 에러 복구의 실제 동작을 살펴봅니다.'
thumbnail: './thumbnail.png'
---

Claude Code에 테스트가 실패하는 파일을 고쳐달라고 요청하면, 파일을 읽고 수정한 뒤 테스트를 다시 실행합니다. 그런데 수정 내용이 길어서 응답이 중간에 잘리면 어떻게 될까요? 루프는 자동으로 `max_tokens`를 높여서 동일한 요청을 다시 시도합니다. 이 재시도는 모델이 결정한 것이 아닙니다. 루프의 **인프라**가 판단한 것입니다.

[이전 글](/agent/context-engineering/)에서 에이전트의 유한한 토큰 윈도우를 관리하는 전략을 살펴봤습니다. 그 컨텍스트가 실제로 조립되고, 소비되고, 관리되는 기계 장치가 바로 에이전트 루프입니다. [첫 번째 글](/agent/what-is-ai-agent/)에서 "루프 자체는 놀라울 정도로 단순합니다. 복잡한 것은 루프 주변의 인프라"라고 했는데, 이제 그 인프라의 뚜껑을 열어보겠습니다.

---

## 루프의 두 가지 아키텍처

[첫 번째 글](/agent/what-is-ai-agent/)에서 Claude Code는 "AsyncGenerator while-loop", Codex는 "Responses API 기반 재쿼리 루프"라고 한 줄로 비교했습니다. 이것은 단순한 구현 취향의 차이가 아니라, 근본적으로 다른 아키텍처 철학입니다.

### 상태 유지 vs 상태 재구성

두 에이전트는 같은 문제(루프 반복)를 정반대 방식으로 풉니다.

```
Claude Code (상태 유지)              Codex (상태 재구성)
┌──────────────────────┐           ┌──────────────────────┐
│  queryLoop()         │           │  while True:         │
│  (AsyncGenerator)    │           │    history = []      │
│                      │           │    rebuild(history)  │
│  messages = [...]    │           │    POST /responses   │
│  (메모리에 누적)        │           │    SSE stream 수신    │
│                      │           │    append results    │
│  yield event         │           │    if done: break    │
│  yield event         │           │                      │
└──────────────────────┘           └──────────────────────┘
상태가 루프 안에 유지                    매 턴마다 상태를 재구성
```

**Claude Code**는 `queryLoop()`이라는 AsyncGenerator 함수가 전체 세션을 관장합니다. 대화 히스토리는 메모리 내 `messages` 배열에 누적되고, 루프가 돌 때마다 이 배열을 직접 참조합니다. 상태가 프로세스 안에 살아있으므로, 루프 중간에 전처리를 끼워넣거나 에러 복구를 수행하기 쉽습니다.

**Codex**는 매 턴마다 새로운 HTTP POST 요청을 Responses API에 보냅니다. 서버 측에 대화 상태가 남지 않으므로, 클라이언트가 전체 히스토리를 직접 재구성해서 보내야 합니다. Responses API는 `previous_response_id`라는 서버 측 상태 연결 기능을 제공하지만, Codex는 이것을 **의도적으로 사용하지 않습니다**.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 Zero Data Retention</strong><br>
  OpenAI 블로그의 원문에 따르면, Codex가 <code>previous_response_id</code>를 쓰지 않는 이유는 "to keep requests fully stateless and support Zero Data Retention (ZDR) configurations"입니다. 요청의 stateless 유지와 ZDR 지원이 병렬적인 두 가지 이유이며, 그 결과 매 턴마다 클라이언트가 전체 히스토리를 직접 보내야 합니다.
</div>

흥미로운 점은 두 도구 모두 개발자의 로컬 머신에서 실행되는 CLI라는 것입니다. 같은 배포 환경임에도 상태 관리 방식이 정반대인 이유는, 설계 철학의 차이에서 비롯됩니다. Claude Code는 하네스 코드에 복잡한 인프라(전처리, 퍼미션, 에러 복구)를 내장하기 위해 상태를 프로세스 안에 유지합니다. Codex CLI는 요청을 stateless하게 유지하고 복잡도를 API 서비스에 위임하는 방식을 선택한 것입니다.

---

## Claude Code의 한 턴: 6단계 파이프라인

Claude Code에서 한 턴이 처리되는 과정을 추적해 보겠습니다. Claude Code의 아키텍처를 역공학 분석한 논문(arXiv 2604.14228, "Dive into Claude Code")은 `queryLoop()`의 내부를 9개의 순차적 단계로 분석하는데, 이 글에서는 독자의 이해를 위해 핵심 흐름을 6단계로 단순화하여 살펴봅니다.

### 전체 흐름

```
한 턴의 6단계 파이프라인

[1. Context Assembly]   시스템 프롬프트 + 도구 정의 + 메시지 히스토리 조립
         │
[2. Pre-model Shapers]  5단계 전처리 (Budget Reduction, Snip, Microcompact, ...)
         │
[3. Model Call]         API 호출 → SSE 스트리밍 응답 수신
         │
[4. Tool Execution]     퍼미션 체크 → concurrent-safe/exclusive 분류 → 실행
         │
[5. Accumulate]         도구 결과를 messages 배열에 추가
         │
[6. Decide]             도구 호출이 있으면 → 1로 돌아감, 없으면 → 종료
```

[첫 번째 글](/agent/what-is-ai-agent/)에서 "AI가 판단하는 로직은 전체의 1.6%에 불과하다"고 했습니다. 이 파이프라인에서 실제로 AI가 관여하는 단계는 Stage 3(Model Call) 하나뿐입니다. 나머지 5단계는 전부 결정론적 인프라입니다.

### Stage 1-2: 컨텍스트 조립과 전처리

Stage 1에서는 모델에게 보낼 프롬프트를 조립합니다. 시스템 프롬프트, 도구 스키마([두 번째 글](/agent/agent-workflow-patterns/)에서 다룬 `assembleToolPool()`의 결과물), CLAUDE.md 계층 구조([이전 글](/agent/context-engineering/)에서 다룬 JIT 로딩), 그리고 지금까지 누적된 메시지 히스토리가 합쳐집니다.

Stage 2에서는 이 조립된 컨텍스트에 5단계 전처리 파이프라인이 적용됩니다. [이전 글](/agent/context-engineering/)에서 "5단계 컴팩션 파이프라인"이라 소개한 것을 arXiv 논문에서는 **Pre-model Shapers**라는 이름으로 분석합니다.

```
Pre-model Shapers (5단계)

messages[] ──► Budget Reduction ──► Snip ──► Microcompact
                                                  │
                    shaped_messages[] ◄── Auto-Compact ◄── Context Collapse
```

이전 글에서 컴팩션의 전략적 trade-off를 살펴봤습니다. 여기서 중요한 것은 이 전처리가 **매 턴마다** 실행된다는 점입니다. 컨텍스트가 가득 찼을 때만 작동하는 비상 장치가 아니라, 매 턴 모델 호출 전에 컨텍스트를 정리하는 정기적 유지보수에 가깝습니다. 각 단계의 상세한 작동 메커니즘은 다음 글에서 다루겠습니다.

### Stage 3: 모델 호출과 스트리밍

정제된 컨텍스트가 API로 전송되면, 응답은 Server-Sent Events(SSE) 스트림으로 돌아옵니다. `queryLoop()`가 AsyncGenerator인 이유가 여기서 드러납니다. 응답이 한꺼번에 오는 것이 아니라 토큰 단위로 흘러오기 때문에, `yield`로 이벤트를 하나씩 내보내면 호출자(하네스)가 실시간으로 처리할 수 있습니다.

이 구조를 단순화하면 다음과 같습니다.

```python
async def query_loop(messages: list, tools: list):
    """Claude Code queryLoop()의 핵심 패턴을 단순화한 모델."""
    while True:
        # Stage 1-2: 컨텍스트 조립 + 전처리
        shaped = pre_model_shapers(messages, tools)

        # Stage 3: 모델 호출 (SSE 스트리밍)
        tool_calls = []
        async for event in call_model_streaming(shaped, tools):
            yield event  # 호출자가 실시간으로 이벤트를 수신

            if event.type == "tool_use":
                tool_calls.append(event)

        # Stage 4: 도구 실행
        for call in tool_calls:
            result = await execute_tool(call, messages)
            messages.append(tool_result(call.id, result))

        # Stage 5: 어시스턴트 메시지 누적
        messages.append(assistant_message(event))

        # Stage 6: 판단
        if not tool_calls:
            return  # 루프 종료
```

arXiv 논문에 따르면 `queryLoop()`가 yield하는 이벤트는 여러 유형으로 나뉩니다. `StreamEvent`(스트리밍 텍스트 청크), `RequestStartEvent`(API 호출 시작 신호), `Message`(완성된 메시지), `TombstoneMessage`(컴팩션으로 대체된 메시지의 자리 표시), `ToolUseSummaryMessage`(도구 실행 요약) 등이 있습니다. 이 이벤트 스트림이 터미널 UI를 실시간으로 구동합니다.

### Stage 4: 도구 실행과 동시성

모델 응답에 도구 호출이 포함되어 있으면 실행 단계로 넘어갑니다. 여기서 흥미로운 최적화가 일어납니다. `StreamingToolExecutor`는 모델의 **응답이 완전히 끝나기 전에** 도구 실행을 시작합니다. 스트림에서 도구 호출 블록이 하나씩 나올 때마다 즉시 실행을 개시하는 것입니다.

[두 번째 글](/agent/agent-workflow-patterns/)에서 Parallelization 패턴을 살펴봤는데, 그 패턴이 실제로 작동하는 위치가 바로 이 Stage 4입니다.

```
모델 응답 (스트리밍)
    │
    ├─ tool_use: Read(file_a)    ──┐
    ├─ tool_use: Grep(pattern)   ──┤  concurrent-safe → 동시 실행
    ├─ tool_use: Read(file_b)    ──┘
    │
    └─ tool_use: Bash(npm test)  ──────► exclusive → 순차 실행
                                              │
                                     퍼미션 체크 후 실행
                                              │
                                     결과 → messages[]에 추가
```

도구는 두 범주로 분류됩니다. `Read`, `Grep` 같은 읽기 전용 도구는 **concurrent-safe**(동시 실행 가능)로, `Bash`, `Edit`, `Write` 같은 상태 변경 도구는 **exclusive**로 분류됩니다. concurrent-safe 도구는 동시에 실행되고, exclusive 도구는 순차적으로 실행됩니다. 같은 파일을 읽는 것은 안전하지만, 동시에 수정하면 충돌이 발생하기 때문입니다.

퍼미션 체크도 이 단계에서 일어납니다. 논문에서 퍼미션 게이트는 독립적인 단계로 분리되어 있을 만큼 중요한 아키텍처 요소입니다. Claude Code는 7가지 퍼미션 모드를 정의하는데, 사용자에게 노출되는 5개(plan, default, acceptEdits, dontAsk, bypassPermissions)와 feature-gated인 `auto`(ML 분류기 기반), 서브에이전트 전용인 `bubble`(상위로 에스컬레이션)이 있습니다. 퍼미션 시스템의 상세한 구조는 [퍼미션 글](/agent/agent-permission-safety/)에서 다룹니다.

한 가지 중요한 설계 결정이 있습니다. 사용자가 도구 실행을 거부(deny)하면, 루프가 중단되는 것이 아니라 거부 결과가 모델에게 **라우팅 시그널**로 전달됩니다. 모델은 이 시그널을 보고 다른 접근법을 시도할 수 있습니다.

### Stage 5-6: 누적과 판단

도구 실행이 완료되면 결과가 `messages` 배열에 추가됩니다(Stage 5). [이전 글](/agent/context-engineering/)에서 "50턴 후 도구 결과만 250,000 토큰에 달한다"고 했는데, 그 토큰이 축적되는 곳이 바로 이 Stage 5입니다.

Stage 6의 판단 로직 자체는 단순합니다. 어시스턴트 메시지에 도구 호출이 포함되어 있으면 Stage 1로 돌아가고, 텍스트만 있으면 루프를 종료합니다. Anthropic의 "Building Effective Agents" 가이드가 설명하는 기본 루프 패턴의 종료 조건 그대로입니다.

하지만 실제 구현에는 한 가지 핵심적인 설계 요소가 있습니다. arXiv 논문은 `queryLoop()` 안에 **7개의 continue site**를 식별합니다. continue site란 루프가 다시 시작할 수 있는 지점으로, 상태를 점진적으로 변경(mutate)하지 않고 **통째로 교체(whole-object assignment)**하는 방식으로 관리됩니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 왜 whole-object assignment인가</strong><br>
  상태를 점진적으로 변경하면 중간 상태가 오염될 위험이 있습니다. 에러 복구 시 "어디까지 변경되었는가"를 추적해야 하기 때문입니다. 대신 상태를 통째로 교체하면, 각 continue site가 일종의 체크포인트 역할을 합니다. 에러가 발생하면 마지막 체크포인트의 상태로 깨끗하게 복귀할 수 있습니다.
</div>

---

## Codex의 한 턴: 상태 없는 재구성

Claude Code의 "상태 유지" 아키텍처를 살펴봤으니, 이제 Codex의 "상태 재구성" 아키텍처를 봅니다.

### HTTP POST + SSE 루프

Codex의 한 턴은 다음과 같이 처리됩니다.

```
Turn N의 처리 과정

[Client]                           [Responses API]
   │                                     │
   │  history = rebuild_all()            │
   │  prompt = [                         │
   │    developer_msg,                   │
   │    config_toml,                     │
   │    skill_files,                     │
   │    environment,                     │
   │    user_msg,                        │
   │    ...tool_results(turn 1..N-1)     │
   │  ]                                  │
   │──── POST /v1/responses ──────────► │
   │◄──── SSE stream ─────────────────  │
   │  parse tool_calls                   │
   │  execute in sandbox                 │
   │  append results to history          │
   │                                     │
   │  if no tool_calls: done             │
```

매 턴마다 클라이언트는 전체 대화 히스토리를 재구성합니다. developer message(샌드박스 설명), `config.toml` 설정, 프로젝트 스킬 파일, 환경 정보(작업 디렉터리, 셸 종류), 사용자 메시지, 그리고 이전 턴들의 모든 도구 결과가 하나의 배열로 합쳐져 API에 전송됩니다.

이것을 코드로 표현하면 다음과 같습니다.

```python
async def codex_loop(task: str, config: dict):
    """Codex의 상태 없는 재구성 루프를 단순화한 모델."""
    history = []

    # 정적 프리픽스 (캐시 가능)
    developer_msg = build_developer_message(config)
    history.append({"role": "developer", "content": developer_msg})
    history.append({"role": "user", "content": task})

    while True:
        # 전체 히스토리를 매번 전송 (previous_response_id 미사용)
        response = await post_responses_api(
            input=history,
            stream=True,
        )

        assistant_msg, tool_calls = parse_sse_stream(response)
        history.append(assistant_msg)

        if not tool_calls:
            return assistant_msg["content"]

        # 샌드박스 내에서 도구 실행
        for call in tool_calls:
            result = await sandbox_execute(call)
            history.append(tool_result(call["id"], result))
```

Claude Code의 6단계 파이프라인과 비교하면 구조가 훨씬 간결합니다. Pre-model Shapers가 없고, 퍼미션 파이프라인이 없고, continue site도 없습니다. 복잡도가 없어진 것이 아니라 다른 곳에 배치된 것인데, 이것은 뒤에서 살펴봅니다.

### 캐시 프리픽스 전략

매 턴마다 전체 히스토리를 보내면 Turn N에서 보내는 총 토큰은 N에 비례하고, N턴에 걸쳐 누적된 전송량은 O(n^2)에 비례합니다. [이전 글](/agent/context-engineering/)에서 이 이차 비용 문제를 언급했는데, Codex는 **프롬프트 캐싱**으로 이 비용을 줄입니다.

핵심 원리는 단순합니다. 이전 요청과 새 요청의 처음 K개 토큰이 동일하면, 서버는 캐시된 결과를 재사용하고 새로운 토큰만 처리하는 구조입니다.

```
Turn 1: [developer │ config │ skills │ env │ user_msg]
         ←── 정적 프리픽스 (캐시됨) ──→  ← new →

Turn 2: [developer │ config │ skills │ env │ user_msg │ result_1]
         ←──── 캐시 적중 (동일 프리픽스) ────→  ←─ new ─→

Turn 3: [developer │ config │ skills │ env │ user_msg │ result_1 │ result_2]
         ←──────── 캐시 적중 (프리픽스 성장) ──────────→  ← new →
```

이 전략이 작동하려면 **정적 콘텐츠가 프롬프트 앞쪽에** 있어야 합니다. developer message, config, skill files 같은 변하지 않는 요소가 앞에 오고, 매 턴 달라지는 도구 결과가 뒤에 와야 캐시 프리픽스가 최대한 길어집니다. 도구 재정렬, 설정 변경, 샌드박스 변경 등은 이 프리픽스를 깨뜨리므로 캐시 효율이 떨어집니다.

컨텍스트가 너무 길어지면 `/responses/compact` 엔드포인트가 등장합니다. 이 엔드포인트는 대화 히스토리를 압축한 암호화된 불투명 blob을 반환하는데, 클라이언트는 내용을 읽을 수 없지만 다음 요청의 프리픽스로 보내면 서버가 이를 복원하는 방식입니다. Claude Code의 투명한 컴팩션(모델이 직접 요약)과 대조적으로, Codex의 컴팩션은 API 서비스에 위임된 불투명한 처리인 셈입니다.

### 샌드박스 격리

Claude Code가 도구별 퍼미션으로 안전성을 확보한다면, Codex CLI는 **OS 네이티브 샌드박스**로 접근합니다.

Codex CLI도 개발자의 로컬 머신에서 실행되지만, 퍼미션 시스템 대신 OS 수준의 격리를 사용합니다. macOS에서는 Seatbelt 정책(`sandbox-exec`), Linux에서는 `bwrap` + `seccomp`로 프로세스를 격리합니다. 기본 정책은 네트워크 접근 차단, 파일 쓰기를 작업 디렉터리로 제한하는 것입니다.

참고로 Codex에는 별도의 **클라우드 버전**(Codex Cloud)도 있는데, 이쪽은 일회용 클라우드 컨테이너에서 실행되며 네트워크가 기본적으로 차단된 "two-phase runtime model"을 사용합니다. 이 글에서 비교하는 Codex는 Claude Code와 동일하게 로컬에서 실행되는 **Codex CLI**입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 같은 문제, 다른 해법</strong><br>
  두 도구 모두 개발자의 로컬 머신에서 실행되지만, 안전성 확보 방식이 다릅니다. Claude Code는 도구별로 세분화된 퍼미션 파이프라인(7-mode, deny-first)을 운영합니다. Codex CLI는 OS 네이티브 샌드박스로 프로세스 자체를 격리합니다. 전자는 "이 도구를 허용할까?"를, 후자는 "이 프로세스가 뭘 할 수 있을까?"를 제어하는 것입니다.
</div>

---

## 에러 복구: 루프가 실패에 대응하는 방법

50턴 이상 실행되는 긴 세션에서는 다양한 실패가 발생합니다. 모델 응답이 잘리거나, 컨텍스트가 윈도우를 초과하거나, 스트리밍 연결이 끊어지는 등의 문제입니다. 에러 복구 없는 에이전트 루프는 프로덕션에서 사용할 수 없습니다.

### Claude Code의 4가지 에러 복구 전략

arXiv 논문은 Claude Code가 4가지 에러 복구 전략을 사용한다고 분석했는데, 각각을 살펴보면 다음과 같습니다.

**1. Output token escalation**

모델 응답이 `max_tokens` 한도에 걸려 잘렸을 때 작동하는 전략입니다. 하네스는 `max_tokens`를 자동으로 높여서 재시도하는데, 최대 3회까지(`MAX_OUTPUT_TOKENS_RECOVERY_LIMIT`) 토큰 한도를 점진적으로 증가시키며 시도합니다. 글 서두에서 관찰한 현상이 바로 여기에 해당합니다.

**2. Reactive compaction**

누적된 컨텍스트가 모델의 윈도우를 초과할 때 작동합니다. 앞서 본 Pre-model Shapers가 매 턴 사전 예방적으로 실행되는 것과 달리, reactive compaction은 실제로 한도를 초과한 후 긴급하게 발동되는 전략입니다. 턴당 최대 1회(`REACTIVE_COMPACT` 플래그)만 실행됩니다.

**3. Prompt-too-long handling**

reactive compaction으로도 부족할 때의 최후 수단입니다. Context Collapse(오래된 도구 결과를 더 공격적으로 제거)를 실행하고, 그래도 안 되면 루프를 중단합니다.

**4. Streaming fallback**

네트워크 문제로 SSE 스트리밍이 실패하면, 비스트리밍(non-streaming) 모드로 전환하여 같은 요청을 다시 시도합니다.

이 전략들을 코드로 단순화하면 다음과 같습니다.

```python
async def resilient_loop(messages, tools, llm_call,
                         max_turns=100):
    """에러 복구를 갖춘 에이전트 루프."""
    max_tokens = 4096
    retries = 0

    for turn in range(max_turns):
        shaped = pre_model_shapers(messages, tools)

        try:
            response = await llm_call(
                shaped, tools=tools, max_tokens=max_tokens,
            )
        except PromptTooLongError:
            # 전략 2: reactive compaction
            messages = await compact(messages, llm_call)
            continue
        except StreamingError:
            # 전략 4: 스트리밍 fallback
            response = await llm_call(
                shaped, tools=tools, max_tokens=max_tokens,
                stream=False,
            )

        if response.truncated and retries < 3:
            # 전략 1: output token escalation
            max_tokens = min(max_tokens * 2, 128_000)
            retries += 1
            continue
        retries = 0

        if not response.tool_calls:
            return response.text

        for call in response.tool_calls:
            result = await tools[call.name](**call.args)
            messages.append(tool_result(call.id, result))

    return "최대 턴 수 도달"
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 프로덕션 필수 사항</strong><br>
  에러 복구는 선택이 아닙니다. 50턴 이상의 긴 세션에서는 output token 부족, 컨텍스트 초과, 네트워크 오류 중 하나 이상이 거의 반드시 발생합니다. 프로덕션 에이전트를 구축한다면, 최소한 output escalation과 reactive compaction은 구현해야 합니다.
</div>

Codex의 에러 복구는 아키텍처 자체에 내장되어 있습니다. 매 턴이 독립적인 HTTP 요청이므로, 실패한 요청을 단순히 재전송할 수 있습니다. 컨테이너 수준의 문제는 새 컨테이너를 띄워서 해결합니다. Claude Code처럼 루프 내부에 정교한 복구 전략을 구현할 필요가 적은 셈입니다. 이것이 "상태 없는" 아키텍처의 이점 중 하나입니다.

---

## 프로덕션 비교: 루프 아키텍처

지금까지 살펴본 내용을 비교표로 정리합니다.

| 관점 | Claude Code | Codex |
|------|-------------|-------|
| 루프 구조 | AsyncGenerator (상태 유지) | HTTP POST + SSE (상태 재구성) |
| 상태 관리 | 메모리 내 messages 배열 | 클라이언트 측 히스토리 재구성 |
| 전처리 | 5단계 Pre-model Shapers (매 턴) | 없음 (API 서비스에 위임) |
| 도구 실행 | StreamingToolExecutor (concurrent-safe 병렬, exclusive 순차) | 로컬 실행 (OS 샌드박스 내) |
| 퍼미션 | 7-mode deny-first 파이프라인 | OS 네이티브 샌드박스 (Seatbelt/bwrap) |
| 에러 복구 | 4가지 전략 (escalation, compaction, fallback 등) | 요청 재전송 |
| 컴팩션 | 애플리케이션 레벨, 투명한 5단계 파이프라인 | API 레벨, 불투명 암호화 blob |
| 캐시 전략 | 내부 최적화 | 프롬프트 프리픽스 캐싱 |

여기서 두 가지 패턴이 보입니다.

첫째, **복잡도가 배치되는 레이어가 다릅니다**. Claude Code는 하네스 코드에 복잡도를 집중시킵니다. 5단계 shapers, 7-mode permissions, 4가지 error strategies가 모두 클라이언트 애플리케이션 안에 있습니다. Codex CLI는 복잡도를 API 서비스(`/responses`, `/responses/compact`)와 OS 네이티브 샌드박스에 위임합니다.

둘째, **이벤트 스트림의 설계가 다릅니다**.

| 이벤트 유형 | Claude Code | Codex |
|------------|-------------|-------|
| 응답 시작 | `RequestStartEvent` | SSE `response.created` |
| 텍스트 청크 | `StreamEvent` | SSE `response.text.delta` |
| 도구 호출 | `tool_use` block | SSE `response.function_call` |
| 압축 마커 | `TombstoneMessage` | 없음 (blob으로 대체) |

Claude Code의 `TombstoneMessage`는 컴팩션으로 제거된 메시지의 자리를 표시합니다. "여기에 뭔가 있었지만 압축되었다"는 표지판인 셈입니다. Codex는 blob이 히스토리 전체를 대체하므로 이런 표시가 필요 없습니다.

---

## 직접 구현: 에러 복구를 갖춘 에이전트 루프

[이전 글](/agent/context-engineering/)에서 `ContextManager`와 기본 `agent_loop`을 구현했습니다. 이번에는 이 글에서 살펴본 루프 인프라를 추가합니다. safe/exclusive 도구 분류, output token escalation, reactive compaction을 갖춘 확장 버전입니다.

```python
import asyncio


async def production_loop(
    task: str,
    tools: dict,
    llm_call,
    max_turns: int = 100,
):
    """에러 복구와 도구 동시성을 갖춘 에이전트 루프."""
    ctx = ContextManager()  # Post 4에서 구현
    ctx.messages.append({"role": "user", "content": task})
    max_tokens = 4096
    retries = 0

    concurrent_safe = {"Read", "Grep", "Glob", "LSP"}

    for turn in range(max_turns):
        # Stage 1-2: 컨텍스트 조립 + 전처리
        if ctx.should_compact():
            await ctx.compact(llm_call)
        prompt = ctx.build_prompt()

        # Stage 3: 모델 호출 (에러 복구 포함)
        try:
            response = await llm_call(
                prompt, tools=list(tools.keys()),
                max_tokens=max_tokens,
            )
        except PromptTooLongError:
            await ctx.compact(llm_call)
            continue

        if response.truncated and retries < 3:
            max_tokens = min(max_tokens * 2, 128_000)
            retries += 1
            continue
        retries = 0

        # Stage 6: 판단
        if not response.tool_calls:
            return response.text

        # Stage 4: 도구 실행 (concurrent-safe 병렬, exclusive 순차)
        safe_calls = [c for c in response.tool_calls
                      if c.name in concurrent_safe]
        exclusive_calls = [c for c in response.tool_calls
                          if c.name not in concurrent_safe]

        results = []
        if safe_calls:
            safe_results = await asyncio.gather(
                *[tools[c.name](**c.args) for c in safe_calls]
            )
            results.extend(zip(safe_calls, safe_results))

        for call in exclusive_calls:
            result = await tools[call.name](**call.args)
            results.append((call, result))

        # Stage 5: 누적
        for call, result in results:
            ctx.messages.append({
                "role": "tool",
                "tool_use_id": call.id,
                "content": str(result),
            })

    return "최대 턴 수 도달"
```

이 코드는 Post 4의 `agent_loop`과 비교하면 세 가지가 추가되었습니다.

| 추가 요소 | 코드 위치 | 대응하는 프로덕션 구현 |
|-----------|-----------|----------------------|
| output token escalation | `response.truncated` 분기 | Claude Code `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT` |
| reactive compaction | `PromptTooLongError` 처리 | Claude Code `REACTIVE_COMPACT` 플래그 |
| concurrent-safe/exclusive 분류 | `safe_calls` / `exclusive_calls` | Claude Code `StreamingToolExecutor` |

물론 프로덕션 구현과의 차이는 큽니다. Claude Code의 `StreamingToolExecutor`는 스트리밍 응답에서 도구 호출이 나오는 즉시 실행을 시작하지만, 이 코드는 응답이 완료된 후 실행합니다. 7개 continue site의 whole-object assignment도 포함되어 있지 않습니다. 하지만 핵심 아이디어는 동일합니다. 에이전트 루프를 프로덕션에서 쓰려면 기본 while 루프 위에 에러 복구와 실행 최적화 레이어가 필요하다는 것입니다.

---

## 한계와 열린 문제

이 글에서 다루지 못한 깊이가 있습니다. Budget Reduction이 Snip과 어떻게 다른지, Context Collapse가 어떤 조건에서 발동되는지, Codex의 암호화 blob이 실제로 무엇을 보존하는지는 [다음 글](/agent/compaction-pipeline/)에서 다룹니다. 퍼미션 시스템의 deny-first 의미론과 ML 분류기의 위험도 판단 기준은 [퍼미션 글](/agent/agent-permission-safety/)에서 다룹니다. 이벤트 스트림 아키텍처가 제공하는 관찰성(observability), 즉 어떤 도구 호출이 어느 정도의 컨텍스트 증가를 일으켰는지, 실패한 턴을 재현할 수 있는지는 아직 열린 엔지니어링 문제입니다.

---

## 마치며

[첫 번째 글](/agent/what-is-ai-agent/)에서 "AI가 판단하는 로직은 1.6%에 불과하다"고 했을 때, 그 숫자는 추상적인 통계에 불과했습니다. 이제 6단계 파이프라인을 따라가 보면, 왜 1.6%인지가 구체적으로 보입니다. 모델이 관여하는 Stage 3을 제외한 나머지(컨텍스트 조립, 전처리, 도구 실행, 에러 복구, 상태 관리)가 루프의 실체이고, 이 인프라 없이는 에이전트가 프로덕션에서 동작할 수 없습니다.

다음 글에서는 이 루프의 Stage 2에 해당하는 전처리 파이프라인을 깊이 들어갑니다. Claude Code의 5단계 컴팩션(Budget Reduction부터 Auto-Compact까지)이 어떤 순서로, 어떤 기준으로 실행되는지, 그리고 Codex의 암호화 blob이 실제로 무엇을 보존하는지 살펴보겠습니다.

## 참고자료

- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Unrolling the Codex Agent Loop (OpenAI)](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [How the Agent Loop Works (Claude Code Docs)](https://docs.anthropic.com/en/docs/claude-code/agent-loop)
