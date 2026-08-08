---
date: '2026-06-11'
title: 'Claude Fable 5는 성능이 역대 최강인데 왜 논란일까?'
category: 'Issue'
tags: ['Claude', 'Fable 5', 'Mythos 5', 'Anthropic', 'LLM', 'AI Model']
summary: 'Opus 위 새 티어로 등장한 Claude Fable 5. 성능 호평과 동시에 구독 컷오프, 안전 분류기 오발, 보이지 않는 성능 제한까지 출시 직후 반응을 분석합니다.'
thumbnail: './thumbnail.png'
---

2026년 6월 9일, Anthropic이 Claude Fable 5를 공개했습니다. 앞서 Opus 4.7 출시 때는 벤치마크 점수가 올랐는데도 사용자 체감은 나빠지면서 "Gaslightus"라는 별명까지 붙었지만, 이번에는 구도가 정반대입니다. 성능을 의심하는 목소리는 거의 나오지 않았습니다. 대신 커뮤니티가 붙잡은 것은 접근 조건이었습니다. 최고 성능 모델이 구독 안에 머물지 않고 계량기 달린 유틸리티로 옮겨 가고 있다는 표현이 반복해서 나왔습니다.

성능 논란이 아니라 **정책 논란**입니다. 6월 22일 이후 구독 플랜에서 제거된다는 공지, 과학자들의 Fable 5 사용을 사실상 막아버린 안전 분류기, 그리고 특정 작업의 성능을 사용자에게 알리지 않고 제한하겠다는 시스템 카드 문구까지 세 갈래였습니다.

## Mythos급 모델을 "안전하게 만든" 버전

Fable 5를 이해하려면 같은 날 발표된 **Claude Mythos 5**부터 봐야 합니다. Mythos는 Opus 위에 새로 생긴 캐퍼빌리티 클래스로, Anthropic은 Fable 5를 이렇게 정의했습니다.

> "A Mythos-class model that we've made safe for general use" (Anthropic 공식 발표)

핵심은 두 모델이 **같은 기반 모델(the same underlying model)** 이라는 점입니다. 모델 자체의 차이는 안전 장치뿐이고, 판매 방식의 차이는 거기서 따라 나옵니다.

| 구분 | Claude Mythos 5 | Claude Fable 5 |
|------|----------------|----------------|
| 기반 모델 | 동일 | 동일 |
| 안전 분류기 | 없음 | 상시 구동 |
| 판매 방식 | Project Glasswing 승인 고객 한정 | 일반 판매 (API, 주요 클라우드) |
| 모델 ID | `claude-mythos-5` | `claude-fable-5` |

Mythos 5는 일반 판매하지 않습니다. 사이버 방어와 핵심 인프라 조직을 대상으로 한 **Project Glasswing** 프로그램을 통해서만 제공되는데, 런치 파트너에 AWS, Apple, Broadcom, Cisco, CrowdStrike, Google, JPMorganChase, Linux Foundation, Microsoft, NVIDIA, Palo Alto Networks가 이름을 올렸습니다. 미 정부와 협의 하에 운영되며, 6월 2일 발표 기준으로 15개국 이상 약 150개 조직이 새로 합류했습니다(당시 제공 모델은 Mythos Preview).

일반 사용자가 쓰는 Fable 5는 안전 분류기가 항상 켜져 있고, **사이버보안, 생물/화학, 증류(distillation)** 관련으로 판정된 요청은 자동으로 현행 플래그십인 Opus 4.8로 넘어갑니다. 기본 동작은 폴백이지만, 요청 자체가 거부되는 경우도 있습니다. Anthropic은 폴백이 전혀 발생하지 않는 세션이 95%를 넘는다고 밝혔습니다. 그 95%에서는 Mythos 5와 같은 기반 모델이 그대로 답하는 셈입니다. 이 폴백 구조가 뒤에서 다룰 논란의 핵심입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 424" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 기반 모델에서 Mythos 5와 Fable 5가 갈라지고, Fable 5는 특정 판정에서 Opus 4.8로 폴백하는 구조">
<style>
.fb1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.fb1-h { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.fb1-l { fill: var(--text, #1c1917); font-size: 15px; }
.fb1-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.fb1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.fb1-key { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.fb1-warn { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
.fb1-line { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.fb1-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#fb1Arrow); }
</style>
<defs>
<marker id="fb1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="fb1-t" x="200" y="24" text-anchor="middle">같은 모델, 두 갈래 배포</text>
<!-- 공통 기반 -->
<rect class="fb1-key" x="40" y="38" width="320" height="42" rx="6"/>
<text class="fb1-h" x="200" y="65" text-anchor="middle">동일한 기반 모델</text>
<!-- 분기 스파인 -->
<path class="fb1-line" d="M62 80 L62 232"/>
<path class="fb1-a" d="M62 128 L92 128"/>
<path class="fb1-a" d="M62 232 L92 232"/>
<!-- Mythos -->
<rect class="fb1-box" x="96" y="100" width="264" height="72" rx="6"/>
<text class="fb1-h" x="114" y="124">Mythos 5</text>
<text class="fb1-n" x="114" y="146">안전 분류기 없음</text>
<text class="fb1-n" x="114" y="165">Glasswing 승인 고객 한정</text>
<!-- Fable -->
<rect class="fb1-key" x="96" y="204" width="264" height="72" rx="6"/>
<text class="fb1-h" x="114" y="228">Fable 5</text>
<text class="fb1-n" x="114" y="250">안전 분류기 상시 구동</text>
<text class="fb1-n" x="114" y="269">API · 주요 클라우드 일반 판매</text>
<!-- 판정 -->
<path class="fb1-a" d="M228 276 L228 302"/>
<rect class="fb1-warn" x="40" y="306" width="320" height="42" rx="6"/>
<text class="fb1-l" x="200" y="333" text-anchor="middle">사이버 · 생물/화학 · 증류 판정</text>
<path class="fb1-a" d="M200 348 L200 372"/>
<rect class="fb1-box" x="40" y="376" width="320" height="44" rx="6"/>
<text class="fb1-l" x="200" y="395" text-anchor="middle">Opus 4.8로 폴백</text>
<text class="fb1-n" x="200" y="413" text-anchor="middle">전체 세션의 5% 미만</text>
</svg>
</div>

스펙을 정리하면 다음과 같습니다.

| 항목 | 값 |
|------|-----|
| 컨텍스트 윈도우 | 1M 토큰 (롱컨텍스트 추가 요금 없음) |
| 최대 출력 | 128K 토큰 |
| 씽킹 | Adaptive thinking 전용 (extended thinking 제거) |
| 지식 컷오프 | 2026년 1월 |
| 가격 | 입력 \$10/MTok, 출력 \$50/MTok (Opus 4.8의 정확히 2배) |
| 가용성 | Claude API, Claude Platform on AWS, Amazon Bedrock, Vertex AI, Microsoft Foundry 동시 GA |

## 숫자는 확실히 한 단계 위

:::warning

**공식 벤치마크 표를 그대로 읽으면 안 됩니다**

출시 발표에 실린 표는 Mythos 5와 Fable 5를 한 컬럼에 묶어 둘 중 높은 점수를 싣습니다. 그래서 2차 보도 상당수가 Mythos 점수를 Fable 점수로 인용하고 있습니다. 아래 수치는 두 모델을 분리해 적은 시스템 카드 값입니다.

:::

경쟁 모델과 나란히 놓으면 이렇습니다.

| 벤치마크 | Fable 5 | GPT-5.5 | Gemini 3.1 Pro |
|---------|---------|---------|----------------|
| SWE-bench Pro | **80.0%** | 58.6% | 54.2% |
| SWE-bench Verified | **95.0%** | 미보고 | 80.6% |
| FrontierCode (Diamond) | **29.3%** | 5.7% | 미보고 |
| Terminal-Bench 2.1 | **84.3%** | 83.4% | 70.7% |
| OSWorld-Verified | **85.0%** | 78.7% | 76.2% |
| GDPval-AA (Elo) | **1932** | 1769 | 1314 |

SWE-bench Pro는 출처에 따라 값이 갈립니다. 시스템 카드는 Fable 5를 80, Mythos 5를 80.3으로 나눠 적었고, 출시 발표 표는 80.3 한 값만 싣고 있습니다.

Terminal-Bench 행은 측정 조건이 서로 다릅니다. Fable 5는 mini-SWE-agent 하네스, GPT-5.5는 Codex CLI, Gemini 3.1 Pro는 리더보드 최고 기록입니다. 같은 축에 놓여 있지만 동일 조건 비교는 아닙니다.

직전 플래그십인 Opus 4.8과 견주면 상승폭이 어디에 몰려 있는지가 드러납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 476" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="다섯 개 벤치마크에서 Opus 4.8과 Fable 5의 점수를 막대로 비교한 그림. FrontierCode Diamond의 상승폭이 가장 크다">
<style>
.fb2-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.fb2-g { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.fb2-v { fill: var(--text, #1c1917); font-size: 14px; }
.fb2-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.fb2-old { fill: var(--text-muted, #6d6762); }
.fb2-new { fill: var(--primary, #0a756c); }
</style>
<text class="fb2-t" x="200" y="24" text-anchor="middle">Opus 4.8 → Fable 5</text>
<!-- 범례 -->
<rect class="fb2-old" x="24" y="40" width="14" height="14" rx="3"/>
<text class="fb2-n" x="44" y="52">Opus 4.8</text>
<rect class="fb2-new" x="130" y="40" width="14" height="14" rx="3"/>
<text class="fb2-n" x="150" y="52">Fable 5</text>
<!-- SWE-bench Pro -->
<text class="fb2-g" x="24" y="82">SWE-bench Pro</text>
<rect class="fb2-old" x="24" y="90" width="173" height="16" rx="2"/>
<text class="fb2-v" x="203" y="103">69.2</text>
<rect class="fb2-new" x="24" y="112" width="200" height="16" rx="2"/>
<text class="fb2-v" x="230" y="125">80.0</text>
<!-- SWE-bench Verified -->
<text class="fb2-g" x="24" y="160">SWE-bench Verified</text>
<rect class="fb2-old" x="24" y="168" width="222" height="16" rx="2"/>
<text class="fb2-v" x="252" y="181">88.6</text>
<rect class="fb2-new" x="24" y="190" width="238" height="16" rx="2"/>
<text class="fb2-v" x="268" y="203">95.0</text>
<!-- FrontierCode Diamond -->
<text class="fb2-g" x="24" y="238">FrontierCode Diamond</text>
<rect class="fb2-old" x="24" y="246" width="34" height="16" rx="2"/>
<text class="fb2-v" x="64" y="259">13.4</text>
<rect class="fb2-new" x="24" y="268" width="73" height="16" rx="2"/>
<text class="fb2-v" x="103" y="281">29.3</text>
<!-- Terminal-Bench -->
<text class="fb2-g" x="24" y="316">Terminal-Bench 2.1</text>
<rect class="fb2-old" x="24" y="324" width="207" height="16" rx="2"/>
<text class="fb2-v" x="237" y="337">82.7</text>
<rect class="fb2-new" x="24" y="346" width="211" height="16" rx="2"/>
<text class="fb2-v" x="241" y="359">84.3</text>
<!-- OSWorld -->
<text class="fb2-g" x="24" y="394">OSWorld-Verified</text>
<rect class="fb2-old" x="24" y="402" width="209" height="16" rx="2"/>
<text class="fb2-v" x="239" y="415">83.4</text>
<rect class="fb2-new" x="24" y="424" width="213" height="16" rx="2"/>
<text class="fb2-v" x="243" y="437">85.0</text>
<text class="fb2-n" x="24" y="466">막대 길이 = 점수(%), 0부터 같은 축척</text>
</svg>
</div>

코딩 벤치마크의 상승폭이 특히 큽니다. SWE-bench Pro에서 10.8포인트가 올랐고, Cognition의 신규 벤치마크인 FrontierCode Diamond에서는 점수가 2배 이상 뛰었습니다. Opus 4.7 때처럼 특정 벤치마크가 폭락하는 트레이드오프도 이번에는 보고되지 않았습니다.

Terminal-Bench 수치에는 단서가 붙습니다. Fable 5의 84.3%에는 **전체 시도의 20.9%에서 안전 거부가 발생해 남은 구간을 Opus 4.8이 이어받은 결과가 포함**되어 있습니다. 터미널 작업이 사이버보안 분류기를 자주 건드린다는 뜻입니다. 분류기가 없는 Mythos 5는 같은 벤치마크에서 88.0%를 기록했는데, 공식 표에 실린 값이 바로 이 88.0%입니다.

독립 평가도 대체로 같은 방향입니다. Artificial Analysis의 Intelligence Index에서 출시 시점 기준 **64.9점으로 1위**에 올랐는데, Anthropic 외 모델 중 가장 높은 GPT-5.5보다 약 5점 앞선 값입니다. Every.to의 시니어 엔지니어 벤치마크에서는 91/100으로 Opus 4.8(63)과 GPT-5.5(62)를 크게 앞섰습니다. 다만 Artificial Analysis는 인덱스 태스크의 약 8%, Humanity's Last Exam 태스크의 9%에서 Opus 4.8 폴백을 관측했다고 밝혔습니다. 태스크 기준과 세션 기준(공식 주장 5% 미만)은 단위가 달라 직접 비교할 수는 없습니다.

반대 신호가 아예 없는 건 아닙니다. Andon Labs의 Vending-Bench에서는 Fable/Mythos 5가 Opus 4.7 및 GPT-5.5보다 낮은 수익을 냈고, 가격 담합을 먼저 시도한 유일한 모델이었다는 보고가 나왔습니다. Andon Labs는 정렬 측면에서 "한 걸음 후퇴"라고 평가했습니다.

## "역대급"이라는 호평

벤치마크보다 커뮤니티를 움직인 건 실사용 보고였습니다. Hacker News 출시 스레드에 올라온 것들이 구체적입니다.

- DB 마이그레이션에서 메모리 할당을 **46배 줄이고**, Opus 4.8과 Codex 5.5가 만들어둔 버그를 여럿 찾아냄. "this is the first model that feels like its coming for my job" (kansface)
- Claude Code 4.8과 Codex 5.5가 모두 실패한 리버스 엔지니어링 문제를 **30분 만에 해결** (bottlepalm)
- CRDT 구현자: "LLM의 결과물을 읽으면서 추론과 코드에서 명백한 약점을 못 찾은 건 이번이 처음" (josephg)
- "Fable on 'high' is producing substantially better results than Opus 4.8 on xhigh" (boc)

josephg의 보고에는 눈여겨볼 대목이 하나 더 있습니다. 설계 스케치만 주고 나머지를 맡겼더니, 모델이 시키지도 않은 퍼저를 직접 작성해 자기 추론이 맞는지 검증하고 그가 놓친 버그 몇 개를 잡아냈다는 것입니다. Opus 4.7 출시 때 "가스라이팅"이 키워드였던 것과 비교하면 정확히 반대 방향의 평가입니다.

전문가들의 평가도 같은 쪽이었습니다.

> "This is a super exciting release... The benchmarks are great and it's SOTA on everything by a margin but I'll add that qualitatively also, this is a major-version-bump-deserving step change forward" (Andrej Karpathy)

> "Fable is the best model I have used for coding, by a wide margin." (Boris Cherny, Claude Code 개발자)

Simon Willison은 "something of a beast"라며 하루에 \$110 이상을 쓰면서 테스트한 결과를 공개했는데, micropython-wasm 프로젝트를 풀 CPython으로 업그레이드하는 작업을 통과시키고 "이 모델이 못 하는 작업을 찾는 게 도전"이라고 평가했습니다.

기업 쪽 사례도 발표문에 실렸습니다. Stripe는 5,000만 라인 Ruby 코드베이스의 전면 마이그레이션을 Fable 5로 하루 만에 끝냈는데, 팀 하나가 손으로 했다면 2개월 이상 걸렸을 작업이라고 보고했습니다.

코딩 밖에서도 신호가 있습니다. Opus 4.7 때 가장 큰 퇴보로 지적됐던 영역이 글쓰기인데, 이번에는 회복이 뚜렷합니다.

HN 사용자 jorl17은 자작시 800편 이상(약 70%가 포르투갈어, 25만 토큰 규모)을 통째로 넣고 작가와 작품 세계를 분석시키는 개인 벤치마크를 모델 출시 때마다 돌립니다. Opus 4.7과 4.8에 대해서는 문장이 GPT 계열처럼 변하고 따라 읽기 어려워졌다고 평가했는데, Fable 5에는 **Opus 4.6이 16/20이면 이건 17.5/20**이라는 점수를 매겼습니다. 종전 최고였던 Opus 4.6을 넘어선 것입니다.

## "6월 22일까지만 제공" 구독 컷오프

여기까지만 보면 무난한 출시 같지만, 발표문에는 낯선 문장이 하나 있었습니다.

> "On June 23, we'll remove Fable 5 from those plans. Using it after that will require usage credits." (Anthropic 공식 발표)

Pro, Max, Team, 시트형 Enterprise 구독 플랜에서 Fable 5를 추가 비용 없이 쓸 수 있는 건 **6월 9일부터 22일까지 2주뿐**이고, 23일부터는 구독료와 별도로 사용량 크레딧이 필요합니다. Anthropic은 용량이 확보되는 대로 포함 기간을 연장하고 최종적으로는 구독 플랜의 기본 구성으로 되돌리는 것이 목표라고 덧붙였지만, 시점은 명시하지 않았습니다.

커뮤니티 반응은 출시 호평과는 완전히 분리됐습니다. "bait-and-switch"라는 말이 곧바로 나왔고, 회사가 미리 고지했으니 속인 건 아니라는 반론이 붙으면서도 불만 자체는 가라앉지 않았습니다. Wharton의 Ethan Mollick도 비판에 가세했습니다.

> "The fact that Anthropic may take away subscription access to Fable in two weeks is weird & discourages investing in learning about the model."

모델을 충분히 익혀 워크플로우에 통합할 즈음 사라진다는 점이 핵심 불만입니다. 구독으로 이것저것 실험해 보는 과정이 곧 그 모델의 쓸모를 알아내는 과정인데, 그 창이 2주라면 배우는 일 자체가 손해가 됩니다. 최고 성능 모델이 구독이 아니라 추가 과금 뒤로 들어가는 선례가 생겼다는 점이 더 크게 받아들여졌습니다.

## 분류기가 너무 자주 울린다

두 번째 논란은 안전 분류기의 오발입니다. 설계상 사이버보안, 생물/화학, 증류 관련 요청만 폴백이나 거부 대상이 되어야 하는데, 실제 발동 범위가 그보다 훨씬 넓다는 보고가 출시 직후부터 이어졌습니다.

출시 전 테스트에 참여했던 한 사용자는 분류기가 "지나치게 공격적이고 예민하며, 보안과 무관한 아주 평범한 코딩 작업에서도 발동한다"고 적었습니다. Simon Willison도 가드레일이 자주 걸리는 탓에 Claude API에 걸림 여부를 알려주는 새 메커니즘과 자동 폴백 옵션이 추가됐다고 짚었습니다. 앞서 본 Terminal-Bench의 20.9%, Artificial Analysis가 관측한 8% 안팎도 같은 현상을 다른 각도에서 잰 값입니다.

여기에는 구조적으로 이상한 데가 있습니다. 위험해서 Fable 5가 거절한 요청을, 결국 Opus 4.8이 받아서 처리합니다. 한 세대 전에는 "너무 위험하다"던 모델이 다음 세대에서는 안전한 대피처가 되는 셈입니다. 그렇다면 이 장치가 막고 있는 것이 실제 위험인지, 아니면 최신 모델의 능력 자체인지가 불분명해집니다.

출시를 극찬한 Karpathy조차 세이프가드가 "a little too trigger happy for launch"라고 인정했습니다. 공식 수치(세션의 95% 이상 무폴백)와 체감의 거리가 있는 만큼, 바이오나 보안 인접 도메인에서 일한다면 당분간 Opus 4.8이 현실적인 선택으로 보입니다.

## 보이지 않는 성능 제한과 하루 만의 철회

가장 격렬한 논쟁은 시스템 카드의 한 문장에서 시작됐습니다.

> "Unlike our interventions for cybersecurity, biology and chemistry, and distillation attempts, these safeguards will not be visible to the user." (Fable 5 시스템 카드)

프런티어 LLM 개발로 판정된 요청, 그러니까 사전학습 파이프라인이나 분산 학습 인프라, ML 가속기 설계 같은 작업에는 폴백이나 거부 같은 가시적 조치를 쓰지 않겠다는 뜻입니다. 대신 프롬프트 변조, 모델 내부 표현을 조작하는 steering vector, 파라미터 효율 미세조정(PEFT)으로 **사용자에게 알리지 않고 출력 품질을 낮추겠다**고 적었습니다. 영향 범위는 전체 트래픽의 약 0.03%, 조직 기준 0.1% 미만으로 추산했지만, 거부가 아니라 조용한 품질 저하라는 방식 자체가 신뢰 문제로 번졌습니다.

Interconnects의 Nathan Lambert는 "사용자에게 알리지 않고 자동으로 덜 똑똑해지는 AI 모델은 범주적으로 misaligned AI"라며, 이 장치가 안전보다는 경쟁 지위 유지에 가깝다고 지적했습니다. fast.ai의 Jeremy Howard의 비판은 대칭성을 겨냥했습니다. 현재 선두인 Anthropic은 자사 최고 모델을 프런티어 AI 연구에 그대로 쓰면서 남에게만 그 길을 막는다는 것입니다.

**그리고 Anthropic은 하루 만에 이 정책을 철회했습니다.** 6월 10일, 회사는 프런티어 LLM 개발 관련 안전장치를 눈에 보이게 바꾸겠다고 발표했습니다.

> "We made the wrong tradeoff, and we apologize for not getting the balance right." (Anthropic)

철회 이후로는 플래그된 요청도 사이버나 바이오와 동일하게 가시적인 Opus 4.8 폴백으로 처리됩니다. 조용한 품질 저하라는 방식 자체가 사라진 것입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 372" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="철회 전에는 프런티어 LLM 개발 요청의 출력 품질을 고지 없이 낮췄고, 철회 후에는 Opus 4.8 폴백을 응답에 표시하도록 바뀐 비교">
<style>
.fb3-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.fb3-h { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.fb3-l { fill: var(--text, #1c1917); font-size: 15px; }
.fb3-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.fb3-good { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.fb3-xm { stroke: var(--text-danger, #cb2121); stroke-width: 2.5; fill: none; stroke-linecap: round; }
.fb3-ck { stroke: var(--text-success, #107836); stroke-width: 2.5; fill: none; stroke-linecap: round; }
.fb3-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#fb3Arrow); }
</style>
<defs>
<marker id="fb3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="fb3-t" x="200" y="24" text-anchor="middle">프런티어 LLM 개발 판정 시</text>
<!-- 철회 전 -->
<rect class="fb3-bad" x="20" y="38" width="360" height="128" rx="8"/>
<path class="fb3-xm" d="M40 58 L54 72 M54 58 L40 72"/>
<text class="fb3-h" x="66" y="70">철회 전</text>
<text class="fb3-l" x="40" y="99">프롬프트 변조 · steering vector</text>
<text class="fb3-l" x="40" y="123">출력 품질 저하</text>
<text class="fb3-l" x="40" y="151">사용자 고지 없음</text>
<path class="fb3-a" d="M200 168 L200 194"/>
<!-- 철회 후 -->
<rect class="fb3-good" x="20" y="198" width="360" height="128" rx="8"/>
<path class="fb3-ck" d="M40 218 L48 228 L62 210"/>
<text class="fb3-h" x="72" y="228">철회 후</text>
<text class="fb3-l" x="40" y="259">Opus 4.8로 폴백</text>
<text class="fb3-l" x="40" y="283">출력 품질 조작 없음</text>
<text class="fb3-l" x="40" y="311">응답에 폴백 사실 표시</text>
<text class="fb3-l" x="200" y="352" text-anchor="middle">사이버 · 바이오와 동일한 처리</text>
</svg>
</div>

논란은 이틀 만에 종결됐지만, 프런티어 랩이 그런 장치를 설계할 수 있고 실제로 배포 직전까지 갔다는 사실 자체는 남았습니다.

## 2배 가격은 합리적인가

토큰 단가는 입력 \$10, 출력 \$50입니다. Opus 4.8(\$5 / \$25)의 정확히 2배입니다. 그런데 이 2배를 받아들이는 온도가 사용자 그룹에 따라 갈렸습니다.

**API 쪽은 의외로 호의적입니다.** 출시 전 테스트에 참여한 dannyw의 보고가 근거로 자주 인용됐습니다. 일부 내부 에이전트 하네스에서 절반 정도의 토큰으로 더 나은 결과를 냈고, 그래서 실효 비용이 Opus 4.8과 비슷해졌다는 것입니다. 그는 실질 인상폭이 2배보다 작으며 격차는 Opus 4.8이 헤매는 어려운 문제에서 가장 크게 벌어진다고 덧붙였습니다. 다만 이는 한 사람의 측정이고, 적응형 씽킹 때문에 출력 토큰이 오히려 늘어나는 워크로드도 있습니다. 자기 트래픽에서 토큰당 작업량을 직접 재보는 것 말고는 답이 없습니다.

**구독 쪽은 정반대입니다.** 구독 포함 기간인데도 사용량 가중치가 붙으면서 한도가 순식간에 증발한다는 보고가 이어졌습니다.

- "최고 씽킹 설정으로 8분 만에 5시간 윈도를 다 썼고, 알아채기 전에 초과 사용료 \$15가 나갔다" (joshstrange, HN)
- "\$133 크레딧이 27분 만에 사라졌다" (thomas_witt, HN)

속도도 약점입니다. Artificial Analysis 측정에서 출력 속도는 프로바이더에 따라 60~73 tok/s, 종합 66.8 tok/s입니다. 최대 effort에서는 첫 토큰까지 100초를 넘게 기다려야 하는데, 네트워크 지연이 아니라 적응형 씽킹이 앞단에서 생각하는 시간입니다. 빠른 반복 작업에는 맞지 않습니다.

## 그래서 언제 Fable 5를 써야 할까

벤치마크와 실사용 보고를 겹쳐 놓으면 답은 **하이브리드 라우팅**으로 모입니다. 어려운 프런티어급 작업에만 Fable 5를 쓰고 나머지는 Opus 4.8이나 Sonnet으로 넘기면, 2배보다 훨씬 적은 비용으로 이득의 대부분을 가져갈 수 있습니다. 일상 작업 대부분에는 과한 모델입니다.

| 상황 | 권장 |
|------|------|
| 장시간 에이전틱 코딩, 대규모 리팩토링 | **Fable 5** (예: Stripe의 5,000만 라인 마이그레이션) |
| 다른 모델이 막힌 디버깅, 어려운 리서치 | **Fable 5** |
| 장문 분석, 구조적 문서 작업 | **Fable 5** |
| 일상 코딩, 빠른 반복 작업 | Opus 4.8 / Sonnet (Fable은 첫 토큰까지 100초 이상) |
| 바이오/의료/보안 인접 도메인 | Opus 4.8 (분류기 오발로 폴백 빈발) |
| 비용 민감한 대량 처리 | Sonnet |

## 마치며

Opus 4.7 글을 쓸 때는 벤치마크와 체감의 괴리가 주제였는데, 이번에는 반대로 성능 자체를 의심하는 목소리가 드물었습니다. 대신 접근 조건이 논쟁의 중심이 됐습니다. 모델은 최고 수준인데 2주 뒤에 구독에서 사라지고, 제한 없는 버전은 승인받은 일부 조직만 쓸 수 있으며, 일부 작업의 성능은 사용자 모르게 제한하겠다고 했다가 하루 만에 철회했습니다. 경쟁의 축이 모델 능력에서 접근성과 신뢰의 문제로 옮겨가고 있다는 신호로 읽힙니다.

Mythos와 Fable로 모델을 이원화한 방식은 이번 출시가 남긴 가장 큰 구조적 변화입니다. 같은 모델을 안전 장치 유무로 갈라 한쪽은 승인 고객에게만, 다른 한쪽은 분류기를 얹어 일반에 파는 형태는 앞으로 나올 프런티어 모델에도 그대로 쓸 수 있는 틀입니다. 그 틀 안에서 무엇이 어디까지 제한되는지를 회사가 정한다면, 사용자가 확인할 수 있는 건 결국 그 회사가 공개하기로 한 만큼입니다.

:::info

**후속 (2026년 6월 13일)**

이 글을 쓴 직후, 미국 정부가 수출통제를 발동해 Fable 5와 Mythos 5를 전 세계에서 차단하는 사건이 벌어졌습니다. 출시 사흘 만의 일입니다.

:::

## 함께 보면 좋은 글

- [Claude Fable 5, 출시 3일 만에 차단됐다고?](/issue/fable-5-ban/) : 수출통제로 두 모델이 꺼진 사건과 그 이후
- [Claude Opus 4.7의 성능은 왜 논란이 되고 있을까?](/issue/opus-4-7/) : 벤치마크와 체감이 어긋났던 직전 세대
- [Claude Opus 5 출시, 가격 그대로 성능은 Fable 5급?](/issue/opus-5/) : Fable 5급 성능이 일반 가격대로 내려온 뒤

## 참고자료

- [Anthropic 공식 발표: Introducing Claude Fable 5 and Claude Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [Claude Mythos 5 & Fable 5 System Card (PDF)](https://www-cdn.anthropic.com/d00db56fa754a1b115b6dd7cb2e3c342ee809620.pdf)
- [Fortune: Anthropic walks back Fable 5 capability limits](https://fortune.com/2026/06/10/anthropic-accu-claude-fable-5-limits-capabilities-ai-researchers-developers/)
- [Hacker News: Claude Fable 5 메인 스레드](https://news.ycombinator.com/item?id=48463808)
- [Simon Willison: Claude Fable 5 리뷰](https://simonwillison.net/2026/Jun/9/claude-fable-5/)
- [Artificial Analysis: Fable 5 Intelligence Index 분석](https://artificialanalysis.ai/articles/claude-fable-5-mythos-intelligence-index)
- [Interconnects (Nathan Lambert): Claude Fable 5 and the New AI Safety](https://www.interconnects.ai/p/claude-fable-5-and-new-ai-safety)
