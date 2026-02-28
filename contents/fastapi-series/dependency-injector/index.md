---
date: '2025-08-02'
title: 'FastAPI에서 의존성 주입을?'
category: 'FastAPI'
series: 'fastapi-series'
seriesOrder: 4
summary: 'FastAPI에서 제공하는 의존성 주입(Dependency Injection) 기능의 실제 활용법과 한계, 그리고 더 확장된 DI 설계 방법까지 단계별로 알아봅니다.'
thumbnail: './fastapi-logo.png'
---

# FastAPI에서 의존성 주입 활용하기

이전 글에서는 의존성 주입의 개념과 필요성 그리고 DIP와 IoC 같은 설계 원칙들을 살펴보았습니다. 사실 Java의 스프링 프레임워크는 DI를 프레임워크 차원에서 강력하게 지원하지만, Python 웹 프레임워크인 FastAPI는 간단한 의존성 주입 기능만을 제공합니다. 

Python은 언어 자체가 덕 타이핑(duck typing)을 따르기 때문에 인터페이스나 프로토콜을 강제하지 않고, 이로 인해 DI 구성을 체계적으로 적용하기가 더 어렵습니다.

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

이처럼 키워드 하나로 의존성 주입을 지원하지만, 간단한 만큼 한계도 명확합니다. 특히 프로젝트가 복잡해질수록 기본 기능으로는 해결할 수 없는 부분이 많습니다.

의존성 주입은 어떻게 주입할지(생성자, 수정자, 필드, 메서드 주입 등), 객체를 어디까지 공유할지(스코프), 객체가 언제 생성되고 사라지는지(생명 주기) 등 다양한 관점에서 다룰 수 있습니다. 다만 FastAPI에서는 기본적으로 함수 주입을 주로 지원하므로, 여기서는 객체의 스코프와 생명 주기를 중점으로 다뤄보겠습니다.

<div style="overflow-x: auto; margin: 24px 0;">
  <table style="width: 100%; max-width: 800px; margin: 0 auto; border-collapse: collapse; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
    <thead>
      <tr style="background-color: #e6e6fa; color: #4a4a4a;">
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 20%;">생명주기</th>
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 20%;">생성 시점</th>
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 25%;">재사용 범위</th>
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 35%;">사용 예시</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">Singleton</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">앱 시작 시 1회</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">전체 애플리케이션</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">설정 서비스, DB 커넥션 풀</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">Request Scoped</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">요청마다 1회</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">같은 요청 내에서 공유</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">사용자 컨텍스트, 감사 로깅</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; background-color: #f8f9fa; color: #495057;">Transient</td>
        <td style="padding: 16px 20px;">주입마다 매번</td>
        <td style="padding: 16px 20px;">재사용 없음</td>
        <td style="padding: 16px 20px;">임시 파일, 일회성 메시지 객체</td>
      </tr>
    </tbody>
  </table>
</div>

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

만약 위와 같은 복잡한 의존성 트리에서 B, D, E는 싱글톤, C는 요청 단위, F는 호출될 때마다 생성 등 각 객체가 다른 의존성 스코프를 가지고 있다면 어떻게 될까요?

이를 FastAPI의 `Depends`만으로 해결하려면 각각 팩토리 함수를 만들어야 하고, 중첩 의존성도 전부 명시해야 하고, 생명주기 관리를 위한 별도 로직도 필요합니다.

### 생명 주기 관리의 어려움

```python
class DatabaseConnection:
    def __init__(self):
        print("데이터베이스 연결 생성됨!")  # 언제 출력되는지 확인
        self.connection_id = id(self)

def get_db():
    return DatabaseConnection()

@app.get("/users")
def get_users(db: DatabaseConnection = Depends(get_db)):
    return {"connection_id": db.connection_id}
```

FastAPI의 기본 `Depends`는 **요청이 들어올 때마다 해당 함수를 호출해 새로운 인스턴스를 생성**합니다. 예를 들어 위 코드를 실행하고 `/users` 를 호출하면 “데이터베이스 연결 생성됨!”이 출력되고, connection_id가 할당될 것입니다.

이때 다시 한번  `/users` 를 호출한다면 다시 “데이터베이스 연결 생성됨!”이 출력되고, 이번에는 다른 connection_id가 할당됩니다.

즉, **매 요청마다 새로운 인스턴스**가 생성됩니다.

DB 연결이나 AI 모델 로드 등 매 요청마다 생성하면 리소스가 낭비되거나 여러 곳에서 재사용될 필요가 있는 객체들은 싱글톤으로 관리하는 것이 유리한데, 기본 DI로는 싱글톤을 구현하려면 전역 변수나 복잡한 패턴을 사용할 수 밖에 없습니다.

## Dependency Injector

앞서 살펴봤듯이 FastAPI의 기본 Depends는 간단하지만, 복잡한 구조에서는 사용하기 어렵습니다. 따라서 라이브러리를 활용해야하는데 보통은 python-dependency-injector를 사용합니다. 지원하는 다양한 기능 중 간단하고 실용적인 예시 몇 가지를 살펴보겠습니다.

### Singleton: 전역으로 1회 생성

```python
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

싱글톤을 활용하면 매번 새로운 인스턴스를 생성하는 것이 아니라 한 번 만들어두고 재사용이 가능합니다. DB 연결에도 활용할 수 있고, 프로젝트 내부 앱들이 다양할 경우 하나의 container 파일에서 각 앱들의 repository나 service 등을 싱글톤으로 관리하면 깔끔한 코드를 작성할 수 있습니다.

### Factory: 매번 새 인스턴스 생성

```python
import uuid

class RequestContext:
    def __init__(self):
        self.id = uuid.uuid4()

class Container(containers.DeclarativeContainer):
    context = providers.Factory(RequestContext)

container = Container()
ctx1 = container.context()
ctx2 = container.context()

assert ctx1 is not ctx2  # 서로 다른 인스턴스
```

팩토리를 활용하면 매 요청마다 새로운 인스턴스를 생성할 수 있습니다. 사용자 컨텍스트나 일회성 객체가 필요한 경우 활용할 수 있습니다.

### Router에 주입하기

```python
@user_router.post("/users")
@inject  # 의존성 주입 활성화 데코레이터
async def create_user(
    request: CreateUserRequest,
    user_service: UserService = Depends(Provide[Container.user_service]),
):
    user = await user_service.create_user(request)
    return CreateUserResponse(**user)
```

앞서 만들어진 싱글톤과 같은 컨테이너는 라우터에서 주입이 가능합니다. 위의 예시에서는 DI 컨테이너에서 정의한 `user_service` 싱글톤 인스턴스를 가져와 핸들러 함수(HTTP 요청이 들어왔을 때 실행되는 함수)에 의존성을 주입하고 있습니다. 

```python
user_repository = Singleton(
		UserRepository, 
		AsyncSession=AsyncSession,
)
user_service = Singleton(
    UserService,
    user_repository=user_repository,
)
```

이때 참고로 `user_service`에 미리 `user_repository`를 주입해놓으면 Service 클래스에서 생성자로 repository 인스턴스를 전달받아 깔끔하게 사용이 가능합니다.

### Dependency Injector의 장점

이러한 방식은 다음과 같은 장점이 있습니다.

**서비스 계층 분리**

`user_service`는 비즈니스 로직만 담당하고, FastAPI 핸들러는 HTTP 요청과 응답 처리에만 집중합니다. 

덕분에 유지보수성이 높아지고, 코드가 직관적으로 분리됩니다.

**명확한 의존성 주입 구조**

`user_service`가 어떻게 만들어지는지 라우터 내부에서 신경 쓸 필요가 없습니다.

dependency-injector의 컨테이너에서 관리되고, 스코프나 생명 주기도 명확히 설정이 가능합니다.

**싱글톤 관리 자동화**

컨테이너에서 싱글톤으로 정의했기 때문에, 애플리케이션 전역에서 하나의 인스턴스만 사용됩니다.

DB 연결, 설정 객체, 캐시 등 비용이 큰 리소스를 효율적으로 관리 가능합니다.

**테스트 코드 작성 용이**

컨테이너를 모킹하거나 다른 인스턴스를 주입함으로써 테스트 시 자유롭게 대체 가능합니다.

```python
# 테스트 시에는 다른 user_service를 주입해도 동일한 인터페이스로 작동
container.user_service.override(MockUserService())
```

**확장성과 유연성**

추후 서비스가 커지면서 새로운 의존성이 생겨도, DI 컨테이너에 등록만 하면 자동 주입이 가능합니다.

라우터 코드를 수정하지 않고도 새로운 구현체로 교체가 가능합니다.

## DI에 적합한 설계하기

```python
src/
├── container.py  # DI 컨테이너 정의
├── services/
│   └── user_service.py
├── repositories/
│   └── user_repository.py
├── routers/
│   └── user_router.py
```

```python
src/
├── container.py  # DI 컨테이너 정의
├── user/
│   └── router.py  # controller
│   └── service.py
│   └── dto.py
│   └── repository.py
```

위 두 구조 예시처럼 `container.py`에서 각 DI 컨테이너들을 정의하고, 라우터에서 주입 받는 방식으로 설계할 수 있습니다. 이렇게 한 곳에서 컨테이너들을 관리하게 되면 추후 필요한 의존성이 많아지더라도 유지 보수 및 확장이 매우 편리해집니다.

지금까지 의존성 주입에 대해 알아보고, 나아가 FastAPI에서는 어떻게 활용할 수 있을지 살펴보았습니다. DI를 잘 활용하면 단순히 객체를 주입하는 것을 넘어, 클래스 간의 결합도를 낮추고 테스트를 용이하게 만들어 줄 수 있습니다. 또한 설정 관리나 주입할 컨테이너들의 관리를 중앙화할 수도 있습니다.

## 참고 자료
- [파이썬과 인터페이스 - 프로토콜에서 ABC까지](https://medium.com/humanscape-tech/%ED%8C%8C%EC%9D%B4%EC%8D%AC%EA%B3%BC-%EC%9D%B8%ED%84%B0%ED%8E%98%EC%9D%B4%EC%8A%A4-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C%EC%97%90%EC%84%9C-abc%EA%B9%8C%EC%A7%80-118bc5aed344)
- [Can someone explain when to use Singleton Scoped](https://www.reddit.com/r/csharp/comments/1acwtar/can_someone_explain_when_to_use_singleton_scoped/)
- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)