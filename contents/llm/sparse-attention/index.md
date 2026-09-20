---
date: '2026-09-20'
title: 'Sparse Attention, 블록으로 묶으면 달라지는 것'
category: 'LLM'
series: 'llm'
seriesOrder: 10
tags: ['LLM', 'Sparse Attention', 'MoBA', 'NSA', 'Sliding Window', 'KV Cache']
summary: '토큰 하나씩 점수를 매기면 인덱서 자체가 O(n²)입니다. 블록으로 묶어 대표값만 비교하면 이 딜레마가 어떻게 풀리는지 따라갑니다.'
thumbnail: './thumbnail.png'
---

MLA는 토큰당 캐시를 10분의 1로 줄였습니다. 그런데 줄어든 것은 각 위치에 저장하는 바이트이지, 읽어야 할 위치의 수는 그대로입니다. 128K 컨텍스트에서 토큰 하나를 생성할 때 어텐션은 레이어마다 131,072개 위치를 전부 훑어야 합니다. 시퀀스가 두 배 길어지면 읽는 양도 두 배가 되죠.

안 읽어도 될 위치를 건너뛰면 되지 않을까요? 실제로 어텐션 가중치는 소수의 위치에 몰리고, 나머지는 softmax를 거치면 거의 0입니다. 문제는 어떤 위치가 중요한지가 쿼리마다 다르다는 것이죠. 중요한 위치를 찾으려면 결국 전부를 한 번은 봐야 합니다.

2025년, 이 딜레마를 우회하는 방법이 나왔습니다. 토큰을 하나씩 보는 대신 여러 개를 묶어 **블록 단위로** 점수를 매기는 것입니다. 인덱서가 비교하는 항목 수가 $n$개에서 $n/r$개로 줄어들어 전체 시퀀스를 다 읽지 않고도 중요한 구간을 골라낼 수 있게 됩니다.

## 전부 읽는 비용

어텐션의 핵심 연산은 쿼리 $q$와 모든 위치의 key $k_1, k_2, \dots, k_n$의 내적입니다. 쿼리 하나당 $n$번의 내적이 필요하고, $n$개의 쿼리가 각각 이 연산을 수행하면 총 $O(n^2)$입니다. FlashAttention 같은 최적화는 이 연산을 GPU 메모리 계층에 맞춰 빠르게 수행하지만, 연산 횟수 자체는 줄이지 않습니다.

가장 단순한 해법은 슬라이딩 윈도우(SWA)입니다. 각 쿼리가 최근 $w$개 토큰만 보고 나머지는 무시하면 연산이 $O(n \cdot w)$로 줄어들죠. 하지만 윈도우는 고정 규칙이어서 쿼리마다 중요한 위치가 달라도 언제나 같은 범위만 봅니다. 시스템 프롬프트가 수천 토큰 전에 있으면 SWA 레이어에서는 그 정보가 사라집니다.

그래서 고정 규칙이 아니라 쿼리마다 중요한 위치를 **동적으로** 골라 보는 방법이 필요해졌습니다. 가장 직관적인 시도는 경량 인덱서(indexer)로 모든 토큰에 중요도 점수를 매겨 상위 $k$개만 선택하는 것입니다. DeepSeek의 DSA(DeepSeek Sparse Attention, 2025)가 이 방식을 썼죠. 그런데 인덱서가 아무리 가볍더라도 쿼리 하나가 $n$개 토큰 전부에 점수를 매겨야 하고, 이것을 $n$개 쿼리가 반복하면 인덱서만으로 $O(n^2)$입니다. 읽는 위치를 고르기 위해 결국 모든 위치를 봐야 하는, 원래 문제가 다시 나타납니다.

## 블록으로 묶으면 달라지는 것

해법의 핵심은 "토큰이 아니라 블록을 비교한다"는 발상입니다.

시퀀스를 $r$개 토큰씩 묶어 블록을 만들고, 블록 안의 key를 평균해서 대표 벡터 하나를 뽑습니다. 인덱서는 이 대표 벡터와 쿼리의 내적만 계산하면 되므로 비교 대상이 $n$개에서 $n/r$개로 줄어듭니다. 상위 $k$개 블록을 고른 뒤, 선택된 블록 안의 토큰에 대해서만 정밀 어텐션을 수행합니다.

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
  <!-- Step 1 -->
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
  <!-- Step 2 -->
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
  <!-- Step 3 -->
  <text x="10" y="148" class="sp2-h">③ 쿼리 · 대표 key → top-k</text>
  <rect x="10" y="155" width="70" height="26" rx="4" class="sp2-q"/>
  <text x="45" y="172" class="sp2-qt">query</text>
  <path d="M85,168 L120,168" class="sp2-ar"/>
  <text x="155" y="172" class="sp2-t">점수: 0.3  0.1  0.8  0.2  0.9  0.4</text>
  <!-- Step 4 -->
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

$$
s_j = \frac{1}{r}\sum_{i \in B_j} k_i, \qquad \text{selected} = \operatorname{top-}k\bigl(q^\top s_1,\; q^\top s_2,\; \dots,\; q^\top s_{n/r}\bigr)
$$

$B_j$는 $j$번째 블록($r$개 토큰), $s_j$는 블록의 대표 key입니다. 블록 크기 $r = 64$이고 시퀀스가 128K라면 인덱서가 비교하는 대표값은 2,048개뿐이죠. 그 중 상위 16개 블록을 고르면 실제 어텐션하는 토큰은 1,024개이고, 나머지 127,000개는 건너뜁니다.

이 방식이 정말 작동할까요? MoBA(Mixture of Block Attention, 2025)의 실험이 답을 줍니다. 128K 컨텍스트에서 상위 37.5%의 블록만 선택해도 RULER 벤치마크에서 풀 어텐션과 거의 같은 점수(0.7818 vs 0.7849)를 기록했습니다. 어텐션 가중치가 소수 위치에 집중된다는 관찰이 블록 수준에서도 성립한다는 뜻이죠. 중요한 토큰은 시퀀스에 고르게 퍼져 있지 않고 특정 구간에 몰려 있기 때문에 블록 단위로 골라도 거의 놓치지 않는 것입니다.

블록 크기는 정밀도와 효율의 트레이드오프입니다. 블록이 크면 인덱서는 빠르지만 관련 없는 토큰이 섞이고, 블록이 작으면 정밀하지만 인덱서 비용이 커지죠. 실제 구현에서는 4토큰(QSA)부터 128토큰(MSA)까지 다양하지만, "블록 대표값으로 점수를 매기고 상위만 골라 정밀 어텐션"이라는 골격은 동일합니다. NSA(Native Sparse Attention, DeepSeek, 2025)는 여기에 압축 브랜치와 슬라이딩 윈도우를 병렬로 추가해 먼 과거의 전체 맥락과 직전 맥락을 동시에 커버하는 구조로 확장했습니다.

## 무엇이 줄고 무엇이 남는가

블록 선택으로 줄어드는 것은 어텐션 연산량(FLOPs)과 메모리 대역폭 사용입니다. 1M 컨텍스트에서 2,048개 토큰만 선택하면 어텐션 FLOPs가 풀 어텐션의 약 500분의 1로 줄어들죠. MSA는 28.4배, QSA는 어텐션 모듈 기준 prefill 7.6배, decoding 4.9배 속도 향상을 보고했습니다.

남는 것은 KV 캐시의 메모리 용량입니다. 어떤 블록이 선택될지는 쿼리마다 다르기 때문에 모든 위치의 KV를 GPU 메모리에 상주시켜야 합니다. MoE에서 모든 전문가를 메모리에 올려놓되 토큰마다 일부만 활성화하는 것과 같은 구조이죠.

9편에서 다뤘던 GQA/MLA는 각 위치에 저장하는 바이트를 줄여 캐시의 총 크기를 줄였습니다. 블록 선택은 캐시에서 실제로 읽는 위치의 수를 줄입니다. 두 축은 직교하므로 함께 쓸 수 있고, 실제로 NSA는 MLA 위에서 동작하며 저장 크기와 읽기 횟수를 동시에 줄입니다.

블록 경계에서 의미 단위가 잘리는 문제도 있습니다. 중요한 문장이 두 블록에 걸쳐 있으면 한쪽만 선택될 수 있죠. 그리고 블록 선택은 처음부터 학습되어야 하거나, 풀 어텐션 모델에서 지식을 증류하는 CPT(Continued Pre-Training) 단계가 필요합니다.

## 마치며

슬라이딩 윈도우는 고정 규칙으로 읽는 범위를 줄였지만 어떤 위치가 중요한지 배울 수 없었습니다. 토큰 단위 선택은 유연하지만 인덱서가 $O(n^2)$이었죠. 블록 단위 선택은 이 둘 사이의 교차점을 찾았습니다. 인덱서 비용을 $n/r$로 줄이면서도 품질을 거의 유지하는 것이 블록이라는 단위가 만든 가능성입니다.

DeepSeek-V4(2026)는 여기서 한 걸음 더 나아갔습니다. CSA(Compressed Sparse Attention)는 4개 토큰을 1개의 KV로 압축한 뒤 그 위에 인덱서를 올려, 캐시의 저장 크기와 읽기 횟수를 동시에 줄입니다. MLA를 만든 팀이 2년 만에 MLA를 대체하며 도달한 설계입니다.

다음 글에서는 softmax 자체를 빼는 방법을 다룹니다. 이 글의 접근들이 softmax 어텐션 안에서 읽는 위치를 줄인 것이라면, 선형 어텐션은 $QK^\top$의 구조를 바꿔 $O(n)$을 목표로 합니다.

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
