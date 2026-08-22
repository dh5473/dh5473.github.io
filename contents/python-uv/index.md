---
date: '2025-08-24'
title: 'pyenv, venv, pip, poetry를 uv 하나로 합치기'
category: 'Python'
summary: 'uv init, add, sync 세 명령으로 파이썬 버전과 가상환경, 의존성을 함께 관리하는 방법. uv run이 실행할 때마다 락파일을 맞추는 동작과 0.12에서 바뀐 기본 레이아웃을 정리했습니다.'
thumbnail: './uv-logo.png'
---

파이썬 프로젝트를 새로 시작할 때마다 같은 순서를 반복하게 됩니다. 파이썬 버전을 고르고, 가상환경을 만들고, 활성화하고, 패키지를 설치하고, requirements.txt를 갱신합니다. 도구도 제각각이라 버전은 pyenv, 환경은 venv, 설치는 pip로 나눠 다뤄야 했습니다. 머신러닝 라이브러리처럼 의존성이 촘촘한 패키지를 다룰 때는 이 조합에서 버전 충돌이 자주 났습니다.

uv는 이 역할들을 실행 파일 하나에 모았습니다. Astral이 2024년 2월 pip와 pip-tools를 대체하는 설치기로 처음 공개했고, 지금은 파이썬 배포판 관리부터 빌드와 업로드까지 범위가 늘어났습니다.

다만 기존 도구들이 그대로 멈춰 있는 것은 아닙니다. pip는 2020년 20.3에서 의존성 해석기를 새로 갈아 끼웠고, 25.1부터는 `--group` 옵션으로 PEP 735 의존성 그룹을 설치합니다. Poetry도 2.0에서 표준 형식인 PEP 621 `[project]` 테이블을 받아들였습니다. uv를 고를 이유는 다른 도구가 못 하는 일을 해서가 아니라, 흩어져 있던 기능이 **명령 체계 하나로 모여 있어서**입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 244" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="pyenv, venv, pip, poetry가 나눠 맡던 역할을 uv 하나가 대신하는 구조">
<style>
.uv-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.uv-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.uv-l { fill: var(--text, #1c1917); font-size: 14px; }
.uv-w { fill: var(--on-fill, #ffffff); font-size: 16px; font-weight: 700; }
.uv-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.uv-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.uv-one { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.uv-a { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; marker-end: url(#uvArrow); }
</style>
<defs>
<marker id="uvArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="uv-t" x="200" y="22" text-anchor="middle">네 도구가 하던 일을 하나로</text>
<text class="uv-h" x="20" y="46">기존</text>
<rect class="uv-box" x="16" y="54" width="176" height="34" rx="5"/>
<text class="uv-l" x="104" y="76" text-anchor="middle">pyenv  파이썬 버전</text>
<rect class="uv-box" x="208" y="54" width="176" height="34" rx="5"/>
<text class="uv-l" x="296" y="76" text-anchor="middle">venv  가상환경</text>
<rect class="uv-box" x="16" y="96" width="176" height="34" rx="5"/>
<text class="uv-l" x="104" y="118" text-anchor="middle">pip  패키지 설치</text>
<rect class="uv-box" x="208" y="96" width="176" height="34" rx="5"/>
<text class="uv-l" x="296" y="118" text-anchor="middle">poetry  의존성·빌드</text>
<path class="uv-a" d="M200 136 L200 152"/>
<rect class="uv-one" x="16" y="156" width="368" height="44" rx="6"/>
<text class="uv-w" x="200" y="184" text-anchor="middle">uv</text>
<text class="uv-n" x="200" y="228" text-anchor="middle">파이썬 버전 · 가상환경 · 패키지 · 빌드</text>
</svg>
</div>

## 얼마나 빠른가

Rust로 작성된 해석기 덕분에 의존성 해결과 설치가 빠릅니다. 다만 배수는 캐시 상태에 따라 크게 갈립니다.

Astral이 처음 공개한 수치는 캐시가 비어 있을 때 pip 대비 8배에서 10배, 캐시가 채워진 상태에서 80배에서 115배입니다. 지금 uv 저장소가 앞세우는 10배에서 100배도 Trio의 의존성을 캐시가 채워진 상태에서 설치한 결과입니다. 두 수치 모두 캐시가 살아 있을 때의 값이므로, 캐시가 매번 비는 CI 환경이라면 체감 차이는 한 자릿수 배수에 가깝습니다.

## 설치와 첫 프로젝트

### 설치

운영체제에 따라 아래 방법으로 설치하고 `uv --version`으로 확인합니다.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

윈도우는 PowerShell을 씁니다.

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Homebrew나 pip로도 설치할 수 있습니다.

```bash
brew install uv
pip install uv
```

### 프로젝트 생성

```bash
uv init my-project
```

이 명령 하나로 파이썬 버전 고정, 프로젝트 메타데이터, 소스 디렉터리가 함께 만들어집니다.

```text
my-project/
├── .python-version
├── README.md
├── pyproject.toml
└── src/
    └── my_project/
        └── __init__.py
```

:::warning

**uv 0.12.0에서 기본 레이아웃이 바뀌었습니다**

2026년 7월 28일 릴리스된 uv 0.12.0부터 `uv init`이 만드는 프로젝트는 기본적으로 패키지가 됩니다. `[build-system]`과 `[project.scripts]`가 들어가고 소스는 `src/<모듈명>/` 아래에 놓입니다. 예전처럼 `main.py` 하나만 두는 레이아웃을 원한다면 `uv init --no-package`를 씁니다.

그리고 이 시점에는 `uv.lock`도 `.venv`도 생기지 않습니다. 둘 다 `uv run`이나 `uv sync`, `uv add`를 처음 실행할 때 만들어집니다.

:::

### pyproject.toml과 uv.lock

`uv init`이 만든 `pyproject.toml`은 이런 모습입니다.

```toml
[project]
name = "my-project"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
requires-python = ">=3.13"
dependencies = []

[project.scripts]
my-project = "my_project:main"

[build-system]
requires = ["uv_build>=0.12.3,<0.13"]
build-backend = "uv_build"
```

표준 메타데이터는 PEP 621을 따르고, uv 고유의 설정은 `[tool.uv]` 아래에 모입니다. 개발 의존성처럼 그룹을 나눠야 하는 항목은 또 다른 표준인 PEP 735의 `[dependency-groups]`를 씁니다. 특정 도구에만 통하는 형식이 아니라서 나중에 다른 빌드 백엔드로 갈아타기도 쉽습니다.

빌드 백엔드로는 uv가 직접 만든 `uv_build`가 기본으로 들어갑니다. hatchling이나 setuptools를 쓰고 싶다면 `uv init --build-backend hatch`처럼 지정합니다.

### 의존성 추가와 동기화

패키지는 `uv add`로 넣습니다. 이 명령이 `pyproject.toml`의 `dependencies`를 고치고, `uv.lock`을 갱신하고, `.venv`에 설치하는 일까지 한 번에 합니다.

```bash
uv add requests
uv add -r requirements.txt
```

`uv add -r`은 requirements.txt의 핀을 그대로 옮깁니다. `httpx==0.28.1`처럼 고정된 줄은 `pyproject.toml`에도 `==`로 들어가므로, 버전을 풀고 싶다면 옮긴 뒤에 직접 손봐야 합니다.

이미 uv로 관리되는 프로젝트를 내려받았거나 CI에서 환경만 맞추면 되는 상황에는 `uv sync`를 씁니다.

```bash
uv sync
```

`uv.lock`은 직접 편집하는 파일이 아니지만 버전 관리에는 포함시켜야 합니다. 이 파일에 각 패키지의 해시와 배포판 URL이 들어 있어서, 팀원과 CI가 같은 바이트를 설치하게 됩니다.

## uv run이 매번 하는 일

가상환경을 직접 활성화할 일이 없다는 점이 uv의 사용법을 가장 많이 바꿔놓습니다. `uv run`은 명령을 실행하기 전에 락파일과 환경을 먼저 맞춥니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 240" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="uv run이 명령을 실행하기 전에 락파일을 갱신하고 가상환경을 동기화하는 세 단계 흐름">
<style>
.uvr-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.uvr-l { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.uvr-s { fill: var(--text-muted, #6d6762); font-size: 14px; }
.uvr-w { fill: var(--on-fill, #ffffff); font-size: 15px; font-weight: 700; }
.uvr-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.uvr-run { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.uvr-a { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; marker-end: url(#uvrArrow); }
</style>
<defs>
<marker id="uvrArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="uvr-t" x="200" y="22" text-anchor="middle">uv run이 명령을 실행하기 전에</text>
<rect class="uvr-box" x="16" y="38" width="368" height="56" rx="6"/>
<text class="uvr-l" x="200" y="62" text-anchor="middle">uv.lock 갱신</text>
<text class="uvr-s" x="200" y="82" text-anchor="middle">--frozen 이면 건너뜀</text>
<path class="uvr-a" d="M200 94 L200 110"/>
<rect class="uvr-box" x="16" y="112" width="368" height="56" rx="6"/>
<text class="uvr-l" x="200" y="136" text-anchor="middle">.venv를 락파일에 맞춰 설치</text>
<text class="uvr-s" x="200" y="156" text-anchor="middle">--no-sync 이면 건너뜀</text>
<path class="uvr-a" d="M200 168 L200 184"/>
<rect class="uvr-run" x="16" y="186" width="368" height="44" rx="6"/>
<text class="uvr-w" x="200" y="213" text-anchor="middle">명령 실행</text>
</svg>
</div>

이 동작은 눈으로 확인할 수 있습니다. `.venv`에서 패키지 하나를 지우고 `uv run`을 부르면 지워진 패키지가 다시 깔린 뒤에 명령이 돕니다. `.venv` 디렉터리를 통째로 지워도 마찬가지로 환경을 새로 만들고 나서 실행합니다.

```text
$ rm -rf .venv
$ uv run python -c "import requests; print(requests.__version__)"
Using CPython 3.13.3
Creating virtual environment at: .venv
Installed 5 packages in 7ms
2.34.2
```

편한 만큼 대가도 있습니다. 락파일을 건드리면 안 되는 배포 단계나, 환경을 이미 다른 방식으로 채워둔 컨테이너 안에서는 이 동기화가 방해가 됩니다. 그래서 세 가지 옵션이 따로 있습니다.

| 옵션 | 동작 |
|---|---|
| `--frozen` | 락파일을 갱신하지 않고 있는 그대로 사용 |
| `--locked` | 락파일이 낡았으면 갱신 대신 실패 |
| `--no-sync` | 환경 설치 단계를 건너뛰고 바로 실행 |

CI에서는 `--locked`가 유용합니다. 누군가 `pyproject.toml`만 고치고 락파일을 커밋하지 않았다면 조용히 넘어가지 않고 빌드가 멈춥니다.

## 파이썬 버전 관리

uv는 시스템에 설치된 파이썬만 쓰지 않습니다. 필요한 버전이 없으면 python-build-standalone 배포판을 직접 내려받습니다. pyenv처럼 소스를 빌드하지 않고 미리 만들어진 바이너리를 가져오기 때문에 컴파일러나 헤더 파일을 갖출 필요가 없습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 266" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="요청된 파이썬 버전을 uv가 관리 빌드, 시스템 파이썬, 새 내려받기 순으로 찾는 우선순위">
<style>
.uvp-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.uvp-l { fill: var(--text, #1c1917); font-size: 15px; }
.uvp-b { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.uvp-s { fill: var(--text-muted, #6d6762); font-size: 14px; }
.uvp-n { fill: var(--primary, #0a756c); font-size: 15px; font-weight: 700; }
.uvp-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.uvp-a { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; marker-end: url(#uvpArrow); }
</style>
<defs>
<marker id="uvpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="uvp-t" x="200" y="22" text-anchor="middle">요청한 파이썬 버전을 찾는 순서</text>
<rect class="uvp-box" x="16" y="36" width="368" height="52" rx="6"/>
<text class="uvp-b" x="200" y="58" text-anchor="middle">버전 요청</text>
<text class="uvp-s" x="200" y="78" text-anchor="middle">.python-version 또는 requires-python</text>
<path class="uvp-a" d="M200 88 L200 104"/>
<rect class="uvp-box" x="16" y="106" width="368" height="42" rx="6"/>
<text class="uvp-n" x="32" y="133">1</text>
<text class="uvp-l" x="52" y="133">이미 받아둔 uv 관리 빌드</text>
<rect class="uvp-box" x="16" y="154" width="368" height="42" rx="6"/>
<text class="uvp-n" x="32" y="181">2</text>
<text class="uvp-l" x="52" y="181">시스템에 설치된 파이썬</text>
<rect class="uvp-box" x="16" y="202" width="368" height="42" rx="6"/>
<text class="uvp-n" x="32" y="229">3</text>
<text class="uvp-l" x="52" y="229">python-build-standalone 내려받기</text>
<text class="uvp-s" x="200" y="258" text-anchor="middle">위에서부터 우선</text>
</svg>
</div>

`uv init`이 만든 `.python-version`이 이 요청의 출발점입니다. 이 파일이 있으면 uv가 해당 버전을 찾아 쓰고, 없으면 `pyproject.toml`의 `requires-python`을 만족하는 버전을 고릅니다.

```bash
uv python list             # 설치된 버전과 내려받을 수 있는 버전
uv python install 3.12     # 특정 버전 내려받기
uv python pin 3.12         # .python-version 갱신
```

`uv python list`를 실행하면 `<download available>`로 표시된 줄이 나오는데, 아직 내려받지 않았을 뿐 요청하면 바로 가져올 수 있는 버전입니다. 자동 내려받기가 곤란한 폐쇄망이라면 `--no-python-downloads`로 막을 수 있습니다.

:::tip

**시스템 파이썬과 헷갈리는 지점**

uv는 이미 받아둔 관리 빌드를 시스템 파이썬보다 먼저 씁니다. `python3 --version`과 `uv run python --version`의 결과가 다르게 나오는 이유가 여기 있습니다. 시스템 인터프리터를 강제하려면 `--no-managed-python`을 붙입니다.

:::

## 프로젝트 밖에서 쓰는 도구

ruff나 httpie처럼 프로젝트 의존성이 아니라 명령줄 도구로 쓰는 패키지는 `uvx`로 부릅니다. `uv tool run`과 같은 명령이고, 임시 격리 환경에 받아서 실행한 뒤 프로젝트 환경은 건드리지 않습니다.

```bash
uvx ruff check .
uvx --from httpie http example.com
uv tool install ruff
```

계속 쓸 도구라면 `uv tool install`로 고정해 둡니다. 이때 설치된 도구는 `PATH`에 실행 파일만 올라가고 모듈은 노출되지 않으므로, 프로젝트 코드에서 `import` 해야 하는 패키지는 `uv add` 쪽으로 넣어야 합니다. pytest나 mypy처럼 프로젝트가 설치돼 있어야 동작하는 도구도 `uvx`가 아니라 `uv run`으로 실행합니다.

## 기존 프로젝트 옮기기

requirements.txt만 있는 프로젝트는 `uv add -r`로 그대로 흡수됩니다. `pyproject.toml`이 이미 있다면 `uv sync` 한 번으로 락파일과 환경이 생깁니다.

Poetry에서 넘어올 때는 한 단계를 더 거칩니다. Poetry 2.0부터 `poetry export`가 코어에서 빠져 별도 플러그인이 되었으므로 먼저 설치해야 하고, export 결과에는 `--index-url` 같은 옵션 줄이 섞여 있으므로 걸러내야 합니다.

```bash
poetry self add poetry-plugin-export
poetry export -f requirements.txt --without-hashes | grep -v '^-' > requirements.txt
uv add -r requirements.txt
```

이 방식은 Poetry가 잠가둔 버전을 그대로 옮기는 것이 아니라 uv가 처음부터 다시 해결하게 만듭니다. 잠긴 버전을 반드시 유지해야 한다면 export 결과의 `==` 핀을 살린 채로 넘겨야 합니다.

## 그 밖의 명령

| 명령 | 하는 일 |
|---|---|
| `uv tree` | 의존성 트리 출력 |
| `uv lock --upgrade` | 잠긴 버전을 최신으로 다시 해결 |
| `uv export` | 락파일을 requirements.txt 형식으로 변환 |
| `uv venv --python 3.11` | 특정 버전으로 가상환경 생성 |
| `uv pip list` | 현재 환경에 설치된 패키지 목록 |
| `uv build` | sdist와 wheel 빌드 |
| `uv publish` | 패키지 인덱스에 업로드 |
| `uv cache clean` | 전역 캐시 정리 |

`uv pip` 아래 명령들은 pip와 인자 형태가 같지만 `pyproject.toml`을 고치지 않습니다. 프로젝트 의존성으로 남길 패키지는 `uv add`, 잠깐 확인해 볼 패키지는 `uv pip install`로 갈라 쓰면 됩니다.

패키징 밖으로도 범위가 넓어졌습니다. `uv format`은 Ruff로 코드를 정리합니다. 타입 검사를 돌리는 `uv check`와 의존성을 OSV 취약점 데이터베이스와 대조하는 `uv audit`은 아직 미리보기 기능이라 옵션과 출력이 릴리스마다 바뀝니다.

한편 uv에는 npm scripts 같은 태스크 러너가 없습니다. 자주 쓰는 명령을 이름으로 묶고 싶다면 taskipy 같은 패키지를 의존성으로 넣고 `pyproject.toml`에 정의하는 방법이 있습니다.

```toml
[tool.taskipy.tasks]
dev = { cmd = "PYTHONPATH=. uv run streamlit run src/app.py" }
```

## 마치며

uv의 값어치는 새로운 기능이 아니라 경계가 하나로 줄어든 데 있습니다. 파이썬 버전과 가상환경, 의존성이 각각 다른 도구의 관할이던 시절에는 문제가 생기면 어느 층을 봐야 하는지부터 가려야 했습니다. `uv run` 하나로 실행이 끝나면 그 판단이 없어집니다.

바꿔 말하면 uv를 쓸 때 실제로 익혀야 하는 것은 명령 목록이 아니라 자동 동기화의 경계입니다. 개발 중에는 알아서 맞춰주는 편이 편하지만, 배포 이미지를 굽거나 CI를 짤 때는 `--frozen`과 `--locked`, `--no-sync` 중 무엇을 쓸지 정해두지 않으면 예상하지 못한 시점에 락파일이 바뀝니다.

이미 굴러가는 프로젝트를 통째로 옮기는 것이 부담스럽다면 새로 시작하는 작은 저장소부터 붙여보는 편이 낫습니다. requirements.txt 기반 프로젝트는 `uv add -r` 한 줄로 넘어오지만, Poetry로 잠가둔 버전을 정확히 유지해야 하는 프로젝트라면 옮긴 뒤 해결된 버전을 한 번 대조하는 시간이 필요합니다.

## 참고자료

- [uv 공식 문서](https://docs.astral.sh/uv/)
- [Creating projects](https://docs.astral.sh/uv/concepts/projects/init/)
- [Python versions](https://docs.astral.sh/uv/concepts/python-versions/)
- [uv 0.12.0 release notes](https://github.com/astral-sh/uv/releases/tag/0.12.0)
- [uv: Python packaging in Rust](https://astral.sh/blog/uv)
- [poetry-plugin-export](https://github.com/python-poetry/poetry-plugin-export)
