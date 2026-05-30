---
date: '2026-05-28'
title: 'AI Agent 워크플로우 패턴: 단순한 Chaining에서 동적 Orchestration까지'
category: 'AI Agent'
series: 'agent'
seriesOrder: 2
tags: ['AI Agent', 'Workflow Pattern', 'Prompt Chaining', 'Orchestrator-Workers', 'Claude Code']
summary: 'Anthropic이 제시한 다섯 가지 워크플로우 패턴의 구조와 구현. Prompt Chaining, Routing, Parallelization, Orchestrator-Workers, Evaluator-Optimizer를 프로덕션 에이전트의 실제 사례와 Python 코드로 살펴봅니다.'
thumbnail: './thumbnail.png'
---

Claude Code에 "이 모듈을 세 개의 파일로 리팩터링해줘"라고 요청하면, 단순히 코드를 생성하는 것이 아닙니다. 먼저 모듈의 의존성 구조를 분석하고, 어떤 파일들로 나눌지 계획을 세웁니다. 그 다음 각 파일을 순차적으로 생성하면서, 파일 하나를 만들 때마다 기존 import가 깨지지 않았는지 확인합니다. 코드베이스가 크면 서브에이전트에게 파일 분석을 위임하기도 합니다.

하나의 요청이 여러 패턴을 넘나들며 처리되는 것입니다. 이전 글에서 Anthropic의 다섯 가지 워크플로우 패턴을 표 하나로 요약했는데, 이 글에서는 각 패턴의 내부 구조를 뜯어보겠습니다. 어떤 상황에서 어떤 패턴을 선택해야 하는지, 프로덕션 에이전트는 실제로 이것을 어떻게 구현했는지, 그리고 순수 Python으로 각 패턴의 핵심을 직접 만들어 봅니다.

---

## 패턴을 고르는 기준

다섯 가지 패턴을 살펴보기 전에, 하나의 원칙을 먼저 짚겠습니다. Anthropic은 "Building Effective Agents"에서 이렇게 말합니다.

> "단순한 프롬프트에서 시작하고, 포괄적인 평가로 최적화하고, 더 단순한 솔루션이 부족할 때만 멀티스텝 에이전트 시스템을 추가하라."

OpenAI도 같은 입장입니다. "A Practical Guide to Building Agents"에서 "단일 에이전트의 역량을 먼저 최대한 끌어올려라. 여러 에이전트는 그 다음이다"라고 권장합니다. 두 회사가 독립적으로 같은 결론에 도달한 것은, 이 원칙이 실전에서 검증되었다는 뜻입니다.

다섯 가지 패턴은 복잡도 순서로 나열됩니다. 아래쪽으로 갈수록 강력하지만, 비용과 디버깅 난이도도 함께 올라갑니다.

```
Single LLM call (optimized prompt)
     |
     | not enough?
     v
Prompt Chaining ---- fixed sequential steps
     |
     | input varies?
     v
Routing ------------ classify + branch
     |
     | need speed?
     v
Parallelization ---- concurrent subtasks
     |
     | subtasks unknown?
     v
Orchestrator-Workers  dynamic decomposition
     |
     | need iterative refinement?
     v
Evaluator-Optimizer - generate + critique loop
```

핵심은 **위에서부터 시도하고, 부족할 때만 아래로 내려가는 것**입니다. 가장 단순한 Prompt Chaining으로 충분한 문제에 Orchestrator-Workers를 도입하면 복잡성만 늘고 디버깅이 어려워집니다. 이 다섯 패턴은 배타적이지 않습니다. 프로덕션 에이전트는 보통 여러 패턴을 조합합니다.

---

## Prompt Chaining: 순차적 파이프라인

### 패턴의 핵심

Anthropic의 정의는 명확합니다.

> "작업을 순차적 단계로 분해하고, 각 LLM 호출이 이전 호출의 출력을 처리한다."

단순히 LLM 호출을 연결하는 것과 Prompt Chaining의 차이는 **게이트(Gate)**에 있습니다. 게이트는 단계 사이에 끼워 넣는 프로그래밍적 검증입니다. LLM 호출이 아니라, 조건문이나 정규표현식 같은 결정론적 코드로 중간 결과를 확인합니다.

```
Step 1: Generate     Gate: validate     Step 2: Transform
  [LLM call] ------> [format OK?] ------> [LLM call]
                          |
                          | fail
                          v
                     [retry / abort]
```

게이트가 중요한 이유는 간단합니다. LLM은 비결정적입니다. 첫 번째 단계의 출력이 예상 형식과 다르면, 게이트 없이는 두 번째 단계가 엉뚱한 입력을 받고 조용히 잘못된 결과를 만들어 냅니다. 게이트는 이 문제를 중간에서 잡아줍니다.

### 프로덕션에서의 Prompt Chaining

Claude Code의 퍼미션 시스템인 transcript classifier(내부 코드명 `yoloClassifier`)가 대표적인 2단계 체이닝입니다. 구조적으로는 Prompt Chaining이지만, 위험도에 따라 분기한다는 점에서 Routing의 성격도 함께 가지고 있습니다. 프로덕션에서는 이렇게 패턴이 깔끔하게 나뉘지 않는 경우가 많습니다.

사용자가 `rm -rf /tmp/test` 같은 명령을 실행하면, 먼저 **Stage 1**(빠른 경로)에서 Sonnet 모델이 `max_tokens=64`로 이 명령의 위험도를 빠르게 분류합니다. 결과가 "안전"이면 즉시 실행하고, "위험"이면 **게이트**가 작동해서 Stage 2(사고 경로)로 넘깁니다. Stage 2에서는 같은 모델이 chain-of-thought로 더 신중하게 판단합니다. 이 2단계 체이닝으로 오탐율(false positive)이 8.5%에서 0.4%로 떨어졌습니다.

단일 호출로 이 정확도를 얻으려면 매번 chain-of-thought를 돌려야 해서 지연 시간이 길어집니다. 체이닝 + 게이트 구조가 속도와 정확도를 동시에 잡은 것입니다.

### 직접 구현

마케팅 카피를 생성하고, 필수 키워드가 포함되었는지 검증한 뒤, 번역하는 체이닝입니다.

```python
async def prompt_chain(request: str) -> str:
    # Step 1: Generate
    draft = await llm_call(f"Write marketing copy for: {request}")

    # Gate: programmatic validation (not an LLM call)
    required = ["price", "features", "CTA"]
    missing = [k for k in required if k.lower() not in draft.lower()]
    if missing:
        draft = await llm_call(
            f"Rewrite to include: {missing}\n\nOriginal:\n{draft}"
        )

    # Step 2: Transform
    return await llm_call(f"Translate to Korean:\n\n{draft}")
```

게이트는 `if missing:` 한 줄입니다. LLM 호출이 아니라 리스트 컴프리헨션으로 검증하고, 실패하면 재생성을 요청합니다. 비결정적인 LLM 호출 사이에 결정론적 로직을 끼워 넣는 것, 이것이 Prompt Chaining의 핵심입니다.

---

## Routing: 입력 분류와 전문화된 처리

### 패턴의 핵심

> "입력을 분류하고, 전문화된 후속 작업으로 보낸다."

Routing은 교통 경찰과 같습니다. 모든 요청을 하나의 거대한 프롬프트로 처리하는 대신, 입력의 유형을 먼저 파악하고 각 유형에 최적화된 핸들러로 보냅니다.

분류 방법은 두 가지입니다.

- **LLM 기반 분류**: 모델이 입력을 읽고 카테고리를 판단. 유연하지만 비용 발생
- **프로그래밍적 분류**: 키워드 매칭, 정규표현식, 임베딩 유사도. 빠르고 저렴하지만 유연성이 떨어짐

Routing이 빛나는 순간은 **모델 라우팅**입니다. Anthropic은 쉬운 질문에는 Haiku 같은 빠르고 저렴한 모델을, 어렵거나 복잡한 질문에는 Sonnet 같은 유능한 모델을 쓰는 예시를 제시합니다. 같은 작업을 비용 1/10로 처리할 수 있는 경우가 많습니다.

### 프로덕션에서의 Routing

Claude Code의 `assembleToolPool()`은 도구 수준의 라우팅입니다. 모델이 도구를 선택하기 전에 여러 단계의 필터링을 거칩니다. 기본 도구 열거(최대 54개), 퍼미션 모드 필터링, deny 규칙 적용, MCP 도구 통합, 중복 제거 등의 과정을 거쳐 현재 상황에 적합한 도구만 모델에게 보여줍니다. 입력을 분류해서 핸들러를 고르는 대신, 사용 가능한 도구 자체를 상황에 맞게 좁히는 것입니다.

OpenAI도 비슷한 개념을 멀티에이전트 수준으로 확장합니다. OpenAI 가이드에서 제시하는 **triage agent** 패턴은 첫 번째 에이전트가 사용자의 요청을 분류한 뒤, 전문화된 에이전트에게 **핸드오프(handoff)**하는 구조입니다. 예를 들어, 고객 문의가 들어오면 triage agent가 "최근 구매 관련"이라고 판단하고, 주문 관리 에이전트에게 대화 전체를 넘깁니다. Claude Code의 도구 필터링이 "어떤 도구를 쓸지"의 라우팅이라면, OpenAI의 triage 패턴은 "어떤 에이전트가 맡을지"의 라우팅입니다.

### 직접 구현

고객 서비스 라우팅입니다. 저렴한 모델로 분류하고, 전문화된 핸들러로 보냅니다.

```python
async def route_request(query: str) -> str:
    # Classification: cheap model
    category = await llm_call(
        f"Classify into: billing, technical, general\n\nQuery: {query}",
        model="claude-haiku"
    )

    # Route to specialized handler
    handlers = {
        "billing": handle_billing,     # payment API access
        "technical": handle_technical,  # docs + code search
        "general": handle_general,      # simple Q&A
    }
    handler = handlers.get(category.strip(), handle_general)
    return await handler(query)
```

분류에 Haiku를 쓰고, 실제 처리에 Sonnet을 쓰면 비용을 크게 줄일 수 있습니다. 분류는 단순한 작업이므로 작은 모델로 충분하고, 복잡한 처리만 큰 모델이 담당하면 됩니다.

---

## Parallelization: 동시 실행과 합의

### 두 가지 하위 패턴

Anthropic은 Parallelization을 두 가지로 나눕니다.

- **Sectioning**: 독립적인 하위 작업을 동시에 실행하고 결과를 합친다
- **Voting**: 같은 작업을 여러 번 실행해서 다수결로 신뢰도를 높인다

```
Sectioning:                    Voting:
Input --+-- Task A --+         Input --+-- LLM call 1 --+
        +-- Task B --+- Merge          +-- LLM call 2 --+- Majority
        +-- Task C --+                 +-- LLM call 3 --+
```

Anthropic이 강조하는 핵심 인사이트가 있습니다. "복잡한 작업에서 여러 고려사항이 있을 때, 각 고려사항을 별도의 LLM 호출로 분리하면 각 측면에 집중할 수 있어 성능이 향상된다." 하나의 프롬프트에 "번역도 하고, 안전성도 검사하고, 요약도 해줘"라고 하면 모든 작업의 품질이 떨어집니다. 분리해서 동시에 실행하면 속도는 빨라지고 품질은 올라갑니다.

### 프로덕션에서의 Parallelization

Claude Code의 `StreamingToolExecutor`는 흥미로운 구현입니다. 모델이 응답을 **스트리밍하는 도중에** 이미 완성된 도구 호출을 미리 실행합니다. 모델이 아직 Turn N의 응답을 생성하고 있을 때, Turn N-1의 도구가 이미 실행되고 있는 것입니다. 이것은 Sectioning의 극단적 형태로, 모델 추론과 도구 실행을 병렬화한 것입니다.

하지만 모든 도구를 동시에 실행할 수는 없습니다. `partitionToolCalls()`가 도구 호출을 "안전한 것"(읽기 전용: 파일 읽기, grep, glob)과 "배타적인 것"(쓰기 작업: 파일 수정, bash 실행)으로 분류합니다. 읽기 전용 도구는 동시 실행(기본 동시성 제한: 10), 쓰기 도구는 순차 실행합니다. "그냥 다 병렬로 돌리자"가 아니라, 안전하게 병렬화할 수 있는 것만 골라내는 엔지니어링이 필요합니다.

### 직접 구현

코드 리뷰를 세 가지 관점에서 동시에 수행하는 Sectioning 패턴입니다.

```python
async def parallel_review(code: str) -> dict:
    security, performance, style = await asyncio.gather(
        llm_call(f"Review for security vulnerabilities:\n\n{code}"),
        llm_call(f"Review for performance issues:\n\n{code}"),
        llm_call(f"Review for style violations:\n\n{code}"),
    )
    return {
        "security": security,
        "performance": performance,
        "style": style,
    }
```

`asyncio.gather`로 세 개의 LLM 호출을 동시에 실행합니다. 순차 실행이면 3배의 시간이 걸리지만, 병렬이면 가장 느린 호출 하나의 시간만 걸립니다. Voting은 이 구조에서 프롬프트만 같은 것으로 바꾸고, 결과를 다수결로 집계하면 됩니다.

---

## Orchestrator-Workers: 동적 작업 분해

### 패턴의 핵심

Orchestrator-Workers는 겉보기에 Prompt Chaining과 비슷하지만, 결정적인 차이가 있습니다.

> "중앙 LLM이 작업을 동적으로 분해하고, 워커 LLM에게 위임하고, 결과를 종합한다."

Prompt Chaining에서는 단계가 **개발자에 의해 미리 정해져** 있습니다. "1단계: 생성, 2단계: 검증, 3단계: 번역"이 코드에 고정되어 있죠. Orchestrator-Workers에서는 **모델이 런타임에 하위 작업을 결정**합니다. "이 프로젝트의 버그를 고쳐줘"라는 요청을 받으면, 어떤 파일을 분석할지, 몇 개의 워커가 필요한지, 어떤 순서로 작업할지를 모델이 판단합니다.

이 유연성 때문에, 코딩 에이전트들이 이 패턴을 가장 많이 사용합니다. 코드 수정은 미리 단계를 정할 수 없는 작업의 대표적인 예입니다.

### 프로덕션에서의 Orchestrator-Workers

Claude Code의 `AgentTool`은 이 패턴의 정교한 구현입니다. 중앙 모델이 서브에이전트를 생성할 때, worktree 격리 모드를 사용하면 각 서브에이전트가 **별도의 git worktree**에서 실행됩니다. 별도의 브랜치에서 작업하므로 서브에이전트끼리 서로 간섭하지 않습니다. 작업이 끝나면 결과만 요약해서 부모에게 돌려주고, 전체 대화 이력은 별도의 사이드체인 파일에 저장합니다. 부모의 컨텍스트 윈도우가 서브에이전트의 대화로 오염되지 않는 것입니다.

Codex는 더 제약적인 접근을 취합니다. `spawn_agent`/`wait_agent`로 서브에이전트를 생성하되, 최대 깊이 1(서브에이전트가 다시 서브에이전트를 만들 수 없음), 최대 6개 병렬 스레드로 제한합니다. SQLite로 세션 상태를 관리하고, 각 서브에이전트는 자체 샌드박스에서 실행됩니다.

두 시스템의 설계 차이가 흥미롭습니다.

| 관점 | Claude Code | Codex |
|------|-------------|-------|
| 격리 방식 | git worktree | 샌드박스 컨테이너 |
| 깊이 제한 | 재귀 가드 (fork 방지) | 최대 1 |
| 결과 전달 | 요약만 반환 (사이드체인) | 세션 상태 (SQLite) |
| 최대 동시성 | 설정 가능 | 6 스레드 |

### 직접 구현

오케스트레이터가 작업을 동적으로 분해하고 워커에게 위임하는 구조입니다.

```python
async def orchestrator(task: str) -> str:
    # Step 1: Orchestrator plans (subtasks determined at runtime)
    plan = await llm_call(
        f"Break this into independent subtasks (JSON list):\n\n{task}"
    )
    subtasks = json.loads(plan)

    # Step 2: Workers execute in parallel
    results = await asyncio.gather(
        *[worker(st) for st in subtasks]
    )

    # Step 3: Orchestrator synthesizes
    return await llm_call(
        "Combine these results into a final answer:\n\n"
        + "\n\n".join(f"[{i+1}] {r}" for i, r in enumerate(results))
    )

async def worker(subtask: str) -> str:
    return await llm_call(f"Complete this subtask:\n\n{subtask}")
```

오케스트레이터는 최소 2번의 LLM 호출(계획 + 종합)을 하고, 워커는 N번 호출합니다. 하위 작업이 5개면 총 7번의 LLM 호출입니다. 이 비용이 Anthropic이 "단순한 패턴이 부족할 때만 사용하라"고 강조하는 이유입니다.

---

## Evaluator-Optimizer: 생성과 평가의 반복

### 패턴의 핵심

> "하나의 LLM이 응답을 생성하고, 다른 LLM이 평가와 피드백을 제공하는 루프."

이 패턴이 효과적이려면 두 가지 전제조건이 필요합니다.

1. **사람이 피드백을 주면 결과가 실제로 개선되는 작업**인가
2. **LLM이 그런 피드백을 제공할 수 있는가**

두 조건을 모두 만족하면 Evaluator-Optimizer가 빛납니다. Anthropic이 드는 예시는 문학 번역입니다. 번역의 뉘앙스, 어조, 문화적 맥락을 평가자가 지적하고, 생성자가 이를 반영해 개선하는 반복. 단순 번역은 한 번이면 충분하지만, 문학 번역은 반복할수록 품질이 올라갑니다.

```
Generator -------> Output -------> Evaluator
    ^                                  |
    |                                  | feedback
    +-------- meets criteria? ---------+
                    |
                    | yes
                    v
               Final Output
```

핵심은 평가자가 단순히 점수만 매기는 게 아니라, **구체적인 개선 방향을 제시**한다는 것입니다. "7/10"이라는 점수만으로는 생성자가 무엇을 고쳐야 할지 모릅니다. "두 번째 문단의 비유가 원문의 어조와 맞지 않는다. 더 격식체로 바꿔라"같은 피드백이 있어야 실질적인 개선이 일어납니다.

### 프로덕션에서의 Evaluator-Optimizer

Anthropic이 공개한 multi-agent research system이 이 패턴의 프로덕션 사례입니다. 리드 에이전트가 여러 서브에이전트에게 조사를 위임하고, 돌아온 결과의 품질을 평가합니다. 근거가 부족하거나 질문에 제대로 답하지 못한 결과는 구체적인 피드백과 함께 서브에이전트에게 다시 보냅니다. 서브에이전트가 개선된 결과를 제출하면 리드 에이전트가 다시 평가하는 반복 구조입니다. Anthropic은 이 패턴을 적용한 뒤 응답 품질이 90.2% 향상되었다고 보고했습니다.

Claude Code의 에이전트 루프도 넓은 의미에서 이 패턴의 요소를 가지고 있습니다. 에이전트가 코드를 수정하고 테스트를 실행해서 실패하면, 테스트 결과(평가)를 바탕으로 코드를 다시 수정합니다(개선). 다만 이것은 별도의 평가 모델이 아니라, 동일한 모델이 도구 실행 결과를 피드백으로 활용하는 구조입니다. multi-agent research system처럼 전용 평가자가 있는 것과는 구분할 필요가 있습니다.

### 직접 구현

생성-평가 루프입니다. 최대 반복 횟수로 무한 루프를 방지합니다.

```python
async def evaluator_optimizer(task: str, max_rounds: int = 3) -> str:
    output = await llm_call(f"[Generator] {task}")

    for _ in range(max_rounds):
        evaluation = await llm_call(
            f"[Evaluator] Rate 1-10 and give specific improvements:\n\n{output}"
        )
        score = extract_score(evaluation)
        if score >= 8:
            break
        output = await llm_call(
            f"[Generator] Improve based on feedback:\n{evaluation}\n\nOriginal:\n{output}"
        )

    return output
```

최악의 경우 `2 * max_rounds + 1`번의 LLM 호출이 발생합니다 (`max_rounds=3`이면 최대 7번). 종료 조건(`score >= 8`)이 없으면 토큰만 소비하며 의미 없는 반복을 계속하게 됩니다. 임계값 설정과 최대 반복 횟수, 이 두 가지가 Evaluator-Optimizer를 실용적으로 만드는 핵심입니다.

---

## 프로덕션 비교: 패턴별 구현 현황

지금까지 개별 패턴을 살펴봤습니다. 두 프로덕션 에이전트가 각 패턴을 어떻게 구현하는지 한눈에 비교해 보겠습니다.

| 패턴 | Claude Code | Codex |
|------|-------------|-------|
| Prompt Chaining | transcript classifier 2-stage 분류 | 설정(TOML) → 실행 파이프라인 |
| Routing | assembleToolPool() 다단계 필터링 | 모델 결정 후 디스패치 |
| Parallelization | StreamingToolExecutor + partitionToolCalls | 서브에이전트 최대 6스레드 |
| Orchestrator-Workers | AgentTool (worktree 격리, 사이드체인) | 서브에이전트 생성 (깊이 1) |
| Evaluator-Optimizer | 에이전트 루프 (수정→테스트→재수정) | 명시적 구현 없음 |

두 가지 흥미로운 관찰이 있습니다.

첫째, Claude Code는 **하나의 모델이 모든 패턴을 암묵적으로 수행**합니다. 패턴이 코드에 명시적으로 이름 붙여진 것이 아니라, 에이전트 루프의 동작에서 자연스럽게 나타납니다. 반면 Codex는 **제약을 통한 안전성**에 집중합니다. 깊이 1, 최대 6스레드, 커널 수준 샌드박스. 오케스트레이션의 자유도를 의도적으로 제한하는 설계 결정입니다.

둘째, 두 시스템 모두 **여러 패턴을 동시에 사용**합니다. Claude Code의 단일 요청 처리에서도 Routing(도구 선택) → Parallelization(읽기 도구 동시 실행) → Orchestrator-Workers(서브에이전트 위임)가 한 턴 안에 일어날 수 있습니다.

---

## 한계와 열린 문제

### 비용 escalation

각 패턴이 수반하는 LLM 호출 횟수를 정리하면 복잡도의 대가가 선명해집니다.

| 패턴 | 최소 호출 수 | 최악의 경우 |
|------|------------|------------|
| Prompt Chaining | N (단계 수) | N + 재시도 |
| Routing | 1 (프로그래밍적 분류 시) ~ 2 (LLM 분류 시) | 2 |
| Parallelization | N (동시 작업 수) | N |
| Orchestrator-Workers | 2 + N (계획 + 워커 + 종합) | 2 + N |
| Evaluator-Optimizer | 2K + 1 (K 라운드) | 2 * max_rounds + 1 |

Orchestrator-Workers가 5개 하위 작업을 생성하고, 각 워커가 Evaluator-Optimizer로 3라운드를 돈다면, 한 번의 사용자 요청에 수십 번의 LLM 호출이 발생합니다. 프로덕션 에이전트가 비용 관리에 많은 엔지니어링을 투자하는 이유입니다.

### 디버깅 불투명성

패턴이 합성되면, 에이전트가 특정 결정을 왜 내렸는지 추적하기가 어려워집니다. 코드의 스택 트레이스에 해당하는 것이 멀티패턴 에이전트에는 아직 없습니다. Claude Code가 서브에이전트의 전체 대화를 사이드체인 파일로 저장하는 것은 이 문제에 대한 하나의 해법입니다.

### 과잉 설계 함정

가장 흔한 실수는 Prompt Chaining으로 충분한 문제에 Orchestrator-Workers를 도입하는 것입니다. "뭔가 더 강력한 패턴을 써야 하지 않을까"라는 유혹이 있지만, 앞서 본 결정 트리의 원칙은 분명합니다. 단순한 패턴이 실패한다는 증거가 있을 때만 복잡도를 올려야 합니다.

---

## 마치며

다섯 가지 패턴은 결국 하나의 질문에 대한 다섯 가지 답입니다. "LLM 호출을 어떻게 구성할 것인가?" 순차적으로(Chaining), 분기해서(Routing), 동시에(Parallelization), 동적으로 위임해서(Orchestrator-Workers), 반복적으로 개선해서(Evaluator-Optimizer). 진짜 실력은 어떤 패턴을 쓸지가 아니라, 어떤 패턴이 **필요 없는지**를 아는 것에 있습니다.

다음 글에서는 이 모든 패턴의 공통 기반인 도구(Tool)를 깊이 다룹니다. 도구가 잘못 설계되면 어떤 패턴을 써도 성능이 나오지 않습니다. Anthropic이 말하는 ACI(Agent-Computer Interface) 설계 원칙과, Claude Code 도구의 설계 원칙 및 실제 스키마를 분석해 보겠습니다.

## 참고자료

- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [A Practical Guide to Building Agents (OpenAI)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Multi-Agent Research System (Anthropic)](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Introducing Codex (OpenAI)](https://openai.com/index/introducing-codex/)
