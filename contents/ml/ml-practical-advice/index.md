---
date: '2026-01-29'
title: '학습 곡선과 오차 분석으로 다음에 무엇을 할지 정한다'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 29
tags: ['ML Practical Advice', 'Learning Curve', '학습 곡선', 'Error Analysis', '오차 분석', '편향 분산', '데이터 중심 AI', '머신러닝']
summary: '모델 정확도가 75%일 때 데이터를 더 모을지 모델을 바꿀지 가려내는 기준. 학습 곡선으로 편향과 분산을 진단하고, 오차 분석으로 개선 순서를 정한다.'
thumbnail: './thumbnail.png'
---

모델을 학습시켰고 검증 정확도가 75%가 나왔다. **다음에 뭘 해야 하는가?**

- 데이터를 더 모은다
- 더 복잡한 모델로 바꾼다
- 피처를 추가한다
- 규제를 강화한다
- 학습률을 바꾼다

이 중 어느 하나를 감으로 고르면 대부분 시간을 버린다. 데이터가 부족한 게 아닌데 라벨링에 두 주를 쓰고, 이미 과적합인 모델을 더 키우고, 노이즈뿐인 피처를 더 넣는다. 편향이 높을 때 맞는 처방과 분산이 높을 때 맞는 처방은 정확히 반대라서, 잘못 고르면 제자리가 아니라 뒤로 간다.

그래서 개선보다 **진단**이 먼저다.

## 학습 곡선이 답하는 질문

학습 곡선은 훈련 데이터의 양을 늘려가면서 훈련 에러와 검증 에러가 어떻게 움직이는지 그린 그래프다. 데이터를 10%, 20%, ... 100%로 늘려가며 매번 모델을 다시 학습하고 두 점수를 기록한다.

```python
from sklearn.model_selection import learning_curve
import numpy as np

train_sizes, train_scores, val_scores = learning_curve(
    model, X, y,
    train_sizes=np.linspace(0.1, 1.0, 10),
    cv=5, scoring='accuracy',
)
train_mean = train_scores.mean(axis=1)
val_mean = val_scores.mean(axis=1)
```

읽는 법은 두 곡선의 **높이**와 **간격**, 이 둘뿐이다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 610" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="학습 곡선의 세 가지 패턴. 위쪽은 훈련 에러와 검증 에러가 모두 높은 곳에서 붙어 수렴하는 높은 편향, 가운데는 훈련 에러가 낮은데 검증 에러가 높아 간격이 크게 벌어진 높은 분산, 아래쪽은 두 곡선이 낮은 에러에서 좁은 간격으로 만나는 이상적인 경우다">
<style>
.pa1-t { fill: var(--text, #1c1917); }
.pa1-m { fill: var(--text-muted, #6d6762); }
.pa1-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; }
.pa1-tr { fill: none; stroke: var(--primary, #0a756c); stroke-width: 2.5; }
.pa1-va { fill: none; stroke: var(--accent, #9d5604); stroke-width: 2.5; stroke-dasharray: 6 4; }
</style>
<defs>
<marker id="pa1Head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 범례 -->
<line x1="76" y1="20" x2="104" y2="20" class="pa1-tr"/>
<text x="110" y="25" class="pa1-m" font-size="14">훈련 에러</text>
<line x1="212" y1="20" x2="240" y2="20" class="pa1-va"/>
<text x="246" y="25" class="pa1-m" font-size="14">검증 에러</text>
<!-- 위 패널: 높은 편향 -->
<text x="200" y="52" class="pa1-t" font-size="16" font-weight="700" text-anchor="middle">위 · 높은 편향 (과소적합)</text>
<rect x="64" y="64" width="282" height="120" fill="var(--bg-subtle, #f5f4f2)"/>
<line x1="64" y1="186" x2="64" y2="60" class="pa1-ax" marker-end="url(#pa1Head)"/>
<line x1="62" y1="184" x2="352" y2="184" class="pa1-ax" marker-end="url(#pa1Head)"/>
<text x="46" y="124" class="pa1-m" font-size="14" text-anchor="middle" transform="rotate(-90 46 124)">에러</text>
<path class="pa1-tr" d="M72,174 C120,130 180,106 340,98"/>
<path class="pa1-va" d="M72,74 C140,84 220,90 340,92"/>
<text x="205" y="208" class="pa1-m" font-size="14" text-anchor="middle">훈련 데이터 수</text>
<!-- 가운데 패널: 높은 분산 -->
<text x="200" y="244" class="pa1-t" font-size="16" font-weight="700" text-anchor="middle">가운데 · 높은 분산 (과적합)</text>
<rect x="64" y="256" width="282" height="120" fill="var(--bg-subtle, #f5f4f2)"/>
<line x1="64" y1="378" x2="64" y2="252" class="pa1-ax" marker-end="url(#pa1Head)"/>
<line x1="62" y1="376" x2="352" y2="376" class="pa1-ax" marker-end="url(#pa1Head)"/>
<text x="46" y="316" class="pa1-m" font-size="14" text-anchor="middle" transform="rotate(-90 46 316)">에러</text>
<path class="pa1-tr" d="M72,356 C130,365 210,368 340,369"/>
<path class="pa1-va" d="M72,266 C145,280 235,290 340,298"/>
<line x1="322" y1="298" x2="322" y2="369" stroke="var(--text-muted, #6d6762)" stroke-width="1" stroke-dasharray="3 3"/>
<text x="314" y="338" class="pa1-m" font-size="14" text-anchor="end">간격</text>
<text x="205" y="400" class="pa1-m" font-size="14" text-anchor="middle">훈련 데이터 수</text>
<!-- 아래 패널: 이상적 -->
<text x="200" y="436" class="pa1-t" font-size="16" font-weight="700" text-anchor="middle">아래 · 이상적인 학습 곡선</text>
<rect x="64" y="448" width="282" height="120" fill="var(--bg-subtle, #f5f4f2)"/>
<line x1="64" y1="570" x2="64" y2="444" class="pa1-ax" marker-end="url(#pa1Head)"/>
<line x1="62" y1="568" x2="352" y2="568" class="pa1-ax" marker-end="url(#pa1Head)"/>
<text x="46" y="508" class="pa1-m" font-size="14" text-anchor="middle" transform="rotate(-90 46 508)">에러</text>
<path class="pa1-tr" d="M72,550 C130,555 210,557 340,558"/>
<path class="pa1-va" d="M72,468 C135,524 225,540 340,544"/>
<text x="205" y="592" class="pa1-m" font-size="14" text-anchor="middle">훈련 데이터 수</text>
</svg>
</div>

**높은 편향**은 두 곡선이 높은 에러에서 붙어버린 모양이다. 훈련 데이터를 다 넣어도 모델이 훈련 세트조차 제대로 맞히지 못한다. 데이터를 두 배로 늘려도 두 곡선은 같은 높이에 그대로 머문다. 모델의 표현력이 문제라서 그렇다.

**높은 분산**은 훈련 에러가 바닥에 붙었는데 검증 에러만 높은 모양이다. 모델이 훈련 데이터를 외우고 있다. 데이터를 늘리면 간격이 서서히 좁아지는 추세가 보이는데, 이 추세가 곧 "데이터를 더 모을 가치가 있다"는 신호다.

**이상적인 곡선**은 두 곡선이 낮은 곳에서 좁은 간격으로 만난다. 남은 에러는 대체로 줄일 수 없는 잡음이다.

그래서 학습 곡선은 "데이터를 더 모아야 하는가?"에 직접 답한다. 과소적합이면 아무리 모아도 소용없고, 과적합이면 가장 확실한 처방이다.

### 진단이 갈리면 처방도 반대다

| 손댈 곳 | 높은 편향 (과소적합) | 높은 분산 (과적합) |
|---|---|---|
| 모델 복잡도 | 올린다 (선형 → 트리 앙상블) | 내린다 (`max_depth`↓, 층수↓) |
| 규제 강도 | 낮춘다 (`alpha`↓, `C`↑) | 높인다 (L1/L2, Dropout) |
| 피처 | 다항 조합·도메인 피처를 추가한다 | 기여도 낮은 피처를 뺀다 |
| 학습 시간 | 에포크를 늘린다 | 조기 종료한다 |
| 데이터 추가 | 도움이 되지 않는다 | 가장 확실한 처방이다 |

편향 쪽에서 놓치기 쉬운 것은 두 번째 줄이다. 모델이 단순해서가 아니라 **입력에 신호가 없어서** 못 맞히는 경우가 많다. `PolynomialFeatures(degree=2, interaction_only=True)`로 상호작용 항을 넣거나 도메인 지식으로 새 피처를 만드는 쪽이, 모델을 XGBoost로 갈아 끼우는 것보다 효과가 클 때가 있다. 신경망이라면 층과 뉴런 수를 키우는 것과 더 오래 학습시키는 것을 먼저 구분해야 한다.

분산 쪽에서는 데이터가 첫 번째 카드지만 비싸다. 그전에 규제를 올리고, 트리 깊이를 줄이고, 검증 에러가 돌아서는 시점에서 학습을 멈추는 것으로 상당 부분이 해결된다.

## 기준점이 없으면 진단도 없다

정확도 75%가 좋은 값인지 나쁜 값인지는 그 자체로 정해지지 않는다. 비교할 기준점이 필요하다.

**인간 수준 성능.** 사람이 같은 입력으로 몇 %를 맞히는가. 의료 영상 판독이라면 전문의의 정확도가 기준이 된다. 모델이 여기에 한참 못 미치면 개선 여지가 크고, 근접하면 남은 에러는 대부분 줄일 수 없는 잡음이다.

**단순 모델.** 아무것도 배우지 않은 모델의 점수다. 불균형 데이터에서 정확도 95%에 만족했는데 항상 다수 클래스만 찍는 모델도 95%라면, 모델은 아무 정보도 얻지 못한 것이다.

```python
from sklearn.dummy import DummyClassifier, DummyRegressor

DummyClassifier(strategy='most_frequent')   # 분류: 최빈 클래스만 예측
DummyRegressor(strategy='mean')             # 회귀: 평균만 예측
```

**기존 시스템.** 이미 배포된 모델이 있으면 그것이 넘어야 할 선이다.

인간 수준 성능이 있으면 편향과 분산을 숫자로 쪼갤 수 있다. 훈련 에러가 인간 수준보다 높은 만큼이 모델이 아직 못 배운 부분이고, 검증 에러가 훈련 에러보다 높은 만큼이 외운 부분이다.

$$\text{회피 가능한 편향} = \text{훈련 에러} - \text{인간 수준 에러}$$

$$\text{분산} = \text{검증 에러} - \text{훈련 에러}$$

| | 사례 A | 사례 B |
|---|---|---|
| 인간 수준 에러 | 1% | 1% |
| 훈련 에러 | 5% | 8% |
| 검증 에러 | 10% | 9% |
| 회피 가능한 편향 | 4% | 7% |
| 분산 | 5% | 1% |
| 다음 수 | 규제·데이터로 분산을 잡는다 | 모델 복잡도를 올린다 |

두 사례의 검증 에러는 10%와 9%로 거의 같지만 해야 할 일은 완전히 다르다. 검증 점수 하나만 보고 있으면 이 차이가 보이지 않는다.

## 오차 분석

학습 곡선이 방향을 알려준다면, 오차 분석은 **구체적으로 어디서 틀리는지**를 파고든다. 모델이 틀린 사례를 직접 눈으로 보는 것 말고 지름길이 없고, 자동화된 지표로는 절대 드러나지 않는 문제가 여기서 나온다.

절차는 네 단계다. 검증 세트에서 오분류 사례를 모으고, 유형별로 분류하고, 비중이 큰 유형부터 손대고, 개선 후 다시 돌린다. 스팸 분류기에서 틀린 100건을 분류하면 이런 표가 나온다.

| 유형 | 개수 | 비율 |
|---|---|---|
| 약물 광고 스팸 | 35 | 35% |
| 피싱 이메일 | 25 | 25% |
| 프로모션 이메일 | 20 | 20% |
| 비영어 스팸 | 15 | 15% |
| 기타 | 5 | 5% |

이 표가 개선의 상한선을 알려준다. 약물 관련 키워드 피처를 완벽하게 만들어도 줄일 수 있는 에러는 35%가 최대다. 반대로 비영어 스팸을 아무리 잘 잡아도 15%를 넘지 못한다. 어느 쪽에 두 주를 쓸지가 이 숫자로 정해진다.

사례를 넘길 때 확인할 것은 대략 이 정도다.

| 발견 | 할 일 |
|---|---|
| 특정 클래스에서만 집중적으로 틀린다 | 그 클래스의 데이터를 보강한다 |
| 라벨 자체가 잘못된 사례가 섞여 있다 | 라벨을 정제한다 |
| 입력이 거의 같은데 정답이 다르다 | 구별할 피처가 없다는 뜻이니 피처를 추가한다 |
| 모델이 본 적 없는 유형이다 | 그 유형의 데이터를 수집한다 |

:::info

**데이터 중심 접근**

전통적인 워크플로는 데이터를 고정해두고 모델을 바꾼다. Andrew Ng이 제안한 데이터 중심(Data-Centric) 접근은 반대로 모델을 고정하고 데이터 품질을 체계적으로 손본다. 라벨 정제, 유형별 보강, 애매한 사례의 정의를 다시 잡는 일이 여기 들어간다. 성능이 검증된 모델 구조가 이미 공개돼 있는 문제일수록 남은 여지는 데이터 쪽에 몰린다는 것이 이 접근의 전제다.

:::

학습 곡선이 "데이터가 더 필요하다"고 말할 때도 오차 분석이 방향을 정해준다. 전체 데이터를 무작위로 10% 늘리는 것보다, 비영어 스팸처럼 모델이 집중적으로 틀리는 유형만 골라 모으는 쪽이 훨씬 싸게 먹힌다.

데이터를 새로 모으기 어려우면 증강을 쓴다. 이미지는 회전·반전·크롭·색상 변환, 텍스트는 동의어 대체와 역번역이 표준이다. 이 변형들이 통하는 건 라벨이 보존된다는 것을 미리 알고 쓰기 때문이다. 좌우로 뒤집힌 고양이는 여전히 고양이고, 동의어로 바꾼 문장의 감성은 그대로다. 정형 데이터에는 그렇게 기댈 불변성이 없다. 나이를 셋 올리고 소득을 5% 흔든 행이 현실에 존재할 수 있는 조합인지 보장할 방법이 없어서, SMOTE 같은 오버샘플링은 소수 클래스의 결정 경계를 메우는 좁은 용도로 쓴다.

## 파이프라인부터 세운다

진단은 측정할 수 있을 때만 가능하다. 그래서 실전 순서는 항상 이렇게 간다.

1. **빠르게 시작한다.** 로지스틱 회귀나 결정 트리, 기본 피처만으로 10분 안에 첫 점수를 낸다.
2. **평가 체계를 먼저 고정한다.** 교차 검증 분할, 문제에 맞는 지표, 단순 모델 베이스라인을 정해 기록한다.
3. **진단한다.** 학습 곡선으로 편향과 분산을 가르고, 오차 분석으로 실패 유형을 본다.
4. **한 번에 하나만 바꾼다.** 변경마다 점수를 기록한다. 세 개를 동시에 바꾸면 무엇이 효과였는지 알 수 없다.
5. **3~4를 반복한다.**

가장 흔한 실수가 1번을 건너뛰고 처음부터 딥러닝을 꺼내는 것이다. 정형 데이터에서는 XGBoost가 신경망보다 나은 경우가 많은데, 시작부터 신경망을 붙들면 학습이 발산하는 원인을 찾느라 정작 데이터 문제를 못 본다. 첫 모델의 목표는 좋은 점수가 아니라 **끝까지 돌아가는 파이프라인**이다.

첫 모델을 고를 때 기준은 이 정도면 충분하다.

| 데이터 | 첫 선택 |
|---|---|
| 정형, 1천 건 미만 | 로지스틱 회귀, SVM, KNN |
| 정형, 1천~10만 건 | XGBoost / LightGBM |
| 정형, 10만 건 초과 | LightGBM, 딥러닝도 시도할 만하다 |
| 이미지 | CNN, 데이터가 적으면 사전학습 모델 + 파인튜닝 |
| 텍스트 | 트랜스포머 계열, 데이터가 적으면 사전학습 모델 + 파인튜닝 |
| 시계열 | ARIMA, Prophet, LSTM |

정형 데이터에서 트리 기반 부스팅을 먼저 꺼내는 이유는 피처 스케일에 둔감하고, 결측값 처리가 내장되어 있고, 학습이 빠르다는 세 가지다. 딥러닝이 확실히 앞서는 곳은 이미지·텍스트·음성처럼 원시 입력에서 표현을 직접 배워야 하는 문제다.

## 점수가 아니라 버그인 경우

성능이 안 나오는 원인이 모델이 아니라 파이프라인 버그인 경우가 놀랄 만큼 흔하다. 반대로 점수가 지나치게 잘 나올 때도 의심해야 한다.

**데이터 누수.** 전처리를 분할 전에 하면 테스트 데이터의 통계가 훈련에 스며든다.

```python
# 잘못된 순서: 전체 데이터의 평균과 분산이 스케일러에 들어간다
scaler.fit(X)
X_train, X_test = train_test_split(scaler.transform(X))

# 올바른 순서: 훈련 데이터로만 fit
X_train, X_test = train_test_split(X)
scaler.fit(X_train)
X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)
```

`Pipeline`에 전처리와 모델을 함께 넣으면 교차 검증이 폴드마다 알아서 훈련 부분으로만 `fit`하므로 이 실수가 구조적으로 막힌다.

**타겟 누수.** 피처 안에 정답에서 파생된 정보가 들어간 경우다. "환자가 퇴원했는가"를 예측하는데 피처에 퇴원일이 있으면 검증 정확도가 99%로 나오지만 배포하면 아무 값도 못 낸다. 예측 시점에 그 값을 실제로 알 수 있는지를 피처마다 따져야 한다.

**시계열의 무작위 분할.** 순서를 섞으면 미래가 훈련에 들어간다. 시간 기준으로 잘라야 한다.

```python
X_train = X[X['date'] < '2024-01-01']
X_test = X[X['date'] >= '2024-01-01']
```

**지표 선택.** 불균형 데이터에 정확도를 쓰거나, 비즈니스가 원하는 것과 다른 값을 최적화하는 경우다. 재현율이 중요한 문제에서 F1을 올리고 있으면 모델이 좋아져도 아무도 만족하지 않는다.

위 넷을 확인하고도 점수가 이상하면 다음을 훑는다.

- 훈련 데이터가 한 클래스에 몰려 있지 않은가
- `random_state`를 고정했는가
- 거리 기반 모델에 스케일링을 했는가
- 결측값이 조용히 0으로 채워지지 않았는가

## 마치며

"다음에 뭘 해야 하는가"는 취향의 문제가 아니라 측정의 문제다. 학습 곡선은 두 곡선의 높이와 간격으로 편향인지 분산인지를 가르고, 인간 수준 성능이 있으면 그 둘을 퍼센트로 쪼개준다. 오차 분석은 그다음 질문인 "어느 유형부터 손댈 것인가"에 상한선이 붙은 답을 준다. 이 둘을 거치고 나면 맨 앞에 늘어놓은 다섯 후보 대부분이 지워진다.

편향과 분산의 처방은 서로 반대다. 규제를 올릴지 내릴지, 모델을 키울지 줄일지, 데이터를 더 모을지 말지가 전부 진단에 달려 있다. 진단을 건너뛴 튜닝은 방향이 어긋난 순간 그대로 뒷걸음질이 된다.

그리고 개선을 시작하기 전에 파이프라인이 정직한지부터 본다. 검증 점수가 유난히 좋으면 누수를 의심하는 것이 맞다. 실전에서 가장 비싼 실패는 성능이 낮은 모델이 아니라, 배포하기 전까지 성능이 높아 보였던 모델이다.

다음 글부터는 지금까지 반복해서 나온 그 단어, 피처를 본격적으로 다룬다. 범주형 변수를 숫자로 바꾸는 인코딩이 첫 주제다.

## 함께 보면 좋은 글

- [편향-분산 트레이드오프](/ml/bias-variance/) : 학습 곡선이 진단하는 두 오차 성분의 정체
- [교차 검증](/ml/cross-validation/) : 진단에 쓰는 검증 점수를 얻는 방법
- [분류 메트릭](/ml/classification-metrics/) : 불균형 데이터에서 정확도가 왜 기준점만도 못한지
- [규제](/ml/regularization/) : 분산을 줄이는 처방이 실제로 무슨 일을 하는지

## 참고자료

- [Andrew Ng, "Machine Learning Yearning"](https://info.deeplearning.ai/machine-learning-yearning-book)
- [Scikit-learn, Validation curves: plotting scores to evaluate models](https://scikit-learn.org/stable/modules/learning_curve.html)
- [Scikit-learn, Common pitfalls and recommended practices](https://scikit-learn.org/stable/common_pitfalls.html)
- [DeepLearning.AI, Data-Centric AI Competition](https://https-deeplearning-ai.github.io/data-centric-comp/)
