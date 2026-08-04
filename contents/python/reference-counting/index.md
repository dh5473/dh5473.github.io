---
date: '2025-02-06'
title: '[Python] Reference Counting'
category: 'Python'
series: 'python'
seriesOrder: 1
summary: 'Python의 메모리 관리 기법인 참조 카운팅의 동작 원리와 순환 참조 문제에 대해 알아봅니다.'
thumbnail: './python-logo.png'
---

## Reference Counting 이란?

파이썬에서 참조 카운팅(reference counting)은 중요한 메모리 관리 기법 중 하나입니다. CPython에서 Garbage Collection의 기반은 reference counts 방식이며, 특정 객체의 reference count가 0이 되면 객체의 메모리 할당이 해제되는 식으로 동작합니다. 여기에 추가적으로 세대별 가비지 컬렉션을 활용하여 메모리를 관리하게 됩니다.

### 작동 원리

객체의 참조 카운팅은 다음과 같은 주기를 가집니다.

- **객체 생성**: 객체 생성 시, 참조 카운트는 1로 설정됩니다.
- **참조 추가**: 객체에 대한 새로운 참조 시 카운트가 1씩 증가합니다(예: 다른 변수에 할당).
- **참조 해제**: 참조가 더 이상 필요하지 않을 때, 참조 카운트가 감소합니다(예: 변수가 범위를 벗어나거나 다른 객체로 대체되는 경우).
- **객체 소멸**: 참조 카운트가 0이 되면, 해당 객체를 메모리에서 자동으로 해제합니다.

파이썬의 sys 모듈에서는 다음과 같이 특정 객체의 참조 횟수를 확인하는 기능을 제공합니다.

```python
import sys

a = [1, 2, 3]
b = a
print(sys.getrefcount(a))
# 3

b = None
print(sys.getrefcount(a))
# 2
```

첫 번째의 경우 왜 참조 카운트가 3이 나올까요? 이유는 `getrefcount()` 함수 자체가 해당 객체에 대한 임시 참조를 생성하기 때문입니다. 결과적으로 예상한 카운트보다 1을 더한 값을 얻습니다. a 객체를 생성하고, b 객체가 a 객체를 참조하게 되었으니 실제 카운트 2에 1이 더해져 3이 나오는 것입니다.

두 번째에서는 b 객체를 None으로 바꿈으로써 a 객체 참조를 해제하게 되었고, 결과적으로 참조 카운트가 감소되었습니다.

### 작은 정수의 참조 카운트는 읽지 마세요

작은 정수에 같은 것을 해보면 이상한 값이 나옵니다.

```python
>>> import sys
>>> c = 1
>>> sys.getrefcount(c)
4294967295
```

파이썬에서 -5부터 256까지의 작은 정수는 사전에 미리 할당되어 전역적으로 재사용됩니다. `c = 1`이라고 쓰면 새 객체를 만드는 것이 아니라 이미 존재하는 객체에 대한 참조를 얻는 것이라, 인터프리터 곳곳에서 쓰이는 만큼 카운트가 큽니다.

여기에 Python 3.12부터 한 가지가 더 얹혔습니다. **PEP 683**이 도입한 immortal 객체입니다. 작은 정수, `None`, `True`/`False` 같은 객체는 참조 카운트를 아예 갱신하지 않고, 대신 포화된 sentinel 값을 들고 있습니다. 그래서 실제로 찍히는 값이 버전마다 다릅니다.

| Python | `sys.getrefcount(1)` |
|---|---|
| 3.9 | 103 |
| 3.11 | 1000000126 |
| 3.12 이상 | 4294967295 (`0xFFFFFFFF`) |

공식 문서도 이 점을 못 박고 있습니다. immortal 객체의 참조 카운트는 실제 참조 수와 일치하지 않으며, 0이나 1이 아닌 이상 반환값을 신뢰하지 말라는 것입니다. 참조 카운팅의 동작을 관찰하려면 리스트처럼 평범한 객체를 쓰는 편이 낫습니다.

### 순환 참조 문제

순환 참조란 2개 이상의 객체가 서로를 참조하는 상황을 뜻합니다. 참조 카운팅 기반의 메모리 관리 시스템에서는 순환 참조 객체들의 메모리가 적절히 해제되지 않는 경우, 메모리 누수 현상이 발생할 수 있습니다.

```python
class Node:
    def __init__(self, value):
        self.value = value
        self.parent = None
        self.child = None

# 두 노드 생성
node_a = Node("A")
node_b = Node("B")

# 순환 참조 생성
node_a.child = node_b
node_b.parent = node_a

# 이름을 지워도 두 객체는 살아남습니다
del node_a, node_b
```

마지막 `del`이 중요합니다. `del` 전에는 두 객체가 전역 이름에도 묶여 있으므로, 순환이 없더라도 어차피 해제되지 않습니다. 순환 참조가 문제로 드러나는 시점은 바깥에서 오는 참조를 모두 끊은 뒤입니다. 이름을 지웠는데도 서로가 서로를 붙잡고 있어 카운트가 1에서 멈춥니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 312" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="del 전에는 전역 이름까지 포함해 카운트가 2이고 del 뒤에도 서로를 참조해 카운트가 1에서 멈추는 순환 참조">
<style>
.rc-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.rc-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.rc-l { fill: var(--text, #1c1917); font-size: 14px; }
.rc-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.rc-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.rc-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rc-a { stroke: var(--text, #1c1917); stroke-width: 1.5; fill: none; marker-end: url(#rcArrow); }
.rc-ext { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#rcArrowM); }
.rc-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="rcArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text, #1c1917)"/>
</marker>
<marker id="rcArrowM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="rc-t" x="200" y="22" text-anchor="middle">del 뒤에도 남는 참조</text>
<text class="rc-h" x="20" y="52">del 전</text>
<text class="rc-n" x="100" y="52" text-anchor="middle">node_a</text>
<text class="rc-n" x="300" y="52" text-anchor="middle">node_b</text>
<path class="rc-ext" d="M100 58 L100 72"/>
<path class="rc-ext" d="M300 58 L300 72"/>
<rect class="rc-box" x="40" y="74" width="120" height="48" rx="5"/>
<text class="rc-l" x="100" y="95" text-anchor="middle">Node A</text>
<text class="rc-n" x="100" y="114" text-anchor="middle">카운트 2</text>
<rect class="rc-box" x="240" y="74" width="120" height="48" rx="5"/>
<text class="rc-l" x="300" y="95" text-anchor="middle">Node B</text>
<text class="rc-n" x="300" y="114" text-anchor="middle">카운트 2</text>
<path class="rc-a" d="M162 88 L236 88"/>
<text class="rc-n" x="199" y="82" text-anchor="middle">child</text>
<path class="rc-a" d="M238 110 L164 110"/>
<text class="rc-n" x="199" y="138" text-anchor="middle">parent</text>
<line class="rc-div" x1="20" y1="158" x2="380" y2="158"/>
<text class="rc-h" x="20" y="188">del node_a, node_b 뒤</text>
<rect class="rc-box" x="40" y="204" width="120" height="48" rx="5"/>
<text class="rc-l" x="100" y="225" text-anchor="middle">Node A</text>
<text class="rc-n" x="100" y="244" text-anchor="middle">카운트 1</text>
<rect class="rc-box" x="240" y="204" width="120" height="48" rx="5"/>
<text class="rc-l" x="300" y="225" text-anchor="middle">Node B</text>
<text class="rc-n" x="300" y="244" text-anchor="middle">카운트 1</text>
<path class="rc-a" d="M162 218 L236 218"/>
<text class="rc-n" x="199" y="212" text-anchor="middle">child</text>
<path class="rc-a" d="M238 240 L164 240"/>
<text class="rc-n" x="199" y="268" text-anchor="middle">parent</text>
<text class="rc-d" x="200" y="300" text-anchor="middle">카운트가 0에 닿지 못함</text>
</svg>
</div>

파이썬에서는 이를 해결하기 위해 세대별 가비지 컬렉터가 순환을 따로 찾아냅니다.

물론 가비지 컬렉터 외에도 순환 참조 문제를 예방할 수 있는 방법이 존재합니다. 파이썬에서는 `weakref`라는 모듈을 제공합니다. 해당 모듈을 사용하면 객체 간에 약한 참조를 생성할 수 있는데, 약한 참조의 경우 참조 카운트에 영향을 주지 않아 순환 참조 문제를 예방할 수 있습니다. 다른 방법으로는 객체 구조를 재구성하거나, 필요 없어진 객체의 경우 None을 활용하여 명시적 해제를 하는 방법도 있습니다.

## 함께 보면 좋은 글

- [Garbage Collection](/python/garbage-collection/) : 참조 카운팅이 놓친 순환을 세대별 GC가 어떻게 찾아내는지

## 참고 자료

- [Reference Counting - Python C API](https://docs.python.org/3/c-api/refcounting.html)
- [sys.getrefcount - Python Docs](https://docs.python.org/3/library/sys.html#sys.getrefcount)
- [PEP 683 - Immortal Objects, Using a Fixed Refcount](https://peps.python.org/pep-0683/)
- [weakref - Python Docs](https://docs.python.org/3/library/weakref.html)
