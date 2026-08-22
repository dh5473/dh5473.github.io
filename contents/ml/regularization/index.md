---
date: '2026-01-09'
title: '과적합을 막는 규제, Ridge와 Lasso는 무엇이 다른가'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 9
tags: ['Regularization', '규제', 'Ridge', 'Lasso', 'ElasticNet', 'Overfitting', '과적합', '머신러닝 기초']
summary: '가중치 크기에 패널티를 걸어 과적합을 억누르는 규제. Ridge는 계수를 고르게 줄이고 Lasso는 일부를 정확히 0으로 만드는데, 그 차이는 패널티 식이 아니라 제약 영역의 모양에서 나온다.'
thumbnail: './thumbnail.png'
---

변수를 늘리고 다항 특성까지 넣으면 훈련 데이터의 오차는 계속 줄어든다. 그런데 새 데이터에서는 어느 지점부터 예측이 오히려 나빠진다. 훈련 데이터를 외워버린 것이고, 이게 과적합(Overfitting)이다. 이걸 막는 기법이 규제(Regularization)다.

## 과적합은 큰 가중치에서 온다

sin 곡선에 노이즈를 섞은 20개 점에 다항 회귀를 차수 1, 4, 15로 맞춰본다.

```python
import numpy as np

np.random.seed(42)
x = np.linspace(0, 1, 20)
y = np.sin(2 * np.pi * x) + np.random.normal(0, 0.3, 20)

for deg in (1, 4, 15):
    fit = np.polyfit(x, y, deg)
    print(deg, f"{np.mean((np.polyval(fit, x) - y) ** 2):.4f}")
```

```text
1 0.3543
4 0.0613
15 0.0100
```

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 580" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 20개 점에 다항 회귀를 차수 1, 4, 15로 맞춘 결과를 위에서 아래로 쌓아 비교한 그림. 차수 1은 직선이라 곡선을 따라가지 못하고, 차수 4는 참 함수에 가깝게 붙고, 차수 15는 점 사이에서 크게 요동치다 패널 밖으로 벗어난다">
<style>
.of-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.of-pt { fill: var(--text-muted, #6d6762); }
.of-true { fill: none; stroke: var(--text-muted, #6d6762); stroke-width: 1.6; stroke-dasharray: 5 4; stroke-opacity: 0.75; }
.of-fit { fill: none; stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; }
.of-zero { stroke: var(--text-muted, #6d6762); stroke-width: 1; stroke-dasharray: 3 4; stroke-opacity: 0.4; }
.of-tick { font-size: 14px; fill: var(--text-muted, #6d6762); }
.of-h { font-size: 17px; font-weight: 700; }
</style>
<text x="200" y="20" text-anchor="middle" class="of-tick">점 = 관측값 20개 · 점선 = 참 sin 곡선</text>
<!-- 차수 1 -->
<text x="200" y="44" text-anchor="middle" class="of-h" fill="var(--accent, #9d5604)">차수 1 · 과소적합</text>
<rect x="56" y="56" width="310" height="140" rx="5" class="of-panel"/>
<line x1="56" y1="126" x2="366" y2="126" class="of-zero"/>
<text x="48" y="64.1" text-anchor="end" class="of-tick">2</text>
<text x="48" y="130.8" text-anchor="end" class="of-tick">0</text>
<text x="48" y="197.5" text-anchor="end" class="of-tick">-2</text>
<path class="of-true" d="M 56.0,126.0 L 68.9,117.4 81.8,109.3 94.8,102.4 107.7,97.1 120.6,93.8 133.5,92.7 146.4,93.8 159.3,97.1 172.2,102.4 185.2,109.3 198.1,117.4 211.0,126.0 223.9,134.6 236.8,142.7 249.8,149.6 262.7,154.9 275.6,158.2 288.5,159.3 301.4,158.2 314.3,154.9 327.2,149.6 340.2,142.7 353.1,134.6 366.0,126.0"/>
<circle cx="56.0" cy="121.0" r="3.2" class="of-pt"/><circle cx="72.3" cy="116.6" r="3.2" class="of-pt"/><circle cx="88.6" cy="99.0" r="3.2" class="of-pt"/><circle cx="104.9" cy="82.9" r="3.2" class="of-pt"/><circle cx="121.3" cy="96.0" r="3.2" class="of-pt"/><circle cx="137.6" cy="95.1" r="3.2" class="of-pt"/><circle cx="153.9" cy="79.7" r="3.2" class="of-pt"/><circle cx="170.2" cy="93.8" r="3.2" class="of-pt"/><circle cx="186.5" cy="114.8" r="3.2" class="of-pt"/><circle cx="202.8" cy="115.1" r="3.2" class="of-pt"/><circle cx="219.2" cy="136.1" r="3.2" class="of-pt"/><circle cx="235.5" cy="146.5" r="3.2" class="of-pt"/><circle cx="251.8" cy="148.1" r="3.2" class="of-pt"/><circle cx="268.1" cy="175.7" r="3.2" class="of-pt"/><circle cx="284.4" cy="176.5" r="3.2" class="of-pt"/><circle cx="300.7" cy="163.9" r="3.2" class="of-pt"/><circle cx="317.1" cy="164.0" r="3.2" class="of-pt"/><circle cx="333.4" cy="143.3" r="3.2" class="of-pt"/><circle cx="349.7" cy="145.9" r="3.2" class="of-pt"/><circle cx="366.0" cy="140.1" r="3.2" class="of-pt"/>
<path class="of-fit" stroke="var(--accent, #9d5604)" d="M 56.0,91.1 L 366.0,164.3"/>
<!-- 차수 4 -->
<text x="200" y="230" text-anchor="middle" class="of-h" fill="var(--primary, #0a756c)">차수 4 · 적절한 적합</text>
<rect x="56" y="242" width="310" height="140" rx="5" class="of-panel"/>
<line x1="56" y1="312" x2="366" y2="312" class="of-zero"/>
<text x="48" y="250.1" text-anchor="end" class="of-tick">2</text>
<text x="48" y="316.8" text-anchor="end" class="of-tick">0</text>
<text x="48" y="383.5" text-anchor="end" class="of-tick">-2</text>
<path class="of-true" d="M 56.0,312.0 L 68.9,303.4 81.8,295.3 94.8,288.4 107.7,283.1 120.6,279.8 133.5,278.7 146.4,279.8 159.3,283.1 172.2,288.4 185.2,295.3 198.1,303.4 211.0,312.0 223.9,320.6 236.8,328.7 249.8,335.6 262.7,340.9 275.6,344.2 288.5,345.3 301.4,344.2 314.3,340.9 327.2,335.6 340.2,328.7 353.1,320.6 366.0,312.0"/>
<circle cx="56.0" cy="307.0" r="3.2" class="of-pt"/><circle cx="72.3" cy="302.6" r="3.2" class="of-pt"/><circle cx="88.6" cy="285.0" r="3.2" class="of-pt"/><circle cx="104.9" cy="268.9" r="3.2" class="of-pt"/><circle cx="121.3" cy="282.0" r="3.2" class="of-pt"/><circle cx="137.6" cy="281.1" r="3.2" class="of-pt"/><circle cx="153.9" cy="265.7" r="3.2" class="of-pt"/><circle cx="170.2" cy="279.8" r="3.2" class="of-pt"/><circle cx="186.5" cy="300.8" r="3.2" class="of-pt"/><circle cx="202.8" cy="301.1" r="3.2" class="of-pt"/><circle cx="219.2" cy="322.1" r="3.2" class="of-pt"/><circle cx="235.5" cy="332.5" r="3.2" class="of-pt"/><circle cx="251.8" cy="334.1" r="3.2" class="of-pt"/><circle cx="268.1" cy="361.7" r="3.2" class="of-pt"/><circle cx="284.4" cy="362.5" r="3.2" class="of-pt"/><circle cx="300.7" cy="349.9" r="3.2" class="of-pt"/><circle cx="317.1" cy="350.0" r="3.2" class="of-pt"/><circle cx="333.4" cy="329.3" r="3.2" class="of-pt"/><circle cx="349.7" cy="331.9" r="3.2" class="of-pt"/><circle cx="366.0" cy="326.1" r="3.2" class="of-pt"/>
<path class="of-fit" stroke="var(--primary, #0a756c)" d="M 56.0,314.7 L 65.4,302.3 74.8,292.2 84.2,284.4 93.6,278.7 103.0,274.8 112.4,272.7 121.8,272.1 131.2,272.9 140.5,275.0 149.9,278.1 159.3,282.1 168.7,286.9 178.1,292.3 187.5,298.1 196.9,304.3 206.3,310.7 215.7,317.0 225.1,323.3 234.5,329.3 243.9,335.0 253.3,340.1 262.7,344.6 272.1,348.4 281.5,351.2 290.8,353.0 300.2,353.7 309.6,353.1 319.0,351.2 328.4,347.8 337.8,342.8 347.2,336.1 356.6,327.7 366.0,317.3"/>
<!-- 차수 15 -->
<text x="200" y="416" text-anchor="middle" class="of-h" fill="var(--text-danger, #cb2121)">차수 15 · 과적합</text>
<rect x="56" y="428" width="310" height="140" rx="5" class="of-panel"/>
<line x1="56" y1="498" x2="366" y2="498" class="of-zero"/>
<text x="48" y="436.1" text-anchor="end" class="of-tick">2</text>
<text x="48" y="502.8" text-anchor="end" class="of-tick">0</text>
<text x="48" y="569.5" text-anchor="end" class="of-tick">-2</text>
<path class="of-true" d="M 56.0,498.0 L 68.9,489.4 81.8,481.3 94.8,474.4 107.7,469.1 120.6,465.8 133.5,464.7 146.4,465.8 159.3,469.1 172.2,474.4 185.2,481.3 198.1,489.4 211.0,498.0 223.9,506.6 236.8,514.7 249.8,521.6 262.7,526.9 275.6,530.2 288.5,531.3 301.4,530.2 314.3,526.9 327.2,521.6 340.2,514.7 353.1,506.6 366.0,498.0"/>
<circle cx="56.0" cy="493.0" r="3.2" class="of-pt"/><circle cx="72.3" cy="488.6" r="3.2" class="of-pt"/><circle cx="88.6" cy="471.0" r="3.2" class="of-pt"/><circle cx="104.9" cy="454.9" r="3.2" class="of-pt"/><circle cx="121.3" cy="468.0" r="3.2" class="of-pt"/><circle cx="137.6" cy="467.1" r="3.2" class="of-pt"/><circle cx="153.9" cy="451.7" r="3.2" class="of-pt"/><circle cx="170.2" cy="465.8" r="3.2" class="of-pt"/><circle cx="186.5" cy="486.8" r="3.2" class="of-pt"/><circle cx="202.8" cy="487.1" r="3.2" class="of-pt"/><circle cx="219.2" cy="508.1" r="3.2" class="of-pt"/><circle cx="235.5" cy="518.5" r="3.2" class="of-pt"/><circle cx="251.8" cy="520.1" r="3.2" class="of-pt"/><circle cx="268.1" cy="547.7" r="3.2" class="of-pt"/><circle cx="284.4" cy="548.5" r="3.2" class="of-pt"/><circle cx="300.7" cy="535.9" r="3.2" class="of-pt"/><circle cx="317.1" cy="536.0" r="3.2" class="of-pt"/><circle cx="333.4" cy="515.3" r="3.2" class="of-pt"/><circle cx="349.7" cy="517.9" r="3.2" class="of-pt"/><circle cx="366.0" cy="512.1" r="3.2" class="of-pt"/>
<path class="of-fit" stroke="var(--text-danger, #cb2121)" d="M 56.0,493.0 L 57.1,428.0 M 68.0,428.0 L 68.5,436.8 70.6,468.5 72.6,491.5 74.7,505.5 76.8,511.5 78.9,511.0 81.0,505.7 83.0,497.4 85.1,487.7 87.2,477.8 89.3,468.7 91.4,461.1 93.4,455.2 95.5,451.2 97.6,449.1 99.7,448.8 101.8,449.8 103.9,451.9 105.9,454.7 108.0,457.9 110.1,461.2 112.2,464.2 114.3,467.0 116.3,469.1 118.4,470.7 120.5,471.5 122.6,471.8 124.7,471.4 126.7,470.5 128.8,469.2 130.9,467.6 133.0,465.8 135.1,463.9 137.1,462.0 139.2,460.3 141.3,458.7 143.4,457.4 145.5,456.5 147.5,455.8 149.6,455.5 151.7,455.6 153.8,456.0 155.9,456.7 157.9,457.6 160.0,458.8 162.1,460.2 164.2,461.7 166.3,463.3 168.3,465.0 170.4,466.8 172.5,468.6 174.6,470.4 176.7,472.2 178.8,473.9 180.8,475.7 182.9,477.5 185.0,479.2 187.1,480.9 189.2,482.6 191.2,484.4 193.3,486.1 195.4,487.8 197.5,489.6 199.6,491.3 201.6,493.1 203.7,494.8 205.8,496.5 207.9,498.2 210.0,499.9 212.0,501.4 214.1,503.0 216.2,504.4 218.3,505.8 220.4,507.0 222.4,508.2 224.5,509.3 226.6,510.4 228.7,511.3 230.8,512.3 232.8,513.2 234.9,514.2 237.0,515.2 239.1,516.3 241.2,517.5 243.2,518.8 245.3,520.3 247.4,521.9 249.5,523.7 251.6,525.7 253.7,527.8 255.7,530.0 257.8,532.4 259.9,534.8 262.0,537.3 264.1,539.7 266.1,542.0 268.2,544.1 270.3,546.1 272.4,547.7 274.5,549.0 276.5,549.9 278.6,550.4 280.7,550.4 282.8,550.0 284.9,549.2 286.9,548.0 289.0,546.5 291.1,544.7 293.2,542.8 295.3,540.9 297.3,538.9 299.4,537.2 301.5,535.7 303.6,534.6 305.7,533.8 307.7,533.5 309.8,533.6 311.9,534.0 314.0,534.7 316.1,535.4 318.1,536.0 320.2,536.2 322.3,535.8 324.4,534.5 326.5,532.1 328.6,528.5 330.6,523.6 332.7,517.6 334.8,510.7 336.9,503.5 339.0,496.8 341.0,491.7 343.1,489.5 345.2,491.6 347.3,499.6 349.4,514.8 351.4,537.8 353.5,568.0 M 365.0,568.0 L 366.0,512.1"/>
</svg>
</div>

차수 1은 곡선 패턴을 전혀 못 잡고(과소적합), 차수 4는 노이즈를 무시하고 전체 경향을 따라가고, 차수 15는 점 하나하나를 쫓아간다. 훈련 오차만 보면 차수 15가 압도적이다. 그런데 그 곡선은 점과 점 사이에서 위아래로 크게 요동치고, 양 끝에서는 아예 그림 밖으로 튀어 나간다. 새 데이터가 그 사이에 떨어지면 예측이 크게 빗나간다.

왜 이렇게 되나. 변수가 $n$개면 가중치도 $n$개다. 데이터 수 $m$보다 $n$이 커지면 훈련 데이터를 정확히 맞추는 해가 무한히 많아지고, 그중에는 가중치가 극단적으로 큰 해도 섞여 있다. 가중치가 크다는 건 입력이 조금 흔들릴 때 출력이 크게 튄다는 뜻이다. 노이즈에 민감해지고, 그게 과적합의 메커니즘이다.

처방도 그만큼 단순하다. 가중치를 작게 유지한다. 모델을 단순하게 만드는 대가로 훈련 오차는 조금 올라가지만(편향 증가), 데이터가 조금 바뀌어도 결과가 덜 흔들린다(분산 감소). 둘의 합이 줄어드는 구간이 있고, 규제는 그 구간을 노린다.

## 비용 함수에 패널티를 더한다

학습의 목표는 MSE를 최소화하는 것이었다. 규제는 여기에 패널티 항 하나를 더한다.

$$J(\mathbf{w}, b) = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda \cdot \mathrm{Penalty}(\mathbf{w})$$

앞의 MSE는 데이터에 맞추라고 밀고, 뒤의 패널티는 가중치를 줄이라고 당긴다. $\lambda$는 두 힘의 균형점을 정하는 하이퍼파라미터다. $\lambda = 0$이면 규제가 없는 원래 선형 회귀고, $\lambda$가 커질수록 가중치를 강하게 억누른다. 너무 키우면 모든 가중치가 0에 붙어 과소적합이 된다.

패널티를 어떻게 정의하느냐에서 Ridge와 Lasso가 갈린다.

아래 코드는 전부 같은 데이터를 쓴다. 면적(평), 방 수, 층수로 가격(억원)을 예측하는 아파트 20채짜리 데이터다. 규제는 가중치 크기에 값을 매기니 변수들의 단위부터 맞춰놓는다.

```python
X = np.array([[142,5,23],[91,2,20],[132,4,3],[54,2,5],[146,4,19],[111,5,7],
              [100,1,21],[60,4,9],[142,2,7],[122,5,18],[126,4,4],[114,1,14],
              [114,1,18],[127,3,9],[156,3,21],[139,2,2],[143,4,20],[63,4,15],
              [42,3,7],[61,4,12]], dtype=float)
y = np.array([7.56,4.63,6.45,3.34,6.88,6.80,5.25,4.84,5.97,7.28,
              6.06,4.23,5.01,5.83,6.70,5.45,6.85,4.73,3.57,4.84])

X_scaled = (X - X.mean(axis=0)) / X.std(axis=0)
```

이 데이터에 규제 없는 선형 회귀를 돌리면 가중치가 `[0.856, 0.645, 0.178]`, R²가 0.9506으로 나온다. 앞으로 나오는 숫자는 전부 이 값과 비교한 것이다.

## Ridge는 제곱 합으로 누른다

$$J(\mathbf{w}, b) = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda \sum_{j=1}^{n} w_j^2$$

가중치가 클수록 제곱 때문에 패널티가 가파르게 커진다. 결과적으로 모든 가중치를 고르게 줄이되, 어느 하나를 정확히 0으로 보내지는 않는다. 모든 변수를 조금씩 쓰는 셈이다.

$w_j$로 미분하면 기울기에 $2\lambda w_j$가 더해진다. 경사하강법 코드는 그 한 항만 바뀐다.

```python
m, n = X_scaled.shape
w, b = np.zeros(n), 0.0
lr, lam = 0.01, 0.1

for _ in range(1000):
    error = X_scaled @ w + b - y
    w -= lr * ((2/m) * (X_scaled.T @ error) + 2 * lam * w)   # 규제 항이 붙는 자리
    b -= lr * (2/m) * np.sum(error)                          # b에는 규제를 걸지 않는다

print(np.round(w, 4))   # [0.7818 0.5918 0.1767]
```

규제 없는 `[0.856, 0.645, 0.178]`과 비교하면 세 가중치가 모두 줄었고, 가장 컸던 면적이 0.856에서 0.782로 가장 많이 깎였다.

:::warning

**b는 규제하지 않는다**

편향 $b$는 입력과 무관하게 출력 전체를 위아래로 옮기는 항이다. 규제의 목적은 특성과 출력 사이 관계의 복잡도를 낮추는 것이지, 출력의 평균 수준을 0쪽으로 끌어내리는 게 아니다. $b$까지 규제하면 타깃의 평균이 0에서 멀수록 손해만 본다.

:::

sklearn으로는 한 줄이다.

```python
from sklearn.linear_model import Ridge

ridge = Ridge(alpha=1.0).fit(X_scaled, y)
print(f"R2 = {ridge.score(X_scaled, y):.4f}")   # 0.9489
print(np.round(ridge.coef_, 4))                 # [0.8169 0.6173 0.1775]
```

규제 없는 R²(0.9506)과 거의 차이가 없다. 훈련 성능을 조금 내주고 일반화 성능을 산 것이다.

값이 위 직접 구현과 다른 건 규제 스케일이 서로 달라서다. sklearn의 `Ridge`는 오차 제곱합을 데이터 수로 나누지 않고 $\sum(\hat{y}_i - y_i)^2 + \alpha \sum w_j^2$을 최소화한다. 이걸 위 코드처럼 MSE 형태로 쓰려면 양변을 $m$으로 나눠야 하니 $\lambda = \alpha / m$이다. $m = 20$이므로 `alpha=1.0`에 대응하는 값은 `lam=0.05`이고, 그 값을 넣으면 직접 구현도 `[0.8169, 0.6173, 0.1775]`로 정확히 일치한다.

## Lasso는 절댓값 합으로 누른다

$$J(\mathbf{w}, b) = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda \sum_{j=1}^{n} \lvert w_j \rvert$$

Ridge와 결정적으로 다른 점이 하나 있다. 일부 가중치를 **정확히 0**으로 만든다. 쓸모없는 변수를 모델이 알아서 빼주는 변수 선택(Feature Selection) 효과다.

$\alpha$를 키우면서 계수를 보면 하나씩 떨어져 나간다.

```python
from sklearn.linear_model import Lasso

for alpha in [0.01, 0.1, 0.5, 1.0]:
    coef = Lasso(alpha=alpha).fit(X_scaled, y).coef_
    print(alpha, np.round(coef, 3), (coef == 0).sum())
```

| α | 면적 | 방 수 | 층수 | 0이 된 변수 |
|---|---|---|---|---|
| 0.01 | 0.848 | 0.636 | 0.169 | 0개 |
| 0.10 | 0.782 | 0.551 | 0.094 | 0개 |
| 0.50 | 0.432 | 0.178 | 0.000 | 1개 |
| 1.00 | 0.000 | 0.000 | 0.000 | 3개 |

α=0.5에서 층수가 먼저 0이 되고, α=1.0에서는 셋 다 0이 된다. 마지막은 규제가 너무 세서 모델이 아무 말도 하지 않는 상태다. 변수가 수십, 수백 개인 실전 데이터에서는 쓸모없는 것만 0으로 보내고 중요한 것은 살리는 중간 α를 찾는 게 관건이다.

### 왜 L1만 계수를 0으로 만드나

패널티가 붙은 최소화 문제는 예산 제약이 걸린 최소화 문제로 바꿔 쓸 수 있다. "패널티 총량이 $t$ 이하인 범위에서 MSE를 최소화하라"는 형태다.

$$\min_{\mathbf{w}} \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 \quad \text{s.t.} \quad \mathrm{Penalty}(\mathbf{w}) \le t$$

변수가 두 개일 때 이 제약 영역을 그려보면 모양이 다르다. Ridge의 $w_1^2 + w_2^2 \le t$는 원점을 중심으로 한 원이고, Lasso의 $\lvert w_1 \rvert + \lvert w_2 \rvert \le t$는 축 위에 꼭짓점이 놓인 마름모다. 한편 MSE의 등고선은 규제 없는 최적점을 중심으로 퍼져 나가는 곡선들이다. 해는 이 등고선이 커지다가 제약 영역에 처음 닿는 지점이다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 640" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Ridge의 원형 제약은 손실 등고선과 축 밖에서 만나 두 계수가 모두 0이 아니고, Lasso의 마름모 제약은 축 위 꼭짓점에서 만나 한 계수가 정확히 0이 된다">
<!-- 위 패널: Ridge, 원형 제약 -->
<text x="200" y="28" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">Ridge (L2), 원형 제약</text>
<line x1="46" y1="218" x2="374" y2="218" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.55" stroke-width="1"/>
<line x1="120" y1="74" x2="120" y2="282" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.55" stroke-width="1"/>
<text x="378" y="238" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">w₁</text>
<text x="104" y="84" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">w₂</text>
<circle cx="255" cy="168" r="90" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="255" cy="168" r="60" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="120" cy="218" r="54" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<circle cx="255" cy="168" r="5" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="2"/>
<text x="255" y="150" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">규제 전 최적</text>
<circle cx="171" cy="199" r="5.5" fill="var(--primary, #0a756c)"/>
<text x="148" y="192" text-anchor="middle" font-size="15" font-weight="700" fill="var(--primary, #0a756c)">해</text>
<text x="200" y="298" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">축 밖에서 만남, 두 계수 모두 0 아님</text>
<line x1="40" y1="326" x2="360" y2="326" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널: Lasso, 마름모 제약 -->
<text x="200" y="356" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">Lasso (L1), 마름모 제약</text>
<line x1="46" y1="532" x2="374" y2="532" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.55" stroke-width="1"/>
<line x1="120" y1="383" x2="120" y2="594" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.55" stroke-width="1"/>
<text x="378" y="552" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">w₁</text>
<text x="104" y="393" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">w₂</text>
<circle cx="255" cy="482" r="95" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="255" cy="482" r="63" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<polygon points="174,532 120,478 66,532 120,586" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--accent, #9d5604)" stroke-width="2.5"/>
<circle cx="255" cy="482" r="5" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="2"/>
<text x="255" y="464" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">규제 전 최적</text>
<circle cx="174" cy="532" r="5.5" fill="var(--accent, #9d5604)"/>
<text x="138" y="514" text-anchor="middle" font-size="15" font-weight="700" fill="var(--accent, #9d5604)">해</text>
<text x="200" y="612" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">축 위 꼭짓점에서 만남, w₂ = 0</text>
</svg>
</div>

원은 어디를 잘라도 매끄러워서 등고선이 축이 아닌 자리에 닿는다. 두 계수 모두 0이 아닌 값으로 남는다. 마름모는 축 위에 뾰족한 꼭짓점이 있고, 등고선이 커지다가 제일 먼저 부딪히는 곳이 대개 그 꼭짓점이다. 꼭짓점은 나머지 좌표가 0인 점이다. 차원이 올라갈수록 꼭짓점과 모서리가 늘어나서 이 효과는 더 강해진다.

## ElasticNet은 둘을 섞는다

Ridge의 안정성과 Lasso의 변수 선택을 같이 원하면 두 패널티를 섞는다. sklearn의 정의는 이렇다.

$$J = \frac{1}{2m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \alpha\left[\rho \sum_j \lvert w_j \rvert + \frac{1-\rho}{2}\sum_j w_j^2\right]$$

$\alpha$는 전체 규제 강도, $\rho$(`l1_ratio`)는 L1이 차지하는 비율이다. 1이면 Lasso, 0이면 Ridge가 된다.

```python
from sklearn.linear_model import ElasticNet

en = ElasticNet(alpha=0.1, l1_ratio=0.5).fit(X_scaled, y)
print(f"R2 = {en.score(X_scaled, y):.4f}")   # 0.9402
print(np.round(en.coef_, 4))                 # [0.7813 0.5723 0.1376]
```

ElasticNet이 빛나는 자리는 상관된 변수가 여럿일 때다. Lasso는 그중 하나만 골라 남기고 나머지를 0으로 보내는데, 어느 것이 뽑힐지는 데이터가 조금만 바뀌어도 달라진다. ElasticNet은 상관된 변수들을 묶어서 함께 살리거나 함께 죽인다.

## 셋 중 무엇을 고를까

| | Ridge (L2) | Lasso (L1) | ElasticNet |
|---|---|---|---|
| 패널티 | $\sum w_j^2$ | $\sum \lvert w_j \rvert$ | 둘의 가중합 |
| 변수 선택 | 없음, 전부 유지 | 있음, 일부를 0으로 | 있음, 그룹 단위 |
| 상관된 변수 | 가중치를 고르게 나눔 | 하나만 남기고 나머지 0 | 그룹으로 함께 선택 |
| 해의 유일성 | 항상 유일 | 특성이 데이터보다 많으면 최대 $m$개까지만 선택 | 항상 유일 |
| 쓰는 자리 | 변수가 대체로 유의미할 때 | 쓸모없는 변수가 많을 때 | 상관된 변수 그룹이 있을 때 |

판단이 안 서면 `ElasticNet(l1_ratio=0.5)`으로 시작해서 비율을 옮겨보는 쪽이 빠르다.

## λ는 교차 검증으로 고른다

적절한 λ는 데이터마다 다르다. 손으로 찍지 말고 교차 검증에 맡긴다.

```python
from sklearn.linear_model import RidgeCV, LassoCV

ridge_cv = RidgeCV(alphas=np.logspace(-4, 4, 50)).fit(X_scaled, y)
lasso_cv = LassoCV(alphas=np.logspace(-4, 1, 50), cv=5).fit(X_scaled, y)
print(ridge_cv.alpha_, lasso_cv.alpha_)   # 0.3907 0.0001
```

둘 다 여러 α로 학습해보고 검증 데이터에서 성능이 가장 좋은 값을 남긴다. 여기서 LassoCV가 거의 0에 가까운 α를 고른 건 읽을 만한 신호다. 이 데이터는 변수 세 개가 모두 유의미해서 지울 게 없고, 그러니 Lasso의 장기가 발휘될 자리가 아니라는 뜻이다. 쓸모없는 변수가 섞인 데이터라면 훨씬 큰 α가 뽑힌다.

## 규제를 걸기 전에

**스케일링이 먼저다.** 규제는 가중치의 크기에 값을 매기는데, 가중치의 크기는 변수의 단위에 따라 달라진다. 면적(42에서 156)의 계수는 작게, 방 수(1에서 5)의 계수는 크게 나오니 같은 λ가 두 변수에 전혀 다른 세기로 걸린다. `Pipeline`으로 묶어두면 이 순서를 놓칠 일이 없다.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

pipe = Pipeline([('scaler', StandardScaler()), ('ridge', Ridge(alpha=1.0))])
```

**과적합이 없으면 규제해도 얻을 게 없다.** 데이터 수에 비해 특성이 적고 훈련 오차와 검증 오차가 붙어 있다면 규제는 편향만 더하고 끝난다. 학습 곡선으로 과적합을 먼저 확인하고 걸어야 한다.

**모델마다 규제 방식이 다르다.** L1/L2 패널티는 가중치를 갖는 선형 모델의 도구다. 트리 기반 모델은 가중치가 없으니 `max_depth` 제한이나 가지치기 같은 자기 방식의 규제를 쓴다.

## 마치며

규제는 모델에게 데이터를 다 맞추지 말라고 강제하는 장치다. 훈련 오차를 조금 내주고 그 대가로 새 데이터에 대한 예측력을 지킨다.

Ridge와 Lasso를 가르는 건 패널티 식의 사소한 차이가 아니라 제약 영역의 모양이다. 원은 매끄러워서 해가 축을 비껴가고, 마름모는 꼭짓점이 축 위에 있어서 해가 그리로 빨려 들어간다. Lasso가 변수를 골라내는 능력은 절댓값이라는 함수 모양에서 자동으로 따라 나온 것이지 따로 붙인 기능이 아니다. 그래서 L1 패널티는 선형 회귀 바깥에서도, 계수를 희소하게 만들고 싶은 자리마다 같은 방식으로 쓰인다.

다음 글에서는 로지스틱 회귀와 다른 방식으로 분류에 접근하는 모델을 본다. 확률을 직접 계산해서 분류하는 나이브 베이즈다.

## 함께 보면 좋은 글

- [다중 선형 회귀](/ml/multiple-linear-regression/) : 변수를 늘렸을 때 계수가 흔들리는 다중공선성
- [편향-분산](/ml/bias-variance/) : 규제가 무엇을 내주고 무엇을 얻는지의 배경
- [피처 선택](/ml/feature-selection/) : Lasso 말고도 변수를 골라내는 여러 방법

## 참고자료

- [Andrew Ng, Machine Learning Specialization: Regularization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn, Ridge Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html)
- [Scikit-learn, Lasso Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Lasso.html)
- [An Introduction to Statistical Learning, Chapter 6 (James, Witten, Hastie, Tibshirani)](https://www.statlearning.com/)
