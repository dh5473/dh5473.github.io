---
date: '2026-01-05'
title: '비용 함수의 바닥까지 걸어 내려가는 경사하강법'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 5
tags: ['Gradient Descent', '경사하강법', 'Optimization', 'Learning Rate', '학습률', 'SGD', '머신러닝 기초']
summary: '기울기의 반대 방향으로 파라미터를 조금씩 옮기는 경사하강법의 갱신식과 편미분 유도. 학습률이 수렴과 발산을 가르는 이유, 배치와 미니배치의 차이까지 정리한다.'
thumbnail: './thumbnail.png'
---

비용 함수는 모델이 얼마나 틀렸는지를 숫자 하나로 알려준다. 남은 질문은 하나다. 그 숫자를 어떻게 줄이는가?

비용 함수 $J(w, b)$의 그래프는 그릇 모양이고 바닥이 최적의 파라미터다. 문제는 우리가 그릇의 어디에 서 있는지 모른다는 점이다. 바닥이 왼쪽인지 오른쪽인지도 모른다.

안개가 짙게 낀 산에 서 있다고 해보자. 사방이 안 보여서 계곡이 어디인지 알 수 없다. 할 수 있는 건 발밑의 경사를 느끼고 내리막 쪽으로 한 발 내딛는 것뿐이다. 그걸 반복하면 결국 바닥에 닿는다. **경사하강법(Gradient Descent)** 이 정확히 이 방법이다. "발밑의 경사"가 미분값이고 "한 발"이 학습률이다.

## 기울기의 반대 방향으로 한 걸음

갱신 규칙은 두 줄이 전부다.

$$w := w - \alpha \frac{\partial J}{\partial w}, \qquad b := b - \alpha \frac{\partial J}{\partial b}$$

$\alpha$는 학습률(learning rate)로 한 번에 얼마나 움직일지를 정하고, $\partial J / \partial w$는 현재 위치에서 비용 곡면의 기울기다. `:=`는 등호가 아니라 "오른쪽을 계산해 왼쪽에 대입한다"는 뜻이고, 코드의 `w = w - alpha * dw`와 같다.

왜 기울기를 **빼는가**? 기울기가 양수라는 건 $w$를 키우면 $J$가 올라간다는 뜻이다. $J$를 줄이려면 반대로 가야 하니 뺀다. 기울기가 음수면 빼기가 곧 더하기가 되어 자연히 오른쪽으로 움직인다. 곡면의 어느 쪽에 서 있든 부호가 알아서 방향을 잡아준다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="포물선 모양 비용 곡선 위에서 오른쪽 시작점부터 최적 지점까지 내려가는 경사하강 궤적. 바닥에 가까워질수록 점 사이의 간격이 좁아진다.">
<style>
.gd1-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.gd1-curve { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; }
.gd1-step { stroke: var(--primary, #0a756c); stroke-width: 2; fill: none; }
.gd1-aux { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; stroke-dasharray: 4 3; fill: none; }
.gd1-dot { fill: var(--primary, #0a756c); }
.gd1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.gd1-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
.gd1-d { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 600; }
</style>
<defs>
<marker id="gd1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
<marker id="gd1Step" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<text class="gd1-t" x="200" y="22" text-anchor="middle">비용 곡선을 내려가는 걸음</text>
<path class="gd1-ax" d="M 52 262 L 382 262" marker-end="url(#gd1Arrow)"/>
<path class="gd1-ax" d="M 52 262 L 52 48" marker-end="url(#gd1Arrow)"/>
<text class="gd1-l" x="58" y="42">비용 J</text>
<text class="gd1-l" x="382" y="284" text-anchor="end">파라미터 w</text>
<path class="gd1-curve" d="M 62 66 Q 221 407 380 102"/>
<path class="gd1-aux" d="M 385 94 L 295 255"/>
<text class="gd1-l" x="355" y="95" text-anchor="end">시작점</text>
<path class="gd1-step" d="M 365 128 L 312 201" marker-end="url(#gd1Step)"/>
<path class="gd1-step" d="M 302 213 L 277 230" marker-end="url(#gd1Step)"/>
<circle class="gd1-dot" cx="370" cy="121" r="4.5"/><circle class="gd1-dot" cx="307" cy="208" r="4.5"/><circle class="gd1-dot" cx="272" cy="235" r="4.5"/><circle class="gd1-dot" cx="253" cy="242" r="4.5"/><circle class="gd1-dot" cx="243" cy="245" r="4.5"/>
<circle cx="230" cy="246" r="5" fill="var(--text-danger, #cb2121)"/>
<path class="gd1-aux" d="M 230 246 L 230 262"/>
<text class="gd1-d" x="230" y="284" text-anchor="middle">최적 w</text>
<path class="gd1-aux" d="M 62 302 L 94 302"/>
<text class="gd1-l" x="102" y="307">현재 위치의 접선 (기울기)</text>
</svg>
</div>

그림에서 눈여겨볼 건 걸음 폭이다. 학습률은 처음부터 끝까지 고정인데도 바닥에 가까워질수록 보폭이 저절로 줄어든다. 경사가 완만해지면서 $\alpha \times$ 기울기 값 자체가 작아지기 때문이다. 별도의 감속 장치 없이도 바닥 근처에서 조심스러워지는 셈이다.

## MSE를 파라미터로 미분하면

선형 회귀의 비용 함수는 잔차를 제곱해 평균 낸 값이다. 예측값 $\hat{y}^{(i)} = wx^{(i)} + b$를 대입해 풀어 쓰면 이렇게 된다.

$$J(w, b) = \frac{1}{n}\sum_{i=1}^{n}\left(wx^{(i)} + b - y^{(i)}\right)^2$$

이걸 $w$와 $b$에 대해 각각 편미분한다.

$$\frac{\partial J}{\partial w} = \frac{2}{n}\sum_{i=1}^{n}\left(wx^{(i)} + b - y^{(i)}\right)x^{(i)}$$

$$\frac{\partial J}{\partial b} = \frac{2}{n}\sum_{i=1}^{n}\left(wx^{(i)} + b - y^{(i)}\right)$$

합성함수의 미분(chain rule)을 적용한 결과다. 제곱의 지수 2가 앞으로 나오고, 괄호 안을 $w$로 미분한 $x^{(i)}$가 곱해진다. $b$로 미분할 때는 괄호 안의 $b$가 1이 되므로 $x^{(i)}$가 붙지 않는다. 두 식의 유일한 차이가 이 $x^{(i)}$이고, 그래서 $x$가 큰 데이터 포인트에서 생긴 오차일수록 $w$를 더 세게 흔든다. 이 비대칭이 곧 실제 문제로 나타난다.

## 처음부터 구현하기

```python
import numpy as np

X = np.array([60, 75, 85, 95, 110, 120, 140, 155], dtype=float)
y = np.array([2.1, 2.8, 3.2, 3.6, 4.1, 4.5, 5.2, 5.8])

w, b = 0.0, 0.0
lr, n = 1e-5, len(y)

for epoch in range(5000):
    y_pred = w * X + b
    cost = np.mean((y_pred - y) ** 2)
    dw = (2 / n) * np.sum((y_pred - y) * X)
    db = (2 / n) * np.sum(y_pred - y)
    w -= lr * dw
    b -= lr * db
    if epoch % 1000 == 0:
        print(f"{epoch:5d}  cost={cost:.6f}  w={w:.6f}  b={b:.6f}")
```

```text
    0  cost=16.648750  w=0.008920  b=0.000078
 1000  cost=0.003062  w=0.037320  b=0.000201
 2000  cost=0.003061  w=0.037322  b=0.000074
 3000  cost=0.003059  w=0.037323  b=-0.000053
 4000  cost=0.003057  w=0.037324  b=-0.000179
```

첫 epoch에서 16.6이던 비용이 1000번 만에 0.003까지 떨어진다. 그런데 파라미터를 보면 이상하다. $w$는 0.0373으로 정답인 0.0380에 거의 닿았는데, $b$는 -0.0002라서 정답인 -0.0818 근처에도 못 갔다.

원인은 입력의 스케일이다. 면적 값이 60에서 155 사이라 $\partial J/\partial w$에는 이 큰 숫자가 곱해지지만 $\partial J/\partial b$에는 곱해지지 않는다. 두 기울기의 크기가 수십 배 차이 나는데 학습률은 하나뿐이다. $w$가 발산하지 않도록 $\alpha$를 작게 잡으면 $b$는 거의 제자리걸음을 하게 된다.

해결책은 입력을 미리 비슷한 범위로 맞춰주는 것이다. 면적을 평균 0, 표준편차 1로 표준화하면 두 기울기의 크기가 맞아떨어지고, 학습률 0.01로 1000번만 돌려도 정규 방정식이 주는 해에 그대로 도달한다. 이 전처리를 Feature Scaling이라 부르고, 경사하강법을 쓰는 한 사실상 필수다.

## 학습률이 결정하는 것

학습률 $\alpha$는 경사하강법에서 가장 중요한 하이퍼파라미터다. 너무 작으면 바닥까지 수만 번을 걸어야 하고, 너무 크면 바닥을 지나쳐 반대편 벽으로 튕겨 나간다. 튕긴 자리는 경사가 더 가파르니 다음 걸음은 더 크게 튕기고, 몇 번만 반복되면 비용이 무한대로 폭주한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 620" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 비용 곡선에 학습률만 바꿔 그린 세 패널. 위는 작은 학습률로 걸음이 촘촘해 바닥에 못 미치고, 가운데는 적절한 학습률로 네 걸음 만에 바닥에 닿으며, 아래는 큰 학습률로 좌우로 튕기며 폭이 커진다.">
<style>
.gd2-curve { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; }
.gd2-min { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.gd2-sep { stroke: var(--border, #e7e5e4); stroke-width: 1; fill: none; }
.gd2-ok { stroke: var(--primary, #0a756c); stroke-width: 1.6; fill: none; }
.gd2-okd { fill: var(--primary, #0a756c); }
.gd2-bad { stroke: var(--text-danger, #cb2121); stroke-width: 1.6; fill: none; }
.gd2-badd { fill: var(--text-danger, #cb2121); }
.gd2-t { fill: var(--text, #1c1917); font-size: 18px; font-weight: 700; }
.gd2-h { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gd2-l { fill: var(--text-muted, #6d6762); font-size: 15px; }
.gd2-s { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gd2-d { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 600; }
</style>
<defs>
<marker id="gd2Blow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-danger, #cb2121)"/>
</marker>
</defs>
<text class="gd2-t" x="200" y="24" text-anchor="middle">학습률에 따른 수렴 양상</text>
<text class="gd2-h" x="20" y="56">작은 학습률</text>
<text class="gd2-l" x="380" y="80" text-anchor="end">느린 수렴</text>
<path class="gd2-curve" d="M 60 90 Q 215 310 370 90"/>
<circle class="gd2-min" cx="215" cy="200" r="5"/>
<text class="gd2-s" x="215" y="222" text-anchor="middle">최솟값</text>
<path class="gd2-ok" d="M 365 97 L 353 113 L 342 126 L 332 137 L 323 147 L 314 155 L 306 162"/>
<circle class="gd2-okd" cx="365" cy="97" r="4"/><circle class="gd2-okd" cx="353" cy="113" r="4"/><circle class="gd2-okd" cx="342" cy="126" r="4"/><circle class="gd2-okd" cx="332" cy="137" r="4"/><circle class="gd2-okd" cx="323" cy="147" r="4"/><circle class="gd2-okd" cx="314" cy="155" r="4"/><circle class="gd2-okd" cx="306" cy="162" r="4"/>
<path class="gd2-sep" d="M 20 234 L 380 234"/>
<text class="gd2-h" x="20" y="261">적절한 학습률</text>
<text class="gd2-l" x="380" y="285" text-anchor="end">빠른 수렴</text>
<path class="gd2-curve" d="M 60 295 Q 215 515 370 295"/>
<circle class="gd2-min" cx="215" cy="405" r="5"/>
<path class="gd2-ok" d="M 365 302 L 290 379 L 253 399 L 234 403"/>
<circle class="gd2-okd" cx="365" cy="302" r="4"/><circle class="gd2-okd" cx="290" cy="379" r="4"/><circle class="gd2-okd" cx="253" cy="399" r="4"/><circle class="gd2-okd" cx="234" cy="403" r="4"/>
<path class="gd2-sep" d="M 20 429 L 380 429"/>
<text class="gd2-h" x="20" y="456">너무 큰 학습률</text>
<path class="gd2-curve" d="M 60 490 Q 215 710 370 490"/>
<circle class="gd2-min" cx="215" cy="600" r="5"/>
<path class="gd2-bad" d="M 263 589 L 145 578 L 316 553 L 69 502"/>
<path class="gd2-bad" d="M 69 502 L 46 478" marker-end="url(#gd2Blow)"/>
<circle class="gd2-badd" cx="263" cy="589" r="4"/><circle class="gd2-badd" cx="145" cy="578" r="4"/><circle class="gd2-badd" cx="316" cy="553" r="4"/><circle class="gd2-badd" cx="69" cy="502" r="4"/>
<text class="gd2-d" x="80" y="488">발산</text>
</svg>
</div>

같은 데이터에 학습률만 바꿔 3000번씩 돌려보면 차이가 그대로 드러난다.

```python
for lr in [2e-7, 1e-5, 1e-4]:
    w, b = 0.0, 0.0
    for _ in range(3000):
        y_pred = w * X + b
        w -= lr * (2 / n) * np.sum((y_pred - y) * X)
        b -= lr * (2 / n) * np.sum(y_pred - y)
    cost = np.mean((w * X + b - y) ** 2)
    print(f"lr={lr:.0e}  w={w:<8.4f} b={b:<8.4f} cost={cost:.6f}")
```

```text
lr=2e-07  w=0.0373   b=0.0003   cost=0.003064
lr=1e-05  w=0.0373   b=-0.0001  cost=0.003059
lr=1e-04  w=nan      b=nan      cost=nan
```

앞의 두 학습률이 3000번에서 사실상 같은 자리에 있는 것은 둘 다 앞 절의 스케일 문제에 걸려 $b$ 가 제자리이기 때문이다. 이 데이터에서 셋을 갈라놓는 것은 마지막 값이다. 0.0001에서는 첫 갱신부터 비용이 16.6에서 32.2로 뛰고, 이후 매 epoch마다 대략 두 배씩 커지다가 부동소수점 범위를 넘어 `nan`이 된다. 실무에서는 0.1, 0.01, 0.001처럼 10배씩 낮춰가며 비용 곡선이 매끄럽게 떨어지는 가장 큰 값을 고른다. 비용이 진동하거나 오히려 커지면 그 학습률은 너무 크다.

## 한 걸음에 데이터를 얼마나 쓸 것인가

지금까지 본 방식은 매 갱신마다 전체 데이터로 기울기를 계산했다. 이걸 **배치 경사하강법(Batch Gradient Descent)** 이라 부른다. 데이터가 수백만 건이면 한 걸음을 떼는 데 수백만 개를 훑어야 해서 현실적이지 않다.

| 방식 | 한 번 갱신에 쓰는 데이터 | 성격 |
|---|---|---|
| 배치(Batch) | 전체 | 방향이 정확하지만 느림 |
| 확률적(SGD) | 1건 | 매우 빠르지만 방향이 흔들림 |
| 미니배치(Mini-batch) | 32, 64, 128건 | 속도와 안정성의 절충 |

실무 표준은 미니배치다. 데이터를 섞어 작은 묶음으로 자르고 묶음 하나마다 파라미터를 한 번씩 갱신한다. 기울기 방향은 전체를 훑을 때보다 부정확하지만 같은 시간에 갱신 횟수가 훨씬 많아져 결과적으로 더 빨리 내려가고, 흔들리는 방향이 얕은 국소 최솟값을 빠져나오는 데 도움이 되기도 한다. SGD라는 이름은 엄밀히 1건짜리 방식을 가리키지만 실무에서는 미니배치까지 묶어 통칭으로 쓴다. `torch.optim.SGD`도 배치 크기가 얼마인지는 모르고, 넘겨받은 기울기를 갱신식에 그대로 넣을 뿐이다.

## 언제 멈출 것인가

- **최대 반복 횟수**: 정한 epoch만큼 돌고 끝낸다. 가장 단순하지만 이미 수렴한 뒤에도 계속 도는 낭비가 생긴다.
- **비용 변화량**: 직전 epoch과 비용 차이가 임계값보다 작으면 멈춘다. 예를 들어 $\lvert J_{t-1} - J_{t} \rvert < 10^{-7}$이다.
- **기울기 크기**: 기울기의 크기가 거의 0이면 바닥에 도달한 것으로 보고 멈춘다.

보통 최대 반복 횟수를 안전장치로 걸어두고 비용 변화량으로 조기 종료를 건다. 기울기 크기 기준은 임계값을 데이터 스케일에 맞춰야 해서 손이 더 간다.

## 마치며

경사하강법은 한 문장으로 줄어든다. 기울기의 반대 방향으로 조금씩 이동한다.

이 단순한 규칙이 살아남은 이유는 비용 함수의 전체 모양을 몰라도 된다는 데 있다. 해를 한 번에 구하는 방법은 문제 구조가 정확히 알려져 있어야 하고 특성 수가 늘면 계산량을 감당하지 못한다. 경사하강법은 현재 위치의 기울기 하나만 알면 다음 걸음을 뗄 수 있고, 그래서 파라미터가 수십억 개인 언어 모델에서도 그대로 쓰인다.

대신 사람이 정해줘야 하는 것이 남는다. 얼마나 큰 보폭으로 갈지, 언제 멈출지, 그리고 입력의 스케일을 어떻게 맞출지다. 특히 마지막 항목은 선택이 아니다. 스케일이 제각각이면 보폭 하나로 모든 파라미터를 감당할 수 없고, 이 글의 예제에서 $b$가 5000번을 돌고도 제자리였던 이유가 정확히 그것이다.

## 함께 보면 좋은 글

- [비용 함수](/ml/cost-function/) : 경사하강법이 내려가는 그 지형의 정의
- [선형 회귀](/ml/linear-regression/) : 정규 방정식으로 같은 해를 한 번에 구하는 방법
- [특성 스케일링](/ml/feature-scaling/) : 입력 범위를 맞춰 수렴을 안정시키는 전처리
- [옵티마이저](/ml/optimizers/) : 학습률을 파라미터마다 자동으로 조절하는 개선안

## 참고자료

- [Andrew Ng, Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [3Blue1Brown, Gradient Descent, How Neural Networks Learn (YouTube)](https://www.youtube.com/watch?v=IHZwWFHWa-w)
- [Sebastian Ruder, An Overview of Gradient Descent Optimization Algorithms](https://arxiv.org/abs/1609.04747)
- [Scikit-learn SGDRegressor Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.SGDRegressor.html)
