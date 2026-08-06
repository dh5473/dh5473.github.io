---
date: '2026-01-20'
title: '입력이 예측이 되기까지, 순전파의 행렬 연산'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 20
tags: ['Forward Propagation', '순전파', 'Neural Network', '신경망', '행렬 연산', '벡터화', 'Softmax', '머신러닝']
summary: '입력 벡터가 층마다 가중치 행렬과 곱해지고 활성화 함수를 지나 예측값이 되는 과정, 그리고 그 계산을 행렬 곱 한 번으로 묶는 벡터화를 정리한다.'
thumbnail: './thumbnail.png'
---

신경망은 뉴런을 옆으로 늘어놓아 층을 만들고 그 층을 앞뒤로 쌓은 구조다. 구조를 안다고 계산을 아는 것은 아니다. 입력 벡터 하나가 이 구조를 통과해 숫자 하나로 나오기까지, 각 층에서 정확히 무슨 연산이 일어나는가.

입력에서 출력 방향으로 값이 흘러가는 이 계산을 **순전파(Forward Propagation)** 라고 한다. 추론할 때도 순전파, 학습할 때도 첫 단계는 순전파다. 그리고 그 정체는 행렬 곱과 원소별 함수 적용, 딱 두 가지다.

## 뉴런 하나의 계산

가장 작은 단위부터 본다. 뉴런 하나는 입력에 가중치를 곱해 더하고, 그 결과를 함수 하나에 통과시킨다.

$$z = \mathbf{w}^\top\mathbf{x} + b, \qquad a = g(z)$$

$g$가 활성화 함수다. 은닉층에서는 보통 ReLU를, 이진 분류의 출력층에서는 시그모이드를 쓴다.

$$\text{ReLU}(z) = \max(0, z), \qquad \sigma(z) = \frac{1}{1 + e^{-z}}$$

```python
import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

x = np.array([0.5, 0.3])
w = np.array([0.4, 0.6])
b = 0.1

z = np.dot(w, x) + b     # 0.4*0.5 + 0.6*0.3 + 0.1
a = sigmoid(z)
print(round(z, 4), round(a, 4))
# 0.48 0.6177
```

곱하고 더해서 $z$, 비선형 함수를 통과해 $a$. 신경망 안의 모든 뉴런이 예외 없이 이 두 단계만 한다. 나머지는 이 계산을 어떻게 묶느냐의 문제다.

## 층 하나는 행렬 곱 한 번이다

한 층에 뉴런이 3개 있고 입력이 2개라고 하자. 세 뉴런은 **같은 입력**을 받지만 **각자의 가중치**로 서로 다른 $z$를 만든다.

$$z_1 = w_{11}x_1 + w_{12}x_2 + b_1, \quad z_2 = w_{21}x_1 + w_{22}x_2 + b_2, \quad z_3 = w_{31}x_1 + w_{32}x_2 + b_3$$

세 줄을 따로 계산할 이유가 없다. 뉴런 하나의 가중치 벡터를 한 행으로 삼아 쌓으면 행렬 하나가 되고, 세 식이 곱셈 한 번으로 합쳐진다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 250" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="가중치 행렬 W와 입력 벡터 x의 곱에 편향 b를 더해 z를 만들고, z에 활성화 함수를 적용해 a를 얻는 과정. W의 첫 번째 행이 z의 첫 번째 원소와 색으로 연결되어 있어 행 하나가 뉴런 하나에 대응한다는 것을 보여준다.">
<style>
.fp1-cell { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.fp1-hot { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.2; }
.fp1-ink { fill: var(--text, #1c1917); font-size: 14px; }
.fp1-on { fill: var(--on-fill, #ffffff); font-size: 14px; font-weight: 600; }
.fp1-op { fill: var(--text, #1c1917); font-size: 18px; font-weight: 600; }
.fp1-lab { fill: var(--text-muted, #6d6762); font-size: 14px; }
.fp1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 600; }
.fp1-arw { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
</style>
<defs>
<marker id="fp1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="fp1-t" x="200" y="26" text-anchor="middle">W의 행 하나 = 뉴런 하나</text>
<!-- W (3x2) -->
<rect class="fp1-hot" x="60" y="60" width="34" height="30"/>
<rect class="fp1-hot" x="94" y="60" width="34" height="30"/>
<text class="fp1-on" x="77" y="80" text-anchor="middle">w₁₁</text>
<text class="fp1-on" x="111" y="80" text-anchor="middle">w₁₂</text>
<rect class="fp1-cell" x="60" y="90" width="34" height="30"/>
<rect class="fp1-cell" x="94" y="90" width="34" height="30"/>
<text class="fp1-ink" x="77" y="110" text-anchor="middle">w₂₁</text>
<text class="fp1-ink" x="111" y="110" text-anchor="middle">w₂₂</text>
<rect class="fp1-cell" x="60" y="120" width="34" height="30"/>
<rect class="fp1-cell" x="94" y="120" width="34" height="30"/>
<text class="fp1-ink" x="77" y="140" text-anchor="middle">w₃₁</text>
<text class="fp1-ink" x="111" y="140" text-anchor="middle">w₃₂</text>
<text class="fp1-lab" x="94" y="170" text-anchor="middle">W (3×2)</text>
<!-- x -->
<text class="fp1-op" x="139" y="111" text-anchor="middle">·</text>
<rect class="fp1-cell" x="152" y="75" width="34" height="30"/>
<text class="fp1-ink" x="169" y="95" text-anchor="middle">x₁</text>
<rect class="fp1-cell" x="152" y="105" width="34" height="30"/>
<text class="fp1-ink" x="169" y="125" text-anchor="middle">x₂</text>
<text class="fp1-lab" x="169" y="170" text-anchor="middle">x (2×1)</text>
<!-- b -->
<text class="fp1-op" x="198" y="111" text-anchor="middle">+</text>
<rect class="fp1-cell" x="210" y="60" width="34" height="30"/>
<text class="fp1-ink" x="227" y="80" text-anchor="middle">b₁</text>
<rect class="fp1-cell" x="210" y="90" width="34" height="30"/>
<text class="fp1-ink" x="227" y="110" text-anchor="middle">b₂</text>
<rect class="fp1-cell" x="210" y="120" width="34" height="30"/>
<text class="fp1-ink" x="227" y="140" text-anchor="middle">b₃</text>
<text class="fp1-lab" x="227" y="170" text-anchor="middle">b (3×1)</text>
<!-- z -->
<text class="fp1-op" x="256" y="111" text-anchor="middle">=</text>
<rect class="fp1-hot" x="268" y="60" width="34" height="30"/>
<text class="fp1-on" x="285" y="80" text-anchor="middle">z₁</text>
<rect class="fp1-cell" x="268" y="90" width="34" height="30"/>
<text class="fp1-ink" x="285" y="110" text-anchor="middle">z₂</text>
<rect class="fp1-cell" x="268" y="120" width="34" height="30"/>
<text class="fp1-ink" x="285" y="140" text-anchor="middle">z₃</text>
<text class="fp1-lab" x="285" y="170" text-anchor="middle">z (3×1)</text>
<!-- 활성화 -->
<path class="fp1-arw" d="M 306 105 L 330 105" marker-end="url(#fp1Arrow)"/>
<text class="fp1-lab" x="318" y="96" text-anchor="middle">g</text>
<rect class="fp1-cell" x="336" y="60" width="34" height="30"/>
<text class="fp1-ink" x="353" y="80" text-anchor="middle">a₁</text>
<rect class="fp1-cell" x="336" y="90" width="34" height="30"/>
<text class="fp1-ink" x="353" y="110" text-anchor="middle">a₂</text>
<rect class="fp1-cell" x="336" y="120" width="34" height="30"/>
<text class="fp1-ink" x="353" y="140" text-anchor="middle">a₃</text>
<text class="fp1-lab" x="353" y="170" text-anchor="middle">a (3×1)</text>
<!-- 아래 설명 -->
<text class="fp1-lab" x="200" y="210" text-anchor="middle">첫 행 · x + b₁ = z₁</text>
<text class="fp1-lab" x="200" y="232" text-anchor="middle">g : 원소별 적용</text>
</svg>
</div>

이제 층이 몇 번째든 순전파 공식은 두 줄로 같다.

$$z^{[l]} = W^{[l]}a^{[l-1]} + b^{[l]}, \qquad a^{[l]} = g(z^{[l]})$$

$l$은 층 번호이고 $a^{[0]}$이 입력 $x$다. 크기 규칙도 하나뿐이다. $W^{[l]}$은 (현재 층 뉴런 수) × (이전 층 뉴런 수), $b^{[l]}$은 (현재 층 뉴런 수)다.

```python
def forward_layer(a_prev, W, b, activation):
    z = np.dot(W, a_prev) + b
    a = activation(z)
    return a, (z, a_prev, W)          # 캐시는 역전파에서 쓴다
```

반환값에 $z$와 $a^{[l-1]}$을 함께 담아 두는 이유는 학습할 때다. 기울기를 계산하려면 순전파 도중의 중간값이 그대로 필요한데, 그때 다시 계산하면 순전파를 두 번 하는 셈이 된다. 추론만 할 거라면 버려도 된다.

## 층을 이어 붙이기

입력 2개, 은닉 3개(ReLU), 출력 1개(시그모이드)인 네트워크에 $x = [1.0,\ 0.5]$를 넣어 보자.

$$W^{[1]} = \begin{bmatrix} 0.2 & 0.4 \\ 0.6 & 0.1 \\ 0.3 & 0.7 \end{bmatrix}, \qquad b^{[1]} = \begin{bmatrix} 0 \\ 0 \\ 0 \end{bmatrix}$$

첫 행 $[0.2,\ 0.4]$와 입력의 내적이 $0.2 \times 1.0 + 0.4 \times 0.5 = 0.40$이고, 둘째 행과 셋째 행도 같은 방식으로 각각 $0.65$가 나온다.

$$z^{[1]} = [0.40,\ 0.65,\ 0.65] \;\xrightarrow{\ \text{ReLU}\ }\; a^{[1]} = [0.40,\ 0.65,\ 0.65]$$

세 값이 모두 양수라 ReLU를 지나도 그대로다. 두 번째 층은 완전히 같은 연산이 반복될 뿐이다. $W^{[2]} = [0.5,\ 0.3,\ 0.2]$와 $a^{[1]}$의 내적으로 $z^{[2]} = 0.525$가 나오고, 시그모이드를 통과해 $a^{[2]} = 0.6283$이 된다. 정답이 $y = 1$이라면 손실은 $-\ln 0.6283 \approx 0.4647$이다.

바뀐 것은 행렬의 크기와 활성화 함수뿐이다. 층을 100개로 늘려도 달라지는 것은 반복 횟수다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 404" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="순전파의 전체 흐름. 입력 x에서 시작해 선형 결합으로 z를 만들고 활성화 함수로 a를 만드는 과정을 두 층 반복한 뒤 손실을 계산한다. 각 단계 오른쪽에 값의 shape이 적혀 있다.">
<style>
.fp2-in { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.6; }
.fp2-lin { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.6; }
.fp2-act { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.6; }
.fp2-loss { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.6; }
.fp2-ink { fill: var(--text, #1c1917); font-size: 14px; }
.fp2-shp { fill: var(--text-muted, #6d6762); font-size: 14px; }
.fp2-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 600; }
.fp2-arw { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.fp2-big { stroke: var(--primary, #0a756c); stroke-width: 2.2; fill: none; }
.fp2-dir { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 600; }
</style>
<defs>
<marker id="fp2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
<marker id="fp2Big" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<text class="fp2-t" x="200" y="26" text-anchor="middle">값이 흐르는 방향</text>
<!-- 방향 표시 -->
<text class="fp2-dir" x="18" y="52" text-anchor="start">순전파</text>
<path class="fp2-big" d="M 45 62 L 45 384" marker-end="url(#fp2Big)"/>
<!-- 입력 -->
<rect class="fp2-in" x="100" y="44" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="70" text-anchor="middle">x = [1.0, 0.5]</text>
<text class="fp2-shp" x="302" y="70" text-anchor="start">(2,)</text>
<path class="fp2-arw" d="M 195 86 L 195 102" marker-end="url(#fp2Arrow)"/>
<!-- 1층 선형 -->
<rect class="fp2-lin" x="100" y="104" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="130" text-anchor="middle">z[1] = W[1]x + b[1]</text>
<text class="fp2-shp" x="302" y="130" text-anchor="start">(3,)</text>
<path class="fp2-arw" d="M 195 146 L 195 162" marker-end="url(#fp2Arrow)"/>
<!-- 1층 활성화 -->
<rect class="fp2-act" x="100" y="164" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="190" text-anchor="middle">a[1] = ReLU(z[1])</text>
<text class="fp2-shp" x="302" y="190" text-anchor="start">(3,)</text>
<path class="fp2-arw" d="M 195 206 L 195 222" marker-end="url(#fp2Arrow)"/>
<!-- 2층 선형 -->
<rect class="fp2-lin" x="100" y="224" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="250" text-anchor="middle">z[2] = W[2]a[1] + b[2]</text>
<text class="fp2-shp" x="302" y="250" text-anchor="start">(1,)</text>
<path class="fp2-arw" d="M 195 266 L 195 282" marker-end="url(#fp2Arrow)"/>
<!-- 2층 활성화 -->
<rect class="fp2-act" x="100" y="284" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="310" text-anchor="middle">a[2] = σ(z[2])</text>
<text class="fp2-shp" x="302" y="310" text-anchor="start">(1,)</text>
<path class="fp2-arw" d="M 195 326 L 195 342" marker-end="url(#fp2Arrow)"/>
<!-- 손실 -->
<rect class="fp2-loss" x="100" y="344" width="190" height="42" rx="6"/>
<text class="fp2-ink" x="195" y="370" text-anchor="middle">L = loss(y, a[2])</text>
<text class="fp2-shp" x="302" y="370" text-anchor="start">스칼라</text>
</svg>
</div>

```python
import numpy as np

def relu(z):
    return np.maximum(0, z)

W1 = np.array([[0.2, 0.4], [0.6, 0.1], [0.3, 0.7]])
b1 = np.zeros(3)
W2 = np.array([[0.5, 0.3, 0.2]])
b2 = np.zeros(1)

x = np.array([1.0, 0.5])
a1 = relu(np.dot(W1, x) + b1)
a2 = sigmoid(np.dot(W2, a1) + b2)
print(a1.round(4), a2.round(4))
# [0.4  0.65 0.65] [0.6283]
```

## 왜 행렬 곱인가

뉴런 하나씩 for문으로 돌려도 결과는 같다. 다만 느리다. 입력 1,000개, 뉴런 500개, 샘플 10,000개로 같은 계산을 두 방식으로 재보면 차이가 분명하다.

```python
Z_loop = np.zeros((n_samples, n_neurons))
for i in range(n_samples):
    for j in range(n_neurons):
        Z_loop[i, j] = np.dot(W[j], X[i]) + b[j]     # 약 6초

Z_vec = X @ W.T + b                                   # 약 0.04초
```

백 배 안팎의 차이다. 정확한 배수는 장비와 BLAS가 쓰는 코어 수에 따라 달라지지만 자릿수가 뒤집히지는 않는다. NumPy의 행렬 곱은 C로 작성된 BLAS 루틴을 호출해서, 캐시에 맞게 블록을 쪼개고 SIMD 명령을 쓰고 코어를 나눠 쓴다. 파이썬 루프는 반복마다 인터프리터를 거치므로 그 최적화를 하나도 받지 못한다. GPU가 빠른 이유도 결이 같다. 행렬 곱은 서로 독립적인 곱셈 덧셈의 묶음이라 코어 수천 개에 그대로 흩뿌릴 수 있다.

`X @ W.T`가 한 일이 하나 더 있다. 샘플 10,000개를 한 번에 처리했다. 데이터를 하나씩 넣지 않고 묶어서 넣는 것을 **배치(batch)** 라고 하는데, 샘플 축을 행에 얹으면 순전파 공식은 그대로 두고 배치 처리가 된다. 실제 학습이 미니배치 단위로 도는 것도 이 성질 덕분이다.

## 출력층과 손실 함수

은닉층은 대체로 ReLU면 된다. 반면 출력층의 활성화 함수와 손실 함수는 풀려는 문제가 정한다. 이 둘은 한 쌍으로 움직인다.

| 문제 유형 | 출력 뉴런 수 | 출력 활성화 | 손실 함수 |
|---|---|---|---|
| 이진 분류 | 1 | 시그모이드 | Binary Cross-Entropy |
| 다중 클래스 분류 | K | Softmax | Categorical Cross-Entropy |
| 회귀 | 1 또는 n | 없음(Linear) | MSE |

회귀에 활성화 함수를 붙이지 않는 이유는 출력 범위를 막으면 안 되기 때문이다. 집값 예측에 시그모이드를 씌우면 결과가 0과 1 사이에 갇힌다.

**Softmax**는 K개의 점수를 합이 1인 확률로 바꾼다.

$$\text{softmax}(z_i) = \frac{e^{z_i}}{\sum_{k=1}^{K} e^{z_k}}$$

지수 함수라 $z$가 커지면 표현 범위를 금방 넘는다. float32에서는 $z$가 89만 되어도 `inf`다. 분자와 분모에 같은 상수를 곱해도 값이 변하지 않는다는 성질을 이용해, 최댓값을 빼고 계산하는 것이 표준이다.

```python
def softmax(z):
    exp_z = np.exp(z - np.max(z))    # 최댓값을 빼도 결과는 동일
    return exp_z / np.sum(exp_z)

z = np.array([2.1, 0.5, 0.3, 8.2, 0.1, 0.4, 0.2, 1.1, 0.7, 0.3])
p = softmax(z)
print(p.argmax(), p.max().round(4), p.sum().round(4))
# 3 0.9942 1.0
```

**Binary Cross-Entropy**는 이진 분류에서 예측 확률과 정답의 거리를 잰다.

$$L = -\left[\, y \log a + (1-y)\log(1-a) \,\right]$$

$y=1$이면 $-\log a$만 남아서 예측이 1에 가까울수록 0으로 내려간다. $y=0$이면 $-\log(1-a)$가 같은 일을 반대편에서 한다. 어느 쪽이든 확신을 갖고 틀리면 로그가 발산하면서 손실이 급격히 커진다. 예측이 0.9면 손실 0.1054, 0.1이면 2.3026이다. 구현할 때는 $a$를 $[10^{-15},\ 1-10^{-15}]$로 잘라서 $\log 0$을 막는다.

## 차원이 어긋날 때

직접 구현하면 가장 자주 만나는 에러가 `shapes not aligned`다. 행렬 곱 $(m, n) \times (n, p)$에서 가운데 두 수가 같아야 한다는 규칙 하나가 전부인데, 신경망에서는 다음 세 가지가 반복해서 어긋난다.

| 증상 | 원인 | 해결 |
|---|---|---|
| `shapes (2,3) and (2,) not aligned` | $W$를 (입력, 뉴런) 순으로 만듦 | (뉴런, 입력)으로 만들거나 `W.T` 사용 |
| `operands could not be broadcast` | $b$의 길이가 뉴런 수와 다름 | $b$를 현재 층 뉴런 수에 맞춤 |
| 샘플 하나는 되는데 배치에서 실패 | 배치 축을 빼먹음 | 입력을 `(batch, features)`로 맞춤 |

```python
W = np.random.randn(2, 3)     # (입력, 뉴런) 순서라 거꾸로다
np.dot(W, x)                  # ValueError

W = np.random.randn(3, 2)     # (뉴런, 입력)
np.dot(W, x)                  # (3,)
```

층마다 `print(W.shape, a.shape)`를 찍어 보면 어디서 꼬였는지 대개 한 번에 보인다. PyTorch로 넘어가도 이 습관은 그대로 쓰인다.

## 마치며

순전파는 두 줄이다. 가중치 행렬을 곱하고 편향을 더해 $z$를 만들고, 원소마다 활성화 함수를 적용해 $a$를 만든다. 층이 2개든 100개든 이 두 줄을 반복할 뿐이고, 층마다 달라지는 것은 행렬의 크기와 활성화 함수뿐이다.

행렬로 묶는 것은 표기의 편의가 아니라 성능의 문제다. 뉴런을 행으로 쌓아 한 번에 곱하면 BLAS와 GPU가 개입할 수 있고, 여기에 샘플까지 축 하나로 더 쌓으면 배치 처리가 공짜로 따라온다. 같은 계산이 백 배 안팎으로 빨라진다.

남은 문제는 $W$와 $b$의 값이다. 지금까지 쓴 숫자들은 임의로 정한 것이고, 손실 0.4647은 그래서 나온 값이다. 이 손실을 줄이려면 각 가중치를 어느 방향으로 얼마나 밀어야 하는지 알아야 하는데, 층이 여러 개면 앞쪽 가중치의 영향이 뒤쪽 층들을 전부 거쳐서 손실에 닿는다. 다음 글에서는 그 경로를 거꾸로 따라가는 방법을 다룬다.

## 함께 보면 좋은 글

- [신경망 기초](/ml/neural-network-basics/) : 퍼셉트론과 은닉층, 여기서 쓴 구조가 어떻게 만들어졌는지
- [역전파](/ml/backpropagation/) : 순전파로 얻은 손실에서 각 가중치의 기울기를 구하는 방법
- [활성화 함수](/ml/activation-functions/) : ReLU와 시그모이드를 어디에 왜 쓰는지
- [비용 함수](/ml/cost-function/) : 손실 함수가 무엇을 재는지

## 참고자료

- [Deep Learning Book, Chapter 6: Deep Feedforward Networks](https://www.deeplearningbook.org/contents/mlp.html)
- [CS231n, Neural Networks Part 1](https://cs231n.github.io/neural-networks-1/)
- [NumPy, Broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html)
- [NumPy, numpy.matmul](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)
- [Deep Learning Book, Chapter 4: Numerical Computation](https://www.deeplearningbook.org/contents/numerical.html)
