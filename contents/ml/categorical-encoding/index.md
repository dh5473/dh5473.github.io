---
date: '2026-01-30'
title: '범주형 데이터 인코딩: One-Hot, Label, Ordinal Encoding 총정리'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 30
tags: ['Categorical Encoding', '범주형 인코딩', 'One-Hot Encoding', 'Label Encoding', 'Ordinal Encoding', '머신러닝']
summary: '범주형 변수를 모델이 이해할 수 있는 숫자로 바꾸는 방법. Label, Ordinal, One-Hot, Binary Encoding의 원리와 상황별 선택 기준.'
thumbnail: './thumbnail.png'
---

[이전 글](/ml/ml-practical-advice/)에서 학습 곡선 진단, 오차 분석, 다음 스텝 결정법을 다뤘다. Phase 6까지는 모델을 선택하고, 학습하고, 평가하고, 문제를 진단하는 **파이프라인 전체**를 훑었다. 그런데 진단을 끝내고 "피처를 개선하라"는 결론이 나왔을 때, 구체적으로 뭘 어떻게 해야 하는가?

Phase 7은 **피처 엔지니어링(Feature Engineering)** 이다. 모델 성능을 가장 크게 좌우하는 건 알고리즘이 아니라 데이터다. 같은 모델이라도 피처를 어떻게 가공하느냐에 따라 정확도가 5~15% 달라진다. 그 첫 번째 주제가 바로 **범주형 데이터 인코딩**이다.

---

## 1. 왜 인코딩이 필요한가

대부분의 머신러닝 모델은 **숫자**만 입력으로 받는다. [선형 회귀](/ml/linear-regression/)는 가중치와 피처의 내적을 계산하고, [로지스틱 회귀](/ml/logistic-regression/)는 그 결과를 시그모이드에 통과시킨다. "서울", "부산", "대구" 같은 문자열로는 내적을 계산할 수 없다.

```
# 이건 계산이 안 된다
y = w1 * "서울" + w2 * 25 + w3 * "남성"

# 이건 된다
y = w1 * 0 + w2 * 25 + w3 * 1
```

범주형 변수를 숫자로 바꾸는 과정이 **인코딩(Encoding)** 이다. 단, 아무렇게나 숫자를 붙이면 모델이 엉뚱한 패턴을 학습한다. 인코딩 방법 선택이 곧 모델 성능을 결정한다.

---

## 2. 범주형 변수의 두 가지 유형

인코딩 방법을 고르기 전에, 변수의 성격을 먼저 구분해야 한다.

| 유형 | 설명 | 예시 | 순서 의미 |
|------|------|------|-----------|
| **명목형 (Nominal)** | 카테고리 사이에 순서가 없음 | 도시(서울/부산/대구), 색상(빨강/파랑/초록), 혈액형(A/B/O/AB) | 없음 |
| **순서형 (Ordinal)** | 카테고리 사이에 자연스러운 순서가 있음 | 교육 수준(고졸/학사/석사/박사), 사이즈(S/M/L/XL), 만족도(낮음/보통/높음) | 있음 |

이 구분이 인코딩 방법 선택의 출발점이다. 순서가 없는 변수에 순서를 부여하면 모델이 "부산 > 서울"이라는 관계를 학습해버린다.

---

## 3. Label Encoding — 가장 단순한 방법

각 카테고리에 정수를 하나씩 매핑한다.

```
서울 → 0
부산 → 1
대구 → 2
인천 → 3
```

### sklearn 구현

```python
from sklearn.preprocessing import LabelEncoder

le = LabelEncoder()
df['city_encoded'] = le.fit_transform(df['city'])

print(le.classes_)
# ['대구', '부산', '서울', '인천']

print(le.transform(['서울', '부산']))
# [2, 1]
```

### 문제: 거짓 순서

Label Encoding은 카테고리를 알파벳(또는 가나다) 순으로 정렬하고 0, 1, 2, 3을 부여한다. 모델 입장에서 이 숫자는 **크기**로 해석된다.

```
대구(0) < 부산(1) < 서울(2) < 인천(3)

모델이 학습하는 것:
- "인천은 대구보다 3배 크다"
- "서울 - 부산 = 부산 - 대구" (등간격)
```

이런 관계는 도시 데이터에 전혀 성립하지 않는다. [로지스틱 회귀](/ml/logistic-regression/)나 [KNN](/ml/knn/)처럼 거리 계산을 하는 모델에서 이 문제가 특히 심각하다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 Label Encoding은 언제 써도 되는가?</strong><br>트리 기반 모델(<a href="/ml/decision-tree/">의사결정나무</a>, <a href="/ml/random-forest/">랜덤 포레스트</a>, <a href="/ml/xgboost-vs-lightgbm/">XGBoost/LightGBM</a>)은 피처의 크기가 아니라 <strong>분할 지점(threshold)</strong>으로 학습한다. "city <= 1"이면 왼쪽, 아니면 오른쪽 — 이런 식이다. 따라서 숫자의 절대적 크기나 간격이 중요하지 않다. 트리 모델에서는 Label Encoding이 실무에서 가장 많이 쓰인다.</div>

---

## 4. Ordinal Encoding — 순서가 있을 때

순서형 변수에는 **의미 있는 순서**를 직접 지정해서 인코딩한다. Label Encoding과 결과가 비슷하지만, 순서를 명시적으로 제어하는 것이 핵심이다.

```
S → 0,  M → 1,  L → 2,  XL → 3
# 실제로 S < M < L < XL 순서가 성립
```

### sklearn 구현

```python
from sklearn.preprocessing import OrdinalEncoder

# 순서를 명시적으로 지정
size_order = [['S', 'M', 'L', 'XL']]

oe = OrdinalEncoder(categories=size_order)
df['size_encoded'] = oe.fit_transform(df[['size']])

print(df[['size', 'size_encoded']].drop_duplicates())
#   size  size_encoded
#      S           0.0
#      M           1.0
#      L           2.0
#     XL           3.0
```

### 교육 수준 예시

```python
edu_order = [['고졸', '학사', '석사', '박사']]
oe = OrdinalEncoder(categories=edu_order)
df['edu_encoded'] = oe.fit_transform(df[['education']])
```

Ordinal Encoding은 순서 정보가 모델에 **도움이 될 때** 쓴다. 순서가 있다고 해서 등간격이 보장되는 건 아니지만(고졸→학사와 석사→박사의 차이가 같다고 보기 어려움), 적어도 방향은 맞다.

<div style="background: #fff8e1; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>⚠️ Label vs Ordinal 차이</strong><br>sklearn의 <code>LabelEncoder</code>는 1D 배열(타깃 변수용), <code>OrdinalEncoder</code>는 2D 배열(피처용)을 받는다. 피처 인코딩에는 <code>OrdinalEncoder</code>를 쓰는 게 맞다. <code>LabelEncoder</code>는 원래 타깃(y) 인코딩용으로 설계되었다.</div>

---

## 5. One-Hot Encoding — 가장 안전한 방법

명목형 변수에 가장 널리 쓰이는 방법이다. 각 카테고리를 별도의 이진(0/1) 컬럼으로 만든다.

```
원본:          One-Hot:
city           city_서울  city_부산  city_대구  city_인천
서울     →       1         0         0         0
부산     →       0         1         0         0
대구     →       0         0         1         0
인천     →       0         0         0         1
서울     →       1         0         0         0
```

숫자 사이에 크기 관계가 없다. 각 카테고리가 독립된 차원으로 표현되기 때문에 **거짓 순서 문제**가 원천적으로 사라진다.

### pandas: get_dummies

```python
import pandas as pd

df = pd.DataFrame({'city': ['서울', '부산', '대구', '인천', '서울']})

encoded = pd.get_dummies(df, columns=['city'], dtype=int)
print(encoded)
#    city_대구  city_부산  city_서울  city_인천
# 0       0       0       1       0
# 1       0       1       0       0
# 2       1       0       0       0
# 3       0       0       0       1
# 4       0       0       1       0
```

### sklearn: OneHotEncoder

```python
from sklearn.preprocessing import OneHotEncoder

ohe = OneHotEncoder(sparse_output=False)
encoded = ohe.fit_transform(df[['city']])

print(ohe.get_feature_names_out())
# ['city_대구', 'city_부산', 'city_서울', 'city_인천']
```

`sparse_output=False`를 지정하면 밀집 배열(dense array)로 반환한다. 기본값은 희소 행렬(sparse matrix)인데, 카테고리 수가 많을 때 메모리를 절약하기 위함이다.

---

## 6. One-Hot Encoding의 함정

### 함정 1: 고카디널리티 폭발

카테고리 수가 많으면 컬럼 수가 폭발한다.

```
# 카테고리 수 = 생성되는 컬럼 수
도시 (4개)     → 4 컬럼    ✓ 괜찮다
우편번호 (500개) → 500 컬럼  ✗ 위험하다
상품 ID (10만개) → 10만 컬럼  ✗✗ 재앙이다
```

컬럼이 수백 개로 늘어나면 모델 학습 속도가 느려지고, 과적합 위험이 커진다. 대부분의 컬럼이 0으로 채워진 **희소(sparse)** 데이터가 된다.

| 카테고리 수 | One-Hot 적합성 | 대안 |
|------------|---------------|------|
| 2~10개 | 적합 | - |
| 10~50개 | 주의 | 빈도 인코딩, Binary 인코딩 |
| 50개 이상 | 부적합 | Target 인코딩, 임베딩 |

### 함정 2: 다중공선성 (Multicollinearity)

4개 카테고리를 One-Hot으로 만들면, 4개 컬럼의 합은 항상 1이다.

```
city_서울 + city_부산 + city_대구 + city_인천 = 1 (모든 행에서)

# 즉, city_인천 = 1 - city_서울 - city_부산 - city_대구
# city_인천은 나머지 3개로 완벽히 예측 가능 → 정보 중복
```

이것이 **다중공선성**이다. [선형 회귀](/ml/linear-regression/)에서 역행렬 계산이 불안정해지고, 계수 해석이 어려워진다.

**해결책: 하나를 떨어뜨린다.**

```python
# pandas
encoded = pd.get_dummies(df, columns=['city'], drop_first=True, dtype=int)
# city_부산, city_서울, city_인천 (3개만 생성, 대구가 기준)

# sklearn
ohe = OneHotEncoder(drop='first', sparse_output=False)
encoded = ohe.fit_transform(df[['city']])
```

기준 카테고리(여기서는 '대구')는 나머지가 모두 0일 때 자동으로 표현된다. 컬럼 수도 `n-1`로 줄어든다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 drop_first는 항상 필요한가?</strong><br>트리 기반 모델은 다중공선성의 영향을 거의 받지 않는다. <code>drop_first</code>는 주로 선형 모델(선형 회귀, 로지스틱 회귀)에서 중요하다. 트리 모델을 쓸 때는 오히려 drop하지 않는 게 해석이 쉽다.</div>

---

## 7. Binary Encoding — Label과 One-Hot의 절충

카테고리 수가 많을 때 One-Hot의 차원 폭발을 줄이면서, Label Encoding의 거짓 순서 문제도 피하는 방법이다.

**원리**: 카테고리에 정수를 부여한 뒤, 그 정수를 **이진수(binary)** 로 변환하고, 각 비트를 별도 컬럼으로 만든다.

```
카테고리   정수    이진    bit_2  bit_1  bit_0
서울       1     001      0      0      1
부산       2     010      0      1      0
대구       3     011      0      1      1
인천       4     100      1      0      0
광주       5     101      1      0      1
대전       6     110      1      1      0
울산       7     111      1      1      1
```

7개 카테고리를 One-Hot으로 하면 7개 컬럼이 필요하지만, Binary Encoding은 **3개 컬럼**으로 충분하다. 일반적으로 n개 카테고리는 `ceil(log2(n))` 개 컬럼으로 표현된다.

```python
# category_encoders 라이브러리 사용
# pip install category_encoders
import category_encoders as ce

encoder = ce.BinaryEncoder(cols=['city'])
df_encoded = encoder.fit_transform(df)
```

### One-Hot vs Binary vs Label 비교

| 카테고리 수(n) | One-Hot 컬럼 수 | Binary 컬럼 수 | Label 컬럼 수 |
|--------------|----------------|---------------|--------------|
| 4 | 4 (또는 3) | 2 | 1 |
| 10 | 10 | 4 | 1 |
| 100 | 100 | 7 | 1 |
| 1000 | 1000 | 10 | 1 |

카테고리 수가 커질수록 Binary Encoding의 장점이 두드러진다.

---

## 8. Frequency / Count Encoding — 빈도로 인코딩

카테고리를 **등장 횟수** 또는 **등장 비율**로 대체하는 방법이다.

```python
# Count Encoding: 등장 횟수
freq_map = df['city'].value_counts()
df['city_count'] = df['city'].map(freq_map)

# Frequency Encoding: 등장 비율
freq_map_ratio = df['city'].value_counts(normalize=True)
df['city_freq'] = df['city'].map(freq_map_ratio)
```

```
city    count   freq
서울     1500    0.30
부산      800    0.16
대구      600    0.12
인천      500    0.10
...
```

### 장점

- 컬럼 1개로 유지 (차원 증가 없음)
- 고카디널리티 변수에도 적용 가능
- 빈도 자체가 유의미한 신호일 때 효과적 (인기 도시일수록 집값이 높다 등)

### 주의점

- 등장 횟수가 같은 카테고리는 같은 값으로 인코딩된다 (정보 손실)
- 빈도가 타깃과 무관하면 노이즈만 추가한다

---

## 9. 어떤 인코딩을 어떤 모델에 쓸 것인가

이 부분이 실무에서 가장 중요하다. 모델 특성에 따라 최적의 인코딩이 다르다.

| 모델 유형 | 추천 인코딩 | 이유 |
|-----------|-----------|------|
| **선형 회귀 / 로지스틱 회귀** | One-Hot (drop_first) | 거리·크기에 민감. 거짓 순서 치명적 |
| **KNN / SVM** | One-Hot | 거리 기반 모델. 숫자 크기가 거리에 직접 반영 |
| **의사결정나무 / 랜덤 포레스트** | Label 또는 Ordinal | 분할 기반이라 순서 무관. One-Hot은 오히려 분할 효율 저하 |
| **XGBoost / LightGBM** | Label 또는 Ordinal | 트리 기반 동일. LightGBM은 자체 범주형 처리 지원 |
| **신경망** | One-Hot 또는 임베딩 | 고카디널리티면 임베딩 레이어가 효율적 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>💡 실무 요약</strong><br>트리 모델 → Label Encoding으로 시작.<br>선형/거리 기반 모델 → One-Hot Encoding으로 시작.<br>카디널리티가 높으면 → Binary 또는 Frequency Encoding을 검토.<br>이 세 줄이면 80% 상황을 커버한다.</div>

### LightGBM의 자체 범주형 처리

[LightGBM](/ml/xgboost-vs-lightgbm/)은 범주형 피처를 직접 처리하는 기능이 있다. 인코딩 없이 카테고리 정보를 그대로 넘기면 내부적으로 최적 분할을 찾는다.

```python
import lightgbm as lgb

# 범주형 컬럼을 category 타입으로 지정
df['city'] = df['city'].astype('category')

model = lgb.LGBMClassifier()
model.fit(X_train, y_train, categorical_feature=['city'])
```

이 방식은 One-Hot보다 메모리를 절약하고, 최적 분할을 자동으로 찾기 때문에 성능도 종종 더 좋다.

---

## 10. sklearn Pipeline으로 인코딩 자동화

실전에서는 숫자형 피처와 범주형 피처가 섞여 있다. `ColumnTransformer`로 각 피처 유형에 다른 전처리를 적용하고, `Pipeline`으로 묶으면 코드가 깔끔해지고 데이터 누수도 방지된다.

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression

# 피처 분류
numeric_features = ['age', 'income']
nominal_features = ['city', 'gender']       # 순서 없음 → One-Hot
ordinal_features = ['education']             # 순서 있음 → Ordinal

# 전처리 정의
numeric_transformer = StandardScaler()
nominal_transformer = OneHotEncoder(drop='first', sparse_output=False)
ordinal_transformer = OrdinalEncoder(
    categories=[['고졸', '학사', '석사', '박사']]
)

# ColumnTransformer로 조합
preprocessor = ColumnTransformer(
    transformers=[
        ('num', numeric_transformer, numeric_features),
        ('nom', nominal_transformer, nominal_features),
        ('ord', ordinal_transformer, ordinal_features),
    ]
)

# Pipeline으로 모델과 연결
pipe = Pipeline([
    ('preprocessor', preprocessor),
    ('classifier', LogisticRegression(max_iter=1000))
])

# 학습 & 예측
pipe.fit(X_train, y_train)
y_pred = pipe.predict(X_test)
```

이 파이프라인의 핵심 장점:

1. **fit은 훈련 데이터에서만** — `pipe.fit(X_train, y_train)` 호출 시 인코더가 훈련 데이터의 카테고리만 학습한다.
2. **transform은 일관되게** — `pipe.predict(X_test)` 호출 시 동일한 인코딩 규칙이 테스트 데이터에 적용된다.
3. **새로운 데이터에도** — 배포 시 `pipe.predict(new_data)`만 호출하면 전처리부터 예측까지 한 번에 처리된다.

---

## 11. 자주 하는 실수들

### 실수 1: 인코딩을 분할 전에 한다 (데이터 누수)

```python
# ✗ 잘못된 순서
df_encoded = pd.get_dummies(df, columns=['city'])  # 전체 데이터로 인코딩
X_train, X_test = train_test_split(df_encoded)      # 그 다음 분할

# ✓ 올바른 순서
X_train, X_test = train_test_split(df)               # 먼저 분할
encoder.fit(X_train)                                  # 훈련 데이터로만 학습
X_train_enc = encoder.transform(X_train)
X_test_enc = encoder.transform(X_test)
```

<div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px 20px; margin: 20px 0; border-radius: 4px;"><strong>🚨 데이터 누수 (Data Leakage)</strong><br>전체 데이터로 인코딩하면, 테스트 데이터의 카테고리 분포가 인코딩에 반영된다. 모델이 테스트 데이터의 정보를 간접적으로 학습하는 것이다. 교차 검증에서 점수가 높게 나오지만 실전에서는 성능이 떨어진다. Pipeline을 쓰면 이 실수를 구조적으로 방지할 수 있다.</div>

### 실수 2: 테스트에 처음 보는 카테고리가 등장

훈련 데이터에 없던 카테고리가 테스트 데이터에 나타나면 에러가 발생한다.

```python
# 해결: handle_unknown='ignore' 설정
ohe = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
ohe.fit(X_train)

# 훈련에 없던 '세종'이 테스트에 등장해도 에러 없이 전부 0으로 처리
X_test_enc = ohe.transform(X_test)
```

`handle_unknown='ignore'`를 설정하면 모르는 카테고리는 모든 One-Hot 컬럼이 0인 벡터로 인코딩된다. 프로덕션 환경에서는 거의 필수 옵션이다.

### 실수 3: get_dummies의 함정

`pd.get_dummies`는 편리하지만, **훈련과 테스트의 컬럼이 다를 수 있다.**

```python
# 훈련 데이터: city = ['서울', '부산', '대구']
train_encoded = pd.get_dummies(train_df)  # 3개 컬럼 생성

# 테스트 데이터: city = ['서울', '부산']  (대구 없음)
test_encoded = pd.get_dummies(test_df)    # 2개 컬럼 생성 ← 불일치!
```

`pd.get_dummies`는 현재 데이터의 카테고리만 보고 컬럼을 생성하기 때문에, 데이터마다 컬럼 수와 순서가 달라질 수 있다. sklearn의 `OneHotEncoder`는 `fit`에서 카테고리를 학습하고 `transform`에서 일관되게 적용하므로 이 문제가 없다.

```python
# 불일치 해결 (get_dummies를 꼭 써야 한다면)
test_encoded = test_encoded.reindex(columns=train_encoded.columns, fill_value=0)
```

---

## 12. 전체 인코딩 방법 비교 정리

| 인코딩 | 컬럼 수 | 순서 가정 | 고카디널리티 | 선형 모델 | 트리 모델 |
|--------|---------|----------|------------|----------|----------|
| Label | 1 | 있음 (위험) | 가능 | 부적합 | 적합 |
| Ordinal | 1 | 있음 (의도적) | 가능 | 순서형만 | 적합 |
| One-Hot | n (또는 n-1) | 없음 | 위험 | 적합 | 비효율적 |
| Binary | ceil(log2(n)) | 부분적 | 가능 | 보통 | 적합 |
| Frequency | 1 | 없음 | 가능 | 보통 | 적합 |

선택 프로세스를 흐름도로 정리하면:

```
범주형 변수 발견
    │
    ├─ 순서가 있는가?
    │      ├─ Yes → Ordinal Encoding
    │      └─ No  → 카디널리티 확인
    │                 ├─ 낮음 (< 10) → One-Hot Encoding
    │                 ├─ 중간 (10-50) → Binary 또는 Frequency
    │                 └─ 높음 (> 50) → Frequency, Target, 또는 임베딩
    │
    └─ 트리 모델인가?
           ├─ Yes → Label Encoding도 OK
           └─ No  → 위 흐름도 따르기
```

---

## 정리

범주형 인코딩은 "숫자로 바꾸면 끝"이 아니다. 변수의 성격(명목/순서), 카디널리티, 모델 유형에 따라 최적의 방법이 달라진다. 핵심을 요약하면:

1. **명목형 + 선형 모델** → One-Hot Encoding (drop_first)
2. **순서형** → Ordinal Encoding (순서 명시)
3. **트리 모델** → Label Encoding으로 충분
4. **고카디널리티** → Binary, Frequency, 또는 Target Encoding
5. **인코딩은 반드시 분할 후에** → Pipeline으로 구조화
6. **프로덕션** → `handle_unknown='ignore'` 필수

피처 엔지니어링의 첫 단추를 꿰었다. 범주형 변수를 숫자로 바꾸는 건 전처리의 한 축이고, 다른 한 축은 **수치형 변수의 스케일을 맞추는 것**이다. 다음 글에서는 [Feature Scaling](/ml/feature-scaling/) — StandardScaler, MinMaxScaler, RobustScaler의 원리와 선택 기준을 다룬다.
