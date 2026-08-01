---
date: '2025-02-17'
title: '[Python] Global Interpreter Lock'
category: 'Python'
series: 'python'
seriesOrder: 3
summary: 'Python GIL에 대해 알아보고, 멀티스레딩 환경에서의 제약사항과 I/O 바운드 작업에서의 활용을 살펴봅니다.'
thumbnail: './python-logo.png'
---

## GIL 이란?

CPython에서 GIL은 인터프리터 내부 상태를 보호하는 뮤텍스로, 여러 스레드가 동시에 파이썬 바이트코드를 실행하는 것을 막습니다.

여기서 GIL이 무엇을 지켜주는지 정확히 짚고 갈 필요가 있습니다. GIL이 보호하는 것은 참조 카운트 같은 **인터프리터 내부 자료구조**이지, 우리가 짠 코드의 불변식이 아닙니다. 원자성이 보장되는 단위도 바이트코드 명령 하나까지입니다. 파이썬 공식 FAQ는 `i = i + 1`, `L.append(L[-1])`, `D[x] = D[x] + 1` 같은 복합 연산을 비원자적 연산으로 명시하고, "의심스러우면 뮤텍스를 쓰라"는 문장으로 마무리합니다. GIL이 있어도 lock이 필요한 이유가 여기 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 262" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스레드 세 개가 GIL을 번갈아 잡으면서 매 시점에 하나씩만 실행되는 모습">
<style>
.gl-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gl-l { fill: var(--text, #1c1917); font-size: 14px; }
.gl-w { fill: #ffffff; font-size: 14px; }
.gl-n { fill: var(--text-muted, #78716c); font-size: 14px; }
.gl-run { fill: var(--primary, #0d9488); }
.gl-wait { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gl-ax { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#glArrow); }
</style>
<defs>
<marker id="glArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
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

각 스레드는 GIL을 획득해야만 바이트코드를 실행할 수 있고, 그동안 다른 스레드는 대기합니다. 전환은 `sys.getswitchinterval()`이 반환하는 간격(기본 0.005초)을 기준으로 일어납니다. 즉 파이썬에서는 멀티스레딩을 걸어도 **여러 스레드가 파이썬 바이트코드를 동시에 실행하지는 못합니다**. 다만 I/O 대기 구간이나 GIL을 놓는 C 확장(numpy, zlib, 소켓 등) 안에서는 실제로 동시에 진행됩니다.

여기서 함정이 하나 보입니다. 전환이 바이트코드 명령 **사이**에서 일어난다는 것은, 여러 명령으로 쪼개지는 연산은 중간에 끊길 수 있다는 뜻입니다. `total += 1` 한 줄만 해도 `LOAD_GLOBAL`, `LOAD_CONST`, `BINARY_OP`, `STORE_GLOBAL` 네 개의 명령으로 컴파일됩니다. GIL이 있어도 경쟁 상태가 생기는 자리가 바로 이 사이입니다.

## 왜 Python은 GIL을 선택할 수밖에 없었을까?

멀티스레딩으로 동작할 수 없다는 것은, 당연히 성능에 큰 영향을 미칩니다. 그럼에도 Python은 GIL을 사용하는 이유가 무엇일까요? 파이썬은 모든 것이 객체입니다. 파이썬이 배우기 쉬운 언어인만큼, 내부에서는 많은 일을 해주고 있습니다. 그중 중요한 것이 바로 참조 카운팅과 가비지 컬렉션입니다. 파이썬은 객체들의 메모리를 할당하고, 관리하기 위해서 각 객체들의 참조되는 횟수를 저장합니다. 더 이상 다른 객체들이 특정 객체를 참조하지 않을 때, 파이썬의 GC는 해당 객체를 메모리에서 해제하게 됩니다.

만약 여러 스레드가 동시에 한 객체에 접근하게 된다면, 객체의 참조 카운트에 문제가 생길 수 있습니다. 경쟁 상태(Race Condition)가 발생하는 것입니다. 예상치 못하게 참조 카운트가 변하게 된다면, 이를 기반으로 작동하는 GC까지 문제가 이어질 수 있습니다. 메모리 관리에 문제가 생긴다는 것은 시스템의 치명적인 문제로 이어질 수 있다는 것을 뜻합니다.

이러한 사태를 방지하기 위해 Python이 선택한 방식이 바로 GIL입니다. 인터프리터 전체에 자물쇠를 하나만 걸어두면, 객체마다 lock을 붙이고 그 lock들의 획득 순서를 관리하는 복잡한 문제를 통째로 피할 수 있습니다.

## 멀티스레딩과 I/O 바운드

그렇다고 파이썬의 멀티스레딩이 완전히 쓸모 없는 것은 아닙니다. 어떤 작업의 영역은 크게 CPU 바운드와 I/O 바운드 작업으로 나눌 수 있습니다. 이때 I/O 바운드 작업의 경우 CPU 사용보다는 입출력 장치 속도에 의해 제한됩니다. 즉, 하드웨어의 I/O 처리 능력에 따라 결정되며, CPU는 작업을 요청하고 대기하다가 응답이 오면 결과를 처리할 뿐 CPU 리소스를 크게 사용하지 않습니다.

다시 말해, 수행하려는 작업에 I/O 바운드 비중이 높다면 멀티스레딩 방식이 싱글스레드보다 효과적일 수 있습니다. 대기하는 동안 다른 스레드로 컨텍스트 스위칭이 일어나고, 그동안 다른 작업을 이어나갈 수 있기 때문입니다. 다른 방안으로 멀티프로세싱을 사용하는 방법도 있지만, 프로세스의 경우 스레드에 비해 컨텍스트 스위칭 비용이 크므로 잘 고려하여 설계해야 합니다.

## GIL은 사라지는 중입니다

GIL을 걷어내려는 시도는 오래됐고, 이제는 실제로 진행되고 있습니다.

Python 3.13에서 **PEP 703**에 따른 free-threaded 빌드가 실험적으로 들어갔습니다. `--disable-gil`로 빌드하면 GIL 없이 도는 인터프리터가 나오고, ABI 접미사 `t`가 붙어 `python3.13t` 같은 이름을 가집니다. 이어서 Python 3.14에서 **PEP 779**가 통과되면서 free-threaded 파이썬은 실험 단계를 벗어나 공식 지원 단계로 올라섰습니다.

오랫동안 이 작업을 가로막았던 것이 두 가지인데, 둘 다 아직 완전히 사라지지는 않았습니다. 하나는 단일 스레드 성능 손해입니다. GIL이 있다는 전제로 최적화되어 있던 부분들을 세밀한 lock으로 바꾸면 그만큼 오버헤드가 붙습니다. 다만 이 손해는 3.14 기준 5~10% 수준까지 줄었습니다. 다른 하나는 서드파티 C 확장 호환성입니다. GIL을 가정하고 작성된 확장 모듈들이 free-threaded 빌드에서 안전하게 돌려면 각자 수정이 필요하고, 이쪽이 남은 과제입니다.

GIL을 없애는 것과 별개로, 인터프리터마다 GIL을 따로 갖는 방향도 있습니다. **PEP 684**의 per-interpreter GIL이 3.12에 C API로 들어갔고, 파이썬 레벨에서 쓸 수 있는 `concurrent.interpreters`는 3.14의 **PEP 734**로 들어왔습니다.

## 함께 보면 좋은 글

- [Reference Counting](/python/reference-counting/) : GIL이 지키려는 참조 카운트가 어떻게 동작하는지
- [Thread Synchronization](/python/synchronize-thread/) : GIL이 있어도 lock이 필요한 이유와 동기화 도구들

## 참고 자료

- [Thread State and the Global Interpreter Lock - Python Docs](https://docs.python.org/3/c-api/init.html#thread-state-and-the-global-interpreter-lock)
- [What kinds of global value mutation are thread-safe? - Python FAQ](https://docs.python.org/3/faq/library.html#what-kinds-of-global-value-mutation-are-thread-safe)
- [PEP 703 - Making the Global Interpreter Lock Optional in CPython](https://peps.python.org/pep-0703/)
- [PEP 779 - Criteria for supported status for free-threaded Python](https://peps.python.org/pep-0779/)
