---
date: '2026-02-04'
title: 'K-Means 클러스터링: 동작 원리부터 K 선택까지'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 35
tags: ['K-Means', '클러스터링', 'Clustering', '비지도학습', 'Elbow Method', 'Silhouette', '머신러닝']
summary: '비지도학습의 대표 알고리즘 K-Means. 동작 원리, K-Means++ 초기화, Elbow/Silhouette로 최적 K를 찾는 방법까지.'
thumbnail: './thumbnail.png'
---

지금까지 34개 글은 전부 **지도학습(Supervised Learning)** 이었다. 선형 회귀부터 XGBoost까지, 신경망부터 피처 엔지니어링까지 — 항상 정답 레이블 `y`가 있었다. 모델은 `X`와 `y`의 관계를 학습했고, 우리는 그 관계를 평가할 수 있었다.

이제 완전히 새로운 패러다임으로 넘어간다 — **비지도학습(Unsupervised Learning)**.

[첫 글](/ml/overview/)에서 머신러닝의 세 가지 패러다임을 소개할 때, 비지도학습을 이렇게 설명했다: "정답 없이 패턴을 스스로 발견하는 것". 그때는 한 단락으로 넘어갔지만, 이제 본격적으로 파고들 차례다.

정답이 없다는 건 무엇을 의미할까? 모델에게 "이 데이터가 어떤 클래스인지" 알려주지 않는다. 대신 데이터 자체의 구조, 패턴, 군집을 모델이 스스로 찾아내야 한다. 평가 기준도 달라진다 — 정답이 없으니 accuracy나 F1 score를 계산할 수 없다.

비지도학습이 실전에서 쓰이는 대표적인 사례들:

- **고객 세분화(Customer Segmentation)**: 구매 패턴이 비슷한 고객끼리 묶어서 맞춤 마케팅
- **이상치 탐지(Anomaly Detection)**: 정상 패턴을 학습하고, 벗어나는 데이터를 탐지
- **차원 축소(Dimensionality Reduction)**: 고차원 데이터를 시각화하거나 압축
- **토픽 모델링**: 문서 집합에서 주제를 자동으로 추출

이 중에서 가장 직관적이고 널리 쓰이는 알고리즘이 **K-Means 클러스터링**이다. Phase 8의 첫 번째 주제로 시작한다.

---

## 클러스터링이란?

클러스터링(Clustering)은 **비슷한 데이터끼리 그룹으로 묶는 작업**이다. 여기서 "비슷하다"의 기준은 보통 거리(distance)다.

[KNN](/ml/knn/)을 기억하는가? KNN도 거리를 기반으로 가까운 이웃을 찾았다. 하지만 KNN은 지도학습이다 — 이웃의 **레이블**을 보고 다수결로 분류했다. 클러스터링은 레이블이 없다. 순수하게 데이터 포인트 간의 거리만 보고, 가까운 것끼리 같은 그룹에 넣는다.

```
지도학습 (KNN):
  "이 점과 가까운 K개의 이웃 레이블이 뭐지?"
  → 다수결로 분류

비지도학습 (클러스터링):
  "이 데이터들을 비슷한 것끼리 묶으면 몇 개의 그룹이 나올까?"
  → 레이블 없이 구조를 발견
```

클러스터링 알고리즘은 여러 종류가 있다:

| 알고리즘 | 핵심 아이디어 | 특징 |
|----------|--------------|------|
| **K-Means** | 중심점(centroid) 기반 | 빠르고 직관적, 구형 클러스터 가정 |
| DBSCAN | 밀도(density) 기반 | 비구형 클러스터 가능, K 불필요 |
| 계층적 클러스터링 | 병합/분할 방식 | 덴드로그램으로 구조 시각화 |
| GMM | 확률 분포 기반 | 소프트 클러스터링 가능 |

이 글에서는 K-Means를 깊이 다룬다. 가장 기본이면서, 실무에서도 가장 자주 쓰인다.

---

## K-Means 알고리즘: 단계별 동작 원리

K-Means의 아이디어는 놀라울 정도로 단순하다. 데이터를 **K개의 클러스터**로 나누되, 각 클러스터의 **중심점(centroid)** 과 소속 데이터 간의 거리를 최소화한다.

### Step 1: 초기화 — K개의 중심점 배치

K개의 초기 중심점을 선택한다. 가장 단순한 방법은 데이터 포인트 중에서 K개를 랜덤으로 고르는 것이다.

```
K = 3으로 설정
데이터 중에서 랜덤으로 3개를 초기 중심점으로 선택

  ■                    데이터 포인트: ●
  ●  ●                 초기 중심점:   ■
      ●   ●
           ■
  ●  ●
     ●  ●
              ●  ●
                 ■
              ●
```

### Step 2: 할당 — 각 데이터를 가장 가까운 중심점에 배정

모든 데이터 포인트에 대해 K개 중심점과의 거리를 계산한다. 가장 가까운 중심점의 클러스터에 해당 데이터를 할당한다.

```
각 데이터를 가장 가까운 중심점에 할당

  ■                    클러스터 A: ■ ▲
  ▲  ▲                 클러스터 B: ■ ●
      ▲   ●            클러스터 C: ■ ◆
           ■
  ●  ●
     ●  ●
              ◆  ◆
                 ■
              ◆
```

### Step 3: 업데이트 — 중심점을 클러스터의 평균 위치로 이동

각 클러스터에 속한 데이터들의 평균 좌표를 계산해서, 중심점을 그 위치로 옮긴다.

```
중심점을 각 클러스터 평균 위치로 이동

     ■  ← 클러스터 A 소속 데이터들의 평균 좌표
  ▲  ▲
      ▲   ●
        ■  ← 클러스터 B 소속 데이터들의 평균 좌표
  ●  ●
     ●  ●
              ◆  ◆
            ■  ← 클러스터 C 소속 데이터들의 평균 좌표
              ◆
```

### Step 4: 반복 — 할당과 업데이트를 수렴할 때까지

Step 2(할당)와 Step 3(업데이트)를 반복한다. 중심점이 더 이상 움직이지 않거나, 할당이 변하지 않으면 수렴한 것이다. 알고리즘이 종료된다.

```
전체 흐름:

  초기 중심점 배치 (랜덤 or K-Means++)
       │
       ▼
  ┌─ 각 데이터를 가장 가까운 중심점에 할당 ◄─┐
  │         │                                │
  │         ▼                                │
  │  중심점을 클러스터 평균으로 이동           │
  │         │                                │
  │         ▼                                │
  │  중심점이 변했는가? ── Yes ───────────────┘
  │         │
  │        No
  │         │
  └─── 종료 (수렴)
```

보통 10~300회 반복이면 수렴한다. 데이터가 아주 크지 않다면 매우 빠르다.

---

## 목적 함수: WCSS (Inertia)

K-Means가 최소화하려는 것은 **Within-Cluster Sum of Squares(WCSS)**, sklearn에서는 **inertia**라고 부르는 값이다.

```
WCSS = Σₖ₌₁ᴷ Σ(xᵢ ∈ Cₖ) ‖xᵢ - μₖ‖²

Cₖ: k번째 클러스터
μₖ: k번째 클러스터의 중심점(centroid)
‖xᵢ - μₖ‖²: 데이터 xᵢ와 중심점 μₖ 사이의 유클리드 거리 제곱
```

직관적으로 이해하면: 각 클러스터 안에서 데이터들이 중심점으로부터 **얼마나 퍼져 있는지**를 합산한 것이다. WCSS가 작을수록 클러스터 내부가 촘촘하다 — 좋은 클러스터링이다.

K-Means는 이 WCSS를 줄이는 방향으로 중심점을 반복 이동한다. 하지만 주의할 점이 있다. K-Means는 **전역 최적해(global optimum)를 보장하지 않는다**. 지역 최적해(local optimum)에 빠질 수 있다. 이것이 초기화가 중요한 이유다.

---

## K-Means++ 초기화: 똑똑한 시작점 선택

순수 랜덤 초기화의 문제를 보자.

```
나쁜 초기화 예시:
  ■ ■ ■ ← 세 중심점이 모두 왼쪽에 몰려 있음
  ● ● ●
  ● ● ●
              ● ● ●
              ● ● ●

  → 오른쪽 클러스터를 제대로 분리하지 못함
  → 지역 최적해에 빠져서 나쁜 결과
```

운이 나쁘면 초기 중심점이 한쪽에 몰려서, 수렴해도 품질이 나쁜 클러스터가 만들어진다. K-Means++는 이 문제를 해결하기 위해 2007년 Arthur와 Vassilvitskii가 제안한 초기화 방법이다.

### K-Means++ 알고리즘

1. 첫 번째 중심점: 데이터에서 랜덤으로 하나 선택
2. 두 번째 중심점부터: **이미 선택된 중심점과의 거리에 비례하는 확률**로 선택

```
K-Means++ 초기화 과정 (K=3):

Step 1: 첫 번째 중심점을 랜덤 선택
  ■ 선택!
  ● ● ●
              ● ● ●

Step 2: 각 데이터의 "가장 가까운 중심점까지 거리" 계산
  → 거리가 먼 데이터일수록 높은 확률로 선택됨

Step 3: 확률에 따라 두 번째 중심점 선택
  ■                        ■ 선택! (멀리 있으니 확률 높았음)
  ● ● ●
              ● ● ●

Step 4: 세 번째도 같은 방식으로
  ■              ■
  ● ● ●
              ■ 선택!
              ● ● ●
```

핵심은 **중심점끼리 서로 멀리 떨어지도록 유도**한다는 것이다. 이렇게 하면 각 중심점이 서로 다른 클러스터를 대표할 가능성이 높아진다.

sklearn의 `KMeans`는 기본적으로 K-Means++ 초기화를 사용한다 (`init='k-means++'`). 또한 `n_init=10`이 기본값이어서, 10번 다른 초기화로 실행한 뒤 WCSS가 가장 낮은 결과를 반환한다. 지역 최적해 문제를 통계적으로 완화하는 전략이다.

---

## K는 어떻게 정할까?

K-Means의 가장 큰 약점은 **K를 사전에 지정해야 한다**는 것이다. 데이터에 몇 개의 군집이 있는지 모르는 상황에서, K를 어떻게 결정할까?

### 방법 1: Elbow Method

K를 1부터 늘려가면서 WCSS(inertia)를 계산한다. K가 커질수록 WCSS는 당연히 줄어든다 — 극단적으로 K = 데이터 수라면 WCSS = 0이 된다. 핵심은 **WCSS가 급격히 감소하다가 완만해지는 지점**을 찾는 것이다.

```
WCSS
 │
 │●
 │
 │  ●
 │
 │     ●
 │        ● ← 여기가 "팔꿈치(Elbow)"
 │           ●  ●  ●  ●  ●
 │
 └────────────────────────── K
   1  2  3  4  5  6  7  8  9
```

K=4 이후로 WCSS 감소가 둔해졌다면, K=4가 적절한 선택이다. "팔꿈치" 모양이라서 Elbow Method라 부른다.

```python
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

wcss = []
K_range = range(1, 11)

for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X)
    wcss.append(km.inertia_)

plt.figure(figsize=(8, 5))
plt.plot(K_range, wcss, 'bo-')
plt.xlabel('K (클러스터 수)')
plt.ylabel('WCSS (Inertia)')
plt.title('Elbow Method')
plt.grid(True, alpha=0.3)
plt.show()
```

Elbow Method의 한계는 **팔꿈치가 뚜렷하지 않을 때가 있다**는 것이다. WCSS가 서서히 감소하면 어디가 "꺾이는 점"인지 주관적 판단이 된다.

### 방법 2: Silhouette Score

실루엣 점수는 Elbow보다 더 정량적인 기준을 제공한다. 각 데이터 포인트에 대해 두 가지를 계산한다:

```
a(i) = 같은 클러스터 내 다른 데이터들과의 평균 거리 (응집도)
b(i) = 가장 가까운 다른 클러스터의 데이터들과의 평균 거리 (분리도)

실루엣 계수 s(i) = (b(i) - a(i)) / max(a(i), b(i))
```

실루엣 계수의 범위는 -1 ~ 1이다:

| 값 | 의미 |
|----|------|
| 1에 가까움 | 자기 클러스터와 가깝고, 다른 클러스터와는 멀다 (좋음) |
| 0 근처 | 클러스터 경계에 위치 (어느 쪽에도 속하지 않음) |
| 음수 | 다른 클러스터가 더 가까움 (잘못된 할당) |

전체 데이터의 실루엣 계수 평균이 **Silhouette Score**다. K를 바꿔가며 Silhouette Score가 가장 높은 K를 고른다.

```python
from sklearn.metrics import silhouette_score

scores = []
K_range = range(2, 11)  # K=1은 의미 없음

for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X)
    scores.append(silhouette_score(X, labels))

plt.figure(figsize=(8, 5))
plt.plot(K_range, scores, 'bo-')
plt.xlabel('K (클러스터 수)')
plt.ylabel('Silhouette Score')
plt.title('Silhouette Analysis')
plt.grid(True, alpha=0.3)
plt.show()
```

---

## 실루엣 다이어그램: 클러스터 품질을 한눈에

평균 Silhouette Score는 전체적인 경향만 보여준다. **실루엣 다이어그램**은 각 클러스터의 품질을 개별적으로 시각화한다.

```
Silhouette Diagram (K=3)

클러스터 0  ████████████████████  (넓고 균일 → 좋은 클러스터)
            ██████████████████
            █████████████████
            ████████████████

클러스터 1  ████████████████████████  (가장 넓음 → 응집도 높음)
            ███████████████████████
            ██████████████████████
            █████████████████████

클러스터 2  █████████████  (좁음 → 응집도 낮거나 크기가 작음)
            ████████████
            ███████████
     ──────│────────────────── 평균 실루엣
          0.0              0.6                1.0
```

좋은 클러스터링의 특징:
- 모든 클러스터의 실루엣 계수가 평균선 위에 있다
- 클러스터 간 두께(크기)가 비교적 균등하다
- 음수 값을 가진 데이터가 거의 없다

```python
from sklearn.metrics import silhouette_samples
import numpy as np

km = KMeans(n_clusters=3, random_state=42, n_init=10)
labels = km.fit_predict(X)
silhouette_vals = silhouette_samples(X, labels)

fig, ax = plt.subplots(figsize=(8, 6))
y_lower = 10

for i in range(3):
    cluster_silhouette = silhouette_vals[labels == i]
    cluster_silhouette.sort()

    size_cluster = len(cluster_silhouette)
    y_upper = y_lower + size_cluster

    ax.fill_betweenx(np.arange(y_lower, y_upper),
                     0, cluster_silhouette, alpha=0.7)
    ax.text(-0.05, y_lower + 0.5 * size_cluster, str(i))
    y_lower = y_upper + 10

avg_score = silhouette_score(X, labels)
ax.axvline(x=avg_score, color='red', linestyle='--', label=f'평균: {avg_score:.3f}')
ax.set_xlabel('실루엣 계수')
ax.set_ylabel('클러스터')
ax.legend()
plt.title('Silhouette Diagram')
plt.show()
```

실루엣 다이어그램은 Elbow Method보다 풍부한 정보를 준다. K=3일 때 평균 점수가 높더라도, 특정 클러스터 하나가 심하게 나쁘면 K=4로 쪼개는 게 나을 수 있다. 다이어그램을 보면 이런 판단이 가능하다.

---

## K-Means의 한계

K-Means는 빠르고 직관적이지만, 명확한 한계가 있다.

### 1. 구형(Spherical) 클러스터만 잘 잡는다

K-Means는 중심점과의 유클리드 거리를 기준으로 할당하기 때문에, 본질적으로 **구형(등방적)** 클러스터를 가정한다.

```
K-Means가 잘 작동하는 경우:        K-Means가 실패하는 경우:

    ●●●                                 ●●●●●●●●●●●●
   ●●●●●                              ●●●●●●●●●●●●●●
   ●●●●●         ●●●●●                 ●●●●●●●●●●●●
    ●●●          ●●●●●
                 ●●●●●               ●●●●●●●●●●●●●●●●
                  ●●●                ●●●●●●●●●●●●●●●●●
                                      ●●●●●●●●●●●●●●●

  (구형 클러스터 → OK)              (초승달/고리 형태 → 실패)
```

비구형 클러스터에는 DBSCAN이나 Spectral Clustering 같은 알고리즘이 더 적합하다.

### 2. K를 미리 지정해야 한다

클러스터 수를 모르는 상태에서 K를 정해야 한다. Elbow와 Silhouette가 가이드를 주지만, 결국 사람의 판단이 개입한다. DBSCAN처럼 K가 필요 없는 알고리즘도 있다.

### 3. 이상치에 민감하다

이상치(outlier)가 하나라도 있으면 중심점이 크게 끌려간다. 평균(mean)을 사용하기 때문이다.

```
정상적인 상황:           이상치가 있는 상황:

  ● ● ●                  ● ● ●
  ● ■ ●                  ● ● ●
  ● ● ●                  ● ● ●
  (중심점 정확)                              ● ← 이상치
                             ■ ← 중심점이 끌려감
```

이상치에 강건한 변형으로는 K-Medoids(PAM) 알고리즘이 있다. 중심점 대신 **실제 데이터 포인트(medoid)** 를 중심으로 사용해서, 이상치에 덜 민감하다.

### 4. 클러스터 크기와 밀도가 다르면 어렵다

K-Means는 각 데이터를 가장 가까운 중심점에 할당하기 때문에, 크기나 밀도가 크게 다른 클러스터를 잘 분리하지 못한다. 큰 클러스터의 중심점이 작은 클러스터 쪽 데이터까지 "빨아들이는" 현상이 생긴다.

### 5. 피처 스케일링이 필수다

K-Means는 유클리드 거리를 사용한다. [피처 스케일링 글](/ml/feature-scaling/)에서 배웠듯이, 스케일이 다른 피처가 섞이면 큰 스케일의 피처가 거리 계산을 지배한다. K-Means 전에 반드시 StandardScaler나 MinMaxScaler를 적용해야 한다.

---

## Mini-Batch K-Means: 대규모 데이터를 위한 변형

데이터가 수십만~수백만 건이면 전체 데이터에 대해 매 반복마다 거리를 계산하는 것은 비용이 크다. Mini-Batch K-Means는 **매 반복에서 전체가 아닌 랜덤 미니 배치(일부 샘플)만 사용**해서 중심점을 업데이트한다.

```
일반 K-Means:
  매 반복: 전체 N개 데이터로 중심점 업데이트
  시간 복잡도: O(n * K * d * iterations)

Mini-Batch K-Means:
  매 반복: 랜덤 샘플 b개로 중심점 업데이트 (b << N)
  시간 복잡도: O(b * K * d * iterations)  ← 훨씬 빠름
```

품질은 약간 떨어질 수 있지만, 속도가 극적으로 빨라진다. 대규모 데이터에서는 실질적으로 유일한 선택지다.

```python
from sklearn.cluster import MiniBatchKMeans

mbkm = MiniBatchKMeans(
    n_clusters=5,
    batch_size=1024,
    random_state=42,
    n_init=10
)
mbkm.fit(X)
```

---

## sklearn으로 K-Means 전체 파이프라인

이론을 코드로 엮어 보자. 인공 데이터를 생성하고, K를 선택하고, 클러스터링 결과를 시각화하는 전체 과정이다.

```python
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_blobs
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

# ─── 1. 데이터 생성 ───
X, y_true = make_blobs(
    n_samples=500,
    centers=4,
    cluster_std=0.8,
    random_state=42
)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ─── 2. Elbow Method ───
wcss = []
sil_scores = []
K_range = range(2, 11)

for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    wcss.append(km.inertia_)
    sil_scores.append(silhouette_score(X_scaled, labels))

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

axes[0].plot(K_range, wcss, 'bo-')
axes[0].set_xlabel('K')
axes[0].set_ylabel('WCSS (Inertia)')
axes[0].set_title('Elbow Method')
axes[0].grid(True, alpha=0.3)

axes[1].plot(K_range, sil_scores, 'ro-')
axes[1].set_xlabel('K')
axes[1].set_ylabel('Silhouette Score')
axes[1].set_title('Silhouette Analysis')
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()
```

```python
# ─── 3. 최적 K로 클러스터링 ───
best_k = 4
km = KMeans(n_clusters=best_k, random_state=42, n_init=10)
labels = km.fit_predict(X_scaled)
centroids = km.cluster_centers_

# ─── 4. 결과 시각화 ───
plt.figure(figsize=(10, 7))

colors = ['#3182f6', '#ff6b6b', '#00c9a7', '#ffd93d']
for i in range(best_k):
    mask = labels == i
    plt.scatter(X_scaled[mask, 0], X_scaled[mask, 1],
                c=colors[i], label=f'Cluster {i}', alpha=0.6, s=50)

plt.scatter(centroids[:, 0], centroids[:, 1],
            c='black', marker='X', s=200, edgecolors='white',
            linewidths=2, label='Centroids')

plt.xlabel('Feature 1')
plt.ylabel('Feature 2')
plt.title(f'K-Means Clustering (K={best_k})')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()

print(f'Silhouette Score: {silhouette_score(X_scaled, labels):.4f}')
print(f'Inertia: {km.inertia_:.2f}')
print(f'반복 횟수: {km.n_iter_}')
```

`KMeans`의 주요 파라미터를 정리하면:

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `n_clusters` | 8 | 클러스터 수 K |
| `init` | `'k-means++'` | 초기화 방법 |
| `n_init` | 10 | 다른 초기화로 반복 실행 횟수 |
| `max_iter` | 300 | 단일 실행의 최대 반복 횟수 |
| `tol` | 1e-4 | 수렴 판정 임계값 |
| `random_state` | None | 재현성을 위한 시드 |

---

## 실전 예제: 고객 세분화 (Customer Segmentation)

실무에서 K-Means가 가장 많이 쓰이는 분야 중 하나가 고객 세분화다. 구매 데이터를 기반으로 비슷한 행동 패턴의 고객끼리 묶어서, 그룹별 맞춤 전략을 수립한다.

```python
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# ─── 고객 데이터 생성 (실무에서는 DB에서 추출) ───
np.random.seed(42)
n_customers = 300

data = {
    'recency': np.concatenate([
        np.random.normal(10, 3, 100),   # 최근 구매 고객
        np.random.normal(50, 10, 100),  # 중간 고객
        np.random.normal(120, 20, 100)  # 오래된 고객
    ]),
    'frequency': np.concatenate([
        np.random.normal(30, 5, 100),   # 자주 구매
        np.random.normal(10, 3, 100),   # 가끔 구매
        np.random.normal(3, 1, 100)     # 거의 안 구매
    ]),
    'monetary': np.concatenate([
        np.random.normal(500, 100, 100),  # 고액 구매
        np.random.normal(200, 50, 100),   # 중간 구매
        np.random.normal(50, 20, 100)     # 소액 구매
    ])
}

df = pd.DataFrame(data)
df = df.clip(lower=0)  # 음수 방지

# ─── 피처 스케일링 ───
scaler = StandardScaler()
X_scaled = scaler.fit_transform(df)

# ─── K 선택 (Elbow + Silhouette) ───
results = []
for k in range(2, 8):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    results.append({
        'k': k,
        'inertia': km.inertia_,
        'silhouette': silhouette_score(X_scaled, labels)
    })

results_df = pd.DataFrame(results)
print(results_df.to_string(index=False))

# ─── K=3으로 세분화 ───
km = KMeans(n_clusters=3, random_state=42, n_init=10)
df['cluster'] = km.fit_predict(X_scaled)

# ─── 세그먼트 프로파일링 ───
profile = df.groupby('cluster').agg({
    'recency': 'mean',
    'frequency': 'mean',
    'monetary': 'mean',
    'cluster': 'count'
}).rename(columns={'cluster': 'count'})

print("\n고객 세그먼트 프로파일:")
print(profile.round(1))
```

```
출력 예시:

고객 세그먼트 프로파일:
         recency  frequency  monetary  count
cluster
0           10.2       29.8     498.3    100   ← VIP (최근, 자주, 고액)
1           49.5       10.1     201.2    100   ← 일반 (중간 활동)
2          119.8        3.2      52.1    100   ← 이탈 위험 (오래, 드물게, 소액)
```

각 세그먼트에 대해 다른 전략을 적용할 수 있다:

| 세그먼트 | 특성 | 전략 |
|----------|------|------|
| Cluster 0 (VIP) | 최근 구매, 높은 빈도/금액 | 로열티 프로그램, 프리미엄 혜택 |
| Cluster 1 (일반) | 중간 활동 | 재구매 유도 쿠폰, 업셀링 |
| Cluster 2 (이탈 위험) | 오래전 구매, 낮은 빈도/금액 | 윈백 캠페인, 할인 프로모션 |

이것이 RFM(Recency, Frequency, Monetary) 분석이다. 실무에서 마케팅 데이터 분석의 가장 기본적인 프레임워크 중 하나이고, K-Means가 그 핵심 엔진이다.

---

## 정리

| 항목 | 내용 |
|------|------|
| **핵심 아이디어** | K개 중심점 배치 → 할당 → 업데이트 반복 |
| **목적 함수** | WCSS(Inertia) 최소화 |
| **초기화** | K-Means++ (중심점을 서로 멀리 배치) |
| **K 선택** | Elbow Method + Silhouette Score |
| **장점** | 빠르고 직관적, 대규모 데이터에 확장 가능 |
| **한계** | 구형 클러스터 가정, K 사전 지정, 이상치 민감 |
| **변형** | Mini-Batch K-Means (대규모), K-Medoids (이상치 강건) |

K-Means는 비지도학습의 "Hello World"다. 단순하지만 실전에서 강력하다. 고객 세분화, 이미지 압축, 문서 클러스터링 등 응용 범위가 넓고, 다른 비지도학습 알고리즘을 이해하는 기반이 된다.

하지만 K-Means는 **정상 패턴을 모델링**하는 알고리즘이지, **비정상을 찾는** 알고리즘은 아니다. 다음 글에서는 비지도학습의 또 다른 핵심 응용인 [이상치 탐지(Anomaly Detection)](/ml/anomaly-detection/)를 다룬다. 정상 데이터의 분포를 학습하고, 그 분포에서 벗어나는 데이터를 자동으로 찾아내는 방법이다.
