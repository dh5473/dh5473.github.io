---
date: '2026-04-02'
title: '유출된 Claude Code 소스로 본 프로덕션 AI 에이전트 설계'
category: 'Issue'
tags: ['Claude Code', 'AI Agent', 'Architecture', 'Tool System', 'Prompt Caching']
summary: '51만 줄 소스에서 확인된 도구 게이팅, 권한 판정, 프롬프트 캐시 경계, 코디네이터 모드. 프로덕션 AI 에이전트의 실제 구조를 짚었습니다.'
thumbnail: './thumbnail.png'
---

2026년 3월 31일 npm 배포 사고로 Claude Code의 TypeScript 소스 51만 줄이 공개됐습니다. 어떤 기능이 들어 있었는지는 여기저기서 많이 다뤄졌으니, 이 글에서는 한 걸음 더 들어가 어떻게 만들었는지를 봅니다.

프로덕션 AI 에이전트를 설계하면 네 가지 문제를 반드시 만나게 됩니다. 도구를 어떻게 관리할 것인가, 권한을 어떻게 통제할 것인가, 비용을 어떻게 줄일 것인가, 여러 에이전트를 어떻게 조율할 것인가. 유출된 코드에는 이 네 질문에 대한 답이 그대로 들어 있습니다.

## 51만 줄의 지도

기술 스택은 단순합니다. 런타임과 번들러는 Bun이고, 터미널 UI는 React와 Ink로 그립니다. 배포되는 산출물은 13MB짜리 단일 번들 하나입니다.

핵심은 LLM과의 대화 루프를 관리하는 `QueryEngine.ts`이고, 46,000줄입니다. 터미널 렌더링을 맡은 `print.ts`는 5,594줄인데 그중 한 함수가 3,167줄을 차지합니다. 잘 정리된 코드베이스라기보다는, 빠르게 움직이는 제품의 코드베이스입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 340" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="터미널 UI에서 시작해 QueryEngine, 시스템 프롬프트 조합, 도구 라우팅, 컨텍스트 갱신으로 이어지는 한 턴의 경로">
<style>
.qe-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.qe-l { fill: var(--text, #1c1917); font-size: 14px; }
.qe-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.qe-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.qe-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.qe-core { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.qe-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#qeArrow); }
</style>
<defs>
<marker id="qeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="qe-t" x="200" y="22" text-anchor="middle">한 턴이 지나가는 경로</text>
<rect class="qe-box" x="60" y="38" width="280" height="32" rx="5"/>
<text class="qe-l" x="200" y="59" text-anchor="middle">터미널 UI (React + Ink)</text>
<path class="qe-a" d="M200 70 L200 84"/>
<rect class="qe-core" x="60" y="86" width="280" height="32" rx="5"/>
<text class="qe-w" x="200" y="107" text-anchor="middle">QueryEngine.ts · 46,000줄</text>
<path class="qe-a" d="M200 118 L200 132"/>
<rect class="qe-box" x="20" y="134" width="360" height="44" rx="5"/>
<text class="qe-l" x="36" y="154">시스템 프롬프트 조합</text>
<text class="qe-n" x="36" y="172">경계 마커 기준 정적 · 동적</text>
<path class="qe-a" d="M200 178 L200 192"/>
<rect class="qe-box" x="20" y="194" width="360" height="44" rx="5"/>
<text class="qe-l" x="36" y="214">도구 라우팅</text>
<text class="qe-n" x="36" y="232">권한 판정 후 실행 · 결과 스트리밍</text>
<path class="qe-a" d="M200 238 L200 252"/>
<rect class="qe-box" x="20" y="254" width="360" height="44" rx="5"/>
<text class="qe-l" x="36" y="274">컨텍스트 갱신</text>
<text class="qe-n" x="36" y="292">자동 압축 · 토큰 추정</text>
<text class="qe-n" x="200" y="326" text-anchor="middle">원본 대화는 JSONL로 별도 보존</text>
</svg>
</div>

눈에 띄는 것은 부팅 최적화입니다. OpenTelemetry, gRPC처럼 무거운 모듈은 실제로 필요해질 때까지 임포트를 미룹니다. 그리고 시작 시점에 하는 일(키체인 읽기, MDM 설정 확인, API 사전 연결)을 모듈 초기화와 겹쳐서 병렬로 돌립니다. CLI 도구에서 체감 시작 속도가 무엇으로 결정되는지 알고 짠 코드입니다.

## 도구 40여 개를 빌드 타임에 걸러내기

Claude Code에는 40개가 넘는 도구가 등록돼 있습니다. 파일 읽기와 편집, 글롭과 그렙, bash 실행, 웹 검색과 페치, 서브에이전트 생성과 에이전트 간 메시지, MCP 서버 호출, 스킬 실행, 작업 추적, Git worktree 격리 같은 것들입니다. 각 도구는 자체 입력 스키마와 권한 게이트를 갖고 독립 모듈로 존재합니다.

도구 실행 결과는 async generator로 흘려보냅니다. 긴 bash 명령이나 큰 파일을 읽을 때 결과가 생기는 대로 UI에 반영되는 이유가 이것입니다. 결과가 지나치게 커지면(도구 하나에 5만 자, 메시지 전체로 20만 자를 넘으면) 컨텍스트에 다 싣지 않고 디스크로 내린 뒤 미리보기만 남깁니다. 같은 파일을 한 턴에 두 번 읽는 것도 이전 읽기 시각을 확인해 걸러 냅니다.

모든 도구가 항상 활성화되는 것은 아닙니다. Bun의 `bun:bundle`이 제공하는 `feature()`를 컴파일 타임 플래그로 써서 죽은 코드 제거를 수행합니다. 유출된 소스에는 이런 플래그가 44개, 그 뒤에 가려진 모듈이 108개 있었습니다.

여기서 층위를 구분해야 합니다. 빌드 타임 플래그는 그 코드가 바이너리에 들어가는지를 정하고, 들어간 뒤 실제로 켜는 것은 별개입니다. 예를 들어 Coordinator Mode는 빌드에 포함된 상태에서 환경 변수 `CLAUDE_CODE_COORDINATOR_MODE=1`로 활성화됩니다. 반대로 사내 전용 기능은 외부 배포 빌드에서 아예 빈 함수가 되어 사라집니다.

이 방식의 이점은 배포 바이너리 크기를 줄이면서도 내부적으로는 실험 기능을 계속 개발할 수 있다는 데 있습니다. 사내 빌드와 외부 빌드의 차이가 코드 레벨이 아니라 빌드 레벨에서 관리됩니다. 실제로 `USER_TYPE === 'ant'` 여부에 따라 시스템 프롬프트 자체가 구조적으로 달라집니다.

## 도구 하나가 실행되기까지

AI 에이전트에서 가장 민감한 문제는 "이 도구를 실행해도 되는가"입니다. Claude Code는 이 판단을 성격이 다른 여러 관문으로 쪼개 놓았습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 350" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="도구 실행 요청이 거부 규칙, bash 전용 정적 검사, auto 모드 분류기, 사용자 확인을 차례로 지나며 연속 차단 시 수동 모드로 돌아가는 권한 판정 흐름">
<style>
.pm-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.pm-l { fill: var(--text, #1c1917); font-size: 14px; }
.pm-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.pm-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pm-stop { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.pm-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#pmArrow); }
</style>
<defs>
<marker id="pmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="pm-t" x="200" y="22" text-anchor="middle">도구 하나가 실행되기까지</text>
<rect class="pm-box" x="110" y="38" width="180" height="30" rx="5"/>
<text class="pm-l" x="200" y="58" text-anchor="middle">도구 실행 요청</text>
<path class="pm-a" d="M200 68 L200 82"/>
<rect class="pm-stop" x="20" y="84" width="360" height="44" rx="5"/>
<text class="pm-l" x="36" y="104">deny 규칙과 보호 경로</text>
<text class="pm-n" x="36" y="122">일치 시 차단</text>
<path class="pm-a" d="M200 128 L200 142"/>
<rect class="pm-box" x="20" y="144" width="360" height="44" rx="5"/>
<text class="pm-l" x="36" y="164">bash 전용 정적 검사</text>
<text class="pm-n" x="36" y="182">번호 붙은 23개 항목</text>
<path class="pm-a" d="M200 188 L200 202"/>
<rect class="pm-box" x="20" y="204" width="360" height="44" rx="5"/>
<text class="pm-l" x="36" y="224">auto 모드 분류기</text>
<text class="pm-n" x="36" y="242">별도 모델 호출 · 의도 일치 판정</text>
<path class="pm-a" d="M200 248 L200 262"/>
<rect class="pm-box" x="20" y="264" width="360" height="44" rx="5"/>
<text class="pm-l" x="36" y="284">사용자 확인</text>
<text class="pm-n" x="36" y="302">결정을 규칙으로 저장</text>
<text class="pm-n" x="200" y="336" text-anchor="middle">연속 3회 차단 → 수동 모드 복귀</text>
</svg>
</div>

### 도구 단위로 적는 규칙

사용자가 한 번 승인한 패턴은 규칙으로 남습니다. 공개된 설정 스키마에서는 `permissions` 아래 세 종류의 목록으로 표현됩니다.

```json
{
  "permissions": {
    "allow": ["Bash(npm run test *)", "Read(~/.zshrc)"],
    "deny": ["Bash(curl *)", "Read(./.env)"],
    "ask": ["Bash(git push *)"]
  }
}
```

형식은 `ToolName(패턴)`입니다. 명령 문자열만 덩그러니 넣는 방식이 아니라 어떤 도구에 대한 규칙인지를 함께 적습니다. `ask`는 자동 승인을 우회합니다. 위험하지는 않지만 항상 의식하고 실행하고 싶은 명령에 유용합니다.

권한 규칙은 다른 설정과 병합 방식이 다릅니다. 상위 범위가 하위 범위를 덮어쓰는 게 아니라 여러 범위의 규칙이 합쳐집니다. 조직이 건 `deny`를 개인 설정으로 지울 수 없다는 뜻입니다.

### bash 전용 정적 검사

셸 명령은 문자열 하나에 무엇이든 담을 수 있어서 규칙 매칭만으로는 부족합니다. `bashSecurity.ts`는 2,592줄에 걸쳐 번호 붙은 23개 검사를 돌립니다. zsh의 `=cmd` 확장, 프로세스 치환, ANSI-C 인용, 히어독을 통한 명령 주입 같은 우회 경로를 하나씩 막습니다.

셸 문법 우회를 정규식으로 잡으려다 실패하는 것은 흔한 실수입니다. 검사 목록에 번호를 붙여 놓았다는 것 자체가, 이 목록이 사고가 날 때마다 한 줄씩 늘어난 결과물임을 보여줍니다.

### auto 모드의 분류기

auto 모드에서는 `yoloClassifier.ts`가 도구 호출마다 별도의 분류기 모델을 호출합니다. 1,495줄짜리 이 모듈이 보는 것은 "이 명령이 위험한가"만이 아닙니다. **이 호출이 사용자가 요청한 작업과 실제로 맞는지**를 함께 판정합니다. 안전하지만 엉뚱한 동작을 걸러 내려는 설계입니다.

그리고 분류기를 신뢰하되 무한정 신뢰하지는 않습니다. 연속 3회 또는 누적 20회가 차단되면 자동 승인을 멈추고 사용자에게 매번 묻는 모드로 되돌립니다. 자동화가 잘못된 방향으로 반복되는 상황을 시간이 아니라 실패 횟수로 끊는 장치입니다.

### 설정 우선순위

설정이 여러 곳에서 올 수 있을 때는 명확한 우선순위가 필요합니다. 공개된 문서 기준 순서는 이렇습니다.

| 순위 | 범위 | 특징 |
|---|---|---|
| 1 | 기업 관리(Managed) | CLI 인자로도 덮어쓸 수 없음 |
| 2 | 명령줄 인자 | 세션 한정 |
| 3 | `.claude/settings.local.json` | 개인 로컬 |
| 4 | `.claude/settings.json` | 프로젝트 공유 |
| 5 | 사용자 설정 디렉토리 | 기본값 |

기업 관리 설정이 맨 위에 있고 CLI 인자로도 못 뚫는다는 점이 핵심입니다. 조직이 건 정책을 개발자가 플래그 하나로 우회할 수 있으면 관리 도구로서 의미가 없기 때문입니다. 권한 규칙이 덮어쓰기가 아니라 병합으로 동작하는 것도 같은 이유입니다.

## 캐시가 깨지지 않게 프롬프트를 자르는 법

LLM API 비용에서 큰 몫을 차지하는 것은 시스템 프롬프트입니다. 매 턴 같은 내용을 다시 보내야 하니까요. Claude Code는 이 문제를 경계 마커 하나로 풉니다.

`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`를 기준으로 시스템 프롬프트가 두 영역으로 갈립니다. 경계 위에는 900줄 규모의 정적 지침과 도구 정의, 권한 규칙이 들어가고, 경계 아래에는 git status와 CLAUDE.md, 날짜처럼 매번 바뀌는 것들이 들어갑니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="경계 마커 위쪽의 정적 영역은 캐시되고 아래쪽의 동적 영역은 캐시되지 않는 시스템 프롬프트 구조">
<style>
.pc-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.pc-l { fill: var(--text, #1c1917); font-size: 14px; }
.pc-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.pc-m { fill: var(--accent, #9d5604); font-size: 14px; }
.pc-hit { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.pc-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pc-line { stroke: var(--accent, #9d5604); stroke-width: 2; stroke-dasharray: 6 4; }
</style>
<text class="pc-t" x="200" y="22" text-anchor="middle">경계 마커가 나누는 두 영역</text>
<rect class="pc-hit" x="20" y="38" width="360" height="76" rx="6"/>
<text class="pc-l" x="36" y="60">경계 위 · 정적</text>
<text class="pc-n" x="36" y="80">도구 정의 · 지침 · 권한 규칙</text>
<text class="pc-n" x="36" y="100">요청마다 동일 → 캐시 히트</text>
<path class="pc-line" d="M20 128 L380 128"/>
<text class="pc-m" x="200" y="147" text-anchor="middle">SYSTEM_PROMPT_DYNAMIC_BOUNDARY</text>
<rect class="pc-box" x="20" y="158" width="360" height="76" rx="6"/>
<text class="pc-l" x="36" y="180">경계 아래 · 동적</text>
<text class="pc-n" x="36" y="200">git status · CLAUDE.md · 날짜</text>
<text class="pc-n" x="36" y="220">세션마다 변동 → 캐시 제외</text>
<text class="pc-n" x="200" y="258" text-anchor="middle">접두사 한 바이트 변경 → 이후 전부 무효</text>
<text class="pc-n" x="200" y="282" text-anchor="middle">캐시는 조직 · 워크스페이스 단위 격리</text>
</svg>
</div>

프롬프트 캐시는 접두사 일치로 동작합니다. 경계보다 앞쪽에서 한 바이트라도 달라지면 그 뒤가 전부 무효가 됩니다. 그래서 변하는 것을 뒤로 몰아 두는 배치만으로 캐시 히트율이 크게 달라집니다.

이 원칙을 지키기가 생각보다 까다롭다는 것도 코드에 드러납니다. `promptCacheBreakDetection.ts`는 캐시를 깨뜨릴 수 있는 경로를 14가지로 나눠 추적합니다. 날짜를 세션 시작 시점에 메모이즈해 두는 처리도 있는데, 자정을 넘길 때 날짜 문자열이 바뀌면서 캐시가 통째로 무효화되는 것을 막기 위한 것입니다. CLAUDE.md나 MCP 서버 설정이 세션 도중 바뀌는 경우도 같은 목록에서 관리합니다.

:::warning

**캐시는 조직과 워크스페이스 단위로 격리됩니다**

"정적이니까 전 세계 모든 사용자가 하나의 캐시를 공유한다"고 오해하기 쉽지만 그렇지 않습니다. Anthropic 공식 문서는 조직 간 캐시 공유가 절대 일어나지 않으며, Claude API에서는 조직 안에서도 워크스페이스 단위로 격리된다고 명시합니다. 프롬프트가 완전히 동일해도 마찬가지입니다. 경계 마커가 주는 이득은 남과 캐시를 나눠 쓰는 것이 아니라, 내 요청들 사이에서 앞부분이 계속 재사용되는 것입니다.

:::

## 컨텍스트가 넘칠 때

컨텍스트 윈도우는 유한하고, 긴 코딩 세션에서는 금방 한계에 닿습니다. Claude Code는 남은 여유가 13,000 토큰 아래로 떨어지면 자동 압축을 시작합니다. 이전 메시지를 모델에게 요약시켜 스무 개의 메시지를 요약 하나와 최근 메시지 몇 개로 줄이는 방식입니다.

중요한 것은 원본을 버리지 않는다는 점입니다. 전체 대화 이력은 JSONL 파일로 그대로 남고, API로 보내는 메시지만 압축된 버전으로 교체됩니다. 압축이 끝나면 메타데이터를 다시 붙여 이후 세션에서도 이력을 되짚을 수 있게 합니다.

출력 토큰도 한 번에 크게 잡지 않습니다. 기본 상한을 8,000 토큰으로 두고, 잘려 나갈 때마다 단계적으로 올려 최대 64,000까지 확장합니다. 필요할 때만 늘리는 방식이라 대부분의 요청이 작은 상한 안에서 끝납니다.

세션을 넘어 남는 기억은 두 갈래입니다. CLAUDE.md는 프로젝트에 체크인되어 팀원과 공유되며, 현재 디렉토리에서 파일시스템 루트까지 거슬러 올라가며 발견됩니다. 가까운 파일이 먼 파일을 덮어씁니다. MEMORY.md는 개인 메모리의 색인 역할을 하고, 세부 내용은 필요할 때 따로 읽어 옵니다.

메모리를 다루는 규칙은 보수적입니다. 하루가 지난 메모리에는 오래됐다는 표시가 붙고, 에이전트는 메모리를 사실이 아니라 힌트로 취급하도록 지시받습니다. 과거의 요약이 현재의 코드와 어긋날 수 있다는 전제를 시스템에 박아 둔 것입니다.

## Coordinator Mode, 프롬프트로 짠 오케스트레이션

가장 야심찬 설계는 `coordinatorMode.ts`입니다. 환경 변수 `CLAUDE_CODE_COORDINATOR_MODE=1`로 켜면 하나의 코디네이터가 여러 워커 에이전트를 지휘하는 구조로 바뀝니다. 워커는 각자 격리된 컨텍스트에서 제한된 도구 권한만 갖고 돌아갑니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 310" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="코디네이터가 세 워커에게 작업을 분배하고 워커들이 공유 스크래치패드를 통해 간접적으로 지식을 주고받는 구조">
<style>
.cd-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.cd-l { fill: var(--text, #1c1917); font-size: 14px; }
.cd-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.cd-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.cd-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.cd-top { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.cd-pad { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.cd-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#cdArrow); }
</style>
<defs>
<marker id="cdArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
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

오케스트레이션 알고리듬은 코드가 아니라 프롬프트입니다. 작업을 어떻게 쪼개고 언제 회수할지가 제어 흐름이 아니라 코디네이터의 시스템 프롬프트에 자연어로 적혀 있습니다.

그중에서도 위임의 한계를 못 박아 둔 문장들이 눈에 띕니다.

> "You must understand findings before directing follow-up work."
>
> "Do not rubber-stamp weak work."

후속 작업을 지시하기 전에 반드시 결과를 직접 이해해야 하고, 이해하는 일 자체를 다른 워커에게 떠넘기지 말라는 것입니다. `"based on your findings"` 같은 표현은 아예 금지 문구로 지정돼 있습니다. 결과를 읽지 않은 채 그 말만 붙여 다음 워커에게 넘기는 패턴을 막으려는 장치입니다. 멀티에이전트 시스템에서 가장 흔한 실패가 정확히 이것인데, 이를 프롬프트 레벨에서 명시적으로 금지합니다.

작업은 조사, 종합, 구현, 검증의 네 단계로 흐르고, 워커의 결과는 `<task-notification>` XML 블록에 담겨 코디네이터에게 돌아옵니다.

워커들은 서로 직접 통신하지 않습니다. 대신 공유 스크래치패드 디렉토리를 통해 간접적으로 지식을 주고받습니다. 한 워커가 발견한 정보를 파일로 남기면 다른 워커가 필요할 때 읽는 방식입니다. 직접 통신을 허용하면 의존성이 복잡해지고 교착이나 무한 루프가 생기기 쉬운데, 파일 기반 공유는 느린 대신 그런 상태에 빠지지 않습니다.

## 마치며

유출된 코드에서 확인되는 것은, AI 에이전트도 결국 소프트웨어 엔지니어링의 기본을 그대로 따른다는 점입니다. 도구마다 독립된 스키마와 권한을 두는 모듈화, 권한과 설정에 뚜렷한 우선순위를 두는 계층화, 정적과 동적을 물리적으로 갈라놓는 관심사 분리가 전부입니다. 새로운 개념은 없습니다.

달라진 것은 제약 조건입니다. 전통적인 소프트웨어에서 캐시는 있으면 좋은 최적화지만, LLM 에이전트에서는 프롬프트를 어떤 순서로 조립하느냐가 곧 비용입니다. 컨텍스트를 언제 어떻게 버릴지가 대화를 이어갈 수 있느냐를 결정합니다. 그래서 이 코드에서 배울 만한 대목은 화려한 구조가 아니라, 경계 마커 하나와 실패 횟수 상한 하나처럼 작고 구체적인 장치들입니다.

한 가지는 짚고 넘어가야 합니다. 이 글의 근거는 배포 사고로 잠시 공개됐던 코드이고, 공식 문서가 아닙니다. 공개된 설정 스키마와 문서로 확인 가능한 부분은 그쪽을 기준으로 삼았지만, 내부 파일 이름과 플래그는 그 시점의 스냅샷일 뿐 지금도 같다는 보장은 없습니다.

## 함께 보면 좋은 글

- [Claude Code 소스코드 51만줄 유출, 그 안에서 나온 7가지](/issue/claude-code-source-leak/) : 유출 경위와 코드에서 나온 미공개 기능들
- [AI Agent의 퍼미션 시스템](/agent/agent-permission-safety/) : 도구 실행 전에 거치는 판단 단계
- [AI Agent의 컴팩션 파이프라인](/agent/compaction-pipeline/) : 토큰 윈도우를 지키는 압축 절차
- [AI Agent의 멀티에이전트 시스템](/agent/multi-agent-systems/) : 여러 에이전트가 협력할 때 생기는 문제들

## 참고자료

- [Alex Kim: The Claude Code Source Leak](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude Code: Settings](https://code.claude.com/docs/en/settings)
- [Layer5: The Claude Code Source Leak, 512,000 Lines](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
