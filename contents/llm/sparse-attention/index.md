---
date: '2026-09-16'
title: '어텐션이 모든 위치를 봐야 하는가'
category: 'LLM'
series: 'llm'
seriesOrder: 10
tags: ['LLM', 'Sparse Attention', 'MoBA', 'NSA', 'Sliding Window', 'KV Cache']
summary: '슬라이딩 윈도우부터 블록 단위 선택까지, 희소 어텐션이 줄이는 것과 남기는 것을 짚습니다.'
thumbnail: './thumbnail.png'
---

MLA는 토큰당 캐시를 10분의 1로 줄였습니다. 그런데 줄어든 것은 각 위치에 저장하는 바이트이지, 읽어야 할 위치의 **수**는 그대로입니다. 128K 컨텍스트에서 한 토큰을 생성할 때 어텐션은 여전히 레이어마다 131,072개 위치를 전부 읽습니다.

읽는 위치 자체를 줄이면 되지 않을까요? 실제로 어텐션 가중치는 소수의 위치에 몰리고 나머지는 softmax를 거치면 거의 0입니다. 하지만 어떤 위치가 중요한지는 쿼리마다 다르고, 그걸 알려면 결국 모든 위치를 한 번은 봐야 하는 딜레마가 있습니다.

2025년, 이 딜레마를 우회하는 방법이 등장했습니다. 토큰을 하나씩 보는 대신 **블록으로 묶어서** 점수를 매기는 것입니다. 이것이 블록 단위 희소 어텐션(Block Sparse Attention)이고, 이 글에서는 고정 규칙인 슬라이딩 윈도우에서 학습된 블록 선택까지의 경로를 따라갑니다.

## 슬라이딩 윈도우, 가장 단순한 형태

슬라이딩 윈도우 어텐션(Sliding Window Attention, SWA)은 각 쿼리가 최근 $w$개 토큰만 보고 나머지는 무시하는 방식입니다. 윈도우 밖 KV는 캐시에서 아예 버리므로 저장과 읽기를 동시에 줄이죠. Mistral 7B(2023)가 $w = 4{,}096$으로 도입했고, Gemma 3(2025)는 $w = 1{,}024$로 줄이면서 5개 레이어 중 1개만 전체 시퀀스를 보는 하이브리드 구조를 택했습니다.

단순하고 효과적이지만 한계가 분명합니다. 윈도우는 고정 규칙이라 쿼리마다 중요한 위치가 달라도 언제나 같은 범위만 봅니다. 시스템 프롬프트가 수천 토큰 전에 있으면 SWA 레이어에서는 그 정보가 사라지죠.

쿼리마다 중요한 위치를 골라서 볼 수 있다면 어떨까요?

## 블록 단위 선택

직관적인 접근은 토큰마다 중요도 점수를 매겨 상위 $k$개만 고르는 것입니다. 하지만 점수를 매기는 인덱서(indexer) 자체가 모든 토큰을 봐야 하므로 $O(n^2)$을 벗어나지 못합니다.

해법은 시퀀스를 고정 크기 블록으로 묶고, 블록 단위로 점수를 매기는 것입니다. 블록 안의 key를 평균(mean-pool)해서 대표 벡터 하나를 만들고, 쿼리와 대표 벡터의 내적으로 블록 점수를 매깁니다. 상위 $k$개 블록만 골라 그 안에서 정밀 어텐션을 수행합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
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
  <text x="10" y="88" class="sp2-h">② 블록 대표 key (평균)</text>
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
  <text x="10" y="148" class="sp2-h">③ 쿼리 · 대표 key → top-k</text>
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
  <text x="200" y="275" text-anchor="middle" class="sp2-ts">인덱서가 보는 항목: n개 → n/r개</text>
  <text x="200" y="293" text-anchor="middle" class="sp2-ts">r = 블록 크기, k = 선택 블록 수</text>
</svg>
</div>

수식으로 쓰면 이렇습니다. 블록 $B_j$에 속한 $r$개 토큰의 key를 평균해 대표 벡터 $s_j$를 만들고, 쿼리와 가장 유사한 상위 $k$개 블록을 고릅니다.

$$
s_j = \frac{1}{r}\sum_{i \in B_j} k_i, \qquad \text{selected} = \operatorname{top-}k\bigl(q^\top s_1,\; q^\top s_2,\; \dots,\; q^\top s_{n/r}\bigr)
$$

인덱서가 비교하는 항목이 $n$개에서 $n/r$개로 줄어듭니다. 블록 크기 $r$이 64이고 시퀀스가 128K라면 대표값 2,048개만 비교하면 되죠. 선택된 블록 안에서만 정밀 어텐션을 수행하므로 연산이 고정 예산 안에서 이루어집니다.

MoBA(Mixture of Block Attention, Moonshot AI, 2025)가 이 패턴의 대표적 구현입니다. 128K 컨텍스트에서 상위 37.5%의 블록만 선택(62.5% sparsity)해도 RULER 벤치마크에서 풀 어텐션과 거의 같은 점수(0.7818 vs 0.7849)를 달성했고, Kimi Chat의 장문 처리에 실제 배포되었습니다.

블록 크기를 어떻게 정하느냐에 따라 정밀도와 효율의 균형이 달라집니다. 블록이 크면 인덱서는 빠르지만 관련 없는 토큰이 섞이고, 블록이 작으면 정밀하지만 인덱서 비용이 커지죠. 2025~2026년에 등장한 주요 구현은 블록 크기 4에서 128까지 다양하지만 핵심 설계는 동일합니다.

| 방식 | 출처 | 블록 크기 | 선택 예산 | 특징 |
|------|------|-----------|-----------|------|
| MoBA | Moonshot AI, 2025 | 가변 | top-k 블록 | mean-pool key, Kimi Chat 배포 |
| NSA | DeepSeek, 2025 | 32/64 | top-16 블록 | 압축 + 선택 + 슬라이딩 3 브랜치 병렬 |
| QSA | Qwen, 2026 | 4 | 512 블록 (2,048 토큰) | 마이크로블록 + ReLU 점수 |
| MSA | MiniMax, 2026 | 128 | top-16 블록 (2,048 토큰) | GQA 그룹별 독립 선택 |

NSA(Native Sparse Attention, DeepSeek, ACL 2025 Best Paper 공동 수상)는 이 패턴을 가장 풍부하게 확장한 사례입니다. 블록 선택 하나로 모든 거리를 커버하는 대신, 세 가지 브랜치를 병렬로 두었습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 260" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="NSA의 3-branch 병렬 구조. 압축 브랜치(32토큰 블록을 MLP로 요약), 선택 브랜치(64토큰 블록 중 top-16 선택), 슬라이딩 윈도우 브랜치(최근 512토큰)가 병렬로 동작하고 게이트로 합산됩니다.">
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
  <!-- Input -->
  <rect x="100" y="10" width="200" height="30" rx="6" class="sp3-gate"/>
  <text x="200" y="30" class="sp3-h">KV 시퀀스</text>
  <!-- Three branches -->
  <path d="M150,40 V64" class="sp3-ar"/>
  <path d="M200,40 V130" class="sp3-ar"/>
  <path d="M250,40 V64" class="sp3-ar"/>
  <!-- Compression -->
  <rect x="40" y="68" width="150" height="46" class="sp3-box sp3-comp"/>
  <text x="115" y="88" class="sp3-ct">압축</text>
  <text x="115" y="106" class="sp3-lab">32토큰 → MLP → 요약</text>
  <!-- Sliding window -->
  <rect x="210" y="68" width="150" height="46" class="sp3-box sp3-sw"/>
  <text x="285" y="88" class="sp3-swt">슬라이딩 윈도우</text>
  <text x="285" y="106" class="sp3-lab">최근 512토큰</text>
  <!-- Selection -->
  <rect x="120" y="134" width="160" height="46" class="sp3-box sp3-sel"/>
  <text x="200" y="154" class="sp3-st">선택</text>
  <text x="200" y="170" style="fill: var(--on-fill, #ffffff); font-size: 12px; text-anchor: middle;">64토큰 블록 → top-16</text>
  <!-- Arrows to gate -->
  <path d="M115,114 L180,200" class="sp3-ar"/>
  <path d="M200,180 L200,200" class="sp3-ar"/>
  <path d="M285,114 L220,200" class="sp3-ar"/>
  <!-- Gate -->
  <rect x="140" y="204" width="120" height="30" rx="6" class="sp3-gate"/>
  <text x="200" y="224" class="sp3-h">게이트 합산</text>
  <!-- Output -->
  <path d="M200,234 V252" class="sp3-ar"/>
  <text x="200" y="258" class="sp3-t">어텐션 출력</text>
</svg>
</div>

압축 브랜치가 먼 과거의 전체 맥락을 저해상도로 보고, 선택 브랜치가 관련성 높은 구간을 고해상도로 읽고, 슬라이딩 윈도우가 직전 맥락을 빠짐없이 잡습니다. 27B 모델에서 64K 컨텍스트 기준 FlashAttention-2 대비 디코딩 11.6배 속도 향상이 보고되었습니다.

## 줄어드는 것과 남는 것

블록 선택으로 어텐션 연산량(FLOPs)이 크게 줄어듭니다. MSA는 1M 컨텍스트에서 풀 어텐션 대비 FLOPs가 28.4분의 1로, QSA는 어텐션 모듈 기준 프리필 7.6배, 디코딩 4.9배 속도 향상을 보고했습니다.

하지만 KV 캐시 자체는 메모리에 전부 남아 있습니다. 어떤 블록이 선택될지는 쿼리마다 다르기 때문에 모든 위치의 KV를 상주시켜야 하죠. MoE에서 모든 전문가를 GPU에 올려놓되 토큰마다 일부만 활성화하는 것과 같은 구조입니다.

GQA/MLA가 각 위치에 저장하는 바이트를 줄였다면, 블록 선택은 읽는 위치 수를 줄입니다. 두 축은 직교하므로 조합할 수 있고, 실제로 NSA는 MLA 위에서 동작합니다. SWA는 윈도우 밖 KV를 아예 버려 저장과 읽기를 동시에 줄이지만 고정 패턴이라는 제약이 있죠. 블록 선택은 메모리를 더 쓰는 대신 어떤 위치가 중요한지를 배울 수 있습니다.

## 마치며

슬라이딩 윈도우는 고정 규칙으로 저장과 읽기를 동시에 줄이고, 블록 선택은 읽기만 줄이되 쿼리마다 중요한 위치를 학습합니다. "블록으로 묶어 대표값을 비교하고 상위만 골라 정밀 어텐션"이라는 패턴은 2026년 프론티어 모델의 공통 설계가 되었습니다.

DeepSeek-V4(2026)는 여기서 한 걸음 더 나아갔습니다. CSA(Compressed Sparse Attention)는 4개 토큰을 1개의 KV로 압축하면서 그 위에 인덱서를 올려 저장과 읽기를 동시에 줄입니다. MLA를 만든 팀이 MLA를 대체하며 도달한 설계입니다.

다음 글에서는 softmax 자체를 빼는 방법을 다룹니다. 이 글의 방식들이 softmax 어텐션 안에서 읽는 위치를 줄인 것이라면, 선형 어텐션은 $QK^\top$의 구조를 바꿔 $O(n)$을 목표로 합니다.

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
