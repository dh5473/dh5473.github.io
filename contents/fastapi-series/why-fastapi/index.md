---
date: '2025-06-27'
title: 'FastAPI를 선택해야만 하는 이유'
category: 'Dev'
summary: 'Django, Flask와 함께 가장 많이 고려되는 파이썬 웹 프레임워크인 FastAPI에 대해 알아봅니다.'
thumbnail: './fastapi-logo.png'
---


FastAPI는 Django, Flask와 함께 가장 많이 고려되는 파이썬 웹 프레인워크입니다. 3대 프레임워크 중에 가장 늦게 등장했음에도 불구하고, 압도적인 성장세를 보여주고 있습니다. 당장 깃허브 스타만 비교해봐도 다른 두 프레임워크들을 앞서 있습니다. 개인적으로 가장 선호하기도 하는데, FastAPI의 어떤 점이 좋길래 이렇게 인기를 끌고 있는지 살펴보도록 하죠.

<br>

FastAPI는 높은 성능과 빠르고 쉬운 학습을 내세우고 있습니다. 개인적으로는 다른 것보다 **속도**, **타입**, **문서** 이 3가지가 큰 장점이라고 생각합니다.

### 속도
FastAPI는 파이썬 웹 프레임워크 중에 가장 빠릅니다. docs에서는 NodeJS와 Go에 견줄 정도로 높은 성능을 가지고 있다고 소개하고 있습니다. 내부적으로 Starlette이라는 비동기 프레임워크와 Pydantic을 활용하기 때문입니다.

Starlette은 비동기 처리에 최적화되어 있어 동시에 많은 요청을 효율적으로 처리할 수 있습니다. WebSocket 지원, 백그라운드 태스크, 미들웨어 시스템 등 현대적인 웹 애플리케이션에 필요한 기능들을 제공하면서도 매우 가볍고 빠릅니다.

### 타입

Python의 약점 중 하나는 타입입니다. 다른 언어들에 비해 데이터 타입에 대한 제약이 없는 대신, 그만큼 책임이 증가합니다. FastAPI는 Python의 타입 힌트를 적극적으로 활용함으로써, 자동으로 데이터 검증, 직렬화, 역직렬화 등을 처리해줍니다.

잘못된 타입의 데이터가 전송됐을 때, 자동으로 검증하고 적절한 에러를 반환하기 때문에 예기치 못한 에러 상황을 줄일 수 있고, 개발 생산성이 향상됩니다. 또한 Pydantic 모델을 활용해 복잡한 데이터 구조도 쉽게 정의하고 검증할 수 있습니다.

### 문서

문서 작성은 대부분의 사람들이 기피하는 작업입니다. FastAPI는 별도의 과정 없이도, 코드를 작성하면 Swagger UI와 ReDoc 형태의 API 문서가 자동으로 생성됩니다. 단순히 /docs 로 접근하여 문서를 확인할 수 있고, 브라우저 상에서 간단한 API 테스트도 진행할 수 있습니다.

## Django vs Flask vs FastAPI

이 익숙한 3개의 프레임워크는 각각 다른 철학을 가지고 있고, 상황에 따라 다르게 선택할 수 있습니다. 

먼저 Django는 **Batteries included** 철학을 가지고 있습니다. 이는 제공하는 것만으로도 모든 작업을 수행하는데 문제가 없다는 의미입니다. ORM, 인증, 관리자 패널, 템플릿 엔진 등 웹 개발에 필요한 거의 모든 기능을 내장하고 있습니다. 

```python
# models.py
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()

# views.py
from django.http import JsonResponse
from .models import User

def create_user(request):
    # 수동으로 JSON 파싱, 검증 필요
    data = json.loads(request.body)
    user = User.objects.create(**data)
    return JsonResponse({'id': user.id})
```

<br>

Flask의 철학은 **마이크로 프레임워크**입니다. 최소한의 코어만 제공하고, 나머지는 선택해서 개발할 수 있습니다. 높은 유연성을 제공하는 대신, 매번 직접 선택하고 설정해야 하는 번거로움이 있습니다.

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json()
    # 수동 검증 필요
    if not data or 'name' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    return jsonify({'message': 'User created'})
```

<br>

FastAPI는 API를 중심으로 설계할 수 있으며, 비동기, 타입 힌트, 문서화 등이 강점입니다.

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class User(BaseModel):
    name: str
    email: str

@app.post("/users")
async def create_user(user: User):
    # 검증, 파싱, 문서화가 모두 자동
    return {"message": "User created", "user": user}

```

## 그래서 결국 어떤 프레임워크를 써야 할까?

해당 글은 FastAPI를 소개하는 글이기도 하고, 개인적인 선호도를 담아 FastAPI의 강점을 주로 소개했습니다. 하지만 3개 프레임워크 중에서 모든 면이 뛰어난 프레임워크는 없습니다. 각각의 철학이 다르고, 강점이 다르기 때문에 상황에 따라 맞는 프레임워크를 사용하면 됩니다.

개인적으로 FastAPI를 선호하는 이유는 최근 마이크로서비스 아키텍처가 보편화되고, AI와 ML 분야가 급성장하면서 Python을 API 중심으로 설계하는 경우가 많기 때문입니다. 전통적인 웹 프레임워크들은 웹사이트를 만들기 위해 API도 제공하는 방식이었다면, 현재는 브라우저 없이 API 혹은 특정 기능만을 제공하는 서버가 필요한 경우도 많아졌습니다.

FastAPI는 애초부터 API 개발에 집중되어 있기 때문에, 템플릿 엔진이나 정적 파일 서빙 같은 기능들을 내장하지 않고 API 서버로서의 역할에 최적화할 수 있습니다. 또한 Python의 약점인 성능과 데이터 타입 견고성 등을 어느 정도 보완해주기 때문에 앞으로도 빠르게 성장할 것으로 기대됩니다.

<br>

해당 글에서는 간단하게 FastAPI를 살펴보았는데, 다음 글들에서는 FastAPI 프로젝트 구조, 비동기 활용, 의존성 주입 등에 대해 더 자세하게 다뤄보도록 하겠습니다.