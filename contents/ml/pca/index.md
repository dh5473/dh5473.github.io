---
date: '2026-02-06'
title: 'PCA(주성분 분석): 차원 축소의 수학적 원리와 실전 활용'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 37
tags: ['PCA', '주성분 분석', '차원 축소', 'Dimensionality Reduction', 'Eigendecomposition', '머신러닝']
summary: '고차원 데이터에서 정보 손실을 최소화하며 차원을 줄이는 PCA의 수학적 원리. 공분산 행렬, 고유값 분해, 설명된 분산 비율까지.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/anomaly-detection/)에서는 이상 탐지를 다뤘다. 정상 데이터의 분포를 학습하고 거기서 벗어나는 포인트를 잡아냈다. 그런데 이상 탐지든 분류든 회귀든, 피처 수가 많아지면 공통적으로 부딪히는 문제가 하나 있다 — **차원의 저주(Curse of Dimensionality)**.

[KNN](/ml/knn/)에서 이미 한 번 마주쳤다. 차원이 높아지면 모든 데이터 포인트 사이의 거리가 비슷해져서 "가장 가까운 이웃"이라는 개념 자체가 무의미해진다. 하지만 차원의 저주는 KNN만의 문제가 아니다. 고차원 공간에서는 데이터가 극도로 희소해지고, 어떤 모델이든 일반화가 어려워진다. 피처가 100개인 데이터셋을 제대로 채우려면 천문학적인 샘플이 필요하다.

해결법은 두 가지다. 하나는 [피처 선택(Feature Selection)](/ml/feature-selection/) — 불필요한 피처를 **제거**하는 것이다. 다른 하나는 **차원 축소(Dimensionality Reduction)** — 기존 피처를 **변환**해서 더 적은 수의 새로운 피처로 만드는 것이다. 피처 선택은 원래 피처 중 일부를 골라내지만, 차원 축소는 원래 피처들을 조합해 완전히 새로운 축을 만든다. **PCA(Principal Component Analysis, 주성분 분석)** 가 가장 대표적인 차원 축소 기법이다.

---

## 직관: 분산이 최대인 방향을 찾아라

PCA의 핵심 아이디어를 한 문장으로 요약하면 이렇다:

> **데이터의 분산이 가장 큰 방향으로 새 축을 잡고, 그 축으로 데이터를 사영(projection)한다.**

2차원 데이터를 1차원으로 줄이는 상황을 생각해 보자.

```
  y
  │        · ·
  │      ·  ·  ·          데이터가 대각선 방향으로 퍼져 있다.
  │    ·  ·  ·  ·
  │  ·  ·  ·
  │·  ·
  └──────────────── x
```

이 데이터를 x축으로 사영하면? y 방향의 정보가 전부 사라진다. y축으로 사영하면? x 방향의 정보가 날아간다. 둘 다 정보 손실이 크다. 하지만 데이터가 퍼져 있는 **대각선 방향**으로 사영하면? 분산을 최대한 보존하면서 차원을 줄일 수 있다.

```
  y                              PC1 (제1주성분)
  │        · ·                  ╱
  │      ·  ·  ·              ╱   데이터의 분산이 가장 큰 방향
  │    ·  ·  ·  ·           ╱
  │  ·  ·  ·              ╱
  │·  ·                 ╱
  └──────────────── x
```

이 대각선 축이 **제1주성분(PC1, First Principal Component)** 이다. PC1은 데이터의 분산을 가장 많이 설명하는 방향이다. 그 다음으로 분산이 큰 방향(PC1과 수직)이 **제2주성분(PC2)** 이다. n개의 피처가 있으면 최대 n개의 주성분이 나오는데, 각 주성분은 이전 주성분과 모두 직교(orthogonal)한다.

차원 축소의 핵심은 여기에 있다. n개의 주성분 중 **분산이 큰 상위 k개만 남기면**, 정보 손실을 최소화하면서 n차원을 k차원으로 줄일 수 있다.

---

## 수학적 원리: 4단계로 분해하기

PCA의 수학을 단계별로 풀어보자. 선형대수가 핵심이지만, 각 단계가 "왜 필요한지"에 초점을 맞추면 어렵지 않다.

### 1단계: 데이터 센터링 (Mean Centering)

원본 데이터에서 각 피처의 평균을 빼서 중심을 원점으로 옮긴다.

> **X_centered = X - mean(X)**

왜 필요한가? 공분산 행렬을 계산할 때 평균이 0이어야 공식이 깔끔해진다. 또한, 사영 방향을 찾을 때 데이터의 "퍼진 정도"만 봐야 하는데, 평균이 0이 아니면 데이터의 위치(평균)와 퍼진 정도(분산)가 뒤섞인다.

### 2단계: 공분산 행렬 계산

센터링된 데이터로 공분산 행렬을 구한다.

> **C = (1 / (n - 1)) * X_centered^T * X_centered**

여기서 n은 샘플 수, X_centered는 (n x d) 행렬이다. 결과는 (d x d) 정방행렬로, **피처 간의 상관관계**를 담고 있다.

```
공분산 행렬 C (피처가 3개인 경우):

         x1      x2      x3
  x1 [ var(x1)   cov12   cov13 ]
  x2 [ cov21    var(x2)  cov23 ]
  x3 [ cov31    cov32   var(x3) ]

대각선: 각 피처의 분산
비대각선: 두 피처 간의 공분산 (상관 정도)
```

공분산이 크다는 건 두 피처가 함께 변한다는 뜻이다. PCA는 이 공분산 구조를 분석해서, 피처들이 함께 변하는 "주된 방향"을 찾아낸다.

### 3단계: 고유값 분해 (Eigendecomposition)

공분산 행렬 C를 고유값 분해한다.

> **C * v = lambda * v**

여기서 v는 **고유벡터(eigenvector)**, lambda는 **고유값(eigenvalue)** 이다.

- **고유벡터**: 데이터의 분산이 큰 방향. 각 고유벡터가 하나의 주성분 축이 된다
- **고유값**: 해당 방향의 분산 크기. 고유값이 클수록 그 방향으로 데이터가 많이 퍼져 있다

공분산 행렬은 대칭 양(반)정치 행렬이므로, 고유벡터들은 항상 서로 직교하고, 고유값은 모두 0 이상이다. 이 성질 덕분에 PCA의 주성분들은 자연스럽게 직교 좌표계를 형성한다.

```
고유값 분해 결과 (피처 3개):

고유값:   lambda1 = 5.2,  lambda2 = 1.8,  lambda3 = 0.3
고유벡터: v1 = [0.6, 0.7, 0.3]  ← PC1 (분산 5.2)
          v2 = [-0.5, 0.3, 0.8] ← PC2 (분산 1.8)
          v3 = [0.6, -0.6, 0.5] ← PC3 (분산 0.3)

→ 상위 2개 주성분(PC1, PC2)만 사용하면 분산의 (5.2+1.8)/(5.2+1.8+0.3) = 95.9% 보존
```

### 4단계: 주성분으로 사영 (Projection)

고유값을 내림차순으로 정렬하고, 상위 k개의 고유벡터를 선택해서 사영 행렬 W를 만든다.

> **W = [v1 | v2 | ... | vk]**  (d x k 행렬)
>
> **X_pca = X_centered * W**  (n x k 행렬)

원래 d차원이던 데이터가 k차원으로 변환됐다. 각 새로운 축(PC1, PC2, ...)은 원래 피처들의 선형 조합이다.

---

## NumPy로 직접 구현하기

수학을 코드로 옮겨보자. sklearn 없이 NumPy만으로 PCA를 구현한다.

```python
import numpy as np

# 1. 샘플 데이터 생성 (2D, 상관관계 있는 데이터)
np.random.seed(42)
mean = [3, 7]
cov = [[2.5, 1.8],
       [1.8, 1.5]]
X = np.random.multivariate_normal(mean, cov, size=200)

print(f"원본 데이터 shape: {X.shape}")  # (200, 2)

# 2단계: 센터링
X_centered = X - X.mean(axis=0)

# 3단계: 공분산 행렬
C = np.cov(X_centered, rowvar=False)
print(f"\n공분산 행렬:\n{C}")

# 4단계: 고유값 분해
eigenvalues, eigenvectors = np.linalg.eigh(C)

# eigh는 오름차순으로 반환하므로, 내림차순 정렬
idx = np.argsort(eigenvalues)[::-1]
eigenvalues = eigenvalues[idx]
eigenvectors = eigenvectors[:, idx]

print(f"\n고유값: {eigenvalues}")
print(f"고유벡터:\n{eigenvectors}")

# 5단계: 상위 k개 주성분으로 사영
k = 1
W = eigenvectors[:, :k]
X_pca = X_centered @ W

print(f"\nPCA 변환 후 shape: {X_pca.shape}")  # (200, 1)

# 설명된 분산 비율
explained_ratio = eigenvalues / eigenvalues.sum()
print(f"\n각 주성분의 설명된 분산 비율: {explained_ratio}")
print(f"PC1만으로 설명되는 분산: {explained_ratio[0]:.1%}")
```

```
원본 데이터 shape: (200, 2)

공분산 행렬:
[[2.42 1.73]
 [1.73 1.46]]

고유값: [3.68 0.20]
고유벡터:
[[ 0.79  0.61]
 [ 0.61 -0.79]]

PCA 변환 후 shape: (200, 1)

각 주성분의 설명된 분산 비율: [0.95 0.05]
PC1만으로 설명되는 분산: 94.9%
```

2차원 데이터에서 PC1 하나만으로 분산의 약 95%를 설명한다. 두 피처 사이의 높은 상관관계(공분산 1.73)가 하나의 주성분으로 압축된 것이다. 이것이 PCA의 힘이다 — 상관된 피처들을 독립적인 소수의 축으로 재구성한다.

---

## 설명된 분산 비율: 몇 개의 주성분을 남길 것인가

PCA에서 가장 실전적인 질문이다. 주성분을 너무 많이 남기면 차원 축소의 의미가 없고, 너무 적게 남기면 정보 손실이 크다. 판단 기준은 **설명된 분산 비율(Explained Variance Ratio)** 이다.

> **설명된 분산 비율 = lambda_i / sum(lambda)**

각 주성분이 전체 분산의 몇 퍼센트를 설명하는지를 나타낸다. **누적 설명 분산 비율**이 특정 임계값(보통 95%)을 넘는 지점에서 주성분 수를 결정하는 것이 일반적인 규칙이다.

```
95% 규칙 예시 (피처 10개):

주성분  고유값   개별 비율   누적 비율
PC1     4.20    42.0%      42.0%
PC2     2.10    21.0%      63.0%
PC3     1.30    13.0%      76.0%
PC4     0.80     8.0%      84.0%
PC5     0.60     6.0%      90.0%
PC6     0.40     4.0%      94.0%
PC7     0.25     2.5%      96.5%  ← 여기서 95% 돌파 → k=7
PC8     0.15     1.5%      98.0%
PC9     0.12     1.2%      99.2%
PC10    0.08     0.8%     100.0%

→ 10차원 → 7차원으로 축소 (분산 96.5% 보존)
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>95% 규칙이 절대적인 건 아니다.</strong><br>
  탐색적 분석이나 시각화 목적이면 2~3개의 주성분만 써도 충분하다. 반대로 모델 성능이 중요한 경우에는 99%까지 보존하는 게 나을 수 있다. 목적에 따라 유연하게 결정하자.
</div>

---

## Scree Plot: 시각적으로 주성분 수 결정하기

Scree Plot은 주성분 번호를 x축, 고유값(또는 설명된 분산 비율)을 y축에 놓은 그래프다. 고유값이 급격히 떨어지다가 **평탄해지는 지점(elbow)** 에서 주성분 수를 결정한다.

```python
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

# 유방암 데이터 (30개 피처)
data = load_breast_cancer()
X_scaled = StandardScaler().fit_transform(data.data)

# 전체 주성분으로 PCA
pca_full = PCA().fit(X_scaled)
explained = pca_full.explained_variance_ratio_
cumulative = np.cumsum(explained)

# Scree Plot + 누적 분산 비율
fig, ax1 = plt.subplots(figsize=(10, 5))

ax1.bar(range(1, len(explained) + 1), explained, alpha=0.6, label='Individual')
ax1.set_xlabel('Principal Component')
ax1.set_ylabel('Explained Variance Ratio')

ax2 = ax1.twinx()
ax2.plot(range(1, len(cumulative) + 1), cumulative, 'ro-', label='Cumulative')
ax2.axhline(y=0.95, color='gray', linestyle='--', label='95% threshold')
ax2.set_ylabel('Cumulative Explained Variance')

# 95% 도달 지점
n_95 = np.argmax(cumulative >= 0.95) + 1
ax2.axvline(x=n_95, color='blue', linestyle=':', alpha=0.7)
ax2.annotate(f'n={n_95}', xy=(n_95, 0.95), fontsize=12)

plt.title('Scree Plot - Breast Cancer Dataset')
plt.tight_layout()
plt.show()

print(f"95% 분산 보존에 필요한 주성분 수: {n_95} / {X_scaled.shape[1]}")
```

```
95% 분산 보존에 필요한 주성분 수: 10 / 30
```

30개 피처를 10개 주성분으로 줄여도 정보의 95%가 보존된다. 20개의 차원이 사실상 "중복"이었다는 뜻이다. 고차원 현실 데이터에서 이런 일은 매우 흔하다 — 피처들 사이의 상관관계가 높기 때문이다.

---

## sklearn PCA: 유방암 데이터 실전

이제 sklearn의 `PCA`를 사용해 실제 데이터에 적용해 보자. 유방암 데이터셋(30개 피처)을 PCA로 축소하고, 분류 성능을 비교한다.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
import numpy as np

data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42
)

# 원본 (30차원) vs PCA (10차원)
pipe_original = Pipeline([
    ('scaler', StandardScaler()),
    ('lr', LogisticRegression(max_iter=1000, random_state=42))
])

pipe_pca = Pipeline([
    ('scaler', StandardScaler()),
    ('pca', PCA(n_components=10)),
    ('lr', LogisticRegression(max_iter=1000, random_state=42))
])

# 5-Fold CV
scores_orig = cross_val_score(pipe_original, X_train, y_train, cv=5, scoring='accuracy')
scores_pca = cross_val_score(pipe_pca, X_train, y_train, cv=5, scoring='accuracy')

print(f"원본 (30D):  {scores_orig.mean():.4f} (+/- {scores_orig.std():.4f})")
print(f"PCA (10D):   {scores_pca.mean():.4f} (+/- {scores_pca.std():.4f})")
```

```
원본 (30D):  0.9758 (+/- 0.0125)
PCA (10D):   0.9714 (+/- 0.0172)
```

30차원을 10차원으로 줄였는데, 성능 차이가 0.4%p에 불과하다. 차원이 1/3로 줄었으니 학습과 예측 속도는 빨라지고, 과적합 위험도 줄어든다. 피처가 수백, 수천 개인 데이터셋에서는 이 차이가 훨씬 극적이다.

<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>PCA 전에 스케일링은 필수다.</strong><br>
  PCA는 분산이 큰 방향을 찾는다. 피처 간 스케일이 다르면(예: 키는 cm, 몸무게는 kg), 단위가 큰 피처가 분산을 지배해서 PCA 결과가 왜곡된다. StandardScaler로 스케일링한 후 PCA를 적용하는 것이 표준 파이프라인이다. <a href="/ml/feature-scaling/">피처 스케일링</a>에서 다뤘던 것과 같은 맥락이다.
</div>

---

## PCA로 고차원 데이터 시각화하기

PCA의 가장 직관적인 활용은 **시각화**다. 사람은 2D/3D까지만 볼 수 있으니, 고차원 데이터를 2개의 주성분으로 사영하면 데이터의 구조를 눈으로 확인할 수 있다.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt

data = load_breast_cancer()
X_scaled = StandardScaler().fit_transform(data.data)

# 2D PCA
pca_2d = PCA(n_components=2)
X_2d = pca_2d.fit_transform(X_scaled)

plt.figure(figsize=(8, 6))
scatter = plt.scatter(X_2d[:, 0], X_2d[:, 1],
                      c=data.target, cmap='coolwarm', alpha=0.7, edgecolors='k', s=40)
plt.xlabel(f'PC1 ({pca_2d.explained_variance_ratio_[0]:.1%})')
plt.ylabel(f'PC2 ({pca_2d.explained_variance_ratio_[1]:.1%})')
plt.title('Breast Cancer - PCA 2D Projection')
plt.colorbar(scatter, label='0: Malignant, 1: Benign')
plt.tight_layout()
plt.show()

print(f"2개 주성분으로 설명되는 분산: {sum(pca_2d.explained_variance_ratio_):.1%}")
```

```
2개 주성분으로 설명되는 분산: 63.2%
```

30차원 데이터를 2차원으로 줄였는데도, 악성(0)과 양성(1) 군집이 꽤 잘 분리된다. PC1 축 하나만으로도 어느 정도 구분이 가능하다. 2개 주성분이 전체 분산의 63%를 설명하니, 데이터의 주요 패턴은 이 2차원 평면에 담겨 있는 셈이다.

3D로 확장하면 더 많은 구조를 볼 수 있다.

```python
from mpl_toolkits.mplot3d import Axes3D

pca_3d = PCA(n_components=3)
X_3d = pca_3d.fit_transform(X_scaled)

fig = plt.figure(figsize=(10, 7))
ax = fig.add_subplot(111, projection='3d')
scatter = ax.scatter(X_3d[:, 0], X_3d[:, 1], X_3d[:, 2],
                     c=data.target, cmap='coolwarm', alpha=0.6, s=30)
ax.set_xlabel(f'PC1 ({pca_3d.explained_variance_ratio_[0]:.1%})')
ax.set_ylabel(f'PC2 ({pca_3d.explained_variance_ratio_[1]:.1%})')
ax.set_zlabel(f'PC3 ({pca_3d.explained_variance_ratio_[2]:.1%})')
ax.set_title('Breast Cancer - PCA 3D Projection')
plt.tight_layout()
plt.show()

total_3d = sum(pca_3d.explained_variance_ratio_)
print(f"3개 주성분으로 설명되는 분산: {total_3d:.1%}")
```

```
3개 주성분으로 설명되는 분산: 72.6%
```

---

## PCA가 실패하는 경우: 비선형 구조

PCA는 **선형** 변환이다. 데이터의 분산이 가장 큰 **직선** 방향을 찾는다. 이 말은, 데이터의 구조가 비선형이면 PCA가 무력해진다는 뜻이다.

대표적인 예가 **Swiss Roll** 데이터다.

```python
from sklearn.datasets import make_swiss_roll

X_swiss, color = make_swiss_roll(n_samples=1500, noise=0.5, random_state=42)

# PCA 2D 사영
pca_swiss = PCA(n_components=2)
X_swiss_pca = pca_swiss.fit_transform(X_swiss)

fig = plt.figure(figsize=(14, 5))

# 원본 3D
ax1 = fig.add_subplot(121, projection='3d')
ax1.scatter(X_swiss[:, 0], X_swiss[:, 1], X_swiss[:, 2],
            c=color, cmap='Spectral', s=10)
ax1.set_title('Swiss Roll (3D)')

# PCA 2D
ax2 = fig.add_subplot(122)
ax2.scatter(X_swiss_pca[:, 0], X_swiss_pca[:, 1],
            c=color, cmap='Spectral', s=10)
ax2.set_title('PCA 2D Projection')
ax2.set_xlabel('PC1')
ax2.set_ylabel('PC2')

plt.tight_layout()
plt.show()
```

Swiss Roll은 3차원에서 돌돌 말려 있는 2차원 매니폴드다. PCA로 2차원에 사영하면, 말려 있는 구조가 그대로 겹쳐서 찌그러진다. 색상(본래의 위치)이 뒤섞여 의미 없는 결과가 나온다. PCA는 **직선 방향**의 분산만 보기 때문에, 곡면을 따라 "펼치는" 것은 불가능하다.

```
PCA가 잘 작동하는 경우 vs 실패하는 경우:

잘 작동                         실패
─────────                      ─────────
· 피처 간 선형 상관관계          · 비선형 매니폴드 (Swiss Roll)
· 가우시안 분포 데이터           · 원형/나선형 구조
· 고차원 정형 데이터             · 이미지의 의미적 구조
```

---

## Kernel PCA: 비선형 차원 축소

PCA가 비선형 구조를 못 잡는다면, [SVM](/ml/svm/)에서 배운 **커널 트릭**을 떠올려 보자. 데이터를 고차원 공간으로 매핑한 후 거기서 PCA를 수행하면, 원래 공간에서의 비선형 구조를 잡을 수 있다. 이것이 **Kernel PCA**다.

```python
from sklearn.decomposition import KernelPCA

# RBF 커널 PCA
kpca = KernelPCA(n_components=2, kernel='rbf', gamma=0.01)
X_swiss_kpca = kpca.fit_transform(X_swiss)

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

axes[0].scatter(X_swiss_pca[:, 0], X_swiss_pca[:, 1],
                c=color, cmap='Spectral', s=10)
axes[0].set_title('Linear PCA')

axes[1].scatter(X_swiss_kpca[:, 0], X_swiss_kpca[:, 1],
                c=color, cmap='Spectral', s=10)
axes[1].set_title('Kernel PCA (RBF)')

plt.tight_layout()
plt.show()
```

Kernel PCA는 Swiss Roll을 훨씬 잘 "펼친다". 색상 순서가 보존되면서 2차원으로 매핑된다. 다만 Kernel PCA는 일반 PCA보다 계산 비용이 훨씬 크고(커널 행렬이 n x n), gamma 같은 하이퍼파라미터 튜닝이 필요하다. 정형 데이터에서는 일반 PCA가 충분한 경우가 대부분이고, 비선형 차원 축소가 꼭 필요한 경우에만 Kernel PCA나 t-SNE, UMAP 같은 기법을 검토한다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>PCA vs t-SNE vs UMAP</strong><br>
  <ul style="margin: 8px 0; padding-left: 20px;">
    <li><strong>PCA</strong>: 선형, 빠름, 해석 가능, 전처리/차원 축소 용도</li>
    <li><strong>t-SNE</strong>: 비선형, 시각화 전용 (역변환 불가), 느림</li>
    <li><strong>UMAP</strong>: 비선형, 시각화 + 일부 전처리, t-SNE보다 빠름</li>
  </ul>
  시각화 목적이면 t-SNE/UMAP이 보통 더 좋은 결과를 주지만, 모델 파이프라인에 차원 축소를 넣을 때는 PCA가 표준이다.
</div>

---

## PCA를 전처리로: 차원 축소 후 모델 학습

PCA의 가장 실전적인 용도는 **모델 학습 전 전처리**다. 피처 수를 줄여서 학습 속도를 높이고, 다중공선성을 제거하고, [과적합](/ml/bias-variance/)을 억제한다.

```
전형적인 PCA 파이프라인:

원본 데이터 (d 피처)
    ↓
StandardScaler (필수)
    ↓
PCA (d → k 피처)
    ↓
분류기/회귀 모델
    ↓
예측
```

PCA는 스케일링에 민감하므로 반드시 `StandardScaler` 뒤에 와야 한다. 그리고 PCA로 변환된 피처는 원래 피처와 의미가 다르다 — PC1이 "키"나 "몸무게"가 아니라 "피처들의 선형 조합"이 되므로 해석성은 떨어진다. 이것이 [피처 선택](/ml/feature-selection/)과의 핵심 차이다. 피처 선택은 원래 피처를 유지하므로 해석이 가능하지만, PCA는 새로운 축을 만들므로 해석이 어렵다.

| 관점 | 피처 선택 | PCA |
|------|----------|-----|
| 변환 방식 | 부분 집합 선택 | 선형 조합으로 새 축 생성 |
| 해석성 | 원래 피처 유지 → 높음 | 새 축 = 피처 조합 → 낮음 |
| 정보 보존 | 제거된 피처의 정보 손실 | 분산 기준 최적 보존 |
| 다중공선성 | 상관 피처 제거로 해소 가능 | 직교 변환으로 완전 제거 |
| 적합 상황 | 해석이 중요한 도메인 | 성능/속도 최적화 |

---

## 실전 파이프라인: PCA + 분류기 + 교차 검증

PCA를 포함한 전체 파이프라인을 구성하고, 주성분 수에 따른 성능 변화를 체계적으로 비교해 보자.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
import numpy as np

# 데이터 준비
data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42
)

# 주성분 수별 성능 비교
n_components_list = [2, 5, 10, 15, 20, 30]  # 30 = 원본 차원

print("=" * 55)
print(f"{'Components':>12} {'LR Accuracy':>14} {'RF Accuracy':>14}")
print("=" * 55)

for n in n_components_list:
    if n >= X_train.shape[1]:
        # PCA 없이 원본 사용
        pipe_lr = Pipeline([
            ('scaler', StandardScaler()),
            ('lr', LogisticRegression(max_iter=1000, random_state=42))
        ])
        pipe_rf = Pipeline([
            ('scaler', StandardScaler()),
            ('rf', RandomForestClassifier(n_estimators=100, random_state=42))
        ])
        label = "원본(30)"
    else:
        pipe_lr = Pipeline([
            ('scaler', StandardScaler()),
            ('pca', PCA(n_components=n)),
            ('lr', LogisticRegression(max_iter=1000, random_state=42))
        ])
        pipe_rf = Pipeline([
            ('scaler', StandardScaler()),
            ('pca', PCA(n_components=n)),
            ('rf', RandomForestClassifier(n_estimators=100, random_state=42))
        ])
        label = str(n)

    lr_scores = cross_val_score(pipe_lr, X_train, y_train, cv=5, scoring='accuracy')
    rf_scores = cross_val_score(pipe_rf, X_train, y_train, cv=5, scoring='accuracy')
    print(f"{label:>12} {lr_scores.mean():>11.4f}    {rf_scores.mean():>11.4f}")

print("=" * 55)
```

```
=======================================================
  Components    LR Accuracy    RF Accuracy
=======================================================
           2         0.9516         0.9384
           5         0.9670         0.9538
          10         0.9714         0.9582
          15         0.9736         0.9626
          20         0.9758         0.9626
      원본(30)       0.9758         0.9648
=======================================================
```

몇 가지 패턴이 보인다.

- **로지스틱 회귀**: 주성분 10개에서 이미 원본(30개)과 거의 같은 성능이다. 선형 모델은 PCA와 궁합이 잘 맞는다 — 둘 다 선형이기 때문이다
- **랜덤 포레스트**: PCA로 차원을 줄이면 성능이 약간 떨어진다. 트리 기반 모델은 피처 간 상호작용을 자체적으로 잡아내고, 불필요한 피처를 무시할 수 있기 때문에 PCA의 이점이 상대적으로 적다
- **주성분 2개**: 시각화에는 충분하지만, 분류 성능은 눈에 띄게 떨어진다

<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>PCA는 언제 써야 하는가?</strong><br>
  <ul style="margin: 8px 0; padding-left: 20px;">
    <li>피처가 매우 많을 때 (수백~수천 이상)</li>
    <li>피처 간 상관관계가 높을 때 (다중공선성)</li>
    <li>학습 속도가 중요할 때</li>
    <li>시각화가 필요할 때</li>
    <li>과적합을 줄이고 싶을 때</li>
  </ul>
  반대로, 피처 수가 적거나 트리 기반 모델을 사용할 때는 PCA 없이도 충분한 경우가 많다.
</div>

이제 최종 파이프라인으로, 주성분 수 자체를 하이퍼파라미터로 취급해서 [교차 검증](/ml/cross-validation/)으로 최적화해 보자.

```python
from sklearn.model_selection import GridSearchCV

# PCA 주성분 수를 하이퍼파라미터로 튜닝
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('pca', PCA()),
    ('lr', LogisticRegression(max_iter=1000, random_state=42))
])

param_grid = {
    'pca__n_components': [2, 5, 7, 10, 15, 20, 25]
}

grid = GridSearchCV(pipe, param_grid, cv=5, scoring='accuracy', return_train_score=True)
grid.fit(X_train, y_train)

print(f"최적 주성분 수: {grid.best_params_['pca__n_components']}")
print(f"최적 CV 정확도: {grid.best_score_:.4f}")
print(f"테스트 정확도:  {grid.score(X_test, y_test):.4f}")

# 결과 상세
results = grid.cv_results_
for i, n in enumerate(param_grid['pca__n_components']):
    print(f"  n={n:2d}  train={results['mean_train_score'][i]:.4f}  "
          f"val={results['mean_test_score'][i]:.4f}")
```

```
최적 주성분 수: 10
최적 CV 정확도: 0.9714
테스트 정확도:  0.9825

  n= 2  train=0.9648  val=0.9516
  n= 5  train=0.9758  val=0.9670
  n= 7  train=0.9802  val=0.9692
  n=10  train=0.9846  val=0.9714
  n=15  train=0.9890  val=0.9736
  n=20  train=0.9912  val=0.9758
  n=25  train=0.9934  val=0.9758
```

주성분 10개 이후로 검증 성능이 거의 정체되는 반면, 훈련 성능은 계속 올라간다. 이것은 [편향-분산 트레이드오프](/ml/bias-variance/)의 전형적인 패턴이다. 주성분이 적으면 편향이 높고(과소적합), 많으면 분산이 높아질 수 있다(과적합). 10개가 이 데이터셋에서의 적절한 균형점이다.

[경사 하강법](/ml/gradient-descent/)의 관점에서도, 차원이 줄면 파라미터 공간이 작아져서 최적화가 더 빠르고 안정적이 된다. 특히 피처가 수천 개인 텍스트 데이터나 유전체 데이터에서는 PCA 전처리가 학습 시간을 극적으로 단축한다.

---

## 정리

PCA의 전체 흐름을 다시 한번 정리하자.

```
1. 스케일링 (StandardScaler)
   → 피처 간 스케일 차이 제거

2. 센터링 (PCA 내부에서 자동)
   → 평균을 0으로

3. 공분산 행렬 계산
   → 피처 간 상관관계 포착

4. 고유값 분해
   → 분산이 큰 방향(주성분) 추출

5. 상위 k개 주성분 선택
   → 설명된 분산 비율 / Scree Plot으로 결정

6. 데이터 사영
   → d차원 → k차원 변환

7. 변환된 데이터로 모델 학습
```

| 개념 | 핵심 |
|------|------|
| PCA의 목표 | 분산을 최대 보존하며 차원 축소 |
| 주성분 | 분산이 큰 방향의 직교 축들 |
| 고유값 | 각 주성분이 설명하는 분산의 크기 |
| 고유벡터 | 각 주성분의 방향 |
| 설명된 분산 비율 | 주성분 선택 기준 (보통 95%) |
| 스케일링 | PCA 전 StandardScaler 필수 |
| 한계 | 선형 구조만 포착 (비선형 → Kernel PCA) |

PCA의 매력은 "가장 중요한 방향부터 순서대로 뽑아준다"는 데 있다. 이 단순한 원리 하나로 시각화, 전처리, 노이즈 제거, 속도 개선까지 다양한 문제를 풀 수 있다. 물론 한계도 있다. 직선 방향의 분산만 보기 때문에 Swiss Roll 같은 비선형 구조는 잡지 못하고, 새로운 축의 의미를 해석하기도 쉽지 않다. PCA가 답이 아닌 상황을 아는 것도 PCA를 잘 쓰는 능력이다.

---

다음 글에서는 **[DBSCAN과 GMM](/ml/dbscan-and-gmm/)** 을 다룬다. K-Means가 원형 군집만 잡아내는 한계를 넘어서, 밀도 기반 클러스터링(DBSCAN)과 확률적 클러스터링(GMM)으로 복잡한 형태의 군집을 발견하는 방법을 정리한다.
