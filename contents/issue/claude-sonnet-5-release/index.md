---
date: '2026-07-01'
title: 'Claude Sonnet 5 출시, Opus급 성능?'
category: 'Issue'
tags: ['Claude', 'Sonnet 5', 'Anthropic', 'LLM', 'AI Model']
summary: '2026년 6월 30일 출시된 Claude Sonnet 5의 벤치마크, 가격, 경쟁 모델 비교, 안전성 개선까지 핵심 변경사항을 정리합니다.'
thumbnail: './thumbnail.png'
---
2026년 6월 30일, Anthropic이 Claude Sonnet 5를 출시했습니다. 7월 1일부터 무료 플랜과 Pro 구독의 기본 모델로 교체되며, API에서도 즉시 사용 가능합니다.

공식 발표에서 강조한 메시지는 명확합니다. **Opus 4.8에 근접하는 성능을 Sonnet 가격대에 제공한다**는 것. 사실 이 패턴은 처음이 아닙니다. 2024년에 Sonnet 3.5가 당시 최상위 모델이었던 Opus 3을 뛰어넘었고, Sonnet 4.6도 출시 시점에 Opus 4.6 수준의 벤치마크를 보여줬습니다. Sonnet 라인이 이전 세대 Opus를 따라잡는 구도가 하나의 패턴이 된 셈입니다.

이 글에서는 Sonnet 5의 스펙, 벤치마크, 가격, 안전성 개선, 경쟁 모델 비교까지 출시 시점에서 알아야 할 내용을 정리합니다.

---

## 핵심 스펙

| 항목 | 값 |
|------|-----|
| 모델 ID | `claude-sonnet-5` |
| 컨텍스트 윈도우 | 1M 토큰 |
| 최대 출력 | 128K 토큰 |
| 토크나이저 | 신규 (기존 대비 약 1.0\~1.35배 토큰 생성) |
| 프로모션 가격 | 입력 \$2/MTok, 출력 \$10/MTok (8월 31일까지) |
| 정규 가격 | 입력 \$3/MTok, 출력 \$15/MTok |
| 기본 모델 전환 | 2026년 7월 1일 (무료/Pro 플랜) |
| Adaptive Thinking | 기본 활성화 (비활성화 가능) |
| 가용성 | Claude API, Amazon Bedrock, Vertex AI |

Anthropic은 Sonnet 5를 "가장 에이전틱한 Sonnet 모델"이라고 소개했습니다. 계획 수립, 브라우저/터미널 같은 도구 사용, 자율적 실행까지 에이전틱 워크플로우에 최적화했다는 것이 공식 포지셔닝입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 토크나이저 변경 참고</strong><br>
  Sonnet 5는 새로운 토크나이저를 사용합니다. 동일한 텍스트를 처리할 때 이전 모델 대비 최대 35% 더 많은 토큰이 생성될 수 있어, 토큰 단가가 같더라도 실제 비용은 달라질 수 있습니다. 이 부분은 뒤에서 자세히 다룹니다.
</div>

---

## 벤치마크: Sonnet 4.6과 Opus 4.8 사이

Sonnet 5의 벤치마크 성능은 Sonnet 4.6보다 확실히 올랐고, Opus 4.8에는 미치지 못하지만 상당히 가까워졌습니다.

| 벤치마크 | Sonnet 4.6 | **Sonnet 5** | Opus 4.8 |
|---------|:---------:|:----------:|:-------:|
| SWE-bench Pro (에이전틱 코딩) | 58.1% | **63.2%** | 69.2% |
| Terminal-Bench 2.1 | 67.0% | **80.4%** | 미공개 |
| OSWorld-Verified (컴퓨터 사용) | 미공개 | **81.2%** | 미공개 |
| AI Intelligence Index v4.1 | 47 | **53** | 56 |
| GDPval-AA v2 (지식 업무) | 미공개 | **1,618** | 1,615 |

에이전틱 코딩 벤치마크인 SWE-bench Pro에서 5포인트 상승(58.1% → 63.2%)은 유의미한 차이입니다. Terminal-Bench 2.1에서는 67.0%에서 80.4%로 13포인트 이상 올라, 터미널 기반 작업에서의 개선이 두드러집니다.

흥미로운 건 GDPval-AA v2 결과입니다. 지식 업무(문서 작성, 분석, 요약 등)를 측정하는 이 벤치마크에서 Sonnet 5(1,618)가 Opus 4.8(1,615)을 근소하게 앞섰습니다. 코딩 벤치마크에서는 Opus 4.8이 여전히 우위이지만, 지식 업무에서는 Sonnet 가격으로 Opus급 결과를 기대할 수 있다는 의미입니다.

Artificial Analysis의 Intelligence Index에서는 53점으로, Sonnet 4.6(47)보다 6점 올랐습니다. Opus 4.8(56)과의 격차가 3점으로 좁혀졌고, "Near-Opus"라는 포지셔닝이 벤치마크상으로는 과장이 아닌 셈입니다. 참고로 [Fable 5](/issue/fable-5/)는 같은 지표에서 60점을 기록한 바 있습니다.

---

## 안전성: 전 세대 대비 눈에 띄는 개선

함께 공개된 시스템 카드에 따르면, Sonnet 5는 Sonnet 4.6 대비 여러 안전성 지표에서 개선됐습니다.

| 지표 | Sonnet 4.6 | Sonnet 5 | 변화 |
|------|:---------:|:-------:|:----:|
| 환각률(Hallucination Rate) | 35.0% | **26.5%** | ▼ 8.5%p |
| 아첨률(Sycophancy) | 13.3% | **3.1%** | ▼ 10.2%p |
| 악성 요청 거부율 | 76.6% | **92.4%** | ▲ 15.8%p |
| 프롬프트 인젝션 공격 성공률 | 12.71% | **0.31%** | ▼ 12.4%p |

아첨률 3.1%는 Claude 전체 모델 라인업에서 가장 낮은 수치입니다. [Opus 4.7](/issue/opus-4-7/)이 출시 직후 "너무 동의만 한다"는 불만을 받았던 걸 생각하면, Anthropic이 이 문제를 의식적으로 개선한 것으로 보입니다.

프롬프트 인젝션 방어도 12.71%에서 0.31%로 대폭 강화됐습니다. 에이전틱 워크플로우에서 모델이 외부 데이터를 처리할 일이 많아지는 만큼, 이 지표의 개선은 실용적으로도 중요합니다.

한편 위험한 사이버보안 작업(예: Firefox 익스플로잇 개발)에서는 성공률이 0.0%로, Opus 4.8보다 의도적으로 제한된 수준입니다. "에이전틱하되 위험하지 않게"라는 설계 방향이 드러나는 부분입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  위 수치는 Anthropic의 자체 시스템 카드 기준입니다. 자사 모델의 안전성 평가를 자체 발표하는 것은 업계 표준 관행이지만, 독립적인 3자 평가 결과는 아직 나오지 않은 상태입니다.
</div>

---

## 경쟁 모델 가격 비교

프로모션 가격 기준으로 Sonnet 5는 프런티어 모델 중 저렴한 축에 속합니다.

| 모델 | 입력 (\$/MTok) | 출력 (\$/MTok) | 비고 |
|------|:---:|:---:|------|
| Gemini 3.5 Flash | 1.50 | 9.00 | |
| **Claude Sonnet 5 (프로모션)** | **2.00** | **10.00** | 8/31까지 |
| Gemini 3.1 Pro | 2.00 | 12.00 | |
| GPT-5.6 Terra | 2.50 | 15.00 | |
| Claude Sonnet 5 (정규) | 3.00 | 15.00 | 9/1부터 |
| Claude Opus 4.8 | 5.00 | 25.00 | |
| GPT-5.5 | 5.00 | 30.00 | |

프로모션 기간 중에는 GPT-5.6 Terra(\$2.50/\$15)보다 저렴하고, Gemini 3.1 Pro(\$2/\$12)와도 비슷한 수준입니다. Gemini 3.5 Flash(\$1.50/\$9)만 더 저렴한데, Flash는 Sonnet과 다른 티어의 경량 모델입니다.

코딩 벤치마크를 함께 놓고 보면, SWE-bench Pro에서 Sonnet 5(63.2%)가 GPT-5.5(58.6%)를 앞서면서 가격은 절반 이하입니다. 가격 대비 성능에서 상당히 유리한 위치를 잡은 셈입니다. [GPT-5.1 출시](/issue/gpt-5-1/) 이후 OpenAI 쪽도 빠르게 모델을 갱신해온 만큼, 이 경쟁 구도가 어떻게 전개될지 지켜볼 만합니다.

9월 이후 정규 가격(\$3/\$15)이 적용되면 Gemini 3.1 Pro보다 비싸집니다. 프로모션 종료 후의 가격 경쟁력이 어떻게 될지는 두고 봐야 할 부분입니다.

---

## 토큰 단가만으로 비용을 판단하기 어려운 이유

Sonnet 5의 정규 토큰 단가는 Sonnet 4.6과 동일합니다(\$3/\$15). 그런데 Artificial Analysis와 The Decoder의 분석에 따르면, 실제 태스크 수행 시 비용 구조는 꽤 다릅니다.

Artificial Analysis의 Intelligence Index 기준으로, 태스크당 평균 비용은 다음과 같습니다.

| 모델 | 태스크당 평균 비용 |
|------|:---:|
| Sonnet 4.6 | ~\$1.20 |
| Opus 4.8 | ~\$1.97 |
| **Sonnet 5** | **~\$2.29** |

토큰 단가는 같은데 왜 이런 차이가 생기는 걸까요? 세 가지 요인이 겹칩니다.

- **새 토크나이저**: 같은 텍스트를 처리할 때 약 30% 더 많은 토큰을 소비
- **출력 토큰 증가**: 동일 태스크에서 약 40% 더 많은 출력 토큰을 생성
- **에이전틱 턴 증가**: 에이전틱 작업 시 약 3배 더 많은 턴을 사용

다만 이 수치는 Artificial Analysis의 특정 벤치마크 방법론에 기반한 것이고, high/max effort 수준에서의 측정입니다. 일반적인 대화나 낮은 effort 설정에서는 비용 차이가 줄어들 수 있습니다. 프로모션 가격(\$2/\$10) 적용 기간에는 절대 금액도 달라집니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실사용 팁</strong><br>
  API 사용 시 토큰 단가뿐 아니라 태스크 완료에 소요되는 총 토큰량을 함께 모니터링하는 것이 좋습니다. 특히 에이전틱 워크플로우에서는 모델별 턴 수 차이가 비용에 큰 영향을 줍니다.
</div>

---

## 마치며

Sonnet 라인이 이전 세대 Opus를 따라잡는 패턴은 이제 우연이 아니라 Anthropic의 명확한 전략입니다. 프로모션 기간(8월 31일까지)에 직접 써보면서 자신의 워크플로우에서 Sonnet 4.6이나 Opus 4.8 대비 체감 차이를 확인해보기 좋은 시기입니다.

## 참고자료

- [Introducing Claude Sonnet 5 - Anthropic](https://www.anthropic.com/news/claude-sonnet-5)
- [Claude Sonnet 5 System Card - Anthropic](https://www.anthropic.com/claude-sonnet-5-system-card)
- [Introducing Claude Sonnet 5 on AWS - Amazon](https://aws.amazon.com/blogs/machine-learning/introducing-claude-sonnet-5-on-aws-anthropics-most-capable-sonnet-model/)
- [Claude Sonnet 5 vs GPT-5.6 - DataCamp](https://www.datacamp.com/blog/claude-sonnet-5-vs-gpt-5-6)
- [Claude Sonnet 5 cost analysis - The Decoder](https://the-decoder.com/claude-sonnet-5-continues-anthropics-pattern-of-hiding-price-increases-behind-unchanged-token-rates/)
