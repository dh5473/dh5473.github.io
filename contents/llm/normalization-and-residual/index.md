---
date: '2026-08-29'
title: 'Transformer 블록 뜯어보기'
category: 'LLM'
series: 'llm'
seriesOrder: 6
tags: ['LLM', 'LayerNorm', 'RMSNorm', 'Residual Connection', 'FFN', 'SwiGLU']
summary: 'Transformer가 레이어를 100개 쌓아도 학습이 되는 이유를 잔차 연결, 정규화, FFN에서 찾습니다. 잔차가 기울기 고속도로를 열고, RMSNorm이 크기를 다스리고, SwiGLU가 비선형 용량을 더합니다.'
thumbnail: './thumbnail.png'
---

다음 토큰 예측이라는 문제 정의에서 출발해, Q·K·V가 왜 그런 형태인지, 토큰을 어떻게 숫자로 바꾸는지, 생성할 때 확률 분포를 어떻게 다루는지, 그리고 위치 정보를 어떻게 넣는지까지 왔습니다. 이제 Transformer 블록 안에서 아직 다루지 않은 부분이 남아 있습니다.

LLaMA 3는 80층, Qwen 2.5는 128층입니다. 매 층마다 어텐션 하나와 "작은 신경망" 하나가 들어 있습니다. 어텐션은 이미 다뤘지만, 그 작은 신경망이 정확히 무엇인지, 층과 층 사이에 붙는 정규화가 무엇인지, 입력을 그대로 더하는 잔차 연결이 왜 필요한지는 아직 설명하지 않았습니다. 이 글에서는 Transformer 블록의 나머지 절반을 채웁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 500" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="현대 Transformer 블록 구조도: RMSNorm, Multi-Head Attention, 잔차 연결, SwiGLU FFN으로 구성">
<style>
.tb1-muted { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.tb1-focus { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.tb1-res { stroke: var(--accent, #9d5604); stroke-width: 2; fill: none; stroke-dasharray: 6 3; }
.tb1-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.tb1-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.tb1-tf { fill: var(--primary, #0a756c); font-size: 15px; text-anchor: middle; dominant-baseline: central; font-weight: 600; }
.tb1-tm { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.tb1-rl { fill: var(--accent, #9d5604); font-size: 14px; font-weight: 600; }
.tb1-add { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; }
</style>
<defs>
<marker id="tb1-ar" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 입력 -->
<rect x="120" y="10" width="160" height="36" class="tb1-muted"/>
<text x="200" y="28" class="tb1-tm">입력 벡터</text>
<!-- 화살표 -->
<line x1="200" y1="46" x2="200" y2="68" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- RMSNorm 1 -->
<rect x="100" y="70" width="200" height="36" class="tb1-focus"/>
<text x="200" y="88" class="tb1-tf">RMSNorm</text>
<!-- 화살표 -->
<line x1="200" y1="106" x2="200" y2="128" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- MHA (뮤트) -->
<rect x="100" y="130" width="200" height="36" class="tb1-muted"/>
<text x="200" y="148" class="tb1-tm">Multi-Head Attention</text>
<!-- 화살표 -->
<line x1="200" y1="166" x2="200" y2="188" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- Add 1 -->
<circle cx="200" cy="200" r="14" class="tb1-add"/>
<text x="200" y="201" class="tb1-tf" font-size="18">+</text>
<!-- 잔차 경로 1 -->
<path d="M 95,28 L 60,28 L 60,200 L 186,200" class="tb1-res"/>
<text x="44" y="115" class="tb1-rl" text-anchor="middle" transform="rotate(-90 44 115)">잔차</text>
<!-- 화살표 -->
<line x1="200" y1="214" x2="200" y2="236" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- RMSNorm 2 -->
<rect x="100" y="238" width="200" height="36" class="tb1-focus"/>
<text x="200" y="256" class="tb1-tf">RMSNorm</text>
<!-- 화살표 -->
<line x1="200" y1="274" x2="200" y2="296" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- SwiGLU FFN -->
<rect x="100" y="298" width="200" height="36" class="tb1-focus"/>
<text x="200" y="316" class="tb1-tf">SwiGLU FFN</text>
<!-- 화살표 -->
<line x1="200" y1="334" x2="200" y2="356" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- Add 2 -->
<circle cx="200" cy="368" r="14" class="tb1-add"/>
<text x="200" y="369" class="tb1-tf" font-size="18">+</text>
<!-- 잔차 경로 2 -->
<path d="M 95,200 L 35,200 L 35,368 L 186,368" class="tb1-res"/>
<text x="19" y="285" class="tb1-rl" text-anchor="middle" transform="rotate(-90 19 285)">잔차</text>
<!-- 화살표 -->
<line x1="200" y1="382" x2="200" y2="404" class="tb1-arr" marker-end="url(#tb1-ar)"/>
<!-- 출력 -->
<rect x="120" y="406" width="160" height="36" class="tb1-muted"/>
<text x="200" y="424" class="tb1-tm">다음 레이어로</text>
<!-- 범례 -->
<rect x="100" y="460" width="14" height="14" rx="2" class="tb1-focus"/>
<text x="120" y="470" class="tb1-t" text-anchor="start" font-size="14">이번 글의 주제</text>
<rect x="240" y="460" width="14" height="14" rx="2" class="tb1-muted"/>
<text x="260" y="470" class="tb1-t" text-anchor="start" font-size="14">이미 다룬 부분</text>
</svg>
</div>

위 그림이 현대 Transformer 블록 하나입니다. 어텐션(회색 상자)은 이미 다뤘으니, 이번에는 강조된 나머지 세 가지를 봅니다. 잔차 연결이 왜 필요한지, 정규화가 무엇을 하는지, 그리고 "작은 신경망"의 정체가 무엇인지를 순서대로 짚겠습니다.

<br>

## 깊이의 대가

신경망은 레이어를 깊이 쌓을수록 복잡한 관계를 잡을 수 있습니다. 한 번의 어텐션은 한 단계 관계만 봅니다. "책을"이 "빌린"을 흡수한 뒤 "돌려줬다"가 그 "빌린 책"을 다시 보려면 레이어가 여러 개 있어야 합니다.

그런데 2015년, 레이어를 더 쌓으면 정확도가 오히려 **떨어지는** 현상이 보고됩니다(He et al., 2016). 56층 네트워크가 20층보다 훈련 오차도, 테스트 오차도 나빴습니다. 파라미터가 더 많으니 최소한 20층만큼은 할 수 있어야 하는데 그러지 못한 겁니다.

원인은 학습 신호의 전달에 있습니다. 학습은 출력의 오차를 줄이는 방향으로 파라미터를 조정하는 일이고, 그 방향을 알려주는 것이 기울기(gradient)입니다. 기울기는 출력에서 입력 쪽으로 레이어를 하나씩 거슬러 올라가면서 전달됩니다. 문제는 각 레이어를 통과할 때마다 기울기가 곱해진다는 점입니다. 곱하는 값이 1보다 약간만 작아도 100층을 지나면 거의 0이 됩니다. 초기 레이어는 "어느 쪽으로 고쳐야 할지" 신호를 받지 못합니다. 반대로 1보다 약간만 커도 기울기가 폭발합니다. 이것이 기울기 소실(vanishing gradient)과 기울기 폭발(exploding gradient)입니다.

이 문제를 두 가지가 함께 풀었습니다. 잔차 연결과 정규화입니다.

<br>

## 잔차 연결이 여는 고속도로

He et al.(2016)의 통찰은 단순합니다. 레이어가 입력 $x$에서 출력 $f(x)$를 직접 학습하는 대신, **입력을 그대로 더한** $x + f(x)$를 출력하게 만드는 것입니다. 이렇게 하면 레이어는 "입력을 어떻게 바꿀까"라는 **변화량** $f(x)$만 학습하면 됩니다. 최적 변환이 항등 함수에 가까우면 $f(x) \approx 0$만 배우면 되니 학습이 쉬워집니다.

더 중요한 효과는 기울기 경로입니다. $x + f(x)$를 $x$로 미분하면 $1 + f'(x)$입니다. $f'(x)$가 아무리 작아도 항등 경로의 1이 항상 살아 있습니다. 100층을 거슬러 올라가더라도 기울기가 흐를 수 있는 고속도로가 생긴 셈입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 340" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="잔차 흐름: 중심의 굵은 수직선이 원래 신호를 나르고 레이어마다 변화량이 합류하는 구조">
<style>
.rs1-stream { stroke: var(--primary, #0a756c); stroke-width: 4; fill: none; }
.rs1-branch { stroke: var(--accent, #9d5604); stroke-width: 1.5; fill: none; }
.rs1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.rs1-plus { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.rs1-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.rs1-sub { fill: var(--text-muted, #6d6762); font-size: 14px; }
.rs1-lbl { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 600; }
.rs1-blbl { fill: var(--accent, #9d5604); font-size: 14px; font-weight: 600; }
</style>
<defs>
<marker id="rs1-ar" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--primary, #0a756c)"/>
</marker>
<marker id="rs1-ab" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--accent, #9d5604)"/>
</marker>
</defs>
<!-- 잔차 흐름 본류 -->
<line x1="120" y1="20" x2="120" y2="310" class="rs1-stream" marker-end="url(#rs1-ar)"/>
<text x="108" y="14" class="rs1-lbl" text-anchor="end">잔차 흐름</text>
<!-- Layer 1 -->
<path d="M 120,60 L 200,60 L 200,75" class="rs1-branch" marker-end="url(#rs1-ab)"/>
<rect x="160" y="77" width="140" height="32" class="rs1-box"/>
<text x="230" y="93" class="rs1-t" font-size="14">Attention + FFN</text>
<path d="M 200,109 L 200,124 L 120,124" class="rs1-branch"/>
<circle cx="120" cy="124" r="10" class="rs1-plus"/>
<text x="120" y="125" class="rs1-t" font-size="15" fill="var(--primary, #0a756c)" font-weight="600">+</text>
<text x="310" y="93" class="rs1-blbl" text-anchor="start">Layer 1</text>
<!-- Layer 2 -->
<path d="M 120,160 L 200,160 L 200,175" class="rs1-branch" marker-end="url(#rs1-ab)"/>
<rect x="160" y="177" width="140" height="32" class="rs1-box"/>
<text x="230" y="193" class="rs1-t" font-size="14">Attention + FFN</text>
<path d="M 200,209 L 200,224 L 120,224" class="rs1-branch"/>
<circle cx="120" cy="224" r="10" class="rs1-plus"/>
<text x="120" y="225" class="rs1-t" font-size="15" fill="var(--primary, #0a756c)" font-weight="600">+</text>
<text x="310" y="193" class="rs1-blbl" text-anchor="start">Layer 2</text>
<!-- Layer N -->
<text x="120" y="260" class="rs1-sub" text-anchor="middle">⋮</text>
<text x="230" y="260" class="rs1-sub" text-anchor="middle">⋮</text>
<!-- 라벨 -->
<text x="120" y="330" class="rs1-lbl" text-anchor="middle">원래 신호 유지</text>
<text x="290" y="330" class="rs1-blbl" text-anchor="middle">레이어가 더한 변화량</text>
</svg>
</div>

이 구조를 "잔차 흐름(residual stream)"이라고 부르기도 합니다. 강의 본류가 처음부터 끝까지 흐르고, 각 레이어는 지류처럼 변화량을 보태는 그림입니다. 임베딩 레이어에서 출발한 벡터가 이 흐름을 타고 모든 레이어를 거쳐 마지막 정규화와 lm_head에 도달합니다.

잔차 연결은 오랫동안 $x + f(x)$라는 고정된 패턴이었습니다. 하지만 2026년에는 이 연결 자체가 설계 대상이 되기 시작했습니다. DeepSeek-V4가 채택한 mHC(Manifold-Constrained Hyper-Connections)는 잔차 흐름을 하나가 아니라 여러 갈래로 확장하고, 레이어 사이에 학습 가능한 혼합 행렬을 둡니다. 혼합 행렬이 자유로우면 신호가 폭발하므로, 모든 행과 열의 합이 1이 되는 이중 확률 행렬(doubly stochastic matrix)로 제약해 안정성을 보존합니다. 아직 한 연구소의 설계이지만, 잔차 연결이 더 이상 "그냥 더하기"가 아니라는 방향을 보여줍니다.

<br>

## 정규화가 크기를 다스리는 법

잔차 연결이 기울기 고속도로를 열었지만, 레이어를 100개 통과하면서 벡터의 크기(norm)는 여전히 드리프트합니다. 어떤 차원은 값이 점점 커지고, 어떤 차원은 줄어듭니다. 정규화는 각 레이어에서 벡터의 스케일을 일정하게 맞추는 장치입니다.

Transformer에서 쓰는 정규화는 LayerNorm(Ba et al., 2016)에서 출발했습니다. 이미지에서 쓰는 BatchNorm과 달리, LayerNorm은 배치가 아니라 **하나의 토큰 벡터 안에서** 평균과 분산을 구해 정규화합니다. 시퀀스 길이가 문장마다 다르고, 추론 시 배치 크기가 1인 경우가 많은 언어 모델에서는 배치 통계가 불안정하기 때문입니다.

원래 Transformer(2017)에서 정규화는 잔차를 더한 **뒤에** 붙었습니다. $\text{LayerNorm}(x + \text{Sublayer}(x))$ 형태인데, 이를 Post-Norm이라 부릅니다. 이 배치는 학습이 까다로웠습니다. 학습률을 천천히 올리는 워밍업 없이는 훈련 초기에 발산하는 경우가 잦았습니다.

GPT-2(Radford et al., 2019)부터 정규화 위치가 바뀝니다. 서브레이어에 들어가기 **전에** 정규화하는 Pre-Norm 방식, $x + \text{Sublayer}(\text{LayerNorm}(x))$입니다. 차이는 잔차 경로에 있습니다. Post-Norm에서는 잔차가 정규화를 통과하면서 기울기 경로에 정규화의 미분이 끼어듭니다. Pre-Norm에서는 잔차 경로가 깨끗하게 유지됩니다. $x$가 어떤 변환도 거치지 않고 그대로 더해지니, 앞에서 본 기울기 고속도로가 온전히 작동합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 340" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Post-Norm과 Pre-Norm의 데이터 흐름 비교. Pre-Norm에서는 잔차 경로가 깨끗하게 유지됨">
<style>
.pn1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.pn1-norm { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.pn1-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.pn1-res { stroke: var(--accent, #9d5604); stroke-width: 2; fill: none; stroke-dasharray: 6 3; }
.pn1-clean { stroke: var(--text-success, #107836); stroke-width: 2.5; fill: none; }
.pn1-plus { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.pn1-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.pn1-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.pn1-sub { fill: var(--text-muted, #6d6762); font-size: 14px; }
.pn1-gl { fill: var(--text-success, #107836); font-size: 14px; font-weight: 600; }
</style>
<defs>
<marker id="pn1-ar" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- Post-Norm (위) -->
<text x="200" y="18" class="pn1-h" text-anchor="middle">Post-Norm (2017)</text>
<!-- x -->
<text x="50" y="60" class="pn1-t" font-size="15">x</text>
<!-- Sublayer -->
<line x1="68" y1="60" x2="98" y2="60" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<rect x="100" y="44" width="90" height="32" class="pn1-box"/>
<text x="145" y="60" class="pn1-t" font-size="14">Sublayer</text>
<!-- Add -->
<line x1="190" y1="60" x2="218" y2="60" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<circle cx="230" cy="60" r="12" class="pn1-plus"/>
<text x="230" y="61" class="pn1-t" font-size="16" fill="var(--primary, #0a756c)" font-weight="600">+</text>
<!-- 잔차 경로 -->
<path d="M 60,60 L 60,32 L 230,32 L 230,48" class="pn1-res"/>
<!-- Norm -->
<line x1="242" y1="60" x2="262" y2="60" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<rect x="264" y="44" width="70" height="32" class="pn1-norm"/>
<text x="299" y="60" class="pn1-t" font-size="14">Norm</text>
<!-- 출력 -->
<line x1="334" y1="60" x2="358" y2="60" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<text x="366" y="60" class="pn1-sub" text-anchor="start">out</text>
<!-- 구분선 -->
<line x1="30" y1="105" x2="370" y2="105" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- Pre-Norm (아래) -->
<text x="200" y="128" class="pn1-h" text-anchor="middle">Pre-Norm (2019~)</text>
<!-- 깨끗한 잔차 경로 라벨 (제목과 충분히 이격) -->
<text x="160" y="152" class="pn1-gl" text-anchor="middle">깨끗한 잔차 경로</text>
<!-- x -->
<text x="30" y="200" class="pn1-t" font-size="15">x</text>
<!-- Norm -->
<line x1="46" y1="200" x2="58" y2="200" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<rect x="60" y="184" width="70" height="32" class="pn1-norm"/>
<text x="95" y="200" class="pn1-t" font-size="14">Norm</text>
<!-- Sublayer -->
<line x1="130" y1="200" x2="148" y2="200" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<rect x="150" y="184" width="90" height="32" class="pn1-box"/>
<text x="195" y="200" class="pn1-t" font-size="14">Sublayer</text>
<!-- Add -->
<line x1="240" y1="200" x2="268" y2="200" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<circle cx="280" cy="200" r="12" class="pn1-plus"/>
<text x="280" y="201" class="pn1-t" font-size="16" fill="var(--primary, #0a756c)" font-weight="600">+</text>
<!-- 깨끗한 잔차 경로 선 -->
<path d="M 38,200 L 38,160 L 280,160 L 280,188" class="pn1-clean"/>
<!-- 출력 -->
<line x1="292" y1="200" x2="348" y2="200" class="pn1-arr" marker-end="url(#pn1-ar)"/>
<text x="356" y="200" class="pn1-sub" text-anchor="start">out</text>
<!-- 설명 -->
<text x="200" y="250" class="pn1-sub" text-anchor="middle">Post-Norm: 잔차가 정규화를 통과</text>
<text x="200" y="270" class="pn1-sub" text-anchor="middle">Pre-Norm: 잔차가 변환 없이 그대로 더해짐</text>
<!-- 범례 -->
<line x1="100" y1="305" x2="130" y2="305" class="pn1-res"/>
<text x="138" y="308" class="pn1-sub" text-anchor="start">잔차 경로</text>
<line x1="240" y1="305" x2="270" y2="305" class="pn1-clean"/>
<text x="278" y="308" class="pn1-gl" text-anchor="start">깨끗한 경로</text>
</svg>
</div>

지금 쓰이는 정규화는 RMSNorm(Zhang & Sennrich, 2019)입니다. LayerNorm이 평균을 빼고 분산으로 나누는 두 단계를 거치는 반면, RMSNorm은 평균 빼기를 생략하고 제곱평균제곱근(root mean square)으로만 나눕니다.

$$
\text{RMSNorm}(x) = \frac{x}{\sqrt{\frac{1}{d}\sum_{i=1}^{d}x_i^2 + \epsilon}} \cdot \gamma
$$

$x$는 입력 벡터, $d$는 차원 수, $\epsilon$은 0으로 나누는 것을 막는 작은 상수, $\gamma$는 학습 가능한 스케일 파라미터입니다. LayerNorm에 있던 평균 빼기와 학습 가능한 편향 $\beta$가 없습니다. 계산이 줄어든 만큼 빠르고, 실험적으로 성능 차이는 없었습니다. LLaMA, Gemma, Qwen, DeepSeek 등 2023년 이후 주요 오픈 모델은 전부 Pre-Norm + RMSNorm 조합입니다.

마지막으로, 모든 레이어를 통과한 벡터는 lm_head(어휘 확률을 내놓는 마지막 행렬곱)에 들어가기 직전에 RMSNorm을 한 번 더 거칩니다. 이것이 "최종 정규화"입니다. 잔차 흐름을 타고 80층을 지나면서 쌓인 스케일 변동을 마지막에 한 번 더 맞추는 역할입니다.

<br>

## 블록의 나머지 절반

어텐션은 "어떤 토큰을 볼지"를 정합니다. 그런데 본 정보를 가지고 "무엇을 할지"는 어텐션의 몫이 아닙니다. 그 역할이 FFN(Feed-Forward Network)입니다. 블록 구조 그림에서 어텐션 아래에 있던 "작은 신경망"의 정체입니다.

FFN은 각 토큰의 벡터를 **위치별로 독립**적으로 처리합니다. 다른 위치의 토큰은 보지 않습니다. 토큰 간 정보 교환은 어텐션이 전담하고, FFN은 한 토큰의 표현을 비선형적으로 변환해 용량을 더합니다.

원래 Transformer(2017)의 FFN은 두 단계입니다. 먼저 $W_1$이 입력 벡터를 더 큰 차원으로 확장합니다. 예를 들어 4,096차원 벡터가 16,384차원이 됩니다. 이 넓은 공간에서 ReLU($\max(0, x)$)가 음수를 전부 0으로 만들어 비선형성을 넣고, $W_2$가 다시 4,096차원으로 줄입니다. 좁은 공간 → 넓은 공간에서 변환 → 다시 좁은 공간으로 돌아오는 구조입니다.

ReLU의 문제는 음수를 완전히 차단한다는 점입니다. 한 번 0이 된 뉴런은 기울기도 0이 되어 다시 살아나기 어렵습니다. GELU(BERT, GPT-2에서 채택)는 이를 부드럽게 만들어 작은 음수도 통과시켰습니다. 현재 LLM에서 쓰이는 SiLU도 같은 방향입니다. $\text{SiLU}(z) = z \cdot \sigma(z)$로, 시그모이드 $\sigma(z)$가 각 값의 "통과 비율"을 정합니다. 양수는 거의 그대로 통과하고, 음수는 대부분 억제되지만 완전히 0이 되지는 않습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 220" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="ReLU와 SiLU 활성 함수 비교 그래프. ReLU는 음수를 완전히 차단하고 SiLU는 부드럽게 약간의 음수를 허용">
<style>
.af1-axis { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.af1-relu { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; stroke-dasharray: 6 4; }
.af1-silu { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.af1-al { fill: var(--text-muted, #6d6762); font-size: 14px; }
.af1-sl { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 600; }
.af1-rl { fill: var(--text-muted, #6d6762); font-size: 14px; }
.af1-ann { fill: var(--accent, #9d5604); font-size: 14px; }
</style>
<!-- 축 -->
<line x1="65" y1="160" x2="375" y2="160" class="af1-axis"/>
<line x1="218" y1="15" x2="218" y2="195" class="af1-axis"/>
<!-- 축 라벨 -->
<text x="375" y="175" class="af1-al" text-anchor="end">z</text>
<text x="228" y="14" class="af1-al" text-anchor="start">출력</text>
<!-- x축 눈금 -->
<text x="65" y="178" class="af1-al" text-anchor="middle">-4</text>
<text x="141" y="178" class="af1-al" text-anchor="middle">-2</text>
<text x="218" y="178" class="af1-al" text-anchor="middle">0</text>
<text x="294" y="178" class="af1-al" text-anchor="middle">2</text>
<text x="370" y="178" class="af1-al" text-anchor="middle">4</text>
<!-- ReLU -->
<polyline points="65,160 218,160 370,20" class="af1-relu"/>
<!-- SiLU -->
<polyline points="65,163 103,165 141,168 160,170 170,170 179,169 189,168 198,167 208,164 218,160 227,155 237,149 246,142 256,134 275,117 294,98 313,79 332,60 351,41 370,23" class="af1-silu"/>
<!-- 곡선 라벨 -->
<text x="115" y="152" class="af1-rl">ReLU</text>
<text x="100" y="190" class="af1-sl">SiLU</text>
<!-- 음수 영역 주석 -->
<line x1="170" y1="170" x2="170" y2="160" stroke="var(--accent, #9d5604)" stroke-width="1" stroke-dasharray="3 2"/>
<circle cx="170" cy="170" r="3" fill="var(--accent, #9d5604)"/>
<text x="190" y="205" class="af1-ann">음수도 약간 통과</text>
</svg>
</div>

현재 표준은 SwiGLU(Shazeer, 2020)입니다. ReLU나 GELU는 모든 차원에 같은 규칙을 적용합니다. 양수면 통과, 음수면 차단(또는 약하게 통과). SwiGLU는 발상을 바꿉니다. **어떤 차원을 얼마나 열지를 모델이 직접 학습하게** 합니다.

구체적으로 봅시다. 입력 $x$가 들어오면 두 갈래로 나뉩니다. 한쪽($W_{\text{up}}$)은 입력을 넓은 차원으로 변환해 "후보 값"을 만듭니다. 다른 쪽($W_{\text{gate}}$)도 같은 입력을 넓은 차원으로 변환하되, SiLU 활성 함수를 거쳐 각 차원에 0에서 1 사이의 "열림 정도"를 매깁니다. 이 두 결과를 차원별로 곱하면($\odot$), 게이트가 0에 가까운 차원은 후보 값이 거의 사라지고, 1에 가까운 차원은 그대로 살아남습니다. 마지막으로 $W_{\text{down}}$이 결과를 원래 차원으로 압축합니다.

$$
\text{FFN}_{\text{SwiGLU}}(x) = W_{\text{down}} \cdot \bigl(\text{SiLU}(W_{\text{gate}}\,x) \odot W_{\text{up}}\,x\bigr)
$$

$\text{SiLU}(z) = z \cdot \sigma(z)$이고 $\sigma$는 시그모이드 함수입니다. 핵심은 $W_{\text{gate}}$와 $W_{\text{up}}$이 **같은 입력을 서로 다른 가중치로** 변환한다는 점입니다. 게이트 쪽은 "이 차원을 쓸지 말지"를 판단하고, up 쪽은 "쓴다면 어떤 값을 넣을지"를 정합니다. 이 분업 덕에 모델이 입력에 따라 차원별로 다른 처리를 할 수 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="SwiGLU FFN 구조: 입력이 gate와 up 두 갈래로 나뉘어 원소별 곱 후 down으로 압축">
<style>
.sg1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.sg1-act { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.sg1-mul { fill: var(--accent, #9d5604); fill-opacity: 0.12; stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.sg1-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.sg1-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.sg1-sub { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
.sg1-w { fill: var(--text, #1c1917); font-size: 14px; text-anchor: middle; dominant-baseline: central; }
</style>
<defs>
<marker id="sg1-ar" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 입력 -->
<text x="200" y="20" class="sg1-t">입력 x</text>
<!-- 분기점 -->
<line x1="200" y1="30" x2="200" y2="50" class="sg1-arr"/>
<!-- gate 갈래 (왼쪽) -->
<line x1="200" y1="50" x2="110" y2="70" class="sg1-arr" marker-end="url(#sg1-ar)"/>
<rect x="60" y="72" width="100" height="30" class="sg1-box"/>
<text x="110" y="87" class="sg1-w">W_gate</text>
<line x1="110" y1="102" x2="110" y2="122" class="sg1-arr" marker-end="url(#sg1-ar)"/>
<rect x="70" y="124" width="80" height="30" class="sg1-act"/>
<text x="110" y="139" class="sg1-t" font-size="14" fill="var(--primary, #0a756c)">SiLU</text>
<path d="M 110,154 L 110,186 L 186,186" class="sg1-arr"/>
<!-- up 갈래 (오른쪽) -->
<line x1="200" y1="50" x2="290" y2="70" class="sg1-arr" marker-end="url(#sg1-ar)"/>
<rect x="240" y="72" width="100" height="30" class="sg1-box"/>
<text x="290" y="87" class="sg1-w">W_up</text>
<path d="M 290,102 L 290,186 L 214,186" class="sg1-arr"/>
<circle cx="200" cy="186" r="14" class="sg1-mul"/>
<text x="200" y="187" class="sg1-t" font-size="16" fill="var(--accent, #9d5604)" font-weight="600">⊙</text>
<text x="200" y="212" class="sg1-sub">원소별 곱</text>
<!-- down -->
<line x1="200" y1="222" x2="200" y2="238" class="sg1-arr" marker-end="url(#sg1-ar)"/>
<rect x="140" y="240" width="120" height="30" class="sg1-box"/>
<text x="200" y="255" class="sg1-w">W_down</text>
<!-- 출력 -->
<line x1="200" y1="270" x2="200" y2="288" class="sg1-arr" marker-end="url(#sg1-ar)"/>
<text x="200" y="298" class="sg1-t">출력</text>
</svg>
</div>

가중치 행렬이 3개라서 FFN은 레이어 전체 파라미터의 약 2/3를 차지합니다. MoE(Mixture of Experts) 아키텍처가 이 FFN을 여러 전문가로 쪼개 토큰마다 일부만 활성화하는 이유가 여기에 있습니다. 파라미터의 대부분이 FFN에 집중되어 있으니, FFN을 나누는 것이 가장 효율적인 확장 방법입니다.

<br>

## 마치며

어텐션이 블록의 절반이라면, 잔차 연결과 정규화와 FFN이 나머지 절반입니다. 잔차 연결이 기울기 고속도로를 열고, 정규화가 신호 크기를 다스리고, FFN이 비선형 변환 용량을 더합니다. 이 셋이 없었다면 레이어 하나짜리 어텐션에서 끝났을 것입니다.

다음 글에서는 그 어텐션의 $n \times n$ 점수 행렬을 한꺼번에 만들지 않고 타일 단위로 계산하는 FlashAttention을 다룹니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [토큰은 왜 단어가 아닐까](/llm/tokenization-and-embedding/)
- [위치 인코딩은 왜 아직도 바뀌고 있을까](/llm/positional-encoding/)
- [Gemma 4 아키텍처 총정리](/llm/gemma4-architecture/)

<br>

## 참고자료

- [Attention Is All You Need (Vaswani et al., NeurIPS 2017)](https://arxiv.org/abs/1706.03762)
- [Deep Residual Learning for Image Recognition (He et al., CVPR 2016)](https://arxiv.org/abs/1512.03385)
- [Layer Normalization (Ba et al., 2016)](https://arxiv.org/abs/1607.06450)
- [Root Mean Square Layer Normalization (Zhang & Sennrich, NeurIPS 2019)](https://arxiv.org/abs/1910.07467)
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf)
- [GLU Variants Improve Transformer (Shazeer, 2020)](https://arxiv.org/abs/2002.05202)
- [Hyper-Connections (Zhu et al., 2024)](https://arxiv.org/abs/2409.19606)
- [DeepSeek-V4 Technical Report (DeepSeek-AI, 2026)](https://arxiv.org/abs/2606.19348)
