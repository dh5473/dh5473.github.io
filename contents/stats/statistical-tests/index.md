---
date: '2026-02-20'
title: 't-검정, ANOVA, 카이제곱 검정: 상황별 검정 방법 선택 가이드'
category: 'Statistics'
series: 'stats'
seriesOrder: 12
tags: ['t-검정', 'ANOVA', '카이제곱 검정', '비모수 검정', 'Statistical Tests']
summary: '데이터 유형과 집단 수에 따라 적절한 검정 방법을 선택하는 플로차트 — t-검정, ANOVA, 카이제곱 검정, 비모수 검정까지 Python 예제와 함께 완전 정리한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/hypothesis-testing/)에서 가설검정의 프레임워크를 세웠다. 귀무가설과 대립가설, p-value의 의미, 유의수준, 1종·2종 오류. 이제 검정이 무엇인지는 안다. 그런데 실제 데이터 앞에 앉으면 가장 먼저 드는 질문은 이것이다 — **"어떤 검정을 써야 하지?"**

A/B 테스트에서 전환율 차이를 보려면? 세 가지 교육 프로그램의 효과를 비교하려면? 설문 응답 분포가 기대와 다른지 확인하려면? 상황마다 적합한 검정 방법이 다르고, 잘못된 검정을 쓰면 결론 자체가 틀어진다.

이 글은 상황별 검정 방법 선택의 로드맵이다. 플로차트 하나로 전체 그림을 잡고, 각 검정의 원리와 Python 구현을 하나씩 짚어간다.

---

## 검정 방법 선택 플로차트

데이터를 보고 검정 방법을 고르는 판단 기준은 세 가지다: **(1) 데이터 유형**, **(2) 비교할 집단 수**, **(3) 표본 간 관계**. 이 세 축만 파악하면 어떤 검정을 쓸지 거의 자동으로 결정된다.

```
                        데이터 유형은?
                     ┌──────┴──────┐
                   연속형          범주형
                     │               │
               집단 수는?        ┌───┴───┐
            ┌────┼────┐      적합도    독립성
            1    2    3+     검정      검정
            │    │    │       │         │
         단일   독립/  ANOVA  카이제곱   카이제곱
        표본   대응?   (F)   적합도    독립성
        t-검정  │             검정      검정
            ┌──┴──┐
          독립   대응
           │      │
       독립 표본  대응 표본
       t-검정    t-검정
       (Welch)

  ※ 정규성 가정 불만족 시 → 비모수 검정으로 대체
     · 독립 2집단: Mann-Whitney U
     · 대응 2집단: Wilcoxon signed-rank
     · 3집단 이상: Kruskal-Wallis
```

이 플로차트를 머릿속에 넣어두면, 나머지는 각 검정의 구체적인 메커니즘을 이해하는 일이다. 아래 표로 전체 검정 방법을 한눈에 정리해두자 — 글을 읽는 동안 레퍼런스로 돌아와도 좋다.

| 검정 방법 | 데이터 유형 | 집단 수 | 표본 관계 | 귀무가설 | scipy 함수 |
|---|---|---|---|---|---|
| **단일 표본 t-검정** | 연속 | 1 | — | $\mu = \mu_0$ | `ttest_1samp` |
| **독립 표본 t-검정 (Welch)** | 연속 | 2 | 독립 | $\mu_1 = \mu_2$ | `ttest_ind(equal_var=False)` |
| **대응 표본 t-검정** | 연속 | 2 | 대응 | $\mu_d = 0$ | `ttest_rel` |
| **일원 ANOVA** | 연속 | 3+ | 독립 | $\mu_1 = \cdots = \mu_k$ | `f_oneway` |
| **카이제곱 적합도** | 범주 | 1 | — | 관측 = 기대 분포 | `chisquare` |
| **카이제곱 독립성** | 범주 | 2변수 | — | 두 변수 독립 | `chi2_contingency` |
| **Mann-Whitney U** | 연속(비모수) | 2 | 독립 | 동일 분포 | `mannwhitneyu` |
| **Wilcoxon signed-rank** | 연속(비모수) | 2 | 대응 | 차이 대칭 | `wilcoxon` |
| **Kruskal-Wallis** | 연속(비모수) | 3+ | 독립 | 동일 분포 | `kruskal` |

그렇다면 플로차트의 왼쪽 가지, 연속형 데이터의 검정부터 시작하자. 가장 기본이 되는 t-검정이다.

---

## t-검정(t-test): 평균의 차이를 검증하는 세 가지 방법

t-검정은 평균에 대한 가설검정의 기본 도구다. 비교 대상과 표본 구조에 따라 세 가지 변형이 있는데, 각각의 쓰임새가 뚜렷이 다르다.

### 단일 표본 t-검정 (One-Sample t-test)

**언제 쓰는가.** "이 집단의 평균이 특정 값과 같은가?"를 검정할 때 사용한다. 비교 대상이 다른 집단이 아니라 **이미 알려진 기준값**이다.

- 배터리 공정에서 평균 수명이 사양서의 1000시간과 같은가?
- 학생들의 평균 점수가 전국 평균 75점과 다른가?

표본 평균 $\bar{X}$와 기준값 $\mu_0$ 사이의 차이를 표준오차로 나눈 값이 t-통계량이다.

$$t = \frac{\bar{X} - \mu_0}{s / \sqrt{n}}$$

여기서 $s$는 표본 표준편차, $n$은 표본 크기다. 귀무가설 $H_0: \mu = \mu_0$ 하에서, 이 통계량은 자유도 $n - 1$인 [t-분포](/stats/continuous-distributions/)를 따른다.

:::info

**왜 z가 아니라 t인가?**

모분산 $\sigma^2$를 모르기 때문이다. $\sigma$ 대신 표본 표준편차 $s$를 쓰면 불확실성이 한 겹 더 추가되고, 이를 반영한 분포가 t-분포다. 표본이 커지면 t-분포는 정규분포에 수렴한다.

:::

배터리 수명 데이터로 확인해보자. 사양서의 기준값 1000시간에 대해 검정한다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

# 상황: 배터리 수명 사양 = 1000시간, 표본 20개의 수명 데이터
battery_life = np.random.normal(loc=1020, scale=50, size=20)

# 단일 표본 t-검정: H₀: μ = 1000
t_stat, p_value = stats.ttest_1samp(battery_life, popmean=1000)

print(f"표본 평균: {battery_life.mean():.1f}")
print(f"t-통계량: {t_stat:.4f}")
print(f"p-value:  {p_value:.4f}")
# 표본 평균: 1011.4
# t-통계량: 1.0654
# p-value:  0.3001
# → p > 0.05이므로 귀무가설을 기각하지 못한다 (사양과 다르다는 증거 불충분)
```

p-value가 0.30으로, 사양과 다르다는 근거가 부족하다. 그런데 만약 비교 대상이 기준값이 아니라 **다른 집단**이라면 어떻게 할까?

### 독립 표본 t-검정 (Independent Two-Sample t-test)

**언제 쓰는가.** **서로 다른 두 집단**의 평균을 비교할 때 사용한다. 두 집단의 구성원이 완전히 다른, 즉 독립적인 상황이다.

- 신약 투여 그룹 vs 위약 그룹의 혈압 차이
- A/B 테스트에서 디자인 A vs B의 평균 체류 시간

**등분산 vs 이분산: Welch's t-test.** 전통적인 독립 표본 t-검정은 두 집단의 분산이 같다고 가정한다(등분산 가정). 하지만 현실에서 두 집단의 분산이 정확히 같을 이유가 없다.

| 구분 | Student's t-test | Welch's t-test |
|---|---|---|
| 분산 가정 | $\sigma_1^2 = \sigma_2^2$ | $\sigma_1^2 \neq \sigma_2^2$ 허용 |
| 자유도 | $n_1 + n_2 - 2$ | Welch-Satterthwaite 근사 |
| 권장 상황 | 분산 동일이 확실할 때 | **기본값으로 사용** |

$$t = \frac{\bar{X}_1 - \bar{X}_2}{\sqrt{\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}}}$$

:::warning

**실전 팁**

특별한 이유가 없다면 항상 Welch's t-test를 쓰자. 등분산이 실제로 성립해도 Welch's t-test의 성능 손실은 미미하지만, 등분산 가정이 깨졌을 때 Student's t-test는 심각하게 잘못된 결론을 낼 수 있다. scipy의 `ttest_ind`에서 `equal_var=False`가 Welch 버전이다.

:::

두 교육 방법의 시험 점수를 비교하는 예제로 확인해보자.

```python
np.random.seed(42)

# 상황: 두 교육 방법의 시험 점수 비교
method_a = np.random.normal(loc=75, scale=10, size=30)
method_b = np.random.normal(loc=80, scale=12, size=35)

# Welch's t-test (equal_var=False)
t_stat, p_value = stats.ttest_ind(method_a, method_b, equal_var=False)

print(f"그룹 A 평균: {method_a.mean():.2f}, 그룹 B 평균: {method_b.mean():.2f}")
print(f"t-통계량: {t_stat:.4f}")
print(f"p-value:  {p_value:.4f}")
# 그룹 A 평균: 73.12, 그룹 B 평균: 78.01
# t-통계량: -1.9804
# p-value:  0.0520
# → 두 교육 방법의 평균 차이가 통계적으로 유의하지 않다 (경계선)
```

독립 표본 t-검정은 서로 다른 사람들을 비교한다. 한편, 같은 사람을 두 번 측정한 데이터라면 접근이 달라진다.

### 대응 표본 t-검정 (Paired t-test)

**언제 쓰는가.** **같은 대상을 두 번 측정**한 데이터를 비교할 때 사용한다. 전후 비교, 처치 전/후 비교가 대표적이다.

- 다이어트 프로그램 전/후 체중
- 같은 환자에게 두 가지 약을 순서대로 투여한 후 반응 비교

핵심은 각 쌍의 **차이값** $d_i = X_{i,\text{after}} - X_{i,\text{before}}$을 구한 뒤, 그 차이의 평균이 0인지를 단일 표본 t-검정으로 확인하는 것이다.

$$t = \frac{\bar{d}}{s_d / \sqrt{n}}$$

여기서 $\bar{d}$는 차이의 평균, $s_d$는 차이의 표본 표준편차, $n$은 쌍의 개수다.

12주 운동 프로그램의 혈압 감소 효과를 검정해보자.

```python
np.random.seed(42)

# 상황: 12주 운동 프로그램 전후 혈압 측정 (같은 사람 15명)
before = np.random.normal(loc=140, scale=15, size=15)
after = before + np.random.normal(loc=-8, scale=10, size=15)  # 평균 8 감소 효과

t_stat, p_value = stats.ttest_rel(before, after)

print(f"전 평균: {before.mean():.1f}, 후 평균: {after.mean():.1f}")
print(f"차이 평균: {(before - after).mean():.1f}")
print(f"t-통계량: {t_stat:.4f}")
print(f"p-value:  {p_value:.4f}")
# 전 평균: 140.2, 후 평균: 128.3
# 차이 평균: 11.9
# t-통계량: 5.9081
# p-value:  0.0000
# → 운동 프로그램이 혈압을 유의하게 감소시켰다
```

p-value가 0.0001 미만으로, 운동 프로그램의 혈압 감소 효과가 통계적으로 매우 유의하다.

:::info

**독립 vs 대응, 왜 구분이 중요한가?**

대응 표본에 독립 표본 t-검정을 쓰면, 개인 간 변동(사람마다 혈압이 다른 것)이 노이즈로 들어가 검정력이 크게 떨어진다. 대응 검정은 쌍별 차이만 보기 때문에 개인 간 변동을 제거하고, 처치 효과를 더 민감하게 잡아낸다.

:::

---

## 일원 분산분석 (One-way ANOVA)

t-검정은 두 집단까지만 다룬다. 비교 대상이 세 개 이상으로 늘어나면 다른 도구가 필요하다.

### 왜 다중 t-검정을 하면 안 되는가

세 개 이상의 집단을 비교해야 할 때, "A-B, A-C, B-C 각각 t-검정하면 되지 않나?"라는 생각이 자연스럽다. 하지만 이것은 **다중 검정 문제**(Multiple Testing Problem)를 일으킨다.

유의수준 $\alpha = 0.05$로 검정 하나를 수행하면, 실제 차이가 없을 때 잘못 기각할 확률이 5%다. 그런데 3번 검정하면?

$$P(\text{적어도 하나 잘못 기각}) = 1 - (1 - 0.05)^3 = 0.1426$$

검정 횟수가 늘어날수록 1종 오류가 눈덩이처럼 불어난다. 집단이 5개면 10번의 쌍별 비교가 필요하고, 전체 오류율은 40%에 육박한다. 이래서는 "유의하다"는 결론을 신뢰할 수 없다.

### ANOVA의 아이디어

**분산분석**(ANOVA, Analysis of Variance)은 이름 그대로 분산을 분석한다. 전체 데이터의 변동을 두 성분으로 분해하는 것이 핵심이다.

$$\underbrace{SS_T}_{\text{전체 변동}} = \underbrace{SS_B}_{\text{집단 간 변동}} + \underbrace{SS_W}_{\text{집단 내 변동}}$$

- <strong>$SS_B$ (Between)</strong>: 각 집단의 평균이 전체 평균에서 얼마나 떨어져 있는가 → 집단 간 차이
- <strong>$SS_W$ (Within)</strong>: 각 집단 내부에서 데이터가 얼마나 흩어져 있는가 → 개별 변동(노이즈)

만약 집단 간 차이가 노이즈에 비해 충분히 크면, "적어도 하나의 집단 평균이 다르다"고 결론 내린다.

### F-통계량

$$F = \frac{SS_B / (k - 1)}{SS_W / (N - k)} = \frac{MS_B}{MS_W}$$

$k$는 집단 수, $N$은 전체 표본 수다. 귀무가설($\mu_1 = \mu_2 = \cdots = \mu_k$) 하에서 F-통계량은 자유도 $(k-1, N-k)$인 [F-분포](/stats/continuous-distributions/)를 따른다. F값이 크면 집단 간 차이가 유의하다는 뜻이다.

### Python 예제

세 가지 비료의 작물 수확량을 비교해보자.

```python
np.random.seed(42)

# 상황: 세 가지 비료(A, B, C)를 사용한 작물 수확량 비교
fertilizer_a = np.random.normal(loc=20, scale=3, size=25)
fertilizer_b = np.random.normal(loc=22, scale=3, size=25)
fertilizer_c = np.random.normal(loc=24, scale=3, size=25)

# 일원 ANOVA
f_stat, p_value = stats.f_oneway(fertilizer_a, fertilizer_b, fertilizer_c)

print(f"평균 — A: {fertilizer_a.mean():.1f}, B: {fertilizer_b.mean():.1f}, C: {fertilizer_c.mean():.1f}")
print(f"F-통계량: {f_stat:.4f}")
print(f"p-value:  {p_value:.6f}")
# F-통계량: 18.1532
# p-value:  0.000000
# → 적어도 하나의 비료 그룹이 유의하게 다르다
```

### 사후 검정: 어디서 차이가 나는가?

ANOVA가 유의하다고 해서 끝이 아니다. ANOVA는 "적어도 하나가 다르다"까지만 알려준다. **어떤 쌍**에서 차이가 나는지는 사후 검정(Post-hoc Test)으로 확인해야 한다.

```python
from scipy.stats import tukey_hsd

# Tukey HSD 사후 검정
result = tukey_hsd(fertilizer_a, fertilizer_b, fertilizer_c)
print(result)
# 각 쌍별 비교 결과(신뢰구간, p-value)가 출력된다
# A-B, A-C, B-C 중 어떤 쌍이 유의한 차이를 보이는지 확인할 수 있다
```

**Tukey HSD**(Honestly Significant Difference)는 모든 쌍별 비교를 하면서도 전체 1종 오류율을 $\alpha$로 통제한다. 다중 비교 보정이 내장된 방법이다.

---

## 카이제곱 검정(Chi-squared Test): 범주형 데이터의 검정

지금까지는 연속형 데이터, 즉 플로차트의 왼쪽 가지를 다뤘다. 한편 데이터가 범주형이라면 평균을 비교하는 것 자체가 무의미하다. 범주형 데이터에서는 **빈도**(frequency)가 분석의 단위가 되고, 카이제곱 검정이 그 도구다.

### 카이제곱 적합도 검정 (Chi-squared Goodness-of-Fit Test)

**언제 쓰는가.** 관측된 범주별 빈도가 이론적으로 **기대하는 분포와 일치하는지** 검정할 때 사용한다.

- 주사위를 360번 던졌을 때, 각 눈이 60번씩 나왔는가?
- 고객 유입 채널 비율이 마케팅 팀이 예상한 비율과 같은가?

검정 통계량은 각 범주에서 관측값과 기대값의 차이를 제곱하고, 기대값으로 나눠서 합산한다.

$$\chi^2 = \sum_{i=1}^{k} \frac{(O_i - E_i)^2}{E_i}$$

$O_i$는 관측 빈도, $E_i$는 기대 빈도다. 귀무가설 하에서 이 통계량은 자유도 $k - 1$인 카이제곱 분포를 따른다.

주사위의 공정성을 검정하는 예제로 확인해보자.

```python
# 상황: 주사위 360번 던지기 — 공정한 주사위인가?
observed = np.array([70, 55, 62, 48, 65, 60])
expected = np.array([60, 60, 60, 60, 60, 60])

chi2_stat, p_value = stats.chisquare(f_obs=observed, f_exp=expected)

print(f"관측 빈도: {observed}")
print(f"기대 빈도: {expected}")
print(f"카이제곱 통계량: {chi2_stat:.4f}")
print(f"p-value: {p_value:.4f}")
# 카이제곱 통계량: 4.9667
# p-value: 0.4200
# → 공정한 주사위라는 귀무가설을 기각하지 못한다
```

:::warning

**기대 빈도 주의**

카이제곱 검정은 **기대 빈도가 5 이상**일 때 근사가 신뢰할 수 있다. 기대 빈도가 너무 작은 범주가 있으면, 인접 범주를 합치거나 Fisher의 정확 검정을 고려해야 한다.

:::

적합도 검정은 하나의 변수에 대한 분포를 확인한다. 그렇다면 두 범주형 변수 사이의 관계는 어떻게 검정할까?

### 카이제곱 독립성 검정 (Chi-squared Test of Independence)

**언제 쓰는가.** 두 범주형 변수 사이에 **연관성**(독립이 아닌 관계)이 있는지 검정할 때 사용한다.

- 성별과 제품 선호도 사이에 관계가 있는가?
- 흡연 여부와 질병 발생 여부가 독립인가?

데이터를 **분할표**(Contingency Table)로 정리한 뒤, 각 셀의 관측 빈도와 "독립 가정 하에서의 기대 빈도"를 비교한다. 기대 빈도는 다음과 같이 계산한다.

$$E_{ij} = \frac{(\text{행 } i \text{ 합계}) \times (\text{열 } j \text{ 합계})}{\text{전체 합계}}$$

검정 통계량은 적합도 검정과 같은 형태다.

$$\chi^2 = \sum_{i} \sum_{j} \frac{(O_{ij} - E_{ij})^2}{E_{ij}}$$

자유도는 $(r - 1)(c - 1)$, 여기서 $r$은 행 수, $c$는 열 수다.

성별과 음료 선호도의 독립성을 검정해보자.

```python
# 상황: 성별(남/여)과 선호 음료(커피/차/주스)의 독립성 검정
#         커피  차  주스
# 남성     90  60   30
# 여성     60  80   40
observed_table = np.array([[90, 60, 30],
                            [60, 80, 40]])

chi2_stat, p_value, dof, expected_table = stats.chi2_contingency(observed_table)

print("관측 빈도:")
print(observed_table)
print(f"\n기대 빈도:")
print(expected_table.round(1))
print(f"\n카이제곱 통계량: {chi2_stat:.4f}")
print(f"자유도: {dof}")
print(f"p-value: {p_value:.4f}")
# 카이제곱 통계량: 10.2857
# 자유도: 2
# p-value: 0.0058
# → 성별과 음료 선호 사이에 유의한 연관성이 있다
```

---

## 비모수 검정: 정규성 가정이 깨질 때

지금까지 다룬 t-검정과 ANOVA는 모두 데이터가 **정규분포를 따른다**고 가정한다. [CLT](/stats/lln-and-clt/)에 의해 표본 크기가 충분히 크면 이 가정은 대체로 괜찮지만, 표본이 작거나 분포가 극단적으로 치우쳐 있으면 모수적 검정의 결과를 신뢰하기 어렵다.

이럴 때 **비모수 검정**(Nonparametric Test)이 대안이 된다. 분포 형태에 대한 가정 없이, 데이터의 **순위**(Rank)를 기반으로 검정한다.

| 모수적 검정 | 비모수 대안 | 상황 |
|---|---|---|
| 독립 표본 t-검정 | **Mann-Whitney U** | 독립 2집단 비교 |
| 대응 표본 t-검정 | **Wilcoxon signed-rank** | 대응 2집단 비교 |
| 일원 ANOVA | **Kruskal-Wallis** | 독립 3집단+ 비교 |

:::info

**비모수 = 무조건 안전?**

비모수 검정은 가정이 적은 대신 **검정력(Power)이 낮다**. 데이터가 실제로 정규분포를 따르는데 비모수 검정을 쓰면, 같은 효과를 탐지하는 데 더 많은 표본이 필요하다. 정규성이 성립하면 모수적 검정이 더 강력하다.

:::

### Mann-Whitney U 검정

독립 두 집단의 비모수 대안이다. 치우친 분포의 데이터로 확인해보자.

```python
np.random.seed(42)

# 정규성 가정이 어려운 데이터: 치우친 분포
group1 = np.random.exponential(scale=5, size=20)
group2 = np.random.exponential(scale=8, size=20)

u_stat, p_value = stats.mannwhitneyu(group1, group2, alternative='two-sided')

print(f"그룹 1 중앙값: {np.median(group1):.2f}")
print(f"그룹 2 중앙값: {np.median(group2):.2f}")
print(f"U-통계량: {u_stat:.1f}")
print(f"p-value:  {p_value:.4f}")
# → 순위 기반으로 두 집단의 분포 차이를 검정한다
```

### Wilcoxon signed-rank 검정

대응 표본의 비모수 대안이다. 차이의 부호와 순위만으로 전후 변화를 평가한다.

```python
np.random.seed(42)

# 대응 비모수: 처치 전후의 비대칭 분포 데이터
before = np.random.exponential(scale=10, size=15)
after = before - np.random.exponential(scale=3, size=15)

w_stat, p_value = stats.wilcoxon(before, after)

print(f"Wilcoxon 통계량: {w_stat:.1f}")
print(f"p-value: {p_value:.4f}")
# → 차이의 순위를 기반으로 전후 변화를 검정한다
```

---

## Python 종합 실습: 하나의 시나리오로 여러 검정

실전에서는 하나의 데이터셋에 여러 검정을 적용하는 경우가 흔하다. 가상의 임상시험 데이터로 종합 실습을 해보자.

```python
import numpy as np
from scipy import stats

np.random.seed(2026)

# ── 데이터 생성: 3개 치료군(A, B, 위약)의 혈압 변화와 부작용 여부 ──
n = 30  # 각 그룹 30명

drug_a = np.random.normal(loc=-12, scale=8, size=n)   # 혈압 감소량
drug_b = np.random.normal(loc=-8, scale=10, size=n)
placebo = np.random.normal(loc=-2, scale=7, size=n)

# 부작용 발생 여부 (범주형)
side_effect = np.array([
    [8, 22],   # Drug A: 부작용 O / N
    [12, 18],  # Drug B
    [5, 25],   # Placebo
])

# ── (1) Drug A가 위약보다 효과가 있는가? → 독립 표본 t-검정 ──
t1, p1 = stats.ttest_ind(drug_a, placebo, equal_var=False)
print("=== 독립 표본 t-검정: Drug A vs Placebo ===")
print(f"  t = {t1:.3f}, p = {p1:.4f}")

# ── (2) 세 그룹 간 차이가 있는가? → ANOVA ──
f_stat, p2 = stats.f_oneway(drug_a, drug_b, placebo)
print("\n=== 일원 ANOVA: 3개 치료군 비교 ===")
print(f"  F = {f_stat:.3f}, p = {p2:.6f}")

# ── (3) ANOVA 유의 시 사후 검정 → Tukey HSD ──
if p2 < 0.05:
    result = stats.tukey_hsd(drug_a, drug_b, placebo)
    print("\n=== Tukey HSD 사후 검정 ===")
    print(result)

# ── (4) 치료군과 부작용 발생의 독립성 → 카이제곱 검정 ──
chi2, p4, dof, expected = stats.chi2_contingency(side_effect)
print("\n=== 카이제곱 독립성 검정: 치료군 × 부작용 ===")
print(f"  χ² = {chi2:.3f}, df = {dof}, p = {p4:.4f}")

# ── (5) 정규성 의심 시 비모수 대안 → Mann-Whitney ──
u_stat, p5 = stats.mannwhitneyu(drug_a, placebo, alternative='two-sided')
print("\n=== Mann-Whitney U: Drug A vs Placebo (비모수) ===")
print(f"  U = {u_stat:.1f}, p = {p5:.4f}")
```

이 코드 하나로 독립 표본 t-검정, ANOVA, 사후 검정, 카이제곱 독립성 검정, 비모수 검정까지 전부 시연할 수 있다. 실제 분석에서도 이렇게 여러 검정을 병행하는 것이 일반적이다.

---

## 흔한 실수 세 가지

### 1. 정규성 확인을 건너뛴다

t-검정과 ANOVA는 정규성 가정에 기반한다. 표본이 30개 이상이면 CLT 덕분에 대체로 괜찮지만, **소표본에서는 반드시 확인**해야 한다. Shapiro-Wilk 검정이나 Q-Q plot으로 정규성을 검토하고, 위반 시 비모수 대안을 쓰자.

```python
# Shapiro-Wilk 정규성 검정
stat, p = stats.shapiro(drug_a)
print(f"Shapiro-Wilk: W = {stat:.4f}, p = {p:.4f}")
# p > 0.05면 정규성 가정 유지
```

### 2. 다중 검정 보정을 하지 않는다

여러 쌍을 비교하면서 개별 유의수준만 보면, 전체 1종 오류율이 폭증한다. ANOVA 후 사후 검정(Tukey HSD, Bonferroni 등)을 사용하거나, 여러 검정을 수행할 때는 Bonferroni 보정($\alpha' = \alpha / m$, $m$은 검정 횟수)을 적용하자.

### 3. 효과 크기를 무시한다

p-value는 "효과가 있느냐 없느냐"만 말해줄 뿐, "효과가 **얼마나 큰가**"는 알려주지 않는다. 표본이 충분히 크면 아무리 작은 차이도 유의하게 나온다. 반드시 **효과 크기**(Effect Size)를 함께 보고해야 한다.

| 검정 | 효과 크기 지표 | 해석 기준 (Cohen) |
|---|---|---|
| t-검정 | **Cohen's d** = $\frac{\bar{X}_1 - \bar{X}_2}{s_p}$ | 0.2 작음 / 0.5 중간 / 0.8 큼 |
| ANOVA | **η² (Eta-squared)** = $\frac{SS_B}{SS_T}$ | 0.01 / 0.06 / 0.14 |
| 카이제곱 | **Cramér's V** = $\sqrt{\frac{\chi^2}{n \cdot \min(r-1, c-1)}}$ | 0.1 / 0.3 / 0.5 |

```python
# Cohen's d 계산 (독립 두 집단)
def cohens_d(group1, group2):
    n1, n2 = len(group1), len(group2)
    s_pooled = np.sqrt(((n1-1)*group1.std(ddof=1)**2 + (n2-1)*group2.std(ddof=1)**2) / (n1+n2-2))
    return (group1.mean() - group2.mean()) / s_pooled

d = cohens_d(drug_a, placebo)
print(f"Cohen's d: {d:.3f}")
# → d의 절대값이 0.8 이상이면 큰 효과
```

---

## 마치며

검정 방법 선택은 결국 세 가지 질문으로 귀결된다. **데이터가 연속인가 범주인가**, **집단이 몇 개인가**, **표본이 독립인가 대응인가**. 이 글의 플로차트와 요약표를 기준점 삼아, 상황에 맞는 도구를 골라 쓰면 된다.

하나 더 기억할 것 — 모든 모수적 검정에는 분포 가정이 깔려 있다. 정규성, 등분산성, 독립성. 이 가정이 깨지면 비모수 검정을 쓸 수 있지만, 그마저도 "순위"라는 정보 축약에 의존한다. **분포 가정 자체에서 자유로워지는 방법은 없을까?** 복원 추출로 분포를 직접 근사하는 [부트스트랩(Bootstrap)](/stats/bootstrap/)이 그 답이다. 다음 글에서 만나자.

---

## 참고자료

- Wasserman, L. (2004). *All of Statistics*. Chapter 10: Hypothesis Testing and p-values.
- Rice, J.A. (2006). *Mathematical Statistics and Data Analysis*. 3rd Edition. Chapters 11-12.
- Kim, W. (2013). *Mathematical Statistics*. (김우철, 수리통계학). 가설검정 및 분산분석 장.
- SciPy Documentation — [scipy.stats](https://docs.scipy.org/doc/scipy/reference/stats.html): 각 검정 함수의 상세 API 문서.
