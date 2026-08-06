---
date: '2026-01-21'
title: '연쇄 법칙으로 기울기를 되돌리는 역전파'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 21
tags: ['Backpropagation', '역전파', 'Chain Rule', '연쇄 법칙', '기울기 소실', 'Neural Network', '머신러닝']
summary: '손실에서 출발해 각 층의 가중치가 오차에 얼마나 기여했는지를 연쇄 법칙으로 역산하는 과정, 그리고 그 곱셈 사슬이 기울기 소실을 낳는 이유를 정리한다.'
thumbnail: './thumbnail.png'
---

경사하강법의 업데이트 규칙 자체는 간단하다.

$$w \leftarrow w - \alpha \frac{\partial L}{\partial w}$$

필요한 것은 $\partial L / \partial w$ 하나다. 선형 회귀에서는 이 미분을 손으로 바로 구할 수 있었다. 신경망은 다르다. 손실은 마지막 층의 출력에서 계산되는데, 첫 층의 가중치는 그 출력에 닿기까지 층을 몇 개나 거친다. 각 층에는 활성화 함수까지 끼어 있어서, 입력에서 손실까지가 합성 함수를 겹겹이 쌓아 올린 구조가 된다.

**역전파(Backpropagation)** 는 이 합성 함수의 편미분을 층마다 딱 한 번씩만 계산해서 전부 구해내는 알고리즘이다. 새로운 수학은 없다. 미적분의 연쇄 법칙 하나를 출력 쪽에서 입력 쪽으로 순서대로 적용할 뿐이다.

---

## 연쇄 법칙 하나면 된다

합성 함수의 미분은 바깥 함수의 미분과 안쪽 함수의 미분을 곱한 것이다.

$$y = f(g(x)) \quad \Longrightarrow \quad \frac{dy}{dx} = \frac{dy}{dg} \cdot \frac{dg}{dx}$$

$g(x) = 3x+1$, $f(g) = g^2$이라면 $dg/dx = 3$이고 $df/dg = 2g = 2(3x+1)$이므로 $dy/dx = 6(3x+1)$이다. $y = 9x^2+6x+1$로 전개해서 미분한 $18x+6$과 같은 식이다.

함수가 셋 이상 겹쳐도 규칙은 그대로다. 중간 항이 하나 늘어나면 곱할 항이 하나 늘어난다.

$$y = f(g(h(x))) \quad \Longrightarrow \quad \frac{dy}{dx} = \frac{dy}{dg} \cdot \frac{dg}{dh} \cdot \frac{dh}{dx}$$

신경망에 그대로 대입해 보면 이 사슬이 왜 필요한지가 보인다. 손실 $L$은 예측값 $a$의 함수이고, $a$는 가중합 $z$의 함수이고, $z$는 가중치 $w$의 함수다. $L \to a \to z \to w$라는 사슬을 따라 편미분을 줄줄이 곱해야 $\partial L / \partial w$가 나온다.

---

## 작은 네트워크로 한 번 따라가기

입력 하나, 뉴런 하나짜리 은닉층 하나, 출력 하나인 최소 구조로 손 계산을 해 본다. 편향은 생략하고, 활성화 함수는 시그모이드, 손실은 $L = (y - a_2)^2$다.

$$x \xrightarrow{\ w_1\ } z_1 \xrightarrow{\ \sigma\ } a_1 \xrightarrow{\ w_2\ } z_2 \xrightarrow{\ \sigma\ } a_2 \longrightarrow L$$

$x = 0.5$, $y = 1$, 초기 가중치는 $w_1 = 0.8$, $w_2 = 0.6$이다. 순전파를 돌리면 $z_1 = 0.4$, $a_1 = \sigma(0.4) \approx 0.5987$, $z_2 = 0.3592$, $a_2 \approx 0.5888$이 나오고 손실은 $(1 - 0.5888)^2 \approx 0.169$다.

### 출력에 가까운 쪽부터

$w_2$가 손실에 닿는 경로는 $z_2$ 하나뿐이라 사슬이 짧다.

$$\frac{\partial L}{\partial w_2} = \frac{\partial L}{\partial a_2} \cdot \frac{\partial a_2}{\partial z_2} \cdot \frac{\partial z_2}{\partial w_2}$$

$w_1$은 한 층 더 앞에 있으니 $a_1$과 $z_1$을 거치는 만큼 사슬이 길어진다.

$$\frac{\partial L}{\partial w_1} = \frac{\partial L}{\partial a_2} \cdot \frac{\partial a_2}{\partial z_2} \cdot \frac{\partial z_2}{\partial a_1} \cdot \frac{\partial a_1}{\partial z_1} \cdot \frac{\partial z_1}{\partial w_1}$$

두 식의 앞 두 항이 글자 하나까지 똑같다. 역전파가 출력 쪽에서부터 거슬러 오는 이유가 여기에 있다.

각 항은 전부 이미 아는 미분이다. 시그모이드의 도함수는 $\sigma'(z) = a(1-a)$이고, 곱셈 노드의 편미분은 상대편 값 그 자체다.

| 항 | 무엇을 미분한 것인가 | 값 |
|---|---|---|
| $\partial L / \partial a_2$ | $L = (y-a_2)^2$를 $a_2$로 | $-2(1 - 0.5888) = -0.8223$ |
| $\partial a_2 / \partial z_2$ | 시그모이드 도함수 $a_2(1-a_2)$ | $0.5888 \times 0.4112 = 0.2421$ |
| $\partial z_2 / \partial w_2$ | $z_2 = w_2 a_1$을 $w_2$로 | $a_1 = 0.5987$ |
| $\partial z_2 / \partial a_1$ | $z_2 = w_2 a_1$을 $a_1$로 | $w_2 = 0.6$ |
| $\partial a_1 / \partial z_1$ | 시그모이드 도함수 $a_1(1-a_1)$ | $0.5987 \times 0.4013 = 0.2403$ |
| $\partial z_1 / \partial w_1$ | $z_1 = w_1 x$를 $w_1$로 | $x = 0.5$ |

표의 첫 세 항을 곱하면 $\partial L/\partial w_2 \approx -0.1192$이고, 세 번째 항 자리에 나머지 세 항을 이어 붙이면 $\partial L/\partial w_1 \approx -0.0143$이다. 둘 다 음수이니 두 가중치 모두 키우는 방향으로 손실이 줄어든다. 학습률 $0.5$로 한 걸음 옮기면 $w_2$는 $0.6596$, $w_1$은 $0.8072$가 된다.

주목할 것은 크기 차이다. $w_1$의 기울기가 $w_2$의 8분의 1 수준이다. 두 사슬의 앞 두 항이 같으니 차이는 뒤쪽에서만 났다. $w_2$ 쪽은 $a_1 = 0.5987$ 한 항으로 끝나는데, $w_1$ 쪽은 그 자리에 $0.6 \times 0.2403 \times 0.5 = 0.072$가 들어간다. 1보다 작은 수를 곱하는 횟수가 늘수록 값이 깎인다. 출력에서 멀수록 기울기가 작아지는 이 경향이 뒤에서 다룰 기울기 소실의 씨앗이다.

---

## 왜 뒤에서부터인가

| 방향 | 흐르는 것 | 순서 |
|---|---|---|
| 순전파 | 값 ($z$, $a$) | 입력 → 출력 |
| 역전파 | 기울기 ($dz$, $dW$) | 출력 → 입력 |

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 226" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 계산 그래프 위에서 순전파는 입력에서 손실 방향으로 값을 흘려보내고, 역전파는 손실에서 입력 방향으로 기울기를 되돌려 보낸다. 두 화살표의 방향만 서로 반대다.">
<style>
.bp1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.6; }
.bp1-end { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.6; }
.bp1-ink { fill: var(--text, #1c1917); font-size: 14px; }
.bp1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 600; }
.bp1-fwd { stroke: var(--primary, #0a756c); stroke-width: 2.2; fill: none; }
.bp1-bwd { stroke: var(--text-danger, #cb2121); stroke-width: 2.2; fill: none; stroke-dasharray: 7 4; }
.bp1-fl { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 600; }
.bp1-bl { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 600; }
.bp1-note { fill: var(--text-muted, #6d6762); font-size: 14px; }
</style>
<defs>
<marker id="bp1Fwd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
<marker id="bp1Bwd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-danger, #cb2121)"/>
</marker>
</defs>
<text class="bp1-t" x="200" y="24" text-anchor="middle">같은 망, 반대 방향</text>
<!-- 순전파 화살표 -->
<text class="bp1-fl" x="200" y="52" text-anchor="middle">순전파 : 값</text>
<path class="bp1-fwd" d="M 28 66 L 376 66" marker-end="url(#bp1Fwd)"/>
<!-- 계산 그래프 노드 -->
<rect class="bp1-end" x="24" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="48" y="110" text-anchor="middle">x</text>
<rect class="bp1-box" x="88" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="112" y="110" text-anchor="middle">z[1]</text>
<rect class="bp1-box" x="152" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="176" y="110" text-anchor="middle">a[1]</text>
<rect class="bp1-box" x="216" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="240" y="110" text-anchor="middle">z[2]</text>
<rect class="bp1-box" x="280" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="304" y="110" text-anchor="middle">a[2]</text>
<rect class="bp1-end" x="344" y="84" width="48" height="42" rx="6"/>
<text class="bp1-ink" x="368" y="110" text-anchor="middle">L</text>
<!-- 역전파 화살표 -->
<path class="bp1-bwd" d="M 376 146 L 28 146" marker-end="url(#bp1Bwd)"/>
<text class="bp1-bl" x="200" y="170" text-anchor="middle">역전파 : 기울기</text>
<!-- 재사용 고지 -->
<text class="bp1-note" x="200" y="204" text-anchor="middle">역전파 입력 = 순전파가 남긴 z, a</text>
</svg>
</div>

역방향인 이유는 중복 계산 때문이다. 손 계산에서 본 두 사슬을 다시 보면, $\partial L/\partial w_1$의 앞 두 항 $\partial L/\partial a_2$와 $\partial a_2/\partial z_2$는 $\partial L/\partial w_2$를 구할 때 이미 계산한 값이다. 출력층에서 먼저 구해 두면 그 앞 층에서 그대로 재사용할 수 있다.

입력층부터 시작하면 이 재사용이 불가능하다. $w_1$의 기울기를 구하려고 뒤쪽 층의 편미분을 전부 계산해 놓고, $w_2$의 기울기를 구할 때 그중 상당수를 또 계산하게 된다. 층이 깊어질수록 낭비가 제곱으로 불어난다. 역방향으로 훑으면 각 층을 정확히 한 번씩만 지나면서 모든 기울기가 나온다.

계산 그래프의 언어로 말하면, 각 노드는 자기 지역 미분(local gradient)만 알고 있으면 된다. 곱셈 노드 $z = w \cdot a$의 지역 미분은 $\partial z/\partial w = a$와 $\partial z/\partial a = w$다. 역전파에서 노드가 하는 일은 상류에서 흘러온 기울기에 자기 지역 미분을 곱해 하류로 넘기는 것뿐이고, 전체 네트워크의 모양은 알 필요가 없다. PyTorch와 TensorFlow의 자동 미분이 임의의 연산 조합을 다 처리할 수 있는 이유가 이것이다.

---

## 행렬로 일반화

뉴런이 수백 개일 때도 사슬의 구조는 같다. 스칼라 곱이 행렬 곱으로 바뀔 뿐이다. 층 $l$의 순전파가 $z^{[l]} = W^{[l]}a^{[l-1]} + b^{[l]}$, $a^{[l]} = g(z^{[l]})$일 때, 역전파는 마지막 층 $L$에서 시작한다.

$$dz^{[L]} = a^{[L]} - y$$

이 깔끔한 형태는 출력에 시그모이드를 쓰고 손실에 cross-entropy를 쓸 때 나온다. 시그모이드의 도함수 $a(1-a)$가 cross-entropy 미분의 분모와 정확히 약분되기 때문이다. 손 계산에서 쓴 MSE로는 이렇게 되지 않고 $a(1-a)$가 그대로 남는다. 이진 분류에서 MSE 대신 cross-entropy가 표준인 실질적인 이유 중 하나다.

시작점만 정해지면 나머지는 두 식의 반복이다. 현재 층의 $dz$에서 그 층의 파라미터 기울기를 뽑고,

$$dW^{[l]} = \frac{1}{m} \, dz^{[l]} \left( a^{[l-1]} \right)^\top, \qquad db^{[l]} = \frac{1}{m} \sum dz^{[l]}$$

같은 $dz$를 이전 층으로 넘긴다.

$$dz^{[l-1]} = \left( W^{[l]} \right)^\top dz^{[l]} \odot g'(z^{[l-1]})$$

$\odot$는 원소별 곱이다. 마지막 식이 역전파의 전부라고 해도 된다. 가중치 행렬의 전치를 곱해 기울기를 이전 층의 차원으로 되돌리고, 그 층 활성화 함수의 도함수를 원소마다 곱한다. 순전파에서 $W$를 곱해 앞으로 갔던 만큼 $W^\top$을 곱해 뒤로 오는 셈이다.

| 기호 | 의미 | 차원 |
|---|---|---|
| $dz^{[l]}$ | 층 $l$의 선형 출력에 대한 손실의 기울기 | $n^{[l]} \times m$ |
| $dW^{[l]}$ | 가중치 행렬의 기울기 | $n^{[l]} \times n^{[l-1]}$ |
| $db^{[l]}$ | 편향 벡터의 기울기 | $n^{[l]} \times 1$ |

$n^{[l]}$은 층 $l$의 뉴런 수, $m$은 배치 안의 샘플 수다. $dW$가 $W$와 같은 크기로 나오는지 확인하는 것만으로도 구현 실수의 절반은 걸러진다.

---

## NumPy 구현

은닉층 하나짜리 네트워크의 역전파는 여섯 줄이면 끝난다.

```python
import numpy as np

def sigmoid_derivative(a):
    return a * (1 - a)          # 시그모이드 출력 a로부터 도함수를 얻는다

def backward(X, y, cache, W2):
    z1, a1, z2, a2 = cache
    m = X.shape[1]

    dz2 = a2 - y
    dW2 = (1 / m) * dz2 @ a1.T
    db2 = (1 / m) * np.sum(dz2, axis=1, keepdims=True)

    dz1 = (W2.T @ dz2) * sigmoid_derivative(a1)
    dW1 = (1 / m) * dz1 @ X.T
    db1 = (1 / m) * np.sum(dz1, axis=1, keepdims=True)

    return {'dW1': dW1, 'db1': db1, 'dW2': dW2, 'db2': db2}
```

`dz1 = (W2.T @ dz2) * sigmoid_derivative(a1)` 한 줄이 앞의 마지막 수식 그대로다. `cache`에 담긴 `a1`은 순전파에서 이미 계산한 값이고, 시그모이드 도함수를 $z$가 아니라 $a$로부터 얻는 덕분에 지수 함수를 다시 부르지 않아도 된다.

학습 한 번은 네 단계다. 순전파로 예측과 캐시를 만들고, 손실을 재고, 역전파로 기울기를 구하고, 기울기 반대 방향으로 파라미터를 옮긴다.

```python
for epoch in range(epochs):
    a2, cache = forward(X, W1, b1, W2, b2)                       # 1. 순전파
    loss = -np.mean(y * np.log(a2) + (1 - y) * np.log(1 - a2))   # 2. 손실
    grads = backward(X, y, cache, W2)                            # 3. 역전파
    for param, key in [(W1, 'dW1'), (b1, 'db1'), (W2, 'dW2'), (b2, 'db2')]:
        param -= learning_rate * grads[key]                      # 4. 업데이트
```

:::warning

**기울기가 맞는지 먼저 확인한다**

미분 공식을 하나 틀려도 코드는 잘 돌아간다. 손실이 안 줄거나 발산할 뿐이라 버그를 찾기가 매우 어렵다. 구현 직후에는 아주 작은 $\epsilon$으로 수치 미분을 구해 비교한다.

$$\frac{\partial L}{\partial w} \approx \frac{L(w + \epsilon) - L(w - \epsilon)}{2\epsilon}$$

양쪽으로 흔드는 중앙 차분이 한쪽 차분보다 오차가 작다($O(\epsilon^2)$ 대 $O(\epsilon)$). 두 기울기 벡터의 차이를 크기의 합으로 나눈 상대 오차가 $10^{-7}$ 아래면 통과로 본다. 다만 이건 디버깅 전용이다. 파라미터 하나마다 순전파를 두 번 돌려야 해서, 학습에 켜 두면 감당이 안 된다.

:::

---

## 기울기 소실과 폭발

손 계산에서 이미 조짐이 보였다. 두 층짜리 네트워크에서도 앞쪽 가중치의 기울기가 8분의 1로 줄었는데, 층이 열 개면 어떻게 되는가.

$$dz^{[l-1]} = \left( W^{[l]} \right)^\top dz^{[l]} \odot g'(z^{[l-1]})$$

층을 하나 거칠 때마다 $g'(z)$가 한 번씩 곱해진다. 시그모이드 도함수의 최댓값은 $z=0$일 때의 $0.25$이고, 그 바깥에서는 더 작다. 즉 층을 지날 때마다 기울기가 최소한 4분의 1로 깎인다.

| 층 깊이 | 시그모이드 ($\times 0.25$) | ReLU ($\times 1$) |
|---|---|---|
| 1층 | 0.25 | 1 |
| 5층 | 0.00098 | 1 |
| 10층 | 0.00000095 | 1 |

앞쪽 층의 기울기가 사실상 0이 되고, 0인 기울기로는 가중치가 움직이지 않는다. 깊은 네트워크의 앞부분이 학습을 멈추는 **기울기 소실(vanishing gradient)** 이다. ReLU가 시그모이드를 밀어낸 가장 큰 이유가 여기 있다. ReLU의 도함수는 양수 구간에서 정확히 1이라, 곱해도 기울기 크기가 줄지 않는다.

반대 방향의 사고도 있다. $W$의 원소가 크면 $W^\top$을 곱할 때마다 기울기가 커져서, 층마다 2배씩만 불어나도 10층이면 1024배가 된다. 업데이트 폭이 폭발하면서 손실이 발산하고 곧 NaN이 뜬다. 학습 중 갑자기 NaN을 보면 십중팔구 **기울기 폭발(exploding gradient)** 이다.

| 문제 | 대응 |
|---|---|
| 기울기 소실 | ReLU 계열 활성화 함수, skip connection |
| 기울기 폭발 | gradient clipping, 학습률 낮추기 |
| 양쪽 모두 | He/Xavier 초기화, 배치 정규화 |

---

## 마치며

역전파는 이름 그대로 방향에 관한 알고리즘이다. 손실을 각 가중치로 편미분하는 일 자체는 연쇄 법칙을 적용하면 되지만, 그 사슬을 입력 쪽에서부터 세우면 같은 편미분을 몇 번씩 다시 계산하게 된다. 출력 쪽에서부터 세우면 앞 층이 필요로 하는 항이 이미 손에 있다. 순전파가 남긴 $z$와 $a$를 캐시로 들고 내려오면서, 각 층을 한 번씩만 지나 모든 기울기를 얻는다.

실무에서 이 미분을 손으로 짤 일은 거의 없다. PyTorch와 TensorFlow가 연산 하나하나의 지역 미분을 알고 있고, 사슬을 엮는 일은 자동 미분이 대신한다. 그래도 구조를 알아야 하는 이유는 $dz^{[l-1]} = (W^{[l]})^\top dz^{[l]} \odot g'(z^{[l-1]})$ 이 한 줄에 딥러닝의 고질적인 문제가 통째로 들어 있기 때문이다. 층마다 곱해지는 $g'$가 1보다 작으면 기울기가 사라지고, $W$가 크면 폭발한다. ReLU도, 가중치 초기화 방법도, 배치 정규화도, ResNet의 skip connection도 전부 이 곱셈 사슬을 1 근처로 붙들어 두려는 시도다.

그중 가장 직접적인 것이 활성화 함수의 선택이다. $g'$의 모양이 곧 기울기가 살아남는 정도이므로, 다음 글에서는 활성화 함수마다 도함수가 어떻게 생겼고 어디에 무엇을 쓰는지 다룬다.

---

## 함께 보면 좋은 글

- [순전파](/ml/forward-propagation/) : 역전파가 거슬러 올라가는 계산 경로를 만드는 과정
- [경사하강법](/ml/gradient-descent/) : 구한 기울기로 파라미터를 실제로 옮기는 절차
- [활성화 함수](/ml/activation-functions/) : 도함수의 모양이 기울기 소실을 좌우하는 이유
- [옵티마이저](/ml/optimizers/) : 같은 기울기를 어떻게 쓰느냐에서 갈리는 학습 속도
