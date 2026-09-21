---
date: '2026-09-28'
title: '선형 어텐션, 곱의 순서를 바꾸면 생기는 일'
category: 'LLM'
series: 'llm'
seriesOrder: 11
tags: ['LLM', 'Linear Attention', 'Gated DeltaNet', 'Hybrid Attention', 'Recurrent', 'KV Cache']
summary: 'softmax를 빼고 행렬 곱의 순서를 바꾸면 O(n)이 됩니다. 하지만 고정 크기 상태에 문맥을 압축하는 대가가 뒤따르고, 그 대가를 감수할지는 아직 갈리고 있습니다.'
thumbnail: './thumbnail.png'
---

블록 선택은 softmax 어텐션 안에서 읽는 위치를 줄였습니다. 하지만 softmax 자체는 남아 있습니다. 쿼리와 모든 key의 내적을 계산해 확률 분포를 만드는 $O(n^2)$ 연산이 여전히 구조의 중심이죠. 블록 인덱서가 비교 대상을 줄여도 선택된 블록 안에서는 결국 softmax가 돌아갑니다.

softmax를 아예 빼면 어떨까요? 2020년, 내적의 결과를 개별적으로 쓰지 않고 모아서 재사용하면 계산 순서를 바꿀 수 있다는 관찰이 나왔습니다. $n \times n$ 크기의 어텐션 행렬을 만들 필요가 사라지고, 복잡도가 $O(n)$이 됩니다.

2025년, 이 아이디어가 프론티어 모델에 들어갔습니다. 다만 순수한 형태로는 아무도 쓰지 않았고, softmax 레이어를 일부 섞는 하이브리드가 표준이 됐죠. 그리고 그 하이브리드조차 유지한 쪽과 철회한 쪽으로 갈렸습니다.

## 곱의 순서를 바꾸면

softmax 어텐션은 $\text{softmax}(QK^\top)$으로 $n \times n$ 행렬을 만듭니다. 시퀀스가 128K이면 이 행렬의 원소가 160억 개죠. FlashAttention이 이 행렬을 메모리에 올리지 않고 타일 단위로 계산하는 방법을 찾았지만, 연산 횟수 자체는 $O(n^2)$으로 그대로입니다.

선형 어텐션의 핵심은 softmax 대신 특징 맵(feature map) $\phi$를 쓰는 것입니다. $\text{softmax}(q^\top k)$를 $\phi(q)^\top \phi(k)$로 바꾸면 행렬 곱의 **결합법칙**을 활용할 수 있게 되죠. 표준 어텐션이 $(\phi(Q)\phi(K)^\top)V$를 계산해 $n \times n$ 중간 행렬을 거치는 반면, $\phi(Q)(\phi(K)^\top V)$로 순서를 바꿉니다. $\phi(K)^\top V$는 $d \times d$ 행렬이므로 $n$에 의존하지 않고, 전체 복잡도가 $O(nd^2)$으로 떨어집니다. head 차원 $d$는 보통 128이므로 시퀀스 길이 $n$이 수만을 넘어가면 사실상 $O(n)$입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="softmax 어텐션과 선형 어텐션의 계산 순서 비교">
  <style>
    .la1-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .la1-t { font-size: 14px; fill: var(--text, #1c1917); }
    .la1-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .la1-box { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
    .la1-hl { fill: none; stroke: var(--primary, #0a756c); stroke-width: 1.5; stroke-dasharray: 5,3; }
    .la1-ar { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#la1-arrow); }
  </style>
  <defs>
    <marker id="la1-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <!-- Top: softmax -->
  <text x="200" y="20" text-anchor="middle" class="la1-h">softmax 어텐션</text>
  <rect x="30" y="35" width="55" height="28" rx="4" class="la1-box"/>
  <text x="57" y="54" text-anchor="middle" class="la1-t">Q</text>
  <text x="100" y="54" text-anchor="middle" class="la1-sm">×</text>
  <rect x="115" y="35" width="55" height="28" rx="4" class="la1-box"/>
  <text x="142" y="54" text-anchor="middle" class="la1-t">K⊤</text>
  <path d="M175,49 L195,49" class="la1-ar"/>
  <rect x="200" y="32" width="55" height="34" rx="4" class="la1-hl"/>
  <text x="227" y="54" text-anchor="middle" class="la1-t">n × n</text>
  <text x="275" y="54" text-anchor="middle" class="la1-sm">×</text>
  <rect x="290" y="35" width="55" height="28" rx="4" class="la1-box"/>
  <text x="317" y="54" text-anchor="middle" class="la1-t">V</text>
  <path d="M350,49 L370,49" class="la1-ar"/>
  <text x="385" y="54" text-anchor="middle" class="la1-sm">출력</text>
  <text x="227" y="85" text-anchor="middle" class="la1-sm">O(n² d)</text>
  <!-- Divider -->
  <line x1="30" y1="105" x2="370" y2="105" stroke="var(--border, #e7e5e4)" stroke-width="1" stroke-dasharray="3,3"/>
  <!-- Bottom: linear -->
  <text x="200" y="130" text-anchor="middle" class="la1-h">선형 어텐션</text>
  <rect x="30" y="145" width="55" height="28" rx="4" class="la1-box"/>
  <text x="57" y="164" text-anchor="middle" class="la1-t">K⊤</text>
  <text x="100" y="164" text-anchor="middle" class="la1-sm">×</text>
  <rect x="115" y="145" width="55" height="28" rx="4" class="la1-box"/>
  <text x="142" y="164" text-anchor="middle" class="la1-t">V</text>
  <path d="M175,159 L195,159" class="la1-ar"/>
  <rect x="200" y="148" width="42" height="22" rx="4" fill="none" stroke="var(--primary, #0a756c)" stroke-width="1.8"/>
  <text x="221" y="164" text-anchor="middle" style="font-size:13px; fill: var(--primary, #0a756c); font-weight:600;">d×d</text>
  <text x="260" y="164" text-anchor="middle" class="la1-sm">×</text>
  <rect x="275" y="145" width="55" height="28" rx="4" class="la1-box"/>
  <text x="302" y="164" text-anchor="middle" class="la1-t">Q</text>
  <path d="M335,159 L355,159" class="la1-ar"/>
  <text x="375" y="164" text-anchor="middle" class="la1-sm">출력</text>
  <text x="221" y="195" text-anchor="middle" class="la1-sm">O(n d²)</text>
  <!-- Caption -->
  <text x="200" y="230" text-anchor="middle" class="la1-sm">위: n × n 중간 행렬 필요</text>
  <text x="200" y="250" text-anchor="middle" class="la1-sm">아래: d × d만으로 충분</text>
</svg>
</div>

이 순서 변경이 autoregressive generation에서 특히 극적입니다. 선형 어텐션은 고정 크기 상태를 가진 재귀 형태(recurrent form)로 바뀝니다.

$$
S_t = S_{t-1} + \phi(k_t)\,v_t^\top, \qquad o_t = \phi(q_t)^\top S_t
$$

$S_t$는 $d \times d$ 상태 행렬입니다. 매 토큰마다 key-value 외적 하나를 상태에 더하고, 쿼리로 상태를 읽습니다. 토큰 하나당 비용이 $O(d^2)$이고 시퀀스 길이에 무관합니다. softmax 어텐션의 decoding이 매 토큰마다 이전 $n$개의 KV를 전부 읽어야 하는 것과 대비됩니다. KV 캐시가 사라지고 고정 크기 상태만 남으니 메모리도 $O(d^2)$으로 고정입니다.

## 상태가 잊지 못하는 문제

이후 논의에서는 $\phi$를 생략하고 $k_t$, $q_t$로 표기합니다. 재귀형의 업데이트 $S_t = S_{t-1} + k_t v_t^\top$에는 **더하기만** 있습니다. 오래된 정보를 지울 방법이 없죠. $d \times d$ 공간에 직교할 수 있는 벡터는 최대 $d$개인데, 시퀀스가 $d$를 넘으면 새 정보가 기존 정보와 간섭하기 시작합니다. 시스템 프롬프트의 내용과 대화 후반부의 내용이 같은 상태 안에서 섞이면 검색 정밀도가 떨어집니다.

softmax 어텐션은 $\exp$의 비선형성 덕에 가장 관련 높은 위치에 가중치를 날카롭게 몰 수 있지만, 선형 어텐션은 이 집중 메커니즘이 없습니다. 특정 토큰 하나를 정확히 골라내는 능력이 softmax보다 약한 것이 순수 선형 어텐션의 근본 한계입니다.

이 문제를 해결하기 위해 상태 업데이트에 **잊기** 메커니즘을 추가하는 연구가 이어졌습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 310" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="선형 어텐션 상태 업데이트 방식의 진화 과정">
  <style>
    .la2-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .la2-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .la2-eq { font-size: 14px; fill: var(--primary, #0a756c); }
    .la2-ar { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#la2-arrow); }
  </style>
  <defs>
    <marker id="la2-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <!-- Row 1: 순수 -->
  <rect x="10" y="10" width="185" height="55" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
  <text x="102" y="30" text-anchor="middle" class="la2-h">순수 선형 어텐션</text>
  <text x="102" y="50" text-anchor="middle" class="la2-eq">S = S + k v⊤</text>
  <text x="215" y="35" class="la2-sm">더하기만</text>
  <text x="215" y="52" class="la2-sm">잊지 못함</text>
  <!-- Row 2: 게이팅 -->
  <path d="M102,65 L102,80" class="la2-ar"/>
  <rect x="10" y="82" width="185" height="55" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
  <text x="102" y="102" text-anchor="middle" class="la2-h">감쇠 게이팅</text>
  <text x="102" y="122" text-anchor="middle" class="la2-eq">S = α · S + k v⊤</text>
  <text x="215" y="107" class="la2-sm">전역 감쇠</text>
  <text x="215" y="124" class="la2-sm">선택적 삭제 불가</text>
  <!-- Row 3: 델타 -->
  <path d="M102,137 L102,152" class="la2-ar"/>
  <rect x="10" y="154" width="185" height="55" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)" stroke-width="1"/>
  <text x="102" y="174" text-anchor="middle" class="la2-h">델타 규칙</text>
  <text x="102" y="194" text-anchor="middle" class="la2-eq">지우고 쓰기</text>
  <text x="215" y="179" class="la2-sm">해당 key의 기존 값</text>
  <text x="215" y="196" class="la2-sm">삭제 후 새 값 쓰기</text>
  <!-- Row 4: GDN -->
  <path d="M102,209 L102,224" class="la2-ar"/>
  <rect x="10" y="226" width="185" height="55" rx="6" fill="none" stroke="var(--primary, #0a756c)" stroke-width="1.8"/>
  <text x="102" y="246" text-anchor="middle" class="la2-h">Gated DeltaNet</text>
  <text x="102" y="266" text-anchor="middle" class="la2-eq">α · (지우고 쓰기)</text>
  <text x="215" y="251" class="la2-sm">전역 감쇠 +</text>
  <text x="215" y="268" class="la2-sm">선택적 덮어쓰기</text>
</svg>
</div>

감쇠 게이팅(RetNet, 2023)은 스칼라 $\alpha$를 곱해 상태 전체를 균일하게 줄입니다. GLA(ICML 2024)는 이 $\alpha$를 입력에 따라 동적으로 결정해 어떤 채널은 오래 기억하고 어떤 채널은 빨리 잊도록 합니다. 델타 규칙(DeltaNet, NeurIPS 2024)은 다른 방향에서 접근해, 새 정보를 쓰기 전에 해당 key에 연결된 기존 값을 지우는 **선택적 덮어쓰기**를 도입했습니다.

Gated DeltaNet(GDN, ICLR 2025)은 이 두 가지를 합칩니다. 전역 감쇠로 상태 전체를 줄이면서 동시에 델타 규칙으로 특정 연관만 골라 갱신합니다. GDN은 needle retrieval 벤치마크에서 softmax 어텐션에 근접하는 정확도를 기록했고, Qwen3-Next와 Kimi K3가 채택한 선형 어텐션 변종이 됐습니다.

그런데 GDN으로도 softmax의 날카로운 검색을 완전히 대체하지는 못합니다. 그래서 모든 프로덕션 배포는 선형 레이어와 softmax 레이어를 섞는 **하이브리드**입니다. 레이어 3개를 선형으로 쌓고 1개를 softmax로 넣는 3:1 비율이 Qwen과 Kimi에서 수렴한 패턴이고, MiniMax-01처럼 7:1까지 올린 모델도 있습니다.

## 같은 증거, 반대 결론

하이브리드가 표준이 된 것까지는 합의가 됐습니다. 다만 이 하이브리드를 프로덕션에 실제로 쓸 수 있는지에 대해서는 결론이 갈렸습니다.

채택을 유지하는 쪽은 Qwen과 Kimi입니다. Qwen3-Next(2025)부터 Qwen3.5(2026)까지 3:1 GDN 하이브리드를 유지했고, Kimi K3(2026년 7월, 2.8T)는 KDA(Kimi Delta Attention, GDN의 확장)를 플래그십 모델에 넣은 첫 사례가 됐습니다. KV 캐시 75% 절감과 decoding 6배 이상의 처리량 향상이 동기입니다.

철회한 쪽은 MiniMax입니다. MiniMax-01(2025년 1월)과 M1(2025년 6월)은 Lightning Attention(causal 선형 어텐션의 IO 최적화 구현)을 7:1 하이브리드로 썼고, 네이티브 1M 컨텍스트를 지원했습니다. 하지만 M2(2025년 10월)에서 풀 어텐션으로 전환했습니다. MiniMax가 공개한 이유는 네 가지입니다.

첫째, 스케일에서 드러나는 다단계 추론 결함. 소규모에서는 벤치마크 점수가 풀 어텐션과 같았지만, 대규모에서 복잡한 다단계 추론에 격차가 생겼습니다. MiniMax는 벤치마크를 "leaky abstraction"이라 표현했습니다.

둘째, 수치 정밀도 민감성. 재귀 상태가 시퀀스 전체에 걸쳐 누적되므로 저정밀 포맷에서 양자화 오차가 복리로 쌓입니다. MiniMax는 "선형 어텐션이 풀 어텐션보다 수치 정밀도에 훨씬 더 민감하다"고 명시했습니다.

셋째, prefix caching과의 비호환. softmax의 KV 캐시는 공유 프롬프트를 저장해 재활용할 수 있지만, 재귀 상태는 이런 분해가 어렵습니다. 프로덕션에서 대화 캐시 적중률이 높은 만큼 이 제약이 치명적이었습니다.

넷째, speculative decoding과의 충돌. 드래프트 토큰을 검증하려면 재귀 상태를 순차적으로 재생해야 해서 투기적 실행의 이점이 상쇄됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 210" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="선형 어텐션 채택과 철회 타임라인">
  <style>
    .la3-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .la3-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .la3-axis { stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .la3-line-a { stroke: var(--primary, #0a756c); stroke-width: 2; fill: none; }
    .la3-line-d { stroke: var(--text-danger, #cb2121); stroke-width: 2; fill: none; stroke-dasharray: 6,3; }
  </style>
  <!-- Time axis -->
  <line x1="50" y1="105" x2="370" y2="105" class="la3-axis"/>
  <text x="70" y="122" text-anchor="middle" class="la3-sm">2025.1</text>
  <text x="145" y="122" text-anchor="middle" class="la3-sm">2025.6</text>
  <text x="220" y="122" text-anchor="middle" class="la3-sm">2025.10</text>
  <text x="295" y="122" text-anchor="middle" class="la3-sm">2026.6</text>
  <text x="355" y="122" text-anchor="middle" class="la3-sm">2026.7</text>
  <!-- tick marks -->
  <line x1="70" y1="102" x2="70" y2="108" class="la3-axis"/>
  <line x1="145" y1="102" x2="145" y2="108" class="la3-axis"/>
  <line x1="220" y1="102" x2="220" y2="108" class="la3-axis"/>
  <line x1="295" y1="102" x2="295" y2="108" class="la3-axis"/>
  <line x1="355" y1="102" x2="355" y2="108" class="la3-axis"/>
  <!-- Adoption line (above axis) -->
  <text x="25" y="30" text-anchor="middle" class="la3-h">채택</text>
  <path d="M220,60 L295,50 L355,40" class="la3-line-a"/>
  <circle cx="220" cy="60" r="5" fill="var(--primary, #0a756c)"/>
  <circle cx="295" cy="50" r="5" fill="var(--primary, #0a756c)"/>
  <circle cx="355" cy="40" r="5" fill="var(--primary, #0a756c)"/>
  <text x="220" y="52" text-anchor="middle" class="la3-sm">Qwen3-Next</text>
  <text x="295" y="42" text-anchor="middle" class="la3-sm">Qwen3.5</text>
  <text x="355" y="32" text-anchor="middle" class="la3-sm">Kimi K3</text>
  <!-- MiniMax line (below axis) -->
  <text x="25" y="175" text-anchor="middle" class="la3-h">철회</text>
  <path d="M70,140 L145,140" class="la3-line-a"/>
  <path d="M145,140 L220,155" class="la3-line-d"/>
  <path d="M220,155 L295,170" class="la3-line-d"/>
  <circle cx="70" cy="140" r="5" fill="var(--primary, #0a756c)"/>
  <circle cx="145" cy="140" r="5" fill="var(--primary, #0a756c)"/>
  <circle cx="220" cy="155" r="5" fill="var(--text-danger, #cb2121)"/>
  <circle cx="295" cy="170" r="5" fill="var(--text-danger, #cb2121)"/>
  <text x="70" y="135" text-anchor="middle" class="la3-sm">MiniMax-01</text>
  <text x="145" y="135" text-anchor="middle" class="la3-sm">M1</text>
  <text x="220" y="175" text-anchor="middle" class="la3-sm">M2 풀 어텐션</text>
  <text x="295" y="190" text-anchor="middle" class="la3-sm">M3 희소 softmax</text>
</svg>
</div>

MiniMax는 M3(2026년 6월)에서 선형 어텐션 대신 블록 희소 softmax(MSA)를 택했습니다. softmax의 날카로운 검색을 유지하면서 블록 단위 선택으로 연산을 줄이는, 10편에서 다룬 접근이죠. 네 가지 중 첫째는 아키텍처 자체의 표현력 한계이고, 나머지 셋은 **프로덕션 인프라와의 호환성** 문제입니다. 한편 Kimi K3가 2.8T 플래그십에 KDA를 넣으며 대규모에서도 선형 어텐션이 작동함을 입증했고, 이 논쟁은 진행 중입니다.

## 마치며

곱의 순서를 바꿔 $O(n)$을 달성한 것이 선형 어텐션의 핵심이고, 고정 크기 상태에 문맥을 압축하는 대가로 검색 정밀도를 잃은 것이 한계입니다. 게이팅과 델타 규칙이 이 간극을 좁혔고, 하이브리드가 현재의 답이죠. 다만 최적 비율도, 하이브리드 자체가 정답인지조차도 아직 합의되지 않았습니다.

다음 글에서는 이 모든 어텐션 설계가 시퀀스 길이를 더 늘릴 때 어떻게 달라지는지를 다룹니다. 1M 컨텍스트를 실제로 떠받치는 것은 무엇이고, 광고와 실효 사이의 격차는 어디인지 따라갑니다.

## 함께 보면 좋은 글

- [Sparse Attention, 블록으로 묶으면 달라지는 것](/llm/sparse-attention/)
- [KV Cache를 10분의 1로 줄인 MLA의 트릭](/llm/attention-variants/)
- [FlashAttention은 왜 더 많이 계산하면서 더 빠를까](/llm/flash-attention/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)

## 참고자료

- [Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention (Katharopoulos et al., ICML 2020)](https://arxiv.org/abs/2006.16236)
- [Gated Delta Networks: Improving Mamba2 with Delta Rule (Yang, Kautz, Hatamizadeh, ICLR 2025)](https://arxiv.org/abs/2412.06464)
- [Kimi Linear: An Expressive, Efficient Attention Architecture (Moonshot AI, 2025)](https://arxiv.org/abs/2510.26692)
- [MiniMax-01: Scaling Foundation Models with Lightning Attention (MiniMax, 2025)](https://arxiv.org/abs/2501.08313)
