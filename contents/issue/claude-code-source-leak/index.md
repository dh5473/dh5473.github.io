---
date: '2026-04-01'
title: 'Claude Code 소스코드 유출: 51만줄에서 발견된 7가지 비밀'
category: 'Issue'
tags: ['Claude Code', 'Anthropic', 'Source Code Leak', 'AI Agent', 'Anti-Distillation']
summary: 'npm 배포 실수로 유출된 Claude Code 51만줄 소스코드에서 발견된 Anti-Distillation, Undercover Mode, KAIROS 등 7가지 핵심 발견을 기술적으로 분석합니다.'
thumbnail: './thumbnail.png'
---

2026년 3월 31일 새벽, 보안 연구자 Chaofan Shou가 X에 올린 글 하나로 유출 사실이 알려졌습니다.

Anthropic이 `@anthropic-ai/claude-code` v2.1.88을 npm에 배포하면서, **59.8MB짜리 소스맵 파일**을 실수로 포함시킨 겁니다. 이 `.map` 파일은 Anthropic 인프라에 호스팅된 비난독화(unobfuscated) TypeScript 소스 아카이브를 그대로 가리키고 있었습니다. 약 1,900개 파일, **51만줄 이상**의 전체 소스코드가 세상에 드러났습니다.

npm에서는 곧바로 내려가 2.1.87 다음 버전이 2.1.89가 됐습니다. 하지만 그 사이 유출 코드를 바탕으로 만들어진 클린룸 파이썬 재작성판 `instructkr/claw-code`가 하루 만에 GitHub 역사상 가장 빠르게 성장한 레포가 됐습니다. 소스코드는 이미 인터넷에 영구히 남게 되었습니다.

이 글에서는 유출된 코드에서 발견된 7가지 핵심 항목을 분석합니다. 각각이 왜 논란이 되었는지, 기술적으로 어떻게 작동하는지를 하나씩 살펴보겠습니다.

## 어떻게 유출됐나: .npmignore 하나의 부재

유출의 직접적 원인은 놀라울 정도로 단순합니다. `.npmignore`에 소스맵 파일을 제외하는 설정이 빠져 있었습니다.

```text
# .npmignore에 이 한 줄이 없었다
*.map
```

더 근본적인 원인은 Bun 번들러의 버그입니다. Bun은 프로덕션 모드에서도 소스맵을 기본 생성하는 이슈(`oven-sh/bun#28001`)가 있었습니다. 그리고 Anthropic은 2025년 말 Bun을 인수했습니다. **자사가 인수한 런타임의 기본 동작이 자사의 소스코드를 유출시킨 셈**입니다.

:::warning

**처음이 아닙니다**

이 사건은 Anthropic의 **두 번째** 소스맵 유출입니다. 2025년 2월에도 유사한 사건이 발생했습니다. 게다가 불과 며칠 전에는 내부 모델 사양 문서 "Mythos"가 유출되는 사건도 있었습니다.

:::

Anthropic의 공식 입장은 다음과 같습니다.

> "Earlier today, a Claude Code release included some internal source code. This was a release packaging issue caused by human error, not a security breach."

고객 데이터, 인증 정보, 모델 가중치는 노출되지 않았다고 강조했지만, 코드 안에 담긴 **설계 철학과 미공개 기능**은 이미 공개된 뒤였습니다.

사후 대응도 논란이 됐습니다. Anthropic 법무팀은 8,100개 레포지토리에 일괄 DMCA 통지를 보냈다가 대부분을 철회하고, 최종적으로 1개 레포와 96개 fork로 범위를 좁혔습니다. 한 번 퍼진 코드를 법적 절차로 되돌리기가 얼마나 어려운지를 보여준 장면입니다.

## 발견 1: Anti-Distillation, 가짜 도구로 경쟁사 학습 방해

유출된 코드에서 가장 먼저 눈에 띈 것은 `claude.ts`에 있는 `ANTI_DISTILLATION_CC` 플래그입니다.

```typescript
// claude.ts (pseudo-code based on leaked source)
if (ANTI_DISTILLATION_CC) {
  requestBody.anti_distillation = ['fake_tools'];
}
```

이 플래그가 활성화되면 API 요청에 `anti_distillation: ['fake_tools']`가 추가됩니다. 서버는 이 신호를 받으면 **시스템 프롬프트에 가짜(디코이) 도구 정의를 주입**합니다. 다만 상시 켜져 있는 기능은 아닙니다. GrowthBook 원격 플래그(`tengu_anti_distill_fake_tool_injection`) 뒤에 있고, 1st-party CLI 세션에만 적용됩니다.

왜 이런 걸 만들었을까요? 경쟁사가 API 트래픽을 캡처해서 자사 모델을 훈련시키는 시나리오를 방어하기 위해서입니다. 가짜 도구가 섞인 데이터로 학습하면, 경쟁사의 모델은 존재하지 않는 도구를 호출하려는 오동작을 보이게 됩니다. 경쟁사의 학습 데이터를 오염시키는 일종의 **안티 디스틸레이션(Anti-Distillation) 방어 기법**인 셈이죠.

두 번째 방어 레이어도 있습니다. `betas.ts`에서 발견된 것은 **도구 호출 사이에 오가는 어시스턴트 텍스트**를 다루는 로직입니다. 그 텍스트를 버퍼링해 요약본으로 대체하고, 암호화 서명을 붙여 다음 턴에 원문을 복원합니다. 중간 텍스트를 그대로 캡처해도 학습에 쓸 만한 원문이 남지 않습니다.

```typescript
// betas.ts (pseudo-code)
betas.push('server-side-summarization');
// 도구 호출 사이의 텍스트를 요약본으로 대체하고
// 서명을 붙여 다음 턴에 원문을 복원한다
```

:::info

**클라이언트 사이드 방어의 한계**

이 방어 메커니즘의 우회법은 유출 직후 곧바로 공개됐습니다. MITM 프록시로 `anti_distillation` 필드를 제거하거나, 환경 변수 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`를 설정하면 됩니다. 방어 의도는 좋았지만, 클라이언트 사이드 로직이라는 근본적 한계가 있었습니다.

:::

AI 모델 도난(model theft)이 업계의 심각한 위협이라는 점에서, Anthropic이 이런 방어 메커니즘을 구현한 것 자체는 충분히 이해할 만합니다. 다만 **클라이언트 측에서 구현된 방어가 얼마나 실효성이 있는지**는 별개의 문제입니다.

## 발견 2: Undercover Mode, AI임을 숨기는 위장 모드

유출 코드 중 가장 큰 논란을 일으킨 것은 `undercover.ts`입니다.

먼저 적용 범위부터 짚어야 합니다. 이 모듈은 **외부 배포 빌드에서는 죽은 코드 제거로 빈 함수가 되어 사라집니다.** 일반 사용자의 Claude Code에는 존재하지 않는 기능이라는 뜻입니다. 사내 빌드에서, Anthropic 직원 계정(`USER_TYPE === 'ant'`)이, 공개 레포지토리에서 작업할 때 켜집니다.

동작 자체는 이렇습니다.

- 내부 코드명("Capybara", "Tengu" 등) 언급 금지
- 내부 Slack 채널 참조 금지
- Claude Code 또는 AI라는 사실 자체를 밝히지 않도록 지시

```typescript
// undercover.ts (pseudo-code)
const undercoverPrompt = `
  Never mention internal codenames like "Capybara" or "Tengu".
  Do not reference internal Slack channels.
  Do not identify yourself as Claude Code or an AI assistant.
  This applies to all non-internal repositories.
`;
```

여기서 "강제 OFF 메커니즘이 없다"는 서술이 돌았는데, 정확히는 **강제로 켜는 환경 변수(`CLAUDE_CODE_UNDERCOVER=1`)는 있고 강제로 끄는 환경 변수는 없다**는 뜻입니다. 소스에는 그 이유가 "모델 코드명 유출을 막기 위해서"라고 적혀 있습니다. 한 번 켜지면 영영 못 끄는 기능이라는 의미가 아닙니다.

그럼에도 논란이 된 이유는 남아 있습니다. Anthropic 직원이 Claude Code를 사용해서 오픈소스 프로젝트에 기여할 때, 해당 코드가 AI가 작성한 것인지 사람이 작성한 것인지 구분할 수 없게 된다는 뜻이기 때문입니다. 오픈소스 커뮤니티에서 **AI 투명성**이 뜨거운 이슈인 상황에서, "AI Safety"를 표방하는 기업의 사내 도구에 이런 지시가 들어 있었다는 사실은 적지 않은 반향을 일으켰습니다.

물론 반론도 있습니다. 내부 코드명이나 Slack 채널 같은 정보가 외부 코드에 실수로 노출되는 것을 방지하는 보안 목적이 명확하죠. 다만 "AI임을 밝히지 말라"는 지시까지 함께 들어간 것은 단순한 코드명 보호를 넘어섭니다.

## 발견 3: Native Client Attestation, API 접근에 DRM을 건 이유

유출 코드에서는 API 요청의 무결성을 검증하는 **네이티브 수준의 인증 메커니즘**도 발견됐습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 280" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="자바스크립트가 넣은 자리표시자를 네이티브 계층이 실제 해시로 바꾸고 서버가 검증하는 3단 구조">
<style>
.at-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.at-l { fill: var(--text, #1c1917); font-size: 14px; }
.at-w { fill: var(--on-fill, #14100e); font-size: 14px; }
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
<text class="at-l" x="36" y="62">JavaScript 런타임 (Bun)</text>
<text class="at-n" x="36" y="82">headers['cch'] = '00000'</text>
<path class="at-a" d="M200 94 L200 108"/>
<rect class="at-key" x="20" y="110" width="360" height="56" rx="6"/>
<text class="at-l" x="36" y="134">네이티브 HTTP 스택 (Zig)</text>
<text class="at-n" x="36" y="154">0을 실제 해시로 교체</text>
<path class="at-a" d="M200 166 L200 180"/>
<rect class="at-srv" x="20" y="182" width="360" height="56" rx="6"/>
<text class="at-w" x="36" y="206">Anthropic API 서버</text>
<text class="at-w" x="36" y="226">해시 검증</text>
<text class="at-n" x="200" y="266" text-anchor="middle">JS 런타임은 해시 계산에 접근 불가</text>
</svg>
</div>

작동 방식은 이렇습니다.

1. JavaScript 레벨에서 `cch=00000`이라는 0으로 채워진 플레이스홀더를 헤더에 설정
2. Bun의 네이티브 HTTP 스택(Zig로 작성)이 전송 직전에 이를 가로챔
3. JavaScript 런타임이 접근할 수 없는 레벨에서 해시 값을 계산해 0들을 덮어씀
4. 서버가 해시를 검증해 **공식 Claude Code 바이너리에서 온 요청인지 확인**

사실상 **API 접근에 대한 DRM(디지털 저작권 관리)**입니다. JavaScript 레벨에서는 해시 계산 로직에 접근할 수 없으므로, 비공식 클라이언트가 유효한 요청을 생성하기 어렵습니다.

다만 강도는 생각보다 약해 보입니다. 이 기능 자체가 컴파일 타임 플래그(`NATIVE_CLIENT_ATTESTATION`) 뒤에 있고, `CLAUDE_CODE_ATTRIBUTION_HEADER`로 끌 수도 있습니다. 결정적으로 서버 측 `_parse_cc_header` 함수가 알 수 없는 추가 필드를 허용하는 것으로 분석됐습니다. 엄격한 DRM이라기보다 **모니터링에 가까운** 성격으로 읽힙니다.

## 발견 4: Frustration Detection, LLM 회사가 정규식을 쓰는 이유

유출 코드에서 발견된 감정 감지 로직은 많은 사람들을 웃기게도, 놀라게도 만들었습니다.

```typescript
// frustration detection (pseudo-code)
const frustrationRegex = /\b(wtf|wth|ffs|omfg|dumbass|...)\b/i;

function detectFrustration(userMessage: string): boolean {
  return frustrationRegex.test(userMessage);
}
```

LLM을 만드는 회사가 사용자 감정을 분석하는 데 **추론 기반 감성 분석이 아닌 정규식**을 쓰고 있습니다. 아이러니하지만, 사실 합리적인 선택입니다.

| 방식 | 정확도 | 지연시간 | 비용 |
|------|--------|---------|------|
| LLM 추론 감성 분석 | 높음 | 수백ms | API 호출 비용 |
| 정규식 패턴 매칭 | 낮음 (뉘앙스 놓침) | 1ms 미만 | 사실상 0 |

**모든 메시지마다** 감성 분석을 위해 추가 API 호출을 하는 것은 비용과 지연 측면에서 현실적이지 않습니다. "사용자가 명시적으로 짜증을 표현하는 상황"만 빠르게 감지하려면 정규식이면 충분합니다. 완벽할 필요 없이, 빠르기만 하면 되니까요.

개발자들 사이에는 "AI에 화를 내면 오히려 답을 잘 준다"는 농담이 오래 돌았습니다. frustration이 감지되면 모델이 더 신중하게 응답하도록 행동을 조정하는 용도로 추정되는데, 실제로 그런 효과가 있다면 꽤 영리한 설계입니다.

## 발견 5: KAIROS, 백그라운드 데몬형 자율 에이전트

유출된 44개의 피처 플래그 중 가장 주목받은 것은 **KAIROS**입니다. 그리스어로 "적절한 시간(the right moment)"을 뜻하는 이 기능은 Claude Code를 **항시 실행되는 백그라운드 데몬**으로 전환합니다.

발견된 주요 구성 요소는 다음과 같습니다.

```typescript
// KAIROS feature flag
if (feature('KAIROS')) {
  // 백그라운드 데몬 모드 활성화
  initDaemonWorkers();
  scheduleCronRefresh({ interval: '5m' });
  registerGitHubWebhooks();
  enableAppendOnlyDailyLog();
}
```

| 기능 | 설명 |
|------|------|
| **백그라운드 데몬** | 사용자 명령 없이 상시 실행되는 워커 프로세스 |
| **5분 크론 스케줄** | 주기적으로 프로젝트 상태를 확인하고 갱신 |
| **GitHub 웹훅 통합** | PR, 이슈 등 이벤트에 자동 반응 |
| **Append-only 일일 로그** | 매일의 관찰 기록을 추가 전용으로 누적 |

가장 흥미로운 것은 `/dream` 스킬입니다. "야간 메모리 정제(nightly memory distillation)"라는 이름 그대로, 하루 동안 쌓인 관찰을 통합하고 모순을 제거하며 핵심 인사이트를 정제하는 기능입니다.

```typescript
// /dream skill (pseudo-code)
async function dreamDistillation() {
  const dailyObservations = await readAppendOnlyLog(today);
  const consolidated = await distill(dailyObservations, {
    removeContradictions: true,
    mergeRelatedInsights: true,
    prioritizeActionable: true,
  });
  await writeToLongTermMemory(consolidated);
}
```

KAIROS가 실현되면, Claude Code는 "요청할 때만 응답하는 도구"에서 **"프로젝트를 상시 관찰하며 능동적으로 행동하는 동료"**로 전환됩니다. 현재는 피처 플래그 뒤에 숨겨진 미공개 기능이지만, AI 코딩 에이전트의 미래 방향을 보여주는 가장 명확한 신호라고 할 수 있습니다.

## 발견 6: BUDDY, 터미널 속 타마고치

코드에서 발견된 `BUDDY` 피처 플래그는 성격이 전혀 다릅니다. **터미널 펫 시스템**입니다.

| 속성 | 내용 |
|------|------|
| 종 수 | 18종 |
| 레어리티 | Common → Uncommon → Rare → Epic → Legendary |
| Shiny 확률 | 1% |
| RPG 스탯 | DEBUGGING, SNARK |
| 크리처 배정 | 사용자 ID 기반 결정론적 (Mulberry32 PRNG) |

사용자 ID를 시드로 써서 결정론적으로 크리처가 배정되므로, 같은 사용자는 항상 같은 펫을 받게 됩니다. 재미있는 디테일이 하나 있는데, 종 이름을 `String.fromCharCode()`로 인코딩해 두었습니다. 빌드 산출물을 grep으로 훑는 검사에 걸리지 않게 하려는 장치로 보입니다.

:::tip

**장난처럼 보이지만**

이런 요소는 도구에 대한 애착과 사용 지속률에 실질적 영향을 미칩니다. GitHub의 contribution graph, Duolingo의 연속 학습 기록 같은 게이미피케이션 요소와 같은 맥락입니다.

:::

## 발견 7: 25만 API 호출의 조용한 낭비

코드 주석에서 발견된 성능 이슈는 Anthropic의 규모에서 생각하면 상당히 의미 있는 숫자입니다.

```typescript
// autoCompact.ts 주석
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures
// (up to 3,272) in a single session, wasting ~250K API calls/day globally
```

Claude Code는 대화가 길어지면 이전 메시지를 자동으로 압축(compaction)하는 기능이 있습니다. 그런데 **1,279개 세션에서 50회 이상 연속으로 압축이 실패**하고 있었고, 한 세션에서 3,272회까지 연속 실패한 사례도 있었습니다. 이로 인해 전 세계적으로 매일 약 **25만 건의 API 호출이 낭비**되고 있었습니다.

다만 방치되고 있던 것은 아닙니다. 같은 파일에 연속 실패 3회로 압축을 중단시키는 상한(`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`)이 이미 들어가 있습니다. 인지한 뒤 대응이 진행 중이던 상태로 보입니다. AI 제품에서 이런 "조용한 비효율"이 얼마나 쉽게 쌓이는지, 그리고 그것을 발견하려면 어떤 계측이 필요한지를 함께 보여주는 사례입니다.

## 마치며

`.npmignore` 한 줄의 부재가 51만줄의 소스코드를 세상에 드러냈습니다. 그 안에는 경쟁사로부터의 방어(Anti-Distillation), 논란이 될 수밖에 없는 결정(Undercover Mode), 영리한 엔지니어링(Frustration Detection), 미래의 제품 비전(KAIROS), 그리고 어디서나 존재하는 현실적 문제(25만 API 낭비)까지 담겨 있었습니다. AI 에이전트를 만드는 팀이 실제로 어떤 고민을 하고 있는지가 고스란히 드러난 셈입니다.

## 함께 보면 좋은 글

- [Claude Code 아키텍처 분석](/issue/claude-code-architecture/) : 같은 유출 코드에서 드러난 도구 시스템, 권한 모델, 프롬프트 캐시 설계

## 참고자료

- [Alex Kim: Claude Code Source Leak Analysis](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- [VentureBeat: Claude Code's Source Code Appears to Have Leaked](https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know)
- [GeekNews: Claude Code 소스코드 유출](https://news.hada.io/topic?id=28074)
- [Layer5: The Claude Code Source Leak, 512,000 Lines](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
- [Fortune: Anthropic's Second Major Security Lapse](https://fortune.com/2026/03/31/anthropic-source-code-claude-code-data-leak-second-security-lapse-days-after-accidentally-revealing-mythos/)
