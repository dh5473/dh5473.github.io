---
date: '2026-02-03'
title: '결측치를 지울 것인가 채울 것인가'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 34
tags: ['Missing Data', '결측치', 'Imputation', 'MCAR', 'MAR', 'MNAR', 'KNN Imputer', 'MICE', '머신러닝']
summary: '결측이 무작위인지, 다른 변수로 설명되는지, 값 자체에 달렸는지에 따라 삭제와 단순 대체, KNN, MICE 중 무엇을 써야 하는지 정리한다.'
thumbnail: './thumbnail.png'
---

sklearn의 대부분 모델은 NaN이 하나만 섞여 있어도 `ValueError`를 던진다. 결측치 처리는 취향의 문제가 아니라 학습 전에 반드시 통과해야 하는 관문이다. 문제는 통과하는 길이 하나가 아니라는 데 있다.

결측이 있는 행을 전부 지우면 Titanic 데이터는 891행에서 183행으로 줄어든다. 평균으로 채우면 행 수는 지키지만 분산이 줄고 변수 사이의 상관이 흐려진다. 어느 쪽이 나은지는 남은 행 수를 세어 정할 문제가 아니다. **애초에 그 칸이 왜 비었는지**를 보고 정할 문제다.

## 결측이 생긴 이유부터 나눈다

통계학자 Donald Rubin은 결측을 세 가지로 나눴다. 기준은 하나다. 결측 여부가 무엇에 달려 있는가.

| 유형 | 결측 여부가 달린 곳 | 예 | 지우면 |
|------|------------------|-----|-------|
| **MCAR** | 아무것도 아님 | 입력자가 무작위로 한 칸씩 빠뜨림 | 편향 없음, 표본만 줄어듦 |
| **MAR** | 관측된 다른 변수 | 자영업자가 소득 항목을 자주 비움 | 남는 행이 회사원 쪽으로 쏠림 |
| **MNAR** | 가려진 값 자체 | 소득이 높을수록 소득 항목을 비움 | 남는 행의 소득이 실제보다 낮음 |

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 722" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 직업·소득 표로 결측 세 유형을 비교한 그림. MCAR은 소득 결측이 직업과 무관하게 흩어져 있고, MAR은 직업이 자영업인 행에만 결측이 몰려 있으며, MNAR은 가려진 소득값이 큰 행에만 결측이 있다.">
<style>
.md1-t { font-size: 18px; font-weight: 600; fill: var(--text, #1c1917); }
.md1-sub { font-size: 14px; fill: var(--text-muted, #6d6762); }
.md1-h { font-size: 14px; fill: var(--text-muted, #6d6762); }
.md1-v { font-size: 15px; fill: var(--text, #1c1917); }
.md1-miss { font-size: 15px; font-weight: 600; fill: var(--text-warn, #9d5604); }
.md1-ghost { font-size: 14px; fill: var(--primary, #0a756c); }
.md1-key { font-size: 15px; font-weight: 600; fill: var(--primary, #0a756c); }
.md1-cell { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.md1-cellmiss { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1; }
.md1-cellkey { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1; }
</style>
<!-- ===== MCAR ===== -->
<text class="md1-t" x="20" y="18">MCAR</text>
<text class="md1-sub" x="20" y="38">결측 위치가 아무것과도 무관</text>
<text class="md1-h" x="32" y="62">직업</text>
<text class="md1-h" x="207" y="62">소득</text>
<rect class="md1-cell" x="20" y="72" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="72" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="90">회사원</text>
<text class="md1-v" x="207" y="90">3,200</text>
<rect class="md1-cell" x="20" y="100" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="100" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="118">자영업</text>
<text class="md1-miss" x="207" y="118">?</text>
<rect class="md1-cell" x="20" y="128" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="128" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="146">회사원</text>
<text class="md1-miss" x="207" y="146">?</text>
<rect class="md1-cell" x="20" y="156" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="156" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="174">자영업</text>
<text class="md1-v" x="207" y="174">4,100</text>
<rect class="md1-cell" x="20" y="184" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="184" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="202">회사원</text>
<text class="md1-v" x="207" y="202">2,700</text>
<!-- ===== MAR ===== -->
<text class="md1-t" x="20" y="258">MAR</text>
<text class="md1-sub" x="20" y="278">결측 위치가 관측된 직업에 달림</text>
<text class="md1-h" x="32" y="302">직업</text>
<text class="md1-h" x="207" y="302">소득</text>
<rect class="md1-cell" x="20" y="312" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="312" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="330">회사원</text>
<text class="md1-v" x="207" y="330">3,200</text>
<rect class="md1-cellkey" x="20" y="340" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="340" width="185" height="26" rx="4"/>
<text class="md1-key" x="32" y="358">자영업</text>
<text class="md1-miss" x="207" y="358">?</text>
<rect class="md1-cell" x="20" y="368" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="368" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="386">회사원</text>
<text class="md1-v" x="207" y="386">2,700</text>
<rect class="md1-cellkey" x="20" y="396" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="396" width="185" height="26" rx="4"/>
<text class="md1-key" x="32" y="414">자영업</text>
<text class="md1-miss" x="207" y="414">?</text>
<rect class="md1-cellkey" x="20" y="424" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="424" width="185" height="26" rx="4"/>
<text class="md1-key" x="32" y="442">자영업</text>
<text class="md1-miss" x="207" y="442">?</text>
<!-- ===== MNAR ===== -->
<text class="md1-t" x="20" y="498">MNAR</text>
<text class="md1-sub" x="20" y="518">결측 위치가 가려진 값 자체에 달림</text>
<text class="md1-h" x="32" y="542">직업</text>
<text class="md1-h" x="207" y="542">소득</text>
<rect class="md1-cell" x="20" y="552" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="552" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="570">회사원</text>
<text class="md1-v" x="207" y="570">3,200</text>
<rect class="md1-cell" x="20" y="580" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="580" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="598">자영업</text>
<text class="md1-miss" x="207" y="598">?</text>
<text class="md1-ghost" x="224" y="598">(9,800)</text>
<rect class="md1-cell" x="20" y="608" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="608" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="626">회사원</text>
<text class="md1-v" x="207" y="626">2,700</text>
<rect class="md1-cell" x="20" y="636" width="165" height="26" rx="4"/>
<rect class="md1-cell" x="195" y="636" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="654">자영업</text>
<text class="md1-v" x="207" y="654">4,100</text>
<rect class="md1-cell" x="20" y="664" width="165" height="26" rx="4"/>
<rect class="md1-cellmiss" x="195" y="664" width="185" height="26" rx="4"/>
<text class="md1-v" x="32" y="682">회사원</text>
<text class="md1-miss" x="207" y="682">?</text>
<text class="md1-ghost" x="224" y="682">(8,600)</text>
<text class="md1-sub" x="20" y="710">괄호 안은 실제로는 관측되지 않는 값</text>
</svg>
</div>

MCAR은 결측 여부와 다른 어떤 변수도 상관이 없다. 남은 행은 전체의 축소판이라 지워도 분포가 그대로다. MAR은 이름이 오해를 부르는데, 무작위라는 뜻이 아니라 **결측 패턴이 관측된 변수로 설명된다**는 뜻이다. 자영업자가 소득을 자주 비운다면 결측 여부는 직업이 결정하고, 직업은 데이터에 남아 있다. 그러니 직업 정보를 쓰는 대체법이 통한다.

MNAR은 결측 여부가 가려진 값 자체에 달려 있다. 소득이 높은 사람이 소득을 비운다면, 관측된 소득만 보고는 안 보이는 소득이 얼마나 높았는지 알 길이 없다. 이 경우 어떤 대체법을 써도 편향이 남는다. 평균 대체는 물론이고 KNN이나 MICE처럼 정교한 방법도 마찬가지다. 그 방법들은 전부 **관측된 값들이 안 보이는 값을 대변한다**는 가정 위에 서 있는데, MNAR은 정확히 그 가정이 깨진 상황이기 때문이다.

:::warning

**유형은 데이터가 알려주지 않는다**

Little's MCAR 검정은 MCAR 가설을 기각할 수 있을 뿐이다. 기각되었을 때 그게 MAR인지 MNAR인지는 구별해주지 못한다. 두 유형의 차이는 안 보이는 값에 있고, 안 보이는 값은 데이터에 없다.

MNAR 여부는 도메인 지식에서 판단한다. 고액 연봉자가 소득을 비운다는 것, 상태가 나쁜 환자가 추적 조사에 응하지 않는다는 것. 이런 건 수집 과정을 아는 사람만 안다.

:::

## 현황부터 본다

전략을 세우기 전에 결측의 규모와 패턴을 확인한다.

```python
import pandas as pd

# Kaggle Titanic train.csv (891행). 컬럼명은 모두 소문자로 바꿔 둔 상태다
df = pd.read_csv('titanic.csv')

missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(1)

info = pd.DataFrame({'count': missing, 'pct': missing_pct})
print(info[info['count'] > 0].sort_values('pct', ascending=False))
```

```text
          count   pct
cabin       687  77.1
age         177  19.9
embarked      2   0.2
```

`cabin`은 77%, `age`는 20%, `embarked`는 0.2%다. 세 컬럼에 같은 전략을 쓸 이유가 전혀 없다는 게 이 표에서 바로 보인다.

숫자만으로는 **패턴**을 놓친다. `missingno`의 매트릭스 플롯에서 흰 줄무늬가 여러 컬럼의 같은 위치에 나타나면, 그 컬럼들이 함께 비어 있다는 뜻이다. 한 번의 수집 실패로 여러 필드가 통째로 빠졌을 때 이런 모양이 나온다. `msno.heatmap(df)`는 이 동반 결측을 상관계수로 보여준다.

```python
import missingno as msno

msno.matrix(df)    # 흰색이 결측
msno.heatmap(df)   # 결측끼리의 상관
```

## 지우기

가장 단순한 전략은 결측이 있는 데이터를 버리는 것이다.

```python
df.dropna()                 # 891행 → 183행
df.dropna(subset=['age'])   # 891행 → 714행
```

전체 `dropna()`가 891행을 183행으로 만드는 건 `cabin`의 77% 결측 때문이다. 컬럼 하나 때문에 데이터의 80%를 버리는 셈이라, 이럴 때는 행이 아니라 그 컬럼을 지운다.

```python
cols_to_drop = missing_pct[missing_pct > 50].index
df_clean = df.drop(columns=cols_to_drop)
```

다만 `cabin`이 기록된 승객은 대부분 1등석이었다. 결측 여부 자체가 등급 정보를 담고 있다는 뜻이다. 컬럼을 지우기 전에 결측 지시 변수를 먼저 만들어 두면 그 정보만 건져 낼 수 있다.

| 삭제가 안전한 조건 | 삭제가 위험한 조건 |
|---|---|
| MCAR이고 결측 비율이 5% 이하 | MAR·MNAR이라 남는 행이 한쪽으로 쏠림 |
| 지우고도 표본이 충분히 남음 | 결측이 여러 컬럼에 흩어져 있어 행 삭제로 대부분이 사라짐 |

## 단순 대체

빈칸을 대푯값 하나로 채운다. sklearn에서는 `SimpleImputer`다.

```python
from sklearn.impute import SimpleImputer

num_imputer = SimpleImputer(strategy='median')       # 수치형
df[['age']] = num_imputer.fit_transform(df[['age']])

cat_imputer = SimpleImputer(strategy='most_frequent')  # 범주형
df[['embarked']] = cat_imputer.fit_transform(df[['embarked']])
```

| 전략 | 쓰는 곳 | 대가 |
|------|--------|------|
| `mean` | 정규분포에 가까운 수치형 | 이상치에 끌려감, 분산 축소 |
| `median` | 치우친 분포, 이상치가 있는 수치형 | 이상치에는 강하지만 분산은 마찬가지로 축소 |
| `most_frequent` | 범주형 | 범주가 많으면 최빈값의 대표성이 약해짐 |
| `constant` | 결측 자체에 의미가 있을 때 | 0이나 -1이 실제 값과 섞이지 않는지 확인 필요 |

분산 축소는 감으로 하는 말이 아니라 계산되는 양이다. 관측값 $n$개의 표본분산이 $s^2$인데 여기에 평균값 $m$개를 채워 넣으면, 채운 값들의 편차가 정확히 0이라 제곱합은 그대로이고 자유도만 늘어난다.

$$s^2_{\text{대체 후}} = \frac{n-1}{n+m-1}\, s^2$$

관측값 다섯 개에 평균을 세 개 채우면 분산은 $4/7$, 즉 원래의 57%로 줄어든다. 표준오차와 신뢰구간이 실제보다 좁아지고, 이 변수와 다른 변수의 상관도 같이 흐려진다.

:::info

**단순 대체는 불확실성을 지운다**

빈칸의 진짜 값은 30일 수도 50일 수도 있는 상태다. 평균 대체는 여기에 "30이다"라고 확정을 찍는다. 모델은 그 값이 추정치라는 사실을 알 방법이 없고, 관측된 값과 똑같은 무게로 학습한다.

결측 비율이 5% 이하이고 MCAR이면 이 왜곡이 무시할 만하다. 그 밖에는 더 나은 방법이 있다.

:::

## 결측 지시 변수

값을 채우면 "여기가 비어 있었다"는 사실이 사라진다. 그 사실이 예측에 쓸모 있을 때는 컬럼 하나로 남긴다.

```python
df['age_is_missing'] = df['age'].isnull().astype(int)
df[['age']] = SimpleImputer(strategy='median').fit_transform(df[['age']])
```

MNAR이 의심될 때 특히 값어치가 있다. 결측 여부가 가려진 값과 엮여 있다면 지시 변수 자체가 그 값의 대리 신호다. 트리 모델은 이 컬럼을 분기 조건으로 바로 쓸 수 있어서 궁합이 좋다. 반대로 MCAR이면 지시 변수는 무작위 노이즈일 뿐이고, 결측 비율이 1%도 안 되면 분산이 거의 0이라 모델이 쳐다보지도 않는다.

## KNN Imputer

30대 회사원의 빠진 소득을 채우는 데 전체 평균을 쓰는 건 아깝다. 조건이 비슷한 사람들의 소득이 데이터 안에 이미 있기 때문이다. `KNNImputer`는 결측이 없는 나머지 피처로 거리를 재서 가장 가까운 K개 행을 찾고, 그 행들의 값으로 빈칸을 채운다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 372" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="나이가 비어 있는 행 하나를 채우는 두 방식 비교. 전체 다섯 행의 나이 평균은 32.4이고, 요금과 등급이 가까운 이웃 세 행만 골라 평균을 내면 38이다.">
<style>
.md2-t { font-size: 18px; font-weight: 600; fill: var(--text, #1c1917); }
.md2-h { font-size: 14px; fill: var(--text-muted, #6d6762); }
.md2-v { font-size: 15px; fill: var(--text, #1c1917); }
.md2-near { font-size: 15px; font-weight: 600; fill: var(--primary, #0a756c); }
.md2-miss { font-size: 15px; font-weight: 600; fill: var(--text-warn, #9d5604); }
.md2-sub { font-size: 14px; fill: var(--text-muted, #6d6762); }
.md2-on { font-size: 15px; font-weight: 600; fill: var(--on-fill, #ffffff); }
.md2-cell { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.md2-cellnear { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1; }
.md2-cellmiss { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1; }
.md2-tagnear { fill: var(--primary, #0a756c); }
.md2-tagmiss { fill: var(--text-warn, #9d5604); }
.md2-boxall { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.md2-boxknn { fill: var(--primary, #0a756c); }
</style>
<text class="md2-t" x="20" y="20">나이 한 칸을 채우는 두 방식</text>
<text class="md2-h" x="32" y="46">요금</text>
<text class="md2-h" x="158" y="46">등급</text>
<text class="md2-h" x="266" y="46">나이</text>
<!-- 대상 행 -->
<rect class="md2-tagmiss" x="12" y="56" width="4" height="28" rx="2"/>
<rect class="md2-cell" x="20" y="56" width="118" height="28" rx="4"/>
<rect class="md2-cell" x="146" y="56" width="100" height="28" rx="4"/>
<rect class="md2-cellmiss" x="254" y="56" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="75">71</text>
<text class="md2-v" x="158" y="75">1</text>
<text class="md2-miss" x="266" y="75">?</text>
<!-- 이웃 1 -->
<rect class="md2-tagnear" x="12" y="86" width="4" height="28" rx="2"/>
<rect class="md2-cellnear" x="20" y="86" width="118" height="28" rx="4"/>
<rect class="md2-cellnear" x="146" y="86" width="100" height="28" rx="4"/>
<rect class="md2-cellnear" x="254" y="86" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="105">76</text>
<text class="md2-v" x="158" y="105">1</text>
<text class="md2-near" x="266" y="105">40</text>
<!-- 이웃 2 -->
<rect class="md2-tagnear" x="12" y="116" width="4" height="28" rx="2"/>
<rect class="md2-cellnear" x="20" y="116" width="118" height="28" rx="4"/>
<rect class="md2-cellnear" x="146" y="116" width="100" height="28" rx="4"/>
<rect class="md2-cellnear" x="254" y="116" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="135">66</text>
<text class="md2-v" x="158" y="135">1</text>
<text class="md2-near" x="266" y="135">36</text>
<!-- 이웃 3 -->
<rect class="md2-tagnear" x="12" y="146" width="4" height="28" rx="2"/>
<rect class="md2-cellnear" x="20" y="146" width="118" height="28" rx="4"/>
<rect class="md2-cellnear" x="146" y="146" width="100" height="28" rx="4"/>
<rect class="md2-cellnear" x="254" y="146" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="165">80</text>
<text class="md2-v" x="158" y="165">1</text>
<text class="md2-near" x="266" y="165">38</text>
<!-- 먼 행 1 -->
<rect class="md2-cell" x="20" y="176" width="118" height="28" rx="4"/>
<rect class="md2-cell" x="146" y="176" width="100" height="28" rx="4"/>
<rect class="md2-cell" x="254" y="176" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="195">13</text>
<text class="md2-v" x="158" y="195">3</text>
<text class="md2-v" x="266" y="195">22</text>
<!-- 먼 행 2 -->
<rect class="md2-cell" x="20" y="206" width="118" height="28" rx="4"/>
<rect class="md2-cell" x="146" y="206" width="100" height="28" rx="4"/>
<rect class="md2-cell" x="254" y="206" width="126" height="28" rx="4"/>
<text class="md2-v" x="32" y="225">8</text>
<text class="md2-v" x="158" y="225">3</text>
<text class="md2-v" x="266" y="225">26</text>
<!-- 결과 -->
<rect class="md2-boxall" x="20" y="252" width="360" height="38" rx="6"/>
<text class="md2-v" x="36" y="276">전체 5행 평균 대체 → 32.4</text>
<rect class="md2-boxknn" x="20" y="298" width="360" height="38" rx="6"/>
<text class="md2-on" x="36" y="322">이웃 3행 평균 대체 → 38</text>
<text class="md2-sub" x="20" y="358">이웃 = 요금·등급이 가까운 행</text>
</svg>
</div>

```python
from sklearn.impute import KNNImputer

imputer = KNNImputer(n_neighbors=5, weights='distance')
df_imputed = imputer.fit_transform(df[numeric_cols])
```

`weights='distance'`를 주면 가까운 이웃일수록 큰 가중치를 받는다. 거리는 `nan_euclidean` 방식으로 계산해서, 두 행 중 한쪽이라도 비어 있는 좌표는 건너뛰고 남은 좌표로 잰 거리를 전체 차원 수에 맞춰 보정한다. 그래서 다른 컬럼에도 결측이 있는 상태로 바로 넣을 수 있다.

쓰기 전에 확인할 것이 세 가지다.

- **스케일링이 먼저다.** 거리 기반이라 연봉(수천만 단위)과 나이(수십 단위)를 그대로 넣으면 연봉 차이가 거리를 통째로 지배한다. `StandardScaler`는 NaN을 무시하고 fit한 뒤 그대로 통과시키므로, 스케일링을 먼저 걸고 그다음 `KNNImputer`를 놓는 순서가 가능하다.
- **수치형만 받는다.** 범주형은 미리 인코딩하거나 `SimpleImputer(strategy='most_frequent')`로 따로 처리한다.
- **K는 5에서 10 사이.** 너무 작으면 이웃 한둘의 노이즈를 그대로 베끼고, 너무 크면 결국 전체 평균에 수렴한다.

계산 비용도 만만치 않다. 결측이 있는 행마다 나머지 전체와 거리를 재므로 비용이 행 수의 제곱에 비례해서 늘어난다. 행이 열 배가 되면 시간은 백 배가 된다.

## IterativeImputer와 MICE

KNN이 이웃에서 값을 빌려온다면, `IterativeImputer`는 **모델로 값을 예측한다**. 결측이 있는 컬럼을 차례로 타겟으로 삼아, 나머지 컬럼으로 그 값을 회귀한다.

| 라운드 | 하는 일 |
|------|--------|
| 1 | `age`를 `[fare, pclass, sibsp]`로 회귀해 채우고, 이어서 `fare`를 `[age(방금 채운 값), pclass, sibsp]`로 회귀해 채운다 |
| 2 | 갱신된 `fare`로 `age`를 다시 예측하고, 갱신된 `age`로 `fare`를 다시 예측한다 |
| N | 대체값의 변화가 `tol` 아래로 떨어지거나 `max_iter`에 닿을 때까지 |

첫 라운드에서 `age`를 채울 때 쓴 `fare`는 아직 조잡한 초기 대체값이다. 그 `fare`가 다음 차례에 갱신되면 `age`도 다시 계산할 이유가 생긴다. 반복은 이 상호 의존을 풀기 위한 것이다. 통계학에서 연쇄 방정식(chained equations)이라 부르는 구조이고, MICE라는 이름이 여기서 나온다.

```python
from sklearn.experimental import enable_iterative_imputer  # 이 줄이 먼저다
from sklearn.impute import IterativeImputer
from sklearn.linear_model import BayesianRidge

imputer = IterativeImputer(estimator=BayesianRidge(), max_iter=10, random_state=42)
df_imputed = imputer.fit_transform(df[numeric_cols])
```

`enable_iterative_imputer`를 import하지 않고 `IterativeImputer`를 부르면 `ImportError`가 난다. sklearn에서 아직 experimental 단계라 명시적으로 켜야 하고, 이는 향후 버전에서 동작이 바뀔 수 있다는 뜻이기도 하다.

기본 추정기는 `BayesianRidge`이고, 선형으로 설명되지 않는 관계라면 `RandomForestRegressor`로 바꿀 수 있다. R의 missForest가 쓰는 방식이 이것인데, 컬럼 수 × 라운드 수만큼 랜덤 포레스트를 학습하므로 비용이 급격히 커진다.

### 다중 대체는 기본값이 아니다

MICE의 M은 Multiple, 다중 대체다. 그런데 위 코드가 돌려주는 건 완성된 데이터셋 **하나**다. sklearn의 `IterativeImputer`는 기본적으로 단일 대체(single imputation)로 동작한다.

차이는 불확실성을 남기느냐다. 단일 대체는 빈칸마다 값 하나를 확정하고, 이후 분석은 그 값을 관측값과 똑같이 취급한다. 대체값이 추정이었다는 사실이 표준오차에 반영되지 않아 신뢰구간이 실제보다 좁아진다. 진짜 다중 대체는 `sample_posterior=True`로 두고 `random_state`를 바꿔가며 $m$번 돌려서 서로 다른 완성 데이터셋 $m$개를 만들고, 각각에 같은 분석을 돌린 뒤 결과를 합친다.

```python
imputers = [
    IterativeImputer(sample_posterior=True, max_iter=10, random_state=seed)
    for seed in range(5)
]
datasets = [imp.fit_transform(X) for imp in imputers]
```

합칠 때 쓰는 것이 Rubin's rules다. 추정치는 $m$개의 평균을 쓰고, 분산은 두 몫을 더한다.

$$T = \bar{U} + \left(1 + \frac{1}{m}\right) B$$

$\bar{U}$는 각 데이터셋 안에서 나온 분산의 평균이고, $B$는 $m$개 추정치가 서로 갈라진 정도다. 두 번째 항이 바로 단일 대체가 잃어버리는 몫이다. 대체값을 바꿨을 때 결론이 흔들린다면 그 흔들림이 결과의 불확실성에 포함되어야 한다는 뜻이다.

예측 모델을 만드는 게 목적이라면 단일 대체로 충분한 경우가 많다. 계수의 신뢰구간이나 p값을 보고해야 하는 분석이라면 다중 대체가 필요하다.

## 시계열에는 순서라는 정보가 있다

행의 순서가 의미를 갖는 데이터라면 앞뒤 값을 쓸 수 있다.

```python
df['temp'] = df['temp'].ffill()                          # 직전 값 유지
df['temp'] = df['temp'].interpolate(method='linear')     # 두 관측값 사이 직선
df['temp'] = df['temp'].interpolate(method='time')       # 시간 간격 반영
```

08:00에 20.0, 11:00에 22.5가 관측되고 그 사이가 비어 있다면, `ffill`은 09:00과 10:00을 둘 다 20.0으로 채운다. 선형 보간은 20.83과 21.67로 채운다.

| 방법 | 깔고 가는 가정 | 맞는 데이터 |
|------|--------------|-----------|
| `ffill` | 값이 바뀔 때까지 유지된다 | 주가, 재고, 상태 플래그 |
| `bfill` | 미래 값으로 소급해도 된다 | 사후 분석용, 실시간 추론에는 누수 |
| 선형 보간 | 두 점 사이가 직선에 가깝다 | 온도, 센서처럼 연속적으로 변하는 값 |
| 시간 보간 | 변화가 시간 간격에 비례한다 | 측정 간격이 들쭉날쭉한 로그 |

## 트리 부스팅은 NaN을 그대로 받는다

XGBoost는 분기를 만들 때 결측 샘플을 왼쪽으로 보낸 경우와 오른쪽으로 보낸 경우의 손실을 둘 다 계산하고, 이득이 큰 쪽을 그 분기의 기본 방향으로 학습해 둔다. 결측 처리 규칙 자체가 학습 대상이 되는 셈이다. LightGBM도 `use_missing=True`가 기본값이라 같은 일을 한다.

```python
import xgboost as xgb

model = xgb.XGBClassifier(n_estimators=100)
model.fit(X_train, y_train)   # X_train에 NaN이 있어도 에러가 나지 않는다
```

이런 모델에서는 미리 평균 대체를 해 봐야 얻는 게 없다. 오히려 모델이 스스로 찾을 분기 방향을 사람이 임의로 덮어쓰는 꼴이 된다. NaN을 그대로 두고 필요하면 결측 지시 변수만 얹는 편이 낫다.

sklearn 쪽에서도 `HistGradientBoostingClassifier`와 `HistGradientBoostingRegressor`는 결측을 자체 처리한다. 로지스틱 회귀, SVM, KNN 같은 나머지 추정기는 여전히 NaN을 받지 못한다.

## 대체는 fold 안에서 해야 한다

가장 흔한 실수는 전체 데이터로 대체한 다음 분할하는 것이다.

```python
imputer = SimpleImputer(strategy='mean')
X_imputed = imputer.fit_transform(X)          # 테스트 행까지 포함한 평균
X_train, X_test = train_test_split(X_imputed, test_size=0.2)
```

이 평균에는 테스트 행의 값이 들어가 있다. 검증 점수가 실제 성능보다 높게 나오고, 그 차이는 배포 후에 드러난다. `Pipeline`에 넣으면 각 fold에서 훈련 데이터로만 fit하고 검증 데이터에는 transform만 적용한다.

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

# StandardScaler가 NaN을 그대로 통과시키므로 스케일링을 먼저 걸 수 있다
numeric = Pipeline([
    ('scaler', StandardScaler()),
    ('imputer', KNNImputer(n_neighbors=5)),
])
categorical = Pipeline([
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('encoder', OneHotEncoder(handle_unknown='ignore')),
])

pre = ColumnTransformer([
    ('num', numeric, ['age', 'fare']),
    ('cat', categorical, ['embarked', 'sex']),
])

pipe = Pipeline([('pre', pre), ('model', LogisticRegression())])
scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
```

## 무엇을 고를 것인가

| 상황 | 선택 |
|------|------|
| 결측 5% 미만, MCAR | `SimpleImputer(median)` 또는 `most_frequent` |
| 결측 5~30%, MAR, 선형·거리 기반 모델 | 스케일링 후 `KNNImputer` 또는 `IterativeImputer` |
| 결측 30~50%, MNAR 의심 | 결측 지시 변수 + 단순 대체 |
| 결측 50% 초과 | 컬럼 제거, 지시 변수만 남김 |
| XGBoost·LightGBM·HistGradientBoosting | NaN 그대로 + 결측 지시 변수 |
| 순서가 있는 데이터 | `ffill` 또는 `interpolate` |
| 계수와 신뢰구간을 보고해야 하는 분석 | `sample_posterior=True`로 다중 대체 |

## 마치며

결측치 처리에서 방법의 정교함은 생각보다 덜 중요하다. 결측 비율이 낮으면 median 대체와 MICE는 거의 같은 결과를 낸다. 대체법을 비교하는 데 시간을 쓰기 전에 결측이 왜 생겼는지를 먼저 묻는 편이 낫다. MCAR이면 어느 방법을 써도 큰 차이가 없고, MNAR이면 어느 방법을 써도 편향이 남는다. 방법 선택이 실제로 갈리는 구간은 MAR 하나뿐이다.

방법 선택보다 확실하게 성능을 망치는 요인은 따로 있다. 전체 데이터로 대체한 뒤 분할하는 누수다. 이건 정교함의 문제가 아니라 순서의 문제이고, 전처리를 `Pipeline`으로 묶는 것만으로 원천 차단된다.

## 함께 보면 좋은 글

- [피처 스케일링](/ml/feature-scaling/) : KNN 대체 전에 반드시 거쳐야 하는 단계
- [범주형 인코딩](/ml/categorical-encoding/) : 문자열 컬럼을 대체 가능한 형태로 바꾸는 방법
- [교차 검증](/ml/cross-validation/) : 대체를 fold 안에서만 해야 하는 이유

## 참고자료

- [scikit-learn: Imputation of missing values](https://scikit-learn.org/stable/modules/impute.html)
- [Stef van Buuren, Flexible Imputation of Missing Data, 1.2 Concepts of MCAR, MAR and MNAR](https://stefvanbuuren.name/fimd/sec-MCAR.html)
- [Stef van Buuren, Flexible Imputation of Missing Data, 5.2 Parameter pooling](https://stefvanbuuren.name/fimd/sec-pooling.html)
- [Stef van Buuren, Karin Groothuis-Oudshoorn, "mice: Multivariate Imputation by Chained Equations in R" (JSS 45-3, 2011)](https://www.jstatsoft.org/article/view/v045i03)
- [Tianqi Chen, Carlos Guestrin, "XGBoost: A Scalable Tree Boosting System" (KDD 2016)](https://arxiv.org/abs/1603.02754)
