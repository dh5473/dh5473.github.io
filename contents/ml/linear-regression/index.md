---
date: '2026-01-03'
title: '데이터에 가장 잘 맞는 직선을 찾는 선형 회귀'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 3
tags: ['Linear Regression', '선형 회귀', '머신러닝 기초', '지도학습', 'scikit-learn', 'Normal Equation', '정규 방정식']
summary: '기울기와 절편이라는 두 숫자를 잔차 제곱합이라는 기준으로 정하는 선형 회귀의 원리. 정규 방정식이 그 해를 한 번에 계산하는 이유와, 이 방법이 무엇에 취약한지 정리한다.'
thumbnail: './thumbnail.png'
---

집값을 예측해야 한다고 해보자. 수백 건의 거래 기록이 있고 각 집의 면적과 거래가가 담겨 있다. 정답이 붙은 데이터로 모델을 학습시켜 새로운 입력에 대한 연속적인 출력값을 맞히는 문제, 곧 회귀(Regression)다.

이 문제에 대한 가장 단순한 답이 **선형 회귀(Linear Regression)** 다. 단순하다고 얕볼 게 아니다. 가설 함수, 파라미터 학습, 오차 측정, 최적화라는 ML의 핵심 개념이 전부 이 안에 들어 있고, 복잡한 신경망도 결국 이 뼈대 위에서 돌아간다.

## 직선 하나로 예측한다는 것

선형 회귀의 아이디어는 데이터를 가장 잘 관통하는 직선을 하나 긋는 것이다. 면적 $x$와 집값 $y$의 관계를 이렇게 쓴다.

$$\hat{y} = wx + b$$

$w$는 기울기(weight)로 $x$가 1 늘 때 $y$가 얼마나 변하는지를 나타내고, $b$는 절편(bias)으로 $x$가 0일 때의 $y$값이다. ML에서는 이 식을 **가설 함수(Hypothesis Function)** 라고 부른다. "데이터를 이 형태의 식으로 설명할 수 있다"는 가설이라는 뜻이다.

그렇다면 **학습(Learning)** 은 $w$와 $b$를 데이터에 맞게 조정하는 과정이다. 아무 직선이나 그어놓고 데이터를 보며 점점 더 잘 맞는 직선으로 고쳐 나간다. 모델이 "학습한다"는 말의 실제 내용이 이것이다.

scikit-learn으로는 두 줄이면 끝난다.

```python
import numpy as np
from sklearn.linear_model import LinearRegression

area = np.array([60, 75, 85, 95, 110, 120, 140, 155]).reshape(-1, 1)  # m²
price = np.array([2.1, 2.8, 3.2, 3.6, 4.1, 4.5, 5.2, 5.8])            # 억

model = LinearRegression().fit(area, price)
print(f"{model.coef_[0]:.5f}, {model.intercept_:.5f}")  # 0.03804, -0.08176
```

기울기가 0.038이므로 면적이 1m² 늘 때마다 집값이 약 380만 원 오른다고 모델이 읽어낸 것이다. `model.predict([[100]])`이 하는 일도 $0.03804 \times 100 - 0.08176 \approx 3.72$를 계산하는 것뿐이다.

## 무엇이 좋은 직선인가

"가장 잘 맞는" 직선이라는 말에는 아직 기준이 없다. 기준은 **잔차(Residual)** 다. 잔차는 실제값에서 예측값을 뺀 값이고, 데이터 포인트마다 하나씩 생긴다.

$$e^{(i)} = y^{(i)} - \hat{y}^{(i)}$$

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 322" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="산점도 위에 회귀 직선을 긋고, 각 데이터 점에서 직선까지 수직으로 내린 점선으로 잔차를 표시한 그림. 점이 직선 위에 있으면 과소 예측, 아래에 있으면 과대 예측이다.">
<style>
.lr1-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.lr1-fit { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.lr1-res { stroke: var(--accent, #9d5604); stroke-width: 2; stroke-dasharray: 4 3; fill: none; }
.lr1-dot { fill: var(--text, #1c1917); }
.lr1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.lr1-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
</style>
<defs>
<marker id="lr1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="lr1-t" x="200" y="24" text-anchor="middle">잔차 = 실제값 - 예측값</text>
<path class="lr1-ax" d="M 50 250 L 380 250" marker-end="url(#lr1Arrow)"/>
<path class="lr1-ax" d="M 50 250 L 50 48" marker-end="url(#lr1Arrow)"/>
<text class="lr1-l" x="40" y="58" text-anchor="end">y</text>
<text class="lr1-l" x="374" y="270" text-anchor="middle">x</text>
<path class="lr1-fit" d="M 68 251 L 366 77"/>
<path class="lr1-res" d="M 95 216 L 95 235"/><path class="lr1-res" d="M 145 224 L 145 206"/><path class="lr1-res" d="M 195 159 L 195 177"/><path class="lr1-res" d="M 245 162 L 245 148"/><path class="lr1-res" d="M 295 103 L 295 118"/><path class="lr1-res" d="M 345 99 L 345 89"/>
<circle class="lr1-dot" cx="95" cy="216" r="5"/><circle class="lr1-dot" cx="145" cy="224" r="5"/><circle class="lr1-dot" cx="195" cy="159" r="5"/><circle class="lr1-dot" cx="245" cy="162" r="5"/><circle class="lr1-dot" cx="295" cy="103" r="5"/><circle class="lr1-dot" cx="345" cy="99" r="5"/>
<path class="lr1-fit" d="M 60 283 L 92 283"/>
<text class="lr1-l" x="100" y="288">회귀 직선 (모델의 예측)</text>
<path class="lr1-res" d="M 60 305 L 92 305"/>
<text class="lr1-l" x="100" y="310">잔차 (실제값 - 예측값)</text>
</svg>
</div>

잔차가 크다는 건 그 지점을 잘 못 맞추고 있다는 뜻이다. 그러면 잔차를 전부 더한 값을 줄이면 될까? 그렇지 않다. 직선 위에 있는 점의 잔차는 양수(과소 예측), 아래에 있는 점의 잔차는 음수(과대 예측)라서 서로 상쇄된다. 모든 점을 크게 빗나간 직선도 합이 0이 나올 수 있다.

그래서 잔차를 제곱해서 더한 **잔차 제곱합(RSS)** 을 최소화 대상으로 삼는다. 제곱하면 부호가 사라지고, 크게 빗나간 점일수록 더 무거운 벌점을 받는다. 이 값을 데이터 개수로 나눈 것이 회귀의 표준 비용 함수인 평균 제곱 오차(MSE)다.

## 잔차 제곱합을 최소로 만드는 해

잔차 제곱합을 최소화하는 $w$와 $b$는 반복 없이 한 번에 계산할 수 있다. 잔차 제곱합을 파라미터로 미분해 0으로 놓고 푼 결과가 **정규 방정식(Normal Equation)** 이다.

$$\mathbf{w} = \left(X^{\top} X\right)^{-1} X^{\top} \mathbf{y}$$

$X^{\top}X$는 특성끼리의 관계를 담고 $X^{\top}\mathbf{y}$는 특성과 정답 사이의 관계를 담는다. 역행렬이 둘을 이어 붙여 최적의 계수를 만든다. numpy로 직접 짜보면 sklearn이 돌려준 것과 같은 숫자가 나온다.

```python
X = np.hstack([np.ones((len(area), 1)), area])  # 절편 항을 위한 1 열을 앞에 붙인다
w = np.linalg.inv(X.T @ X) @ X.T @ price
print(np.round(w, 5))  # [-0.08176  0.03804]
```

sklearn이 내놓는 것도 같은 해다. 다만 역행렬을 직접 구하지는 않고 특이값 분해 기반의 최소제곱 풀이(`scipy.linalg.lstsq`)를 쓴다. $X^{\top}X$가 거의 특이한 경우에도 버티기 위해서다.

:::warning

**특성이 많아지면 정규 방정식은 쓰기 어렵다**

역행렬 계산량이 특성 수 $p$에 대해 대략 $O(p^3)$이다. 특성이 수만 개면 단 한 번의 계산조차 감당하기 어렵고, $X^{\top}X$가 역행렬을 갖지 않는 경우도 생긴다. 이 지점부터는 기울기를 따라 조금씩 내려가는 반복 알고리즘이 사실상 유일한 선택지가 된다.

:::

## 선형 회귀가 전제하는 것

선형 회귀는 데이터가 네 가지 조건을 만족할 때 제대로 동작한다. 이걸 모르고 쓰다가 결과를 잘못 읽는 경우가 많다.

| 가정 | 의미 | 위반 시 증상 |
|---|---|---|
| 선형성 | $x$와 $y$ 사이에 직선 관계가 있다 | 잔차 플롯에 곡선 패턴 |
| 독립성 | 데이터 포인트끼리 서로 독립이다 | 시계열에서 자기상관 |
| 등분산성 | 잔차가 흩어진 정도가 $x$ 전 구간에서 일정하다 | 잔차 플롯에 부채꼴 |
| 정규성 | 잔차가 정규 분포를 따른다 | Q-Q 플롯에서 이탈 |

이 중 선형성과 등분산성은 **잔차 플롯(Residual Plot)** 한 장으로 같이 본다. 가로축에 예측값, 세로축에 잔차를 찍은 산점도다. 잔차가 예측값 전 범위에서 0 주변에 고르게 흩어져 있으면 두 가정이 다 통과다. U자 패턴이 보이면 다항 회귀나 로그 변환을 검토하고, 부채꼴이면 가중 최소제곱이나 $y$ 변환을 검토한다. 나머지 둘은 도구가 따로다. 정규성은 Q-Q 플롯으로 보고, 독립성은 데이터가 어떻게 수집됐는지를 봐야 알 수 있다.

실전에서 네 가정을 완벽히 만족하는 데이터는 거의 없다. 중요한 건 위반 여부를 확인하는 습관 쪽이다.

## 이상치 하나가 직선을 끌어당긴다

선형 회귀는 이상치에 유난히 약하다. 잔차를 제곱해서 최소화하기 때문에, 혼자 멀리 떨어진 점의 잔차가 제곱되면서 나머지를 전부 합친 것보다 커지고 직선이 그쪽으로 끌려간다.

앞의 8개 데이터에 면적 155m², 가격 9억짜리 거래 한 건을 더해보자. 기울기가 0.0380에서 0.0528로, 절편이 -0.082에서 -1.354로 움직인다. 점 하나가 직선 전체를 비틀어버린 것이다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 326" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="8개 데이터로 학습한 회귀 직선과, 여기에 면적 155제곱미터 가격 9억인 이상치 한 점을 추가해 다시 학습한 회귀 직선을 겹쳐 그린 그림. 기울기가 0.0380에서 0.0528로 커진다.">
<style>
.lr2-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.lr2-base { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.lr2-shift { stroke: var(--text-danger, #cb2121); stroke-width: 2.5; stroke-dasharray: 6 4; fill: none; }
.lr2-dot { fill: var(--text, #1c1917); }
.lr2-out { fill: var(--text-danger, #cb2121); }
.lr2-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.lr2-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
.lr2-d { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 600; }
</style>
<defs>
<marker id="lr2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="lr2-t" x="200" y="24" text-anchor="middle">이상치 1개가 만드는 기울기 변화</text>
<path class="lr2-ax" d="M 50 250 L 380 250" marker-end="url(#lr2Arrow)"/>
<path class="lr2-ax" d="M 50 250 L 50 48" marker-end="url(#lr2Arrow)"/>
<text class="lr2-l" x="58" y="42">가격</text>
<text class="lr2-l" x="380" y="270" text-anchor="end">면적</text>
<path class="lr2-base" d="M 60 232 L 370 130"/>
<path class="lr2-shift" d="M 60 244 L 370 102"/>
<circle class="lr2-dot" cx="86" cy="225" r="5"/><circle class="lr2-dot" cx="125" cy="210" r="5"/><circle class="lr2-dot" cx="150" cy="201" r="5"/><circle class="lr2-dot" cx="176" cy="192" r="5"/><circle class="lr2-dot" cx="215" cy="181" r="5"/><circle class="lr2-dot" cx="241" cy="172" r="5"/><circle class="lr2-dot" cx="293" cy="156" r="5"/><circle class="lr2-dot" cx="331" cy="143" r="5"/>
<path class="lr2-out" d="M 331 63 L 339 71 L 331 79 L 323 71 Z"/>
<text class="lr2-d" x="331" y="52" text-anchor="middle">이상치</text>
<path class="lr2-base" d="M 60 285 L 92 285"/>
<text class="lr2-l" x="100" y="290">원래 직선 (기울기 0.0380)</text>
<path class="lr2-shift" d="M 60 307 L 92 307"/>
<text class="lr2-l" x="100" y="312">이상치 포함 (기울기 0.0528)</text>
</svg>
</div>

그래서 학습 전에 데이터를 그려보는 단계를 건너뛸 수 없다. 이상치가 측정 오류나 입력 실수라면 걷어내고, 실제로 존재하는 값이라면 큰 잔차에 덜 반응하는 비용 함수나 이상치에 강한 모델로 바꾼다.

## 마치며

선형 회귀가 하는 일은 결국 두 개의 숫자를 정하는 것이다. 그 둘을 정하는 기준이 잔차 제곱합이고, 기준을 최소로 만드는 값은 정규 방정식으로 한 번에 구해진다.

단순함이 곧 강점이다. $w$ 값 하나만 봐도 어떤 특성이 예측에 얼마나 기여하는지 바로 읽히고, 그래서 새 문제를 만나면 먼저 돌려보는 기준선(baseline) 자리를 지금도 지키고 있다. 약점도 같은 자리에서 나온다. 관계가 직선이 아니면 아무리 학습해도 맞지 않고, 이상치 하나에 직선이 통째로 끌려간다. 두 가지 모두 잔차 플롯 한 장이면 확인된다.

## 함께 보면 좋은 글

- [비용 함수](/ml/cost-function/) : 잔차 제곱합을 왜 그 형태로 쓰는지
- [경사하강법](/ml/gradient-descent/) : 정규 방정식 없이 반복으로 같은 해를 찾는 절차
- [다중 선형 회귀](/ml/multiple-linear-regression/) : 특성이 여러 개일 때의 확장

## 참고자료

- [Scikit-learn LinearRegression Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html)
- [Andrew Ng, Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [StatQuest: Linear Regression, Clearly Explained (YouTube)](https://www.youtube.com/watch?v=nk2CQITm_eo)
