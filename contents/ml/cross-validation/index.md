---
date: '2026-01-27'
title: '교차 검증(Cross-Validation): K-Fold, Stratified, Time Series Split'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 27
tags: ['Cross-Validation', '교차 검증', 'K-Fold', 'Stratified', 'Time Series Split', '머신러닝']
summary: 'Hold-out의 한계에서 K-Fold, Stratified K-Fold, Leave-One-Out, Time Series Split까지. 모델 평가의 신뢰도를 높이는 교차 검증 전략.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/regression-metrics/)에서 회귀 모델을 평가하는 다양한 지표를 다뤘다. MSE, MAE, R² 같은 좋은 지표를 골랐다고 치자. 그런데 한 가지 질문이 남는다 — **그 점수를 얼마나 믿을 수 있는가?**

데이터를 한 번 나눠서 테스트 점수를 구했다. 0.87이 나왔다. 그런데 데이터를 다르게 나누면? 0.92가 나올 수도, 0.79가 나올 수도 있다. 운 좋게 쉬운 샘플이 테스트셋에 몰렸을 수도 있고, 반대로 어려운 이상치만 잔뜩 걸렸을 수도 있다. 한 번의 split으로 얻은 점수에 모델의 운명을 걸어도 될까?

교차 검증(Cross-Validation)은 이 문제에 대한 답이다. 데이터를 여러 번, 다른 방식으로 나눠서 모델을 반복 평가한다. 한 번의 lucky split이나 unlucky split에 흔들리지 않는, **신뢰할 수 있는 성능 추정치**를 얻는 게 목표다.

---

## Hold-out: 단순하지만 불안정하다

가장 기본적인 모델 평가 방법은 Hold-out이다. 데이터를 훈련셋과 테스트셋으로 한 번 나누고, 훈련셋으로 학습한 뒤 테스트셋으로 점수를 구한다.

```python
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
accuracy = accuracy_score(y_test, model.predict(X_test))
```

간단하고 빠르다. 하지만 치명적인 약점이 있다 — **분산이 높다.**

`random_state`를 바꿔가며 10번 돌려보면 이게 바로 보인다.

```python
scores = []
for seed in range(10):
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=seed)
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_tr, y_tr)
    scores.append(accuracy_score(y_te, model.predict(X_te)))

print(f"Min: {min(scores):.4f}, Max: {max(scores):.4f}, Std: {np.std(scores):.4f}")
```

데이터가 수십만 건이면 편차가 작겠지만, 수백~수천 건일 때는 split에 따라 점수가 5~10%p까지 흔들린다. [편향-분산 트레이드오프](/ml/bias-variance/)에서 배운 것처럼, 분산이 높은 추정치는 믿을 수 없다.

Hold-out의 또 다른 문제: 데이터를 80/20으로 나누면, 모델은 전체 데이터의 80%만 학습에 사용한다. 데이터가 귀한 상황에서는 20%를 평가용으로 "버리는" 게 아깝다.

---

## K-Fold Cross-Validation

K-Fold는 Hold-out의 두 가지 문제를 동시에 해결한다.

### 작동 방식

1. 전체 데이터를 K개의 동일한 크기의 조각(fold)으로 나눈다
2. 첫 번째 fold를 검증셋으로, 나머지 K-1개를 훈련셋으로 사용한다
3. 모델을 학습하고 검증셋으로 점수를 구한다
4. 다음 fold를 검증셋으로 바꿔서 반복한다
5. K번 반복하면, 모든 데이터가 정확히 한 번씩 검증셋이 된다
6. K개의 점수를 평균내서 최종 성능 추정치로 사용한다

```
K=5 예시:

Fold 1: [검증] [훈련] [훈련] [훈련] [훈련]  → Score₁
Fold 2: [훈련] [검증] [훈련] [훈련] [훈련]  → Score₂
Fold 3: [훈련] [훈련] [검증] [훈련] [훈련]  → Score₃
Fold 4: [훈련] [훈련] [훈련] [검증] [훈련]  → Score₄
Fold 5: [훈련] [훈련] [훈련] [훈련] [검증]  → Score₅

최종 점수 = (Score₁ + Score₂ + ... + Score₅) / 5
```

### 왜 분산이 줄어드는가?

Hold-out은 하나의 split에서 하나의 점수를 얻는다. K-Fold는 K개의 서로 다른 split에서 K개의 점수를 얻는다. 평균을 내면 하나의 운 좋은(또는 나쁜) split에 의한 변동이 상쇄된다.

동시에, 각 반복에서 전체 데이터의 (K-1)/K를 훈련에 사용한다. K=5이면 80%, K=10이면 90%. 모든 데이터 포인트가 훈련에도, 검증에도 참여하므로 **데이터 활용 효율**도 높다.

### K는 얼마로?

실무에서는 **K=5 또는 K=10**이 표준이다.

| K | 훈련 비율 | 편향 | 분산 | 계산 비용 |
|---|---|---|---|---|
| 2 | 50% | 높음 (과소추정) | 높음 | 낮음 |
| 5 | 80% | 중간 | 중간 | 중간 |
| 10 | 90% | 낮음 | 약간 높음 | 높음 |
| N (LOO) | 99%+ | 매우 낮음 | 높음 | 매우 높음 |

K가 작으면 훈련 데이터가 적어서 성능이 과소 추정된다(높은 편향). K가 크면 각 훈련셋이 거의 동일해져서 fold 간 점수의 상관관계가 높아진다. 독립적인 K개 추정값의 평균은 분산이 1/K로 줄지만, 상관관계가 높으면 이 감소 효과가 약해져 결국 분산이 높아진다. K=5~10이 이 둘의 균형점이다. [편향-분산 트레이드오프](/ml/bias-variance/)의 또 다른 사례인 셈이다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실전에서는...</strong><br>
  확신이 없으면 <strong>K=5</strong>로 시작하자. 데이터가 수만 건 이상이면 K=5로 충분하고, 수백 건 이하로 적으면 K=10이나 Repeated K-Fold를 고려한다. 시간이 넉넉하면 Repeated 5-Fold(5회 반복)가 가장 안정적인 추정치를 준다.
</div>

---

## Stratified K-Fold

기본 K-Fold에는 숨겨진 위험이 있다. **클래스 비율이 불균형한 데이터**에서 문제가 된다.

전체 데이터에서 양성 클래스가 10%라고 하자. 운이 나쁘면 어떤 fold에는 양성이 2%만 들어가고, 다른 fold에는 18%가 몰릴 수 있다. 각 fold의 데이터 분포가 전체와 다르면, 점수의 편차가 커지고 추정치가 왜곡된다.

**Stratified K-Fold**는 각 fold에서 클래스 비율이 전체 데이터와 동일하도록 보장한다.

```
전체 데이터: 양성 10%, 음성 90%

기본 K-Fold (fold별 양성 비율이 다를 수 있음):
  Fold 1: 양성 8%   Fold 2: 양성 14%  Fold 3: 양성 7%  ...

Stratified K-Fold (fold별 양성 비율 유지):
  Fold 1: 양성 10%  Fold 2: 양성 10%  Fold 3: 양성 10%  ...
```

[분류 평가 지표](/ml/classification-metrics/)에서 다뤘듯이, 불균형 데이터에서는 Accuracy 대신 Precision, Recall, F1을 써야 한다. 그런데 아무리 좋은 지표를 써도 fold별 클래스 비율이 들쭉날쭉하면 점수 자체가 의미없다. Stratified K-Fold는 이 문제를 원천 차단한다.

sklearn에서 분류 문제에 `cross_val_score`를 쓰면 **기본값이 Stratified K-Fold**다. 의식하지 않아도 알아서 적용된다.

```python
from sklearn.model_selection import StratifiedKFold

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
    print(f"Fold {fold}: 훈련 양성 비율 = {y[train_idx].mean():.3f}, "
          f"검증 양성 비율 = {y[val_idx].mean():.3f}")
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 회귀에서는?</strong><br>
  회귀 문제에는 클래스 레이블이 없으므로 Stratified K-Fold를 직접 쓸 수 없다. 타깃 값을 구간(bin)으로 나눈 뒤 해당 bin을 기준으로 층화하거나, 단순 K-Fold를 쓰되 shuffle=True로 무작위 섞는 것이 일반적이다.
</div>

---

## Leave-One-Out (LOO)

K-Fold에서 K를 데이터 개수 N과 같게 설정하면, 매번 1개의 샘플만 검증에 사용하고 나머지 N-1개로 훈련한다. 이것이 **Leave-One-Out Cross-Validation(LOOCV)** 이다.

```python
from sklearn.model_selection import LeaveOneOut, cross_val_score

loo = LeaveOneOut()
scores = cross_val_score(model, X, y, cv=loo, scoring='accuracy')
print(f"LOO 평균 정확도: {scores.mean():.4f}")
```

### 장점과 단점

**장점:**
- 훈련 데이터를 최대한 사용한다 (N-1개). 편향이 매우 낮다
- 결과가 결정적이다 — 랜덤성이 없다

**단점:**
- N번 모델을 학습해야 한다. 데이터가 10,000개면 모델을 10,000번 학습한다. 계산 비용이 막대하다
- 각 검증셋이 1개의 샘플이므로 fold별 점수가 0 아니면 1이다(분류의 경우). 분산이 높다
- 훈련셋끼리 N-2개의 샘플을 공유하므로 매우 유사하다 — fold 간 점수 상관관계가 높다

**언제 쓰는가?**
- 데이터가 매우 적을 때 (수십~수백 건)
- 편향 없는 추정이 분산보다 중요할 때
- 한 번의 모델 학습이 빠른 경우 (선형 모델 등)

일반적으로 K=5~10의 K-Fold가 편향-분산 균형에서 LOO보다 낫다. LOO는 특수한 상황에서만 쓰인다.

---

## Repeated K-Fold

K-Fold의 결과는 데이터를 어떻게 나누는지에 따라 달라진다. `shuffle=True`에서 `random_state`가 다르면 fold 구성이 달라지고, 점수도 약간 변한다.

**Repeated K-Fold**는 서로 다른 랜덤 시드로 K-Fold를 여러 번 반복한 뒤 전체 평균을 구한다. 5-Fold를 10번 반복하면 총 50개의 점수를 평균낸다.

```python
from sklearn.model_selection import RepeatedStratifiedKFold

rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
scores = cross_val_score(model, X, y, cv=rskf, scoring='f1')
print(f"Repeated 5-Fold (10회): {scores.mean():.4f} (+/- {scores.std():.4f})")
```

계산 비용이 K x n_repeats 배가 되지만, 성능 추정치의 안정성이 크게 올라간다. 모델 비교에서 0.01 차이가 의미 있는지 판단할 때 특히 유용하다.

---

## Time Series Split: 시계열은 다르다

주가, 센서 데이터, 로그 데이터 같은 **시계열 데이터**에서 K-Fold를 쓰면 **미래 데이터로 과거를 예측하는** 상황이 발생한다.

```
일반 K-Fold의 문제 (시계열에서):

시간 →  [1월] [2월] [3월] [4월] [5월]

Fold 3:  [훈련] [훈련] [검증] [훈련] [훈련]
          ↑ 3월을 예측하는데 4월, 5월 데이터로 학습?!
```

실제 서비스에서는 절대 미래 데이터를 볼 수 없다. 랜덤 셔플 K-Fold는 이 현실을 반영하지 못하므로, **과도하게 낙관적인** 성능 추정치를 준다.

**Time Series Split**은 항상 과거로 훈련하고 미래로 검증한다.

```
Time Series Split (5 splits):

Split 1: [훈련]  [검증]
Split 2: [훈련]  [훈련]  [검증]
Split 3: [훈련]  [훈련]  [훈련]  [검증]
Split 4: [훈련]  [훈련]  [훈련]  [훈련]  [검증]
Split 5: [훈련]  [훈련]  [훈련]  [훈련]  [훈련]  [검증]
```

훈련셋이 점점 커지고, 검증셋은 항상 훈련셋보다 미래에 위치한다. 시간 순서가 보존된다.

```python
from sklearn.model_selection import TimeSeriesSplit

tscv = TimeSeriesSplit(n_splits=5)

for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
    print(f"Split {fold}: 훈련 {len(train_idx)}개 (idx {train_idx[0]}-{train_idx[-1]}), "
          f"검증 {len(val_idx)}개 (idx {val_idx[0]}-{val_idx[-1]})")
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 시계열 데이터에서 절대 하면 안 되는 것</strong><br>
  <code>shuffle=True</code>를 넣고 일반 K-Fold를 돌리는 것. 시간 순서를 무시하면, 모델이 실전에서 절대 볼 수 없는 미래 정보로 학습한다. 평가 결과가 좋아 보이지만 실전 배포 후 성능이 급락한다.
</div>

---

## Validation Set vs Test Set: 3-way Split

여기서 흔히 혼동되는 개념을 정리하자. **검증셋(Validation Set)** 과 **테스트셋(Test Set)** 은 다르다.

```
전체 데이터
├── 훈련셋(Training Set)     → 모델 학습
├── 검증셋(Validation Set)   → 하이퍼파라미터 튜닝, 모델 선택
└── 테스트셋(Test Set)       → 최종 성능 보고 (딱 한 번만 사용)
```

교차 검증에서 "검증 fold"는 검증셋 역할을 한다. 여러 모델이나 하이퍼파라미터를 비교해서 **최고의 설정을 고르는 데** 사용한다. 이 과정에서 검증 점수를 반복적으로 들여다보므로, 검증셋에 대한 **간접적 과적합**이 발생한다.

그래서 테스트셋이 필요하다. 모든 선택이 끝난 뒤, **최종 모델을 단 한 번** 테스트셋으로 평가한다. 이 점수가 실전 성능의 불편 추정치(unbiased estimate)다.

```python
# 실전 워크플로우
# 1단계: 테스트셋 분리 (처음에 한 번)
X_dev, X_test, y_dev, y_test = train_test_split(X, y, test_size=0.15, random_state=42)

# 2단계: 개발셋에서 교차 검증으로 모델/하이퍼파라미터 선택
cv_scores = cross_val_score(model, X_dev, y_dev, cv=5, scoring='f1')
print(f"CV F1: {cv_scores.mean():.4f}")

# 3단계: 최종 모델을 전체 개발셋으로 재학습
best_model.fit(X_dev, y_dev)

# 4단계: 테스트셋으로 최종 성능 보고 (단 한 번!)
test_score = f1_score(y_test, best_model.predict(X_test))
print(f"Test F1: {test_score:.4f}")
```

---

## 교차 검증에서의 데이터 누수

교차 검증에서 가장 흔한, 그리고 가장 위험한 실수 — **전처리를 fold 밖에서 하는 것**이다.

### 잘못된 방법

```python
from sklearn.preprocessing import StandardScaler

# 전체 데이터로 스케일링 (누수!)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)  # 전체 X의 평균/표준편차 사용

# 스케일링된 데이터로 교차 검증
scores = cross_val_score(model, X_scaled, y, cv=5)
```

이 코드에서 `scaler.fit_transform(X)`이 전체 데이터의 평균과 표준편차를 계산한다. 검증 fold의 정보가 훈련 fold로 흘러들어간다 — 데이터 누수(Data Leakage)다. 실전에서는 테스트 데이터의 통계량을 모르므로, 이 점수는 과도하게 낙관적이다.

### 올바른 방법: Pipeline 사용

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

# Pipeline: 전처리가 각 fold 안에서 실행됨
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('clf', LogisticRegression())
])

# cross_val_score가 각 fold에서 pipe.fit() → pipe.predict()를 호출
# → 각 fold의 훈련 데이터만으로 fit_transform, 검증 데이터는 transform만
scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
```

`Pipeline`으로 감싸면 `cross_val_score`가 각 fold에서 자동으로 `fit`과 `transform`을 분리한다. 훈련 fold의 통계로 `fit_transform`하고, 검증 fold에는 `transform`만 적용한다. 누수가 원천 차단된다.

이 원칙은 스케일링뿐 아니라 **모든 전처리**에 적용된다:
- 결측치 대치 (Imputation)
- 특성 선택 (Feature Selection)
- PCA / 차원 축소
- 타깃 인코딩 (Target Encoding)

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 데이터 누수의 위험성</strong><br>
  누수가 있으면 CV 점수가 실전보다 높게 나온다. 모델 선택 단계에서 잘못된 선택을 하게 되고, 배포 후에 성능이 예상보다 낮아지는 원인이 된다. "CV에서 0.95였는데 실전에서 0.82밖에 안 나와요" — 십중팔구 데이터 누수다.
</div>

---

## sklearn 구현: cross_val_score와 cross_validate

### cross_val_score: 간편하게 점수 하나

```python
from sklearn.model_selection import cross_val_score

scores = cross_val_score(
    estimator=model,
    X=X, y=y,
    cv=5,                    # int → StratifiedKFold (분류) 또는 KFold (회귀)
    scoring='accuracy',      # 평가 지표
    n_jobs=-1                # 병렬 처리
)

print(f"Accuracy: {scores.mean():.4f} (+/- {scores.std():.4f})")
```

### cross_validate: 더 풍부한 결과

```python
from sklearn.model_selection import cross_validate

results = cross_validate(
    estimator=model,
    X=X, y=y,
    cv=5,
    scoring=['accuracy', 'f1', 'roc_auc'],  # 여러 지표 동시에
    return_train_score=True,                  # 훈련 점수도 반환
    n_jobs=-1
)

print(f"Test Accuracy:  {results['test_accuracy'].mean():.4f}")
print(f"Train Accuracy: {results['train_accuracy'].mean():.4f}")
print(f"Test F1:        {results['test_f1'].mean():.4f}")
print(f"Fit time:       {results['fit_time'].mean():.2f}s")
```

`return_train_score=True`를 넣으면 훈련 점수와 테스트 점수를 동시에 볼 수 있다. 훈련 점수는 높은데 테스트 점수가 낮으면? [편향-분산](/ml/bias-variance/)에서 배운 과적합 신호다.

### CV splitter 직접 전달

```python
from sklearn.model_selection import StratifiedKFold, RepeatedStratifiedKFold

# 기본 Stratified K-Fold
skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=skf)

# Repeated Stratified K-Fold
rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
scores = cross_val_score(model, X, y, cv=rskf)

# Time Series Split
tscv = TimeSeriesSplit(n_splits=5)
scores = cross_val_score(model, X, y, cv=tscv)
```

`cv` 파라미터에 정수를 넣으면 기본값을 쓰고, splitter 객체를 직접 넣으면 전략을 세밀하게 제어할 수 있다.

---

## 모델 비교: CV로 공정하게 겨루기

교차 검증의 핵심 용도 중 하나는 **여러 모델을 공정하게 비교**하는 것이다. 같은 fold 구성을 사용해야 비교가 의미 있다.

```python
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_validate, StratifiedKFold
import pandas as pd

# 동일한 CV 전략
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

models = {
    'LogisticRegression': Pipeline([
        ('scaler', StandardScaler()),
        ('clf', LogisticRegression(max_iter=1000))
    ]),
    'RandomForest': RandomForestClassifier(n_estimators=100, random_state=42),
    'GBM': GradientBoostingClassifier(n_estimators=100, random_state=42),
    'MLP': Pipeline([
        ('scaler', StandardScaler()),
        ('clf', MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=500, random_state=42))
    ]),
}

results = {}
for name, model in models.items():
    cv_result = cross_validate(
        model, X, y, cv=cv,
        scoring=['accuracy', 'f1'],
        return_train_score=True,
        n_jobs=-1
    )
    results[name] = {
        'Test Acc': f"{cv_result['test_accuracy'].mean():.4f} (+/- {cv_result['test_accuracy'].std():.4f})",
        'Test F1':  f"{cv_result['test_f1'].mean():.4f} (+/- {cv_result['test_f1'].std():.4f})",
        'Train Acc': f"{cv_result['train_accuracy'].mean():.4f}",
        'Fit Time': f"{cv_result['fit_time'].mean():.2f}s",
    }

df = pd.DataFrame(results).T
print(df)
```

핵심은 모든 모델에 **동일한 `cv` 객체**를 전달하는 것이다. 같은 fold 구성에서 평가해야 점수 차이가 모델 자체의 차이를 반영한다.

[랜덤 포레스트](/ml/random-forest/)가 좋은지, Logistic Regression이 좋은지 — Hold-out 한 번으로는 결론 내릴 수 없다. 5-Fold CV로 5개의 점수를 비교하면, 모델 A가 일관되게 B보다 높은지, 아니면 fold에 따라 엎치락뒤치락하는지 보인다. 표준편차까지 보면 점수의 신뢰 구간을 감잡을 수 있다.

---

## 어떤 CV 전략을 쓸 것인가?

| 상황 | 추천 전략 | 이유 |
|---|---|---|
| **일반 분류** | Stratified 5-Fold | 클래스 비율 유지 + 적절한 편향-분산 균형 |
| **일반 회귀** | 5-Fold or 10-Fold | 표준적이고 안정적 |
| **불균형 분류** | Stratified 5-Fold | 소수 클래스가 모든 fold에 포함되도록 보장 |
| **시계열** | TimeSeriesSplit | 시간 순서 보존 필수 |
| **데이터 매우 적음** (<100) | LOO 또는 Repeated 10-Fold | 모든 데이터를 최대한 활용 |
| **모델 비교 (최종 결정)** | Repeated Stratified 5-Fold | 가장 안정적인 추정치 |
| **하이퍼파라미터 튜닝** | Stratified 5-Fold | 속도와 신뢰도 균형 (중첩 CV 고려) |
| **그룹이 있는 데이터** | GroupKFold | 같은 그룹이 훈련/검증에 분리되지 않도록 |

마지막 행의 **GroupKFold**는 같은 환자, 같은 사용자, 같은 문서 등 **그룹 단위로 분리**해야 할 때 쓴다. 예를 들어 한 환자의 여러 검사 결과가 훈련셋과 검증셋에 나뉘면, 환자 개인의 특성을 외워서 점수가 부풀려진다. GroupKFold는 그룹 단위로 fold를 나눠서 이 누수를 방지한다.

```python
from sklearn.model_selection import GroupKFold

groups = patient_ids  # 각 샘플이 속한 그룹 (환자 ID 등)
gkf = GroupKFold(n_splits=5)
scores = cross_val_score(model, X, y, cv=gkf, groups=groups)
```

---

## 정리

| 개념 | 핵심 |
|---|---|
| Hold-out | 빠르지만 분산이 높다. 한 번의 split을 믿을 수 없다 |
| K-Fold | K번 반복해서 평균. 분산 감소 + 데이터 효율 |
| Stratified K-Fold | 클래스 비율 유지. 분류 문제의 기본값 |
| LOO | 편향 최소. 데이터 적을 때만 |
| Repeated K-Fold | 가장 안정적인 추정. 모델 비교에 강력 |
| Time Series Split | 시간 순서 보존. 시계열 필수 |
| Pipeline | 전처리를 fold 안에 넣어 데이터 누수 차단 |
| 3-way Split | 검증셋(선택용) + 테스트셋(보고용) 분리 |

교차 검증은 "모델 점수가 이 정도입니다"라는 주장에 **신뢰도**를 부여한다. Hold-out 한 번으로 0.87을 얻었다고 말하는 것과, 5-Fold CV에서 0.85 +/- 0.02를 얻었다고 말하는 건 정보량이 다르다. 후자가 훨씬 더 믿을 만한 근거다.

---

## 다음 글 미리보기

CV로 모델의 성능을 안정적으로 측정할 수 있게 됐다. 그런데 모델에는 학습 전에 사람이 정해줘야 하는 값들이 있다 — 학습률, 트리 깊이, 정규화 강도 같은 **하이퍼파라미터**. 이 값을 어떻게 찾을까? 무작위로 찍을까, 격자 위를 훑을까, 더 똑똑한 방법이 있을까?

[다음 글](/ml/hyperparameter-tuning/)에서는 Grid Search, Random Search, 그리고 Bayesian Optimization까지 — 교차 검증 위에서 동작하는 하이퍼파라미터 튜닝 전략을 다룬다.
