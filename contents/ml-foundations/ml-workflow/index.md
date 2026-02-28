---
date: '2026-02-28'
title: '머신러닝 프로젝트 전 과정: 데이터 수집부터 모델 배포까지'
category: 'Machine Learning'
series: 'ml-foundations'
seriesOrder: 2
tags: ['Machine Learning', '머신러닝 워크플로우', 'EDA', '데이터 전처리', '모델 배포']
summary: '머신러닝 프로젝트의 전체 흐름을 문제 정의부터 배포까지 단계별로 정리합니다. 반복적인 개발 과정과 실무에서 자주 하는 실수를 코드 예제와 함께 짚어봅니다.'
thumbnail: './thumbnail.png'
---

머신러닝 공부를 시작하면 모델 구현 코드는 금방 찾을 수 있다. 그런데 막상 실제 데이터를 앞에 두면 막막해진다. "이 데이터 어떻게 정리하지?", "모델은 어떤 걸 써야 하지?", "학습시켰는데 이게 잘 된 건지 어떻게 알아?"

알고리즘을 아는 것과 프로젝트를 완성하는 것은 완전히 다른 문제다. 이 글에서는 머신러닝 프로젝트가 어떤 단계를 거쳐 완성되는지 전체 흐름을 잡는다. [지난 글에서 지도학습, 비지도학습, 강화학습의 개념을 살펴봤다면](/ml-foundations/ml-overview/), 이번엔 "실제로 프로젝트를 어떻게 진행하는가"에 집중한다.

---

## 워크플로우는 선형이 아니다

많은 입문자들이 ML 프로젝트를 이렇게 상상한다.

```
데이터 수집 → 전처리 → 모델 학습 → 배포  (끝)
```

현실은 다르다.

```
문제 정의
    ↓
데이터 수집 ←──────────────────┐
    ↓                          │
EDA (탐색적 분석)              │ 반복
    ↓                          │
데이터 전처리 ←────────────────┤
    ↓                          │
모델 학습 & 평가 ──────────────┘
    ↓
배포
    ↓
모니터링 → (다시 데이터 수집으로)
```

모델 평가 결과를 보고 전처리 방식을 바꾸고, 새 데이터를 수집하고, 다시 학습시키는 과정이 반복된다. Andrew Ng은 이 반복적인 특성 때문에 ML 개발을 "실험 중심 개발(Iterative Development)"이라고 부른다. 한 번에 완성하려는 욕심을 버리는 것이 첫 번째 마인드셋이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  실무 ML 엔지니어의 시간 배분은 대략 이렇다: 데이터 수집/정제 60-70%, 모델링 20-30%, 배포/모니터링 10-20%. 알고리즘 공부에 시간을 많이 투자하게 되지만, 실제로는 데이터를 다루는 능력이 훨씬 더 결정적이다.
</div>

이 글 전체에서 **집값 예측 프로젝트**를 예시로 쓴다. 면적, 층수, 위치 같은 특성으로 아파트 가격을 예측하는 회귀 문제다.

---

## 1단계: 문제 정의

코드보다 먼저 해야 하는 것. 의외로 이 단계를 서두르다가 나중에 처음부터 다시 하는 경우가 많다.

**풀어야 할 질문:**

- 무엇을 예측하는가? (타겟 변수)
- 회귀인가, 분류인가?
- 어떤 평가지표가 의미 있는가?
- 어느 정도의 성능이면 "성공"인가?

집값 예측이라면:
- 타겟: 가격 (연속값 → 회귀)
- 평가지표: MAE(평균 절대 오차) — "평균적으로 얼마나 틀리는가"가 직관적
- 성공 기준: MAE가 2,000만원 이하면 실용적으로 쓸 만하다

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  평가지표를 나중에 결정하면 안 된다. 모델을 학습시킨 후 "이 지표가 높네, 이걸로 쓰자"는 순환 논리다. 비즈니스 요구사항에서 평가지표가 먼저 결정되어야 한다.
</div>

---

## 2단계: 데이터 수집과 EDA

데이터 없이는 아무것도 할 수 없다. 데이터를 어디서 구할 것인지가 프로젝트의 첫 번째 현실적인 관문이다.

**데이터 소스:**
- **공개 데이터셋**: Kaggle, UCI ML Repository, 공공데이터포털(data.go.kr)
- **직접 수집**: 웹 크롤링, API 호출
- **사내 데이터**: DB, 로그 파일

데이터를 확보하면 바로 모델을 학습시키고 싶어진다. 그보다 먼저 해야 할 것이 **EDA(Exploratory Data Analysis, 탐색적 데이터 분석)**다. 데이터를 이해하지 못한 채 학습시키면 이상한 결과가 나와도 왜 그런지 알 수 없다.

```python
import pandas as pd
import numpy as np

# 데이터 로드
df = pd.read_csv('apartments.csv')

# 1. 기본 구조 파악
print(df.shape)       # (10000, 12) → 10,000행, 12개 컬럼
print(df.dtypes)      # 각 컬럼의 데이터 타입
print(df.head())      # 첫 5행 확인

# 2. 결측치 확인
print(df.isnull().sum())
# area          0
# floor        23   ← 23개 결측치
# built_year  156   ← 156개 결측치
# price         0

# 3. 기본 통계
print(df.describe())
#         area        floor        price
# mean   84.3         8.2       45000.0
# std    21.5         4.1       18000.0
# min    20.0         1.0        8000.0
# max   200.0        30.0      350000.0
```

`describe()`의 min/max를 보면 이상값을 금방 발견할 수 있다. 20m² 아파트나 8,000만원짜리 신축 아파트는 실제로 존재할까? 도메인 지식을 동원해서 이상값인지 특수 케이스인지 판단해야 한다.

```python
# 4. 타겟 변수(가격) 분포 확인
import matplotlib.pyplot as plt

df['price'].hist(bins=50)
plt.title('가격 분포')
plt.xlabel('가격 (만원)')
plt.show()

# 5. 주요 특성과 타겟의 관계
correlation = df.corr()['price'].sort_values(ascending=False)
print(correlation)
# area          0.72   ← 면적이 가격과 가장 강한 상관관계
# floor         0.31
# built_year   -0.18   ← 건축연도가 오래될수록 가격이 낮은 경향
```

EDA 단계에서 얻는 인사이트가 이후 전처리와 피처 엔지니어링 방향을 결정한다.

---

## 3단계: 데이터 전처리

현실 데이터는 항상 지저분하다. 그 상태로는 모델에 넣을 수 없다. 전처리는 크게 세 가지 문제를 해결한다.

### 결측치 처리

```python
from sklearn.impute import SimpleImputer

# 숫자형 결측치 → 중앙값으로 대체
imputer = SimpleImputer(strategy='median')
df[['floor', 'built_year']] = imputer.fit_transform(df[['floor', 'built_year']])
```

결측치를 무조건 평균이나 중앙값으로 채우는 게 항상 정답은 아니다. 결측이 "무작위"가 아닌 경우(예: 특정 지역 데이터만 빠진 경우)라면 결측 여부 자체가 정보가 될 수 있다.

### 범주형 변수 인코딩

```python
# 지역(구) 컬럼이 문자열인 경우
df = pd.get_dummies(df, columns=['district'], drop_first=True)
# '강남구', '서초구', '마포구' → 0/1 컬럼들로 변환
```

### 피처 스케일링

모델마다 다르지만, 선형 모델과 KNN처럼 거리/크기에 민감한 알고리즘은 스케일링이 필수다.

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)
# 평균 0, 표준편차 1로 정규화
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 데이터 누수(Data Leakage) 주의</strong><br>
  <code>fit_transform()</code>은 훈련 데이터에만 적용하고, 테스트 데이터에는 반드시 <code>transform()</code>만 써야 한다. 테스트 데이터의 통계를 훈련에 쓰면 모델이 실제보다 좋아 보이는 착시가 생긴다.
</div>

---

## 4단계: 모델 학습과 평가

### 데이터 분리부터

학습에 쓴 데이터로 평가하면 시험 문제를 미리 알고 시험 보는 것과 같다.

```python
from sklearn.model_selection import train_test_split

X = df.drop('price', axis=1)
y = df['price']

# 훈련(80%) / 테스트(20%) 분리
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print(f"훈련 데이터: {X_train.shape[0]}건")
print(f"테스트 데이터: {X_test.shape[0]}건")
```

### 간단한 모델부터 시작

처음부터 XGBoost나 신경망을 꺼낼 필요가 없다. **가장 단순한 모델의 성능을 먼저 확인**하는 것이 좋다. 이를 베이스라인(Baseline)이라고 한다.

```python
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

# 베이스라인: 선형 회귀
model = LinearRegression()
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
mae = mean_absolute_error(y_test, y_pred)
print(f"MAE: {mae:,.0f}만원")
# MAE: 3,240만원
```

3,240만원이 좋은 성능인지 나쁜 성능인지는 목표 기준(2,000만원 이하)과 비교하면 판단할 수 있다. 이 베이스라인을 기준으로 "더 복잡한 모델을 쓰면 얼마나 개선되는가"를 측정한다.

```python
from sklearn.ensemble import RandomForestRegressor

# 더 복잡한 모델 시도
rf_model = RandomForestRegressor(n_estimators=100, random_state=42)
rf_model.fit(X_train, y_train)

y_pred_rf = rf_model.predict(X_test)
mae_rf = mean_absolute_error(y_test, y_pred_rf)
print(f"랜덤 포레스트 MAE: {mae_rf:,.0f}만원")
# 랜덤 포레스트 MAE: 1,820만원  ← 목표 달성!
```

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 모델 선택 원칙</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>항상 단순한 모델(선형 회귀, 로지스틱 회귀)로 베이스라인을 잡는다</li>
    <li>복잡한 모델은 베이스라인 대비 "얼마나 개선됐는가"로 정당화한다</li>
    <li>복잡도 증가 대비 성능 개선이 미미하면, 단순한 모델이 낫다</li>
  </ul>
</div>

---

## 5단계: 배포와 그 이후

좋은 모델을 만들었다면 실제로 쓸 수 있게 만들어야 한다. 가장 일반적인 방식은 REST API로 감싸서 서비스로 제공하는 것이다.

```python
# 학습된 모델 저장
import joblib

joblib.dump(rf_model, 'apartment_price_model.pkl')
joblib.dump(scaler, 'scaler.pkl')
```

```python
# FastAPI로 예측 서비스 만들기
from fastapi import FastAPI
import joblib
import numpy as np

app = FastAPI()
model = joblib.load('apartment_price_model.pkl')
scaler = joblib.load('scaler.pkl')

@app.post("/predict")
def predict_price(area: float, floor: int, built_year: int):
    features = np.array([[area, floor, built_year]])
    features_scaled = scaler.transform(features)
    price = model.predict(features_scaled)[0]
    return {"predicted_price": round(price, -2)}  # 100만원 단위로 반올림
```

배포 후가 끝이 아니다. 모델은 시간이 지나면서 성능이 떨어진다. 부동산 시장이 변하면 과거 데이터로 학습한 모델의 예측은 점점 빗나간다. 이를 **모델 드리프트(Model Drift)**라고 하며, 정기적으로 새 데이터로 재학습하는 파이프라인이 필요하다.

---

## 흔히 하는 실수 3가지

### 1. 테스트 세트에 손대기

여러 모델을 시도하다가 테스트 성능이 좋은 것을 고르는 경우가 있다. 이렇게 하면 테스트 세트가 사실상 검증 세트가 되어버린다. 진짜 테스트 세트는 **딱 한 번**, 최종 모델을 평가할 때만 써야 한다.

### 2. 데이터 누수

테스트 데이터의 정보가 훈련 과정에 흘러들어가는 것. 가장 흔한 실수는 전체 데이터에 `fit_transform()`을 적용한 뒤 분리하는 것이다.

```python
# ❌ 잘못된 순서: 전체 데이터로 fit → 분리
X_scaled = scaler.fit_transform(X)  # 테스트 데이터 정보가 포함됨
X_train, X_test = train_test_split(X_scaled, ...)

# ✅ 올바른 순서: 분리 → 훈련 데이터로만 fit
X_train, X_test = train_test_split(X, ...)
X_train_scaled = scaler.fit_transform(X_train)   # 훈련 데이터로만 fit
X_test_scaled = scaler.transform(X_test)          # transform만 적용
```

### 3. EDA 없이 바로 모델링

데이터를 이해하지 않은 채 모델부터 돌리는 것. 이상값이나 잘못된 데이터가 섞여 있으면 아무리 좋은 알고리즘을 써도 결과를 신뢰할 수 없다. 경험상 EDA에 시간을 충분히 쓴 프로젝트가 나중에 훨씬 빠르게 진행된다.

---

## 마치며

머신러닝 프로젝트에서 "알고리즘 선택"은 생각보다 작은 부분이다. 문제를 제대로 정의하고, 데이터를 깊이 이해하고, 올바르게 평가하는 것이 훨씬 더 많은 시간을 차지한다. 처음 프로젝트를 진행할 때 이 흐름을 염두에 두면, 어느 단계에서 막혔는지 명확하게 파악할 수 있다.

다음 글부터는 본격적으로 알고리즘을 파고든다. ml-linear 시리즈에서 가장 기본적인 지도학습 알고리즘인 선형 회귀(Linear Regression)부터 시작한다. 오늘 살펴본 집값 예측 예시가 실제로 어떻게 작동하는지 수식과 코드로 낱낱이 분해할 예정이다.

---

## 참고자료

- [Andrew Ng — Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn: Getting Started](https://scikit-learn.org/stable/getting_started.html)
- [Google ML Crash Course — ML Engineering for Production](https://developers.google.com/machine-learning/crash-course)
