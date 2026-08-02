---
date: '2026-02-17'
title: '최대우도추정(MLE)과 적률법(MoM): 추정량을 체계적으로 찾는 두 가지 방법'
category: 'Statistics'
series: 'stats'
seriesOrder: 9
tags: ['MLE', 'Maximum Likelihood', '적률법', 'Method of Moments', 'Fisher Information']
summary: '임의의 분포에서 모수 추정량을 체계적으로 구성하는 두 방법을 비교한다. 적률법의 직관적 접근과 MLE의 최적성, 피셔 정보량과 점근 성질을 유도와 시뮬레이션으로 확인한다.'
thumbnail: './thumbnail.png'
---

표본 평균이나 표본 분산은 직관적인 추정량이었다. 모집단 평균을 추정하니까 데이터의 평균을 구하고, 모집단 분산을 추정하니까 데이터의 산포를 계산하면 그만이다. 그런데 감마 분포의 형태 모수(shape parameter)를 추정해야 한다면 어떨까? 직관만으로는 한계가 있으므로, 임의의 확률 모형에서 모수를 체계적으로 추정하는 일반적인 방법론이 필요해진다. 그 답이 **적률법**(Method of Moments, MoM)과 **최대우도추정**(Maximum Likelihood Estimation, MLE)이다.

## 적률법: 가장 직관적인 추정 방법

### 핵심 아이디어

적률법의 아이디어는 놀라울 정도로 단순하다. **모집단 적률을 표본 적률로 대체한다.**

$k$차 모집단 적률은 $\mu_k = E[X^k]$이고, 이에 대응하는 $k$차 표본 적률은 $\hat{\mu}_k = \frac{1}{n}\sum_{i=1}^{n}X_i^k$이다. 추정해야 할 모수가 $p$개라면 $p$개의 적률 방정식을 세워서 풀면 된다. 큰 수의 법칙에 의해 $\hat{\mu}_k \xrightarrow{P} \mu_k$이므로, $n$이 커질수록 이 대체는 점점 정확해진다.

### 예시 1: 정규분포 $N(\mu, \sigma^2)$

모수가 2개이므로 적률 방정식도 2개가 필요하다.

$$\mu_1 = E[X] = \mu \quad \Rightarrow \quad \hat{\mu} = \bar{X}$$

$$\mu_2 = E[X^2] = \sigma^2 + \mu^2 \quad \Rightarrow \quad \hat{\sigma}^2 = \frac{1}{n}\sum X_i^2 - \bar{X}^2 = \frac{1}{n}\sum(X_i - \bar{X})^2$$

정규분포에서는 적률법 추정량이 직관적인 표본 평균, 표본 분산과 정확히 일치한다. 주목할 점은 적률법이 $n$으로 나눈다는 것이다. 이 추정량은 $\sigma^2$에 대해 편향되어 있지만, 표본 적률을 모집단 적률에 그대로 대입하는 방법이니 자연스러운 결과다.

### 예시 2: 감마분포 $\text{Gamma}(\alpha, \beta)$

적률법의 진가는 모수와 적률의 관계가 비선형일 때 드러난다. 감마분포의 평균과 분산은 다음과 같다. 여기서 $\beta$는 rate 파라미터이므로, scale 파라미터($E[X] = \alpha\beta$) 표기와 혼동하지 않도록 주의하자.

$$E[X] = \frac{\alpha}{\beta}, \qquad \text{Var}(X) = \frac{\alpha}{\beta^2}$$

2차 적률 $E[X^2] = \text{Var}(X) + (E[X])^2 = \frac{\alpha(\alpha+1)}{\beta^2}$ 을 활용하면 다음 결과를 얻는다.

$$\hat{\alpha} = \frac{\bar{X}^2}{\hat{\mu}_2 - \bar{X}^2}, \qquad \hat{\beta} = \frac{\bar{X}}{\hat{\mu}_2 - \bar{X}^2}$$

여기서 $\hat{\mu}_2 = \frac{1}{n}\sum X_i^2$이고, 분모 $\hat{\mu}_2 - \bar{X}^2$은 $n$으로 나눈 표본 분산과 같다. 형태 모수는 직관만으로 추정하기 어렵지만, 적률법을 쓰면 기계적으로 방정식을 세우고 풀기만 하면 된다. 다만 기계적이라는 것이 곧 약점이기도 하다. 적률법은 데이터가 모수에 거는 제약을 보지 않기 때문에 말이 안 되는 추정값을 내놓을 수 있다. 균일분포 $U(0, \theta)$가 대표적이다. $E[X] = \theta/2$에서 $\hat{\theta} = 2\bar{X}$가 나오는데, 표본에 $2\bar{X}$보다 큰 값이 하나라도 있으면 그 관측값은 추정된 분포에서 애초에 나올 수 없었던 것이 된다.

## 최대우도추정: 데이터를 가장 잘 설명하는 모수

### 우도 함수 (Likelihood Function)

MLE의 핵심 질문은 이렇다. **관측된 데이터를 가장 그럴듯하게(likely) 만드는 모수 값은 무엇인가?**

$X_1, \ldots, X_n$이 확률(밀도)함수 $f(x; \theta)$를 따르는 iid 표본일 때, **우도 함수**(Likelihood Function)는 다음과 같다.

$$L(\theta) = \prod_{i=1}^{n} f(X_i; \theta)$$

형태는 결합 확률(밀도)함수와 동일하지만 관점이 정반대다. 확률함수는 $\theta$를 고정하고 $x$의 함수로 보지만, 우도 함수는 **$x$를 고정(관측값)하고 $\theta$의 함수**로 본다. 우도는 확률이 아니므로 $\theta$에 대해 적분해도 1이 되지 않는다.

동전을 10번 던져 앞면이 8번 나왔다고 하자. $p = 0.5$일 때 우도는 $L(0.5) = \binom{10}{8}(0.5)^{10} \approx 0.044$이고, $p = 0.8$일 때는 $L(0.8) = \binom{10}{8}(0.8)^8(0.2)^2 \approx 0.302$다. $p = 0.8$이 훨씬 그럴듯하고, 실제로 이 값에서 우도가 최대가 되며 표본 비율 $8/10$과 정확히 일치한다.

### 로그우도 (Log-Likelihood)

곱을 그대로 다루는 대신 로그를 취하면 곱이 합으로 바뀐다. 로그는 단조증가 함수이므로 최대화 문제의 해는 그대로 유지된다.

$$\ell(\theta) = \log L(\theta) = \sum_{i=1}^{n} \log f(X_i; \theta)$$

로그우도를 쓰면 두 가지 이점이 있다. 곱셈이 덧셈으로 변하므로 미분이 훨씬 쉬워지고, 매우 작은 확률들의 곱으로 인한 수치 언더플로를 방지할 수 있다. MLE는 이 로그우도를 최대화하는 $\theta$다.

$$\hat{\theta}_{\text{MLE}} = \arg\max_\theta \ell(\theta)$$

대부분의 경우 미분해서 0으로 놓고 풀면 되는데, 이를 **스코어 방정식**이라 부른다.

$$\frac{\partial \ell}{\partial \theta} = 0 \quad \text{(Score equation)}$$

여기서 $\frac{\partial \ell}{\partial \theta}$을 **스코어 함수**(Score Function)라 한다. 스코어 함수의 기댓값은 항상 0이라는 성질을 갖는데($E\left[\frac{\partial}{\partial\theta}\log f(X;\theta)\right] = 0$), 이 성질이 뒤에서 다룰 피셔 정보량의 출발점이 된다.

## 분포별 MLE 유도

### 베르누이 분포 $\text{Bernoulli}(p)$

$X_1, \ldots, X_n \stackrel{iid}{\sim} \text{Bernoulli}(p)$일 때 로그우도는 다음과 같다.

$$\ell(p) = \sum_{i=1}^{n}[x_i \log p + (1-x_i)\log(1-p)] = T\log p + (n-T)\log(1-p)$$

여기서 $T = \sum x_i$는 충분 통계량이다. 미분하면 다음을 얻는다.

$$\frac{\partial \ell}{\partial p} = \frac{T}{p} - \frac{n-T}{1-p} = 0 \quad \Rightarrow \quad \hat{p}_{\text{MLE}} = \frac{T}{n} = \bar{X}$$

표본 비율이 곧 MLE이고, 직관과도 정확히 일치한다.

### 정규분포 $N(\mu, \sigma^2)$

두 모수를 동시에 추정해야 하므로 편미분을 사용한다. 로그우도는 다음과 같다.

$$\ell(\mu, \sigma^2) = -\frac{n}{2}\log(2\pi) - \frac{n}{2}\log\sigma^2 - \frac{1}{2\sigma^2}\sum_{i=1}^{n}(x_i - \mu)^2$$

$\mu$로 편미분하면:

$$\frac{\partial \ell}{\partial \mu} = \frac{1}{\sigma^2}\sum(x_i - \mu) = 0 \quad \Rightarrow \quad \hat{\mu}_{\text{MLE}} = \bar{X}$$

$\sigma^2$로 편미분하면:

$$\frac{\partial \ell}{\partial \sigma^2} = -\frac{n}{2\sigma^2} + \frac{1}{2\sigma^4}\sum(x_i - \mu)^2 = 0 \quad \Rightarrow \quad \hat{\sigma}^2_{\text{MLE}} = \frac{1}{n}\sum(X_i - \bar{X})^2$$

MLE의 $\hat{\sigma}^2$는 $n$으로 나누므로 비편향 추정량($n-1$로 나눔)이 아니다. **MLE가 항상 비편향은 아니라는 점**을 보여주는 중요한 예시다.

### 포아송 분포와 지수분포

포아송 $\text{Poisson}(\lambda)$의 로그우도와 스코어 방정식은 다음과 같다.

$$\ell(\lambda) = \sum_{i=1}^{n}[x_i\log\lambda - \lambda - \log(x_i!)] \quad \Rightarrow \quad \frac{\sum x_i}{\lambda} - n = 0 \quad \Rightarrow \quad \hat{\lambda}_{\text{MLE}} = \bar{X}$$

지수분포 $\text{Exp}(\lambda)$(rate 파라미터)도 같은 방식으로 풀린다.

$$\ell(\lambda) = n\log\lambda - \lambda\sum x_i \quad \Rightarrow \quad \frac{n}{\lambda} - \sum x_i = 0 \quad \Rightarrow \quad \hat{\lambda}_{\text{MLE}} = \frac{1}{\bar{X}}$$

포아송의 평균이 $\lambda$이고 지수분포의 평균이 $1/\lambda$이므로, 둘 다 직관적으로 자연스러운 결과다.

:::summary

**분포별 MLE 요약**

| 분포 | 모수 | MLE | 비편향? |
|---|---|---|---|
| Bernoulli($p$) | $p$ | $\bar{X}$ | ✓ |
| Normal($\mu, \sigma^2$) | $\mu$ | $\bar{X}$ | ✓ |
| Normal($\mu, \sigma^2$) | $\sigma^2$ | $\frac{1}{n}\sum(X_i-\bar{X})^2$ | ✗ (편향: $-\sigma^2/n$) |
| Poisson($\lambda$) | $\lambda$ | $\bar{X}$ | ✓ |
| Exponential($\lambda$) | $\lambda$ | $1/\bar{X}$ | ✗ |

:::

## MLE는 왜 강력한가

MLE가 적률법보다 선호되는 이유는 대표본에서의 최적 성질 때문이다. $n$이 충분히 크면 MLE는 세 가지 점근 성질을 갖고, 표본 크기와 무관하게 성립하는 성질이 하나 더 있다.

### 1. 일치성 (Consistency)

$$\hat{\theta}_{\text{MLE}} \xrightarrow{P} \theta_0 \quad (n \to \infty)$$

데이터가 많아지면 참값에 수렴하며, 정규 조건(regularity conditions) 하에서 성립한다.

### 2. 점근 정규성 (Asymptotic Normality)

$$\sqrt{n}(\hat{\theta}_{\text{MLE}} - \theta_0) \xrightarrow{d} N\left(0, \frac{1}{I(\theta_0)}\right)$$

$n$이 커지면 MLE의 분포는 정규분포에 가까워진다. 여기서 $I(\theta_0)$는 **피셔 정보량**(Fisher Information)이고, 이 결과가 신뢰구간 구성의 기반이 된다.

포아송 분포($\lambda = 5$)의 MLE $\hat{\lambda} = \bar{X}$를 표본 크기별로 10,000회 반복 계산해 보면, 실증 분산과 이론값 $\lambda/n$의 비율이 $n = 10$에서 1.00, $n = 1000$에서 0.96으로 몬테카를로 노이즈 범위 안에서 1 근처에 머문다. 실증 분산이 이론값 $1/(nI(\lambda))$을 잘 따라간다는 것은 MLE가 크래머-라오 하한에 도달하고 있다는 뜻이다.

### 3. 점근 효율성 (Asymptotic Efficiency)

MLE의 점근 분산 $1/(nI(\theta))$은 크래머-라오 하한과 일치한다. 다시 말해 **MLE보다 분산이 작은 일치추정량은 점근적으로 존재하지 않는다**.

### 4. 불변성 (Invariance)

앞의 세 가지와 달리, 불변성은 표본 크기와 무관하게 성립한다. $\hat{\theta}_{\text{MLE}}$가 $\theta$의 MLE이면 임의의 함수 $g$에 대해 다음이 성립한다.

$$\widehat{g(\theta)}_{\text{MLE}} = g(\hat{\theta}_{\text{MLE}})$$

정규분포에서 $\hat{\sigma}^2_{\text{MLE}} = \frac{1}{n}\sum(X_i - \bar{X})^2$을 구했다면 $\sigma$의 MLE는 그 제곱근 $\sqrt{\hat{\sigma}^2_{\text{MLE}}}$이고, 우도를 다시 최대화할 필요가 없다. 비편향성은 이런 비선형 변환을 통과하지 못하지만 MLE는 통과한다. 실전에서 가장 자주 쓰는 성질이다.

## 피셔 정보량: 데이터가 모수에 대해 말해주는 양

### 정의와 해석

**피셔 정보량(Fisher Information)** $I(\theta)$는 하나의 관측값이 모수 $\theta$에 대해 담고 있는 정보의 양이다.

$$I(\theta) = E\left[\left(\frac{\partial}{\partial\theta}\log f(X;\theta)\right)^2\right]$$

정규 조건 하에서는 다음 동치 표현이 성립한다.

$$I(\theta) = -E\left[\frac{\partial^2}{\partial\theta^2}\log f(X;\theta)\right]$$

두 번째 형태가 더 직관적이다. 로그우도의 **곡률**(curvature)이 클수록 피셔 정보가 커진다. 곡률이 크다는 것은 우도 함수가 참값 근처에서 뾰족하다는 뜻이고, 그만큼 모수의 위치를 정밀하게 특정할 수 있다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 272" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 지점에서 최댓값을 갖는 두 로그우도 곡선. 뾰족한 곡선은 곡률이 커서 피셔 정보가 크고, 평평한 곡선은 곡률이 작아 피셔 정보가 작다.">
<style>
.fi-ax { stroke: var(--border, #e7e5e4); stroke-width: 1.5; fill: none; }
.fi-sharp { stroke: var(--primary, #0d9488); stroke-width: 2.4; fill: none; }
.fi-flat { stroke: var(--text-muted, #78716c); stroke-width: 2.4; fill: none; stroke-dasharray: 7 4; }
.fi-gu { stroke: var(--text-muted, #78716c); stroke-width: 1.2; fill: none; stroke-dasharray: 3 3; }
.fi-t { fill: var(--text, #1c1917); font-size: 15px; }
.fi-m { fill: var(--text-muted, #78716c); font-size: 14px; }
.fi-p { fill: var(--primary, #0d9488); font-size: 14px; font-weight: 600; }
</style>
<!-- 축 -->
<path class="fi-ax" d="M 44 30 L 44 190 L 390 190"/>
<text class="fi-m" x="44" y="20">로그우도</text>
<text class="fi-m" x="390" y="208" text-anchor="end">모수 θ</text>
<!-- 두 곡선: 최댓값 위치와 높이는 같고 곡률만 다르다 -->
<path class="fi-flat" d="M 54 190 Q 214 -110 374 190"/>
<path class="fi-sharp" d="M 154 190 Q 214 -110 274 190"/>
<!-- 최댓값 위치 -->
<path class="fi-gu" d="M 214 40 L 214 190"/>
<text class="fi-t" x="214" y="208" text-anchor="middle">추정값</text>
<!-- 범례 -->
<path class="fi-sharp" d="M 54 232 L 88 232"/>
<text class="fi-p" x="98" y="237">곡률 큼 · 피셔 정보 큼</text>
<path class="fi-flat" d="M 54 258 L 88 258"/>
<text class="fi-m" x="98" y="263">곡률 작음 · 피셔 정보 작음</text>
</svg>
</div>

### 분포별 피셔 정보량

| 분포 | 모수 | 피셔 정보 $I(\theta)$ | CRLB ($n$개 관측 시) |
|---|---|---|---|
| $\text{Bernoulli}(p)$ | $p$ | $\frac{1}{p(1-p)}$ | $\frac{p(1-p)}{n}$ |
| $N(\mu, \sigma^2)$ ($\sigma^2$ 기지) | $\mu$ | $\frac{1}{\sigma^2}$ | $\frac{\sigma^2}{n}$ |
| $\text{Poisson}(\lambda)$ | $\lambda$ | $\frac{1}{\lambda}$ | $\frac{\lambda}{n}$ |
| $\text{Exp}(\lambda)$ | $\lambda$ | $\frac{1}{\lambda^2}$ | $\frac{\lambda^2}{n}$ |

### 왜 피셔 정보가 중요한가?

피셔 정보량은 비편향 추정량의 분산 하한 $\text{Var}(\hat{\theta}) \geq 1/(nI(\theta))$을 정하고, MLE는 점근적으로 이 하한에 도달한다. 실험 설계에도 그대로 쓰인다. 추정량의 **분산**을 $\epsilon$ 이하로 낮추고 싶다면 $n \geq 1/(\epsilon \cdot I(\theta))$개의 관측이 필요하다(표준오차 기준이라면 $\epsilon^2$이 들어간다).

베르누이의 $I(p) = 1/(p(1-p))$를 예로 들어 보자. $p = 0.5$일 때 $I(p) = 4$로 최소가 되고, $p$가 0이나 1에 가까울수록 피셔 정보가 커진다. 직관적으로도 납득이 간다. 동전이 거의 항상 앞면(또는 뒷면)이 나오면 적은 시행으로도 $p$를 정확하게 추정할 수 있는 반면, $p = 0.5$인 공정한 동전은 가장 불확실하므로 정밀한 추정에 더 많은 데이터가 필요하다.

## MoM vs MLE: 언제 무엇을 쓸까?

감마 분포의 형태 모수 $\alpha$를 추정하는 시뮬레이션으로 두 방법을 직접 비교해 보자.

```python
import numpy as np
from scipy import stats as sp_stats

np.random.seed(42)
true_alpha, true_beta = 2.0, 1.0  # 평균=2, 분산=2
n, n_sims = 20, 5_000

mom_alphas, mle_alphas = [], []
for _ in range(n_sims):
    s = np.random.gamma(true_alpha, 1 / true_beta, size=n)

    # 적률법: 닫힌 해
    m1, m2 = np.mean(s), np.mean(s**2)
    var_s = m2 - m1**2
    mom_alphas.append(m1**2 / var_s if var_s > 0 else np.nan)

    # MLE: 반복 최적화 (scipy)
    fit_alpha, _, _ = sp_stats.gamma.fit(s, floc=0)
    mle_alphas.append(fit_alpha)

mom = np.array([x for x in mom_alphas if not np.isnan(x)])
mle = np.array([x for x in mle_alphas if not np.isnan(x)])

print(f"{'':>8} {'MoM':>10} {'MLE':>10}")
for label, f in [("E[α̂]", np.mean), ("Var", np.var)]:
    print(f"{label:>8} {f(mom):>10.4f} {f(mle):>10.4f}")
print(f"{'Bias':>8} {np.mean(mom)-true_alpha:>10.4f} {np.mean(mle)-true_alpha:>10.4f}")
print(f"{'MSE':>8} {np.mean((mom-true_alpha)**2):>10.4f} "
      f"{np.mean((mle-true_alpha)**2):>10.4f}")
#              MoM        MLE
#    E[α̂]     2.4544     2.3213
#      Var     0.8630     0.6329
#     Bias     0.4544     0.3213
#      MSE     1.0695     0.7361
```

MLE가 MoM보다 편향도 작고 분산도 작다. MSE 기준으로 약 31% 작은데, 이것이 점근 효율성이 유한 표본에서도 드러난 결과다.

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

**실전에서의 선택**

대부분의 경우 MLE를 쓴다. 특히 ML에서는 거의 모든 학습이 우도 최대화(= 손실 최소화)로 귀결된다. 로지스틱 회귀의 교차 엔트로피 손실이 바로 음의 로그우도다. 적률법은 MLE의 초기값으로 쓰거나, 우도 함수를 모르는 경우에 유용하다.

:::

## 흔한 실수와 주의점

**우도 함수가 다봉(multimodal)일 수 있다.** 혼합 분포 등에서는 로그우도 함수에 여러 극값이 존재한다. 이 경우 그래디언트 기반 최적화가 지역 최대(local maximum)에 빠질 위험이 있으므로, EM 알고리즘이나 다중 초기값 전략으로 대응해야 한다.

**정규 조건이 만족되지 않으면 점근 성질이 무너진다.** MLE의 점근 성질이 성립하려면 모수 공간이 열린 집합이어야 하고, 서포트(support)가 $\theta$에 의존하지 않아야 하며, 로그우도가 3번 미분 가능해야 한다.

이 조건이 깨지는 대표적 예가 균일분포 $\text{Uniform}(0, \theta)$다. 서포트가 $\theta$에 의존하므로 MLE $\hat{\theta} = X_{(n)}$(표본 최댓값)의 수렴 속도가 $1/\sqrt{n}$이 아니라 $1/n$이 된다. 여기서 깨지는 것은 **점근 정규성**이지 일치성이 아니다. $X_{(n)}$은 여전히 $\theta$의 일치추정량이고, 오히려 표준적인 경우보다 빠르게 수렴한다. 크래머-라오 하한은 도달하지 못하는 것이 아니라 아예 무의미해진다. 하한을 유도할 때 쓰는 미분 조건이 성립하지 않아서, 비편향으로 보정한 $\frac{n+1}{n}X_{(n)}$의 분산은 형식적으로 계산한 하한보다 훨씬 작다.

**MLE가 항상 최선이라는 인식은 점근적 결과에 기반한 것이다.** $n$이 작으면 MLE도 편향될 수 있으므로, 소표본에서는 추정량의 유한표본 성질을 직접 확인하는 것이 중요하다. 다만 편향된 MLE가 비편향 추정량보다 MSE는 오히려 작을 수도 있다는 점을 함께 고려해야 한다.

## 마치며

적률법은 "적률을 맞춘다"는 단순한 원리로 어떤 분포에서든 기계적으로 추정량을 구성한다. MLE는 "데이터의 우도를 최대화한다"는 원리 위에서 점근적으로 가장 효율적인 추정량을 제공한다. 대부분의 실전 상황에서 MLE가 선호되며, ML의 손실 함수 설계 전체가 MLE 프레임워크 위에 서 있다.

다만 MLE가 주는 것은 하나의 숫자에 불과하다. "참값은 이 근처에 있다"는 정보는 주지만, 얼마나 근처인지는 말해 주지 않는다.

## 함께 보면 좋은 글

- [점추정: 데이터에서 모수를 추정하는 첫 번째 원리](/stats/point-estimation/)
- [정보이론으로 보는 DL 손실함수](/stats/information-theory/)
- [연속확률분포 정리](/stats/continuous-distributions/)
- [큰 수의 법칙과 중심극한정리](/stats/lln-and-clt/)

## 참고자료

- Wasserman, L. (2004). *All of Statistics*, Chapter 9: Parametric Inference.
- Casella, G. & Berger, R. (2002). *Statistical Inference* (2nd ed.), Chapter 7: Point Estimation.
- MIT 18.650: [Statistics for Applications](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/), Lectures 3-6.
- Fisher, R.A. (1922). "On the Mathematical Foundations of Theoretical Statistics." *Phil. Trans. Royal Society A*, 222, 309-368.
