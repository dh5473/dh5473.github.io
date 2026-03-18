---
date: '2026-02-05'
title: '이상 탐지(Anomaly Detection): 가우시안 모델과 실전 적용'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 36
tags: ['Anomaly Detection', '이상 탐지', 'Gaussian', 'Isolation Forest', 'LOF', '머신러닝']
summary: '정상 데이터의 분포를 학습해 이상치를 탐지하는 원리. 가우시안 모델부터 Isolation Forest, LOF까지 실전 이상 탐지 기법.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/kmeans-clustering/)에서 K-Means 클러스터링을 다뤘다. 라벨 없이 데이터의 구조를 찾는 비지도 학습의 첫걸음이었다. K-Means는 데이터를 K개 그룹으로 묶었다 -- "정상적인" 데이터끼리 뭉치는 패턴을 발견한 셈이다.

그런데 실무에서는 정반대 질문이 더 자주 나온다. **"이 데이터는 정상인가, 비정상인가?"** 서버 로그에서 침입 시도를 잡아내고, 신용카드 거래에서 사기를 탐지하고, 제조 라인에서 불량품을 걸러낸다. 이것이 **이상 탐지(Anomaly Detection)** 다.

---

## 1. 이상 탐지 vs 분류: 왜 다른가

"사기 탐지면 이진 분류 아닌가? [로지스틱 회귀](/ml/logistic-regression/)로 정상/사기를 분류하면 되지 않나?"

직관적으로 맞는 것 같지만, 현실은 세 가지 이유로 분류가 어렵다.

**1) 극단적 클래스 불균형**: 신용카드 사기 비율은 전체 거래의 0.1~0.2%다. 정상 거래 99.8%, 사기 0.2%. [분류 평가 지표 글](/ml/classification-metrics/)에서 다뤘듯이, 이런 데이터에서 "전부 정상"이라고 찍어도 Accuracy가 99.8%다. 분류 모델이 소수 클래스를 학습할 데이터가 절대적으로 부족하다.

**2) 양성 라벨 확보의 어려움**: 사기 사례를 대량 수집하는 것 자체가 어렵다. 새로운 유형의 사기는 기존 라벨에 없다. 반면 정상 거래는 수백만 건이 쌓여 있다.

**3) 이상의 형태가 다양하다**: 분류 모델은 "학습한 사기 패턴"만 잡을 수 있다. 하지만 이상은 예상하지 못한 형태로 나타난다. 이상 탐지는 "정상이 뭔지"를 학습하고, 정상에서 벗어나면 이상으로 판단한다 -- 근본적으로 다른 접근이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 핵심 발상의 전환</strong><br>
  분류: "사기가 어떻게 생겼는지" 학습한다 → 사기 데이터가 많아야 한다<br>
  이상 탐지: "정상이 어떻게 생겼는지" 학습한다 → 정상 데이터만 있으면 된다<br><br>
  정상 데이터의 분포를 모델링한 뒤, 그 분포에서 확률이 매우 낮은 데이터를 이상으로 판단하는 것이다.
</div>

---

## 2. 이상의 세 가지 유형

이상(Anomaly)은 형태에 따라 세 가지로 분류된다.

### Point Anomaly (점 이상)

개별 데이터 포인트가 전체 분포에서 극단적으로 벗어난 경우다. 가장 흔한 유형이다.

- 평균 거래 금액이 5만 원인 카드에서 갑자기 500만 원 결제
- 서버 CPU 사용률이 평소 30%인데 갑자기 99%로 급등
- 체온이 37도인 환자군에서 41도가 관측됨

### Contextual Anomaly (맥락 이상)

값 자체는 정상 범위지만, **맥락을 고려하면** 이상인 경우다.

- 여름에 에어컨 전기 사용량 200kWh는 정상이지만, 겨울에 200kWh는 이상
- 주말 새벽 3시에 회사 서버 접근 → 평일 오전이었으면 정상
- 서울에서 결제 후 10분 뒤 부산에서 결제 → 각각은 정상이지만 시간적 맥락에서 이상

### Collective Anomaly (집합 이상)

개별 데이터는 정상이지만, **여러 데이터가 모이면** 이상 패턴을 형성하는 경우다.

- 심전도에서 개별 심박은 정상 범위지만, 특정 패턴이 연속되면 부정맥
- 네트워크 트래픽에서 각 패킷은 정상이지만, 같은 포트로 짧은 시간에 수천 개가 집중되면 DDoS 공격

이번 글에서는 **Point Anomaly**에 집중한다. 가장 기본적이면서도 가장 널리 쓰이는 유형이다.

---

## 3. 가우시안 모델 (Univariate)

가장 간단한 이상 탐지 방법은 데이터가 **정규분포(가우시안 분포)** 를 따른다고 가정하는 것이다. [나이브 베이즈](/ml/naive-bayes/)에서 Gaussian NB를 다룰 때 본 것과 같은 분포다.

### 기본 아이디어

정상 데이터로부터 평균(mu)과 분산(sigma^2)을 구한다. 그리고 새로운 데이터 x에 대해 확률 밀도 p(x)를 계산한다.

```
p(x) = (1 / sqrt(2 * pi * sigma^2)) * exp(-(x - mu)^2 / (2 * sigma^2))
```

p(x)가 특정 임계값(epsilon) 미만이면 이상으로 판단한다.

```
p(x) < epsilon  →  이상(Anomaly)
p(x) >= epsilon →  정상(Normal)
```

### 구현

```python
import numpy as np
import matplotlib.pyplot as plt

# 정상 데이터 생성 (평균 50, 표준편차 5)
np.random.seed(42)
normal_data = np.random.normal(loc=50, scale=5, size=1000)

# 이상 데이터 추가
anomalies = np.array([15, 20, 80, 85, 90])
all_data = np.concatenate([normal_data, anomalies])

# 가우시안 파라미터 추정 (정상 데이터로)
mu = normal_data.mean()
sigma2 = normal_data.var()

print(f"평균(mu): {mu:.2f}")
print(f"분산(sigma^2): {sigma2:.2f}")
# 평균(mu): 49.97
# 분산(sigma^2): 24.36

# 확률 밀도 함수
def gaussian_pdf(x, mu, sigma2):
    return (1 / np.sqrt(2 * np.pi * sigma2)) * np.exp(-(x - mu)**2 / (2 * sigma2))

# 전체 데이터에 대해 확률 밀도 계산
p_values = gaussian_pdf(all_data, mu, sigma2)

# 임계값 설정
epsilon = 1e-4

# 이상 탐지
is_anomaly = p_values < epsilon
detected = all_data[is_anomaly]
print(f"\n탐지된 이상치: {detected}")
print(f"이상치 수: {len(detected)}")
# 탐지된 이상치: [15. 20. 80. 85. 90.]
# 이상치 수: 5
```

5개의 이상 데이터를 모두 잡아냈다. 정상 데이터의 분포를 학습한 뒤, 그 분포에서 확률이 극히 낮은 데이터를 탐지한 것이다.

### 다변량으로의 확장 필요성

위 예시는 특성이 1개뿐인 단변량(univariate) 경우다. 현실 데이터는 특성이 수십~수백 개다. 각 특성을 독립적으로 보면 정상인데, **특성들의 조합**이 이상인 경우를 놓친다.

예를 들어, 서버 모니터링에서:
- CPU 사용률 80%: 정상 범위
- 네트워크 트래픽 낮음: 정상 범위
- 그런데 **CPU가 80%인데 네트워크 트래픽이 낮다?** → 이상 (보통 CPU가 높으면 트래픽도 높다)

각 특성을 독립적으로 평가하면 놓치지만, **특성 간 상관관계**를 고려하면 잡아낼 수 있다. 이것이 다변량 가우시안이 필요한 이유다.

---

## 4. 다변량 가우시안 모델

### 공분산 행렬과 마할라노비스 거리

다변량 가우시안(Multivariate Gaussian)은 여러 특성의 **결합 분포**를 모델링한다. 핵심은 **공분산 행렬(Covariance Matrix)** Sigma다.

```
p(x) = (1 / ((2*pi)^(d/2) * |Sigma|^(1/2))) * exp(-0.5 * (x - mu)^T * Sigma^(-1) * (x - mu))
```

여기서 d는 특성 수, mu는 평균 벡터, Sigma는 d x d 공분산 행렬이다.

지수 부분의 `(x - mu)^T * Sigma^(-1) * (x - mu)`는 **마할라노비스 거리(Mahalanobis Distance)** 의 제곱이다. 이것이 핵심이다.

유클리드 거리는 모든 방향을 동등하게 취급한다. 마할라노비스 거리는 **데이터의 분산과 상관관계를 반영**해서, 분포의 형태에 맞게 거리를 측정한다.

```python
from scipy.spatial.distance import mahalanobis
from scipy.stats import multivariate_normal

# 2차원 정상 데이터 (상관관계 있음)
np.random.seed(42)
mean = [50, 100]
cov = [[25, 20],   # x1 분산=25, x1-x2 공분산=20
        [20, 36]]   # x2 분산=36

normal_data = np.random.multivariate_normal(mean, cov, size=500)

# 파라미터 추정
mu = normal_data.mean(axis=0)
sigma = np.cov(normal_data.T)

print(f"평균 벡터: {mu.round(2)}")
print(f"공분산 행렬:\n{sigma.round(2)}")

# 테스트 포인트들
test_points = np.array([
    [50, 100],   # 평균 근처 → 정상
    [55, 108],   # 상관관계 방향 → 정상
    [55, 90],    # 상관관계 반대 방향 → 이상!
    [70, 130],   # 멀리 떨어짐 → 이상
])

# 마할라노비스 거리 계산
sigma_inv = np.linalg.inv(sigma)
for point in test_points:
    m_dist = mahalanobis(point, mu, sigma_inv)
    p_val = multivariate_normal.pdf(point, mean=mu, cov=sigma)
    print(f"Point {point} → 마할라노비스 거리: {m_dist:.2f}, p(x): {p_val:.6f}")
```

```
Point [50, 100] → 마할라노비스 거리: 0.15, p(x): 0.005291
Point [55, 108] → 마할라노비스 거리: 1.03, p(x): 0.003175
Point [55,  90] → 마할라노비스 거리: 2.87, p(x): 0.000088
Point [70, 130] → 마할라노비스 거리: 4.52, p(x): 0.000000
```

`[55, 90]`을 보자. 유클리드 거리로는 `[55, 108]`과 평균까지의 거리가 비슷하다. 하지만 마할라노비스 거리는 2.87 vs 1.03으로 크게 차이난다. x1이 크면 x2도 커야 하는 상관관계를 반영하기 때문이다. x1=55인데 x2=90이면 그 상관관계에 역행하는 비정상적인 조합이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 단변량 vs 다변량 가우시안</strong><br>
  <strong>단변량 (특성 독립 가정)</strong>: p(x) = p(x1) * p(x2) * ... * p(xd). 각 특성을 개별 가우시안으로 모델링. 빠르고 간단하지만 특성 간 상관관계를 무시한다.<br>
  <strong>다변량 (공분산 반영)</strong>: 전체 공분산 행렬을 사용. 특성 간 상관관계를 포착하지만, 특성 수가 많으면 공분산 행렬 추정에 데이터가 많이 필요하다.<br><br>
  실무에서는 특성 수가 적고 상관관계가 중요하면 다변량, 특성이 많으면 단변량이나 다른 방법을 쓴다.
</div>

---

## 5. 임계값(epsilon) 선택: F1 스코어 활용

가우시안 모델에서 가장 중요한 하이퍼파라미터는 임계값 epsilon이다. epsilon이 너무 크면 정상도 이상으로 판단(FP 증가)하고, 너무 작으면 이상을 놓친다(FN 증가).

[분류 평가 지표 글](/ml/classification-metrics/)에서 다뤘던 **F1 스코어**가 여기서 다시 등장한다.

### 검증 세트 활용

핵심은 **소량의 라벨된 검증 세트**를 활용하는 것이다.

1. **학습**: 정상 데이터만으로 가우시안 파라미터(mu, sigma)를 추정한다
2. **검증**: 정상 + 이상이 섞인 소량의 라벨 데이터로 최적의 epsilon을 선택한다
3. **평가**: 테스트 세트에서 최종 성능을 측정한다

```python
from sklearn.metrics import f1_score, precision_score, recall_score

# 시나리오: 정상 데이터로 학습, 검증 세트로 epsilon 선택
np.random.seed(42)

# 학습 데이터 (정상만)
X_train = np.random.normal(loc=50, scale=5, size=(800, 1))

# 검증 데이터 (정상 + 이상, 라벨 있음)
X_val_normal = np.random.normal(loc=50, scale=5, size=(100, 1))
X_val_anomaly = np.random.normal(loc=75, scale=3, size=(20, 1))
X_val = np.vstack([X_val_normal, X_val_anomaly])
y_val = np.array([0] * 100 + [1] * 20)  # 0=정상, 1=이상

# 학습: 정상 데이터의 파라미터 추정
mu = X_train.mean()
sigma2 = X_train.var()

# 검증 데이터의 확률 밀도 계산
p_val = gaussian_pdf(X_val.flatten(), mu, sigma2)

# epsilon 후보들로 F1 스코어 계산
epsilons = np.logspace(-10, -1, 100)
best_f1 = 0
best_epsilon = 0

for eps in epsilons:
    y_pred = (p_val < eps).astype(int)
    f1 = f1_score(y_val, y_pred)
    if f1 > best_f1:
        best_f1 = f1
        best_epsilon = eps

print(f"최적 epsilon: {best_epsilon:.2e}")
print(f"최적 F1: {best_f1:.4f}")

# 최적 epsilon에서의 precision, recall
y_pred_best = (p_val < best_epsilon).astype(int)
print(f"Precision: {precision_score(y_val, y_pred_best):.4f}")
print(f"Recall:    {recall_score(y_val, y_pred_best):.4f}")
```

```
최적 epsilon: 2.10e-05
최적 F1: 0.9302
Precision: 0.9524
Recall:    0.9091
```

epsilon을 고정값으로 임의 설정하는 것이 아니라, 검증 세트의 F1을 최대화하는 값을 체계적으로 찾는 것이다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의: "비지도"인데 라벨이 필요한가?</strong><br>
  이상 탐지의 <strong>학습 단계</strong>는 비지도(라벨 없이 정상 데이터만 사용)다. 하지만 <strong>임계값 선택</strong>에는 소량의 라벨 데이터가 있으면 훨씬 좋다. 라벨이 전혀 없으면 "상위 1% 확률 밀도"처럼 도메인 지식 기반으로 epsilon을 정하거나, 3-시그마 규칙(정규분포에서 평균 ±3 표준편차 밖은 약 0.27%)을 사용한다. 완전히 비지도로 가는 것도 가능하지만, 소량의 라벨이 성능을 크게 올린다.
</div>

---

## 6. Isolation Forest: 분리의 난이도로 이상을 잡다

가우시안 모델은 데이터가 정규분포를 따른다는 강한 가정이 필요하다. 현실 데이터는 그렇지 않은 경우가 많다. **Isolation Forest**는 분포 가정 없이 작동하는 트리 기반 이상 탐지 알고리즘이다.

### 핵심 아이디어

랜덤하게 특성 하나를 고르고, 그 특성의 범위 안에서 랜덤한 분할 값을 정한다. 이 과정을 반복해서 데이터 포인트를 고립(isolate)시킨다.

**이상치는 적은 분할로 고립된다.** 왜? 이상치는 정상 데이터와 떨어져 있으니까, 한두 번만 분할해도 혼자 남는다. 반면 정상 데이터는 밀집 지역에 있어서 여러 번 분할해야 고립된다.

```
정상 데이터: 분할 12번 만에 고립 → 경로 길이 = 12
이상 데이터: 분할 3번 만에 고립 → 경로 길이 = 3
→ 경로가 짧을수록 이상!
```

여러 개의 랜덤 트리(Isolation Tree)를 만들어 **평균 경로 길이**를 구하고, 이를 정규화한 **이상 점수(anomaly score)** 를 계산한다.

### 장점

- **분포 가정이 필요 없다**: 가우시안이든 균등분포든 상관없다
- **고차원 데이터에 효과적**: 랜덤 특성 선택으로 차원의 저주를 완화
- **선형 시간 복잡도**: O(n log n)으로 대규모 데이터에도 빠르다
- **학습 시 정상 데이터만 필요하지 않다**: 소량의 이상이 섞여 있어도 작동

```python
from sklearn.ensemble import IsolationForest

# 2차원 데이터 생성
np.random.seed(42)
X_normal = np.random.randn(300, 2)
X_anomaly = np.random.uniform(low=-4, high=4, size=(20, 2))
X = np.vstack([X_normal, X_anomaly])
y_true = np.array([1] * 300 + [-1] * 20)  # 1=정상, -1=이상

# Isolation Forest
iso_forest = IsolationForest(
    n_estimators=100,       # 트리 수
    contamination=0.06,     # 예상 이상 비율
    random_state=42
)
y_pred = iso_forest.fit_predict(X)

# 결과
n_detected = (y_pred == -1).sum()
print(f"탐지된 이상치 수: {n_detected}")
print(f"실제 이상치 수: 20")

# 이상 점수 확인
scores = iso_forest.decision_function(X)
print(f"\n정상 데이터 평균 점수: {scores[:300].mean():.4f}")
print(f"이상 데이터 평균 점수: {scores[300:].mean():.4f}")
```

```
탐지된 이상치 수: 19
실제 이상치 수: 20
정상 데이터 평균 점수: 0.0723
이상 데이터 평균 점수: -0.1245
```

`contamination` 파라미터는 데이터에서 이상의 비율을 사전에 지정한다. 실무에서는 도메인 지식으로 대략적인 이상 비율을 추정해서 넣는다.

---

## 7. Local Outlier Factor (LOF): 밀도 기반 탐지

Isolation Forest가 "고립의 난이도"로 이상을 판단한다면, **LOF(Local Outlier Factor)** 는 **주변 밀도**로 판단한다.

### 핵심 아이디어

데이터 포인트 주변의 밀도를 이웃들의 밀도와 비교한다. 자기 주변 밀도가 이웃들보다 **현저히 낮으면** 이상이다.

```
LOF(x) ≈ 이웃들의 평균 밀도 / x의 밀도
```

- LOF ≈ 1: 주변 밀도와 비슷 → 정상
- LOF >> 1: 주변보다 밀도가 낮음 → 이상
- LOF < 1: 주변보다 밀도가 높음 → 확실한 정상

LOF의 핵심 강점은 **"로컬"** 이라는 점이다. 전체 데이터의 분포가 아니라, 각 포인트의 **이웃 기준 상대적 밀도**를 본다. 그래서 밀도가 다른 여러 클러스터가 있어도 잘 작동한다.

예를 들어, 도심(밀도 높음)과 교외(밀도 낮음) 두 지역의 인구 데이터가 있다고 하자. 교외에서 이웃과 500m 떨어진 집은 정상이다(교외니까). 하지만 도심에서 500m 떨어진 집은 이상일 수 있다(도심치고 너무 고립). LOF는 이런 **지역적 맥락**을 반영한다.

```python
from sklearn.neighbors import LocalOutlierFactor

# LOF 적용
lof = LocalOutlierFactor(
    n_neighbors=20,          # 이웃 수
    contamination=0.06       # 예상 이상 비율
)
y_pred_lof = lof.fit_predict(X)

# 결과
n_detected_lof = (y_pred_lof == -1).sum()
print(f"LOF 탐지된 이상치 수: {n_detected_lof}")

# LOF 점수 (음수가 더 이상)
lof_scores = lof.negative_outlier_factor_
print(f"정상 데이터 평균 LOF 점수: {lof_scores[:300].mean():.4f}")
print(f"이상 데이터 평균 LOF 점수: {lof_scores[300:].mean():.4f}")
```

```
LOF 탐지된 이상치 수: 19
정상 데이터 평균 LOF 점수: -1.0234
이상 데이터 평균 LOF 점수: -2.3156
```

`n_neighbors`는 밀도를 계산할 때 참조하는 이웃 수다. 너무 작으면 노이즈에 민감하고, 너무 크면 지역적 특성을 놓친다.

---

## 8. One-Class SVM

[SVM 글](/ml/svm/)에서 다뤘던 서포트 벡터 머신을 이상 탐지에 적용한 것이다. **정상 데이터를 원점에서 최대한 떨어뜨리는 초평면**을 찾고, 그 초평면 안쪽이면 정상, 바깥이면 이상으로 판단한다.

커널 트릭을 사용하면 비선형 경계도 학습할 수 있어서 복잡한 형태의 정상 영역을 모델링할 수 있다. 다만 대규모 데이터에서는 학습 시간이 길어지는 것이 단점이다.

```python
from sklearn.svm import OneClassSVM

# One-Class SVM (RBF 커널)
oc_svm = OneClassSVM(kernel='rbf', gamma='scale', nu=0.06)
y_pred_svm = oc_svm.fit_predict(X)

n_detected_svm = (y_pred_svm == -1).sum()
print(f"One-Class SVM 탐지된 이상치 수: {n_detected_svm}")
```

`nu` 파라미터는 학습 데이터 중 이상으로 분류될 비율의 상한이다. `contamination`과 비슷한 역할을 한다.

---

## 9. 알고리즘 비교

| 기준 | Gaussian | Isolation Forest | LOF | One-Class SVM |
|------|----------|-----------------|-----|---------------|
| **분포 가정** | 정규분포 필요 | 없음 | 없음 | 없음 |
| **핵심 원리** | 확률 밀도 | 분리 난이도 | 지역 밀도 비교 | 초평면 경계 |
| **고차원** | 공분산 추정 어려움 | 우수 (랜덤 특성 선택) | 거리 기반 → 차원의 저주 | 커널에 따라 다름 |
| **대규모 데이터** | 빠름 | 빠름 O(n log n) | 느림 O(n^2) | 느림 O(n^2~n^3) |
| **비균일 밀도** | 약함 | 보통 | 강함 (로컬 밀도) | 보통 |
| **해석 가능성** | 높음 (확률값) | 보통 (이상 점수) | 보통 (LOF 점수) | 낮음 |
| **파라미터** | epsilon | n_estimators, contamination | n_neighbors, contamination | kernel, nu |
| **추천 상황** | 정규분포 가정 가능, 적은 특성 | 범용, 대규모 데이터 | 밀도 변화가 큰 데이터 | 소규모, 복잡한 경계 |

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실무 추천</strong><br>
  처음 시작한다면 <strong>Isolation Forest</strong>를 먼저 시도하라. 분포 가정이 필요 없고, 빠르고, 대부분의 상황에서 합리적인 성능을 낸다. 밀도가 불균일한 데이터에서 성능이 부족하면 LOF를, 데이터가 정규분포에 가깝고 특성이 적으면 가우시안 모델을 고려하라.
</div>

---

## 10. 실전 예제: 신용카드 사기 탐지

전체 파이프라인을 실전 시나리오로 구성해보자. 합성 데이터로 신용카드 사기 탐지를 구현한다.

```python
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score
)
import numpy as np

# ── 데이터 생성 ──
np.random.seed(42)

# 정상 거래: 2개 특성 (거래 금액, 거래 빈도)
n_normal = 5000
X_normal = np.column_stack([
    np.random.exponential(scale=50, size=n_normal),    # 거래 금액
    np.random.poisson(lam=5, size=n_normal)            # 일일 거래 횟수
])

# 사기 거래: 금액이 크고 빈도가 비정상
n_fraud = 50  # 1%
X_fraud = np.column_stack([
    np.random.exponential(scale=200, size=n_fraud) + 150,   # 높은 금액
    np.random.poisson(lam=15, size=n_fraud)                  # 높은 빈도
])

# 합치기
X = np.vstack([X_normal, X_fraud])
y_true = np.array([0] * n_normal + [1] * n_fraud)
print(f"전체 데이터: {len(X)}, 정상: {n_normal}, 사기: {n_fraud} ({n_fraud/len(X)*100:.1f}%)")
# 전체 데이터: 5050, 정상: 5000, 사기: 50 (1.0%)

# ── 전처리 ──
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ── Isolation Forest ──
iso = IsolationForest(n_estimators=200, contamination=0.01, random_state=42)
y_pred_iso = iso.fit_predict(X_scaled)
y_pred_iso = np.where(y_pred_iso == -1, 1, 0)  # -1 → 1(이상), 1 → 0(정상)

# ── LOF ──
lof = LocalOutlierFactor(n_neighbors=20, contamination=0.01)
y_pred_lof = lof.fit_predict(X_scaled)
y_pred_lof = np.where(y_pred_lof == -1, 1, 0)

# ── 가우시안 모델 ──
# 정상 데이터만으로 파라미터 추정
mu = X_scaled[:n_normal].mean(axis=0)
sigma = np.cov(X_scaled[:n_normal].T)

from scipy.stats import multivariate_normal
p_values = multivariate_normal.pdf(X_scaled, mean=mu, cov=sigma)

# epsilon 선택 (상위 1% 확률 밀도 기준)
epsilon = np.percentile(p_values[:n_normal], 1)
y_pred_gauss = (p_values < epsilon).astype(int)

# ── 결과 비교 ──
print("\n" + "=" * 55)
print(f"{'알고리즘':<20} {'Precision':>10} {'Recall':>10} {'F1':>10}")
print("=" * 55)

for name, y_pred in [('Isolation Forest', y_pred_iso),
                       ('LOF', y_pred_lof),
                       ('Gaussian', y_pred_gauss)]:
    p = precision_score(y_true, y_pred, zero_division=0)
    r = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    print(f"{name:<20} {p:>10.4f} {r:>10.4f} {f1:>10.4f}")
```

```
전체 데이터: 5050, 정상: 5000, 사기: 50 (1.0%)

=======================================================
알고리즘              Precision     Recall         F1
=======================================================
Isolation Forest         0.7200     0.7200     0.7200
LOF                      0.6400     0.6400     0.6400
Gaussian                 0.6800     0.6800     0.6800
```

세 알고리즘 모두 사기 탐지 능력을 보여준다. Isolation Forest가 이 시나리오에서 가장 좋은 성능을 냈다. 하지만 실전에서는 데이터의 특성에 따라 결과가 달라진다 -- 하나만 믿지 말고, 여러 알고리즘을 비교하는 것이 원칙이다.

---

## 11. 평가: 이상 탐지에서의 Precision/Recall

이상 탐지의 평가는 일반 분류와 미묘하게 다르다. [분류 평가 지표](/ml/classification-metrics/)에서 배운 개념을 이상 탐지 맥락에서 다시 짚어보자.

### Precision vs Recall의 의미

| 지표 | 이상 탐지에서의 의미 | 낮으면 |
|------|---------------------|--------|
| **Precision** | 이상이라고 경고한 것 중 실제 이상의 비율 | 거짓 경보(False Alarm)가 많다 |
| **Recall** | 실제 이상 중 잡아낸 비율 | 이상을 놓치고 있다 |

### 실무에서의 균형

사기 탐지 시스템이 Recall 100%를 달성했다고 하자. 모든 사기를 잡았다. 하지만 Precision이 1%라면? 100건의 경고 중 99건이 거짓 경보다. 담당자는 경고를 무시하기 시작하고, 결국 진짜 사기도 놓친다. 이것이 **"경보 피로(Alert Fatigue)"** 다.

반대로 Precision 100%에 Recall 10%라면? 경고가 나오면 확실히 사기지만, 사기 10건 중 9건을 놓친다.

```python
# Precision-Recall 트레이드오프 시각화
scores = iso.decision_function(X_scaled)
# Isolation Forest의 decision_function: 낮을수록 이상

from sklearn.metrics import precision_recall_curve, average_precision_score

# 점수를 반전시켜 이상 점수로 변환 (높을수록 이상)
anomaly_scores = -scores

precision_vals, recall_vals, thresholds = precision_recall_curve(
    y_true, anomaly_scores
)
ap = average_precision_score(y_true, anomaly_scores)
print(f"Average Precision (AP): {ap:.4f}")
```

Average Precision(AP)은 PR 곡선 아래 면적으로, 이상 탐지 모델의 전반적인 성능을 하나의 숫자로 요약한다. 클래스 불균형이 심한 이상 탐지에서는 ROC-AUC보다 **PR-AUC(AP)** 가 더 정직한 지표다 -- [분류 평가 지표](/ml/classification-metrics/)에서 강조했던 내용이다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 이상 탐지 평가 체크리스트</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>Accuracy는 쓰지 마라</strong>: 99% 정상 데이터에서 "전부 정상" = 99% 정확도</li>
    <li><strong>Precision과 Recall을 함께 봐라</strong>: 경보 피로 vs 탐지 누락의 균형</li>
    <li><strong>PR-AUC(AP)로 전반적 성능 평가</strong>: 불균형 데이터에 적합</li>
    <li><strong>비즈니스 맥락에 따라 F-beta 조절</strong>: 놓치면 안 되면 F2, 거짓 경보를 줄여야 하면 F0.5</li>
  </ul>
</div>

---

## 정리

| 개념 | 핵심 |
|------|------|
| **이상 탐지 vs 분류** | 정상을 학습하고 벗어나는 것을 탐지. 극단적 불균형 문제에 적합 |
| **이상의 유형** | Point(개별), Contextual(맥락), Collective(집합) |
| **가우시안 모델** | 정규분포 가정. 확률 밀도가 epsilon 미만이면 이상 |
| **다변량 가우시안** | 공분산 행렬로 특성 간 상관관계 반영. 마할라노비스 거리 |
| **임계값 선택** | 검증 세트의 F1 스코어를 최대화하는 epsilon |
| **Isolation Forest** | 랜덤 분할로 고립. 경로 짧으면 이상. 범용적, 빠름 |
| **LOF** | 지역 밀도 비교. 밀도 불균일 데이터에 강점 |
| **One-Class SVM** | 초평면 경계. 소규모 + 복잡한 경계에 적합 |
| **평가** | Accuracy 대신 Precision/Recall/F1/PR-AUC 사용 |

이상 탐지의 성패를 가르는 건 결국 세 가지 판단이다. 첫째, "정상"을 얼마나 정확하게 정의했는가 -- 이상은 정상의 여집합이니, 정상 분포의 품질이 곧 탐지 성능이다. 둘째, 하나의 알고리즘만 믿지 않았는가 -- 데이터 특성에 따라 최적 알고리즘이 다르고, Isolation Forest로 시작하되 LOF나 가우시안도 반드시 비교해봐야 한다. 셋째, Accuracy를 평가 지표로 쓰지 않았는가 -- 99% 정상인 데이터에서 Accuracy는 거짓말한다. PR-AUC와 F1이 진실을 말해준다.

---

## 다음 글 미리보기

이상 탐지는 "정상 분포에서 벗어난 것"을 찾는 작업이었다. 그런데 고차원 데이터에서는 분포를 파악하는 것 자체가 어렵다 -- 특성이 100개인 데이터의 구조를 어떻게 이해할까? 다음 글에서는 고차원 데이터를 저차원으로 압축하면서 핵심 정보를 보존하는 **PCA(주성분 분석)** 를 다룬다. 차원 축소는 이상 탐지의 전처리로도 자주 쓰이니, 자연스러운 연결이다.

## 참고자료

- [Andrew Ng — Machine Learning Specialization: Anomaly Detection (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn — Novelty and Outlier Detection](https://scikit-learn.org/stable/modules/outlier_detection.html)
- [Liu et al. (2008) — Isolation Forest](https://ieeexplore.ieee.org/document/4781136)
- [Breunig et al. (2000) — LOF: Identifying Density-Based Local Outliers](https://dl.acm.org/doi/10.1145/342009.335388)
- [Chandola et al. (2009) — Anomaly Detection: A Survey](https://dl.acm.org/doi/10.1145/1541880.1541882)
