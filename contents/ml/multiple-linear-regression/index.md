---
date: '2026-03-11'
title: '다중 선형 회귀(Multiple Linear Regression): 변수가 늘어나면 달라지는 것들'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 6
tags: ['Multiple Linear Regression', 'Feature Scaling', 'Standardization', '머신러닝 기초', 'sklearn']
summary: '변수 하나에서 여러 개로 확장하는 다중 선형 회귀의 원리와 벡터화 구현. Feature Scaling이 왜 필수인지, 어떤 방법을 써야 하는지 코드로 완전히 이해한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/gradient-descent/)에서 경사하강법으로 면적 → 가격 예측 모델을 만들었다. 잘 동작했지만, 한 가지 찜찜한 점이 있었다 — **b가 수렴을 안 한다는 것**. 5,000번 반복해도 b는 최적값(-0.08)에 한참 못 미치는 -0.0003에 머물렀다. 원인은 입력값의 **스케일 차이**였다.

현실은 이보다 더 복잡하다. 집값은 면적 하나로 정해지지 않는다. 방 개수, 층수, 역까지 거리, 건축 연도... 변수가 수십 개일 수도 있다. 변수가 늘어나면 모델은 어떻게 바뀌고, 스케일 문제는 얼마나 심각해질까?

---

## 단일 변수에서 다중 변수로

[선형 회귀 글](/ml/linear-regression/)에서 다룬 모델은 변수가 하나였다.

```
ŷ = wx + b
```

변수가 여러 개면 각각에 가중치를 붙인다.

```
ŷ = w₁x₁ + w₂x₂ + w₃x₃ + ... + wₙxₙ + b
```

예를 들어 면적(x₁), 방 수(x₂), 층수(x₃)로 집값을 예측한다면:

```
가격 = w₁ × 면적 + w₂ × 방수 + w₃ × 층수 + b
```

각 wᵢ의 의미는 **"다른 변수를 고정했을 때, xᵢ가 1 증가하면 ŷ가 wᵢ만큼 변한다"**는 것이다. 면적이 1평 늘어날 때 가격이 얼마나 오르는지, 방이 하나 추가될 때 가격이 얼마나 오르는지를 각각 독립적으로 파악할 수 있다.

### 벡터화 표기

변수가 많아지면 수식을 일일이 쓰기 어렵다. 행렬로 한 번에 표현하면 깔끔하다.

데이터 하나를 벡터로 쓰면:

```
x = [x₁, x₂, x₃]    (특성 벡터)
w = [w₁, w₂, w₃]    (가중치 벡터)
```

예측값:

```
ŷ = x · w + b    (내적 + 편향)
```

데이터가 m개면 행렬 X(m × n)로 한 번에 계산한다.

```
ŷ = Xw + b
```

코드로 쓰면 `y_pred = X @ w + b` — 한 줄이다. NumPy의 행렬 곱(`@`)이 모든 데이터 포인트에 대한 예측을 동시에 처리한다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 표기법 정리</strong><br>
  <strong>n</strong>: 특성(변수) 수, <strong>m</strong>: 데이터 포인트 수.<br>
  X는 (m × n) 행렬 — 행이 데이터, 열이 특성. w는 (n,) 벡터. 이 표기가 scikit-learn, PyTorch 등 거의 모든 ML 라이브러리의 표준이다.
</div>

---

## 다중 선형 회귀 구현

실제 데이터로 구현해보자. 아파트 가격 예측 — 면적(평), 방 수, 층수를 특성으로 사용한다.

```python
import numpy as np

# 아파트 데이터: 면적(평), 방 수, 층수 → 가격(억원)
X = np.array([
    [142, 5, 23], [91, 2, 20], [132, 4,  3], [54, 2,  5],
    [146, 4, 19], [111, 5,  7], [100, 1, 21], [60, 4,  9],
    [142, 2,  7], [122, 5, 18], [126, 4,  4], [114, 1, 14],
    [114, 1, 18], [127, 3,  9], [156, 3, 21], [139, 2,  2],
    [143, 4, 20], [63, 4, 15], [42, 3,  7],  [61, 4, 12],
], dtype=float)

y = np.array([
    7.56, 4.63, 6.45, 3.34, 6.88, 6.80, 5.25, 4.84,
    5.97, 7.28, 6.06, 4.23, 5.01, 5.83, 6.70, 5.45,
    6.85, 4.73, 3.57, 4.84,
])
```

경사하강법을 다변수 버전으로 확장하면, 핵심 변화는 `dw`가 스칼라에서 **벡터**가 된다는 것이다.

```python
# 초기화
n_features = X.shape[1]  # 3
w = np.zeros(n_features)
b = 0.0
lr = 0.00001
epochs = 5000
m = len(y)

for epoch in range(epochs):
    y_pred = X @ w + b                    # (20,) = (20,3) @ (3,)
    error = y_pred - y                    # (20,)
    dw = (2/m) * (X.T @ error)            # (3,) = (3,20) @ (20,)
    db = (2/m) * np.sum(error)            # scalar
    w = w - lr * dw
    b = b - lr * db

    if epoch % 1000 == 0:
        cost = np.mean(error ** 2)
        print(f"Epoch {epoch:5d} | Cost: {cost:.4f} | w={np.round(w, 4)}")
```

```
Epoch     0 | Cost: 32.9157 | w=[0.0129 0.0004 0.0015]
Epoch  1000 | Cost: 0.8968 | w=[0.0441 0.0298 0.0386]
Epoch  2000 | Cost: 0.8099 | w=[0.0421 0.0561 0.0505]
Epoch  3000 | Cost: 0.7449 | w=[0.041  0.081  0.0543]
Epoch  4000 | Cost: 0.6878 | w=[0.0402 0.1046 0.0552]
```

5,000번 반복 후에도 cost가 0.64에서 크게 줄지 않는다. sklearn의 정답(cost ≈ 0.07)과 비교하면 한참 멀다. w₂(방 수)는 0.13인데 정답은 0.49 — 수렴이 안 된 것이다.

**왜?** 면적은 42~156, 방 수는 1~5, 층수는 2~23. 값의 범위가 전혀 다르다.

---

## Feature Scaling이 필요한 이유

면적의 범위가 42~156이고 방 수는 1~5다. 기울기(gradient) 계산에서 `X.T @ error`를 하면, 면적 열은 값이 크니 기울기도 크고, 방 수 열은 값이 작으니 기울기도 작다.

결과적으로 **하나의 학습률로 모든 변수를 동시에 적절히 업데이트하는 게 불가능**해진다.

- 학습률을 면적에 맞추면 → 방 수와 층수가 너무 느리게 수렴
- 학습률을 방 수에 맞추면 → 면적이 발산

이전 글에서 단일 변수인데도 이 문제를 겪었다. 면적(60~155)이 크니 w는 빠르게 수렴하는데 b는 느렸다. 변수가 여러 개면 이 문제가 훨씬 심각해진다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 등고선으로 이해하기</strong><br>
  비용 함수를 2D 등고선으로 그리면, 스케일이 다른 변수는 <strong>가늘고 긴 타원</strong>을 만든다. 경사하강법은 이 타원의 긴 축 방향으로 지그재그하며 느리게 수렴한다. 스케일을 맞추면 등고선이 <strong>원</strong>에 가까워지고, 경사하강법은 곧장 최저점으로 내려간다.
</div>

해결책은 간단하다. **모든 변수를 비슷한 범위로 맞춰준다.** 이게 Feature Scaling이다.

---

## Feature Scaling 방법 비교

| 방법 | 공식 | 결과 범위 | 특징 |
|------|------|----------|------|
| **Min-Max Normalization** | (x − min) / (max − min) | [0, 1] | 범위가 명확, 이상치에 민감 |
| **Standardization (Z-score)** | (x − μ) / σ | 평균 0, 표준편차 1 | 이상치에 덜 민감, 가장 범용적 |
| **Mean Normalization** | (x − μ) / (max − min) | 약 [−0.5, 0.5] | Min-Max와 Standardization의 중간 |

### Min-Max Normalization

모든 값을 0~1 사이로 압축한다.

```python
X_min = X.min(axis=0)
X_max = X.max(axis=0)
X_minmax = (X - X_min) / (X_max - X_min)
# 면적 42 → 0.0, 면적 156 → 1.0
```

**장점**: 결과가 [0, 1]로 직관적. 이미지 처리 등 범위가 중요한 경우 적합.
**단점**: 이상치(outlier)가 하나라도 있으면 나머지 데이터가 좁은 범위로 몰린다.

### Standardization (Z-score)

평균을 0, 표준편차를 1로 맞춘다. 실무에서 **가장 많이 쓰는 방법**이다.

```python
X_mean = X.mean(axis=0)  # [109.25, 3.15, 12.7]
X_std = X.std(axis=0)    # [34.58, 1.31, 6.79]
X_scaled = (X - X_mean) / X_std
```

**장점**: 이상치의 영향이 상대적으로 작다. 대부분의 ML 알고리즘에서 기본 선택.
**단점**: 결과가 특정 범위로 제한되지 않는다 (보통 -3~3 정도).

### Mean Normalization

평균을 빼고 범위로 나눈다.

```python
X_mean_norm = (X - X.mean(axis=0)) / (X.max(axis=0) - X.min(axis=0))
```

Min-Max와 Standardization 사이의 절충안. Andrew Ng 강의에서 자주 등장하지만, 실무에서는 Standardization이 더 일반적이다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 어떤 방법을 쓸까?</strong><br>
  확신이 없으면 <strong>Standardization</strong>을 쓴다. 선형 회귀, 로지스틱 회귀, SVM, 신경망 등 경사하강법 기반 알고리즘에서 거의 항상 잘 동작한다. 트리 기반 모델(Decision Tree, Random Forest, XGBoost)은 분할 기준이 크기 비교라서 스케일링이 필요 없다.
</div>

---

## Before/After: 스케일링의 효과

같은 데이터, 같은 경사하강법인데 스케일링 여부만 다르다. 차이가 극적이다.

```python
# Standardization 적용
X_mean = X.mean(axis=0)
X_std = X.std(axis=0)
X_scaled = (X - X_mean) / X_std

w = np.zeros(3)
b = 0.0
lr = 0.01  # 학습률을 1,000배 키울 수 있다!
m = len(y)

for epoch in range(5001):
    y_pred = X_scaled @ w + b
    error = y_pred - y
    cost = np.mean(error ** 2)
    dw = (2/m) * (X_scaled.T @ error)
    db = (2/m) * np.sum(error)
    w = w - lr * dw
    b = b - lr * db

    if epoch in [0, 10, 50, 100, 500, 1000]:
        print(f"Epoch {epoch:5d} | Cost: {cost:.4f}")
```

```
Epoch     0 | Cost: 32.9157
Epoch    10 | Cost: 21.9449
Epoch    50 | Cost: 4.3841
Epoch   100 | Cost: 0.6392
Epoch   500 | Cost: 0.0693
Epoch  1000 | Cost: 0.0693
```

| | 스케일링 없이 (lr=0.00001) | 스케일링 후 (lr=0.01) |
|---|---|---|
| **500 epoch** | Cost: 0.97 | Cost: 0.069 (수렴 완료) |
| **5000 epoch** | Cost: 0.64 (아직 수렴 안 됨) | Cost: 0.069 |
| **학습률** | 0.00001 | 0.01 (1,000배) |
| **수렴 시점** | 수렴 못 함 | ~268 epoch |

학습률을 **1,000배** 키울 수 있고, 268 epoch 만에 수렴한다. 스케일링 없이는 5,000번을 돌려도 못 닿는 cost(0.069)에 말이다.

### 스케일링 후 가중치 해석

스케일링 후의 가중치 `[0.856, 0.645, 0.178]`은 원래 단위가 아니라 **표준화된 단위**다. 원래 스케일로 되돌리려면:

```python
# 스케일링된 가중치 → 원래 스케일
w_original = w / X_std
b_original = b - np.sum(w * X_mean / X_std)
print(f"원래 스케일: w = {np.round(w_original, 4)}")
print(f"             b = {b_original:.4f}")
```

```
원래 스케일: w = [0.0247, 0.4909, 0.0262]
             b = 1.0321
```

해석하면:
- **면적** 1평 증가 → 가격 약 **0.025억(250만원)** 상승
- **방 수** 1개 증가 → 가격 약 **0.49억(4,900만원)** 상승
- **층수** 1층 증가 → 가격 약 **0.026억(260만원)** 상승

방 수의 영향이 면적이나 층수보다 훨씬 크다. 스케일링 전 가중치(`[0.04, 0.13, 0.05]`)로는 이 사실을 알 수 없었다.

---

## sklearn으로 한 번에

위에서 직접 구현한 건 원리를 이해하기 위해서였다. 실전에서는 sklearn의 `Pipeline`으로 스케일링과 학습을 한 번에 처리한다.

```python
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# 파이프라인: 스케일링 → 선형 회귀를 하나로
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('lr', LinearRegression())
])

pipe.fit(X, y)

print(f"R² = {pipe.score(X, y):.4f}")
print(f"coef = {pipe.named_steps['lr'].coef_}")
print(f"intercept = {pipe.named_steps['lr'].intercept_:.4f}")
```

```
R² = 0.9506
coef = [0.8555  0.6452  0.1777]
intercept = 5.6135
```

R² = 0.95 — 세 가지 변수로 가격 변동의 95%를 설명한다. `LinearRegression`은 내부적으로 정규 방정식을 쓰기 때문에 스케일링 없이도 정확한 해를 구하지만, 파이프라인에 넣어두면 다른 모델로 교체할 때(로지스틱 회귀, SVM 등) 스케일링이 이미 적용되어 있어 편하다.

```python
# 새 아파트 예측
import numpy as np
new_house = np.array([[85, 3, 10]])  # 면적 85평, 방 3개, 10층
pred = pipe.predict(new_house)
print(f"예측 가격: {pred[0]:.2f}억원")  # → 4.87억원
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 Pipeline을 쓰는 진짜 이유</strong><br>
  스케일링과 모델을 따로 관리하면, 새 데이터를 예측할 때 스케일링을 잊는 실수가 생긴다. Pipeline은 <code>fit</code>, <code>predict</code>, <code>score</code>를 호출하면 전처리와 모델을 자동으로 순서대로 적용한다. 코드가 깔끔해지고 실수가 줄어든다.
</div>

---

## 흔한 실수

### 1. Test 데이터에 Train의 스케일러를 적용하지 않는다

```python
# ❌ 잘못된 방법: test 데이터를 따로 스케일링
scaler_train = StandardScaler().fit(X_train)
X_train_scaled = scaler_train.transform(X_train)

scaler_test = StandardScaler().fit(X_test)  # 별도 fit → 기준이 다름!
X_test_scaled = scaler_test.transform(X_test)
```

```python
# ✅ 올바른 방법: train으로 fit한 scaler를 test에도 적용
scaler = StandardScaler().fit(X_train)
X_train_scaled = scaler.transform(X_train)
X_test_scaled = scaler.transform(X_test)  # 같은 scaler로 transform만
```

Train 데이터의 평균과 표준편차로 test 데이터를 변환해야 한다. Test 데이터로 별도로 fit하면 기준이 달라져서 모델이 엉뚱한 예측을 한다. Pipeline을 쓰면 이 실수를 구조적으로 방지할 수 있다.

### 2. 범주형 변수에 스케일링을 적용한다

```python
# ❌ 원-핫 인코딩된 변수까지 스케일링
# gender: [0, 1], type: [0, 0, 1] → 이미 범위가 정해져 있다
```

원-핫 인코딩이나 0/1 이진 변수는 스케일링할 필요가 없다. 오히려 스케일링하면 의미가 왜곡된다. 수치형 연속 변수만 스케일링한다.

### 3. 타겟(y)까지 스케일링한다

일반적인 선형 회귀에서 y는 스케일링하지 않는다. y를 스케일링하면 예측값도 스케일링된 단위로 나오기 때문에 다시 역변환해야 하고, 해석이 복잡해진다. 단, 신경망에서 y의 범위가 극단적으로 크면 학습 안정성을 위해 스케일링하기도 한다 — 이건 특수한 경우다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 데이터 누수(Data Leakage) 주의</strong><br>
  Train/Test 분할 <strong>전에</strong> 전체 데이터로 스케일링하면, test 데이터의 통계가 train에 섞여 들어간다. 반드시 분할 <strong>후</strong> train 데이터만으로 fit하고, 그 기준으로 test를 transform해야 한다.
</div>

---

## 마치며

변수가 여러 개가 되면 모델 자체보다 **전처리**가 결과를 좌우한다. 같은 경사하강법, 같은 데이터인데 Feature Scaling 하나로 5,000번 돌려도 안 되던 수렴이 268번 만에 끝난다. 이건 이론적 차이가 아니라 실전에서 매번 마주하는 차이다.

다음 글에서는 변수가 많아질 때 생기는 또 다른 문제 — **과적합(Overfitting)**과 이를 막는 **규제(Regularization)** 기법을 다룬다.

## 참고자료

- [Andrew Ng — Machine Learning Specialization: Multiple Features (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn — StandardScaler Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html)
- [Scikit-learn — Pipeline Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.pipeline.Pipeline.html)
- [Feature Scaling — Why it Matters (Sebastian Raschka)](https://sebastianraschka.com/Articles/2014_about_feature_scaling.html)
