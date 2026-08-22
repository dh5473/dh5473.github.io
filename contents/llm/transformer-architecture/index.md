---
date: '2026-08-17'
title: 'Transformer는 왜 Q, K, V 셋으로 나눴을까'
category: 'LLM'
series: 'llm'
seriesOrder: 2
tags: ['LLM', 'Transformer', 'Attention', 'Multi-Head Attention', 'GQA', 'KV Cache']
summary: 'Transformer 어텐션의 Q, K, V가 무엇이고 왜 셋으로 나뉘는지 문장 하나를 놓고 계산을 따라갑니다. √d_k로 나누는 이유와 causal mask가 막는 것, 그 마스크 덕분에 KV Cache가 성립하는 이유, 그리고 head와 KV head가 정확히 무엇인지 정의합니다.'
thumbnail: './thumbnail.png'
---
ChatGPT 같은 모델에 "민수는 어제 빌린 책을"까지 넣으면 모델은 다음 단어를 고릅니다. "돌려줬다"쯤이 나오겠죠. 이 한 단어를 고르려면 앞 단어들을 봐야 합니다. 누가(민수), 무엇을(책), 언제(어제). 모델은 앞 단어들을 어떻게 "보는" 걸까요?

이 질문에 대한 Transformer의 답이 어텐션입니다. 어텐션의 중심에는 Q, K, V라는 세 벡터가 있습니다. 모델 카드나 추론 서버 설정에 head_dim이나 KV head 수 같은 값이 설명 없이 등장하는데 전부 이 셋에서 나온 말입니다. KV Cache가 K와 V를 저장한다는 것도 널리 알려져 있고요. 그런데 그 K와 V가 정확히 무엇인지, 왜 Q까지 셋으로 나뉘어야 했는지 물으면 의외로 답이 막힙니다.

문장 하나를 놓고 어텐션이 실제로 무슨 계산을 하는지 처음부터 따라가면 답이 보입니다. 그 길에서 왜 $\sqrt{d_k}$로 나누는지, causal mask가 무엇을 막는지, 그 마스크 덕분에 KV Cache가 왜 가능한지, 그리고 head와 KV head가 정확히 무엇인지까지 짚습니다.

<br>

## 왜 어텐션이어야 했나

Transformer 이전에 문장을 다루던 주역은 RNN이었습니다. RNN은 단어를 앞에서부터 하나씩 읽으면서 지금까지 읽은 내용을 고정된 크기의 벡터 하나에 요약해 둡니다. 메모지 한 장이라고 생각하면 됩니다. 단어를 하나 읽을 때마다 메모지를 지우고 새로 쓰는데 메모지 크기는 늘지 않습니다.

이 방식에는 한계가 있습니다. 우선 정보가 희석됩니다. "민수는"을 읽고 쓴 메모는 "어제", "빌린", "책을"을 거치며 세 번 고쳐 써집니다. 다섯 번째 단어에 도착했을 때 첫 단어의 정보가 얼마나 남아 있을지는 보장이 없고 문장이 길수록 심해집니다. 병렬화도 안 됩니다. 두 번째 메모를 쓰려면 첫 번째 메모가 끝나야 하고 세 번째는 두 번째가 끝나야 합니다. 단어가 1,000개면 1,000단계를 차례로 밟아야 합니다. GPU는 수천 개 연산을 동시에 돌리는데 그 장점을 살릴 수 없습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="RNN의 순차 압축과 어텐션의 직접 참조를 비교하는 그림. RNN은 토큰 1의 정보가 토큰 5에 닿으려면 네 단계를 거쳐야 하지만, 어텐션은 모든 위치를 한 단계에 직접 참조합니다.">
  <style>
    .tf1-src  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf1-mid  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf1-cur  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf1-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf1-h    { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .tf1-cap  { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
    .tf1-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf1Ar); }
    .tf1-att  { stroke: var(--primary, #0a756c); stroke-width: 1.5; fill: none; marker-end: url(#tf1ArG); }
    .tf1-fade { stroke: var(--accent, #9d5604); stroke-width: 1.5; fill: none; stroke-dasharray: 5 3; }
  </style>
  <defs>
    <marker id="tf1Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
    <marker id="tf1ArG" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--primary, #0a756c)"/></marker>
  </defs>
  <text x="20" y="24" class="tf1-h">RNN: 순차 압축</text>
  <rect x="30" y="40" width="64" height="36" rx="6" class="tf1-src"/>
  <text x="62" y="64" class="tf1-t">h₁</text>
  <path d="M100,58 L118,58" class="tf1-ar"/>
  <rect x="124" y="40" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="156" y="64" class="tf1-t">h₂</text>
  <path d="M194,58 L212,58" class="tf1-ar"/>
  <rect x="218" y="40" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="250" y="64" class="tf1-t">h₃</text>
  <path d="M288,58 L306,58" class="tf1-ar"/>
  <rect x="312" y="40" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="344" y="64" class="tf1-t">h₄</text>
  <path d="M382,58 L400,58" class="tf1-ar"/>
  <rect x="406" y="40" width="64" height="36" rx="6" class="tf1-cur"/>
  <text x="438" y="64" class="tf1-t">h₅</text>
  <path d="M62,80 Q250,116 438,80" class="tf1-fade"/>
  <text x="240" y="120" class="tf1-cap">4단계를 거쳐야 h₁의 정보에 접근</text>
  <line x1="20" y1="140" x2="460" y2="140" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <text x="20" y="170" class="tf1-h">어텐션: 직접 참조</text>
  <rect x="30" y="186" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="62" y="210" class="tf1-t">위치 1</text>
  <rect x="124" y="186" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="156" y="210" class="tf1-t">위치 2</text>
  <rect x="218" y="186" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="250" y="210" class="tf1-t">위치 3</text>
  <rect x="312" y="186" width="64" height="36" rx="6" class="tf1-mid"/>
  <text x="344" y="210" class="tf1-t">위치 4</text>
  <rect x="406" y="186" width="64" height="36" rx="6" class="tf1-cur"/>
  <text x="438" y="210" class="tf1-t">위치 5</text>
  <path d="M94,197 L400,200" class="tf1-att"/>
  <path d="M188,200 L400,203" class="tf1-att"/>
  <path d="M282,206 L400,206" class="tf1-att"/>
  <path d="M376,210 L400,210" class="tf1-att"/>
  <text x="240" y="260" class="tf1-cap">모든 위치에 한 단계로 접근</text>
</svg>
</div>

2015년 Bahdanau 연구팀이 기계 번역에서 이 병목을 처음 돌파했습니다. 번역문을 쓰는 쪽(디코더)이 원문을 읽은 쪽(인코더)의 모든 위치를 직접 들여다보게 한 것이 어텐션의 시작이었습니다. 메모지 한 장을 전달받는 대신 원문 전체를 펼쳐 놓고 필요한 곳을 골라 보는 방식입니다. 2017년 "Attention Is All You Need"는 한 걸음 더 나갔습니다. 인코더와 디코더 사이뿐 아니라 한 문장 안에서도 각 단어가 같은 문장의 다른 단어를 직접 참조하게 만들었습니다. 이 방식을 self-attention이라고 부릅니다. RNN 없이 self-attention만으로 세운 구조가 Transformer입니다.

<br>

## Q, K, V라는 세 가지 역할

"돌려줬다" 자리에서 앞 단어들을 본다고 할 때 어텐션이 할 일은 두 가지입니다. 어느 단어를 얼마나 볼지 정하는 일과 고른 단어에서 무엇을 가져올지 정하는 일입니다.

먼저 단어는 모델 안에서 숫자 묶음, 즉 벡터로 들어 있습니다. "민수는"이 (0.2, −1.3, 0.8, …) 같은 수백 개의 숫자로 표현되는 식이고 이 벡터를 임베딩이라고 부릅니다. 두 벡터가 얼마나 닮았는지 재는 가장 단순한 방법은 내적입니다. 같은 자리의 숫자끼리 곱해서 전부 더합니다. (1, 2, 3)과 (4, 5, 6)의 내적은 1×4 + 2×5 + 3×6 = 32입니다. 두 벡터가 비슷한 방향을 가리키면 커지고 반대 방향이면 음수가 됩니다.

그러면 각 단어의 벡터끼리 내적을 구해 값이 큰 단어를 많이 보는 설계가 가장 단순합니다. 그런데 이렇게 하면 두 가지가 엉킵니다.

"고르는 기준"과 "가져올 내용"이 한 벡터에 묶입니다. "돌려줬다"가 "책을"을 골라야 하는 이유는 목적어가 필요해서인데 정작 "책을"에서 가져올 내용은 "빌린 물건이 책이다"라는 정보입니다. 고르는 기준과 가져올 내용이 다른데 벡터가 하나면 이 둘을 따로 학습할 수 없습니다.

찾는 쪽과 찾아지는 쪽의 역할이 구분되지 않는 것도 문제입니다. 내적은 "둘이 닮았는가"를 잽니다. 하지만 "돌려줬다"와 "책을"은 뜻이 닮아서 연결되는 것이 아니라 한쪽에 다른 쪽이 필요로 하는 것이 있어서 연결됩니다. 동사가 목적어를 찾고 대명사가 가리키는 대상을 찾는 관계 역시 필요에서 나옵니다.

Transformer는 그래서 각 위치의 벡터 하나를 세 가지 역할로 쪼갭니다. 학습으로 정해지는 가중치 행렬 $W_Q$, $W_K$, $W_V$를 각각 곱해 세 벡터를 만듭니다.

- **Query($Q$)**: 이 위치가 던지는 질문. "나는 어떤 정보가 필요한가"
- **Key($K$)**: 이 위치가 내거는 간판. "나는 이런 질문에 답할 수 있다"
- **Value($V$)**: 선택되었을 때 넘겨줄 내용물. "내가 갖고 있는 정보는 이것이다"

도서관에 비유하면 Query는 검색창에 치는 검색어, Key는 책등에 붙은 제목과 색인, Value는 책의 본문입니다. 검색어와 제목을 맞춰 보고 책을 고른 다음 실제로 읽는 것은 본문이죠. 제목이 검색에 잘 걸리게 쓰이는 것과 본문이 내용을 담는 것은 별개의 일입니다. $W_Q$, $W_K$, $W_V$가 따로 있으니 모델은 이 세 역할을 각각 따로 학습합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 250" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="hidden state 벡터가 W_Q, W_K, W_V 세 가중치 행렬로 투영되어 Query, Key, Value 세 벡터가 되는 과정. 아래쪽에 Q와 K의 내적으로 점수를 구하고 softmax를 거쳐 V를 가중합하는 흐름이 이어집니다.">
  <style>
    .tf2-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf2-q    { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf2-k    { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf2-v    { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf2-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf2-w    { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
    .tf2-desc { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .tf2-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf2Ar); }
    .tf2-flow { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
  </style>
  <defs>
    <marker id="tf2Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <rect x="20" y="16" width="56" height="36" rx="6" class="tf2-box"/>
  <text x="48" y="40" class="tf2-t">x</text>
  <path d="M82,28 L130,28" class="tf2-ar"/>
  <text x="106" y="22" class="tf2-w">W_Q</text>
  <rect x="136" y="10" width="56" height="36" rx="6" class="tf2-q"/>
  <text x="164" y="34" class="tf2-t">Q</text>
  <text x="210" y="34" class="tf2-desc">이 위치가 던지는 질문</text>
  <rect x="20" y="72" width="56" height="36" rx="6" class="tf2-box"/>
  <text x="48" y="96" class="tf2-t">x</text>
  <path d="M82,84 L130,84" class="tf2-ar"/>
  <text x="106" y="78" class="tf2-w">W_K</text>
  <rect x="136" y="66" width="56" height="36" rx="6" class="tf2-k"/>
  <text x="164" y="90" class="tf2-t">K</text>
  <text x="210" y="90" class="tf2-desc">이 위치가 내거는 간판</text>
  <rect x="20" y="128" width="56" height="36" rx="6" class="tf2-box"/>
  <text x="48" y="152" class="tf2-t">x</text>
  <path d="M82,140 L130,140" class="tf2-ar"/>
  <text x="106" y="134" class="tf2-w">W_V</text>
  <rect x="136" y="122" width="56" height="36" rx="6" class="tf2-v"/>
  <text x="164" y="146" class="tf2-t">V</text>
  <text x="210" y="146" class="tf2-desc">선택되면 넘겨줄 내용물</text>
  <line x1="20" y1="184" x2="460" y2="184" stroke="var(--border, #e7e5e4)" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="56" y="210" class="tf2-flow">Q · K</text>
  <path d="M86,204 L118,204" class="tf2-ar"/>
  <text x="146" y="210" class="tf2-flow">점수</text>
  <path d="M170,204 L202,204" class="tf2-ar"/>
  <text x="240" y="210" class="tf2-flow">softmax</text>
  <path d="M272,204 L308,204" class="tf2-ar"/>
  <text x="340" y="210" class="tf2-flow">× V</text>
  <path d="M360,204 L392,204" class="tf2-ar"/>
  <text x="428" y="210" class="tf2-flow">출력</text>
  <text x="240" y="240" class="tf2-flow">점수 비율로 Value를 가중합</text>
</svg>
</div>

<br>

## 문장 하나로 따라가는 계산

"민수는 어제 빌린 책을 돌려줬다"에서 "돌려줬다" 위치의 계산을 따라가 봅시다. 세 단계입니다.

**1단계, 점수.** "돌려줬다"의 Q를 앞 단어 네 개의 K와 각각 내적합니다. 숫자 네 개가 나옵니다. 예를 들어 민수는 2.1, 어제 1.0, 빌린 1.0, 책을 2.6처럼요. 값이 클수록 "돌려줬다"가 던진 질문에 그 단어의 간판이 잘 맞습니다.

**2단계, 가중치.** 점수 네 개를 softmax에 넣습니다. softmax는 숫자 여러 개를 받아 전부 양수이고 합이 1인 비율로 바꾸는 함수입니다. 각 숫자 $x$를 $e^x$로 바꾼 뒤 그 합으로 나눕니다.

$$
\text{softmax}(x_i) = \frac{e^{x_i}}{\sum_j e^{x_j}}
$$

큰 숫자는 큰 몫을, 작은 숫자는 작은 몫을 받습니다. 위의 점수를 넣으면 민수는 0.3, 어제 0.1, 빌린 0.1, 책을 0.5가 나옵니다. 목적어인 "책을"과 주어인 "민수는"에 무게가 실렸습니다.

**3단계, 합산.** 이 비율대로 네 단어의 V를 섞습니다. 책을의 V에 0.5, 민수는의 V에 0.3, 나머지 둘에 0.1씩 곱해서 더합니다. 이렇게 만든 벡터가 "돌려줬다" 위치의 어텐션 출력입니다. "돌려줬다"가 앞 단어들에서 필요한 정보를 골라 담아 온 결과입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 420 352" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="돌려줬다 위치의 어텐션 계산 예시. 돌려줬다의 Query가 네 단어의 Key와 만나 softmax 가중치 0.3, 0.1, 0.1, 0.5가 되고, 이 비율로 각 단어의 Value를 섞어 돌려줬다의 출력을 만듭니다.">
  <style>
    .tf6-q   { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf6-k   { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf6-sum { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf6-out { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf6-t   { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf6-w   { fill: var(--primary, #0a756c); font-size: 16px; text-anchor: middle; }
    .tf6-cap { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .tf6-ln  { stroke: var(--primary, #0a756c); fill: none; }
    .tf6-ar  { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf6Ar); }
  </style>
  <defs>
    <marker id="tf6Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <text x="210" y="22" class="tf6-cap">가중치는 예시 값</text>
  <rect x="140" y="34" width="140" height="38" rx="6" class="tf6-q"/>
  <text x="210" y="59" class="tf6-t">돌려줬다의 Q</text>
  <path d="M170,76 L63,130" class="tf6-ln" stroke-width="3"/>
  <path d="M196,76 L161,130" class="tf6-ln" stroke-width="1.2"/>
  <path d="M224,76 L259,130" class="tf6-ln" stroke-width="1.2"/>
  <path d="M250,76 L357,130" class="tf6-ln" stroke-width="5"/>
  <text x="100" y="110" class="tf6-w">0.3</text>
  <text x="176" y="110" class="tf6-w">0.1</text>
  <text x="244" y="110" class="tf6-w">0.1</text>
  <text x="330" y="110" class="tf6-w">0.5</text>
  <rect x="18" y="134" width="90" height="38" rx="6" class="tf6-k"/>
  <text x="63" y="159" class="tf6-t">민수는</text>
  <rect x="116" y="134" width="90" height="38" rx="6" class="tf6-k"/>
  <text x="161" y="159" class="tf6-t">어제</text>
  <rect x="214" y="134" width="90" height="38" rx="6" class="tf6-k"/>
  <text x="259" y="159" class="tf6-t">빌린</text>
  <rect x="312" y="134" width="90" height="38" rx="6" class="tf6-k"/>
  <text x="357" y="159" class="tf6-t">책을</text>
  <text x="210" y="196" class="tf6-cap">각 단어의 K와 내적 → softmax</text>
  <path d="M210,204 L210,222" class="tf6-ar"/>
  <rect x="90" y="226" width="240" height="38" rx="6" class="tf6-sum"/>
  <text x="210" y="251" class="tf6-t">V를 가중치 비율로 합산</text>
  <path d="M210,268 L210,286" class="tf6-ar"/>
  <rect x="110" y="290" width="200" height="38" rx="6" class="tf6-out"/>
  <text x="210" y="315" class="tf6-t">돌려줬다의 출력</text>
  <text x="210" y="346" class="tf6-cap">선 굵기 = 가중치 크기</text>
</svg>
</div>

같은 계산을 모든 위치에서 동시에 합니다. 각 위치의 Q, K, V를 행으로 쌓아 행렬 $Q$, $K$, $V$로 만들면 전체가 행렬 곱 몇 번으로 끝납니다.

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
$$

문장 길이가 $n$이고 K 벡터의 차원이 $d_k$라고 하겠습니다.

| 기호 | 뜻 | 크기 |
|---|---|---|
| $Q$, $K$, $V$ | 모든 위치의 q, k, v 벡터를 행으로 쌓은 행렬 | $n \times d_k$ |
| $QK^\top$ | 모든 위치 쌍의 점수. $i$행 $j$열은 위치 $i$의 Q와 위치 $j$의 K의 내적 | $n \times n$ |
| $\sqrt{d_k}$ | 점수가 차원 수 때문에 지나치게 커지지 않게 맞추는 나눗셈 | 숫자 하나 |
| softmax | 행마다 적용. 각 위치의 가중치 합이 1 | $n \times n$ |
| $\cdots V$ | 가중치 비율로 V를 합산 | $n \times d_k$ |

위 예시의 1단계가 $QK^\top$의 "돌려줬다" 행이고 2단계가 그 행의 softmax, 3단계가 $V$와의 곱입니다. 식에 새로 보이는 것은 $\sqrt{d_k}$로 나누는 부분 하나입니다.

<br>

## √d_k로 나누는 이유

내적은 $d_k$개의 곱을 더한 값입니다. $d_k = 4$면 곱 네 개를 더하고 $d_k = 128$이면 128개를 더합니다.

$$
q \cdot k = q_1 k_1 + q_2 k_2 + \cdots + q_{d_k} k_{d_k}
$$

더하는 항이 많아지면 합도 크게 흔들립니다. Q와 K의 각 원소가 평균 0, 분산 1인 값이고 서로 독립이라고 가정하면 곱 하나 $q_i k_i$도 평균 0, 분산 1입니다. 독립인 값들을 더하면 분산은 그대로 더해지므로 $d_k$개를 더한 내적의 분산은 $d_k$, 표준편차는 $\sqrt{d_k}$가 됩니다.

| $d_k$ | 내적의 표준편차 | $\sqrt{d_k}$로 나눈 뒤 |
|---|---|---|
| 4 | 2 | 1 |
| 64 | 8 | 1 |
| 128 | 약 11.3 | 1 |

:::info

**곱의 분산이 1인 이유**

$q_i$와 $k_i$가 독립이고 각각 평균 0, 분산 1이면 $E[q_i k_i] = E[q_i]E[k_i] = 0$이고, $\text{Var}(q_i k_i) = E[q_i^2 k_i^2] - 0 = E[q_i^2]\,E[k_i^2] = 1 \times 1 = 1$입니다.

:::

$d_k = 128$이면 점수가 ±11 정도로 흔들리고 위치 간 점수 차이는 수십까지 벌어질 수 있습니다. 이 숫자들이 softmax로 들어가면 무슨 일이 생기는지가 핵심입니다.

softmax는 입력의 차이를 지수적으로 키웁니다. 숫자 두 개만 넣어 보면 바로 보입니다.

| softmax 입력 | 출력 |
|---|---|
| [1, 2] | [0.27, 0.73] |
| [0, 3] | [0.05, 0.95] |
| [0, 10] | [0.00005, 0.99995] |
| [0, 30] | [0.0000000000001, 거의 1] |

차이가 1이면 둘 다 의미 있는 몫을 받지만 차이가 10만 돼도 한쪽이 사실상 전부를 가져갑니다. 30이면 다른 쪽은 소수점 아래 13자리에서야 숫자가 나타납니다. 점수 차이가 수십까지 벌어지는 $d_k = 128$에서 스케일링 없이 softmax를 하면 거의 모든 위치에서 한 단어만 보는 극단적인 분포가 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 352" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스케일링 전후의 softmax 출력 비교. 위쪽은 스케일링이 없어 한 위치가 확률 0.99를 가져가고 나머지가 0에 가깝습니다. 아래쪽은 루트 d k로 나눠 0.45를 필두로 여러 위치에 가중치가 분산됩니다.">
  <style>
    .tf7-hA   { fill: var(--text-danger, #cb2121); font-size: 17px; }
    .tf7-hB   { fill: var(--primary, #0a756c); font-size: 17px; }
    .tf7-peak { fill: var(--text-danger, #cb2121); }
    .tf7-ok   { fill: var(--primary, #0a756c); }
    .tf7-bar  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
    .tf7-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf7-lab  { fill: var(--text-muted, #6d6762); font-size: 15px; }
    .tf7-div  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
  </style>
  <text x="20" y="26" class="tf7-hA">스케일링 없음</text>
  <text x="98" y="52" class="tf7-lab">0.99</text>
  <rect x="52" y="58" width="40" height="82" class="tf7-peak"/>
  <rect x="116" y="137" width="40" height="3" class="tf7-bar"/>
  <rect x="180" y="138" width="40" height="2" class="tf7-bar"/>
  <rect x="244" y="138" width="40" height="2" class="tf7-bar"/>
  <rect x="308" y="139" width="40" height="1" class="tf7-bar"/>
  <line x1="20" y1="140" x2="380" y2="140" class="tf7-axis"/>
  <text x="20" y="168" class="tf7-lab">한 위치가 전부 → 기울기 소실</text>
  <line x1="20" y1="186" x2="380" y2="186" class="tf7-div"/>
  <text x="20" y="214" class="tf7-hB">√d_k로 나눔</text>
  <text x="98" y="230" class="tf7-lab">0.45</text>
  <rect x="52" y="236" width="40" height="80" class="tf7-ok"/>
  <rect x="116" y="276" width="40" height="40" class="tf7-ok"/>
  <rect x="180" y="291" width="40" height="25" class="tf7-ok"/>
  <rect x="244" y="298" width="40" height="18" class="tf7-ok"/>
  <rect x="308" y="304" width="40" height="12" class="tf7-ok"/>
  <line x1="20" y1="316" x2="380" y2="316" class="tf7-axis"/>
  <text x="20" y="344" class="tf7-lab">여러 위치에 가중치 분산</text>
</svg>
</div>

이게 왜 학습을 막는지는 softmax의 미분을 보면 드러납니다. 출력 $y_i$를 자기 입력으로 미분하면 $y_i(1 - y_i)$입니다. $y_i = 0.5$면 0.25로 넉넉하지만 $y_i = 0.999999$면 약 0.000001입니다. 출력이 0이나 1에 붙어 버리면 기울기가 0에 가까워집니다. 기울기가 없으면 "이 위치를 조금 더 볼까, 덜 볼까"를 조정할 신호가 흐르지 않습니다. 가중치를 한 곳에 몰아준 채로 학습이 멈춥니다. 이 상태를 softmax가 포화(saturation)됐다고 합니다.

그래서 $QK^\top$를 그대로 쓰지 않고 $\sqrt{d_k}$로 나눕니다. 어떤 값 $X$를 $c$로 나누면 분산은 $c^2$으로 나뉩니다. 내적의 분산이 $d_k$이니 $c^2 = d_k$, 즉 $c = \sqrt{d_k}$일 때 분산이 정확히 1로 돌아옵니다. $d_k$로 나누면 분산이 $1/d_k$로 너무 작아져 모든 점수가 거의 같아지니 지나치고 $\sqrt{d_k}$가 딱 맞는 값입니다. 분산을 1로 되돌리는 값이 자연스럽게 $\sqrt{d_k}$로 나옵니다.

스케일링은 "항상 여러 단어를 골고루 보라"는 장치가 아닙니다. 학습이 끝난 모델이 어떤 자리에서 정말 한 단어만 봐야 한다면 나눈 뒤의 점수가 [0.2, 0.3, 8.0, 0.1]처럼 나와서 여전히 한 곳에 집중합니다. 스케일링이 막는 것은 따로 있습니다. 차원 수가 크다는 이유만으로 학습 초기부터 분포가 무조건 극단으로 가 버리는 일입니다. 필요할 때는 집중하되 $d_k$ 때문에 억지로 집중하지는 않게 하는 장치입니다.

<br>

## 미래를 가리는 causal mask

식에는 아직 조건 하나가 빠져 있습니다. $QK^\top$는 모든 위치 쌍의 점수를 만듭니다. 3행 5열은 "위치 3의 Q가 위치 5의 K와 만난 점수"인데 이 칸을 그대로 두면 앞 단어가 뒤 단어를 볼 수 있습니다.

학습 중인 모델을 생각해 봅시다. 학습 문장이 "민수는 어제 빌린 책을 돌려줬다"이고 위치 4 "책을"에서는 다음 단어 "돌려줬다"를 맞혀야 합니다. 그런데 위치 4의 계산에 위치 5의 정보가 섞여 들어오면 모델은 다음 단어가 "돌려줬다"라는 것을 이미 아는 상태에서 답을 씁니다. 시험 문제 옆에 정답이 적혀 있는 셈입니다. 모델은 앞 단어들로 다음을 추론하는 법 대신 옆의 답을 베끼는 법을 배웁니다. 실제로 문장을 생성할 때는 위치 5가 아직 없으니 베낄 것도 없고 그때 모델은 무너집니다.

그래서 규칙을 하나 둡니다. 각 위치는 자기 자신과 그 앞만 볼 수 있습니다.

| Query 위치 | 볼 수 있는 Key 위치 |
|---|---|
| 1 | 1 |
| 2 | 1, 2 |
| 3 | 1, 2, 3 |
| 4 | 1, 2, 3, 4 |
| 5 | 1, 2, 3, 4, 5 |

Query 위치를 $i$, Key 위치를 $j$라고 하면 $j \le i$인 칸만 허용하는 규칙입니다. 점수 행렬에서 대각선 위쪽, 즉 미래에 해당하는 칸을 softmax에 들어가기 전에 $-\infty$로 바꿉니다. 이것이 **causal mask(인과 마스크)**입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 386" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="causal mask를 나타낸 5×5 격자. 행이 질문하는 위치, 열이 참조되는 위치이고, 대각선 위쪽의 미래 위치 칸은 점수가 마이너스 무한대로 가려져 있습니다.">
  <style>
    .tf5-ok  { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.2; }
    .tf5-no  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; stroke-dasharray: 4 3; }
    .tf5-inf { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tf5-idx { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .tf5-ax  { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .tf5-leg { fill: var(--text-muted, #6d6762); font-size: 15px; }
  </style>
  <text x="204" y="24" class="tf5-ax">Key 위치 (참조되는 쪽)</text>
  <text x="24" y="180" class="tf5-ax" transform="rotate(-90,24,180)">Query 위치 (질문하는 쪽)</text>
  <text x="108" y="50" class="tf5-idx">1</text>
  <text x="156" y="50" class="tf5-idx">2</text>
  <text x="204" y="50" class="tf5-idx">3</text>
  <text x="252" y="50" class="tf5-idx">4</text>
  <text x="300" y="50" class="tf5-idx">5</text>
  <text x="66" y="88" class="tf5-idx">1</text>
  <rect x="84" y="60" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="132" y="60" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="154" y="87" class="tf5-inf">−∞</text>
  <rect x="180" y="60" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="202" y="87" class="tf5-inf">−∞</text>
  <rect x="228" y="60" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="250" y="87" class="tf5-inf">−∞</text>
  <rect x="276" y="60" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="298" y="87" class="tf5-inf">−∞</text>
  <text x="66" y="136" class="tf5-idx">2</text>
  <rect x="84" y="108" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="132" y="108" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="180" y="108" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="202" y="135" class="tf5-inf">−∞</text>
  <rect x="228" y="108" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="250" y="135" class="tf5-inf">−∞</text>
  <rect x="276" y="108" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="298" y="135" class="tf5-inf">−∞</text>
  <text x="66" y="184" class="tf5-idx">3</text>
  <rect x="84" y="156" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="132" y="156" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="180" y="156" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="228" y="156" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="250" y="183" class="tf5-inf">−∞</text>
  <rect x="276" y="156" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="298" y="183" class="tf5-inf">−∞</text>
  <text x="66" y="232" class="tf5-idx">4</text>
  <rect x="84" y="204" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="132" y="204" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="180" y="204" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="228" y="204" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="276" y="204" width="44" height="44" rx="5" class="tf5-no"/>
  <text x="298" y="231" class="tf5-inf">−∞</text>
  <text x="66" y="280" class="tf5-idx">5</text>
  <rect x="84" y="252" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="132" y="252" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="180" y="252" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="228" y="252" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="276" y="252" width="44" height="44" rx="5" class="tf5-ok"/>
  <rect x="84" y="330" width="18" height="18" rx="4" class="tf5-ok"/>
  <text x="110" y="344" class="tf5-leg">참조 가능</text>
  <rect x="204" y="330" width="18" height="18" rx="4" class="tf5-no"/>
  <text x="230" y="344" class="tf5-leg">가림 (점수 −∞ → 가중치 0)</text>
</svg>
</div>

왜 0이 아니라 $-\infty$일까요. "못 보게 하려면 점수를 0으로 만들면 되지 않나"가 자연스러운 첫 생각인데 softmax 때문에 안 됩니다. softmax는 점수를 $e^x$로 바꿔 비율을 냅니다. 점수가 0이면 $e^0 = 1$이라 여전히 몫을 받습니다. 점수가 [2, 1]인 두 위치 뒤에 미래 위치 하나를 0으로 붙이면 softmax는 [0.67, 0.24, 0.09]가 되어 미래 위치가 9%를 가져갑니다. 반면 $e^{-\infty} = 0$이니 $-\infty$를 넣으면 그 자리의 가중치가 정확히 0이 됩니다. [2, 1, −∞]의 softmax는 [0.73, 0.27, 0]입니다. 미래 위치를 완전히 지우는 장치가 $-\infty$입니다. 실제 구현에서는 무한대 대신 $-10^9$ 같은 아주 작은 수를 더하거나 마스크 위치를 아예 건너뛰는 커널을 쓰는데 효과는 같습니다.

이 마스크 $M$을 식에 넣으면 디코더의 어텐션이 완성됩니다. $M$은 허용 칸이 0, 미래 칸이 $-\infty$인 $n \times n$ 행렬입니다.

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}} + M\right)V
$$

두 장치는 서로 다른 문제를 풉니다. $\sqrt{d_k}$는 점수의 크기를 다루고 causal mask는 어느 칸을 볼 수 있는지를 다룹니다. 여기까지의 계산을 순서대로 늘어놓으면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 460" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="디코더 어텐션 한 단계의 흐름을 위에서 아래로 나열한 그림. 입력에 W_Q, W_K, W_V를 곱해 Q, K, V를 만들고, QK 전치로 점수를 구하고, 루트 d k로 나누고, 마스크로 미래 칸을 마이너스 무한대로 바꾸고, softmax로 가중치를 만든 뒤 V와 곱해 출력을 냅니다.">
  <style>
    .tf10-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf10-sc   { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf10-mk   { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf10-out  { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf10-t    { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .tf10-n    { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tf10-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf10Ar); }
  </style>
  <defs>
    <marker id="tf10Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <!-- 1 -->
  <text x="36" y="45" class="tf10-n">1</text>
  <rect x="60" y="20" width="280" height="40" rx="6" class="tf10-box"/>
  <text x="200" y="45" class="tf10-t">x → W_Q, W_K, W_V → Q, K, V</text>
  <path d="M200,60 L200,82" class="tf10-ar"/>
  <!-- 2 -->
  <text x="36" y="109" class="tf10-n">2</text>
  <rect x="60" y="84" width="280" height="40" rx="6" class="tf10-box"/>
  <text x="200" y="109" class="tf10-t">QKᵀ: 모든 위치 쌍의 점수</text>
  <path d="M200,124 L200,146" class="tf10-ar"/>
  <!-- 3 -->
  <text x="36" y="173" class="tf10-n">3</text>
  <rect x="60" y="148" width="280" height="40" rx="6" class="tf10-sc"/>
  <text x="200" y="173" class="tf10-t">÷ √d_k: 점수 크기 보정</text>
  <path d="M200,188 L200,210" class="tf10-ar"/>
  <!-- 4 -->
  <text x="36" y="237" class="tf10-n">4</text>
  <rect x="60" y="212" width="280" height="40" rx="6" class="tf10-mk"/>
  <text x="200" y="237" class="tf10-t">+ M: 미래 칸을 −∞로</text>
  <path d="M200,252 L200,274" class="tf10-ar"/>
  <!-- 5 -->
  <text x="36" y="301" class="tf10-n">5</text>
  <rect x="60" y="276" width="280" height="40" rx="6" class="tf10-box"/>
  <text x="200" y="301" class="tf10-t">softmax: 행마다 가중치 (합 1)</text>
  <path d="M200,316 L200,338" class="tf10-ar"/>
  <!-- 6 -->
  <text x="36" y="365" class="tf10-n">6</text>
  <rect x="60" y="340" width="280" height="40" rx="6" class="tf10-box"/>
  <text x="200" y="365" class="tf10-t">× V: 가중치 비율로 합산</text>
  <path d="M200,380 L200,402" class="tf10-ar"/>
  <!-- 7 -->
  <text x="36" y="429" class="tf10-n">7</text>
  <rect x="60" y="404" width="280" height="40" rx="6" class="tf10-out"/>
  <text x="200" y="429" class="tf10-t">출력 (위치마다 벡터 하나)</text>
</svg>
</div>

<br>

## 앞 토큰의 K, V는 바뀌지 않는다

causal mask는 학습용 규칙처럼 보이지만 추론 엔진이 가장 크게 기대는 성질을 하나 만들어 냅니다. 앞 토큰의 K와 V가 한 번 정해지면 그 뒤로 바뀌지 않는다는 성질입니다.

생성 과정을 따라가 봅시다. 프롬프트가 "민수는 어제 빌린 책을"이고 모델이 "돌려줬다"를 골랐습니다. 이제 문장은 다섯 단어이고 모델은 여섯 번째 단어를 고르려고 다시 계산합니다. "민수는"의 K와 V를 다시 계산해야 할까요?

첫 레이어부터 봅니다. 첫 레이어의 입력은 각 단어의 임베딩 $x_1, \ldots, x_5$입니다. causal mask 때문에 위치 1은 $x_1$만 볼 수 있으니 위치 1의 출력 $h_1$은 $x_1$만으로 정해집니다. 위치 2의 출력 $h_2$는 $x_1, x_2$로, 위치 3은 $x_1, x_2, x_3$로 정해집니다. 뒤에 "돌려줬다"의 $x_5$가 새로 붙어도 $h_1$부터 $h_4$까지는 애초에 $x_5$를 볼 수 없었으니 그대로입니다.

Transformer는 이런 레이어를 수십 개 쌓습니다. 두 번째 레이어의 입력은 첫 레이어의 출력 $h_1, \ldots, h_5$입니다. 여기서도 마스크가 적용되므로 두 번째 레이어의 위치 1은 $h_1$만 봅니다. $h_1$은 $x_1$만으로 정해졌으니 결국 두 번째 레이어의 위치 1도 $x_1$만으로 정해집니다. 같은 논리가 세 번째, 네 번째 레이어에도 그대로 반복됩니다. 위치 $i$의 표현은 어느 레이어에서든 $i$보다 뒤의 토큰에 의존하지 않습니다. K와 V는 그 표현에 $W_K$, $W_V$를 곱한 것이니 마찬가지로 바뀌지 않습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 330" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="임베딩, Layer 1, Layer 2 세 줄에 위치 1부터 5까지 상자가 있고 오른쪽에 새 토큰인 위치 6이 점선으로 붙어 있습니다. 위치 3은 어느 레이어에서든 위치 1, 2, 3에서만 화살표를 받고, 위치 1은 자기 자신에게서만 받습니다. 새 토큰 위치 6에서 앞 위치로 가는 화살표는 없습니다.">
  <style>
    .tf8-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf8-cur { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.8; }
    .tf8-new { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; stroke-dasharray: 4 3; }
    .tf8-t   { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .tf8-row { fill: var(--text-muted, #6d6762); font-size: 14px; }
    .tf8-cap { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tf8-leg { fill: var(--text-muted, #6d6762); font-size: 14px; }
    .tf8-a3  { stroke: var(--primary, #0a756c); stroke-width: 1.6; fill: none; marker-end: url(#tf8ArG); }
    .tf8-a1  { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; marker-end: url(#tf8Ar); }
    .tf8-a6  { stroke: var(--accent, #9d5604); stroke-width: 1.4; fill: none; stroke-dasharray: 4 3; marker-end: url(#tf8ArA); }
  </style>
  <defs>
    <marker id="tf8Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
    <marker id="tf8ArG" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--primary, #0a756c)"/></marker>
    <marker id="tf8ArA" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--accent, #9d5604)"/></marker>
  </defs>
  <text x="229" y="22" class="tf8-cap">위 레이어도 같은 규칙</text>
  <!-- Layer 2 -->
  <text x="8" y="66" class="tf8-row">Layer 2</text>
  <rect x="72" y="44" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="94" y="66" class="tf8-t">h₁</text>
  <rect x="126" y="44" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="148" y="66" class="tf8-t">h₂</text>
  <rect x="180" y="44" width="44" height="34" rx="5" class="tf8-cur"/>
  <text x="202" y="66" class="tf8-t">h₃</text>
  <rect x="234" y="44" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="256" y="66" class="tf8-t">h₄</text>
  <rect x="288" y="44" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="310" y="66" class="tf8-t">h₅</text>
  <rect x="342" y="44" width="44" height="34" rx="5" class="tf8-new"/>
  <text x="364" y="66" class="tf8-t">h₆</text>
  <!-- Layer 1 -->
  <text x="8" y="146" class="tf8-row">Layer 1</text>
  <rect x="72" y="124" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="94" y="146" class="tf8-t">h₁</text>
  <rect x="126" y="124" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="148" y="146" class="tf8-t">h₂</text>
  <rect x="180" y="124" width="44" height="34" rx="5" class="tf8-cur"/>
  <text x="202" y="146" class="tf8-t">h₃</text>
  <rect x="234" y="124" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="256" y="146" class="tf8-t">h₄</text>
  <rect x="288" y="124" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="310" y="146" class="tf8-t">h₅</text>
  <rect x="342" y="124" width="44" height="34" rx="5" class="tf8-new"/>
  <text x="364" y="146" class="tf8-t">h₆</text>
  <!-- 임베딩 -->
  <text x="8" y="226" class="tf8-row">임베딩</text>
  <rect x="72" y="204" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="94" y="226" class="tf8-t">x₁</text>
  <rect x="126" y="204" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="148" y="226" class="tf8-t">x₂</text>
  <rect x="180" y="204" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="202" y="226" class="tf8-t">x₃</text>
  <rect x="234" y="204" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="256" y="226" class="tf8-t">x₄</text>
  <rect x="288" y="204" width="44" height="34" rx="5" class="tf8-box"/>
  <text x="310" y="226" class="tf8-t">x₅</text>
  <rect x="342" y="204" width="44" height="34" rx="5" class="tf8-new"/>
  <text x="364" y="226" class="tf8-t">x₆</text>
  <!-- 위치 3 참조 -->
  <path d="M94,204 L190,159" class="tf8-a3"/>
  <path d="M148,204 L198,159" class="tf8-a3"/>
  <path d="M202,204 L206,159" class="tf8-a3"/>
  <path d="M94,124 L190,79" class="tf8-a3"/>
  <path d="M148,124 L198,79" class="tf8-a3"/>
  <path d="M202,124 L206,79" class="tf8-a3"/>
  <!-- 위치 1 참조 -->
  <path d="M94,204 L94,159" class="tf8-a1"/>
  <path d="M94,124 L94,79" class="tf8-a1"/>
  <!-- 새 토큰 -->
  <path d="M364,204 L364,159" class="tf8-a6"/>
  <path d="M364,124 L364,79" class="tf8-a6"/>
  <text x="202" y="258" class="tf8-cap">위치 1 ~ 5</text>
  <text x="364" y="258" class="tf8-cap">새 토큰</text>
  <!-- 범례 -->
  <path d="M20,284 L54,284" class="tf8-a3"/>
  <text x="62" y="289" class="tf8-leg">위치 3의 참조</text>
  <path d="M200,284 L234,284" class="tf8-a1"/>
  <text x="242" y="289" class="tf8-leg">위치 1의 참조</text>
  <path d="M20,308 L54,308" class="tf8-a6"/>
  <text x="62" y="313" class="tf8-leg">새 토큰 (앞 위치 참조 없음)</text>
</svg>
</div>

그래서 추론 엔진은 한 번 계산한 K, V를 저장해 둡니다. 이것이 KV Cache입니다. 다섯 번째 토큰을 만드는 단계를 보면 캐시에는 $K_1 \ldots K_4$와 $V_1 \ldots V_4$가 이미 들어 있습니다. 새 토큰에 대해서만 $Q_5$, $K_5$, $V_5$를 계산하고 $K_5$와 $V_5$를 캐시 끝에 붙입니다. 그다음 $Q_5$를 캐시의 K 다섯 개와 내적해 가중치를 구하고 그 비율로 V 다섯 개를 합산합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 396" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="KV Cache를 쓴 다섯 번째 토큰 생성 단계. 새로 계산한 Q5가 캐시에 있던 K1부터 K4와 새로 계산한 K5에 선으로 이어지고, 선 굵기가 가중치 0.3, 0.1, 0.1, 0.4, 0.1을 나타냅니다. 그 아래 V1부터 V5를 가중치로 합산해 다섯 번째 위치의 출력을 만듭니다.">
  <style>
    .tf9-new  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf9-old  { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf9-sum  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf9-t    { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
    .tf9-h    { fill: var(--text, #1c1917); font-size: 15px; }
    .tf9-w    { fill: var(--primary, #0a756c); font-size: 14px; text-anchor: middle; }
    .tf9-cap  { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tf9-capR { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: end; }
    .tf9-ln   { stroke: var(--primary, #0a756c); fill: none; }
    .tf9-br   { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf9-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf9Ar); }
  </style>
  <defs>
    <marker id="tf9Ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <text x="8" y="22" class="tf9-h">5번째 토큰을 만드는 단계</text>
  <rect x="120" y="38" width="160" height="34" rx="6" class="tf9-new"/>
  <text x="200" y="60" class="tf9-t">Q₅ (새로 계산)</text>
  <!-- Q5 → 각 K -->
  <path d="M200,72 L60,110" class="tf9-ln" stroke-width="3"/>
  <path d="M200,72 L130,110" class="tf9-ln" stroke-width="1.2"/>
  <path d="M200,72 L200,110" class="tf9-ln" stroke-width="1.2"/>
  <path d="M200,72 L270,110" class="tf9-ln" stroke-width="4"/>
  <path d="M200,72 L340,110" class="tf9-ln" stroke-width="1.2"/>
  <text x="60" y="124" class="tf9-w">0.3</text>
  <text x="130" y="124" class="tf9-w">0.1</text>
  <text x="200" y="124" class="tf9-w">0.1</text>
  <text x="270" y="124" class="tf9-w">0.4</text>
  <text x="340" y="124" class="tf9-w">0.1</text>
  <!-- K 행 -->
  <rect x="32" y="130" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="60" y="152" class="tf9-t">K₁</text>
  <rect x="102" y="130" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="130" y="152" class="tf9-t">K₂</text>
  <rect x="172" y="130" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="200" y="152" class="tf9-t">K₃</text>
  <rect x="242" y="130" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="270" y="152" class="tf9-t">K₄</text>
  <rect x="312" y="130" width="56" height="34" rx="5" class="tf9-new"/>
  <text x="340" y="152" class="tf9-t">K₅</text>
  <!-- V 행 -->
  <rect x="32" y="184" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="60" y="206" class="tf9-t">V₁</text>
  <rect x="102" y="184" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="130" y="206" class="tf9-t">V₂</text>
  <rect x="172" y="184" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="200" y="206" class="tf9-t">V₃</text>
  <rect x="242" y="184" width="56" height="34" rx="5" class="tf9-old"/>
  <text x="270" y="206" class="tf9-t">V₄</text>
  <rect x="312" y="184" width="56" height="34" rx="5" class="tf9-new"/>
  <text x="340" y="206" class="tf9-t">V₅</text>
  <!-- 구분 -->
  <line x1="32" y1="232" x2="298" y2="232" class="tf9-br"/>
  <line x1="312" y1="232" x2="368" y2="232" class="tf9-br"/>
  <text x="165" y="250" class="tf9-cap">캐시에 있던 값</text>
  <text x="340" y="250" class="tf9-cap">새로 계산</text>
  <!-- 합산 -->
  <path d="M200,262 L200,278" class="tf9-ar"/>
  <rect x="70" y="280" width="260" height="34" rx="6" class="tf9-sum"/>
  <text x="200" y="302" class="tf9-t">V₁ ~ V₅를 가중치로 합산</text>
  <path d="M200,314 L200,332" class="tf9-ar"/>
  <rect x="100" y="334" width="200" height="34" rx="6" class="tf9-sum"/>
  <text x="200" y="356" class="tf9-t">5번째 위치의 출력</text>
  <text x="200" y="388" class="tf9-cap">가중치는 예시 값, 선 굵기 = 가중치</text>
</svg>
</div>

Q는 왜 저장하지 않을까요. $Q_5$가 쓰이는 곳은 위치 5의 행 하나뿐입니다. 다음 단계에서 여섯 번째 토큰을 만들 때 필요한 것은 $Q_6$이지 $Q_5$가 아닙니다. 반면 K와 V는 다릅니다. $Q_6$은 $K_1$부터 $K_6$까지 전부와 비교해야 하고 그 가중치로 $V_1$부터 $V_6$까지 전부를 합산해야 합니다.

| 벡터 | 생성 단계마다 필요한 것 | 저장 |
|---|---|---|
| Q | 현재 토큰의 것 하나 | 안 함 |
| K | 과거 토큰 전부 | 캐시 |
| V | 과거 토큰 전부 | 캐시 |

캐시가 없으면 어떻게 되는지도 세어 봅시다. 토큰 1,000개를 차례로 생성한다고 하면 두 번째 단계에서 토큰 1과 2를, 세 번째 단계에서 토큰 1, 2, 3을, 1,000번째 단계에서 토큰 1부터 1,000까지를 처음부터 다시 계산합니다. 전부 더하면 약 50만 토큰분의 계산이고 캐시를 쓰면 1,000토큰분입니다. 이미 계산한 앞부분을 평균 500번씩 다시 계산하는 셈입니다.

KV Cache는 "예전에 계산했으니 저장해 두면 빠르다"는 단순한 최적화가 아닙니다. 저장한 값을 다시 써도 되는 근거가 따로 있습니다. causal mask가 그 근거입니다. 과거 위치의 K, V는 미래 토큰이 붙어도 흔들리지 않습니다. 그래서 그 값을 다시 써도 안전합니다. 마스크가 없는 구조라면 위치 1이 위치 5를 볼 수 있고 토큰 6이 붙는 순간 위치 1의 표현이 바뀌어 $K_1$, $V_1$을 다시 계산해야 합니다. 미래 토큰 추가가 과거 표현을 바꾸고, 과거 K, V가 바뀌고, 캐시를 다시 쓸 수 없게 됩니다. 그리고 캐시는 모델이 맞게 동작하기 위한 필수 요소도 아닙니다. 캐시 없이 매번 처음부터 계산해도 결과는 같고 단지 생성 속도가 크게 떨어질 뿐입니다.

이 흐름은 한 줄로 이어집니다. 다음 토큰을 예측해야 하니 미래 토큰을 보면 안 되고, 그래서 causal mask를 씌우고, 그 결과 각 위치는 자기와 과거만 참조하고, 따라서 앞 위치의 표현은 토큰이 추가되어도 변하지 않고, 앞 위치의 K, V도 변하지 않고, 그래서 저장해도 안전하고, 그것이 KV Cache입니다.

<br>

## 여러 시선으로 동시에 본다

지금까지 본 어텐션은 한 벌입니다. "돌려줬다"가 Q 하나를 들고 모든 K와 비교하니 나오는 가중치 패턴도 하나뿐입니다. 그런데 언어에는 여러 종류의 관계가 한꺼번에 있습니다. "돌려줬다"는 "민수"와 주어 관계를, "책"과 목적어 관계를, "어제"와 시간 관계를 동시에 맺고 있습니다. 가중치 패턴 하나로 이 세 관계를 모두 담으려면 0.3, 0.1, 0.1, 0.5처럼 뭉뚱그린 비율이 되고 어느 관계도 또렷하게 잡히지 않습니다.

**Multi-Head Attention**은 어텐션을 $h$벌 두어 이 문제를 풉니다. 각 벌을 헤드(head)라고 부르고 헤드마다 자기만의 $W_Q$, $W_K$, $W_V$가 있습니다. 같은 입력에서 헤드마다 다른 Q, K, V가 나오니 가중치 패턴도 헤드마다 다릅니다. 예를 들어 이런 식으로 역할이 갈릴 수 있습니다.

| 헤드 | 민수는 | 어제 | 빌린 | 책을 |
|---|---|---|---|---|
| 헤드 1 (주어를 찾는 쪽) | 0.7 | 0.1 | 0.1 | 0.1 |
| 헤드 2 (목적어를 찾는 쪽) | 0.1 | 0.0 | 0.2 | 0.7 |
| 헤드 3 (시간을 찾는 쪽) | 0.1 | 0.7 | 0.1 | 0.1 |

실제 모델의 헤드는 이렇게 깔끔하게 나뉘지 않지만, 헤드마다 서로 다른 패턴을 학습한다는 점은 같습니다.

헤드를 늘리면 계산이 $h$배가 될 것 같지만 그렇지 않습니다. 벡터 전체를 $h$조각으로 나누어 각 헤드가 한 조각에서만 일합니다. 모델의 벡터 차원 $d_{\text{model}}$이 512이고 헤드가 8개면 각 헤드의 Q, K, V는 64차원입니다. 8개 헤드의 출력(64차원 × 8)을 옆으로 이어 붙이면(concatenate) 다시 512차원이 되고 여기에 가중치 행렬 $W_O$를 곱해 헤드들의 결과를 섞어 줍니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 232" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Multi-Head Attention 구조. d_model 차원 입력이 h개의 head_dim 부분으로 나뉘어 각각 독립 어텐션을 거치고, 결과를 이어 붙여 W_O를 곱해 원래 차원으로 돌아옵니다.">
  <style>
    .tf3-bar  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf3-h1   { fill: var(--bg-warn, #fffbeb); }
    .tf3-h2   { fill: var(--bg-subtle, #f5f4f2); }
    .tf3-h3   { fill: var(--bg-success, #f0fdf4); }
    .tf3-h4   { fill: var(--bg-muted, #eeecea); }
    .tf3-att  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf3-out  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf3-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf3-lab  { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
    .tf3-dim  { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
    .tf3-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf3Ar); }
  </style>
  <defs>
    <marker id="tf3Ar" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <text x="44" y="20" class="tf3-lab">입력</text>
  <text x="16" y="96" class="tf3-dim" transform="rotate(-90,16,96)">d_model</text>
  <rect x="20" y="28" width="48" height="34" rx="4" class="tf3-bar tf3-h1"/>
  <rect x="20" y="62" width="48" height="34" rx="4" class="tf3-bar tf3-h2"/>
  <rect x="20" y="96" width="48" height="34" rx="4" class="tf3-bar tf3-h3"/>
  <rect x="20" y="130" width="48" height="34" rx="4" class="tf3-bar tf3-h4"/>
  <path d="M74,45 L108,45" class="tf3-ar"/>
  <path d="M74,79 L108,79" class="tf3-ar"/>
  <path d="M74,113 L108,113" class="tf3-ar"/>
  <path d="M74,147 L108,147" class="tf3-ar"/>
  <rect x="114" y="32" width="96" height="26" rx="6" class="tf3-att"/>
  <text x="162" y="51" class="tf3-t">Attention</text>
  <rect x="114" y="66" width="96" height="26" rx="6" class="tf3-att"/>
  <text x="162" y="85" class="tf3-t">Attention</text>
  <rect x="114" y="100" width="96" height="26" rx="6" class="tf3-att"/>
  <text x="162" y="119" class="tf3-t">Attention</text>
  <rect x="114" y="134" width="96" height="26" rx="6" class="tf3-att"/>
  <text x="162" y="153" class="tf3-t">Attention</text>
  <path d="M216,45 L250,45" class="tf3-ar"/>
  <path d="M216,79 L250,79" class="tf3-ar"/>
  <path d="M216,113 L250,113" class="tf3-ar"/>
  <path d="M216,147 L250,147" class="tf3-ar"/>
  <text x="280" y="20" class="tf3-lab">Concat</text>
  <rect x="256" y="28" width="48" height="34" rx="4" class="tf3-bar tf3-h1"/>
  <rect x="256" y="62" width="48" height="34" rx="4" class="tf3-bar tf3-h2"/>
  <rect x="256" y="96" width="48" height="34" rx="4" class="tf3-bar tf3-h3"/>
  <rect x="256" y="130" width="48" height="34" rx="4" class="tf3-bar tf3-h4"/>
  <path d="M310,96 L352,96" class="tf3-ar"/>
  <text x="331" y="86" class="tf3-dim">W_O</text>
  <text x="384" y="20" class="tf3-lab">출력</text>
  <rect x="360" y="28" width="48" height="136" rx="6" class="tf3-out"/>
  <text x="384" y="100" class="tf3-t" transform="rotate(-90,384,100)">d_model</text>
  <text x="162" y="190" class="tf3-dim">각각 head_dim 차원</text>
  <text x="240" y="222" class="tf3-lab">h = 4 헤드 (각각 독립 어텐션)</text>
</svg>
</div>

```text
MultiHead(Q, K, V) = Concat(head_1, ..., head_h) × W_O
head_i = Attention(X W_Q^i, X W_K^i, X W_V^i)
```

파라미터 수는 한 벌일 때와 같습니다. 512차원 입력에서 512차원 Q를 만드는 $W_Q$는 512 × 512 = 262,144개의 숫자입니다. 64차원 Q를 만드는 512 × 64 행렬 8개도 512 × 64 × 8 = 262,144개입니다. 같은 파라미터 예산으로 여러 관계를 동시에 잡는 구조입니다.

이 구조를 부르는 용어는 세 가지입니다.

- **헤드(head)**: 자기만의 $W_Q$, $W_K$, $W_V$를 가진 독립 어텐션 한 벌
- **헤드 차원(head_dim, $d_k$)**: 각 헤드 안에서 Q, K, V 벡터의 차원. 원 논문에서는 $d_{\text{model}} / h$이고, 요즘 모델은 따로 정하기도 합니다
- **헤드 수(n_heads, $h$)**: 나란히 실행되는 어텐션의 수

Llama 2 7B의 config를 보면 hidden size 4096, 헤드 32개, 헤드 차원 128입니다. 4096 / 32 = 128로 원 논문의 관계가 그대로 맞습니다. Gemma 4에서 "로컬 레이어는 헤드 차원 256, 글로벌 레이어는 512"라고 한 것도 바로 이 값입니다.

<br>

## KV head를 줄이면

Multi-Head Attention 원형에서는 모든 헤드가 자기만의 K, V를 갖습니다. 헤드가 32개면 레이어당 K, V 쌍도 32개이고 KV Cache도 32벌을 저장해야 합니다. 토큰 하나마다, 레이어마다 그렇습니다.

2019년 Shazeer가 제안한 **MQA(Multi-Query Attention)**는 이를 극단까지 줄입니다. Q만 헤드별로 따로 두고 K와 V는 모든 헤드가 한 벌을 나눠 씁니다. KV Cache가 32분의 1로 줄어 메모리 부담이 크게 내려갑니다. 대신 같은 K, V로 32개의 서로 다른 질문에 답해야 하니 표현력이 떨어질 수 있습니다.

**GQA(Grouped Query Attention)**는 그 중간입니다. 32개의 Q 헤드를 몇 개의 그룹으로 묶고 같은 그룹 안의 Q 헤드들이 K, V 한 벌을 공유합니다. 4개씩 8그룹이면 KV head 수가 8입니다. Llama 2 70B가 Q 헤드 64개를 8그룹으로 묶어 KV 헤드 8개를 두는 식입니다. MHA의 표현력과 MQA의 효율 사이에서 적당한 점을 찾은 것이 GQA입니다. Llama 2 70B 이후 대부분의 오픈 모델이 이 방식을 씁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 210" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="MHA와 GQA의 Q-to-KV 대응 비교. MHA에서는 Q 헤드 4개가 각각 자기만의 KV를 갖지만, GQA에서는 Q 헤드 2개가 KV 한 벌을 공유합니다.">
  <style>
    .tf4-q    { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf4-kv   { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf4-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf4-h    { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: middle; }
    .tf4-lab  { fill: var(--text-muted, #6d6762); font-size: 17px; text-anchor: middle; }
    .tf4-ln   { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; }
    .tf4-div  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
  </style>
  <text x="110" y="22" class="tf4-h">MHA</text>
  <rect x="22" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="43" y="53" class="tf4-t">Q₁</text>
  <rect x="70" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="91" y="53" class="tf4-t">Q₂</text>
  <rect x="118" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="139" y="53" class="tf4-t">Q₃</text>
  <rect x="166" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="187" y="53" class="tf4-t">Q₄</text>
  <line x1="43" y1="60" x2="43" y2="96" class="tf4-ln"/>
  <line x1="91" y1="60" x2="91" y2="96" class="tf4-ln"/>
  <line x1="139" y1="60" x2="139" y2="96" class="tf4-ln"/>
  <line x1="187" y1="60" x2="187" y2="96" class="tf4-ln"/>
  <rect x="22" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="43" y="117" class="tf4-t">KV₁</text>
  <rect x="70" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="91" y="117" class="tf4-t">KV₂</text>
  <rect x="118" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="139" y="117" class="tf4-t">KV₃</text>
  <rect x="166" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="187" y="117" class="tf4-t">KV₄</text>
  <text x="110" y="150" class="tf4-lab">KV head 4개</text>
  <line x1="230" y1="16" x2="230" y2="160" class="tf4-div"/>
  <text x="370" y="22" class="tf4-h">GQA</text>
  <rect x="282" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="303" y="53" class="tf4-t">Q₁</text>
  <rect x="330" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="351" y="53" class="tf4-t">Q₂</text>
  <rect x="378" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="399" y="53" class="tf4-t">Q₃</text>
  <rect x="426" y="36" width="42" height="24" rx="5" class="tf4-q"/>
  <text x="447" y="53" class="tf4-t">Q₄</text>
  <line x1="303" y1="60" x2="327" y2="96" class="tf4-ln"/>
  <line x1="351" y1="60" x2="327" y2="96" class="tf4-ln"/>
  <line x1="399" y1="60" x2="423" y2="96" class="tf4-ln"/>
  <line x1="447" y1="60" x2="423" y2="96" class="tf4-ln"/>
  <rect x="306" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="327" y="117" class="tf4-t">KV₁</text>
  <rect x="402" y="100" width="42" height="24" rx="5" class="tf4-kv"/>
  <text x="423" y="117" class="tf4-t">KV₂</text>
  <text x="370" y="150" class="tf4-lab">KV head 2개</text>
  <text x="110" y="190" class="tf4-lab">Q 1개당 KV 1개</text>
  <text x="370" y="190" class="tf4-lab">Q 2개가 KV 1개를 공유</text>
</svg>
</div>

이 레이어당 독립된 K, V 쌍의 수가 **KV head(KV 헤드)**입니다. MHA에서는 헤드 수와 같고 GQA에서는 그보다 작습니다. 이 값은 KV Cache 크기 계산에 그대로 들어갑니다. 토큰 하나가 차지하는 캐시 크기는 모델 config만으로 바로 나옵니다.

```text
토큰당 KV = 2(K, V) × 레이어 수 × KV head 수 × head_dim × dtype 바이트
```

맨 앞의 2는 K와 V 각각 한 벌, KV head 수는 레이어당 독립 K, V 쌍의 수, head_dim은 각 헤드 안 벡터의 차원입니다. Llama 2 70B(레이어 80, KV head 8, head_dim 128)를 fp16(2바이트)으로 올리면 토큰당 2 × 80 × 8 × 128 × 2 = 327,680바이트, 약 328KB입니다. 4,096토큰짜리 요청 하나가 약 1.3GB를 차지합니다. 같은 모델이 GQA 없이 KV head 64개를 그대로 썼다면 토큰당 약 2.6MB, 요청당 약 10.7GB입니다. GQA가 줄이는 것은 KV head 수입니다. 토큰당 KV가 그만큼 비례해서 줄어듭니다.

<br>

## 시퀀스 길이의 제곱이라는 대가

어텐션은 모든 위치 쌍의 점수를 계산합니다. 토큰이 $n$개면 점수 행렬이 $n \times n$이라 토큰이 2배가 되면 칸 수는 4배가 됩니다. 계산량과 메모리 모두 $O(n^2)$입니다. RNN은 토큰 수에 비례하는 $O(n)$이었습니다. 순차 계산을 병렬 계산으로 바꾸고 참조도 간접에서 직접으로 옮긴 대가로 시퀀스 길이의 제곱이 따라온 셈입니다.

숫자로 보면 감이 잡힙니다. 1,024 토큰이면 헤드당 약 100만 쌍, 8,192 토큰이면 약 6,700만 쌍, 128K 토큰이면 약 172억 쌍입니다. 초기 Transformer가 512토큰 문맥에 머문 이유가 여기 있고 문맥을 수만 토큰 이상으로 늘리는 데 아키텍처 수준의 손질이 필요했던 이유도 여기 있습니다.

메모리도 마찬가지입니다. $n \times n$ 점수 행렬을 헤드마다 저장하면 128K 문맥에 32헤드 기준 fp16으로 약 1TB입니다. FlashAttention은 이 행렬을 한꺼번에 만들지 않고 작은 타일 단위로 계산해 메모리 문제를 풀었습니다. 연산량 자체는 여전히 $O(n^2)$입니다.

RNN에는 없던 문제도 하나 따라옵니다. 위치 정보가 구조 안에 없습니다. RNN은 토큰을 순서대로 처리하니 위치가 저절로 반영됩니다. Transformer는 모든 위치를 동시에 계산하기 때문에 같은 토큰 묶음이면 순서를 바꿔도 각 토큰의 출력이 달라지지 않습니다. "민수는 책을 돌려줬다"와 "책을 민수는 돌려줬다"가 구분되지 않습니다. 그래서 각 토큰이 몇 번째인지 알려주는 위치 인코딩(positional encoding)을 따로 더합니다. 원래 논문은 사인·코사인 함수를 썼고 지금 주류는 RoPE(Rotary Position Embedding)입니다.

<br>

## 지금

2017년 "Attention Is All You Need"의 어텐션 공식이 2026년 프론티어 모델 전부에 그대로 남아 있습니다. $\text{softmax}(QK^\top / \sqrt{d_k})V$라는 연산 자체는 바뀌지 않았습니다.

변한 것은 그 공식 주변입니다. 모든 헤드가 K, V를 따로 갖던 MHA가 GQA로 바뀌었고 $n \times n$ 점수 행렬을 통째로 올리던 방식이 FlashAttention의 타일 계산으로 바뀌었습니다. 일부 레이어에는 슬라이딩 윈도우 어텐션이 붙었습니다. 전체 시퀀스 대신 주변 일정 범위만 보는 방식입니다. 위치 인코딩은 사인·코사인에서 RoPE로 넘어갔습니다. Q, K, V로 투영하고 내적으로 점수를 구하는 뼈대는 그대로입니다.

이 뼈대를 근본적으로 바꾸려는 시도도 있습니다. DeepSeek의 MLA(Multi-head Latent Attention)는 KV를 저차원 잠재 공간으로 압축해 캐시하고 Mamba 같은 상태 공간 모델(SSM)과 선형 어텐션 계열은 $O(n^2)$ 자체를 피하려 합니다. 2026년 기준으로 프론티어의 자리는 여전히 softmax 어텐션이 지키고 있습니다.

<br>

## 마치며

Q, K, V 설계의 핵심은 한 가지입니다. 각 위치가 자기만의 질문을 던지고(Q), 다른 위치들이 그 질문에 맞는 간판을 내걸고(K), 선택된 위치가 내용물을 넘깁니다(V). 여기에 점수 크기를 맞추는 $\sqrt{d_k}$와 미래를 가리는 causal mask가 붙어 디코더 어텐션이 완성됩니다. 그리고 그 마스크가 만든 "앞 토큰의 K, V는 변하지 않는다"는 성질 위에서 KV Cache부터 PagedAttention까지 서빙 최적화 전부가 돌아갑니다.

다음 글에서는 텍스트가 이 구조에 들어가기 전에 거치는 토큰화를 다룹니다. BPE가 왜 그 방식인지, 어휘 크기를 어떻게 정하는지 짚어봅니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [토큰은 왜 단어가 아닐까](/llm/tokenization-and-embedding/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)

<br>

## 참고자료

- [Attention Is All You Need (Vaswani et al., NeurIPS 2017)](https://arxiv.org/abs/1706.03762)
- [Neural Machine Translation by Jointly Learning to Align and Translate (Bahdanau et al., ICLR 2015)](https://arxiv.org/abs/1409.0473)
- [Fast Transformer Decoding: One Write-Head is All You Need (Shazeer, 2019)](https://arxiv.org/abs/1911.02150)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints (Ainslie et al., 2023)](https://arxiv.org/abs/2305.13245)
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/)
