---
date: '2026-07-01'
title: 'Claude Sonnet 5 출시, Opus급 성능?'
category: 'Issue'
tags: ['Claude', 'Sonnet 5', 'Anthropic', 'LLM', 'AI Model']
summary: 'Sonnet 5가 Opus 4.8에 어디까지 근접했는지, 토큰 단가가 그대로인데 태스크당 비용은 왜 오르는지를 시스템 카드와 공식 가격표로 확인합니다.'
thumbnail: './thumbnail.png'
---

2026년 6월 30일, Anthropic이 Claude Sonnet 5를 출시했습니다. 출시와 함께 전 플랜에서 쓸 수 있고 API에서도 바로 호출할 수 있습니다.

공식 발표가 내세운 메시지는 하나입니다. **Opus 4.8에 근접하는 성능을 Sonnet 가격대에 낸다**는 것입니다. 이 구도는 처음이 아닙니다. 2024년에 Sonnet 3.5가 당시 최상위 모델이던 Opus 3을 앞선 전례가 있고, Sonnet 라인이 이전 세대 Opus를 따라잡는 흐름은 이제 반복되는 패턴이 됐습니다.

## 핵심 스펙

| 항목 | 값 |
|------|-----|
| 모델 ID | `claude-sonnet-5` |
| 컨텍스트 윈도우 | 1M 토큰 |
| 최대 출력 | 128K 토큰 |
| 토크나이저 | 신규 (같은 텍스트에 약 1.0~1.35배 토큰) |
| 프로모션 가격 | 입력 \$2/MTok, 출력 \$10/MTok (8월 31일까지) |
| 정규 가격 | 입력 \$3/MTok, 출력 \$15/MTok |
| Adaptive Thinking | 기본 활성화 (비활성화 가능) |
| 가용성 | Claude 전 플랜, Claude Code, Claude Platform, AWS, Microsoft Foundry |

출시 시점 기준으로 Google Vertex는 준비 중으로 안내됐습니다. Anthropic은 Sonnet 5를 "가장 에이전틱한 Sonnet 모델"이라고 소개했습니다. 계획 수립, 브라우저와 터미널 같은 도구 사용, 자율적 실행까지 에이전틱 워크플로우에 맞춘 것이 공식 포지셔닝입니다.

:::info

**토크나이저가 바뀌었습니다**

Sonnet 5는 새로운 토크나이저를 씁니다. 공식 표현으로는 같은 텍스트가 콘텐츠 유형에 따라 **약 1.0배에서 1.35배**의 토큰으로 매핑됩니다. 토큰 단가가 같더라도 실제 비용은 달라진다는 뜻입니다. 이 부분은 뒤에서 자세히 다룹니다.

:::

## 벤치마크

아래 표는 Sonnet 5 시스템 카드의 평가 요약에서 옮긴 값입니다. 별도 표기가 없으면 adaptive thinking과 max effort, 기본 샘플링 설정으로 5회 시행한 평균이고, 경쟁 모델 수치는 각 개발사가 공개한 시스템 카드와 리더보드 기준입니다.

| 벤치마크 | Sonnet 4.6 | **Sonnet 5** | GPT-5.5 |
|---------|:---------:|:----------:|:-------:|
| SWE-bench Pro | 58.1 | **63.2** | 58.6 |
| Terminal-Bench 2.1 | 67.0 | **80.4** | 83.4 (Codex CLI) |
| OSWorld-Verified | 78.5 | **81.2** | 78.7 |
| GDPval-AA v2 (Elo) | 1,395 | **1,618** | 1,509 |

같은 두 모델을 놓고도 벤치마크마다 우열이 갈립니다. 저장소 단위 코딩(SWE-bench Pro)과 컴퓨터 사용(OSWorld-Verified)에서는 Sonnet 5가 GPT-5.5를 앞서고, 터미널 작업(Terminal-Bench 2.1)에서는 반대입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 306" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="SWE-bench Pro와 OSWorld-Verified에서는 Sonnet 5가, Terminal-Bench 2.1에서는 GPT-5.5가 앞서는 막대 비교">
<style>
.s5a-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.s5a-n { fill: var(--text, #1c1917); font-size: 14px; }
.s5a-v { fill: var(--text-muted, #6d6762); font-size: 14px; }
.s5a-a { fill: var(--primary, #0a756c); }
.s5a-b { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="s5a-t" x="12" y="20">벤치마크마다 갈리는 우열</text>
<!-- 범례 -->
<rect class="s5a-a" x="12" y="32" width="12" height="12" rx="2"/>
<text class="s5a-n" x="30" y="43">Sonnet 5</text>
<rect class="s5a-b" x="112" y="32" width="12" height="12" rx="2"/>
<text class="s5a-n" x="130" y="43">GPT-5.5</text>
<!-- SWE-bench Pro -->
<text class="s5a-n" x="12" y="71">SWE-bench Pro</text>
<rect class="s5a-a" x="12" y="78" width="177" height="16" rx="2"/>
<text class="s5a-v" x="197" y="91">63.2</text>
<rect class="s5a-b" x="12" y="100" width="164" height="16" rx="2"/>
<text class="s5a-v" x="184" y="113">58.6</text>
<!-- Terminal-Bench 2.1 -->
<text class="s5a-n" x="12" y="147">Terminal-Bench 2.1</text>
<rect class="s5a-a" x="12" y="154" width="225" height="16" rx="2"/>
<text class="s5a-v" x="245" y="167">80.4</text>
<rect class="s5a-b" x="12" y="176" width="234" height="16" rx="2"/>
<text class="s5a-v" x="254" y="189">83.4</text>
<!-- OSWorld-Verified -->
<text class="s5a-n" x="12" y="223">OSWorld-Verified</text>
<rect class="s5a-a" x="12" y="230" width="227" height="16" rx="2"/>
<text class="s5a-v" x="247" y="243">81.2</text>
<rect class="s5a-b" x="12" y="252" width="220" height="16" rx="2"/>
<text class="s5a-v" x="240" y="265">78.7</text>
<text class="s5a-v" x="12" y="296">막대 = 정답률 %, 0부터 같은 축척</text>
</svg>
</div>

:::warning

**Terminal-Bench 값은 하네스를 확인하고 읽으세요**

이 벤치마크는 어떤 에이전트 하네스로 돌렸느냐에 따라 절대값이 크게 달라집니다. 위 표의 Claude 수치는 mini-SWE-agent 하네스를 GKE 클러스터에서 돌린 값이고, GPT-5.5의 83.4%는 Codex CLI 기준으로 공개된 값입니다. Opus 4.8 시스템 카드가 적은 74.6%는 또 다른 하네스(Harbor의 Terminus-2)에서 나온 값이라 위 표에 그대로 얹을 수 없습니다. **하네스를 명시하지 않은 Terminal-Bench 비교는 신뢰하지 않는 편이 낫습니다.**

:::

Opus 4.8과 직접 견주려면 시스템 카드를 하나 더 봐야 합니다. Opus 4.8 시스템 카드는 SWE-bench Pro 69.2, OSWorld-Verified 83.4를 적고 있어, 두 항목 모두 Sonnet 5보다 앞섭니다. 다만 이 값들은 다른 시스템 카드의 다른 실행에서 나온 것이라 같은 표 안의 숫자만큼 엄밀하게 맞붙지는 않습니다.

지식 업무 쪽에서는 순위가 뒤집힙니다. GDPval-AA v2에서 Sonnet 5는 1,618점이고, Opus 5 시스템 카드가 적은 Opus 4.8의 값은 1,593점입니다. 두 값의 출처가 다르고 Elo는 측정 시점에 따라 움직입니다. Sonnet 5의 1,618은 2026년 6월 17일 기준으로 표기돼 있습니다.

독립 평가인 Artificial Analysis Intelligence Index v4.1에서는 Sonnet 5가 53점으로, Sonnet 4.6(47점)보다 6점 올랐습니다. 같은 지표에서 Opus 4.8은 56점, GPT-5.5는 55점, Fable 5는 60점입니다. Opus 4.8과의 격차가 3점이므로 "Near-Opus"라는 포지셔닝이 벤치마크상으로는 과장이 아닌 셈입니다.

## 안전성

함께 공개된 시스템 카드에 따르면 Sonnet 5는 Sonnet 4.6 대비 여러 안전성 지표에서 개선됐습니다. 정량 지표로 공개된 것은 다음과 같습니다.

| 지표 | 측정 표면 | Sonnet 4.6 | Sonnet 5 |
|------|------|:---------:|:-------:|
| 악성 요청 거부율 | Claude Code | 76.6% | **92.4%** |
| 프롬프트 인젝션 성공률 | 코딩, 적응형 공격자 | 12.71% | **0.31%** |
| 프롬프트 인젝션 성공률 | 컴퓨터 사용 | 12.0% | **2.25%** |
| 프롬프트 인젝션 성공률 | 브라우저 사용 | 50.7% | **0.93%** |

인젝션 수치는 모두 안전장치를 끈 상태에서 사고 과정을 켜고 측정한 값입니다. 여기서 중요한 건 **표면마다 값이 크게 다르다**는 점입니다. 하나의 숫자로 "인젝션 방어가 좋아졌다"고 말하기 어렵습니다. 가장 큰 폭으로 개선된 브라우저 사용 쪽은 새 안전장치를 켰을 때 성공한 공격이 한 건도 관측되지 않았습니다. 다만 코딩 항목에는 단서가 하나 붙습니다. 시스템 카드는 Sonnet 4.6이 공격자를 학습시킬 때 쓰인 모델 집합에 포함돼 있어 그 수치가 높게 나올 수밖에 없고 직접 비교 대상이 아니라고 밝히고 있습니다.

거부율이 오른 대가도 함께 기록돼 있습니다. 같은 Claude Code 평가에서 이중 용도 및 무해 요청에 정상 응답한 비율은 Sonnet 4.6의 97.33%에서 91.55%로 내려갔습니다. 악성 요청을 더 잘 막는 대신 정당한 보안 작업까지 거절하는 빈도가 늘었다는 뜻입니다.

환각 쪽도 수치가 나와 있습니다. AA-Omniscience 폐쇄형 평가에서 오답률은 Sonnet 4.6의 35.0%에서 26.5%로 내려갔지만, 답변을 회피한 비율이 26.6%로 비교 대상 중 가장 높고 정답률은 46.9%로 가장 낮습니다. 시스템 카드는 Sonnet 5의 학습 실행 후반부가 비정상으로 표시됐다는 점을 함께 적어 두었습니다.

사이버보안 쪽은 결과가 엇갈립니다. Firefox 147 익스플로잇 개발에서는 완성된 익스플로잇을 하나도 만들어내지 못했고 OSS-Fuzz에서도 0점이었습니다. 반면 취약점 재현 벤치마크(CyberGym)에서는 Sonnet 4.6의 65.2%에서 52.7%로 **오히려 내려갔습니다.** 시스템 카드는 이 결과들의 인과를 명시하지 않으므로, "안전을 위해 의도적으로 깎았다"고 단정하기보다는 능력 프로필이 달라진 것으로 읽는 편이 정확합니다.

:::info

**자체 평가라는 점**

위 수치는 Anthropic의 자체 시스템 카드 기준입니다. 자사 모델의 안전성 평가를 자체 발표하는 것은 업계 표준 관행이지만, 독립적인 3자 평가 결과는 아직 나오지 않은 상태입니다.

:::

## 경쟁 모델 가격 비교

프로모션 가격 기준으로 Sonnet 5는 프런티어 모델 중 저렴한 축에 속합니다.

| 모델 | 입력 (\$/MTok) | 출력 (\$/MTok) | 비고 |
|------|:---:|:---:|------|
| Gemini 3.5 Flash | 1.50 | 9.00 | 경량 티어 |
| **Claude Sonnet 5 (프로모션)** | **2.00** | **10.00** | 8/31까지 |
| Gemini 3.1 Pro | 2.00 | 12.00 | 200K 초과 시 4.00 / 18.00 |
| GPT-5.6 Terra | 2.00 | 12.00 | |
| Claude Sonnet 5 (정규) | 3.00 | 15.00 | 9/1부터 |
| Claude Opus 4.8 | 5.00 | 25.00 | |
| GPT-5.5 | 5.00 | 30.00 | |

프로모션 기간에는 입력 단가가 Gemini 3.1 Pro, GPT-5.6 Terra와 같고 출력 단가만 2달러 저렴합니다. 다만 Gemini 3.1 Pro는 200K 토큰을 넘으면 단가가 \$4/\$18로 올라가므로, 1M 컨텍스트를 실제로 쓰는 작업에서는 비교가 달라집니다.

벤치마크와 가격을 함께 놓으면 위치가 분명해집니다. SWE-bench Pro에서는 Sonnet 5(63.2)가 GPT-5.5(58.6)를 앞서고, Terminal-Bench 2.1에서는 GPT-5.5(83.4)가 Sonnet 5(80.4)를 앞섭니다. 벤치마크마다 순위가 바뀌지만 정규 가격 기준으로도 출력 단가가 GPT-5.5의 절반이므로, 가격 대비 성능에서는 유리한 위치를 잡았습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 310" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Fable 5부터 Gemini 3.1 Pro까지 여섯 모델의 입력 단가 막대와 Intelligence Index 값 비교">
<style>
.s5b-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.s5b-n { fill: var(--text, #1c1917); font-size: 14px; }
.s5b-v { fill: var(--text-muted, #6d6762); font-size: 14px; }
.s5b-a { fill: var(--primary, #0a756c); }
.s5b-b { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="s5b-t" x="12" y="20">입력 단가와 지능 지수</text>
<!-- Fable 5 -->
<text class="s5b-n" x="12" y="50">Claude Fable 5</text>
<text class="s5b-v" x="388" y="50" text-anchor="end">지수 60</text>
<rect class="s5b-b" x="12" y="56" width="220" height="12" rx="2"/>
<text class="s5b-v" x="240" y="66">$10</text>
<!-- Opus 4.8 -->
<text class="s5b-n" x="12" y="92">Claude Opus 4.8</text>
<text class="s5b-v" x="388" y="92" text-anchor="end">지수 56</text>
<rect class="s5b-b" x="12" y="98" width="110" height="12" rx="2"/>
<text class="s5b-v" x="130" y="108">$5</text>
<!-- GPT-5.5 -->
<text class="s5b-n" x="12" y="134">GPT-5.5</text>
<text class="s5b-v" x="388" y="134" text-anchor="end">지수 55</text>
<rect class="s5b-b" x="12" y="140" width="110" height="12" rx="2"/>
<text class="s5b-v" x="130" y="150">$5</text>
<!-- Sonnet 5 정규 -->
<text class="s5b-n" x="12" y="176">Claude Sonnet 5</text>
<text class="s5b-v" x="388" y="176" text-anchor="end">지수 53</text>
<rect class="s5b-a" x="12" y="182" width="66" height="12" rx="2"/>
<text class="s5b-v" x="86" y="192">$3</text>
<!-- Sonnet 5 프로모션 -->
<text class="s5b-n" x="12" y="218">Sonnet 5 프로모션</text>
<text class="s5b-v" x="388" y="218" text-anchor="end">지수 53</text>
<rect class="s5b-a" x="12" y="224" width="44" height="12" rx="2"/>
<text class="s5b-v" x="64" y="234">$2</text>
<!-- Gemini 3.1 Pro -->
<text class="s5b-n" x="12" y="260">Gemini 3.1 Pro</text>
<text class="s5b-v" x="388" y="260" text-anchor="end">지수 46</text>
<rect class="s5b-b" x="12" y="266" width="44" height="12" rx="2"/>
<text class="s5b-v" x="64" y="276">$2</text>
<text class="s5b-v" x="12" y="302">막대 = 입력 100만 토큰당 단가 (같은 축척)</text>
</svg>
</div>

9월 이후 정규 가격(\$3/\$15)이 적용되면 입력 단가는 Gemini 3.1 Pro보다 비싸집니다. 프로모션 종료 후의 가격 경쟁력이 어떻게 될지는 두고 봐야 할 부분입니다.

## 토큰 단가만으로 비용을 판단하기 어려운 이유

Sonnet 5의 정규 토큰 단가는 Sonnet 4.6과 동일합니다(\$3/\$15). 그런데 실제 태스크를 돌려보면 비용 구조가 꽤 다릅니다. Artificial Analysis가 Intelligence Index 태스크 기준으로 측정한 Sonnet 5의 태스크당 평균 비용은 **\$2.29**로, Sonnet 4.6 대비 약 2배, Opus 4.8보다 약 15% 높습니다.

토큰 단가는 같은데 왜 이런 차이가 생길까요? 세 가지 요인이 곱해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 282" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="토크나이저, 출력 토큰, 에이전틱 턴 세 요인이 곱해져 태스크당 비용을 만든다">
<style>
.s5c-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.s5c-l { fill: var(--text, #1c1917); font-size: 14px; }
.s5c-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.s5c-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.s5c-op { fill: var(--text-muted, #6d6762); font-size: 16px; font-weight: 700; }
.s5c-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.s5c-res { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
</style>
<text class="s5c-t" x="200" y="22" text-anchor="middle">같은 단가, 다른 비용</text>
<rect class="s5c-box" x="40" y="36" width="320" height="42" rx="5"/>
<text class="s5c-l" x="54" y="56">토크나이저</text>
<text class="s5c-n" x="54" y="72">같은 텍스트에 최대 1.35배 토큰</text>
<text class="s5c-op" x="200" y="94" text-anchor="middle">×</text>
<rect class="s5c-box" x="40" y="102" width="320" height="42" rx="5"/>
<text class="s5c-l" x="54" y="122">출력 토큰</text>
<text class="s5c-n" x="54" y="138">같은 태스크에 약 40% 증가</text>
<text class="s5c-op" x="200" y="160" text-anchor="middle">×</text>
<rect class="s5c-box" x="40" y="168" width="320" height="42" rx="5"/>
<text class="s5c-l" x="54" y="188">에이전틱 턴</text>
<text class="s5c-n" x="54" y="204">지식 업무 평가에서 약 3배</text>
<text class="s5c-op" x="200" y="226" text-anchor="middle">=</text>
<rect class="s5c-res" x="40" y="234" width="320" height="34" rx="5"/>
<text class="s5c-w" x="200" y="256" text-anchor="middle">태스크당 평균 비용</text>
</svg>
</div>

이 수치는 Artificial Analysis의 특정 벤치마크 방법론에 기반한 것이고 max effort 기준 측정입니다. 낮은 effort 설정이나 일반적인 대화에서는 비용 차이가 줄어들 수 있습니다. 프로모션 가격(\$2/\$10) 적용 기간에는 절대 금액도 달라집니다.

## 마치며

Sonnet 라인이 이전 세대 Opus를 따라잡는 패턴은 이제 우연이 아니라 Anthropic의 명확한 전략입니다. 독립 지표인 Intelligence Index 기준으로 Opus 4.8과의 격차는 3점까지 좁혀졌고, 지식 업무 Elo에서는 오히려 앞섰습니다. 그렇다면 Opus 4.8의 존재 의미가 희미해지는 건 아닌지, 9월 정규 가격 전환 이후에도 이 가격 경쟁력이 유지될 수 있는지가 앞으로의 관전 포인트입니다.

다만 벤치마크 우열과 실사용 비용은 별개입니다. 토큰 단가가 같아도 태스크당 비용이 두 배로 오른다면 "싼 모델"이라는 판단은 자기 워크로드에서 직접 재 본 뒤에 내려야 합니다. 프로모션 기간(8월 31일까지)은 그 측정을 싸게 해 볼 수 있는 시기입니다.

## 함께 보면 좋은 글

- [Claude Fable 5](/issue/fable-5/) : 같은 지표에서 60점을 기록한 상위 티어 모델
- [Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?](/issue/opus-4-7/) : 아첨과 토크나이저 논란의 앞 이야기
- [GPT-5.1 주요 변경사항](/issue/gpt-5-1/) : 경쟁 모델 쪽의 API 변화

## 참고자료

- [Introducing Claude Sonnet 5 - Anthropic](https://www.anthropic.com/news/claude-sonnet-5)
- [Claude Sonnet 5 System Card - Anthropic](https://www.anthropic.com/claude-sonnet-5-system-card)
- [Models overview - Claude Docs](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Intelligence Index v4.1 - Artificial Analysis](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1)
- [Claude Sonnet 5 agentic cost - Artificial Analysis](https://artificialanalysis.ai/articles/claude-sonnet-5-agentic-cost)
- [Introducing Claude Sonnet 5 on AWS - Amazon](https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/)
