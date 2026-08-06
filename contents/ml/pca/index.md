---
date: '2026-02-06'
title: '분산이 가장 큰 방향으로 축을 다시 잡는 PCA'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 37
tags: ['PCA', '주성분 분석', '차원 축소', 'Dimensionality Reduction', '고유값 분해', 'SVD', '설명 분산 비율', '머신러닝']
summary: '분산이 최대인 방향을 새 축으로 잡아 차원을 줄이는 PCA의 원리. 공분산 행렬의 고유벡터가 주성분이 되는 이유, 설명 분산 비율로 성분 수를 정하는 기준, 표준화가 먼저여야 하는 이유.'
thumbnail: './thumbnail.png'
---

피처가 100개인 데이터셋에서는 이상한 일이 벌어진다. 공간이 너무 넓어서 데이터가 극도로 희소하게 흩어지고, 두 점 사이의 거리가 전부 고만고만해진다. "가장 가까운 이웃"이라는 개념부터 흔들리고, 어떤 모델이든 일반화가 어려워진다. 차원마다 열 칸씩만 잡아 격자를 채우려 해도 $10^{100}$ 개의 샘플이 필요하다. 차원의 저주(curse of dimensionality)다.

빠져나갈 길은 두 가지다. 하나는 피처 선택으로, 쓸모없는 피처를 골라내 **버린다**. 다른 하나는 차원 축소로, 기존 피처들을 조합해 더 적은 수의 새 축을 **만든다**. PCA(Principal Component Analysis, 주성분 분석)가 두 번째 길의 표준이다.

## 분산이 가장 큰 방향으로 축을 다시 잡는다

PCA를 한 문장으로 줄이면 이렇다. 데이터의 분산이 가장 큰 방향을 새 축으로 잡고, 그 축 위로 데이터를 사영(projection)한다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="2차원 산점도에서 분산이 가장 큰 대각선 방향을 제1주성분 축으로 잡고, 각 점을 그 축에 수직으로 사영해 1차원 좌표만 남기는 과정">
<defs>
<marker id="pcaAxTip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)" fill-opacity="0.5"/></marker>
</defs>
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">분산이 최대인 방향이 제1주성분</text>
<!-- 위 패널: 2차원 산점도와 PC1 축 -->
<text x="30" y="48" font-size="14" fill="var(--text-muted, #6d6762)">위: 2차원 데이터와 PC1 축</text>
<line x1="52" y1="262" x2="358" y2="262" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.5" stroke-width="1.5" marker-end="url(#pcaAxTip)"/>
<line x1="52" y1="262" x2="52" y2="68" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.5" stroke-width="1.5" marker-end="url(#pcaAxTip)"/>
<text x="362" y="267" font-size="14" fill="var(--text-muted, #6d6762)">x1</text>
<text x="46" y="76" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">x2</text>
<!-- PC1 / PC2 축 -->
<line x1="94" y1="248" x2="317" y2="70" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<line x1="181" y1="129" x2="229" y2="189" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" stroke-dasharray="4 3"/>
<text x="326" y="78" font-size="15" font-weight="700" fill="var(--primary, #0a756c)">PC1</text>
<text x="236" y="196" font-size="14" fill="var(--text-muted, #6d6762)">PC2</text>
<!-- 원본 데이터 점 -->
<g fill="var(--text-muted, #6d6762)">
<circle cx="130" cy="241" r="4.5"/><circle cx="119" cy="201" r="4.5"/><circle cx="152" cy="216" r="4.5"/><circle cx="153" cy="182" r="4.5"/><circle cx="187" cy="198" r="4.5"/><circle cx="181" cy="156" r="4.5"/><circle cx="219" cy="168" r="4.5"/><circle cx="210" cy="130" r="4.5"/><circle cx="250" cy="145" r="4.5"/><circle cx="244" cy="111" r="4.5"/><circle cx="278" cy="119" r="4.5"/><circle cx="277" cy="81" r="4.5"/>
</g>
<!-- PC1 축으로의 수직 사영 -->
<g stroke="var(--accent, #9d5604)" stroke-width="1.5" stroke-dasharray="3 3">
<line x1="119" y1="201" x2="132" y2="217"/><line x1="187" y1="198" x2="175" y2="183"/><line x1="250" y1="145" x2="239" y2="131"/><line x1="277" y1="81" x2="287" y2="94"/>
</g>
<g fill="var(--accent, #9d5604)">
<circle cx="132" cy="217" r="4.5"/><circle cx="175" cy="183" r="4.5"/><circle cx="239" cy="131" r="4.5"/><circle cx="287" cy="94" r="4.5"/>
</g>
<text x="100" y="216" text-anchor="end" font-size="14" fill="var(--accent, #9d5604)">사영</text>
<!-- 아래 패널: PC1 좌표만 남은 1차원 -->
<text x="30" y="302" font-size="14" fill="var(--text-muted, #6d6762)">아래: PC1에 사영한 1차원 결과</text>
<line x1="55" y1="340" x2="348" y2="340" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<text x="354" y="345" font-size="14" fill="var(--primary, #0a756c)">PC1</text>
<g fill="var(--accent, #9d5604)">
<circle cx="70" cy="340" r="4.5"/><circle cx="90" cy="340" r="4.5"/><circle cx="109" cy="340" r="4.5"/><circle cx="135" cy="340" r="4.5"/><circle cx="155" cy="340" r="4.5"/><circle cx="181" cy="340" r="4.5"/><circle cx="207" cy="340" r="4.5"/><circle cx="226" cy="340" r="4.5"/><circle cx="252" cy="340" r="4.5"/><circle cx="272" cy="340" r="4.5"/><circle cx="298" cy="340" r="4.5"/><circle cx="324" cy="340" r="4.5"/>
</g>
<text x="200" y="374" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">버려지는 성분 = PC2</text>
</svg>
</div>

2차원 데이터를 1차원으로 줄인다고 하자. x1 축에 사영하면 x2 방향의 정보가 통째로 사라지고, x2 축에 사영하면 반대가 된다. 그런데 데이터가 실제로 퍼져 있는 대각선 방향에 사영하면 손실이 훨씬 적다. 점들 사이의 차이가 이 방향에 거의 다 담겨 있기 때문이다.

이 대각선 축이 제1주성분(PC1)이다. PC1과 직교하면서 남은 분산이 가장 큰 방향이 PC2, 그다음이 PC3이다. 피처가 $d$ 개면 주성분도 최대 $d$ 개 나오고 서로 전부 직교한다. 차원 축소는 여기서 나온다. $d$ 개 중 분산이 큰 상위 $k$ 개만 남기면 $d$ 차원이 $k$ 차원이 된다.

한 가지 덧붙일 것이 있다. 분산을 최대로 보존하는 방향은 사영 오차(원래 점과 사영된 점 사이의 거리)의 제곱합을 최소로 만드는 방향과 정확히 같다. 피타고라스 정리로 바로 나온다. 원점에서 점까지의 거리 제곱은 축 방향 성분과 수직 성분의 제곱 합이고, 전자가 커지면 후자는 자동으로 작아진다. "분산을 최대한 보존한다"와 "가장 적게 뭉갠다"는 같은 말이다.

## 주성분은 공분산 행렬의 고유벡터다

먼저 각 피처의 평균을 빼서 데이터를 원점으로 옮긴다(센터링). 평균이 0이 아니면 데이터가 원점에서 얼마나 떨어져 있는지와 얼마나 퍼져 있는지가 뒤섞여서, 분산 대신 엉뚱한 것을 재게 된다.

센터링된 $X$ ($n \times d$ 행렬)로 공분산 행렬을 만든다.

$$\Sigma = \frac{1}{n-1} X^\top X$$

$\Sigma$ 는 $d \times d$ 대칭 행렬이다. 대각 원소는 각 피처의 분산이고, 비대각 원소는 두 피처가 함께 움직이는 정도다. 앞의 상수를 $\frac{1}{n}$ 으로 쓰는 문헌도 많은데, 고유벡터는 그대로고 고유값의 크기만 달라진다.

어떤 단위벡터 $v$ 방향으로 사영했을 때의 분산은 $v^\top \Sigma v$ 로 쓸 수 있다. 이 값을 $\|v\| = 1$ 조건에서 최대화하는 문제의 답이 $\Sigma$ 의 고유벡터다.

$$\Sigma v = \lambda v$$

고유벡터 $v$ 가 주성분의 방향, 고유값 $\lambda$ 가 그 방향의 분산이다. $\Sigma$ 는 대칭 행렬이므로 고유벡터들이 항상 서로 직교하고, 어떤 방향의 분산도 음수일 수 없으니 고유값은 모두 0 이상이다. 주성분들이 직교 좌표계를 이룬다는 성질은 따로 강제한 것이 아니라 여기서 공짜로 따라온다.

각 주성분이 전체 분산의 몇 퍼센트를 설명하는지는 고유값의 비율로 바로 읽힌다.

$$\text{설명 분산 비율}_i = \frac{\lambda_i}{\sum_j \lambda_j}$$

sklearn의 `explained_variance_ratio_` 가 이 값이다.

### 실행은 SVD가 한다

수식은 공분산 행렬을 거치지만, sklearn의 `PCA` 는 $\Sigma$ 를 만들지 않는다. 센터링된 $X$ 를 곧바로 특이값 분해(SVD)한다.

$$X = U S V^\top \quad \Longrightarrow \quad X^\top X = V S^2 V^\top$$

$V$ 의 열이 곧 $\Sigma$ 의 고유벡터고, 고유값은 $\lambda_i = s_i^2 / (n-1)$ 이다. 두 경로의 결과는 같다.

굳이 SVD로 도는 이유는 수치 안정성이다. $X^\top X$ 를 명시적으로 계산하면 행렬의 조건수가 제곱이 되어, 작은 고유값 쪽의 정밀도가 먼저 무너진다. 피처가 수만 개면 $d \times d$ 행렬 자체가 메모리에 들어가지 않기도 한다. 고유값 분해는 PCA가 무엇을 하는지 설명하는 언어이고, 계산은 SVD가 맡는다고 보면 된다.

```python
import numpy as np

np.random.seed(42)
X = np.random.multivariate_normal([3, 7], [[2.5, 1.8], [1.8, 1.5]], size=200)

X_centered = X - X.mean(axis=0)
eigenvalues, eigenvectors = np.linalg.eigh(np.cov(X_centered, rowvar=False))

idx = np.argsort(eigenvalues)[::-1]      # eigh는 오름차순으로 반환한다
eigenvalues, eigenvectors = eigenvalues[idx], eigenvectors[:, idx]

X_pca = X_centered @ eigenvectors[:, :1]  # PC1 하나로 사영

print(np.round(eigenvalues, 3))
print(np.round(eigenvalues / eigenvalues.sum(), 4))
print(X_pca.shape)
```

```text
[3.549 0.123]
[0.9666 0.0334]
(200, 1)
```

두 피처의 공분산이 1.66으로 컸던 탓에 PC1 하나가 전체 분산의 96.7%를 가져간다. 상관이 강한 피처 두 개가 사실은 하나의 축이었다는 뜻이다.

## 표준화가 먼저다

PCA는 분산이 큰 방향을 찾는다. 그런데 분산의 크기는 단위에 딸려 있다. 연봉을 원 단위로 적으면 분산이 $10^{14}$ 급이고, 근속 연수는 기껏해야 수십이다. 이 상태로 PCA를 돌리면 PC1은 사실상 연봉 축 그 자체가 되고, 나머지 피처는 그림에서 사라진다. 연봉만 만원 단위로 바꿔 적어도 결과가 통째로 달라진다.

그래서 각 피처를 평균 0, 표준편차 1로 맞춘 뒤 PCA를 거는 것이 기본 절차다. `StandardScaler` 를 앞에 붙이면 공분산 행렬 대신 상관 행렬을 분해하는 것과 같아진다.

:::warning

**모든 피처가 같은 단위면 표준화가 오히려 손해일 수 있다.**

이미지 픽셀 밝기, 같은 계측기에서 나온 여러 채널, 종목별 로그 수익률처럼 단위가 처음부터 통일된 데이터라면 피처 간 분산 차이 자체가 정보다. 표준화는 그 차이를 지운다.

판단 기준은 하나다. 피처끼리 분산을 비교하는 것이 의미 있는 데이터인가. 아니라면 표준화하고, 맞다면 그대로 둔다.

:::

## 주성분을 몇 개 남길 것인가

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="유방암 데이터 30개 피처를 표준화해 PCA를 적용한 결과. 주성분별 설명 분산 비율 막대와 누적 곡선을 겹쳐 그렸고, 누적선이 PC10에서 95% 기준선을 넘는다.">
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">누적 설명 분산이 95%를 넘는 지점</text>
<line x1="55" y1="240" x2="358" y2="240" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.5" stroke-width="1.5"/>
<line x1="55" y1="240" x2="55" y2="48" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.5" stroke-width="1.5"/>
<text x="48" y="245" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">0%</text>
<text x="48" y="64" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">95%</text>
<line x1="55" y1="60" x2="358" y2="60" stroke="var(--text-muted, #6d6762)" stroke-width="1.2" stroke-dasharray="5 4"/>
<!-- 개별 설명 분산 비율 막대 (PC1~PC10) -->
<g fill="var(--bg-muted, #eeecea)" stroke="var(--text-muted, #6d6762)" stroke-width="1">
<rect x="60" y="156" width="20" height="84"/><rect x="90" y="204" width="20" height="36"/><rect x="120" y="222" width="20" height="18"/><rect x="150" y="228" width="20" height="12"/><rect x="180" y="230" width="20" height="10"/><rect x="210" y="232" width="20" height="8"/><rect x="240" y="236" width="20" height="4"/><rect x="270" y="237" width="20" height="3"/><rect x="300" y="237" width="20" height="3"/><rect x="330" y="238" width="20" height="2"/>
</g>
<!-- 누적 곡선 -->
<polyline points="70,156 100,120 130,102 160,89 190,79 220,71 250,67 280,64 310,61 340,59" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<g fill="var(--primary, #0a756c)">
<circle cx="70" cy="156" r="3"/><circle cx="100" cy="120" r="3"/><circle cx="130" cy="102" r="3"/><circle cx="160" cy="89" r="3"/><circle cx="190" cy="79" r="3"/><circle cx="220" cy="71" r="3"/><circle cx="250" cy="67" r="3"/><circle cx="280" cy="64" r="3"/><circle cx="310" cy="61" r="3"/>
</g>
<!-- 95% 돌파 지점 -->
<line x1="340" y1="240" x2="340" y2="59" stroke="var(--accent, #9d5604)" stroke-width="1.5" stroke-dasharray="4 3"/>
<circle cx="340" cy="59" r="6" fill="var(--accent, #9d5604)"/>
<text x="70" y="258" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">PC1</text>
<text x="340" y="258" text-anchor="middle" font-size="14" font-weight="700" fill="var(--accent, #9d5604)">PC10</text>
<!-- 범례 -->
<rect x="112" y="273" width="16" height="10" fill="var(--bg-muted, #eeecea)" stroke="var(--text-muted, #6d6762)" stroke-width="1"/>
<text x="134" y="283" font-size="14" fill="var(--text-muted, #6d6762)">개별 비율</text>
<line x1="217" y1="278" x2="241" y2="278" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<text x="247" y="283" font-size="14" fill="var(--text-muted, #6d6762)">누적</text>
</svg>
</div>

피처 30개짜리 유방암 데이터를 표준화하고 전체 주성분을 뽑은 결과다. PC1이 44.3%, PC2가 19.0%를 설명하고, PC3부터는 막대 높이가 고만고만해진다. 누적으로 보면 PC10에서 95.2%에 도달한다. 30개 피처 중 20개는 사실상 나머지의 조합이었다는 뜻이고, 상관이 높은 실측 데이터에서는 흔한 일이다.

기준은 누적 설명 분산 비율이다. 시각화가 목적이면 2~3개로 충분하고, 모델 입력이 목적이면 보통 90~95%를 잡는다. sklearn은 임계값을 그대로 받는다.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

X_scaled = StandardScaler().fit_transform(load_breast_cancer().data)

pca = PCA(n_components=0.95).fit(X_scaled)
print(pca.n_components_)                  # 10
print(pca.explained_variance_ratio_[:3])  # [0.4427 0.1897 0.0939]
```

`n_components` 에 1보다 작은 소수를 넣으면 그 비율을 넘기는 최소 개수를 알아서 고른다. 개수를 정수로 박아두는 것보다 이쪽이 데이터가 바뀌었을 때 덜 망가진다.

고유값이 급격히 떨어지다 평탄해지는 지점(elbow)에서 자르는 scree plot 방식도 쓴다. 위 그림에서는 PC3 언저리다. 다만 꺾임이 뚜렷하지 않은 데이터가 많아서, 실전에서는 누적 비율 쪽을 더 자주 본다.

## PCA는 전처리 도구다

PCA의 주 무대는 그림이 아니라 모델 앞단이다. 피처 수를 줄여 학습을 빠르게 하고, 새 축들이 서로 직교하므로 다중공선성이 완전히 사라진다.

유방암 데이터에서 주성분 수를 바꿔가며 5-Fold 교차 검증 정확도를 재봤다. 두 모델 모두 `StandardScaler` 다음에 `PCA(n_components=k)` 를 붙인 파이프라인이고, 랜덤 포레스트는 `random_state=42` 로 고정했다.

| 주성분 수 | 로지스틱 회귀 | 랜덤 포레스트 |
|---|---|---|
| 2 | 0.9508 | 0.9367 |
| 5 | 0.9702 | 0.9490 |
| 10 | 0.9807 | 0.9455 |
| 15 | 0.9772 | 0.9455 |
| 20 | 0.9772 | 0.9367 |
| 원본 30 | 0.9807 | 0.9561 |

로지스틱 회귀는 주성분 10개에서 이미 원본 30개와 같은 정확도에 닿는다. 3분의 1로 줄인 입력으로 손실 없이 같은 자리에 도착한 셈이다. 선형 모델과 PCA는 궁합이 좋다. 둘 다 피처의 선형 결합만 보기 때문이다.

랜덤 포레스트는 반대다. 성분 수를 어떻게 잡아도 원본 30개보다 낮다. 트리는 축에 수직인 분할로 경계를 만드는데, PCA가 축을 회전시켜 버리면 원래 피처 하나로 깔끔하게 갈리던 경계를 여러 번의 계단으로 근사해야 한다. 게다가 트리는 쓸모없는 피처를 알아서 안 고르기 때문에 차원 축소로 얻을 이득도 적다.

주성분 2개는 시각화에는 충분해도 분류에는 부족하다. 유방암 데이터를 PC1과 PC2 평면에 찍으면 악성과 양성이 눈으로 갈릴 만큼 나뉘지만(두 성분이 분산의 63.2%를 설명한다), 정확도는 원본보다 3%p 낮다.

```python
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('pca', PCA(n_components=10)),
    ('clf', LogisticRegression(max_iter=1000)),
])
```

표준화가 PCA보다 앞에 온다. 순서가 뒤바뀌면 앞 절에서 본 단위 문제가 그대로 터진다. 그리고 `Pipeline` 으로 묶어야 교차 검증에서 각 폴드의 훈련 데이터로만 평균과 고유벡터를 학습한다. PCA를 전체 데이터에 미리 걸어두고 나서 데이터를 나누면 검증 폴드의 정보가 축에 새어 들어가고, 점수가 실제보다 좋게 나온다.

PCA를 쓴 순간 해석성은 포기해야 한다. PC1은 "종양 반지름"이 아니라 30개 피처의 가중 합이다. 여기가 피처 선택과 갈리는 지점이다.

| 관점 | 피처 선택 | PCA |
|---|---|---|
| 하는 일 | 원래 피처 중 일부를 고른다 | 피처들의 선형 결합으로 새 축을 만든다 |
| 해석성 | 남은 피처의 의미가 그대로 | 새 축이 무엇인지 설명하기 어렵다 |
| 정보 보존 | 버린 피처의 정보는 사라진다 | 분산 기준으로는 최적 |
| 다중공선성 | 상관된 피처를 직접 골라 빼야 한다 | 직교 변환으로 자동 해소 |

## 선형이라는 한계

PCA가 찾는 것은 직선 방향이다. 데이터가 휘어진 면 위에 놓여 있으면 손을 쓸 수 없다.

Swiss Roll이 교과서적인 반례다. 3차원 공간에서 돌돌 말린 2차원 종이인데, 어느 직선 방향으로 사영해도 말린 층들이 서로 겹쳐 찍힌다. 종이 위에서는 한참 떨어져 있던 두 점이 사영 후에는 이웃으로 보인다.

```python
from sklearn.datasets import make_swiss_roll
from sklearn.decomposition import KernelPCA

X_swiss, color = make_swiss_roll(n_samples=1500, noise=0.5, random_state=42)

X_linear = PCA(n_components=2).fit_transform(X_swiss)
X_kernel = KernelPCA(n_components=2, kernel='rbf', gamma=0.01).fit_transform(X_swiss)
```

Kernel PCA는 데이터를 커널 함수로 더 높은 차원에 올린 뒤 거기서 PCA를 한다. 원래 공간에서 보면 곡선 축을 찾은 셈이 되어 말린 구조를 어느 정도 편다. 대신 $n \times n$ 커널 행렬을 만들어야 해서 샘플이 늘면 급격히 무거워지고, `gamma` 를 잘못 잡으면 결과가 통째로 달라진다.

비선형 구조를 눈으로 확인하는 것이 목적이라면 t-SNE나 UMAP이 더 나은 선택이다. 다만 그쪽은 시각화 전용에 가깝다. 모델 파이프라인에 넣을 차원 축소는 여전히 PCA가 표준이다.

## 마치며

PCA가 하는 일은 좌표계를 바꾸는 것 하나뿐이다. 분산이 큰 순서대로 직교하는 축을 뽑아주고, 뒤쪽 축을 버리면 차원이 준다. 공분산 행렬의 고유값 분해든 SVD든, 이 한 문장을 계산하는 서로 다른 방법일 뿐이다.

실전에서 어긋나기 쉬운 지점은 두 군데다. 하나는 표준화다. PCA는 분산의 절대 크기를 보므로, 단위가 제각각인 피처를 그대로 넣으면 가장 큰 숫자를 쓰는 피처가 PC1을 통째로 차지한다. 다른 하나는 성분 수다. 눈대중으로 2개나 3개를 고르지 말고 설명 분산 비율을 보고 정한다.

한계도 분명하다. PCA는 직선 방향의 분산만 본다. 그리고 분산이 크다고 해서 예측에 유용한 방향이라는 보장이 없다. PCA는 레이블을 보지 않고 축을 잡기 때문에, 분류에 결정적인 신호가 분산이 작은 축에 실려 있으면 그 축부터 버린다. 차원을 줄였는데 성능이 떨어졌다면 이 가능성을 먼저 의심하는 편이 좋다.

## 함께 보면 좋은 글

- [t-SNE와 UMAP](/ml/tsne-and-umap/) : PCA가 펴지 못하는 비선형 구조를 2차원에 펼치는 기법
- [피처 스케일링](/ml/feature-scaling/) : PCA 앞단에 오는 표준화가 데이터를 어떻게 바꾸는지
- [피처 선택](/ml/feature-selection/) : 새 축을 만들지 않고 원래 피처를 골라내는 반대편 접근

## 참고자료

- [scikit-learn, Decomposing signals in components](https://scikit-learn.org/stable/modules/decomposition.html)
- [scikit-learn, PCA](https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.PCA.html)
- [An Introduction to Statistical Learning, Ch. 12](https://www.statlearning.com/)
- [Jolliffe, Principal Component Analysis (2nd ed.)](https://link.springer.com/book/10.1007/b98835)
