---
date: '2025-02-17'
title: 'GIL은 무엇을 지키고 무엇을 지키지 않는가'
category: 'Python'
series: 'python'
seriesOrder: 3
summary: 'GIL이 보호하는 것은 인터프리터 내부 상태이지 우리가 짠 코드의 불변식이 아닙니다. 스레드가 실제로 전환되는 지점과 free-threaded 빌드의 현재를 확인합니다.'
thumbnail: './python-logo.png'
---

## GIL이 지키는 것

CPython에서 GIL(Global Interpreter Lock)은 인터프리터 내부 상태를 보호하는 뮤텍스입니다. 여러 스레드가 동시에 파이썬 바이트코드를 실행하는 것을 막습니다.

여기서 GIL이 무엇을 지켜주는지 정확히 짚고 갈 필요가 있습니다. GIL이 보호하는 것은 참조 카운트 같은 **인터프리터 내부 자료구조**이지, 우리가 짠 코드의 불변식이 아닙니다. 원자성이 보장되는 단위도 바이트코드 명령 하나까지입니다. 파이썬 공식 FAQ는 `i = i + 1`, `L.append(L[-1])`, `D[x] = D[x] + 1`을 원자적이지 않은 연산으로 분류하고, "의심스러우면 뮤텍스를 쓰라"는 문장으로 답을 맺습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 262" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스레드 세 개가 GIL을 번갈아 잡으면서 매 시점에 하나씩만 실행되는 모습">
<style>
.gl-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gl-l { fill: var(--text, #1c1917); font-size: 14px; }
.gl-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.gl-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gl-run { fill: var(--primary, #0a756c); }
.gl-wait { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gl-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#glArrow); }
</style>
<defs>
<marker id="glArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="gl-t" x="200" y="22" text-anchor="middle">스레드 3개, GIL 1개</text>
<text class="gl-l" x="14" y="62">스레드 1</text>
<rect class="gl-run" x="88" y="42" width="48" height="28" rx="4"/>
<text class="gl-w" x="112" y="61" text-anchor="middle">실행</text>
<rect class="gl-wait" x="138" y="42" width="48" height="28" rx="4"/>
<rect class="gl-wait" x="188" y="42" width="48" height="28" rx="4"/>
<rect class="gl-run" x="238" y="42" width="48" height="28" rx="4"/>
<text class="gl-w" x="262" y="61" text-anchor="middle">실행</text>
<rect class="gl-wait" x="288" y="42" width="48" height="28" rx="4"/>
<rect class="gl-wait" x="338" y="42" width="48" height="28" rx="4"/>
<text class="gl-l" x="14" y="102">스레드 2</text>
<rect class="gl-wait" x="88" y="82" width="48" height="28" rx="4"/>
<rect class="gl-run" x="138" y="82" width="48" height="28" rx="4"/>
<text class="gl-w" x="162" y="101" text-anchor="middle">실행</text>
<rect class="gl-wait" x="188" y="82" width="48" height="28" rx="4"/>
<rect class="gl-wait" x="238" y="82" width="48" height="28" rx="4"/>
<rect class="gl-run" x="288" y="82" width="48" height="28" rx="4"/>
<text class="gl-w" x="312" y="101" text-anchor="middle">실행</text>
<rect class="gl-wait" x="338" y="82" width="48" height="28" rx="4"/>
<text class="gl-l" x="14" y="142">스레드 3</text>
<rect class="gl-wait" x="88" y="122" width="48" height="28" rx="4"/>
<rect class="gl-wait" x="138" y="122" width="48" height="28" rx="4"/>
<rect class="gl-run" x="188" y="122" width="48" height="28" rx="4"/>
<text class="gl-w" x="212" y="141" text-anchor="middle">실행</text>
<rect class="gl-wait" x="238" y="122" width="48" height="28" rx="4"/>
<rect class="gl-wait" x="288" y="122" width="48" height="28" rx="4"/>
<rect class="gl-run" x="338" y="122" width="48" height="28" rx="4"/>
<text class="gl-w" x="362" y="141" text-anchor="middle">실행</text>
<path class="gl-ax" d="M88 168 L384 168"/>
<text class="gl-n" x="88" y="190">시간</text>
<rect class="gl-wait" x="88" y="212" width="24" height="18" rx="3"/>
<text class="gl-n" x="120" y="226">GIL 대기</text>
<text class="gl-n" x="200" y="252" text-anchor="middle">전환 간격 기본 0.005초</text>
</svg>
</div>

각 스레드는 GIL을 획득해야만 바이트코드를 실행할 수 있고, 그동안 다른 스레드는 대기합니다. 전환 간격은 `sys.getswitchinterval()`로 확인할 수 있고 기본값은 0.005초입니다. GIL이 켜져 있는 한 스레드를 몇 개 띄우든 파이썬 바이트코드는 한 번에 하나씩만 실행됩니다. 다만 커널을 기다리는 I/O 구간이나 GIL을 명시적으로 놓는 C 코드 안에서는 실제로 동시에 진행됩니다. 표준 라이브러리에도 그런 자리가 있어서, `hashlib`은 한 번에 2047바이트를 넘는 데이터를 받으면 해시를 계산하는 동안 GIL을 놓습니다.

## 스레드가 실제로 전환되는 자리

전환은 바이트코드 명령 **사이**에서 일어납니다. 명령 여러 개로 쪼개지는 연산은 그 사이에서 끊길 수 있다는 뜻입니다. `total += 1` 한 줄은 반복문 안에서 다음처럼 컴파일됩니다.

```text
LOAD_GLOBAL     total
LOAD_CONST      1
BINARY_OP       +=
STORE_GLOBAL    total
JUMP_BACKWARD
```

그런데 CPython 3.13에서 GIL을 넘겨줄지 검사하는 자리는 명령 하나하나가 아니라 세 종류로 정해져 있습니다. 반복문이 되돌아가는 `JUMP_BACKWARD`, 함수를 부르는 `CALL` 계열, 함수 본문이 시작되는 `RESUME`입니다. `Python/bytecodes.c`에서 `CHECK_EVAL_BREAKER()`가 붙어 있는 자리가 여기뿐입니다.

위 다섯 줄에는 값을 읽는 `LOAD_GLOBAL`과 되돌려 쓰는 `STORE_GLOBAL` 사이에 검사 지점이 없습니다. 스레드 네 개가 각각 백만 번씩 `total += 1`을 돌려도 400만이 그대로 나오는 이유입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 470" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="두 가지 증가 코드의 바이트코드를 위아래로 비교해, 함수 호출이 낀 쪽에서만 읽기와 쓰기 사이에 GIL 인계 검사 지점이 생기는 것을 보여주는 그림">
<style>
.bc-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.bc-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.bc-l { fill: var(--text, #1c1917); font-size: 14px; }
.bc-m { fill: var(--text-muted, #6d6762); font-size: 14px; }
.bc-ok { fill: var(--text-success, #107836); font-size: 14px; }
.bc-no { fill: var(--text-danger, #cb2121); font-size: 14px; }
.bc-wt { fill: var(--text-warn, #9d5604); font-size: 14px; }
.bc-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.bc-hit { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
</style>
<text class="bc-t" x="200" y="26" text-anchor="middle">GIL 인계를 검사하는 자리</text>
<!-- 패널 A -->
<text class="bc-h" x="16" y="56">total += 1</text>
<rect class="bc-box" x="16" y="66" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="84">LOAD_GLOBAL</text>
<text class="bc-m" x="180" y="84">total</text>
<rect class="bc-box" x="16" y="96" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="114">LOAD_CONST</text>
<text class="bc-m" x="180" y="114">1</text>
<rect class="bc-box" x="16" y="126" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="144">BINARY_OP</text>
<text class="bc-m" x="180" y="144">+=</text>
<rect class="bc-box" x="16" y="156" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="174">STORE_GLOBAL</text>
<text class="bc-m" x="180" y="174">total</text>
<rect class="bc-hit" x="16" y="186" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="204">JUMP_BACKWARD</text>
<text class="bc-wt" x="274" y="204">검사 지점</text>
<text class="bc-ok" x="200" y="234" text-anchor="middle">읽기와 쓰기 사이 검사 지점 없음</text>
<!-- 패널 B -->
<text class="bc-h" x="16" y="272">total = total + one()</text>
<rect class="bc-box" x="16" y="282" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="300">LOAD_GLOBAL</text>
<text class="bc-m" x="180" y="300">total</text>
<rect class="bc-box" x="16" y="312" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="330">LOAD_GLOBAL</text>
<text class="bc-m" x="180" y="330">one</text>
<rect class="bc-hit" x="16" y="342" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="360">CALL</text>
<text class="bc-wt" x="274" y="360">검사 지점</text>
<rect class="bc-box" x="16" y="372" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="390">BINARY_OP</text>
<text class="bc-m" x="180" y="390">+</text>
<rect class="bc-box" x="16" y="402" width="248" height="26" rx="4"/>
<text class="bc-l" x="28" y="420">STORE_GLOBAL</text>
<text class="bc-m" x="180" y="420">total</text>
<text class="bc-no" x="200" y="450" text-anchor="middle">읽기와 쓰기 사이 검사 지점 있음</text>
</svg>
</div>

한 줄에 함수 호출이 하나 끼는 순간 이야기가 달라집니다.

```python
import threading

total = 0


def one():
    return 1


def worker():
    global total
    for _ in range(1_000_000):
        total = total + one()


threads = [threading.Thread(target=worker) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(total)
```

`CALL`에서 GIL이 넘어가면 이미 읽어 둔 `total` 값은 그 스레드의 스택에 그대로 남습니다. 다른 스레드가 그동안 수십만 번을 더해 놓아도, 원래 스레드는 자기가 읽었던 옛 값에 1을 더해 덮어씁니다. 결과는 400만의 절반 안팎이고 실행할 때마다 달라집니다.

:::warning

**검사 지점은 기댈 곳이 아닙니다**

`total += 1`이 값을 잃지 않는 것은 3.13 인터프리터의 구현 세부사항입니다. 공식 FAQ는 `i = i + 1`을 원자적이지 않은 연산으로 분류하고 있고, 사이에 프로퍼티나 `__add__` 같은 파이썬 코드가 끼는 순간 그대로 깨집니다.

:::

## 왜 GIL이었나

파이썬은 모든 것이 객체이고, 객체마다 자신을 가리키는 참조의 개수를 들고 있습니다. 참조가 늘면 카운트가 오르고 0이 되면 그 자리에서 메모리가 해제됩니다. 이 갱신은 인터프리터가 코드를 실행하는 내내 수도 없이 일어납니다.

여러 스레드가 이 카운트를 동시에 건드리면 카운트가 실제 참조 수와 어긋납니다. 아직 쓰이는 객체가 해제되거나, 아무도 쓰지 않는 객체가 영원히 남습니다. 인터프리터 전체에 자물쇠 하나를 걸면 이 문제가 통째로 사라집니다. 객체마다 lock을 붙이고 획득 순서를 관리하는 일도, 그 lock을 잡고 푸는 비용도 필요 없어집니다.

대가는 분명합니다. 파이썬 코드로 짠 CPU 작업은 스레드를 몇 개 띄우든 한 번에 하나씩만 돕니다.

## 멀티스레딩이 이득인 경우

CPU 바운드 작업은 계산 자체가 시간을 잡아먹고, I/O 바운드 작업은 디스크나 네트워크의 응답을 기다리느라 시간을 씁니다. 기다리는 동안 CPython은 GIL을 놓습니다. 이 차이가 결과에 그대로 나타납니다.

같은 작업 여덟 개를 순차 실행, 스레드 4개, 프로세스 4개로 처리해 봤습니다. CPU 바운드 쪽은 파이썬 반복문 계산이고, I/O 바운드 쪽은 한 번에 0.25초씩 걸리는 블로킹 호출입니다.

| 실행 방식 | CPU 바운드 | I/O 바운드 |
|---|---|---|
| 순차 | 1.16초 | 2.03초 |
| 스레드 4개 | 1.16초 | 0.51초 |
| 프로세스 4개 | 0.43초 | 0.58초 |

CPU 바운드에서 스레드는 아무것도 하지 못하고 GIL을 주고받는 비용만 더합니다. 여기서 병렬성을 얻으려면 프로세스를 띄우거나 GIL을 놓는 C 확장으로 계산을 내려보내야 합니다. 반대로 I/O 바운드에서는 스레드가 프로세스와 같은 성능을 내면서 기동 비용과 메모리는 훨씬 적게 씁니다. 웹 요청, DB 조회, 파일 읽기가 대부분인 코드라면 스레드로 충분합니다.

## GIL을 걷어내는 작업

Python 3.13에 PEP 703에 따른 free-threaded 빌드가 실험 단계로 들어갔습니다. `--disable-gil`로 빌드하면 ABI 태그에 `t`가 붙고 실행 파일은 보통 `python3.13t`라는 이름을 갖습니다. 이어서 PEP 779가 통과되면서 free-threaded 파이썬은 3.14에서 실험 단계를 벗어나 공식 지원 단계로 올라섰습니다.

남은 걸림돌은 두 가지입니다. 하나는 단일 스레드 성능입니다. GIL이 있다는 전제로 최적화되어 있던 부분을 세밀한 lock으로 바꾸면 오버헤드가 붙습니다. PEP 779는 pyperformance 기준으로 이 손해를 10% 정도(macOS에서는 3% 정도)로 적고, 15%를 넘지 않는 것을 목표로 잡았습니다. 다른 하나는 서드파티 C 확장입니다. GIL을 가정하고 작성된 확장 모듈은 각자 손을 봐야 합니다.

지금 쓰는 인터프리터가 어느 쪽인지 확인하는 방법도 알아둘 만합니다. `sys._is_gil_enabled()`는 3.13부터 일반 빌드에도 있어서, 함수가 존재한다는 사실만으로는 판별이 되지 않습니다. 빌드 자체를 확인하려면 `sysconfig.get_config_var("Py_GIL_DISABLED")`를 봅니다. 공식 문서가 권하는 방법입니다.

```python
>>> import sys, sysconfig
>>> sysconfig.get_config_var("Py_GIL_DISABLED")
0
>>> sys._is_gil_enabled()
True
```

GIL을 없애는 것과 별개로, 인터프리터마다 GIL을 따로 갖는 방향도 있습니다. PEP 684의 per-interpreter GIL이 3.12에 C API로 들어갔고, 파이썬 코드에서 쓸 수 있는 `concurrent.interpreters`는 PEP 734로 3.14에 들어왔습니다.

## 마치며

GIL은 인터프리터의 메모리 관리를 지키는 장치입니다. 참조 카운트가 어긋나지 않게 해 줄 뿐, 우리가 만든 공유 상태까지 지켜주지는 않습니다. 그래서 GIL이 있는 파이썬에서도 lock은 여전히 필요합니다.

실무에서 판단이 갈리는 지점은 결국 작업의 성격입니다. 기다리는 시간이 대부분이라면 스레드가 값싸고 잘 듭니다. 계산이 대부분이라면 스레드를 아무리 늘려도 소용이 없고, 프로세스로 나누거나 계산을 C 쪽으로 내려보내야 합니다. free-threaded 빌드가 공식 지원 단계에 올라섰지만, 쓰는 확장 모듈이 전부 대응하기 전까지 이 판단 기준은 그대로 유효합니다.

## 함께 보면 좋은 글

- [참조 카운팅](/python/reference-counting/) : GIL이 지키려는 참조 카운트가 어떻게 오르내리는지
- [가비지 컬렉션](/python/garbage-collection/) : 참조 카운트만으로 못 지우는 순환 참조를 처리하는 방법
- [스레드 동기화](/python/synchronize-thread/) : 경쟁 상태를 막는 여섯 가지 도구

## 참고자료

- [What kinds of global value mutation are thread-safe? - Python FAQ](https://docs.python.org/3/faq/library.html#what-kinds-of-global-value-mutation-are-thread-safe)
- [Thread State and the Global Interpreter Lock - Python Docs](https://docs.python.org/3/c-api/init.html#thread-state-and-the-global-interpreter-lock)
- [Python support for free threading - Python Docs](https://docs.python.org/3/howto/free-threading-python.html)
- [CPython Source: Python/bytecodes.c](https://github.com/python/cpython/blob/3.13/Python/bytecodes.c)
- [PEP 703 - Making the Global Interpreter Lock Optional in CPython](https://peps.python.org/pep-0703/)
- [PEP 779 - Criteria for supported status for free-threaded Python](https://peps.python.org/pep-0779/)
