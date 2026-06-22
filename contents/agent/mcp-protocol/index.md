---
date: '2026-06-23'
title: 'AI Agent의 MCP: 에이전트가 외부 도구를 연결하는 표준 프로토콜'
category: 'AI Agent'
series: 'agent'
seriesOrder: 9
tags: ['MCP', 'AI Agent', 'Model Context Protocol', 'Tool Search', 'Claude Code']
summary: 'MCP의 Client-Server 아키텍처와 세 가지 프리미티브, 도구 폭발을 85% 줄이는 Tool Search, 에이전트 루프와의 통합까지. 에이전트가 외부 서비스를 표준화된 방식으로 연결하는 구조를 살펴봅니다.'
thumbnail: './thumbnail.png'
---

Claude Code에 GitHub, Slack, Sentry, Grafana, Splunk 다섯 개의 외부 서비스를 연결하면 58개의 도구가 등장합니다. 이 도구들의 스키마 정의만으로 약 55,000 토큰을 소비합니다. 대화가 시작되기도 전에 200K 토큰 윈도우의 4분의 1 이상이 도구 설명으로 채워지는 것입니다. Jira까지 추가하면 17,000 토큰이 더 늘어나 100K를 넘깁니다. 도구가 많아질수록 에이전트가 느려지는 역설입니다.

이 문제의 근본 원인은 두 가지입니다. 첫째, 외부 서비스마다 연결 방식이 다릅니다. GitHub는 REST API, Slack은 WebSocket, Sentry는 GraphQL. 에이전트가 새로운 서비스를 추가할 때마다 커스텀 통합 코드를 작성해야 합니다. 둘째, 모든 도구의 스키마를 미리 로딩합니다. 58개 중 이번 대화에서 실제로 쓰이는 도구는 3~5개에 불과한데, 나머지 53개의 정의가 컨텍스트를 점유합니다.

MCP(Model Context Protocol)는 이 두 문제를 동시에 해결하려는 표준 프로토콜입니다. 이 글에서는 MCP의 아키텍처, 도구 폭발을 줄이는 최적화 전략, 그리고 에이전트 루프와의 통합을 살펴봅니다.

---

## M×N 문제: 왜 표준이 필요한가

에이전트 생태계에서 M개의 에이전트 플랫폼(Claude Code, Cursor, Windsurf, Codex 등)이 N개의 외부 서비스(GitHub, Slack, Jira, DB, 모니터링 도구 등)와 연결되어야 한다고 가정합니다. 표준이 없으면 M×N개의 커스텀 통합이 필요합니다.

```
M 에이전트 × N 서비스 = M×N 커스텀 통합

에이전트 3개 × 서비스 10개 = 30개 커스텀 통합
```

USB가 등장하기 전의 주변기기 시장과 같은 상황입니다. 프린터, 스캐너, 키보드가 각각 고유한 포트와 드라이버를 요구했고, 새 기기를 추가할 때마다 호환성 문제가 발생했습니다. USB-C가 이 문제를 M+N으로 줄인 것처럼, MCP는 에이전트와 외부 서비스 사이에 표준 인터페이스를 제공합니다.

```
M 에이전트 + N 서비스 = M + N 구현

에이전트 3개 + 서비스 10개 = 13개 구현
```

MCP 이전에 Claude Code의 도구는 하드코딩된 내장 도구였습니다. `Read`, `Write`, `Bash`, `Grep` 같은 도구는 코드베이스에 직접 정의되어 있고, 새로운 도구를 추가하려면 소스 코드를 수정해야 했습니다. [세 번째 글](/agent/agent-tool-use/)에서 분석한 26개 내장 도구가 바로 이런 방식입니다.

MCP가 도입된 이후, 외부 서비스를 MCP 서버로 한 번 구현하면 MCP를 지원하는 모든 에이전트에서 사용할 수 있게 됩니다. Claude Code뿐 아니라 Cursor, Windsurf, 그리고 커스텀 에이전트까지 동일한 MCP 서버를 공유합니다.

| 관점 | MCP 이전 | MCP 이후 |
|------|---------|---------|
| 도구 추가 | 에이전트 소스 코드 수정 | MCP 서버 연결 설정만 추가 |
| 호환성 | 에이전트별 커스텀 통합 | 한 번 구현, 모든 에이전트에서 사용 |
| 도구 생태계 | 에이전트 개발팀이 직접 구현 | 커뮤니티가 독립적으로 서버 개발 |
| 업데이트 | 에이전트 전체 배포 필요 | 서버만 독립 업데이트 |

---

## 프로토콜 아키텍처

MCP는 Microsoft의 LSP(Language Server Protocol)에서 영감을 받았습니다. LSP가 "VS Code, Vim, Emacs 등 M개의 에디터가 TypeScript, Python, Rust 등 N개의 언어를 지원하는 M×N 문제"를 표준화한 것처럼, MCP는 에이전트와 외부 서비스 사이의 동일한 문제를 풉니다.

### Host, Client, Server

MCP는 세 가지 역할로 구성됩니다.

```
┌─────────────────────────────────────────┐
│            Host (에이전트 앱)              │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Client 1 │ │ Client 2 │ │ Client 3 │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ │
└───────┼────────────┼────────────┼───────┘
        │            │            │
   ┌────▼─────┐ ┌────▼─────┐ ┌───▼──────┐
   │ Server 1 │ │ Server 2 │ │ Server 3 │
   │ (GitHub) │ │ (Slack)  │ │ (DB)     │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │             │
   ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐
   │ GitHub   │ │ Slack    │ │ PostgreSQL│
   │ API      │ │ API      │ │          │
   └──────────┘ └──────────┘ └──────────┘
```

**Host**는 에이전트 애플리케이션 자체입니다. Claude Code, Cursor, 또는 직접 만든 에이전트가 Host입니다. Host는 여러 개의 Client를 생성하고 관리하며, 보안 정책과 사용자 승인을 제어합니다. LLM과의 통합도 Host의 책임입니다.

**Client**는 Host 안에서 생성되는 커넥터입니다. 각 Client는 정확히 하나의 Server와 1:1 관계를 맺습니다. Client는 Server와의 프로토콜 협상, 메시지 라우팅, 구독 관리를 담당합니다. 중요한 설계 결정은 **Client 간 격리**입니다. GitHub Server에 연결된 Client는 Slack Server의 데이터에 접근할 수 없습니다.

**Server**는 외부 서비스를 MCP 프리미티브로 노출하는 독립 프로세스입니다. 각 Server는 자신이 제공하는 기능에만 집중하고, Host의 전체 대화 기록에는 접근할 수 없습니다. Server는 로컬 프로세스(파일시스템, Git)일 수도 있고, 원격 서비스(클라우드 API)일 수도 있습니다.

### 세 가지 프리미티브

Server가 Client에게 제공하는 기능은 세 가지 프리미티브로 표현됩니다.

| 프리미티브 | 제어 주체 | 역할 | 예시 |
|-----------|----------|------|------|
| **Resources** | 애플리케이션(Client) | 읽기 전용 데이터 제공 | 파일 내용, Git 히스토리, DB 스키마 |
| **Tools** | 모델(LLM) | 실행 가능한 함수 | API 호출, 파일 쓰기, 쿼리 실행 |
| **Prompts** | 사용자 | 미리 정의된 템플릿 | 슬래시 커맨드, 메뉴 옵션 |

제어 주체의 차이가 핵심입니다. **Resources**는 애플리케이션이 언제 어떤 데이터를 컨텍스트에 포함할지 결정합니다. **Tools**는 LLM이 언제 어떤 함수를 호출할지 결정합니다. **Prompts**는 사용자가 명시적으로 선택합니다.

[세 번째 글](/agent/agent-tool-use/)에서 분석한 Claude Code의 내장 도구(`Read`, `Write`, `Bash`)는 모두 Tools에 해당합니다. MCP는 여기에 Resources와 Prompts를 추가하여, 도구 호출 외에 "데이터를 컨텍스트에 첨부"하거나 "사전 정의된 워크플로우를 실행"하는 패턴까지 표준화합니다.

### 전송 계층

MCP는 JSON-RPC 2.0 메시지 포맷을 사용하며, 두 가지 전송 방식을 지원합니다.

**stdio**: 로컬 프로세스 통신입니다. Host가 Server를 자식 프로세스로 실행하고, stdin/stdout으로 메시지를 교환합니다. Claude Code에서 로컬 MCP 서버(파일시스템, Git 등)가 이 방식을 사용합니다. 설정이 간단하고 지연이 낮습니다.

**Streamable HTTP**: 원격 서버 통신입니다. HTTP POST로 요청을 보내고, Server-Sent Events(SSE)로 응답을 스트리밍합니다. 클라우드에 배포된 MCP 서버나 공유 서비스에 적합합니다. 인증, 라우팅, 로드밸런싱 같은 HTTP 인프라를 그대로 활용할 수 있습니다.

### 연결 수명주기

Client와 Server 사이의 세션은 네 단계를 거칩니다.

```
Client                          Server
  │                               │
  │──── initialize ──────────────▶│  1. 클라이언트가 프로토콜 버전과
  │◀─── capabilities ────────────│     지원 기능을 교환
  │                               │
  │──── initialized ────────────▶│  2. 초기화 완료 통지
  │                               │
  │◀─── tools/list ──────────────│  3. 사용 가능한 도구/리소스 탐색
  │──── tools/call ──────────────▶│  4. 실제 작업 수행
  │◀─── result ──────────────────│
  │          ...                  │
  │                               │
  │──── shutdown ────────────────▶│  5. 세션 종료
  │                               │
```

capability 교환이 중요한 이유는, Server마다 지원하는 기능이 다르기 때문입니다. 어떤 Server는 Tools만 제공하고, 어떤 Server는 Resources와 Prompts까지 지원합니다. Client는 초기화 단계에서 Server의 능력을 파악하고, 세션 동안 선언된 기능만 사용합니다.

---

## 도구 폭발과 세 가지 최적화 전략

MCP의 아키텍처가 M×N 문제를 풀었다면, 다음 문제는 규모입니다. MCP 서버를 연결할수록 도구 수가 선형으로 증가하고, 각 도구의 스키마가 컨텍스트를 점유합니다. Anthropic은 이 문제에 세 가지 최적화 전략을 제시합니다.

### 전략 1: Tool Search (85% 토큰 절감)

기본적으로 MCP 서버의 모든 도구 스키마가 시스템 프롬프트에 포함됩니다. 50개 도구면 약 72,000 토큰입니다. Tool Search는 이 접근을 뒤집습니다.

핵심 아이디어는 **deferred schemas**(지연 스키마)입니다. 도구 정의에 `defer_loading: true`를 설정하면 해당 도구의 스키마가 초기 컨텍스트에서 제외됩니다. 대신 Tool Search라는 메타 도구만 로딩되고, LLM이 특정 기능이 필요할 때 이 메타 도구를 호출하여 관련 도구를 동적으로 탐색합니다.

```python
# 전통적 방식: 모든 도구 스키마를 미리 로딩
tools = [github_tools + slack_tools + sentry_tools]  # ~72K tokens

# Tool Search 방식: 메타 도구만 로딩
tools = [
    tool_search_tool,     # ~500 tokens
    frequently_used_tools  # ~3K tokens (defer_loading: false인 도구만)
]
# 필요할 때 동적으로 로딩: ~3-5개 도구 = ~5K tokens
```

결과는 명확합니다. 72,000 토큰이 약 8,700 토큰으로 줄어들어 **85% 절감**. 단순히 토큰을 아끼는 것이 아니라, 모델이 58개 도구 중에서 올바른 도구를 고르는 정확도도 향상됩니다. Anthropic의 내부 평가에서 Opus 4의 MCP 도구 선택 정확도가 49%에서 74%로 올랐습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 프롬프트 캐싱과의 호환</strong><br>
  Tool Search는 프롬프트 캐싱을 깨뜨리지 않습니다. 지연된 도구는 초기 프롬프트에서 완전히 제외되므로, 시스템 프롬프트와 핵심 도구 정의가 캐시 프리픽스로 안정적으로 유지됩니다. 동적으로 로딩된 도구는 캐시 프리픽스 뒤에 추가됩니다.
</div>

### 전략 2: Programmatic Tool Calling (37% 토큰 절감)

Tool Search가 "어떤 도구를 로딩할 것인가"의 문제라면, Programmatic Tool Calling은 "도구를 어떻게 실행할 것인가"의 문제입니다.

전통적인 에이전트 루프에서 모델이 도구를 호출하면, 결과가 컨텍스트에 추가되고, 모델이 다음 행동을 결정합니다. 도구를 20번 호출하면 20번의 모델 추론이 필요하고, 중간 결과가 모두 컨텍스트에 쌓입니다.

Programmatic Tool Calling은 모델이 Python 코드를 작성하여 여러 도구 호출을 한 번에 오케스트레이션합니다. 코드는 샌드박스에서 실행되고, 중간 결과는 코드 안에서 처리됩니다. 최종 출력만 모델의 컨텍스트로 돌아옵니다.

```python
# 전통적 방식: 20번의 모델 추론, 중간 결과 모두 컨텍스트에 축적
# Turn 1: 모델 → get_team_members() → 결과 5명 → 컨텍스트에 추가
# Turn 2: 모델 → get_expenses(member_1) → 결과 400건 → 컨텍스트에 추가
# Turn 3: 모델 → get_expenses(member_2) → 결과 350건 → 컨텍스트에 추가
# ... (20턴, ~50KB의 중간 결과가 컨텍스트에 쌓임)

# Programmatic 방식: 모델이 코드를 한 번 작성, 샌드박스에서 실행
async def check_budget_compliance():
    members = await get_team_members()
    tasks = [get_expenses(m.id) for m in members]
    all_expenses = await asyncio.gather(*tasks)  # 병렬 실행

    over_budget = []
    for member, expenses in zip(members, all_expenses):
        total = sum(e.amount for e in expenses)
        if total > member.budget:
            over_budget.append(f"{member.name}: {total}/{member.budget}")

    print("\n".join(over_budget))  # stdout만 컨텍스트로 반환
```

2,000건 이상의 경비 데이터(~50KB)가 코드 안에서 처리되고, 컨텍스트로 돌아오는 것은 예산 초과 인원 2~3명의 이름(~1KB)뿐입니다. Anthropic의 벤치마크에서 평균 43,588 토큰이 27,297 토큰으로 줄어 **37% 절감**되었습니다.

### 전략 3: Code Execution with MCP (98.7% 토큰 절감)

가장 극단적인 최적화입니다. MCP 서버의 도구를 LLM이 직접 호출하는 대신, 코드 실행 환경에서 Python 함수처럼 호출합니다. 플랫폼이 MCP 도구 정의를 Python 함수로 자동 변환하고, 모델이 작성한 코드 안에서 이 함수들을 직접 호출합니다.

Programmatic Tool Calling이 "모델이 코드를 작성하고 도구 호출 결과를 코드 내에서 처리"하는 것이라면, Code Execution with MCP는 여기에 "도구 스키마 자체도 컨텍스트에서 제외"하는 것을 더합니다. 도구가 코드 내의 함수가 되므로, LLM의 컨텍스트 윈도우에는 실행 결과의 stdout만 들어옵니다.

| 전략 | 해결하는 문제 | 토큰 절감 | 정확도 변화 |
|------|-------------|----------|-----------|
| **Tool Search** | 도구 스키마 로딩 | 85% | 49% → 74% (Opus 4) |
| **Programmatic Tool Calling** | 중간 결과 축적 | 37% | 25.6% → 28.5% (지식 검색) |
| **Code Execution with MCP** | 스키마 + 결과 모두 | 98.7% | MCP 작업 전반 개선 |

세 전략은 상호 배타적이 아닙니다. Tool Search로 필요한 도구만 탐색하고, 탐색된 도구를 Programmatic Tool Calling으로 효율적으로 실행하는 조합이 가능합니다.

---

## 퍼미션과 신뢰 경계

MCP 서버는 에이전트에게 새로운 능력을 부여하는 만큼, 새로운 보안 위험도 함께 가져옵니다. [일곱 번째 글](/agent/agent-permission-safety/)에서 내장 도구의 퍼미션 파이프라인을 분석했는데, MCP 도구에는 추가적인 신뢰 경계가 존재합니다.

### 내장 도구 vs MCP 도구

내장 도구(`Read`, `Bash` 등)는 에이전트 개발팀이 직접 작성한 코드입니다. 도구의 동작, 부작용, 위험도를 개발팀이 완전히 통제합니다. ML 분류기가 `Bash` 도구의 위험도를 판단할 때, `rm -rf`는 위험하고 `ls`는 안전하다는 규칙을 정확히 알고 있습니다.

MCP 도구는 다릅니다. 서드파티가 작성한 코드가 실행됩니다. `github-mcp-server`의 `create_pull_request` 도구가 실제로 무엇을 하는지, 에이전트 개발팀은 코드를 읽지 않는 한 확신할 수 없습니다. MCP 스펙은 이 문제에 대해 명확한 원칙을 제시합니다.

> "Tools represent arbitrary code execution and must be treated with appropriate caution. Descriptions of tool behavior such as annotations should be considered untrusted, unless obtained from a trusted server."

도구의 설명(description)과 어노테이션(annotations)조차 신뢰할 수 없다는 것입니다. `readOnlyHint: true`라고 선언된 도구가 실제로는 데이터를 수정할 수 있습니다. 이것은 힌트(hint)일 뿐, 보장(guarantee)이 아닙니다.

### Tool Annotations

MCP 스펙은 도구의 동작을 설명하는 어노테이션을 정의합니다.

| 어노테이션 | 의미 | 기본값 |
|-----------|------|--------|
| `readOnlyHint` | 환경을 수정하지 않음 | false |
| `destructiveHint` | 데이터를 삭제하거나 비가역적 변경 | true |
| `idempotentHint` | 동일 인자로 반복 호출해도 결과 동일 | false |
| `openWorldHint` | 외부 시스템과 상호작용 | true |

"Hint"라는 접미어가 핵심입니다. 이 값들은 Host가 퍼미션 판단에 참고할 수 있는 힌트이지, 프로토콜이 강제하는 제약이 아닙니다. Claude Code의 `assembleToolPool()`은 이 어노테이션을 읽어서 MCP 도구를 퍼미션 파이프라인에 통합하지만, 신뢰할 수 없는 서버의 어노테이션은 보수적으로 처리합니다.

### 서버 격리

MCP의 가장 중요한 보안 설계 원칙 중 하나는 **서버 간 격리**입니다. MCP 스펙은 이렇게 명시합니다.

> "Servers should not be able to read the whole conversation, nor see into other servers."

각 Server는 독립 프로세스로 실행되며, Host의 전체 대화 기록에 접근할 수 없습니다. Server가 받는 것은 Client가 명시적으로 전달한 요청 파라미터뿐입니다. GitHub Server가 Slack Server의 메시지를 읽거나, 다른 Server의 도구 호출 결과를 볼 수 없습니다. 이 격리는 [일곱 번째 글](/agent/agent-permission-safety/)에서 분석한 Claude Code의 서브에이전트 사이드체인 패턴과 같은 원리입니다. 컨텍스트를 공유하지 않음으로써 보안 경계를 유지합니다.

| 관점 | Claude Code 내장 도구 | MCP 도구 |
|------|---------------------|---------|
| 코드 신뢰 | 개발팀이 직접 작성 | 서드파티 작성 |
| 어노테이션 신뢰 | 완전 신뢰 | 힌트만 참고 |
| 실행 환경 | 에이전트 프로세스 내 | 독립 프로세스 (stdio) 또는 원격 (HTTP) |
| 퍼미션 | ML 분류기 + 규칙 기반 | 사용자 승인 + 서버별 allow/deny |
| 컨텍스트 접근 | 전체 대화 기록 접근 가능 | 요청 파라미터만 접근 |

---

## 직접 구현: MCP 클라이언트와 에이전트 통합

MCP의 핵심 메커니즘을 순수 Python으로 구현합니다. 프로토콜의 실체를 이해하기 위한 최소 구현입니다.

### MCP 클라이언트

먼저 stdio 전송을 사용하는 MCP 클라이언트입니다. Server를 자식 프로세스로 실행하고 JSON-RPC 메시지를 교환합니다.

```python
import json
import asyncio
from dataclasses import dataclass, field

@dataclass
class MCPTool:
    name: str
    description: str
    input_schema: dict
    server_name: str
    annotations: dict = field(default_factory=dict)

@dataclass
class MCPClient:
    server_name: str
    command: list[str]
    process: asyncio.subprocess.Process | None = None
    capabilities: dict = field(default_factory=dict)
    tools: list[MCPTool] = field(default_factory=list)
    _request_id: int = 0

    async def connect(self):
        self.process = await asyncio.create_subprocess_exec(
            *self.command,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        response = await self._send("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {"tools": {}},
            "clientInfo": {"name": "mini-agent", "version": "0.1"},
        })
        self.capabilities = response.get("capabilities", {})
        await self._notify("notifications/initialized", {})

    async def discover_tools(self) -> list[MCPTool]:
        if "tools" not in self.capabilities:
            return []
        response = await self._send("tools/list", {})
        self.tools = [
            MCPTool(
                name=t["name"],
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {}),
                server_name=self.server_name,
                annotations=t.get("annotations", {}),
            )
            for t in response.get("tools", [])
        ]
        return self.tools

    async def call_tool(self, name: str, arguments: dict) -> dict:
        return await self._send("tools/call", {
            "name": name,
            "arguments": arguments,
        })

    async def _send(self, method: str, params: dict) -> dict:
        self._request_id += 1
        message = json.dumps({
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }) + "\n"
        self.process.stdin.write(message.encode())
        await self.process.stdin.drain()

        line = await self.process.stdout.readline()
        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(f"MCP error: {response['error']}")
        return response.get("result", {})

    async def _notify(self, method: str, params: dict):
        message = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }) + "\n"
        self.process.stdin.write(message.encode())
        await self.process.stdin.drain()

    async def disconnect(self):
        if self.process:
            self.process.terminate()
            await self.process.wait()
```

`connect()`에서 capability 교환, `discover_tools()`에서 도구 탐색, `call_tool()`에서 실행. 프로토콜의 핵심 흐름이 세 메서드에 담겨 있습니다.

### Tool Search 패턴

도구 폭발 문제를 해결하는 deferred schema 로딩입니다.

```python
@dataclass
class ToolRegistry:
    clients: list[MCPClient] = field(default_factory=list)
    deferred_tools: dict[str, MCPTool] = field(default_factory=dict)
    active_tools: dict[str, MCPTool] = field(default_factory=dict)

    async def register_server(self, client: MCPClient, defer: bool = True):
        await client.connect()
        tools = await client.discover_tools()
        self.clients.append(client)

        for tool in tools:
            if defer:
                self.deferred_tools[tool.name] = tool
            else:
                self.active_tools[tool.name] = tool

    def search(self, query: str, max_results: int = 5) -> list[MCPTool]:
        query_lower = query.lower()
        scored = []
        for name, tool in self.deferred_tools.items():
            score = 0
            if query_lower in name.lower():
                score += 2
            if query_lower in tool.description.lower():
                score += 1
            if score > 0:
                scored.append((score, tool))

        scored.sort(key=lambda x: -x[0])
        found = [tool for _, tool in scored[:max_results]]

        for tool in found:
            self.active_tools[tool.name] = tool
            self.deferred_tools.pop(tool.name, None)

        return found

    def get_active_schemas(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for t in self.active_tools.values()
        ]
```

`register_server(defer=True)`로 등록된 서버의 도구는 `deferred_tools`에 들어갑니다. 초기 컨텍스트에는 `active_tools`만 포함되고, `search()`가 호출될 때 매칭된 도구가 active로 이동합니다. 프로덕션에서는 BM25나 임베딩 기반 검색을 사용하지만, 핵심 메커니즘은 동일합니다.

### 에이전트 루프 통합

MCP 클라이언트와 Tool Search를 에이전트 루프에 통합합니다.

```python
async def agent_loop_with_mcp(
    task: str,
    registry: ToolRegistry,
    llm_call,
    max_turns: int = 20,
):
    search_tool = {
        "name": "tool_search",
        "description": "Search for available tools by keyword",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
    }

    messages = [{"role": "user", "content": task}]
    active_schemas = registry.get_active_schemas()
    tools = [search_tool] + active_schemas

    for turn in range(max_turns):
        response = await llm_call(messages=messages, tools=tools)
        messages.append({"role": "assistant", "content": response.content})

        tool_calls = [b for b in response.content if b.type == "tool_use"]
        if not tool_calls:
            return response.content

        for call in tool_calls:
            if call.name == "tool_search":
                found = registry.search(call.input["query"])
                result = "\n".join(
                    f"- {t.name}: {t.description}" for t in found
                )
                tools = [search_tool] + registry.get_active_schemas()
            else:
                tool = registry.active_tools.get(call.name)
                if not tool:
                    result = f"Error: tool '{call.name}' not found"
                else:
                    client = next(
                        c for c in registry.clients
                        if c.server_name == tool.server_name
                    )
                    response_data = await client.call_tool(
                        call.name, call.input
                    )
                    result = json.dumps(response_data)

            messages.append({
                "role": "tool",
                "tool_use_id": call.id,
                "content": result,
            })
```

모델이 `tool_search`를 호출하면 deferred 도구를 탐색하여 active로 승격하고, 다음 턴에서 해당 도구를 사용할 수 있게 됩니다. 모델이 MCP 도구를 호출하면, 해당 도구가 등록된 Server의 Client를 찾아서 `call_tool()`을 실행합니다.

### 프로덕션과의 차이

| 관점 | 이 구현 | Claude Code |
|------|--------|-------------|
| 전송 | stdio만 지원 | stdio + Streamable HTTP |
| 검색 | 문자열 매칭 | BM25 + 임베딩 기반 |
| 퍼미션 | 없음 | 7단계 deny-first 파이프라인 |
| 에러 복구 | 없음 | 타임아웃, 재시도, 폴백 |
| 캐싱 | 없음 | 프롬프트 캐싱, 도구 스키마 캐싱 |
| 동시성 | 순차 실행 | concurrent-safe/exclusive 분류 |

실제 Claude Code의 MCP 통합은 `assembleToolPool()`에서 내장 도구와 MCP 도구를 통합하고, 퍼미션 파이프라인과 ML 분류기를 거쳐 실행됩니다. 여기서 구현한 것은 MCP 프로토콜의 핵심 메커니즘인 "연결 → 탐색 → 실행"과 "deferred schema → 동적 로딩"의 뼈대입니다.

---

## 에이전트 간 표준: A2A

MCP가 에이전트와 외부 **도구** 사이의 표준이라면, 에이전트와 **다른 에이전트** 사이의 표준은 아직 없습니다. [이전 글](/agent/multi-agent-systems/)에서 다뤘듯이 Claude Code는 함수 호출과 사이드체인, Anthropic Harness는 파일 기반, Codex는 SQLite 세션을 사용합니다. 시스템마다 다른 내부 프로토콜은 호환되지 않습니다.

Google이 제안한 A2A(Agent-to-Agent) 프로토콜은 이 문제를 풀려는 시도입니다.

| 관점 | MCP | A2A |
|------|-----|-----|
| 연결 대상 | 에이전트 ↔ 도구/서비스 | 에이전트 ↔ 에이전트 |
| 추상화 수준 | 도구 호출 (함수 단위) | 작업 위임 (태스크 단위) |
| 핵심 개념 | Tools, Resources, Prompts | Agent Card, Task, Message |
| 현재 채택 | 프로덕션 수준 (Claude Code, Cursor 등) | 초기 단계 |

A2A의 핵심 개념은 **Agent Card**와 **Task lifecycle**입니다. Agent Card는 에이전트가 자신의 능력을 JSON으로 선언하는 방식으로, MCP Server의 capability 교환과 비슷한 역할입니다. Task는 에이전트 간에 위임되는 작업 단위로, "submitted → working → completed" 같은 상태 전이를 거칩니다.

다만 현재 A2A는 실험 단계입니다. MCP가 이미 프로덕션 에이전트에 광범위하게 채택된 것과 달리, A2A를 프로덕션에서 사용하는 사례는 아직 제한적입니다. 에이전트 간 통신의 표준화가 필요하다는 공감대는 형성되었지만, 구체적인 프로토콜이 어떤 형태로 수렴할지는 열린 질문입니다.

---

## 한계와 열린 문제

### 서버 품질 편차

MCP가 "누구나 서버를 만들 수 있다"는 것은 장점이자 단점입니다. npm 생태계에서 패키지 품질이 천차만별인 것처럼, MCP 서버의 도구 설계 품질도 크게 다릅니다. [세 번째 글](/agent/agent-tool-use/)에서 다룬 ACI 원칙(명확한 네이밍, 최소한의 파라미터, 의미 있는 에러 메시지)을 지키는 서버가 있는 반면, 모호한 설명과 과도한 파라미터로 모델을 혼란스럽게 만드는 서버도 있습니다. 도구 설계가 곧 모델의 성능을 결정하므로, 서버 품질 문제는 에이전트 전체의 성능에 직접 영향을 미칩니다.

### 상태 관리

현재 MCP에서 서버 간 상태 공유는 지원되지 않습니다. GitHub Server에서 생성한 PR의 URL을 Slack Server에 전달하려면, Host가 중간에서 값을 추출하여 다음 도구 호출에 직접 전달해야 합니다. 서버 간 직접 통신 채널이 없으므로, 복잡한 워크플로우에서는 Host의 오케스트레이션 부담이 커집니다.

### 관찰성

어떤 MCP 서버가 얼마나 토큰을 소비하는지, 도구 호출이 얼마나 걸리는지를 표준화된 방식으로 추적하는 메커니즘이 없습니다. 에이전트에 5개 MCP 서버를 연결했을 때 전체 비용의 80%를 차지하는 서버가 어디인지 파악하기 어렵습니다.

### 보안 감사

서드파티 MCP 서버를 사용한다는 것은 외부 코드를 실행한다는 것입니다. npm의 `npm audit`에 해당하는 MCP 서버 보안 감사 도구나 표준은 아직 없습니다. 서버의 소스 코드를 직접 검토하거나, 신뢰할 수 있는 공급자의 서버만 사용하는 것이 현재로서는 유일한 방어 수단입니다.

---

## 마치며

[첫 번째 글](/agent/what-is-ai-agent/)에서 에이전트를 "모델, 도구, 루프"라는 세 가지 요소로 정의했습니다. 시리즈 전체를 관통하는 숫자가 있었습니다. Claude Code에서 AI가 판단하는 로직은 1.6%이고, 나머지 98.4%는 결정론적 인프라입니다. 이 시리즈는 그 98.4%가 무엇으로 구성되어 있는지를 하나씩 해부한 기록입니다. 워크플로우 패턴, 도구 설계, 컨텍스트 관리, 루프 아키텍처, 컴팩션, 퍼미션, 멀티에이전트 조정, 그리고 이 글에서 다룬 외부 연결 프로토콜까지.

MCP가 그 인프라의 마지막 조각입니다. 에이전트가 자신의 내장 도구만으로는 할 수 없는 일, 외부 세계와의 연결을 표준화된 방식으로 가능하게 만듭니다. 에이전트 시스템의 가치는 결국 "무엇과 연결될 수 있는가"에 의해 결정됩니다. MCP는 그 연결의 비용을 M×N에서 M+N으로, 그리고 컨텍스트 비용을 85%에서 98.7%까지 줄이는 표준입니다.

## 참고자료

- [Model Context Protocol Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18)
- [Advanced Tool Use (Anthropic Engineering)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Agent2Agent Protocol (Google)](https://google.github.io/A2A/)
