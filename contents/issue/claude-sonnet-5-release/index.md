---
date: '2026-07-01'
title: 'Claude Sonnet 5 출시, Opus급 성능?'
category: 'Issue'
tags: ['Claude', 'Sonnet 5', 'Anthropic', 'LLM', 'AI Model']
summary: '2026년 6월 30일 출시된 Claude Sonnet 5의 벤치마크, 가격, 경쟁 모델 비교, 안전성 개선까지 핵심 변경사항을 정리합니다.'
thumbnail: './thumbnail.png'
---

2026년 6월 30일, Anthropic이 Claude Sonnet 5를 출시했습니다. 출시와 함께 전 플랜에서 사용할 수 있고, API에서도 바로 쓸 수 있는 상태입니다.

공식 발표가 강조한 메시지는 하나입니다. **Opus 4.8에 근접하는 성능을 Sonnet 가격대에 제공한다**는 것. 사실 이 패턴은 처음이 아닙니다. 2024년에 Sonnet 3.5가 당시 최상위 모델이었던 Opus 3을 뛰어넘은 전례가 있고, Sonnet 라인이 이전 세대 Opus를 따라잡는 구도는 이제 하나의 패턴이 된 셈입니다.

이 글에서는 Sonnet 5의 스펙, 벤치마크, 가격, 안전성 개선, 경쟁 모델 비교까지 출시 시점에서 알아야 할 내용을 정리합니다.

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
| 가용성 | Claude 전 플랜, Claude Code, Claude Platform, Amazon Bedrock, Vertex AI |

Anthropic은 Sonnet 5를 "가장 에이전틱한 Sonnet 모델"이라고 소개했습니다. 계획 수립, 브라우저와 터미널 같은 도구 사용, 자율적 실행까지 에이전틱 워크플로우에 최적화했다는 것이 공식 포지셔닝입니다.

:::info

**토크나이저가 바뀌었습니다**

Sonnet 5는 새로운 토크나이저를 사용합니다. 공식 표현으로는 같은 텍스트가 콘텐츠 유형에 따라 **약 1.0배에서 1.35배**의 토큰으로 매핑됩니다. 토큰 단가가 같더라도 실제 비용은 달라진다는 뜻입니다. 이 부분은 뒤에서 자세히 다룹니다.

:::

## 벤치마크: Sonnet 4.6과 Opus 4.8 사이

| 벤치마크 | Sonnet 4.6 | **Sonnet 5** | Opus 4.8 |
|---------|:---------:|:----------:|:-------:|
| SWE-bench Pro (에이전틱 코딩) | 58.1% | **63.2%** | 69.2% |
| Terminal-Bench 2.1 | 67.0% | **80.4%** | 74.6% |
| OSWorld-Verified (컴퓨터 사용) | 78.5% | **81.2%** | 83.4% |
| AI Intelligence Index v4.1 | 47 | **53** | 56 |
| GDPval-AA v2 (지식 업무, Elo) | 1,395 | **1,618** | 1,615 |

숫자를 놓고 보면 "코딩은 Opus, 지식 업무는 Sonnet"이라는 단순한 구도가 아닙니다. 저장소 단위 코딩(SWE-bench Pro)에서는 Opus 4.8이 6포인트 앞서지만, 지식 업무(GDPval-AA v2)에서는 Sonnet 5가 근소하게 위입니다. 작업의 성격에 따라 순위가 갈리는 셈입니다.

:::warning

**Terminal-Bench 값은 하네스를 확인하고 읽으세요**

이 벤치마크는 어떤 에이전트 하네스로 돌렸느냐에 따라 절대값이 크게 달라집니다. 위 표의 Sonnet 5와 Opus 4.8 수치는 Codex CLI 기준으로 정리된 값인데, 같은 Opus 4.8을 mini-SWE-agent 하네스로 측정한 자료에서는 82.7%로 보고됩니다. 8포인트 차이라 어느 쪽을 쓰느냐에 따라 Sonnet 5와의 우열이 뒤집힙니다. **하네스를 명시하지 않은 Terminal-Bench 비교는 신뢰하지 않는 편이 낫습니다.**

:::

Artificial Analysis의 Intelligence Index v4.1에서는 53점으로, Sonnet 4.6(47)보다 6점 올랐습니다. Opus 4.8(56)과의 격차가 3점으로 좁혀졌고, "Near-Opus"라는 포지셔닝이 벤치마크상으로는 과장이 아닌 셈입니다. 참고로 Fable 5는 같은 지표에서 60점(v4.1 기준, 출시 직후 측정에서는 64.9점)을 기록한 바 있습니다.

## 안전성: 전 세대 대비 개선

함께 공개된 시스템 카드에 따르면, Sonnet 5는 Sonnet 4.6 대비 여러 안전성 지표에서 개선됐습니다. 환각과 아첨도 줄었다고 밝혔지만 이 둘은 방향만 서술되고 수치는 공개되지 않았습니다. 정량 지표로 공개된 것은 다음과 같습니다.

| 지표 | 측정 표면 | Sonnet 4.6 | Sonnet 5 |
|------|------|:---------:|:-------:|
| 악성 요청 거부율 | Claude Code | 76.6% | **92.4%** |
| 프롬프트 인젝션 성공률 | 코딩, adaptive attacker | 12.7% | **0.31%** |
| 프롬프트 인젝션 성공률 | 컴퓨터 사용 | 12.0% | **2.25%** |
| 프롬프트 인젝션 성공률 | 브라우저 사용 | 약 50% | **1% 미만** |

여기서 중요한 건 **표면마다 값이 크게 다르다**는 점입니다. 하나의 숫자로 "인젝션 방어가 좋아졌다"고 말하기 어렵습니다. 가장 극적인 개선은 브라우저 사용 쪽으로, 새 안전장치를 켜면 사실상 0%까지 내려간다고 밝혔습니다. 에이전틱 워크플로우에서 모델이 외부 데이터를 처리할 일이 많아지는 만큼, 이 지표의 개선은 실용적으로도 중요합니다.

사이버보안 쪽은 결과가 엇갈립니다. Firefox 147 익스플로잇 개발에서는 완성된 익스플로잇을 하나도 만들어내지 못했고 OSS-Fuzz에서도 0점이었습니다. 반면 취약점 재현 벤치마크(CyberGym)에서는 Sonnet 4.6의 65%에서 53%로 **오히려 내려갔습니다.** 시스템 카드는 이 결과들의 인과를 명시하지 않으므로, "안전을 위해 의도적으로 깎았다"고 단정하기보다는 능력 프로필이 달라진 것으로 읽는 편이 정확합니다.

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
| GPT-5.6 Terra | 2.50 | 15.00 | |
| Claude Sonnet 5 (정규) | 3.00 | 15.00 | 9/1부터 |
| Claude Opus 4.8 | 5.00 | 25.00 | |
| GPT-5.5 | 5.00 | 30.00 | |

프로모션 기간 중에는 GPT-5.6 Terra(\$2.50/\$15)보다 저렴하고, Gemini 3.1 Pro(\$2/\$12)와도 비슷한 수준입니다. 다만 Gemini 3.1 Pro는 200K 토큰을 넘으면 단가가 \$4/\$18로 올라가므로, 1M 컨텍스트를 실제로 쓰는 작업에서는 비교가 달라집니다.

벤치마크와 가격을 함께 놓고 보면 승부가 갈립니다. SWE-bench Pro에서는 Sonnet 5(63.2%)가 GPT-5.5(58.6%)를 앞서고, Terminal-Bench 2.1에서는 GPT-5.5(83.4%)가 Sonnet 5(80.4%)를 앞섭니다. 벤치마크마다 순위가 바뀌지만 가격은 절반 이하이므로, 가격 대비 성능에서는 유리한 위치를 잡았습니다.

9월 이후 정규 가격(\$3/\$15)이 적용되면 Gemini 3.1 Pro보다 비싸집니다. 프로모션 종료 후의 가격 경쟁력이 어떻게 될지는 두고 봐야 할 부분입니다.

## 토큰 단가만으로 비용을 판단하기 어려운 이유

Sonnet 5의 정규 토큰 단가는 Sonnet 4.6과 동일합니다(\$3/\$15). 그런데 실제 태스크를 돌려보면 비용 구조가 꽤 다릅니다. Artificial Analysis가 Intelligence Index 태스크 기준으로 측정한 Sonnet 5의 태스크당 평균 비용은 **\$2.29**로, Sonnet 4.6 대비 약 2배, Opus 4.8보다 약 15% 높습니다.

토큰 단가는 같은데 왜 이런 차이가 생길까요? 세 가지 요인이 곱해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 282" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="토크나이저, 출력 토큰, 에이전틱 턴 세 요인이 곱해져 태스크당 비용을 만든다">
<style>
.cs-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.cs-l { fill: var(--text, #1c1917); font-size: 14px; }
.cs-w { fill: #ffffff; font-size: 14px; }
.cs-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.cs-op { fill: var(--text-muted, #78716c); font-size: 16px; font-weight: 700; }
.cs-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.cs-res { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
</style>
<text class="cs-t" x="200" y="22" text-anchor="middle">같은 단가, 다른 비용</text>
<rect class="cs-box" x="40" y="36" width="320" height="42" rx="5"/>
<text class="cs-l" x="54" y="56">토크나이저</text>
<text class="cs-n" x="54" y="72">같은 텍스트에 최대 1.35배 토큰</text>
<text class="cs-op" x="200" y="94" text-anchor="middle">×</text>
<rect class="cs-box" x="40" y="102" width="320" height="42" rx="5"/>
<text class="cs-l" x="54" y="122">출력 토큰</text>
<text class="cs-n" x="54" y="138">같은 태스크에 약 40% 증가</text>
<text class="cs-op" x="200" y="160" text-anchor="middle">×</text>
<rect class="cs-box" x="40" y="168" width="320" height="42" rx="5"/>
<text class="cs-l" x="54" y="188">에이전틱 턴</text>
<text class="cs-n" x="54" y="204">지식 업무 평가에서 약 3배</text>
<text class="cs-op" x="200" y="226" text-anchor="middle">=</text>
<rect class="cs-res" x="40" y="234" width="320" height="34" rx="5"/>
<text class="cs-w" x="200" y="256" text-anchor="middle">태스크당 평균 비용</text>
</svg>
</div>

다만 이 수치는 Artificial Analysis의 특정 벤치마크 방법론에 기반한 것이고, high/max effort 수준에서의 측정입니다. 일반적인 대화나 낮은 effort 설정에서는 비용 차이가 줄어들 수 있습니다. 프로모션 가격(\$2/\$10) 적용 기간에는 절대 금액도 달라집니다.

:::tip

**실사용 팁**

API 사용 시 토큰 단가뿐 아니라 태스크 완료에 소요되는 총 토큰량을 함께 모니터링하는 것이 좋습니다. 특히 에이전틱 워크플로우에서는 모델별 턴 수 차이가 비용에 큰 영향을 줍니다.

:::

## 마치며

Sonnet 라인이 이전 세대 Opus를 따라잡는 패턴은 이제 우연이 아니라 Anthropic의 명확한 전략입니다. 벤치마크상으로 Opus 4.8과의 격차는 SWE-bench Pro 기준 6포인트, Intelligence Index 기준 3점까지 좁혀졌고, 지식 업무에서는 오히려 앞섰습니다. 그렇다면 Opus 4.8의 존재 의미가 희미해지는 건 아닌지, 9월 정규 가격 전환 이후에도 이 가격 경쟁력이 유지될 수 있는지가 앞으로의 관전 포인트입니다.

프로모션 기간(8월 31일까지)에 직접 써보면서 자신의 워크플로우에서 체감 차이를 확인해보기 좋은 시기입니다.

## 함께 보면 좋은 글

- [Claude Fable 5](/issue/fable-5/) : 같은 지표에서 60점을 기록한 상위 티어 모델
- [Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?](/issue/opus-4-7/) : 아첨과 토크나이저 논란의 앞 이야기
- [GPT-5.1 주요 변경사항](/issue/gpt-5-1/) : 경쟁 모델 쪽의 API 변화

## 참고자료

- [Introducing Claude Sonnet 5 - Anthropic](https://www.anthropic.com/news/claude-sonnet-5)
- [Claude Sonnet 5 System Card - Anthropic](https://www.anthropic.com/claude-sonnet-5-system-card)
- [Introducing Claude Sonnet 5 on AWS - Amazon](https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/)
- [Claude Sonnet 5 agentic cost - Artificial Analysis](https://artificialanalysis.ai/articles/claude-sonnet-5-agentic-cost)
- [Claude Sonnet 5 cost analysis - The Decoder](https://the-decoder.com/claude-sonnet-5-continues-anthropics-pattern-of-hiding-price-increases-behind-unchanged-token-rates/)
