---
date: '2025-02-21'
title: '세대별 가비지 컬렉터가 순환 참조를 찾아내는 다섯 단계'
category: 'Python'
series: 'python'
seriesOrder: 2
summary: 'CPython이 어떤 객체를 추적 대상에 넣는지, 그리고 gc_refs를 깎아 순환에 갇힌 객체만 골라내는 다섯 단계가 어떻게 도는지 정리합니다.'
thumbnail: './python-logo.png'
---

참조 카운트가 0이 되면 객체는 그 자리에서 해제됩니다. 그런데 두 객체가 서로를 가리키고 있으면 바깥에서 오는 참조를 모두 끊어도 카운트가 1에서 멈추고, 이 묶음은 참조 카운팅만으로는 회수되지 않습니다. CPython은 이 구멍을 메우려고 순환 전용 수집기를 따로 돌립니다. 파이썬에서 가비지 컬렉터라고 부르는 것이 보통 이쪽입니다.

수집기가 답해야 하는 질문은 세 가지입니다. 어떤 객체를 감시 대상에 넣을 것인가, 언제 돌 것인가, 순환에 갇힌 객체를 어떻게 골라낼 것인가.

## 무엇을 추적하는가

순환은 다른 객체의 참조를 담을 수 있는 객체에서만 생깁니다. 리스트, 딕셔너리, 집합, 튜플, 사용자 정의 클래스의 인스턴스가 여기에 해당합니다. 정수나 문자열은 자기 안에 다른 객체 참조를 두지 않으므로 고리가 될 수 없고, 따라서 감시할 이유도 없습니다.

추적 대상이 되는 객체는 실제 객체 구조체 **앞쪽**에 `PyGC_Head`라는 헤더를 하나 더 달고 태어납니다. 여기에 `_gc_next`와 `_gc_prev` 두 개의 포인터가 들어 있고, 이 포인터로 같은 세대의 객체들이 이중 연결 리스트로 묶입니다. 수집기는 이 리스트만 훑으면 되므로 힙 전체를 뒤질 필요가 없습니다. `_gc_prev`의 하위 두 비트는 플래그 자리로도 쓰이고, 수집이 도는 동안에는 이 필드가 잠시 `gc_refs` 저장소로 전용됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 322" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="추적되는 객체는 객체 구조체 앞에 PyGC_Head 헤더를 달아 연결 리스트로 묶이고 추적되지 않는 객체에는 이 헤더가 없다는 메모리 배치 비교">
<style>
.gc1-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gc1-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.gc1-l { fill: var(--text, #1c1917); font-size: 14px; }
.gc1-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gc1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.gc1-key { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.gc1-ghost { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 5 4; }
.gc1-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#gc1Arrow); }
.gc1-br { stroke: var(--border, #e7e5e4); stroke-width: 1.5; fill: none; }
.gc1-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="gc1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="gc1-t" x="200" y="24" text-anchor="middle">추적 대상 객체의 메모리 배치</text>
<!-- 추적되는 객체 -->
<text class="gc1-h" x="20" y="52">추적되는 객체</text>
<text class="gc1-n" x="110" y="74" text-anchor="middle">PyGC_Head</text>
<text class="gc1-n" x="292" y="74" text-anchor="middle">PyObject</text>
<path class="gc1-br" d="M20 80 L200 80"/>
<path class="gc1-br" d="M204 80 L380 80"/>
<rect class="gc1-key" x="20" y="88" width="88" height="44" rx="5"/>
<text class="gc1-l" x="64" y="116" text-anchor="middle">_gc_next</text>
<rect class="gc1-key" x="112" y="88" width="88" height="44" rx="5"/>
<text class="gc1-l" x="156" y="116" text-anchor="middle">_gc_prev</text>
<rect class="gc1-box" x="204" y="88" width="88" height="44" rx="5"/>
<text class="gc1-l" x="248" y="116" text-anchor="middle">ob_refcnt</text>
<rect class="gc1-box" x="296" y="88" width="84" height="44" rx="5"/>
<text class="gc1-l" x="338" y="116" text-anchor="middle">ob_type</text>
<path class="gc1-a" d="M156 134 L156 148"/>
<rect class="gc1-ghost" x="60" y="150" width="280" height="36" rx="5"/>
<text class="gc1-n" x="200" y="173" text-anchor="middle">같은 세대의 다음 추적 객체</text>
<line class="gc1-div" x1="20" y1="206" x2="380" y2="206"/>
<!-- 추적되지 않는 객체 -->
<text class="gc1-h" x="20" y="232">추적되지 않는 객체</text>
<rect class="gc1-ghost" x="20" y="242" width="180" height="44" rx="5"/>
<text class="gc1-n" x="110" y="270" text-anchor="middle">헤더 없음</text>
<rect class="gc1-box" x="204" y="242" width="88" height="44" rx="5"/>
<text class="gc1-l" x="248" y="270" text-anchor="middle">ob_refcnt</text>
<rect class="gc1-box" x="296" y="242" width="84" height="44" rx="5"/>
<text class="gc1-l" x="338" y="270" text-anchor="middle">ob_type</text>
<text class="gc1-n" x="200" y="308" text-anchor="middle">정수, 문자열, 원소가 모두 원자적인 튜플</text>
</svg>
</div>

추적 여부는 `gc.is_tracked()`로 확인합니다.

```python
# CPython 3.13.2
>>> import gc
>>> gc.is_tracked(0)
False
>>> gc.is_tracked("a")
False
>>> gc.is_tracked([])
True
>>> gc.is_tracked({})
False
>>> gc.is_tracked({"a": 1})
False
>>> gc.is_tracked({"a": []})
True
```

컨테이너라고 무조건 추적하지는 않습니다. 값이 전부 원자적인 딕셔너리처럼 고리를 만들 수 없는 것이 분명하면 추적에서 빼고, 나중에 컨테이너가 들어오는 순간 추적을 시작합니다. 튜플은 반대 방향입니다. 생성 시점에는 일단 추적되다가, 첫 수집을 지나면서 원소가 전부 원자적이라는 것이 확인되면 목록에서 빠집니다.

```python
import gc

t = (1, 2)
print(gc.is_tracked(t))

gc.collect()
print(gc.is_tracked(t))
```

```text
True
False
```

:::warning

**딕셔너리 쪽은 3.14에서 바뀌었습니다**

위의 `gc.is_tracked({"a": 1})`은 Python 3.13까지 `False`입니다. 3.14에서 딕셔너리의 지연 추적이 제거되면서 생성 시점부터 추적되고, 같은 호출이 `True`를 돌려줍니다. 공식 문서 예제도 버전에 따라 다른 값을 싣고 있으니, 특정 버전의 결과를 고정된 규칙으로 외우지 않는 편이 좋습니다.

:::

## 세대와 임계값

수집기는 대부분의 객체가 금방 죽는다는 전제를 깔고 돕니다. 그래서 추적 대상을 세 개의 세대로 나누고, 어린 세대일수록 자주 검사합니다. 한 번의 수집에서 살아남은 객체는 다음 세대로 옮겨 가고, 그만큼 다음 검사까지의 간격이 길어집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 312" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="세대 0은 할당에서 해제를 뺀 수가 2000을 넘을 때, 세대 1과 2는 더 어린 세대를 10번 검사할 때 수집되고 생존 객체가 다음 세대로 승격되는 구조">
<style>
.gc2-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gc2-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.gc2-l { fill: var(--text, #1c1917); font-size: 14px; }
.gc2-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gc2-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.gc2-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#gc2Arrow); }
</style>
<defs>
<marker id="gc2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="gc2-t" x="200" y="24" text-anchor="middle">세대별 수집 주기와 승격</text>
<!-- 세대 0 -->
<rect class="gc2-box" x="20" y="44" width="360" height="62" rx="5"/>
<text class="gc2-h" x="34" y="72">세대 0</text>
<text class="gc2-l" x="366" y="72" text-anchor="end">임계값 2000</text>
<text class="gc2-n" x="34" y="94">할당 수에서 해제 수를 뺀 값</text>
<path class="gc2-a" d="M120 108 L120 122"/>
<text class="gc2-n" x="134" y="120">살아남으면 승격</text>
<!-- 세대 1 -->
<rect class="gc2-box" x="20" y="124" width="360" height="62" rx="5"/>
<text class="gc2-h" x="34" y="152">세대 1</text>
<text class="gc2-l" x="366" y="152" text-anchor="end">임계값 10</text>
<text class="gc2-n" x="34" y="174">세대 0을 수집한 횟수</text>
<path class="gc2-a" d="M120 188 L120 202"/>
<text class="gc2-n" x="134" y="200">살아남으면 승격</text>
<!-- 세대 2 -->
<rect class="gc2-box" x="20" y="204" width="360" height="62" rx="5"/>
<text class="gc2-h" x="34" y="232">세대 2</text>
<text class="gc2-l" x="366" y="232" text-anchor="end">임계값 10</text>
<text class="gc2-n" x="34" y="254">세대 1을 검사한 횟수</text>
<text class="gc2-n" x="200" y="292" text-anchor="middle">세대 2에는 25% 비율 조건이 추가</text>
</svg>
</div>

임계값은 `gc.get_threshold()`로 확인합니다.

```python
>>> import gc
>>> gc.get_threshold()
(2000, 10, 10)
```

헷갈리기 쉬운 지점은 세 카운터가 서로 다른 것을 센다는 사실입니다. `gc.get_count()`가 돌려주는 세 값은 단위가 같지 않습니다.

세대 0의 카운터는 살아 있는 객체 수가 아니라 마지막 수집 이후의 할당 수에서 해제 수를 뺀 값입니다. 500개를 만들었다가 전부 지우면 카운터도 제자리로 돌아옵니다.

```python
import gc


class C:
    pass


gc.disable()
gc.collect()
print(gc.get_count()[0])

xs = [C() for _ in range(500)]
print(gc.get_count()[0])

del xs
print(gc.get_count()[0])
```

```text
0
504
4
```

500개 말고도 리스트 자체와 임시 객체 몇 개가 함께 잡혀서 504가 됩니다. 중요한 것은 절대값이 아니라 `del` 뒤에 다시 바닥 근처로 내려간다는 쪽입니다.

세대 1과 2의 카운터는 객체를 아예 세지 않습니다. 더 어린 세대를 몇 번 수집했는지를 셉니다. 세대 0을 열 번 수집하면 세대 1도 함께 검사하고, 세대 1을 열 번 검사하면 세대 2까지 올라갑니다.

세대 2에는 조건이 하나 더 붙습니다. 오래 살아남은 객체가 쌓일수록 전체 검사 비용이 무한정 커지기 때문에, 직전 전체 수집 이후 늘어난 장수 객체가 전체 장수 객체의 25%에 못 미치면 세대 2 검사를 건너뜁니다. 이 비율은 설정할 수 있는 값이 아니라 소스에 박혀 있습니다.

:::info

**첫 임계값은 3.13에서 700에서 2000으로 올랐습니다**

Python 3.12까지는 `(700, 10, 10)`이었습니다. 3.13에 들어갔던 incremental GC가 Sphinx 문서 빌드를 크게 느리게 만든다는 보고가 나와 릴리스 직전에 되돌려졌는데, 되돌리기 커밋이 첫 세대 임계값 상향만은 남겨 두었습니다. 오래된 글에서 700을 보고 재현이 안 된다면 이 변경 때문입니다.

:::

## 순환을 찾아내는 다섯 단계

수집이 시작되면 대상 세대의 연결 리스트에서 후보 집합을 뽑고, 다음 절차를 밟습니다.

1. 후보마다 `gc_refs` 필드를 그 객체의 참조 카운트로 초기화합니다.
2. 후보 집합 안의 객체들이 서로를 참조하는 만큼 `gc_refs`를 깎습니다. 끝나면 `gc_refs`에는 집합 바깥에서 들어오는 참조 수만 남습니다.
3. `gc_refs`가 0인 객체를 잠정 unreachable로 표시합니다.
4. `gc_refs`가 0보다 큰 객체에서 출발해 참조를 따라가는 너비 우선 탐색을 돌립니다. 여기에 걸린 객체는 살아 있는 것이므로 원래 목록으로 되돌립니다.
5. 탐색이 끝난 뒤에도 잠정 unreachable에 남아 있는 객체만 실제로 해제합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 368" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="후보 집합에서 내부 참조를 깎으면 B와 C와 D의 gc_refs가 0이 되지만 되돌리기 순회로 B가 살아나고 순환에 갇힌 C와 D만 해제되는 과정">
<style>
.gc3-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gc3-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.gc3-l { fill: var(--text, #1c1917); font-size: 14px; }
.gc3-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gc3-v { fill: var(--text, #1c1917); font-size: 18px; font-weight: 700; }
.gc3-keep { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.gc3-free { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.gc3-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.gc3-ghost { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 5 4; }
.gc3-okbox { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.gc3-nobox { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.gc3-a { stroke: var(--text, #1c1917); stroke-width: 1.5; fill: none; marker-end: url(#gc3Arrow); }
.gc3-ext { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#gc3ArrowM); }
.gc3-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gc3-ck { stroke: var(--text-success, #107836); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.gc3-x { stroke: var(--text-danger, #cb2121); stroke-width: 2; fill: none; stroke-linecap: round; }
</style>
<defs>
<marker id="gc3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text, #1c1917)"/>
</marker>
<marker id="gc3ArrowM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="gc3-t" x="200" y="24" text-anchor="middle">gc_refs 차감과 되돌리기</text>
<!-- 참조 구조 -->
<text class="gc3-h" x="20" y="52">후보 집합의 참조 구조</text>
<rect class="gc3-ghost" x="20" y="62" width="84" height="40" rx="5"/>
<text class="gc3-n" x="62" y="87" text-anchor="middle">바깥 이름</text>
<path class="gc3-ext" d="M106 82 L122 82"/>
<rect class="gc3-box" x="126" y="62" width="86" height="40" rx="5"/>
<text class="gc3-l" x="169" y="87" text-anchor="middle">A</text>
<path class="gc3-a" d="M214 82 L250 82"/>
<rect class="gc3-box" x="254" y="62" width="86" height="40" rx="5"/>
<text class="gc3-l" x="297" y="87" text-anchor="middle">B</text>
<rect class="gc3-box" x="126" y="112" width="86" height="40" rx="5"/>
<text class="gc3-l" x="169" y="137" text-anchor="middle">C</text>
<rect class="gc3-box" x="254" y="112" width="86" height="40" rx="5"/>
<text class="gc3-l" x="297" y="137" text-anchor="middle">D</text>
<path class="gc3-a" d="M214 124 L250 124"/>
<path class="gc3-a" d="M252 142 L216 142"/>
<line class="gc3-div" x1="20" y1="172" x2="380" y2="172"/>
<!-- 2단계 뒤 -->
<text class="gc3-h" x="20" y="196">2단계 뒤 gc_refs</text>
<rect class="gc3-box" x="22" y="206" width="84" height="52" rx="5"/>
<text class="gc3-n" x="64" y="228" text-anchor="middle">A</text>
<text class="gc3-v" x="64" y="250" text-anchor="middle">1</text>
<rect class="gc3-box" x="114" y="206" width="84" height="52" rx="5"/>
<text class="gc3-n" x="156" y="228" text-anchor="middle">B</text>
<text class="gc3-v" x="156" y="250" text-anchor="middle">0</text>
<rect class="gc3-box" x="206" y="206" width="84" height="52" rx="5"/>
<text class="gc3-n" x="248" y="228" text-anchor="middle">C</text>
<text class="gc3-v" x="248" y="250" text-anchor="middle">0</text>
<rect class="gc3-box" x="298" y="206" width="84" height="52" rx="5"/>
<text class="gc3-n" x="340" y="228" text-anchor="middle">D</text>
<text class="gc3-v" x="340" y="250" text-anchor="middle">0</text>
<!-- 4단계 뒤 -->
<text class="gc3-h" x="20" y="288">4단계 뒤</text>
<rect class="gc3-okbox" x="22" y="298" width="84" height="52" rx="5"/>
<path class="gc3-ck" d="M84 316 L88 320 L96 310"/>
<text class="gc3-n" x="52" y="320" text-anchor="middle">A</text>
<text class="gc3-keep" x="64" y="342" text-anchor="middle">유지</text>
<rect class="gc3-okbox" x="114" y="298" width="84" height="52" rx="5"/>
<path class="gc3-ck" d="M176 316 L180 320 L188 310"/>
<text class="gc3-n" x="144" y="320" text-anchor="middle">B</text>
<text class="gc3-keep" x="156" y="342" text-anchor="middle">유지</text>
<rect class="gc3-nobox" x="206" y="298" width="84" height="52" rx="5"/>
<path class="gc3-x" d="M268 311 L278 321 M278 311 L268 321"/>
<text class="gc3-n" x="236" y="320" text-anchor="middle">C</text>
<text class="gc3-free" x="248" y="342" text-anchor="middle">해제</text>
<rect class="gc3-nobox" x="298" y="298" width="84" height="52" rx="5"/>
<path class="gc3-x" d="M360 311 L370 321 M370 311 L360 321"/>
<text class="gc3-n" x="328" y="320" text-anchor="middle">D</text>
<text class="gc3-free" x="340" y="342" text-anchor="middle">해제</text>
</svg>
</div>

:::warning

**gc_refs가 0이라고 순환은 아닙니다**

0은 집합 바깥에서 들어오는 참조가 없다는 뜻일 뿐입니다. 순환과 무관한 객체도 얼마든지 0이 될 수 있습니다. 살아 있는 객체가 그 객체를 붙잡고 있는 경우입니다. 4단계의 되돌리기 순회를 건너뛰고 0인 것을 곧바로 해제하면 멀쩡한 객체를 지우게 됩니다.

:::

위 그림의 상황을 그대로 코드로 옮기면 이렇습니다. `A`는 바깥 이름에 묶여 있고 `B`는 `A`만 가리키므로 둘 다 `gc_refs`를 깎고 나면 각각 1과 0이 됩니다. `C`와 `D`는 서로만 가리키니 둘 다 0입니다. 세 개가 나란히 0이지만 실제로 해제되는 것은 `C`와 `D`뿐입니다.

```python
import gc


class Obj:
    def __init__(self, name):
        self.name = name
        self.ref = None

    def __del__(self):
        print(f"{self.name} 해제")


gc.collect()

a = Obj("A")
b = Obj("B")
a.ref = b

c, d = Obj("C"), Obj("D")
c.ref, d.ref = d, c
del c, d

print("수집된 객체 수:", gc.collect())
print("살아 있음:", a.name, a.ref.name)
```

```text
C 해제
D 해제
수집된 객체 수: 2
살아 있음: A B
A 해제
B 해제
```

마지막 두 줄은 인터프리터가 종료되며 남은 객체를 정리한 것입니다. `gc.collect()`가 도는 시점에 `B`는 `gc_refs`가 0이었지만, 살아 있는 `A`에서 도달할 수 있어 되돌려졌습니다.

## 마치며

순환 수집기는 참조 카운팅의 구멍을 메우려고 붙은 장치이지, 파이썬 메모리 관리의 본체가 아닙니다. 대부분의 객체는 카운트가 0이 되는 순간 그 자리에서 사라지고, 수집기는 그 방식으로 도저히 회수할 수 없는 묶음만 뒤늦게 훑어 갑니다. `gc.disable()`을 걸어도 프로그램이 곧장 메모리를 흘리지 않는 이유가 여기에 있습니다.

그래서 튜닝 대상은 임계값보다 추적 대상의 개수인 경우가 많습니다. 세대 2까지 올라가는 전체 수집의 비용은 오래 살아남은 객체 수에 비례하므로, 장수 객체가 수십만 개 쌓인 프로세스에서는 임계값을 올려도 한 번의 수집이 여전히 깁니다. `fork` 이전에 `gc.freeze()`로 초기 객체들을 영구 세대로 밀어 두거나, 애초에 순환을 만들지 않아 수집기가 볼 것을 줄이는 쪽이 더 확실합니다.

## 함께 보면 좋은 글

- [참조 카운팅](/python/reference-counting/) : 카운트가 0에 닿지 못하는 상황이 왜 생기는지
- [Global Interpreter Lock](/python/global-interpreter-lock/) : 참조 카운트 갱신을 지켜 주는 잠금
- [스레드 동기화](/python/synchronize-thread/) : GIL이 있어도 lock이 필요한 이유

## 참고자료

- [Python Docs: gc](https://docs.python.org/3/library/gc.html)
- [CPython InternalDocs: Garbage collector design](https://github.com/python/cpython/blob/main/InternalDocs/garbage_collector.md)
- [CPython Source: Python/gc.c](https://github.com/python/cpython/blob/main/Python/gc.c)
- [Revert the Incremental GC in 3.13 (gh-124770)](https://github.com/python/cpython/pull/124770)
- [Remove lazy dictionary tracking (gh-127010)](https://github.com/python/cpython/issues/127010)
