---
date: '2026-01-30'
title: 'One-Hot과 Label, 범주형 데이터 인코딩을 고르는 기준'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 30
tags: ['Categorical Encoding', '범주형 인코딩', 'One-Hot Encoding', 'Label Encoding', 'Ordinal Encoding', 'Binary Encoding', '머신러닝']
summary: '명목형과 순서형의 구분부터 One-Hot의 차원 폭발과 다중공선성까지, 범주형 변수를 숫자로 바꾸는 방법과 모델별 선택 기준을 정리한다.'
thumbnail: './thumbnail.png'
---

대부분의 머신러닝 모델은 숫자만 입력으로 받는다. 선형 회귀는 가중치와 피처의 내적을 계산하고, 로지스틱 회귀는 그 결과를 시그모이드에 넣는다. `"서울"`이라는 문자열로는 곱셈이 시작되지 않는다.

범주를 숫자로 바꾸는 이 과정이 **인코딩(Encoding)** 이다. 문제는 아무 숫자나 붙이면 모델이 없던 관계를 학습해버린다는 것이다. 그래서 인코딩 방법을 고르는 일은 데이터 정리가 아니라 모델링 결정에 가깝다.

## 명목형과 순서형부터 나눈다

| 유형 | 카테고리 사이의 순서 | 예시 |
|---|---|---|
| **명목형(Nominal)** | 없음 | 도시(서울/부산/대구), 색상, 혈액형 |
| **순서형(Ordinal)** | 있음 | 교육 수준(고졸/학사/석사/박사), 사이즈(S/M/L/XL), 만족도 |

순서가 없는 변수에 순서를 부여하면 모델은 "부산이 서울보다 크다"는 관계를 진짜로 학습한다. 인코딩 선택은 여기서 갈린다.

## Label Encoding

각 카테고리에 정수를 하나씩 매긴다. 가장 단순하고, 그래서 가장 자주 오용된다.

```python
from sklearn.preprocessing import LabelEncoder

le = LabelEncoder()
df['city_encoded'] = le.fit_transform(df['city'])

print(le.classes_)                    # ['대구' '부산' '서울' '인천']
print(le.transform(['서울', '부산']))  # [2 1]
```

`LabelEncoder`는 카테고리를 가나다순으로 정렬한 뒤 0부터 번호를 붙인다. 그런데 모델은 이 번호를 **크기**로 읽는다. 대구 0, 부산 1, 서울 2, 인천 3이라면 모델에게 인천은 부산의 세 배이고 서울과 부산의 간격은 부산과 대구의 간격과 같다. 도시 데이터에 그런 관계는 없다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 450" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="One-Hot 인코딩은 도시 컬럼 하나를 서울 부산 대구 인천 네 개의 0과 1 컬럼으로 늘리고, Label 인코딩은 컬럼을 하나로 유지하는 대신 도시에 존재하지 않는 크기 순서를 만들어낸다">
<defs>
<marker id="ce1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 위 패널: One-Hot -->
<text x="200" y="30" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">위: One-Hot 인코딩</text>
<text x="200" y="50" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">열이 범주 수만큼 늘어남</text>
<!-- 위: 원본 열 -->
<rect x="24" y="62" width="68" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="90" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="118" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="146" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="174" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="58" y="81" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">city</text>
<text x="58" y="109" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">서울</text>
<text x="58" y="137" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">부산</text>
<text x="58" y="165" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">대구</text>
<text x="58" y="193" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">인천</text>
<line x1="100" y1="132" x2="136" y2="132" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#ce1Arrow)"/>
<!-- 위: One-Hot 헤더 -->
<rect x="148" y="62" width="48" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="196" y="62" width="48" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="244" y="62" width="48" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="292" y="62" width="48" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<text x="172" y="81" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">서울</text>
<text x="220" y="81" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">부산</text>
<text x="268" y="81" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">대구</text>
<text x="316" y="81" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">인천</text>
<!-- 위: 1행 서울 -->
<rect x="148" y="90" width="48" height="28" fill="var(--primary, #0a756c)" stroke="var(--border, #e7e5e4)"/>
<rect x="196" y="90" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="244" y="90" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="292" y="90" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="172" y="109" text-anchor="middle" font-size="14" fill="var(--on-fill, #ffffff)">1</text>
<text x="220" y="109" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="268" y="109" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="316" y="109" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<!-- 위: 2행 부산 -->
<rect x="148" y="118" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="196" y="118" width="48" height="28" fill="var(--primary, #0a756c)" stroke="var(--border, #e7e5e4)"/>
<rect x="244" y="118" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="292" y="118" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="172" y="137" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="220" y="137" text-anchor="middle" font-size="14" fill="var(--on-fill, #ffffff)">1</text>
<text x="268" y="137" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="316" y="137" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<!-- 위: 3행 대구 -->
<rect x="148" y="146" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="196" y="146" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="244" y="146" width="48" height="28" fill="var(--primary, #0a756c)" stroke="var(--border, #e7e5e4)"/>
<rect x="292" y="146" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="172" y="165" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="220" y="165" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="268" y="165" text-anchor="middle" font-size="14" fill="var(--on-fill, #ffffff)">1</text>
<text x="316" y="165" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<!-- 위: 4행 인천 -->
<rect x="148" y="174" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="196" y="174" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="244" y="174" width="48" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="292" y="174" width="48" height="28" fill="var(--primary, #0a756c)" stroke="var(--border, #e7e5e4)"/>
<text x="172" y="193" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="220" y="193" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="268" y="193" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">0</text>
<text x="316" y="193" text-anchor="middle" font-size="14" fill="var(--on-fill, #ffffff)">1</text>
<!-- 구분선 -->
<line x1="30" y1="222" x2="370" y2="222" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
<!-- 아래 패널: Label -->
<text x="200" y="252" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">아래: Label 인코딩</text>
<text x="200" y="272" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">열은 1개, 대신 크기 순서 발생</text>
<rect x="24" y="286" width="68" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="314" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="342" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="370" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="24" y="398" width="68" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="58" y="305" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">city</text>
<text x="58" y="333" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">서울</text>
<text x="58" y="361" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">부산</text>
<text x="58" y="389" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">대구</text>
<text x="58" y="417" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">인천</text>
<line x1="100" y1="356" x2="136" y2="356" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#ce1Arrow)"/>
<rect x="148" y="286" width="80" height="28" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="148" y="314" width="80" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="148" y="342" width="80" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="148" y="370" width="80" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<rect x="148" y="398" width="80" height="28" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<text x="188" y="305" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">숫자</text>
<text x="188" y="333" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">2</text>
<text x="188" y="361" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">1</text>
<text x="188" y="389" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">0</text>
<text x="188" y="417" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">3</text>
<rect x="236" y="330" width="150" height="62" rx="4" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)"/>
<text x="311" y="354" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">도시엔 없는 순서</text>
<text x="311" y="378" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">대구&lt;부산&lt;서울&lt;인천</text>
</svg>
</div>

거짓 순서는 거리를 계산하거나 계수를 곱하는 모델에서 곧바로 문제가 된다. 반대로 트리 기반 모델은 이 숫자를 크기가 아니라 분할 기준으로만 쓴다. `city <= 1`이면 왼쪽, 아니면 오른쪽. 어떤 숫자가 붙었든 트리는 분할을 거듭해 필요한 그룹을 갈라낼 수 있으므로, 트리 모델에서는 Label Encoding이 실무 기본값이다.

## Ordinal Encoding

순서형 변수에는 그 순서를 **직접 지정해서** 넣는다. 결과 형태는 Label Encoding과 같지만, 번호가 가나다순이 아니라 도메인 순서를 따른다는 점이 다르다.

```python
from sklearn.preprocessing import OrdinalEncoder

oe = OrdinalEncoder(categories=[['S', 'M', 'L', 'XL']])
df['size_encoded'] = oe.fit_transform(df[['size']])   # S=0, M=1, L=2, XL=3
```

순서가 있다고 해서 간격까지 같은 건 아니다. 고졸에서 학사로 가는 차이와 석사에서 박사로 가는 차이가 같을 리 없다. 그래도 방향은 맞으므로, 모델이 "높을수록 크다"는 단조 관계를 쓸 수 있다.

:::info

**LabelEncoder와 OrdinalEncoder는 쓰는 자리가 다르다**

`LabelEncoder`는 1차원 배열을 받는 타깃(y) 인코딩용이고, `OrdinalEncoder`는 2차원 배열을 받는 피처(X) 인코딩용이다. 피처에는 `OrdinalEncoder`를 쓰는 것이 맞다. `LabelEncoder`를 피처에 쓰면 컬럼마다 따로 객체를 만들어야 하고 파이프라인에도 들어가지 않는다.

:::

## One-Hot Encoding

각 카테고리를 별도의 0/1 컬럼으로 펼친다. 서울 행은 `city_서울`만 1이고 나머지는 0이다. 카테고리마다 독립된 차원을 하나씩 차지하니 숫자 사이의 크기 관계가 애초에 생기지 않는다.

```python
import pandas as pd
from sklearn.preprocessing import OneHotEncoder

# pandas
encoded = pd.get_dummies(df, columns=['city'], dtype=int)

# sklearn
ohe = OneHotEncoder(sparse_output=False)
encoded = ohe.fit_transform(df[['city']])
print(ohe.get_feature_names_out())   # ['city_대구' 'city_부산' 'city_서울' 'city_인천']
```

`OneHotEncoder`의 기본 출력은 희소 행렬이다. 카테고리가 많을 때 메모리를 아끼기 위해서이고, 밀집 배열이 필요하면 `sparse_output=False`를 준다.

### 카디널리티가 높으면 컬럼이 폭발한다

컬럼 수가 곧 카테고리 수다. 도시 4개면 4컬럼이지만 우편번호 500개면 500컬럼, 상품 ID 10만 개면 10만 컬럼이 된다. 대부분의 값이 0인 희소 행렬이 만들어지고, 학습이 느려지는 것은 물론 각 컬럼이 참조하는 샘플 수가 줄어 과적합 위험도 커진다.

| 카테고리 수 | One-Hot | 대안 |
|---|---|---|
| 2~10개 | 적합 | - |
| 10~50개 | 주의 | Binary, Frequency 인코딩 |
| 50개 이상 | 부적합 | Target 인코딩, 임베딩 |

### 컬럼끼리 다중공선성이 생긴다

4개 카테고리를 전부 펼치면 네 컬럼의 합이 모든 행에서 정확히 1이다. 즉 `city_인천 = 1 - city_서울 - city_부산 - city_대구`로, 마지막 컬럼은 나머지 셋으로 완벽히 결정된다. 선형 회귀에서는 이 완전한 선형 종속이 역행렬 계산을 불안정하게 만들고 계수 해석을 망가뜨린다.

해결책은 하나를 떨어뜨리는 것이다.

```python
encoded = pd.get_dummies(df, columns=['city'], drop_first=True, dtype=int)
ohe = OneHotEncoder(drop='first', sparse_output=False)
```

기준이 된 카테고리는 나머지가 전부 0인 상태로 표현되므로 정보는 잃지 않는다. 다만 이건 선형 모델의 문제다. 트리 모델은 다중공선성의 영향을 거의 받지 않으니 굳이 떨어뜨리지 않는 편이 해석에 낫다.

## Binary Encoding

카테고리에 정수를 매긴 뒤 그 정수를 이진수로 적고, 각 비트를 컬럼 하나로 만든다. One-Hot의 차원 폭발을 줄이면서 Label Encoding만큼의 거짓 순서도 만들지 않는 절충안이다.

| 카테고리 | 정수 | bit_2 | bit_1 | bit_0 |
|---|---|---|---|---|
| 서울 | 1 | 0 | 0 | 1 |
| 부산 | 2 | 0 | 1 | 0 |
| 대구 | 3 | 0 | 1 | 1 |
| 인천 | 4 | 1 | 0 | 0 |
| 광주 | 5 | 1 | 0 | 1 |
| 대전 | 6 | 1 | 1 | 0 |
| 울산 | 7 | 1 | 1 | 1 |

7개 카테고리를 One-Hot으로 펼치면 7컬럼이지만 여기서는 3컬럼이면 된다. 필요한 컬럼 수가 카테고리 수의 로그로 늘어나기 때문이다.

| 카테고리 수 | One-Hot | Binary | Label |
|---|---|---|---|
| 10 | 10 | 4 | 1 |
| 100 | 100 | 7 | 1 |
| 1,000 | 1,000 | 10 | 1 |

```python
import category_encoders as ce   # pip install category_encoders

encoder = ce.BinaryEncoder(cols=['city'])
df_encoded = encoder.fit_transform(df)
```

대신 각 비트 컬럼 자체에는 아무 의미가 없다. `bit_1`이 1이라는 사실은 부산·대구·대전·울산이 섞인 임의의 집합을 가리킬 뿐이다. 압축은 되지만 해석은 포기하는 거래다.

## Frequency / Count Encoding

카테고리를 등장 횟수나 등장 비율로 바꾼다. 컬럼이 늘지 않으므로 카디널리티가 아무리 높아도 쓸 수 있다.

```python
df['city_count'] = df['city'].map(df['city'].value_counts())
df['city_freq'] = df['city'].map(df['city'].value_counts(normalize=True))
```

"인기 있는 도시일수록 집값이 높다"처럼 빈도 자체가 신호일 때 효과가 좋다. 반대로 빈도가 타깃과 무관하면 노이즈만 하나 늘어난다. 등장 횟수가 같은 카테고리들이 한 값으로 뭉쳐 구분이 사라지는 것도 감수해야 한다.

## 모델에 따라 답이 갈린다

| 모델 | 추천 인코딩 | 이유 |
|---|---|---|
| 선형 회귀, 로지스틱 회귀 | One-Hot (drop_first) | 숫자 크기가 계수에 직접 곱해진다 |
| KNN, SVM | One-Hot | 숫자 크기가 거리에 직접 들어간다 |
| 결정 트리, 랜덤 포레스트 | Label 또는 Ordinal | 분할만 하므로 순서 무관. One-Hot은 분할 효율을 떨어뜨린다 |
| XGBoost, LightGBM | Label 또는 Ordinal | 트리 기반. LightGBM은 자체 범주형 분할도 지원 |
| 신경망 | One-Hot 또는 임베딩 | 카디널리티가 높으면 임베딩 레이어가 효율적 |

트리 모델에서 One-Hot이 불리한 이유는 분할의 정보량 때문이다. Label로 넣은 컬럼 하나는 트리가 어느 지점에서든 자를 수 있어 한 번의 분할로 여러 도시를 한쪽에 모을 수 있다. One-Hot으로 펼치면 각 컬럼이 "서울인가 아닌가" 하나만 물을 수 있어, 같은 그룹을 만들려면 분할을 여러 번 써야 하고 깊이만 낭비된다.

인코딩 방식별 성질을 한 표로 모으면 이렇다.

| 인코딩 | 컬럼 수 | 순서 가정 | 고카디널리티 | 선형 모델 | 트리 모델 |
|---|---|---|---|---|---|
| Label | 1 | 있음(의도치 않음) | 가능 | 부적합 | 적합 |
| Ordinal | 1 | 있음(의도적) | 가능 | 순서형만 | 적합 |
| One-Hot | n 또는 n-1 | 없음 | 위험 | 적합 | 비효율 |
| Binary | 약 log2(n) | 부분적 | 가능 | 보통 | 적합 |
| Frequency | 1 | 없음 | 가능 | 보통 | 적합 |

LightGBM에는 인코딩을 아예 건너뛰는 길도 있다. 범주형 컬럼을 지정하면 카테고리를 정렬해 최적 분할점을 직접 찾는다.

```python
import lightgbm as lgb

df['city'] = df['city'].astype('category')
model = lgb.LGBMClassifier()
model.fit(X_train, y_train, categorical_feature=['city'])
```

## 실전에서 걸리는 세 가지

### 인코딩은 데이터를 나눈 뒤에 한다

인코딩도 스케일링과 같은 규칙을 따른다. 카테고리 목록과 컬럼 구성을 훈련 데이터에서만 `fit`하고, 테스트에는 `transform`만 적용한다. 전체 데이터로 인코딩하면 테스트에만 있던 카테고리가 컬럼으로 자리를 잡아 검증 점수가 부풀려진다.

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression

preprocessor = ColumnTransformer([
    ('num', StandardScaler(), ['age', 'income']),
    ('nom', OneHotEncoder(drop='first', handle_unknown='ignore'), ['city', 'gender']),
    ('ord', OrdinalEncoder(categories=[['고졸', '학사', '석사', '박사']]), ['education']),
])

pipe = Pipeline([
    ('preprocessor', preprocessor),
    ('classifier', LogisticRegression(max_iter=1000)),
])
pipe.fit(X_train, y_train)
```

파이프라인 안에 넣어두면 교차 검증에서도 폴드마다 훈련 폴드로만 `fit`이 일어난다.

### 테스트에 처음 보는 카테고리가 나온다

훈련에 없던 값이 들어오면 `OneHotEncoder`는 기본적으로 예외를 던진다. 프로덕션에서는 언제든 새 카테고리가 들어오므로 `handle_unknown='ignore'`가 사실상 필수다.

```python
ohe = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
```

이 옵션을 켜면 모르는 카테고리는 모든 컬럼이 0인 벡터가 된다. 정보는 없지만 서비스는 멈추지 않는다.

### get_dummies는 훈련과 테스트의 컬럼이 달라진다

`pd.get_dummies`는 넘겨받은 데이터에 실제로 등장한 값만 보고 컬럼을 만든다. 훈련에 대구가 있고 테스트에 없으면 두 결과의 컬럼 구성이 어긋난다. 컬럼 수가 다르면 예외로 멈추고, 빠진 컬럼과 새로 생긴 컬럼이 상쇄되어 수가 우연히 같으면 모델이 엉뚱한 컬럼에 가중치를 곱한 채 조용히 지나간다.

```python
# get_dummies를 꼭 써야 한다면 컬럼을 맞춘다
test_encoded = test_encoded.reindex(columns=train_encoded.columns, fill_value=0)
```

`OneHotEncoder`는 `fit`에서 카테고리 목록을 기억했다가 `transform`에서 항상 같은 컬럼을 만들어내므로 이 문제가 없다. 탐색 단계에서는 `get_dummies`가 편하지만 학습 코드에는 `OneHotEncoder`를 쓰는 편이 안전하다.

## 마치며

범주형 인코딩에서 실제로 결정해야 하는 건 세 가지다. 이 변수에 순서가 있는가, 카테고리가 몇 개인가, 뒤에 붙는 모델이 숫자의 크기를 보는가 분할점만 보는가. 순서가 있으면 Ordinal, 없으면서 카테고리가 적으면 One-Hot, 트리를 쓸 거라면 Label. 이 세 줄이 대부분의 상황을 덮는다.

남는 경우는 카디널리티가 수십을 넘어가는 변수다. One-Hot은 컬럼이 감당이 안 되고, Label은 트리 밖에서 못 쓰고, Frequency는 빈도가 신호일 때만 통한다. 이 구간에서는 타깃 값을 끌어와 범주를 숫자 하나로 압축하는 방법이 필요해진다. 다음 글에서 그 이야기를 한다.

## 함께 보면 좋은 글

- [피처 스케일링](/ml/feature-scaling/) : 숫자 피처의 범위를 맞추는 반대편 전처리
- [타겟 인코딩](/ml/target-encoding/) : 카디널리티가 수백을 넘을 때의 선택지
- [결정 트리](/ml/decision-tree/) : Label Encoding이 트리에서만 안전한 이유
- [XGBoost와 LightGBM](/ml/xgboost-vs-lightgbm/) : LightGBM의 자체 범주형 분할

## 참고자료

- [scikit-learn: Encoding categorical features](https://scikit-learn.org/stable/modules/preprocessing.html#encoding-categorical-features)
- [category_encoders documentation](https://contrib.scikit-learn.org/category_encoders/)
- [LightGBM: Optimal Split for Categorical Features](https://lightgbm.readthedocs.io/en/latest/Features.html#optimal-split-for-categorical-features)
