---
date: '2026-04-27'
title: 'Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?'
category: 'Issue'
tags: ['Claude', 'Opus 4.7', 'Opus 4.6', 'Anthropic', 'LLM', 'AI Model']
summary: 'Opus 4.7 출시 후 Reddit과 Hacker News에서 폭발한 부정적 반응. 벤치마크는 올랐는데 왜 사용자는 퇴보라 느끼는지, 그리고 Anthropic의 포스트모템이 밝힌 실제 원인을 정리합니다.'
thumbnail: './thumbnail.png'
---

2026년 4월 16일, Anthropic이 Claude Opus 4.7을 공개했습니다. 공식 발표에는 SWE-bench Verified 87.6%, GPQA Diamond 94.2% 등 인상적인 숫자들이 나열되어 있었습니다. 그런데 출시 하루 만에 Reddit r/ClaudeAI에는 "**Claude Opus 4.7 is a serious regression, not an upgrade**"라는 글이 올라왔고, r/ClaudeCode에서는 "**Opus 4.7 is legendarily bad**"라는 글과 함께 모델에 "Gaslightus 4.7"이라는 별명까지 붙었습니다.

벤치마크 숫자는 분명 올랐습니다. 그런데 왜 사용자들은 퇴보라고 느끼는 걸까요? 이번 글에서는 커뮤니티에서 쏟아진 실사용 경험과, 일주일 뒤 Anthropic이 직접 내놓은 포스트모템을 함께 놓고 Opus 4.7에 무슨 일이 있었는지 들여다봅니다.

## 벤치마크는 올랐는데 체감은 나빠졌다

먼저 공식 벤치마크부터 보겠습니다.

| 벤치마크 | Opus 4.6 | Opus 4.7 | 변화 |
|---------|----------|----------|------|
| SWE-bench Verified | 80.8% | 87.6% | +6.8 |
| SWE-bench Pro | 53.4% | 64.3% | +10.9 |
| CursorBench | 58% | 70% | +12.0 |
| GPQA Diamond | 91.3% | 94.2% | +2.9 |
| Humanity's Last Exam | 40.0% | 46.9% | +6.9 |
| CharXiv Reasoning | 69.1% | 82.1% | +13.0 |

숫자만 보면 전 분야에서 향상된 것처럼 보입니다. 하지만 Anthropic이 공식적으로 강조하지 않은 수치들이 있습니다.

| 벤치마크 | Opus 4.6 | Opus 4.7 | 변화 |
|---------|----------|----------|------|
| NYT Connections | 94.7% | 41.0% | **-53.7** |
| MRCR (1M 토큰) | 78.3% | 32.2% | **-46.1** |
| MRCR (256K 토큰) | 91.9% | 59.2% | **-32.7** |
| BrowseComp | 83.7% | 79.3% | -4.4 |

두 표를 한 축에 올려놓고 보면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 472" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="코딩과 비전 벤치마크는 10포인트 안팎 올랐지만 NYT Connections와 장문맥 검색은 50포인트 가까이 떨어진 발산 막대">
<style>
.bd-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.bd-l { fill: var(--text, #1c1917); font-size: 14px; }
.bd-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.bd-up { fill: var(--text-success, #16a34a); }
.bd-dn { fill: var(--text-danger, #dc2626); }
.bd-ut { fill: var(--text-success, #16a34a); font-size: 14px; }
.bd-dt { fill: var(--text-danger, #dc2626); font-size: 14px; }
.bd-ax { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
</style>
<text class="bd-t" x="200" y="22" text-anchor="middle">오른 항목과 떨어진 항목</text>
<line class="bd-ax" x1="200" y1="32" x2="200" y2="442"/>
<text class="bd-l" x="16" y="46">CharXiv Reasoning</text>
<rect class="bd-up" x="200" y="52" width="36" height="16" rx="2"/>
<text class="bd-ut" x="242" y="65">+13.0</text>
<text class="bd-l" x="16" y="92">CursorBench</text>
<rect class="bd-up" x="200" y="98" width="33" height="16" rx="2"/>
<text class="bd-ut" x="239" y="111">+12.0</text>
<text class="bd-l" x="16" y="138">SWE-bench Pro</text>
<rect class="bd-up" x="200" y="144" width="30" height="16" rx="2"/>
<text class="bd-ut" x="236" y="157">+10.9</text>
<text class="bd-l" x="16" y="184">Humanity's Last Exam</text>
<rect class="bd-up" x="200" y="190" width="19" height="16" rx="2"/>
<text class="bd-ut" x="225" y="203">+6.9</text>
<text class="bd-l" x="16" y="230">SWE-bench Verified</text>
<rect class="bd-up" x="200" y="236" width="19" height="16" rx="2"/>
<text class="bd-ut" x="225" y="249">+6.8</text>
<text class="bd-l" x="16" y="276">GPQA Diamond</text>
<rect class="bd-up" x="200" y="282" width="8" height="16" rx="2"/>
<text class="bd-ut" x="214" y="295">+2.9</text>
<text class="bd-l" x="16" y="322">BrowseComp</text>
<rect class="bd-dn" x="188" y="328" width="12" height="16" rx="2"/>
<text class="bd-dt" x="182" y="341" text-anchor="end">-4.4</text>
<text class="bd-l" x="16" y="368">MRCR (장문맥)</text>
<rect class="bd-dn" x="71" y="374" width="129" height="16" rx="2"/>
<text class="bd-dt" x="65" y="387" text-anchor="end">-46.1</text>
<text class="bd-l" x="16" y="414">NYT Connections</text>
<rect class="bd-dn" x="50" y="420" width="150" height="16" rx="2"/>
<text class="bd-dt" x="44" y="433" text-anchor="end">-53.7</text>
<text class="bd-n" x="200" y="464" text-anchor="middle">막대 길이는 변화폭에 정비례</text>
</svg>
</div>

오른 쪽의 최대 상승폭이 13포인트인데 떨어진 쪽은 54포인트입니다. 폭이 한 자릿수 차이가 아닙니다. 특히 장문맥 검색(MRCR)은 컨텍스트 길이를 256K로 줄여도 91.9%에서 59.2%로 떨어져, 긴 문서를 다루는 실무자에게는 직접적인 타격입니다.

한 가지 덧붙일 맥락이 있습니다. Claude Code 개발자 Boris Cherny는 MRCR이 방해 정보를 쌓아 올리는 방식이라 실사용과 거리가 있다며 단계적으로 폐기 중이라고 밝혔습니다. 같은 시기 장문맥 계열의 다른 벤치마크인 Graphwalks는 38.7%에서 58.6%로 올랐습니다. 장문맥 능력이 통째로 무너진 것은 아니라는 뜻입니다.

## "Gaslightus 4.7", 커뮤니티가 가장 분노한 문제들

### 가스라이팅하는 AI

r/ClaudeCode에서 가장 널리 공유된 글의 핵심 불만은 이것이었습니다. **모델이 틀렸을 때 인정하지 않고, 없는 것을 있다고 우기는 행동**입니다.

구체적으로 보고된 사례들을 정리하면 다음과 같습니다.

- 존재하지 않는 파일을 생성했다고 주장하며, 확인해보라는 요청에 "방금 확인했는데 정상적으로 존재합니다"라고 답변
- 날조된 커밋 해시(예: `a3f9c12`)를 진짜처럼 제시
- 실행한 적 없는 테스트 결과를 지어내고, 지적당한 뒤에도 10턴에 걸쳐 그 결과를 방어
- 이력서 작성 요청에서 실제와 다른 학교명과 성을 임의로 삽입

4.6에서도 할루시네이션은 있었지만, 지적하면 대체로 빠르게 수정했습니다. 4.7은 **틀린 답을 자신 있게 방어하는** 패턴이 새로 나타났다는 것이 핵심 차이점입니다.

### 과도한 안전 필터링

일상적인 코드 작업에서 불필요한 안전 경고가 발생한다는 보고도 다수 있었습니다.

- 일반적인 파일 I/O 코드를 멀웨어로 판정
- PowerPoint 템플릿을 열 때마다 악성코드 검사를 반복 실행
- 표준 라이브러리의 네트워크 호출을 위험 행위로 분류하여 실행 거부
- 4.6에서 아무 문제 없이 처리하던 작업들이 4.7에서 차단

코딩 에이전트로서의 핵심 기능인 파일 조작과 네트워크 접근에서 과잉 방어가 발생하는 것은 실용성을 크게 떨어뜨립니다.

### "Lazy Reasoning", 생각을 안 한다

한 연구자가 SVG 생성 작업에서 흥미로운 비교를 공유했습니다. 동일한 프롬프트에 대해 **4.6은 480개의 추론 토큰**을 사용한 반면, **4.7은 단 20개**만 사용했습니다. 다만 같은 실험에서 프롬프트에 "think hard"를 붙이자 617 대 95로 격차가 크게 줄었습니다. 사고를 못 하는 게 아니라 기본값에서 덜 하는 쪽에 가깝습니다.

PhD 학생들이 Hacker News에 보고한 내용도 비슷합니다. 이론 물리학과 수학 문제에서 4.6이 깔끔하게 풀던 것을 4.7은 "이 방법이 안 되네요, 다른 걸 시도해볼게요"를 한 응답 안에서 5번이나 반복했다고 합니다.

호출 횟수 데이터도 있습니다. Box의 Complex Work Evaluation에서 4.7은 태스크당 평균 LLM 호출을 16.3회에서 7.1회로 줄였습니다. 다만 Box는 이 수치를 퇴보가 아니라 **효율 개선 성과**로 발표했다는 점을 함께 봐야 합니다. 같은 데이터가 "적게 생각한다"로도, "적게 왕복해도 끝낸다"로도 읽히는 셈입니다.

## 토크나이저 논란: "스텔스 가격 인상"

커뮤니티에서 벤치마크 퇴보만큼이나 뜨거웠던 주제가 **비용 문제**입니다.

공식 가격은 동일합니다. 입력 \$5/MTok, 출력 \$25/MTok. 하지만 4.7은 새로운 토크나이저를 사용하면서 **같은 텍스트에 대해 더 많은 토큰을 소비**합니다. Anthropic이 밝힌 공식 범위는 콘텐츠 유형에 따라 **1.0~1.35배**입니다.

한 개발자(Claude Code Camp)가 합성 샘플로 유형별 증가율을 측정한 결과는 다음과 같습니다. 각 유형당 샘플 1건 기준이라는 점은 감안해야 합니다.

| 콘텐츠 유형 | 토큰 증가율 |
|------------|-----------|
| 일본어/중국어 | 1.01x |
| 영어 산문 | 1.20x |
| Python | 1.29x |
| TypeScript | 1.36x |
| Shell | 1.39x |
| **기술 문서 (영어)** | **1.47x** |

흥미로운 점은 한중일 텍스트보다 **영어와 코드에서 토큰 인플레이션이 훨씬 크다**는 것입니다. 코드 중심으로 작업하는 개발자에게 실질적 비용 증가가 집중됩니다. 같은 측정자가 실제 트래픽으로 가중 평균을 낸 값은 1.325배로, 공식 범위 안에 들어옵니다.

비용 비교도 있습니다. Duetto CTO Robert Matsuoka가 동일한 작업을 두 모델에 돌린 결과, **4.6은 \$0.38, 4.7은 \$1.38로 3.6배 차이**가 났습니다. 그런데 정확도는 둘 다 10/10으로 동일했고, 오히려 4.6은 첫 시도에 성공한 반면 4.7은 5번의 수정을 거쳤습니다.

Pro 플랜 사용자들도 불만을 쏟아냈습니다. 이전에는 하루 종일 쓸 수 있던 사용량이, 4.7에서는 3~4개의 복잡한 쿼리만으로 주간 한도에 도달한다는 보고가 이어졌습니다. 일부 개발 블로그는 이 상황을 "버전 업으로 포장한 은밀한 비용 인상"으로 요약했습니다.

## 글쓰기 능력의 퇴화

Hacker News에 "Opus 4.7 is horrible at writing"이라는 글이 올라왔습니다. 규모가 큰 스레드는 아니었지만, 댓글에서 비슷한 보고가 이어졌습니다.

석사 논문 작성에 4.7을 사용한 한 사용자는 "sloppy, unprecise, very empty sentences"라고 표현했습니다. 같은 스레드의 다른 사용자는 마케팅 헤드라인 요청에 "ONE APP, MANY MAC APPS" 같은 결과물이 나왔다고 보고했습니다. 정리하면 이런 지적들입니다.

- **4.6**: "생각 깊은 동료와 대화하는 느낌" → **4.7**: "사내 메모를 받는 느낌"
- 기본 출력 형식이 문단 대신 글머리 기호와 제목 위주로 변경
- PRD(Product Requirements Document) 작성 테스트: 4.6이 45/50점, 4.7이 35/50점 (토큰 한도 초과로 중간에 출력 중단)

커뮤니티의 분석에 따르면, 4.7은 "length matches complexity" 원칙을 적용해 짧고 직접적인 답변을 생성하도록 튜닝된 것으로 보였습니다. 이 추측이 얼마나 맞았는지는 뒤에서 다시 나옵니다.

## API 호환성 파괴

API를 직접 사용하는 개발자들에게는 또 다른 문제가 있었습니다. 파라미터 지원 범위가 바뀐 것입니다.

- `thinking: {type: "enabled", budget_tokens: N}` → 400 에러
- `temperature`, `top_p`, `top_k`에 **기본값이 아닌 값**을 넣으면 400 에러
- thinking 필드가 기본적으로 비어서 나옴

공식 문서의 표현을 정확히 옮기면 "파라미터를 넘기는 것 자체가 금지"가 아니라 "기본값이 아닌 값을 설정하면 400"입니다. 그래서 가장 안전한 이행은 해당 파라미터를 아예 빼는 것입니다. thinking 출력을 다시 보고 싶다면 `display: "summarized"`로 명시적으로 켜면 됩니다.

기존 4.6 기반으로 작성된 코드에서 모델명만 바꾸면 즉시 에러가 발생합니다. 특히 도구 없이 one-shot 모드로 사용할 경우, 4.6에서 10/10 통과하던 테스트가 4.7에서는 1/10만 통과했다는 보고도 있었습니다.

## 4월 23일, Anthropic의 포스트모템

출시 일주일 뒤인 4월 23일, Anthropic이 엔지니어링 포스트모템을 냈습니다. 여기서 밝힌 원인 세 가지는 모두 **모델 가중치가 아니라 그 주변**에 있었습니다.

**첫째, 응답 길이 상한.** 출시 당일인 4월 16일, Claude Code 시스템 프롬프트에 응답 길이를 제한하는 지시가 추가됐습니다. 도구 호출 사이의 텍스트는 25단어 이하, 최종 응답은 작업이 요구하지 않는 한 100단어 이하로 유지하라는 내용이었습니다. 이 지시는 4월 20일 v2.1.116에서 제거됐습니다.

**둘째, 기본 reasoning effort 변경.** 3월 4일 기본값이 high에서 medium으로 내려갔다가 4월 7일 복구됐습니다.

**셋째, 캐싱 버그.** 3월 26일 유입된 버그가 4월 10일 v2.1.101에서 수정됐습니다.

Anthropic은 "모델을 의도적으로 열화시키는 일은 절대 없으며, API와 추론 계층은 영향을 받지 않았음을 곧바로 확인했다"고 밝혔고, 같은 날 전 구독자의 사용량 한도를 리셋했습니다.

이 발표가 앞의 불만들과 겹치는 지점이 분명합니다. "말수가 줄었다", "글쓰기가 사내 메모 같아졌다", "문단 대신 글머리 기호만 쓴다"는 지적은 모델이 그렇게 학습된 결과가 아니라 **시스템 프롬프트에 걸린 단어 수 상한**의 결과였을 가능성이 큽니다. 커뮤니티가 "length matches complexity 원칙으로 튜닝됐다"고 추측했던 것의 실체가 프롬프트 한 줄이었던 셈입니다.

다만 포스트모템이 모든 것을 설명하지는 않습니다. NYT Connections와 MRCR 하락은 Anthropic이 직접 발표한 모델 벤치마크 수치이므로 하네스와 무관합니다. 가스라이팅 패턴 역시 응답 길이 상한으로 설명되지 않습니다. 정리하면 **체감 저하의 일부는 하네스, 일부는 모델**이었고, 이 둘을 구분하기 전까지 사용자는 원인을 알 방법이 없었다는 것이 이 사건의 핵심입니다.

## 그래서 4.7이 더 나은 경우는 있는가

부정적 반응이 압도적이지만, 특정 영역에서는 확실히 개선되었습니다.

**에이전틱 코딩**: 대규모 코드베이스에서의 멀티파일 리팩토링, 자기수정 능력은 눈에 띄게 향상됐습니다. Y Combinator CEO Garry Tan이 공개적으로 지지했고, Notion은 멀티스텝 워크플로우에서 4.6 대비 14% 성능 향상과 함께 도구 호출 에러가 3분의 1 수준으로 줄었다고 밝혔습니다. Rakuten은 4.6 대비 3배 더 많은 프로덕션 태스크를 해결했다고 보고했습니다.

**비전**: 해상도가 1.15MP에서 3.75MP로 3배 향상됐고, XBOW의 시력 판독 벤치마크에서는 54.5%에서 98.5%로 뛰었습니다. 스크린샷 분석, 다이어그램 해석에서 실질적인 차이를 체감할 수 있습니다.

**구조화된 분석**: 한 평가에서 PM 업무 5개 중 4개를 이겼고, 경영진 요약에서 45/50점(4.6은 42/50)을 기록했습니다. 같은 평가의 총점은 4.7이 202/250, 4.6이 198/250으로 4.7이 앞섰습니다. 다만 그 안에는 PRD 작성처럼 4.7이 크게 진 항목도 포함되어 있습니다.

정리하면 **에이전틱 코딩, 비전, 구조화된 문서 작업**에서는 4.7이 앞서고, **범용 추론, 글쓰기, 장문맥 처리, 비용 효율**에서는 4.6이 여전히 낫습니다.

## 왜 이런 일이 반복되는가

Opus 4.7의 사례가 남기는 교훈은 두 층위입니다.

**모델 쪽에서는 벤치마크 최적화의 함정이 보입니다.** 특정 벤치마크에서 점수를 올리기 위한 튜닝이 범용 능력을 깎아먹을 수 있습니다. NYT Connections 54포인트 폭락이 그 신호입니다. 벤치마크가 측정하지 않는 능력은 최적화 과정에서 희생되기 쉽습니다.

**그런데 더 실용적인 교훈은 하네스 쪽에 있습니다.** 사용자가 "모델"이라고 부르는 것은 실제로는 모델 가중치, 시스템 프롬프트, 기본 파라미터, 캐싱 계층이 겹쳐진 결과물입니다. 이 중 어느 하나만 바뀌어도 체감은 크게 달라지는데, 사용자에게는 전부 "모델이 나빠졌다"로 보입니다. 4월 23일 포스트모템이 확인해 준 것이 정확히 이것입니다. 그리고 회사가 스스로 공개하기 전까지는 바깥에서 구분할 방법이 없었습니다.

X에서 널리 공유된 Pawel Huryn의 정리가 이 상황을 잘 요약합니다.

> "Reddit says Opus 4.7 is a regression. Boris Cherny says it's more agentic and precise. Both are right. After 16 hours, I loved it: 4.7 is more capable, but most people are prompting it like 4.6."

프롬프트에 20~30단어의 구체적 맥락을 추가하면 4.7이 더 나은 결과를 내는 경우가 많습니다. 하지만 그것은 사용자에게 적응 비용을 전가하는 것이기도 합니다. 한 필자가 붙인 "Higher ceiling, lower floor"라는 표현이 이 상황을 잘 잡아냅니다. 천장은 분명히 올라갔지만 바닥이 꺼졌고, 매일 코드를 배포하는 사람에게는 천장보다 바닥이 중요하다는 것입니다.

## 마치며

저는 4.7에서 체감 저하를 느껴 한동안 Opus 4.6을 쓰고 있었습니다. 포스트모템을 읽고 나니 그 체감의 상당 부분이 응답 길이 상한 때문이었을 가능성이 크고, 그 지시는 4월 20일에 이미 제거됐습니다. 같은 모델을 지금 다시 쓰면 인상이 달라질 수 있다는 뜻입니다.

이 사건에서 가장 오래 남을 것은 특정 모델의 좋고 나쁨이 아니라, **모델과 그 주변 하네스를 구분할 수 없는 상태에서 사용자가 품질 변화를 겪는다는 사실** 자체입니다. 벤치마크 숫자로도, 커뮤니티 반응으로도 그 구분은 되지 않았습니다. 결국 회사가 직접 밝히기 전까지는 아무도 몰랐습니다. 프런티어 모델이 제품에 깊이 들어올수록, 이 구분을 어떻게 투명하게 만들 것인가가 벤치마크 점수보다 중요한 문제가 될 것 같습니다.

## 함께 보면 좋은 글

- [Claude Fable 5: 성능은 역대 최강인데 왜 논란일까?](/issue/fable-5/) : 두 달 뒤, 정반대 구도의 출시
- [Claude Sonnet 5 출시, Opus급 성능?](/issue/claude-sonnet-5-release/) : 아첨과 토크나이저 문제가 이후 어떻게 다뤄졌는지

## 참고자료

- [Anthropic 공식 발표: Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic Engineering: April 23 postmortem](https://www.anthropic.com/engineering/april-23-postmortem)
- [Reddit r/ClaudeCode: "Opus 4.7 is legendarily bad"](https://www.reddit.com/r/ClaudeCode/comments/1so9uta/)
- [Hacker News: Opus 4.7 is Horrible at Writing](https://news.ycombinator.com/item?id=47801971)
- [Hacker News: Anonymous request-token comparisons from Opus 4.6 and Opus 4.7](https://news.ycombinator.com/item?id=47816960)
- [Box: Claude Opus 4.7 delivers powerful performance, higher efficiency](https://blog.box.com/claude-opus-47-delivers-powerful-performance-higher-efficiency-vs-opus-46)
- [Vellum: Opus 4.7 Benchmarks Explained](https://www.vellum.ai/blog/claude-opus-4-7-benchmarks-explained)
