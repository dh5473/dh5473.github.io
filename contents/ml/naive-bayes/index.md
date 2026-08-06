---
date: '2026-01-10'
title: '베이즈 정리로 분류하는 나이브 베이즈(Naive Bayes)'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 10
tags: ['Naive Bayes', '나이브 베이즈', '베이즈 정리', '조건부 독립', '텍스트 분류', '머신러닝']
summary: '조건부 독립이라는 명백히 틀린 가정으로 좋은 분류 성능을 내는 나이브 베이즈. 가정이 없앤 계산량, Gaussian과 Multinomial의 차이, 로지스틱 회귀와 갈리는 지점을 정리한다.'
thumbnail: './thumbnail.png'
---

분류 모델은 크게 두 갈래다. 로지스틱 회귀나 SVM은 클래스 사이의 경계를 직접 그린다. 데이터가 어떻게 생겼는지는 관심 없고 어디서 갈리는지만 배운다. **판별적(Discriminative)** 접근이다.

반대편에는 각 클래스가 어떤 데이터를 만들어내는지를 배우는 **생성적(Generative)** 접근이 있다. 스팸 메일은 어떤 단어를 쓰는지, 정상 메일은 어떤 단어를 쓰는지를 각각 익혀둔 뒤, 새 메일을 보고 "어느 쪽이 이걸 만들었을 가능성이 큰가"를 되묻는다. **나이브 베이즈(Naive Bayes)** 가 그 대표다.

## 베이즈 정리가 하는 일

$$P(y \mid x) = \frac{P(x \mid y)\,P(y)}{P(x)}$$

왼쪽은 우리가 알고 싶은 것이고, 오른쪽은 데이터에서 셀 수 있는 것들이다. 스팸 분류로 옮겨보자. $S$를 "스팸이다", $w$를 "본문에 '무료'가 있다"로 두면 이렇게 읽힌다.

- $P(S) = 0.3$: 전체 메일 중 스팸 비율. 아직 본문을 보지 않았을 때의 믿음이라 **사전확률(Prior)** 이라 부른다
- $P(w \mid S) = 0.8$: 스팸 메일에 "무료"가 등장할 확률. 스팸 폴더만 세면 나온다. **우도(Likelihood)** 다
- $P(w) = 0.35$: 전체 메일에서 "무료"가 등장할 확률

$$P(S \mid w) = \frac{0.8 \times 0.3}{0.35} \approx 0.686$$

"무료"라는 단어 하나를 보기 전에는 30%였던 스팸 확률이 68.6%로 올라간다. 이게 **사후확률(Posterior)** 이고, 증거를 하나씩 볼 때마다 믿음을 갱신하는 이 절차가 베이즈 정리가 하는 일의 전부다.

## 나이브 가정은 무엇을 줄이는가

문제는 단어가 하나일 때 성립하던 계산이 여러 개가 되는 순간 무너진다는 데 있다. "무료", "이벤트", "당첨"이 함께 있을 때의 스팸 확률을 구하려면 $P(\text{무료}, \text{이벤트}, \text{당첨} \mid S)$, 즉 세 단어가 **동시에** 나타날 확률이 필요하다.

이 값을 데이터에서 직접 세려면 세 단어의 등장 여부 조합 $2^3 = 8$가지를 전부 관측해야 한다. 어휘가 수만 개인 실제 메일에서 이 표를 채우는 것은 데이터를 아무리 모아도 불가능하다.

여기서 "나이브(naive)"한 가정이 들어온다. **클래스가 정해지고 나면 특성들이 서로 독립이다.**

$$P(x \mid y) = \prod_{i=1}^{n} P(x_i \mid y)$$

동시 확률을 개별 확률의 곱으로 쪼개는 것이다. 그러면 세어야 할 값은 조합 표 전체가 아니라 단어 하나하나의 등장 확률로 줄어든다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="가정이 없으면 세 단어의 결합 확률표 여덟 칸을 모두 추정해야 하지만 조건부 독립을 가정하면 단어별 확률 세 개만 추정하면 된다는 것을 보여주는 그림">
<defs>
<marker id="nb1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<style>
.nb1-cell { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.nb1-box { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.8; }
.nb1-h { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.nb1-t { font-size: 15px; fill: var(--text, #1c1917); }
.nb1-ok { font-size: 15px; fill: var(--text-success, #107836); }
.nb1-s { font-size: 14px; fill: var(--text-muted, #6d6762); }
</style>
<!-- 위 : 가정 없음 -->
<text x="200" y="26" text-anchor="middle" class="nb1-h">가정 없음</text>
<text x="200" y="46" text-anchor="middle" class="nb1-s">세 단어의 결합 확률표</text>
<rect x="45" y="58" width="70" height="36" rx="4" class="nb1-cell"/><rect x="125" y="58" width="70" height="36" rx="4" class="nb1-cell"/><rect x="205" y="58" width="70" height="36" rx="4" class="nb1-cell"/><rect x="285" y="58" width="70" height="36" rx="4" class="nb1-cell"/>
<text x="80" y="81" text-anchor="middle" class="nb1-t">000</text><text x="160" y="81" text-anchor="middle" class="nb1-t">001</text><text x="240" y="81" text-anchor="middle" class="nb1-t">010</text><text x="320" y="81" text-anchor="middle" class="nb1-t">011</text>
<rect x="45" y="104" width="70" height="36" rx="4" class="nb1-cell"/><rect x="125" y="104" width="70" height="36" rx="4" class="nb1-cell"/><rect x="205" y="104" width="70" height="36" rx="4" class="nb1-cell"/><rect x="285" y="104" width="70" height="36" rx="4" class="nb1-cell"/>
<text x="80" y="127" text-anchor="middle" class="nb1-t">100</text><text x="160" y="127" text-anchor="middle" class="nb1-t">101</text><text x="240" y="127" text-anchor="middle" class="nb1-t">110</text><text x="320" y="127" text-anchor="middle" class="nb1-t">111</text>
<text x="200" y="162" text-anchor="middle" class="nb1-t">추정 대상 8칸</text>
<text x="200" y="182" text-anchor="middle" class="nb1-s">칸 = (무료, 이벤트, 당첨) 출현 조합</text>
<line x1="200" y1="196" x2="200" y2="226" stroke="var(--text-muted, #6d6762)" stroke-width="2" marker-end="url(#nb1Arrow)"/>
<!-- 아래 : 조건부 독립 가정 -->
<text x="200" y="252" text-anchor="middle" class="nb1-h">조건부 독립 가정</text>
<text x="200" y="270" text-anchor="middle" class="nb1-s">단어별 확률의 곱</text>
<rect x="30" y="284" width="96" height="42" rx="6" class="nb1-box"/><rect x="152" y="284" width="96" height="42" rx="6" class="nb1-box"/><rect x="274" y="284" width="96" height="42" rx="6" class="nb1-box"/>
<text x="78" y="311" text-anchor="middle" class="nb1-t">P(무료)</text><text x="200" y="311" text-anchor="middle" class="nb1-t">P(이벤트)</text><text x="322" y="311" text-anchor="middle" class="nb1-t">P(당첨)</text>
<text x="139" y="311" text-anchor="middle" class="nb1-t">×</text><text x="261" y="311" text-anchor="middle" class="nb1-t">×</text>
<text x="200" y="348" text-anchor="middle" class="nb1-ok">추정 대상 3칸</text>
<text x="200" y="378" text-anchor="middle" class="nb1-t">특성 n개 : 2ⁿ칸 → n칸</text>
</svg>
</div>

줄어드는 폭은 특성이 늘어날수록 벌어진다. 이진 특성 $n$개를 클래스마다 추정한다고 하면 이렇다.

| 이진 특성 수 | 결합 확률표 칸 수 | 나이브 가정 |
|---|---|---|
| 3 | 8 | 3 |
| 10 | 1,024 | 10 |
| 20 | 1,048,576 | 20 |

지수적으로 늘어나던 것이 선형이 된다. 최종 분류 규칙도 곱셈 하나로 정리된다. 분모 $P(x)$는 모든 클래스에서 같으므로 크기를 비교할 때는 떼어낸다.

$$\hat{y} = \arg\max_{k} \; P(y=k) \prod_{i=1}^{n} P(x_i \mid y=k)$$

## 왜 틀린 가정이 통하는가

스팸 메일에서 "무료"와 "이벤트"는 당연히 함께 등장한다. 독립 가정은 틀렸다. 그런데도 분류 성능은 잘 나온다.

이유는 분류가 확률값 자체를 쓰지 않기 때문이다. 필요한 것은 $P(S \mid x)$와 $P(\neg S \mid x)$ 중 어느 쪽이 큰지, 부등호의 방향 하나뿐이다. 상관된 특성을 독립으로 취급하면 같은 정보가 여러 번 곱해져 확률값이 한쪽으로 부풀지만, 그 부풀림은 대체로 두 클래스에서 비슷한 방향으로 일어나 순위를 뒤집지 못한다. 그래서 나이브 베이즈가 출력하는 확률값은 0.999처럼 극단으로 쏠려 있어 그대로 믿을 것이 못 되지만, 어느 클래스가 이겼는지는 믿을 만하다.

:::warning

**확률값이 필요하면 다른 모델을 쓴다**

"스팸일 확률 82%"처럼 수치 자체를 사용자에게 보여주거나 임계값을 세밀하게 조정해야 한다면 나이브 베이즈는 맞지 않는다. 특성 간 상관이 강할수록 확률은 0이나 1 쪽으로 더 밀린다. 이 경우 로지스틱 회귀가 낫다.

:::

## 연속형 특성과 Gaussian NB

$P(x_i \mid y)$를 실제로 어떻게 계산하느냐는 특성의 종류에 달렸다. 특성이 연속형 숫자라면 각 클래스 안에서 그 특성이 정규분포를 따른다고 가정한다. **Gaussian Naive Bayes**다.

$$P(x_j \mid y=k) = \frac{1}{\sqrt{2\pi\sigma_{kj}^2}} \exp\left(-\frac{(x_j - \mu_{kj})^2}{2\sigma_{kj}^2}\right)$$

클래스 $k$에서 특성 $j$의 평균 $\mu_{kj}$와 분산 $\sigma_{kj}^2$만 있으면 확률이 나온다. 학습이라고 부를 것은 클래스별로 평균과 분산을 구하는 계산 한 번이 전부다. 경사하강법도 반복도 없다.

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB

X_train, X_test, y_train, y_test = train_test_split(
    *load_iris(return_X_y=True), test_size=0.3, random_state=42
)

gnb = GaussianNB().fit(X_train, y_train)
print(f"정확도: {gnb.score(X_test, y_test):.4f}")
print(gnb.theta_.round(2))   # 클래스별 특성 평균
```

```text
정확도: 0.9778
[[4.96 3.38 1.46 0.25]
 [5.86 2.72 4.21 1.3 ]
 [6.56 2.99 5.55 2.01]]
```

3개 클래스에 4개 특성이니 학습된 값은 평균 12개와 분산 12개, 총 24개다. 스케일링도 필요 없다. 각 특성이 자기 클래스 안에서 자기 단위로 정규화되므로 단위가 다른 변수를 섞어 넣어도 상관없다.

이 방식이 만드는 결정 경계는 선형이 아니다. 두 클래스의 사후확률이 같아지는 지점을 이으면 경계가 되는데, 클래스마다 분산이 다르면 그 자취가 이차 곡선으로 휜다. 분산이 모든 클래스에서 같을 때만 경계가 직선이 된다.

## 단어 빈도와 Multinomial NB

나이브 베이즈가 실제로 가장 많이 쓰이는 곳은 텍스트다. 문서를 단어별 등장 횟수 벡터로 바꾸면 그 횟수가 클래스별 다항분포에서 나왔다고 볼 수 있고, 이때 쓰는 것이 **Multinomial Naive Bayes**다. 특성이 수만 개여도 각 단어의 클래스별 등장 확률을 세기만 하면 되니 어휘가 커져도 부담이 늘지 않는다.

20 Newsgroups에서 네 개 카테고리를 골라 분류해보자. 원본 문서에는 헤더와 인용문에 카테고리 이름이 그대로 박혀 있어서, `remove`로 걷어내지 않으면 모델이 본문이 아니라 메타데이터를 외운다.

```python
from sklearn.datasets import fetch_20newsgroups
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

categories = ['alt.atheism', 'comp.graphics', 'rec.sport.baseball', 'sci.space']
drop = ('headers', 'footers', 'quotes')
train = fetch_20newsgroups(subset='train', categories=categories, remove=drop)
test = fetch_20newsgroups(subset='test', categories=categories, remove=drop)

pipe = Pipeline([
    ('vect', CountVectorizer(stop_words='english', max_features=10000)),
    ('clf', MultinomialNB(alpha=1.0)),
])
pipe.fit(train.data, train.target)
print(f"정확도: {pipe.score(test.data, test.target):.4f}")

names = pipe['vect'].get_feature_names_out()
for i, cat in enumerate(train.target_names):
    top = pipe['clf'].feature_log_prob_[i].argsort()[-5:][::-1]
    print(f"{cat:22s} {', '.join(names[j] for j in top)}")
```

```text
정확도: 0.8739
alt.atheism            god, people, don, think, just
comp.graphics          image, graphics, edu, jpeg, file
rec.sport.baseball     year, game, good, team, think
sci.space              space, nasa, launch, like, earth
```

학습 문서 2,254개, 어휘 10,000개로 87.4%다. 같은 파이프라인에서 분류기만 로지스틱 회귀로 바꾸면 82.0%로 오히려 떨어진다. 문서 수보다 특성 수가 훨씬 많은 상황은 판별적 모델에게 불리하고, 특성마다 독립적으로 빈도만 세는 나이브 베이즈에게 유리하다.

부수적으로 얻는 것이 해석이다. `feature_log_prob_`은 클래스별 단어 확률을 그대로 담고 있어서, 모델이 무엇을 근거로 삼았는지 표로 뽑아볼 수 있다. sci.space가 space와 nasa에, comp.graphics가 image와 jpeg에 기대고 있다는 사실이 학습된 파라미터 안에 그냥 들어 있다.

:::info

**라플라스 스무딩과 alpha**

훈련 데이터에 한 번도 없던 단어가 테스트 문서에 나오면 그 단어의 확률이 0이 되고, 곱셈이므로 문서 전체의 확률이 0으로 사라진다. `MultinomialNB(alpha=1.0)`의 alpha는 모든 단어에 가상의 등장 횟수를 더해 이 소멸을 막는다. alpha가 클수록 모든 단어의 확률이 균등해지고, 0에 가까울수록 관측 빈도를 그대로 쓴다.

:::

## 로지스틱 회귀와 갈리는 지점

| 기준 | 로지스틱 회귀 | 나이브 베이즈 |
|---|---|---|
| 학습 대상 | $P(y \mid x)$, 경계를 직접 | $P(x \mid y)$, 클래스별 분포를 |
| 가정 | 선형 경계 | 특성 간 조건부 독립 |
| 학습 방법 | 반복 최적화 | 통계량 한 번 계산 |
| 데이터가 적을 때 | 과적합 위험 | 상대적으로 안정 |
| 데이터가 많을 때 | 정확도 우위 | 독립 가정이 한계 |
| 스케일링 | 필수 | 불필요 |
| 확률값 신뢰도 | 쓸 만하다 | 극단으로 쏠린다 |

가장 자주 갈리는 축은 데이터 양이다. 판별적 모델은 경계를 데이터에서 통째로 배워야 하므로 표본이 적으면 흔들린다. 나이브 베이즈는 독립 가정이 미리 구조를 정해준 덕에 추정할 값이 적고, 그만큼 적은 데이터에서 덜 흔들린다. 표본이 늘어나면 그 구조가 반대로 족쇄가 되어 로지스틱 회귀에 추월당한다. 틀린 가정으로 얻은 안정성은 데이터가 부족할 때만 이득이다.

## 마치며

나이브 베이즈는 명백히 틀린 가정 위에 서 있다. 단어들이 서로 무관하게 등장한다는 전제는 어떤 실제 문서에서도 성립하지 않는다. 그럼에도 이 모델이 살아남은 이유는, 분류라는 작업이 확률의 정확한 값을 요구하지 않기 때문이다. 필요한 건 순위뿐이고, 틀린 가정은 확률을 왜곡하되 순위는 대체로 보존한다.

그래서 이 모델을 쓸지 판단하는 기준도 정확도표가 아니라 용도다. 어느 클래스인지만 알면 되는 자리, 특성 수가 문서 수보다 많은 자리, 모델을 자주 새로 만들어야 하는 자리에서는 여전히 가장 먼저 시도해볼 베이스라인이다. 반대로 출력된 확률값 자체를 쓰거나 특성 간 상관이 결정적인 문제라면 다른 모델을 봐야 한다.

다음 글에서는 확률이 아니라 거리로 분류하는 K-최근접 이웃을 다룬다.

## 함께 보면 좋은 글

- [로지스틱 회귀](/ml/logistic-regression/) : 경계를 직접 학습하는 판별적 접근의 기본형
- [결정 경계](/ml/decision-boundary/) : 모델이 만드는 경계의 모양을 비교해 보는 글
- [K-최근접 이웃](/ml/knn/) : 확률 대신 거리로 같은 문제를 푸는 방법

## 참고자료

- [Scikit-learn: Naive Bayes](https://scikit-learn.org/stable/modules/naive_bayes.html)
- [Stanford CS229: Generative Learning Algorithms](https://cs229.stanford.edu/main_notes.pdf)
- [Sahami et al., A Bayesian Approach to Filtering Junk E-Mail (1998)](https://www.aaai.org/Papers/Workshops/1998/WS-98-05/WS98-05-009.pdf)
