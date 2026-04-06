---
date: '2026-02-03'
title: '결측치 처리 전략: 삭제부터 다중 대체(Multiple Imputation)까지'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 34
tags: ['Missing Data', '결측치', 'Imputation', 'KNN Imputer', 'Multiple Imputation', 'MICE', '머신러닝']
summary: '결측치의 세 가지 유형(MCAR, MAR, MNAR)을 이해하고, 단순 삭제부터 KNN Imputer, MICE까지 상황별 최적 전략을 정리한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/target-encoding/)에서 타겟 인코딩을 다뤘다. 범주형 변수를 타겟 변수와의 관계로 변환하는 강력한 기법이었다. 그런데 인코딩이든 [스케일링](/ml/feature-scaling/)이든, 전처리의 대전제가 하나 있다 — **데이터가 존재해야 한다**. 현실의 데이터에는 빈칸이 있다. 센서 고장, 사용자 미입력, 시스템 오류, 병합 과정의 불일치. 결측치(Missing Data)는 피할 수 없다.

결측치를 무시하면 어떻게 되는가? sklearn의 대부분의 모델은 NaN이 있으면 에러를 던진다. 그냥 삭제하면? 데이터가 절반으로 줄 수 있다. 평균으로 채우면? 분산이 과소추정된다. **결측치 처리는 모델 성능을 좌우하는 전처리의 핵심이다.** 이 글에서 결측치의 유형을 이해하고, 상황별 최적 전략을 정리한다.

---

## 1. 결측치의 세 가지 유형

결측치를 처리하기 전에, **왜 데이터가 빠졌는가**를 먼저 파악해야 한다. 통계학자 Donald Rubin이 정의한 세 가지 유형이 있다. 이걸 모르고 처리하면 편향된 결과를 얻는다.

### MCAR (Missing Completely At Random)

결측이 **완전히 무작위**로 발생한다. 결측 여부가 다른 어떤 변수와도 관련이 없다.

```
예시: 설문 응답을 입력하는 직원이 랜덤하게 타이핑 실수를 해서 값이 빠짐
     센서가 무작위로 간헐적 오작동

특징: 결측이 있는 행과 없는 행의 분포가 동일
처리: 삭제해도 편향이 생기지 않음 (데이터 손실만 문제)
```

MCAR인지 확인하려면 Little's MCAR Test를 사용하거나, 결측 여부로 그룹을 나눠 다른 변수의 분포를 비교한다. 분포가 같으면 MCAR일 가능성이 높다.

### MAR (Missing At Random)

결측이 **관측된 다른 변수**에 의존한다. "At Random"이라는 이름이 오해를 불러일으키지만, 핵심은 결측 패턴이 다른 관측값으로 설명 가능하다는 것이다.

```
예시: 고소득자일수록 소득 항목을 비워두는 경향
     → 결측 여부가 '직업' 변수와 상관 (직업은 관측됨)

     젊은 사용자일수록 주소를 입력하지 않음
     → 결측 여부가 '나이' 변수와 상관 (나이는 관측됨)

특징: 결측 패턴을 다른 관측 변수로 예측할 수 있음
처리: 단순 삭제하면 편향 발생! 대체(Imputation)가 필요
```

### MNAR (Missing Not At Random)

결측이 **결측된 값 자체**에 의존한다. 가장 까다로운 유형이다.

```
예시: 체중이 많이 나가는 사람일수록 체중 항목을 비워둠
     → 결측 여부가 체중 값 자체에 의존 (체중은 관측 안 됨)

     우울증이 심한 환자일수록 설문에 응답하지 않음
     → 결측 여부가 우울증 심각도에 의존

특징: 결측 패턴을 관측된 데이터만으로는 설명할 수 없음
처리: 어떤 통계적 방법으로도 완전히 보정 불가. 도메인 지식 필요
```

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>왜 유형이 중요한가?</strong><br><br>
  MCAR이면 삭제해도 괜찮다. MAR이면 다른 변수 정보를 활용한 대체가 효과적이다. MNAR이면 어떤 대체법을 쓰든 편향이 남는다 — 이 경우 도메인 전문가와 협력하거나, 결측 자체를 피처로 활용하는 전략이 필요하다. <strong>처리법 선택의 출발점이 유형 판단</strong>이다.
</div>

---

## 2. 결측치 탐색: 먼저 현황을 파악하라

처리 전략을 세우려면 먼저 결측의 규모와 패턴을 파악해야 한다.

### 기본 탐색: pandas

```python
import pandas as pd

df = pd.read_csv('data.csv')

# 컬럼별 결측 수와 비율
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(1)

missing_info = pd.DataFrame({
    'missing_count': missing,
    'missing_pct': missing_pct
}).sort_values('missing_pct', ascending=False)

print(missing_info[missing_info['missing_count'] > 0])
```

```
               missing_count  missing_pct
cabin                    687         77.1
age                      177         19.9
embarked                   2          0.2
```

Titanic 데이터를 예로 들면, `cabin`은 77%가 결측이다. `age`는 20%. `embarked`는 0.2%. 각각 다른 전략이 필요하다는 게 바로 보인다.

### 시각적 탐색: missingno 라이브러리

숫자로만 보면 **패턴**을 놓친다. `missingno` 라이브러리는 결측 패턴을 시각적으로 보여준다.

```python
import missingno as msno
import matplotlib.pyplot as plt

# 매트릭스 플롯: 흰색이 결측
msno.matrix(df)
plt.show()

# 히트맵: 결측 간 상관관계
msno.heatmap(df)
plt.show()

# 막대 그래프: 컬럼별 비결측 수
msno.bar(df)
plt.show()
```

매트릭스 플롯에서 흰색 줄무늬가 특정 컬럼들에서 **같은 위치에** 나타나면, 그 컬럼들의 결측이 연관되어 있다는 뜻이다. 히트맵은 이 상관관계를 수치로 보여준다. 상관계수가 1에 가까우면 "A가 결측이면 B도 결측"이라는 패턴이 있다.

---

## 3. 삭제 전략: 언제 써도 되고, 언제 위험한가

가장 단순한 전략은 결측이 있는 데이터를 버리는 것이다.

### Listwise Deletion (행 삭제)

```python
# 결측이 하나라도 있는 행을 모두 삭제
df_clean = df.dropna()

# 특정 컬럼 기준으로만 삭제
df_clean = df.dropna(subset=['age', 'embarked'])

print(f"원본: {len(df)}행 → 삭제 후: {len(df_clean)}행")
# 원본: 891행 → 삭제 후: 714행 (subset 사용 시)
# 원본: 891행 → 삭제 후: 183행 (전체 dropna 시)
```

전체 `dropna()`를 하면 891행에서 183행으로 줄어든다. `cabin`의 77% 결측 때문이다. 데이터의 80%를 버리는 셈이다.

### 언제 삭제가 괜찮은가

```
삭제가 안전한 조건:
[1] MCAR인 경우 (삭제해도 편향 없음)
[2] 결측 비율이 매우 낮은 경우 (5% 이하)
[3] 데이터가 충분히 많은 경우 (삭제 후에도 샘플 수 충분)
[4] 결측 행이 소수이고 특이값인 경우

삭제가 위험한 조건:
[1] MAR/MNAR인 경우 → 편향 발생
[2] 결측 비율이 높은 경우 → 정보 손실 과다
[3] 데이터가 적은 경우 → 통계적 검정력 저하
[4] 여러 컬럼에 산발적 결측 → 행 삭제 시 대부분의 행이 사라짐
```

### Column Deletion (열 삭제)

결측 비율이 극단적으로 높은 **컬럼 자체**를 제거하는 방법이다.

```python
# 결측 비율 50% 이상인 컬럼 제거
threshold = 0.5
cols_to_drop = missing_pct[missing_pct > threshold * 100].index
df_clean = df.drop(columns=cols_to_drop)

print(f"제거된 컬럼: {list(cols_to_drop)}")
# 제거된 컬럼: ['cabin']
```

`cabin`처럼 77%가 결측이면, 대체해도 신뢰성이 낮다. 차라리 제거하는 게 나을 수 있다. 다만 "결측 여부 자체"가 정보를 담고 있을 수 있으므로(예: cabin이 기록된 승객 = 1등석), 제거 전에 결측 지시 변수(indicator)를 먼저 만들어두는 것이 좋다.

---

## 4. 단순 대체: Mean, Median, Mode

삭제 대신 빈칸을 채우는 가장 기본적인 방법이다.

### sklearn의 SimpleImputer

```python
from sklearn.impute import SimpleImputer
import numpy as np

# 수치형: 평균으로 대체
mean_imputer = SimpleImputer(strategy='mean')
df['age_imputed'] = mean_imputer.fit_transform(df[['age']])

# 수치형: 중앙값으로 대체
median_imputer = SimpleImputer(strategy='median')
df['age_imputed'] = median_imputer.fit_transform(df[['age']])

# 범주형: 최빈값으로 대체
mode_imputer = SimpleImputer(strategy='most_frequent')
df['embarked_imputed'] = mode_imputer.fit_transform(df[['embarked']])

# 상수로 대체
const_imputer = SimpleImputer(strategy='constant', fill_value=0)
df['cabin_imputed'] = const_imputer.fit_transform(df[['cabin']])
```

### 각 전략의 특성

| 전략 | 적합한 상황 | 주의점 |
|------|-----------|--------|
| **Mean** | 정규분포에 가까운 수치형 | 이상치에 민감, 분산 과소추정 |
| **Median** | 편향된 분포, 이상치 존재 | Mean보다 강건하지만 여전히 분산 축소 |
| **Mode** | 범주형 변수 | 범주가 많으면 의미 약화 |
| **Constant** | 결측 자체에 의미가 있을 때 | 0이나 -1 등으로 "결측"을 명시 |

```
평균 대체의 문제를 직관적으로 보자:

원래 분포: [20, 25, 30, 35, 40, NaN, NaN, NaN]
평균 = 30

대체 후:   [20, 25, 30, 35, 40, 30, 30, 30]

→ 분산이 줄어든다 (평균 주변에 값이 몰림)
→ 변수 간 상관관계가 왜곡된다
→ 결측 비율이 높을수록 문제가 심각해진다
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>단순 대체는 "임시 방편"이다</strong><br><br>
  평균/중앙값 대체는 빠르고 쉽지만, 데이터의 불확실성을 무시한다. 결측값은 "30일 수도 있고 50일 수도 있는" 불확실한 상태인데, 평균 대체는 "확실히 30이다"라고 선언하는 것이다. 결측 비율이 5% 이하이고 MCAR이면 무난하지만, 그 외에는 더 정교한 방법이 필요하다.
</div>

---

## 5. 결측 지시 변수 (Missing Indicator)

결측 여부 자체가 예측에 유용한 정보일 수 있다. 이 정보를 보존하는 기법이다.

```python
from sklearn.impute import SimpleImputer
import numpy as np

# 결측 지시 변수 추가
df['age_is_missing'] = df['age'].isnull().astype(int)

# 그 다음 대체 수행
imputer = SimpleImputer(strategy='median')
df['age_imputed'] = imputer.fit_transform(df[['age']])
```

Titanic 데이터에서 `age`의 결측 여부는 생존율과 상관이 있을 수 있다. 나이가 기록되지 않은 승객은 특정 클래스에 집중되어 있을 수 있기 때문이다. 이 경우 `age_is_missing` 컬럼이 모델에 추가 정보를 제공한다.

```python
# sklearn의 MissingIndicator 활용
from sklearn.impute import MissingIndicator

indicator = MissingIndicator()
missing_flags = indicator.fit_transform(df[['age', 'cabin', 'embarked']])

# True/False 배열 → 어떤 컬럼에 결측이 있었는지 기록
```

### 언제 효과적인가

```
효과적인 경우:
- MNAR이 의심될 때 (결측 자체가 정보)
- 트리 기반 모델과 함께 사용할 때 (분기 조건으로 활용 가능)
- 결측 비율이 10~50% 사이일 때

효과가 없는 경우:
- MCAR일 때 (결측이 무작위이므로 정보 없음)
- 결측 비율이 너무 낮을 때 (변수의 분산이 거의 0)
```

---

## 6. KNN Imputer: 유사한 샘플에서 빌려오기

평균 대체는 전체 데이터의 평균을 쓴다. 하지만 30대 남성의 결측된 소득을 채우는 데 전체 평균을 쓰는 것보다, **비슷한 30대 남성들의 소득 평균**을 쓰는 게 더 정확하지 않겠는가? KNN Imputer는 이 아이디어를 구현한다.

### 작동 원리

[KNN 알고리즘](/ml/knn/)을 기억하는가? 새 데이터 포인트의 레이블을 가장 가까운 K개 이웃의 다수결로 결정하는 알고리즘이었다. KNN Imputer는 같은 원리를 결측치 대체에 적용한다.

```
결측이 있는 행 → 다른 (결측 없는) 피처들로 거리 계산
                → 가장 가까운 K개 이웃 찾기
                → 이웃들의 해당 피처 값 평균으로 대체
```

### sklearn 구현

```python
from sklearn.impute import KNNImputer

# K=5인 KNN Imputer
knn_imputer = KNNImputer(n_neighbors=5, weights='distance')

# 수치형 컬럼만 선택
numeric_cols = df.select_dtypes(include=[np.number]).columns
df_imputed = pd.DataFrame(
    knn_imputer.fit_transform(df[numeric_cols]),
    columns=numeric_cols
)
```

`weights='distance'`를 설정하면, 가까운 이웃일수록 더 큰 가중치를 받는다. 단순 평균보다 정확하다.

### 주의사항

```
KNN Imputer 사용 시 체크리스트:

[1] 스케일링 필수 — KNN은 거리 기반이다. 피처 스케일이 다르면
    거리가 왜곡된다. StandardScaler 또는 MinMaxScaler를 먼저 적용.
    (/ml/feature-scaling/ 참고)

[2] 범주형 변수 처리 — KNN Imputer는 수치형만 지원한다.
    범주형은 먼저 인코딩하거나 (/ml/categorical-encoding/),
    별도 SimpleImputer(mode)로 처리한다.

[3] 계산 비용 — 모든 결측 행에 대해 전체 데이터와 거리를 계산한다.
    데이터가 10만 행 이상이면 느려진다.

[4] K 값 선택 — 너무 작으면 노이즈에 민감, 너무 크면 평균 대체와 비슷해짐.
    보통 5~10이 적절.
```

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>핵심</strong>: KNN Imputer는 "비슷한 행"의 정보를 활용하므로, 단순 평균보다 현실적인 값을 채운다. 특히 피처 간 상관관계가 있을 때 효과적이다. 단, 스케일링 없이 사용하면 의미 없는 결과가 나온다 — <a href="/ml/knn/">KNN</a>에서 배운 교훈 그대로다.
</div>

---

## 7. Iterative Imputer (MICE): 다변량 대체의 끝판왕

KNN Imputer가 "이웃 기반"이라면, Iterative Imputer는 **"모델 기반"** 이다. 통계학에서 MICE(Multiple Imputation by Chained Equations)라고 불리는 방법의 sklearn 구현이다.

### 핵심 아이디어

각 결측 변수를 다른 모든 변수의 함수로 모델링한다. 그리고 이 과정을 반복(iterate)하면서 대체값을 정교하게 만들어간다.

```
Round 1:
  age를 [sex, fare, pclass, embarked]로 예측하는 모델 학습 → age 결측 대체
  fare를 [sex, age(대체됨), pclass, embarked]로 예측 → fare 결측 대체
  ...

Round 2:
  age를 [sex, fare(대체됨), pclass, embarked]로 다시 예측 → age 대체값 업데이트
  fare를 [sex, age(업데이트), pclass, embarked]로 다시 예측 → fare 대체값 업데이트
  ...

Round N: 대체값이 수렴할 때까지 반복
```

### sklearn 구현

```python
from sklearn.experimental import enable_iterative_imputer  # 필수!
from sklearn.impute import IterativeImputer
from sklearn.linear_model import BayesianRidge

# 기본 추정기는 BayesianRidge
iterative_imputer = IterativeImputer(
    estimator=BayesianRidge(),
    max_iter=10,
    random_state=42
)

df_imputed = pd.DataFrame(
    iterative_imputer.fit_transform(df[numeric_cols]),
    columns=numeric_cols
)
```

`enable_iterative_imputer`를 먼저 import해야 한다. sklearn에서 아직 experimental 상태이기 때문이다.

### 추정기 선택

기본 `BayesianRidge`를 다른 모델로 바꿀 수 있다.

```python
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import BayesianRidge

# 선형 관계 → BayesianRidge (기본, 빠름)
imp_linear = IterativeImputer(estimator=BayesianRidge())

# 비선형 관계 → RandomForest (느리지만 정확)
imp_forest = IterativeImputer(
    estimator=RandomForestRegressor(n_estimators=100, random_state=42),
    max_iter=10,
    random_state=42
)
```

RandomForest를 추정기로 쓰면 missForest라고 불리는 방법이 된다. 비선형 관계를 잡아내지만, 계산 비용이 크다.

### MICE의 강점과 한계

```
강점:
[1] 변수 간 관계를 보존 — 상관관계 구조가 유지됨
[2] MAR 가정에서 이론적으로 가장 정확한 방법 중 하나
[3] 유연함 — 추정기를 자유롭게 교체 가능
[4] 불확실성 반영 가능 — 여러 번 대체해서 결과의 변동성을 측정

한계:
[1] 계산 비용이 큼 — 피처 수 × 반복 횟수만큼 모델 학습
[2] MNAR에서는 여전히 편향 발생
[3] 수렴이 보장되지 않을 수 있음 (max_iter를 충분히 설정)
[4] 범주형 변수 처리가 복잡 — 사전 인코딩 필요
```

<div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>실전 가이드</strong>: 결측 비율이 5% 이하면 SimpleImputer로 충분하다. 5~30%이면 KNN Imputer나 IterativeImputer를 고려한다. 30% 이상이면 해당 컬럼을 제거하거나, 결측 지시 변수와 함께 단순 대체를 쓰는 게 더 현실적이다.
</div>

---

## 8. 시계열 데이터의 결측치: 시간의 흐름을 활용하라

시계열 데이터는 **시간적 순서**라는 추가 정보가 있다. 이걸 활용하면 더 자연스러운 대체가 가능하다.

### Forward Fill / Backward Fill

```python
# Forward Fill: 직전 값으로 채움
df['temperature'] = df['temperature'].ffill()

# Backward Fill: 다음 값으로 채움
df['temperature'] = df['temperature'].bfill()

# 둘 다 적용: forward fill 후 남은 결측을 backward fill
df['temperature'] = df['temperature'].ffill().bfill()
```

```
시간  온도
08:00  20.0
09:00  NaN   → ffill: 20.0 (08:00 값)
10:00  NaN   → ffill: 20.0 (08:00 값)
11:00  22.5
12:00  NaN   → ffill: 22.5 (11:00 값)
```

Forward fill은 "마지막으로 관측된 값이 유지된다"는 가정이다. 주가, 센서 데이터, IoT 로그 같은 데이터에서 자연스럽다.

### 보간법 (Interpolation)

```python
# 선형 보간: 두 관측값 사이를 직선으로 연결
df['temperature'] = df['temperature'].interpolate(method='linear')

# 시간 기반 보간: 시간 간격을 고려
df['temperature'] = df['temperature'].interpolate(method='time')

# 다항식 보간
df['temperature'] = df['temperature'].interpolate(method='polynomial', order=2)
```

```
시간  온도
08:00  20.0
09:00  NaN   → 선형 보간: 20.83
10:00  NaN   → 선형 보간: 21.67
11:00  22.5
```

선형 보간은 두 관측값 사이를 직선으로 잇는다. ffill보다 자연스럽지만, 급격한 변화가 있는 구간에서는 실제 패턴을 놓칠 수 있다.

### 시계열 결측치 처리 요약

```
| 방법          | 가정                     | 적합한 상황              |
|--------------|-------------------------|------------------------|
| Forward Fill | 값이 변할 때까지 유지     | 주가, 재고, 상태 데이터    |
| Backward Fill| 미래 값으로 소급          | 사후 분석 (실시간 X)      |
| 선형 보간     | 두 점 사이 직선 변화      | 온도, 센서 (연속적 변화)   |
| 시간 보간     | 시간 간격 비례 변화       | 불균등 시간 간격 데이터    |
| 이동 평균     | 주변 값의 평균            | 노이즈가 많은 시계열      |
```

---

## 9. 트리 기반 모델과 결측치

여기까지 읽으면서 "이거 너무 복잡한데?"라고 느꼈을 수 있다. 좋은 소식이 있다. **트리 기반 부스팅 모델은 결측치를 자체적으로 처리한다.**

### XGBoost의 결측치 처리

XGBoost는 학습 과정에서 결측값을 만나면, 해당 샘플을 왼쪽 자식 노드로 보냈을 때와 오른쪽으로 보냈을 때의 손실을 비교해서 **최적의 방향을 자동으로 결정**한다.

```python
import xgboost as xgb
import numpy as np

# NaN이 포함된 데이터를 그대로 학습 가능
X_train_with_nan = X_train.copy()  # NaN 포함
model = xgb.XGBClassifier(n_estimators=100)
model.fit(X_train_with_nan, y_train)  # 에러 없이 작동
```

### LightGBM의 결측치 처리

LightGBM도 유사한 방식으로 결측값을 처리한다. `use_missing=True`가 기본값이다.

```python
import lightgbm as lgb

model = lgb.LGBMClassifier(n_estimators=100)
model.fit(X_train_with_nan, y_train)  # NaN 그대로 학습
```

### 그래도 대체하는 게 나을까?

```
트리 모델의 자체 처리 vs 사전 대체:

실험적으로, 트리 모델에서는:
- 단순 평균 대체 → 자체 처리보다 성능이 같거나 나빠질 수 있음
- KNN/MICE 대체 → 약간의 성능 향상 가능 (데이터에 따라 다름)
- 결측 지시 변수 추가 → 대부분 도움이 됨

결론: XGBoost/LightGBM을 쓸 때는 NaN을 그대로 두되,
      결측 지시 변수를 추가하는 것이 실전에서 가장 흔한 전략이다.
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>sklearn 모델은 다르다</strong><br><br>
  sklearn의 대부분의 모델(로지스틱 회귀, SVM, <a href="/ml/knn/">KNN</a> 등)은 NaN을 처리하지 못한다. ValueError가 발생한다. 트리 모델의 결측치 자체 처리는 XGBoost, LightGBM, CatBoost 같은 부스팅 라이브러리의 특장점이다.
</div>

---

## 10. Pipeline 통합: 데이터 누수를 막아라

결측치 대체에서 가장 흔한 실수가 **데이터 누수(Data Leakage)** 다. [교차 검증](/ml/cross-validation/) 글에서 배운 것과 같은 원리다.

### 잘못된 방법

```python
# 전체 데이터로 대체 → 테스트 데이터 정보가 누수!
imputer = SimpleImputer(strategy='mean')
X_imputed = imputer.fit_transform(X)  # 테스트 데이터 포함 평균

X_train, X_test = train_test_split(X_imputed, test_size=0.2)
```

전체 데이터의 평균을 계산하면, 테스트 데이터의 정보가 훈련 데이터에 흘러든다. 교차 검증 점수가 실제보다 높게 나온다.

### 올바른 방법: Pipeline

```python
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

pipe = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler()),
    ('model', LogisticRegression())
])

# 교차 검증에서 각 fold마다 imputer가 훈련 데이터만으로 fit됨
scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
print(f"CV Score: {scores.mean():.4f} (+/- {scores.std():.4f})")
```

Pipeline 안에 imputer를 넣으면, [교차 검증](/ml/cross-validation/) 시 **각 fold에서 훈련 데이터만으로 fit**하고 검증 데이터에는 transform만 적용한다. 누수가 원천 차단된다.

### 수치형 + 범주형 동시 처리

실전에서는 수치형과 범주형을 다르게 처리해야 한다. `ColumnTransformer`를 쓴다.

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

numeric_features = ['age', 'fare']
categorical_features = ['embarked', 'sex']

# 수치형: 간단 대체 → 스케일링 → KNN Imputer
# KNN은 거리 기반이므로 스케일링 후에 적용해야 한다.
# SimpleImputer로 초기 대체 → 스케일링 → KNNImputer 순서가 정석이지만,
# KNNImputer는 내부적으로 nan-euclidean distance를 사용해 결측치를 건너뛰므로
# 스케일링 전에 바로 적용해도 동작한다. 다만 스케일 차이가 크면 거리가 왜곡될 수 있다.
numeric_transformer = Pipeline([
    ('imputer', KNNImputer(n_neighbors=5)),
    ('scaler', StandardScaler())
])

# 범주형: 최빈값 대체 → 원핫 인코딩
categorical_transformer = Pipeline([
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('encoder', OneHotEncoder(handle_unknown='ignore'))
])

preprocessor = ColumnTransformer([
    ('num', numeric_transformer, numeric_features),
    ('cat', categorical_transformer, categorical_features)
])

full_pipe = Pipeline([
    ('preprocessor', preprocessor),
    ('model', LogisticRegression())
])

scores = cross_val_score(full_pipe, X, y, cv=5, scoring='accuracy')
```

이것이 실전에서 결측치를 처리하는 **표준 패턴**이다. 전처리 전체를 Pipeline으로 묶어서 데이터 누수 없이 평가한다.

---

## 11. 비교 실험: 전략별 성능 차이

이론만으로는 감이 안 온다. 같은 데이터에 다른 전략을 적용해서 성능을 비교해보자.

```python
from sklearn.datasets import fetch_openml
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer, KNNImputer
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
import numpy as np
import pandas as pd

# Titanic 데이터 로드
titanic = fetch_openml('titanic', version=1, as_frame=True)
X = titanic.data[['age', 'fare', 'pclass', 'sibsp', 'parch']].copy()
y = (titanic.target == '1').astype(int)

# 전략별 Pipeline 정의
strategies = {
    'Mean': Pipeline([
        ('imputer', SimpleImputer(strategy='mean')),
        ('model', LogisticRegression(max_iter=1000))
    ]),
    'Median': Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('model', LogisticRegression(max_iter=1000))
    ]),
    'KNN (k=5)': Pipeline([
        ('imputer', KNNImputer(n_neighbors=5)),
        ('model', LogisticRegression(max_iter=1000))
    ]),
    'Iterative (MICE)': Pipeline([
        ('imputer', IterativeImputer(max_iter=10, random_state=42)),
        ('model', LogisticRegression(max_iter=1000))
    ]),
}

# 5-fold CV로 비교
results = {}
for name, pipe in strategies.items():
    scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
    results[name] = f"{scores.mean():.4f} (+/- {scores.std():.4f})"
    print(f"{name:20s}: {results[name]}")
```

```
일반적인 결과 경향:

| 전략               | CV Accuracy (예시)    |
|-------------------|-----------------------|
| Mean              | 0.6923 (+/- 0.0180)  |
| Median            | 0.6930 (+/- 0.0175)  |
| KNN (k=5)         | 0.6965 (+/- 0.0162)  |
| Iterative (MICE)  | 0.6978 (+/- 0.0155)  |

관찰:
- 이 데이터에서 결측 비율이 크지 않아 차이가 작다
- 결측 비율이 높을수록 정교한 방법의 이점이 커진다
- 모델에 따라서도 결과가 달라진다 (트리 모델은 차이가 더 줄어듦)
```

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>실전 교훈</strong>: 결측치 처리 전략의 차이가 "모델 선택"이나 "피처 엔지니어링"만큼 극적이지는 않다. 결측 비율이 낮으면 대부분의 방법이 비슷한 결과를 낸다. 진짜 중요한 것은 <strong>(1) 데이터 누수를 막는 것</strong>과 <strong>(2) 결측 유형에 맞는 전략을 쓰는 것</strong>이다.
</div>

---

## 12. 결측치 처리 의사결정 가이드

지금까지 배운 내용을 의사결정 트리로 정리하자.

```
결측 비율 확인
│
├── > 50% → 컬럼 제거 (+ 결측 지시 변수 생성)
│
├── 5~50%
│   ├── 결측 유형은?
│   │   ├── MCAR → 삭제 OK (데이터 충분하면)
│   │   ├── MAR  → 다변량 대체 권장 (KNN, MICE)
│   │   └── MNAR → 결측 지시 변수 + 단순 대체
│   │
│   └── 모델은?
│       ├── 트리 기반 (XGB/LGBM) → NaN 유지 + 지시 변수
│       ├── 선형 모델 → KNN/MICE 대체
│       └── 거리 기반 (KNN, SVM) → 대체 필수 + 스케일링
│
├── < 5% → SimpleImputer (mean/median/mode)로 충분
│
└── 시계열 → ffill / interpolate
```

```
전략별 비교 요약:

| 방법             | 복잡도 | 정확도 | 속도  | 가정           |
|-----------------|--------|--------|------|----------------|
| 삭제             | 낮음   | 낮음   | 빠름  | MCAR           |
| Mean/Median     | 낮음   | 보통   | 빠름  | MCAR           |
| 결측 지시 변수    | 낮음   | 보통+  | 빠름  | 없음           |
| KNN Imputer     | 중간   | 높음   | 중간  | MAR, 유사성     |
| Iterative (MICE)| 높음   | 높음   | 느림  | MAR            |
| ffill/보간       | 낮음   | 높음   | 빠름  | 시간적 연속성   |
| 트리 모델 자체    | 없음   | 높음   | 빠름  | 없음           |
```

---

## Phase 7 마무리: 피처 엔지니어링의 전체 그림

Phase 7 (Feature Engineering)에서 배운 것들을 정리하자.

| 순서 | 주제 | 핵심 질문 | 답을 주는 도구 |
|------|------|----------|--------------|
| 30 | [범주형 인코딩](/ml/categorical-encoding/) | 문자열을 숫자로 어떻게 바꾸는가? | Label, One-Hot, Ordinal Encoding |
| 31 | [피처 스케일링](/ml/feature-scaling/) | 피처 크기 차이를 어떻게 맞추는가? | StandardScaler, MinMaxScaler |
| 32 | [피처 선택](/ml/feature-selection/) | 어떤 피처가 진짜 중요한가? | Filter, Wrapper, Embedded |
| 33 | [타겟 인코딩](/ml/target-encoding/) | 범주를 타겟과의 관계로 바꿀 수 있는가? | Target Encoder, Smoothing |
| **34** | **결측치 처리 (이 글)** | **빈칸을 어떻게 채우는가?** | **SimpleImputer, KNN, MICE** |

이 다섯 개가 합쳐지면, 원본 데이터를 모델에 넣을 수 있는 형태로 **완전하게 변환**하는 파이프라인이 완성된다.

```
원본 데이터 → [결측 처리] → [인코딩] → [스케일링] → [피처 선택] → 학습 준비 완료
     │           │            │           │            │
     │        이 글        #30, #33      #31          #32
     │
     └── 범주형, 수치형, 결측 섞인 혼돈의 테이블
```

Phase 1~6에서 모델을 배우고, Phase 7에서 데이터를 다듬는 법을 배웠다. 여기까지가 **지도학습(Supervised Learning)** 의 세계다. 정답(레이블)이 있는 데이터로 모델을 학습하는 전 과정을 다룬 것이다.

하지만 현실에서 레이블이 있는 데이터는 전체의 극히 일부다. 대부분의 데이터에는 정답이 없다. 고객 데이터는 있는데 "이 고객이 이탈할지"라는 레이블은 없다. 유전자 발현 데이터는 있는데 "이 유전자가 어떤 그룹인지"는 모른다. 이런 데이터에서 **구조를 발견**하는 것이 비지도학습(Unsupervised Learning)이다.

Phase 8에서는 비지도학습을 시작한다. 첫 글은 가장 기본적인 클러스터링 알고리즘인 [K-Means](/ml/kmeans-clustering/)다. 레이블 없이 데이터를 그룹으로 나누는 법을 배운다.

---

*Phase 7 끝. Phase 8: Unsupervised Learning 시작 →*
