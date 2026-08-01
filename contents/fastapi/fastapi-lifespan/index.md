---
date: '2026-04-09'
title: 'FastAPI Lifespan으로 앱의 시작과 끝을 관리하는 법'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 6
tags: ['FastAPI', 'Lifespan', 'Python', 'asynccontextmanager', 'ML Serving']
summary: 'FastAPI의 Lifespan으로 ML 모델 로딩, DB 커넥션 풀, Redis 클라이언트 등 앱 리소스의 초기화와 정리를 한 곳에서 관리하는 방법을 다룹니다.'
thumbnail: './fastapi-logo.png'
---

환경 변수를 타입 안전하게 읽어오는 설정 객체를 하나 만들었다고 해봅시다. 그런데 이 객체는 **언제, 어디서** 만들어야 할까요? DB URL을 읽었다면 커넥션 풀은 어디서 초기화하고, ML 모델은 언제 메모리에 올려야 할까요?

이번 글에서는 FastAPI의 **Lifespan**을 다룹니다. 앱이 시작될 때 필요한 리소스를 준비하고, 종료될 때 깔끔하게 정리하는 구조를 하나의 함수 안에서 관리하는 방법입니다.

## 애플리케이션에는 생명 주기가 있다

웹 애플리케이션은 시작, 요청 처리, 종료라는 세 단계의 생명 주기를 가집니다. 대부분의 시간은 요청 처리에 쓰이지만, **시작과 종료 시점에 해야 할 일**이 의외로 많습니다.

- **시작 시점**: DB 커넥션 풀 초기화, ML 모델 로딩, Redis 클라이언트 연결, HTTP 클라이언트 생성, 설정 로딩
- **종료 시점**: 커넥션 정리, 열린 파일 핸들 닫기, 임시 파일 삭제, graceful shutdown 처리

이 작업들을 엔드포인트 안에서 하면 어떻게 될까요?

```python
# ❌ 안티패턴: 매 요청마다 모델 로딩
@app.post("/predict")
async def predict(data: PredictRequest):
    model = load_model("model_v3.pkl")  # 매번 수 초 소요
    result = model.predict(data.features)
    return {"prediction": result}
```

모델 로딩에 3초가 걸린다면, 모든 요청이 3초씩 느려집니다. DB 커넥션도 마찬가지입니다. 매 요청마다 `create_engine()`을 호출하면 커넥션 풀의 이점을 전혀 누릴 수 없습니다. `Depends`가 요청마다 새 인스턴스를 만드는 것과 같은 문제가, 이번에는 리소스 레벨에서 반복되는 것입니다.

:::summary

**핵심**

앱 레벨 리소스(DB, 모델, 캐시)는 요청마다 생성하는 것이 아니라, **앱의 시작/종료 시점에 한 번만** 관리해야 합니다.

:::

## 예전 방식: on_event

FastAPI 초기에는 `@app.on_event` 데코레이터로 시작/종료 로직을 등록했습니다. 실제로 이 방식으로 시작하는 프로젝트가 많았고, 지금도 레거시 코드에서 심심치 않게 보입니다.

```python
from fastapi import FastAPI

app = FastAPI()

db_connection = None

@app.on_event("startup")
async def startup():
    global db_connection
    db_connection = await create_db_pool("postgresql://localhost/mydb")

@app.on_event("shutdown")
async def shutdown():
    if db_connection:
        await db_connection.close()
```

동작은 하지만, 구조적인 문제가 있습니다.

- **startup과 shutdown이 분리**되어 있어서, 어떤 리소스가 어디서 초기화되고 어디서 정리되는지 추적하기 어렵습니다
- 리소스를 공유하려면 **전역 변수**에 의존해야 합니다
- 리소스가 여러 개면 startup/shutdown 함수가 각각 늘어나면서 관리가 복잡해집니다

:::warning

**주의**

`on_event`는 FastAPI 공식 문서에서 deprecated로 표기되어 있습니다. 새 프로젝트에서는 lifespan을 쓰는 것이 맞습니다.

:::

## Lifespan: 시작과 끝을 하나로

### asynccontextmanager와 yield

Lifespan은 Python 표준 라이브러리의 `@asynccontextmanager`를 활용합니다. `yield`를 기준으로 **위쪽이 startup, 아래쪽이 shutdown**입니다.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    model = load_model("model_v3.pkl")
    print(f"Model loaded: {model}")

    yield  # 이 시점부터 요청을 받기 시작

    # --- Shutdown ---
    del model
    print("Model unloaded")

app = FastAPI(lifespan=lifespan)
```

`yield` 위의 코드는 **첫 번째 요청이 처리되기 전에** 실행되고, `yield` 아래의 코드는 **마지막 요청이 처리된 후에** 실행됩니다. 즉, `yield`가 앱의 전체 요청 처리 구간을 감싸는 구조입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 398" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="앱 생명 주기를 세 구간으로 나눈 그림. yield 위는 startup, yield와 종료 신호 사이가 요청 처리 구간, 그 아래가 shutdown. 가운데 구간이 가장 길게 그려져 있음">
<style>
.ls-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.ls-edge { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #d97706); stroke-width: 1.6; }
.ls-serve { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.6; }
.ls-et { font-size: 16px; font-weight: 700; fill: var(--accent, #d97706); }
.ls-st { font-size: 16px; font-weight: 700; fill: var(--text-success, #16a34a); }
.ls-sub { font-size: 14px; fill: var(--text-muted, #78716c); }
.ls-note { font-size: 14px; fill: var(--text-muted, #78716c); }
.ls-mark { stroke: var(--primary, #0d9488); stroke-width: 1.6; stroke-dasharray: 5 3; fill: none; }
.ls-mt { font-size: 14px; font-weight: 600; fill: var(--primary, #0d9488); }
</style>
<text class="ls-title" x="200" y="20" text-anchor="middle">yield가 가르는 세 구간</text>
<rect class="ls-edge" x="16" y="40" width="150" height="76" rx="8"/>
<text class="ls-et" x="91" y="74" text-anchor="middle">yield 위</text>
<text class="ls-sub" x="91" y="96" text-anchor="middle">startup</text>
<text class="ls-note" x="178" y="68" text-anchor="start">모델 로딩</text>
<text class="ls-note" x="178" y="90" text-anchor="start">커넥션 풀 생성</text>
<path class="ls-mark" d="M8,124 L300,124"/>
<text class="ls-mt" x="308" y="129" text-anchor="start">yield</text>
<rect class="ls-serve" x="16" y="132" width="150" height="160" rx="8"/>
<text class="ls-st" x="91" y="206" text-anchor="middle">요청 처리</text>
<text class="ls-sub" x="91" y="228" text-anchor="middle">앱 수명 대부분</text>
<text class="ls-note" x="178" y="216" text-anchor="start">엔드포인트 실행</text>
<path class="ls-mark" d="M8,300 L300,300"/>
<text class="ls-mt" x="308" y="305" text-anchor="start">종료 신호</text>
<rect class="ls-edge" x="16" y="308" width="150" height="76" rx="8"/>
<text class="ls-et" x="91" y="342" text-anchor="middle">yield 아래</text>
<text class="ls-sub" x="91" y="364" text-anchor="middle">shutdown</text>
<text class="ls-note" x="178" y="336" text-anchor="start">풀 반납</text>
<text class="ls-note" x="178" y="358" text-anchor="start">파일 핸들 닫기</text>
</svg>
</div>

`yield`를 한 번만 쓴다는 점이 중요합니다. 두 번 `yield`하면 `RuntimeError: generator didn't stop`이 나고, 아예 `yield`하지 않으면 `RuntimeError: generator didn't yield`로 앱이 시작되지 못합니다.

:::info

**참고**

lifespan 함수는 `app: FastAPI` 파라미터를 받습니다. 이를 통해 `app.state`에 리소스를 저장하거나, 앱 설정에 접근할 수 있습니다.

:::

### on_event에서 lifespan으로 마이그레이션

아까 봤던 on_event 코드를 lifespan으로 변환하면 이렇게 됩니다.

```python
# ✅ After: 하나의 함수에서 시작과 종료를 관리
@asynccontextmanager
async def lifespan(app: FastAPI):
    db_connection = await create_db_pool("postgresql://localhost/mydb")
    app.state.db = db_connection

    yield

    await db_connection.close()
```

전역 변수가 사라지고, 초기화와 정리가 같은 스코프 안에 있어 리소스 추적이 훨씬 쉽습니다. 여기에 `try/finally`를 추가하면 startup 도중 에러가 발생해도 이미 초기화된 리소스를 안전하게 정리할 수 있습니다.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    db = await create_db_pool("postgresql://localhost/mydb")
    app.state.db = db

    redis = None
    try:
        redis = await create_redis_client("redis://localhost")
        app.state.redis = redis
        yield
    finally:
        if redis:
            await redis.close()
        await db.close()
```

:::tip

**팁**

`try/finally`를 사용하면 Redis 초기화가 실패하더라도, 이미 연결된 DB 커넥션은 안전하게 정리됩니다. startup이 완전히 성공해야만 yield에 도달하므로, 불완전한 상태로 요청을 받는 일도 방지할 수 있습니다.

:::

## 실전 패턴: 리소스별 활용

실무에서 lifespan에 올리게 되는 리소스는 크게 두 종류입니다. 하나는 DB 커넥션 풀이나 HTTP 클라이언트처럼 **앱 전역에서 재사용해야 하는 네트워크 리소스**, 다른 하나는 ML 모델처럼 **로딩이 무거워 요청을 받기 전에 준비되어야 하는 리소스**입니다. 앞쪽은 모듈 레벨 전역 변수로도 동작은 하지만, lifespan에 올리면 초기화와 정리가 한 곳에 모이고 테스트에서 교체하기도 쉬워집니다. 먼저 흔한 리소스들부터 하나씩 살펴보겠습니다.

### DB 커넥션 풀 (SQLAlchemy async)

가장 흔한 패턴입니다. `create_async_engine`으로 커넥션 풀을 만들고, 종료 시 `dispose()`로 정리합니다.

```python
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_async_engine(
        "postgresql+asyncpg://user:pass@localhost/mydb",
        pool_size=20,
        max_overflow=10,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    app.state.db_engine = engine
    app.state.db_session_factory = session_factory

    yield

    await engine.dispose()
```

`session_factory`를 `app.state`에 저장해두면, Depends 함수에서 세션을 꺼내 쓸 수 있습니다. 프로젝트 구조에서 DB 연결을 `database.py`로 떼어내는 관례와도 자연스럽게 맞물립니다.

### HTTP 클라이언트 (httpx.AsyncClient)

외부 API를 호출할 때 `httpx.AsyncClient`를 lifespan에서 생성하면 connection pooling이 동작합니다.

```python
import httpx

@asynccontextmanager
async def lifespan(app: FastAPI):
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(10.0),
        limits=httpx.Limits(max_connections=100),
    )
    app.state.http_client = http_client

    yield

    await http_client.aclose()
```

:::summary

**핵심**

엔드포인트마다 `async with httpx.AsyncClient() as client:`를 쓰면 매 요청마다 TCP 연결을 새로 맺습니다. lifespan에서 하나 만들어 재사용하면 **connection pooling**이 동작해서 외부 API 호출 성능이 크게 개선됩니다.

:::

### 여러 리소스를 한 lifespan에서 관리하기

실제 프로젝트에서는 DB와 HTTP 클라이언트 등 여러 리소스를 동시에 관리해야 합니다. 하나의 lifespan에서 `try/finally`로 묶으면 됩니다.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. 설정 로딩
    settings = Settings()

    # 2. DB 커넥션 풀
    engine = create_async_engine(settings.database_url)
    app.state.db_engine = engine

    # 3. HTTP 클라이언트
    http_client = httpx.AsyncClient(timeout=10.0)
    app.state.http_client = http_client

    try:
        yield
    finally:
        # 정리는 초기화의 역순
        await http_client.aclose()
        await engine.dispose()
```

:::tip

**팁**

리소스 정리 순서는 초기화의 역순이 안전합니다. 나중에 초기화된 리소스가 먼저 초기화된 리소스에 의존할 수 있기 때문입니다.

:::

## ML 모델 서빙과 Lifespan

Lifespan이 가장 빛나는 순간은 **ML 모델을 서빙할 때**입니다. 모델은 로딩에 수 초가 걸리고, 메모리에 수백 MB를 차지하며, 한 번 로드하면 모든 요청에서 재사용해야 합니다. 실제 ML API 서버를 운영하면서 정립한 패턴을 공유합니다.

### Startup에서 모델 로딩

핵심은 **Eager Loading**입니다. 모든 모델이 준비될 때까지 서버가 요청을 받지 않는 것입니다.

```python
import time
import logging

logger = logging.getLogger(__name__)

class ModelManager:
    def __init__(self):
        self.models: dict[str, object] = {}
        self.is_loading = False

    @property
    def is_ready(self) -> bool:
        return bool(self.models) and not self.is_loading

    def load_all_models(self) -> None:
        """모든 모델을 로드한다. 새 dict를 완성한 후 한 번에 교체."""
        self.is_loading = True
        start = time.time()

        try:
            new_models = {}
            for name, path in MODEL_REGISTRY.items():
                logger.info("Loading %s from %s", name, path)
                new_models[name] = load_model(path)

            # 새 dict를 통째로 교체 (읽는 쪽은 참조를 한 번만 집어감)
            self.models = new_models
            logger.info("All models loaded in %.2fs", time.time() - start)
        finally:
            self.is_loading = False

    def get_model(self, name: str):
        model = self.models.get(name)
        if model is None:
            raise RuntimeError(f"'{name}' model not loaded")
        return model
```

이 `ModelManager`를 lifespan에서 초기화합니다.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    model_manager = ModelManager()
    model_manager.load_all_models()

    app.state.model_manager = model_manager
    logger.info("Startup complete. Models ready: %s", model_manager.is_ready)

    yield
```

여기서 중요한 설계 판단이 하나 있습니다. **모델 로딩이 실패하면 서버를 crash시키는 것이 안전합니다.** `load_all_models()`에서 예외가 발생하면 `yield`에 도달하지 못하고, FastAPI는 시작에 실패합니다. Kubernetes 환경이라면 새 Pod가 ready에 도달하지 못해 롤아웃이 멈추고 기존 정상 Pod가 그대로 트래픽을 받습니다. 불완전한 상태로 요청을 받는 것보다 훨씬 낫습니다. 다만 쿠버네티스가 이전 버전으로 자동 복귀시켜주지는 않으므로, 되돌리려면 `kubectl rollout undo`를 직접 실행해야 합니다.

:::summary

**핵심**

- ML 모델은 startup에서 **한 번만** 로드하고 모든 요청에서 재사용
- 모델 로딩 실패 시 서버를 crash시키는 것이 운영상 안전 (롤아웃이 멈추고 기존 Pod가 유지됨)
- `self.models = new_models`처럼 완성된 객체를 통째로 갈아끼우면 중간 상태가 노출되지 않음

:::

### 모델 Hot Reload

모델을 업데이트할 때마다 서버를 재시작하는 것은 비효율적입니다. admin 엔드포인트로 런타임에 모델을 교체하는 패턴을 쓸 수 있습니다.

```python
class ModelManager:
    # ... (위의 코드에 이어서)

    def reload_models(self) -> dict:
        """서버 재시작 없이 모델 교체. 새 모델을 완성한 후 한 번에 교체."""
        if self.is_loading:
            raise RuntimeError("Model loading already in progress")

        start = time.time()
        self.load_all_models()

        return {
            "status": "success",
            "elapsed_seconds": round(time.time() - start, 2),
            "reloaded_models": list(self.models.keys()),
        }
```

```python
from fastapi import APIRouter, Request

router = APIRouter()

@router.post("/admin/reload-models")
async def reload_models(request: Request):
    model_manager = request.app.state.model_manager
    result = model_manager.reload_models()
    return result
```

`load_all_models()`가 새 dict(`new_models`)를 완성한 **후에** `self.models`에 할당하는 것이 핵심입니다. 기존 dict를 열어놓고 하나씩 갈아끼우면 요청이 절반만 바뀐 상태를 보게 되지만, 통째로 교체하면 어떤 요청이든 옛 dict 아니면 새 dict를 봅니다. 둘 중 무엇을 보든 온전한 모델 묶음입니다.

이 패턴을 "GIL이 속성 할당을 원자적으로 만들어주니까 안전하다"고 설명하는 글이 많은데, 조금 조심할 필요가 있습니다. CPython 문서는 이런 동작을 **언어의 보장이 아니라 구현 세부사항**으로 못박고 있고, free-threaded 빌드 문서에서도 내장 타입의 내부 락에 기대는 대신 `threading.Lock`을 쓰라고 권합니다. 지금 코드가 안전한 진짜 이유는 GIL이 아니라 **읽는 쪽이 참조를 한 번만 집어간다**는 구조 자체입니다. 교체 전후로 지켜야 할 불변식이 늘어나는 순간(예: 모델과 버전 문자열을 함께 바꿔야 할 때) 락을 넣는 것이 맞습니다.

### Health Endpoint와 모델 버전

ML 서버에서 `/health`는 단순히 "살아있다"를 넘어, **어떤 모델이 로드되어 있는지**까지 알려주는 것이 좋습니다.

```python
@router.get("/health")
async def health(request: Request):
    model_manager = request.app.state.model_manager
    return {
        "status": "ok",
        "models": list(model_manager.models.keys()),
    }
```

여기서 알아둘 것이 하나 있습니다. uvicorn은 lifespan startup을 **소켓을 열기 전에** 실행합니다. 그래서 모델을 로딩하는 동안에는 포트 자체가 닫혀 있고, readiness probe는 이 엔드포인트에 닿지도 못한 채 connection refused로 실패합니다. 결과적으로 로딩이 끝날 때까지 트래픽이 오지 않는데, 그 이유가 `/health`의 응답 내용이 아니라 **포트가 아직 안 열렸기 때문**입니다. 그렇다면 이 엔드포인트의 값어치는 무엇인가 하면, 뜬 뒤에 어떤 모델이 올라와 있는지 확인하는 것입니다. 블루-그린 배포에서 모델 버전을 대조할 때 쓰입니다.

## Lifespan 리소스를 엔드포인트에서 사용하기

### app.state 활용

지금까지 `app.state`에 리소스를 저장해왔습니다. 엔드포인트에서는 `Request` 객체를 통해 접근합니다.

```python
from fastapi import FastAPI, Request, Depends

async def get_db_session(request: Request):
    session_factory = request.app.state.db_session_factory
    async with session_factory() as session:
        yield session

@app.get("/users")
async def list_users(session = Depends(get_db_session)):
    result = await session.execute(select(User))
    return result.scalars().all()
```

`Depends` 함수 안에서 `request.app.state`를 통해 리소스에 접근하는 패턴입니다. 엔드포인트는 세션이 어디서 왔는지 모른 채 받아 쓰기만 하는데, "의존성을 외부에서 주입받는다"는 원칙이 리소스 레벨에서도 그대로 성립하는 셈입니다. 다만 `app.state`는 타입 힌트가 없다는 약점이 있습니다.

:::info

**참고**

`app.state`는 Starlette의 `State` 객체로, 임의의 속성을 자유롭게 추가할 수 있습니다. 편리하지만 타입 힌트가 없어서 IDE 자동완성이 동작하지 않는 것은 단점입니다.

:::

### dependency-injector Container 연동

`dependency-injector` 같은 DI 컨테이너와 lifespan을 결합하면 그 부분을 보완할 수 있습니다. 핵심은 **2단계 초기화** 패턴입니다.

**1단계: Container에서 placeholder 정의**

```python
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    # lifespan에서 실제 인스턴스로 교체될 placeholder
    model_manager = providers.Object(None)

    settings = providers.Singleton(get_settings)

    scoring_service = providers.Singleton(
        ScoringService,
        model_manager=model_manager,  # placeholder 주입
    )
```

**2단계: lifespan에서 실제 인스턴스 주입**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    container: Container = app.container

    model_manager = ModelManager()
    model_manager.load_all_models()

    # placeholder를 실제 인스턴스로 교체
    container.model_manager.override(model_manager)
    app.state.model_manager = model_manager

    yield

    # 리소스 정리 (Resource provider가 있을 때만 awaitable을 돌려줍니다)
    container.shutdown_resources()
```

Container 선언 시점에는 `providers.Object(None)`으로 자리를 잡아두고, lifespan에서 실제 객체를 `override()`로 주입합니다. 이후 `ScoringService`나 다른 서비스가 `model_manager`를 주입받으면, lifespan에서 초기화한 실제 인스턴스가 전달됩니다.

## Graceful Degradation: 리소스별 실패 전략

모든 리소스가 동등하게 중요한 것은 아닙니다. **필수 리소스**와 **선택 리소스**를 구분하는 것이 운영의 핵심입니다.

| 구분 | 예시 | 실패 시 전략 |
|------|------|-------------|
| **필수** | ML 모델, 메인 DB | crash (롤아웃 중단, 기존 Pod 유지) |
| **선택** | 보조 DB, 외부 API, 캐시 | None 반환, 기능 비활성화 |

선택 리소스의 graceful degradation 패턴은 이렇습니다.

```python
import logging

logger = logging.getLogger(__name__)

def create_optional_connection(url: str, name: str):
    """선택 리소스 연결. 실패 시 None 반환."""
    try:
        return create_connection(url)
    except Exception:
        logger.exception("%s 연결 실패, 해당 기능 비활성화", name)
        return None
```

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 필수: 실패하면 crash (yield에 도달 못함)
    model_manager = ModelManager()
    model_manager.load_all_models()
    app.state.model_manager = model_manager

    # 선택: 실패해도 None으로 계속 진행
    cms_client = create_optional_connection(settings.cms_url, "CMS MySQL")
    app.state.cms_client = cms_client

    try:
        yield
    finally:
        if cms_client:
            cms_client.close()
```

:::warning

**주의**

모든 리소스를 graceful하게 처리하면 안 됩니다. 핵심 리소스(ML 모델, 메인 DB) 초기화가 실패했는데 서버가 뜨면, 모든 요청이 500 에러를 반환하는 좀비 상태가 됩니다. **핵심 리소스 실패는 빠르게 crash하는 것이 운영상 안전합니다.**

:::

## 프로젝트 구조에서 lifespan의 위치

lifespan 함수가 짧을 때는 `main.py`에 두면 됩니다. 하지만 리소스가 늘어나 30줄을 넘어가면 별도 파일로 분리하는 것이 깔끔합니다.

```text
app/
├── main.py              # create_app() + 라우터 등록
├── lifespan.py          # lifespan 함수
├── container.py         # DI Container
├── settings.py          # BaseSettings
├── scoring/
│   ├── model_manager.py # ML 모델 관리
│   ├── service.py
│   └── controller.py
└── health/
    └── controller.py    # /health, /admin/reload-models
```

```python
# main.py
from fastapi import FastAPI
from app.lifespan import lifespan
from app.container import Container

def create_app() -> FastAPI:
    container = Container()
    app = FastAPI(lifespan=lifespan)
    app.container = container
    app.include_router(health_router)
    app.include_router(scoring_router)
    return app

app = create_app()
```

`main.py`는 앱 생성과 라우터 등록에만 집중하고, 리소스 초기화는 `lifespan.py`가 담당합니다. 프로젝트 구조를 짤 때 지키는 관심사의 분리 원칙이 여기서도 그대로 적용됩니다.

## 테스트에서 Lifespan 다루기

`TestClient`를 사용할 때 한 가지 함정이 있습니다.

```python
# ❌ 이러면 lifespan이 실행되지 않음
client = TestClient(app)
response = client.get("/health")

# ✅ with 문으로 감싸야 lifespan이 실행됨
with TestClient(app) as client:
    response = client.get("/health")
    assert response.status_code == 200
```

:::warning

**주의**

`with` 없이 `TestClient`를 사용하면 lifespan 이벤트가 실행되지 않습니다. 반드시 context manager로 사용해야 합니다.

:::

pytest fixture로 만들면 모든 테스트에서 재사용할 수 있습니다.

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert "models" in response.json()

def test_predict(client):
    response = client.post("/predict", json={"features": [1.0, 2.0]})
    assert response.status_code == 200
```

테스트에서 무거운 리소스(ML 모델 등)를 실제로 로딩하고 싶지 않다면, lifespan을 오버라이드하거나 모델 매니저를 mock으로 교체하는 방법도 있습니다.

## 마치며

- **Lifespan**은 `@asynccontextmanager` + `yield`로 앱의 시작과 종료를 하나의 함수에서 관리하는 구조
- `on_event`는 deprecated이므로 새 프로젝트에서는 lifespan 사용
- DB 커넥션 풀, Redis, HTTP 클라이언트 등 **비싼 리소스**는 lifespan에서 한 번 초기화하고 재사용
- ML 모델은 **eager loading** 패턴으로 startup에서 모두 로드하고, hot reload로 런타임 교체
- `app.state` 또는 DI Container의 `override()`로 리소스를 엔드포인트에 전달
- 필수 리소스 실패는 crash, 선택 리소스는 graceful degradation
- 리소스의 **초기화와 정리를 같은 함수 안**에 두는 것이 lifespan의 핵심 이득

경험상, lifespan에서 가장 까다로운 부분은 구현이 아니라 **어떤 리소스를 여기서 관리할지 결정하는 것**입니다. 원칙은 단순합니다. 생성 비용이 높고, 모든 요청에서 재사용되며, 종료 시 정리가 필요한 것은 lifespan에 넣으면 됩니다.

## 함께 보면 좋은 글

- [Pydantic V2, FastAPI에서 제대로 쓰는 법](/fastapi/pydantic-v2-guide/)
- [FastAPI에서 의존성 주입을?](/fastapi/dependency-injector/)
- [FastAPI 프로젝트를 체계적으로 구조화하는 방법](/fastapi/how-to-structure-fastapi-projects/)

## 참고자료

- [FastAPI 공식 문서: Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI 공식 문서: Testing Events](https://fastapi.tiangolo.com/advanced/testing-events/)
- [Python 공식 문서: contextlib.asynccontextmanager](https://docs.python.org/3/library/contextlib.html#contextlib.asynccontextmanager)
- [Python 공식 문서: Python experimental support for free threading](https://docs.python.org/3/howto/free-threading-python.html)
- [Starlette Lifespan](https://www.starlette.io/lifespan/)
