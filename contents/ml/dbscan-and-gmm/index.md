---
date: '2026-02-07'
title: '밀도로 묶는 DBSCAN과 확률로 묶는 GMM'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 38
tags: ['DBSCAN', 'GMM', 'Gaussian Mixture Model', 'HDBSCAN', 'EM 알고리즘', '밀도 기반 클러스터링', '소프트 클러스터링', '머신러닝']
summary: '밀도가 이어지는 방향으로 클러스터를 넓히는 DBSCAN과 가우시안 혼합으로 소속 확률을 내주는 GMM. 핵심점·경계점·잡음점 구분, eps 선택, EM 알고리즘, 공분산 타입까지.'
thumbnail: './thumbnail.png'
---

중심점 기반 클러스터링에는 두 가지 전제가 깔려 있다. K-Means는 각 점을 가장 가까운 중심점에 붙이기 때문에 경계가 늘 직선이 되고, 그래서 둥근 덩어리만 제대로 잡는다. 그리고 클러스터 개수 K를 입력으로 받으므로 덩어리가 몇 개인지 사람이 미리 정해 줘야 한다.

두 전제가 동시에 어긋나는 데이터는 드물지 않다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 510" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="맞물린 두 초승달 모양 데이터를 위아래로 비교한 그림. 위쪽 K-Means는 두 초승달을 가로지르는 직선으로 잘라 버리고, 아래쪽 DBSCAN은 초승달 하나씩을 각각의 클러스터로 잡고 세 점만 잡음으로 남긴다.">
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">초승달 데이터에서 갈리는 결과</text>
<!-- top panel: K-Means -->
<text x="20" y="54" font-size="16" font-weight="600" fill="var(--text, #1c1917)">위: K-Means (K=2)</text>
<text x="380" y="54" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">두 초승달을 가로지름</text>
<rect x="20" y="64" width="360" height="190" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<path d="M 120.3 232 L 275.1 81.3" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" stroke-dasharray="6 4"/>
<g fill="var(--primary, #0a756c)"><circle cx="236.6" cy="215.2" r="3.4"/><circle cx="225.8" cy="228.7" r="3.4"/><circle cx="221" cy="168.9" r="3.4"/><circle cx="264.4" cy="160" r="3.4"/><circle cx="188.6" cy="192.8" r="3.4"/><circle cx="238.6" cy="221.6" r="3.4"/><circle cx="282.4" cy="151.4" r="3.4"/><circle cx="269.6" cy="212" r="3.4"/><circle cx="274.7" cy="148.6" r="3.4"/><circle cx="195.2" cy="205.2" r="3.4"/><circle cx="203.7" cy="217.7" r="3.4"/><circle cx="268.2" cy="194.3" r="3.4"/><circle cx="234.3" cy="225.7" r="3.4"/><circle cx="253.8" cy="223.4" r="3.4"/><circle cx="190.3" cy="213.9" r="3.4"/><circle cx="228.3" cy="184.9" r="3.4"/><circle cx="228.6" cy="231.2" r="3.4"/><circle cx="266.5" cy="190.1" r="3.4"/><circle cx="219.9" cy="164.2" r="3.4"/><circle cx="265.8" cy="186.6" r="3.4"/><circle cx="197.9" cy="191.4" r="3.4"/><circle cx="181.5" cy="183.5" r="3.4"/><circle cx="220.7" cy="153.1" r="3.4"/><circle cx="267.8" cy="181.9" r="3.4"/><circle cx="249.9" cy="231.7" r="3.4"/><circle cx="282.9" cy="151.8" r="3.4"/><circle cx="198.5" cy="212.7" r="3.4"/><circle cx="213.6" cy="217.1" r="3.4"/><circle cx="220.3" cy="139" r="3.4"/><circle cx="246.3" cy="219.6" r="3.4"/><circle cx="216.6" cy="142.2" r="3.4"/><circle cx="220.6" cy="239" r="3.4"/><circle cx="197" cy="234.3" r="3.4"/><circle cx="226.7" cy="173.2" r="3.4"/><circle cx="175.6" cy="186.5" r="3.4"/><circle cx="287.5" cy="138.5" r="3.4"/><circle cx="277.1" cy="152.2" r="3.4"/><circle cx="214.5" cy="232.3" r="3.4"/><circle cx="257.1" cy="201.8" r="3.4"/><circle cx="256.2" cy="198.3" r="3.4"/><circle cx="182.7" cy="186.6" r="3.4"/></g>
<g fill="var(--accent, #9d5604)"><circle cx="119.3" cy="157.2" r="3.4"/><circle cx="184.9" cy="96.9" r="3.4"/><circle cx="175.9" cy="140.8" r="3.4"/><circle cx="200.2" cy="106" r="3.4"/><circle cx="146.7" cy="102.5" r="3.4"/><circle cx="185.9" cy="90.2" r="3.4"/><circle cx="166.2" cy="140.1" r="3.4"/><circle cx="112.8" cy="180.2" r="3.4"/><circle cx="200.6" cy="92.3" r="3.4"/><circle cx="132" cy="114.6" r="3.4"/><circle cx="183" cy="85" r="3.4"/><circle cx="157.5" cy="82.4" r="3.4"/><circle cx="166.8" cy="82.2" r="3.4"/><circle cx="175.6" cy="151.7" r="3.4"/><circle cx="164.8" cy="88.8" r="3.4"/><circle cx="146.7" cy="104.6" r="3.4"/><circle cx="124.2" cy="132.1" r="3.4"/><circle cx="118.7" cy="133.8" r="3.4"/><circle cx="172.4" cy="174.1" r="3.4"/><circle cx="207.4" cy="120" r="3.4"/><circle cx="137.8" cy="96.2" r="3.4"/><circle cx="137" cy="114.9" r="3.4"/><circle cx="125.8" cy="123.7" r="3.4"/><circle cx="193.3" cy="85.7" r="3.4"/><circle cx="119.2" cy="154.3" r="3.4"/><circle cx="112.5" cy="183.5" r="3.4"/><circle cx="204.9" cy="118.9" r="3.4"/><circle cx="124.5" cy="142.8" r="3.4"/><circle cx="155.6" cy="98.1" r="3.4"/><circle cx="178.1" cy="79" r="3.4"/><circle cx="206.3" cy="110" r="3.4"/><circle cx="176.7" cy="167.8" r="3.4"/><circle cx="217.6" cy="130.8" r="3.4"/><circle cx="119.7" cy="184.2" r="3.4"/><circle cx="217.7" cy="123.7" r="3.4"/><circle cx="166.6" cy="140.7" r="3.4"/><circle cx="197.8" cy="93.6" r="3.4"/><circle cx="155.4" cy="87.8" r="3.4"/><circle cx="148.8" cy="86.9" r="3.4"/></g>
<path d="M 232.9 185.8 L 239.9 192.8 L 232.9 199.8 L 225.9 192.8 Z" fill="var(--primary, #0a756c)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 162.5 113.5 L 169.5 120.5 L 162.5 127.5 L 155.5 120.5 Z" fill="var(--accent, #9d5604)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<!-- bottom panel: DBSCAN -->
<text x="20" y="294" font-size="16" font-weight="600" fill="var(--text, #1c1917)">아래: DBSCAN</text>
<text x="380" y="294" text-anchor="end" font-size="14" fill="var(--text-muted, #6d6762)">초승달별로 분리 + 잡음 3점</text>
<rect x="20" y="304" width="360" height="190" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="var(--primary, #0a756c)"><circle cx="236.6" cy="455.2" r="3.4"/><circle cx="225.8" cy="468.7" r="3.4"/><circle cx="175.9" cy="380.8" r="3.4"/><circle cx="166.2" cy="380.1" r="3.4"/><circle cx="264.4" cy="400" r="3.4"/><circle cx="188.6" cy="432.8" r="3.4"/><circle cx="238.6" cy="461.6" r="3.4"/><circle cx="282.4" cy="391.4" r="3.4"/><circle cx="269.6" cy="452" r="3.4"/><circle cx="175.6" cy="391.7" r="3.4"/><circle cx="274.7" cy="388.6" r="3.4"/><circle cx="195.2" cy="445.2" r="3.4"/><circle cx="203.7" cy="457.7" r="3.4"/><circle cx="268.2" cy="434.3" r="3.4"/><circle cx="172.4" cy="414.1" r="3.4"/><circle cx="234.3" cy="465.7" r="3.4"/><circle cx="253.8" cy="463.4" r="3.4"/><circle cx="190.3" cy="453.9" r="3.4"/><circle cx="228.6" cy="471.2" r="3.4"/><circle cx="266.5" cy="430.1" r="3.4"/><circle cx="265.8" cy="426.6" r="3.4"/><circle cx="197.9" cy="431.4" r="3.4"/><circle cx="181.5" cy="423.5" r="3.4"/><circle cx="267.8" cy="421.9" r="3.4"/><circle cx="249.9" cy="471.7" r="3.4"/><circle cx="282.9" cy="391.8" r="3.4"/><circle cx="198.5" cy="452.7" r="3.4"/><circle cx="213.6" cy="457.1" r="3.4"/><circle cx="246.3" cy="459.6" r="3.4"/><circle cx="220.6" cy="479" r="3.4"/><circle cx="197" cy="474.3" r="3.4"/><circle cx="176.7" cy="407.8" r="3.4"/><circle cx="175.6" cy="426.5" r="3.4"/><circle cx="287.5" cy="378.5" r="3.4"/><circle cx="166.6" cy="380.7" r="3.4"/><circle cx="277.1" cy="392.2" r="3.4"/><circle cx="214.5" cy="472.3" r="3.4"/><circle cx="257.1" cy="441.8" r="3.4"/><circle cx="256.2" cy="438.3" r="3.4"/><circle cx="182.7" cy="426.6" r="3.4"/></g>
<g fill="var(--accent, #9d5604)"><circle cx="119.3" cy="397.2" r="3.4"/><circle cx="184.9" cy="336.9" r="3.4"/><circle cx="200.2" cy="346" r="3.4"/><circle cx="146.7" cy="342.5" r="3.4"/><circle cx="185.9" cy="330.2" r="3.4"/><circle cx="221" cy="408.9" r="3.4"/><circle cx="200.6" cy="332.3" r="3.4"/><circle cx="132" cy="354.6" r="3.4"/><circle cx="183" cy="325" r="3.4"/><circle cx="157.5" cy="322.4" r="3.4"/><circle cx="166.8" cy="322.2" r="3.4"/><circle cx="164.8" cy="328.8" r="3.4"/><circle cx="146.7" cy="344.6" r="3.4"/><circle cx="124.2" cy="372.1" r="3.4"/><circle cx="118.7" cy="373.8" r="3.4"/><circle cx="207.4" cy="360" r="3.4"/><circle cx="137.8" cy="336.2" r="3.4"/><circle cx="137" cy="354.9" r="3.4"/><circle cx="125.8" cy="363.7" r="3.4"/><circle cx="193.3" cy="325.7" r="3.4"/><circle cx="228.3" cy="424.9" r="3.4"/><circle cx="219.9" cy="404.2" r="3.4"/><circle cx="119.2" cy="394.3" r="3.4"/><circle cx="220.7" cy="393.1" r="3.4"/><circle cx="204.9" cy="358.9" r="3.4"/><circle cx="124.5" cy="382.8" r="3.4"/><circle cx="155.6" cy="338.1" r="3.4"/><circle cx="220.3" cy="379" r="3.4"/><circle cx="178.1" cy="319" r="3.4"/><circle cx="216.6" cy="382.2" r="3.4"/><circle cx="206.3" cy="350" r="3.4"/><circle cx="226.7" cy="413.2" r="3.4"/><circle cx="217.6" cy="370.8" r="3.4"/><circle cx="217.7" cy="363.7" r="3.4"/><circle cx="197.8" cy="333.6" r="3.4"/><circle cx="155.4" cy="327.8" r="3.4"/><circle cx="148.8" cy="326.9" r="3.4"/></g>
<g stroke="var(--text-muted, #6d6762)" stroke-width="2" fill="none"><path d="M 108.8 416.2 L 116.8 424.2 M 108.8 424.2 L 116.8 416.2"/><path d="M 108.5 419.5 L 116.5 427.5 M 108.5 427.5 L 116.5 419.5"/><path d="M 115.7 420.2 L 123.7 428.2 M 115.7 428.2 L 123.7 420.2"/></g>
<text x="130" y="424" font-size="14" fill="var(--text-muted, #6d6762)">잡음</text>
</svg>
</div>

위쪽은 K-Means에 K=2를 준 결과다. 마름모가 두 중심점이고 점선이 그 사이의 수직이등분선인데, 이 직선 하나가 경계의 전부다. 초승달 두 개를 위아래로 나누는 대신 대각선으로 갈라 버렸고, 각 클러스터에 두 초승달의 조각이 섞여 들어갔다. 아래쪽은 같은 데이터에 DBSCAN을 돌린 결과다. 초승달을 하나씩 통째로 잡았고, 끝자락에서 떨어져 나온 세 점은 어느 클러스터에도 넣지 않았다.

두 알고리즘은 서로 다른 방향으로 전제를 푼다. DBSCAN은 모양과 개수 가정을 둘 다 버리고 밀도만 본다. GMM은 둥글다는 가정을 타원까지 넓히고, 소속을 0과 1이 아니라 확률로 매긴다.

---

## DBSCAN, 밀도가 이어지는 만큼 넓힌다

DBSCAN(Density-Based Spatial Clustering of Applications with Noise)은 "이 근처에 점이 충분히 모여 있는가"만 묻는다. 판단에 필요한 값은 둘이다.

- **`eps`**: 이웃으로 칠 반경. 한 점에서 이 거리 안에 있는 점이 그 점의 이웃이다
- **`min_samples`**: 핵심점이 되기 위해 반경 안에 있어야 할 점의 최소 개수. sklearn에서는 자기 자신도 이 수에 포함된다

이 둘로 모든 점이 세 갈래로 나뉜다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 270" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="eps 반경 원 세 개를 그려 핵심점, 경계점, 잡음점을 구분한 그림. 핵심점의 반경 안에는 여섯 점이 들어 있고, 경계점의 반경 안에는 자신과 핵심점 둘뿐이며, 잡음점의 반경 안에는 아무 점도 없다.">
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">eps 안의 이웃 수로 갈리는 세 종류</text>
<text x="200" y="46" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">min_samples = 5</text>
<rect x="20" y="58" width="360" height="197" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="none" stroke-width="1.5" stroke-dasharray="5 4"><circle cx="110" cy="168" r="40" stroke="var(--primary, #0a756c)"/><circle cx="144" cy="180" r="40" stroke="var(--accent, #9d5604)"/><circle cx="300" cy="138" r="40" stroke="var(--text-muted, #6d6762)"/></g>
<g fill="var(--bg, #fafaf8)" stroke="var(--text-muted, #6d6762)" stroke-width="1.4"><circle cx="78" cy="152" r="4.5"/><circle cx="112" cy="136" r="4.5"/><circle cx="92" cy="196" r="4.5"/><circle cx="82" cy="180" r="4.5"/></g>
<path d="M 110 168 L 150 168" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.4"/>
<text x="132" y="160" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">eps</text>
<circle cx="110" cy="168" r="6" fill="var(--primary, #0a756c)"/>
<text x="110" y="118" text-anchor="middle" font-size="14" font-weight="600" fill="var(--primary, #0a756c)">핵심점</text>
<rect x="139" y="175" width="10" height="10" fill="var(--accent, #9d5604)"/>
<path d="M 193 209 L 152 187" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.2"/>
<text x="196" y="214" font-size="14" font-weight="600" fill="var(--accent, #9d5604)">경계점</text>
<path d="M 294 132 L 306 144 M 294 144 L 306 132" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="2.4"/>
<text x="300" y="90" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text-muted, #6d6762)">잡음점</text>
</svg>
</div>

| 종류 | 조건 | sklearn 레이블 |
|---|---|---|
| 핵심점(core) | 자기 반경 안의 점이 `min_samples` 이상 | 소속 클러스터 번호 |
| 경계점(border) | 자신은 핵심점이 아니지만 어떤 핵심점의 반경 안에 있음 | 그 핵심점의 클러스터 번호 |
| 잡음점(noise) | 어떤 핵심점의 반경에도 들어가지 않음 | `-1` |

그림에서 왼쪽 원 안에는 자신을 포함해 여섯 점이 있으니 가운데 점은 핵심점이다. 주황 사각형은 자기 반경 안에 자신과 핵심점 둘뿐이라 핵심점 조건에 못 미치지만, 핵심점의 반경 안에 들어 있어 그 클러스터에 딸려 들어간다. 오른쪽 점은 반경 안이 비어 있고 다른 핵심점의 반경에도 안 걸리니 잡음이다.

클러스터를 만드는 절차는 이 분류에서 곧장 나온다. 아직 방문하지 않은 핵심점 하나를 골라 새 클러스터를 열고, 그 점의 이웃을 전부 클러스터에 넣는다. 새로 들어온 이웃 중에 핵심점이 있으면 그 점의 이웃도 다시 끌어온다. 더 끌어올 핵심점이 없을 때까지 이 연쇄를 반복하면 클러스터 하나가 끝나고, 남은 핵심점에서 다시 시작한다. K-Means처럼 중심에서 원형으로 퍼지는 것이 아니라 밀도가 이어지는 방향이면 어디로든 뻗어 나가기 때문에, 초승달이든 고리든 따라갈 수 있다.

:::note

**경계점의 소속은 처리 순서에 달려 있다**

한 경계점이 서로 다른 두 클러스터의 핵심점 모두에서 도달 가능하면, 먼저 도달한 쪽이 가져간다. 알고리즘 정의상 이 부분은 유일하게 정해지지 않는다. 데이터 순서를 바꾸면 경계점 몇 개의 레이블이 달라질 수 있다.

:::

### eps는 k-distance 그래프로 고른다

DBSCAN에서 손이 가장 많이 가는 값이 `eps`다. 너무 작으면 대부분이 잡음이 되고, 너무 크면 전부 한 덩어리가 된다. 실전에서는 각 점의 $k$번째 최근접 이웃까지의 거리를 구해 오름차순으로 그린 뒤, 곡선이 급하게 치솟기 시작하는 지점의 y값을 후보로 삼는다. 그 아래는 이웃이 촘촘한 점들이고 위는 성긴 점들이다.

```python
import numpy as np
from sklearn.neighbors import NearestNeighbors

k = 5  # min_samples와 같은 값
distances, _ = NearestNeighbors(n_neighbors=k).fit(X).kneighbors(X)
k_distances = np.sort(distances[:, -1])   # 이 곡선이 꺾이는 높이가 eps 후보
```

`min_samples`는 차원 수를 기준으로 잡는다. 최소한 `n_features + 1`은 되어야 하고, 경험적으로는 `2 * n_features`를 출발점으로 쓴다. 잡음이 많은 데이터라면 더 올린다. 2차원이면 4나 5에서 시작하면 대체로 무난하다.

### 밀도가 다른 덩어리가 섞이면 약하다

DBSCAN의 약점은 `eps`가 데이터 전체에 하나뿐이라는 데서 나온다. 촘촘한 덩어리와 성긴 덩어리가 한 데이터에 같이 있으면, 촘촘한 쪽에 맞춰 `eps`를 줄이면 성긴 덩어리가 통째로 잡음이 되고, 성긴 쪽에 맞춰 늘리면 촘촘한 덩어리들이 하나로 합쳐진다. 하나의 반경으로 여러 밀도 수준을 동시에 담을 방법이 없다.

**HDBSCAN**은 이 문제를 겨냥한 확장이다. 고정된 `eps` 하나를 쓰는 대신 여러 밀도 수준에서 클러스터 계층을 만들고, 그중 밀도 변화에 가장 오래 버티는 클러스터를 골라낸다. 정할 값도 `min_cluster_size` 하나로 줄어든다. sklearn 1.3부터 `sklearn.cluster.HDBSCAN`으로 들어와 있어 별도 설치도 필요 없다.

```python
from sklearn.cluster import HDBSCAN

labels = HDBSCAN(min_cluster_size=15).fit_predict(X)
```

밀도 기반 클러스터링을 실무에 쓸 생각이라면 DBSCAN보다 HDBSCAN을 먼저 시도해 보는 편이 낫다. 차원이 높아지면 둘 다 약해지는데, 거리 자체가 변별력을 잃기 때문이라 알고리즘을 바꾸는 것으로는 해결되지 않는다. 차원을 먼저 줄이고 들어가야 한다.

---

## GMM, 소속을 확률로 매긴다

K-Means와 DBSCAN은 한 점을 정확히 한 클러스터에 넣는다. 하지만 경계가 흐릿한 데이터에서는 그 강제 할당이 정보를 지운다. 프리미엄 고객 성향이 6할, 일반 고객 성향이 4할인 고객을 어느 한쪽에 밀어 넣으면 "애매하다"는 사실 자체가 사라진다.

**GMM(Gaussian Mixture Model)**은 데이터가 여러 개의 가우시안 분포에서 섞여 나왔다고 본다. 전체 밀도는 각 컴포넌트 밀도의 가중합이다.

$$p(x) = \sum_{k=1}^{K} \pi_k \, \mathcal{N}(x \mid \mu_k, \Sigma_k), \qquad \sum_{k=1}^{K} \pi_k = 1$$

컴포넌트 $k$는 세 가지를 가진다. 중심 $\mu_k$, 퍼짐과 방향을 담은 공분산 $\Sigma_k$, 전체에서 차지하는 비율 $\pi_k$다. K-Means의 클러스터가 중심점 하나만 가지는 것과 대비된다. 공분산이 있으니 축이 기울어진 길쭉한 덩어리도 표현할 수 있고, $\pi_k$가 있으니 크기가 다른 덩어리도 다룰 수 있다.

무엇을 표현할 수 있는지는 `covariance_type`이 정한다.

| `covariance_type` | 컴포넌트가 갖는 것 | 잡을 수 있는 모양 |
|---|---|---|
| `full` (기본값) | 각자 완전한 공분산 행렬 | 크기·납작함·기울기가 제각각인 타원 |
| `tied` | 모든 컴포넌트가 행렬 하나를 공유 | 모양과 기울기는 같고 위치만 다른 타원 |
| `diag` | 각자 대각 성분만 | 좌표축에 나란한 타원 |
| `spherical` | 각자 분산값 하나 | 반지름만 다른 원 |

아래로 갈수록 추정할 파라미터가 줄어든다. `full`은 컴포넌트마다 $d(d+1)/2$개의 공분산 값을 추정해야 해서, 차원이 높거나 표본이 적으면 행렬이 특이해지기 쉽다. sklearn이 대각 성분에 `reg_covar=1e-6`을 더해 두는 것도 이 때문이다. 차원 대비 표본이 부족하면 `diag`부터 시작하는 쪽이 안전하다.

### EM 알고리즘

파라미터를 모르면 각 점이 어느 컴포넌트에서 나왔는지 알 수 없고, 각 점의 출처를 모르면 파라미터를 추정할 수 없다. **EM(Expectation-Maximization)**은 이 순환을 한쪽씩 번갈아 푼다.

E단계에서는 현재 파라미터를 그대로 두고, 점 $x_i$가 컴포넌트 $k$에서 나왔을 사후 확률을 계산한다. 이 값을 responsibility라고 부른다.

$$r_{ik} = \frac{\pi_k \, \mathcal{N}(x_i \mid \mu_k, \Sigma_k)}{\sum_{j=1}^{K} \pi_j \, \mathcal{N}(x_i \mid \mu_j, \Sigma_j)}$$

M단계에서는 이 responsibility를 가중치로 삼아 파라미터를 다시 맞춘다. $N_k = \sum_i r_{ik}$를 컴포넌트 $k$가 끌어모은 유효 표본 수라고 보면,

$$\mu_k = \frac{1}{N_k}\sum_i r_{ik}\, x_i, \qquad \pi_k = \frac{N_k}{n}$$

이고 공분산도 같은 가중치로 계산한다. 두 단계 모두 로그 가능도를 낮추지 않기 때문에 값은 단조 증가하고, K-Means와 마찬가지로 지역 최적에서 멈춘다.

구조가 K-Means와 겹치는 것은 우연이 아니다. K-Means의 할당 단계가 E단계에 대응하고 평균 갱신이 M단계에 대응하는데, 차이는 responsibility가 0과 1 중 하나로 굳어져 있다는 점뿐이다. 실제로 모든 공분산을 같은 $\sigma^2 I$로 묶고 $\sigma^2$를 0으로 보내면 responsibility가 가장 가까운 컴포넌트에 1로 쏠려 GMM은 K-Means가 된다. sklearn의 `GaussianMixture`가 기본적으로 K-Means 결과로 초기화(`init_params='kmeans'`)하는 것도 이 관계 때문이다.

### 확률을 받아서 무엇을 하나

```python
from sklearn.mixture import GaussianMixture

gmm = GaussianMixture(n_components=3, covariance_type='full', random_state=42).fit(X)

probs = gmm.predict_proba(X)              # (n, 3) 소속 확률
uncertain = probs.max(axis=1) < 0.7       # 어느 쪽도 확신하지 못한 점
print(uncertain.sum(), probs[uncertain][:3].round(3))
```

`predict`가 주는 레이블은 이 확률의 argmax일 뿐이다. 값을 통째로 받으면 "어디에도 확신이 없는 점"을 골라낼 수 있고, 이 목록은 그대로 검토 대상이 된다. 사람에게 레이블링을 맡길 샘플을 고르는 능동 학습(active learning)이 대표적인 용처다.

컴포넌트 수는 엘보우나 실루엣 대신 정보 기준으로 정한다. 로그 가능도 $\ln\hat{L}$에 파라미터 수 $p$에 대한 벌점을 붙인 값이다.

$$\text{AIC} = -2\ln\hat{L} + 2p, \qquad \text{BIC} = -2\ln\hat{L} + p\ln n$$

$n$이 8보다 크면 $\ln n > 2$이므로 BIC의 벌점이 더 무겁고, 그만큼 컴포넌트 수를 적게 고른다. 둘 중 하나를 기본으로 쓴다면 BIC 쪽이 무난하다. `covariance_type`을 바꾸면 $p$가 통째로 달라지니, 공분산 타입까지 같이 놓고 BIC를 비교하면 두 선택을 한 번에 정리할 수 있다.

```python
scores = []
for k in range(1, 8):
    for ct in ('full', 'tied', 'diag', 'spherical'):
        gmm = GaussianMixture(n_components=k, covariance_type=ct, random_state=42).fit(X)
        scores.append((gmm.bic(X), k, ct))

print(min(scores))   # (BIC, 컴포넌트 수, 공분산 타입)
```

---

## 셋 중 무엇을 고를까

| 기준 | K-Means | DBSCAN | GMM |
|---|---|---|---|
| 클러스터 수 | 사전 지정 | 자동 결정 | 사전 지정 |
| 할당 방식 | 하드 | 하드 + 잡음 | 소프트(확률) |
| 잡을 수 있는 모양 | 직선 경계의 볼록 영역 | 밀도가 이어지는 임의 형태 | 타원 |
| 잡음 처리 | 없음 | `-1`로 분리 | 없음 |
| 주요 파라미터 | K | `eps`, `min_samples` | K, `covariance_type` |
| 파라미터 선택 | 엘보우·실루엣 | k-distance 그래프 | BIC·AIC |
| 고차원 | 보통 | 약함 | 보통 |

선택은 결국 데이터에 대한 가정을 고르는 일이다. 덩어리가 둥글고 크기가 비슷하다고 믿으면 K-Means, 밀도가 높은 곳이 곧 클러스터라고 믿으면 DBSCAN, 데이터가 몇 개의 가우시안에서 섞여 나왔다고 믿으면 GMM이다. 셋이 배타적인 것도 아니다. K-Means로 대략의 구조를 훑고, DBSCAN으로 잡음 후보를 걸러낸 뒤, GMM으로 경계의 불확실성을 재는 조합이 실제로 자주 쓰인다.

---

## 마치며

DBSCAN과 GMM은 K-Means가 놓치는 것을 각각 다른 쪽에서 집어낸다. DBSCAN은 클러스터가 무슨 모양인지, 몇 개인지에 대한 가정을 아예 버리고 밀도만 본 덕에 초승달도 고리도 따라가고 잡음까지 골라낸다. 대신 밀도가 균일하다는 새 가정을 떠안았고, 그 가정이 깨지는 자리에서 HDBSCAN이 필요해진다.

GMM은 반대로 가정을 더 정교하게 만드는 쪽이다. 중심점 하나로 요약하던 클러스터를 평균과 공분산과 비율을 가진 분포로 바꾸고, 그 대가로 소속 확률을 얻는다. 확률이 있으면 "이 점은 어디에도 확신이 없다"는 판정이 가능해지는데, 하드 클러스터링에서는 애초에 표현할 수 없는 정보다.

정답이 없는 문제라서 어떤 알고리즘이 옳았는지 채점할 방법도 없다. 남는 것은 내가 세운 가정이 이 데이터에 맞았는지 확인하는 일뿐이고, 그래서 결과를 뜯어보는 시간이 알고리즘을 고르는 시간보다 길어진다.

---

## 함께 보면 좋은 글

- [K-Means 클러스터링](/ml/kmeans-clustering/) : 중심점을 옮겨가며 수렴하는 절차와 K를 고르는 기준
- [이상 탐지](/ml/anomaly-detection/) : DBSCAN이 잡음으로 떼어내는 점들을 정면으로 다루는 문제
- [t-SNE와 UMAP](/ml/tsne-and-umap/) : 클러스터링 결과를 2차원에 펼쳐 눈으로 확인하는 방법
- [나이브 베이즈](/ml/naive-bayes/) : 같은 가우시안 가정을 레이블이 있는 문제에 쓰는 경우

## 참고자료

- [Ester et al., A Density-Based Algorithm for Discovering Clusters (KDD 1996)](https://cdn.aaai.org/KDD/1996/KDD96-037.pdf)
- [scikit-learn, Clustering](https://scikit-learn.org/stable/modules/clustering.html)
- [scikit-learn, Gaussian Mixture Models](https://scikit-learn.org/stable/modules/mixture.html)
- [Bishop, Pattern Recognition and Machine Learning, Ch. 9](https://www.microsoft.com/en-us/research/publication/pattern-recognition-machine-learning/)
