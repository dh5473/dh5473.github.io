---
date: '2025-07-08'
title: 'FastAPI 프로젝트를 체계적으로 구조화하는 방법'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 2
summary: 'FastAPI 프로젝트의 확장성과 유지보수성을 높이는 두 가지 주요 구조화 전략에 대해 알아봅니다.'
thumbnail: './fastapi-logo.png'
---

이번 글에서는 주어진 상황에 적합한 FastAPI 프로젝트 구조를 설계하기 위해 두 가지 주요 전략을 살펴보겠습니다. 초기 FastAPI 서버를 띄우는 코드는 아래와 같이 매우 간단합니다. 하지만, 프로젝트 규모가 커지게 되면 결국 구조화가 중요해지는 순간이 오게 됩니다.

```python
# main.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, FastAPI!"}
```

## 왜 프로젝트 구조화가 중요할까?

좋은 프로젝트 구조는 단순히 파일을 정리하는 것 이상의 의미를 가지고 있습니다.

- 확장성 (Scalability)
- 유지보수성 (Maintainability)
- 협업 효율성 (Team Collaboration)

위 3가지는 프로젝트 구조화가 필요한 이유들입니다. 잘 구조화된 코드는 프로젝트 크기에 맞춰 자연스럽게 확장되며, 새로운 기능을 추가하거나 기존 기능을 수정할 때, 어디에 어떻게 코드를 작성해야 할지 명확하게 정의할 수 있습니다. 또한 팀 단위로 개발할 때, 각자 담당하는 모듈이 분리되어 있으면 충돌 없이 병렬로 작업이 가능합니다.

## 프로젝트 구조화 핵심 원칙

그렇다면 구조화를 어떻게 진행해야 효과적일까요? FastAPI의 경우 아래 4가지 원칙을 잘 고려해야 합니다.

- **관심사의 분리 (Separation of Concerns)**
    
    라우터, 모델, 비즈니스 로직 등 서로 다른 역할을 하는 코드들을 명확하게 분리합니다. 
    
- **모듈화 (Modularization)**
    
    애플리케이션을 재사용 가능한 모듈로 나누어 코드의 재사용성과 구조화를 촉진합니다.
    
- **의존성 주입 (Dependency Injection)**
    
    컴포넌트 간의 결합도를 낮추어 더 유연하고 테스트하기 쉬운 코드를 만듭니다.
    
- **테스트 가능성 (Testability)**
    
    의존성 주입과 모킹을 통해 각 컴포넌트를 독립적으로 테스트할 수 있도록 코드를 작성합니다.
    

## **File-Type** 기반

FastAPI 프로젝트는 크게 두 가지 방식으로 구조화할 수 있습니다. 먼저 첫 번째 방식은 **파일의 역할**에 따라 구조화하는 것입니다. 라우터, 모델, 스키마 등을 각각의 디렉토리로 분리합니다.

```
.
├── app
│   ├── __init__.p반
│   ├── main.py              # FastAPI 애플리케이션 초기화
│   ├── dependencies.py      # 라우터에서 사용하는 의존성 정의
│   ├── routers
│   │   ├── __init__.py
│   │   ├── items.py         # 아이템 관련 라우트
│   │   └── users.py         # 사용자 관련 라우트
│   ├── crud
│   │   ├── __init__.py
│   │   ├── item.py          # 아이템 CRUD 작업
│   │   └── user.py          # 사용자 CRUD 작업
│   ├── schemas
│   │   ├── __init__.py
│   │   ├── item.py          # 아이템 스키마 정의
│   │   └── user.py          # 사용자 스키마 정의
│   ├── models
│   │   ├── __init__.py
│   │   ├── item.py          # 아이템 데이터베이스 모델
│   │   └── user.py          # 사용자 데이터베이스 모델
│   └── utils
│       ├── __init__.py
│       ├── authentication.py # 인증 관련 유틸리티
│       └── validation.py     # 검증 관련 유틸리티
├── tests
│   ├── __init__.py
│   ├── test_main.py
│   ├── test_items.py
│   └── test_users.py
├── requirements.txt
├── .gitignore
└── README.md
```

이 구조는 **마이크로서비스**나 **상대적으로 작은 규모의 프로젝트**에 적합합니다. 각 서비스가 단일 책임을 가지고, 도메인이 명확하게 구분되는 경우에 효과적입니다.

## **Module-Functionality** 기반

두 번째 방식은 **비즈니스 도메인에 따라** 구조화하는 것입니다. 각 기능별로 필요한 모든 파일들을 하나의 패키지로 묶는 방식입니다.

```
fastapi-project
├── alembic/
├── src
│   ├── auth                 # 인증 모듈
│   │   ├── router.py        # 인증 관련 모든 엔드포인트
│   │   ├── schemas.py       # pydantic 모델
│   │   ├── models.py        # 데이터베이스 모델
│   │   ├── dependencies.py  # 라우터 의존성
│   │   ├── config.py        # 로컬 설정
│   │   ├── constants.py     # 모듈별 상수
│   │   ├── exceptions.py    # 모듈별 예외
│   │   ├── service.py       # 비즈니스 로직
│   │   └── utils.py         # 기타 유틸리티 함수
│   ├── posts                # 게시물 모듈
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── models.py
│   │   ├── dependencies.py
│   │   ├── constants.py
│   │   ├── exceptions.py
│   │   ├── service.py
│   │   └── utils.py
│   ├── users                # 사용자 모듈
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── models.py
│   │   ├── dependencies.py
│   │   ├── constants.py
│   │   ├── exceptions.py
│   │   ├── service.py
│   │   └── utils.py
│   ├── config.py           # 전역 설정
│   ├── models.py           # 전역 데이터베이스 모델
│   ├── exceptions.py       # 전역 예외
│   ├── pagination.py       # 전역 모듈 (예: 페이지네이션)
│   ├── database.py         # DB 연결 관련
│   └── main.py
├── tests/
│   ├── auth
│   ├── posts
│   └── users
├── requirements
│   ├── base.txt
│   ├── dev.txt
│   └── prod.txt
├── .env
├── .gitignore
└── logging.ini

```

이 구조는 **모놀리식 애플리케이션**이나 **여러 도메인을 포함하는 대규모 프로젝트**에 적합합니다. 각 도메인이 독립적으로 개발될 수 있고, 도메인별로 팀을 나누어 작업할 때 효과적입니다. 

이때 모듈 기능 기반 구조에서는 다른 패키지의 서비스나 의존성을 사용할 때, 아래와 같이 명시적인 모듈명을 사용하여 모호함을 방지하는 것이 좋습니다.

```python
from src.auth import constants as auth_constants
from src.notifications import service as notification_service
```

## 그래서 어떤 구조를 사용해야 하나요?

우선 위에서 살펴본 두 구조를 간단하게 정리해보겠습니다.

<div style="overflow-x: auto; margin: 24px 0;">
  <table style="width: 100%; max-width: 800px; margin: 0 auto; border-collapse: collapse; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
    <thead>
      <tr style="background-color: #e6e6fa; color: #4a4a4a;">
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 25%;">구분</th>
        <th style="padding: 16px 20px; text-align: center; font-weight: 600; width: 37.5%;">파일 타입 기반 구조</th>
        <th style="padding: 16px 20px; text-align: center; font-weight: 600; width: 37.5%;">모듈 기능 기반 구조</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">아키텍처 스타일</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">마이크로서비스 아키텍처</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">모놀리식 애플리케이션</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">도메인 구성</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">단일 도메인에 집중</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">여러 비즈니스 도메인 포함</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">팀 규모</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">소규모 팀</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef; text-align: center;">대규모 팀</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; background-color: #f8f9fa; color: #495057;">적합한 상황</td>
        <td style="padding: 16px 20px; text-align: center;">빠른 프로토타이핑</td>
        <td style="padding: 16px 20px; text-align: center;">장기적인 유지보수가 필요한 경우</td>
      </tr>
    </tbody>
  </table>
</div>



최근에는 MSA(마이크로서비스 아키텍처)가 잘 알려져 있기도 하고, 많은 기업에서 추구하는 방식인 만큼 해당 아키텍처에 적합한 파일 타입 기반 구조화가 매력적으로 보일 수 있습니다. 다만, 모듈 기능 기반 구조라고 해서 MSA가 불가능한 것도 아니고, 개인적으로는 프로젝트 크기가 커질수록 모듈 기능 기반 구조가 더 명확하다고 생각됩니다.

물론 각 구조화의 장단점이 분명히 존재하기 때문에, 상황에 맞춰서 알맞은 구조를 선택하면 됩니다. 또한 무조건 정해진 틀에 맞춰 구조를 설계하는 것보다는 아래 예시처럼 필요에 따라 약간의 변형을 포함할 수도 있습니다.

```python
fastapi-project
├── alembic/                 # 데이터베이스 마이그레이션
│   ├── alembic.ini
│   ├── env.py
│   └── versions/           # 마이그레이션 파일들
├── src/
│   ├── endpoints/          # API 엔드포인트 모듈들
│   │   ├── auth/           # 인증 관련 모듈
│   │   ├── batch/          # 배치 작업 모듈
│   │   │   ├── controller.py   # 라우터 (엔드포인트)
│   │   │   ├── dtos.py         # pydantic 모델
│   │   │   ├── repository.py   # 데이터 액세스 레이어
│   │   │   └── service.py      # 비즈니스 로직
│   │   ├── material/       
│   │   └── ... (기타 모듈)
│   ├── models/             # 전역 데이터베이스 모델
│   │   ├── __init__.py
│   │   ├── batch_job.py
│   │   └── ... (기타 모델들)
│   ├── engine/             # 비즈니스 로직 엔진
│   │   └── engine.py
│   ├── utils/              # 전역 유틸리티
│   ├── server.py           # FastAPI 앱 초기화
│   ├── settings.py         # 전역 설정
│   ├── schemas.py          # 전역 스키마
│   ├── container.py        # 의존성 주입 컨테이너
│   └── worker.py           # 워커 프로세스
├── tests/                  # 테스트 코드
├── scripts/                # 빌드/배포 스크립트
│   └── build_push.sh
├── requirements.txt        # 의존성 패키지
├── pyproject.toml         # 프로젝트 메타데이터
├── docker-compose.yaml    # 컨테이너 구성
├── Dockerfile             # 도커 이미지 빌드
└── README.md              # 프로젝트 문서
```

그래도 고민 된다면 [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices#1-project-structure-consistent--predictable)에서 프로젝트 구조와 관련된 더 상세한 정보를 확인할 수 있습니다.

## 마무리

이번 글에서는 프로젝트의 확장성과 유지보수를 위해 FastAPI의 두 가지 주요 구조화 전략에 대해 알아보았습니다. 두 가지 구조 모두 각각의 장점이 있고, 상황에 따라 유연하게 구조를 변경할 수도 있기 때문에 프로젝트의 규모, 복잡성, 팀 구조 등을 고려하여 적절하게 선택하는 것이 중요합니다.

다음 글에서는 프로젝트 구조와도 관련 있는 FastAPI의 의존성 주입에 대해 더 자세히 다뤄보도록 하겠습니다.


## 참고 자료
- [How to structure your FastAPI projects](https://medium.com/@amirm.lavasani/how-to-structure-your-fastapi-projects-0219a6600a8f) - FastAPI 프로젝트 구조화에 대한 실무 관점의 가이드
- [Bigger Applications - Multiple Files](https://fastapi.tiangolo.com/tutorial/bigger-applications/) - FastAPI 공식 문서의 대규모 애플리케이션 구조화 가이드 
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices#1-project-structure-consistent--predictable) - FastAPI 개발 시 고려해야 할 베스트 프랙티스와 프로젝트 구조 가이드
