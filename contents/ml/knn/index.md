---
date: '2026-01-11'
title: '거리만으로 분류하는 K-최근접 이웃(KNN)'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 11
tags: ['KNN', 'K-Nearest Neighbors', '거리 기반 분류', '피처 스케일링', '차원의 저주', '머신러닝']
summary: '학습 없이 이웃의 다수결로 분류하는 KNN. 거리를 정의하는 방법, K가 결정 경계를 바꾸는 방식, 스케일링이 필수인 이유, 고차원에서 거리가 의미를 잃는 차원의 저주까지 다룬다.'
thumbnail: './thumbnail.png'
---

낯선 동네에서 저녁 먹을 집을 고를 때 리뷰를 통계 내는 사람은 드물다. 사람이 몰리는 가게에 그냥 따라 들어간다. 주변을 보고 결정하는 이 습관을 그대로 알고리즘으로 옮긴 것이 **K-최근접 이웃(K-Nearest Neighbors, KNN)** 이다.

## 저장이 곧 학습이다

KNN이 세우는 가정은 하나다. 비슷한 데이터는 비슷한 레이블을 가진다. 이 가정에서 나오는 절차는 두 줄로 끝난다.

- **학습**: 데이터를 그대로 저장한다. 가중치를 최적화하지도, 함수를 피팅하지도 않는다
- **예측**: 새 데이터와 저장된 전체 데이터의 거리를 재고, 가장 가까운 K개의 레이블을 다수결로 집계한다

학습 시점에 아무 계산도 하지 않고 예측 시점에 비로소 일을 시작하기 때문에 **게으른 학습(Lazy Learning)** 이라 부른다. 학습 때 파라미터를 확정해두는 로지스틱 회귀나 나이브 베이즈와는 계산이 일어나는 시점이 정반대다.

절차가 이렇게 단순하니 결과를 좌우하는 것도 K 하나뿐이다. 같은 점, 같은 데이터인데 K를 3에서 15로 늘리면 예측이 뒤집힌다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 645" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 데이터에서 K를 3으로 두면 클래스 A로, 15로 넓히면 클래스 B로 예측이 뒤집히는 것을 두 패널로 비교한 그림">
<style>
.knn1-a { fill: var(--primary, #0a756c); }
.knn1-b { fill: var(--accent, #9d5604); }
.knn1-h { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.knn1-t { font-size: 15px; fill: var(--text, #1c1917); }
.knn1-s { font-size: 14px; fill: var(--text-muted, #6d6762); }
.knn1-r { fill: var(--bg-muted, #eeecea); stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 4; }
.knn1-d { fill: var(--bg, #fafaf8); stroke: var(--text, #1c1917); stroke-width: 2.5; }
</style>
<!-- 범례 -->
<circle cx="87" cy="18" r="6.5" class="knn1-a"/><text x="99" y="23" class="knn1-s">클래스 A</text>
<polygon points="177,11 184,23 170,23" class="knn1-b"/><text x="189" y="23" class="knn1-s">클래스 B</text>
<polygon points="267,10 275,18 267,26 259,18" class="knn1-d"/><text x="279" y="23" class="knn1-s">새 점</text>
<!-- 위 패널 : K = 3 -->
<text x="200" y="48" text-anchor="middle" class="knn1-h">K = 3</text>
<circle cx="200" cy="172" r="40" class="knn1-r"/>
<circle cx="178" cy="158" r="6.5" class="knn1-a"/><circle cx="218" cy="192" r="6.5" class="knn1-a"/><circle cx="150" cy="194" r="6.5" class="knn1-a"/><circle cx="130" cy="152" r="6.5" class="knn1-a"/>
<circle cx="236" cy="250" r="6.5" class="knn1-a"/><circle cx="95" cy="117" r="6.5" class="knn1-a"/><circle cx="295" cy="87" r="6.5" class="knn1-a"/><circle cx="170" cy="280" r="6.5" class="knn1-a"/>
<polygon points="192,195 199,207 185,207" class="knn1-b"/><polygon points="245,140 252,152 238,152" class="knn1-b"/><polygon points="162,120 169,132 155,132" class="knn1-b"/><polygon points="210,227 217,239 203,239" class="knn1-b"/>
<polygon points="268,183 275,195 261,195" class="knn1-b"/><polygon points="175,93 182,105 168,105" class="knn1-b"/><polygon points="255,110 262,122 248,122" class="knn1-b"/><polygon points="122,195 129,207 115,207" class="knn1-b"/>
<polygon points="140,97 147,109 133,109" class="knn1-b"/><polygon points="285,213 292,225 278,225" class="knn1-b"/><polygon points="310,125 317,137 303,137" class="knn1-b"/><polygon points="85,235 92,247 78,247" class="knn1-b"/>
<polygon points="200,163 209,172 200,181 191,172" class="knn1-d"/>
<text x="200" y="308" text-anchor="middle" class="knn1-t">A 2 · B 1 → 예측 A</text>
<line x1="40" y1="328" x2="360" y2="328" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널 : K = 15 -->
<text x="200" y="352" text-anchor="middle" class="knn1-h">K = 15</text>
<circle cx="200" cy="482" r="102" class="knn1-r"/>
<circle cx="178" cy="468" r="6.5" class="knn1-a"/><circle cx="218" cy="502" r="6.5" class="knn1-a"/><circle cx="150" cy="504" r="6.5" class="knn1-a"/><circle cx="130" cy="462" r="6.5" class="knn1-a"/>
<circle cx="236" cy="560" r="6.5" class="knn1-a"/><circle cx="95" cy="427" r="6.5" class="knn1-a"/><circle cx="295" cy="397" r="6.5" class="knn1-a"/><circle cx="170" cy="590" r="6.5" class="knn1-a"/>
<polygon points="192,505 199,517 185,517" class="knn1-b"/><polygon points="245,450 252,462 238,462" class="knn1-b"/><polygon points="162,430 169,442 155,442" class="knn1-b"/><polygon points="210,537 217,549 203,549" class="knn1-b"/>
<polygon points="268,493 275,505 261,505" class="knn1-b"/><polygon points="175,403 182,415 168,415" class="knn1-b"/><polygon points="255,420 262,432 248,432" class="knn1-b"/><polygon points="122,505 129,517 115,517" class="knn1-b"/>
<polygon points="140,407 147,419 133,419" class="knn1-b"/><polygon points="285,523 292,535 278,535" class="knn1-b"/><polygon points="310,435 317,447 303,447" class="knn1-b"/><polygon points="85,545 92,557 78,557" class="knn1-b"/>
<polygon points="200,473 209,482 200,491 191,482" class="knn1-d"/>
<text x="200" y="622" text-anchor="middle" class="knn1-t">A 5 · B 10 → 예측 B</text>
</svg>
</div>

가까운 셋만 보면 A가 둘이라 A로 판정되지만, 반경을 넓혀 열다섯을 세면 B가 열 개다. 데이터도 그대로고 새 점의 위치도 그대로인데 답이 바뀐다. KNN에서 K를 고르는 일이 곧 모델을 고르는 일인 이유다.

## 거리를 어떻게 잴 것인가

"가장 가까운 이웃"을 찾으려면 먼저 거리를 정의해야 한다. 기본값은 **유클리드 거리(Euclidean Distance)**, 즉 두 점을 잇는 직선의 길이다.

$$d(x, x') = \sqrt{\sum_{i=1}^{n} (x_i - x'_i)^2}$$

**맨해튼 거리(Manhattan Distance)** 는 축 방향 이동량의 합을 쓴다. 대각선을 가로지르는 대신 격자 도로를 따라가는 셈이라 블록 거리라고도 부른다.

$$d(x, x') = \sum_{i=1}^{n} |x_i - x'_i|$$

둘은 사실 하나의 식에서 나온다. **민코프스키 거리(Minkowski Distance)** 의 지수 $p$를 2로 두면 유클리드, 1로 두면 맨해튼이다.

$$d(x, x') = \left( \sum_{i=1}^{n} |x_i - x'_i|^p \right)^{1/p}$$

sklearn의 `KNeighborsClassifier`는 `metric='minkowski', p=2`가 기본값이므로, 아무것도 지정하지 않으면 유클리드 거리로 동작한다. 특별한 이유가 없다면 이대로 두면 된다.

## K가 결정 경계를 바꾼다

K는 KNN의 유일한 하이퍼파라미터인 동시에 편향과 분산을 직접 조절하는 손잡이다.

K가 1이면 가장 가까운 점 하나가 답을 정한다. 잘못 라벨링된 점 하나가 자기 주변을 통째로 자기 클래스로 만들어버리고, 결정 경계는 데이터의 잡음까지 따라 구불거린다. 과적합이다. 반대로 K를 키우면 멀리 있는 이웃까지 표를 던지므로 경계가 매끈해지지만, 다른 클래스 영역의 점까지 섞여 들어와 국소적인 패턴을 뭉갠다. K를 전체 데이터 수까지 올리면 어떤 입력이든 다수 클래스만 답하는 상수 함수가 된다.

그래서 K는 교차 검증으로 찾는다.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

X, y = load_breast_cancer(return_X_y=True)

for k in [1, 5, 7, 15, 30]:
    pipe = Pipeline([('scaler', StandardScaler()),
                     ('knn', KNeighborsClassifier(n_neighbors=k))])
    score = cross_val_score(pipe, X, y, cv=5, scoring='accuracy').mean()
    print(f"K={k:2d}  정확도: {score:.4f}")
```

```text
K= 1  정확도: 0.9543
K= 5  정확도: 0.9649
K= 7  정확도: 0.9701
K=15  정확도: 0.9614
K=30  정확도: 0.9526
```

K=1에서 낮게 출발해 7에서 정점을 찍고 다시 내려오는 뒤집힌 U자다. 과적합과 과소적합 사이의 균형점이 이 데이터에서는 7이었다.

:::tip

**이진 분류에서는 K를 홀수로 둔다**

K가 짝수면 2 대 2 같은 동점이 나올 수 있다. 홀수로 두면 이진 분류에서는 동점이 원천적으로 생기지 않는다. 다만 클래스가 셋 이상이면 홀수 K로도 동점이 가능하다(3클래스에 K=3이면 각 클래스 1표).

:::

## 스케일링 없이는 이웃 자체가 틀린다

KNN은 거리로 모든 것을 판단한다. 그래서 변수마다 단위가 다르면 거리 계산이 통째로 왜곡된다.

나이(0~100)와 연봉(만원 단위)으로 고객을 나눈다고 하자. 30세에 연봉 5,000만인 A와 50세에 연봉 5,100만인 B 사이의 거리는 이렇게 나온다.

$$d = \sqrt{(30-50)^2 + (5000-5100)^2} = \sqrt{400 + 10000} \approx 102$$

스무 살 차이가 거리 제곱합에 기여하는 몫은 400, 즉 3.8%뿐이다. 나머지 96.2%는 연봉 100만원 차이가 가져간다. 이 상태의 KNN은 사실상 "연봉이 비슷한 사람"만 이웃으로 찾고 나이는 무시한다. 특성을 하나 넣었지만 모델은 그 특성을 보지 않는 셈이다.

`StandardScaler`는 각 특성을 평균 0, 표준편차 1로 옮겨 이 불균형을 없앤다. 변수 범위가 제각각인 Wine 데이터셋에서 효과가 그대로 드러난다.

```python
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler

X_train, X_test, y_train, y_test = train_test_split(
    *load_wine(return_X_y=True), test_size=0.3, random_state=42
)

knn = KNeighborsClassifier(n_neighbors=5).fit(X_train, y_train)
print(f"원본:     {knn.score(X_test, y_test):.4f}")

scaler = StandardScaler().fit(X_train)
knn = KNeighborsClassifier(n_neighbors=5).fit(scaler.transform(X_train), y_train)
print(f"스케일링: {knn.score(scaler.transform(X_test), y_test):.4f}")
```

```text
원본:     0.7407
스케일링: 0.9630
```

같은 데이터, 같은 K인데 22%p 차이다. Wine 데이터셋은 알코올 농도가 11.0~14.8, 마그네슘이 70~162, 프롤린이 278~1680이다. 스케일링하지 않으면 값의 폭이 가장 큰 프롤린 하나가 거리의 거의 전부를 결정한다.

거리를 계산하는 알고리즘(KNN, SVM, K-Means)에는 스케일링이 전처리가 아니라 알고리즘의 일부다. 반면 결정 트리나 랜덤 포레스트는 분할 기준이 "이 값보다 큰가 작은가"라서 단위를 바꿔도 결과가 같다.

## 차원의 저주

특성 수가 늘어나면 KNN의 성능은 완만하게가 아니라 급격하게 무너진다. 고차원에서는 "가까운 이웃"이라는 개념 자체가 성립하지 않기 때문이다.

한 변이 1인 초입방체 안에 데이터가 고르게 흩어져 있다고 하자. 전체의 10%를 담는 작은 정육면체를 만들려면 한 변의 길이 $r$이 $r^d = 0.1$을 만족해야 하니, 차원 $d$에 따라 이렇게 된다.

$$r = 0.1^{1/d}$$

| 차원 $d$ | 한 변 $r$ | 각 축에서 차지하는 범위 |
|---|---|---|
| 1 | 0.100 | 10% |
| 2 | 0.316 | 31.6% |
| 10 | 0.794 | 79.4% |
| 100 | 0.977 | 97.7% |

100차원에서 데이터의 10%만 모으려 해도 모든 축의 97.7%를 훑어야 한다. 이건 이웃이 아니라 공간 전체다. 실제로 차원이 올라가면 가장 가까운 점까지의 거리와 가장 먼 점까지의 거리 비율이 1에 수렴한다. 모든 점이 엇비슷하게 멀어지면 다수결에 뽑히는 K개는 사실상 무작위 표본이고, KNN은 동전 던지기에 가까워진다.

대응은 특성 수를 줄이는 쪽이다. PCA 같은 차원 축소로 정보를 압축하거나, 상관이 높고 기여가 없는 변수를 골라내는 특성 선택을 앞단에 둔다. 특성이 수백 개를 넘어가고 줄일 여지가 없다면 애초에 거리에 의존하지 않는 트리 기반 모델로 갈아타는 편이 낫다.

## 다른 분류기와 견주면

| 기준 | KNN | 로지스틱 회귀 | 나이브 베이즈 |
|---|---|---|---|
| 학습 | 저장만 한다 | 반복 최적화 | 통계량 한 번 계산 |
| 예측 | 느리다(전체와 거리 계산) | 빠르다 | 빠르다 |
| 결정 경계 | 비선형 | 선형 | 클래스 분포에서 유도 |
| 스케일링 | 필수 | 권장 | 불필요 |
| 고차원 | 약하다 | 강하다 | 강하다 |

KNN의 진짜 장점은 하나로 좁혀진다. **가정 없이 비선형 경계를 만든다.** 로지스틱 회귀처럼 경계의 모양을 미리 정해두지 않고, 데이터가 놓인 대로 경계가 따라 그려진다. 데이터가 추가되면 저장만 하면 되니 재학습도 없다.

대가는 예측 비용이다. 학습 데이터가 100만 개면 예측 한 번에 100만 번의 거리 계산이 필요하고, 그 100만 개를 계속 메모리에 들고 있어야 한다. KD-Tree나 Ball Tree는 공간을 미리 분할해 탐색 범위를 좁혀 이 비용을 낮춘다. 다만 차원이 커지면 가지치기로 걸러지는 영역이 줄어 트리를 타고 내려가는 비용만 남는다. sklearn의 `algorithm='auto'` 는 이 사정을 그대로 반영해서, 피처가 15개를 넘으면 트리를 만들지 않고 전수 탐색으로 넘어간다.

## 마치며

KNN은 모델을 만들지 않는 모델이다. 학습 단계에서 데이터를 요약하는 대신 원본을 그대로 들고 있다가, 질문을 받는 순간 그 자리에서 답을 조립한다. 덕분에 가정이 거의 없고, 그래서 데이터가 비선형이든 클래스 모양이 이상하든 상관없이 동작한다.

같은 이유로 약점도 정직하게 드러난다. 판단 근거가 거리 하나뿐이므로 거리 계산을 망치는 것은 전부 치명적이다. 단위가 다른 변수를 그대로 넣으면 큰 숫자를 가진 변수가 이웃을 독점하고, 차원이 높아지면 거리 자체가 정보를 잃는다. KNN을 쓸지 말지는 정확도를 재보기 전에 "이 데이터에서 거리가 의미 있는 양인가"로 먼저 갈린다.

다음 글에서는 이웃이 아니라 두 클래스 사이의 여백, 즉 마진을 최대화해 경계를 정하는 서포트 벡터 머신을 다룬다.

## 함께 보면 좋은 글

- [피처 스케일링](/ml/feature-scaling/) : 거리 계산이 무너지지 않도록 값의 범위를 맞추는 방법
- [서포트 벡터 머신](/ml/svm/) : 이웃 대신 마진으로 경계를 정하는 분류기
- [주성분 분석(PCA)](/ml/pca/) : 차원을 줄여 차원의 저주를 완화하는 방법

## 참고자료

- [Scikit-learn: Nearest Neighbors](https://scikit-learn.org/stable/modules/neighbors.html)
- [StatQuest: K-nearest neighbors (YouTube)](https://www.youtube.com/watch?v=HVXime0nQeI)
- [Curse of Dimensionality (Wikipedia)](https://en.wikipedia.org/wiki/Curse_of_dimensionality)
