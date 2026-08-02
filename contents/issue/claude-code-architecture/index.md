---
date: '2026-04-02'
title: 'Claude Code 아키텍처 분석: 프로덕션 AI 에이전트는 어떻게 설계되는가'
category: 'Issue'
tags: ['Claude Code', 'AI Agent', 'Architecture', 'Tool System', 'Prompt Caching']
summary: '유출된 Claude Code 51만줄 소스코드에서 드러난 AI 에이전트 아키텍처. 도구 시스템, 권한 모델, 프롬프트 캐시, Coordinator Mode까지 실전 설계 패턴을 분석합니다.'
thumbnail: './thumbnail.png'
---

2026년 3월 31일 npm 배포 사고로 Claude Code의 TypeScript 소스 51만줄이 공개됐습니다. 어떤 기능이 들어 있었는지는 여기저기서 많이 다뤄졌으니, 이 글에서는 한 걸음 더 들어가 **어떻게 만들었는지**를 봅니다.

프로덕션 AI 에이전트를 설계할 때는 네 가지 문제를 반드시 만나게 됩니다. 도구를 어떻게 관리할 것인가, 권한을 어떻게 통제할 것인가, 비용을 어떻게 줄일 것인가, 여러 에이전트를 어떻게 조율할 것인가. 유출된 코드에는 이 네 질문에 대한 Anthropic의 답이 그대로 들어 있습니다.

## 전체 구조: 51만줄의 지도

먼저 큰 그림부터 보겠습니다. Claude Code는 다음과 같은 기술 스택으로 구성되어 있습니다.

| 구성 요소 | 기술 |
|----------|------|
| **런타임** | Bun (TypeScript/JavaScript) |
| **UI** | React + Ink (터미널 렌더링) |
| **CLI** | Commander.js |
| **코드 규모** | 약 1,900 파일, 512,000+ 줄 |

핵심 진입점은 두 곳입니다. `main.tsx`가 CLI 초기화와 React/Ink UI를 담당하고, `QueryEngine.ts`(46,000줄)가 LLM과의 전체 대화 루프를 관리합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 350" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="main.tsx에서 QueryEngine으로 이어지고 QueryEngine이 프롬프트 조합, 도구 라우팅, 컨텍스트 관리, API 클라이언트를 관장하는 구조">
<style>
.qe-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.qe-l { fill: var(--text, #1c1917); font-size: 14px; }
.qe-w { fill: var(--on-fill, #14100e); font-size: 14px; }
.qe-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.qe-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.qe-core { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
.qe-a { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#qeArrow); }
</style>
<defs>
<marker id="qeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<text class="qe-t" x="200" y="22" text-anchor="middle">QueryEngine이 관장하는 네 갈래</text>
<rect class="qe-box" x="120" y="36" width="160" height="30" rx="5"/>
<text class="qe-l" x="200" y="56" text-anchor="middle">main.tsx</text>
<path class="qe-a" d="M200 66 L200 78"/>
<rect class="qe-core" x="100" y="80" width="200" height="32" rx="5"/>
<text class="qe-w" x="200" y="101" text-anchor="middle">QueryEngine.ts</text>
<path class="qe-a" d="M200 112 L200 126"/>
<rect class="qe-box" x="30" y="128" width="340" height="44" rx="5"/>
<text class="qe-l" x="44" y="148">System Prompt 조합</text>
<text class="qe-n" x="44" y="166">정적 프롬프트와 동적 프롬프트</text>
<rect class="qe-box" x="30" y="180" width="340" height="44" rx="5"/>
<text class="qe-l" x="44" y="200">Tool Router</text>
<text class="qe-n" x="44" y="218">40여 개 도구 실행, 권한 검증</text>
<rect class="qe-box" x="30" y="232" width="340" height="44" rx="5"/>
<text class="qe-l" x="44" y="252">Context Manager</text>
<text class="qe-n" x="44" y="270">자동 압축, 메모리 시스템</text>
<rect class="qe-box" x="30" y="284" width="340" height="44" rx="5"/>
<text class="qe-l" x="44" y="304">API Client</text>
<text class="qe-n" x="44" y="322">프롬프트 캐시, 토큰 추정</text>
</svg>
</div>

특이한 점은 **부팅 최적화**입니다. 무거운 모듈(OpenTelemetry, gRPC, analytics)은 지연 로딩하고, 시작 시 MDM 설정 읽기, 키체인 프리페치, API 사전 연결, 모델 호환성 확인을 **모두 병렬**로 실행합니다. CLI 도구에서 체감 시작 속도가 중요하다는 걸 잘 알고 있는 설계입니다.

## 도구 시스템: 40여 개 도구는 어떻게 관리되는가

Claude Code에는 40개 이상의 도구가 등록되어 있습니다. 각 도구는 **독립적인 모듈**로, 입력 스키마(Zod 기반 검증), 권한 모델, 실행 로직, 진행 상태 추적을 모두 자체적으로 갖추고 있습니다.

### 핵심 도구 분류

| 카테고리 | 도구 | 역할 |
|---------|------|------|
| **파일 조작** | `FileReadTool`, `FileEditTool`, `FileWriteTool` | 파일 읽기/수정/생성 (이미지, PDF, Jupyter 지원) |
| **검색** | `GlobTool`, `GrepTool` | 파일 패턴 매칭, ripgrep 기반 콘텐츠 검색 |
| **실행** | `BashTool` | 셸 명령 실행 (스트리밍 출력) |
| **웹** | `WebFetchTool`, `WebSearchTool` | URL 콘텐츠 가져오기, 웹 검색 |
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

여기서 층위를 구분해야 합니다. 빌드 타임 플래그는 **그 코드가 바이너리에 들어가는지**를 정하고, 들어간 뒤 실제로 켜는 것은 별개입니다. 예를 들어 Coordinator Mode는 빌드에 포함된 상태에서 환경 변수 `CLAUDE_CODE_COORDINATOR_MODE=1`로 활성화됩니다.

발견된 44개 피처 플래그 중 주요한 것들입니다.

| 플래그 | 기능 |
|--------|------|
| `PROACTIVE` | 자율 에이전트 모드 |
| `KAIROS` | 백그라운드 데몬 에이전트 |
| `VOICE_MODE` | 음성 입력 |
| `COORDINATOR_MODE` | 다중 워커 오케스트레이션 |
| `BASH_CLASSIFIER` | AI 기반 bash 명령 자동 승인 |
| `AGENT_TRIGGERS` | 스케줄된 에이전트 |

이 방식의 장점은 **외부 배포 바이너리의 크기를 줄이면서도 내부적으로는 실험적 기능을 계속 개발**할 수 있다는 것입니다. Anthropic 내부 빌드와 외부 배포 빌드의 기능 차이가 코드 레벨이 아닌 빌드 레벨에서 관리됩니다.

## 권한 모델: 4계층 방어선

AI 에이전트에서 가장 민감한 문제는 "이 도구를 실행해도 되는가?"입니다. Claude Code는 이를 **4계층 권한 모델**로 해결합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="훅, AI 분류기, 사용자 확인, 규칙 저장 네 계층을 차례로 지나되 앞 계층에서 결론이 나면 즉시 통과하는 권한 모델">
<style>
.pm-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.pm-l { fill: var(--text, #1c1917); font-size: 14px; }
.pm-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.pm-s { fill: var(--text-success, #16a34a); font-size: 14px; }
.pm-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pm-a { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#pmArrow); }
.pm-sc { stroke: var(--text-success, #16a34a); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#pmArrowS); }
</style>
<defs>
<marker id="pmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
<marker id="pmArrowS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-success, #16a34a)"/>
</marker>
</defs>
<text class="pm-t" x="200" y="22" text-anchor="middle">네 계층과 단락 경로</text>
<rect class="pm-box" x="90" y="34" width="140" height="28" rx="5"/>
<text class="pm-l" x="160" y="53" text-anchor="middle">도구 실행 요청</text>
<path class="pm-a" d="M160 62 L160 74"/>
<rect class="pm-box" x="24" y="76" width="270" height="42" rx="5"/>
<text class="pm-l" x="38" y="95">Layer 1  Hooks</text>
<text class="pm-n" x="38" y="112">승인 / 거부 / 통과</text>
<path class="pm-sc" d="M296 92 L336 92"/>
<text class="pm-s" x="342" y="97">통과</text>
<path class="pm-a" d="M160 118 L160 128"/>
<rect class="pm-box" x="24" y="130" width="270" height="42" rx="5"/>
<text class="pm-l" x="38" y="149">Layer 2  AI Classifier</text>
<text class="pm-n" x="38" y="166">bash 전용, 플래그 뒤</text>
<path class="pm-sc" d="M296 146 L336 146"/>
<text class="pm-s" x="342" y="151">통과</text>
<path class="pm-a" d="M160 172 L160 182"/>
<rect class="pm-box" x="24" y="184" width="270" height="42" rx="5"/>
<text class="pm-l" x="38" y="203">Layer 3  User Dialog</text>
<text class="pm-n" x="38" y="220">사용자에게 직접 확인</text>
<path class="pm-a" d="M160 226 L160 236"/>
<rect class="pm-box" x="24" y="238" width="270" height="42" rx="5"/>
<text class="pm-l" x="38" y="257">Layer 4  Persist</text>
<text class="pm-n" x="38" y="274">결정을 규칙으로 저장</text>
</svg>
</div>

앞쪽 3개 계층(Hooks, Classifier, Dialog)이 실질적인 방어선이고, Persist는 내려진 결정을 규칙으로 저장하는 후처리 단계입니다. 각 방어 계층은 **단락(short-circuit)** 가능합니다. 훅이 승인하면 나머지 계층을 건너뛰고, AI Classifier가 안전하다고 판단하면 사용자에게 묻지 않습니다.

### 영구 규칙 시스템

사용자가 한 번 승인한 패턴은 규칙으로 저장할 수 있습니다. 공개된 설정 스키마에서는 `permissions` 아래에 세 종류의 목록으로 표현됩니다.

```json
{
  "permissions": {
    "allow": ["Bash(npm run test *)", "Read(~/.zshrc)"],
    "deny": ["Bash(curl *)"],
    "ask": ["Bash(git push *)"]
  }
}
```

규칙은 `ToolName(패턴)` 형식입니다. 명령 문자열만 덩그러니 넣는 방식이 아니라 어떤 도구에 대한 규칙인지를 함께 적습니다. `ask`는 자동 승인을 우회합니다. `git push`처럼 위험하지는 않지만 항상 의식적으로 실행하고 싶은 명령에 유용합니다.

권한 규칙은 다른 설정과 병합 방식이 다릅니다. 상위 범위가 하위 범위를 덮어쓰는 게 아니라 **여러 범위의 규칙이 합쳐집니다.** 조직이 건 `deny`를 개인 설정으로 지울 수 없다는 뜻입니다.

:::info

**AI Classifier가 하는 일**

현재 bash 명령 전용이며, 피처 플래그(`BASH_CLASSIFIER`) 뒤에 있습니다. LLM을 호출해서 "이 명령이 안전한가?"를 평가하는 방식인데, 확신이 없으면 사용자에게 넘깁니다. "자동화할 수 있는 판단은 자동화하되, 불확실하면 사람에게"라는 원칙이 명확합니다.

:::

이 설계가 영리한 이유는 **사용 맥락에 따라 계층을 유연하게 조합**할 수 있다는 점입니다. 대화형 CLI에서는 4계층 모두 활성화하고, 비대화형(CI/CD) 모드에서는 훅과 규칙만 사용하고, 서브에이전트에서는 UI 없이 훅과 분류기만 사용합니다.

## 프롬프트 캐시: 비용을 크게 줄이는 경계 마커

LLM API 비용에서 큰 부분을 차지하는 것은 **시스템 프롬프트**입니다. 매 턴마다 동일한 시스템 프롬프트를 보내야 하니까요. Claude Code는 이 문제를 **경계 마커(Boundary Marker)** 패턴으로 해결합니다.

```typescript
// systemPromptSections.ts (pseudo-code)
const systemPrompt = [
  // 정적 영역 (캐시됨)
  cachedSection('tools', toolDefinitions),
  cachedSection('instructions', coreInstructions),
  cachedSection('permissions', permissionRules),

  // 경계 마커
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,

  // 동적 영역 (캐시 안 됨)
  uncachedSection('git_status', getCurrentGitStatus()),
  uncachedSection('claude_md', loadClaudeMd()),
  uncachedSection('date', new Date().toISOString()),
];
```

`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`를 기준으로 프롬프트가 두 영역으로 갈립니다.

| 영역 | 캐시 | 내용 |
|------|----------|------|
| **경계 위 (정적)** | 조직과 워크스페이스 단위로 재사용 | 도구 정의, 지침, 권한 규칙 |
| **경계 아래 (동적)** | 캐시 안 됨 | git status, CLAUDE.md, 날짜 |

정적 영역은 요청마다 바이트가 동일하므로 캐시 히트가 계속 누적됩니다. 동적 영역은 사용자와 세션마다 달라지므로 캐시하지 않습니다. 이 분리만으로도 시스템 프롬프트 토큰의 상당 부분을 캐시 히트로 처리할 수 있습니다.

:::warning

**캐시는 조직과 워크스페이스 단위로 격리됩니다**

"정적이니까 전 세계 모든 사용자가 하나의 캐시를 공유한다"고 오해하기 쉽지만 그렇지 않습니다. Anthropic 공식 문서는 조직 간 캐시 공유가 절대 일어나지 않으며, Claude API에서는 조직 안에서도 워크스페이스 단위로 격리된다고 명시합니다. 프롬프트가 완전히 동일해도 마찬가지입니다. 경계 마커가 주는 이득은 "남과 캐시를 나눠 쓰는 것"이 아니라 "내 요청들 사이에서 앞부분이 계속 재사용되는 것"입니다.

:::

각 섹션도 개별적으로 메모이제이션됩니다. `cachedSection`은 내용이 바뀌지 않으면 이전 결과를 재사용하고, 캐시를 깨뜨리는 섹션은 이름에 위험 표시를 달아 구분합니다.

:::summary

**프롬프트 캐시 전략의 핵심**

"변하는 것과 변하지 않는 것을 물리적으로 분리하라"입니다. 도구 정의와 지침은 거의 변하지 않으니 앞에, git status와 메모리는 매번 변하니 뒤에 배치합니다. 이 순서만 바꿔도 캐시 히트율이 크게 달라집니다.

:::

## 컨텍스트 관리: 대화를 무한히 이어가는 법

LLM의 컨텍스트 윈도우는 유한합니다. 긴 코딩 세션에서는 금방 한계에 도달하죠. Claude Code는 이를 **자동 압축(Auto-Compaction)** 시스템으로 해결합니다.

### 자동 압축

컨텍스트가 한계에 가까워지면, 이전 메시지를 LLM에게 요약하도록 요청합니다. 스무 개의 메시지가 요약 하나와 최근 메시지 몇 개로 줄어드는 식입니다. 중요한 것은 원본을 버리지 않는다는 점입니다. 전체 대화 이력은 JSONL 파일로 그대로 보존하고, API로 보내는 메시지만 압축된 버전으로 교체합니다. 그래서 나중에 원본을 되짚어볼 수 있습니다.

### 토큰 추정

API 호출 전에 토큰 수를 미리 추정합니다. 시스템 프롬프트, 대화 이력, 도구 정의를 모두 합산해서 예산 한도를 초과하지 않도록 제어합니다. 비용 폭주를 방지하는 안전장치입니다.

### 메모리 시스템

Claude Code에는 세션을 넘어 지속되는 두 가지 메모리가 있습니다.

| 메모리 | 위치 | 용도 |
|--------|------|------|
| **CLAUDE.md** | 프로젝트 루트 | 프로젝트별 지침, 컨벤션 (디렉토리 워크로 자동 발견) |
| **MEMORY.md** | 사용자 설정 디렉토리 | 사용자 선호, 피드백, 프로젝트 맥락 |

CLAUDE.md는 프로젝트에 체크인되어 팀원과 공유되고, MEMORY.md는 개인 메모리로 대화 간 학습을 유지합니다. 둘 다 시스템 프롬프트의 동적 영역에 주입됩니다.

:::warning

**압축이 실패하면 비용이 그대로 샙니다**

유출된 코드의 `autoCompact.ts` 주석에는 1,279개 세션에서 50회 이상 연속으로 압축이 실패했고, 이로 인해 하루 약 25만 건의 API 호출이 낭비되고 있다는 기록이 남아 있습니다. 같은 파일에 연속 실패 3회로 압축을 중단시키는 상한이 이미 들어가 있는 걸 보면 인지 후 대응이 진행 중이던 상태로 보입니다. 무한 대화를 가능하게 하는 핵심 시스템이지만, 실패했을 때의 비용도 그만큼 큽니다.

:::

## Coordinator Mode: 다중 에이전트 오케스트레이션

Claude Code의 가장 야심찬 설계는 **Coordinator Mode**입니다. 하나의 코디네이터가 여러 워커 에이전트를 지휘하는 구조로, 빌드에 포함된 상태에서 환경 변수 `CLAUDE_CODE_COORDINATOR_MODE=1`로 활성화됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 310" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="코디네이터가 세 워커에게 작업을 분배하고 워커들이 공유 스크래치패드를 통해 간접적으로 지식을 주고받는 구조">
<style>
.cd-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.cd-l { fill: var(--text, #1c1917); font-size: 14px; }
.cd-w { fill: var(--on-fill, #14100e); font-size: 14px; }
.cd-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.cd-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.cd-top { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
.cd-pad { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #d97706); stroke-width: 1.5; }
.cd-a { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#cdArrow); }
</style>
<defs>
<marker id="cdArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<text class="cd-t" x="200" y="22" text-anchor="middle">코디네이터와 워커</text>
<rect class="cd-top" x="100" y="36" width="200" height="44" rx="6"/>
<text class="cd-w" x="200" y="58" text-anchor="middle">Coordinator</text>
<text class="cd-w" x="200" y="74" text-anchor="middle">작업 분배와 결과 합성</text>
<path class="cd-a" d="M180 80 L80 124"/>
<path class="cd-a" d="M200 80 L200 124"/>
<path class="cd-a" d="M220 80 L320 124"/>
<rect class="cd-box" x="24" y="128" width="112" height="44" rx="5"/>
<text class="cd-l" x="80" y="150" text-anchor="middle">Worker 1</text>
<text class="cd-n" x="80" y="166" text-anchor="middle">조사</text>
<rect class="cd-box" x="144" y="128" width="112" height="44" rx="5"/>
<text class="cd-l" x="200" y="150" text-anchor="middle">Worker 2</text>
<text class="cd-n" x="200" y="166" text-anchor="middle">구현</text>
<rect class="cd-box" x="264" y="128" width="112" height="44" rx="5"/>
<text class="cd-l" x="320" y="150" text-anchor="middle">Worker 3</text>
<text class="cd-n" x="320" y="166" text-anchor="middle">테스트</text>
<path class="cd-a" d="M80 172 L180 214"/>
<path class="cd-a" d="M200 172 L200 214"/>
<path class="cd-a" d="M320 172 L220 214"/>
<rect class="cd-pad" x="60" y="218" width="280" height="44" rx="6"/>
<text class="cd-l" x="200" y="240" text-anchor="middle">Scratchpad</text>
<text class="cd-n" x="200" y="256" text-anchor="middle">워커 간 공유 디렉토리</text>
<text class="cd-n" x="200" y="292" text-anchor="middle">워커끼리 직접 통신하지 않음</text>
</svg>
</div>

### 핵심 설계 원칙

코디네이터의 시스템 프롬프트에서 가장 눈에 띄는 것은 위임의 한계를 못 박아 둔 문장들입니다.

> "You must understand findings before directing follow-up work. Never hand off understanding to another worker."
>
> "Do not rubber-stamp weak work."

후속 작업을 지시하기 전에 반드시 결과를 직접 이해해야 하고, 이해하는 일 자체를 다른 워커에게 떠넘기지 말라는 것입니다. AI 에이전트 시스템에서 가장 흔한 실패 패턴이 코디네이터가 워커에게 작업을 위임한 뒤 결과를 제대로 읽지 않고 추측으로 다음 단계를 진행하는 것인데, Claude Code는 이를 프롬프트 레벨에서 명시적으로 금지합니다.

### 워크플로우

Coordinator Mode의 권장 워크플로우는 4단계입니다.

1. **Research**: 워커들이 병렬로 코드베이스를 조사
2. **Synthesis**: 코디네이터가 조사 결과를 종합해 구현 계획 수립
3. **Implementation**: 워커들이 계획에 따라 병렬 구현
4. **Verification**: 테스트 실행, 결과 검증

워커의 결과는 XML 형식으로 코디네이터에게 전달됩니다.

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

설정이 여러 곳에서 올 수 있을 때는 명확한 우선순위가 필요합니다. 공개된 문서 기준 순서는 이렇습니다.

1. **기업 관리(Managed) 설정**: 최우선이며, **CLI 인자로도 덮어쓸 수 없습니다**
2. 명령줄 인자
3. `.claude/settings.local.json` (개인 로컬)
4. `.claude/settings.json` (프로젝트)
5. 사용자 설정 디렉토리의 `settings.json` (최하위)

여기서 중요한 것은 기업 관리 설정이 **맨 위**에 있다는 점입니다. 조직이 건 정책을 개발자가 플래그 하나로 우회할 수 없어야 관리 도구로서 의미가 있기 때문입니다. 앞서 본 권한 규칙이 덮어쓰기가 아니라 병합으로 동작하는 것도 같은 이유입니다.

## 마치며

유출된 Claude Code의 소스코드를 분석하면서 가장 인상 깊었던 것은, 결국 **AI 에이전트도 소프트웨어 엔지니어링의 기본 원칙을 따른다**는 점입니다.

- 모듈화: 도구마다 독립적 스키마, 권한, 실행 로직
- 계층화: 권한은 4계층, 캐시는 2계층, 설정은 5단계 우선순위
- 관심사 분리: 정적/동적 프롬프트 분리, 코디네이터/워커 역할 분리
- 비용 의식: 프롬프트 캐시, 토큰 추정, 예산 제한

AI라는 새로운 도메인이지만, 좋은 설계의 원칙은 변하지 않았습니다. 다만 "LLM API 호출 비용"이라는 새로운 차원의 제약이 추가되면서, 캐시 전략과 컨텍스트 관리가 전통적인 소프트웨어보다 훨씬 더 중요해졌다는 점이 차이라면 차이입니다.

## 함께 보면 좋은 글

- [Claude Code 소스코드 유출](/issue/claude-code-source-leak/) : 유출 경위와 코드에서 발견된 미공개 기능들

## 참고자료

- [Alex Kim: Claude Code Source Leak Analysis](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude Code: Settings](https://code.claude.com/docs/en/settings)
- [Layer5: The Claude Code Source Leak, 512,000 Lines](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
- [VentureBeat: Claude Code's Source Code Appears to Have Leaked](https://venturebeat.com/technology/claude-codes-source-code-appears-to-have-leaked-heres-what-we-know)
