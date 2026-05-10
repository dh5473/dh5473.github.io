---
date: '2026-02-17'
title: '최대우도추정(MLE)과 적률법(MoM): 추정량을 체계적으로 찾는 두 가지 방법'
category: 'Statistics'
series: 'stats'
seriesOrder: 9
tags: ['MLE', 'Maximum Likelihood', '적률법', 'Method of Moments', 'Fisher Information']
summary: '임의의 분포에서 모수 추정량을 체계적으로 구성하는 두 방법 — 적률법의 직관적 접근과 MLE의 최적성, 피셔 정보량과 점근 성질까지 유도와 시뮬레이션으로 이해한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/point-estimation/)에서 점추정의 핵심 개념을 다뤘다. 추정량과 추정값의 구분, 비편향성·일치성·효율성이라는 평가 기준, MSE의 편향-분산 분해, 그리고 충분 통계량까지. 하지만 빠진 질문이 하나 있다 — **좋은 추정량은 어떻게 찾는가?**

표본 평균이나 표본 분산은 직관적이었다. 모집단 평균을 추정하니까 데이터의 평균을 구하고, 모집단 분산을 추정하니까 데이터의 산포를 계산하면 되는 셈이다. 그런데 감마 분포의 형태 모수(shape parameter)를 추정해야 한다면 어떨까? 직관만으로는 한계가 있으므로, 임의의 확률 모형에서 모수를 체계적으로 추정하는 일반적인 방법론이 필요하게 된다.

이 글에서 다루는 두 가지 패러다임이 바로 **적률법**(Method of Moments, MoM)과 **최대우도추정**(Maximum Likelihood Estimation, MLE)이다. 하나는 단순하고 직관적이며, 다른 하나는 수학적으로 최적에 가깝다.

---

## 적률법: 가장 직관적인 추정 방법

### 핵심 아이디어

적률법의 아이디어는 놀라울 정도로 단순하다. **모집단 적률을 표본 적률로 대체한다.**

$k$차 모집단 적률은 $\mu_k = E[X^k]$이고, 이에 대응하는 $k$차 표본 적률은 $\hat{\mu}_k = \frac{1}{n}\sum_{i=1}^{n}X_i^k$이다. 추정해야 할 모수가 $p$개라면, $p$개의 적률 방정식을 세워서 풀면 되는 것이다.

1차 적률 $E[X]$는 모집단 평균이고, 이를 표본 평균 $\bar{X}$로 대체한다. 2차 적률 $E[X^2]$도 마찬가지다. [큰 수의 법칙](/stats/lln-and-clt/)에 의해 $\hat{\mu}_k \xrightarrow{P} \mu_k$이므로, $n$이 커질수록 이 대체는 점점 정확해지게 된다.

### 예시 1: 정규분포 $N(\mu, \sigma^2)$

모수가 2개이므로 적률 방정식도 2개가 필요하다.

$$\mu_1 = E[X] = \mu \quad \Rightarrow \quad \hat{\mu} = \bar{X}$$

$$\mu_2 = E[X^2] = \sigma^2 + \mu^2 \quad \Rightarrow \quad \hat{\sigma}^2 = \frac{1}{n}\sum X_i^2 - \bar{X}^2 = \frac{1}{n}\sum(X_i - \bar{X})^2$$

정규분포에서는 적률법 추정량이 직관적인 표본 평균, 표본 분산과 정확히 일치하는 셈이다.

```python
import numpy as np

np.random.seed(42)
true_mu, true_sigma2 = 5.0, 4.0

sample = np.random.normal(true_mu, np.sqrt(true_sigma2), size=30)

# 적률법 추정
mom_mu = np.mean(sample)                # 1차 적률 → 표본 평균
mom_sigma2 = np.var(sample, ddof=0)     # 2차 적률 → n으로 나눈 표본 분산

print(f"MoM μ̂ = {mom_mu:.4f}  (참값: {true_mu})")
print(f"MoM σ̂² = {mom_sigma2:.4f}  (참값: {true_sigma2})")
# MoM μ̂ = 4.6237  (참값: 5.0)
# MoM σ̂² = 3.1320  (참값: 4.0)
```

주목할 점은 적률법이 $n$으로 나눈다는 것이다. [베셀 보정](/stats/point-estimation/)에서 봤듯 이 추정량은 $\sigma^2$에 대해 편향되어 있지만, 표본 적률을 모집단 적률에 그대로 대입하는 방법이니 자연스러운 결과로 볼 수 있다.

### 예시 2: 감마분포 $\text{Gamma}(\alpha, \beta)$

적률법의 진가는 모수와 적률의 관계가 비선형일 때 드러나게 된다. 감마분포의 평균과 분산은 다음과 같다.

$$E[X] = \frac{\alpha}{\beta}, \qquad \text{Var}(X) = \frac{\alpha}{\beta^2}$$

2차 적률 $E[X^2] = \text{Var}(X) + (E[X])^2 = \frac{\alpha(\alpha+1)}{\beta^2}$ 을 활용하면:

$$\hat{\alpha} = \frac{\bar{X}^2}{\hat{\mu}_2 - \bar{X}^2}, \qquad \hat{\beta} = \frac{\bar{X}}{\hat{\mu}_2 - \bar{X}^2}$$

여기서 $\hat{\mu}_2 = \frac{1}{n}\sum X_i^2$이다. 분모 $\hat{\mu}_2 - \bar{X}^2$은 사실 $n$으로 나눈 표본 분산과 같다는 점에 주목하자.

```python
import numpy as np

np.random.seed(42)
true_alpha, true_beta = 3.0, 2.0  # 평균=1.5, 분산=0.75

gamma_sample = np.random.gamma(true_alpha, 1/true_beta, size=100)

# 표본 적률
m1 = np.mean(gamma_sample)
m2 = np.mean(gamma_sample**2)

# 적률법 추정량
mom_alpha = m1**2 / (m2 - m1**2)
mom_beta = m1 / (m2 - m1**2)

print(f"1차 표본 적률: {m1:.4f}")
print(f"2차 표본 적률: {m2:.4f}")
print(f"MoM α̂ = {mom_alpha:.4f}  (참값: {true_alpha})")
print(f"MoM β̂ = {mom_beta:.4f}  (참값: {true_beta})")
# 1차 표본 적률: 1.4613
# 2차 표본 적률: 2.6875
# MoM α̂ = 3.8689  (참값: 3.0)
# MoM β̂ = 2.6475  (참값: 2.0)
```

감마 분포의 형태 모수를 추정하는 것은 직관만으로는 어렵다. 하지만 적률법을 쓰면 기계적으로 방정식을 세우고 풀기만 하면 되기 때문이다.

:::info

**💡 적률법의 장단점**

**장점**: 계산이 간단하다. 우도 함수를 구할 필요 없이 적률만 맞추면 된다. 닫힌 해(closed-form)가 존재하는 경우가 많다.
**단점**: 일반적으로 MLE보다 효율이 낮다(분산이 크다). 고차 적률을 사용하면 추정 불안정성이 커진다. 추정값이 모수 공간 밖에 떨어질 수 있다(예: 분산 추정이 음수).

:::

---

## 최대우도추정: 데이터를 가장 잘 설명하는 모수

### 우도 함수 (Likelihood Function)

MLE의 핵심 질문은 이렇다: **관측된 데이터를 가장 그럴듯하게(likely) 만드는 모수 값은 무엇인가?**

$X_1, \ldots, X_n$이 확률(밀도)함수 $f(x; \theta)$를 따르는 iid 표본일 때, **우도 함수**(Likelihood Function)는:

$$L(\theta) = \prod_{i=1}^{n} f(X_i; \theta)$$

형태는 결합 확률(밀도)함수와 동일하지만, 관점이 정반대다. 확률함수는 $\theta$를 고정하고 $x$의 함수로 보지만, 우도 함수는 **$x$를 고정(관측값)하고 $\theta$의 함수**로 보게 된다.

:::info

**📐 확률 vs 우도**

**확률(Probability)**: 모수 $\theta$가 고정된 상태에서 "이 데이터가 나올 가능성은?" → $P(X \mid \theta)$
**우도(Likelihood)**: 데이터가 고정된 상태에서 "어떤 모수가 이 데이터를 잘 설명하는가?" → $L(\theta \mid X)$

같은 수식 $f(x;\theta)$를 사용하지만, 무엇을 변수로 보느냐에 따라 해석이 완전히 달라진다. 우도는 확률이 아니므로 합이 1일 필요가 없다는 점도 기억해야 한다.

:::

동전 던지기로 직관을 잡아보자. 동전을 10번 던져 앞면이 8번 나왔다고 하자.

- $p = 0.5$일 때 우도: $L(0.5) = \binom{10}{8}(0.5)^{10} \approx 0.044$
- $p = 0.8$일 때 우도: $L(0.8) = \binom{10}{8}(0.8)^8(0.2)^2 \approx 0.302$

$p = 0.8$이 훨씬 그럴듯하다. 그렇다면 우도를 최대화하는 $p$는 정확히 얼마일까? 아래 코드로 우도 함수의 전체 모양을 확인해보자.

```python
import numpy as np
from scipy.special import comb

# 동전 10번 중 앞면 8번
n_trials, n_heads = 10, 8
p_values = np.linspace(0.01, 0.99, 200)

# 우도 함수: L(p) = C(10,8) * p^8 * (1-p)^2
likelihood = comb(n_trials, n_heads) * p_values**n_heads * (1 - p_values)**(n_trials - n_heads)

# MLE = 관측 비율
p_mle = n_heads / n_trials

print(f"MLE p̂ = {p_mle}")
print(f"L(0.5) = {comb(n_trials, n_heads) * 0.5**10:.4f}")
print(f"L(0.8) = {comb(n_trials, n_heads) * 0.8**8 * 0.2**2:.4f}")
print(f"L(MLE) = {comb(n_trials, n_heads) * p_mle**8 * (1-p_mle)**2:.4f}")
# MLE p̂ = 0.8
# L(0.5) = 0.0439
# L(0.8) = 0.3020
# L(MLE) = 0.3020  ← 최댓값
```

$p = 0.8$에서 우도가 최대가 되며, 이는 표본 비율 $8/10$과 정확히 일치한다. 이처럼 우도를 최대화하는 $p$를 찾는 것이 MLE의 핵심 원리다.

### 로그우도 (Log-Likelihood)

왜 곱셈 대신 덧셈을 쓰려 하는 걸까? 로그를 취하면 곱이 합으로 바뀌고, 로그는 단조증가 함수이므로 최대화 문제의 해는 그대로 유지되기 때문이다.

$$\ell(\theta) = \log L(\theta) = \sum_{i=1}^{n} \log f(X_i; \theta)$$

로그우도를 쓰면 두 가지 이점이 있다:
- 곱셈이 덧셈으로 변하므로 미분이 훨씬 쉬워진다
- 매우 작은 확률들의 곱으로 인한 수치 언더플로를 방지할 수 있다

MLE는 로그우도를 최대화하는 $\theta$:

$$\hat{\theta}_{\text{MLE}} = \arg\max_\theta \ell(\theta)$$

대부분의 경우 미분해서 0으로 놓고 풀면 되는데, 이를 **스코어 방정식**이라 부른다:

$$\frac{\partial \ell}{\partial \theta} = 0 \quad \text{(Score equation)}$$

여기서 $\frac{\partial \ell}{\partial \theta}$을 **스코어 함수**(Score Function)라 부른다. 흥미롭게도, 스코어 함수의 기댓값은 항상 0이라는 성질을 갖는다: $E\left[\frac{\partial}{\partial\theta}\log f(X;\theta)\right] = 0$. 이 성질이 뒤에서 다룰 피셔 정보량의 출발점이 된다.

---

## 분포별 MLE 유도

### 베르누이 분포 $\text{Bernoulli}(p)$

$X_1, \ldots, X_n \stackrel{iid}{\sim} \text{Bernoulli}(p)$일 때:

$$\ell(p) = \sum_{i=1}^{n}[x_i \log p + (1-x_i)\log(1-p)] = T\log p + (n-T)\log(1-p)$$

여기서 $T = \sum x_i$는 [충분 통계량](/stats/point-estimation/)이다. 미분하면:

$$\frac{\partial \ell}{\partial p} = \frac{T}{p} - \frac{n-T}{1-p} = 0$$

$$\hat{p}_{\text{MLE}} = \frac{T}{n} = \bar{X}$$

표본 비율이 곧 MLE인 셈이다. 직관과도 정확히 일치하는 결과라 할 수 있다.

```python
import numpy as np

np.random.seed(42)
true_p = 0.7

data = np.random.binomial(1, true_p, size=50)
mle_p = data.mean()

print(f"n = {len(data)}, 성공 횟수 = {data.sum()}")
print(f"MLE p̂ = {mle_p:.4f}  (참값: {true_p})")
# n = 50, 성공 횟수 = 39
# MLE p̂ = 0.7800  (참값: 0.7)
```

### 정규분포 $N(\mu, \sigma^2)$

두 모수를 동시에 추정해야 하므로 편미분을 사용하게 된다. 로그우도는 다음과 같다.

$$\ell(\mu, \sigma^2) = -\frac{n}{2}\log(2\pi) - \frac{n}{2}\log\sigma^2 - \frac{1}{2\sigma^2}\sum_{i=1}^{n}(x_i - \mu)^2$$

$\mu$로 편미분:

$$\frac{\partial \ell}{\partial \mu} = \frac{1}{\sigma^2}\sum(x_i - \mu) = 0 \quad \Rightarrow \quad \hat{\mu}_{\text{MLE}} = \bar{X}$$

$\sigma^2$로 편미분:

$$\frac{\partial \ell}{\partial \sigma^2} = -\frac{n}{2\sigma^2} + \frac{1}{2\sigma^4}\sum(x_i - \mu)^2 = 0 \quad \Rightarrow \quad \hat{\sigma}^2_{\text{MLE}} = \frac{1}{n}\sum(X_i - \bar{X})^2$$

MLE의 $\hat{\sigma}^2$는 $n$으로 나누기 때문에 비편향 추정량($n-1$로 나눔)이 아니다. MLE가 항상 비편향은 아니라는 점을 보여주는 중요한 예시로 볼 수 있다.

```python
import numpy as np
from scipy import stats as sp_stats

np.random.seed(42)
sample = np.random.normal(5.0, 2.0, size=30)

mle_mu = np.mean(sample)
mle_sigma2 = np.var(sample, ddof=0)  # MLE는 n으로 나눔

# 로그우도 계산
ll = np.sum(sp_stats.norm.logpdf(sample, loc=mle_mu, scale=np.sqrt(mle_sigma2)))

print(f"MLE μ̂ = {mle_mu:.4f}")
print(f"MLE σ̂² = {mle_sigma2:.4f}")
print(f"로그우도 ℓ(μ̂, σ̂²) = {ll:.4f}")
# MLE μ̂ = 4.6237
# MLE σ̂² = 3.1320
# 로그우도 ℓ(μ̂, σ̂²) = -59.6934
```

### 포아송 분포 $\text{Poisson}(\lambda)$

$$\ell(\lambda) = \sum_{i=1}^{n}[x_i\log\lambda - \lambda - \log(x_i!)]$$

$$\frac{\partial \ell}{\partial \lambda} = \frac{\sum x_i}{\lambda} - n = 0 \quad \Rightarrow \quad \hat{\lambda}_{\text{MLE}} = \bar{X}$$

포아송에서도 MLE는 표본 평균이 된다. 포아송 분포의 평균이 $\lambda$이므로 직관적으로도 자연스러운 결과다.

### 지수분포 $\text{Exp}(\lambda)$ (rate 파라미터)

$$\ell(\lambda) = n\log\lambda - \lambda\sum x_i$$

$$\frac{\partial \ell}{\partial \lambda} = \frac{n}{\lambda} - \sum x_i = 0 \quad \Rightarrow \quad \hat{\lambda}_{\text{MLE}} = \frac{1}{\bar{X}}$$

지수분포의 평균이 $1/\lambda$이므로, 표본 평균의 역수를 취하는 것이 자연스럽다.

:::summary

**📌 분포별 MLE 요약**

| 분포 | 모수 | MLE | 비편향? |
|---|---|---|---|
| Bernoulli($p$) | $p$ | $\bar{X}$ | ✓ |
| Normal($\mu, \sigma^2$) | $\mu$ | $\bar{X}$ | ✓ |
| Normal($\mu, \sigma^2$) | $\sigma^2$ | $\frac{1}{n}\sum(X_i-\bar{X})^2$ | ✗ (편향: $\frac{n-1}{n}\sigma^2$) |
| Poisson($\lambda$) | $\lambda$ | $\bar{X}$ | ✓ |
| Exponential($\lambda$) | $\lambda$ | $1/\bar{X}$ | ✗ |

:::

---

## MLE는 왜 강력한가? — 점근 성질

MLE가 적률법보다 선호되는 이유는 무엇일까? 바로 **대표본에서의 최적 성질** 때문이다. $n$이 충분히 크면 MLE는 세 가지 놀라운 성질을 갖게 된다.

### 1. 일치성 (Consistency)

$$\hat{\theta}_{\text{MLE}} \xrightarrow{P} \theta_0 \quad (n \to \infty)$$

MLE는 [일치추정량](/stats/point-estimation/)이다. 데이터가 많아지면 참값에 수렴하며, 정규 조건(regularity conditions) 하에서 성립하게 된다.

### 2. 점근 정규성 (Asymptotic Normality)

$$\sqrt{n}(\hat{\theta}_{\text{MLE}} - \theta_0) \xrightarrow{d} N\left(0, \frac{1}{I(\theta_0)}\right)$$

$n$이 커지면 MLE의 분포는 정규분포에 가까워진다. 여기서 $I(\theta_0)$는 **피셔 정보량**(Fisher Information)이다. 이 결과가 신뢰구간 구성의 기반이 되는데, 다음 글에서 본격적으로 다룰 주제이기도 하다.

실제로 확인해보자. 포아송 분포의 MLE인 $\hat{\lambda} = \bar{X}$가 $n$이 커질수록 정규분포에 얼마나 가까워지는지 시뮬레이션으로 살펴볼 수 있다.

```python
import numpy as np

np.random.seed(42)
true_lambda = 5.0
sample_sizes = [10, 50, 200, 1000]
n_sims = 10_000

print(f"포아송(λ={true_lambda}) MLE의 점근 정규성 확인")
print(f"이론적 분산: Var(λ̂) = λ/n = {true_lambda}/n")
print()

for n in sample_sizes:
    mles = [np.mean(np.random.poisson(true_lambda, size=n)) for _ in range(n_sims)]
    mles = np.array(mles)
    theoretical_var = true_lambda / n
    empirical_var = np.var(mles)
    print(f"n = {n:>4d}:  E[λ̂] = {np.mean(mles):.4f},  "
          f"Var = {empirical_var:.6f},  이론 = {theoretical_var:.6f},  "
          f"비율 = {empirical_var/theoretical_var:.4f}")
# 포아송(λ=5.0) MLE의 점근 정규성 확인
# 이론적 분산: Var(λ̂) = 5.0/n
#
# n =   10:  E[λ̂] = 5.0048,  Var = 0.500193,  이론 = 0.500000,  비율 = 1.0004
# n =   50:  E[λ̂] = 4.9997,  Var = 0.100263,  이론 = 0.100000,  비율 = 1.0026
# n =  200:  E[λ̂] = 5.0010,  Var = 0.024475,  이론 = 0.025000,  비율 = 0.9790
# n = 1000:  E[λ̂] = 4.9995,  Var = 0.004785,  이론 = 0.005000,  비율 = 0.9571
```

실증 분산이 이론값 $\lambda/n = 1/(nI(\lambda))$에 거의 정확히 일치하는 것을 확인할 수 있다. 분산의 비율이 1에 가깝다는 것은 MLE가 [크래머-라오 하한](/stats/point-estimation/)에 도달하고 있다는 뜻이다.

### 3. 점근 효율성 (Asymptotic Efficiency)

MLE의 점근 분산 $1/(nI(\theta))$은 크래머-라오 하한과 일치한다. 다시 말해, **MLE보다 분산이 작은 일치추정량은 점근적으로 존재하지 않는다**는 것이다.

정리하면:

| 성질 | 의미 |
|---|---|
| 일치성 | $n \to \infty$이면 참값에 수렴한다 |
| 점근 정규성 | $n$이 크면 정규분포를 따르므로 신뢰구간을 구성할 수 있다 |
| 점근 효율성 | 가능한 추정량 중 가장 작은 분산을 달성한다 |

:::tip

**✅ 실전 의미**

MLE의 점근 성질은 "데이터가 충분하면 MLE가 최적에 가깝다"고 요약할 수 있다. ML에서 로지스틱 회귀의 손실함수(cross-entropy)가 사실 MLE이고, [교차 엔트로피](/stats/information-theory/)와 우도 최대화가 같은 문제라는 것도 이 맥락에서 이해할 수 있다.

:::

---

## 피셔 정보량: 데이터가 모수에 대해 말해주는 양

### 정의와 해석

[이전 글](/stats/point-estimation/)에서 크래머-라오 하한을 소개하면서 피셔 정보량을 간략히 언급한 바 있다. 이제 그 개념을 더 깊이 파고들어 보자.

**피셔 정보량(Fisher Information)** $I(\theta)$는 하나의 관측값이 모수 $\theta$에 대해 담고 있는 정보의 양이다:

$$I(\theta) = E\left[\left(\frac{\partial}{\partial\theta}\log f(X;\theta)\right)^2\right]$$

동치 표현으로, 정규 조건 하에서:

$$I(\theta) = -E\left[\frac{\partial^2}{\partial\theta^2}\log f(X;\theta)\right]$$

두 번째 형태가 더 직관적이다. 로그우도의 **곡률**(curvature)이 클수록 피셔 정보가 커지게 된다. 곡률이 크다는 것은 우도 함수가 참값 근처에서 뾰족하다는 뜻이고, 그만큼 모수의 위치를 정밀하게 특정할 수 있기 때문이다.

### 분포별 피셔 정보량

| 분포 | 모수 | 피셔 정보 $I(\theta)$ | CRLB ($n$개 관측 시) |
|---|---|---|---|
| $\text{Bernoulli}(p)$ | $p$ | $\frac{1}{p(1-p)}$ | $\frac{p(1-p)}{n}$ |
| $N(\mu, \sigma^2)$ ($\sigma^2$ 기지) | $\mu$ | $\frac{1}{\sigma^2}$ | $\frac{\sigma^2}{n}$ |
| $\text{Poisson}(\lambda)$ | $\lambda$ | $\frac{1}{\lambda}$ | $\frac{\lambda}{n}$ |
| $\text{Exp}(\lambda)$ | $\lambda$ | $\frac{1}{\lambda^2}$ | $\frac{\lambda^2}{n}$ |

```python
# 피셔 정보량과 CRLB 계산 예시
n = 50

# Bernoulli
p = 0.3
fi_bern = 1 / (p * (1-p))
crlb_bern = 1 / (n * fi_bern)
print(f"Bernoulli(p={p}): I(p) = {fi_bern:.4f}, CRLB = {crlb_bern:.6f}")

# Normal
sigma2 = 4.0
fi_norm = 1 / sigma2
crlb_norm = 1 / (n * fi_norm)
print(f"Normal(σ²={sigma2}): I(μ) = {fi_norm:.4f}, CRLB = {crlb_norm:.6f}")

# Poisson
lam = 3.0
fi_pois = 1 / lam
crlb_pois = 1 / (n * fi_pois)
print(f"Poisson(λ={lam}): I(λ) = {fi_pois:.4f}, CRLB = {crlb_pois:.6f}")
# Bernoulli(p=0.3): I(p) = 4.7619, CRLB = 0.004200
# Normal(σ²=4.0): I(μ) = 0.2500, CRLB = 0.080000
# Poisson(λ=3.0): I(λ) = 0.3333, CRLB = 0.060000
```

### 왜 피셔 정보가 중요한가?

피셔 정보량이 중요한 이유는 세 가지 핵심 역할에서 찾을 수 있다:

1. **크래머-라오 하한**: 비편향 추정량의 분산 하한 $\text{Var}(\hat{\theta}) \geq 1/(nI(\theta))$
2. **MLE의 점근 분산**: $\text{Var}(\hat{\theta}_{\text{MLE}}) \approx 1/(nI(\theta))$ — MLE가 이 하한에 도달
3. **실험 설계**: 표본 크기 결정. "원하는 정밀도 $\epsilon$을 얻으려면 $n \geq 1/(\epsilon \cdot I(\theta))$개 필요"

베르누이의 $I(p) = 1/(p(1-p))$를 예로 들어보자. $p = 0.5$일 때 $I(p) = 4$로 최소가 된다. $p$가 0이나 1에 가까울수록 피셔 정보가 커지는데, 이는 직관적으로도 납득이 간다. 동전이 거의 항상 앞면(또는 뒷면)이 나오면 적은 시행으로도 $p$를 정확하게 추정할 수 있기 때문이다. 반면 $p = 0.5$인 공정한 동전은 가장 불확실하므로, 정밀한 추정을 위해서는 더 많은 데이터가 필요하게 된다.

---

## MoM vs MLE: 언제 무엇을 쓸까?

이론적 비교는 충분히 했으니, 이제 감마 분포의 형태 모수 $\alpha$를 추정하는 시뮬레이션으로 두 방법을 직접 비교해보자.

```python
import numpy as np
from scipy import stats as sp_stats

np.random.seed(42)
true_alpha = 2.0
true_beta = 1.0  # 평균=2, 분산=2
n = 20
n_sims = 50_000

mom_alphas = []
mle_alphas = []

for _ in range(n_sims):
    s = np.random.gamma(true_alpha, 1/true_beta, size=n)

    # 적률법
    m1 = np.mean(s)
    m2 = np.mean(s**2)
    var_s = m2 - m1**2
    mom_alphas.append(m1**2 / var_s if var_s > 0 else np.nan)

    # MLE (scipy)
    fit_alpha, _, _ = sp_stats.gamma.fit(s, floc=0)
    mle_alphas.append(fit_alpha)

mom_alphas = np.array([x for x in mom_alphas if not np.isnan(x)])
mle_alphas = np.array([x for x in mle_alphas if not np.isnan(x)])

print(f"Gamma(α={true_alpha}, β={true_beta}) 형태 모수 추정 비교 (n={n})")
print(f"{'':>8} {'MoM':>10} {'MLE':>10}")
print(f"{'E[α̂]':>8} {np.mean(mom_alphas):>10.4f} {np.mean(mle_alphas):>10.4f}")
print(f"{'Bias':>8} {np.mean(mom_alphas)-true_alpha:>10.4f} {np.mean(mle_alphas)-true_alpha:>10.4f}")
print(f"{'Var':>8} {np.var(mom_alphas):>10.4f} {np.var(mle_alphas):>10.4f}")
print(f"{'MSE':>8} {np.mean((mom_alphas-true_alpha)**2):>10.4f} {np.mean((mle_alphas-true_alpha)**2):>10.4f}")
# Gamma(α=2.0, β=1.0) 형태 모수 추정 비교 (n=20)
#              MoM        MLE
#    E[α̂]     2.4525     2.3133
#     Bias     0.4525     0.3133
#      Var     0.8562     0.6278
#      MSE     1.0610     0.7259
```

MLE가 MoM보다 편향도 작고 분산도 작은 것을 확인할 수 있다. MSE 기준으로 약 32% 더 정확하며, $n$이 작을수록 이 차이는 더 두드러지게 된다.

| 기준 | 적률법 (MoM) | 최대우도추정 (MLE) |
|---|---|---|
| **계산** | 닫힌 해. 간단함 | 반복 최적화 필요할 수 있음 |
| **효율성** | 일반적으로 비효율적 | 점근적으로 최적 (CRLB 달성) |
| **일치성** | ✓ (큰 수의 법칙) | ✓ (정규 조건 하에서) |
| **비편향성** | 보장 안 됨 | 보장 안 됨 |
| **점근 정규성** | ✓ (델타 메서드) | ✓ (자동으로 나옴) |
| **모수 공간** | 추정값이 밖에 나올 수 있음 | 보통 안에 머뭄 |
| **적용 범위** | 적률이 존재하면 가능 | 우도 함수를 알아야 함 |

:::info

**💡 실전에서의 선택**

대부분의 경우 MLE를 쓴다. 특히 ML에서는 거의 모든 학습이 우도 최대화(= 손실 최소화)로 귀결된다. 로지스틱 회귀의 [교차 엔트로피 손실](/stats/information-theory/)이 바로 음의 로그우도다. 적률법은 MLE의 초기값으로 쓰거나, 우도 함수를 모르는 경우(비모수적 상황)에서 유용하다.

:::

---

## 흔한 실수와 주의점

### 1. MLE의 $\sigma^2$ 추정은 편향되어 있다

정규분포 MLE는 $n$으로 나누므로 비편향이 아니다. 하지만 [MSE 분해](/stats/point-estimation/)에서 봤듯이, 편향된 MLE가 비편향 추정량보다 MSE가 작을 수도 있다. 소표본에서 비편향성이 중요하다면 $n-1$로 나눈 $S^2$를 써야 하고, 대표본이라면 어느 쪽을 쓰든 차이는 무시할 수준이다.

### 2. 우도 함수가 다봉(multimodal)일 수 있다

혼합 분포 등에서는 로그우도 함수에 여러 극값이 존재할 수 있다. 이 경우 그래디언트 기반 최적화가 지역 최대(local maximum)에 빠질 위험이 있으므로, EM 알고리즘이나 다중 초기값 전략으로 대응해야 한다.

### 3. 적률법 추정값이 모수 공간 밖으로 나갈 수 있다

감마 분포에서 표본 분산이 우연히 매우 작으면 $\hat{\alpha}$가 비현실적으로 커질 수 있다. MLE는 최적화 자체가 모수 공간 내에서 이루어지기 때문에 이런 문제에 비교적 강건한 편이다.

### 4. 정규 조건이 만족되지 않으면 점근 성질이 무너진다

MLE의 점근 성질이 성립하려면 정규 조건(regularity conditions)이 반드시 충족되어야 한다:
- 모수 공간이 열린 집합
- 서포트(support)가 $\theta$에 의존하지 않음
- 로그우도가 3번 미분 가능

이 조건이 깨지는 대표적 예가 균일분포 $\text{Uniform}(0, \theta)$다. 서포트가 $\theta$에 의존하므로 MLE($\hat{\theta} = X_{(n)}$, 최댓값)의 수렴 속도가 $1/\sqrt{n}$이 아니라 $1/n$으로, 오히려 더 빠르게 수렴하지만 점근 정규성은 성립하지 않는다.

:::warning

**⚠️ 주의**

MLE가 "항상 최선"이라는 인식은 점근적 결과에 기반한 것이다. $n$이 작으면 MLE도 편향될 수 있고, 정규 조건이 깨지면 일치성조차 보장되지 않는다. 소표본에서는 추정량의 유한표본 성질을 직접 확인하는 것이 중요하다.

:::

---

## 마치며

적률법은 "적률을 맞춘다"는 단순한 원리로 어떤 분포에서든 기계적으로 추정량을 구성할 수 있는 방법이다. 반면 MLE는 "데이터의 우도를 최대화한다"는 원리 위에서, 점근적으로 가장 효율적인 추정량을 제공하게 된다. 대부분의 실전 상황에서 MLE가 선호되며, 특히 ML의 손실 함수 설계 전체가 MLE 프레임워크 위에 서 있다는 점은 기억해둘 만하다.

그런데 MLE가 제공하는 것은 결국 하나의 숫자(점추정값)에 불과하다. "참값은 이 근처에 있다"는 정보를 주지만, **얼마나 근처인지**는 알 수 없지 않은가? 다음 글에서 다룰 **신뢰구간**(Confidence Interval)이 바로 이 불확실성을 정량화하는 도구다. 이 글에서 다룬 MLE의 점근 정규성과 피셔 정보량이 그 핵심 역할을 하게 된다.

---

## 참고자료

- Wasserman, L. (2004). *All of Statistics*, Chapter 9: Parametric Inference.
- Casella, G. & Berger, R. (2002). *Statistical Inference* (2nd ed.), Chapter 7: Point Estimation.
- MIT 18.650: [Statistics for Applications](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/), Lectures 3-6.
- Fisher, R.A. (1922). "On the Mathematical Foundations of Theoretical Statistics." *Phil. Trans. Royal Society A*, 222, 309-368.
