---
date: '2026-01-10'
title: '나이브 베이즈(Naive Bayes): 베이즈 정리로 분류하는 확률적 접근'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 10
tags: ['Naive Bayes', '나이브 베이즈', '베이즈 정리', '텍스트 분류', '머신러닝']
summary: '베이즈 정리의 직관부터 나이브 가정, Gaussian·Multinomial NB 구현까지. 로지스틱 회귀와의 차이를 코드로 비교한다.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/regularization/)에서 과적합을 막는 규제(Regularization) 기법을 배웠다. Ridge, Lasso, ElasticNet — 모두 가중치를 억제해서 모델 복잡도를 제어하는 방법이었다. 여기까지는 [로지스틱 회귀](/ml/logistic-regression/)를 중심으로 한 **판별적(Discriminative)** 접근이었다. 데이터를 보고 클래스 간 경계를 직접 학습하는 방식이다.

그런데 분류에는 완전히 다른 철학이 있다. 경계를 찾는 대신, **각 클래스가 데이터를 생성할 확률**을 계산하는 것이다. "이 데이터가 클래스 A에서 나왔을 확률은 얼마인가?" — 이게 **생성적(Generative)** 접근이고, 그 대표 모델이 **나이브 베이즈(Naive Bayes)** 다.

---

## 베이즈 정리 복습

나이브 베이즈의 핵심은 **베이즈 정리(Bayes' Theorem)** 다. 고등학교 확률 시간에 봤을 수도 있는 이 공식이, 분류 모델의 근간이 된다.

> **P(A|B) = P(B|A) × P(A) / P(B)**

말로 풀면: "B가 관측된 상태에서 A일 확률은, A인 상태에서 B가 나올 확률에 A의 사전 확률을 곱하고, B의 전체 확률로 나눈 것이다."

추상적이니까 스팸 메일 예시로 구체화해보자. 메일에 "무료"라는 단어가 들어 있을 때, 이 메일이 스팸일 확률을 구하고 싶다.

```
P(스팸 | "무료") = P("무료" | 스팸) × P(스팸) / P("무료")
```

각 항의 의미는 이렇다:

- **P(스팸)** = 전체 메일 중 스팸 비율 = 0.3 (사전확률)
- **P("무료" | 스팸)** = 스팸 메일에서 "무료"가 등장할 확률 = 0.8
- **P("무료")** = 전체 메일에서 "무료"가 등장할 확률 = 0.35

```python
p_spam = 0.3
p_free_given_spam = 0.8
p_free = 0.35

p_spam_given_free = (p_free_given_spam * p_spam) / p_free
print(f"P(스팸 | '무료') = {p_spam_given_free:.4f}")
# P(스팸 | '무료') = 0.6857
```

"무료"라는 단어를 보기 전에는 스팸 확률이 30%였는데, "무료"를 관측한 뒤 68.6%로 뛰었다. 새로운 증거(evidence)가 믿음을 업데이트한 것이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 사전확률 vs 사후확률</strong><br>
  <strong>사전확률(Prior)</strong>: 증거를 보기 전의 믿음. P(스팸) = 0.3<br>
  <strong>사후확률(Posterior)</strong>: 증거를 본 뒤 업데이트된 믿음. P(스팸|"무료") = 0.686<br>
  <strong>우도(Likelihood)</strong>: 해당 클래스에서 증거가 나올 확률. P("무료"|스팸) = 0.8<br>
  베이즈 정리는 <strong>Prior × Likelihood → Posterior</strong>로 믿음을 업데이트하는 프레임워크다.
</div>

---

## 나이브 가정: 왜 "나이브"인가

베이즈 정리 자체는 완벽히 수학적으로 정확하다. 문제는 실전 적용에 있다.

메일 분류를 생각해보자. 메일에 "무료", "이벤트", "당첨"이라는 세 단어가 있을 때 스팸 확률을 구하려면:

```
P(스팸 | "무료", "이벤트", "당첨") = P("무료", "이벤트", "당첨" | 스팸) × P(스팸) / P("무료", "이벤트", "당첨")
```

`P("무료", "이벤트", "당첨" | 스팸)`을 정확히 계산하려면, 이 세 단어가 **동시에** 스팸에서 등장하는 빈도를 알아야 한다. 단어가 3개면 그나마 가능하지만, 실제 메일의 어휘 수는 수만 개다. 모든 단어 조합의 동시 확률을 추정하는 건 데이터가 아무리 많아도 불가능하다.

여기서 "나이브(naive)"한 가정이 등장한다.

> **특성들이 주어진 클래스 안에서 서로 조건부 독립이다.**

```
P(x₁, x₂, ..., xₙ | C) = P(x₁|C) × P(x₂|C) × ... × P(xₙ|C)
```

동시 확률을 각 특성의 개별 확률 곱으로 분해하는 것이다. 이렇게 하면 추정해야 할 파라미터 수가 **기하급수적에서 선형으로** 줄어든다.

```python
# 나이브 가정 적용
p_free_given_spam = 0.8
p_event_given_spam = 0.6
p_win_given_spam = 0.7
p_spam = 0.3

# 결합 확률 = 개별 확률의 곱 (나이브 가정)
likelihood = p_free_given_spam * p_event_given_spam * p_win_given_spam
numerator = likelihood * p_spam

print(f"P('무료','이벤트','당첨' | 스팸) ≈ {likelihood:.4f}")
print(f"분자 = {numerator:.4f}")
# P('무료','이벤트','당첨' | 스팸) ≈ 0.3360
# 분자 = 0.1008
```

현실에서 "무료"와 "이벤트"는 독립이 아니다. 스팸 메일에서 이 두 단어는 같이 등장할 확률이 높다. 독립 가정은 분명히 틀렸다. **그런데 놀랍게도 잘 작동한다.**

왜 그럴까? 분류에서 중요한 건 정확한 확률값이 아니라 **클래스 간 순서**다. P(스팸|x) > P(정상|x)이면 스팸으로 분류하는 것이고, 이 부등호의 방향은 독립 가정이 깨져도 대부분 유지된다. 확률의 절대값은 틀릴 수 있지만, 대소 비교는 맞는 경우가 많다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 독립 가정이 심하게 깨지는 경우</strong><br>
  특성 간 강한 상관관계가 있으면 나이브 베이즈의 성능이 떨어진다. 예를 들어 "키"와 "몸무게"처럼 높은 양의 상관을 갖는 특성 쌍이 많으면, 같은 정보를 중복 계산하게 되어 특정 클래스의 확률이 과대 추정된다. 이런 경우 로지스틱 회귀가 더 나은 선택이다.
</div>

---

## Gaussian Naive Bayes

특성이 연속형 숫자일 때 사용하는 방법이다. 각 클래스 내에서 특성의 분포가 **가우시안(정규분포)** 을 따른다고 가정한다.

```
P(xⱼ | C=k) = (1 / √(2π σₖⱼ²)) × exp(-(xⱼ - μₖⱼ)² / (2σₖⱼ²))
```

클래스 k에서 특성 j의 평균(μₖⱼ)과 분산(σₖⱼ²)만 알면 확률을 계산할 수 있다. 학습이라고 해봐야 **클래스별 평균과 분산을 구하는 것**이 전부다. 경사하강법도, 반복 학습도 없다.

Iris 데이터셋으로 실습해보자.

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report

# 데이터 로드
iris = load_iris()
X_train, X_test, y_train, y_test = train_test_split(
    iris.data, iris.target, test_size=0.3, random_state=42
)

# Gaussian Naive Bayes — 스케일링 불필요
gnb = GaussianNB()
gnb.fit(X_train, y_train)
y_pred = gnb.predict(X_test)

print(f"정확도: {accuracy_score(y_test, y_pred):.4f}")
print(f"\n클래스별 평균:\n{gnb.theta_.round(2)}")
print(f"\n클래스별 분산:\n{gnb.var_.round(2)}")
```

```
정확도: 0.9778

클래스별 평균:
[[4.99 3.39 1.47 0.24]
 [5.94 2.78 4.22 1.31]
 [6.59 2.97 5.58 2.03]]

클래스별 분산:
[[0.11 0.13 0.03 0.01]
 [0.28 0.1  0.21 0.04]
 [0.44 0.1  0.32 0.07]]
```

97.8% 정확도. 3개 클래스, 4개 특성이니까 학습된 파라미터는 평균 12개 + 분산 12개 = **24개**뿐이다. 로지스틱 회귀의 가중치 수와 비교하면 비슷하지만, 학습 과정 자체가 훨씬 단순하다.

### 로지스틱 회귀와 같은 데이터로 비교

```python
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

# 로지스틱 회귀 (스케일링 필수)
pipe_lr = Pipeline([
    ('scaler', StandardScaler()),
    ('clf', LogisticRegression(max_iter=1000))
])
pipe_lr.fit(X_train, y_train)
y_pred_lr = pipe_lr.predict(X_test)

print(f"Gaussian NB 정확도:   {accuracy_score(y_test, y_pred):.4f}")
print(f"Logistic Regression: {accuracy_score(y_test, y_pred_lr):.4f}")
```

```
Gaussian NB 정확도:   0.9778
Logistic Regression: 1.0000
```

Iris처럼 깔끔한 데이터에서는 로지스틱 회귀가 근소하게 앞선다. 하지만 나이브 베이즈는 스케일링도 필요 없고, 학습 시간이 거의 0에 가깝다. 데이터가 커질수록 이 속도 차이가 의미 있어진다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 결정 경계의 차이</strong><br>
  <a href="/ml/decision-boundary/">결정 경계 글</a>에서 본 것처럼, 로지스틱 회귀는 <strong>선형 결정 경계</strong>를 직접 학습한다. 반면 Gaussian NB는 각 클래스의 분포를 학습한 뒤, 그 분포에서 <strong>사후확률이 같아지는 지점</strong>이 결정 경계가 된다. 가우시안 분포의 분산이 클래스마다 다르면, 결정 경계가 <strong>이차 곡선</strong>이 될 수도 있다.
</div>

---

## Multinomial Naive Bayes: 텍스트 분류

나이브 베이즈가 진짜 빛나는 영역은 **텍스트 분류**다. 문서를 단어 빈도(word count) 벡터로 표현하면, 각 단어의 출현 횟수가 **다항분포(Multinomial Distribution)** 를 따른다고 가정할 수 있다.

20 Newsgroups 데이터셋으로 뉴스 기사를 분류해보자.

```python
from sklearn.datasets import fetch_20newsgroups
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score

# 4개 카테고리만 사용
categories = ['alt.atheism', 'sci.space', 'comp.graphics', 'rec.sport.baseball']

train_data = fetch_20newsgroups(subset='train', categories=categories, random_state=42)
test_data = fetch_20newsgroups(subset='test', categories=categories, random_state=42)

# 파이프라인: 단어 벡터화 → Multinomial NB
pipe_mnb = Pipeline([
    ('vectorizer', CountVectorizer(stop_words='english', max_features=10000)),
    ('clf', MultinomialNB(alpha=1.0))
])

pipe_mnb.fit(train_data.data, train_data.target)
y_pred = pipe_mnb.predict(test_data.data)

print(f"정확도: {accuracy_score(test_data.target, y_pred):.4f}")
print(f"학습 데이터: {len(train_data.data)}개")
print(f"테스트 데이터: {len(test_data.data)}개")
print(f"어휘 수: {len(pipe_mnb['vectorizer'].vocabulary_)}개")
```

```
정확도: 0.9335
학습 데이터: 2354개
테스트 데이터: 1568개
어휘 수: 10000개
```

10,000개 단어 특성, 4개 카테고리 — 93% 정확도. `CountVectorizer`가 텍스트를 단어 빈도 벡터로 바꾸고, `MultinomialNB`가 각 카테고리에서 단어가 나올 확률을 학습한다. 전체 학습 시간은 1초도 안 걸린다.

### 어떤 단어가 분류에 기여하는가

```python
import numpy as np

vectorizer = pipe_mnb['vectorizer']
clf = pipe_mnb['clf']
feature_names = vectorizer.get_feature_names_out()

# 각 카테고리에서 가장 영향력 있는 단어 top 5
for i, category in enumerate(categories):
    top_indices = clf.feature_log_prob_[i].argsort()[-5:][::-1]
    top_words = [feature_names[j] for j in top_indices]
    print(f"{category}: {', '.join(top_words)}")
```

```
alt.atheism: god, people, don, think, just
sci.space: space, nasa, orbit, launch, earth
comp.graphics: graphics, image, files, program, computer
rec.sport.baseball: game, team, baseball, year, games
```

직관적이다. "space", "nasa"가 나오면 sci.space, "baseball", "game"이 나오면 rec.sport.baseball. 나이브 베이즈는 각 클래스에서 단어의 출현 확률을 학습하기 때문에, 모델이 **왜 그렇게 분류했는지** 해석하기 쉽다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 라플라스 스무딩(Laplace Smoothing)</strong><br>
  <code>MultinomialNB(alpha=1.0)</code>의 alpha가 라플라스 스무딩 파라미터다. 훈련 데이터에서 한 번도 등장하지 않은 단어가 테스트에서 나타나면, 그 단어의 확률이 0이 되어 전체 확률 곱이 0으로 사라진다. alpha=1.0은 모든 단어에 가상의 1회 출현을 더해서 이 문제를 방지한다. alpha가 클수록 스무딩이 강해지고, 0에 가까울수록 원래 빈도를 그대로 쓴다.
</div>

---

## 로지스틱 회귀 vs 나이브 베이즈

둘 다 분류 모델이지만, 철학이 근본적으로 다르다.

| 기준 | 로지스틱 회귀 | 나이브 베이즈 |
|------|-------------|-------------|
| **접근 방식** | Discriminative (판별적) | Generative (생성적) |
| **학습 대상** | P(y\|x) — 결정 경계를 직접 학습 | P(x\|y) — 클래스별 데이터 분포를 학습 |
| **가정** | 선형 결정 경계 (특성 간 독립 가정 없음) | 특성 간 조건부 독립 |
| **학습 방법** | 경사하강법 (반복 최적화) | 통계량 계산 (평균, 분산, 빈도) |
| **학습 속도** | 느림 (반복 필요) | 매우 빠름 (단일 패스) |
| **데이터 적을 때** | 과적합 위험 | 상대적으로 안정 |
| **데이터 많을 때** | 정확도 우위 | 독립 가정의 한계 |
| **Feature Scaling** | 필수 | 불필요 |
| **텍스트 분류** | 가능하지만 느림 | 매우 적합, 빠름 |

같은 텍스트 분류 데이터에서 두 모델을 비교해보자.

```python
from sklearn.linear_model import LogisticRegression
import time

# Multinomial NB
start = time.time()
pipe_mnb.fit(train_data.data, train_data.target)
nb_time = time.time() - start
nb_acc = accuracy_score(test_data.target, pipe_mnb.predict(test_data.data))

# Logistic Regression
pipe_lr = Pipeline([
    ('vectorizer', CountVectorizer(stop_words='english', max_features=10000)),
    ('clf', LogisticRegression(max_iter=1000, C=1.0))
])

start = time.time()
pipe_lr.fit(train_data.data, train_data.target)
lr_time = time.time() - start
lr_acc = accuracy_score(test_data.target, pipe_lr.predict(test_data.data))

print(f"Multinomial NB  — 정확도: {nb_acc:.4f}, 학습 시간: {nb_time:.4f}초")
print(f"Logistic Reg.   — 정확도: {lr_acc:.4f}, 학습 시간: {lr_time:.4f}초")
```

```
Multinomial NB  — 정확도: 0.9335, 학습 시간: 0.0089초
Logistic Reg.   — 정확도: 0.9503, 학습 시간: 0.4521초
```

로지스틱 회귀가 정확도에서 약간 앞서지만, 학습 시간은 50배 이상 느리다. 데이터가 수백만 건이거나 실시간 분류가 필요하면, 이 속도 차이가 결정적이다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 Discriminative vs Generative</strong><br>
  <strong>Discriminative 모델</strong>은 P(y|x)를 직접 학습한다. 클래스 간 경계에 집중하므로, 데이터가 충분하면 더 정확하다.<br>
  <strong>Generative 모델</strong>은 P(x|y)를 학습한 뒤 베이즈 정리로 P(y|x)를 구한다. 데이터의 생성 과정을 모델링하므로, 적은 데이터에서도 안정적이고 새 클래스 추가가 쉽다.
</div>

---

## 언제 나이브 베이즈를 쓸까

나이브 베이즈가 특히 좋은 선택인 상황이 있다.

**텍스트 분류**: 스팸 필터, 감성 분석, 문서 카테고리 분류. 단어 빈도 기반 분류에서 Multinomial NB는 단순하면서도 강력한 베이스라인이다. 실제로 Gmail의 초기 스팸 필터가 나이브 베이즈 기반이었다.

**실시간 분류**: 학습이 빠르고 예측도 빠르다. 새로운 데이터가 들어올 때마다 모델을 갱신해야 하는 온라인 학습 환경에 적합하다. `partial_fit()` 메서드로 점진적 학습도 가능하다.

**데이터가 적을 때**: 추정할 파라미터가 적기 때문에, 적은 데이터에서도 과적합 없이 합리적인 성능을 낸다. 로지스틱 회귀는 특성 수 대비 데이터가 부족하면 과적합되기 쉽다.

**고차원 특성**: 특성이 수천~수만 개인 텍스트 데이터에서도 잘 동작한다. 차원의 저주를 나이브 가정이 우회하는 셈이다.

반면, 특성 간 상관관계가 강하거나, 정확한 확률 추정이 중요하거나, 충분한 데이터가 있다면 로지스틱 회귀나 트리 기반 모델이 더 나은 선택이다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><strong>베이즈 정리</strong>: Prior × Likelihood → Posterior. 새 증거로 믿음을 업데이트한다</li>
    <li><strong>나이브 가정</strong>: 특성 간 조건부 독립. 틀린 가정이지만 분류 성능은 유지되는 경우가 많다</li>
    <li><strong>Gaussian NB</strong>: 연속형 특성 → 클래스별 평균/분산으로 가우시안 분포 가정</li>
    <li><strong>Multinomial NB</strong>: 단어 빈도 → 텍스트 분류의 강력한 베이스라인</li>
    <li><strong>vs 로지스틱 회귀</strong>: 생성적 vs 판별적. 속도와 단순함 vs 정확도</li>
    <li><strong>사용처</strong>: 텍스트 분류, 실시간 분류, 적은 데이터, 고차원 특성</li>
  </ul>
</div>

---

## 마치며

분류에 확률을 쓰는 방법을 배웠다. 나이브 베이즈는 "틀린 가정으로 좋은 결과를 내는" 독특한 모델이다. 수학적으로 우아하고, 구현이 단순하며, 텍스트 분류에서는 지금도 현역으로 활약한다. 다음 글에서는 확률이 아닌 **거리**로 분류하는 KNN(K-Nearest Neighbors)을 다룬다.

## 참고자료

- [Andrew Ng — Machine Learning Specialization: Naive Bayes (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Scikit-learn — Naive Bayes Documentation](https://scikit-learn.org/stable/modules/naive_bayes.html)
- [Stanford CS229 — Generative Learning Algorithms](https://cs229.stanford.edu/main_notes.pdf)
- [A Practical Explanation of Naive Bayes (MonkeyLearn)](https://monkeylearn.com/blog/practical-explanation-naive-bayes-classifier/)
