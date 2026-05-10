---
date: '2026-02-24'
title: '표본 추출과 편향(Sampling and Bias): 240만 명이 틀리고 5만 명이 맞은 이유'
category: 'Statistics'
series: 'stats'
seriesOrder: 16
tags: ['표본 추출', 'Sampling', '편향', '생존자 편향', '표본 크기']
summary: '확률/비확률적 표본 추출법, 선택·생존자·응답 편향의 실제 사례, 표본 크기 결정 공식과 Python 시뮬레이션으로 편향된 표본의 위험성을 직접 확인한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/stats/eda-descriptive-stats/)에서 EDA와 기술통계를 다루며, 데이터를 요약하고 시각화하는 기본기를 익혔다. 그 글의 마지막에 던진 질문이 하나 있다. **"이 데이터가 모집단을 대표하는가?"** 오늘은 바로 그 질문에 답한다.

1936년 미국 대선. 시사 잡지 *Literary Digest*는 약 240만 명에게 설문을 보내 공화당 후보 Alf Landon의 압승을 예측했다. 역사상 가장 거대한 규모의 여론조사였다. 결과? Franklin Roosevelt가 46개 주에서 승리하며 역대급 압승을 거뒀다. 반면, 신생 여론조사 기관이었던 George Gallup은 고작 50,000명의 표본으로 Roosevelt의 승리를 정확히 맞혔다.

240만 대 5만. 왜 숫자가 48배나 많은 쪽이 틀렸을까? *Literary Digest*는 자사 구독자, 전화번호부, 자동차 등록부에서 설문 대상을 뽑았다. 1936년, 대공황 한복판이다. 전화와 자동차가 있는 사람은 상대적으로 부유한 계층이었고, 이들은 공화당을 지지할 확률이 높았다. 표본이 모집단을 대표하지 못한 것이다.

이 사건이 가르쳐주는 교훈은 명확하다. **표본의 크기보다 표본의 대표성이 중요하다.**

---

## 모집단과 표본: 전수조사가 불가능한 이유

### 기본 용어 정리

| 용어 | 정의 | 예시 |
|---|---|---|
| **모집단(Population)** | 관심 대상 전체의 집합 | 한국의 성인 전체 |
| **표본(Sample)** | 모집단에서 추출한 부분집합 | 설문에 응답한 1,000명 |
| **모수(Parameter)** | 모집단의 특성을 나타내는 고정 상수 | 모집단 평균 $\mu$, 비율 $p$ |
| **통계량(Statistic)** | 표본에서 계산한 값 | 표본 평균 $\bar{X}$, 표본 비율 $\hat{p}$ |

모집단 전체를 조사하는 것을 **전수조사**(Census)라 한다. 인구조사가 대표적이다. 그런데 왜 항상 전수조사를 하지 않을까?

- **비용과 시간**: 한국 인구주택총조사는 5년에 한 번, 수천억 원의 예산이 투입된다.
- **파괴 검사**: 전구의 수명을 테스트하려면 전구를 켜서 꺼질 때까지 기다려야 한다. 전수조사하면 팔 전구가 남지 않는다.
- **무한 모집단**: "이 약을 복용할 미래의 모든 환자"는 아직 존재하지도 않는다.

그래서 표본을 추출한다. 핵심은 표본이 모집단을 **잘 대표**해야 한다는 것이다. [점추정](/stats/point-estimation/)에서 배웠던 비편향성(Unbiasedness)을 기억하는가? 추정량이 비편향이려면, 그 전제에 "표본이 모집단으로부터 적절히 추출되었다"는 가정이 깔려 있다.

---

## 확률적 표본 추출법(Probability Sampling)

확률적 표본 추출에서는 모집단의 모든 원소가 표본에 포함될 확률이 알려져 있고, 0보다 크다. 이 조건을 만족해야 통계적 추론이 정당화된다.

### 비교표

| 방법 | 설명 | 장점 | 단점 | 적합한 상황 |
|---|---|---|---|---|
| **단순 무작위 추출(SRS)** | 모든 원소가 동일한 확률로 선택 | 이론이 단순, 편향 없음 | 표본 프레임 필요, 희귀 하위그룹 누락 가능 | 모집단이 균질할 때 |
| **층화 추출(Stratified)** | 모집단을 층(strata)으로 나눈 뒤 각 층에서 독립 추출 | 층 내 변동 줄임, 소수 그룹 보장 | 층 구분 기준 필요 | 하위 그룹 분석이 중요할 때 |
| **군집 추출(Cluster)** | 모집단을 군집으로 나누고 군집 단위로 추출, 선택된 군집은 전수조사 | 표본 프레임 구축 비용 절감 | 군집 간 유사하면 효율 떨어짐 | 지리적으로 분산된 모집단 |
| **체계적 추출(Systematic)** | 첫 번째 원소만 무작위, 이후 $k$번째 간격으로 추출 | 구현이 쉬움 | 주기성이 있으면 편향 발생 | 리스트가 무작위 순서일 때 |

### 단순 무작위 추출 (Simple Random Sampling)

가장 기본이 되는 방법이다. 크기 $N$인 모집단에서 크기 $n$인 표본을 뽑을 때, 가능한 모든 $\binom{N}{n}$ 조합이 동일한 확률을 갖는다.

```python
import numpy as np

np.random.seed(42)

# 모집단: 10,000명의 연봉 (단위: 만원) — 로그정규분포
population = np.random.lognormal(mean=8.0, sigma=0.5, size=10_000)
pop_mean = np.mean(population)
print(f"모집단 평균: {pop_mean:.0f}만원")

# 단순 무작위 추출: 100명
sample_srs = np.random.choice(population, size=100, replace=False)
print(f"SRS 표본 평균: {np.mean(sample_srs):.0f}만원")
# 모집단 평균: 3378만원
# SRS 표본 평균: 3678만원
```

단순 무작위 추출은 기댓값 수준에서 모집단 평균을 편향 없이 추정한다. 하지만 매번 추출할 때마다 표본 평균은 달라진다 — 이 변동성이 바로 [표본 분포](/stats/lln-and-clt/)에서 다룬 표준오차(Standard Error)다.

### 층화 추출 (Stratified Sampling)

모집단을 성별, 연령대, 지역 같은 기준으로 나누고, 각 층에서 독립적으로 표본을 추출한다. 예를 들어 전체 직원 10,000명 중 관리직 2,000명, 실무직 8,000명이라면, 관리직에서 20명, 실무직에서 80명을 따로 뽑는 식이다.

층화 추출의 이론적 장점은 명확하다. 층 내 분산이 작을수록 전체 추정량의 분산이 줄어든다. 수식으로 표현하면:

$$\text{Var}(\bar{X}_{str}) = \sum_{h=1}^{H} \left(\frac{N_h}{N}\right)^2 \frac{\sigma_h^2}{n_h}$$

여기서 $H$는 층의 수, $N_h$는 $h$번째 층의 모집단 크기, $\sigma_h^2$는 층 내 분산, $n_h$는 층별 표본 크기다.

---

## 비확률적 표본 추출법(Non-Probability Sampling)

비확률적 방법에서는 각 원소가 선택될 확률을 알 수 없다. 통계적 추론의 전제가 무너지므로 결과를 모집단으로 일반화하기 어렵다. 그럼에도 현실에서는 빈번히 사용된다.

| 방법 | 설명 | 위험 |
|---|---|---|
| **편의 추출(Convenience)** | 접근하기 쉬운 대상을 표본으로 선택 | 모집단의 특정 부분만 반영 |
| **판단 추출(Purposive)** | 연구자의 판단으로 "대표적인" 대상을 선택 | 연구자의 편견이 개입 |
| **눈덩이 추출(Snowball)** | 기존 응답자가 다음 응답자를 추천 | 동질적 네트워크로 편향 |

:::warning

**주의: 온라인 설문의 함정**

웹사이트 팝업 설문, SNS 투표, 앱 내 만족도 조사 — 이런 데이터는 거의 예외 없이 편의 표본이다. 응답자는 "해당 웹사이트를 방문한 사람" 또는 "해당 SNS를 사용하는 사람"으로 한정된다. 여기서 얻은 결론을 "전체 사용자" 또는 "일반 대중"으로 일반화하면 *Literary Digest*의 실수를 반복하게 된다.

:::

---

## 편향의 유형: 데이터가 거짓말하는 방법들

표본이 모집단을 체계적으로 잘못 반영할 때 **편향**(Bias)이 발생한다. 편향은 표본 크기를 아무리 늘려도 사라지지 않는다. 이것이 무작위 오차(random error)와의 결정적 차이다.

### 선택 편향 (Selection Bias)

표본이 모집단의 특정 부분집합에 치우쳐 추출될 때 발생한다. *Literary Digest* 사례가 전형적이다.

현대의 예시도 넘친다. 병원 기반 연구에서 "특정 질병의 위험 요인"을 분석한다고 하자. 병원에 온 환자만 분석 대상이므로, 경증 환자(병원에 오지 않는)와 중증 환자(이미 사망한)가 빠진다. 이것을 **버크슨 편향**(Berkson's Bias)이라 부른다.

### 생존자 편향 (Survivorship Bias)

성공하거나 "살아남은" 사례만 관측 가능하고, 실패하거나 탈락한 사례는 보이지 않을 때 발생한다.

- "하버드 중퇴자 중에 억만장자가 많다" → 하버드를 중퇴한 수십만 명 중 빌 게이츠, 저커버그만 보인다.
- "자수성가 CEO들이 공통으로 새벽 5시에 일어난다" → 새벽 5시에 일어났지만 실패한 사람은 기사가 되지 않는다.
- 뮤추얼 펀드의 평균 수익률이 실제보다 높게 보고된다 → 수익률이 나빴던 펀드는 폐쇄되어 데이터에서 사라진다.

### 응답 편향 (Response Bias)

응답자가 실제와 다르게 답할 때 발생한다. 민감한 주제(소득, 음주량, 투표 성향)에서 특히 심하다. "일주일에 술을 몇 잔 마시는가?"에 대한 설문 응답을 합산하면 실제 주류 판매량의 40~60%밖에 되지 않는다는 연구가 여러 차례 보고되었다.

### 자기선택 편향 (Self-Selection Bias)

참여 여부를 대상자 본인이 결정할 때 발생한다. 제품 리뷰를 생각해보라. 매우 만족하거나 매우 불만족한 사람이 리뷰를 남길 확률이 높고, 보통인 사람은 아무 말도 하지 않는다. 결과적으로 리뷰 데이터의 분포는 실제 만족도 분포와 다른 양극화된 형태를 띤다.

| 편향 유형 | 핵심 메커니즘 | 대표 사례 |
|---|---|---|
| 선택 편향 | 표본이 모집단의 부분집합 | Literary Digest (1936) |
| 생존자 편향 | 탈락/실패 데이터 누락 | 펀드 수익률, 성공 기업 분석 |
| 응답 편향 | 실제와 다른 응답 | 음주량 설문 |
| 자기선택 편향 | 참여 의사 결정이 결과와 상관 | 온라인 리뷰 |

---

## 에이브러햄 왈드와 비행기 장갑: 생존자 편향의 교과서

제2차 세계대전 중, 미 해군은 통계학자 에이브러햄 왈드(Abraham Wald)에게 한 가지 문제를 의뢰했다. 귀환한 폭격기의 피탄 분포를 분석해서 **어디에 장갑을 보강해야 하는지** 결정해달라는 것이었다.

군 관계자들의 직관은 단순했다. 총알 구멍이 많이 뚫린 부분에 장갑을 대라. 동체와 날개에 구멍이 집중되어 있으니, 그쪽을 보강하자는 논리다.

왈드의 답은 정반대였다. **"총알 구멍이 없는 부분, 즉 엔진 주변에 장갑을 보강해야 한다."**

왜? 분석 대상인 비행기들은 **귀환한** 비행기다. 동체에 총을 맞고도 돌아올 수 있었다는 뜻이다. 엔진에 총을 맞은 비행기는 돌아오지 못했다 — 그래서 데이터에 없는 것이다. 관측된 데이터에서 "빠진 것이 무엇인가?"를 묻는 것이 생존자 편향을 간파하는 핵심이다.

:::info

**실무에서의 교훈**

머신러닝에서도 동일한 문제가 발생한다. 이탈(Churn) 예측 모델을 만들 때, 학습 데이터에는 "현재 남아 있는 고객"과 "이탈한 고객" 중 이탈 직전 데이터가 기록된 고객만 포함된다. 가입 즉시 이탈한 고객이나, 데이터 수집 시스템이 구축되기 전에 떠난 고객은 빠져 있다. 이 누락을 인지하지 못하면 모델의 예측 성능이 실제보다 과대평가된다.

:::

---

## 표본 크기 결정: 얼마나 뽑아야 충분한가?

표본이 편향 없이 추출되었다 해도, 표본 크기가 너무 작으면 추정의 정밀도가 떨어진다. [중심극한정리(CLT)](/stats/lln-and-clt/)에 의하면, 표본 평균의 표준오차는 다음과 같다:

$$\text{SE}(\bar{X}) = \frac{\sigma}{\sqrt{n}}$$

표준오차는 $\sqrt{n}$에 반비례한다. 정밀도를 2배로 높이려면 표본 크기를 4배로 늘려야 한다.

### 오차한계와 필요 표본 크기

95% [신뢰구간](/stats/confidence-intervals/)의 오차한계(Margin of Error, MOE)는:

$$\text{MOE} = z_{\alpha/2} \cdot \frac{\sigma}{\sqrt{n}}$$

이를 $n$에 대해 풀면:

$$n = \left(\frac{z_{\alpha/2} \cdot \sigma}{\text{MOE}}\right)^2$$

비율 추정의 경우, $\sigma$를 $\sqrt{p(1-p)}$로 대체한다. $p$를 모르면 분산이 최대인 $p = 0.5$를 사용하는 것이 보수적 접근이다:

$$n = \left(\frac{z_{\alpha/2}}{2 \cdot \text{MOE}}\right)^2$$

### Python으로 필요 표본 크기 계산

```python
import numpy as np
from scipy import stats

def sample_size_mean(sigma, moe, confidence=0.95):
    """모평균 추정을 위한 최소 표본 크기"""
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    n = (z * sigma / moe) ** 2
    return int(np.ceil(n))

def sample_size_proportion(moe, confidence=0.95, p=0.5):
    """모비율 추정을 위한 최소 표본 크기 (보수적: p=0.5)"""
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    n = (z ** 2 * p * (1 - p)) / moe ** 2
    return int(np.ceil(n))

# 예제 1: 평균 연봉 추정, 표준편차 500만원, 오차한계 100만원
n1 = sample_size_mean(sigma=500, moe=100)
print(f"평균 추정 필요 표본 크기: {n1}명")

# 예제 2: 지지율 추정, 오차한계 ±3%p
n2 = sample_size_proportion(moe=0.03)
print(f"비율 추정 필요 표본 크기: {n2}명")

# 예제 3: 오차한계에 따른 필요 표본 크기 변화
print("\n오차한계(MOE) vs 필요 표본 크기 (비율 추정, 95% 신뢰수준):")
for moe_pct in [5, 3, 2, 1, 0.5]:
    n = sample_size_proportion(moe=moe_pct / 100)
    print(f"  MOE = ±{moe_pct}%p → n = {n:,}")
# 평균 추정 필요 표본 크기: 97명
# 비율 추정 필요 표본 크기: 1068명
#
# 오차한계(MOE) vs 필요 표본 크기 (비율 추정, 95% 신뢰수준):
#   MOE = ±5%p → n = 385
#   MOE = ±3%p → n = 1,068
#   MOE = ±2%p → n = 2,401
#   MOE = ±1%p → n = 9,604
#   MOE = ±0.5%p → n = 38,415
```

오차한계를 절반으로 줄이면 필요 표본 크기는 4배가 된다. 이 비선형 관계를 이해하면 "표본을 더 모으자"는 요구에 현실적인 비용을 제시할 수 있다.

---

## Python 실습: 편향된 표본 vs 무작위 표본

이론으로 배운 내용을 시뮬레이션으로 확인하자. 모집단에서 편향된 추출과 무작위 추출을 반복하고, 추정 결과가 어떻게 달라지는지 시각화한다.

```python
import numpy as np
import matplotlib.pyplot as plt
import matplotlib

matplotlib.use('Agg')
plt.rcParams['font.size'] = 11

np.random.seed(42)

# --- 모집단 생성 ---
# 연봉 분포: 로그정규분포 (오른쪽 꼬리가 긴 현실적 분포)
N = 100_000
population = np.random.lognormal(mean=8.0, sigma=0.6, size=N)
pop_mean = np.mean(population)

# --- 시뮬레이션: 1,000번 반복 ---
n_sim = 1000
n_sample = 200

means_srs = []      # 단순 무작위 추출
means_biased = []   # 편향된 추출 (상위 50%에서만 추출)

median_pop = np.median(population)

for _ in range(n_sim):
    # 무작위 추출
    idx_srs = np.random.choice(N, size=n_sample, replace=False)
    means_srs.append(np.mean(population[idx_srs]))

    # 편향된 추출: 중앙값 이상인 사람에서만 추출 (부유층 편향)
    upper_half = population[population >= median_pop]
    idx_biased = np.random.choice(len(upper_half), size=n_sample, replace=False)
    means_biased.append(np.mean(upper_half[idx_biased]))

means_srs = np.array(means_srs)
means_biased = np.array(means_biased)

# --- 시각화 ---
fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 왼쪽: 표본 평균의 분포
axes[0].hist(means_srs, bins=40, alpha=0.7, color='#3182f6', label='Random Sample', density=True)
axes[0].hist(means_biased, bins=40, alpha=0.7, color='#e53e3e', label='Biased Sample', density=True)
axes[0].axvline(pop_mean, color='black', linewidth=2, linestyle='--', label=f'Pop. Mean = {pop_mean:.0f}')
axes[0].set_xlabel('Sample Mean')
axes[0].set_ylabel('Density')
axes[0].set_title('Distribution of Sample Means (n=200, 1000 simulations)')
axes[0].legend(fontsize=9)

# 오른쪽: 추정 오차 비교
errors_srs = means_srs - pop_mean
errors_biased = means_biased - pop_mean

bp = axes[1].boxplot([errors_srs, errors_biased],
                     tick_labels=['Random', 'Biased'],
                     patch_artist=True)
bp['boxes'][0].set_facecolor('#3182f6')
bp['boxes'][0].set_alpha(0.5)
bp['boxes'][1].set_facecolor('#e53e3e')
bp['boxes'][1].set_alpha(0.5)
axes[1].axhline(0, color='black', linewidth=1, linestyle='--')
axes[1].set_ylabel('Estimation Error')
axes[1].set_title('Estimation Error: Random vs Biased')

plt.tight_layout()
plt.savefig('/Users/dony/projects/donmain/contents/stats/sampling-and-bias/thumbnail.png',
            dpi=150, bbox_inches='tight')
plt.close('all')

# --- 수치 비교 ---
print(f"모집단 평균: {pop_mean:.0f}")
print(f"\n무작위 추출:")
print(f"  표본 평균의 평균: {np.mean(means_srs):.0f}")
print(f"  편향(Bias): {np.mean(means_srs) - pop_mean:.1f}")
print(f"  표준오차(SE): {np.std(means_srs, ddof=1):.1f}")
print(f"\n편향된 추출 (상위 50%에서만):")
print(f"  표본 평균의 평균: {np.mean(means_biased):.0f}")
print(f"  편향(Bias): {np.mean(means_biased) - pop_mean:.1f}")
print(f"  표준오차(SE): {np.std(means_biased, ddof=1):.1f}")
# 모집단 평균: 3572
#
# 무작위 추출:
#   표본 평균의 평균: 3575
#   편향(Bias): 3.5
#   표준오차(SE): 166.9
#
# 편향된 추출 (상위 50%에서만):
#   표본 평균의 평균: 5188
#   편향(Bias): 1616.4
#   표준오차(SE): 160.5
```

결과를 보면 무작위 추출의 편향은 거의 0인 반면, 상위 50%에서만 추출한 경우 편향이 약 1,600이나 된다. 표본 크기를 200에서 2,000으로 늘려도 이 편향은 줄어들지 않는다. 편향은 표본 크기의 문제가 아니라 추출 방법의 문제이기 때문이다.

이것이 1936년 *Literary Digest*의 실수와 정확히 같은 구조다. 표준오차(정밀도)는 표본을 늘리면 줄어들지만, 편향(정확도)은 추출 방법 자체를 고치지 않는 한 사라지지 않는다.

---

## 실무 체크리스트: 표본 설계 시 반드시 확인할 것

표본 기반 분석을 시작하기 전에 다음 항목을 점검하라.

- **표본 프레임(Sampling Frame)은 모집단을 완전히 커버하는가?** 전화번호부는 전화 없는 사람을 놓치고, 이메일 목록은 이메일을 안 쓰는 사람을 놓친다.
- **무응답(Non-response)은 무작위인가?** 바쁜 사람, 불만 있는 사람, 특정 집단이 체계적으로 응답을 거부하면 편향이 생긴다.
- **생존자 편향이 숨어 있지 않은가?** "현재 데이터에 없는 것"이 무엇인지 반드시 질문하라.
- **표본 크기는 원하는 정밀도를 달성하기에 충분한가?** 위에서 다룬 공식으로 사전에 계산하라.
- **측정 도구에 응답 편향이 있지 않은가?** 설문 문항의 유도성, 사회적 바람직성(Social Desirability) 효과를 점검하라.

:::info

**부트스트랩과의 연결**

[부트스트랩](/stats/bootstrap/)은 이미 확보한 표본에서 복원 추출을 반복하여 통계량의 분포를 근사하는 기법이다. 부트스트랩이 유효하려면 원본 표본이 모집단을 잘 대표해야 한다는 전제가 필요하다. 편향된 표본에 부트스트랩을 적용하면, 편향이 "증폭"되지는 않지만 "교정"되지도 않는다. 쓰레기가 들어가면 쓰레기가 나온다(Garbage In, Garbage Out).

:::

---

## 마치며

이 글에서 다룬 핵심을 정리하면 세 가지다.

1. **표본의 대표성이 크기보다 중요하다.** 편향된 240만 명보다 무작위 5만 명이 낫다.
2. **편향은 표본 크기를 늘려도 사라지지 않는다.** 추출 방법 자체를 바꿔야 한다.
3. **데이터에서 "보이지 않는 것"을 의식적으로 찾아야 한다.** 생존자 편향은 가장 교묘하고 가장 흔한 함정이다.

올바른 표본을 확보했다면, 이제 그 표본 위에서 **실험을 설계**할 차례다. [다음 글](/stats/ab-testing/)에서는 인과관계를 검증하기 위한 실험 설계의 핵심, A/B 테스트를 다룬다. 무작위 배정(Randomization)이 왜 편향을 제거하는 가장 강력한 도구인지, 그리고 표본 크기 결정이 실험 설계에서 어떤 역할을 하는지 살펴보겠다.

---

## 참고자료

- Freedman, D., Pisani, R., & Purves, R. (2007). *Statistics* (4th ed.). W.W. Norton. — 표본 추출과 편향에 대한 직관적 설명.
- Mangel, M. & Samaniego, F. J. (1984). Abraham Wald's Work on Aircraft Survivability. *Journal of the American Statistical Association*, 79(386), 259-267.
- Cochran, W. G. (1977). *Sampling Techniques* (3rd ed.). Wiley. — 확률적 표본 추출 이론의 고전.
- Bethlehem, J. (2010). Selection Bias in Web Surveys. *International Statistical Review*, 78(2), 161-188.
- Squire, P. (1988). Why the 1936 Literary Digest Poll Failed. *Public Opinion Quarterly*, 52(1), 125-133.
