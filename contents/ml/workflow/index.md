---
date: '2026-01-02'
title: '문제 정의부터 배포까지, 머신러닝 프로젝트의 전 과정'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 2
tags: ['Machine Learning', '머신러닝 워크플로우', 'EDA', '데이터 전처리', '데이터 누수', '모델 배포']
summary: '문제 정의, EDA, 전처리, 학습과 평가, 배포로 이어지는 머신러닝 프로젝트의 흐름을 정리한다. 이 흐름이 한 방향 직선이 아니라 되돌아오는 고리인 이유까지.'
thumbnail: './thumbnail.png'
---

머신러닝을 공부하다 보면 모델 구현 코드는 금방 찾을 수 있다. 그런데 막상 실제 데이터를 앞에 두면 막막해진다. "이 데이터를 어떻게 정리하지", "모델은 뭘 써야 하지", "학습은 시켰는데 잘 된 건지 어떻게 알지".

알고리즘을 아는 것과 프로젝트를 끝내는 것은 다른 문제다. 어떤 알고리즘을 쓰든 반복되는 공통 절차가 있고, 그 절차가 머리에 있으면 막혔을 때 어느 단계로 돌아가야 하는지가 보인다.

## 워크플로우는 한 방향이 아니다

처음에는 ML 프로젝트를 데이터 수집에서 배포로 곧게 이어지는 직선으로 상상하기 쉽다. 실제 모양은 이렇다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 516" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle"
     role="img" aria-label="문제 정의에서 모니터링까지 이어지는 머신러닝 프로젝트 단계와, 모델 평가와 모니터링에서 데이터 수집으로 되돌아오는 두 개의 반복 고리">
<defs><marker id="wfPipeHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/></marker>
<marker id="wfLoopHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent, #9d5604)"/></marker></defs>
<rect x="16" y="18" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="40" font-size="16" font-weight="700" fill="var(--text, #1c1917)">문제 정의</text>
<text x="148" y="59" font-size="14" fill="var(--text-muted, #6d6762)">타겟 변수·평가지표·성공 기준</text>
<path d="M 148 71 L 148 86" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="90" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="112" font-size="16" font-weight="700" fill="var(--text, #1c1917)">데이터 수집</text>
<text x="148" y="131" font-size="14" fill="var(--text-muted, #6d6762)">공개 데이터셋·크롤링·사내 DB</text>
<path d="M 148 143 L 148 158" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="162" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="184" font-size="16" font-weight="700" fill="var(--text, #1c1917)">EDA</text>
<text x="148" y="203" font-size="14" fill="var(--text-muted, #6d6762)">분포·결측치·상관관계 확인</text>
<path d="M 148 215 L 148 230" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="234" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="256" font-size="16" font-weight="700" fill="var(--text, #1c1917)">데이터 전처리</text>
<text x="148" y="275" font-size="14" fill="var(--text-muted, #6d6762)">결측 대체·인코딩·스케일링</text>
<path d="M 148 287 L 148 302" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="306" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="328" font-size="16" font-weight="700" fill="var(--text, #1c1917)">모델 학습과 평가</text>
<text x="148" y="347" font-size="14" fill="var(--text-muted, #6d6762)">베이스라인 → 복잡한 모델</text>
<path d="M 148 359 L 148 374" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="378" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="400" font-size="16" font-weight="700" fill="var(--text, #1c1917)">배포</text>
<text x="148" y="419" font-size="14" fill="var(--text-muted, #6d6762)">모델 저장·예측 API</text>
<path d="M 148 431 L 148 446" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#wfPipeHead)"/>
<rect x="16" y="450" width="264" height="50" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="148" y="472" font-size="16" font-weight="700" fill="var(--text, #1c1917)">모니터링</text>
<text x="148" y="491" font-size="14" fill="var(--text-muted, #6d6762)">성능 하락·드리프트 관찰</text>
<path d="M 280 331 H 312 V 128 H 288" fill="none" stroke="var(--accent, #9d5604)" stroke-width="1.6" marker-end="url(#wfLoopHead)"/>
<text x="298" y="232" font-size="14" font-weight="700" fill="var(--accent, #9d5604)" transform="rotate(-90 298 232)">성능 미달 시 반복</text>
<path d="M 280 475 H 356 V 104 H 288" fill="none" stroke="var(--accent, #9d5604)" stroke-width="1.6" marker-end="url(#wfLoopHead)"/>
<text x="344" y="290" font-size="14" font-weight="700" fill="var(--accent, #9d5604)" transform="rotate(-90 344 290)">드리프트 감지 시 재학습</text>
</svg>
</div>

평가 결과를 보고 전처리 방식을 바꾸고, 특성이 모자라면 데이터를 더 모으고, 다시 학습시키는 과정이 반복된다. 배포한 뒤에도 성능이 떨어지면 데이터 수집으로 되돌아온다. ML 개발이 공학보다 실험에 가깝다고 말하는 이유가 이 두 개의 고리에 있다. 한 번에 완성하려는 욕심을 버리는 것이 첫 번째 마인드셋이고, 이 고리를 몇 바퀴 도는 동안 시간의 대부분은 알고리즘이 아니라 데이터를 모으고 정제하는 데 들어간다.

## 문제 정의

코드보다 먼저 확정해야 하는 것이 있다. 이 단계를 서두르면 나중에 처음부터 다시 하게 된다.

- 무엇을 예측하는가 (타겟 변수)
- 그 타겟이 연속값인가 카테고리인가 (회귀인가 분류인가)
- 어떤 지표로 성능을 재는가
- 어느 수준이면 "성공"인가

이후 설명은 면적·층수·건축연도로 아파트 가격을 맞히는 문제를 예시로 삼는다. 타겟은 가격이고, 연속값이니 회귀다. 지표는 MAE(평균 절대 오차)를 쓴다. "평균적으로 얼마나 틀리는가"를 원 단위 그대로 읽을 수 있어서 비즈니스 쪽과 이야기하기 쉽다. 성공 기준은 MAE 2,000만원 이하로 잡는다.

:::warning

**평가지표는 학습 전에 정한다**

모델을 여러 개 돌려본 뒤 "이 지표에서 점수가 잘 나오네, 이걸 쓰자"고 정하면 지표가 모델을 정당화하는 순환 논리가 된다. 지표는 비즈니스 요구에서 나와야 하고, 순서가 뒤집히면 성능 개선을 스스로 속이게 된다.

:::

## 데이터 수집과 EDA

데이터는 공개 데이터셋(Kaggle, UCI ML Repository, 공공데이터포털), 직접 수집(크롤링·API 호출), 사내 DB와 로그 중 어딘가에서 나온다. 확보하면 바로 학습시키고 싶어지지만 그 앞에 **EDA(Exploratory Data Analysis, 탐색적 데이터 분석)** 가 있다. 데이터를 이해하지 못한 채 학습시키면 이상한 결과가 나와도 원인을 짚을 수 없다.

```python
import pandas as pd

df = pd.read_csv('apartments.csv')

df.shape            # (10000, 12)
df.dtypes           # 컬럼별 타입
df.isnull().sum()   # floor 23건, built_year 156건 결측
df.describe()       # 컬럼별 min·max·평균·표준편차
```

`describe()`의 min과 max가 이상값을 가장 빨리 드러낸다. 20m² 아파트나 8,000만원짜리 매물이 이 데이터셋에 있을 만한 값인지는 도메인 지식으로 판단해야 한다. 잘못 입력된 값인지, 드물지만 실제로 존재하는 케이스인지에 따라 처리가 완전히 달라진다.

그다음은 타겟 변수의 분포와 특성-타겟 관계다.

```python
df['price'].hist(bins=50)   # 가격이 한쪽으로 치우쳐 있는지 확인

df.corr(numeric_only=True)['price'].sort_values(ascending=False)
# area          0.72
# floor         0.31
# built_year   -0.18
```

면적이 가격과 가장 강하게 붙어 있고, 건축연도는 음의 상관을 보인다. 여기서 얻은 감각이 다음 단계의 전처리와 피처 엔지니어링 방향을 정한다. 다만 상관계수는 선형 관계만 잡아내므로, 값이 0에 가깝다고 해서 그 특성이 쓸모없다고 단정하면 안 된다.

## 데이터 전처리

전처리에 손대기 전에 먼저 할 일이 있다. 훈련 데이터와 테스트 데이터를 나누는 것이다.

```python
from sklearn.model_selection import train_test_split

X, y = df.drop('price', axis=1), df['price']
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
```

순서가 중요하다. 전체 데이터로 평균과 표준편차를 구한 뒤에 나누면, 테스트 데이터의 통계가 훈련 과정에 이미 섞여 들어간다. 모델은 아직 보지 못했어야 할 정보를 쥔 채로 평가받고, 성능은 실제보다 좋아 보인다. 이것이 **데이터 누수(Data Leakage)** 이고, 결과를 조용히 부풀리기 때문에 발견하기가 가장 어렵다.

나눈 다음 전처리가 푸는 문제는 크게 셋이다.

| 문제 | 대표 처리 | 놓치기 쉬운 점 |
|---|---|---|
| 결측치 | 평균·중앙값 대체, 해당 행 삭제 | 결측이 무작위가 아니면 결측 여부 자체가 정보다 |
| 범주형 변수 | 원핫 인코딩, 타겟 인코딩 | 범주 수가 많으면 원핫으로 컬럼이 폭발한다 |
| 서로 다른 스케일 | 표준화, 정규화 | 거리·크기에 민감한 모델에만 필요하다 |

```python
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

imputer = SimpleImputer(strategy='median')
X_train[['floor', 'built_year']] = imputer.fit_transform(X_train[['floor', 'built_year']])
X_test[['floor', 'built_year']] = imputer.transform(X_test[['floor', 'built_year']])

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

`fit_transform()`과 `transform()`이 짝을 이루는 것이 핵심이다. 훈련 데이터에서만 중앙값과 평균·표준편차를 배우고, 테스트 데이터에는 그렇게 배운 값을 적용하기만 한다. 이 규칙은 스케일러뿐 아니라 결측 대체, 인코딩을 포함해 `fit`이 붙은 모든 처리에 똑같이 적용된다. 단계가 늘어날수록 한 군데를 빠뜨리기 쉬워서, 실무에서는 전처리와 모델을 `sklearn.pipeline.Pipeline` 하나로 묶어 `fit`이 훈련 데이터에서만 돌아가도록 강제한다.

## 모델 학습과 평가

학습에 쓴 데이터로 평가하는 것은 시험 문제를 미리 보고 시험을 치는 것과 같다. 앞에서 떼어둔 테스트 세트가 그래서 필요하다.

처음부터 XGBoost나 신경망을 꺼낼 필요는 없다. **가장 단순한 모델의 성능을 먼저 재둔다.** 이것이 베이스라인(Baseline)이다.

```python
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

baseline = LinearRegression().fit(X_train_scaled, y_train)
mean_absolute_error(y_test, baseline.predict(X_test_scaled))
# 3240.0

rf = RandomForestRegressor(n_estimators=100, random_state=42).fit(X_train, y_train)
mean_absolute_error(y_test, rf.predict(X_test))
# 1820.0
```

베이스라인 MAE 3,240만원은 목표인 2,000만원을 한참 넘는다. 랜덤 포레스트로 바꾸면 1,820만원까지 내려가 기준을 통과한다. 여기서 의미 있는 것은 1,820이라는 숫자가 아니라 베이스라인 대비 44% 줄었다는 비교다. 기준선이 없으면 어떤 모델의 점수를 봐도 그게 좋은 건지 판단할 방법이 없다.

랜덤 포레스트에는 스케일링하지 않은 입력을 넣었다. 트리 계열 모델은 특성값의 절대 크기가 아니라 어디서 나눌지만 보기 때문에 스케일에 영향받지 않는다.

여러 모델을 이렇게 돌려볼 때 조심할 것이 하나 있다. 테스트 성능이 가장 좋은 모델을 고르는 순간, 그 테스트 세트는 이미 검증 세트가 되어 있다. 고르는 행위 자체가 테스트 세트의 정보를 모델 선택에 흘려 넣기 때문이다. 하이퍼파라미터를 정하거나 모델을 비교할 때는 훈련 데이터를 다시 쪼갠 검증 세트나 교차 검증을 쓰고, 테스트 세트는 최종 모델을 딱 한 번 평가할 때만 연다.

:::tip

**복잡한 모델은 베이스라인 대비 개선폭으로 정당화한다**

복잡도가 올라가면 학습 시간, 추론 지연, 해석 가능성, 운영 비용이 모두 나빠진다. 개선폭이 그 대가를 넘지 못하면 단순한 모델이 낫다.

:::

## 배포와 그 이후

학습된 모델을 파일로 저장하고 API 뒤에 두는 것이 가장 일반적인 형태다.

```python
import joblib
from fastapi import FastAPI

joblib.dump(rf, 'apartment_price.pkl')

app = FastAPI()
model = joblib.load('apartment_price.pkl')

@app.post("/predict")
def predict_price(area: float, floor: int, built_year: int):
    price = model.predict([[area, floor, built_year]])[0]
    return {"predicted_price": round(price, -2)}   # 100만원 단위로 반올림
```

여기에 함정이 하나 있다. 학습할 때 쓴 전처리를 추론에서도 똑같이 재현해야 한다는 것이다. 스케일러를 썼다면 그 스케일러도 함께 저장해서 같은 순서로 적용해야 하고, 원핫 인코딩을 했다면 컬럼 순서와 범주 목록까지 맞아야 한다. 전처리와 모델을 하나의 `Pipeline`으로 묶어 통째로 저장하면 이 어긋남이 구조적으로 생기지 않는다.

배포는 끝이 아니라 마지막 고리의 시작이다. 부동산 시장이 변하면 과거 데이터로 학습한 모델의 예측은 조금씩 빗나가기 시작한다. 입력 데이터의 분포가 변하거나 입력과 타겟의 관계 자체가 변하는 이 현상을 **모델 드리프트(Model Drift)** 라고 한다. 코드는 그대로인데 성능만 조용히 떨어지므로, 예측 성능과 입력 분포를 계속 재는 모니터링과 새 데이터로 다시 학습시키는 파이프라인이 배포와 한 묶음이어야 한다.

## 마치며

머신러닝 프로젝트에서 알고리즘 선택은 생각보다 작은 부분이다. 문제를 어떻게 정의했는지, 데이터를 얼마나 이해했는지, 평가를 정직하게 했는지가 결과의 대부분을 결정한다. 같은 데이터에 같은 알고리즘을 써도 이 셋에서 갈린다.

그리고 이 단계들은 한 번 지나가면 끝나는 체크리스트가 아니다. 평가 결과가 전처리를 바꾸고, 배포 이후의 모니터링이 데이터 수집을 다시 부른다. 지금 막혀 있다면 어느 고리로 돌아가야 하는지를 먼저 정하는 편이 빠르다.

다음 글부터는 알고리즘 자체로 들어간다. 가장 단순한 지도학습 모델인 선형 회귀에서 시작한다.

## 함께 보면 좋은 글

- [머신러닝이란 무엇인가](/ml/overview/) : 지도·비지도·강화학습이 각각 무엇을 학습 신호로 쓰는가
- [선형 회귀](/ml/linear-regression/) : 베이스라인으로 가장 먼저 잡는 모델의 내부
- [교차 검증](/ml/cross-validation/) : 테스트 세트를 열지 않고 모델을 고르는 방법
- [피처 스케일링](/ml/feature-scaling/) : 표준화와 정규화가 어떤 모델에 필요한가

## 참고자료

- [Andrew Ng, Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn: Getting Started](https://scikit-learn.org/stable/getting_started.html)
- [Google Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course)
