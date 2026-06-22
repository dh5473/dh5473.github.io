---
date: '2026-05-29'
title: 'AI Agent의 도구 설계: ACI 원칙부터 프로덕션 스키마까지'
category: 'AI Agent'
series: 'agent'
seriesOrder: 3
tags: ['Tool Use', 'AI Agent', 'ACI', 'Tool Design', 'Claude Code']
summary: 'Anthropic이 제안하는 ACI(Agent-Computer Interface) 설계 원칙과 도구 설계 5원칙. 네이밍, 스키마 설계, 에러 시그널, 멱등성까지 Claude Code의 실제 도구를 해부하며 프로덕션 수준의 도구 설계를 살펴봅니다.'
thumbnail: './thumbnail.png'
---

Claude Code에 "deprecated된 모듈을 import하는 파일을 전부 찾아줘"라고 요청하면, `Bash`로 `grep -r`을 돌릴 수도 있고, `Glob`으로 파일 목록을 먼저 뽑은 뒤 `Read`로 하나씩 읽을 수도 있습니다. 하지만 거의 항상 `Grep` 도구를 선택합니다. 왜 그럴까요?

정답은 도구의 이름, 설명, 파라미터 스키마에 있습니다. `Grep`이라는 이름은 "텍스트 패턴 검색"이라는 의도를 정확히 전달하고, 도구 설명에는 언제 이 도구를 써야 하는지가 명시되어 있습니다. 모델이 올바른 도구를 "알아서" 고르는 것처럼 보이지만, 실제로는 도구 설계가 그 선택을 유도한 것입니다.

[이전 글](/agent/agent-workflow-patterns/)에서 다섯 가지 워크플로우 패턴을 살펴봤는데, 어떤 패턴을 쓰든 결국 도구 설계가 잘못되면 성능이 나오지 않습니다. 이 글에서는 Anthropic이 제안하는 **ACI(Agent-Computer Interface)** 설계 원칙과, 프로덕션 에이전트의 실제 도구 스키마를 분석합니다.

---

## ACI, 에이전트의 사용자 인터페이스

### HCI에서 ACI로

사람이 소프트웨어를 쓸 때 UI가 중요한 것처럼, 모델이 도구를 쓸 때도 인터페이스가 중요합니다. Anthropic은 "Building Effective Agents"에서 이 개념에 이름을 붙였습니다.

> "Think about how much effort goes into human-computer interfaces (HCI), and plan to invest just as much effort in creating good agent-computer interfaces (ACI)."

**ACI(Agent-Computer Interface)**는 모델이 도구와 상호작용하는 인터페이스입니다. HCI가 사람을 위한 버튼, 메뉴, 레이아웃을 설계하듯, ACI는 모델을 위한 도구 이름, 설명, 파라미터 스키마, 에러 메시지를 설계합니다.

Anthropic은 에이전트 설계의 세 가지 원칙을 제시하는데, 세 번째가 ACI에 직접 해당합니다. "철저한 문서화와 테스트를 통해 ACI를 신중하게 설계하라(Carefully craft your agent-computer interface through thorough tool documentation and testing)." 나머지 두 원칙(단순성, 투명성)도 도구 설계에 자연스럽게 적용됩니다. 도구의 수와 복잡도를 최소화하고, 모델이 자신의 행동을 명시적으로 계획할 수 있도록 설계하는 것입니다.

핵심 설계 휴리스틱은 한 문장으로 요약됩니다. **"Put yourself in the model's shoes."** 모델의 입장에서 생각하라.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ ACI 자가 점검</strong><br>
  도구를 만들 때 이 세 가지 질문을 던져보라.<br>
  1. 이 도구 이름만 보고 어떤 기능인지 알 수 있는가?<br>
  2. 설명만 읽고 언제 써야 하는지 판단할 수 있는가?<br>
  3. 에러 메시지만 보고 다음에 무엇을 해야 하는지 결정할 수 있는가?
</div>

### 프로덕션에서의 ACI

Claude Code 블로그 "Seeing Like an Agent"에서 공개한 `AskUserQuestion` 도구의 진화 과정이 이 원칙을 잘 보여줍니다.

- **1차 시도**: 기존 `ExitPlanTool`에 질문 파라미터를 추가. 결과: 모델이 도구의 원래 용도(플래닝 종료)와 새 용도(질문)를 혼동
- **2차 시도**: 마크다운 포매팅 지시문을 추가. 결과: 모델이 포매팅 규칙을 불안정하게 따름
- **3차 시도**: 전용 도구를 분리하고, 구조화된 옵션과 컨텍스트를 파라미터로 설계. 결과: 성공

세 번의 반복이 필요했습니다. HCI에서 UI를 사용자 테스트로 개선하듯, ACI에서 도구를 모델 테스트로 개선하는 것입니다. Claude Code 블로그에서는 이를 이렇게 표현합니다. "The bar to add a new tool is high, because this gives the model one more option to think about." 도구를 추가할수록 모델이 고려해야 할 선택지가 늘어나기 때문에, 높은 기준을 적용해야 하는 것입니다.

OpenAI도 같은 결론에 도달합니다. "A Practical Guide to Building Agents"에서 "문제는 도구의 수가 아니라 유사성과 중복"이라고 말합니다. 15개 이상의 명확히 구분되는 도구는 잘 동작하지만, 10개 미만이라도 기능이 겹치면 모델이 혼동합니다. ACI의 핵심은 도구의 수가 아니라, 각 도구의 목적이 얼마나 명확한가입니다.

---

## 도구 설계 5원칙

Anthropic은 "Writing Effective Tools for AI Agents"에서 다섯 가지 설계 원칙을 제시합니다. 이것은 추상적인 가이드라인이 아닙니다. Claude Code와 SWE-bench 같은 평가 환경에서 도구를 반복 개선하면서 추출한 실전 원칙입니다.

### 원칙 1. 적을수록 좋다

Anthropic의 첫 번째 원칙은 직관에 반합니다.

> "More tools don't always lead to better outcomes."

기존 API 엔드포인트를 그대로 도구로 감싸는 것은 흔한 실수입니다. 연락처 관리 API가 `list_contacts`, `search_contacts`, `filter_contacts_by_tag`, `get_recent_contacts` 네 개의 엔드포인트를 가지고 있다면, 도구도 네 개를 만들고 싶은 유혹이 있습니다. 하지만 이 네 도구는 기능이 겹칩니다. 모델은 "최근 연락처를 찾으려면 `get_recent_contacts`를 써야 하나, `list_contacts`에 정렬 옵션을 줘야 하나?"를 매번 고민하게 됩니다.

```python
# ❌ Before: 4개의 겹치는 도구
tools = [
    {"name": "list_contacts", "description": "List all contacts"},
    {"name": "search_contacts", "description": "Search contacts by name"},
    {"name": "filter_contacts_by_tag", "description": "Filter by tag"},
    {"name": "get_recent_contacts", "description": "Get recent contacts"},
]

# ✅ After: 1개의 통합 도구
tools = [{
    "name": "search_contacts",
    "description": "Search contacts. Returns all when no query given.",
    "parameters": {
        "query": {"type": "string", "default": ""},
        "tag": {"type": "string"},
        "sort_by": {"type": "string", "enum": ["name", "recent"]},
        "limit": {"type": "integer", "default": 50},
    }
}]
```

`search_contacts` 하나가 네 도구의 기능을 모두 포함합니다. 쿼리 없이 호출하면 전체 목록, `tag`를 주면 필터링, `sort_by: "recent"`를 주면 최근 순 정렬. 모델의 선택지가 4개에서 1개로 줄어들면서, 잘못된 도구를 고를 확률 자체가 사라지게 됩니다.

Claude Code는 이 원칙을 철저히 따릅니다. 상시 활성화되는 도구는 19개이고, 기능 플래그와 사용자 유형에 따라 최대 35개가 추가로 활성화되어 총 54개까지 늘어날 수 있습니다. 하지만 Claude Code 블로그에서는 "roughly 20 tools"라고 표현하며, 핵심 도구 세트를 작게 유지하는 데 집중하고 있음을 강조합니다.

### 원칙 2. 네이밍과 네임스페이싱

도구 이름은 모델이 가장 먼저 읽는 정보입니다. 이름만으로 어떤 도구인지 판단이 안 되면, 모델은 설명까지 읽어야 하고, 그만큼 추론에 쓸 토큰이 줄어들게 됩니다.

Anthropic은 관련 도구를 접두사로 그룹화하는 **네임스페이싱**을 권장합니다. `asana_search`, `asana_create`, `jira_search`, `jira_create`처럼 접두사만으로 어떤 시스템의 도구인지 알 수 있게 하는 것입니다. Anthropic에 따르면 "접두사/접미사 기반 네임스페이싱이 평가 성능에 무시할 수 없는 영향을 미친다"고 합니다.

Claude Code의 내장 도구는 다른 전략을 씁니다. 단일 시스템의 도구이므로 네임스페이싱 대신 **동사 단일어** 패턴을 사용합니다.

```
Read, Write, Edit, Grep, Glob, Bash
```

각 이름이 하나의 행동을 즉시 전달합니다. `Read`와 `Grep`은 둘 다 파일 내용에 접근하지만, 이름만으로 차이가 명확합니다. "특정 파일의 내용을 읽는 것"과 "패턴으로 검색하는 것". 이 명확한 구분이 글 서두에서 본 Claude Code의 도구 선택 행동을 만들어내는 셈입니다.

```python
# ❌ 모호한 네이밍
tools = ["execute", "run", "process"]

# ✅ 의도가 명확한 네이밍
tools = ["run_sql_query", "execute_bash_command", "process_payment"]
```

### 원칙 3. 설명은 프롬프트다

도구 설명은 단순한 문서가 아닙니다. 모델에게 보내지는 프롬프트의 일부입니다. Anthropic은 이렇게 표현합니다.

> "Describe as you would to a new hire on your team."

팀에 새로 합류한 동료에게 하듯 설명하라. 이 도구가 무엇을 하는지, 언제 써야 하는지, 비슷한 도구와 어떻게 다른지를 명시적으로 알려줘야 합니다.

Anthropic은 SWE-bench Verified에서 도구 설명을 다듬는 것만으로 에러율을 크게 줄이고 작업 완료율을 높였다고 보고합니다. 코드를 한 줄도 바꾸지 않고, 설명만 개선했을 때의 결과입니다.

Claude Code의 `Edit` 도구 설명을 보면 이 원칙이 어떻게 적용되는지 알 수 있습니다.

```python
# ❌ 최소한의 설명
{
    "name": "edit_file",
    "description": "Edit a file"
}

# ✅ 프로덕션 수준의 설명 (Claude Code Edit 도구의 접근 방식)
{
    "name": "Edit",
    "description": (
        "Performs exact string replacements in files. "
        "You must use Read first before editing. "
        "The edit will FAIL if old_string is not unique in the file. "
        "ALWAYS prefer editing existing files to creating new ones. "
        "Only use emojis if the user explicitly requests it."
    )
}
```

아래 설명에는 "무엇을 하는가"(문자열 치환), "전제 조건"(먼저 Read), "실패 조건"(old_string 고유하지 않으면), "행동 지침"(새 파일 생성보다 기존 파일 편집 선호)이 모두 포함되어 있습니다. 결국 도구 설명을 작성하는 것은 프롬프트 엔지니어링과 본질적으로 같은 작업인 셈입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  Anthropic은 "도구에도 프롬프트 엔지니어링만큼의 주의를 기울여라"고 말합니다. 도구 설명의 품질은 시스템 프롬프트의 품질만큼 에이전트 성능에 직접적인 영향을 미칩니다.
</div>

### 원칙 4. 의미 있는 컨텍스트, 최소한의 토큰

도구가 반환하는 값은 모델의 컨텍스트 윈도우에 그대로 들어갑니다. 반환값이 클수록 모델이 추론에 쓸 수 있는 공간이 줄어들게 됩니다.

Anthropic은 반환값 설계에서 두 가지를 강조합니다. 첫째, **의미 있는 컨텍스트를 반환하라**. UUID 같은 내부 식별자 대신, 사람과 모델이 모두 이해할 수 있는 이름을 포함해야 합니다.

```python
# ❌ 모델이 활용하기 어려운 반환값
{"id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "type": 3}

# ✅ 모델이 추론에 활용할 수 있는 반환값
{"id": "user_123", "name": "Alice Kim", "type": "admin"}
```

둘째, **토큰 효율을 관리하라**. Anthropic은 `ResponseFormat` 개념을 소개하는데, 같은 데이터를 DETAILED 포맷(206 토큰)과 CONCISE 포맷(72 토큰)으로 반환할 수 있게 하는 것입니다. 토큰 소비가 약 1/3로 줄어듭니다. 상황에 따라 필요한 수준의 상세도를 선택하는 접근입니다.

Claude Code는 도구 반환값에 **25,000 토큰 상한**을 적용합니다. `Bash` 도구의 출력이 이 한도를 넘으면 자동으로 잘라내고, 잘렸다는 신호를 모델에게 전달합니다. 무한한 출력을 그대로 컨텍스트에 밀어 넣는 대신, 모델이 판단할 수 있을 만큼만 보여주는 설계입니다.

```python
def truncate_tool_result(result: str, max_tokens: int = 25000) -> dict:
    if len(result) <= max_tokens:
        return {"output": result, "truncated": False}
    return {
        "output": result[:max_tokens],
        "truncated": True,
        "total_length": len(result),
        "suggestion": "Output truncated. Use a more specific query or grep for relevant sections."
    }
```

`truncated: True`와 `suggestion` 필드가 핵심입니다. 단순히 자르는 것이 아니라, "잘렸으니 더 구체적인 쿼리를 써라"고 모델에게 다음 행동을 안내하는 것입니다.

### 원칙 5. 에러 시그널과 Poka-yoke

도구 실행이 실패했을 때 모델이 받는 에러 메시지는, 다음 행동을 결정하는 유일한 정보입니다. "Error occurred"만 반환하면 모델은 같은 실수를 반복할 수밖에 없습니다.

그래서 Anthropic은 **실행 가능한(actionable) 에러 메시지**를 강조합니다. 무엇이 잘못되었는지, 어떻게 고쳐야 하는지를 에러 자체에 포함시켜야 합니다.

```python
# ❌ 실행 불가능한 에러
{"error": "Invalid parameter"}

# ✅ 실행 가능한 에러
{"error": "query parameter is required. Example: search_contacts(query='Alice'). To list all, use query=''."}
```

더 근본적인 접근은 **Poka-yoke**(실수 방지 설계)입니다. 일본 제조업에서 온 개념으로, 애초에 잘못된 사용이 불가능하도록 도구를 설계하는 것입니다.

Anthropic이 SWE-bench에서 발견한 사례가 대표적입니다. 파일 편집 도구가 상대 경로를 허용했을 때, 모델이 작업 디렉터리를 이동한 후 잘못된 경로를 참조하는 버그가 반복적으로 발생했습니다. 해결책은 단순했습니다. **절대 경로만 허용하도록 변경**한 것입니다. Anthropic에 따르면 이 변경 후 "the model used this method flawlessly", 모델이 완벽하게 사용했다고 합니다.

```python
def validate_file_path(path: str) -> str:
    if not os.path.isabs(path):
        raise ToolError(
            f"Relative path '{path}' is not allowed. "
            f"Use absolute path instead: {os.path.abspath(path)}"
        )
    return path
```

에러 메시지에 올바른 절대 경로를 포함시키면, 모델은 즉시 수정된 경로로 재시도할 수 있습니다. 실수를 방지하고, 실수가 발생해도 복구 경로를 제공하는 이중 안전장치인 셈입니다.

---

## 멱등성과 재시도 안전성

에이전트는 재시도합니다. 네트워크 오류, 타임아웃, 모델의 판단 변경 등으로 같은 도구가 두 번 호출될 수 있습니다. 이때 도구가 **멱등(idempotent)**하지 않으면 문제가 생깁니다.

멱등성이란, 같은 입력으로 여러 번 호출해도 결과가 동일한 성질입니다. 도구를 세 가지로 분류할 수 있습니다.

- **자연적으로 멱등**: 읽기 전용 도구 (파일 읽기, 검색, 조회)
- **설계에 의해 멱등**: 덮어쓰기 방식의 쓰기 도구
- **비멱등**: 추가(append), 증분(increment), 전송(send) 연산

Claude Code의 도구 설계에서 이 구분이 선명하게 드러납니다. `Write` 도구는 파일 전체를 덮어씁니다. 같은 내용으로 두 번 호출해도 결과는 동일합니다. `Edit` 도구는 diff 기반으로 동작하는데, 매칭되는 문자열을 찾아 교체합니다. 이미 교체된 상태에서 다시 호출하면 원본 문자열을 찾지 못해 "no changes made"를 반환하게 됩니다. 파일이 중복 수정되는 것을 구조적으로 방지하는 설계입니다.

직접 도구를 만들 때도 같은 원칙을 적용할 수 있습니다.

```python
# ✅ 멱등: upsert 방식 (같은 key로 여러 번 호출해도 안전)
async def set_config(key: str, value: str) -> dict:
    db.configs.update_one(
        {"key": key},
        {"$set": {"value": value}},
        upsert=True
    )
    return {"status": "ok", "key": key, "value": value}

# ⚠️ 비멱등: increment (재시도하면 값이 계속 증가)
async def increment_counter(name: str) -> dict:
    result = db.counters.find_one_and_update(
        {"name": name},
        {"$inc": {"count": 1}},
        return_document=True
    )
    return {"count": result["count"]}
```

`set_config`는 몇 번을 호출해도 마지막 값이 유지됩니다. 반면 `increment_counter`는 호출할 때마다 값이 올라갑니다. 에이전트 환경에서 비멱등 도구는 확인 게이트(human-in-the-loop)를 필수로 두거나, 멱등한 대안(`set_counter(name, value)`)으로 교체하는 것이 안전합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  append, increment, send 류의 비멱등 도구는 에이전트 환경에서 반드시 확인 게이트를 두거나, 멱등한 대안(upsert, set)으로 교체해야 합니다.
</div>

---

## 프로덕션 도구 설계 비교

그렇다면 프로덕션에서는 이 원칙들이 어떻게 다르게 적용될까요?

| 관점 | Claude Code | Codex |
|------|-------------|-------|
| 도구 수 | ~20 core (최대 54) | 최소한의 도구 세트 |
| 네이밍 | 동사 단일어 (Read, Write, Grep) | API 스타일 (shell, apply_patch) |
| 설명 방식 | 상세한 when/how/expect 포맷 | 간결한 기능 설명 |
| 반환값 제어 | 25,000 토큰 상한, 동적 truncation | 구조화된 결과 포맷 |
| 에러 처리 | actionable 에러 + 대안 제시 | exit code + stderr 전달 |
| 멱등성 | Write(덮어쓰기), Edit(diff 기반) | apply_patch(diff 기반) |
| 안전 분류 | safe(읽기) vs exclusive(쓰기) 분리 | OS 샌드박스 내 전체 실행 |

두 가지 흥미로운 관찰이 있습니다.

첫째, 파일 편집에서 두 시스템 모두 **diff 기반 접근**을 채택합니다. 줄 번호로 삽입하는 방식은 멱등성이 보장되지 않기 때문입니다. 줄 번호는 편집 후 바뀌므로, 같은 호출을 반복하면 엉뚱한 위치에 텍스트가 삽입됩니다. diff 기반이면 내용 자체를 매칭하므로 이 문제가 없습니다.

둘째, 안전성 확보의 철학이 다릅니다. Claude Code는 **도구 수준에서 분류**([이전 글](/agent/agent-workflow-patterns/)에서 다룬 `partitionToolCalls()`)하여, 읽기 전용 도구는 병렬 실행하고 쓰기 도구는 순차 실행합니다. Codex는 **환경 수준에서 격리**하여, 모든 도구를 OS 네이티브 샌드박스(macOS Seatbelt / Linux bwrap+seccomp) 안에서 실행합니다. 기본적으로 네트워크가 차단되고 파일 쓰기가 작업 디렉터리로 제한되므로, 개별 도구의 안전성을 분류할 필요가 줄어드는 셈입니다. 같은 목표를 서로 다른 레이어에서 해결하는 것입니다.

---

## 5원칙을 적용한 코드 검색 도구

지금까지 다룬 원칙을 하나의 도구에 모두 적용해 보겠습니다. 에이전트가 코드베이스에서 텍스트 패턴을 검색하는 도구입니다.

```python
import re
from pathlib import Path

# 도구 정의: 5원칙이 모두 반영된 스키마
SEARCH_CODEBASE_TOOL = {
    # 원칙 2: 의도가 명확한 이름
    "name": "search_codebase",
    # 원칙 3: 설명은 프롬프트다
    "description": (
        "Search for text patterns across project files. "
        "Use when finding function definitions, imports, or specific strings. "
        "Returns matching lines with file paths and line numbers. "
        "For reading a known file, use read_file instead."
    ),
    # 원칙 1: 필요한 파라미터만 (search + filter + limit)
    "parameters": {
        "pattern": {"type": "string", "description": "Regex pattern to search"},
        "file_glob": {"type": "string", "default": "*.py",
                      "description": "File pattern to limit search scope"},
        "max_results": {"type": "integer", "default": 20,
                        "description": "Maximum matches to return"},
    }
}


async def execute_search_codebase(
    pattern: str,
    file_glob: str = "*.py",
    max_results: int = 20,
    project_root: str = "/project"
) -> dict:
    # 원칙 5: poka-yoke (절대 경로 강제)
    root = Path(project_root).resolve()

    try:
        regex = re.compile(pattern)
    except re.error as e:
        # 원칙 5: actionable 에러 (올바른 사용법 제시)
        return {
            "error": f"Invalid regex: {e}. "
                     f"Examples: 'def search', 'import.*os', 'TODO|FIXME'"
        }

    matches = []
    for path in root.rglob(file_glob):
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors="ignore")
            for i, line in enumerate(text.splitlines(), 1):
                if regex.search(line):
                    matches.append({
                        "file": str(path.relative_to(root)),
                        "line": i,
                        "content": line.strip()[:200],
                    })
        except (PermissionError, OSError):
            continue

    # 원칙 4: 토큰 효율 (truncation + 안내)
    if len(matches) > max_results:
        return {
            "matches": matches[:max_results],
            "truncated": True,
            "total_found": len(matches),
            "suggestion": (
                f"Found {len(matches)} matches, showing {max_results}. "
                f"Narrow with a specific file_glob or pattern."
            ),
        }

    return {"matches": matches, "truncated": False, "total_found": len(matches)}
```

하나의 도구에 다섯 가지 원칙이 어떻게 녹아드는지 정리하면 이렇습니다.

| 원칙 | 적용 |
|------|------|
| 1. 올바른 도구 | `search_codebase` 하나로 텍스트/정규식 검색 통합. `read_file`과는 설명에서 구분 |
| 2. 네이밍 | `search_codebase`: 행동(search) + 대상(codebase)이 즉시 전달 |
| 3. 설명 = 프롬프트 | 용도, 사용 시점, 대안 도구까지 명시 |
| 4. 반환값 효율 | `max_results`로 출력 제한, 잘렸을 때 `suggestion` 제공 |
| 5. 에러/Poka-yoke | 절대 경로 강제, regex 에러 시 올바른 예시 제시 |

이 도구는 자연적으로 멱등합니다. 읽기 전용이므로 몇 번을 호출해도 코드베이스에 영향을 주지 않습니다.

---

## 한계와 열린 문제

### 도구 폭발 문제

에이전트가 MCP를 통해 외부 서비스를 연결하기 시작하면, 도구 수가 급격히 늘어납니다. Anthropic의 예시를 보면, GitHub, Slack, Sentry, Grafana, Splunk 등 5개 MCP 서버를 연결했을 때 58개 도구의 정의만으로 약 55,000 토큰을 소비합니다. 대화가 시작되기도 전에 컨텍스트의 상당 부분이 도구 설명으로 채워지는 셈입니다. Anthropic의 Tool Search 기능은 도구 정의를 동적으로 로드하는 방식으로 이 문제에 접근합니다. MCP와 Tool Search의 구조는 [MCP 글](/agent/mcp-protocol/)에서 다룹니다.

### 설명과 평가의 순환

도구 설명이 프롬프트라면, 프롬프트 엔지니어링과 같은 반복 개선 과정이 필요합니다. 하지만 도구 선택을 평가하는 것은 텍스트 생성을 평가하는 것보다 어렵습니다. "모델이 올바른 도구를 선택했는가?"를 자동으로 판정하려면 별도의 평가 파이프라인이 필요합니다. Anthropic이 제안하는 3단계 개발 프로세스(프로토타입 → 평가 → 에이전트와 협업)는 이 문제에 대한 체계적 접근입니다.

### 비멱등 연산의 현실

이메일 전송, 결제 처리, 외부 API 호출 같은 연산은 본질적으로 비멱등합니다. "취소하고 다시 보내기"가 불가능한 작업에서 에이전트의 재시도는 실제 피해를 만들 수 있습니다. Claude Code가 이런 도구에 확인 게이트(사용자 승인)를 필수로 두는 것은 기술적 한계에 대한 현실적 해법이며, 이 판단 과정의 내부는 [퍼미션 시스템 글](/agent/agent-permission-safety/)에서 다룹니다.

---

## 마치며

도구 설계는 API 설계나 UX 설계에 가깝습니다. 모델이 사용자이고, 도구 스키마가 인터페이스입니다. 잘 설계된 도구는 모델의 행동을 자연스럽게 올바른 방향으로 유도하고, 잘못 설계된 도구는 어떤 프롬프트 엔지니어링으로도 보완하기 어렵습니다. 결국 ACI에 투자하는 시간이 프롬프트를 다듬는 시간보다 훨씬 높은 수익을 가져다 줍니다.

다음 글에서는 도구가 반환한 결과가 쌓이는 공간, 즉 컨텍스트를 다룹니다. 유한한 토큰 윈도우 안에서 모델이 올바른 정보를 올바른 시점에 볼 수 있도록 설계하는 컨텍스트 엔지니어링을 살펴보겠습니다.

## 참고자료

- [Writing Effective Tools for AI Agents (Anthropic)](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Introducing Advanced Tool Use (Anthropic)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Seeing Like an Agent (Claude Code Blog)](https://claude.com/blog/seeing-like-an-agent)
- [Dive into Claude Code: The Design Space of AI Agent Systems (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228)
- [A Practical Guide to Building Agents (OpenAI)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
