---
date: '2026-09-09'
title: '(placeholder)'
category: 'LLM'
series: 'llm'
seriesOrder: 9
tags: ['LLM', 'MLA', 'GQA', 'MQA', 'KV Cache', 'Attention']
summary: '(placeholder)'
thumbnail: './thumbnail.png'
---

Transformer 블록 안에서 파라미터가 가장 많은 부분은 FFN이고 MoE는 이 FFN을 전문가로 쪼개 토큰당 활성 파라미터를 줄였습니다. 어텐션 쪽에도 비슷한 낭비가 있습니다. 모든 헤드가 자기만의 K, V를 캐시에 쌓는 구조입니다.

디코더 LLM은 토큰을 하나씩 생성합니다. 토큰 하나를 만들 때마다 이전 토큰들의 K, V를 메모리에서 읽어야 하고 이것이 KV Cache입니다. 시퀀스가 길어질수록 캐시도 커집니다. 128K 컨텍스트에 KV head가 64개인 모델이라면 캐시가 수십 GB에 달할 수 있고 동시에 처리할 수 있는 요청 수가 줄어 서빙 처리량이 떨어집니다.

GQA는 여러 Q 헤드가 K, V 한 벌을 나눠 쓰게 해서 이 캐시를 줄였습니다. Q 헤드 64개가 KV 8벌을 공유하면 캐시가 8분의 1이 됩니다. 그런데 GQA가 줄인 것은 K, V의 **벌 수**입니다. 각 K, V 벡터의 크기(head_dim)는 128차원 그대로입니다.

KV head를 극단까지 줄여 1개만 남겨도(MQA) 토큰당 캐시의 하한은 $2 \times d_h \times L$입니다. K와 V 각 1벌의 head_dim에 레이어 수를 곱한 것이고 벡터 자체를 줄이지 않는 한 이 하한을 넘을 수 없습니다.

2024년, DeepSeek-V2가 완전히 다른 접근을 제안했습니다. K, V를 나눠 쓰는 대신 압축합니다. 벌 수를 줄이는 것이 아니라 **차원을 줄이는 것**입니다. 이것이 MLA(Multi-head Latent Attention)입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 150" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="GQA-8과 MLA의 토큰당 캐시 크기 비교. GQA-8은 2,048차원, MLA는 576차원으로 약 72% 줄어듭니다.">
  <style>
    .attn1-lab { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
    .attn1-t   { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .attn1-dim { fill: var(--text-muted, #6d6762); font-size: 15px; }
    .attn1-gqa { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .attn1-mla { fill: var(--primary, #0a756c); }
    .attn1-on  { fill: var(--on-fill, #ffffff); font-size: 15px; text-anchor: middle; }
  </style>
  <!-- GQA-8 -->
  <text x="10" y="44" class="attn1-lab">GQA-8</text>
  <rect x="80" y="22" width="280" height="40" rx="6" class="attn1-gqa"/>
  <text x="220" y="48" class="attn1-t">K × 8 + V × 8 = 2,048</text>
  <!-- MLA -->
  <text x="10" y="108" class="attn1-lab">MLA</text>
  <rect x="80" y="86" width="78" height="40" rx="6" class="attn1-mla"/>
  <text x="172" y="112" class="attn1-dim">c_t + k^R = 576</text>
  <!-- caption -->
  <text x="200" y="146" text-anchor="middle" class="attn1-dim">DeepSeek-V2 기준 · 레이어당 토큰 1개의 캐시</text>
</svg>
</div>

## 공유가 풀지 못한 것

MQA를 제안한 Shazeer(2019)의 논문 제목은 "Fast Transformer Decoding"입니다. 품질 논문이 아니라 속도 논문입니다. 디코더가 토큰을 하나 생성할 때 새 토큰의 Q 벡터 하나와 캐시 전체의 K, V를 사용합니다. 연산량은 Q 하나분이지만 캐시 전체를 메모리에서 읽어야 합니다.

A100의 연산 능력은 312 TFLOPS인데 메모리 대역폭은 2 TB/s입니다. 연산 유닛이 놀고 있어도 데이터가 도착하지 않아 기다리게 됩니다. 이것이 디코드 단계의 메모리 대역폭 병목입니다.

KV Cache를 줄이면 읽어야 할 데이터가 줄어 이 병목이 완화됩니다. K, V를 모든 헤드가 하나씩만 공유하면 읽어야 할 양이 $1/h$로 줄어듭니다. MQA의 핵심 아이디어입니다.

대가는 표현력입니다. 같은 K, V로 $h$개의 서로 다른 질문에 답해야 합니다. 주어를 찾는 헤드와 목적어를 찾는 헤드가 같은 간판을 보게 됩니다. "나는 주어다"와 "나는 목적어가 아니다"를 한 간판에 다 적어야 하니 어느 질문에도 딱 맞지 않는 타협적인 표현이 됩니다.

GQA(Ainslie et al., 2023)는 이 타협의 정도를 조절합니다. Q 헤드를 $g$개 그룹으로 묶고 그룹마다 K, V 한 벌을 공유합니다. $g = 1$이면 MQA이고 $g = h$이면 MHA입니다. 기존 MHA 체크포인트에서 원래 학습량의 5%만으로 변환할 수 있다는 실용적 이점도 있었습니다.

GQA 논문의 ablation에서 GQA-8의 품질은 MHA와 거의 같았고(평균 47.1 vs 47.2) MQA(46.6)보다 0.5점 높았습니다. 속도는 MHA의 5.4배였습니다. 8개 그룹이 품질과 속도의 최적점이라는 결론이었고 Llama 2 70B가 이를 채택한 뒤 Llama 3, Mistral, Qwen, Gemma가 모두 따라와 오픈 모델의 기본값이 됐습니다.

하지만 공유에는 구조적 한계가 있습니다. KV head를 아무리 줄여도 각 K, V 벡터의 차원 $d_h$는 건드리지 못합니다. $d_h$가 128이면 MQA(KV head 1개)라도 토큰당 $2 \times 128 = 256$차원분을 레이어마다 저장합니다. 60개 레이어, 128K 컨텍스트, fp16 기준으로 계산하면 MQA에서도 요청 하나의 KV Cache가 약 3.8GB입니다.

$d_h$를 줄이면 어텐션이 구분할 수 있는 패턴의 해상도가 떨어집니다. 128차원 공간에서 가까운 두 벡터를 64차원으로 투영하면 구분이 어려워질 수 있습니다. 공유만으로는 이 바닥을 뚫을 수 없고 차원을 줄이면 품질이 떨어집니다. 다른 길이 필요합니다.

## MLA, 압축이라는 다른 길

DeepSeek-V2(2024)는 K, V를 공유하지 않고 압축합니다. 토큰의 hidden state $h_t$를 작은 잠재 벡터(latent vector) $c_t$로 다운프로젝션하고 캐시에는 $c_t$만 저장합니다. K와 V가 필요할 때 $c_t$에서 업프로젝션으로 복원합니다.

$$
c_t = W^{DKV} h_t, \qquad K_t = W^{UK} c_t, \qquad V_t = W^{UV} c_t
$$

$h_t$는 토큰 $t$의 hidden state로 $d_\text{model}$차원입니다. $W^{DKV}$는 이것을 $d_c$차원으로 줄이는 다운프로젝션 행렬이고 $c_t$가 그 결과인 잠재 벡터입니다. $W^{UK}$와 $W^{UV}$가 $c_t$에서 K와 V를 복원하는 업프로젝션 행렬입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="MLA 데이터 흐름. 5,120차원 hidden state가 다운프로젝션으로 512차원 잠재 벡터로 압축되어 캐시에 저장되고, 추론 시 업프로젝션으로 K와 V를 복원해 어텐션에 사용합니다.">
  <style>
    .attn2-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .attn2-ct  { fill: var(--primary, #0a756c); }
    .attn2-t   { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .attn2-ts  { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .attn2-on  { fill: var(--on-fill, #ffffff); font-size: 17px; text-anchor: middle; }
    .attn2-badge { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .attn2-bt  { fill: var(--text-warn, #9d5604); font-size: 14px; text-anchor: middle; }
    .attn2-ar  { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#attn2Ar); }
    .attn2-lab { fill: var(--text-muted, #6d6762); font-size: 15px; }
  </style>
  <defs>
    <marker id="attn2Ar" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <!-- h_t -->
  <rect x="90" y="10" width="220" height="38" rx="6" class="attn2-box"/>
  <text x="200" y="35" class="attn2-t">h_t</text>
  <text x="330" y="35" class="attn2-ts">5,120</text>
  <!-- arrow down -->
  <path d="M200,48 V72" class="attn2-ar"/>
  <text x="230" y="66" class="attn2-lab">W^DKV</text>
  <!-- c_t -->
  <rect x="140" y="76" width="120" height="38" rx="6" class="attn2-ct"/>
  <text x="200" y="101" class="attn2-on">c_t</text>
  <text x="280" y="101" class="attn2-ts">512</text>
  <!-- 캐시 badge -->
  <rect x="296" y="82" width="52" height="24" rx="12" class="attn2-badge"/>
  <text x="322" y="99" class="attn2-bt">캐시</text>
  <!-- split arrows -->
  <path d="M170,114 V148" class="attn2-ar"/>
  <path d="M230,114 V148" class="attn2-ar"/>
  <text x="144" y="140" class="attn2-lab">W^UK</text>
  <text x="254" y="140" class="attn2-lab">W^UV</text>
  <!-- K and V -->
  <rect x="100" y="152" width="110" height="38" rx="6" class="attn2-box"/>
  <text x="155" y="177" class="attn2-t">K</text>
  <rect x="230" y="152" width="110" height="38" rx="6" class="attn2-box"/>
  <text x="285" y="177" class="attn2-t">V</text>
  <!-- arrows to attention -->
  <path d="M170,190 V210 L190,230" class="attn2-ar"/>
  <path d="M300,190 V210 L210,230" class="attn2-ar"/>
  <!-- Q from side -->
  <rect x="10" y="214" width="80" height="34" rx="6" class="attn2-box"/>
  <text x="50" y="236" class="attn2-t">Q</text>
  <path d="M90,231 L160,246" class="attn2-ar"/>
  <!-- Attention -->
  <rect x="130" y="234" width="140" height="38" rx="6" class="attn2-box"/>
  <text x="200" y="259" class="attn2-t">어텐션</text>
</svg>
</div>

캐시에 저장하는 것은 $c_t$뿐입니다. 차원이 $d_c$이고 이것은 전체 K, V보다 훨씬 작습니다. 추론 시에는 $c_t$를 캐시에서 읽고 $K_t$, $V_t$를 실시간으로 복원합니다.

행렬 곱 두 번이 추가되지만 메모리에서 읽는 캐시 크기가 줄어듭니다. 디코딩은 메모리 대역폭에 묶여 있으니 읽는 양이 줄면 연산 유닛이 더 빨리 데이터를 받아 처리할 수 있습니다.

10분의 1로 압축하면 정보가 크게 손실될 것 같지만 그렇지 않습니다. MHA에서 128개 헤드의 K, V는 모두 같은 hidden state $h_t$에서 나옵니다. 헤드마다 다른 투영 행렬을 쓸 뿐 원본은 같으므로 K, V 사이에 상당한 중복이 있습니다. MLA는 이 중복을 활용합니다. 공유된 정보를 $c_t$에 한 번만 저장하고 헤드별 차이는 업프로젝션 행렬 $W^{UK}$, $W^{UV}$가 만들어냅니다.

GQA에서 K, V를 공유할 때는 같은 K, V를 여러 Q가 그대로 가져다 쓰므로 표현의 다양성이 줄어듭니다. MLA는 다릅니다. 128개 헤드가 하나의 잠재 벡터를 공유하지만 그 벡터에서 나오는 K, V는 헤드마다 다릅니다. 공유가 아니라 하나의 압축된 표현에서 다양한 출력을 만드는 구조입니다.

DeepSeek-V2의 구체적인 값을 보면 $d_\text{model} = 5{,}120$이고 $d_c = 512$입니다. 5,120차원을 512차원으로 10분의 1로 압축한 것입니다. 이 512차원짜리 $c_t$ 하나로 128개 헤드의 K와 V를 모두 복원합니다. DeepSeek-V2 논문은 Q도 별도의 잠재 벡터로 압축하는데($d_{c'} = 1{,}536$) 이것은 파라미터 수를 줄이기 위한 것이고 KV Cache와는 무관합니다.

| 방식 | 토큰당 캐시 (레이어 1개) | DeepSeek-V2 기준 |
|---|---|---|
| MHA (128 KV head) | $2 \times n_h \times d_h$ | 32,768 |
| GQA-8 (8 KV head) | $2 \times 8 \times d_h$ | 2,048 |
| MLA | $d_c + d_h^R$ | 576 |

MLA의 576은 GQA-8의 2,048보다 작고 MHA 대비로는 93% 이상 줄어듭니다. DeepSeek-V2 논문은 이 수치가 GQA-2.25(KV head 2.25개 분량)에 해당한다고 밝혔습니다. KV head 2.25개 수준의 캐시로 MHA보다 나은 품질을 달성한 것입니다.

실제 메모리로 환산해 봅니다. DeepSeek-V2(60 레이어)에 128K 토큰 요청이 들어왔을 때 fp16 기준입니다.

```text
MHA: 32,768 × 60 × 131,072 × 2바이트 ≈ 480 GB
GQA-8: 2,048 × 60 × 131,072 × 2바이트 ≈ 30 GB
MLA: 576 × 60 × 131,072 × 2바이트 ≈ 8.5 GB
```

MHA라면 요청 하나의 캐시만으로 A100 80GB 6장이 필요하지만 MLA는 1장에 들어갑니다. 나머지 VRAM을 다른 요청에 쓸 수 있으니 동시 처리량이 올라갑니다.

표에서 MLA에 $d_h^R = 64$가 더해진 이유는 다음 섹션에서 설명합니다.

## 위치 정보와 압축의 충돌

MLA의 압축이 다운프로젝션과 업프로젝션만으로 끝났다면 아이디어는 간단합니다. 하지만 현재 대부분의 LLM이 쓰는 위치 인코딩 방식이 이 압축과 정면으로 충돌합니다.

RoPE(Rotary Position Embedding)는 K 벡터에 위치에 따른 회전을 적용합니다. 같은 단어라도 문장에서의 위치가 다르면 K 값이 달라지고 이 덕분에 Q와 K의 내적에 상대 위치 정보가 반영됩니다. 2026년 기준으로 Llama, Qwen, Mistral, DeepSeek 등 주요 모델이 모두 RoPE를 쓰고 있어 MLA가 RoPE와 양립해야 하는 것은 선택이 아닙니다.

문제를 구체적으로 보겠습니다. 캐시에 $c_t$를 저장했다고 합시다. 추론 시 $K_t = W^{UK} c_t$를 복원하고 여기에 RoPE를 적용해야 합니다. RoPE가 적용된 $K_t$는 토큰의 위치에 따라 달라지므로 $c_t$만으로는 복원할 수 없습니다.

결국 RoPE가 적용된 K 전체를 캐시해야 하고 그러면 $c_t$의 512차원이 아니라 K의 전체 차원을 저장하게 됩니다. 압축의 의미가 사라집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Absorbed RoPE 전후 비교. 위쪽: K 전체에 RoPE를 적용하면 전체 K를 캐시해야 합니다. 아래쪽: K를 내용과 위치로 나누면 c_t와 작은 k^R만 캐시하면 됩니다.">
  <style>
    .attn3-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .attn3-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
    .attn3-ct  { fill: var(--primary, #0a756c); }
    .attn3-kr  { fill: var(--accent, #9d5604); }
    .attn3-t   { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
    .attn3-ts  { fill: var(--text-muted, #6d6762); font-size: 15px; text-anchor: middle; }
    .attn3-on  { fill: var(--on-fill, #ffffff); font-size: 15px; text-anchor: middle; }
    .attn3-h   { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
    .attn3-warn { fill: var(--text-danger, #cb2121); font-size: 15px; }
    .attn3-ok  { fill: var(--text-success, #107836); font-size: 15px; }
    .attn3-ar  { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#attn3Ar); }
    .attn3-div { stroke: var(--border, #e7e5e4); stroke-width: 1; stroke-dasharray: 4,3; }
  </style>
  <defs>
    <marker id="attn3Ar" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill="var(--text-muted, #6d6762)"/></marker>
  </defs>
  <!-- 위: 단순 적용 -->
  <text x="10" y="20" class="attn3-h">단순 적용</text>
  <rect x="10" y="34" width="70" height="32" rx="5" class="attn3-ct"/>
  <text x="45" y="56" class="attn3-on">c_t</text>
  <path d="M80,50 L108,50" class="attn3-ar"/>
  <rect x="112" y="34" width="70" height="32" rx="5" class="attn3-box"/>
  <text x="147" y="56" class="attn3-t">K</text>
  <path d="M182,50 L210,50" class="attn3-ar"/>
  <rect x="214" y="34" width="90" height="32" rx="5" class="attn3-bad"/>
  <text x="259" y="56" class="attn3-t">RoPE(K)</text>
  <text x="316" y="56" class="attn3-warn">← 전체 캐시</text>
  <text x="200" y="88" class="attn3-warn">압축 이점 소멸</text>
  <!-- 구분선 -->
  <line x1="10" y1="110" x2="390" y2="110" class="attn3-div"/>
  <!-- 아래: 흡수 후 -->
  <text x="10" y="136" class="attn3-h">K를 내용 + 위치로 분리</text>
  <!-- 내용 경로 -->
  <text x="10" y="168" class="attn3-ts">내용</text>
  <rect x="50" y="152" width="70" height="32" rx="5" class="attn3-ct"/>
  <text x="85" y="174" class="attn3-on">c_t</text>
  <text x="138" y="174" class="attn3-ok">캐시 512</text>
  <path d="M200,168 L260,168" class="attn3-ar"/>
  <text x="280" y="174" class="attn3-ts">Q' · c_t</text>
  <!-- 위치 경로 -->
  <text x="10" y="222" class="attn3-ts">위치</text>
  <rect x="50" y="206" width="56" height="32" rx="5" class="attn3-kr"/>
  <text x="78" y="228" class="attn3-on">k^R</text>
  <text x="128" y="228" class="attn3-ok">캐시 64</text>
  <path d="M200,222 L260,222" class="attn3-ar"/>
  <text x="290" y="228" class="attn3-ts">q^R · k^R</text>
  <!-- 합산 -->
  <path d="M340,174 L360,195" class="attn3-ar"/>
  <path d="M340,228 L360,204" class="attn3-ar"/>
  <text x="380" y="205" class="attn3-t">+</text>
  <!-- 총 캐시 -->
  <text x="200" y="274" text-anchor="middle" class="attn3-ok">총 캐시 576 = 512 + 64</text>
</svg>
</div>

DeepSeek-V2의 해법은 K를 두 부분으로 나누는 것입니다. 내용을 담당하는 부분($k_t^C$)과 위치를 담당하는 부분($k_t^R$)입니다.

내용 부분은 $c_t$에서 업프로젝션($W^{UK}$)으로 복원합니다. 이 부분은 위치와 무관하므로 RoPE를 적용하지 않습니다. 위치 부분은 별도의 작은 벡터 $k_t^R$에 RoPE를 적용합니다. 이 벡터의 차원은 $d_h^R = 64$로 head_dim(128)의 절반이고 모든 헤드가 공유합니다. 캐시에는 $c_t$(512차원)와 $k_t^R$(64차원)만 저장하면 됩니다.

핵심 트릭은 내용 부분의 어텐션 스코어 계산에 있습니다. 순서대로 쓰면 이렇습니다.

$$
q_t^\top \cdot W^{UK} c_s \;=\; (W^{UK\top} q_t)^\top \cdot c_s \;=\; \tilde{q}_t^\top \cdot c_s
$$

$W^{UK}$는 위치와 무관한 고정 행렬이므로 Q 쪽으로 옮길 수 있습니다. $\tilde{q}_t = W^{UK\top} q_t$를 한 번만 계산해 두면 이후 모든 과거 토큰의 $c_s$와 직접 내적합니다. K를 복원하는 연산 자체가 사라지는 것입니다. 이것이 흡수(absorption)입니다.

V 쪽에서도 같은 원리가 적용됩니다. 어텐션 출력은 가중합 $\sum_s \alpha_{ts} V_s = \sum_s \alpha_{ts} W^{UV} c_s$이고 $W^{UV}$를 밖으로 빼면 $W^{UV} \sum_s \alpha_{ts} c_s$가 됩니다. $W^{UV}$를 출력 프로젝션 $W^O$에 미리 곱해(흡수시켜) 놓으면 $c_s$로 직접 가중합을 구할 수 있습니다.

최종 어텐션 스코어는 내용 점수와 위치 점수의 합입니다. 내용 점수는 흡수된 $\tilde{q}_t$와 $c_s$의 내적이고 위치 점수는 RoPE가 적용된 $q_t^R$과 $k_s^R$의 내적입니다. 두 점수를 더해 softmax를 취하면 어텐션 가중치가 나오고 이 가중치로 $c_s$의 가중합을 구한 뒤 흡수된 출력 프로젝션을 곱하면 최종 출력입니다.

추론 시 캐시에서 읽는 것은 $c_t$(512차원)와 $k_t^R$(64차원)뿐입니다. $W^{UK}$와 $W^{UV}$는 모델 로드 시 각각 Q 프로젝션과 출력 프로젝션에 한 번 흡수시키면 되고 추론 중에는 등장하지 않습니다. 앞 섹션 표의 576차원이 이 두 값의 합이고 RoPE와 압축이 양립할 수 있는 이유입니다.

## 마치며

MQA와 GQA는 K, V의 벌 수를 줄여 캐시를 아꼈고 MLA는 K, V 자체를 압축해 같은 목표를 다른 경로로 해결했습니다. 같은 방향이지만 메커니즘이 다릅니다. GQA는 2026년 현재 거의 모든 오픈 모델의 기본값이고 MLA는 DeepSeek-V2/V3와 Kimi K2 등 일부 모델에서 쓰입니다.

MLA에도 대가는 있습니다. 텐서 병렬(TP)로 여러 GPU에 나눌 때 GQA는 KV head를 GPU 수로 나눌 수 있습니다. MLA의 잠재 벡터 $c_t$는 헤드 단위가 아니므로 분할할 수 없고 모든 GPU가 전체를 들고 있어야 합니다. TP=4일 때 GQA-8의 GPU당 캐시는 $2{,}048 / 4 = 512$이지만 MLA는 576 그대로입니다. GPU를 늘릴수록 GQA의 캐시는 줄어드는데 MLA는 그렇지 않습니다.

DeepSeek-V3(2024)는 MLA를 V2와 동일한 차원($d_c = 512$, $d_h^R = 64$)으로 유지했습니다. 하지만 DeepSeek-V4(2026)는 MLA를 제거하고 시퀀스 축을 압축하는 방식(CSA, HCA)으로 전환했습니다. 토큰의 표현 차원이 아니라 캐시에 남기는 토큰 수 자체를 줄이는 접근입니다. MLA를 만든 팀이 MLA를 대체한 것이니 캐시를 줄이는 최적의 경로는 아직 열려 있습니다.

다음 글에서는 어떤 위치를 볼지를 줄이는 문제를 다룹니다. GQA와 MLA가 캐시에 무엇을 저장할지의 문제였다면 희소 어텐션은 어떤 위치를 아예 보지 않을지를 정합니다.

## 함께 보면 좋은 글

- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [MoE는 전문가를 어떻게 고를까](/llm/moe-architecture/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [LLM 서빙 성능 지표와 튜닝](/llm/llm-serving-metrics-tuning/)

## 참고자료

- [Fast Transformer Decoding: One Write-Head is All You Need (Shazeer, 2019)](https://arxiv.org/abs/1911.02150)
- [GQA: Training Generalized Multi-Query Transformer Models (Ainslie et al., EMNLP 2023)](https://arxiv.org/abs/2305.13245)
- [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model (2024)](https://arxiv.org/abs/2405.04434)
- [DeepSeek-V3 Technical Report (DeepSeek-AI, 2024)](https://arxiv.org/abs/2412.19437)
