---
date: '2026-01-26'
title: 'MAE, RMSE, R² 중 무엇으로 회귀 모델을 고를까'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 26
tags: ['Regression Metrics', '회귀 평가', 'MSE', 'MAE', 'RMSE', 'R-squared', 'MAPE', 'RMSLE', '머신러닝']
summary: '잔차를 절댓값으로 재느냐 제곱으로 재느냐에 따라 더 좋은 모델이 뒤바뀐다. MAE, MSE, RMSE, R², MAPE, RMSLE가 각각 무엇을 재고 어디서 무너지는지 정리한다.'
thumbnail: './thumbnail.png'
---

5억짜리 집을 4.8억이라고 예측한 모델이 있다. 잘한 예측인가? 2천만 원 빗나갔다는 사실만으로는 답할 수 없다. 다른 집은 3억짜리를 3.5억이라고 예측했다면 어느 쪽이 더 심각한 오차인가.

분류에서는 맞았다와 틀렸다로 세면 그만이었지만 회귀에는 그런 경계가 없다. 남는 건 잔차, 즉 실제값과 예측값의 차이뿐이고, 이 잔차 뭉치를 하나의 숫자로 요약하는 방법이 여럿이다. 요약 방법이 다르면 **더 좋다고 판정되는 모델도 달라진다.**

## 절댓값이냐 제곱이냐

잔차를 $r_i = y_i - \hat{y}_i$라 하자. 잔차에는 부호가 있으니 그대로 평균 내면 서로 상쇄돼서 쓸모가 없다. 부호를 없애는 방법이 두 가지다. 절댓값을 씌우거나 제곱하거나.

$$\text{MAE} = \frac{1}{n}\sum_{i=1}^{n} \lvert r_i \rvert, \qquad \text{MSE} = \frac{1}{n}\sum_{i=1}^{n} r_i^{2}, \qquad \text{RMSE} = \sqrt{\text{MSE}}$$

사소해 보이는 선택이지만 결과가 갈린다. 절댓값은 모든 잔차를 크기에 비례해 취급하고, 제곱은 큰 잔차를 불균형하게 키운다. 잔차가 2배가 되면 MAE 기여분은 2배지만 MSE 기여분은 4배다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 365" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="잔차 다섯 개의 기여분 막대 비교. 절댓값으로 재면 이상치 하나가 합계의 57퍼센트지만, 제곱으로 재면 86퍼센트를 차지한다">
<style>
.rg1-t { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.rg1-v { font-size: 14px; fill: var(--text, #1c1917); }
.rg1-m { font-size: 14px; fill: var(--text-muted, #6d6762); }
.rg1-d { font-size: 14px; font-weight: 700; fill: var(--text-danger, #cb2121); }
.rg1-bar { fill: var(--bg-muted, #eeecea); stroke: var(--text-muted, #6d6762); stroke-width: 1; }
.rg1-out { fill: var(--text-danger, #cb2121); }
.rg1-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
</style>
<text class="rg1-m" x="30" y="24">잔차 0.5, 1.0, 0.5, 1.0, 4.0</text>
<!-- 위: 절댓값 -->
<text class="rg1-t" x="30" y="56">MAE 기여분 |r|</text>
<text class="rg1-d" x="375" y="56" text-anchor="end">이상치 몫 57%</text>
<rect class="rg1-bar" x="83.3" y="163.75" width="34" height="11.25"/>
<rect class="rg1-bar" x="140.6" y="152.5" width="34" height="22.5"/>
<rect class="rg1-bar" x="197.9" y="163.75" width="34" height="11.25"/>
<rect class="rg1-bar" x="255.2" y="152.5" width="34" height="22.5"/>
<rect class="rg1-out" x="312.5" y="85" width="34" height="90"/>
<text class="rg1-v" x="100.3" y="157.75" text-anchor="middle">0.5</text>
<text class="rg1-v" x="157.6" y="146.5" text-anchor="middle">1.0</text>
<text class="rg1-v" x="214.9" y="157.75" text-anchor="middle">0.5</text>
<text class="rg1-v" x="272.2" y="146.5" text-anchor="middle">1.0</text>
<text class="rg1-v" x="329.5" y="79" text-anchor="middle">4.0</text>
<line class="rg1-axis" x1="55" y1="175" x2="375" y2="175"/>
<!-- 아래: 제곱 -->
<text class="rg1-t" x="30" y="216">MSE 기여분 r²</text>
<text class="rg1-d" x="375" y="216" text-anchor="end">이상치 몫 86%</text>
<rect class="rg1-bar" x="83.3" y="333.6" width="34" height="1.4"/>
<rect class="rg1-bar" x="140.6" y="329.4" width="34" height="5.6"/>
<rect class="rg1-bar" x="197.9" y="333.6" width="34" height="1.4"/>
<rect class="rg1-bar" x="255.2" y="329.4" width="34" height="5.6"/>
<rect class="rg1-out" x="312.5" y="245" width="34" height="90"/>
<text class="rg1-v" x="100.3" y="327.6" text-anchor="middle">0.25</text>
<text class="rg1-v" x="157.6" y="323.4" text-anchor="middle">1.0</text>
<text class="rg1-v" x="214.9" y="327.6" text-anchor="middle">0.25</text>
<text class="rg1-v" x="272.2" y="323.4" text-anchor="middle">1.0</text>
<text class="rg1-v" x="329.5" y="239" text-anchor="middle">16.0</text>
<line class="rg1-axis" x1="55" y1="335" x2="375" y2="335"/>
<text class="rg1-m" x="200" y="356" text-anchor="middle">두 패널의 세로 축척은 서로 다름</text>
</svg>
</div>

잔차 다섯 개 중 넷은 1 이하이고 하나만 4다. 절댓값으로 재면 그 하나가 합계의 57%를 차지하지만, 제곱으로 재면 86%를 가져간다. MAE는 1.4, MSE는 3.7, RMSE는 1.92가 된다. MSE를 최소화하는 학습은 사실상 저 하나짜리 이상치를 줄이는 일에 대부분의 힘을 쓴다.

| 지표 | 단위 | 이상치 민감도 | 미분 | 읽는 법 |
|---|---|---|---|---|
| MAE | 타겟과 동일 | 낮다 | $r = 0$에서 꺾인다 | 평균적으로 이만큼 빗나갔다 |
| MSE | 타겟의 제곱 | 높다 | 매끄럽다 | 학습 목적함수로 쓴다 |
| RMSE | 타겟과 동일 | 높다 | 매끄럽다 | 큰 오차에 무게를 실은 평균 오차 |

MSE의 단위가 타겟의 제곱이라 해석이 안 되는 문제를 루트가 풀어준다. 집값을 만 원 단위로 예측했다면 RMSE도 만 원 단위다. 보고용으로 RMSE가, 학습용으로 MSE가 쓰이는 이유가 여기 있다. 최소화 지점은 둘이 같으므로 어느 쪽을 최적화해도 결과는 동일하다.

### 두 값의 비율이 잔차 분포를 알려준다

RMSE는 항상 MAE 이상이다. 제곱평균이 산술평균보다 작아질 수 없기 때문이고, 두 값이 같아지는 건 모든 잔차의 크기가 똑같을 때뿐이다. 반대편 끝은 $\sqrt{n}$으로, 잔차 하나가 전부를 짊어질 때 나온다.

$$1 \le \frac{\text{RMSE}}{\text{MAE}} \le \sqrt{n}$$

그래서 이 비율은 공짜로 얻는 진단 도구다. 1에 가까우면 잔차가 고르게 퍼져 있고, 눈에 띄게 크면 소수의 큰 오차가 섞여 있다는 신호다. 위 예시의 비율은 1.37이다. 비율이 튀면 잔차 상위 몇 개를 직접 열어 보는 게 다음 순서다.

### 지표를 바꾸면 우승 모델이 바뀐다

두 모델의 잔차가 이렇다고 하자.

```python
import numpy as np

a = np.array([1, 1, 1, 1, 1])     # 고르게 조금씩 틀림
b = np.array([0, 0, 0, 0, 3])     # 넷은 정확, 하나가 크게 틀림

for name, r in [("A", a), ("B", b)]:
    print(name, "MAE", np.mean(np.abs(r)), "RMSE", round(np.sqrt(np.mean(r**2)), 3))
```

```text
A MAE 1.0 RMSE 1.0
B MAE 0.6 RMSE 1.342
```

MAE는 B가 낫다고 하고 RMSE는 A가 낫다고 한다. 둘 다 맞는 말이다. 대부분의 예측이 정확한 대신 가끔 크게 어긋나도 되는 문제라면 B가 낫고, 한 번의 큰 실수가 치명적인 문제라면 A가 낫다. 지표 선택이 곧 이 질문에 대한 답이다.

## R²는 무엇과 비교한 점수인가

MAE와 RMSE는 절대적인 크기다. RMSE가 23이라는 말만 듣고는 좋은지 나쁜지 알 수 없다. 타겟이 0에서 100 사이면 형편없고 0에서 10000 사이면 훌륭하다. 기준이 필요하다.

R²(결정계수)가 잡는 기준은 **아무 특성도 쓰지 않고 타겟의 평균만 내뱉는 모델**이다.

$$R^2 = 1 - \frac{SS_{res}}{SS_{tot}}, \qquad SS_{res} = \sum (y_i - \hat{y}_i)^2, \quad SS_{tot} = \sum (y_i - \bar{y})^2$$

$SS_{tot}$은 평균만 아는 모델이 내는 오차이고 $SS_{res}$는 내 모델이 남긴 오차다. 남은 오차가 원래 오차의 7%라면 R²는 0.93이고, 이건 "타겟이 흩어진 정도 중 93%를 모델이 설명했다"로 읽는다. 잔차가 0이면 1, 평균만큼만 하면 0이다.

```python
from sklearn.metrics import r2_score

y_true = np.array([3.0, 5.0, 2.5, 7.0, 4.5])
y_pred = np.array([2.8, 5.3, 2.0, 6.5, 5.0])

print(round(r2_score(y_true, y_pred), 4))   # 0.9307
```

손으로 확인하면 $SS_{res} = 0.88$, 평균 4.4에 대한 $SS_{tot} = 12.7$이라 $1 - 0.88/12.7 = 0.9307$이다.

:::warning

**R²는 음수가 될 수 있다**

$SS_{res} > SS_{tot}$이면, 즉 모델이 평균값 하나 찍는 것보다 못하면 R²가 음수로 내려간다. 다만 아무 데서나 나오지는 않는다. 절편을 포함한 최소제곱 모델을 **학습 데이터에서** 평가하면 평균 예측이 항상 후보에 포함돼 있으므로 R²는 0과 1 사이가 보장된다. 음수는 홀드아웃 데이터에서 평가할 때, 또는 절편 없이 적합한 모델에서 나온다.

그래서 테스트 R²가 음수라는 건 계산 실수가 아니라 과적합이나 데이터 분포 이동을 알리는 신호다.

:::

## 특성을 늘리면 R²는 절대 안 떨어진다

R²에는 함정이 하나 더 있다. 최소제곱으로 특성을 추가하면 R²는 **절대 줄어들지 않는다.** 추가된 특성이 완전한 난수라도 그렇다. 계수를 0으로 두면 이전 모델과 똑같아지므로, 최적화 결과가 그보다 나쁠 수는 없기 때문이다. 그래서 학습 데이터의 R²로는 특성 수가 다른 모델을 비교할 수 없다.

Adjusted R²는 특성 수 $p$에 비례하는 벌점을 붙여 이걸 보정한다.

$$R^2_{adj} = 1 - (1 - R^2)\frac{n-1}{n-p-1}$$

$p$가 커질수록 $\frac{n-1}{n-p-1}$이 1보다 훨씬 커져서 남은 오차 $(1 - R^2)$를 부풀린다. 특성이 늘어난 만큼 R²가 충분히 오르지 않으면 Adjusted R²는 오히려 내려간다.

샘플 100개에 진짜 유효한 특성이 3개인 데이터를 만들고, 4번째부터는 타겟과 아무 관계 없는 난수 특성을 붙여 가며 재보자.

```python
from sklearn.linear_model import LinearRegression

rng = np.random.default_rng(0)
X = rng.normal(size=(100, 10))          # 4번째 열부터는 타겟과 무관한 난수
y = X[:, :3] @ [2.0, -1.0, 0.5] + rng.normal(scale=0.5, size=100)

for p in [1, 3, 6, 10]:
    r2 = LinearRegression().fit(X[:, :p], y).score(X[:, :p], y)
    adj = 1 - (1 - r2) * 99 / (100 - p - 1)
```

| 특성 수 | R² | Adjusted R² |
|---|---|---|
| 1 | 0.7063 | 0.7033 |
| 3 | 0.9452 | 0.9435 |
| 6 | 0.9457 | 0.9421 |
| 10 | 0.9465 | 0.9405 |

난수 특성을 붙일 때마다 R²는 소수점 넷째 자리에서 계속 올라간다. Adjusted R²는 유효 특성 3개를 넘어서는 순간부터 내려간다.

## 퍼센트로 재면 0 근처에서 터진다

절대 오차는 스케일이 다른 대상을 비교하지 못한다. 매출 10억짜리 상품의 1천만 원 오차와 매출 1억짜리 상품의 1천만 원 오차는 같은 무게가 아니다. 그래서 오차를 실제값으로 나눠 비율로 만든 것이 MAPE다.

$$\text{MAPE} = \frac{100}{n}\sum_{i=1}^{n} \frac{\lvert y_i - \hat{y}_i \rvert}{\lvert y_i \rvert}$$

"평균 5% 오차"라는 말은 지표를 모르는 사람에게도 그대로 전달된다는 게 최대 장점이다. 문제는 분모다.

실제값이 0이면 나눗셈 자체가 성립하지 않는다. 0이 아니어도 충분히 작으면 결과가 폭발한다. 실제값 0.1을 1.1로 예측했다면 절대 오차는 1.0에 불과한데 오차율은 1000%다. 이런 항 하나가 전체 평균을 통째로 끌고 간다. 기온, 재고 수량, 수요 예측처럼 0을 오가는 값에 MAPE를 쓰면 안 되는 이유다.

:::note

**MAPE를 최적화하면 모델이 낮게 예측하는 쪽으로 기운다**

과소예측의 오차율에는 천장이 있다. 0으로 예측하는 게 최악이므로 100%를 넘을 수 없다. 반면 과대예측에는 천장이 없어서 실제값의 세 배로 예측하면 200%가 된다. 같은 크기의 실수라도 위로 틀리는 쪽이 더 크게 벌점을 받으니, MAPE를 목적함수로 삼으면 예측이 체계적으로 아래로 눌린다.

:::

대안은 두 갈래다. 하나는 분모를 실제값과 예측값의 평균으로 바꾸는 sMAPE다.

$$\text{sMAPE} = \frac{100}{n}\sum_{i=1}^{n} \frac{\lvert y_i - \hat{y}_i \rvert}{(\lvert y_i \rvert + \lvert \hat{y}_i \rvert)/2}$$

각 항이 2를 넘을 수 없어 값이 200%로 묶이고, 실제값 하나가 0이어도 예측값이 0이 아니면 계산된다. 다만 이름과 달리 대칭은 아니다. 실제값 100을 110으로 예측하면 9.52%, 90으로 예측하면 10.53%가 나온다. 둘 다 0이면 여전히 정의되지 않는다.

다른 하나는 나눗셈을 아예 다른 기준으로 바꾸는 MASE다. 오차를 실제값이 아니라 **직전 값을 그대로 답습하는 순진한 예측의 오차**로 나눈다.

$$\text{MASE} = \frac{\text{MAE}}{\frac{1}{n-1}\sum_{t=2}^{n} \lvert y_t - y_{t-1} \rvert}$$

분모는 데이터가 시점마다 얼마나 움직이는지를 재는 값이라 0에 가까워질 일이 거의 없고, 결과가 1보다 작으면 순진한 예측보다 낫다는 뜻이 되어 해석도 명확하다. 대신 시간 순서가 있는 데이터에만 쓸 수 있다. 행의 순서에 의미가 없는 일반 회귀에는 적용되지 않는다.

## 로그로 재면 비율을 잰다

집값, 매출, 인구수처럼 양수이면서 오른쪽으로 길게 늘어진 타겟에서는 RMSLE를 쓴다.

$$\text{RMSLE} = \sqrt{\frac{1}{n}\sum_{i=1}^{n}\big(\log(1+y_i) - \log(1+\hat{y}_i)\big)^2}$$

로그의 차는 곧 비의 로그이므로 $\log\frac{1+y_i}{1+\hat{y}_i}$와 같고, 결국 RMSLE는 두 값의 **비율**이 얼마나 어긋났는지를 잰다. 5천만 원짜리와 10억 원짜리를 나란히 10%씩 틀렸다면 로그 오차는 둘 다 $\log 1.1 = 0.0953$으로 같고 RMSLE도 0.0953이다. 같은 두 집을 RMSE로 재면 오차가 각각 500만 원과 1억 원이라 RMSE가 7,080만 원이 되고, 이 값의 거의 전부는 비싼 집 하나에서 나온다.

:::info

**RMSLE는 과소예측을 더 세게 벌한다**

100을 150으로 예측했을 때의 제곱 로그 오차는 0.162, 50으로 예측했을 때는 0.467이다. 빗나간 크기는 50으로 같은데 아래로 틀린 쪽이 2.9배 무겁다. 로그가 0 근처에서 가파르게 떨어지기 때문이다. 재고 부족이 재고 과잉보다 비싼 문제처럼 과소예측이 더 위험한 상황에 잘 맞는다.

:::

로그를 취하는 만큼 입력이 음수면 계산되지 않는다. 회귀 모델이 음수를 뱉을 수 있다면 0으로 잘라내는 후처리가 필요하고, 그 잘라내기가 평가를 왜곡하지 않는지는 따로 확인해야 한다.

## 지표 고르기

| 상황 | 지표 |
|---|---|
| 이상치를 노이즈로 보고 흘리고 싶다 | MAE |
| 큰 오차 한 번이 치명적이다 | RMSE |
| 경사하강법으로 직접 최적화한다 | MSE |
| 스케일이 다른 문제끼리 비교한다 | R² |
| 특성 수가 다른 모델을 비교한다 | Adjusted R² |
| 지표를 모르는 사람에게 보고한다 | MAPE |
| 타겟이 0을 오간다 | MAE, RMSE |
| 타겟 분포가 오른쪽으로 늘어져 있다 | RMSLE |
| 시계열이고 순진한 예측과 견주고 싶다 | MASE |

한 줄만 골라 쓰는 표는 아니다. RMSE와 MAE를 나란히 보면 잔차 분포의 모양까지 읽히고, 여기에 R²를 붙이면 이 오차가 문제의 난이도 대비 큰지 작은지가 잡힌다.

## 마치며

회귀 지표는 정확도의 등급표가 아니라 **어떤 실수를 얼마나 미워할지에 대한 선언**이다. 잔차에 절댓값을 씌운 순간 큰 오차와 작은 오차를 같은 눈으로 보겠다고 정한 것이고, 제곱을 씌운 순간 큰 오차 하나가 작은 오차 여럿보다 나쁘다고 정한 것이다. 나누는 기준을 실제값으로 잡으면 비율이 중요하다고 말한 것이고, 평균값으로 잡으면 문제의 난이도를 감안하겠다고 말한 것이다.

그러니 순서는 지표를 고르고 모델을 학습하는 게 아니라, 이 문제에서 무엇이 비싼 실수인지 정하고 그 정의에 맞는 지표를 고르는 쪽이다. 만능 지표가 없다는 말은 겸양이 아니라 지표마다 미워하는 대상이 다르다는 사실의 다른 표현이다.

다음 글에서는 이 지표들을 어디서 재야 하는지를 다룬다. 학습에 쓴 데이터로 잰 점수는 언제나 후하게 나오고, 데이터를 한 번 나누는 것만으로는 어떻게 나뉘었느냐에 따라 점수가 출렁인다. 교차 검증이 그 답이다.

## 함께 보면 좋은 글

- [비용 함수](/ml/cost-function/) : 같은 오차 정의를 학습 목적함수로 쓸 때 무엇이 달라지는지
- [편향-분산 트레이드오프](/ml/bias-variance/) : MSE가 편향과 분산으로 갈라지는 분해
- [다중 선형 회귀](/ml/multiple-linear-regression/) : 특성을 늘릴 때 모델에서 실제로 벌어지는 일

## 참고자료

- [Scikit-learn, Regression metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics)
- [Rob J Hyndman, 백분율 오차 지표의 문제](https://robjhyndman.com/hyndsight/smape/)
- [Forecasting: Principles and Practice, 예측 정확도 평가](https://otexts.com/fpp3/accuracy.html)
