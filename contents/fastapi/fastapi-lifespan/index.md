---
date: '2026-04-09'
title: 'FastAPI Lifespan으로 앱의 시작과 끝을 관리하는 법'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 6
tags: ['FastAPI', 'Lifespan', 'Python', 'asynccontextmanager', 'ML Serving']
summary: 'FastAPI의 Lifespan으로 ML 모델 로딩, DB 커넥션 풀, Redis 클라이언트 등 앱 리소스의 초기화와 정리를 한 곳에서 관리하는 방법을 다룬다.'
thumbnail: './fastapi-logo.png'
---

[이전 글](/fastapi/pydantic-v2-guide/)에서 `BaseSettings`로 환경 변수를 타입 안전하게 관리하는 방법을 다뤘습니다. 그런데 이 설정 객체는 **언제, 어디서** 만들어야 할까요? DB URL을 읽었다면 커넥션 풀은 어디서 초기화하고, ML 모델은 언제 메모리에 올려야 할까요?

이번 글에서는 FastAPI의 **Lifespan**을 다룹니다. 앱이 시작될 때 필요한 리소스를 준비하고, 종료될 때 깔끔하게 정리하는 구조를 하나의 함수 안에서 관리하는 방법입니다. [4편](/fastapi/dependency-injector/)에서 다룬 DI 컨테이너와 결합하면, 리소스 초기화부터 엔드포인트 주입까지 완전한 흐름이 만들어집니다.

## 애플리케이션에는 생명 주기가 있다

웹 애플리케이션은 시작, 요청 처리, 종료 — 세 단계의 생명 주기를 가집니다. 대부분의 시간은 요청 처리에 쓰이지만, **시작과 종료 시점에 해야 할 일**이 의외로 많습니다.

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

모델 로딩에 3초가 걸린다면, 모든 요청이 3초씩 느려집니다. DB 커넥션도 마찬가지입니다 — 매 요청마다 `create_engine()`을 호출하면 커넥션 풀의 이점을 전혀 누릴 수 없습니다. [4편에서 매 요청마다 새 인스턴스가 생성되는 문제](/fastapi/dependency-injector/)를 다뤘는데, 리소스 레벨에서도 동일한 문제가 발생하는 것입니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심</strong><br><br>
  앱 레벨 리소스(DB, 모델, 캐시)는 요청마다 생성하는 것이 아니라, <strong>앱의 시작/종료 시점에 한 번만</strong> 관리해야 합니다.
</div>

## 예전 방식 — on_event

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

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  <code>on_event</code>는 FastAPI 공식 문서에서 deprecated로 표기되어 있습니다. 새 프로젝트에서는 반드시 lifespan을 사용하세요.
</div>

## Lifespan — 시작과 끝을 하나로

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

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  lifespan 함수는 <code>app: FastAPI</code> 파라미터를 받습니다. 이를 통해 <code>app.state</code>에 리소스를 저장하거나, 앱 설정에 접근할 수 있습니다.
</div>

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

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 팁</strong><br>
  <code>try/finally</code>를 사용하면 Redis 초기화가 실패하더라도, 이미 연결된 DB 커넥션은 안전하게 정리됩니다. startup이 완전히 성공해야만 yield에 도달하므로, 불완전한 상태로 요청을 받는 일도 방지할 수 있습니다.
</div>

## 실전 패턴 — 리소스별 활용

실무에서 lifespan에 올리게 되는 리소스는 크게 세 종류입니다. DB 커넥션 풀, HTTP 클라이언트처럼 **앱 전역에서 재사용해야 하는 네트워크 리소스**, 그리고 ML 모델처럼 **로딩 자체가 무거워 요청 전에 반드시 준비되어야 하는 리소스**입니다. 앞의 둘은 모듈 레벨 전역 변수로도 동작은 하지만, lifespan에 올리면 초기화/정리가 한 곳에 모이고 테스트에서 교체하기도 쉬워집니다. 뒤의 ML 모델은 lifespan이 아니면 사실상 안전하게 관리하기 어렵고, 이 글 후반부에서 별도로 깊게 다룹니다. 먼저 흔한 리소스들부터 하나씩 살펴보겠습니다.

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

`session_factory`를 `app.state`에 저장해두면, Depends 함수에서 세션을 꺼내 쓸 수 있습니다. 이 구조는 [2편의 프로젝트 구조](/fastapi/how-to-structure-fastapi-projects/)에서 `database.py`로 분리하는 패턴과 자연스럽게 연결됩니다.

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

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심</strong><br><br>
  엔드포인트마다 <code>async with httpx.AsyncClient() as client:</code>를 쓰면 매 요청마다 TCP 연결을 새로 맺습니다. lifespan에서 하나 만들어 재사용하면 <strong>connection pooling</strong>이 동작해서 외부 API 호출 성능이 크게 개선됩니다.
</div>

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

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 팁</strong><br>
  리소스 정리 순서는 초기화의 역순이 안전합니다. 나중에 초기화된 리소스가 먼저 초기화된 리소스에 의존할 수 있기 때문입니다.
</div>

## ML 모델 서빙과 Lifespan

Lifespan이 가장 빛나는 순간은 **ML 모델을 서빙할 때**입니다. 모델은 로딩에 수 초가 걸리고, 메모리에 수백 MB를 차지하며, 한 번 로드하면 모든 요청에서 재사용해야 합니다. 실제 ML API 서버를 운영하면서 정립한 패턴을 공유합니다.

### Startup에서 모델 로딩

핵심은 **Eager Loading** — 모든 모델이 준비될 때까지 서버가 요청을 받지 않는 것입니다.

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

            # 원자적 교체 (GIL 덕분에 안전)
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

여기서 중요한 설계 판단이 하나 있습니다. **모델 로딩이 실패하면 서버를 crash시키는 것이 안전합니다.** `load_all_models()`에서 예외가 발생하면 `yield`에 도달하지 못하고, FastAPI는 시작에 실패합니다. Kubernetes 환경이라면 rolling update가 기존 정상 컨테이너를 유지해주므로, 불완전한 상태로 요청을 받는 것보다 훨씬 낫습니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>ML 모델은 startup에서 <strong>한 번만</strong> 로드하고 모든 요청에서 재사용</li>
    <li>모델 로딩 실패 시 서버를 crash시키는 것이 운영상 안전 (K8s rollback)</li>
    <li><code>self.models = new_models</code> — CPython에서 속성 할당은 GIL 덕분에 원자적</li>
  </ul>
</div>

### 모델 Hot Reload

모델을 업데이트할 때마다 서버를 재시작하는 것은 비효율적입니다. admin 엔드포인트로 런타임에 모델을 교체하는 패턴을 쓸 수 있습니다.

```python
class ModelManager:
    # ... (위의 코드에 이어서)

    def reload_models(self) -> dict:
        """서버 재시작 없이 모델 교체. 새 모델을 완성한 후 한 번에 교체."""
        if self.is_loading:
            raise RuntimeError("Model loading already in progress")

        old_versions = list(self.models.keys())
        start = time.time()
        self.load_all_models()

        return {
            "status": "success",
            "elapsed_seconds": round(time.time() - start, 2),
            "reloaded_models": old_versions,
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

`load_all_models()`가 새 dict(`new_models`)를 완성한 **후에** `self.models`에 할당하므로, 교체 순간까지 기존 모델로 정상 응답합니다. CPython의 GIL 덕분에 속성 할당은 원자적이라, 요청 처리 중에도 안전하게 모델을 바꿀 수 있습니다. (단, free-threaded Python 3.13+에서는 이 보장이 없으므로 별도 동기화가 필요합니다.)

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

Kubernetes의 readiness probe가 이 엔드포인트를 호출하면, 모델이 아직 로딩 중인 컨테이너에는 트래픽을 보내지 않습니다. 블루-그린 배포 시 모델 버전을 확인하는 데도 유용합니다.

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

`Depends` 함수 안에서 `request.app.state`를 통해 리소스에 접근하는 패턴입니다. [3편에서 다룬 DI의 핵심](/fastapi/dependency-injection/) — "의존성을 외부에서 주입받는다"는 원칙이 여기서도 동일하게 적용됩니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  <code>app.state</code>는 Starlette의 <code>State</code> 객체로, 임의의 속성을 자유롭게 추가할 수 있습니다. 편리하지만 타입 힌트가 없어서 IDE 자동완성이 동작하지 않는 것은 단점입니다.
</div>

### dependency-injector Container 연동

[4편](/fastapi/dependency-injector/)에서 다룬 `dependency-injector`와 lifespan을 결합하면 타입 안전성 문제를 해결할 수 있습니다. 핵심은 **2단계 초기화** 패턴입니다.

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

    # 리소스 정리
    await container.shutdown_resources()
```

Container 선언 시점에는 `providers.Object(None)`으로 자리를 잡아두고, lifespan에서 실제 객체를 `override()`로 주입합니다. 이후 `ScoringService`나 다른 서비스가 `model_manager`를 주입받으면, lifespan에서 초기화한 실제 인스턴스가 전달됩니다.

## Graceful Degradation — 리소스별 실패 전략

모든 리소스가 동등하게 중요한 것은 아닙니다. **필수 리소스**와 **선택 리소스**를 구분하는 것이 운영의 핵심입니다.

| 구분 | 예시 | 실패 시 전략 |
|------|------|-------------|
| **필수** | ML 모델, 메인 DB | crash → K8s rollback |
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
        logger.exception("%s 연결 실패 — 해당 기능 비활성화", name)
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

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  모든 리소스를 graceful하게 처리하면 안 됩니다. 핵심 리소스(ML 모델, 메인 DB) 초기화가 실패했는데 서버가 뜨면, 모든 요청이 500 에러를 반환하는 좀비 상태가 됩니다. <strong>핵심 리소스 실패는 빠르게 crash하는 것이 운영상 안전합니다.</strong>
</div>

## 프로젝트 구조에서 lifespan의 위치

lifespan 함수가 짧을 때는 `main.py`에 두면 됩니다. 하지만 리소스가 늘어나 30줄을 넘어가면 별도 파일로 분리하는 것이 깔끔합니다.

```
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

`main.py`는 앱 생성과 라우터 등록에만 집중하고, 리소스 초기화는 `lifespan.py`가 담당합니다. [2편에서 다룬 관심사의 분리](/fastapi/how-to-structure-fastapi-projects/) 원칙이 여기서도 적용됩니다.

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

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  <code>with</code> 없이 <code>TestClient</code>를 사용하면 lifespan 이벤트가 실행되지 않습니다. 반드시 context manager로 사용해야 합니다.
</div>

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

## 정리

- **Lifespan**은 `@asynccontextmanager` + `yield`로 앱의 시작과 종료를 하나의 함수에서 관리하는 구조
- `on_event`는 deprecated — 새 프로젝트에서는 lifespan 사용
- DB 커넥션 풀, Redis, HTTP 클라이언트 등 **비싼 리소스**는 lifespan에서 한 번 초기화하고 재사용
- ML 모델은 **eager loading** 패턴으로 startup에서 모두 로드하고, hot reload로 런타임 교체
- `app.state` 또는 DI Container의 `override()`로 리소스를 엔드포인트에 전달
- 필수 리소스 실패 → crash, 선택 리소스 → graceful degradation
- **Settings → Lifespan → Depends**가 FastAPI 앱의 표준 흐름

경험상, lifespan에서 가장 까다로운 부분은 구현이 아니라 **어떤 리소스를 여기서 관리할지 결정하는 것**입니다. 원칙은 단순합니다 — 생성 비용이 높고, 모든 요청에서 재사용되며, 종료 시 정리가 필요한 것은 lifespan에 넣으면 됩니다.

## 참고자료

- [FastAPI 공식 문서: Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI 공식 문서: Testing Events](https://fastapi.tiangolo.com/advanced/testing-events/)
- [Python 공식 문서: contextlib.asynccontextmanager](https://docs.python.org/3/library/contextlib.html#contextlib.asynccontextmanager)
- [Starlette Lifespan](https://www.starlette.io/lifespan/)
