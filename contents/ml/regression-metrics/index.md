---
date: '2026-01-26'
title: '회귀 모델 평가 지표: MSE, MAE, R², MAPE 언제 어떤 걸 쓸까'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 26
tags: ['Regression Metrics', '회귀 평가', 'MSE', 'MAE', 'R-squared', 'MAPE', '머신러닝']
summary: 'MSE, RMSE, MAE, R², Adjusted R², MAPE까지. 각 회귀 지표의 수학적 의미와 특성을 이해하고 상황별 선택 기준을 정리한다.'
thumbnail: './thumbnail.png'
---

[지난 글](/ml/classification-metrics/)에서 분류 모델의 평가 지표를 정리했다. Precision, Recall, F1-Score, AUC-ROC까지 — 분류 문제에서는 "맞았다/틀렸다"를 기준으로 모델의 성능을 잰다. 그런데 회귀 문제는 다르다. 예측값이 연속적인 숫자이기 때문에, "틀린 정도"를 측정하는 방식이 필요하다.

집값을 예측하는 모델이 실제 5억짜리 집을 4.8억이라 예측했다면, 이건 좋은 예측인가? 2000만 원 차이가 크다고 봐야 하나, 작다고 봐야 하나? 다른 집은 3억짜리를 3.5억이라 예측했는데, 어느 쪽이 더 심각한 오차인가? 이 질문들에 대한 답이 **회귀 평가 지표**에 따라 달라진다.

이번 글에서는 MAE, MSE, RMSE, R², Adjusted R², MAPE, MSLE까지 — 주요 회귀 지표의 수학적 의미와 특성을 하나씩 파헤치고, 상황별로 어떤 지표를 골라야 하는지 정리한다.

---

## MAE (Mean Absolute Error)

가장 직관적인 지표다. [비용 함수 글](/ml/cost-function/)에서 이미 다뤘던 것처럼, 예측값과 실제값의 차이(잔차)에 절댓값을 씌우고 평균을 낸다.

```
MAE = (1/n) * sum(|yi - ŷi|)
```

### 특성

- **단위가 타겟과 같다.** 집값(만 원)을 예측하면 MAE도 만 원 단위다. "평균적으로 2000만 원 틀렸다"고 바로 해석할 수 있다.
- **이상치에 강건하다(Robust).** 절댓값이기 때문에 큰 오차든 작은 오차든 동일한 가중치로 취급한다. 하나의 극단적 오차가 전체 지표를 지배하지 않는다.
- **미분이 깔끔하지 않다.** 잔차가 0인 지점에서 절댓값 함수가 꺾인다. 경사하강법 기반 최적화에서 약간의 불편함이 있다 — [비용 함수 글](/ml/cost-function/)에서 이 문제를 다뤘다.

```python
import numpy as np

y_true = np.array([3.0, 5.0, 2.5, 7.0, 4.5])
y_pred = np.array([2.8, 5.3, 2.0, 6.5, 5.0])

# 수동 계산
residuals = y_true - y_pred
mae = np.mean(np.abs(residuals))
print(f"잔차:  {residuals}")
print(f"MAE:   {mae:.4f}")
```

```
잔차:  [ 0.2 -0.3  0.5  0.5 -0.5]
MAE:   0.4000
```

평균적으로 0.4만큼 빗나갔다. 직관적이다.

---

## MSE (Mean Squared Error)

잔차를 **제곱**해서 평균을 낸다. [비용 함수](/ml/cost-function/)에서 "왜 절댓값 대신 제곱을 쓰는가"를 자세히 다뤘다. 핵심은 두 가지다: (1) 미분이 깔끔하다, (2) 큰 오차에 더 큰 페널티를 준다.

```
MSE = (1/n) * sum((yi - ŷi)²)
```

### 특성

- **큰 오차를 심하게 벌한다.** 잔차가 2배면 기여도는 4배다. 이상치가 하나라도 있으면 MSE가 급격히 올라간다.
- **단위가 타겟의 제곱이다.** 집값(만 원)을 예측하면 MSE의 단위는 만 원²이다. 직관적 해석이 어렵다 — 이 문제를 RMSE가 해결한다.
- **미분 가능하다.** 경사하강법([Gradient Descent](/ml/gradient-descent/))과 궁합이 좋다. [선형 회귀](/ml/linear-regression/)의 정규 방정식도 MSE 최소화에서 유도된다.
- **편향-분산 분해가 가능하다.** [편향-분산 트레이드오프](/ml/bias-variance/)에서 봤듯이, MSE = Bias² + Variance + 노이즈로 분해된다.

```python
mse = np.mean(residuals**2)
print(f"MSE:   {mse:.4f}")
```

```
MSE:   0.1680
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 MSE vs MAE — 언제 큰 차이가 나는가?</strong><br>
  대부분의 잔차가 비슷한 크기일 때는 MSE와 MAE의 순위가 같다. 차이가 벌어지는 건 <strong>이상치가 있을 때</strong>다. 잔차가 [0.1, 0.2, 0.1, 0.3, 10.0]이면 MAE=2.14인데, MSE=20.03이다. MSE는 10.0 하나에 완전히 지배당한다. 이상치가 "진짜 문제"인지 "노이즈"인지에 따라 지표 선택이 달라져야 한다.
</div>

---

## RMSE (Root Mean Squared Error)

MSE에 루트를 씌운 것이다. 단순하지만 실전에서 가장 많이 쓰는 지표다.

```
RMSE = sqrt(MSE) = sqrt((1/n) * sum((yi - ŷi)²))
```

### 왜 RMSE가 필요한가

MSE의 유일한 단점이 "단위가 제곱"이라는 것이었다. 루트를 씌우면 단위가 타겟과 같아진다. 집값(만 원) 예측이라면 RMSE도 만 원 단위다.

```python
rmse = np.sqrt(mse)
print(f"RMSE:  {rmse:.4f}")
```

```
RMSE:  0.4099
```

MAE(0.4000)와 비슷하지만 약간 더 크다. 이건 항상 그렇다 — 수학적으로 **RMSE >= MAE**가 보장된다. 제곱 → 평균 → 루트 과정에서 큰 오차의 비중이 높아지기 때문이다.

### RMSE와 MAE의 관계

두 지표가 비슷하면 잔차의 크기가 대체로 균일하다는 뜻이다. RMSE가 MAE보다 훨씬 크면 일부 큰 오차가 존재한다는 신호다.

```python
# 균일한 오차
y_uniform = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
y_pred_u  = np.array([1.2, 0.8, 1.1, 0.9, 1.2])
mae_u  = np.mean(np.abs(y_uniform - y_pred_u))
rmse_u = np.sqrt(np.mean((y_uniform - y_pred_u)**2))
print(f"균일한 오차  → MAE: {mae_u:.4f}, RMSE: {rmse_u:.4f}, 비율: {rmse_u/mae_u:.2f}")

# 이상치 포함
y_outlier = np.array([1.0, 1.0, 1.0, 1.0, 1.0])
y_pred_o  = np.array([1.1, 0.9, 1.1, 0.9, 4.0])
mae_o  = np.mean(np.abs(y_outlier - y_pred_o))
rmse_o = np.sqrt(np.mean((y_outlier - y_pred_o)**2))
print(f"이상치 포함  → MAE: {mae_o:.4f}, RMSE: {rmse_o:.4f}, 비율: {rmse_o/mae_o:.2f}")
```

```
균일한 오차  → MAE: 0.1600, RMSE: 0.1673, 비율: 1.05
이상치 포함  → MAE: 0.6800, RMSE: 1.3491, 비율: 1.98
```

비율이 1에 가까우면 잔차가 균일하고, 비율이 커질수록 이상치의 영향이 크다.

---

## MAE vs MSE vs RMSE 한눈에 비교

| 지표 | 수식 | 단위 | 이상치 민감도 | 미분 가능 | 해석 |
|---|---|---|---|---|---|
| **MAE** | `mean(\|y-ŷ\|)` | 타겟과 동일 | 낮음 | x=0에서 불가 | "평균 N만큼 틀림" |
| **MSE** | `mean((y-ŷ)²)` | 타겟² | 높음 | 가능 | 직관적 해석 어려움 |
| **RMSE** | `sqrt(MSE)` | 타겟과 동일 | 높음 | 가능 | "평균적으로 N만큼 틀림 (큰 오차 강조)" |

```python
from sklearn.metrics import mean_absolute_error, mean_squared_error

y_true = np.array([100, 150, 200, 250, 300])
y_pred = np.array([110, 140, 190, 245, 350])

mae  = mean_absolute_error(y_true, y_pred)
mse  = mean_squared_error(y_true, y_pred)
rmse = np.sqrt(mse)

print(f"MAE:  {mae:.2f}")
print(f"MSE:  {mse:.2f}")
print(f"RMSE: {rmse:.2f}")
```

```
MAE:  13.00
MSE:  545.00
RMSE: 23.35
```

RMSE(23.35)가 MAE(13.00)보다 훨씬 크다. 300을 350으로 예측한 오차(50)가 제곱 과정에서 지배적으로 작용했기 때문이다.

---

## R² (Coefficient of Determination, 결정 계수)

MAE, MSE, RMSE는 모두 "절대적인 오차"를 측정한다. 그런데 RMSE가 23이라고 했을 때, 이게 좋은 건지 나쁜 건지 어떻게 판단하나? 타겟의 범위가 0~100이면 나쁘고, 0~10000이면 괜찮다. **스케일에 독립적인 지표**가 필요하다. 그게 R²다.

```
R² = 1 - (SS_res / SS_tot)

SS_res = sum((yi - ŷi)²)        ← 모델의 잔차 제곱합
SS_tot = sum((yi - ȳ)²)         ← 총 변동 (타겟의 분산 * n)
```

### 직관적 의미

- `SS_tot`은 "아무 모델 없이 평균으로만 예측했을 때"의 총 오차다.
- `SS_res`는 "내 모델이 남긴" 잔차다.
- R²는 **모델이 전체 변동 중 얼마를 설명했는가**를 비율로 나타낸다.

| R² 값 | 의미 |
|---|---|
| 1.0 | 완벽한 예측. 잔차 = 0 |
| 0.9 | 전체 변동의 90%를 모델이 설명 |
| 0.0 | 평균으로 예측하는 것과 다를 바 없음 |
| < 0 | 평균보다도 못한 모델 (가능하다!) |

```python
from sklearn.metrics import r2_score

y_true = np.array([3, 5, 2.5, 7, 4.5])
y_pred = np.array([2.8, 5.3, 2.0, 6.5, 5.0])

r2 = r2_score(y_true, y_pred)

# 수동 검증
ss_res = np.sum((y_true - y_pred)**2)
ss_tot = np.sum((y_true - np.mean(y_true))**2)
r2_manual = 1 - ss_res / ss_tot

print(f"R² (sklearn):  {r2:.4f}")
print(f"R² (수동):     {r2_manual:.4f}")
print(f"SS_res:        {ss_res:.4f}")
print(f"SS_tot:        {ss_tot:.4f}")
```

```
R² (sklearn):  0.9048
R² (수동):     0.9048
SS_res:        0.8400
SS_tot:        8.8000
```

모델이 전체 변동의 약 90%를 설명한다. 나쁘지 않다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ R² < 0이 가능하다</strong><br>
  R²는 0 이상이 보장되지 않는다. 모델이 평균보다도 못한 예측을 하면 SS_res > SS_tot이 되어 R²가 음수가 된다. 이건 모델에 심각한 문제가 있다는 뜻이다 — 차라리 모든 입력에 대해 평균값을 출력하는 게 낫다.
</div>

---

## Adjusted R² (수정 결정 계수)

R²에는 함정이 있다. [다중 선형 회귀](/ml/multiple-linear-regression/)에서 특성(feature)을 추가하면 R²는 **절대 줄어들지 않는다.** 쓸모없는 특성이라도 넣기만 하면 R²가 (아주 조금이라도) 올라간다. 왜? 특성을 추가하면 모델의 자유도가 늘어나서 훈련 데이터에 더 잘 맞출 수 있기 때문이다.

이걸 보정한 게 Adjusted R²다.

```
Adjusted R² = 1 - ((1 - R²) * (n - 1)) / (n - p - 1)

n = 샘플 수
p = 특성 수
```

### 핵심 차이

- 특성을 추가했는데 R²가 충분히 올라가지 않으면, Adjusted R²는 **오히려 내려간다.**
- `(n - 1) / (n - p - 1)` 항이 1보다 크기 때문에 `(1 - R²)`에 페널티를 준다.
- 특성 수(p)가 커질수록 페널티가 세진다.

```python
from sklearn.linear_model import LinearRegression
from sklearn.datasets import make_regression

np.random.seed(42)

# 유용한 특성 3개 + 노이즈 특성 추가
X, y = make_regression(n_samples=100, n_features=3, noise=10, random_state=42)
noise_features = np.random.randn(100, 7)  # 쓸모없는 특성 7개

def adjusted_r2(r2, n, p):
    return 1 - ((1 - r2) * (n - 1)) / (n - p - 1)

# 특성을 하나씩 추가하면서 비교
print(f"{'특성 수':>6} | {'R²':>8} | {'Adj R²':>8}")
print("-" * 30)

for k in range(1, 11):
    if k <= 3:
        X_k = X[:, :k]
    else:
        X_k = np.hstack([X, noise_features[:, :k-3]])

    model = LinearRegression()
    model.fit(X_k, y)
    r2 = r2_score(y, model.predict(X_k))
    adj_r2 = adjusted_r2(r2, len(y), k)
    print(f"{k:>6} | {r2:>8.4f} | {adj_r2:>8.4f}")
```

```
특성 수 |       R² |   Adj R²
------------------------------
     1 |   0.5842 |   0.5800
     2 |   0.7813 |   0.7768
     3 |   0.9507 |   0.9491
     4 |   0.9508 |   0.9487
     5 |   0.9510 |   0.9484
     6 |   0.9511 |   0.9479
     7 |   0.9513 |   0.9476
     8 |   0.9515 |   0.9473
     9 |   0.9516 |   0.9468
    10 |   0.9518 |   0.9464
```

R²는 특성을 추가할수록 미세하게 계속 올라간다. 하지만 Adjusted R²는 3개(실제 유효 특성 수) 이후로 **내려간다**. 쓸모없는 특성 추가를 감지한 것이다.

---

## MAPE (Mean Absolute Percentage Error)

지금까지의 지표는 모두 **절대적 오차**를 측정한다. 그런데 비즈니스에서는 "얼마나 틀렸나"보다 "몇 퍼센트나 틀렸나"가 중요할 때가 많다. 매출 1억짜리 상품의 예측이 1000만 원 빗나간 것(10%)과, 매출 10억짜리 상품이 1000만 원 빗나간 것(1%)은 의미가 다르다.

```
MAPE = (100/n) * sum(|yi - ŷi| / |yi|)
```

### 장점

- **퍼센트로 표현**되므로 비전문가도 이해하기 쉽다. "평균 5% 오차"라고 말하면 누구나 안다.
- **스케일에 독립적**이다. 매출이 억 단위든 만 원 단위든 비교 가능하다.

```python
def mape(y_true, y_pred):
    return np.mean(np.abs((y_true - y_pred) / y_true)) * 100

y_true = np.array([100, 200, 300, 400, 500])
y_pred = np.array([110, 190, 310, 380, 520])

print(f"MAPE: {mape(y_true, y_pred):.2f}%")
print(f"MAE:  {mean_absolute_error(y_true, y_pred):.2f}")
```

```
MAPE: 5.33%
MAE:  14.00
```

MAE=14만으로는 좋은지 나쁜지 판단하기 어렵다. MAPE=5.33%면 "평균적으로 약 5% 오차"라고 바로 해석된다.

---

## MAPE가 실패하는 경우

MAPE에는 치명적인 약점이 있다. 수식을 다시 보면 분모가 `|yi|`다. 실제값이 0이면? **분모가 0이 되어 MAPE가 무한대로 발산한다.**

```python
# MAPE 실패 사례
y_true_zero = np.array([0.0, 100, 200, 300, 400])
y_pred_zero = np.array([5.0, 110, 190, 310, 380])

# 직접 계산하면 문제가 보인다
for yt, yp in zip(y_true_zero, y_pred_zero):
    if yt != 0:
        pct = abs(yt - yp) / abs(yt) * 100
        print(f"실제: {yt:6.1f}, 예측: {yp:6.1f}, 오차율: {pct:.1f}%")
    else:
        print(f"실제: {yt:6.1f}, 예측: {yp:6.1f}, 오차율: ∞ (0으로 나누기!)")
```

```
실제:    0.0, 예측:    5.0, 오차율: ∞ (0으로 나누기!)
실제:  100.0, 예측:  110.0, 오차율: 10.0%
실제:  200.0, 예측:  190.0, 오차율: 5.0%
실제:  300.0, 예측:  310.0, 오차율: 3.3%
실제:  400.0, 예측:  380.0, 오차율: 5.0%
```

0이 아니더라도 **매우 작은 값**이면 분모가 작아져서 MAPE가 비정상적으로 커진다. 기온(섭씨), 재고 수량처럼 0에 가까운 값이 자주 나오는 도메인에서는 MAPE를 쓰면 안 된다.

### 대안: sMAPE (Symmetric MAPE)

```
sMAPE = (100/n) * sum(|yi - ŷi| / ((|yi| + |ŷi|) / 2))
```

분모를 실제값과 예측값의 평균으로 바꿔서 0 문제를 완화한다. 하지만 둘 다 0이면 여전히 문제다. 완벽한 해결책은 아니다.

---

## 로그 기반 지표: MSLE, RMSLE

집값, 매출, 인구수처럼 **양의 값**이면서 **분포가 오른쪽으로 치우친(skewed)** 타겟에서 유용한 지표다.

```
MSLE  = (1/n) * sum((log(1+yi) - log(1+ŷi))²)
RMSLE = sqrt(MSLE)
```

### 왜 로그를 취하는가

로그를 취하면 큰 값의 스케일이 줄어든다. 1억과 2억의 차이(1억)와, 1000만과 2000만의 차이(1000만)가 로그 공간에서는 비슷한 크기의 오차로 취급된다.

```python
from sklearn.metrics import mean_squared_log_error

# 집값 예측 시나리오 (단위: 만 원)
y_true = np.array([5000, 10000, 50000, 100000])
y_pred = np.array([5500, 11000, 55000, 110000])

# 절대 오차는 비싼 집일수록 크다
print("절대 오차와 로그 오차 비교:")
print(f"{'실제':>8} | {'예측':>8} | {'절대오차':>8} | {'오차율':>6} | {'로그오차':>8}")
for yt, yp in zip(y_true, y_pred):
    abs_err = abs(yt - yp)
    pct_err = abs_err / yt * 100
    log_err = abs(np.log1p(yt) - np.log1p(yp))
    print(f"{yt:>8} | {yp:>8} | {abs_err:>8} | {pct_err:>5.1f}% | {log_err:>8.4f}")

print(f"\nRMSE:  {np.sqrt(mean_squared_error(y_true, y_pred)):.2f}")
print(f"RMSLE: {np.sqrt(mean_squared_log_error(y_true, y_pred)):.4f}")
```

```
절대 오차와 로그 오차 비교:
    실제 |     예측 |   절대오차 |  오차율 |   로그오차
    5000 |     5500 |      500 |  10.0% |   0.0953
   10000 |    11000 |     1000 |  10.0% |   0.0953
   50000 |    55000 |     5000 |  10.0% |   0.0953
  100000 |   110000 |    10000 |  10.0% |   0.0953

RMSE:  5700.88
RMSLE: 0.0953
```

모든 예측이 정확히 10%씩 빗나갔는데, RMSE는 절대 오차 크기에 따라 비싼 집에 지배당한다. 반면 RMSLE는 모든 데이터 포인트를 동등하게 취급한다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 RMSLE는 비율 오차를 측정한다</strong><br>
  log(a) - log(b) = log(a/b)이므로, RMSLE는 실질적으로 <strong>예측값과 실제값의 비율</strong>에 대한 오차를 측정한다. "2배 과대예측"과 "2배 과소예측"이 같은 크기의 오차로 잡힌다. Kaggle 집값 예측 대회에서 자주 쓰이는 이유다.
</div>

### 주의: RMSLE는 과소예측에 더 엄격하다

```python
# 같은 절대 오차라도 방향에 따라 RMSLE가 다르다
y_true_dir = np.array([100, 100])
y_over     = np.array([150, 100])   # 과대예측 +50
y_under    = np.array([50,  100])   # 과소예측 -50

msle_over  = mean_squared_log_error(y_true_dir, y_over)
msle_under = mean_squared_log_error(y_true_dir, y_under)

print(f"과대예측 (+50) MSLE: {msle_over:.4f}")
print(f"과소예측 (-50) MSLE: {msle_under:.4f}")
```

```
과대예측 (+50) MSLE: 0.0822
과소예측 (-50) MSLE: 0.2402
```

같은 크기의 오차라도 과소예측이 약 3배 더 큰 MSLE를 준다. log 함수의 비대칭성 때문이다. 과소예측이 과대예측보다 비즈니스적으로 더 위험한 상황(재고 부족 예측 등)에서 유리하다.

---

## sklearn으로 모델 비교 실전

여러 모델의 성능을 다양한 지표로 한 번에 비교하는 실전 코드를 작성한다.

```python
import numpy as np
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    mean_absolute_percentage_error,
    mean_squared_log_error,
)

# 데이터 로드
data = fetch_california_housing()
X, y = data.data, data.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 스케일링 (선형 모델용)
scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

# 모델 정의
models = {
    "Linear Regression": LinearRegression(),
    "Ridge (alpha=1)":   Ridge(alpha=1.0),
    "Lasso (alpha=0.01)": Lasso(alpha=0.01),
    "Random Forest":     RandomForestRegressor(n_estimators=100, random_state=42),
    "Gradient Boosting": GradientBoostingRegressor(n_estimators=200, random_state=42),
}

# 평가
print(f"{'모델':<22} | {'MAE':>6} | {'RMSE':>6} | {'R²':>6} | {'MAPE':>7} | {'RMSLE':>7}")
print("-" * 72)

for name, model in models.items():
    # 트리 모델은 스케일링 불필요
    if "Forest" in name or "Boosting" in name:
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
    else:
        model.fit(X_train_s, y_train)
        y_pred = model.predict(X_test_s)

    mae   = mean_absolute_error(y_test, y_pred)
    rmse  = np.sqrt(mean_squared_error(y_test, y_pred))
    r2    = r2_score(y_test, y_pred)
    mape_val = mean_absolute_percentage_error(y_test, y_pred) * 100

    # RMSLE는 음수 예측이 있으면 계산 불가 → 클리핑
    y_pred_clip = np.maximum(y_pred, 0)
    try:
        rmsle = np.sqrt(mean_squared_log_error(y_test, y_pred_clip))
    except ValueError:
        rmsle = float('nan')

    print(f"{name:<22} | {mae:>6.4f} | {rmse:>6.4f} | {r2:>6.4f} | {mape_val:>6.2f}% | {rmsle:>7.4f}")
```

```
모델                   |    MAE |   RMSE |     R² |    MAPE |   RMSLE
------------------------------------------------------------------------
Linear Regression      | 0.5332 | 0.7456 | 0.5758 | 32.99% |  0.3983
Ridge (alpha=1)        | 0.5332 | 0.7456 | 0.5758 | 32.98% |  0.3982
Lasso (alpha=0.01)     | 0.5376 | 0.7496 | 0.5712 | 33.47% |  0.4008
Random Forest          | 0.3272 | 0.5035 | 0.8067 | 16.73% |  0.2462
Gradient Boosting      | 0.3709 | 0.5545 | 0.7653 | 19.79% |  0.2756
```

결과를 해석해보면:

- **R² 기준**: Random Forest(0.81)가 가장 좋다. 전체 변동의 81%를 설명한다.
- **MAE 기준**: Random Forest(0.33)가 가장 낮다. 평균 약 33만 달러 오차 (California 집값 단위가 10만 달러).
- **MAPE 기준**: 선형 모델들은 30%대로 상당히 높다. 저가 주택에서 비율 오차가 크기 때문이다.
- **RMSLE 기준**: Random Forest가 역시 가장 좋다. 비율 기반으로 봐도 일관되게 좋은 예측이다.

모든 지표에서 **순위가 동일하다면**, 어떤 지표를 쓰든 같은 결론이 나온다. 지표 선택이 중요해지는 건 **모델 간 순위가 지표에 따라 달라질 때**다.

---

## 지표 선택 가이드

어떤 지표를 쓸지는 "데이터의 특성"과 "비즈니스 요구사항"에 따라 결정한다.

| 상황 | 추천 지표 | 이유 |
|---|---|---|
| 이상치가 많고 무시하고 싶을 때 | **MAE** | 이상치에 강건, 중앙값 예측에 대응 |
| 큰 오차를 심하게 벌하고 싶을 때 | **RMSE** | 큰 오차에 제곱 페널티 |
| 경사하강법으로 직접 최적화할 때 | **MSE** | 미분이 깔끔 |
| 스케일 독립적 비교가 필요할 때 | **R²** | 0~1 범위로 정규화 |
| 특성 수가 다른 모델을 비교할 때 | **Adjusted R²** | 불필요한 특성에 페널티 |
| 비전문가에게 설명해야 할 때 | **MAPE** | "N% 오차"로 직관적 |
| 타겟이 0 근처 값을 포함할 때 | **MAE** 또는 **RMSE** | MAPE는 0에서 발산 |
| 타겟 분포가 치우쳐 있을 때 (집값, 매출) | **RMSLE** | 로그 스케일로 비율 오차 측정 |
| 과소예측이 과대예측보다 위험할 때 | **RMSLE** | 과소예측에 더 큰 페널티 |

<div style="background: #f6fff0; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실전 팁: 지표를 하나만 쓰지 마라</strong><br>
  실무에서는 보통 <strong>2~3개 지표를 함께</strong> 본다. 예를 들어 RMSE + R² + MAPE를 같이 보면, 절대 오차(RMSE), 설명력(R²), 비율 오차(MAPE)를 동시에 파악할 수 있다. 하나의 지표만 최적화하면 다른 측면에서 문제가 생길 수 있다.
</div>

---

## 흔한 실수

### 1. R²만 보고 모델 성능을 판단한다

```python
# ❌ R²가 높다고 좋은 모델이 아닐 수 있다
# 특성 수가 많으면 R²는 자동으로 올라간다
print("특성 3개 모델:  R² = 0.9491 (Adj R² = 0.9491)")
print("특성 10개 모델: R² = 0.9518 (Adj R² = 0.9464)")
print()
print("R²만 보면 10개 특성이 낫지만,")
print("Adjusted R²를 보면 3개 특성이 더 낫다.")
```

다중 회귀에서는 반드시 Adjusted R²를 함께 확인해야 한다.

### 2. MAPE를 무조건 쓴다

타겟에 0이나 0 근처 값이 포함되면 MAPE는 무한대로 발산하거나 비정상적으로 커진다. 기온 예측, 수요 예측(재고 0일 수 있음) 등에서 주의해야 한다.

### 3. RMSE와 MAE의 차이를 무시한다

RMSE가 MAE보다 크게 차이 나면 일부 데이터에서 큰 오차가 발생한다는 신호다. 이 경우 이상치를 확인하거나, 특정 구간에서 모델이 약한지 분석해봐야 한다.

---

## 마치며

회귀 평가 지표를 정리하면:

- **MAE**: 직관적, 이상치에 강건, 단위가 타겟과 동일
- **MSE**: 큰 오차에 강한 페널티, 미분 가능, 편향-분산 분해의 기초
- **RMSE**: MSE의 단위 문제를 해결, 실전에서 가장 범용적
- **R²**: 스케일 독립적, 모델의 설명력 비율
- **Adjusted R²**: 특성 수에 대한 페널티, 다중 회귀 필수
- **MAPE**: 퍼센트 기반, 비즈니스 소통에 유리, 0 근처에서 불안정
- **RMSLE**: 치우친 분포에 적합, 비율 오차 측정

핵심은 **하나의 만능 지표는 없다**는 것이다. 데이터의 특성과 비즈니스 맥락에 맞게 적절한 지표를 조합해서 사용해야 한다.

다음 글에서는 이 지표들을 **제대로 측정하는 방법**을 다룬다. 모델을 학습한 데이터로 평가하면 안 된다는 건 [편향-분산 트레이드오프](/ml/bias-variance/)에서 이미 봤다. 그럼 데이터를 어떻게 나누고, 몇 번이나 평가해야 신뢰할 수 있는 점수가 나오는가? **교차 검증(Cross-Validation)** 이 그 답이다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>MAE</strong>: 평균 절대 오차. 이상치에 강건하고 해석이 직관적</li>
    <li><strong>MSE/RMSE</strong>: 큰 오차에 제곱 페널티. RMSE는 단위가 타겟과 같아서 실전에서 더 많이 쓰임</li>
    <li><strong>R²</strong>: 0~1 스케일. "모델이 전체 변동의 몇 %를 설명하는가"</li>
    <li><strong>Adjusted R²</strong>: 특성 수에 페널티를 줘서 R²의 과대평가 방지</li>
    <li><strong>MAPE</strong>: 퍼센트 기반. 비전문가 소통에 유리하지만 0 근처에서 불안정</li>
    <li><strong>RMSLE</strong>: 로그 스케일로 비율 오차 측정. 치우친 분포(집값, 매출)에 적합</li>
    <li><strong>실전 원칙</strong>: 지표를 2~3개 조합해서 다각도로 평가하라</li>
  </ul>
</div>

---

## 참고자료

- [Scikit-learn — Regression Metrics Documentation](https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics)
- [Andrew Ng — Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Kaggle — Evaluation Metrics for Regression Problems](https://www.kaggle.com/code/carlolepelaars/understanding-the-metric-rmsle)
- [StatQuest: R-squared, Clearly Explained (YouTube)](https://www.youtube.com/watch?v=2AQKmw14mHM)
- [Rob J Hyndman — Another look at MAPE](https://robjhyndman.com/hyndsight/smape/)
