---
date: '2026-02-25'
title: 'A/B 테스트 설계와 분석: 가설 수립부터 의사결정까지'
category: 'Statistics'
series: 'stats'
seriesOrder: 17
tags: ['A/B Testing', '실험 설계', '검정력 분석', 'Proportion Test', '인과 추론']
summary: 'A/B 테스트의 가설 수립, 표본 크기 설계, 비율·연속형 지표 분석, 조기 종료 함정까지 실험 설계와 통계 분석의 전 과정을 Python으로 구현한다.'
thumbnail: './thumbnail.png'
---

새 UI로 바꿨더니 전환율이 올랐다. 정말 새 UI 때문일까, 아니면 그 주에 운이 좋았던 걸까? A/B 테스트는 이 질문에 답하기 위한 도구다. Google, Microsoft, LinkedIn 같은 회사는 각각 연간 1만 건이 넘는 온라인 실험을 돌린다. 그 규모가 가능한 이유는 A/B 테스트가 가설검정을 제품 개발에 그대로 옮겨 놓은 구조이기 때문이다.

## A/B 테스트의 구조

A/B 테스트의 구조는 단순하다. 사용자를 두 그룹으로 나누어 서로 다른 경험을 제공하고 결과를 비교한다.

| 구성 요소 | 설명 | 예시 |
|---|---|---|
| **대조군(Control, A)** | 현재 버전을 경험하는 그룹 | 기존 결제 페이지 |
| **실험군(Treatment, B)** | 변경된 버전을 경험하는 그룹 | 새 결제 페이지 |
| **무작위 배정(Randomization)** | 사용자를 랜덤으로 A/B에 할당 | 사용자 ID 해시 기반 |
| **핵심 지표(Primary Metric)** | 비교의 기준이 되는 측정값 | 전환율, 평균 매출 |

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 326" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="A/B 테스트의 기본 구조. 사용자 풀을 무작위로 대조군 A와 실험군 B에 나눈 뒤 각각의 전환율을 측정하고 두 값의 차이를 검정한다.">
<style>
.ab-pool { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ab-ctl { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ab-trt { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.ab-cmp { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
.ab-n { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.ab-g { fill: var(--text-success, #107836); font-size: 15px; font-weight: 600; }
.ab-w { fill: var(--text-warn, #9d5604); font-size: 15px; font-weight: 600; }
.ab-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ab-l { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
</style>
<defs>
<marker id="abArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 사용자 풀 -->
<rect class="ab-pool" x="110" y="10" width="180" height="42" rx="6"/>
<text class="ab-n" x="200" y="36" text-anchor="middle">사용자 풀 (N명)</text>
<!-- 무작위 배정 분기 -->
<path class="ab-l" d="M 200 52 L 200 78"/>
<text class="ab-h" x="194" y="70" text-anchor="end">무작위 배정</text>
<path class="ab-l" d="M 100 78 L 300 78"/>
<path class="ab-l" d="M 100 78 L 100 92" marker-end="url(#abArrow)"/>
<path class="ab-l" d="M 300 78 L 300 92" marker-end="url(#abArrow)"/>
<!-- 두 그룹 -->
<rect class="ab-ctl" x="16" y="96" width="168" height="52" rx="6"/>
<text class="ab-n" x="100" y="118" text-anchor="middle">대조군 (A)</text>
<text class="ab-h" x="100" y="138" text-anchor="middle">기존 UI</text>
<rect class="ab-trt" x="216" y="96" width="168" height="52" rx="6"/>
<text class="ab-g" x="300" y="118" text-anchor="middle">실험군 (B)</text>
<text class="ab-h" x="300" y="138" text-anchor="middle">새 UI</text>
<!-- 지표 측정 -->
<path class="ab-l" d="M 100 148 L 100 174" marker-end="url(#abArrow)"/>
<path class="ab-l" d="M 300 148 L 300 174" marker-end="url(#abArrow)"/>
<rect class="ab-ctl" x="16" y="178" width="168" height="42" rx="6"/>
<text class="ab-n" x="100" y="204" text-anchor="middle">전환율 p_A</text>
<rect class="ab-trt" x="216" y="178" width="168" height="42" rx="6"/>
<text class="ab-g" x="300" y="204" text-anchor="middle">전환율 p_B</text>
<!-- 비교 -->
<path class="ab-l" d="M 100 220 L 100 250 L 200 250"/>
<path class="ab-l" d="M 300 220 L 300 250 L 200 250"/>
<path class="ab-l" d="M 200 250 L 200 264" marker-end="url(#abArrow)"/>
<rect class="ab-cmp" x="90" y="268" width="220" height="48" rx="6"/>
<text class="ab-w" x="200" y="290" text-anchor="middle">차이 p_B − p_A</text>
<text class="ab-h" x="200" y="308" text-anchor="middle">우연인지 검정</text>
</svg>
</div>

A/B 테스트가 단순한 전후 비교와 근본적으로 다른 이유는 **무작위 배정** 때문이다. 무작위 배정은 관측되지 않는 교란 변수(Confounding Variable)의 영향을 두 그룹 사이에 균등하게 분배한다. 그래서 그룹 간 지표 차이를 처리 효과(Treatment Effect)로 귀인할 수 있다. "주말에 새 UI를 출시했더니 전환율이 올랐다"는 관찰로는 UI 때문인지 주말 때문인지 구분할 수 없지만, 무작위 배정은 이런 혼동을 원천적으로 차단한다.

한 사용자가 A와 B를 동시에 경험할 수는 없다는 것이 인과 추론의 근본 문제(Fundamental Problem of Causal Inference)다. 무작위 배정은 이 문제를 개인이 아닌 집단 수준에서 해결한다.

## 실험 설계 5단계

A/B 테스트에서 분석은 쉽다. 어려운 것은 설계다. 잘못 설계된 실험은 아무리 정교하게 분석해도 올바른 결론을 낼 수 없다.

### 1단계: 가설 수립

"새 UI가 더 좋을 것 같다"는 가설이 아니다. 통계적으로 검증 가능한 형태여야 한다.

- **$H_0$**: 새 UI의 전환율은 기존 UI와 같다 ($p_B = p_A$)
- **$H_1$**: 새 UI의 전환율은 기존 UI보다 높다 ($p_B > p_A$)

단측 검정과 양측 검정의 선택은 사전에 결정한다. "일단 양측으로 돌려보고 유의하면 단측으로 바꾸겠다"는 p-hacking의 전형적인 패턴이다.

### 2단계: 지표 선정

| 지표 유형 | 역할 | 예시 |
|---|---|---|
| **1차 지표(Primary)** | 의사결정의 기준, 딱 하나만 | 구매 전환율 |
| **2차 지표(Secondary)** | 변화의 메커니즘 이해 | 장바구니 담기율, 페이지 체류 시간 |
| **가드레일 지표(Guardrail)** | 나빠지면 안 되는 것 | 이탈률, 에러율, 로딩 시간 |

1차 지표는 반드시 하나만 정한다. 여러 개를 동시에 놓고 "그중 하나라도 유의하면 성공"으로 판정하면 거짓 양성 확률이 명목 유의수준을 훌쩍 넘어선다.

### 3단계: 표본 크기 결정

이 단계가 가장 중요하다. 표본이 부족하면 실제로 효과가 있어도 감지하지 못한다. 필요한 파라미터는 네 가지다.

| 파라미터 | 기호 | 의미 | 일반적 값 |
|---|---|---|---|
| 유의수준 | $\alpha$ | 1종 오류 허용 범위 | 0.05 |
| 검정력 | $1 - \beta$ | 효과가 있을 때 감지할 확률 | 0.80 |
| 최소 감지 효과 크기(MDE) | $\delta$ | 감지하고 싶은 최소 차이 | 비즈니스 맥락에 따라 |
| 기저 지표 | $p_0$ (또는 $\sigma$) | 현재 전환율 또는 표준편차 | 과거 데이터에서 추정 |

### 4단계: 무작위 배정

실무에서 가장 흔한 방식은 사용자 ID의 해시값 기반 배정이다. 세션 기반 배정은 같은 사용자가 A와 B를 번갈아 경험할 수 있어 위험하다.

### 5단계: 실험 기간 결정

표본 크기를 일일 트래픽으로 나누면 최소 실험 기간이 나온다. 단, 요일 효과를 보정하려면 최소 1~2주(한 주기 이상)는 돌려야 한다.

## 표본 크기와 검정력

전환율 비교(비율 검정)에서 양측 검정의 그룹당 필요 표본 수는 다음과 같다.

$$n = \left(\frac{z_{\alpha/2} + z_{\beta}}{\delta}\right)^2 \cdot \left[\bar{p}(1 - \bar{p}) \cdot 2\right]$$

여기서 $\bar{p} = (p_A + p_B) / 2$는 통합 비율, $\delta = p_B - p_A$는 MDE다. $H_0$과 $H_1$ 하의 분산을 모두 $\bar{p}(1-\bar{p})$로 놓은 근사 공식이며, MDE가 작을 때는 정밀 공식과 거의 차이가 없어 실무에서 널리 쓰인다.

`statsmodels`를 쓰면 효과 크기(Cohen's h)를 거쳐 같은 값을 얻는다.

```python
import numpy as np
from statsmodels.stats.proportion import proportion_effectsize
from statsmodels.stats.power import NormalIndPower

p_control = 0.10       # 현재 전환율 10%
p_treatment = 0.12     # 기대 전환율 12% (MDE = 2%p)

effect_size = proportion_effectsize(p_treatment, p_control)
print(f"Cohen's h: {effect_size:.4f}")

power_analysis = NormalIndPower()
n_per_group = power_analysis.solve_power(
    effect_size=effect_size, alpha=0.05, power=0.80, alternative='two-sided'
)
print(f"그룹당 필요 표본 수: {n_per_group:.0f}")
print(f"총 필요 표본 수: {2 * n_per_group:.0f}")
# Cohen's h: 0.0640
# 그룹당 필요 표본 수: 3835
# 총 필요 표본 수: 7669
```

같은 계산을 MDE만 바꿔 반복하면 표본 수가 얼마나 가파르게 움직이는지 보인다.

| MDE | 기대 전환율 | Cohen's h | 그룹당 필요 표본 |
|---|---|---|---|
| 0.5%p | 10.5% | 0.0165 | 57,756 |
| 1%p | 11.0% | 0.0326 | 14,744 |
| 2%p | 12.0% | 0.0640 | 3,835 |
| 3%p | 13.0% | 0.0942 | 1,768 |
| 5%p | 15.0% | 0.1519 | 680 |

0.5%p 차이를 감지하려면 그룹당 약 58,000명이 필요하지만 5%p 차이는 680명이면 충분하다. MDE를 0.1%p로 잡으면 수십만 명이 필요하고 5%p로 잡으면 수백 명으로 끝난다. "어느 정도의 변화가 실제로 비즈니스에 의미 있는가"는 통계가 아니라 비즈니스 맥락에서 답해야 할 질문이고, 그 답이 곧 실험 비용을 결정한다.

## 결과 분석: 비율 검정

전환율, 클릭률 같은 이진 지표는 **비율 검정**(Proportion Test)으로 분석한다. 검정 통계량은 다음과 같다.

$$Z = \frac{\hat{p}_B - \hat{p}_A}{\sqrt{\hat{p}(1 - \hat{p})\left(\frac{1}{n_A} + \frac{1}{n_B}\right)}}$$

여기서 $\hat{p} = \frac{x_A + x_B}{n_A + n_B}$는 통합 비율(Pooled Proportion)이다. $H_0$ 하에서 $Z \sim N(0,1)$을 따르므로 p-value를 바로 계산할 수 있다. 위 정의와 부호를 맞추려면 `proportions_ztest`에 실험군을 먼저 넘긴다.

```python
import numpy as np
from statsmodels.stats.proportion import proportions_ztest, proportion_confint

np.random.seed(42)

n_A, n_B = 4000, 4000
conversions_A = np.random.binomial(n_A, 0.100)
conversions_B = np.random.binomial(n_B, 0.118)
print(f"대조군: {conversions_A}/{n_A} = {conversions_A/n_A:.4f}")
print(f"실험군: {conversions_B}/{n_B} = {conversions_B/n_B:.4f}")

# 실험군을 앞에 두어 Z = (p_B - p_A) / SE 부호와 일치시킨다
z_stat, p_value = proportions_ztest(
    np.array([conversions_B, conversions_A]),
    np.array([n_B, n_A]),
    alternative='two-sided',
)
print(f"z-통계량: {z_stat:.4f}")
print(f"p-value: {p_value:.4f}")

ci_A = proportion_confint(conversions_A, n_A, alpha=0.05, method='wilson')
ci_B = proportion_confint(conversions_B, n_B, alpha=0.05, method='wilson')
print(f"대조군 95% CI: [{ci_A[0]:.4f}, {ci_A[1]:.4f}]")
print(f"실험군 95% CI: [{ci_B[0]:.4f}, {ci_B[1]:.4f}]")

p_A_hat, p_B_hat = conversions_A / n_A, conversions_B / n_B
diff = p_B_hat - p_A_hat
se_diff = np.sqrt(p_A_hat*(1-p_A_hat)/n_A + p_B_hat*(1-p_B_hat)/n_B)
print(f"전환율 차이: {diff:.4f} ({diff*100:.2f}%p), 상대 향상(Lift): {diff/p_A_hat:.1%}")
print(f"차이의 95% CI: [{diff - 1.96*se_diff:.4f}, {diff + 1.96*se_diff:.4f}]")
# 대조군: 385/4000 = 0.0963
# 실험군: 475/4000 = 0.1187
# z-통계량: 3.2485
# p-value: 0.0012
# 대조군 95% CI: [0.0875, 0.1058]
# 실험군 95% CI: [0.1091, 0.1291]
# 전환율 차이: 0.0225 (2.25%p), 상대 향상(Lift): 23.4%
# 차이의 95% CI: [0.0089, 0.0361]
```

p-value가 0.05보다 작으므로 귀무가설을 기각한다. 보고할 값은 **차이의 신뢰구간** $[0.0089, 0.0361]$이다. 0을 포함하지 않으므로 검정 결과와 같은 결론이고, 효과의 크기까지 함께 말해 준다. 각 그룹의 신뢰구간이 서로 겹치지 않는 것도 눈에 띄지만, 이것을 판정 근거로 삼으면 안 된다. 겹치지 않으면 유의한 것이 맞지만 역은 성립하지 않아서, 겹치는데도 차이가 유의한 경우가 흔하다.

비율의 신뢰구간에는 Wald, Wilson, Clopper-Pearson 등 여러 방법이 있는데 여기서는 **Wilson**을 썼다. $n\hat{p}$가 작을 때도 포함 확률(Coverage Probability)이 명목 수준에 가깝게 유지되기 때문이다. Wald 구간은 표본이 작거나 비율이 0이나 1에 가까울 때 포함 확률이 급격히 떨어진다.

한 가지 덧붙이면, p-value가 작다고 비즈니스적으로 의미 있는 것은 아니다. 표본이 수백만이면 0.01%p 차이도 통계적으로 유의해진다. "전환율이 통계적으로 유의하게 0.02%p 상승했다"는 보고서는 쓸모가 없다. 상대적 효과 크기(Lift)와 비즈니스 임팩트를 함께 제시해야 의사결정에 쓸 수 있다.

## 연속형 지표 분석

평균 매출(ARPU), 체류 시간 같은 연속형 지표는 t-검정으로 분석한다. 등분산을 가정하지 않는 Welch 방식이 기본값으로 안전하다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# 사용자당 매출: 로그정규분포 (매출 데이터의 전형적 분포)
n_A, n_B = 2000, 2000
revenue_A = np.random.lognormal(mean=3.0, sigma=1.0, size=n_A)
revenue_B = np.random.lognormal(mean=3.05, sigma=1.0, size=n_B)  # 약 5% 상승

print(f"대조군 평균 매출: ${np.mean(revenue_A):.2f} (std: ${np.std(revenue_A, ddof=1):.2f})")
print(f"실험군 평균 매출: ${np.mean(revenue_B):.2f} (std: ${np.std(revenue_B, ddof=1):.2f})")

t_stat, p_value = stats.ttest_ind(revenue_A, revenue_B, equal_var=False)
print(f"t-통계량: {t_stat:.4f}")
print(f"p-value: {p_value:.4f}")

diff = np.mean(revenue_B) - np.mean(revenue_A)
se = np.sqrt(np.var(revenue_A, ddof=1)/n_A + np.var(revenue_B, ddof=1)/n_B)
print(f"평균 매출 차이: ${diff:.2f}, 95% CI [${diff - 1.96*se:.2f}, ${diff + 1.96*se:.2f}]")
# 대조군 평균 매출: $34.48 (std: $46.29)
# 실험군 평균 매출: $34.96 (std: $49.15)
# t-통계량: -0.3167
# p-value: 0.7515
# 평균 매출 차이: $0.48, 95% CI [$-2.48, $3.44]
```

데이터를 만들 때 실제로 약 5% 차이를 넣었는데도 p-value는 0.75고 신뢰구간은 0을 포함한다. 매출은 오른쪽 꼬리가 길어 분산이 크기 때문에, 같은 효과 크기를 감지하려면 전환율보다 훨씬 많은 표본이 필요하다. 그래서 실무에서는 전환율(이진)을 1차 지표로, 매출(연속)을 2차 지표로 두는 것이 일반적이다. 필요 표본 수를 줄이려면 CUPED, 로그 변환, 아웃라이어 캐핑 같은 분산 축소 기법을 쓴다. 분포 가정이 불안하면 부트스트랩 신뢰구간으로 교차 확인할 수도 있다.

## 조기 종료의 함정: Peeking Problem

실험 도중 p-value를 확인하고 유의하면 일찍 종료하는 것. 매우 자연스러운 행동이지만 통계적으로 심각한 오류를 낳는다. 이를 **피킹 문제**(Peeking Problem) 또는 **선택적 종료**(Optional Stopping)라고 한다.

원리는 이렇다. 효과가 전혀 없어도 충분히 여러 번 확인하면 언젠가는 p-value가 0.05 아래로 내려가는 시점이 나타난다. 유의수준 5%는 "한 번 검정할 때" 거짓 양성 확률이므로, 확인 횟수가 늘어나면 실제 거짓 양성 확률은 그만큼 부풀어 오른다. 얼마나 부풀어 오르는지 직접 재 보자.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

n_simulations, n_per_day, n_days = 5000, 200, 30
check_days = [7, 14, 21, 30]  # 매주 확인하는 전략

def two_prop_pvalue(a, b):
    n = len(a)
    pooled = (np.sum(a) + np.sum(b)) / (2 * n)
    if pooled <= 0 or pooled >= 1:
        return 1.0
    se = np.sqrt(2 * pooled * (1 - pooled) / n)
    z = (np.mean(b) - np.mean(a)) / se
    return 2 * (1 - stats.norm.cdf(abs(z)))

fp_fixed = fp_peeking = 0
for _ in range(n_simulations):
    # 두 그룹 모두 전환율 10%로 동일 (효과 없음)
    data_A = np.random.binomial(1, 0.10, n_per_day * n_days)
    data_B = np.random.binomial(1, 0.10, n_per_day * n_days)

    # 전략 1: 마지막 날에 한 번만 확인
    if two_prop_pvalue(data_A, data_B) < 0.05:
        fp_fixed += 1

    # 전략 2: 매주 확인하고 유의해지면 즉시 종료
    for d in check_days:
        n_curr = n_per_day * d
        if two_prop_pvalue(data_A[:n_curr], data_B[:n_curr]) < 0.05:
            fp_peeking += 1
            break

print(f"마지막 날만 확인 -> 거짓 양성률: {fp_fixed/n_simulations:.1%}")
print(f"매주 4회 확인   -> 거짓 양성률: {fp_peeking/n_simulations:.1%}")
print(f"증가 배수: {fp_peeking/fp_fixed:.1f}x")
# 마지막 날만 확인 -> 거짓 양성률: 4.4%
# 매주 4회 확인   -> 거짓 양성률: 12.4%
# 증가 배수: 2.8x
```

효과가 전혀 없는 두 그룹인데, 중간 확인을 4번 끼워 넣었을 뿐인데 거짓 양성률이 4.4%에서 12.4%로 뛴다. 매일 확인하면 이 수치는 더 올라간다. "유의하면 멈추겠다"는 전략은 유의수준 $\alpha$를 사실상 무력화시킨다.

### 순차 검정: 올바른 조기 종료

그렇다면 중간 점검은 원천적으로 불가능한가? 그렇지 않다. **순차 검정**(Sequential Testing)은 다중 확인을 미리 계산에 넣어 각 시점의 임계값을 조정한다. 대표적인 것이 **O'Brien-Fleming** 경계로, 초기에는 매우 엄격하게 시작해 후반으로 갈수록 완화된다. 4회 분석, 양측 $\alpha = 0.05$ 기준의 경계는 다음과 같다.

| 분석 시점 | 정보 분율 $t_k$ | z-경계 | p-경계 |
|---|---|---|---|
| 1/4차 | 0.25 | 4.049 | 0.00005 |
| 2/4차 | 0.50 | 2.863 | 0.00420 |
| 3/4차 | 0.75 | 2.337 | 0.01944 |
| 4/4차 (최종) | 1.00 | **2.024** | **0.04297** |

1차 중간 분석에서 종료하려면 p가 0.00005까지 내려가야 한다. 그리고 여기서 놓치기 쉬운 지점이 최종 경계다. 중간에 네 번 들여다본 대가로 **최종 임계값도 1.96이 아니라 2.024로 더 엄격해진다.** 마지막에 평소대로 0.05를 쓰면 전체 1종 오류율이 5.6%로 새어 나간다. 위 경계를 그대로 지켰을 때만 5.0%로 유지된다. 참고로 아무 보정 없이 네 번 확인하면 12.6%다.

순차 검정은 공짜가 아니다. 중간 분석 횟수가 늘수록 최종 임계값이 높아지고 최대 필요 표본 수도 2~5% 늘어난다. 대신 효과가 명확할 때 일찍 끝낼 수 있어 기대 표본 크기는 오히려 줄어드는 경우가 많다.

## 실전 체크리스트

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

## 흔한 실수와 함정

**표본 크기 부족.** 검정력 분석 없이 "일주일이면 되겠지"로 시작하는 경우다. 표본이 부족하면 실제 효과가 있어도 감지하지 못한다(2종 오류). 이때의 결론은 "효과가 없다"가 아니라 "판단을 내릴 수 없다"이다.

**세그먼트 남용.** 전체 결과가 유의하지 않으면 하위 그룹을 쪼개 유의한 세그먼트를 찾는 행위. 20개 세그먼트를 검정하면 하나쯤은 우연히 유의하게 나온다. 사후 세그먼트 분석은 가설 생성 목적으로만 쓰고 다중 비교 보정을 적용해야 한다.

**노벨티 효과.** 새 UI에 대한 호기심으로 초기 참여도가 올랐다가 시간이 지나면 원래 수준으로 돌아가는 현상. 초기 결과만 보면 효과를 과대추정한다. 실험 초반 1~2주 데이터를 제외하거나 시간에 따른 효과 추이를 확인해야 한다.

**네트워크 효과.** 소셜 서비스에서 A 그룹 사용자의 행동이 B 그룹에 영향을 미치는 경우다. SUTVA(Stable Unit Treatment Value Assumption)가 깨져 처리 효과 추정이 편향된다. 클러스터 무작위 배정이 대안이다.

## 마치며

A/B 테스트는 인과 추론을 실무에 적용하는 가장 강력한 도구이고, 그 힘은 전적으로 무작위 배정에서 나온다. 통계적 분석 자체는 가설검정과 신뢰구간의 직접적인 응용에 지나지 않는다. 다만 표본 크기 부족, 피킹, 세그먼트 남용 같은 함정에 빠지면 데이터 없이 직감으로 결정하는 것보다 위험해진다. "데이터에 기반했다"는 확신이 잘못된 결정을 정당화하기 때문이다.

## 함께 보면 좋은 글

- [표본 추출과 편향](/stats/sampling-and-bias/)
- [가설검정의 원리](/stats/hypothesis-testing/)
- [신뢰구간](/stats/confidence-intervals/)
- [부트스트랩](/stats/bootstrap/)
- [점추정과 추정량의 성질](/stats/point-estimation/)
- [통계적 함정: 다중 검정, p-hacking, 심슨의 역설](/stats/statistical-pitfalls/)

## 참고자료

- Kohavi, R., Tang, D., & Xu, Y. (2020). *Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing*. Cambridge University Press.
- Deng, A., et al. (2013). "Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data." *WSDM 2013*.
- Johari, R., et al. (2017). "Peeking at A/B Tests: Why It Matters, and What to Do About It." *KDD 2017*.
- O'Brien, P. C. & Fleming, T. R. (1979). "A Multiple Testing Procedure for Clinical Trials." *Biometrics*, 35(3), 549-556.
- Statsmodels Documentation: [Proportion Tests](https://www.statsmodels.org/stable/stats.html#proportion)
- Evan Miller: [Sample Size Calculator](https://www.evanmiller.org/ab-testing/sample-size.html)
