---
date: '2025-02-27'
title: '[Python] Thread Synchronization'
category: 'Python'
series: 'python'
seriesOrder: 4
summary: 'Python의 다양한 스레드 동기화 도구들과 활용 방법에 대해 알아봅니다.'
thumbnail: './python-logo.png'
---

파이썬에서 GIL은 멀티스레딩 환경에서 단일 스레드만 파이썬 바이트코드를 실행하도록 제한합니다. 덕분에 참조 카운팅과 같은 인터프리터 내부의 메모리 관리 메커니즘은 안전하게 돌아갑니다. 그렇다면 파이썬에 lock이 필요할까요? GIL은 중요한 역할을 하지만, 그렇다고 모든 동시성 문제를 해결해주지는 않습니다.

GIL이 보장하는 원자성은 **바이트코드 명령 하나**까지입니다. 그런데 우리가 쓰는 코드 한 줄은 보통 여러 개의 명령으로 컴파일됩니다. `total += 1`만 해도 `LOAD_GLOBAL`, `LOAD_CONST`, `BINARY_OP`, `STORE_GLOBAL` 네 개입니다. 스레드 전환은 바로 이 명령들 **사이**에서 일어나므로, 값을 읽은 뒤 쓰기 전에 다른 스레드가 끼어들 수 있습니다. 파이썬 공식 FAQ도 `i = i + 1`, `D[x] = D[x] + 1` 같은 복합 연산을 비원자적 연산으로 못 박고 "의심스러우면 뮤텍스를 쓰라"고 끝맺습니다.

결국은 동기화 문제를 해결해야 한다는 것인데, 파이썬은 동기화를 위해 어떠한 프리미티브(primitives)를 제공하고 있을까요? 참고로 아래 내용은 전부 `threading` 모듈 기준입니다. `asyncio`에도 이름이 같은 프리미티브들이 있지만 보장하는 바가 다르고, 그쪽은 스레드 세이프하지 않습니다.

## Lock

Lock은 파이썬에서 가장 심플한 동기화 프리미티브입니다. Lock은 locked와 unlocked 두 가지 상태만 존재합니다. 여기에 사용되는 메서드도 `acquire()`와 `release()`로 매우 단순합니다. 주의할 점은 unlocked 상태에서 `release()`를 호출할 경우 `RuntimeError`가 발생한다는 것입니다.

```python
from threading import Lock, Thread

lock = Lock()
total = 0


def add_one():
    global total

    lock.acquire()
    total += 1
    lock.release()


def add_two():
    global total

    lock.acquire()
    total += 2
    lock.release()


threads = []

for func in [add_one, add_two]:
    threads.append(Thread(target=func))
    threads[-1].start()

for thread in threads:
    thread.join()

print(total)
```

## RLock

기존의 Lock은 어떤 스레드가 lock을 획득했는지 알지 못합니다. 누군가 락을 소유하고 있다면, 다른 스레드가 lock을 획득하려고 시도해도 block 됩니다. 심지어 스레드 자기 자신이 lock을 보유하고 있어도 마찬가지입니다.

RLock(re-entrant lock)은 이러한 상황을 해결할 수 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 254" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 스레드가 다시 acquire할 때 Lock은 멈추고 RLock은 카운터가 올라가며 통과하는 대비">
<style>
.lk-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.lk-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.lk-l { fill: var(--text, #1c1917); font-size: 14px; }
.lk-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.lk-dt { fill: var(--text-danger, #dc2626); font-size: 14px; }
.lk-st { fill: var(--text-success, #16a34a); font-size: 14px; }
.lk-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.lk-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.5; }
.lk-ok { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #16a34a); stroke-width: 1.5; }
.lk-a { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#lkArrow); }
</style>
<defs>
<marker id="lkArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
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

먼저 Lock입니다. 같은 스레드에서 두 번째 `acquire()`를 호출하면 그 자리에서 영원히 멈춥니다. 그래서 아래 예제는 `blocking=False`로 확인만 하고 넘어갑니다. 그냥 `acquire()`를 부르면 스크립트가 끝나지 않습니다.

```python
import threading

lock = threading.Lock()

lock.acquire()
print(lock.acquire(blocking=False))  # False, 자기 자신도 다시 잡을 수 없습니다
lock.release()
```

RLock은 같은 스레드의 재획득을 허용하고, 대신 획득한 횟수를 셉니다. `acquire()`를 부른 만큼 `release()`도 불러야 완전히 풀립니다.

```python
import threading

num = 0
lock = threading.RLock()

lock.acquire()
num += 3
lock.acquire()  # 같은 스레드이므로 block 되지 않습니다
num += 4
lock.release()
lock.release()  # acquire를 부른 횟수만큼 release가 필요합니다

print(num)  # 7
```

재귀 함수나, lock을 잡은 채로 같은 lock을 쓰는 다른 메서드를 호출하는 구조에서 RLock이 필요해집니다.

## Semaphore

운영체제에서 필수적으로 등장하는 세마포어입니다. 세마포어의 경우 특정 수만큼의 스레드가 `acquire()`를 시도해야만 block 됩니다. 세마포어의 카운터는 `acquire()`가 호출될 때마다 감소하고, `release()`가 호출될 때마다 증가합니다.

파이썬은 Semaphore와 BoundedSemaphore 클래스 두 가지를 제공합니다. Semaphore의 경우 `release()`에 대한 상한선이 없어서, 계속해서 `release()`가 가능합니다. 반면 BoundedSemaphore의 경우 설정해둔 최댓값을 넘어서는 `release()`를 호출할 경우 `ValueError`를 일으킵니다. 대부분의 경우 복잡한 프로그래밍 에러를 피하기 위해서, BoundedSemaphore를 선택하면 됩니다.

```python
import random, time
from threading import BoundedSemaphore, Thread

max_items = 5  # 생략하면 기본값은 1입니다
container = BoundedSemaphore(max_items)


def producer(nloops):
    for _ in range(nloops):
        time.sleep(random.randrange(2, 5))
        print(time.ctime(), end=": ")

        try:
            container.release()
            print("Produced an item.")
        except ValueError:
            print("Full, skipping.")


def consumer(nloops):
    for _ in range(nloops):
        time.sleep(random.randrange(2, 5))
        print(time.ctime(), end=": ")

        if container.acquire(blocking=False):
            print("Consumed an item.")
        else:
            print("Empty, skipping.")


threads = []
nloops = random.randrange(3, 6)
print("Starting with %s items." % max_items)

threads.append(Thread(target=producer, args=(nloops, )))
threads.append(Thread(target=consumer, args=(random.randrange(nloops, nloops + max_items + 2), )))

for thread in threads:
    thread.start()

for thread in threads:
    thread.join()

print("All done.")
```

## Event

Event 동기화 프리미티브는 스레드 사이에서 간단한 커뮤니케이터로 작동합니다. 스레드는 내부 플래그를 `set()` 혹은 `clear()`로 설정할 수 있으며, 다른 스레드들은 `wait()`를 통해 플래그가 set이 될 때까지 대기합니다.

```python
import random, time
from threading import Event, Thread

event = Event()


def waiter(event, nloops):
    for i in range(nloops):
        print("%s. Waiting for the flag to be set." % (i+1))
        event.wait()  # blocks until the flag become true
        print("Wait complete at:", time.ctime())
        event.clear()  # resets the flag

        print()


def setter(event, nloops):
    for _ in range(nloops):
        time.sleep(random.randrange(2, 5))  # sleeps for some time
        event.set()


threads = []
nloops = random.randrange(3, 6)

threads.append(Thread(target=waiter, args=(event, nloops)))
threads[-1].start()

threads.append(Thread(target=setter, args=(event, nloops)))
threads[-1].start()

for thread in threads:
    thread.join()

print("All done.")
```

이 예제에는 짚어둘 위험이 하나 있습니다. waiter가 `wait()`에서 깨어난 뒤 `clear()`를 부르기까지 사이에 setter가 `set()`을 한 번 더 부르면, 그 신호가 지워져 waiter가 영영 깨어나지 못합니다. `sleep` 덕분에 실제로는 잘 재현되지 않지만 구조적으로 가능한 일이므로, 신호를 세야 하는 상황이라면 Event 대신 Condition이나 `queue.Queue`를 쓰는 편이 안전합니다.

## Condition

Condition은 Event의 상위 호환이 아니라 **다른 프리미티브**입니다. Event가 플래그라는 상태를 들고 있는 반면, Condition은 상태를 들고 있지 않고 lock과 `wait()`/`notify()`를 묶어 놓은 것입니다. 조건을 판단할 상태는 우리가 직접 들고 있어야 합니다.

그래서 Condition은 "조건 술어를 `while` 루프로 검사하면서 기다린다"는 패턴으로 씁니다. 아래 예제에서 consumer가 `if`가 아니라 `while len(box) == 0`으로 검사하는 것이 그 이유입니다. `notify()`를 받고 깨어났더라도 조건이 다시 거짓일 수 있기 때문입니다.

`wait()`와 `notify()`는 반드시 lock을 보유한 상태에서 호출해야 합니다. 그렇지 않으면 `RuntimeError`가 납니다.

```python
import random, time
from threading import Condition, Thread

condition = Condition()
box = []


def producer(box, nitems):
    for _ in range(nitems):
        time.sleep(random.randrange(2, 5))

        with condition:
            num = random.randint(1, 10)
            box.append(num)
            print("Produced:", num)
            condition.notify()  # send a notification to consumer


def consumer(box, nitems):
    for _ in range(nitems):
        with condition:
            while len(box) == 0:
                print("Nothing to consume, waiting...")
                condition.wait()  # wait for the notification from producer
            num = box.pop()
            print("Consumed:", num)


threads = []
nitems = random.randrange(3, 6)

threads.append(Thread(target=consumer, args=(box, nitems)))
threads.append(Thread(target=producer, args=(box, nitems)))

for thread in threads:
    thread.start()

for thread in threads:
    thread.join()

print("All done.")
```

## Barrier

Barrier는 특정 수의 스레드가 모두 barrier 지점에 도달할 때까지 기다리는 동기화 프리미티브입니다. 모든 스레드가 도착하면 동시에 계속 진행됩니다.

```python
import random, time
from threading import Barrier, Thread, current_thread

barrier = Barrier(3)  # wait for 3 threads


def worker(barrier):
    # do some work
    time.sleep(random.randrange(1, 4))
    worker_id = current_thread().ident
    print(f"Worker {worker_id} finished work, waiting at barrier...")

    barrier.wait()  # wait until all threads reach this point

    print(f"Worker {worker_id} passed the barrier!")


threads = []

for i in range(3):
    threads.append(Thread(target=worker, args=(barrier,)))
    threads[-1].start()

for thread in threads:
    thread.join()

print("All workers finished.")
```

## Timer

Timer는 지정된 시간이 지난 후에 함수를 실행하는 스레드입니다. 일종의 지연 실행 메커니즘을 제공합니다.

```python
from threading import Timer


def greet():
    print("Hello from Timer!")


timer = Timer(3.0, greet)  # execute greet() after 3 seconds
timer.start()

print("Timer started, waiting...")
timer.join()
print("All done.")
```

이러한 동기화 프리미티브들은 각각 다른 상황에서 유용하게 사용됩니다. Lock과 RLock은 기본적인 상호 배제를 위해, Semaphore는 리소스 풀 관리를 위해, Event와 Condition은 스레드 간 통신을 위해, Barrier는 스레드 동기화를 위해 사용됩니다.

## 함께 보면 좋은 글

- [Global Interpreter Lock](/python/global-interpreter-lock/) : GIL이 무엇을 지키고 무엇을 지키지 않는지
- [Reference Counting](/python/reference-counting/) : GIL이 보호하는 인터프리터 내부 상태의 정체

## 참고 자료

- [threading - Python Docs](https://docs.python.org/3/library/threading.html)
- [What kinds of global value mutation are thread-safe? - Python FAQ](https://docs.python.org/3/faq/library.html#what-kinds-of-global-value-mutation-are-thread-safe)
- [Synchronization Primitives in Python](https://betterprogramming.pub/synchronization-primitives-in-python-564f89fee732)
