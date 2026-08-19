---
date: '2026-08-20'
title: 'Qwen3.8-27B 출시, 로컬 모델이 프론티어급 점수?'
category: 'Issue'
tags: ['Qwen', 'Qwen3.8', 'Alibaba', 'LLM', 'Artificial Analysis', 'Open Weights']
summary: '24GB GPU에 들어가는 27B가 Artificial Analysis 52점으로 GPT-5.6 Luna와 동점을 기록했습니다. 점수를 만든 토큰 소비와 양자화 격차, 좁은 전문화까지 확인된 사실로 정리합니다.'
thumbnail: './thumbnail.png'
---

2026년 8월 14일, Alibaba Qwen 팀이 **Qwen3.8-27B**를 Apache 2.0 라이선스로 공개했습니다. 27B짜리 dense 모델인데 이미지와 비디오까지 읽는 네이티브 멀티모달입니다. 4비트 양자화 파일이 17GB라 24GB GPU 한 장에 들어갑니다. 공개 사흘 만에 Hugging Face 다운로드 300만 회를 넘겼습니다.

다시 사흘 뒤인 8월 17일, 독립 평가 기관 Artificial Analysis(이하 AA)가 이 모델의 인텔리전스 인덱스(Intelligence Index)를 공개하면서 분위기가 달라졌습니다. **52점.** OpenAI의 GPT-5.6 Luna(max)와 같은 점수이고 753B짜리 GLM-5.2와 1.7T짜리 DeepSeek V4 Pro보다 딱 1점 낮습니다. r/LocalLLaMA와 Hacker News는 이 숫자 하나로 며칠째 들끓는 중입니다. 코딩 에이전트 Cline 공식 계정은 이렇게 썼습니다.

> "This is the first time a local model has scored frontier model capability. We weren't expecting this pace of local progress anywhere near this soon." (Cline)

그런데 점수를 뜯어보면 단서가 여럿 붙습니다. 52점이 어떻게 만들어진 숫자인지 확인된 사실로 정리해 봤습니다.

## 핵심 스펙

| 항목 | 값 |
|------|-----|
| 구조 | dense 27B (하이브리드 어텐션) |
| 입력 | 텍스트 + 이미지 + 비디오 |
| 컨텍스트 | 262,144 토큰 (YaRN 확장 시 1M) |
| 추론 제어 | `reasoning_effort`: low / medium / xhigh (기본값 xhigh) |
| 라이선스 | Apache 2.0 |
| 파일 크기 | BF16 약 56GB · FP8 약 28GB · Q4_K_M 약 17GB |
| 디코딩 | Multi-Token Prediction 내장 (self-speculative decoding) |

이 크기에서 비전 입력이 기본으로 들어간 것이 먼저 눈에 띕니다. 스크린샷을 읽고 bounding box를 찍는 UI 조작류 작업까지 한 모델로 처리합니다. 추론은 기본으로 켜져 있고 요청 단위로 끌 수 있습니다. 기본 강도가 `xhigh`라는 게 뒤에서 이야기할 논란의 씨앗이 됩니다.

## 52점이 어디에 놓이는 숫자인가

:::note

**AA 인텔리전스 인덱스**

Artificial Analysis가 직접 돌리는 9개 평가(GDPval-AA, Terminal-Bench 2.1, GPQA Diamond, HLE, SciCode, CritPt, τ³-Banking, AA-Omniscience, AA-LCR)를 합산한 지수입니다. 벤더가 제출한 점수 대신 AA가 자체 harness로 측정한 값이라 공식 모델 카드의 숫자와 다를 수 있습니다.

:::

8월 기준 이 지수의 최상위권은 Claude Opus 5(63), Claude Fable 5(62), GPT-5.6 Sol(61), Kimi K3(60)입니다. 그 아래로 Qwen3.8의 플래그십인 2.4T 모델이 58점, Claude Opus 4.8이 57점, GPT-5.6 Terra가 57점 부근에 있고 GLM-5.2와 DeepSeek V4 Pro가 53점입니다.

Qwen3.8-27B의 52점을 이 줄에 세우면 이런 그림이 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 348" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="AA 인텔리전스 인덱스가 비슷한 다섯 모델의 총 파라미터를 막대로 비교. 2.4T와 1.7T, 753B 막대 사이에서 27B는 눈에 겨우 보이는 가는 선으로 그려진 모습">
<style>
.q38a-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.q38a-l { fill: var(--text, #1c1917); font-size: 14px; }
.q38a-hl { fill: var(--primary, #0a756c); font-size: 14px; font-weight: 700; }
.q38a-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.q38a-bar { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.q38a-me { fill: var(--primary, #0a756c); }
.q38a-dash { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 5 4; }
</style>
<text class="q38a-t" x="200" y="22" text-anchor="middle">비슷한 지능 지수, 전혀 다른 크기</text>
<!-- Qwen3.8-2.4T -->
<text class="q38a-l" x="16" y="56">Qwen3.8-2.4T (MoE) · 58점</text>
<rect class="q38a-bar" x="16" y="64" width="344" height="16" rx="2"/>
<!-- DeepSeek V4 Pro -->
<text class="q38a-l" x="16" y="112">DeepSeek V4 Pro 1.7T (MoE) · 53점</text>
<rect class="q38a-bar" x="16" y="120" width="244" height="16" rx="2"/>
<!-- GLM-5.2 -->
<text class="q38a-l" x="16" y="168">GLM-5.2 753B (MoE) · 53점</text>
<rect class="q38a-bar" x="16" y="176" width="108" height="16" rx="2"/>
<!-- Qwen3.8-27B -->
<text class="q38a-hl" x="16" y="224">Qwen3.8-27B (dense) · 52점</text>
<rect class="q38a-me" x="16" y="232" width="4" height="16"/>
<text class="q38a-n" x="28" y="245">27B</text>
<!-- Luna -->
<text class="q38a-l" x="16" y="280">GPT-5.6 Luna (max) · 52점</text>
<rect class="q38a-dash" x="16" y="288" width="108" height="16" rx="2"/>
<text class="q38a-n" x="132" y="301">크기 비공개</text>
<text class="q38a-n" x="200" y="338" text-anchor="middle">막대 길이 = 총 파라미터 (MoE는 총량 기준)</text>
</svg>
</div>

MoE 모델은 추론 시 일부 전문가만 활성화되니 총 파라미터가 곧 추론 비용은 아닙니다. 그래도 27B dense가 이 줄에 서 있는 것만으로 전례가 없습니다. AA의 파라미터 대비 지능 파레토 프런티어(Pareto frontier)에서도 이 모델이 새 경계선을 그었습니다. 284B MoE인 DeepSeek V4 Flash와 같은 점수라는 것만 해도 몇 달 전에는 농담으로나 하던 이야기입니다.

더 도발적인 결과는 에이전틱 인덱스(Agentic Index) 쪽입니다. GDPval-AA와 τ³-Banking 두 평가의 가중 평균인 이 지수에서 27B는 50.9점, 전체 7위를 기록했습니다. Claude Opus 4.8(max), GPT-5.6 Terra(max), DeepSeek V4 Pro가 모두 이 모델 아래에 있고 위에 남은 건 Claude Opus 5, Grok 4.6, Qwen3.8 Max, GPT-5.6 Sol, Claude Fable 5, Kimi K3까지 여섯뿐입니다. 물론 평가 두 개짜리 지수라 표본이 좁다는 건 감안하고 읽어야 합니다.

## 아키텍처는 한 글자도 안 바뀌었다

출시 당일 r/LocalLLaMA에서 흥미로운 사실이 확인됐습니다. 모델 config 파일을 전 세대와 비교해 보니 **Qwen3.6-27B, 그 앞의 Qwen3.5-27B와 완전히 동일**했습니다. 레이어 64개 중 48개가 선형 어텐션 계열인 Gated DeltaNet이고 16개만 풀 어텐션인 하이브리드 구조, 히든 차원, 헤드 수까지 전부 그대로입니다.

이 구조는 로컬 실행에 유리한 부수 효과가 있습니다. KV 캐시를 유지해야 하는 레이어가 4개 중 1개뿐이라 24GB급 카드에서도 131K~262K 컨텍스트를 현실적으로 잡을 수 있습니다. 하지만 이건 두 세대 전부터 있던 특성입니다.

결국 석 달 사이의 도약은 전부 훈련에서 왔습니다. 커뮤니티는 RL 환경 확충과 on-policy distillation을 유력한 후보로 꼽지만 Qwen 팀이 아직 기술 리포트를 내지 않아 추정의 영역입니다. 공식 모델 카드의 전 세대 대비 수치는 이렇습니다.

| 벤치마크 | Qwen3.6-27B | Qwen3.8-27B |
|---|---|---|
| SWE-bench Pro | 53.5 | 61.7 |
| Terminal-Bench 2.1 | 63.4 | 73.0 |
| LiveCodeBench v6 | 83.9 | 90.3 |
| OSWorld-Verified | 63.9 | 84.3 |
| DeepSWE 1.1 | 13.3 | 42.2 |
| GPQA Diamond | 87.8 | 89.2 |
| HLE | 24.0 | 30.8 |

에이전틱 계열의 상승 폭이 특히 큽니다. OSWorld가 20포인트, DeepSWE는 세 배가 넘게 올랐습니다. SWE-bench Pro 61.7은 Claude Code harness로 측정했다고 모델 카드에 명시돼 있습니다. 벤더 측정 기준이긴 해도 오픈웨이트 모델이 이 벤치마크에서 60을 넘긴 것은 처음입니다.

## 점수의 일부는 토큰으로 샀다

AA가 점수와 함께 공개한 수치 중 커뮤니티가 가장 크게 문제 삼은 것이 토큰 소비량입니다. 27B는 인텔리전스 인덱스를 완주하는 데 출력 토큰 1억 6,000만 개를 썼습니다. 비슷한 체급 오픈 모델의 중앙값은 4,300만 개입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 192" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="AA 인덱스 완주에 쓴 출력 토큰을 비교한 막대. Qwen3.8-27B가 1억 6,000만 개로 동급 오픈 모델 중앙값 4,300만 개의 약 4배에 이르는 모습">
<style>
.q38b-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.q38b-l { fill: var(--text, #1c1917); font-size: 14px; }
.q38b-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.q38b-hi { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.q38b-md { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="q38b-t" x="200" y="22" text-anchor="middle">AA 인덱스 완주에 쓴 출력 토큰</text>
<!-- Qwen3.8-27B -->
<text class="q38b-l" x="16" y="58">Qwen3.8-27B · 1억 6,000만 개</text>
<rect class="q38b-hi" x="16" y="66" width="344" height="16" rx="2"/>
<!-- median -->
<text class="q38b-l" x="16" y="116">동급 오픈 모델 중앙값 · 4,300만 개</text>
<rect class="q38b-md" x="16" y="124" width="92" height="16" rx="2"/>
<text class="q38b-n" x="200" y="180" text-anchor="middle">막대 길이는 토큰 수에 정비례</text>
</svg>
</div>

원인은 기본값입니다. 이 모델은 `reasoning_effort`가 `xhigh`로 출고됩니다. Simon Willison이 M5 Max에서 돌린 리뷰 제목이 상황을 그대로 요약합니다.

> "Qwen 3.8 27B is excellent, but it defaults to wildly overthinking things." (Simon Willison)

그의 정례 테스트인 펠리컨 SVG 그리기에서 기본 설정은 추론 토큰 22,276개를 쓰며 21분이 걸렸고 추론을 끄자 137초에 끝났습니다. 그래서 출시 직후 커뮤니티의 첫 집단행동이 추론 강도 낮추기였습니다. 챗 템플릿 기본값을 `medium`으로 바꾸자는 패치가 올라왔고 temperature를 공식 권장값 1.0에서 0.7로 내리면 사고 길이가 크게 줄어든다는 보고도 이어졌습니다. API 요금에도 같은 문제가 비칩니다. 27B의 API 단가는 입력 \$0.45, 출력 \$3.20으로 동급 크기 중앙값의 몇 배입니다. 출력 토큰을 많이 쓰는 모델이라 태스크당 비용은 격차가 더 벌어집니다.

반론도 만만치 않습니다. 오버싱킹은 결함이 아니라 27B가 위 체급을 상대하기 위한 설계라는 시각입니다. 장황하기로는 GLM-5.2도 비슷한 수준인데 그때는 아무도 불평하지 않았습니다. 이유는 간단합니다. 744B를 집에서 돌리는 사람이 없었으니까요. 27B는 직접 돌리는 모델이라 두 시간짜리 사고가 내 GPU 팬 소음으로 체감됩니다. 클라우드였다면 통계로 지나갔을 특성이 로컬에서는 고통이 됩니다.

## 측정된 모델과 내가 받는 모델은 다르다

AA가 측정한 것은 56GB짜리 BF16 원본입니다. 로컬 사용자 대부분은 17GB짜리 Q4_K_M을 내려받습니다. 17GB 파일을 받아 놓고 Luna급 응답을 기대하면 실망할 수밖에 없다는 지적이 스레드 안에서도 나왔습니다. 4비트 양자화의 품질 손실이 벤치마크 점수를 얼마나 깎는지는 아직 체계적으로 측정된 바가 없습니다.

양자화 빌드 사이의 편차도 실제 사건으로 드러났습니다.

:::warning

**어떤 양자화 파일을 받았는지가 평가를 가릅니다**

Unsloth의 Q4_K_XL 빌드는 컨텍스트가 60K 토큰을 넘으면 출력이 무너지는 문제가 보고됐습니다. 같은 조건에서 Bartowski의 Q4_K_M은 정상 동작했습니다. 초기의 "에이전트로 쓰면 별로다"라는 평가 일부는 특정 양자화 빌드 탓이었을 가능성이 있습니다.

:::

추론 스택 쪽 문제도 있었습니다. llama.cpp의 CUDA 경로가 하이브리드 어텐션의 Gated DeltaNet 레이어에서 출력을 깨뜨리는 버그가 있어 수정 커밋이 나올 때까지 며칠간 잘못된 결과를 내는 환경이 존재했습니다. API 쪽도 사정이 다르지 않습니다. OpenRouter의 일부 제공자는 상위 모델인 Qwen3.8 Max를 정밀도 표기 없이 FP4로 서빙하는 것으로 확인됐습니다. 지금 시점에 "Qwen3.8을 써봤다"는 후기들은 사실 서로 다른 모델을 써 본 이야기일 수 있습니다.

## 코딩에 몰빵한 대가

52점이 만능을 뜻하지는 않습니다. 지식과 할루시네이션을 재는 AA-Omniscience에서 27B는 전 세대인 Qwen3.6-27B보다 오히려 낮은 정확도를 받았습니다. 코딩과 에이전틱 작업이 급상승하는 동안 세계 지식은 제자리이거나 뒤로 갔습니다.

실사용 후기의 결도 같습니다. 몇 주째 반복되는 비교 상대인 DeepSeek V4 Flash와 견주면 Qwen이 실행과 속도와 비전에서 앞선다는 평가가 많습니다. 계획 수립과 배경 지식은 DeepSeek 쪽입니다. 소프트웨어 바깥의 글쓰기나 상식 문답에서는 여전히 27B급이라는 후기가 반복되고 산문이나 창작 용도로는 Gemma를 택하겠다는 사용자도 적지 않습니다.

지시 해석 스타일도 독특합니다. 한 사용자는 모델별 프롬프트 요구 수준을 이렇게 비교했습니다. Claude Fable 5는 "y로 x를 해줘"면 되고 GPT-5.6 Sol은 "z를 보장하면서"까지, GLM-5.2는 "아래 문단을 따라서"까지 적어야 합니다. Qwen3.8은 "md 파일에 적힌 스펙을 정확히 따라서"까지 지정해야 합니다. 시키는 것만 악의적으로 정확하게 수행한다(maliciously complying)는 표현이 나올 정도로, 빈칸을 알아서 채워 주는 모델은 아닙니다.

## 점수는 세 번 바뀌었다

이번 사태에서 벤치마크 지수 자체의 신뢰 문제도 함께 도마에 올랐습니다. 플래그십인 Qwen3.8 Max의 AA 점수는 세 번 바뀌었습니다. 처음 53점으로 발표됐다가 측정에 쓴 API 엔드포인트에 간헐적 문제가 있었다며 재측정 후 56점이 됐고 8월 초 채점 체계 개편(v4.1.1)을 거치며 58점이 됐습니다. 에이전틱 인덱스에서는 Max가 전체 1위로 표시됐다가 몇 시간 뒤 채점기 업데이트가 반영되며 2위로 내려가는 일도 있었습니다. AA 측은 사전에 계획된 채점 모델 업그레이드였고 큰 흐름은 달라지지 않는다고 해명했지만 같은 모델의 순위가 하루 사이 뒤바뀌는 장면은 지수의 불안정성을 그대로 보여 줬습니다.

벤치마크 회의론의 방향이 뒤집힌 것도 흥미로운 지점입니다. 중국 오픈 모델이 높은 점수를 받을 때마다 나오던 "벤치마크 최적화 아니냐"는 반사적 의심에, 이번에는 "프론티어 모델이 좋은 점수를 받으면 믿으면서 왜 로컬 모델만 의심하냐"는 반박이 힘을 얻었습니다. 자체 프라이빗 벤치마크로 돌려 봐도 52점이 체감과 맞는다는 검증 후기가 나왔습니다. 반대로 슈퍼마리오나 플래피버드를 한 번에 만들어 내는 데모 영상들은 훈련 데이터에 있던 것을 재생하는 것에 가깝다는 반론도 붙었습니다. 오래된 격언대로 최고의 벤치마크는 자기 워크로드입니다.

## 패밀리 구도와 라이선스

27B는 3주에 걸친 릴리스의 마지막 조각입니다. 8월 3일 플래그십 **Qwen3.8-Max**(2.4T 파라미터, 95B 활성 MoE, 1M 컨텍스트)가 API로 먼저 나왔고 8월 12일 그 가중치가 **Qwen3.8-2.4T-A95B**라는 이름으로 공개됐습니다. Qwen-Max급 플래그십의 가중치가 풀린 것은 이번이 처음입니다.

다만 라이선스가 갈렸습니다. 27B는 Apache 2.0인데 2.4T는 "Qwen3.8-Max License"라는 커스텀 라이선스입니다. 월간 활성 사용자 1억 명 또는 월매출 2,000만 달러를 넘으면 출처 표기(attribution) 의무가 붙고 모델 서비스업으로 연매출 5,000만 달러를 넘기면 별도 유료 라이선스가 필요합니다. 오픈웨이트 Qwen이 전부 Apache 2.0이던 관행이 이번에 처음 깨졌습니다.

:::note

**지역 차단 루머는 사실이 아닙니다**

2.4T 라이선스에 미국·EU·영국·한국 사용 금지 조항이 있다는 주장이 X에서 널리 퍼졌지만 공개된 라이선스 원문에 지역 조항은 없습니다. 실제 제약은 위에 적은 매출 기준뿐입니다. 일부 언론이 2.4T까지 Apache 2.0이라고 보도한 것도 오류라 이 릴리스는 양방향으로 잘못 전해지고 있습니다.

:::

다음 조각도 이미 예고됐습니다. 학습 프레임워크 커밋에서 **Qwen3.8-35B-A3B**가 발견됐는데 활성 3B짜리 MoE라 16GB급 GPU를 노린 구성입니다. 27B가 24GB 카드의 경계를 다시 그은 데 이어 35B-A3B는 그 아래 체급을 겨냥합니다.

## 마치며

점수는 진짜입니다. 다만 그 점수는 BF16 원본이 동급의 4배 가까운 토큰을 태우며 받은 숫자입니다. 로컬 사용자가 받는 것은 4비트 양자화본에 코딩 특화 모델입니다. 그 할인을 다 반영해도 남는 것이 있습니다. 두 세대 전과 같은 아키텍처, 같은 27B에서 훈련만으로 프론티어 턱밑 점수가 나왔고 RTX 3090 한 장에서 80 tok/s대로 도는 물건입니다. 추론 강도만 `medium`으로 내리면 불만의 대부분이 사라진다는 것이 현재 중론이고요.

개인적으로 이 릴리스에서 가장 눈에 남는 건 52점이라는 숫자보다 격차가 좁혀지는 속도입니다. 몇 달 전까지 "언젠가는 로컬 모델도"라던 농담이 반년도 안 돼 현실이 됐습니다. 로컬 모델이 쓸만하냐는 질문은 이미 지났고 이제는 측정 설정과 양자화, 도메인이라는 세 겹의 격차를 알고 쓰면 어디까지 되느냐를 따집니다. 이번 사태가 남긴 실용적인 교훈은 벤치마크 점수와 내 손에 쥔 모델 사이의 거리를 아는 것입니다.

## 함께 보면 좋은 글

- [Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?](/issue/opus-4-7/) : 벤치마크와 체감이 갈라질 때 무엇을 봐야 하는지
- [Claude Sonnet 5 출시, Opus급 성능?](/issue/claude-sonnet-5-release/) : 하위 티어가 상위 티어를 따라잡는 반복 패턴
- [Claude Opus 5 출시, 가격 그대로 성능은 Fable 5급?](/issue/opus-5/) : 같은 여름, 프론티어 쪽의 대응

## 참고자료

- [Qwen3.8-27B 공식 모델 카드 (Hugging Face)](https://huggingface.co/Qwen/Qwen3.8-27B)
- [Artificial Analysis: Qwen3.8-27B](https://artificialanalysis.ai/models/qwen3-8-27b)
- [Simon Willison: Qwen 3.8 27B is excellent, but it defaults to wildly overthinking things](https://simonwillison.net/2026/Aug/16/qwen-38-27b/)
- [r/LocalLLaMA: Artificial Analysis' Qwen3.8-27B benchmarks put it neck and neck with DeepSeek V4 and GPT-5.6 Luna Max](https://www.reddit.com/r/LocalLLaMA/comments/1vqyq8r/)
- [Qwen 공식 블로그: Qwen3.8](https://qwen.ai/blog?id=qwen3.8)

