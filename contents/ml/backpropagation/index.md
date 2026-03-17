---
date: '2026-01-21'
title: '역전파(Backpropagation): 신경망이 학습하는 원리'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 21
tags: ['Backpropagation', '역전파', 'Chain Rule', '연쇄 법칙', 'Neural Network', '머신러닝']
summary: '순전파로 예측하고, 역전파로 학습한다. 연쇄 법칙(Chain Rule)으로 각 가중치의 기여도를 계산하는 역전파의 수학적 원리를 완전히 이해한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/forward-propagation/)에서 순전파를 배웠다. 입력이 네트워크를 통과해 예측값이 되고, 손실 함수로 "얼마나 틀렸는지" 측정했다. 이제 핵심 — **이 오차를 줄이려면 각 가중치를 얼마나, 어느 방향으로 바꿔야 하는가?** 답은 역전파(Backpropagation)다.

[경사하강법](/ml/gradient-descent/)에서 파라미터 업데이트 규칙을 배웠다.

> **w := w - α × ∂L/∂w**

핵심은 ∂L/∂w, 즉 손실 함수를 각 가중치로 편미분한 값(gradient)이다. 단순한 선형 회귀에서는 이 미분을 직접 계산할 수 있었다. 그런데 신경망은 층이 여러 개고, 각 층에 활성화 함수가 끼어 있다. 입력부터 손실까지 합성 함수가 겹겹이 쌓여 있는 구조다. 이 복잡한 합성 함수의 미분을 효율적으로 계산하는 알고리즘이 바로 **역전파(Backpropagation)** 다.

---

## 연쇄 법칙(Chain Rule) 복습

역전파의 수학적 기반은 미적분의 **연쇄 법칙** 단 하나다. 이것만 확실히 이해하면 역전파 전체가 보인다.

### 기본 형태

함수가 합성되어 있을 때, 바깥 함수의 미분과 안쪽 함수의 미분을 **곱한다**.

```
y = f(g(x)) 일 때,

dy/dx = dy/dg × dg/dx
```

구체적인 예를 보자.

```
g(x) = 3x + 1
f(g) = g²

y = f(g(x)) = (3x + 1)²
```

연쇄 법칙을 적용하면:

```
dg/dx = 3
df/dg = 2g = 2(3x + 1)

dy/dx = df/dg × dg/dx = 2(3x + 1) × 3 = 6(3x + 1)
```

x = 2를 넣으면 dy/dx = 6 × 7 = 42다. 직접 전개해서 미분해도 같은 결과가 나온다: y = 9x² + 6x + 1, dy/dx = 18x + 6 = 42.

### 함수가 3개 이상 합성되면?

```
y = f(g(h(x))) 일 때,

dy/dx = dy/dg × dg/dh × dh/dx
```

**체인(chain)** 처럼 편미분을 줄줄이 곱한다. 이름이 "연쇄(chain) 법칙"인 이유다. 신경망의 각 층이 하나의 함수라고 생각하면, 역전파는 이 연쇄 법칙을 출력층에서 입력층 방향으로 적용하는 것에 불과하다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>핵심 포인트</strong><br>
  신경망에서 연쇄 법칙이 필수인 이유: 손실 L은 예측값 a의 함수이고, a는 z의 함수이고, z는 w의 함수다. L → a → z → w. 이 체인을 따라 미분을 곱해야 ∂L/∂w를 구할 수 있다.
</div>

---

## 작은 네트워크에서 손으로 역전파 해보기

이론만으로는 감이 오지 않는다. 가장 단순한 신경망에서 실제 숫자로 역전파를 수행해보자.

### 네트워크 구조

```
입력(x) → [w1] → z1 → σ(z1) → a1 → [w2] → z2 → σ(z2) → a2(=y_hat) → L
```

- 입력: x = 0.5
- 은닉층 1개, 뉴런 1개 (편향 생략하여 핵심에 집중)
- 활성화 함수: 시그모이드 σ(z) = 1 / (1 + e^(-z))
- 손실 함수: L = (y - y_hat)² (단일 샘플 MSE)
- 정답: y = 1

### 순전파 (Forward Pass)

초기 가중치를 w1 = 0.8, w2 = 0.6으로 설정한다.

```
z1 = w1 × x = 0.8 × 0.5 = 0.4
a1 = σ(0.4) = 1 / (1 + e^(-0.4)) ≈ 0.5987

z2 = w2 × a1 = 0.6 × 0.5987 ≈ 0.3592
a2 = σ(0.3592) ≈ 0.5889

L = (1 - 0.5889)² = (0.4111)² ≈ 0.1690
```

예측값 0.5889, 정답 1. 손실 0.1690. 이제 이 손실을 줄이기 위해 w1과 w2를 어떻게 바꿔야 하는지 계산한다.

### 역전파 Step 1: ∂L/∂w2 계산

w2에 가까운 쪽부터 시작한다. 연쇄 법칙을 적용하면:

```
∂L/∂w2 = ∂L/∂a2 × ∂a2/∂z2 × ∂z2/∂w2
```

각 항을 계산하자.

**1) ∂L/∂a2**: 손실 함수 L = (y - a2)²를 a2로 미분

```
∂L/∂a2 = -2(y - a2) = -2(1 - 0.5889) = -0.8222
```

**2) ∂a2/∂z2**: 시그모이드의 미분. σ'(z) = σ(z)(1 - σ(z))

```
∂a2/∂z2 = a2 × (1 - a2) = 0.5889 × 0.4111 ≈ 0.2421
```

**3) ∂z2/∂w2**: z2 = w2 × a1이므로

```
∂z2/∂w2 = a1 = 0.5987
```

체인을 곱하면:

```
∂L/∂w2 = (-0.8222) × 0.2421 × 0.5987 ≈ -0.1192
```

기울기가 음수 → w2를 키우면 손실이 줄어든다.

### 역전파 Step 2: ∂L/∂w1 계산

w1은 네트워크 더 앞쪽에 있다. 체인이 더 길다.

```
∂L/∂w1 = ∂L/∂a2 × ∂a2/∂z2 × ∂z2/∂a1 × ∂a1/∂z1 × ∂z1/∂w1
```

앞 두 항은 이미 계산했다. 나머지:

**4) ∂z2/∂a1**: z2 = w2 × a1이므로

```
∂z2/∂a1 = w2 = 0.6
```

**5) ∂a1/∂z1**: 시그모이드 미분

```
∂a1/∂z1 = a1 × (1 - a1) = 0.5987 × 0.4013 ≈ 0.2403
```

**6) ∂z1/∂w1**: z1 = w1 × x이므로

```
∂z1/∂w1 = x = 0.5
```

체인을 곱하면:

```
∂L/∂w1 = (-0.8222) × 0.2421 × 0.6 × 0.2403 × 0.5 ≈ -0.0143
```

<div style="background: #fff8f0; border-left: 4px solid #f59f00; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>관찰</strong><br>
  w1의 기울기(-0.0143)가 w2의 기울기(-0.1192)보다 훨씬 작다. w1은 출력에서 더 멀리 떨어져 있기 때문이다. 연쇄 법칙에서 곱하는 항이 많아질수록 기울기는 작아지는 경향이 있다. 이게 바로 <strong>기울기 소실(vanishing gradient)</strong> 문제의 씨앗이다.
</div>

### 가중치 업데이트

학습률 α = 0.5로 업데이트한다.

```
w2_new = 0.6 - 0.5 × (-0.1192) = 0.6 + 0.0596 = 0.6596
w1_new = 0.8 - 0.5 × (-0.0143) = 0.8 + 0.0072 = 0.8072
```

예상대로 두 가중치 모두 증가했다. 이 새 가중치로 순전파를 다시 하면 예측값이 1에 더 가까워지고, 손실이 줄어든다. 이 과정을 수백~수천 번 반복하면 네트워크가 **학습**한다.

---

## 왜 "역(Back)" 전파인가?

이름에 답이 있다.

| 방향 | 이름 | 하는 일 | 흐름 |
|------|------|---------|------|
| 순방향 | Forward Pass | 예측값 계산 | 입력 → 은닉 → 출력 |
| 역방향 | Backward Pass | 기울기 계산 | 출력 → 은닉 → 입력 |

순전파에서는 입력이 가중치, 활성화 함수를 거쳐 예측값이 된다. 역전파에서는 손실에서 시작해서 각 층의 기울기를 **역순으로** 계산한다.

왜 역순이어야 하는가? 위의 손 계산에서 보았듯이, ∂L/∂w1을 구하려면 ∂L/∂a2, ∂a2/∂z2가 필요하다. 이건 ∂L/∂w2를 구할 때 이미 계산한 값이다. 즉, **출력층에서 먼저 기울기를 구해놓으면, 그 앞 층의 기울기를 구할 때 재사용**할 수 있다.

만약 입력층부터 시작하면? w1의 기울기를 구하기 위해 뒷층의 모든 편미분을 계산해야 하고, w2의 기울기를 구할 때 또 비슷한 계산을 반복해야 한다. 역방향으로 가면 중복 계산이 사라진다. 이게 역전파가 **효율적인** 이유다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>핵심 통찰</strong><br>
  역전파의 핵심 아이디어는 "오차의 원인을 추적"하는 것이다. 출력에서 발생한 오차가 각 층의 가중치에 얼마나 기인하는지를, 연쇄 법칙을 통해 역추적한다. 마치 사고의 원인을 결과부터 거슬러 올라가며 분석하는 것과 같다.
</div>

---

## 다층 네트워크의 일반 공식

실제 신경망은 뉴런이 1개가 아니라 수백, 수천 개다. 행렬 표기법으로 일반화하자.

L개 층을 가진 신경망에서, 층 l의 연산:

```
z[l] = W[l] · a[l-1] + b[l]
a[l] = g(z[l])
```

여기서 g는 활성화 함수, a[0] = X (입력)이다.

### 역전파 공식

출력층(L번째 층)에서 시작해서 거꾸로 내려간다.

**출력층의 기울기 (시작점):**

```
dz[L] = a[L] - y          (cross-entropy + sigmoid 조합일 때)
```

[로지스틱 회귀](/ml/logistic-regression/)에서 도출한 것과 동일한 형태다.

**각 층의 가중치/편향 기울기:**

```
dW[l] = (1/m) × dz[l] · a[l-1]^T
db[l] = (1/m) × Σ dz[l]      (열 방향 합)
```

**이전 층으로 기울기 전파:**

```
dz[l-1] = W[l]^T · dz[l]  ⊙  g'(z[l-1])
```

여기서 ⊙는 원소별 곱(element-wise multiplication), g'는 활성화 함수의 도함수다.

| 기호 | 의미 | 차원 |
|------|------|------|
| dz[l] | 층 l의 선형 출력에 대한 손실의 기울기 | (n[l], m) |
| dW[l] | 가중치 행렬의 기울기 | (n[l], n[l-1]) |
| db[l] | 편향 벡터의 기울기 | (n[l], 1) |
| a[l-1]^T | 이전 층 활성화의 전치 | (m, n[l-1]) |

여기서 n[l]은 층 l의 뉴런 수, m은 샘플 수다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>패턴을 보자</strong><br>
  <code>dz[l-1] = W[l]^T · dz[l] ⊙ g'(z[l-1])</code> — 이 공식이 역전파의 핵심이다. 현재 층의 기울기(dz[l])에 가중치 행렬의 전치(W[l]^T)를 곱하고, 활성화 함수의 도함수(g')를 원소별로 곱한다. 이 연산을 층마다 반복하면 모든 가중치의 기울기를 구할 수 있다.
</div>

---

## NumPy 구현

이론을 코드로 옮기자. 2층 신경망(은닉층 1개)을 처음부터 구현한다.

### 순전파 — 캐시 저장이 핵심

```python
import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

def sigmoid_derivative(a):
    """시그모이드 출력 a로부터 도함수 계산"""
    return a * (1 - a)

def forward(X, W1, b1, W2, b2):
    """순전파: 예측값과 역전파에 필요한 캐시를 반환"""
    # 은닉층
    z1 = W1 @ X + b1
    a1 = sigmoid(z1)

    # 출력층
    z2 = W2 @ a1 + b2
    a2 = sigmoid(z2)

    cache = (z1, a1, z2, a2)
    return a2, cache
```

순전파에서 z1, a1, z2, a2를 **캐시에 저장**한다. 역전파에서 이 값들이 필요하기 때문이다. 이걸 저장하지 않으면 역전파 때 다시 계산해야 해서 비효율적이다.

### 역전파 — 층별 기울기 계산

```python
def backward(X, y, cache, W2):
    """역전파: 모든 가중치/편향의 기울기를 반환"""
    z1, a1, z2, a2 = cache
    m = X.shape[1]  # 샘플 수

    # 출력층 기울기
    dz2 = a2 - y                          # (1, m)
    dW2 = (1/m) * dz2 @ a1.T              # (1, n_hidden)
    db2 = (1/m) * np.sum(dz2, axis=1, keepdims=True)  # (1, 1)

    # 은닉층 기울기 — 핵심: W2^T로 기울기를 역전파
    dz1 = (W2.T @ dz2) * sigmoid_derivative(a1)  # (n_hidden, m)
    dW1 = (1/m) * dz1 @ X.T              # (n_hidden, n_input)
    db1 = (1/m) * np.sum(dz1, axis=1, keepdims=True)  # (n_hidden, 1)

    grads = {'dW1': dW1, 'db1': db1, 'dW2': dW2, 'db2': db2}
    return grads
```

`dz1 = (W2.T @ dz2) * sigmoid_derivative(a1)` — 이 한 줄이 역전파의 핵심이다. 출력층의 기울기(dz2)를 가중치 전치(W2.T)로 변환하고, 은닉층 활성화 함수의 도함수를 곱한다.

### 가중치 업데이트

```python
def update_params(W1, b1, W2, b2, grads, learning_rate):
    """경사하강법으로 파라미터 업데이트"""
    W1 = W1 - learning_rate * grads['dW1']
    b1 = b1 - learning_rate * grads['db1']
    W2 = W2 - learning_rate * grads['dW2']
    b2 = b2 - learning_rate * grads['db2']
    return W1, b1, W2, b2
```

### 전체 학습 루프

```python
def train(X, y, n_hidden=4, learning_rate=1.0, epochs=10000):
    n_input = X.shape[0]
    n_output = 1

    # 가중치 초기화 (작은 랜덤 값)
    np.random.seed(42)
    W1 = np.random.randn(n_hidden, n_input) * 0.01
    b1 = np.zeros((n_hidden, 1))
    W2 = np.random.randn(n_output, n_hidden) * 0.01
    b2 = np.zeros((n_output, 1))

    for epoch in range(epochs):
        # 1. 순전파
        a2, cache = forward(X, W1, b1, W2, b2)

        # 2. 손실 계산
        m = y.shape[1]
        loss = -(1/m) * np.sum(y * np.log(a2) + (1-y) * np.log(1-a2))

        # 3. 역전파
        grads = backward(X, y, cache, W2)

        # 4. 업데이트
        W1, b1, W2, b2 = update_params(W1, b1, W2, b2, grads, learning_rate)

        if epoch % 2000 == 0:
            print(f"Epoch {epoch:5d} | Loss: {loss:.6f}")

    return W1, b1, W2, b2
```

```
Epoch     0 | Loss: 0.693148
Epoch  2000 | Loss: 0.284710
Epoch  4000 | Loss: 0.073521
Epoch  6000 | Loss: 0.035142
Epoch  8000 | Loss: 0.022618
```

순전파 → 손실 → 역전파 → 업데이트. 이 4단계가 한 번의 **학습 반복(iteration)** 이다. 이걸 수천 번 반복하면 손실이 꾸준히 줄어들면서 네트워크가 학습한다.

---

## 계산 그래프 관점

역전파를 이해하는 또 다른 방법은 **계산 그래프(Computation Graph)** 다.

모든 연산을 노드로 표현한 그래프를 그린다고 생각해보자.

```
x ─── [×w1] ─── z1 ─── [σ] ─── a1 ─── [×w2] ─── z2 ─── [σ] ─── a2 ─── [L]
```

순전파: 왼쪽에서 오른쪽으로 값을 계산한다.
역전파: 오른쪽에서 왼쪽으로 기울기를 계산한다.

각 노드는 **지역 미분(local gradient)** 을 알고 있다. 예를 들어 곱셈 노드 z = w × a의 지역 미분은:

```
∂z/∂w = a    (가중치에 대한 기울기 = 입력값)
∂z/∂a = w    (입력에 대한 기울기 = 가중치)
```

역전파에서 각 노드는 "상류(upstream)에서 흘러온 기울기"와 "자신의 지역 미분"을 곱해서 "하류(downstream)으로 전달"한다. 이게 연쇄 법칙의 계산 그래프 해석이다.

이 관점의 강력함은 **복잡한 네트워크도 노드 단위로 분해**할 수 있다는 것이다. 각 노드는 자신의 지역 미분만 알면 되고, 전체 네트워크의 구조를 알 필요가 없다. PyTorch와 TensorFlow가 자동 미분(autograd)을 구현하는 원리가 바로 이것이다.

---

## 기울기 검증(Gradient Checking)

역전파를 직접 구현했을 때 가장 위험한 것은 **미분 공식의 오류**다. 코드가 실행은 되지만 기울기가 틀리면, 학습이 잘 안 되거나 아예 발산한다. 버그를 찾기도 어렵다.

해결책: **수치 미분(numerical gradient)** 으로 해석적 기울기를 검증한다.

수치 미분의 원리는 간단하다. 미분의 정의 그대로 아주 작은 ε만큼 파라미터를 변화시켜 기울기를 근사한다.

```
∂L/∂w ≈ [L(w + ε) - L(w - ε)] / (2ε)
```

양쪽으로 ε을 더하고 빼는 **중앙 차분(central difference)** 이 한쪽 차분보다 정확하다 (O(ε²) vs O(ε)).

```python
def gradient_check(X, y, W1, b1, W2, b2, epsilon=1e-7):
    """수치 미분과 역전파 기울기를 비교"""
    # 역전파로 기울기 계산
    a2, cache = forward(X, W1, b1, W2, b2)
    grads = backward(X, y, cache, W2)

    # W1의 각 원소에 대해 수치 미분
    numerical_grads = np.zeros_like(W1)
    for i in range(W1.shape[0]):
        for j in range(W1.shape[1]):
            W1_plus = W1.copy()
            W1_plus[i, j] += epsilon
            loss_plus = compute_loss(*forward(X, W1_plus, b1, W2, b2)[:1], y)

            W1_minus = W1.copy()
            W1_minus[i, j] -= epsilon
            loss_minus = compute_loss(*forward(X, W1_minus, b1, W2, b2)[:1], y)

            numerical_grads[i, j] = (loss_plus - loss_minus) / (2 * epsilon)

    # 차이 계산
    diff = np.linalg.norm(grads['dW1'] - numerical_grads)
    diff /= np.linalg.norm(grads['dW1']) + np.linalg.norm(numerical_grads)

    if diff < 1e-7:
        print(f"기울기 검증 통과! 차이: {diff:.2e}")
    else:
        print(f"기울기 검증 실패. 차이: {diff:.2e}")
```

```
기울기 검증 통과! 차이: 3.41e-10
```

<div style="background: #fff8f0; border-left: 4px solid #f59f00; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>실전 주의사항</strong><br>
  기울기 검증은 <strong>디버깅 전용</strong>이다. 수치 미분은 파라미터마다 순전파를 2번씩 해야 하므로 극도로 느리다. 학습 시에는 절대 사용하지 않는다. 구현이 올바른지 확인한 후에는 반드시 끈다.
</div>

---

## 기울기 소실과 기울기 폭발

위의 손 계산에서 w1의 기울기가 w2보다 훨씬 작았다. 2층 네트워크에서도 이런 차이가 나는데, 10층, 50층이면 어떨까?

### 기울기 소실 (Vanishing Gradient)

역전파 공식을 다시 보자.

```
dz[l-1] = W[l]^T · dz[l] ⊙ g'(z[l-1])
```

층을 거칠 때마다 g'(z)를 곱한다. 시그모이드의 도함수 최댓값은 0.25다 (z=0일 때). 즉, 층을 한 번 거칠 때마다 기울기가 최대 1/4로 줄어든다.

```
10층 네트워크: 기울기 × 0.25^10 ≈ 0.25^10 ≈ 0.000001
```

앞쪽 층의 기울기가 거의 0에 수렴한다. 기울기가 0이면 가중치가 업데이트되지 않는다. 앞쪽 층은 학습이 멈춘다. 이것이 **기울기 소실(vanishing gradient)** 문제다.

### 기울기 폭발 (Exploding Gradient)

반대로, 가중치 행렬 W의 원소가 크면 층을 거칠 때마다 기울기가 기하급수적으로 **커진다**.

```
각 층에서 기울기가 2배 → 10층: 2^10 = 1024배
```

기울기가 너무 커지면 가중치 업데이트가 폭발적으로 커져서 학습이 발산한다. NaN이 출력되기 시작하면 십중팔구 기울기 폭발이다.

### 이 문제를 어떻게 해결하는가?

| 문제 | 해결 방법 |
|------|----------|
| 기울기 소실 | ReLU 등 도함수가 1인 활성화 함수 사용 |
| 기울기 폭발 | gradient clipping, 적절한 가중치 초기화 |
| 두 문제 모두 | He/Xavier 초기화, BatchNorm, ResNet의 skip connection |

활성화 함수의 선택이 이 문제에 직접적인 영향을 미친다. 다음 글에서 자세히 다룬다.

---

## 전체 학습 과정 정리

신경망 학습의 전체 흐름을 한 번에 정리하자.

```
반복 (epoch = 1, 2, ..., N):
  │
  ├─ 1. 순전파 (Forward Pass)
  │     입력 X → 각 층의 z, a 계산 → 예측값 y_hat
  │     (중간 결과 z, a를 캐시에 저장)
  │
  ├─ 2. 손실 계산 (Loss)
  │     L = loss(y, y_hat)
  │
  ├─ 3. 역전파 (Backward Pass)
  │     출력층부터 입력층 방향으로
  │     dz[L] → dW[L], db[L] → dz[L-1] → ... → dW[1], db[1]
  │
  └─ 4. 가중치 업데이트 (Gradient Descent)
        W[l] = W[l] - α × dW[l]
        b[l] = b[l] - α × db[l]
```

이 4단계가 한 번의 반복이다. 수천~수만 번 반복하면 손실이 수렴하고 네트워크가 패턴을 학습한다.

[순전파](/ml/forward-propagation/)는 예측을 만들고, [비용 함수](/ml/cost-function/)는 오차를 측정하고, 역전파는 각 가중치의 책임을 계산하고, [경사하강법](/ml/gradient-descent/)은 그 정보로 가중치를 업데이트한다. 네 가지가 합쳐져서 비로소 "학습"이 된다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>요약</strong><br>
  <ul>
    <li>역전파 = 연쇄 법칙을 출력→입력 방향으로 적용하여 모든 가중치의 기울기를 효율적으로 계산하는 알고리즘</li>
    <li>핵심 공식: dz[l] = W[l+1]^T · dz[l+1] ⊙ g'(z[l])</li>
    <li>순전파 때 캐시를 저장해야 역전파가 효율적이다</li>
    <li>기울기 검증(gradient checking)으로 구현 정확성을 확인한다</li>
    <li>깊은 네트워크에서는 기울기 소실/폭발 문제가 발생 → 활성화 함수 선택이 중요</li>
  </ul>
</div>

---

## 다음 글 미리보기

역전파 공식에서 g'(z), 즉 **활성화 함수의 도함수**가 계속 등장했다. 시그모이드의 도함수 최댓값이 0.25라서 기울기 소실이 발생한다는 것도 보았다. 그러면 어떤 활성화 함수를 써야 하는가? ReLU, tanh, Leaky ReLU, Softmax — 각각의 특성과 용도를 다음 글에서 다룬다.

다음 글: [활성화 함수(Activation Functions): 뉴런에 비선형성을 부여하다](/ml/activation-functions/)
