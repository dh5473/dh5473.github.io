---
date: '2025-02-06'
title: '참조 카운팅은 어떻게 메모리를 해제하고 어디서 실패하는가'
category: 'Python'
series: 'python'
seriesOrder: 1
summary: '참조 카운트가 0이 되는 순간 객체가 해제되는 구조와, 순환 참조에서 카운트가 1에 멈춰 회수되지 않는 이유를 코드로 확인합니다.'
thumbnail: './python-logo.png'
---

CPython의 메모리 관리는 참조 카운팅에서 시작합니다. 모든 객체는 자신을 가리키는 참조가 몇 개인지 세고 있고, 이 값이 0이 되는 순간 그 자리에서 메모리가 해제됩니다. 별도의 수집기가 돌기를 기다리지 않으므로 해제 시점이 코드에 그대로 드러납니다.

대신 이 방식만으로 회수하지 못하는 묶음이 있습니다. 서로를 가리키는 객체들은 바깥에서 오는 참조를 전부 끊어도 카운트가 0에 닿지 못합니다. CPython이 참조 카운팅 위에 순환 전용 수집기를 하나 더 얹어 둔 이유가 여기에 있습니다.

## 카운트는 언제 오르고 언제 내려가는가

객체가 만들어지면 카운트는 1에서 시작합니다. 다른 이름에 대입하거나 컨테이너에 넣거나 함수 인자로 넘기면 1씩 오르고, 그 이름이 사라지거나 다른 객체로 덮이거나 스코프를 벗어나면 1씩 내려갑니다. 0에 닿으면 곧바로 해제 루틴이 불리고, 그 객체가 들고 있던 참조들도 함께 1씩 줄어듭니다. 그 바람에 0이 된 객체가 있으면 연쇄적으로 같이 해제됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 312" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="리스트 객체의 참조 카운트가 대입으로 2까지 올랐다가 이름이 사라지면서 0으로 내려가 해제되는 과정">
<style>
.rc1-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.rc1-c { fill: var(--text, #1c1917); font-size: 14px; }
.rc1-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.rc1-ok { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.rc1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rc1-chip { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rc1-done { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.rc1-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#rc1Arrow); }
.rc1-ck { stroke: var(--text-success, #107836); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
</style>
<defs>
<marker id="rc1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="rc1-t" x="200" y="24" text-anchor="middle">참조 카운트의 증감</text>
<!-- 1행 -->
<rect class="rc1-box" x="20" y="44" width="222" height="38" rx="5"/>
<text class="rc1-c" x="34" y="68">a = [1, 2, 3]</text>
<rect class="rc1-chip" x="258" y="44" width="122" height="38" rx="5"/>
<text class="rc1-n" x="319" y="68" text-anchor="middle">카운트 1</text>
<path class="rc1-a" d="M200 84 L200 94"/>
<!-- 2행 -->
<rect class="rc1-box" x="20" y="96" width="222" height="38" rx="5"/>
<text class="rc1-c" x="34" y="120">b = a</text>
<rect class="rc1-chip" x="258" y="96" width="122" height="38" rx="5"/>
<text class="rc1-n" x="319" y="120" text-anchor="middle">카운트 2</text>
<path class="rc1-a" d="M200 136 L200 146"/>
<!-- 3행 -->
<rect class="rc1-box" x="20" y="148" width="222" height="38" rx="5"/>
<text class="rc1-c" x="34" y="172">b = None</text>
<rect class="rc1-chip" x="258" y="148" width="122" height="38" rx="5"/>
<text class="rc1-n" x="319" y="172" text-anchor="middle">카운트 1</text>
<path class="rc1-a" d="M200 188 L200 198"/>
<!-- 4행 -->
<rect class="rc1-box" x="20" y="200" width="222" height="38" rx="5"/>
<text class="rc1-c" x="34" y="224">del a</text>
<rect class="rc1-chip" x="258" y="200" width="122" height="38" rx="5"/>
<text class="rc1-n" x="319" y="224" text-anchor="middle">카운트 0</text>
<path class="rc1-a" d="M200 240 L200 250"/>
<!-- 결과 -->
<rect class="rc1-done" x="20" y="252" width="360" height="40" rx="5"/>
<path class="rc1-ck" d="M40 272 L45 277 L54 266"/>
<text class="rc1-ok" x="66" y="277">즉시 해제, 담고 있던 참조도 1씩 감소</text>
</svg>
</div>

`sys.getrefcount()`로 지금 카운트를 확인할 수 있습니다.

```python
import sys

a = [1, 2, 3]
print(sys.getrefcount(a))
# 2

b = a
print(sys.getrefcount(a))
# 3

b = None
print(sys.getrefcount(a))
# 2
```

:::warning

**반환값에는 항상 1이 얹혀 있습니다**

`sys.getrefcount(a)`를 부르는 순간 인자로 전달된 참조가 하나 더 잡힙니다. 그래서 앞 그림의 카운트에 1을 더한 값이 그대로 찍힙니다. 처음에 2가 나온 것은 실제 참조가 하나뿐이라는 뜻입니다. 공식 문서도 이 값이 예상보다 하나 크다고 명시하고 있으므로, 절대값보다 증감을 읽는 편이 안전합니다.

:::

## 작은 정수와 None의 카운트를 읽지 않는 이유

같은 것을 정수나 `None`에 해 보면 값이 전혀 다릅니다.

```python
>>> import sys
>>> sys.getrefcount(1)
4294967295
>>> sys.getrefcount(None)
4294967295
```

두 가지가 겹쳐 있습니다. 먼저 파이썬은 -5부터 256까지의 정수를 미리 만들어 두고 재사용합니다. `c = 1`은 새 객체를 만드는 일이 아니라 이미 있는 객체를 가리키는 일이라, 인터프리터 곳곳에서 쓰이는 만큼 카운트가 큽니다.

여기에 Python 3.12의 PEP 683이 얹혀 값이 아예 고정됐습니다. `None`, `True`, `False`, 작은 정수, 인터프리터가 미리 만들어 두는 짧은 문자열처럼 프로세스가 끝날 때까지 살아 있는 객체는 immortal로 표시되고, 참조 카운트를 갱신하는 코드가 이들을 건너뜁니다. 대신 포화값 하나를 계속 들고 있습니다. 64비트 CPython 3.13에서 이 값은 `UINT_MAX`, 즉 4294967295입니다.

문서도 이 점을 못 박고 있습니다. immortal 객체의 반환값은 실제 참조 수와 무관하며, 0이나 1이 아닌 이상 값을 신뢰하지 말라는 것입니다. 참조 카운팅이 실제로 어떻게 움직이는지 보려면 리스트처럼 평범한 객체를 써야 합니다.

## 카운트가 0에 닿지 못하는 경우

순환 참조는 둘 이상의 객체가 서로를 가리키는 상태입니다. 각자가 상대를 붙잡고 있으니, 바깥에서 오는 참조를 모두 끊어도 카운트가 1에서 멈춥니다.

```python
class Node:
    def __init__(self, value):
        self.value = value
        self.parent = None
        self.child = None


node_a = Node("A")
node_b = Node("B")

node_a.child = node_b
node_b.parent = node_a

del node_a, node_b
```

마지막 `del`이 핵심입니다. `del` 전에는 두 객체가 전역 이름에도 묶여 있어서, 순환이 없더라도 어차피 해제되지 않습니다. 순환이 문제로 드러나는 시점은 바깥 참조를 모두 끊은 뒤입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 312" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="del 전에는 전역 이름까지 포함해 카운트가 2이고 del 뒤에도 서로를 참조해 카운트가 1에서 멈추는 순환 참조">
<style>
.rc2-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.rc2-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.rc2-l { fill: var(--text, #1c1917); font-size: 14px; }
.rc2-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.rc2-d { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.rc2-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rc2-a { stroke: var(--text, #1c1917); stroke-width: 1.5; fill: none; marker-end: url(#rc2Arrow); }
.rc2-ext { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#rc2ArrowM); }
.rc2-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="rc2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text, #1c1917)"/>
</marker>
<marker id="rc2ArrowM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="rc2-t" x="200" y="22" text-anchor="middle">del 뒤에도 남는 참조</text>
<!-- 위 패널 -->
<text class="rc2-h" x="20" y="52">del 전</text>
<text class="rc2-n" x="100" y="52" text-anchor="middle">node_a</text>
<text class="rc2-n" x="300" y="52" text-anchor="middle">node_b</text>
<path class="rc2-ext" d="M100 58 L100 72"/>
<path class="rc2-ext" d="M300 58 L300 72"/>
<rect class="rc2-box" x="40" y="74" width="120" height="48" rx="5"/>
<text class="rc2-l" x="100" y="95" text-anchor="middle">Node A</text>
<text class="rc2-n" x="100" y="114" text-anchor="middle">카운트 2</text>
<rect class="rc2-box" x="240" y="74" width="120" height="48" rx="5"/>
<text class="rc2-l" x="300" y="95" text-anchor="middle">Node B</text>
<text class="rc2-n" x="300" y="114" text-anchor="middle">카운트 2</text>
<path class="rc2-a" d="M162 88 L236 88"/>
<text class="rc2-n" x="199" y="82" text-anchor="middle">child</text>
<path class="rc2-a" d="M238 110 L164 110"/>
<text class="rc2-n" x="199" y="138" text-anchor="middle">parent</text>
<line class="rc2-div" x1="20" y1="158" x2="380" y2="158"/>
<!-- 아래 패널 -->
<text class="rc2-h" x="20" y="188">del node_a, node_b 뒤</text>
<rect class="rc2-box" x="40" y="204" width="120" height="48" rx="5"/>
<text class="rc2-l" x="100" y="225" text-anchor="middle">Node A</text>
<text class="rc2-n" x="100" y="244" text-anchor="middle">카운트 1</text>
<rect class="rc2-box" x="240" y="204" width="120" height="48" rx="5"/>
<text class="rc2-l" x="300" y="225" text-anchor="middle">Node B</text>
<text class="rc2-n" x="300" y="244" text-anchor="middle">카운트 1</text>
<path class="rc2-a" d="M162 218 L236 218"/>
<text class="rc2-n" x="199" y="212" text-anchor="middle">child</text>
<path class="rc2-a" d="M238 240 L164 240"/>
<text class="rc2-n" x="199" y="268" text-anchor="middle">parent</text>
<text class="rc2-d" x="200" y="300" text-anchor="middle">카운트가 0에 닿지 못함</text>
</svg>
</div>

카운트가 1에서 멈췄으니 해제 루틴은 불리지 않습니다. 순환 수집기를 꺼 두고 돌려 보면 분명하게 드러납니다.

```python
import gc


class Node:
    def __init__(self, name):
        self.name = name
        self.parent = None
        self.child = None

    def __del__(self):
        print(f"{self.name} 해제")


gc.disable()
a, b = Node("A"), Node("B")
a.child, b.parent = b, a
del a, b
print("del 실행 완료")
```

```text
del 실행 완료
A 해제
B 해제
```

`del` 직후에는 아무것도 찍히지 않고, 인터프리터가 종료되며 남은 객체를 정리할 때에야 두 줄이 나옵니다. 프로그램이 도는 내내 이 묶음이 메모리를 붙잡고 있었다는 뜻입니다. `gc.disable()`을 빼면 순환 수집기가 같은 묶음을 찾아내 회수합니다.

`__del__`이 붙어 있어도 수집 대상이 된다는 점은 짚어 둘 만합니다. 파이썬 3.4 이전에는 소멸자를 어느 쪽부터 불러야 할지 정할 수 없다는 이유로 이런 묶음을 `gc.garbage`에 쌓아 두고 손대지 않았는데, PEP 442가 소멸 단계와 메모리 해제 단계를 분리하면서 이 제약이 사라졌습니다.

## 약한 참조로 순환을 끊기

`weakref`로 만든 참조는 카운트를 올리지 않습니다. 부모와 자식이 서로를 알아야 하는 구조라면 한쪽 방향만 약한 참조로 바꿔도 고리가 끊어집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 306" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="자식이 부모를 약한 참조로 가리키면 이름을 지운 순간 부모의 카운트가 0이 되어 부모와 자식이 차례로 해제되는 과정">
<style>
.rc3-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.rc3-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.rc3-l { fill: var(--text, #1c1917); font-size: 14px; }
.rc3-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.rc3-ok { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.rc3-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rc3-done { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.rc3-a { stroke: var(--text, #1c1917); stroke-width: 1.5; fill: none; marker-end: url(#rc3Arrow); }
.rc3-w { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; stroke-dasharray: 5 4; marker-end: url(#rc3ArrowM); }
.rc3-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.rc3-ck { stroke: var(--text-success, #107836); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.rc3-down { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#rc3ArrowM); }
</style>
<defs>
<marker id="rc3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text, #1c1917)"/>
</marker>
<marker id="rc3ArrowM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="rc3-t" x="200" y="24" text-anchor="middle">약한 참조로 끊은 순환</text>
<!-- 위 패널 -->
<text class="rc3-h" x="20" y="52">del 전</text>
<rect class="rc3-box" x="40" y="64" width="120" height="48" rx="5"/>
<text class="rc3-l" x="100" y="85" text-anchor="middle">parent</text>
<text class="rc3-n" x="100" y="104" text-anchor="middle">카운트 1</text>
<rect class="rc3-box" x="240" y="64" width="120" height="48" rx="5"/>
<text class="rc3-l" x="300" y="85" text-anchor="middle">child</text>
<text class="rc3-n" x="300" y="104" text-anchor="middle">카운트 2</text>
<path class="rc3-a" d="M162 78 L236 78"/>
<text class="rc3-n" x="199" y="72" text-anchor="middle">child</text>
<path class="rc3-w" d="M238 100 L164 100"/>
<text class="rc3-n" x="199" y="130" text-anchor="middle">parent (weakref)</text>
<line class="rc3-div" x1="20" y1="150" x2="380" y2="150"/>
<!-- 아래 패널 -->
<text class="rc3-h" x="20" y="178">del p, c 뒤</text>
<rect class="rc3-done" x="20" y="190" width="360" height="40" rx="5"/>
<path class="rc3-ck" d="M40 210 L45 215 L54 204"/>
<text class="rc3-ok" x="66" y="215">parent 카운트 0, 곧바로 해제</text>
<path class="rc3-down" d="M200 232 L200 242"/>
<rect class="rc3-done" x="20" y="244" width="360" height="40" rx="5"/>
<path class="rc3-ck" d="M40 264 L45 269 L54 258"/>
<text class="rc3-ok" x="66" y="269">child 카운트 0, 뒤따라 해제</text>
</svg>
</div>

```python
import gc
import weakref


class Node:
    def __init__(self, name):
        self.name = name
        self.child = None
        self.parent = None

    def __del__(self):
        print(f"{self.name} 해제")


gc.disable()
p, c = Node("parent"), Node("child")
p.child, c.parent = c, weakref.ref(p)
del p, c
print("del 실행 완료")
```

```text
parent 해제
child 해제
del 실행 완료
```

수집기를 꺼 둔 채로도 `del` 시점에 곧바로 해제됩니다. 대신 쓰는 쪽의 코드가 달라집니다. 약한 참조는 대상이 사라지면 `None`을 돌려주므로, `c.parent()`처럼 호출해서 살아 있는지 매번 확인해야 합니다.

순환을 아예 만들지 않는 선택지도 있습니다. 부모 객체 대신 인덱스나 키를 들고 다니거나, 다 쓴 참조를 `None`으로 명시적으로 끊으면 같은 효과를 냅니다.

## 마치며

참조 카운팅의 값어치는 해제 시점이 코드에 드러난다는 데 있습니다. 마지막 이름이 사라지는 그 줄에서 메모리가 돌아오므로, 큰 배열이나 파일 핸들을 언제 놓는지 추적하기가 쉽습니다. 대가는 모든 대입에서 카운트를 올리고 내리는 비용, 그리고 순환 하나를 못 지운다는 구멍입니다.

구멍을 어떻게 막을지가 실무의 선택지입니다. 순환 수집기에 맡기면 코드는 깨끗해지지만 회수 시점을 예측할 수 없고, 추적 대상 객체가 많아질수록 수집 비용이 눈에 띕니다. 약한 참조나 구조 변경으로 고리 자체를 없애면 카운트만으로 즉시 회수되는 대신, 참조가 살아 있는지 확인하는 코드가 붙습니다. 캐시나 옵저버, 부모 포인터처럼 순환이 자연스럽게 생기는 자리에서는 후자를 먼저 검토할 만합니다.

## 함께 보면 좋은 글

- [가비지 컬렉션](/python/garbage-collection/) : 참조 카운팅이 놓친 순환을 수집기가 찾아내는 절차
- [Global Interpreter Lock](/python/global-interpreter-lock/) : 참조 카운트 갱신을 지켜 주는 잠금
- [스레드 동기화](/python/synchronize-thread/) : GIL이 있어도 lock이 필요한 이유

## 참고자료

- [Python Docs: sys.getrefcount](https://docs.python.org/3/library/sys.html#sys.getrefcount)
- [Python Docs: Reference Counting (C API)](https://docs.python.org/3/c-api/refcounting.html)
- [Python Docs: weakref](https://docs.python.org/3/library/weakref.html)
- [PEP 683: Immortal Objects, Using a Fixed Refcount](https://peps.python.org/pep-0683/)
- [PEP 442: Safe Object Finalization](https://peps.python.org/pep-0442/)
