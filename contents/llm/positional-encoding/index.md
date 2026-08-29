---
date: '2026-08-27'
title: 'Positional Encoding에서 RoPE까지, 어텐션에 순서를 부여하는 법'
category: 'LLM'
series: 'llm'
seriesOrder: 5
tags: ['LLM', 'Positional Encoding', 'RoPE', 'Sinusoidal', 'Transformer']
summary: '어텐션의 내적에는 토큰 순서가 없습니다. 위치 벡터를 더하는 Positional Encoding에서 벡터를 돌리는 RoPE까지, 순서를 부여하는 두 방식의 원리와 차이를 숫자로 따라갑니다.'
thumbnail: './thumbnail.png'
---

어텐션의 내적 $q_i \cdot k_j$에는 토큰의 내용만 들어갑니다. 위치 $i$와 $j$는 어디에도 없죠. "민수는 책을 돌려줬다"와 "책을 민수는 돌려줬다"에서 "돌려줬다"가 받는 어텐션 가중치가 같아집니다. 순서를 모르면 "개가 사람을 물었다"와 "사람이 개를 물었다"를 구분할 수 없으니, 위치 정보를 따로 넣어줘야 합니다.

방법은 크게 두 가지입니다. 위치마다 고유한 벡터를 만들어 토큰에 **더하는** Positional Encoding(2017)과, Q와 K를 위치만큼 **돌려서** 상대 거리를 내적에 새기는 RoPE(2021). 지금 쓰이는 대부분의 오픈 LLM은 RoPE를 씁니다.

<br>

## 어텐션은 순서를 모른다

Transformer의 어텐션 $\text{softmax}(QK^\top / \sqrt{d_k})V$에서 점수를 매기는 부분은 Q와 K의 내적입니다. 토큰 C가 토큰 A에 주는 점수 $q_C \cdot k_A$는 A의 **내용**이 정할 뿐, A가 첫 번째에 있든 세 번째에 있든 달라지지 않습니다.

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

A와 B의 순서를 바꿔도 C가 주는 가중치는 그대로입니다. 가중치가 위치가 아니라 내용을 따라가기 때문이죠. RNN은 토큰을 하나씩 순서대로 처리하니 위치가 자연히 반영되지만 Transformer는 모든 토큰을 한꺼번에 보면서 속도를 얻는 대신 순서 정보를 잃었습니다.

<br>

## Positional Encoding: 위치를 더하다

첫 해법은 단순합니다. 위치마다 고유한 벡터를 하나 만들어서 토큰 임베딩에 더하는 것입니다. 위치 0에는 벡터 A, 위치 1에는 벡터 B... 이 벡터들이 서로 달라야 모델이 "이 토큰은 몇 번째"인지 알 수 있습니다.

"Attention Is All You Need"(2017)의 저자들은 이 벡터를 사인·코사인 함수로 만들었습니다.

$$
PE_{(pos, 2i)} = \sin\!\left(\frac{pos}{10000^{2i/d}}\right), \quad PE_{(pos, 2i+1)} = \cos\!\left(\frac{pos}{10000^{2i/d}}\right)
$$

$pos$는 토큰 위치, $i$는 차원 번호, $d$는 전체 차원 수입니다. 분모 $10000^{2i/d}$가 차원마다 다른 파동 속도를 정합니다.

### 이진 카운터와 같은 원리

원리는 이진수 카운터와 같습니다.

| pos | bit 3 | bit 2 | bit 1 | bit 0 |
|:---:|:-----:|:-----:|:-----:|:-----:|
|  0  |   0   |   0   |   0   |   0   |
|  1  |   0   |   0   |   0   |   1   |
|  2  |   0   |   0   |   1   |   0   |
|  3  |   0   |   0   |   1   |   1   |
|  4  |   0   |   1   |   0   |   0   |

bit 0은 매 위치마다 뒤집히고, bit 1은 두 위치마다, bit 2는 네 위치마다 뒤집힙니다. 어떤 두 위치든 4비트 전체를 보면 반드시 구분할 수 있습니다.

사인·코사인 인코딩은 이 이진 카운터의 연속 버전입니다. 0과 1 대신 −1과 1 사이를 부드럽게 오가는 파동을 쓰고, 각 차원의 파동 속도가 다릅니다. $i$가 작으면 빠르게 변하고(bit 0처럼), $i$가 크면 느리게 변합니다(높은 비트처럼).

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 250" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="차원별 변화 속도 차이를 보여주는 사인 함수 시각화">
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
<!-- 빠르게 변하는 차원 -->
<text x="46" y="18" class="pe2-lbl pe2-dim" fill="var(--primary, #0a756c)">i = 0</text>
<text x="46" y="34" class="pe2-lbl" fill="var(--text-muted, #6d6762)">빠르게 변함</text>
<line x1="60" y1="55" x2="370" y2="55" class="pe2-axis" stroke-dasharray="2 4"/>
<path d="M 60,55 C 79,33 91,33 117.5,55 C 136,77 148,77 175,55 C 194,33 206,33 232.5,55 C 251,77 263,77 290,55 C 309,33 321,33 347.5,55 C 356,63 363,68 370,70" class="pe2-wave pe2-hi"/>
<!-- 중간 -->
<text x="46" y="98" class="pe2-lbl pe2-dim" fill="var(--accent, #9d5604)">i = d/4</text>
<text x="46" y="114" class="pe2-lbl" fill="var(--text-muted, #6d6762)">천천히 변함</text>
<line x1="60" y1="135" x2="370" y2="135" class="pe2-axis" stroke-dasharray="2 4"/>
<path d="M 60,135 C 120,113 180,108 215,113 C 250,118 310,148 370,155" class="pe2-wave pe2-mid"/>
<!-- 느리게 변하는 차원 -->
<text x="46" y="178" class="pe2-lbl pe2-dim" fill="var(--text-muted, #6d6762)">i ≈ d/2</text>
<text x="46" y="194" class="pe2-lbl" fill="var(--text-muted, #6d6762)">거의 안 변함</text>
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

### 숫자로 보기

$d = 4$로 줄여서 확인해 봅시다. 차원 쌍이 두 개입니다. 쌍 0($i = 0$)은 분모가 $10000^{0/4} = 1$이라 위치가 바뀔 때마다 값이 크게 변하고, 쌍 1($i = 1$)은 분모가 $10000^{2/4} = 100$이라 거의 변하지 않습니다.

| pos | 쌍 0: sin | 쌍 0: cos | 쌍 1: sin | 쌍 1: cos |
|:---:|:---------:|:---------:|:---------:|:---------:|
|  0  |     0     |   1.00    |     0     |   1.00    |
|  1  |   0.84    |   0.54    |   0.01    |   1.00    |
|  2  |   0.91    |  −0.42    |   0.02    |   1.00    |
|  3  |   0.14    |  −0.99    |   0.03    |   1.00    |

앞쪽 쌍은 위치마다 값이 크게 뛰고, 뒤쪽 쌍은 거의 정지해 있습니다. 실제 모델에서 $d = 128$이면 64개 쌍이 각각 다른 속도로 변하니 어떤 두 위치의 벡터든 전체로 보면 구분할 수 있습니다.

이 설계에는 장점이 하나 더 있습니다. 위치 0과 위치 3의 인코딩 차이, 위치 100과 위치 103의 인코딩 차이가 같은 패턴을 따릅니다. 모델이 "3칸 앞"이라는 상대 거리를 학습할 수 있는 근거죠.

### 절대 위치의 한계

BERT(2018)와 GPT-2(2019)는 더 단순한 방법을 택했습니다. 사인 함수를 쓰는 대신 위치마다 벡터 하나를 테이블에 넣고 학습시키는 것이죠. BERT는 512개, GPT-2는 1024개 위치의 벡터를 학습했습니다. Vaswani et al.의 실험에서 사인·코사인과 거의 같은 성능을 보였습니다.

사인 함수든 학습 테이블이든 원리는 같습니다. 위치에 정해진 벡터를 토큰에 더합니다. 이런 방식을 **절대 위치 인코딩(Absolute Positional Encoding)**이라 부릅니다. 절대 위치 인코딩에는 두 가지 벽이 있습니다.

첫째, 학습 범위 밖의 위치를 처리하지 못합니다. BERT의 513번째 토큰, GPT-2의 1025번째 토큰은 참조할 벡터가 없죠. 사인 함수는 값 자체는 계산되지만, 학습 중 한 번도 본 적 없는 조합이 등장하면서 성능이 무너집니다.

둘째, 자연어에서 정말 중요한 것은 "742번째 토큰"이 아니라 "주어에서 3칸 뒤"라는 상대 거리입니다. 절대 위치만 주고 상대 거리는 모델이 알아서 파악하길 바라는 셈입니다.

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

<br>

## RoPE: 벡터를 돌리다

절대 위치를 더하는 대신, 상대 거리가 어텐션 점수에 바로 반영되게 만들 수는 없을까요? Su et al.(2021)의 RoPE(Rotary Position Embedding)가 이 질문에 답합니다. 위치 벡터를 더하는 게 아니라 Q와 K를 위치만큼 **돌립니다**.

직관부터 봅시다. 위치 3에 있는 Q는 30도, 위치 7에 있는 K는 70도만큼 돌린다고 합시다. 돌린 뒤에 두 벡터의 내적을 구하면 어떻게 될까요? 내적에는 두 각도의 차이 70 - 30 = 40도만 남습니다. 절대 위치 3과 7은 사라지고 **두 토큰 사이의 거리**만 어텐션 점수에 들어갑니다.

정확히는 벡터의 차원을 두 개씩 묶어 각 쌍을 서로 다른 속도로 회전시킵니다. 차원 쌍 $(2i, 2i+1)$의 회전 공식은 이렇습니다.

$$
\begin{pmatrix} q_m^{(2i)} \\ q_m^{(2i+1)} \end{pmatrix} = \begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix} \begin{pmatrix} q^{(2i)} \\ q^{(2i+1)} \end{pmatrix}
$$

$m$은 토큰 위치, $\theta_i = 10000^{-2i/d}$는 차원 쌍마다 정해진 회전 속도입니다. 사인·코사인 인코딩과 같은 base 10000을 쓰는 건 우연이 아닙니다. 어떤 차원 쌍은 빠르게 돌아서 가까운 토큰을 구분하고, 어떤 차원 쌍은 느리게 돌아서 먼 토큰까지 커버합니다.

K에도 같은 회전을 적용합니다. 위치 $n$의 K는 $n\theta_i$만큼 돌죠. 핵심은 회전된 Q와 K의 내적이 각도 **차이** $(m - n)\theta_i$에만 의존한다는 점입니다. 나침반 바늘 두 개를 각각 다른 만큼 돌리면, 바늘 사이의 각도는 "얼마나 차이 나게 돌렸는지"로만 정해지는 것과 같습니다.

### 숫자로 확인하기

한 차원 쌍에서 어떤 일이 벌어지는지 따라가 봅시다. 원래 벡터가 $(1, 0)$이고 $\theta = 10^\circ$라면, 위치 $m$의 벡터는 $m \times 10^\circ$만큼 회전합니다.

**Q가 위치 3, K가 위치 5에 있을 때** (거리 2):

$$
Q_{rot} = (\cos 30^\circ,\; \sin 30^\circ) = (0.87,\; 0.50)
$$

$$
K_{rot} = (\cos 50^\circ,\; \sin 50^\circ) = (0.64,\; 0.77)
$$

$$
Q_{rot} \cdot K_{rot} = 0.87 \times 0.64 + 0.50 \times 0.77 \approx \mathbf{0.94}
$$

**Q가 위치 6, K가 위치 8에 있을 때** (거리 2):

$$
Q_{rot} = (\cos 60^\circ,\; \sin 60^\circ) = (0.50,\; 0.87)
$$

$$
K_{rot} = (\cos 80^\circ,\; \sin 80^\circ) = (0.17,\; 0.98)
$$

$$
Q_{rot} \cdot K_{rot} = 0.50 \times 0.17 + 0.87 \times 0.98 \approx \mathbf{0.94}
$$

절대 위치는 (3, 5)에서 (6, 8)로 바뀌었지만 내적은 똑같이 0.94입니다. 두 경우 모두 $\cos 20^\circ \approx 0.94$, 상대 거리 2에 해당하는 값이죠. 내적이 절대 위치가 아니라 **상대 거리에만** 의존한다는 것을 숫자로 확인할 수 있습니다.

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

V에는 회전을 적용하지 않습니다. 위치 정보는 어텐션 가중치를 거쳐서만 전달됩니다. K를 회전시킨 채 저장하면 KV Cache(추론 때 이전 토큰의 K, V를 재활용하는 저장소)와도 양립하죠. 이전 토큰의 K를 다시 계산할 필요가 없습니다.

LLaMA(2023) 이후 Mistral, Qwen, Gemma, DeepSeek까지 주요 오픈 모델은 사실상 전부 RoPE를 씁니다.

<br>

## 더하기와 돌리기

두 방식의 차이를 정리하면 이렇습니다.

|                      | Positional Encoding (더하기)  | RoPE (돌리기)                      |
|----------------------|-------------------------------|------------------------------------|
| **적용 대상**         | 토큰 임베딩 전체               | Q와 K만                            |
| **위치 정보의 종류**  | 절대 위치 ("742번째")          | 상대 거리 ("3칸 앞")                |
| **V에 미치는 영향**   | V에도 위치 정보가 섞임         | V는 순수 의미만 보존                |
| **학습 범위 밖**      | 성능 급락                      | 깨지지만 차원별 보간으로 복구 가능  |

가장 큰 차이는 위치 정보가 들어가는 지점입니다. Positional Encoding은 입력 단계에서 임베딩에 위치를 섞습니다. 위치 정보가 모든 하위 레이어로 퍼지고 V에도 들어가죠. 모델이 절대 위치와 의미 정보를 스스로 분리해야 합니다.

RoPE는 어텐션 점수를 계산하는 순간에만 위치가 개입합니다. Q와 K의 각도를 틀어서 "얼마나 떨어져 있는가"를 내적에 새기고, V는 건드리지 않습니다. 위치 채널과 의미 채널이 구조적으로 분리되는 셈입니다.

<br>

## 학습 범위 밖에서 깨지는 이유

RoPE가 표준이 됐지만 학습 길이를 넘으면 역시 깨집니다. 원인은 차원 쌍마다 회전 속도가 다르다는 바로 그 구조에 있습니다.

빠르게 도는 차원 쌍은 학습 구간 안에서 여러 바퀴를 돕니다. 학습 범위를 넘어도 이미 본 각도가 반복될 뿐이라 괜찮습니다. 문제는 느리게 도는 차원 쌍입니다. 학습 내내 한 바퀴도 못 도는 차원은 위치보다는 의미 정보를 담는 채널처럼 동작하게 됩니다. 학습 범위를 넘는 순간 이 차원이 한 번도 본 적 없는 각도에 놓이면서 어텐션 점수가 불안정해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 210" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="RoPE 차원별 회전 속도와 학습 범위 밖의 위험">
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
<text x="200" y="18" class="pe5-lbl pe5-hd" fill="var(--text, #1c1917)">차원별 회전 속도</text>
<rect x="40" y="35" width="170" height="40" class="pe5-safe"/>
<text x="125" y="59" class="pe5-lbl" fill="var(--text-success, #107836)" font-weight="600">빠르게 도는 차원</text>
<rect x="210" y="35" width="150" height="40" class="pe5-danger"/>
<text x="285" y="59" class="pe5-lbl" fill="var(--text-danger, #cb2121)" font-weight="600">느리게 도는 차원</text>
<!-- 차원 범위 -->
<text x="40" y="92" class="pe5-sub" text-anchor="start">i = 0</text>
<text x="360" y="92" class="pe5-sub" text-anchor="end">i = d/2</text>
<line x1="75" y1="87" x2="330" y2="87" stroke="var(--text-muted, #6d6762)" stroke-width="1" marker-end="url(#pe5-arr)"/>
<!-- 구분선 -->
<line x1="210" y1="30" x2="210" y2="98" class="pe5-brk"/>
<text x="125" y="108" class="pe5-sub" text-anchor="middle">학습 중 여러 바퀴</text>
<text x="285" y="108" class="pe5-sub" text-anchor="middle">한 바퀴 미만</text>
<!-- 확장 기법 -->
<text x="40" y="140" class="pe5-hd" fill="var(--text, #1c1917)" text-anchor="start">확장 기법</text>
<line x1="40" y1="150" x2="360" y2="150" stroke="var(--border, #e7e5e4)"/>
<!-- YaRN -->
<rect x="190" y="158" width="170" height="3" rx="1" fill="var(--accent, #9d5604)" fill-opacity="0.4"/>
<text x="196" y="174" class="pe5-fix" fill="var(--accent, #9d5604)">YaRN: 느린 차원만 보간</text>
<!-- p-RoPE -->
<rect x="210" y="183" width="150" height="3" rx="1" fill="var(--text-danger, #cb2121)" fill-opacity="0.3"/>
<text x="216" y="199" class="pe5-fix" fill="var(--text-danger, #cb2121)">p-RoPE: 느린 차원 제거</text>
</svg>
</div>

이 문제를 해결하는 대표적인 기법이 두 가지 있습니다.

**YaRN**(Peng et al., 2023)은 빠르게 도는 차원은 그대로 두고 느리게 도는 차원만 골라서 회전 간격을 보간합니다. 가까운 토큰을 구분하는 능력은 유지하면서 먼 토큰에서의 깨짐만 고치는 방식입니다.

**p-RoPE**는 더 과감합니다. 느리게 도는 차원의 회전을 아예 제거합니다. Gemma 4는 글로벌 어텐션 레이어에서 가장 느린 75%의 차원 쌍을 잘라내고 나머지 25%만 회전시킵니다(`partial_rotary_factor: 0.25`). 잘려나간 차원은 회전 없이 그대로 통과하면서 순수한 의미 채널로 돌아갑니다. 조정이 아니라 삭제입니다.

128K, 1M 토큰의 긴 문맥이 가능해진 것은 이런 확장 기법 덕입니다.

<br>

## 마치며

어텐션이 순서를 모른다는 문제에서 출발해 두 가지 해법을 살펴봤습니다. Positional Encoding은 위치 벡터를 임베딩에 더해서 절대 좌표를 알려주고, RoPE는 Q와 K를 회전시켜 상대 거리를 내적에 새깁니다. RoPE도 학습 범위 밖에서는 깨지니 어떤 차원을 돌리고 어떤 차원은 빼는 선택이 이어지고 있고, 위치 인코딩은 아직 풀린 문제가 아닙니다.

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
- [YaRN: Efficient Context Window Extension of Large Language Models (Peng et al., 2023)](https://arxiv.org/abs/2309.00071)
- [Round and Round We Go! What makes Rotary Positional Encodings useful? (2024)](https://arxiv.org/abs/2410.06205)
- [Gemma 4 Model Card (Google AI for Developers)](https://ai.google.dev/gemma/docs/core/model_card_4)
