---
date: '2026-06-07'
title: 'AI Agent의 멀티에이전트 시스템: 여러 에이전트가 협력할 때 생기는 다섯 가지 문제'
summary: '단일 에이전트를 넘어 여러 에이전트가 협력하는 시스템의 설계를 해부합니다. 조정 토폴로지, 상태 공유, 실패 전파, 토큰 경제학, 신뢰 경계라는 다섯 가지 시스템 수준 문제를 Claude Code, Codex, Anthropic Harness의 구현을 통해 비교합니다.'
thumbnail: './thumbnail.png'
series: 'agent'
seriesOrder: 8
category: 'AI Agent'
tags: ['AI Agent', 'Multi-Agent', 'Orchestrator-Workers', 'Claude Code', 'Codex']
---

Anthropic의 multi-agent research system에 복잡한 질문을 던지면, 리드 에이전트(Claude Opus 4)가 질문을 분석하고 3~5개의 서브에이전트(Claude Sonnet 4)를 병렬로 생성합니다. 각 서브에이전트는 독립적으로 웹을 검색하고 문서를 분석한 뒤, 결과를 리드 에이전트에게 돌려줍니다. 리드 에이전트는 결과의 품질을 평가하고, 부족하면 추가 에이전트를 생성하거나 전략을 수정합니다. 하나의 요청이 수십 번의 LLM 호출과 수백만 토큰을 소비하는 과정입니다.

Anthropic이 보고한, 단일 에이전트 대비 **90.2%의 응답 품질 향상**. 하지만 그 이면에는 단일 에이전트에 없던 새로운 종류의 문제들이 있습니다. 에이전트들은 어떻게 조정되는가? 상태는 어떻게 공유하는가? 하나가 실패하면 나머지는 어떻게 되는가? 비용은 어떻게 통제하는가? 누가 누구를 신뢰하는가?

이 글에서는 멀티에이전트 시스템이 만들어내는 다섯 가지 시스템 수준 문제를 해부합니다.

---

## 왜 멀티에이전트인가? 단일 에이전트가 부딪히는 벽

단일 에이전트는 놀라울 만큼 많은 작업을 처리할 수 있습니다. 모델 호출과 도구 실행을 반복하는 에이전트 루프, 컨텍스트가 한계에 다다르면 대화를 압축하는 컴팩션 파이프라인, 도구 실행 전에 위험을 판정하는 퍼미션 시스템. 이런 인프라는 모두 하나의 에이전트가 하나의 작업을 끝까지 처리한다는 전제 위에 서 있습니다.

그런데 이 구조가 한계에 부딪히는 지점이 있습니다.

가장 흔한 신호는 컨텍스트 포화입니다. 대규모 코드베이스에서 여러 파일을 동시에 분석해야 할 때, 하나의 컨텍스트 윈도우에 모든 정보를 담을 수 없습니다. 컴팩션과 구조화된 노트로도 부족한 경우, 여러 에이전트가 각각의 컨텍스트 윈도우에서 독립적으로 탐색하고 결과만 취합하는 것이 더 효과적입니다.

역할 분리가 필요한 경우도 있습니다. 코드를 작성하는 역할과 작성된 코드를 평가하는 역할을 같은 에이전트가 맡으면, 자기 평가 편향이 발생합니다. Anthropic의 harness 연구에서 에이전트가 자신의 작업을 평가할 때 "명백히 품질이 떨어지는 결과에도 자신있게 칭찬하는" 경향을 확인했습니다. 작업자와 평가자를 분리하는 것만으로 품질이 크게 개선됩니다.

마지막으로 병렬 가능한 하위 구조. S&P 500 IT 기업의 이사회 구성원을 모두 찾는 작업을 생각해 봅시다. 단일 에이전트는 순차적으로 한 기업씩 검색하는데, 멀티에이전트 시스템은 여러 기업을 동시에 조사합니다. Anthropic은 이런 병렬화로 단일 에이전트가 느린 순차 검색으로 실패한 질의를 멀티에이전트 시스템이 해결했다고 보고합니다.

그러나 Anthropic은 일관되게 경고합니다.

> "Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."

멀티에이전트는 정확도를 높이지만, 새로운 종류의 복잡성을 도입합니다. 아래 표는 전환의 판단 기준입니다.

| 신호 | 단일 에이전트 대응 | 멀티에이전트 전환 시점 |
|------|-------------------|---------------------|
| 컨텍스트 부족 | 컴팩션 파이프라인 | 컴팩션 후에도 정보가 누락될 때 |
| 품질 불충분 | 프롬프트 개선, 도구 추가 | 자기 평가 편향이 결과를 왜곡할 때 |
| 처리 시간 | 도구 병렬 실행 | 하위 작업이 독립적이고 N개 동시 실행이 가능할 때 |
| 작업 복잡도 | 단계별 계획 수립 | 계획 자체가 동적이고 미리 예측할 수 없을 때 |

---

## 세 가지 조정 토폴로지

여러 에이전트를 묶으려면 조정 방식부터 정해야 합니다. 프로덕션에서 쓰이는 토폴로지는 세 가지입니다.

### 스타 토폴로지: 중앙 오케스트레이터

하나의 중앙 에이전트가 작업을 분해하고, 워커 에이전트에게 위임하고, 결과를 종합하는 Orchestrator-Workers 구조입니다.

Claude Code의 `AgentTool`이 대표적입니다. 서브에이전트가 별도의 git worktree에서 격리 실행되고 요약만 부모에게 반환하는 사이드체인 구조입니다. Codex도 유사한 스타 구조를 사용하되, 깊이 1, 최대 6개 병렬 스레드로 제약합니다.

Anthropic의 multi-agent research system도 스타 토폴로지입니다. 리드 에이전트(Opus)가 3~5개의 서브에이전트(Sonnet)를 병렬로 실행하고, 결과를 평가한 뒤 추가 에이전트를 생성할지 결정합니다.

스타 토폴로지의 핵심 속성은 **중앙 집중적 상태 관리**입니다. 오케스트레이터만 전체 그림을 보고, 워커는 자신의 하위 작업만 압니다. 조정이 단순한 대신, 오케스트레이터가 단일 실패점이 됩니다.

### 파이프라인 토폴로지: 역할 기반 연결과 반복

스타 토폴로지에서 오케스트레이터가 동적으로 작업을 분해한다면, 파이프라인 토폴로지에서는 역할이 미리 정해져 있습니다. 각 에이전트가 특정 역할을 맡고, 기본 흐름은 한 에이전트의 출력이 다음 에이전트의 입력이 됩니다. 다만 순수한 직렬이 아니라, 평가 결과에 따른 피드백 루프가 포함됩니다.

Anthropic의 harness 연구가 이 토폴로지의 대표 사례입니다. Planner, Generator, Evaluator 세 에이전트가 역할을 나눕니다.

- **Planner**: 1~4문장의 프롬프트를 종합적인 제품 스펙으로 변환합니다. "범위에 대해 야심적이되, 상세한 기술 구현보다 제품 컨텍스트와 고수준 설계에 집중하라"는 지침을 받습니다.
- **Generator**: 스펙에 따라 코드를 작성하고 테스트합니다. 스프린트 단위로 작업하며, 각 스프린트 종료 시 자체 평가를 수행합니다. git으로 변경사항을 관리합니다.
- **Evaluator**: Playwright MCP를 사용해 실행 중인 앱을 실제 사용자처럼 조작하며 품질을 평가합니다. 스프린트 계약에 합의된 기준으로 채점합니다.

이 구조에서 핵심은 **스프린트 계약**입니다. 구현을 시작하기 전에 "이 작업이 완료된 상태가 어떤 것인지"를 명확히 정의합니다. 평가 기준이 모호하면 자기 평가 편향과 같은 문제가 발생하기 때문입니다.

비용 벤치마크에서 trade-off가 드러납니다. Anthropic의 harness 연구에서 레트로 비디오 게임 메이커 앱을 구축할 때, 단일 에이전트는 20분에 \$9이지만 핵심 기능이 깨져 있었고, 3-agent 파이프라인은 6시간에 \$200이지만 기능적으로 완성된 결과를 냈습니다. 비용은 약 22배 늘었지만, 결과의 품질 자체가 다릅니다.

### 피어 토폴로지: 수평적 핸드오프

중앙 오케스트레이터 없이 에이전트 간에 제어권이 수평으로 이동하는 구조입니다. OpenAI가 정리한 triage agent 패턴이 여기에 해당합니다. 첫 번째 에이전트가 요청을 분류한 뒤, 전문화된 에이전트에게 대화 전체를 넘깁니다(핸드오프).

피어 토폴로지는 고객 지원처럼 요청 유형에 따라 전문가가 달라지는 도메인에 적합합니다. 하지만 제어 흐름을 추적하기 어렵고, 에이전트 간 상태 일관성을 보장하기 힘듭니다.

<div style="text-align: center; margin: 24px 0;">
<svg viewBox="0 0 480 686" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="세 가지 조정 토폴로지를 위에서 아래로 나란히 보여주는 그림. 스타는 오케스트레이터 하나가 워커 세 개에 작업을 위임하고, 파이프라인은 Planner에서 Generator, Evaluator로 이어지며 Evaluator가 Generator로 피드백을 돌려보내고 파일로 상태를 공유하며, 피어는 Triage가 전문가 A와 B로 요청을 넘기고 두 전문가끼리도 핸드오프합니다.">
<style>
.tp8-title { font-size: 22px; font-weight: 700; text-anchor: middle; }
.tp8-text { font-size: 20px; text-anchor: middle; }
.tp8-sub { font-size: 17px; text-anchor: middle; }
.tp8-arrow { stroke-width: 2; fill: none; marker-end: url(#tp8Head); }
.tp8-arrow-bi { stroke-width: 2; fill: none; marker-end: url(#tp8Head); marker-start: url(#tp8HeadR); }
</style>
<defs>
<marker id="tp8Head" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)" />
</marker>
<marker id="tp8HeadR" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
<path d="M8,0 L0,3 L8,6" fill="var(--text-muted, #6d6762)" />
</marker>
</defs>
<!-- 1. Star topology -->
<text x="240" y="32" class="tp8-title" fill="var(--text, #1c1917)">스타: 중앙 오케스트레이터</text>
<rect x="150" y="46" width="180" height="46" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.15" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="240" y="76" class="tp8-text" fill="var(--text, #1c1917)">오케스트레이터</text>
<line x1="200" y1="92" x2="90" y2="120" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<line x1="240" y1="92" x2="240" y2="120" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<line x1="280" y1="92" x2="390" y2="120" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<rect x="20" y="124" width="140" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="90" y="153" class="tp8-text" fill="var(--text, #1c1917)">워커 1</text>
<rect x="170" y="124" width="140" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="240" y="153" class="tp8-text" fill="var(--text, #1c1917)">워커 2</text>
<rect x="320" y="124" width="140" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="390" y="153" class="tp8-text" fill="var(--text, #1c1917)">워커 3</text>
<text x="240" y="194" class="tp8-sub" fill="var(--text-muted, #6d6762)">Claude Code AgentTool, Codex spawn_agent</text>
<!-- 2. Pipeline topology -->
<text x="240" y="248" class="tp8-title" fill="var(--text, #1c1917)">파이프라인: 역할 기반 연결</text>
<rect x="27" y="264" width="126" height="46" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.15" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="90" y="294" class="tp8-text" fill="var(--text, #1c1917)">Planner</text>
<line x1="155" y1="287" x2="173" y2="287" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<rect x="177" y="264" width="126" height="46" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.15" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="240" y="294" class="tp8-text" fill="var(--text, #1c1917)">Generator</text>
<line x1="305" y1="287" x2="323" y2="287" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<rect x="327" y="264" width="126" height="46" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.15" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="390" y="294" class="tp8-text" fill="var(--text, #1c1917)">Evaluator</text>
<path d="M390,310 C390,344 240,344 240,312" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" stroke-dasharray="5,4" />
<text x="315" y="358" class="tp8-sub" fill="var(--text-muted, #6d6762)">피드백</text>
<rect x="115" y="368" width="250" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="240" y="397" class="tp8-text" fill="var(--text, #1c1917)">파일 기반 상태 공유</text>
<text x="240" y="434" class="tp8-sub" fill="var(--text-muted, #6d6762)">Anthropic Harness</text>
<text x="240" y="456" class="tp8-sub" fill="var(--text-muted, #6d6762)">(Planner / Generator / Evaluator)</text>
<!-- 3. Peer topology -->
<text x="240" y="504" class="tp8-title" fill="var(--text, #1c1917)">피어: 수평 핸드오프</text>
<rect x="170" y="520" width="140" height="46" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.15" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="240" y="550" class="tp8-text" fill="var(--text, #1c1917)">Triage</text>
<line x1="205" y1="566" x2="130" y2="596" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<line x1="275" y1="566" x2="350" y2="596" class="tp8-arrow" stroke="var(--text-muted, #6d6762)" />
<rect x="50" y="600" width="150" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="125" y="629" class="tp8-text" fill="var(--text, #1c1917)">전문가 A</text>
<rect x="280" y="600" width="150" height="44" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="355" y="629" class="tp8-text" fill="var(--text, #1c1917)">전문가 B</text>
<line x1="206" y1="622" x2="274" y2="622" class="tp8-arrow-bi" stroke="var(--text-muted, #6d6762)" stroke-dasharray="5,4" />
<text x="240" y="670" class="tp8-sub" fill="var(--text-muted, #6d6762)">OpenAI Triage + Handoff</text>
</svg>
</div>

세 토폴로지는 서로 배타적이지 않습니다. Anthropic의 harness 아키텍처는 전체적으로 파이프라인(Planner → Generator → Evaluator)이지만, Generator가 서브에이전트를 생성하면 그 내부는 스타 토폴로지가 됩니다. 프로덕션 시스템은 보통 여러 토폴로지를 합성합니다.

| 토폴로지 | 조정 비용 | 장애 모드 | 상태 가시성 | 적합한 작업 |
|----------|-----------|-----------|------------|------------|
| 스타 | 낮음 (오케스트레이터가 전담) | 오케스트레이터 실패 시 전체 중단 | 오케스트레이터만 전체 파악 | 병렬 가능한 독립적 하위 작업 |
| 파이프라인 | 중간 (역할 간 인터페이스) | 평가-생성 루프가 수렴하지 않을 수 있음 | 파일/계약 기반 공유 | 역할이 명확히 분리되는 작업 |
| 피어 | 높음 (N:N 통신) | 제어 흐름 추적 어려움 | 핸드오프 시 전체 컨텍스트 전달 | 요청 유형에 따른 전문가 분기 |

---

## 상태 공유의 딜레마: 격리와 일관성

에이전트들이 일관된 결과를 내려면 상태를 공유해야 하지만, 공유할수록 간섭 위험이 커집니다. 격리와 일관성 사이의 줄다리기입니다.

프로덕션 시스템들은 이 스펙트럼 위의 서로 다른 지점을 선택했습니다.

### 격리 극단: 요약만 반환

Claude Code의 사이드체인 아키텍처는 격리의 극단에 있습니다. 서브에이전트는 자체 컨텍스트 윈도우에서 실행되고 부모에게는 요약 텍스트만 반환합니다. 서브에이전트가 50번의 도구 호출로 25만 토큰을 소비하더라도, 부모의 컨텍스트에는 2,000 토큰 정도의 요약만 추가됩니다.

부모 컨텍스트가 오염되지 않지만, 서브에이전트끼리는 서로의 작업을 전혀 모릅니다. 두 서브에이전트가 같은 파일을 다른 방식으로 수정하면, 부모가 병합할 때 비로소 충돌이 발견됩니다.

### 구조화된 공유: 파일 기반 프로토콜

Anthropic의 harness 아키텍처는 중간 지점을 선택합니다. 에이전트 간 통신이 파일을 통해 이루어집니다.

> "One agent would write a file, another agent would read it and respond either within that file or with a new file that the previous agent would read in turn."

구체적으로 세 가지 상태 채널이 있습니다.

1. **`claude-progress.txt`**: 에이전트가 수행한 작업의 로그. 세션 간에도 유지됩니다.
2. **Git 이력**: 커밋 로그가 파일 변경사항을 추적합니다.
3. **기능 목록 (JSON)**: 구조화된 요구사항 추적. `passes` 필드로 완료 여부를 표시합니다.

```json
{
  "category": "functional",
  "description": "새 채팅 버튼이 새 대화를 생성한다",
  "steps": [
    "메인 인터페이스로 이동",
    "새 채팅 버튼 클릭",
    "새 대화가 생성되었는지 확인"
  ],
  "passes": false
}
```

왜 JSON인가? Anthropic은 실험 결과 "모델이 Markdown 파일에 비해 JSON 파일을 부적절하게 수정하거나 덮어쓸 가능성이 낮다"는 점을 확인했습니다. 구조화된 포맷 자체가 에이전트의 행동을 제약하는 가드레일 역할을 합니다.

### 세션 기반 공유: 이벤트 로그

Anthropic의 managed agents 아키텍처는 세 번째 접근을 보여줍니다. 시스템을 Brain(추론 로직), Hands(실행 환경), Session(상태)으로 분리하고, Session을 append-only 이벤트 로그로 구현합니다.

> "Each became an interface that made few assumptions about the others, and each could fail or be replaced independently."

이 설계에서 하네스는 컨테이너 안에 살지 않습니다. 컨테이너를 다른 도구처럼 호출합니다: `execute(name, input) -> string`. 컨테이너는 "소"(cattle)가 됩니다. 교체 가능하고 상태가 없습니다. 모든 상태는 세션 이벤트 로그에 있으므로, 하네스가 실패해도 새 하네스가 `wake(sessionId)`로 재부팅하고 `getSession(id)`로 이벤트 로그를 복원할 수 있습니다.

:::info

**분산 시스템과의 유사성**

멀티에이전트의 상태 공유 문제는 분산 시스템의 오래된 문제와 구조적으로 같습니다. 사이드체인 격리는 마이크로서비스의 독립 데이터베이스와 비슷하고(일관성을 포기하고 자율성을 얻음), 파일 기반 프로토콜은 이벤트 소싱과 비슷한 면이 있고(progress.txt는 append-only로 변경 이력을 기록하고, Git 이력이 불변 로그 역할을 보완), 세션 이벤트 로그는 WAL(Write-Ahead Log)과 비슷합니다(장애 시 로그에서 상태를 재구성). 백엔드 엔지니어에게 이미 익숙한 패턴들입니다.

:::

| 접근 | 공유 범위 | 글로벌 일관성 | 간섭 위험 | 프로덕션 사례 |
|------|----------|--------|-----------|-------------|
| 요약만 반환 | 최소 | 낮음 (요약 품질에 의존) | 최소 | Claude Code 사이드체인 |
| 파일 기반 프로토콜 | 구조화된 상태 | 중간 (파일 충돌 가능) | 중간 | Anthropic Harness (progress + JSON) |
| 세션 이벤트 로그 | 전체 이벤트 스트림 | 높음 (append-only) | 낮음 (읽기 전용 슬라이싱) | Anthropic Managed Agents |
| 공유 컨텍스트 | 전체 | 최고 | 최고 | (프로덕션 사례 드묾) |

---

## 실패 전파와 격리

에이전트 하나가 실패하면? 단일 에이전트라면 그 작업만 영향받지만, 멀티에이전트에서는 실패가 다른 에이전트로 번집니다. Anthropic이 짚은 속성이 있습니다.

> "Agents are stateful and errors compound."

장애 모드는 크게 세 가지로 나뉩니다.

### 잘못된 출력 (Silent Bad Output)

서브에이전트가 에러 없이 완료되지만, 결과의 품질이 낮은 경우입니다. 단일 에이전트에서는 사용자가 결과를 보고 판단하지만, 멀티에이전트에서는 오케스트레이터가 이 판단을 해야 합니다.

Anthropic의 multi-agent research system은 리드 에이전트가 서브에이전트의 결과를 다섯 가지 기준으로 평가합니다: 사실 정확성(출처와 일치하는가?), 인용 정확성(인용된 출처가 주장과 맞는가?), 완전성(요청된 모든 측면을 다뤘는가?), 출처 품질(1차 자료를 2차 자료보다 우선했는가?), 도구 효율성(적절한 도구를 합리적인 횟수로 사용했는가?).

harness 아키텍처에서는 Evaluator가 이 역할을 합니다. Generator의 자기 평가를 신뢰하지 않고, 별도의 에이전트가 Playwright MCP로 실제 앱을 조작하며 검증합니다. 작업자와 평가자의 분리가 잘못된 출력을 잡아내는 핵심 메커니즘입니다.

### 무한 루프 (Doom Loop)

서브에이전트가 같은 작업을 반복하며 토큰과 시간을 소비하는 경우입니다. 단일 에이전트에도 턴 수 제한이나 컨텍스트 초과 대응 같은 에러 복구 장치가 있지만, 멀티에이전트에서는 이 문제가 증폭됩니다. 스타 토폴로지에서 오케스트레이터는 워커의 중간 상태를 볼 수 없고, 최종 결과만 기다립니다. 파이프라인 토폴로지의 스프린트 단위 평가는 이 문제를 완화하지만, 스프린트 내부에서의 무한 루프는 여전히 탐지하기 어렵습니다.

프로덕션 시스템들의 격리 전략은 명확합니다.

- **Claude Code**: 서브에이전트의 재귀 생성을 방지합니다. 서브에이전트가 다시 서브에이전트를 만들 수 없습니다.
- **Codex**: 깊이 1, 최대 6스레드로 제한합니다.
- **Anthropic Harness**: 스프린트 단위로 작업을 분할하고, 각 스프린트에 시간과 토큰 예산을 설정합니다.

### 자원 고갈 (Resource Exhaustion)

여러 에이전트가 동시에 실행되면서 토큰 예산이나 API 호출 제한을 초과하는 경우입니다. 컨텍스트 윈도우 초과도 여기에 해당합니다. Anthropic의 multi-agent research system은 컨텍스트 윈도우를 200,000 토큰에서 잘라낸다고 명시합니다. 리드 에이전트는 이에 대비해 계획을 Memory에 저장합니다. 잘림이 발생해도 계획이 유지되어야 하기 때문입니다.

| 장애 모드 | 탐지 방법 | 격리 전략 | 복구 방법 |
|-----------|-----------|-----------|-----------|
| 잘못된 출력 | 평가 에이전트, 품질 기준 | 작업자/평가자 분리 | 피드백과 함께 재시도 |
| 무한 루프 | 턴 수 제한, 토큰 예산 | 재귀 방지, 깊이/스레드 제한 | 타임아웃 후 부분 결과 수거 |
| 자원 고갈 | 토큰 카운터, API 모니터링 | 에이전트별 예산 할당 | 계획을 외부 저장소에 보존 |

Anthropic의 managed agents 아키텍처에서 눈에 띄는 설계가 있습니다. 하네스가 실패해도 세션 이벤트 로그에서 상태를 복원할 수 있어서, "하네스에 크래시를 견뎌야 할 것은 아무것도 없다"는 것입니다. 이것은 상태를 프로세스 외부에 보관하는 패턴으로, 세션을 디스크에 두고 프로세스 자체는 상태를 갖지 않는 Codex의 설계와 같은 원리입니다.

---

## 토큰 경제학: N에이전트의 비용 폭발

비용 문제는 피할 수 없습니다. Anthropic은 직설적으로 말합니다.

> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."

이 문장은 양면적입니다. 토큰을 더 많이 쓰면 품질이 올라가지만, 비용도 폭발합니다.

### 비용 구조

단일 에이전트의 비용은 대략 O(T × C)입니다. T는 턴 수, C는 턴당 컨텍스트 크기입니다. 멀티에이전트는 이것이 에이전트 수 N에 비례해 증가합니다.

Anthropic의 연구에서 구체적인 수치가 나옵니다.

- **에이전트는 일반 채팅 대비 약 4배의 토큰**을 사용합니다.
- **멀티에이전트 시스템은 일반 채팅 대비 약 15배의 토큰**을 사용합니다.
- BrowseComp 벤치마크에서 **단일 변수로는 토큰 사용량이 성능 분산의 80%를 설명**합니다. 가장 큰 설명력을 가진 변수입니다.

harness 벤치마크는 더 구체적입니다.

| 구성 | 시간 | 비용 | 결과 |
|------|------|------|------|
| 단일 에이전트 | 20분 | \$9 | 핵심 기능 결함 |
| 3-agent 파이프라인 | 6시간 | \$200 | 기능적으로 완성, 폴리싱 포함 |

다른 프로젝트(Digital Audio Workstation)에서의 비용 분해를 보면, Generator가 전체의 91%(\$113.85)를 차지합니다. Planner는 \$0.46, Evaluator는 \$10.39입니다. 계획과 평가의 비용은 상대적으로 작고, 실제 작업 수행이 비용의 대부분입니다.

### 비용 완화 전략

프로덕션 시스템들은 다음과 같은 전략으로 비용을 누릅니다.

**1. 모델 라우팅.** 오케스트레이터에 고성능 모델, 워커에 효율적인 모델을 배치합니다. Anthropic의 multi-agent research system이 정확히 이 구조입니다. 리드 에이전트는 Opus, 서브에이전트는 Sonnet입니다. Anthropic은 "Sonnet 4로 업그레이드하는 것이 Sonnet 3.7에서 토큰 예산을 두 배로 늘리는 것보다 더 큰 성능 향상"을 보인다고 합니다. 더 좋은 모델을 쓰는 것이 더 많은 토큰을 쓰는 것보다 효율적입니다.

**2. 에이전트별 컴팩션.** 각 서브에이전트 내부에서 컴팩션 파이프라인이 독립적으로 작동합니다. 오래된 도구 결과를 잘라내고 대화를 요약하는 처리가 에이전트마다 따로 돌아가므로, 전체 토큰 사용량이 에이전트 수에 선형으로만 늘어납니다.

**3. 조기 종료.** 에이전트별 토큰 예산을 설정하고, 초과 시 부분 결과를 반환합니다.

**4. 결과 중복 제거.** 여러 서브에이전트가 같은 정보를 찾았을 때, 오케스트레이터가 중복을 제거합니다.

**5. 프롬프트 캐싱.** Codex의 "정적 요소를 앞에, 가변 요소를 뒤에" 배치하는 전략이 서브에이전트에도 적용됩니다. 시스템 프롬프트와 공통 지침이 캐시되면, 여러 서브에이전트가 같은 캐시를 공유할 수 있습니다.

:::note

**비용과 품질의 trade-off**

Anthropic은 "멀티에이전트 시스템은 작업의 가치가 충분히 높은 경우에만 정당화된다"고 명시합니다. BrowseComp 벤치마크에서 토큰 사용량에 도구 호출 횟수와 모델 선택을 더한 세 요인이 성능 분산의 95%를 설명합니다. 토큰을 더 쓸수록 좋아지지만, 수확 체감이 있습니다. 최적의 에이전트 수와 토큰 예산은 작업의 경제적 가치에 의해 결정됩니다.

:::

---

## 신뢰 경계와 퍼미션 에스컬레이션

마지막은 신뢰 문제입니다. 단일 에이전트에서 퍼미션은 사용자와 에이전트 사이의 문제였지만, 멀티에이전트에서는 에이전트 간의 신뢰까지 설계해야 합니다.

### 에스컬레이션 프로토콜

Claude Code의 퍼미션 모드 중에는 `bubble`이 있습니다. 판단을 자기 선에서 끝내지 않고 위로 올린다는 뜻입니다.

서브에이전트가 `bubble` 모드로 실행 중일 때, 퍼미션이 필요한 도구 호출을 만나면 자체적으로 판단하지 않습니다. 대신 `EscalateToParent` 예외를 발생시켜 부모 에이전트로 올립니다. 부모 에이전트는 자신의 퍼미션 모드(default, auto, dontAsk 등)에 따라, 거부 규칙을 먼저 훑고 허용 규칙과 분류기를 차례로 거쳐 마지막에 사용자에게 묻는 deny-first 파이프라인으로 평가합니다. 평가 결과(허용 또는 거부)는 서브에이전트에게 돌아가고, 서브에이전트는 그 결과에 따라 실행을 계속하거나 대안을 찾습니다.

<div style="text-align: center; margin: 24px 0;">
<svg viewBox="0 0 480 456" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="bubble 모드 에스컬레이션 흐름도. 서브에이전트가 EscalateToParent로 부모 에이전트에게 판단을 올리고, 부모가 Deny-First 파이프라인으로 7단계 평가를 거친 뒤, 허용이면 도구를 실행하고 거부면 대안을 탐색하거나 중단합니다.">
<style>
.es8-text { font-size: 20px; text-anchor: middle; }
.es8-sub { font-size: 17px; text-anchor: middle; }
.es8-note { font-size: 17px; }
.es8-arrow { stroke-width: 2; fill: none; marker-end: url(#es8Head); }
.es8-arrow-ok { stroke-width: 2; fill: none; marker-end: url(#es8HeadOk); }
.es8-arrow-no { stroke-width: 2; fill: none; marker-end: url(#es8HeadNo); }
</style>
<defs>
<marker id="es8Head" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)" />
</marker>
<marker id="es8HeadOk" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text-success, #107836)" />
</marker>
<marker id="es8HeadNo" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text-danger, #cb2121)" />
</marker>
</defs>
<!-- 1. Sub-agent -->
<rect x="110" y="14" width="260" height="64" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="240" y="44" class="es8-text" fill="var(--text, #1c1917)">서브에이전트</text>
<text x="240" y="68" class="es8-sub" fill="var(--text-muted, #6d6762)">(bubble 모드)</text>
<!-- 2. Escalate to parent -->
<line x1="240" y1="78" x2="240" y2="112" class="es8-arrow" stroke="var(--primary, #0a756c)" />
<text x="252" y="100" class="es8-note" fill="var(--primary, #0a756c)">EscalateToParent</text>
<!-- 3. Parent agent -->
<rect x="95" y="116" width="290" height="64" rx="8" fill="var(--primary, #0a756c)" fill-opacity="0.10" stroke="var(--primary, #0a756c)" stroke-width="2" />
<text x="240" y="146" class="es8-text" fill="var(--text, #1c1917)">부모 에이전트</text>
<text x="240" y="170" class="es8-sub" fill="var(--text-muted, #6d6762)">(default / auto / dontAsk)</text>
<!-- 4. Deny-first pipeline -->
<line x1="240" y1="180" x2="240" y2="208" class="es8-arrow" stroke="var(--text-muted, #6d6762)" />
<rect x="25" y="212" width="430" height="94" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" />
<text x="240" y="242" class="es8-text" fill="var(--text, #1c1917)">Deny-First 파이프라인</text>
<text x="240" y="270" class="es8-sub" fill="var(--text-muted, #6d6762)">Deny → Allow → 분류기 → 사용자</text>
<text x="240" y="294" class="es8-sub" fill="var(--text-muted, #6d6762)">(7단계 평가)</text>
<!-- 5. Result returns to sub-agent -->
<line x1="240" y1="306" x2="240" y2="340" stroke="var(--text-muted, #6d6762)" stroke-width="2" stroke-dasharray="6,4" />
<text x="252" y="330" class="es8-note" fill="var(--text-muted, #6d6762)">평가 결과 반환</text>
<!-- 6. Two outcomes -->
<line x1="240" y1="340" x2="140" y2="364" class="es8-arrow-ok" stroke="var(--text-success, #107836)" stroke-dasharray="6,4" />
<line x1="240" y1="340" x2="345" y2="364" class="es8-arrow-no" stroke="var(--text-danger, #cb2121)" stroke-dasharray="6,4" />
<rect x="15" y="368" width="215" height="72" rx="8" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #107836)" stroke-width="2" />
<path d="M32,404 L40,412 L56,394" fill="none" stroke="var(--text-success, #107836)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
<text x="145" y="397" class="es8-text" fill="var(--text, #1c1917)">허용 후</text>
<text x="145" y="421" class="es8-text" fill="var(--text, #1c1917)">도구 실행</text>
<rect x="250" y="368" width="215" height="72" rx="8" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="2" />
<path d="M267,396 L281,410 M281,396 L267,410" fill="none" stroke="var(--text-danger, #cb2121)" stroke-width="2.5" stroke-linecap="round" />
<text x="372" y="397" class="es8-text" fill="var(--text, #1c1917)">거부 후</text>
<text x="372" y="421" class="es8-text" fill="var(--text, #1c1917)">대안 탐색</text>
</svg>
</div>

이 구조의 핵심 보안 속성은 **최소 권한 원칙**입니다. 서브에이전트는 부모의 퍼미션을 상속하되, 부모보다 더 많은 권한을 가질 수 없습니다. 부모가 `default` 모드(모든 쓰기에 사용자 승인 필요)라면, 서브에이전트가 에스컬레이션한 쓰기 작업도 사용자의 승인을 거칩니다.

### 크로스에이전트 프롬프트 인젝션

멀티에이전트에서 추가되는 보안 위협이 있습니다. 서브에이전트가 외부 데이터(웹 콘텐츠, 사용자 파일)를 처리할 때, 그 데이터에 포함된 악의적 지시가 서브에이전트의 행동을 바꿀 수 있습니다. 사이드체인 격리가 여기서 이중 역할을 합니다. 서브에이전트의 컨텍스트 윈도우가 부모와 분리되어 있으므로, 서브에이전트가 프롬프트 인젝션에 영향을 받더라도 그 영향이 부모에게 직접 전파되지 않습니다. 부모는 요약 텍스트만 받고, 그 요약도 부모의 퍼미션 파이프라인을 통과해야 합니다.

Codex는 다른 접근을 취합니다. OS 수준 샌드박스가 에이전트의 행동 범위 자체를 제한하므로, 프롬프트 인젝션이 성공하더라도 샌드박스 밖의 자원에 접근할 수 없습니다.

| 관점 | Claude Code | Codex |
|------|-------------|-------|
| 에스컬레이션 | bubble → 부모의 deny-first 파이프라인 | 해당 없음 (샌드박스가 일괄 제한) |
| 권한 상속 | 부모 퍼미션의 부분 집합 | OS 정책 상속 |
| 프롬프트 인젝션 방어 | 컨텍스트 격리 + 요약만 전달 | 프로세스 격리 + 네트워크 차단 |
| 유연성 | 도구별 세분화된 제어 | 제약적이지만 우회 어려움 |

## 프로덕션 비교: 멀티에이전트 아키텍처

지금까지 다룬 다섯 가지 문제를 기준으로, 프로덕션 시스템들의 설계 결정을 비교합니다.

| 관점 | Claude Code | Codex | Anthropic Harness |
|------|-------------|-------|-------------------|
| **토폴로지** | 스타 (AgentTool) | 스타 (spawn_agent) | 파이프라인 (Planner → Generator → Evaluator) |
| **최대 에이전트** | 설정 가능 | 6 스레드, 깊이 1 | 3 역할 (반복 가능) |
| **상태 공유** | 사이드체인 (요약만 반환) | SQLite 세션 | 파일 기반 (progress + JSON + git) |
| **퍼미션 모델** | bubble 에스컬레이션 | OS 샌드박스 상속 | 프롬프트 기반 가드레일 |
| **장애 격리** | 재귀 방지, worktree 격리 | 깊이/스레드 제한, 샌드박스 | 스프린트 예산, git 롤백 |
| **비용 전략** | 에이전트별 컨텍스트 격리 | 캐시된 프리픽스 | 역할별 모델 분리 (Planner: 저비용) |

세 시스템의 공통점이 하나 있습니다. 모두 **서브에이전트의 자율성을 의도적으로 제한**합니다. Claude Code는 재귀를 금지하고, Codex는 깊이와 스레드를 제한하고, Anthropic Harness는 스프린트 계약으로 범위를 고정합니다. 멀티에이전트 시스템에서 자율성은 자원이 아니라 위험입니다. 필요한 만큼만 부여하는 것이 프로덕션의 공통 원칙입니다.

---

## 한계와 열린 문제

### 관찰성의 부재

멀티에이전트 시스템에서 "에이전트가 왜 이 결정을 내렸는가"를 추적하기가 어렵습니다. 단일 에이전트에서도 디버깅은 쉽지 않은데, 여러 에이전트가 상호작용하면 원인 추적이 기하급수적으로 어려워집니다. Claude Code가 사이드체인 파일로 서브에이전트의 전체 대화를 저장하는 것은 이 문제에 대한 하나의 해법이지만, 표준화된 트레이싱 포맷은 아직 없습니다.

### 최적 에이전트 수

더 많은 에이전트가 항상 더 좋은 결과를 내지는 않습니다. Anthropic의 연구에서 3~5개의 서브에이전트가 기본 범위이고, 복잡한 연구에서는 10개 이상까지 생성합니다. 하지만 에이전트 수를 늘릴수록 조정 오버헤드도 증가하고, 수확 체감이 발생합니다. 최적 수를 결정하는 이론적 프레임워크는 아직 없습니다.

### 비동기 실행의 어려움

현재 대부분의 프로덕션 시스템은 동기 실행입니다. Anthropic도 "비동기 실행은 결과 조정, 상태 일관성, 에러 전파에 추가적인 도전을 만든다"고 인정합니다. 에이전트가 동시에 새로운 서브에이전트를 생성하는 완전 비동기 시스템은 아직 연구 단계입니다.

### 표준 프로토콜의 부재

에이전트 간 통신에 표준화된 프로토콜이 없습니다. Claude Code는 함수 호출과 사이드체인, Anthropic Harness는 파일 기반, Codex는 SQLite 세션을 사용합니다. 각각의 내부 프로토콜은 시스템 간에 호환되지 않습니다. MCP(Model Context Protocol)가 에이전트와 외부 도구 사이의 표준을 만들고 있지만, 에이전트 간 통신은 아직 표준화되지 않았습니다.

에이전트 간 통신을 표준화하려는 A2A 같은 시도가 있지만, MCP만큼의 채택은 아직 없습니다. 표준화된 트레이싱 포맷을 통한 멀티에이전트 관찰성, LLM-as-Judge를 넘어서는 체계적 평가 파이프라인 설계도 아직 열린 엔지니어링 문제입니다.

---

## 마치며

에이전트 하나를 해부하는 일은 비교적 명확합니다. 루프가 어떻게 돌아가는지, 컨텍스트를 어떻게 관리하는지, 도구 실행을 어떻게 통제하는지. 이 글에서는 시야를 한 단계 넓혔습니다. 여러 에이전트가 협력할 때, 단일 에이전트에 없던 다섯 가지 새로운 문제가 생깁니다. 조정 토폴로지, 상태 공유, 실패 전파, 토큰 경제학, 신뢰 경계.

분산 시스템이 모놀리스에 없던 장애 모드를 만들어낸 것처럼, 멀티에이전트는 단일 에이전트에 없던 복잡성을 만들어냅니다. 해법도 분산 시스템에서 빌려올 수 있습니다. 격리, 이벤트 소싱, 최소 권한, 예산 제한, 체크포인트. 다만 에이전트에는 고유한 차원이 추가됩니다. 모델의 판단이 비결정적이고, 자신의 출력 품질을 과대평가할 수 있다는 것. 같은 입력에도 다른 경로를 택할 수 있고, 잘못된 경로를 택하고도 성공했다고 보고할 수 있으므로, 결정론적 시스템보다 더 방어적으로 설계해야 합니다.

지금까지 에이전트 간의 통신은 함수 호출, 사이드체인, 에스컬레이션 같은 시스템 내부 메커니즘에 의존했습니다. 그런데 프로덕션에서는 에이전트가 미리 알 수 없는 외부 도구와도 연결되어야 합니다. 다음 글에서는 에이전트와 외부 서비스를 표준화된 인터페이스로 연결하는 MCP 프로토콜을 살펴봅니다.

---

## 함께 보면 좋은 글

- [AI Agent 워크플로우 패턴: 단순한 Chaining에서 동적 Orchestration까지](/agent/agent-workflow-patterns/)
- [AI Agent의 컨텍스트 엔지니어링: 유한한 토큰 윈도우를 다루는 네 가지 전략](/agent/context-engineering/)
- [AI Agent 루프: 한 턴의 요청이 처리되는 6단계](/agent/agent-loop-anatomy/)
- [AI Agent의 컴팩션 파이프라인: 200K 토큰 윈도우를 지키는 다섯 단계](/agent/compaction-pipeline/)
- [AI Agent의 퍼미션 시스템: 도구 실행 전에 일어나는 일곱 단계의 판단](/agent/agent-permission-safety/)
- [AI Agent의 MCP: 에이전트가 외부 도구를 연결하는 표준 프로토콜](/agent/mcp-protocol/)

## 참고자료

- [How We Built Multi-Agent Research (Anthropic)](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Harness Design for Long-Running Application Development (Anthropic)](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Scaling Managed Agents: Decoupling the Brain from the Hands (Anthropic)](https://www.anthropic.com/engineering/managed-agents)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [A Practical Guide to Building Agents (OpenAI)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
