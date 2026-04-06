---
date: '2026-01-28'
title: '하이퍼파라미터 튜닝: Grid Search, Random Search, Bayesian Optimization'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 28
tags: ['Hyperparameter Tuning', '하이퍼파라미터', 'Grid Search', 'Random Search', 'Bayesian Optimization', 'Optuna', '머신러닝']
summary: '모델 성능을 끌어올리는 체계적인 하이퍼파라미터 탐색법. Grid Search의 한계부터 Random Search, Bayesian Optimization(Optuna)까지.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/cross-validation/)에서 교차 검증(Cross-Validation)을 배웠다. K-Fold로 데이터를 나눠 모델을 공정하게 평가할 수 있게 됐다. 점수를 믿을 수 있게 된 것이다. 그런데 자연스럽게 다음 질문이 따라온다 — **어떻게 하면 그 점수를 더 높일 수 있는가?**

모델의 구조를 바꾸는 것도 방법이지만, 같은 모델이라도 **하이퍼파라미터 설정에 따라 성능이 크게 달라진다**. 랜덤 포레스트의 트리 수를 100으로 할지 500으로 할지, XGBoost의 learning_rate를 0.1로 할지 0.01로 할지 — 이 선택이 정확도 몇 퍼센트를 좌우한다. 이 글에서는 하이퍼파라미터를 체계적으로 탐색하는 방법을 정리한다.

---

## 파라미터 vs 하이퍼파라미터

먼저 용어를 구분하자. 둘은 자주 혼동되지만 본질적으로 다르다.

**파라미터(Parameter)** 는 모델이 학습 과정에서 **스스로 배우는 값**이다.

```
선형 회귀: 가중치 w, 편향 b
신경망:    각 층의 가중치 행렬 W, 편향 벡터 b
결정 트리: 각 노드의 분기 기준값
```

**하이퍼파라미터(Hyperparameter)** 는 학습 **전에 사람이 설정하는 값**이다. 모델이 데이터를 보기 전에 결정해야 한다.

```
랜덤 포레스트: n_estimators, max_depth, max_features
XGBoost:      learning_rate, max_depth, n_estimators, reg_lambda
신경망:        학습률, 배치 크기, 은닉층 수, 은닉 노드 수
```

파라미터는 경사 하강법 등 [옵티마이저](/ml/optimizers/)가 자동으로 최적화한다. 하이퍼파라미터는 그런 자동 최적화 대상이 아니다 — 우리가 직접 좋은 값을 찾아야 한다. 그 과정이 바로 **하이퍼파라미터 튜닝**이다.

---

## 수동 튜닝: 직관에 의존하는 방법

가장 원시적인 방법은 수동 튜닝이다. 값을 하나 넣고, 학습시키고, 결과를 보고, 다시 바꾸고 — 이 과정을 반복한다.

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

# 시도 1
rf = RandomForestClassifier(n_estimators=100, max_depth=5)
print(cross_val_score(rf, X, y, cv=5).mean())  # 0.847

# 시도 2 — max_depth를 올려보자
rf = RandomForestClassifier(n_estimators=100, max_depth=10)
print(cross_val_score(rf, X, y, cv=5).mean())  # 0.862

# 시도 3 — n_estimators도 늘려볼까
rf = RandomForestClassifier(n_estimators=300, max_depth=10)
print(cross_val_score(rf, X, y, cv=5).mean())  # 0.871
```

이 방법의 문제점:

1. **재현 불가능** — 어떤 조합을 시도했는지 기록하지 않으면 추적이 안 된다
2. **비체계적** — 직관에 의존하므로 좋은 영역을 놓칠 수 있다
3. **시간 낭비** — 사람이 루프를 돌아야 한다

수동 튜닝은 탐색 범위를 잡기 위한 초기 실험으로는 괜찮지만, 최종 성능을 끌어올리는 방법으로는 부족하다. 자동화된 탐색이 필요하다.

---

## Grid Search: 모든 조합을 시도한다

Grid Search는 가장 직관적인 자동 탐색법이다. 각 하이퍼파라미터에 대해 후보 값들을 정의하고, **가능한 모든 조합**을 시도한다.

```python
from sklearn.model_selection import GridSearchCV

param_grid = {
    'n_estimators': [100, 200, 300],
    'max_depth': [5, 10, 15, 20],
    'max_features': ['sqrt', 'log2']
}

grid_search = GridSearchCV(
    estimator=RandomForestClassifier(random_state=42),
    param_grid=param_grid,
    cv=5,
    scoring='accuracy',
    n_jobs=-1,          # 모든 CPU 코어 사용
    verbose=1
)

grid_search.fit(X_train, y_train)

print(f"최적 파라미터: {grid_search.best_params_}")
print(f"최적 CV 점수: {grid_search.best_score_:.4f}")
```

위 예시에서 총 조합 수는 3 x 4 x 2 = **24개**. 각 조합마다 5-fold CV를 수행하므로, 모델 학습 횟수는 24 x 5 = **120번**이다.

`GridSearchCV`의 장점은 명확하다 — 정의한 범위 내에서 **최적 조합을 반드시 찾는다**. 하지만 이 "반드시"가 문제를 만든다.

---

## Grid Search의 한계: 차원의 저주

하이퍼파라미터가 3개이고 각각 후보가 4개면 조합은 4³ = 64개. 관리 가능하다. 하지만 하이퍼파라미터가 늘어나면?

```
하이퍼파라미터 3개 × 후보 4개 =   64 조합
하이퍼파라미터 5개 × 후보 4개 = 1,024 조합
하이퍼파라미터 7개 × 후보 4개 = 16,384 조합
하이퍼파라미터 10개 × 후보 4개 = 1,048,576 조합
```

기하급수적으로 증가한다. [XGBoost](/ml/xgboost-vs-lightgbm/)처럼 튜닝 가능한 하이퍼파라미터가 10개 이상인 모델에서 Grid Search는 사실상 불가능하다.

더 근본적인 문제가 있다. Grid Search는 **격자점만 탐색한다**. learning_rate 후보를 [0.01, 0.1, 1.0]으로 설정했는데, 실제 최적값이 0.03이라면? 격자 사이에 있는 값은 영원히 발견할 수 없다.

또한 Grid Search는 **모든 하이퍼파라미터를 동등하게 취급한다**. 실제로는 성능에 미치는 영향이 파라미터마다 크게 다르다. learning_rate는 민감하지만 n_estimators는 어느 정도 크기만 되면 큰 차이가 없는 경우가 많다. Grid Search는 이런 중요도 차이를 무시하고 모든 조합을 동일한 비용으로 탐색한다 — 비효율적이다.

---

## Random Search: 무작위가 더 효율적인 이유

Random Search는 격자 대신 **각 하이퍼파라미터의 분포에서 무작위로 샘플링**한다. Bergstra & Bengio (2012)의 논문 "Random Search for Hyper-Parameter Optimization"에서 그 효과가 증명됐다.

```python
from sklearn.model_selection import RandomizedSearchCV
from scipy.stats import randint, uniform

param_distributions = {
    'n_estimators': randint(100, 500),       # 100~499 균등 분포
    'max_depth': randint(3, 20),             # 3~19 균등 분포
    'max_features': ['sqrt', 'log2'],
    'min_samples_split': randint(2, 20),
    'min_samples_leaf': randint(1, 10)
}

random_search = RandomizedSearchCV(
    estimator=RandomForestClassifier(random_state=42),
    param_distributions=param_distributions,
    n_iter=60,          # 60개 조합만 시도
    cv=5,
    scoring='accuracy',
    random_state=42,
    n_jobs=-1
)

random_search.fit(X_train, y_train)

print(f"최적 파라미터: {random_search.best_params_}")
print(f"최적 CV 점수: {random_search.best_score_:.4f}")
```

### 왜 무작위가 격자보다 나은가

핵심 직관은 이렇다. 하이퍼파라미터 2개가 있는데, 실제로 성능에 중요한 건 1개뿐이라고 가정하자.

```
Grid Search (9회 탐색):

  파라미터 B (덜 중요)
  │ ● ● ●
  │ ● ● ●
  │ ● ● ●
  └──────── 파라미터 A (중요)
  → 파라미터 A에 대해 3개 값만 탐색

Random Search (9회 탐색):

  파라미터 B (덜 중요)
  │   ●     ●
  │ ●    ●
  │    ●   ●
  │  ●       ●  ●
  └──────────── 파라미터 A (중요)
  → 파라미터 A에 대해 9개 값을 탐색
```

Grid Search는 9번 시도해도 "중요한" 파라미터 A를 3개 값에서만 평가한다. 나머지 6번은 덜 중요한 파라미터 B의 변화만 보는 셈이다. Random Search는 9번 시도에서 파라미터 A의 **서로 다른 9개 값**을 탐색한다. 중요한 차원에서의 탐색 밀도가 훨씬 높다.

Bergstra & Bengio는 논문에서 하이퍼파라미터 공간에 "중요한 차원"과 "덜 중요한 차원"이 섞여 있을 때 — 현실에서 거의 항상 그렇다 — Random Search가 같은 예산으로 더 좋은 결과를 낸다는 것을 이론적, 실험적으로 보였다.

실전 가이드라인: **하이퍼파라미터가 3개 이하이고 후보 값이 명확하면 Grid Search**, 그 외에는 **Random Search**를 기본으로 쓴다.

---

## Bayesian Optimization: 이전 결과를 기억하는 탐색

Grid Search와 Random Search에는 공통적인 약점이 있다. 각 시도가 **독립적**이다. 이전에 어떤 조합이 좋았는지 전혀 활용하지 않는다. 99번째 시도의 결과가 100번째 시도에 영향을 주지 않는다.

**Bayesian Optimization**은 다르다. 이전 평가 결과를 바탕으로 **다음에 어디를 탐색할지 결정한다**. 핵심 아이디어는 두 가지다:

### 1. 대리 모델(Surrogate Model)

하이퍼파라미터 → 성능 의 관계를 근사하는 모델을 만든다. 실제 모델을 학습시키는 것은 비용이 크지만, 대리 모델은 가볍다.

```
실제 목적 함수:   f(하이퍼파라미터) = CV 점수  ← 비용이 크다 (모델 학습 필요)
대리 모델:       ĝ(하이퍼파라미터) ≈ f       ← 비용이 작다 (예측만)
```

대리 모델의 종류:
- **가우시안 프로세스(GP)**: 평균과 불확실성을 동시에 예측. 저차원에서 강력
- **TPE(Tree-structured Parzen Estimator)**: 좋은 결과/나쁜 결과 영역을 분리하여 다음 탐색 방향 제안. 고차원에서 효율적
- **랜덤 포레스트**: SMAC 프레임워크에서 사용

### 2. 획득 함수(Acquisition Function)

대리 모델의 예측을 바탕으로, **다음에 어떤 하이퍼파라미터를 시도할지** 결정하는 전략이다. 두 가지 상충하는 목표의 균형을 잡는다:

```
Exploitation (활용): 현재까지 좋았던 영역 근처를 집중 탐색
Exploration (탐색):  아직 시도하지 않은 미지의 영역 탐색
```

대표적인 획득 함수:
- **EI (Expected Improvement)**: 현재 최고 점수 대비 개선 기댓값을 최대화
- **PI (Probability of Improvement)**: 개선될 확률을 최대화
- **UCB (Upper Confidence Bound)**: 예측 평균 + 불확실성의 가중합을 최대화

Bayesian Optimization의 전체 흐름:

```
1. 초기 몇 개의 하이퍼파라미터 조합을 무작위로 평가
2. 결과로 대리 모델 학습
3. 획득 함수를 통해 다음 탐색 지점 선택
4. 해당 지점에서 실제 모델 학습 + 평가
5. 결과를 대리 모델에 추가하고 업데이트
6. 3~5 반복
```

이 방식은 **탐색 예산이 제한적일 때** 특히 효과적이다. 모델 학습 한 번에 수 분~수 시간이 걸리는 딥러닝에서 100번의 시도 대신 20~30번으로 유사한 결과를 얻을 수 있다.

---

## Optuna: 실전 Bayesian Optimization

Optuna는 Bayesian Optimization을 쉽게 사용할 수 있게 해주는 Python 라이브러리다. 기본 샘플러로 **TPE(Tree-structured Parzen Estimator)** 를 사용한다.

### 기본 사용법

```python
import optuna
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

def objective(trial):
    """Optuna가 최적화할 목적 함수"""
    # 하이퍼파라미터 탐색 공간 정의
    n_estimators = trial.suggest_int('n_estimators', 100, 500)
    max_depth = trial.suggest_int('max_depth', 3, 20)
    max_features = trial.suggest_categorical('max_features', ['sqrt', 'log2'])
    min_samples_split = trial.suggest_int('min_samples_split', 2, 20)
    min_samples_leaf = trial.suggest_int('min_samples_leaf', 1, 10)

    rf = RandomForestClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        max_features=max_features,
        min_samples_split=min_samples_split,
        min_samples_leaf=min_samples_leaf,
        random_state=42
    )

    score = cross_val_score(rf, X_train, y_train, cv=5, scoring='accuracy')
    return score.mean()

# 스터디 생성 및 최적화 실행
study = optuna.create_study(direction='maximize')
study.optimize(objective, n_trials=50)

print(f"최적 파라미터: {study.best_params}")
print(f"최적 CV 점수: {study.best_value:.4f}")
```

Optuna의 핵심 장점:

1. **Define-by-run**: 탐색 공간을 코드 안에서 동적으로 정의한다. 조건부 하이퍼파라미터도 자연스럽게 표현 가능
2. **Pruning**: 학습 도중 성능이 나쁘면 조기 중단. 시간 절약
3. **시각화**: `optuna.visualization`으로 탐색 과정을 한눈에 파악

### XGBoost + Optuna 전체 예시

[XGBoost](/ml/xgboost-vs-lightgbm/)의 하이퍼파라미터를 Optuna로 탐색하는 실전 코드다.

```python
import optuna
import xgboost as xgb
from sklearn.model_selection import cross_val_score
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split

# 데이터 준비
X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

def objective(trial):
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'reg_lambda': trial.suggest_float('reg_lambda', 1e-3, 10.0, log=True),
        'reg_alpha': trial.suggest_float('reg_alpha', 1e-3, 10.0, log=True),
        'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
    }

    model = xgb.XGBClassifier(
        **params,
        tree_method='hist',
        random_state=42,
        eval_metric='logloss'
    )

    scores = cross_val_score(
        model, X_train, y_train,
        cv=5, scoring='accuracy'
    )
    return scores.mean()

# Optuna 스터디 실행
study = optuna.create_study(direction='maximize')
study.optimize(objective, n_trials=100, show_progress_bar=True)

# 결과 확인
print(f"\n최적 CV 점수: {study.best_value:.4f}")
print(f"최적 하이퍼파라미터:")
for key, value in study.best_params.items():
    print(f"  {key}: {value}")

# 최적 파라미터로 최종 모델 학습
best_model = xgb.XGBClassifier(
    **study.best_params,
    tree_method='hist',
    random_state=42,
    eval_metric='logloss'
)
best_model.fit(X_train, y_train)
test_score = best_model.score(X_test, y_test)
print(f"\n테스트 점수: {test_score:.4f}")
```

`suggest_float(..., log=True)`는 로그 스케일 샘플링이다. learning_rate처럼 0.001~1.0 범위를 탐색할 때, 선형 균등 분포로 뽑으면 대부분의 샘플이 0.5~1.0에 몰린다. 로그 스케일로 뽑으면 0.001~0.01, 0.01~0.1, 0.1~1.0 각 구간에서 비슷한 밀도로 탐색한다. [규제](/ml/regularization/) 강도나 학습률처럼 스케일이 넓은 하이퍼파라미터에는 **항상 log=True를 쓴다**.

### 탐색 과정 시각화

```python
# 최적화 이력 시각화
optuna.visualization.plot_optimization_history(study)

# 하이퍼파라미터 중요도
optuna.visualization.plot_param_importances(study)

# 하이퍼파라미터 간 관계
optuna.visualization.plot_contour(study, params=['learning_rate', 'max_depth'])
```

`plot_param_importances`는 어떤 하이퍼파라미터가 성능에 가장 큰 영향을 주는지 보여준다. 보통 learning_rate와 max_depth가 상위에 온다.

---

## Successive Halving: 빠른 조기 탈락

sklearn 0.24+에서 `HalvingGridSearchCV`와 `HalvingRandomSearchCV`를 제공한다. 아이디어는 단순하다 — 많은 후보를 적은 리소스로 평가하고, 하위 후보를 탈락시키면서 점차 리소스를 늘린다.

```python
from sklearn.experimental import enable_halving_search_cv
from sklearn.model_selection import HalvingRandomSearchCV
from scipy.stats import randint, uniform

param_distributions = {
    'n_estimators': randint(100, 500),
    'max_depth': randint(3, 20),
    'max_features': ['sqrt', 'log2'],
    'min_samples_split': randint(2, 20),
}

halving_search = HalvingRandomSearchCV(
    estimator=RandomForestClassifier(random_state=42),
    param_distributions=param_distributions,
    n_candidates=100,     # 초기 후보 100개
    factor=3,             # 매 라운드 1/3만 생존
    resource='n_samples', # 리소스 = 데이터 샘플 수
    cv=5,
    random_state=42,
    n_jobs=-1
)

halving_search.fit(X_train, y_train)
```

```
라운드 1: 100개 후보 × 소량 데이터 → 상위 33개 생존
라운드 2:  33개 후보 × 3배 데이터 → 상위 11개 생존
라운드 3:  11개 후보 × 9배 데이터 → 상위  4개 생존
라운드 4:   4개 후보 × 전체 데이터 → 최종 1개 선택
```

전체 데이터로 100번 학습하는 대신, 적은 데이터로 빠르게 걸러내고 유망한 후보에만 전체 데이터를 쓴다. 총 연산량이 크게 줄어든다.

---

## 모델별 주요 하이퍼파라미터 정리

어떤 하이퍼파라미터를 튜닝해야 할지 모르면 시작할 수 없다. 모델별로 중요한 하이퍼파라미터와 일반적인 탐색 범위를 정리한다.

### 랜덤 포레스트

[랜덤 포레스트](/ml/random-forest/)에서 배운 핵심 파라미터들이다.

| 하이퍼파라미터 | 역할 | 탐색 범위 | 참고 |
|-------------|------|----------|------|
| `n_estimators` | 트리 수 | 100~500 | 많을수록 좋지만 수익 체감 |
| `max_depth` | 트리 최대 깊이 | 5~30 또는 None | 과적합 제어 |
| `max_features` | 노드당 고려 특성 수 | 'sqrt', 'log2', 0.3~0.8 | 트리 간 상관관계 조절 |
| `min_samples_split` | 분할 최소 샘플 수 | 2~20 | 과적합 방지 |
| `min_samples_leaf` | 리프 최소 샘플 수 | 1~10 | 과적합 방지 |

### XGBoost / LightGBM

| 하이퍼파라미터 | 역할 | 탐색 범위 | 스케일 |
|-------------|------|----------|-------|
| `learning_rate` | 각 트리의 기여도 | 0.01~0.3 | **log** |
| `max_depth` | 트리 깊이 | 3~10 | linear |
| `n_estimators` | 부스팅 라운드 수 | 100~1000 | linear |
| `subsample` | 행 샘플링 비율 | 0.6~1.0 | linear |
| `colsample_bytree` | 열 샘플링 비율 | 0.6~1.0 | linear |
| `reg_lambda` (L2) | L2 [규제](/ml/regularization/) 강도 | 0.001~10 | **log** |
| `reg_alpha` (L1) | L1 규제 강도 | 0.001~10 | **log** |
| `min_child_weight` | 리프 최소 헤시안 합 | 1~10 | linear |

### 신경망

| 하이퍼파라미터 | 역할 | 탐색 범위 | 스케일 |
|-------------|------|----------|-------|
| learning_rate | [옵티마이저](/ml/optimizers/) 학습률 | 1e-5~1e-1 | **log** |
| batch_size | 미니배치 크기 | 16, 32, 64, 128, 256 | categorical |
| hidden_layers | 은닉층 수 | 1~5 | linear |
| hidden_units | 층당 노드 수 | 32~512 | linear |
| dropout | 드롭아웃 비율 | 0.0~0.5 | linear |
| weight_decay | L2 규제 | 1e-5~1e-2 | **log** |

스케일이 **log**인 파라미터는 Optuna에서 `log=True`, Random Search에서는 `loguniform` 분포를 쓴다.

---

## Nested CV: 튜닝과 평가를 분리하라

하이퍼파라미터 튜닝에 CV를 사용하고, 그 결과를 최종 성능으로 보고하면 **데이터 누수**가 발생한다. 튜닝 과정에서 검증 데이터를 이미 "보고" 최적화했기 때문이다. [교차 검증](/ml/cross-validation/)에서 배운 원칙을 떠올려보자 — 평가 데이터는 학습 과정에 영향을 주면 안 된다.

해결책은 **Nested CV(중첩 교차 검증)** 이다. 외부 루프에서 평가하고, 내부 루프에서 튜닝한다.

```
외부 CV (평가용) — 5-Fold
├── Fold 1: Train(2,3,4,5) / Test(1)
│   └── 내부 CV (튜닝용) — 3-Fold
│       └── GridSearchCV로 최적 하이퍼파라미터 탐색
│       └── 최적 파라미터로 Train(2,3,4,5) 전체 학습 → Test(1) 평가
├── Fold 2: Train(1,3,4,5) / Test(2)
│   └── 내부 CV (튜닝용) — 3-Fold
│       └── ...
└── ...

→ 외부 5개 Fold의 테스트 점수 평균 = 편향 없는 최종 성능
```

```python
from sklearn.model_selection import cross_val_score, GridSearchCV

# 내부 CV: 하이퍼파라미터 튜닝
inner_cv = GridSearchCV(
    estimator=RandomForestClassifier(random_state=42),
    param_grid={
        'n_estimators': [100, 200, 300],
        'max_depth': [5, 10, 15]
    },
    cv=3,
    scoring='accuracy',
    n_jobs=-1
)

# 외부 CV: 편향 없는 성능 평가
outer_scores = cross_val_score(
    inner_cv,       # GridSearchCV 객체를 그대로 넣는다
    X, y,
    cv=5,
    scoring='accuracy'
)

print(f"Nested CV 점수: {outer_scores.mean():.4f} ± {outer_scores.std():.4f}")
```

sklearn에서는 `GridSearchCV` 객체를 `cross_val_score`에 그대로 전달하면 Nested CV가 자동으로 구현된다. 외부 Fold마다 내부에서 최적 파라미터를 새로 탐색하므로, 각 외부 Fold의 테스트 점수는 **튜닝 과정에 오염되지 않은** 순수한 성능 추정치다.

Nested CV는 연산 비용이 높다(내부 CV x 외부 CV). 실전에서는:
- **모델 선택 & 최종 성능 보고**: Nested CV 사용
- **최종 모델 학습**: 전체 데이터로 일반 CV 튜닝 후 학습

---

## 실전 팁

### 1. Coarse-to-fine: 넓게 시작하고 좁혀라

처음부터 촘촘한 격자를 짜면 비효율적이다. 먼저 넓은 범위에서 Random Search로 유망 영역을 찾고, 그 근처에서 좁은 범위로 다시 탐색한다.

```python
# 1단계: 넓은 범위 탐색
param_dist_coarse = {
    'learning_rate': [0.001, 0.01, 0.1, 0.3],
    'max_depth': [3, 5, 7, 10, 15],
    'n_estimators': [100, 300, 500, 1000],
}
# → 결과: learning_rate=0.1, max_depth=5 근처가 좋다

# 2단계: 유망 영역 정밀 탐색
param_dist_fine = {
    'learning_rate': uniform(0.05, 0.2),       # 0.05~0.25
    'max_depth': randint(4, 8),                 # 4~7
    'n_estimators': randint(200, 600),           # 200~599
}
```

### 2. 스케일이 넓으면 로그 스케일을 쓰자

learning_rate 범위가 0.001~1.0이면, 선형 균등 분포는 0.001~0.01 구간에서 1%밖에 탐색하지 않는다. 로그 스케일을 써야 각 자릿수에서 균등하게 탐색한다.

```python
# 나쁜 예: 선형 균등 분포
trial.suggest_float('lr', 0.001, 1.0)
# → 0.5~1.0 구간에서 50% 샘플링

# 좋은 예: 로그 균등 분포
trial.suggest_float('lr', 0.001, 1.0, log=True)
# → 0.001~0.01, 0.01~0.1, 0.1~1.0 각 구간에서 ~33% 샘플링
```

### 3. 탐색 순서를 정하자

모든 하이퍼파라미터를 한꺼번에 튜닝하면 탐색 공간이 폭발한다. 실전에서는 영향이 큰 것부터 순서대로 잡는다.

```
XGBoost 튜닝 순서 (권장):
1. learning_rate, n_estimators  ← 가장 큰 영향
2. max_depth, min_child_weight  ← 트리 복잡도
3. subsample, colsample_bytree  ← 샘플링
4. reg_lambda, reg_alpha        ← 규제
```

### 4. Early Stopping과 함께 쓰자

XGBoost/LightGBM에서는 n_estimators를 크게 잡고 early stopping으로 자동 결정하면, 튜닝할 파라미터를 하나 줄일 수 있다.

```python
def objective(trial):
    params = {
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'n_estimators': 1000,  # 충분히 크게
        # ...
    }

    model = xgb.XGBClassifier(**params, early_stopping_rounds=50)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    return model.best_score  # early stopping 시점의 점수
```

### 5. 재현성을 확보하자

`random_state`를 고정하고, Optuna의 `sampler`에도 seed를 설정한다.

```python
sampler = optuna.samplers.TPESampler(seed=42)
study = optuna.create_study(direction='maximize', sampler=sampler)
```

---

## 정리: 어떤 방법을 쓸 것인가

| 방법 | 장점 | 단점 | 추천 상황 |
|------|------|------|----------|
| Grid Search | 구현 간단, 완전 탐색 | 차원의 저주, 격자만 탐색 | 파라미터 2~3개, 후보 명확 |
| Random Search | 효율적, 구현 간단 | 이전 결과 미활용 | 범용 기본 선택 |
| Bayesian (Optuna) | 효율적, 이전 결과 활용 | 구현 약간 복잡 | 학습 비용 클 때, 최대 성능 필요 |
| Halving Search | 빠른 초기 탈락 | sklearn 실험적 | 후보 많고 시간 제한 |

실전 권장 흐름:

```
1. 수동 튜닝으로 합리적인 탐색 범위 설정
2. Random Search로 넓은 영역 탐색 (coarse)
3. Optuna로 유망 영역 정밀 탐색 (fine)
4. Nested CV로 최종 성능 보고
```

하이퍼파라미터 튜닝은 모델 자체를 바꾸는 것만큼 성능에 영향을 준다. [랜덤 포레스트](/ml/random-forest/)의 기본 설정과 튜닝된 설정의 차이가 3~5%p인 경우는 흔하고, [XGBoost](/ml/xgboost-vs-lightgbm/)에서는 그 이상이 되기도 한다. 모델 선택 → 하이퍼파라미터 튜닝 → 앙상블 순으로 성능을 끌어올리는 것이 정형 데이터 머신러닝의 표준 워크플로우다.

---

다음 글에서는 이 시리즈의 실전 마무리로, **[ML 실전 어드바이스](/ml/ml-practical-advice/)** 를 다룬다. 데이터 수집부터 모델 배포까지, 각 단계에서 자주 하는 실수와 체크리스트를 정리한다.
