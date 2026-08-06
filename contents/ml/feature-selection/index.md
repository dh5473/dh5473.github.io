---
date: '2026-02-01'
title: '필터·래퍼·임베디드, 피처를 걸러내는 세 갈래'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 32
tags: ['Feature Selection', '피처 선택', 'RFE', 'Mutual Information', 'Feature Importance', 'Permutation Importance', 'SHAP', 'Lasso', '머신러닝']
summary: '피처 선택은 모델을 학습하기 전에 할 수도, 학습을 반복하며 할 수도, 학습 안에서 할 수도 있다. 필터와 래퍼, 임베디드가 갈리는 지점과 각각의 대가를 정리한다.'
thumbnail: './thumbnail.png'
---

피처가 많으면 정보가 많으니 좋을 것 같다. 그런데 100개이던 피처를 200개로 늘렸더니 성능이 떨어지는 일이 실제로는 더 흔하다.

차원의 저주(Curse of Dimensionality)라고 부르는 현상이다. 차원이 늘어나면 공간의 부피가 지수적으로 커지는데 데이터 수는 그대로다. 같은 샘플이 훨씬 넓은 공간에 흩어지니 어느 점에서 봐도 이웃이라 부를 만큼 가까운 점이 없다. 거리 기반 모델은 여기서 판단 근거를 잃는다. 트리 모델도 안전하지 않다. 타겟과 무관한 피처가 수백 개 섞여 있으면 그중 하나가 우연히 훈련 데이터를 잘 가르는 일이 생기고, 트리는 그 분기를 만든다.

피처 선택은 이 문제를 정면으로 다룬다. 쓸모없거나 서로 겹치는 피처를 덜어내서 모델이 진짜 신호에만 반응하게 만드는 일이다. 얻는 것은 세 가지다. 자유도가 줄어 과적합이 억제되고, 학습 시간이 줄고, 남은 피처가 적으니 예측을 설명할 수 있게 된다. 피처 200개짜리 모델의 판단 근거를 사람에게 설명하는 건 사실상 불가능하지만 20개라면 가능하다.

## 선택이 모델 학습과 맞물리는 지점

피처 선택 기법을 셋으로 가르는 기준은 원리가 아니라 **모델 학습과의 시점 관계**다. 학습하기 전에 끝내는지, 학습을 되풀이하면서 고르는지, 학습 한 번 안에서 저절로 되는지가 다르다. 속도와 정확도의 차이는 전부 여기서 파생된다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="피처 선택 세 방식이 모델 학습과 맞물리는 지점 비교. 필터는 통계 점수로 먼저 컷한 뒤 모델을 학습하고, 래퍼는 후보 조합과 모델 학습과 성능 비교를 여러 번 되풀이하며, 임베디드는 모델 학습 한 번 안에 선택이 들어 있다.">
<style>
.fs1-t { font-size: 18px; font-weight: 600; fill: var(--text, #1c1917); }
.fs1-sub { font-size: 14px; fill: var(--text-muted, #6d6762); }
.fs1-lab { font-size: 15px; fill: var(--text, #1c1917); }
.fs1-on { font-size: 15px; font-weight: 600; fill: var(--on-fill, #ffffff); }
.fs1-tiny { font-size: 14px; fill: var(--text-muted, #6d6762); }
.fs1-plain { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.fs1-sel { fill: var(--primary, #0a756c); }
.fs1-fit { fill: var(--accent, #9d5604); }
.fs1-line { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
</style>
<defs>
<marker id="fs1Arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<!-- ===== 필터 ===== -->
<text class="fs1-t" x="20" y="18">필터</text>
<text class="fs1-sub" x="20" y="38">선택 단계에 학습 0회</text>
<rect class="fs1-plain" x="20" y="50" width="112" height="42" rx="6"/>
<text class="fs1-lab" x="76" y="76" text-anchor="middle">전체 피처</text>
<path class="fs1-line" d="M 132 71 L 143 71" marker-end="url(#fs1Arrow)"/>
<rect class="fs1-sel" x="146" y="50" width="112" height="42" rx="6"/>
<text class="fs1-on" x="202" y="76" text-anchor="middle">통계 점수 컷</text>
<path class="fs1-line" d="M 258 71 L 269 71" marker-end="url(#fs1Arrow)"/>
<rect class="fs1-fit" x="272" y="50" width="108" height="42" rx="6"/>
<text class="fs1-on" x="326" y="76" text-anchor="middle">모델 학습</text>
<!-- ===== 래퍼 ===== -->
<text class="fs1-t" x="20" y="144">래퍼</text>
<text class="fs1-sub" x="20" y="164">선택 단계에 학습 여러 번</text>
<rect class="fs1-sel" x="20" y="176" width="112" height="42" rx="6"/>
<text class="fs1-on" x="76" y="202" text-anchor="middle">후보 조합</text>
<path class="fs1-line" d="M 132 197 L 143 197" marker-end="url(#fs1Arrow)"/>
<rect class="fs1-fit" x="146" y="176" width="112" height="42" rx="6"/>
<text class="fs1-on" x="202" y="202" text-anchor="middle">모델 학습</text>
<path class="fs1-line" d="M 258 197 L 269 197" marker-end="url(#fs1Arrow)"/>
<rect class="fs1-plain" x="272" y="176" width="108" height="42" rx="6"/>
<text class="fs1-lab" x="326" y="202" text-anchor="middle">성능 비교</text>
<path class="fs1-line" d="M 326 218 L 326 240 L 76 240 L 76 225" marker-end="url(#fs1Arrow)"/>
<text class="fs1-tiny" x="201" y="258" text-anchor="middle">n회 반복</text>
<!-- ===== 임베디드 ===== -->
<text class="fs1-t" x="20" y="304">임베디드</text>
<text class="fs1-sub" x="20" y="324">선택이 학습 1회 안에서</text>
<rect class="fs1-plain" x="20" y="336" width="112" height="48" rx="6"/>
<text class="fs1-lab" x="76" y="365" text-anchor="middle">전체 피처</text>
<path class="fs1-line" d="M 132 360 L 143 360" marker-end="url(#fs1Arrow)"/>
<rect class="fs1-fit" x="146" y="336" width="234" height="48" rx="6"/>
<text class="fs1-on" x="160" y="365">모델 학습</text>
<rect class="fs1-sel" x="238" y="344" width="132" height="32" rx="6"/>
<text class="fs1-on" x="304" y="365" text-anchor="middle">선택 내장</text>
</svg>
</div>

## 필터

모델을 전혀 학습하지 않고 피처의 통계적 성질만 보고 자른다. 수천 개짜리 피처에서 명백한 쓰레기를 빠르게 걷어낼 때 쓴다.

분산이 0이면 모든 행의 값이 같다는 뜻이라 어떤 정보도 없다. `VarianceThreshold`가 이걸 걸러낸다.

```python
from sklearn.feature_selection import VarianceThreshold

selector = VarianceThreshold(threshold=0.01)
X_filtered = selector.fit_transform(X)
```

분산은 스케일에 따라 값이 달라진다. 연봉(만 원 단위)과 나이(세 단위)의 분산을 같은 임계값으로 비교하는 건 의미가 없다. 스케일이 같은 피처끼리, 또는 0과 1만 갖는 이진 피처에 쓰는 것이 안전하다.

다음은 중복 제거다. 두 피처의 상관계수가 0.95를 넘으면 거의 같은 정보이므로 하나를 버려도 손실이 거의 없다.

```python
corr = X.corr().abs()
upper = corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool))
to_drop = [c for c in upper.columns if any(upper[c] > 0.95)]
X_filtered = X.drop(columns=to_drop)
```

여기서 걸리는 건 **선형** 관계뿐이다. 한 피처가 다른 피처의 제곱이라면 상관계수는 낮게 나오고 중복은 그대로 남는다. 상호 정보량(Mutual Information)은 이 한계가 없다. 두 변수의 결합분포가 각각의 주변분포 곱에서 얼마나 벗어나는지를 재기 때문에, 관계의 모양을 가리지 않는다. 값이 0이면 완전 독립이고, 클수록 타겟을 맞히는 데 도움이 되는 정보를 담고 있다.

```python
from sklearn.feature_selection import SelectKBest, mutual_info_classif

selector = SelectKBest(score_func=mutual_info_classif, k=10)
X_selected = selector.fit_transform(X, y)
```

회귀 문제라면 `mutual_info_regression`을 쓴다.

:::info

**필터는 조합을 못 본다**

필터 계열은 피처를 하나씩 따로 채점한다. 그래서 A 혼자로는 타겟과 아무 상관이 없지만 B와 같이 쓰면 강력해지는 경우를 잡아내지 못한다. XOR 관계가 극단적인 예다. 두 이진 피처 각각은 타겟과 상관이 0이지만 둘을 함께 쓰면 타겟이 완벽하게 결정된다.

필터를 단독 선택기가 아니라 1차 관문으로 쓰는 이유가 이것이다.

:::

## 래퍼

실제로 모델을 학습시켜서 피처 부분집합의 성능을 직접 잰다. 조합 효과를 반영하니 정확하지만, 학습 횟수가 그대로 비용이 된다.

전진 선택(forward selection)은 빈 집합에서 시작해 매 단계 성능을 가장 많이 올리는 피처를 하나씩 넣는다. 후진 제거(backward elimination)는 반대로 전체에서 시작해 빼도 가장 덜 아픈 피처를 하나씩 뺀다. sklearn에서는 `SequentialFeatureSelector`가 두 방향을 모두 지원한다.

```python
from sklearn.feature_selection import SequentialFeatureSelector

sfs = SequentialFeatureSelector(
    estimator=model, n_features_to_select=10, direction='forward', cv=5
)
sfs.fit(X, y)
```

`RFE`(Recursive Feature Elimination)는 후진 제거의 가벼운 판이다. 매 단계마다 교차 검증 점수를 새로 재는 대신, 학습된 모델의 `coef_`나 `feature_importances_`를 보고 가장 낮은 것을 떨어뜨린다. 그래서 훨씬 빠르지만 중요도를 노출하는 추정기에만 쓸 수 있다.

```python
from sklearn.feature_selection import RFECV
from sklearn.ensemble import RandomForestClassifier

model = RandomForestClassifier(n_estimators=100, random_state=42)
rfecv = RFECV(estimator=model, step=1, cv=5, scoring='accuracy', min_features_to_select=5)
rfecv.fit(X, y)

print(rfecv.n_features_)                 # 자동으로 찾은 최적 피처 수
print(list(X.columns[rfecv.support_]))
```

`RFE`는 목표 개수를 사람이 정해야 하지만 `RFECV`는 교차 검증 점수가 가장 높은 지점을 찾아 개수까지 정해준다.

:::warning

**래퍼의 비용은 곱셈으로 늘어난다**

피처 100개에서 `RFE(step=1)`로 10개를 남기려면 매번 하나씩 떨어뜨리며 90번을 학습해야 한다. 여기에 5-fold `RFECV`를 걸면 fold마다 그 과정을 되풀이하므로 450번을 넘어간다.

`step`을 비율로 줄 수 있다. `step=0.1`이면 원래 피처 수의 10%인 10개씩 한 번에 떨어뜨리므로 학습이 90번에서 9번으로 준다. 대신 한 번에 열 개를 같이 버리니 그중 하나가 남았어야 할 피처였는지는 확인할 방법이 없다.

:::

## 임베디드

모델을 학습시키면 선택이 부산물로 따라 나온다. 학습은 한 번이고 조합 효과도 어느 정도 반영된다.

L1 정규화가 대표적이다. L2는 가중치를 작게 만들 뿐이지만 L1은 **정확히 0으로** 만든다. 가중치가 0이면 그 피처는 예측에 전혀 기여하지 않으니, 학습이 끝난 시점에 이미 선택이 끝나 있다.

```python
from sklearn.linear_model import LassoCV

lasso = LassoCV(cv=5, random_state=42).fit(X, y)
selected = X.columns[lasso.coef_ != 0]
```

분류라면 `LogisticRegression(penalty='l1', solver='liblinear')`을 쓴다. `saga` solver도 L1을 지원하고 다중 클래스에 쓸 수 있다.

트리 계열은 다른 방식으로 같은 일을 한다. 분기를 만들 때마다 그 피처가 지니 불순도를 얼마나 줄였는지 누적한 값이 `feature_importances_`다.

```python
rf = RandomForestClassifier(n_estimators=200, random_state=42).fit(X, y)
importances = pd.Series(rf.feature_importances_, index=X.columns).sort_values(ascending=False)
```

`SelectFromModel`은 이 중요도에 임계값을 걸어 변환기로 만들어 준다. `threshold='median'`을 주면 중앙값 미만인 피처를 잘라내고, `Pipeline` 안에 그대로 끼워 넣을 수 있다.

:::warning

**불순도 기반 중요도는 고유 값이 많은 피처를 띄운다**

불순도 감소는 분기를 잘게 쪼갤수록 커진다. 그래서 값이 거의 다 다른 피처, 예컨대 주문번호 같은 ID 컬럼은 훈련 데이터를 완벽하게 가를 수 있고 중요도가 최상위로 올라온다. 실제로는 일반화에 아무 도움도 안 되는 노이즈다.

훈련 데이터에서 계산된다는 것도 문제다. 과적합에 기여한 피처일수록 점수가 높게 나온다. 그래서 sklearn 문서도 최종 판단은 검증 데이터에서 잰 순열 중요도로 하기를 권한다.

:::

## 중요도를 검증 데이터에서 다시 잰다

순열 중요도(Permutation Importance)는 학습이 끝난 모델을 그대로 두고, 피처 하나의 값만 무작위로 섞은 뒤 성능이 얼마나 떨어지는지를 본다. 섞었는데도 성능이 그대로면 모델이 그 피처를 보지 않았다는 뜻이다.

```python
from sklearn.inspection import permutation_importance

perm = permutation_importance(model, X_val, y_val, n_repeats=10,
                              random_state=42, scoring='accuracy')
```

장점이 분명하다. 어떤 모델에든 적용되고, 불순도처럼 카디널리티에 끌려다니지 않으며, 검증 데이터에서 재기 때문에 훈련에서만 잘 듣던 피처를 걸러낸다.

한계는 상관이 높은 피처들에서 나온다. A와 B가 거의 같은 정보를 담고 있으면 A를 섞어도 모델이 B를 보고 맞히므로 성능이 안 떨어진다. B를 섞어도 마찬가지다. 둘 다 중요하지 않다는 결론이 나오지만 실제로는 둘 중 하나가 핵심이다. 이럴 때는 상관 높은 피처를 묶어서 함께 섞거나, 필터 단계에서 미리 중복을 제거해 두어야 한다.

SHAP(SHapley Additive exPlanations)은 여기서 한 걸음 더 간다. 각 피처를 협력 게임의 플레이어로 보고, 가능한 피처 조합들에서 그 피처가 추가될 때의 한계 기여도를 평균한 값이 SHAP 값이다. 평균 절댓값을 내면 전역 중요도가 되고, 개별 예측 하나를 골라 보면 그 예측이 왜 그렇게 나왔는지의 분해가 된다.

```python
import shap

explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_val)

shap_importance = np.abs(shap_values).mean(axis=0)
ranking = pd.Series(shap_importance, index=X.columns).sort_values(ascending=False)
```

계산 비용은 크다. 다만 "이 피처를 왜 뺐는가"를 다른 사람에게 설명해야 하는 자리에서는 대체할 도구가 마땅치 않다.

## 세 갈래 비교

| 기준 | 필터 | 래퍼 | 임베디드 |
|------|--------|---------|----------|
| 모델 학습 횟수 | 0회 | 조합마다 1회 | 1회 |
| 피처 조합 | 못 봄 | 직접 평가 | 부분적으로 반영 |
| 모델 의존성 | 없음 | 있음 | 있음 (L1, 트리) |
| 피처 수천 개 | 적합 | 비현실적 | 적합 |
| 대표 기법 | 분산, 상관, MI | RFE, SequentialFeatureSelector | Lasso, 트리 중요도 |

셋 중 하나를 고르는 문제가 아니라 순서대로 거는 문제인 경우가 많다. 필터로 분산 0과 상관 0.95 이상을 쳐내 1000개를 200개로 줄이고, 임베디드 중요도로 50개까지 좁히고, 여기까지 오면 래퍼도 감당할 만한 크기가 되니 `RFECV`로 최종 개수를 정한다. 비싼 방법을 싼 방법이 줄여 놓은 공간에만 쓰는 것이다.

## 안 해도 되는 경우

피처 대비 데이터가 압도적으로 많으면 차원의 저주가 문제 되지 않는다. 피처 100개에 데이터 100만 건이면 쓸모없는 피처가 몇 개 섞여 있어도 모델이 알아서 무시한다.

트리 앙상블도 어느 정도 면역이 있다. 랜덤 포레스트는 분기마다 피처를 일부만 후보로 쓰고, 부스팅 계열은 정규화와 서브샘플링으로 비슷한 효과를 낸다. 다만 학습 속도와 해석력은 여전히 피처 수에 그대로 끌려다닌다.

딥러닝에서는 피처 선택을 거의 하지 않는다. 표현 학습(representation learning) 자체가 원시 입력에서 유용한 조합을 찾아내는 과정이라, 사람이 미리 잘라내면 그 재료를 뺏는 셈이 된다.

가장 조심할 경우는 따로 있다. 데이터 100건에 피처 20개인 상황에서 래퍼를 돌리면 "이 조합이 검증 성능이 가장 좋았다"는 결론 자체가 우연일 확률이 높다. 조합의 수가 표본 수보다 훨씬 많으니 그중 하나는 반드시 잘 맞는다. 데이터가 적을수록 선택 기준을 단순하게 두거나 L1 정규화에 맡기는 편이 낫다.

## 선택도 fold 안에서

전체 데이터로 피처를 고른 다음 교차 검증을 돌리면 점수가 부풀려진다. 검증 fold의 타겟을 보고 피처를 골랐으니, 그 fold는 이미 정답을 흘린 데이터다. 상호 정보량이나 상관계수처럼 타겟을 쓰는 필터도 예외가 아니다.

```python
from sklearn.pipeline import Pipeline

pipeline = Pipeline([
    ('variance', VarianceThreshold(threshold=0.0)),
    ('scaler', StandardScaler()),
    ('selector', SelectKBest(score_func=mutual_info_classif, k=20)),
    ('classifier', RandomForestClassifier(n_estimators=200, random_state=42)),
])

scores = cross_val_score(pipeline, X, y, cv=5, scoring='accuracy')
```

`Pipeline` 안에 넣으면 fold마다 선택이 독립적으로 다시 수행된다. fold별로 뽑히는 피처가 조금씩 달라지는 게 정상이고, 그 변동 자체가 선택이 얼마나 안정적인지를 알려주는 신호다.

## 마치며

피처 선택 기법을 셋으로 나누는 기준은 원리가 아니라 모델 학습을 몇 번 하느냐였다. 필터는 0회라 싸고 조합을 못 보고, 래퍼는 조합마다 학습하니 정확하고 비싸며, 임베디드는 학습 한 번에 얹혀 가는 절충이다. 어느 하나가 우월한 게 아니라 피처 수와 모델 무게가 어디까지 감당되는지가 선택을 결정한다.

기법보다 지키기 어려운 건 절차 쪽이다. 전체 데이터를 보고 피처를 고르면 교차 검증 점수가 올라가는데, 그 상승분은 성능이 아니라 누수다. `Pipeline`으로 묶어 fold 안에서 선택하게 만드는 것이 기법 선택보다 결과에 더 크게 작용한다.

## 함께 보면 좋은 글

- [규제](/ml/regularization/) : L1이 가중치를 정확히 0으로 만드는 원리
- [랜덤 포레스트](/ml/random-forest/) : 트리 중요도가 계산되는 자리
- [교차 검증](/ml/cross-validation/) : 선택을 fold 안에 넣어야 하는 이유
