---
date: '2026-01-14'
title: '질문을 반복해 데이터를 쪼개는 결정 트리'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 14
tags: ['Decision Tree', '결정 트리', 'Gini Impurity', '지니 불순도', 'Entropy', 'Information Gain', '머신러닝 기초']
summary: '결정 트리가 지니 불순도와 정보 이득으로 분할 기준을 고르는 방식, 축에 평행한 결정 경계가 만들어지는 이유, 깊이 제한으로 과적합을 막는 원리를 정리한다.'
thumbnail: './thumbnail.png'
---

선형 모델은 $w \cdot x + b = 0$ 이라는 직선 하나로 공간을 가른다. 다항 특성을 붙이면 곡선이 되기는 하지만, 경계의 모양을 수식이 미리 정해둔다는 점은 그대로다.

결정 트리는 수식 대신 **질문**을 쓴다. "꽃잎 길이가 2.45cm 이하인가?"로 데이터를 두 덩어리로 가르고, 각 덩어리에 또 질문을 던진다. 질문이 쌓이면서 범위가 좁아지고 더 나눌 것이 없어진 지점에서 답을 내놓는다. 사람이 판단을 좁혀가는 방식과 거의 같아서, 학습이 끝난 모델을 그림 한 장으로 펼쳐놓고 왜 그렇게 예측했는지 따라갈 수 있다.

## 트리를 이루는 노드

Iris 데이터를 깊이 2까지만 키우면 트리는 이런 모양이 된다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Iris 데이터로 학습한 깊이 2 결정 트리. 루트에서 꽃잎 길이 2.45cm 이하 여부로 나누고, 아니오 쪽 가지를 꽃잎 너비 1.75cm 이하 여부로 다시 나눈 뒤 세 리프에서 setosa, versicolor, virginica를 예측한다">
<defs>
<marker id="dt1Arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
<path d="M0 0 L8 4 L0 8 Z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text x="200" y="22" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text, #1c1917)">Iris 결정 트리 (깊이 2)</text>
<!-- 간선 -->
<line x1="200" y1="84" x2="83" y2="131" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#dt1Arrow)"/>
<line x1="200" y1="84" x2="297" y2="131" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#dt1Arrow)"/>
<line x1="300" y1="178" x2="233" y2="225" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#dt1Arrow)"/>
<line x1="300" y1="178" x2="343" y2="225" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#dt1Arrow)"/>
<text x="126" y="106" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">예</text>
<text x="272" y="106" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">아니오</text>
<text x="247" y="203" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">예</text>
<text x="356" y="203" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">아니오</text>
<!-- 루트 -->
<rect x="130" y="40" width="140" height="44" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="200" y="62" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">꽃잎 길이 ≤ 2.45</text>
<text x="200" y="78" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">gini 0.667</text>
<!-- 왼쪽 리프 -->
<rect x="25" y="134" width="110" height="44" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="80" y="156" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">setosa</text>
<text x="80" y="172" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">gini 0</text>
<!-- 오른쪽 내부 노드 -->
<rect x="230" y="134" width="140" height="44" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="300" y="156" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">꽃잎 너비 ≤ 1.75</text>
<text x="300" y="172" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">gini 0.5</text>
<!-- 리프 두 개 -->
<rect x="180" y="228" width="100" height="44" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="230" y="250" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">versicolor</text>
<text x="230" y="266" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">gini 0.168</text>
<rect x="295" y="228" width="100" height="44" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="345" y="250" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">virginica</text>
<text x="345" y="266" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">gini 0.043</text>
</svg>
</div>

루트의 150개가 50개와 100개로 갈리고, 오른쪽 100개가 다시 54개와 46개로 갈린다. 노드는 세 종류다.

| 노드 | 역할 |
|---|---|
| 루트 (Root) | 전체 데이터에 첫 질문을 던지는 시작점 |
| 내부 노드 (Internal) | 질문을 담고 두 자식으로 분기한다 |
| 리프 (Leaf) | 더 나누지 않고 예측 클래스를 반환한다 |

각 노드가 담는 조건은 언제나 **특성 하나 + 임계값 하나**다. 데이터 포인트는 예/아니오로 답하며 리프까지 내려가고, 도착한 리프의 다수 클래스가 예측값이 된다.

## 좋은 분할이란 무엇인가

트리가 풀어야 할 문제는 하나다. **어떤 특성의 어떤 임계값으로 쪼갤 것인가.** 가능한 조합을 전부 시도해보고 가장 좋은 것을 고른다.

좋은 분할은 나뉜 두 그룹이 더 **순수**해지는 분할이다. 한 그룹 안에 같은 클래스끼리 모일수록 좋다. 이 순수도를 재는 자가 지니 불순도와 엔트로피다.

### 지니 불순도

노드 $t$에서 임의로 샘플 하나를 뽑고, 그 노드의 클래스 비율대로 무작위 레이블을 붙였을 때 **틀릴 확률**이 지니 불순도다.

$$G(t) = 1 - \sum_{i} p_i^2$$

$p_i$ 는 노드 $t$ 안에서 클래스 $i$ 가 차지하는 비율이다. 어떤 샘플이 실제로 클래스 $i$ 일 확률이 $p_i$ 이고 그 샘플에 클래스 $i$ 를 붙일 확률도 $p_i$ 이므로, 맞힐 확률은 $\sum_i p_i^2$ 이고 1에서 빼면 틀릴 확률이 된다.

```python
def gini(counts):
    total = sum(counts)
    return 1 - sum((c / total) ** 2 for c in counts)

gini([50, 50, 50])   # 루트  0.6667
gini([50, 0, 0])     # 왼쪽  0.0
gini([0, 50, 50])    # 오른쪽 0.5
```

분할의 좋고 나쁨은 자식 노드들의 **가중 평균 불순도**가 부모보다 얼마나 낮아졌는지로 잰다.

$$\Delta G = G(\text{parent}) - \sum_j \frac{n_j}{n} \, G(\text{child}_j)$$

Iris의 첫 분할에 넣어보면 $\frac{50}{150} \times 0 + \frac{100}{150} \times 0.5 = 0.3333$ 이고, 루트의 0.6667에서 정확히 절반이 줄었다. 이 조합이 모든 후보 중 감소량이 가장 크므로 트리는 이것을 첫 질문으로 택한다.

:::info

**지니 값을 읽는 법**

$G = 0$ 은 한 클래스만 남은 완전히 순수한 노드다.

이진 분류에서 $G = 0.5$, 클래스가 $K$ 개일 때 $G = 1 - 1/K$ 가 최댓값이고, 모든 클래스가 균등하게 섞인 최악의 상태다.

:::

### 엔트로피와 정보 이득

순수도를 재는 자는 하나 더 있다. 정보 이론에서 가져온 엔트로피는 노드의 불확실성을 잰다.

$$H(t) = -\sum_i p_i \log_2 p_i$$

확률이 낮은 사건일수록 놀라움이 크고, 그 놀라움의 크기를 $-\log_2 p$ 로 정의한다. 엔트로피는 이 놀라움의 기대값이다. 클래스가 고르게 섞여 있으면 다음에 무엇이 나올지 모르니 엔트로피가 최대가 된다.

분할 전후 엔트로피의 감소량이 **정보 이득**이다.

$$IG = H(\text{parent}) - \sum_j \frac{n_j}{n} \, H(\text{child}_j)$$

같은 첫 분할을 넣으면 루트가 $\log_2 3 = 1.585$ 비트, 왼쪽이 0비트, 오른쪽이 1비트다. 가중 평균은 $\frac{100}{150} \times 1 = 0.667$ 비트이고, 정보 이득은 0.918비트다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="이진 분류에서 클래스 비율 p에 따른 지니 불순도와 엔트로피 곡선. 둘 다 p가 0이나 1일 때 0이고 p가 0.5일 때 최대이며, 최댓값은 엔트로피가 1.0, 지니가 0.5다">
<style>
.dt3-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.dt3-gini { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
.dt3-ent { stroke: var(--accent, #9d5604); stroke-width: 2.5; fill: none; stroke-dasharray: 7 4; }
.dt3-guide { stroke: var(--border, #e7e5e4); stroke-width: 1.2; stroke-dasharray: 4 4; fill: none; }
.dt3-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.dt3-l { fill: var(--text-muted, #6d6762); font-size: 14px; }
.dt3-p { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 600; }
.dt3-a { fill: var(--accent, #9d5604); font-size: 14px; font-weight: 600; }
</style>
<text class="dt3-t" x="200" y="26" text-anchor="middle">지니 불순도와 엔트로피 (이진 분류)</text>
<!-- 축과 눈금 -->
<path class="dt3-ax" d="M 66 250 L 378 250"/>
<path class="dt3-ax" d="M 66 250 L 66 58"/>
<path class="dt3-ax" d="M 61 250 L 66 250 M 61 159 L 66 159 M 61 68 L 66 68"/>
<path class="dt3-ax" d="M 66 250 L 66 255 M 219 250 L 219 255 M 372 250 L 372 255"/>
<text class="dt3-l" x="57" y="255" text-anchor="end">0</text>
<text class="dt3-l" x="57" y="164" text-anchor="end">0.5</text>
<text class="dt3-l" x="57" y="73" text-anchor="end">1.0</text>
<text class="dt3-l" x="66" y="270" text-anchor="middle">0</text>
<text class="dt3-l" x="219" y="270" text-anchor="middle">0.5</text>
<text class="dt3-l" x="372" y="270" text-anchor="middle">1</text>
<text class="dt3-l" x="219" y="292" text-anchor="middle">클래스 1의 비율 p</text>
<text class="dt3-l" x="22" y="155" text-anchor="middle" transform="rotate(-90 22 155)">불순도</text>
<path class="dt3-guide" d="M 219 250 L 219 68"/>
<!-- 엔트로피 -->
<path class="dt3-ent" d="M 66 250 L 81.3 197.9 L 96.6 164.6 L 111.9 139 L 127.2 118.6 L 142.5 102.3 L 157.8 89.6 L 173.1 80 L 188.4 73.3 L 203.7 69.3 L 219 68 L 234.3 69.3 L 249.6 73.3 L 264.9 80 L 280.2 89.6 L 295.5 102.3 L 310.8 118.6 L 326.1 139 L 341.4 164.6 L 356.7 197.9 L 372 250"/>
<!-- 지니 -->
<path class="dt3-gini" d="M 66 250 L 81.3 232.7 L 96.6 217.2 L 111.9 203.6 L 127.2 191.8 L 142.5 181.8 L 157.8 173.6 L 173.1 167.2 L 188.4 162.6 L 203.7 159.9 L 219 159 L 234.3 159.9 L 249.6 162.6 L 264.9 167.2 L 280.2 173.6 L 295.5 181.8 L 310.8 191.8 L 326.1 203.6 L 341.4 217.2 L 356.7 232.7 L 372 250"/>
<circle cx="219" cy="68" r="4" fill="var(--accent, #9d5604)"/>
<circle cx="219" cy="159" r="4" fill="var(--primary, #0a756c)"/>
<!-- 범례 -->
<path class="dt3-ent" d="M 74 74 L 94 74"/>
<text class="dt3-a" x="98" y="79">엔트로피</text>
<path class="dt3-gini" d="M 74 98 L 94 98"/>
<text class="dt3-p" x="98" y="103">지니</text>
</svg>
</div>

둘 다 $p = 0$ 이나 $p = 1$ 에서 0이고 $p = 0.5$ 에서 최대다. 최댓값은 엔트로피가 1, 지니가 0.5로 두 배 차이가 나지만, 어느 분할이 더 나은지를 두고는 거의 항상 같은 답을 낸다.

| 기준 | 수식 | sklearn 인자 | 성격 |
|---|---|---|---|
| 지니 | $1 - \sum p_i^2$ | `criterion='gini'` | log 계산이 없어 빠르다. 큰 클래스를 먼저 떼어내는 경향 |
| 엔트로피 | $-\sum p_i \log_2 p_i$ | `criterion='entropy'` | 정보량으로 해석된다. 조금 더 균형 잡힌 트리 |

성능 차이는 실무에서 거의 없다. 기본값인 지니를 그대로 쓰면 된다.

## 분할을 직접 찾아보기

트리가 최적 분할을 찾는 과정은 특별한 기교 없이 전수 탐색이다. 특성 하나를 골라, 그 특성이 가진 값들을 임계값 후보로 놓고, 전부 계산해서 가장 많이 줄어드는 조합을 남긴다.

```python
import numpy as np
from sklearn.datasets import load_iris

def gini(y):
    if len(y) == 0:
        return 0
    _, counts = np.unique(y, return_counts=True)
    return 1 - np.sum((counts / len(y)) ** 2)

def best_split(X, y):
    best = (-1, None, None)
    g_parent = gini(y)
    for f in range(X.shape[1]):
        for t in np.unique(X[:, f]):
            left = X[:, f] <= t
            if left.sum() == 0 or (~left).sum() == 0:
                continue
            n_l, n_r = left.sum(), (~left).sum()
            g = (n_l * gini(y[left]) + n_r * gini(y[~left])) / len(y)
            if g_parent - g > best[0]:
                best = (g_parent - g, f, t)
    return best

iris = load_iris()
gain, feat, thresh = best_split(iris.data, iris.target)
print(f"{iris.feature_names[feat]} <= {thresh:.2f}, 감소량 {gain:.4f}")
```

```text
petal length (cm) <= 1.90, 감소량 0.3333
```

꽃잎 길이 1.90cm가 답으로 나온다. sklearn은 후보 값과 그 다음 값의 중간점을 쓰기 때문에 2.45로 표시하지만, setosa의 최대 꽃잎 길이가 1.9이고 versicolor의 최소가 3.0이라 두 값은 정확히 같은 분할을 만든다.

특성이 $m$ 개, 각 특성의 고유값이 평균 $n$ 개면 노드 하나당 $O(mn)$ 번의 불순도 계산이 든다. sklearn은 특성을 한 번 정렬해두고 임계값을 옮겨가며 클래스 카운트를 증분 갱신해서 이 비용을 줄인다.

## 결정 경계가 계단 모양인 이유

분할 조건이 늘 "특성 하나 $\le$ 임계값" 이라는 것은 곧 결정 경계가 **축에 평행한 직선**뿐이라는 뜻이다. 깊이 2 트리가 꽃잎 길이와 꽃잎 너비 평면을 나누는 모습을 그려보면 이렇다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="꽃잎 길이와 꽃잎 너비 평면이 두 번의 축 평행 분할로 세 영역으로 나뉜 그림. 꽃잎 길이 2.45 왼쪽은 setosa, 오른쪽은 꽃잎 너비 1.75를 기준으로 위가 virginica, 아래가 versicolor다">
<text x="200" y="22" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text, #1c1917)">축에 평행한 두 번의 분할</text>
<!-- 영역 -->
<rect x="62" y="48" width="75" height="220" fill="var(--bg-success, #f0fdf4)" stroke="var(--border, #e7e5e4)"/>
<rect x="137" y="48" width="235" height="72" fill="var(--bg-warn, #fffbeb)" stroke="var(--border, #e7e5e4)"/>
<rect x="137" y="120" width="235" height="148" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<!-- 분할선 -->
<line x1="137" y1="48" x2="137" y2="268" stroke="var(--primary, #0a756c)" stroke-width="2"/>
<line x1="137" y1="120" x2="372" y2="120" stroke="var(--primary, #0a756c)" stroke-width="2"/>
<text x="137" y="40" text-anchor="middle" font-size="14" fill="var(--primary, #0a756c)">분기 1</text>
<text x="175" y="113" text-anchor="middle" font-size="14" fill="var(--primary, #0a756c)">분기 2</text>
<!-- 영역 라벨 -->
<text x="99.5" y="168" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">setosa</text>
<text x="254.5" y="90" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">virginica</text>
<text x="254.5" y="200" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">versicolor</text>
<!-- 축 -->
<line x1="62" y1="268" x2="372" y2="268" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<line x1="62" y1="48" x2="62" y2="268" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<text x="137" y="286" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">2.45</text>
<text x="56" y="125" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">1.75</text>
<text x="217" y="308" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">꽃잎 길이 (cm)</text>
<text x="18" y="158" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)" transform="rotate(-90 18 158)">꽃잎 너비 (cm)</text>
</svg>
</div>

리프 하나가 영역 하나에 대응한다. 깊이를 늘리면 영역이 더 잘게 쪼개지면서 경계가 계단처럼 촘촘해진다. 같은 두 특성으로 깊이 제한 없이 키우면 리프가 셋에서 여덟으로 늘어난다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 꽃잎 길이와 꽃잎 너비 평면을 깊이 제한 없이 키운 트리가 여덟 개 영역으로 나눈 그림. 꽃잎 너비 1.75 바로 아래의 좁은 띠가 세 조각으로 잘려 있고, 각 조각은 샘플 한두 개만 담는다">
<defs>
<marker id="dt5Arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
<path d="M0 0 L8 4 L0 8 Z" fill="var(--text-danger, #cb2121)"/>
</marker>
</defs>
<text x="200" y="22" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text, #1c1917)">제한 없이 키운 트리의 결정 경계</text>
<!-- 영역 -->
<rect x="62" y="48" width="75" height="220" fill="var(--bg-success, #f0fdf4)"/>
<rect x="137" y="48" width="235" height="72" fill="var(--bg-warn, #fffbeb)"/>
<rect x="137" y="120" width="129" height="8" fill="var(--bg-warn, #fffbeb)"/>
<rect x="137" y="128" width="129" height="140" fill="var(--bg-subtle, #f5f4f2)"/>
<rect x="266" y="120" width="26" height="17" fill="var(--bg-subtle, #f5f4f2)"/>
<rect x="292" y="120" width="80" height="17" fill="var(--bg-warn, #fffbeb)"/>
<rect x="266" y="137" width="106" height="131" fill="var(--bg-warn, #fffbeb)"/>
<rect x="62" y="48" width="310" height="220" fill="none" stroke="var(--border, #e7e5e4)"/>
<!-- 분할선 -->
<g stroke="var(--primary, #0a756c)" stroke-width="1.6">
<line x1="137" y1="48" x2="137" y2="268"/>
<line x1="137" y1="120" x2="372" y2="120"/>
<line x1="266" y1="120" x2="266" y2="268"/>
<line x1="137" y1="128" x2="266" y2="128"/>
<line x1="266" y1="137" x2="372" y2="137"/>
<line x1="292" y1="120" x2="292" y2="137"/>
<line x1="261" y1="48" x2="261" y2="120"/>
</g>
<!-- 얇은 리프 -->
<g fill="none" stroke="var(--text-danger, #cb2121)" stroke-width="1.6">
<rect x="137" y="120" width="129" height="8"/>
<rect x="266" y="120" width="26" height="17"/>
<rect x="292" y="120" width="80" height="17"/>
</g>
<!-- 영역 라벨 -->
<g text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">
<text x="99.5" y="168">setosa</text>
<text x="199" y="90">virginica</text>
<text x="201.5" y="205">versicolor</text>
<text x="319" y="243">virginica</text>
</g>
<line x1="318" y1="155" x2="318" y2="141" stroke="var(--text-danger, #cb2121)" stroke-width="1.4" marker-end="url(#dt5Arrow)"/>
<g text-anchor="middle" font-size="14" font-weight="600" fill="var(--text-danger, #cb2121)">
<text x="318" y="177">샘플 1~2개를</text>
<text x="318" y="194">감싼 리프 3개</text>
</g>
<!-- 축 -->
<line x1="62" y1="268" x2="372" y2="268" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<line x1="62" y1="48" x2="62" y2="268" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<g font-size="14" fill="var(--text-muted, #6d6762)">
<text x="137" y="286" text-anchor="middle">2.45</text>
<text x="266" y="286" text-anchor="middle">4.95</text>
<text x="56" y="125" text-anchor="end">1.75</text>
<text x="217" y="308" text-anchor="middle">꽃잎 길이 (cm)</text>
<text x="18" y="158" text-anchor="middle" transform="rotate(-90 18 158)">꽃잎 너비 (cm)</text>
</g>
</svg>
</div>

새로 생긴 다섯 영역 중 셋은 꽃잎 너비 1.75 바로 아래에 깔린 좁은 띠를 세 조각으로 자른 것이고, 조각마다 훈련 샘플이 한두 개씩만 들어 있다. 이런 영역은 그 안에 들어온 몇 개 점의 위치가 그대로 규칙이 된 것이라, 데이터가 조금만 달라져도 사라지거나 자리를 옮긴다. 과적합이 결정 경계에 드러나는 모습이 이것이다.

45도로 기운 경계가 필요한 문제라면 트리는 그것을 계단으로 근사해야 하고, 그만큼 분할이 많이 필요해진다. 반대로 특성 축이 곧 의미 있는 기준인 데이터(임계값이 실제로 존재하는 센서 값, 나이 구간 등)에서는 이 제약이 오히려 잘 맞는다.

## 과적합과 규제

깊이 제한이 없으면 트리는 모든 리프가 순수해질 때까지 쪼갠다. 클래스가 섞인 구석마다 분할을 하나씩 더 붙이는 셈이라 훈련 데이터의 잡음까지 규칙으로 새긴다. 깊이를 3으로 묶으면 훈련 점수를 조금 내주는 대신 그 암기를 막는다.

```python
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    iris.data, iris.target, test_size=0.3, random_state=42
)

clf = DecisionTreeClassifier(max_depth=3, random_state=42).fit(X_train, y_train)
print(f"훈련 {clf.score(X_train, y_train):.4f} / 테스트 {clf.score(X_test, y_test):.4f}")
```

```text
훈련 0.9524 / 테스트 1.0000
```

깊이를 바꿔가며 재보면 훈련 정확도는 단조롭게 오른다. 훈련·테스트 열은 위와 같은 7:3 분할에서, 교차검증 열은 나누지 않은 150건 전체에 `cross_val_score(..., cv=5)`를 돌려 얻은 값이고, 트리는 모두 `random_state=42`다.

| max_depth | 훈련 | 테스트 | 5겹 교차검증 |
|---|---|---|---|
| 1 | 0.6476 | 0.7111 | 0.6667 |
| 2 | 0.9429 | 0.9778 | 0.9333 |
| 3 | 0.9524 | 1.0000 | 0.9733 |
| 5 | 0.9905 | 1.0000 | 0.9533 |
| 없음 | 1.0000 | 1.0000 | 0.9533 |

Iris는 클래스가 잘 갈라져 있어서 테스트 정확도가 떨어지지 않지만, 교차검증 평균을 보면 깊이 3 이후로 오히려 낮아진다. 노이즈가 섞인 실제 데이터에서는 이 하락이 훨씬 뚜렷하게 나타난다. 훈련 점수 하나만 보고 깊이를 정하면 반드시 과적합 쪽으로 넘어간다.

주로 쓰는 규제 파라미터는 다음과 같다.

| 파라미터 | 기본값 | 역할 |
|---|---|---|
| `max_depth` | None | 트리 최대 깊이. 가장 먼저 손대는 값 |
| `min_samples_split` | 2 | 이 수보다 샘플이 적으면 분할하지 않는다 |
| `min_samples_leaf` | 1 | 리프가 가져야 할 최소 샘플 수 |
| `max_leaf_nodes` | None | 전체 리프 개수 상한 |
| `min_impurity_decrease` | 0.0 | 이만큼 불순도가 줄지 않으면 분할하지 않는다 |

:::warning

**단일 트리는 분산이 크다**

훈련 데이터를 조금만 바꿔도 루트의 분할 기준이 통째로 달라지고, 그 아래 트리 전체가 다시 그려진다. 편향은 낮지만 분산이 큰 전형적인 모델이다.

깊이 제한은 이 분산을 눌러주는 대신 편향을 올린다. 규제 파라미터로 얻을 수 있는 것은 이 맞바꿈까지다.

:::

## 학습된 트리 읽기

`plot_tree`로 그린 그림에서 내부 노드 하나는 다섯 줄로 표시된다. 리프는 분할 조건이 없어 네 줄이다.

```python
from sklearn.tree import plot_tree

plot_tree(clf, feature_names=iris.feature_names,
          class_names=iris.target_names, filled=True, rounded=True)
```

위에서 학습한 깊이 3 트리의 루트는 이렇게 찍힌다.

| 줄 | 뜻 |
|---|---|
| `petal length (cm) <= 2.45` | 이 노드의 분할 조건 |
| `gini = 0.664` | 현재 노드의 지니 불순도 |
| `samples = 105` | 이 노드에 도달한 훈련 샘플 수 |
| `value = [31, 37, 37]` | 클래스별 샘플 수 |
| `class = versicolor` | 다수 클래스, 즉 이 노드의 예측값 |

이 루트는 versicolor와 virginica가 37개로 동점인데, sklearn은 이럴 때 클래스 순서가 앞선 쪽을 택한다. `filled=True`를 주면 다수 클래스에 따라 노드 색이 달라지고, 색이 진할수록 순수한 노드다. 예측이 이상할 때 이 그림을 따라 내려가면 어느 분할에서 갈라졌는지 바로 보인다.

## 자주 하는 실수

**스케일링을 붙인다.** 트리는 "특성 값 $\le$ 임계값" 비교만 하므로 값의 순서가 유지되는 변환에는 완전히 불변이다. `StandardScaler`를 파이프라인에 넣어도 결과가 한 자리도 바뀌지 않는다. 로지스틱 회귀나 SVM에서 몸에 밴 습관이 그대로 넘어오는 자리다.

**클래스 불균형을 그냥 둔다.** 사기 탐지처럼 양성이 1%인 데이터에서는 소수 클래스를 통째로 무시해도 불순도가 거의 줄어들지 않아, 트리가 다수 클래스만 맞히는 쪽으로 자란다. `class_weight='balanced'`를 주면 각 클래스에 $n / (K \cdot n_k)$ 만큼 가중치가 붙어 불순도 계산에서 소수 클래스의 몫이 커진다.

```python
clf_balanced = DecisionTreeClassifier(class_weight='balanced', random_state=42)
```

## 마치며

결정 트리의 학습은 결국 한 문장으로 줄어든다. **불순도를 가장 많이 줄이는 분할을 탐욕적으로 반복한다.** 지니와 엔트로피는 그 불순도를 재는 두 가지 자일 뿐이고, 어느 쪽을 쓰든 트리의 모양은 거의 같다.

이 단순함이 강점과 약점을 한꺼번에 만든다. 값의 순서만 보므로 스케일링에 손댈 일이 없고, 학습된 규칙을 그대로 읽을 수 있다. 대신 매 단계 눈앞의 이득만 보고 고르기 때문에 위쪽 분할 하나가 바뀌면 그 아래가 전부 다시 그려진다.

그래서 실무에서 단일 트리를 그대로 쓰는 일은 드물다. 다음 글에서는 트리 여러 그루를 학습해 예측을 합치는 방법으로 이 분산을 줄인다.

## 함께 보면 좋은 글

- [편향-분산 트레이드오프](/ml/bias-variance/) : 트리가 왜 고분산 모델로 분류되는지
- [앙상블 학습과 배깅](/ml/ensemble-and-bagging/) : 트리 여러 그루를 합쳐 분산을 줄이는 원리
- [랜덤 포레스트](/ml/random-forest/) : 트리마다 후보 특성을 달리해 상관관계를 낮추는 방법

## 참고자료

- [Scikit-learn Decision Trees User Guide](https://scikit-learn.org/stable/modules/tree.html)
- [Scikit-learn DecisionTreeClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.tree.DecisionTreeClassifier.html)
- [Aurélien Géron, Hands-On Machine Learning, Ch.6 Decision Trees](https://www.oreilly.com/library/view/hands-on-machine-learning/9781492032632/)
- [Stanford CS229 Lecture Notes](https://cs229.stanford.edu/main_notes.pdf)
