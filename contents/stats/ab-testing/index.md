---
date: '2026-02-25'
title: 'A/B 테스트 설계와 분석: 가설 수립부터 의사결정까지'
category: 'Statistics'
series: 'stats'
seriesOrder: 17
tags: ['A/B Testing', '실험 설계', '검정력 분석', 'Proportion Test', '인과 추론']
summary: 'A/B 테스트의 가설 수립, 표본 크기 설계, 비율·연속형 지표 분석, 조기 종료 함정까지 — 실험 설계와 통계 분석의 전 과정을 Python으로 구현한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/sampling-and-bias/)에서 표본 추출을 다뤘다. 올바른 표본을 얻었다면, 이제 실험을 설계할 차례다. "새 UI로 전환율이 올랐다!" — 정말? 우연의 결과가 아닌지 어떻게 확신하는가?

제품 개발에서 "느낌"으로 의사결정을 내리는 시대는 지났다. Google은 연간 10,000건 이상의 A/B 테스트를 실행하고, Netflix는 UI의 모든 변경 사항을 실험으로 검증한다. A/B 테스트는 [가설검정](/stats/hypothesis-testing/)의 가장 실용적인 응용이며, 데이터 기반 의사결정의 핵심 도구다.

이 글에서는 A/B 테스트를 올바르게 설계하고, 결과를 정확하게 분석하는 전 과정을 다룬다.

---

## A/B 테스트의 구조

### 대조군과 실험군

A/B 테스트의 구조는 단순하다. 사용자를 두 그룹으로 나누어 서로 다른 경험을 제공하고, 결과를 비교한다.

| 구성 요소 | 설명 | 예시 |
|---|---|---|
| **대조군(Control, A)** | 현재 버전을 경험하는 그룹 | 기존 결제 페이지 |
| **실험군(Treatment, B)** | 변경된 버전을 경험하는 그룹 | 새 결제 페이지 |
| **무작위 배정(Randomization)** | 사용자를 랜덤으로 A/B에 할당 | 사용자 ID 해시 기반 |
| **핵심 지표(Primary Metric)** | 비교의 기준이 되는 측정값 | 전환율, 평균 매출 |

```
사용자 풀 (N명)
    │
    ├─── 무작위 배정 ───┐
    │                    │
    ▼                    ▼
 대조군 (A)          실험군 (B)
 기존 UI              새 UI
    │                    │
    ▼                    ▼
 지표 측정            지표 측정
 (전환율 p_A)        (전환율 p_B)
    │                    │
    └────── 비교 ────────┘
              │
         p_B - p_A 가
        우연인가, 실재인가?
```

### 무작위 배정이 핵심인 이유

A/B 테스트가 단순한 전후 비교와 근본적으로 다른 이유는 **무작위 배정(Randomization)** 때문이다. 무작위 배정은 관측되지 않는 교란 변수(Confounding Variable)의 영향을 두 그룹 사이에 균등하게 분배한다. 이로써 그룹 간 지표 차이를 **처리 효과**(Treatment Effect)로 귀인할 수 있게 되는 것이다.

예를 들어 "주말에 새 UI를 출시하고 전환율이 올랐다"는 분석에서, 전환율 상승이 새 UI 때문인지 주말 효과 때문인지 구분할 수 없다. 무작위 배정은 이런 혼동을 원천적으로 차단한다.

:::info

**💡 인과 추론의 근본 문제**

한 사용자가 A와 B를 동시에 경험할 수는 없다. 이를 **인과 추론의 근본 문제**(Fundamental Problem of Causal Inference)라고 한다. 무작위 배정은 이 문제를 집단 수준에서 해결한다 — 두 그룹의 잠재 결과(Potential Outcome) 분포가 동일해지므로, 관측된 차이를 처리 효과로 해석할 수 있다.

:::

---

## 실험 설계 5단계

A/B 테스트에서 분석은 쉽다. 어려운 것은 설계다. 잘못 설계된 실험은 아무리 정교하게 분석해도 올바른 결론을 내릴 수 없다. 실험 설계는 다음 5단계를 거친다.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1. 가설  │──▶│ 2. 지표  │──▶│ 3. 표본  │──▶│ 4. 배정  │──▶│ 5. 기간  │
│   수립   │   │   선정   │   │ 크기 결정│   │   방법   │   │   결정   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### 1단계: 가설 수립

"새 UI가 더 좋을 것 같다"는 가설이 아니다. [가설검정](/stats/hypothesis-testing/)에서 배운 대로, 통계적으로 검증 가능한 형태로 수립해야 한다.

- <strong>$H_0$</strong>: 새 UI의 전환율은 기존 UI와 같다 ($p_B = p_A$)
- <strong>$H_1$</strong>: 새 UI의 전환율은 기존 UI보다 높다 ($p_B > p_A$)

단측 검정(One-sided)과 양측 검정(Two-sided)의 선택은 사전에 결정해야 한다. "일단 양측으로 돌려보고, 유의하면 단측으로 바꿔 보겠다"는 p-hacking의 전형적인 패턴이다.

### 2단계: 지표 선정

A/B 테스트의 지표는 세 종류로 나뉜다.

| 지표 유형 | 역할 | 예시 |
|---|---|---|
| **1차 지표(Primary)** | 의사결정의 기준 — 딱 하나만 | 구매 전환율 |
| **2차 지표(Secondary)** | 변화의 메커니즘 이해 | 장바구니 담기율, 페이지 체류 시간 |
| **가드레일 지표(Guardrail)** | 나빠지면 안 되는 것 | 이탈률, 에러율, 로딩 시간 |

1차 지표가 여러 개면 다중 비교 문제(Multiple Comparisons Problem)가 발생한다. 유의수준 $\alpha = 0.05$로 10개 지표를 검정하면, 하나 이상 거짓 양성(False Positive)이 나올 확률이 $1 - (1 - 0.05)^{10} \approx 0.40$이다. 1차 지표는 반드시 하나만 정해야 한다.

### 3단계: 표본 크기 결정 (검정력 분석)

이 단계가 가장 중요하다. 표본이 부족하면 실제로 효과가 있어도 감지하지 못한다. 표본 크기 결정에 필요한 네 가지 파라미터는 다음과 같다.

| 파라미터 | 기호 | 의미 | 일반적 값 |
|---|---|---|---|
| 유의수준 | $\alpha$ | 1종 오류 허용 범위 | 0.05 |
| 검정력 | $1 - \beta$ | 효과가 있을 때 감지할 확률 | 0.80 |
| 최소 감지 효과 크기(MDE) | $\delta$ | 감지하고 싶은 최소 차이 | 비즈니스 맥락에 따라 |
| 기저 지표 | $p_0$ (또는 $\sigma$) | 현재 전환율 또는 표준편차 | 과거 데이터에서 추정 |

### 4단계: 무작위 배정

실무에서 가장 흔한 방식은 사용자 ID의 해시값을 기반으로 배정하는 것이다. 세션 기반 배정은 같은 사용자가 A와 B를 번갈아 경험할 수 있어 위험하다.

### 5단계: 실험 기간 결정

표본 크기를 일일 트래픽으로 나누면 최소 실험 기간이 나온다. 단, 요일 효과를 보정하기 위해 최소 1~2주(한 주기 이상)는 실행해야 한다.

---

## 표본 크기와 검정력

### 비율 검정의 표본 크기 공식

전환율 비교(비율 검정)에서 양측 검정의 그룹당 필요 표본 수는 다음과 같다.

$$n = \left(\frac{z_{\alpha/2} + z_{\beta}}{\delta}\right)^2 \cdot \left[\bar{p}(1 - \bar{p}) \cdot 2\right]$$

여기서 $\bar{p} = (p_A + p_B) / 2$는 통합 비율, $\delta = p_B - p_A$는 MDE다. 이 공식은 $H_0$과 $H_1$ 하의 분산을 동일하게 $\bar{p}(1-\bar{p})$로 놓은 **근사 공식**이다. MDE가 작을 때는 정밀 공식과 거의 차이가 없어 실무에서 널리 사용된다.

### Python으로 검정력 분석

`statsmodels`의 검정력 분석 모듈을 사용하면 간단하다.

```python
import numpy as np
from statsmodels.stats.proportion import proportion_effectsize
from statsmodels.stats.power import NormalIndPower

# 현재 전환율과 기대 전환율
p_control = 0.10       # 현재 전환율 10%
p_treatment = 0.12     # 기대 전환율 12% (MDE = 2%p)

# 효과 크기(Cohen's h) 계산
effect_size = proportion_effectsize(p_treatment, p_control)
print(f"Cohen's h: {effect_size:.4f}")
# Cohen's h: 0.0640

# 그룹당 필요 표본 수
power_analysis = NormalIndPower()
n_per_group = power_analysis.solve_power(
    effect_size=effect_size,
    alpha=0.05,
    power=0.80,
    alternative='two-sided'
)
print(f"그룹당 필요 표본 수: {n_per_group:.0f}")
print(f"총 필요 표본 수: {2 * n_per_group:.0f}")
# 그룹당 필요 표본 수: 3835
# 총 필요 표본 수: 7669
```

전환율 10%에서 2%p 상승을 감지하려면 그룹당 약 3,800명이 필요하다. MDE가 작을수록 필요 표본 수는 급격히 증가한다.

### MDE에 따른 표본 크기 변화

MDE를 바꿔가며 필요 표본 수의 변화를 확인해보자.

```python
import numpy as np
from statsmodels.stats.proportion import proportion_effectsize
from statsmodels.stats.power import NormalIndPower

p_control = 0.10
mde_list = [0.005, 0.01, 0.02, 0.03, 0.05]
power_analysis = NormalIndPower()

print(f"{'MDE':>8} {'p_treatment':>12} {'Cohen h':>10} {'n/group':>10}")
print("-" * 44)
for mde in mde_list:
    p_treatment = p_control + mde
    es = proportion_effectsize(p_treatment, p_control)
    n = power_analysis.solve_power(
        effect_size=es, alpha=0.05, power=0.80, alternative='two-sided'
    )
    print(f"{mde:>8.3f} {p_treatment:>12.3f} {es:>10.4f} {n:>10.0f}")
# MDE    p_treatment    Cohen h    n/group
# --------------------------------------------
#    0.005        0.105     0.0165     57756
#    0.010        0.110     0.0326     14744
#    0.020        0.120     0.0640      3835
#    0.030        0.130     0.0942      1768
#    0.050        0.150     0.1519       680
```

0.5%p 차이를 감지하려면 그룹당 약 58,000명이 필요하지만, 5%p 차이는 680명이면 충분하다. MDE 설정이 실험 비용에 직결되는 핵심 의사결정임을 알 수 있다.

:::note

**⚠️ MDE는 비즈니스 의사결정이다**

MDE를 0.1%p로 설정하면 수십만 명이 필요하고, 5%p로 설정하면 수백 명이면 된다. 핵심은 "어느 정도의 변화가 실제로 비즈니스에 의미 있는가?"를 먼저 정의하는 것이다. 이는 통계가 아니라 비즈니스 맥락에서 답해야 할 질문이다.

:::

---

## 결과 분석: 비율 검정

전환율, 클릭률 등 이진(Binary) 지표의 A/B 테스트는 **비율 검정**(Proportion Test)으로 분석한다.

### 두 비율의 z-검정

A/B 테스트에서 가장 기본적인 분석이다. 대조군과 실험군의 전환율 차이가 통계적으로 유의한지 검정한다.

검정 통계량은 다음과 같다.

$$Z = \frac{\hat{p}_B - \hat{p}_A}{\sqrt{\hat{p}(1 - \hat{p})\left(\frac{1}{n_A} + \frac{1}{n_B}\right)}}$$

여기서 $\hat{p} = \frac{x_A + x_B}{n_A + n_B}$는 통합 비율(Pooled Proportion)이다. $H_0$ 하에서 $Z \sim N(0,1)$을 따르므로 p-value를 바로 계산할 수 있다.

```python
import numpy as np
from statsmodels.stats.proportion import proportions_ztest, proportion_confint

np.random.seed(42)

# 실험 데이터 시뮬레이션
n_A, n_B = 4000, 4000
p_true_A, p_true_B = 0.100, 0.118

conversions_A = np.random.binomial(n_A, p_true_A)
conversions_B = np.random.binomial(n_B, p_true_B)
print(f"대조군: {conversions_A}/{n_A} = {conversions_A/n_A:.4f}")
print(f"실험군: {conversions_B}/{n_B} = {conversions_B/n_B:.4f}")
# 대조군: 385/4000 = 0.0963
# 실험군: 475/4000 = 0.1187

# 양측 비율 z-검정
count = np.array([conversions_A, conversions_B])
nobs = np.array([n_A, n_B])
z_stat, p_value = proportions_ztest(count, nobs, alternative='two-sided')
print(f"\nz-통계량: {z_stat:.4f}")
print(f"p-value: {p_value:.4f}")
# z-통계량: -3.2485
# p-value: 0.0012

# 각 그룹의 95% Wilson 신뢰구간
ci_A = proportion_confint(conversions_A, n_A, alpha=0.05, method='wilson')
ci_B = proportion_confint(conversions_B, n_B, alpha=0.05, method='wilson')
print(f"\n대조군 95% CI: [{ci_A[0]:.4f}, {ci_A[1]:.4f}]")
print(f"실험군 95% CI: [{ci_B[0]:.4f}, {ci_B[1]:.4f}]")
# 대조군 95% CI: [0.0875, 0.1058]
# 실험군 95% CI: [0.1091, 0.1291]

# 차이의 신뢰구간 (Wald)
p_A_hat = conversions_A / n_A
p_B_hat = conversions_B / n_B
diff = p_B_hat - p_A_hat
se_diff = np.sqrt(p_A_hat*(1-p_A_hat)/n_A + p_B_hat*(1-p_B_hat)/n_B)
ci_diff = (diff - 1.96*se_diff, diff + 1.96*se_diff)
print(f"\n전환율 차이: {diff:.4f} ({diff*100:.2f}%p)")
print(f"차이의 95% CI: [{ci_diff[0]:.4f}, {ci_diff[1]:.4f}]")
# 전환율 차이: 0.0225 (2.25%p)
# 차이의 95% CI: [0.0089, 0.0361]
```

p-value가 0.05보다 작으므로 귀무가설을 기각한다. 전환율 차이의 95% 신뢰구간이 0을 포함하지 않으므로, [신뢰구간](/stats/confidence-intervals/)의 관점에서도 동일한 결론이다.

### Wilson 신뢰구간을 쓰는 이유

비율의 신뢰구간에는 Wald, Wilson, Clopper-Pearson 등 여러 방법이 있다. **Wilson 신뢰구간**은 $n\hat{p}$가 작을 때도 포함 확률(Coverage Probability)이 명목 수준에 가까워 실무에서 권장된다. Wald 구간은 표본이 작거나 비율이 0이나 1에 가까울 때 포함 확률이 급격히 떨어진다.

### 통계적 유의성 vs 실질적 유의성

p-value가 작다고 비즈니스적으로 의미 있는 것은 아니다. 표본이 수백만이면 0.01%p 차이도 통계적으로 유의할 수 있다. 반드시 **효과 크기**(Effect Size)를 함께 보고해야 한다.

| 기준 | 질문 | 도구 |
|---|---|---|
| 통계적 유의성 | 차이가 우연인가? | p-value |
| 실질적 유의성 | 차이가 비즈니스에 중요한가? | 효과 크기, 신뢰구간 |

"전환율이 통계적으로 유의하게 0.02%p 상승했다"는 보고서는 의미가 없다. 상대적 효과 크기($\text{Lift} = \Delta p / p_A$)와 비즈니스 임팩트를 함께 제시해야 의사결정에 쓸 수 있다.

---

## 연속형 지표 분석

전환율 같은 이진 지표가 아닌, 평균 매출(ARPU), 체류 시간 같은 연속형 지표는 t-검정과 부트스트랩으로 분석한다.

### Welch t-검정

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# 사용자당 매출 (로그정규분포로 시뮬레이션 — 매출 데이터의 전형적 분포)
n_A, n_B = 2000, 2000
revenue_A = np.random.lognormal(mean=3.0, sigma=1.0, size=n_A)
revenue_B = np.random.lognormal(mean=3.05, sigma=1.0, size=n_B)  # 약 5% 상승

print(f"대조군 평균 매출: ${np.mean(revenue_A):.2f} (std: ${np.std(revenue_A, ddof=1):.2f})")
print(f"실험군 평균 매출: ${np.mean(revenue_B):.2f} (std: ${np.std(revenue_B, ddof=1):.2f})")
# 대조군 평균 매출: $34.48 (std: $46.29)
# 실험군 평균 매출: $34.96 (std: $49.15)

# Welch t-검정
t_stat, p_value = stats.ttest_ind(revenue_A, revenue_B, equal_var=False)
print(f"\nt-통계량: {t_stat:.4f}")
print(f"p-value: {p_value:.4f}")
# t-통계량: -0.3167
# p-value: 0.7515

# 평균 차이의 신뢰구간
diff = np.mean(revenue_B) - np.mean(revenue_A)
se = np.sqrt(np.var(revenue_A, ddof=1)/n_A + np.var(revenue_B, ddof=1)/n_B)
ci = (diff - 1.96*se, diff + 1.96*se)
print(f"\n평균 매출 차이: ${diff:.2f}")
print(f"차이의 95% CI: [${ci[0]:.2f}, ${ci[1]:.2f}]")
# 평균 매출 차이: $0.48
# 차이의 95% CI: [$-2.48, $3.44]
```

p-value가 0.05보다 크고, 신뢰구간이 0을 포함한다. 매출 차이가 통계적으로 유의하지 않다는 뜻이다. 매출 데이터는 분산이 크기 때문에(오른쪽으로 긴 꼬리), 같은 효과 크기를 감지하려면 전환율보다 훨씬 많은 표본이 필요하다.

### 부트스트랩 신뢰구간

매출 데이터는 정규 분포가 아니므로, [부트스트랩](/stats/bootstrap/)이 더 강건한 대안이다.

```python
import numpy as np

np.random.seed(42)

# 위와 동일한 데이터 생성
n_A, n_B = 2000, 2000
revenue_A = np.random.lognormal(mean=3.0, sigma=1.0, size=n_A)
revenue_B = np.random.lognormal(mean=3.05, sigma=1.0, size=n_B)

# 부트스트랩으로 평균 차이의 CI 추정
n_boot = 10000
boot_diffs = np.empty(n_boot)
for i in range(n_boot):
    boot_A = np.random.choice(revenue_A, size=n_A, replace=True)
    boot_B = np.random.choice(revenue_B, size=n_B, replace=True)
    boot_diffs[i] = np.mean(boot_B) - np.mean(boot_A)

ci_lower = np.percentile(boot_diffs, 2.5)
ci_upper = np.percentile(boot_diffs, 97.5)
print(f"부트스트랩 평균 차이: ${np.mean(boot_diffs):.2f}")
print(f"부트스트랩 95% CI: [${ci_lower:.2f}, ${ci_upper:.2f}]")
# 부트스트랩 평균 차이: $0.47
# 부트스트랩 95% CI: [$-2.46, $3.46]

# 부트스트랩 p-value (차이가 0 이하인 비율)
boot_p = np.mean(boot_diffs <= 0)
print(f"부트스트랩 p-value (단측): {boot_p:.4f}")
# 부트스트랩 p-value (단측): 0.3808
```

부트스트랩 신뢰구간도 0을 포함하므로, t-검정과 동일한 결론이다. 분포 가정에 의존하지 않으면서도 결론이 일치하면 분석 결과에 대한 신뢰도가 한층 높아진다.

:::info

**💡 연속형 지표 분석 전략**

매출 같은 분산이 큰 지표를 1차 지표로 쓰면 필요 표본 수가 폭증한다. 실무에서는 전환율(이진)을 1차 지표로, 매출(연속)을 2차 지표로 설정하는 것이 일반적이다. 분산 축소 기법(CUPED, 로그 변환, 아웃라이어 캐핑)을 활용하면 필요 표본 수를 줄일 수 있다.

:::

---

## 조기 종료의 함정: Peeking Problem

### 왜 중간에 결과를 보면 안 되는가

실험 도중 p-value를 확인하고 유의하면 일찍 종료하는 것 — 매우 자연스러운 행동이지만 통계적으로 심각한 오류를 낳는다. 이를 **피킹 문제(Peeking Problem)** 또는 **선택적 종료**(Optional Stopping)라고 한다.

핵심 원리는 이렇다. 효과가 전혀 없어도($H_0$이 참), 충분히 오래 반복 확인하면 **언젠가는** p-value < 0.05인 시점이 나타난다. 이것은 [확률론](/stats/probability-fundamentals/)의 필연적 결과다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# 시뮬레이션: 효과 없는 A/B 테스트에서 매일 p-value를 확인
n_per_day = 100
n_days = 50
false_positive_found = False

data_A = []
data_B = []

print("일자  |  누적 n  |  p_A    |  p_B    | p-value  | 유의?")
print("-" * 62)
for day in range(1, n_days + 1):
    # 두 그룹 모두 동일한 전환율 10% (효과 없음)
    data_A.extend(np.random.binomial(1, 0.10, n_per_day))
    data_B.extend(np.random.binomial(1, 0.10, n_per_day))

    n_curr = day * n_per_day
    p_A = np.mean(data_A)
    p_B = np.mean(data_B)

    # 풀링된 비율로 z-검정
    pooled_p = (sum(data_A) + sum(data_B)) / (2 * n_curr)
    if pooled_p == 0 or pooled_p == 1:
        continue
    se = np.sqrt(2 * pooled_p * (1 - pooled_p) / n_curr)
    z = (p_B - p_A) / se
    p_value = 2 * (1 - stats.norm.cdf(abs(z)))

    sig = "***" if p_value < 0.05 else ""
    if day <= 10 or day % 10 == 0 or p_value < 0.05:
        print(f"  {day:>3}  |  {n_curr:>5}  | {p_A:.4f} | {p_B:.4f} | {p_value:.4f}  | {sig}")
    if p_value < 0.05 and not false_positive_found:
        false_positive_found = True
        fp_day = day

if false_positive_found:
    print(f"\n=> 효과가 없는데도 {fp_day}일차에 '유의한' 결과가 나타났다!")
else:
    print(f"\n=> 50일 동안 거짓 양성이 나타나지 않았다.")
```

이 시뮬레이션에서 두 그룹의 전환율은 동일(10%)하다. 효과가 없는데도 반복 확인하면 거짓 양성이 등장할 수 있다. 매일 확인하면 50일 기준으로 거짓 양성 확률이 5%보다 훨씬 높아진다.

### 거짓 양성률의 누적

반복 확인 시 실제 1종 오류율을 시뮬레이션으로 확인해보자.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

n_simulations = 5000
n_per_day = 200
n_days = 30
check_days = [7, 14, 21, 30]  # p-value를 확인하는 시점

# 전략 1: 마지막 날만 확인
# 전략 2: 매주 확인 (4번), 하나라도 유의하면 종료
false_positive_fixed = 0
false_positive_peeking = 0

for sim in range(n_simulations):
    data_A = np.random.binomial(1, 0.10, n_per_day * n_days)
    data_B = np.random.binomial(1, 0.10, n_per_day * n_days)

    # 전략 1: 마지막 날만 확인
    n_total = n_per_day * n_days
    p_A = np.mean(data_A)
    p_B = np.mean(data_B)
    pooled = (np.sum(data_A) + np.sum(data_B)) / (2 * n_total)
    if pooled > 0 and pooled < 1:
        se = np.sqrt(2 * pooled * (1 - pooled) / n_total)
        z = (p_B - p_A) / se
        p_val = 2 * (1 - stats.norm.cdf(abs(z)))
        if p_val < 0.05:
            false_positive_fixed += 1

    # 전략 2: 매주 확인
    peeking_positive = False
    for d in check_days:
        n_curr = n_per_day * d
        p_A_d = np.mean(data_A[:n_curr])
        p_B_d = np.mean(data_B[:n_curr])
        pooled_d = (np.sum(data_A[:n_curr]) + np.sum(data_B[:n_curr])) / (2 * n_curr)
        if pooled_d > 0 and pooled_d < 1:
            se_d = np.sqrt(2 * pooled_d * (1 - pooled_d) / n_curr)
            z_d = (p_B_d - p_A_d) / se_d
            p_val_d = 2 * (1 - stats.norm.cdf(abs(z_d)))
            if p_val_d < 0.05:
                peeking_positive = True
                break
    if peeking_positive:
        false_positive_peeking += 1

fpr_fixed = false_positive_fixed / n_simulations
fpr_peeking = false_positive_peeking / n_simulations
print(f"마지막 날만 확인 — 거짓 양성률: {fpr_fixed:.4f} ({fpr_fixed*100:.1f}%)")
print(f"매주 4회 확인   — 거짓 양성률: {fpr_peeking:.4f} ({fpr_peeking*100:.1f}%)")
print(f"거짓 양성률 증가 배수: {fpr_peeking/fpr_fixed:.1f}x")
# 마지막 날만 확인 — 거짓 양성률: 0.0442 (4.4%)
# 매주 4회 확인   — 거짓 양성률: 0.1242 (12.4%)
# 거짓 양성률 증가 배수: 2.8x
```

4번만 중간 확인해도 거짓 양성률이 약 3배로 뛴다. 매일 확인하면 이 수치는 더 올라간다. "유의하면 멈추겠다"는 전략은 유의수준 $\alpha$를 무력화시킨다.

### 순차 검정: 올바른 조기 종료

그렇다면 중간 점검은 원천적으로 불가능한가? 그렇지 않다. **순차 검정**(Sequential Testing)은 다중 확인을 고려하여 유의 수준을 조정하는 방법이다.

대표적인 방법이 **O'Brien-Fleming** 경계다. 초기에는 매우 엄격한 기준을 적용하고, 실험 후반부로 갈수록 일반적인 수준에 가까워진다.

```python
import numpy as np
from scipy import stats

# O'Brien-Fleming 경계 근사 (4회 중간 분석)
n_looks = 4
alpha = 0.05

# O'Brien-Fleming: 각 분석 시점에서의 z-경계
# 정보 분율 t_k = k/K에서 경계 z_k ≈ z_{α/2} / sqrt(t_k)
z_alpha = stats.norm.ppf(1 - alpha/2)
print(f"고정 표본 임계값: z = {z_alpha:.3f} (p < {alpha})")
print(f"\nO'Brien-Fleming 경계 (4회 분석):")
print(f"{'분석 시점':>10} {'정보 분율':>10} {'z-경계':>10} {'p-경계':>12}")
print("-" * 46)
for k in range(1, n_looks + 1):
    info_frac = k / n_looks
    z_boundary = z_alpha / np.sqrt(info_frac)
    p_boundary = 2 * (1 - stats.norm.cdf(z_boundary))
    print(f"  {k}/{n_looks}차{'':<4} {info_frac:>10.2f} {z_boundary:>10.3f} {p_boundary:>12.6f}")
# 고정 표본 임계값: z = 1.960 (p < 0.05)
#
# O'Brien-Fleming 경계 (4회 분석):
#  분석 시점  정보 분율      z-경계       p-경계
# ----------------------------------------------
#   1/4차          0.25      3.920     0.000089
#   2/4차          0.50      2.772     0.005575
#   3/4차          0.75      2.263     0.023625
#   4/4차          1.00      1.960     0.050000
```

1차 중간 분석에서는 p < 0.0001 수준이어야 종료할 수 있고, 최종 분석에서는 일반적인 0.05를 사용한다. 이렇게 하면 전체 실험의 1종 오류율을 $\alpha = 0.05$ 이하로 유지하면서도 조기 종료가 가능하다.

:::note

**⚠️ 순차 검정의 비용**

순차 검정은 공짜가 아니다. 중간 분석 횟수가 늘어날수록 최종 분석의 임계값이 높아지거나 필요 표본 수가 증가한다 (보통 2~5%). 하지만 명확한 효과가 있을 때 일찍 종료할 수 있으므로, 기대 표본 크기는 오히려 줄어드는 경우가 많다.

:::

---

## 실전 체크리스트

A/B 테스트의 전 과정을 체크리스트로 정리한다. 실험 전/중/후 각 단계에서 놓치기 쉬운 항목을 담았다.

| 단계 | 체크 항목 | 확인 |
|---|---|---|
| **실험 전** | 1차 지표를 하나만 정했는가? | ☐ |
| | 가설(단측/양측)을 사전에 결정했는가? | ☐ |
| | 검정력 분석으로 필요 표본 크기를 산출했는가? | ☐ |
| | MDE가 비즈니스적으로 의미 있는 크기인가? | ☐ |
| | 무작위 배정 단위(사용자/세션)를 정했는가? | ☐ |
| | 최소 실험 기간이 1주일 이상인가? | ☐ |
| **실험 중** | A/A 테스트로 시스템 검증을 했는가? | ☐ |
| | 중간에 p-value를 확인하고 있지 않은가? | ☐ |
| | (순차 검정 사용 시) 사전에 정한 경계를 따르고 있는가? | ☐ |
| | 가드레일 지표에 이상이 없는가? | ☐ |
| **실험 후** | 통계적 유의성과 실질적 유의성을 모두 보고했는가? | ☐ |
| | 효과 크기와 신뢰구간을 제시했는가? | ☐ |
| | 사후 세그먼트 분석에 다중 비교 보정을 적용했는가? | ☐ |
| | 노벨티 효과/학습 효과를 확인했는가? | ☐ |

---

## 흔한 실수와 함정

### 1. 표본 크기 부족

검정력 분석 없이 "일주일 정도면 되겠지"로 실험하는 경우. 표본이 부족하면 실제 효과가 있어도 감지하지 못한다(2종 오류). 효과가 없다는 결론이 아니라, **판단을 내릴 수 없는 상태**인 것이다.

### 2. Peeking (선택적 종료)

위에서 자세히 다뤘다. "매일 대시보드 확인"이 얼마나 위험한지, 그리고 순차 검정이라는 대안이 있다는 것을 기억하자.

### 3. 세그먼트 남용 (Texas Sharpshooter Fallacy)

전체 결과가 유의하지 않으면 하위 그룹을 쪼개서 유의한 세그먼트를 찾는 행위. 이는 **텍사스 명사수 오류** — 벽에 먼저 총을 쏘고 나서 구멍 주위에 과녁을 그리는 것과 같다. 20개 세그먼트를 검정하면 하나쯤은 우연히 유의하게 나온다. 사후 세그먼트 분석은 가설 생성 목적으로만 사용하고, Bonferroni 보정을 적용해야 한다.

### 4. 노벨티 효과 무시

새 UI에 대한 호기심으로 초기에 참여도가 높아지는 현상. 시간이 지나면 원래 수준으로 돌아간다. 이를 무시하고 초기 결과만 보면 효과를 과대추정한다. 실험 초반 1~2주 데이터를 제외하거나, 시간 경과에 따른 효과 추이를 확인해야 한다.

### 5. 네트워크 효과 무시

소셜 네트워크 서비스에서 A 그룹 사용자의 행동이 B 그룹 사용자에게 영향을 미치는 경우. 이러면 SUTVA(Stable Unit Treatment Value Assumption)가 위반되어 처리 효과 추정이 편향된다. 클러스터 무작위 배정(Cluster Randomization)이 대안이다.

---

## 마치며

A/B 테스트는 인과 추론을 실무에 적용하는 가장 강력한 도구다. 그 핵심은 무작위 배정에 있으며, 통계적 분석은 [가설검정](/stats/hypothesis-testing/), [신뢰구간](/stats/confidence-intervals/), [부트스트랩](/stats/bootstrap/)의 직접적인 응용이다.

그러나 A/B 테스트도 만능이 아니다. 표본 크기 부족, Peeking, 세그먼트 남용, 노벨티 효과 — 이런 함정에 빠지면 오히려 데이터 없이 직감으로 결정하는 것보다 더 위험해진다. "데이터에 기반했다"는 확신이 잘못된 결정을 정당화하기 때문이다.

[효과 크기의 추정](/stats/point-estimation/)은 결국 점추정의 문제이고, A/B 테스트 결과에 [부트스트랩 CI](/stats/bootstrap/)를 씌우면 분포 가정 없이도 불확실성을 정량화할 수 있다. 통계의 도구들이 하나의 실험 프레임워크 안에서 유기적으로 연결되는 것이다.

[다음 글](/stats/statistical-pitfalls/)에서는 A/B 테스트를 포함해 통계적 분석 전반에서 빠지기 쉬운 함정들을 다룬다. 심슨의 역설, 다중 비교 문제, 생존자 편향 — 통계를 잘못 쓰면 오히려 더 위험한 이유를 파헤친다.

---

## 참고자료

- Kohavi, R., Tang, D., & Xu, Y. (2020). *Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing*. Cambridge University Press.
- Deng, A., et al. (2013). "Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data." *WSDM 2013*.
- Johari, R., et al. (2017). "Peeking at A/B Tests: Why It Matters, and What to Do About It." *KDD 2017*.
- Statsmodels Documentation: [Proportion Tests](https://www.statsmodels.org/stable/stats.html#proportion)
- Evan Miller: [Sample Size Calculator](https://www.evanmiller.org/ab-testing/sample-size.html)
