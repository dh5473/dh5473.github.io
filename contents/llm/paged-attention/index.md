---
date: '2026-07-09'
title: 'vLLM의 핵심 원리 PagedAttention 파헤치기'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 3
tags: ['LLM Serving', 'vLLM', 'PagedAttention', 'KV Cache', 'Memory Management']
summary: 'vLLM 이전의 서빙 시스템이 KV Cache 메모리의 60~80%를 낭비하던 이유와, PagedAttention이 운영체제의 페이징을 빌려 그 낭비를 4% 밑으로 줄인 원리를 파헤칩니다.'
thumbnail: './thumbnail.png'
---

요청 하나가 `max_tokens=2048`로 들어왔습니다. 그런데 모델은 100토큰만 생성하고 `<EOS>`를 내뱉으며 끝났습니다. 흔한 일입니다. 문제는 vLLM 이전의 서빙 시스템이 이 요청을 어떻게 처리했느냐입니다. 첫 토큰을 만들기도 전에, 2,048토큰치 KV Cache를 담을 연속된 메모리 덩어리를 통째로 예약해뒀습니다. 실제로는 100토큰만 썼으니, **나머지 1,948토큰치는 요청이 끝날 때까지 예약된 채로 비어 있었습니다.**

KV Cache는 진행 중인 모든 요청이 GPU에 들고 있어야 하는 상태이고, 이걸 한정된 GPU 메모리에 담아 관리하는 일이 서빙의 핵심 과제입니다. 모델 가중치를 올리고 남은 공간이 KV Cache의 몫인데, 옛 시스템들은 그 몫마저 이런 식으로 60\~80%나 낭비하고 있었습니다. KV Cache에 쓰라고 떼어둔 공간의 20\~40%만 실제 토큰 상태에 쓰였다는 뜻입니다. 이 글에서는 그 낭비가 정확히 어디서 왔는지, 그리고 vLLM의 **PagedAttention**이 운영체제의 오래된 아이디어를 빌려 이 낭비를 4% 밑으로 줄인 방법을 파헤칩니다.

<br>

## 연속 할당이 강제한 낭비

왜 옛 시스템들은 미래에 쓸지도 모르는 메모리를 미리 잡아뒀을까요? 답은 어텐션 연산의 요구 조건에 있습니다. 단순하게 구현한 어텐션 커널은 한 시퀀스의 KV Cache가 메모리에 **하나의 연속된 배열**로 놓여 있다고 가정합니다. 텐서 하나처럼요. 그런데 시퀀스는 토큰이 생성될 때마다 길어집니다. 연속성을 계속 보장하려면, 뒤에 다른 요청이 끼어들어 자리를 뺏기 전에 **처음부터 최대 길이만큼 한 덩어리를 잡아두는 수밖에** 없었습니다.

이 연속 할당이 세 가지 낭비를 만들어냅니다.

| 낭비 유형 | 언제 생기나 |
|---|---|
| **예약 낭비 (reserved)** | 아직 생성하지 않은 미래 토큰의 자리를 미리 잡아둠. 생성이 끝날 때까지 비어 있음 |
| **내부 단편화 (internal)** | 출력 길이를 모르니 `max_model_len`까지 과하게 잡음. 대부분 끝까지 안 씀 |
| **외부 단편화 (external)** | 요청마다 크기가 달라 연속 덩어리 사이에 어중간한 빈틈이 생김 |

특히 외부 단편화가 문제입니다. 남은 메모리를 총량으로 따지면 새 요청을 받을 공간이 충분한데, **연속된 자리로는 없어서** 요청을 거절해야 하는 상황이 벌어집니다. 조각조각 흩어진 빈틈은 있지만, 정작 필요한 큰 한 덩어리가 나오지 않는 것입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 456" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="연속 할당 방식의 KV 메모리 낭비. 위쪽은 요청 A, B, C가 각각 16칸, 12칸, 20칸을 예약해두고 실제로는 2칸, 5칸, 3칸만 사용하는 모습. 아래쪽은 물리 메모리에 빈 공간 9칸이 3칸, 2칸, 4칸으로 흩어져 있어 연속 6칸이 필요한 요청 D가 거절되는 외부 단편화 상황.">
  <style>
    .fr1-h    { fill: var(--text, #1c1917); font-size: 20px; font-weight: 700; }
    .fr1-t    { fill: var(--text, #1c1917); font-size: 17px; }
    .fr1-lb   { fill: var(--text, #1c1917); font-size: 20px; }
    .fr1-sub  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .fr1-use  { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); stroke-width: 1; }
    .fr1-res  { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1; }
    .fr1-occ  { fill: var(--bg-muted, #eeecea); stroke: var(--text-muted, #78716c); stroke-width: 1; stroke-opacity: 0.4; }
    .fr1-free { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1; }
    .fr1-ok   { fill: var(--text-success, #16a34a); font-size: 17px; text-anchor: middle; }
    .fr1-bad  { fill: var(--text-danger, #dc2626); font-size: 17px; }
    .fr1-div  { stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .fr1-need { fill: none; stroke: var(--text-danger, #dc2626); stroke-width: 1.5; stroke-dasharray: 4 3; }
  </style>
  <text x="8" y="22" class="fr1-h">연속 할당: 요청마다 최대 길이를 통째로 예약</text>
  <!-- 요청 A: 16칸 예약, 2칸 사용 -->
  <text x="8" y="52" class="fr1-lb">요청 A</text>
  <text x="75" y="52" class="fr1-sub">16칸 중 2칸</text>
  <rect x="8" y="62" width="20" height="22" rx="2" class="fr1-use"/><rect x="31" y="62" width="20" height="22" rx="2" class="fr1-use"/><rect x="54" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="77" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="100" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="123" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="146" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="169" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="192" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="215" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="238" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="261" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="284" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="307" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="330" y="62" width="20" height="22" rx="2" class="fr1-res"/><rect x="353" y="62" width="20" height="22" rx="2" class="fr1-res"/>
  <!-- 요청 B: 12칸 예약, 5칸 사용 -->
  <text x="8" y="112" class="fr1-lb">요청 B</text>
  <text x="75" y="112" class="fr1-sub">12칸 중 5칸</text>
  <rect x="8" y="122" width="20" height="22" rx="2" class="fr1-use"/><rect x="31" y="122" width="20" height="22" rx="2" class="fr1-use"/><rect x="54" y="122" width="20" height="22" rx="2" class="fr1-use"/><rect x="77" y="122" width="20" height="22" rx="2" class="fr1-use"/><rect x="100" y="122" width="20" height="22" rx="2" class="fr1-use"/><rect x="123" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="146" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="169" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="192" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="215" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="238" y="122" width="20" height="22" rx="2" class="fr1-res"/><rect x="261" y="122" width="20" height="22" rx="2" class="fr1-res"/>
  <!-- 요청 C: 20칸 예약, 3칸 사용 -->
  <text x="8" y="172" class="fr1-lb">요청 C</text>
  <text x="75" y="172" class="fr1-sub">20칸 중 3칸</text>
  <rect x="8" y="182" width="20" height="22" rx="2" class="fr1-use"/><rect x="31" y="182" width="20" height="22" rx="2" class="fr1-use"/><rect x="54" y="182" width="20" height="22" rx="2" class="fr1-use"/><rect x="77" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="100" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="123" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="146" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="169" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="192" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="215" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="238" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="261" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="284" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="307" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="330" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="353" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="376" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="399" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="422" y="182" width="20" height="22" rx="2" class="fr1-res"/><rect x="445" y="182" width="20" height="22" rx="2" class="fr1-res"/>
  <!-- 범례 -->
  <rect x="8" y="214" width="16" height="16" rx="2" class="fr1-use"/>
  <text x="32" y="227" class="fr1-sub">실제 사용</text>
  <rect x="125" y="214" width="16" height="16" rx="2" class="fr1-res"/>
  <text x="149" y="227" class="fr1-sub">예약됐지만 빈 공간</text>
  <text x="8" y="254" class="fr1-t">실제 사용은 20~40%, 나머지 60~80%가 예약된 채 낭비</text>
  <line x1="8" y1="274" x2="472" y2="274" class="fr1-div"/>
  <!-- 외부 단편화 -->
  <text x="8" y="300" class="fr1-h">외부 단편화: 총량은 남아도 연속된 자리가 없음</text>
  <text x="8" y="324" class="fr1-sub">회색 = 다른 요청이 쓰는 중 · 초록 = 빈 공간</text>
  <rect x="8" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="22" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="36" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="50" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="64" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="78" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="92" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="106" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="120" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="134" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="148" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="162" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="176" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="190" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="204" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="218" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="232" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="246" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="260" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="274" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="288" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="302" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="316" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="330" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="344" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="358" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="372" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="386" y="334" width="13" height="26" rx="2" class="fr1-free"/><rect x="400" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="414" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="428" y="334" width="13" height="26" rx="2" class="fr1-occ"/><rect x="442" y="334" width="13" height="26" rx="2" class="fr1-occ"/>
  <text x="113" y="380" class="fr1-ok">3칸</text>
  <text x="260" y="380" class="fr1-ok">2칸</text>
  <text x="370" y="380" class="fr1-ok">4칸</text>
  <rect x="8" y="392" width="83" height="26" rx="2" class="fr1-need"/>
  <text x="100" y="410" class="fr1-t">요청 D: 연속 6칸이 필요</text>
  <text x="8" y="440" class="fr1-bad">빈칸은 총 9칸이지만 최대 연속은 4칸, 그래서 거절</text>
</svg>
</div>

:::info

**참고**

vLLM 이전의 대표적 시스템인 Orca, FasterTransformer가 이 연속 할당 방식을 썼습니다. PagedAttention 논문(Kwon et al., 2023)은 예약 방식만 달리한 Orca 세 가지 버전을 재현해 측정했는데, KV 캐시 공간의 20.4~38.2%만 실제 토큰 상태에 쓰이고 나머지는 예약과 단편화로 날아갔습니다. FasterTransformer 역시 Orca와 같은 방식으로 메모리를 잡는다고 논문은 서술합니다.

:::

<br>

## 운영체제는 이미 이 문제를 풀었다

사실 "연속된 큰 메모리가 필요한데 단편화 때문에 못 쓴다"는 문제는 컴퓨터 과학이 수십 년 전에 이미 풀어낸 것입니다. 바로 운영체제의 **가상 메모리(virtual memory)와 페이징(paging)**입니다.

프로그램은 자기가 0번지부터 쭉 이어진 연속 메모리를 쓰고 있다고 믿습니다. 하지만 실제 물리 메모리(RAM)에서는 그렇지 않습니다. 메모리는 **고정 크기 페이지(page)**로 잘게 나뉘어 있고, 프로그램이 쓰는 논리적으로 연속된 주소는 물리적으로는 여기저기 흩어진 페이지에 담깁니다. 이 논리 주소와 물리 페이지의 대응을 **페이지 테이블(page table)**이 관리합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 294" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="운영체제 페이징의 논리 주소와 물리 메모리 매핑. 왼쪽에 논리 페이지 0, 1, 2가 연속으로 붙어 있고, 오른쪽 물리 메모리 풀에는 페이지 12, 47, 91이 다른 프로세스의 페이지들 사이에 흩어져 있습니다. 페이지 테이블이 논리 페이지 0을 물리 47로, 1을 12로, 2를 91로 잇는 화살표가 서로 교차합니다.">
  <style>
    .pg1-head { fill: var(--text-muted, #78716c); font-size: 17px; }
    .pg1-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pg1-pool { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pg1-hit  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .pg1-oth  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .pg1-lb   { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .pg1-l    { fill: var(--text, #1c1917); font-size: 20px; }
    .pg1-sub  { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .pg1-r    { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: end; }
    .pg1-cap  { fill: var(--text, #1c1917); font-size: 18px; text-anchor: middle; }
    .pg1-arr  { stroke: var(--primary, #0d9488); stroke-width: 1.5; fill: none; marker-end: url(#pg1Head); }
  </style>
  <defs>
    <marker id="pg1Head" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--primary, #0d9488)"/>
    </marker>
  </defs>
  <text x="8" y="20" class="pg1-head">논리 주소 공간 (연속)</text>
  <text x="250" y="20" class="pg1-head">물리 메모리 (흩어짐)</text>
  <!-- 논리 주소 공간 -->
  <rect x="8" y="36" width="150" height="52" rx="6" class="pg1-box"/>
  <text x="83" y="60" class="pg1-lb">논리 페이지 0</text>
  <text x="83" y="80" class="pg1-sub">0 ~ 4KB</text>
  <rect x="8" y="88" width="150" height="52" rx="6" class="pg1-box"/>
  <text x="83" y="112" class="pg1-lb">논리 페이지 1</text>
  <text x="83" y="132" class="pg1-sub">4 ~ 8KB</text>
  <rect x="8" y="140" width="150" height="52" rx="6" class="pg1-box"/>
  <text x="83" y="164" class="pg1-lb">논리 페이지 2</text>
  <text x="83" y="184" class="pg1-sub">8 ~ 12KB</text>
  <!-- 물리 메모리 풀 -->
  <rect x="250" y="30" width="222" height="218" rx="6" class="pg1-pool"/>
  <rect x="258" y="38" width="206" height="34" rx="4" class="pg1-hit"/>
  <text x="268" y="61" class="pg1-l">페이지 12</text>
  <text x="454" y="61" class="pg1-r">4 ~ 8KB</text>
  <rect x="258" y="78" width="206" height="28" rx="4" class="pg1-oth"/>
  <text x="361" y="97" class="pg1-sub">다른 프로세스가 사용</text>
  <rect x="258" y="112" width="206" height="34" rx="4" class="pg1-hit"/>
  <text x="268" y="135" class="pg1-l">페이지 47</text>
  <text x="454" y="135" class="pg1-r">0 ~ 4KB</text>
  <rect x="258" y="152" width="206" height="28" rx="4" class="pg1-oth"/>
  <text x="361" y="171" class="pg1-sub">다른 프로세스가 사용</text>
  <rect x="258" y="186" width="206" height="34" rx="4" class="pg1-hit"/>
  <text x="268" y="209" class="pg1-l">페이지 91</text>
  <text x="454" y="209" class="pg1-r">8 ~ 12KB</text>
  <text x="361" y="238" class="pg1-sub">...</text>
  <!-- 논리 → 물리 매핑 -->
  <path d="M162,62 C205,62 210,129 246,129" class="pg1-arr"/>
  <path d="M162,114 C205,114 210,55 246,55" class="pg1-arr"/>
  <path d="M162,166 C205,166 210,203 246,203" class="pg1-arr"/>
  <text x="240" y="274" class="pg1-cap">페이지 테이블이 논리 → 물리 매핑을 관리</text>
</svg>
</div>

핵심은 이겁니다. 페이징에서는 **물리적으로 연속된 메모리가 애초에 필요 없습니다.** 페이지 하나씩, 빈 자리 아무 데나 할당하면 되니까요. 그래서 외부 단편화가 사라지고, 실제로 쓸 만큼만 페이지를 할당하니 예약 낭비도 사라집니다. PagedAttention의 출발점은 단순한 질문 하나였습니다. **KV Cache도 이렇게 관리하면 안 될까?**

<br>

## KV Cache를 블록으로 쪼개다

PagedAttention은 페이징을 KV Cache에 그대로 옮겨옵니다. 이름의 "Paged"가 여기서 나옵니다.

KV Cache를 하나의 연속 덩어리로 잡는 대신, **고정 크기 블록(block)**으로 잘게 나눕니다. 블록 하나는 기본적으로 **16개 토큰**의 Key와 Value를 담습니다(`--block-size`로 조정 가능). 그리고 각 시퀀스는 자신의 **블록 테이블(block table)**을 갖습니다. 페이지 테이블과 정확히 같은 역할로, 시퀀스의 논리 블록이 물리 메모리의 어느 블록에 담겨 있는지를 매핑합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 294" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="PagedAttention 블록 테이블의 논리 블록과 물리 블록 매핑. 왼쪽에 논리 블록 0(토큰 0~15), 1(토큰 16~31), 2(토큰 32~47)가 연속으로 붙어 있고, 오른쪽 물리 블록 풀에는 블록 3, 7, 9가 다른 시퀀스가 쓰는 블록들 사이에 흩어져 있습니다. 블록 테이블이 논리 블록 0을 물리 블록 7로, 1을 3으로, 2를 9로 잇는 화살표가 서로 교차합니다.">
  <style>
    .bt1-head { fill: var(--text-muted, #78716c); font-size: 17px; }
    .bt1-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .bt1-pool { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .bt1-hit  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .bt1-oth  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .bt1-lb   { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .bt1-l    { fill: var(--text, #1c1917); font-size: 20px; }
    .bt1-sub  { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .bt1-r    { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: end; }
    .bt1-cap  { fill: var(--text, #1c1917); font-size: 18px; text-anchor: middle; }
    .bt1-arr  { stroke: var(--primary, #0d9488); stroke-width: 1.5; fill: none; marker-end: url(#bt1Head); }
  </style>
  <defs>
    <marker id="bt1Head" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--primary, #0d9488)"/>
    </marker>
  </defs>
  <text x="8" y="20" class="bt1-head">시퀀스의 논리 블록 (연속)</text>
  <text x="250" y="20" class="bt1-head">물리 블록 풀 (흩어짐)</text>
  <!-- 시퀀스의 논리 블록 -->
  <rect x="8" y="36" width="150" height="52" rx="6" class="bt1-box"/>
  <text x="83" y="60" class="bt1-lb">논리 블록 0</text>
  <text x="83" y="80" class="bt1-sub">토큰 0 ~ 15</text>
  <rect x="8" y="88" width="150" height="52" rx="6" class="bt1-box"/>
  <text x="83" y="112" class="bt1-lb">논리 블록 1</text>
  <text x="83" y="132" class="bt1-sub">토큰 16 ~ 31</text>
  <rect x="8" y="140" width="150" height="52" rx="6" class="bt1-box"/>
  <text x="83" y="164" class="bt1-lb">논리 블록 2</text>
  <text x="83" y="184" class="bt1-sub">토큰 32 ~ 47</text>
  <!-- 물리 블록 풀 -->
  <rect x="250" y="30" width="222" height="218" rx="6" class="bt1-pool"/>
  <rect x="258" y="38" width="206" height="34" rx="4" class="bt1-hit"/>
  <text x="268" y="61" class="bt1-l">블록 3</text>
  <text x="454" y="61" class="bt1-r">토큰 16 ~ 31</text>
  <rect x="258" y="78" width="206" height="28" rx="4" class="bt1-oth"/>
  <text x="361" y="97" class="bt1-sub">다른 시퀀스가 사용</text>
  <rect x="258" y="112" width="206" height="34" rx="4" class="bt1-hit"/>
  <text x="268" y="135" class="bt1-l">블록 7</text>
  <text x="454" y="135" class="bt1-r">토큰 0 ~ 15</text>
  <rect x="258" y="152" width="206" height="28" rx="4" class="bt1-oth"/>
  <text x="361" y="171" class="bt1-sub">다른 시퀀스가 사용</text>
  <rect x="258" y="186" width="206" height="34" rx="4" class="bt1-hit"/>
  <text x="268" y="209" class="bt1-l">블록 9</text>
  <text x="454" y="209" class="bt1-r">토큰 32 ~ 47</text>
  <text x="361" y="238" class="bt1-sub">...</text>
  <!-- 논리 → 물리 매핑 -->
  <path d="M162,62 C205,62 210,129 246,129" class="bt1-arr"/>
  <path d="M162,114 C205,114 210,55 246,55" class="bt1-arr"/>
  <path d="M162,166 C205,166 210,203 246,203" class="bt1-arr"/>
  <text x="240" y="274" class="bt1-cap">블록 테이블이 논리 → 물리 매핑을 관리</text>
</svg>
</div>

할당은 **필요할 때 한 블록씩(on-demand)** 이뤄집니다. 미리 최대 길이만큼 잡아두지 않습니다.

- 시퀀스가 첫 16토큰을 만들면, 빈 블록 풀에서 물리 블록 하나를 가져와 블록 테이블에 기록합니다.
- 17번째 토큰이 나오면, 두 번째 물리 블록을 가져옵니다. 이 블록은 첫 블록과 물리적으로 붙어 있을 필요가 전혀 없습니다. 풀에서 비어 있는 아무 블록이나 됩니다.

물리 블록이 흩어져 있으니, 어텐션을 계산할 때는 블록 테이블을 따라가며 필요한 블록들을 모읍니다(gather). 이 과정을 담당하는 특수 커널이 PagedAttention 커널입니다. 덕분에 KV가 물리적으로 비연속이어도 어텐션이 정상 동작합니다.

:::tip

**물리 블록 풀은 언제 잡히나**

이 물리 블록 풀은 vLLM이 시작할 때 미리 통째로 확보합니다. 기동 로그에 찍히는 `GPU KV cache size: N tokens`가 바로 이 풀의 전체 크기이고, N = 전체 블록 수 × 블록당 토큰 수인 셈입니다. 블록의 할당과 반납은 빈 블록 목록(free list)에서 꺼내고 되돌리는 것이라 O(1)로 끝납니다.

:::

<br>

## 낭비가 4% 밑으로

이제 낭비가 어디로 갔는지 따져봅시다. 세 가지 낭비가 각각 어떻게 됐는지 보면 명확합니다.

- **예약 낭비**: 블록 하나 안으로 묶였습니다. 미리 최대 길이를 잡지 않고 필요할 때 블록을 하나씩 붙이니, 아직 안 쓴 자리는 지금 채우고 있는 마지막 블록의 남은 칸뿐입니다.
- **외부 단편화**: 사라졌습니다. 모든 블록이 같은 크기라, 빈 블록이 하나라도 있으면 어떤 요청에든 들어갑니다. 어중간해서 못 쓰는 빈틈이 생길 수가 없습니다.
- **내부 단편화**: 딱 하나 남습니다. 방금의 그 마지막 블록은 16칸을 다 못 채운 채로 시퀀스가 끝나버릴 수 있고, 그 순간 남은 칸은 영영 안 쓰이게 됩니다. 100토큰짜리 시퀀스는 블록 7개(112칸)를 쓰고 12칸을 남깁니다. 하지만 이 낭비는 시퀀스당 최대 15토큰(블록 크기 미만)뿐이라, 전체로 보면 미미합니다.

그 결과 논문의 측정에서 vLLM은 KV 캐시 공간의 96.3%를 실제 토큰 상태에 썼습니다. 낭비율이 **60~80%에서 4% 미만으로** 떨어진 셈입니다.

| 항목 | 연속 할당 (Orca 등) | PagedAttention (vLLM) |
|---|---|---|
| **할당 단위** | 요청당 연속 덩어리 (max_len) | 16토큰 블록, on-demand |
| **KV 메모리 낭비** | 60~80% | 4% 미만 |
| **남는 낭비** | 예약 + 내부 + 외부 | 마지막 블록의 빈칸뿐 |

이 4%라는 숫자가 왜 중요할까요? decode 단계는 연산보다 가중치를 GPU 메모리에서 읽어오는 데 대부분의 시간을 쓰는 memory-bound 구간이라, 배치를 키워 여러 요청을 한 번에 처리하는 것이 처리량을 끌어올리는 거의 유일한 방법입니다. 그런데 배치를 키우려면 그만큼의 KV Cache가 GPU에 동시에 살아 있어야 합니다. 낭비가 60~80%면 실제로 담을 수 있는 요청 수가 그만큼 쪼그라들고, 낭비가 4%면 같은 GPU에 훨씬 많은 요청을 담을 수 있습니다.

> **PagedAttention은 KV Cache를 아끼는 기술이 아니라, 이 한정된 공간을 남김없이 쓰게 해주는 기술입니다.** 모델 가중치를 올리고 남은 그 빠듯한 KV 공간의 거의 전부를 실제 요청에 쓸 수 있게 되고, 그만큼 배치를 키울 여지가 생깁니다. vLLM이 이전 시스템 대비 처리량을 2~4배 끌어올린 데에는 이 차이가 큰 몫을 합니다.

<br>

## 같은 블록을 여러 요청이 나눠 쓴다

블록 테이블로 KV를 간접 참조하게 되면서 뜻밖의 선물이 딸려옵니다. 서로 다른 두 시퀀스의 블록 테이블이 **같은 물리 블록을 가리킬 수 있다**는 점입니다.

예를 들어 여러 요청이 똑같은 시스템 프롬프트로 시작한다면, 그 공통 프롬프트의 KV는 물리 메모리에 **딱 한 번만** 저장해두고 모든 요청이 공유하면 됩니다. 각자의 블록 테이블이 같은 블록을 가리키기만 하면 되니까요. 그러다 요청들이 서로 다른 토큰을 생성하며 갈라지는 순간, 그 블록만 복사해서 각자 쓰면 됩니다(copy-on-write).

이 블록 공유가 바로 **prefix caching**의 씨앗입니다. 공통 프롬프트나 긴 문서의 KV를 한 번만 저장해두고 여러 요청이 재사용하는 이 기법이, KV를 블록 단위로 관리한 덕분에 자연스럽게 가능해졌습니다.

<br>

## 마치며

PagedAttention이 한 일을 한 문장으로 줄이면, KV Cache를 요청마다 통째로 잡는 뻣뻣한 덩어리에서, 아무 데나 끼워 넣고 공유할 수 있는 블록들의 풀로 바꾼 것입니다. 운영체제가 반세기 전에 물리 메모리를 다루려고 찾아낸 답을, LLM의 KV Cache에 그대로 적용한 셈입니다. 낭비가 사라졌고, 그만큼 더 많은 요청이 한 GPU에 올라가게 됐습니다.

그런데 블록들의 풀이 생기자 새로운 질문이 따라옵니다. 매 스텝마다 이 블록들을 어떤 요청에 내어줄지, 긴 프롬프트를 처리하는 요청이 다른 요청들의 생성을 막지 않게 하려면 배치를 어떻게 짜야 할지 같은 것들입니다. 다음 글에서는 vLLM이 요청들을 매 스텝 어떻게 스케줄링하는지, continuous batching과 chunked prefill을 살펴봅니다.

<br>

## 함께 보면 좋은 글

- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)

<br>

## 참고자료

- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180)
- [vLLM Documentation - PagedAttention Design](https://docs.vllm.ai/en/latest/design/paged_attention/)
- [Inside vLLM: Anatomy of a High-Throughput LLM Inference System (vLLM Blog)](https://vllm.ai/blog/2025-09-05-anatomy-of-vllm)
- [How PagedAttention Resolves Memory Waste of LLM Systems (Red Hat Developer)](https://developers.redhat.com/articles/2025/07/24/how-pagedattention-resolves-memory-waste-llm-systems)
