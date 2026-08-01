---
date: '2025-06-27'
title: 'FastAPI를 선택해야만 하는 이유'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 1
summary: 'Django, Flask와 함께 가장 많이 고려되는 파이썬 웹 프레임워크 FastAPI를 살펴봅니다. 속도, 타입, 문서라는 세 가지 강점과 함께, "가장 빠르다"는 표현을 어떻게 읽어야 정확한지, 세 프레임워크가 기본으로 대신 해주는 범위는 어디까지인지 비교합니다.'
thumbnail: './fastapi-logo.png'
---

FastAPI는 Django, Flask와 함께 가장 많이 고려되는 파이썬 웹 프레임워크입니다. 3대 프레임워크 중에 가장 늦게 등장했음에도 불구하고, 압도적인 성장세를 보여주고 있습니다. 당장 깃허브 스타만 비교해봐도 다른 두 프레임워크들을 앞서 있습니다. 개인적으로 가장 선호하기도 하는데, FastAPI의 어떤 점이 좋길래 이렇게 인기를 끌고 있는지 살펴보겠습니다.

FastAPI는 높은 성능과 빠르고 쉬운 학습을 내세우고 있습니다. 개인적으로는 다른 것보다 **속도**, **타입**, **문서** 이 3가지가 큰 장점이라고 생각합니다.

## 속도

FastAPI는 파이썬 웹 프레임워크 중에서도 빠른 축에 속합니다. 공식 문서는 NodeJS와 Go에 견줄 만한 성능이라고 소개하면서, TechEmpower 벤치마크 기준으로 "가장 빠른 파이썬 프레임워크 중 하나"라고 표현합니다. 내부적으로 Starlette이라는 비동기 프레임워크와 Pydantic을 활용하기 때문입니다.

Starlette은 비동기 처리에 최적화되어 있어 동시에 많은 요청을 효율적으로 처리할 수 있습니다. WebSocket 지원, 백그라운드 태스크, 미들웨어 시스템 등 현대적인 웹 애플리케이션에 필요한 기능들을 제공하면서도 매우 가볍고 빠릅니다.

"중 하나"라는 표현을 눈여겨볼 필요가 있습니다. 같은 문서가 FastAPI보다 위에 있는 것은 Starlette과 Uvicorn뿐이라고 덧붙이는데, 둘 다 FastAPI가 내부적으로 쓰는 바로 그 구성 요소입니다. 즉 FastAPI는 Starlette보다 빠를 수 없습니다. Starlette 위에 요청마다 Pydantic 검증과 의존성 해석을 얹는 구조라서, 그 오버헤드만큼은 반드시 느립니다. FastAPI의 속도는 "가장 빠르다"가 아니라 **검증과 문서화를 자동으로 해주면서도 그 정도 속도가 나온다**로 읽어야 정확합니다.

## 타입

Python의 약점 중 하나는 타입입니다. 다른 언어들에 비해 데이터 타입에 대한 제약이 없는 대신, 그만큼 책임이 증가합니다. FastAPI는 Python의 타입 힌트를 적극적으로 활용함으로써, 자동으로 데이터 검증, 직렬화, 역직렬화 등을 처리해줍니다.

잘못된 타입의 데이터가 전송됐을 때, 자동으로 검증하고 적절한 에러를 반환하기 때문에 예기치 못한 에러 상황을 줄일 수 있고, 개발 생산성이 향상됩니다. 또한 Pydantic 모델을 활용해 복잡한 데이터 구조도 쉽게 정의하고 검증할 수 있습니다.

## 문서

문서 작성은 대부분의 사람들이 기피하는 작업입니다. FastAPI는 별도의 과정 없이도, 코드를 작성하면 Swagger UI와 ReDoc 형태의 API 문서가 자동으로 생성됩니다. 단순히 `/docs`로 접근하여 문서를 확인할 수 있고, 브라우저 상에서 간단한 API 테스트도 진행할 수 있습니다.

## Django vs Flask vs FastAPI

이 익숙한 3개의 프레임워크는 각각 다른 철학을 가지고 있고, 상황에 따라 다르게 선택할 수 있습니다.

먼저 Django는 **Batteries included** 철학을 가지고 있습니다. 이는 제공하는 것만으로도 모든 작업을 수행하는데 문제가 없다는 의미입니다. ORM, 인증, 관리자 패널, 템플릿 엔진 등 웹 개발에 필요한 거의 모든 기능을 내장하고 있습니다.

```python
# models.py
import json

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

Flask의 철학은 **마이크로 프레임워크**입니다. 최소한의 코어만 제공하고, 나머지는 선택해서 개발할 수 있습니다. 높은 유연성을 제공하는 대신, 매번 직접 선택하고 설정해야 하는 번거로움이 있습니다.

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/users', methods=['POST'])
def create_user():
    data = request.get_json(silent=True)  # 파싱 실패 시 None
    # 수동 검증 필요
    if not data or 'name' not in data:
        return jsonify({'error': 'Invalid data'}), 400
    return jsonify({'message': 'User created'})
```

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

세 코드가 하는 일은 같습니다. 다른 것은 그 일을 누가 하느냐입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 218" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="Django, Flask, FastAPI가 라우팅 매칭, JSON 파싱, 타입 검증, API 문서 네 단계에서 각각 자동으로 처리하는 범위를 비교한 표">
<style>
.wf-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.wf-head { font-size: 14px; fill: var(--text-muted, #78716c); }
.wf-name { font-size: 15px; font-weight: 600; fill: var(--text, #1c1917); }
.wf-at { font-size: 14px; font-weight: 600; fill: var(--text-success, #16a34a); }
.wf-mt { font-size: 14px; fill: var(--text-muted, #78716c); }
.wf-auto { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.2; }
.wf-man { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
</style>
<text class="wf-title" x="200" y="20" text-anchor="middle">프레임워크가 대신 해주는 범위</text>
<!-- 열 머리글 -->
<text class="wf-head" x="118" y="42" text-anchor="middle">라우팅</text>
<text class="wf-head" x="196" y="42" text-anchor="middle">JSON</text>
<text class="wf-head" x="274" y="42" text-anchor="middle">타입</text>
<text class="wf-head" x="352" y="42" text-anchor="middle">API</text>
<text class="wf-head" x="118" y="62" text-anchor="middle">매칭</text>
<text class="wf-head" x="196" y="62" text-anchor="middle">파싱</text>
<text class="wf-head" x="274" y="62" text-anchor="middle">검증</text>
<text class="wf-head" x="352" y="62" text-anchor="middle">문서</text>
<!-- Django -->
<text class="wf-name" x="74" y="97" text-anchor="end">Django</text>
<rect class="wf-auto" x="80" y="70" width="76" height="44" rx="6"/>
<text class="wf-at" x="118" y="97" text-anchor="middle">자동</text>
<rect class="wf-man" x="158" y="70" width="76" height="44" rx="6"/>
<text class="wf-mt" x="196" y="97" text-anchor="middle">직접</text>
<rect class="wf-man" x="236" y="70" width="76" height="44" rx="6"/>
<text class="wf-mt" x="274" y="97" text-anchor="middle">직접</text>
<rect class="wf-man" x="314" y="70" width="76" height="44" rx="6"/>
<text class="wf-mt" x="352" y="97" text-anchor="middle">직접</text>
<!-- Flask -->
<text class="wf-name" x="74" y="145" text-anchor="end">Flask</text>
<rect class="wf-auto" x="80" y="118" width="76" height="44" rx="6"/>
<text class="wf-at" x="118" y="145" text-anchor="middle">자동</text>
<rect class="wf-auto" x="158" y="118" width="76" height="44" rx="6"/>
<text class="wf-at" x="196" y="145" text-anchor="middle">자동</text>
<rect class="wf-man" x="236" y="118" width="76" height="44" rx="6"/>
<text class="wf-mt" x="274" y="145" text-anchor="middle">직접</text>
<rect class="wf-man" x="314" y="118" width="76" height="44" rx="6"/>
<text class="wf-mt" x="352" y="145" text-anchor="middle">직접</text>
<!-- FastAPI -->
<text class="wf-name" x="74" y="193" text-anchor="end">FastAPI</text>
<rect class="wf-auto" x="80" y="166" width="76" height="44" rx="6"/>
<text class="wf-at" x="118" y="193" text-anchor="middle">자동</text>
<rect class="wf-auto" x="158" y="166" width="76" height="44" rx="6"/>
<text class="wf-at" x="196" y="193" text-anchor="middle">자동</text>
<rect class="wf-auto" x="236" y="166" width="76" height="44" rx="6"/>
<text class="wf-at" x="274" y="193" text-anchor="middle">자동</text>
<rect class="wf-auto" x="314" y="166" width="76" height="44" rx="6"/>
<text class="wf-at" x="352" y="193" text-anchor="middle">자동</text>
</svg>
</div>

다만 이 그림은 위의 세 코드가 그러하듯 각 프레임워크를 가장 기본적으로 썼을 때를 놓고 그린 것이라, 몇 가지 단서가 필요합니다. Django는 서드파티 없이도 `forms.Form`과 `ModelForm`으로 입력 검증을 제공합니다. JSON 바디도 `MyForm(data=json.loads(request.body))` 형태로 넘기면 검증됩니다. 여기에 Django REST Framework를 얹으면 Serializer가 검증을, drf-spectacular가 문서를 맡아 회색 칸이 거의 다 메워지고, Flask도 marshmallow와 flasgger를 붙이면 비슷해집니다.

그러니 이 그림이 말하는 것은 "FastAPI만 할 수 있다"가 아닙니다. **HTTP 바디를 곧바로 타입 있는 객체로 받는 것이 기본 경로인가**의 차이입니다. Django와 Flask에서는 Form이든 Serializer든 검증 계층을 따로 고르고 연결해야 하는 반면, FastAPI는 함수 시그니처에 타입을 적는 것만으로 그 자리가 채워집니다.

## 그래서 결국 어떤 프레임워크를 써야 할까?

이 글은 FastAPI를 소개하는 자리인 만큼, 개인적인 선호를 담아 강점 위주로 다뤘습니다. 하지만 3개 프레임워크 중에서 모든 면이 뛰어난 프레임워크는 없습니다. 각각의 철학이 다르고, 강점이 다르기 때문에 상황에 따라 맞는 프레임워크를 사용하면 됩니다.

개인적으로 FastAPI를 선호하는 이유는 최근 마이크로서비스 아키텍처가 보편화되고, AI와 ML 분야가 급성장하면서 Python을 API 중심으로 설계하는 경우가 많기 때문입니다. 전통적인 웹 프레임워크들은 웹사이트를 만들기 위해 API도 제공하는 방식이었다면, 현재는 브라우저 없이 API 혹은 특정 기능만을 제공하는 서버가 필요한 경우도 많아졌습니다.

FastAPI는 애초부터 API 개발에 집중되어 설계됐습니다. 템플릿 엔진이나 정적 파일 서빙도 `fastapi.staticfiles`, `fastapi.templating`으로 쓸 수 있지만(Starlette의 것을 그대로 가져옵니다) 어디까지나 선택 기능이고, 기본 설계 축은 API 쪽에 맞춰져 있습니다. 또한 Python의 약점인 성능과 데이터 타입 견고성 등을 어느 정도 보완해주기 때문에 앞으로도 빠르게 성장할 것으로 기대됩니다.

## 함께 보면 좋은 글

- [FastAPI 프로젝트를 체계적으로 구조화하는 방법](/fastapi/how-to-structure-fastapi-projects/)
- [Pydantic V2, FastAPI에서 제대로 쓰는 법](/fastapi/pydantic-v2-guide/)

## 참고자료

- [FastAPI 공식 문서](https://fastapi.tiangolo.com/) - 성능 관련 서술과 TechEmpower 벤치마크 링크
- [Starlette](https://www.starlette.io/) - FastAPI가 내부적으로 사용하는 ASGI 프레임워크
- [Pydantic](https://docs.pydantic.dev/latest/) - 타입 힌트 기반 검증과 직렬화를 담당하는 라이브러리