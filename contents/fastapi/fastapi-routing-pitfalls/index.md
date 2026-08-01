---
date: '2026-04-07'
title: 'FastAPI 422? 라우팅 순서부터 확인하기'
category: 'Troubleshooting'
tags: ['FastAPI', 'Routing', 'Path Parameter', 'Starlette', 'Python']
summary: 'FastAPI는 라우트를 위에서 아래로 매칭합니다. path parameter가 고정 경로를 삼키는 문제, {id}와 {id:int}의 결정적 차이, 404·405·422 에러의 원인까지 실전 라우팅 함정을 총정리합니다.'
thumbnail: './fastapi-logo.png'
---

FastAPI로 API를 만들다 보면 분명 잘 정의한 엔드포인트인데 이상한 에러가 뜨는 경우가 있습니다. `422 Unprocessable Entity`, `405 Method Not Allowed` 같은 에러가 뜨는데, 코드를 아무리 들여다봐도 원인을 모르겠는 상황. 경험상 이런 경우 십중팔구 **라우팅 순서** 문제입니다.

FastAPI(정확히는 내부의 Starlette)는 라우트를 **정의된 순서대로** 매칭합니다. 이 단순한 규칙 하나를 모르면 디버깅에 상당한 시간을 쏟게 됩니다. 이번 글에서는 실무에서 자주 마주치는 라우팅 함정들을 정리하고, 왜 그런 문제가 발생하는지 내부 동작까지 파고들어 보겠습니다.

## FastAPI의 경로 매칭은 순서가 전부다

FastAPI는 내부적으로 Starlette의 `Router` 클래스를 사용합니다. 요청이 들어오면 Router는 등록된 라우트를 **위에서 아래로 순회**하면서 첫 번째로 매칭되는 라우트에 요청을 전달합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 212" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="GET /users/me 요청이 위에 정의된 /users/{user_id} 라우트에 먼저 매칭되어 멈추고, 아래의 /users/me 라우트에는 도달하지 못하는 순서 스캔">
<style>
.rt-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.rt-req { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.rt-hit { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.8; }
.rt-miss { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.2; stroke-dasharray: 5 3; }
.rt-rt { font-size: 15px; fill: var(--text, #1c1917); }
.rt-path { font-size: 15px; font-weight: 600; fill: var(--text, #1c1917); }
.rt-dim { font-size: 15px; fill: var(--text-muted, #78716c); }
.rt-badge { font-size: 14px; font-weight: 600; fill: var(--primary, #0d9488); }
.rt-bdim { font-size: 14px; fill: var(--text-muted, #78716c); }
.rt-edge { stroke: var(--text-muted, #78716c); stroke-width: 1.4; fill: none; }
</style>
<defs>
<marker id="rtArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #78716c)"/></marker>
</defs>
<text class="rt-title" x="200" y="20" text-anchor="middle">위에서 아래로, 첫 매칭에서 멈춤</text>
<rect class="rt-req" x="60" y="34" width="280" height="38" rx="8"/>
<text class="rt-rt" x="200" y="58" text-anchor="middle">GET /users/me</text>
<path class="rt-edge" d="M200,72 L200,92" marker-end="url(#rtArrow)"/>
<rect class="rt-hit" x="8" y="96" width="384" height="46" rx="8"/>
<text class="rt-path" x="20" y="124" text-anchor="start">/users/{user_id}</text>
<text class="rt-badge" x="384" y="124" text-anchor="end">여기서 중단</text>
<rect class="rt-miss" x="8" y="152" width="384" height="46" rx="8"/>
<text class="rt-dim" x="20" y="180" text-anchor="start">/users/me</text>
<text class="rt-bdim" x="384" y="180" text-anchor="end">도달 못함</text>
</svg>
</div>

Django나 Flask를 사용해본 개발자라면 익숙한 개념이겠지만, FastAPI에서는 path parameter의 타입 힌트가 함수 시그니처에 있기 때문에 "타입이 안 맞으면 자동으로 다음 라우트로 넘어가겠지"라는 착각을 하기 쉽습니다. 결론부터 말하면, **넘어가지 않습니다.**

## Path Parameter가 고정 경로를 삼키는 문제

가장 흔하게 마주치는 함정입니다. 아래 코드를 봅시다.

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/users/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}

@app.get("/users/me")
async def get_current_user():
    return {"user": "current_user"}
```

`GET /users/me`를 호출하면 어떻게 될까요? 직관적으로는 `get_current_user`가 호출될 것 같지만, 실제로는 `get_user`가 먼저 매칭됩니다.

```bash
$ curl http://localhost:8000/users/me

{
  "detail": [
    {
      "type": "int_parsing",
      "loc": ["path", "user_id"],
      "msg": "Input should be a valid integer, unable to parse string as an integer",
      "input": "me"
    }
  ]
}
```

422 에러가 발생합니다. `"me"`라는 문자열을 `int`로 파싱하지 못해서 발생한 에러인데, 이게 대체 왜 일어나는 걸까요?

### 원인: Starlette의 2단계 매칭

핵심은 FastAPI의 라우트 매칭이 **두 단계**로 나뉜다는 점입니다.

| 단계 | 담당 | 동작 | 실패 시 |
|------|------|------|---------|
| **1단계** | Starlette | 경로 패턴의 **정규식** 매칭 | 다음 라우트로 이동 |
| **2단계** | FastAPI (Pydantic) | 함수 시그니처의 **타입 검증** | 422 에러 반환 |

`/users/{user_id}`에서 `{user_id}`는 별도 타입 지정이 없으면 Starlette 레벨에서 `[^/]+` 정규식으로 컴파일됩니다. 이 정규식은 슬래시를 제외한 **모든 문자열**과 매칭됩니다. 즉, `"me"`든 `"count"`든 `"abc"`든 전부 매칭이 됩니다.

1단계에서 매칭이 성공하면 Starlette는 해당 라우트를 **확정**합니다. 이후 2단계에서 FastAPI가 `user_id: int` 타입 힌트를 보고 `"me"`를 정수로 변환하려다 실패하면, 다른 라우트를 시도하는 게 아니라 바로 422 에러를 반환합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 316" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="GET /users/me 요청이 1단계 Starlette 정규식 매칭을 통과해 라우트가 확정된 뒤, 2단계 Pydantic 타입 검증에서 실패해 422를 반환하는 흐름. 1단계로 되돌아가 다른 라우트를 재시도하는 경로는 없음">
<style>
.r2-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.r2-req { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.r2-ok { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.6; }
.r2-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.6; }
.r2-rt { font-size: 15px; fill: var(--text, #1c1917); }
.r2-h { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.r2-s { font-size: 14px; fill: var(--text-muted, #78716c); }
.r2-dt { font-size: 16px; font-weight: 700; fill: var(--text-danger, #dc2626); }
.r2-note { font-size: 14px; fill: var(--text-muted, #78716c); }
.r2-x { font-size: 14px; font-weight: 600; fill: var(--text-danger, #dc2626); }
.r2-edge { stroke: var(--text-muted, #78716c); stroke-width: 1.4; fill: none; }
.r2-back { stroke: var(--text-muted, #78716c); stroke-width: 1.4; fill: none; stroke-dasharray: 5 3; }
.r2-cross { stroke: var(--text-danger, #dc2626); stroke-width: 2; }
</style>
<defs>
<marker id="r2Arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #78716c)"/></marker>
<marker id="r2Back" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #78716c)"/></marker>
</defs>
<text class="r2-title" x="200" y="20" text-anchor="middle">매칭과 검증은 다른 단계</text>
<rect class="r2-req" x="48" y="34" width="180" height="36" rx="8"/>
<text class="r2-rt" x="138" y="57" text-anchor="middle">GET /users/me</text>
<path class="r2-edge" d="M138,70 L138,90" marker-end="url(#r2Arrow)"/>
<rect class="r2-ok" x="8" y="94" width="260" height="54" rx="8"/>
<text class="r2-h" x="138" y="118" text-anchor="middle">1단계 · Starlette 정규식</text>
<text class="r2-s" x="138" y="138" text-anchor="middle">[^/]+ 가 me 와 매칭</text>
<path class="r2-edge" d="M138,148 L138,176" marker-end="url(#r2Arrow)"/>
<text class="r2-note" x="150" y="166" text-anchor="start">라우트 확정</text>
<rect class="r2-bad" x="8" y="180" width="260" height="54" rx="8"/>
<text class="r2-h" x="138" y="204" text-anchor="middle">2단계 · Pydantic 검증</text>
<text class="r2-s" x="138" y="224" text-anchor="middle">me 를 int 로 변환 실패</text>
<path class="r2-edge" d="M138,234 L138,258" marker-end="url(#r2Arrow)"/>
<rect class="r2-bad" x="48" y="262" width="180" height="40" rx="8"/>
<text class="r2-dt" x="138" y="288" text-anchor="middle">422 반환</text>
<text class="r2-x" x="306" y="108" text-anchor="middle">재시도 없음</text>
<path class="r2-back" d="M306,240 L306,122" marker-end="url(#r2Back)"/>
<path class="r2-cross" d="M298,173 L314,189"/>
<path class="r2-cross" d="M314,173 L298,189"/>
</svg>
</div>

:::warning

**주의**

함수 시그니처의 타입 힌트(`user_id: int`)는 **라우트 매칭에 영향을 주지 않습니다**. 매칭은 Starlette의 정규식이 담당하고, 타입 힌트는 매칭 이후 검증에만 사용됩니다.

:::

### 해결: 고정 경로를 먼저 정의한다

해결 방법은 간단합니다. 구체적인 고정 경로를 path parameter 경로보다 **먼저** 정의하면 됩니다.

```python
# ✅ 고정 경로를 먼저 정의
@app.get("/users/me")
async def get_current_user():
    return {"user": "current_user"}

@app.get("/users/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}
```

이제 `GET /users/me`가 먼저 매칭되고, `GET /users/123`은 그 다음 라우트에서 정상적으로 처리됩니다.

:::summary

**원칙**

FastAPI 라우트 정의 순서는 **"구체적 → 일반적"**으로 배치합니다. 고정 문자열 경로(`/users/me`, `/users/count`)를 항상 path parameter 경로(`/users/{user_id}`)보다 위에 둡니다.

:::

## `{id}` vs `{id:int}`, 결정적 차이

사실 "순서를 바꾸는 것" 말고도 다른 해결책이 있습니다. Starlette가 지원하는 **경로 컨버터(Path Convertor)**를 사용하는 방법입니다.

```python
# 방법 1: 기본값인 str 컨버터 (정규식: [^/]+)
@app.get("/users/{user_id}")
async def get_user(user_id: int):  # 타입 힌트는 Pydantic 검증용
    ...

# 방법 2: int 컨버터 지정 (정규식: [0-9]+)
@app.get("/users/{user_id:int}")
async def get_user(user_id: int):
    ...
```

이 둘은 비슷해 보이지만 동작이 완전히 다릅니다.

| | `{user_id}` + `user_id: int` | `{user_id:int}` |
|---|---|---|
| **정규식** | `[^/]+` (모든 문자열) | `[0-9]+` (숫자만) |
| **매칭 단계** | Starlette에서 매칭 → Pydantic에서 검증 | Starlette에서 정규식으로 필터링 |
| **`/users/me` 요청** | 매칭됨 → 422 에러 | 매칭 안 됨 → 다음 라우트로 이동 |
| **Fallthrough** | 불가능 | 가능 |

`{user_id:int}`를 사용하면 Starlette의 정규식이 `[0-9]+`로 컴파일되기 때문에 `"me"` 같은 문자열은 아예 매칭되지 않습니다. 매칭이 안 되면 자연스럽게 다음 라우트로 넘어갑니다. 이 경우에는 라우트 순서가 상관없게 됩니다.

```python
# ✅ 순서와 무관하게 동작
@app.get("/users/{user_id:int}")
async def get_user(user_id: int):
    return {"user_id": user_id}

@app.get("/users/me")
async def get_current_user():
    return {"user": "current_user"}
```

Starlette가 지원하는 경로 컨버터는 다음과 같습니다.

| 컨버터 | 정규식 | 예시 |
|--------|--------|------|
| `str` (기본값) | `[^/]+` | `{name}` (슬래시 제외 모든 문자) |
| `int` | `[0-9]+` | `{id:int}` (숫자만) |
| `float` | `[0-9]+(\.[0-9]+)?` | `{score:float}` (소수 포함) |
| `uuid` | UUID 패턴 | `{item:uuid}` (UUID 형식만) |
| `path` | `.*` | `{file:path}` (슬래시 포함 모든 문자) |

:::tip

**팁**

`{id:int}` 같은 경로 컨버터를 사용하면 라우트 순서에 대한 의존성을 줄일 수 있습니다. 특히 라우터를 여러 파일로 분리하는 대규모 프로젝트에서는 라우트 순서를 일일이 관리하기 어려우므로, 경로 컨버터를 적극 활용하는 것이 좋습니다.

:::

그렇다고 경로 컨버터가 만능은 아닙니다. `{username}`처럼 문자열 path parameter를 쓰는 경우에는 기본 제공 컨버터 중 `str`밖에 없어서, 보통은 순서 배치로 풀게 됩니다. 정 필요하면 Starlette의 `register_url_convertor()`로 원하는 정규식을 가진 컨버터를 직접 등록할 수도 있습니다. 예를 들어 `[a-z][a-z0-9_]{2,19}`짜리 `username` 컨버터를 만들어두면 `/users/{name:username}`이 `/users/me`를 삼키지 않습니다.

## 경로 매개변수 vs 쿼리 매개변수 혼동

라우팅에서 또 하나 자주 보는 실수가 있습니다. **경로 매개변수(Path Parameter)**와 **쿼리 매개변수(Query Parameter)**를 혼동하는 경우입니다.

```python
# 경로 매개변수 방식으로 정의
@app.get("/sessions/{session_id}")
async def get_session(session_id: int):
    return {"session_id": session_id}
```

이 엔드포인트에 대해 프론트엔드가 이렇게 요청을 보냅니다.

```bash
# 프론트엔드가 보낸 요청 (쿼리 매개변수)
$ curl http://localhost:8000/sessions?session_id=6

# 결과: 404 Not Found
```

왜 404가 뜰까요? 프론트엔드가 보낸 URL은 `/sessions?session_id=6`이지만, 정의된 라우트는 `/sessions/{session_id}`입니다. 이 둘은 **완전히 다른 경로**입니다.

| 방식 | URL 형태 | FastAPI 정의 |
|------|----------|-------------|
| **경로** 매개변수 | `/sessions/6` | `@app.get("/sessions/{session_id}")` |
| **쿼리** 매개변수 | `/sessions?session_id=6` | `@app.get("/sessions")` + 함수 파라미터 |

`/sessions?session_id=6`은 경로 부분이 `/sessions`입니다. `/sessions/{session_id}` 패턴과 매칭하려면 `/sessions/` 다음에 값이 있어야 하는데 없으니까 매칭 자체가 실패합니다. 등록된 라우트가 위 예시처럼 `/sessions/{session_id}` 하나뿐이라면 결과는 **404**입니다.

한편 405는 조금 다른 상황에서 나옵니다. 만약 다른 HTTP 메서드(예: `POST /sessions`)로 이미 `/sessions` 경로가 등록되어 있다면, 경로는 매칭되지만 메서드가 달라 **405 Method Not Allowed**가 반환됩니다. 즉, 404는 "경로 자체가 없음", 405는 "경로는 있는데 메서드가 없음"이라는 신호입니다.

### 해결: 요청 형태에 맞는 정의

프론트엔드의 요청 형태에 맞게 엔드포인트를 정의해야 합니다.

```python
# 쿼리 매개변수 방식: /sessions?session_id=6
@app.get("/sessions")
async def list_sessions(session_id: int):
    return {"session_id": session_id}

# 경로 매개변수 방식: /sessions/6
@app.get("/sessions/{session_id}")
async def get_session(session_id: int):
    return {"session_id": session_id}
```

FastAPI는 함수 파라미터가 경로 템플릿에 포함되어 있으면 path parameter로, 포함되어 있지 않으면 query parameter로 자동 판단합니다. 이 규칙만 기억하면 됩니다.

:::info

**참고**

RESTful API 설계에서 경로 매개변수는 **특정 리소스를 식별**할 때(`/users/123`), 쿼리 매개변수는 **필터링이나 검색 조건**을 전달할 때(`/users?role=admin`) 사용하는 것이 관례입니다.

:::

## 실무에서 자주 겪는 라우팅 함정들

지금까지 다룬 내용 외에도 프로젝트 규모가 커지면서 마주치는 함정들이 몇 가지 더 있습니다.

### 라우터 분리 시 include 순서

FastAPI 프로젝트는 보통 `APIRouter`를 사용해 라우터를 파일별로 분리합니다. 이때 `app.include_router()`의 호출 순서가 곧 라우트 등록 순서입니다.

```python
# main.py
from fastapi import FastAPI
from routers import users, admin

app = FastAPI()

# ❌ 위험: users 라우터에 /items/{item_id}가 있고
#          admin 라우터에 /items/stats가 있다면?
app.include_router(users.router, prefix="/items")
app.include_router(admin.router, prefix="/items")
```

같은 prefix를 공유하는 라우터가 여러 개일 때, `include_router` 순서에 따라 path parameter가 다른 라우터의 고정 경로를 삼킬 수 있습니다. 라우터를 도메인별 파일로 쪼개면 각 파일 안의 순서는 잘 관리하면서도 파일 사이의 순서는 놓치기 쉬운데, 프로젝트 구조를 잡을 때 이 점도 함께 고려해야 합니다.

### Catch-all 경로의 위험

루트 레벨에 path parameter를 두면 모든 경로를 잡아먹습니다.

```python
# ❌ 아래에 정의한 /health가 통째로 삼켜짐
@app.get("/{path}")
async def catch_all(path: str):
    return {"path": path}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

`/{path}` 패턴의 `[^/]+` 정규식이 `"health"`를 매칭해버려서, `GET /health`가 `{"path": "health"}`를 돌려줍니다. 아래에 무엇을 정의하든 마찬가지입니다.

한 가지 예외가 있습니다. `/docs`와 `/openapi.json`은 삼켜지지 않습니다. FastAPI가 `__init__` 끝에서 `setup()`을 호출해 문서 관련 라우트를 **사용자 데코레이터보다 먼저** 등록하기 때문입니다. 실제 등록 순서를 찍어보면 `/openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc`이 앞에 오고 그 뒤에 `/{path}`가 옵니다. 위에서 아래로 훑는 규칙이 여기서도 그대로 지켜지는 셈입니다.

### 에러 코드로 원인 파악하기

라우팅 관련 에러를 만났을 때, 에러 코드만으로 원인을 빠르게 좁힐 수 있습니다.

| 에러 코드 | 의미 | 라우팅 관련 원인 |
|-----------|------|-----------------|
| **404** Not Found | 매칭되는 라우트가 없음 | 경로 오타, 쿼리 매개변수를 경로 매개변수로 보냄 |
| **405** Method Not Allowed | 경로는 매칭, HTTP 메서드가 다름 | GET으로 정의했는데 POST로 요청, 또는 다른 메서드의 라우트에 경로가 걸림 |
| **422** Unprocessable Entity | 라우트 매칭 후 검증 실패 | path parameter 타입 불일치 (문자열 → int 변환 실패) |

특히 **422 에러가 뜨는데 코드상 문제가 없어 보이는 경우**, 의도하지 않은 라우트에 매칭된 것은 아닌지 확인해보는 것이 좋습니다. 위에서 살펴본 `/users/me`가 `/users/{user_id}`에 삼켜지는 케이스가 대표적입니다.

## 마치며

FastAPI 라우팅 문제의 핵심은 결국 하나입니다. **Starlette의 정규식 매칭과 FastAPI의 타입 검증은 별개의 단계**라는 것. 이걸 이해하면 422가 뜰 때 "내 코드가 잘못된 건가?" 대신 "의도하지 않은 라우트에 매칭된 건 아닌가?"라고 먼저 의심할 수 있게 됩니다.

규칙은 간단합니다. 고정 경로를 먼저 두고 path parameter 경로를 나중에 둡니다. 가능하다면 `{id:int}` 같은 경로 컨버터로 순서 의존성 자체를 줄이는 편이 낫습니다.

## 함께 보면 좋은 글

- [FastAPI 프로젝트를 체계적으로 구조화하는 방법](/fastapi/how-to-structure-fastapi-projects/)
- [Pydantic V2, FastAPI에서 제대로 쓰는 법](/fastapi/pydantic-v2-guide/)

## 참고자료

- [FastAPI - Path Parameters](https://fastapi.tiangolo.com/tutorial/path-params/)
- [Starlette - Routing](https://www.starlette.io/routing/)
- [Starlette routing.py source code](https://github.com/encode/starlette/blob/master/starlette/routing.py)
- [FastAPI GitHub Discussion #8621 - Path convertor vs function signature](https://github.com/fastapi/fastapi/discussions/8621)
