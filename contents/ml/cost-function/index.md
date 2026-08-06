---
date: '2026-01-04'
title: '모델이 얼마나 틀렸는지 재는 비용 함수'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 4
tags: ['Cost Function', '비용 함수', 'MSE', 'MAE', 'Loss Function', '머신러닝 기초']
summary: '여러 개의 잔차를 숫자 하나로 요약하는 비용 함수. 절댓값 대신 제곱을 쓰는 세 가지 이유와, 비용 함수가 그리는 볼록한 지형이 최적화로 이어지는 과정을 정리한다.'
thumbnail: './thumbnail.png'
---

선형 회귀의 목표는 잔차를 최소화하는 직선을 찾는 것이다. 그런데 데이터가 100개면 잔차도 100개다. 숫자 100개를 동시에 "최소화"한다는 게 정확히 무슨 뜻인가?

여기서 **비용 함수(Cost Function)** 가 나온다. 여러 개의 잔차를 숫자 하나로 요약하는 함수다. 이 숫자가 작을수록 모델이 데이터를 잘 맞추고 있다는 뜻이고, 학습이란 이 숫자를 최대한 줄이는 일이다.

요약하는 방식은 하나가 아니다. 어느 쪽을 고르느냐에 따라 모델이 어떤 종류의 오차를 더 싫어하는지가 달라진다.

## 여러 개의 잔차를 숫자 하나로

잔차는 실제값에서 예측값을 뺀 값이다. 잔차 네 개가 $+3, -2, +1, -2$로 나왔다고 하자.

**그냥 더하면** 합이 0이다. 네 예측이 전부 틀렸는데 오차가 없는 것처럼 보인다. 양수 잔차(과소 예측)와 음수 잔차(과대 예측)가 서로 상쇄되기 때문이다. 부호를 먼저 없애지 않으면 어떤 요약도 성립하지 않는다.

**절댓값을 씌워 평균 내면** $(3+2+1+2)/4 = 2.0$이 된다. 이게 **평균 절대 오차(Mean Absolute Error, MAE)** 다. 직관적이고 단위도 원래 값과 같다. 다만 절댓값 함수는 0에서 꺾여 미분이 깔끔하지 않다.

**제곱해서 평균 내면** $(9+4+1+4)/4 = 4.5$가 된다. 부호가 사라지는 건 절댓값과 같지만, 큰 오차가 더 크게 반영된다는 점이 다르다. 이게 **평균 제곱 오차(Mean Squared Error, MSE)** 이고 회귀 문제의 기본 비용 함수다.

## MSE의 정의

$$J(w, b) = \frac{1}{n}\sum_{i=1}^{n}\left(y^{(i)} - \hat{y}^{(i)}\right)^2, \qquad \hat{y}^{(i)} = wx^{(i)} + b$$

$n$은 데이터 개수, $y^{(i)}$는 $i$번째 실제값, $\hat{y}^{(i)}$는 $i$번째 예측값이다. $J$가 비용(Cost)이고, 이 값을 최소로 만드는 $w, b$를 찾는 게 학습의 목표다. 합계가 아니라 평균을 쓰는 이유는 데이터 개수가 다른 모델끼리도 값을 견줄 수 있게 하기 위해서다. 참고로 개별 포인트의 오차 $\left(\hat{y}^{(i)} - y^{(i)}\right)^2$만 가리킬 때는 손실 함수(Loss Function)라 부르지만, 실무에서 두 용어는 거의 구분 없이 쓰인다.

면적과 가격 데이터 8건으로 직접 계산해보자.

```python
import numpy as np
from sklearn.linear_model import LinearRegression

area = np.array([60, 75, 85, 95, 110, 120, 140, 155]).reshape(-1, 1)
price = np.array([2.1, 2.8, 3.2, 3.6, 4.1, 4.5, 5.2, 5.8])

model = LinearRegression().fit(area, price)
y_pred = model.predict(area)
print(f"{np.mean((price - y_pred) ** 2):.6f}")  # 0.002542 (= mean_squared_error 결과)
```

0.0025는 제곱된 값이라 그대로는 감이 오지 않는다. 제곱근을 씌우면 $\sqrt{0.0025} \approx 0.05$, 예측이 평균적으로 500만 원쯤 빗나간다는 뜻이 된다. 이 $\sqrt{J}$가 RMSE이고, 단위가 $y$와 같아서 사람이 읽기 좋다.

:::info

**분모에 2를 넣는 관습**

교과서에 따라 $J = \frac{1}{2n}\sum\left(\hat{y} - y\right)^2$로 쓰기도 한다. 미분할 때 제곱의 지수 2가 앞으로 나오면서 $\frac{1}{2}$과 상쇄되어 식이 깔끔해지기 때문이다. 함수 전체에 상수를 곱해도 최솟값의 **위치**는 바뀌지 않으므로 어느 쪽을 써도 학습 결과는 같다.

:::

## 왜 절댓값이 아니라 제곱인가

### 큰 오차에 더 큰 벌점

제곱은 큰 잔차를 불균형하게 키운다.

| 잔차 | 절댓값 (MAE 기여분) | 제곱 (MSE 기여분) |
|---|---|---|
| 0.5 | 0.5 | 0.25 |
| 1.0 | 1.0 | 1.00 |
| 2.0 | 2.0 | 4.00 |
| 5.0 | 5.0 | 25.00 |

잔차가 5일 때 MAE는 "5만큼 나쁘다"고 보지만 MSE는 "25만큼 나쁘다"고 본다. 조금씩 빗나간 예측 여럿보다 크게 빗나간 예측 하나가 보통 더 곤란하니, 대부분의 회귀 문제에서 이 쪽이 바람직하다.

### 어디서나 미분된다

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 270" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="절댓값 함수와 제곱 함수를 같은 축에 겹쳐 그린 그림. 절댓값 함수는 x가 0인 지점에서 V자로 꺾이고, 제곱 함수는 그 지점에서도 매끄럽다.">
<style>
.cf1-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.cf1-sq { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.cf1-abs { stroke: var(--accent, #9d5604); stroke-width: 2.5; fill: none; }
.cf1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.cf1-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
.cf1-p { fill: var(--primary, #0a756c); font-size: 15px; font-weight: 600; }
.cf1-a { fill: var(--accent, #9d5604); font-size: 15px; font-weight: 600; }
</style>
<defs>
<marker id="cf1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="cf1-t" x="200" y="24" text-anchor="middle">절댓값 함수와 제곱 함수</text>
<path class="cf1-ax" d="M 40 230 L 385 230" marker-end="url(#cf1Arrow)"/>
<path class="cf1-ax" d="M 200 248 L 200 45" marker-end="url(#cf1Arrow)"/>
<text class="cf1-l" x="378" y="250" text-anchor="end">x</text>
<path class="cf1-sq" d="M 50 58 Q 200 402 350 58"/>
<text class="cf1-p" x="356" y="54">x²</text>
<path class="cf1-abs" d="M 50 144 L 200 230 L 350 144"/>
<text class="cf1-a" x="356" y="140">|x|</text>
<circle cx="200" cy="230" r="4.5" fill="var(--accent, #9d5604)"/>
<text class="cf1-a" x="212" y="254">x = 0에서 꺾임</text>
</svg>
</div>

절댓값 함수는 $x = 0$에서 꺾이고, 그 점에서 미분값이 정의되지 않는다. 왼쪽에서 다가가면 기울기가 $-1$, 오른쪽에서 다가가면 $+1$이라 하나로 정해지지 않는다. 반면 $x^2$은 모든 구간에서 매끄럽고 $x = 0$에서 기울기가 정확히 0이다.

이게 중요한 이유는 최적화 알고리즘이 비용 함수의 미분값을 따라 파라미터를 옮기기 때문이다. 기울기가 정의되지 않는 지점이 있으면 그 근처에서 갱신이 불안정해진다. MAE도 subgradient 같은 기법으로 쓸 수 있으니 불가능한 건 아니지만, MSE 쪽이 다루기 쉬운 건 분명하다.

### 최솟값이 하나뿐이다

선형 회귀의 MSE는 파라미터 $w, b$에 대해 **볼록 함수(Convex Function)** 다. 볼록 함수에서는 국소 최솟값이 곧 전역 최솟값이라, 어느 지점에서 출발해 내려가든 같은 바닥에 도착한다. 최적화 알고리즘이 "여기가 진짜 바닥인가"를 의심할 필요가 없다는 뜻이다.

## 비용 함수의 모양

비용 함수를 이해하는 가장 빠른 방법은 직접 그려보는 것이다. 절편 $b$를 최적값에 고정하고 기울기 $w$만 바꿔가며 $J(w)$를 계산한다.

```python
w_values = np.linspace(-0.01, 0.08, 200)
b = -0.08176
costs = [np.mean((price - (w * area.ravel() + b)) ** 2) for w in w_values]
```

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="기울기 w를 가로축, 비용 J를 세로축에 둔 포물선 그래프. 양쪽 끝에서 비용이 높고 최적 w에서 하나뿐인 바닥을 이루며, 바닥에서 접선의 기울기가 0이다.">
<style>
.cf2-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.cf2-curve { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.cf2-aux { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; stroke-dasharray: 4 3; fill: none; }
.cf2-lead { stroke: var(--text-muted, #6d6762); stroke-width: 1; fill: none; }
.cf2-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.cf2-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
.cf2-d { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 600; }
</style>
<defs>
<marker id="cf2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="cf2-t" x="200" y="22" text-anchor="middle">기울기 w에 따른 비용 J(w)</text>
<path class="cf2-ax" d="M 45 265 L 385 265" marker-end="url(#cf2Arrow)"/>
<path class="cf2-ax" d="M 45 265 L 45 45" marker-end="url(#cf2Arrow)"/>
<text class="cf2-l" x="52" y="40">비용 J</text>
<text class="cf2-l" x="382" y="286" text-anchor="end">파라미터 w</text>
<path class="cf2-curve" d="M 55 55 Q 215 420 375 101"/>
<path class="cf2-aux" d="M 196 250 L 258 250"/>
<path class="cf2-lead" d="M 296 244 L 262 249"/>
<text class="cf2-l" x="300" y="248">기울기 0</text>
<circle cx="226" cy="250" r="5" fill="var(--text-danger, #cb2121)"/>
<path class="cf2-aux" d="M 226 250 L 226 265"/>
<text class="cf2-d" x="226" y="286" text-anchor="middle">최적 w</text>
</svg>
</div>

깨끗한 포물선이다. $w$가 너무 작으면 직선이 눕는 바람에 넓은 집의 가격을 크게 과소 예측하고, 너무 크면 직선이 가팔라져 좁은 집을 과대 예측한다. 양쪽 모두 비용이 커지고 그 사이 한 점에서만 최소가 된다.

여기서 눈여겨볼 건 바닥에서 곡선의 기울기가 0이라는 사실이다. "비용을 줄인다"는 막연한 목표가 "기울기가 0인 지점을 찾는다"는 계산 가능한 문제로 바뀌는 지점이 여기다.

$w$와 $b$가 함께 변하면 $J(w, b)$는 밥그릇 모양의 3차원 곡면이 되고, 그릇의 바닥이 최적의 $(w^{*}, b^{*})$다.

:::warning

**볼록한 건 모델이 선형이라서다**

비용 함수가 매끈한 그릇 모양인 건 예측식이 파라미터에 대해 선형이기 때문이다. 신경망처럼 비선형 모델에서는 비용 지형이 울퉁불퉁해져 국소 최솟값이 여럿 생기고, 어디서 출발하느냐에 따라 도착하는 바닥이 달라진다.

:::

## MSE 말고 다른 선택지

| 비용 함수 | 정의 | 이상치 민감도 | 미분 | 주 용도 |
|---|---|---|---|---|
| MSE | 잔차 제곱의 평균 | 높음 | 매끄러움 | 회귀의 기본값 |
| MAE | 잔차 절댓값의 평균 | 낮음 | $x = 0$에서 꺾임 | 이상치가 많은 데이터 |
| RMSE | $\sqrt{\text{MSE}}$ | 높음 | 매끄러움 | 사람이 읽는 평가 지표 |
| Huber | 작은 잔차는 제곱, 큰 잔차는 절댓값 | 중간 | 매끄러움 | 이상치 대응 회귀 |

같은 예측에 세 지표를 재보면 MSE 0.0025, MAE 0.0405, RMSE 0.0504가 나온다. RMSE가 MAE보다 큰 이유는 MSE가 큰 잔차에 가중 벌점을 주기 때문이다. 잔차가 전부 같은 크기면 두 값이 일치하고, 잔차의 편차가 클수록 격차가 벌어진다. 그래서 **RMSE와 MAE의 격차 자체**가 유독 크게 빗나간 예측이 섞여 있는지를 알려주는 신호가 된다.

고민된다면 MSE로 시작하면 된다. 이상치가 많은 데이터라면 MAE나 Huber로 바꿔 성능을 비교해본다.

## 마치며

비용 함수는 모델의 성적표다. 잔차라는 낱개 점수들을 하나의 총점으로 묶고, 학습은 그 총점을 낮추는 과정이 된다.

MSE가 기본값 자리를 차지한 이유는 세 가지가 겹쳤기 때문이다. 큰 오차에 더 무거운 벌점을 매기고, 어디서나 미분되며, 선형 모델에서는 최솟값이 하나뿐이다. 뒤의 두 가지는 전부 다음 단계를 위한 성질이다. 미분이 되니 기울기를 따라갈 수 있고, 볼록하니 어디서 출발해도 도착지가 같다. 비용 함수를 정한다는 건 무엇을 줄일지 고르는 동시에, 그걸 어떻게 줄일 수 있는지까지 결정하는 일이다.

## 함께 보면 좋은 글

- [선형 회귀](/ml/linear-regression/) : 비용 함수가 최소로 만들려는 그 직선
- [경사하강법](/ml/gradient-descent/) : 비용 곡선의 바닥까지 내려가는 절차
- [회귀 평가 지표](/ml/regression-metrics/) : RMSE, MAE, R²를 성능 보고에 쓰는 법

## 참고자료

- [Scikit-learn Regression Metrics Documentation](https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics)
- [Andrew Ng, Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Wikipedia: Mean Squared Error](https://en.wikipedia.org/wiki/Mean_squared_error)
