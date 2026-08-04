---
date: '2026-06-26'
title: 'Gemma 4 아키텍처 총정리'
category: 'LLM'
tags: ['Gemma 4', 'MoE', 'Hybrid Attention', 'Multimodal', 'Open Source LLM']
summary: 'Google의 오픈소스 모델 Gemma 4의 아키텍처를 깊이 파헤칩니다. 하이브리드 어텐션, PLE, 128개 전문가 MoE, 인코더 프리 멀티모달까지 핵심 혁신을 Gemma 3 대비 발전 포인트와 함께 분석합니다.'
thumbnail: './thumbnail.png'
---

2026년 4월 2일, Google은 Gemma 4를 공개했습니다. Gemini 3의 연구 성과를 오픈소스로 내린 이 모델 패밀리는 "파라미터당 지능(intelligence-per-parameter)"을 극대화하겠다는 명확한 설계 목표를 가지고 있습니다. 그리고 이번에는 Apache 2.0 라이선스를 채택하면서, 이전 Gemma 시리즈의 커스텀 라이선스가 걸림돌이었던 상업적 활용 문제까지 한 번에 해결했습니다.

그런데 Gemma 4가 흥미로운 건 라이선스 변경 때문만이 아닙니다. 하나의 모델 패밀리 안에 Dense, MoE, 인코더 프리(encoder-free) 아키텍처를 동시에 담으면서, 2B급 엣지 모델부터 31B Dense 모델까지 하나의 설계 철학으로 관통하는 구조를 만들어냈습니다. 이 글에서는 Gemma 4의 5가지 변형이 공유하는 공통 아키텍처와 각 변형만의 차별점을 깊이 있게 살펴보겠습니다.

## 모델 라인업: 하나의 철학, 다섯 가지 변형

Gemma 4 패밀리는 총 5개의 변형으로 구성됩니다. 초기 출시(4월 2일)에는 4개 변형이 공개되었고, 12B Unified는 6월 3일에 추가되었습니다.

| 모델 | 총 파라미터 | 활성 파라미터 | 아키텍처 | 컨텍스트 | 멀티모달 |
|------|-----------|------------|---------|---------|---------|
| **E2B** | 5.1B | 2.3B | Dense + PLE | 128K | 텍스트, 이미지, 오디오 |
| **E4B** | 8B | 4.5B | Dense + PLE | 128K | 텍스트, 이미지, 오디오 |
| **12B Unified** | 11.95B | 11.95B | Dense, Encoder-free | 256K | 텍스트, 이미지, 오디오 |
| **26B A4B** | 25.2B | 3.8B | MoE (128 experts) | 256K | 텍스트, 이미지 |
| **31B** | 30.7B | 30.7B | Dense | 256K | 텍스트, 이미지 |

모든 모델이 262K 어휘(vocabulary) 크기를 공유하고, 140개 이상의 언어로 사전학습되었습니다. 35개 이상의 언어를 즉시 지원합니다.

이름에서 "E"는 Effective의 약자입니다. E2B는 총 파라미터가 5.1B이지만 임베딩을 제외한 유효 파라미터가 2.3B라는 의미로, 실제 추론 비용을 더 정확하게 반영합니다. 26B A4B도 같은 맥락입니다. 총 25.2B 파라미터를 가지지만, MoE 라우팅으로 토큰당 3.8B(약 4B)만 활성화됩니다.

:::info

**모델 선택 가이드**

E2B/E4B는 모바일, IoT, 브라우저 배포용입니다. 12B는 26B MoE에 근접한 성능을 절반 이하 메모리로 달성하면서 오디오까지 처리하는 "가성비" 모델입니다. 26B A4B는 MoE 특성상 토큰당 연산량이 적어 고처리량(high-throughput) 서빙에 유리합니다. 31B Dense는 단일 요청 품질이 가장 중요한 경우에 적합합니다.

:::

## 하이브리드 어텐션: 로컬과 글로벌의 교차 배치

Gemma 4의 어텐션은 로컬 레이어와 글로벌 레이어를 정해진 비율로 번갈아 쌓는 구조입니다. 이 교차 배치 자체는 Gemma 3에서 이미 쓰던 방식이고, Gemma 4에서 새로워진 것은 두 종류의 레이어에 서로 다른 헤드 차원을 준 것입니다.

### 로컬 레이어와 글로벌 레이어

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="로컬 레이어 다섯 개마다 글로벌 레이어 한 개가 오는 교차 배치와 각 레이어의 헤드 차원">
<style>
.ga-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.ga-l { fill: var(--text, #1c1917); font-size: 14px; }
.ga-w { fill: var(--on-fill, #14100e); font-size: 14px; }
.ga-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ga-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ga-g { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.ga-br { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
</style>
<text class="ga-t" x="200" y="22" text-anchor="middle">로컬 5개마다 글로벌 1개</text>
<rect class="ga-box" x="20" y="40" width="196" height="28" rx="5"/>
<text class="ga-l" x="32" y="59">Layer 0    로컬</text>
<rect class="ga-box" x="20" y="74" width="196" height="28" rx="5"/>
<text class="ga-l" x="32" y="93">Layer 1    로컬</text>
<rect class="ga-box" x="20" y="108" width="196" height="28" rx="5"/>
<text class="ga-l" x="32" y="127">Layer 2    로컬</text>
<rect class="ga-box" x="20" y="142" width="196" height="28" rx="5"/>
<text class="ga-l" x="32" y="161">Layer 3    로컬</text>
<rect class="ga-box" x="20" y="176" width="196" height="28" rx="5"/>
<text class="ga-l" x="32" y="195">Layer 4    로컬</text>
<path class="ga-br" d="M224 44 L232 44 L232 200 L224 200"/>
<text class="ga-n" x="240" y="110">head_dim 256</text>
<text class="ga-n" x="240" y="132">슬라이딩 윈도우</text>
<rect class="ga-g" x="20" y="216" width="196" height="28" rx="5"/>
<text class="ga-w" x="32" y="235">Layer 5    글로벌</text>
<path class="ga-br" d="M224 220 L232 220 L232 240 L224 240"/>
<text class="ga-n" x="240" y="226">head_dim 512</text>
<text class="ga-n" x="240" y="248">풀 어텐션</text>
<text class="ga-n" x="118" y="278" text-anchor="middle">⋮</text>
<rect class="ga-g" x="20" y="292" width="196" height="28" rx="5"/>
<text class="ga-w" x="32" y="311">마지막 레이어   글로벌</text>
<text class="ga-n" x="200" y="348" text-anchor="middle">마지막 레이어는 글로벌 고정</text>
<text class="ga-n" x="200" y="372" text-anchor="middle">E2B만 4:1 배치</text>
</svg>
</div>

**로컬 레이어**는 슬라이딩 윈도우 어텐션을 사용합니다. 각 토큰이 주변 일정 범위의 토큰만 참조하므로 연산량이 시퀀스 길이에 대해 선형적으로 증가합니다. 헤드 차원은 256입니다.

**글로벌 레이어**는 풀 어텐션(full attention)을 사용합니다. 시퀀스 전체를 참조하며, 헤드 차원은 512로 로컬의 2배입니다. 글로벌 레이어에서 더 큰 헤드 차원을 쓰는 이유는 먼 거리의 토큰 간 관계를 포착하려면 더 풍부한 표현 공간이 필요하기 때문입니다.

비율은 변형마다 다릅니다. E2B만 로컬 4개에 글로벌 1개이고, E4B를 포함한 나머지 네 변형은 로컬 5개에 글로벌 1개입니다. 그리고 어느 변형이든 마지막 레이어는 항상 글로벌입니다. 출력 직전에 시퀀스 전체를 한 번은 훑고 나가도록 강제하는 셈입니다.

이 설계의 핵심은 **효율과 표현력의 균형**입니다. 모든 레이어가 풀 어텐션을 사용하면 긴 시퀀스에서 메모리와 연산 비용이 급격히 증가합니다. 반면 모든 레이어가 슬라이딩 윈도우만 사용하면 문서 전반에 걸친 장거리 의존성을 놓치게 됩니다. 로컬과 글로벌을 교차 배치하면 로컬 레이어에서 지역적 패턴(구문, 문법)을 효율적으로 처리하고, 글로벌 레이어에서 문서 수준의 맥락을 잡아냅니다.

### Unified Keys and Values

글로벌 레이어에는 하나 더 흥미로운 최적화가 들어갑니다. **Unified Keys and Values**는 글로벌 어텐션 레이어에서 Key 텐서를 Value로 그대로 재사용하는 기법입니다. 즉 그 레이어에서는 K와 V가 같은 텐서입니다.

구현상으로는 글로벌 레이어의 V 프로젝션 행렬 자체가 사라집니다. `v_proj`가 `None`이 되고, 어텐션 계산에서 Value 자리에 Key를 그대로 집어넣습니다. 그러면 파라미터가 줄어드는 동시에, 그 레이어의 KV 캐시에서 V를 따로 저장할 필요가 없어집니다. 글로벌 레이어 하나만 놓고 보면 캐시가 절반이 되는 셈입니다. 기술 보고서는 이 기법의 KV 캐시 절감 효과를 37.5%로 밝히고 있습니다.

한 가지 헷갈리기 쉬운 지점이 있습니다. "여러 레이어가 KV를 공유한다"는 별개의 기법이고, 적용 대상도 다릅니다. 레이어 간 KV 공유는 E2B와 E4B에만 켜져 있고(각각 20개, 18개 레이어), 12B/26B/31B에서는 꺼져 있습니다. 반대로 K를 V로 재사용하는 Unified K/V는 12B/26B/31B에만 있고 E2B/E4B에는 없습니다.

:::note

**Gemma 3에서 실제로 달라진 것**

로컬과 글로벌의 5:1 교차 배치, 1024 토큰 슬라이딩 윈도우, 로컬 10,000 / 글로벌 1,000,000의 RoPE base는 Gemma 3이 이미 쓰던 구성입니다. Gemma 4에서 새로 들어온 것은 세 가지입니다. 로컬과 글로벌에 서로 다른 헤드 차원(256 대 512)을 준 것, 글로벌 레이어에서 K를 V로 재사용하는 것, 그리고 글로벌 레이어에만 p-RoPE를 적용한 것입니다.

:::

## Per-Layer Embeddings (PLE): 소형 모델의 표현력 극대화

E2B와 E4B 엣지 모델에는 **Per-Layer Embeddings(PLE)**라는 독특한 임베딩 기법이 적용됩니다. 일반적인 Transformer에서 입력 토큰은 하나의 임베딩 테이블을 거친 뒤 그 벡터가 모든 레이어를 순차적으로 통과합니다. PLE는 이 잔차 흐름을 그대로 두고, 레이어마다 그 레이어 전용의 작은 임베딩을 하나씩 더 얹습니다.

### 기존 방식과의 차이

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 340" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="잔차 흐름은 그대로 유지되고 레이어마다 전용 임베딩이 옆에서 추가로 주입되는 PLE 구조">
<style>
.pl-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.pl-l { fill: var(--text, #1c1917); font-size: 14px; }
.pl-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.pl-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pl-emb { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.pl-flow { stroke: var(--text, #1c1917); stroke-width: 2; fill: none; marker-end: url(#plArrow); }
.pl-inj { stroke: var(--accent, #9d5604); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#plArrowA); }
</style>
<defs>
<marker id="plArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text, #1c1917)"/>
</marker>
<marker id="plArrowA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--accent, #9d5604)"/>
</marker>
</defs>
<text class="pl-t" x="200" y="22" text-anchor="middle">레이어마다 더해지는 보조 임베딩</text>
<rect class="pl-box" x="150" y="38" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="58" text-anchor="middle">토큰</text>
<path class="pl-flow" d="M210 68 L210 84"/>
<rect class="pl-box" x="150" y="86" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="106" text-anchor="middle">공유 임베딩</text>
<path class="pl-flow" d="M210 116 L210 132"/>
<rect class="pl-box" x="150" y="134" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="154" text-anchor="middle">Layer 0</text>
<path class="pl-flow" d="M210 164 L210 180"/>
<rect class="pl-box" x="150" y="182" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="202" text-anchor="middle">Layer 1</text>
<path class="pl-flow" d="M210 212 L210 228"/>
<rect class="pl-box" x="150" y="230" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="250" text-anchor="middle">Layer 2</text>
<path class="pl-flow" d="M210 260 L210 276"/>
<rect class="pl-box" x="150" y="278" width="120" height="30" rx="5"/>
<text class="pl-l" x="210" y="298" text-anchor="middle">출력</text>
<rect class="pl-emb" x="20" y="134" width="106" height="30" rx="5"/>
<text class="pl-l" x="73" y="154" text-anchor="middle">L0 임베딩</text>
<path class="pl-inj" d="M126 149 L146 149"/>
<rect class="pl-emb" x="20" y="182" width="106" height="30" rx="5"/>
<text class="pl-l" x="73" y="202" text-anchor="middle">L1 임베딩</text>
<path class="pl-inj" d="M126 197 L146 197"/>
<rect class="pl-emb" x="20" y="230" width="106" height="30" rx="5"/>
<text class="pl-l" x="73" y="250" text-anchor="middle">L2 임베딩</text>
<path class="pl-inj" d="M126 245 L146 245"/>
<text class="pl-n" x="286" y="196">잔차 흐름</text>
<text class="pl-n" x="286" y="218">유지</text>
<text class="pl-n" x="200" y="330" text-anchor="middle">주황 점선 = PLE 추가 입력</text>
</svg>
</div>

각 레이어가 자체적인 임베딩 표현을 가지게 되면서, 동일한 파라미터 예산 안에서 더 다양한 표현을 만들어낼 수 있습니다. 이는 특히 파라미터 수가 제한된 소형 모델에서 의미가 큽니다. 2~4B 규모의 모델에서는 레이어 수를 무한정 늘릴 수 없고, 히든 차원도 제한되므로 같은 양의 파라미터를 더 효율적으로 활용하는 전략이 중요합니다.

PLE가 작동하는 원리를 직관적으로 이해하면 이렇습니다. 기존 방식에서는 하위 레이어(구문 분석)와 상위 레이어(의미 해석)가 동일한 초기 임베딩에서 출발합니다. PLE에서는 각 레이어가 자신의 역할에 맞게 조정된 입력을 추가로 받습니다. E2B의 총 파라미터가 5.1B이지만 유효 파라미터가 2.3B인 이유도 이 추가 임베딩 파라미터 때문입니다. E2B는 임베더 400M에 PLE 2,340M, E4B는 임베더 670M에 PLE 2,820M을 씁니다.

:::tip

**모바일 배포 시 메모리 산정**

PLE 파라미터는 모델의 연산 메모리 공간 밖에 두고 빠른 스토리지에 캐시했다가, 각 레이어를 실행하는 시점에 가져오도록 설계되어 있습니다. 그래서 가속기 메모리 예산은 총 파라미터(5.1B / 8B)가 아니라 유효 파라미터(2.3B / 4.5B) 쪽에 가깝습니다. 대신 저장 공간과 레이어별 로딩 대역폭은 총 파라미터 기준으로 확보해야 합니다.

:::

## 인코더 프리 아키텍처: 12B Unified의 과감한 설계

Gemma 4의 5개 변형 중 가장 아키텍처적으로 실험적인 모델이 바로 **12B Unified**입니다. 이 모델은 텍스트, 이미지, 오디오를 하나의 디코더(decoder-only) 모델에서 인코더 없이 처리합니다.

### 기존 멀티모달 아키텍처와의 비교

대부분의 멀티모달 LLM은 각 모달리티에 전용 인코더를 둡니다. Gemma 4에서도 12B를 제외한 네 변형은 모두 비전 인코더를 가지고 있습니다. E2B/E4B는 150M ViT, 26B와 31B는 550M ViT입니다. 여기에 E2B/E4B는 오디오용으로 USM 계열 Conformer 인코더(12레이어, 305M)를 하나 더 답니다. 전문 인코더가 높은 품질의 특징(feature)을 뽑아준다는 점에서 안정적이지만, 인코더마다 별도의 파라미터가 필요하고 모달리티 간 통합이 프로젝션 레이어에서 병목이 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전용 인코더를 거치는 기존 방식과 경량 투영만 거치는 12B의 인코더 프리 방식 비교">
<style>
.mm-t { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.mm-l { fill: var(--text, #1c1917); font-size: 14px; }
.mm-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.mm-w { fill: var(--on-fill, #14100e); font-size: 14px; }
.mm-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.mm-heavy { fill: var(--bg-muted, #eeecea); stroke: var(--text-muted, #6d6762); stroke-width: 1.5; }
.mm-lite { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.mm-llm { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.mm-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#mmArrow); }
.mm-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="mmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="mm-t" x="200" y="20" text-anchor="middle">인코더 기반 (12B 외 네 변형)</text>
<rect class="mm-box" x="16" y="34" width="76" height="30" rx="5"/>
<text class="mm-l" x="54" y="54" text-anchor="middle">이미지</text>
<path class="mm-a" d="M92 49 L104 49"/>
<rect class="mm-heavy" x="106" y="34" width="180" height="30" rx="5"/>
<text class="mm-l" x="196" y="54" text-anchor="middle">ViT 인코더 150~550M</text>
<path class="mm-a" d="M286 49 L298 49"/>
<rect class="mm-box" x="16" y="76" width="76" height="30" rx="5"/>
<text class="mm-l" x="54" y="96" text-anchor="middle">오디오</text>
<path class="mm-a" d="M92 91 L104 91"/>
<rect class="mm-heavy" x="106" y="76" width="180" height="30" rx="5"/>
<text class="mm-l" x="196" y="96" text-anchor="middle">Conformer 305M</text>
<path class="mm-a" d="M286 91 L298 91"/>
<rect class="mm-llm" x="300" y="34" width="84" height="72" rx="5"/>
<text class="mm-w" x="342" y="75" text-anchor="middle">LLM</text>
<line class="mm-div" x1="20" y1="132" x2="380" y2="132"/>
<text class="mm-t" x="200" y="164" text-anchor="middle">인코더 프리 (12B Unified)</text>
<rect class="mm-box" x="16" y="178" width="76" height="30" rx="5"/>
<text class="mm-l" x="54" y="198" text-anchor="middle">이미지</text>
<path class="mm-a" d="M92 193 L104 193"/>
<rect class="mm-lite" x="106" y="178" width="180" height="30" rx="5"/>
<text class="mm-l" x="196" y="198" text-anchor="middle">경량 임베딩 모듈</text>
<path class="mm-a" d="M286 193 L298 193"/>
<rect class="mm-box" x="16" y="220" width="76" height="30" rx="5"/>
<text class="mm-l" x="54" y="240" text-anchor="middle">오디오</text>
<path class="mm-a" d="M92 235 L104 235"/>
<rect class="mm-lite" x="106" y="220" width="180" height="30" rx="5"/>
<text class="mm-l" x="196" y="240" text-anchor="middle">원시 파형 직접 투영</text>
<path class="mm-a" d="M286 235 L298 235"/>
<rect class="mm-llm" x="300" y="178" width="84" height="72" rx="5"/>
<text class="mm-w" x="342" y="219" text-anchor="middle">LLM</text>
<text class="mm-n" x="200" y="288" text-anchor="middle">회색 = 전용 인코더, 초록 = 프로젝션만</text>
<text class="mm-n" x="200" y="310" text-anchor="middle">오디오 인코더는 E2B/E4B만</text>
</svg>
</div>

12B Unified는 이 구조를 근본적으로 바꿨습니다.

### 비전: ViT 인코더를 경량 모듈로 대체

비전 처리에서 무거운 인코더를 제거하고, **단일 행렬곱(matrix multiplication) + 위치 임베딩(positional embedding) + 정규화(normalization)**로 구성된 경량 임베딩 모듈을 사용합니다. 이미지 패치를 직접 LLM의 토큰 차원 공간에 매핑하는 셈입니다.

이 모델은 이미지당 토큰 수를 동적으로 조절하는 **동적 비전 토큰 예산**도 도입했습니다. 이미지 복잡도와 해상도에 따라 70, 140, 280, 560, 1120개 토큰 중 적절한 수를 할당합니다. 단순한 아이콘 이미지에 1120개 토큰을 낭비하지 않고, 복잡한 차트에는 충분한 토큰을 배정하는 것입니다.

### 오디오: 인코더 완전 제거

더 과감한 변화는 오디오 처리입니다. Conformer 인코더를 완전히 제거하고, **원시 16kHz 파형(raw waveform)을 텍스트 토큰 차원 공간에 직접 투영**합니다. 40ms 단위(16kHz에서 640 샘플)로 잘라 그대로 밀어 넣는 방식입니다. 음성 인식(ASR)이나 음성 번역 같은 태스크를 위해 별도의 음성 모델을 학습시킬 필요 없이, LLM 자체가 오디오 신호를 이해하도록 만든 것입니다.

현재 오디오 입력은 최대 30초까지 지원됩니다. 비디오는 모든 Gemma 4 모델에서 최대 60초(1fps)로 처리 가능합니다.

:::warning

**변형마다 지원 범위가 다릅니다**

인코더 프리 방식은 12B 변형에만 적용됩니다. E2B/E4B는 오디오에 USM 계열 Conformer 인코더를 사용하고, 26B와 31B는 오디오 입력을 아예 지원하지 않습니다. 배포 전에 대상 변형의 지원 범위를 반드시 확인해야 합니다.

:::

### 왜 인코더 프리인가?

인코더 프리 아키텍처의 장점은 세 가지입니다.

첫째, **파라미터 효율성**입니다. 전용 인코더를 제거하면 그만큼의 파라미터를 LLM 본체에 투자할 수 있습니다. 12B라는 제한된 파라미터 예산에서 인코더에 수백 M을 쓰는 대신, 전체를 디코더에 집중시킵니다.

둘째, **모달리티 간 정렬(alignment)**입니다. 모든 입력이 하나의 토큰 공간으로 통합되므로, 텍스트, 이미지, 오디오 간의 교차 참조가 자연스럽습니다. 인코더 + 프로젝션 방식에서는 모달리티 간 정보 손실이 프로젝션 레이어에서 발생할 수 있습니다.

셋째, **서빙 단순화**입니다. 인코더별로 다른 연산 그래프를 관리할 필요가 없으니, 추론 파이프라인이 깔끔해집니다.

물론 트레이드오프도 있습니다. 전용 인코더가 수십억 개의 이미지-텍스트 쌍으로 사전학습된 풍부한 시각적 표현을 제공하는 반면, 경량 임베딩 모듈은 LLM 사전학습 과정에서 시각적 이해를 함께 학습해야 합니다. 더 많은 학습 데이터와 더 정교한 학습 전략이 필요한 셈입니다.

## MoE 아키텍처: 128개 전문가, 3.8B 활성화

26B A4B는 Gemma 패밀리 최초의 **Mixture of Experts(MoE)** 모델입니다. 총 25.2B 파라미터를 가지지만, 각 토큰을 처리할 때 128개 전문가 중 8개만 선택하여 3.8B 파라미터만 활성화합니다.

### MoE 구성 상세

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 372" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="라우터가 전문가 128개 중 8개를 고르고 공유 전문가가 항상 더해지는 MoE 레이어 구조와 활성 파라미터 비율">
<style>
.mo-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.mo-l { fill: var(--text, #1c1917); font-size: 14px; }
.mo-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.mo-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.mo-route { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.mo-share { fill: var(--bg-subtle, #f5f4f2); stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 3; }
.mo-bar { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.mo-fill { fill: var(--primary, #0a756c); }
.mo-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#moArrow); }
</style>
<defs>
<marker id="moArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="mo-t" x="200" y="22" text-anchor="middle">26B A4B MoE 레이어</text>
<rect class="mo-box" x="120" y="36" width="160" height="30" rx="5"/>
<text class="mo-l" x="200" y="56" text-anchor="middle">하이브리드 어텐션</text>
<path class="mo-a" d="M200 66 L200 82"/>
<rect class="mo-route" x="120" y="84" width="160" height="30" rx="5"/>
<text class="mo-l" x="200" y="104" text-anchor="middle">라우터 (top-8)</text>
<path class="mo-a" d="M200 114 L200 130"/>
<rect class="mo-box" x="20" y="132" width="360" height="46" rx="5"/>
<text class="mo-l" x="200" y="152" text-anchor="middle">라우팅 전문가 128개</text>
<text class="mo-n" x="200" y="171" text-anchor="middle">토큰마다 8개만 활성</text>
<path class="mo-a" d="M200 178 L200 194"/>
<rect class="mo-share" x="20" y="196" width="360" height="30" rx="5"/>
<text class="mo-l" x="200" y="216" text-anchor="middle">공유 전문가 1개 (항상 활성)</text>
<path class="mo-a" d="M200 226 L200 242"/>
<rect class="mo-box" x="120" y="244" width="160" height="30" rx="5"/>
<text class="mo-l" x="200" y="264" text-anchor="middle">가중합</text>
<text class="mo-n" x="30" y="304">토큰당 활성 파라미터</text>
<rect class="mo-bar" x="30" y="314" width="340" height="20" rx="3"/>
<rect class="mo-fill" x="30" y="314" width="51" height="20" rx="3"/>
<text class="mo-n" x="30" y="356">3.8B</text>
<text class="mo-n" x="370" y="356" text-anchor="end">25.2B 전부 메모리 상주</text>
</svg>
</div>

핵심 구성 요소를 정리하면 다음과 같습니다.

| 구성 요소 | 값 | 설명 |
|----------|-----|------|
| 총 전문가 수 | 128 | 미세 전문가(fine-grained experts) |
| 활성 전문가 | 8 (top-k=8) | 라우터가 토큰별로 선택 |
| 공유 전문가 | 1 | 모든 토큰에 항상 활성화 |
| FFN 활성화 함수 | GELU | `gelu_pytorch_tanh` 변형 |
| 총 파라미터 | 25.2B | 메모리에 전부 로드 필요 |
| 활성 파라미터 | 3.8B | 토큰당 실제 연산량 |

### 미세 전문가(Fine-Grained Experts)란?

MoE가 대중화되던 Mixtral 무렵에는 전문가 8개에 top-2 라우팅이 흔했습니다. 각 전문가가 큰 FFN 블록을 하나씩 맡는 구성이었습니다. 이후 흐름은 전문가를 잘게 쪼개는 쪽으로 옮겨왔고, DeepSeek-V3가 256개, Qwen3가 128개를 쓰는 식입니다. Gemma 4의 128개도 그 연장선에 있습니다.

미세 전문가의 장점은 **라우팅 정밀도**입니다. 128개 중 8개를 고르면 약 1.4조 가지의 전문가 조합이 가능합니다. 8개 중 2개를 고르는 28가지 조합과는 비교할 수 없는 수준의 다양성입니다. 각 토큰이 자신에게 가장 적합한 전문가 조합을 세밀하게 선택할 수 있습니다.

### 공유 전문가(Shared Expert)

128개의 라우팅 전문가 외에 1개의 **공유 전문가(shared expert)**가 있습니다. 이 전문가는 라우팅과 무관하게 모든 토큰에 항상 적용됩니다. 공유 전문가는 언어의 기본적인 문법, 상식 같은 범용 지식을 담당하고, 라우팅 전문가들은 특정 도메인이나 태스크에 특화된 지식을 처리합니다.

### 추론 효율성과 트레이드오프

MoE의 핵심 가치는 **추론 효율성**입니다. 31B Dense 모델은 모든 토큰에 30.7B 파라미터를 전부 사용하지만, 26B MoE는 3.8B만 활성화합니다. 토큰당 연산량(FLOPs)이 약 8배 적습니다. 고처리량 서빙 환경에서 같은 GPU로 훨씬 많은 요청을 동시 처리할 수 있습니다.

다만 주의할 점이 있습니다. MoE 모델은 활성 파라미터가 3.8B이지만, **전체 25.2B 파라미터를 메모리에 로드해야 합니다**. 어떤 전문가가 선택될지 미리 알 수 없기 때문입니다. 메모리 사용량은 Dense 모델에 근접하면서 연산량만 줄이는 구조이므로, 메모리가 아닌 연산(compute)이 병목인 환경에서 장점이 극대화됩니다.

:::info

**Fine-tuning 시 참고**

26B MoE를 fine-tuning할 때는 전체 25.2B 파라미터를 메모리에 올려야 합니다. 활성 파라미터가 3.8B라고 해서 3.8B급 모델처럼 가벼운 학습이 가능한 것은 아닙니다. QLoRA 같은 파라미터 효율적 학습 기법이 사실상 필수입니다.

:::

## p-RoPE: 글로벌 레이어의 저주파를 잘라낸다

Gemma 4는 E2B/E4B에서 128K, 12B/26B/31B에서 256K 토큰의 컨텍스트 윈도우를 지원합니다. 이 장문맥을 떠받치는 위치 인코딩이 **p-RoPE**입니다.

### RoPE의 저주파 성분이 문제입니다

RoPE(Rotary Position Embedding)는 토큰의 위치를 임베딩 벡터의 회전으로 인코딩합니다. 차원 쌍마다 서로 다른 주파수로 회전시키는데, 고주파 성분은 가까운 토큰을 구분하는 데 쓰이고 저주파 성분은 아주 먼 거리의 위치 차이를 표현합니다.

p-RoPE를 제안한 연구는 이 저주파 성분을 뜯어보고 흥미로운 관찰을 내놓습니다. 회전이 워낙 느려서 학습 구간 안에서는 한 바퀴를 채 돌지 못하고, 결과적으로 위치보다는 의미 정보를 실어 나르는 채널처럼 쓰인다는 것입니다. 그렇다면 이 성분은 위치 인코딩으로서 제 역할을 못 하면서, 학습 때 보지 못한 길이에서 엉뚱한 값을 만들어낼 위험만 안고 있는 셈입니다.

### p는 남겨두는 비율입니다

이름 때문에 오해하기 쉬운데, p-RoPE의 p는 시퀀스 길이에 대한 비례 계수가 아닙니다. **회전을 그대로 유지하는 주파수의 비율**입니다. p가 1이면 표준 RoPE이고, p가 0이면 위치 인코딩이 전혀 없는 NoPE입니다. 그 사이 값은 가장 낮은 주파수부터 잘라내고 상위 p 비율만 회전시킨다는 뜻입니다.

Gemma 4는 글로벌 레이어에만 p=0.25를 적용합니다. 회전 차원의 하위 75%를 잘라내고 상위 25%만 회전시키는 것으로, 설정 파일에서는 `partial_rotary_factor: 0.25`로 나타납니다. 잘려나간 차원은 회전 없이(cos=1, sin=0) 그대로 통과합니다.

로컬 레이어에는 표준 RoPE를 그대로 씁니다. 슬라이딩 윈도우 안에서만 어텐션을 수행하므로 학습 길이를 넘는 외삽 문제가 애초에 생기지 않기 때문입니다. RoPE base도 둘이 다릅니다. 로컬은 10,000, 글로벌은 1,000,000입니다.

YaRN이나 NTK-aware RoPE 같은 기존 장문맥 확장 기법은 주파수를 재조정해 학습 길이 밖을 커버하려 합니다. p-RoPE는 방향이 반대입니다. 문제가 되는 성분을 조정하는 대신 아예 없애버립니다.

## 기능적 아키텍처: 함수 호출, Thinking, 드래프터

아키텍처 혁신 외에도 Gemma 4는 모델의 **기능적 측면**에서 중요한 변화를 도입했습니다.

### 네이티브 함수 호출(Function Calling)

Gemma 3에서는 함수 호출을 위해 프롬프트 엔지니어링에 의존했습니다. Gemma 4는 6개의 전용 제어 토큰을 학습 데이터에 포함시켜, 함수 호출을 모델의 네이티브 기능으로 만들었습니다. 여는 토큰은 파이프가 앞에, 닫는 토큰은 파이프가 뒤에 붙습니다.

```text
<|tool>           도구 정의 시작        <tool|>           끝
<|tool_call>      함수 호출 시작        <tool_call|>      끝
<|tool_response>  함수 응답 시작        <tool_response|>  끝
```

이 토큰들이 어휘에 포함되어 있으므로, 모델이 "도구를 호출해야 할 타이밍"과 "호출 결과를 해석하는 방법"을 사전학습 단계에서 학습합니다. 에이전트 도구 사용 벤치마크인 tau2-bench에서 Gemma 3 대비 큰 폭의 개선이 나온 것이 이 네이티브 지원의 결과입니다. retail 도메인은 6.6%에서 86.4%로, telecom은 3.1%에서 69.3%로, airline은 39.0%에서 75.0%로 올랐습니다.

### 시스템 역할(System Role) 네이티브 지원

Gemma 3에는 시스템 프롬프트가 공식적으로 지원되지 않았습니다. Gemma 4는 시스템 역할을 토크나이저 수준에서 지원합니다. 에이전트 프레임워크에서 시스템 프롬프트로 행동 지침을 설정하는 것이 표준 패턴인데, 이 지원이 없으면 user 메시지에 시스템 지침을 끼워넣는 우회가 필요했습니다.

### 구성 가능한 Thinking 모드

시스템 턴 앞에 `<|think|>` 토큰을 두면 Chain-of-Thought 추론이 켜집니다. 모델이 답을 내기 전에 단계별 추론을 먼저 생성하는 모드입니다. 31B Thinking 모드의 벤치마크 성능은 다음과 같습니다.

| 벤치마크 | Gemma 4 31B (Thinking) | Gemma 3 27B |
|---------|----------------------|------------|
| AIME 2026 | 89.2% | 20.8% |
| LiveCodeBench v6 | 80.0% | 29.1% |
| GPQA Diamond | 84.3% | - |
| MMLU Pro | 85.2% | - |
| Codeforces ELO | 2,150 | - |
| MATH-Vision | 85.6% | - |
| tau2-bench (retail) | 86.4% | 6.6% |

다만 이 비교에는 유의할 점이 있습니다. Gemma 4 31B Thinking은 답을 내기 전에 추론 토큰을 별도로 생성하는 반면, Gemma 3 27B는 non-thinking 모드의 결과입니다. 동등한 조건의 비교라기보다는, Thinking 모드가 얼마나 강력한지를 보여주는 수치로 해석하는 것이 적절합니다.

### 내장 MTP 드래프터 헤드

Gemma 4의 모든 변형에는 투기적 디코딩(speculative decoding)용 **MTP(multi-token prediction) 드래프터 헤드**가 함께 들어 있습니다. 별도로 배포되는 작은 모델이 아니라 본체에 붙어 있는 4레이어 트랜스포머 블록으로, 자체 임베더를 가지되 어텐션은 본 모델의 KV에 교차 참조합니다. 그래서 단독으로는 돌릴 수 없습니다.

드래프터 크기는 변형마다 다릅니다. E2B 76M, E4B 77M, 12B 400M, 26B A4B 430M, 31B 500M입니다.

투기적 디코딩은 작은 드래프터가 여러 토큰을 먼저 뽑고 큰 본 모델이 한꺼번에 검증하는 방식입니다. 출력 분포는 본 모델과 동일하게 유지되면서 디코딩 단계 수만 줄어듭니다. 드래프터를 따로 구해 오거나 학습시킬 필요 없이 바로 켤 수 있다는 게 실무에서의 차이입니다.

## DiffusionGemma: 자기회귀를 넘어서

Gemma 4 패밀리에는 흥미로운 실험적 변형도 있습니다. **DiffusionGemma**는 26B A4B 아키텍처를 기반으로 하되, 자기회귀(autoregressive) 디코딩 대신 **블록 디퓨전(block diffusion)**을 사용합니다.

자기회귀 모델은 토큰을 하나씩 순차적으로 생성합니다. DiffusionGemma는 256개 토큰으로 구성된 블록을 동시에 생성합니다. 이미지 생성에서 디퓨전 모델이 한 번에 전체 이미지를 만들어내듯, 텍스트에서도 비슷한 접근을 시도하는 것입니다.

Google도 실험적(experimental) 모델로 못 박아 공개했으므로 프로덕션 배포에는 적합하지 않지만, 자기회귀의 근본적인 속도 제약(토큰당 한 번의 포워드 패스)을 벗어나려는 시도로서 주목할 만합니다.

## 마치며

Gemma 4는 단순한 모델 크기 업그레이드가 아닙니다. 로컬과 글로벌에 서로 다른 헤드 차원을 주고 글로벌 레이어의 V를 없애 어텐션 비용을 깎았고, PLE로 소형 모델의 한계를 밀어붙였고, 인코더 프리 아키텍처로 멀티모달 통합의 새로운 방향을 제시했고, 128개 미세 전문가 MoE로 추론 효율성을 끌어올렸습니다. 거기에 Apache 2.0 라이선스까지, 오픈소스 LLM 생태계에서 Gemma 4의 포지션은 상당히 매력적입니다.

실무에서 어떤 변형을 선택할지는 결국 배포 환경에 달려 있습니다. 모바일이면 E2B/E4B, 오디오까지 처리해야 하면 12B, 처리량이 중요하면 26B MoE, 품질이 최우선이면 31B. 하나의 설계 철학에서 갈라진 다섯 갈래 길 중 자신의 상황에 맞는 모델을 고르면 됩니다.

## 함께 보면 좋은 글

- [KV 캐시](/llm/kv-cache/) : Unified K/V가 무엇을 절약하는지 이해하려면 KV 캐시가 메모리를 어떻게 먹는지부터
- [투기적 디코딩](/llm/speculative-decoding/) : 드래프터 헤드가 붙는 자리의 동작 원리
- [Test Time Scaling](/llm/test-time-scaling/) : Thinking 모드가 기대는 추론 시점 연산 확장

## 참고자료

- [Gemma 4 Model Card - Google AI for Developers](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Gemma 4 - Google DeepMind](https://deepmind.google/models/gemma/gemma-4/)
- [Introducing Gemma 4 - Google Blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Introducing Gemma 4 12B - Google Blog](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12b/)
- [Round and Round We Go! What makes Rotary Positional Encodings useful?](https://arxiv.org/abs/2410.06205)
- [A Visual Guide to Gemma 4 - Maarten Grootendorst](https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-gemma-4)
