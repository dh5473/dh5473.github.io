---
date: '2026-01-18'
title: 'XGBoost와 LightGBM은 실제로 무엇이 다른가'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 18
tags: ['XGBoost', 'LightGBM', 'CatBoost', 'GOSS', 'EFB', 'leaf-wise', 'Gradient Boosting', '부스팅']
summary: '트리를 키우는 순서(level-wise와 leaf-wise), XGBoost의 정규화된 목적 함수와 히스토그램 분할, LightGBM의 GOSS와 EFB, 범주형 처리까지 두 구현체가 갈라지는 지점을 정리한다.'
thumbnail: './thumbnail.png'
---

Gradient Boosting은 트리를 하나씩 순서대로 쌓으면서, 새 트리에게 앞선 모델이 남긴 오차를 맡긴다. 원리는 이게 전부이고 XGBoost도 LightGBM도 여기에 손대지 않았다. 둘이 갈라진 곳은 그 다음이다. 트리 한 그루를 어떤 순서로 키울지, 분할점 후보를 몇 개로 추릴지, 매 라운드에 어떤 행과 열을 볼지를 각자 다르게 정했다.

그래서 "어느 쪽이 더 정확한가"에는 답이 잘 안 나온다. 같은 손실 함수를 같은 방식으로 줄이기 때문에, 튜닝을 제대로 하면 정확도는 대체로 비슷한 자리에 수렴한다. 답이 갈리는 건 데이터가 커질 때의 학습 시간, 작은 데이터에서의 과적합, 범주형 컬럼을 어떻게 넘길지 쪽이다.

## 트리를 키우는 순서

가장 큰 차이는 트리 한 그루를 키우는 순서다. XGBoost는 같은 깊이의 노드를 전부 분할한 다음 아래로 내려가고(level-wise), LightGBM은 지금 존재하는 리프 전체 중에서 이득이 가장 큰 하나만 골라 분할한다(leaf-wise, best-first). 분할 횟수가 같아도 결과로 나오는 트리의 모양이 다르다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 574" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 같은 깊이의 노드를 모두 분할해 균형 잡힌 트리가 되는 level-wise 성장, 아래쪽은 이득이 가장 큰 리프 하나만 골라 분할해 한쪽으로 깊어지는 leaf-wise 성장. 분할 횟수는 양쪽 모두 3회로 같다">
<style>
.xl1-t { fill: var(--text, #1c1917); }
.xl1-m { fill: var(--text-muted, #6d6762); }
.xl1-split { fill: var(--primary, #0a756c); }
.xl1-leaf { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.xl1-num { fill: var(--on-fill, #ffffff); font-weight: 700; }
.xl1-edge { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; }
.xl1-rule { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<!-- 위 패널 -->
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" class="xl1-t">위: level-wise 성장</text>
<text x="200" y="46" text-anchor="middle" font-size="14" class="xl1-m">XGBoost 기본값 (grow_policy=depthwise)</text>
<line x1="200" y1="86" x2="128" y2="138" class="xl1-edge" />
<line x1="200" y1="86" x2="272" y2="138" class="xl1-edge" />
<line x1="128" y1="138" x2="92" y2="190" class="xl1-edge" />
<line x1="128" y1="138" x2="164" y2="190" class="xl1-edge" />
<line x1="272" y1="138" x2="236" y2="190" class="xl1-edge" />
<line x1="272" y1="138" x2="308" y2="190" class="xl1-edge" />
<circle cx="92" cy="190" r="15" class="xl1-leaf" />
<circle cx="164" cy="190" r="15" class="xl1-leaf" />
<circle cx="236" cy="190" r="15" class="xl1-leaf" />
<circle cx="308" cy="190" r="15" class="xl1-leaf" />
<circle cx="128" cy="138" r="18" class="xl1-split" />
<text x="128" y="143" text-anchor="middle" font-size="15" class="xl1-num">2</text>
<circle cx="272" cy="138" r="18" class="xl1-split" />
<text x="272" y="143" text-anchor="middle" font-size="15" class="xl1-num">3</text>
<circle cx="200" cy="86" r="18" class="xl1-split" />
<text x="200" y="91" text-anchor="middle" font-size="15" class="xl1-num">1</text>
<text x="200" y="222" text-anchor="middle" font-size="15" class="xl1-m">깊이 순서대로 전부 분할</text>
<line x1="40" y1="248" x2="360" y2="248" class="xl1-rule" />
<!-- 아래 패널 -->
<text x="200" y="280" text-anchor="middle" font-size="17" font-weight="700" class="xl1-t">아래: leaf-wise 성장</text>
<text x="200" y="302" text-anchor="middle" font-size="14" class="xl1-m">LightGBM 기본값 (best-first)</text>
<line x1="200" y1="344" x2="128" y2="396" class="xl1-edge" />
<line x1="200" y1="344" x2="272" y2="396" class="xl1-edge" />
<line x1="272" y1="396" x2="228" y2="448" class="xl1-edge" />
<line x1="272" y1="396" x2="316" y2="448" class="xl1-edge" />
<line x1="316" y1="448" x2="280" y2="500" class="xl1-edge" />
<line x1="316" y1="448" x2="352" y2="500" class="xl1-edge" />
<circle cx="128" cy="396" r="15" class="xl1-leaf" />
<circle cx="228" cy="448" r="15" class="xl1-leaf" />
<circle cx="280" cy="500" r="15" class="xl1-leaf" />
<circle cx="352" cy="500" r="15" class="xl1-leaf" />
<circle cx="316" cy="448" r="18" class="xl1-split" />
<text x="316" y="453" text-anchor="middle" font-size="15" class="xl1-num">3</text>
<circle cx="272" cy="396" r="18" class="xl1-split" />
<text x="272" y="401" text-anchor="middle" font-size="15" class="xl1-num">2</text>
<circle cx="200" cy="344" r="18" class="xl1-split" />
<text x="200" y="349" text-anchor="middle" font-size="15" class="xl1-num">1</text>
<text x="200" y="536" text-anchor="middle" font-size="15" class="xl1-m">이득이 가장 큰 리프만 분할</text>
<text x="200" y="560" text-anchor="middle" font-size="14" class="xl1-m">숫자 = 분할 순서 (양쪽 모두 3회)</text>
</svg>
</div>

리프 수가 같다면 leaf-wise 쪽이 훈련 손실을 더 많이 깎는다. 손실이 줄어드는 곳에만 예산을 쓰기 때문이다. 대신 트리가 한쪽으로만 깊어져서, 데이터가 작으면 그 깊은 가지가 소수 샘플의 특징을 그대로 외운다. LightGBM이 작은 데이터에서 과적합한다는 말은 이 성질을 가리킨다.

### 라이브러리의 차이가 아니라 기본값의 차이다

이 대비는 "XGBoost는 level-wise, LightGBM은 leaf-wise"로 굳어져 있지만 정확히는 기본값 이야기다. XGBoost도 `grow_policy='lossguide'` 로 바꾸면 leaf-wise로 자란다. `tree_method` 가 `hist` 나 `approx` 일 때만 쓸 수 있고, 이때는 `max_depth` 대신 `max_leaves` 로 트리 크기를 제한한다.

```python
import xgboost as xgb

# LightGBM과 같은 방식으로 키운다
model = xgb.XGBClassifier(grow_policy='lossguide', max_leaves=31, max_depth=0)
```

:::warning

**`num_leaves`를 `2^max_depth`에 맞추면 안 된다**

리프 수를 `2^max_depth` 로 잡으면 같은 깊이의 depth-wise 트리와 리프 수가 같아진다. 하지만 leaf-wise 트리는 같은 리프 수를 훨씬 깊은 형태로 소비하므로, 그대로 옮기면 제한이 사실상 풀린 것과 다름없다.

공식 튜닝 문서는 `max_depth=7` 로 좋은 정확도가 나오는 데이터라면 `num_leaves`는 127이 아니라 70에서 80 사이를 권한다. `num_leaves`를 먼저 정하고 `max_depth`는 뒤에서 받쳐주는 안전장치로 두는 게 순서다.

:::

## XGBoost가 더한 것

### 정규화가 목적 함수 안에 있다

일반적인 Gradient Boosting의 목적 함수는 손실 항 하나다. XGBoost는 여기에 트리 복잡도에 대한 벌점을 명시적으로 더한다.

$$\text{Obj} = \sum_{i=1}^{n} L(y_i, \hat{y}_i) + \sum_{k=1}^{K} \Omega(f_k), \qquad \Omega(f) = \gamma T + \frac{1}{2}\lambda \sum_{j=1}^{T} w_j^2$$

$T$ 는 리프 수, $w_j$ 는 각 리프가 내놓는 값이다. $\gamma$ 는 리프를 하나 늘릴 때마다 물리는 비용이라 분할을 억제하고, $\lambda$ 는 리프 값의 크기를 눌러 예측을 보수적으로 만든다. 가지치기를 학습이 끝난 뒤 따로 하는 게 아니라, 분할 여부를 판단하는 그 순간에 비용으로 반영한다.

### 2차 도함수까지 쓴다

손실 함수를 현재 예측 주변에서 2차까지 테일러 전개하면, 각 리프의 최적값과 분할 이득이 닫힌 형태로 나온다. $g_i$ 를 1차 도함수(그래디언트), $h_i$ 를 2차 도함수(헤시안)라 할 때 리프 $j$ 의 최적값은 이렇게 정해진다.

$$w_j^{*} = -\frac{\sum_{i \in I_j} g_i}{\sum_{i \in I_j} h_i + \lambda}$$

분모에 $\lambda$ 가 들어앉은 자리를 보면 정규화가 어디서 작동하는지 바로 보인다. 헤시안까지 쓰므로 뉴턴법에 가까워져서, 그래디언트만 쓰는 방식보다 같은 트리 수에서 손실을 더 깎는다.

### 분할점 후보를 미리 줄인다

연속형 특성의 분할점 후보는 원칙적으로 그 특성이 가진 서로 다른 값의 개수만큼 존재한다. 100만 행이면 후보가 100만 개다. XGBoost는 이 후보를 추리는 방법을 세 가지 제공한다.

| `tree_method` | 분할점 후보를 정하는 방식 | 성격 |
|---|---|---|
| `exact` | 특성 값을 전부 정렬해 모든 지점을 본다 | 가장 정확하고 가장 느리다. leaf-wise를 못 쓴다 |
| `approx` | 매 트리마다 헤시안 가중 분위수로 다시 버킷을 만든다 | 트리마다 새로 계산해 비용이 든다 |
| `hist` | 학습 시작 전에 한 번만 구간을 나누고 계속 재사용한다 | 가장 빠르다. 현재 기본값이다 |

`hist` 는 특성 값을 256개 안팎의 구간으로 미리 묶어두고, 이후로는 구간 경계만 분할점 후보로 본다. 후보가 수만 개에서 수백 개로 줄어드는데 정확도 손실은 거의 없다. LightGBM이 처음부터 이 방식만 쓴 것이고, XGBoost는 2.0에서 기본값을 `hist` 로 옮겼다. 두 라이브러리의 속도 차이를 만들던 큰 항목 하나가 여기서 사라졌으므로, 2.0 이전에 측정된 비교는 지금 기준으로 다시 읽어야 한다.

### 결측치는 갈 방향을 학습한다

결측값이 있는 샘플을 만나면 XGBoost는 그 샘플들을 왼쪽으로 몰아본 경우와 오른쪽으로 몰아본 경우를 모두 계산하고, 이득이 큰 쪽을 그 노드의 기본 방향으로 저장한다. 별도의 결측치 대치 없이 데이터를 그대로 넣어도 되는 이유다. LightGBM도 같은 방식으로 방향을 학습하므로 지금은 둘을 가르는 항목이 아니다. XGBoost 논문이 먼저 정식화했을 뿐이다.

## LightGBM이 더한 것

### GOSS로 행을 줄인다

Gradient-based One-Side Sampling은 매 라운드에 쓸 행을 고르는 방법이다. 그래디언트 절댓값이 큰 행은 지금 모델이 크게 틀리고 있는 행이니 정보량이 많고, 작은 행은 이미 잘 맞추고 있어 얻을 게 적다. 그러니 앞쪽은 전부 남기고 뒤쪽만 솎아낸다.

전체 $N$ 행에서 그래디언트 절댓값 상위 `top_rate`(기본 0.2) 비율을 그대로 가져가고, 남은 행 중에서 **전체 대비** `other_rate`(기본 0.1) 비율만큼을 무작위로 뽑는다. 100만 행이면 20만 + 10만으로 30만 행이 남는다.

여기서 그냥 끝내면 작은 그래디언트 쪽의 비중이 줄어들어 분포가 왜곡된다. 그래서 무작위로 뽑힌 행의 그래디언트와 헤시안에 보정 배율을 곱해 원래 비중을 복원한다.

$$\text{배율} = \frac{1 - a}{b} = \frac{1 - 0.2}{0.1} = 8$$

:::info

**GOSS는 기본값이 아니다**

LightGBM의 행 샘플링 기본값은 평범한 배깅(`data_sample_strategy='bagging'`)이다. GOSS를 쓰려면 `data_sample_strategy='goss'` 로 직접 켜야 한다. LightGBM 논문이 말한 20배 이상의 속도 향상도 GOSS 하나가 아니라 히스토그램 분할과 EFB까지 합친 결과다.

:::

### EFB로 열을 줄인다

Exclusive Feature Bundling은 동시에 0이 아닌 값을 갖는 일이 없는 특성들, 즉 서로 배타적인 특성들을 한 컬럼으로 묶는다. 원-핫 인코딩 결과가 전형적인 대상이다.

| 특성 | 값 |
|---|---|
| `city_seoul` | 1, 0, 0, 1, 0 |
| `city_busan` | 0, 1, 0, 0, 1 |
| `city_daegu` | 0, 0, 1, 0, 0 |
| **`city_bundled`** | **1, 2, 3, 1, 2** |

세 컬럼이 한 컬럼이 됐고 정보는 하나도 잃지 않았다. 히스토그램을 만드는 비용은 특성 수에 비례하므로, 희소한 고차원 데이터일수록 이득이 크다.

### 범주형 컬럼을 그대로 받는다

LightGBM은 범주형 특성을 원-핫으로 펼치지 않고 직접 분할한다. 한 특성의 범주들을 $\sum g / \sum h$ 값으로 정렬한 뒤 그 순서에서 최적 분할점을 찾는 방식이라, 범주를 두 집합으로 나누는 문제를 정렬된 축에서의 이분 문제로 바꾼다.

XGBoost도 1.5부터 범주형을 직접 다룬다. `enable_categorical=True` 를 켜고 pandas의 `category` dtype으로 넘겨야 하며, `hist` 나 `approx` 에서만 동작한다. 범주를 자식 노드로 최적 분할하는 방식은 1.6부터 들어왔고, 범주 수가 `max_cat_to_onehot` 보다 적으면 원-핫으로 처리한다.

```python
# LightGBM: pandas category dtype이면 자동 인식
lgb_model.fit(X, y, categorical_feature=['color', 'size'])

# XGBoost 1.5+
X['color'] = X['color'].astype('category')
xgb.XGBClassifier(enable_categorical=True, tree_method='hist').fit(X, y)
```

## 파라미터가 대응되지 않는 자리

이름만 보고 옮기면 다른 모델이 만들어지는 자리가 있다. 특히 마지막 두 줄이 자주 틀린다.

| 역할 | XGBoost | LightGBM |
|---|---|---|
| 트리 깊이 제한 | `max_depth` (기본 6) | `max_depth` (기본 -1, 무제한) |
| 리프 수 제한 | `max_leaves` (`lossguide`에서) | `num_leaves` (기본 31) |
| 학습률 | `learning_rate` | `learning_rate` |
| L2 / L1 정규화 | `reg_lambda` / `reg_alpha` | `lambda_l2` / `lambda_l1` |
| 행 서브샘플링 | `subsample` | `bagging_fraction` (+ `bagging_freq`) |
| 열 서브샘플링 | `colsample_bytree` | `feature_fraction` |
| 분할 최소 이득 | `gamma` | `min_gain_to_split` |
| 리프 최소 **헤시안 합** | `min_child_weight` (기본 1) | `min_sum_hessian_in_leaf` (기본 1e-3) |
| 리프 최소 **샘플 수** | 없음 | `min_data_in_leaf` (기본 20) |

LightGBM의 `min_child_weight` 는 `min_sum_hessian_in_leaf` 의 별칭이고, `min_child_samples` 는 `min_data_in_leaf` 의 별칭이다. 이름이 비슷해 헷갈리기 쉽지만 하나는 헤시안 합, 하나는 행 개수로 단위 자체가 다르다.

`bagging_fraction` 은 `bagging_freq` 를 함께 1 이상으로 주지 않으면 아무 일도 하지 않는다. XGBoost의 `subsample` 을 그대로 옮겨 적고 서브샘플링이 걸렸다고 생각하는 실수가 여기서 나온다.

## 종합 비교

| 항목 | XGBoost | LightGBM |
|---|---|---|
| 기본 성장 방식 | level-wise (`lossguide`로 전환 가능) | leaf-wise |
| 크기 제한 축 | 깊이 | 리프 수 |
| 분할점 후보 | `hist` 기본, `exact`/`approx` 선택 가능 | 히스토그램 고정 |
| 행 샘플링 | `subsample` | 배깅 기본, GOSS 선택 |
| 열 압축 | 없음 | EFB |
| 범주형 | 1.5+ `enable_categorical` | 처음부터 네이티브 |
| 결측치 | 기본 방향 학습 | 기본 방향 학습 (`zero_as_missing` 으로 정의 변경 가능) |
| GPU | `device='cuda'` | `device_type` 이 `gpu`(OpenCL) 또는 `cuda` |
| 대규모 데이터 대응 | `hist` 로 분할점 후보 축소 | 후보 축소에 더해 EFB로 열, GOSS로 행까지 축소 |
| 작은 데이터 과적합 | 상대적으로 덜하다 | `num_leaves` 관리 필요 |

## CatBoost라는 세 번째 선택지

2017년 Yandex가 공개한 CatBoost는 앞의 두 라이브러리와 다른 축에서 문제를 푼다.

**대칭 트리(oblivious tree).** 한 깊이의 모든 노드가 같은 특성, 같은 임계값으로 분할한다. 표현력은 떨어지지만 트리가 규칙적인 구조가 되어 예측이 단순한 인덱싱 연산으로 바뀐다. 추론 지연이 중요한 서빙 환경에서 이 구조가 유리하다.

**Ordered Target Statistics.** 범주형을 타겟 통계로 바꿀 때 자기 자신의 타겟이 인코딩에 섞여 들어가는 누출을 막는다. 데이터에 인공 순서를 부여하고, 각 행은 그 순서에서 자기보다 앞선 행들의 타겟만으로 인코딩한다.

**Ordered Boosting.** 같은 논리를 잔차 계산에도 적용해서, 자기 자신이 학습에 쓰인 모델로 자기 잔차를 계산하는 편향을 없앤다.

카디널리티가 높은 범주형 컬럼이 많은 데이터에서 강하다. 인코딩과 누출 방지가 기본으로 켜져 있어 전처리를 손으로 붙이지 않아도 첫 점수가 나온다는 것도 실무에서는 이점이다.

## 무엇을 고를까

| 상황 | 선택 |
|---|---|
| 행이 수백만 개 이상이다 | LightGBM |
| 범주형 컬럼이 많고 카디널리티가 높다 | CatBoost |
| 행이 수만 개 이하다 | XGBoost, 또는 `num_leaves`를 낮춘 LightGBM |
| 추론 지연이 중요하다 | CatBoost |
| 실험을 빠르게 반복해야 한다 | LightGBM으로 탐색하고 최종만 다른 모델로 재확인 |

세 라이브러리 모두 sklearn 호환 인터페이스를 제공하니, 파이프라인을 한 번 짜두면 모델을 바꿔 끼우는 비용은 거의 없다. 결국 데이터에 직접 물어보는 게 가장 빠르다.

## 흔한 실수

### 트리 크기를 깊이로 옮겨 적는다

XGBoost의 `max_depth=6` 은 최대 $2^6 = 64$ 개 리프를 뜻하지만, LightGBM에 `max_depth=6` 만 적으면 리프 수는 `num_leaves` 기본값인 31에 묶인 채 깊이만 제한된다. 반대로 `num_leaves` 만 크게 열어 두면 leaf-wise가 이득이 나는 방향으로 계속 파고든다. 옮길 때 맞춰야 할 축은 깊이가 아니라 리프 수다.

```python
# 깊이 제한도 없이 리프 수만 키웠다
lgb.LGBMClassifier(num_leaves=256, max_depth=-1)

# num_leaves를 먼저 정하고 max_depth로 받친다
lgb.LGBMClassifier(num_leaves=31, max_depth=7, min_data_in_leaf=50)
```

`num_leaves` 를 보수적으로 두고 `min_data_in_leaf` 로 리프에 최소 몇 행은 남게 강제하는 것이 실질적인 제동 장치다.

### 조기 종료 인터페이스를 헷갈린다

XGBoost는 `early_stopping_rounds` 가 생성자 파라미터다(1.6부터). LightGBM은 생성자에 그런 인자가 없고 `fit` 에 콜백으로 넘긴다.

```python
xgb.XGBRegressor(n_estimators=1000, early_stopping_rounds=50)

lgb.LGBMRegressor(n_estimators=1000).fit(
    X_train, y_train,
    eval_set=[(X_valid, y_valid)],
    callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)],
)
```

### 원-핫부터 하고 본다

범주형 컬럼을 습관적으로 `pd.get_dummies` 로 펼치면 차원이 불어나고, 트리는 한 번에 범주 하나만 떼어내는 분할밖에 할 수 없게 된다. 세 라이브러리 모두 범주형을 직접 다루는 경로가 있으니 그쪽을 먼저 시도한다.

## 마치며

두 라이브러리를 가르는 건 성능이 아니라 설계 취향이다. XGBoost는 목적 함수에 정규화를 박아 넣고 깊이로 트리를 통제하는, 보수적이고 예측 가능한 쪽을 골랐다. LightGBM은 손실이 줄어드는 곳에만 예산을 쓰고 행과 열을 모두 압축하는, 공격적이고 빠른 쪽을 골랐다. 그래서 튜닝 방식도 갈린다. 전자는 깊이를 정하는 문제이고 후자는 리프 수를 억제하는 문제다.

실무의 답은 대체로 단순하다. 데이터가 크면 LightGBM으로 시작하고, `num_leaves` 와 `min_data_in_leaf` 를 조이는 데 시간을 쓴다. 범주형이 많으면 CatBoost를 먼저 넣어본다. XGBoost는 안정적인 기준선이 필요하거나 세밀한 제어가 필요할 때 꺼낸다.

여기까지가 트리를 겹쳐 쌓아 만든 모델들의 이야기다. 다음부터는 완전히 다른 계열, 층을 쌓아 표현을 학습하는 신경망으로 넘어간다.

## 함께 보면 좋은 글

- [부스팅](/ml/boosting/) : 이 라이브러리들이 공유하는 순차 학습의 원리
- [범주형 인코딩](/ml/categorical-encoding/) : 네이티브 지원을 쓰지 않을 때의 선택지
- [하이퍼파라미터 튜닝](/ml/hyperparameter-tuning/) : `num_leaves`처럼 서로 얽힌 파라미터를 탐색하는 방법

## 참고자료

- [Chen & Guestrin (2016), XGBoost: A Scalable Tree Boosting System](https://arxiv.org/abs/1603.02754)
- [Ke et al. (2017), LightGBM: A Highly Efficient Gradient Boosting Decision Tree](https://papers.nips.cc/paper/6907-lightgbm-a-highly-efficient-gradient-boosting-decision-tree)
- [Prokhorenkova et al. (2018), CatBoost: unbiased boosting with categorical features](https://arxiv.org/abs/1706.09516)
- [XGBoost, Tree Methods](https://xgboost.readthedocs.io/en/stable/treemethod.html)
- [XGBoost, Categorical Data](https://xgboost.readthedocs.io/en/stable/tutorials/categorical.html)
- [LightGBM, Features](https://lightgbm.readthedocs.io/en/stable/Features.html)
- [LightGBM, Parameters Tuning](https://lightgbm.readthedocs.io/en/stable/Parameters-Tuning.html)
