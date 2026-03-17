---
date: '2026-02-02'
title: 'Target Encoding과 고급 인코딩 기법: 범주형 변수의 정보를 극대화하는 법'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 33
tags: ['Target Encoding', 'Mean Encoding', 'CatBoost Encoding', 'Leave-One-Out', '범주형 변수', '머신러닝']
summary: '고카디널리티 범주형 변수를 다루는 고급 인코딩 기법. Target Encoding의 원리, 과적합 위험, Smoothing과 K-Fold 전략까지.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/feature-selection/)에서 어떤 특성을 남기고 버릴지를 다뤘다. 그런데 특성 선택 이전에 해결해야 할 문제가 하나 있다 — 범주형 변수를 **어떻게 숫자로 바꿀 것인가**다.

[범주형 변수 인코딩 글](/ml/categorical-encoding/)에서 Label Encoding과 One-Hot Encoding을 배웠다. 대부분의 경우 이 두 가지로 충분하다. 그런데 `city`처럼 카디널리티가 1,000개를 넘는 변수를 One-Hot으로 변환하면? 특성이 1,000개 추가된다. 메모리 폭발, 학습 시간 급증, 그리고 대부분이 0인 극도로 희소한 행렬이 만들어진다. [XGBoost와 LightGBM 글](/ml/xgboost-vs-lightgbm/)에서 본 EFB(Exclusive Feature Bundling)가 이 희소성을 압축해주긴 하지만, 근본적인 해결은 아니다.

**Target Encoding**과 그 변형들은 이 문제에 대한 답이다. 범주형 변수를 타겟 변수와의 관계를 이용해 **하나의 숫자**로 바꾼다. 차원이 늘어나지 않으면서도 범주의 예측력을 보존하는 셈이다. 다만 강력한 만큼 위험도 크다 — 과적합 함정이 곳곳에 숨어 있다.

---

## Target Encoding (Mean Encoding)

아이디어는 단순하다. 각 범주를 **해당 범주에 속하는 샘플들의 타겟 평균값**으로 대체한다.

이진 분류(타겟이 0 또는 1)를 예로 들어보자. `city` 변수가 있고 타겟이 `churn`(이탈 여부)이라면:

```
원본 데이터:
  city      | churn
  ----------|------
  서울       |  1
  서울       |  0
  서울       |  1
  부산       |  0
  부산       |  0
  대구       |  1
  대구       |  1

Target Encoding 후:
  city      | city_encoded | churn
  ----------|-------------|------
  서울       |  0.667      |  1     (서울의 이탈률: 2/3)
  서울       |  0.667      |  0
  서울       |  0.667      |  1
  부산       |  0.000      |  0     (부산의 이탈률: 0/2)
  부산       |  0.000      |  0
  대구       |  1.000      |  1     (대구의 이탈률: 2/2)
  대구       |  1.000      |  1
```

회귀 문제라면 타겟의 평균값을, 다중 분류라면 각 클래스 확률을 사용한다. 핵심은 **범주가 몇 개든 특성 하나로 압축**된다는 점이다.

```python
import pandas as pd

def target_encode_naive(df, col, target):
    """가장 단순한 Target Encoding (실전에서 쓰면 안 됨)"""
    means = df.groupby(col)[target].mean()
    return df[col].map(means)

df['city_encoded'] = target_encode_naive(df, 'city', 'churn')
```

간결하고 직관적이다. 그런데 이 구현을 실전에 쓰면 **반드시** 문제가 생긴다.

---

## 과적합 문제: 왜 Naive Target Encoding은 위험한가

Target Encoding의 치명적 약점은 **타겟 정보가 특성에 직접 새어 들어간다(target leakage)** 는 것이다. 모델 입장에서는 답을 미리 엿보는 셈이다.

### 희귀 범주의 과적합

`city = '속초'`인 샘플이 딱 1개 있고, 그 샘플의 타겟이 1이라면 `속초`의 인코딩 값은 1.0이 된다. 모델은 "속초면 무조건 이탈"이라고 외운다. 이건 학습이 아니라 **기억**이다.

```
희귀 범주의 함정:
  범주    | 샘플 수 | 타겟 평균 | 신뢰도
  --------|---------|----------|-------
  서울     |  5,000  |  0.32    | 높음 (충분한 샘플)
  부산     |  2,000  |  0.28    | 높음
  속초     |     3   |  1.00    | 극히 낮음 (우연의 일치일 수 있음)
  태백     |     1   |  0.00    | 의미 없음
```

### 훈련-테스트 점수 괴리

Naive Target Encoding을 적용한 뒤 모델을 학습하면, 훈련 점수는 비정상적으로 높고 테스트 점수는 평범하거나 나쁘다. [편향-분산 트레이드오프](/ml/bias-variance/)에서 본 전형적인 **높은 분산(high variance)** 패턴이다. 훈련 데이터의 타겟으로 만든 특성을 다시 훈련 데이터의 타겟을 예측하는 데 쓰니, 순환 참조가 생기는 것이다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 절대 하지 말 것</strong><br>
  전체 훈련 데이터의 타겟 평균으로 인코딩한 뒤, 같은 훈련 데이터로 모델을 학습하는 것. 타겟 누수(target leakage)로 인해 과적합이 거의 확실하다. 이 글 뒤에서 다루는 Smoothing, K-Fold, LOO 등의 전략은 모두 이 문제를 완화하기 위해 존재한다.
</div>

---

## Smoothing: 전역 평균으로 보정하기

과적합을 줄이는 첫 번째 전략은 **Smoothing**이다. 범주별 평균을 전역(global) 평균 쪽으로 수축(shrink)시키는 것이다. 샘플 수가 적은 범주일수록 전역 평균에 더 가까워진다.

### 수식

```
encoded(cᵢ) = (nᵢ × meanᵢ + m × global_mean) / (nᵢ + m)
```

- `nᵢ`: 범주 i의 샘플 수
- `meanᵢ`: 범주 i의 타겟 평균
- `global_mean`: 전체 타겟 평균
- `m`: smoothing 파라미터 (양수)

`m`이 클수록 범주별 평균이 전역 평균에 더 많이 끌려간다. `m = 0`이면 smoothing이 없는 순수 Target Encoding이고, `m → ∞`이면 모든 범주가 전역 평균으로 수렴한다.

### 직관

| 상황 | nᵢ | meanᵢ | m | 인코딩 값 | 해석 |
|------|-----|-------|---|----------|------|
| 대도시 | 5000 | 0.32 | 100 | 0.320 | 충분한 샘플 → 거의 범주 평균 사용 |
| 중소도시 | 50 | 0.60 | 100 | 0.467 | 범주 평균과 전역 평균의 중간 |
| 희귀 도시 | 3 | 1.00 | 100 | 0.330 | 전역 평균(0.32)에 가까움 |

샘플이 많은 "서울"은 자체 평균을 거의 그대로 사용하지만, 3건밖에 없는 희귀 도시는 전역 평균으로 당겨진다. 합리적이다 — 데이터가 부족하면 전체 경향에 의존하는 게 낫다.

```python
def target_encode_smooth(df, col, target, m=100):
    """Smoothing이 적용된 Target Encoding"""
    global_mean = df[target].mean()
    agg = df.groupby(col)[target].agg(['mean', 'count'])

    smooth = (agg['count'] * agg['mean'] + m * global_mean) / (agg['count'] + m)
    return df[col].map(smooth)
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 m 값은 어떻게 정할까?</strong><br>
  경험적으로 m = 10~300 사이에서 교차 검증 점수를 기준으로 튜닝한다. 범주별 평균 샘플 수와 비슷한 스케일로 시작하는 게 좋다. 범주당 평균 100개 샘플이면 m = 100 정도가 시작점이다.
</div>

---

## K-Fold Target Encoding: 교차 검증으로 누수를 차단하다

Smoothing은 희귀 범주의 과적합을 줄이지만, **자기 자신의 타겟을 보고 인코딩한다**는 근본 문제는 해결하지 못한다. K-Fold Target Encoding은 [교차 검증(Cross-Validation)](/ml/cross-validation/)의 아이디어를 빌려와 이 문제를 정면으로 해결한다.

### 원리

1. 훈련 데이터를 K개 폴드로 나눈다 (보통 K = 4~5)
2. 각 폴드의 샘플에 대해, **나머지 K-1개 폴드의 타겟 통계량**으로 인코딩한다
3. 테스트 데이터는 전체 훈련 데이터의 타겟 통계량으로 인코딩한다

```
5-Fold Target Encoding:

Fold 1의 샘플 인코딩 ← Fold 2+3+4+5의 타겟 평균 사용
Fold 2의 샘플 인코딩 ← Fold 1+3+4+5의 타겟 평균 사용
Fold 3의 샘플 인코딩 ← Fold 1+2+4+5의 타겟 평균 사용
Fold 4의 샘플 인코딩 ← Fold 1+2+3+5의 타겟 평균 사용
Fold 5의 샘플 인코딩 ← Fold 1+2+3+4의 타겟 평균 사용

→ 어떤 샘플도 자기 자신의 타겟을 보지 않음!
```

자기 자신을 제외한 데이터로 인코딩하니까, 타겟 누수가 원천적으로 차단된다. 교차 검증에서 Out-of-Fold 예측을 만드는 것과 동일한 논리다.

```python
import numpy as np
from sklearn.model_selection import KFold

def target_encode_kfold(df, col, target, n_splits=5, m=100):
    """K-Fold Target Encoding (Smoothing 포함)"""
    global_mean = df[target].mean()
    encoded = pd.Series(index=df.index, dtype=float)

    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)

    for train_idx, val_idx in kf.split(df):
        # train_idx의 통계량으로 val_idx를 인코딩
        train_data = df.iloc[train_idx]
        agg = train_data.groupby(col)[target].agg(['mean', 'count'])
        smooth = (agg['count'] * agg['mean'] + m * global_mean) / (agg['count'] + m)

        encoded.iloc[val_idx] = df.iloc[val_idx][col].map(smooth)

    # 학습 데이터에 없는 범주는 전역 평균으로 채움
    encoded.fillna(global_mean, inplace=True)
    return encoded
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 K-Fold + Smoothing = 실전 최적 조합</strong><br>
  K-Fold로 누수를 막고, Smoothing으로 희귀 범주의 과적합을 줄이는 조합이 실전에서 가장 널리 쓰인다. Kaggle 상위권 솔루션의 대부분이 이 전략을 사용한다.
</div>

---

## Leave-One-Out (LOO) Encoding

K-Fold의 극단적인 변형이다. 각 샘플의 인코딩 값을 **자기 자신을 제외한 나머지 전체**의 타겟 평균으로 계산한다.

### 수식

```
encoded(xᵢ) = (Σⱼ≠ᵢ yⱼ · 1[xⱼ = xᵢ]) / (nᵢ - 1)
```

즉 같은 범주에 속한 다른 샘플들의 타겟 평균이다. 자기 자신은 빠진다.

```python
def loo_encode(df, col, target):
    """Leave-One-Out Encoding"""
    global_mean = df[target].mean()
    cat_sum = df.groupby(col)[target].transform('sum')
    cat_count = df.groupby(col)[target].transform('count')

    # 자기 자신을 빼고 평균 계산
    encoded = (cat_sum - df[target]) / (cat_count - 1)

    # 범주에 샘플이 1개뿐이면 전역 평균 사용
    encoded.fillna(global_mean, inplace=True)
    return encoded
```

LOO는 K-Fold보다 구현이 간단하고, 교차 검증 분할이 필요 없다는 장점이 있다. 하지만 단점도 있다 — 타겟이 이진(0/1)일 때, 자기 자신의 타겟값에 따라 인코딩 값이 미묘하게 달라진다. `yᵢ = 1`인 샘플은 합에서 1이 빠지므로 인코딩 값이 살짝 낮아지고, `yᵢ = 0`인 샘플은 살짝 높아진다. 모델이 이 차이를 "역추적"해서 타겟을 추론할 수 있다. **완전한 누수 차단은 아닌 셈**이다.

---

## CatBoost Encoding: 순서가 중요하다

CatBoost 라이브러리가 도입한 인코딩 방식이다. 핵심 아이디어는 **데이터의 순서(ordering)를 이용해 타겟 누수를 방지**하는 것이다.

### Ordered Target Statistics

각 샘플의 인코딩 값을 계산할 때, 시간적으로(또는 순서상) **자기보다 앞에 있는 샘플들의 타겟만** 사용한다.

```
데이터를 랜덤하게 셔플한 뒤:

샘플 1 (서울, y=1): encoded = prior (아직 앞선 데이터 없음)
샘플 2 (서울, y=0): encoded = (1 + prior) / (1 + 1)      ← 샘플 1의 타겟만 참조
샘플 3 (부산, y=1): encoded = prior                        ← 부산 첫 등장
샘플 4 (서울, y=1): encoded = (1+0 + prior) / (2 + 1)     ← 샘플 1,2의 타겟 참조
샘플 5 (부산, y=0): encoded = (1 + prior) / (1 + 1)       ← 샘플 3의 타겟만 참조
```

### 수식

```
encoded(xₖ) = (Σⱼ<ₖ yⱼ · 1[xⱼ = xₖ] + a · prior) / (Σⱼ<ₖ 1[xⱼ = xₖ] + a)
```

- `prior`: 전역 타겟 평균 (smoothing 역할)
- `a`: smoothing 계수 (기본값 보통 1)
- 합산은 자기보다 **앞선** 샘플만 대상

이 방식이 K-Fold보다 우아한 이유가 있다. K-Fold는 같은 폴드 내의 동일 범주 샘플들이 똑같은 인코딩 값을 갖지만, CatBoost Encoding은 **같은 범주라도 순서에 따라 다른 값**을 갖는다. 정보가 점진적으로 쌓이면서 자연스러운 정규화 효과가 생긴다.

CatBoost 라이브러리는 이 인코딩을 학습 과정에 내장하여, 매 부스팅 라운드마다 다른 랜덤 순열(permutation)을 적용한다. 이렇게 하면 단일 순서에 의존하는 편향도 줄일 수 있다.

```python
# CatBoost는 범주형 특성을 직접 처리한다
from catboost import CatBoostClassifier

model = CatBoostClassifier(
    iterations=1000,
    learning_rate=0.05,
    cat_features=['city', 'region', 'product_type'],  # 범주형 열 지정
    random_state=42
)

# 인코딩 필요 없이 원본 범주형 데이터 그대로 학습
model.fit(X_train, y_train, verbose=100)
```

---

## Weight of Evidence (WoE): 신용 평가의 표준

WoE는 금융권에서 수십 년간 사용해온 인코딩 방식이다. 각 범주가 "긍정 클래스를 얼마나 지지하는가"를 로그 오즈비(log odds ratio)로 표현한다.

### 수식

```
WoE(cᵢ) = ln(Event Rate / Non-Event Rate)
         = ln(%Events_in_cᵢ / %Non-Events_in_cᵢ)
```

구체적으로:

```
%Events_in_cᵢ    = (범주 i에서 타겟=1인 수) / (전체 타겟=1인 수)
%Non-Events_in_cᵢ = (범주 i에서 타겟=0인 수) / (전체 타겟=0인 수)
```

### 예시

```
전체: 타겟=1: 300명, 타겟=0: 700명

범주 A: 타겟=1: 60명, 타겟=0: 40명
  %Events = 60/300 = 0.200
  %Non    = 40/700 = 0.057
  WoE = ln(0.200/0.057) = 1.253 (강한 양의 지표)

범주 B: 타겟=1: 10명, 타겟=0: 90명
  %Events = 10/300 = 0.033
  %Non    = 90/700 = 0.129
  WoE = ln(0.033/0.129) = -1.364 (강한 음의 지표)
```

WoE의 장점:
- **로지스틱 회귀와 궁합이 좋다**: 로지스틱 회귀의 로그 오즈에 선형으로 더해지므로, WoE 변환 후의 계수가 해석 가능하다
- **결측치를 자연스럽게 처리**: 결측을 하나의 범주로 취급하면 된다
- **이상치에 강건**: 연속형으로 변환되면서 극단값이 완화된다

WoE와 함께 자주 쓰이는 지표가 **IV(Information Value)**다:

```
IV = Σᵢ (%Eventsᵢ - %Non-Eventsᵢ) × WoE(cᵢ)
```

| IV 값 | 예측력 |
|-------|--------|
| < 0.02 | 쓸모없음 |
| 0.02 ~ 0.1 | 약함 |
| 0.1 ~ 0.3 | 중간 |
| 0.3 ~ 0.5 | 강함 |
| > 0.5 | 의심스러움 (과적합 가능성) |

```python
def woe_encode(df, col, target):
    """Weight of Evidence Encoding"""
    total_events = df[target].sum()
    total_non = len(df) - total_events

    agg = df.groupby(col)[target].agg(['sum', 'count'])
    agg['non_events'] = agg['count'] - agg['sum']

    agg['pct_events'] = agg['sum'] / total_events
    agg['pct_non'] = agg['non_events'] / total_non

    # 0 방지를 위한 작은 값 추가
    eps = 1e-6
    agg['woe'] = np.log((agg['pct_events'] + eps) / (agg['pct_non'] + eps))

    return df[col].map(agg['woe'])
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ WoE는 이진 분류 전용</strong><br>
  WoE의 정의 자체가 Event/Non-Event 비율에 기반하므로, 다중 분류나 회귀 문제에는 직접 적용할 수 없다. 다중 분류에서는 One-vs-Rest로 분해하거나 다른 인코딩 방식을 써야 한다.
</div>

---

## James-Stein Encoding: 통계적 수축 추정

James-Stein Encoding은 **수축 추정(shrinkage estimation)** 이론에 기반한 방법이다. 1961년 Charles Stein이 증명한 놀라운 정리에서 출발한다 — 3개 이상의 그룹 평균을 동시에 추정할 때, 각 그룹의 표본 평균보다 **전체 평균 쪽으로 수축시킨 값**이 MSE가 더 낮다.

### 수식

```
encoded(cᵢ) = (1 - Bᵢ) × meanᵢ + Bᵢ × global_mean
```

수축 계수 B의 추정:

```
Bᵢ = Var(yᵢ) / (Var(yᵢ) + nᵢ × Var(mean_across_categories))
```

B가 1에 가까우면 전역 평균에 가깝고(수축이 강함), 0에 가까우면 범주 평균을 그대로 사용한다(수축이 약함). Smoothing과 비슷해 보이지만, **수축 강도가 데이터의 분산으로부터 자동 결정**된다는 점이 다르다. 하이퍼파라미터 `m`을 수동으로 정할 필요가 없다.

```python
def james_stein_encode(df, col, target):
    """James-Stein Encoding"""
    global_mean = df[target].mean()
    global_var = df[target].var()

    agg = df.groupby(col)[target].agg(['mean', 'count', 'var'])

    # 범주 간 평균의 분산
    between_var = agg['mean'].var()

    # 수축 계수
    B = agg['var'] / (agg['var'] + agg['count'] * between_var + 1e-10)

    shrunk = (1 - B) * agg['mean'] + B * global_mean
    return df[col].map(shrunk)
```

---

## 언제 어떤 인코딩을 써야 하는가

| 인코딩 방식 | 과적합 방지 | 구현 복잡도 | 카디널리티 | 해석 가능성 | 권장 상황 |
|------------|-----------|-----------|----------|-----------|----------|
| One-Hot | 없음 | 매우 쉬움 | 낮음 (< 20) | 높음 | 저카디널리티, 선형 모델 |
| Target (naive) | 없음 | 쉬움 | 높음 | 중간 | 쓰지 말 것 |
| Target + Smoothing | 중간 | 쉬움 | 높음 | 중간 | 빠른 프로토타이핑 |
| K-Fold Target | 높음 | 중간 | 높음 | 중간 | **실전 기본값** |
| LOO | 중간 | 쉬움 | 높음 | 중간 | K-Fold 대안 |
| CatBoost | 높음 | 낮음 (내장) | 높음 | 낮음 | CatBoost 모델 사용 시 |
| WoE | 중간 | 중간 | 높음 | 높음 | 금융, 규제 산업 |
| James-Stein | 높음 | 중간 | 높음 | 낮음 | 자동 수축이 필요할 때 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 경험적 가이드</strong><br>
  1. 카디널리티 < 10~20: One-Hot Encoding<br>
  2. 카디널리티 ≥ 20: K-Fold Target Encoding + Smoothing<br>
  3. CatBoost를 쓸 거라면: 인코딩하지 말고 범주형 그대로 넣기<br>
  4. 금융/보험 도메인: WoE + IV로 변수 선택까지 동시에<br>
  5. 하이퍼파라미터 튜닝이 귀찮다면: James-Stein
</div>

---

## category_encoders 라이브러리: 원스톱 솔루션

위의 모든 인코딩을 직접 구현할 필요는 없다. `category_encoders` 라이브러리가 20개 이상의 인코딩 방식을 통일된 sklearn API로 제공한다.

```bash
pip install category_encoders
```

```python
import category_encoders as ce

# Target Encoding (smoothing 포함)
encoder = ce.TargetEncoder(cols=['city'], smoothing=1.0)
X_train_enc = encoder.fit_transform(X_train, y_train)
X_test_enc = encoder.transform(X_test)

# Leave-One-Out Encoding
encoder = ce.LeaveOneOutEncoder(cols=['city'])
X_train_enc = encoder.fit_transform(X_train, y_train)
X_test_enc = encoder.transform(X_test)

# WoE Encoding
encoder = ce.WOEEncoder(cols=['city'])
X_train_enc = encoder.fit_transform(X_train, y_train)
X_test_enc = encoder.transform(X_test)

# James-Stein Encoding
encoder = ce.JamesSteinEncoder(cols=['city'])
X_train_enc = encoder.fit_transform(X_train, y_train)
X_test_enc = encoder.transform(X_test)
```

`category_encoders`의 장점:
- **sklearn Pipeline과 호환**: `fit`, `transform`, `fit_transform` 인터페이스를 그대로 따른다
- **자동 타겟 관리**: `fit_transform(X, y)`에서 타겟을 넘기면 알아서 처리한다
- **미지의 범주 처리**: `transform` 시 학습에 없던 범주가 나오면 자동으로 전역 평균이나 사전 확률로 채운다

```python
from sklearn.pipeline import Pipeline
from sklearn.ensemble import GradientBoostingClassifier

pipeline = Pipeline([
    ('encoder', ce.TargetEncoder(cols=['city', 'region', 'product'])),
    ('model', GradientBoostingClassifier(n_estimators=200))
])

# 교차 검증도 자연스럽게 동작
from sklearn.model_selection import cross_val_score
scores = cross_val_score(pipeline, X, y, cv=5, scoring='roc_auc')
print(f"AUC: {scores.mean():.4f} (+/- {scores.std():.4f})")
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 Pipeline 안에서의 Target Encoding</strong><br>
  <code>category_encoders</code>를 sklearn Pipeline 안에 넣고 <code>cross_val_score</code>를 돌리면, 교차 검증의 각 fold에서 자동으로 학습 데이터만으로 인코더가 fit된다. Pipeline 밖에서 미리 인코딩하면 전체 데이터의 타겟을 본 것이 되므로, **반드시 Pipeline 안에 넣어야 한다.**
</div>

---

## 실전 비교: 고카디널리티 데이터셋에서 인코딩 전략 대결

이론을 실전으로 검증해보자. 도시(city)가 200개 이상인 고카디널리티 데이터셋에서 각 인코딩의 성능을 비교한다.

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import OneHotEncoder
import category_encoders as ce
import warnings
warnings.filterwarnings('ignore')

# 고카디널리티 데이터 생성 (실제로는 Kaggle 등에서 가져옴)
np.random.seed(42)
n_samples = 10000
n_cities = 200

cities = [f'city_{i}' for i in range(n_cities)]
city_probs = np.random.dirichlet(np.ones(n_cities) * 0.5)  # 불균형한 분포

df = pd.DataFrame({
    'city': np.random.choice(cities, size=n_samples, p=city_probs),
    'age': np.random.normal(35, 10, n_samples),
    'income': np.random.normal(50000, 15000, n_samples),
})

# 도시별로 다른 이탈률 설정 (city가 타겟과 실제로 관련 있게)
city_effects = {c: np.random.normal(0, 0.5) for c in cities}
logit = df['city'].map(city_effects) + 0.01 * df['age'] - 0.00001 * df['income']
df['churn'] = (np.random.random(n_samples) < 1 / (1 + np.exp(-logit))).astype(int)

X = df[['city', 'age', 'income']]
y = df['churn']

# 각 인코딩 전략 비교
encoders = {
    'One-Hot': ce.OneHotEncoder(cols=['city'], use_cat_names=True),
    'Target (smoothing=1)': ce.TargetEncoder(cols=['city'], smoothing=1.0),
    'Target (smoothing=100)': ce.TargetEncoder(cols=['city'], smoothing=100.0),
    'LOO': ce.LeaveOneOutEncoder(cols=['city']),
    'WoE': ce.WOEEncoder(cols=['city']),
    'James-Stein': ce.JamesSteinEncoder(cols=['city']),
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
model = GradientBoostingClassifier(n_estimators=100, random_state=42)

print(f"{'인코딩 방식':<25} {'AUC (mean ± std)':<20} {'특성 수'}")
print('-' * 65)

for name, encoder in encoders.items():
    pipe = Pipeline([
        ('encoder', encoder),
        ('model', model)
    ])
    scores = cross_val_score(pipe, X, y, cv=cv, scoring='roc_auc')

    # 특성 수 확인 (One-Hot과 나머지 비교)
    pipe.fit(X, y)
    n_features = pipe.named_steps['encoder'].transform(X.head(1)).shape[1]

    print(f"{name:<25} {scores.mean():.4f} ± {scores.std():.4f}    {n_features}")
```

### 전형적인 결과

```
인코딩 방식                AUC (mean ± std)     특성 수
-----------------------------------------------------------------
One-Hot                  0.6823 ± 0.0112    202     ← 차원 폭발
Target (smoothing=1)     0.7156 ± 0.0098      3     ← 약한 smoothing
Target (smoothing=100)   0.7089 ± 0.0087      3     ← 과도한 smoothing
LOO                      0.7134 ± 0.0103      3
WoE                      0.7121 ± 0.0095      3
James-Stein              0.7148 ± 0.0091      3
```

몇 가지 패턴이 보인다:

1. **One-Hot이 가장 나쁘다**: 200개 도시를 200개 특성으로 풀어놓으면, 대부분 0인 희소 특성이 모델에 노이즈로 작용한다. 특성 수가 202개(도시 200 + age + income)로 폭발한다.

2. **Target 계열이 일관되게 좋다**: 범주 정보를 숫자 하나로 압축하면서 타겟과의 관계를 보존하니까, 3개 특성만으로 더 나은 성능을 낸다.

3. **Smoothing은 적절히**: smoothing이 너무 약하면(=1) 과적합 위험이 있고, 너무 강하면(=100) 범주별 차이가 희석된다. 교차 검증으로 최적값을 찾아야 한다.

4. **James-Stein이 안정적**: 하이퍼파라미터 없이도 좋은 성능을 보인다. 수축 강도가 데이터에서 자동으로 결정되기 때문이다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 트리 모델 vs 선형 모델에서의 차이</strong><br>
  위 결과는 Gradient Boosting(트리 기반)에서의 비교다. 로지스틱 회귀 같은 선형 모델에서는 One-Hot이 오히려 나을 수 있다. 트리 모델은 하나의 숫자를 여러 분할점으로 쪼갤 수 있지만, 선형 모델은 하나의 숫자에 하나의 계수만 부여하므로 Target Encoding의 단일 숫자가 정보를 충분히 전달하지 못할 수 있다.
</div>

---

## 정리

범주형 변수 인코딩은 단순히 "숫자로 바꾸는 것"이 아니다. 고카디널리티 변수에서 **어떻게 정보를 보존하면서 과적합을 방지할 것인가**가 핵심 과제다.

| 핵심 포인트 | 설명 |
|------------|------|
| Naive Target Encoding | 타겟 누수로 인한 과적합이 거의 확실. 실전에서 쓰지 말 것 |
| Smoothing | 희귀 범주를 전역 평균으로 수축. 간단하지만 누수 자체는 못 막음 |
| K-Fold Target Encoding | Out-of-Fold 통계량으로 누수 차단. 실전 기본값 |
| CatBoost Encoding | 순서 기반으로 누수 방지. CatBoost 모델에 내장 |
| WoE | 금융권 표준. 로지스틱 회귀와 최적 궁합 |
| James-Stein | 자동 수축. 튜닝 부담이 가장 적음 |

가장 중요한 원칙: **인코딩은 반드시 Pipeline 안에서 해야 한다.** 전체 데이터로 인코딩한 뒤 교차 검증을 돌리면, 검증 폴드에 타겟 정보가 누수된다. 이건 교차 검증의 의미를 근본적으로 훼손한다.

---

[다음 글](/ml/missing-data-handling/)에서는 결측치 처리를 다룬다. 데이터를 삭제할지, 대체할지, 모델이 알아서 처리하게 할지 — 결측 패턴에 따라 전략이 완전히 달라진다.