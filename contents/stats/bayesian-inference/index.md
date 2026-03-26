---
date: '2026-02-22'
title: '베이지안 추론(Bayesian Inference): 사전 지식과 데이터를 결합하는 통계적 사고'
category: 'Statistics'
series: 'stats'
seriesOrder: 14
tags: ['베이지안 추론', 'Bayesian Inference', 'MCMC', '사후분포', '켤레 사전분포']
summary: '빈도주의와 베이지안 패러다임을 비교하고, 사전분포·우도·사후분포의 관계부터 켤레 사전분포, MCMC 샘플링까지 — 베이지안 추론의 이론과 Python 실습을 총정리한다.'
thumbnail: './thumbnail.png'
---

지난 열세 편의 글에 걸쳐 우리는 빈도주의(Frequentist) 통계의 핵심 도구를 하나씩 쌓아왔다. [점추정](/stats/point-estimation/)으로 모수의 "최선의 추측"을 구하고, [MLE](/stats/mle-and-mom/)로 추정량을 체계적으로 찾았으며, [신뢰구간](/stats/confidence-intervals/)과 [가설검정](/stats/hypothesis-testing/)으로 불확실성을 정량화했다. [부트스트랩](/stats/bootstrap/)까지 다루면서 분포 가정이 어려울 때의 비모수적 접근도 살펴봤다.

그런데 한 가지 질문이 남아 있다. 동전을 10번 던져 앞면이 7번 나왔다고 하자. MLE는 $\hat{p} = 0.7$이라고 답한다. 하지만 우리는 이 동전이 일반적인 동전이라는 것을 **이미 알고 있다**. 앞면 확률이 0.5 근처일 가능성이 높다는 사전 지식이 있는데, 이 정보를 전혀 활용하지 않는다면 — 그건 낭비 아닐까?

빈도주의 프레임워크에서는 이런 사전 지식을 공식적으로 통합할 방법이 없다. 데이터만이 유일한 증거다. 반면 **베이지안 추론(Bayesian Inference)**은 사전 지식과 데이터를 명시적으로 결합하는 프레임워크를 제공한다. 이 글은 stats-inference 시리즈의 마지막 편으로, 빈도주의와 베이지안이라는 두 패러다임을 비교한 뒤, 베이지안 추론의 핵심 메커니즘을 이론과 실습으로 완결짓는다.

---

## 빈도주의 vs 베이지안: 두 세계관

### 패러다임 비교표

| 관점 | 빈도주의(Frequentist) | 베이지안(Bayesian) |
|------|----------------------|-------------------|
| **모수 $\theta$의 본질** | 고정된 미지의 상수 | 불확실성을 가진 확률변수 |
| **확률의 해석** | 장기적 빈도(Long-run frequency) | 믿음의 정도(Degree of belief) |
| **추론 방법** | MLE, 가설검정, 신뢰구간 | 사후분포, MAP, 신용구간 |
| **사전 지식** | 사용하지 않음 (데이터만) | 사전분포로 명시적 반영 |
| **불확실성 표현** | 표본 분포, p-value | 사후분포 전체 |
| **표본 크기 작을 때** | 불안정 (점근 이론 의존) | 사전분포가 안정화 역할 |
| **계산 비용** | 대체로 낮음 | 높을 수 있음 (MCMC 등) |

이 표를 관통하는 핵심 차이는 하나다: **모수를 상수로 보느냐, 확률변수로 보느냐**. 빈도주의에서 $\theta$는 알려지지 않았지만 고정된 값이므로 "$P(\theta = 0.5)$"라는 표현 자체가 성립하지 않는다. 반면 베이지안에서 $\theta$는 확률변수이며, 우리의 불확실성을 확률분포로 표현할 수 있다.

### 각각 언제 유리한가

빈도주의가 유리한 상황도 분명히 있다. 데이터가 충분히 많으면 사전분포의 영향은 사라지고 두 패러다임의 결과가 수렴하는데, 이때 빈도주의가 계산적으로 훨씬 간결하다. 규제 기관의 승인 절차처럼 "객관적" 기준이 요구되는 경우에도 빈도주의의 가설검정이 표준이다.

베이지안은 표본이 적을 때, 사전 지식이 풍부할 때, 또는 불확실성의 전체 분포가 필요할 때 강점을 발휘한다. 임상시험의 적응적 설계(adaptive design), 추천 시스템의 콜드 스타트 문제, A/B 테스트의 조기 종료 판단 같은 영역에서 베이지안 접근이 자연스럽다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 "빈도주의 vs 베이지안"은 종교 전쟁이 아니다</strong><br>
실무에서는 두 접근을 도구로서 선택한다. "이 문제에서 사전 정보가 유용한가? 사후분포 전체가 필요한가? 계산 비용은 감당 가능한가?" — 이런 질문에 따라 적절한 도구를 고르면 된다. 이 글의 목표도 베이지안이 더 우월하다고 주장하는 것이 아니라, 여러분의 도구 상자에 하나를 더 추가하는 것이다.</div>

---

## 베이즈 정리에서 베이지안 추론으로

### 복습: 베이즈 정리

[조건부 확률과 베이즈 정리](/stats/conditional-probability-bayes/)에서 다뤘던 베이즈 정리를 다시 꺼내보자.

$$
P(A|B) = \frac{P(B|A) \, P(A)}{P(B)}
$$

이 공식을 사건이 아니라 <strong>모수 $\theta$와 데이터 $X$</strong>로 바꾸면 베이지안 추론의 핵심 공식이 된다.

### 베이지안 추론의 핵심 공식

$$
\underbrace{P(\theta | X)}_{\text{사후분포}} = \frac{\overbrace{P(X | \theta)}^{\text{우도}} \cdot \overbrace{P(\theta)}^{\text{사전분포}}}{\underbrace{P(X)}_{\text{증거(주변우도)}}}
$$

각 구성 요소의 역할을 하나씩 살펴보자.

| 요소 | 표기 | 역할 |
|------|------|------|
| **사전분포(Prior)** | $P(\theta)$ | 데이터를 보기 **전** 모수에 대한 믿음 |
| **우도(Likelihood)** | $P(X \mid \theta)$ | 주어진 $\theta$에서 데이터가 관측될 가능성 — [MLE](/stats/mle-and-mom/)에서 최대화했던 바로 그것 |
| **증거(Evidence)** | $P(X) = \int P(X \mid \theta) P(\theta) \, d\theta$ | 정규화 상수, $\theta$에 의존하지 않음 |
| **사후분포(Posterior)** | $P(\theta \mid X)$ | 데이터를 본 **후** 모수에 대한 업데이트된 믿음 |

증거 $P(X)$는 $\theta$에 대해 적분(또는 합산)한 상수이므로, 사후분포의 **형태**를 결정하는 데는 불필요하다. 따라서 비례 관계로 쓰면:

$$
\boxed{P(\theta | X) \propto P(X | \theta) \cdot P(\theta)}
$$

> **사후분포는 우도와 사전분포의 곱에 비례한다.**

이 한 줄이 베이지안 추론의 전부다. 사전 믿음($P(\theta)$)에 데이터의 증거($P(X|\theta)$)를 곱하면 업데이트된 믿음($P(\theta|X)$)을 얻는다. 데이터가 추가될 때마다 사후분포를 새로운 사전분포로 삼아 반복할 수 있으니, 베이지안 추론은 본질적으로 **순차적 학습(sequential learning)** 프레임워크이기도 하다.

---

## 사전분포(Prior)의 선택

사전분포는 베이지안 추론에서 가장 논쟁적인 부분이다. "주관적"이라는 비판의 핵심 대상이기도 한데, 사전분포의 유형을 정리하면 다음과 같다.

### 무정보 사전분포 (Non-informative Prior)

모수에 대한 사전 정보가 전혀 없을 때, 가능한 한 "중립적인" 사전분포를 사용한다.

- **균일분포(Uniform)**: $P(\theta) \propto 1$. 모든 값에 동일한 확률을 부여한다. 직관적이지만, 모수 변환에 대해 불변이 아니라는 문제가 있다. 예를 들어 $\theta$에 대해 균일이면 $\theta^2$에 대해서는 균일이 아니다.
- **Jeffrey's Prior**: $P(\theta) \propto \sqrt{I(\theta)}$로 정의하며, $I(\theta)$는 피셔 정보량이다. 모수 변환에 대해 불변(invariant)이라는 장점이 있다. 베르누이 분포에서 Jeffrey's prior는 $\text{Beta}(1/2, 1/2)$이 된다.

### 약정보 사전분포 (Weakly Informative Prior)

완전히 무정보는 아니지만, 극단적인 값을 배제하는 정도의 약한 정보만 반영한다. 예를 들어 사람의 키를 추정할 때 $N(170, 50^2)$ 같은 넓은 정규분포를 사용하면, "키가 -100cm이거나 500cm일 가능성은 낮다"는 상식만 반영하는 셈이다. 실무에서 가장 많이 쓰이는 전략이기도 하다.

### 정보적 사전분포 (Informative Prior)

이전 연구 결과나 전문가 판단 등 구체적인 사전 지식을 반영한다. 약물의 효과에 대한 기존 메타분석 결과를 사전분포로 사용하는 것이 대표적이다. 데이터가 적을 때 강력하지만, 잘못된 사전분포는 결과를 왜곡할 수 있으므로 민감도 분석(sensitivity analysis)이 필수다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ 사전분포 민감도(Prior Sensitivity)</strong><br>
사전분포의 선택이 결론을 크게 바꾼다면, 그 분석은 데이터보다 사전 가정에 의존하고 있다는 신호다. 서로 다른 합리적 사전분포를 넣어보고 결론이 일관되는지 확인하는 민감도 분석을 반드시 수행해야 한다. 사후분포가 사전분포에 둔감하다면(robust), 그 결론은 신뢰할 수 있다.</div>

---

## 켤레 사전분포(Conjugate Prior)

### 왜 켤레 분포가 중요한가

사후분포를 구하려면 $P(X|\theta) \cdot P(\theta)$를 계산하고 정규화해야 한다. 일반적으로 이 적분은 해석적으로 풀리지 않는다. 그런데 특정 우도-사전분포 조합에서는 **사후분포가 사전분포와 같은 분포족에 속하는** 성질이 성립한다. 이런 사전분포를 **켤레 사전분포(Conjugate Prior)**라 한다.

### 주요 켤레 쌍 정리표

| 우도(Likelihood) | 켤레 사전분포(Prior) | 사후분포(Posterior) | 사후 하이퍼파라미터 |
|:---|:---|:---|:---|
| $\text{Bernoulli}(p)$ / $\text{Binomial}(n,p)$ | $\text{Beta}(\alpha, \beta)$ | $\text{Beta}(\alpha + k, \, \beta + n - k)$ | $k$: 성공 횟수 |
| $\text{Poisson}(\lambda)$ | $\text{Gamma}(\alpha, \beta)$ | $\text{Gamma}(\alpha + \sum x_i, \, \beta + n)$ | $n$: 관측 수 |
| $\text{Normal}(\mu, \sigma^2_0)$ ($\sigma^2_0$ 기지) | $\text{Normal}(\mu_0, \tau^2_0)$ | $\text{Normal}(\mu_n, \tau^2_n)$ | $\tau^2_n = \left(\frac{1}{\tau^2_0} + \frac{n}{\sigma^2_0}\right)^{-1}$ |
| $\text{Exponential}(\lambda)$ | $\text{Gamma}(\alpha, \beta)$ | $\text{Gamma}(\alpha + n, \, \beta + \sum x_i)$ | |
| $\text{Multinomial}$ | $\text{Dirichlet}(\boldsymbol{\alpha})$ | $\text{Dirichlet}(\boldsymbol{\alpha} + \mathbf{k})$ | $\mathbf{k}$: 각 범주 관측 수 |

이 표에서 패턴이 보이는가? 사후분포의 하이퍼파라미터는 사전분포의 하이퍼파라미터에 **데이터 요약 통계량을 더한 것**이다. 적분 없이, 하이퍼파라미터만 업데이트하면 사후분포가 완성된다.

### Beta-Binomial: 상세 유도

가장 중요하고 직관적인 켤레 쌍인 Beta-Binomial을 자세히 유도해보자. 동전의 앞면 확률 $p$를 추정하는 문제다.

**설정**: 동전을 $n$번 던져 앞면이 $k$번 나왔다. $p$에 대한 사전분포로 $\text{Beta}(\alpha, \beta)$를 사용한다.

[연속 분포 글](/stats/continuous-distributions/)에서 다뤘듯이, 베타 분포의 확률밀도함수는:

$$
P(p) = \frac{p^{\alpha-1}(1-p)^{\beta-1}}{B(\alpha, \beta)}, \quad 0 \leq p \leq 1
$$

[이산 분포 글](/stats/discrete-distributions/)의 이항분포로부터 우도 함수는:

$$
P(X = k \mid p) = \binom{n}{k} p^k (1-p)^{n-k}
$$

사후분포를 비례 관계로 쓰면:

$$
P(p \mid X=k) \propto P(X=k \mid p) \cdot P(p) = \binom{n}{k} p^k (1-p)^{n-k} \cdot \frac{p^{\alpha-1}(1-p)^{\beta-1}}{B(\alpha, \beta)}
$$

$p$에 의존하지 않는 상수를 모두 버리면:

$$
P(p \mid X=k) \propto p^{k + \alpha - 1} \cdot (1-p)^{n - k + \beta - 1}
$$

이것은 $\text{Beta}(k + \alpha, \; n - k + \beta)$의 커널과 정확히 같다. 따라서:

$$
\boxed{p \mid X=k \;\sim\; \text{Beta}(\alpha + k, \; \beta + n - k)}
$$

사전분포의 $\alpha$에 성공 횟수 $k$를 더하고, $\beta$에 실패 횟수 $n-k$를 더하면 사후분포가 된다. 이렇게 보면 사전분포의 하이퍼파라미터 $\alpha, \beta$는 **"가상의 사전 관측"**으로 해석할 수 있다. $\text{Beta}(2, 5)$는 "이전에 2번 성공, 5번 실패를 관측한 것과 같은 사전 믿음"인 셈이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 사전 관측(Pseudo-counts) 해석</strong><br>
$\text{Beta}(\alpha, \beta)$ 사전분포에서 $\alpha + \beta$는 사전 "유효 표본 크기"다. 이 값이 클수록 사전분포가 강하게 작용하고, 작을수록 데이터가 사후분포를 지배한다. $\text{Beta}(1, 1) = \text{Uniform}(0,1)$은 사전 유효 표본 크기가 2로, 가장 약한 정보적 사전분포 중 하나다.</div>

---

## 사후분포에서의 추론

사후분포를 구했다면, 이제 이 분포로부터 구체적인 추론을 수행할 차례다.

### MAP 추정 (Maximum A Posteriori)

사후분포의 **최빈값(mode)**을 점추정값으로 사용하는 방법이다.

$$
\hat{\theta}_{\text{MAP}} = \arg\max_\theta P(\theta | X) = \arg\max_\theta \left[ P(X|\theta) \cdot P(\theta) \right]
$$

MLE와 나란히 놓으면 차이가 선명해진다.

$$
\hat{\theta}_{\text{MLE}} = \arg\max_\theta P(X|\theta), \qquad \hat{\theta}_{\text{MAP}} = \arg\max_\theta P(X|\theta) \cdot P(\theta)
$$

MAP는 MLE에 사전분포라는 "가중치"를 곱한 것이다. 사전분포가 균일분포이면 $P(\theta) \propto 1$이므로 MAP = MLE가 된다. 즉, **MLE는 균일 사전분포를 사용한 MAP의 특수한 경우**로 볼 수 있다.

Beta-Binomial 예시에서, $\text{Beta}(\alpha + k, \beta + n - k)$의 최빈값은:

$$
\hat{p}_{\text{MAP}} = \frac{\alpha + k - 1}{\alpha + \beta + n - 2}
$$

반면 MLE는 $\hat{p}_{\text{MLE}} = k/n$이다. 사전분포가 사후 추정을 중심 쪽으로 "수축(shrinkage)"시키는 것을 볼 수 있다.

### 사후 평균 (Posterior Mean)

사후분포의 **기댓값**을 점추정값으로 사용할 수도 있다. $\text{Beta}(\alpha + k, \beta + n - k)$의 평균은:

$$
\hat{p}_{\text{post.mean}} = \frac{\alpha + k}{\alpha + \beta + n}
$$

이 식을 변형하면 아름다운 구조가 드러난다:

$$
\hat{p}_{\text{post.mean}} = \underbrace{\frac{n}{\alpha + \beta + n}}_{\text{데이터 가중치}} \cdot \underbrace{\frac{k}{n}}_{\text{MLE}} + \underbrace{\frac{\alpha + \beta}{\alpha + \beta + n}}_{\text{사전분포 가중치}} \cdot \underbrace{\frac{\alpha}{\alpha + \beta}}_{\text{사전 평균}}
$$

**사후 평균은 MLE와 사전 평균의 가중 평균이다.** 데이터($n$)가 많아지면 MLE 쪽으로, 사전분포가 강하면($\alpha + \beta$ 클수록) 사전 평균 쪽으로 끌린다. 이것이 베이지안 추론의 핵심적인 "사전-데이터 균형(prior-data compromise)" 메커니즘이다.

### 신용구간(Credible Interval) vs 신뢰구간

빈도주의의 [신뢰구간](/stats/confidence-intervals/)과 베이지안의 **신용구간(Credible Interval)**은 겉보기에 비슷하지만 해석이 근본적으로 다르다.

| | 95% 신뢰구간 (Frequentist) | 95% 신용구간 (Bayesian) |
|---|---|---|
| **정의** | 같은 절차를 반복하면 95%의 구간이 참 모수를 포함 | 모수가 이 구간에 있을 확률이 95% |
| **해석** | 절차에 대한 확률 (장기 빈도) | 모수에 대한 직접적 확률 진술 |
| **"이 구간에 $\theta$가 있을 확률이 95%"** | **아니오** (빈도주의에서 $\theta$는 상수) | **예** (베이지안에서 $\theta$는 확률변수) |

신용구간의 가장 일반적인 형태는 **HPD(Highest Posterior Density) 구간**이다. 이 구간은 사후 밀도가 가장 높은 영역을 선택하므로, 같은 확률에 대해 가장 좁은 구간을 제공한다.

---

## Python 실습: Beta-Binomial 업데이트 시각화

이론을 코드로 확인해보자. 동전의 앞면 확률 $p$를 추정하되, 데이터가 하나씩 추가될 때마다 사후분포가 어떻게 변하는지 시각화한다.

```python
import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

# --- 설정 ---
np.random.seed(42)
true_p = 0.65               # 실제 앞면 확률 (살짝 편향된 동전)
n_flips = 50                 # 동전 던지기 횟수
data = np.random.binomial(1, true_p, size=n_flips)  # 0 또는 1

# 사전분포: Beta(2, 2) — "p가 0.5 근처"라는 약한 사전 지식
alpha_prior, beta_prior = 2, 2

# --- 순차 업데이트 시각화 ---
p_grid = np.linspace(0, 1, 500)
checkpoints = [0, 1, 5, 10, 25, 50]  # 시각화할 시점

fig, axes = plt.subplots(2, 3, figsize=(14, 8))
axes = axes.flatten()

for idx, n_obs in enumerate(checkpoints):
    ax = axes[idx]
    k = data[:n_obs].sum() if n_obs > 0 else 0  # 누적 성공 횟수

    # 사후분포 파라미터
    alpha_post = alpha_prior + k
    beta_post = beta_prior + (n_obs - k)

    posterior = stats.beta(alpha_post, beta_post)

    # 사전분포 (참고용)
    prior = stats.beta(alpha_prior, beta_prior)
    ax.fill_between(p_grid, prior.pdf(p_grid), alpha=0.2, color='gray', label='사전분포')

    # 사후분포
    ax.fill_between(p_grid, posterior.pdf(p_grid), alpha=0.4, color='#0d9488')
    ax.plot(p_grid, posterior.pdf(p_grid), color='#0d9488', lw=2, label='사후분포')

    # 참값 & MLE 표시
    ax.axvline(true_p, color='red', ls='--', lw=1.2, label=f'참값 p={true_p}')
    if n_obs > 0:
        mle = k / n_obs
        ax.axvline(mle, color='blue', ls=':', lw=1.2, label=f'MLE={mle:.2f}')

    # 95% 신용구간
    ci_low, ci_high = posterior.ppf(0.025), posterior.ppf(0.975)
    ax.axvspan(ci_low, ci_high, alpha=0.1, color='#0d9488')

    ax.set_title(f'n={n_obs}, k={k}, Beta({alpha_post},{beta_post})', fontsize=11)
    ax.set_xlim(0, 1)
    ax.legend(fontsize=8, loc='upper left')

fig.suptitle('Beta-Binomial: 사후분포의 순차 업데이트', fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig('beta_binomial_update.png', dpi=150, bbox_inches='tight')
plt.show()
```

이 시각화에서 핵심적으로 확인할 것은 세 가지다.

1. <strong>$n=0$</strong>: 사전분포 $\text{Beta}(2,2)$만 있다. 종 모양으로 $p=0.5$ 근처에 집중되어 있다.
2. <strong>$n$ 증가</strong>: 사후분포가 점점 좁아지면서(불확실성 감소) 참값 0.65 쪽으로 이동한다.
3. <strong>$n=50$</strong>: 사전분포의 영향은 거의 사라지고, 사후분포가 MLE 근처에 집중된다. 데이터가 충분하면 사전분포가 "씻겨 나간다(washed out)."

---

## MCMC 입문: 켤레가 아닌 경우

### 문제: 사후분포를 닫힌 해로 못 구한다

켤레 사전분포는 편리하지만, 현실의 모델은 대부분 이렇게 깔끔하지 않다. 다중 모수 모델, 비표준 우도, 계층적 구조를 가진 모델에서는 사후분포의 정규화 상수 $P(X) = \int P(X|\theta)P(\theta)\,d\theta$를 해석적으로 계산할 수 없다.

그러면 사후분포를 어떻게 얻을 수 있을까? 핵심 아이디어는 이것이다: **사후분포를 정확히 알 수 없어도, 사후분포에서 샘플을 뽑을 수만 있다면 충분하다.** 충분히 많은 샘플이 있으면 히스토그램으로 분포의 형태를 파악하고, 평균이나 분위수 등 원하는 통계량을 계산할 수 있다.

이것이 **마르코프 체인 몬테카를로(Markov Chain Monte Carlo, MCMC)** 방법의 핵심이다.

### Metropolis-Hastings 알고리즘의 직관

MCMC의 가장 기본적인 알고리즘인 Metropolis-Hastings를 살펴보자. 안개 낀 산에서 정상을 찾으려는 등산객을 떠올리면 된다 — 다만 정상의 "높이"에 비례하는 시간을 각 위치에서 보내야 한다.

**알고리즘 (1차원 기준)**:

1. 임의의 시작점 $\theta_0$을 선택한다.
2. 현재 위치 $\theta_t$에서 제안 분포(proposal distribution) $q(\theta^* | \theta_t)$를 이용해 후보 $\theta^*$를 생성한다. (예: $\theta^* \sim N(\theta_t, \sigma^2)$ — 현재 위치 근처에서 랜덤하게 한 걸음 이동)
3. **수용 확률(acceptance probability)**을 계산한다:

$$
\alpha = \min\left(1, \; \frac{P(X|\theta^*) \cdot P(\theta^*)}{P(X|\theta_t) \cdot P(\theta_t)} \cdot \frac{q(\theta_t | \theta^*)}{q(\theta^* | \theta_t)}\right)
$$

대칭 제안 분포($q(\theta^*|\theta_t) = q(\theta_t|\theta^*)$)를 쓰면 뒤의 비율이 1이 되어 간소화된다:

$$
\alpha = \min\left(1, \; \frac{P(X|\theta^*) \cdot P(\theta^*)}{P(X|\theta_t) \cdot P(\theta_t)}\right)
$$

4. 균일 난수 $u \sim U(0,1)$을 뽑아서 $u < \alpha$이면 $\theta_{t+1} = \theta^*$ (수용), 아니면 $\theta_{t+1} = \theta_t$ (제자리).
5. 2-4를 수천~수만 번 반복한다.

여기서 핵심적인 통찰이 있다. 수용 확률의 비율에서 **정규화 상수 $P(X)$가 상쇄된다**. 분자와 분모 모두 $P(\theta|X) \propto P(X|\theta)P(\theta)$이므로, 정규화 상수를 모르고도 사후분포에서 샘플링할 수 있다.

### Python으로 직접 구현: 1D Metropolis-Hastings

동전 편향 추정 문제를 MCMC로 풀어보자. Beta-Binomial은 해석해가 있으므로 MCMC가 불필요하지만, 결과를 해석해와 비교 검증할 수 있어서 학습용으로 적합하다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# --- 데이터 ---
true_p = 0.65
n_flips = 50
data = np.random.binomial(1, true_p, size=n_flips)
k = data.sum()  # 성공 횟수

# --- 사전분포: Beta(2, 2) ---
alpha_prior, beta_prior = 2, 2

def log_posterior(p, k, n, alpha, beta):
    """비정규화 로그 사후분포 (정규화 상수 불필요)"""
    if p <= 0 or p >= 1:
        return -np.inf  # 모수 공간 밖
    log_likelihood = k * np.log(p) + (n - k) * np.log(1 - p)
    log_prior = (alpha - 1) * np.log(p) + (beta - 1) * np.log(1 - p)
    return log_likelihood + log_prior

# --- Metropolis-Hastings ---
n_samples = 50000
proposal_sd = 0.05      # 제안 분포의 표준편차
samples = np.zeros(n_samples)
samples[0] = 0.5         # 시작점
accepted = 0

for t in range(1, n_samples):
    # 1. 제안
    current = samples[t - 1]
    proposed = np.random.normal(current, proposal_sd)

    # 2. 수용 확률 (로그 스케일)
    log_alpha = log_posterior(proposed, k, n_flips, alpha_prior, beta_prior) \
              - log_posterior(current,  k, n_flips, alpha_prior, beta_prior)

    # 3. 수용/기각
    if np.log(np.random.uniform()) < log_alpha:
        samples[t] = proposed
        accepted += 1
    else:
        samples[t] = current

burn_in = 5000
posterior_samples = samples[burn_in:]  # 번인(burn-in) 제거

print(f"수용률: {accepted / n_samples:.1%}")
# 수용률: ~45-55% (적정 범위)

print(f"MCMC 사후 평균: {posterior_samples.mean():.4f}")
print(f"MCMC 사후 표준편차: {posterior_samples.std():.4f}")

# 해석해와 비교
alpha_post = alpha_prior + k
beta_post = beta_prior + (n_flips - k)
exact_posterior = stats.beta(alpha_post, beta_post)
print(f"해석해 사후 평균: {exact_posterior.mean():.4f}")
print(f"해석해 사후 표준편차: {exact_posterior.std():.4f}")

# 95% 신용구간 비교
mcmc_ci = np.percentile(posterior_samples, [2.5, 97.5])
exact_ci = exact_posterior.ppf([0.025, 0.975])
print(f"MCMC 95% CI:  [{mcmc_ci[0]:.4f}, {mcmc_ci[1]:.4f}]")
print(f"해석해 95% CI: [{exact_ci[0]:.4f}, {exact_ci[1]:.4f}]")
```

MCMC 결과와 해석해가 매우 가까울 것이다. 5만 개의 샘플(번인 5,000 제거)이면 1차원 문제에서는 충분하다. 다만 고차원 문제에서는 수렴 진단이 필수적인데, 이에 대해서는 마지막 섹션에서 정리한다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 실무에서의 MCMC 도구</strong><br>
직접 구현은 학습용이다. 실무에서는 검증된 라이브러리를 사용한다:<br>
• <strong>PyMC</strong> — Python 베이지안 모델링의 표준. NUTS(No-U-Turn Sampler) 기반으로 고차원에서도 효율적이다.<br>
• <strong>Stan (PyStan/CmdStanPy)</strong> — HMC(Hamiltonian Monte Carlo) 기반. 산업계와 학계 모두에서 널리 사용된다.<br>
• <strong>emcee</strong> — 앙상블 샘플러. 천문학 커뮤니티에서 시작해 범용으로 확산되었다.<br>
이들은 자동 미분, 수렴 진단, 사후 예측 검사 등을 기본 제공하므로, MCMC의 원리를 이해한 뒤에는 이런 도구로 넘어가는 것이 바람직하다.</div>

---

## 같은 문제, 두 가지 풀이

이론을 충분히 다뤘으니, 이제 하나의 문제를 두 패러다임으로 나란히 풀어보자. 동전을 30번 던져 앞면이 21번 나왔다. 이 동전은 공정한가?

### 빈도주의 접근

```python
import numpy as np
from scipy import stats

n, k = 30, 21

# 1. MLE
p_hat = k / n
print(f"MLE: p̂ = {p_hat:.4f}")
# MLE: p̂ = 0.7000

# 2. 95% 신뢰구간 (Wald)
se = np.sqrt(p_hat * (1 - p_hat) / n)
ci_freq = (p_hat - 1.96 * se, p_hat + 1.96 * se)
print(f"95% 신뢰구간: [{ci_freq[0]:.4f}, {ci_freq[1]:.4f}]")
# 95% 신뢰구간: [0.5361, 0.8639]

# 3. 가설검정: H0: p = 0.5 vs H1: p ≠ 0.5
z = (p_hat - 0.5) / np.sqrt(0.5 * 0.5 / n)
p_value = 2 * (1 - stats.norm.cdf(abs(z)))
print(f"z = {z:.4f}, p-value = {p_value:.4f}")
# z = 2.1909, p-value = 0.0285
```

빈도주의 결론: p-value = 0.028 < 0.05이므로 **귀무가설을 기각**한다. 이 동전은 공정하지 않다는 증거가 있다. 하지만 "공정하지 않을 확률이 얼마인지"는 빈도주의에서 답할 수 없는 질문이다.

### 베이지안 접근

```python
import numpy as np
from scipy import stats

n, k = 30, 21

# 사전분포: Beta(2, 2) — 공정한 동전 근처의 약한 사전 지식
alpha_prior, beta_prior = 2, 2

# 사후분포
alpha_post = alpha_prior + k    # 23
beta_post = beta_prior + (n - k) # 11
posterior = stats.beta(alpha_post, beta_post)

# 1. MAP 추정
p_map = (alpha_post - 1) / (alpha_post + beta_post - 2)
print(f"MAP: p̂ = {p_map:.4f}")
# MAP: p̂ = 0.6875

# 2. 사후 평균
print(f"사후 평균: {posterior.mean():.4f}")
# 사후 평균: 0.6765

# 3. 95% 신용구간
ci_bayes = posterior.ppf([0.025, 0.975])
print(f"95% 신용구간: [{ci_bayes[0]:.4f}, {ci_bayes[1]:.4f}]")
# 95% 신용구간: [0.5129, 0.8204]

# 4. "p > 0.5일 확률" — 베이지안에서만 가능한 직접적 확률 진술
prob_biased = 1 - posterior.cdf(0.5)
print(f"P(p > 0.5 | data) = {prob_biased:.4f}")
# P(p > 0.5 | data) = 0.9825

# 5. "p가 0.45~0.55 사이일 확률" (거의 공정한 동전)
prob_fair = posterior.cdf(0.55) - posterior.cdf(0.45)
print(f"P(0.45 < p < 0.55 | data) = {prob_fair:.4f}")
# P(0.45 < p < 0.55 | data) = 0.0587
```

베이지안 결론: $P(p > 0.5 \mid \text{data}) \approx 0.98$ — 이 동전이 앞면 쪽으로 편향되었을 확률이 약 98%다. "p가 0.45에서 0.55 사이(거의 공정)"일 확률은 약 6%에 불과하다.

### 비교 요약

| | 빈도주의 | 베이지안 |
|---|---|---|
| **점추정** | $\hat{p}=0.70$ | MAP=0.69, 평균=0.68 |
| **구간추정** | CI: [0.54, 0.86] | CrI: [0.51, 0.82] |
| **검정** | p-value=0.028 (기각) | $P(p>0.5\mid\text{data})=0.98$ |
| **해석** | "이 절차가 장기적으로 참을 포함할 확률 95%" | "p가 이 구간에 있을 확률 95%" |

베이지안 점추정(0.68~0.69)이 MLE(0.70)보다 약간 작은 이유는 $\text{Beta}(2,2)$ 사전분포가 0.5 방향으로 수축(shrinkage)시키기 때문이다. 신용구간이 신뢰구간보다 약간 좁은 것도 사전분포가 추가 정보를 제공한 결과다.

---

## 마치며: 추론 시리즈를 돌아보며

이 글로 stats-inference 시리즈가 완결된다. 14편에 걸친 여정을 돌아보자.

[확률의 기초](/stats/probability-fundamentals/)에서 표본 공간과 확률 공리를 정의하며 출발했고, [조건부 확률과 베이즈 정리](/stats/conditional-probability-bayes/)에서 정보가 확률을 바꾸는 메커니즘을 처음 만났다. [확률변수와 기댓값](/stats/random-variables-expectation/), [이산 분포](/stats/discrete-distributions/), [연속 분포](/stats/continuous-distributions/)를 거치며 불확실성을 수학적으로 모델링하는 언어를 익혔고, [대수의 법칙과 중심극한정리](/stats/lln-and-clt/)에서 표본과 모집단을 잇는 다리를 놓았다.

이 토대 위에서 추론의 도구들이 하나씩 쌓였다. [점추정](/stats/point-estimation/)으로 "좋은 추정량이란 무엇인가"라는 근본 질문을 던졌고, [MLE](/stats/mle-and-mom/)로 추정량을 체계적으로 찾는 방법을 배웠다. [구간추정](/stats/confidence-intervals/)으로 불확실성을 구간으로 표현하는 법을, [가설검정](/stats/hypothesis-testing/)과 [검정 방법들](/stats/statistical-tests/)로 의사결정의 틀을 완성했다. [부트스트랩](/stats/bootstrap/)에서는 분포 가정이 어려울 때의 비모수적 우회로까지 확보했다. 이 모든 것이 빈도주의 패러다임 안에서의 이야기였다.

그리고 이 마지막 글에서, 같은 추론 문제를 전혀 다른 관점으로 바라보는 법을 배웠다. 사전 지식과 데이터를 결합하는 베이지안 관점에서는, 사후분포라는 하나의 객체 안에 점추정, 구간추정, 검정이 모두 녹아 있다. 통계적 추론의 통합적 프레임워크라 할 만하다.

### 흔히 빠지는 함정들

시리즈를 마무리하기 전에, 베이지안 추론에서 자주 만나는 오해와 실수를 짚고 넘어가자.

**"사전분포가 주관적이라 신뢰할 수 없다"** — 가장 흔한 비판이다. 하지만 빈도주의도 완전히 객관적이지는 않다. 모델 선택, 유의수준 설정, 단측/양측 검정의 선택 모두 분석자의 판단이다. 사전분포는 이 판단을 **명시적으로 드러낸다**는 점에서 오히려 투명하다. 데이터가 충분히 많으면 합리적인 사전분포 사이의 차이는 사라진다.

**MCMC 수렴 진단을 무시하는 실수**도 흔하다. 체인이 수렴하지 않았다면 결과는 의미 없다. 반드시 확인해야 할 세 가지가 있다:

- **Trace plot**: 체인이 하나의 영역에 안정적으로 머무르는지 시각적으로 확인
- <strong>$\hat{R}$ (R-hat)</strong>: 여러 체인 간 분산과 체인 내 분산의 비율. $\hat{R} < 1.01$이면 수렴으로 판단
- **유효 표본 크기(ESS)**: 자기상관을 고려한 실질적 독립 표본 수. 최소 수백 이상 확보

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ 수렴하지 않은 MCMC는 쓰레기다</strong><br>
"5만 개 샘플을 뽑았으니 충분하다"는 위험한 가정이다. 체인이 사후분포의 일부 영역에만 갇혀 있을 수 있다(multi-modality). 반드시 trace plot을 확인하고, 서로 다른 시작점의 여러 체인을 돌려서 $\hat{R}$을 계산하라. PyMC와 Stan은 이 진단을 자동으로 수행한다.</div>

**사전분포와 우도의 스케일 불일치** 역시 주의해야 한다. 사전분포가 우도와 완전히 다른 영역을 커버하면 MCMC가 효율적으로 탐색하지 못한다. 데이터가 $\theta \approx 100$ 근처를 가리키는데 사전분포가 $N(0, 1)$이면 사후분포의 밀도가 극히 낮은 영역만 헤매게 된다.

마지막으로, **베이지안이 항상 더 나은 것은 아니다.** 사전분포를 잘못 설정하면 MLE보다 못한 결과를 낼 수 있고, 데이터가 충분히 많으면 빈도주의 방법이 계산적으로 유리하면서 결과도 거의 동일하다.

### 두 패러다임, 하나의 도구 상자

**빈도주의와 베이지안 중 하나가 옳고 하나가 틀린 것이 아니다.** 모수를 상수로 보는 관점과 확률변수로 보는 관점은 서로 다른 철학이며, 각각이 더 자연스러운 문제 영역이 있다. 두 도구를 모두 이해하고 상황에 맞게 선택할 수 있다면, 여러분은 훨씬 유연한 데이터 분석자가 될 것이다.

다음 시리즈 **stats-applied(응용 통계)**에서는 이 추론 도구들을 실전에 적용한다. 탐색적 데이터 분석(EDA), 표본 추출 설계, A/B 테스트, 그리고 통계적 함정들 — 이론이 현실과 만나는 지점을 다룰 예정이다.

---

## 참고자료

- Gelman, A. et al. *Bayesian Data Analysis* (3rd ed.). Chapman & Hall/CRC, 2013. — 베이지안 통계의 표준 교재
- McElreath, R. *Statistical Rethinking* (2nd ed.). CRC Press, 2020. — 직관적 설명과 R/Stan 실습
- Kruschke, J. *Doing Bayesian Data Analysis* (2nd ed.). Academic Press, 2014. — "Puppy Book"으로 불리는 실용 입문서
- Murphy, K. *Probabilistic Machine Learning: An Introduction*. MIT Press, 2022. — ML 관점의 베이지안 접근
- [PyMC Documentation](https://www.pymc.io/projects/docs/en/stable/) — Python 베이지안 모델링 공식 문서
