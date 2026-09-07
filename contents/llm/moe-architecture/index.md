---
date: '2026-09-08'
title: 'MoE는 전문가를 어떻게 고를까'
category: 'LLM'
series: 'llm'
seriesOrder: 8
tags: ['LLM', 'MoE', 'Mixture of Experts', 'Router', 'Load Balancing']
summary: 'FFN을 전문가로 나눈 뒤 라우터가 토큰마다 일부만 골라 활성화하는 MoE의 원리를 다룹니다. 게이팅 수식, 전문가 붕괴, 보조 손실 없이 균형 잡는 법, 세분화 전문가까지 핵심 메커니즘을 정리합니다.'
thumbnail: './thumbnail.png'
---

Transformer 블록 안에서 파라미터가 가장 많은 부분은 FFN입니다. 가중치 행렬이 세 개($W_\text{gate}$, $W_\text{up}$, $W_\text{down}$)라서 레이어 전체 파라미터의 약 2/3를 차지합니다. 그런데 dense 모델은 모든 토큰에 이 FFN 전체를 통과시킵니다. 70B 모델이라면 관사 "the"에도 70B 파라미터가 동원되고 드문 의학 용어에도 같은 70B가 동원됩니다. 파라미터를 10배 늘리면 연산량도 10배 올라가는 구조입니다.

이 비례를 깨는 발상은 2017년으로 거슬러 올라갑니다. Shazeer et al.(2017)이 제안한 아이디어는 단순합니다. 하나의 큰 FFN 대신 $N$개의 작은 FFN(전문가, expert)을 두고 라우터(router)라는 작은 네트워크가 토큰마다 $k$개만 골라 활성화하는 것입니다. 이것이 MoE(Mixture of Experts)입니다.

총 파라미터는 늘어나지만 토큰당 활성 파라미터는 고정됩니다. DeepSeek-V3는 총 671B 파라미터를 갖고 있지만 토큰 하나에 활성화되는 것은 37B뿐입니다. 파라미터를 18배 늘렸는데 토큰당 비용은 그대로인 셈입니다. 어텐션은 변하지 않습니다. MoE가 대체하는 것은 오직 FFN이고 KV Cache 크기나 FlashAttention 같은 어텐션 최적화도 그대로 적용됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 340" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Dense 레이어와 MoE 레이어의 구조 비교. Dense는 하나의 FFN 전체를 활성화하고, MoE는 라우터가 N개 전문가 중 k개만 선택합니다">
<style>
.moe1-title { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.moe1-label { font-size: 14px; fill: var(--text, #1c1917); }
.moe1-sub { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe1-box { stroke-width: 1.5; rx: 6; }
.moe1-attn { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.moe1-ffn { fill: var(--primary, #0a756c); fill-opacity: 0.15; stroke: var(--primary, #0a756c); }
.moe1-ffn-dead { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.moe1-router { fill: var(--accent, #9d5604); fill-opacity: 0.15; stroke: var(--accent, #9d5604); }
.moe1-arrow { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#moe1Arrow); }
</style>
<defs>
<marker id="moe1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)" />
</marker>
</defs>
<!-- Dense -->
<text class="moe1-title" x="200" y="22" text-anchor="middle">Dense</text>
<rect class="moe1-box moe1-attn" x="120" y="34" width="160" height="36" />
<text class="moe1-label" x="200" y="57" text-anchor="middle">Attention</text>
<line class="moe1-arrow" x1="200" y1="70" x2="200" y2="82" />
<rect class="moe1-box moe1-ffn" x="120" y="84" width="160" height="48" />
<text class="moe1-label" x="200" y="113" text-anchor="middle">FFN (전체 활성)</text>
<text class="moe1-sub" x="200" y="148" text-anchor="middle">모든 토큰이 같은 FFN을 통과</text>
<!-- MoE -->
<text class="moe1-title" x="200" y="184" text-anchor="middle">MoE</text>
<rect class="moe1-box moe1-attn" x="120" y="196" width="160" height="36" />
<text class="moe1-label" x="200" y="219" text-anchor="middle">Attention</text>
<line class="moe1-arrow" x1="200" y1="232" x2="200" y2="244" />
<rect class="moe1-box moe1-router" x="150" y="246" width="100" height="28" />
<text class="moe1-label" x="200" y="265" text-anchor="middle">Router</text>
<!-- Expert boxes -->
<line class="moe1-arrow" x1="200" y1="274" x2="66" y2="290" />
<line class="moe1-arrow" x1="200" y1="274" x2="200" y2="290" />
<rect class="moe1-box moe1-ffn" x="30" y="292" width="72" height="28" />
<text class="moe1-label" x="66" y="311" text-anchor="middle">E₁</text>
<rect class="moe1-box moe1-ffn-dead" x="110" y="292" width="40" height="28" />
<rect class="moe1-box moe1-ffn-dead" x="158" y="292" width="40" height="28" />
<rect class="moe1-box moe1-ffn" x="206" y="292" width="72" height="28" />
<text class="moe1-label" x="242" y="311" text-anchor="middle">E₄</text>
<rect class="moe1-box moe1-ffn-dead" x="286" y="292" width="40" height="28" />
<rect class="moe1-box moe1-ffn-dead" x="334" y="292" width="40" height="28" />
<text class="moe1-sub" x="200" y="338" text-anchor="middle">N개 중 k개만 활성 (나머지 비활성)</text>
</svg>
</div>

<br>

## 라우터는 어떻게 전문가를 고르는가

라우터는 학습되는 선형 레이어 하나입니다. 토큰의 hidden state $x$를 받아 전문가마다 점수를 매기고 점수가 높은 $k$개만 선택합니다.

$$
G(x) = \text{Softmax}\bigl(\text{TopK}(W_g \cdot x,\, k)\bigr)
$$

$x$는 한 토큰의 hidden state입니다. $W_g$는 게이팅 가중치 행렬로 크기가 $d_\text{model} \times N$이고, $N$은 전문가 수입니다. TopK가 $N$개의 로짓 중 상위 $k$개만 남기고 나머지를 $-\infty$로 만든 뒤, softmax가 살아남은 $k$개를 확률 분포로 변환합니다.

선택된 전문가들은 각자 토큰을 처리한 뒤 게이팅 점수를 가중치로 삼아 출력을 합산합니다. $k=2$이고 전문가 3번이 0.7, 전문가 7번이 0.3을 받았다면 최종 출력은 $0.7 \times \text{E}_3(x) + 0.3 \times \text{E}_7(x)$입니다. 점수가 높은 전문가의 출력이 더 크게 반영되는 구조입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 240" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="라우터 데이터 흐름: 토큰 벡터가 선형 레이어를 거쳐 N개 점수를 받고, TopK와 softmax를 거쳐 k개 전문가를 선택한 뒤 가중합으로 출력하는 과정">
<style>
.moe2-t { font-size: 14px; fill: var(--text, #1c1917); }
.moe2-ts { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe2-box { stroke-width: 1.5; rx: 5; }
.moe2-input { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.moe2-proc { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); }
.moe2-sel { fill: var(--accent, #9d5604); fill-opacity: 0.12; stroke: var(--accent, #9d5604); }
.moe2-exp-on { fill: var(--primary, #0a756c); fill-opacity: 0.15; stroke: var(--primary, #0a756c); }
.moe2-exp { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.moe2-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#moe2Arr); }
</style>
<defs>
<marker id="moe2Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)" />
</marker>
</defs>
<!-- Row 1: x -> W_g -> TopK -> Softmax -->
<rect class="moe2-box moe2-input" x="16" y="16" width="50" height="30" />
<text class="moe2-t" x="41" y="36" text-anchor="middle">x</text>
<line class="moe2-arr" x1="66" y1="31" x2="82" y2="31" />
<rect class="moe2-box moe2-proc" x="84" y="16" width="72" height="30" />
<text class="moe2-t" x="120" y="36" text-anchor="middle">W_g · x</text>
<line class="moe2-arr" x1="156" y1="31" x2="172" y2="31" />
<rect class="moe2-box moe2-sel" x="174" y="16" width="64" height="30" />
<text class="moe2-t" x="206" y="36" text-anchor="middle">TopK</text>
<line class="moe2-arr" x1="238" y1="31" x2="254" y2="31" />
<rect class="moe2-box moe2-sel" x="256" y="16" width="80" height="30" />
<text class="moe2-t" x="296" y="36" text-anchor="middle">Softmax</text>
<!-- Row 2: k experts -->
<line class="moe2-arr" x1="296" y1="46" x2="296" y2="74" />
<text class="moe2-ts" x="200" y="90" text-anchor="middle">선택된 k개 전문가가 토큰을 처리</text>
<rect class="moe2-box moe2-exp-on" x="48" y="100" width="80" height="30" />
<text class="moe2-t" x="88" y="120" text-anchor="middle">E₃ (0.7)</text>
<rect class="moe2-box moe2-exp" x="136" y="100" width="42" height="30" />
<rect class="moe2-box moe2-exp" x="186" y="100" width="42" height="30" />
<rect class="moe2-box moe2-exp-on" x="236" y="100" width="80" height="30" />
<text class="moe2-t" x="276" y="120" text-anchor="middle">E₇ (0.3)</text>
<rect class="moe2-box moe2-exp" x="324" y="100" width="42" height="30" />
<!-- Row 3: weighted sum -->
<line class="moe2-arr" x1="88" y1="130" x2="160" y2="156" />
<line class="moe2-arr" x1="276" y1="130" x2="230" y2="156" />
<rect class="moe2-box moe2-proc" x="120" y="158" width="160" height="30" />
<text class="moe2-t" x="200" y="178" text-anchor="middle">0.7·E₃(x) + 0.3·E₇(x)</text>
<text class="moe2-ts" x="200" y="210" text-anchor="middle">게이팅 점수로 가중합한 최종 출력</text>
</svg>
</div>

라우터의 가중치 $W_g$는 모델의 나머지 파라미터와 함께 학습됩니다. 학습이 진행되면서 라우터는 각 토큰의 특성에 맞는 전문가를 고르는 법을 배우게 됩니다. 문제는 이 학습 과정에서 생깁니다.

<br>

## 전문가가 죽는 문제

라우터를 학습시키면 피드백 루프가 생깁니다. 학습 초기에 가중치가 무작위로 초기화된 상태에서 어떤 전문가가 우연히 약간 더 나은 출력을 냅니다. 라우터는 그 전문가에 더 높은 점수를 주고 더 많은 토큰이 그 전문가로 흐르고 더 많은 기울기 갱신을 받아 출력이 더 좋아집니다.

반대편 전문가들은 토큰을 거의 받지 못해 가중치가 갱신되지 않고 출력이 나빠지고 라우터가 더 외면합니다. 결국 256개 전문가 중 실질적으로 작동하는 것이 몇 개뿐인 상태가 됩니다. 이것을 전문가 붕괴(expert collapse)라고 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전문가 붕괴 시각화. 균형 상태에서는 토큰이 고르게 분배되지만, 붕괴 상태에서는 소수 전문가에 집중되고 나머지는 비활성화됩니다">
<style>
.moe3-title { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.moe3-ts { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe3-bar { rx: 3; }
.moe3-active { fill: var(--primary, #0a756c); fill-opacity: 0.7; }
.moe3-hot { fill: var(--accent, #9d5604); }
.moe3-dead { fill: var(--bg-muted, #eeecea); }
.moe3-loop { stroke: var(--text-danger, #cb2121); stroke-width: 1.2; fill: none; stroke-dasharray: 4 3; marker-end: url(#moe3Arr); }
</style>
<defs>
<marker id="moe3Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-danger, #cb2121)" />
</marker>
</defs>
<!-- Balanced -->
<text class="moe3-title" x="200" y="22" text-anchor="middle">균형 상태</text>
<text class="moe3-ts" x="24" y="50">토큰</text>
<rect class="moe3-bar moe3-active" x="64" y="38" width="36" height="50" />
<rect class="moe3-bar moe3-active" x="106" y="42" width="36" height="46" />
<rect class="moe3-bar moe3-active" x="148" y="36" width="36" height="52" />
<rect class="moe3-bar moe3-active" x="190" y="40" width="36" height="48" />
<rect class="moe3-bar moe3-active" x="232" y="44" width="36" height="44" />
<rect class="moe3-bar moe3-active" x="274" y="38" width="36" height="50" />
<rect class="moe3-bar moe3-active" x="316" y="42" width="36" height="46" />
<rect class="moe3-bar moe3-active" x="358" y="40" width="36" height="48" />
<text class="moe3-ts" x="200" y="104" text-anchor="middle">각 전문가가 비슷한 수의 토큰을 처리</text>
<!-- Collapsed -->
<text class="moe3-title" x="200" y="140" text-anchor="middle">붕괴 상태</text>
<text class="moe3-ts" x="24" y="168">토큰</text>
<rect class="moe3-bar moe3-hot" x="64" y="156" width="36" height="80" />
<rect class="moe3-bar moe3-dead" x="106" y="228" width="36" height="8" />
<rect class="moe3-bar moe3-dead" x="148" y="228" width="36" height="8" />
<rect class="moe3-bar moe3-hot" x="190" y="162" width="36" height="74" />
<rect class="moe3-bar moe3-dead" x="232" y="228" width="36" height="8" />
<rect class="moe3-bar moe3-dead" x="274" y="228" width="36" height="8" />
<rect class="moe3-bar moe3-dead" x="316" y="228" width="36" height="8" />
<rect class="moe3-bar moe3-dead" x="358" y="228" width="36" height="8" />
<!-- Feedback loop -->
<path class="moe3-loop" d="M 82,152 C 82,140 82,136 92,136 L 150,136 C 160,136 160,140 160,148" />
<text class="moe3-ts" x="200" y="256" text-anchor="middle">소수 전문가에 토큰 집중, 나머지 학습 정지</text>
<text class="moe3-ts" x="200" y="286" text-anchor="middle" style="fill: var(--text-danger, #cb2121);">더 많은 토큰 → 더 빠른 개선 → 더 높은 점수</text>
</svg>
</div>

Switch Transformer(Fedus et al., 2022)가 정립한 해법은 **보조 손실(auxiliary loss)**입니다. 언어 모델링 손실에 균형 유도 항을 더해 라우터가 토큰을 고르게 분배하도록 압력을 줍니다.

$$
\mathcal{L}_\text{aux} = \alpha \cdot N \sum_{i=1}^{N} f_i \cdot P_i
$$

$f_i$는 배치 안에서 전문가 $i$에 라우팅된 토큰의 비율이고, $P_i$는 전문가 $i$의 평균 게이팅 확률입니다. $N$은 전문가 수, $\alpha$는 손실 강도를 조절하는 하이퍼파라미터입니다. 특정 전문가에 토큰이 몰리면 $f_i$와 $P_i$가 동시에 높아지고 두 값의 곱이 커지면 손실이 올라가 라우터를 균일 분포 쪽으로 밀어냅니다.

문제는 $\alpha$의 균형입니다. 너무 낮으면 붕괴를 막지 못하고 너무 높으면 라우터가 균일 분포를 강제당해 전문화가 무력화됩니다. 모든 전문가가 비슷한 토큰을 비슷하게 처리하면 MoE를 쓰는 의미가 사라집니다. 붕괴를 막는 것과 전문화를 유지하는 것은 본질적으로 상충하는 목표이고, $\alpha$ 하나로 둘 다 제어하기는 어렵습니다.

DeepSeek-V3(2024)는 보조 손실을 아예 제거했습니다. 대신 전문가마다 bias 항 $b_i$를 두고 전문가 선택 시 점수에 $b_i$를 더합니다. 매 학습 스텝이 끝날 때 전체 배치의 전문가별 부하를 확인하고 과소 활용된 전문가의 bias를 올리고 과다 활용된 전문가의 bias를 내립니다.

핵심은 이 bias가 전문가 선택에만 영향을 주고 최종 게이팅 가중치에는 포함되지 않는다는 점입니다. 실제 출력을 합산할 때는 bias가 빠진 원래 점수를 쓰므로 모델의 표현력에 영향이 없습니다. 기울기가 아니라 부하 통계에 기반한 단순 조정이라서 라우터의 학습 신호가 온전히 언어 모델링 목적함수에만 집중됩니다. DeepSeek 팀은 이 접근을 "auxiliary-loss-free load balancing"이라 명명했습니다.

<br>

## 전문가를 잘게 나누면

MoE의 초기 형태인 Mixtral(2023)은 8개의 큰 전문가를 두고 2개를 선택합니다. 각 전문가가 전체 FFN과 같은 크기입니다. 8개에서 2개를 고르면 가능한 조합은 28가지입니다.

DeepSeek-V3(2024)는 전혀 다른 접근을 택했습니다. 전문가를 256개로 잘게 나누고 8개를 선택합니다. 가능한 조합이 약 4.4조 가지로 늘어나면서 토큰마다 훨씬 정밀한 전문가 조합을 만들 수 있습니다. DeepSeekMoE(Dai et al., ACL 2024)는 이 세분화 전문가(fine-grained expert) 설계로 동급 dense 모델의 약 40% 연산 비용만으로 비슷한 성능을 달성할 수 있음을 보여줬습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전문가 세분화 비교. Mixtral식 8개 큰 전문가(2개 활성)와 DeepSeek식 다수의 작은 전문가(8개 활성)">
<style>
.moe4-title { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.moe4-ts { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe4-big { rx: 4; stroke-width: 1.5; }
.moe4-small { rx: 2; stroke-width: 1; }
.moe4-on { fill: var(--primary, #0a756c); fill-opacity: 0.6; stroke: var(--primary, #0a756c); }
.moe4-off { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
</style>
<!-- Coarse (Mixtral) -->
<text class="moe4-title" x="200" y="22" text-anchor="middle">Mixtral (8개, top-2)</text>
<rect class="moe4-big moe4-on" x="16" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="66" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="116" y="34" width="42" height="60" />
<rect class="moe4-big moe4-on" x="166" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="216" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="266" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="316" y="34" width="42" height="60" />
<rect class="moe4-big moe4-off" x="366" y="34" width="26" height="60" />
<text class="moe4-ts" x="200" y="114" text-anchor="middle">C(8,2) = 28가지 조합</text>
<!-- Fine-grained (DeepSeek) -->
<text class="moe4-title" x="200" y="148" text-anchor="middle">DeepSeek-V3 (256개, top-8)</text>
<!-- Row 1: 16 small boxes -->
<rect class="moe4-small moe4-on" x="16" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="40" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="64" y="162" width="20" height="20" />
<rect class="moe4-small moe4-on" x="88" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="112" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="136" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="160" y="162" width="20" height="20" />
<rect class="moe4-small moe4-on" x="184" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="208" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="232" y="162" width="20" height="20" />
<rect class="moe4-small moe4-on" x="256" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="280" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="304" y="162" width="20" height="20" />
<rect class="moe4-small moe4-on" x="328" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="352" y="162" width="20" height="20" />
<rect class="moe4-small moe4-off" x="376" y="162" width="20" height="20" />
<!-- Row 2 -->
<rect class="moe4-small moe4-off" x="16" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="40" y="186" width="20" height="20" />
<rect class="moe4-small moe4-on" x="64" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="88" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="112" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="136" y="186" width="20" height="20" />
<rect class="moe4-small moe4-on" x="160" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="184" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="208" y="186" width="20" height="20" />
<rect class="moe4-small moe4-on" x="232" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="256" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="280" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="304" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="328" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="352" y="186" width="20" height="20" />
<rect class="moe4-small moe4-off" x="376" y="186" width="20" height="20" />
<text class="moe4-ts" x="200" y="224" text-anchor="middle">+ 224개 더</text>
<text class="moe4-ts" x="200" y="248" text-anchor="middle">C(256,8) = 약 4.4조 가지 조합</text>
<text class="moe4-ts" x="200" y="272" text-anchor="middle">토큰별 정밀한 전문가 선택 가능</text>
</svg>
</div>

이후 Kimi K2와 DeepSeek-V4(2026)는 전문가를 384개까지 늘렸습니다. 방향은 분명히 "더 잘게"이지만, 전문가가 작아질수록 개별 전문가의 용량이 줄어들고 라우팅 노이즈의 영향이 커집니다. 최적의 전문가 수는 모델 규모와 학습 데이터에 따라 달라지며 합의된 값은 아직 없습니다.

<br>

## 마치며

MoE는 모든 토큰에 모든 파라미터를 쓰는 낭비를 해결했지만 라우터라는 새 설계 공간을 열었습니다. 전문가 붕괴를 잡기 위해 보조 손실이 등장했고 보조 손실의 한계를 넘기 위해 bias 기반 밸런싱이 뒤따랐습니다. 전문가의 세분화는 조합의 정밀도를 높였지만 그만큼 라우팅의 어려움도 커졌습니다.

이 글에서 다루지 않은 설계 선택도 많습니다. 라우팅에 softmax를 쓸지 sigmoid를 쓸지, 모든 토큰에 항상 활성화되는 공유 전문가를 둘지 말지, 활성화할 전문가 수 $k$를 얼마로 할지 등은 2026년 현재에도 연구소마다 답이 다릅니다. MoE의 총 파라미터에서 오는 메모리 부담과 Expert Parallelism의 서빙 전략은 [LLM 서빙 성능 지표와 튜닝](/llm/llm-serving-metrics-tuning/)에서 다루고 있습니다.

다음 글에서는 어텐션 쪽을 다룹니다. MoE가 FFN을 쪼갠 것이었다면, MHA에서 GQA를 거쳐 MLA까지의 흐름은 어텐션 헤드를 압축하는 것입니다.

<br>

## 함께 보면 좋은 글

- [Transformer 블록 뜯어보기](/llm/normalization-and-residual/)
- [FlashAttention은 왜 더 많이 계산하면서 더 빠를까](/llm/flash-attention/)
- [Gemma 4 아키텍처 총정리](/llm/gemma4-architecture/)
- [LLM 서빙 성능 지표와 튜닝](/llm/llm-serving-metrics-tuning/)

<br>

## 참고자료

- [Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer (Shazeer et al., ICLR 2017)](https://arxiv.org/abs/1701.06538)
- [Switch Transformers: Scaling to Trillion Parameter Models (Fedus et al., JMLR 2022)](https://arxiv.org/abs/2101.03961)
- [DeepSeekMoE: Towards Ultimate Expert Specialization (Dai et al., ACL 2024)](https://arxiv.org/abs/2401.06066)
- [Mixtral of Experts (Jiang et al., 2024)](https://arxiv.org/abs/2401.04088)
- [DeepSeek-V3 Technical Report (DeepSeek-AI, 2024)](https://arxiv.org/abs/2412.19437)
