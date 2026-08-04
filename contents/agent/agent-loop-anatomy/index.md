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

에이전트에게 주어진 토큰 윈도우는 유한하고, 그 컨텍스트가 실제로 조립되고 소비되고 정리되는 기계 장치가 바로 에이전트 루프입니다. 루프의 골격 자체는 "모델을 부르고, 도구를 실행하고, 결과를 붙여 다시 부른다"는 열 줄 남짓의 while 문에 불과합니다. 복잡한 것은 그 주변에 붙은 인프라입니다. 이제 그 인프라의 뚜껑을 열어보겠습니다.

---

## 루프의 두 가지 아키텍처

Claude Code의 루프를 한 줄로 요약하면 AsyncGenerator while-loop이고, Codex의 루프는 Responses API 기반 재쿼리 루프입니다. 이것은 단순한 구현 취향의 차이가 아니라, 근본적으로 다른 아키텍처 철학입니다.

### 상태 유지 vs 상태 재구성

두 에이전트는 같은 문제(루프 반복)를 정반대 방식으로 풉니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 398" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="위쪽은 Claude Code의 상태 유지 구조로 queryLoop 안에 messages 배열이 계속 살아 있고, 아래쪽은 Codex의 상태 재구성 구조로 매 턴 전체 히스토리를 다시 만들어 Responses API로 보냅니다">
<style>
.al1-h{fill:var(--text,#1c1917);font-size:22px;font-weight:700}
.al1-t{fill:var(--text,#1c1917);font-size:20px}
.al1-s{fill:var(--text-muted, #6d6762);font-size:17px}
.al1-k{fill:var(--primary, #0a756c);font-size:20px;font-weight:600}
.al1-a{fill:var(--accent, #9d5604);font-size:20px;font-weight:600}
.al1-box{fill:var(--bg-subtle,#f5f4f2);stroke:var(--border,#e7e5e4);stroke-width:1.5}
.al1-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.6;fill:none}
</style>
<defs>
<marker id="al1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<!-- 위: Claude Code -->
<text x="24" y="26" class="al1-h">Claude Code · 상태 유지</text>
<rect x="24" y="42" width="392" height="140" rx="8" class="al1-box"/>
<text x="44" y="74" class="al1-k">queryLoop() · AsyncGenerator</text>
<text x="44" y="106" class="al1-t">messages = [...] 메모리에 누적</text>
<text x="44" y="136" class="al1-t">yield event 로 이벤트를 흘려보냄</text>
<text x="44" y="166" class="al1-s">루프가 살아 있는 동안 상태도 살아 있음</text>
<!-- 상태 유지 회귀 화살표 -->
<path d="M416 76 H448 V160 H416" class="al1-ln" marker-end="url(#al1Arrow)"/>
<!-- 아래: Codex -->
<text x="24" y="226" class="al1-h">Codex · 상태 재구성</text>
<rect x="24" y="242" width="392" height="140" rx="8" class="al1-box"/>
<text x="44" y="274" class="al1-a">while True:</text>
<text x="44" y="306" class="al1-t">history = rebuild(전체 히스토리)</text>
<text x="44" y="336" class="al1-t">POST /responses → SSE stream 수신</text>
<text x="44" y="366" class="al1-s">append results · if done: break</text>
<!-- 매 턴 재구성 화살표 -->
<path d="M416 276 H448 V360 H416" class="al1-ln" marker-end="url(#al1Arrow)"/>
</svg>
</div>

**Claude Code**는 `queryLoop()`이라는 AsyncGenerator 함수가 전체 세션을 관장합니다. 대화 히스토리는 메모리 내 `messages` 배열에 누적되고, 루프가 돌 때마다 이 배열을 직접 참조합니다. 상태가 프로세스 안에 살아있으므로, 루프 중간에 전처리를 끼워넣거나 에러 복구를 수행하기 쉽습니다.

**Codex**는 매 턴마다 새로운 HTTP POST 요청을 Responses API에 보냅니다. 서버 측에 대화 상태가 남지 않으므로, 클라이언트가 전체 히스토리를 직접 재구성해서 보내야 합니다. Responses API는 `previous_response_id`라는 서버 측 상태 연결 기능을 제공하지만, Codex는 이것을 **의도적으로 사용하지 않습니다**.

:::info

**Zero Data Retention**

OpenAI 블로그의 원문에 따르면, Codex가 `previous_response_id`를 쓰지 않는 이유는 "to keep requests fully stateless and support Zero Data Retention (ZDR) configurations"입니다. 요청의 stateless 유지와 ZDR 지원이 병렬적인 두 가지 이유이며, 그 결과 매 턴마다 클라이언트가 전체 히스토리를 직접 보내야 합니다.

:::

흥미로운 점은 두 도구 모두 개발자의 로컬 머신에서 실행되는 CLI라는 것입니다. 같은 배포 환경임에도 상태 관리 방식이 정반대인 이유는, 설계 철학의 차이에서 비롯됩니다. Claude Code는 하네스 코드에 복잡한 인프라(전처리, 퍼미션, 에러 복구)를 내장하기 위해 상태를 프로세스 안에 유지합니다. Codex CLI는 요청을 stateless하게 유지하고 복잡도를 API 서비스에 위임하는 방식을 선택한 것입니다.

---

## Claude Code의 한 턴: 6단계 파이프라인

Claude Code에서 한 턴이 처리되는 과정을 추적해 보겠습니다. Claude Code의 아키텍처를 역공학 분석한 논문(arXiv 2604.14228, "Dive into Claude Code")은 `queryLoop()`의 내부를 9개의 순차적 단계로 분석하는데, 이 글에서는 독자의 이해를 위해 핵심 흐름을 6단계로 단순화하여 살펴봅니다.

### 전체 흐름

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 612" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="한 턴의 6단계 파이프라인. 컨텍스트 조립, 전처리, 모델 호출, 도구 실행, 결과 누적, 판단 순으로 진행되며 도구 호출이 남아 있으면 1단계로 되돌아갑니다. 모델이 관여하는 단계는 3단계 하나뿐입니다">
<style>
.al2-h{fill:var(--text,#1c1917);font-size:22px;font-weight:700}
.al2-n{fill:var(--text,#1c1917);font-size:21px;font-weight:600}
.al2-d{fill:var(--text-muted, #6d6762);font-size:17px}
.al2-s{fill:var(--text-muted, #6d6762);font-size:18px}
.al2-box{fill:var(--bg-subtle,#f5f4f2);stroke:var(--border,#e7e5e4);stroke-width:1.5}
.al2-ai{fill:var(--bg-muted,#eeecea);stroke:var(--primary, #0a756c);stroke-width:2}
.al2-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.6;fill:none}
.al2-tag{fill:var(--primary, #0a756c);font-size:17px;font-weight:700}
</style>
<defs>
<marker id="al2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<text x="20" y="26" class="al2-h">한 턴의 6단계 파이프라인</text>
<!-- 1 -->
<rect x="20" y="44" width="392" height="88" rx="8" class="al2-box"/>
<text x="36" y="76" class="al2-n">1. Context Assembly</text>
<text x="36" y="102" class="al2-d">시스템 프롬프트 + 도구 정의</text>
<text x="36" y="124" class="al2-d">+ 메시지 히스토리 조립</text>
<path d="M216 132 V150" class="al2-ln" marker-end="url(#al2Arrow)"/>
<!-- 2 -->
<rect x="20" y="150" width="392" height="88" rx="8" class="al2-box"/>
<text x="36" y="182" class="al2-n">2. Pre-model Shapers</text>
<text x="36" y="208" class="al2-d">5단계 전처리 (Budget Reduction, Snip,</text>
<text x="36" y="230" class="al2-d">Microcompact, Context Collapse …)</text>
<path d="M216 238 V256" class="al2-ln" marker-end="url(#al2Arrow)"/>
<!-- 3 (모델이 관여하는 유일한 단계) -->
<rect x="20" y="256" width="392" height="66" rx="8" class="al2-ai"/>
<text x="36" y="288" class="al2-n">3. Model Call</text>
<text x="36" y="314" class="al2-d">API 호출 → SSE 스트리밍 응답 수신</text>
<text x="336" y="288" class="al2-tag">AI 관여</text>
<path d="M216 322 V340" class="al2-ln" marker-end="url(#al2Arrow)"/>
<!-- 4 -->
<rect x="20" y="340" width="392" height="88" rx="8" class="al2-box"/>
<text x="36" y="372" class="al2-n">4. Tool Execution</text>
<text x="36" y="398" class="al2-d">퍼미션 체크 → concurrent-safe /</text>
<text x="36" y="420" class="al2-d">exclusive 분류 → 실행</text>
<path d="M216 428 V446" class="al2-ln" marker-end="url(#al2Arrow)"/>
<!-- 5 -->
<rect x="20" y="446" width="392" height="66" rx="8" class="al2-box"/>
<text x="36" y="478" class="al2-n">5. Accumulate</text>
<text x="36" y="504" class="al2-d">도구 결과를 messages 배열에 추가</text>
<path d="M216 512 V530" class="al2-ln" marker-end="url(#al2Arrow)"/>
<!-- 6 -->
<rect x="20" y="530" width="392" height="66" rx="8" class="al2-box"/>
<text x="36" y="562" class="al2-n">6. Decide</text>
<text x="36" y="588" class="al2-d">도구 호출이 있으면 1단계로, 없으면 종료</text>
<!-- 되돌아가는 화살표 -->
<path d="M412 562 H448 V76 H412" class="al2-ln" marker-end="url(#al2Arrow)"/>
</svg>
</div>

Claude Code를 역공학 분석한 arXiv 논문은 하네스 코드에서 AI가 실제로 판단하는 로직이 전체의 1.6%에 불과하다고 보고합니다. 이것은 코드량 기준 수치입니다. 단계 구성으로 봐도 방향은 같습니다. AI가 관여하는 단계는 Stage 3(Model Call) 하나뿐이고, 나머지 5단계는 전부 결정론적 인프라입니다.

### Stage 1-2: 컨텍스트 조립과 전처리

Stage 1에서는 모델에게 보낼 프롬프트를 조립합니다. 시스템 프롬프트, `assembleToolPool()`이 그 턴에 필요한 도구만 골라 만든 도구 스키마, 필요한 시점에 읽어 들이는 CLAUDE.md 계층 구조, 그리고 지금까지 누적된 메시지 히스토리가 합쳐집니다.

Stage 2에서는 이 조립된 컨텍스트에 5단계 전처리 파이프라인이 적용됩니다. 컨텍스트를 줄이고 다듬는 이 5단계를 arXiv 논문은 **Pre-model Shapers**라는 이름으로 분석합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 464" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="Pre-model Shapers 5단계. 누적된 messages 배열이 Budget Reduction, Snip, Microcompact, Context Collapse, Auto-Compact를 차례로 거쳐 정제된 shaped_messages 배열이 됩니다">
<style>
.al3-h{fill:var(--text,#1c1917);font-size:22px;font-weight:700}
.al3-n{fill:var(--text,#1c1917);font-size:21px;font-weight:600}
.al3-i{fill:var(--primary, #0a756c);font-size:21px;font-weight:600}
.al3-num{fill:var(--text-muted, #6d6762);font-size:17px}
.al3-box{fill:var(--bg-subtle,#f5f4f2);stroke:var(--border,#e7e5e4);stroke-width:1.5}
.al3-pill{fill:var(--bg-muted,#eeecea);stroke:var(--primary, #0a756c);stroke-width:1.5}
.al3-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.6;fill:none}
</style>
<defs>
<marker id="al3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<text x="20" y="26" class="al3-h">Pre-model Shapers (5단계)</text>
<!-- 입력 -->
<rect x="112" y="44" width="256" height="44" rx="22" class="al3-pill"/>
<text x="240" y="73" class="al3-i" text-anchor="middle">messages[]</text>
<path d="M240 88 V104" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 1 -->
<rect x="80" y="104" width="320" height="44" rx="8" class="al3-box"/>
<text x="96" y="133" class="al3-num">1</text>
<text x="120" y="133" class="al3-n">Budget Reduction</text>
<path d="M240 148 V164" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 2 -->
<rect x="80" y="164" width="320" height="44" rx="8" class="al3-box"/>
<text x="96" y="193" class="al3-num">2</text>
<text x="120" y="193" class="al3-n">Snip</text>
<path d="M240 208 V224" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 3 -->
<rect x="80" y="224" width="320" height="44" rx="8" class="al3-box"/>
<text x="96" y="253" class="al3-num">3</text>
<text x="120" y="253" class="al3-n">Microcompact</text>
<path d="M240 268 V284" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 4 -->
<rect x="80" y="284" width="320" height="44" rx="8" class="al3-box"/>
<text x="96" y="313" class="al3-num">4</text>
<text x="120" y="313" class="al3-n">Context Collapse</text>
<path d="M240 328 V344" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 5 -->
<rect x="80" y="344" width="320" height="44" rx="8" class="al3-box"/>
<text x="96" y="373" class="al3-num">5</text>
<text x="120" y="373" class="al3-n">Auto-Compact</text>
<path d="M240 388 V404" class="al3-ln" marker-end="url(#al3Arrow)"/>
<!-- 출력 -->
<rect x="112" y="404" width="256" height="44" rx="22" class="al3-pill"/>
<text x="240" y="433" class="al3-i" text-anchor="middle">shaped_messages[]</text>
</svg>
</div>

여기서 중요한 것은 이 전처리가 **매 턴마다** 실행된다는 점입니다. 컨텍스트가 가득 찼을 때만 작동하는 비상 장치가 아니라, 매 턴 모델 호출 전에 컨텍스트를 정리하는 정기적 유지보수에 가깝습니다.

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

여러 도구 호출을 한꺼번에 흘려보내는 Parallelization 패턴이 실제로 작동하는 위치가 바로 이 Stage 4입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 492" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="스트리밍으로 도착한 도구 호출이 두 갈래로 나뉩니다. Read와 Grep 같은 concurrent-safe 도구는 동시에 실행되고, Bash 같은 exclusive 도구는 퍼미션 체크를 거쳐 순차적으로 실행된 뒤 결과가 messages 배열에 쌓입니다">
<style>
.al4-h{fill:var(--text,#1c1917);font-size:21px;font-weight:700}
.al4-t{fill:var(--text,#1c1917);font-size:20px}
.al4-s{fill:var(--text-muted, #6d6762);font-size:17px}
.al4-ok{fill:var(--text-success, #107836);font-size:20px;font-weight:700}
.al4-ex{fill:var(--text-warn, #9d5604);font-size:20px;font-weight:700}
.al4-pill{fill:var(--bg-muted,#eeecea);stroke:var(--border,#e7e5e4);stroke-width:1.5}
.al4-pa{fill:var(--bg-success,#f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.5}
.al4-pb{fill:var(--bg-warn,#fffbeb);stroke:var(--text-warn, #9d5604);stroke-width:1.5}
.al4-in{fill:var(--bg,#fafaf8);stroke:var(--border,#e7e5e4);stroke-width:1.2}
.al4-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.6;fill:none}
</style>
<defs>
<marker id="al4Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<!-- 입력: 모델 응답 -->
<rect x="100" y="16" width="280" height="44" rx="22" class="al4-pill"/>
<text x="240" y="45" class="al4-h" text-anchor="middle">모델 응답 (스트리밍)</text>
<path d="M240 60 V78" class="al4-ln" marker-end="url(#al4Arrow)"/>
<!-- 갈래 1: concurrent-safe -->
<rect x="20" y="78" width="440" height="184" rx="10" class="al4-pa"/>
<text x="38" y="110" class="al4-ok">concurrent-safe · 동시 실행</text>
<rect x="38" y="124" width="160" height="42" rx="8" class="al4-in"/>
<text x="52" y="152" class="al4-t">Read(file_a)</text>
<rect x="208" y="124" width="172" height="42" rx="8" class="al4-in"/>
<text x="222" y="152" class="al4-t">Grep(pattern)</text>
<rect x="38" y="174" width="160" height="42" rx="8" class="al4-in"/>
<text x="52" y="202" class="al4-t">Read(file_b)</text>
<text x="38" y="244" class="al4-s">읽기 전용 · 상호 충돌 없음</text>
<path d="M240 262 V280" class="al4-ln" marker-end="url(#al4Arrow)"/>
<!-- 갈래 2: exclusive -->
<rect x="20" y="280" width="440" height="132" rx="10" class="al4-pb"/>
<text x="38" y="312" class="al4-ex">exclusive · 순차 실행</text>
<rect x="38" y="326" width="190" height="42" rx="8" class="al4-in"/>
<text x="52" y="354" class="al4-t">Bash(npm test)</text>
<text x="244" y="354" class="al4-s">퍼미션 체크 후 실행</text>
<text x="38" y="392" class="al4-s">상태 변경 · 한 번에 하나씩</text>
<path d="M240 412 V430" class="al4-ln" marker-end="url(#al4Arrow)"/>
<!-- 결과 누적 -->
<rect x="76" y="430" width="328" height="44" rx="22" class="al4-pill"/>
<text x="240" y="459" class="al4-h" text-anchor="middle">결과 → messages[]에 추가</text>
</svg>
</div>

도구는 두 범주로 분류됩니다. `Read`, `Grep` 같은 읽기 전용 도구는 **concurrent-safe**(동시 실행 가능)로, `Bash`, `Edit`, `Write` 같은 상태 변경 도구는 **exclusive**로 분류됩니다. concurrent-safe 도구는 동시에 실행되고, exclusive 도구는 순차적으로 실행됩니다. 같은 파일을 읽는 것은 안전하지만, 동시에 수정하면 충돌이 발생하기 때문입니다.

퍼미션 체크도 이 단계에서 일어납니다. 논문에서 퍼미션 게이트는 독립적인 단계로 분리되어 있을 만큼 중요한 아키텍처 요소입니다. Claude Code는 7가지 퍼미션 모드를 정의하는데, 사용자에게 노출되는 5개(plan, default, acceptEdits, dontAsk, bypassPermissions)와 feature-gated인 `auto`(ML 분류기 기반), 서브에이전트 전용인 `bubble`(상위로 에스컬레이션)이 있습니다.

한 가지 중요한 설계 결정이 있습니다. 사용자가 도구 실행을 거부(deny)하면, 루프가 중단되는 것이 아니라 거부 결과가 모델에게 **라우팅 시그널**로 전달됩니다. 모델은 이 시그널을 보고 다른 접근법을 시도할 수 있습니다.

### Stage 5-6: 누적과 판단

도구 실행이 완료되면 결과가 `messages` 배열에 추가됩니다(Stage 5). 50턴짜리 세션이면 도구 결과만으로 250,000 토큰에 달하는데, 그 토큰이 축적되는 곳이 바로 이 Stage 5입니다.

Stage 6의 판단 로직 자체는 단순합니다. 어시스턴트 메시지에 도구 호출이 포함되어 있으면 Stage 1로 돌아가고, 텍스트만 있으면 루프를 종료합니다. Anthropic의 "Building Effective Agents" 가이드가 설명하는 기본 루프 패턴의 종료 조건 그대로입니다.

하지만 실제 구현에는 한 가지 핵심적인 설계 요소가 있습니다. arXiv 논문은 `queryLoop()` 안에 **7개의 continue site**를 식별합니다. continue site란 루프가 다시 시작할 수 있는 지점으로, 상태를 점진적으로 변경(mutate)하지 않고 **통째로 교체(whole-object assignment)**하는 방식으로 관리됩니다.

:::tip

**왜 whole-object assignment인가**

상태를 점진적으로 변경하면 중간 상태가 오염될 위험이 있습니다. 에러 복구 시 "어디까지 변경되었는가"를 추적해야 하기 때문입니다. 대신 상태를 통째로 교체하면, 각 continue site가 일종의 체크포인트 역할을 합니다. 에러가 발생하면 마지막 체크포인트의 상태로 깨끗하게 복귀할 수 있습니다.

:::

---

## Codex의 한 턴: 상태 없는 재구성

Claude Code의 "상태 유지" 아키텍처를 살펴봤으니, 이제 Codex의 "상태 재구성" 아키텍처를 봅니다.

### HTTP POST + SSE 루프

Codex의 한 턴은 다음과 같이 처리됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 648" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="Codex의 Turn N 처리 과정. 클라이언트가 developer 메시지부터 이전 턴 도구 결과까지 전체 히스토리를 다시 만들어 Responses API에 POST하고, SSE 스트림으로 응답을 받아 샌드박스에서 도구를 실행한 뒤 다시 히스토리를 재구성합니다">
<style>
.al5-h{fill:var(--text,#1c1917);font-size:22px;font-weight:700}
.al5-n{fill:var(--text,#1c1917);font-size:21px;font-weight:600}
.al5-t{fill:var(--text,#1c1917);font-size:20px}
.al5-s{fill:var(--text-muted, #6d6762);font-size:17px}
.al5-i{fill:var(--primary, #0a756c);font-size:21px;font-weight:600}
.al5-box{fill:var(--bg-subtle,#f5f4f2);stroke:var(--border,#e7e5e4);stroke-width:1.5}
.al5-api{fill:var(--bg-muted,#eeecea);stroke:var(--primary, #0a756c);stroke-width:2}
.al5-row{fill:var(--bg,#fafaf8);stroke:var(--border,#e7e5e4);stroke-width:1.2}
.al5-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.6;fill:none}
</style>
<defs>
<marker id="al5Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<text x="20" y="26" class="al5-h">Turn N의 처리 과정</text>
<!-- 클라이언트: 히스토리 재구성 -->
<rect x="20" y="44" width="392" height="306" rx="10" class="al5-box"/>
<text x="38" y="76" class="al5-n">Client</text>
<text x="38" y="102" class="al5-t">history = rebuild_all()</text>
<rect x="38" y="114" width="356" height="34" rx="6" class="al5-row"/>
<text x="52" y="137" class="al5-t">developer_msg</text>
<rect x="38" y="154" width="356" height="34" rx="6" class="al5-row"/>
<text x="52" y="177" class="al5-t">config.toml</text>
<rect x="38" y="194" width="356" height="34" rx="6" class="al5-row"/>
<text x="52" y="217" class="al5-t">skill_files</text>
<rect x="38" y="234" width="356" height="34" rx="6" class="al5-row"/>
<text x="52" y="257" class="al5-t">environment</text>
<rect x="38" y="274" width="356" height="34" rx="6" class="al5-row"/>
<text x="52" y="297" class="al5-t">user_msg</text>
<text x="38" y="334" class="al5-s">+ tool_results(turn 1 … N-1) 전체</text>
<!-- 요청 -->
<path d="M216 350 V392" class="al5-ln" marker-end="url(#al5Arrow)"/>
<text x="228" y="378" class="al5-s">POST /v1/responses</text>
<!-- API -->
<rect x="106" y="392" width="220" height="48" rx="10" class="al5-api"/>
<text x="128" y="422" class="al5-i">Responses API</text>
<!-- 응답 -->
<path d="M216 440 V482" class="al5-ln" marker-end="url(#al5Arrow)"/>
<text x="228" y="468" class="al5-s">SSE stream</text>
<!-- 클라이언트: 도구 실행 -->
<rect x="20" y="482" width="392" height="112" rx="10" class="al5-box"/>
<text x="38" y="514" class="al5-t">parse tool_calls</text>
<text x="38" y="546" class="al5-t">execute in sandbox</text>
<text x="38" y="578" class="al5-t">append results to history</text>
<!-- 다음 턴으로 되돌아가는 화살표 -->
<path d="M412 538 H448 V70 H412" class="al5-ln" marker-end="url(#al5Arrow)"/>
<text x="20" y="628" class="al5-s">tool_calls 없으면 종료 · 있으면 Turn N+1 재구성</text>
</svg>
</div>

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

매 턴마다 전체 히스토리를 보내면 Turn N에서 보내는 총 토큰은 N에 비례하고, N턴에 걸쳐 누적된 전송량은 O(n^2)에 비례합니다. Codex는 **프롬프트 캐싱**으로 이 이차 비용을 줄입니다.

핵심 원리는 단순합니다. 이전 요청과 새 요청의 처음 K개 토큰이 동일하면, 서버는 캐시된 결과를 재사용하고 새로운 토큰만 처리하는 구조입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 380" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="턴이 진행될수록 캐시 적중 구간이 길어지는 프롬프트 캐싱. Turn 1은 정적 프리픽스만 재사용하고 user_msg가 새 토큰이며, Turn 2와 Turn 3은 직전 턴의 프롬프트 전체가 캐시 프리픽스가 되고 새로 붙은 도구 결과만 새 토큰입니다">
<style>
.al6-h{fill:var(--text,#1c1917);font-size:21px;font-weight:700}
.al6-turn{fill:var(--text,#1c1917);font-size:20px;font-weight:600}
.al6-s{fill:var(--text-muted, #6d6762);font-size:17px}
.al6-c{fill:var(--primary, #0a756c);font-size:17px;font-weight:600}
.al6-w{fill:var(--accent, #9d5604);font-size:17px;font-weight:600}
.al6-cb{fill:var(--bg-muted,#eeecea);stroke:var(--primary, #0a756c);stroke-width:1.5}
.al6-wb{fill:var(--bg-warn,#fffbeb);stroke:var(--accent, #9d5604);stroke-width:1.5}
</style>
<text x="20" y="26" class="al6-h">턴이 쌓일수록 길어지는 캐시 프리픽스</text>
<!-- 범례 -->
<rect x="20" y="40" width="18" height="18" rx="4" class="al6-cb"/>
<text x="46" y="55" class="al6-c">캐시 적중 (재사용)</text>
<rect x="212" y="40" width="18" height="18" rx="4" class="al6-wb"/>
<text x="238" y="55" class="al6-w">신규 토큰</text>
<!-- Turn 1 -->
<text x="20" y="92" class="al6-turn">Turn 1</text>
<rect x="20" y="102" width="150" height="38" rx="6" class="al6-cb"/>
<text x="30" y="127" class="al6-c">정적 프리픽스</text>
<rect x="174" y="102" width="100" height="38" rx="6" class="al6-wb"/>
<text x="186" y="127" class="al6-w">user_msg</text>
<!-- Turn 2 -->
<text x="20" y="180" class="al6-turn">Turn 2</text>
<rect x="20" y="190" width="240" height="38" rx="6" class="al6-cb"/>
<text x="30" y="215" class="al6-c">정적 프리픽스 + user_msg</text>
<rect x="264" y="190" width="100" height="38" rx="6" class="al6-wb"/>
<text x="276" y="215" class="al6-w">result_1</text>
<!-- Turn 3 -->
<text x="20" y="268" class="al6-turn">Turn 3</text>
<rect x="20" y="278" width="340" height="38" rx="6" class="al6-cb"/>
<text x="30" y="303" class="al6-c">정적 프리픽스 + user_msg + result_1</text>
<rect x="364" y="278" width="100" height="38" rx="6" class="al6-wb"/>
<text x="376" y="303" class="al6-w">result_2</text>
<text x="20" y="342" class="al6-s">정적 프리픽스 = developer message ·</text>
<text x="20" y="366" class="al6-s">config.toml · skill files · environment</text>
</svg>
</div>

이 전략이 작동하려면 **정적 콘텐츠가 프롬프트 앞쪽에** 있어야 합니다. developer message, config, skill files 같은 변하지 않는 요소가 앞에 오고, 매 턴 달라지는 도구 결과가 뒤에 와야 캐시 프리픽스가 최대한 길어집니다. 도구 재정렬, 설정 변경, 샌드박스 변경 등은 이 프리픽스를 깨뜨리므로 캐시 효율이 떨어집니다.

컨텍스트가 너무 길어지면 `/responses/compact` 엔드포인트가 등장합니다. 이 엔드포인트는 대화 히스토리를 압축한 암호화된 불투명 blob을 반환하는데, 클라이언트는 내용을 읽을 수 없지만 다음 요청의 프리픽스로 보내면 서버가 이를 복원하는 방식입니다. Claude Code의 투명한 컴팩션(모델이 직접 요약)과 대조적으로, Codex의 컴팩션은 API 서비스에 위임된 불투명한 처리인 셈입니다.

### 샌드박스 격리

Claude Code가 도구별 퍼미션으로 안전성을 확보한다면, Codex CLI는 **OS 네이티브 샌드박스**로 접근합니다.

Codex CLI도 개발자의 로컬 머신에서 실행되지만, 퍼미션 시스템 대신 OS 수준의 격리를 사용합니다. macOS에서는 Seatbelt 정책(`sandbox-exec`), Linux에서는 `bwrap` + `seccomp`로 프로세스를 격리합니다. 기본 정책은 네트워크 접근 차단, 파일 쓰기를 작업 디렉터리로 제한하는 것입니다.

참고로 Codex에는 별도의 **클라우드 버전**(Codex Cloud)도 있는데, 이쪽은 일회용 클라우드 컨테이너에서 실행되며 네트워크가 기본적으로 차단된 "two-phase runtime model"을 사용합니다. 이 글에서 비교하는 Codex는 Claude Code와 동일하게 로컬에서 실행되는 **Codex CLI**입니다.

:::info

**같은 문제, 다른 해법**

두 도구 모두 개발자의 로컬 머신에서 실행되지만, 안전성 확보 방식이 다릅니다. Claude Code는 도구별로 세분화된 퍼미션 파이프라인(7-mode, deny-first)을 운영합니다. Codex CLI는 OS 네이티브 샌드박스로 프로세스 자체를 격리합니다. 전자는 "이 도구를 허용할까?"를, 후자는 "이 프로세스가 뭘 할 수 있을까?"를 제어하는 것입니다.

:::

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

:::warning

**프로덕션 필수 사항**

에러 복구는 선택이 아닙니다. 50턴 이상의 긴 세션에서는 output token 부족, 컨텍스트 초과, 네트워크 오류 중 하나 이상이 거의 반드시 발생합니다. 프로덕션 에이전트를 구축한다면, 최소한 output escalation과 reactive compaction은 구현해야 합니다.

:::

Codex의 에러 복구는 아키텍처 자체에 내장되어 있습니다. 매 턴이 독립적인 HTTP 요청이므로, 실패한 요청을 단순히 재전송할 수 있습니다. Claude Code처럼 루프 내부에 정교한 복구 전략을 구현할 필요가 적은 셈입니다. 이것이 "상태 없는" 아키텍처의 이점 중 하나입니다.

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
| 텍스트 청크 | `StreamEvent` | SSE `response.output_text.delta` |
| 도구 호출 | `tool_use` block | SSE `response.function_call_arguments.delta` |
| 압축 마커 | `TombstoneMessage` | 없음 (blob으로 대체) |

Claude Code의 `TombstoneMessage`는 컴팩션으로 제거된 메시지의 자리를 표시합니다. "여기에 뭔가 있었지만 압축되었다"는 표지판인 셈입니다. Codex는 blob이 히스토리 전체를 대체하므로 이런 표시가 필요 없습니다.

---

## 직접 구현: 에러 복구를 갖춘 에이전트 루프

지금까지 살펴본 루프 인프라를 코드로 옮겨 봅니다. 컨텍스트 누적과 컴팩션을 담당하는 `ContextManager`가 이미 있다고 보고, 그 위에 safe/exclusive 도구 분류, output token escalation, reactive compaction을 얹은 버전입니다.

```python
import asyncio


async def production_loop(
    task: str,
    tools: dict,
    llm_call,
    max_turns: int = 100,
):
    """에러 복구와 도구 동시성을 갖춘 에이전트 루프."""
    ctx = ContextManager()  # 컨텍스트 누적과 컴팩션 담당
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

모델을 부르고 도구를 실행하는 기본 while 루프와 비교하면 세 가지가 추가되었습니다.

| 추가 요소 | 코드 위치 | 대응하는 프로덕션 구현 |
|-----------|-----------|----------------------|
| output token escalation | `response.truncated` 분기 | Claude Code `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT` |
| reactive compaction | `PromptTooLongError` 처리 | Claude Code `REACTIVE_COMPACT` 플래그 |
| concurrent-safe/exclusive 분류 | `safe_calls` / `exclusive_calls` | Claude Code `StreamingToolExecutor` |

물론 프로덕션 구현과의 차이는 큽니다. Claude Code의 `StreamingToolExecutor`는 스트리밍 응답에서 도구 호출이 나오는 즉시 실행을 시작하지만, 이 코드는 응답이 완료된 후 실행합니다. 7개 continue site의 whole-object assignment도 포함되어 있지 않습니다. 하지만 핵심 아이디어는 동일합니다. 에이전트 루프를 프로덕션에서 쓰려면 기본 while 루프 위에 에러 복구와 실행 최적화 레이어가 필요하다는 것입니다.

---

## 한계와 열린 문제

이 글에서 다루지 못한 깊이가 있습니다. Budget Reduction이 Snip과 어떻게 다른지, Context Collapse가 어떤 조건에서 발동되는지, Codex의 암호화 blob이 실제로 무엇을 보존하는지는 컴팩션 파이프라인 자체를 해부해야 답할 수 있는 질문입니다. 퍼미션 시스템의 deny-first 의미론과 ML 분류기의 위험도 판단 기준도 이 글의 범위를 넘어섭니다. 이벤트 스트림 아키텍처가 제공하는 관찰성(observability), 즉 어떤 도구 호출이 어느 정도의 컨텍스트 증가를 일으켰는지, 실패한 턴을 재현할 수 있는지는 아직 열린 엔지니어링 문제입니다.

---

## 마치며

"AI가 판단하는 로직은 1.6%에 불과하다"는 말은 숫자만 놓고 보면 추상적인 통계입니다. 하지만 6단계 파이프라인을 따라가 보면 왜 1.6%인지가 구체적으로 보입니다. 모델이 관여하는 Stage 3을 제외한 나머지(컨텍스트 조립, 전처리, 도구 실행, 에러 복구, 상태 관리)가 루프의 실체이고, 이 인프라 없이는 에이전트가 프로덕션에서 동작할 수 없습니다.

다음 글에서는 이 루프의 Stage 2에 해당하는 전처리 파이프라인을 깊이 들어갑니다. Claude Code의 5단계 컴팩션(Budget Reduction부터 Auto-Compact까지)이 어떤 순서로, 어떤 기준으로 실행되는지 살펴보겠습니다.

## 함께 보면 좋은 글

- [AI Agent의 구조: 모델, 도구, 루프가 만드는 자율적 시스템](/agent/what-is-ai-agent/)
- [AI Agent 워크플로우 패턴: 단순한 Chaining에서 동적 Orchestration까지](/agent/agent-workflow-patterns/)
- [AI Agent의 컨텍스트 엔지니어링: 유한한 토큰 윈도우를 다루는 네 가지 전략](/agent/context-engineering/)
- [AI Agent의 컴팩션 파이프라인: 200K 토큰 윈도우를 지키는 다섯 단계](/agent/compaction-pipeline/)
- [AI Agent의 퍼미션 시스템: 도구 실행 전에 일어나는 일곱 단계의 판단](/agent/agent-permission-safety/)

## 참고자료

- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Unrolling the Codex Agent Loop (OpenAI)](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
