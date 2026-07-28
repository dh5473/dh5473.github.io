---
date: '2026-07-11'
title: 'Continuous Batching과 Chunked Prefill 완전 이해'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 4
tags: ['LLM Serving', 'vLLM', 'Continuous Batching', 'Chunked Prefill', 'Scheduling']
summary: 'static batching이 GPU를 놀리는 이유부터, vLLM V1이 continuous batching과 chunked prefill을 하나의 토큰 예산 스케줄러로 묶어 처리량과 응답 지연을 함께 잡는 원리를 정리합니다.'
thumbnail: './thumbnail.png'
---

PagedAttention은 KV Cache를 고정 크기 블록들의 풀로 바꿔놓았습니다. 덕분에 요청들이 GPU 메모리를 낭비 없이 나눠 쓸 수 있게 됐습니다. 그런데 블록 풀이 생겼다고 서빙이 저절로 빨라지지는 않습니다. 매 스텝마다 이 블록들을 **어떤 요청에 내어줄지**, 그리고 요청들을 **어떻게 배치로 묶을지** 정하는 주체가 따로 있어야 합니다. 그 주체가 스케줄러입니다.

이 글에서는 vLLM의 스케줄러가 요청들을 매 스텝 어떻게 묶는지 살펴봅니다. 핵심은 두 가지, **continuous batching**과 **chunked prefill**입니다. 둘은 따로 등장한 기법이지만 vLLM V1에서는 하나의 스케줄러로 합쳐졌고, 그 구조를 이해하면 `max_num_batched_tokens` 같은 설정이 왜 그런 효과를 내는지도 자연스럽게 풀립니다.

<br>

## 배치를 통째로 묶으면 GPU가 논다

여러 요청을 한 번에 처리하려면 배치로 묶어야 합니다. GPU는 요청 하나를 처리하든 여러 개를 처리하든 모델 가중치를 한 번 읽어오는데, 이 비용을 여러 요청이 나눠 질수록, 즉 배치가 클수록 요청당 부담이 줄어듭니다. decode는 메모리 대역폭에 묶인 memory-bound 단계라서, 배치를 키우는 것이 곧 처리량을 올리는 가장 확실한 방법이 됩니다.

문제는 **어떻게 묶느냐**입니다. 가장 단순한 방식은 요청 여러 개를 모아 배치로 만들고, 그 배치를 통째로 시작해서 통째로 끝내는 것입니다. 이걸 static batching이라고 합니다. 그런데 LLM 요청은 생성하는 토큰 수가 제각각입니다. 어떤 요청은 세 단어로 끝나고, 어떤 요청은 소설 한 편을 씁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 244" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="static batching 간트 차트. 요청 A는 3스텝, B는 8스텝, D는 4스텝 만에 끝나지만 가장 긴 C가 14스텝을 채울 때까지 그 자리가 빈 슬롯으로 남아 낭비됩니다">
  <style>
    .cb1-title { fill: var(--text, #1c1917); font-size: 22px; }
    .cb1-name  { fill: var(--text, #1c1917); font-size: 22px; text-anchor: middle; }
    .cb1-sub   { fill: var(--text-muted, #78716c); font-size: 17px; }
    .cb1-run   { fill: var(--primary, #0d9488); }
    .cb1-waste { fill: url(#cb1Hatch); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .cb1-in    { fill: #ffffff; font-size: 17px; text-anchor: middle; }
    .cb1-warn  { fill: var(--text-danger, #dc2626); font-size: 17px; text-anchor: middle; }
  </style>
  <defs>
    <pattern id="cb1Hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="var(--bg-danger, #fef2f2)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="var(--text-danger, #dc2626)" stroke-width="1.4" opacity="0.4"/>
    </pattern>
  </defs>
  <text x="10" y="24" class="cb1-title">Static batching</text>
  <text x="470" y="24" class="cb1-sub" text-anchor="end">시간 →</text>
  <!-- 요청 A -->
  <text x="32" y="65" class="cb1-name">A</text>
  <rect x="52" y="44" width="90" height="30" rx="4" class="cb1-run"/>
  <text x="97" y="65" class="cb1-in">3스텝</text>
  <rect x="142" y="44" width="328" height="30" rx="4" class="cb1-waste"/>
  <text x="306" y="65" class="cb1-warn">빈 슬롯 = 낭비</text>
  <!-- 요청 B -->
  <text x="32" y="105" class="cb1-name">B</text>
  <rect x="52" y="84" width="239" height="30" rx="4" class="cb1-run"/>
  <text x="171" y="105" class="cb1-in">8스텝</text>
  <rect x="291" y="84" width="179" height="30" rx="4" class="cb1-waste"/>
  <!-- 요청 C -->
  <text x="32" y="145" class="cb1-name">C</text>
  <rect x="52" y="124" width="418" height="30" rx="4" class="cb1-run"/>
  <text x="261" y="145" class="cb1-in">14스텝 (가장 김)</text>
  <!-- 요청 D -->
  <text x="32" y="185" class="cb1-name">D</text>
  <rect x="52" y="164" width="119" height="30" rx="4" class="cb1-run"/>
  <text x="111" y="185" class="cb1-in">4스텝</text>
  <rect x="171" y="164" width="299" height="30" rx="4" class="cb1-waste"/>
  <!-- 범례와 캡션 -->
  <rect x="52" y="210" width="18" height="14" rx="2" class="cb1-run"/>
  <text x="78" y="222" class="cb1-sub">실행 중</text>
  <rect x="152" y="210" width="18" height="14" rx="2" class="cb1-waste"/>
  <text x="178" y="222" class="cb1-sub">빈 슬롯 (낭비)</text>
</svg>
</div>

A는 3스텝 만에 답을 다 만들었는데도, 같은 배치의 C가 14스텝을 채울 때까지 그 자리를 떠나지 못합니다. A가 비운 자리에 새 요청을 넣지도 못합니다. 배치를 통째로 관리하니까요. 결국 GPU는 이미 끝난 요청의 빈자리를 그대로 안은 채, 절반쯤 빈 배치를 계속 돌리게 됩니다. 요청 길이 편차가 클수록 이 낭비는 커집니다.

<br>

## 매 스텝 배치를 다시 짜는 Continuous Batching

낭비의 원인은 "배치를 통째로 시작하고 통째로 끝낸다"는 데 있습니다. 그렇다면 배치를 **매 스텝 다시 짜면** 어떨까요? 이것이 continuous batching입니다. 원래 Orca(OSDI 2022)가 제안한 iteration-level scheduling에서 왔고, vLLM이 이를 엔진의 기본 동작으로 삼았습니다.

핵심은 배치 구성의 단위를 **요청 전체가 아니라 한 스텝(=한 번의 forward pass)**으로 낮춘 것입니다. 매 스텝이 끝나면 스케줄러가 배치를 다시 들여다봅니다. 답을 다 만든 요청은 그 즉시 배치에서 빠지고, 그 빈자리에 대기 중이던 요청이 바로 들어옵니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 380" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="continuous batching의 스텝별 배치 구성. 네 개의 슬롯이 매 스텝 다시 채워집니다. A가 완료되면 E가, D가 완료되면 F가, B가 완료되면 G가 즉시 그 자리에 합류해 빈 슬롯이 생기지 않습니다">
  <style>
    .cb2-title { fill: var(--text, #1c1917); font-size: 22px; }
    .cb2-step  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .cb2-cell  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .cb2-new   { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.5; }
    .cb2-req   { fill: var(--text, #1c1917); font-size: 22px; text-anchor: middle; }
    .cb2-nreq  { fill: var(--text-success, #16a34a); font-size: 22px; text-anchor: middle; }
    .cb2-note  { fill: var(--text-muted, #78716c); font-size: 17px; }
  </style>
  <text x="8" y="24" class="cb2-title">Continuous batching</text>
  <!-- 스텝 t -->
  <text x="8" y="68" class="cb2-step">스텝 t</text>
  <rect x="88" y="44" width="90" height="36" rx="5" class="cb2-cell"/><text x="133" y="69" class="cb2-req">A</text>
  <rect x="184" y="44" width="90" height="36" rx="5" class="cb2-cell"/><text x="229" y="69" class="cb2-req">B</text>
  <rect x="280" y="44" width="90" height="36" rx="5" class="cb2-cell"/><text x="325" y="69" class="cb2-req">C</text>
  <rect x="376" y="44" width="90" height="36" rx="5" class="cb2-cell"/><text x="421" y="69" class="cb2-req">D</text>
  <!-- 스텝 t+1 -->
  <text x="8" y="114" class="cb2-step">스텝 t+1</text>
  <rect x="88" y="90" width="90" height="36" rx="5" class="cb2-cell"/><text x="133" y="115" class="cb2-req">A</text>
  <rect x="184" y="90" width="90" height="36" rx="5" class="cb2-cell"/><text x="229" y="115" class="cb2-req">B</text>
  <rect x="280" y="90" width="90" height="36" rx="5" class="cb2-cell"/><text x="325" y="115" class="cb2-req">C</text>
  <rect x="376" y="90" width="90" height="36" rx="5" class="cb2-cell"/><text x="421" y="115" class="cb2-req">D</text>
  <!-- 스텝 t+2 -->
  <text x="8" y="160" class="cb2-step">스텝 t+2</text>
  <rect x="88" y="136" width="90" height="36" rx="5" class="cb2-new"/><text x="133" y="161" class="cb2-nreq">E</text>
  <rect x="184" y="136" width="90" height="36" rx="5" class="cb2-cell"/><text x="229" y="161" class="cb2-req">B</text>
  <rect x="280" y="136" width="90" height="36" rx="5" class="cb2-cell"/><text x="325" y="161" class="cb2-req">C</text>
  <rect x="376" y="136" width="90" height="36" rx="5" class="cb2-cell"/><text x="421" y="161" class="cb2-req">D</text>
  <text x="88" y="190" class="cb2-note">A 완료, E 합류</text>
  <!-- 스텝 t+3 -->
  <text x="8" y="228" class="cb2-step">스텝 t+3</text>
  <rect x="88" y="204" width="90" height="36" rx="5" class="cb2-cell"/><text x="133" y="229" class="cb2-req">E</text>
  <rect x="184" y="204" width="90" height="36" rx="5" class="cb2-cell"/><text x="229" y="229" class="cb2-req">B</text>
  <rect x="280" y="204" width="90" height="36" rx="5" class="cb2-cell"/><text x="325" y="229" class="cb2-req">C</text>
  <rect x="376" y="204" width="90" height="36" rx="5" class="cb2-new"/><text x="421" y="229" class="cb2-nreq">F</text>
  <text x="88" y="258" class="cb2-note">D 완료, F 합류</text>
  <!-- 스텝 t+4 -->
  <text x="8" y="296" class="cb2-step">스텝 t+4</text>
  <rect x="88" y="272" width="90" height="36" rx="5" class="cb2-cell"/><text x="133" y="297" class="cb2-req">E</text>
  <rect x="184" y="272" width="90" height="36" rx="5" class="cb2-new"/><text x="229" y="297" class="cb2-nreq">G</text>
  <rect x="280" y="272" width="90" height="36" rx="5" class="cb2-cell"/><text x="325" y="297" class="cb2-req">C</text>
  <rect x="376" y="272" width="90" height="36" rx="5" class="cb2-cell"/><text x="421" y="297" class="cb2-req">F</text>
  <text x="88" y="326" class="cb2-note">B 완료, G 합류</text>
  <!-- 범례와 캡션 -->
  <rect x="88" y="348" width="18" height="14" rx="2" class="cb2-cell"/>
  <text x="114" y="360" class="cb2-note">진행 중</text>
  <rect x="196" y="348" width="18" height="14" rx="2" class="cb2-new"/>
  <text x="222" y="360" class="cb2-note">새로 합류</text>
</svg>
</div>

A가 끝난 다음 스텝에 곧바로 E가 그 자리를 채웁니다. 빈자리를 안고 도는 스텝이 사라지고, GPU는 매 스텝 최대한 꽉 찬 배치를 처리합니다. 요청 하나가 끝나기를 배치 전체가 기다리던 구조가, 요청 하나가 끝나면 그 자리만 갈아 끼우는 구조로 바뀐 셈입니다.

:::info

**참고**

continuous batching은 운영체제의 선점형 시분할 스케줄링과 닮았습니다. 여러 프로세스가 CPU를 짧은 타임 슬라이스로 번갈아 쓰듯, 여러 요청이 매 스텝마다 GPU를 함께 씁니다. 다만 OS의 타임 슬라이스가 "시간"으로 끊긴다면, vLLM의 한 스텝은 "토큰 수"로 끊긴다는 점이 다릅니다.

:::

그런데 배치가 무한정 커지지는 않습니다. 요청들이 토큰을 생성할수록 각자가 붙들고 있는 KV Cache 블록이 늘어나고, 블록 풀이 바닥나면 vLLM은 가장 뒤늦게 들어온 요청부터 선점(preemption)합니다. 선점된 요청의 블록은 풀에 반납되고, 그 요청은 나중에 자리가 나면 KV Cache를 다시 계산해 이어갑니다(recompute). 즉 동시 처리량은 블록 예산이라는 천장까지만 올라가고, 그 너머는 선점으로 되돌아옵니다.

<br>

## 긴 프롬프트 하나가 모두를 멈춘다

continuous batching으로 빈자리 문제는 풀렸지만, 새 요청이 배치에 처음 합류할 때 한 가지 걸림돌이 남습니다. 바로 **prefill**입니다.

요청 처리는 두 단계로 나뉩니다. 프롬프트 전체를 한 번에 읽어 첫 토큰을 만드는 prefill, 그다음 토큰을 하나씩 만드는 decode. prefill은 프롬프트의 모든 토큰을 병렬로 계산하는 compute-bound 단계이고, decode는 토큰 하나를 만드는 memory-bound 단계입니다. 문제는 프롬프트가 길 때입니다. 8,000토큰짜리 프롬프트의 prefill은 연산량이 많아 한 스텝을 통째로 잡아먹습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 248" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="chunked prefill이 없을 때의 스텝 구성. 스텝 t와 t+2는 A B C의 decode로 채워지지만, 그 사이 스텝 t+1을 8000토큰짜리 긴 prefill이 통째로 차지해 기존 요청의 토큰 생성이 멈춥니다">
  <style>
    .cb3-title { fill: var(--text, #1c1917); font-size: 22px; }
    .cb3-step  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .cb3-dec   { fill: var(--primary, #0d9488); }
    .cb3-pre   { fill: var(--accent, #d97706); }
    .cb3-in    { fill: #ffffff; font-size: 17px; text-anchor: middle; }
    .cb3-note  { fill: var(--text-muted, #78716c); font-size: 17px; }
  </style>
  <text x="8" y="24" class="cb3-title">Chunked prefill이 없다면</text>
  <!-- 스텝 t -->
  <text x="8" y="71" class="cb3-step">스텝 t</text>
  <rect x="88" y="46" width="122" height="38" rx="4" class="cb3-dec"/><text x="149" y="71" class="cb3-in">decode A</text>
  <rect x="218" y="46" width="122" height="38" rx="4" class="cb3-dec"/><text x="279" y="71" class="cb3-in">decode B</text>
  <rect x="348" y="46" width="122" height="38" rx="4" class="cb3-dec"/><text x="409" y="71" class="cb3-in">decode C</text>
  <!-- 스텝 t+1: 긴 prefill이 스텝을 독점 -->
  <text x="8" y="119" class="cb3-step">스텝 t+1</text>
  <rect x="88" y="94" width="382" height="38" rx="4" class="cb3-pre"/>
  <text x="279" y="119" class="cb3-in">prefill X (8,000토큰 통째)</text>
  <!-- 스텝 t+2 -->
  <text x="8" y="167" class="cb3-step">스텝 t+2</text>
  <rect x="88" y="142" width="122" height="38" rx="4" class="cb3-dec"/><text x="149" y="167" class="cb3-in">decode A</text>
  <rect x="218" y="142" width="122" height="38" rx="4" class="cb3-dec"/><text x="279" y="167" class="cb3-in">decode B</text>
  <rect x="348" y="142" width="122" height="38" rx="4" class="cb3-dec"/><text x="409" y="167" class="cb3-in">decode C</text>
  <!-- 범례와 캡션 -->
  <rect x="88" y="192" width="18" height="14" rx="2" class="cb3-dec"/>
  <text x="114" y="204" class="cb3-note">decode (memory-bound)</text>
  <rect x="88" y="216" width="18" height="14" rx="2" class="cb3-pre"/>
  <text x="114" y="228" class="cb3-note">prefill (compute-bound)</text>
</svg>
</div>

새 요청 X의 긴 prefill이 스텝 t+1을 독점하는 동안, 이미 답을 받아보고 있던 A·B·C의 decode는 그 스텝에서 밀려납니다. 사용자 입장에서는 잘 나오던 토큰이 갑자기 한 박자 끊깁니다. 앞선 요청이 뒤에 온 긴 요청 때문에 멈추는, 전형적인 head-of-line blocking입니다.

여기엔 팽팽한 긴장이 있습니다. 새 요청의 첫 토큰이 나오기까지의 지연(TTFT, Time To First Token)을 줄이려면 prefill을 빨리 끝내야 하는데, 그러면 기존 요청들의 토큰 간 간격(ITL, Inter-Token Latency)이 그 스텝만큼 벌어집니다. 한쪽을 잡으면 다른 쪽이 늘어집니다.

<br>

## 긴 프롬프트를 잘라 섞는 Chunked Prefill

해법은 단순합니다. 긴 prefill을 한 스텝에 통째로 밀어 넣지 말고, **여러 조각으로 잘라** 여러 스텝에 나눠 처리하는 것입니다. 이것이 chunked prefill입니다(Sarathi-Serve, 2024). 그리고 잘라낸 prefill 청크를, 진행 중인 요청들의 decode와 **같은 스텝에 함께** 태웁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="chunked prefill을 적용한 스텝 구성. 스텝 t부터 t+3까지 매 스텝에 A와 B의 decode와 X의 prefill 청크가 함께 실려, 기존 요청의 토큰 생성이 끊기지 않습니다">
  <style>
    .cb4-title { fill: var(--text, #1c1917); font-size: 22px; }
    .cb4-step  { fill: var(--text-muted, #78716c); font-size: 17px; }
    .cb4-dec   { fill: var(--primary, #0d9488); }
    .cb4-pre   { fill: var(--accent, #d97706); }
    .cb4-in    { fill: #ffffff; font-size: 17px; text-anchor: middle; }
    .cb4-note  { fill: var(--text-muted, #78716c); font-size: 17px; }
  </style>
  <text x="8" y="24" class="cb4-title">Chunked prefill</text>
  <!-- 스텝 t -->
  <text x="8" y="71" class="cb4-step">스텝 t</text>
  <rect x="88" y="46" width="96" height="38" rx="4" class="cb4-dec"/><text x="136" y="71" class="cb4-in">decode A</text>
  <rect x="190" y="46" width="96" height="38" rx="4" class="cb4-dec"/><text x="238" y="71" class="cb4-in">decode B</text>
  <rect x="292" y="46" width="178" height="38" rx="4" class="cb4-pre"/><text x="381" y="71" class="cb4-in">X 청크 1/4</text>
  <!-- 스텝 t+1 -->
  <text x="8" y="117" class="cb4-step">스텝 t+1</text>
  <rect x="88" y="92" width="96" height="38" rx="4" class="cb4-dec"/><text x="136" y="117" class="cb4-in">decode A</text>
  <rect x="190" y="92" width="96" height="38" rx="4" class="cb4-dec"/><text x="238" y="117" class="cb4-in">decode B</text>
  <rect x="292" y="92" width="178" height="38" rx="4" class="cb4-pre"/><text x="381" y="117" class="cb4-in">X 청크 2/4</text>
  <!-- 스텝 t+2 -->
  <text x="8" y="163" class="cb4-step">스텝 t+2</text>
  <rect x="88" y="138" width="96" height="38" rx="4" class="cb4-dec"/><text x="136" y="163" class="cb4-in">decode A</text>
  <rect x="190" y="138" width="96" height="38" rx="4" class="cb4-dec"/><text x="238" y="163" class="cb4-in">decode B</text>
  <rect x="292" y="138" width="178" height="38" rx="4" class="cb4-pre"/><text x="381" y="163" class="cb4-in">X 청크 3/4</text>
  <!-- 스텝 t+3 -->
  <text x="8" y="209" class="cb4-step">스텝 t+3</text>
  <rect x="88" y="184" width="96" height="38" rx="4" class="cb4-dec"/><text x="136" y="209" class="cb4-in">decode A</text>
  <rect x="190" y="184" width="96" height="38" rx="4" class="cb4-dec"/><text x="238" y="209" class="cb4-in">decode B</text>
  <rect x="292" y="184" width="178" height="38" rx="4" class="cb4-pre"/><text x="381" y="209" class="cb4-in">X 청크 4/4</text>
  <!-- 범례와 캡션 -->
  <rect x="88" y="234" width="18" height="14" rx="2" class="cb4-dec"/>
  <text x="114" y="246" class="cb4-note">decode (memory-bound)</text>
  <rect x="88" y="258" width="18" height="14" rx="2" class="cb4-pre"/>
  <text x="114" y="270" class="cb4-note">prefill (compute-bound)</text>
</svg>
</div>

이제 X의 prefill이 진행되는 동안에도 A·B는 매 스텝 토큰을 하나씩 계속 만들어냅니다. 토큰이 끊기지 않습니다. head-of-line blocking이 사라진 것입니다.

여기엔 자원을 알뜰하게 쓰는 이득이 하나 더 딸려옵니다. compute-bound인 prefill 청크와 memory-bound인 decode를 한 스텝에 섞으면, GPU의 연산 유닛과 메모리 대역폭이 같은 스텝에 동시에 바쁘게 돌아갑니다. prefill만 있는 스텝은 대역폭이 놀고, decode만 있는 스텝은 연산 유닛이 놀았는데, 둘을 겹치면 양쪽을 함께 채우는 셈입니다.

물론 공짜는 아닙니다. prefill을 잘게 쪼갤수록 기존 decode의 끊김은 줄지만, prefill 자체는 조금 손해를 봅니다. 청크가 작아질수록 GPU가 한 번에 처리하는 연산량이 줄어 prefill의 계산 효율이 떨어지기 때문입니다. 그래서 청크를 얼마나 크게 자를지가 TTFT와 ITL 사이의 조절 손잡이가 됩니다.

:::tip

**팁**

vLLM V1에서 chunked prefill은 기본으로 켜져 있습니다. V0 시절 인터넷 자료에는 `enable_chunked_prefill` 플래그로 켜고 끄던 이야기가 나오지만, V1에서는 스케줄러에 내장돼 별도로 켤 필요가 없습니다.

:::

<br>

## 토큰 예산 하나로 굴러가는 V1 스케줄러

여기까지 continuous batching과 chunked prefill을 따로 설명했지만, vLLM V1은 이 둘을 **하나의 메커니즘**으로 통합했습니다. 그 중심에 토큰 예산(token budget)이 있습니다.

V1은 "이번 스텝은 prefill용, 다음 스텝은 decode용"처럼 스텝을 용도별로 나누던 구분을 없앴습니다. 정확히 말하면, "한 배치는 전부 prefill 아니면 전부 decode"라는 페이즈 경계가 사라진 것입니다. 대신 스텝마다 **처리할 토큰 수의 상한**(`max_num_batched_tokens`)을 하나 정해두고, 그 예산 안에서 어떤 요청에 토큰을 몇 개씩 줄지를 결정합니다. 스케줄 결과는 `{요청ID: 토큰 수}` 형태의 딕셔너리로 표현됩니다.

배분 순서에는 우선순위가 있습니다. 스케줄러는 먼저 진행 중인 요청(running 큐)의 decode부터 예산에 채웁니다. 그리고 남은 예산으로 대기 중인 요청(waiting 큐)의 prefill을 채우는데, 남은 예산에 다 안 들어가면 그만큼만 잘라서 넣습니다. 이 "잘라서 넣기"가 바로 chunked prefill입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 292" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="한 스텝의 토큰 예산 8192를 채우는 방식. 먼저 running 큐의 decode 요청 A B C가 1토큰씩 3토큰을 차지하고, 남은 예산으로 waiting 큐의 X가 2048토큰 prefill 청크를 채웁니다. 최종 스케줄 결과는 A 1, B 1, C 1, X 2048">
  <style>
    .cb5-title { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .cb5-dec   { fill: var(--primary, #0d9488); }
    .cb5-pre   { fill: var(--accent, #d97706); }
    .cb5-rest  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .cb5-leg   { fill: var(--text, #1c1917); font-size: 17px; }
    .cb5-muted { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .cb5-arrow { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#cb5Arrow); }
  </style>
  <defs>
    <marker id="cb5Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <text x="240" y="26" class="cb5-title">한 스텝의 토큰 예산 = 8,192</text>
  <!-- 예산 막대: decode / prefill 청크 / 남은 예산 -->
  <rect x="20" y="44" width="30" height="44" rx="4" class="cb5-dec"/>
  <rect x="50" y="44" width="100" height="44" class="cb5-pre"/>
  <rect x="150" y="44" width="310" height="44" rx="4" class="cb5-rest"/>
  <!-- 막대 구간 설명 -->
  <rect x="20" y="104" width="18" height="14" rx="2" class="cb5-dec"/>
  <text x="46" y="116" class="cb5-leg">decode A·B·C = 3토큰</text>
  <rect x="20" y="128" width="18" height="14" rx="2" class="cb5-pre"/>
  <text x="46" y="140" class="cb5-leg">X 청크 = 2,048토큰</text>
  <rect x="20" y="152" width="18" height="14" rx="2" class="cb5-rest"/>
  <text x="46" y="164" class="cb5-leg">남은 예산 = 6,141토큰</text>
  <path d="M240,180 L240,200" class="cb5-arrow"/>
  <!-- 스케줄 결과 -->
  <rect x="70" y="208" width="340" height="42" rx="8" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <text x="240" y="235" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20px" text-anchor="middle" fill="var(--text, #1c1917)">{ A:1, B:1, C:1, X:2048 }</text>
  <text x="240" y="276" class="cb5-muted">이 조합을 한 번의 forward pass로 실행</text>
</svg>
</div>

이 그림 하나에 두 기법이 다 들어 있습니다. 매 스텝 배치를 새로 짜서 decode 요청을 채우는 것이 continuous batching이고, 긴 prefill이 예산에 안 맞아 잘려 들어가는 것이 chunked prefill입니다. 스케줄러는 그저 매 스텝 토큰 예산을 채울 뿐인데, 그 결과로 두 기법이 함께 굴러갑니다.

주의할 점은, 페이즈 경계가 사라졌다고 해서 prefill과 decode의 구분 자체가 없어진 게 아니라는 것입니다. running과 waiting 큐는 여전히 따로 있고, decode가 예산을 먼저 가져갑니다. 사라진 것은 "한 스텝에는 한 종류만"이라는 제약이지, 두 작업의 성격 차이가 아닙니다.

<br>

## 스케줄러를 조율하는 두 손잡이

스케줄러의 동작을 이해하면, vLLM 서버를 띄울 때 넘기는 두 인자가 각각 무엇을 바꾸는지가 분명해집니다.

| 인자 | 무엇을 정하나 | 키우면 |
|---|---|---|
| **`max_num_batched_tokens`** | 한 스텝에 처리할 총 토큰 수. prefill 청크가 커질 수 있는 상한이기도 함 | prefill을 크게 삼켜 TTFT·처리량이 올라가고, 대신 decode 끊김(ITL)이 커질 여지가 생김 |
| **`max_num_seqs`** | 한 스텝에 올릴 수 있는 최대 시퀀스(요청) 수 | 동시 처리량이 올라감. 단 블록 예산 한도 안에서만 |

`max_num_batched_tokens`는 곧 청크 크기의 상한입니다. 이 값을 작게(예: 2,048) 잡으면 긴 prefill이 잘게 쪼개져 기존 요청의 ITL이 매끄러워지고, 크게 잡으면 prefill을 한 번에 많이 삼켜 TTFT와 전체 처리량이 좋아집니다. TTFT와 ITL 사이의 긴장을 조절하는 손잡이가 바로 이 값입니다.

`max_num_seqs`는 배치에 동시에 올릴 요청 수의 상한입니다. 다만 이 값을 키운다고 처리량이 끝없이 오르지는 않습니다. 동시 요청 수는 블록 예산이라는 천장까지만 실제로 올라가고, 그 너머는 선점으로 되돌아오기 때문입니다. 두 값 모두 하드웨어와 모델, 트래픽 특성에 따라 적정선이 달라지므로, 무엇을 우선할지(지연이냐 처리량이냐)를 정한 다음 거기에 맞춰가야 합니다.

<br>

## 마치며

continuous batching과 chunked prefill은 결국 하나의 질문에 대한 답입니다. 한정된 GPU를 매 스텝 어떤 요청들로 채울 것인가. vLLM V1은 이 질문을 토큰 예산 하나로 환원해서, 끝난 요청을 즉시 갈아 끼우고 긴 prefill을 잘라 섞는 일을 같은 스케줄러 안에서 처리합니다.

그런데 지금까지는 요청들이 저마다 다른 프롬프트를 들고 온다고 가정했습니다. 각자 자기 블록을 따로 쌓고, 스케줄러는 그 블록들을 나눠 줄 뿐이었죠. 만약 여러 요청이 **똑같은 프롬프트로 시작**한다면 어떨까요? 같은 KV를 요청마다 새로 만드는 건 낭비입니다. 다음 글에서는 이 공통 부분을 재사용하는 prefix caching과, 그 아이디어를 트리로 밀어붙인 SGLang의 RadixAttention을 살펴봅니다.

<br>

## 함께 보면 좋은 글

- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [vLLM의 핵심 원리 PagedAttention 파헤치기](/llm/paged-attention/)

<br>

## 참고자료

- [Orca: A Distributed Serving System for Transformer-Based Generative Models (OSDI 2022)](https://www.usenix.org/conference/osdi22/presentation/yu)
- [Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve (arXiv 2403.02310)](https://arxiv.org/abs/2403.02310)
- [vLLM V1: A Major Upgrade to vLLM's Core Architecture (vLLM Blog)](https://vllm.ai/blog/2025-01-27-v1-alpha-release)
- [Inside vLLM: Anatomy of a High-Throughput LLM Inference System (vLLM Blog)](https://vllm.ai/blog/2025-09-05-anatomy-of-vllm)
- [Optimization and Tuning (vLLM Documentation)](https://docs.vllm.ai/en/stable/configuration/optimization/)
