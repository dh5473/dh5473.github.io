---
date: '2026-02-26'
title: '통계적 함정: 다중 검정, p-hacking, 심슨의 역설, 상관 ≠ 인과'
category: 'Statistics'
series: 'stats'
seriesOrder: 18
tags: ['통계적 함정', 'p-hacking', "Simpson's Paradox", 'Multiple Testing', '상관과 인과']
summary: '다중 검정, p-hacking, 심슨의 역설, 상관≠인과, 기저율 무시까지 데이터를 다룰 때 반드시 알아야 할 통계적 함정과 방어법을 Python 시뮬레이션으로 총정리한다.'
thumbnail: './thumbnail.png'
---

"통계는 거짓말을 하지 않지만, 거짓말쟁이는 통계를 한다." 검정을 남발하면 거짓 발견이 쏟아지고, p-value를 조작하면 원하는 결론을 만들어낼 수 있으며, 데이터를 잘못 집계하면 현실과 정반대의 결론에 도달한다. 도구 자체는 강력하지만 휘두르는 방식이 문제다. 여기서는 그 대표적인 함정들을 하나씩 짚는다.

## 다중 검정 문제 (Multiple Testing Problem)

유의수준 $\alpha = 0.05$는 귀무가설이 참일 때 이를 잘못 기각할 확률의 상한이 5%라는 뜻이다. 한 번의 검정에서는 합리적인 기준이지만 여러 번 반복하면 상황이 달라진다.

효과가 전혀 없는 데이터에 독립적인 검정을 $m$번 수행하면, 적어도 하나가 유의하게 나올 확률은 다음과 같다.

$$P(\text{적어도 1개 거짓 양성}) = 1 - (1-\alpha)^m$$

| 검정 횟수 $m$ | 거짓 양성 1개 이상 확률 |
|---|---|
| 1 | 5.0% |
| 5 | 22.6% |
| 10 | 40.1% |
| 20 | **64.2%** |
| 100 | **99.4%** |

20개의 변수를 테스트하면 아무 효과가 없어도 64%의 확률로 "유의한" 결과가 하나 이상 나온다. 효과가 없는 두 그룹에 t-검정 20개를 묶어 10,000회 반복하면 약 64%의 시뮬레이션에서 거짓 양성이 관측되는데, 몬테카를로 오차(약 ±0.5%p)를 감안하면 이론값과 일치하는 수준이다.

### 보정 방법

**Bonferroni 보정**은 유의수준을 검정 횟수로 나눈다. 20개 검정이면 $\alpha = 0.05/20 = 0.0025$다.

$$\alpha_{\text{adjusted}} = \frac{\alpha}{m}$$

간단하고 직관적이지만 지나치게 보수적이라 진짜 효과까지 놓칠 수 있다.

**Benjamini-Hochberg(BH) 절차**는 다른 목표를 세운다. 모든 거짓 양성을 차단하는 대신 **거짓 발견 비율**(False Discovery Rate)을 일정 수준 이하로 유지한다. p-value를 오름차순 정렬하고 $i$번째 값이 $\frac{i}{m}\alpha$ 이하인지 확인한 뒤, 조건을 만족하는 가장 큰 $i$까지 전부 기각한다.

```python
import numpy as np
from scipy import stats

n_tests, n_samples, n_true = 20, 100, 5
rng = np.random.default_rng(42)

p_values = []
for i in range(n_tests):
    group_a = rng.normal(0, 1, n_samples)
    group_b = rng.normal(0.3 if i < n_true else 0.0, 1, n_samples)  # 앞 5개만 진짜 효과
    p_values.append(stats.ttest_ind(group_a, group_b).pvalue)
p_values = np.array(p_values)

bonferroni = p_values < (0.05 / n_tests)

order = np.argsort(p_values)
bh_line = np.arange(1, n_tests + 1) / n_tests * 0.05
below = p_values[order] <= bh_line
bh = np.zeros(n_tests, dtype=bool)
if below.any():
    bh[order[: np.max(np.where(below)) + 1]] = True   # 마지막 기각 지점까지 모두 기각

print(f"진짜 효과 {n_true}개 중 검출: Bonferroni {bonferroni[:n_true].sum()}개, BH {bh[:n_true].sum()}개")
print(f"거짓 양성: Bonferroni {bonferroni[n_true:].sum()}개, BH {bh[n_true:].sum()}개")
# 진짜 효과 5개 중 검출: Bonferroni 3개, BH 4개
# 거짓 양성: Bonferroni 0개, BH 0개
```

같은 데이터에서 Bonferroni는 진짜 효과 5개 중 3개를, BH는 4개를 잡아냈고 거짓 양성은 양쪽 모두 0개였다. 효과가 뚜렷하면 두 방법의 결과가 같아지지만, 효과가 약할수록 Bonferroni가 먼저 놓치기 시작한다. 유전체학처럼 수천 개를 동시에 검정하는 분야에서 BH가 사실상 표준인 이유다.

두 방법이 제어하는 대상 자체가 다르다는 점이 핵심이다. Bonferroni는 **FWER**(Family-Wise Error Rate), 즉 "하나라도 거짓 양성이 나올 확률"을 제어한다. BH는 **FDR**(False Discovery Rate), 즉 "기각한 것 중 거짓 양성의 비율"을 제어한다. FWER 제어가 더 엄격하고 검정력이 낮으며, FDR 제어가 더 관대하고 탐색적 분석에 적합하다.

## p-hacking

p-hacking은 유의미한 p-value를 얻기 위해 분석 과정을 조작하는 행위다. 다중 검정 문제가 "모르고 빠지는 함정"이라면 p-hacking은 "알면서 파는 함정"에 가깝다.

| 수법 | 설명 | 왜 문제인가 |
|---|---|---|
| **변수 선택적 보고** | 여러 변수 조합을 시도하고 유의한 것만 보고 | 다중 검정을 은폐 |
| **이상치 제거 기준 조작** | p < 0.05가 나올 때까지 제거 기준을 조정 | 데이터를 결론에 맞춤 |
| **분석 중단 시점 조절** | 데이터를 추가하며 p-value를 보다가 유의해지면 중단 | 실제 $\alpha$가 명목값보다 훨씬 높아짐 |
| **하위 그룹 사후 분석** | 전체에서 유의하지 않으면 성별, 연령대로 쪼개 재분석 | 검정 횟수 폭증 |
| **공변량 추가/제거** | 통제 변수를 넣었다 뺐다 하며 모델 조정 | 연구자 자유도 남용 |

완전히 동일한 분포에서 뽑은 두 데이터로 "유의한" 결과를 만들어내는 과정을 그대로 재현해 보자.

```python
import numpy as np
from scipy import stats

np.random.seed(123)

# 두 데이터 모두 동일한 분포에서 추출 (진짜 차이는 0)
x = np.random.normal(50, 10, 200)
y = np.random.normal(50, 10, 200)

t, p = stats.ttest_ind(x, y)
print(f"1) 전체 데이터 (n=200 vs 200): p = {p:.4f}")

# 수법 1: 상위 50%만 골라서 재분석
x_sub, y_sub = x[x > np.median(x)], y[y > np.median(y)]
t, p = stats.ttest_ind(x_sub, y_sub)
print(f"2) 상위 50%만 (n={len(x_sub)} vs {len(y_sub)}): p = {p:.4f}")

# 수법 2: 구간을 바꿔가며 10번 시도하고 최소 p-value만 보고
print("3) 구간을 바꿔가며 10번 시도:")
best_p, best_desc = 1.0, ""
for low, high in [(0,50),(25,75),(50,100),(30,70),(40,90),(10,60),(20,80),(35,85),(15,65),(45,95)]:
    mask_x = (x >= np.percentile(x, low)) & (x <= np.percentile(x, high))
    mask_y = (y >= np.percentile(y, low)) & (y <= np.percentile(y, high))
    p_sub = stats.ttest_ind(x[mask_x], y[mask_y]).pvalue
    if p_sub < best_p:
        best_p, best_desc = p_sub, f"{low}%~{high}% 구간"
print(f"   10개 구간 중 최소 p-value: {best_p:.4f} ({best_desc})")
# 1) 전체 데이터 (n=200 vs 200): p = 0.2351
# 2) 상위 50%만 (n=100 vs 100): p = 0.0150
# 3) 구간을 바꿔가며 10번 시도:
#    10개 구간 중 최소 p-value: 0.0024 (45%~95% 구간)
```

정직하게 전체를 분석하면 p = 0.2351로 아무것도 나오지 않는다. 그런데 상위 50%만 떼어내니 p = 0.0150이 되고, 구간을 열 가지로 나눠 그중 가장 좋은 것만 고르니 p = 0.0024까지 내려간다. 진짜 차이는 0인데도 그렇다. 열 번 시도해 최소값만 보고하는 것은 사실상 열 번의 검정을 하고 보정을 생략하는 것이며, 거짓 발견을 제조하는 것과 같다.

가장 강력한 방어책은 **사전 등록**(Pre-registration)이다. 데이터 수집 전에 가설, 분석 방법, 표본 크기, 유의수준을 공개적으로 등록해 사후 조작의 여지를 없앤다. 학술 연구에는 [OSF Registries](https://osf.io/registries)나 [AsPredicted.org](https://aspredicted.org) 같은 플랫폼이 있고, 기업 A/B 테스트에서 실험 계획서를 사전에 문서화하는 것도 같은 원리다. 여기서 특히 곤란한 점은, 연구자 본인조차 자신이 p-hacking을 하고 있다는 사실을 인식하지 못하는 경우가 많다는 것이다. 데이터를 조작하는 부정행위와 달리 p-hacking은 "합리적으로 보이는" 선택의 연쇄로 일어난다. 사전 등록이 필요한 근본 이유가 여기에 있다.

## 심슨의 역설 (Simpson's Paradox)

심슨의 역설은 하위 그룹에서 성립하는 경향이 전체를 합산하면 역전되는 현상이다. 가장 유명한 사례가 1973년 UC 버클리 대학원 입학 데이터다. 아래는 Bickel et al.(1975)이 보고한 6개 학과 중 A~D 4개 학과의 실제 수치다.

| 학과 | 남성 지원/합격 | 남성 합격률 | 여성 지원/합격 | 여성 합격률 |
|---|---|---|---|---|
| A | 825 / 512 | 62.1% | 108 / 89 | **82.4%** |
| B | 560 / 353 | 63.0% | 25 / 17 | **68.0%** |
| C | 325 / 120 | **36.9%** | 593 / 202 | 34.1% |
| D | 417 / 138 | 33.1% | 375 / 131 | **34.9%** |
| **A~D 소계** | **2,127 / 1,123** | **52.8%** | **1,101 / 439** | **39.9%** |

학과별로 보면 A, B, D에서 여성 합격률이 남성보다 높고 C에서만 약간 낮다. 그런데 네 학과를 합치면 남성 52.8%, 여성 39.9%로 뒤집힌다. 널리 인용되는 수치는 학과 여섯 곳을 모두 합한 남성 44.5%, 여성 30.4%인데, 어느 쪽으로 합산하든 역전이 일어난다는 점은 같다. 합산 결과만 보면 "성차별이 존재한다"는 결론에 이르지만, 학과별로 나누면 그 근거가 사라지는 것이다.

역전의 원인은 **교란 변수**다. 여기서는 "지원 학과"가 성별과 합격률 양쪽에 영향을 미친다. 남성은 합격률이 높은 A, B에 대거 지원했고(825명, 560명), 여성은 합격률이 낮은 C, D에 몰렸다(593명, 375명). 학과별 합격률이 아니라 지원 분포가 전체 격차를 만들어낸 셈이다.

방어법은 하나다. 합산하기 전에 "이 데이터를 합쳐도 되는가"를 먼저 묻는 것이다. 하위 그룹 간 구성 비율이 다르면 단순 합산은 위험하다. 핵심 교란 변수를 파악해 그룹별로 나누어 분석하거나(stratified analysis) 회귀 모형에서 통제해야 한다.

## 상관 ≠ 인과 (Correlation ≠ Causation)

두 변수가 함께 움직인다고 해서 하나가 다른 하나를 야기하는 것은 아니다. Tyler Vigen의 [Spurious Correlations](https://tylervigen.com/spurious-correlations)에는 수백 개의 거짓 상관이 모여 있다.

- 니콜라스 케이지 출연 영화 수 vs 수영장 익사 사고 수 (r = 0.67)
- 미국 치즈 소비량 vs 침대 시트에 얽혀 사망한 사람 수 (r = 0.95)
- 1인당 마가린 소비 vs 메인 주 이혼율 (r = 0.99)

높은 상관계수가 인과를 증명하지 못하는 이유는 크게 세 가지다.

| 원인 | 설명 | 예시 |
|---|---|---|
| **교란 변수** | 제3의 변수가 둘 다에 영향 | 아이스크림 판매 ↑ & 범죄율 ↑ (교란: 기온) |
| **역인과** | 인과 방향이 반대 | "소방관이 많을수록 화재 피해가 크다" (큰 화재 → 소방관 투입) |
| **우연의 일치** | 시계열에서 추세가 우연히 겹침 | 니콜라스 케이지 vs 수영장 익사 |

교란 변수의 작동 방식은 편상관(Partial Correlation)으로 직접 확인할 수 있다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)
n = 50

z = np.random.normal(0, 1, n)              # 교란 변수 (예: 기온)
x = 2 * z + np.random.normal(0, 1, n)      # 아이스크림 판매
y = 3 * z + np.random.normal(0, 1, n)      # 범죄율

r_xy, p_xy = stats.pearsonr(x, y)
print(f"X-Y 상관: r = {r_xy:.3f}, p = {p_xy:.4f}")

# Z를 통제한 편상관: X~Z의 잔차와 Y~Z의 잔차 사이의 상관
resid_x = x - np.polyval(np.polyfit(z, x, 1), z)
resid_y = y - np.polyval(np.polyfit(z, y, 1), z)
r_par, p_par = stats.pearsonr(resid_x, resid_y)
print(f"Z 통제 후 편상관: r = {r_par:.3f}, p = {p_par:.4f}")
# X-Y 상관: r = 0.824, p = 0.0000
# Z 통제 후 편상관: r = -0.220, p = 0.1242
```

X와 Y는 서로 아무 인과 관계가 없는데도 r = 0.824라는 강한 상관을 보인다. 기온 Z를 통제하는 순간 상관은 -0.220으로 떨어지고 유의성도 사라진다. 관측 데이터에서 인과를 주장하려면 교란 변수를 철저히 통제해야 한다는 뜻이고, 실무에서 A/B 테스트가 "황금 표준"으로 불리는 이유이기도 하다. 무작위 배정은 알려진 교란 변수뿐 아니라 알려지지 않은 교란 변수까지 한꺼번에 균형 맞추는 유일한 방법이다.

## 기저율 무시 (Base Rate Neglect)

유병률 0.1%(1,000명 중 1명)인 질병에 대해 민감도 99%, 특이도 99%인 검사가 있다고 하자. 양성 판정을 받았다면 실제로 병에 걸렸을 확률은 얼마인가?

$$P(\text{질병} \mid \text{양성}) = \frac{P(\text{양성} \mid \text{질병}) \cdot P(\text{질병})}{P(\text{양성})}$$

```python
prevalence = 0.001     # 유병률 0.1%
sensitivity = 0.99     # 민감도 (진양성률)
specificity = 0.99     # 특이도 (진음성률)

p_positive = sensitivity * prevalence + (1 - specificity) * (1 - prevalence)
p_disease = sensitivity * prevalence / p_positive

print(f"양성 판정 시 실제 환자일 확률: {p_disease:.1%}")
print(f"양성 판정 시 거짓 양성일 확률: {1 - p_disease:.1%}")
# 양성 판정 시 실제 환자일 확률: 9.0%
# 양성 판정 시 거짓 양성일 확률: 91.0%
```

민감도와 특이도가 모두 99%인 "우수한" 검사인데도 양성 판정자 중 실제 환자는 9%에 불과하다. 나머지 91%는 건강한데 양성으로 분류된 사람이다. 유병률이 낮으면 건강한 사람이 압도적으로 많아서, 그중 1%만 잘못 걸러져도 진짜 환자 수를 훌쩍 넘어서기 때문이다.

이 함정은 의료 검사만의 문제가 아니다. 스팸 필터, 사기 탐지, 이상 탐지처럼 희귀 사건을 찾는 모든 시스템에 그대로 적용된다. 사기 거래 비율이 0.01%인 시스템에서 99% 정확도를 자랑해도 양성 판정의 대부분은 거짓 양성이다. 모델 성능을 정확도(accuracy)만으로 판단하면 안 되는 이유다.

## 통계적 유의성 ≠ 실질적 중요성

p < 0.05는 "효과가 0이라는 가설 하에서 이 정도 이상으로 극단적인 결과를 관측할 확률이 5% 미만"이라는 뜻이지 "효과가 크다"는 뜻이 아니다. 표본이 충분히 크면 아무리 작은 차이도 통계적으로 유의해진다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

print(f"{'표본 크기':>10} | {'평균 차이':>9} | {'p-value':>10} | {'Cohen d':>8} | 판정")
# 진짜 평균 차이는 0.02로 고정 (체감 불가능한 수준)
for n in [1_000, 10_000, 100_000, 1_000_000]:
    group_a = np.random.normal(100, 1, n)
    group_b = np.random.normal(100.02, 1, n)
    t, p = stats.ttest_ind(group_a, group_b)
    mean_diff = np.mean(group_b) - np.mean(group_a)
    cohens_d = mean_diff / np.sqrt((np.std(group_a)**2 + np.std(group_b)**2) / 2)
    print(f"{n:>10,} | {mean_diff:>9.4f} | {p:>10.6f} | {cohens_d:>8.4f} | {'유의' if p < 0.05 else '비유의'}")
#      표본 크기 |     평균 차이 |    p-value |  Cohen d | 판정
#      1,000 |    0.0715 |   0.105889 |   0.0724 | 비유의
#     10,000 |    0.0551 |   0.000103 |   0.0549 | 유의
#    100,000 |    0.0183 |   0.000043 |   0.0183 | 유의
#  1,000,000 |    0.0210 |   0.000000 |   0.0210 | 유의
```

표본이 커지면 Cohen's d는 진짜 값 0.02 근처를 맴도는데 p-value만 0으로 떨어진다. Cohen의 기준에서 d = 0.02는 "작은 효과"(0.2)에도 한참 못 미친다. p-value가 아무리 작아도 효과 크기가 실질적으로 무의미하면 그 결과는 쓸모가 없다.

반대 방향의 함정도 있다. 표본이 작으면 검정력이 모자라 **진짜 있는 효과를 놓친다.** 위 표의 $n = 1{,}000$ 행이 그렇다. 효과는 그대로 있는데 p = 0.106으로 비유의 판정이 났다. 여기서 "차이가 없다"고 결론 내리면 틀린다. 기각하지 못한 것과 귀무가설이 참인 것은 다르고, 이때 필요한 것은 결론이 아니라 표본을 더 모으는 일이다. 그래서 유의하지 않은 결과를 보고할 때는 신뢰구간을 함께 내야 한다. 구간이 좁게 0을 감싸면 효과가 없다는 근거가 되지만, 넓게 벌어져 있으면 아직 아무것도 모른다는 뜻이다.

| 지표 | 공식 | 해석 기준 (Cohen) |
|---|---|---|
| **Cohen's d** | $d = \frac{\bar{X}_1 - \bar{X}_2}{s_p}$ | 소: 0.2, 중: 0.5, 대: 0.8 |
| **상관계수 r** | $r = \sqrt{\frac{t^2}{t^2 + df}}$ | 소: 0.1, 중: 0.3, 대: 0.5 |
| **$\eta^2$ (에타 제곱)** | $\eta^2 = \frac{SS_{\text{between}}}{SS_{\text{total}}}$ | 소: 0.01, 중: 0.06, 대: 0.14 |

p-value만 보고하는 보고서는 불완전하다. **효과 크기 + 신뢰구간 + p-value** 세 가지를 함께 제시해야 결과의 실질적 의미를 판단할 수 있다.

## 생태학적 오류와 개인주의적 오류

분석한 단위와 결론을 적용하는 단위가 어긋날 때 생기는 함정이다.

| 오류 유형 | 방향 | 예시 |
|---|---|---|
| **생태학적 오류** (Ecological Fallacy) | 집단 → 개인 | "소득이 높은 지역의 범죄율이 낮다" → "부유한 사람은 범죄를 저지르지 않는다" |
| **개인주의적 오류** (Atomistic Fallacy) | 개인 → 집단 | "이 환자에게 약이 효과 있었다" → "이 약은 모든 환자에게 효과 있다" |

국가별 초콜릿 소비량과 노벨상 수상자 수가 상관있다고 해서 "초콜릿을 먹으면 노벨상을 탄다"고 말할 수 없다. 집단 평균 사이의 상관은 집단 간 변동만 반영하므로, 개인 수준의 관계와는 크기도 방향도 얼마든지 달라질 수 있다. 분석 단위와 결론의 적용 단위를 항상 일치시켜야 한다.

## 마치며

통계는 "정답"을 알려주는 마법이 아니라 불확실성 속에서 "최선의 판단"을 내리기 위한 사고 체계다. p-value가 0.03이라는 숫자 자체에는 선도 악도 없다. 그 숫자가 어떤 맥락에서 얼마나 엄밀한 과정을 거쳐 나왔는지, 효과의 크기는 실질적으로 의미 있는지, 교란 변수는 통제되었는지. 이런 질문을 던질 줄 아는 능력이 통계적 사고력이고, 이 글에서 다룬 함정들은 전부 그 질문을 건너뛰었을 때 벌어지는 일이다.

## 함께 보면 좋은 글

- [가설검정의 원리](/stats/hypothesis-testing/)
- [조건부 확률과 베이즈 정리](/stats/conditional-probability-bayes/)
- [베이지안 추론](/stats/bayesian-inference/)
- [표본 추출과 편향](/stats/sampling-and-bias/)
- [A/B 테스트 설계와 분석](/stats/ab-testing/)
- [확률과 통계 시리즈 1편: 확률의 기초](/stats/probability-fundamentals/)

## 참고자료

- Wasserstein, R. L. & Lazar, N. A. "The ASA Statement on p-Values: Context, Process, and Purpose." *The American Statistician*, 70(2), 2016.
- Gelman, A. & Loken, E. "The garden of forking paths." *Columbia University*, 2013.
- Bickel, P. J., Hammel, E. A., & O'Connell, J. W. "Sex Bias in Graduate Admissions: Data from Berkeley." *Science*, 187(4175), 1975.
- Benjamini, Y. & Hochberg, Y. "Controlling the False Discovery Rate." *JRSS B*, 57(1), 1995.
- Pearl, J. *The Book of Why*. Basic Books, 2018.
- Sullivan, G. M. & Feinn, R. "Using Effect Size, or Why the p Value Is Not Enough." *Journal of Graduate Medical Education*, 4(3), 2012.
