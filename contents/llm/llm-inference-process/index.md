---
date: '2026-07-06'
title: 'Prefill과 Decode로 이해하는 LLM 추론 과정'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 1
tags: ['LLM Serving', 'vLLM', 'Prefill', 'Decode', 'LLM Inference']
summary: 'LLM이 토큰을 하나씩 생성하는 추론 과정을 Prefill과 Decode 두 단계로 나눠 살펴봅니다. compute-bound와 memory-bound의 비대칭이 왜 모든 서빙 최적화의 출발점이 되는지 정리합니다.'
thumbnail: './thumbnail.png'
---

vLLM으로 모델을 서빙하다 보면 이상한 현상을 하나 발견하게 됩니다. 프롬프트가 길수록 첫 토큰이 나올 때까지의 시간은 눈에 띄게 길어지는데, 일단 첫 토큰이 나오기 시작하면 그 뒤로는 프롬프트 길이와 무관하게 또박또박 일정한 속도로 흘러나옵니다. 반대로 GPU 모니터링을 켜보면 토큰이 잘 나오고 있는데도 GPU 연산 사용률은 생각보다 낮게 찍히는 구간이 있습니다.

이 두 현상은 같은 원인에서 나옵니다. LLM 추론이 성격이 완전히 다른 **두 단계**로 이루어져 있기 때문입니다. 이 글에서는 LLM이 텍스트를 생성하는 과정을 Prefill과 Decode로 나눠서 뜯어보고, 두 단계의 병목이 왜 다른지, 그리고 이 비대칭이 왜 LLM 서빙 최적화 전체의 출발점인지 정리합니다.

이 시리즈는 vLLM을 중심으로 LLM 서빙을 원리부터 다룹니다. "이 플래그를 켜면 빨라진다"가 아니라 "엔진이 이렇게 동작하니까 이 설정이 이런 효과를 낸다"를 목표로 합니다.

<br>

## LLM은 한 번에 한 토큰씩 생성한다

먼저 생성 과정 자체를 봅시다. LLM은 문장을 통째로 만들지 않습니다. **자기회귀(Autoregressive)** 방식, 즉 지금까지의 토큰 전체를 입력으로 받아 "다음 토큰 하나"를 예측하는 일을 반복합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 344" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="자기회귀 생성 과정. 입력 한국의 수도는에서 시작해 스텝마다 토큰을 하나씩 예측하고, 그 토큰을 시퀀스 끝에 붙여 다시 입력으로 넣는 과정을 3스텝에 걸쳐 보여준다. 최종 출력은 서울입니다.">
  <style>
    .sv1-chip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .sv1-new  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #d97706); stroke-width: 1.5; }
    .sv1-out  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .sv1-t    { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .sv1-sub  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .sv1-cap  { fill: var(--text-muted, #78716c); font-size: 18px; text-anchor: middle; }
    .sv1-ar   { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#sv1Arrow); }
  </style>
  <defs>
    <marker id="sv1Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <text x="240" y="26" class="sv1-cap">입력: “한국의 수도는”</text>
  <!-- Step 1 -->
  <text x="16" y="58" class="sv1-sub">Step 1</text>
  <rect x="16" y="66" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="53" y="93" class="sv1-t">한국의</text>
  <rect x="98" y="66" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="135" y="93" class="sv1-t">수도는</text>
  <path d="M178,86 L202,86" class="sv1-ar"/>
  <rect x="208" y="66" width="56" height="40" rx="6" class="sv1-new"/>
  <text x="236" y="93" class="sv1-t">서울</text>
  <!-- Step 2 -->
  <text x="16" y="138" class="sv1-sub">Step 2</text>
  <rect x="16" y="146" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="53" y="173" class="sv1-t">한국의</text>
  <rect x="98" y="146" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="135" y="173" class="sv1-t">수도는</text>
  <rect x="180" y="146" width="56" height="40" rx="6" class="sv1-new"/>
  <text x="208" y="173" class="sv1-t">서울</text>
  <path d="M242,166 L266,166" class="sv1-ar"/>
  <rect x="272" y="146" width="74" height="40" rx="6" class="sv1-new"/>
  <text x="309" y="173" class="sv1-t">입니다</text>
  <!-- Step 3 -->
  <text x="16" y="218" class="sv1-sub">Step 3</text>
  <rect x="16" y="226" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="53" y="253" class="sv1-t">한국의</text>
  <rect x="98" y="226" width="74" height="40" rx="6" class="sv1-chip"/>
  <text x="135" y="253" class="sv1-t">수도는</text>
  <rect x="180" y="226" width="56" height="40" rx="6" class="sv1-new"/>
  <text x="208" y="253" class="sv1-t">서울</text>
  <rect x="244" y="226" width="74" height="40" rx="6" class="sv1-new"/>
  <text x="281" y="253" class="sv1-t">입니다</text>
  <path d="M324,246 L348,246" class="sv1-ar"/>
  <rect x="354" y="226" width="72" height="40" rx="6" class="sv1-new"/>
  <text x="390" y="253" class="sv1-t">&lt;EOS&gt;</text>
  <!-- 최종 출력 -->
  <path d="M240,272 L240,290" class="sv1-ar"/>
  <rect x="130" y="294" width="220" height="46" rx="8" class="sv1-out"/>
  <text x="240" y="324" class="sv1-t">출력: “서울입니다”</text>
</svg>
</div>

한 번의 forward pass가 하는 일은 정확히 하나입니다. 현재까지의 토큰 시퀀스를 받아서, 어휘 사전(vocabulary) 전체에 대한 확률 분포를 출력하는 것. 그 분포에서 토큰 하나를 뽑고(greedy든 sampling이든), 뽑힌 토큰을 시퀀스 끝에 붙여서 다시 모델에 넣습니다. `<EOS>`(생성 종료 토큰)가 나오거나 `max_tokens`에 도달할 때까지 이 루프가 돕니다.

여기서 서빙 관점의 첫 번째 핵심이 나옵니다.

> **출력 토큰 100개를 만들려면 forward pass가 100번 필요합니다.** LLM 추론의 비용은 "요청 1건"이 아니라 "토큰 1개" 단위로 발생합니다.

일반적인 ML 모델 서빙(이미지 분류, 추천 스코어링)은 요청 1건에 forward pass 1번, 실행 시간도 거의 일정합니다. LLM은 출력이 몇 토큰이 될지 실행 전에는 아무도 모르고, 요청 하나가 forward pass 수백 번으로 이어집니다. LLM 서빙이 기존 모델 서빙과 근본적으로 다른 문제인 이유가 여기서 시작됩니다.

<br>

## 왜 KV Cache가 필요할까

그런데 위 루프를 그대로 구현하면 심각한 낭비가 생깁니다. Step 2에서 모델은 `[한국의, 수도는, 서울]`을 처리하는데, 이 중 `[한국의, 수도는]` 부분의 attention 계산은 Step 1에서 이미 했던 것과 동일합니다. 시퀀스가 길어질수록 매 스텝마다 "이미 했던 계산"을 처음부터 다시 하는 셈입니다.

그래서 모든 추론 엔진은 각 토큰의 attention 중간 결과물인 **Key와 Value 벡터를 저장해두고 재사용**합니다. 이것이 **KV Cache**입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 410" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="KV Cache 유무 비교. 캐시가 없으면 스텝마다 재계산량을 나타내는 막대가 계속 길어지고, 캐시를 쓰면 새로 계산하는 막대 길이가 스텝마다 동일하게 유지되며 이전 토큰의 K와 V는 KV Cache에서 읽어온다.">
  <style>
    .kv1-barA  { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.5; }
    .kv1-barB  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .kv1-box   { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .kv1-hA    { fill: var(--text-danger, #dc2626); font-size: 22px; }
    .kv1-hB    { fill: var(--primary, #0d9488); font-size: 22px; }
    .kv1-noteA { fill: var(--text-danger, #dc2626); font-size: 17px; }
    .kv1-noteB { fill: var(--primary, #0d9488); font-size: 17px; }
    .kv1-lab   { fill: var(--text-muted, #78716c); font-size: 17px; }
    .kv1-t     { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .kv1-sub   { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .kv1-ar    { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none;
                 stroke-dasharray: 4 3; marker-end: url(#kv1Arrow); }
  </style>
  <defs>
    <marker id="kv1Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <!-- KV Cache 없이 -->
  <text x="16" y="28" class="kv1-hA">KV Cache 없이</text>
  <text x="16" y="63" class="kv1-lab">Step 1</text>
  <rect x="80" y="46" width="44" height="22" rx="4" class="kv1-barA"/>
  <text x="16" y="93" class="kv1-lab">Step 2</text>
  <rect x="80" y="76" width="88" height="22" rx="4" class="kv1-barA"/>
  <text x="16" y="123" class="kv1-lab">Step 3</text>
  <rect x="80" y="106" width="132" height="22" rx="4" class="kv1-barA"/>
  <text x="16" y="153" class="kv1-lab">Step 4</text>
  <rect x="80" y="136" width="176" height="22" rx="4" class="kv1-barA"/>
  <text x="266" y="153" class="kv1-lab">토큰 4개 전체 재계산</text>
  <text x="80" y="188" class="kv1-noteA">스텝당 비용이 계속 증가</text>
  <line x1="16" y1="210" x2="464" y2="210" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <!-- KV Cache 사용 -->
  <text x="16" y="242" class="kv1-hB">KV Cache 사용</text>
  <text x="16" y="275" class="kv1-lab">Step 1</text>
  <rect x="80" y="258" width="44" height="22" rx="4" class="kv1-barB"/>
  <text x="134" y="275" class="kv1-lab">새 토큰만 계산</text>
  <text x="16" y="305" class="kv1-lab">Step 2</text>
  <rect x="80" y="288" width="44" height="22" rx="4" class="kv1-barB"/>
  <text x="16" y="335" class="kv1-lab">Step 3</text>
  <rect x="80" y="318" width="44" height="22" rx="4" class="kv1-barB"/>
  <text x="16" y="365" class="kv1-lab">Step 4</text>
  <rect x="80" y="348" width="44" height="22" rx="4" class="kv1-barB"/>
  <rect x="270" y="256" width="180" height="116" rx="8" class="kv1-box"/>
  <text x="360" y="306" class="kv1-t">KV Cache</text>
  <text x="360" y="334" class="kv1-sub">이전 K, V 재사용</text>
  <path d="M266,299 L132,299" class="kv1-ar"/>
  <path d="M266,329 L132,329" class="kv1-ar"/>
  <path d="M266,359 L132,359" class="kv1-ar"/>
  <text x="80" y="396" class="kv1-noteB">스텝당 계산량 거의 일정</text>
</svg>
</div>

KV Cache 덕분에 decode 스텝의 계산량은 시퀀스 길이와 무관하게 "새 토큰 1개 분량"으로 고정됩니다. 대신 그 대가로 **요청마다 GPU 메모리에 상태(state)를 유지**해야 합니다. 대화가 길어질수록, 동시 요청이 많아질수록 이 캐시가 GPU 메모리를 잠식합니다.

지금은 "재계산을 피하려고 K, V를 저장해둔다" 정도만 기억하면 됩니다. 이 캐시가 정확히 어떻게 동작하고 서빙을 어떻게 바꾸는지는 다음 글에서 이어집니다.

<br>

## Prefill: 프롬프트를 한 번에 처리하는 단계

이제 요청 하나의 생애를 시간순으로 따라가 봅시다. 사용자가 1,000토큰짜리 프롬프트를 보냈습니다. 생성 루프에 들어가기 전에, 모델은 먼저 이 1,000개 토큰의 KV Cache를 만들어야 합니다. 이 단계가 **Prefill**입니다.

다행히 prefill은 한 토큰씩 순서대로 할 필요가 없습니다. 프롬프트의 토큰들은 이미 전부 주어져 있으므로, Transformer는 1,000개 토큰을 **한 번의 forward pass에서 병렬로** 처리합니다. 이 한 번의 pass에서 두 가지가 나옵니다.

- 1,000개 토큰 전체의 KV Cache
- 마지막 토큰 위치의 출력, 즉 **첫 번째 생성 토큰**

사용자가 체감하는 **TTFT(Time To First Token, 첫 토큰까지의 시간)** 는 사실상 이 prefill이 결정합니다. 프롬프트가 길수록 첫 토큰이 늦게 나오는 이유가 이것입니다. 처리할 토큰이 많으니 병렬로 처리해도 절대 연산량 자체가 커지기 때문입니다.

중요한 것은 이 단계의 **성격**입니다. 수천 개 토큰의 행렬 연산을 한꺼번에 수행하므로 GPU의 연산 유닛이 쉴 틈 없이 돌아갑니다. 즉 prefill은 **compute-bound**, 연산 능력이 병목인 단계입니다.

<br>

## Decode: 한 토큰씩 뽑아내는 단계

Prefill이 끝나면 생성 루프, 즉 **Decode** 단계에 들어갑니다. 매 스텝마다 직전에 생성된 토큰 1개를 입력으로 forward pass를 수행하고, KV Cache를 참조해 다음 토큰을 뽑습니다.

여기서 결정적인 비대칭이 나타납니다. 스텝당 처리하는 토큰은 딱 1개인데, 그 1개를 계산하기 위해 **모델 가중치 전체를 GPU 메모리(HBM)에서 연산 유닛으로 읽어와야** 합니다. 30B급 모델이 bf16이면 60GB가 넘는 데이터를 읽어서 고작 토큰 1개 분량의 연산을 하는 것입니다. 읽어온 데이터량 대비 연산량, 즉 **연산 강도(arithmetic intensity)** 가 극단적으로 낮습니다.

그래서 decode는 **memory-bound**, 메모리 대역폭이 병목인 단계입니다. GPU의 연산 유닛은 대부분의 시간을 데이터가 도착하기를 기다리며 놉니다. 도입부에서 말한 "토큰은 잘 나오는데 GPU 연산 사용률이 낮은" 현상의 정체가 바로 이것입니다.

얼마나 극단적인지 간단히 계산해볼 수 있습니다. [Gemma 4 31B](/llm/gemma4-architecture/) 같은 30B급 dense 모델을 bf16, 배치 1로 H100에서 돌린다면:

```text
모델 가중치:        약 31B 파라미터 × 2 bytes ≈ 62 GB
H100 메모리 대역폭:  약 3.35 TB/s

decode 스텝당 최소 시간 ≈ 62 GB ÷ 3.35 TB/s ≈ 18.5 ms
→ 이론상 최대 생성 속도 ≈ 1 / 18.5ms ≈ 초당 54 토큰
```

연산이 아무리 빨라도, 배치 1에서는 초당 54토큰 언저리가 물리적 상한입니다. GPU의 연산 성능(H100 bf16 기준 약 1,000 TFLOPS)은 이 계산에 등장조차 하지 않습니다. 병목이 연산이 아니라는 뜻입니다.

:::info

**참고**

실제로는 KV Cache 읽기가 추가되고 커널 효율이 100%가 아니므로 이 상한보다 느립니다. 하지만 "가중치 크기 ÷ 메모리 대역폭"은 배치 1 생성 속도의 감을 잡는 데 충분히 좋은 근사입니다. 자기 모델과 GPU로 직접 계산해보길 권합니다.

:::

<br>

## 두 단계의 비대칭이 서빙 문제를 정의한다

정리하면 요청 하나는 이렇게 흘러갑니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 552" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="요청 하나의 처리 흐름. 요청이 도착하면 요청당 한 번 실행되는 Prefill 단계가 프롬프트 전체를 병렬 처리해 KV Cache와 첫 토큰을 만들며 compute-bound라 TTFT를 결정한다. 이어서 출력 토큰 수만큼 반복되는 Decode 단계가 스텝당 토큰 하나씩 생성하며 memory-bound라 TPOT를 결정한다. 마지막에 응답이 완료된다.">
  <style>
    .pd1-pill  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pd1-box   { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pd1-title { fill: var(--text, #1c1917); font-size: 22px; }
    .pd1-pillt { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .pd1-meta  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .pd1-hotA  { fill: var(--accent, #d97706); font-size: 18px; }
    .pd1-hotB  { fill: var(--primary, #0d9488); font-size: 18px; }
    .pd1-ar    { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#pd1Arrow); }
  </style>
  <defs>
    <marker id="pd1Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <rect x="165" y="10" width="150" height="36" rx="18" class="pd1-pill"/>
  <text x="240" y="35" class="pd1-pillt">요청 도착</text>
  <path d="M240,48 L240,64" class="pd1-ar"/>
  <!-- Prefill -->
  <rect x="20" y="68" width="440" height="196" rx="10" class="pd1-box"/>
  <rect x="20" y="68" width="6" height="196" fill="var(--accent, #d97706)"/>
  <text x="46" y="100" class="pd1-title">Prefill</text>
  <text x="142" y="100" class="pd1-meta">요청당 1회</text>
  <text x="46" y="130" class="pd1-hotA">compute-bound</text>
  <text x="46" y="158" class="pd1-meta">TTFT(첫 토큰 지연) 결정</text>
  <text x="46" y="190" class="pd1-meta">프롬프트 전체를 병렬 처리</text>
  <text x="46" y="218" class="pd1-meta">KV Cache 생성</text>
  <text x="46" y="246" class="pd1-meta">첫 토큰 출력</text>
  <path d="M240,266 L240,282" class="pd1-ar"/>
  <!-- Decode -->
  <rect x="20" y="286" width="440" height="196" rx="10" class="pd1-box"/>
  <rect x="20" y="286" width="6" height="196" fill="var(--primary, #0d9488)"/>
  <text x="46" y="318" class="pd1-title">Decode</text>
  <text x="142" y="318" class="pd1-meta">토큰 수만큼 반복</text>
  <text x="46" y="348" class="pd1-hotB">memory-bound</text>
  <text x="46" y="376" class="pd1-meta">TPOT(토큰당 시간) 결정</text>
  <text x="46" y="408" class="pd1-meta">스텝당 토큰 1개 생성</text>
  <text x="46" y="436" class="pd1-meta">KV Cache 참조 + 추가</text>
  <text x="46" y="464" class="pd1-meta">&lt;EOS&gt;까지 반복</text>
  <path d="M240,484 L240,500" class="pd1-ar"/>
  <rect x="165" y="504" width="150" height="36" rx="18" class="pd1-pill"/>
  <text x="240" y="529" class="pd1-pillt">응답 완료</text>
</svg>
</div>

| 구분 | Prefill | Decode |
|------|---------|--------|
| 처리 단위 | 프롬프트 전체 (병렬) | 토큰 1개씩 (순차) |
| 횟수 | 요청당 1회 | 출력 토큰 수만큼 |
| 병목 | 연산 (compute-bound) | 메모리 대역폭 (memory-bound) |
| 결정하는 지표 | TTFT (첫 토큰 지연) | TPOT (토큰당 생성 시간) |
| GPU 연산 사용률 | 높음 | 낮음 |

같은 모델, 같은 GPU, 같은 요청 안에서 병목이 연산에서 메모리 대역폭으로 바뀝니다. 하나의 하드웨어에서 성격이 정반대인 두 워크로드를 번갈아 실행하는 셈입니다. 이 비대칭을 이해하면 서빙 최적화 기법들이 전부 "어느 단계의 어떤 병목을 공략하는가"로 읽히기 시작합니다.

<br>

### 그래서 배칭이 답이 된다

decode가 memory-bound라는 사실에서 곧바로 따라 나오는 결론이 하나 있습니다. 어차피 토큰 1개를 위해 가중치 62GB를 읽어야 한다면, **그 한 번의 읽기로 여러 요청의 토큰을 동시에 계산하면** 어떨까요?

요청 8개를 배치로 묶어 decode하면, 가중치는 똑같이 한 번 읽으면서 토큰은 8개가 나옵니다. 메모리 읽기 비용은 그대로인데 처리량은 8배에 가깝게 늘어납니다. 노는 연산 유닛에 일을 주는 것이므로, 배치가 어느 수준에 이르기 전까지는 개별 요청의 속도 저하도 크지 않습니다.

> Decode가 memory-bound이기 때문에, **배칭은 LLM 서빙에서 거의 공짜 점심입니다.** 처리량을 높이는 첫 번째 수단이 "더 좋은 GPU"가 아니라 "더 큰 배치"인 이유입니다.

물론 공짜에는 조건이 붙습니다. 배치에 들어온 요청 수만큼 KV Cache가 GPU 메모리에 동시에 살아 있어야 합니다. 배치를 키우는 능력은 결국 KV Cache를 담을 메모리에서 나옵니다. 그리고 요청마다 출력 길이가 달라서, 배치를 "언제 묶고 언제 풀지"도 일반 배칭처럼 단순하지 않습니다. 먼저 끝난 요청의 자리를 비워두지 않고 대기 중인 요청으로 곧바로 채우는 continuous batching이 vLLM에서 이 문제를 풀어냅니다.

<br>

## 이 프레임으로 서빙 문제를 다시 보면

이 글의 프레임, **"compute-bound한 prefill, memory-bound한 decode"** 는 이 시리즈 전체에서 계속 재사용됩니다. 몇 가지 예를 미리 보면:

- **긴 프롬프트가 들어오면 다른 요청들의 생성이 순간 버벅인다**: 무거운 compute-bound 작업(prefill)이 가벼운 memory-bound 작업들(decode) 사이에 끼어들었기 때문입니다. vLLM의 chunked prefill이 공략하는 지점입니다.
- **양자화가 생성 속도를 높인다**: 가중치가 절반으로 줄면 decode에서 읽을 데이터도 절반이 됩니다. memory-bound 단계에서는 데이터 크기 감소가 곧 속도입니다.
- **Speculative decoding이 성립한다**: decode에서 노는 연산 유닛에 "후보 토큰 여러 개의 검증"이라는 일을 공짜로 시킬 수 있기 때문입니다.

어떤 최적화 기법을 만나든 "이건 어느 단계의, 어떤 병목을 공략하는 건가?"라고 물으면 대부분 답이 나옵니다.

<br>

## 마치며

프롬프트가 길면 첫 토큰이 늦는 이유(prefill의 연산량), 생성 중 GPU 연산 사용률이 낮은 이유(decode의 메모리 병목), 그리고 배칭이 처리량의 핵심인 이유까지, 모두 추론이 두 단계로 나뉜다는 사실 하나에서 나왔습니다. 이 프레임만 잡혀 있어도 vLLM의 설정 이름들이 다르게 보이기 시작할 겁니다.

그런데 배칭 이야기의 끝에서 조건이 하나 붙었습니다. 배치를 키우려면 요청 수만큼의 KV Cache가 GPU 메모리에 살아 있어야 한다는 것. 이 KV Cache는 대체 무엇이고, 왜 이것이 서빙 시스템의 중심에 놓이게 될까요? 다음 글에서는 KV Cache가 어떻게 동작하고, 이것이 LLM 서빙을 어떻게 바꾸는지 살펴봅니다.

<br>

## 참고자료

- [vLLM Documentation - Optimization and Tuning](https://docs.vllm.ai/en/latest/configuration/optimization/)
- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180)
- [Mastering LLM Techniques: Inference Optimization (NVIDIA Technical Blog)](https://developer.nvidia.com/blog/mastering-llm-techniques-inference-optimization/)
- [Sarathi-Serve: Taming Throughput-Latency Tradeoff in LLM Inference (Agrawal et al., 2024)](https://arxiv.org/abs/2403.02310)
