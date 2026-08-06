---
date: '2026-02-04'
title: '중심점을 옮겨가며 군집을 찾는 K-Means 클러스터링'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 35
tags: ['K-Means', 'K-Means++', '클러스터링', 'Clustering', '비지도학습', 'Elbow Method', 'Silhouette', '실루엣 계수', '머신러닝']
summary: 'K-Means가 최소화하는 WCSS, 할당과 이동을 번갈아 반복하는 절차, 지역 최적을 완화하는 K-Means++ 초기화, 엘보우와 실루엣으로 K를 고르는 기준.'
thumbnail: './thumbnail.png'
---

정답 레이블이 붙어 있지 않은 데이터에도 구조는 있다. 어떤 고객이 어떤 그룹인지 아무도 표시해 주지 않았지만, 구매 이력이 비슷한 사람끼리는 실제로 모여 있다. 이 모임을 레이블 없이 찾아내는 작업이 **클러스터링**이다.

"비슷하다"의 기준은 대개 거리다. 가까우면 같은 그룹, 멀면 다른 그룹. 이 기준을 가장 곧이곧대로 구현한 알고리즘이 **K-Means**다. 클러스터마다 대표점(중심점, centroid)을 하나씩 두고, 각 데이터를 가장 가까운 중심점에 붙인 뒤, 중심점을 자기 식구들의 평균 자리로 옮긴다. 이 두 동작을 번갈아 반복하는 것이 전부다.

---

## 무엇을 최소화하는가

K-Means가 줄이려는 값은 **WCSS(Within-Cluster Sum of Squares)**다. sklearn은 이 값을 `inertia_` 속성으로 내놓는다.

$$\text{WCSS} = \sum_{k=1}^{K} \sum_{x \in C_k} \lVert x - \mu_k \rVert^2$$

$C_k$는 $k$번째 클러스터이고 $\mu_k$는 그 중심점이다. 각 점이 자기 중심점에서 얼마나 떨어져 있는지를 제곱해 모두 더한 값이니, 작을수록 클러스터 내부가 촘촘하다.

이 함수에는 미지수가 두 종류 들어 있다. 중심점의 위치와 각 점의 소속이다. 둘을 동시에 최적으로 푸는 문제는 NP-hard라서 정면으로 풀지 않는다. 대신 한쪽을 고정하면 나머지가 쉽게 풀린다는 성질을 쓴다. 소속을 고정하면 WCSS를 최소로 만드는 중심점은 그 클러스터의 평균이고,

$$\mu_k = \frac{1}{|C_k|} \sum_{x \in C_k} x$$

중심점을 고정하면 각 점의 최적 소속은 가장 가까운 중심점이다. 두 단계 어느 쪽도 WCSS를 늘리지 않으므로 번갈아 돌리면 값은 단조 감소하고, 가능한 소속 조합이 유한하니 언젠가 멈춘다.

멈춘 자리가 전역 최적이라는 보장은 없다. 초기 중심점을 어디에 두었느냐에 따라 서로 다른 지역 최적에 갇힌다. K-Means에서 초기화가 하이퍼파라미터 취급을 받는 이유가 여기에 있다.

---

## 할당과 이동을 번갈아 반복한다

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 768" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="K-Means의 한 번의 반복을 네 칸으로 나눈 그림. 초기 중심점 배치, 가장 가까운 중심점으로 할당, 소속 점의 평균으로 중심 이동, 재할당 후 수렴 순서로 위에서 아래로 이어진다.">
<defs>
<marker id="km1Tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">할당과 이동의 한 바퀴</text>
<!-- panel 1: initial centroids -->
<text x="20" y="54" font-size="16" font-weight="600" fill="var(--text, #1c1917)">1. 초기 중심점 배치</text>
<rect x="20" y="64" width="360" height="120" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="var(--bg, #fafaf8)" stroke="var(--text-muted, #6d6762)" stroke-width="1.4"><circle cx="69" cy="140" r="4.5"/><circle cx="98" cy="134" r="4.5"/><circle cx="75" cy="157" r="4.5"/><circle cx="107" cy="151" r="4.5"/><circle cx="168" cy="87" r="4.5"/><circle cx="200" cy="83" r="4.5"/><circle cx="178" cy="102" r="4.5"/><circle cx="222" cy="92" r="4.5"/><circle cx="264" cy="119" r="4.5"/><circle cx="283" cy="124" r="4.5"/><circle cx="315" cy="121" r="4.5"/><circle cx="293" cy="140" r="4.5"/><circle cx="325" cy="137" r="4.5"/></g>
<path d="M 69 133 L 76 140 L 69 147 L 62 140 Z" fill="var(--primary, #0a756c)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 264 112 L 271 119 L 264 126 L 257 119 Z" fill="var(--accent, #9d5604)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 283 117 L 290 124 L 283 131 L 276 124 Z" fill="var(--text, #1c1917)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<text x="264" y="104" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">중심점</text>
<text x="120" y="137" font-size="14" fill="var(--text-muted, #6d6762)">데이터 점</text>
<path d="M 200 192 L 200 214" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#km1Tip)"/>
<!-- panel 2: assignment -->
<text x="20" y="242" font-size="16" font-weight="600" fill="var(--text, #1c1917)">2. 할당 (가장 가까운 중심점)</text>
<rect x="20" y="252" width="360" height="120" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="var(--primary, #0a756c)"><circle cx="69" cy="328" r="4.5"/><circle cx="98" cy="322" r="4.5"/><circle cx="75" cy="345" r="4.5"/><circle cx="107" cy="339" r="4.5"/></g>
<g fill="var(--accent, #9d5604)"><rect x="164" y="271" width="8" height="8"/><rect x="196" y="267" width="8" height="8"/><rect x="174" y="286" width="8" height="8"/><rect x="218" y="276" width="8" height="8"/><rect x="260" y="303" width="8" height="8"/></g>
<g fill="var(--text, #1c1917)"><path d="M 283 307 L 288 316 L 278 316 Z"/><path d="M 315 304 L 320 313 L 310 313 Z"/><path d="M 293 323 L 298 332 L 288 332 Z"/><path d="M 325 320 L 330 329 L 320 329 Z"/></g>
<path d="M 69 321 L 76 328 L 69 335 L 62 328 Z" fill="var(--primary, #0a756c)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 264 300 L 271 307 L 264 314 L 257 307 Z" fill="var(--accent, #9d5604)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 283 305 L 290 312 L 283 319 L 276 312 Z" fill="var(--text, #1c1917)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 200 380 L 200 402" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#km1Tip)"/>
<!-- panel 3: centroid update -->
<text x="20" y="430" font-size="16" font-weight="600" fill="var(--text, #1c1917)">3. 이동 (소속 점의 평균)</text>
<rect x="20" y="440" width="360" height="120" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="var(--primary, #0a756c)"><circle cx="69" cy="516" r="4.5"/><circle cx="98" cy="510" r="4.5"/><circle cx="75" cy="533" r="4.5"/><circle cx="107" cy="527" r="4.5"/></g>
<g fill="var(--accent, #9d5604)"><rect x="164" y="459" width="8" height="8"/><rect x="196" y="455" width="8" height="8"/><rect x="174" y="474" width="8" height="8"/><rect x="218" y="464" width="8" height="8"/><rect x="260" y="491" width="8" height="8"/></g>
<g fill="var(--text, #1c1917)"><path d="M 283 495 L 288 504 L 278 504 Z"/><path d="M 315 492 L 320 501 L 310 501 Z"/><path d="M 293 511 L 298 520 L 288 520 Z"/><path d="M 325 508 L 330 517 L 320 517 Z"/></g>
<g fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.4" stroke-dasharray="4 3"><path d="M 69 516 L 87 522"/><path d="M 264 495 L 206 473"/><path d="M 283 500 L 304 507"/></g>
<g fill="none" stroke-width="1.5" stroke-dasharray="3 2"><path d="M 69 509 L 76 516 L 69 523 L 62 516 Z" stroke="var(--primary, #0a756c)"/><path d="M 264 488 L 271 495 L 264 502 L 257 495 Z" stroke="var(--accent, #9d5604)"/><path d="M 283 493 L 290 500 L 283 507 L 276 500 Z" stroke="var(--text, #1c1917)"/></g>
<path d="M 87 515 L 94 522 L 87 529 L 80 522 Z" fill="var(--primary, #0a756c)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 206 466 L 213 473 L 206 480 L 199 473 Z" fill="var(--accent, #9d5604)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 304 500 L 311 507 L 304 514 L 297 507 Z" fill="var(--text, #1c1917)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<text x="28" y="554" font-size="14" fill="var(--text-muted, #6d6762)">점선 = 이전 위치</text>
<path d="M 200 568 L 200 590" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#km1Tip)"/>
<!-- panel 4: reassignment and convergence -->
<text x="20" y="618" font-size="16" font-weight="600" fill="var(--text, #1c1917)">4. 재할당 후 수렴</text>
<rect x="20" y="628" width="360" height="120" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<g fill="var(--primary, #0a756c)"><circle cx="69" cy="704" r="4.5"/><circle cx="98" cy="698" r="4.5"/><circle cx="75" cy="721" r="4.5"/><circle cx="107" cy="715" r="4.5"/></g>
<g fill="var(--accent, #9d5604)"><rect x="164" y="647" width="8" height="8"/><rect x="196" y="643" width="8" height="8"/><rect x="174" y="662" width="8" height="8"/><rect x="218" y="652" width="8" height="8"/></g>
<g fill="var(--text, #1c1917)"><path d="M 264 678 L 269 687 L 259 687 Z"/><path d="M 283 683 L 288 692 L 278 692 Z"/><path d="M 315 680 L 320 689 L 310 689 Z"/><path d="M 293 699 L 298 708 L 288 708 Z"/><path d="M 325 696 L 330 705 L 320 705 Z"/></g>
<circle cx="264" cy="683" r="10" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.4" stroke-dasharray="3 2"/>
<text x="270" y="664" font-size="14" fill="var(--text-muted, #6d6762)">소속 변경</text>
<path d="M 87 703 L 94 710 L 87 717 L 80 710 Z" fill="var(--primary, #0a756c)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 206 654 L 213 661 L 206 668 L 199 661 Z" fill="var(--accent, #9d5604)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
<path d="M 304 688 L 311 695 L 304 702 L 297 695 Z" fill="var(--text, #1c1917)" stroke="var(--bg, #fafaf8)" stroke-width="1.5"/>
</svg>
</div>

첫 칸은 초기 중심점 세 개를 놓은 상태다. 데이터 점 중에서 K개를 그냥 뽑는 방식이라 오른쪽 두 개가 나란히 뽑혔다. 두 번째 칸에서 모든 점이 자기와 가장 가까운 중심점 쪽에 붙는다. 자기 중심점을 얻지 못한 가운데 무리는 통째로 주황색 중심점에 딸려 가고, 오른쪽 무리는 검은색을 받는다.

세 번째 칸에서 중심점이 소속 점들의 평균 자리로 옮겨간다. 주황색 중심점은 가운데 무리를 따라 왼쪽 위로 크게 이동한다. 중심점이 움직였으니 "가장 가까운 중심점"도 달라진다. 네 번째 칸에서 다시 할당하면 두 무리 사이에 걸쳐 있던 점 하나가 검은색으로 넘어간다. 한 번 더 돌려도 바뀌는 점이 없으면 수렴이다.

sklearn의 `KMeans`는 최대 `max_iter=300`회까지 돌고, 중심점 이동량이 `tol=1e-4` 아래로 떨어지면 그 전에 멈춘다. 실제로 몇 번 돌았는지는 학습 후 `n_iter_`로 확인한다.

---

## 초기화가 결과를 가른다

랜덤 초기화의 위험은 위 그림 첫 칸에 이미 들어 있다. 오른쪽 두 중심점이 서로 붙어서 뽑히는 바람에 가운데 무리는 자기 중심점을 얻지 못했다. 이번에는 첫 이동에서 주황색 중심점이 가운데로 끌려오면서 회복했지만, 세 덩어리가 더 멀리 떨어져 있었다면 한 덩어리를 두 중심점이 나눠 갖고 다른 덩어리는 통째로 남의 클러스터에 묻힌 채로 굳는다. 그 자리에서 수렴해도 WCSS는 나쁜 값에 머문다.

**K-Means++**는 2007년 Arthur와 Vassilvitskii가 제안한 초기화로, 중심점끼리 서로 멀리 떨어지도록 유도한다. 첫 중심점만 랜덤으로 뽑고, 그다음부터는 이미 뽑힌 중심점까지의 최단 거리 $D(x)$의 제곱에 비례하는 확률로 뽑는다.

$$P(x) = \frac{D(x)^2}{\sum_{x'} D(x')^2}$$

기존 중심점에서 먼 점일수록 뽑힐 확률이 커지니, 아직 중심점을 못 얻은 덩어리에서 다음 중심점이 나올 가능성이 높아진다. 이 초기화만으로 기대 WCSS가 최적값의 $O(\log K)$ 배 안에 든다는 보장이 붙는다. 순수 랜덤 초기화에는 그런 보장이 없다.

그래도 한 번의 실행으로 지역 최적을 완전히 피하지는 못해서, 서로 다른 초기화로 여러 번 돌린 뒤 WCSS가 가장 낮은 결과를 고르는 방법을 함께 쓴다. `n_init`이 그 횟수다.

:::warning

**`n_init` 기본값은 sklearn 1.4부터 `'auto'`이고, 기본 초기화에서 이 값은 1회를 뜻한다**

`'auto'`가 10회를 뜻하는 것은 `init='random'`일 때뿐이다. 기본값인 `init='k-means++'`에서는 단 한 번만 돈다. 1.4 이전 기본값이 10이었기 때문에 여전히 열 번 도는 줄 알고 쓰는 코드가 많다. 초기화 운에 민감한 데이터라면 `n_init=10`처럼 숫자를 직접 적는다.

:::

---

## K를 몇 개로 둘 것인가

K-Means는 K를 입력으로 받는다. 덩어리가 몇 개인지 모르는 상태에서 그 숫자를 먼저 정해야 한다는 뜻이다. 흔히 쓰는 기준은 둘이다.

| 기준 | 재는 값 | 고르는 법 | 약점 |
|---|---|---|---|
| 엘보우(Elbow) | K별 WCSS | 감소가 완만해지는 꺾인 점 | 꺾인 점이 안 보이는 경우가 흔하다 |
| 실루엣(Silhouette) | 점마다의 응집도와 분리도 | 평균 점수가 가장 높은 K | 점 쌍 거리를 다 계산해서 느리다 |

엘보우는 K를 늘리면 WCSS가 반드시 줄어든다는 성질에서 출발한다. K가 데이터 개수와 같아지면 WCSS는 0이다. 그러니 값 자체가 아니라 줄어드는 **속도**를 본다. 급하게 떨어지다 완만해지는 지점이 있으면 거기를 고른다.

문제는 그 지점이 보이지 않을 때가 많다는 것이다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 460" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="K에 따른 WCSS 곡선 두 개를 위아래로 비교한 그림. 위쪽 곡선은 K가 4일 때 뚜렷하게 꺾이고, 아래쪽 곡선은 꺾이는 자리 없이 고르게 감소한다.">
<text x="200" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="var(--text, #1c1917)">엘보우가 보일 때와 안 보일 때</text>
<!-- top panel: sharp elbow -->
<text x="20" y="54" font-size="16" font-weight="600" fill="var(--text, #1c1917)">위: 꺾인 자리 뚜렷 (K=4)</text>
<g fill="none" stroke="var(--border, #e7e5e4)" stroke-width="1.4"><path d="M 58 66 L 58 196"/><path d="M 52 196 L 372 196"/></g>
<text x="34" y="130" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)" transform="rotate(-90 34 130)">WCSS</text>
<path d="M 70 70 L 106 116 L 142 150 L 178 173 L 214 177 L 250 179 L 286 182 L 322 184 L 358 185" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2.2"/>
<g fill="var(--primary, #0a756c)"><circle cx="70" cy="70" r="3.5"/><circle cx="106" cy="116" r="3.5"/><circle cx="142" cy="150" r="3.5"/><circle cx="178" cy="173" r="3.5"/><circle cx="214" cy="177" r="3.5"/><circle cx="250" cy="179" r="3.5"/><circle cx="286" cy="182" r="3.5"/><circle cx="322" cy="184" r="3.5"/><circle cx="358" cy="185" r="3.5"/></g>
<circle cx="178" cy="173" r="9" fill="none" stroke="var(--accent, #9d5604)" stroke-width="2"/>
<text x="196" y="166" font-size="14" fill="var(--accent, #9d5604)">팔꿈치</text>
<g font-size="14" text-anchor="middle" fill="var(--text-muted, #6d6762)"><text x="70" y="214">1</text><text x="106" y="214">2</text><text x="142" y="214">3</text><text x="178" y="214">4</text><text x="214" y="214">5</text><text x="250" y="214">6</text><text x="286" y="214">7</text><text x="322" y="214">8</text><text x="358" y="214">9</text></g>
<!-- bottom panel: no elbow -->
<text x="20" y="254" font-size="16" font-weight="600" fill="var(--text, #1c1917)">아래: 꺾인 자리 없음</text>
<g fill="none" stroke="var(--border, #e7e5e4)" stroke-width="1.4"><path d="M 58 266 L 58 396"/><path d="M 52 396 L 372 396"/></g>
<text x="34" y="330" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)" transform="rotate(-90 34 330)">WCSS</text>
<path d="M 70 270 L 106 292 L 142 311 L 178 326 L 214 340 L 250 350 L 286 359 L 322 366 L 358 372" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2.2"/>
<g fill="var(--primary, #0a756c)"><circle cx="70" cy="270" r="3.5"/><circle cx="106" cy="292" r="3.5"/><circle cx="142" cy="311" r="3.5"/><circle cx="178" cy="326" r="3.5"/><circle cx="214" cy="340" r="3.5"/><circle cx="250" cy="350" r="3.5"/><circle cx="286" cy="359" r="3.5"/><circle cx="322" cy="366" r="3.5"/><circle cx="358" cy="372" r="3.5"/></g>
<g font-size="14" text-anchor="middle" fill="var(--text-muted, #6d6762)"><text x="70" y="414">1</text><text x="106" y="414">2</text><text x="142" y="414">3</text><text x="178" y="414">4</text><text x="214" y="414">5</text><text x="250" y="414">6</text><text x="286" y="414">7</text><text x="322" y="414">8</text><text x="358" y="414">9</text></g>
<text x="215" y="440" text-anchor="middle" font-size="14" fill="var(--text-muted, #6d6762)">K (클러스터 수)</text>
</svg>
</div>

아래쪽 곡선은 K를 늘릴수록 WCSS가 고르게 줄어들 뿐이라 어디를 골라도 근거가 약하다. 클러스터끼리 겹쳐 있거나 밀도가 이어져 있으면 이런 모양이 나오고, 실제 데이터에서 오히려 이쪽이 더 흔하다. 엘보우 하나만 보고 K를 정하면 안 되는 이유다.

실루엣은 점 단위로 두 값을 잰다. $a(i)$는 같은 클러스터의 다른 점들과의 평균 거리(응집도), $b(i)$는 가장 가까운 다른 클러스터의 점들과의 평균 거리(분리도)다.

$$s(i) = \frac{b(i) - a(i)}{\max\left(a(i),\, b(i)\right)}$$

값은 $-1$부터 $1$까지다. 1에 가까우면 자기 클러스터에 잘 붙어 있고, 0 근처면 경계에 걸쳐 있으며, 음수면 다른 클러스터가 더 가깝다는 뜻이니 잘못 할당된 점이다. 전체 평균이 실루엣 점수이고, K를 바꿔가며 이 값이 가장 높은 K를 고른다.

```python
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

for k in range(2, 11):
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = km.fit_predict(X_scaled)
    print(k, round(km.inertia_, 1), round(silhouette_score(X_scaled, labels), 3))
```

평균값만 보면 놓치는 것이 있다. `silhouette_samples`로 점마다의 값을 꺼내 클러스터별로 나눠 보면, 평균은 높은데 특정 클러스터 하나만 값이 낮거나 음수 구간이 넓은 경우가 드러난다. 그 클러스터를 더 쪼개는 쪽이 나은 상황이다. 엘보우와 실루엣이 다른 K를 가리키는 일도 흔한데, 그럴 때는 두 K로 각각 돌려 보고 클러스터의 내용이 해석되는 쪽을 고르는 편이 낫다.

---

## K-Means가 틀리는 자리

| 상황 | 왜 틀리나 | 대안 |
|---|---|---|
| 초승달·고리 모양 클러스터 | 경계가 항상 직선이라 휘어진 덩어리를 못 따라간다 | DBSCAN, 스펙트럴 클러스터링 |
| 이상치가 섞임 | 중심점이 평균이라 멀리 있는 점 하나에 크게 끌려간다 | K-Medoids(PAM) |
| 클러스터의 크기·밀도가 제각각 | 큰 덩어리의 중심점이 작은 덩어리 쪽 점까지 가져간다 | GMM, HDBSCAN |
| 피처 스케일이 제각각 | 값의 범위가 큰 피처가 거리를 사실상 혼자 결정한다 | 스케일링을 먼저 적용 |

첫 줄이 나머지를 상당 부분 설명한다. K-Means가 그릴 수 있는 경계는 중심점 두 개를 잇는 선분의 수직이등분선뿐이다. 결과적으로 공간은 중심점들의 보로노이 다이어그램으로 쪼개지고, 각 조각은 직선으로 둘러싸인 볼록한 영역이 된다. 이 조각들로 표현할 수 없는 모양이면 K를 아무리 잘 골라도 답이 나오지 않는다.

마지막 줄은 선택이 아니라 필수다. 연 소득(수천만 단위)과 월 방문 횟수(한 자릿수)를 그대로 넣으면 거리는 소득 차이만 반영한다. `StandardScaler`를 앞에 붙이는 것이 기본이다.

---

## 데이터가 커지면

반복마다 모든 점과 모든 중심점의 거리를 재는 비용은 $O(NKd)$다. N이 수십만을 넘어가면 이 계산이 부담스러워진다. `MiniBatchKMeans`는 반복마다 전체가 아니라 무작위로 뽑은 배치 $b$개만 써서 중심점을 갱신하고, 반복당 비용을 $O(bKd)$로 낮춘다. WCSS는 조금 나빠지지만 속도 차이가 크다.

```python
from sklearn.cluster import MiniBatchKMeans

mbkm = MiniBatchKMeans(n_clusters=5, batch_size=1024, n_init=3, random_state=42)
mbkm.fit(X_scaled)
```

`MiniBatchKMeans`의 `n_init` 기본값도 `'auto'`이고, k-means++ 초기화에서는 역시 1회다. 여기서는 3으로 올려 잡았다.

---

## 고객 세분화라는 대표 사례

K-Means가 실무에서 가장 자주 불려 나오는 자리는 고객 세분화다. 최근성(Recency), 빈도(Frequency), 금액(Monetary) 세 축으로 고객을 묶는 RFM 분석이 대표적이다.

```python
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

X_scaled = StandardScaler().fit_transform(df[['recency', 'frequency', 'monetary']])

km = KMeans(n_clusters=3, n_init=10, random_state=42)
df['cluster'] = km.fit_predict(X_scaled)

print(df.groupby('cluster')[['recency', 'frequency', 'monetary']].mean().round(1))
```

```text
         recency  frequency  monetary
cluster
0           10.2       29.8     498.3
1           49.5       10.1     201.2
2          119.8        3.2      52.1
```

세 줄만 봐도 성격이 갈린다. 0번은 최근에 자주 많이 사는 무리, 2번은 오래전에 몇 번 사고 끊긴 무리다. 여기서 짚어둘 점은 클러스터에 붙는 이름을 K-Means가 지어주지 않는다는 것이다. 알고리즘은 번호만 돌려주고, 각 번호가 무슨 뜻인지는 이렇게 축별 평균을 뜯어본 뒤 사람이 붙인다. 정답이 없는 문제에서 결과를 해석하는 절차가 늘 이렇다.

---

## 마치며

K-Means의 두 단계는 따로 떼어 놓고 보면 당연한 계산이다. 소속이 정해지면 최선의 중심점은 평균이고, 중심점이 정해지면 최선의 소속은 최근접이다. 이 둘을 번갈아 돌리는 것만으로 WCSS가 계속 줄어든다는 점이 알고리즘의 전부이자, 지역 최적을 벗어나지 못하는 이유이기도 하다.

그래서 K-Means를 쓸 때 실제로 손이 가는 곳은 알고리즘 바깥이다. 스케일링을 했는지, 초기화를 몇 번 돌렸는지, K를 무슨 근거로 골랐는지가 결과를 좌우한다. 특히 `n_init`은 기본값이 조용히 바뀐 값이라 한 번 확인하고 넘어가는 편이 좋다.

한계도 알고리즘의 정의에서 곧장 나온다. 경계가 직선이라는 제약과 K를 미리 정해야 한다는 제약은 튜닝으로 풀리지 않는다. 다음 글에서는 같은 비지도 문제이지만 목표가 반대인 쪽, 나머지와 다른 점을 골라내는 이상 탐지를 다룬다.

---

## 함께 보면 좋은 글

- [피처 스케일링](/ml/feature-scaling/) : 거리 기반 알고리즘 앞에 스케일링이 반드시 와야 하는 이유
- [DBSCAN과 GMM](/ml/dbscan-and-gmm/) : 구형 가정과 K 사전 지정을 벗어나는 클러스터링
- [KNN](/ml/knn/) : 같은 거리 개념을 레이블이 있는 문제에 쓰는 경우
- [이상 탐지](/ml/anomaly-detection/) : 어느 무리에도 맞지 않는 점을 찾아내는 문제
