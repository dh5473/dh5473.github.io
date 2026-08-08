---
date: '2025-02-27'
title: 'Lock부터 Barrier까지, GIL이 있어도 동기화가 필요한 이유'
category: 'Python'
series: 'python'
seriesOrder: 4
summary: 'GIL은 바이트코드 하나까지만 원자성을 보장합니다. Lock부터 Barrier까지 여섯 가지 동기화 프리미티브가 각각 무엇을 보장하고 어디서 어긋나는지 정리합니다.'
thumbnail: './python-logo.png'
---

파이썬에서 GIL은 여러 스레드가 동시에 바이트코드를 실행하는 것을 막습니다. 덕분에 참조 카운팅 같은 인터프리터 내부의 메모리 관리는 알아서 안전하게 돌아갑니다. 그렇다면 우리가 짠 코드에는 lock이 필요 없을까요?

GIL이 보장하는 원자성은 바이트코드 명령 하나까지입니다. 우리가 쓰는 코드 한 줄은 보통 그 명령 여러 개로 컴파일되고, 스레드는 그 사이에서 갈릴 수 있습니다. 값을 읽고, 더하고, 되돌려 쓰는 한 줄이 대표적입니다.

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

400만이 나와야 할 자리에 그 절반 안팎의 값이 나오고, 실행할 때마다 달라집니다. 어떤 스레드가 `total`을 읽어 둔 뒤 그 값을 되돌려 쓰기 전에 다른 스레드로 넘어가면, 그사이에 쌓인 갱신이 통째로 덮여 사라지기 때문입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 268" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스레드 A가 값을 읽은 시점과 되돌려 쓰는 시점 사이에 스레드 B가 올려놓은 갱신이 통째로 사라지는 순서를 보여주는 그림">
<style>
.lu-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.lu-l { fill: var(--text, #1c1917); font-size: 14px; }
.lu-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.lu-c { fill: var(--on-fill, #ffffff); font-size: 14px; font-weight: 700; }
.lu-d { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.lu-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.lu-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.lu-chip { fill: var(--primary, #0a756c); }
.lu-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#luArrow); }
</style>
<defs>
<marker id="luArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="lu-t" x="200" y="26" text-anchor="middle">갱신이 사라지는 순서</text>
<rect class="lu-box" x="16" y="44" width="368" height="34" rx="5"/>
<rect class="lu-chip" x="28" y="49" width="30" height="24" rx="4"/>
<text class="lu-c" x="43" y="66" text-anchor="middle">A</text>
<text class="lu-l" x="70" y="66">total 읽기 (값 0)</text>
<path class="lu-a" d="M200 78 L200 88"/>
<rect class="lu-box" x="16" y="90" width="368" height="34" rx="5"/>
<rect class="lu-chip" x="28" y="95" width="30" height="24" rx="4"/>
<text class="lu-c" x="43" y="112" text-anchor="middle">B</text>
<text class="lu-l" x="70" y="112">total을 n번 증가 (값 n)</text>
<path class="lu-a" d="M200 124 L200 134"/>
<rect class="lu-box" x="16" y="136" width="368" height="34" rx="5"/>
<rect class="lu-chip" x="28" y="141" width="30" height="24" rx="4"/>
<text class="lu-c" x="43" y="158" text-anchor="middle">A</text>
<text class="lu-l" x="70" y="158">읽어 둔 0에 1을 더해 저장</text>
<path class="lu-a" d="M200 170 L200 180"/>
<rect class="lu-bad" x="16" y="182" width="368" height="34" rx="5"/>
<text class="lu-d" x="200" y="204" text-anchor="middle">total = 1</text>
<text class="lu-n" x="200" y="244" text-anchor="middle">B의 증가 n번이 사라짐</text>
</svg>
</div>

이 자리를 막는 도구가 `threading` 모듈의 동기화 프리미티브입니다. `asyncio`에도 이름이 같은 것들이 있지만 보장하는 바가 다르고 스레드 세이프하지 않으니, 아래 내용은 전부 `threading` 기준으로 읽어야 합니다.

## Lock

Lock은 가장 단순한 프리미티브입니다. locked와 unlocked 두 상태만 있고, `acquire()`로 잡고 `release()`로 풉니다. 앞의 코드에서 읽기부터 쓰기까지를 lock으로 감싸면 400만이 정확히 나옵니다.

```python
lock = threading.Lock()
total = 0


def worker():
    global total
    for _ in range(1_000_000):
        with lock:
            total = total + one()
```

`with`를 쓰는 이유는 예외 때문입니다. `acquire()`와 `release()`를 직접 부르면 그 사이에서 예외가 났을 때 lock이 잠긴 채로 남고, 그 lock을 기다리던 스레드는 영영 깨어나지 못합니다.

Lock에는 **소유자 개념이 없습니다**. 누가 잠갔는지 기록하지 않으므로 아무 스레드나 풀 수 있고, 자기 자신이 잡은 lock도 다시 잡지 못합니다. 이미 풀려 있는 lock을 풀면 `RuntimeError`가 납니다.

```python
import threading

lock = threading.Lock()

lock.acquire()
print(lock.acquire(blocking=False))   # False
lock.release()
lock.release()                        # RuntimeError: release unlocked lock
```

두 번째 `acquire()`를 `blocking=False` 없이 부르면 그 자리에서 영원히 멈춥니다. 위 예제가 굳이 반환값만 확인하고 넘어가는 이유입니다.

## RLock

RLock(re-entrant lock)은 같은 스레드의 재획득을 허용합니다. 대신 획득한 횟수를 세고, 그 횟수만큼 `release()`를 불러야 완전히 풀립니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 254" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 스레드가 다시 acquire할 때 Lock은 멈추고 RLock은 카운터가 올라가며 통과하는 대비">
<style>
.lk-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.lk-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.lk-l { fill: var(--text, #1c1917); font-size: 14px; }
.lk-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.lk-dt { fill: var(--text-danger, #cb2121); font-size: 14px; }
.lk-st { fill: var(--text-success, #107836); font-size: 14px; }
.lk-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.lk-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.lk-ok { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.lk-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#lkArrow); }
</style>
<defs>
<marker id="lkArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="lk-t" x="200" y="22" text-anchor="middle">같은 스레드가 다시 acquire하면</text>
<text class="lk-h" x="104" y="46" text-anchor="middle">Lock</text>
<text class="lk-h" x="296" y="46" text-anchor="middle">RLock</text>
<rect class="lk-box" x="16" y="56" width="176" height="30" rx="5"/>
<text class="lk-l" x="104" y="76" text-anchor="middle">acquire()</text>
<rect class="lk-box" x="208" y="56" width="176" height="30" rx="5"/>
<text class="lk-l" x="296" y="76" text-anchor="middle">acquire()</text>
<path class="lk-a" d="M104 86 L104 96"/>
<path class="lk-a" d="M296 86 L296 96"/>
<rect class="lk-box" x="16" y="98" width="176" height="30" rx="5"/>
<text class="lk-l" x="104" y="118" text-anchor="middle">잠김</text>
<rect class="lk-box" x="208" y="98" width="176" height="30" rx="5"/>
<text class="lk-l" x="296" y="118" text-anchor="middle">카운트 1</text>
<path class="lk-a" d="M104 128 L104 138"/>
<path class="lk-a" d="M296 128 L296 138"/>
<rect class="lk-box" x="16" y="140" width="176" height="30" rx="5"/>
<text class="lk-l" x="104" y="160" text-anchor="middle">acquire() 재시도</text>
<rect class="lk-box" x="208" y="140" width="176" height="30" rx="5"/>
<text class="lk-l" x="296" y="160" text-anchor="middle">acquire() 재시도</text>
<path class="lk-a" d="M104 170 L104 180"/>
<path class="lk-a" d="M296 170 L296 180"/>
<rect class="lk-bad" x="16" y="182" width="176" height="30" rx="5"/>
<text class="lk-dt" x="104" y="202" text-anchor="middle">여기서 멈춤</text>
<rect class="lk-ok" x="208" y="182" width="176" height="30" rx="5"/>
<text class="lk-st" x="296" y="202" text-anchor="middle">카운트 2로 통과</text>
<text class="lk-n" x="200" y="242" text-anchor="middle">RLock은 release()도 그만큼 필요</text>
</svg>
</div>

```python
import threading

lock = threading.RLock()
num = 0

lock.acquire()
num += 3
lock.acquire()      # 같은 스레드라 막히지 않습니다
num += 4
lock.release()
lock.release()      # acquire한 횟수만큼 release해야 완전히 풀립니다

print(num)          # 7
```

재귀 함수나, lock을 잡은 채로 같은 lock을 쓰는 다른 메서드를 호출하는 구조에서 RLock이 필요해집니다.

## Semaphore

세마포어는 동시에 들어갈 수 있는 스레드 수를 셉니다. `acquire()`마다 카운터가 하나 줄고 `release()`마다 하나 늘며, 0이 되면 그다음 `acquire()`가 막힙니다. 커넥션 풀이나 동시 다운로드 수처럼 "동시에 N개까지"를 강제해야 하는 자리에 씁니다.

```python
import threading, time

sem = threading.BoundedSemaphore(2)
guard = threading.Lock()
running = 0
peak = 0


def work():
    global running, peak
    with sem:
        with guard:
            running += 1
            peak = max(peak, running)
        time.sleep(0.2)
        with guard:
            running -= 1


threads = [threading.Thread(target=work) for _ in range(6)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(peak)   # 2
```

Semaphore와 BoundedSemaphore 두 가지가 있습니다. Semaphore는 `release()`에 상한이 없어서 잡은 적 없는 자원도 계속 반납할 수 있고, 그러면 카운터가 초기값을 넘어 늘어납니다. BoundedSemaphore는 초기값을 넘는 `release()`에서 `ValueError`를 냅니다. 짝이 맞지 않는 호출을 조용히 넘기는 대신 그 자리에서 터뜨리므로 기본 선택으로 삼을 만합니다.

```python
sem = threading.BoundedSemaphore(2)
sem.release()   # ValueError: Semaphore released too many times
```

## Event

Event는 스레드 사이의 신호입니다. 내부에 불리언 플래그 하나를 들고 `set()`으로 켜고 `clear()`로 끕니다. `wait()`를 부른 스레드는 플래그가 켜질 때까지 멈춰 있다가, 켜지는 순간 한꺼번에 풀립니다. 초기화가 끝날 때까지 작업 스레드를 붙잡아 두는 용도가 대표적입니다.

```python
import threading, time

ready = threading.Event()
config = {}


def consumer():
    ready.wait()
    print("설정을 받았습니다:", config)


def loader():
    time.sleep(0.5)
    config["url"] = "postgres://localhost"
    ready.set()


threading.Thread(target=consumer).start()
threading.Thread(target=loader).start()
```

:::warning

**Event로 개수를 세지 마세요**

`wait()`에서 깨어난 스레드가 `clear()`를 부르기까지 사이에 다른 스레드가 `set()`을 한 번 더 부르면 그 신호는 그대로 지워집니다. Event는 켜졌는지 아닌지만 알 뿐 몇 번 켜졌는지는 세지 않기 때문입니다. 신호의 개수가 의미를 갖는다면 Condition이나 `queue.Queue`를 씁니다.

:::

## Condition

Condition은 Event의 상위 호환이 아니라 다른 프리미티브입니다. Event가 플래그라는 상태를 들고 있는 반면, Condition은 상태를 들고 있지 않고 lock과 `wait()`, `notify()`를 묶어 놓기만 합니다. 무엇을 기다리는지는 우리가 직접 들고 있어야 합니다.

그래서 조건을 `while` 루프로 검사하면서 기다리는 형태로 씁니다. 아래에서 소비자가 `if`가 아니라 `while not box`로 검사하는 이유가 그것입니다. `notify()`를 받고 깨어났더라도 다른 소비자가 먼저 가져가 조건이 다시 거짓일 수 있습니다.

`wait()`와 `notify()`는 lock을 보유한 상태에서 불러야 하고, 그렇지 않으면 `RuntimeError`가 납니다. `with condition:` 블록이 그 lock을 대신 잡아 줍니다.

```python
import threading, time

condition = threading.Condition()
box = []


def producer():
    for i in range(3):
        time.sleep(0.2)
        with condition:
            box.append(i)
            condition.notify()


def consumer():
    for _ in range(3):
        with condition:
            while not box:
                condition.wait()
            print("소비:", box.pop())


threads = [threading.Thread(target=consumer), threading.Thread(target=producer)]
for t in threads:
    t.start()
for t in threads:
    t.join()
```

## Barrier

Barrier는 정해진 수의 스레드가 모두 도착할 때까지 서로를 기다리게 합니다. 마지막 스레드가 도착하면 전부 동시에 풀립니다. 단계로 나뉜 병렬 작업에서 앞 단계가 다 끝나야 다음 단계로 넘어갈 수 있을 때 씁니다.

```python
import threading, time

barrier = threading.Barrier(3)


def worker(i):
    time.sleep(i * 0.1)
    index = barrier.wait()
    if index == 0:
        print("뒷정리는 한 스레드만")
    print("통과:", i)


threads = [threading.Thread(target=worker, args=(i,)) for i in range(3)]
for t in threads:
    t.start()
for t in threads:
    t.join()
```

`wait()`는 0부터 `parties - 1`까지 스레드마다 서로 다른 정수를 돌려줍니다. 위처럼 특정 값을 받은 스레드에게만 뒷정리를 맡기는 데 쓸 수 있습니다.

## 프리미티브를 직접 잡기 전에

여기까지가 `threading`이 주는 도구들이지만, 실무에서 먼저 검토할 것은 공유 상태를 아예 만들지 않는 쪽입니다.

스레드 사이로 값을 넘겨야 한다면 `queue.Queue`가 lock과 Condition을 이미 안에 넣어 두고 있습니다. 작업을 나눠 돌리고 결과만 받으면 되는 구조라면 `concurrent.futures.ThreadPoolExecutor`가 스레드 수명과 결과 수집을 대신합니다. 직접 Lock을 잡아야 하는 상황은 이 둘로 표현되지 않을 때입니다.

## 마치며

GIL은 인터프리터의 내부 자료구조를 지킬 뿐, 우리가 만든 공유 변수까지 지켜주지는 않습니다. 읽고 고쳐서 되돌려 쓰는 코드가 있고 그 코드에 스레드가 둘 이상 들어온다면, 언어가 무엇이든 lock은 필요합니다.

고를 때의 기준은 비교적 단순합니다. 한 번에 하나만 들어가야 하면 Lock, 그 코드가 자기 자신을 다시 부를 수 있으면 RLock, 동시 입장 수를 정해야 하면 BoundedSemaphore입니다. 기다림 쪽은 켜졌는지만 보면 되면 Event, 조건을 매번 다시 검사해야 하면 Condition, 모두가 모여야 하면 Barrier입니다. 다만 이 목록을 꺼내기 전에 큐나 스레드 풀로 문제를 다시 써 볼 가치가 있습니다. 잡을 lock이 없으면 잘못 잡을 일도 없습니다.

## 함께 보면 좋은 글

- [Global Interpreter Lock](/python/global-interpreter-lock/) : 스레드 전환이 실제로 일어나는 지점
- [참조 카운팅](/python/reference-counting/) : GIL이 보호하는 인터프리터 내부 상태의 정체
- [가비지 컬렉션](/python/garbage-collection/) : 참조 카운트만으로 못 지우는 순환 참조를 처리하는 방법

## 참고자료

- [threading - Python Docs](https://docs.python.org/3/library/threading.html)
- [queue - Python Docs](https://docs.python.org/3/library/queue.html)
- [concurrent.futures - Python Docs](https://docs.python.org/3/library/concurrent.futures.html)
- [What kinds of global value mutation are thread-safe? - Python FAQ](https://docs.python.org/3/faq/library.html#what-kinds-of-global-value-mutation-are-thread-safe)
- [CPython Source: Lib/threading.py](https://github.com/python/cpython/blob/3.13/Lib/threading.py)
