---
date: '2026-02-18'
title: '신뢰구간(Confidence Interval): 추정의 불확실성을 수량화하는 방법'
category: 'Statistics'
series: 'stats'
seriesOrder: 10
tags: ['신뢰구간', 'Confidence Interval', 't-분포', 'CLT', '구간추정']
summary: '점추정의 불확실성을 정량화하는 신뢰구간의 정의, 정규·t·비율·분산 CI 구성법, 표본 크기 설계까지 Python 시뮬레이션과 함께 이해한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/mle-and-mom/)에서 MLE를 다뤘다. 데이터의 우도를 최대화하는 점추정량을 구했고, 피셔 정보량(Fisher Information)을 통해 그 추정량이 점근적으로 최적임을 확인했다. 그런데 MLE가 건네주는 것은 결국 **하나의 숫자**다. "평균 체류 시간은 4.7분이다" — 그래서? 4.7분이 정확히 맞을 확률은 사실상 0이다. 연속형 모수의 점추정값이 참값과 정확히 일치하는 것은 측도론적으로 불가능하기 때문이다.

우리가 정말 알고 싶은 것은 "4.7분이라는 추정이 **얼마나 믿을 만한가**"이다. 참값이 4.5에서 4.9 사이에 있다는 말과, 2.0에서 7.4 사이에 있다는 말은 전혀 다른 수준의 정보를 담고 있다. 이 불확실성을 수학적으로 표현하는 도구가 바로 **신뢰구간**(Confidence Interval, CI)이다.

---

## 점추정 vs 구간추정: 왜 구간이 필요한가

[점추정](/stats/point-estimation/)은 모수 $\theta$의 값을 하나의 숫자 $\hat{\theta}$로 요약한다. 이 추정량이 비편향(unbiased)이고 일치적(consistent)이라 해도, 특정 표본에서 구한 $\hat{\theta}$가 $\theta$에서 얼마나 떨어져 있는지는 알 수 없다.

| 추정 방식 | 결과 형태 | 정보량 |
|---|---|---|
| 점추정 | $\hat{\mu} = 4.7$ | 최선의 추측값 하나 |
| 구간추정 | $[4.3, 5.1]$ | 불확실성의 범위까지 포함 |

구간추정이 점추정보다 항상 우월한 것은 아니다. 예측 모형에 모수값 하나를 넣어야 하는 상황이라면 점추정이 필요하다. 하지만 "이 효과가 실재하는가?", "이 차이가 의미 있는 크기인가?"를 판단하려면 추정의 불확실성을 정량화하는 구간이 필수다.

```python
import numpy as np

np.random.seed(42)
true_mu = 10.0
n = 25

# 같은 모집단에서 표본을 5번 뽑아 점추정
for i in range(5):
    sample = np.random.normal(true_mu, 3.0, size=n)
    x_bar = np.mean(sample)
    se = np.std(sample, ddof=1) / np.sqrt(n)
    print(f"표본 {i+1}: x̄ = {x_bar:.2f},  95% CI = [{x_bar - 1.96*se:.2f}, {x_bar + 1.96*se:.2f}]")
# 표본 1: x̄ = 9.51,  95% CI = [8.38, 10.63]
# 표본 2: x̄ = 9.14,  95% CI = [8.05, 10.23]
# 표본 3: x̄ = 10.32,  95% CI = [9.16, 11.48]
# 표본 4: x̄ = 9.79,  95% CI = [8.90, 10.68]
# 표본 5: x̄ = 10.16,  95% CI = [8.95, 11.38]
```

같은 모집단에서 뽑았는데도 점추정값은 표본마다 흔들린다. 반면 구간추정은 참값 $\mu = 10$을 일관되게 포착한다. 이것이 구간추정의 핵심 가치다.

---

## 신뢰구간의 정의와 빈도주의 해석

### 형식적 정의

신뢰 수준(confidence level) $1 - \alpha$의 **신뢰구간**이란, 통계량 $L(\mathbf{X})$과 $U(\mathbf{X})$로 이루어진 구간 $[L, U]$로서 다음을 만족하는 것이다:

$$P_\theta(L(\mathbf{X}) \leq \theta \leq U(\mathbf{X})) \geq 1 - \alpha \quad \text{for all } \theta \in \Theta$$

핵심은 **확률이 걸리는 대상이 구간이지, 모수가 아니라는 것**이다. $\theta$는 미지이지만 고정된 상수다. 확률적으로 움직이는 것은 표본에 의존하는 $L$과 $U$뿐이다.

### 올바른 해석

"95% 신뢰구간"의 뜻: **동일한 모집단에서 같은 크기의 표본을 반복 추출하여 매번 신뢰구간을 구성하면, 그 구간들 중 약 95%가 참 모수를 포함한다.**

:::warning

**⚠️ 주의: 가장 흔한 오해**

"모수 $\theta$가 95% 확률로 이 구간 안에 있다"는 **틀린 해석**이다. 이미 관측된 구간 $[3.2, 5.8]$에 대해, $\theta$는 이 안에 있거나 없거나 둘 중 하나다 — 확률이 아니다. 빈도주의에서 모수는 확률변수가 아니므로, "모수가 어디에 있을 확률"이라는 표현 자체가 성립하지 않는다.

모수에 확률을 부여하고 싶다면 베이지안 프레임워크의 **신용구간**(Credible Interval)이 필요하다.

:::

### 커버리지 시뮬레이션으로 확인

이 정의를 직접 눈으로 확인해보자. 1,000개의 95% 신뢰구간을 구성하고, 참값을 포함하는 구간과 놓치는 구간을 구분한다.

```python
import numpy as np
from scipy import stats

np.random.seed(123)
true_mu = 0.0
sigma = 1.0
n = 25
alpha = 0.05
n_intervals = 1000

results = []
for _ in range(n_intervals):
    sample = np.random.normal(true_mu, sigma, size=n)
    x_bar = np.mean(sample)
    se = sigma / np.sqrt(n)
    z = stats.norm.ppf(1 - alpha/2)
    lo, hi = x_bar - z * se, x_bar + z * se
    covers = lo <= true_mu <= hi
    results.append((lo, hi, covers))

n_covers = sum(r[2] for r in results)
n_misses = n_intervals - n_covers

print(f"1,000개 95% CI 중 참값 포함: {n_covers}개 ({n_covers/n_intervals*100:.1f}%)")
print(f"참값 놓침: {n_misses}개 ({n_misses/n_intervals*100:.1f}%)")

# 처음 20개 구간 출력 (포함 여부 표시)
print("\n처음 20개 구간:")
for i, (lo, hi, covers) in enumerate(results[:20]):
    marker = "✓" if covers else "✗ MISS"
    print(f"  [{lo:>6.3f}, {hi:>6.3f}]  {marker}")
# 1,000개 95% CI 중 참값 포함: 942개 (94.2%)
# 참값 놓침: 58개 (5.8%)
#
# 처음 20개 구간:
#   [-0.252,  0.532]  ✓
#   [-0.506,  0.278]  ✓
#   [-0.290,  0.494]  ✓
#   [-0.412,  0.372]  ✓
#   [-0.357,  0.427]  ✓
#   ...
```

약 5%의 구간이 참값을 놓쳤다. 이 구간들은 표본이 우연히 한쪽으로 치우쳐 추출된 경우다. "95% 신뢰"란 이 구성 절차(procedure)가 장기적으로 95%의 성공률을 가진다는 뜻이지, 개별 구간이 95% 확률로 맞다는 뜻이 아니다.

---

## 정규분포 기반 신뢰구간: σ를 알 때

가장 기본적인 설정부터 시작하자. $X_1, \ldots, X_n \overset{iid}{\sim} N(\mu, \sigma^2)$이고 $\sigma$가 알려져 있을 때, 모평균 $\mu$에 대한 신뢰구간을 구성한다.

### 피벗 구성

**피벗**(Pivot)이란 분포가 미지의 모수에 의존하지 않는 통계량이다.

$$Z = \frac{\bar{X} - \mu}{\sigma / \sqrt{n}} \sim N(0, 1)$$

$Z$의 분포는 $\mu$와 무관하므로 피벗이다. $P(-z_{\alpha/2} \leq Z \leq z_{\alpha/2}) = 1 - \alpha$를 $\mu$에 대해 풀면:

$$P\left(\bar{X} - z_{\alpha/2} \frac{\sigma}{\sqrt{n}} \leq \mu \leq \bar{X} + z_{\alpha/2} \frac{\sigma}{\sqrt{n}}\right) = 1 - \alpha$$

따라서 $100(1-\alpha)\%$ 신뢰구간은 다음과 같다:

$$\bar{X} \pm z_{\alpha/2} \cdot \frac{\sigma}{\sqrt{n}}$$

여기서 $z_{\alpha/2}$는 표준정규분포의 상위 $\alpha/2$ 분위수(quantile)다. 95% 신뢰구간이면 $\alpha = 0.05$이고 $z_{0.025} = 1.96$이다.

| 신뢰 수준 | $\alpha$ | $z_{\alpha/2}$ |
|---|---|---|
| 90% | 0.10 | 1.645 |
| 95% | 0.05 | 1.960 |
| 99% | 0.01 | 2.576 |

```python
from scipy import stats

# σ = 10을 알고 있는 상황
sigma = 10.0
n = 36
x_bar = 52.3

for conf_level in [0.90, 0.95, 0.99]:
    z_val = stats.norm.ppf(1 - (1 - conf_level) / 2)
    me = z_val * sigma / np.sqrt(n)
    print(f"{conf_level*100:.0f}% CI: [{x_bar - me:.2f}, {x_bar + me:.2f}]  (폭: {2*me:.2f})")
# 90% CI: [49.56, 55.04]  (폭: 5.48)
# 95% CI: [49.03, 55.57]  (폭: 6.53)
# 99% CI: [48.01, 56.59]  (폭: 8.59)
```

신뢰 수준이 올라갈수록 구간은 넓어진다. 더 확실하게 모수를 포착하려면 더 넓은 그물을 던져야 하는 셈이다.

:::info

**💡 "σ를 안다"는 가정은 현실적인가?**

거의 아니다. 모평균 $\mu$를 모르면서 모표준편차 $\sigma$를 안다는 것은 매우 특수한 상황이다. 공정 관리에서 공정 분산이 오랜 기록으로 확립된 경우 정도가 해당된다. 대부분의 실전에서는 다음 절의 t-분포 기반 신뢰구간을 사용한다.

:::

---

## t-분포와 소표본: σ를 모를 때

### 왜 정규분포가 아닌가

$\sigma$를 모르면 표본 표준편차 $S = \sqrt{\frac{1}{n-1}\sum(X_i - \bar{X})^2}$로 대체해야 한다. 문제는 $S$ 자체가 확률변수라는 점이다.

$$T = \frac{\bar{X} - \mu}{S / \sqrt{n}}$$

이 통계량은 표준정규분포를 따르지 않는다. 분모에 확률변수 $S$가 들어갔기 때문에 $Z$보다 변동이 크고, 꼬리가 더 무겁다. William Sealy Gosset이 1908년 "Student"라는 필명으로 밝혀낸 분포가 바로 이것이다:

$$T \sim t_{n-1}$$

자유도(degrees of freedom) $\nu = n-1$인 **Student's t-분포**를 따른다.

### t-분포의 특성

| 성질 | 설명 |
|---|---|
| 형태 | 표준정규와 비슷하지만 꼬리가 더 두꺼움 |
| 자유도 $\nu$ | 클수록 표준정규에 가까워짐 |
| $\nu = 1$ | 코시 분포 (평균 존재하지 않음) |
| $\nu \to \infty$ | $N(0,1)$로 수렴 |
| 실용 기준 | $\nu \geq 30$이면 정규 근사가 합리적 |

### t-기반 신뢰구간

$$\bar{X} \pm t_{\alpha/2, n-1} \cdot \frac{S}{\sqrt{n}}$$

여기서 $t_{\alpha/2, n-1}$은 자유도 $n-1$인 t-분포의 상위 $\alpha/2$ 분위수다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)
sample = np.random.normal(loc=100, scale=15, size=12)

x_bar = np.mean(sample)
s = np.std(sample, ddof=1)
n = len(sample)
se = s / np.sqrt(n)

# t-분포 기반 95% CI
alpha = 0.05
t_crit = stats.t.ppf(1 - alpha/2, df=n-1)
z_crit = stats.norm.ppf(1 - alpha/2)

ci_t = (x_bar - t_crit * se, x_bar + t_crit * se)
ci_z = (x_bar - z_crit * se, x_bar + z_crit * se)

print(f"n = {n}, x̄ = {x_bar:.2f}, s = {s:.2f}")
print(f"t 임계값 (df={n-1}): {t_crit:.4f}")
print(f"z 임계값:            {z_crit:.4f}")
print(f"t-기반 95% CI: [{ci_t[0]:.2f}, {ci_t[1]:.2f}]  (폭: {ci_t[1]-ci_t[0]:.2f})")
print(f"z-기반 95% CI: [{ci_z[0]:.2f}, {ci_z[1]:.2f}]  (폭: {ci_z[1]-ci_z[0]:.2f})")
# n = 12, x̄ = 104.44, s = 11.16
# t 임계값 (df=11): 2.2010
# z 임계값:            1.9600
# t-기반 95% CI: [97.35, 111.53]  (폭: 14.19)
# z-기반 95% CI: [98.12, 110.76]  (폭: 12.63)
```

$n = 12$일 때 t 임계값은 2.201로, z 임계값 1.960보다 상당히 크다. t-기반 구간이 약 12% 더 넓은데, 이 차이가 곧 $\sigma$ 대신 $S$를 사용하면서 발생하는 **추가 불확실성**이다. $n$이 커지면 $S \to \sigma$이고 $t_{n-1} \to N(0,1)$이므로 두 구간은 수렴한다.

:::info

**💡 scipy의 편리한 함수**

`stats.t.interval(confidence, df, loc, scale)`을 사용하면 한 줄로 t-기반 CI를 구할 수 있다:
`stats.t.interval(0.95, df=n-1, loc=x_bar, scale=se)`

:::

---

## 다양한 모수의 신뢰구간: 비율과 분산

지금까지는 평균에 대한 CI를 다뤘다. 하지만 실전에서 추정해야 할 모수는 평균만이 아니다. 비율과 분산에 대한 CI도 동일한 피벗 원리를 따르되, 기반 분포가 달라진다.

### 비율의 신뢰구간: 세 가지 방법 비교

$n$명 중 $X$명이 "예"라고 응답했을 때, 모비율(population proportion) $p$에 대한 구간을 어떻게 구할까? $\hat{p} = X/n$은 점추정값이고, 이에 기반한 구간 구성 방법이 여럿 존재한다.

**Wald 구간.** [CLT](/stats/lln-and-clt/)에 의해 $n$이 충분히 크면 $\hat{p} \approx N(p, p(1-p)/n)$이다. $p$를 $\hat{p}$로 대체하면:

$$\hat{p} \pm z_{\alpha/2} \sqrt{\frac{\hat{p}(1-\hat{p})}{n}}$$

가장 널리 쓰이지만 가장 문제가 많은 방법이기도 하다. $\hat{p}$가 0이나 1에 가까우면 정규 근사가 나쁘고, $\hat{p} = 0$이면 구간이 $[0, 0]$으로 퇴화한다.

**Wilson 구간.** 피벗 방정식 $\left(\frac{\hat{p} - p}{\sqrt{p(1-p)/n}}\right)^2 \leq z_{\alpha/2}^2$을 $p$에 대한 이차방정식으로 풀어서 구간을 구한다. 분모에 $\hat{p}$ 대신 $p$를 쓰기 때문에 Wald보다 안정적이다:

$$\frac{\hat{p} + \frac{z^2}{2n}}{1 + \frac{z^2}{n}} \pm \frac{z}{1 + \frac{z^2}{n}} \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}$$

**Clopper-Pearson (정확) 구간.** 이항분포(Binomial distribution)의 정확한 분위수에 기반한다. 보수적(구간이 넓음)이지만 커버리지가 항상 명목 수준 이상을 보장한다.

```python
import numpy as np
from scipy import stats

def wald_ci(x, n, alpha=0.05):
    p_hat = x / n
    z = stats.norm.ppf(1 - alpha/2)
    me = z * np.sqrt(p_hat * (1 - p_hat) / n)
    return max(0, p_hat - me), min(1, p_hat + me)

def wilson_ci(x, n, alpha=0.05):
    p_hat = x / n
    z = stats.norm.ppf(1 - alpha/2)
    z2 = z**2
    center = (p_hat + z2 / (2*n)) / (1 + z2/n)
    margin = z / (1 + z2/n) * np.sqrt(p_hat*(1-p_hat)/n + z2/(4*n**2))
    return max(0, center - margin), min(1, center + margin)

def clopper_pearson_ci(x, n, alpha=0.05):
    lo = stats.beta.ppf(alpha/2, x, n - x + 1) if x > 0 else 0.0
    hi = stats.beta.ppf(1 - alpha/2, x + 1, n - x) if x < n else 1.0
    return lo, hi

# 비교: n=20, 다양한 x 값
n = 20
print(f"{'x':>3} {'p̂':>6} {'Wald':>18} {'Wilson':>18} {'Clopper-P':>18}")
print("-" * 67)
for x in [1, 5, 10, 15, 19]:
    p_hat = x / n
    w = wald_ci(x, n)
    wl = wilson_ci(x, n)
    cp = clopper_pearson_ci(x, n)
    print(f"{x:>3} {p_hat:>6.2f} [{w[0]:.3f}, {w[1]:.3f}] "
          f"[{wl[0]:.3f}, {wl[1]:.3f}] [{cp[0]:.3f}, {cp[1]:.3f}]")
#   x    p̂               Wald             Wilson          Clopper-P
# -------------------------------------------------------------------
#   1   0.05 [0.000, 0.146] [0.009, 0.236] [0.001, 0.249]
#   5   0.25 [0.060, 0.440] [0.112, 0.469] [0.087, 0.491]
#  10   0.50 [0.281, 0.719] [0.299, 0.701] [0.272, 0.728]
#  15   0.75 [0.560, 0.940] [0.531, 0.888] [0.509, 0.913]
#  19   0.95 [0.854, 1.000] [0.764, 0.991] [0.751, 0.999]
```

| 방법 | 장점 | 단점 | 실전 권장 |
|---|---|---|---|
| **Wald** | 계산 단순 | $\hat{p} \approx 0$ 또는 $1$에서 커버리지 부족 | 교과서 용. 실전 비추천 |
| **Wilson** | 소표본에서 안정적, $\hat{p} = 0$도 처리 | 약간 복잡 | **기본 선택으로 추천** |
| **Clopper-Pearson** | 보수적, 커버리지 보장 | 지나치게 넓을 수 있음 | 안전성이 중요할 때 |

$\hat{p} = 0.05$ ($x = 1$)일 때 Wald는 하한이 0으로 잘리지만, Wilson과 Clopper-Pearson은 합리적인 구간을 제시한다. 극단적인 비율일수록 방법 선택이 중요해진다.

:::info

**💡 A/B 테스트에서의 선택**

전환율처럼 비율이 극단적으로 작거나 큰 경우가 흔한 상황에서는 Wilson 구간이 사실상 표준이다. R의 `prop.test()`나 Python의 `statsmodels.stats.proportion.proportion_confint(method='wilson')`이 이를 지원한다.

:::

### 분산의 신뢰구간: 카이제곱 분포 활용

모분산(population variance) $\sigma^2$에 대한 신뢰구간은 카이제곱 분포($\chi^2$ distribution)를 이용한다. $X_1, \ldots, X_n \overset{iid}{\sim} N(\mu, \sigma^2)$일 때, 피벗은:

$$\frac{(n-1)S^2}{\sigma^2} \sim \chi^2_{n-1}$$

이를 $\sigma^2$에 대해 풀면:

$$\left[\frac{(n-1)S^2}{\chi^2_{\alpha/2, n-1}}, \quad \frac{(n-1)S^2}{\chi^2_{1-\alpha/2, n-1}}\right]$$

카이제곱 분포는 비대칭이므로 이 구간도 $S^2$ 기준으로 대칭이 아니다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)
true_sigma2 = 25.0
n = 20
sample = np.random.normal(0, np.sqrt(true_sigma2), size=n)

s2 = np.var(sample, ddof=1)
df = n - 1
alpha = 0.05

chi2_lo = stats.chi2.ppf(1 - alpha/2, df)
chi2_hi = stats.chi2.ppf(alpha/2, df)

ci_lo = df * s2 / chi2_lo
ci_hi = df * s2 / chi2_hi

print(f"표본 분산 s² = {s2:.2f}")
print(f"σ² 95% CI: [{ci_lo:.2f}, {ci_hi:.2f}]")
print(f"참값 σ² = {true_sigma2:.2f}")
# 표본 분산 s² = 23.04
# σ² 95% CI: [13.33, 49.15]
# 참값 σ² = 25.00
```

분산의 신뢰구간은 꽤 넓다. 편차의 제곱을 다루는 특성상 극단값에 민감하기 때문에, 분산 추정은 본질적으로 평균 추정보다 어려운 문제다.

:::warning

**⚠️ 주의: 정규성 가정의 민감성**

분산의 카이제곱 기반 CI는 **정규분포 가정에 매우 민감**하다. 모집단이 정규가 아니면 커버리지가 크게 어긋날 수 있다. 이 경우 부트스트랩(bootstrap) 방법이 더 신뢰할 만하다.

:::

---

## 신뢰구간의 폭을 결정하는 세 가지 요인

정규 기반 CI $\bar{X} \pm z_{\alpha/2} \cdot \sigma / \sqrt{n}$의 반폭(margin of error)은:

$$E = z_{\alpha/2} \cdot \frac{\sigma}{\sqrt{n}}$$

이 공식에 세 가지 요인이 모두 드러나 있다:

| 요인 | 폭에 미치는 영향 | 조절 가능 여부 |
|---|---|---|
| 신뢰 수준 ($1-\alpha$) ↑ | 폭 ↑ ($z_{\alpha/2}$ 증가) | 연구자가 선택 |
| 표본 크기 ($n$) ↑ | 폭 ↓ ($\sqrt{n}$에 반비례) | 실험 설계로 조절 |
| 모분산 ($\sigma^2$) ↑ | 폭 ↑ (비례) | 통제 불가 (모집단 고유) |

### 필요 표본 크기 역산

"95% 신뢰구간의 반폭이 $E$ 이하가 되려면 표본이 몇 개 필요한가?" — 실험 설계에서 가장 자주 등장하는 질문이다.

$$n \geq \left(\frac{z_{\alpha/2} \cdot \sigma}{E}\right)^2$$

```python
from scipy import stats
import numpy as np

sigma = 10.0  # 예상 표준편차
alpha = 0.05
z = stats.norm.ppf(1 - alpha/2)

print(f"σ = {sigma}, 95% CI 기준")
print(f"{'목표 반폭 E':>12} {'필요 표본 크기 n':>16}")
print("-" * 32)
for E in [5.0, 3.0, 2.0, 1.0, 0.5]:
    n_required = np.ceil((z * sigma / E) ** 2)
    print(f"{E:>12.1f} {n_required:>16.0f}")
# σ = 10, 95% CI 기준
#  목표 반폭 E    필요 표본 크기 n
# --------------------------------
#          5.0               16
#          3.0               43
#          2.0               97
#          1.0              385
#          0.5             1537
```

반폭을 절반으로 줄이려면 표본이 **4배** 필요하다. $\sqrt{n}$에 반비례하기 때문이다. 정밀도를 높이는 일은 전형적인 수확 체감(diminishing returns)의 법칙을 따른다.

---

## MLE와 신뢰구간: 점근 정규성의 활용

[이전 글](/stats/mle-and-mom/)에서 다룬 MLE의 점근 정규성은 신뢰구간 구성과 자연스럽게 연결된다. 정규 조건 하에서:

$$\hat{\theta}_{\text{MLE}} \overset{d}{\to} N\left(\theta, \frac{1}{nI(\theta)}\right)$$

여기서 $I(\theta)$는 [피셔 정보량](/stats/mle-and-mom/)이다. 이 성질에서 곧바로 신뢰구간이 도출된다:

$$\hat{\theta}_{\text{MLE}} \pm z_{\alpha/2} \cdot \frac{1}{\sqrt{nI(\hat{\theta})}}$$

$I(\theta)$의 $\theta$를 $\hat{\theta}$로 대체한 것은 MLE의 일치성에 의해 정당화된다. 이 구간을 **Wald 신뢰구간**(Wald CI)이라 부른다.

### 예시: 포아송 분포

$X_1, \ldots, X_n \overset{iid}{\sim} \text{Poisson}(\lambda)$에서 $I(\lambda) = 1/\lambda$이므로:

$$\hat{\lambda} \pm z_{\alpha/2} \sqrt{\frac{\hat{\lambda}}{n}}$$

```python
import numpy as np
from scipy import stats

np.random.seed(42)
true_lambda = 3.5
n = 50

sample = np.random.poisson(true_lambda, size=n)
lam_hat = np.mean(sample)  # MLE for Poisson

# MLE 기반 Wald CI
z = stats.norm.ppf(0.975)
se = np.sqrt(lam_hat / n)
ci = (lam_hat - z * se, lam_hat + z * se)

print(f"MLE λ̂ = {lam_hat:.4f}")
print(f"Fisher 정보량 I(λ̂) = {1/lam_hat:.4f}")
print(f"표준오차 SE = √(λ̂/n) = {se:.4f}")
print(f"95% Wald CI: [{ci[0]:.4f}, {ci[1]:.4f}]")
print(f"참값 λ = {true_lambda}")
# MLE λ̂ = 3.2800
# Fisher 정보량 I(λ̂) = 0.3049
# 표준오차 SE = √(λ̂/n) = 0.2561
# 95% Wald CI: [2.7780, 3.7820]
# 참값 λ = 3.5
```

피셔 정보량이 클수록 $1/\sqrt{nI(\theta)}$가 작아져 신뢰구간이 좁아진다. "데이터 한 개가 모수에 대해 담고 있는 정보의 양"이 크면 불확실성이 줄어드는 것이니, 직관과 정확히 맞아떨어진다.

:::summary

**📌 핵심 요약: 주요 신뢰구간 공식**

- 모평균 (σ 기지): $\bar{X} \pm z_{\alpha/2} \cdot \sigma / \sqrt{n}$
- 모평균 (σ 미지): $\bar{X} \pm t_{\alpha/2, n-1} \cdot S / \sqrt{n}$
- 모비율 (Wilson): $\frac{\hat{p} + z^2/(2n)}{1 + z^2/n} \pm \frac{z}{1+z^2/n}\sqrt{\hat{p}(1-\hat{p})/n + z^2/(4n^2)}$
- 모분산: $\left[\frac{(n-1)S^2}{\chi^2_{\alpha/2}}, \frac{(n-1)S^2}{\chi^2_{1-\alpha/2}}\right]$
- MLE 일반: $\hat{\theta} \pm z_{\alpha/2} / \sqrt{nI(\hat{\theta})}$

:::

---

## 흔한 실수와 오해

### 1. "이 구간이 모수를 포함할 확률이 95%이다"

가장 빈번한 오해다. 이미 계산된 구간은 고정된 숫자 쌍이고, 모수도 고정된 상수다. 포함하거나 포함하지 않거나 — 확률이 개입할 여지가 없다. 95%는 **구간을 만드는 절차**에 대한 성질이다.

### 2. 구간이 좁으면 무조건 좋다?

신뢰 수준을 80%로 낮추면 구간은 좁아진다. 하지만 그만큼 참값을 놓칠 위험도 커진다. 구간의 폭만 보고 판단할 수 없으며, 항상 **신뢰 수준과 함께** 해석해야 한다.

### 3. 표본 크기를 늘리면 신뢰 수준이 올라간다?

아니다. 신뢰 수준은 연구자가 선택하는 값이다. 표본 크기를 늘리면 같은 신뢰 수준에서 **구간이 좁아질 뿐**, 신뢰 수준 자체가 변하는 것이 아니다.

### 4. 신뢰구간이 0을 포함하면 "효과 없음"?

0을 포함한다는 것은 "효과가 0일 가능성을 배제할 수 없다"는 뜻이지, "효과가 없다"는 증거가 아니다. 이 미묘한 차이가 [가설검정](/stats/hypothesis-testing/)에서 중요해진다.

### 5. 독립이 아닌 표본에서 CI를 적용

모든 CI 공식은 표본의 독립성(또는 최소한 명시적인 의존 구조)을 가정한다. 시계열 데이터에 iid 기반 CI를 적용하면 구간이 지나치게 좁아지고, 커버리지가 명목 수준에 한참 못 미치게 된다.

:::warning

**⚠️ 가장 위험한 실수**

$n$이 충분히 크면 CLT에 의해 CI가 작동한다 — 이것은 맞다. 하지만 "충분히 큰 $n$"이 얼마인지는 **모집단의 분포에 따라 다르다**. 대칭 분포면 $n = 30$도 충분하지만, 극단적으로 치우친 분포(로그정규, 파레토 등)에서는 $n = 100$도 부족할 수 있다. 항상 분포의 모양을 먼저 확인하자.

:::

---

## 마치며: 구간추정에서 가설검정으로

신뢰구간은 모수의 불확실성을 하나의 구간으로 압축한다. MLE가 "최선의 추정값"을 제공한다면, 신뢰구간은 그 추정이 얼마나 정확한지를 정량화하는 도구다.

그런데 이 도구를 뒤집어보면 흥미로운 일이 일어난다. $\theta_0$에 대한 $100(1-\alpha)\%$ 신뢰구간을 하나 구성했다고 하자:

- $\theta_0$이 구간 안에 있으면 → 유의수준 $\alpha$에서 $H_0: \theta = \theta_0$를 **기각하지 못한다**
- $\theta_0$이 구간 밖에 있으면 → 유의수준 $\alpha$에서 $H_0: \theta = \theta_0$를 **기각한다**

신뢰구간을 구성하는 것과 가설검정을 수행하는 것이 수학적으로 동치라는 뜻이다. 이 관계를 **쌍대성**(duality)이라 부른다. [다음 글](/stats/hypothesis-testing/)에서는 이 쌍대성의 반대편 — p-value, 유의수준, 검정력 — 을 본격적으로 다룬다.

---

## 참고자료

- Wasserman, L. (2004). *All of Statistics*, Chapter 6: Models, Statistical Inference and Learning.
- MIT 18.650: [Statistics for Applications](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/), Lectures 7-8.
- Agresti, A. & Coull, B.A. (1998). "Approximate Is Better than 'Exact' for Interval Estimation of Binomial Proportions." *The American Statistician*, 52(2), 119-126.
- Brown, L.D., Cai, T.T. & DasGupta, A. (2001). "Interval Estimation for a Binomial Proportion." *Statistical Science*, 16(2), 101-133.
- SciPy Documentation: [scipy.stats](https://docs.scipy.org/doc/scipy/reference/stats.html)
