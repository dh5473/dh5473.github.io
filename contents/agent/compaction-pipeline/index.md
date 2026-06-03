---
date: '2026-06-03'
title: 'AI Agent의 컴팩션 파이프라인: 200K 토큰 윈도우를 지키는 다섯 단계'
category: 'AI Agent'
series: 'agent'
seriesOrder: 6
tags: ['Compaction', 'AI Agent', 'Claude Code', 'Codex', 'Pre-model Shapers']
summary: 'Claude Code의 5단계 Pre-model Shapers 파이프라인을 해부합니다. Budget Reduction, Snip, Microcompact, Context Collapse, Auto-Compact 각 단계의 트리거 조건과 실행 메커니즘, 그리고 Codex 암호화 blob의 내부 구조를 살펴봅니다.'
thumbnail: './thumbnail.png'
---

Claude Code를 사용하다 보면 대화 중간에 `[Compacted conversation...]` 메시지가 나타나는 순간이 있습니다. 이때 컨텍스트의 상당 부분이 사라졌지만, 에이전트는 아무 지장 없이 작업을 계속합니다. 그런데 가끔, 초반에 합의한 네이밍 규칙을 잊어버리거나, 이미 수정한 파일을 다시 수정하는 일이 발생합니다. 무엇이 보존되고 무엇이 버려지는지를 결정하는 것이 바로 컴팩션 파이프라인입니다.

[이전 글](/agent/agent-loop-anatomy/)에서 이 파이프라인이 `queryLoop()`의 Stage 2, 즉 Pre-model Shapers에 해당한다는 것을 확인했습니다. 매 턴 모델 호출 전에 5단계가 순차 실행된다는 것도 확인했습니다. 하지만 각 단계가 정확히 무엇을 하는지는 다루지 않았습니다. 이 글에서 그 내부를 해부합니다.

---

## 왜 다단계인가: 비용 대비 압축의 계단

컨텍스트가 커졌을 때 가장 확실한 해법은 LLM에게 전체 대화를 요약하게 하는 것입니다. 하지만 이 방법은 비싸고 느립니다. 요약 자체가 모델 호출이므로 토큰 비용과 지연이 발생하고, 요약 과정에서 세부 정보가 손실됩니다. 매 턴마다 이 비용을 지불할 필요는 없습니다.

Claude Code의 Pre-model Shapers는 이 문제를 **"가장 저렴한 필터부터"** 원칙으로 해결합니다. arXiv 논문([Dive into Claude Code](https://arxiv.org/abs/2604.14228))에 따르면, 각 레이어는 서로 다른 비용-편익 trade-off에서 작동하며, 앞쪽의 저렴한 레이어가 뒤쪽의 비싼 레이어보다 먼저 실행됩니다. 저렴한 단계로 충분하면 비싼 단계는 건너뜁니다.

이 구조는 Python의 세대별 가비지 컬렉션과 닮았습니다. Gen 0(짧은 수명 객체)은 자주 수집하고, Gen 2(오래 살아남은 객체)는 드물게 수집합니다. 매번 전체 힙을 스캔하지 않는 것처럼, 매 턴 전체 대화를 LLM으로 요약하지 않습니다.

```
비용/지연
  ▲
  │                                              ┌──────────┐
  │                                              │ Auto-    │
  │                                   ┌─────┐   │ Compact  │
  │                                   │Cntxt│   │ (LLM     │
  │                        ┌───────┐  │Colla│   │  요약)   │
  │            ┌─────┐     │Micro- │  │-pse │   │          │
  │ ┌───────┐  │     │     │compact│  │     │   │          │
  │ │Budget │  │Snip │     │(LLM   │  │(읽기│   │          │
  │ │Reduct.│  │(삭제)│     │ 압축) │  │ 투영)│   │          │
  │ │(산술) │  │     │     │       │  │     │   │          │
  └─┴───────┴──┴─────┴─────┴───────┴──┴─────┴───┴──────────┴──►
    Stage 1    Stage 2     Stage 3    Stage 4    Stage 5
    ~0ms       ~0ms        LLM 호출   ~0ms       LLM 호출
```

5단계의 전체 구조를 먼저 정리합니다.

| 단계 | 작동 원리 | LLM 호출 | 정보 손실 | 실행 시점 |
|------|----------|---------|----------|----------|
| Budget Reduction | 초과 출력을 참조로 교체 | 없음 | 없음 (복원 가능) | 매 턴 |
| Snip | 오래된 히스토리 구간 제거 | 없음 | 중간 | 매 턴 |
| Microcompact | 개별 메시지를 LLM으로 압축 | 메시지당 1회 | 중간 | 매 턴 (메시지별 조건) |
| Context Collapse | 대화 구간을 읽기 시점 투영 | 없음 | 모델 시점에서 높음 (원본 보존) | 임계값 초과 시 |
| Auto-Compact | 전체 대화를 LLM으로 요약 | 1회 | 영구적 (지능적 보존) | 임계값 초과 시 |

"매 턴 실행"이 Yes인 단계도 실제로 작업이 필요한 경우에만 비용이 발생합니다. Budget Reduction은 초과 출력이 없으면 아무것도 하지 않고, Snip은 제거할 메시지가 없으면 건너뜁니다.

---

## Stage 1: Budget Reduction

Budget Reduction은 **개별 도구 결과의 크기를 제한**하는 단계입니다. 이름이 "Budget"이지만, 전체 컨텍스트 예산을 계산하는 것이 아니라 도구 반환값 하나하나에 대해 크기 상한을 적용합니다.

arXiv 논문에 따르면, `applyToolResultBudget()` 함수가 이 역할을 담당합니다. 각 도구에는 `maxResultSizeChars`라는 설정이 있고, 이 한도를 초과하는 출력은 **콘텐츠 참조(content reference)**로 교체됩니다. 원본을 삭제하는 것이 아니라, "이 도구는 N 토큰의 결과를 반환했지만 생략됨"이라는 포인터로 바꾸는 것입니다.

```python
def budget_reduction(messages, tool_configs):
    """Budget Reduction: 초과 도구 결과를 참조로 교체한다."""
    for msg in messages:
        if msg.role != "tool":
            continue
        config = tool_configs.get(msg.tool_name, {})
        max_chars = config.get("max_result_size_chars", 25_000)

        if max_chars == float("inf"):
            continue  # 면제 도구: 전체 출력 유지

        if len(msg.content) > max_chars:
            original_tokens = estimate_tokens(msg.content)
            msg.content = (
                f"[도구 결과 생략: {msg.tool_name}, "
                f"원본 {original_tokens} 토큰]"
            )
            msg.metadata["content_ref"] = True  # 복원용 마커
    return messages
```

핵심 특성이 두 가지 있습니다.

첫째, **면제 도구가 존재합니다.** `maxResultSizeChars`가 무한대(`inf`)로 설정된 도구는 아무리 커도 원본이 유지됩니다. 예를 들어, 코드 실행 결과처럼 전체 내용이 중요한 도구는 면제 대상일 수 있습니다.

둘째, **복원이 가능합니다.** 논문은 "콘텐츠 교체가 에이전트 및 세션 쿼리 소스에 대해 영속화되어 재개(resume) 시 복원을 가능하게 한다"고 설명합니다. 즉, Budget Reduction은 정보를 삭제하는 것이 아니라 참조로 대체하는 것입니다. 뒤에서 다룰 Context Collapse도 원본을 보존하는 가역적 단계이며, 이 둘은 파이프라인에서 정보가 영구적으로 사라지지 않는 단계입니다.

---

## Stage 2: Snip

Snip은 **오래된 히스토리 구간을 통째로 제거**하는 단계입니다. Budget Reduction이 개별 메시지의 크기를 다뤘다면, Snip은 메시지 자체의 존재 여부를 다룹니다.

arXiv 논문은 Snip을 "오래된 히스토리 구간을 제거하는 가벼운 트림(lightweight trim)"이라고 설명합니다. 실행 결과로 `{messages, tokensFreed, boundaryMessage}`를 반환합니다. `tokensFreed`는 실제로 확보된 토큰 수이고, `boundaryMessage`는 "여기부터 잘렸다"는 경계를 표시합니다.

```python
def snip(messages, pressure_threshold=0.85, model_window=200_000):
    """Snip: 오래된 히스토리 구간을 제거한다."""
    total = estimate_tokens(messages)
    if total <= model_window * pressure_threshold:
        return messages, 0, None

    tokens_freed = 0
    boundary = None
    target = total - int(model_window * pressure_threshold)

    for i, msg in enumerate(messages):
        if msg.role == "system":
            continue  # 시스템 프롬프트는 보존
        if tokens_freed >= target:
            break
        tokens_freed += estimate_tokens(msg.content)
        boundary = i
        msg.mark_as_snipped()

    snipped = [m for m in messages if not m.is_snipped]
    return snipped, tokens_freed, boundary
```

Snip에는 주목할 기술적 디테일이 하나 있습니다. `snipTokensFreed` 값이 Auto-Compact 단계까지 명시적으로 전달된다는 점입니다. 왜냐하면 메인 토큰 카운터는 가장 최근 어시스턴트 메시지의 `usage.input_tokens` 필드에서 컨텍스트 크기를 추정하는데, 이 메시지는 Snip 이후에도 살아남아 **Snip 이전의 토큰 수를 그대로 보고합니다.** Snip의 절약 효과가 카운터에 보이지 않는 것입니다. 이를 보정하기 위해 `tokensFreed`를 명시적으로 전달합니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">

💡 **Budget Reduction과 Snip의 핵심 차이**

Budget Reduction은 **개별 메시지 내부**를 다듬습니다. 하나의 도구 결과가 너무 크면 참조로 교체합니다. Snip은 **메시지 자체**를 제거합니다. 대화 초반의 오래된 메시지들을 통째로 잘라냅니다. 비유하면, Budget Reduction은 서류 한 장의 분량을 줄이는 것이고, Snip은 오래된 서류를 파일 캐비닛에서 빼는 것입니다.

</div>

Snip은 `HISTORY_SNIP` 플래그로 제어됩니다. 이 플래그가 비활성화되면 Snip 단계는 건너뛰고, 나머지 4단계만 실행됩니다.

---

## Stage 3: Microcompact

Microcompact는 **개별 메시지를 LLM으로 압축**하는 단계입니다. Snip이 오래된 메시지를 통째로 버린다면, Microcompact는 비교적 최근 메시지 중 지나치게 큰 것을 요약해서 크기를 줄입니다.

예를 들어, `Bash(npm test)`의 결과가 8,000 토큰이라면, 실패한 테스트 이름과 에러 메시지만 남기고 나머지(통과한 테스트 출력, 진행 로그)를 제거합니다.

```
[Microcompact 전]
  Read(config.yaml)  →  4,200 토큰 (전체 파일 내용)
  Bash(npm test)     →  8,500 토큰 (전체 테스트 출력)
  Read(src/app.ts)   →    900 토큰 (임계값 이하, 건너뜀)

[Microcompact 후]
  Read(config.yaml)  →    800 토큰 (핵심 설정값만 보존)
  Bash(npm test)     →  1,200 토큰 (실패 테스트 + 에러만 보존)
  Read(src/app.ts)   →    900 토큰 (변경 없음)
```

논문에 따르면 Microcompact는 두 가지 경로로 실행됩니다. **시간 기반 경로**(항상 실행)와 **캐시 인식 경로**(`CACHED_MICROCOMPACT` 플래그로 제어)입니다. 캐시 인식 경로는 API 응답에서 반환된 실제 `cache_deleted_input_tokens` 값을 사용하여 더 정확한 압축 판단을 내립니다. 이 경우 boundary 메시지 처리가 API 응답 이후로 지연됩니다.

```python
async def microcompact(messages, llm_call,
                       per_message_threshold=3_000):
    """Microcompact: 큰 개별 메시지를 LLM으로 압축한다."""
    for msg in messages:
        if msg.role != "tool":
            continue
        if not msg.tool_use_id:
            continue  # tool_use_id로 대상 식별
        if msg.is_snipped or msg.is_content_ref:
            continue  # 이미 처리된 메시지는 건너뜀
        if estimate_tokens(msg.content) <= per_message_threshold:
            continue

        compressed = await llm_call(
            f"다음 도구 결과를 핵심 정보만 보존하여 압축하라. "
            f"에러, 수치, 파일 경로를 반드시 유지하라.\n\n"
            f"도구: {msg.tool_name}\n"
            f"결과:\n{msg.content}"
        )
        msg.content = f"[microcompacted] {compressed}"
    return messages
```

중요한 특성 하나: Microcompact는 **`tool_use_id`로 메시지를 식별하며, 콘텐츠 자체를 검사하지 않습니다.** 이 덕분에 Budget Reduction이 먼저 실행되어도 충돌이 없습니다. Budget Reduction은 콘텐츠를 참조로 교체하고, Microcompact는 ID로 대상을 찾으므로 두 단계가 깔끔하게 합성(compose)됩니다.

지금까지 세 단계를 비교합니다.

| 속성 | Budget Reduction | Snip | Microcompact |
|------|-----------------|------|-------------|
| 대상 | 개별 도구 결과 (크기 초과) | 오래된 히스토리 구간 | 개별 큰 메시지 (최근 포함) |
| 방법 | 참조로 교체 | 삭제 | LLM 요약 |
| LLM 호출 | 없음 | 없음 | 메시지당 1회 |
| 정보 손실 | 없음 (복원 가능) | 전체 메시지 | 세부 내용 |
| 비용 | ~0 | ~0 | 토큰 비용 발생 |
| 식별 방식 | 콘텐츠 크기 | 메시지 위치 (시간순) | tool_use_id |

---

## Stage 4: Context Collapse

Context Collapse는 앞선 세 단계로도 컨텍스트가 충분히 줄어들지 않았을 때 발동되는 **대량 삭제 단계**입니다. [이전 글](/agent/agent-loop-anatomy/)에서 에러 복구 전략 중 "prompt-too-long 처리"가 Context Collapse를 호출한다고 언급했는데, 그것이 바로 이 단계입니다.

그런데 Context Collapse에는 다른 단계와 구별되는 독특한 설계가 있습니다. **원본 히스토리를 변경하지 않습니다.**

arXiv 논문은 이를 "읽기 시점 투영(read-time projection)"이라고 설명합니다. Snip이 메시지를 실제로 삭제하는 반면, Context Collapse는 REPL의 전체 히스토리를 그대로 두고, 모델에게 보내는 시점에만 압축된 뷰를 생성합니다. `applyCollapsesIfNeeded()` 함수가 `messagesForQuery` 배열을 투영된 버전으로 교체하여, "모델은 압축된 버전을 보지만 전체 히스토리는 복원을 위해 그대로 남아 있습니다."

요약 메시지는 collapse store라는 별도 저장소에 보관됩니다. REPL 배열이 아닌 별도 공간에 존재하기 때문에, 이 투영은 턴을 넘어서 지속됩니다.

```python
def context_collapse(messages, collapse_store, keep_recent=5):
    """Context Collapse: 읽기 시점 투영으로 대화를 압축한다."""
    if len(messages) <= keep_recent + 1:
        return messages  # 압축할 만큼 히스토리가 없음

    system = [m for m in messages if m.role == "system"]
    old = [m for m in messages if m.role != "system"][:-keep_recent]
    recent = [m for m in messages if m.role != "system"][-keep_recent:]

    # 요약을 collapse store에 저장 (REPL 배열 밖)
    summary_marker = SystemMessage(
        f"[Context Collapse: {len(old)}개 메시지가 압축됨. "
        f"이전 대화의 핵심 결정과 수정 파일 목록은 유지됨.]"
    )
    collapse_store.append(summary_marker)

    # 투영된 뷰 반환 (원본 messages는 변경되지 않음)
    projected = system + [summary_marker] + recent
    return projected
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">

⚠️ **Context Collapse는 비상 수단입니다**

Budget Reduction, Snip, Microcompact가 충분히 작동했다면 Context Collapse는 발동되지 않습니다. 이 단계가 자주 실행된다면, 개별 도구 반환값이 너무 크거나 세션이 지나치게 길다는 신호입니다. [이전 글](/agent/agent-loop-anatomy/)에서 본 reactive compaction과의 관계: reactive compaction은 API가 `PromptTooLongError`를 반환한 후 턴당 최대 1회 발동되는 비상 장치이고, Context Collapse는 Pre-model Shapers 파이프라인 안에서 모델 호출 전에 사전 예방적으로 실행되는 단계입니다. 둘 다 대규모 컨텍스트 축소라는 점에서 비슷하지만, 발동 시점이 다릅니다.

</div>

Context Collapse는 `CONTEXT_COLLAPSE` 플래그로 제어됩니다.

---

## Stage 5: Auto-Compact

Auto-Compact는 파이프라인의 마지막 단계이자 **가장 비싼 단계**입니다. 앞선 네 단계가 모두 실행된 뒤에도 컨텍스트가 압력 임계값을 초과할 때만 발동됩니다. 논문의 표현대로 "이전 네 단계를 모두 거친 후에도 컨텍스트가 압력 임계값을 초과할 때만 발동됩니다."

Auto-Compact의 동작은 세 단계로 이루어집니다.

1. **PreCompact 훅 실행**: 컴팩션 직전에 외부 훅을 실행합니다. 사용자 정의 로직(예: 중요 정보를 파일에 백업)이 이 시점에 개입할 수 있습니다.
2. **컴팩션 프롬프트 생성**: `getCompactPrompt()` 함수가 전체 대화 히스토리와 함께 요약 지시를 구성합니다.
3. **모델 호출과 메시지 재구성**: LLM이 요약을 생성하면, `buildPostCompactMessages()`가 원본 히스토리를 이 요약으로 교체합니다.

[이전 글의 컨텍스트 엔지니어링](/agent/context-engineering/)에서 다룬 컴팩션의 핵심 trade-off가 바로 이 단계에 집중됩니다. Anthropic은 컴팩션 프롬프트를 "복잡한 에이전트 트레이스에서 튜닝하되, 먼저 재현율(recall)을 최대화한 뒤 정밀도를 높이라"고 권장합니다. 보존해야 할 것을 빠뜨리는 것(recall 실패)이, 불필요한 것을 남기는 것(precision 실패)보다 더 치명적이기 때문입니다.

```python
async def auto_compact(messages, llm_call, compact_prompt_fn):
    """Auto-Compact: 전체 대화를 LLM으로 요약한다."""
    # 1. PreCompact 훅
    await run_hooks("pre_compact", messages)

    # 2. 컴팩션 프롬프트 생성
    prompt = compact_prompt_fn(messages)
    # 프롬프트에는 보존 대상이 명시됨:
    #   아키텍처 결정, 미해결 버그, 수정 파일 경로,
    #   현재 계획, 사용자 선호사항

    # 3. 모델 호출 → 메시지 재구성
    summary = await llm_call(prompt)
    compacted = build_post_compact_messages(
        system_prompt=messages.system_prompt,
        summary=summary,
    )
    return compacted
```

Auto-Compact가 [네 번째 글](/agent/context-engineering/)의 `ContextManager.compact()` 코드와 다른 점은 무엇일까요? 그 코드는 "임계값 초과 → LLM 요약"이라는 단순한 2단계였습니다. 실제 Auto-Compact는 4단계의 사전 처리를 거친 후에야 도달하는 최후의 수단이며, PreCompact 훅과 구조화된 컴팩션 프롬프트(`getCompactPrompt()`)를 통해 훨씬 정교한 보존 전략을 적용합니다.

5단계는 항상 순서대로 실행되지만, Stage 4-5는 앞선 단계의 결과에 따라 실제 작업을 건너뛸 수 있습니다.

```
파이프라인 실행 흐름

messages[] ──► [1] Budget ──► [2] Snip ──► [3] Microcompact
               Reduction                         │
                                                  ▼
                                          총 토큰 확인
                                           /         \
                                     충분히 줄었음    여전히 초과
                                      (종료)          │
                                                 [4] Context
                                                  Collapse
                                                      │
                                                 총 토큰 재확인
                                                  /         \
                                            충분히 줄었음    여전히 초과
                                             (종료)          │
                                                        [5] Auto-
                                                         Compact
```

실제 임계값은 모델의 윈도우 크기(200K 또는 1M)에 따라 달라지며, 구체적인 수치는 Claude Code 내부 설정에 의해 결정됩니다.

---

## Codex의 암호화 blob: 불투명한 압축의 내부

지금까지 Claude Code의 5단계 파이프라인을 해부했습니다. 이 파이프라인은 전체가 클라이언트(하네스)에서 실행되며, 개발자가 각 단계의 결과를 확인할 수 있습니다. Codex CLI는 근본적으로 다른 접근을 취합니다. 컴팩션을 **서버에 위임**합니다. [이전 글들](/agent/context-engineering/)에서 이 차이를 "투명 vs 불투명"이라고 비교했는데, 이제 불투명한 쪽의 내부를 살펴봅니다.

### 진화 과정

OpenAI 블로그([Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/))에 따르면, Codex의 컴팩션은 세 단계를 거쳐 진화했습니다.

1. **수동 `/compact` 명령**: 초기에는 사용자가 직접 `/compact`를 입력해야 했습니다. 기존 대화에 요약용 커스텀 지시를 덧붙여 Responses API에 보내는 방식이었습니다.
2. **`/responses/compact` 엔드포인트**: API가 전용 컴팩션 엔드포인트를 지원하면서, 컴팩션이 더 효율적으로 처리되기 시작했습니다.
3. **자동 컴팩션**: `auto_compact_limit` 임계값을 초과하면 자동으로 컴팩션이 실행됩니다.

### blob의 내부

`/responses/compact` 엔드포인트는 압축된 대화를 **항목 리스트**로 반환합니다. 이 리스트에는 `type=compaction`인 특수 항목이 포함되며, 그 안에 `encrypted_content`라는 불투명한 데이터가 담깁니다. OpenAI 블로그의 원문을 인용하면:

> "This list includes a special type=compaction item with an opaque encrypted_content item that preserves **the model's latent understanding** of the original conversation."

"모델의 잠재적 이해(latent understanding)"라는 표현이 핵심입니다. Claude Code의 Auto-Compact가 사람이 읽을 수 있는 텍스트 요약을 생성하는 반면, Codex의 blob은 모델의 내부 표현에 가까운 정보를 암호화된 형태로 보존합니다. 클라이언트는 이 blob의 내용을 열람하거나 수정할 수 없습니다.

```
[Codex 클라이언트]                        [Responses API]
     │                                         │
     │  history (150K 토큰)                    │
     │─── POST /responses/compact ───────────►│
     │                                         │  서버 측 압축
     │                                         │  (잠재적 이해 보존)
     │◄── items: [{type: "compaction",  ───────│
     │         encrypted_content: "..."}]      │
     │                                         │
     │  [compaction item + new_user_msg]       │
     │─── POST /responses ───────────────────►│
     │                                         │  blob을 프리픽스로 복원
     │◄── SSE response ───────────────────────│
```

### blob 이후의 복구

blob이 "잠재적 이해"를 보존한다고 해서 모든 정보가 완벽하게 유지되는 것은 아닙니다. 특히 파일 내용의 세부사항은 blob 안에 온전히 남아 있지 않을 수 있습니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">

✅ **컴팩션 후 복구 전략**

blob이 "잠재적 이해"를 보존하더라도 파일 내용의 세부사항까지 완벽하게 유지하기는 어렵습니다. 이를 보완하기 위해, 에이전트는 컴팩션 후 최근 작업 파일을 다시 읽어 컨텍스트에 주입하는 복구 전략을 사용할 수 있습니다. Claude Code의 Auto-Compact도 유사한 접근을 취합니다. 컴팩션 프롬프트가 "수정한 파일 경로"를 보존 대상으로 명시하여, 컴팩션 후에도 에이전트가 핵심 파일을 다시 찾을 수 있게 합니다.

</div>

### 캐시와의 상호작용

[이전 글](/agent/agent-loop-anatomy/)에서 Codex가 프롬프트 캐싱을 위해 "정적 요소를 앞에, 가변 요소를 뒤에" 배치한다고 설명했습니다. 컴팩션 후 blob이 새로운 프리픽스 역할을 하므로, 후속 요청에서 이 blob이 캐시 적중의 기반이 됩니다. 컴팩션이 캐시를 무효화하는 것이 아니라, 새로운 캐시 기반을 생성하는 것입니다.

두 시스템의 컴팩션 메커니즘을 내부 관점에서 비교합니다.

| 관점 | Claude Code (5단계) | Codex (암호화 blob) |
|------|--------------------|--------------------|
| 압축 실행 위치 | 클라이언트 (하네스) | 서버 (API) |
| 단계 수 | 5단계 순차 (저렴한 것부터) | 단일 API 호출 |
| 결과 형식 | 사람이 읽을 수 있는 텍스트 | 암호화된 불투명 blob |
| 보존 방식 | 명시적 (프롬프트로 보존 대상 지정) | 암묵적 (잠재적 이해) |
| 개발자 제어 | 높음 (프롬프트 수정, 훅 개입 가능) | 낮음 (blob 내용 열람 불가) |
| 정보 손실 진단 | 요약 텍스트를 직접 확인 가능 | 손실 원인 진단 불가 |
| 압축 후 복구 | 컴팩션 프롬프트에 복구 지시 포함 | blob 복원 + 클라이언트 측 보완 가능 |
| 캐시 연속성 | 새로운 컨텍스트로 시작 | blob이 새 캐시 프리픽스 |

---

## 직접 구현: 5단계 컴팩션 파이프라인

각 단계의 코드를 살펴봤으니, 이를 하나의 파이프라인으로 통합합니다. [네 번째 글](/agent/context-engineering/)의 `ContextManager.compact()`는 "임계값 초과 시 LLM 요약"이라는 단순한 구조였고, [다섯 번째 글](/agent/agent-loop-anatomy/)의 `production_loop()`는 에러 복구를 추가했습니다. 이번에는 Stage 2의 실체인 Pre-model Shapers를 구현합니다.

```python
async def pre_model_shapers(messages, tool_configs, llm_call,
                            model_window=200_000):
    """
    5단계 Pre-model Shapers 파이프라인.
    가장 저렴한 필터부터 실행하여, 비싼 단계를 최소화한다.
    """
    collapse_store = []

    # Stage 1: Budget Reduction (비용: ~0, 손실: 없음)
    messages = budget_reduction(messages, tool_configs)

    # Stage 2: Snip (비용: ~0, 손실: 중간)
    messages, tokens_freed, boundary = snip(
        messages,
        pressure_threshold=0.85,
        model_window=model_window,
    )
    if tokens_freed > 0:
        print(f"  [Snip] {tokens_freed} 토큰 확보")

    # Stage 3: Microcompact (비용: LLM 호출, 손실: 중간)
    messages = await microcompact(
        messages, llm_call, per_message_threshold=3_000
    )

    # Stage 4: Context Collapse (비용: ~0, 손실: 모델 시점에서 높음)
    total = estimate_tokens(messages)
    if total > model_window * 0.85:
        print(f"  [Context Collapse] {total} > "
              f"{int(model_window * 0.85)} 압력 임계값 초과")
        messages = context_collapse(
            messages, collapse_store, keep_recent=5
        )

    # Stage 5: Auto-Compact (비용: LLM 호출, 손실: 중간)
    total = estimate_tokens(messages)
    if total > model_window * 0.85:
        print(f"  [Auto-Compact] 이전 단계로도 부족, "
              f"LLM 요약 실행")
        messages = await auto_compact(
            messages, llm_call, compact_prompt_fn=get_compact_prompt
        )

    return messages
```

이 코드가 실제 프로덕션과 다른 점을 정리합니다.

| 이 코드 | 프로덕션 (Claude Code) |
|---------|---------------------|
| 각 단계가 독립 함수 | `query.ts` 내부에서 단일 파이프라인으로 통합 |
| 고정 임계값 (0.85) | 모델/컨텍스트 크기에 따라 동적 조정 |
| `estimate_tokens()` 추정 | API의 `usage.input_tokens` 실측값 활용 |
| Context Collapse가 요약 마커만 삽입 | read-time projection으로 원본 보존 |
| Microcompact 단일 경로 | 시간 기반 + 캐시 인식 이중 경로 |
| 플래그 없음 | `HISTORY_SNIP`, `CACHED_MICROCOMPACT`, `CONTEXT_COLLAPSE` 등 피처 플래그로 개별 제어 |

[다섯 번째 글](/agent/agent-loop-anatomy/)에서 6단계 파이프라인의 Stage 2를 "Pre-model Shapers"라는 이름으로 소개하고 상세는 다음 글로 미뤘습니다. 이 `pre_model_shapers()` 함수가 그 Stage 2의 실체입니다. 하나의 while 루프(에이전트 루프) 안에서 매 턴 이 파이프라인이 실행되고, 그 결과가 Stage 3(모델 호출)으로 전달됩니다.

---

## 한계와 열린 문제

### 컴팩션 프롬프트의 민감성

Auto-Compact의 품질은 컴팩션 프롬프트에 전적으로 의존합니다. "아키텍처 결정을 보존하라"라는 지시에서 "아키텍처"의 범위를 모델이 어떻게 해석하느냐에 따라 보존되는 정보가 달라집니다. 프롬프트의 미세한 변경이 컴팩션 품질에 큰 영향을 줄 수 있으며, 이 영향을 사전에 예측하기 어렵습니다.

### 임계값 튜닝

이 글의 코드 예제에서 사용한 0.85 같은 임계값은 설명을 위한 예시이며, 실제 Claude Code의 내부 수치는 공개되어 있지 않습니다. 이론적 최적값은 존재하지 않고, 작업의 복잡도, 도구 반환값의 크기, 모델의 윈도우 크기에 따라 달라집니다. Claude Code는 200K 윈도우에서 1M 윈도우로 전환되면서 이 임계값들을 재조정해야 했을 것입니다. 더 큰 윈도우가 컴팩션의 필요성을 줄이지만 제거하지는 않습니다.

### blob 불투명성의 양면

Codex의 암호화 blob은 "잠재적 이해"를 보존한다는 장점이 있지만, 컴팩션 후 정보 손실이 발생했을 때 원인을 진단할 수 없다는 근본적 한계가 있습니다. Claude Code에서는 요약 텍스트를 직접 읽어서 "이 부분이 빠졌다"고 확인할 수 있지만, Codex에서는 그것이 불가능합니다.

| 열린 문제 | 이 글에서 확인한 것 | 아직 다루지 않은 것 | 다룰 글 |
|-----------|-------------------|-------------------|--------|
| 퍼미션 시스템 | 컴팩션이 도구 실행 전에 위치 | deny-first 의미론, ML 분류기 | 후속 글 |
| 관찰성 | TombstoneMessage, collapse store | 턴별 비용 귀속, 실패 재현 | 후속 글 |
| 컴팩션 평가 | recall-first 튜닝 원칙 | 컴팩션 품질 자동 측정 | 후속 글 |

---

## 마치며

[이전 글](/agent/agent-loop-anatomy/)에서 `queryLoop()`의 6단계 파이프라인 중 Stage 2를 "Pre-model Shapers"라는 이름으로 확인했습니다. 이 글에서 그 Stage 2가 자체적으로 5단계 파이프라인임을 보았습니다. 인프라 안의 인프라입니다.

5단계의 설계 원칙은 단순합니다. 비용이 적은 필터부터 실행하여, 비싼 필터를 가능한 한 건너뜁니다. Budget Reduction(참조 교체)과 Snip(구간 삭제)으로 충분하면, Microcompact(LLM 압축)나 Auto-Compact(LLM 요약)는 실행되지 않습니다. 이 "가장 저렴한 필터부터" 원칙은 가비지 컬렉션의 세대별 수집, 캐시의 다단계 계층, 네트워크의 QoS 큐와 동일한 엔지니어링 패턴입니다. 비싼 작업을 뒤로 미루는 것이 시스템 전체의 효율을 높입니다.

후속 글에서는 에이전트가 도구를 실행하기 전에 어떤 기준으로 권한을 판단하는지, 즉 퍼미션 시스템의 내부를 살펴봅니다.

## 참고자료

- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Unrolling the Codex Agent Loop (OpenAI)](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [How the Agent Loop Works (Claude Code Docs)](https://docs.anthropic.com/en/docs/claude-code/agent-loop)
