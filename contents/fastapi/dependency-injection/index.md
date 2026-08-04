---
date: '2025-07-28'
title: 'Dependency Injection 제대로 이해하기'
category: 'FastAPI'
series: 'fastapi'
seriesOrder: 3
summary: '의존성 주입(DI)의 개념을 Car와 Engine 예제로 짚어봅니다. 의존성 분리와 의존관계 역전 원칙(DIP), 제어의 역전(IoC)까지, 의존 화살표의 방향이 어떻게 뒤집히는지를 중심으로 정리합니다.'
thumbnail: './fastapi-logo.png'
---

의존성 주입(Dependency Injection, DI)은 자주 언급되는 용어지만, 완전히 이해하고 설계로 연결하기가 꽤 어려운 주제입니다. 특히 Python 기반 프레임워크를 사용할 때는 더욱 그렇습니다. 자바 진영인 스프링에서는 프레임워크 단에서 DI가 설계되어 있기 때문에 주도적으로 사용이 가능하지만, FastAPI는 함수와 호출 가능한 클래스 수준의 주입만 제공하기 때문입니다.

이번 글에서는 의존성 주입이라는 개념 자체를 제대로 짚어보겠습니다. 용어의 정의부터 시작해 DIP와 IoC까지, 왜 이런 설계가 필요한지 순서대로 살펴봅니다.

## Dependency Injection이란?

**필요한 객체를 직접 만들지 않고, 외부에서 주입 받아 쓰는 설계 방식**

언뜻 개념은 쉬워 보이지만 DI가 굳이 왜 필요한지, 어떤 장점이 있는지 완전히 이해하기는 꽤 어렵습니다.
먼저 기본적으로 의존 관계를 가지는 예시를 보며 의존성이라는 용어부터 이해해보겠습니다.
```python
class Engine:
    def start(self):
        print("엔진이 켜졌습니다.")

class Car:
    def __init__(self):
        self.engine = Engine()  # Car는 Engine에 의존함

    def drive(self):
        self.engine.start()
        print("자동차가 출발합니다.")

car = Car()
car.drive()
```

위의 예제에서 `Car` 클래스는 `Engine` 클래스를 내부에서 변수로 사용하고 있습니다.
이때 `Car` 클래스가 제대로 동작하기 위해서는 반드시 `Engine`이 필요합니다.
즉, `Car`는 `Engine` 없이 작동하지 못하므로 `Engine`에 의존 관계가 생긴 것입니다.

```python
class Engine:
    def start(self):
        print("엔진이 켜졌습니다.")

class Car:
    def __init__(self, engine):  # 의존성을 외부에서 주입받음
        self.engine = engine

    def drive(self):
        self.engine.start()
        print("자동차가 출발합니다.")

engine = Engine()
car = Car(engine)  # 의존성 주입
car.drive()
```

위의 예제에서는 `Engine`을 `Car` 내부에서 생성하는 것이 아닌, 외부에서 생성하여 넣어주고 있습니다.
`Car`는 `Engine` 객체가 필요한데, 이를 직접 만들지 않고 외부에서 주입 받아 사용하고 있습니다.

## 의존성 분리와 의존관계 역전 원칙(DIP)
지금까지는 처음에 나왔던 개념과 일치하는 상황인데, 여기서 DI는 의존성을 주입하는 것으로 끝나지 않습니다.
바로 **의존성 분리**라는 개념이 함께 따라옵니다. 외부에서 객체를 넣어주는 데서 그치지 않고, 상위 계층이 하위 계층에 직접 의존하지 않도록 만드는 것까지가 여기에 포함됩니다. 이를 가능하게 해주는 원칙이 바로 **의존관계 역전 원칙(Dependency Inversion Principle, DIP)** 입니다.

기존에는 `Car`가 `Engine`이라는 구체적인 클래스에 의존했습니다.
하지만 DIP를 적용하면, `Car`는 `Engine`의 **인터페이스**(**Interface** or **Protocol**)에만 의존하고, 실제 구현은 나중에 주입됩니다.

```python
from typing import Protocol

# 인터페이스 정의
class Engine(Protocol):
    def start(self) -> None: ...

# 실제 구현체 1
class GasEngine:
    def start(self) -> None:
        print("가솔린 엔진이 켜졌습니다.")

# 실제 구현체 2
class ElectricEngine:
    def start(self) -> None:
        print("전기 엔진이 켜졌습니다.")

# Engine 인터페이스에만 의존하는 Car
class Car:
    def __init__(self, engine: Engine):  # 의존성 주입
        self.engine = engine

    def drive(self) -> None:
        self.engine.start()
        print("자동차가 출발합니다.")

# 사용
car = Car(GasEngine())
car.drive()

car2 = Car(ElectricEngine())
car2.drive()
```

'역전'이라는 이름이 어디서 왔는지는 화살표를 그려보면 드러납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 406" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="DIP 적용 전에는 Car가 구체 클래스 Engine을 직접 가리키고, 적용 후에는 Car와 GasEngine, ElectricEngine이 모두 가운데의 Engine Protocol을 향하도록 화살표 방향이 바뀌는 그림">
<style>
.di-title { font-size: 16px; font-weight: 700; fill: var(--text, #1c1917); }
.di-panel { font-size: 15px; font-weight: 600; fill: var(--text-muted, #6d6762); }
.di-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.di-solid { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.di-proto { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; stroke-dasharray: 5 3; }
.di-main { font-size: 16px; font-weight: 600; fill: var(--text, #1c1917); }
.di-pmain { font-size: 16px; font-weight: 600; fill: var(--primary, #0a756c); }
.di-sub { font-size: 14px; fill: var(--text-muted, #6d6762); }
.di-impl { font-size: 15px; fill: var(--text, #1c1917); }
.di-note { font-size: 14px; fill: var(--text-muted, #6d6762); }
.di-lineA { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.di-lineB { stroke: var(--primary, #0a756c); stroke-width: 1.8; fill: none; }
.di-conform { stroke: var(--primary, #0a756c); stroke-width: 1.8; fill: none; stroke-dasharray: 5 3; }
</style>
<defs>
<marker id="diArrowA" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted, #6d6762)"/></marker>
<marker id="diArrowB" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--primary, #0a756c)"/></marker>
</defs>
<text class="di-title" x="200" y="20" text-anchor="middle">의존 방향이 뒤집히는 지점</text>
<!-- 적용 전 -->
<text class="di-panel" x="8" y="48" text-anchor="start">DIP 적용 전</text>
<rect class="di-box" x="120" y="58" width="160" height="44" rx="8"/>
<text class="di-main" x="200" y="86" text-anchor="middle">Car</text>
<path class="di-lineA" d="M200,102 L200,124" marker-end="url(#diArrowA)"/>
<text class="di-note" x="212" y="120" text-anchor="start">생성·소유</text>
<rect class="di-solid" x="120" y="128" width="160" height="48" rx="8"/>
<text class="di-main" x="200" y="150" text-anchor="middle">Engine</text>
<text class="di-sub" x="200" y="169" text-anchor="middle">구체 클래스</text>
<!-- 적용 후 -->
<text class="di-panel" x="8" y="212" text-anchor="start">DIP 적용 후</text>
<rect class="di-box" x="120" y="222" width="160" height="44" rx="8"/>
<text class="di-main" x="200" y="250" text-anchor="middle">Car</text>
<path class="di-lineB" d="M200,266 L200,288" marker-end="url(#diArrowB)"/>
<text class="di-note" x="212" y="284" text-anchor="start">타입만 의존</text>
<rect class="di-proto" x="110" y="292" width="180" height="48" rx="8"/>
<text class="di-pmain" x="200" y="314" text-anchor="middle">Engine</text>
<text class="di-sub" x="200" y="333" text-anchor="middle">Protocol</text>
<path class="di-conform" d="M104,362 L150,344" marker-end="url(#diArrowB)"/>
<path class="di-conform" d="M296,362 L250,344" marker-end="url(#diArrowB)"/>
<text class="di-note" x="200" y="357" text-anchor="middle">구조적 적합</text>
<rect class="di-solid" x="16" y="364" width="176" height="38" rx="8"/>
<text class="di-impl" x="104" y="388" text-anchor="middle">GasEngine</text>
<rect class="di-solid" x="208" y="364" width="176" height="38" rx="8"/>
<text class="di-impl" x="296" y="388" text-anchor="middle">ElectricEngine</text>
</svg>
</div>

상위 계층이 하위 구현을 향하던 화살표가 양쪽 모두 가운데 추상을 향하게 되는 것, 이것이 '역전'입니다.

다만 아래쪽 화살표를 점선으로 그린 데는 이유가 있습니다. `GasEngine`은 `Engine`을 상속하지도, import하지도 않습니다. `typing.Protocol`은 구조적 서브타이핑이라 메서드 모양만 맞으면 적합한 것으로 간주되고, 그 판정은 타입 체커가 합니다. 자바의 `implements`처럼 코드에 적어 넣는 관계가 아닙니다. 런타임에 상속 관계를 강제하고 싶다면 `abc.ABC`와 `@abstractmethod`를 쓰면 됩니다.

이제 `Car`는 `GasEngine` 혹은 `ElectricEngine` 중 무엇이 들어올지 몰라도 동작이 가능합니다.
오로지 `Engine` Protocol에만 의존하고 있습니다.
구현체의 변경에 영향을 받지 않기 때문에 유지보수성과 테스트 편의성이 향상됩니다.
또한 Interface 혹은 Protocol만 파악하고 있으면 코드 분석도 수월해집니다.

## IoC (Inversion of Control)
DIP가 적용되기 전인 기존 구조에서는 `Car`가 **직접 엔진을 제어**했습니다.
이후에는 제어의 흐름이 **외부에서 어떤 엔진을 줄지 결정**하는 방식으로 바뀌었습니다.

이러한 제어 주체의 전환을 제어의 역전(IoC)이라고 부릅니다.

| 용어 | 의미 |
|---|---|
| 의존성(Dependency) | 어떤 객체가 다른 객체를 필요로 하는 관계 |
| 주입(Injection) | 필요한 객체를 외부에서 넣어주는 행위 |
| 의존성 분리(Separation) | 구체 구현에 의존하지 않고, 추상화된 인터페이스에만 의존하게 만드는 설계 |
| DIP (의존관계 역전 원칙) | 상위 계층이 하위 구현이 아닌, 인터페이스(추상화)에 의존하도록 구조를 설계 |
| IoC (제어의 역전) | 객체 생성/제어의 책임을 외부로 위임하여 유연한 구조를 만드는 설계 패턴 |

지금까지의 개념을 표로 정리해보았는데요, 추가적으로 IoC Container라는 개념도 있습니다.
IoC Container에서는 프레임워크나 컨테이너가 객체 생성, 관리 및 의존성 주입에 대한 제어권을 가집니다.
개발자가 직접 객체의 생명 주기와 의존성을 관리하는 것이 아니라 컨테이너에 위임하는 것입니다.

보통 자바(스프링)에서 많이 언급되는데, 스프링이 객체 생성과 의존성 관리, 애플리케이션 흐름 제어까지 프레임워크가 주도하도록 설계되었기 때문입니다.

## 그래서 DI가 왜 필요한 건가요?

지금까지 `Car`와 `Engine` 클래스 예시와 함께 DI가 어떻게 구현되는지 알아보았습니다.

```python
class Engine:
    def start(self):
        print("엔진이 켜졌습니다.")

class Car:
    def __init__(self):
        self.engine = Engine()  # Car는 Engine에 의존함

    def drive(self):
        self.engine.start()
        print("자동차가 출발합니다.")
```

처음에 다뤘던 위의 코드에서는 다음과 같은 구조적 문제가 있었습니다.

**클래스 간의 강한 결합**

`Car`는 내부에서 `Engine`을 직접 생성하기 때문에 `Engine`에 강하게 결합되어 있습니다. 만약 `HybridEngine` 같은 새로운 엔진을 사용하고 싶으면 `Car` 클래스의 생성자를 수정해야 합니다. 다른 엔진을 장착하기 위해 생성자만 다르고 나머지 코드는 중복되는 각기 다른 `Car` 클래스들이 파생되는 것은 좋지 않습니다. 즉, 유연성이 떨어지고 확장에 취약한 구조가 됩니다.

**객체가 아닌 클래스 간의 관계**

올바른 객체지향적 설계에서는 객체 간의 관계가 중심이 되어야 합니다. 위의 예시에서 `Car`와 `Engine`은 객체들 간의 관계가 아니라 클래스들 간의 관계가 맺어져 있습니다. 결과적으로 `Car`는 다른 타입의 `Engine`이 존재한다는 사실조차 인식할 수 없습니다.

결국 이러한 문제들을 근본적으로 해결하기 위해, 하나의 객체가 어떤 객체(구체 클래스)에 의존할 것인지는 별도의 관심사로 두어야 합니다. 강하게 결합된 클래스들을 분리하고, 결합도를 낮추고, 유연성을 확보해주는 것이 핵심입니다.

정리하면, DI 방식 설계로 아래와 같은 장점들을 얻을 수 있습니다.

1. 객체를 외부에서 주입받아 클래스 간 결합도가 낮아집니다.
2. Mock 객체로 쉽게 교체할 수 있어 테스트가 쉬워집니다.
3. 생성 로직이 분리되어 유지보수와 확장이 편해집니다.
4. 컨테이너가 생명주기를 관리해 자원 사용이 효율적입니다.
5. 비즈니스 로직에 집중할 수 있어 코드가 더 명확해집니다.

## 마치며

결국 DI는 문법이 아니라 배치의 문제입니다. 객체를 누가 만들고 누가 받아 쓰는지를 클래스 바깥으로 밀어내는 순간, 나머지 장점은 따라옵니다. `Car`가 `Engine()`을 직접 부르지 않게 만든 것, 그 한 줄이 전부입니다.

## 함께 보면 좋은 글

- [FastAPI에서 의존성 주입을?](/fastapi/dependency-injector/)
- [FastAPI 프로젝트를 체계적으로 구조화하는 방법](/fastapi/how-to-structure-fastapi-projects/)

## 참고자료

- [DI(Dependency Injection)이란?](https://medium.com/@jang.wangsu/di-dependency-injection-%EC%9D%B4%EB%9E%80-1b12fdefec4f)
- [의존성 주입(Dependency Injection, DI)이란?](https://mangkyu.tistory.com/150)
- [다양한 의존성 주입 방법과 생성자 주입을 사용해야 하는 이유](https://mangkyu.tistory.com/125)
