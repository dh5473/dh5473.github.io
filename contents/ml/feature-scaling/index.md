---
date: '2026-01-31'
title: '피처 스케일링: StandardScaler, MinMaxScaler, 언제 어떤 걸 쓸까'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 31
tags: ['Feature Scaling', '피처 스케일링', 'StandardScaler', 'MinMaxScaler', 'RobustScaler', '머신러닝']
summary: '피처 스케일링이 왜 필요한지, StandardScaler, MinMaxScaler, RobustScaler의 차이와 모델별 스케일링 필요 여부를 정리한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/categorical-encoding/)에서 범주형 변수를 숫자로 바꾸는 방법을 정리했다. 원-핫 인코딩, 레이블 인코딩, 타겟 인코딩까지 — 범주형 데이터가 모델에 들어갈 수 있는 형태가 되었다. 그런데 숫자로 바뀌었다고 끝이 아니다. **숫자들의 스케일이 제각각이면** 문제가 생긴다.

나이는 0~100, 연봉은 2,000만~2억, 클릭률은 0.001~0.05. 이런 데이터를 그대로 모델에 넣으면 어떤 일이 벌어질까? 연봉의 값이 워낙 크니까, 모델이 연봉에만 집중하고 나머지 피처는 무시하게 된다. 이 문제를 해결하는 것이 **피처 스케일링(Feature Scaling)** 이다.

---

## 피처 스케일링이 왜 필요한가

### 경사 하강법이 느려진다

[경사 하강법(Gradient Descent)](/ml/gradient-descent/)에서 가중치를 업데이트할 때, 각 피처의 그래디언트 크기는 피처 값의 스케일에 비례한다. 연봉처럼 큰 값을 가진 피처는 그래디언트가 크고, 클릭률처럼 작은 값을 가진 피처는 그래디언트가 작다.

```
스케일이 다른 두 피처로 경사 하강법을 돌리면:

  스케일링 전:                    스케일링 후:
  ┌─────────────────────┐        ┌─────────────────────┐
  │    ╲                │        │      ○              │
  │      ╲              │        │     ○ ○             │
  │        ╲    지그재그 │        │    ○   ○            │
  │       ╱  ╲  경로    │        │     ○ ○  직선 경로  │
  │     ╱      ╲        │        │      ○              │
  │   ╱          ●      │        │       ●             │
  └─────────────────────┘        └─────────────────────┘
  수렴까지 수백 스텝               수렴까지 수십 스텝
```

스케일이 다르면 손실 함수의 등고선이 찌그러진 타원이 된다. 경사 하강법이 최저점을 향해 지그재그로 진동하면서 수렴이 느려진다. 스케일을 맞추면 등고선이 원에 가까워지고, 최저점으로 직선에 가까운 경로를 탄다.

### 거리 기반 모델이 왜곡된다

[KNN](/ml/knn/)이나 [SVM](/ml/svm/)처럼 데이터 포인트 간 거리를 계산하는 모델은 스케일에 직접적인 영향을 받는다.

```
두 사람의 유사도를 판단하는 상황:

  사람 A: 나이=25, 연봉=3000만
  사람 B: 나이=30, 연봉=3010만

  유클리드 거리 = sqrt((30-25)^2 + (3010만-3000만)^2)
               = sqrt(25 + 100,000,000)
               ≈ 10,000

  → 나이 차이 5는 완전히 무시됨
  → 거리가 사실상 연봉 차이로만 결정됨
```

나이 5살 차이와 연봉 10만 원 차이. 현실에서는 나이 차이가 더 의미 있을 수 있지만, 스케일 때문에 연봉이 거리를 지배한다. 스케일링 없이는 KNN이 사실상 **연봉만으로 이웃을 찾는** 모델이 된다.

### 신경망의 학습이 불안정해진다

[신경망](/ml/neural-network-basics/)에서는 각 레이어의 가중치가 입력값과 곱해진다. 입력 스케일이 크면 출력도 커지고, 활성화 함수의 포화 영역에 들어가면서 그래디언트가 사라진다. 특히 Sigmoid나 Tanh처럼 출력 범위가 제한된 활성화 함수에서 이 문제가 심하다.

---

## 스케일링이 필요 없는 모델: 트리

결정 트리, 랜덤 포레스트, XGBoost, LightGBM 같은 트리 기반 모델은 스케일링이 **필요 없다**. 이유는 간단하다 — 트리는 거리나 크기를 계산하지 않고, **분할 기준(threshold)** 만 찾기 때문이다.

```
"연봉 > 5000만원?" → 예/아니오
"나이 > 30?" → 예/아니오
```

연봉이 만 원 단위이든 억 원 단위이든, "5000만 원보다 큰가?"라는 질문의 답은 변하지 않는다. 분할의 순서와 결과가 스케일에 무관하다. 트리 모델에 스케일링을 적용해도 결과가 동일하니, 불필요한 전처리를 생략할 수 있다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 트리에 스케일링이 해가 되지는 않는다</strong><br>
  트리 모델에 스케일링을 적용해도 성능이 나빠지진 않는다. 단지 아무 효과가 없을 뿐이다. 다만 해석 편의성이 떨어질 수 있다 — 스케일링된 피처 중요도나 분할 기준값은 원본 스케일과 달라서 직관적이지 않다.
</div>

---

## StandardScaler: Z-score 정규화

가장 많이 쓰는 스케일러다. 각 피처의 평균을 0, 표준편차를 1로 맞춘다.

### 공식

```
z = (x - μ) / σ

μ: 피처의 평균
σ: 피처의 표준편차
```

변환 후 각 피처는 평균이 0이고 표준편차가 1인 분포를 따른다. 원래 분포의 모양은 바뀌지 않는다 — 정규분포였으면 정규분포, 편향되었으면 편향된 채로 스케일만 바뀐다.

### 언제 쓰나

- **정규분포에 가까운 데이터**: StandardScaler의 이론적 가정과 맞다
- **[로지스틱 회귀](/ml/logistic-regression/)**, **[SVM](/ml/svm/)**: 정규화가 규제(regularization) 효과에도 영향을 준다. 스케일이 다르면 L1/L2 페널티가 피처마다 불공평하게 적용된다
- **[신경망](/ml/neural-network-basics/)**: 입력 피처의 분포를 균일하게 맞춰야 학습이 안정적이다

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)  # fit은 train에서만!

# 변환 결과 확인
import numpy as np
print(f"변환 전 — 평균: {X_train[:, 0].mean():.2f}, 표준편차: {X_train[:, 0].std():.2f}")
print(f"변환 후 — 평균: {X_train_scaled[:, 0].mean():.2f}, 표준편차: {X_train_scaled[:, 0].std():.2f}")
```

```
변환 전 — 평균: 3.46, 표준편차: 2.15
변환 후 — 평균: 0.00, 표준편차: 1.00
```

### 한계

이상치(outlier)에 민감하다. 극단값이 평균과 표준편차를 왜곡하면, 대부분의 정상 데이터가 좁은 범위에 몰리게 된다.

```
예: [1, 2, 3, 4, 5, 1000]

평균 = 169.2, 표준편차 = 371.7
변환 결과: [-0.45, -0.45, -0.45, -0.44, -0.44, 2.23]

→ 1~5 사이의 차이가 거의 사라짐
→ 이상치 하나 때문에 정상 데이터의 분별력이 무너짐
```

---

## MinMaxScaler: 범위를 [0, 1]로

모든 값을 지정한 범위(기본 [0, 1])로 압축한다.

### 공식

```
x_scaled = (x - x_min) / (x_max - x_min)

x_min: 피처의 최솟값
x_max: 피처의 최댓값
```

최솟값은 0, 최댓값은 1로 매핑되고, 나머지 값은 그 사이에 선형으로 배치된다.

### 언제 쓰나

- **이미지 데이터**: 픽셀 값을 0~255에서 0~1로 변환할 때
- **출력 범위가 정해진 모델**: Sigmoid 활성화 함수의 입력으로 넣을 때
- **피처 값이 특정 범위 안에 있다는 것을 아는 경우**: 예를 들어 센서 데이터가 물리적으로 0~100 사이라면

```python
from sklearn.preprocessing import MinMaxScaler

scaler = MinMaxScaler()  # 기본 (0, 1)
# scaler = MinMaxScaler(feature_range=(-1, 1))  # 범위 변경 가능
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

### 한계

**이상치에 매우 취약하다.** StandardScaler보다 더 심하다. 이상치가 min이나 max를 극단적으로 밀어내면 정상 데이터가 전부 0 근처로 뭉쳐버린다.

```
예: [1, 2, 3, 4, 5, 1000]

min=1, max=1000
변환 결과: [0.000, 0.001, 0.002, 0.003, 0.004, 1.000]

→ 1~5의 차이가 0.004 범위에 압축됨
→ 사실상 구별 불가능
```

또한 **새 데이터가 학습 데이터의 범위를 벗어나면** 0~1 밖의 값이 나온다. `clip=True` 옵션으로 강제 제한할 수 있지만, 정보 손실이 생긴다.

```python
scaler = MinMaxScaler(clip=True)  # 범위 밖 값을 0 또는 1로 자름
```

---

## RobustScaler: 이상치에 강하다

중앙값(median)과 사분위 범위(IQR)를 사용한다. 이상치의 영향을 받지 않는 통계량이다.

### 공식

```
x_scaled = (x - median) / IQR

median: 피처의 중앙값 (50번째 백분위수)
IQR: 사분위 범위 = Q3(75번째) - Q1(25번째)
```

### 왜 이상치에 강한가

평균과 표준편차는 모든 데이터 포인트에 영향을 받는다. 극단값 하나가 전체 통계를 왜곡한다. 반면 중앙값과 IQR은 **데이터의 위치(순서)** 에 기반하기 때문에, 극단값이 있어도 중간 50%의 통계는 안정적이다.

```
예: [1, 2, 3, 4, 5, 1000]

StandardScaler: 평균=169.2, 표준편차=371.7 → 이상치가 통계를 지배
RobustScaler:   중앙값=3.5, IQR=2.5       → 이상치 무시, 정상 데이터 기준

RobustScaler 변환 결과: [-1.0, -0.6, -0.2, 0.2, 0.6, 398.6]

→ 정상 데이터(1~5)의 간격이 균등하게 유지됨
→ 이상치는 큰 값으로 남지만, 정상 데이터의 분별력은 살아있음
```

### 언제 쓰나

- **이상치가 있는 데이터**: 금융 데이터(극단 거래), 센서 데이터(오측정) 등
- **이상치를 제거하지 않고 모델에 포함해야 할 때**
- **분포가 비대칭(skewed)인 데이터**

```python
from sklearn.preprocessing import RobustScaler

scaler = RobustScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ RobustScaler는 이상치를 "제거"하지 않는다</strong><br>
  이상치에 강하다는 것은 이상치가 <strong>스케일링 기준에 영향을 주지 않는다</strong>는 뜻이지, 이상치 자체가 사라지는 것은 아니다. 변환 후에도 이상치는 극단적인 값으로 남는다. 이상치 제거가 필요하면 별도의 전처리를 해야 한다.
</div>

---

## MaxAbsScaler: 희소 행렬을 위한 선택

각 피처를 절대값 최대치로 나눈다. 결과 범위는 [-1, 1].

### 공식

```
x_scaled = x / |x_max|
```

### 핵심: 영점(zero)을 보존한다

StandardScaler와 MinMaxScaler는 데이터를 이동(shift)시킨다. 0이었던 값이 0이 아닌 값으로 바뀔 수 있다. **희소 행렬(sparse matrix)** 에서는 이것이 치명적이다.

```
희소 행렬의 핵심: 0인 원소를 저장하지 않음 → 메모리 효율적

StandardScaler 적용 후:
  모든 값에서 평균을 뺌 → 0이었던 원소가 -평균이 됨
  → 모든 원소가 0이 아닌 값 → 희소 행렬 구조 파괴
  → 메모리 사용량 폭증

MaxAbsScaler 적용 후:
  각 값을 최대 절대값으로 나눔 → 0은 여전히 0
  → 희소 구조 유지 → 메모리 효율 유지
```

### 언제 쓰나

- **TF-IDF 벡터, 원-핫 인코딩된 데이터** 같은 희소 행렬
- **양수/음수 모두 포함된 데이터**에서 부호를 보존하면서 스케일링할 때

```python
from sklearn.preprocessing import MaxAbsScaler

scaler = MaxAbsScaler()
X_train_scaled = scaler.fit_transform(X_train)  # 희소 행렬 입력 가능
X_test_scaled = scaler.transform(X_test)
```

---

## 실험: KNN에서 스케일링의 차이

스케일링이 실제로 얼마나 차이를 만드는지 확인해보자. [KNN](/ml/knn/)은 거리 기반 모델이므로 스케일링 효과가 극적으로 드러난다.

```python
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
from sklearn.metrics import accuracy_score

# Wine 데이터셋: 피처 스케일이 제각각
wine = load_wine()
X_train, X_test, y_train, y_test = train_test_split(
    wine.data, wine.target, test_size=0.3, random_state=42
)

# 피처 스케일 확인
import numpy as np
print("피처별 값 범위:")
for i, name in enumerate(wine.feature_names):
    print(f"  {name:>30}: {X_train[:, i].min():>10.2f} ~ {X_train[:, i].max():>10.2f}")
```

```
피처별 값 범위:
                       alcohol:      11.03 ~     14.83
                    malic_acid:       0.74 ~      5.80
                           ash:       1.36 ~      3.23
             alcalinity_of_ash:      10.60 ~     30.00
                     magnesium:      70.00 ~    162.00
                 total_phenols:       0.98 ~      3.88
                    flavanoids:       0.34 ~      5.08
          nonflavanoid_phenols:       0.13 ~      0.66
               proanthocyanins:       0.41 ~      3.58
               color_intensity:       1.28 ~     13.00
                           hue:       0.48 ~      1.71
  od280/od315_of_diluted_wines:       1.27 ~      4.00
                       proline:     278.00 ~   1680.00
```

proline은 278~1680, hue는 0.48~1.71. **3,000배 이상** 차이가 난다.

```python
scalers = {
    '스케일링 없음': None,
    'StandardScaler': StandardScaler(),
    'MinMaxScaler': MinMaxScaler(),
    'RobustScaler': RobustScaler(),
}

print(f"{'스케일러':<18} {'정확도':>8}")
print("-" * 28)

for name, scaler in scalers.items():
    if scaler is None:
        X_tr, X_te = X_train, X_test
    else:
        X_tr = scaler.fit_transform(X_train)
        X_te = scaler.transform(X_test)

    knn = KNeighborsClassifier(n_neighbors=5)
    knn.fit(X_tr, y_train)
    acc = accuracy_score(y_test, knn.predict(X_te))
    print(f"{name:<18} {acc:>8.4f}")
```

```
스케일러             정확도
----------------------------
스케일링 없음         0.7222
StandardScaler      0.9815
MinMaxScaler        0.9630
RobustScaler        0.9815
```

**스케일링 하나로 정확도가 0.72에서 0.98로 뛴다.** 모델을 바꾸거나 하이퍼파라미터를 튜닝한 것이 아니다. 같은 KNN, 같은 k=5인데 전처리만 달라졌다. 이것이 피처 스케일링의 위력이다.

---

## 스케일러 선택 가이드

### 스케일러별 비교

| 스케일러 | 변환 기준 | 결과 범위 | 이상치 민감도 | 희소 행렬 | 주요 용도 |
|----------|-----------|-----------|:------------:|:---------:|-----------|
| StandardScaler | 평균, 표준편차 | 제한 없음 | 높음 | X | 범용, 정규분포 데이터 |
| MinMaxScaler | 최솟값, 최댓값 | [0, 1] | 매우 높음 | X | 이미지, 범위 고정 |
| RobustScaler | 중앙값, IQR | 제한 없음 | **낮음** | X | 이상치가 있는 데이터 |
| MaxAbsScaler | 절대값 최댓값 | [-1, 1] | 높음 | **O** | TF-IDF, 희소 데이터 |

### 선택 플로우

```
데이터에 이상치가 있는가?
│
├── 예 → RobustScaler
│
└── 아니오:
    │
    ├── 희소 행렬인가?
    │   ├── 예 → MaxAbsScaler
    │   └── 아니오 ↓
    │
    ├── 범위를 [0,1]로 고정해야 하는가?
    │   ├── 예 → MinMaxScaler
    │   └── 아니오 → StandardScaler (기본 선택)
    │
    └── 잘 모르겠다 → StandardScaler (가장 범용적)
```

---

## 모델별 스케일링 필요 여부

| 모델 | 스케일링 필요? | 이유 |
|------|:-----------:|------|
| [선형 회귀](/ml/multiple-linear-regression/) | O | 경사 하강법 수렴 속도, 규제 공정성 |
| [로지스틱 회귀](/ml/logistic-regression/) | O | 경사 하강법 + L1/L2 규제 |
| [KNN](/ml/knn/) | **필수** | 유클리드 거리 계산 |
| [SVM](/ml/svm/) | **필수** | 커널 함수의 거리 계산 |
| [신경망](/ml/neural-network-basics/) | **필수** | 활성화 함수 포화, 그래디언트 폭발 |
| 결정 트리 | X | 분할 기준에 스케일 무관 |
| 랜덤 포레스트 | X | 트리 기반 |
| XGBoost / LightGBM | X | 트리 기반 |
| Naive Bayes | X | 확률 기반, 거리 미사용 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 규제(Regularization)와 스케일링의 관계</strong><br>
  <a href="/ml/regularization/">규제</a>를 사용하는 모델에서 스케일링은 더욱 중요하다. L1/L2 규제는 모든 가중치에 동일한 페널티를 적용하는데, 피처 스케일이 다르면 가중치 크기도 달라진다. 스케일이 큰 피처는 가중치가 작아지고, 스케일이 작은 피처는 가중치가 커진다. 규제가 스케일이 큰 피처를 불공평하게 덜 벌하는 셈이다. 스케일링을 하면 모든 피처가 동등한 조건에서 규제를 받는다.
</div>

---

## 치명적 실수: 테스트 데이터로 fit하지 마라

스케일링에서 가장 흔하고 가장 위험한 실수는 **테스트 데이터의 정보가 스케일러에 누출되는 것**이다.

```python
# ❌ 잘못된 방법: 전체 데이터로 fit
scaler = StandardScaler()
X_all_scaled = scaler.fit_transform(X_all)    # 전체 데이터의 평균/표준편차 학습
X_train, X_test = train_test_split(X_all_scaled)  # 이미 오염됨

# ❌ 잘못된 방법: 테스트에도 fit_transform
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.fit_transform(X_test)   # 테스트의 통계로 다시 fit!

# ✅ 올바른 방법: train으로 fit, test는 transform만
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)  # train 통계 학습 + 변환
X_test_scaled = scaler.transform(X_test)         # train 통계로 변환만
```

**왜 위험한가?** 현실에서 모델을 배포하면, 새 데이터가 한 건씩 들어온다. 이 데이터의 평균과 표준편차를 알 수 없다. 학습할 때 계산한 통계(평균, 표준편차, min, max)를 그대로 적용해야 한다. 테스트 데이터로 fit하면 "미래의 정보를 미리 아는" 상황이 되어, 평가 결과가 실제 성능보다 좋게 나온다.

### Pipeline으로 실수를 원천 차단

sklearn의 `Pipeline`은 `fit`과 `transform`을 올바른 순서로 강제한다.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

# Pipeline: 스케일링 → 모델을 하나의 객체로 묶음
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('svm', SVC(kernel='rbf', C=1.0))
])

# fit은 train에만, predict는 자동으로 transform → predict
pipe.fit(X_train, y_train)
accuracy = pipe.score(X_test, y_test)

# cross_val_score에서도 데이터 누출 방지
from sklearn.model_selection import cross_val_score
scores = cross_val_score(pipe, X_train, y_train, cv=5)
print(f"CV 평균 정확도: {scores.mean():.4f}")
```

Pipeline 안에 스케일러와 모델을 넣으면, 교차 검증에서도 각 폴드마다 train fold로만 fit하고 validation fold에는 transform만 적용된다. 데이터 누출을 구조적으로 차단하는 것이다.

---

## 비대칭 분포: Log/Power 변환

StandardScaler든 MinMaxScaler든, 원래 분포의 **모양**은 바꾸지 않는다. 심하게 치우친(skewed) 분포는 스케일링만으로 해결되지 않는다. 이때 변환(transform)으로 분포 자체를 바꿔야 한다.

### Log 변환

오른쪽으로 긴 꼬리를 가진 분포(right-skewed)에 효과적이다. 소득, 집값, 방문 횟수 같은 데이터가 전형적이다.

```python
import numpy as np

# 원본: 오른쪽으로 긴 꼬리
X_log = np.log1p(X)  # log(1 + x) — 0을 포함하는 데이터에 안전

# 역변환
X_original = np.expm1(X_log)  # exp(x) - 1
```

`log1p`를 쓰는 이유: `log(0)`은 정의되지 않는다. `log(1 + x)`로 0을 안전하게 처리한다.

### PowerTransformer

sklearn의 `PowerTransformer`는 데이터를 **정규분포에 가깝게** 자동 변환한다. 두 가지 방법이 있다:

```python
from sklearn.preprocessing import PowerTransformer

# Yeo-Johnson: 음수 값도 처리 가능 (기본값)
pt_yj = PowerTransformer(method='yeo-johnson')
X_yj = pt_yj.fit_transform(X_train)

# Box-Cox: 양수 값만 가능하지만 더 강력
pt_bc = PowerTransformer(method='box-cox')
X_bc = pt_bc.fit_transform(X_train)  # X_train > 0이어야 함
```

PowerTransformer는 내부적으로 StandardScaler도 적용한다. 별도의 스케일링이 필요 없다.

```
변환 전: 심하게 편향된 분포
  ▌
  ▌
  ▌▌
  ▌▌▌
  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌───────────

변환 후: 정규분포에 가까움
           ▌▌▌
          ▌▌▌▌▌
        ▌▌▌▌▌▌▌▌▌
     ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌
  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌
```

---

## 실전 파이프라인: ColumnTransformer로 피처별 다른 전처리

실제 데이터에는 수치형, 범주형, 이상치가 있는 컬럼, 정상적인 컬럼이 섞여 있다. `ColumnTransformer`로 피처마다 다른 전처리를 적용할 수 있다.

```python
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, RobustScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

# 예시 데이터
data = pd.DataFrame({
    'age': [25, 30, 35, 40, 22, 28, 45, 33, 29, 38],
    'income': [3000, 4500, 5200, 8000, 2800, 3500, 15000, 4800, 3200, 7000],
    'clicks': [10, 25, 5, 150, 8, 20, 3, 30, 12, 45],
    'gender': ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F'],
    'city': ['서울', '부산', '서울', '대구', '부산', '서울', '대구', '부산', '서울', '대구'],
    'purchased': [0, 1, 0, 1, 0, 0, 1, 1, 0, 1]
})

X = data.drop('purchased', axis=1)
y = data['purchased']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

# 피처 그룹 정의
numeric_normal = ['age']           # 정상 분포 → StandardScaler
numeric_skewed = ['income', 'clicks']  # 이상치/편향 → RobustScaler
categorical = ['gender', 'city']   # 범주형 → OneHotEncoder

# 수치형 파이프라인: 결측 처리 + 스케일링
normal_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='mean')),
    ('scaler', StandardScaler())
])

skewed_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', RobustScaler())
])

# 범주형 파이프라인: 결측 처리 + 원-핫 인코딩
categorical_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('encoder', OneHotEncoder(drop='first', sparse_output=False))
])

# ColumnTransformer: 피처별 다른 전처리 적용
preprocessor = ColumnTransformer([
    ('normal', normal_pipeline, numeric_normal),
    ('skewed', skewed_pipeline, numeric_skewed),
    ('cat', categorical_pipeline, categorical)
])

# 최종 파이프라인: 전처리 + 모델
full_pipeline = Pipeline([
    ('preprocessor', preprocessor),
    ('classifier', LogisticRegression(random_state=42))
])

# 학습 & 평가 — fit/transform 순서를 신경 쓸 필요 없음
full_pipeline.fit(X_train, y_train)
print(f"테스트 정확도: {full_pipeline.score(X_test, y_test):.4f}")
```

이 파이프라인의 핵심은 **피처 그룹별로 다른 스케일러를 적용**한 것이다. 정상 분포의 `age`에는 StandardScaler, 이상치가 있을 수 있는 `income`과 `clicks`에는 RobustScaler, 범주형은 원-핫 인코딩. 모든 전처리가 하나의 파이프라인 안에서 관리되므로:

1. `fit`과 `transform`의 순서 실수가 불가능하다
2. 교차 검증에서 데이터 누출이 원천 차단된다
3. 파이프라인 자체를 `joblib`으로 저장하면 배포 시에도 동일한 전처리가 보장된다

```python
import joblib

# 파이프라인 전체를 저장 — 스케일러 통계 + 인코더 매핑 + 모델 가중치 포함
joblib.dump(full_pipeline, 'model_pipeline.pkl')

# 배포 시 로드
loaded_pipeline = joblib.load('model_pipeline.pkl')
prediction = loaded_pipeline.predict(new_data)  # 전처리 + 예측 한 번에
```

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실전 체크리스트</strong><br>
  <ul style="margin: 8px 0 0 0; padding-left: 20px;">
    <li>스케일러는 반드시 train 데이터로만 <code>fit</code></li>
    <li>이상치가 있으면 <code>RobustScaler</code> 우선 고려</li>
    <li>희소 행렬이면 <code>MaxAbsScaler</code></li>
    <li>편향된 분포는 스케일링 전에 <code>PowerTransformer</code>나 <code>log1p</code></li>
    <li><code>Pipeline</code> + <code>ColumnTransformer</code>로 전처리와 모델을 묶어라</li>
    <li>트리 기반 모델은 스케일링 불필요 — 쓸데없는 전처리를 추가하지 마라</li>
  </ul>
</div>

---

## 마치며

피처 스케일링은 화려한 기법이 아니다. StandardScaler, MinMaxScaler, RobustScaler — 공식도 단순하고 코드도 두 줄이면 끝난다. 하지만 이 두 줄이 KNN의 정확도를 0.72에서 0.98로 바꾸고, 경사 하강법의 수렴 속도를 몇 배 빠르게 한다. 반대로, 테스트 데이터로 `fit`하는 한 줄의 실수가 모델 평가 전체를 무의미하게 만든다.

핵심은 세 가지다:

1. **어떤 모델을 쓰느냐**에 따라 스케일링 필요 여부가 갈린다
2. **데이터의 특성**(이상치, 분포 모양, 희소성)에 따라 스케일러 선택이 달라진다
3. **train으로만 fit, test는 transform만** — 이 규칙을 Pipeline으로 강제하라

[다음 글](/ml/feature-selection/)에서는 전처리를 마친 피처들 중 **어떤 피처를 남기고 어떤 피처를 버릴지** — 피처 선택(Feature Selection)을 다룬다. 피처가 많다고 좋은 것이 아니다. 쓸모없는 피처는 모델을 느리게 하고, 과적합을 부추기고, 해석을 어렵게 한다.

---

## 참고자료

- [scikit-learn — Preprocessing data](https://scikit-learn.org/stable/modules/preprocessing.html)
- [scikit-learn — Compare the effect of different scalers on data with outliers](https://scikit-learn.org/stable/auto_examples/preprocessing/plot_all_scaling.html)
- [Feature Engineering and Selection (Kuhn & Johnson, 2019)](http://www.feat.engineering/)
- [Andrew Ng — Machine Learning Specialization, Feature Scaling](https://www.coursera.org/learn/machine-learning)
