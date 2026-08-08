---
date: '2026-04-01'
title: 'Claude Code 소스코드 51만줄 유출, 그 안에서 나온 7가지'
category: 'Issue'
tags: ['Claude Code', 'Anthropic', 'Source Code Leak', 'AI Agent', 'Anti-Distillation']
summary: 'npm에 소스맵이 딸려 나가며 공개된 Claude Code 51만 줄. 안티 디스틸레이션부터 미공개 데몬 모드 KAIROS까지 확인된 것만 정리했습니다.'
thumbnail: './thumbnail.png'
---

2026년 3월 31일 새벽, 보안 연구자 Chaofan Shou가 X에 올린 글로 유출 사실이 알려졌습니다.

Anthropic이 `@anthropic-ai/claude-code` v2.1.88을 npm에 배포하면서 59.8MB짜리 소스맵 `cli.js.map`을 함께 올린 겁니다. 소스맵은 번들된 코드를 원본 위치로 되돌리기 위한 파일이라, 그 안에는 난독화되지 않은 TypeScript 원본이 그대로 들어 있습니다. 파일 1,900개 규모, 51만 줄이 넘는 코드가 공개 레지스트리 위에 올라갔습니다.

문제의 버전은 곧 내려갔습니다. npm 레지스트리에는 2.1.87 다음 버전이 2.1.89로 남아 있고, 2.1.88은 목록에서 사라졌습니다. 하지만 그사이 유출 코드를 바탕으로 한 클린룸 파이썬 재작성판 `instructkr/claw-code`가 올라왔고 미러도 여러 곳에 생겼습니다. 회수는 이미 불가능해진 상태였습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="TypeScript 원본이 Bun 번들을 거쳐 cli.js와 소스맵으로 나뉘고 소스맵이 그대로 npm에 배포되어 원본이 복원된 경로">
<style>
.lk-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.lk-l { fill: var(--text, #1c1917); font-size: 14px; }
.lk-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.lk-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.lk-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.lk-hot { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.lk-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#lkArrow); }
</style>
<defs>
<marker id="lkArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="lk-t" x="200" y="22" text-anchor="middle">소스맵이 실려 나간 경로</text>
<rect class="lk-box" x="20" y="38" width="360" height="46" rx="6"/>
<text class="lk-l" x="36" y="60">TypeScript 원본</text>
<text class="lk-n" x="36" y="78">파일 1,900개 · 51만 줄</text>
<path class="lk-a" d="M200 84 L200 98"/>
<rect class="lk-box" x="20" y="100" width="360" height="46" rx="6"/>
<text class="lk-l" x="36" y="122">Bun 번들 산출물</text>
<text class="lk-n" x="36" y="140">cli.js · cli.js.map 59.8MB</text>
<path class="lk-a" d="M110 146 L110 176"/>
<text class="lk-n" x="126" y="167">.npmignore에 *.map 없음</text>
<rect class="lk-hot" x="20" y="178" width="360" height="46" rx="6"/>
<text class="lk-l" x="36" y="200">npm v2.1.88 배포</text>
<text class="lk-d" x="36" y="218">소스맵 동봉</text>
<path class="lk-a" d="M200 224 L200 238"/>
<rect class="lk-box" x="20" y="240" width="360" height="46" rx="6"/>
<text class="lk-l" x="200" y="269" text-anchor="middle">난독화 없는 원본 복원</text>
</svg>
</div>

## 소스맵 한 줄이 빠진 자리

직접적인 원인은 `.npmignore`에 `*.map`을 제외하는 설정이 없었다는 것입니다. 배포 파이프라인 어디에도 번들 산출물에서 소스맵을 걸러내는 단계가 없었습니다.

그 위에 번들러 쪽 문제가 겹칩니다. Bun에는 프로덕션 모드로 설정해도 소스맵이 그대로 생성돼 나간다는 이슈(`oven-sh/bun#28001`)가 3월 11일에 등록돼 있었고, 사고 시점까지 열려 있었습니다. Anthropic은 2025년 말 Bun을 인수했습니다. 자사가 인수한 런타임의 기본 동작이 자사 소스코드를 밖으로 내보낸 셈입니다.

Anthropic의 공식 입장은 이렇습니다.

> "No sensitive customer data or credentials were involved or exposed. This was a release packaging issue caused by human error, not a security breach."

고객 데이터와 인증 정보, 모델 가중치는 노출되지 않았습니다. 다만 코드에 담긴 설계 판단과 미공개 기능은 이미 공개된 뒤였습니다.

:::warning

**처음이 아닙니다**

2025년 2월 24일 Claude Code 출시 당일에도 같은 npm 패키지에 인라인 소스맵이 들어갔고, 그 안의 URL이 인증 없이 열리는 스토리지의 원본 아카이브를 가리켰습니다. 이번 사고 닷새 전인 3월 26일에는 CMS 설정 오류로 내부 문서 3,000건가량이 노출되면서 미공개 모델 "Mythos"의 존재가 드러났습니다.

:::

사후 대응도 논란이 됐습니다. Anthropic 법무팀은 fork까지 일괄로 묶어 DMCA 통지를 보냈고, 그 여파로 8,100개 레포지토리가 GitHub에서 내려갔습니다. 이후 대부분을 철회하고 1개 레포와 96개 fork로 범위를 좁혔으며, GitHub는 나머지를 복구했습니다. 한 번 퍼진 코드를 법적 절차로 되돌리기가 얼마나 어려운지를 보여준 장면입니다.

## 안티 디스틸레이션, 가짜 도구로 학습을 오염시키기

가장 먼저 눈에 띈 것은 `claude.ts`의 `ANTI_DISTILLATION_CC` 플래그입니다. 이 플래그가 켜지면 API 요청 본문에 `anti_distillation: ['fake_tools']`가 붙고, 서버는 이 신호를 받아 시스템 프롬프트에 실제로는 존재하지 않는 디코이 도구 정의를 끼워 넣습니다.

상시 동작하는 기능은 아닙니다. GrowthBook 원격 플래그(`tengu_anti_distill_fake_tool_injection`) 뒤에 있고, 1st-party CLI 세션에만 적용됩니다.

노림수는 분명합니다. 경쟁사가 API 트래픽을 캡처해 자사 모델을 훈련시키는 시나리오를 겨냥한 겁니다. 가짜 도구가 섞인 데이터로 학습하면 존재하지 않는 도구를 호출하려는 오동작이 남습니다. 학습 데이터 자체를 오염시켜 증류(distillation)를 방해하는 방식입니다.

두 번째 겹은 `betas.ts`에 있습니다. 도구 호출 사이에 오가는 어시스턴트 텍스트를 서버가 버퍼링해 요약본으로 대체하고, 서명을 붙여 다음 턴에 원문을 복원합니다. 중간 텍스트를 그대로 캡처해도 학습에 쓸 만한 원문이 남지 않습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="가짜 도구 주입과 도구 호출 사이 텍스트 요약이라는 두 겹의 방어를 거쳐 캡처된 트래픽에 학습용 원문이 남지 않는 구조">
<style>
.ad-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.ad-l { fill: var(--text, #1c1917); font-size: 14px; }
.ad-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ad-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.ad-out { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.ad-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#adArrow); }
</style>
<defs>
<marker id="adArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="ad-t" x="200" y="22" text-anchor="middle">안티 디스틸레이션 두 겹</text>
<rect class="ad-box" x="20" y="38" width="360" height="66" rx="6"/>
<text class="ad-l" x="36" y="60">1겹 · 가짜 도구 주입</text>
<text class="ad-n" x="36" y="80">요청 필드 anti_distillation</text>
<text class="ad-n" x="36" y="98">서버가 디코이 도구 정의 추가</text>
<path class="ad-a" d="M200 104 L200 118"/>
<rect class="ad-box" x="20" y="120" width="360" height="66" rx="6"/>
<text class="ad-l" x="36" y="142">2겹 · 도구 사이 텍스트 요약</text>
<text class="ad-n" x="36" y="162">원문 대신 요약본 전송</text>
<text class="ad-n" x="36" y="180">서명으로 다음 턴에 복원</text>
<path class="ad-a" d="M200 186 L200 200"/>
<rect class="ad-out" x="20" y="202" width="360" height="56" rx="6"/>
<text class="ad-l" x="200" y="226" text-anchor="middle">캡처한 트래픽</text>
<text class="ad-n" x="200" y="246" text-anchor="middle">학습용 원문 부족</text>
<text class="ad-n" x="200" y="282" text-anchor="middle">1st-party CLI 세션 한정</text>
</svg>
</div>

:::info

**클라이언트 사이드 방어의 한계**

우회법은 유출 직후 곧바로 공유됐습니다. 환경 변수 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`를 설정하거나 프록시에서 `anti_distillation` 필드를 지우면 그만입니다. 방어 로직이 클라이언트에 있는 이상 우회 비용은 낮을 수밖에 없습니다.

:::

## Undercover Mode, 사내 빌드에만 있던 위장 모드

가장 큰 논란을 부른 것은 90줄 남짓한 `undercover.ts`입니다.

적용 범위부터 짚어야 합니다. 이 모듈은 외부 배포 빌드에서 죽은 코드 제거로 빈 함수가 되어 사라집니다. 일반 사용자가 설치하는 Claude Code에는 존재하지 않는 기능이라는 뜻입니다. Anthropic 직원 계정(`USER_TYPE === 'ant'`)에서만 의미를 갖습니다.

동작은 내부 흔적을 지우는 쪽입니다. 내부 코드명("Capybara", "Tengu" 등)과 내부 Slack 채널 참조를 언급하지 않고, 커밋의 `Co-Authored-By` 표기를 떼고, 스스로를 Claude Code나 AI로 밝히지 않도록 지시합니다.

소스에는 이런 주석이 달려 있습니다.

> "There is NO force-OFF. This guards against model codename leaks."

강제로 켜는 환경 변수(`CLAUDE_CODE_UNDERCOVER=1`)는 있는데 강제로 끄는 스위치는 두지 않았고, 그 이유를 모델 코드명 유출 방지로 적어 둔 겁니다.

그럼에도 논란이 남는 이유는 지시 항목 중 하나 때문입니다. 내부 코드명이나 Slack 채널을 감추는 것은 보안 목적이 분명합니다. 반면 AI가 작성했다는 사실 자체를 밝히지 말라는 지시는 성격이 다릅니다. 오픈소스 기여에서 AI 투명성이 계속 쟁점이 되는 상황에서, AI 안전을 표방하는 기업의 사내 도구에 그 지시가 들어 있었다는 점이 반향을 일으켰습니다.

## Native Client Attestation, API 요청에 붙는 서명

API 요청이 공식 클라이언트에서 나왔는지 확인하는 네이티브 수준의 검증도 발견됐습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="자바스크립트가 넣은 자리표시자를 Zig 네이티브 계층이 실제 해시로 바꾸고 서버가 검증하는 3단 구조">
<style>
.at-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.at-l { fill: var(--text, #1c1917); font-size: 14px; }
.at-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.at-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.at-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.at-key { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.at-srv { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.at-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#atArrow); }
</style>
<defs>
<marker id="atArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="at-t" x="200" y="22" text-anchor="middle">cch 헤더가 채워지는 지점</text>
<rect class="at-box" x="20" y="38" width="360" height="56" rx="6"/>
<text class="at-l" x="36" y="62">JavaScript 런타임</text>
<text class="at-n" x="36" y="82">headers['cch'] = '00000'</text>
<path class="at-a" d="M200 94 L200 108"/>
<rect class="at-key" x="20" y="110" width="360" height="56" rx="6"/>
<text class="at-l" x="36" y="134">네이티브 HTTP 스택 (Zig)</text>
<text class="at-n" x="36" y="154">자리표시자 → 실제 해시</text>
<path class="at-a" d="M200 166 L200 180"/>
<rect class="at-srv" x="20" y="182" width="360" height="56" rx="6"/>
<text class="at-w" x="36" y="206">Anthropic API 서버</text>
<text class="at-w" x="36" y="226">해시 검증</text>
<text class="at-n" x="200" y="266" text-anchor="middle">JS 계층에서 해시 계산 접근 불가</text>
</svg>
</div>

JavaScript 레벨에서는 `cch=00000`이라는 0으로 채워진 자리표시자만 헤더에 넣습니다. Zig로 작성된 Bun의 네이티브 HTTP 스택이 전송 직전에 이를 가로채, JavaScript가 닿을 수 없는 레벨에서 계산한 해시로 0들을 덮어씁니다. 서버 쪽 `_parse_cc_header`가 이 값을 검증해 공식 바이너리에서 온 요청인지 판별합니다.

사실상 API 접근에 건 DRM입니다. 해시 계산 로직이 JavaScript에서 보이지 않으니 비공식 클라이언트가 유효한 요청을 만들어 내기 어렵습니다. 다만 기능 자체가 컴파일 타임 플래그(`NATIVE_CLIENT_ATTESTATION`) 뒤에 있고 `CLAUDE_CODE_ATTRIBUTION_HEADER`로 끌 수 있어서, 강제력보다는 식별 수단에 가깝게 배치돼 있습니다.

## Frustration Detection, LLM 회사가 정규식을 쓴 이유

`userPromptKeywords.ts`에는 사용자의 짜증을 감지하는 로직이 들어 있습니다. 추론 기반 감성 분석이 아니라 `(wtf|wth|ffs|omfg|shit...)` 같은 키워드를 훑는 정규식입니다.

LLM을 만드는 회사가 정규식을 쓴다는 게 어색해 보이지만 계산은 맞습니다. 감성 분석을 모델에 맡기면 정확도는 올라가지만 메시지마다 수백ms의 지연과 API 호출 비용이 붙습니다. 정규식은 뉘앙스를 놓치는 대신 1ms 안에 끝나고 비용은 사실상 0입니다.

잡아내려는 대상이 "사용자가 대놓고 짜증을 표현한 상황"으로 좁다면 후자가 낫습니다. 감지 결과는 모델이 더 신중하게 응답하도록 행동을 조정하는 데 쓰입니다.

## KAIROS, 백그라운드에서 도는 에이전트

유출된 44개 컴파일 타임 피처 플래그 중 가장 주목받은 것은 **KAIROS**입니다. 그리스어로 "적절한 때"를 뜻하는 이 플래그는 소스 전체에서 150회 넘게 참조되며, Claude Code를 상시 실행되는 백그라운드 데몬으로 바꿉니다.

확인된 구성 요소는 이렇습니다.

| 기능 | 설명 |
|------|------|
| 백그라운드 데몬 | 사용자 명령 없이 도는 워커 프로세스 |
| 5분 크론 갱신 | 주기적인 프로젝트 상태 확인 |
| GitHub 웹훅 구독 | PR, 이슈 이벤트에 자동 반응 |
| `/dream` 스킬 | 유휴 시간의 메모리 정제 |

`/dream`은 하루 동안 쌓인 관찰을 통합하고 모순을 걸러 장기 메모리로 옮기는 기능입니다. 야간 메모리 증류(nightly memory distillation)라는 이름 그대로입니다.

구현은 미완성 상태입니다. 그래도 방향은 분명합니다. 요청할 때만 응답하는 도구에서, 프로젝트를 계속 관찰하며 먼저 움직이는 쪽으로 넘어가려는 설계입니다.

## BUDDY, 터미널 속 타마고치

`BUDDY` 플래그는 성격이 전혀 다릅니다. 터미널 펫 시스템입니다.

| 속성 | 내용 |
|------|------|
| 종 수 | 18종 |
| 레어리티 | Common에서 Legendary까지 |
| Shiny 확률 | 1% |
| 크리처 배정 | 사용자 ID 기반 결정론적 (Mulberry32 PRNG) |

사용자 ID를 시드로 쓰기 때문에 같은 사용자는 언제 실행해도 같은 펫을 받습니다. 종 이름은 문자 코드로 인코딩해 두었습니다. 빌드 산출물을 문자열로 훑는 검사에 걸리지 않게 하려는 장치로 보입니다.

:::tip

**장난처럼 보이지만**

이런 요소는 도구에 대한 애착과 사용 지속률에 실질적인 영향을 미칩니다. GitHub의 contribution graph, Duolingo의 연속 학습 기록과 같은 계열입니다.

:::

## 25만 API 호출의 조용한 낭비

`autoCompact.ts` 주석에는 이런 기록이 남아 있습니다.

```typescript
// 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally
```

Claude Code는 대화가 길어지면 이전 메시지를 자동으로 압축합니다. 그런데 1,279개 세션에서 압축이 50회 이상 연속으로 실패하고 있었고, 한 세션에서 3,272회까지 연속 실패한 사례도 있었습니다. 전 세계 합계로 하루 25만 건의 API 호출이 이 실패 루프에서 사라졌습니다.

방치되고 있던 것은 아닙니다. 같은 파일에 연속 실패 3회로 압축을 멈추는 상한(`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`)이 이미 들어가 있습니다. 문제를 인지하고 대응이 진행 중이던 상태로 읽힙니다. 규모가 커진 AI 제품에서 이런 조용한 비효율이 어떻게 쌓이는지, 그리고 그것을 발견하려면 어떤 계측이 필요한지를 함께 보여주는 사례입니다.

## 마치며

`.npmignore` 한 줄이 빠진 자리에서 51만 줄이 새어 나갔습니다. 그 안에는 경쟁사를 겨냥한 방어(안티 디스틸레이션), 논란이 될 수밖에 없는 결정(Undercover Mode), 계산이 맞는 타협(정규식 짜증 감지), 아직 나오지 않은 제품 방향(KAIROS), 그리고 어디에나 있는 현실적 문제(25만 API 낭비)가 함께 들어 있었습니다.

이 사건에서 배울 것을 하나만 고르라면 유출 경로 자체입니다. 소스코드를 지킨다는 것은 저장소 권한을 관리하는 일만이 아니라, 빌드 산출물에 무엇이 딸려 나가는지를 매 배포마다 확인하는 일이기도 합니다. 소스맵은 디버깅을 위해 원본을 되돌리도록 만들어진 파일이고, 그 목적 그대로 동작했을 뿐입니다.

## 함께 보면 좋은 글

- [유출된 Claude Code 소스로 본 프로덕션 AI 에이전트 설계](/issue/claude-code-architecture/) : 같은 코드에서 드러난 도구 게이팅, 권한 판정, 캐시 경계
- [AI Agent의 구조](/agent/what-is-ai-agent/) : 모델, 도구, 루프가 어떻게 하나의 시스템이 되는지
- [AI Agent의 퍼미션 시스템](/agent/agent-permission-safety/) : 도구 실행 전에 거치는 판단 단계

## 참고자료

- [Alex Kim: The Claude Code Source Leak](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- [Layer5: The Claude Code Source Leak, 512,000 Lines](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
- [Fortune: Anthropic's Second Major Security Lapse](https://fortune.com/2026/03/31/anthropic-source-code-claude-code-data-leak-second-security-lapse-days-after-accidentally-revealing-mythos/)
- [oven-sh/bun#28001](https://github.com/oven-sh/bun/issues/28001)
- [GeekNews: Claude Code 소스코드 유출](https://news.hada.io/topic?id=28074)
