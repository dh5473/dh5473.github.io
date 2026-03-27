---
date: '2026-02-26'
title: '통계적 함정: 다중 검정, p-hacking, 심슨의 역설, 상관 ≠ 인과'
category: 'Statistics'
series: 'stats'
seriesOrder: 18
tags: ['통계적 함정', 'p-hacking', "Simpson's Paradox", 'Multiple Testing', '상관과 인과']
summary: '다중 검정, p-hacking, 심슨의 역설, 상관≠인과, 기저율 무시 — 데이터를 다룰 때 반드시 알아야 할 통계적 함정과 방어법을 Python 시뮬레이션으로 총정리한다.'
thumbnail: './thumbnail.png'
---

"통계는 거짓말을 하지 않지만, 거짓말쟁이는 통계를 한다." 이 오래된 경구는 과장이 아니다. [지난 글](/stats/ab-testing/)에서 A/B 테스트를 다루며 "통계를 잘못 쓰면 오히려 더 위험하다"는 점을 언급했다. 이 시리즈의 마지막 편인 이 글에서는, 그 위험의 실체를 하나하나 파헤친다.

17편에 걸쳐 확률론의 기초부터 추론, 응용까지 쌓아온 도구들은 그 자체로는 강력하다. 문제는 도구를 휘두르는 사람에게 있다. 검정을 남발하면 거짓 발견이 쏟아지고, p-value를 조작하면 원하는 결론을 만들어낼 수 있으며, 데이터를 잘못 집계하면 현실과 정반대의 결론에 도달한다. 통계적 사고력의 최종 관문은 이런 함정을 알아채는 능력이다.

---

## 다중 검정 문제 (Multiple Testing Problem)

### 20번 검정하면 1번은 속는다

[가설검정](/stats/hypothesis-testing/)에서 유의수준 $\alpha = 0.05$의 의미를 배웠다. 귀무가설이 참일 때 이를 잘못 기각할 확률, 즉 1종 오류의 상한이 5%라는 뜻이다. 한 번의 검정에서는 합리적인 기준이지만, **여러 번 반복하면 상황이 달라진다.**

효과가 전혀 없는 데이터에 대해 독립적인 검정을 $m$번 수행한다고 하자. 각 검정에서 거짓 양성이 나올 확률이 $\alpha$이므로, $m$번 중 **적어도 하나**가 유의하게 나올 확률은:

$$P(\text{적어도 1개 거짓 양성}) = 1 - (1-\alpha)^m$$

| 검정 횟수 $m$ | 거짓 양성 1개 이상 확률 |
|---|---|
| 1 | 5.0% |
| 5 | 22.6% |
| 10 | 40.1% |
| 20 | **64.2%** |
| 100 | **99.4%** |

20개의 변수를 테스트하면 아무 효과가 없어도 64%의 확률로 "유의한" 결과가 하나 이상 나온다. Python으로 직접 확인해 보자.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

n_tests = 20
n_samples = 100
significant_count = 0
n_simulations = 10000

for _ in range(n_simulations):
    p_values = []
    for _ in range(n_tests):
        # 두 그룹 모두 같은 분포에서 추출 (효과 없음)
        group_a = np.random.normal(0, 1, n_samples)
        group_b = np.random.normal(0, 1, n_samples)
        _, p = stats.ttest_ind(group_a, group_b)
        p_values.append(p)
    # 20개 중 하나라도 p < 0.05이면 "발견"
    if min(p_values) < 0.05:
        significant_count += 1

print(f"20개 검정 시 거짓 발견 비율: {significant_count/n_simulations:.1%}")
# 20개 검정 시 거짓 발견 비율: 64.0%
```

효과가 전혀 없는 랜덤 데이터인데도, 20개를 검정하면 약 64%의 시뮬레이션에서 "유의한 결과"가 나타났다.

### 보정 방법

다중 검정 문제의 핵심 해법은 유의수준을 조정하는 것이다.

**Bonferroni 보정**: 가장 간단하고 보수적인 방법이다. 유의수준을 검정 횟수로 나눈다.

$$\alpha_{\text{adjusted}} = \frac{\alpha}{m}$$

20개 검정이면 $\alpha = 0.05/20 = 0.0025$. 직관적이고 구현이 쉽지만, 지나치게 보수적이라 진짜 효과까지 놓칠 수 있다(검정력 손실).

**FDR 제어 (Benjamini-Hochberg)**: 모든 거짓 양성을 차단하는 대신, **거짓 발견 비율(False Discovery Rate)**을 일정 수준 이하로 유지하는 전략이다. 탐색적 분석에서 Bonferroni보다 훨씬 실용적이다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

n_tests = 20
n_samples = 100

# 20개 검정 중 처음 3개만 진짜 효과 있음
p_values = []
for i in range(n_tests):
    group_a = np.random.normal(0, 1, n_samples)
    if i < 3:
        group_b = np.random.normal(0.5, 1, n_samples)  # 효과 크기 0.5
    else:
        group_b = np.random.normal(0, 1, n_samples)     # 효과 없음
    _, p = stats.ttest_ind(group_a, group_b)
    p_values.append(p)

p_values = np.array(p_values)

# Bonferroni 보정
bonferroni_sig = p_values < (0.05 / n_tests)

# Benjamini-Hochberg FDR 보정
sorted_idx = np.argsort(p_values)
sorted_p = p_values[sorted_idx]
bh_threshold = np.arange(1, n_tests + 1) / n_tests * 0.05
bh_reject = sorted_p <= bh_threshold
# BH는 마지막으로 기각되는 지점까지 모두 기각
if bh_reject.any():
    max_reject_idx = np.max(np.where(bh_reject))
    bh_reject_final = np.zeros(n_tests, dtype=bool)
    bh_reject_final[sorted_idx[:max_reject_idx + 1]] = True
else:
    bh_reject_final = np.zeros(n_tests, dtype=bool)

print("검정 | p-value  | Bonferroni | BH-FDR | 진짜 효과")
print("-" * 55)
for i in range(n_tests):
    true_effect = "O" if i < 3 else "X"
    bonf = "기각" if bonferroni_sig[i] else "  -"
    bh = "기각" if bh_reject_final[i] else "  -"
    print(f" {i+1:2d}  | {p_values[i]:.4f}  |    {bonf}   |  {bh}  |    {true_effect}")
```

Bonferroni는 보수적이라 진짜 효과를 놓칠 수 있고, BH-FDR은 더 많은 진짜 효과를 잡아내면서도 거짓 발견 비율을 제어한다. 유전체학(genomics)처럼 수천 개의 유전자를 동시에 검정하는 분야에서는 BH 방법이 사실상 표준이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 FWER vs FDR</strong><br>
Bonferroni는 <strong>FWER(Family-Wise Error Rate)</strong> — "하나라도 거짓 양성이 나올 확률"을 제어한다. BH는 <strong>FDR(False Discovery Rate)</strong> — "기각한 것 중 거짓 양성의 비율"을 제어한다. FWER 제어는 더 엄격하지만 검정력이 떨어지고, FDR 제어는 더 관대하지만 탐색적 분석에 적합하다.</div>

---

## p-hacking: 원하는 결론을 "만들어내는" 기술

### 정의와 수법들

p-hacking은 유의미한 p-value를 얻기 위해 분석 과정을 의도적 또는 무의식적으로 조작하는 행위다. 다중 검정 문제가 "모르고 빠지는 함정"이라면, p-hacking은 "알면서 파는 함정"에 가깝다.

흔한 수법들을 정리하면:

| 수법 | 설명 | 왜 문제인가 |
|---|---|---|
| **변수 선택적 보고** | 여러 종속/독립 변수 조합을 시도하고 유의한 것만 보고 | 다중 검정을 은폐 |
| **이상치 제거 기준 조작** | p < 0.05가 나올 때까지 이상치 제거 기준을 조정 | 데이터를 결론에 맞춤 |
| **분석 중단 시점 조절** | 데이터를 조금씩 추가하며 p-value 모니터링, 유의해지면 중단 | 실제 α가 명목 α보다 훨씬 높아짐 |
| **하위 그룹 사후 분석** | 전체에서 유의하지 않으면 성별, 연령대 등으로 쪼개서 재분석 | 검정 횟수 폭증 |
| **공변량 추가/제거** | 통제 변수를 넣었다 뺐다 하며 모델 조정 | 연구자 자유도 남용 |

### 시뮬레이션: 같은 데이터에서 p < 0.05 만들기

완전히 효과 없는 데이터에서 p-hacking으로 "유의한" 결과를 만드는 과정을 시뮬레이션해 보자.

```python
import numpy as np
from scipy import stats

np.random.seed(123)

# 효과가 전혀 없는 데이터
x = np.random.normal(50, 10, 200)
y = np.random.normal(50, 10, 200)

print("=== p-hacking 시뮬레이션 ===\n")

# 1단계: 전체 데이터로 t-검정 → 유의하지 않음
t, p = stats.ttest_ind(x, y)
print(f"1) 전체 데이터 (n=200 vs 200): p = {p:.4f}")

# 2단계: 상위 50%만 선택 → 하위 그룹에서 유의!
x_sub = x[x > np.median(x)]
y_sub = y[y > np.median(y)]
t, p = stats.ttest_ind(x_sub, y_sub)
print(f"2) 상위 50%만 (n={len(x_sub)} vs {len(y_sub)}): p = {p:.4f}")

# 3단계: 이상치 제거 (평균±1.5σ 바깥 제거)
x_mean, x_std = np.mean(x), np.std(x)
y_mean, y_std = np.mean(y), np.std(y)
x_clean = x[np.abs(x - x_mean) < 1.5 * x_std]
y_clean = y[np.abs(y - y_mean) < 1.5 * y_std]
t, p = stats.ttest_ind(x_clean, y_clean)
print(f"3) 이상치 제거 (n={len(x_clean)} vs {len(y_clean)}): p = {p:.4f}")

# 4단계: 여러 분할 시도 → 일부 구간에서 유의한 결과
print("\n4) 구간별 분석:")
best_p = 1.0
best_desc = ""
for low, high in [(0, 50), (25, 75), (50, 100), (30, 70), (40, 90), (10, 60),
                  (20, 80), (35, 85), (15, 65), (45, 95)]:
    mask_x = (x >= np.percentile(x, low)) & (x <= np.percentile(x, high))
    mask_y = (y >= np.percentile(y, low)) & (y <= np.percentile(y, high))
    if mask_x.sum() > 5 and mask_y.sum() > 5:
        t, p_sub = stats.ttest_ind(x[mask_x], y[mask_y])
        if p_sub < best_p:
            best_p = p_sub
            best_desc = f"x[{low}%-{high}%] vs y[{low}%-{high}%]"

print(f"   10개 구간 중 최소 p-value: {best_p:.4f} ({best_desc})")

# 5단계: 변수 변환 시도
transforms = {
    "log(x+100)": (np.log(x + 100), np.log(y + 100)),
    "sqrt(|x|)": (np.sqrt(np.abs(x)), np.sqrt(np.abs(y))),
    "x^2": (x**2, y**2),
    "1/x": (1/(x + 0.01), 1/(y + 0.01)),
}
print("\n5) 변수 변환 시도:")
for name, (xt, yt) in transforms.items():
    t, p_tr = stats.ttest_ind(xt, yt)
    marker = " ← 유의!" if p_tr < 0.05 else ""
    print(f"   {name}: p = {p_tr:.4f}{marker}")
```

이 시뮬레이션은 완벽하게 동일한 분포에서 추출한 데이터임에도, 구간 분할이나 변수 변환 등의 수법을 동원하면 p < 0.05에 근접하거나 도달할 수 있음을 보여준다. 10가지 구간 분할을 시도하는 것은 사실상 10번의 검정을 수행하는 것인데, 그 중 최소 p-value만 보고한다면 다중 검정 보정 없이 거짓 발견을 제조하는 셈이다.

### 방어: 사전 등록(Pre-registration)

p-hacking의 가장 강력한 방어책은 **사전 등록(Pre-registration)**이다. 데이터 수집 전에 가설, 분석 방법, 표본 크기, 유의수준을 공개적으로 등록한다. 사후적 분석 조작의 여지를 원천 차단하는 것이다.

- [OSF Registries](https://osf.io/registries) — 학술 연구 사전 등록 플랫폼
- [AsPredicted.org](https://aspredicted.org) — 간소화된 사전 등록
- 기업 A/B 테스트에서도 실험 계획서를 사전에 문서화하는 것이 동일한 원리

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ p-hacking은 사기(fraud)와 다르다</strong><br>
데이터 조작은 명백한 연구 부정이다. p-hacking은 데이터 자체는 건드리지 않지만 분석 과정에서의 "연구자 자유도(researcher degrees of freedom)"를 남용한다. 더 교활한 점은 연구자 본인조차 자신이 p-hacking을 하고 있다는 사실을 인식하지 못하는 경우가 많다는 것이다. 이것이 사전 등록이 필요한 근본 이유다.</div>

---

## 심슨의 역설 (Simpson's Paradox)

### 전체와 부분이 반대 방향을 가리킨다

심슨의 역설은 하위 그룹에서 성립하는 경향이 전체 데이터를 합산하면 역전되는 현상이다. 가장 유명한 사례는 1973년 UC 버클리 대학원 입학 데이터다.

전체 합산 결과만 보면 여성의 합격률이 남성보다 낮아 "성차별이 존재한다"는 결론에 이른다. 그러나 학과별로 나누어 보면 대부분의 학과에서 여성 합격률이 남성과 비슷하거나 오히려 높았다. 역설의 원인은 여성 지원자가 합격률이 낮은 경쟁이 치열한 학과에 더 많이 지원했기 때문이다.

Python으로 이 구조를 재현해 보자.

```python
import numpy as np
import pandas as pd

np.random.seed(42)

# UC Berkeley 스타일 시뮬레이션 데이터
data = {
    '학과': ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D'],
    '성별': ['남', '여', '남', '여', '남', '여', '남', '여'],
    '지원자': [825, 108, 560, 25, 325, 593, 417, 375],
    '합격자': [512, 89, 353, 17, 120, 202, 138, 131],
}
df = pd.DataFrame(data)
df['합격률'] = df['합격자'] / df['지원자']

print("=== 학과별 합격률 ===")
for dept in ['A', 'B', 'C', 'D']:
    dept_data = df[df['학과'] == dept]
    male = dept_data[dept_data['성별'] == '남'].iloc[0]
    female = dept_data[dept_data['성별'] == '여'].iloc[0]
    print(f"학과 {dept}: 남 {male['합격률']:.1%} ({male['지원자']}명) | "
          f"여 {female['합격률']:.1%} ({female['지원자']}명)")

# 전체 합산
male_total = df[df['성별'] == '남']
female_total = df[df['성별'] == '여']
male_rate = male_total['합격자'].sum() / male_total['지원자'].sum()
female_rate = female_total['합격자'].sum() / female_total['지원자'].sum()
print(f"\n=== 전체 합산 ===")
print(f"남성 합격률: {male_rate:.1%} ({male_total['지원자'].sum()}명)")
print(f"여성 합격률: {female_rate:.1%} ({female_total['지원자'].sum()}명)")
print(f"\n→ 전체: 남성이 높다. 학과별: 여성이 같거나 높다 → 심슨의 역설!")
```

학과별로 보면 여성 합격률이 남성과 비슷하거나 높은데, 전체를 합치면 남성이 더 높게 나타난다. 이 역설의 핵심은 **교란 변수(Confounding Variable)** — 여기서는 "지원 학과"가 성별과 합격률 모두에 영향을 미치기 때문이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 심슨의 역설 방어법</strong><br>
항상 "이 데이터를 합산해도 되는가?"를 먼저 물어야 한다. 하위 그룹 간 구성 비율이 다르면 단순 합산은 위험하다. 핵심 교란 변수를 파악하고, 그룹별로 나누어 분석(stratified analysis)하거나 회귀 모형에서 교란 변수를 통제해야 한다.</div>

---

## 상관 ≠ 인과 (Correlation ≠ Causation)

### 거짓 상관의 세계

두 변수가 함께 움직인다고 해서 하나가 다른 하나를 야기하는 것은 아니다. Tyler Vigen의 [Spurious Correlations](https://tylervigen.com/spurious-correlations) 프로젝트에는 수백 개의 거짓 상관이 수집되어 있다.

- 니콜라스 케이지 출연 영화 수 vs 수영장 익사 사고 수 (r = 0.67)
- 미국 치즈 소비량 vs 침대 시트에 얽혀 사망한 사람 수 (r = 0.95)
- 1인당 마가린 소비 vs 메인 주 이혼율 (r = 0.99)

높은 상관계수가 인과관계를 증명하지 않는 이유는 크게 세 가지다.

| 원인 | 설명 | 예시 |
|---|---|---|
| **교란 변수** | 제3의 변수가 둘 다에 영향 | 아이스크림 판매 ↑ & 범죄율 ↑ (교란: 기온) |
| **역인과** | 인과 방향이 반대 | "소방관이 많을수록 화재 피해가 크다" (큰 화재 → 소방관 투입) |
| **우연의 일치** | 시계열 데이터에서 추세가 우연히 겹침 | 니콜라스 케이지 vs 수영장 익사 |

```python
import numpy as np
from scipy import stats

np.random.seed(42)
n = 50

# 교란 변수 Z가 X, Y 모두에 영향
z = np.random.normal(0, 1, n)  # 교란 변수 (예: 기온)
x = 2 * z + np.random.normal(0, 1, n)  # 아이스크림 판매
y = 3 * z + np.random.normal(0, 1, n)  # 범죄율

# X와 Y의 상관
r_xy, p_xy = stats.pearsonr(x, y)
print(f"X-Y 상관: r = {r_xy:.3f}, p = {p_xy:.4f}")

# Z를 통제한 편상관(Partial Correlation)
# X ~ Z의 잔차, Y ~ Z의 잔차의 상관
slope_xz = np.polyfit(z, x, 1)
slope_yz = np.polyfit(z, y, 1)
resid_x = x - np.polyval(slope_xz, z)
resid_y = y - np.polyval(slope_yz, z)
r_partial, p_partial = stats.pearsonr(resid_x, resid_y)
print(f"Z 통제 후 편상관: r = {r_partial:.3f}, p = {p_partial:.4f}")
print(f"\n→ 교란 변수 Z를 통제하면 X-Y 상관이 사라진다!")
```

교란 변수 Z(기온)를 통제하면 X(아이스크림)와 Y(범죄율) 사이의 강한 상관이 사라지는 것을 볼 수 있다. 관측 데이터에서 인과를 주장하려면 교란 변수를 철저히 통제해야 한다.

### 인과 추론의 조건

순수한 관측 데이터에서 상관을 인과로 끌어올리기 위한 접근법들이 있다.

| 방법 | 핵심 아이디어 | 한계 |
|---|---|---|
| **RCT (무작위 통제 실험)** | 처리군/통제군을 무작위 배정하여 교란 제거 | 비용, 윤리적 제약 |
| **도구변수 (Instrumental Variable)** | 처리에만 영향을 주고 결과에는 직접 영향 없는 변수 활용 | 적절한 도구변수 찾기 어려움 |
| **자연실험 (Natural Experiment)** | 외부 충격이 무작위 배정 역할을 한 상황 활용 | 드물고, 가정 검증이 어려움 |
| **회귀불연속 설계 (RDD)** | 임계값 근처에서 처리 유무가 바뀌는 상황 활용 | 임계값 근처 데이터만 사용 |

실무에서 A/B 테스트가 "황금 표준"인 이유가 바로 여기에 있다. 무작위 배정은 알려진 교란 변수뿐 아니라 알려지지 않은 교란 변수까지 균형을 맞추는 유일한 방법이기 때문이다.

---

## 기저율 무시 (Base Rate Neglect)

### 양성이라고 다 환자가 아니다

[조건부 확률과 베이즈 정리](/stats/conditional-probability-bayes/)에서 베이즈 정리를 처음 배웠고, [베이지안 추론](/stats/bayesian-inference/)에서 이를 추론 프레임워크로 확장했다. 기저율 무시는 베이즈 정리를 직관적으로 이해하지 못할 때 빠지는 대표적인 함정이다.

유병률 0.1%(1,000명 중 1명)인 질병에 대해 민감도 99%, 특이도 99%인 검사가 있다고 하자.

$$P(\text{질병} \mid \text{양성}) = \frac{P(\text{양성} \mid \text{질병}) \cdot P(\text{질병})}{P(\text{양성})}$$

```python
import numpy as np

# 기저율 무시 시뮬레이션
prevalence = 0.001     # 유병률 0.1%
sensitivity = 0.99     # 민감도 (진양성률)
specificity = 0.99     # 특이도 (진음성률)

# 베이즈 정리
p_positive = sensitivity * prevalence + (1 - specificity) * (1 - prevalence)
p_disease_given_positive = (sensitivity * prevalence) / p_positive

print("=== 기저율 무시 예제 ===\n")
print(f"유병률: {prevalence:.1%}")
print(f"민감도: {sensitivity:.0%}")
print(f"특이도: {specificity:.0%}")
print(f"\n양성 판정 시 실제 감염 확률: {p_disease_given_positive:.1%}")
print(f"양성 판정 시 거짓 양성 확률: {1 - p_disease_given_positive:.1%}")

# 100만 명 검사 시뮬레이션
population = 1_000_000
actual_sick = int(population * prevalence)
actual_healthy = population - actual_sick

true_positive = int(actual_sick * sensitivity)
false_positive = int(actual_healthy * (1 - specificity))

print(f"\n=== 100만 명 검사 결과 ===")
print(f"실제 환자: {actual_sick:,}명")
print(f"진양성 (정확한 양성): {true_positive:,}명")
print(f"거짓 양성 (건강한데 양성): {false_positive:,}명")
print(f"전체 양성: {true_positive + false_positive:,}명")
print(f"양성 중 실제 환자 비율: {true_positive/(true_positive+false_positive):.1%}")
```

민감도와 특이도가 모두 99%인 "우수한" 검사임에도, 유병률이 0.1%로 낮으면 양성 판정을 받은 사람 중 **실제 환자는 약 9%에 불과하다.** 나머지 91%는 건강한데 양성으로 잘못 분류된 거짓 양성이다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ 실무에서의 기저율 무시</strong><br>
이 함정은 의료 검사만의 문제가 아니다. 스팸 필터, 사기 탐지, 이상 탐지 등 <strong>"희귀 사건을 탐지하는 모든 시스템"</strong>에 동일하게 적용된다. 사기 거래 비율이 0.01%인 시스템에서 99% 정확도를 자랑해도, 양성 판정의 대부분은 거짓 양성이다. 모델 성능을 정확도(accuracy)만으로 판단하면 안 되는 이유가 여기에 있다.</div>

---

## 통계적 유의성 ≠ 실질적 중요성

### p-value가 작아도 쓸모없을 수 있다

[가설검정](/stats/hypothesis-testing/)에서 p-value의 정확한 의미를 다뤘다. p < 0.05는 "효과가 0이라는 가설 하에서 이 정도 이상의 데이터를 관측할 확률이 5% 미만"이라는 뜻이지, "효과가 크다"는 뜻이 아니다.

표본 크기가 매우 크면 아무리 작은 차이도 통계적으로 유의해진다. 이것이 **대표본의 저주**다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

print("=== 표본 크기와 p-value의 관계 ===\n")
print(f"{'표본 크기':>10} | {'평균 차이':>10} | {'p-value':>12} | {'Cohen d':>10} | 판정")
print("-" * 70)

# 진짜 평균 차이가 0.02 (체감 불가능한 미미한 차이, Cohen's d ≈ 0.02)
for n in [100, 1000, 10000, 100000, 1000000]:
    group_a = np.random.normal(100, 1, n)
    group_b = np.random.normal(100.02, 1, n)

    t, p = stats.ttest_ind(group_a, group_b)
    mean_diff = np.mean(group_b) - np.mean(group_a)
    pooled_std = np.sqrt((np.std(group_a)**2 + np.std(group_b)**2) / 2)
    cohens_d = mean_diff / pooled_std

    sig = "유의 *" if p < 0.05 else "비유의"
    print(f"{n:>10,} | {mean_diff:>10.4f} | {p:>12.6f} | {cohens_d:>10.4f} | {sig}")

print(f"\n→ Cohen's d ≈ 0.02 (사실상 무의미)인데, n이 커지면 p-value만 작아진다!")
```

두 그룹의 실제 평균 차이가 0.02(Cohen's d $\approx$ 0.02)에 불과해도 표본이 충분히 크면 p-value는 극도로 작아진다. Cohen의 기준에서 d = 0.02는 "작은 효과"(0.2)에도 한참 못 미치는 수준이다. p-value가 아무리 작아도 효과 크기가 실질적으로 의미 없다면 그 결과는 쓸모가 없다.

### 효과 크기(Effect Size)를 반드시 보고하라

| 지표 | 공식 | 해석 기준 (Cohen) |
|---|---|---|
| **Cohen's d** | $d = \frac{\bar{X}_1 - \bar{X}_2}{s_p}$ | 소: 0.2, 중: 0.5, 대: 0.8 |
| **상관계수 r** | $r = \sqrt{\frac{t^2}{t^2 + df}}$ | 소: 0.1, 중: 0.3, 대: 0.5 |
| <strong>$\eta^2$ (에타 제곱)</strong> | $\eta^2 = \frac{SS_{\text{between}}}{SS_{\text{total}}}$ | 소: 0.01, 중: 0.06, 대: 0.14 |

p-value만 보고하는 논문이나 보고서는 불완전하다. **효과 크기 + 신뢰구간 + p-value** 세 가지를 함께 보고해야 결과의 실질적 의미를 판단할 수 있다.

---

## 생태학적 오류와 개인주의적 오류

### 집단 통계로 개인을 판단하지 마라

| 오류 유형 | 방향 | 예시 |
|---|---|---|
| **생태학적 오류** (Ecological Fallacy) | 집단 → 개인 | "소득이 높은 지역의 범죄율이 낮다" → "부유한 사람은 범죄를 저지르지 않는다" |
| **개인주의적 오류** (Atomistic Fallacy) | 개인 → 집단 | "이 환자에게 약이 효과 있었다" → "이 약은 모든 환자에게 효과 있다" |

생태학적 오류는 집단 수준의 상관관계를 개인 수준에 그대로 적용할 때 발생한다. 국가별 초콜릿 소비량과 노벨상 수상자 수가 상관있다고 해서 "초콜릿을 먹으면 노벨상을 탄다"고 말할 수 없다.

```python
import numpy as np
from scipy import stats

np.random.seed(42)

n_groups = 20
group_means_x = np.random.uniform(30, 70, n_groups)
group_means_y = 0.8 * group_means_x + np.random.normal(0, 5, n_groups)

# 집단 수준 상관
r_group, _ = stats.pearsonr(group_means_x, group_means_y)
print(f"집단 수준 상관 (n={n_groups} 그룹): r = {r_group:.3f}")

# 개인 수준 데이터 생성 — 집단 내에서는 상관이 약하거나 없음
all_x, all_y = [], []
for gx, gy in zip(group_means_x, group_means_y):
    n_ind = 50
    ind_x = np.random.normal(gx, 15, n_ind)
    ind_y = np.random.normal(gy, 15, n_ind)  # 개인 수준에서 x와 y는 독립
    all_x.extend(ind_x)
    all_y.extend(ind_y)

r_individual, _ = stats.pearsonr(all_x, all_y)
print(f"개인 수준 상관 (n={n_groups * 50} 명): r = {r_individual:.3f}")
print(f"\n→ 집단 수준에서 강한 상관이 개인 수준에서는 약해진다!")
```

집단 평균 간의 강한 상관이 개인 수준에서는 상당히 약해지는 것을 확인할 수 있다. 분석 단위(unit of analysis)와 결론의 적용 단위를 항상 일치시켜야 한다.

---

## 방어 체크리스트

통계 분석을 수행하거나 통계 기반 보고서를 읽을 때, 다음 체크리스트를 습관화하면 대부분의 함정을 피할 수 있다.

| # | 점검 항목 | 관련 함정 |
|---|---|---|
| 1 | 검정을 몇 번 수행했는가? 다중 검정 보정을 했는가? | 다중 검정 |
| 2 | 분석 계획이 사전에 수립되었는가? | p-hacking |
| 3 | 하위 그룹 분석 결과가 전체와 일치하는가? | 심슨의 역설 |
| 4 | 상관관계를 인과로 해석하고 있지는 않은가? | 상관 ≠ 인과 |
| 5 | 기저율(사전 확률)을 고려했는가? | 기저율 무시 |
| 6 | 효과 크기와 신뢰구간을 함께 보고했는가? | 유의성 ≠ 중요성 |
| 7 | 분석 단위와 결론 적용 단위가 일치하는가? | 생태학적/개인주의적 오류 |
| 8 | 표본 크기가 결론을 지지하기에 충분한가? | 검정력 부족 |
| 9 | 데이터 수집 과정에서 편향(selection bias)은 없는가? | 표본 편향 |
| 10 | 결론이 "너무 좋아 보이면" 의심했는가? | 모든 함정 |

<div style="background: #f0f9f4; border-left: 4px solid #10b981; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>✅ 실전 팁</strong><br>
이 체크리스트를 팀 데이터 분석 리뷰 프로세스에 포함시키면 효과적이다. 코드 리뷰처럼 "통계 리뷰"를 도입하고, 분석자가 아닌 제3자가 위 항목을 점검하는 구조가 이상적이다.</div>

---

## 마치며: 18편의 통계 여정을 돌아보며

이 글로 **확률과 통계 시리즈 전 18편**이 완결된다.

[확률의 기초](/stats/probability-fundamentals/)에서 표본 공간과 확률 공리를 정의하며 시작한 여정은, 세 개의 큰 장으로 이루어져 있었다.

**확률론 기초(1~7편)** — [확률 기초](/stats/probability-fundamentals/)에서 불확실성의 수학적 언어를 처음 배웠고, [조건부 확률과 베이즈 정리](/stats/conditional-probability-bayes/)에서 "정보가 확률을 바꾸는" 메커니즘을 만났다. [확률변수와 기댓값](/stats/random-variables-expectation/), [이산 분포](/stats/discrete-distributions/), [연속 분포](/stats/continuous-distributions/)를 거치며 현실 세계의 불확실성을 모델로 옮기는 법을 익혔다. [대수의 법칙과 중심극한정리](/stats/lln-and-clt/)에서 표본과 모집단을 잇는 다리를 놓았고, [정보이론](/stats/information-theory/)에서 "정보"라는 개념 자체를 정량화했다.

**통계적 추론(8~14편)** — 확률론이라는 토대 위에서 추론의 도구들이 하나씩 쌓였다. [점추정](/stats/point-estimation/)과 [MLE](/stats/mle-and-mom/)로 데이터에서 모수를 추정하는 체계적 방법을 배웠다. [신뢰구간](/stats/confidence-intervals/)으로 추정의 불확실성을 구간으로 표현하고, [가설검정](/stats/hypothesis-testing/)과 [검정 방법론](/stats/statistical-tests/)으로 의사결정의 틀을 세웠다. [부트스트랩](/stats/bootstrap/)에서 분포 가정이 어려울 때의 비모수적 우회로를 확보했고, [베이지안 추론](/stats/bayesian-inference/)에서 완전히 다른 패러다임의 눈으로 같은 문제를 바라보았다.

**응용 통계(15~18편)** — 이론이 현실과 만나는 마지막 장에서는 [EDA](/stats/eda-descriptive-stats/)로 데이터와의 첫 대면법을 다루고, [표본 추출](/stats/sampling-and-bias/)로 데이터 수집의 과학을 배웠으며, [A/B 테스트](/stats/ab-testing/)에서 인과 추론을 실전에 적용했다. 그리고 이 마지막 편에서, 그 모든 도구를 잘못 사용할 때 벌어지는 일들을 직시했다.

돌이켜 보면, 이 시리즈의 메타-교훈은 하나로 수렴한다. **통계는 "정답"을 알려주는 마법이 아니라, 불확실성 속에서 "최선의 판단"을 내리기 위한 사고 체계다.** p-value가 0.03이라는 숫자 자체에는 선도 악도 없다. 그 숫자가 어떤 맥락에서, 얼마나 엄밀한 과정을 거쳐 나왔는지, 효과의 크기는 실질적으로 의미 있는지, 교란 변수는 통제되었는지 — 이런 질문을 던질 줄 아는 능력이 통계적 사고력이다.

데이터가 넘쳐나는 시대에, 통계적 사고력은 데이터를 다루는 모든 사람에게 가장 기본적인 무기다. 이 시리즈가 그 무기를 벼리는 데 작은 도움이 되었기를 바란다.

---

## 참고자료

- Wasserstein, R. L. & Lazar, N. A. "The ASA Statement on p-Values: Context, Process, and Purpose." *The American Statistician*, 70(2), 2016. — 미국통계학회의 공식 p-value 성명
- Gelman, A. & Loken, E. "The garden of forking paths." *Columbia University*, 2013. — 연구자 자유도와 p-hacking의 이론적 분석
- Bickel, P. J. et al. "Sex Bias in Graduate Admissions: Data from Berkeley." *Science*, 187(4175), 1975. — UC Berkeley 심슨의 역설 원논문
- Pearl, J. *The Book of Why*. Basic Books, 2018. — 인과 추론의 대중서
- Sullivan, G. M. & Feinn, R. "Using Effect Size — or Why the p Value Is Not Enough." *Journal of Graduate Medical Education*, 4(3), 2012. — 효과 크기 보고의 중요성
