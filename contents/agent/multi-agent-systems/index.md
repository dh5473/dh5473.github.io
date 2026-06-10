---
date: '2026-06-07'
title: 'AI Agent의 멀티에이전트 시스템: 여러 에이전트가 협력할 때 생기는 다섯 가지 문제'
summary: '단일 에이전트를 넘어 여러 에이전트가 협력하는 시스템의 설계를 해부합니다. 조정 토폴로지, 상태 공유, 실패 전파, 토큰 경제학, 신뢰 경계라는 다섯 가지 시스템 수준 문제를 Claude Code, Codex, Anthropic Harness의 구현을 통해 비교합니다.'
thumbnail: './thumbnail.png'
series: 'agent'
seriesOrder: 8
category: 'AI Agent'
tags: ['AI Agent', 'Multi-Agent', 'Orchestrator-Workers', 'Sub-Agent', 'Claude Code', 'Codex']
---

Anthropic의 multi-agent research system에 복잡한 질문을 던지면, 리드 에이전트(Claude Opus 4)가 질문을 분석하고 3~5개의 서브에이전트(Claude Sonnet 4)를 병렬로 생성합니다. 각 서브에이전트는 독립적으로 웹을 검색하고 문서를 분석한 뒤, 결과를 리드 에이전트에게 돌려줍니다. 리드 에이전트는 결과의 품질을 평가하고, 부족하면 추가 에이전트를 생성하거나 전략을 수정합니다. 하나의 요청이 수십 번의 LLM 호출과 수백만 토큰을 소비하는 과정입니다.

결과는 인상적입니다. 이 시스템은 단일 에이전트 대비 **90.2%의 성능 향상**을 보였습니다. 하지만 그 이면에는 단일 에이전트에 없던 새로운 종류의 문제들이 있습니다. 에이전트들은 어떻게 조정되는가? 상태는 어떻게 공유하는가? 하나가 실패하면 나머지는 어떻게 되는가? 비용은 어떻게 통제하는가? 누가 누구를 신뢰하는가?

[이전 글](/agent/agent-permission-safety/)에서 "여러 에이전트가 협력할 때 어떤 새로운 문제가 생기는지"를 예고했습니다. 이 글에서는 멀티에이전트 시스템이 만들어내는 다섯 가지 시스템 수준 문제를 해부합니다.

---

## 왜 멀티에이전트인가: 단일 에이전트가 부딪히는 벽

단일 에이전트는 놀라울 만큼 많은 작업을 처리할 수 있습니다. [다섯 번째 글](/agent/agent-loop-anatomy/)의 에이전트 루프, [여섯 번째 글](/agent/compaction-pipeline/)의 컴팩션 파이프라인, [일곱 번째 글](/agent/agent-permission-safety/)의 퍼미션 시스템까지, 지금까지 살펴본 인프라는 모두 하나의 에이전트가 하나의 작업을 끝까지 처리하는 구조입니다.

그런데 이 구조가 한계에 부딪히는 지점이 있습니다. 세 가지 신호가 나타나면 멀티에이전트를 고려할 시점입니다.

**첫 번째, 컨텍스트 포화입니다.** 대규모 코드베이스에서 여러 파일을 동시에 분석해야 할 때, 하나의 컨텍스트 윈도우에 모든 정보를 담을 수 없습니다. [네 번째 글](/agent/context-engineering/)에서 다룬 컴팩션과 구조화된 노트로도 부족한 경우, 여러 에이전트가 각각의 컨텍스트 윈도우에서 독립적으로 탐색하고 결과만 취합하는 것이 더 효과적입니다.

**두 번째, 전문 역할의 분리입니다.** 코드를 작성하는 역할과 작성된 코드를 평가하는 역할을 같은 에이전트가 맡으면, 자기 평가 편향이 발생합니다. Anthropic의 harness 연구에서 에이전트가 자신의 작업을 평가할 때 "명백히 품질이 떨어지는 결과에도 자신있게 칭찬하는" 경향을 확인했습니다. 작업자와 평가자를 분리하는 것만으로 품질이 크게 개선됩니다.

**세 번째, 병렬 가능한 하위 구조입니다.** S&P 500 IT 기업의 이사회 구성원을 모두 찾는 작업을 생각해 봅시다. 단일 에이전트는 순차적으로 한 기업씩 검색하는데, 멀티에이전트 시스템은 여러 기업을 동시에 조사합니다. Anthropic은 이런 병렬화로 단일 에이전트가 느린 순차 검색으로 실패한 질의를 멀티에이전트 시스템이 해결했다고 보고합니다.

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

멀티에이전트 시스템의 첫 번째 설계 결정은 에이전트 간의 조정 방식입니다. 프로덕션에서 사용되는 세 가지 토폴로지가 있습니다.

### 스타 토폴로지: 중앙 오케스트레이터

하나의 중앙 에이전트가 작업을 분해하고, 워커 에이전트에게 위임하고, 결과를 종합하는 Orchestrator-Workers 구조입니다.

Claude Code의 `AgentTool`이 대표적입니다. [두 번째 글](/agent/agent-workflow-patterns/)에서 다뤘듯이, 서브에이전트가 별도의 git worktree에서 격리 실행되고 요약만 부모에게 반환하는 사이드체인 구조입니다. Codex도 유사한 스타 구조를 사용하되, 깊이 1, 최대 6개 병렬 스레드로 제약합니다.

Anthropic의 multi-agent research system도 스타 토폴로지입니다. 리드 에이전트(Opus)가 3~5개의 서브에이전트(Sonnet)를 병렬로 실행하고, 결과를 평가한 뒤 추가 에이전트를 생성할지 결정합니다.

스타 토폴로지의 핵심 속성은 **중앙 집중적 상태 관리**입니다. 오케스트레이터만 전체 그림을 보고, 워커는 자신의 하위 작업만 압니다. 장점은 조정이 단순하다는 것이고, 단점은 오케스트레이터가 단일 실패점이라는 것입니다.

### 파이프라인 토폴로지: 역할 기반 연결과 반복

스타 토폴로지에서 오케스트레이터가 동적으로 작업을 분해한다면, 파이프라인 토폴로지에서는 역할이 미리 정해져 있습니다. 각 에이전트가 특정 역할을 맡고, 기본 흐름은 한 에이전트의 출력이 다음 에이전트의 입력이 됩니다. 다만 순수한 직렬이 아니라, 평가 결과에 따른 피드백 루프가 포함됩니다.

Anthropic의 harness 연구가 이 토폴로지의 대표 사례입니다. Planner, Generator, Evaluator 세 에이전트가 역할을 나눕니다.

- **Planner**: 1~4문장의 프롬프트를 종합적인 제품 스펙으로 변환합니다. "범위에 대해 야심적이되, 상세한 기술 구현보다 제품 컨텍스트와 고수준 설계에 집중하라"는 지침을 받습니다.
- **Generator**: 스펙에 따라 코드를 작성하고 테스트합니다. 스프린트 단위로 작업하며, 각 스프린트 종료 시 자체 평가를 수행합니다. git으로 변경사항을 관리합니다.
- **Evaluator**: Playwright MCP를 사용해 실행 중인 앱을 실제 사용자처럼 조작하며 품질을 평가합니다. 스프린트 계약에 합의된 기준으로 채점합니다.

이 구조에서 핵심은 **스프린트 계약**입니다. 구현을 시작하기 전에 "이 작업이 완료된 상태가 어떤 것인지"를 명확히 정의합니다. 평가 기준이 모호하면 자기 평가 편향과 같은 문제가 발생하기 때문입니다.

비용 벤치마크가 이 접근의 trade-off를 보여줍니다. Anthropic의 harness 연구에서 레트로 비디오 게임 메이커 앱을 구축할 때, 단일 에이전트는 20분에 $9이지만 핵심 기능이 깨져 있었고, 3-agent 파이프라인은 6시간에 $200이지만 기능적으로 완성된 결과를 냈습니다. 비용이 약 22배 증가하지만, 결과의 품질이 근본적으로 다릅니다.

### 피어 토폴로지: 수평적 핸드오프

중앙 오케스트레이터 없이 에이전트 간에 제어권이 수평으로 이동하는 구조입니다. [두 번째 글](/agent/agent-workflow-patterns/)에서 다뤘던 OpenAI의 triage agent 패턴이 여기에 해당합니다. 첫 번째 에이전트가 요청을 분류한 뒤, 전문화된 에이전트에게 대화 전체를 넘깁니다(핸드오프).

피어 토폴로지는 고객 지원처럼 요청 유형에 따라 전문가가 달라지는 도메인에 적합합니다. 하지만 제어 흐름을 추적하기 어렵고, 에이전트 간 상태 일관성을 보장하기 힘듭니다.

<div style="text-align: center; margin: 24px 0;">
<svg viewBox="0 0 850 220" xmlns="http://www.w3.org/2000/svg" style="max-width: 850px; width: 100%;">
<style>
.topo-box { stroke-width: 2; rx: 8; }
.topo-text { font-family: 'Pretendard', sans-serif; font-size: 13px; text-anchor: middle; }
.topo-label { font-family: 'Pretendard', sans-serif; font-size: 15px; font-weight: 700; text-anchor: middle; }
.topo-sub { font-family: 'Pretendard', sans-serif; font-size: 11px; text-anchor: middle; }
.topo-arrow { stroke-width: 2; fill: none; marker-end: url(#arrowT); }
.topo-arrow-bi { stroke-width: 2; fill: none; marker-end: url(#arrowT); marker-start: url(#arrowTR); }
</style>
<defs>
<marker id="arrowT" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text, #1c1917)" />
</marker>
<marker id="arrowTR" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
<path d="M8,0 L0,3 L8,6" fill="var(--text, #1c1917)" />
</marker>
</defs>
<!-- Star Topology -->
<text x="130" y="24" class="topo-label" fill="var(--text, #1c1917)">스타</text>
<rect x="80" y="50" width="100" height="44" class="topo-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="130" y="77" class="topo-text" fill="var(--text, #1c1917)">오케스트레이터</text>
<line x1="100" y1="94" x2="40" y2="140" class="topo-arrow" stroke="var(--text, #1c1917)" />
<line x1="130" y1="94" x2="130" y2="140" class="topo-arrow" stroke="var(--text, #1c1917)" />
<line x1="160" y1="94" x2="220" y2="140" class="topo-arrow" stroke="var(--text, #1c1917)" />
<rect x="5" y="140" width="70" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="40" y="163" class="topo-text" fill="var(--text, #1c1917)">워커 1</text>
<rect x="95" y="140" width="70" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="130" y="163" class="topo-text" fill="var(--text, #1c1917)">워커 2</text>
<rect x="185" y="140" width="70" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="220" y="163" class="topo-text" fill="var(--text, #1c1917)">워커 3</text>
<text x="130" y="200" class="topo-sub" fill="var(--text-muted, #78716c)">Claude Code AgentTool, Codex spawn_agent</text>
<!-- Pipeline Topology -->
<text x="420" y="24" class="topo-label" fill="var(--text, #1c1917)">파이프라인</text>
<rect x="300" y="50" width="76" height="44" class="topo-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="338" y="77" class="topo-text" fill="var(--text, #1c1917)">Planner</text>
<line x1="376" y1="72" x2="396" y2="72" class="topo-arrow" stroke="var(--text, #1c1917)" />
<rect x="400" y="50" width="86" height="44" class="topo-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="443" y="77" class="topo-text" fill="var(--text, #1c1917)">Generator</text>
<line x1="486" y1="72" x2="506" y2="72" class="topo-arrow" stroke="var(--text, #1c1917)" />
<rect x="510" y="50" width="86" height="44" class="topo-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="553" y="77" class="topo-text" fill="var(--text, #1c1917)">Evaluator</text>
<path d="M553,94 C553,120 443,120 443,94" class="topo-arrow" stroke="var(--text, #1c1917)" stroke-dasharray="4,3" />
<text x="498" y="118" class="topo-sub" fill="var(--text-muted, #78716c)">피드백</text>
<rect x="340" y="140" width="160" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="420" y="163" class="topo-text" fill="var(--text, #1c1917)">파일 기반 상태 공유</text>
<text x="420" y="200" class="topo-sub" fill="var(--text-muted, #78716c)">Anthropic Harness (Planner/Generator/Evaluator)</text>
<!-- Peer Topology -->
<text x="720" y="24" class="topo-label" fill="var(--text, #1c1917)">피어</text>
<rect x="675" y="50" width="90" height="44" class="topo-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="720" y="77" class="topo-text" fill="var(--text, #1c1917)">Triage</text>
<line x1="695" y1="94" x2="655" y2="140" class="topo-arrow" stroke="var(--text, #1c1917)" />
<line x1="745" y1="94" x2="790" y2="140" class="topo-arrow" stroke="var(--text, #1c1917)" />
<rect x="610" y="140" width="90" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="655" y="163" class="topo-text" fill="var(--text, #1c1917)">전문가 A</text>
<rect x="745" y="140" width="90" height="36" class="topo-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="790" y="163" class="topo-text" fill="var(--text, #1c1917)">전문가 B</text>
<line x1="700" y1="158" x2="745" y2="158" class="topo-arrow-bi" stroke="var(--text, #1c1917)" stroke-dasharray="4,3" />
<text x="720" y="200" class="topo-sub" fill="var(--text-muted, #78716c)">OpenAI Triage + Handoff</text>
</svg>
</div>
<p align="center" style="color: var(--text-muted, #78716c); font-size: 14px;">
  <em>세 가지 조정 토폴로지. 스타는 중앙 오케스트레이터가 모든 조정을 담당하고, 파이프라인은 역할별 에이전트가 순차적으로 연결되되 피드백 루프를 포함하며, 피어는 에이전트 간 수평 핸드오프로 제어권이 이동합니다.</em>
</p>

세 토폴로지는 서로 배타적이지 않습니다. Anthropic의 harness 아키텍처는 전체적으로 파이프라인(Planner → Generator → Evaluator)이지만, Generator가 서브에이전트를 생성하면 그 내부는 스타 토폴로지가 됩니다. 프로덕션 시스템은 보통 여러 토폴로지를 합성합니다.

| 토폴로지 | 조정 비용 | 장애 모드 | 상태 가시성 | 적합한 작업 |
|----------|-----------|-----------|------------|------------|
| 스타 | 낮음 (오케스트레이터가 전담) | 오케스트레이터 실패 시 전체 중단 | 오케스트레이터만 전체 파악 | 병렬 가능한 독립적 하위 작업 |
| 파이프라인 | 중간 (역할 간 인터페이스) | 평가-생성 루프가 수렴하지 않을 수 있음 | 파일/계약 기반 공유 | 역할이 명확히 분리되는 작업 |
| 피어 | 높음 (N:N 통신) | 제어 흐름 추적 어려움 | 핸드오프 시 전체 컨텍스트 전달 | 요청 유형에 따른 전문가 분기 |

---

## 상태 공유의 딜레마: 격리와 일관성

멀티에이전트 시스템의 두 번째 문제는 상태 공유입니다. 에이전트들이 일관된 결과를 내려면 어느 정도의 상태를 공유해야 하지만, 상태를 공유할수록 간섭 위험이 커집니다.

프로덕션 시스템들은 이 스펙트럼 위의 서로 다른 지점을 선택했습니다.

### 격리 극단: 요약만 반환

Claude Code의 사이드체인 아키텍처는 격리의 극단에 있습니다. [네 번째 글](/agent/context-engineering/)에서 다뤘듯이, 서브에이전트는 자체 컨텍스트 윈도우에서 실행되고 부모에게는 요약 텍스트만 반환합니다. 서브에이전트가 50번의 도구 호출로 25만 토큰을 소비하더라도, 부모의 컨텍스트에는 2,000 토큰 정도의 요약만 추가됩니다.

장점은 부모 컨텍스트가 오염되지 않는다는 것입니다. 단점은 서브에이전트가 서로의 작업을 전혀 모른다는 것입니다. 두 서브에이전트가 같은 파일을 다른 방식으로 수정하면, 부모가 병합할 때 비로소 충돌이 발견됩니다.

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

JSON을 선택한 이유가 흥미롭습니다. Anthropic은 실험 결과 "모델이 Markdown 파일에 비해 JSON 파일을 부적절하게 수정하거나 덮어쓸 가능성이 낮다"는 것을 발견했습니다. 구조화된 포맷 자체가 에이전트의 행동을 제약하는 가드레일 역할을 합니다.

### 세션 기반 공유: 이벤트 로그

Anthropic의 managed agents 아키텍처는 세 번째 접근을 보여줍니다. 시스템을 Brain(추론 로직), Hands(실행 환경), Session(상태)으로 분리하고, Session을 append-only 이벤트 로그로 구현합니다.

> "Each became an interface that made few assumptions about the others, and each could fail or be replaced independently."

이 설계에서 하네스는 컨테이너 안에 살지 않습니다. 컨테이너를 다른 도구처럼 호출합니다: `execute(name, input) -> string`. 컨테이너는 "소"(cattle)가 됩니다. 교체 가능하고 상태가 없습니다. 모든 상태는 세션 이벤트 로그에 있으므로, 하네스가 실패해도 새 하네스가 `wake(sessionId)`로 재부팅하고 `getSession(id)`로 이벤트 로그를 복원할 수 있습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">

**분산 시스템과의 유사성.** 멀티에이전트의 상태 공유 문제는 분산 시스템의 오래된 문제와 구조적으로 같습니다. 사이드체인 격리는 마이크로서비스의 독립 데이터베이스와 비슷하고(일관성을 포기하고 자율성을 얻음), 파일 기반 프로토콜은 이벤트 소싱과 비슷한 면이 있고(progress.txt는 append-only로 변경 이력을 기록하고, Git 이력이 불변 로그 역할을 보완), 세션 이벤트 로그는 WAL(Write-Ahead Log)과 비슷합니다(장애 시 로그에서 상태를 재구성). 백엔드 엔지니어에게 이미 익숙한 패턴들입니다.

</div>

| 접근 | 공유 범위 | 글로벌 일관성 | 간섭 위험 | 프로덕션 사례 |
|------|----------|--------|-----------|-------------|
| 요약만 반환 | 최소 | 낮음 (요약 품질에 의존) | 최소 | Claude Code 사이드체인 |
| 파일 기반 프로토콜 | 구조화된 상태 | 중간 (파일 충돌 가능) | 중간 | Anthropic Harness (progress + JSON) |
| 세션 이벤트 로그 | 전체 이벤트 스트림 | 높음 (append-only) | 낮음 (읽기 전용 슬라이싱) | Anthropic Managed Agents |
| 공유 컨텍스트 | 전체 | 최고 | 최고 | (프로덕션 사례 드묾) |

---

## 실패 전파와 격리

단일 에이전트의 실패는 그 에이전트의 작업만 영향을 받습니다. 멀티에이전트 시스템에서는 하나의 에이전트 실패가 다른 에이전트로 전파될 수 있습니다. Anthropic이 지적한 핵심 속성이 있습니다.

> "Agents are stateful and errors compound."

세 가지 장애 모드가 있습니다.

### 잘못된 출력 (Silent Bad Output)

서브에이전트가 에러 없이 완료되지만, 결과의 품질이 낮은 경우입니다. 단일 에이전트에서는 사용자가 결과를 보고 판단하지만, 멀티에이전트에서는 오케스트레이터가 이 판단을 해야 합니다.

Anthropic의 multi-agent research system은 리드 에이전트가 서브에이전트의 결과를 다섯 가지 기준으로 평가합니다: 사실 정확성(출처와 일치하는가?), 인용 정확성(인용된 출처가 주장과 맞는가?), 완전성(요청된 모든 측면을 다뤘는가?), 출처 품질(1차 자료를 2차 자료보다 우선했는가?), 도구 효율성(적절한 도구를 합리적인 횟수로 사용했는가?).

harness 아키텍처에서는 Evaluator가 이 역할을 합니다. Generator의 자기 평가를 신뢰하지 않고, 별도의 에이전트가 Playwright MCP로 실제 앱을 조작하며 검증합니다. 작업자와 평가자의 분리가 잘못된 출력을 잡아내는 핵심 메커니즘입니다.

### 무한 루프 (Doom Loop)

서브에이전트가 같은 작업을 반복하며 토큰과 시간을 소비하는 경우입니다. [다섯 번째 글](/agent/agent-loop-anatomy/)에서 단일 에이전트의 에러 복구 전략(턴 제한, 컨텍스트 초과 대응 등)을 다뤘는데, 멀티에이전트에서는 이 문제가 증폭됩니다. 스타 토폴로지에서 오케스트레이터는 워커의 중간 상태를 볼 수 없고, 최종 결과만 기다립니다. 파이프라인 토폴로지의 스프린트 단위 평가는 이 문제를 완화하지만, 스프린트 내부에서의 무한 루프는 여전히 탐지하기 어렵습니다.

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

Anthropic의 managed agents 아키텍처가 장애 복구에서 보여주는 핵심 설계가 있습니다. 하네스가 실패해도 세션 이벤트 로그에서 상태를 복원할 수 있으므로, "하네스에 크래시를 견뎌야 할 것은 아무것도 없다"는 것입니다. 이것은 상태를 프로세스 외부에 보관하는 패턴으로, [다섯 번째 글](/agent/agent-loop-anatomy/)에서 다뤘던 Codex의 stateless 설계와 같은 원리입니다.

---

## 토큰 경제학: N에이전트의 비용 폭발

멀티에이전트의 네 번째 문제는 비용입니다. Anthropic은 명확하게 말합니다.

> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem."

이 문장은 양면적입니다. 토큰을 더 많이 쓰면 품질이 올라가지만, 비용도 폭발합니다.

### 비용 구조

단일 에이전트의 비용은 대략 O(T × C)입니다. T는 턴 수, C는 턴당 컨텍스트 크기입니다. 멀티에이전트는 이것이 에이전트 수 N에 비례해 증가합니다.

Anthropic의 연구에서 구체적인 수치가 나옵니다.

- **에이전트는 일반 채팅 대비 약 4배의 토큰**을 사용합니다.
- **멀티에이전트 시스템은 일반 채팅 대비 약 15배의 토큰**을 사용합니다.
- BrowseComp 벤치마크에서 **토큰 사용량이 성능 분산의 80%를 설명**합니다.

harness 벤치마크는 더 구체적입니다.

| 구성 | 시간 | 비용 | 결과 |
|------|------|------|------|
| 단일 에이전트 | 20분 | $9 | 핵심 기능 결함 |
| 3-agent 파이프라인 | 6시간 | $200 | 기능적으로 완성, 폴리싱 포함 |

다른 프로젝트(Digital Audio Workstation)에서의 비용 분해를 보면, Generator가 전체의 91%($113.85)를 차지합니다. Planner는 $0.46, Evaluator는 $10.39입니다. 계획과 평가의 비용은 상대적으로 작고, 실제 작업 수행이 비용의 대부분입니다.

### 비용 완화 전략

프로덕션 시스템들이 사용하는 다섯 가지 전략입니다.

**1. 모델 라우팅.** 오케스트레이터에 고성능 모델, 워커에 효율적인 모델을 배치합니다. Anthropic의 multi-agent research system이 정확히 이 구조입니다. 리드 에이전트는 Opus, 서브에이전트는 Sonnet입니다. Anthropic은 "Sonnet 4로 업그레이드하는 것이 Sonnet 3.7에서 토큰 예산을 두 배로 늘리는 것보다 더 큰 성능 향상"을 보인다고 합니다. 더 좋은 모델을 쓰는 것이 더 많은 토큰을 쓰는 것보다 효율적입니다.

**2. 에이전트별 컴팩션.** 각 서브에이전트 내부에서 [여섯 번째 글](/agent/compaction-pipeline/)의 컴팩션 파이프라인이 독립적으로 작동합니다.

**3. 조기 종료.** 에이전트별 토큰 예산을 설정하고, 초과 시 부분 결과를 반환합니다.

**4. 결과 중복 제거.** 여러 서브에이전트가 같은 정보를 찾았을 때, 오케스트레이터가 중복을 제거합니다.

**5. 프롬프트 캐싱.** Codex의 "정적 요소를 앞에, 가변 요소를 뒤에" 배치하는 전략이 서브에이전트에도 적용됩니다. 시스템 프롬프트와 공통 지침이 캐시되면, 여러 서브에이전트가 같은 캐시를 공유할 수 있습니다.

<div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">

**비용과 품질의 trade-off.** Anthropic은 "멀티에이전트 시스템은 작업의 가치가 충분히 높은 경우에만 정당화된다"고 명시합니다. BrowseComp 벤치마크에서 토큰, 도구 호출 횟수, 모델 선택 세 요인이 성능 분산의 95%를 설명합니다. 토큰을 더 쓸수록 좋아지지만, 수확 체감이 있습니다. 최적의 에이전트 수와 토큰 예산은 작업의 경제적 가치에 의해 결정됩니다.

</div>

---

## 신뢰 경계와 퍼미션 에스컬레이션

멀티에이전트의 다섯 번째 문제는 신뢰입니다. 단일 에이전트에서 퍼미션은 사용자와 에이전트 사이의 문제였습니다. 멀티에이전트에서는 에이전트 간의 신뢰도 설계해야 합니다.

### 에스컬레이션 프로토콜

[일곱 번째 글](/agent/agent-permission-safety/)에서 `bubble` 모드의 존재와 `EscalateToParent`의 코드를 확인했습니다. 여기서는 이 메커니즘이 멀티에이전트 시스템에서 어떻게 작동하는지를 살펴봅니다.

서브에이전트가 `bubble` 모드로 실행 중일 때, 퍼미션이 필요한 도구 호출을 만나면 자체적으로 판단하지 않습니다. 대신 `EscalateToParent` 예외를 발생시켜 부모 에이전트로 올립니다. 부모 에이전트는 자신의 퍼미션 모드(default, auto, dontAsk 등)에 따라 [일곱 번째 글](/agent/agent-permission-safety/)의 deny-first 파이프라인으로 평가합니다. 평가 결과(허용 또는 거부)는 서브에이전트에게 돌아가고, 서브에이전트는 그 결과에 따라 실행을 계속하거나 대안을 찾습니다.

<div style="text-align: center; margin: 24px 0;">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" style="max-width: 640px; width: 100%;">
<style>
.esc-box { stroke-width: 2; rx: 8; }
.esc-text { font-family: 'Pretendard', sans-serif; font-size: 12px; text-anchor: middle; }
.esc-label { font-family: 'Pretendard', sans-serif; font-size: 11px; }
.esc-arrow { stroke-width: 2; fill: none; marker-end: url(#arrowE); }
</style>
<defs>
<marker id="arrowE" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
<path d="M0,0 L8,3 L0,6" fill="var(--text, #1c1917)" />
</marker>
</defs>
<!-- Sub-agent -->
<rect x="20" y="30" width="130" height="50" class="esc-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="85" y="52" class="esc-text" fill="var(--text, #1c1917)">서브에이전트</text>
<text x="85" y="68" class="esc-text" fill="var(--text-muted, #78716c)">(bubble 모드)</text>
<!-- Arrow 1: escalate -->
<line x1="150" y1="55" x2="210" y2="55" class="esc-arrow" stroke="var(--primary, #0d9488)" />
<text x="180" y="47" class="esc-label" fill="var(--primary, #0d9488)" text-anchor="middle" font-size="10">EscalateToParent</text>
<!-- Parent -->
<rect x="215" y="30" width="130" height="50" class="esc-box" fill="var(--primary, #0d9488)" fill-opacity="0.15" stroke="var(--primary, #0d9488)" />
<text x="280" y="52" class="esc-text" fill="var(--text, #1c1917)">부모 에이전트</text>
<text x="280" y="68" class="esc-text" fill="var(--text-muted, #78716c)">(default/auto/dontAsk)</text>
<!-- Arrow 2: to pipeline -->
<line x1="345" y1="55" x2="405" y2="55" class="esc-arrow" stroke="var(--text, #1c1917)" />
<!-- Pipeline -->
<rect x="410" y="20" width="210" height="70" class="esc-box" fill="var(--bg-subtle, #f5f5f4)" stroke="var(--border, #d6d3d1)" />
<text x="515" y="45" class="esc-text" fill="var(--text, #1c1917)">Deny-First 파이프라인</text>
<text x="515" y="62" class="esc-text" fill="var(--text-muted, #78716c)">Deny → Allow → 분류기 → 사용자</text>
<text x="515" y="78" class="esc-text" fill="var(--text-muted, #78716c)">(7단계 평가)</text>
<!-- Arrow 3: result back -->
<path d="M515,90 L515,140 L85,140 L85,80" class="esc-arrow" stroke="var(--text, #1c1917)" stroke-dasharray="6,3" />
<text x="300" y="155" class="esc-label" fill="var(--text, #1c1917)" text-anchor="middle">허용 또는 거부 결과 반환</text>
<!-- Two outcomes -->
<rect x="20" y="180" width="130" height="40" class="esc-box" fill="#10b981" fill-opacity="0.15" stroke="#10b981" />
<text x="85" y="205" class="esc-text" fill="var(--text, #1c1917)">허용 → 도구 실행</text>
<rect x="180" y="180" width="160" height="40" class="esc-box" fill="#ef4444" fill-opacity="0.15" stroke="#ef4444" />
<text x="260" y="205" class="esc-text" fill="var(--text, #1c1917)">거부 → 대안 탐색/중단</text>
<line x1="55" y1="160" x2="55" y2="175" class="esc-arrow" stroke="#10b981" />
<line x1="115" y1="160" x2="230" y2="175" class="esc-arrow" stroke="#ef4444" />
</svg>
</div>
<p align="center" style="color: var(--text-muted, #78716c); font-size: 14px;">
  <em>bubble 모드 에스컬레이션 흐름. 서브에이전트가 퍼미션 판단을 부모에게 위임하고, 부모의 파이프라인이 평가한 결과에 따라 실행이 결정됩니다.</em>
</p>

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

---

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

## 직접 구현: 멀티에이전트 오케스트레이터

지금까지 다룬 다섯 가지 문제를 하나의 코드로 묶어봅니다. 이전 글들의 구현을 확장합니다. [다섯 번째 글](/agent/agent-loop-anatomy/)의 `production_loop`, [일곱 번째 글](/agent/agent-permission-safety/)의 `PermissionPipeline`을 기반으로 멀티에이전트 오케스트레이터를 만듭니다.

먼저 서브에이전트를 정의합니다.

```python
@dataclass
class SubAgent:
    agent_id: str
    task: str
    token_budget: int = 100_000
    max_turns: int = 30
    context: list = field(default_factory=list)
    tokens_used: int = 0

    async def run(self, tools: dict, llm_call, parent_pipeline) -> dict:
        """격리된 컨텍스트에서 작업을 실행한다."""
        self.context.append({"role": "user", "content": self.task})

        for turn in range(self.max_turns):
            if self.tokens_used >= self.token_budget:
                break

            response = await llm_call(self.context, tools)
            self.tokens_used += response.get("usage", {}).get("total_tokens", 0)
            self.context.append({
                "role": "assistant",
                "content": response.get("content", ""),
                "tool_calls": response.get("tool_calls", []),
            })

            if not response.get("tool_calls"):
                break

            for tool_call in response["tool_calls"]:
                try:
                    result = await self._execute_with_escalation(
                        tool_call, tools, parent_pipeline
                    )
                    self.context.append({"role": "tool", "content": result})
                except PermissionDenied as e:
                    self.context.append({
                        "role": "tool",
                        "content": f"permission_denied: {e.reason}"
                    })

        return {
            "agent_id": self.agent_id,
            "summary": await self._summarize(llm_call),
            "tokens_used": self.tokens_used,
        }

    async def _execute_with_escalation(self, tool_call, tools, parent_pipeline):
        """bubble 모드: 퍼미션 판단을 부모에게 위임한다."""
        decision = await parent_pipeline.evaluate(
            tool_call["name"], tool_call["arguments"]
        )
        if not decision.allowed:
            raise PermissionDenied(decision.reason)
        return await tools[tool_call["name"]](**tool_call["arguments"])

    async def _summarize(self, llm_call) -> str:
        if not self.context:
            return ""
        response = await llm_call(
            self.context + [{"role": "user", "content": "지금까지의 작업을 3문장 이내로 요약하세요."}],
            {}
        )
        self.tokens_used += response.get("usage", {}).get("total_tokens", 0)
        return response.get("content", "")
```

`SubAgent`의 핵심은 세 가지입니다. 첫째, 자체 `context` 리스트를 가져 부모와 격리됩니다. 둘째, `token_budget`과 `max_turns`로 자원 소비를 제한합니다. 셋째, 모든 도구 호출을 `parent_pipeline.evaluate()`로 에스컬레이션합니다.

다음은 오케스트레이터입니다.

```python
class MultiAgentOrchestrator:
    def __init__(self, permission_pipeline, max_retries: int = 2):
        self.pipeline = permission_pipeline
        self.max_retries = max_retries
        self.total_tokens = 0
        self.agent_count = 0

    async def execute(self, task: str, tools: dict, llm_call) -> dict:
        subtasks = await self._decompose(task, llm_call)
        agents = [
            SubAgent(agent_id=f"worker-{i}", task=st)
            for i, st in enumerate(subtasks)
        ]
        self.agent_count = len(agents)

        results = await asyncio.gather(
            *[a.run(tools, llm_call, self.pipeline) for a in agents]
        )
        self.total_tokens = sum(r["tokens_used"] for r in results)

        good, bad = [], []
        for r in results:
            (good if await self._evaluate(r, llm_call) else bad).append(r)

        for retry in range(self.max_retries):
            if not bad:
                break
            retry_agents = [
                SubAgent(
                    agent_id=f"retry-{retry}-{i}",
                    task=self._feedback_prompt(b),
                )
                for i, b in enumerate(bad)
            ]
            retry_results = await asyncio.gather(
                *[a.run(tools, llm_call, self.pipeline) for a in retry_agents]
            )
            self.total_tokens += sum(r["tokens_used"] for r in retry_results)
            self.agent_count += len(retry_agents)

            bad = []
            for r in retry_results:
                (good if await self._evaluate(r, llm_call) else bad).append(r)

        return await self._synthesize(good, llm_call)

    async def _decompose(self, task: str, llm_call) -> list[str]:
        response = await llm_call(
            [{"role": "user", "content": (
                f"다음 작업을 독립적인 하위 작업으로 분해하세요.\n"
                f"JSON 배열로 반환하세요. 예: [\"작업1\", \"작업2\"]\n\n{task}"
            )}],
            {}
        )
        try:
            return json.loads(response.get("content", "[]"))
        except (json.JSONDecodeError, TypeError):
            return [task]

    async def _evaluate(self, result: dict, llm_call) -> bool:
        response = await llm_call(
            [{"role": "user", "content": (
                f"이 결과의 품질을 0.0-1.0으로 평가하세요.\n"
                f"숫자만 반환하세요. 예: 0.8\n\n{result['summary']}"
            )}],
            {}
        )
        try:
            return float(response.get("content", "0")) >= 0.7
        except (ValueError, TypeError):
            return False

    def _feedback_prompt(self, failed_result: dict) -> str:
        return f"이전 시도가 품질 기준을 통과하지 못했습니다. 다시 시도하세요: {failed_result['summary']}"

    async def _synthesize(self, results: list, llm_call) -> dict:
        summaries = "\n".join(r["summary"] for r in results)
        response = await llm_call(
            [{"role": "user", "content": f"다음 결과들을 종합하세요:\n{summaries}"}],
            {}
        )
        return {
            "result": response.get("content", ""),
            "total_tokens": self.total_tokens,
            "agents_spawned": self.agent_count,
        }
```

오케스트레이터의 흐름은 다섯 가지 문제에 대응합니다.

1. **조정**: `_decompose`로 작업을 분해하고, `asyncio.gather`로 병렬 실행합니다.
2. **상태**: 각 `SubAgent`가 격리된 `context`를 가집니다. 오케스트레이터는 `summary`만 받습니다.
3. **실패**: `_evaluate`로 품질을 검증하고, 실패 시 피드백과 함께 재시도합니다.
4. **비용**: `SubAgent`의 `token_budget`으로 에이전트별 지출을 제한하고, `total_tokens`와 `agent_count`로 전체 소비를 추적합니다.
5. **신뢰**: 모든 도구 호출이 `parent_pipeline`을 거칩니다.

마지막으로, 실행과 비용 추적을 포함한 진입점입니다.

```python
async def run_multi_agent(task: str, tools: dict, llm_call):
    pipeline = PermissionPipeline(mode=PermissionMode.DEFAULT)
    orchestrator = MultiAgentOrchestrator(pipeline)
    result = await orchestrator.execute(task, tools, llm_call)

    print(f"총 토큰: {result['total_tokens']:,}")
    print(f"생성된 에이전트: {result['agents_spawned']}")
    print(f"추정 비용: ${result['total_tokens'] * 0.000003:.2f}")
    return result
```

이 구현과 프로덕션 시스템의 차이를 정리합니다.

| 관점 | 이 코드 | 프로덕션 |
|------|---------|---------|
| 작업 분해 | LLM 단일 호출 | 도메인 특화 분해 로직 + 동적 에이전트 수 조정 |
| 품질 평가 | 단일 점수 (0.0-1.0) | 5차원 평가 (정확성, 인용, 완전성, 출처 품질, 효율성) |
| 상태 공유 | 요약 텍스트만 | 사이드체인 파일 + 감사 로그 |
| 장애 복구 | 재시도 (최대 2회) | 체크포인트, git 롤백, 외부 Memory 저장 |
| 모델 라우팅 | 동일 모델 | 오케스트레이터: Opus, 워커: Sonnet |
| 동시성 제어 | `asyncio.gather` (무제한) | 깊이 제한, 스레드 캡, 토큰 예산 |

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

| 열린 문제 | 이 글에서 확인한 것 | 아직 다루지 않은 것 | 다룰 글 |
|-----------|-------------------|-------------------|--------|
| 관찰성 | 사이드체인 파일로 감사 로그 | 표준화된 트레이싱 포맷 | 후속 글 |
| 에이전트-도구 표준 | 내부 프로토콜 (함수, 파일, SQLite) | MCP를 통한 외부 도구 표준화 | 후속 글 |
| 에이전트-에이전트 표준 | 시스템별 내부 통신 | A2A 프로토콜의 가능성 | 후속 글 |
| 품질 자동 평가 | LLM-as-Judge (5차원) | 평가 파이프라인 설계 체계 | 후속 글 |

---

## 마치며

[첫 번째 글](/agent/what-is-ai-agent/)에서 출발한 이 시리즈는 하나의 에이전트를 해부하는 것으로 시작했습니다. 루프가 어떻게 돌아가는지, 컨텍스트를 어떻게 관리하는지, 도구 실행을 어떻게 통제하는지. 이 글에서 시야를 넓혔습니다. 여러 에이전트가 협력할 때, 단일 에이전트에 없던 다섯 가지 새로운 문제가 생깁니다. 조정 토폴로지, 상태 공유, 실패 전파, 토큰 경제학, 신뢰 경계.

분산 시스템이 모놀리스에 없던 장애 모드를 만들어낸 것처럼, 멀티에이전트는 단일 에이전트에 없던 복잡성을 만들어냅니다. 그리고 그 해법도 분산 시스템에서 빌려올 수 있습니다. 격리, 이벤트 소싱, 최소 권한, 예산 제한, 체크포인트. 다만 에이전트에는 고유한 차원이 추가됩니다. 모델의 판단이 비결정적이고, 자신의 출력 품질을 과대평가할 수 있다는 것. 같은 입력에도 다른 경로를 택할 수 있고, 잘못된 경로를 택하고도 성공했다고 보고할 수 있으므로, 결정론적 시스템보다 더 방어적으로 설계해야 합니다.

지금까지 에이전트 간의 통신은 함수 호출, 사이드체인, 에스컬레이션 같은 시스템 내부 메커니즘에 의존했습니다. 그런데 프로덕션에서는 에이전트가 미리 알 수 없는 외부 도구와도 연결되어야 합니다. 후속 글에서는 에이전트와 외부 서비스를 표준화된 인터페이스로 연결하는 프로토콜을 살펴봅니다.

---

## 참고자료

- [How We Built Multi-Agent Research (Anthropic)](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Harness Design for Long-Running Application Development (Anthropic)](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Scaling Managed Agents: Decoupling the Brain from the Hands (Anthropic)](https://www.anthropic.com/engineering/managed-agents)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [A Practical Guide to Building Agents (OpenAI)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
