---
date: '2025-08-24'
title: '써보면 절대 후회하지 않을 파이썬 uv 사용법'
category: 'Python'
series: 'python-tooling-series'
seriesOrder: 1
summary: '혜성처럼 등장한 python 패키지 관리 툴 uv. 다른 도구들 대비 뛰어난 편의성과 성능을 가지고 있는 uv에 대해 알아봅니다.'
thumbnail: './uv-logo.png'
---

Python 개발을 하다 보면 누구나 한 번쯤 가상환경이나 패키지 관리 때문에 고통 받아본 경험이 있을 겁니다. 특히 머신러닝 쪽 라이브러리를 활용할 때는 버전이 충돌하는 일도 많습니다. 새로운 프로젝트를 시작할 때마다 python 버전도 신경써야하고, 느리고 자주 충돌하는 pip와 requirements.txt 관리 때문에, 이제는 핵심 로직에 집중하고 싶다는 생각을 종종 했습니다.

<br>

기존 pip, poetry, pyenv, pipx, pipenv 등 다양한 python 패키지 관리 툴은 아래와 같은 문제점들을 가지고 있었습니다.

- **복잡한 학습 곡선**: 각 도구마다 다른 명령어와 설정 방식
- **일관성 없는 워크플로우**: 프로젝트마다 다른 설정과 관리 방식
- **성능 이슈**: pip의 느린 의존성 해결과 패키지 설치 속도
- **재현성 문제**: 환경 간 일관된 패키지 버전 보장의 어려움

이런 문제들을 해결하기 위해 poetry, pipenv, conda 등 다양한 도구들이 등장했지만, 기존의 문제들을 통합해서 해결하지는 못했습니다. 이때, 2024년 초 탄생한 uv는 Rust 기반의 매우 빠른 속도와 앞선 도구들의 장점을 통합하며 새로운 생태계를 이끌어가고 있습니다.

## 혜성처럼 등장한 uv

uv의 가장 큰 장점은 **편의성**과 압도적인 **속도**입니다.

꼭 필요한 파이썬 버전, 의존성, 가상환경, 패키징 관리 등을 알아서 처리합니다. 특히 패키지 간 버전 충돌을 명령어 하나로 알아서 업데이트하고 관리해주는 것이 큰 장점입니다.

Rust 기반 Resolver(여러 패키지나 버전이 충돌할 때 어떤 버전을 사용할지 결정하는 규칙)으로 의존성 설치 속도가 pip나 poetry 대비 10~100배 빠릅니다. 캐싱, 최적화, 병렬 다운로드도 활용하는데, 사용해보면 차이가 눈에 보일 정도의 빠른 속도를 보여줍니다.

아래에서 더 자세히 살펴보겠지만, 사용 명령어도 정말 간단한데 init, add, sync 이 3가지만으로 .venv 폴더나 버전 설정 등을 직접 신경쓰지 않아도 자동으로 생성하고 관리해줍니다.

### uv 설치하기

운영체제에 따라 아래 방법으로 설치하고 `uv —version`으로 설치를 확인해볼 수 있습니다.

**macOS / Linux**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

<br>

**Window (PowerShell)**
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

<br>

**Homebrew (macOS) 혹은 pip**
```bash
brew install uv
pip install uv
```

### 프로젝트 생성

uv를 활용하면 간단한 명령어로 프로젝트를 세팅할 수 있습니다.
```bash
uv init my-project
```

위 명령어 하나로 python version, 패키지 의존성(pyproject.toml) 등과 관련된 기초 세팅이 완료됩니다.

```bash
my-project/
├── .git/
├── .gitignore
├── .python-version         # Python 버전 지정
├── pyproject.toml          # 프로젝트 메타데이터 및 의존성
├── uv.lock                 # 정확한 의존성 버전 기록
├── README.md
└── main.py
```

여기서 주목할 점은 `pyproject.toml`입니다. 최신 파이썬 패키징 표준인 PEP 621을 준수하여 모든 프로젝트 설정을 이 파일에 통합합니다. 또한 uv.lock 파일을 활용해 정확한 의존성 버전도 기록합니다.

가상환경을 관리하는 .venv 폴더도 자동으로 생기며, 가상환경을 별도로 활성화할 필요 없이 `uv run` 명령어를 사용하면 자동으로 가상환경을 적용할 수 있습니다.

<br>

이미 requirements.txt 파일이 존재한다면, 아래와 같이 의존성을 설치할 수 있으며, 각 개별 새로운 의존성은 `uv add numpy` 이런 식으로 추가할 수 있습니다.
```bash
uv add -r requirements.txt 
uv add <패키지명>
```

만약 이미 uv 기반의 프로젝트를 받아오거나 CI/CD 등의 자동화된 환경에서는 아래 명령어를 활용하여 자동으로 의존성을 일치시킬 수 있습니다. 참고로 uv sync는 pyproject.toml 파일을 기반으로 의존성을 설치, 관리하며 uv.lock 파일을 생성하고 업데이트합니다.
```bash
uv sync
```

<br>

또한 taskipy 의존성을 설치하면, pyproject.toml에 원하는 형태의 CLI를 정의하고 편리하게 실행할 수 있습니다. 아래 예에서는 `uv run task dev` 라고 실행하면 저장되어 있던 명령어가 실행됩니다.
```bash
# pyproject.toml

[tool.taskipy.tasks]
dev = { cmd = "PYTHONPATH=. uv run streamlit run src/app.py" }
```

<br>

자주 사용하진 않지만 이외에도 다양한 명령어들이 존재합니다.
```bash
# 프로젝트 상태 확인
uv tree                    # 의존성 트리 보기
uv lock --upgrade         # 의존성 업데이트 및 lock 파일 갱신

# 가상환경 관리
uv venv                   # 가상환경 생성
uv venv --python 3.11     # 특정 Python 버전으로 가상환경 생성

# 패키지 검색 및 정보
uv pip show requests      # 설치된 패키지 정보 확인
uv pip list               # 설치된 패키지 목록 보기
uv pip install <패키지명>   # 현재 환경에만 설치 (pyproject.toml 수정 안함)

# 실행 환경
uv run python script.py   # 프로젝트 환경에서 스크립트 실행
uv run pytest            # 테스트 실행

# 캐시 관리
uv cache clean           # 글로벌 캐시 정리
uv cache dir             # 캐시 디렉토리 위치 확인
```

### 기존 프로젝트 마이그레이션

기존 프로젝트를 uv로 마이그레이션하는 것도 간단합니다.


```bash
# pyproject.toml이 있는 경우
uv sync

# Poetry 의존성을 uv 형식으로 변환
uv add $(poetry export -f requirements.txt --without-hashes | cut -d'=' -f1)

# requirements.txt에서 의존성 가져오기
uv add -r requirements.txt
```

## 이젠 uv로 통합해야할 때

기존 파이썬 생태계는 주로 다음과 같은 도구들이 각자 필요한 역할을 담당해왔습니다. 하지만 이제는 uv 하나로 해결할 수 있습니다.

- **pip**: 패키지 설치
- **poetry**: 의존성·빌드 관리
- **venv**: 가상환경 생성

<br>

uv는 등장한지 얼마 되지 않았지만, 기존 툴들 대비 편리한 사용성과 뛰어난 성능으로 빠르게 확산 중입니다. 기존 프로젝트를 이전하는 것이 어렵다면, 작은 프로젝트라도 uv와 함께 시작해보는 것을 추천드립니다. 익숙하지 않아 처음 생기는 거부감만 넘어선다면, 세팅부터 관리, 배포까지 이전보다 훨씬 더 나은 개발 경험을 얻을 수 있습니다.


## 참고 자료
- [uv github](https://github.com/astral-sh/uv)
- [파이썬 개발자라면 uv를 사용합시다](https://sigridjin.medium.com/%ED%8C%8C%EC%9D%B4%EC%8D%AC-%EA%B0%9C%EB%B0%9C%EC%9E%90%EB%9D%BC%EB%A9%B4-uv-%EB%A5%BC-%EC%82%AC%EC%9A%A9%ED%95%A9%EC%8B%9C%EB%8B%A4-546d523f7178)