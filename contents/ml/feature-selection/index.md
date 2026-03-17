---
date: '2026-02-01'
title: '피처 선택(Feature Selection): 필터, 래퍼, 임베디드 방법 비교'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 32
tags: ['Feature Selection', '피처 선택', 'RFE', 'Mutual Information', 'Feature Importance', 'Lasso', '머신러닝']
summary: '불필요한 피처를 제거해 모델 성능과 해석력을 높이는 세 가지 접근법. Filter, Wrapper, Embedded 방법의 원리와 실전 비교.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/feature-scaling/)에서 피처 스케일링을 다뤘다. 수치형 피처의 범위를 맞춰 모델이 공정하게 학습하도록 만드는 작업이었다. 스케일링은 "피처를 어떻게 변환할까"의 문제였다면, 이번 글은 한 단계 더 근본적인 질문이다 — **그 피처를 아예 쓸 것인가, 말 것인가?**

피처가 많으면 무조건 좋을 것 같다. 정보가 많으니까. 하지만 현실은 그 반대인 경우가 많다. 피처를 100개에서 200개로 늘렸더니 오히려 성능이 떨어지는 경험을 해본 적이 있을 것이다. 이것이 **차원의 저주(Curse of Dimensionality)** 다.

차원이 높아지면 데이터 포인트 사이의 거리가 멀어지고, 모든 점이 비슷하게 "멀리" 떨어진다. [KNN](/ml/knn/)처럼 거리 기반으로 작동하는 모델은 이웃을 찾는 의미 자체가 희미해진다. 트리 기반 모델도 불필요한 피처에서 분기를 만들면서 과적합될 수 있다. 피처 수가 늘어날수록 같은 성능을 내기 위해 필요한 데이터 양은 기하급수적으로 증가한다.

피처 선택(Feature Selection)은 이 문제를 정면으로 해결한다. **불필요하거나 중복된 피처를 제거**해서 모델이 진짜 중요한 신호에 집중하게 만드는 것이다.

---

## 1. 왜 피처 선택을 하는가

피처 선택의 이점은 세 가지로 정리된다.

### 과적합 방지

[편향-분산 트레이드오프](/ml/bias-variance/)에서 배웠듯이, 모델의 복잡도가 높으면 분산이 커진다. 피처가 많다는 건 모델에 자유도를 많이 준다는 뜻이고, 이건 곧 과적합 위험이다. 노이즈에 불과한 피처를 학습해서 훈련 데이터에만 잘 맞는 모델이 만들어진다.

불필요한 피처를 제거하면 모델의 자유도가 줄어들고, 정규화와 비슷한 효과를 낸다.

### 학습 속도 향상

피처가 절반으로 줄면 학습 시간도 크게 줄어든다. 특히 피처가 수백~수천 개인 텍스트 데이터나 유전체 데이터에서는 학습 시간이 몇 시간에서 몇 분으로 단축될 수 있다.

### 해석력 향상

피처 200개짜리 모델의 예측을 설명하는 건 사실상 불가능하다. 피처를 20개로 줄이면 "이 예측은 이 피처들 때문에 이렇게 나왔다"고 설명할 수 있다. 비즈니스에서 모델의 신뢰를 얻으려면 해석력은 필수다.

```
피처 선택의 이점:
[1] 과적합 방지 → 분산 감소, 일반화 성능 향상
[2] 학습 속도  → 피처 수 감소 → 연산량 감소
[3] 해석력    → 핵심 피처만 남기면 모델 설명 가능
```

---

## 2. Filter 방법: 모델 없이 피처를 걸러낸다

Filter 방법은 **모델을 학습하지 않고** 피처의 통계적 특성만 보고 걸러낸다. 빠르고 단순하다. 전처리 단계에서 먼저 적용하기 좋다.

### VarianceThreshold — 분산이 낮은 피처 제거

분산이 0이면 모든 값이 같다는 뜻이고, 어떤 정보도 담고 있지 않다. 분산이 매우 낮은 피처도 모델에 기여하는 바가 거의 없다.

```python
from sklearn.feature_selection import VarianceThreshold

# 분산이 0.01 미만인 피처 제거
selector = VarianceThreshold(threshold=0.01)
X_filtered = selector.fit_transform(X)

print(f"원래 피처 수: {X.shape[1]}")
print(f"필터 후 피처 수: {X_filtered.shape[1]}")
```

주의할 점은 스케일에 따라 분산이 달라진다는 것이다. 연봉(단위: 만 원)과 나이(단위: 세) 피처의 분산은 스케일 차이 때문에 비교가 안 된다. VarianceThreshold는 보통 **같은 스케일의 피처끼리** 또는 **이진 피처(0/1)에** 적용한다.

### 상관관계 분석 — 중복 피처 제거

두 피처의 상관계수가 0.95 이상이면, 둘 중 하나는 중복이다. 거의 같은 정보를 담고 있으니 하나를 제거해도 정보 손실이 거의 없다.

```python
import pandas as pd
import numpy as np

# 상관 행렬 계산
corr_matrix = X.corr().abs()

# 상삼각 행렬 추출 (대각선 아래는 중복이므로)
upper = corr_matrix.where(
    np.triu(np.ones(corr_matrix.shape), k=1).astype(bool)
)

# 상관계수 0.95 이상인 피처 찾기
to_drop = [col for col in upper.columns if any(upper[col] > 0.95)]
X_filtered = X.drop(columns=to_drop)

print(f"제거된 피처: {to_drop}")
```

상관관계 분석의 한계는 **선형 관계만** 잡는다는 점이다. 비선형 관계로 엮인 중복 피처는 놓친다.

### 상호 정보량 (Mutual Information) — 비선형 관계까지

상호 정보량(MI)은 피처와 타겟 사이의 **비선형 의존성**까지 측정한다. 피어슨 상관계수의 상위 호환이라고 볼 수 있다.

```python
from sklearn.feature_selection import mutual_info_classif
from sklearn.feature_selection import SelectKBest

# 상호 정보량 기반으로 상위 10개 피처 선택
selector = SelectKBest(score_func=mutual_info_classif, k=10)
X_selected = selector.fit_transform(X, y)

# 각 피처의 MI 점수 확인
mi_scores = mutual_info_classif(X, y, random_state=42)
feature_ranking = pd.Series(mi_scores, index=X.columns).sort_values(ascending=False)
print(feature_ranking)
```

MI 값이 0이면 피처와 타겟이 완전히 독립이다. 값이 클수록 타겟 예측에 유용한 정보를 담고 있다. 회귀 문제에서는 `mutual_info_regression`을 쓴다.

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>Filter 방법의 핵심 한계</strong>: 피처 간의 상호작용을 고려하지 않는다. 피처 A 혼자는 타겟과 상관이 없는데, 피처 B와 조합하면 강력한 예측력을 가질 수 있다. Filter 방법은 이런 조합 효과를 놓친다.
</div>

---

## 3. Wrapper 방법: 모델로 피처 조합을 평가한다

Wrapper 방법은 **실제 모델을 학습시켜서** 피처 부분집합의 성능을 평가한다. Filter보다 정확하지만, 모델을 여러 번 학습해야 하므로 느리다.

### Forward Selection (전진 선택)

빈 집합에서 시작해서 피처를 **하나씩 추가**한다. 매 단계에서 가장 성능을 많이 올리는 피처를 추가한다.

```
[시작] 피처 없음
[1단계] 피처 하나씩 넣어보고 가장 좋은 것 선택 → {A}
[2단계] 남은 피처를 하나씩 추가해보고 가장 좋은 것 선택 → {A, D}
[3단계] ... → {A, D, B}
[중단] 성능이 더 이상 개선되지 않으면 중단
```

피처가 n개면 최대 n + (n-1) + (n-2) + ... = O(n^2)번 모델을 학습해야 한다.

### Backward Elimination (후진 제거)

전체 피처에서 시작해서 피처를 **하나씩 제거**한다. 매 단계에서 제거해도 성능이 가장 덜 떨어지는 피처를 제거한다.

```
[시작] 전체 피처 {A, B, C, D, E}
[1단계] 하나씩 빼보고 가장 영향 없는 것 제거 → {A, B, D, E}
[2단계] ... → {A, D, E}
[중단] 제거하면 성능이 크게 떨어지면 중단
```

### RFE (Recursive Feature Elimination)

sklearn에서 가장 많이 쓰는 Wrapper 방법이다. 모델을 학습한 뒤 **가장 덜 중요한 피처를 제거**하고, 다시 학습하고, 다시 제거하고 — 원하는 개수가 될 때까지 반복한다.

```python
from sklearn.feature_selection import RFE
from sklearn.ensemble import RandomForestClassifier

model = RandomForestClassifier(n_estimators=100, random_state=42)

# 상위 10개 피처 선택
rfe = RFE(estimator=model, n_features_to_select=10, step=1)
rfe.fit(X, y)

# 선택된 피처 확인
selected = X.columns[rfe.support_]
print(f"선택된 피처: {list(selected)}")
print(f"피처 순위: {rfe.ranking_}")
```

`RFECV`를 쓰면 교차 검증과 결합해서 **최적의 피처 개수**까지 자동으로 찾아준다.

```python
from sklearn.feature_selection import RFECV
from sklearn.model_selection import StratifiedKFold

rfecv = RFECV(
    estimator=model,
    step=1,
    cv=StratifiedKFold(5),
    scoring='accuracy',
    min_features_to_select=5
)
rfecv.fit(X, y)

print(f"최적 피처 수: {rfecv.n_features_}")
print(f"선택된 피처: {list(X.columns[rfecv.support_])}")
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>Wrapper 방법의 비용</strong><br><br>
  피처가 100개이고 RFE로 10개를 선택한다면, 모델을 90번 학습해야 한다. RFECV에 5-fold CV를 걸면 90 x 5 = 450번이다. 데이터가 크고 모델이 무거우면 현실적으로 불가능할 수 있다. 이럴 때 Embedded 방법이 대안이다.
</div>

---

## 4. Embedded 방법: 학습 과정에서 피처를 선택한다

Embedded 방법은 **모델 학습 자체에 피처 선택이 내장**되어 있다. 별도로 반복 학습할 필요 없이, 한 번 학습하면 피처 중요도가 나온다.

### L1 정규화 (Lasso) — 가중치를 0으로 만든다

[정규화 글](/ml/regularization/)에서 L1(Lasso)과 L2(Ridge)의 차이를 배웠다. L2는 가중치를 작게 만들지만, L1은 가중치를 **정확히 0으로** 만든다. 가중치가 0이 된 피처는 모델에서 완전히 무시되는 것이므로, 이것 자체가 피처 선택이다.

```python
from sklearn.linear_model import LassoCV
import numpy as np

# 최적의 alpha를 자동 탐색
lasso = LassoCV(cv=5, random_state=42)
lasso.fit(X, y)

# 가중치가 0이 아닌 피처만 선택
selected_features = X.columns[lasso.coef_ != 0]
eliminated_features = X.columns[lasso.coef_ == 0]

print(f"선택된 피처 ({len(selected_features)}개): {list(selected_features)}")
print(f"제거된 피처 ({len(eliminated_features)}개): {list(eliminated_features)}")
```

분류 문제에서는 `LogisticRegression(penalty='l1', solver='liblinear')`을 사용한다.

```python
from sklearn.linear_model import LogisticRegression
from sklearn.feature_selection import SelectFromModel

lr_l1 = LogisticRegression(penalty='l1', C=1.0, solver='liblinear', random_state=42)
lr_l1.fit(X, y)

# L1 정규화로 선택된 피처
selector = SelectFromModel(lr_l1, prefit=True)
X_selected = selector.transform(X)

selected_mask = selector.get_support()
print(f"선택된 피처: {list(X.columns[selected_mask])}")
```

### 트리 기반 피처 중요도

[랜덤 포레스트](/ml/random-forest/)와 [XGBoost/LightGBM](/ml/xgboost-vs-lightgbm/) 같은 트리 기반 모델은 학습 과정에서 각 피처가 분기에 얼마나 기여했는지를 추적한다. 이것이 `feature_importances_` 속성이다.

```python
from sklearn.ensemble import RandomForestClassifier
import matplotlib.pyplot as plt

rf = RandomForestClassifier(n_estimators=200, random_state=42)
rf.fit(X, y)

# 피처 중요도 추출
importances = pd.Series(rf.feature_importances_, index=X.columns)
importances = importances.sort_values(ascending=False)

# 상위 15개 피처 시각화
importances[:15].plot(kind='barh', figsize=(8, 6))
plt.title('Random Forest Feature Importance (Top 15)')
plt.xlabel('Importance')
plt.tight_layout()
plt.show()
```

트리 기반 중요도의 기본 방식은 **불순도 감소(impurity-based importance)** 다. 각 피처가 분기할 때 지니 불순도(또는 엔트로피)를 얼마나 줄이는지를 누적한 값이다.

```python
# XGBoost도 동일한 인터페이스
from xgboost import XGBClassifier

xgb = XGBClassifier(n_estimators=200, random_state=42)
xgb.fit(X, y)

# 피처 중요도 (gain 기준)
importances_xgb = pd.Series(
    xgb.feature_importances_, index=X.columns
).sort_values(ascending=False)
```

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>주의: 불순도 기반 중요도의 편향</strong><br><br>
  불순도 기반 중요도는 <strong>카디널리티가 높은 피처(고유 값이 많은 피처)</strong>를 과대평가하는 경향이 있다. 예를 들어 ID 컬럼처럼 모든 값이 고유한 피처는 분기를 잘게 쪼갤 수 있으므로 중요도가 높게 나온다. 하지만 실제로는 노이즈다. 이 문제를 해결하는 것이 순열 중요도(Permutation Importance)다.
</div>

---

## 5. 순열 중요도 (Permutation Importance)

순열 중요도는 **모델에 구애받지 않는(model-agnostic)** 피처 중요도 측정법이다. 아이디어가 직관적이다.

1. 모델을 학습하고 검증 세트에서 기준 성능을 측정한다.
2. 피처 하나의 값을 **무작위로 섞는다(shuffle)**.
3. 같은 모델로 다시 예측하고 성능을 측정한다.
4. 성능이 크게 떨어지면 그 피처가 중요한 것이다.
5. 모든 피처에 대해 반복한다.

```python
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split

X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

# 순열 중요도 계산 (검증 세트 기준)
perm_imp = permutation_importance(
    model, X_val, y_val,
    n_repeats=10,
    random_state=42,
    scoring='accuracy'
)

# 결과 정리
perm_imp_df = pd.DataFrame({
    'feature': X.columns,
    'importance_mean': perm_imp.importances_mean,
    'importance_std': perm_imp.importances_std
}).sort_values('importance_mean', ascending=False)

print(perm_imp_df.head(15))
```

순열 중요도의 장점은 세 가지다.

1. **모델 독립적**: 어떤 모델이든 적용 가능하다. 선형 모델, 트리, 신경망 모두 된다.
2. **편향이 적다**: 불순도 기반과 달리, 카디널리티에 편향되지 않는다.
3. **검증 세트 기준**: 과적합된 피처를 잡아낸다. 훈련에서만 중요하고 검증에서는 중요하지 않은 피처가 드러난다.

단점은 **피처 간 상관이 높으면 중요도가 분산**된다는 것이다. 피처 A와 B가 거의 같은 정보를 담고 있으면, A를 섞어도 B가 보완해주므로 둘 다 중요도가 낮게 나온다. 실제로는 둘 중 하나가 핵심 피처인데도.

---

## 6. Filter vs Wrapper vs Embedded 비교

| 기준 | Filter | Wrapper | Embedded |
|------|--------|---------|----------|
| **속도** | 매우 빠름 | 느림 (모델 반복 학습) | 빠름 (한 번 학습) |
| **정확도** | 낮음 (상호작용 무시) | 높음 (실제 성능 평가) | 높음 |
| **모델 의존성** | 없음 | 있음 (특정 모델 필요) | 있음 (L1, 트리 등) |
| **과적합 위험** | 낮음 | 있음 (피처 조합 과적합) | 낮음 (정규화 내장) |
| **피처 상호작용** | 고려 안 함 | 간접적으로 고려 | 부분적으로 고려 |
| **대규모 피처** | 적합 | 비현실적 | 적합 |
| **대표 기법** | MI, 상관분석, 분산 | RFE, Forward/Backward | Lasso, Tree Importance |

실전에서는 **파이프라인으로 조합**하는 경우가 많다.

```
[1단계] Filter로 빠르게 걸러내기
   └→ 분산 0 피처 제거, 상관 0.95 이상 중복 제거
   └→ 1000개 → 200개

[2단계] Embedded로 중요도 기반 선택
   └→ 트리 모델의 feature_importances_ 기준
   └→ 200개 → 50개

[3단계] 필요하면 Wrapper로 미세 조정
   └→ RFECV로 최적 피처 수 탐색
   └→ 50개 → 25개
```

---

## 7. SHAP Values — 피처 중요도의 끝판왕

지금까지의 방법들은 "이 피처가 얼마나 중요한가?"에 답한다. SHAP(SHapley Additive exPlanations)은 한 걸음 더 나간다 — **"이 피처가 이 개별 예측에 얼마나 기여했는가?"** 를 알려준다.

SHAP은 게임 이론의 Shapley value에서 유래했다. 핵심 아이디어는 간단하다: 각 피처를 "플레이어"로 보고, 모든 가능한 피처 조합에서 해당 피처가 추가될 때의 한계 기여도를 평균낸다.

```python
import shap

model = XGBClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

# SHAP 값 계산
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_val)

# 전체 피처 중요도 (요약 플롯)
shap.summary_plot(shap_values, X_val)
```

SHAP의 강점은 **글로벌 중요도와 로컬 설명**을 동시에 제공한다는 점이다.

```python
# 글로벌: 전체 데이터에서 각 피처의 평균 SHAP 값
shap.summary_plot(shap_values, X_val, plot_type="bar")

# 로컬: 개별 예측 하나에 대한 설명
shap.force_plot(
    explainer.expected_value,
    shap_values[0],      # 첫 번째 샘플
    X_val.iloc[0]
)
```

SHAP 기반으로 피처를 선택할 수도 있다.

```python
# 평균 |SHAP| 값으로 피처 순위 매기기
shap_importance = np.abs(shap_values).mean(axis=0)
shap_ranking = pd.Series(shap_importance, index=X.columns).sort_values(ascending=False)

# 상위 N개 피처 선택
top_n = 20
selected_features = shap_ranking.head(top_n).index.tolist()
```

SHAP은 계산 비용이 크다는 단점이 있지만, 피처 선택의 근거를 가장 설득력 있게 제시할 수 있다. 특히 비즈니스 이해관계자에게 "왜 이 피처를 제거했는지"를 설명할 때 SHAP 플롯만큼 강력한 도구는 없다.

---

## 8. 전체 파이프라인: 피처 선택부터 모델 평가까지

실전에서 피처 선택을 어떻게 파이프라인에 통합하는지 전체 흐름을 보자.

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import (
    VarianceThreshold, SelectKBest, mutual_info_classif, RFECV
)
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report

# --- 데이터 준비 ---
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"원본 피처 수: {X_train.shape[1]}")

# --- 1단계: Filter — 분산 0인 피처 제거 ---
var_selector = VarianceThreshold(threshold=0.0)
X_train_v = var_selector.fit_transform(X_train)
print(f"분산 필터 후: {X_train_v.shape[1]}")

# --- 2단계: Filter — 상관관계 높은 피처 제거 ---
X_train_df = pd.DataFrame(
    X_train_v, columns=X_train.columns[var_selector.get_support()]
)
corr_matrix = X_train_df.corr().abs()
upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
to_drop = [col for col in upper.columns if any(upper[col] > 0.95)]
X_train_df = X_train_df.drop(columns=to_drop)
print(f"상관관계 필터 후: {X_train_df.shape[1]}")

# --- 3단계: Embedded — RFECV로 최적 피처 수 탐색 ---
rf = RandomForestClassifier(n_estimators=100, random_state=42)
rfecv = RFECV(
    estimator=rf,
    step=1,
    cv=5,
    scoring='accuracy',
    min_features_to_select=5
)
rfecv.fit(X_train_df, y_train)

selected_features = X_train_df.columns[rfecv.support_]
print(f"RFECV 선택 피처 수: {len(selected_features)}")
print(f"선택된 피처: {list(selected_features)}")

# --- 4단계: 최종 모델 학습 및 평가 ---
X_train_final = X_train_df[selected_features]

# 테스트 세트에도 동일한 변환 적용
X_test_v = var_selector.transform(X_test)
X_test_df = pd.DataFrame(
    X_test_v, columns=X_train.columns[var_selector.get_support()]
)
X_test_df = X_test_df.drop(columns=to_drop)
X_test_final = X_test_df[selected_features]

# 최종 모델 학습
final_model = RandomForestClassifier(n_estimators=200, random_state=42)
final_model.fit(X_train_final, y_train)

# 평가
y_pred = final_model.predict(X_test_final)
print(classification_report(y_test, y_pred))
```

핵심은 **피처 선택도 훈련 데이터에서만** 수행한다는 점이다. 테스트 데이터를 보고 피처를 선택하면 데이터 누수가 발생한다. sklearn의 `Pipeline`을 쓰면 이 원칙을 자동으로 지킬 수 있다.

```python
# Pipeline으로 깔끔하게 묶기
pipeline = Pipeline([
    ('variance', VarianceThreshold(threshold=0.0)),
    ('scaler', StandardScaler()),
    ('selector', SelectKBest(score_func=mutual_info_classif, k=20)),
    ('classifier', RandomForestClassifier(n_estimators=200, random_state=42))
])

# 교차 검증 (피처 선택이 각 fold 안에서 수행됨)
scores = cross_val_score(pipeline, X, y, cv=5, scoring='accuracy')
print(f"CV 정확도: {scores.mean():.4f} (+/- {scores.std():.4f})")
```

`Pipeline` 안에 `SelectKBest`를 넣으면 교차 검증의 각 fold에서 피처 선택이 독립적으로 수행된다. 이것이 올바른 방식이다.

---

## 9. 피처 선택을 하지 않아도 되는 경우

피처 선택이 항상 필요한 건 아니다. 경우에 따라서는 하지 않는 게 나을 수도 있다.

### 데이터가 충분히 많을 때

피처 대비 데이터가 압도적으로 많으면 차원의 저주가 문제가 되지 않는다. 피처 100개에 데이터 100만 건이면, 불필요한 피처가 있어도 모델이 알아서 무시하는 경우가 많다.

### 트리 기반 앙상블을 쓸 때

[랜덤 포레스트](/ml/random-forest/)는 부트스트랩 샘플링과 피처 서브샘플링으로, [XGBoost/LightGBM](/ml/xgboost-vs-lightgbm/)은 정규화와 피처 서브샘플링으로 **자체적인 피처 선택 효과**를 낸다. 불필요한 피처가 있어도 성능이 크게 떨어지지 않는다. 다만 학습 속도와 해석력 면에서는 여전히 피처 선택이 유의미하다.

### 딥러닝 모델을 쓸 때

딥러닝은 자체적으로 표현을 학습(representation learning)하므로, 수동으로 피처를 제거하면 오히려 정보 손실이 될 수 있다. 이미지, 텍스트 같은 비정형 데이터에서 피처 선택은 거의 하지 않는다.

### 피처 선택 자체가 과적합을 유발할 때

피처가 20개이고 데이터가 100건인 상황에서 Wrapper 방법을 적용하면, 피처 조합에 대해 과적합이 발생한다. "이 20개 중 이 조합이 검증 성능이 가장 좋았다"는 결론 자체가 우연일 수 있다. 데이터가 적으면 오히려 단순한 Filter 방법만 적용하거나, 정규화된 모델(L1)에 맡기는 게 낫다.

```
피처 선택 의사결정:

피처 수가 100개 이상?
├── Yes → 피처 선택 권장 (Filter + Embedded)
└── No
    ├── 데이터가 충분한가?
    │   ├── Yes → 선택 안 해도 됨 (트리 모델이면 특히)
    │   └── No → Filter 또는 L1 정규화만 적용
    └── 해석력이 중요한가?
        ├── Yes → 피처 선택 권장 (SHAP 활용)
        └── No → 모델에 맡기기
```

---

## 정리

| 방법 | 대표 기법 | 언제 쓰나 |
|------|----------|-----------|
| **Filter** | 분산, 상관분석, MI | 빠르게 명백한 노이즈 제거, 첫 전처리 단계 |
| **Wrapper** | RFE, RFECV | 피처 수가 적고 최적 조합을 찾고 싶을 때 |
| **Embedded** | Lasso, Tree Importance | 학습과 동시에 선택, 가장 실용적 |
| **Permutation** | permutation_importance | 모델 독립적 중요도, 검증 세트 기준 |
| **SHAP** | shap.TreeExplainer | 최종 설명, 비즈니스 보고 |

피처 선택은 단독으로 쓰는 게 아니다. 스케일링, 인코딩, 모델 선택과 함께 **전체 ML 파이프라인의 한 단계**로 들어간다. 핵심 원칙은 하나다: **피처 선택도 훈련 데이터 안에서만 수행하고, Pipeline으로 묶어서 데이터 누수를 방지한다.**

다음 글에서는 범주형 피처를 더 정교하게 변환하는 [타겟 인코딩(Target Encoding)](/ml/target-encoding/)을 다룬다. 피처의 값을 타겟 변수의 통계량으로 바꾸는 방법인데, 강력하지만 데이터 누수 위험이 따르는 기법이다.
