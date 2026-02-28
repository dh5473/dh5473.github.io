---
date: '2025-11-16'
title: '반드시 체크해야 할 GPT-5.1 주요 변경사항'
category: 'LLM'
summary: 'GPT-5와 달라진 핵심 변경 사항을 정리해봅니다.'
thumbnail: './gpt-5-1.png'
---


GPT-5가 등장한지 얼마 지나지 않아 GPT-5.1이 공개되었습니다. 사실 GPT-5가 공개되었을 당시에는 큰 기대감과 달리 아쉽다는 평이 많았는데요, 문제되었던 점을 빠르게 보완하여 출시한 할으로 보입니니 이외에도 다양한 변경사항이 있는데, 만약 기존 **chat completion 버전 API를 사용**하고 있거나 **reasoning effort를 minimal로 사용**하고 있었던 경우 꼭 이번 업데이트를 체크해보아야 합니다.

<br>

이번 글에서 중점적으로 살펴볼 것들은 다음과 같습니다.
- 더 빠른 응답을 위한 **none reasoning** 설정
- API 파라미터 변경사항 (temperature, top_p 등 제거)
- Chat Completions에서 **Responses**로 API 마이그레이션

## Reasoning Effort의 변화

reasoning effort란 모델이 생각을 얼마나 깊게 할지 제어하는 파라미터라고 생각하시면 됩니다. GPT-5 이전에는 low, medium, high를 제공했고, GPT-5가 출시되면서 minimal이라는 옵션이 추가되었었습니다. GPT-5의 경우 이 reasoning effot를 높게 설정하지 않았음에도 간헐적으로 너무 길게 생각하여 응답 시간이 오래 걸리거나 토큰 비용이 생각보다 많이 나오는 문제가 있었습니다.

OpenAI도 이 점을 의식했는지 GPT-5.1에서는 **none** 이라는 옵션이 추가되었으며, 기본값 역시 none으로 설정하면서 기존 GPT-5와는 변화된 모습입니다.

- **GPT-5**: 기본값 medium, 최소값 minimal
- **GPT-5.1**: 기본값 none, 옵션 none | low | medium | high

정리하면 none 설정은 낮은 레이턴시와 추론 토큰을 최소화하는 방식으로 작동합니다. GPT-4.1과 같은 비추론 모델과 유사한 동작을 하면서, GPT-5.1의 높은 지능을 활용활 수 있습니다.

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

## API 파라미터 변경사항

GPT-5.1로 마이그레이션할 때 주의해야 할 점은 **일부 파라미터가 완전히 제거**되었다는 것입니다. 다른 파라미터 수정 없이 단순히 모델만 변경해서 넣어주면 동작하지 않거나 에러가 발생할 수도 있습니다.

GPT-5.1, GPT-5, GPT-5-mini, GPT-5-nano에서는 다음 파라미터를 **더 이상 지원하지 않습니다.**

- temperature
- top_p
- logprobs

<br>

대신 다음과 같은 GPT-5 전용 옵션을 사용해야 합니다.

참고로 verbosity는 모델이 얼마나 많은 출력 토큰을 생성할지 결정하는 파라미터입니다. 토큰 수를 줄이면 latency도 줄고 답변을 더 간결하게 만드는 방향으로 조정되지만, 답변 품질에도 영향을 미칩니다.

```python
response = client.responses.create(
    model="gpt-5.1",
    input="Your prompt here",
    reasoning={"effort": "none"},  # none | low | medium | high
    text={"verbosity": "medium"},  # low | medium | high
    max_output_tokens=1000
)
```

### 마이그레이션 가이드라인

공식 문서에서 소개하는, 기존 모델에서 GPT-5.1로 전환 시 권장사항입니다. 이때 OpenAI의 [프롬프트 최적화 도구](http://platform.openai.com/chat/edit?optimize=true)를 사용하면 GPT-5.1에 맞게 프롬프트를 자동으로 업데이트할 수 있습니다.


<div style="overflow-x: auto; margin: 24px 0;">
  <table style="width: 100%; max-width: 800px; margin: 0 auto; border-collapse: collapse; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
    <thead>
      <tr style="background-color: #e6e6fa; color: #4a4a4a;">
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 32%;">기존 모델</th>
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 68%;">GPT-5.1 전환 가이드</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">gpt-5</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">기본 설정(<code>none</code>)으로 바로 교체 가능</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">o3</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;"><code>medium</code> 또는 <code>high</code> reasoning, 프롬프트 튜닝 필요</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">gpt-4.1</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;"><code>none</code> reasoning으로 대체 강력 추천, 프롬프트 튜닝 필요</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">o4-mini 또는 gpt-4.1-mini</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">gpt-5-mini 사용, 프롬프트 튜닝 필요</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; background-color: #f8f9fa; color: #495057;">gpt-4.1-nano</td>
        <td style="padding: 16px 20px;">gpt-5-nano 사용, 프롬프트 튜닝 필요</td>
      </tr>
    </tbody>
  </table>
</div>

<br>

## Chat Completions에서 Responses API로

OpenAI는 개발자들에게 **Completions, Chat Completions, Responses** 총 3가지 API를 제공하고 있습니다. 이중 가장 많이 사용되는 것은 Chat Completions인데요, OpenAI는 최신 버전인 Responses를 모든 새로운 프로젝트에 추천하고 있으며, GPT-5.1 사용 가이드에서도 소개하고 있습니다.

<br>

Responses API의 주요 장점은 다음과 같습니다.
1. **향상된 성능**: 같은 프롬프트와 설정에서 내부 평가 결과 SWE-bench 점수가 **3% 향상**
2. **비용 절감**: 개선된 캐시 활용으로 **40~80% 비용 절감** (내부 테스트 기준)
3. **기본 에이전트 기능**: 한 번의 API 요청으로 여러 도구 호출 가능
4. **상태 유지**: store: true로 턴 간 추론 및 도구 컨텍스트 보존

<br>

![image.png](./chat-completions-and-responses.png)

<br>

### API 구조 비교

```python
# Chat Completions API
completion = client.chat.completions.create(
    model="gpt-5",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)
print(completion.choices[0].message.content)


# Responses API
response = client.responses.create(
    model="gpt-5",
    instructions="You are a helpful assistant.",
    input="Hello!"
)
print(response.output_text)
```

### Multi-turn 대화 처리

```python
# Chat Completions API: 컨텍스트를 수동으로 관리
messages = [{"role": "user", "content": "What is the capital of France?"}]
res1 = client.chat.completions.create(model="gpt-5", messages=messages)

messages += [res1.choices[0].message]
messages.append({"role": "user", "content": "And its population?"})
res2 = client.chat.completions.create(model="gpt-5", messages=messages


# Responses API: previous_response_id로 간편하게 체이닝
res1 = client.responses.create(
    model="gpt-5",
    input="What is the capital of France?",
    store=True
)

res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    previous_response_id=res1.id,
    store=True
)
```

### Function 정의

```jsx
// Chat Completions API
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "strict": true,
    "parameters": { /* ... */ }
  }
}

// Responses API
{
  "type": "function",
  "name": "get_weather",  // 내부 태깅
  "parameters": { /* ... */ }
  // strict는 기본값
}
```

### Structured Outputs 정의

```python
# Chat Completions API: response_format 사용
completion = client.chat.completions.create(
    model="gpt-5",
    messages=[...],
    response_format={
        "type": "json_schema",
        "json_schema": { /* ... */ }
    }
)


# Responses API: text.format 사용
response = client.responses.create(
    model="gpt-5",
    input="...",
    text={
        "format": {
            "type": "json_schema",
            "name": "person",
            "schema": { /* ... */ }
        }
    }
)
```

이외 상세 내용은 [공식 문서](https://platform.openai.com/docs/guides/migrate-to-responses)에서 확인하실 수 있습니다.


## 마치며

GPT-5.1은 단순히 성능 업그레이드 외에도 API 파라미터 등에서 많은 변화가 있었습니다. 소개드린 내용 외에도 코딩에 활용되는 도구 추가 등 다른 새로운 내용도 있으니 관심있으신 분은 공식 문서를 참고하시길 바랍니다.

사실 GPT-5는 기대감에 못미치는 성능이라는 평이 많았는데, GPT-5.1이 얼마나 더 보완되었는지는 더 사용해보아야 알 수 있을 것 같습니다. 엔터프라이즈 시장에서는 Anthropic이 1등 자리를 굳건히 함과 동시에, 데티모달을 필두로 무섭게 치고 올라오는 Gemini 사이 속에서 OpenAI가 어떤 행보를 보여줄지도 관심있게 지켜보면 좋을 것 같습니다.
도

## 참고자료
- [GPT-5.1 활용 공식 문서](https://platform.openai.com/docs/guides/latest-model)
- [Responses API 마이그레이션 가이드](https://platform.openai.com/docs/guides/migrate-to-responses)