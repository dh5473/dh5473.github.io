---
date: '2026-10-15'
title: 'Long Context, 들어가는 길이와 쓰는 길이'
category: 'LLM'
series: 'llm'
seriesOrder: 12
tags: ['LLM', 'Long Context', 'Effective Context Length', 'RULER', 'YaRN', 'Attention']
summary: '모델 카드의 1M은 입력이 들어간다는 뜻이지 그 길이를 다 쓴다는 뜻이 아닙니다. 먼 곳의 정보가 학습 때는 드물게 등장하고 추론 때는 묽은 가중치를 받아서 생기는 격차를 숫자로 따라갑니다.'
thumbnail: './thumbnail.png'
---

긴 문맥을 다루는 어텐션 설계는 대부분 메모리와 연산을 줄이는 쪽으로 발전해 왔습니다. 앞 토큰들의 key와 value를 저장해 두는 KV Cache를 압축하고(GQA, MLA), 저장한 위치 중 일부만 골라 읽고(Sparse Attention), 과거를 고정 크기 요약으로 들고 다니는(Linear Attention) 방법들이죠. 이런 설계가 쌓이면서 2026년 프론티어 모델 카드에는 1M 토큰 컨텍스트가 흔해졌습니다.

그러면 1M이 들어가는 모델은 1M을 다 쓸 수 있을까요? DeepSeek V4는 1M 컨텍스트를 지원하지만, DeepSeek은 기술 리포트에서 128K까지는 검색 성능이 안정적이고 그 너머부터는 저하가 눈에 보인다고 밝혔습니다. 1M에서도 검색이 무너지지는 않지만 128K 안만큼 안정적이지는 않다는 뜻입니다. 입력이 들어가는 길이와 모델이 그 안의 정보를 제대로 쓰는 길이는 다릅니다.

이 격차는 메모리를 늘려서는 메울 수 없습니다. 먼 곳에 있는 정보일수록 학습할 때는 볼 기회가 적고, 추론할 때는 받는 어텐션 가중치가 작기 때문입니다. 1M이 들어가는지는 메모리가 정하지만 1M을 쓰는지는 먼 곳의 정보가 모델에 얼마나 강하게 닿느냐가 정합니다.

## 들어가는 길이와 쓰는 길이

들어가는 쪽은 계산으로 답이 나옵니다. Llama 3.1 70B는 쿼리 head 64개가 KV head 8개를 나눠 쓰는 GQA 구조입니다. 이 모델로 KV Cache 크기를 재 보면 이렇습니다.

```text
토큰당 KV = 2 (K, V) × 80 레이어 × 8 KV head × 128 차원 × 2 바이트
         = 327,680 바이트 (320 KiB)

128K 토큰 = 약 43 GB
1M 토큰   = 약 344 GB  (가중치 약 141 GB의 2.4배)
```

시퀀스 하나에 가중치보다 2.4배 큰 메모리가 필요하고 80GB GPU로 치면 KV Cache에만 다섯 장이 듭니다. 이것도 GQA로 이미 8분의 1로 줄인 숫자입니다. KV head가 쿼리 head만큼 64개였다면 약 2.7TB가 됩니다. 캐시를 압축하고, 일부만 읽고, 요약으로 바꾸는 설계들이 바로 이런 숫자를 줄여서 1M을 실제 하드웨어에 올렸습니다.

쓰는 쪽은 측정해 봐야 압니다. 2024년에 나온 벤치마크 RULER는 실효 길이(effective context length)를 고정된 기준 점수를 넘기는 최대 길이로 정의했습니다. 기준은 Llama 2 7B가 4K에서 낸 85.6점입니다. 짧은 문맥에서 무난한 모델이 내는 점수를 문턱으로 삼은 것입니다. RULER로 17개 모델을 측정하니 32K에서 이 문턱을 넘긴 모델은 절반 정도였고 128K를 광고한 모델의 실효 길이는 대개 32K나 64K였습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 245" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="RULER로 잰 모델별 광고 컨텍스트 길이와 실효 길이 비교">
  <style>
    .lc1-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .lc1-t { font-size: 14px; fill: var(--text, #1c1917); }
    .lc1-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .lc1-ad { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .lc1-ef { fill: var(--primary, #0a756c); }
    .lc1-grid { stroke: var(--border, #e7e5e4); stroke-width: 1; stroke-dasharray: 3,3; }
  </style>
  <text x="200" y="20" text-anchor="middle" class="lc1-h">광고 길이와 실효 길이</text>
  <!-- Grid (log scale, 4K to 1M) -->
  <line x1="130" y1="34" x2="130" y2="180" class="lc1-grid"/>
  <line x1="190" y1="34" x2="190" y2="180" class="lc1-grid"/>
  <line x1="250" y1="34" x2="250" y2="180" class="lc1-grid"/>
  <line x1="310" y1="34" x2="310" y2="180" class="lc1-grid"/>
  <line x1="370" y1="34" x2="370" y2="180" class="lc1-grid"/>
  <!-- GPT-4: 128K / 64K -->
  <text x="10" y="63" class="lc1-t">GPT-4</text>
  <rect x="130" y="42" width="150" height="14" rx="3" class="lc1-ad"/>
  <rect x="130" y="60" width="120" height="14" rx="3" class="lc1-ef"/>
  <!-- Llama 3.1 70B: 128K / 64K -->
  <text x="10" y="113" class="lc1-t">Llama 3.1 70B</text>
  <rect x="130" y="92" width="150" height="14" rx="3" class="lc1-ad"/>
  <rect x="130" y="110" width="120" height="14" rx="3" class="lc1-ef"/>
  <!-- GLM4-9B: 1M / 64K -->
  <text x="10" y="163" class="lc1-t">GLM4-9B</text>
  <rect x="130" y="142" width="240" height="14" rx="3" class="lc1-ad"/>
  <rect x="130" y="160" width="120" height="14" rx="3" class="lc1-ef"/>
  <!-- Axis labels -->
  <text x="130" y="198" text-anchor="middle" class="lc1-sm">4K</text>
  <text x="190" y="198" text-anchor="middle" class="lc1-sm">16K</text>
  <text x="250" y="198" text-anchor="middle" class="lc1-sm">64K</text>
  <text x="310" y="198" text-anchor="middle" class="lc1-sm">256K</text>
  <text x="370" y="198" text-anchor="middle" class="lc1-sm">1M</text>
  <!-- Legend -->
  <rect x="105" y="216" width="14" height="14" rx="3" class="lc1-ad"/>
  <text x="125" y="228" class="lc1-sm">광고</text>
  <rect x="190" y="216" width="14" height="14" rx="3" class="lc1-ef"/>
  <text x="210" y="228" class="lc1-sm">실효 (RULER)</text>
</svg>
</div>

GPT-4와 Llama 3.1 70B는 128K를 받아 놓고 64K까지만 제대로 씁니다. 128K가 전부 메모리에 올라가 있으니 메모리 탓은 아닙니다. 64K보다 먼 곳의 정보가 출력까지 충분히 닿지 않는 것이죠. 신호가 약해지는 곳은 두 군데입니다. 학습할 때 먼 거리를 볼 기회가 적고, 추론할 때 먼 정답이 받는 가중치가 문맥 길이만큼 묽어집니다.

## 먼 거리는 드물게 배운다

학습 쪽부터 보겠습니다. 모델이 학습 중에 어떤 거리를 몇 번이나 보는지 세어 보면 됩니다. 토큰 8개짜리 시퀀스에서 바로 옆 토큰끼리의 쌍, 즉 거리 1인 쌍은 1과 2, 2와 3부터 7과 8까지 7개입니다. 거리 7인 쌍은 첫 토큰과 마지막 토큰 하나뿐입니다. 길이 $L$인 시퀀스로 넓히면 거리 $d$인 쌍의 개수는 이렇습니다.

$$
f(d) = L - d
$$

$L$은 학습 시퀀스의 길이, $d$는 두 토큰 사이의 거리, $f(d)$는 그 거리만큼 떨어진 쌍이 시퀀스 하나에 몇 개 들어 있는지입니다. 쿼리는 앞에 있는 key를 전부 보므로 쌍 하나하나가 그 거리에서 무엇을 참조할지 배우는 기회가 됩니다. 거리가 1 늘 때마다 이 기회가 하나씩 줄어듭니다.

128K로 학습한다면 $L = 131{,}072$입니다. 거리 1은 시퀀스 하나에 131,071번 나오지만 거리 131,071은 딱 한 번 나옵니다. 구간으로 묶으면 더 분명합니다. 학습 길이의 뒤쪽 절반, 즉 65,536보다 먼 거리에 속하는 쌍은 전체의 25%이고 마지막 4분의 1에 속하는 쌍은 6.25%뿐입니다. 쌍의 개수가 거리에 따라 직선으로 줄어들어서 뒤쪽 구간의 몫은 길이 비율의 제곱으로 작아지기 때문입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 285" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="학습 시퀀스에서 거리별 쌍의 등장 횟수가 거리에 따라 직선으로 줄어드는 모습">
  <style>
    .lc2-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .lc2-t { font-size: 14px; fill: var(--text, #1c1917); }
    .lc2-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .lc2-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; }
  </style>
  <text x="200" y="20" text-anchor="middle" class="lc2-h">거리별 등장 횟수</text>
  <!-- Whole triangle -->
  <polygon points="60,50 260,230 60,230" fill="var(--bg-muted, #eeecea)" stroke="var(--text, #1c1917)" stroke-width="1.2"/>
  <!-- Far half -->
  <polygon points="160,140 260,230 160,230" fill="var(--primary, #0a756c)" fill-opacity="0.25" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
  <text x="188" y="219" text-anchor="middle" style="font-size:14px; font-weight:700; fill: var(--primary, #0a756c);">25%</text>
  <text x="72" y="44" class="lc2-t">거리 1 · L − 1번</text>
  <!-- Extension region -->
  <rect x="264" y="50" width="106" height="180" rx="4" fill="none" stroke="var(--border, #e7e5e4)" stroke-width="1.2" stroke-dasharray="4,3"/>
  <text x="317" y="128" text-anchor="middle" class="lc2-sm">YaRN 확장</text>
  <text x="317" y="150" text-anchor="middle" style="font-size:14px; font-weight:700; fill: var(--text-danger, #cb2121);">등장 0</text>
  <!-- Axes -->
  <line x1="60" y1="40" x2="60" y2="230" class="lc2-ax"/>
  <line x1="60" y1="230" x2="375" y2="230" class="lc2-ax"/>
  <text x="38" y="140" text-anchor="middle" class="lc2-sm" transform="rotate(-90 38 140)">등장 횟수</text>
  <text x="60" y="250" text-anchor="middle" class="lc2-sm">0</text>
  <text x="160" y="250" text-anchor="middle" class="lc2-sm">L/2</text>
  <text x="260" y="250" text-anchor="middle" class="lc2-sm">L</text>
  <text x="215" y="274" text-anchor="middle" class="lc2-sm">거리 d</text>
</svg>
</div>

이 비율조차 128K를 꽉 채운 긴 문서로만 학습했을 때의 상한입니다. 실제 코퍼스는 짧은 문서가 대부분이라 128K 시퀀스를 만들 때 짧은 문서 여러 개를 이어 붙입니다. 서로 다른 문서에 속한 두 토큰은 멀리 떨어져 있어도 서로를 참조할 이유가 없으니 의미 있는 먼 거리는 위의 계산보다 훨씬 드물죠. 이 빈도 문제를 짚은 STRING 연구(2024)에 따르면 SlimPajama 코퍼스는 데이터의 약 20%가 256에서 512토큰 길이였습니다. 같은 연구는 오픈 모델의 실효 길이가 대개 학습 길이의 절반을 넘지 않는다고 보고했는데, 128K로 학습하고 실효 길이가 64K였던 Llama 3.1 70B가 정확히 그 경우입니다.

1M 모델도 사정은 같습니다. 1M에 이르는 경로는 크게 둘입니다. DeepSeek V4처럼 4K, 16K, 64K를 거쳐 1M까지 직접 학습하는 방법이 있고, Qwen3.5 계열처럼 262K까지만 학습한 뒤 YaRN으로 4배 늘려 1M을 만드는 방법이 있습니다. 앞의 경우에도 거리별 등장 횟수가 그리는 삼각형은 그대로라 먼 거리는 여전히 드뭅니다. 1M까지 학습한 DeepSeek V4가 128K 너머에서 흔들리는 것도 이 그림과 어긋나지 않습니다.

뒤의 경우에는 262K보다 먼 거리가 학습 중 한 번도 나오지 않습니다. RoPE는 쿼리와 key 벡터를 위치에 비례한 각도로 회전시켜 두 토큰의 상대 거리를 내적에 새기는 Positional Encoding입니다. YaRN은 추론할 때 이 회전 각도를 학습한 범위 안으로 압축해서 모델이 처음 보는 위치 값에 흔들리지 않게 할 뿐입니다. 그 거리에서 무엇을 찾아야 하는지를 가르쳐 주지는 않습니다.

그래서 긴 문맥 학습의 처방은 모두 먼 거리의 학습 기회를 늘리는 쪽입니다. 가장 직접적인 방법은 더 긴 시퀀스로 학습하는 것인데, 처음부터 긴 시퀀스로 학습하면 어텐션 연산이 길이의 제곱으로 늘고 짧은 문맥 성능도 흔들립니다. 그래서 길이를 단계적으로 늘립니다. Llama 3 405B는 8K에서 128K까지 6단계에 걸쳐 약 8,000억 토큰을 썼고, 단계마다 짧은 문맥 성능이 회복된 것을 확인하고 다음 길이로 넘어갔습니다.

다만 이어 붙인 짧은 문서로 채운 시퀀스는 길어도 의미 있는 먼 거리가 늘지 않아서, 먼 토큰 사이에 실제 관계가 있는 문서를 따로 넣습니다. ProLong 연구(2024)의 최종 배합은 코드 저장소 30%, 책 30%, 교과서 3%, 짧은 데이터 37%였습니다. 코드 저장소와 책은 자연적으로 긴 문서를 가장 많이 공급하는 출처이고 실험에서도 각각 검색과 요약 성능을 끌어올렸습니다. 짧은 데이터 37%는 짧은 문맥 성능을 지키기 위한 몫입니다.

학습을 더 하지 않고 이미 충분히 배운 거리를 빌려 쓰는 방법도 있습니다. STRING은 추론할 때 학습이 덜 된 먼 거리 값을 버리고 충분히 학습된 짧은 거리 값을 옮겨 그 자리를 채웁니다. STRING 저자들은 이 방법으로 Llama 3.1 70B의 RULER 128K 점수가 66.6에서 81.7로 올랐다고 보고했습니다. 아직은 이 연구 하나에서 나온 결과입니다.

## 길어질수록 가중치가 묽어진다

먼 거리를 충분히 배웠다고 해도 추론할 때 신호가 한 번 더 약해집니다. 어텐션은 쿼리와 각 key의 내적으로 점수를 매깁니다. 그다음 softmax가 점수마다 지수를 취하고 전체 합으로 나눠 합이 1인 가중치로 바꿉니다. 전체 합으로 나누기 때문에 후보가 늘어나면 같은 점수 차로 받을 수 있는 가중치가 줄어듭니다.

쿼리 하나가 key $n$개를 보는데 정답 key 하나만 점수가 $z$만큼 높고 다른 key는 모두 같은 점수라고 해 보겠습니다. 정답이 받는 가중치는 $\frac{e^z}{e^z + (n-1)}$입니다. 분자는 그대로인데 분모가 $n$과 함께 커지니 길이가 늘면 정답의 몫이 줄어듭니다.

모델이 128K 문맥에서 정답에 가중치 절반을 주도록 학습됐다면, $e^z$가 나머지 131,071개의 합과 같아야 하므로 점수 차는 $z = \ln 131{,}071 \approx 11.8$입니다. 같은 점수 차로 1M 문맥을 읽으면 분모에 백만 개가 넘는 위치가 들어와 정답의 가중치는 11%로 떨어지고 나머지 89%는 관련 없는 위치들에 조금씩 흩어집니다. 1M에서 다시 절반을 받으려면 점수 차가 13.9로 커져야 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="문맥 길이별로 정답이 가중치 절반을 받는 데 필요한 점수 차">
  <style>
    .lc3-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
    .lc3-t { font-size: 14px; font-weight: 600; fill: var(--text, #1c1917); }
    .lc3-sm { font-size: 14px; fill: var(--text-muted, #6d6762); }
    .lc3-bar { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
  </style>
  <text x="200" y="22" text-anchor="middle" class="lc3-h">가중치 절반에 필요한 점수 차</text>
  <!-- Bars: 6.9 / 11.8 / 13.9, 12.5px per unit, baseline 240 -->
  <rect x="70" y="154" width="60" height="86" rx="4" class="lc3-bar"/>
  <rect x="170" y="92" width="60" height="148" rx="4" class="lc3-bar"/>
  <rect x="270" y="66" width="60" height="174" rx="4" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0a756c)" stroke-width="1.8"/>
  <text x="100" y="146" text-anchor="middle" class="lc3-t">6.9</text>
  <text x="200" y="84" text-anchor="middle" class="lc3-t">11.8</text>
  <text x="300" y="58" text-anchor="middle" class="lc3-t">13.9</text>
  <!-- 128K trained gap -->
  <line x1="50" y1="92" x2="350" y2="92" stroke="var(--primary, #0a756c)" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="55" y="112" class="lc3-sm">128K 학습 기준</text>
  <!-- Shortfall at 1M -->
  <line x1="338" y1="66" x2="338" y2="92" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
  <text x="344" y="84" style="font-size:14px; font-weight:700; fill: var(--text-danger, #cb2121);">+2.1</text>
  <!-- Baseline and labels -->
  <line x1="50" y1="240" x2="350" y2="240" stroke="var(--text-muted, #6d6762)" stroke-width="1.2"/>
  <text x="100" y="262" text-anchor="middle" class="lc3-sm">1K</text>
  <text x="200" y="262" text-anchor="middle" class="lc3-sm">128K</text>
  <text x="300" y="262" text-anchor="middle" class="lc3-sm">1M</text>
  <text x="200" y="283" text-anchor="middle" class="lc3-sm">문맥 길이 n</text>
</svg>
</div>

필요한 점수 차는 길이의 로그에 비례해 늘어납니다. 1K에서 6.9이던 것이 128K에서 11.8, 1M에서 13.9가 되죠. 그렇다고 처음부터 13.9를 내도록 학습하면 짧은 문맥에서 문제가 생깁니다. 1K 문맥에서 점수 차가 13.9이면 정답이 가중치의 99.9%를 가져가서 주변 문맥을 함께 참고해야 할 때도 한 위치에만 쏠립니다. 고정된 점수 차로는 짧은 문맥과 긴 문맥을 동시에 맞출 수 없습니다.

점수 차가 작은 정보일수록 이 희석에 먼저 묻힙니다. 실제 문맥에는 정답과 비슷한 문장이 섞여 있어서 정답이 다른 key보다 크게 앞서지 못하는 경우가 많습니다. Chroma의 Context Rot 보고서(2025)에서 18개 모델을 시험해 보니 정답과 비슷한 방해 문장을 하나만 넣어도 성능이 떨어졌습니다.

벤치마크에서도 같은 차이가 드러납니다. 긴 문맥의 대표 시험이던 NIAH(Needle In A Haystack)는 관련 없는 긴 글 사이에 문장 하나를 숨겨 두고 그 내용을 묻는데, 질문과 숨긴 문장이 같은 단어를 공유하는 경우가 많아 점수 차가 크게 벌어집니다. 2025년에 나온 NoLiMa는 이 겹침을 없앴습니다. 숨긴 문장은 "Yuki는 젬퍼 오페라 하우스 옆에 산다"이고 질문은 "드레스덴에 가 본 인물은 누구인가"라서, 젬퍼 오페라 하우스가 드레스덴에 있다는 연상을 한 번 거쳐야 답이 나옵니다. 이렇게 바꾸자 32K에서 13개 모델 중 11개가 짧은 문맥 점수의 절반 아래로 떨어졌고 GPT-4o도 99.3점에서 69.7점이 됐습니다.

그래서 나온 해법이 길이에 맞춰 점수 차를 키우는 방법입니다. 쿼리에 $\log n$에 비례하는 계수를 곱하면 점수 차가 필요량과 같은 로그 꼴로 커집니다. 이 방식은 Scalable-Softmax(SSMax, 2025)가 제안했습니다. Llama 4는 Positional Encoding을 쓰지 않는(NoPE) 일부 레이어에서 추론할 때 쿼리에 온도 계수를 곱하고 그 값을 위치에 따라 로그로 키웁니다. 다만 이 계수는 정답과 방해 문장의 점수를 함께 키우므로 방해 문장이 정답만큼 높은 점수를 받는 경우까지 고쳐 주지는 못합니다.

## 마치며

1M이 들어가도 먼 곳의 정보는 두 번 약해집니다. 학습할 때는 그 거리를 볼 기회가 거리가 멀수록 직선으로 줄고, 추론할 때는 정답이 가중치를 지키는 데 필요한 점수 차가 문맥 길이의 로그로 커집니다. 긴 시퀀스와 긴 문서로 학습 기회를 늘리고 $\log n$ 스케일링으로 가중치를 지키는 방법이 나와 있지만, 정답과 비슷한 방해물이 많은 긴 문맥에서 어디까지 버티는지는 아직 확인되지 않았습니다. 그래서 모델 카드의 컨텍스트 길이는 상한으로 읽고 실효 길이는 따로 재 봐야 합니다.

다음 글에서는 MoE부터 MLA 같은 어텐션 변형, Sparse Attention, Hybrid Attention, Long Context 설계까지 지금까지 다룬 선택들이 실제 오픈 모델에서 어떤 조합으로 쓰이는지 한 장의 지도로 정리합니다.

## 함께 보면 좋은 글

- [Positional Encoding에서 RoPE까지, 어텐션에 순서를 부여하는 법](/llm/positional-encoding/)
- [Linear Attention, 곱의 순서를 바꾸면 생기는 일](/llm/hybrid-linear-attention/)
- [Sparse Attention, 블록으로 묶으면 달라지는 것](/llm/sparse-attention/)
- [KV Cache를 10분의 1로 줄인 MLA의 트릭](/llm/attention-variants/)
- [AI Agent의 컨텍스트 엔지니어링: 유한한 토큰 윈도우를 다루는 네 가지 전략](/agent/context-engineering/)

## 참고자료

- [RULER: What's the Real Context Size of Your Long-Context Language Models? (Hsieh et al., 2024)](https://arxiv.org/abs/2404.06654)
- [NoLiMa: Long-Context Evaluation Beyond Literal Matching (Modarressi et al., 2025)](https://arxiv.org/abs/2502.05167)
- [Why Does the Effective Context Length of LLMs Fall Short? (An et al., 2024)](https://arxiv.org/abs/2410.18745)
- [How to Train Long-Context Language Models (Effectively) (Gao et al., 2024)](https://arxiv.org/abs/2410.02660)
- [Scalable-Softmax Is Superior for Attention (Nakanishi, 2025)](https://arxiv.org/abs/2501.19399)
- [The Llama 3 Herd of Models (Meta, 2024)](https://arxiv.org/abs/2407.21783)
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance (Chroma, 2025)](https://www.trychroma.com/research/context-rot)
