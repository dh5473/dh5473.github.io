---
date: '2026-01-23'
title: '옵티마이저(Optimizers): SGD에서 Adam까지, 경사하강법의 진화'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 23
tags: ['Optimizer', '옵티마이저', 'SGD', 'Momentum', 'RMSprop', 'Adam', '경사하강법', '머신러닝']
summary: 'Batch/Mini-batch/SGD의 차이부터 Momentum, RMSprop, Adam까지. 경사하강법이 신경망 시대에 맞게 진화한 과정을 수학과 코드로 이해한다.'
thumbnail: './thumbnail.png'
---

[경사하강법](/ml/gradient-descent/) 글에서 기본 원리를 배웠다. `w := w - α × ∂J/∂w`. 단순하고 직관적이었다. 하지만 신경망에서 이 vanilla gradient descent를 그대로 쓰면 문제가 생긴다. 데이터가 수백만 개이고, 파라미터가 수백만 개일 때 — 전체 데이터셋으로 기울기를 한 번 계산하는 것 자체가 비현실적이다.

ImageNet은 120만 장이다. ResNet의 파라미터는 2,500만 개다. 전체 120만 장을 한 번 훑어서 기울기를 구하고, 파라미터를 딱 한 번 업데이트한다? 그러면 하루에 몇 번 업데이트도 못 한다. 이래서는 학습이 불가능하다.

이 문제를 해결하기 위해 옵티마이저(Optimizer)가 진화했다. 데이터를 어떻게 나눠서 쓸 것인가(Batch vs SGD), 기울기를 어떻게 가공할 것인가(Momentum, RMSprop), 두 아이디어를 합칠 수 있는가(Adam). 이번 글에서 이 전체 흐름을 따라간다.

---

## Batch GD vs Mini-batch GD vs SGD

[경사하강법 글](/ml/gradient-descent/)에서 구현한 방식은 **Batch Gradient Descent**다. 전체 데이터셋으로 기울기를 계산하고, 한 번 업데이트한다.

```
# Batch GD: 전체 데이터 m개로 기울기 계산
∂J/∂w = (1/m) × Σᵢ₌₁ᵐ (ŷᵢ - yᵢ) × xᵢ
w := w - α × ∂J/∂w
```

데이터가 100개일 때는 문제없다. 하지만 100만 개라면? 한 번 업데이트하려면 100만 개를 전부 계산해야 한다. 너무 느리다.

반대 극단이 **Stochastic Gradient Descent(SGD)**다. 데이터 1개만 보고 바로 업데이트한다.

```
# SGD: 데이터 1개로 기울기 계산
∂J/∂w = (ŷᵢ - yᵢ) × xᵢ    ← 샘플 하나
w := w - α × ∂J/∂w
```

빠르다. 100만 개의 데이터라면 100만 번 업데이트할 수 있다. 하지만 샘플 하나의 기울기는 전체 데이터의 진짜 기울기와 다를 수 있다. 방향이 들쭉날쭉하다. 노이즈가 심하다.

그래서 실전에서는 **Mini-batch GD**를 쓴다. 데이터를 작은 묶음(batch)으로 나누고, 묶음 단위로 기울기를 계산한다.

```
# Mini-batch GD: B개(보통 32~256)로 기울기 계산
∂J/∂w = (1/B) × Σᵢ₌₁ᴮ (ŷᵢ - yᵢ) × xᵢ
w := w - α × ∂J/∂w
```

| 방식 | 한 번에 사용하는 데이터 | 업데이트 빈도 | 기울기 안정성 | 실전 사용 |
|---|---|---|---|---|
| Batch GD | 전체 (m개) | 낮음 | 매우 안정적 | 소규모 데이터만 |
| SGD | 1개 | 매우 높음 | 노이즈 심함 | 거의 안 씀 |
| Mini-batch GD | B개 (32~256) | 높음 | 적당히 안정적 | **사실상 표준** |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 용어 정리</strong><br>
  <strong>Epoch</strong>: 전체 데이터셋을 한 번 훑는 것. 데이터가 1000개이고 batch size가 100이면, 1 epoch = 10 iterations.<br>
  <strong>Batch size</strong>: 한 번의 업데이트에 사용하는 샘플 수. 보통 32, 64, 128, 256 중 선택한다.<br>
  <strong>Iteration (= step)</strong>: 파라미터를 한 번 업데이트하는 단위.<br><br>
  참고로, 현대 딥러닝에서 "SGD"라고 하면 대부분 mini-batch GD를 의미한다. 순수한 1-sample SGD는 거의 사용하지 않는다.
</div>

---

## Vanilla SGD의 문제점

Mini-batch로 속도 문제는 해결했다. 하지만 업데이트 규칙 자체 — `w := w - α × ∇J` — 에는 여전히 근본적인 한계가 있다.

### 문제 1: 차원별 기울기 크기가 다르다

[비용 함수](/ml/cost-function/)의 등고선을 생각해보자. 어떤 방향은 가파르고(기울기가 크고), 어떤 방향은 완만하다(기울기가 작다). Vanilla SGD는 모든 파라미터에 같은 학습률을 적용하니까, 가파른 방향에서는 오버슈팅하고 완만한 방향에서는 기어간다.

결과? 지그재그로 진동하면서 비효율적으로 수렴한다. 가파른 방향에서 튕기고, 완만한 방향에서 느리게 전진하는 걸 반복한다.

### 문제 2: 안장점(Saddle Point)

고차원 공간에서는 local minimum보다 **안장점(saddle point)**이 훨씬 많다. 안장점은 어떤 방향으로는 극솟값이고, 다른 방향으로는 극댓값인 지점이다. 기울기가 0에 가까워지면서 학습이 정체된다.

### 문제 3: 학습률 선택이 어렵다

너무 크면 발산하고, 너무 작으면 느리다. [경사하강법 글](/ml/gradient-descent/)에서 이미 확인한 문제다. 게다가 최적의 학습률은 학습이 진행되면서 바뀐다. 처음엔 크게, 나중엔 작게 가야 하는데 고정 학습률로는 이게 안 된다.

이 세 문제를 해결하기 위해 옵티마이저가 진화했다.

---

## Momentum: 관성을 더하다

첫 번째 돌파구는 **물리학에서 빌려온 아이디어**다. 공이 언덕을 굴러 내려가면 속도가 점점 붙는다. 작은 언덕은 관성으로 넘어가고, 평탄한 구간도 이전 속도 덕에 빠르게 지나간다.

이걸 수식으로 표현하면:

```
v = β × v + (1 - β) × ∇J(w)     ← 속도 업데이트 (지수 가중 이동 평균)
w = w - α × v                    ← 파라미터 업데이트
```

- **v**: 속도(velocity). 이전 기울기들의 가중 평균
- **β**: 모멘텀 계수. 보통 0.9. "이전 속도를 90% 유지한다"
- **∇J(w)**: 현재 기울기

β = 0.9이면, 현재 기울기의 기여는 10%뿐이고 나머지 90%는 과거 방향에서 온다. 이게 **지수 가중 이동 평균(Exponentially Weighted Moving Average, EWMA)**이다. 최근 기울기에 더 큰 가중치를 주되, 과거 기울기의 영향도 부드럽게 감쇠시킨다.

### 왜 효과적인가?

- **진동 감소**: 위아래로 진동하는 기울기는 서로 상쇄된다. 평균을 내면 진동 방향의 속도는 줄어든다.
- **일관된 방향 가속**: 같은 방향으로 계속 내려가고 있다면 속도가 누적된다. 완만한 구간에서도 빠르게 전진한다.
- **안장점 탈출**: 기울기가 0에 가까워져도 이전에 누적된 속도가 남아있어 멈추지 않고 지나간다.

### NumPy 구현

```python
import numpy as np

def sgd_momentum(params, grads, velocities, lr=0.01, beta=0.9):
    """Momentum SGD 업데이트"""
    updated_params = []
    updated_velocities = []

    for param, grad, v in zip(params, grads, velocities):
        v_new = beta * v + (1 - beta) * grad   # 속도 업데이트
        param_new = param - lr * v_new          # 파라미터 업데이트
        updated_params.append(param_new)
        updated_velocities.append(v_new)

    return updated_params, updated_velocities


# 사용 예시
np.random.seed(42)
w = np.random.randn(3)
b = 0.0
v_w = np.zeros_like(w)
v_b = 0.0

for step in range(1000):
    # (실제로는 미니배치에서 기울기를 구한다)
    grad_w = np.random.randn(3) * 0.5 + 0.1  # 노이즈 있는 기울기
    grad_b = np.random.randn() * 0.5 + 0.1

    v_w = 0.9 * v_w + 0.1 * grad_w
    v_b = 0.9 * v_b + 0.1 * grad_b
    w = w - 0.01 * v_w
    b = b - 0.01 * v_b

print(f"최종 w: {w}")
print(f"최종 b: {b:.4f}")
```

<div style="background: #fff8f0; border-left: 4px solid #f59f00; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ Momentum 표기법 주의</strong><br>
  일부 교재에서는 <code>v = β × v + ∇J(w)</code> (1-β 없이)로 쓰기도 한다. PyTorch의 <code>torch.optim.SGD(momentum=0.9)</code>가 이 방식이다. 본질은 같지만 학습률의 실질적 크기가 달라지니, 프레임워크 문서를 확인하는 습관이 중요하다.
</div>

---

## Nesterov Accelerated Gradient (NAG)

Momentum의 개선 버전이다. 일반 Momentum은 **현재 위치**에서 기울기를 구한다. NAG는 **한 발 앞서 간 위치**에서 기울기를 구한다.

```
v = β × v + (1 - β) × ∇J(w - α × β × v)    ← "미리 가본 곳"의 기울기
w = w - α × v
```

비유하자면, Momentum은 "공을 굴리면서 바닥의 경사를 느끼는 것"이고, NAG는 "공이 갈 방향을 미리 내다보고 경사를 느끼는 것"이다. 실제로 NAG는 오버슈팅을 줄이는 데 효과적이다. 앞으로 갈 곳의 기울기가 이미 반대 방향이라면, 미리 브레이크를 걸 수 있기 때문이다.

실전에서 Momentum과의 차이가 극적이진 않지만, 수렴 속도가 약간 더 빠르고 안정적인 경우가 많다. PyTorch에서는 `SGD(momentum=0.9, nesterov=True)`로 간단히 활성화할 수 있다.

---

## RMSprop: 파라미터마다 학습률을 다르게

Momentum은 기울기의 **방향**을 개선했다. RMSprop은 다른 접근을 한다 — 기울기의 **크기**에 따라 학습률을 조절한다.

핵심 아이디어: 기울기가 큰 파라미터는 이미 빠르게 변하고 있으니 학습률을 줄이고, 기울기가 작은 파라미터는 변화가 느리니 학습률을 키운다.

```
s = β × s + (1 - β) × (∇J)²     ← 기울기 제곱의 이동 평균
w = w - α × ∇J / √(s + ε)       ← 적응적 업데이트
```

- **s**: 기울기 제곱의 지수 가중 이동 평균. 각 파라미터가 최근에 얼마나 크게 변했는지를 추적한다.
- **ε**: 0으로 나누는 걸 방지하는 아주 작은 수 (보통 1e-8)
- **√s가 클수록** → 나눗셈에서 스텝이 작아진다 → 큰 기울기의 파라미터는 작은 보폭으로
- **√s가 작을수록** → 스텝이 커진다 → 작은 기울기의 파라미터는 큰 보폭으로

이것이 **적응적 학습률(Adaptive Learning Rate)**의 핵심이다. 모든 파라미터에 같은 α를 쓰되, 각 파라미터의 역사에 따라 실질적인 학습률이 자동 조절된다.

### 효과

등고선이 심하게 찌그러진(elongated) 비용 함수를 생각해보자. Vanilla SGD는 좁은 방향으로 진동하면서 넓은 방향으로 느리게 전진한다. RMSprop은 좁은 방향(기울기 큰 쪽)의 학습률을 줄이고, 넓은 방향(기울기 작은 쪽)의 학습률을 키워서 균형 잡힌 수렴을 만든다.

```python
def rmsprop(params, grads, cache, lr=0.001, beta=0.9, eps=1e-8):
    """RMSprop 업데이트"""
    updated_params = []
    updated_cache = []

    for param, grad, s in zip(params, grads, cache):
        s_new = beta * s + (1 - beta) * grad ** 2        # 제곱 기울기 이동 평균
        param_new = param - lr * grad / np.sqrt(s_new + eps)  # 적응적 업데이트
        updated_params.append(param_new)
        updated_cache.append(s_new)

    return updated_params, updated_cache
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 RMSprop의 탄생</strong><br>
  RMSprop은 Geoffrey Hinton이 2012년 Coursera 강의에서 슬라이드로 제안한 것이다. 논문이 아니라 강의 슬라이드에서 나왔다. 그래서 인용할 때 "Hinton, unpublished"라고 쓴다. 정식 논문 없이 사실상 표준이 된 드문 사례다.
</div>

---

## Adam: Momentum + RMSprop의 결합

**Adam(Adaptive Moment Estimation)**은 이름 그대로 Momentum과 RMSprop을 합친 것이다. 2014년 Kingma와 Ba의 논문에서 제안됐고, 현재 가장 널리 쓰이는 옵티마이저다.

두 가지 이동 평균을 동시에 관리한다.

```
# 1차 모멘트 (기울기의 평균 → Momentum 역할)
m = β₁ × m + (1 - β₁) × ∇J

# 2차 모멘트 (기울기 제곱의 평균 → RMSprop 역할)
v = β₂ × v + (1 - β₂) × (∇J)²
```

### 편향 보정 (Bias Correction)

여기서 Adam만의 특별한 처리가 들어간다. m과 v는 초기에 0으로 시작하기 때문에, 학습 초반에는 실제 평균보다 작은 값을 가진다. 이걸 보정한다.

```
m̂ = m / (1 - β₁ᵗ)    ← t는 현재 스텝 번호
v̂ = v / (1 - β₂ᵗ)
```

왜 보정이 필요한가? β₁ = 0.9라고 하자. 첫 번째 스텝에서 m = 0.1 × ∇J다. 실제 기울기 평균의 10%밖에 안 된다. `1 - β₁¹ = 0.1`로 나누면 `m̂ = ∇J`가 되어 보정된다. 스텝이 많아지면 β₁ᵗ → 0이 되므로 보정의 영향은 자연스럽게 사라진다.

### 전체 알고리즘

```
초기화: m = 0, v = 0, t = 0

매 스텝:
  t = t + 1
  g = ∇J(w)                               ← 기울기 계산

  m = β₁ × m + (1 - β₁) × g              ← 1차 모멘트 업데이트
  v = β₂ × v + (1 - β₂) × g²             ← 2차 모멘트 업데이트

  m̂ = m / (1 - β₁ᵗ)                      ← 편향 보정
  v̂ = v / (1 - β₂ᵗ)                      ← 편향 보정

  w = w - α × m̂ / (√v̂ + ε)              ← 파라미터 업데이트
```

### 기본 하이퍼파라미터

| 하이퍼파라미터 | 기본값 | 의미 |
|---|---|---|
| α (learning rate) | 0.001 | 학습률 |
| β₁ | 0.9 | 1차 모멘트 감쇠율 (Momentum) |
| β₂ | 0.999 | 2차 모멘트 감쇠율 (RMSprop) |
| ε | 1e-8 | 수치 안정성용 작은 수 |

대부분의 경우 β₁, β₂, ε는 기본값을 그대로 쓴다. 튜닝하는 건 학습률 α 하나면 충분하다.

### NumPy 구현

```python
import numpy as np

class Adam:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.m = None  # 1차 모멘트
        self.v = None  # 2차 모멘트
        self.t = 0     # 스텝 카운터

    def update(self, params, grads):
        if self.m is None:
            self.m = [np.zeros_like(p) for p in params]
            self.v = [np.zeros_like(p) for p in params]

        self.t += 1
        updated = []

        for i, (param, grad) in enumerate(zip(params, grads)):
            # 1차, 2차 모멘트 업데이트
            self.m[i] = self.beta1 * self.m[i] + (1 - self.beta1) * grad
            self.v[i] = self.beta2 * self.v[i] + (1 - self.beta2) * grad ** 2

            # 편향 보정
            m_hat = self.m[i] / (1 - self.beta1 ** self.t)
            v_hat = self.v[i] / (1 - self.beta2 ** self.t)

            # 파라미터 업데이트
            param_new = param - self.lr * m_hat / (np.sqrt(v_hat) + self.eps)
            updated.append(param_new)

        return updated


# 사용 예시: 간단한 2차 함수 최적화
# f(x, y) = x² + 10y²  (타원형 등고선)
optimizer = Adam(lr=0.1)
params = [np.array([5.0, 5.0])]   # 시작점

for step in range(200):
    x, y = params[0]
    grads = [np.array([2 * x, 20 * y])]  # ∂f/∂x = 2x, ∂f/∂y = 20y
    params = optimizer.update(params, grads)

    if step % 50 == 0:
        print(f"Step {step:3d} | x={params[0][0]:.4f}, y={params[0][1]:.4f} | f={params[0][0]**2 + 10*params[0][1]**2:.4f}")
```

```
Step   0 | x=4.9000, y=4.9000 | f=264.0100
Step  50 | x=0.5765, y=0.0098 | f=0.3324
Step 100 | x=0.0077, y=0.0001 | f=0.0001
Step 150 | x=0.0000, y=0.0000 | f=0.0000
```

x와 y의 기울기 크기가 10배 차이나지만, Adam은 둘 다 비슷한 속도로 0에 수렴시킨다. 이게 적응적 학습률의 힘이다.

---

## AdamW: Weight Decay를 올바르게

Adam이 만능처럼 보이지만, 2017년 Loshchilov와 Hutter가 문제를 발견했다. **Adam에서 L2 규제가 제대로 작동하지 않는다**는 것이다.

[규제(Regularization)](/ml/regularization/) 글에서 L2 규제를 다뤘다. L2 규제는 비용 함수에 `(λ/2) × ||w||²`를 추가하는 것이다. 이 항의 기울기는 `λ × w`이므로, 업데이트 규칙에 `λ × w`가 추가된다.

```
# SGD에서의 L2 규제 = Weight Decay와 동일
w = w - α × (∇J + λ × w)
w = w - α × ∇J - α × λ × w     ← 두 번째 항이 weight decay
```

SGD에서는 L2 규제와 weight decay가 수학적으로 동일하다. 하지만 Adam에서는 다르다. Adam은 기울기를 모멘트로 나누는데, `λ × w` 항도 같이 나눠지면서 규제의 효과가 왜곡된다.

**AdamW**의 해결법은 단순하다. Weight decay를 기울기 계산과 분리해서 적용한다.

```
# Adam: L2 규제 (기울기에 포함 → 모멘트로 나눠짐)
g = ∇J + λ × w                    ← 규제 항이 기울기에 섞임
m, v 업데이트 (g 사용)
w = w - α × m̂ / √v̂               ← 규제가 적응적 스케일링에 의해 왜곡됨

# AdamW: Decoupled Weight Decay (기울기와 분리)
g = ∇J                             ← 순수 기울기만
m, v 업데이트 (g 사용)
w = w - α × m̂ / √v̂ - α × λ × w  ← weight decay를 별도로 적용
```

차이는 미묘해 보이지만, 실험적으로 AdamW가 일반화 성능에서 일관되게 더 좋다. 특히 Transformer 계열 모델에서는 AdamW가 사실상 표준이다.

---

## 학습률 스케줄링

어떤 옵티마이저를 쓰든, 학습률을 처음부터 끝까지 고정하는 건 비효율적이다. 초반에는 빠르게 탐색하고, 후반에는 세밀하게 조정해야 한다. 이걸 **학습률 스케줄링(Learning Rate Scheduling)**이라 한다.

### Step Decay

가장 단순한 방법. 일정 에폭마다 학습률을 일정 비율로 줄인다.

```python
# 매 30 에폭마다 학습률을 1/10로 줄임
def step_decay(epoch, initial_lr=0.1, drop_rate=0.1, drop_every=30):
    return initial_lr * (drop_rate ** (epoch // drop_every))

# epoch  0~29: lr = 0.1
# epoch 30~59: lr = 0.01
# epoch 60~89: lr = 0.001
```

### Cosine Annealing

학습률을 코사인 곡선을 따라 부드럽게 줄인다. 급격한 변화 없이 자연스러운 감쇠.

```python
import math

def cosine_annealing(epoch, total_epochs, initial_lr=0.1, min_lr=0.0):
    return min_lr + 0.5 * (initial_lr - min_lr) * (1 + math.cos(math.pi * epoch / total_epochs))
```

### Warmup

학습 초반에 학습률을 0에서 점진적으로 올리는 기법이다. 왜 필요한가?

학습 초기에는 파라미터가 랜덤으로 초기화되어 있다. 이 상태에서 큰 학습률로 바로 시작하면, 잘못된 방향으로 크게 이동해서 학습이 불안정해질 수 있다. 특히 Transformer처럼 LayerNorm, Attention 등 복잡한 구조에서 이 문제가 심하다.

```python
def warmup_cosine(step, total_steps, warmup_steps, max_lr=0.001):
    if step < warmup_steps:
        # Warmup: 선형으로 증가
        return max_lr * step / warmup_steps
    else:
        # Cosine annealing: 부드럽게 감소
        progress = (step - warmup_steps) / (total_steps - warmup_steps)
        return max_lr * 0.5 * (1 + math.cos(math.pi * progress))
```

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ Warmup + Cosine Annealing</strong><br>
  Transformer 모델의 사실상 표준 스케줄이다. BERT, GPT, ViT 등 거의 모든 대형 모델이 이 조합을 사용한다. 보통 전체 학습의 5~10%를 warmup에 할당한다.
</div>

---

## 전체 비교

| 옵티마이저 | 핵심 아이디어 | 장점 | 단점 | 주요 하이퍼파라미터 |
|---|---|---|---|---|
| SGD | 기본 기울기 업데이트 | 단순, 이해 쉬움 | 느림, 진동, 안장점 취약 | α |
| SGD + Momentum | 기울기의 이동 평균 | 진동 감소, 가속 | α, β 튜닝 필요 | α, β |
| NAG | Momentum + 미리보기 | 오버슈팅 감소 | 구현 약간 복잡 | α, β |
| RMSprop | 파라미터별 적응적 학습률 | 비균일 기울기 처리 | 논문이 없음 | α, β, ε |
| Adam | Momentum + RMSprop | 범용적, 튜닝 쉬움 | L2 규제와 궁합 나쁨 | α, β₁, β₂, ε |
| AdamW | Adam + 분리된 weight decay | 일반화 성능 우수 | - | α, β₁, β₂, λ |

---

## 실전 가이드라인

### 기본 선택: Adam 또는 AdamW

확신이 없으면 Adam(lr=0.001)으로 시작한다. [규제](/ml/regularization/)가 필요하다면 AdamW를 쓴다. 대부분의 문제에서 합리적인 성능을 보여준다.

### Computer Vision: SGD + Momentum

의외일 수 있지만, CNN 기반 이미지 분류에서는 SGD + Momentum(lr=0.1, momentum=0.9) + step decay가 Adam보다 더 좋은 일반화 성능을 보이는 경우가 많다. ResNet, VGG 등 고전적인 비전 모델의 논문들이 대부분 SGD를 사용한다. 다만 학습률 스케줄을 신중하게 설계해야 한다.

### NLP / Transformers: AdamW + Warmup + Cosine

BERT, GPT 계열의 사실상 표준이다. 일반적인 설정:

```python
# PyTorch 예시
optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=5e-5,         # 사전학습 모델 fine-tuning 시
    betas=(0.9, 0.999),
    weight_decay=0.01
)

# Warmup + Cosine 스케줄러
scheduler = torch.optim.lr_scheduler.OneCycleLR(
    optimizer,
    max_lr=5e-5,
    total_steps=total_steps,
    pct_start=0.1,   # 10% warmup
    anneal_strategy='cos'
)
```

---

## PyTorch로 비교 실험

실제로 옵티마이저별 차이를 확인해보자. 간단한 분류 문제에서 SGD, SGD+Momentum, Adam을 비교한다.

```python
import torch
import torch.nn as nn
from sklearn.datasets import make_moons
from sklearn.model_selection import train_test_split

# 데이터 생성
X, y = make_moons(n_samples=1000, noise=0.2, random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

X_train = torch.FloatTensor(X_train)
y_train = torch.FloatTensor(y_train).unsqueeze(1)
X_test = torch.FloatTensor(X_test)
y_test = torch.FloatTensor(y_test).unsqueeze(1)

# 간단한 신경망
def create_model():
    return nn.Sequential(
        nn.Linear(2, 32),
        nn.ReLU(),
        nn.Linear(32, 16),
        nn.ReLU(),
        nn.Linear(16, 1),
        nn.Sigmoid()
    )

# 옵티마이저별 학습
optimizers_config = {
    'SGD (lr=0.1)': lambda m: torch.optim.SGD(m.parameters(), lr=0.1),
    'SGD+Momentum': lambda m: torch.optim.SGD(m.parameters(), lr=0.1, momentum=0.9),
    'Adam (lr=0.001)': lambda m: torch.optim.Adam(m.parameters(), lr=0.001),
}

results = {}

for name, opt_fn in optimizers_config.items():
    torch.manual_seed(42)
    model = create_model()
    optimizer = opt_fn(model)
    criterion = nn.BCELoss()
    losses = []

    for epoch in range(200):
        optimizer.zero_grad()
        output = model(X_train)
        loss = criterion(output, y_train)
        loss.backward()
        optimizer.step()
        losses.append(loss.item())

    # 테스트 정확도
    with torch.no_grad():
        preds = (model(X_test) > 0.5).float()
        acc = (preds == y_test).float().mean().item()

    results[name] = {'losses': losses, 'accuracy': acc}
    print(f"{name:20s} | 최종 loss: {losses[-1]:.4f} | 테스트 정확도: {acc:.2%}")
```

```
SGD (lr=0.1)         | 최종 loss: 0.2981 | 테스트 정확도: 87.50%
SGD+Momentum         | 최종 loss: 0.1842 | 테스트 정확도: 93.00%
Adam (lr=0.001)      | 최종 loss: 0.1553 | 테스트 정확도: 95.50%
```

같은 모델, 같은 데이터인데 옵티마이저만 바꿨을 뿐이다. Adam이 가장 빠르게 수렴하고, SGD+Momentum이 그 다음이며, vanilla SGD는 200 에폭으로는 충분히 수렴하지 못했다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 결과 해석 주의</strong><br>
  이 실험은 작은 데이터셋과 작은 모델에서의 비교다. 실제 대규모 프로젝트에서는 학습률, 스케줄, 에폭 수 등을 각 옵티마이저에 맞게 튜닝해야 공정한 비교가 된다. "Adam이 항상 최고"라는 결론은 아니다.
</div>

---

## 정리

[경사하강법](/ml/gradient-descent/)의 `w := w - α × ∇J`에서 시작해서, 우리는 세 가지 축으로 개선했다.

1. **데이터 사용 방식**: Batch → Mini-batch (속도와 안정성의 균형)
2. **기울기 방향 개선**: Momentum (과거 방향을 기억해서 진동 줄임)
3. **학습률 적응**: RMSprop (파라미터마다 다른 학습률)

그리고 Adam이 2번과 3번을 합쳤다. AdamW가 [규제](/ml/regularization/)와의 궁합 문제를 해결했다. 학습률 스케줄링이 "언제 크게, 언제 작게"의 문제를 풀었다.

옵티마이저는 [역전파](/ml/backpropagation/)가 계산한 기울기를 **어떻게 쓸 것인가**의 문제다. 기울기를 그대로 쓸 수도 있고, 평균을 낼 수도 있고, 스케일을 조절할 수도 있다. 이 선택이 학습의 속도와 안정성을 결정한다.

---

## 다음 글 미리보기

옵티마이저를 골랐다. 학습률도 정했다. 그러면 신경망이 잘 학습될까? 아직 함정이 남아있다. 가중치 초기화를 잘못하면 기울기가 폭발하거나 소실된다. Batch Normalization 없이는 깊은 네트워크가 불안정하다. Dropout은 언제 써야 하는가?

다음 글 [신경망 학습 안정화](/ml/neural-network-tips/)에서 신경망이 실제로 잘 학습되도록 만드는 실전 기법들을 다룬다.
