---
date: '2026-06-05'
title: 'AI Agent의 퍼미션 시스템: 도구 실행 전에 일어나는 일곱 단계의 판단'
category: 'AI Agent'
series: 'agent'
seriesOrder: 7
tags: ['Permission System', 'AI Agent', 'Claude Code', 'Codex', 'deny-first', 'ML Classifier']
summary: '에이전트가 도구를 실행하기 전에 거치는 판단 과정을 해부합니다. Claude Code의 7-mode deny-first 퍼미션 파이프라인과 ML 분류기의 위험도 판단, 그리고 Codex의 OS 수준 샌드박스 격리를 비교합니다.'
thumbnail: './thumbnail.png'
---

Claude Code에 "이 디렉터리의 임시 파일을 정리해줘"라고 요청하면, `rm /tmp/cache/*.log`는 아무런 확인 없이 즉시 실행됩니다. 그런데 같은 세션에서 `rm -rf ~/Documents`를 실행하려 하면, 루프가 멈추고 사용자에게 승인을 요청합니다. 둘 다 `Bash` 도구로 `rm`을 실행하는 것입니다. 같은 도구, 같은 명령어인데 하나는 통과하고 하나는 차단됩니다. 모델이 도구 호출을 결정한 시점과 도구가 실제로 실행되는 시점 사이에 무엇이 있을까요?

그 사이에는 판단 계층이 하나 있습니다. 에이전트 루프는 모델 응답에서 도구 호출을 꺼낸 뒤 곧바로 실행하지 않고, 이 호출을 허용해도 되는지부터 결정합니다. 이 글은 도구 실행 직전에 놓인 그 계층을 해부합니다.

---

## 사전 필터와 사후 판단: 2-Phase 퍼미션

퍼미션을 "도구 호출 후에 허용/차단을 결정하는 게이트"로만 생각하기 쉽습니다. 하지만 Claude Code의 퍼미션은 **두 단계**로 작동합니다.

**Phase 1: 사전 필터 (모델 호출 전)**

모델에게 넘길 도구 목록을 조립하는 `assembleToolPool()`이 이 역할을 합니다. 퍼미션 모드 필터링, deny 규칙 적용, MCP 도구 통합, 중복 제거를 차례로 거쳐 모델이 볼 수 있는 도구 목록 자체를 결정합니다.

**Phase 2: 사후 판단 (모델 호출 후)**

모델이 도구를 선택한 뒤, 그 특정 호출이 허용되는지를 7단계 파이프라인이 평가합니다. 이 글의 본론입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 858" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="퍼미션 판단의 2단계 구조. 위 패널은 모델 호출 전 사전 필터가 도구 목록을 축소하는 과정, 아래 패널은 모델이 도구를 선택한 뒤 실행 여부를 판단하는 과정을 보여줍니다.">
  <style>
    .pp2p-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pp2p-step { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pp2p-deny { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.5; }
    .pp2p-allow { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.5; }
    .pp2p-key { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .pp2p-hd { fill: var(--primary, #0d9488); font-size: 20px; font-weight: 600; text-anchor: middle; }
    .pp2p-t { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .pp2p-s { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .pp2p-arr { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#pp2pArr); }
  </style>
  <defs>
    <marker id="pp2pArr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/></marker>
  </defs>
  <!-- Phase 1 panel -->
  <rect x="10" y="8" width="460" height="372" rx="10" class="pp2p-panel"/>
  <text x="240" y="38" class="pp2p-hd">Phase 1: 사전 필터 (모델 호출 전)</text>
  <rect x="50" y="54" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="80" class="pp2p-t">최대 54개 도구</text>
  <line x1="240" y1="96" x2="240" y2="106" class="pp2p-arr"/>
  <rect x="50" y="108" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="134" class="pp2p-t">퍼미션 모드 필터링</text>
  <line x1="240" y1="150" x2="240" y2="160" class="pp2p-arr"/>
  <rect x="50" y="162" width="380" height="40" rx="8" class="pp2p-deny"/>
  <text x="240" y="188" class="pp2p-t">deny 규칙 적용</text>
  <line x1="240" y1="204" x2="240" y2="214" class="pp2p-arr"/>
  <rect x="50" y="216" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="242" class="pp2p-t">MCP 도구 통합</text>
  <line x1="240" y1="258" x2="240" y2="268" class="pp2p-arr"/>
  <rect x="50" y="270" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="296" class="pp2p-t">중복 제거</text>
  <line x1="240" y1="312" x2="240" y2="322" class="pp2p-arr"/>
  <rect x="50" y="324" width="380" height="40" rx="8" class="pp2p-key"/>
  <text x="240" y="350" class="pp2p-t">모델에게 전달 (축소된 도구 목록)</text>
  <!-- transition -->
  <line x1="240" y1="386" x2="240" y2="418" class="pp2p-arr"/>
  <text x="256" y="406" class="pp2p-s" style="text-anchor: start">모델 호출</text>
  <!-- Phase 2 panel -->
  <rect x="10" y="422" width="460" height="426" rx="10" class="pp2p-panel"/>
  <text x="240" y="452" class="pp2p-hd">Phase 2: 사후 판단 (모델 호출 후)</text>
  <rect x="50" y="468" width="380" height="40" rx="8" class="pp2p-key"/>
  <text x="240" y="494" class="pp2p-t">모델이 선택한 도구 호출</text>
  <line x1="240" y1="510" x2="240" y2="520" class="pp2p-arr"/>
  <rect x="50" y="522" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="548" class="pp2p-t">모드 게이트</text>
  <line x1="240" y1="564" x2="240" y2="574" class="pp2p-arr"/>
  <rect x="50" y="576" width="380" height="40" rx="8" class="pp2p-deny"/>
  <text x="240" y="602" class="pp2p-t">deny 규칙 검사</text>
  <line x1="240" y1="618" x2="240" y2="628" class="pp2p-arr"/>
  <rect x="50" y="630" width="380" height="40" rx="8" class="pp2p-allow"/>
  <text x="240" y="656" class="pp2p-t">allow 규칙 검사</text>
  <line x1="240" y1="672" x2="240" y2="682" class="pp2p-arr"/>
  <rect x="50" y="684" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="710" class="pp2p-t">ML 분류기 (auto 모드)</text>
  <line x1="240" y1="726" x2="240" y2="736" class="pp2p-arr"/>
  <rect x="50" y="738" width="380" height="40" rx="8" class="pp2p-step"/>
  <text x="240" y="764" class="pp2p-t">사용자 프롬프트 (필요시)</text>
  <line x1="240" y1="780" x2="240" y2="790" class="pp2p-arr"/>
  <rect x="50" y="792" width="380" height="40" rx="8" class="pp2p-key"/>
  <text x="240" y="818" class="pp2p-t">실행 또는 거부 라우팅</text>
</svg>
</div>

이 2-phase 구조가 중요한 이유는 **정보 이론적 차이** 때문입니다. Phase 1에서 도구를 제거하면, 모델은 그 도구의 존재 자체를 모릅니다. 호출을 시도할 수도 없습니다. Phase 2에서 거부하면, 모델은 도구의 존재를 알고 호출을 시도했지만 차단된 것입니다. 전자가 구조적으로 더 강력한 제약입니다.

`plan` 모드가 대표적인 예입니다. Phase 1(`assembleToolPool`)의 퍼미션 모드 필터링 단계에서 `Bash`, `Edit`, `Write` 같은 쓰기 도구가 도구 목록에서 제거됩니다. 모델은 파일을 읽고 분석할 수는 있지만, 수정할 도구 자체가 없으므로 수정을 시도하지 않습니다. 설령 Phase 1을 통과한 도구가 있더라도, Phase 2의 Mode Gate(Stage 1)에서 한 번 더 차단합니다. 즉, `plan` 모드는 **양쪽 Phase 모두에서** 쓰기를 차단하는 이중 방어 구조입니다. 반면 `default` 모드에서는 Phase 1이 쓰기 도구를 목록에 포함시키고, Phase 2에서 개별 호출 시 사용자 승인을 요구합니다.

---

## 7-Mode 스펙트럼

Claude Code의 퍼미션 모드는 모두 7개입니다. 각 모드가 퍼미션 파이프라인의 동작을 어떻게 바꾸는지를 살펴봅니다.

| 모드 | 결정 주체 | 자동 승인 범위 | 프롬프트 대상 | 사용 사례 |
|------|----------|--------------|-------------|----------|
| `plan` | 하네스 | 읽기 전용 도구만 | 쓰기/실행 도구 차단 (Phase 1에서 제거 + Phase 2에서 거부) | 아키텍처 탐색, 코드 리뷰 |
| `default` | 사용자 | 읽기 전용 도구 | 모든 쓰기, Bash 실행 | 일반 사용 (기본값) |
| `acceptEdits` | 사용자+하네스 | 읽기 + 파일 편집 | Bash 실행, 위험한 작업 | 코드 수정 중심 작업 |
| `dontAsk` | 하네스 | 대부분의 작업 | 고위험 작업만 | 자동화된 배치 작업 |
| `bypassPermissions` | 없음 | 전부 | 없음 | 개발/테스트 전용 |
| `auto` | ML 분류기 | 분류기가 safe 판단 | 분류기가 risky 판단 | feature-gated |
| `bubble` | 부모 에이전트 | 없음 (자체 판단 불가) | 부모에게 에스컬레이션 | 서브에이전트 전용 |

이 7개 모드는 **자율성의 그래디언트**를 형성합니다. `plan`(모든 쓰기 차단)에서 `bypassPermissions`(모든 것 허용)까지, 사용자가 에이전트에게 얼마나 많은 판단을 위임할지를 결정하는 스펙트럼입니다.

흥미로운 것은 `auto`와 `bubble` 두 모드입니다.

`auto`는 스펙트럼 위의 한 점이 아니라, **스펙트럼 자체를 동적으로 움직이는 모드**입니다. ML 분류기가 각 도구 호출의 위험도를 판단해서, 안전한 호출은 `dontAsk`처럼 자동 승인하고, 위험한 호출은 `default`처럼 사용자에게 물어봅니다. 사용자가 매번 판단하는 대신 분류기가 "이건 물어볼 필요 없다"를 결정하는 것입니다.

`bubble`은 아예 다른 차원의 모드입니다. 단일 에이전트가 아니라 **서브에이전트가 부모에게 권한을 위임**하는 구조입니다. 서브에이전트는 자체적으로 퍼미션을 판단하지 않고, 판단이 필요한 도구 호출을 부모 에이전트로 올려보냅니다. 부모의 퍼미션 모드에 따라 최종 결정이 내려집니다.

```python
from enum import Enum


class PermissionMode(Enum):
    PLAN = "plan"
    DEFAULT = "default"
    ACCEPT_EDITS = "acceptEdits"
    DONT_ASK = "dontAsk"
    BYPASS = "bypassPermissions"
    AUTO = "auto"
    BUBBLE = "bubble"


READ_ONLY_TOOLS = {"Read", "Grep", "Glob", "LSP"}


def should_prompt(mode: PermissionMode, tool_name: str,
                  classifier=None, context=None) -> bool:
    """이 도구 호출에 사용자 승인이 필요한지 판단합니다."""
    if mode == PermissionMode.PLAN:
        return tool_name not in READ_ONLY_TOOLS  # True = 차단
    if mode == PermissionMode.BYPASS:
        return False
    if mode == PermissionMode.BUBBLE:
        raise EscalateToParent(tool_name)  # 부모 에이전트로 위임
    if tool_name in READ_ONLY_TOOLS:
        return False
    if mode == PermissionMode.ACCEPT_EDITS:
        return tool_name not in {"Edit", "Write"}  # Edit/Write만 프롬프트 면제
    if mode == PermissionMode.DONT_ASK:
        return is_high_risk(tool_name, context)
    if mode == PermissionMode.AUTO:
        return classifier(tool_name, context).is_risky
    return True  # default: 쓰기 도구는 항상 물어봄
```

이 코드에서 볼 수 있듯, `plan` 모드는 읽기 전용 도구 외에는 모두 프롬프트를 요구하고, `bypass` 모드는 어떤 경우에도 프롬프트를 요구하지 않습니다. 그 사이의 모드들은 자동 승인 범위를 점진적으로 넓혀갑니다.

---

## Deny-First 파이프라인

모드가 "얼마나 물어볼 것인가"를 결정한다면, deny-first 파이프라인은 "어떤 순서로 판단할 것인가"를 결정합니다. Claude Code의 퍼미션 시스템을 흔히 "7-mode, deny-first"로 요약하는데, 뒤쪽 절반인 "deny-first"의 실제 의미론을 살펴봅니다.

도구 호출이 도착하면 다음 7단계를 순서대로 거칩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 520" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="deny-first 퍼미션 파이프라인의 7단계. 모드 게이트, deny 규칙, allow 규칙, ML 분류기, 사용자 프롬프트, 거부 라우팅, 실행 순서로 평가되며 deny 규칙이 allow 규칙보다 먼저 검사됩니다.">
  <style>
    .pps-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .pps-deny { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.5; }
    .pps-allow { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.5; }
    .pps-t { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .pps-s { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .pps-chip { font-size: 20px; font-weight: 600; text-anchor: middle; fill: var(--bg, #fafaf8); }
    .pps-ok { fill: var(--text-success, #16a34a); font-size: 17px; text-anchor: start; }
    .pps-note { fill: var(--primary, #0d9488); font-size: 17px; text-anchor: middle; }
    .pps-arr { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#ppsArr); }
    .pps-arr-d { stroke: var(--text-danger, #dc2626); stroke-width: 1.5; fill: none; marker-end: url(#ppsArrD); }
    .pps-arr-a { stroke: var(--text-success, #16a34a); stroke-width: 1.5; fill: none; marker-end: url(#ppsArrA); }
    .pps-join { stroke: var(--text-success, #16a34a); stroke-width: 1.5; fill: none; }
  </style>
  <defs>
    <marker id="ppsArr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/></marker>
    <marker id="ppsArrD" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-danger, #dc2626)"/></marker>
    <marker id="ppsArrA" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-success, #16a34a)"/></marker>
  </defs>
  <!-- Stage 1: Mode Gate -->
  <rect x="20" y="12" width="300" height="56" rx="8" class="pps-box"/>
  <text x="170" y="38" class="pps-t">1. Mode Gate</text>
  <text x="170" y="60" class="pps-s">plan 모드면 쓰기 도구 차단</text>
  <line x1="170" y1="70" x2="170" y2="86" class="pps-arr"/>
  <!-- Stage 2: Deny Rules -->
  <rect x="20" y="88" width="300" height="44" rx="8" class="pps-deny"/>
  <text x="170" y="117" class="pps-t" style="font-weight:600">2. Deny Rules</text>
  <line x1="322" y1="110" x2="344" y2="110" class="pps-arr-d"/>
  <rect x="350" y="92" width="110" height="36" rx="6" fill="var(--text-danger, #dc2626)"/>
  <text x="405" y="118" class="pps-chip">DENY</text>
  <line x1="170" y1="134" x2="170" y2="150" class="pps-arr"/>
  <!-- Stage 3: Allow Rules -->
  <rect x="20" y="152" width="300" height="44" rx="8" class="pps-allow"/>
  <text x="170" y="181" class="pps-t" style="font-weight:600">3. Allow Rules</text>
  <line x1="322" y1="174" x2="344" y2="174" class="pps-arr-a"/>
  <rect x="350" y="156" width="110" height="36" rx="6" fill="var(--text-success, #16a34a)"/>
  <text x="405" y="182" class="pps-chip">ALLOW</text>
  <line x1="170" y1="198" x2="170" y2="214" class="pps-arr"/>
  <!-- Stage 4: ML Classifier -->
  <rect x="20" y="216" width="300" height="56" rx="8" class="pps-box"/>
  <text x="170" y="242" class="pps-t">4. ML Classifier</text>
  <text x="170" y="264" class="pps-s">auto 모드일 때만 실행</text>
  <path d="M320 244 H400" class="pps-join"/>
  <text x="330" y="236" class="pps-ok">safe</text>
  <line x1="170" y1="274" x2="170" y2="304" class="pps-arr"/>
  <text x="180" y="294" class="pps-s" style="text-anchor: start">risky</text>
  <!-- Stage 5: User Prompt -->
  <rect x="20" y="306" width="300" height="44" rx="8" class="pps-box"/>
  <text x="170" y="335" class="pps-t">5. User Prompt</text>
  <path d="M320 328 H400" class="pps-join"/>
  <text x="330" y="320" class="pps-ok">approve</text>
  <line x1="170" y1="352" x2="170" y2="382" class="pps-arr"/>
  <text x="180" y="372" class="pps-s" style="text-anchor: start">deny</text>
  <!-- Stage 6: Denial Routing -->
  <rect x="20" y="384" width="300" height="56" rx="8" class="pps-box"/>
  <text x="170" y="410" class="pps-t">6. Denial Routing</text>
  <text x="170" y="432" class="pps-s">거부 결과를 모델에게 전달</text>
  <line x1="170" y1="442" x2="170" y2="458" class="pps-arr"/>
  <!-- Stage 7: Execute or Route -->
  <rect x="20" y="460" width="300" height="44" rx="8" class="pps-allow"/>
  <text x="170" y="489" class="pps-t" style="font-weight:600">7. Execute or Route</text>
  <!-- safe / approve 합류 레일: Stage 7 박스로 직접 진입 -->
  <path d="M400 244 V482 H326" class="pps-arr-a"/>
</svg>
</div>

각 단계를 살펴보겠습니다.

**Stage 1: Mode Gate.** 현재 퍼미션 모드를 확인합니다. `plan` 모드면 쓰기/실행 도구 호출을 즉시 차단합니다. `bypassPermissions`면 나머지 단계를 모두 건너뛰고 즉시 실행합니다. 다른 모드면 다음 단계로 넘어갑니다.

**Stage 2: Deny Rules.** 도구 호출이 deny 패턴과 매칭되는지 검사합니다. 프로젝트의 `.claude/settings.json`이나 사용자 설정에서 정의된 deny 규칙과 시스템 기본 deny 규칙이 합산됩니다. 매칭되면 **즉시 거부**하고 파이프라인을 종료합니다.

**Stage 3: Allow Rules.** deny를 통과한 호출이 allow 패턴과 매칭되는지 검사합니다. 매칭되면 **즉시 허용**하고 나머지 단계를 건너뜁니다.

**Stage 4: ML Classifier.** `auto` 모드일 때만 실행됩니다. 분류기가 호출의 위험도를 판단하여, safe면 허용하고 risky면 다음 단계(사용자 프롬프트)로 넘깁니다.

**Stage 5: User Prompt.** 사용자에게 도구 호출을 승인할지 물어봅니다. 승인하면 실행하고, 거부하면 다음 단계로 넘깁니다.

**Stage 6: Denial Routing.** 거부 결과를 `permission_denied` 메시지로 포장하여 모델에게 전달합니다. 이 부분은 뒤에서 자세히 다룹니다.

**Stage 7: Execute or Route.** 허용된 호출을 실행하거나, 거부 라우팅 결과를 모델의 다음 턴 입력에 추가합니다.

이 순서에서 가장 중요한 설계 결정은 **Stage 2가 Stage 3보다 먼저 실행된다**는 것입니다. 이것이 "deny-first"의 핵심입니다.

왜 이 순서가 중요할까요? 세 가지 보안 속성 때문입니다.

| 보안 속성 | 의미 | 효과 |
|-----------|------|------|
| **Deny 우선** | deny와 allow가 동시에 매칭되면 deny가 이김 | 잘못된 allow 규칙이 deny 규칙을 덮어쓸 수 없음 |
| **Fail-safe 기본값** | deny/allow 어느 쪽에도 매칭되지 않으면 다음 단계(분류기 또는 사용자 프롬프트)로 넘어감 | 알 수 없는 작업은 자동 허용되지 않음 |
| **규칙 합성** | 여러 출처(시스템, 사용자, 프로젝트)의 deny 규칙이 합산됨 | 한 출처의 allow가 다른 출처의 deny를 무효화할 수 없음 |

반대로 allow-first였다면 어떨까요? 프로젝트 설정에 `allow: Bash(*)`를 넣으면, 시스템 기본 deny 규칙(`deny: Bash(rm -rf /)`)이 무시될 수 있습니다. deny-first는 이런 우회를 구조적으로 차단합니다.

```python
from dataclasses import dataclass
import re


@dataclass
class PermissionResult:
    allowed: bool
    reason: str
    stage: int


def evaluate_permission(
    tool_call: dict,
    mode: PermissionMode,
    deny_rules: list[str],
    allow_rules: list[str],
) -> PermissionResult:
    """deny-first 순서로 퍼미션을 평가합니다."""
    tool_name = tool_call["name"]
    tool_args = tool_call.get("arguments", {})
    call_repr = f"{tool_name}({tool_args})"

    # Stage 1: Mode Gate
    if mode == PermissionMode.PLAN and tool_name not in READ_ONLY_TOOLS:
        return PermissionResult(False, "plan 모드: 쓰기 차단", 1)
    if mode == PermissionMode.BYPASS:
        return PermissionResult(True, "bypass 모드: 전부 허용", 1)

    # Stage 2: Deny Rules (먼저 검사)
    for pattern in deny_rules:
        if re.search(pattern, call_repr):
            return PermissionResult(False, f"deny 규칙 매칭: {pattern}", 2)

    # Stage 3: Allow Rules (deny 통과 후 검사)
    for pattern in allow_rules:
        if re.search(pattern, call_repr):
            return PermissionResult(True, f"allow 규칙 매칭: {pattern}", 3)

    # Stage 4-5로 넘어감 (이 함수는 규칙 평가만 담당)
    return PermissionResult(False, "규칙 미매칭: 분류기/사용자 판단 필요", 4)
```

이 코드에서 `deny_rules` 루프가 `allow_rules` 루프보다 먼저 실행됩니다. deny에 매칭되면 allow 검사 자체를 건너뛰고 즉시 반환합니다. 이것이 deny-first의 구현입니다.

---

## ML 분류기: 파이프라인 속의 전문 감정인

deny 규칙과 allow 규칙 사이를 빠져나간 도구 호출은 어떻게 될까요? `auto` 모드라면 ML 분류기가 판단합니다. 내부 코드명 `yoloClassifier`로 불리는 이 분류기는 빠른 경로와 심층 경로를 잇는 2단계 구조를 쓰고, 그 덕분에 오탐율이 8.5%에서 0.4%까지 내려갔습니다. 여기서는 분류기가 **무엇을 보고** 판단하는지를 다룹니다.

### 분류기의 입력

분류기는 전체 대화 히스토리를 받지 않습니다. 판단에 필요한 최소한의 정보만 받습니다.

| 입력 | 설명 | 영향도 |
|------|------|--------|
| 도구 이름 | `Read`, `Bash`, `Edit` 등 | 가장 강력한 신호 |
| 도구 인자 | 명령어, 파일 경로, 패턴 등 | 도구에 따라 결정적 |
| 최근 컨텍스트 | 직전 몇 턴의 대화 | 보조 신호 |
| 퍼미션 모드 | 현재 활성 모드 | 분류기 호출 여부 결정 (auto 모드만 호출) |

도구 이름이 가장 강력한 신호입니다. `Read`는 거의 항상 safe입니다. 파일을 읽는 것은 상태를 변경하지 않습니다. 반대로 `Bash`는 인자 분석 없이는 판단할 수 없습니다. `ls -la`와 `rm -rf /`는 같은 `Bash` 도구이지만 위험도가 전혀 다릅니다.

### 위험도 판단 기준

`Bash` 도구의 경우, 분류기는 인자에서 다음과 같은 패턴을 탐지합니다.

| 위험 신호 | 예시 | 판단 |
|-----------|------|------|
| 파괴적 플래그 | `--force`, `-rf`, `--hard` | risky |
| 시스템 경로 접근 | `/etc/`, `/usr/`, `~/` 상위 | risky |
| 와일드카드 삭제 | `rm *.db`, `find . -delete` | risky |
| 네트워크 작업 | `curl`, `wget`, `ssh` | risky |
| 프로젝트 내 작업 | `npm test`, `git status` | safe |
| 읽기 전용 명령 | `ls`, `cat`, `grep`, `find` | safe |

`Edit`와 `Write` 도구는 대상 파일 경로가 핵심입니다. 프로젝트 디렉터리 내부의 소스 파일 수정은 상대적으로 안전하지만, 설정 파일(`.env`, `package.json`)이나 프로젝트 외부 경로는 위험도가 올라갑니다.

### 2단계 게이트의 경계 사례

분류기의 2단계 구조를 조금 더 풀어보겠습니다. Stage 1(빠른 경로)에서 Sonnet이 `max_tokens=64`로 빠르게 분류하고, safe면 즉시 실행, 그렇지 않으면 Stage 2(심층 경로)에서 chain-of-thought로 더 신중하게 판단합니다.

경계 사례는 이 두 단계 사이에서 발생합니다. `git push origin main`을 생각해 보겠습니다. 프로젝트 작업 흐름에서 자연스러운 명령이지만, 원격 저장소에 영향을 주는 비가역적 작업이기도 합니다. Stage 1만으로는 컨텍스트가 부족합니다. Stage 2에서 "직전에 사용자가 push를 요청했는가?"를 확인하면 정확도가 올라갑니다.

이 2단계 구조가 단일 단계보다 효과적인 이유는 비용 배분 때문입니다. 도구 호출의 대다수(읽기, 프로젝트 내 명령)는 Stage 1에서 즉시 safe로 분류됩니다. 비용이 높은 Stage 2는 실제로 판단이 어려운 소수의 호출에만 사용됩니다. 값싼 판단을 앞에 세우고 비싼 판단을 뒤로 미루는 배치는 컨텍스트를 줄이는 컴팩션 파이프라인이 "덜 파괴적인 필터부터" 적용하는 것과 같은 구조입니다.

```python
from dataclasses import dataclass


@dataclass
class ClassifierResult:
    is_risky: bool
    confidence: float
    reason: str


SAFE_TOOLS = {"Read", "Grep", "Glob", "LSP"}
RISKY_PATTERNS = [
    r"--force", r"-rf\b", r"--hard",
    r"/(etc|usr|sys)/", r"rm\s+.*\*",
    r"\b(curl|wget|ssh)\b", r"-delete\b",
]
SAFE_PATTERNS = [
    r"\b(ls|cat|grep|find|head|tail)\b",
    r"\b(npm|yarn|pip)\s+(test|lint|check)\b",
    r"\bgit\s+(status|log|diff|branch)\b",
]


async def yolo_classifier(
    tool_name: str,
    tool_args: dict,
    context: list[dict],
    llm_call,
) -> ClassifierResult:
    """2단계 위험도 분류기."""
    # 읽기 전용 도구: 분류 불필요
    if tool_name in SAFE_TOOLS:
        return ClassifierResult(False, 1.0, "읽기 전용 도구")

    call_repr = f"{tool_name}({tool_args})"

    # Stage 1: 패턴 기반 빠른 분류
    for pattern in RISKY_PATTERNS:
        if re.search(pattern, call_repr):
            return ClassifierResult(True, 0.9, f"위험 패턴: {pattern}")
    for pattern in SAFE_PATTERNS:
        if re.search(pattern, call_repr):
            return ClassifierResult(False, 0.9, f"안전 패턴: {pattern}")

    # Stage 2: LLM 기반 심층 분류 (경계 사례, chain-of-thought)
    assessment = await llm_call(
        f"이 도구 호출의 위험도를 단계별로 분석하세요: {call_repr}",
        max_tokens=256,
    )
    is_risky = "risky" in assessment.lower()
    return ClassifierResult(is_risky, 0.7, f"LLM 판단: {assessment}")
```

프로덕션 구현과의 차이는 큽니다. Claude Code의 분류기는 정규표현식이 아니라 LLM을 두 번 호출하는 구조이고, Stage 1의 "빠른 분류"도 LLM 호출(`max_tokens=64`)입니다. 위 코드에서 Stage 1을 패턴 매칭으로 단순화한 것은 핵심 구조(빠른 경로 → 게이트 → 심층 경로)를 보여주기 위함입니다.

---

## Codex의 대안: OS 수준 샌드박스

Claude Code가 도구 호출 하나하나를 7단계 파이프라인으로 판단하는 동안, Codex CLI는 전혀 다른 접근을 취합니다. 개별 도구가 아니라 **프로세스 전체를 격리**합니다. Codex CLI는 macOS에서 Seatbelt, Linux에서 bwrap과 seccomp로 에이전트 프로세스를 감싸고, Codex Cloud는 아예 일회용 컨테이너 안에서 작업을 돌립니다. 이 접근과 Claude Code의 도구 수준 퍼미션을 아키텍처적으로 비교해 보겠습니다.

핵심적인 차이는 **보호 경계의 단위**입니다. Claude Code의 퍼미션은 "이 `Bash(rm -rf /tmp/cache)` 호출을 허용할까?"를 판단합니다. Codex의 샌드박스는 "이 프로세스가 네트워크에 접근할 수 있는가? 이 경로에 쓸 수 있는가?"를 강제합니다. 전자는 도구 호출의 의미를 이해해야 하고, 후자는 시스템 콜 수준에서 기계적으로 차단합니다.

### 아키텍처 비교

| 관점 | Claude Code (도구 수준) | Codex CLI (프로세스 수준) |
|------|------------------------|--------------------------|
| 보호 경계 | 개별 도구 호출 | 전체 프로세스 |
| 판단 기준 | 도구 이름 + 인자 + 컨텍스트 | 시스템 콜 + 파일 경로 |
| 우회 가능성 | 모델이 Bash로 위험 명령을 구성할 가능성 | OS가 차단 (도구 관계없이) |
| 유연성 | 도구별 세밀한 제어 가능 | 전역 정책 (세밀한 제어 어려움) |
| false positive | 분류기 오탐 (0.4%) | 정당한 네트워크 접근도 차단 |
| 사용자 상호작용 | 실시간 승인/거부 가능 | 사전 정책 설정만 가능 |
| 적합한 환경 | 대화형 세션 (사용자 참여) | 자율 실행 (결과만 수신) |

이 차이는 우연이 아닙니다. Claude Code는 사용자가 터미널에 앉아서 대화하며 작업하는 **대화형 도구**입니다. 사용자가 실시간으로 판단에 참여할 수 있으므로, 세밀한 도구 수준 퍼미션이 의미 있습니다. Codex CLI의 주요 사용 모드는 작업을 맡기고 결과를 받는 **자율 실행**입니다. 실행 중에 사용자가 승인을 해줄 수 없으므로, OS 수준에서 가능한 행동 자체를 제한하는 것이 더 적합합니다.

:::info

**같은 문제, 다른 해법의 근본 이유**

"어떤 퍼미션 모델이 더 좋은가?"는 잘못된 질문입니다. 올바른 질문은 "사용자가 에이전트 실행 중에 참여할 수 있는가?"입니다. 참여할 수 있으면 도구 수준 퍼미션(Claude Code)이 유연합니다. 참여할 수 없으면 프로세스 수준 격리(Codex)가 안전합니다.

:::

---

## 거부는 종료가 아니다: Denial as Routing

사용자가 도구 실행을 거부하면 루프가 그 자리에서 멈출 것 같지만, 실제로는 그렇지 않습니다. 거부 결과는 모델에게 전달되는 라우팅 시그널이 됩니다. 이것이 어떻게 작동하는지 살펴보겠습니다.

사용자가 `Bash(rm -rf node_modules)` 호출을 거부하면, 퍼미션 파이프라인의 Stage 6에서 다음과 같은 메시지가 생성됩니다.

```python
denied_result = {
    "role": "tool",
    "tool_use_id": tool_call.id,
    "content": "Permission denied by user. "
               "The user chose not to execute this tool call. "
               "Consider an alternative approach.",
}
```

이 메시지가 `messages` 배열에 추가되고, 다음 턴에서 모델이 이를 읽습니다. 모델은 세 가지 대안 전략을 취할 수 있습니다.

**1. 대안 도구 사용.** `Bash(rm -rf node_modules)` 대신 `Bash(rm -rf node_modules/.cache)`로 범위를 좁히거나, 아예 다른 접근법을 시도합니다.

**2. 사용자에게 설명 요청.** "node_modules를 삭제하려는 이유는 의존성을 새로 설치하기 위해서입니다. 진행해도 될까요?"처럼 맥락을 제공합니다.

**3. 작업 방향 전환.** 삭제 자체를 포기하고 다른 해결책을 모색합니다.

이 설계는 퍼미션 시스템을 단순한 **게이트**(통과/차단)가 아니라 **조향 장치**로 만듭니다. 거부는 정보입니다. "사용자는 이 방향을 원하지 않는다"는 신호가 모델의 다음 판단에 영향을 줍니다.

:::info

**permission_denied vs hard stop**

전통적인 퍼미션 시스템(파일 시스템 권한, 방화벽 규칙 등)에서 거부는 오류입니다. 프로세스가 retry하지 않는 한, 거부된 작업은 실패로 끝납니다. 에이전트 퍼미션에서 거부는 **피드백**입니다. 모델이 거부를 읽고 대안을 생성할 수 있으므로, 하나의 거부가 더 나은 결과로 이어질 수 있습니다. 이메일 발송이나 결제 처리처럼 되돌릴 수 없는 비멱등 작업 앞에 두는 확인 게이트도 이 메커니즘 위에서 작동합니다.

:::

---

## 직접 구현: 퍼미션 파이프라인

지금까지 살펴본 개념들을 하나의 `PermissionPipeline` 클래스로 통합합니다. 도구를 실행하기만 하던 기본 에이전트 루프에 퍼미션 게이트 하나를 끼워 넣는 구조입니다.

```python
from dataclasses import dataclass, field


@dataclass
class PermissionPipeline:
    mode: PermissionMode
    deny_rules: list[str] = field(default_factory=list)
    allow_rules: list[str] = field(default_factory=list)
    classifier: object = None  # yolo_classifier

    async def evaluate(self, tool_call: dict,
                       context: list[dict],
                       llm_call=None) -> PermissionResult:
        """7단계 deny-first 파이프라인.

        반환값이 담는 것은 '허용 여부'입니다. 앞의 should_prompt()가
        돌려주던 '프롬프트 필요 여부'와는 방향이 반대입니다.
        """
        tool_name = tool_call["name"]
        call_repr = f"{tool_name}({tool_call.get('arguments', {})})"

        # Stage 1: Mode Gate
        if self.mode == PermissionMode.PLAN:
            if tool_name not in READ_ONLY_TOOLS:
                return PermissionResult(False, "plan 모드", 1)
        if self.mode == PermissionMode.BYPASS:
            return PermissionResult(True, "bypass 모드", 1)

        # Stage 2: Deny Rules
        for pattern in self.deny_rules:
            if re.search(pattern, call_repr):
                return PermissionResult(False, f"deny: {pattern}", 2)

        # Stage 3: Allow Rules
        for pattern in self.allow_rules:
            if re.search(pattern, call_repr):
                return PermissionResult(True, f"allow: {pattern}", 3)

        # Stage 4: ML Classifier (auto 모드)
        if self.mode == PermissionMode.AUTO and self.classifier:
            result = await self.classifier(
                tool_name, tool_call.get("arguments", {}),
                context, llm_call,
            )
            if not result.is_risky:
                return PermissionResult(True, "분류기: safe", 4)

        # Stage 5: 모드별 자동 승인 판단
        if tool_name in READ_ONLY_TOOLS:
            return PermissionResult(True, "읽기 전용", 5)
        if self.mode == PermissionMode.DONT_ASK:
            if not is_high_risk(tool_name, tool_call.get("arguments", {})):
                return PermissionResult(True, "dontAsk 모드", 5)
        if self.mode == PermissionMode.ACCEPT_EDITS:
            if tool_name in {"Edit", "Write"}:
                return PermissionResult(True, "acceptEdits 모드", 5)

        # Stage 5 (continued): 사용자 프롬프트 필요
        return PermissionResult(False, "사용자 승인 필요", 5)


async def guarded_loop(
    task: str, tools: dict, llm_call,
    pipeline: PermissionPipeline,
    max_turns: int = 100,
):
    """퍼미션 파이프라인을 갖춘 에이전트 루프."""
    messages = [{"role": "user", "content": task}]

    for turn in range(max_turns):
        response = await llm_call(messages, tools=list(tools.keys()))

        if not response.tool_calls:
            return response.text

        for call in response.tool_calls:
            result = await pipeline.evaluate(
                call, messages, llm_call,
            )
            if result.allowed:
                output = await tools[call.name](**call.args)
                messages.append(tool_result(call.id, str(output)))
            else:
                # Stage 6-7: 거부 라우팅
                # 프로덕션에서는 여기서 사용자 프롬프트 UI를 호출합니다
                messages.append({
                    "role": "tool",
                    "tool_use_id": call.id,
                    "content": f"Permission denied: {result.reason}",
                })

    return "최대 턴 수 도달"
```

퍼미션 게이트가 없는 기본 루프와 비교하면 추가된 것은 한 가지뿐입니다. 도구 실행 전에 `pipeline.evaluate()`가 호출되어, 허용된 호출만 실행하고 거부된 호출은 denial routing으로 처리합니다.

| 이 코드 | 프로덕션 (Claude Code) |
|---------|----------------------|
| 동기적 평가 | 비동기 UI 통합 (타임아웃 포함) |
| 정규표현식 deny/allow | glob 패턴 + 정규표현식 + 우선순위 |
| 단일 분류기 호출 | 2단계 LLM 분류기 (게이트 포함) |
| 모든 모드 단일 함수 | 모드별 전용 핸들러 클래스 |
| 세션 내 캐싱 없음 | 동일 패턴 반복 시 캐싱 |
| pre-model 필터 없음 | `assembleToolPool()`의 사전 필터링 |

물론 차이는 큽니다. 특히 `assembleToolPool()`의 사전 필터가 이 코드에는 빠져 있습니다. 프로덕션에서는 Phase 1(사전 필터)과 Phase 2(사후 판단)가 함께 작동하지만, 핵심 아이디어는 동일합니다. 도구 실행 전에 deny-first 순서로 규칙을 평가하고, 거부는 모델에게 라우팅 시그널로 전달합니다.

---

## 한계와 열린 문제

### 분류기 경계의 0.4%

2단계 분류기의 오탐율 0.4%는 낮아 보이지만, 50턴 세션에서 턴당 평균 3개의 도구 호출이 발생한다면 150번의 판단 중 약 0.6번이 잘못됩니다. 대부분의 세션에서는 문제가 안 되지만, 긴 세션에서는 한두 번의 불필요한 중단이 발생할 수 있습니다.

### 퍼미션 피로

`default` 모드에서 사용자는 모든 쓰기 작업에 승인을 해야 합니다. 대규모 리팩터링에서 수십 번의 승인을 반복하면, 사람은 내용을 확인하지 않고 반사적으로 "yes"를 누르기 시작합니다. 이것이 **퍼미션 피로**입니다. `dontAsk`와 `auto` 모드는 이 문제를 해결하기 위해 존재하지만, 감독을 줄이는 것은 다른 위험을 수반합니다.

### 도구 수준 vs 프로세스 수준의 근본적 긴장

Claude Code의 도구 수준 퍼미션은 유연하지만, 이론적으로 모델이 `Bash` 도구를 통해 위험한 명령을 분류기가 인식하지 못하는 방식으로 구성할 가능성이 있습니다. Codex의 OS 샌드박스는 이 문제를 OS가 차단하므로 더 견고하지만, 정당한 작업(패키지 설치를 위한 네트워크 접근 등)도 함께 차단합니다. 어느 쪽도 에이전트 자율성과 안전성 사이의 근본적 긴장을 완전히 해소하지는 못합니다.

bubble 모드의 에스컬레이션 프로토콜을 여러 에이전트가 얽힌 환경으로 확장하는 일, MCP 서버마다 다른 신뢰 수준을 설정하는 일도 같은 긴장의 연장선에 있습니다. 분류기 오탐율 0.4%를 자동으로 측정하고 개선하는 퍼미션 평가 체계 역시 아직 열린 엔지니어링 문제입니다.

---

## 마치며

Claude Code에서 AI 판단 로직이 차지하는 비중은 1.6%에 불과하고, 나머지 98.4%는 결정론적 인프라입니다. 그 인프라를 뜯어보면 루프는 6단계, 컴팩션은 5단계, 그리고 퍼미션은 7단계로 쪼개져 있습니다. 공통점이 있습니다. 모두 **다단계 파이프라인**이라는 것입니다. 한 번의 큰 판단이 아니라, 여러 단계의 작은 판단이 순서대로 쌓여서 최종 결정에 도달합니다.

퍼미션 시스템은 그중에서도 흥미로운 위치에 있습니다. 컴팩션 파이프라인은 정보를 제거하는 결정이지만, 퍼미션 파이프라인은 행동을 허용하는 결정입니다. 에이전트가 실제 세계에 영향을 미치는 접점이 도구 실행이고, 그 접점을 제어하는 것이 퍼미션입니다. 그래서 98.4%의 인프라 중에서도 가장 먼저 설계되어야 하는 부분입니다.

지금까지 단일 에이전트의 내부를 살펴봤습니다. 루프, 컴팩션, 퍼미션 모두 하나의 에이전트가 하나의 작업을 처리하는 구조입니다. 하지만 프로덕션에서는 에이전트가 혼자 동작하지 않는 경우가 많습니다. 다음 글에서는 여러 에이전트가 협력할 때 어떤 새로운 문제가 생기는지, 즉 멀티에이전트 시스템의 설계를 살펴봅니다.

---

## 함께 보면 좋은 글

- [AI Agent의 구조: 모델, 도구, 루프가 만드는 자율적 시스템](/agent/what-is-ai-agent/)
- [AI Agent 워크플로우 패턴: 단순한 Chaining에서 동적 Orchestration까지](/agent/agent-workflow-patterns/)
- [AI Agent의 도구 설계: ACI 원칙부터 프로덕션 스키마까지](/agent/agent-tool-use/)
- [AI Agent 루프: 한 턴의 요청이 처리되는 6단계](/agent/agent-loop-anatomy/)
- [AI Agent의 컴팩션 파이프라인: 200K 토큰 윈도우를 지키는 다섯 단계](/agent/compaction-pipeline/)
- [AI Agent의 멀티에이전트 시스템: 여러 에이전트가 협력할 때 생기는 다섯 가지 문제](/agent/multi-agent-systems/)
- [AI Agent의 MCP: 에이전트가 외부 도구를 연결하는 표준 프로토콜](/agent/mcp-protocol/)

---

## 참고자료

- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [A Practical Guide to Building Agents (OpenAI)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [Introducing Codex (OpenAI)](https://openai.com/index/introducing-codex/)
- [Claude Code Documentation](https://code.claude.com/docs/en/overview)
