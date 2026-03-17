---
date: '2026-02-08'
title: 't-SNE와 UMAP: 고차원 데이터 시각화 기법 비교'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 39
tags: ['t-SNE', 'UMAP', '시각화', '차원 축소', '고차원 데이터', '머신러닝']
summary: '고차원 데이터의 구조를 2D로 시각화하는 t-SNE와 UMAP. 각각의 원리, 하이퍼파라미터, 장단점을 비교하고 실전에서 올바르게 사용하는 법.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/dbscan-and-gmm/)에서 DBSCAN과 GMM을 다뤘다. 밀도 기반 클러스터링과 확률 기반 클러스터링 — 데이터의 구조를 파악하는 비지도학습의 핵심 도구들이었다. 그런데 클러스터링 결과를 눈으로 확인하려면 어떻게 해야 할까? 피처가 2~3개라면 산점도를 그리면 된다. 하지만 현실의 데이터는 수십, 수백 차원이다. 사람의 눈으로는 3차원까지가 한계다.

[PCA 글](/ml/pca/)에서 차원 축소를 처음 다뤘다. 공분산 행렬의 고유벡터를 이용해 분산이 최대인 축을 찾고, 그 축으로 데이터를 투영하는 방식이었다. PCA는 강력하지만 **선형 변환**이라는 근본적 한계가 있다. 데이터가 곡면 위에 분포하거나, 비선형 구조를 가지면 PCA 2D 투영으로는 클러스터 구조가 뭉개진다.

이 문제를 해결하는 두 가지 비선형 차원 축소 기법이 있다. **t-SNE**와 **UMAP** — 고차원 데이터의 이웃 관계를 보존하면서 2D 평면에 펼치는 알고리즘이다. ML 시리즈의 마지막 글에서, 이 두 기법의 원리와 실전 사용법을 비교하고 39편의 여정을 마무리한다.

---

## t-SNE: 확률적 이웃 임베딩

**t-SNE(t-distributed Stochastic Neighbor Embedding)** 는 Laurens van der Maaten과 Geoffrey Hinton이 2008년에 제안한 비선형 차원 축소 알고리즘이다. 핵심 아이디어는 단순하다 — **고차원에서 가까운 점들은 저차원에서도 가까워야 한다.**

### 1단계: 고차원 유사도 계산

고차원 공간에서 데이터 포인트 xi와 xj 사이의 유사도를 조건부 확률로 정의한다.

```
p(j|i) = exp(-||xi - xj||^2 / 2*sigma_i^2) / sum_k!=i exp(-||xi - xk||^2 / 2*sigma_i^2)
```

xi를 중심으로 가우시안 분포를 씌운다. xj가 xi에 가까울수록 확률이 높고, 멀수록 확률이 낮다. sigma_i는 xi 주변의 밀도에 따라 달라지는데, 이것을 결정하는 것이 **Perplexity** 하이퍼파라미터다.

대칭화를 위해 결합 확률로 변환한다.

```
pij = (p(j|i) + p(i|j)) / (2 * n)
```

### 2단계: 저차원 유사도 계산

여기가 t-SNE의 핵심이다. 저차원 공간에서는 가우시안 대신 **t-분포(자유도 1, 즉 코시 분포)** 를 사용한다.

```
qij = (1 + ||yi - yj||^2)^(-1) / sum_k!=l (1 + ||yk - yl||^2)^(-1)
```

yi, yj는 저차원(2D)에 매핑된 점이다.

### 왜 t-분포인가? — 밀집(Crowding) 문제

고차원 공간은 넓다. 100차원에서 한 점 주위에 적당한 거리로 이웃이 분포할 수 있다. 그런데 이것을 2D로 압축하면 공간이 부족하다. 적당히 떨어져 있던 이웃들이 한 곳에 뭉쳐버린다 — 이것이 **crowding problem**이다.

t-분포는 가우시안보다 꼬리가 두껍다(heavy-tailed). 저차원에서 중간 거리의 점들에게 "더 멀리 가도 괜찮다"는 여유를 준다. 가까운 점은 여전히 가깝게, 하지만 먼 점은 더 멀리 — 이 비대칭적 스케일링 덕분에 클러스터 구조가 선명하게 드러난다.

### 3단계: KL 발산 최적화

고차원 확률 분포 P와 저차원 확률 분포 Q의 차이를 **KL 발산(Kullback-Leibler Divergence)** 으로 측정하고, 이것을 최소화한다.

```
KL(P||Q) = sum_i sum_j pij * log(pij / qij)
```

경사하강법으로 저차원 좌표 yi를 반복적으로 업데이트한다. pij가 크지만 qij가 작은 쌍(고차원에서 가깝지만 저차원에서 먼 점들)에 강한 인력이 작용한다. 반대의 경우(고차원에서 멀지만 저차원에서 가까운 점들)는 밀어낸다.

### Perplexity: 이웃 범위 조절

Perplexity는 "각 점이 몇 개의 유효한 이웃을 가지는가"를 조절한다. 보통 5~50 사이 값을 사용한다.

- **Perplexity가 낮으면**: 아주 가까운 이웃만 본다. 작은 클러스터가 많이 생기고, 노이즈에 민감하다.
- **Perplexity가 높으면**: 넓은 범위의 이웃을 고려한다. 큰 구조가 드러나지만, 세부 구조가 뭉개질 수 있다.

경험적으로 데이터 크기의 1/3~1/5 정도가 적당하다고 알려져 있지만, 정답은 없다. **여러 값을 시도해보는 것**이 최선이다.

---

## t-SNE 실전 사용 시 주의점

t-SNE는 강력하지만, 잘못 쓰면 오해를 낳는다. 몇 가지 중요한 규칙이 있다.

**1. 시각화 전용이다.** t-SNE로 축소한 좌표를 다른 모델의 피처로 쓰면 안 된다. 매번 실행할 때마다 결과가 달라지고, 새 데이터에 대한 transform 메서드가 없다(sklearn 구현에서는 fit_transform만 존재).

**2. 여러 번 실행해야 한다.** 초기값에 따라 결과가 달라진다. 같은 데이터로 3~5번 돌려서, 일관되게 나타나는 구조만 신뢰해야 한다.

**3. 스케일링은 필수다.** [KNN 글](/ml/knn/)에서 다뤘듯이, 거리 기반 알고리즘은 피처 스케일에 민감하다. t-SNE도 마찬가지다. StandardScaler를 먼저 적용하자.

**4. 클러스터 간 거리를 해석하지 말라.** t-SNE 결과에서 클러스터 A와 B가 멀리 떨어져 있다고 해서, 원본 공간에서도 멀다는 뜻이 아니다. t-SNE는 **지역(local) 구조 보존**에 최적화되어 있고, 전역(global) 거리는 보존하지 않는다.

**5. 클러스터 크기도 의미 없다.** 밀도가 다른 클러스터들이 비슷한 크기로 나타날 수 있다. t-SNE는 밀도 정보를 왜곡한다.

---

## t-SNE 실전 예제: MNIST 숫자 데이터

```python
from sklearn.datasets import load_digits
from sklearn.preprocessing import StandardScaler
from sklearn.manifold import TSNE
import matplotlib.pyplot as plt
import numpy as np

# 데이터 로드 (8x8 이미지, 64차원)
digits = load_digits()
X, y = digits.data, digits.target

# 스케일링
X_scaled = StandardScaler().fit_transform(X)

# t-SNE 적용
tsne = TSNE(
    n_components=2,
    perplexity=30,        # 이웃 범위
    learning_rate='auto',  # sklearn >= 1.2 권장
    init='pca',           # PCA 초기화로 안정성 향상
    random_state=42,
    n_iter=1000
)
X_tsne = tsne.fit_transform(X_scaled)

# 시각화
plt.figure(figsize=(10, 8))
scatter = plt.scatter(
    X_tsne[:, 0], X_tsne[:, 1],
    c=y, cmap='tab10', s=10, alpha=0.7
)
plt.colorbar(scatter, label='Digit')
plt.title('t-SNE on MNIST Digits (perplexity=30)')
plt.xlabel('t-SNE 1')
plt.ylabel('t-SNE 2')
plt.tight_layout()
plt.show()
```

64차원 데이터가 2D 평면에 깔끔하게 10개 클러스터로 나뉜다. 0~9 각 숫자가 자기들끼리 뭉친다. 일부 숫자(예: 4와 9, 3과 8)는 약간 겹치는데, 이는 원본 공간에서도 유사한 형태를 가지기 때문이다.

`init='pca'`로 초기화하면 PCA 결과를 출발점으로 쓰기 때문에 매번 실행할 때마다 결과가 크게 달라지지 않는다. `random_state`와 함께 사용하면 재현성을 확보할 수 있다.

---

## UMAP: 균일 다양체 근사와 투영

**UMAP(Uniform Manifold Approximation and Projection)** 은 Leland McInnes가 2018년에 발표한 알고리즘이다. t-SNE의 후속주자로, 더 빠르고 전역 구조를 더 잘 보존한다.

### 수학적 배경 (간소화)

UMAP은 **위상수학(topology)** 에 기반한다. 핵심 가정은 두 가지다.

1. **데이터는 고차원 공간에 균일하게 분포한 다양체(manifold) 위에 놓여 있다.**
2. **이 다양체의 리만 메트릭은 국소적으로 일정하다.**

이 가정 아래서 UMAP은 다음 과정을 거친다.

**1단계: 가중 k-근접 이웃 그래프 구성.** 각 점에서 가장 가까운 n_neighbors개의 이웃을 찾고, 거리에 기반한 가중치를 부여한다. 이때 각 점의 로컬 거리 스케일을 자동으로 조정한다 — 밀도가 낮은 영역에서는 더 먼 이웃도 "가깝다"고 간주한다.

**2단계: 퍼지 심플리셜 집합 구성.** 가중 그래프를 대칭화하고 퍼지 합집합(fuzzy union)으로 결합한다. 직관적으로, "A가 B를 이웃으로 보거나, B가 A를 이웃으로 보거나, 둘 중 하나만 성립해도 연결된 것으로 간주"하는 방식이다.

**3단계: 저차원 배치 최적화.** 저차원에서도 비슷한 가중 그래프를 만들고, 고차원 그래프와의 **교차 엔트로피(cross-entropy)** 를 최소화한다. t-SNE가 KL 발산을 쓰는 것과 유사하지만, 교차 엔트로피는 "떨어져야 할 점이 가까운 경우"도 적극적으로 벌점을 준다. 이 덕분에 전역 구조가 더 잘 보존된다.

### 핵심 하이퍼파라미터

**n_neighbors (기본값: 15)**: t-SNE의 perplexity와 비슷한 역할이다. 각 점이 몇 개의 이웃을 고려할지 결정한다.

- **작은 값 (5~10)**: 세밀한 지역 구조에 집중. 작은 클러스터가 많이 나타남.
- **큰 값 (50~200)**: 넓은 범위의 구조를 포착. 전역 구조가 더 잘 드러남.

**min_dist (기본값: 0.1)**: 저차원에서 점들이 얼마나 가까이 뭉칠 수 있는지를 결정한다.

- **0에 가까우면**: 점들이 빽빽하게 뭉친다. 클러스터 내부 구조는 잘 안 보이지만 클러스터 분리가 선명하다.
- **0.5 이상이면**: 점들이 퍼진다. 연속적인 구조(gradient)가 더 잘 드러난다.

---

## UMAP 실전 예제: 동일한 MNIST 데이터

```python
import umap  # pip install umap-learn

# UMAP 적용
reducer = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.1,
    metric='euclidean',
    random_state=42
)
X_umap = reducer.fit_transform(X_scaled)

# 시각화
plt.figure(figsize=(10, 8))
scatter = plt.scatter(
    X_umap[:, 0], X_umap[:, 1],
    c=y, cmap='tab10', s=10, alpha=0.7
)
plt.colorbar(scatter, label='Digit')
plt.title('UMAP on MNIST Digits')
plt.xlabel('UMAP 1')
plt.ylabel('UMAP 2')
plt.tight_layout()
plt.show()
```

같은 MNIST 데이터에 UMAP을 적용하면, t-SNE와 비슷하게 10개 클러스터가 나타나지만 몇 가지 차이가 있다.

- **클러스터 간 배치가 더 의미 있다.** 1과 7이 가까이, 3과 8이 가까이 위치하는 등 전역 구조가 반영된다.
- **속도가 훨씬 빠르다.** 1,797개 샘플 기준으로 체감 차이는 작지만, 수만~수십만 샘플로 가면 UMAP이 압도적으로 빠르다.
- **transform 메서드가 있다.** 새 데이터를 기존 임베딩에 투영할 수 있다. 이 점이 t-SNE와의 가장 큰 실용적 차이다.

```python
# 새 데이터 투영 (t-SNE에서는 불가능)
X_new = X_scaled[:10]  # 예시
X_new_umap = reducer.transform(X_new)
```

---

## t-SNE vs UMAP 비교

| 항목 | t-SNE | UMAP |
|------|-------|------|
| **속도** | 느림 (O(n^2), Barnes-Hut으로 O(n log n)) | 빠름 (근사 최근접 이웃 사용) |
| **전역 구조 보존** | 약함 — 지역 구조에 집중 | 상대적으로 강함 |
| **확장성** | 수만 샘플까지 실용적 | 수십만~수백만 샘플 가능 |
| **재현성** | 초기값에 민감, 매번 다른 결과 | 비교적 안정적 |
| **새 데이터 투영** | 불가 (fit_transform만) | 가능 (transform 메서드) |
| **이론적 기반** | 확률 분포 + KL 발산 | 위상수학 + 교차 엔트로피 |
| **핵심 파라미터** | perplexity, learning_rate | n_neighbors, min_dist |
| **용도** | 시각화 전용 | 시각화 + 피처 추출 가능 |

---

## PCA vs t-SNE vs UMAP: 언제 무엇을 쓸까

[PCA](/ml/pca/)는 선형 변환이고, t-SNE와 UMAP은 비선형이다. 셋의 용도가 다르다.

**PCA를 쓸 때:**
- 피처 추출, 노이즈 제거, 전처리 — [피처 엔지니어링](/ml/feature-engineering/) 단계에서 차원을 줄일 때.
- 분산 설명 비율(explained variance ratio)을 보고 몇 차원으로 줄일지 결정할 수 있다.
- 선형 관계가 지배적인 데이터에서 시각화 용도로도 충분하다.
- 빠르고, 결정적(deterministic)이고, 해석 가능하다.

**t-SNE를 쓸 때:**
- 고차원 데이터의 **지역 클러스터 구조**를 시각화할 때.
- 논문이나 발표에서 "클러스터가 존재한다"는 것을 보여줄 때.
- 샘플 수가 수천~수만 수준일 때.

**UMAP을 쓸 때:**
- t-SNE의 용도 전부 + 더 큰 데이터셋.
- **전역 구조**(클러스터 간 관계)도 중요할 때.
- 새 데이터를 기존 임베딩에 투영해야 할 때.
- 시각화뿐 아니라 다운스트림 모델의 피처로 쓸 가능성이 있을 때.

실무에서는 **UMAP이 거의 모든 면에서 t-SNE의 상위호환**이다. t-SNE를 먼저 배우는 이유는 역사적으로 더 오래되었고, UMAP의 동작 원리를 이해하는 데 기초가 되기 때문이다.

---

## 흔한 실수와 함정

### 1. t-SNE에서 클러스터 간 거리를 해석하는 실수

```
"t-SNE 결과에서 A 클러스터가 B보다 C에 더 가까우니까,
A와 C가 더 유사하다."
```

**틀렸다.** t-SNE는 지역 구조만 보존한다. 전역 거리 정보는 최적화 과정에서 왜곡된다. 클러스터 간 거리를 논하고 싶다면 UMAP을 쓰거나, PCA 결과를 함께 제시해야 한다.

### 2. Perplexity를 하나만 시도하는 실수

Perplexity 5, 30, 50으로 각각 실행해서 공통적으로 나타나는 구조만 신뢰하라. 특정 perplexity에서만 보이는 패턴은 아티팩트(artifact)일 가능성이 높다.

### 3. 스케일링을 빼먹는 실수

피처 스케일이 다르면 거리 계산이 왜곡된다. [KNN 글](/ml/knn/)에서 강조했듯이, 거리 기반 알고리즘에서 StandardScaler는 필수다.

### 4. 고차원에서 바로 t-SNE/UMAP을 적용하는 실수

피처가 수백~수천 개라면, 먼저 PCA로 50~100차원으로 줄인 뒤 t-SNE/UMAP을 적용하는 것이 좋다. 노이즈를 줄이고 속도도 빨라진다. sklearn의 t-SNE 문서에서도 이 방법을 권장한다.

```python
from sklearn.decomposition import PCA

# 고차원 데이터 → PCA 50차원 → UMAP 2차원
pca = PCA(n_components=50, random_state=42)
X_pca = pca.fit_transform(X_scaled)

reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, random_state=42)
X_final = reducer.fit_transform(X_pca)
```

### 5. 시각화 결과만 보고 클러스터링하는 실수

t-SNE/UMAP 시각화에서 클러스터가 보인다고 해서, 그것을 클러스터링 결과로 쓰면 안 된다. 시각화는 "구조가 있을 수 있다"는 힌트일 뿐이다. 실제 클러스터링은 원본 공간에서 [K-Means](/ml/kmeans-clustering/)나 DBSCAN을 적용해야 한다.

---

## ML 시리즈를 마치며: 39편의 여정 회고

이 글로 ML 시리즈 39편이 완결된다. [첫 번째 글](/ml/overview/)에서 "머신러닝이란 무엇인가"를 물었고, 39번째 글에서 고차원 데이터를 2D 평면에 펼치는 기법까지 왔다. 전체 여정을 돌아보자.

### Phase 1-2: 선형 모델의 기초

모든 것의 시작은 **선형 회귀**였다. 데이터에 직선을 긋는 가장 단순한 모델에서 출발해, 비용 함수(MSE)를 정의하고 경사하강법으로 최적화하는 기본 프레임워크를 세웠다. 다중 선형 회귀로 확장하고, 로지스틱 회귀에서 분류 문제로 넘어갔다. 결정 경계, 시그모이드 함수, 교차 엔트로피 — 이 모든 개념이 이 시기에 등장했다. 과적합을 다루면서 규제(L1/L2)를 배웠고, "모델의 복잡도를 조절한다"는 머신러닝의 핵심 철학을 처음 체감했다.

### Phase 3: 분류 알고리즘의 확장

나이브 베이즈는 확률로, [KNN](/ml/knn/)은 거리로, SVM은 마진으로 분류했다. 같은 문제를 완전히 다른 관점에서 접근할 수 있다는 것 — 이것이 머신러닝의 매력이다. 각 알고리즘의 가정과 한계를 이해하면, "이 데이터에는 어떤 알고리즘이 적합한가?"라는 질문에 답할 수 있게 된다.

### Phase 4: 트리와 앙상블

결정 트리에서 시작해, 배깅(Random Forest)과 부스팅(AdaBoost, Gradient Boosting)으로 확장했다. XGBoost와 LightGBM — 실무에서 테이블 데이터의 지배자다. "약한 모델을 합치면 강한 모델이 된다"는 앙상블의 철학은, 편향-분산 트레이드오프와 자연스럽게 연결된다.

### Phase 5: 신경망의 세계

[퍼셉트론에서 다층 신경망으로](/ml/neural-network-basics/), 순전파에서 역전파로, 시그모이드에서 ReLU로. 활성화 함수, 가중치 초기화, 배치 정규화 — 신경망을 안정적으로 학습시키기 위한 수많은 기법들을 다뤘다. SGD에서 Adam까지 옵티마이저의 진화도 따라갔다. 이 Phase는 Deep Learning 시리즈의 기초가 된다.

### Phase 6: 모델 평가와 튜닝

좋은 모델을 만드는 것만큼, 모델을 제대로 평가하는 것이 중요하다. Precision과 Recall의 트레이드오프, AUC-ROC, K-Fold 교차검증, Grid Search와 Bayesian Optimization까지. "이 모델이 정말 좋은 건지 어떻게 아는가?"라는 질문에 대한 답을 체계화했다.

### Phase 7: 피처 엔지니어링

데이터 전처리, 결측값 처리, 인코딩, 스케일링, 피처 선택 — 현실의 데이터는 지저분하다. 모델링보다 피처 엔지니어링에 시간이 더 많이 든다는 실무의 진실을 마주했다.

### Phase 8: 비지도학습과 차원 축소

레이블 없이 데이터의 구조를 파악하는 비지도학습. [K-Means](/ml/kmeans-clustering/)로 클러스터링을 시작하고, DBSCAN과 GMM으로 확장했다. 이상 탐지, PCA로 차원 축소, 그리고 이 마지막 글에서 t-SNE와 UMAP까지 — 데이터를 "이해"하는 다양한 방법을 살펴봤다.

### 다음 여정: Deep Learning

ML 시리즈는 여기서 끝나지만, 이것은 시작이다. 이 39편에서 다진 기초 위에 **Deep Learning 시리즈**가 이어진다. CNN으로 이미지를 인식하고, RNN과 LSTM으로 시퀀스를 처리하고, Transformer와 Attention으로 언어를 이해하는 — 현대 AI의 핵심 아키텍처들을 파고들 것이다.

선형 회귀의 `y = wx + b`에서 시작된 이 여정이, 결국 Transformer의 Self-Attention까지 하나의 줄기로 연결된다. 비용 함수를 정의하고, 경사하강법으로 최적화하고, 과적합을 방지하고, 일반화 성능을 높이는 — 이 기본 프레임워크는 딥러닝에서도 변하지 않는다.

39편 동안 함께해 주셔서 감사합니다.
