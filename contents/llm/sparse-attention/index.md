---
date: '2026-09-15'
title: '어텐션이 모든 위치를 봐야 하는가'
category: 'LLM'
series: 'llm'
seriesOrder: 10
tags: ['LLM', 'Sparse Attention', 'MoBA', 'NSA', 'Sliding Window', 'KV Cache']
summary: '슬라이딩 윈도우부터 블록 단위 선택까지, 희소 어텐션이 줄이는 것과 남기는 것을 짚습니다.'
thumbnail: './thumbnail.png'
---

MLA가 토큰당 캐시를 576차원으로 압축한 뒤에도 달라지지 않는 것이 있습니다. 128K 컨텍스트에서 한 토큰을 생성할 때 어텐션은 레이어마다 131,072개 위치를 전부 읽습니다. 각 위치에 저장하는 바이트는 줄었지만 읽어야 할 위치의 수, 그러니까 시퀀스 길이는 그대로입니다. MLA와 GQA가 풀었던 문제는 "토큰당 얼마를 저장하는가"이고 읽는 횟수는 별개의 축이죠.

모든 위치를 꼭 읽어야 할까요? 실제로 어텐션 가중치의 대부분은 소수의 위치에 몰립니다. 나머지 위치의 가중치는 softmax를 거치면 거의 0에 가까워지죠. 128K 시퀀스에서도 유의미한 가중치를 받는 위치는 전체의 20% 안팎이라는 실측 결과가 있습니다. 나머지 80%를 처음부터 건너뛰면 어텐션의 $O(n^2)$ 연산을 줄일 수 있지 않을까요?

이것이 희소 어텐션(Sparse Attention)의 출발점입니다. 가장 단순한 형태는 주변 토큰만 보는 슬라이딩 윈도우이고, 2025년부터는 어떤 위치를 볼지를 학습하는 방식이 프론티어 모델에 들어왔습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 220" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="KV Cache 비용의 두 축. 세로축은 토큰당 저장 크기(GQA, MLA가 줄이는 것), 가로축은 읽는 위치 수(희소 어텐션이 줄이는 것). Full Attention은 양쪽 다 크고, SWA는 양쪽 다 줄입니다.">
  <style>
    .sp1-ax  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; fill: none; marker-end: url(#sp1Ar); }
    .sp1-lab { fill: var(--text-muted, #6d6762); font-size: 14px; }
    .sp1-t   { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
    .sp1-ts  { fill: var(--text-muted, #6d6762); font-size: 13px; }
    .sp1-dot { r: 5; }
    .sp1-full { fill: var(--text-muted, #6d6762); }
    .sp1-gqa  { fill: var(--accent, #9d5604); }
    .sp1-swa  { fill: var(--primary, #0a756c); }
    .sp1-blk  { fill: var(--text-danger, #dc2626); }
  </style>
  <defs>
    <marker id="sp1Ar" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill="var(--border, #e7e5e4)"/></marker>
  </defs>
  <!-- axes -->
  <path d="M60,180 L380,180" class="sp1-ax"/>
  <path d="M60,180 L60,20" class="sp1-ax"/>
  <text x="220" y="210" text-anchor="middle" class="sp1-lab">읽는 위치 수 (시퀀스 길이)</text>
  <text x="18" y="100" text-anchor="middle" class="sp1-lab" transform="rotate(-90,18,100)">KV 캐시 메모리</text>
  <!-- zone labels -->
  <text x="340" y="42" text-anchor="end" class="sp1-ts">많이 저장 · 많이 읽음</text>
  <text x="158" y="42" text-anchor="end" class="sp1-ts">많이 저장 · 적게 읽음</text>
  <!-- Full Attention -->
  <circle cx="320" cy="55" class="sp1-dot sp1-full"/>
  <text x="308" y="72" text-anchor="end" class="sp1-t">Full</text>
  <!-- GQA / MLA -->
  <circle cx="320" cy="150" class="sp1-dot sp1-gqa"/>
  <text x="308" y="160" text-anchor="end" class="sp1-t">GQA/MLA</text>
  <text x="308" y="175" text-anchor="end" class="sp1-ts">저장 ↓ 읽기 그대로</text>
  <!-- SWA -->
  <circle cx="150" cy="150" class="sp1-dot sp1-swa"/>
  <text x="155" y="143" class="sp1-t">SWA</text>
  <text x="155" y="128" class="sp1-ts">저장 ↓ 읽기 ↓ (고정)</text>
  <!-- Learned Sparse -->
  <circle cx="150" cy="55" class="sp1-dot sp1-blk"/>
  <text x="155" y="50" class="sp1-t">블록 선택</text>
  <text x="155" y="72" class="sp1-ts">저장 그대로 · 읽기 ↓</text>
</svg>
</div>

## 고정 규칙의 한계

슬라이딩 윈도우 어텐션(Sliding Window Attention, SWA)은 가장 직관적인 접근입니다. 각 쿼리가 최근 $w$개 토큰만 어텐션하고 나머지는 무시합니다. 어텐션 마스크로 보면 대각선을 따라 폭 $w$인 띠만 남기고 나머지를 전부 차단하는 것이죠.

SWA가 줄이는 것은 두 가지입니다. 첫째, 어텐션 연산이 $O(n^2)$에서 $O(n \cdot w)$로 줄어들어 시퀀스 길이에 선형이 됩니다. 둘째, 윈도우 밖의 KV는 캐시에서 아예 버리기 때문에 저장 공간도 줄어듭니다. 레이어당 $n$개가 아니라 $w$개의 KV만 유지하면 되죠.

Mistral 7B(2023)가 $w = 4{,}096$으로 SWA를 대중화했고, Gemma 3(2025)는 $w = 1{,}024$까지 줄이면서 하이브리드 구조를 도입했습니다. 48개 레이어 중 40개는 SWA(local), 8개만 전체 시퀀스를 보는 풀 어텐션(global)을 쓰는 5:1 비율입니다. 로컬 레이어가 최근 맥락의 세부를 처리하고 글로벌 레이어가 시퀀스 전체의 의존성을 잡는 분업이죠.

하이브리드 구조가 등장한 이유는 SWA의 고정 규칙이라는 한계 때문입니다. 윈도우는 현재 위치 기준 최근 $w$개만 보므로 위치에 따라 중요한 토큰이 달라져도 언제나 같은 범위를 보죠. 문서 서두의 시스템 프롬프트나 핵심 정의가 수천 토큰 전에 있으면 SWA 레이어에서는 그 정보가 사라집니다. 글로벌 레이어를 섞는 것은 이 맹점을 보완하는 것이지만, 글로벌 레이어에서는 여전히 모든 위치를 읽어야 하죠.

그렇다면 고정 규칙 대신, 쿼리마다 중요한 위치를 동적으로 골라서 볼 수는 없을까요?

## 블록 단위 선택이라는 수렴

가장 먼저 떠오르는 방법은 토큰마다 중요도 점수를 매겨 상위 $k$개만 고르는 것입니다. DeepSeek의 DSA(DeepSeek Sparse Attention, 2025)가 이 방식을 썼습니다. 각 쿼리가 경량 인덱서(lightning indexer)로 모든 키에 점수를 매기고 높은 순서대로 선택합니다. 점수 함수는 ReLU를 게이트로 쓰는 다중 헤드 내적이고, 실제 어텐션보다 훨씬 가볍죠.

문제는 인덱서의 복잡도입니다. 인덱서가 가볍더라도 쿼리 하나가 $n$개 토큰 전부에 점수를 매기고, 이것을 $n$개 쿼리 각각이 수행하면 인덱서만으로 $O(n^2)$입니다. DSA 논문도 이 점을 명시하고 있죠. 실제로는 FP8 정밀도와 적은 헤드 수 덕분에 풀 어텐션보다 훨씬 빠르지만 이론적 복잡도 자체는 줄어들지 않습니다. 128K에서는 실용적이지만 1M 컨텍스트로 가면 인덱서가 비교해야 할 항목이 8배로 늘어나 비용이 무시하기 어려워지죠.

더 근본적인 문제도 있습니다. 토큰 단위 선택은 불규칙한 메모리 접근 패턴을 만듭니다. GPU는 연속된 메모리를 읽을 때 가장 빠른데, 개별 토큰을 듬성듬성 골라 읽으면 메모리 대역폭을 효율적으로 쓸 수 없습니다. HBM에서 SRAM으로 데이터를 옮기는 단위가 블록이기 때문에 토큰 하나를 읽어도 주변 토큰까지 함께 전송되죠.

2025년 초, 거의 동시에 여러 팀이 이 두 문제를 동시에 해결하는 같은 해법에 도달했습니다. 토큰을 하나씩 점수 매기는 대신, 시퀀스를 고정 크기 블록으로 묶고 블록 단위로 선택하는 것입니다. 인덱서가 비교하는 항목 수가 $n$에서 $n/r$로 줄어들 뿐 아니라 선택된 블록은 메모리에서 연속적이어서 GPU가 효율적으로 읽을 수 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="블록 단위 선택 과정. KV 시퀀스를 블록으로 나누고, 블록마다 key를 평균해 대표 벡터를 만들고, 쿼리와 대표 벡터의 유사도로 상위 k개 블록을 선택한 뒤 선택된 블록 안에서만 정밀 어텐션을 수행합니다.">
  <style>
    .sp2-h  { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
    .sp2-t  { fill: var(--text-muted, #6d6762); font-size: 14px; }
    .sp2-ts { fill: var(--text-muted, #6d6762); font-size: 13px; text-anchor: middle; }
    .sp2-blk { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
    .sp2-sel { fill: var(--primary, #0a756c); }
    .sp2-on  { fill: var(--on-fill, #ffffff); font-size: 13px; text-anchor: middle; }
    .sp2-skip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; stroke-dasharray: 3 2; }
    .sp2-rep { fill: var(--accent, #9d5604); }
    .sp2-ar  { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#sp2Ar); }
    .sp2-q   { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .sp2-qt  { fill: var(--text-warn, #9d5604); font-size: 14px; text-anchor: middle; }
  </style>
  <defs>
    <marker id="sp2Ar" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <!-- Step 1: KV sequence as blocks -->
  <text x="10" y="20" class="sp2-h">① KV를 블록으로 나누기</text>
  <rect x="10" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <rect x="70" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <rect x="130" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <rect x="190" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <rect x="250" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <rect x="310" y="30" width="55" height="28" rx="4" class="sp2-blk"/>
  <text x="37" y="49" class="sp2-ts">B₁</text>
  <text x="97" y="49" class="sp2-ts">B₂</text>
  <text x="157" y="49" class="sp2-ts">B₃</text>
  <text x="217" y="49" class="sp2-ts">B₄</text>
  <text x="277" y="49" class="sp2-ts">B₅</text>
  <text x="337" y="49" class="sp2-ts">B₆</text>
  <!-- Step 2: Mean-pool to representative -->
  <text x="10" y="88" class="sp2-h">② 블록별 대표 key (mean-pool)</text>
  <path d="M37,58 V98" class="sp2-ar"/>
  <path d="M97,58 V98" class="sp2-ar"/>
  <path d="M157,58 V98" class="sp2-ar"/>
  <path d="M217,58 V98" class="sp2-ar"/>
  <path d="M277,58 V98" class="sp2-ar"/>
  <path d="M337,58 V98" class="sp2-ar"/>
  <circle cx="37" cy="108" r="8" class="sp2-rep"/>
  <circle cx="97" cy="108" r="8" class="sp2-rep"/>
  <circle cx="157" cy="108" r="8" class="sp2-rep"/>
  <circle cx="217" cy="108" r="8" class="sp2-rep"/>
  <circle cx="277" cy="108" r="8" class="sp2-rep"/>
  <circle cx="337" cy="108" r="8" class="sp2-rep"/>
  <text x="37" y="112" class="sp2-on">s₁</text>
  <text x="97" y="112" class="sp2-on">s₂</text>
  <text x="157" y="112" class="sp2-on">s₃</text>
  <text x="217" y="112" class="sp2-on">s₄</text>
  <text x="277" y="112" class="sp2-on">s₅</text>
  <text x="337" y="112" class="sp2-on">s₆</text>
  <!-- Step 3: Query scores blocks -->
  <text x="10" y="148" class="sp2-h">③ 쿼리와 대표 key의 내적 → top-k</text>
  <rect x="10" y="155" width="70" height="26" rx="4" class="sp2-q"/>
  <text x="45" y="172" class="sp2-qt">query</text>
  <path d="M85,168 L120,168" class="sp2-ar"/>
  <text x="155" y="172" class="sp2-t">점수: 0.3  0.1  0.8  0.2  0.9  0.4</text>
  <!-- Step 4: Selected blocks get full attention -->
  <text x="10" y="210" class="sp2-h">④ 선택된 블록만 정밀 어텐션</text>
  <rect x="10" y="220" width="55" height="28" rx="4" class="sp2-skip"/>
  <rect x="70" y="220" width="55" height="28" rx="4" class="sp2-skip"/>
  <rect x="130" y="220" width="55" height="28" rx="4" class="sp2-sel"/>
  <rect x="190" y="220" width="55" height="28" rx="4" class="sp2-skip"/>
  <rect x="250" y="220" width="55" height="28" rx="4" class="sp2-sel"/>
  <rect x="310" y="220" width="55" height="28" rx="4" class="sp2-skip"/>
  <text x="157" y="239" class="sp2-on">B₃ ✓</text>
  <text x="277" y="239" class="sp2-on">B₅ ✓</text>
  <text x="37" y="239" class="sp2-ts">건너뜀</text>
  <text x="97" y="239" class="sp2-ts">건너뜀</text>
  <text x="217" y="239" class="sp2-ts">건너뜀</text>
  <text x="337" y="239" class="sp2-ts">건너뜀</text>
  <!-- caption -->
  <text x="200" y="280" text-anchor="middle" class="sp2-t">인덱서: O(n/r) · 어텐션: 선택된 블록만</text>
  <text x="200" y="298" text-anchor="middle" class="sp2-ts">r = 블록 크기, k = 선택 블록 수</text>
</svg>
</div>

블록 $B_j$에 속한 $r$개 토큰의 key를 평균해 대표 벡터 $s_j$를 만들고, 쿼리와 대표 벡터의 내적으로 블록 점수를 매깁니다.

$$
s_j = \frac{1}{r}\sum_{i \in B_j} k_i, \qquad \text{selected} = \operatorname{top-}k\bigl(q^\top s_1,\; q^\top s_2,\; \dots,\; q^\top s_{n/r}\bigr)
$$

$B_j$는 $j$번째 블록($r$개 토큰), $s_j$는 블록의 대표 key입니다. 인덱서가 비교하는 항목이 $n$개에서 $n/r$개로 줄어들어 복잡도가 $O(n^2)$에서 $O(n^2/r)$로 떨어집니다. 블록 크기 $r$이 64이고 시퀀스가 128K라면 인덱서는 2,048개 대표값만 비교하면 되죠. 선택된 $k$개 블록($k \times r$개 토큰)에서만 정밀 어텐션을 수행하므로 어텐션 연산도 전체 시퀀스가 아니라 고정 예산 안에서 이루어집니다.

블록 크기를 어떻게 정하느냐에 따라 정밀도와 효율의 균형이 달라집니다. 블록이 크면 인덱서는 빨라지지만 블록 안에 관련 없는 토큰이 섞일 수 있고, 블록이 작으면 정밀도는 올라가지만 인덱서 비용이 커지죠.

2025년 초부터 이 패턴에 수렴한 주요 구현이 등장했습니다.

| 방식 | 출처 | 블록 크기 | 선택 예산 | 특징 |
|------|------|-----------|-----------|------|
| MoBA | Moonshot AI, 2025 | 가변 | top-k 블록 | mean-pool key로 블록 점수. Kimi Chat에 배포 |
| NSA | DeepSeek, 2025 | 32/64 | top-16 블록 | 압축 + 선택 + 슬라이딩 3개 브랜치 병렬 |
| QSA | Qwen, 2026 | 4 | 512 블록 (2,048 토큰) | 마이크로블록 평균 + RoPE 적용 후 ReLU 점수 |
| MSA | MiniMax, 2026 | 128 | top-16 블록 (2,048 토큰) | GQA 그룹별 독립 선택 |

블록 크기는 4에서 128까지 다양하지만 핵심 설계 결정은 동일합니다. 블록으로 묶어 대표값을 구하고, 쿼리와 대표값의 유사도로 상위 블록을 골라 그 안에서만 어텐션을 수행하는 것이죠.

MoBA(Mixture of Block Attention, Moonshot AI, 2025)는 이 패턴의 가장 깔끔한 형태입니다. KV 시퀀스를 블록으로 나누고, 각 블록의 key를 평균해 대표값으로 삼고, 쿼리와 대표값의 내적으로 상위 $k$개 블록을 선택합니다. 현재 블록(causal masking)은 항상 포함시키고 나머지에서 top-k를 고르는 구조이죠. 128K 컨텍스트에서 62.5% sparsity(상위 37.5%만 선택)로 RULER 벤치마크 0.7818을 달성했는데, 풀 어텐션의 0.7849와 거의 차이가 없었습니다. Moonshot AI는 이 방식을 Kimi Chat의 장문 컨텍스트 처리에 실제로 배포했습니다.

QSA(Qwen Sparse Attention, 2026)는 블록 크기를 극단까지 줄인 사례입니다. 4개 토큰으로 이루어진 마이크로블록을 만들고, 블록 내 key를 평균한 뒤 RoPE를 적용해 위치 정보를 보존하죠. 점수 함수는 softmax가 아니라 ReLU 게이트를 써서 음의 유사도를 0으로 밀어냅니다. 상위 512개 마이크로블록(2,048 토큰)을 골라 정밀 어텐션을 수행하는데, 블록이 작아 해상도가 높은 대신 인덱서가 비교할 항목이 상대적으로 많죠. 반대편에 있는 MSA(MiniMax Sparse Attention, 2026)는 128토큰 블록을 써서 인덱서 비용을 극도로 낮추되, GQA 그룹별로 독립적으로 블록을 선택해 표현력을 보존하는 전략을 택했습니다.

NSA(Native Sparse Attention, DeepSeek, ACL 2025 Best Paper 공동 수상)는 블록 선택을 세 가지 경로로 확장한 사례입니다. 단일 브랜치 대신 **압축**, **선택**, **슬라이딩 윈도우** 세 브랜치를 병렬로 두고 학습된 게이트로 합산합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="NSA의 3-branch 병렬 구조. 압축 브랜치(32토큰 블록을 MLP로 요약), 선택 브랜치(64토큰 블록 중 top-k 선택), 슬라이딩 윈도우 브랜치(최근 512토큰)가 병렬로 동작하고 게이트로 합산됩니다.">
  <style>
    .sp3-h   { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; text-anchor: middle; }
    .sp3-t   { fill: var(--text-muted, #6d6762); font-size: 13px; text-anchor: middle; }
    .sp3-box { rx: 6; stroke-width: 1.5; }
    .sp3-comp { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); }
    .sp3-sel  { fill: var(--primary, #0a756c); }
    .sp3-sw   { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
    .sp3-gate { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .sp3-ct   { fill: var(--text-warn, #9d5604); font-size: 14px; text-anchor: middle; }
    .sp3-st   { fill: var(--on-fill, #ffffff); font-size: 14px; text-anchor: middle; }
    .sp3-swt  { fill: var(--text, #1c1917); font-size: 14px; text-anchor: middle; }
    .sp3-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#sp3Ar); }
    .sp3-lab  { fill: var(--text-muted, #6d6762); font-size: 12px; text-anchor: middle; }
  </style>
  <defs>
    <marker id="sp3Ar" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <!-- Input: KV sequence -->
  <rect x="100" y="10" width="200" height="32" rx="6" class="sp3-gate"/>
  <text x="200" y="31" class="sp3-h">KV 시퀀스</text>
  <!-- Three branches -->
  <path d="M150,42 V70" class="sp3-ar"/>
  <path d="M200,42 V136" class="sp3-ar"/>
  <path d="M250,42 V70" class="sp3-ar"/>
  <!-- Compression branch -->
  <rect x="40" y="74" width="150" height="50" class="sp3-box sp3-comp"/>
  <text x="115" y="95" class="sp3-ct">압축 브랜치</text>
  <text x="115" y="115" class="sp3-lab">32토큰 → MLP → 요약 key</text>
  <!-- Sliding window branch -->
  <rect x="210" y="74" width="150" height="50" class="sp3-box sp3-sw"/>
  <text x="285" y="95" class="sp3-swt">슬라이딩 윈도우</text>
  <text x="285" y="115" class="sp3-lab">최근 512토큰</text>
  <!-- Selection branch -->
  <rect x="120" y="140" width="160" height="50" class="sp3-box sp3-sel"/>
  <text x="200" y="161" class="sp3-st">선택 브랜치</text>
  <text x="200" y="179" style="fill: var(--on-fill, #ffffff); font-size: 12px; text-anchor: middle;">64토큰 블록 → top-16 선택</text>
  <!-- Arrows to gate -->
  <path d="M115,124 L180,218" class="sp3-ar"/>
  <path d="M200,190 L200,218" class="sp3-ar"/>
  <path d="M285,124 L220,218" class="sp3-ar"/>
  <!-- Gate -->
  <rect x="140" y="222" width="120" height="32" rx="6" class="sp3-gate"/>
  <text x="200" y="243" class="sp3-h">게이트 합산</text>
  <!-- Output -->
  <path d="M200,254 V272" class="sp3-ar"/>
  <text x="200" y="278" class="sp3-t">어텐션 출력</text>
</svg>
</div>

압축 브랜치는 32개 토큰 블록을 학습된 MLP로 하나의 요약 key-value로 압축합니다. 먼 과거의 전체적인 맥락을 저해상도로 보는 역할이죠. 선택 브랜치는 64개 토큰 블록 중 상위 16개를 골라 그 안의 토큰에 정밀 어텐션을 수행합니다. 쿼리와 관련성이 높은 특정 구간을 고해상도로 읽는 역할입니다.

슬라이딩 윈도우 브랜치는 최근 512개 토큰을 그대로 봅니다. 직전 맥락은 항상 중요하므로 선택 없이 전부 읽는 것이죠.

세 브랜치를 각각 학습된 게이트 벡터로 가중합산하면 하나의 어텐션 출력이 됩니다. 먼 과거(압축), 관련 구간(선택), 직전 맥락(윈도우)을 동시에 커버하는 구조입니다. NSA 논문은 27B 모델에서 64K 컨텍스트 기준 FlashAttention-2 대비 디코딩 11.6배, 순전파 9.0배, 역전파 6.0배 속도 향상을 보고했습니다.

## 줄어드는 것과 남는 것

블록 선택으로 어텐션 연산량(FLOPs)과 메모리 대역폭 사용이 크게 줄어듭니다. MSA(MiniMax Sparse Attention)는 128토큰 블록에서 top-16을 선택해 2,048개 토큰만 어텐션합니다. 1M 컨텍스트에서 풀 어텐션 대비 FLOPs가 28.4분의 1로 줄어든 것이죠. QSA(Qwen Sparse Attention)는 1M 컨텍스트에서 어텐션 모듈 기준 프리필 7.6배, 디코딩 4.9배 속도 향상을 보고했습니다.

하지만 KV 캐시 자체는 메모리에 전부 남아 있습니다. 어떤 블록이 선택될지는 쿼리마다 달라지기 때문에 모든 위치의 KV를 상주시켜야 하죠. 쿼리 A는 문서 서두의 시스템 프롬프트를 참조하고 쿼리 B는 중간의 코드 블록을 참조할 수 있으니 어떤 KV도 미리 버릴 수 없습니다.

MoBA 논문도 이 점을 명시합니다. "KV 캐시가 시퀀스 길이에 따라 선형으로 증가해 일정한 메모리 소비를 보장할 수 없다." MoE에서 모든 전문가의 가중치를 GPU 메모리에 올려놓되 토큰마다 일부만 활성화하는 것과 같은 구조이죠.

구체적으로 1M 컨텍스트, 60 레이어, GQA-8, $d_h = 128$, fp16 기준을 생각해 보죠. 풀 어텐션은 레이어당 $2 \times 8 \times 128 = 2{,}048$차원을 100만 토큰만큼 저장하므로 약 230GB의 KV 캐시가 필요합니다. MSA가 FLOPs를 28.4분의 1로 줄여도 이 230GB는 그대로 GPU 메모리에 있어야 합니다. 줄어드는 것은 연산량과 대역폭 사용이지 캐시의 크기가 아닙니다.

이 점에서 블록 선택과 GQA/MLA는 서로 다른 축을 다룹니다. GQA/MLA는 각 위치에 저장하는 바이트를 줄여 KV 캐시의 총 메모리를 줄이고, 블록 선택은 저장된 KV 중 실제로 읽는 위치 수를 줄여 연산과 대역폭을 아끼죠. 두 축은 직교하기 때문에 조합할 수 있고, 실제로 NSA는 MLA 위에서 동작합니다. 토큰당 저장 크기는 MLA로, 읽는 위치 수는 블록 선택으로 각각 줄이는 것이죠.

SWA는 이 그림에서 독특한 위치를 차지합니다. 윈도우 밖의 KV를 아예 버리므로 저장과 읽기를 동시에 줄이지만 고정 패턴이라는 제약이 있습니다. 블록 선택은 KV를 전부 유지하는 대신 어떤 위치가 중요한지를 배울 수 있는 셈이죠. 각 접근이 포기하는 것이 다르고 그래서 실제 모델에서는 이들을 함께 씁니다. NSA가 슬라이딩 윈도우 브랜치를 포함하고 있는 것이 좋은 예입니다.

## 마치며

슬라이딩 윈도우는 고정 규칙으로 저장과 읽기를 동시에 줄이고, 블록 단위 선택은 읽기만 줄이되 쿼리마다 중요한 위치를 배웁니다. 블록 크기와 선택 방식은 모델마다 다르지만 "블록으로 묶어 대표값을 비교하고 상위만 골라 정밀 어텐션"이라는 패턴은 2026년 현재 프론티어 모델의 공통 설계입니다.

DeepSeek-V4(2026)는 여기서 한 걸음 더 나아갔습니다. CSA(Compressed Sparse Attention)는 4개 토큰을 1개의 KV 엔트리로 압축하면서 그 위에 FP4 인덱서를 올려 상위 1,024개 압축 엔트리만 선택합니다. 저장 축(압축)과 읽기 축(선택)을 동시에 줄이는 접근으로, MLA를 만든 팀이 MLA를 대체하며 도달한 설계입니다.

블록 선택에도 대가는 있습니다. 블록 경계에서 의미 단위가 잘릴 수 있고, 인덱서 자체의 학습이 필요해 CPT(Continued Pre-Training) 단계를 거쳐야 하는 경우가 많습니다. 풀 어텐션으로 학습한 모델에서 블록 선택 모델로 지식을 증류하는 과정에서 품질 손실도 발생할 수 있죠.

이 글에서 다룬 방식들은 모두 softmax 어텐션을 전제로 읽는 위치를 줄이는 접근이었습니다. 다음 글에서는 softmax 자체를 빼는 방법을 다룹니다. 선형 어텐션은 $QK^\top$의 구조를 바꿔 이론적으로 $O(n)$을 달성하지만, softmax가 제공하던 것 중 무엇을 잃는지 따져봐야 합니다.

## 함께 보면 좋은 글

- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [FlashAttention은 왜 더 많이 계산하면서 더 빠를까](/llm/flash-attention/)
- [KV Cache를 10분의 1로 줄인 MLA의 트릭](/llm/attention-variants/)
- [Gemma 4 아키텍처 총정리](/llm/gemma4-architecture/)

## 참고자료

- [Generating Long Sequences with Sparse Transformers (Child et al., 2019)](https://arxiv.org/abs/1904.10509)
- [MoBA: Mixture of Block Attention for Long-Context LLM Inference (Lu et al., 2025)](https://arxiv.org/abs/2502.13189)
- [Native Sparse Attention: Hardware-Aligned and Natively Trainable Sparse Attention (Yuan et al., ACL 2025)](https://arxiv.org/abs/2502.11089)
- [DeepSeek-V4 Technical Report (DeepSeek-AI, 2026)](https://arxiv.org/abs/2606.19348)
