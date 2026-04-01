---
date: '2026-04-02'
title: 'Claude Code 아키텍처 분석: 프로덕션 AI 에이전트는 어떻게 설계되는가'
category: 'Issue'
tags: ['Claude Code', 'AI Agent', 'Architecture', 'Tool System', 'Prompt Caching']
summary: '유출된 Claude Code 51만줄 소스코드에서 드러난 AI 에이전트 아키텍처. 도구 시스템, 권한 모델, 프롬프트 캐시, Coordinator Mode까지 실전 설계 패턴을 분석합니다.'
thumbnail: './thumbnail.png'
---

[이전 글](/issue/claude-code-source-leak/)에서는 유출된 Claude Code 소스코드에서 **무엇이** 발견됐는지를 다뤘습니다. Anti-Distillation, Undercover Mode, KAIROS 같은 흥미로운 기능들이었죠.

이번 글에서는 한 걸음 더 들어갑니다. **어떻게** 만들었는지를 봅니다.

51만줄의 TypeScript 코드 속에는 프로덕션 AI 에이전트를 설계할 때 마주하는 핵심 문제들 — 도구를 어떻게 관리하는지, 권한을 어떻게 통제하는지, 비용을 어떻게 줄이는지, 여러 에이전트를 어떻게 조율하는지 — 에 대한 Anthropic의 답이 담겨 있습니다. AI 에이전트를 만들거나 관심 있는 개발자라면, 이보다 좋은 참고 자료를 찾기 어려울 겁니다.

---

## 전체 구조: 51만줄의 지도

먼저 큰 그림부터 보겠습니다. Claude Code는 다음과 같은 기술 스택으로 구성되어 있습니다.

| 구성 요소 | 기술 |
|----------|------|
| **런타임** | Bun (TypeScript/JavaScript) |
| **UI** | React + Ink (터미널 렌더링) |
| **CLI** | Commander.js |
| **코드 규모** | ~1,900 파일, 301 디렉토리, 512,000+ 줄 |

핵심 진입점은 두 곳입니다. `main.tsx`가 CLI 초기화와 React/Ink UI를 담당하고, `QueryEngine.ts`(46,000줄)가 LLM과의 전체 대화 루프를 관리합니다.

```
main.tsx (CLI 초기화)
    │
    ▼
QueryEngine.ts (대화 루프)
    │
    ├── System Prompt 조합
    │     ├── 정적 프롬프트 (도구, 지침)
    │     └── 동적 프롬프트 (git status, CLAUDE.md, 날짜)
    │
    ├── Tool Router
    │     ├── 40+ 도구 실행
    │     └── 권한 검증
    │
    ├── Context Manager
    │     ├── 자동 압축 (compaction)
    │     └── 메모리 시스템 (MEMORY.md)
    │
    └── API Client
          ├── 프롬프트 캐시
          └── 토큰 추정
```

특이한 점은 **부팅 최적화**입니다. 무거운 모듈(OpenTelemetry, gRPC, analytics)은 지연 로딩하고, 시작 시 MDM 설정 읽기, 키체인 프리페치, API 사전 연결, 모델 호환성 확인을 **모두 병렬**로 실행합니다. CLI 도구에서 체감 시작 속도가 중요하다는 걸 잘 알고 있는 설계입니다.

---

## 도구 시스템: 40+개 도구는 어떻게 관리되는가

Claude Code에는 40개 이상의 도구가 등록되어 있습니다. 각 도구는 **독립적인 모듈**로, 입력 스키마(Zod 기반 검증), 권한 모델, 실행 로직, 진행 상태 추적을 모두 자체적으로 갖추고 있습니다.

### 핵심 도구 분류

| 카테고리 | 도구 | 역할 |
|---------|------|------|
| **파일 조작** | `FileReadTool`, `FileEditTool`, `FileWriteTool` | 파일 읽기/수정/생성 (이미지, PDF, Jupyter 지원) |
| **검색** | `GlobTool`, `GrepTool` | 파일 패턴 매칭, ripgrep 기반 콘텐츠 검색 |
| **실행** | `BashTool` | 셸 명령 실행 (스트리밍 출력) |
| **웹** | `WebFetchTool`, `WebSearchTool` | URL 콘텐츠 가져오기, 웹 검색 (Brave API) |
| **에이전트** | `AgentTool`, `SendMessageTool` | 서브에이전트 생성, 에이전트 간 메시지 전달 |
| **확장** | `MCPTool`, `SkillTool` | MCP 서버 도구 호출, 재사용 가능한 스킬 실행 |
| **작업 관리** | `TaskCreateTool`, `TodoWriteTool` | 구조화된 작업 추적 |
| **환경** | `EnterWorktreeTool`, `CronCreateTool` | Git worktree 격리, 스케줄링 |

### 피처 플래그로 도구 게이팅

모든 도구가 항상 활성화되는 것은 아닙니다. Bun의 `bun:bundle` 빌드 타임 피처 플래그로 **죽은 코드 제거(Dead Code Elimination)**를 수행합니다.

```typescript
// 빌드 타임에 조건부 포함
if (feature('PROACTIVE')) {
  // 자율 에이전트 모드 관련 도구
}
if (feature('VOICE_MODE')) {
  // 음성 입력 관련 도구
}
if (feature('COORDINATOR_MODE')) {
  // 다중 에이전트 오케스트레이션
}
```

발견된 44개 피처 플래그 중 주요한 것들입니다:

| 플래그 | 기능 |
|--------|------|
| `PROACTIVE` | 자율 에이전트 모드 |
| `KAIROS` | 백그라운드 데몬 에이전트 |
| `VOICE_MODE` | 음성 입력 |
| `COORDINATOR_MODE` | 다중 워커 오케스트레이션 |
| `BASH_CLASSIFIER` | AI 기반 bash 명령 자동 승인 |
| `AGENT_TRIGGERS` | 스케줄된 에이전트 |

이 방식의 장점은 **외부 배포 바이너리의 크기를 줄이면서도 내부적으로는 실험적 기능을 계속 개발**할 수 있다는 것입니다. Anthropic 내부 빌드와 외부 배포 빌드의 기능 차이가 코드 레벨이 아닌 빌드 레벨에서 관리됩니다.

---

## 권한 모델: 4계층 방어선

AI 에이전트에서 가장 민감한 문제는 "이 도구를 실행해도 되는가?"입니다. Claude Code는 이를 **4계층 권한 모델**로 해결합니다.

```
사용자 요청
    │
    ▼
┌─────────────────────────────────┐
│  Layer 1: Hooks (자동 실행)       │
│  설정된 훅이 있으면 먼저 실행       │
│  → approve / deny / pass-through │
├─────────────────────────────────┤
│  Layer 2: AI Classifier          │
│  (bash 전용, 피처 플래그 뒤)       │
│  LLM이 명령의 안전성 평가           │
│  → safe / unsafe / uncertain    │
├─────────────────────────────────┤
│  Layer 3: User Dialog            │
│  사용자에게 직접 승인 요청           │
│  → allow / deny                 │
├─────────────────────────────────┤
│  Layer 4: Persist                │
│  결정을 규칙으로 영구 저장           │
│  → alwaysAllow / alwaysDeny     │
└─────────────────────────────────┘
```

앞쪽 3개 계층(Hooks, Classifier, Dialog)이 실질적인 방어선이고, Persist는 내려진 결정을 규칙으로 저장하는 후처리 단계입니다. 각 방어 계층은 **단락(short-circuit)** 가능합니다. 훅이 승인하면 나머지 계층을 건너뛰고, AI Classifier가 안전하다고 판단하면 사용자에게 묻지 않습니다.

### 영구 규칙 시스템

사용자가 한 번 승인한 패턴은 규칙으로 저장할 수 있습니다:

```typescript
// settings.json
{
  "alwaysAllowRules": ["npm test", "git status"],  // 항상 자동 승인
  "alwaysDenyRules": ["rm -rf /"],                  // 항상 차단
  "alwaysAskRules": ["git push"]                     // 항상 사용자 확인
}
```

`alwaysAskRules`는 자동 승인을 우회합니다. `git push`처럼 위험하지는 않지만 항상 의식적으로 실행하고 싶은 명령에 유용합니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  AI Classifier는 현재 bash 명령 전용이며, 피처 플래그(<code>BASH_CLASSIFIER</code>) 뒤에 있습니다. LLM을 호출해서 "이 명령이 안전한가?"를 평가하는 방식인데, 확신이 없으면 사용자에게 넘깁니다. "자동화할 수 있는 판단은 자동화하되, 불확실하면 사람에게"라는 원칙이 명확합니다.
</div>

이 설계가 영리한 이유는 **사용 맥락에 따라 계층을 유연하게 조합**할 수 있다는 점입니다. 대화형 CLI에서는 4계층 모두 활성화하고, 비대화형(CI/CD) 모드에서는 훅과 규칙만 사용하고, 서브에이전트에서는 UI 없이 훅+분류기만 사용합니다.

---

## 프롬프트 캐시: 비용을 크게 줄이는 경계 마커

LLM API 비용에서 가장 큰 부분을 차지하는 것은 **시스템 프롬프트**입니다. 매 턴마다 동일한 시스템 프롬프트를 보내야 하니까요. Claude Code는 이 문제를 **경계 마커(Boundary Marker)** 패턴으로 해결합니다.

```typescript
// systemPromptSections.ts (pseudo-code)
const systemPrompt = [
  // ── 정적 영역 (캐시됨) ──────────────────────
  cachedSection('tools', toolDefinitions),
  cachedSection('instructions', coreInstructions),
  cachedSection('permissions', permissionRules),

  // ── 경계 마커 ──────────────────────────────
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,

  // ── 동적 영역 (캐시 안 됨) ────────────────
  uncachedSection('git_status', getCurrentGitStatus()),
  uncachedSection('claude_md', loadClaudeMd()),
  uncachedSection('date', new Date().toISOString()),
];
```

`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`를 기준으로:

| 영역 | 캐시 범위 | 내용 |
|------|----------|------|
| **경계 위 (정적)** | 글로벌 (모든 사용자 공유) | 도구 정의, 지침, 권한 규칙 |
| **경계 아래 (동적)** | 캐시 안 됨 | git status, CLAUDE.md, 날짜 |

정적 영역은 **모든 사용자, 모든 조직에서 동일**하므로 글로벌 캐시로 공유됩니다. 동적 영역은 사용자와 세션마다 달라지므로 캐시하지 않습니다. 이 분리만으로도 시스템 프롬프트 토큰의 상당 부분을 캐시 히트로 처리할 수 있습니다.

각 섹션도 개별적으로 메모이제이션됩니다. `cachedSection`은 내용이 바뀌지 않으면 이전 결과를 재사용하고, `DANGEROUS_uncachedSystemPromptSection`으로 표시된 섹션은 변경 시 캐시를 깨뜨립니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  프롬프트 캐시 전략의 핵심은 "변하는 것과 변하지 않는 것을 물리적으로 분리하라"입니다. 도구 정의와 지침은 거의 변하지 않으니 앞에, git status와 메모리는 매번 변하니 뒤에 배치합니다. 이 순서만 바꿔도 캐시 히트율이 크게 달라집니다.
</div>

---

## 컨텍스트 관리: 대화를 무한히 이어가는 법

LLM의 컨텍스트 윈도우는 유한합니다. 긴 코딩 세션에서는 금방 한계에 도달하죠. Claude Code는 이를 **자동 압축(Auto-Compaction)** 시스템으로 해결합니다.

### 자동 압축

컨텍스트가 한계에 가까워지면, 이전 메시지를 LLM에게 요약하도록 요청합니다. 원본 대화 이력은 JSONL 파일로 전체 보존하면서, API로 보내는 메시지만 압축된 버전으로 교체합니다.

```
[원본 메시지 20개] → LLM 요약 → [요약 1개 + 최근 메시지 5개]
                                    │
                    원본은 JSONL로 보존 (복원 가능)
```

### 토큰 추정

API 호출 전에 토큰 수를 미리 추정합니다. 시스템 프롬프트, 대화 이력, 도구 정의를 모두 합산해서 **예산 한도(`--max-budget-usd`)를 초과하지 않도록** 제어합니다. 비용 폭주를 방지하는 안전장치입니다.

### 메모리 시스템

Claude Code에는 세션을 넘어 지속되는 두 가지 메모리가 있습니다:

| 메모리 | 위치 | 용도 | 제한 |
|--------|------|------|------|
| **CLAUDE.md** | 프로젝트 루트 | 프로젝트별 지침, 컨벤션 | 디렉토리 워크로 자동 발견 |
| **MEMORY.md** | `~/.claude/` | 사용자 선호, 피드백, 프로젝트 맥락 | 200줄, 25KB |

CLAUDE.md는 프로젝트에 체크인되어 팀원과 공유되고, MEMORY.md는 개인 메모리로 대화 간 학습을 유지합니다. 둘 다 시스템 프롬프트의 동적 영역에 주입됩니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  1편에서 다뤘듯이, 자동 압축에는 심각한 버그가 있었습니다. 1,279개 세션에서 50회 이상 연속 실패하며 하루 25만 API 호출이 낭비되고 있었습니다. 무한 대화를 가능하게 하는 핵심 시스템이지만, 실패 시의 비용도 그만큼 큽니다.
</div>

---

## Coordinator Mode: 다중 에이전트 오케스트레이션

Claude Code의 가장 야심찬 설계는 **Coordinator Mode**입니다. 환경 변수 `CLAUDE_CODE_COORDINATOR_MODE=1`로 활성화되는 이 모드는 하나의 코디네이터가 여러 워커 에이전트를 지휘하는 구조입니다.

```
┌───────────────────────────────────────────┐
│              Coordinator                   │
│  역할: 작업 분배, 결과 합성                   │
│  도구: AgentTool, SendMessage, TaskStop    │
│                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ Worker 1 │ │ Worker 2 │ │ Worker 3 │     │
│  │ (조사)    │ │ (구현)    │ │ (테스트)   │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       │            │            │           │
│       └────────────┼────────────┘           │
│                    ▼                        │
│            Scratchpad (공유)                  │
│     워커 간 지식 공유용 영구 디렉토리              │
└───────────────────────────────────────────┘
```

### 핵심 설계 원칙

코디네이터의 시스템 프롬프트에서 발견된 가장 중요한 규칙은 이것입니다:

> **"코디네이터는 워커의 결과를 절대 예측하지 않는다. 오직 합성(synthesize)만 한다."**

이게 왜 중요할까요? AI 에이전트 시스템에서 가장 흔한 실패 패턴은 코디네이터가 워커에게 작업을 위임한 뒤, 결과를 기다리지 않고 추측으로 다음 단계를 진행하는 것입니다. Claude Code는 이를 아키텍처 레벨에서 방지합니다.

### 워크플로우

Coordinator Mode의 권장 워크플로우는 4단계입니다:

1. **Research** — 워커들이 병렬로 코드베이스를 조사
2. **Synthesis** — 코디네이터가 조사 결과를 종합해 구현 계획 수립
3. **Implementation** — 워커들이 계획에 따라 병렬 구현
4. **Verification** — 테스트 실행, 결과 검증

워커의 결과는 `<task-notification>` XML 형식으로 코디네이터에게 전달됩니다:

```xml
<task-notification>
  <task-id>worker-1-research</task-id>
  <status>completed</status>
  <result>src/auth/ 디렉토리에 3개 파일 발견...</result>
  <usage>tokens: 15,234</usage>
</task-notification>
```

### Scratchpad: 워커 간 지식 공유

워커들은 서로 직접 통신하지 않습니다. 대신 **Scratchpad**라는 공유 디렉토리를 통해 간접적으로 지식을 공유합니다. 한 워커가 발견한 정보를 파일로 남기면, 다른 워커가 필요할 때 읽는 방식입니다.

이 설계는 의도적입니다. 워커 간 직접 통신을 허용하면 의존성이 복잡해지고, 데드락이나 무한 루프의 위험이 생깁니다. 파일 기반 공유는 느리지만 안전합니다.

---

## 엔지니어링 패턴 모음

유출된 코드 곳곳에서 발견되는 패턴들을 정리합니다. AI 에이전트를 만드는 개발자라면 참고할 만한 것들입니다.

### 패턴 1: Async Generator로 도구 결과 스트리밍

도구 실행 결과를 async generator(`async function*`)로 스트리밍합니다. 긴 bash 명령이나 대용량 파일 읽기에서 **결과가 생성되는 즉시 UI에 반영**됩니다.

```typescript
// 도구 결과 스트리밍 (pseudo-code)
async function* executeTool(tool, input) {
  for await (const chunk of tool.execute(input)) {
    yield { type: 'progress', data: chunk };
  }
  yield { type: 'complete', result: finalResult };
}
```

사용자가 터미널에서 실시간으로 진행 상황을 볼 수 있는 이유가 이것입니다.

### 패턴 2: 투기적 실행(Speculative Execution)

사용자가 타이핑하는 동안 **백그라운드에서 미리 응답을 생성**합니다. 파일 편집이나 bash 명령처럼 부작용이 있는 작업에서는 멈추고, 안전한 범위에서만 선행 실행합니다.

```typescript
// speculation mode (pseudo-code)
if (appState.speculation.enabled) {
  // 사용자 입력 중 백그라운드 응답 생성
  const specResult = await generateSpeculatively(context);

  // 파일 편집, bash 명령 등은 투기적 실행 불가
  if (specResult.hitsBoundary) {
    await rollback(specResult);
  }
  // 시간 절약 추적
  trackTimeSaved(specResult.savedMs);
}
```

### 패턴 3: 순환 의존성의 런타임 해결

대규모 TypeScript 프로젝트에서 흔한 순환 의존성 문제를 `require()`로 해결합니다. ES6 import 대신 런타임에 실제로 필요한 시점에 모듈을 로드하는 방식입니다.

```typescript
// ES6 import → 순환 의존성 에러
// import { QueryEngine } from './QueryEngine';

// require() → 런타임에 지연 로드
function getQueryEngine() {
  return require('./QueryEngine').QueryEngine;
}
```

### 패턴 4: 파일 상태 LRU 캐시

같은 파일을 한 턴에 여러 번 읽는 것을 방지합니다. 최근 읽은 파일을 LRU 캐시에 보관하고, 동일한 파일 요청이 오면 캐시에서 반환합니다. 세션 간에는 초기화됩니다(SDK 모드 제외).

### 패턴 5: 설정 소스 우선순위

설정이 여러 곳에서 올 수 있을 때, 명확한 우선순위가 필요합니다:

```
1. CLI 플래그           (최우선)
2. 환경 변수
3. MDM (기업 관리)
4. ~/.claude/settings.json
5. 기본값               (최하위)
```

기업 환경(MDM)과 개인 설정이 충돌할 때의 우선순위까지 고려한 설계입니다.

---

## 마치며

유출된 Claude Code의 소스코드를 분석하면서 가장 인상 깊었던 것은, 결국 **AI 에이전트도 소프트웨어 엔지니어링의 기본 원칙을 따른다**는 점입니다.

- 모듈화: 도구마다 독립적 스키마, 권한, 실행 로직
- 계층화: 권한은 4계층, 캐시는 2계층, 설정은 5단계 우선순위
- 관심사 분리: 정적/동적 프롬프트 분리, 코디네이터/워커 역할 분리
- 비용 의식: 프롬프트 캐시, 토큰 추정, 예산 제한

AI라는 새로운 도메인이지만, 좋은 설계의 원칙은 변하지 않았습니다. 다만 "LLM API 호출 비용"이라는 새로운 차원의 제약이 추가되면서, 캐시 전략과 컨텍스트 관리가 전통적인 소프트웨어보다 훨씬 더 중요해졌다는 점이 차이라면 차이입니다.

이 두 편의 분석이 AI 에이전트를 만들거나 이해하고자 하는 분들에게 실질적인 참고가 되었으면 합니다.

## 참고자료

- [Alex Kim — Claude Code Source Leak Analysis](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- [Layer5 — The Claude Code Source Leak: 512,000 Lines](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
- [DEV Community — Claude Code Leaked Source Analysis](https://dev.to/gabrielanhaia/claude-codes-entire-source-code-was-just-leaked-via-npm-source-maps-heres-whats-inside-cjo)
- [GeekNews — Claude Code 소스코드 유출](https://news.hada.io/topic?id=28074)
- [VentureBeat — Claude Code's Source Code Appears to Have Leaked](https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know)
