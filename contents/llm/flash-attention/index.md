---
date: '2026-09-01'
title: '(TBD)'
category: 'LLM'
series: 'llm'
seriesOrder: 7
tags: ['LLM', 'FlashAttention', 'Online Softmax', 'GPU Memory', 'IO-Awareness']
summary: '(TBD)'
thumbnail: './thumbnail.png'
---

어텐션은 모든 토큰 쌍의 점수를 계산합니다. 토큰이 $n$개면 점수 행렬은 $n \times n$이고, 128K 문맥에서 이 행렬은 레이어 하나에 약 1.1TB입니다. GPU 메모리가 80GB인 시대에 이 행렬을 통째로 만드는 것은 불가능하고, 설령 가능하다 해도 진짜 병목은 크기가 아니라 이 행렬을 읽고 쓰는 속도입니다.

FlashAttention(Dao et al., 2022)은 이 점수 행렬을 아예 만들지 않고 정확한 어텐션을 계산합니다. GPU 안의 작고 빠른 메모리(SRAM)에서 타일 단위로 계산을 끝내고, 중간 결과를 느린 메모리(HBM)에 쓰지 않는 것이 핵심입니다. 이 글에서는 왜 데이터 이동이 병목인지부터 시작해, 타일링과 online softmax가 어떻게 이 문제를 푸는지, 그리고 그 대가가 무엇인지를 따라갑니다.

<br>

## 느린 것은 연산이 아니라 이동이다

GPU 안에는 두 종류의 메모리가 있습니다. 하나는 대용량이지만 느린 HBM(High Bandwidth Memory)이고, 다른 하나는 용량이 작지만 빠른 SRAM(Static RAM)입니다. 연산 유닛은 SRAM에 올라와 있는 데이터만 처리할 수 있습니다. HBM에 있는 데이터를 쓰려면 먼저 SRAM으로 옮겨야 하고, 결과를 저장하려면 다시 HBM으로 내려야 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 220" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="GPU 메모리 계층도: 큰 HBM과 작은 SRAM, 연산 유닛은 SRAM에서만 데이터를 받습니다">
<style>
.fa1-hbm { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 8; }
.fa1-sram { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.fa1-alu { fill: var(--accent, #9d5604); fill-opacity: 0.12; stroke: var(--accent, #9d5604); stroke-width: 1.5; rx: 6; }
.fa1-t { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; dominant-baseline: central; }
.fa1-ts { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.fa1-tm { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; dominant-baseline: central; }
.fa1-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#fa1-ar); }
.fa1-arr2 { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-start: url(#fa1-ar2); marker-end: url(#fa1-ar); }
.fa1-bot { stroke: var(--accent, #9d5604); stroke-width: 2; stroke-dasharray: 5 3; fill: none; }
</style>
<defs>
<marker id="fa1-ar" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/></marker>
<marker id="fa1-ar2" markerWidth="7" markerHeight="5" refX="0" refY="3" orient="auto"><path d="M7,0 L0,3 L7,6 Z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<!-- HBM -->
<rect x="20" y="20" width="170" height="180" class="fa1-hbm"/>
<text x="105" y="55" class="fa1-t" font-weight="600">HBM</text>
<text x="105" y="80" class="fa1-ts">80GB</text>
<text x="105" y="105" class="fa1-tm">~2TB/s</text>
<text x="105" y="130" class="fa1-tm">크고 느림</text>
<!-- 양방향 화살표 -->
<line x1="195" y1="110" x2="240" y2="110" class="fa1-arr2"/>
<text x="218" y="95" class="fa1-tm">병목</text>
<!-- SRAM -->
<rect x="245" y="60" width="135" height="70" class="fa1-sram"/>
<text x="312" y="85" class="fa1-t" font-weight="600">SRAM</text>
<text x="312" y="110" class="fa1-ts">~20MB</text>
<!-- 연산 유닛 -->
<rect x="265" y="155" width="95" height="40" class="fa1-alu"/>
<text x="312" y="175" class="fa1-ts">연산 유닛</text>
<!-- SRAM → 연산 -->
<line x1="312" y1="130" x2="312" y2="150" class="fa1-arr"/>
</svg>
</div>

A100 GPU를 예로 들면 HBM은 80GB에 대역폭이 약 2TB/s이고, SRAM(온칩 공유 메모리)은 약 20MB에 대역폭이 약 19TB/s입니다. 용량 차이는 4,000배, 속도 차이는 약 10배입니다. 계산 자체는 빠르지만 데이터를 HBM에서 가져오는 데 시간이 걸립니다.

표준 어텐션은 이 경로를 여러 번 왕복합니다. Q와 K를 HBM에서 읽어 점수 행렬 $QK^\top$를 계산한 뒤 그 $n \times n$ 결과를 HBM에 씁니다. softmax를 적용하기 위해 그 행렬을 다시 읽고, softmax 결과를 다시 HBM에 씁니다. 마지막으로 V와 곱하기 위해 또 한 번 읽습니다. 연산 유닛은 대부분의 시간을 데이터가 올라오기를 기다리며 보냅니다.

이것이 Dao et al.(2022)이 FlashAttention 논문에서 짚은 핵심입니다. 어텐션의 병목은 연산량(FLOPs)이 아니라 데이터 이동량(IO)입니다. 알고리즘을 설계할 때 연산 횟수만이 아니라 HBM을 몇 번 읽고 쓰는지까지 함께 고려해야 합니다. 이 관점을 **IO-awareness**라고 부릅니다.

<br>

## 점수 행렬을 만들지 않는 타일링

FlashAttention의 핵심 아이디어는 단순합니다. $n \times n$ 점수 행렬을 HBM에 전혀 쓰지 않는 것입니다.

Q, K, V를 SRAM에 들어가는 크기의 블록으로 나눕니다. Q의 $i$번째 블록과 K, V의 $j$번째 블록을 SRAM에 올려서 그 타일에 해당하는 어텐션을 계산합니다. 중간 결과인 점수 행렬은 SRAM 안에만 존재하고, 최종 출력 O만 HBM에 기록합니다. 모든 타일을 순회하면 전체 어텐션 결과가 완성됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="FlashAttention 타일링: HBM에서 Q, K, V 블록을 SRAM으로 올려 계산하고, 결과 O만 HBM에 기록. 점수 행렬은 SRAM 안에만 존재합니다">
<style>
.fa2-hbm { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.fa2-sram { fill: var(--primary, #0a756c); fill-opacity: 0.10; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.fa2-blk { fill: var(--primary, #0a756c); fill-opacity: 0.25; stroke: var(--primary, #0a756c); stroke-width: 1; rx: 3; }
.fa2-out { fill: var(--accent, #9d5604); fill-opacity: 0.20; stroke: var(--accent, #9d5604); stroke-width: 1; rx: 3; }
.fa2-no { fill: var(--text-danger, #cb2121); fill-opacity: 0.10; stroke: var(--text-danger, #cb2121); stroke-width: 1.5; rx: 3; stroke-dasharray: 5 3; }
.fa2-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.fa2-ts { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; dominant-baseline: central; }
.fa2-td { fill: var(--text-danger, #cb2121); font-size: 15px; text-anchor: middle; dominant-baseline: central; font-weight: 600; }
.fa2-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#fa2-ar); }
.fa2-arr-out { stroke: var(--accent, #9d5604); stroke-width: 1.5; fill: none; marker-end: url(#fa2-ar2); }
</style>
<defs>
<marker id="fa2-ar" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/></marker>
<marker id="fa2-ar2" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--accent, #9d5604)"/></marker>
</defs>
<!-- HBM 영역 -->
<rect x="10" y="10" width="110" height="300" class="fa2-hbm"/>
<text x="65" y="30" class="fa2-t" font-weight="600">HBM</text>
<!-- Q, K, V 블록 (세로 줄무늬) -->
<rect x="20" y="45" width="28" height="80" class="fa2-blk"/><text x="34" y="85" class="fa2-ts">Q</text>
<rect x="53" y="45" width="28" height="80" class="fa2-blk"/><text x="67" y="85" class="fa2-ts">K</text>
<rect x="86" y="45" width="28" height="80" class="fa2-blk"/><text x="100" y="85" class="fa2-ts">V</text>
<!-- n×n 점수 행렬 삭제 표시 -->
<rect x="20" y="140" width="90" height="60" class="fa2-no"/>
<text x="65" y="163" class="fa2-td">n×n</text>
<text x="65" y="182" class="fa2-td">저장 안 함</text>
<!-- 출력 O -->
<rect x="20" y="220" width="90" height="35" class="fa2-out"/>
<text x="65" y="238" class="fa2-t">출력 O</text>
<!-- 화살표: HBM → SRAM -->
<line x1="120" y1="80" x2="155" y2="80" class="fa2-arr"/>
<!-- SRAM 영역 -->
<rect x="160" y="30" width="220" height="245" class="fa2-sram"/>
<text x="270" y="52" class="fa2-t" font-weight="600">SRAM</text>
<!-- SRAM 안의 블록들 -->
<rect x="175" y="70" width="55" height="35" class="fa2-blk"/><text x="202" y="88" class="fa2-ts">Q 블록</text>
<rect x="175" y="115" width="55" height="35" class="fa2-blk"/><text x="202" y="133" class="fa2-ts">K 블록</text>
<rect x="175" y="160" width="55" height="35" class="fa2-blk"/><text x="202" y="178" class="fa2-ts">V 블록</text>
<!-- 계산 -->
<line x1="235" y1="88" x2="265" y2="130" class="fa2-arr"/>
<line x1="235" y1="133" x2="265" y2="130" class="fa2-arr"/>
<rect x="270" y="100" width="95" height="65" fill="var(--bg-warn, #fffbeb)" stroke="var(--accent, #9d5604)" stroke-width="1" rx="4"/>
<text x="317" y="120" class="fa2-t">타일 계산</text>
<text x="317" y="140" class="fa2-ts">점수·softmax</text>
<text x="317" y="155" class="fa2-ts">·V 곱</text>
<!-- V 블록 → 계산 -->
<line x1="235" y1="178" x2="265" y2="155" class="fa2-arr"/>
<!-- 결과 → HBM의 O -->
<path d="M317,170 L317,240 L115,240" class="fa2-arr-out"/>
<text x="220" y="230" class="fa2-ts">결과만 기록</text>
</svg>
</div>

여기서 문제가 하나 생깁니다. softmax는 한 행 전체에서 가장 큰 값을 알아야 계산할 수 있습니다. 전체 K를 한꺼번에 보면 최댓값을 바로 구할 수 있지만, 타일 단위로 K를 나눠서 보면 현재 타일의 값만 보이기 때문에 전체 최댓값을 알 수 없습니다.

FlashAttention은 **online softmax**(Milakov & Gimelshein, 2018)를 활용해 이 문제를 풀었습니다. 타일을 하나씩 처리하면서 지금까지의 최댓값 $m$과 지수 합 $\ell$을 유지합니다. 새 타일에서 기존 $m$보다 큰 값이 발견되면 이전까지 쌓아온 출력을 보정계수 $e^{m_{\text{old}} - m_{\text{new}}}$로 다시 곱합니다. 근사가 아니라 수학적으로 정확한 결과입니다.

$$
m^{(\text{new})} = \max\!\big(m^{(\text{old})},\, \tilde{m}^{(j)}\big), \qquad
\ell^{(\text{new})} = e^{m^{(\text{old})} - m^{(\text{new})}}\,\ell^{(\text{old})} + e^{\tilde{m}^{(j)} - m^{(\text{new})}}\,\tilde{\ell}^{(j)}
$$

$m$은 지금까지 처리한 타일들에서 본 가장 큰 점수이고, $\ell$은 보정된 지수 합입니다. $\tilde{m}^{(j)}$와 $\tilde{\ell}^{(j)}$는 새 타일 $j$ 안에서의 로컬 최댓값과 로컬 지수 합입니다. 출력 벡터 $O$도 같은 보정계수로 재스케일됩니다. 새 타일을 볼 때마다 "과거의 계산이 틀리지 않았는지" 교정하는 셈이고, 모든 타일을 다 보고 나면 전체를 한꺼번에 계산한 것과 완전히 같은 결과가 나옵니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 260" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Online softmax 진행 과정: 세 타일을 순서대로 처리하면서 running max와 running sum을 갱신. 두 번째 타일에서 새 max 발견 시 이전 결과를 보정합니다">
<style>
.fa3-tile { stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 5; }
.fa3-t1 { fill: var(--bg-muted, #eeecea); }
.fa3-t2 { fill: var(--primary, #0a756c); fill-opacity: 0.15; }
.fa3-t3 { fill: var(--bg-muted, #eeecea); }
.fa3-t { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; dominant-baseline: central; }
.fa3-ts { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; dominant-baseline: central; }
.fa3-fix { fill: var(--accent, #9d5604); font-size: 14px; text-anchor: middle; dominant-baseline: central; font-weight: 600; }
.fa3-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#fa3-ar); }
.fa3-fix-arr { stroke: var(--accent, #9d5604); stroke-width: 1.5; fill: none; marker-end: url(#fa3-ar2); stroke-dasharray: 5 3; }
</style>
<defs>
<marker id="fa3-ar" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/></marker>
<marker id="fa3-ar2" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--accent, #9d5604)"/></marker>
</defs>
<!-- 타일 1 -->
<rect x="15" y="20" width="110" height="80" class="fa3-tile fa3-t1"/>
<text x="70" y="42" class="fa3-t" font-weight="600">타일 1</text>
<text x="70" y="65" class="fa3-ts">m = 3.2</text>
<text x="70" y="85" class="fa3-ts">ℓ = 4.1</text>
<!-- 화살표 1→2 -->
<line x1="130" y1="60" x2="150" y2="60" class="fa3-arr"/>
<!-- 타일 2 (강조) -->
<rect x="155" y="20" width="110" height="80" class="fa3-tile fa3-t2" stroke="var(--primary, #0a756c)"/>
<text x="210" y="42" class="fa3-t" font-weight="600">타일 2</text>
<text x="210" y="65" class="fa3-ts">새 max = 5.7</text>
<text x="210" y="85" class="fa3-ts">m 갱신!</text>
<!-- 화살표 2→3 -->
<line x1="270" y1="60" x2="290" y2="60" class="fa3-arr"/>
<!-- 타일 3 -->
<rect x="295" y="20" width="90" height="80" class="fa3-tile fa3-t3"/>
<text x="340" y="42" class="fa3-t" font-weight="600">타일 3</text>
<text x="340" y="65" class="fa3-ts">m 유지</text>
<text x="340" y="85" class="fa3-ts">ℓ 누적</text>
<!-- 보정 화살표 -->
<path d="M210,105 C210,145 70,145 70,105" class="fa3-fix-arr"/>
<text x="140" y="155" class="fa3-fix">이전 출력 O 보정</text>
<text x="140" y="175" class="fa3-ts">× e^(3.2 - 5.7)</text>
<!-- 최종 결과 -->
<rect x="80" y="200" width="240" height="40" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #107836)" stroke-width="1.5" rx="5"/>
<text x="200" y="222" fill="var(--text-success, #107836)" font-size="15px" text-anchor="middle" dominant-baseline="central" font-weight="600">전체를 한꺼번에 계산한 것과 동일한 결과</text>
</svg>
</div>

<br>

## 저장 대신 다시 계산한다

타일링으로 순방향(forward) 문제는 풀렸지만, 학습에서 쓰는 역방향(backward) 전파에는 $n \times n$ 어텐션 행렬이 필요합니다. 표준 방식은 순방향에서 이 행렬을 HBM에 저장해 뒀다가 역방향에서 꺼내 씁니다.

FlashAttention은 다르게 합니다. 점수 행렬을 저장하지 않고, 역방향에서 Q, K, V 블록을 다시 로드해서 다시 계산합니다. 순방향에서 저장해 두는 것은 softmax 통계치(running max $m$과 running sum $\ell$)뿐입니다. 이 값만 있으면 역방향에서도 타일 단위로 정확한 기울기를 구할 수 있습니다.

대가가 있습니다. 재계산이니 전체 FLOPs는 늘어납니다. 그러나 $n \times n$ 행렬을 HBM에서 읽는 것보다 Q, K, V 블록을 다시 계산하는 것이 빠릅니다. IO가 줄면 벽시계 시간이 줄어드는 것이고, IO가 병목인 상황에서는 연산을 더 하는 쪽이 오히려 빠릅니다.

이 트레이드오프를 수식으로 표현하면 이렇습니다.

$$
\text{표준: } \Theta(Nd + N^2) \quad \text{HBM 접근} \qquad \text{Flash: } O\!\left(\frac{N^2 d^2}{M}\right) \quad \text{HBM 접근}
$$

$N$은 시퀀스 길이, $d$는 head 차원, $M$은 SRAM 크기입니다. 표준 어텐션은 Q, K, V, O를 읽고 쓰는 $Nd$ 항과 점수 행렬을 읽고 쓰는 $N^2$ 항이 합쳐집니다. FlashAttention은 점수 행렬을 HBM에 쓰지 않으므로 $N^2$ 항이 사라지고, 대신 SRAM 크기 $M$이 분모에 들어옵니다. SRAM이 충분히 커서 $M \geq d^2$이면 $O(N^2 d)$가 되어 이론적 하한에 도달합니다. 실제로 A100의 SRAM(~20MB)은 일반적인 head 차원($d = 64$~$128$)에서 이 조건을 만족합니다.

<br>

## FlashAttention은 지금도 바뀌고 있다

FlashAttention은 2022년 첫 등장 이후 하드웨어 세대가 바뀔 때마다 함께 바뀌고 있습니다.

**FlashAttention-1**(Dao et al., 2022)이 위에서 설명한 알고리즘입니다. A100 GPU에서 표준 어텐션 대비 벽시계 시간 2~4배 단축, 메모리는 시퀀스 길이에 비례하는 $O(N)$으로 줄었습니다.

**FlashAttention-2**(Dao, 2023)는 같은 하드웨어에서 알고리즘을 개선했습니다. softmax 보정 같은 비행렬곱 연산(non-matmul FLOPs)의 비중을 줄이고, 시퀀스 길이 차원으로도 병렬화를 확장했으며, warp 간 통신을 줄였습니다. A100에서 FA1 대비 약 2배 추가 향상을 달성해, 이론적 최대 처리량의 50~73%에 도달했습니다.

**FlashAttention-3**(Shah et al., 2024)는 H100(Hopper) GPU를 겨냥했습니다. Hopper 세대가 도입한 비동기 실행(TMA를 통한 데이터 전송과 연산의 중첩), warp 특수화(생산자 warp과 소비자 warp의 분리), FP8 저정밀 연산을 활용합니다. 하드웨어가 바뀌면 같은 아이디어라도 구현이 근본적으로 달라져야 한다는 것을 보여주는 사례입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 270" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="FlashAttention 진화: FA1(2022, A100)에서 FA2(2023, A100)로, 다시 FA3(2024, H100)로 진화하며 각 세대의 핵심 변경사항">
<style>
.fa4-box { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; rx: 6; }
.fa4-cur { fill: var(--primary, #0a756c); fill-opacity: 0.10; stroke: var(--primary, #0a756c); stroke-width: 1.5; rx: 6; }
.fa4-t { fill: var(--text, #1c1917); font-size: 16px; dominant-baseline: central; font-weight: 600; }
.fa4-ts { fill: var(--text-muted, #6d6762); font-size: 14px; dominant-baseline: central; }
.fa4-gpu { fill: var(--accent, #9d5604); font-size: 14px; dominant-baseline: central; font-weight: 600; }
.fa4-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#fa4-ar); }
</style>
<defs>
<marker id="fa4-ar" markerWidth="7" markerHeight="5" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<!-- FA1 -->
<rect x="20" y="15" width="360" height="60" class="fa4-box"/>
<text x="35" y="37" class="fa4-t">FA1 (2022)</text>
<text x="35" y="57" class="fa4-ts">타일링 + online softmax + 재계산</text>
<text x="330" y="47" class="fa4-gpu">A100</text>
<!-- 화살표 -->
<line x1="200" y1="75" x2="200" y2="95" class="fa4-arr"/>
<!-- FA2 -->
<rect x="20" y="100" width="360" height="60" class="fa4-box"/>
<text x="35" y="122" class="fa4-t">FA2 (2023)</text>
<text x="35" y="142" class="fa4-ts">비행렬곱 FLOPs 감소 + 시퀀스 차원 병렬화</text>
<text x="330" y="132" class="fa4-gpu">A100</text>
<!-- 화살표 -->
<line x1="200" y1="160" x2="200" y2="180" class="fa4-arr"/>
<!-- FA3 -->
<rect x="20" y="185" width="360" height="70" class="fa4-cur"/>
<text x="35" y="207" class="fa4-t">FA3 (2024)</text>
<text x="35" y="227" class="fa4-ts">비동기 실행 + warp 특수화 + FP8</text>
<text x="35" y="245" class="fa4-ts">하드웨어가 바뀌면 알고리즘도 바뀐다</text>
<text x="330" y="217" class="fa4-gpu">H100</text>
</svg>
</div>

FlashAttention과 함께 자주 언급되는 **PagedAttention**(Kwon et al., 2023)은 다른 문제를 풀고 있습니다. PagedAttention은 KV Cache가 HBM 안에서 연속 공간을 차지해야 하는 제약을 깨고 페이지 단위로 흩어 저장하는 기법입니다. 쉽게 말해 PagedAttention은 **메모리 할당**(데이터가 어디에 앉는가)을, FlashAttention은 **메모리 이동**(데이터를 얼마나 읽고 쓰는가)을 최적화합니다. vLLM 같은 서빙 엔진에서 두 기법은 함께 동작합니다.

<br>

## 마치며

어텐션의 연산량은 $O(N^2)$이지만, 진짜 병목은 연산이 아니라 GPU 메모리 계층 사이의 데이터 이동이었습니다. FlashAttention은 타일링과 online softmax로 $n \times n$ 점수 행렬을 없앴고, 재계산으로 역방향 저장도 없앴습니다. FLOPs를 더 쓰면서 시간을 줄인, IO 관점의 설계입니다.

이 글까지 Transformer 블록의 모든 부품을 다뤘습니다. 어텐션, 정규화, 잔차 연결, FFN, 그리고 그 어텐션을 실제로 계산하는 방법까지. 다음 글에서는 이 블록을 그대로 반복 쌓는 것이 아니라, FFN을 여러 전문가로 나눠 토큰마다 일부만 활성화하는 MoE(Mixture of Experts) 아키텍처를 다룹니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [Transformer 블록 뜯어보기](/llm/normalization-and-residual/)
- [vLLM의 핵심 원리 PagedAttention 파헤치기](/llm/paged-attention/)
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)

<br>

## 참고자료

- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (Dao et al., NeurIPS 2022)](https://arxiv.org/abs/2205.14135)
- [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning (Dao, ICLR 2024)](https://arxiv.org/abs/2307.08691)
- [FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision (Shah et al., 2024)](https://arxiv.org/abs/2407.08691)
- [Online normalizer calculation for softmax (Milakov & Gimelshein, 2018)](https://arxiv.org/abs/1805.02867)
- [Self-attention Does Not Need O(n²) Memory (Rabe & Staats, 2021)](https://arxiv.org/abs/2112.05682)
- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180)
