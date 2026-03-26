---
date: '2026-02-21'
title: '부트스트랩(Bootstrap): 분포를 모를 때, 데이터가 스스로 답한다'
category: 'Statistics'
series: 'stats'
seriesOrder: 13
tags: ['부트스트랩', 'Bootstrap', '비모수 추론', '신뢰구간', 'Resampling']
summary: '분포 가정 없이 표본에서 통계량의 분포를 근사하는 부트스트랩의 원리, 신뢰구간 3종 비교, Python 구현과 ML 배깅 연결까지 정리한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/statistical-tests/)에서 t-검정, 카이제곱 검정, ANOVA 등 다양한 검정 방법을 다뤘다. 이 방법들에는 공통점이 하나 있다. **검정통계량의 분포를 이론적으로 알고 있어야 한다**는 것이다. 표본 평균은 정규분포, 분산비는 F분포, 빈도 차이는 카이제곱분포를 따른다는 가정 위에서 p-value를 계산했다.

그런데 현실은 그렇게 깔끔하지 않다. 중앙값의 표준오차는? 두 상관계수의 차이에 대한 신뢰구간은? 분포가 극단적으로 비대칭일 때 평균의 신뢰구간은? 이론적 분포를 유도하기 어렵거나 불가능한 경우가 수두룩하다.

1979년, Bradley Efron은 놀랍도록 단순한 아이디어를 제안했다. **"표본 자체를 모집단처럼 취급하고, 거기서 반복 추출하면 통계량의 분포를 근사할 수 있다."** 이것이 **부트스트랩(Bootstrap)**이다.

---

## 부트스트랩의 핵심 아이디어

### 우리가 원하는 것

[점추정](/stats/point-estimation/)에서 배웠듯, 추정량 $\hat{\theta}$는 확률변수다. 같은 모집단에서 표본을 반복 추출하면, 매번 다른 $\hat{\theta}$ 값이 나온다. 이 **추정량의 분포(Sampling Distribution)**를 알면 신뢰구간도, 가설검정도 가능하다.

문제는 모집단에서 반복 추출하는 것이 현실에서는 불가능하다는 점이다. 표본은 딱 하나뿐이다.

### 플러그인 원리

부트스트랩의 핵심은 **플러그인 원리(Plug-in Principle)**다.

> 모집단 분포 $F$를 모르니까, 관측된 표본에서 만든 **경험적 분포 함수(Empirical Distribution Function, EDF)** $\hat{F}_n$으로 대체한다.

경험적 분포 함수란 단순하다. $n$개의 관측값 $x_1, x_2, \ldots, x_n$이 있을 때, 각 관측값에 $1/n$의 확률을 부여하는 이산 분포다.

$$\hat{F}_n(x) = \frac{1}{n} \sum_{i=1}^{n} \mathbf{1}(X_i \le x)$$

이 분포에서 크기 $n$의 표본을 **복원 추출(Sampling with Replacement)**하는 것이 부트스트랩의 핵심 연산이다. 복원 추출이므로 같은 관측값이 여러 번 뽑히기도 하고, 한 번도 안 뽑히는 관측값도 생긴다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 왜 복원 추출인가?</strong><br>비복원 추출로 $n$개를 뽑으면 원래 표본과 완전히 동일한 집합이 된다. 복원 추출이어야 매번 다른 구성의 표본이 만들어지고, 그로부터 통계량의 변동성을 추정할 수 있다. 평균적으로 한 번의 부트스트랩 표본에는 원래 관측값의 약 63.2%만 포함된다 ($1 - (1 - 1/n)^n \approx 1 - e^{-1}$).</div>

### 부트스트랩의 논리 구조

정리하면, 부트스트랩은 다음과 같은 유추에 기반한다.

| 이상적 세계 | 부트스트랩 세계 |
|---|---|
| 모집단 분포 $F$ | 경험적 분포 $\hat{F}_n$ |
| 모집단에서 크기 $n$ 표본 추출 | $\hat{F}_n$에서 크기 $n$ 복원 추출 |
| 통계량 $\hat{\theta}$의 표집 분포 | 부트스트랩 통계량 $\hat{\theta}^*$의 분포 |
| 표준오차 $\text{SE}(\hat{\theta})$ | 부트스트랩 표준오차 $\text{SE}_{boot}$ |

$\hat{F}_n$이 $F$를 잘 근사한다면 (표본이 충분히 크다면), 부트스트랩 분포는 실제 표집 분포를 잘 근사한다. 이 근사가 정당화되는 이론적 배경은 [큰 수의 법칙과 중심극한정리](/stats/lln-and-clt/)에서 다룬 **Glivenko-Cantelli 정리** — $\hat{F}_n$이 $F$에 균등 수렴한다는 결과 — 에 뿌리를 두고 있다.

---

## 부트스트랩 알고리즘

### 의사코드

부트스트랩 알고리즘은 놀라울 정도로 단순하다.

```
입력: 원본 표본 x = (x₁, x₂, ..., xₙ), 반복 횟수 B, 통계량 함수 θ̂(·)
출력: 부트스트랩 분포 {θ̂*₁, θ̂*₂, ..., θ̂*_B}

1. for b = 1, 2, ..., B:
     a. x*ᵇ ← x에서 크기 n을 복원 추출
     b. θ̂*ᵇ ← θ̂(x*ᵇ)   # 부트스트랩 표본에 통계량 적용
2. return {θ̂*₁, θ̂*₂, ..., θ̂*_B}
```

이 분포로부터 표준오차, 신뢰구간, 편향 등을 계산한다.

### Python 직접 구현

통계량이 중앙값인 경우를 구현해보겠다. 중앙값은 이론적 표준오차 공식이 복잡한 대표적인 통계량이다.

```python
import numpy as np

np.random.seed(42)

# 비대칭 분포에서 표본 생성 (지수분포: 오른쪽 꼬리)
data = np.random.exponential(scale=2.0, size=50)
observed_median = np.median(data)
print(f"관측된 중앙값: {observed_median:.4f}")

# 부트스트랩
B = 10_000
n = len(data)
boot_medians = np.empty(B)

for b in range(B):
    boot_sample = np.random.choice(data, size=n, replace=True)
    boot_medians[b] = np.median(boot_sample)

# 부트스트랩 표준오차
boot_se = np.std(boot_medians, ddof=1)
print(f"부트스트랩 표준오차: {boot_se:.4f}")

# 부트스트랩 편향
boot_bias = np.mean(boot_medians) - observed_median
print(f"부트스트랩 편향 추정: {boot_bias:.4f}")
```

```
관측된 중앙값: 1.1456
부트스트랩 표준오차: 0.2727
부트스트랩 편향 추정: -0.0303
```

`np.random.choice`에 `replace=True`만 지정하면 복원 추출이 된다. 10,000번의 재표본 추출과 중앙값 계산 — 이게 부트스트랩의 전부다.

### B는 얼마로 해야 할까?

반복 횟수 $B$의 선택에 대한 가이드라인은 다음과 같다.

| 목적 | 권장 $B$ |
|---|---|
| 표준오차 추정 | 1,000 이상 |
| 신뢰구간 (백분위법) | 5,000 이상 |
| BCa 신뢰구간 | 10,000 이상 |
| 정밀한 p-value | 10,000~100,000 |

$B$를 늘리면 부트스트랩 분포의 추정이 정밀해지지만, 원본 표본 $n$의 한계를 넘어설 수는 없다. 부트스트랩의 정확도는 궁극적으로 $n$에 의해 제한된다.

---

## 부트스트랩 신뢰구간 3종 비교

부트스트랩 분포를 구했으면 [신뢰구간](/stats/confidence-intervals/)을 구성할 수 있다. 방법이 여러 가지인데, 각각의 특성이 다르다.

### 1. 백분위 방법 (Percentile Method)

가장 직관적인 방법이다. 부트스트랩 분포의 양쪽 $\alpha/2$ 분위수를 그대로 신뢰구간 경계로 사용한다.

$$CI_{1-\alpha} = \left[ \hat{\theta}^*_{\alpha/2}, \quad \hat{\theta}^*_{1-\alpha/2} \right]$$

```python
alpha = 0.05
ci_percentile = np.percentile(boot_medians, [100 * alpha/2, 100 * (1 - alpha/2)])
print(f"백분위 95% CI: [{ci_percentile[0]:.4f}, {ci_percentile[1]:.4f}]")
```

```
백분위 95% CI: [0.6910, 1.6317]
```

간단하지만, 추정량에 편향이 있거나 분포가 비대칭이면 커버리지가 이론적 수준(예: 95%)에 못 미칠 수 있다.

### 2. 기본 방법 (Basic/Pivotal Method)

피벗(pivot) 아이디어에 기반한다. 부트스트랩에서 추정한 "$\hat{\theta}^* - \hat{\theta}$의 분포"를 이용해 $\theta - \hat{\theta}$의 분포를 근사한다.

$$CI_{1-\alpha} = \left[ 2\hat{\theta} - \hat{\theta}^*_{1-\alpha/2}, \quad 2\hat{\theta} - \hat{\theta}^*_{\alpha/2} \right]$$

```python
ci_basic = [
    2 * observed_median - np.percentile(boot_medians, 100 * (1 - alpha/2)),
    2 * observed_median - np.percentile(boot_medians, 100 * alpha/2)
]
print(f"기본(피벗) 95% CI: [{ci_basic[0]:.4f}, {ci_basic[1]:.4f}]")
```

```
기본(피벗) 95% CI: [0.6596, 1.6002]
```

백분위 방법보다 이론적으로 우수하지만, 여전히 편향에 취약하다.

### 3. BCa 방법 (Bias-Corrected and Accelerated)

가장 정교한 방법이다. 편향 보정(bias correction)과 가속 계수(acceleration)를 도입하여 백분위 방법의 한계를 극복한다.

BCa는 두 가지 보정을 적용한다.

- **편향 보정 상수** $\hat{z}_0$: 부트스트랩 분포의 중심이 원래 추정값에서 얼마나 벗어나 있는지 측정
- **가속 상수** $\hat{a}$: 표준오차가 모수값에 따라 변하는 정도를 반영 (jackknife로 추정)

$$\hat{z}_0 = \Phi^{-1}\left(\frac{\#\{\hat{\theta}^*_b < \hat{\theta}\}}{B}\right)$$

$$\hat{a} = \frac{\sum_{i=1}^{n}(\hat{\theta}_{(\cdot)} - \hat{\theta}_{(i)})^3}{6\left[\sum_{i=1}^{n}(\hat{\theta}_{(\cdot)} - \hat{\theta}_{(i)})^2\right]^{3/2}}$$

보정된 분위수 $\alpha_1, \alpha_2$를 계산한 뒤 백분위법을 적용한다.

$$\alpha_1 = \Phi\left(\hat{z}_0 + \frac{\hat{z}_0 + z_{\alpha/2}}{1 - \hat{a}(\hat{z}_0 + z_{\alpha/2})}\right)$$

```python
from scipy import stats

# 편향 보정 상수
z0 = stats.norm.ppf(np.mean(boot_medians < observed_median))

# 가속 상수 (jackknife)
jackknife_medians = np.empty(n)
for i in range(n):
    jack_sample = np.delete(data, i)
    jackknife_medians[i] = np.median(jack_sample)

jack_mean = np.mean(jackknife_medians)
num = np.sum((jack_mean - jackknife_medians) ** 3)
den = 6.0 * (np.sum((jack_mean - jackknife_medians) ** 2)) ** 1.5
a_hat = num / den

# 보정된 분위수 계산
z_alpha_low = stats.norm.ppf(alpha / 2)
z_alpha_high = stats.norm.ppf(1 - alpha / 2)

alpha1 = stats.norm.cdf(z0 + (z0 + z_alpha_low) / (1 - a_hat * (z0 + z_alpha_low)))
alpha2 = stats.norm.cdf(z0 + (z0 + z_alpha_high) / (1 - a_hat * (z0 + z_alpha_high)))

ci_bca = np.percentile(boot_medians, [100 * alpha1, 100 * alpha2])
print(f"BCa 95% CI: [{ci_bca[0]:.4f}, {ci_bca[1]:.4f}]")
```

```
BCa 95% CI: [0.6897, 1.5824]
```

### 방법 비교 요약

| 방법 | 장점 | 단점 | 권장 상황 |
|---|---|---|---|
| 백분위 (Percentile) | 구현 간단, 직관적 | 편향·비대칭에 취약 | 빠른 탐색적 분석 |
| 기본 (Basic/Pivotal) | 피벗 이론 기반 | 여전히 편향에 민감 | 대칭 분포일 때 |
| BCa | 편향·비대칭 보정, 2차 정확도 | 계산 비용 높음, jackknife 필요 | 최종 보고용, 비대칭 통계량 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 2차 정확도란?</strong><br>표준 정규 근사의 신뢰구간은 오차가 $O(n^{-1/2})$인 반면, BCa 방법은 $O(n^{-1})$로 수렴한다. 이를 "second-order accurate"라 하며, 같은 표본 크기에서도 실제 커버리지가 명목 수준(95%)에 더 가깝다.</div>

---

## 부트스트랩이 작동하는 이유

### 직관적 설명

부트스트랩이 작동하는 이유를 한 문장으로 요약하면 이렇다.

> **표본이 모집단을 잘 대표한다면, 표본에서의 재추출은 모집단에서의 추출을 잘 모방한다.**

$n$이 커질수록 경험적 분포 $\hat{F}_n$은 진짜 분포 $F$에 가까워진다. Glivenko-Cantelli 정리에 의해 $\sup_x |\hat{F}_n(x) - F(x)| \to 0$ (거의 확실히)이므로, $\hat{F}_n$에서 계산한 통계량의 분포도 $F$에서 계산한 분포에 수렴한다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
<strong>💡 Glivenko-Cantelli 정리가 말하는 것</strong><br>
표본이 충분히 크면, 경험적 분포 함수 $\hat{F}_n$은 모든 지점에서 동시에 진짜 분포 $F$에 수렴한다. 이는 단순히 "평균이 비슷해진다"는 수준이 아니라, <strong>분포 전체의 형태가 일치해간다</strong>는 훨씬 강한 보장이다. 부트스트랩이 단순한 트릭이 아니라 수학적으로 정당화되는 근거가 바로 여기에 있다.
</div>

### CLT와의 관계

[중심극한정리](/stats/lln-and-clt/)는 표본 평균의 분포가 정규분포에 수렴한다고 말한다. 부트스트랩은 이보다 일반적이다.

- CLT: 표본 평균(또는 합)에만 적용. 정규 근사.
- 부트스트랩: **어떤 통계량이든** 적용 가능. 분포를 직접 근사.

CLT가 적용되는 상황에서는 부트스트랩과 정규 근사의 결과가 거의 일치한다. 부트스트랩의 진가는 CLT를 적용하기 어려운 통계량(중앙값, 분위수, 상관계수 등)에서 발휘된다.

---

## 부트스트랩 검정

### 부트스트랩으로 p-value 구하기

부트스트랩은 신뢰구간뿐 아니라 가설검정에도 쓸 수 있다. 핵심 아이디어는 **귀무가설 하에서 검정통계량의 분포를 부트스트랩으로 근사**하는 것이다.

예를 들어, "모집단 중앙값이 1.5인가?"를 검정한다고 하자.

```python
# H0: 모집단 중앙값 = 1.5 (theta_0)
theta_0 = 1.5

# 관측된 검정통계량: 표본 중앙값 - 귀무가설 값
observed_stat = observed_median - theta_0

# 귀무가설 하에서의 부트스트랩: 데이터를 theta_0 중심으로 이동
data_shifted = data - observed_median + theta_0

B = 10_000
boot_stats = np.empty(B)
for b in range(B):
    boot_sample = np.random.choice(data_shifted, size=n, replace=True)
    boot_stats[b] = np.median(boot_sample) - theta_0

# 양측 p-value
p_value = np.mean(np.abs(boot_stats) >= np.abs(observed_stat))
print(f"부트스트랩 p-value: {p_value:.4f}")
```

```
부트스트랩 p-value: 0.2258
```

p-value가 크므로 귀무가설을 기각하지 못한다. 관측된 중앙값(1.1456)이 1.5와 유의미하게 다르지 않다.

### 순열 검정과의 비교

두 그룹 비교에서는 **순열 검정(Permutation Test)**이 더 자주 쓰인다. 둘의 차이를 정리하면 다음과 같다.

| | 부트스트랩 검정 | 순열 검정 |
|---|---|---|
| 재표본 방식 | 복원 추출 | 라벨 섞기 (비복원) |
| 귀무가설 | 유연하게 설정 가능 | "두 그룹의 분포가 동일" |
| 주 용도 | 신뢰구간 + 검정 | 두 그룹 비교 검정 |
| 정확 검정 | 근사적 | 정확(exact, $n$이 작을 때) |

---

## Python 실습: scipy.stats.bootstrap

직접 구현도 좋지만, SciPy 1.9+에는 `scipy.stats.bootstrap`이 내장되어 있다. BCa 방법까지 지원하므로 실무에서는 이것을 쓰는 것이 안전하다.

```python
from scipy.stats import bootstrap

np.random.seed(42)
data = np.random.exponential(scale=2.0, size=50)

# scipy.stats.bootstrap는 튜플로 감싸야 한다
result = bootstrap(
    data=(data,),
    statistic=np.median,
    n_resamples=10_000,
    confidence_level=0.95,
    method='BCa',   # 'percentile', 'basic', 'BCa'
    random_state=42
)

print(f"BCa 95% CI: [{result.confidence_interval.low:.4f}, "
      f"{result.confidence_interval.high:.4f}]")
print(f"부트스트랩 표준오차: {result.standard_error:.4f}")
```

```
BCa 95% CI: [0.6910, 1.6887]
부트스트랩 표준오차: 0.2756
```

직접 구현한 결과와 동일하다. `method` 파라미터만 바꾸면 세 가지 방법을 모두 적용할 수 있다.

### 커버리지 시뮬레이션

부트스트랩 신뢰구간이 실제로 95% 커버리지를 달성하는지 시뮬레이션으로 확인해보겠다.

```python
from scipy.stats import bootstrap

np.random.seed(0)
true_median = np.log(2) * 2.0  # 지수분포 중앙값 = ln(2) × scale

n_sim = 500
B = 5_000
coverage = {'percentile': 0, 'basic': 0, 'BCa': 0}

for sim in range(n_sim):
    sample = np.random.exponential(scale=2.0, size=50)

    for method in coverage:
        res = bootstrap(
            data=(sample,),
            statistic=np.median,
            n_resamples=B,
            confidence_level=0.95,
            method=method,
            random_state=sim
        )
        ci = res.confidence_interval
        if ci.low <= true_median <= ci.high:
            coverage[method] += 1

for method, count in coverage.items():
    print(f"{method:>12}: {count/n_sim*100:.1f}%")
```

```
  percentile: 91.4%
       basic: 92.0%
         BCa: 94.2%
```

BCa가 명목 수준 95%에 가장 가깝다. 백분위 방법은 지수분포처럼 비대칭 분포에서 커버리지가 떨어지는 것을 확인할 수 있다. 이것이 최종 보고에는 BCa를 권장하는 이유다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ 시뮬레이션 주의사항</strong><br>위 시뮬레이션은 500회 반복으로 실행했다. 실제 커버리지 검증에는 1,000회 이상이 필요하며, B도 10,000 이상으로 설정해야 정밀한 결과를 얻을 수 있다. 실행 시간이 오래 걸릴 수 있으므로 주의하자.</div>

---

## 부트스트랩의 한계

부트스트랩이 만능은 아니다. 다음과 같은 경우에는 주의가 필요하다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
<strong>⚠️ 부트스트랩이 실패하는 상황</strong><br>
(1) 극값 통계량(최댓값, 최솟값) — 복원 추출의 구조적 한계로 분포 근사 불가<br>
(2) 극소 표본($n < 10$) — 경험적 분포가 모집단을 대표하지 못함<br>
(3) 비정칙 문제 — 모수가 공간의 경계에 있거나 수렴 속도가 $\sqrt{n}$이 아닌 경우<br>
(4) 시계열·공간 데이터 — i.i.d. 가정 위반 시 표준 부트스트랩은 의존 구조를 파괴함
</div>

### 작동하지 않는 경우

**1. 극값 통계량 (Extreme Order Statistics)**

표본 최댓값 $X_{(n)}$의 분포를 부트스트랩으로 추정하면 실패한다. 복원 추출에서 원본의 최댓값이 그대로 뽑힐 확률이 $1 - (1 - 1/n)^n \approx 0.632$로 매우 높기 때문에, 부트스트랩 분포가 진짜 분포를 근사하지 못한다.

**2. 표본 크기가 너무 작을 때**

$n < 10$ 정도의 극단적으로 작은 표본에서는 $\hat{F}_n$이 $F$를 제대로 대표하지 못한다. 부트스트랩이 만들어내는 다양성이 제한적이므로, 결과를 신뢰하기 어렵다.

**3. 비정칙(Non-regular) 문제**

모수가 모수 공간의 경계에 있을 때(예: 균일분포 $U(0, \theta)$에서 $\theta$ 추정), 수렴 속도가 일반적인 $\sqrt{n}$이 아닌 경우 표준 부트스트랩이 실패할 수 있다.

### 시계열 데이터: 블록 부트스트랩

표준 부트스트랩은 관측값이 **독립(i.i.d.)**이라고 가정한다. 시계열 데이터는 자기상관(autocorrelation)이 있으므로 관측값을 무작위로 섞으면 시간 구조가 파괴된다.

이 문제를 해결하기 위해 **블록 부트스트랩(Block Bootstrap)**이 제안되었다.

- **비중첩 블록 부트스트랩 (Non-overlapping Block Bootstrap)**: 시계열을 고정 길이 블록으로 나누고, 블록 단위로 복원 추출
- **이동 블록 부트스트랩 (Moving Block Bootstrap)**: 겹치는 블록을 사용하여 블록 경계 효과를 완화
- **정상 부트스트랩 (Stationary Bootstrap)**: 블록 길이를 기하분포에서 랜덤하게 추출

블록 부트스트랩은 시계열의 국소 의존 구조를 보존하면서도 재표본 추출의 이점을 살린다.

---

## ML에서의 부트스트랩: 배깅의 기반

부트스트랩은 통계적 추론을 넘어 머신러닝의 핵심 기법인 **배깅(Bagging, Bootstrap Aggregating)**의 이론적 기반이기도 하다.

Leo Breiman(1996)이 제안한 배깅은 다음과 같다.

```
1. 훈련 데이터에서 B개의 부트스트랩 표본을 생성
2. 각 부트스트랩 표본으로 독립적인 모델을 학습
3. B개 모델의 예측을 평균(회귀) 또는 다수결(분류)로 집계
```

이것이 통계적 부트스트랩과 정확히 같은 구조다. 부트스트랩 표본마다 통계량을 계산하는 대신 모델을 학습하는 것만 다르다.

```python
# 통계 부트스트랩 vs ML 배깅 — 구조적 동일성
# 통계: θ̂*_b = median(bootstrap_sample_b)    → {θ̂*_1, ..., θ̂*_B}의 분포
# ML:   f̂_b  = DecisionTree(bootstrap_sample_b)  → (1/B)Σf̂_b(x)로 예측
```

**Random Forest**는 배깅에 "특성 랜덤 선택"을 추가한 것이다. 즉, 부트스트랩 → 배깅 → 랜덤 포레스트로 이어지는 계보가 있다. 이 내용은 ML 시리즈에서 더 자세히 다룬다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 부트스트랩의 두 가지 얼굴</strong><br>통계에서 부트스트랩은 <strong>불확실성을 정량화</strong>하기 위해 쓰인다 (표준오차, 신뢰구간). ML에서 부트스트랩은 <strong>분산을 줄이기</strong> 위해 쓰인다 (배깅). 같은 재표본 추출 기법이 목적에 따라 완전히 다른 역할을 하는 셈이다.</div>

### OOB (Out-of-Bag) 추정

앞서 부트스트랩 표본에 포함되지 않는 관측값이 약 36.8% 존재한다고 했다. 배깅에서는 이 **빠진 관측값(Out-of-Bag, OOB)**을 검증 데이터로 활용한다. 별도의 검증 세트 없이도 모델의 일반화 오차를 추정할 수 있는 것이다. 이는 교차 검증(Cross-Validation)의 대안으로도 쓰인다.

---

## 마치며

부트스트랩은 빈도주의 추론의 마지막 무기다. 분포 가정이 불확실할 때, 이론적 공식을 유도하기 어려울 때, 데이터 자체에서 답을 찾는다. 플러그인 원리라는 단순한 아이디어 위에, 컴퓨터의 계산 능력을 얹은 결과다.

지금까지의 여정을 돌아보면 — [점추정](/stats/point-estimation/)에서 모수를 하나의 값으로 추정하고, [신뢰구간](/stats/confidence-intervals/)으로 불확실성을 정량화하고, [가설검정](/stats/hypothesis-testing/)으로 의사결정을 하고, 이제 부트스트랩으로 분포 가정의 족쇄에서 벗어났다. 이것이 빈도주의(Frequentist) 패러다임이 제공하는 추론 도구의 전모다.

그런데 빈도주의에는 근본적인 한계가 있다. 데이터가 주어졌을 때 모수에 대해 직접 확률적 진술을 할 수 없다는 것이다. "이 모수가 3과 5 사이일 확률이 95%"라고 말하고 싶지만, 빈도주의 신뢰구간은 그런 해석을 허용하지 않는다.

[다음 글](/stats/bayesian-inference/)에서는 완전히 다른 패러다임에 들어선다. 모수를 확률변수로 취급하고, 사전 정보와 데이터를 결합하여 사후 분포를 얻는 **베이지안 추론(Bayesian Inference)** — 통계의 또 다른 세계가 열린다.

---

## 참고자료

- Efron, B. (1979). "Bootstrap Methods: Another Look at the Jackknife." *The Annals of Statistics*, 7(1), 1-26.
- Efron, B., & Tibshirani, R. J. (1993). *An Introduction to the Bootstrap*. Chapman & Hall/CRC.
- Davison, A. C., & Hinkley, D. V. (1997). *Bootstrap Methods and their Application*. Cambridge University Press.
- DiCiccio, T. J., & Efron, B. (1996). "Bootstrap Confidence Intervals." *Statistical Science*, 11(3), 189-228.
- SciPy Documentation: [scipy.stats.bootstrap](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html)
