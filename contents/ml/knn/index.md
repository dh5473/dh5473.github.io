---
date: '2026-01-11'
title: 'K-최근접 이웃(KNN): 거리로 분류하는 가장 직관적인 알고리즘'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 11
tags: ['KNN', 'K-Nearest Neighbors', '거리 기반 분류', '피처 스케일링', '머신러닝']
summary: '학습 없이 거리만으로 분류하는 KNN의 원리, K 선택법, 차원의 저주까지. 스케일링이 왜 필수인지 코드로 확인한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/naive-bayes/)에서 나이브 베이즈는 확률로 분류했다. 각 클래스의 사전 확률과 특성의 조건부 확률을 계산해서, 가장 가능성 높은 클래스를 골랐다. KNN은 더 단순한 발상에서 출발한다 — **가까운 이웃이 뭔지 보고 따라간다.** 학습이라 부를 것도 없다.

사실 일상에서 이미 KNN 방식으로 판단하고 있다. 새로 이사 간 동네에서 맛집을 찾을 때, 리뷰를 분석하기보다 "주변에 사람 많은 식당"에 들어간다. 주변 이웃(다른 데이터)을 관찰해서 결정하는 것 — 이게 KNN의 전부다.

---

## KNN의 핵심 아이디어

**K-최근접 이웃(K-Nearest Neighbors, KNN)** 의 가정은 단 하나다:

> **비슷한 데이터는 비슷한 레이블을 가진다.**

이 가정을 알고리즘으로 옮기면 두 단계뿐이다.

- **학습 단계**: 데이터를 그냥 저장한다. 끝이다. 가중치를 최적화하거나 함수를 피팅하는 과정이 없다
- **예측 단계**: 새 데이터가 들어오면 → 저장된 데이터 중 가장 가까운 K개를 찾고 → 다수결 투표로 클래스를 결정한다

학습 시점에 아무 계산도 하지 않고, 예측 시점에 비로소 계산을 시작하기 때문에 **게으른 학습(Lazy Learning)** 이라고 부른다. 로지스틱 회귀나 나이브 베이즈처럼 학습 시점에 모델 파라미터를 결정하는 방식은 Eager Learning이다.

K 값에 따라 결과가 달라지는 모습을 보자.

```
새 데이터(★)를 분류하려 한다. 주변에 ●(클래스 A)와 ▲(클래스 B)가 섞여 있다.

        ▲
    ●       ▲
        ★           ▲
    ●       ●
                ▲
        ●

K=3: 가장 가까운 3개 → ● ● ▲ → 다수결: 클래스 A (●)
K=5: 가장 가까운 5개 → ● ● ● ▲ ▲ → 다수결: 클래스 A (●)
K=7: 가장 가까운 7개 → ● ● ● ▲ ▲ ▲ ▲ → 다수결: 클래스 B (▲)
```

같은 데이터인데 K에 따라 분류 결과가 뒤집힐 수 있다. K 선택이 중요한 이유다.

---

## 거리 측정법

"가장 가까운 이웃"을 찾으려면 거리를 정의해야 한다. 두 가지 방법이 가장 많이 쓰인다.

### 유클리드 거리(Euclidean Distance)

고등학교 수학에서 배운 직선 거리다.

> **d(a, b) = √((a₁ − b₁)² + (a₂ − b₂)² + ... + (aₙ − bₙ)²)**

2차원이면 두 점 사이의 직선 거리, n차원이면 그 일반화다. sklearn의 KNN이 기본으로 사용하는 거리이기도 하다.

### 맨해튼 거리(Manhattan Distance)

각 축 방향으로 얼마나 떨어져 있는지의 합이다.

> **d(a, b) = |a₁ − b₁| + |a₂ − b₂| + ... + |aₙ − bₙ|**

직선으로 대각선을 가로지르는 유클리드 거리와 달리, 격자 도로를 따라 이동하는 거리라서 "블록 거리"라고도 부른다. 맨해튼의 격자형 도로에서 이름이 유래했다.

```
유클리드 거리 vs 맨해튼 거리 (2D 예시)

  A(1,3) ─ ─ ─ ─ ┐
    ╲              │   맨해튼: |4-1| + |1-3| = 3 + 2 = 5
     ╲             │
      ╲ √13       │   유클리드: √(3² + 2²) = √13 ≈ 3.61
       ╲           │
        B(4,1) ◀──┘
```

대부분의 경우 유클리드 거리면 충분하다. 맨해튼 거리는 고차원 데이터나 특성 간 상관이 낮을 때 더 잘 동작하는 경우가 있다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 민코프스키 거리(Minkowski Distance)</strong><br>
  유클리드와 맨해튼은 사실 <strong>민코프스키 거리</strong>의 특수한 경우다. d(a, b) = (Σ|aᵢ − bᵢ|ᵖ)^(1/p)에서 p=2면 유클리드, p=1이면 맨해튼이다. sklearn에서 <code>metric='minkowski', p=2</code>가 기본값이다.
</div>

---

## K 값 선택

K는 KNN의 유일한 하이퍼파라미터이면서, 모델의 성격을 완전히 바꾸는 핵심 설정이다.

**K=1**: 가장 가까운 이웃 하나만 본다. 결정 경계가 극도로 복잡해지고, 데이터의 노이즈에 그대로 반응한다. 전형적인 **과적합(overfitting)**.

**K가 큰 경우**: 멀리 있는 이웃까지 참고하므로 결정 경계가 부드러워진다. 너무 크면 다른 클래스의 데이터까지 포함되어 **과소적합(underfitting)** 이 된다. 극단적으로 K = 전체 데이터 수이면, 모든 예측이 다수 클래스로 고정된다.

sklearn으로 K 값에 따른 정확도 변화를 확인해보자.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

data = load_breast_cancer()
X, y = data.data, data.target

k_range = range(1, 31)
scores = []

for k in k_range:
    pipe = Pipeline([
        ('scaler', StandardScaler()),
        ('knn', KNeighborsClassifier(n_neighbors=k))
    ])
    # 5-fold 교차 검증으로 안정적인 정확도 측정
    cv_score = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
    scores.append(cv_score.mean())

best_k = k_range[scores.index(max(scores))]
print(f"최적 K: {best_k}, 정확도: {max(scores):.4f}")
# 최적 K: 7, 정확도: 0.9684
```

일반적으로 K가 작을 때는 과적합으로 정확도가 불안정하고, K가 커지면서 안정되다가, 너무 커지면 다시 떨어진다. 교차 검증(Cross-Validation)으로 최적 K를 찾는 것이 정석이다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ K는 홀수로 설정하자</strong><br>
  이진 분류에서 K가 짝수면 동점(tie)이 발생할 수 있다. K=4일 때 클래스 A 2개, 클래스 B 2개가 나오면 결정할 수 없다. 홀수로 설정하면 동점을 원천적으로 방지한다.
</div>

---

## 피처 스케일링이 필수인 이유

KNN은 거리 기반 알고리즘이다. 그래서 변수 간 스케일이 다르면 결과가 완전히 왜곡된다.

구체적인 예를 보자. 나이(0~100)와 연봉(0~1억)으로 고객을 분류한다고 하자. 두 고객 사이의 거리를 계산하면:

```
고객 A: 나이 = 30, 연봉 = 5000만
고객 B: 나이 = 50, 연봉 = 5100만

유클리드 거리 = √((30-50)² + (5000-5100)²)
             = √(400 + 10000)   (단위: 만원)
             = √10400 ≈ 102

나이 차이 기여: 400 / 10400 = 3.8%
연봉 차이 기여: 10000 / 10400 = 96.2%
```

나이가 20살이나 차이 나는데, 거리에는 거의 영향을 못 미친다. 연봉의 숫자가 크기 때문에 거리를 지배하는 것이다. 결국 KNN은 "연봉이 비슷한 사람"만 이웃으로 찾게 되고, 나이 정보는 사실상 무시된다.

[다중 선형 회귀 글](/ml/multiple-linear-regression/)에서 Feature Scaling을 처음 다뤘다. 그때는 경사하강법의 수렴 속도가 문제였지만, KNN에서는 더 심각하다 — **스케일링 없이는 모델 자체가 잘못된 이웃을 찾는다.**

`StandardScaler`로 스케일링 전후 정확도를 비교하면 차이가 확연하다.

```python
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score

data = load_wine()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.3, random_state=42
)

# 스케일링 없이
knn_raw = KNeighborsClassifier(n_neighbors=5)
knn_raw.fit(X_train, y_train)
acc_raw = accuracy_score(y_test, knn_raw.predict(X_test))

# 스케일링 적용
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

knn_scaled = KNeighborsClassifier(n_neighbors=5)
knn_scaled.fit(X_train_scaled, y_train)
acc_scaled = accuracy_score(y_test, knn_scaled.predict(X_test))

print(f"스케일링 전: {acc_raw:.4f}")
print(f"스케일링 후: {acc_scaled:.4f}")
# 스케일링 전: 0.7037
# 스케일링 후: 0.9815
```

| | 스케일링 전 | 스케일링 후 |
|---|---|---|
| **정확도** | 70.4% | 98.1% |
| **차이** | — | **+27.8%p** |

같은 데이터, 같은 K값인데 스케일링 하나로 정확도가 28%p나 뛴다. Wine 데이터셋은 알코올 농도(11~14), 마그네슘(70~162), 프롤린(278~1680) 등 변수 간 스케일 차이가 크기 때문에 효과가 극적이다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 거리 기반 알고리즘 = 스케일링 필수</strong><br>
  KNN, SVM, K-Means 등 거리를 계산하는 알고리즘은 반드시 스케일링해야 한다. 반면 Decision Tree, Random Forest 같은 트리 기반 모델은 분할 기준이 크기 비교라서 스케일링이 필요 없다.
</div>

---

## 차원의 저주(Curse of Dimensionality)

KNN은 직관적이고 강력하지만, 치명적인 약점이 있다. 특성(차원) 수가 늘어나면 성능이 급격히 떨어진다.

왜 그럴까? 고차원 공간에서는 **"가까운 이웃"이라는 개념 자체가 무너진다.**

단위 초입방체(0~1 범위) 안에 데이터가 균일하게 분포한다고 하자. 전체 데이터의 10%를 이웃으로 포함하려면 각 축 방향으로 얼마나 뻗어야 할까?

```
1차원:  10%의 범위 = 0.1           (전체의 10%)
2차원:  10%의 면적 → 한 변 = 0.316  (전체의 31.6%)
10차원: 10%의 부피 → 한 변 = 0.794  (전체의 79.4%)
100차원: 10%의 부피 → 한 변 = 0.977 (전체의 97.7%)
```

100차원에서 10%의 데이터만 포함하려 해도, 각 축의 97.7%를 커버해야 한다. 이쯤 되면 "이웃"이 아니라 거의 전체 공간이다. 가까운 것과 먼 것의 구분이 사라지는 셈이다.

실제로 차원이 높아지면 모든 데이터 포인트 간 거리가 비슷해진다. "가장 가까운 이웃"과 "가장 먼 데이터"의 거리 차이가 거의 없어진다. 거리가 의미 없어지면 KNN은 사실상 랜덤 분류기와 다를 바 없다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 차원의 저주 대응법</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>PCA</strong> 등 차원 축소로 핵심 특성만 남긴다</li>
    <li><strong>Feature Selection</strong>으로 불필요한 변수를 제거한다</li>
    <li>특성이 수백 개 이상이면 KNN 대신 트리 기반 모델이나 SVM을 고려한다</li>
  </ul>
</div>

---

## KNN의 장단점

[로지스틱 회귀](/ml/logistic-regression/), 나이브 베이즈와 비교하면 KNN의 특성이 뚜렷해진다.

| 기준 | KNN | 로지스틱 회귀 | 나이브 베이즈 |
|------|-----|-------------|-------------|
| **학습 속도** | 없음 (저장만) | 빠름 | 매우 빠름 |
| **예측 속도** | 느림 (전체 거리 계산) | 매우 빠름 | 매우 빠름 |
| **결정 경계** | 비선형 가능 | 선형 | 확률 기반 |
| **스케일링** | 필수 | 권장 | 불필요 |
| **고차원 데이터** | 약함 | 강함 | 강함 |
| **해석 가능성** | 직관적 (이웃 확인) | 계수로 해석 | 확률로 해석 |

**장점:**
- **단순함** — 수학적으로 이해하기 가장 쉬운 분류 알고리즘이다
- **비선형 결정 경계** — 로지스틱 회귀와 달리, 복잡한 경계도 자연스럽게 만든다
- **학습 단계 불필요** — 새 데이터가 추가되면 그냥 저장만 하면 된다

**단점:**
- **느린 예측** — 예측할 때마다 전체 학습 데이터와 거리를 계산해야 한다. 데이터가 100만 개면 매 예측마다 100만 번 계산
- **메모리 사용** — 전체 학습 데이터를 메모리에 들고 있어야 한다
- **스케일링 필수** — 위에서 봤듯이, 스케일링 없이는 엉뚱한 결과가 나온다
- **고차원에 약함** — 차원의 저주로 성능이 급감한다

속도 문제는 **KD-Tree**나 **Ball Tree** 같은 자료구조로 완화할 수 있다. 전체 데이터를 매번 순회하는 대신, 트리 구조로 탐색 범위를 좁혀서 O(n)을 O(log n)에 가깝게 줄인다. sklearn에서는 `algorithm='kd_tree'` 또는 `algorithm='ball_tree'`로 지정할 수 있고, 기본값 `'auto'`는 데이터 특성에 맞춰 자동 선택한다.

---

## sklearn 실전 코드

Breast Cancer 데이터셋으로 전체 파이프라인을 구성해보자. [로지스틱 회귀 글](/ml/logistic-regression/)에서 같은 데이터로 97.4% 정확도를 냈었는데, KNN은 어떨까?

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report

# 데이터 로드
data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42
)

# KNN 파이프라인 (StandardScaler + KNN)
knn_pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('knn', KNeighborsClassifier(n_neighbors=7))
])

# 로지스틱 회귀 파이프라인 (비교용)
lr_pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('lr', LogisticRegression(max_iter=1000))
])

# 학습 및 평가
knn_pipe.fit(X_train, y_train)
lr_pipe.fit(X_train, y_train)

knn_acc = accuracy_score(y_test, knn_pipe.predict(X_test))
lr_acc = accuracy_score(y_test, lr_pipe.predict(X_test))

print(f"KNN (K=7)     정확도: {knn_acc:.4f}")
print(f"Logistic Reg  정확도: {lr_acc:.4f}")
print(f"\nKNN Classification Report:")
print(classification_report(y_test, knn_pipe.predict(X_test),
                            target_names=['악성', '양성']))
```

```
KNN (K=7)     정확도: 0.9561
Logistic Reg  정확도: 0.9737

KNN Classification Report:
              precision    recall  f1-score   support

          악성       0.93      0.95      0.94        43
          양성       0.97      0.96      0.96        71

    accuracy                           0.96       114
   macro avg       0.95      0.96      0.95       114
weighted avg       0.96      0.96      0.96       114
```

KNN이 95.6%, 로지스틱 회귀가 97.4%다. 이 데이터에서는 로지스틱 회귀가 약간 더 좋다. 하지만 KNN의 장점은 **비선형 결정 경계를 자연스럽게 만든다**는 것이다. 데이터가 선형으로 분리되지 않는 경우에는 KNN이 역전할 수 있다.

결국 모델 선택은 데이터의 특성에 따른다. 특성 수가 적고 데이터가 비선형적이면 KNN이 강하고, 특성이 많고 선형 분리가 가능하면 로지스틱 회귀가 유리하다.

---

## 마치며

KNN은 "가까운 이웃을 보고 따라간다"는 단순한 아이디어로 비선형 분류까지 해내는 알고리즘이다. 다만 거리 기반이라 스케일링이 필수이고, 차원이 높아지면 한계가 뚜렷하다. 모든 알고리즘이 그렇듯 장단점이 명확하니, 데이터 특성에 맞춰 선택하는 감각이 중요하다.

다음 글에서는 거리가 아닌 **마진(margin)** 으로 분류하는 **서포트 벡터 머신(SVM)** 을 다룬다. 결정 경계를 단순히 긋는 게 아니라, 가장 "여유로운" 경계를 찾는 방법이다.

## 참고자료

- [Andrew Ng — Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn — KNeighborsClassifier Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.neighbors.KNeighborsClassifier.html)
- [StatQuest: K-nearest neighbors (YouTube)](https://www.youtube.com/watch?v=HVXime0nQeI)
- [Curse of Dimensionality — Wikipedia](https://en.wikipedia.org/wiki/Curse_of_dimensionality)
