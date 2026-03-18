---
date: '2026-02-07'
title: 'DBSCAN과 GMM: 밀도·확률 기반 클러스터링 비교'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 38
tags: ['DBSCAN', 'GMM', 'Gaussian Mixture Model', '밀도 기반 클러스터링', '확률 기반 클러스터링', '머신러닝']
summary: 'K-Means의 한계를 극복하는 두 가지 접근법. DBSCAN의 밀도 기반 클러스터링과 GMM의 확률적 소프트 클러스터링을 비교한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/pca/)에서 PCA를 통해 고차원 데이터를 저차원으로 압축하는 방법을 배웠다. 차원 축소는 데이터를 시각화하거나, 모델에 넣기 전 전처리 단계로 유용했다. 하지만 차원을 줄인 뒤에도 풀어야 할 근본 문제가 남아 있다 — **레이블 없는 데이터에서 구조를 발견하는 것**, 즉 클러스터링이다.

[K-Means](/ml/kmeans-clustering/)는 클러스터링의 대표 알고리즘이다. 직관적이고 빠르다. 하지만 치명적인 한계가 셋 있다.

- **구형(spherical) 클러스터만** 잘 잡는다. 초승달, 고리 같은 비구형 형태에는 맥을 못 춘다
- **K를 미리 정해야** 한다. 클러스터가 몇 개인지 모르면 시작조차 할 수 없다
- **노이즈에 취약**하다. 모든 점을 반드시 어딘가에 할당하기 때문에, 이상치가 중심점을 왜곡한다

이 글에서 다루는 두 알고리즘은 각각 다른 방식으로 이 한계를 돌파한다. **DBSCAN**은 밀도를 기준으로 클러스터를 찾아서 비구형 형태와 노이즈를 동시에 처리한다. **GMM(Gaussian Mixture Model)**은 확률 분포를 기반으로 소프트 할당을 수행해서, 타원형 클러스터와 중첩된 구조를 포착한다.

---

## DBSCAN: 밀도 기반 클러스터링

### 핵심 아이디어

DBSCAN(Density-Based Spatial Clustering of Applications with Noise)은 이름 그대로 **밀도**가 높은 영역을 클러스터로 잡는다. K-Means가 "중심과의 거리"로 사고하는 반면, DBSCAN은 "이 근처에 점이 충분히 모여 있느냐"로 사고한다.

이 발상의 핵심에 두 개의 파라미터가 있다.

- **eps (epsilon)**: 이웃으로 간주할 반경. 한 점에서 eps 이내에 있는 점들이 이웃이다
- **min_samples**: 핵심 점(core point)이 되려면 eps 반경 안에 최소 몇 개의 점이 있어야 하는지

이 두 파라미터로 데이터의 모든 점을 세 가지로 분류한다.

```
[Core Point]     eps 반경 안에 min_samples 이상의 이웃이 있는 점
                 → 밀도가 높은 영역의 중심. 클러스터의 핵심이다

[Border Point]   스스로는 core point가 아니지만,
                 어떤 core point의 eps 반경 안에 포함된 점
                 → 클러스터 가장자리에 속한다

[Noise Point]    어떤 core point의 eps 반경에도 포함되지 않는 점
                 → 어디에도 속하지 않는 이상치. -1로 레이블된다
```

예를 들어 min_samples=4이고 eps=1.0이라면:

```
eps=1.0, min_samples=4

        ●   ●
     ●  ★  ●        ○         ·
        ●
                   ○   ○

★ = Core point (반경 안에 점이 5개 → ≥ 4)
● = Border point (core point의 이웃이지만, 자신의 이웃은 4개 미만)
○ = Border point (근처 core point가 있다면)
·  = Noise point (어떤 core point의 반경에도 포함 안 됨)
```

K-Means에서는 이 noise point(·)도 억지로 가장 가까운 클러스터에 밀어넣었을 것이다. DBSCAN은 "이건 어디에도 안 속한다"고 솔직하게 말한다. [이상 탐지](/ml/anomaly-detection/)에서 다뤘던 이상치 검출과 자연스럽게 연결되는 지점이다.

---

### DBSCAN 알고리즘 단계별 동작

알고리즘의 흐름을 한 단계씩 따라가보자.

**Step 1: 모든 점의 이웃 탐색**

각 데이터 포인트에 대해 eps 반경 내의 이웃 수를 센다.

```python
# 의사코드
for each point p in dataset:
    neighbors(p) = {q in dataset | distance(p, q) <= eps}
    if len(neighbors(p)) >= min_samples:
        mark p as CORE
```

**Step 2: 클러스터 확장**

방문하지 않은 core point를 하나 고른다. 이 점을 시작으로 클러스터를 확장한다.

```
1. 미방문 core point p를 고른다 → 새 클러스터 C 시작
2. p의 eps-이웃을 모두 C에 넣는다
3. 이웃 중 core point가 있으면, 그 점의 이웃도 C에 추가 (재귀적 확장)
4. 더 이상 확장할 core point가 없으면 C 완성
5. 아직 미방문 core point가 남아 있으면 1로 돌아간다
```

핵심은 **3번**이다. Core point끼리 eps 반경이 서로 겹치면 같은 클러스터로 연결된다. 이 연쇄 반응 덕분에 비구형 클러스터도 따라갈 수 있다. K-Means는 중심에서 뻗어나가는 원형으로만 확장하지만, DBSCAN은 밀도가 연결되는 방향이면 어디든 따라간다.

**Step 3: 노이즈 처리**

모든 core point의 클러스터 확장이 끝난 뒤, 어떤 클러스터에도 포함되지 않은 점은 noise(-1)로 표시한다.

```
시간 복잡도:
- 일반: O(n²) — 모든 점 쌍의 거리를 계산
- KD-tree/Ball-tree 사용 시: O(n log n) — sklearn은 자동으로 적절한 자료구조 선택
```

---

### eps 선택: k-distance 그래프

DBSCAN의 가장 까다로운 부분은 eps 설정이다. 너무 작으면 대부분의 점이 noise가 되고, 너무 크면 모든 점이 하나의 거대 클러스터로 합쳐진다. 실전에서 가장 널리 쓰이는 방법이 **k-distance 그래프**다.

```python
from sklearn.neighbors import NearestNeighbors
import numpy as np
import matplotlib.pyplot as plt

# k = min_samples로 설정 (보통 min_samples = 2 * n_features)
k = 4
nn = NearestNeighbors(n_neighbors=k)
nn.fit(X)
distances, _ = nn.kneighbors(X)

# k번째 이웃까지의 거리를 오름차순 정렬
k_distances = np.sort(distances[:, -1])

plt.figure(figsize=(8, 4))
plt.plot(k_distances)
plt.xlabel('Points (sorted)')
plt.ylabel(f'{k}-distance')
plt.title('k-distance Graph')
plt.axhline(y=0.3, color='r', linestyle='--', label='eps 후보')
plt.legend()
plt.show()
```

그래프에서 **기울기가 급격히 변하는 "엘보(elbow)" 지점**의 y값이 eps 후보다. 이 지점 아래의 점들은 밀도가 높은 영역(클러스터 내부), 위의 점들은 밀도가 낮은 영역(노이즈)이다.

`min_samples` 선택의 경험적 규칙은 이렇다:

- 최소값: `min_samples >= n_features + 1`
- 경험적 기본값: `min_samples = 2 * n_features`
- 노이즈가 많은 데이터: min_samples를 높인다
- 2D 데이터 시작점: `min_samples = 4`

---

### DBSCAN의 강점

**1. 비구형 클러스터 발견**

K-Means가 절대 못 푸는 문제를 DBSCAN은 자연스럽게 해결한다. 초승달, 동심원, 불규칙 형태 — 밀도가 연결되어 있기만 하면 형태에 관계없이 클러스터로 잡는다.

**2. K를 미리 정할 필요 없음**

클러스터 수를 자동으로 결정한다. eps와 min_samples만 정하면 밀도 구조에서 클러스터가 자연스럽게 드러난다.

**3. 노이즈를 명시적으로 처리**

이상치를 억지로 클러스터에 밀어넣지 않고 noise로 분리한다. 이상 탐지와 클러스터링을 동시에 수행하는 셈이다.

---

### DBSCAN의 한계: 밀도 편차 문제

DBSCAN에도 약점이 있다. 가장 큰 문제는 **밀도가 균일하지 않은 데이터**에서 발생한다.

```
클러스터 A (고밀도)          클러스터 B (저밀도)

  ● ● ● ● ●                ○       ○
  ● ● ● ● ●
  ● ● ● ● ●                    ○
  ● ● ● ● ●                ○       ○
  ● ● ● ● ●
```

A에 맞게 eps를 작게 설정하면, B의 점들은 서로 너무 멀어서 noise로 분류된다. B에 맞게 eps를 크게 설정하면, A와 B가 하나의 클러스터로 합쳐지거나, A 내부의 세밀한 구조를 놓친다. **하나의 eps로 모든 밀도 수준을 포착할 수 없다**는 근본적 한계다.

그 외 한계:

- **고차원 데이터에 취약**: 차원이 높아지면 거리 개념이 무의미해진다 — [KNN](/ml/knn/)에서 다뤘던 "차원의 저주"와 같은 문제다
- **eps 민감도**: eps를 약간만 바꿔도 결과가 크게 달라질 수 있다

---

### HDBSCAN: 밀도 편차 극복

DBSCAN의 밀도 편차 문제를 해결하려는 확장이 **HDBSCAN(Hierarchical DBSCAN)**이다. 핵심 아이디어는 고정된 eps 대신, **여러 eps 수준에서 DBSCAN을 실행하고 가장 안정적인 클러스터를 추출**하는 것이다.

```python
import hdbscan

clusterer = hdbscan.HDBSCAN(min_cluster_size=15, min_samples=5)
labels = clusterer.fit_predict(X)

# 각 클러스터 할당에 대한 확신도(probability)도 제공
probabilities = clusterer.probabilities_
```

HDBSCAN은 eps를 설정할 필요가 없고, `min_cluster_size` 하나만 정하면 된다. 밀도가 다른 클러스터를 동시에 잘 잡아내며, 최근에는 `sklearn.cluster.HDBSCAN`으로 sklearn에도 통합되었다. 밀도 기반 클러스터링을 실전에서 쓴다면 DBSCAN보다 HDBSCAN을 먼저 고려하는 것이 좋다.

---

## GMM: 확률 기반 소프트 클러스터링

### 하드 vs 소프트 할당

DBSCAN과 K-Means는 **하드 클러스터링(hard clustering)** 이다. 각 데이터 포인트는 정확히 하나의 클러스터에 속한다. 0 아니면 1이다.

하지만 현실 데이터에서는 경계가 모호한 경우가 많다. 고객 세분화를 생각해보자. 한 고객이 "프리미엄 고객" 성향 60%, "일반 고객" 성향 40%일 수 있다. 하드 클러스터링은 이 고객을 프리미엄에 넣거나 일반에 넣거나 둘 중 하나를 강제한다. 미묘한 차이를 날려버리는 것이다.

**GMM(Gaussian Mixture Model)**은 각 데이터 포인트가 **각 클러스터에 속할 확률**을 계산한다.

```
K-Means (하드 할당)          GMM (소프트 할당)
──────────────────           ──────────────────
점 A → 클러스터 1              점 A → 클러스터 1: 0.92, 클러스터 2: 0.08
점 B → 클러스터 2              점 B → 클러스터 1: 0.15, 클러스터 2: 0.85
점 C → 클러스터 1              점 C → 클러스터 1: 0.51, 클러스터 2: 0.49  ← 경계 위의 점
```

점 C처럼 클러스터 경계에 있는 데이터를 0.51 대 0.49로 표현할 수 있다. 이 확률 정보가 이후 의사결정에서 큰 차이를 만든다.

---

### GMM의 수학적 직관

GMM은 데이터가 **여러 개의 가우시안(정규) 분포가 혼합되어 생성되었다**고 가정한다. [나이브 베이즈](/ml/naive-bayes/)에서 Gaussian NB가 각 클래스의 데이터를 가우시안으로 모델링했던 것과 비슷하지만, GMM은 **레이블 없이** 이 가우시안들을 찾아낸다.

각 가우시안 컴포넌트 k는 세 가지 파라미터로 정의된다:

- **평균 (mu_k)**: 분포의 중심 위치
- **공분산 행렬 (Sigma_k)**: 분포의 형태와 방향. 타원의 기울기와 폭을 결정한다
- **혼합 가중치 (pi_k)**: 전체 데이터에서 이 컴포넌트가 차지하는 비율. 모든 pi_k의 합은 1

K-Means의 각 클러스터가 "중심점"만 가지는 것과 대비된다. GMM의 각 컴포넌트는 중심(평균)뿐 아니라 **퍼짐과 방향(공분산)**까지 가지기 때문에, 구형이 아닌 타원형 클러스터도 자연스럽게 표현한다.

```
K-Means 클러스터:             GMM 컴포넌트:
원형만 가능                    타원형도 가능

    ● ● ●                      ●  ●
   ● ● ● ●                   ●  ●  ●  ●
  ● ● ★ ● ●                ●  ●  ★  ●  ●
   ● ● ● ●                   ●  ●  ●
    ● ● ●                       ●  ●

  (★ = 중심)                 (★ = 평균, 타원 = 공분산)
```

---

### EM 알고리즘: E-step과 M-step

GMM의 파라미터(각 컴포넌트의 평균, 공분산, 혼합 가중치)를 어떻게 학습할까? 정답은 **EM(Expectation-Maximization) 알고리즘**이다.

EM은 직관적으로 이런 닭과 달걀 문제를 해결한다:

- 각 점이 어느 컴포넌트에서 나왔는지 알면 → 각 컴포넌트의 파라미터를 추정할 수 있다
- 각 컴포넌트의 파라미터를 알면 → 각 점이 어느 컴포넌트에서 나왔는지 추정할 수 있다

둘 다 모르는 상태에서 시작해, 번갈아 추정하며 점진적으로 수렴한다.

**E-step (Expectation, 기대):**

현재 파라미터로 각 데이터 포인트가 각 컴포넌트에 속할 **사후 확률(responsibility)**을 계산한다.

```
r(i, k) = pi_k * N(x_i | mu_k, Sigma_k) / sum_j(pi_j * N(x_i | mu_j, Sigma_j))
```

N(x | mu, Sigma)는 가우시안 확률밀도함수다. 결과적으로 각 점 x_i에 대해 K개 컴포넌트의 확률 벡터가 나온다 (합 = 1).

**M-step (Maximization, 최대화):**

E-step에서 계산한 responsibility를 가중치로 사용해 각 컴포넌트의 파라미터를 업데이트한다.

```
# N_k = 컴포넌트 k에 할당된 데이터의 가중합
N_k = sum_i(r(i, k))

# 새 평균: responsibility로 가중 평균
mu_k = sum_i(r(i, k) * x_i) / N_k

# 새 공분산: responsibility로 가중된 편차 행렬
Sigma_k = sum_i(r(i, k) * (x_i - mu_k)(x_i - mu_k)^T) / N_k

# 새 혼합 가중치
pi_k = N_k / n
```

K-Means와 비교하면 구조가 놀라울 정도로 비슷하다:

```
K-Means                         GMM (EM)
───────                         ────────
Assignment: 가장 가까운 중심    E-step: 각 컴포넌트 확률 계산
→ 0 또는 1 (하드)               → 0~1 사이의 실수 (소프트)

Update: 할당된 점의 평균        M-step: 가중 평균·공분산 업데이트
→ 중심만 이동                   → 평균 + 공분산 + 가중치 모두 업데이트
```

사실 K-Means는 **모든 공분산이 동일한 단위행렬이고, responsibility가 0/1인 GMM의 특수 케이스**다. GMM이 더 일반적인 프레임워크인 것이다.

---

### GMM vs K-Means: 핵심 차이

| 기준 | K-Means | GMM |
|------|---------|-----|
| 할당 방식 | 하드 (0 or 1) | 소프트 (확률) |
| 클러스터 형태 | 구형(spherical) | 타원형(elliptical) |
| 파라미터 | 중심점만 | 평균 + 공분산 + 가중치 |
| 알고리즘 | Lloyd's algorithm | EM algorithm |
| 클러스터 크기 | 비슷한 크기 가정 | 다른 크기 허용 (pi_k) |
| 수렴 보장 | 로컬 최적 (빠름) | 로컬 최적 (느림) |
| 결과물 | 레이블 | 레이블 + 확률 |

GMM이 모든 면에서 낫다면 K-Means는 왜 쓸까? 세 가지 이유다.

1. **속도**: K-Means가 훨씬 빠르다. 대용량 데이터에서 이 차이는 크다
2. **단순성**: 결과 해석이 쉽다. "이 점은 클러스터 A" vs "이 점은 클러스터 A에 72.3%"
3. **안정성**: GMM은 공분산 행렬 추정이 불안정할 수 있다. 데이터가 적거나 차원이 높으면 특히 그렇다

---

### BIC/AIC로 컴포넌트 수 결정

K-Means에서 K를 정하기 위해 엘보 방법이나 실루엣 스코어를 썼다면, GMM에서는 **BIC(Bayesian Information Criterion)**와 **AIC(Akaike Information Criterion)**를 쓴다.

둘 다 모델 적합도와 복잡도 사이의 균형을 잡는다.

```
AIC = -2 * log_likelihood + 2 * k
BIC = -2 * log_likelihood + k * log(n)

여기서 k = 모델의 파라미터 수, n = 데이터 수
```

BIC는 AIC보다 파라미터 수에 더 큰 패널티를 준다 (n이 크면 log(n) > 2). 따라서 BIC가 더 간결한(parsimonious) 모델을 선호한다. **실전에서는 BIC를 기본으로 사용**하고, 값이 가장 낮은 컴포넌트 수를 선택한다.

```python
from sklearn.mixture import GaussianMixture
import numpy as np

bics = []
aics = []
K_range = range(1, 10)

for k in K_range:
    gmm = GaussianMixture(n_components=k, random_state=42)
    gmm.fit(X)
    bics.append(gmm.bic(X))
    aics.append(gmm.aic(X))

best_k = K_range[np.argmin(bics)]
print(f"BIC 기준 최적 컴포넌트 수: {best_k}")
```

---

## sklearn 실전 예제

### DBSCAN: 반달(moons) 데이터셋

K-Means가 실패하고 DBSCAN이 성공하는 대표적 예제다.

```python
from sklearn.datasets import make_moons
from sklearn.cluster import DBSCAN, KMeans
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import numpy as np

# 반달 데이터 생성
X, y_true = make_moons(n_samples=300, noise=0.08, random_state=42)
X = StandardScaler().fit_transform(X)

# K-Means
kmeans = KMeans(n_clusters=2, random_state=42, n_init=10)
km_labels = kmeans.fit_predict(X)

# DBSCAN
dbscan = DBSCAN(eps=0.3, min_samples=5)
db_labels = dbscan.fit_predict(X)

# 시각화
fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].scatter(X[:, 0], X[:, 1], c=y_true, cmap='viridis', s=15)
axes[0].set_title('Ground Truth')

axes[1].scatter(X[:, 0], X[:, 1], c=km_labels, cmap='viridis', s=15)
axes[1].set_title('K-Means (K=2)')

mask = db_labels != -1
axes[2].scatter(X[mask, 0], X[mask, 1], c=db_labels[mask], cmap='viridis', s=15)
axes[2].scatter(X[~mask, 0], X[~mask, 1], c='gray', s=10, alpha=0.5, label='Noise')
axes[2].set_title(f'DBSCAN (clusters: {len(set(db_labels) - {-1})})')

plt.tight_layout()
plt.show()
```

K-Means는 두 반달을 수직으로 잘라서 각각 반씩 나눈다. 구형으로만 분할할 수 있기 때문이다. DBSCAN은 밀도를 따라가며 두 반달을 정확히 분리한다.

```
K-Means 결과:                 DBSCAN 결과:
수직 분할 (틀림)               반달 분리 (정확)

  ▓▓▓▓ | ░░░░                 ▓▓▓▓▓▓▓▓
  ▓▓▓▓ | ░░░░                 ░░░░░░░░░░
      ▓▓ | ░░                     ░░░░░░
        ▓ | ░                 ▓▓▓▓▓▓▓▓
                              (▓, ░ = 서로 다른 클러스터)
```

eps 선정에 k-distance 그래프를 활용하는 실전 코드도 같이 보자.

```python
from sklearn.neighbors import NearestNeighbors

nn = NearestNeighbors(n_neighbors=5)
nn.fit(X)
distances, _ = nn.kneighbors(X)
k_distances = np.sort(distances[:, -1])

plt.figure(figsize=(8, 4))
plt.plot(k_distances)
plt.xlabel('Points (sorted by distance)')
plt.ylabel('5-distance')
plt.title('k-distance Graph for eps Selection')
plt.grid(True, alpha=0.3)
plt.show()

# 엘보 지점을 읽어서 eps에 반영
```

---

### GMM: Iris 데이터셋

Iris는 3종 붓꽃 데이터로, 클래스 간 일부 중첩이 있어 소프트 클러스터링의 효과를 보기 좋다.

```python
from sklearn.datasets import load_iris
from sklearn.mixture import GaussianMixture
from sklearn.decomposition import PCA
import numpy as np

# Iris 로드 + PCA로 2D 축소 (시각화용)
iris = load_iris()
X_iris = iris.data
y_iris = iris.target

pca = PCA(n_components=2)
X_2d = pca.fit_transform(X_iris)

# GMM 피팅
gmm = GaussianMixture(n_components=3, covariance_type='full', random_state=42)
gmm.fit(X_2d)

# 하드 레이블 & 소프트 확률
labels = gmm.predict(X_2d)
probs = gmm.predict_proba(X_2d)

# 불확실한 점 찾기 (최대 확률이 0.7 미만)
uncertain = probs.max(axis=1) < 0.7
print(f"불확실한 점: {uncertain.sum()}개 / {len(X_2d)}개")
print(f"불확실한 점의 확률 분포 예시:")
print(probs[uncertain][:5].round(3))
```

GMM은 확률을 돌려주기 때문에, "불확실한 점"을 명시적으로 찾을 수 있다. 이 정보는 실전에서 큰 가치가 있다. 불확실한 샘플을 추가 검토하거나, 전문가에게 레이블링을 요청하는 **능동 학습(active learning)** 에 활용할 수 있다.

BIC로 최적 컴포넌트 수를 확인하는 코드:

```python
import matplotlib.pyplot as plt

bics = []
K_range = range(1, 8)

for k in K_range:
    gmm = GaussianMixture(n_components=k, covariance_type='full', random_state=42)
    gmm.fit(X_2d)
    bics.append(gmm.bic(X_2d))

plt.figure(figsize=(8, 4))
plt.plot(K_range, bics, 'bo-')
plt.xlabel('Number of Components')
plt.ylabel('BIC')
plt.title('BIC Score by Number of Components')
plt.grid(True, alpha=0.3)
plt.show()

print(f"BIC 최소: k={K_range[np.argmin(bics)]}")
```

---

## K-Means vs DBSCAN vs GMM: 종합 비교

세 알고리즘을 한 표로 정리한다.

| 기준 | K-Means | DBSCAN | GMM |
|------|---------|--------|-----|
| 클러스터 수 | 사전 지정 (K) | 자동 결정 | 사전 지정 (K) |
| 할당 방식 | 하드 | 하드 + 노이즈 | 소프트 (확률) |
| 클러스터 형태 | 구형 | 임의 형태 | 타원형 |
| 노이즈 처리 | 없음 (강제 할당) | 명시적 (-1) | 없음 (강제 할당) |
| 주요 파라미터 | K | eps, min_samples | K, covariance_type |
| 파라미터 선택 | 엘보/실루엣 | k-distance graph | BIC/AIC |
| 시간 복잡도 | O(nKt) | O(n log n)~O(n²) | O(nKd²t) |
| 고차원 | 보통 | 약함 | 보통 |
| 해석 용이성 | 높음 | 보통 | 보통 |

**언제 무엇을 쓸까?**

- **K-Means**: 빠르게 구형 클러스터를 찾고 싶을 때. 대용량 데이터의 첫 시도
- **DBSCAN/HDBSCAN**: 비구형 형태가 예상되거나, 노이즈가 많거나, 클러스터 수를 모를 때
- **GMM**: 클러스터 경계가 모호하고 확률적 해석이 필요할 때. 타원형 클러스터가 예상될 때

실전 팁을 하나 더 붙이면, 이 셋은 **상호 배타적이 아니다**. K-Means로 빠르게 데이터 구조를 파악한 뒤, DBSCAN으로 노이즈를 걸러내고, GMM으로 경계 불확실성을 분석하는 파이프라인이 가능하다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>DBSCAN</strong>: 밀도 기반. Core/Border/Noise 점으로 분류. eps와 min_samples로 제어. 비구형 클러스터와 노이즈 처리에 강하다</li>
    <li><strong>HDBSCAN</strong>: DBSCAN의 밀도 편차 문제를 해결. eps 대신 min_cluster_size만 설정. 실전 권장</li>
    <li><strong>GMM</strong>: 가우시안 혼합 모델. EM 알고리즘으로 학습. 소프트 클러스터링(확률 할당)이 핵심 장점</li>
    <li><strong>EM 알고리즘</strong>: E-step(확률 계산) → M-step(파라미터 업데이트) 반복. K-Means의 일반화</li>
    <li><strong>K-Means vs DBSCAN vs GMM</strong>: 구형/빠름 vs 임의형태/노이즈 vs 타원형/확률. 용도에 맞게 선택</li>
    <li><strong>파라미터 선택</strong>: DBSCAN → k-distance graph, GMM → BIC/AIC</li>
  </ul>
</div>

---

## 마치며

결국 클러스터링 알고리즘을 고르는 건 "데이터에 대한 가정"을 고르는 것이다. K-Means는 "클러스터가 동그랗고 크기가 비슷하다"고 가정한다. DBSCAN은 "밀도가 높은 곳이 클러스터다"라고 본다. GMM은 "데이터가 여러 가우시안의 혼합에서 나왔다"고 생각한다. 어떤 가정이 내 데이터에 맞는지 — 그 판단이 알고리즘 선택보다 중요하다.

다음 글에서는 클러스터링 결과를 눈으로 확인하는 문제를 다룬다. 피처가 수십, 수백 개인 고차원 데이터를 2D 평면에 펼치는 **[t-SNE와 UMAP](/ml/tsne-and-umap/)** 이다.

## 참고자료

- [Martin Ester et al. — A Density-Based Algorithm for Discovering Clusters (KDD 1996)](https://www.aaai.org/Papers/KDD/1996/KDD96-037.pdf)
- [Scikit-learn — DBSCAN Documentation](https://scikit-learn.org/stable/modules/clustering.html#dbscan)
- [Scikit-learn — Gaussian Mixture Models](https://scikit-learn.org/stable/modules/mixture.html)
- [Bishop — Pattern Recognition and Machine Learning, Chapter 9: Mixture Models and EM](https://www.microsoft.com/en-us/research/publication/pattern-recognition-machine-learning/)
- [HDBSCAN Documentation](https://hdbscan.readthedocs.io/en/latest/)
