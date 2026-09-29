---
date: '2026-09-28'
title: '선형 어텐션, 곱의 순서를 바꾸면 생기는 일'
category: 'LLM'
series: 'llm'
seriesOrder: 11
tags: ['LLM', 'Linear Attention', 'Gated DeltaNet', 'Hybrid Attention', 'Recurrent', 'KV Cache']
summary: '선형 어텐션은 과거 전체를 고정 크기의 요약 하나로 들고 다닙니다. 이 요약이 O(n) 속도의 원천이면서, 하이브리드가 필요하고 일부 팀이 도입을 철회한 이유이기도 합니다.'
thumbnail: './thumbnail.png'
---

긴 문맥에서 어텐션 비용을 줄이려는 시도는 지금까지 크게 두 방향이었습니다. 위치마다 저장하는 KV를 작게 만드는 방법(GQA, MLA)과, 저장된 위치 중 일부만 골라 읽는 방법(희소 어텐션)이죠. 그런데 둘 다 softmax 어텐션의 기본 구조는 건드리지 않습니다. 지나온 토큰마다 key와 value를 KV 캐시에 쌓아 두고, 새 토큰이 올 때마다 그 캐시를 들여다보는 구조입니다. 그래서 캐시는 시퀀스 길이에 비례해 커지고, 128K 토큰이면 레이어마다 13만 개 위치가 메모리에 남아 있습니다.

과거를 전부 저장하지 않고 요약 하나로 들고 다니면 어떨까요? 긴 글을 읽을 때 문장을 다 외우지 않고 요지만 머릿속에서 고쳐 나가듯, 토큰이 올 때마다 고정 크기의 기억 하나를 갱신하는 방식입니다. 그러면 메모리는 길이와 상관없이 일정하고, 토큰 하나를 처리하는 비용도 일정해집니다.

2020년, softmax를 빼고 행렬 곱의 순서를 바꾸면 어텐션이 정확히 이런 구조가 된다는 사실이 알려졌습니다. 이것이 선형 어텐션입니다. 다만 요약은 원본보다 적게 담습니다. 선형 어텐션의 속도도, 한계도, 이를 두고 프론티어 팀들이 엇갈린 선택을 한 이유도 전부 이 요약에서 나옵니다.

## 곱의 순서를 바꾸면 기억이 요약이 된다

softmax 어텐션은 $QK^\top$로 모든 쿼리와 모든 key의 점수를 먼저 계산합니다. 시퀀스가 128K이면 점수 행렬의 원소가 약 170억 개죠. 이 행렬을 먼저 만들어야 하는 이유는 softmax에 있습니다. softmax는 한 쿼리의 점수를 전부 모아 $\exp$를 취하고 합으로 나누기 때문에, 한 행의 점수가 모두 나오기 전에는 $V$를 곱할 수 없습니다. FlashAttention이 이 행렬을 메모리에 올리지 않고 타일 단위로 계산하는 방법을 찾았지만, 연산량 자체는 여전히 $O(n^2)$입니다.

선형 어텐션은 softmax를 특징 맵(feature map) $\phi$로 바꿉니다. 쿼리와 key의 유사도를 $\phi(q)^\top \phi(k)$로 두면 행 전체를 모아 정규화하는 단계가 사라지고, 행렬 곱의 **결합법칙**을 쓸 수 있게 되죠. $(\phi(Q)\phi(K)^\top)V$를 $\phi(Q)(\phi(K)^\top V)$로 묶는 순서만 바꾸는 것입니다. 결과는 같지만 중간에 만들어지는 행렬이 달라집니다.

head 차원 $d = 128$, 시퀀스 $n = 131{,}072$로 계산해 보면 차이가 분명합니다. 앞의 순서는 $n \times n$, 약 170억 개짜리 행렬을 거칩니다. 뒤의 순서에서 먼저 계산하는 $\phi(K)^\top V$는 $d \times d$, 16,384개짜리 행렬이고 시퀀스 길이와 무관합니다. 정확히 2의 20제곱, 약 백만 배 차이죠. 전체 연산량은 $O(nd^2)$이고 $d$가 $n$보다 훨씬 작으니 사실상 $O(n)$입니다.

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

이 $d \times d$ 행렬이 앞에서 말한 요약입니다. $\phi(K)^\top V$는 토큰마다 key와 value의 외적을 하나씩 더한 합이라서, 토큰을 생성할 때는 합을 한 번에 구하지 않고 한 토큰씩 누적해 나가면 됩니다.

$$
S_t = S_{t-1} + \phi(k_t)\,v_t^\top, \qquad o_t = \phi(q_t)^\top S_t
$$

$S_t$는 $t$번째 토큰까지 본 내용을 담은 요약입니다. 새 토큰이 오면 그 토큰의 key와 value를 외적해 요약에 더하고(왼쪽 식), 출력이 필요하면 쿼리로 요약을 읽습니다(오른쪽 식). $d = 128$이면 요약은 16,384개의 숫자이고, 토큰이 13만 개가 쌓여도 이 크기는 변하지 않습니다. softmax 어텐션은 토큰 하나를 생성할 때마다 쌓인 KV $n$개를 전부 읽어야 하지만, 선형 어텐션은 요약 하나만 읽으면 되므로 128K 시점에서 연산량이 약 1,000배 적습니다.

요약에서 값을 꺼내는 원리는 작은 예로 확인할 수 있습니다. 이후로는 $\phi$를 생략하고, key를 2차원, value를 숫자 하나로 두겠습니다. key $(1, 0)$에 value 5를, key $(0, 1)$에 value 3을 저장하면 요약은 $S = (5, 3)$이 됩니다. 쿼리 $(1, 0)$으로 읽으면 $1 \times 5 + 0 \times 3 = 5$, 쿼리 $(0, 1)$로 읽으면 3이 나오죠. key끼리 서로 직교하면 요약에 섞어 넣은 값을 정확히 다시 꺼낼 수 있습니다.

## 요약에는 자리가 모자란다

같은 요약에 세 번째 기억을 넣어 보겠습니다. key $(0.6, 0.8)$에 value 10을 더하면 요약은 $(5, 3) + 10 \times (0.6, 0.8) = (11, 11)$이 됩니다. 이제 쿼리 $(1, 0)$으로 읽으면 5가 아니라 11이 나오고, 방금 넣은 key로 읽어도 10이 아니라 15.4가 나옵니다. 2차원 공간에는 서로 직교하는 방향이 두 개뿐이라서 세 번째 기억이 앞의 두 기억과 섞여 버린 것이죠.

실제 모델도 규모만 다를 뿐 같은 상황입니다. $d = 128$이면 서로 간섭하지 않는 방향은 128개인데, 요약에 들어가는 토큰은 수천에서 수십만 개입니다. 게다가 업데이트에는 더하기만 있어서 한 번 들어간 정보는 빠지지 않습니다. softmax는 $\exp$로 점수 차이를 키워 가장 관련 높은 위치 하나에 가중치를 몰아줄 수 있지만, 선형 어텐션의 요약에는 그런 집중 장치가 없어 특정 토큰 하나를 정확히 짚어 내는 능력이 떨어집니다.

그래서 이후 연구는 한정된 요약을 어떻게 관리할지에 집중했습니다.

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

감쇠 게이팅은 매 스텝 요약 전체에 1보다 작은 $\alpha$를 곱해 오래된 기억을 흐리게 만듭니다. 대화 주제가 바뀌었을 때 이전 내용을 빠르게 비우는 데는 효과적이지만, 어떤 기억은 지우고 어떤 기억은 남길지 고를 수는 없습니다.

델타 규칙은 쓰기 전에 먼저 읽습니다. 앞의 예에서 key $(0.6, 0.8)$로 요약 $(5, 3)$을 읽으면 $0.6 \times 5 + 0.8 \times 3 = 5.4$가 나옵니다. 저장하려는 값은 10이니 차이 4.6만 더하면 요약은 $(7.76, 6.68)$이 되고, 이 key로 다시 읽으면 정확히 10이 나오죠. 무작정 10을 더해 15.4가 나오던 것과 비교하면, 같은 key에 이미 들어 있던 몫을 빼고 새 값으로 덮어쓴 셈입니다.

Gated DeltaNet(GDN, ICLR 2025)은 이 둘을 합쳐 전역 감쇠와 선택적 덮어쓰기를 한 번에 합니다. needle retrieval에서 긴 문맥으로 갈수록 이전 변종들보다 정확도를 훨씬 잘 유지했고, Qwen3-Next를 비롯해 2025년부터 2026년 사이에 나온 하이브리드 모델 다수가 이 계열을 선형 레이어로 씁니다.

그런데 예의 숫자를 다시 보면 한계가 그대로 남아 있습니다. 델타 규칙 이후에도 쿼리 $(1, 0)$으로 읽은 값은 5가 아니라 7.76입니다. 요약을 관리하는 방법은 좋아졌지만 요약에 들어갈 수 있는 양 자체는 늘지 않았으니까요. 먼 과거의 특정 토큰을 정확히 꺼내야 하는 일은 결국 원본이 있어야 합니다.

**하이브리드**가 표준이 된 이유가 여기 있습니다. 대부분의 레이어는 요약으로 돌리고, 일부 레이어에만 softmax 어텐션과 KV 캐시를 남겨 원본 보관소로 쓰는 것이죠. 선형 레이어 3개마다 softmax 레이어 1개를 두는 3:1 배치가 가장 흔한데, 이러면 KV 캐시가 레이어 4개 중 1개에만 남으므로 캐시가 약 75% 줄어듭니다.

## 요약으로는 안 되는 일

하이브리드를 프로덕션에 가장 먼저 크게 올린 곳 중 하나가 MiniMax였습니다. 2025년 1월, 선형 레이어 7개에 softmax 레이어 1개를 섞어 1M 컨텍스트 모델을 내놓았죠. 그런데 같은 해 10월 M2에서는 모든 레이어를 풀 어텐션으로 되돌렸고, 그 이유를 공개했습니다. 공개된 이유들을 들여다보면 모두 원본 없이 요약만으로는 하기 어려운 일이라는 공통점이 있습니다.

가장 큰 이유는 품질이었습니다. 작은 규모에서는 하이브리드와 풀 어텐션의 벤치마크 점수가 거의 같았는데, 모델을 키우자 복잡한 다단계 추론에서 격차가 드러났습니다. 여러 사실을 차례로 찾아 이어 붙여야 하는 작업은 단계마다 요약에서 조금씩 틀린 값을 꺼내게 되고, 그 오차가 단계를 거치며 겹칩니다. 한 번 찾고 끝나는 문제가 대부분인 표준 벤치마크로는 이 격차가 잘 보이지 않았고, MiniMax는 벤치마크를 "leaky abstraction"이라고 불렀습니다.

나머지 이유는 서빙 인프라와 맞물리는 문제였습니다. 아래 그림처럼 KV 캐시는 토큰마다 따로 저장되기 때문에 원하는 지점에서 잘라 쓸 수 있지만, 요약은 모든 토큰이 이미 하나로 합쳐진 상태입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 265" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="토큰별로 저장하는 KV 캐시와 하나로 합쳐진 요약 상태의 비교">
  <style>
    .la3-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .la3-t { font-size: 14px; fill: var(--text, #1c1917); }
    .la3-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .la3-box { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .la3-ar { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#la3-arrow); }
  </style>
  <defs>
    <marker id="la3-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <!-- Top: KV cache -->
  <text x="200" y="20" text-anchor="middle" class="la3-h">KV 캐시 (softmax)</text>
  <rect x="20" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="38" y="55" text-anchor="middle" class="la3-t">t1</text>
  <rect x="60" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="78" y="55" text-anchor="middle" class="la3-t">t2</text>
  <rect x="100" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="118" y="55" text-anchor="middle" class="la3-t">t3</text>
  <rect x="140" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="158" y="55" text-anchor="middle" class="la3-t">t4</text>
  <rect x="180" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="198" y="55" text-anchor="middle" class="la3-t">t5</text>
  <rect x="226" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="244" y="55" text-anchor="middle" class="la3-t">t6</text>
  <rect x="266" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="284" y="55" text-anchor="middle" class="la3-t">t7</text>
  <rect x="306" y="35" width="36" height="30" rx="4" class="la3-box"/>
  <text x="324" y="55" text-anchor="middle" class="la3-t">t8</text>
  <text x="362" y="55" text-anchor="middle" class="la3-sm">…</text>
  <line x1="221" y1="28" x2="221" y2="72" stroke="var(--primary, #0a756c)" stroke-width="2" stroke-dasharray="4,3"/>
  <text x="200" y="92" text-anchor="middle" class="la3-sm">토큰마다 따로 저장 · 길이에 비례</text>
  <text x="200" y="112" text-anchor="middle" class="la3-sm">어느 지점에서든 잘라 쓰기 가능</text>
  <!-- Divider -->
  <line x1="20" y1="128" x2="380" y2="128" stroke="var(--border, #e7e5e4)" stroke-width="1" stroke-dasharray="3,3"/>
  <!-- Bottom: summary state -->
  <text x="200" y="153" text-anchor="middle" class="la3-h">요약 상태 (선형 어텐션)</text>
  <rect x="20" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="45" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="70" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="95" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="120" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="145" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="170" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <rect x="195" y="168" width="22" height="26" rx="3" class="la3-box"/>
  <path d="M225,181 L270,181" class="la3-ar"/>
  <rect x="278" y="161" width="100" height="40" rx="5" fill="none" stroke="var(--primary, #0a756c)" stroke-width="1.8"/>
  <text x="328" y="186" text-anchor="middle" class="la3-t">S (d × d)</text>
  <text x="200" y="228" text-anchor="middle" class="la3-sm">모든 토큰이 합쳐진 요약 · 크기 고정</text>
  <text x="200" y="248" text-anchor="middle" class="la3-sm">중간 지점만 떼어 낼 수 없음</text>
</svg>
</div>

prefix caching은 여러 요청이 공유하는 시스템 프롬프트나 문서의 KV를 한 번만 계산해 두고 재사용하는 기법입니다. KV 캐시라면 공유 구간까지만 잘라서 넘기면 되지만, 요약은 그 구간이 끝나는 정확한 지점에서 미리 복사해 두지 않았다면 되살릴 방법이 없습니다. 실제 서비스에서는 대화마다 캐시 적중률이 높기 때문에 이 차이가 비용으로 곧장 이어집니다.

speculative decoding도 비슷한 이유로 부딪힙니다. 작은 모델이 여러 토큰을 미리 추측하고 큰 모델이 한꺼번에 검증하는 방식인데, 추측이 틀리면 그 토큰들을 되돌려야 하죠. KV 캐시는 뒤쪽 몇 칸을 지우면 끝나지만, 요약에는 틀린 토큰이 이미 더해져 있어서 추측한 위치마다 요약의 사본을 들고 있거나 다시 계산해야 합니다.

저정밀 추론에서도 차이가 납니다. KV 캐시의 값은 한 번 쓰이고 나면 바뀌지 않지만, 요약은 같은 숫자 16,384개가 토큰마다 수만 번 고쳐 쓰입니다. FP8처럼 정밀도가 낮은 형식에서는 고쳐 쓸 때마다 생기는 반올림 오차가 계속 쌓이죠. MiniMax는 선형 어텐션이 풀 어텐션보다 수치 정밀도에 훨씬 더 민감하다고 밝혔습니다.

MiniMax는 이후 M3(2026년 6월)에서 블록 희소 softmax를 택했습니다. 원본은 전부 저장하되 읽는 위치만 줄이는 방향이죠. 반대편의 Qwen과 Kimi는 3:1 하이브리드를 계속 밀고 있습니다. 컨텍스트가 길어질수록 캐시 75% 절감의 가치가 커지고, 서빙 엔진들도 하이브리드 모델의 요약 상태를 저장하고 재사용하는 기능을 갖춰 가고 있기 때문입니다. 2026년 7월에는 Kimi K3가 2조 파라미터가 넘는 플래그십 모델에 선형 레이어를 넣었습니다.

두 진영은 같은 사실을 보고 있습니다. 요약은 빠르고 가볍지만 원본만큼 정확하지 않고, 원본을 전제로 만든 서빙 기법들과 잘 맞지 않는다는 것이죠. 갈린 것은 그 대가를 치를 만한 워크로드인지에 대한 판단입니다.

## 마치며

선형 어텐션이 남긴 질문은 과거를 얼마나 원본으로 남겨 둘 것인가입니다. 전부 남기면 풀 어텐션이고, 전부 요약하면 순수 선형 어텐션입니다. 3:1 하이브리드는 그 사이의 한 지점일 뿐이고, 어디가 맞는 지점인지는 아직 워크로드마다 답이 다릅니다.

다음 글에서는 컨텍스트를 1M까지 늘렸을 때 이런 설계들이 실제로 무엇을 떠받치는지 다룹니다. 모델 카드에 적힌 컨텍스트 길이와 실제로 쓸 수 있는 길이 사이의 격차가 어디서 생기는지 따라갑니다.

## 함께 보면 좋은 글

- [Sparse Attention, 블록으로 묶으면 달라지는 것](/llm/sparse-attention/)
- [KV Cache를 10분의 1로 줄인 MLA의 트릭](/llm/attention-variants/)
- [FlashAttention은 왜 더 많이 계산하면서 더 빠를까](/llm/flash-attention/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)

## 참고자료

- [Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention (Katharopoulos et al., ICML 2020)](https://arxiv.org/abs/2006.16236)
- [Gated Delta Networks: Improving Mamba2 with Delta Rule (Yang, Kautz, Hatamizadeh, ICLR 2025)](https://arxiv.org/abs/2412.06464)
- [MiniMax-01: Scaling Foundation Models with Lightning Attention (MiniMax, 2025)](https://arxiv.org/abs/2501.08313)
- [Why Did M2 End Up as a Full Attention Model? (MiniMax, 2025)](https://huggingface.co/blog/MiniMax-AI/why-did-m2-end-up-as-a-full-attention-model)
- [Kimi Linear: An Expressive, Efficient Attention Architecture (Moonshot AI, 2025)](https://arxiv.org/abs/2510.26692)
