---
date: '2026-01-31'
title: 'StandardScaler와 MinMaxScaler, 피처 스케일링은 무엇을 기준으로 고르나'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 31
tags: ['Feature Scaling', '피처 스케일링', 'StandardScaler', 'MinMaxScaler', 'RobustScaler', 'MaxAbsScaler', '데이터 누수', '머신러닝']
summary: '스케일이 어긋나면 경사 하강과 거리 계산이 어떻게 망가지는지, StandardScaler·MinMaxScaler·RobustScaler·MaxAbsScaler가 각각 무엇을 기준으로 삼는지 정리한다.'
thumbnail: './thumbnail.png'
---

나이는 0~100, 연봉은 2,000만~2억, 클릭률은 0.001~0.05. 이 셋을 그대로 한 모델에 넣으면 연봉이 나머지 둘을 덮어버린다. 연봉이 더 중요한 피처여서가 아니라 단지 숫자의 자릿수가 커서다. 피처마다 제각각인 값의 범위를 비슷하게 맞추는 작업이 **피처 스케일링(Feature Scaling)** 이다.

---

## 스케일이 어긋나면 무엇이 망가지나

### 경사 하강법이 지그재그로 돈다

경사 하강법은 각 가중치를 그 방향의 그래디언트만큼 움직인다. 그런데 어떤 가중치의 그래디언트는 짝지어진 피처 값에 비례한다. 연봉처럼 큰 값을 가진 피처의 가중치는 그래디언트가 크고, 클릭률처럼 작은 값을 가진 피처의 가중치는 그래디언트가 작다.

그 결과 비용 함수의 등고선이 한쪽으로 심하게 늘어난 타원이 된다. 학습률은 하나뿐인데 방향마다 적정 보폭이 다르니, 좁은 축에서는 매번 반대편으로 튕겨 나가고 넓은 축에서는 거의 나아가지 못한다. 최저점까지 진동하며 수백 스텝을 쓰게 된다. 스케일을 맞추면 등고선이 원에 가까워지고 어느 방향으로 가든 같은 보폭이 맞아떨어지니, 훨씬 적은 스텝으로 도착한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 480" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스케일링 전에는 비용 함수 등고선이 납작한 타원이라 경사 하강 경로가 지그재그로 진동하고, 표준화 후에는 등고선이 원에 가까워져 최저점까지 거의 직선으로 내려간다">
<defs>
<marker id="fs1ArrowA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent, #9d5604)"/>
</marker>
<marker id="fs1ArrowB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<!-- 위 패널: 스케일링 전 -->
<text x="200" y="32" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">위: 스케일링 전</text>
<text x="200" y="53" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">납작한 타원 등고선</text>
<ellipse cx="190" cy="148" rx="90" ry="34" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<ellipse cx="190" cy="148" rx="66" ry="25" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<ellipse cx="190" cy="148" rx="42" ry="16" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<ellipse cx="190" cy="148" rx="20" ry="7" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<polyline points="70,180 84,120 100,172 116,126 132,166 146,132 160,159 172,140 182,152 190,148" fill="none" stroke="var(--accent, #9d5604)" stroke-width="2" marker-end="url(#fs1ArrowA)"/>
<circle cx="190" cy="148" r="4" fill="var(--text, #1c1917)"/>
<text x="125" y="106" text-anchor="middle" font-size="14" fill="var(--accent, #9d5604)">지그재그 진동</text>
<text x="70" y="198" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">시작</text>
<text x="290" y="153" font-size="14" fill="var(--text, #1c1917)">최저점</text>
<!-- 구분선 -->
<line x1="40" y1="240" x2="360" y2="240" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널: 표준화 후 -->
<text x="200" y="274" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">아래: 표준화 후</text>
<text x="200" y="295" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">원에 가까운 등고선</text>
<circle cx="190" cy="390" r="58" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<circle cx="190" cy="390" r="43" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<circle cx="190" cy="390" r="28" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<circle cx="190" cy="390" r="13" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45"/>
<polyline points="110,442 135,428 158,414 175,401 190,390" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2" marker-end="url(#fs1ArrowB)"/>
<circle cx="190" cy="390" r="4" fill="var(--text, #1c1917)"/>
<text x="258" y="395" font-size="14" fill="var(--text, #1c1917)">최저점</text>
<text x="110" y="466" text-anchor="middle" font-size="14" fill="var(--primary, #0a756c)">직선 경로</text>
</svg>
</div>

### 거리 기반 모델이 왜곡된다

KNN이나 SVM처럼 데이터 포인트 사이의 거리를 재는 모델은 스케일의 영향을 그대로 받는다. 나이 25세에 연봉 3,000만 원인 사람과 나이 30세에 연봉 3,010만 원인 사람의 유클리드 거리를 계산해보자.

$$d = \sqrt{(30-25)^2 + (30{,}100{,}000 - 30{,}000{,}000)^2} = \sqrt{25 + 10^{10}} \approx 100{,}000$$

나이 차이 5가 만드는 기여는 25인데 연봉 차이가 만드는 기여는 100억이다. 나이는 계산에서 사실상 사라진다. 스케일링을 하지 않은 KNN은 이름만 KNN이지 **연봉 하나로 이웃을 찾는** 모델이다.

### 신경망의 학습이 불안정해진다

신경망은 각 층에서 입력과 가중치를 곱해 다음 층으로 넘긴다. 입력 스케일이 크면 곱한 결과도 커지고, Sigmoid나 Tanh처럼 출력 범위가 막혀 있는 활성화 함수에서는 그 값이 포화 구간으로 밀려난다. 포화 구간의 기울기는 0에 가까우니 그래디언트가 소실되고 학습이 멈춘다.

---

## 트리 모델에는 스케일링이 필요 없다

결정 트리, 랜덤 포레스트, XGBoost, LightGBM은 스케일링을 하지 않아도 된다. 트리는 거리나 크기를 계산하지 않고 **분할 기준값**만 찾기 때문이다. "연봉 > 5,000만 원인가?"라는 질문의 답은 연봉을 만 원 단위로 적든 억 원 단위로 적든 바뀌지 않는다. 단조 변환은 값의 순서를 보존하고, 트리가 보는 것은 순서뿐이다.

스케일링을 적용해도 성능이 나빠지지는 않는다. 다만 아무 효과가 없고, 분할 기준값과 피처 중요도를 원본 단위로 읽을 수 없게 되니 해석만 불편해진다.

---

## StandardScaler

각 피처의 평균을 0, 표준편차를 1로 맞춘다. 가장 먼저 손이 가는 기본값이다.

$$z = \frac{x - \mu}{\sigma}$$

변환 후에도 원래 분포의 **모양**은 그대로다. 정규분포였으면 정규분포로, 오른쪽으로 치우쳐 있었으면 치우친 채로 위치와 폭만 바뀐다.

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

로지스틱 회귀, SVM, 신경망처럼 경사 하강법으로 학습하거나 규제를 거는 모델에서 무난하게 잘 맞는다.

한계는 이상치다. 평균과 표준편차는 모든 관측치를 다 반영하므로 극단값 하나가 두 통계량을 통째로 끌고 간다.

```text
[1, 2, 3, 4, 5, 1000]
평균 169.2, 표준편차 371.6
→ [-0.45, -0.45, -0.45, -0.44, -0.44, 2.24]
```

1과 5의 차이가 0.01로 뭉개졌다. 이상치 하나 때문에 정상 데이터의 분별력이 사라진 것이다.

---

## MinMaxScaler

최솟값을 0, 최댓값을 1로 보내고 나머지를 그 사이에 선형으로 배치한다.

$$x_{\text{scaled}} = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$$

```python
from sklearn.preprocessing import MinMaxScaler

scaler = MinMaxScaler()                      # 기본 (0, 1)
# scaler = MinMaxScaler(feature_range=(-1, 1))
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

값의 범위가 물리적으로 정해져 있을 때 유용하다. 픽셀 값을 0~255에서 0~1로 옮기거나, 0~100이 보장된 센서 값을 다룰 때가 그렇다.

이상치에는 StandardScaler보다도 취약하다. 평균은 극단값을 다른 값들과 나눠 가지지만, 최댓값은 극단값 그 자체이기 때문이다.

```text
[1, 2, 3, 4, 5, 1000]
min 1, max 1000
→ [0.000, 0.001, 0.002, 0.003, 0.004, 1.000]
```

또 하나, 새 데이터가 학습 때 본 범위를 벗어나면 0~1 밖의 값이 나온다. `MinMaxScaler(clip=True)`로 잘라낼 수 있지만 잘린 만큼은 정보가 사라진다.

---

## RobustScaler

중앙값과 사분위 범위(IQR)를 쓴다. 둘 다 값의 **순위**에 기반한 통계량이라 극단값이 몇 개 섞여도 흔들리지 않는다.

$$x_{\text{scaled}} = \frac{x - \text{median}}{\text{IQR}}, \qquad \text{IQR} = Q_3 - Q_1$$

```text
[1, 2, 3, 4, 5, 1000]
중앙값 3.5, IQR 2.5
→ [-1.0, -0.6, -0.2, 0.2, 0.6, 398.6]
```

같은 데이터인데 정상 구간 1~5의 간격이 균등하게 살아 있다. 금융 거래액이나 센서 오측정처럼 극단값을 지우기 곤란한 데이터에서 첫 번째 선택지가 된다.

:::warning

**RobustScaler는 이상치를 제거하지 않는다**

이상치에 강하다는 말은 이상치가 스케일링 기준값에 영향을 주지 않는다는 뜻이다. 위 예에서 1000은 변환 후에도 398.6이라는 극단값으로 남아 있다. 이상치 자체를 없애려면 별도의 처리가 필요하다.

:::

---

## MaxAbsScaler

각 피처를 절댓값 최대치로 나눈다. 결과는 [-1, 1] 범위에 들어간다.

$$x_{\text{scaled}} = \frac{x}{\max(|x|)}$$

이 스케일러의 존재 이유는 **0을 0으로 남긴다**는 점 하나다. StandardScaler는 모든 값에서 평균을 빼므로 0이던 원소가 `-μ`가 되고, MinMaxScaler도 최솟값이 0이 아니면 마찬가지로 0을 옮긴다. TF-IDF 벡터나 원-핫 인코딩 결과처럼 원소의 99%가 0인 희소 행렬에서는 이게 치명적이다. 저장하지 않던 0들이 전부 실제 값이 되면서 메모리가 폭증한다.

MaxAbsScaler는 곱셈만 하니 0은 계속 0이고 희소 구조가 유지된다.

```python
from sklearn.preprocessing import MaxAbsScaler

scaler = MaxAbsScaler()
X_train_scaled = scaler.fit_transform(X_train)   # 희소 행렬을 그대로 받는다
X_test_scaled = scaler.transform(X_test)
```

---

## 스케일링 하나로 정확도가 얼마나 바뀌나

sklearn의 Wine 데이터셋은 피처 스케일이 대놓고 제각각이다. proline은 278~1,547인데 hue는 0.48~1.71로, 자릿수가 세 개 차이 난다. 여기에 k=5짜리 KNN을 그대로 돌린 뒤 스케일러만 바꿔봤다.

```python
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
from sklearn.metrics import accuracy_score

wine = load_wine()
X_train, X_test, y_train, y_test = train_test_split(
    wine.data, wine.target, test_size=0.3, random_state=42
)

for name, scaler in [('없음', None), ('Standard', StandardScaler()),
                     ('MinMax', MinMaxScaler()), ('Robust', RobustScaler())]:
    if scaler is None:
        X_tr, X_te = X_train, X_test
    else:
        X_tr = scaler.fit_transform(X_train)
        X_te = scaler.transform(X_test)
    knn = KNeighborsClassifier(n_neighbors=5).fit(X_tr, y_train)
    print(name, round(accuracy_score(y_test, knn.predict(X_te)), 4))
```

```text
없음      0.7407
Standard  0.9630
MinMax    0.9444
Robust    0.9444
```

모델도 그대로, k도 그대로, 바뀐 것은 전처리 두 줄뿐인데 정확도가 0.74에서 0.96으로 올라간다. 스케일링 없이 돌린 KNN은 proline 하나로 이웃을 고르고 있었던 셈이다.

---

## 어떤 스케일러를 고를까

| 스케일러 | 변환 기준 | 결과 범위 | 이상치 민감도 | 희소 행렬 | 주요 용도 |
|---|---|---|:---:|:---:|---|
| StandardScaler | 평균, 표준편차 | 제한 없음 | 높음 | X | 범용 기본값 |
| MinMaxScaler | 최솟값, 최댓값 | [0, 1] | 매우 높음 | X | 이미지, 범위가 고정된 값 |
| RobustScaler | 중앙값, IQR | 제한 없음 | **낮음** | X | 이상치가 섞인 데이터 |
| MaxAbsScaler | 절댓값 최댓값 | [-1, 1] | 높음 | **O** | TF-IDF 등 희소 데이터 |

고민되면 StandardScaler로 시작하고, 이상치가 보이면 RobustScaler, 희소 행렬이면 MaxAbsScaler로 옮기면 된다.

모델별로는 스케일링이 아예 필요 없는 쪽과 없으면 망가지는 쪽이 갈린다.

| 모델 | 스케일링 | 이유 |
|---|:---:|---|
| KNN, SVM | 필수 | 거리 계산에 값 크기가 직접 들어간다 |
| 신경망 | 필수 | 활성화 함수 포화, 그래디언트 소실 |
| 선형 회귀, 로지스틱 회귀 | 권장 | 경사 하강 수렴 속도와 규제의 공정성 |
| 결정 트리, 랜덤 포레스트, XGBoost, LightGBM | 불필요 | 분할 기준은 순서만 본다 |
| 나이브 베이즈 | 불필요 | 확률 기반이라 거리를 쓰지 않는다 |

:::info

**규제를 쓴다면 스케일링은 선택이 아니다**

L1과 L2 규제는 모든 가중치에 같은 페널티를 매긴다. 그런데 피처 스케일이 다르면 같은 영향력을 내는 데 필요한 가중치 크기도 달라진다. 값이 작은 피처는 가중치가 커야 하고, 그만큼 페널티를 더 크게 맞는다. 결국 규제가 스케일이 큰 피처를 편애하게 된다. 스케일을 맞춰야 모든 피처가 같은 조건에서 규제를 받는다.

:::

---

## 훈련 데이터로만 fit한다

스케일링에서 가장 흔하고 가장 비싼 실수는 스케일러가 테스트 데이터를 미리 들여다보게 두는 것이다.

```python
# 잘못된 방법 1: 분할 전에 전체 데이터로 fit
scaler = StandardScaler()
X_all_scaled = scaler.fit_transform(X_all)          # 테스트 통계가 섞여 들어간다
X_train, X_test = train_test_split(X_all_scaled)

# 잘못된 방법 2: 테스트에도 fit_transform
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.fit_transform(X_test)        # 테스트 통계로 다시 fit

# 올바른 방법: train으로 fit, test는 transform만
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

배포된 모델에는 데이터가 한 건씩 들어온다. 그 한 건의 평균이나 최댓값 같은 건 존재하지 않는다. 학습 때 계산해둔 통계를 그대로 적용하는 수밖에 없다는 뜻이다. 그런데 평가 단계에서만 테스트 전체의 통계를 써버리면, 실제 배포 환경에서는 불가능한 조건으로 점수를 매기는 것이 된다. 이렇게 나온 점수는 실제 성능보다 좋게 나오고, 얼마나 좋게 나왔는지도 알 수 없다.

이 규칙을 사람이 매번 지키는 대신 `Pipeline`에 맡길 수 있다.

```python
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.model_selection import cross_val_score

pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('svm', SVC(kernel='rbf', C=1.0)),
])

pipe.fit(X_train, y_train)
scores = cross_val_score(pipe, X_train, y_train, cv=5)
```

`cross_val_score`에 파이프라인을 통째로 넘기면 폴드마다 훈련 폴드로만 `fit`하고 검증 폴드에는 `transform`만 적용된다. 스케일러를 파이프라인 밖에서 미리 돌려놓고 교차 검증을 하면 검증 폴드의 통계가 이미 새어 들어간 뒤라 점수가 부풀려진다.

---

## 분포의 모양은 스케일링으로 바뀌지 않는다

앞에서 본 스케일러들은 전부 위치와 폭만 바꾼다. 심하게 한쪽으로 몰린 분포는 스케일링을 해도 몰린 채로 남는다. 소득, 집값, 방문 횟수처럼 오른쪽 꼬리가 긴 데이터가 그렇다. 이런 데이터는 스케일이 아니라 분포 자체를 바꿔야 한다.

로그 변환이 가장 간단한 도구다. 큰 값일수록 더 많이 눌러주니 긴 꼬리가 접힌다.

```python
import numpy as np

X_log = np.log1p(X)          # log(1 + x), 0이 섞여 있어도 안전
X_back = np.expm1(X_log)     # exp(x) - 1
```

`log(0)`은 정의되지 않으므로 0을 포함할 수 있는 데이터에는 `log1p`를 쓴다.

지수를 직접 고르기 싫으면 `PowerTransformer`가 정규분포에 가까워지도록 지수를 추정해준다.

```python
from sklearn.preprocessing import PowerTransformer

pt = PowerTransformer(method='yeo-johnson')   # 음수도 처리 가능, 기본값
X_t = pt.fit_transform(X_train)

pt = PowerTransformer(method='box-cox')       # 양수 데이터 전용
```

`PowerTransformer`는 변환 뒤 표준화까지 기본으로 수행하므로 뒤에 StandardScaler를 또 붙일 필요가 없다.

---

## ColumnTransformer로 피처마다 다르게

실제 데이터에는 정상적인 수치형, 이상치가 섞인 수치형, 범주형이 한 테이블에 같이 있다. `ColumnTransformer`는 컬럼 묶음마다 다른 전처리를 걸어준다.

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, RobustScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression

preprocessor = ColumnTransformer([
    ('normal', Pipeline([
        ('imputer', SimpleImputer(strategy='mean')),
        ('scaler', StandardScaler()),
    ]), ['age']),
    ('skewed', Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', RobustScaler()),
    ]), ['income', 'clicks']),
    ('cat', OneHotEncoder(drop='first', handle_unknown='ignore'), ['gender', 'city']),
])

full_pipeline = Pipeline([
    ('preprocessor', preprocessor),
    ('classifier', LogisticRegression()),
])

full_pipeline.fit(X_train, y_train)
```

정상 분포인 `age`에는 StandardScaler, 극단값이 나오기 쉬운 `income`과 `clicks`에는 RobustScaler, 범주형은 원-핫 인코딩. 결측 대체 전략도 컬럼 묶음마다 다르다. 이걸 손으로 하면 순서를 틀리기 딱 좋지만 파이프라인 안에서는 순서가 강제된다.

파이프라인 객체 하나를 `joblib.dump`로 저장하면 스케일러의 통계량, 인코더의 카테고리 매핑, 모델 가중치가 한 파일에 들어간다. 배포 쪽에서 로드해 `predict`만 부르면 학습 때와 똑같은 전처리가 재현된다.

---

## 마치며

피처 스케일링은 공식이 한 줄이고 코드도 두 줄이다. 그런데 이 두 줄이 KNN의 정확도를 0.74에서 0.96으로 바꾸고, 반대로 `fit`을 잘못된 데이터에 건 한 줄이 평가 전체를 못 믿을 것으로 만든다. 난이도가 아니라 위치가 중요한 작업이다.

그래서 실제로 판단할 것은 스케일러 이름이 아니라 두 가지다. 이 피처의 값 분포가 어떤 모양인가, 그리고 이 모델이 값의 크기를 보는가 순서를 보는가. 첫 번째 질문이 StandardScaler와 RobustScaler를 가르고, 두 번째 질문이 스케일링을 아예 건너뛸지를 정한다. 이상치가 뻔히 보이는데 StandardScaler를 쓰거나 랜덤 포레스트 앞에 스케일러를 붙이는 건 코드의 문제가 아니라 이 두 질문을 건너뛴 결과다.

판단이 끝났다면 그 결과를 `Pipeline`에 넣어두는 것으로 마무리한다. 파이프라인은 전처리를 편하게 해주는 도구가 아니라, 훈련 데이터로만 `fit`한다는 규칙을 사람의 기억력 밖으로 옮겨두는 장치다.

다음 글에서는 전처리를 마친 피처 중에서 무엇을 남기고 무엇을 버릴지, 피처 선택을 다룬다.

---

## 함께 보면 좋은 글

- [KNN](/ml/knn/) : 거리로 예측하기 때문에 스케일링이 필수인 대표 모델
- [규제](/ml/regularization/) : 스케일이 어긋나면 페널티가 피처마다 불공평해지는 이유
- [경사하강법](/ml/gradient-descent/) : 등고선 모양이 수렴 속도를 정하는 과정
- [범주형 데이터 인코딩](/ml/categorical-encoding/) : 문자열 피처를 숫자로 바꾸는 반대편 전처리

---

## 참고자료

- [scikit-learn: Preprocessing data](https://scikit-learn.org/stable/modules/preprocessing.html)
- [scikit-learn: Compare the effect of different scalers on data with outliers](https://scikit-learn.org/stable/auto_examples/preprocessing/plot_all_scaling.html)
- [Feature Engineering and Selection (Kuhn & Johnson, 2019)](http://www.feat.engineering/)
