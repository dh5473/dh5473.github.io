---
date: '2026-01-22'
title: '활성화 함수는 왜 ReLU로 정착했나'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 22
tags: ['Activation Function', '활성화 함수', 'ReLU', 'Sigmoid', 'Tanh', 'GELU', 'Softmax', '기울기 소실', '머신러닝']
summary: '시그모이드 도함수의 최댓값 0.25가 만든 기울기 소실, ReLU가 그 벽을 넘은 방식, GELU까지 이어진 은닉층 선택 기준을 정리한다.'
thumbnail: './thumbnail.png'
---

신경망의 한 층은 두 단계로 나뉜다. 선형 변환 $z = Wx + b$ 로 입력을 섞고, 활성화 함수 $g$ 를 씌워 $a = g(z)$ 를 내보낸다. 앞쪽 절반은 어느 층이나 똑같다. 층을 깊게 쌓을 수 있느냐 없느냐는 뒤에 붙는 $g$ 하나가 결정한다.

## 비선형이 없으면 깊이도 없다

$g$ 가 항등 함수라면, 즉 $a = z$ 를 그대로 내보낸다면 2층짜리 신경망의 출력은 이렇게 전개된다.

$$z_2 = W_2(W_1 x + b_1) + b_2 = (W_2 W_1)\,x + (W_2 b_1 + b_2)$$

$W' = W_2 W_1$, $b' = W_2 b_1 + b_2$ 로 묶으면 $z_2 = W'x + b'$ 다. **두 층을 쌓았는데 결과는 한 층짜리 선형 변환과 같다.** 선형 함수를 아무리 합성해도 선형이라서, 100층을 쌓아도 표현력은 한 층과 동일하다.

비선형 활성화 함수는 이 붕괴를 막는 장치다. 그렇다면 어떤 비선형 함수를 골라야 하는가. 그 답은 30년에 걸쳐 바뀌었다.

## 시그모이드가 세운 벽

$$\sigma(z) = \frac{1}{1 + e^{-z}}$$

출력이 $(0, 1)$ 로 떨어지고 어디서나 매끄럽게 미분된다. 도함수도 깔끔하다.

$$\sigma'(z) = \sigma(z)\bigl(1 - \sigma(z)\bigr)$$

문제는 이 도함수의 크기다. $z = 0$ 에서 최댓값을 갖는데 그 값이 $0.5 \times 0.5 = 0.25$ 다. 1보다 한참 작다.

역전파는 연쇄 법칙으로 기울기를 뒤로 보내면서 층마다 활성화 함수의 도함수를 곱한다. 곱해지는 수가 매번 0.25 이하라면 기울기는 층을 거슬러 올라갈수록 기하급수적으로 줄어든다.

$$0.25^5 \approx 9.8 \times 10^{-4}, \qquad 0.25^{10} \approx 9.5 \times 10^{-7}$$

10층만 거슬러 올라가도 기울기가 백만분의 1이 된다. 앞쪽 층의 가중치는 사실상 업데이트되지 않고 학습이 그 자리에 멈춘다. 이것이 **기울기 소실(Vanishing Gradient)** 이고, 2000년대까지 깊은 신경망을 실용화하지 못한 가장 큰 원인이었다.

게다가 0.25는 최선의 경우다. $|z|$ 가 조금만 커져도 시그모이드는 0이나 1에 붙어버리고 도함수는 0으로 수렴한다. 이 상태를 **포화(saturation)** 라 한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 396" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="시그모이드와 tanh, ReLU의 도함수를 위아래로 쌓아 비교한 그림. 시그모이드 도함수는 최댓값이 0.25에 그치고 입력의 절댓값이 3을 넘으면 0에 붙는다. tanh 도함수는 최댓값이 1이지만 절댓값 2.5부터 0에 붙는다. ReLU 도함수는 양의 구간 전체에서 정확히 1이고 음의 구간에서만 0이다.">
<style>
.af1-box { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.af1-dead { fill: var(--bg-danger, #fef2f2); }
.af1-curve { fill: none; stroke: var(--primary, #0a756c); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.af1-guide { stroke: var(--text-muted, #6d6762); stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
.af1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.af1-n { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.af1-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
.af1-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
</style>
<!-- 제목과 범례 -->
<text class="af1-t" x="200" y="24" text-anchor="middle">도함수 g'(z)와 포화 구간</text>
<rect class="af1-dead" x="140" y="36" width="20" height="12" stroke="var(--text-danger, #cb2121)" stroke-width="1"/>
<text class="af1-d" x="167" y="46">도함수 ≈ 0</text>
<!-- 시그모이드 -->
<text class="af1-n" x="70" y="74">시그모이드</text>
<text class="af1-h" x="374" y="74" text-anchor="end">최댓값 0.25</text>
<rect class="af1-dead" x="70" y="82" width="38" height="66"/>
<rect class="af1-dead" x="336" y="82" width="38" height="66"/>
<rect class="af1-box" x="70" y="82" width="304" height="66"/>
<path class="af1-guide" d="M 70 88 L 374 88"/>
<text class="af1-h" x="64" y="92" text-anchor="end">1.0</text>
<path class="af1-guide" d="M 70 133 L 374 133"/>
<text class="af1-h" x="64" y="137" text-anchor="end">0.25</text>
<polyline class="af1-curve" points="70,146.9 89,146.3 108,145.3 127,143.8 146,141.7 165,139.1 184,136.2 203,133.9 222,133 241,133.9 260,136.2 279,139.1 298,141.7 317,143.8 336,145.3 355,146.3 374,146.9"/>
<!-- tanh -->
<text class="af1-n" x="70" y="180">tanh</text>
<text class="af1-h" x="374" y="180" text-anchor="end">최댓값 1.0</text>
<rect class="af1-dead" x="70" y="188" width="57" height="66"/>
<rect class="af1-dead" x="317" y="188" width="57" height="66"/>
<rect class="af1-box" x="70" y="188" width="304" height="66"/>
<path class="af1-guide" d="M 70 194 L 374 194"/>
<text class="af1-h" x="64" y="198" text-anchor="end">1.0</text>
<polyline class="af1-curve" points="70,253.9 89,253.8 108,253.4 127,252.4 146,249.8 165,243.2 184,228.8 203,206.8 222,194 241,206.8 260,228.8 279,243.2 298,249.8 317,252.4 336,253.4 355,253.8 374,253.9"/>
<!-- ReLU -->
<text class="af1-n" x="70" y="286">ReLU</text>
<text class="af1-h" x="374" y="286" text-anchor="end">양의 구간에서 1</text>
<rect class="af1-dead" x="70" y="294" width="152" height="66"/>
<rect class="af1-box" x="70" y="294" width="304" height="66"/>
<text class="af1-h" x="64" y="304" text-anchor="end">1.0</text>
<path class="af1-guide" d="M 222 360 L 222 300"/>
<path class="af1-curve" d="M 70 360 L 222 360"/>
<path class="af1-curve" d="M 222 300 L 374 300"/>
<!-- 입력 축 눈금 -->
<text class="af1-h" x="70" y="378" text-anchor="middle">-4</text>
<text class="af1-h" x="146" y="378" text-anchor="middle">-2</text>
<text class="af1-h" x="222" y="378" text-anchor="middle">0</text>
<text class="af1-h" x="298" y="378" text-anchor="middle">2</text>
<text class="af1-h" x="374" y="378" text-anchor="middle">4</text>
</svg>
</div>

시그모이드에는 문제가 두 개 더 있다. 출력이 항상 양수라 다음 층이 받는 입력의 부호가 한쪽으로 쏠리고, 그러면 한 뉴런에 들어오는 가중치들의 기울기가 모두 같은 부호가 되어 최적화 경로가 지그재그를 그린다. 그리고 $e^{-z}$ 계산은 비교 연산보다 비싸다. 수백만 뉴런에 매 순전파마다 적용되면 무시하기 어려운 비용이 된다.

은닉층에 시그모이드를 쓸 이유는 없다. 이진 분류의 출력층에서만 쓴다.

## tanh는 4배 나은 출발점이었다

$$\tanh(z) = \frac{e^z - e^{-z}}{e^z + e^{-z}} = 2\sigma(2z) - 1$$

시그모이드를 위아래로 늘려 원점 대칭으로 만든 함수다. 출력이 $(-1, 1)$ 이라 부호 쏠림이 사라지고, 도함수도 커진다.

$$\tanh'(z) = 1 - \tanh^2(z), \qquad \tanh'(0) = 1$$

최댓값이 1이니 시그모이드의 4배다. 그만큼 기울기가 덜 줄어든다. 하지만 위 그림의 가운데 칸이 보여주듯 $|z|$ 가 2.5만 넘어도 도함수가 0.03 아래로 떨어진다. 포화의 벽 자체는 그대로 남아 있다. ReLU 이전까지 은닉층의 기본값이었지만, 깊은 망에서는 결국 같은 곳에서 막혔다.

## ReLU가 벽을 통과한 방법

$$f(z) = \max(0, z)$$

2012년 AlexNet이 ImageNet 대회를 압도하며 딥러닝 시대를 열었을 때, 그 성공의 조용한 지분을 가진 함수다. 양수면 그대로 통과시키고 음수면 0으로 자른다. 도함수는 $z > 0$ 에서 1, $z < 0$ 에서 0이다. $z = 0$ 에서는 미분이 정의되지 않지만 구현에서는 0이나 1 하나로 처리한다.

이 단순한 정의가 두 가지를 동시에 해결한다.

**기울기가 줄지 않는다.** 양의 구간에서 도함수가 정확히 1이므로 층을 몇 개 거치든 $1^n = 1$ 이다. 시그모이드가 10층에서 $10^{-6}$ 로 사라지는 자리에서 ReLU는 기울기 크기를 그대로 넘긴다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 324" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="역전파로 층을 거슬러 오를 때 남는 기울기 크기를 막대로 그린 그림. 시그모이드는 층마다 0.25가 곱해져 1, 0.25, 0.063, 0.016, 0.0039, 0.00098로 줄어들고 세 층째부터 막대가 거의 보이지 않는다. ReLU는 양의 구간에서 도함수가 1이라 모든 층에서 크기가 그대로 유지된다.">
<style>
.vg1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.vg1-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
.vg1-s { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 600; }
.vg1-r { fill: var(--primary, #0a756c); font-size: 15px; font-weight: 600; }
.vg1-v { fill: var(--text-danger, #cb2121); font-size: 14px; }
.vg1-bar { fill: var(--text-danger, #cb2121); }
.vg1-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.4; fill: none; }
.vg1-grid { stroke: var(--border, #e7e5e4); stroke-width: 1; stroke-dasharray: 4 3; fill: none; }
</style>
<!-- 제목과 축척 고지 -->
<text class="vg1-t" x="200" y="26" text-anchor="middle">층을 거슬러 오를 때 남는 기울기</text>
<text class="vg1-h" x="200" y="48" text-anchor="middle">막대 높이는 실제 비율</text>
<!-- 계열 이름 -->
<text class="vg1-s" x="56" y="96">시그모이드</text>
<text class="vg1-r" x="380" y="96" text-anchor="end">ReLU (z &gt; 0)</text>
<!-- 축과 눈금 -->
<path class="vg1-axis" d="M 56 104 L 56 264 L 380 264"/>
<path class="vg1-grid" d="M 56 184 L 380 184"/>
<text class="vg1-h" x="52" y="109" text-anchor="end">1.0</text>
<text class="vg1-h" x="52" y="189" text-anchor="end">0.5</text>
<text class="vg1-h" x="52" y="269" text-anchor="end">0</text>
<text class="vg1-h" x="18" y="184" text-anchor="middle" transform="rotate(-90 18 184)">기울기 크기</text>
<!-- ReLU: 모든 층에서 1 -->
<path d="M 56 104 L 380 104" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<!-- 시그모이드: 층마다 0.25배 -->
<rect class="vg1-bar" x="70" y="104" width="26" height="160"/>
<rect class="vg1-bar" x="124" y="224" width="26" height="40"/>
<rect class="vg1-bar" x="178" y="254" width="26" height="10"/>
<rect class="vg1-bar" x="232" y="261.5" width="26" height="2.5"/>
<rect class="vg1-bar" x="286" y="263.37" width="26" height="0.63"/>
<rect class="vg1-bar" x="340" y="263.84" width="26" height="0.16"/>
<text class="vg1-v" x="137" y="218" text-anchor="middle">0.25</text>
<text class="vg1-v" x="191" y="248" text-anchor="middle">0.063</text>
<text class="vg1-v" x="245" y="255" text-anchor="middle">0.016</text>
<text class="vg1-v" x="299" y="257" text-anchor="middle">0.0039</text>
<text class="vg1-v" x="353" y="257" text-anchor="middle">0.00098</text>
<!-- 층 번호 -->
<text class="vg1-h" x="83" y="284" text-anchor="middle">0</text>
<text class="vg1-h" x="137" y="284" text-anchor="middle">1</text>
<text class="vg1-h" x="191" y="284" text-anchor="middle">2</text>
<text class="vg1-h" x="245" y="284" text-anchor="middle">3</text>
<text class="vg1-h" x="299" y="284" text-anchor="middle">4</text>
<text class="vg1-h" x="353" y="284" text-anchor="middle">5</text>
<text class="vg1-h" x="200" y="310" text-anchor="middle">역전파로 거슬러 오른 층 수</text>
</svg>
</div>

**계산이 거의 공짜다.** 지수도 나눗셈도 없고 비교 하나면 끝난다. GPU에서 병렬화하기에도 이보다 나은 형태가 없다. 부수 효과로 입력의 절반 가까이가 0이 되면서 층의 표현이 자연히 희소해진다.

### Dying ReLU

대가도 있다. $z < 0$ 에서 도함수가 0이라, 어떤 뉴런의 입력이 모든 데이터에서 음수가 되는 상태에 빠지면 그 뉴런은 기울기를 한 방울도 받지 못한다. 가중치가 갱신되지 않으니 그 상태에서 나올 방법도 없다. 영구히 죽은 뉴런이 되는 것이다.

학습률이 크면 한 번의 큰 업데이트가 뉴런을 이 상태로 밀어넣기 쉽다. 학습률을 낮추거나, 아래의 Leaky ReLU 계열로 바꾸는 것이 표준 대응이다.

:::tip

**은닉층은 ReLU에서 시작한다**

기울기 보존과 계산 비용, 두 축에서 동시에 유리한 함수는 여전히 ReLU다. 다른 함수는 ReLU로 학습이 안 될 때 꺼내는 카드다.

:::

## 음의 구간을 되살리는 계열

죽은 뉴런을 막는 가장 직관적인 수정은 음의 구간에 아주 작은 기울기를 남기는 것이다. **Leaky ReLU**가 그렇게 한다.

$$f(z) = \begin{cases} z & (z > 0) \\ \alpha z & (z \le 0) \end{cases} \qquad \alpha = 0.01$$

음수 입력에서도 도함수가 $\alpha$ 이므로 갱신량이 0이 되지 않고, 뉴런이 음의 영역에서 되돌아 나올 길이 열린다. **PReLU**는 이 $\alpha$ 를 상수로 두지 않고 역전파로 학습시킨다. 층마다 적절한 누출량을 망이 직접 정하는 셈이다.

**ELU**는 꺾인 직선 대신 지수 곡선으로 음의 구간을 처리한다.

$$f(z) = \begin{cases} z & (z > 0) \\ \alpha(e^z - 1) & (z \le 0) \end{cases}$$

$z$ 가 작아질수록 $-\alpha$ 에 부드럽게 수렴하므로 출력 평균이 0에 가까워지고, 그만큼 층 사이 신호가 안정된다. 대신 $e^z$ 를 계산해야 해서 ReLU의 속도 이점을 일부 반납한다. ELU에 고정 상수 두 개($\lambda \approx 1.0507$, $\alpha \approx 1.6733$)를 곱한 **SELU**는 조건이 맞으면 층 출력이 스스로 정규화되는 성질을 갖지만, 완전 연결 망과 특정 초기화를 요구해서 CNN이나 트랜스포머에서는 쓰이지 않는다.

## 부드럽게 여닫는 GELU와 Swish

ReLU는 0을 기준으로 통과와 차단을 이분법으로 가른다. **GELU(Gaussian Error Linear Unit)** 는 그 경계를 확률로 문지른다.

$$\mathrm{GELU}(z) = z \cdot \Phi(z)$$

$\Phi$ 는 표준정규분포의 누적분포함수다. 입력에 "이 값이 통과할 만큼 큰가"의 확률을 곱하는 구조라, $z$ 가 크면 거의 그대로 나가고 작으면 거의 0이 된다. 정규분포 CDF를 매번 계산하는 비용이 부담이라 실전에서는 근사식을 쓴다.

$$\mathrm{GELU}(z) \approx 0.5\,z\left(1 + \tanh\!\left(\sqrt{\tfrac{2}{\pi}}\,(z + 0.044715\,z^3)\right)\right)$$

경계 부근이 매끄러워 미세한 입력 차이가 출력 차이로 남고, $z$ 가 살짝 음수인 구간에서 출력이 아주 조금 음수가 되는 비단조 구간을 갖는다. BERT, GPT, ViT를 비롯한 트랜스포머 계열에서 사실상 기본값이다.

**Swish**는 같은 발상을 더 싸게 구현한다. 정규분포 CDF 자리에 시그모이드를 넣는다.

$$\mathrm{Swish}(z) = z \cdot \sigma(z)$$

$z$ 가 크면 $\sigma(z) \approx 1$ 이라 항등 함수처럼, 작으면 $\sigma(z) \approx 0$ 이라 차단처럼 동작한다. EfficientNet 계열의 비전 모델에서 ReLU를 대체해 성능 향상을 보였다.

## 한눈에 비교

| 함수 | 정의 | 출력 범위 | 도함수 최댓값 | 기울기 소실 | 계산 비용 |
|---|---|---|---|---|---|
| Sigmoid | $\sigma(z)$ | $(0, 1)$ | 0.25 | 심각 | 높음 |
| Tanh | $2\sigma(2z) - 1$ | $(-1, 1)$ | 1 | 있음 | 높음 |
| ReLU | $\max(0, z)$ | $[0, \infty)$ | 1 | 없음 ($z>0$) | 매우 낮음 |
| Leaky ReLU | $\max(\alpha z, z)$ | $(-\infty, \infty)$ | 1 | 없음 | 매우 낮음 |
| ELU | $z$ 또는 $\alpha(e^z-1)$ | $(-\alpha, \infty)$ | 1 | 없음 | 중간 |
| GELU | $z\,\Phi(z)$ | 약 $(-0.17, \infty)$ | 약 1.13 | 없음 | 중간 |
| Swish | $z\,\sigma(z)$ | 약 $(-0.28, \infty)$ | 약 1.10 | 없음 | 중간 |

## 출력층은 다른 문제다

여기까지는 은닉층 이야기다. 출력층의 활성화 함수는 기울기 흐름이 아니라 **출력이 무엇을 의미해야 하는가**로 정해진다.

다중 클래스 분류에는 Softmax를 쓴다. $K$ 개의 점수를 모두 양수로 만든 뒤 합이 1이 되도록 나눠서 확률로 바꾼다.

$$\mathrm{Softmax}(z_i) = \frac{e^{z_i}}{\sum_j e^{z_j}}$$

$z = [2.0,\ 1.0,\ 0.1]$ 이면 $e^{z}$ 는 각각 7.389, 2.718, 1.105이고 합이 11.212다. 나누면 $[0.659,\ 0.242,\ 0.099]$ 가 된다.

Softmax 출력층에는 교차 엔트로피 손실이 짝을 이룬다. 두 함수를 합쳐서 미분하면 중간 항이 모두 상쇄되고 이 형태만 남기 때문이다.

$$\frac{\partial L}{\partial z_i} = \hat{y}_i - y_i$$

예측에서 정답을 뺀 값이 그대로 기울기가 된다. 구현이 짧아지는 것은 물론이고, 지수와 로그가 서로를 지워서 수치적으로도 안정적이다.

Softmax를 직접 구현한다면 지수를 취하기 전에 최댓값을 빼야 한다. $z$ 가 조금만 커도 $e^{z}$ 가 부동소수점 범위를 넘어 `inf`가 되는데, 모든 원소에서 같은 상수를 빼면 분모와 분자가 함께 나뉘어 결과는 그대로이면서 지수의 크기만 눌린다. NumPy로는 `np.exp(z - np.max(z))` 한 줄이다.

## 무엇을 언제 쓰나

| 자리 | 선택 | 근거 |
|---|---|---|
| 은닉층 기본 | ReLU | 기울기 보존과 계산 비용 |
| 죽은 뉴런이 의심될 때 | Leaky ReLU, PReLU | 음의 구간에도 기울기 $\alpha$ |
| 트랜스포머 계열 | GELU | 경계 부근의 부드러운 게이팅 |
| 이진 분류 출력층 | Sigmoid | 값 하나를 확률로 |
| 다중 분류 출력층 | Softmax | $K$ 개 확률의 합이 1 |
| 회귀 출력층 | 없음 | 실수 전 범위가 필요 |

PyTorch의 `nn.Linear`도 TensorFlow의 `Dense`도 기본값은 활성화 없음이다. 어느 쪽이든 직접 지정하지 않으면 선형 층만 쌓이고, 이 글 첫머리의 붕괴가 그대로 일어난다.

## 마치며

활성화 함수를 고르는 문제는 결국 "역전파에서 곱해질 수를 얼마로 둘 것인가"의 문제였다. 시그모이드는 그 수의 상한이 0.25였고, 그래서 깊이가 곧 학습 불가능을 뜻했다. tanh가 상한을 1로 올렸지만 포화 구간은 남았다. ReLU는 필요한 구간에서 그 수를 정확히 1로 고정해 문제를 없앴고, 대신 반대편 절반을 완전히 포기했다. Leaky ReLU와 GELU는 포기한 절반을 조금씩 되찾는 서로 다른 방식이다.

활성화 함수를 정했다면 다음 질문은 계산된 기울기를 어떤 규칙으로 파라미터에 반영할 것인가다. 학습률 하나로 모든 파라미터를 똑같이 움직이는 방식에는 한계가 있다.

## 함께 보면 좋은 글

- [역전파](/ml/backpropagation/) : 활성화 함수의 도함수가 층마다 곱해지는 과정
- [옵티마이저](/ml/optimizers/) : 전달된 기울기를 어떤 규칙으로 쓸지의 문제
- [신경망 학습 안정화](/ml/neural-network-tips/) : 초기화와 정규화로 층 사이 신호 크기를 잡는 법
- [로지스틱 회귀](/ml/logistic-regression/) : 시그모이드가 확률로 해석되는 자리

## 참고자료

- [Glorot, Bordes, Bengio, Deep Sparse Rectifier Neural Networks (AISTATS 2011)](https://proceedings.mlr.press/v15/glorot11a.html)
- [He et al., Delving Deep into Rectifiers (arXiv 1502.01852)](https://arxiv.org/abs/1502.01852)
- [Hendrycks, Gimpel, Gaussian Error Linear Units (arXiv 1606.08415)](https://arxiv.org/abs/1606.08415)
- [Ramachandran et al., Searching for Activation Functions (arXiv 1710.05941)](https://arxiv.org/abs/1710.05941)
- [CS231n, Neural Networks Part 1](https://cs231n.github.io/neural-networks-1/)
