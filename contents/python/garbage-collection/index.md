---
date: '2025-02-21'
title: '[Python] Garbage Collection'
category: 'Python'
series: 'python'
seriesOrder: 2
summary: 'Python의 가비지 컬렉션 과정과 세대별 가비지 컬렉터의 동작 원리에 대해 알아봅니다.'
thumbnail: './python-logo.png'
---

## Garbage Collection 이란?

가비지 컬렉션(garbage collection)은 자동으로 메모리 관리를 수행하는 과정입니다. 사용되지 않는 메모리 영역을 식별하고, 해제하여 메모리를 재사용 가능하게 만드는 것이 목적입니다.

### Python의 GC

파이썬의 메모리 관리는 다음과 같은 흐름으로 진행됩니다.

1. 레퍼런스 카운팅 (Reference Counting)
2. 순환 참조 (Reference Cycle)
3. 세대별 가비지 컬렉션 (Generational Garbage Collection)

파이썬은 기본적으로 객체를 메모리에 할당할 때 레퍼런스 카운트 방식을 사용합니다. 각 객체는 다른 객체에 의해 참조될 때마다 카운트가 증가하고, 레퍼런스 카운트가 0이 될 경우 그 자리에서 메모리에서 해제됩니다.

이때 두 개 이상의 객체가 서로를 참조하는 경우 레퍼런스 카운트가 0이 되지 않는 상황이 발생하는데, 이를 순환 참조라고 합니다. 이러한 경우 자동으로 메모리에서 해제되지 않기 때문에, 순환 참조를 탐지하고 해결하기 위해 세대별 가비지 컬렉션이라는 방법을 도입합니다.

## Generational Garbage Collector

### 세대 (Generation)

파이썬의 세대별 가비지 컬렉터는 특정 전제 하에 작동합니다. 대부분의 객체는 짧은 시간 동안만 존재하고, 따라서 새로운 객체가 오래된 객체보다 메모리 해제될 가능성이 높다는 방향성으로, 아래와 같이 3가지의 세대로 나누어 관리합니다.

- 세대 0: 가장 최근에 생성된 객체들이 속합니다. 컬렉션이 자주 작동합니다.
- 세대 1: 세대 0에서 살아남은 객체들이 이동합니다. 컬렉션이 세대 0보다 드물게 작동합니다.
- 세대 2: 가장 오래된 객체들이 속한 세대입니다. 컬렉션이 가장 드물게 작동합니다.

### 임계값 (Threshold)

각 세대별로 가비지 컬렉션이 언제 발생할지 결정하는 임계값이 존재합니다. 그런데 세 개의 카운터가 서로 다른 것을 세고 있어서, 여기서 한 번 헷갈리기 쉽습니다.

**세대 0의 카운터는 객체 수가 아닙니다.** 마지막 수집 이후의 `할당 수 - 해제 수`입니다. 이 값이 첫 번째 임계값을 넘으면 세대 0 수집이 시작됩니다.

**세대 1과 2의 카운터는 아예 객체를 세지 않습니다.** 더 어린 세대를 몇 번 수집했는지를 셉니다. 세대 0을 두 번째 임계값만큼 수집하면 세대 1도 함께 검사하고, 세대 1을 세 번째 임계값만큼 검사하면 세대 2까지 올라갑니다. 수집에서 살아남은 객체는 다음 세대로 이동합니다.

아래와 같이 gc 모듈을 사용하여 임계값과 카운터를 직접 확인할 수도 있습니다.

```python
>>> import gc
>>> gc.get_threshold()
(2000, 10, 10)

>>> gc.get_count()
(167, 5, 1)
```

첫 번째 값은 버전을 탑니다. Python 3.12까지는 `(700, 10, 10)`이었고, **3.13부터 첫 값이 2000으로 올라가 `(2000, 10, 10)`이 되었습니다.** 3.13의 incremental GC 작업에 얹혀 들어간 변경인데, incremental GC 자체는 릴리스 전에 되돌려졌고 임계값 상향만 남았습니다. What's New 문서에도 실리지 않은 조용한 변경이라, 오래된 글에서 700을 보고 재현이 안 된다고 당황할 수 있습니다.

## 순환 참조와 컨테이너 객체

컨테이너 객체란 다른 객체들에 대한 참조를 보유할 수 있는 객체입니다. 예를 들어 튜플, 리스트, 집합, 딕셔너리, 클래스 등이 있습니다. 문자열의 경우 컨테이너 타입이라고 할 수는 있지만, 다른 객체에 대한 참조를 저장하지 않기 때문에 순환 참조의 고려 대상은 아닙니다. 정수와 같은 기본 데이터 타입 역시 고려 대상이 아닙니다.

gc 모듈을 활용하면 `collect()` 메서드를 통해 가비지 컬렉션(순환 참조 탐지 알고리즘 포함)을 수행할 수 있습니다. 그렇다면 순환 참조를 어떻게 탐지할 수 있을까요?

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="gc_refs 초기화부터 되돌리기 순회를 거쳐 남은 객체만 해제하는 순환 참조 탐지 다섯 단계">
<style>
.gc-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.gc-l { fill: var(--text, #1c1917); font-size: 14px; }
.gc-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.gc-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.gc-key { fill: var(--bg-muted, #eeecea); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
.gc-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#gcArrow); }
</style>
<defs>
<marker id="gcArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="gc-t" x="200" y="22" text-anchor="middle">순환 참조 탐지 5단계</text>
<rect class="gc-box" x="20" y="38" width="360" height="32" rx="5"/>
<text class="gc-l" x="34" y="59">1. gc_refs를 참조 카운트로 초기화</text>
<path class="gc-a" d="M200 70 L200 82"/>
<rect class="gc-box" x="20" y="84" width="360" height="32" rx="5"/>
<text class="gc-l" x="34" y="105">2. 집합 내부의 참조만큼 gc_refs 차감</text>
<path class="gc-a" d="M200 116 L200 128"/>
<rect class="gc-key" x="20" y="130" width="360" height="32" rx="5"/>
<text class="gc-l" x="34" y="151">3. gc_refs가 0인 것을 잠정 unreachable로</text>
<path class="gc-a" d="M200 162 L200 174"/>
<rect class="gc-key" x="20" y="176" width="360" height="32" rx="5"/>
<text class="gc-l" x="34" y="197">4. 0이 아닌 것에서 도달 가능하면 되돌리기</text>
<path class="gc-a" d="M200 208 L200 220"/>
<rect class="gc-box" x="20" y="222" width="360" height="32" rx="5"/>
<text class="gc-l" x="34" y="243">5. 끝까지 남은 것만 해제</text>
<text class="gc-n" x="200" y="278" text-anchor="middle">3단계의 0은 순환이 아니라</text>
<text class="gc-n" x="200" y="294" text-anchor="middle">집합 바깥 참조가 없다는 뜻</text>
</svg>
</div>

먼저 파이썬은 모든 컨테이너 객체를 추적하기 위해 더블 링크드 리스트를 유지합니다. `PyGC_Head`라는 구조체에 정의되어 있으며, 컨테이너 객체가 생성 혹은 삭제될 때 이 리스트에 추가되거나 제거됩니다. 수집이 시작되면 이 리스트에서 뽑은 후보 집합을 대상으로 다음 다섯 단계가 돌아갑니다.

1. 각 객체는 `gc_refs`라는 필드를 가지고 있으며, 초기에 객체의 레퍼런스 카운트와 동일하게 설정됩니다.
2. 후보 집합 안의 객체들이 서로를 참조하는 만큼 `gc_refs`를 감소시킵니다. 이 과정이 끝나면 `gc_refs`에는 **집합 바깥에서 들어오는 참조 수**만 남습니다.
3. `gc_refs`가 0인 객체를 **잠정적으로(tentatively) unreachable**로 표시합니다.
4. `gc_refs`가 0보다 큰 객체에서 출발해 참조를 따라가는 너비 우선 탐색을 돌립니다. 이 탐색에 걸린 객체는 살아 있는 것이므로 원래 리스트로 되돌립니다.
5. 탐색이 끝난 뒤에도 잠정 unreachable 목록에 남아 있는 객체만 실제로 해제합니다.

여기서 3단계와 4단계를 뭉뚱그리면 안 됩니다. `gc_refs == 0`은 "이 객체가 순환에 속한다"는 뜻이 **아닙니다.** 집합 바깥에서 오는 참조가 없다는 뜻일 뿐입니다. 순환에 전혀 속하지 않은 객체도 0이 될 수 있습니다. 살아 있는 객체(`gc_refs > 0`)가 그 객체를 참조하고 있을 수 있기 때문입니다. 그래서 되돌리기 순회가 반드시 필요합니다. 이 단계를 건너뛰고 0인 객체를 곧바로 해제하면 멀쩡히 살아 있는 객체를 지우게 됩니다.

### 최적화

위의 설명대로라면 순환 참조를 일으키지 않는 컨테이너 객체들은 추적할 필요가 없습니다. 파이썬은 가비지 컬렉션의 비용을 줄이기 위해 일부 객체들을 추적에서 제외합니다. 물론, 제외할 객체를 결정하는 것도 비용이기 때문에 비용의 이득 관계를 고려하여 다음과 같은 두 가지 시점에 판단합니다.

- 컨테이너가 생성될 때
- 가비지 컬렉터가 컨테이너를 검사할 때

일반적으로 atomic한 인스턴스의 경우 추적하지 않고, 그렇지 않은 인스턴스는 추적합니다. `gc.is_tracked(obj)` 함수를 사용하면 객체의 추적 상태를 확인할 수 있습니다.

```python
# Python 3.13 기준
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

dict 예시는 버전을 탑니다. 3.13까지는 위처럼 값이 전부 atomic이면 추적하지 않다가 컨테이너가 들어오는 순간 추적을 시작했는데, **Python 3.14에서 이 지연 추적(lazy tracking)이 제거되면서 dict는 생성 시점부터 추적됩니다.** 3.14 이상에서는 `gc.is_tracked({"a": 1})`이 `True`를 반환합니다. 문서 자체도 이런 최적화는 타입별로 있을 수도 없을 수도 있다고 밝히고 있으므로, 특정 버전의 결과를 항구적인 규칙으로 받아들이지 않는 편이 좋습니다.

## 함께 보면 좋은 글

- [Reference Counting](/python/reference-counting/) : 순환 참조가 왜 카운트만으로는 해결되지 않는지
- [Global Interpreter Lock](/python/global-interpreter-lock/) : GIL이 지키려는 것이 바로 이 참조 카운트입니다

## 참고 자료

- [Python Developer's Guide - Garbage Collector](https://devguide.python.org/internals/garbage-collector/)
- [gc - Python Docs](https://docs.python.org/3/library/gc.html)
- [Remove lazy dictionary tracking (gh-127010)](https://github.com/python/cpython/issues/127010)
