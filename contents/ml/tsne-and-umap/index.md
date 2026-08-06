---
date: '2026-02-08'
title: '고차원 데이터를 2차원에 펼치는 t-SNE와 UMAP'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 39
tags: ['t-SNE', 'UMAP', '차원 축소', '시각화', 'perplexity', 'umap-learn', '매니폴드', '머신러닝']
summary: '이웃 관계를 보존해 고차원 데이터를 2차원에 펼치는 t-SNE와 UMAP의 원리. 군집 사이 거리와 군집 크기를 해석하면 안 되는 이유, 그리고 전처리 도구인 PCA와 역할이 어떻게 갈리는지.'
thumbnail: './thumbnail.png'
---

클러스터링을 돌리고 나면 결과를 눈으로 확인하고 싶어진다. 피처가 두세 개면 산점도를 찍으면 그만이지만, 현실의 데이터는 수십에서 수백 차원이다. 사람 눈은 3차원까지가 한계다.

먼저 떠오르는 방법은 PCA다. 분산이 가장 큰 두 방향을 골라 그 평면에 데이터를 사영한다. 빠르고, 매번 같은 결과가 나오고, 축의 의미도 따질 수 있다. 문제는 이것이 **선형 사영**이라는 점이다. 데이터가 휘어진 면 위에 놓여 있으면 사영은 그 면을 펴는 것이 아니라 납작하게 누른다. 면 위에서는 한참 떨어져 있던 두 점이 겹쳐 찍히고, 군집 구조가 뭉개진다.

t-SNE와 UMAP은 다른 것을 지킨다. 전체 거리 대신 **누가 누구의 이웃인가**를 보존하면서 데이터를 2차원에 펼친다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 476" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="나선을 따라 놓인 데이터를 PCA로 1차원에 사영하면 안쪽 절반과 바깥쪽 절반이 뒤섞이지만, t-SNE와 UMAP은 나선을 따라간 이웃 순서대로 두 절반을 분리해 배치한다">
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">선형 사영이 못 펴는 휘어진 구조</text>
<!-- 위: 나선 위에 놓인 원본 데이터 -->
<text x="30" y="52" font-size="14" fill="var(--text-muted, #6d6762)">위: 나선을 따라 놓인 데이터</text>
<path d="M 200,156 196,155 191,155 187,155 182,157 177,159 173,163 169,167 166,173 164,179 164,185 164,192 166,199 169,206 173,212 179,218 186,222 193,225 202,227 211,228 220,226 229,223 238,219 245,212 252,205 257,195 261,185 263,174 263,163 261,152 256,140 250,130 242,121 232,113 220,107 207,103 194,101 180,102 167,106 154,111 141,119 131,130 122,142 115,156 111,171 110,187 111,203 116,219 123,234" fill="none" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45" stroke-width="2.5"/>
<g fill="var(--primary, #0a756c)">
<circle cx="200" cy="156" r="5"/><circle cx="186" cy="155" r="5"/><circle cx="171" cy="164" r="5"/><circle cx="164" cy="183" r="5"/><circle cx="168" cy="204" r="5"/><circle cx="186" cy="222" r="5"/><circle cx="213" cy="228" r="5"/><circle cx="241" cy="216" r="5"/>
</g>
<g fill="var(--accent, #9d5604)">
<circle cx="260" cy="189" r="5"/><circle cx="261" cy="154" r="5"/><circle cx="242" cy="121" r="5"/><circle cx="205" cy="103" r="5"/><circle cx="161" cy="108" r="5"/><circle cx="125" cy="137" r="5"/><circle cx="110" cy="184" r="5"/><circle cx="123" cy="234" r="5"/>
</g>
<!-- 범례 -->
<circle cx="100" cy="262" r="5" fill="var(--primary, #0a756c)"/>
<text x="112" y="267" font-size="14" fill="var(--text-muted, #6d6762)">안쪽 절반</text>
<circle cx="200" cy="262" r="5" fill="var(--accent, #9d5604)"/>
<text x="212" y="267" font-size="14" fill="var(--text-muted, #6d6762)">바깥쪽 절반</text>
<!-- 가운데: PCA 1차원 사영 -->
<text x="30" y="302" font-size="14" fill="var(--text-muted, #6d6762)">가운데: PCA 1차원 사영</text>
<line x1="55" y1="336" x2="345" y2="336" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45" stroke-width="2"/>
<text x="352" y="341" font-size="14" fill="var(--text-muted, #6d6762)">PC1</text>
<g fill="var(--primary, #0a756c)" fill-opacity="0.8">
<circle cx="225" cy="336" r="5"/><circle cx="201" cy="336" r="5"/><circle cx="175" cy="336" r="5"/><circle cx="163" cy="336" r="5"/><circle cx="170" cy="336" r="5"/><circle cx="201" cy="336" r="5"/><circle cx="247" cy="336" r="5"/><circle cx="296" cy="336" r="5"/>
</g>
<g fill="var(--accent, #9d5604)" fill-opacity="0.8">
<circle cx="328" cy="336" r="5"/><circle cx="330" cy="336" r="5"/><circle cx="297" cy="336" r="5"/><circle cx="234" cy="336" r="5"/><circle cx="158" cy="336" r="5"/><circle cx="96" cy="336" r="5"/><circle cx="70" cy="336" r="5"/><circle cx="92" cy="336" r="5"/>
</g>
<text x="200" y="366" text-anchor="middle" font-size="14" fill="var(--text-danger, #cb2121)">안쪽·바깥쪽 섞임</text>
<!-- 아래: t-SNE / UMAP 재배치 -->
<text x="30" y="400" font-size="14" fill="var(--text-muted, #6d6762)">아래: t-SNE / UMAP 재배치</text>
<line x1="55" y1="436" x2="345" y2="436" stroke="var(--text-muted, #6d6762)" stroke-opacity="0.45" stroke-width="2"/>
<g fill="var(--primary, #0a756c)">
<circle cx="70" cy="436" r="5"/><circle cx="87" cy="436" r="5"/><circle cx="105" cy="436" r="5"/><circle cx="122" cy="436" r="5"/><circle cx="139" cy="436" r="5"/><circle cx="157" cy="436" r="5"/><circle cx="174" cy="436" r="5"/><circle cx="191" cy="436" r="5"/>
</g>
<g fill="var(--accent, #9d5604)">
<circle cx="209" cy="436" r="5"/><circle cx="226" cy="436" r="5"/><circle cx="243" cy="436" r="5"/><circle cx="261" cy="436" r="5"/><circle cx="278" cy="436" r="5"/><circle cx="295" cy="436" r="5"/><circle cx="313" cy="436" r="5"/><circle cx="330" cy="436" r="5"/>
</g>
<text x="200" y="466" text-anchor="middle" font-size="14" fill="var(--text-success, #107836)">이웃 순서대로 분리</text>
</svg>
</div>

---

## t-SNE는 이웃일 확률을 맞춘다

t-SNE(t-distributed Stochastic Neighbor Embedding)는 2008년 Laurens van der Maaten과 Geoffrey Hinton이 제안했다. 고차원과 저차원 양쪽에서 "이웃일 확률"을 정의해 놓고, 두 확률 분포가 닮아지도록 저차원 좌표를 움직인다.

고차원에서는 $x_i$ 를 중심으로 가우시안을 씌워 $x_j$ 가 이웃일 조건부 확률을 만든다.

$$p_{j|i} = \frac{\exp(-\|x_i - x_j\|^2 / 2\sigma_i^2)}{\sum_{k \neq i} \exp(-\|x_i - x_k\|^2 / 2\sigma_i^2)}$$

$\sigma_i$ 는 점마다 다르다. 밀도가 낮은 곳에서는 넓게, 빽빽한 곳에서는 좁게 잡힌다. 이 값을 결정하는 것이 perplexity다. 대칭이 아닌 이 확률을 결합 확률 $p_{ij} = (p_{j|i} + p_{i|j}) / 2n$ 으로 묶어 쓴다.

저차원에서는 가우시안 대신 자유도 1의 t-분포(코시 분포)를 쓴다. 이름의 t가 여기서 나온다.

$$q_{ij} = \frac{(1 + \|y_i - y_j\|^2)^{-1}}{\sum_{k \neq l} (1 + \|y_k - y_l\|^2)^{-1}}$$

굳이 분포를 바꾸는 이유는 crowding problem이다. 고차원 공간은 넓어서 한 점 주위에 이웃을 여유 있게 늘어놓을 수 있지만, 2차원 평면에는 그만한 자리가 없다. 적당히 떨어져 있던 이웃들을 억지로 밀어 넣으면 전부 한 덩어리로 뭉친다. t-분포는 가우시안보다 꼬리가 두꺼워서 같은 확률값을 만드는 데 필요한 거리가 더 멀다. 중간 거리의 점들에게 더 멀리 떨어질 여유를 주는 셈이고, 그 덕분에 군집이 서로 벌어져 선명하게 보인다.

남은 일은 두 분포의 KL 발산을 경사하강법으로 줄이는 것이다.

$$KL(P \parallel Q) = \sum_i \sum_j p_{ij} \log \frac{p_{ij}}{q_{ij}}$$

이 목적함수의 생김새가 t-SNE의 성질을 거의 다 결정한다. $p_{ij}$ 가 큰데 $q_{ij}$ 가 작으면 로그 항이 커져 벌점이 크다. 고차원에서 가까웠던 점을 저차원에서 떼어놓는 실수는 크게 벌한다는 뜻이다. 반대로 $p_{ij}$ 가 작으면 앞에 곱해진 가중치 자체가 작아서 $q_{ij}$ 가 얼마든 벌점이 거의 없다. **멀리 있던 점을 가깝게 그려도 손해가 별로 없다.** 다음 절의 경고들이 전부 이 비대칭에서 나온다.

### perplexity

perplexity는 각 점이 몇 명의 이웃을 유효하게 보는지를 정한다. 보통 5에서 50 사이를 쓰고, 샘플 수보다는 작아야 한다. 값을 낮추면 아주 가까운 이웃만 보므로 작은 조각들이 많이 생기고 노이즈에 민감해진다. 높이면 넓은 범위를 보므로 큰 덩어리가 드러나는 대신 세부가 뭉개진다.

정답은 없다. 같은 데이터에 5, 30, 50을 각각 넣으면 그림이 눈에 띄게 달라진다. 한 값에서만 보이는 패턴은 아티팩트로 의심하는 편이 안전하다.

---

## t-SNE 그림에서 읽으면 안 되는 것

t-SNE를 쓸 때 가장 자주 사고가 나는 지점이다.

**군집 사이의 거리에는 의미가 없다.** A 군집이 B보다 C에 가까이 그려졌다고 해서 원본 공간에서도 그렇다는 보장이 없다. 앞에서 본 KL 발산의 비대칭 때문이다. 멀리 있던 것들을 가깝게 배치해도 목적함수가 거의 손해를 보지 않으므로, 군집들의 상대 위치는 초기값과 최적화 경로에 따라 얼마든지 달라진다.

**군집의 크기에도 의미가 없다.** t-SNE는 밀도를 정규화한다. $\sigma_i$ 를 점마다 다르게 잡는 것이 정확히 그 작업이다. 원본에서 빽빽하게 뭉쳐 있던 군집과 넓게 퍼져 있던 군집이 그림에서는 비슷한 크기의 얼룩으로 나온다. 얼룩의 지름을 분산으로 읽으면 안 된다.

**빈 공간의 넓이에도 의미가 없다.** 두 군집 사이가 휑하게 비어 있다고 해서 그 영역에 데이터가 없다는 뜻이 아니다.

여기에 실용적인 제약이 하나 더 붙는다. sklearn의 `TSNE` 에는 `transform` 메서드가 없고 `fit_transform` 만 있다. 새로 들어온 샘플을 기존 임베딩 위에 얹을 방법이 없다는 뜻이다. 전체를 다시 돌리면 좌표계 자체가 달라져서 이전 그림과 비교할 수 없다. 그래서 t-SNE 좌표를 모델의 입력 피처로 쓰는 것은 사실상 불가능하다.

:::warning

**t-SNE 그림에서 믿어도 되는 것은 "어떤 점들이 같이 뭉쳐 있는가" 하나뿐이다.**

군집 사이 거리, 군집 크기, 빈 공간의 넓이, 축의 방향은 전부 최적화 과정에서 생긴 부산물이다. perplexity를 여러 값으로 돌려보고, 공통으로 나타나는 뭉침만 결론으로 삼는다.

:::

손글씨 숫자 데이터로 확인해 보자. 8x8 이미지를 펼친 64차원 데이터다.

```python
from sklearn.datasets import load_digits
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

digits = load_digits()
X_scaled = StandardScaler().fit_transform(digits.data)

tsne = TSNE(n_components=2, perplexity=30, init='pca', random_state=42)
X_tsne = tsne.fit_transform(X_scaled)
```

64차원이 2차원 평면에서 열 덩어리로 갈린다. 4와 9, 3과 8처럼 손으로 써도 비슷하게 생긴 숫자들만 경계에서 조금 섞인다.

거리를 재는 알고리즘이므로 스케일링이 먼저다. 피처마다 값의 범위가 다르면 범위가 넓은 피처가 거리 계산을 독차지한다. `init='pca'` 는 PCA 결과를 출발점으로 삼아 무작위 초기화보다 전역 배치를 안정시킨다. sklearn 1.2부터 기본값이다.

---

## UMAP은 이웃 그래프를 펴 놓는다

UMAP(Uniform Manifold Approximation and Projection)은 2018년 Leland McInnes가 발표했다. 출발점은 위상수학이지만, 실제로 하는 일은 그래프 하나를 만들고 그 그래프를 저차원에서 재현하는 것이다.

각 점에서 가까운 `n_neighbors` 개의 이웃을 찾아 가중치가 붙은 그래프를 만든다. 이때 점마다 로컬 거리 척도를 따로 잡는다. 밀도가 낮은 영역에서는 더 먼 이웃도 "가깝다"로 친다. t-SNE가 $\sigma_i$ 로 하던 일과 목적이 같다. 그다음 이 그래프를 대칭화한다. A가 B를 이웃으로 보거나 B가 A를 이웃으로 보면 연결된 것으로 간주하는 방식이다.

저차원에서도 같은 방식으로 그래프를 만들고, 두 그래프 사이의 교차 엔트로피를 최소화한다. KL 발산과 달리 교차 엔트로피에는 항이 하나 더 있다. **떨어져 있어야 할 점이 가까이 놓인 경우에도 벌점을 매긴다.** t-SNE에서 전역 배치가 흐트러지던 원인이 여기서 어느 정도 잡힌다.

파라미터는 둘이 중요하다.

| 파라미터 | 기본값 | 올렸을 때 |
|---|---|---|
| `n_neighbors` | 15 | 넓은 범위를 보므로 전역 구조가 살고 작은 군집은 합쳐진다 |
| `min_dist` | 0.1 | 점들이 덜 뭉치고 퍼진다. 군집 내부의 연속적인 변화가 보인다 |

UMAP은 sklearn에 들어 있지 않다. `umap-learn` 패키지를 따로 설치하고 `umap` 으로 import한다.

```bash
pip install umap-learn
```

```python
import umap

reducer = umap.UMAP(n_components=2, n_neighbors=15, min_dist=0.1, random_state=42)
X_umap = reducer.fit_transform(X_scaled)

X_new_umap = reducer.transform(X_new)  # 새 데이터를 같은 좌표계에 얹는다
```

마지막 줄이 t-SNE와 갈리는 실용적인 차이다. UMAP은 학습한 임베딩을 재사용할 수 있어서, 새로 들어온 샘플을 기존 그림 위에 찍거나 다운스트림 모델의 피처로 넘길 수 있다.

`random_state` 를 지정하면 결과가 재현되는 대신 단일 스레드로 떨어져 느려진다. 탐색 단계에서는 빼고 돌리다가 그림을 확정할 때만 넣는 편이 낫다.

---

## t-SNE와 UMAP 중 무엇을 쓸까

| 항목 | t-SNE | UMAP |
|---|---|---|
| 속도 | 느리다 (Barnes-Hut으로 $O(n \log n)$) | 빠르다 (근사 최근접 이웃) |
| 실용적인 샘플 수 | 수만 | 수십만 이상 |
| 전역 구조 | 거의 보존되지 않는다 | 상대적으로 낫다 |
| 새 데이터 투영 | 불가 | `transform` 으로 가능 |
| 목적함수 | KL 발산 | 교차 엔트로피 |
| 핵심 파라미터 | perplexity | n_neighbors, min_dist |

속도와 새 데이터 투영 때문에 실무에서는 UMAP을 먼저 잡는 경우가 많다. 다만 UMAP의 전역 구조가 "상대적으로 낫다"는 것이지 군집 사이 거리를 그대로 믿어도 된다는 뜻은 아니다. 거리를 정량적으로 논해야 하는 자리에서는 두 방법 모두 근거가 되지 못한다.

---

## PCA와는 역할이 다르다

셋을 나란히 놓고 하나를 고르는 문제가 아니다. PCA는 전처리 도구고, t-SNE와 UMAP은 그림 그리는 도구다.

PCA는 매번 같은 결과를 내고, 역변환이 되고, 각 축이 원본 피처의 선형 결합이라 의미를 따질 수 있다. 그래서 모델 파이프라인 안에 넣어도 된다. 반면 t-SNE는 실행할 때마다 다른 좌표를 내놓고 새 데이터를 받지 못한다. UMAP은 새 데이터를 받긴 하지만 축 자체에 해석할 의미가 없다.

둘은 경쟁 관계가 아니라 순서 관계이기도 하다. 피처가 수백 개를 넘으면 t-SNE나 UMAP을 바로 돌리지 말고, PCA로 50차원 정도까지 먼저 줄인 뒤에 넣는 것이 표준이다. 노이즈 차원이 걷히면서 이웃 계산이 정확해지고 속도도 크게 빨라진다. sklearn의 `TSNE` 문서도 이 순서를 권한다.

```python
from sklearn.decomposition import PCA

X_50 = PCA(n_components=50, random_state=42).fit_transform(X_scaled)
X_2d = umap.UMAP(n_neighbors=15, min_dist=0.1).fit_transform(X_50)
```

마지막으로 하나 더. 그림에서 군집이 보인다고 해서 그것을 클러스터링 결과로 쓰면 안 된다. 두 알고리즘은 애초에 덩어리를 만들도록 설계되어 있어서, 구조가 전혀 없는 무작위 데이터를 넣어도 그럴듯한 군집을 그려낸다. 실제 군집은 원본 공간에서 K-Means나 DBSCAN으로 찾고, 그림은 그 결과를 눈으로 확인하는 용도로 쓴다.

---

## 마치며

t-SNE와 UMAP이 지키는 것은 이웃 관계 하나다. 거리도, 밀도도, 축의 방향도 지키지 않는다. 이 사실을 알고 보면 그림에서 읽어낼 수 있는 것과 읽어내면 안 되는 것이 분명해진다. 같이 뭉친 점들은 원본에서도 서로 닮았다. 딱 거기까지다.

두 알고리즘의 차이는 목적함수 한 줄에서 갈린다. t-SNE의 KL 발산은 가까운 것을 떼어놓는 실수만 벌하고, UMAP의 교차 엔트로피는 먼 것을 붙여놓는 실수도 벌한다. UMAP의 전역 배치가 조금 더 믿을 만한 이유이자, 새 데이터를 기존 좌표계에 얹을 수 있는 이유다.

그리고 이 둘은 PCA를 대체하지 않는다. 모델에 넣을 차원 축소는 PCA고, 사람이 볼 그림은 t-SNE와 UMAP이다. 이 경계를 넘어 t-SNE 좌표를 피처로 넘기는 순간, 다시 돌리면 재현되지 않는 파이프라인이 만들어진다.

---

## 함께 보면 좋은 글

- [PCA](/ml/pca/) : 분산을 기준으로 축을 다시 잡는 선형 차원 축소
- [K-Means 클러스터링](/ml/kmeans-clustering/) : 그림이 아니라 원본 공간에서 군집을 찾는 방법
- [DBSCAN과 GMM](/ml/dbscan-and-gmm/) : 밀도와 확률로 군집을 정의하는 접근
