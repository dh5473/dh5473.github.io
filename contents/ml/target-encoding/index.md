---
date: '2026-02-02'
title: 'Target Encoding을 타겟 누수 없이 쓰는 법'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 33
tags: ['Target Encoding', '타겟 인코딩', 'Mean Encoding', 'Smoothing', 'K-Fold', 'CatBoost Encoding', 'Leave-One-Out', 'WoE', '머신러닝']
summary: '타겟 평균으로 범주를 숫자 하나로 압축하는 Target Encoding의 원리와, 타겟 누수를 막는 Smoothing·K-Fold·CatBoost 순서 통계량을 정리한다.'
thumbnail: './thumbnail.png'
---

카테고리가 열 개쯤이면 One-Hot 인코딩으로 끝난다. 문제는 `city`가 1,200개, `product_id`가 10만 개인 경우다. One-Hot은 카테고리 하나당 컬럼 하나를 만들기 때문에, 이런 변수를 펼치는 순간 세 가지가 동시에 무너진다.

첫째, 컬럼이 카테고리 수만큼 늘어난다. 10만 개 카테고리면 10만 개 컬럼이고, 그중 각 행에서 1인 것은 딱 하나다.

둘째, 컬럼 하나가 참조하는 샘플이 거의 없다. 전체 5만 행에 도시가 1,200개면 도시 하나당 평균 40행이고, 꼬리 쪽 도시는 한두 행뿐이다. 선형 모델은 그 몇 행만 보고 계수를 추정하니 추정치의 분산이 커지고, 그 값이 곧 과적합이 된다.

셋째, 트리 모델에서는 그 컬럼들이 아예 선택되지 않는다. `city_속초` 컬럼이 던질 수 있는 질문은 "속초인가 아닌가" 하나뿐이고, 3행짜리 그룹을 떼어내는 분할의 정보 이득은 다른 피처에 밀린다. 컬럼은 10만 개인데 실제로 쓰이는 건 몇 개 안 되는 상황이 된다.

**Target Encoding**은 방향을 바꾼다. 범주를 차원으로 펼치는 대신, 그 범주가 타겟과 어떤 관계였는지를 숫자 하나로 요약한다. 차원은 늘지 않으면서 범주의 예측력은 남는다. 대신 타겟을 피처에 집어넣는 일이라 누수 위험이 구조적으로 따라붙는다. 이 글의 나머지는 대부분 그 위험을 다루는 이야기다.

## Target Encoding의 원리

각 범주를 그 범주에 속한 샘플들의 **타겟 평균**으로 바꾼다. 이진 분류에서 `city`를 이탈 여부(`churn`)로 인코딩한다면 이렇게 된다.

| city | 샘플 수 | churn 합 | 인코딩 값 |
|---|---|---|---|
| 서울 | 3 | 2 | 0.667 |
| 부산 | 2 | 0 | 0.000 |
| 대구 | 2 | 2 | 1.000 |

회귀 문제라면 타겟의 평균값을, 다중 분류라면 클래스별 확률을 쓴다. 범주가 몇 개든 컬럼은 하나다.

```python
def target_encode_naive(df, col, target):
    means = df.groupby(col)[target].mean()
    return df[col].map(means)
```

세 줄이면 끝나지만 이 구현을 그대로 쓰면 반드시 문제가 생긴다.

## 왜 순진한 구현이 위험한가

타겟 평균으로 만든 피처를 그 타겟을 예측하는 데 다시 쓴다. 모델 입장에서는 정답의 일부가 입력에 섞여 들어온 것이다. 이걸 **타겟 누수(target leakage)** 라고 부른다.

가장 알아보기 쉬운 형태는 희귀 범주에서 나타난다. `city = '속초'`인 샘플이 하나뿐이고 그 샘플의 타겟이 1이라면 속초의 인코딩 값은 정확히 1.0이 된다. 모델은 "속초면 이탈"을 학습한 게 아니라 그 한 행의 정답을 그대로 받아 적은 것이다.

| 범주 | 샘플 수 | 타겟 평균 | 이 값을 믿을 수 있나 |
|---|---|---|---|
| 서울 | 5,000 | 0.32 | 믿을 만하다 |
| 부산 | 2,000 | 0.28 | 믿을 만하다 |
| 속초 | 3 | 1.00 | 우연일 가능성이 크다 |
| 태백 | 1 | 0.00 | 그 행의 정답 그 자체다 |

증상은 훈련 점수와 검증 점수의 괴리로 나타난다. 훈련 점수는 비정상적으로 높은데 검증 점수는 평범하거나 나쁘다. 분산이 큰 모델의 전형적인 모습인데, 여기서는 모델이 복잡해서가 아니라 피처가 정답을 품고 있어서 그렇다.

아래에서 다룰 Smoothing, K-Fold, Leave-One-Out, CatBoost 인코딩은 전부 이 하나의 문제를 공략하는 방법들이다.

## Smoothing으로 사전 확률에 끌어당기기

첫 번째 대응은 범주별 평균을 전체 평균 쪽으로 수축시키는 것이다. 샘플이 적은 범주일수록 더 많이 끌어당긴다.

$$\text{encoded}(c_i) = \frac{n_i \, \bar{y}_i + m \, \bar{y}}{n_i + m}$$

$n_i$는 범주 $i$의 샘플 수, $\bar{y}_i$는 그 범주의 타겟 평균, $\bar{y}$는 전체 타겟 평균, $m$은 수축 강도를 정하는 파라미터다.

식을 읽는 방법은 이렇다. 분모와 분자에 $m$이 들어간 자리를 보면, 이 범주에 **타겟이 전체 평균인 가상의 샘플 $m$개를 미리 넣어둔 것**과 같다. 실제 샘플이 5,000개라면 가상의 100개는 거의 영향이 없어 범주 평균이 그대로 살아남는다. 실제 샘플이 3개라면 가상의 100개가 압도해서 결과가 전체 평균 근처로 끌려간다. 여기서 전체 평균이 사전 확률(prior) 역할을 한다. 데이터가 부족한 범주에는 "아무것도 모를 때의 기본값"을 주고, 데이터가 쌓인 만큼만 그 기본값에서 벗어나게 하는 구조다.

$\bar{y} = 0.32$, $m = 100$일 때 실제로 어떻게 움직이는지 보면 명확하다.

| 범주 | $n_i$ | $\bar{y}_i$ | 인코딩 값 | 해석 |
|---|---|---|---|---|
| 대도시 | 5,000 | 0.32 | 0.320 | 범주 평균 거의 그대로 |
| 중소도시 | 50 | 0.60 | 0.413 | 전체 평균 쪽으로 3분의 2만큼 끌려감 |
| 희귀 도시 | 3 | 1.00 | 0.340 | 사실상 전체 평균 |

$m$이 0이면 수축이 없는 순진한 Target Encoding이고, $m$이 무한히 커지면 모든 범주가 전체 평균 하나로 뭉개진다.

```python
def target_encode_smooth(df, col, target, m=100):
    global_mean = df[target].mean()
    agg = df.groupby(col)[target].agg(['mean', 'count'])
    smooth = (agg['count'] * agg['mean'] + m * global_mean) / (agg['count'] + m)
    return df[col].map(smooth)
```

$m$은 교차 검증으로 정한다. 식이 "가상의 샘플 $m$개"라는 뜻이니, 범주당 평균 샘플 수 근처에서 시작해 위아래로 훑으면 탐색 범위를 잡기 쉽다.

:::warning

**Smoothing은 누수를 막지 못한다**

수축은 희귀 범주가 만드는 극단값을 눌러줄 뿐, 각 샘플이 자기 타겟이 포함된 평균을 보고 있다는 사실 자체는 그대로다. $n_i = 3$인 범주라면 자기 타겟의 지분이 3분의 1이다. Smoothing만 걸어놓고 안심하면 안 된다.

:::

## K-Fold Target Encoding

누수를 정면으로 막는 방법은 **자기 자신이 들어 있지 않은 데이터로 인코딩하는 것**이다. 훈련 데이터를 K개 폴드로 나누고, 각 폴드의 샘플은 나머지 K-1개 폴드의 타겟 통계로만 인코딩한다. 테스트 데이터는 훈련 폴드 전체의 통계로 인코딩한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 330" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="5폴드 격자에서 각 행은 인코딩 대상 폴드, 각 열은 통계를 가져오는 폴드다. 대각선 칸만 제외이고 나머지 칸은 사용이며, 테스트 데이터는 훈련 폴드 전체의 통계를 쓴다">
<text x="200" y="28" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">K-Fold Target Encoding</text>
<text x="228" y="58" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">통계를 가져오는 폴드</text>
<text x="46" y="80" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">인코딩 대상</text>
<text x="116" y="80" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">F1</text>
<text x="172" y="80" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">F2</text>
<text x="228" y="80" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">F3</text>
<text x="284" y="80" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">F4</text>
<text x="340" y="80" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">F5</text>
<!-- 1행 -->
<text x="46" y="110" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">Fold 1</text>
<rect x="88" y="88" width="56" height="34" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<rect x="144" y="88" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="200" y="88" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="256" y="88" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="312" y="88" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<text x="116" y="110" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">제외</text>
<text x="172" y="110" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="228" y="110" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="284" y="110" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="340" y="110" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<!-- 2행 -->
<text x="46" y="144" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">Fold 2</text>
<rect x="88" y="122" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="144" y="122" width="56" height="34" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<rect x="200" y="122" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="256" y="122" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="312" y="122" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<text x="116" y="144" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="172" y="144" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">제외</text>
<text x="228" y="144" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="284" y="144" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="340" y="144" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<!-- 3행 -->
<text x="46" y="178" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">Fold 3</text>
<rect x="88" y="156" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="144" y="156" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="200" y="156" width="56" height="34" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<rect x="256" y="156" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="312" y="156" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<text x="116" y="178" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="172" y="178" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="228" y="178" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">제외</text>
<text x="284" y="178" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="340" y="178" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<!-- 4행 -->
<text x="46" y="212" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">Fold 4</text>
<rect x="88" y="190" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="144" y="190" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="200" y="190" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="256" y="190" width="56" height="34" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<rect x="312" y="190" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<text x="116" y="212" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="172" y="212" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="228" y="212" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="284" y="212" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">제외</text>
<text x="340" y="212" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<!-- 5행 -->
<text x="46" y="246" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">Fold 5</text>
<rect x="88" y="224" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="144" y="224" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="200" y="224" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="256" y="224" width="56" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="312" y="224" width="56" height="34" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<text x="116" y="246" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="172" y="246" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="228" y="246" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="284" y="246" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">사용</text>
<text x="340" y="246" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">제외</text>
<!-- 테스트 -->
<text x="46" y="302" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">테스트</text>
<rect x="88" y="280" width="280" height="34" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<text x="228" y="302" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">훈련 폴드 전체의 통계 사용</text>
</svg>
</div>

대각선이 비어 있다는 것이 전부다. 어떤 샘플도 자기 자신이 포함된 통계를 보지 않으므로, 인코딩 값과 그 행의 타겟 사이에 직접적인 연결이 끊긴다.

```python
import pandas as pd
from sklearn.model_selection import KFold

def target_encode_kfold(df, col, target, n_splits=5, m=100):
    global_mean = df[target].mean()
    encoded = pd.Series(index=df.index, dtype=float)
    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)

    for train_idx, val_idx in kf.split(df):
        agg = df.iloc[train_idx].groupby(col)[target].agg(['mean', 'count'])
        smooth = (agg['count'] * agg['mean'] + m * global_mean) / (agg['count'] + m)
        encoded.iloc[val_idx] = df.iloc[val_idx][col].map(smooth)

    return encoded.fillna(global_mean)
```

`fillna`가 필요한 이유는 어떤 범주가 특정 폴드에만 등장할 수 있기 때문이다. 그 범주는 나머지 폴드에 없으니 매핑에 실패하고, 전체 평균으로 채운다.

K-Fold와 Smoothing은 서로 다른 문제를 막으므로 같이 쓴다. K-Fold가 자기 참조를 끊고, Smoothing이 샘플이 적은 범주의 통계를 눌러준다. 위 구현이 둘을 합친 형태다.

## Leave-One-Out

K-Fold를 극단까지 밀면 폴드 크기가 1이 된다. 각 샘플의 인코딩 값을 자기 자신만 뺀 같은 범주 전체의 평균으로 계산하는 방식이다.

$$\text{encoded}(x_i) = \frac{\sum_{j \neq i} y_j \, \mathbf{1}[x_j = x_i]}{n_i - 1}$$

```python
def loo_encode(df, col, target):
    global_mean = df[target].mean()
    cat_sum = df.groupby(col)[target].transform('sum')
    cat_count = df.groupby(col)[target].transform('count')
    encoded = (cat_sum - df[target]) / (cat_count - 1)
    return encoded.fillna(global_mean)
```

폴드를 나눌 필요가 없어 구현이 간단하다. 그런데 여기에 미묘한 함정이 있다. 분자에서 빼는 값이 자기 타겟이므로, 같은 범주 안에서도 $y_i = 1$인 샘플의 인코딩 값이 $y_i = 0$인 샘플보다 항상 낮게 나온다. 범주별로 정확히 두 개의 값만 존재하고, 둘 중 어느 쪽인지가 곧 타겟이다. 트리 모델은 이 두 값 사이에 분할점 하나만 놓으면 타겟을 그대로 읽어낼 수 있다. 누수를 막으려고 도입한 방식이 다른 경로로 누수를 만드는 셈이라, 실전에서는 K-Fold 쪽이 안전하다.

## CatBoost의 순서 기반 인코딩

CatBoost가 쓰는 방식은 관점이 다르다. 데이터를 랜덤하게 섞은 뒤, 각 샘플을 **자기보다 앞에 놓인 샘플들의 타겟으로만** 인코딩한다.

$$\text{encoded}(x_k) = \frac{\sum_{j<k} y_j \, \mathbf{1}[x_j = x_k] + a \, p}{\sum_{j<k} \mathbf{1}[x_j = x_k] + a}$$

$p$는 전체 타겟 평균(사전 확률), $a$는 Smoothing 계수다. 합산 범위가 $j < k$라는 것이 핵심이고, 자기 자신과 뒤쪽 샘플은 애초에 계산에 들어오지 않는다.

```text
셔플된 순서대로 처리:

샘플 1 (서울, y=1) → p                    앞선 서울 없음
샘플 2 (서울, y=0) → (1 + a·p) / (1 + a)  샘플 1만 참조
샘플 3 (부산, y=1) → p                    앞선 부산 없음
샘플 4 (서울, y=1) → (1 + a·p) / (2 + a)  샘플 1, 2 참조
```

K-Fold와의 차이는 같은 범주에 붙는 값의 다양성이다. K-Fold에서는 한 폴드 안의 같은 범주 샘플이 전부 동일한 값을 받지만, 순서 기반 인코딩에서는 앞에 몇 개가 쌓였느냐에 따라 값이 조금씩 달라진다. 앞쪽 샘플은 사전 확률에 가깝고 뒤로 갈수록 범주 평균에 수렴하니, 정규화 강도가 자연스럽게 조절되는 효과가 생긴다.

한 번의 순열에 의존하는 편향을 줄이기 위해 CatBoost는 부스팅 과정에서 여러 개의 랜덤 순열을 번갈아 사용한다. 라이브러리를 쓴다면 인코딩을 직접 할 필요 없이 범주형 컬럼만 알려주면 된다.

```python
from catboost import CatBoostClassifier

model = CatBoostClassifier(cat_features=['city', 'region', 'product_type'])
model.fit(X_train, y_train)
```

## Weight of Evidence

WoE는 신용평가 쪽에서 오래 써온 방식이다. 각 범주가 긍정 클래스를 얼마나 지지하는지를 로그 오즈비로 나타낸다.

$$\text{WoE}(c_i) = \ln \frac{E_i / E}{N_i / N}$$

$E_i$는 범주 $i$에서 타겟이 1인 샘플 수, $E$는 전체에서 타겟이 1인 샘플 수, $N_i$와 $N$은 타겟이 0인 쪽의 같은 값이다. 즉 "전체 이벤트 중 이 범주의 몫"과 "전체 비이벤트 중 이 범주의 몫"의 비율을 로그로 잰다.

전체가 타겟 1이 300명, 타겟 0이 700명인 데이터에서 계산해보자.

| 범주 | 타겟 1 | 타겟 0 | $E_i/E$ | $N_i/N$ | WoE |
|---|---|---|---|---|---|
| A | 60 | 40 | 0.200 | 0.057 | +1.253 |
| B | 10 | 90 | 0.033 | 0.129 | -1.350 |

부호가 방향이고 절댓값이 강도다. 로지스틱 회귀의 출력이 로그 오즈이므로 WoE로 변환한 피처는 그 척도에 그대로 더해지고, 계수를 해석하기가 쉬워진다. 결측을 별도 범주로 두면 그대로 처리되고, 연속형으로 바뀌면서 극단값도 완화된다. 규제 산업에서 설명 가능성이 요구될 때 여전히 표준으로 쓰이는 이유다.

WoE와 짝을 이루는 지표가 IV(Information Value)로, 변수 전체의 예측력을 한 숫자로 요약한다.

$$\text{IV} = \sum_i \left( \frac{E_i}{E} - \frac{N_i}{N} \right) \text{WoE}(c_i)$$

| IV | 판정 |
|---|---|
| 0.02 미만 | 예측력 없음 |
| 0.02 ~ 0.1 | 약함 |
| 0.1 ~ 0.3 | 중간 |
| 0.3 ~ 0.5 | 강함 |
| 0.5 초과 | 의심 (누수나 과적합 점검) |

:::warning

**WoE는 이진 분류 전용이다**

정의 자체가 이벤트와 비이벤트의 비율에 기반하므로 회귀에는 쓸 수 없고, 다중 분류에서는 클래스마다 One-vs-Rest로 분해해야 한다. 그리고 WoE 역시 타겟으로 만든 피처라 K-Fold나 Pipeline 안에서 계산해야 한다는 점은 Target Encoding과 똑같다.

:::

## James-Stein Encoding

Smoothing의 $m$을 직접 고르는 대신 데이터가 정하게 하는 방법이다. 1961년 William James와 Charles Stein이 낸 결과에서 출발한다. 세 개 이상의 그룹 평균을 동시에 추정할 때, 각 그룹의 표본 평균보다 전체 평균 쪽으로 적당히 수축시킨 값이 평균제곱오차가 더 작다는 정리다.

$$\text{encoded}(c_i) = (1 - B_i)\,\bar{y}_i + B_i\,\bar{y}, \qquad B_i = \frac{\sigma_i^2}{\sigma_i^2 + n_i \tau^2}$$

$\sigma_i^2$는 범주 내부의 분산, $\tau^2$는 범주 평균들 사이의 분산이다. 범주 내부가 시끄럽거나($\sigma_i^2$가 크거나) 샘플이 적으면 $B_i$가 1에 가까워져 전체 평균으로 끌려가고, 범주끼리 확실히 다르면($\tau^2$가 크면) $B_i$가 0에 가까워져 범주 평균이 살아남는다. Smoothing과 하는 일은 같지만 수축 강도가 튜닝 대상이 아니라 추정 대상이다.

```python
def james_stein_encode(df, col, target):
    global_mean = df[target].mean()
    agg = df.groupby(col)[target].agg(['mean', 'count', 'var'])
    between_var = agg['mean'].var()

    B = agg['var'] / (agg['var'] + agg['count'] * between_var + 1e-10)
    return df[col].map((1 - B) * agg['mean'] + B * global_mean)
```

수축 강도를 자동으로 정할 뿐, 자기 타겟을 참조한다는 문제는 그대로 남는다. 이것도 K-Fold 안에서 써야 한다. 뒤에서 볼 sklearn `TargetEncoder`의 `smooth='auto'`가 정확히 이 $B_i$를 쓴다.

## 무엇을 언제 쓰나

| 방식 | 누수 차단 | 카디널리티 | 해석 | 권장 상황 |
|---|---|---|---|---|
| One-Hot | 해당 없음 | 20 미만 | 높음 | 저카디널리티, 선형 모델 |
| Target (순진한 구현) | 없음 | 높음 | 중간 | 쓰지 말 것 |
| Target + Smoothing | 부분적 | 높음 | 중간 | 빠른 프로토타입 |
| K-Fold Target + Smoothing | 높음 | 높음 | 중간 | **실전 기본값** |
| Leave-One-Out | 낮음 | 높음 | 중간 | 권장하지 않음 |
| CatBoost 순서 기반 | 높음 | 높음 | 낮음 | CatBoost를 쓸 때 |
| WoE | 부분적 | 높음 | 높음 | 이진 분류, 규제 산업 |
| James-Stein | 부분적 | 높음 | 낮음 | 튜닝 부담을 줄일 때 |

정리하면 카디널리티가 20 미만이면 One-Hot으로 충분하고, 그 위로 올라가면 K-Fold Target Encoding에 Smoothing을 얹는 조합이 기본이다. CatBoost를 쓸 계획이라면 인코딩하지 말고 범주형 그대로 넘긴다. 금융이나 보험처럼 변수별 근거를 설명해야 하는 도메인이라면 WoE와 IV로 인코딩과 변수 선택을 한 번에 처리한다.

## 라이브러리와 Pipeline

위 방식들을 직접 구현할 필요는 없다. scikit-learn 1.3부터 `TargetEncoder`가 들어왔고, 기본값이 앞에서 조합한 K-Fold + Smoothing 그대로다. `cv=5`로 교차 적합해 인코딩 값을 만들고, `smooth='auto'`가 수축 강도를 데이터에서 추정한다.

여기에 걸려 넘어지기 쉬운 지점이 하나 있다. 교차 적합은 `fit_transform`에서만 일어난다. `fit(X, y).transform(X)`는 전체 타겟으로 만든 통계를 그대로 돌려주므로 두 결과가 다르고, 뒤쪽에는 자기 참조가 살아 있다.

```python
import numpy as np
from sklearn.preprocessing import TargetEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import cross_val_score

rng = np.random.default_rng(0)                              # 범주 300개, 3,000행
cats = np.array([f'c{i}' for i in range(300)])
city = rng.choice(cats, 3000)
rate = {c: rng.uniform(0.15, 0.85) for c in cats}
X = city.reshape(-1, 1)
y = (rng.random(3000) < np.array([rate[c] for c in city])).astype(int)

enc = TargetEncoder(target_type='binary', random_state=0)   # cv=5, smooth='auto'
model = HistGradientBoostingClassifier()

# 파이프라인 안: 폴드마다 검증 폴드를 뺀 데이터로 인코더를 새로 적합한다
pipe = Pipeline([('enc', enc), ('model', model)])
print(round(cross_val_score(pipe, X, y, cv=5, scoring='roc_auc').mean(), 3))

# 파이프라인 밖: 전체 타겟으로 한 번 인코딩해두고 그 결과를 검증한다
print(round(cross_val_score(model, enc.fit(X, y).transform(X), y, cv=5, scoring='roc_auc').mean(), 3))
```

```text
0.655
0.77
```

같은 데이터, 같은 모델인데 AUC가 0.655와 0.77로 갈린다. 뒤쪽이 높은 이유는 모델이 좋아서가 아니라 검증 폴드의 타겟이 인코딩 값에 이미 녹아 있어서다. 배포하면 나오는 숫자는 앞쪽인데, 그 사실은 배포 전까지 드러나지 않는다. 스케일러가 테스트 통계를 보면 점수가 조금 부풀지만, 인코더가 테스트 타겟을 보면 그 컬럼이 정답표가 된다.

WoE, Leave-One-Out, James-Stein은 sklearn에 없다. `category_encoders`가 `ce.WOEEncoder`, `ce.LeaveOneOutEncoder`, `ce.JamesSteinEncoder`로 같은 인터페이스에 맞춰 제공한다.

## 마치며

Target Encoding은 고카디널리티 범주형 변수를 다루는 거의 유일한 실용적 해법이다. 1,200개 도시를 컬럼 하나로 줄이면서도 도시가 가진 예측력은 남긴다. 그런데 그 예측력의 출처가 타겟이라는 점 때문에, 이 방법의 난이도는 인코딩 자체가 아니라 누수 관리에 있다.

이 글에서 본 네 가지 도구는 서로 다른 층위를 담당한다. Smoothing은 샘플이 적은 범주가 만드는 극단값을 사전 확률로 눌러주지만 자기 참조는 그대로 둔다. K-Fold는 자기 참조를 끊지만 희귀 범주의 분산은 건드리지 않는다. 그래서 둘을 같이 쓴다. CatBoost의 순서 기반 인코딩은 두 역할을 한 식 안에서 처리하는 대신 라이브러리에 묶여 있고, WoE는 누수 대책이라기보다 해석 가능성을 얻는 다른 축이다.

무엇을 고르든 마지막 점검은 하나다. 이 인코딩 값을 만들 때 그 행의 타겟이 들어갔는가. 들어갔다면 교차 검증 점수는 이미 믿을 수 없는 숫자다.

다음 글에서는 결측치 처리를 다룬다. 지울지, 채울지, 모델에 맡길지가 결측이 생긴 이유에 따라 완전히 달라진다.

## 함께 보면 좋은 글

- [범주형 데이터 인코딩](/ml/categorical-encoding/) : One-Hot, Label, Ordinal 등 기본 인코딩과 선택 기준
- [교차 검증](/ml/cross-validation/) : K-Fold 인코딩이 빌려온 분할 구조
- [편향-분산 트레이드오프](/ml/bias-variance/) : Smoothing이 줄이려는 분산의 정체

## 참고자료

- [category_encoders documentation](https://contrib.scikit-learn.org/category_encoders/)
- [CatBoost: unbiased boosting with categorical features (Prokhorenkova et al., 2018)](https://arxiv.org/abs/1706.09516)
- [A Preprocessing Scheme for High-Cardinality Categorical Attributes (Micci-Barreca, 2001)](https://dl.acm.org/doi/10.1145/507533.507538)
