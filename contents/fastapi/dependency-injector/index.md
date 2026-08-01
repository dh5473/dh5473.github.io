---
date: '2025-08-02'
title: 'FastAPI에서 의존성 주입을?'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 4
summary: 'FastAPI의 Depends가 실제로 어디까지 해주는지 소스로 확인하고, 그 경계를 넘어서는 지점에서 dependency-injector를 어떻게 얹는지 살펴봅니다. 요청 스코프와 앱 수명 객체를 나누어 관리하는 방법을 다룹니다.'
thumbnail: './fastapi-logo.png'
---

의존성 주입은 "필요한 객체를 직접 만들지 않고 외부에서 주입 받는다"는 설계 방식이고, 그 배경에는 DIP와 IoC 같은 원칙이 있습니다. 다만 원칙을 아는 것과 프레임워크에서 실제로 쓰는 것은 다른 이야기입니다. Java의 스프링 프레임워크는 DI를 프레임워크 차원에서 강력하게 지원하지만, Python 웹 프레임워크인 FastAPI는 간단한 의존성 주입 기능만을 제공합니다.

Python에서 런타임에 인터페이스 준수를 강제하는 것은 `abc.ABC`뿐이고, `typing.Protocol`은 타입 체커만 확인합니다. 그래서 DI를 어떻게 구성할지가 언어 차원에서 정해지지 않고 프로젝트마다 관례가 갈립니다.

그럼에도 DI를 적용했을 때의 분명한 장점이 있기 때문에, 우선 기본적으로 제공하는 기능을 살펴보고 부족한 점을 어떻게 보완할 수 있을지 알아보겠습니다.

## FastAPI의 기본 DI

```python
from fastapi import FastAPI, Depends

app = FastAPI()

# 의존성 함수 정의
def get_database():
    return {"connection": "postgresql://localhost/mydb"}

# 의존성 주입
@app.get("/users")
def get_users(db=Depends(get_database)):
    return {"db": db, "users": ["user1", "user2"]}
```

FastAPI는 `Depends`라는 키워드를 통해 의존성 주입을 지원합니다.

위의 예시에서 `get_database()`는 실제 데이터베이스 연결 객체를 반환하는 함수입니다. FastAPI는 `/users`로 요청이 들어올 때마다 `get_database()`를 자동으로 호출하고, 그 반환값을 `db` 파라미터에 **주입(inject)** 해줍니다.

## FastAPI DI의 한계

이처럼 키워드 하나로 의존성 주입을 지원하지만, 간단한 만큼 한계도 있습니다. 어디가 한계인지 정확히 짚으려면 먼저 스코프를 정리해야 합니다. 의존성 주입은 어떻게 주입할지(생성자, 수정자, 필드, 메서드 주입 등), 객체를 어디까지 공유할지(스코프), 객체가 언제 생성되고 사라지는지(생명 주기) 등 여러 관점에서 다룰 수 있는데, FastAPI가 지원하는 것은 함수와 호출 가능한 클래스 수준의 주입이므로 여기서는 스코프와 생명 주기를 중점으로 보겠습니다.

| 생명주기 | 생성 시점 | 재사용 범위 | 사용 예시 |
|---|---|---|---|
| Singleton | 최초 호출 시 1회 | 전체 애플리케이션 | 설정 객체, DB 커넥션 풀 |
| Request Scoped | 요청마다 1회 | 같은 요청 내에서 공유 | 사용자 컨텍스트, 감사 로깅 |
| Transient | 주입마다 매번 | 재사용 없음 | 임시 파일, 일회성 메시지 객체 |

여기서 흔한 오해를 하나 짚고 가겠습니다. `Depends`가 세 가지 중 아무것도 못 한다고 생각하기 쉬운데, 사실은 **가운데 칸이 `Depends`의 기본 동작**입니다.

```python
class Depends:
    dependency: Callable[..., Any] | None = None
    use_cache: bool = True
    scope: Literal["function", "request"] | None = None
```

`use_cache`의 기본값이 `True`입니다. FastAPI는 요청마다 `dependency_cache` 딕셔너리를 만들어, 같은 의존성이 한 요청 안에서 여러 번 주입되면 최초 1회만 호출하고 그 결과를 나눠 씁니다. 공식 문서도 "FastAPI will know to call that sub-dependency only once per request"라고 못박습니다. 요청 스코프는 공짜로 따라오는 셈입니다. 반대로 매번 새로 만들고 싶으면 `Depends(get_x, use_cache=False)`로 끄면 되니 Transient도 됩니다.

**그러니 `Depends`에 진짜로 없는 것은 싱글톤 하나입니다.** 그마저도 공식 문서가 `@lru_cache`를 얹는 방법을 정식으로 안내하고, lifespan에서 만들어 `app.state`에 얹는 길도 있습니다. 세 줄이면 되는 일이라 "전역 변수 말고는 방법이 없다"고 할 정도는 아닙니다.

그렇다면 무엇이 한계인가. 스코프를 **선언할 자리가 없다**는 것입니다. 위의 세 가지를 코드로 구현할 수는 있지만, 어떤 객체가 어떤 스코프인지가 `@lru_cache` 데코레이터, lifespan 함수, `use_cache` 인자에 흩어집니다. 의존성이 열 개를 넘어가면 이 배치가 어디에 있는지 아무도 모르게 됩니다.

### 너무 많은 팩토리 함수

팩토리 함수란 **함수 내부에서 객체를 생성해 반환하는 함수**를 말합니다. 보통 동적으로 객체를 생성하며, 매개변수를 받아 새로운 객체를 생성하고 이를 반환합니다.

```python
# 이런 의존성 트리가 있다고 가정: A → B → (C, D) → (E, F)

def create_f():
    return F()

def create_e():
    return E()

def create_d(e=Depends(create_e), f=Depends(create_f)):
    return D(e, f)

def create_c():
    return C()

def create_b(c=Depends(create_c), d=Depends(create_d)):
    return B(c, d)

def create_a(b=Depends(create_b)):
    return A(b)

@app.get("/endpoint")
def my_endpoint(a: A = Depends(create_a)):
    return a.do_something()
```

각 객체가 서로 다른 스코프를 가진다면 어떻게 될까요?

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 336" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="A가 B에, B가 C와 D에, D가 E와 F에 의존하는 트리. 노드마다 싱글톤, 요청 단위, 매번 생성으로 스코프가 제각각인 상태">
<style>
.dt-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.dt-node { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.dt-pn { font-size: 17px; font-weight: 700; fill: var(--primary, #0d9488); }
.dt-an { font-size: 17px; font-weight: 700; fill: var(--accent, #d97706); }
.dt-plain { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.dt-single { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0d9488); stroke-width: 1.8; }
.dt-req { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #d97706); stroke-width: 1.8; }
.dt-trans { fill: var(--bg-muted, #eeecea); stroke: var(--text-muted, #78716c); stroke-width: 1.8; stroke-dasharray: 4 3; }
.dt-sc { font-size: 14px; fill: var(--primary, #0d9488); }
.dt-ac { font-size: 14px; fill: var(--accent, #d97706); }
.dt-mc { font-size: 14px; fill: var(--text-muted, #78716c); }
.dt-note { font-size: 14px; fill: var(--text-muted, #78716c); }
.dt-edge { stroke: var(--text-muted, #78716c); stroke-width: 1.4; fill: none; }
</style>
<defs>
<marker id="dtArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #78716c)"/></marker>
</defs>
<text class="dt-title" x="200" y="20" text-anchor="middle">스코프가 제각각인 의존성 트리</text>
<!-- 간선 -->
<path class="dt-edge" d="M200,74 L200,100" marker-end="url(#dtArrow)"/>
<path class="dt-edge" d="M180,138 L100,182" marker-end="url(#dtArrow)"/>
<path class="dt-edge" d="M220,138 L268,182" marker-end="url(#dtArrow)"/>
<path class="dt-edge" d="M258,220 L218,264" marker-end="url(#dtArrow)"/>
<path class="dt-edge" d="M286,220 L326,264" marker-end="url(#dtArrow)"/>
<!-- A -->
<rect class="dt-plain" x="172" y="40" width="56" height="34" rx="8"/>
<text class="dt-node" x="200" y="63" text-anchor="middle">A</text>
<!-- B -->
<rect class="dt-single" x="172" y="104" width="56" height="34" rx="8"/>
<text class="dt-pn" x="200" y="127" text-anchor="middle">B</text>
<text class="dt-sc" x="200" y="156" text-anchor="middle">싱글톤</text>
<!-- C -->
<rect class="dt-req" x="68" y="186" width="56" height="34" rx="8"/>
<text class="dt-an" x="96" y="209" text-anchor="middle">C</text>
<text class="dt-ac" x="96" y="238" text-anchor="middle">요청 단위</text>
<!-- D -->
<rect class="dt-single" x="244" y="186" width="56" height="34" rx="8"/>
<text class="dt-pn" x="272" y="209" text-anchor="middle">D</text>
<text class="dt-sc" x="308" y="212" text-anchor="start">싱글톤</text>
<!-- E -->
<rect class="dt-single" x="186" y="268" width="56" height="34" rx="8"/>
<text class="dt-pn" x="214" y="291" text-anchor="middle">E</text>
<text class="dt-sc" x="214" y="320" text-anchor="middle">싱글톤</text>
<!-- F -->
<rect class="dt-trans" x="302" y="268" width="56" height="34" rx="8"/>
<text class="dt-node" x="330" y="291" text-anchor="middle">F</text>
<text class="dt-mc" x="330" y="320" text-anchor="middle">매번 생성</text>
</svg>
</div>

노드 하나가 늘면 함수 하나가 늘고, 그 노드를 쓰는 부모의 시그니처도 같이 바뀝니다. 스코프가 세 갈래로 갈리는데 `Depends`가 공짜로 주는 것은 그중 요청 스코프 하나뿐이라, 나머지 둘은 팩토리 함수마다 따로 손을 봐야 합니다. `create_e`에는 `@lru_cache`를, `create_f`에는 `use_cache=False`를 붙이는 식입니다. 그렇게 붙이고 나면 스코프 정보가 여섯 개 함수에 흩어집니다.

### 요청 사이와 요청 안은 다릅니다

캐싱이 어디까지 도는지는 직접 찍어보는 편이 빠릅니다.

```python
class DatabaseConnection:
    def __init__(self):
        print("데이터베이스 연결 생성됨!")  # 언제 출력되는지 확인
        self.connection_id = id(self)

def get_db():
    return DatabaseConnection()

@app.get("/users")
def get_users(
    db: DatabaseConnection = Depends(get_db),
    db2: DatabaseConnection = Depends(get_db),  # 같은 요청, 같은 의존성
):
    return {"same": db is db2, "connection_id": db.connection_id}
```

`/users`를 한 번 호출하면 "데이터베이스 연결 생성됨!"이 **한 번만** 출력되고 `same`은 `true`로 나옵니다. 같은 요청 안에서는 두 번 주입해도 인스턴스가 하나입니다. 다시 호출하면 그때 다시 한 번 출력되고 `connection_id`가 바뀝니다.

정리하면 **요청 사이에는 새로 만들고, 요청 안에서는 공유합니다.** 딱 요청 스코프입니다.

문제는 DB 커넥션 풀이나 AI 모델처럼 **요청 사이에도 살아 있어야 하는** 객체입니다. 이건 요청 스코프로 감당이 안 됩니다. `@lru_cache`나 lifespan으로 해결할 수는 있지만, 그렇게 되면 어떤 객체가 앱 수명이고 어떤 객체가 요청 수명인지가 서로 다른 문법으로 코드 여기저기에 흩어집니다.

## Dependency Injector

여기까지가 `Depends`의 경계입니다. 요청 스코프는 잘하고, 앱 수명 객체와 의존성 그래프 선언은 다른 도구가 필요합니다. 보통은 python-dependency-injector를 씁니다. 지원하는 다양한 기능 중 간단하고 실용적인 예시 몇 가지를 살펴보겠습니다.

한 가지 먼저 짚어둘 것이 있습니다. 이 라이브러리에는 **요청 스코프 provider가 없습니다.** `Factory`, `Singleton`, `Resource`, `ThreadSafeSingleton` 등이 있는데 요청 단위로 캐시하는 것은 목록에 없습니다. 그러니 둘은 경쟁 관계가 아닙니다. 요청 스코프는 `Depends`가, 앱 수명은 컨테이너가 맡고, 잠시 뒤에 볼 `Depends(Provide[...])`가 그 둘을 이어 붙이는 구조입니다.

### Singleton: 전역으로 1회 생성

```python
from dependency_injector import containers, providers

class DBConnection:
    def __init__(self):
        print("연결됨")

class Container(containers.DeclarativeContainer):
    db = providers.Singleton(DBConnection)

container = Container()
db1 = container.db()
db2 = container.db()

assert db1 is db2  # 동일한 인스턴스
```

싱글톤을 활용하면 매번 새로운 인스턴스를 생성하는 것이 아니라 한 번 만들어두고 재사용이 가능합니다. 프로젝트 내부 앱들이 다양할 경우 하나의 container 파일에서 각 앱들의 repository나 service 등을 싱글톤으로 관리하면 깔끔한 코드를 작성할 수 있습니다.

이름 때문에 오해하기 쉬운 두 가지가 있습니다. 첫째, 여기서 말하는 "전역"의 범위는 프로세스가 아니라 **컨테이너 인스턴스**입니다. `Container()`를 두 번 만들면 provider도 복제되어 인스턴스가 둘 생깁니다. 둘째, 생성 시점은 앱 시작이 아니라 **최초 호출**입니다. `Singleton._provide`가 `if self._storage is None`을 확인해 그때 만듭니다. 앱 시작과 동시에 준비해두려면 lifespan에서 한 번 호출해줘야 합니다. 참고로 기본 `Singleton`은 스레드 안전하지 않아서, 그게 필요하면 `ThreadSafeSingleton`이 따로 있습니다.

### Factory: 주입할 때마다 새 인스턴스 생성

```python
import uuid
from dependency_injector import containers, providers

class Report:
    def __init__(self):
        self.id = uuid.uuid4()

class Container(containers.DeclarativeContainer):
    report = providers.Factory(Report)

container = Container()
r1 = container.report()
r2 = container.report()

assert r1 is not r2  # 서로 다른 인스턴스
```

팩토리는 **호출할 때마다** 새 인스턴스를 만듭니다. 앞의 표로 치면 Transient입니다. 요청 단위가 아니라는 점이 중요합니다. 같은 요청 안에서 두 곳에 주입하면 인스턴스가 두 개 생깁니다. 그래서 요청 하나를 대표하는 사용자 컨텍스트 같은 객체는 `Factory`가 아니라 `Depends`에 맡겨야 합니다. `Factory`가 어울리는 것은 일회성 리포트 객체처럼 매번 새것이어야 의미가 있는 쪽입니다.

### Router에 주입하기

```python
from dependency_injector.wiring import Provide, inject

@user_router.post("/users")
@inject  # 의존성 주입 활성화 데코레이터
async def create_user(
    request: CreateUserRequest,
    user_service: UserService = Depends(Provide[Container.user_service]),
):
    user = await user_service.create_user(request)
    return CreateUserResponse(**user)
```

컨테이너에 등록해둔 싱글톤 프로바이더는 이렇게 라우터에서 그대로 주입받을 수 있습니다. 위의 예시는 DI 컨테이너에서 정의한 `user_service` 인스턴스를 핸들러 함수(HTTP 요청이 들어왔을 때 실행되는 함수)에 넘기고 있습니다.

여기서 빠뜨리기 쉬운 단계가 하나 있습니다. **컨테이너를 모듈에 연결(wiring)해줘야 마커가 동작합니다.**

```python
class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(modules=[".routers.user"])

    user_repository = providers.Singleton(UserRepository, session_factory=session_factory)
    user_service = providers.Singleton(UserService, user_repository=user_repository)
```

이 선언(또는 앱 초기화 시점의 `container.wire(modules=[...])`)이 없으면 `Provide[...]` 마커가 교체되지 않습니다. 그런데 `_Marker.__call__`이 `return self`라서 **예외가 나지 않습니다.** `user_service` 자리에 서비스 대신 마커 객체가 그대로 들어가 엉뚱한 곳에서 터집니다. 조용히 잘못 동작하는 유형이라 처음 붙일 때 가장 많이 헤매는 지점입니다.

프로바이더끼리 미리 엮어두면 서비스 클래스가 생성자로 리포지토리를 받아 깔끔하게 쓸 수 있습니다. 다만 **DB 세션을 `Singleton`으로 감싸면 안 됩니다.** SQLAlchemy 문서는 "A single instance of AsyncSession is not safe for use in multiple, concurrent tasks"라고 못박고 태스크마다 별도 세션을 권합니다. 세션 자체가 아니라 **세션 팩토리**를 싱글톤으로 두고, 세션은 요청마다 여는 것이 맞습니다.

```python
session_factory = providers.Singleton(
    async_sessionmaker,
    bind=engine,
    expire_on_commit=False,
)
```

리포지토리는 이 팩토리를 받아 필요할 때 `async with self._session_factory() as session:`으로 세션을 엽니다. 참고로 dependency-injector는 provider가 아닌 인자를 있는 그대로 넘기기 때문에, `AsyncSession=AsyncSession`처럼 쓰면 세션 인스턴스가 아니라 **클래스 객체**가 전달됩니다.

### Dependency Injector의 장점

이러한 방식은 다음과 같은 장점이 있습니다.

**서비스 계층 분리**

`user_service`는 비즈니스 로직만 담당하고, FastAPI 핸들러는 HTTP 요청과 응답 처리에만 집중합니다.

덕분에 유지보수성이 높아지고, 코드가 직관적으로 분리됩니다.

**명확한 의존성 주입 구조**

`user_service`가 어떻게 만들어지는지 라우터 내부에서 신경 쓸 필요가 없습니다.

dependency-injector의 컨테이너에서 관리되고, 스코프나 생명 주기도 명확히 설정이 가능합니다.

**싱글톤 관리 자동화**

컨테이너에서 싱글톤으로 정의했기 때문에, 그 컨테이너 인스턴스를 쓰는 모든 곳이 같은 객체를 공유합니다.

DB 커넥션 풀, 설정 객체, 캐시 등 비용이 큰 리소스를 효율적으로 관리 가능합니다.

**테스트 코드 작성 용이**

컨테이너를 모킹하거나 다른 인스턴스를 주입함으로써 테스트 시 자유롭게 대체 가능합니다.

```python
# 테스트 시에는 다른 user_service를 주입해도 동일한 인터페이스로 작동
container.user_service.override(MockUserService())
```

이건 FastAPI에도 `app.dependency_overrides`라는 대응물이 있어서 컨테이너만의 장점은 아닙니다. 차이는 단위입니다. `dependency_overrides`가 의존성 하나씩 갈아끼우는 반면, 컨테이너는 여러 프로바이더를 묶어 한꺼번에 바꾸거나 컨테이너 자체를 테스트용으로 교체할 수 있습니다.

**확장성과 유연성**

추후 서비스가 커지면서 새로운 의존성이 생겨도, DI 컨테이너에 등록만 하면 자동 주입이 가능합니다.

라우터 코드를 수정하지 않고도 새로운 구현체로 교체가 가능합니다.

## DI에 적합한 구조 설계하기

파일 역할별로 나눈 경우입니다.

```text
src/
├── container.py            # DI 컨테이너 정의
├── services/
│   └── user_service.py
├── repositories/
│   └── user_repository.py
└── routers/
    └── user_router.py
```

도메인별로 묶은 경우입니다. `container.py`의 위치는 어느 쪽이든 최상단으로 같습니다.

```text
src/
├── container.py            # DI 컨테이너 정의
└── user/
    ├── router.py           # controller
    ├── service.py
    ├── dto.py
    └── repository.py
```

두 구조 모두 `container.py`에서 프로바이더를 선언하고 라우터에서 주입받는 방식은 같습니다. 이렇게 한 곳에서 관리하면 의존성이 많아져도 어디를 열어야 할지가 분명합니다.

## 마치며

지금까지 의존성 주입에 대해 알아보고, 나아가 FastAPI에서는 어떻게 활용할 수 있을지 살펴보았습니다.

이 글에서 가장 중요한 것은 `Depends`와 DI 컨테이너가 서로 대체재가 아니라는 점입니다. 요청 스코프는 `Depends`가 이미 잘 하고 있고, 컨테이너가 채우는 자리는 앱 수명 객체와 의존성 그래프의 선언입니다. `Depends(Provide[Container.user_service])`라는 한 줄이 그 둘을 이어 붙입니다. 라이브러리를 얹을지 말지는 "기본 기능이 부족한가"가 아니라 **스코프 배치가 코드 여기저기에 흩어지기 시작했는가**로 판단하면 됩니다.

## 함께 보면 좋은 글

- [Dependency Injection 제대로 이해하기](/fastapi/dependency-injection/)
- [FastAPI 프로젝트를 체계적으로 구조화하는 방법](/fastapi/how-to-structure-fastapi-projects/)
- [FastAPI Lifespan으로 앱의 시작과 끝을 관리하는 법](/fastapi/fastapi-lifespan/)

## 참고자료

- [파이썬과 인터페이스 - 프로토콜에서 ABC까지](https://medium.com/humanscape-tech/%ED%8C%8C%EC%9D%B4%EC%8D%AC%EA%B3%BC-%EC%9D%B8%ED%84%B0%ED%8E%98%EC%9D%B4%EC%8A%A4-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C%EC%97%90%EC%84%9C-abc%EA%B9%8C%EC%A7%80-118bc5aed344)
- [Can someone explain when to use Singleton Scoped](https://www.reddit.com/r/csharp/comments/1acwtar/can_someone_explain_when_to_use_singleton_scoped/)
- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)