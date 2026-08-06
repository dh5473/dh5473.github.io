---
date: '2026-01-06'
title: '변수가 늘어나면 달라지는 것들, 다중 선형 회귀'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 6
tags: ['Multiple Linear Regression', '다중 선형 회귀', '다중공선성', '정규 방정식', 'Feature Scaling', '머신러닝 기초']
summary: '변수가 여러 개인 선형 회귀에서 달라지는 세 가지. 정규 방정식으로 해를 한 번에 구하는 법, 겹친 변수가 계수 해석을 무너뜨리는 다중공선성, 스케일 차이가 경사하강법의 수렴을 막는 이유.'
thumbnail: './thumbnail.png'
---

집값은 면적 하나로 정해지지 않는다. 방 개수, 층수, 역까지의 거리, 건축 연도까지 변수가 수십 개일 수 있다. 변수를 하나에서 여러 개로 늘려도 모델의 생김새는 거의 그대로다. 각 변수에 가중치를 붙이고 전부 더하면 된다.

달라지는 건 푸는 방법과, 그 과정에서 새로 생기는 함정이다. 해를 한 번에 구하는 공식이 생기고, 서로 겹치는 변수가 섞이면 계수를 읽을 수 없게 되고, 변수마다 값의 범위가 다르면 경사하강법이 수렴하지 못한다. 이 세 가지를 차례로 본다.

## 여러 변수를 벡터로 묶는다

$$\hat{y} = w_1 x_1 + w_2 x_2 + \cdots + w_n x_n + b$$

각 $w_j$는 "다른 변수를 고정했을 때 $x_j$가 1 늘면 $\hat{y}$가 $w_j$만큼 변한다"는 뜻이다. 면적이 1평 늘 때의 가격 상승분과 방이 하나 늘 때의 상승분을 따로 떼어 볼 수 있다.

변수가 많아지면 항을 일일이 쓰기 어렵다. 데이터 하나의 특성을 벡터 $\mathbf{x}$, 가중치를 벡터 $\mathbf{w}$로 묶으면 예측은 내적 하나로 줄어든다.

$$\hat{y} = \mathbf{x} \cdot \mathbf{w} + b$$

데이터가 $m$개면 행이 데이터이고 열이 특성인 $(m \times n)$ 행렬 $X$로 전부 한 번에 계산한다.

$$\hat{\mathbf{y}} = X\mathbf{w} + b$$

코드로는 `y_pred = X @ w + b` 한 줄이다. 행렬 곱이 모든 데이터의 예측을 동시에 처리한다. $n$은 특성 수, $m$은 데이터 수, $X$는 $(m \times n)$이라는 이 표기는 scikit-learn과 PyTorch가 공통으로 쓰는 규약이다.

아래 예제는 전부 아파트 20채 데이터를 쓴다. 면적(평), 방 수, 층수로 가격(억원)을 예측한다.

```python
import numpy as np

X = np.array([
    [142, 5, 23], [91, 2, 20], [132, 4,  3], [54, 2,  5],
    [146, 4, 19], [111, 5,  7], [100, 1, 21], [60, 4,  9],
    [142, 2,  7], [122, 5, 18], [126, 4,  4], [114, 1, 14],
    [114, 1, 18], [127, 3,  9], [156, 3, 21], [139, 2,  2],
    [143, 4, 20], [63, 4, 15], [42, 3,  7],  [61, 4, 12],
], dtype=float)

y = np.array([7.56, 4.63, 6.45, 3.34, 6.88, 6.80, 5.25, 4.84, 5.97, 7.28,
              6.06, 4.23, 5.01, 5.83, 6.70, 5.45, 6.85, 4.73, 3.57, 4.84])
```

## 정규 방정식으로 해를 한 번에 구한다

선형 회귀의 비용 함수는 가중치에 대한 2차식이다. 미분해서 0으로 두면 해가 닫힌 형태로 떨어진다. 편향 $b$를 가중치 안으로 흡수시키려고 $X$ 맨 앞에 1로 채운 열을 붙이고, 그렇게 확장한 가중치를 $\theta$라 하면:

$$\theta = (X^\top X)^{-1} X^\top y$$

```python
X_b = np.c_[np.ones(len(X)), X]          # 맨 앞에 1 열 추가
theta = np.linalg.inv(X_b.T @ X_b) @ X_b.T @ y
print(np.round(theta, 4))
```

```text
[1.0321 0.0247 0.4909 0.0262]
```

학습률도 반복 횟수도 없다. 한 줄로 최적해가 나온다. `LinearRegression`이 내부에서 하는 일도 이것이다(정확히는 역행렬을 직접 구하는 대신 수치적으로 더 안정한 최소제곱 분해를 쓴다). 그런데도 실무가 경사하강법을 쓰는 이유는 두 가지다. $(X^\top X)^{-1}$의 계산량이 특성 수의 세제곱, 즉 $O(n^3)$이라 특성이 수만 개면 감당이 안 된다. 그리고 $X^\top X$의 역행렬이 아예 존재하지 않는 경우가 있다.

## 겹친 변수가 계수를 무너뜨린다

면적을 평으로도 넣고 m²로도 넣어보자. 두 열은 3.3058을 곱한 관계라 사실상 같은 정보다.

```python
area_m2 = np.round(X[:, 0] * 3.3058, 1)   # 1평 = 3.3058 m²
X2 = np.c_[X, area_m2]

X2_b = np.c_[np.ones(len(X2)), X2]
theta2 = np.linalg.inv(X2_b.T @ X2_b) @ X2_b.T @ y
print(np.round(theta2, 3))
```

```text
[ 1.023 -1.492  0.495  0.026  0.459]
```

면적(평)의 계수가 0.025에서 **-1.492** 로 뒤집혔다. 그대로 읽으면 "면적이 넓을수록 집값이 떨어진다"는 말이 된다. 사실일 리 없다. 반대편에서 m² 열의 계수 0.459가 상쇄하고 있을 뿐이다. 면적이 1평 늘면 m² 열도 3.3058 늘어나니 실제 효과는 이렇게 합쳐진다.

$$-1.492 + 0.459 \times 3.3058 = 0.025$$

원래 계수와 같다. 예측 성능도 멀쩡하다(R² 0.9508). 무너진 건 예측이 아니라 계수 해석이다.

원인은 정규 방정식에 있다. 두 열이 정확히 비례하면 $X^\top X$의 행렬식이 0이라 역행렬이 없다. 같은 예측을 내는 계수 조합이 무한히 많아서 해가 하나로 정해지지 않는다. 위에서 계산이 된 건 m²를 0.1 단위로 반올림하면서 미세한 차이가 남은 덕분이다.

그 차이가 해를 하나로 정해주기는 해도 안정시키지는 못한다. `y`에 표준편차 0.01짜리 잡음을 얹고 200번 다시 풀어보면 면적(평)의 계수는 -2.29에서 -0.86까지, m² 계수는 0.27에서 0.70까지 흩어진다. 반면 겹치지 않은 방 수는 0.490에서 0.500, 층수는 0.025에서 0.027 사이에 머문다. 겹친 두 열에서만 계수가 데이터의 미세한 흔들림에 끌려다니는 것이다. 이 상태를 **다중공선성(Multicollinearity)** 이라 한다.

진단은 VIF(Variance Inflation Factor)로 한다. 변수 $x_j$를 나머지 변수들로 회귀했을 때의 결정계수 $R_j^2$로 정의한다.

$$\mathrm{VIF}_j = \frac{1}{1 - R_j^2}$$

다른 변수들로 $x_j$가 잘 설명될수록 $R_j^2$가 1에 가까워지고 VIF가 폭발한다. 보통 10을 넘으면 의심하고 들여다본다.

```python
from sklearn.linear_model import LinearRegression

def vif(A):
    out = []
    for j in range(A.shape[1]):
        others = np.delete(A, j, axis=1)
        r2 = LinearRegression().fit(others, A[:, j]).score(others, A[:, j])
        out.append(1 / (1 - r2))
    return np.round(out, 2)

print(vif(X))    # [1.06 1.01 1.05]
print(vif(X2))   # [15206498.59  1.14  1.08  15206537.23]
```

겹친 열 하나를 지우는 게 가장 깔끔한 해결이다. 지우기 아깝다면 가중치 크기 자체에 패널티를 거는 규제를 쓴다. 표준화한 `X2`에 `Ridge(alpha=1.0)`을 걸면 면적 두 열의 계수가 0.419씩 고르게 나뉘고, 부호가 뒤집히는 일도 사라진다.

## 스케일이 다르면 수렴하지 못한다

특성이 너무 많아 정규 방정식을 못 쓰면 경사하강법으로 돌아온다. 다변수 버전에서 달라지는 건 `dw`가 스칼라에서 벡터가 된다는 점뿐이다.

```python
w = np.zeros(X.shape[1])
b, lr, m = 0.0, 0.00001, len(y)

for epoch in range(5001):
    error = X @ w + b - y                 # (20,)
    if epoch in (0, 5000):
        print(f"{epoch:5d} | cost={np.mean(error**2):.4f} | w={np.round(w, 4)}")
    w -= lr * (2/m) * (X.T @ error)       # (3,) = (3,20) @ (20,)
    b -= lr * (2/m) * np.sum(error)
```

```text
    0 | cost=32.9157 | w=[0. 0. 0.]
 5000 | cost=0.6362 | w=[0.0396 0.127  0.0549]
```

5,000번을 돌려도 비용이 0.636에서 멈춘다. 정규 방정식이 알려준 최적해에서의 비용은 0.069고, 방 수의 계수는 0.127까지밖에 못 올라갔는데 정답은 0.491이다. 원인은 기울기 크기다. `X.T @ error`에서 면적 열은 값이 42~156이라 기울기가 크고, 방 수 열은 1~5라 기울기가 작다. 학습률은 하나뿐인데 변수마다 필요한 보폭이 수십 배씩 차이 난다. 면적에 맞추면 방 수가 거의 안 움직이고, 방 수에 맞추면 면적이 발산한다.

비용 함수의 등고선으로 보면 이 상황이 그대로 드러난다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 560" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스케일이 다른 변수의 비용 함수 등고선은 가늘고 긴 타원이라 경사하강법이 지그재그로 내려가고, 표준화 후에는 등고선이 원에 가까워져 최저점으로 곧장 내려간다">
<defs>
<marker id="mlr1ArrowBad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-danger, #cb2121)"/>
</marker>
<marker id="mlr1ArrowGood" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-success, #107836)"/>
</marker>
</defs>
<!-- 위 패널: 스케일 전 -->
<text x="200" y="28" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">스케일 전</text>
<text x="200" y="52" text-anchor="middle" font-size="15" fill="var(--text-muted, #6d6762)">등고선이 가늘고 긴 타원</text>
<ellipse cx="200" cy="150" rx="160" ry="46" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<ellipse cx="200" cy="150" rx="120" ry="34" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<ellipse cx="200" cy="150" rx="80" ry="22" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<ellipse cx="200" cy="150" rx="40" ry="11" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<polyline points="52,120 76,174 104,118 132,184 158,124 180,178 194,134 200,150" fill="none" stroke="var(--text-danger, #cb2121)" stroke-width="2" marker-end="url(#mlr1ArrowBad)"/>
<circle cx="52" cy="120" r="4" fill="var(--text-muted, #6d6762)"/>
<text x="52" y="104" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">시작</text>
<circle cx="200" cy="150" r="5" fill="var(--primary, #0a756c)"/>
<text x="200" y="218" text-anchor="middle" font-size="14" fill="var(--primary, #0a756c)">최저점</text>
<text x="200" y="244" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">지그재그 경로, 수렴 느림</text>
<line x1="40" y1="272" x2="360" y2="272" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널: 스케일 후 -->
<text x="200" y="302" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">스케일 후</text>
<text x="200" y="326" text-anchor="middle" font-size="15" fill="var(--text-muted, #6d6762)">등고선이 원에 가까움</text>
<circle cx="200" cy="428" r="78" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="200" cy="428" r="58" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="200" cy="428" r="39" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<circle cx="200" cy="428" r="20" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.6" stroke-width="1.2"/>
<line x1="140" y1="368" x2="196" y2="424" stroke="var(--text-success, #107836)" stroke-width="2" marker-end="url(#mlr1ArrowGood)"/>
<circle cx="140" cy="368" r="4" fill="var(--text-muted, #6d6762)"/>
<text x="140" y="352" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">시작</text>
<circle cx="200" cy="428" r="5" fill="var(--primary, #0a756c)"/>
<text x="200" y="524" text-anchor="middle" font-size="14" fill="var(--primary, #0a756c)">최저점</text>
<text x="200" y="550" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">곧장 내려감, 수렴 빠름</text>
</svg>
</div>

해결은 모든 변수를 비슷한 범위로 맞추는 것이다. 표준화(Standardization)는 각 열에서 그 열의 평균을 빼고 표준편차로 나눈다.

$$z = \frac{x - \mu}{\sigma}$$

```python
X_mean, X_std = X.mean(axis=0), X.std(axis=0)
X_scaled = (X - X_mean) / X_std

w = np.zeros(3)
b, lr = 0.0, 0.01                         # 학습률을 1,000배 키울 수 있다

for epoch in range(1001):
    error = X_scaled @ w + b - y
    w -= lr * (2/m) * (X_scaled.T @ error)
    b -= lr * (2/m) * np.sum(error)
```

| | 스케일링 전 (lr=0.00001) | 스케일링 후 (lr=0.01) |
|---|---|---|
| 100 epoch | cost 1.067 | cost 0.639 |
| 500 epoch | cost 0.969 | cost 0.069 |
| 5,000 epoch | cost 0.636 | cost 0.069 |
| 수렴 시점 | 수렴 못 함 | 300 epoch 부근 |

학습률을 1,000배 키울 수 있고, 수백 번 만에 끝난다. 스케일링 없이 5,000번을 돌려도 닿지 못한 지점이다.

학습이 끝난 가중치 `[0.856, 0.645, 0.178]`은 원래 단위가 아니라 표준화된 단위다. 원래 스케일로 되돌리려면 표준편차로 나눈다.

```python
w_original = w / X_std
b_original = b - np.sum(w * X_mean / X_std)
print(np.round(w_original, 4), round(b_original, 4))
```

```text
[0.0247 0.4909 0.0262] 1.0321
```

정규 방정식의 답과 소수 넷째 자리까지 같다. 면적 1평에 약 250만원, 방 하나에 약 4,900만원, 한 층에 약 260만원이다.

:::warning

**계수 크기로 변수 중요도를 비교하려면 스케일을 맞춰야 한다**

원래 단위 계수만 보면 방 수(0.49)가 면적(0.025)의 20배라 방 수가 압도적으로 중요해 보인다. 하지만 면적은 42에서 156까지 움직이고 방 수는 1에서 5까지밖에 못 움직인다. 각자 표준편차 1만큼 움직였을 때의 효과로 환산하면 면적 0.856, 방 수 0.645로 순서가 뒤집힌다. 단위가 제각각인 계수를 나란히 놓고 크기를 비교하면 안 된다.

:::

## sklearn에서는 파이프라인으로

```python
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

pipe = Pipeline([('scaler', StandardScaler()), ('lr', LinearRegression())])
pipe.fit(X, y)

print(f"R2 = {pipe.score(X, y):.4f}")             # 0.9506
print(pipe.predict(np.array([[85, 3, 10]])))      # [4.869] → 4.87억원
```

세 변수로 가격 변동의 95%를 설명한다. `LinearRegression`은 정규 방정식을 쓰니 스케일링 없이도 같은 해를 구하지만, 파이프라인에 묶어두면 스케일러의 기준이 모델과 함께 움직인다. train 데이터로 fit한 평균과 표준편차를 test에도 그대로 써야 하는데, 둘을 따로 관리하면 이 순서를 놓치기 쉽다. `pipe.predict()`는 전처리와 예측을 항상 같은 순서로 적용한다. 다만 스케일링이 늘 필요한 건 아니다. 트리 기반 모델은 분할 기준이 값의 크기 비교라서 단위를 어떻게 바꾸든 같은 분할이 나온다.

## 마치며

변수가 여러 개가 되면 모델의 식보다 그 앞뒤가 결과를 좌우한다. 정규 방정식은 반복 없이 정확한 해를 주지만 특성이 많아지면 못 쓰고, 겹친 변수 앞에서는 아예 풀리지 않는다. 경사하강법은 그 제약이 없는 대신 변수들의 스케일이 맞아야 움직인다.

계수를 읽는 일도 마찬가지다. 이 데이터에서 원래 단위 계수는 방 수를 1등으로 지목하고, 표준화 단위 계수는 면적을 1등으로 지목한다. 둘 다 같은 모델의 같은 해인데 결론이 다르다. 어느 단위에서 나온 숫자인지 확인하지 않으면 계수 해석은 언제든 뒤집힌다.

다음 글에서는 연속값 예측이 아니라 "Yes 또는 No"를 판단하는 분류 문제로 넘어간다. 선형 회귀에 시그모이드 함수 하나를 얹어 확률을 출력하는 로지스틱 회귀다.

## 함께 보면 좋은 글

- [선형 회귀](/ml/linear-regression/) : 변수 하나짜리 직선을 데이터에 맞추는 기본형
- [경사하강법](/ml/gradient-descent/) : 학습률과 반복으로 비용 함수를 내려가는 절차
- [규제](/ml/regularization/) : 가중치 크기에 패널티를 걸어 겹친 변수의 계수를 붙잡는 방법

## 참고자료

- [Andrew Ng, Machine Learning Specialization: Multiple Features (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn, StandardScaler Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html)
- [Scikit-learn, LinearRegression Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html)
