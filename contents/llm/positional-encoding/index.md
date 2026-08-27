---
date: '2026-08-27'
title: '위치 인코딩은 왜 아직도 바뀌고 있을까'
category: 'LLM'
series: 'llm'
seriesOrder: 5
tags: ['LLM', 'Positional Encoding', 'RoPE', 'Sinusoidal', 'Transformer']
summary: 'Transformer의 어텐션은 토큰 순서를 모릅니다. 사인·코사인으로 메운 원래 설계에서 RoPE의 회전까지, 위치 인코딩이 왜 그 방식이어야 했는지 따라갑니다.'
thumbnail: './thumbnail.png'
---

어텐션의 내적 $q_i \cdot k_j$에는 토큰의 내용만 들어갑니다. 위치 $i$와 $j$는 어디에도 나타나지 않죠. "민수는 책을 돌려줬다"와 "책을 민수는 돌려줬다"에서 "돌려줬다"가 받는 어텐션 가중치가 같아집니다. causal mask가 "앞인지 뒤인지"는 갈라 주지만 "몇 칸 앞인지"까지는 알려 주지 않습니다.

"개가 사람을 물었다"와 "사람이 개를 물었다"는 같은 토큰으로 이루어져 있지만 의미가 정반대입니다. 어순이 의미를 정하는 언어에서 순서를 모르는 모델은 쓸 수가 없습니다. 그래서 Transformer는 첫날부터 위치를 따로 알려주는 장치가 필요했습니다.

2017년에는 사인·코사인 함수를 썼고, 지금은 벡터를 회전시킵니다. 그 사이에 학습 가능한 위치 벡터, ALiBi, RoPE가 거쳐 갔고 RoPE마저 주파수를 재조정하는 작업이 이어지고 있습니다.

<br>

## 어텐션 식에는 순서가 없다

Transformer의 어텐션은 $\text{softmax}(QK^\top / \sqrt{d_k})V$입니다. $Q$와 $K$의 내적으로 점수를 구하고 $V$의 가중합을 출력하죠. 이 계산 어디에도 "몇 번째 토큰인지"가 들어가는 곳은 없습니다.

구체적으로 봅시다. 토큰 A, B, C가 있을 때 C의 입장에서 A와 B에 매기는 어텐션 점수는 $q_C \cdot k_A$와 $q_C \cdot k_B$입니다. 이 값은 A와 B의 **내용**이 정하는 것이지 A가 첫 번째인지 두 번째인지는 관여하지 않습니다. 입력 순서를 바꿔서 B, A, C로 넣어도 C가 A에 주는 가중치와 B에 주는 가중치는 그대로입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 195" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="토큰 순서를 바꿔도 어텐션 가중치가 동일함을 보여주는 다이어그램">
<style>
.pe1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.pe1-q { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.pe1-lbl { fill: var(--text, #1c1917); font-size: 18; text-anchor: middle; dominant-baseline: central; }
.pe1-w { fill: var(--primary, #0a756c); font-size: 15; text-anchor: middle; font-weight: 600; }
.pe1-sub { fill: var(--text-muted, #6d6762); font-size: 15; text-anchor: middle; }
</style>
<!-- 순서 1 -->
<text x="200" y="16" class="pe1-sub">순서 1</text>
<rect x="30" y="28" width="70" height="38" class="pe1-box"/>
<text x="65" y="47" class="pe1-lbl">A</text>
<text x="65" y="80" class="pe1-w">0.7</text>
<rect x="130" y="28" width="70" height="38" class="pe1-box"/>
<text x="165" y="47" class="pe1-lbl">B</text>
<text x="165" y="80" class="pe1-w">0.3</text>
<rect x="265" y="28" width="70" height="38" class="pe1-q"/>
<text x="300" y="47" class="pe1-lbl">C</text>
<text x="350" y="47" class="pe1-sub">Q</text>
<!-- 구분선 -->
<line x1="30" y1="97" x2="370" y2="97" stroke="var(--border, #e7e5e4)" stroke-dasharray="4 4"/>
<!-- 순서 2 -->
<text x="200" y="115" class="pe1-sub">순서 2</text>
<rect x="30" y="125" width="70" height="38" class="pe1-box"/>
<text x="65" y="144" class="pe1-lbl">B</text>
<text x="65" y="177" class="pe1-w">0.3</text>
<rect x="130" y="125" width="70" height="38" class="pe1-box"/>
<text x="165" y="144" class="pe1-lbl">A</text>
<text x="165" y="177" class="pe1-w">0.7</text>
<rect x="265" y="125" width="70" height="38" class="pe1-q"/>
<text x="300" y="144" class="pe1-lbl">C</text>
<text x="350" y="144" class="pe1-sub">Q</text>
</svg>
</div>

RNN은 토큰을 하나씩 순서대로 처리하면서 이전 상태를 다음 스텝에 넘기기 때문에 위치가 자동으로 반영됩니다. Transformer는 모든 토큰을 병렬로 처리하면서 속도를 얻었지만 그 대가로 순서 정보를 잃었습니다. 순서 없이는 언어가 성립하지 않으니 위치를 따로 주입해야 합니다.

<br>

## 사인·코사인으로 순서를 새기다

2017년 "Attention Is All You Need"의 저자들은 위치마다 고유한 벡터를 만들어 토큰 임베딩에 더하는 방법을 택했습니다. 추가 파라미터 없이 사인·코사인 함수만으로 위치 벡터를 생성합니다.

$$
PE_{(pos, 2i)} = \sin\!\left(\frac{pos}{10000^{2i/d}}\right), \quad PE_{(pos, 2i+1)} = \cos\!\left(\frac{pos}{10000^{2i/d}}\right)
$$

$pos$는 토큰의 위치, $i$는 차원 인덱스, $d$는 모델 차원입니다. 분모의 $10000^{2i/d}$가 차원마다 다른 주파수를 만듭니다. $i$가 작은 차원은 주파수가 높아서 인접한 위치끼리도 뚜렷이 구분됩니다. $i$가 큰 차원은 주파수가 낮아서 수백 위치가 지나야 값이 바뀝니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 250" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="차원별 주파수 차이를 보여주는 사인 함수 시각화">
<style>
.pe2-axis { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.pe2-wave { fill: none; stroke-width: 2; stroke-linecap: round; }
.pe2-hi { stroke: var(--primary, #0a756c); }
.pe2-mid { stroke: var(--accent, #9d5604); }
.pe2-lo { stroke: var(--text-muted, #6d6762); }
.pe2-lbl { fill: var(--text, #1c1917); font-size: 15; }
.pe2-dim { font-size: 15; font-weight: 600; }
.pe2-pos { fill: var(--text-muted, #6d6762); font-size: 15; text-anchor: middle; }
</style>
<!-- 고주파 -->
<text x="46" y="18" class="pe2-lbl pe2-dim" fill="var(--primary, #0a756c)">i = 0</text>
<text x="46" y="34" class="pe2-lbl" fill="var(--text-muted, #6d6762)">고주파</text>
<line x1="60" y1="55" x2="370" y2="55" class="pe2-axis" stroke-dasharray="2 4"/>
<path d="M 60,55 C 79,33 91,33 117.5,55 C 136,77 148,77 175,55 C 194,33 206,33 232.5,55 C 251,77 263,77 290,55 C 309,33 321,33 347.5,55 C 356,63 363,68 370,70" class="pe2-wave pe2-hi"/>
<!-- 중간 주파수 -->
<text x="46" y="98" class="pe2-lbl pe2-dim" fill="var(--accent, #9d5604)">i = d/4</text>
<text x="46" y="114" class="pe2-lbl" fill="var(--text-muted, #6d6762)">중간</text>
<line x1="60" y1="135" x2="370" y2="135" class="pe2-axis" stroke-dasharray="2 4"/>
<path d="M 60,135 C 120,113 180,108 215,113 C 250,118 310,148 370,155" class="pe2-wave pe2-mid"/>
<!-- 저주파 -->
<text x="46" y="178" class="pe2-lbl pe2-dim" fill="var(--text-muted, #6d6762)">i ≈ d/2</text>
<text x="46" y="194" class="pe2-lbl" fill="var(--text-muted, #6d6762)">저주파</text>
<line x1="60" y1="210" x2="370" y2="210" class="pe2-axis" stroke-dasharray="2 4"/>
<path d="M 60,210 C 163,209 267,208.5 370,208" class="pe2-wave pe2-lo"/>
<!-- 위치 축 -->
<line x1="60" y1="238" x2="370" y2="238" class="pe2-axis"/>
<text x="60" y="250" class="pe2-pos">0</text>
<text x="137" y="250" class="pe2-pos">4</text>
<text x="215" y="250" class="pe2-pos">8</text>
<text x="293" y="250" class="pe2-pos">12</text>
<text x="370" y="250" class="pe2-pos">16</text>
</svg>
</div>

직관적으로 보면 이진수의 비트와 비슷합니다. 가장 낮은 비트는 매 위치마다 뒤집히고 높은 비트는 느리게 바뀌듯, 사인·코사인 인코딩도 낮은 차원은 빠르게, 높은 차원은 천천히 변합니다. 이렇게 하면 어떤 두 위치든 전체 차원 벡터로 보면 구분할 수 있습니다.

이 설계의 핵심 성질은 상대 거리에 있습니다. 위치 $pos$와 위치 $pos + k$의 인코딩 차이가 $k$에만 의존하는 선형 변환으로 표현됩니다. 저자들은 이 성질 덕분에 모델이 "3칸 앞"이라는 상대 거리를 학습할 수 있을 것이라 기대했습니다. 파라미터가 0개라는 점도 장점이었습니다. 위치 벡터는 학습 없이 계산으로 나옵니다.

BERT(2018)와 GPT-2(2019)는 다른 길을 택했습니다. 위치마다 학습 가능한 벡터 하나를 테이블에 저장하는 방식입니다. BERT는 512개, GPT-2는 1024개 위치의 벡터를 학습했습니다. 구현이 더 간단하고 Vaswani et al.의 실험에서 사인·코사인과 거의 같은 성능을 보였습니다. 다만 이 방식도 사인·코사인도 공통점이 하나 있습니다. 둘 다 위치 $i$에 **고정된 벡터를 더하는** 절대 위치 인코딩입니다.

<br>

## 절대 위치가 막힌 곳

절대 위치 인코딩은 두 가지 벽에 부딪힙니다.

첫째, 학습 길이 밖에서 깨집니다. 학습 가능한 위치 벡터는 학습 범위를 넘는 위치를 아예 정의할 수 없습니다. 513번째 토큰이 들어오면 참조할 벡터가 없죠. 사인·코사인은 임의의 위치에 값을 계산할 수 있지만 실제로 외삽하면 성능이 무너집니다. 학습 중 경험하지 못한 주파수 조합이 등장하기 때문입니다.

둘째, 더 근본적인 문제가 있습니다. 자연어에서 중요한 것은 대부분 절대 위치가 아니라 상대 거리입니다. 주어와 동사 사이의 간격, 수식어와 명사의 거리가 의미를 정합니다. 절대 위치를 넣고 모델이 상대 거리를 학습하기를 기대하는 것은 우회로입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 180" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="절대 위치와 상대 거리의 차이를 보여주는 다이어그램">
<style>
.pe3-c { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pe3-cq { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.pe3-tok { fill: var(--text, #1c1917); font-size: 17; text-anchor: middle; dominant-baseline: central; }
.pe3-abs { fill: var(--text-muted, #6d6762); font-size: 15; text-anchor: middle; }
.pe3-rel { fill: var(--primary, #0a756c); font-size: 15; text-anchor: middle; font-weight: 600; }
.pe3-hd { fill: var(--text, #1c1917); font-size: 15; font-weight: 600; }
.pe3-arr { stroke: var(--primary, #0a756c); stroke-width: 1.2; fill: none; marker-end: url(#pe3-arrow); }
</style>
<defs>
<marker id="pe3-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0,0 L6,3 L0,6 Z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<!-- 절대 위치 라벨 -->
<text x="15" y="16" class="pe3-hd">절대</text>
<text x="75" y="30" class="pe3-abs">0</text>
<text x="150" y="30" class="pe3-abs">1</text>
<text x="225" y="30" class="pe3-abs">2</text>
<text x="300" y="30" class="pe3-abs">3</text>
<text x="375" y="30" class="pe3-abs">4</text>
<!-- 토큰 -->
<circle cx="75" cy="58" r="18" class="pe3-c"/>
<text x="75" y="58" class="pe3-tok">A</text>
<circle cx="150" cy="58" r="18" class="pe3-c"/>
<text x="150" y="58" class="pe3-tok">B</text>
<circle cx="225" cy="58" r="18" class="pe3-c"/>
<text x="225" y="58" class="pe3-tok">C</text>
<circle cx="300" cy="58" r="18" class="pe3-cq"/>
<text x="300" y="58" class="pe3-tok">D</text>
<circle cx="375" cy="58" r="18" class="pe3-c"/>
<text x="375" y="58" class="pe3-tok">E</text>
<!-- 상대 거리 (D 기준) -->
<text x="15" y="110" class="pe3-hd">상대</text>
<text x="300" y="95" class="pe3-abs">D 기준</text>
<path d="M 290,76 Q 188,125 85,76" class="pe3-arr"/>
<text x="188" y="138" class="pe3-rel">-3</text>
<path d="M 293,76 Q 225,112 158,76" class="pe3-arr"/>
<text x="225" y="118" class="pe3-rel">-2</text>
<path d="M 295,76 Q 263,100 233,76" class="pe3-arr"/>
<text x="263" y="105" class="pe3-rel">-1</text>
<path d="M 310,76 Q 338,100 367,76" class="pe3-arr"/>
<text x="338" y="105" class="pe3-rel">+1</text>
<!-- 하단 -->
<text x="200" y="168" class="pe3-abs">"742번 자리" vs "3칸 앞"</text>
</svg>
</div>

ALiBi(Press et al., 2022)는 이 문제에 다른 각도로 접근했습니다. 임베딩에 위치 벡터를 더하는 대신 어텐션 점수에서 거리에 비례하는 값을 직접 뺍니다. 멀리 떨어진 토큰일수록 점수를 깎는 방식이죠. 위치 벡터 없이 상대 거리를 반영할 수 있었고 학습 길이를 넘는 외삽에도 비교적 강했습니다. 그러나 거리별 감쇠가 헤드마다 고정된 선형 함수라 표현력에 한계가 있었고, 2026년 기준 프론티어 모델에서 채택한 곳은 없습니다.

<br>

## RoPE가 순서를 회전으로 바꾼 이유

Su et al.(2021)의 RoPE(Rotary Position Embedding)는 질문 자체를 바꿨습니다. "너는 742번 자리"라고 알려주는 대신 Q와 K 벡터를 위치에 비례한 각도만큼 회전시킵니다. 위치 정보가 임베딩에 더해지는 게 아니라 어텐션 내적에 곱해지는 방식이죠.

차원 쌍 $(2i, 2i+1)$ 하나를 봅시다. 위치 $m$에 있는 쿼리 벡터의 해당 차원 쌍을 각도 $m\theta_i$만큼 2D 회전시킵니다.

$$
\begin{pmatrix} q_m^{(2i)} \\ q_m^{(2i+1)} \end{pmatrix} = \begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix} \begin{pmatrix} q^{(2i)} \\ q^{(2i+1)} \end{pmatrix}
$$

$\theta_i = 10000^{-2i/d}$로, 사인·코사인 인코딩과 같은 base 10000을 씁니다. 차원 쌍마다 서로 다른 주파수로 회전한다는 구조가 동일한 것은 우연이 아닙니다.

키 벡터에도 같은 회전을 적용합니다. 위치 $n$의 키는 $n\theta_i$만큼 회전하죠. 여기서 핵심이 드러납니다. 회전된 $q_m$과 $k_n$의 내적은 두 회전 각도의 **차이** $(m - n)\theta_i$에만 의존합니다. 2D 회전의 성질 때문입니다. 두 벡터를 각각 $\alpha$, $\beta$만큼 회전시키면 내적은 $\alpha - \beta$의 함수가 됩니다. 절대 위치 $m$과 $n$을 넣지 않아도 상대 거리 $m - n$이 어텐션 점수 안에 자연스럽게 녹아들죠.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="RoPE의 2D 회전으로 상대 위치가 인코딩되는 원리">
<style>
.pe4-axis { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.pe4-vec { stroke-width: 2.5; stroke-linecap: round; }
.pe4-qm { stroke: var(--primary, #0a756c); }
.pe4-kn { stroke: var(--accent, #9d5604); }
.pe4-arc { fill: none; stroke-width: 1.5; stroke-dasharray: 4 3; }
.pe4-arcfill { fill: var(--primary, #0a756c); fill-opacity: 0.08; stroke: none; }
.pe4-lbl { font-size: 15; }
.pe4-title { font-size: 15; font-weight: 600; text-anchor: middle; }
.pe4-ang { font-size: 15; font-weight: 600; }
</style>
<defs>
<marker id="pe4-aq" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--primary, #0a756c)"/>
</marker>
<marker id="pe4-ak" viewBox="0 0 8 6" refX="7" refY="3" markerWidth="7" markerHeight="5" orient="auto">
<path d="M0,0 L8,3 L0,6 Z" fill="var(--accent, #9d5604)"/>
</marker>
</defs>
<!-- 좌표축 -->
<line x1="40" y1="200" x2="350" y2="200" class="pe4-axis"/>
<line x1="130" y1="30" x2="130" y2="220" class="pe4-axis"/>
<!-- 각도 영역 (m-n)θ -->
<path d="M 130,200 L 257,112 A 120,120 0 0,1 290,152 Z" class="pe4-arcfill"/>
<!-- Q 벡터 (위치 m, 70도 회전) -->
<line x1="130" y1="200" x2="172" y2="75" class="pe4-vec pe4-qm" marker-end="url(#pe4-aq)"/>
<!-- K 벡터 (위치 n, 25도 회전) -->
<line x1="130" y1="200" x2="248" y2="147" class="pe4-vec pe4-kn" marker-end="url(#pe4-ak)"/>
<!-- 각도 호: mθ (x축에서 Q까지, r=55) -->
<path d="M 185,200 A 55,55 0 0,0 149,148" class="pe4-arc" stroke="var(--primary, #0a756c)"/>
<text x="190" y="162" class="pe4-lbl" fill="var(--primary, #0a756c)">mθ</text>
<!-- 각도 호: nθ (x축에서 K까지, r=75) -->
<path d="M 205,200 A 75,75 0 0,0 198,168" class="pe4-arc" stroke="var(--accent, #9d5604)"/>
<text x="218" y="188" class="pe4-lbl" fill="var(--accent, #9d5604)">nθ</text>
<!-- 각도 호: (m-n)θ (K에서 Q까지, r=100) -->
<path d="M 221,158 A 100,100 0 0,0 164,106" class="pe4-arc" stroke="var(--text, #1c1917)"/>
<text x="228" y="125" class="pe4-ang" fill="var(--text, #1c1917)">(m−n)θ</text>
<!-- 벡터 라벨 -->
<text x="140" y="65" class="pe4-lbl" fill="var(--primary, #0a756c)" font-weight="600">Q (위치 m)</text>
<text x="257" y="140" class="pe4-lbl" fill="var(--accent, #9d5604)" font-weight="600">K (위치 n)</text>
<!-- 핵심 -->
<text x="200" y="255" class="pe4-title" fill="var(--text, #1c1917)">내적은 (m−n)θ에만 의존</text>
<text x="200" y="275" class="pe4-lbl" fill="var(--text-muted, #6d6762)" text-anchor="middle">절대 위치 없이 상대 거리 인코딩</text>
</svg>
</div>

V에는 회전을 적용하지 않습니다. 위치 정보는 어텐션 가중치를 거쳐서만 전달되고 가중합의 대상인 V는 순수한 내용 벡터로 남습니다. 실무적으로도 장점이 있습니다. K를 회전시킨 채 저장하면 KV Cache와 자연스럽게 양립합니다. 새 토큰이 들어와도 이전 토큰의 K를 다시 계산할 필요가 없죠.

LLaMA(2023)가 RoPE를 채택한 뒤로 Mistral, Qwen, Gemma, DeepSeek까지 2023년 이후 주요 오픈 모델은 사실상 모두 RoPE 계열을 씁니다. 사인·코사인 절대 인코딩에서 시작해 학습 가능한 임베딩, ALiBi를 거쳐 RoPE에 수렴한 셈입니다.

<br>

## 학습 길이 밖에서 무너지는 이유

RoPE가 표준이 됐지만 외삽 문제에서 자유롭지는 않습니다. 차원 쌍마다 주파수가 다르다는 바로 그 구조가 문제를 일으킵니다.

고주파 차원($i$가 작은 쪽)은 회전이 빨라서 학습 구간 안에서 여러 바퀴를 돕니다. 학습 길이를 넘어가도 이미 본 각도가 반복될 뿐이라 큰 문제가 없습니다. 그러나 저주파 차원($i$가 큰 쪽)은 회전이 너무 느려서 학습 구간 전체를 지나도 한 바퀴를 채 돌지 못합니다. 이런 차원은 위치 정보를 실어 나르기보다 의미 정보를 담는 채널처럼 동작하게 되죠. 학습 길이를 넘는 순간 이 저주파 차원이 학습 중 한 번도 도달하지 못한 각도에 놓이면서 어텐션 점수가 불안정해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 235" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="RoPE 주파수 스펙트럼과 저주파 차원의 외삽 위험">
<style>
.pe5-safe { fill: var(--text-success, #107836); fill-opacity: 0.15; stroke: var(--text-success, #107836); stroke-width: 1; rx: 4; }
.pe5-danger { fill: var(--text-danger, #cb2121); fill-opacity: 0.12; stroke: var(--text-danger, #cb2121); stroke-width: 1; rx: 4; }
.pe5-lbl { font-size: 15; text-anchor: middle; }
.pe5-hd { font-size: 15; font-weight: 600; }
.pe5-sub { font-size: 15; fill: var(--text-muted, #6d6762); }
.pe5-brk { stroke: var(--text-danger, #cb2121); stroke-width: 1.5; stroke-dasharray: 5 3; }
.pe5-fix { font-size: 15; font-weight: 600; }
</style>
<defs>
<marker id="pe5-arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0,0 L6,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 스펙트럼 바 -->
<text x="200" y="18" class="pe5-lbl pe5-hd" fill="var(--text, #1c1917)">RoPE 차원별 주파수 스펙트럼</text>
<rect x="40" y="35" width="170" height="40" class="pe5-safe"/>
<text x="125" y="59" class="pe5-lbl" fill="var(--text-success, #107836)" font-weight="600">고주파 (빠른 회전)</text>
<rect x="210" y="35" width="150" height="40" class="pe5-danger"/>
<text x="285" y="59" class="pe5-lbl" fill="var(--text-danger, #cb2121)" font-weight="600">저주파 (느린 회전)</text>
<!-- 차원 범위 -->
<text x="40" y="92" class="pe5-sub" text-anchor="start">i = 0</text>
<text x="360" y="92" class="pe5-sub" text-anchor="end">i = d/2</text>
<line x1="75" y1="87" x2="330" y2="87" stroke="var(--text-muted, #6d6762)" stroke-width="1" marker-end="url(#pe5-arr)"/>
<!-- 구분선: 학습 범위 -->
<line x1="210" y1="30" x2="210" y2="98" class="pe5-brk"/>
<text x="125" y="108" class="pe5-sub" text-anchor="middle">학습 중 여러 바퀴</text>
<text x="285" y="108" class="pe5-sub" text-anchor="middle">학습 중 한 바퀴 미만</text>
<!-- 확장 기법 -->
<text x="40" y="138" class="pe5-hd" fill="var(--text, #1c1917)" text-anchor="start">확장 기법</text>
<line x1="40" y1="148" x2="360" y2="148" stroke="var(--border, #e7e5e4)"/>
<!-- NTK -->
<rect x="40" y="156" width="320" height="3" rx="1" fill="var(--primary, #0a756c)" fill-opacity="0.3"/>
<text x="46" y="172" class="pe5-fix" fill="var(--primary, #0a756c)">NTK: 전체 주파수 압축</text>
<!-- YaRN -->
<rect x="190" y="181" width="170" height="3" rx="1" fill="var(--accent, #9d5604)" fill-opacity="0.4"/>
<text x="196" y="197" class="pe5-fix" fill="var(--accent, #9d5604)">YaRN: 저주파만 보간</text>
<!-- p-RoPE -->
<rect x="210" y="206" width="150" height="3" rx="1" fill="var(--text-danger, #cb2121)" fill-opacity="0.3"/>
<text x="216" y="222" class="pe5-fix" fill="var(--text-danger, #cb2121)">p-RoPE: 저주파 제거</text>
</svg>
</div>

이 문제를 푸는 방향은 셋으로 갈렸습니다.

**NTK-aware scaling**은 base 주파수 10000을 더 큰 값으로 바꿔 모든 차원의 회전 각도를 전체적으로 압축합니다. 학습 길이 밖의 각도가 학습 범위 안으로 들어오지만 고주파 차원의 분해능이 함께 떨어지는 부작용이 있습니다.

**YaRN**(Peng et al., 2023)은 차등 스케일링으로 이 부작용을 줄입니다. 고주파 차원은 그대로 두고 저주파 차원만 선택적으로 보간해서 가까운 토큰의 구분 능력은 유지하면서 먼 토큰의 외삽만 개선합니다.

**p-RoPE**는 가장 급진적인 접근입니다. 문제되는 저주파 차원의 회전을 아예 제거합니다. Gemma 4는 글로벌 어텐션 레이어에서 하위 75% 주파수를 잘라내고 상위 25%만 회전시킵니다(`partial_rotary_factor: 0.25`). 주파수를 조정하는 것이 아니라 삭제하는 것이죠. 잘려나간 차원은 회전 없이 그대로 통과하면서 순수한 의미 채널로 돌아갑니다.

<br>

## 마치며

어텐션이 순서를 모른다는 문제에서 출발해, 절대 위치를 새기는 방식(사인·코사인)에서 상대 위치를 내적에 녹이는 방식(RoPE)으로, 다시 주파수 자체를 재조정하는 단계(NTK, YaRN, p-RoPE)로 왔습니다. 위치 인코딩은 아직 풀린 문제가 아닙니다. 128K, 1M 토큰의 문맥이 가능해진 것은 이 주파수를 다루는 기법 덕이고, 더 긴 문맥은 또 다른 해법을 요구할 것입니다.

Transformer 블록 안에서 남은 것은 레이어를 쌓을 때 출력이 폭발하거나 사라지지 않게 다스리는 일입니다. 정규화와 잔차 연결은 다음 글에서 다룹니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [토큰은 왜 단어가 아닐까](/llm/tokenization-and-embedding/)
- [LLM은 왜 가장 확률 높은 토큰을 고르지 않을까](/llm/text-generation-strategies/)
- [Gemma 4 아키텍처 총정리](/llm/gemma4-architecture/)

<br>

## 참고자료

- [Attention Is All You Need (Vaswani et al., NeurIPS 2017)](https://arxiv.org/abs/1706.03762)
- [RoFormer: Enhanced Transformer with Rotary Position Embedding (Su et al., 2021)](https://arxiv.org/abs/2104.09864)
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805)
- [Train Short, Test Long: Attention with Linear Biases (Press et al., ICLR 2022)](https://arxiv.org/abs/2108.12409)
- [YaRN: Efficient Context Window Extension of Large Language Models (Peng et al., 2023)](https://arxiv.org/abs/2309.00071)
- [Round and Round We Go! What makes Rotary Positional Encodings useful? (2024)](https://arxiv.org/abs/2410.06205)
- [Gemma 4 Model Card (Google AI for Developers)](https://ai.google.dev/gemma/docs/core/model_card_4)
