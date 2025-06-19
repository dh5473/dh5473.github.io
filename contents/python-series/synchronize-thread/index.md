---
date: '2025-02-27'
title: '[Python] Thread Synchronization'
category: 'Dev'
summary: 'Python의 다양한 스레드 동기화 도구들과 활용 방법에 대해 알아봅니다.'
thumbnail: './python-logo.png'
---

파이썬에서 GIL은 멀티스레딩 환경에서 단일 스레드만 파이썬 바이트코드를 실행하도록 제한합니다. 덕분에 참조 카운팅과 같은 메모리 관리 메커니즘을 안전하게 수행할 수 있습니다. 그렇다면 파이썬은 lock이 필요할까요? GIL은 중요한 역할을 하지만, 그렇다고 모든 동시성 문제를 해결해주지는 않습니다.

다수의 스레드가 동일한 값을 읽고 쓰는 경우에는 여전히 lock이 필요합니다. 결국은 동기화 문제를 해결해야 한다는 것인데, 파이썬은 동기화를 위해 어떠한 프리미티브(primitives)를 제공하고 있을까요?

간단한 설명과 함께 파이썬이 제공하는 스레드 동기화 도구들을 알아보겠습니다. 해당 내용은 [해외 블로그](https://betterprogramming.pub/synchronization-primitives-in-python-564f89fee732)와 [파이썬 공식 문서](https://docs.python.org/3/library/asyncio-sync.html)를 주로 참고하였습니다.
<br>

## Lock
Lock은 파이썬에서 가장 심플한 동기화 프리미티브입니다. Lock은 locked와 unlocked 두 가지 상태만 존재합니다. 여기에 사용되는 메서드도 acquire()과 release()로 매우 단순합니다. 주의할 점은 unlocked 상태에서 release()를 호출할 경우 RunTimeError가 발생합니다.

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
<br>

## RLock
기존의 Lock은 어떤 스레드가 lock을 획득한지 알지 못합니다. 누군가 락을 소유하고 있다면, 다른 스레드가 lock을 획득하려고 시도해도 block 됩니다. 심지어 스레드 자기 자신이 lock을 보유하고 있어도 마찬가지입니다.

RLock(re-entrant lock)은 이러한 상황을 해결할 수 있습니다. 자세한 건 아래 코드를 통해 이해해보겠습니다.

```python
import threading

num = 0
lock = threading.Lock()

lock.acquire()
num += 1
lock.acquire()  # block
num += 2
lock.release()


lock = threading.RLock()

lock.acquire()
num += 3
lock.acquire()  # not block
num += 4
lock.release()
lock.release()  # call release once for each call to acquire

print(num)
```
<br>

## Semaphore
운영체제에서 필수적으로 등장하는 세마포어입니다. 세마포어의 경우 특정 수만큼의 스레드가 acquire()를 시도해야만 block 됩니다. 세마포어의 카운터는 acquire()가 호출될 때마다 감소하고, release()가 호출될 때마다 증가합니다.

파이썬은 Semaphore와 BoundedSemaphore 클래스 두 가지를 제공합니다. Semaphore의 경우 release()에 대한 상한선이 없어서, 계속해서 release()가 가능합니다. 반면 BoundedSemaphore의 경우 설정해둔 최댓값을 넘어서는 release()를 호출할 경우 에러를 일으킵니다. 대부분의 경우 복잡한 프로그래밍 에러를 피하기 위해서, BoundedSemaphore를 선택하면 됩니다.

```python
import random, time
from threading import BoundedSemaphore, Thread

max_items = 5  # default 1 item
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
print("Starting with %s itmes." % max_items)

threads.append(Thread(target=producer, args=(nloops, )))
threads.append(Thread(target=consumer, args=(random.randrange(nloops, nloops + max_items + 2), )))

for thread in threads:
    thread.start()

for thread in threads:
    thread.join()

print("All done.")
```
<br>

## Event
Event 동기화 프리미티브는 스레드 사이에서 간단한 커뮤니케이터로 작동합니다. 스레드는 내부 플래그를 set() 혹은 clear()로 설정할 수 있으며, 다른 스레드들은 wait()를 통해 플래그가 set()이 될 때까지 대기합니다. wait() 메서드를 사용하면 플래그가 true로 설정될 때까지 block 상태로 대기합니다.

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
<br>

## Condition
Condition 객체는 Event 객체보다 향상된 버전입니다. 스레드 간 커뮤니케이터로 동작할 뿐만 아니라, 다른 스레드들에게 프로그램의 상태 변환을 알릴 수 있는 notify() 메서드를 사용할 수 있습니다.

예를 들어 리소스의 가용성에 대한 정보를 보낼 수 있습니다. 다른 스레드들은 wait()으로 대기하고 있다가 condition 객체의 lock을 획득하려고 합니다. 아래 코드에서는 producer와 consumer 사이의 간단한 예시를 보여주고 있습니다.

```python
import random, time
from threading import Condition, Thread

condition = Condition()
box = []


def producer(box, nitems):
    for _ in range(nitems):
        time.sleep(random.randrange(2, 5))

        condition.acquire()
        num = random.randint(1, 10)
        box.append(num)
        print("Produced:", num)
        condition.notify()  # send a notification to consumer
        condition.release()


def consumer(box, nitems):
    for _ in range(nitems):
        condition.acquire()
        while len(box) == 0:
            print("Nothing to consume, waiting...")
            condition.wait()  # wait for the notification from producer
        num = box.pop()
        print("Consumed:", num)
        condition.release()


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
<br>

## Barrier
Barrier는 특정 수의 스레드가 모두 barrier 지점에 도달할 때까지 기다리는 동기화 프리미티브입니다. 모든 스레드가 도착하면 동시에 계속 진행됩니다.

```python
import random, time
from threading import Barrier, Thread

barrier = Barrier(3)  # wait for 3 threads


def worker(barrier):
    # do some work
    time.sleep(random.randrange(1, 4))
    worker_id = threading.current_thread().ident
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
<br>

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
<br>

이러한 동기화 프리미티브들은 각각 다른 상황에서 유용하게 사용됩니다. Lock과 RLock은 기본적인 상호 배제를 위해, Semaphore는 리소스 풀 관리를 위해, Event와 Condition은 스레드 간 통신을 위해, Barrier는 스레드 동기화를 위해 사용됩니다.

## 참고 자료

- [Synchronization Primitives in Python](https://betterprogramming.pub/synchronization-primitives-in-python-564f89fee732)
- [Python 공식 문서 - Threading](https://docs.python.org/3/library/threading.html)
- [Python 공식 문서 - Asyncio Sync](https://docs.python.org/3/library/asyncio-sync.html)