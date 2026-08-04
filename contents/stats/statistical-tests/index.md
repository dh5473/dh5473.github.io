---
date: '2026-02-20'
title: 't-검정, ANOVA, 카이제곱 검정: 상황별 검정 방법 선택 가이드'
category: 'Statistics'
series: 'stats'
seriesOrder: 12
tags: ['t-검정', 'ANOVA', '카이제곱 검정', '비모수 검정', 'Statistical Tests']
summary: '데이터 유형과 집단 수에 따라 적절한 검정 방법을 선택하는 플로차트. t-검정, ANOVA, 카이제곱 검정, 비모수 검정까지 Python 예제와 함께 완전 정리한다.'
thumbnail: './thumbnail.png'
---

A/B 테스트에서 전환율 차이를 보려면? 세 가지 교육 프로그램의 효과를 비교하려면? 설문 응답 분포가 기대와 다른지 확인하려면? 상황마다 맞는 검정이 다르고, 잘못 고르면 결론 자체가 틀어진다.

이 글은 그 선택의 로드맵이다. 판단 기준은 세 가지다. **데이터 유형**, **비교할 집단 수**, **표본 간 관계**. 이 세 축만 파악하면 어떤 검정을 쓸지 거의 자동으로 결정된다.

## 검정 방법 선택 플로차트

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 578" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="검정 방법 선택 트리. 데이터 유형이 범주형이면 카이제곱 적합도 검정과 독립성 검정으로, 연속형이면 집단 수와 표본 관계에 따라 단일 표본 t-검정, 일원 ANOVA, 독립 표본 t-검정, 대응 표본 t-검정으로 갈린다. 정규성이 깨지면 비모수 검정으로 대체한다.">
<style>
.st-q { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.st-r { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.st-fn { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; stroke-dasharray: 6 4; }
.st-qt { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.st-rt { fill: var(--primary, #0a756c); font-size: 15px; font-weight: 700; }
.st-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
.st-wt { fill: var(--text-warn, #9d5604); font-size: 15px; font-weight: 600; }
.st-l { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; }
</style>
<!-- 뿌리 -->
<rect class="st-q" x="8" y="10" width="384" height="34" rx="6"/>
<text class="st-qt" x="20" y="32">데이터 유형은?</text>
<!-- 범주형 갈래 -->
<path class="st-l" d="M 18 44 L 18 71 L 28 71"/>
<rect class="st-q" x="28" y="54" width="364" height="34" rx="6"/>
<text class="st-qt" x="40" y="76">범주형</text>
<path class="st-l" d="M 38 88 L 38 159"/>
<path class="st-l" d="M 38 115 L 48 115"/>
<path class="st-l" d="M 38 159 L 48 159"/>
<rect class="st-r" x="48" y="98" width="344" height="34" rx="6"/>
<text class="st-rt" x="60" y="120">카이제곱 적합도 검정</text>
<text class="st-h" x="380" y="120" text-anchor="end">분포 비교</text>
<rect class="st-r" x="48" y="142" width="344" height="34" rx="6"/>
<text class="st-rt" x="60" y="164">카이제곱 독립성 검정</text>
<text class="st-h" x="380" y="164" text-anchor="end">변수 관계</text>
<!-- 연속형 갈래 -->
<path class="st-l" d="M 18 71 L 18 203 L 28 203"/>
<rect class="st-q" x="28" y="186" width="364" height="34" rx="6"/>
<text class="st-qt" x="40" y="208">연속형 · 집단 수는?</text>
<path class="st-l" d="M 38 220 L 38 335"/>
<path class="st-l" d="M 38 247 L 48 247"/>
<path class="st-l" d="M 38 291 L 48 291"/>
<path class="st-l" d="M 38 335 L 48 335"/>
<rect class="st-r" x="48" y="230" width="344" height="34" rx="6"/>
<text class="st-rt" x="60" y="252">단일 표본 t-검정</text>
<text class="st-h" x="380" y="252" text-anchor="end">1개</text>
<rect class="st-r" x="48" y="274" width="344" height="34" rx="6"/>
<text class="st-rt" x="60" y="296">일원 ANOVA</text>
<text class="st-h" x="380" y="296" text-anchor="end">3개 이상</text>
<rect class="st-q" x="48" y="318" width="344" height="34" rx="6"/>
<text class="st-qt" x="60" y="340">2개 · 표본 관계는?</text>
<!-- 2집단 갈래 -->
<path class="st-l" d="M 58 352 L 58 423"/>
<path class="st-l" d="M 58 379 L 68 379"/>
<path class="st-l" d="M 58 423 L 68 423"/>
<rect class="st-r" x="68" y="362" width="324" height="34" rx="6"/>
<text class="st-rt" x="80" y="384">독립 표본 t-검정</text>
<text class="st-h" x="380" y="384" text-anchor="end">독립</text>
<rect class="st-r" x="68" y="406" width="324" height="34" rx="6"/>
<text class="st-rt" x="80" y="428">대응 표본 t-검정</text>
<text class="st-h" x="380" y="428" text-anchor="end">대응</text>
<!-- 비모수 대체 -->
<rect class="st-fn" x="8" y="456" width="384" height="112" rx="6"/>
<text class="st-wt" x="24" y="480">정규성이 깨지면</text>
<text class="st-h" x="24" y="506">2집단 독립</text>
<text class="st-h" x="150" y="506">Mann-Whitney U</text>
<text class="st-h" x="24" y="530">2집단 대응</text>
<text class="st-h" x="150" y="530">Wilcoxon signed-rank</text>
<text class="st-h" x="24" y="554">3집단 이상</text>
<text class="st-h" x="150" y="554">Kruskal-Wallis</text>
</svg>
</div>

| 검정 방법 | 데이터 | 집단 | 귀무가설 | 핵심 가정 | scipy |
|---|---|---|---|---|---|
| **단일 표본 t-검정** | 연속 | 1 | $\mu = \mu_0$ | 정규성 | `ttest_1samp` |
| **독립 표본 t-검정 (Welch)** | 연속 | 2 (독립) | $\mu_1 = \mu_2$ | 정규성 | `ttest_ind(equal_var=False)` |
| **대응 표본 t-검정** | 연속 | 2 (대응) | $\mu_d = 0$ | 차이의 정규성 | `ttest_rel` |
| **일원 ANOVA** | 연속 | 3+ (독립) | $\mu_1 = \cdots = \mu_k$ | 정규성, 등분산 | `f_oneway` |
| **카이제곱 적합도** | 범주 | 1 | 관측 = 기대 분포 | 기대빈도 5 이상 | `chisquare` |
| **카이제곱 독립성** | 범주 | 2변수 | 두 변수 독립 | 기대빈도 5 이상 | `chi2_contingency` |
| **Mann-Whitney U** | 순위 | 2 (독립) | 두 분포가 동일 | 독립성 | `mannwhitneyu` |
| **Wilcoxon signed-rank** | 순위 | 2 (대응) | 차이의 분포가 0 대칭 | 차이의 대칭성 | `wilcoxon` |
| **Kruskal-Wallis** | 순위 | 3+ (독립) | 모든 분포가 동일 | 독립성 | `kruskal` |

## t-검정: 평균의 차이를 검증하는 세 가지 방법

t-검정은 평균에 대한 가설검정의 기본 도구다. 비교 대상과 표본 구조에 따라 세 가지 변형이 있다.

### 단일 표본 t-검정 (One-Sample t-test)

**언제 쓰는가.** "이 집단의 평균이 특정 값과 같은가?"를 검정할 때다. 비교 대상이 다른 집단이 아니라 **이미 알려진 기준값**이다.

- 배터리 공정에서 평균 수명이 사양서의 1000시간과 같은가?
- 학생들의 평균 점수가 전국 평균 75점과 다른가?

표본 평균 $\bar{X}$와 기준값 $\mu_0$ 사이의 차이를 표준오차로 나눈 값이 t-통계량이다.

$$t = \frac{\bar{X} - \mu_0}{s / \sqrt{n}}$$

여기서 $s$는 표본 표준편차, $n$은 표본 크기다. 귀무가설 $H_0: \mu = \mu_0$ 하에서 이 통계량은 자유도 $n - 1$인 t-분포를 따른다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# 배터리 수명 사양 = 1000시간, 표본 20개
battery_life = np.random.normal(loc=1020, scale=50, size=20)
t_stat, p_value = stats.ttest_1samp(battery_life, popmean=1000)

print(f"표본 평균: {battery_life.mean():.1f}, t: {t_stat:.4f}, p: {p_value:.4f}")
# 표본 평균: 1011.4, t: 1.0654, p: 0.3001
# p > 0.05이므로 사양과 다르다는 증거가 불충분하다
```

### 독립 표본 t-검정 (Independent Two-Sample t-test)

**언제 쓰는가.** **서로 다른 두 집단**의 평균을 비교할 때다. 두 집단의 구성원이 완전히 다른, 즉 독립적인 상황이다.

- 신약 투여 그룹 vs 위약 그룹의 혈압 차이
- A/B 테스트에서 디자인 A vs B의 평균 체류 시간

전통적인 독립 표본 t-검정은 두 집단의 분산이 같다고 가정한다. 하지만 현실에서 두 집단의 분산이 정확히 같을 이유가 없다.

| 구분 | Student's t-test | Welch's t-test |
|---|---|---|
| 분산 가정 | $\sigma_1^2 = \sigma_2^2$ | $\sigma_1^2 \neq \sigma_2^2$ 허용 |
| 자유도 | $n_1 + n_2 - 2$ | Welch-Satterthwaite 근사 |
| 권장 상황 | 분산 동일이 확실할 때 | **기본값으로 사용** |

$$t = \frac{\bar{X}_1 - \bar{X}_2}{\sqrt{\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}}}$$

:::warning

**scipy 기본값 주의**

`ttest_ind`의 기본값은 `equal_var=True`, 즉 **Student's t-test**다. Welch를 쓰려면 `equal_var=False`를 명시해야 한다. 특별한 이유가 없다면 항상 Welch를 쓰자. 등분산이 실제로 성립해도 Welch의 성능 손실은 미미하지만, 등분산 가정이 깨졌을 때 Student's t-test는 심각하게 잘못된 결론을 낼 수 있다.

:::

```python
np.random.seed(42)

# 두 교육 방법의 시험 점수 비교
method_a = np.random.normal(loc=75, scale=10, size=30)
method_b = np.random.normal(loc=80, scale=12, size=35)

t_stat, p_value = stats.ttest_ind(method_a, method_b, equal_var=False)

print(f"A: {method_a.mean():.2f}, B: {method_b.mean():.2f}")
print(f"t: {t_stat:.4f}, p: {p_value:.4f}")
# A: 73.12, B: 78.01
# t: -1.9804, p: 0.0520
# 경계선에 걸려 유의하지 않다
```

### 대응 표본 t-검정 (Paired t-test)

**언제 쓰는가.** **같은 대상을 두 번 측정**한 데이터를 비교할 때다. 전후 비교, 처치 전후 비교가 대표적이다.

- 다이어트 프로그램 전후 체중
- 같은 환자에게 두 가지 약을 순서대로 투여한 후 반응 비교

핵심은 각 쌍의 **차이값** $d_i = X_{i,\text{after}} - X_{i,\text{before}}$을 구한 뒤 그 차이의 평균이 0인지를 단일 표본 t-검정으로 확인하는 것이다.

$$t = \frac{\bar{d}}{s_d / \sqrt{n}}$$

여기서 $\bar{d}$는 차이의 평균, $s_d$는 차이의 표본 표준편차, $n$은 쌍의 개수다.

```python
np.random.seed(42)

# 12주 운동 프로그램 전후 혈압 (같은 사람 15명)
before = np.random.normal(loc=140, scale=15, size=15)
after = before + np.random.normal(loc=-8, scale=10, size=15)

t_stat, p_value = stats.ttest_rel(before, after)

print(f"전: {before.mean():.1f}, 후: {after.mean():.1f}, 차이: {(before-after).mean():.1f}")
print(f"t: {t_stat:.4f}, p: {p_value:.6f}")
# 전: 140.2, 후: 128.3, 차이: 11.9
# t: 5.9081, p: 0.000038
```

:::info

**독립 vs 대응, 왜 구분이 중요한가**

대응 표본에 독립 표본 t-검정을 쓰면 개인 간 변동(사람마다 혈압이 다른 것)이 노이즈로 들어가 검정력이 크게 떨어진다. 대응 검정은 쌍별 차이만 보기 때문에 개인 간 변동을 제거하고 처치 효과를 더 민감하게 잡아낸다.

:::

## 일원 분산분석 (One-way ANOVA)

t-검정은 두 집단까지만 다룬다. 비교 대상이 세 개 이상이면 다른 도구가 필요하다.

### 왜 다중 t-검정을 하면 안 되는가

"A-B, A-C, B-C 각각 t-검정하면 되지 않나?"라는 생각이 자연스럽다. 하지만 이것은 **다중 검정 문제**(Multiple Testing Problem)를 일으킨다. 검정이 서로 독립이라고 보면 3번 검정했을 때 적어도 하나를 잘못 기각할 확률은 다음과 같다.

$$P(\text{적어도 하나 잘못 기각}) = 1 - (1 - 0.05)^3 = 0.1426$$

집단이 5개면 10번의 쌍별 비교가 필요하고 이 값은 40%에 이른다. 쌍별 비교는 같은 데이터를 공유하므로 실제로는 완전히 독립이 아니고, 따라서 이 계산은 상한 근사다. 그래도 검정 횟수가 늘수록 1종 오류가 불어난다는 결론은 바뀌지 않는다.

### ANOVA의 아이디어

**분산분석**(ANOVA, Analysis of Variance)은 전체 데이터의 변동을 두 성분으로 분해한다.

$$\underbrace{SS_T}_{\text{전체 변동}} = \underbrace{SS_B}_{\text{집단 간 변동}} + \underbrace{SS_W}_{\text{집단 내 변동}}$$

- **$SS_B$ (Between)**: 각 집단의 평균이 전체 평균에서 얼마나 떨어져 있는가, 즉 집단 간 차이
- **$SS_W$ (Within)**: 각 집단 내부에서 데이터가 얼마나 흩어져 있는가, 즉 개별 변동(노이즈)

집단 간 차이가 노이즈에 비해 충분히 크면 "적어도 하나의 집단 평균이 다르다"고 결론 내린다. 그 비율이 F-통계량이다.

$$F = \frac{SS_B / (k - 1)}{SS_W / (N - k)} = \frac{MS_B}{MS_W}$$

$k$는 집단 수, $N$은 전체 표본 수다. 귀무가설($\mu_1 = \mu_2 = \cdots = \mu_k$) 하에서 F-통계량은 자유도 $(k-1, N-k)$인 F-분포를 따른다.

### 가정

일원 ANOVA는 각 집단이 **정규분포**를 따르고, 집단들의 **분산이 같으며**(등분산성), 관측치가 **서로 독립**이라고 가정한다. `stats.f_oneway`의 기본값은 `equal_var=True`, 즉 등분산을 가정하는 고전적 ANOVA다. 집단별 분산이 크게 다르면 Levene 검정으로 확인한 뒤 `equal_var=False`로 Welch's ANOVA를 쓴다(scipy 1.16부터 지원한다). 다만 뒤에 나오는 Tukey HSD는 여전히 등분산을 전제하므로, 사후검정까지 가려면 Games-Howell 같은 대안이 필요하다.

```python
np.random.seed(42)

# 세 가지 비료(A, B, C)의 작물 수확량
fertilizer_a = np.random.normal(loc=20, scale=3, size=25)
fertilizer_b = np.random.normal(loc=22, scale=3, size=25)
fertilizer_c = np.random.normal(loc=24, scale=3, size=25)

f_stat, p_value = stats.f_oneway(fertilizer_a, fertilizer_b, fertilizer_c)

print(f"평균 A: {fertilizer_a.mean():.1f}, B: {fertilizer_b.mean():.1f}, C: {fertilizer_c.mean():.1f}")
print(f"F: {f_stat:.4f}, p: {p_value:.2e}")
# 평균 A: 19.5, B: 21.1, C: 24.3
# F: 18.1532, p: 4.13e-07
# 적어도 하나의 비료 그룹이 유의하게 다르다
```

### 사후 검정: 어디서 차이가 나는가

ANOVA는 "적어도 하나가 다르다"까지만 알려준다. **어떤 쌍**에서 차이가 나는지는 사후 검정(Post-hoc Test)으로 확인한다. **Tukey HSD**(Honestly Significant Difference)는 모든 쌍별 비교를 하면서도 전체 1종 오류율을 $\alpha$로 통제한다.

```python
result = stats.tukey_hsd(fertilizer_a, fertilizer_b, fertilizer_c)
print(result)
# Pairwise Group Comparisons (95.0% Confidence Interval)
# Comparison  Statistic  p-value  Lower CI  Upper CI
#  (0 - 1)     -1.628     0.118    -3.571     0.315
#  (0 - 2)     -4.809     0.000    -6.752    -2.866
#  (1 - 2)     -3.181     0.001    -5.123    -1.238
# (부호를 뒤집은 (1 - 0), (2 - 0), (2 - 1) 세 행이 이어서 출력된다)
# A와 C, B와 C는 유의하게 다르지만 A와 B는 그렇지 않다
```

## 카이제곱 검정: 범주형 데이터의 검정

데이터가 범주형이면 평균을 비교하는 것 자체가 무의미하다. 범주형 데이터에서는 **빈도**(frequency)가 분석의 단위가 되고 카이제곱 검정이 그 도구다.

적합도 검정과 독립성 검정은 통계량이 같다.

$$\chi^2 = \sum \frac{(O - E)^2}{E}$$

$O$는 관측 빈도, $E$는 기대 빈도다. 두 검정은 기대 빈도를 어디서 얻느냐와 자유도만 다르다.

| 구분 | 적합도 검정 | 독립성 검정 |
|---|---|---|
| 질문 | 관측 분포가 기대 분포와 같은가? | 두 범주형 변수가 독립인가? |
| 데이터 | 범주별 빈도 하나의 줄 | 분할표(Contingency Table) |
| 기대 빈도 | 이론 비율 $\times\ n$ | $E_{ij} = \dfrac{(\text{행 } i \text{ 합}) \times (\text{열 } j \text{ 합})}{\text{전체 합}}$ |
| 자유도 | $k - 1$ | $(r-1)(c-1)$ |
| 예시 | 주사위가 공정한가? | 성별과 제품 선호도에 관계가 있는가? |

```python
# 적합도: 주사위 360번 던지기. 공정한 주사위인가?
observed = np.array([70, 55, 62, 48, 65, 60])
expected = np.array([60, 60, 60, 60, 60, 60])

chi2_stat, p_value = stats.chisquare(f_obs=observed, f_exp=expected)
print(f"카이제곱: {chi2_stat:.4f}, p: {p_value:.4f}")
# 카이제곱: 4.9667, p: 0.4200
# 공정한 주사위라는 귀무가설을 기각하지 못한다
```

```python
# 독립성: 성별(남/여)과 선호 음료(커피/차/주스)
#                 커피  차  주스
observed_table = np.array([[90, 60, 30],    # 남성
                           [60, 80, 40]])   # 여성

chi2_stat, p_value, dof, expected_table = stats.chi2_contingency(observed_table)

print(expected_table.round(1))
print(f"카이제곱: {chi2_stat:.4f}, 자유도: {dof}, p: {p_value:.4f}")
# [[75. 70. 35.]
#  [75. 70. 35.]]
# 카이제곱: 10.2857, 자유도: 2, p: 0.0058
# 성별과 음료 선호 사이에 유의한 연관성이 있다
```

:::warning

**기대 빈도와 연속성 보정**

카이제곱 검정은 **기대 빈도가 5 이상**일 때 근사가 신뢰할 수 있다. 기대 빈도가 너무 작은 범주가 있으면 인접 범주를 합치거나 Fisher의 정확 검정을 고려해야 한다.

`chi2_contingency`는 `correction=True`가 기본값이라 **2×2 분할표에서만 Yates 연속성 보정이 자동으로 적용된다.** 예를 들어 `[[10,20],[20,10]]`은 보정하면 5.400, 보정하지 않으면 6.667이다. 손으로 계산한 값과 맞춰볼 때 이 차이를 염두에 두어야 한다.

:::

## 비모수 검정: 정규성 가정이 깨질 때

t-검정과 ANOVA는 데이터가 정규분포를 따른다고 가정한다. 중심극한정리 덕분에 표본이 충분히 크면 대체로 괜찮지만, 표본이 작거나 분포가 극단적으로 치우쳐 있으면 결과를 신뢰하기 어렵다. 이럴 때 **비모수 검정**(Nonparametric Test)이 대안이 된다.

세 검정 모두 원자료 대신 **순위**(Rank)를 쓴다. Mann-Whitney U는 두 표본에서 하나씩 뽑았을 때 어느 쪽이 클 확률이 높은지를 보고, Wilcoxon signed-rank는 쌍별 차이의 부호와 순위를 본다. Kruskal-Wallis는 이를 셋 이상으로 확장한 것이다. 함수는 각각 `mannwhitneyu`, `wilcoxon`, `kruskal`이며 인터페이스는 모수적 대응물과 같다.

:::warning

**"분포 가정이 없다"는 오해**

비모수 검정은 정규성을 요구하지 않을 뿐 가정이 전혀 없는 것이 아니다.

- **Mann-Whitney U**는 두 분포의 형태가 같을 때에만 "중앙값(위치)의 차이" 검정으로 해석할 수 있다. 형태가 다르면 이 검정이 판정하는 것은 확률적 우위(stochastic dominance), 즉 한 집단에서 뽑은 값이 다른 집단에서 뽑은 값보다 클 확률이 1/2에서 벗어나는지다. 중앙값이 같아도 산포가 다르면 기각될 수 있다.
- **Wilcoxon signed-rank**는 쌍별 차이의 분포가 0을 중심으로 **대칭**임을 가정한다.

:::

:::info

**비모수는 무조건 안전한가**

비모수 검정은 가정이 적은 대신 **검정력이 낮다**. 데이터가 실제로 정규분포를 따르는데 비모수 검정을 쓰면 같은 효과를 탐지하는 데 더 많은 표본이 필요하다. 정규성이 성립하면 모수적 검정이 더 강력하다.

:::

## 흔한 실수 세 가지

### 1. 정규성 확인을 건너뛴다

t-검정과 ANOVA는 정규성 가정에 기반한다. 표본이 30개 이상이면 중심극한정리 덕분에 대체로 괜찮지만 **소표본에서는 반드시 확인**해야 한다. Shapiro-Wilk 검정이나 Q-Q plot으로 검토하고 위반 시 비모수 대안을 쓴다.

```python
stat, p = stats.shapiro(method_a)
print(f"Shapiro-Wilk: W = {stat:.4f}, p = {p:.4f}")
# Shapiro-Wilk: W = 0.9751, p = 0.6868
# p > 0.05는 "정규성을 기각할 근거가 없다"는 뜻이지
# "정규성이 성립한다"는 뜻이 아니다.
# 표본이 작으면 검정력이 낮아 어긋난 분포도 통과시키기 쉽다.
```

### 2. 다중 검정 보정을 하지 않는다

여러 쌍을 비교하면서 개별 유의수준만 보면 전체 1종 오류율이 폭증한다. ANOVA 후 사후 검정(Tukey HSD)을 쓰거나, 여러 검정을 수행할 때는 **Bonferroni 보정**($\alpha' = \alpha / m$, $m$은 검정 횟수)을 적용한다. 더 정교한 방법으로는 Benjamini-Hochberg 절차(FDR 제어)가 있다.

### 3. 효과 크기를 무시한다

p-value는 효과의 유무만 말해줄 뿐 크기는 알려주지 않는다. 표본이 충분히 크면 아무리 작은 차이도 유의하게 나오므로 **효과 크기**(Effect Size)를 함께 보고해야 한다.

| 검정 | 효과 크기 지표 | 해석 기준 (Cohen) |
|---|---|---|
| t-검정 | **Cohen's d** = $\frac{\bar{X}_1 - \bar{X}_2}{s_p}$ | 0.2 작음 / 0.5 중간 / 0.8 큼 |
| ANOVA | **η² (Eta-squared)** = $\frac{SS_B}{SS_T}$ | 0.01 / 0.06 / 0.14 |
| 카이제곱 | **Cramér's V** = $\sqrt{\frac{\chi^2}{n \cdot \min(r-1, c-1)}}$ | 0.1 / 0.3 / 0.5 |

## 마치며

검정 방법 선택은 세 가지 질문으로 귀결된다. 데이터가 연속인가 범주인가, 집단이 몇 개인가, 표본이 독립인가 대응인가. 이 글의 플로차트와 요약표를 기준점 삼아 상황에 맞는 도구를 고르면 된다.

모든 모수적 검정에는 분포 가정이 깔려 있다. 정규성, 등분산성, 독립성. 이 가정이 깨지면 비모수 검정을 쓸 수 있지만 그마저도 순위라는 정보 축약과 나름의 가정에 의존한다.

## 함께 보면 좋은 글

- [가설검정(Hypothesis Testing)](/stats/hypothesis-testing/)
- [신뢰구간(Confidence Interval)](/stats/confidence-intervals/)
- [연속형 확률분포](/stats/continuous-distributions/)
- [부트스트랩(Bootstrap)](/stats/bootstrap/)

## 참고자료

- Wasserman, L. (2004). *All of Statistics*. Chapter 10: Hypothesis Testing and p-values.
- Rice, J.A. (2006). *Mathematical Statistics and Data Analysis*. 3rd Edition. Chapters 11-12.
- Kim, W. (2013). *Mathematical Statistics*. (김우철, 수리통계학). 가설검정 및 분산분석 장.
- Divine, G. et al. (2018). "The Wilcoxon-Mann-Whitney Procedure Fails as a Test of Medians." *The American Statistician*, 72(3), 278-286.
- SciPy Documentation: [scipy.stats](https://docs.scipy.org/doc/scipy/reference/stats.html)
