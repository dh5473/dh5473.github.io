---
date: '2026-01-27'
title: 'K-Fold에서 TimeSeriesSplit까지, 교차 검증 전략 고르기'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 27
tags: ['Cross-Validation', '교차 검증', 'K-Fold', 'Stratified K-Fold', 'Time Series Split', 'GroupKFold', '데이터 누수']
summary: '한 번의 분할로 얻은 점수를 믿을 수 없는 이유부터, K-Fold와 Stratified, TimeSeriesSplit, GroupKFold가 각각 무엇을 지키려고 데이터를 다르게 자르는지까지 정리한다.'
thumbnail: './thumbnail.png'
---

모델을 학습시키고 테스트셋에서 정확도 0.95를 얻었다. 이 숫자를 보고서에 적어도 될까?

데이터를 나누는 방식만 바꿔도 그 숫자는 달라진다. 운 좋게 쉬운 샘플이 테스트셋에 몰릴 수도 있고, 반대로 어려운 이상치만 잔뜩 걸릴 수도 있다. 문제는 어느 쪽이 걸렸는지 알 방법이 없다는 것이다.

교차 검증은 이 문제를 데이터를 여러 번 다르게 나눠서 푼다. 그런데 "다르게 나눈다"는 말에는 생각보다 결정할 게 많다. 무작위로 섞을지, 클래스 비율을 맞출지, 시간 순서를 지킬지에 따라 나오는 숫자의 의미가 달라진다.

## Hold-out 한 번은 운에 맡기는 일이다

가장 간단한 평가는 데이터를 훈련셋과 테스트셋으로 한 번 나누는 Hold-out이다. 빠르고 직관적이지만 점수가 크게 흔들린다.

유방암 데이터 300건에 랜덤 포레스트를 학습시키고, 분할 시드만 바꿔가며 20번 반복해 보면 이렇다.

```python
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

scores = []
for seed in range(20):
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=seed)
    model = RandomForestClassifier(n_estimators=100, random_state=42).fit(X_tr, y_tr)
    scores.append(accuracy_score(y_te, model.predict(X_te)))
```

정확도가 0.900에서 1.000까지, 10%p 폭으로 벌어진다. 같은 데이터, 같은 모델, 같은 코드인데 오직 분할 시드만 달랐다. 어떤 시드를 골랐느냐에 따라 "완벽한 모델"이 되기도 하고 "그저 그런 모델"이 되기도 한다.

같은 데이터에서 5-폴드 교차 검증의 평균을 재면 시드에 따른 폭이 2%p로 줄어든다. 표준편차 기준으로는 0.027에서 0.006으로 약 4배 안정된다. Hold-out은 하나의 분할에서 하나의 점수를 얻지만, K-Fold는 서로 다른 K개의 분할에서 K개를 얻어 평균내기 때문이다.

Hold-out에는 두 번째 문제도 있다. 80/20으로 나누면 모델이 전체의 80%만 학습에 쓰고, 나머지 20%는 평가에만 쓰인다. 데이터가 귀할수록 이 낭비가 아프다.

## 데이터를 자르는 두 가지 모양

K-Fold는 전체를 K조각으로 나눈 뒤, 한 조각씩 돌아가며 검증을 맡기고 나머지로 학습한다. K번 돌면 모든 데이터가 정확히 한 번씩 검증셋이 되고, 매 회차마다 전체의 $\frac{K-1}{K}$ 가 학습에 쓰인다. Hold-out의 두 문제를 한 번에 없앤다.

시간 순서가 있는 데이터에는 이 방식을 쓸 수 없다. 무작위로 섞으면 미래 데이터로 학습해서 과거를 맞히는 상황이 생긴다. TimeSeriesSplit은 훈련 구간을 앞에서부터 누적하고 검증은 항상 그 바로 뒤 구간을 맡긴다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 472" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 K-Fold 도식으로, 5등분한 데이터에서 검증 조각이 회차마다 한 칸씩 오른쪽으로 이동하고 나머지 네 조각이 모두 훈련에 쓰인다. 아래쪽은 TimeSeriesSplit 도식으로, 훈련 구간이 왼쪽부터 한 칸씩 누적되고 검증은 항상 그 바로 오른쪽 한 칸이며, 그보다 뒤쪽 구간은 그 회차에서 쓰이지 않는다.">
<style>
.cv1-tr { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.cv1-va { fill: var(--primary, #0a756c); stroke: none; }
.cv1-un { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.2; stroke-dasharray: 4 4; }
.cv1-trt { fill: var(--text, #1c1917); font-size: 14px; }
.cv1-vat { fill: var(--on-fill, #ffffff); font-size: 14px; font-weight: 600; }
.cv1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.cv1-s { fill: var(--text-muted, #6d6762); font-size: 14px; }
.cv1-ar { stroke: var(--text-muted, #6d6762); stroke-width: 1.3; }
</style>
<defs>
<marker id="cv1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M 0 1 L 9 5 L 0 9 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 위: K-Fold -->
<text class="cv1-t" x="200" y="22" text-anchor="middle">위 · K-Fold (K=5)</text>
<text class="cv1-s" x="200" y="44" text-anchor="middle">무작위로 5등분</text>
<text class="cv1-s" x="56" y="76" text-anchor="end">1회</text>
<rect class="cv1-va" x="62" y="58" width="60" height="26" rx="4"/><text class="cv1-vat" x="92" y="76" text-anchor="middle">검증</text>
<rect class="cv1-tr" x="124.5" y="58" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="76" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="187" y="58" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="76" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="249.5" y="58" width="60" height="26" rx="4"/><text class="cv1-trt" x="279.5" y="76" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="312" y="58" width="60" height="26" rx="4"/><text class="cv1-trt" x="342" y="76" text-anchor="middle">훈련</text>
<text class="cv1-s" x="56" y="108" text-anchor="end">2회</text>
<rect class="cv1-tr" x="62" y="90" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="108" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="124.5" y="90" width="60" height="26" rx="4"/><text class="cv1-vat" x="154.5" y="108" text-anchor="middle">검증</text>
<rect class="cv1-tr" x="187" y="90" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="108" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="249.5" y="90" width="60" height="26" rx="4"/><text class="cv1-trt" x="279.5" y="108" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="312" y="90" width="60" height="26" rx="4"/><text class="cv1-trt" x="342" y="108" text-anchor="middle">훈련</text>
<text class="cv1-s" x="56" y="140" text-anchor="end">3회</text>
<rect class="cv1-tr" x="62" y="122" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="140" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="122" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="140" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="187" y="122" width="60" height="26" rx="4"/><text class="cv1-vat" x="217" y="140" text-anchor="middle">검증</text>
<rect class="cv1-tr" x="249.5" y="122" width="60" height="26" rx="4"/><text class="cv1-trt" x="279.5" y="140" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="312" y="122" width="60" height="26" rx="4"/><text class="cv1-trt" x="342" y="140" text-anchor="middle">훈련</text>
<text class="cv1-s" x="56" y="172" text-anchor="end">4회</text>
<rect class="cv1-tr" x="62" y="154" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="172" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="154" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="172" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="187" y="154" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="172" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="249.5" y="154" width="60" height="26" rx="4"/><text class="cv1-vat" x="279.5" y="172" text-anchor="middle">검증</text>
<rect class="cv1-tr" x="312" y="154" width="60" height="26" rx="4"/><text class="cv1-trt" x="342" y="172" text-anchor="middle">훈련</text>
<text class="cv1-s" x="56" y="204" text-anchor="end">5회</text>
<rect class="cv1-tr" x="62" y="186" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="204" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="186" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="204" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="187" y="186" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="204" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="249.5" y="186" width="60" height="26" rx="4"/><text class="cv1-trt" x="279.5" y="204" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="312" y="186" width="60" height="26" rx="4"/><text class="cv1-vat" x="342" y="204" text-anchor="middle">검증</text>
<!-- 아래: TimeSeriesSplit -->
<text class="cv1-t" x="200" y="252" text-anchor="middle">아래 · TimeSeriesSplit</text>
<text class="cv1-s" x="200" y="274" text-anchor="middle">시간 순서 유지, 4회 분할</text>
<text class="cv1-s" x="56" y="306" text-anchor="end">1회</text>
<rect class="cv1-tr" x="62" y="288" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="306" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="124.5" y="288" width="60" height="26" rx="4"/><text class="cv1-vat" x="154.5" y="306" text-anchor="middle">검증</text>
<rect class="cv1-un" x="187" y="288" width="60" height="26" rx="4"/>
<rect class="cv1-un" x="249.5" y="288" width="60" height="26" rx="4"/>
<rect class="cv1-un" x="312" y="288" width="60" height="26" rx="4"/>
<text class="cv1-s" x="56" y="338" text-anchor="end">2회</text>
<rect class="cv1-tr" x="62" y="320" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="338" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="320" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="338" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="187" y="320" width="60" height="26" rx="4"/><text class="cv1-vat" x="217" y="338" text-anchor="middle">검증</text>
<rect class="cv1-un" x="249.5" y="320" width="60" height="26" rx="4"/>
<rect class="cv1-un" x="312" y="320" width="60" height="26" rx="4"/>
<text class="cv1-s" x="56" y="370" text-anchor="end">3회</text>
<rect class="cv1-tr" x="62" y="352" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="370" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="352" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="370" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="187" y="352" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="370" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="249.5" y="352" width="60" height="26" rx="4"/><text class="cv1-vat" x="279.5" y="370" text-anchor="middle">검증</text>
<rect class="cv1-un" x="312" y="352" width="60" height="26" rx="4"/>
<text class="cv1-s" x="56" y="402" text-anchor="end">4회</text>
<rect class="cv1-tr" x="62" y="384" width="60" height="26" rx="4"/><text class="cv1-trt" x="92" y="402" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="124.5" y="384" width="60" height="26" rx="4"/><text class="cv1-trt" x="154.5" y="402" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="187" y="384" width="60" height="26" rx="4"/><text class="cv1-trt" x="217" y="402" text-anchor="middle">훈련</text>
<rect class="cv1-tr" x="249.5" y="384" width="60" height="26" rx="4"/><text class="cv1-trt" x="279.5" y="402" text-anchor="middle">훈련</text>
<rect class="cv1-va" x="312" y="384" width="60" height="26" rx="4"/><text class="cv1-vat" x="342" y="402" text-anchor="middle">검증</text>
<!-- 시간 축 -->
<text class="cv1-s" x="62" y="428">과거</text>
<line class="cv1-ar" x1="100" y1="424" x2="336" y2="424" marker-end="url(#cv1Arrow)"/>
<text class="cv1-s" x="372" y="428" text-anchor="end">미래</text>
<!-- 범례 -->
<rect class="cv1-tr" x="93" y="446" width="18" height="12" rx="2"/>
<text class="cv1-s" x="117" y="455">훈련</text>
<rect class="cv1-va" x="167" y="446" width="18" height="12" rx="2"/>
<text class="cv1-s" x="191" y="455">검증</text>
<rect class="cv1-un" x="241" y="446" width="18" height="12" rx="2"/>
<text class="cv1-s" x="265" y="455">미사용</text>
</svg>
</div>

두 도식의 차이가 곧 두 전략의 차이다. K-Fold는 모든 조각을 매 회차에 쓰지만, TimeSeriesSplit은 검증 구간보다 뒤에 있는 데이터를 그 회차에서 통째로 버린다. 미래를 보지 않으려면 치러야 하는 대가다. 그래서 초반 회차의 훈련셋은 상당히 작다.

```python
from sklearn.model_selection import TimeSeriesSplit

for f, (tr, va) in enumerate(TimeSeriesSplit(n_splits=5).split(X)):
    print(f"split {f+1}: 훈련 {len(tr)}개 (0~{tr[-1]}), 검증 {len(va)}개 ({va[0]}~{va[-1]})")
```

데이터 100건에 `n_splits=5`를 주면 검증 구간은 매번 16건으로 고정되고, 훈련 구간은 20, 36, 52, 68, 84건으로 늘어난다. 첫 회차는 전체의 20%만 보고 학습한 모델을 평가하는 셈이라 점수가 낮게 나오기 쉽다. 회차별 점수를 그냥 평균내면 이 초반 핸디캡이 섞여 들어간다는 점을 알고 봐야 한다.

## K는 얼마가 좋은가

실무 표준은 K=5 또는 K=10이다. 이 범위가 나온 근거는 양쪽 끝을 보면 분명해진다.

K가 작으면 각 회차의 훈련셋이 작아진다. K=2면 절반만 보고 학습한 모델을 평가하는 것이라, 전체 데이터로 학습했을 때의 실력보다 점수가 낮게 나온다. 성능을 과소평가하는 쪽으로 편향이 생긴다.

K가 커지면 반대 문제가 생긴다. K개 점수의 평균이 안정적이려면 그 점수들이 서로 독립이어야 하는데, K가 커질수록 회차마다의 훈련셋이 거의 같아져서 점수들이 함께 움직인다. 각 점수의 분산을 $\sigma^2$, 점수들 사이의 상관계수를 $\rho$ 라 하면 평균의 분산은 이렇다.

$$\text{Var}\left(\frac{1}{K}\sum_{i=1}^{K} s_i\right) = \frac{\sigma^2}{K} + \frac{K-1}{K}\rho\sigma^2$$

$\rho = 0$ 이면 K를 키운 만큼 $\sigma^2 / K$ 로 곧장 줄지만, $\rho$ 가 붙어 있으면 둘째 항이 $\rho\sigma^2$ 로 수렴해서 더 내려가지 않는다. K를 늘려도 얻는 게 없는데 계산 비용만 K배로 드는 구간이 생긴다는 뜻이다.

| K | 회차별 훈련 비율 | 특징 |
|---|---|---|
| 2 | 50% | 성능을 과소평가한다. 계산은 가장 싸다 |
| 5 | 80% | 기본값으로 삼기 좋다 |
| 10 | 90% | 편향이 더 작지만 비용이 두 배다 |
| N (LOO) | 거의 100% | 훈련셋들이 한 건씩만 다르다. N번 학습해야 한다 |

K를 N까지 올린 것이 Leave-One-Out(LOO)이다. 매번 한 건만 검증에 쓰므로 훈련셋을 최대한 활용하고 결과에 랜덤성도 없다. 대신 데이터가 1만 건이면 모델을 1만 번 학습해야 하고, 훈련셋들이 서로 한 건씩만 다르니 위 식의 $\rho$ 가 1에 가깝다. 데이터가 수십에서 수백 건이고 한 번의 학습이 싼 모델일 때만 값을 한다.

점수를 더 안정시키고 싶으면 K를 키우는 대신 **서로 다른 시드로 K-Fold를 여러 번 반복**하는 게 낫다. 반복마다 폴드 구성이 새로 짜이므로, 서로 덜 겹치는 점수를 더 모으는 셈이다. 앞의 유방암 데이터에서 5-폴드 한 번은 시드에 따라 2%p 흔들렸지만, 5-폴드를 10번 반복한 평균은 0.3%p 안에서 움직인다. 모델 A와 B의 0.01 차이가 진짜인지 판단할 때 이 차이가 결정적이다.

```python
from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_score

rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
scores = cross_val_score(model, X, y, cv=rskf, scoring='f1')
```

## 무작위 분할이 깨뜨리는 것들

기본 K-Fold는 데이터에 아무 구조가 없다고 가정하고 무작위로 자른다. 데이터에 지켜야 할 구조가 있으면 그 가정이 깨지고, 점수는 실전과 무관한 숫자가 된다. 자주 마주치는 세 가지가 있다.

### 클래스 비율

양성이 10%인 데이터를 무작위로 5등분하면 어떤 폴드는 양성이 4%, 다른 폴드는 16%가 될 수 있다. 폴드마다 문제의 난이도가 달라지니 점수의 편차가 커지고, 극단적으로는 소수 클래스가 한 건도 없는 폴드가 생겨 Recall이 정의되지 않는다.

Stratified K-Fold는 각 폴드의 클래스 비율을 전체와 같게 맞춘다. sklearn에서 분류기에 `cv=5`처럼 정수를 넘기면 알아서 Stratified K-Fold가 쓰인다.

```python
from sklearn.model_selection import StratifiedKFold

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
for fold, (tr, va) in enumerate(skf.split(X, y)):
    print(f"fold {fold}: 훈련 양성 {y[tr].mean():.3f}, 검증 양성 {y[va].mean():.3f}")
```

:::warning

**기본값은 `shuffle=False`다**

`KFold`와 `StratifiedKFold` 모두 셔플하지 않는 게 기본이다. 데이터가 어떤 키로 정렬된 채 저장돼 있으면 각 폴드가 연속 구간이 되어, 검증할 때마다 훈련에서 본 적 없는 영역을 외삽하게 된다.

x가 오름차순으로 정렬된 회귀 데이터 100건에서 이걸 재보면 차이가 극적이다. 9차 다항 회귀의 5-폴드 CV MSE가 `shuffle=False`에서 523이 나오는데, `shuffle=True`로 바꾸면 0.094다. 5000배가 넘는 차이가 모델이 아니라 정렬 상태에서 왔다. 시계열이 아니라면 `shuffle=True`를 명시하는 편이 안전하다.

:::

### 시간 순서

주가, 센서 로그, 사용자 이벤트처럼 시간이 붙은 데이터에서 무작위 분할은 미래를 훈련셋에 넣는다. 3월을 예측하는 모델이 4월과 5월 데이터를 보고 학습하는 상황이 되고, 실전에서는 절대 불가능한 조건이므로 점수가 낙관적으로 부풀려진다. 배포 후에 성능이 급락하는 전형적인 원인이다.

시간 축이 있으면 TimeSeriesSplit을 쓴다. 사실상 실전 운영을 그대로 흉내내는 평가다. 모델을 오늘까지의 데이터로 학습해서 내일을 예측하고, 하루가 지나면 그 데이터를 훈련셋에 넣고 다시 학습하는 절차와 같다.

### 그룹 경계

한 환자에게서 나온 검사 기록 여러 건, 한 사용자의 여러 세션, 한 문서에서 잘라낸 여러 문장처럼 같은 출처를 공유하는 샘플들이 있다. 이걸 무작위로 나누면 같은 환자의 기록이 훈련셋과 검증셋에 갈라져 들어간다. 모델은 병을 배우는 대신 그 환자의 특징을 외우고, 점수가 부풀려진다.

GroupKFold는 같은 그룹의 샘플이 절대 갈라지지 않도록 그룹 단위로 폴드를 나눈다.

```python
from sklearn.model_selection import GroupKFold

gkf = GroupKFold(n_splits=5)
scores = cross_val_score(model, X, y, cv=gkf, groups=patient_ids)
```

## 전처리는 폴드 안으로 들어가야 한다

교차 검증에서 가장 흔하고 가장 비싼 실수는 전처리를 폴드 밖에서 하는 것이다.

```python
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)          # 전체 X의 평균과 표준편차
scores = cross_val_score(model, X_scaled, y, cv=5)
```

`fit_transform(X)`가 전체 데이터의 통계량을 계산하는 순간, 검증 폴드에 들어갈 샘플들의 정보가 그 평균과 표준편차에 실려 훈련 폴드로 새어 들어간다. 실전에서는 아직 오지 않은 데이터의 평균을 알 수 없으므로, 이렇게 얻은 점수는 실현 불가능한 조건에서 잰 것이다.

`Pipeline`으로 감싸면 이 문제가 사라진다. `cross_val_score`가 각 폴드에서 `fit`을 호출할 때 파이프라인 전체가 훈련 폴드만으로 학습되고, 검증 폴드에는 `transform`만 적용된다.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('clf', LogisticRegression()),
])
scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
```

이 원칙은 스케일링만의 이야기가 아니다. 결측치 대치, 특성 선택, PCA, 타깃 인코딩, 오버샘플링까지 데이터에서 무언가를 학습하는 모든 단계가 파이프라인 안에 들어가야 한다. 특히 특성 선택은 위험한데, 전체 데이터에서 타깃과 상관 높은 특성을 골라두고 교차 검증을 돌리면 이미 정답을 본 뒤에 시험을 치는 것과 같다.

:::warning

**누수는 조용히 지나간다**

누수가 있어도 에러는 나지 않는다. 점수가 오히려 좋아지니 문제로 보이지도 않는다. "CV에서 0.95였는데 실전에서 0.82가 나온다"는 상황이 생기고 나서야 드러나고, 그때는 이미 그 부풀려진 점수를 근거로 모델과 하이퍼파라미터를 골라둔 뒤다.

:::

## 검증셋과 테스트셋은 다른 물건이다

교차 검증의 검증 폴드는 **선택**을 위한 것이다. 어떤 모델이 나은지, 어떤 하이퍼파라미터가 나은지 비교하는 데 쓴다. 그런데 이 과정에서 검증 점수를 수십 번 들여다보고 가장 높은 것을 고르므로, 최종적으로 고른 설정은 그 검증 데이터에 조금씩 맞춰진다. 후보를 많이 볼수록 심해진다.

그래서 아무 선택에도 쓰지 않은 데이터가 따로 필요하다.

| 조각 | 하는 일 | 몇 번 쓰나 |
|---|---|---|
| 훈련셋 | 모델 파라미터 학습 | 폴드마다 |
| 검증셋 | 모델과 하이퍼파라미터 선택 | 선택이 끝날 때까지 반복 |
| 테스트셋 | 최종 성능 보고 | 딱 한 번 |

실전 순서는 이렇다. 맨 처음에 테스트셋을 떼어내 잠가둔다. 남은 개발셋 안에서만 교차 검증으로 모델과 하이퍼파라미터를 고른다. 결정이 끝나면 개발셋 전체로 최종 모델을 다시 학습시킨다. 마지막에 테스트셋으로 한 번 평가하고, 그 숫자를 보고한다.

```python
X_dev, X_test, y_dev, y_test = train_test_split(X, y, test_size=0.15, random_state=42)

cv_scores = cross_val_score(pipe, X_dev, y_dev, cv=5, scoring='f1')   # 선택
best_model.fit(X_dev, y_dev)                                          # 재학습
test_score = f1_score(y_test, best_model.predict(X_test))             # 보고
```

테스트 점수가 마음에 안 든다고 개발셋으로 돌아가 다른 모델을 고른 뒤 다시 테스트하면, 그 순간 테스트셋도 검증셋이 된다.

## 상황별 선택

| 상황 | 전략 | 이유 |
|---|---|---|
| 일반 분류 | Stratified 5-Fold | 클래스 비율 유지. `cv=5`의 기본값이다 |
| 일반 회귀 | 5-Fold (`shuffle=True`) | 정렬된 데이터의 외삽 함정을 피한다 |
| 불균형 분류 | Stratified 5-Fold | 소수 클래스가 모든 폴드에 들어가도록 보장한다 |
| 시계열 | TimeSeriesSplit | 미래 정보가 훈련에 새지 않는다 |
| 그룹이 있는 데이터 | GroupKFold | 같은 출처가 훈련과 검증으로 갈라지지 않는다 |
| 데이터 100건 미만 | Repeated 10-Fold | 데이터를 최대한 쓰면서 점수를 안정시킨다 |
| 모델 최종 비교 | Repeated Stratified 5-Fold | 작은 성능 차이를 판별할 만큼 안정적이다 |

모델을 여러 개 비교할 때는 전부 **같은 splitter 객체**를 넘겨야 한다. 폴드 구성이 다르면 점수 차이에 모델의 차이와 분할의 차이가 섞여서 어느 쪽이 원인인지 알 수 없게 된다.

## 마치며

교차 검증이 하는 일은 점수를 높이는 게 아니라 점수에 신뢰 구간을 붙이는 것이다. "정확도 0.87"과 "정확도 0.85 ± 0.02"는 정보량이 다르다. 앞의 숫자는 다음에 다시 재면 얼마가 나올지 알려주지 않지만, 뒤의 숫자는 알려준다.

전략을 고르는 기준도 하나로 정리된다. **평가 절차가 실전 배포 상황과 같은 제약을 받고 있는가.** 실전에서 미래를 볼 수 없으면 검증에서도 볼 수 없어야 하고, 실전에서 처음 보는 환자를 진단해야 하면 검증에서도 처음 보는 환자여야 하며, 실전에서 테스트 데이터의 평균을 모르면 스케일러도 그걸 몰라야 한다. Stratified, TimeSeriesSplit, GroupKFold, Pipeline이 서로 달라 보여도 전부 이 한 가지 질문에 대한 답이다.

여기까지 오면 모델의 성능을 믿을 만한 숫자로 잴 수 있게 된다. 다음은 그 숫자를 최대로 만드는 하이퍼파라미터를 찾는 일인데, 탐색은 결국 교차 검증을 수백 번 반복하는 절차라서 지금까지의 선택이 그대로 따라붙는다.

## 함께 보면 좋은 글

- [편향-분산 트레이드오프](/ml/bias-variance/) : 검증 오차가 훈련 오차보다 높은 이유를 세 항으로 분해한다
- [하이퍼파라미터 튜닝](/ml/hyperparameter-tuning/) : 교차 검증 위에서 도는 탐색 전략
- [분류 평가 지표](/ml/classification-metrics/) : 각 폴드에서 무엇을 점수로 삼을지 고르는 법
- [특성 스케일링](/ml/feature-scaling/) : 폴드 안에서 학습시켜야 하는 대표적인 전처리

## 참고자료

- [scikit-learn: Cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html)
- [scikit-learn: Common pitfalls and recommended practices](https://scikit-learn.org/stable/common_pitfalls.html)
- [The Elements of Statistical Learning, Ch. 7.10](https://hastie.su.domains/ElemStatLearn/)
