---
date: '2026-02-21'
title: '부트스트랩(Bootstrap): 분포를 모를 때, 데이터가 스스로 답한다'
category: 'Statistics'
series: 'stats'
seriesOrder: 13
tags: ['부트스트랩', 'Bootstrap', '비모수 추론', '신뢰구간', 'Resampling']
summary: '분포 가정 없이 표본에서 통계량의 분포를 근사하는 부트스트랩의 원리, 신뢰구간 3종 비교, Python 구현과 ML 배깅 연결까지 정리한다.'
thumbnail: './thumbnail.png'
---

t-검정, 카이제곱 검정, ANOVA 같은 고전적 검정에는 공통 전제가 하나 있다. **검정통계량의 분포를 이론적으로 알고 있어야 한다**는 것이다. 표본 평균은 정규분포, 분산비는 F분포, 빈도 차이는 카이제곱분포를 따른다는 가정 위에서 p-value가 계산된다. 그런데 중앙값의 표준오차는 어떻게 구하는가. 두 상관계수 차이의 신뢰구간은. 이론적 분포를 유도하기 어렵거나 아예 불가능한 경우가 수두룩하다.

1979년 Bradley Efron은 놀랍도록 단순한 답을 내놓았다. **표본 자체를 모집단처럼 취급하고, 거기서 반복 추출하면 통계량의 분포를 근사할 수 있다.** 이것이 **부트스트랩**(Bootstrap)이다.

## 부트스트랩의 핵심 아이디어

추정량 $\hat{\theta}$는 확률변수다. 같은 모집단에서 표본을 반복 추출하면 매번 다른 $\hat{\theta}$ 값이 나온다. 이 **추정량의 분포**(Sampling Distribution)를 알면 신뢰구간도 가설검정도 가능하다. 문제는 모집단에서 반복 추출하는 일이 현실에서는 불가능하다는 것이다. 표본은 하나뿐이다.

### 플러그인 원리

부트스트랩의 핵심은 **플러그인 원리**(Plug-in Principle)다.

> 모집단 분포 $F$를 모르니까, 관측된 표본에서 만든 **경험적 분포 함수(Empirical Distribution Function, EDF)** $\hat{F}_n$으로 대체한다.

경험적 분포 함수란 $n$개의 관측값 $x_1, \ldots, x_n$ 각각에 $1/n$의 확률을 부여하는 이산 분포다.

$$\hat{F}_n(x) = \frac{1}{n} \sum_{i=1}^{n} \mathbf{1}(X_i \le x)$$

이 분포에서 크기 $n$의 표본을 **복원 추출**(Sampling with Replacement)하는 것이 부트스트랩의 핵심 연산이다. 비복원으로 $n$개를 뽑으면 원래 표본과 똑같은 집합이 되어 버린다. 복원 추출이어야 매번 다른 구성의 표본이 만들어지고, 그로부터 통계량의 변동성을 추정할 수 있다. 평균적으로 한 번의 부트스트랩 표본에는 원래 관측값의 약 63.2%만 포함된다($1 - (1 - 1/n)^n \approx 1 - e^{-1}$).

### 부트스트랩의 논리 구조

| 이상적 세계 | 부트스트랩 세계 |
|---|---|
| 모집단 분포 $F$ | 경험적 분포 $\hat{F}_n$ |
| 모집단에서 크기 $n$ 표본 추출 | $\hat{F}_n$에서 크기 $n$ 복원 추출 |
| 통계량 $\hat{\theta}$의 표집 분포 | 부트스트랩 통계량 $\hat{\theta}^*$의 분포 |
| 표준오차 $\text{SE}(\hat{\theta})$ | 부트스트랩 표준오차 $\text{SE}_{boot}$ |

이 유추를 정당화하는 것이 **Glivenko-Cantelli 정리**다. 표본이 커지면 $\sup_x |\hat{F}_n(x) - F(x)| \to 0$ (거의 확실히)이므로, 경험적 분포는 평균 수준이 아니라 분포 전체의 형태에서 $F$에 수렴한다. 따라서 $\hat{F}_n$에서 계산한 통계량의 분포도 $F$에서 계산한 분포에 수렴한다.

중심극한정리는 표본 평균(또는 합)의 분포가 정규분포에 수렴한다고 말한다. 부트스트랩은 이보다 일반적이다. 어떤 통계량에든 적용할 수 있고, 정규 근사를 거치지 않고 분포를 직접 근사한다. CLT가 잘 듣는 상황에서는 둘의 결과가 거의 일치하며, 부트스트랩의 진가는 중앙값·분위수·상관계수처럼 CLT를 적용하기 어려운 통계량에서 드러난다.

## 부트스트랩 알고리즘

### Python 직접 구현

통계량이 중앙값인 경우를 구현해 보겠다. 중앙값은 이론적 표준오차 공식이 복잡한 대표적인 통계량이다.

```python
import numpy as np

np.random.seed(42)

# 비대칭 분포에서 표본 생성 (지수분포: 오른쪽 꼬리)
data = np.random.exponential(scale=2.0, size=50)
observed_median = np.median(data)
print(f"관측된 중앙값: {observed_median:.4f}")

# 부트스트랩
B = 10_000
n = len(data)
boot_medians = np.empty(B)

for b in range(B):
    boot_sample = np.random.choice(data, size=n, replace=True)
    boot_medians[b] = np.median(boot_sample)

boot_se = np.std(boot_medians, ddof=1)
print(f"부트스트랩 표준오차: {boot_se:.4f}")

boot_bias = np.mean(boot_medians) - observed_median
print(f"부트스트랩 편향 추정: {boot_bias:.4f}")
```

```
관측된 중앙값: 1.1456
부트스트랩 표준오차: 0.2727
부트스트랩 편향 추정: -0.0303
```

`np.random.choice`에 `replace=True`만 지정하면 복원 추출이 된다. 복원 추출과 통계량 계산, 이 두 줄이 부트스트랩의 전부다. 이렇게 얻은 분포에서 표준오차, 신뢰구간, 편향을 계산한다.

### B는 얼마로 해야 할까?

| 목적 | 권장 $B$ |
|---|---|
| 표준오차 추정 | 1,000 이상 |
| 신뢰구간 (백분위법) | 5,000 이상 |
| BCa 신뢰구간 | 10,000 이상 |
| 정밀한 p-value | 10,000~100,000 |

$B$를 늘리면 부트스트랩 분포의 추정이 정밀해지지만, 정확도는 궁극적으로 원본 표본 크기 $n$에 의해 제한된다.

## 부트스트랩 신뢰구간 3종 비교

### 1. 백분위 방법 (Percentile Method)

가장 직관적인 방법이다. 부트스트랩 분포의 양쪽 $\alpha/2$ 분위수를 그대로 신뢰구간 경계로 사용한다.

$$CI_{1-\alpha} = \left[ \hat{\theta}^*_{\alpha/2}, \quad \hat{\theta}^*_{1-\alpha/2} \right]$$

```python
alpha = 0.05
ci_percentile = np.percentile(boot_medians, [100 * alpha/2, 100 * (1 - alpha/2)])
print(f"백분위 95% CI: [{ci_percentile[0]:.4f}, {ci_percentile[1]:.4f}]")
# 백분위 95% CI: [0.6910, 1.6317]
```

### 2. 기본 방법 (Basic/Pivotal Method)

피벗(pivot) 아이디어에 기반한다. 부트스트랩에서 얻은 $\hat{\theta}^* - \hat{\theta}$의 분포로 $\hat{\theta} - \theta$의 분포를 근사한다. 방향을 뒤집어 $\theta$에 대해 풀면 다음 구간이 나온다.

$$CI_{1-\alpha} = \left[ 2\hat{\theta} - \hat{\theta}^*_{1-\alpha/2}, \quad 2\hat{\theta} - \hat{\theta}^*_{\alpha/2} \right]$$

```python
ci_basic = [
    2 * observed_median - np.percentile(boot_medians, 100 * (1 - alpha/2)),
    2 * observed_median - np.percentile(boot_medians, 100 * alpha/2)
]
print(f"기본(피벗) 95% CI: [{ci_basic[0]:.4f}, {ci_basic[1]:.4f}]")
# 기본(피벗) 95% CI: [0.6596, 1.6002]
```

기본 방법이 백분위 방법보다 이론적으로 우수한 것은 아니다. 둘 다 1차 정확도라 서열이 없다. 다만 기본 방법에는 뚜렷한 약점이 하나 있다. 부트스트랩 분포를 $\hat{\theta}$ 기준으로 뒤집기 때문에, 부트스트랩 분포의 중심이 $\hat{\theta}$에서 밀려 있으면 그 어긋남이 구간 중심에 반대 부호로 실린다.

$n = 50$, $B = 1500$으로 1500번 반복해 실제 피복률을 재면 갈림이 분명하다.

| 통계량 | 부트스트랩 분포의 왜도 | 백분위 | 기본 |
|---|---|---|---|
| 정규 표본의 중앙값 | −0.02 | 94.0% | 86.2% |
| 지수 표본의 중앙값 | +0.43 | 95.2% | 85.1% |
| 정규 표본의 평균 | +0.00 | 94.0% | 93.9% |
| 로그정규 표본의 평균 | +0.37 | 90.6% | 88.1% |

갈리는 기준은 분포의 비대칭이 아니다. 대칭인 정규 표본의 중앙값에서도 기본 방법은 86%로 떨어지고, 왜도가 가장 큰 로그정규 평균에서는 두 방법의 차이가 2.5%p뿐이다. 기준은 통계량 쪽에 있다. 평균은 부트스트랩 분포가 $\hat{\theta}$에 거의 정확히 중심을 잡지만(중심 어긋남 0.03 표준오차), 중앙값은 0.20 표준오차만큼 밀린다. 재표본에서 값이 띄엄띄엄 튀는 분위수 계열 통계량이 여기에 해당한다.

### 3. BCa 방법 (Bias-Corrected and Accelerated)

가장 정교한 방법이다. 편향 보정(bias correction)과 가속(acceleration) 두 가지를 도입해 백분위 방법의 한계를 극복한다.

- **편향 보정 상수** $\hat{z}_0$: 부트스트랩 분포의 중심이 원래 추정값에서 얼마나 벗어나 있는지 측정
- **가속 상수** $\hat{a}$: 표준오차가 모수값에 따라 변하는 정도를 반영 (jackknife로 추정)

$$\hat{z}_0 = \Phi^{-1}\left(\frac{\#\{\hat{\theta}^*_b < \hat{\theta}\}}{B}\right)$$

$$\hat{a} = \frac{\sum_{i=1}^{n}(\hat{\theta}_{(\cdot)} - \hat{\theta}_{(i)})^3}{6\left[\sum_{i=1}^{n}(\hat{\theta}_{(\cdot)} - \hat{\theta}_{(i)})^2\right]^{3/2}}$$

보정된 분위수 $\alpha_1, \alpha_2$를 계산한 뒤 백분위법을 적용한다.

$$\alpha_1 = \Phi\left(\hat{z}_0 + \frac{\hat{z}_0 + z_{\alpha/2}}{1 - \hat{a}(\hat{z}_0 + z_{\alpha/2})}\right)$$

두 상수를 손으로 계산하려면 jackknife까지 동원해야 해서 코드가 길고 실수하기 쉽다. `scipy.stats.bootstrap`이 `method='BCa'`로 이 계산을 모두 처리해 준다.

### 방법 비교 요약

| 방법 | 장점 | 단점 | 권장 상황 |
|---|---|---|---|
| 백분위 (Percentile) | 구현 간단, 직관적 | 편향이 큰 통계량에서 치우침 | 빠른 탐색적 분석 |
| 기본 (Basic/Pivotal) | 피벗 이론 기반 | 부트스트랩 분포가 $\hat{\theta}$에서 밀리면 커버리지 급락 | 평균처럼 매끄러운 통계량 |
| BCa | 편향·비대칭 보정, 2차 정확도 | 계산 비용 높음, jackknife 필요 | 최종 보고용, 비대칭 통계량 |

BCa를 2차 정확도(second-order accurate)라 부른다. 정규 근사 신뢰구간의 커버리지 오차가 $O(n^{-1/2})$인 반면 BCa는 $O(n^{-1})$로 줄어들어, 같은 표본 크기에서 실제 커버리지가 명목 수준에 더 가깝다.

## 부트스트랩 검정

부트스트랩은 신뢰구간뿐 아니라 가설검정에도 쓸 수 있다. 핵심은 **귀무가설 하에서 검정통계량의 분포를 부트스트랩으로 근사**하는 것이다. "모집단 중앙값이 1.5인가"를 검정해 보자.

```python
# H0: 모집단 중앙값 = 1.5 (theta_0)
theta_0 = 1.5
observed_stat = observed_median - theta_0

# 귀무가설 하에서의 부트스트랩: 데이터를 theta_0 중심으로 이동
data_shifted = data - observed_median + theta_0

B = 10_000
boot_stats = np.empty(B)
for b in range(B):
    boot_sample = np.random.choice(data_shifted, size=n, replace=True)
    boot_stats[b] = np.median(boot_sample) - theta_0

p_value = np.mean(np.abs(boot_stats) >= np.abs(observed_stat))
print(f"부트스트랩 p-value: {p_value:.4f}")
# 부트스트랩 p-value: 0.2258
```

p-value가 크므로 귀무가설을 기각하지 못한다. 관측된 중앙값 1.1456은 1.5와 유의미하게 다르지 않다.

두 그룹 비교에서는 **순열 검정**(Permutation Test)이 더 자주 쓰인다.

| | 부트스트랩 검정 | 순열 검정 |
|---|---|---|
| 재표본 방식 | 복원 추출 | 라벨 섞기 (비복원) |
| 귀무가설 | 유연하게 설정 가능 | "두 그룹의 분포가 동일" |
| 주 용도 | 신뢰구간 + 검정 | 두 그룹 비교 검정 |
| 정확 검정 | 근사적 | 정확(exact, $n$이 작을 때) |

## Python 실습: scipy.stats.bootstrap

직접 구현도 좋지만, SciPy 1.9+에는 `scipy.stats.bootstrap`이 내장되어 있다. BCa까지 지원하므로 실무에서는 이것을 쓰는 편이 안전하다.

```python
from scipy.stats import bootstrap

np.random.seed(42)
data = np.random.exponential(scale=2.0, size=50)

# scipy.stats.bootstrap은 데이터를 튜플로 감싸야 한다
result = bootstrap(
    data=(data,),
    statistic=np.median,
    n_resamples=10_000,
    confidence_level=0.95,
    method='BCa',   # 'percentile', 'basic', 'BCa' (기본값은 'BCa')
    random_state=42
)

print(f"BCa 95% CI: [{result.confidence_interval.low:.4f}, "
      f"{result.confidence_interval.high:.4f}]")
print(f"부트스트랩 표준오차: {result.standard_error:.4f}")
```

```
BCa 95% CI: [0.6910, 1.6887]
부트스트랩 표준오차: 0.2756
```

손으로 짜면 jackknife까지 동원해야 하는 BCa를 몇 줄로 얻는다. 앞서 직접 구한 백분위 구간 $[0.6910, 1.6317]$과 비교하면 하한은 같고 상한이 1.6887로 늘어났는데, 편향 보정과 가속이 오른쪽 꼬리를 넓힌 결과다. `method` 파라미터만 바꾸면 세 가지 신뢰구간을 모두 쓸 수 있다.

## 부트스트랩의 한계

:::warning

**부트스트랩이 실패하는 상황**

(1) 극값 통계량(최댓값, 최솟값): 복원 추출에서 원본의 최댓값이 그대로 뽑힐 확률이 약 63.2%라, 부트스트랩 분포가 그 지점에 큰 덩어리를 만든다. 진짜 분포를 근사하지 못한다.

(2) 극소 표본($n < 10$): $\hat{F}_n$이 $F$를 대표하지 못하고, 재표본이 만들어내는 다양성도 제한적이다.

(3) 비정칙 문제: 균일분포 $U(0, \theta)$의 $\theta$ 추정처럼 모수가 분포의 지지집합 경계를 결정하고 수렴 속도가 $\sqrt{n}$이 아닌 경우.

(4) 시계열·공간 데이터: i.i.d. 가정이 깨지므로 표준 부트스트랩은 의존 구조를 파괴한다.

:::

시계열에서 관측값을 무작위로 섞으면 자기상관이 사라진다. **블록 부트스트랩**(Block Bootstrap)은 시계열을 블록으로 나누고 블록 단위로 복원 추출해 국소 의존 구조를 보존한다. 블록을 겹치게 잡는 이동 블록 방식, 블록 길이를 기하분포에서 뽑는 정상 부트스트랩 등의 변형이 있다.

## ML에서의 부트스트랩: 배깅의 기반

부트스트랩은 머신러닝의 **배깅**(Bagging, Bootstrap Aggregating)의 이론적 기반이기도 하다. Leo Breiman(1996)이 제안한 배깅은 훈련 데이터에서 $B$개의 부트스트랩 표본을 만들고, 각각으로 독립적인 모델을 학습한 뒤, 예측을 평균(회귀) 또는 다수결(분류)로 집계한다. 부트스트랩 표본마다 통계량을 계산하는 대신 모델을 학습하는 것만 다르다. **Random Forest**는 여기에 특성 랜덤 선택을 더한 것이다.

같은 재표본 기법이지만 목적은 정반대다. 통계에서 부트스트랩은 **불확실성을 정량화**하려고 쓰고, ML에서는 **분산을 줄이려고** 쓴다.

부트스트랩 표본에 포함되지 않는 약 36.8%의 관측값을 **OOB**(Out-of-Bag)라 한다. 배깅에서는 이것을 검증 데이터로 활용해, 별도의 검증 세트나 교차 검증 없이도 일반화 오차를 추정한다.

## 마치며

부트스트랩은 분포 가정이 불확실하거나 이론적 공식을 유도하기 어려울 때 데이터 자체에서 답을 찾는다. 플러그인 원리라는 단순한 아이디어에 계산 능력을 얹은 결과다.

다만 부트스트랩으로도 넘을 수 없는 선이 하나 남는다. 데이터가 주어졌을 때 모수에 대해 직접 확률적 진술을 할 수 없다는 것이다. "이 모수가 3과 5 사이일 확률이 95%"라는 문장은 빈도주의 신뢰구간이 허용하지 않는 해석이다.

## 함께 보면 좋은 글

- [검정 방법 총정리](/stats/statistical-tests/)
- [신뢰구간](/stats/confidence-intervals/)
- [큰 수의 법칙과 중심극한정리](/stats/lln-and-clt/)
- [베이지안 추론](/stats/bayesian-inference/)

## 참고자료

- Efron, B. (1979). "Bootstrap Methods: Another Look at the Jackknife." *The Annals of Statistics*, 7(1), 1-26.
- Efron, B., & Tibshirani, R. J. (1993). *An Introduction to the Bootstrap*. Chapman & Hall/CRC.
- Davison, A. C., & Hinkley, D. V. (1997). *Bootstrap Methods and their Application*. Cambridge University Press.
- DiCiccio, T. J., & Efron, B. (1996). "Bootstrap Confidence Intervals." *Statistical Science*, 11(3), 189-228.
- SciPy Documentation: [scipy.stats.bootstrap](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html)
