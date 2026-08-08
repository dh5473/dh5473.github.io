---
date: '2026-04-27'
title: 'Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?'
category: 'Issue'
tags: ['Claude', 'Opus 4.7', 'Opus 4.6', 'Anthropic', 'LLM', 'AI Model']
summary: '벤치마크는 올랐는데 체감은 나빠진 Opus 4.7 사태를 정리합니다. 일주일 뒤 Anthropic 포스트모템은 원인의 상당 부분이 모델이 아니라 시스템 프롬프트와 캐싱에 있었다고 밝혔습니다.'
thumbnail: './thumbnail.png'
---

2026년 4월 16일, Anthropic이 Claude Opus 4.7을 공개했습니다. 공식 발표에는 SWE-bench Verified 87.6%, GPQA Diamond 94.2% 같은 숫자가 나열돼 있었습니다. 그런데 출시 직후 Reddit r/ClaudeAI에 "Claude Opus 4.7 is a serious regression, not an upgrade"라는 글이 올라왔고, r/ClaudeCode에서는 "Opus 4.7 is legendarily bad"라는 글과 함께 모델에 "Gaslightus 4.7"이라는 별명이 붙었습니다.

벤치마크 숫자는 분명 올랐습니다. 그런데 왜 사용자들은 퇴보라고 느꼈을까요.

## 벤치마크는 올랐는데 체감은 나빠졌다

Anthropic이 공개한 Opus 4.6 대비 수치입니다.

| 벤치마크 | Opus 4.6 | Opus 4.7 |
|---|---|---|
| Graphwalks (BFS, 256K~1M) | 38.7% | 58.6% |
| CharXiv Reasoning (도구 없음) | 69.1% | 82.1% |
| CursorBench | 58% | 70% |
| SWE-bench Pro | 53.4% | 64.3% |
| Humanity's Last Exam (도구 없음) | 40.0% | 46.9% |
| SWE-bench Verified | 80.8% | 87.6% |
| GPQA Diamond | 91.3% | 94.2% |
| BrowseComp | 83.7% | 79.3% |
| MRCR v2 (256K) | 91.9% | 59.2% |
| MRCR v2 (1M) | 78.3% | 32.2% |

발표 자료가 앞세운 것은 코딩과 비전이었고, 장문맥 검색 수치는 시스템 카드 안에 있었습니다. 같은 축에 올려놓으면 낙차가 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 520" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Opus 4.6 대비 Opus 4.7의 벤치마크 변화를 한 축에 올린 막대. Graphwalks가 19.9포인트로 가장 크게 오르고 MRCR 1M이 46.1포인트로 가장 크게 떨어진 모습">
<style>
.o47b-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.o47b-l { fill: var(--text, #1c1917); font-size: 14px; }
.o47b-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.o47b-up { fill: var(--text-success, #107836); }
.o47b-dn { fill: var(--text-danger, #cb2121); }
.o47b-ut { fill: var(--text-success, #107836); font-size: 14px; }
.o47b-dt { fill: var(--text-danger, #cb2121); font-size: 14px; }
.o47b-ax { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
</style>
<text class="o47b-t" x="200" y="22" text-anchor="middle">Opus 4.6 대비 변화 (포인트)</text>
<line class="o47b-ax" x1="200" y1="32" x2="200" y2="488"/>
<text class="o47b-l" x="16" y="46">Graphwalks (BFS)</text>
<rect class="o47b-up" x="200" y="52" width="63" height="16" rx="2"/>
<text class="o47b-ut" x="269" y="65">+19.9</text>
<text class="o47b-l" x="16" y="92">CharXiv Reasoning</text>
<rect class="o47b-up" x="200" y="98" width="41" height="16" rx="2"/>
<text class="o47b-ut" x="247" y="111">+13.0</text>
<text class="o47b-l" x="16" y="138">CursorBench</text>
<rect class="o47b-up" x="200" y="144" width="38" height="16" rx="2"/>
<text class="o47b-ut" x="244" y="157">+12.0</text>
<text class="o47b-l" x="16" y="184">SWE-bench Pro</text>
<rect class="o47b-up" x="200" y="190" width="34" height="16" rx="2"/>
<text class="o47b-ut" x="240" y="203">+10.9</text>
<text class="o47b-l" x="16" y="230">Humanity's Last Exam</text>
<rect class="o47b-up" x="200" y="236" width="22" height="16" rx="2"/>
<text class="o47b-ut" x="228" y="249">+6.9</text>
<text class="o47b-l" x="16" y="276">SWE-bench Verified</text>
<rect class="o47b-up" x="200" y="282" width="21" height="16" rx="2"/>
<text class="o47b-ut" x="227" y="295">+6.8</text>
<text class="o47b-l" x="16" y="322">GPQA Diamond</text>
<rect class="o47b-up" x="200" y="328" width="9" height="16" rx="2"/>
<text class="o47b-ut" x="215" y="341">+2.9</text>
<text class="o47b-l" x="16" y="368">BrowseComp</text>
<rect class="o47b-dn" x="186" y="374" width="14" height="16" rx="2"/>
<text class="o47b-dt" x="180" y="387" text-anchor="end">-4.4</text>
<text class="o47b-l" x="16" y="414">MRCR 256K</text>
<rect class="o47b-dn" x="97" y="420" width="103" height="16" rx="2"/>
<text class="o47b-dt" x="91" y="433" text-anchor="end">-32.7</text>
<text class="o47b-l" x="16" y="460">MRCR 1M</text>
<rect class="o47b-dn" x="55" y="466" width="145" height="16" rx="2"/>
<text class="o47b-dt" x="49" y="479" text-anchor="end">-46.1</text>
<text class="o47b-n" x="200" y="508" text-anchor="middle">막대 길이는 변화폭에 정비례</text>
</svg>
</div>

가장 크게 오른 항목이 19.9포인트인데 가장 크게 떨어진 항목은 46.1포인트입니다. 장문맥 검색은 컨텍스트를 256K로 줄여도 91.9%에서 59.2%로 내려가, 긴 문서를 다루는 실무자에게는 직접적인 타격입니다.

이 하락에는 Anthropic 쪽 설명이 붙어 있습니다. Claude Code를 만든 Boris Cherny는 MRCR을 시스템 카드에 남긴 것은 과학적 정직성 때문이고 실제로는 단계적으로 폐기하는 중이라고 밝혔습니다. 방해 정보를 쌓아 올려 모델을 속이는 방식이라 실사용과 거리가 있다는 이유였습니다. 같은 장문맥 계열인 Graphwalks가 38.7%에서 58.6%로 오른 것도 근거로 들었습니다. 장문맥 능력이 통째로 무너진 것은 아니라는 뜻입니다.

## 우기는 모델, 겁내는 모델

r/ClaudeCode에 모인 불만의 중심은 **모델이 틀렸을 때 인정하지 않고 없는 것을 있다고 우기는 행동**이었습니다.

- 존재하지 않는 파일을 만들었다고 주장
- 회귀를 일으킨 커밋이라며 `a3f9c12` 같은 해시를 제시. 형식은 진짜 같지만 저장소에 없는 해시라 개발자가 git log를 20분 뒤진 뒤에야 알아챔
- 실행한 적 없는 테스트 결과를 지어내고 10턴에 걸쳐 방어
- 이력서 작성에서 실제와 다른 학교명과 성을 임의로 삽입

할루시네이션 자체는 4.6에도 있었습니다. 보고들이 새롭다고 지목한 것은 틀린 답을 자신 있게 방어하는 패턴입니다. 지어낸 커밋 해시와 파일 경로를 진짜와 똑같은 확신으로 말하기 때문에, 사용자가 직접 대조하기 전에는 걸러낼 방법이 없습니다.

반대 방향의 문제도 같이 왔습니다. 2026년 4월 한 달 동안 Claude Code 저장소에 오탐 거부 신고가 30건 넘게 올라왔습니다. 2025년 중반까지 월 두세 건이던 것에서 크게 뛴 수치입니다.

- 입력에 base64 문자열이 있으면 디코딩 결과가 평범한 인사말이어도 사용정책 위반으로 거부
- 표준적인 계산 구조생물학 작업을 정책 위반으로 표시. 4.6에는 없던 동작
- 암호학 실습 자료를 교정해 달라는 요청을 거부
- 평범한 PowerPoint 템플릿을 열 때마다 악성코드 검사를 반복

여기에 벤치마크 하나가 걸립니다. Lech Mazur의 Extended NYT Connections에서 Opus 4.7은 41.0점을 받았습니다. 이 벤치마크는 거부 응답을 오답으로 세는데, 4.7은 문제의 절반 이상을 거부했습니다. 4.7이 실제로 답한 문제만 채점하면 90.9%이고 같은 문제에서 4.6은 94.7%입니다. 총점이 무너진 원인은 추론 능력이 아니라 거부였다는 뜻입니다.

:::note

**거부를 오답으로 세는 벤치마크**

Extended NYT Connections는 Anthropic이 아니라 Lech Mazur가 운영하는 외부 벤치마크입니다. 안전 필터가 과하게 걸리면 추론 능력과 무관하게 총점이 내려갑니다. 앞의 표에 실은 수치들과 성격이 다르므로 같은 줄에 놓고 비교하면 안 됩니다.

:::

## 덜 생각하고 덜 쓴다

4.7은 적응형(adaptive) 추론 모드를 씁니다. 이전 모델처럼 사용자가 사고 예산을 지정해 강제로 생각하게 만들 수 없고, 모델이 필요 없다고 판단하면 추론 토큰을 거의 쓰지 않습니다.

한 개발자가 같은 SVG 생성 프롬프트로 두 모델의 추론 토큰을 세어봤습니다. 4.6은 480개를 쓴 반면 4.7은 20개를 썼습니다. 프롬프트에 "think hard"를 붙이자 617 대 95가 됐습니다. 사고를 못 하는 게 아니라 기본값에서 덜 하는 쪽입니다.

호출 횟수에서도 같은 방향이 보입니다. Box의 Complex Work Evaluation에서 4.7은 태스크당 평균 LLM 호출을 16.3회에서 7.1회로 줄였습니다. 다만 Box는 이것을 퇴보가 아니라 **효율 개선**으로 발표했습니다. 같은 데이터가 "적게 생각한다"로도 "적게 왕복해도 끝낸다"로도 읽히는 셈입니다.

글쓰기에서는 이 변화가 손해로 나타났습니다. Hacker News의 "Opus 4.7 is horrible at writing" 스레드에서, 석사 논문에 4.7을 쓴 사용자는 결과물을 "sloppy, unprecise, very empty sentences"라고 표현했습니다. 마케팅 헤드라인을 요청했더니 "ONE APP, MANY MAC APPS" 같은 문구가 나왔다는 보고도 있었습니다. 4.6이 "생각 깊은 동료와 대화하는 느낌"이었다면 4.7은 "사내 메모를 받는 느낌"이라는 표현이 반복해서 나왔고, 서술형 문단 대신 글머리 기호와 제목으로 답하는 경향도 함께 지적됐습니다.

PM 업무 5종을 두 모델에 돌린 평가에서는 PRD 작성이 4.6 45점, 4.7 35점(50점 만점)으로 갈렸습니다. 4.7의 출력이 토큰 한도에 걸려 위험 요소를 서술하다 문장 중간에 끊긴 것이 감점 사유였습니다.

## 갈아타는 데 드는 비용

가격표는 그대로입니다. 입력 \$5/MTok, 출력 \$25/MTok. 바뀐 것은 토큰을 세는 방식입니다. Anthropic 문서는 4.7부터 새 토크나이저를 쓰며 같은 텍스트에 최대 35% 더 많은 토큰이 들 수 있다고 밝혔습니다. 콘텐츠 유형에 따라 1.0~1.35배입니다.

한 개발자가 Anthropic의 토큰 계산 엔드포인트로 유형별 증가율을 재봤습니다. 유형당 합성 샘플 1건 기준입니다.

| 콘텐츠 유형 | 토큰 증가율 |
|---|---|
| 일본어·중국어 산문 | 1.01배 |
| CSV (숫자) | 1.07배 |
| 도구 정의 (JSON Schema) | 1.12배 |
| 영어 산문 | 1.20배 |
| Python | 1.29배 |
| TypeScript | 1.36배 |
| Shell | 1.39배 |
| 기술 문서 (영어) | 1.47배 |

한중일 텍스트보다 영어와 코드에서 증가폭이 큽니다. 코드 중심으로 일하는 개발자에게 비용 증가가 집중된다는 뜻입니다. 같은 측정자가 실제 Claude Code 트래픽 7건으로 가중 평균을 낸 값은 1.325배로, 공식 범위 안에 들어옵니다.

작업 단위로 재면 격차가 더 벌어집니다. Duetto CTO Robert Matsuoka가 동일한 코딩 작업을 두 모델에 돌린 결과 4.6은 \$0.38, 4.7은 \$1.38이 나왔습니다. 테스트 통과는 둘 다 10/10으로 같았고, 차이는 과정에 있었습니다. 4.6은 파일 6개를 한 번에 정확히 쓰고 pytest를 한 번 돌려 끝냈지만, 4.7은 쓴 뒤 다섯 번 고쳤습니다.

구독 쪽에서도 같은 불만이 나왔습니다. 출시 당일 Pro 구독자가 대화 세 번 만에 한도에 도달했다는 보고가 있었고, Max 5x 사용자들은 이전보다 5~10배 빠르게 한도가 줄어든다고 했습니다. 이 상황을 "버전 업으로 포장한 은밀한 가격 인상"이라 부르는 표현이 반복해서 나왔습니다.

API를 직접 쓰는 쪽에는 다른 문제가 있었습니다. 4.6에서 쓰던 `thinking: {type: "enabled", budget_tokens: N}` 형태를 4.7 게이트웨이가 400으로 거부합니다. `temperature`, `top_p`, `top_k`도 4.7에서는 400을 냅니다. 가장 안전한 이행은 이 필드들을 요청에서 빼고 모델 기본값에 맡기는 것입니다.

:::warning

**thinking 출력이 조용히 빈 문자열이 됩니다**

`thinking.display`의 기본값이 4.6의 `summarized`에서 4.7의 `omitted`로 바뀌었습니다. 명시적으로 켜지 않으면 `block.thinking`이 빈 문자열로 돌아오고, 에러 없이 화면에 빈 칸만 그려집니다.

:::

도구 없이 한 번에 답하게 하는 모드에서는 차이가 더 컸습니다. 앞의 비용 비교와 같은 실험에서, 4.6이 10/10을 통과하던 테스트를 4.7은 1/10만 통과했습니다.

## 4월 23일, Anthropic의 포스트모템

출시 일주일 뒤인 4월 23일, Anthropic이 엔지니어링 포스트모템을 냈습니다. 여기서 밝힌 원인 세 가지는 모두 모델 가중치가 아니라 그 주변에 있었습니다.

**첫째, 응답 길이 상한.** 출시 당일인 4월 16일, Claude Code 시스템 프롬프트에 도구 호출 사이의 텍스트는 25단어 이하, 최종 응답은 작업이 요구하지 않는 한 100단어 이하로 유지하라는 지시가 추가됐습니다. 4월 20일에 제거됐습니다. 이 지시는 4.7 전용이 아니라 Sonnet 4.6과 Opus 4.6에도 걸려 있었고, 내부 평가 하나에서 Opus 4.6과 4.7 모두 3% 하락으로 나타났습니다.

**둘째, 기본 reasoning effort.** 3월 4일 지연 시간을 줄이려고 기본값을 high에서 medium으로 내렸다가, 불만이 이어지자 4월 7일 되돌렸습니다.

**셋째, 프롬프트 캐시 버그.** 3월 26일 유입된 버그로 캐시 정리 로직이 이전 추론 기록을 한 번이 아니라 매 턴 버렸습니다. 모델이 앞선 맥락을 잊고 사용 한도가 빨리 닳는 증상으로 나타났으며, 4월 10일 v2.1.101에서 고쳐졌습니다. 세 문제가 모두 해소된 시점은 4월 20일 v2.1.116입니다.

날짜를 겹쳐 놓으면 체감과 원인의 시차가 드러납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Claude Code 품질 저하의 세 원인이 적용돼 있던 기간을 3월 4일부터 4월 23일까지의 시간축에 그린 막대. 앞의 두 원인은 4.7 출시 전에 이미 끝났고 응답 길이 상한만 출시일에 겹친 모습">
<style>
.o47t-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.o47t-l { fill: var(--text, #1c1917); font-size: 14px; }
.o47t-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.o47t-bar { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.o47t-ax { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.o47t-mk { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 4 3; }
</style>
<text class="o47t-t" x="200" y="22" text-anchor="middle">Claude Code 품질 저하의 세 원인</text>
<text class="o47t-n" x="324" y="46" text-anchor="middle">4.7 출시</text>
<line class="o47t-mk" x1="324" y1="52" x2="324" y2="222"/>
<text class="o47t-l" x="16" y="76">reasoning effort: high → medium</text>
<rect class="o47t-bar" x="30" y="82" width="233" height="16" rx="2"/>
<text class="o47t-l" x="16" y="130">프롬프트 캐시 버그</text>
<rect class="o47t-bar" x="181" y="136" width="103" height="16" rx="2"/>
<text class="o47t-l" x="16" y="184">응답 길이 상한 25/100단어</text>
<rect class="o47t-bar" x="324" y="190" width="27" height="16" rx="2"/>
<line class="o47t-ax" x1="30" y1="222" x2="372" y2="222"/>
<text class="o47t-n" x="30" y="242">3월 4일</text>
<text class="o47t-n" x="372" y="242" text-anchor="end">4월 23일 포스트모템</text>
<text class="o47t-n" x="200" y="268" text-anchor="middle">막대 = 문제가 적용돼 있던 기간</text>
</svg>
</div>

세 원인은 서로 겹치지 않습니다. reasoning effort는 4월 7일, 캐시 버그는 4월 10일에 이미 정리된 상태였고 4.7은 그 엿새 뒤에 나왔습니다. 4.7 출시일에 새로 얹힌 것은 응답 길이 상한 하나입니다. 3월부터 이어진 "Claude Code가 나빠졌다"는 체감의 상당 부분은 4.6을 쓰던 시기의 문제였고, 그것이 4.7 출시 직후의 불만과 한 덩어리로 뭉쳐 읽힌 셈입니다.

Anthropic은 모델을 의도적으로 열화시키는 일은 없으며 API와 추론 계층은 영향을 받지 않았음을 곧바로 확인했다고 밝혔고, 같은 날 전 구독자의 사용량 한도를 리셋했습니다.

이 발표가 앞의 불만들과 겹치는 지점은 분명합니다. "말수가 줄었다", "글쓰기가 사내 메모 같아졌다", "문단 대신 글머리 기호만 쓴다"는 지적은 모델이 그렇게 학습된 결과가 아니라 시스템 프롬프트에 걸린 단어 수 상한의 결과였을 가능성이 큽니다.

다만 포스트모템이 모든 것을 설명하지는 않습니다. MRCR 하락은 Anthropic이 시스템 카드에 실은 모델 벤치마크 수치라 Claude Code 하네스와 무관합니다. 커밋 해시를 지어내고 방어하는 패턴도 응답 길이 상한으로는 설명되지 않습니다.

## Opus 4.7이 앞서는 곳

부정적 반응이 눈에 띄지만 실제로 개선된 영역이 있습니다.

에이전틱 코딩에서 대규모 코드베이스의 멀티파일 리팩터링과 자기수정이 향상됐습니다. Notion은 멀티스텝 워크플로우에서 4.6 대비 14% 향상과 함께 도구 호출 에러가 3분의 1로 줄었다고 밝혔고, Rakuten은 자체 SWE 벤치마크에서 4.6 대비 3배 많은 프로덕션 태스크를 해결했다고 보고했습니다.

비전 쪽 변화가 가장 큽니다. 입력 이미지 한도가 긴 변 1,568픽셀(약 1.15MP)에서 2,576픽셀(약 3.75MP)로 올라갔습니다. XBOW가 실제 인증 화면 200종에서 버튼 좌표를 정확히 찍는지 측정한 결과는 4.6이 54.5%, **4.7이 98.5%**였습니다.

구조화된 문서 작업도 앞섭니다. 앞서 PRD에서 진 그 평가에서 4.7은 5개 과제 중 4개를 이겼고 총점은 202 대 198(250점 만점)이었습니다. 경영진 요약은 45 대 42로 4.7이 앞섰습니다.

정리하면 에이전틱 코딩, 비전, 구조화된 문서에서는 4.7이 낫고, 범용 추론과 산문 글쓰기, 장문맥 검색, 비용 효율에서는 4.6이 낫습니다. Pawel Huryn은 이 갈림을 이렇게 정리했습니다.

> "Reddit says Opus 4.7 is a regression. Boris Cherny says it's more agentic and precise. Both are right. After 16 hours, I loved it: 4.7 is more capable, but most people are prompting it like 4.6."

4.6은 지시가 모호하면 빈칸을 알아서 메웠고, 4.7은 말한 대로만 합니다. 프롬프트에 맥락을 더 적으면 4.7이 나은 결과를 내는 경우가 많지만, 그것은 적응 비용을 사용자에게 넘기는 일이기도 합니다.

## 마치며

이 사건이 남기는 것은 두 가지입니다.

하나는 벤치마크 최적화의 대가입니다. MRCR 46포인트 하락은 Anthropic이 스스로 시스템 카드에 실은 숫자입니다. 그 벤치마크를 폐기하는 중이라는 설명이 붙어 있어도, 긴 문서를 다루던 사람이 겪은 저하는 그대로 남습니다. 벤치마크가 측정하지 않는 능력은 최적화 과정에서 먼저 희생됩니다.

다른 하나가 더 실용적입니다. 사용자가 "모델"이라고 부르는 것은 모델 가중치, 시스템 프롬프트, 기본 파라미터, 캐싱 계층이 겹쳐진 결과물입니다. 이 중 하나만 바뀌어도 체감은 크게 달라지는데, 밖에서는 전부 "모델이 나빠졌다"로 보입니다. 3월의 캐시 버그와 4월의 단어 수 상한이 4.7 출시와 한 덩어리로 읽힌 것이 정확히 그 결과이고, 회사가 직접 날짜를 공개하기 전까지는 바깥에서 구분할 방법이 없었습니다.

저는 4.7에서 체감 저하를 느껴 한동안 4.6을 쓰고 있었습니다. 포스트모템을 읽고 나니 그 체감의 상당 부분이 응답 길이 상한 때문이었을 가능성이 크고, 그 지시는 4월 20일에 이미 제거됐습니다. 같은 모델을 다시 쓰면 인상이 달라질 수 있다는 뜻입니다. 한 리뷰가 붙인 "higher ceiling, lower floor"라는 표현이 이 상황을 잘 잡아냅니다. 천장은 올라갔지만 바닥이 꺼졌고, 매일 코드를 배포하는 사람에게는 천장보다 바닥이 중요합니다.

## 함께 보면 좋은 글

- [Claude Fable 5는 성능이 역대 최강인데 왜 논란일까?](/issue/fable-5/) : 벤치마크와 체감이 다시 갈린 두 달 뒤의 출시
- [Claude Sonnet 5 출시, Opus급 성능?](/issue/claude-sonnet-5-release/) : 같은 토크나이저를 쓰는 하위 티어 모델의 가격 구조
- [Claude Opus 5 출시, 가격 그대로 성능은 Fable 5급?](/issue/opus-5/) : 석 달 뒤의 상위 모델 교체

## 참고자료

- [Anthropic 공식 발표: Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic Engineering: April 23 postmortem](https://www.anthropic.com/engineering/april-23-postmortem)
- [Vellum: Claude Opus 4.7 Benchmarks Explained](https://www.vellum.ai/blog/claude-opus-4-7-benchmarks-explained)
- [The Register: Claude Opus 4.7 has turned into an overzealous query cop](https://www.theregister.com/2026/04/23/claude_opus_47_auc_overzealous/)
- [Zvi Mowshowitz: Opus 4.7 Part 2, Capabilities and Reactions](https://thezvi.substack.com/p/opus-47-part-2-capabilities-and-reactions)
- [Hacker News: Opus 4.7 is Horrible at Writing](https://news.ycombinator.com/item?id=47801971)
- [Hyperdev: Opus 4.6 vs 4.7, The Real Cost of Incremental AI Improvements](https://hyperdev.matsuoka.com/p/opus-46-vs-47-the-real-cost-of-incremental)
