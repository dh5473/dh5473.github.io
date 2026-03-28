---
date: '2026-02-23'
title: '기술통계와 EDA(Descriptive Statistics & EDA): 데이터를 모델에 넣기 전에 할 일'
category: 'Statistics'
series: 'stats'
seriesOrder: 15
tags: ['기술통계', 'EDA', 'Descriptive Statistics', '탐색적 데이터 분석', 'pandas']
summary: '평균·분산부터 왜도·첨도, 시각화 도구 선택, 타이타닉 데이터셋 실습까지 — 모델링 이전에 반드시 거쳐야 할 EDA의 체계적 절차를 정리한다.'
thumbnail: './thumbnail.png'
---

14편에 걸쳐 확률의 공리부터 [베이지안 추론](/stats/bayesian-inference/)까지, 통계적 추론의 이론 체계를 쌓아왔다. 이제 도구 상자는 꽤 두둑하다. 그런데 현업에서 데이터 파일을 처음 건네받았을 때, 가장 먼저 하는 일이 MLE를 돌리거나 가설검정을 설계하는 것일까? 아니다. **데이터를 들여다보는 것**이다. 열은 몇 개인지, 결측치는 얼마나 되는지, 분포가 어떤 모양인지 — 이 탐색 과정을 건너뛰고 모델을 세우는 건, 지도를 보지 않고 등산을 시작하는 것과 다름없다.

이 글은 stats-applied 시리즈의 첫 번째 편으로, **기술통계(Descriptive Statistics)**와 **탐색적 데이터 분석(Exploratory Data Analysis, EDA)**의 핵심 도구를 체계적으로 정리한다.

---

## EDA란 무엇인가

### Tukey의 EDA 철학

**탐색적 데이터 분석(EDA)**이라는 용어를 처음 체계화한 사람은 통계학자 John Tukey다. 1977년 저서 *Exploratory Data Analysis*에서 그는 "데이터가 무엇을 말하고 있는지 경청하라"고 강조했다. 가설을 세우고 검증하는 **확인적 분석(Confirmatory Data Analysis, CDA)** — 우리가 [가설검정](/stats/hypothesis-testing/)에서 다뤘던 바로 그것 — 과 대비되는 접근이다.

| 구분 | 확인적 분석(CDA) | 탐색적 분석(EDA) |
|------|----------------|----------------|
| **목적** | 사전 가설의 검증 | 패턴 발견, 가설 생성 |
| **방법** | 통계 검정, 신뢰구간 | 시각화, 기술통계, 요약 |
| **순서** | 가설 → 데이터 수집 → 검정 | 데이터 관찰 → 패턴 발견 → 가설 제안 |
| **비유** | 재판(유죄/무죄 판결) | 수사(단서 수집, 용의자 탐색) |

EDA가 모델링 전에 반드시 필요한 이유는 세 가지다:

1. **데이터 품질 확인** — 결측치, 이상치, 입력 오류를 사전에 파악한다.
2. **가정 검증** — 정규성, 등분산성 등 모델의 전제 조건이 성립하는지 확인한다.
3. **가설 생성** — 예상치 못한 패턴을 발견해 분석 방향을 조정한다.

:::info

**💡 EDA는 "한 번 하고 끝"이 아니다**

모델링 중 잔차(residual)가 이상하게 보이면 다시 EDA로 돌아간다. 특성 공학(feature engineering) 후에도, 새로운 데이터가 추가될 때에도 EDA를 반복한다. 분석의 전 과정에 걸친 순환적 활동이다.

:::

---

## 중심 경향 측도

데이터의 "대표값"을 하나로 요약하는 지표들이다. [확률변수와 기댓값](/stats/random-variables-expectation/)에서 기댓값과 분산을 이론적으로 정의했다면, 여기서는 표본 데이터에 적용하는 관점에서 다시 살펴본다.

### 평균, 중앙값, 최빈값

| 측도 | 정의 | 특징 |
|------|------|------|
| **평균(Mean)** | 모든 값의 합 / 개수 | 모든 데이터를 반영하지만, 이상치에 민감 |
| **중앙값(Median)** | 정렬 후 가운데 값 | 이상치에 강건(robust) |
| **최빈값(Mode)** | 가장 빈도가 높은 값 | 범주형에도 적용 가능, 연속형에서는 잘 안 씀 |

세 측도의 차이가 극명해지는 경우를 보자.

```python
import numpy as np

# 연봉 데이터 (단위: 만원)
salaries = np.array([3000, 3200, 3500, 3800, 4000, 4200, 4500, 5000, 12000, 50000])

mean_val = np.mean(salaries)
median_val = np.median(salaries)
print(f"평균: {mean_val:,.0f}만원")    # 평균: 9,320만원
print(f"중앙값: {median_val:,.0f}만원")  # 중앙값: 4,100만원
```

평균은 9,320만원이지만, 10명 중 8명은 5,000만원 이하를 받는다. 상위 두 명의 극단적 고연봉이 평균을 끌어올린 것이다. 이런 **오른쪽 꼬리가 긴(right-skewed)** 분포에서는 중앙값이 훨씬 대표성 있는 요약값이 된다.

:::warning

**⚠️ "평균 연봉"의 함정**

뉴스에서 "평균 연봉 X천만원"이라는 기사를 볼 때, 그 숫자가 대다수의 경험과 동떨어져 있다면 분포의 비대칭성을 의심해야 한다. 소득·부동산·페이지 뷰 같은 데이터는 거의 항상 오른쪽으로 치우쳐 있어, 중앙값이 더 정직한 대표값이다.

:::

---

## 산포도 측도

중심만으로는 부족하다. "평균이 같은 두 데이터셋"이 전혀 다른 분포를 가질 수 있기 때문이다.

### 분산, 표준편차, IQR

```python
import numpy as np

A = np.array([48, 49, 50, 51, 52])
B = np.array([10, 30, 50, 70, 90])

for name, data in [("A", A), ("B", B)]:
    print(f"[{name}] 평균={np.mean(data):.1f}, "
          f"표준편차={np.std(data, ddof=1):.1f}, "
          f"IQR={np.percentile(data, 75) - np.percentile(data, 25):.1f}")
# [A] 평균=50.0, 표준편차=1.6, IQR=2.0
# [B] 평균=50.0, 표준편차=31.6, IQR=40.0
```

평균은 둘 다 50이지만, 데이터의 퍼짐 정도는 완전히 다르다.

| 측도 | 수식 | 이상치 민감도 |
|------|------|-------------|
| **분산(Variance)** | <strong>$s^2 = \frac{1}{n-1}\sum(x_i - \bar{x})^2$</strong> | 높음 (제곱 때문) |
| **표준편차(Std)** | <strong>$s = \sqrt{s^2}$</strong> | 높음 |
| **IQR** | Q3 − Q1 (75번째 − 25번째 백분위) | 낮음 (중앙 50%만 사용) |
| **범위(Range)** | max − min | 매우 높음 (극값 2개에 의존) |

표준편차는 가장 많이 쓰이지만, 이상치가 있을 때는 IQR이 더 안정적이다. [신뢰구간](/stats/confidence-intervals/)에서 다뤘던 것처럼, 통계량의 강건성(robustness)은 실전에서 늘 고려해야 할 요소다.

---

## 분포의 형태: 왜도와 첨도

평균과 표준편차가 같더라도 분포의 **모양** 자체가 다를 수 있다. 이 모양을 정량화하는 두 가지 지표가 왜도와 첨도다.

### 왜도(Skewness)

분포의 비대칭 정도를 측정한다.

- **왜도 = 0**: 좌우 대칭 ([정규분포](/stats/continuous-distributions/)가 대표적)
- **왜도 > 0**: 오른쪽 꼬리가 김 (소득, 페이지뷰)
- **왜도 < 0**: 왼쪽 꼬리가 김 (시험 점수 — 만점 근처 집중)

### 첨도(Kurtosis)

꼬리의 두꺼운 정도를 측정한다. 정규분포의 첨도를 기준(0)으로 삼는 **초과 첨도(Excess Kurtosis)**를 주로 사용한다.

- **첨도 = 0**: 정규분포와 유사한 꼬리
- **첨도 > 0**: 꼬리가 두꺼움 (극단값이 정규분포보다 자주 발생)
- **첨도 < 0**: 꼬리가 얇음 (극단값이 드뭄)

```python
import numpy as np
from scipy import stats

np.random.seed(42)
normal_data = np.random.normal(50, 10, 10000)
skewed_data = np.random.exponential(10, 10000)

print("=== 정규분포 데이터 ===")
print(f"왜도: {stats.skew(normal_data):.3f}")    # 왜도: ≈ 0.0
print(f"첨도: {stats.kurtosis(normal_data):.3f}")  # 첨도: ≈ 0.0

print("\n=== 지수분포 데이터 (오른쪽 치우침) ===")
print(f"왜도: {stats.skew(skewed_data):.3f}")    # 왜도: ≈ 2.0
print(f"첨도: {stats.kurtosis(skewed_data):.3f}")  # 첨도: ≈ 6.0
```

:::info

**💡 첨도는 "뾰족함"이 아니다**

첨도를 "분포가 뾰족한 정도"로 설명하는 교재가 많지만, 이는 부정확하다. 첨도가 높은 분포는 중심이 뾰족한 것이 아니라 **꼬리가 두꺼운** 것이다. 금융 데이터에서 "fat tail"이라 부르는 현상이 바로 높은 첨도와 연결된다. 정규분포를 가정한 리스크 모델이 극단적 사건을 과소평가하는 이유도 여기에 있다.

:::

---

## 시각화 도구 모음

숫자만으로는 데이터의 전체 모습을 파악하기 어렵다. Anscombe의 quartet — 기술통계량이 거의 동일하지만 시각화하면 완전히 다른 네 데이터셋 — 이 이를 잘 보여준다. 목적에 맞는 시각화 도구를 선택하는 것이 핵심이다.

| 도구 | 용도 | 적합한 상황 |
|------|------|-----------|
| **히스토그램** | 단일 변수의 분포 형태 | 연속형 변수의 전체 분포 파악 |
| **박스플롯** | 중앙값, IQR, 이상치 요약 | 그룹 간 분포 비교, 이상치 탐지 |
| **바이올린 플롯** | 박스플롯 + 밀도 추정 | 분포의 세부 형태까지 비교 |
| **산점도** | 두 변수 간 관계 | 상관관계, 군집, 비선형 패턴 |
| **상관 히트맵** | 다변량 상관 행렬 | 변수 간 관계의 전체 조망 |

```python
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

np.random.seed(42)

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

# 1. 히스토그램
data = np.concatenate([np.random.normal(30, 5, 500),
                       np.random.normal(55, 8, 300)])
axes[0].hist(data, bins=30, edgecolor='black', alpha=0.7, color='steelblue')
axes[0].set_title('Histogram: Bimodal Distribution')
axes[0].set_xlabel('Value')
axes[0].set_ylabel('Frequency')

# 2. 박스플롯
groups = {'A': np.random.normal(50, 10, 200),
          'B': np.random.normal(55, 15, 200),
          'C': np.random.normal(45, 8, 200)}
axes[1].boxplot(groups.values(), tick_labels=list(groups.keys()))
axes[1].set_title('Box Plot: Group Comparison')
axes[1].set_ylabel('Value')

# 3. 산점도
x = np.random.normal(0, 1, 200)
y = 2 * x + np.random.normal(0, 0.5, 200)
axes[2].scatter(x, y, alpha=0.5, s=20, color='steelblue')
axes[2].set_title('Scatter Plot: Linear Relationship')
axes[2].set_xlabel('X')
axes[2].set_ylabel('Y')

plt.tight_layout()
plt.savefig('/tmp/eda_viz_demo.png', dpi=100)
plt.close('all')
print("시각화 저장 완료")
```

히스토그램은 분포의 형태를 직관적으로 보여준다. 위 예시처럼 봉우리가 두 개(bimodal)인 분포는 기술통계량만으로는 절대 포착할 수 없다. 박스플롯은 그룹 간 비교에 탁월하며, 상자 밖의 점이 이상치 후보라는 정보를 즉시 제공한다. 산점도는 두 변수 간 관계의 방향과 강도를 한눈에 드러낸다.

---

## Python 실습: 타이타닉 데이터셋 EDA

이론을 실전으로 연결해보자. 가장 널리 쓰이는 학습용 데이터셋 중 하나인 타이타닉을 대상으로 EDA 전 과정을 수행한다.

### 1단계: 데이터 구조 파악

```python
import pandas as pd
import numpy as np
import seaborn as sns

# seaborn 내장 데이터셋
df = sns.load_dataset('titanic')
print(f"행: {df.shape[0]}, 열: {df.shape[1]}")
# 행: 891, 열: 15

print("\n=== 데이터 타입 ===")
print(df.dtypes)
# survived         int64
# pclass           int64
# sex                str
# age            float64
# sibsp            int64
# parch            int64
# fare           float64
# embarked           str
# class         category
# who                str
# adult_male        bool
# deck          category
# embark_town        str
# alive              str
# alone             bool
```

### 2단계: 결측치 확인

```python
import pandas as pd
import seaborn as sns

df = sns.load_dataset('titanic')

missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(1)
missing_df = pd.DataFrame({'결측수': missing, '비율(%)': missing_pct})
print(missing_df[missing_df['결측수'] > 0])
# age          177   19.9
# embarked       2    0.2
# deck         688   77.2
# embark_town    2    0.2
```

`deck`은 77%가 결측이므로 분석에서 제외하는 것이 합리적이고, `age`는 19.9%의 결측을 어떻게 처리할지 전략이 필요하다. `embarked`는 2건뿐이라 최빈값이나 삭제로 처리 가능하다.

### 3단계: 기술통계 요약

```python
import pandas as pd
import seaborn as sns

df = sns.load_dataset('titanic')

print("=== 수치형 변수 기술통계 ===")
print(df[['age', 'fare', 'survived']].describe().round(2))
# age: mean≈29.70, std≈14.53, min=0.42, max=80.00
# fare: mean≈32.20, std≈49.69, min=0.00, max=512.33
# survived: mean≈0.38

print(f"\n생존율: {df['survived'].mean():.1%}")  # 생존율: 38.4%
```

`fare`의 표준편차(49.69)가 평균(32.20)보다 크다는 사실에 주목하라. 이는 극단적으로 비대칭인 분포를 강하게 암시한다. 실제로 대다수는 저렴한 3등석이었고, 소수의 1등석 요금이 평균을 끌어올린 것이다.

### 4단계: 그룹별 비교

```python
import pandas as pd
import seaborn as sns

df = sns.load_dataset('titanic')

print("=== 성별 생존율 ===")
print(df.groupby('sex')['survived'].mean().round(3))
# female    0.742
# male      0.189

print("\n=== 객실 등급별 생존율 ===")
print(df.groupby('pclass')['survived'].mean().round(3))
# 1    0.630
# 2    0.473
# 3    0.242
```

여성의 생존율(74.2%)이 남성(18.9%)보다 압도적으로 높고, 1등석(63.0%)이 3등석(24.2%)보다 두 배 이상 높다. "Women and children first" 원칙과 사회경제적 요인이 생존에 강하게 작용했음을 수치가 보여준다.

### 5단계: 시각화 종합

```python
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

df = sns.load_dataset('titanic')

fig, axes = plt.subplots(2, 2, figsize=(12, 10))

# 1. 나이 분포 (히스토그램)
axes[0, 0].hist(df['age'].dropna(), bins=30, edgecolor='black',
                alpha=0.7, color='steelblue')
axes[0, 0].set_title('Age Distribution')
axes[0, 0].set_xlabel('Age')
axes[0, 0].set_ylabel('Frequency')

# 2. 등급별 요금 (박스플롯)
df.boxplot(column='fare', by='pclass', ax=axes[0, 1])
axes[0, 1].set_title('Fare by Passenger Class')
axes[0, 1].set_xlabel('Pclass')
axes[0, 1].set_ylabel('Fare')
plt.sca(axes[0, 1])
plt.title('Fare by Passenger Class')

# 3. 성별 × 등급별 생존율 (바 차트)
survival = df.groupby(['pclass', 'sex'])['survived'].mean().unstack()
survival.plot(kind='bar', ax=axes[1, 0], rot=0, color=['steelblue', 'coral'])
axes[1, 0].set_title('Survival Rate by Class & Sex')
axes[1, 0].set_xlabel('Pclass')
axes[1, 0].set_ylabel('Survival Rate')
axes[1, 0].legend(title='Sex')

# 4. 상관 히트맵
numeric_cols = df[['survived', 'pclass', 'age', 'sibsp', 'parch', 'fare']].corr()
im = axes[1, 1].imshow(numeric_cols, cmap='RdBu_r', vmin=-1, vmax=1)
axes[1, 1].set_xticks(range(len(numeric_cols.columns)))
axes[1, 1].set_yticks(range(len(numeric_cols.columns)))
axes[1, 1].set_xticklabels(numeric_cols.columns, rotation=45, ha='right')
axes[1, 1].set_yticklabels(numeric_cols.columns)
axes[1, 1].set_title('Correlation Heatmap')
fig.colorbar(im, ax=axes[1, 1], shrink=0.8)

fig.suptitle('Titanic Dataset EDA', fontsize=14, y=1.02)
plt.tight_layout()
plt.savefig('/tmp/titanic_eda.png', dpi=100, bbox_inches='tight')
plt.close('all')
print("타이타닉 EDA 시각화 저장 완료")
```

상관 히트맵에서 `pclass`와 `fare`의 음의 상관(-0.55)이 눈에 띈다. 등급 숫자가 작을수록(1등석) 요금이 높으므로 자연스러운 결과다. `survived`와 `fare`의 양의 상관(0.26)도 "비싼 표를 산 승객일수록 생존 확률이 높았다"는 패턴을 반영한다.

---

## EDA 체크리스트

실무에서 새 데이터셋을 받았을 때 바로 적용할 수 있는 절차를 정리한다.

| 단계 | 확인 항목 | 핵심 함수/도구 |
|------|----------|--------------|
| **1. 구조 파악** | 행/열 수, 데이터 타입, 컬럼명 | `df.shape`, `df.dtypes`, `df.info()` |
| **2. 결측치** | 컬럼별 결측 비율, 결측 패턴(MCAR/MAR/MNAR) | `df.isnull().sum()`, `missingno` 라이브러리 |
| **3. 기술통계** | 평균, 중앙값, 표준편차, 사분위수 | `df.describe()` |
| **4. 분포 확인** | 왜도, 첨도, 히스토그램 | `df.skew()`, `df.kurtosis()`, 히스토그램 |
| **5. 이상치** | IQR 기준 이상치, 도메인 기반 판단 | 박스플롯, Z-score |
| **6. 범주형 변수** | 각 범주의 빈도, 불균형 정도 | `df['col'].value_counts()` |
| **7. 변수 간 관계** | 상관계수, 산점도, 교차표 | `df.corr()`, 산점도 행렬, 히트맵 |
| **8. 시간 변수** | 추세, 계절성, 단위 확인 | 라인 플롯, 롤링 평균 |

:::info

**💡 EDA는 보고서가 아니다**

체크리스트의 모든 항목을 기계적으로 나열하는 것이 EDA의 목적이 아니다. 핵심은 "이 데이터에서 무엇이 이상한가? 무엇이 기대와 다른가?"라는 질문을 끊임없이 던지는 것이다. 체크리스트는 놓치기 쉬운 항목을 환기하는 보조 도구일 뿐이다.

:::

---

## 흔한 실수 세 가지

### 1. 시각화 없이 숫자만 보기

`df.describe()`의 출력만 보고 넘어가는 것은 위험하다. Anscombe의 quartet이 보여주듯, 평균·분산·상관계수가 동일해도 분포의 실제 모습은 완전히 다를 수 있다. **기술통계와 시각화는 항상 쌍으로** 사용해야 한다.

### 2. 이상치를 무조건 제거하기

이상치를 발견하면 반사적으로 삭제하는 경우가 많다. 하지만 이상치는 세 가지로 구분해야 한다:

- **입력 오류** — 나이가 -5세, 키가 300cm → 수정 또는 제거
- **자연적 극단값** — 빌 게이츠의 연봉 → 제거하면 안 됨, 분석 목적에 따라 판단
- **다른 모집단** — 봇 트래픽이 섞인 웹 로그 → 분리하여 별도 분석

무조건 제거하면 정보 손실이 발생하고, 무조건 유지하면 모델이 왜곡된다. **도메인 지식에 기반한 판단**이 필요하다.

### 3. 상관관계를 인과로 해석하기

상관 히트맵에서 두 변수의 상관계수가 높다고 해서 하나가 다른 하나의 원인인 것은 아니다. 아이스크림 판매량과 익사 사고 건수가 양의 상관을 보이지만, 아이스크림이 익사를 유발하는 것이 아니라 **기온**이라는 교란변수(confounding variable)가 둘 다에 영향을 미치는 것이다.

:::warning

**⚠️ "Correlation does not imply causation"**

상관관계에서 인과를 추론하려면 무작위 통제 실험(RCT) 또는 인과 추론(causal inference) 프레임워크가 필요하다. EDA 단계에서 발견한 상관관계는 "추가 조사가 필요한 가설"이지, 결론이 아니다.

:::

---

## 마치며

이 글에서는 기술통계의 핵심 지표(중심 경향, 산포도, 왜도·첨도)와 시각화 도구를 정리하고, 타이타닉 데이터셋으로 EDA의 전 과정을 실습했다. 핵심을 다시 짚으면:

- **중심 경향** — 비대칭 분포에서는 평균보다 중앙값이 대표성 있다.
- **산포도** — 표준편차와 IQR을 함께 보아야 이상치에 속지 않는다.
- **시각화** — 숫자와 그래프는 반드시 쌍으로. 히스토그램·박스플롯·산점도의 용도를 구분하라.
- **절차** — 체크리스트를 활용하되, 기계적 나열이 아니라 "무엇이 이상한가?"를 끊임없이 질문하라.

EDA를 통해 데이터를 충분히 이해했다면, 자연스럽게 다음 질문이 떠오른다: **"이 표본 데이터가 우리가 알고 싶은 모집단을 얼마나 잘 대표하는가?"** 표본 추출 방법에 따라 결과가 완전히 달라질 수 있고, 잘못된 표본은 아무리 정교한 분석도 무의미하게 만든다. [다음 글](/stats/sampling-and-bias/)에서는 표본 추출의 원리와 편향(bias)의 다양한 형태를 다룬다.

---

## 참고자료

- Tukey, J.W. *Exploratory Data Analysis*. Addison-Wesley, 1977. — EDA 개념을 체계화한 고전
- Wickham, H. & Grolemund, G. *R for Data Science* (2nd ed.). O'Reilly, 2023. — EDA 워크플로의 실전적 안내 (R 기반이지만 철학은 동일)
- VanderPlas, J. *Python Data Science Handbook*. O'Reilly, 2016. — pandas + matplotlib EDA 실습
- McKinney, W. *Python for Data Analysis* (3rd ed.). O'Reilly, 2022. — pandas 창시자의 데이터 분석 가이드
- [seaborn documentation](https://seaborn.pydata.org/) — 통계적 시각화의 Python 표준 라이브러리
