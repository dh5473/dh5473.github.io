---
date: '2025-11-16'
title: 'GPT-5.1 API 변경사항, 모델 ID만 바꾸면 추론이 꺼집니다'
category: 'Issue'
tags: ['GPT-5.1', 'OpenAI', 'Responses API', 'Reasoning Effort', 'LLM']
summary: 'GPT-5.1은 reasoning effort 기본값이 none이라 모델 ID만 교체하면 추론이 사라집니다. Responses API로 옮길 때 달라지는 지점까지 정리합니다.'
thumbnail: './gpt-5-1.png'
---

GPT-5가 나온 지 얼마 지나지 않아 GPT-5.1이 공개되었습니다. 기능 추가보다 API 쪽 변경이 더 눈에 띄는 릴리스입니다. Chat Completions API를 쓰고 있거나 reasoning effort를 `minimal`로 두고 있었다면, 모델 ID만 올렸을 때 동작이 달라집니다.

이 글은 2025년 11월 GPT-5.1 공개 시점을 기준으로 정리했습니다. reasoning effort의 허용값은 모델마다 다르고 뒤에 나온 모델에서 단계가 더 늘기도 하므로, 다른 모델에 옮겨 쓸 때는 그 모델의 문서에서 허용값을 확인해야 합니다.

## 사고량을 스스로 조절하는 adaptive reasoning

GPT-5.1은 문제의 난이도에 따라 사고 시간을 다르게 씁니다. 쉬운 요청에는 토큰을 덜 쓰고, 어려운 요청에는 더 오래 붙잡습니다. OpenAI는 이 동작을 adaptive reasoning이라고 부릅니다.

전역 설치된 npm 패키지를 나열하는 명령어를 묻는 같은 질문에서, GPT-5는 medium 설정으로 사고 토큰 약 250개를 쓰고 10초가 걸렸습니다. GPT-5.1은 같은 medium에서 약 50개로 2초 만에 답했습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 210" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 npm 질문에 GPT-5는 medium에서 사고 토큰 약 250개를 쓰고 10초가 걸렸으나 GPT-5.1은 약 50개로 2초에 답한 비교 막대">
<style>
.tk-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.tk-l { fill: var(--text, #1c1917); font-size: 14px; }
.tk-w { fill: var(--on-fill, #ffffff); font-size: 14px; font-weight: 700; }
.tk-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.tk-old { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.tk-new { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
</style>
<text class="tk-t" x="200" y="24" text-anchor="middle">같은 질문에 쓴 사고 토큰</text>
<text class="tk-l" x="20" y="60">GPT-5 (medium)</text>
<rect class="tk-old" x="20" y="70" width="300" height="28" rx="5"/>
<text class="tk-l" x="32" y="89">250토큰 · 10초</text>
<text class="tk-l" x="20" y="130">GPT-5.1 (medium)</text>
<rect class="tk-new" x="20" y="140" width="60" height="28" rx="5"/>
<text class="tk-w" x="30" y="159">50</text>
<text class="tk-l" x="92" y="159">토큰 · 2초</text>
<text class="tk-n" x="20" y="196">막대 길이 = 사고 토큰 수</text>
</svg>
</div>

## reasoning effort와 새로 생긴 none

reasoning effort는 사고량을 개발자가 직접 지정하는 파라미터입니다. o3 같은 이전 추론 모델은 `low`, `medium`, `high` 세 단계였고, GPT-5에서 `minimal`이 더해져 네 단계가 되었습니다.

GPT-5.1은 이 목록에서 `minimal`을 빼고 `none`을 넣었습니다. `none`은 추론 토큰을 아예 만들지 않아서, GPT-4.1 같은 비추론 모델처럼 동작하면서 GPT-5.1의 지능을 씁니다. 그리고 기본값이 `medium`에서 `none`으로 내려갔습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 250" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="GPT-5는 minimal low medium high 중 medium이 기본값이었으나 GPT-5.1에서는 minimal이 빠지고 새로 생긴 none이 기본값이 된 변화">
<style>
.re-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.re-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.re-l { fill: var(--text, #1c1917); font-size: 14px; }
.re-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.re-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.re-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.re-def { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.re-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.re-tick { stroke: var(--primary, #0a756c); stroke-width: 1.5; fill: none; }
</style>
<text class="re-t" x="200" y="22" text-anchor="middle">기본값이 옮겨간 자리</text>
<text class="re-h" x="20" y="48">GPT-5</text>
<rect class="re-box" x="16" y="58" width="88" height="32" rx="5"/>
<text class="re-l" x="60" y="79" text-anchor="middle">minimal</text>
<rect class="re-box" x="108" y="58" width="88" height="32" rx="5"/>
<text class="re-l" x="152" y="79" text-anchor="middle">low</text>
<rect class="re-def" x="200" y="58" width="88" height="32" rx="5"/>
<text class="re-w" x="244" y="79" text-anchor="middle">medium</text>
<rect class="re-box" x="292" y="58" width="88" height="32" rx="5"/>
<text class="re-l" x="336" y="79" text-anchor="middle">high</text>
<path class="re-tick" d="M244 90 L244 100"/>
<text class="re-n" x="244" y="116" text-anchor="middle">기본값</text>
<line class="re-div" x1="20" y1="134" x2="380" y2="134"/>
<text class="re-h" x="20" y="160">GPT-5.1</text>
<rect class="re-def" x="16" y="170" width="88" height="32" rx="5"/>
<text class="re-w" x="60" y="191" text-anchor="middle">none</text>
<rect class="re-box" x="108" y="170" width="88" height="32" rx="5"/>
<text class="re-l" x="152" y="191" text-anchor="middle">low</text>
<rect class="re-box" x="200" y="170" width="88" height="32" rx="5"/>
<text class="re-l" x="244" y="191" text-anchor="middle">medium</text>
<rect class="re-box" x="292" y="170" width="88" height="32" rx="5"/>
<text class="re-l" x="336" y="191" text-anchor="middle">high</text>
<path class="re-tick" d="M60 202 L60 212"/>
<text class="re-n" x="60" y="228" text-anchor="middle">기본값</text>
</svg>
</div>

```python
from openai import OpenAI
client = OpenAI()

# 빠른 응답이 필요한 경우
result = client.responses.create(
    model="gpt-5.1",
    input="Write a haiku about code.",
    reasoning={"effort": "none"},
    text={"verbosity": "low"}
)
```

`minimal`은 GPT-5.1 이후 모델에서 받지 않는 값입니다. GPT-5에서 `reasoning={"effort": "minimal"}`을 쓰던 코드를 모델 ID만 바꿔 옮기면 이 줄에서 에러가 납니다. `none`이나 `low` 중 하나를 골라야 합니다.

:::warning

**모델 ID만 바꾸면 추론이 조용히 꺼집니다**

GPT-5에서 `reasoning_effort`를 명시하지 않고 기본값 `medium`에 기대고 있었다면, 모델 ID를 `gpt-5.1`로 바꾸는 순간 기본값이 `none`이 되어 추론이 사라집니다. 이쪽은 에러가 나지 않고 응답도 정상으로 오기 때문에, 품질이 떨어진 뒤에야 알아차리게 됩니다. 기존 동작을 유지하려면 `reasoning={"effort": "medium"}`을 명시적으로 넘기면 됩니다.

:::

GPT-4.1에서 넘어오는 경우는 사정이 반대입니다. 추론이 필요 없던 저지연 용도라면 `none`이 그대로 대체 지점입니다.

## 추론 모델에서 막히는 파라미터

GPT-5 계열은 추론이 켜진 요청에서 다음 세 파라미터를 받지 않습니다.

- `temperature`
- `top_p`
- `logprobs`

GPT-5.1에 reasoning effort를 `none` 이외의 값으로 주면서 이 필드를 함께 넣으면 에러가 납니다. GPT-5, GPT-5-mini, GPT-5-nano는 effort와 무관하게 막혀 있습니다.

:::note

**GPT-5.1에서 새로 생긴 제약은 아닙니다**

GPT-5 세대부터 적용된 규칙입니다. 다만 GPT-4.1이나 o 시리즈에서 곧바로 넘어오면 이 시점에 처음 마주치게 되므로 함께 정리합니다.

:::

대신 GPT-5 계열은 reasoning effort와 verbosity로 출력을 조절합니다. verbosity는 모델이 출력 토큰을 얼마나 쓸지 정하는 값입니다. 낮추면 지연과 비용이 함께 줄지만, 답변이 짧아지는 만큼 빠지는 내용도 생깁니다.

```python
response = client.responses.create(
    model="gpt-5.1",
    input="Your prompt here",
    reasoning={"effort": "none"},  # none | low | medium | high
    text={"verbosity": "medium"},  # low | medium | high
    max_output_tokens=1000
)
```

## Chat Completions에서 Responses API로

OpenAI의 생성 API는 두 갈래입니다. Responses가 현재 권장 경로이고, Chat Completions는 계속 지원되지만 신규 프로젝트에는 권장되지 않습니다. GPT-5.1 사용 가이드도 Responses를 기준으로 쓰여 있습니다.

Responses로 옮겼을 때 달라지는 것은 네 가지입니다.

1. **성능**: 추론 모델을 같은 프롬프트와 설정으로 돌렸을 때 내부 평가에서 SWE-bench 점수 3% 향상
2. **비용**: 캐시 활용률이 내부 테스트 기준 40~80% 개선
3. **도구 루프**: 요청 한 번에 웹 검색, 파일 검색, 코드 인터프리터, 원격 MCP 같은 내장 도구를 이어서 호출
4. **상태 유지**: `store: true`로 턴 사이의 추론과 도구 컨텍스트 보존

네 번째가 코드 구조를 가장 크게 바꿉니다. Chat Completions에서는 대화 기록을 클라이언트가 들고 있다가 매 턴 전부 다시 보내야 하지만, Responses는 직전 응답의 ID만 넘기면 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 476" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Chat Completions는 클라이언트가 messages 배열 전체를 매 턴 다시 보내지만 Responses는 previous_response_id만 보내고 이전 응답과 추론, 도구 컨텍스트를 OpenAI 서버가 보관한다는 비교">
<defs>
<marker id="stArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<style>
.st-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.st-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.st-l { fill: var(--text, #1c1917); font-size: 14px; }
.st-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.st-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.st-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.st-req { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.st-srv { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.st-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.st-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="st-t" x="200" y="24" text-anchor="middle">턴 사이 상태를 누가 들고 있나</text>
<!-- panel A -->
<text class="st-h" x="20" y="58">Chat Completions</text>
<rect class="st-box" x="30" y="70" width="340" height="58" rx="6"/>
<text class="st-l" x="200" y="94" text-anchor="middle">클라이언트</text>
<text class="st-n" x="200" y="116" text-anchor="middle">messages 배열 전체 보관</text>
<path class="st-arr" d="M200 128 L200 156" marker-end="url(#stArrow)"/>
<text class="st-n" x="210" y="147">매 턴 전체 재전송</text>
<rect class="st-req" x="30" y="158" width="340" height="42" rx="6"/>
<text class="st-l" x="200" y="184" text-anchor="middle">Chat Completions 요청</text>
<line class="st-div" x1="20" y1="228" x2="380" y2="228"/>
<!-- panel B -->
<text class="st-h" x="20" y="262">Responses</text>
<rect class="st-box" x="30" y="274" width="340" height="58" rx="6"/>
<text class="st-l" x="200" y="298" text-anchor="middle">클라이언트</text>
<text class="st-n" x="200" y="320" text-anchor="middle">previous_response_id 하나</text>
<path class="st-arr" d="M200 332 L200 360" marker-end="url(#stArrow)"/>
<rect class="st-req" x="30" y="362" width="340" height="42" rx="6"/>
<text class="st-l" x="200" y="388" text-anchor="middle">Responses 요청</text>
<path class="st-arr" d="M200 404 L200 432" marker-end="url(#stArrow)"/>
<rect class="st-srv" x="30" y="434" width="340" height="36" rx="6"/>
<text class="st-w" x="200" y="457" text-anchor="middle">OpenAI 서버 · 추론과 도구 컨텍스트 보관</text>
</svg>
</div>

### API 구조 비교

```python
# Chat Completions API
completion = client.chat.completions.create(
    model="gpt-5.1",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)
print(completion.choices[0].message.content)


# Responses API
response = client.responses.create(
    model="gpt-5.1",
    instructions="You are a helpful assistant.",
    input="Hello!"
)
print(response.output_text)
```

### Multi-turn 대화 처리

```python
# Chat Completions API: 컨텍스트를 수동으로 관리
messages = [{"role": "user", "content": "What is the capital of France?"}]
res1 = client.chat.completions.create(model="gpt-5.1", messages=messages)

messages += [res1.choices[0].message]
messages.append({"role": "user", "content": "And its population?"})
res2 = client.chat.completions.create(model="gpt-5.1", messages=messages)


# Responses API: previous_response_id로 체이닝
res1 = client.responses.create(
    model="gpt-5.1",
    input="What is the capital of France?",
    store=True
)

res2 = client.responses.create(
    model="gpt-5.1",
    input="And its population?",
    previous_response_id=res1.id,
    store=True
)
```

`previous_response_id`는 직전 응답의 top-level `instructions`까지 이어받지는 않습니다. 시스템 지시가 매 턴 유지되어야 한다면 요청마다 다시 넣어야 합니다.

### Function 정의

Chat Completions는 `function` 아래에 한 겹 더 감쌉니다.

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "strict": true,
    "parameters": {}
  }
}
```

Responses는 그 래퍼 없이 평평하게 씁니다.

```json
{
  "type": "function",
  "name": "get_weather",
  "parameters": {}
}
```

`strict`를 생략했을 때의 동작도 다릅니다. Chat Completions는 non-strict가 기본이지만, Responses는 strict를 먼저 시도하고 스키마를 strict로 만들 수 없으면 non-strict로 물러선 뒤 `strict: false`로 표시해 돌려줍니다. Responses에서 non-strict를 확정하고 싶다면 `strict: false`를 직접 넣어야 합니다.

### Structured Outputs 정의

```python
# Chat Completions API: response_format 사용
completion = client.chat.completions.create(
    model="gpt-5.1",
    messages=[],
    response_format={
        "type": "json_schema",
        "json_schema": {}
    }
)


# Responses API: text.format 사용
response = client.responses.create(
    model="gpt-5.1",
    input="...",
    text={
        "format": {
            "type": "json_schema",
            "name": "person",
            "schema": {}
        }
    }
)
```

## 마치며

GPT-5.1의 API 변경 중 실제로 문제를 일으키는 것은 reasoning effort 기본값 하나입니다. `minimal` 제거나 파라미터 이름 변경은 요청이 곧바로 실패하니 배포 전에 잡힙니다. 반면 기본값 변경은 에러 없이 통과하고 응답도 정상으로 오기 때문에, 품질이 떨어진 다음에야 원인을 찾게 됩니다. 모델 ID를 올릴 때는 `reasoning_effort`를 항상 명시해 두는 편이 안전합니다.

Responses 전환은 성격이 다른 판단입니다. Chat Completions로 잘 돌아가는 단발성 호출을 서둘러 옮길 이유는 없습니다. 다만 도구를 여러 개 붙이거나 턴 사이에 추론을 이어가야 하는 구조라면, 직접 만든 컨텍스트 관리 코드를 계속 손보는 것보다 Responses 쪽이 품이 덜 듭니다.

## 함께 보면 좋은 글

- [Test Time Scaling](/llm/test-time-scaling/) : 추론 시간에 사고량을 늘리면 성능이 왜 오르는지
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/) : 사고 토큰이 늘어날 때 지연이 어디서 생기는지
- [Claude Sonnet 5 출시, Opus급 성능?](/issue/claude-sonnet-5-release/) : 이후 나온 경쟁 모델의 가격과 벤치마크

## 참고자료

- [GPT-5.1 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.1)
- [Using GPT-5.1](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.1)
- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- [Migrate to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Introducing GPT-5.1 for developers](https://openai.com/index/gpt-5-1-for-developers/)
- [Azure OpenAI reasoning models](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)
