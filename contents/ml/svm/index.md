---
date: '2026-03-17'
title: '서포트 벡터 머신(SVM): 마진을 최대화하는 분류의 기하학'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 12
tags: ['SVM', 'Support Vector Machine', '커널 트릭', '마진 최대화', '머신러닝']
summary: '최대 마진 분류기의 기하학적 직관부터 소프트 마진, 커널 트릭(RBF)까지. 로지스틱 회귀·KNN과 코드로 비교한다.'
thumbnail: './thumbnail.png'
---

[로지스틱 회귀](/ml/logistic-regression/)는 확률로 분류하고, [KNN](/ml/knn/)은 거리로 분류한다. SVM도 거리를 사용하지만, 발상이 근본적으로 다르다. KNN이 "가장 가까운 이웃이 뭐냐"를 묻는다면, SVM은 **"두 클래스 사이에 가장 넓은 도로를 깔 수 있는 경계는 어디냐"**를 묻는다.

<br>

이 "도로의 폭"을 **마진(Margin)** 이라 부르고, 마진이 최대인 경계를 찾는 것이 SVM의 핵심이다. 직관적으로도 도로가 넓을수록 새 데이터가 들어왔을 때 올바른 쪽에 떨어질 가능성이 높다. 이 글에서는 최대 마진의 기하학적 의미부터 시작해, 소프트 마진(C 파라미터), 커널 트릭(RBF), 그리고 sklearn 실전 파이프라인까지 다룬다.

---

## 최대 마진 분류기

두 클래스를 분리하는 직선(2차원) 또는 초평면(고차원)은 무수히 많다. 아래 그림에서 A, B, C 모두 두 클래스를 완벽히 구분한다.

```
        클래스 +              클래스 -
        ●  ●                  ○  ○
      ●  ●  ●    A  B  C     ○  ○
        ●  ●    / | \        ○  ○  ○
      ●    ●   /  |  \         ○  ○
              /   |   \
```

셋 다 훈련 데이터에서는 100% 정확하다. 하지만 새 데이터가 경계 근처에 떨어지면? A처럼 한쪽에 바짝 붙은 직선은 쉽게 오분류한다. **SVM은 B를 선택한다** — 양쪽 클래스로부터 가장 멀리 떨어진 경계, 즉 마진이 최대인 경계다.

```
             마진(Margin)
          ◀──────────────▶
     ●  ● ┊               ┊ ○  ○
   ●  [●] ┊───결정 경계───┊ [○]  ○
     ●  ● ┊               ┊ ○  ○  ○
   ●    ● ┊               ┊   ○  ○
     서포트 벡터          서포트 벡터
```

마진 경계에 딱 걸쳐 있는 데이터 포인트들이 **서포트 벡터(Support Vector)** 다. 이름 그대로 결정 경계를 "지탱하는(support)" 벡터들이다. 사실 결정 경계의 위치는 서포트 벡터만으로 결정되고, 나머지 데이터는 아무리 많아도 경계에 영향을 주지 않는다. 이 성질이 SVM을 독특하게 만드는 핵심이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 왜 마진이 클수록 좋을까?</strong><br>
  마진이 넓다는 건, 결정 경계가 양쪽 클래스로부터 충분히 떨어져 있다는 뜻이다. 새 데이터에 약간의 노이즈가 섞여 있어도 올바른 쪽에 떨어질 여유가 있다. 통계 학습 이론에서는 이를 <strong>구조적 위험 최소화(Structural Risk Minimization)</strong>라고 부른다 — 마진을 최대화하면 VC 차원이 제한되어 일반화 오차의 상한이 낮아진다.
</div>

---

## 소프트 마진: 현실의 데이터는 깔끔하지 않다

위의 설명은 **하드 마진(Hard Margin)** — 두 클래스가 완벽히 분리 가능한 경우에만 성립한다. 현실 데이터에서는 클래스가 겹치거나, 이상치가 섞여 있어서 깔끔한 분리가 불가능한 경우가 대부분이다.

하드 마진 SVM을 이런 데이터에 적용하면 두 가지 중 하나가 발생한다:
- 해가 존재하지 않는다 (분리 불가)
- 이상치 하나에 경계가 극단적으로 왜곡된다

**소프트 마진(Soft Margin)** SVM은 일부 데이터가 마진 안에 들어오거나, 심지어 반대쪽으로 넘어가는 것을 허용한다. 대신 그 위반에 대해 **벌점(penalty)** 을 부과한다.

### C 파라미터

이 벌점의 강도를 조절하는 것이 **C 파라미터**다.

```
C가 큰 경우 (예: C=100)              C가 작은 경우 (예: C=0.01)
┌─────────────────────┐              ┌─────────────────────┐
│ ● ●  ┊  ○ ○        │              │ ●  ●     ○  ○      │
│ ●[●] ┊ [○]○        │              │ ●  ● ┊      ○  ○   │
│ ●  ● ┊  ○ ○  ○     │              │ ●  ●○┊      ○  ○   │
│    좁은 마진         │              │     넓은 마진        │
│ → 오분류 거의 없음    │              │ → 일부 오분류 허용    │
│ → 과적합 위험 ↑      │              │ → 과소적합 위험 ↑    │
└─────────────────────┘              └─────────────────────┘
```

- **C가 크면**: "오분류 절대 안 돼!" → 마진이 좁아지고, 훈련 데이터에 과하게 맞추려 한다 → 과적합
- **C가 작으면**: "오분류 좀 해도 괜찮아" → 마진이 넓어지고, 전체적인 경향만 잡는다 → 과소적합

[규제(Regularization) 글](/ml/regularization/)에서 다뤘던 alpha(lambda)와 정확히 **역수 관계**다. [로지스틱 회귀](/ml/logistic-regression/)의 `LogisticRegression(C=1.0)`도 같은 원리였다 — C는 규제 강도의 역수다.

sklearn으로 C에 따른 변화를 확인해보자.

```python
from sklearn.svm import SVC
from sklearn.datasets import make_moons
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

X, y = make_moons(n_samples=200, noise=0.3, random_state=42)

for C in [0.01, 0.1, 1, 10, 100]:
    pipe = Pipeline([
        ('scaler', StandardScaler()),
        ('svc', SVC(kernel='rbf', C=C))
    ])
    scores = cross_val_score(pipe, X, y, cv=5)
    print(f"C={C:6.2f} | 정확도: {scores.mean():.3f} (±{scores.std():.3f})")
```

```
C=  0.01 | 정확도: 0.840 (±0.036)
C=  0.10 | 정확도: 0.875 (±0.048)
C=  1.00 | 정확도: 0.900 (±0.032)
C= 10.00 | 정확도: 0.895 (±0.037)
C=100.00 | 정확도: 0.890 (±0.040)
```

C=1 근처에서 최적 성능을 보인다. C를 100으로 올려도 정확도가 개선되지 않는다 — 오히려 미세하게 떨어진다. 과적합의 신호다.

---

## 커널 트릭: 비선형 분류

여기까지의 SVM은 직선(또는 초평면)으로 분류했다. 그런데 데이터가 원형으로 분포하거나, XOR 패턴처럼 직선으로는 절대 분리할 수 없는 경우가 있다.

### 고차원 매핑의 아이디어

핵심 아이디어는 놀랍도록 단순하다: **차원을 올리면 선형 분리가 가능해진다.**

```
2차원에서 분리 불가능:              3차원으로 올리면 분리 가능:

    ○ ○ ● ○ ○                         ●
   ○ ● ● ● ○                        ● ● ●
   ○ ● ● ● ○        φ(x)          ──────── ← 평면으로 분리
    ○ ○ ● ○ ○       ────▶        ○ ○   ○ ○
                                 ○   ○   ○
```

2차원에서 원 안에 있는 클래스(●)와 밖에 있는 클래스(○)는 직선으로 분리할 수 없다. 하지만 φ(x₁, x₂) = (x₁, x₂, x₁² + x₂²)처럼 **새 차원을 추가**하면, 3차원에서 평면 하나로 깔끔하게 분리된다.

문제는 고차원 변환의 비용이다. 변수가 d개이고 2차 다항식으로 변환하면 O(d²)개의 새 변수가 생기고, 고차로 갈수록 기하급수적으로 늘어난다.

### 커널 트릭이란

**커널 트릭(Kernel Trick)** 은 이 문제를 우회한다. SVM의 최적화 문제를 자세히 보면, 데이터 포인트 간의 **내적(dot product)** 만으로 계산이 가능하다. 커널 함수 K(xᵢ, xⱼ)는 **고차원에서의 내적을 저차원에서 직접 계산**한다 — 실제로 변환할 필요가 없다.

| 커널 | 수식 | 특징 |
|------|------|------|
| Linear | K(x, x') = x · x' | 선형 분리 가능할 때 |
| Polynomial | K(x, x') = (γx · x' + r)^d | 다항식 경계 |
| **RBF (Gaussian)** | K(x, x') = exp(-γ\|\|x - x'\|\|²) | **가장 범용적**, 무한 차원 매핑 |

실전에서 가장 많이 쓰이는 건 **RBF(Radial Basis Function)** 커널이다. 두 데이터 포인트 사이의 유클리드 거리를 기반으로 유사도를 계산하며, 이론적으로 **무한 차원**으로의 매핑에 해당한다.

### gamma 파라미터

RBF 커널의 **gamma(γ)** 는 각 데이터 포인트의 영향 범위를 결정한다.

- **gamma가 작으면**: 영향 범위가 넓다 → 부드러운 결정 경계 → 과소적합 경향
- **gamma가 크면**: 영향 범위가 좁다 → 각 포인트 주변만 영향 → 복잡한 경계 → 과적합 경향

Linear 커널과 RBF 커널을 비교해보자.

```python
import numpy as np
from sklearn.svm import SVC
from sklearn.datasets import make_moons
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

X, y = make_moons(n_samples=300, noise=0.25, random_state=42)

kernels = {
    'Linear': SVC(kernel='linear', C=1),
    'RBF (gamma=0.1)': SVC(kernel='rbf', C=1, gamma=0.1),
    'RBF (gamma=1)': SVC(kernel='rbf', C=1, gamma=1),
    'RBF (gamma=10)': SVC(kernel='rbf', C=1, gamma=10),
}

for name, svc in kernels.items():
    pipe = Pipeline([('scaler', StandardScaler()), ('svc', svc)])
    scores = cross_val_score(pipe, X, y, cv=5)
    print(f"{name:20s} | 정확도: {scores.mean():.3f} (±{scores.std():.3f})")
```

```
Linear               | 정확도: 0.873 (±0.025)
RBF (gamma=0.1)      | 정확도: 0.887 (±0.031)
RBF (gamma=1)        | 정확도: 0.907 (±0.022)
RBF (gamma=10)       | 정확도: 0.890 (±0.035)
```

Linear 커널로는 반달 모양 데이터를 제대로 분리하지 못한다. RBF 커널을 쓰면 비선형 경계가 가능해지면서 정확도가 올라간다. 하지만 gamma=10처럼 너무 높이면 각 데이터 포인트에 과하게 맞추면서 다시 성능이 떨어진다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ C와 gamma는 함께 튜닝해야 한다</strong><br>
  C는 오분류 허용 정도를, gamma는 결정 경계의 복잡도를 제어한다. 둘 다 높으면 극단적 과적합, 둘 다 낮으면 과소적합이 된다. GridSearchCV로 두 파라미터를 동시에 탐색하는 것이 핵심이다.
</div>

---

## sklearn 실전 코드

Breast Cancer 데이터셋으로 SVM 파이프라인을 구성해보자. 전처리(스케일링), 모델 훈련, 하이퍼파라미터 튜닝까지 한 번에 진행한다.

```python
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, classification_report

# 데이터 준비
data = load_breast_cancer()
X_train, X_test, y_train, y_test = train_test_split(
    data.data, data.target, test_size=0.2, random_state=42
)

# 파이프라인: StandardScaler → SVC
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('svc', SVC())
])

# GridSearchCV로 C, gamma 동시 탐색
param_grid = {
    'svc__C': [0.1, 1, 10, 100],
    'svc__gamma': ['scale', 0.01, 0.1, 1],
    'svc__kernel': ['rbf']
}

grid = GridSearchCV(pipe, param_grid, cv=5, scoring='accuracy', n_jobs=-1)
grid.fit(X_train, y_train)

print(f"최적 파라미터: {grid.best_params_}")
print(f"CV 정확도: {grid.best_score_:.4f}")
print(f"테스트 정확도: {grid.score(X_test, y_test):.4f}")
```

```
최적 파라미터: {'svc__C': 10, 'svc__gamma': 0.01, 'svc__kernel': 'rbf'}
CV 정확도: 0.9780
테스트 정확도: 0.9825
```

30개 특성에서 C=10, gamma=0.01이 최적으로 선택되었다. 98.25%의 테스트 정확도다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ SVM에는 반드시 스케일링이 필요하다</strong><br>
  SVM은 데이터 포인트 간 거리를 기반으로 작동한다. 변수의 스케일이 다르면 거리 계산이 왜곡된다. <code>Pipeline</code>에 <code>StandardScaler</code>를 넣는 건 선택이 아니라 필수다.
</div>

### 로지스틱 회귀, KNN과 비교

같은 데이터에서 세 모델의 성능을 비교해보자.

```python
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier

models = {
    'Logistic Regression': Pipeline([
        ('scaler', StandardScaler()),
        ('model', LogisticRegression(C=1, max_iter=1000))
    ]),
    'KNN (k=5)': Pipeline([
        ('scaler', StandardScaler()),
        ('model', KNeighborsClassifier(n_neighbors=5))
    ]),
    'SVM (RBF)': Pipeline([
        ('scaler', StandardScaler()),
        ('model', SVC(C=10, gamma=0.01, kernel='rbf'))
    ]),
}

for name, pipe in models.items():
    pipe.fit(X_train, y_train)
    train_acc = pipe.score(X_train, y_train)
    test_acc = pipe.score(X_test, y_test)
    print(f"{name:25s} | 훈련: {train_acc:.4f} | 테스트: {test_acc:.4f}")
```

```
Logistic Regression       | 훈련: 0.9890 | 테스트: 0.9737
KNN (k=5)                 | 훈련: 0.9736 | 테스트: 0.9649
SVM (RBF)                 | 훈련: 0.9912 | 테스트: 0.9825
```

이 데이터셋에서는 SVM이 가장 높은 테스트 정확도를 보인다. 물론 데이터에 따라 결과는 달라진다 — 핵심은 모델마다 강점이 다르다는 것이다.

---

## SVM의 장단점과 선택 기준

### 분류 모델 비교

| | Logistic Regression | KNN | SVM |
|---|---|---|---|
| **분류 방식** | 확률 (시그모이드) | 최근접 이웃 거리 | 최대 마진 초평면 |
| **결정 경계** | 선형 (기본) | 비선형 (자동) | 선형/비선형 (커널) |
| **학습 속도** | 빠름 | 학습 없음 (lazy) | 느림 (O(n²~n³)) |
| **예측 속도** | 빠름 | 느림 (전체 탐색) | 빠름 (서포트 벡터만) |
| **확률 출력** | 네이티브 | 가능 | Platt scaling 필요 |
| **스케일링** | 권장 | 필수 | 필수 |
| **고차원 데이터** | 보통 | 차원의 저주 | 강함 |

### 장점

SVM이 빛나는 순간들이 있다:

- **고차원 데이터에 강하다**: 텍스트 분류처럼 변수가 수천~수만 개인 경우, SVM은 마진 최대화 덕분에 차원의 저주에 상대적으로 강하다
- **일반화 성능이 좋다**: 최대 마진 원리 자체가 과적합을 억제하는 메커니즘이다
- **커널로 비선형 처리**: 커널만 바꾸면 복잡한 결정 경계도 만들 수 있다
- **서포트 벡터만 저장**: 예측 시 전체 데이터가 아닌 서포트 벡터만 참조하므로 메모리 효율적이다

### 단점

반면 분명한 한계도 있다:

- **대규모 데이터에 느리다**: 학습 시간 복잡도가 O(n²~n³)이어서, 데이터가 10만 개를 넘어가면 실용적이지 않다. 이 영역에서는 트리 기반 모델이나 신경망이 낫다
- **확률 추정이 비효율적이다**: SVM의 출력은 결정 경계까지의 거리지, 확률이 아니다. 확률이 필요하면 Platt scaling(`probability=True`)을 써야 하는데, 추가 교차 검증이 필요해 느려진다
- **스케일링 필수**: 거리 기반이므로 Feature Scaling 없이는 성능이 나오지 않는다
- **하이퍼파라미터 튜닝이 까다롭다**: C와 gamma를 동시에 탐색해야 하고, 최적값이 데이터마다 크게 다르다

### 언제 SVM을 선택할까?

결국 선택 기준은 이렇다:

- **데이터가 중소 규모**(수천~수만)이고, **고차원**이며, **명확한 마진이 존재할 때** → SVM
- **대규모 데이터**이거나 **빠른 학습이 필요할 때** → 로지스틱 회귀 또는 트리 기반 모델
- **확률 추정이 중요할 때** → 로지스틱 회귀
- **해석 가능성이 중요할 때** → 로지스틱 회귀 또는 결정 트리

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>SVM</strong>: 두 클래스 사이의 마진을 최대화하는 분류기</li>
    <li><strong>서포트 벡터</strong>: 마진 경계에 걸친 데이터 포인트. 이것만으로 결정 경계가 결정됨</li>
    <li><strong>C 파라미터</strong>: 오분류 벌점 강도. 클수록 마진 좁음(과적합), 작을수록 마진 넓음(과소적합). <a href="/ml/regularization/">규제 강도(λ)</a>의 역수</li>
    <li><strong>커널 트릭</strong>: 고차원 매핑 없이 내적만으로 비선형 분류. RBF가 기본</li>
    <li><strong>gamma</strong>: RBF의 영향 범위. 클수록 경계 복잡(과적합)</li>
    <li><strong>스케일링 필수</strong>, C와 gamma는 <code>GridSearchCV</code>로 동시 튜닝</li>
  </ul>
</div>

---

## 마치며

확률([로지스틱 회귀](/ml/logistic-regression/)), 거리(KNN), 마진(SVM) — 세 가지 전혀 다른 접근으로 분류하는 법을 배웠다. 하지만 이 모든 모델에는 공통적인 근본 문제가 있다. 모델이 단순하면 데이터의 패턴을 못 잡고, 복잡하면 노이즈까지 외운다. 다음 글에서는 [편향-분산 트레이드오프](/ml/bias-variance/)를 통해 왜 단일 모델은 한계가 있는지, 그리고 이 한계를 어떻게 진단하는지를 알아본다.

## 참고자료

- [Andrew Ng — Machine Learning Specialization: Support Vector Machines (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn — SVM Documentation](https://scikit-learn.org/stable/modules/svm.html)
- [StatQuest: Support Vector Machines (YouTube)](https://www.youtube.com/watch?v=efR1C6CvhmE)
- [An Introduction to Statistical Learning — Chapter 9: Support Vector Machines](https://www.statlearning.com/)
