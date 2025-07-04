---
date: '2025-02-06'
title: '[Python] Reference Counting'
category: 'Dev'
summary: 'Python의 메모리 관리 기법인 참조 카운팅의 동작 원리와 순환 참조 문제에 대해 알아봅니다.'
thumbnail: './python-logo.png'
---

## Reference Counting 이란?
파이썬에서 참조 카운팅(reference counting)은 중요한 메모리 관리 기법 중 하나입니다. CPython에서 Garbage Collection의 기반은 reference counts 방식이며, 특정 객체의 reference count가 0이 되면 객체의 메모리 할당이 해제되는 식으로 동작합니다. 여기에 추가적으로 세대별 가비지 컬렉션을 활용하여 메모리를 관리하게 됩니다.

### 작동 원리
객체의 참조 카운팅은 다음과 같은 주기를 가집니다.

- 객체 생성: 객체 생성 시, 참조 카운트는 1로 설정됩니다.
- 참조 추가: 객체에 대한 새로운 참조 시 카운트가 1씩 증가합니다. 
ex) 다른 변수에 할당
- 참조 해제: 참조가 더 이상 필요하지 않을 때, 참조 카운트가 감소합니다. 
ex) 변수가 범위를 벗어나거나 다른 객체로 대체되는 경우
- 객체 소멸: 참조 카운트가 0이 되면, 해당 객체를 메모리에서 자동으로 해제합니다.
<br>

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

c = 1
print(sys.getrefcount(c))
# 191
```

첫 번째의 경우 왜 참조 카운트가 3이 나올까요? 이유는 getrefcount() 함수 자체가 해당 객체에 대한 임시 참조를 생성하기 때문입니다. 결과적으로 예상한 카운트보다 1을 더한 값을 얻습니다. a 객체를 생성하고, b 객체가 a 객체를 참조하게 되었으니 실제 카운트 2에 1이 더해져 3이 나오는 것입니다.

두 번째에서는 b 객체를 None으로 바꿈으로써 a 객체 참조를 해제하게 되었고, 결과적으로 참조 카운트가 감소되었습니다.

마지막의 경우 객체 c에 1을 할당하고, 참조 카운트를 출력해보면 191이라는 예상치 못한 결과가 나옵니다. 이는 파이썬의 내부 최적화 때문입니다. 파이썬에서 작은 정수들은 사전에 미리 할당되고, 전역적으로 재사용됩니다. 따라서 c = 1 과 같이 정수 객체를 할당하면, 새로 객체를 생성하는 것이 아닌 이미 존재하는 객체에 대한 참조를 얻게 됩니다.
<br>

### 순환 참조 문제
순환 참조란 2개 이상의 객체가 서로를 참조하는 상황을 뜻합니다. 참조 카운팅 기반의 메모리 관리 시스템에서는 순환 참조 객체들의 메모리가 적절히 해제되지 않는 경우, 메모리 누수 현상이 발생할 수 있습니다. 참조 카운트가 0이 되어야 메모리를 해제하는데, 서로를 참조하고 있어 메모리에서 해제되지 않는 것입니다.

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
```

위 코드에서 node_a는 node_b를 자식으로 참조하고, node_b는 node_a의 부모로 참조하고 있습니다. 이러한 경우가 순환 참조이며, 서로를 참조하고 있어 참조 카운트가 0이 될 수 없습니다. 파이썬에서는 이를 해결하기 위해 세대별 가비지 컬렉터를 활용하는데, 이에 대한 설명은 다음 포스트에서 이어가겠습니다.

물론 가비지 컬렉터 외에도 순환 참조 문제를 예방할 수 있는 방법이 존재합니다. 파이썬에서는 weakref라는 모듈을 제공합니다. 해당 모듈을 사용하면 객체 간에 약한 참조를 생성할 수 있는데, 약한 참조의 경우 참조 카운트에 영향을 주지 않아 순환 참조 문제를 예방할 수 있습니다. 다른 방법으로는 객체 구조를 재구성하거나, 필요 없어진 객체의 경우 None을 활용하여 명시적 해제를 하는 방법도 있습니다.

## 참고 자료

- [Python 메모리 관리와 참조 카운팅](https://velog.io/@dh5473/Python-Reference-Counting)




