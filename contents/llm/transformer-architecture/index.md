---
date: '2026-08-17'
title: 'Transformer는 왜 Q, K, V 셋으로 나눴을까'
category: 'LLM'
series: 'llm'
seriesOrder: 2
tags: ['LLM', 'Transformer', 'Attention', 'Multi-Head Attention', 'GQA']
summary: 'Transformer 어텐션의 핵심인 Q, K, V가 무엇이고 왜 셋으로 나뉘는지, head와 KV head가 정확히 무엇인지 정의합니다. Multi-Head Attention에서 GQA까지, KV Cache 공식의 모든 항을 풀어 설명합니다.'
thumbnail: './thumbnail.png'
---

모델 카드나 vLLM 설정에는 head_dim, KV head 수 같은 값이 아무 설명 없이 등장합니다. KV Cache가 K와 V를 저장한다는 것도 널리 알려져 있고요. 그런데 그 K와 V가 정확히 무엇인지, 왜 Q까지 셋으로 나뉘어야 했는지 물으면 의외로 답이 막힙니다. 매일 쓰는 용어인데 정의를 건너뛴 채 익숙해진 거죠.

LLM의 과제는 앞선 토큰들을 조건으로 다음 토큰의 확률 $P(w_t \mid w_{1:t-1})$을 계산하는 것입니다. 이 확률을 계산하는 함수가 Transformer이고, 그 핵심이 어텐션이며, 어텐션의 중심에 Q, K, V가 있습니다.

이 글에서는 왜 어텐션이라는 구조가 필요했는지부터 시작해 Q, K, V가 무엇이며 왜 그 형태인지, 그리고 head와 KV head가 정확히 무엇을 가리키는지 짚습니다.

<br>

## 왜 어텐션이어야 했나

Transformer 이전에 시퀀스를 다루던 주역은 RNN이었습니다. RNN은 토큰을 순서대로 처리하면서 그때까지의 정보를 고정 크기 벡터 하나에 압축합니다. 첫 번째 토큰의 정보가 다섯 번째 토큰에 닿으려면 네 번의 압축을 거쳐야 하고, 단계가 늘수록 정보가 희석됩니다. 병렬화 문제도 같은 구조에서 옵니다. 두 번째 hidden state를 계산하려면 첫 번째가 끝나야 하고, 세 번째는 두 번째가 끝나야 합니다. 시퀀스 길이만큼 순차 단계가 필요하니 GPU의 병렬 연산 능력을 살릴 수 없습니다.

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
    .tf1-cap  { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
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

2015년 Bahdanau 연구팀이 기계 번역에서 이 병목을 처음 돌파했습니다. 디코더가 번역할 때 인코더의 모든 위치를 직접 참조하게 한 것이 어텐션의 시작이었습니다. 2017년 "Attention Is All You Need"는 한 걸음 더 나갔습니다. 인코더-디코더 사이뿐 아니라 한 시퀀스 안에서 각 위치가 같은 시퀀스의 다른 위치를 직접 참조하도록 만들었습니다. 이것이 self-attention이고, RNN 없이 self-attention만으로 세운 구조가 Transformer입니다.

<br>

## 모든 위치를 직접 본다

self-attention의 과제는 이렇습니다. 위치 $t$에서 다음 토큰 확률을 계산하려면 앞선 위치 $1, 2, \ldots, t{-}1$의 정보를 모아야 합니다. 모든 위치를 직접 본다고 했으니 남은 문제는 두 가지입니다. 어떤 위치가 지금 위치에 관련 있는지 판단하는 것(호환성), 그리고 관련 있는 위치에서 무슨 정보를 가져올지 정하는 것(내용)입니다.

가장 단순한 방법은 각 위치의 벡터끼리 내적을 구하는 것입니다. 내적이 크면 비슷한 벡터이니 관련 있다고 보는 식이죠. 하지만 이렇게 하면 두 가지를 구분하지 못합니다. "어떤 위치를 고를 것인가"를 결정하는 기준과 "그 위치에서 무엇을 읽을 것인가"가 같은 벡터에 묶여서 두 역할을 독립적으로 학습할 수 없습니다. 게다가 찾는 쪽과 찾아지는 쪽의 역할도 구분되지 않습니다. 어떤 위치가 다른 위치에 필요한 건 둘이 비슷해서가 아니라 한쪽이 다른 쪽에 필요한 것을 갖고 있기 때문인 경우가 많습니다.

Transformer는 각 위치의 벡터를 세 가지 역할로 분리합니다. 학습 가능한 가중치 행렬 $W_Q$, $W_K$, $W_V$를 곱해 세 벡터를 만듭니다.

- **Query($Q$)**: 이 위치가 묻는 질문. "나는 어떤 정보가 필요한가"
- **Key($K$)**: 이 위치가 내거는 간판. "나는 이런 질문에 답할 수 있다"
- **Value($V$)**: 선택되었을 때 넘겨줄 정보. "내가 갖고 있는 내용은 이것이다"

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 250" style="width: 100%; height: auto; max-width: 400px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="hidden state 벡터가 W_Q, W_K, W_V 세 가중치 행렬로 투영되어 Query, Key, Value 세 벡터가 되는 과정. 아래쪽에 Q와 K의 내적으로 점수를 구하고 softmax를 거쳐 V를 가중합하는 흐름이 이어집니다.">
  <style>
    .tf2-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf2-q    { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf2-k    { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf2-v    { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf2-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .tf2-w    { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .tf2-desc { fill: var(--text-muted, #6d6762); font-size: 14px; }
    .tf2-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf2Ar); }
    .tf2-flow { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
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
  <text x="210" y="34" class="tf2-desc">이 위치가 묻는 질문</text>
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
  <text x="210" y="146" class="tf2-desc">선택되면 넘겨줄 내용</text>
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
  <text x="240" y="240" class="tf2-flow">호환성 점수로 Value를 가중합</text>
</svg>
</div>

Query와 Key의 내적이 호환성 점수가 됩니다. 점수가 높은 위치에서 Value를 많이 가져오고 낮은 위치에서는 적게 가져옵니다. softmax를 씌워 가중치로 바꾸고 Value의 가중합을 구하면 그 위치의 어텐션 출력이 됩니다. 이 연산을 행렬로 한꺼번에 쓰면 다음 식입니다.

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
$$

$Q$, $K$, $V$는 각각 모든 위치의 query, key, value 벡터를 행으로 쌓은 행렬입니다. $QK^\top$은 모든 위치 쌍의 호환성 점수를 담은 행렬이고, softmax는 행마다 적용되어 각 위치의 가중치 합이 1이 됩니다. $d_k$는 key 벡터의 차원인데, 나누는 이유는 바로 다음에 다룹니다.

이 식에서 중요한 성질이 하나 있습니다. **K와 V는 토큰이 정해지는 순간 값이 고정됩니다.** 입력 토큰에 $W_K$와 $W_V$를 곱한 결과이니, 같은 토큰이 같은 위치에 있으면 K와 V는 항상 같습니다. 반면 Q는 "이번에 무엇을 찾을 것인가"이므로 질문하는 위치가 바뀌면 달라집니다. 추론 엔진의 KV Cache가 바로 이 K와 V를 저장해두는 장치입니다. 한 번 계산한 K, V를 다시 계산하지 않아도 되니, 토큰을 하나씩 생성하는 단계에서는 새 토큰의 Q만 만들어 저장된 K, V와 곱하면 됩니다.

<br>

## √d_k로 나누는 이유

위 식에서 $QK^\top$을 $\sqrt{d_k}$로 나누는 이유를 봅시다. $Q$와 $K$의 각 원소가 평균 0, 분산 1인 독립적인 값이라고 가정하면, 두 벡터의 내적은 $d_k$개 원소의 곱을 더한 것이므로 분산이 $d_k$에 비례합니다.

$d_k$가 크면 내적 값의 범위가 넓어지고 softmax의 입력이 극단으로 치우칩니다. softmax는 입력 차이가 크면 가장 큰 값에 거의 모든 확률을 몰아주는데, 이렇게 출력이 한 곳에 몰리면 기울기가 사라져 학습이 막힙니다.

$\sqrt{d_k}$로 나누면 내적의 분산이 1로 돌아옵니다. softmax 입력이 적당한 범위에 머물러 여러 위치에 의미 있는 가중치를 배분할 수 있게 되죠.

:::info

**참고**

$d_k = 128$이면 $\sqrt{d_k} \approx 11.3$입니다. 스케일링 없이 두 벡터의 내적은 표준편차가 약 11.3이라 위치 간 점수 차이가 수십까지 벌어질 수 있습니다. softmax에 30과 0이 들어가면 30 쪽에 확률이 99.9999% 이상 몰립니다. $\sqrt{d_k}$로 나누면 표준편차가 1로 돌아와 점수 차이가 합리적인 범위에 머뭅니다.

:::

<br>

## 여러 시선으로 동시에 본다

지금까지 본 어텐션은 한 벌입니다. 위치 $t$가 Q 하나를 들고 모든 K와 비교해 가중치를 정하니, 그 가중치 패턴은 하나뿐입니다. 하지만 언어에는 여러 종류의 관계가 동시에 존재합니다. "민수는 어제 도서관에서 빌린 책을 오늘 돌려줬다"에서 "돌려줬다"는 "민수"와 주술 관계를, "책"과 목적어 관계를, "어제"와 시간 관계를 동시에 맺고 있습니다. 하나의 가중치 패턴으로 이 관계들을 한꺼번에 담기는 어렵습니다.

**Multi-Head Attention**은 이 문제를 $h$개의 독립 어텐션으로 풉니다. 각 어텐션은 전체 벡터 공간의 부분공간에서 작동합니다. 모델의 벡터 차원이 $d_{\text{model}}$이고 헤드 수가 $h$이면, 각 헤드는 $d_{\text{model}} / h$ 차원에서 자기만의 Q, K, V를 투영합니다.

여기서 용어 세 가지를 정확히 정의해둡시다.

- **헤드(head)**: 자기만의 $W_Q$, $W_K$, $W_V$를 가진 독립 어텐션 연산 한 벌
- **헤드 차원(head_dim, $d_k$)**: 각 헤드 안에서 Q, K, V 벡터의 차원. 원 논문에서는 $d_{\text{model}} / h$이고, 요즘 모델은 독립 하이퍼파라미터로 정하기도 합니다
- **헤드 수(n_heads, $h$)**: 병렬로 실행되는 어텐션의 수

head_dim이 클수록 각 헤드가 더 넓은 부분공간에서 작동합니다. Gemma 4에서 "로컬 레이어는 헤드 차원 256, 글로벌 레이어는 512"라고 한 것이 바로 이 값입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 220" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Multi-Head Attention 구조. d_model 차원 입력이 h개의 head_dim 부분공간으로 나뉘어 각각 독립 어텐션을 거치고, 결과를 이어 붙여 W_O를 곱해 원래 차원으로 돌아옵니다.">
  <style>
    .tf3-bar  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf3-h1   { fill: var(--bg-warn, #fffbeb); }
    .tf3-h2   { fill: var(--bg-subtle, #f5f4f2); }
    .tf3-h3   { fill: var(--bg-success, #f0fdf4); }
    .tf3-h4   { fill: #f0f0ff; }
    .tf3-att  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tf3-out  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tf3-t    { fill: var(--text, #1c1917); font-size: 14px; text-anchor: middle; }
    .tf3-lab  { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tf3-dim  { fill: var(--text-muted, #6d6762); font-size: 13px; text-anchor: middle; }
    .tf3-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tf3Ar); }
  </style>
  <defs>
    <marker id="tf3Ar" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <text x="44" y="18" class="tf3-lab">입력</text>
  <rect x="20" y="26" width="48" height="34" rx="4" class="tf3-bar tf3-h1"/>
  <rect x="20" y="60" width="48" height="34" rx="4" class="tf3-bar tf3-h2"/>
  <rect x="20" y="94" width="48" height="34" rx="4" class="tf3-bar tf3-h3"/>
  <rect x="20" y="128" width="48" height="34" rx="4" class="tf3-bar tf3-h4"/>
  <text x="10" y="104" class="tf3-dim" transform="rotate(-90,10,104)">d_model</text>
  <path d="M74,43 L108,43" class="tf3-ar"/>
  <path d="M74,77 L108,77" class="tf3-ar"/>
  <path d="M74,111 L108,111" class="tf3-ar"/>
  <path d="M74,145 L108,145" class="tf3-ar"/>
  <rect x="114" y="30" width="74" height="26" rx="6" class="tf3-att"/>
  <text x="151" y="48" class="tf3-t">Attention</text>
  <rect x="114" y="64" width="74" height="26" rx="6" class="tf3-att"/>
  <text x="151" y="82" class="tf3-t">Attention</text>
  <rect x="114" y="98" width="74" height="26" rx="6" class="tf3-att"/>
  <text x="151" y="116" class="tf3-t">Attention</text>
  <rect x="114" y="132" width="74" height="26" rx="6" class="tf3-att"/>
  <text x="151" y="150" class="tf3-t">Attention</text>
  <text x="151" y="178" class="tf3-dim">각 head_dim 차원</text>
  <path d="M194,43 L228,43" class="tf3-ar"/>
  <path d="M194,77 L228,77" class="tf3-ar"/>
  <path d="M194,111 L228,111" class="tf3-ar"/>
  <path d="M194,145 L228,145" class="tf3-ar"/>
  <text x="258" y="18" class="tf3-lab">Concat</text>
  <rect x="234" y="26" width="48" height="34" rx="4" class="tf3-bar tf3-h1"/>
  <rect x="234" y="60" width="48" height="34" rx="4" class="tf3-bar tf3-h2"/>
  <rect x="234" y="94" width="48" height="34" rx="4" class="tf3-bar tf3-h3"/>
  <rect x="234" y="128" width="48" height="34" rx="4" class="tf3-bar tf3-h4"/>
  <path d="M288,94 L330,94" class="tf3-ar"/>
  <text x="310" y="88" class="tf3-dim">W_O</text>
  <text x="370" y="18" class="tf3-lab">출력</text>
  <rect x="336" y="26" width="48" height="136" rx="6" class="tf3-out"/>
  <text x="360" y="100" class="tf3-t" transform="rotate(-90,360,100)">d_model</text>
  <text x="240" y="208" class="tf3-lab">h = 4 헤드, 각 헤드가 독립 어텐션을 수행</text>
</svg>
</div>

각 헤드의 출력을 이어 붙이고(concatenate) 가중치 행렬 $W_O$를 곱하면 원래 차원으로 돌아옵니다.

```text
MultiHead(Q, K, V) = Concat(head_1, ..., head_h) × W_O
head_i = Attention(X W_Q^i, X W_K^i, X W_V^i)
```

파라미터 총량은 거의 같습니다. $d_{\text{model}}$ 차원의 Q, K, V를 한 벌 만드는 것과 $d_{\text{model}} / h$ 차원짜리를 $h$ 벌 만드는 것은 가중치 행렬 크기가 동일합니다. 헤드를 나눈다고 파라미터가 느는 것이 아니라 같은 파라미터 예산으로 여러 관계를 동시에 포착하는 셈입니다.

<br>

## KV head를 줄이면

Multi-Head Attention 원형에서는 모든 헤드가 자기만의 K, V를 갖습니다. 헤드가 32개면 레이어당 K, V 쌍도 32개이고 KV Cache도 32벌을 저장해야 합니다.

2019년 Shazeer가 제안한 **MQA(Multi-Query Attention)**는 이를 극단으로 줄입니다. Q만 헤드별로 따로 두고 K와 V는 모든 헤드가 한 벌을 나눠 씁니다. KV Cache가 32분의 1로 줄어 메모리 부담이 크게 내려가지만 같은 K, V로 32개의 서로 다른 질문에 답해야 하니 표현력이 떨어질 수 있습니다.

**GQA(Grouped Query Attention)**는 그 중간 지대입니다. 32개의 Q 헤드를 몇 개의 그룹으로 묶고 같은 그룹 안의 Q 헤드들이 K, V 한 벌을 공유합니다. 4개씩 8그룹이면 KV head 수가 8. MHA의 표현력과 MQA의 효율 사이에서 적당한 점을 찾은 것이 GQA이고, Llama 2 70B 이후 대부분의 오픈 모델이 이 방식을 씁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 210" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="MHA와 GQA의 Q-to-KV 대응 비교. MHA에서는 Q 헤드 4개가 각각 자기만의 KV를 갖지만, GQA에서는 Q 헤드 2개가 KV 한 벌을 공유합니다.">
  <style>
    .tf4-q    { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tf4-kv   { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tf4-t    { fill: var(--text, #1c1917); font-size: 14px; text-anchor: middle; }
    .tf4-h    { fill: var(--text-muted, #6d6762); font-size: 16px; text-anchor: middle; }
    .tf4-lab  { fill: var(--text-muted, #6d6762); font-size: 13px; text-anchor: middle; }
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

여기서 **KV head(KV 헤드)**를 정의합니다. 레이어당 독립된 K, V 쌍의 수입니다. MHA에서는 헤드 수와 같고 GQA에서는 그보다 작습니다. 이 값은 KV Cache 크기 계산에 그대로 들어갑니다. 토큰 하나가 차지하는 캐시 크기는 모델 config만으로 바로 나옵니다.

```text
토큰당 KV = 2(K, V) × 레이어 수 × KV head 수 × head_dim × dtype 바이트
```

이 식의 모든 항이 이제 이 글 안에서 정의됐습니다. KV head 수는 레이어당 독립 K, V 쌍의 수이고, head_dim은 각 헤드 안 벡터의 차원이며, 맨 앞의 2는 K와 V 각각 한 벌입니다. GQA가 줄이는 것은 KV head 수이고 토큰당 KV가 그만큼 비례해서 줄어듭니다.

<br>

## 대가: 시퀀스 길이의 제곱

어텐션은 모든 위치 쌍의 호환성을 계산합니다. 시퀀스 길이가 $n$이면 점수 행렬이 $n \times n$이라 계산량과 메모리 모두 $O(n^2)$입니다. RNN은 $O(n)$이었으니, 순차 계산을 병렬 계산으로 바꾸고 간접 참조를 직접 참조로 바꾼 대가로 시퀀스 길이의 제곱이 따라온 셈입니다.

구체적으로 보면 감이 잡힙니다. 1,024 토큰이면 헤드당 약 100만 쌍. 8,192 토큰이면 약 6,700만 쌍. 128K 토큰이면 약 172억 쌍입니다. 초기 Transformer가 512토큰 문맥에 머문 이유가 여기 있고 문맥을 수만 토큰 이상으로 늘리려면 아키텍처 수준의 혁신이 필요했던 이유도 여기 있습니다.

메모리 쪽도 마찬가지입니다. $n \times n$ 점수 행렬을 헤드마다 저장하면, 128K 컨텍스트에 32헤드 기준 fp16으로 약 1TB입니다. FlashAttention은 이 행렬을 한꺼번에 만들지 않고 타일 단위로 계산해 메모리 문제를 풀었지만 연산량 자체는 여전히 $O(n^2)$입니다.

RNN에는 없던 문제도 하나 따라옵니다. 위치 정보가 구조에 내장되어 있지 않습니다. RNN은 토큰을 순서대로 처리하니 위치가 자연스럽게 반영되지만 Transformer는 모든 위치를 동시에 계산하기 때문에 입력 순서를 뒤섞어도 같은 결과가 나옵니다. 그래서 토큰의 순서를 알려주는 별도의 위치 인코딩(positional encoding)이 필요합니다. 원래 논문은 사인·코사인 함수를 썼고 지금 주류인 방식은 RoPE(Rotary Position Embedding)입니다.

<br>

## 지금

2017년 "Attention Is All You Need"의 어텐션 공식이 2026년 프론티어 모델 전부에 그대로 남아 있습니다. $\text{softmax}(QK^\top / \sqrt{d_k})V$라는 연산 자체는 바뀌지 않았습니다.

변한 것은 그 공식 주변입니다. 모든 헤드가 K, V를 따로 갖던 MHA가 GQA로 바뀌었고 $n \times n$ 점수 행렬을 통째로 올리던 방식이 FlashAttention의 타일 계산으로 바뀌었습니다. 일부 레이어에서 전체 시퀀스 대신 로컬 윈도우만 보는 슬라이딩 윈도우 어텐션이 붙었고 위치 인코딩은 사인·코사인에서 RoPE로 넘어갔습니다. Q, K, V로 투영하고 내적으로 호환성을 구하는 뼈대는 그대로입니다.

이 뼈대를 근본적으로 바꾸려는 시도도 있습니다. DeepSeek의 MLA(Multi-head Latent Attention)는 KV를 저차원 잠재 공간으로 압축해 캐시하고 Mamba 같은 상태 공간 모델(SSM)과 선형 어텐션 계열은 $O(n^2)$ 자체를 피하려 합니다. 2026년 기준으로 프론티어의 자리는 여전히 softmax 어텐션이 지키고 있습니다.

<br>

## 마치며

Q, K, V라는 설계의 핵심은 한 가지입니다. 각 위치가 자기만의 질문을 던지고(Q), 다른 위치들이 그 질문에 맞는 간판을 내걸며(K), 선택된 위치가 정보를 넘깁니다(V). 이 구조가 아홉 해를 버텼고 KV Cache부터 PagedAttention까지 서빙 최적화 전부가 그 위에서 돌아갑니다.

다음 글에서는 텍스트가 이 구조에 들어가기 전에 거치는 토큰화를 다룹니다. BPE가 왜 그 방식인지, 어휘 크기를 어떻게 정하는지 짚어봅니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)

<br>

## 참고자료

- [Attention Is All You Need (Vaswani et al., NeurIPS 2017)](https://arxiv.org/abs/1706.03762)
- [Neural Machine Translation by Jointly Learning to Align and Translate (Bahdanau et al., ICLR 2015)](https://arxiv.org/abs/1409.0473)
- [Fast Transformer Decoding: One Write-Head is All You Need (Shazeer, 2019)](https://arxiv.org/abs/1911.02150)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints (Ainslie et al., 2023)](https://arxiv.org/abs/2305.13245)
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/)

<!-- HUMANIZE-SUMMARY v1.6.1
run_id: 2026-08-20-001
mode: light (보수) / genre: blog(기술 블로그, 경어체)
metrics:
  char_in(prose): 5704
  char_out(prose): 5684
  change_rate: 0.35%
  self_check: 6/6
  grade: A
categories:  # before -> after
  C-11 연결어미 직후 쉼표: 24 -> 4 (잔존 4건은 삼중 나열·괄호 뒤 구조 쉼표, 습관형 0건)
  A 번역투 (A-1/3/7/8/9/16/19): 0 -> 0 (탐지 없음)
  D AI 관용구 (결산 lexicon·hype·결말 공식): 0 -> 0 (탐지 없음)
  H 접속사 남발: 4 -> 4 (임계 5회 미만, 비대상)
  G hedging: 0 -> 0 (잔존 '~할 수 있다' 3건은 실제 가능성 서술)
  J-1 볼드: 9 -> 9 (전부 용어 정의용, 비대상)
  B-1 영어 병기: 첫 등장만 병기 — 원문이 이미 준수
  E-1/E-2 리듬: 문장 길이 편차·종결어미 변주 양호, 비대상
self_check:
  - 고유명사·수치·인용 100% 보존: OK (숫자열·URL·헤딩 diff 0)
  - 변경률 30% 이하: OK (0.35%)
  - 장르 이탈 없음: OK (기술 블로그 유지)
  - register 보존: OK (경어체 -습니다, 구어 종결 '거죠·고요·되죠·식이죠' 전량 보존)
  - S1 잔존 0건: OK (C-11 습관형 전량 해소)
  - 인공 표현 추가 없음: OK (삽입 0건 — 쉼표 삭제만 수행)
highlights:
  - id: C-11
    before: "Q만 헤드별로 따로 두고, K와 V는 모든 헤드가 한 벌을 나눠 씁니다."
    after: "Q만 헤드별로 따로 두고 K와 V는 모든 헤드가 한 벌을 나눠 씁니다."
  - id: C-11
    before: "MHA가 GQA로 바뀌었고, $n x n$ 점수 행렬을 통째로 올리던 방식이"
    after: "MHA가 GQA로 바뀌었고 $n x n$ 점수 행렬을 통째로 올리던 방식이"
  - id: C-11
    before: "이 구조가 아홉 해를 버텼고, KV Cache부터 PagedAttention까지"
    after: "이 구조가 아홉 해를 버텼고 KV Cache부터 PagedAttention까지"
  - id: C-11
    before: "타일 단위로 계산해 메모리 문제를 풀었지만, 연산량 자체는 여전히"
    after: "타일 단위로 계산해 메모리 문제를 풀었지만 연산량 자체는 여전히"
  - id: C-11
    before: "원래 논문은 사인·코사인 함수를 썼고, 지금 주류인 방식은 RoPE"
    after: "원래 논문은 사인·코사인 함수를 썼고 지금 주류인 방식은 RoPE"
intentional_retention:
  - "KV head 수는 ~ 수이고, head_dim은 ~ 차원이며, 맨 앞의 2는" — 삼중 병렬 나열, 쉼표가 파싱을 돕는 자리
  - "질문을 던지고(Q), ~ 내걸며(K), ~ 넘깁니다(V)" — 괄호 뒤 구조 쉼표, 제거 시 가독성 급락
residual_findings: (없음)
grade_reason: "A — S1(C-11) 습관형 잔존 0건, 자체검증 6항 통과. 변경률 0.35%는 A 기준 밴드(10~25%) 아래지만, risk_score 2 / light 경로에서 C-11 외 카테고리 탐지가 0건이라 손댈 구간 자체가 없었음. 보수 강도 지시에 따라 확신 없는 구간은 원문 유지."
-->
