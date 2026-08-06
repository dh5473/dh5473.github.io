---
date: '2026-02-05'
title: '가우시안 밀도부터 Isolation Forest까지, 이상 탐지의 원리'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 36
tags: ['Anomaly Detection', '이상 탐지', 'Gaussian', 'Isolation Forest', 'LOF', 'One-Class SVM', '머신러닝']
summary: '정상 데이터의 분포를 학습해 그 바깥을 이상으로 판정하는 원리. 가우시안 밀도와 임계값 선택, 다변량 가우시안이 잡아내는 상관관계, Isolation Forest와 LOF의 판정 기준을 정리한다.'
thumbnail: './thumbnail.png'
---

서버 로그에서 침입 시도를 잡아내고, 카드 거래에서 사기를 걸러내고, 제조 라인에서 불량품을 찾아낸다. 겉보기에는 전부 "정상인가 아닌가"를 가르는 이진 분류다. 그런데 분류기를 붙여보면 곧 벽에 부딪힌다. 학습시킬 이상 사례가 거의 없다.

이상 탐지(Anomaly Detection)는 방향을 뒤집는다. 이상이 어떻게 생겼는지가 아니라 **정상이 어떻게 생겼는지**를 학습하고, 그 분포에서 확률이 극히 낮은 데이터를 이상으로 판정한다. 정상 데이터는 얼마든지 쌓여 있으니 재료 걱정이 없고, 처음 보는 유형의 이상도 "정상이 아니다"라는 이유만으로 걸린다.

## 분류로 풀 것인가, 이상 탐지로 풀 것인가

둘 중 어느 쪽이 맞는지는 **이상 사례를 얼마나 확보했는지, 그리고 앞으로 나타날 이상이 지금까지 본 것과 비슷할지**로 갈린다.

| | 지도학습 분류 | 이상 탐지 |
|---|---|---|
| 이상 사례 수 | 학습에 충분하다 | 극소수이거나 없다 |
| 이상의 유형 | 알려져 있고 앞으로도 비슷하다 | 미리 알 수 없다 |
| 학습 대상 | 이상의 생김새 | 정상의 생김새 |
| 대표 사례 | 스팸 필터, 정해진 불량 유형 판정 | 신종 사기, 신규 침입 탐지 |

스팸은 라벨이 수백만 건 쌓여 있고 새 스팸도 기존 스팸과 닮았다. 이럴 때는 분류기가 낫다. 반면 신용카드 사기는 사정이 다르다. 널리 쓰이는 공개 카드 거래 데이터셋에서 사기 비율은 0.17% 수준이다. 이 정도 비율이면 분류 모델이 소수 클래스를 학습할 재료가 절대적으로 부족하고, 정확도(accuracy)라는 지표부터 무너진다. "전부 정상"이라고 찍기만 해도 99.8%가 나오기 때문이다.

더 근본적인 갈림길은 "이상의 유형" 쪽에 있다. 분류기는 학습한 사기 패턴만 잡는다. 공격자가 수법을 바꾸는 순간 그 패턴은 학습 데이터에 없는 것이 되고, 모델은 조용히 통과시킨다. 정상의 생김새를 배워두면 수법이 무엇이든 "정상이 아니다"라는 판정은 그대로 나온다.

## 이상의 세 가지 유형

| 유형 | 판정 근거 | 예 |
|---|---|---|
| **Point** | 개별 값 자체가 분포에서 크게 벗어남 | 평균 5만 원 쓰던 카드에서 500만 원 결제 |
| **Contextual** | 값은 정상 범위지만 맥락이 맞지 않음 | 에어컨 전기 사용량 200kWh가 겨울에 찍힘 |
| **Collective** | 개별 값은 정상인데 모인 패턴이 이상함 | 같은 포트로 짧은 시간에 수천 개 패킷이 몰림 |

이 글이 다루는 것은 **Point Anomaly**다. 가장 흔하고, 뒤에 나오는 알고리즘 대부분이 이 유형을 전제로 만들어졌다. 맥락 이상과 집합 이상은 보통 시간·이웃 정보를 특성으로 뽑아낸 뒤 다시 Point 문제로 바꿔서 푼다.

## 가우시안 밀도로 정상을 모델링한다

가장 직관적인 출발점은 정상 데이터가 정규분포를 따른다고 보는 것이다. 특성이 하나면 정상 데이터에서 평균 $\mu$ 와 분산 $\sigma^2$ 를 추정하고, 새 데이터의 확률 밀도를 계산한다.

$$p(x) = \frac{1}{\sqrt{2\pi}\,\sigma}\exp\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)$$

특성이 $n$ 개면 각 특성을 서로 독립인 가우시안으로 보고 밀도를 곱한다.

$$p(x) = \prod_{j=1}^{n} \frac{1}{\sqrt{2\pi}\,\sigma_j}\exp\left(-\frac{(x_j-\mu_j)^2}{2\sigma_j^2}\right)$$

판정 규칙은 한 줄이다. $p(x) < \epsilon$ 이면 이상, 아니면 정상이다. 밀도가 임계값보다 낮다는 말은 그 위치에 정상 데이터가 거의 오지 않는다는 뜻이다. 등고선으로 그리면 $p(x) = \epsilon$ 이 정상 영역의 테두리가 된다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="가우시안 밀도의 등고선 세 개와 임계값 엡실론에 해당하는 바깥 등고선, 그 바깥으로 떨어진 이상점 세 개를 표시한 그림">
<style>
.ad1-title { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.ad1-lab { fill: var(--text-muted, #6d6762); font-size: 15px; }
.ad1-eps { fill: var(--accent, #9d5604); font-size: 15px; font-weight: 700; }
</style>
<text x="200" y="26" text-anchor="middle" class="ad1-title">밀도 등고선과 ε 경계</text>
<ellipse cx="200" cy="165" rx="106" ry="88" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--accent, #9d5604)" stroke-width="2" stroke-dasharray="6 4"/>
<ellipse cx="200" cy="165" rx="72" ry="60" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1"/>
<ellipse cx="200" cy="165" rx="38" ry="32" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1"/>
<text x="200" y="58" text-anchor="middle" class="ad1-eps">p(x) = ε</text>
<line x1="200" y1="64" x2="200" y2="75" stroke="var(--accent, #9d5604)" stroke-width="1.5"/>
<!-- 정상 데이터 -->
<g fill="var(--primary, #0a756c)">
<circle cx="185" cy="150" r="3.5"/><circle cx="210" cy="145" r="3.5"/><circle cx="195" cy="175" r="3.5"/>
<circle cx="225" cy="165" r="3.5"/><circle cx="170" cy="168" r="3.5"/><circle cx="215" cy="185" r="3.5"/>
<circle cx="190" cy="130" r="3.5"/><circle cx="235" cy="150" r="3.5"/><circle cx="160" cy="150" r="3.5"/>
<circle cx="205" cy="205" r="3.5"/><circle cx="245" cy="180" r="3.5"/><circle cx="180" cy="195" r="3.5"/>
<circle cx="225" cy="125" r="3.5"/><circle cx="155" cy="180" r="3.5"/><circle cx="250" cy="145" r="3.5"/>
</g>
<!-- 이상점 -->
<g stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round">
<path d="M 82 89 L 94 101 M 82 101 L 94 89"/>
<path d="M 316 226 L 328 238 M 316 238 L 328 226"/>
<path d="M 294 72 L 306 84 M 294 84 L 306 72"/>
</g>
<!-- 범례 -->
<circle cx="118" cy="274" r="3.5" fill="var(--primary, #0a756c)"/>
<text x="130" y="279" class="ad1-lab">정상</text>
<path d="M 202 268 L 214 280 M 202 280 L 214 268" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<text x="222" y="279" class="ad1-lab">이상</text>
</svg>
</div>

구현은 밀도를 계산하고 임계값과 비교하는 것이 전부다.

```python
import numpy as np

rng = np.random.default_rng(42)
train = rng.normal(loc=50, scale=5, size=1000)      # 정상 데이터만으로 학습
mu, sigma2 = train.mean(), train.var()

def gaussian_pdf(x, mu, sigma2):
    return np.exp(-(x - mu) ** 2 / (2 * sigma2)) / np.sqrt(2 * np.pi * sigma2)

test = np.array([15, 20, 49, 52, 80, 90])
print(gaussian_pdf(test, mu, sigma2) < 1e-4)
```

```text
[ True  True False False  True  True]
```

## 임계값 ε는 검증 세트에서 고른다

$\epsilon$ 은 눈대중으로 정할 값이 아니다. 이 하나가 탐지 결과를 전부 결정한다. $\epsilon$ 이 크면 정상까지 이상으로 찍어 거짓 경보가 늘고, 작으면 진짜 이상을 놓친다.

정석은 **소량의 라벨된 검증 세트**를 따로 두고 거기서 고르는 것이다. 학습과 선택의 재료를 나누는 것이 핵심이다.

1. **학습**: 정상 데이터만으로 $\mu$, $\sigma^2$ 를 추정한다
2. **선택**: 정상과 이상이 섞인 소량의 라벨 데이터에서 $\epsilon$ 후보를 훑어 가장 좋은 값을 고른다
3. **평가**: 손대지 않은 테스트 세트에서 최종 성능을 잰다

2단계에서 무엇을 기준으로 "가장 좋은" 값을 고르느냐가 중요하다. **정확도를 쓰면 안 된다.** 검증 세트도 정상이 압도적으로 많아서, 아무것도 탐지하지 않는 $\epsilon$ 이 정확도 1등을 차지한다. 정밀도(precision)와 재현율(recall), 그리고 둘의 조화평균인 F1을 봐야 한다.

```python
from sklearn.metrics import f1_score

# X_val: 정상과 이상이 섞인 검증 세트, y_val: 이상이면 1
p_val = gaussian_pdf(X_val, mu, sigma2)
best_eps, best_f1 = None, -1

for eps in np.logspace(-12, -2, 200):
    f1 = f1_score(y_val, (p_val < eps).astype(int))   # 1 = 이상
    if f1 > best_f1:
        best_eps, best_f1 = eps, f1
```

후보를 `logspace`로 잡은 데는 이유가 있다. 밀도는 평균에서 조금만 멀어져도 자릿수 단위로 떨어진다. 선형 등간격으로 훑으면 후보 200개가 전부 큰 값 쪽에 몰려서, 정작 이상을 갈라내는 $10^{-8}$ 언저리는 한 번도 시험해보지 못한다. 자릿수마다 후보를 고르게 놓아야 한다.

:::warning

**비지도라면서 왜 라벨이 필요한가**

학습 단계는 비지도가 맞다. 정상 데이터만 넣고 파라미터를 추정한다. 라벨은 임계값을 고를 때만 쓰이고, 그것도 수십 건이면 충분하다.

라벨이 하나도 없으면 밀도 하위 1%를 잘라내거나, 3-시그마 규칙(정규분포에서 평균 ±3 표준편차 밖은 약 0.27%)을 쓴다. 다만 이건 이상 비율을 미리 정해놓고 그만큼 잘라내는 것이지 탐지 성능을 최적화한 값이 아니다.

:::

## 독립 가우시안이 놓치는 것

특성마다 가우시안을 따로 세워 곱하는 방식에는 구멍이 있다. 각 특성을 혼자 보면 전부 정상 범위인데 **조합이 이상한** 경우를 통과시킨다.

서버 모니터링을 예로 들어보자. CPU 사용률 80%는 정상 범위다. 네트워크 트래픽이 낮은 것도 정상 범위다. 그런데 CPU가 80%인데 트래픽이 바닥이라면 이상하다. 보통 CPU가 치솟으면 트래픽도 같이 오른다. 이 "보통 같이 오른다"가 특성 간 상관관계이고, 독립을 가정한 곱은 그것을 표현할 방법이 없다.

**다변량 가우시안(Multivariate Gaussian)** 은 공분산 행렬 $\Sigma$ 로 상관관계를 통째로 모델링한다.

$$p(x) = \frac{1}{(2\pi)^{n/2}|\Sigma|^{1/2}}\exp\left(-\frac{1}{2}(x-\mu)^{\top}\Sigma^{-1}(x-\mu)\right)$$

지수 안의 $(x-\mu)^{\top}\Sigma^{-1}(x-\mu)$ 는 **마할라노비스 거리(Mahalanobis Distance)** 의 제곱이다.

$$d_M(x) = \sqrt{(x-\mu)^{\top}\Sigma^{-1}(x-\mu)}$$

유클리드 거리는 모든 방향을 똑같이 취급한다. 마할라노비스 거리는 $\Sigma^{-1}$ 을 끼워 넣어 데이터가 퍼진 방향으로는 관대하게, 퍼지지 않은 방향으로는 엄격하게 잰다. 등고선으로 보면 축에 정렬된 타원이 데이터의 기울기를 따라 기울어진다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 545" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 데이터에 독립 가우시안과 다변량 가우시안을 적용한 비교. 위쪽은 축에 정렬된 타원이라 상관관계를 어기는 점을 놓치고, 아래쪽은 기울어진 타원이라 같은 점을 이상으로 잡아낸다">
<style>
.ad2-title { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.ad2-miss { fill: var(--text-danger, #cb2121); font-size: 15px; font-weight: 700; }
.ad2-hit { fill: var(--text-success, #107836); font-size: 15px; font-weight: 700; }
.ad2-lab { fill: var(--text-muted, #6d6762); font-size: 15px; }
</style>
<!-- 위 패널: 독립 가우시안 -->
<text x="200" y="46" text-anchor="middle" class="ad2-title">독립 가우시안 (대각 공분산)</text>
<ellipse cx="200" cy="170" rx="85" ry="78" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--accent, #9d5604)" stroke-width="2" stroke-dasharray="6 4"/>
<g fill="var(--primary, #0a756c)">
<circle cx="140" cy="220" r="3.5"/><circle cx="155" cy="205" r="3.5"/><circle cx="160" cy="195" r="3.5"/>
<circle cx="170" cy="200" r="3.5"/><circle cx="175" cy="185" r="3.5"/><circle cx="185" cy="180" r="3.5"/>
<circle cx="190" cy="170" r="3.5"/><circle cx="195" cy="175" r="3.5"/><circle cx="200" cy="165" r="3.5"/>
<circle cx="205" cy="155" r="3.5"/><circle cx="210" cy="160" r="3.5"/><circle cx="220" cy="150" r="3.5"/>
<circle cx="225" cy="140" r="3.5"/><circle cx="235" cy="145" r="3.5"/><circle cx="240" cy="130" r="3.5"/>
<circle cx="250" cy="135" r="3.5"/><circle cx="255" cy="120" r="3.5"/><circle cx="165" cy="210" r="3.5"/>
<circle cx="230" cy="155" r="3.5"/><circle cx="215" cy="145" r="3.5"/>
</g>
<path d="M 236 199 L 250 213 M 236 213 L 250 199" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<path d="M 251 213 L 297 246" stroke="var(--text-muted, #6d6762)" stroke-width="1.2"/>
<text x="302" y="252" class="ad2-miss">놓침</text>
<line x1="40" y1="282" x2="360" y2="282" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널: 다변량 가우시안 -->
<text x="200" y="308" text-anchor="middle" class="ad2-title">다변량 가우시안 (전체 공분산)</text>
<ellipse cx="200" cy="430" rx="95" ry="32" transform="rotate(-42 200 430)" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--accent, #9d5604)" stroke-width="2" stroke-dasharray="6 4"/>
<g fill="var(--primary, #0a756c)">
<circle cx="140" cy="480" r="3.5"/><circle cx="155" cy="465" r="3.5"/><circle cx="160" cy="455" r="3.5"/>
<circle cx="170" cy="460" r="3.5"/><circle cx="175" cy="445" r="3.5"/><circle cx="185" cy="440" r="3.5"/>
<circle cx="190" cy="430" r="3.5"/><circle cx="195" cy="435" r="3.5"/><circle cx="200" cy="425" r="3.5"/>
<circle cx="205" cy="415" r="3.5"/><circle cx="210" cy="420" r="3.5"/><circle cx="220" cy="410" r="3.5"/>
<circle cx="225" cy="400" r="3.5"/><circle cx="235" cy="405" r="3.5"/><circle cx="240" cy="390" r="3.5"/>
<circle cx="250" cy="395" r="3.5"/><circle cx="255" cy="380" r="3.5"/><circle cx="165" cy="470" r="3.5"/>
<circle cx="230" cy="415" r="3.5"/><circle cx="215" cy="405" r="3.5"/>
</g>
<path d="M 236 459 L 250 473 M 236 473 L 250 459" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<path d="M 251 473 L 293 499" stroke="var(--text-muted, #6d6762)" stroke-width="1.2"/>
<text x="298" y="505" class="ad2-hit">탐지</text>
<!-- 범례 -->
<circle cx="95" cy="524" r="3.5" fill="var(--primary, #0a756c)"/>
<text x="107" y="529" class="ad2-lab">정상 데이터</text>
<path d="M 219 518 L 231 530 M 219 530 L 231 518" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<text x="239" y="529" class="ad2-lab">이상 데이터</text>
</svg>
</div>

숫자로 확인해보자. 평균이 $(50, 100)$ 이고 $x_1$ 의 분산이 25, $x_2$ 의 분산이 36, 둘의 공분산이 20인 분포에서 두 점을 비교한다. $(55, 108)$ 은 두 특성이 함께 커진 점이고, $(55, 92)$ 는 하나는 커졌는데 다른 하나는 작아진 점이다. 평균에서의 유클리드 거리는 $\sqrt{89} \approx 9.43$ 으로 정확히 같다.

```python
import numpy as np
from scipy.stats import multivariate_normal

mu = np.array([50, 100])
cov_full = np.array([[25, 20],
                     [20, 36]])                  # 상관관계 있음
cov_diag = np.diag(np.diag(cov_full))            # 비대각을 0으로: 독립 가정

pts = np.array([[55, 108], [55, 92]])
print(multivariate_normal.pdf(pts, mean=mu, cov=cov_diag))
print(multivariate_normal.pdf(pts, mean=mu, cov=cov_full))
```

```text
[0.00132285 0.00132285]
[0.00289381 0.00011796]
```

| 점 | 유클리드 거리 | 마할라노비스 거리 | 독립 가우시안 $p(x)$ | 다변량 가우시안 $p(x)$ |
|---|---|---|---|---|
| (55, 108) | 9.43 | 1.34 | 0.001323 | 0.002894 |
| (55, 92) | 9.43 | 2.86 | 0.001323 | 0.000118 |

독립 모델은 두 점에 **완전히 같은 밀도**를 매긴다. 두 점 모두 $x_1$ 의 편차가 5, $x_2$ 의 편차가 절댓값 8이라, 각각을 제곱해서 더하는 순간 부호가 사라지기 때문이다. 어떤 $\epsilon$ 을 고르더라도 두 점은 같이 통과하거나 같이 걸린다. 반면 다변량 모델은 25배 가까운 차이를 낸다. $x_1$ 이 크면 $x_2$ 도 커야 한다는 관계를 $\Sigma$ 가 알고 있으므로, 그 관계를 거스른 $(55, 92)$ 는 훨씬 드문 사건이 된다.

코드에 답이 드러나 있다. 두 모델은 별개의 알고리즘이 아니라 **같은 식에 다른 $\Sigma$ 를 넣은 것**이다. `np.diag`로 비대각 원소를 0으로 만든 순간 다변량 가우시안은 독립 가우시안의 곱과 정확히 같아진다. 독립 가정은 다변량 가우시안의 특수한 경우일 뿐이고, 그 대가로 상관관계를 버린다.

그럼 항상 다변량을 쓰면 되는가 하면 그렇지 않다. $\Sigma$ 는 $n \times n$ 이라 추정할 값이 $n(n+1)/2$ 개로 늘고, 표본 수가 특성 수보다 적으면 $\Sigma$ 가 특이행렬이 되어 역행렬 자체가 없다. 특성이 적고 상관관계가 판정에 중요하면 다변량, 특성이 수백 개면 독립 가정으로 가거나 아래의 다른 방법을 쓴다.

## Isolation Forest

가우시안 모델은 정상 데이터가 정규분포를 따른다는 강한 가정 위에 서 있다. 봉우리가 두 개거나 한쪽으로 길게 늘어진 분포라면 이 가정부터 틀린다. **Isolation Forest**는 분포를 아예 가정하지 않고, "이상치는 수가 적고 값이 다르다"는 성질만 이용한다.

절차는 단순하다. 특성 하나를 무작위로 고르고, 그 특성의 값 범위 안에서 분할 지점을 무작위로 잡는다. 데이터가 한 점만 남을 때까지 이 과정을 반복한다. 이상치는 다른 점들과 떨어져 있으므로 **몇 번 자르지 않아도 혼자 남는다.** 반면 밀집 지역의 정상 데이터는 이웃을 떼어내느라 훨씬 많은 분할을 거쳐야 한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 355" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Isolation Forest에서 무작위 분할로 데이터를 나누는 그림. 떨어져 있는 이상점은 두 번의 분할로 혼자 남고, 밀집한 정상점은 분할을 여러 번 거쳐야 한다">
<style>
.ad3-title { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.ad3-tag { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.ad3-dim { fill: var(--text-muted, #6d6762); font-size: 15px; }
.ad3-lab { fill: var(--text, #1c1917); font-size: 15px; }
.ad3-num { fill: var(--on-fill, #ffffff); font-size: 14px; font-weight: 700; }
</style>
<text x="200" y="26" text-anchor="middle" class="ad3-title">적은 분할로 고립되는 이상점</text>
<rect x="40" y="48" width="320" height="248" rx="4" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<rect x="270" y="48" width="90" height="102" fill="var(--bg-danger, #fef2f2)"/>
<!-- 왼쪽 영역의 반복 분할 -->
<g stroke="var(--text-muted, #6d6762)" stroke-width="1.2" stroke-dasharray="4 4">
<line x1="155" y1="48" x2="155" y2="296"/>
<line x1="40" y1="225" x2="155" y2="225"/>
<line x1="100" y1="225" x2="100" y2="296"/>
<line x1="155" y1="200" x2="270" y2="200"/>
</g>
<text x="212" y="70" text-anchor="middle" class="ad3-dim">여러 번 분할</text>
<!-- 이상점을 고립시킨 두 번의 분할 -->
<line x1="270" y1="48" x2="270" y2="296" stroke="var(--accent, #9d5604)" stroke-width="2"/>
<line x1="270" y1="150" x2="360" y2="150" stroke="var(--accent, #9d5604)" stroke-width="2"/>
<circle cx="270" cy="285" r="10" fill="var(--accent, #9d5604)"/>
<text x="270" y="290" text-anchor="middle" class="ad3-num">1</text>
<circle cx="348" cy="150" r="10" fill="var(--accent, #9d5604)"/>
<text x="348" y="155" text-anchor="middle" class="ad3-num">2</text>
<text x="315" y="76" text-anchor="middle" class="ad3-tag">분할 2회</text>
<path d="M 308 103 L 322 117 M 308 117 L 322 103" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<!-- 정상 데이터 -->
<g fill="var(--primary, #0a756c)">
<circle cx="95" cy="215" r="3.5"/><circle cx="110" cy="240" r="3.5"/><circle cx="125" cy="195" r="3.5"/>
<circle cx="130" cy="255" r="3.5"/><circle cx="145" cy="225" r="3.5"/><circle cx="150" cy="180" r="3.5"/>
<circle cx="160" cy="265" r="3.5"/><circle cx="170" cy="210" r="3.5"/><circle cx="180" cy="240" r="3.5"/>
<circle cx="190" cy="190" r="3.5"/><circle cx="195" cy="270" r="3.5"/><circle cx="205" cy="225" r="3.5"/>
<circle cx="215" cy="255" r="3.5"/><circle cx="225" cy="200" r="3.5"/><circle cx="235" cy="235" r="3.5"/>
<circle cx="120" cy="220" r="3.5"/><circle cx="140" cy="205" r="3.5"/><circle cx="165" cy="235" r="3.5"/>
<circle cx="185" cy="260" r="3.5"/><circle cx="210" cy="185" r="3.5"/><circle cx="305" cy="230" r="3.5"/>
</g>
<!-- 범례 -->
<path d="M 46 310 L 58 322 M 46 322 L 58 310" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round"/>
<text x="66" y="321" class="ad3-lab">이상점 · 짧은 경로</text>
<circle cx="52" cy="339" r="3.5" fill="var(--primary, #0a756c)"/>
<text x="66" y="344" class="ad3-lab">정상점 · 긴 경로</text>
</svg>
</div>

한 트리의 결과는 무작위 분할에 좌우되므로 트리 여러 개를 만들어 평균 경로 길이 $E[h(x)]$ 를 구한다. 이 값을 표본 수 $m$ 에 맞게 정규화한 것이 이상 점수다.

$$s(x) = 2^{-\frac{E[h(x)]}{c(m)}}$$

$c(m)$ 은 $m$ 개짜리 이진 탐색 트리에서 탐색이 실패할 때의 평균 경로 길이로, 데이터가 많아지면 트리가 자연히 깊어지는 효과를 상쇄한다. 경로가 짧을수록 $s$ 는 1에 가까워지고, 그것이 이상이라는 뜻이다.

```python
from sklearn.ensemble import IsolationForest

iso = IsolationForest(n_estimators=100, contamination=0.06, random_state=42)
y_pred = iso.fit_predict(X)          # -1 = 이상, 1 = 정상
scores = iso.decision_function(X)    # 값이 낮을수록 이상
```

`contamination`은 이름만 보면 데이터에 이상이 얼마나 섞였는지 모델에 귀띔해주는 값 같지만, 실제로는 **임계값 그 자체**다. scikit-learn은 학습 데이터의 점수 분포에서 `contamination` 백분위수를 잘라 경계로 삼는다. 즉 `contamination=0.06`을 주면 학습 데이터의 정확히 6%가 이상으로 찍힌다. 실제로 이상이 몇 개든 상관없다.

그래서 "20개 중 19개를 잡았다" 같은 숫자를 성능으로 읽으면 안 된다. 찍힌 개수는 이미 정해져 있고, 진짜 물어야 할 것은 **그 개수 안에 진짜 이상이 들어 있느냐**다. 이상 비율을 모르면 `contamination='auto'`로 두고 `decision_function` 점수를 직접 정렬해서 자를 지점을 고르는 편이 낫다.

## LOF와 One-Class SVM

Isolation Forest가 고립의 난이도를 본다면 **LOF(Local Outlier Factor)** 는 주변 밀도를 본다. 어떤 점의 밀도를 그 점의 $k$-이웃들이 가진 밀도와 비교하는 것이 전부다.

$$\mathrm{LOF}_k(x) = \frac{1}{|N_k(x)|}\sum_{o \in N_k(x)} \frac{\mathrm{lrd}_k(o)}{\mathrm{lrd}_k(x)}$$

$\mathrm{lrd}$ 는 국소 도달 가능 밀도로, 이웃까지의 거리가 가까울수록 커진다. 이웃들이 자기보다 훨씬 빽빽하면 분자가 커져 $\mathrm{LOF} \gg 1$ 이 되고, 이웃과 비슷하면 1 근처가 된다.

LOF의 강점은 이름의 "Local"에 있다. 전체 분포가 아니라 **각 점의 이웃을 기준으로 한 상대 밀도**를 보므로, 밀도가 서로 다른 여러 덩어리가 섞인 데이터에서도 각 덩어리의 기준으로 판정한다. 도심과 교외의 주택 분포를 같이 놓고 보면 교외에서 이웃과 500m 떨어진 집은 정상이지만 도심에서 500m 떨어진 집은 이상이다. 전역 임계값 하나로는 이 구분을 낼 수 없다.

**One-Class SVM**은 경계를 직접 그린다. 커널 공간에서 정상 데이터 전체를 원점으로부터 최대한 멀리 떼어놓는 초평면을 찾고, 그 안쪽이면 정상으로 본다. 커널 트릭 덕에 복잡하게 구부러진 정상 영역도 감쌀 수 있어서, 정상 영역이 타원 하나로는 도저히 표현되지 않을 때 쓸 만하다. 대신 표본이 늘면 학습 비용이 제곱 이상으로 불어나 대규모 데이터에는 버겁다.

```python
from sklearn.neighbors import LocalOutlierFactor
from sklearn.svm import OneClassSVM

lof = LocalOutlierFactor(n_neighbors=20, contamination=0.06)
y_lof = lof.fit_predict(X)                 # 밀도가 다른 덩어리가 섞였을 때
y_svm = OneClassSVM(kernel='rbf', gamma='scale', nu=0.06).fit_predict(X)
```

`n_neighbors`는 밀도를 잴 때 참조할 이웃 수다. 작으면 노이즈 한 점에 휘둘리고, 크면 국소성이라는 장점이 사라진다. One-Class SVM의 `nu`는 학습 데이터 중 경계 바깥으로 나갈 비율의 상한이자 서포트 벡터 비율의 하한으로, `contamination`과 비슷한 자리를 차지한다.

## 무엇을 언제 쓰는가

| 기준 | Gaussian | Isolation Forest | LOF | One-Class SVM |
|---|---|---|---|---|
| 분포 가정 | 정규분포 필요 | 없음 | 없음 | 없음 |
| 판정 근거 | 확률 밀도 | 고립까지의 분할 수 | 이웃 대비 상대 밀도 | 초평면 안팎 |
| 고차원 | 공분산 추정이 무너짐 | 무난함 | 거리가 무의미해짐 | 커널에 따라 다름 |
| 대규모 데이터 | 빠름 | 빠름 | 이웃 탐색이 병목 | 느림 |
| 밀도가 불균일할 때 | 약함 | 보통 | 강함 | 보통 |
| 해석 | 확률값이라 직관적 | 점수만 나옴 | 점수만 나옴 | 어려움 |
| 주요 파라미터 | $\epsilon$ | contamination | n_neighbors | nu |

:::tip

**Isolation Forest부터 시작한다**

분포 가정이 없고, 빠르고, 파라미터가 적다. 여기서 나온 점수를 기준선으로 삼고 다른 방법을 붙여본다. 덩어리마다 밀도가 크게 다르면 LOF, 특성이 몇 개뿐이고 정규분포에 가까우면 확률값을 그대로 쓸 수 있는 가우시안 모델이 낫다.

:::

## 정확도가 아니라 정밀도와 재현율로 평가한다

이상 탐지 데이터는 정상이 99% 이상을 차지한다. 그래서 정확도는 무슨 짓을 해도 높게 나오고, 모델이 나아졌는지 나빠졌는지를 전혀 알려주지 않는다.

| 지표 | 이상 탐지에서의 뜻 | 낮으면 생기는 일 |
|---|---|---|
| **정밀도(Precision)** | 이상이라 경고한 것 중 진짜 이상의 비율 | 거짓 경보가 쌓인다 |
| **재현율(Recall)** | 진짜 이상 중 잡아낸 비율 | 이상이 그냥 통과한다 |

둘은 맞바꾸는 관계다. 재현율 100%를 달성한 사기 탐지 시스템을 생각해보자. 사기를 하나도 놓치지 않았지만 정밀도가 1%라면, 경고 100건 중 99건이 헛것이다. 담당자는 곧 경고를 무시하기 시작하고, 그 안에 섞인 진짜 사기도 함께 묻힌다. 이것이 **경보 피로(alert fatigue)** 이고, 지표상 재현율 100%짜리 시스템이 현장에서 아무 이상도 못 잡는 이유다. 반대로 정밀도 100%에 재현율 10%면 경고는 늘 맞지만 열에 아홉을 놓친다.

어느 쪽으로 기울일지는 도메인이 정한다. 놓치면 안 되는 쪽이면 재현율에 가중치를 준 F2를, 거짓 경보 비용이 크면 정밀도 쪽인 F0.5를 쓴다. 임계값 하나에 매이지 않고 전반적인 성능을 보려면 PR 곡선 아래 면적인 **PR-AUC(Average Precision)** 를 쓴다. ROC-AUC는 음성 클래스가 압도적으로 많을 때 위양성이 늘어도 거짓 양성률이 거의 변하지 않아서 점수가 후하게 나온다. 불균형이 심할수록 PR-AUC 쪽이 정직하다.

```python
from sklearn.metrics import average_precision_score

anomaly_scores = -iso.decision_function(X)   # 높을수록 이상이 되도록 부호를 뒤집는다
print(average_precision_score(y_true, anomaly_scores))
```

## 마치며

이상 탐지의 알고리즘들은 겉보기에 제각각이지만 하는 일은 같다. 정상 데이터가 차지한 영역의 모양을 어떤 방식으로든 정해두고, 새 데이터가 그 바깥에 있는지 묻는다. 가우시안은 그 영역을 타원으로, Isolation Forest는 무작위 분할로 좀처럼 떼어낼 수 없는 안쪽으로, LOF는 이웃만큼 빽빽한 자리로, One-Class SVM은 커널 공간의 초평면 안쪽으로 정의한다. 그래서 데이터를 보고 고를 것은 알고리즘 이름이 아니라 **정상 영역이 어떤 모양인가**다.

앞에서 본 두 함정은 뿌리가 같다. 독립 가우시안이 상관관계를 어긴 점을 통과시킨 것도, `contamination`이 정해준 개수를 탐지 성능으로 착각한 것도, 모델이 실제로 무엇을 계산하는지 확인하지 않아서 생긴다. 다변량 가우시안이 독립 가우시안의 일반형이라는 사실도 `contamination`이 백분위수를 자르는 값이라는 사실도, 식과 구현을 한 번 들여다보면 바로 드러난다.

평가는 마지막까지 발목을 잡는다. 이상 탐지에서 정확도는 거의 항상 99%를 넘어서, 그 숫자를 보고하는 순간 아무것도 말하지 않은 것과 같아진다. 정상을 잘 모델링하는 것이 절반이고, 무엇을 얼마나 놓치고 있는지 정직하게 재는 것이 나머지 절반이다.

## 함께 보면 좋은 글

- [분류 평가 지표](/ml/classification-metrics/) : 정밀도·재현율·PR 곡선의 정의와 임계값 이동
- [SVM](/ml/svm/) : One-Class SVM이 빌려 쓰는 마진과 커널 트릭
- [K-Means 클러스터링](/ml/kmeans-clustering/) : 라벨 없이 데이터의 구조를 찾는 또 다른 방법

## 참고자료

- [Scikit-learn, Novelty and Outlier Detection](https://scikit-learn.org/stable/modules/outlier_detection.html)
- [Liu et al. (2008), Isolation Forest](https://ieeexplore.ieee.org/document/4781136)
- [Breunig et al. (2000), LOF: Identifying Density-Based Local Outliers](https://dl.acm.org/doi/10.1145/342009.335388)
- [Schölkopf et al. (2001), Estimating the Support of a High-Dimensional Distribution](https://direct.mit.edu/neco/article/13/7/1443/6529)
- [Chandola et al. (2009), Anomaly Detection: A Survey](https://dl.acm.org/doi/10.1145/1541880.1541882)
