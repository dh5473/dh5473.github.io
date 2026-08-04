---
date: '2026-04-08'
title: 'Pydantic V2, FastAPI에서 제대로 쓰는 법'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 5
tags: ['FastAPI', 'Pydantic', 'Pydantic V2', 'Python', 'Validation']
summary: 'FastAPI의 데이터 검증과 직렬화를 담당하는 Pydantic V2의 핵심 기능을 실무 관점에서 정리합니다. validator, model_dump, computed_field, BaseSettings까지 실전 패턴을 코드와 함께 다룹니다.'
thumbnail: './fastapi-logo.png'
---

FastAPI의 장점으로 흔히 속도, 타입, 문서 세 가지가 꼽힙니다. 이 중 타입과 관련된 거의 모든 것을 담당하는 것이 바로 **Pydantic**입니다. 요청 데이터 검증, 응답 직렬화, 환경 변수 관리까지 전부 Pydantic의 일이라, FastAPI를 쓴다는 것은 결국 Pydantic을 쓴다는 것과 같습니다.

Pydantic V2는 내부 코어를 Rust(pydantic-core)로 재작성하면서 V1 대비 **4~50배 빠른 성능**(일반적인 모델 기준 약 17배)을 달성했고, API도 상당히 변경되었습니다. FastAPI 0.100 이상에서는 Pydantic V2가 기본입니다. 이번 글에서는 FastAPI 개발자가 실무에서 자주 사용하게 될 Pydantic V2의 핵심 기능들을 정리해보겠습니다.

## BaseModel 기본기

Pydantic의 모든 것은 `BaseModel`에서 시작합니다. 클래스를 정의하고 타입 힌트를 달면, 그것이 곧 스키마가 됩니다.

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str
    age: int
    email: str | None = None
```

이 세 줄로 Pydantic은 다음을 자동으로 처리합니다.

- `name`에 문자열이 아닌 값이 들어오면 **ValidationError** 발생
- `age`에 `"25"`가 들어오면 자동으로 `int(25)`로 **타입 강제 변환**(coercion)
- `email`은 선택 필드이며, 생략 시 `None`

```python
user = User(name="강돈혁", age="25")
print(user.age)        # 25 (int)
print(user.email)      # None
print(user.model_dump())
# {'name': '강돈혁', 'age': 25, 'email': None}
```

### Field로 제약 조건 걸기

단순 타입 힌트만으로는 부족한 경우가 많습니다. `Field`를 사용하면 세밀한 제약 조건을 정의할 수 있습니다.

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: int = Field(gt=0, description="상품 가격 (원)")
    tags: list[str] = Field(default_factory=list, max_length=10)
```

`Field`에 넣은 `description`은 FastAPI의 Swagger 문서에 그대로 반영됩니다. 즉, 모델 정의가 곧 API 문서가 되는 것입니다. 자주 쓰이는 제약 조건들을 정리하면 다음과 같습니다.

| 제약 조건 | 대상 타입 | 설명 |
|---|---|---|
| `gt`, `ge`, `lt`, `le` | 숫자 | 초과, 이상, 미만, 이하 |
| `min_length`, `max_length` | 문자열, 리스트 | 최소/최대 길이 |
| `pattern` | 문자열 | 정규식 패턴 매칭 |
| `default_factory` | 모든 타입 | mutable 기본값 안전 생성 |
| `alias` | 모든 타입 | 외부 필드명 매핑 |
| `exclude` | 모든 타입 | 직렬화 시 제외 |

### model_config: 모델 전역 설정

V1에서는 내부 `class Config`를 사용했지만, V2에서는 `model_config` 딕셔너리로 변경되었습니다.

```python
from pydantic import BaseModel, ConfigDict

class StrictUser(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        strict=True,
        frozen=True,
    )

    name: str
    age: int
```

자주 사용하는 설정들입니다.

| 설정 | 기본값 | 설명 |
|---|---|---|
| `strict` | `False` | `True`면 타입 강제 변환 비활성화 (문자열 "25" → int 변환 거부) |
| `frozen` | `False` | `True`면 인스턴스 불변(immutable). 속성 변경 시 에러 |
| `str_strip_whitespace` | `False` | 문자열 앞뒤 공백 자동 제거 |
| `populate_by_name` | `False` | alias와 원래 필드명 모두 허용 |
| `use_enum_values` | `False` | Enum 필드에서 `.value`를 자동 추출 |

`strict=True`는 전역으로 걸 수도 있고, 특정 필드에만 적용할 수도 있습니다. FastAPI에서는 보통 전역 strict보다는 **필요한 필드에만** strict를 거는 것이 실용적입니다. 예를 들어, 쿼리 파라미터는 항상 문자열로 들어오기 때문에 전역 strict를 걸면 타입 변환이 안 되어 오히려 불편해집니다.

```python
from pydantic import BaseModel, Field
from typing import Annotated

class Order(BaseModel):
    user_id: Annotated[int, Field(strict=True)]  # 이 필드만 strict
    quantity: int  # "3" → 3 변환 허용
```

## Validator: 검증 로직 커스터마이징

타입 힌트와 `Field`만으로 검증할 수 없는 경우가 많습니다. 비밀번호 강도 검사, 이메일 형식 검증, 필드 간 상호 의존성 검증 등이 그렇습니다. Pydantic V2는 `field_validator`와 `model_validator` 두 가지 데코레이터를 제공합니다.

### field_validator: 필드 단위 검증

```python
from pydantic import BaseModel, field_validator

class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_must_be_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("영문, 숫자만 허용됩니다")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("8자 이상이어야 합니다")
        if not any(c.isupper() for c in v):
            raise ValueError("대문자를 1개 이상 포함해야 합니다")
        return v
```

V1의 `@validator`와 비교하면 몇 가지 중요한 차이가 있습니다.

- 첫 인자가 `cls`인 **클래스 메서드**로 동작합니다. `self`를 쓰면 에러입니다
- `values` 딕셔너리 대신 `info` 파라미터로 다른 필드에 접근합니다
- `pre=True` 대신 `mode="before"`를 사용합니다

`@classmethod`를 붙이는 관례가 널리 퍼져 있는데, 실은 필수가 아닙니다. Pydantic 소스의 `field_validator`는 시그니처를 보고 클래스 메서드로 자동 변환합니다.

```python
# pydantic/functional_validators.py
if _decorators.is_instance_method_from_sig(f):
    raise PydanticUserError(
        'The `@field_validator` decorator cannot be applied to instance methods',
        code='validator-instance-method',
    )

# auto apply the @classmethod decorator
f = _decorators.ensure_classmethod_based_on_signature(f)
```

진짜 규칙은 그 위의 `raise`입니다. 첫 인자를 `self`로 쓰면 `PydanticUserError`가 나고, `cls`로 쓰면 `@classmethod`가 있든 없든 동작합니다. 그럼에도 붙이는 이유는 mypy나 IDE가 `cls`를 제대로 인식하게 하기 위해서입니다. 관례를 따르되, 빠뜨렸다고 동작이 깨지지는 않습니다.

```python
class UserProfile(BaseModel):
    name: str
    email: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        """타입 변환 전에 실행되는 before 모드"""
        if isinstance(v, str):
            return v.lower().strip()
        return v
```

`mode="before"`는 Pydantic의 타입 변환이 일어나기 **전에** 실행됩니다. 원시 입력값을 전처리할 때 유용합니다. 기본값인 `mode="after"`는 타입 변환이 완료된 이후에 실행되므로, 이미 올바른 타입임이 보장된 상태에서 검증 로직만 작성하면 됩니다.

before와 after가 헷갈린다면, 무엇을 기준으로 앞뒤인지를 붙잡으면 됩니다. 기준은 **타입 강제 변환**입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 388" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="요청 JSON이 mode before 검증, 타입 강제 변환, mode after 검증을 차례로 지나 모델 인스턴스가 되고 field_serializer를 거쳐 응답으로 나가는 순서도">
<style>
.pv-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.pv-io { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.pv-hook { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.6; }
.pv-core { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.8; }
.pv-obj { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.6; }
.pv-iot { font-size: 15px; fill: var(--text, #1c1917); }
.pv-ht { font-size: 15px; font-weight: 600; fill: var(--primary, #0a756c); }
.pv-ct { font-size: 15px; font-weight: 700; fill: var(--accent, #9d5604); }
.pv-ot { font-size: 15px; font-weight: 600; fill: var(--text, #1c1917); }
.pv-note { font-size: 14px; fill: var(--text-muted, #6d6762); }
.pv-edge { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
</style>
<defs>
<marker id="pvArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<text class="pv-title" x="200" y="20" text-anchor="middle">검증이 지나가는 순서</text>
<path class="pv-edge" d="M122,82 L122,94" marker-end="url(#pvArrow)"/>
<path class="pv-edge" d="M122,140 L122,152" marker-end="url(#pvArrow)"/>
<path class="pv-edge" d="M122,198 L122,210" marker-end="url(#pvArrow)"/>
<path class="pv-edge" d="M122,256 L122,268" marker-end="url(#pvArrow)"/>
<path class="pv-edge" d="M122,314 L122,326" marker-end="url(#pvArrow)"/>
<rect class="pv-io" x="8" y="38" width="228" height="44" rx="8"/>
<text class="pv-iot" x="122" y="66" text-anchor="middle">요청 JSON</text>
<rect class="pv-hook" x="8" y="96" width="228" height="44" rx="8"/>
<text class="pv-ht" x="122" y="124" text-anchor="middle">mode="before"</text>
<text class="pv-note" x="246" y="124" text-anchor="start">raw 값 그대로</text>
<rect class="pv-core" x="8" y="154" width="228" height="44" rx="8"/>
<text class="pv-ct" x="122" y="182" text-anchor="middle">타입 강제 변환</text>
<text class="pv-note" x="246" y="182" text-anchor="start">Rust 코어</text>
<rect class="pv-hook" x="8" y="212" width="228" height="44" rx="8"/>
<text class="pv-ht" x="122" y="240" text-anchor="middle">mode="after"</text>
<text class="pv-note" x="246" y="240" text-anchor="start">타입 보장됨</text>
<rect class="pv-obj" x="8" y="270" width="228" height="44" rx="8"/>
<text class="pv-ot" x="122" y="298" text-anchor="middle">모델 인스턴스</text>
<text class="pv-note" x="246" y="298" text-anchor="start">self 접근 가능</text>
<rect class="pv-hook" x="8" y="328" width="228" height="44" rx="8"/>
<text class="pv-ht" x="122" y="356" text-anchor="middle">field_serializer</text>
<text class="pv-note" x="246" y="356" text-anchor="start">응답 JSON으로</text>
</svg>
</div>

`model_validator`의 before/after도 같은 선을 기준으로 갈리는데, 다만 이쪽은 필드 하나가 아니라 모델 전체를 놓고 앞뒤가 나뉩니다.

### model_validator: 모델 전체 검증

필드 간 상호 의존적인 검증이 필요할 때 사용합니다.

```python
from datetime import date
from pydantic import BaseModel, model_validator

class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_date_order(self) -> "DateRange":
        if self.start_date >= self.end_date:
            raise ValueError("end_date는 start_date보다 이후여야 합니다")
        return self
```

`model_validator`의 `mode="after"`에서는 `self`를 통해 **이미 생성된 모델 인스턴스**에 접근할 수 있습니다. 반면 `mode="before"`는 아직 모델이 생성되기 전이므로 raw 딕셔너리를 받습니다.

```python
class APIRequest(BaseModel):
    auth_type: str
    api_key: str | None = None
    username: str | None = None
    password: str | None = None

    @model_validator(mode="before")
    @classmethod
    def check_auth_fields(cls, data: dict) -> dict:
        auth_type = data.get("auth_type")
        if auth_type == "api_key" and not data.get("api_key"):
            raise ValueError("api_key 인증에는 api_key가 필수입니다")
        if auth_type == "basic":
            if not data.get("username") or not data.get("password"):
                raise ValueError("basic 인증에는 username, password가 필수입니다")
        return data
```

`mode="before"`는 `@classmethod`를 사용하고 `dict`를 받는 반면, `mode="after"`는 인스턴스 메서드로 `self`를 받는다는 차이가 핵심입니다.

## 직렬화: model_dump과 커스터마이징

FastAPI에서 응답을 반환할 때 Pydantic 모델은 자동으로 JSON 직렬화됩니다. 하지만 직렬화를 직접 제어해야 할 때가 있습니다.

### model_dump: 딕셔너리 변환

V1의 `.dict()`가 V2에서 `.model_dump()`로 변경되었습니다.

```python
class UserResponse(BaseModel):
    id: int
    name: str
    email: str | None = None
    internal_score: float = Field(exclude=True)

user = UserResponse(id=1, name="강돈혁", email=None, internal_score=0.95)

# 기본 변환
user.model_dump()
# {'id': 1, 'name': '강돈혁', 'email': None}
# → internal_score는 exclude=True이므로 제외됨

# None 값 제외
user.model_dump(exclude_none=True)
# {'id': 1, 'name': '강돈혁'}

# 특정 필드만 포함
user.model_dump(include={"id", "name"})
# {'id': 1, 'name': '강돈혁'}
```

`model_dump_json()`은 딕셔너리를 거치지 않고 **직접 JSON 문자열로 변환**합니다. 내부적으로 Rust 코어가 처리하므로 `json.dumps(model.model_dump())`보다 훨씬 빠릅니다.

```python
user.model_dump_json()
# '{"id":1,"name":"강돈혁","email":null}'
```

### field_serializer: 필드별 직렬화 커스터마이징

날짜, Enum, Decimal 등 기본 직렬화가 원하는 포맷과 다를 때 사용합니다.

```python
from datetime import datetime
from pydantic import BaseModel, field_serializer

class Event(BaseModel):
    name: str
    created_at: datetime

    @field_serializer("created_at")
    def serialize_dt(self, dt: datetime, _info) -> str:
        return dt.strftime("%Y-%m-%d %H:%M")

event = Event(name="배포", created_at=datetime(2026, 4, 8, 14, 30))
event.model_dump()
# {'name': '배포', 'created_at': '2026-04-08 14:30'}
```

FastAPI에서 응답이 나갈 때도 이 직렬화가 적용되므로, 모델에 한 번 정의해두면 어디서든 일관된 포맷을 보장할 수 있습니다.

## computed_field: 계산된 필드

DB에는 없지만 API 응답에는 포함해야 하는 필드가 있습니다. 예를 들어, `first_name`과 `last_name`은 저장하되, `full_name`은 응답에만 포함하고 싶은 경우입니다.

```python
from pydantic import BaseModel, computed_field

class UserProfile(BaseModel):
    first_name: str
    last_name: str
    birth_year: int

    @computed_field
    @property
    def full_name(self) -> str:
        return f"{self.last_name}{self.first_name}"

    @computed_field
    @property
    def age(self) -> int:
        from datetime import datetime
        return datetime.now().year - self.birth_year

profile = UserProfile(first_name="돈혁", last_name="강", birth_year=1995)
profile.model_dump()
# {'first_name': '돈혁', 'last_name': '강', 'birth_year': 1995,
#  'full_name': '강돈혁', 'age': 31}  # age는 현재 연도 기준 계산
```

`@computed_field`는 `@property`와 함께 사용해야 하며, `model_dump()`에 포함됩니다. JSON Schema에는 **직렬화 스키마에만** 들어갑니다. `model_json_schema()`의 기본값인 검증 스키마에는 나타나지 않고 `mode="serialization"`에서만 `readOnly`로 보입니다. FastAPI로 치면 응답 모델 스키마에는 있고 요청 본문 스키마에는 없다는 뜻입니다.

V1에서는 `@property`를 사용하면 직렬화에 포함되지 않아서 `@validator`로 우회하거나, `dict()` 이후 수동으로 추가해야 했습니다. `@computed_field`는 이 문제를 근본적으로 해결합니다.

## Annotated 패턴: 재사용 가능한 타입

같은 검증 로직을 여러 모델에서 반복 작성하는 것은 비효율적입니다. `Annotated`를 활용하면 검증 규칙을 타입으로 만들어 재사용할 수 있습니다.

```python
from typing import Annotated
from pydantic import Field

# 재사용 가능한 타입 정의
UserId = Annotated[int, Field(gt=0, description="사용자 ID")]
Username = Annotated[str, Field(min_length=3, max_length=20, pattern=r"^[a-zA-Z0-9_]+$")]
Email = Annotated[str, Field(max_length=255, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")]
```

```python
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: Username
    email: Email

class UserUpdate(BaseModel):
    username: Username | None = None
    email: Email | None = None

class AdminCreate(BaseModel):
    user_id: UserId
    username: Username
    email: Email
    role: str
```

세 모델 모두 동일한 검증 규칙을 공유합니다. 검증 규칙을 바꿀 때도 타입 정의 한 곳만 수정하면 됩니다. 이 패턴은 FastAPI의 쿼리 파라미터에서도 동일하게 적용됩니다.

```python
from typing import Annotated
from fastapi import FastAPI, Query

app = FastAPI()

PageSize = Annotated[int, Query(ge=1, le=100, description="페이지당 항목 수")]
PageNumber = Annotated[int, Query(ge=1, description="페이지 번호")]

@app.get("/users")
def list_users(page: PageNumber = 1, size: PageSize = 20):
    return {"page": page, "size": size}
```

## Discriminated Union: 타입별 분기 처리

API에서 요청 본문의 구조가 특정 필드 값에 따라 달라지는 경우가 있습니다. 예를 들어 알림 설정에서 채널 타입에 따라 필요한 필드가 다른 경우입니다.

```python
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class EmailNotification(BaseModel):
    channel: Literal["email"]
    to: str
    subject: str

class SlackNotification(BaseModel):
    channel: Literal["slack"]
    webhook_url: str

class SMSNotification(BaseModel):
    channel: Literal["sms"]
    phone: str

Notification = Annotated[
    Union[EmailNotification, SlackNotification, SMSNotification],
    Field(discriminator="channel")
]
```

```python
from fastapi import FastAPI

app = FastAPI()

@app.post("/notifications")
def send_notification(notification: Notification):
    match notification:
        case EmailNotification():
            return {"type": "email", "to": notification.to}
        case SlackNotification():
            return {"type": "slack", "url": notification.webhook_url}
        case SMSNotification():
            return {"type": "sms", "phone": notification.phone}
```

`discriminator`를 지정하면 Pydantic이 `channel` 값을 먼저 확인하고, 해당하는 모델로 바로 검증합니다. 이렇게 하면 두 가지 이점이 있습니다.

- **성능**: 모든 Union 타입을 순서대로 시도하는 대신, `channel` 값으로 즉시 분기
- **에러 메시지**: `channel`이 유효하지 않으면 어떤 값이 허용되는지 명확한 에러 반환

FastAPI의 Swagger 문서에서도 각 타입이 별도의 스키마로 표시되어, API 사용자가 어떤 필드를 보내야 하는지 한눈에 파악할 수 있습니다.

## BaseSettings: 환경 변수 관리

FastAPI 프로젝트에서 환경 변수를 관리할 때 `os.environ`을 직접 읽는 것은 타입 안전성이 없고 유효성 검증도 불가능합니다. Pydantic의 `BaseSettings`를 사용하면 환경 변수도 모델처럼 관리할 수 있습니다.

V2에서 `BaseSettings`는 별도 패키지로 분리되었으므로 따로 설치해야 합니다.

```bash
pip install pydantic-settings
```

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "MyApp"
    debug: bool = False
    database_url: str
    redis_url: str = "redis://localhost:6379"
    allowed_origins: list[str] = ["http://localhost:3000"]
```

`.env` 파일에서 자동으로 값을 읽고, 타입 변환과 검증까지 처리합니다.

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
DEBUG=true
ALLOWED_ORIGINS=["http://localhost:3000","https://example.com"]
```

```python
settings = Settings()
print(settings.debug)            # True (str → bool 자동 변환)
print(settings.allowed_origins)  # ['http://localhost:3000', 'https://example.com']
```

FastAPI에서는 보통 `Depends`와 결합하여 설정을 주입합니다. `lru_cache`로 감싸서 싱글톤처럼 사용하는 것이 일반적인 패턴입니다.

```python
from functools import lru_cache
from fastapi import FastAPI, Depends

app = FastAPI()

@lru_cache
def get_settings() -> Settings:
    return Settings()

@app.get("/info")
def app_info(settings: Settings = Depends(get_settings)):
    return {
        "app_name": settings.app_name,
        "debug": settings.debug,
    }
```

### 중첩 환경 변수

설정이 복잡해지면 중첩 구조가 필요합니다. `env_nested_delimiter`를 사용하면 구분자 기반으로 중첩된 환경 변수를 매핑할 수 있습니다. 보통 `__`(더블 언더스코어)를 사용합니다.

```python
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

class DatabaseConfig(BaseModel):
    host: str = "localhost"
    port: int = 5432
    name: str = "mydb"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_nested_delimiter="__",
    )

    database: DatabaseConfig = DatabaseConfig()
```

```bash
# .env
DATABASE__HOST=prod-db.example.com
DATABASE__PORT=5432
DATABASE__NAME=production
```

## TypeAdapter: 모델 없이 검증하기

BaseModel을 만들기 애매한 경우가 있습니다. 단순한 리스트나 딕셔너리를 검증하고 싶을 때, `TypeAdapter`를 사용하면 모델 없이도 Pydantic의 검증과 직렬화를 활용할 수 있습니다.

```python
from pydantic import TypeAdapter

# 정수 리스트 검증
int_list_adapter = TypeAdapter(list[int])

result = int_list_adapter.validate_python(["1", "2", "3"])
print(result)  # [1, 2, 3]

# 유효하지 않은 입력
try:
    int_list_adapter.validate_python(["a", "b"])
except Exception as e:
    print(e)  # validation error
```

실무에서는 외부 API 응답을 파싱하거나, 벌크 데이터를 검증할 때 유용합니다.

```python
from pydantic import BaseModel, TypeAdapter

class UserSummary(BaseModel):
    id: int
    name: str

# 외부 API에서 받은 JSON 리스트를 검증
users_adapter = TypeAdapter(list[UserSummary])

raw_data = [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"},
]

users = users_adapter.validate_python(raw_data)
# [UserSummary(id=1, name='Alice'), UserSummary(id=2, name='Bob')]

# JSON 문자열에서 직접 파싱
json_str = '[{"id": 1, "name": "Alice"}]'
users = users_adapter.validate_json(json_str)
```

`validate_json()`은 JSON 문자열을 Python 객체로 변환하고 검증까지 한 번에 처리합니다. `json.loads()` + `validate_python()` 조합보다 빠릅니다. Rust 코어에서 JSON 파싱과 검증을 동시에 수행하기 때문입니다.

## V1에서 V2로: 주요 마이그레이션 포인트

기존 프로젝트를 유지보수하거나 V1 코드를 참고할 때 알아두어야 할 핵심 변경 사항들입니다.

| V1 | V2 | 비고 |
|---|---|---|
| `class Config:` | `model_config = ConfigDict(...)` | 클래스 → 딕셔너리 |
| `.dict()` | `.model_dump()` | 메서드명 변경 |
| `.json()` | `.model_dump_json()` | 메서드명 변경 |
| `.parse_obj(data)` | `.model_validate(data)` | 메서드명 변경 |
| `.parse_raw(json_str)` | `.model_validate_json(json_str)` | 메서드명 변경 |
| `@validator` | `@field_validator` | 첫 인자는 `cls` (`@classmethod`는 관례) |
| `@root_validator` | `@model_validator` | 이름 변경 + `pre=True/False` → `mode="before"/"after"` |
| `from pydantic import BaseSettings` | `from pydantic_settings import BaseSettings` | 별도 패키지 분리 |
| `schema_extra` | `json_schema_extra` | JSON Schema 커스터마이징 |
| `orm_mode = True` | `from_attributes = True` | ORM 객체 → 모델 변환 |

특히 `from_attributes = True`는 SQLAlchemy나 SQLModel과 함께 사용할 때 필수적입니다. ORM 객체의 속성에 직접 접근하여 모델을 생성할 수 있게 해줍니다.

```python
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str

# SQLAlchemy 모델 인스턴스에서 바로 변환
user_response = UserResponse.model_validate(db_user)
```

## 마치며

Pydantic V2의 핵심을 요약하면 다음과 같습니다.

- **BaseModel + Field**: 타입 힌트와 제약 조건만으로 스키마 정의. FastAPI 문서에 자동 반영
- **field_validator / model_validator**: before/after 모드로 세밀한 검증 로직 작성
- **model_dump + field_serializer**: 직렬화를 모델 안에서 완전히 제어
- **computed_field**: DB에 없는 파생 필드를 스키마에 포함
- **Annotated 패턴**: 검증 규칙을 재사용 가능한 타입으로 추출
- **Discriminated Union**: 필드 값 기반의 효율적인 타입 분기
- **BaseSettings**: 환경 변수를 타입 안전하게 관리
- **TypeAdapter**: 모델 없이도 검증과 직렬화 가능

Pydantic은 FastAPI에서 "데이터가 들어오고 나가는" 모든 지점을 관장합니다. V2의 기능들을 잘 활용하면, 검증 로직을 엔드포인트 바깥으로 밀어내고 비즈니스 로직에만 집중할 수 있습니다.

## 함께 보면 좋은 글

- [FastAPI를 선택해야만 하는 이유](/fastapi/why-fastapi/)
- [FastAPI Lifespan으로 앱의 시작과 끝을 관리하는 법](/fastapi/fastapi-lifespan/)
- [FastAPI 422? 라우팅 순서부터 확인하기](/fastapi/fastapi-routing-pitfalls/)

## 참고자료

- [Pydantic V2 발표 글](https://docs.pydantic.dev/latest/blog/pydantic-v2/) - 4~50배 성능 수치의 출처
- [Pydantic 공식 문서: Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [Pydantic 공식 문서: Serialization](https://docs.pydantic.dev/latest/concepts/serialization/)
- [pydantic-settings 공식 문서](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [Pydantic V1 to V2 Migration Guide](https://docs.pydantic.dev/latest/migration/)
