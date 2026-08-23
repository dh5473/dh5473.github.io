---
date: '2026-08-23'
title: 'LLM은 왜 가장 확률 높은 토큰을 고르지 않을까'
category: 'LLM'
series: 'llm'
seriesOrder: 4
tags: ['LLM', 'Sampling', 'Temperature', 'Top-p', 'Beam Search']
summary: 'LLM이 내놓는 확률 분포에서 토큰을 고르는 방법을 greedy와 beam search의 실패에서부터 따라갑니다. 최빈값이 반복으로 무너지는 이유, top-p와 temperature가 분포의 어디를 손대는지, 추론 모델이 greedy를 피하는 이유를 정리합니다.'
thumbnail: './thumbnail.png'
---

DeepSeek-R1의 모델 카드는 temperature를 0.6으로 두라고 권하고 Qwen3는 거기에 top-p 0.95를 얹으라고 적어 둡니다. 다들 이 값을 복사해 쓰지만 왜 그 값인지, 그보다 먼저 왜 모델이 가장 확률 높은 토큰을 그냥 고르지 않는지는 설명하기 어렵습니다. 확률을 가장 높게 매긴 토큰은 모델이 가장 자신 있는 답일 텐데, 그것을 매번 고르면 안 되는 이유가 있을까요.

LLM은 매 스텝 어휘 항목마다 점수(logit)를 매기고 그 점수를 합이 1인 확률로 바꾸는 softmax로 어휘 전체의 확률 분포를 만듭니다. 이 글은 그다음 단계, 그 분포에서 무엇을 뽑을지 정하는 자리를 다룹니다. 생성 과정을 설명할 때 "greedy든 sampling이든"이라고 한 줄로 넘기기 쉬운 자리인데, 그 한 줄 안에 모델 밖에서 결정되는 설계가 꽤 들어 있습니다.

순서는 이렇습니다. 가장 그럴듯한 문장을 찾으려는 시도가 무엇에 막혔는지에서 출발합니다. 그다음 분포에서 뽑되 꼬리를 자르는 방법과 temperature가 각각 분포의 어디를 손대는지를 봅니다. 이어서 무작위를 들인 대가와 2026년의 추론 모델들이 샘플링 쪽으로 기운 이유까지 갑니다.

<br>

## 가장 그럴듯한 문장을 찾으면 안 될까

가장 단순한 선택은 매 스텝 확률이 가장 높은 토큰을 고르는 것입니다. greedy decoding이라 부르죠. 그런데 이 방법은 가장 확률 높은 **문장**, 즉 분포의 최빈값(mode)을 찾아 주지 않습니다. 문장의 확률은 토큰 확률의 곱이라 첫 스텝에서 조금 낮은 토큰을 골랐을 때 뒤가 훨씬 좋은 경우가 얼마든지 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 440 310" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="두 스텝짜리 생성 트리로 각 노드 아래 최선 가지만 표시했습니다. 첫 스텝 후보는 A 0.5, B 0.3, C 0.2이고 A 아래 최선은 0.4, B 아래는 0.9, C 아래는 0.5입니다. greedy는 A를 골라 경로 확률 0.20에 도착하고, 확률이 가장 높은 경로는 B를 거치는 0.27입니다.">
  <style>
    .gs2-ed { stroke: var(--border, #e7e5e4); stroke-width: 2; fill: none; }
    .gs2-gr { stroke: var(--accent, #9d5604); stroke-width: 3.5; fill: none; }
    .gs2-md { stroke: var(--primary, #0a756c); stroke-width: 3.5; fill: none; }
    .gs2-nd { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs2-t  { fill: var(--text, #1c1917); font-size: 18px; text-anchor: middle; font-weight: 700; }
    .gs2-p  { fill: var(--text-muted, #6d6762); font-size: 16px; text-anchor: middle; }
    .gs2-n  { fill: var(--text-muted, #6d6762); font-size: 16px; text-anchor: end; }
    .gs2-lg { fill: var(--accent, #9d5604); font-size: 18px; }
    .gs2-lm { fill: var(--primary, #0a756c); font-size: 18px; }
  </style>
  <text x="420" y="18" class="gs2-n">각 노드 아래 최선 가지만 표시</text>
  <!-- 1단계 간선 -->
  <line x1="220" y1="56" x2="340" y2="114" class="gs2-ed"/>
  <line x1="220" y1="56" x2="100" y2="114" class="gs2-gr"/>
  <line x1="220" y1="56" x2="220" y2="114" class="gs2-md"/>
  <!-- 2단계 간선 -->
  <line x1="340" y1="146" x2="340" y2="210" class="gs2-ed"/>
  <line x1="100" y1="146" x2="100" y2="210" class="gs2-gr"/>
  <line x1="220" y1="146" x2="220" y2="210" class="gs2-md"/>
  <!-- 노드 -->
  <rect x="190" y="24" width="60" height="32" rx="6" class="gs2-nd"/>
  <text x="220" y="46" class="gs2-t">시작</text>
  <rect x="78" y="114" width="44" height="32" rx="6" class="gs2-nd"/>
  <text x="100" y="136" class="gs2-t">A</text>
  <rect x="198" y="114" width="44" height="32" rx="6" class="gs2-nd"/>
  <text x="220" y="136" class="gs2-t">B</text>
  <rect x="318" y="114" width="44" height="32" rx="6" class="gs2-nd"/>
  <text x="340" y="136" class="gs2-t">C</text>
  <rect x="74" y="210" width="52" height="32" rx="6" class="gs2-nd"/>
  <text x="100" y="232" class="gs2-t">0.4</text>
  <rect x="194" y="210" width="52" height="32" rx="6" class="gs2-nd"/>
  <text x="220" y="232" class="gs2-t">0.9</text>
  <rect x="314" y="210" width="52" height="32" rx="6" class="gs2-nd"/>
  <text x="340" y="232" class="gs2-t">0.5</text>
  <!-- 1단계 확률 -->
  <text x="146" y="80" class="gs2-p">0.5</text>
  <text x="238" y="90" class="gs2-p">0.3</text>
  <text x="296" y="80" class="gs2-p">0.2</text>
  <!-- 경로 요약 -->
  <text x="20" y="274" class="gs2-lg">greedy 경로  0.5 × 0.4 = 0.20</text>
  <text x="20" y="298" class="gs2-lm">최빈값 경로  0.3 × 0.9 = 0.27</text>
</svg>
</div>

위 그림에서 greedy는 첫 스텝에 A(0.5)를 고르고 그 아래 최선인 0.4를 이어 확률 0.20짜리 경로에 도착합니다. B(0.3) 뒤에는 0.9가 기다리고 있어 경로 확률이 0.27로 더 높지만, 첫 스텝에서 B가 A보다 낮으니 greedy는 그 길을 영영 보지 못합니다.

문장 전체의 점수는 보통 확률의 곱 대신 로그 확률의 합으로 씁니다. 확률 수백 개를 곱하면 부동소수점이 0으로 무너지기 때문입니다.

```text
score(y) = log P(y_1) + log P(y_2 | y_1) + ... + log P(y_n | y_1, ..., y_n-1)
```

이 점수를 최대로 만드는 문장이 최빈값인데, 후보가 너무 많습니다. 어휘 $|V|$개를 $n$스텝 이어 붙이면 경우의 수가 $|V|^n$이라 전부 셀 수 없습니다. 그래서 오래된 타협안이 **beam search**였습니다. 매 스텝 점수 상위 $B$개 경로만 남기고 나머지는 버립니다. 남기는 경로 수 $B$를 빔 폭이라 부르고 음성 인식과 기계 번역이 내내 이 방법으로 후보를 골랐고요. 위 그림에서도 $B=2$면 A와 B를 둘 다 들고 가다가 다음 스텝에 0.27을 발견합니다.

그러니 빔 폭을 키울수록 최빈값에 가까워지고 결과도 좋아져야 합니다. 기계 번역에서는 반대가 관찰됐습니다. 빔을 키우면 어느 지점부터 번역 품질 점수 BLEU(정답 번역과 겹치는 정도, 높을수록 좋음)가 떨어지는 현상인데, 2017년 Koehn과 Knowles가 신경망 기계 번역의 여섯 가지 난제 중 하나로 꼽았을 만큼 잘 알려진 문제였습니다. 당시에도 모델이 짧은 번역을 선호하는 편향이 원인으로 지목됐지만, 이것이 탐색 부족이 아니라 모델 자체의 문제라는 점이 가장 분명하게 드러난 것은 2019년 Stahlberg와 Byrne이 탐색을 끝까지 밀어붙였을 때였습니다.

두 사람은 Transformer 번역 모델에서 깊이 우선 탐색으로 진짜 최빈값을 찾아봤습니다. 기계 번역 벤치마크 WMT의 영어-독일어 테스트셋 문장 51.8%에서 모델이 가장 높은 점수를 준 번역이 **빈 문장**이었습니다. 정확 탐색의 BLEU는 2.1, 빔 10은 30.3이었고요. 빔 10이 찾은 번역은 57.7%가 최빈값이 아니었고 빔 100으로 넓혀도 53.6%였는데, 번역이 쓸 만했던 것은 바로 그 탐색 실패 덕분이었습니다. 저자들의 표현을 빌리면 신경망 번역은 딱 적당한 양의 탐색 오류에 기대어 작동하고 있었습니다.

번역은 그래도 답이 정해진 작업입니다. 이야기를 이어 쓰는 것처럼 답이 열린 생성에서는 최빈값을 향해 가는 디코딩이 다른 방식으로 무너지는데, 반복입니다. Holtzman 연구진이 2019년 GPT-2(7.6억 파라미터)로 최대 200토큰씩 5,000편을 생성해 봤더니 greedy 출력의 73.66%, 빔 16 출력의 28.94%가 같은 구절을 세 번 이상 되풀이하며 끝났습니다. 사람이 쓴 글에서는 0.28%죠. 빔을 키우면 이 비율이 줄긴 하는데 출력이 짧아져서 생기는 효과가 크고 어느 쪽이든 사람 글의 백 배가 넘고요. 같은 연구진이 구절이 되풀이될 때마다 다음 반복의 확률을 재 보니 횟수가 늘수록 확률이 올라갔습니다. 반복은 한 번 시작되면 스스로 강해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 380" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="토큰 위치 20개에 걸친 토큰 확률 궤적 두 개를 같은 축척으로 비교한 모식도. 위쪽 beam search 출력은 8번째 토큰부터 같은 구절을 반복하며 확률이 0.9 위에 붙어 있고, 아래쪽 사람이 쓴 글은 확률이 0.05와 0.9 사이를 오르내립니다.">
  <style>
    .gs1-hA  { fill: var(--accent, #9d5604); font-size: 18px; }
    .gs1-hB  { fill: var(--primary, #0a756c); font-size: 18px; }
    .gs1-ax  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs1-lA  { stroke: var(--accent, #9d5604); stroke-width: 2.5; fill: none; }
    .gs1-lB  { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
    .gs1-rp  { fill: var(--bg-warn, #fffbeb); }
    .gs1-lab { fill: var(--text-muted, #6d6762); font-size: 18px; }
    .gs1-lr  { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: end; }
  </style>
  <!-- 위: beam search -->
  <text x="20" y="28" class="gs1-hA">beam search 출력</text>
  <rect x="201" y="40" width="259" height="120" class="gs1-rp"/>
  <line x1="50" y1="40" x2="50" y2="160" class="gs1-ax"/>
  <line x1="50" y1="160" x2="460" y2="160" class="gs1-ax"/>
  <text x="44" y="46" class="gs1-lr">1.0</text>
  <text x="44" y="164" class="gs1-lr">0</text>
  <polyline points="50,88 71.6,73.6 93.2,94 114.7,64 136.3,52 157.9,58 179.5,48.4 201.1,49.6 222.6,46 244.2,43.6 265.8,44.8 287.4,42.4 308.9,43.6 330.5,42.4 352.1,42.4 373.7,43.6 395.3,42.4 416.8,42.4 438.4,43.6 460,42.4" class="gs1-lA"/>
  <text x="460" y="182" class="gs1-lr">8번째부터 같은 구절 반복</text>
  <!-- 아래: 사람 글 -->
  <text x="20" y="218" class="gs1-hB">사람이 쓴 글</text>
  <line x1="50" y1="230" x2="50" y2="350" class="gs1-ax"/>
  <line x1="50" y1="350" x2="460" y2="350" class="gs1-ax"/>
  <text x="44" y="236" class="gs1-lr">1.0</text>
  <text x="44" y="354" class="gs1-lr">0</text>
  <polyline points="50,314 71.6,344 93.2,278 114.7,326 136.3,340.4 157.9,242 179.5,302 201.1,332 222.6,266 244.2,338 265.8,308 287.4,344 308.9,284 330.5,320 352.1,254 373.7,335.6 395.3,296 416.8,326 438.4,278 460,314" class="gs1-lB"/>
  <text x="50" y="374" class="gs1-lab">토큰 위치 1 → 20 · 모델이 매긴 확률 · 모식도</text>
</svg>
</div>

위 그림은 beam search 출력과 사람이 쓴 글을 같은 모델로 채점한 토큰 확률 궤적입니다. beam search 출력은 반복에 들어선 뒤로 토큰 확률이 0.9 위에 붙어 있습니다. 한 토큰씩 보면 모델이 확신하는 선택만 이어진 셈이죠. 사람이 쓴 글에서는 확률이 0.1 아래로 떨어지는 토큰이 자주 나옵니다. perplexity는 모델이 매 위치 후보 몇 개 중에서 고르는 셈인지를 나타냅니다. 이 값으로 재면 빔 16 출력은 1.48, 사람 글은 12.38이었습니다. 모델 눈에 사람 글은 평균적으로 후보 열두 개 중 하나를 고르는 정도로 예측하기 어려운 글인 셈인데, 모델이 보기에 가장 그럴듯한 글은 사람이 쓴 글과 닮지 않았습니다.

왜 그런지는 아직 설명이 갈립니다. Holtzman 연구진은 사람이 뻔한 말을 피한다는 언어 사용의 규범을 들었고, Meister 연구진은 2020년에 질문을 뒤집었습니다. 사람 글이 정보 밀도를 고르게 유지한다는 성질을 beam search가 우연히 흉내 내기 때문에 적당히 작동한다는 해석입니다. 학습 목적함수가 토큰 단위 확률만 맞추게 돼 있어 문장 단위 품질과 어긋난다는 설명도 있고요.

확립된 것은 현상 쪽입니다. 최대우도로 학습된 모델의 분포에서 최빈값을 향해 가면 긴 생성은 반복으로, 번역은 빈 문장으로 흐릅니다. 번역에서는 정확 탐색으로, 열린 생성에서는 빔을 키울수록 perplexity가 사람 글에서 더 멀어지는 것으로 확인됐습니다. greedy가 최빈값을 못 찾는 것은 문제의 절반이고, 나머지 절반은 최빈값 쪽으로 가는 것 자체가 해롭다는 점입니다. 다만 이 수치에는 단서가 붙습니다. 사전학습만 거친 base 모델에서 잰 값이라서 후속 학습을 거친 챗 모델은 짧은 답에서는 greedy로도 멀쩡하게 말하거든요. 문제가 두드러지는 것은 긴 생성과 base 모델, 그리고 답하기 전에 긴 사고 과정을 먼저 생성하는 추론(reasoning) 모델입니다.

<br>

## 분포에서 뽑되 꼬리는 자른다

최빈값을 찾는 대신 분포에서 뽑으면 어떨까요. 모델이 매긴 확률 그대로 주사위를 굴리는 것, 그러니까 0.5짜리 토큰은 절반의 확률로 고르는 방식입니다. 모델의 분포를 정확히 믿는 선택이죠. Holtzman 연구진의 같은 실험에서 이 순수 샘플링은 반복률이 0.22%로 사람 글보다도 낮았습니다. 대신 perplexity가 22.73으로 사람 글의 두 배 가까이 올랐습니다. 사람보다 훨씬 예측하기 어려운 글, 읽어 보면 앞뒤가 맞지 않는 글이 나온다는 뜻입니다.

원인은 분포의 꼬리에 있습니다. 어휘가 10만 개를 넘으니 상위 백 개 남짓이 확률 대부분을 가져가도 나머지가 십만 개 넘게 남습니다. 그 토큰이 조금씩 나눠 갖는 확률 질량은 무시할 수 없는 크기가 됩니다.

```text
가상의 한 스텝: 상위 100개 토큰이 확률 0.95, 나머지 약 128,000개가 0.05를 나눠 가짐
한 스텝에서 꼬리 토큰이 뽑힐 확률      0.05
20스텝 안에 한 번이라도 뽑힐 확률   1 − 0.95^20 ≈ 64%
```

문제는 그 한 번입니다. 뽑힌 토큰은 다음 스텝의 조건이 됩니다. 엉뚱한 토큰이 한 번 들어가면 모델은 그 엉뚱한 문맥에 맞춰 다음을 예측하고 오류는 되돌아오지 않고 쌓입니다. 학습 때는 늘 사람이 쓴 올바른 문맥만 조건으로 받던 모델이 자기가 만든 문맥을 처음 받는 순간이기도 하고요.

꼬리의 확률이 믿을 만하지 않은 데는 구조적인 이유가 있습니다. logit은 모델 마지막 층이 내놓은 벡터 $h_t$(hidden state)에 어휘 수만큼 행을 가진 행렬 $W_U$(lm_head)를 곱한 $W_U h_t$로 나오고 $h_t$의 길이가 모델 폭 $d_{\text{model}}$입니다. Llama 3 8B처럼 어휘가 12만 8천 개에 $d_{\text{model}}$이 4,096이면 logit 12만 8천 개가 4,096차원짜리 벡터 하나에서 선형으로 뻗어 나온 값이라, 토큰마다 독립적으로 확률을 매길 자유도가 없습니다. 이 제약을 softmax bottleneck이라 부릅니다. Finlayson 연구진은 2024년에 이 제약 아래에서 모델의 로그 확률 오차가 일정 한도 안이라면 그 한도에 맞춘 임계값 절단이 진짜 확률이 0인 토큰을 모두 걸러낸다는 것을 증명했습니다. 경험적으로 잘 먹히던 절단에 softmax bottleneck 관점에서 붙은 형식적 근거입니다. 같은 논문은 임계값이 거친 기준이라 멀쩡한 토큰도 함께 버린다는 한계도 짚었습니다.

절단의 첫 형태는 top-k입니다. 2018년 Fan 연구진이 이야기 생성에 쓴 방법으로, 확률 상위 $k$개(원 논문은 10개)만 남기고 그 안에서 다시 정규화해 뽑습니다. 단순하지만 $k$가 고정이라 분포 모양을 무시합니다. 다음 토큰이 거의 정해진 자리에서는 $k=40$이 쓸모없는 후보 39개를 살려 두고, 후보가 수백 개인 자리에서는 멀쩡한 후보를 잘라 버리죠.

Holtzman 연구진이 제안한 nucleus sampling, 흔히 top-p라 부르는 방법은 개수 대신 확률 질량으로 자릅니다. 확률 높은 순으로 더해 가다가 누적 확률이 $p$를 처음 넘는 지점까지만 남기는 것입니다. 남는 개수는 스텝마다 달라져 한 개에서 천 개 사이를 오갑니다. min-p는 기준을 다시 바꿔 최대 확률의 일정 비율에 못 미치는 토큰을 자릅니다. llama.cpp 커뮤니티에서 먼저 구현돼 퍼진 뒤 2024년에 논문으로 정리됐습니다.

```text
top-k  : 확률 상위 k개
top-p  : 누적 확률이 p를 넘는 지점까지 (nucleus)
min-p  : 확률 ≥ (min-p 값) × 최대 확률
```

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="후보 열 개짜리 분포 두 개에 top-k, top-p, min-p 절단을 적용한 결과. 뾰족한 분포에서는 세 방법이 3개에서 4개를 남겨 비슷하지만, 평평한 분포에서는 top-k 3이 확률 질량 0.42만 남기고 top-p 0.9는 8개, min-p 0.1은 10개 전부를 남깁니다.">
  <style>
    .gs3-bar  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs3-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs3-hA   { fill: var(--primary, #0a756c); font-size: 18px; }
    .gs3-hB   { fill: var(--accent, #9d5604); font-size: 18px; }
    .gs3-cut  { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 4; }
    .gs3-lab  { fill: var(--text-muted, #6d6762); font-size: 18px; }
    .gs3-lr   { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: end; }
    .gs3-v    { fill: var(--text, #1c1917); font-size: 18px; }
  </style>
  <!-- 위: 뾰족한 분포 -->
  <text x="20" y="28" class="gs3-hA">뾰족한 분포 · perplexity 3.6</text>
  <rect x="20" y="54" width="30" height="96" class="gs3-bar"/>
  <rect x="64" y="118" width="30" height="32" class="gs3-bar"/>
  <rect x="108" y="137.2" width="30" height="12.8" class="gs3-bar"/>
  <rect x="152" y="143.6" width="30" height="6.4" class="gs3-bar"/>
  <rect x="196" y="145.2" width="30" height="4.8" class="gs3-bar"/>
  <rect x="240" y="146.8" width="30" height="3.2" class="gs3-bar"/>
  <rect x="284" y="148.4" width="30" height="1.6" class="gs3-bar"/>
  <rect x="328" y="148.4" width="30" height="1.6" class="gs3-bar"/>
  <rect x="372" y="149" width="30" height="1" class="gs3-bar"/>
  <rect x="416" y="149" width="30" height="1" class="gs3-bar"/>
  <line x1="20" y1="150" x2="460" y2="150" class="gs3-axis"/>
  <text x="56" y="66" class="gs3-v">0.60</text>
  <line x1="145" y1="60" x2="145" y2="150" class="gs3-cut"/>
  <text x="150" y="76" class="gs3-lab">top-k 3 · min-p 0.1</text>
  <line x1="189" y1="100" x2="189" y2="150" class="gs3-cut"/>
  <text x="194" y="116" class="gs3-lab">top-p 0.9</text>
  <!-- 아래: 평평한 분포 -->
  <text x="20" y="218" class="gs3-hB">평평한 분포 · perplexity 9.3</text>
  <rect x="20" y="316" width="30" height="24" class="gs3-bar"/>
  <rect x="64" y="317.6" width="30" height="22.4" class="gs3-bar"/>
  <rect x="108" y="319.2" width="30" height="20.8" class="gs3-bar"/>
  <rect x="152" y="320.8" width="30" height="19.2" class="gs3-bar"/>
  <rect x="196" y="322.4" width="30" height="17.6" class="gs3-bar"/>
  <rect x="240" y="324" width="30" height="16" class="gs3-bar"/>
  <rect x="284" y="325.6" width="30" height="14.4" class="gs3-bar"/>
  <rect x="328" y="328.8" width="30" height="11.2" class="gs3-bar"/>
  <rect x="372" y="332" width="30" height="8" class="gs3-bar"/>
  <rect x="416" y="333.6" width="30" height="6.4" class="gs3-bar"/>
  <line x1="20" y1="340" x2="460" y2="340" class="gs3-axis"/>
  <text x="56" y="312" class="gs3-v">0.15</text>
  <line x1="145" y1="250" x2="145" y2="340" class="gs3-cut"/>
  <text x="150" y="266" class="gs3-lab">top-k 3 · 질량 0.42</text>
  <line x1="365" y1="270" x2="365" y2="340" class="gs3-cut"/>
  <text x="360" y="286" class="gs3-lr">top-p 0.9 · 8개</text>
  <text x="20" y="372" class="gs3-lab">min-p 0.1 → 10개 전부</text>
</svg>
</div>

위 그림은 같은 세 기준을 모양이 다른 두 분포에 적용한 결과입니다. 그림의 perplexity는 그 스텝의 분포가 후보 몇 개짜리 균등 분포만큼 퍼졌는지를 나타냅니다. 뾰족한 분포에서는 셋이 3개에서 4개로 비슷합니다. 평평한 분포에서는 갈립니다. top-k 3은 질량 0.42만 남겨 멀쩡한 후보 일곱 개를 버리고, top-p 0.9는 여덟 개, min-p 0.1은 열 개를 전부 남깁니다. 후보가 고르게 퍼진 자리는 모델이 무엇이 와도 된다고 말하는 자리이니 많이 남기는 쪽이 분포의 뜻에 가깝습니다. 다만 이 그림은 세 기준이 분포의 무엇을 보는지의 차이이지 어느 것이 낫다는 결과는 아닙니다.

Holtzman 실험에서 $p=0.95$인 nucleus sampling은 perplexity 13.13, 반복률 0.36%로 사람 글(12.38, 0.28%)에 가장 가까웠습니다. 사람 평가와 모델 확률을 함께 쓰는 종합 점수에서도 가장 높았고요. 절단 샘플링이 이후 몇 년간 기본값이 될 때 가장 자주 인용된 근거가 이 실험입니다.

min-p는 그 뒤를 잇는 후보로 vLLM, llama.cpp, HuggingFace에 전부 구현이 들어갔습니다. 그런데 2025년 재분석은 원 논문의 사람 평가 데이터를 다시 뜯어보고 벤치마크를 전수로 다시 돌려, 비교 조건을 맞추면(양쪽이 같은 수의 하이퍼파라미터를 탐색하면) top-p 대비 우위가 사라진다고 보고했습니다. Qwen3 권장값에서도 min-p는 0, 그러니까 꺼진 채고요. 엔진에 들어갔다는 것과 기본값이 됐다는 것은 다른 이야기라 2026년 현재 min-p는 켤 수 있는 옵션으로 남아 있고 기본값은 여전히 top-p입니다.

절단은 구현 수준에서 보면 남길 토큰 밖의 logit을 $-\infty$로 덮는 마스킹입니다. 마스크를 확률이 아니라 문법이 정하면 JSON 스키마 같은 형식을 강제하는 structured output이 되고요. 같은 자리에 다른 규칙을 꽂은 것입니다.

<br>

## temperature가 손대는 것

절단이 어느 토큰을 후보에 남길지를 정한다면 temperature는 남은 후보 사이의 격차를 정합니다. softmax에 나눗셈 하나를 넣는 것이 전부입니다.

$$
p_i = \frac{\exp(z_i / T)}{\sum_{j=1}^{|V|} \exp(z_j / T)}
$$

$z_i$는 토큰 $i$의 logit, $|V|$는 어휘 크기, $T$가 temperature입니다. $T=1$이면 보통의 softmax라 모델이 학습한 분포가 그대로 나옵니다. $T$를 1보다 작게 두면 logit 사이의 차이가 확대되어 큰 값이 더 커지고, 0에 가까워지면 최대 logit 하나가 확률을 전부 가져가 greedy와 같아집니다(구현은 0을 나눗셈 대신 argmax로 처리합니다). 반대로 키우면 차이가 줄어들고 무한대에서는 균등 분포가 됩니다. 어텐션이 점수를 키 벡터 차원의 제곱근 $\sqrt{d_k}$로 나누는 것과 같은 산수인데, 거기서는 softmax가 한 항목에 확률을 몰아주는 포화를 막으려고 나눴고 여기서는 그 포화의 정도를 고르려고 나눕니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 540" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 logit 열 개를 temperature 0.5, 1, 2로 softmax한 세 분포를 같은 축척으로 비교한 그림. 막대 순서는 셋 다 같고 격차만 달라서, 1위 확률이 0.82, 0.51, 0.28로 내려가고 perplexity는 1.9, 4.7, 8.1로 올라갑니다.">
  <style>
    .gs4-bar  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs4-top  { fill: var(--primary, #0a756c); stroke: none; }
    .gs4-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs4-h    { fill: var(--text, #1c1917); font-size: 18px; font-weight: 700; }
    .gs4-lab  { fill: var(--text-muted, #6d6762); font-size: 18px; }
    .gs4-lr   { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: end; }
  </style>
  <!-- T = 0.5 -->
  <text x="20" y="28" class="gs4-h">T = 0.5 · perplexity 1.9</text>
  <text x="460" y="28" class="gs4-lr">같은 logit 열 개</text>
  <rect x="20" y="51.4" width="30" height="98.6" class="gs4-top"/>
  <rect x="64" y="136.7" width="30" height="13.3" class="gs4-bar"/>
  <rect x="108" y="145.1" width="30" height="4.9" class="gs4-bar"/>
  <rect x="152" y="148.2" width="30" height="1.8" class="gs4-bar"/>
  <rect x="196" y="149" width="30" height="1" class="gs4-bar"/>
  <rect x="240" y="149" width="30" height="1" class="gs4-bar"/>
  <rect x="284" y="149" width="30" height="1" class="gs4-bar"/>
  <rect x="328" y="149" width="30" height="1" class="gs4-bar"/>
  <rect x="372" y="149" width="30" height="1" class="gs4-bar"/>
  <rect x="416" y="149" width="30" height="1" class="gs4-bar"/>
  <line x1="20" y1="150" x2="460" y2="150" class="gs4-axis"/>
  <text x="56" y="62" class="gs4-lab">0.82</text>
  <!-- T = 1 -->
  <text x="20" y="208" class="gs4-h">T = 1 · perplexity 4.7</text>
  <text x="460" y="208" class="gs4-lr">순위 동일</text>
  <rect x="20" y="269.3" width="30" height="60.7" class="gs4-top"/>
  <rect x="64" y="307.7" width="30" height="22.3" class="gs4-bar"/>
  <rect x="108" y="316.4" width="30" height="13.6" class="gs4-bar"/>
  <rect x="152" y="321.7" width="30" height="8.3" class="gs4-bar"/>
  <rect x="196" y="325" width="30" height="5" class="gs4-bar"/>
  <rect x="240" y="327" width="30" height="3" class="gs4-bar"/>
  <rect x="284" y="327" width="30" height="3" class="gs4-bar"/>
  <rect x="328" y="328.2" width="30" height="1.8" class="gs4-bar"/>
  <rect x="372" y="328.9" width="30" height="1.1" class="gs4-bar"/>
  <rect x="416" y="328.9" width="30" height="1.1" class="gs4-bar"/>
  <line x1="20" y1="330" x2="460" y2="330" class="gs4-axis"/>
  <text x="56" y="280" class="gs4-lab">0.51</text>
  <!-- T = 2 -->
  <text x="20" y="388" class="gs4-h">T = 2 · perplexity 8.1</text>
  <text x="460" y="388" class="gs4-lr">순위 동일</text>
  <rect x="20" y="476.9" width="30" height="33.1" class="gs4-top"/>
  <rect x="64" y="490" width="30" height="20" class="gs4-bar"/>
  <rect x="108" y="494.4" width="30" height="15.6" class="gs4-bar"/>
  <rect x="152" y="497.8" width="30" height="12.2" class="gs4-bar"/>
  <rect x="196" y="500.5" width="30" height="9.5" class="gs4-bar"/>
  <rect x="240" y="502.6" width="30" height="7.4" class="gs4-bar"/>
  <rect x="284" y="502.6" width="30" height="7.4" class="gs4-bar"/>
  <rect x="328" y="504.2" width="30" height="5.8" class="gs4-bar"/>
  <rect x="372" y="505.6" width="30" height="4.4" class="gs4-bar"/>
  <rect x="416" y="505.6" width="30" height="4.4" class="gs4-bar"/>
  <line x1="20" y1="510" x2="460" y2="510" class="gs4-axis"/>
  <text x="56" y="488" class="gs4-lab">0.28</text>
</svg>
</div>

같은 logit 열 개를 세 온도로 펼친 결과입니다. 막대의 순서는 셋 다 같습니다. temperature는 순위를 바꾸지 않고 격차만 바꿉니다. $T=0.5$에서는 1위가 0.82를 가져가고 perplexity는 1.9, $T=1$에서는 0.51에 4.7, $T=2$에서는 0.28에 8.1입니다. temperature를 올리는 것은 모델을 덜 믿고 후보를 더 고르게 보겠다는 결정이고, 내리는 것은 모델이 앞세운 후보를 더 밀어주겠다는 결정입니다.

이름은 통계물리학에서 왔습니다. 볼츠만 분포에서 입자가 에너지 $E$인 상태를 차지할 확률은 $e^{-E/kT}$($k$는 볼츠만 상수)에 비례하고 온도 $T$가 높을수록 높은 에너지 상태까지 고르게 퍼집니다. 1985년 볼츠만 머신이 이 식을 신경망에 들여왔고, Hinton 연구진의 2015년 지식 증류(큰 모델의 출력 분포를 작은 모델에 가르치는 기법) 논문에서도 같은 이름으로 쓰일 만큼 신경망 쪽에서는 오래된 용어입니다.

top-p와 temperature는 그래서 같이 쓰입니다. top-p는 어느 토큰을 후보로 남길지를, temperature는 남은 후보 사이의 격차를 정합니다. 서로 다른 손잡이입니다. 다만 독립은 아니어서 temperature를 먼저 낮추면 top-p가 남기는 후보 수도 줄어듭니다. 그래서 적용 순서가 결과를 바꾸는데 엔진마다 순서가 다릅니다. vLLM은 temperature, min-p, top-k와 top-p 순입니다. 같은 값을 넣어도 엔진이 다르면 분포가 다를 수 있다는 뜻인데, 이 순서는 서빙 설정의 영역이니 여기서는 존재만 적어 둡니다.

temperature를 낮추면 반복이 돌아옵니다. Holtzman 실험에서 top-k 40에 $T=1$이던 설정의 반복률은 0.78%였습니다. 같은 top-k 40에서 $T$만 0.7로 내리자 8.86%로 뛰었고 perplexity는 6.88에서 3.48로 내려가 greedy 쪽으로 되돌아갔습니다. 낮은 temperature는 절단은 아니지만 절단과 같은 방향으로 작용합니다. 꼬리를 잘라내는 대신 눌러서 사실상 0에 붙이는 셈이라 너무 누르면 최빈값의 문제를 그대로 물려받습니다.

temperature는 speculative decoding의 속도에도 직접 걸립니다. 작은 draft 모델이 토큰 몇 개를 먼저 뽑고 본체가 한 번에 검증해 생성을 앞당기는 기법입니다. 본체가 draft의 토큰을 받아들일 확률을 수락률 α라 하는데, 이 값은 두 모델의 분포가 겹치는 정도(토큰마다 두 확률 중 작은 쪽을 더한 값)입니다. temperature를 올리면 두 분포 모두 평평해져 겹침이 줄고 α가 내려갑니다. 논문들이 보고하는 속도 향상이 대개 temperature 0 조건의 수치인 것도 그때 α가 가장 높아 가장 유리하기 때문으로 보입니다.

<br>

## 무작위를 들인 대가

샘플링을 들이면 같은 프롬프트에서 매번 다른 문장이 나옵니다. speculative decoding이 무손실이라고 할 때 보장하는 것도 문장이 같다는 게 아니라 문장이 나올 확률 분포가 같다는 것입니다. 출력이 분포가 되면 평가도 분포 측정이어야 합니다. DeepSeek-R1의 모델 카드가 벤치마크를 여러 번 돌려 평균 내라고 적어 둔 이유죠. 한 번 돌린 점수는 표본 하나입니다.

그렇다면 temperature를 0으로 두면 재현이 될까요. 되지 않습니다. 2025년 9월 Thinking Machines가 Qwen3-235B에 같은 프롬프트를 temperature 0으로 1,000번 넣었더니 서로 다른 완성이 80가지 나왔습니다. 102번째 토큰까지는 전부 같다가 103번째에서 992개는 "Queens, New York"으로, 8개는 "New York City"로 갈라졌습니다.

원인은 배치에 있습니다. 서빙 엔진은 여러 요청을 한 배치로 묶어 GPU에 올립니다. 배치 크기가 달라지면 행렬곱과 정규화, 어텐션 커널이 덧셈을 묶는 순서가 달라지고 부동소수점 덧셈은 순서에 따라 마지막 자리가 흔들립니다. 흔들리는 것은 argmax의 입력인 logit이라 두 logit이 근소하게 갈리는 자리에서는 그 흔들림이 argmax를 뒤집습니다. 같은 팀이 덧셈 순서를 배치 크기와 무관하게 고정한 커널로 Qwen3-8B를 1,000번 돌리자 전부 같은 답이 나왔고, 대신 같은 작업이 26초에서 55초로, 어텐션 커널을 손본 뒤에도 42초로 느려졌습니다. 결정성은 커널 수준에서 값을 치러야 얻어집니다.

더 근본적인 대가는 이 결정이 모델 밖에 있다는 점입니다. 학습 목적함수는 분포를 만드는 법까지만 정하고 거기서 어떻게 뽑을지는 정하지 않습니다. temperature와 top-p는 사람이 고르는 값이고 최적값은 모델마다, 작업마다 다릅니다. 코드 생성과 소설 쓰기에 같은 값이 맞을 리 없는데 대부분의 호출은 기본값을 그대로 씁니다.

반복도 완화됐을 뿐 사라지지 않았습니다. API마다 repetition penalty나 presence penalty가 여전히 남아 있는 것도 그 방증입니다. 추론 모델이 긴 사고 과정 중에 같은 구절을 되풀이하는 루프도 temperature를 올리면 줄어들지만, 2025년에 이 현상을 분석한 연구는 원인으로 지목한 학습 쪽 결함까지 고쳐지는 것은 아니라고 정리했습니다. 샘플링은 우회로이지 치료가 아닙니다.

<br>

## 샘플링은 왜 기본값이 됐나

그럼에도 2025년 이후 나온 주요 추론 모델들은 샘플링을 권장 수준을 넘어 금지나 강제 쪽으로 옮겨 놓았습니다.

```text
DeepSeek-R1        temperature 0.6 (0.5부터 0.7까지)                      범위 밖 비권장
Qwen3 사고 모드     temperature 0.6 · top-p 0.95 · top-k 20 · min-p 0      greedy 금지
OpenAI 추론 모델    temperature · top_p 파라미터 없음 (추론이 켜진 요청)      1로 고정
```

DeepSeek-R1의 모델 카드는 greedy를 직접 금하지는 않지만 권장 범위가 0.5부터 시작하고 그 이유를 끝없는 반복이나 앞뒤가 맞지 않는 출력을 막기 위해서라고 밝힙니다. 두 이유는 이 글의 양 끝과 겹쳐 읽힙니다. 온도를 너무 내리면 반복(최빈값 쪽 끝), 너무 올리면 앞뒤가 맞지 않는 출력(꼬리 쪽 끝)이니 권장 범위의 두 경계가 그 두 끝인 셈입니다. Qwen3는 한 발 더 나가 greedy decoding이 성능 저하와 무한 반복을 부르니 쓰지 말라고 못 박았습니다. 수만 토큰을 이어 쓰는 사고 과정에서는 한 번 들어선 루프가 끝까지 가니 피해가 그만큼 큽니다.

OpenAI는 손잡이 자체를 없앴습니다. o1 이후의 추론 모델과 GPT-5 계열 API는 추론이 켜진 요청에서 temperature와 top_p를 받지 않습니다(GPT-5.1부터는 추론을 끈 요청에서만 허용). 값을 넣으면 에러가 나고 허용되는 값은 기본값 1뿐입니다. 공식 설명은 없고요. 강화학습 때 샘플을 뽑던 조건과 같은 조건이어야 학습된 행동이 나온다는 추정이 널리 퍼져 있지만 확인된 바는 없습니다. 그리고 temperature 1에 top_p 1은 절단 없는 순수 샘플링, base 모델에서 perplexity 22.73을 냈던 바로 그 조건입니다. 추론 모델에서 이 조건이 멀쩡히 돌아가는 이유로는 후속 학습으로 분포가 훨씬 뾰족해져 꼬리 질량 자체가 줄었다는 해석이 있지만, 내부에서 절단을 거는지조차 공개돼 있지 않습니다.

샘플링이 빠질 수 없게 된 더 깊은 이유는 답을 낼 때와 학습할 때 양쪽에서 파이프라인의 재료가 됐기 때문입니다. 답을 낼 때 계산을 더 써서 정확도를 올리는 test-time scaling의 병렬 샘플링이 대표적입니다. self-consistency는 답을 여러 개 뽑아 다수결로 고르고, Best-of-N은 여러 개를 뽑아 정답 가능성을 채점하는 검증자 모델의 점수가 가장 높은 것을 택합니다. 학습 쪽에서는 강화학습 알고리즘 GRPO가 프롬프트 하나에 답을 여러 개(DeepSeekMath는 64개) 뽑아 그룹 안에서 보상을 비교합니다. 셋 다 샘플이 서로 달라야 성립합니다. greedy면 N개가 커널의 흔들림을 빼면 사실상 같은 답이라 비교할 것도 투표할 것도 없습니다. self-consistency 원 논문이 PaLM에 temperature 0.7과 top-k 40을 쓴 것도 답이 서로 달라야 투표가 되기 때문입니다. 학습 쪽 전제가 단일 호출의 기본값까지 끌고 오는지는 앞서 말한 대로 추정의 영역입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 440 330" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="샘플링이 학습과 추론의 재료가 되는 흐름. 다음 토큰 확률 분포에서 temperature가 0보다 큰 샘플링으로 서로 다른 답 N개를 뽑고, 그 N개가 self-consistency의 다수결, Best-of-N의 검증자 선택, GRPO의 그룹 내 보상 비교에 쓰입니다. greedy면 N개가 사실상 같은 답이 됩니다.">
  <style>
    .gs5-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .gs5-core { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .gs5-warn { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .gs5-t    { fill: var(--text, #1c1917); font-size: 18px; text-anchor: middle; font-weight: 700; }
    .gs5-s    { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .gs5-n    { fill: var(--text-muted, #6d6762); font-size: 16px; text-anchor: middle; }
    .gs5-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#gs5Ar); }
  </style>
  <defs>
    <marker id="gs5Ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <rect x="60" y="16" width="320" height="40" rx="8" class="gs5-box"/>
  <text x="220" y="42" class="gs5-t">다음 토큰 확률 분포 · |V|개</text>
  <line x1="220" y1="58" x2="220" y2="74" class="gs5-ar"/>
  <rect x="60" y="78" width="320" height="56" rx="8" class="gs5-core"/>
  <text x="220" y="102" class="gs5-t">샘플 N개 (T &gt; 0)</text>
  <text x="220" y="123" class="gs5-n">서로 다른 답 N개</text>
  <line x1="220" y1="136" x2="220" y2="152" class="gs5-ar"/>
  <rect x="30" y="156" width="380" height="104" rx="8" class="gs5-box"/>
  <text x="220" y="186" class="gs5-s">self-consistency · 다수결</text>
  <text x="220" y="214" class="gs5-s">Best-of-N · 검증자 점수로 고름</text>
  <text x="220" y="242" class="gs5-s">GRPO · 그룹 안에서 보상 비교</text>
  <rect x="60" y="278" width="320" height="40" rx="8" class="gs5-warn"/>
  <text x="220" y="304" class="gs5-s">greedy면 N개가 사실상 같은 답</text>
</svg>
</div>

기본값이 뒤집힌 뒤에도 beam search가 남은 자리가 있습니다. 답이 거의 하나로 정해진 작업인데, Whisper는 지금도 빔 5로 음성을 받아쓰고, 출력이 미심쩍은 구간(평균 로그 확률이 낮거나, 반대로 같은 말이 되풀이되는 경우)에서만 temperature를 단계적으로 올려 다시 뽑습니다. 뒤쪽 조건은 반복 붕괴를 현장에서 잡는 장치입니다. 기계 번역도 여전히 빔을 쓰고요. 다만 이때 남은 것은 빔 몇 개로 찾은 근사값이고, 엔트로피가 낮은 작업에서는 그 근사가 대개 정답이라 샘플링은 확신이 없을 때의 예비 수단으로 물러납니다.

반면 LLM 서빙 엔진에서 beam search는 밖으로 밀려나는 중입니다. vLLM은 2024년 말 v0.6.3에서 `use_beam_search`를 샘플링 파라미터에서 제거하고 코어 밖의 별도 래퍼로 분리했습니다. 두 차례 RFC에 걸쳐 제시된 이유를 간추리면 셋인데, beam search는 탐색 알고리즘이라 나머지 샘플링 계열과 구조가 충돌하고, 스케줄러와 출력 처리의 복잡도를 끌어올리며, GPT·Gemini·Claude 같은 주요 API가 어차피 지원하지 않는다는 것입니다.

<br>

## 마치며

모델이 내놓는 것은 분포까지입니다. 그 분포의 최빈값 쪽 끝은 반복과 빈 문장으로 흐르고 꼬리 쪽 끝은 한 번 뽑히면 뒤를 오염시키니, 어느 토큰을 뽑을지 정하는 전략은 모두 그 둘 사이 어디에 설지를 고르는 일이었습니다. 어디에 설지는 최대우도 목적함수가 정해 주지 않고 모델 밖에서 사람이 고르는 값이라, 2026년의 추론 모델들은 그 선택지를 아예 닫거나 샘플링 쪽으로 못 박았습니다.

이 글은 분포에서 토큰이 뽑히는 마지막 한 줄만 봤습니다. Transformer 블록이 토큰의 순서를 어떻게 아는지, 위치 인코딩은 다음 글에서 다룹니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [토큰은 왜 단어가 아닐까](/llm/tokenization-and-embedding/)
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [Speculative Decoding으로 LLM 추론 속도 높이기](/llm/speculative-decoding/)
- [Test Time Scaling](/llm/test-time-scaling/)
- [GPT-5.1 API 변경사항, 모델 ID만 바꾸면 추론이 꺼집니다](/issue/gpt-5-1/)

<br>

## 참고자료

- [The Curious Case of Neural Text Degeneration (Holtzman et al., ICLR 2020)](https://arxiv.org/abs/1904.09751)
- [Hierarchical Neural Story Generation (Fan et al., ACL 2018)](https://arxiv.org/abs/1805.04833)
- [On NMT Search Errors and Model Errors: Cat Got Your Tongue? (Stahlberg & Byrne, EMNLP 2019)](https://arxiv.org/abs/1908.10090)
- [If beam search is the answer, what was the question? (Meister et al., EMNLP 2020)](https://aclanthology.org/2020.emnlp-main.170/)
- [Closing the Curious Case of Neural Text Degeneration (Finlayson et al., ICLR 2024)](https://arxiv.org/abs/2310.01693)
- [Turning Up the Heat: Min-p Sampling for Creative and Coherent LLM Outputs (Nguyen et al., ICLR 2025)](https://arxiv.org/abs/2407.01082)
- [Min-p, Max Exaggeration: A Critical Analysis of Min-p Sampling in Language Models (2025)](https://arxiv.org/abs/2506.13681)
- [Distilling the Knowledge in a Neural Network (Hinton et al., 2015)](https://arxiv.org/abs/1503.02531)
- [Defeating Nondeterminism in LLM Inference (Thinking Machines Lab, 2025)](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/)
- [Wait, Wait, Wait… Why Do Reasoning Models Loop? (2025)](https://arxiv.org/abs/2512.12895)
- [DeepSeek-R1 모델 카드, Usage Recommendations](https://huggingface.co/deepseek-ai/DeepSeek-R1)
- [Qwen3-8B 모델 카드, Best Practices](https://huggingface.co/Qwen/Qwen3-8B)
