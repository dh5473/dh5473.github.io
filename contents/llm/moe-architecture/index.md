---
date: '2026-09-04'
title: '(제목 미정)'
category: 'LLM'
series: 'llm'
seriesOrder: 8
tags: ['LLM', 'MoE', 'Mixture of Experts', 'Router', 'Load Balancing']
summary: '(요약 미정)'
thumbnail: './thumbnail.png'
---

Transformer 블록 안에서 파라미터가 가장 많은 부분은 FFN입니다. 가중치 행렬이 세 개($W_\text{gate}$, $W_\text{up}$, $W_\text{down}$)라서 레이어 전체 파라미터의 약 2/3를 차지합니다. 그런데 dense 모델은 모든 토큰에 이 FFN 전체를 통과시킵니다. 70B 모델이라면 관사 "the"에도 70B 파라미터가 동원되고, 드문 의학 용어에도 같은 70B가 동원됩니다. 파라미터를 10배 늘리면 연산량도 10배 올라가는 구조입니다.

이 비례를 깨는 발상은 2017년으로 거슬러 올라갑니다. Shazeer et al.(2017)이 제안한 아이디어는 단순합니다. 하나의 큰 FFN 대신 $N$개의 작은 FFN(전문가, expert)을 두고, 라우터(router)라는 작은 네트워크가 토큰마다 $k$개만 골라 활성화하는 것입니다. 이것이 MoE(Mixture of Experts)입니다. 총 파라미터는 늘어나지만 토큰당 활성 파라미터는 고정됩니다. DeepSeek-V3는 총 671B 파라미터를 갖고 있지만 토큰 하나에 활성화되는 것은 37B뿐입니다. 파라미터를 18배 늘렸는데 토큰당 비용은 그대로인 셈입니다.

어텐션은 변하지 않습니다. MoE가 대체하는 것은 오직 FFN입니다. 그래서 KV Cache 크기도 바뀌지 않고, 어텐션 관련 최적화(FlashAttention, MQA/GQA 등)도 그대로 적용됩니다. 바뀌는 것은 FFN 레이어의 구조와 그 구조를 학습시키는 방식입니다.

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

라우터는 학습되는 선형 레이어 하나입니다. 토큰의 hidden state $x$를 받아 전문가마다 점수(affinity score)를 매기고, 점수가 높은 $k$개만 선택합니다.

$$
G(x) = \text{Softmax}\bigl(\text{TopK}(W_g \cdot x,\, k)\bigr)
$$

$x$는 한 토큰의 hidden state입니다. $W_g$는 게이팅 가중치 행렬로 크기가 $d_\text{model} \times N$이고, $N$은 전문가 수입니다. TopK가 $N$개의 로짓 중 상위 $k$개만 남기고 나머지를 $-\infty$로 만든 뒤, softmax가 살아남은 $k$개를 확률 분포로 변환합니다. 이것이 Shazeer et al.(2017)이 제안한 원래 형태입니다. 선택된 전문가들은 각자 토큰을 처리한 뒤, 게이팅 점수를 가중치로 삼아 출력을 합산합니다. 예를 들어 $k=2$이고 전문가 3번이 0.7, 전문가 7번이 0.3을 받았다면, 최종 출력은 $0.7 \times \text{E}_3(x) + 0.3 \times \text{E}_7(x)$입니다.

수식만 보면 단순해 보이지만, softmax를 어디서 적용하는지에 따라 학습 동역학이 달라집니다. Mixtral(Jiang et al., 2024)은 로짓에서 top-$k$를 먼저 뽑은 다음, 선택된 $k$개에만 softmax를 적용합니다. 선택되지 않은 전문가에는 기울기가 전혀 흐르지 않습니다. 반면 DeepSeek-V2(2024)는 softmax를 먼저 전체 $N$개에 적용하고 그 다음 top-$k$를 선택합니다. softmax 분모에 모든 전문가가 포함되어 있으므로 선택되지 않은 전문가에도 간접적으로 기울기가 흐릅니다. 선택되지 않은 전문가도 "다음번에 선택될 확률"을 조금씩 조정받는 것입니다.

DeepSeek-V3(2024)는 한 발 더 나갑니다. softmax 대신 sigmoid를 씁니다. softmax에서는 전문가 점수의 합이 1이라 한 전문가의 점수가 오르면 다른 전문가의 점수가 내려가는 제로섬 구조인데, sigmoid는 각 전문가의 점수가 독립입니다. 전문가 3번의 점수를 올려도 전문가 7번의 점수가 줄지 않습니다. 선택된 전문가들의 점수는 따로 정규화해서 합이 1이 되게 맞춥니다.

후속 모델인 DeepSeek-V4(2026)는 여기서 다시 $\sqrt{\text{softplus}}$로 바꿨습니다. 한 팀이 세 버전 연속으로 활성 함수를 교체한 것입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 260" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="라우터 데이터 흐름: 토큰 벡터가 선형 레이어를 거쳐 점수를 받고, softmax 또는 sigmoid를 적용한 뒤 TopK로 전문가를 선택하는 과정">
<style>
.moe2-t { font-size: 14px; fill: var(--text, #1c1917); }
.moe2-ts { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe2-box { stroke-width: 1.5; rx: 5; }
.moe2-input { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.moe2-proc { fill: var(--primary, #0a756c); fill-opacity: 0.12; stroke: var(--primary, #0a756c); }
.moe2-sel { fill: var(--accent, #9d5604); fill-opacity: 0.12; stroke: var(--accent, #9d5604); }
.moe2-exp { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.moe2-exp-on { fill: var(--primary, #0a756c); fill-opacity: 0.15; stroke: var(--primary, #0a756c); }
.moe2-arr { stroke: var(--text-muted, #6d6762); stroke-width: 1.2; fill: none; marker-end: url(#moe2Arr); }
</style>
<defs>
<marker id="moe2Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)" />
</marker>
</defs>
<!-- Row 1: x -> Linear -> N scores -->
<rect class="moe2-box moe2-input" x="16" y="18" width="56" height="30" />
<text class="moe2-t" x="44" y="38" text-anchor="middle">x</text>
<line class="moe2-arr" x1="72" y1="33" x2="90" y2="33" />
<rect class="moe2-box moe2-proc" x="92" y="18" width="80" height="30" />
<text class="moe2-t" x="132" y="38" text-anchor="middle">W_g · x</text>
<line class="moe2-arr" x1="172" y1="33" x2="190" y2="33" />
<rect class="moe2-box moe2-sel" x="192" y="18" width="100" height="30" />
<text class="moe2-t" x="242" y="38" text-anchor="middle">softmax</text>
<line class="moe2-arr" x1="292" y1="33" x2="310" y2="33" />
<rect class="moe2-box moe2-sel" x="312" y="18" width="72" height="30" />
<text class="moe2-t" x="348" y="38" text-anchor="middle">TopK</text>
<!-- Annotation -->
<text class="moe2-ts" x="242" y="66" text-anchor="middle">Mixtral: TopK 먼저 → softmax</text>
<text class="moe2-ts" x="242" y="82" text-anchor="middle">DeepSeek-V2: softmax 먼저 → TopK</text>
<text class="moe2-ts" x="242" y="98" text-anchor="middle">DeepSeek-V3: sigmoid (독립 점수)</text>
<!-- Row 2: selected experts -->
<line class="moe2-arr" x1="348" y1="48" x2="348" y2="118" />
<text class="moe2-t" x="200" y="130" text-anchor="middle">선택된 k개 전문가</text>
<rect class="moe2-box moe2-exp-on" x="40" y="140" width="70" height="30" />
<text class="moe2-t" x="75" y="160" text-anchor="middle">E₁</text>
<rect class="moe2-box moe2-exp" x="118" y="140" width="42" height="30" />
<rect class="moe2-box moe2-exp-on" x="168" y="140" width="70" height="30" />
<text class="moe2-t" x="203" y="160" text-anchor="middle">E₄</text>
<rect class="moe2-box moe2-exp" x="246" y="140" width="42" height="30" />
<rect class="moe2-box moe2-exp" x="296" y="140" width="42" height="30" />
<rect class="moe2-box moe2-exp" x="346" y="140" width="42" height="30" />
<!-- Row 3: weighted sum -->
<line class="moe2-arr" x1="75" y1="170" x2="160" y2="198" />
<line class="moe2-arr" x1="203" y1="170" x2="200" y2="198" />
<rect class="moe2-box moe2-proc" x="130" y="200" width="140" height="30" />
<text class="moe2-t" x="200" y="220" text-anchor="middle">가중합 → 출력</text>
<text class="moe2-ts" x="200" y="252" text-anchor="middle">게이팅 점수 × 전문가 출력의 합</text>
</svg>
</div>

구현 세부처럼 보이지만, 어떤 함수를 쓰느냐에 따라 비선택 전문가에 기울기가 흐르는지가 달라지고, 이는 전문가 전문화의 방향을 바꿉니다. 그리고 이 선택에 대한 업계 표준은 아직 없습니다.

<br>

## 전문가가 죽는 문제

MoE를 학습시키면 라우터에서 피드백 루프가 생깁니다. 학습 초기에 가중치가 무작위로 초기화된 상태에서 어떤 전문가가 우연히 약간 더 나은 출력을 냅니다. 라우터는 그 전문가에 더 높은 점수를 주고, 더 많은 토큰이 그 전문가로 흐르고, 더 많은 기울기 갱신을 받아 출력이 더 좋아집니다.

반대편 전문가들은 토큰을 거의 받지 못해 가중치가 갱신되지 않고, 출력이 나빠지고, 라우터가 더 외면합니다. 결국 256개 전문가 중 실질적으로 작동하는 것이 몇 개뿐인 상태가 됩니다. 이것을 전문가 붕괴(expert collapse)라고 합니다. 큰 비용을 들여 MoE를 만든 의미가 사라지는 것입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전문가 붕괴 시각화. 균형 상태에서는 토큰이 고르게 분배되지만, 붕괴 상태에서는 소수 전문가에 집중되고 나머지는 비활성화됩니다">
<style>
.moe3-title { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.moe3-t { font-size: 14px; fill: var(--text, #1c1917); }
.moe3-ts { font-size: 13px; fill: var(--text-muted, #6d6762); }
.moe3-bar { rx: 3; }
.moe3-active { fill: var(--primary, #0a756c); fill-opacity: 0.7; }
.moe3-hot { fill: var(--accent, #9d5604); }
.moe3-dead { fill: var(--bg-muted, #eeecea); }
.moe3-border { stroke: var(--border, #e7e5e4); stroke-width: 1; fill: none; }
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
<!-- 8 balanced bars -->
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
<!-- 8 collapsed bars: 2 tall, 6 flat -->
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

이 문제는 MoE 연구 초기부터 핵심 과제였습니다. GShard(Lepikhin et al., 2020)는 전문가 용량에 상한을 두고 넘치는 토큰을 버리는 방식으로 대응했습니다. 하지만 토큰을 버리면 학습 손실이 생기고, 상한 자체가 새로운 하이퍼파라미터가 됩니다. Switch Transformer(Fedus et al., 2022)는 이를 대체할 미분 가능한 해법으로 **보조 손실(auxiliary loss)**을 정립했습니다. 언어 모델링 손실에 균형 유도 항을 더해 라우터가 토큰을 고르게 분배하도록 압력을 줍니다.

$$
\mathcal{L}_\text{aux} = \alpha \cdot N \sum_{i=1}^{N} f_i \cdot P_i
$$

$f_i$는 배치 안에서 전문가 $i$에 라우팅된 토큰의 비율이고, $P_i$는 전문가 $i$의 평균 게이팅 확률입니다. $N$은 전문가 수, $\alpha$는 손실 강도를 조절하는 하이퍼파라미터입니다. 특정 전문가에 토큰이 몰리면($f_i$ 높음) 라우터도 그 전문가를 선호하게 되는데($P_i$ 높음), 두 값의 곱이 커지면 손실이 올라가 라우터를 균일 분포 쪽으로 밀어냅니다.

문제는 $\alpha$의 균형입니다. 너무 낮으면 붕괴를 막지 못하고, 너무 높으면 라우터가 균일 분포를 강제당해 전문화가 무력화됩니다. 모든 전문가가 비슷한 토큰을 비슷하게 처리하면 MoE를 쓰는 의미가 사라집니다. ST-MoE(Zoph et al., 2022)는 이 하이퍼파라미터가 모델 크기와 전문가 수에 따라 민감하게 바뀌며, 로짓이 발산하는 것을 막기 위한 별도의 router z-loss까지 필요하다는 것을 문서화했습니다. 보조 손실 하나로 전문가 붕괴와 전문화 저해를 동시에 제어하는 것은 본질적으로 상충하는 목표입니다.

<br>

## 보조 손실 없이 균형 잡기

DeepSeek-V3(2024)는 보조 손실을 아예 제거했습니다. 대신 전문가마다 bias 항 $b_i$를 두고, 전문가 선택 시 점수에 $b_i$를 더합니다. 매 학습 스텝이 끝날 때 전체 배치의 전문가별 부하를 확인하고, 과소 활용된 전문가의 bias를 $\gamma$만큼 올리고 과다 활용된 전문가의 bias를 $\gamma$만큼 내립니다. 핵심은 이 bias가 전문가 선택에만 영향을 주고 최종 게이팅 가중치에는 포함되지 않는다는 점입니다. 실제 출력을 합산할 때는 bias가 빠진 원래 점수를 쓰므로, 모델의 표현력에는 영향이 없습니다. 기울기를 통한 학습 신호가 아니라 부하 통계에 기반한 단순 조정이라서, 라우터의 기울기가 온전히 언어 모델링 목적함수에만 집중됩니다.

DeepSeek 팀은 이 접근을 "auxiliary-loss-free load balancing"이라 명명했습니다. 보조 손실이 라우터에 "골고루 보내라"는 기울기 신호를 주는 방식이었다면, bias 기반 조정은 라우터 바깥에서 선택 기준만 살짝 조정하는 방식입니다.

Qwen3(2025)는 다른 방향으로 같은 문제를 풀었습니다. 보조 손실을 유지하되 적용 범위를 micro-batch에서 global-batch로 넓혔습니다. micro-batch 수준에서 밸런싱하면 각 배치 안에서는 고르게 분포하지만 전체적으로는 모든 전문가가 모든 도메인을 비슷하게 처리하게 됩니다. 전문화가 아니라 균일화가 일어나는 것입니다. global-batch 수준으로 바꾸자 전문가가 도메인별로 자연스럽게 전문화됐다고 Qwen 팀은 보고합니다. 코드 토큰은 특정 전문가들로, 수학 토큰은 다른 전문가들로 자연스럽게 몰리면서도 전체 부하는 균형을 유지합니다.

두 접근 모두 "보조 손실의 $\alpha$를 얼마로 할 것인가"라는 문제를 우회합니다. 2026년 신규 MoE 아키텍처에서 이 두 방향이 표준이 되고 있지만, 어느 쪽이 더 나은지에 대한 합의는 아직 없습니다.

<br>

## 아직 합의되지 않은 것들

MoE의 기본 구조(FFN을 전문가로 분할, 라우터로 선택)에는 이견이 없습니다. 그런데 그 안의 거의 모든 설계 선택에서 연구소마다 답이 다릅니다.

**전문가를 얼마나 잘게 나눌 것인가.** Mixtral(2023)은 8개의 큰 전문가를 두고 2개를 선택합니다. 각 전문가가 전체 FFN과 같은 크기이므로 전문가 하나의 파라미터가 많습니다. DeepSeek-V3(2024)는 256개의 작은 전문가 중 8개를 선택합니다. 8개에서 2개를 고르면 조합이 28가지이지만, 256개에서 8개를 고르면 약 4.4조 가지입니다. 토큰마다 훨씬 정밀한 전문가 조합이 가능해집니다.

DeepSeekMoE(Dai et al., ACL 2024)는 이 세분화 전문가(fine-grained expert) 설계로 동급 dense 모델 대비 약 40%의 연산 비용으로 비슷한 성능을 달성할 수 있음을 보여줬습니다. 이후 Kimi K2와 DeepSeek-V4(2026)는 384개까지 늘렸습니다. 방향은 분명히 "더 잘게"이지만, 전문가가 작아질수록 개별 전문가의 용량이 줄어들고 라우팅 노이즈의 영향이 커집니다.

DeepSeek-V4는 이 노이즈 문제를 다르게 접근했습니다. 첫 3개 MoE 레이어에서는 학습된 라우터 대신 해시 기반 라우팅(token ID로 전문가를 고정 배정)을 써서 라우팅 노이즈 자체를 없앴습니다. 나머지 레이어에서만 학습된 라우터를 씁니다. 최적의 전문가 수는 모델 규모와 학습 데이터에 따라 달라지며 합의된 값은 없습니다.

| 모델 | 전문가 | 활성(k) | 공유 | 총/활성 파라미터 |
|------|--------|---------|------|-----------------|
| Mixtral (2023) | 8 | 2 | 0 | 46.7B / 12.9B |
| DeepSeek-V3 (2024) | 256 | 8 | 1 | 671B / 37B |
| Qwen3-235B (2025) | 128 | 8 | 0 | 235B / 22B |
| GPT-OSS 120B (2025) | 128 | 4 | 0 | 116.8B / 5.1B |
| Llama 4 Maverick (2025) | 128 | 1 | 1 | 400B / 17B |
| Gemma 4 26B (2026) | 128 | 8 | 1 | 25.2B / 3.8B |
| Kimi K2 (2025) | 384 | 8 | 1 | 1.04T / 32B |
| DeepSeek-V4 (2026) | 384 | 6 | 1 | 1.6T / 49B |

**공유 전문가를 둘 것인가.** 일부 모델은 라우팅과 무관하게 모든 토큰에 항상 활성화되는 공유 전문가(shared expert)를 둡니다. 문법이나 상식 같은 범용 지식을 전담시켜 라우팅 전문가가 특화된 지식에 집중하게 하려는 설계입니다.

Qwen의 궤적이 이 논쟁을 잘 보여줍니다. Qwen1.5-MoE(2024)는 공유 전문가를 뒀고, Qwen2(2024)는 8개로 늘렸고, Qwen3(2025)는 0개로 완전히 제거했고, Qwen3-Next(2026)는 1개로 다시 복원했습니다. 한 팀이 네 세대에 걸쳐 세 번 설정을 바꾼 것입니다.

OLMoE(Muennighoff et al., 2024)는 공유 전문가 어블레이션을 수행한 결과 오히려 성능이 약간 낮아졌다고 보고했습니다. 공유 전문가가 하나 들어가면 라우팅 풀이 줄어 가능한 전문가 조합이 크게 감소하기 때문으로 분석됩니다. 반면 DeepSeek은 V2부터 V4까지 일관되게 공유 전문가를 유지합니다. 같은 문제를 보면서도 결론이 갈리는 것입니다.

**라우팅 활성 함수.** 위에서 본 것처럼, softmax(Mixtral, GPT-OSS), sigmoid(DeepSeek-V3), $\sqrt{\text{softplus}}$(DeepSeek-V4)가 혼재합니다. DeepSeek 혼자서도 V2, V3, V4가 각각 다른 함수를 씁니다. 표준화된 선택이 없다는 것은, 이 선택이 최종 성능에 미치는 영향이 다른 설계 변수들과 얽혀 있어 독립적으로 평가하기 어렵다는 뜻이기도 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전문가 세분화 비교. Mixtral식 8개 큰 전문가(2개 활성)와 DeepSeek식 다수의 작은 전문가(8개 활성)">
<style>
.moe4-title { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.moe4-t { font-size: 14px; fill: var(--text, #1c1917); }
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
<!-- ... more rows implied -->
<text class="moe4-ts" x="200" y="224" text-anchor="middle">+ 224개 더</text>
<text class="moe4-ts" x="200" y="248" text-anchor="middle">C(256,8) = 약 4.4조 가지 조합</text>
<text class="moe4-ts" x="200" y="272" text-anchor="middle">토큰별 정밀한 전문가 선택 가능</text>
</svg>
</div>

활성화되는 전문가 수($k$)도 모델마다 다릅니다. Mixtral은 top-2, GPT-OSS는 top-4, DeepSeek-V3는 top-8, DeepSeek-V4는 top-6, Llama 4는 top-1입니다. top-$k$ 최적값을 다룬 최근 연구(arXiv 2509.23678)는 대규모 실험 446개를 분석한 결과 약 6.78 근처가 최적이라고 보고하지만, 이 수치가 모든 아키텍처에 일반화되는지는 아직 검증되지 않았습니다.

프론티어에서 dense 모델은 거의 사라졌습니다. 2026년 주요 릴리스인 DeepSeek-V4, Qwen3, Llama 4, GPT-OSS, Kimi K2가 모두 MoE입니다. 그런데 전문가를 몇 개 두고, 공유 전문가를 쓸지 말지, 라우터에 어떤 함수를 넣을지, $k$를 얼마로 할지, 연구소마다 답이 다릅니다. MoE는 FFN의 낭비를 풀었지만, 라우터라는 새로운 설계 공간에서 답이 수렴하려면 아직 더 많은 실험이 필요합니다.

<br>

## 마치며

1~7편에서 Transformer 블록의 부품을 하나씩 다뤘습니다. 8편에서 마주한 MoE는 그 부품 중 가장 큰 FFN을 쪼개는 방법이었는데, 쪼개는 방법 자체가 아직 열린 연구 문제입니다. 그룹 2의 나머지 글에서 다룰 어텐션 변형, 희소 어텐션, 선형 어텐션도 비슷한 상황입니다. 교과서의 Transformer와 실제 모델 사이의 간극이 여기서부터 시작됩니다.

MoE는 총 파라미터가 크기 때문에 모든 전문가를 GPU 메모리에 올려야 하고, Expert Parallelism에서 all-to-all 통신 비용도 발생합니다. 이러한 추론 특성과 서빙 전략은 [LLM 서빙 성능 지표와 튜닝](/llm/llm-serving-metrics-tuning/)에서 다루고 있습니다.

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
- [ST-MoE: Designing Stable and Transferable Sparse Expert Models (Zoph et al., 2022)](https://arxiv.org/abs/2202.08906)
- [DeepSeekMoE: Towards Ultimate Expert Specialization (Dai et al., ACL 2024)](https://arxiv.org/abs/2401.06066)
- [Mixtral of Experts (Jiang et al., 2024)](https://arxiv.org/abs/2401.04088)
- [DeepSeek-V3 Technical Report (DeepSeek-AI, 2024)](https://arxiv.org/abs/2412.19437)
- [OLMoE: Open Mixture-of-Experts Language Models (Muennighoff et al., 2024)](https://arxiv.org/abs/2409.02060)
- [Qwen3 Technical Report (Qwen Team, 2025)](https://arxiv.org/abs/2505.09388)
- [DeepSeek-V4 Technical Report (DeepSeek-AI, 2026)](https://arxiv.org/abs/2606.19348)
