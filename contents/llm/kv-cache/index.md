---
date: '2026-07-07'
title: 'KV Cache가 LLM 서빙을 바꾸는 방식'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 2
tags: ['LLM Serving', 'vLLM', 'KV Cache', 'Autoregressive', 'Attention']
summary: 'KV Cache가 왜 필요하고 어떻게 동작하는지, 그리고 이것이 LLM 서빙을 매 요청이 상태를 들고 다니는 문제로 바꿔놓는 과정을 정리합니다.'
thumbnail: './thumbnail.png'
---

LLM은 토큰을 하나씩 생성합니다. 이 decode 단계는 계산보다 메모리 대역폭에 먼저 묶이기 때문에, 여러 요청을 배치로 묶어 한 번에 처리하는 것이 처리량을 끌어올리는 핵심입니다. 그런데 여기에는 조건이 하나 붙습니다. 배치를 키우려면 요청마다 KV Cache가 GPU에 살아 있어야 합니다.

KV Cache는 흔히 "추론 속도를 올리는 캐시" 정도로 소개됩니다. 하지만 실제로는 그 이상의 역할을 합니다. 진행 중인 모든 요청이 각자의 KV Cache를 메모리에 들고 있어야 하고, 이 캐시들을 어떻게 다루느냐가 서빙 시스템 설계의 중심이 되기 때문입니다. 이 글에서는 KV Cache가 정확히 무슨 일을 하는지, 그리고 왜 이것이 서빙 시스템의 중심에 놓이는지 살펴봅니다.

<br>

## KV Cache가 하는 일

먼저 KV Cache가 없다고 생각해봅시다. decode 스텝마다 모델은 지금까지의 토큰 전체를 입력으로 받아 다음 토큰을 예측합니다. 이때 attention은 현재 토큰의 Query 벡터를 앞선 모든 토큰의 Key 벡터와 곱하고, 그 결과로 Value 벡터들을 가중합해서 다음 토큰의 실마리를 만듭니다.

여기서 결정적인 사실이 하나 있습니다. **각 토큰의 Key와 Value는 한 번 계산되면 변하지 않습니다.** 3번째 토큰의 K, V는 4번째 토큰을 만들 때도, 100번째 토큰을 만들 때도 똑같습니다. 그런데 캐시가 없으면 매 스텝마다 이 K, V들을 처음부터 다시 계산해야 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 360 200" style="width: 100%; height: auto; max-width: 360px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="캐시가 없을 때 매 스텝마다 앞선 토큰의 K, V를 다시 계산하는 모습">
  <style>
    .kv1-title { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .kv1-step  { fill: var(--text-muted, #78716c); font-size: 13px; }
    .kv1-new   { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .kv1-redo  { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.5; }
    .kv1-lab   { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .kv1-labr  { fill: var(--text-danger, #dc2626); font-size: 16px; text-anchor: middle; }
    .kv1-leg   { fill: var(--text-muted, #78716c); font-size: 13px; }
  </style>
  <text x="180" y="22" class="kv1-title">캐시 없이: 앞부분을 매번 다시 계산</text>
  <text x="12" y="64" class="kv1-step">스텝 1</text>
  <rect x="62" y="42" width="86" height="34" rx="6" class="kv1-new"/>
  <text x="105" y="64" class="kv1-lab">K1 V1</text>
  <text x="12" y="106" class="kv1-step">스텝 2</text>
  <rect x="62" y="84" width="86" height="34" rx="6" class="kv1-redo"/>
  <text x="105" y="106" class="kv1-labr">K1 V1</text>
  <rect x="156" y="84" width="86" height="34" rx="6" class="kv1-new"/>
  <text x="199" y="106" class="kv1-lab">K2 V2</text>
  <text x="12" y="148" class="kv1-step">스텝 3</text>
  <rect x="62" y="126" width="86" height="34" rx="6" class="kv1-redo"/>
  <text x="105" y="148" class="kv1-labr">K1 V1</text>
  <rect x="156" y="126" width="86" height="34" rx="6" class="kv1-redo"/>
  <text x="199" y="148" class="kv1-labr">K2 V2</text>
  <rect x="250" y="126" width="86" height="34" rx="6" class="kv1-new"/>
  <text x="293" y="148" class="kv1-lab">K3 V3</text>
  <rect x="64" y="170" width="13" height="13" rx="3" class="kv1-new"/>
  <text x="83" y="181" class="kv1-leg">새로 계산</text>
  <rect x="160" y="170" width="13" height="13" rx="3" class="kv1-redo"/>
  <text x="179" y="181" class="kv1-leg">다시 계산 (낭비)</text>
</svg>
</div>

토큰이 t개인 스텝에서 K, V를 t개 계산하고, 이걸 생성 길이만큼 반복하니, 새로 계산하는 K, V만 세어도 전체가 **O(n²)** 입니다. 그중 대부분이 이미 했던 계산의 반복이죠.

KV Cache는 이 낭비를 없앱니다. 각 토큰의 K, V를 처음 계산할 때 저장해두고, 다음 스텝부터는 **새 토큰 하나의 K, V만 계산**해 캐시에 덧붙입니다. attention은 저장된 캐시를 읽기만 하면 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 360 200" style="width: 100%; height: auto; max-width: 360px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="KV Cache를 쓸 때 앞선 토큰은 캐시에서 읽고 새 토큰의 K, V만 계산하는 모습">
  <style>
    .kv2-title { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .kv2-step  { fill: var(--text-muted, #78716c); font-size: 13px; }
    .kv2-new   { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .kv2-hit   { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.5; }
    .kv2-lab   { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .kv2-labh  { fill: var(--text-success, #16a34a); font-size: 16px; text-anchor: middle; }
    .kv2-leg   { fill: var(--text-muted, #78716c); font-size: 13px; }
  </style>
  <text x="180" y="22" class="kv2-title">KV Cache: 앞부분은 캐시에서 읽기</text>
  <text x="12" y="64" class="kv2-step">스텝 1</text>
  <rect x="62" y="42" width="86" height="34" rx="6" class="kv2-new"/>
  <text x="105" y="64" class="kv2-lab">K1 V1</text>
  <text x="12" y="106" class="kv2-step">스텝 2</text>
  <rect x="62" y="84" width="86" height="34" rx="6" class="kv2-hit"/>
  <text x="105" y="106" class="kv2-labh">K1 V1</text>
  <rect x="156" y="84" width="86" height="34" rx="6" class="kv2-new"/>
  <text x="199" y="106" class="kv2-lab">K2 V2</text>
  <text x="12" y="148" class="kv2-step">스텝 3</text>
  <rect x="62" y="126" width="86" height="34" rx="6" class="kv2-hit"/>
  <text x="105" y="148" class="kv2-labh">K1 V1</text>
  <rect x="156" y="126" width="86" height="34" rx="6" class="kv2-hit"/>
  <text x="199" y="148" class="kv2-labh">K2 V2</text>
  <rect x="250" y="126" width="86" height="34" rx="6" class="kv2-new"/>
  <text x="293" y="148" class="kv2-lab">K3 V3</text>
  <rect x="60" y="170" width="13" height="13" rx="3" class="kv2-new"/>
  <text x="79" y="181" class="kv2-leg">새로 계산</text>
  <rect x="156" y="170" width="13" height="13" rx="3" class="kv2-hit"/>
  <text x="175" y="181" class="kv2-leg">캐시에서 읽기</text>
</svg>
</div>

이렇게 하면 스텝당 새로 계산하는 K, V가 토큰 하나로 고정되어 전체가 **O(n)** 이 됩니다. 이 차이가 있어야 자기회귀 생성이 현실적인 속도로 돌아갑니다. KV Cache가 없으면 긴 텍스트 생성은 계산량이 제곱으로 불어나 사실상 불가능합니다. 다만 모든 비용이 선형이 되는 것은 아닙니다. attention은 캐시가 있어도 스텝마다 지금까지 쌓인 K, V를 전부 훑어야 해서, 이 부분만은 컨텍스트가 길어질수록 함께 무거워집니다.

그리고 여기서 KV Cache의 진짜 정체가 드러납니다. **KV Cache는 그 요청의 "상태(state)"입니다.** 생성이 이어지는 한 계속 GPU에 들고 있어야 하는, 그 요청이 지금까지 쌓아온 진행 상태인 셈입니다.

<br>

## 요청이 끝날 때까지 자리를 차지한다

KV Cache가 요청의 상태라는 게 왜 중요한지는, 익숙한 서버와 비교해보면 분명해집니다.

흔한 이미지 분류 서버를 떠올려봅시다. 요청이 들어오면 계산 한 번 하고 결과를 돌려주면 끝입니다. 처리가 끝난 요청은 메모리에서 깨끗이 사라지고, 서버는 곧바로 다음 요청을 받습니다. 요청과 요청 사이에 서버가 붙들고 있어야 할 것이 없습니다.

LLM은 그렇지 않습니다. 한 요청이 100 토큰을 생성한다면, 그 100번의 스텝 내내 그 요청의 KV Cache가 GPU에 자리를 잡고 앉아 있어야 합니다. 토큰이 하나 늘 때마다 캐시도 조금씩 자라고요. **요청 하나가 응답을 마칠 때까지 GPU 메모리 한 자리를 계속 차지하고 앉아 있는 셈입니다.**

그리고 서버는 이런 요청을 한 번에 수십 개씩 돌립니다. 그러면 GPU 안에서는 진행 중인 요청 수십 개의 캐시가 동시에 자리를 차지한 채 저마다 자라나고 있습니다.

여기서 배칭과 맞물립니다. decode가 memory-bound인 이상 처리량을 올리려면 배치를 키워야 하는데, 배치를 키운다는 건 결국 이 캐시들을 GPU에 더 많이 올린다는 뜻입니다. 커지고 길이도 제각각인 이 캐시들을 한정된 메모리에 욱여넣다가, 자리가 다 차면 더는 새 요청을 받지 못하고 뒤에 온 요청은 기다립니다.

:::info

**핵심**

LLM 서빙 시스템 설계의 상당 부분이 "KV Cache를 어떻게 관리하느냐"로 귀결됩니다. 앞으로 다룰 PagedAttention, continuous batching, prefix caching이 전부 이 하나의 자원을 둘러싸고 도는 이유가 여기에 있습니다.

:::

<br>

## 그 대가는 메모리다

이 캐시들을 메모리에 담아내는 게 서빙의 과제라면, 자연히 따라오는 질문이 있습니다. 이 캐시는 실제로 메모리를 얼마나 쓸까요?

토큰마다 모든 레이어에 걸쳐 K, V 벡터가 쌓이니, 요청 하나의 캐시는 시퀀스가 길어질수록 커집니다. 토큰 하나가 차지하는 크기는 모델 config만 있으면 바로 나옵니다.

```text
토큰당 KV = 2(K, V) × 레이어 수 × KV head 수 × head_dim × dtype 바이트
```

맨 앞의 2는 K와 V를 각각 한 벌씩 저장하기 때문에 붙습니다. 이 식에 파라미터 총량이 등장하지 않는다는 점이 중요합니다. 가중치의 상당 부분을 차지하는 FFN은 KV를 전혀 남기지 않아서, 파라미터가 더 큰 모델이 토큰당 KV는 오히려 더 작은 경우도 흔합니다. 값을 넣어보면 요즘 모델에서 흔한 수천 토큰짜리 요청 하나는 대략 수백 MB에서 1~2 GiB 정도입니다. 요청 하나만 보면 큰 부담은 아닙니다.

문제는 이게 **요청마다** 쌓이고, 가중치를 뺀 나머지 공간을 모든 요청이 나눠 쓴다는 점입니다. 가중치는 모델을 올리는 순간 정해지는 고정분이고, 그 나머지가 KV Cache의 몫입니다. 동시 요청이 늘거나 컨텍스트가 길어지면 이 공간을 금세 채우고, 다 차면 새 요청은 기다리거나 밀려납니다(preemption). 배치가 무한정 커지지 못하는 이유가 이것입니다.

그래서 요즘 모델들은 이 한정된 공간을 덜 잡아먹도록, KV Cache를 애초에 작게 유지하는 방향으로 설계됩니다. Gemma를 포함한 최신 오픈 모델이 기본으로 다는 GQA나 슬라이딩 윈도우 어텐션이 그런 장치입니다. GQA는 위 식의 KV head 수를 줄입니다. query head 여러 개가 K, V 한 벌을 나눠 쓰게 해서, 레이어 수와 head_dim이 같아도 토큰당 KV를 몇 분의 일로 낮춥니다. 슬라이딩 윈도우는 그 어텐션을 쓰는 레이어가 최근 윈도우 길이만큼만 캐시를 들고 있게 해서, 컨텍스트가 길어져도 그 레이어의 KV는 더 자라지 않게 만듭니다.

<br>

## 마치며

KV Cache는 단순한 속도 최적화가 아닙니다. 요청이 응답을 마칠 때까지 GPU에 자리를 차지하게 만들고, 진행 중인 요청 전부의 캐시를 동시에 들고 있어야 하는 부담을 서버에 지웁니다. 그래서 서빙 시스템 설계의 상당 부분이 이 한정된 공간을 얼마나 알뜰하게 쓰느냐를 두고 씨름합니다.

그런데 vLLM 이전의 서빙 시스템들은 정반대였습니다. 이 귀한 공간의 60~80%를 단편화로 흘려버리고 있었습니다. 다음 글에서는 그 낭비가 어디서 왔는지, 그리고 vLLM의 PagedAttention이 운영체제의 가상 메모리에서 아이디어를 빌려 이 문제를 어떻게 풀었는지 살펴봅니다.

<br>

## 참고자료

- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180)
- [Transformer Inference Arithmetic (kipply's blog)](https://kipp.ly/transformer-inference-arithmetic/)
- [Mastering LLM Techniques: Inference Optimization (NVIDIA Technical Blog)](https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/)
