---
date: '2025-07-28'
title: 'Dependency Injection 제대로 이해하기'
category: 'FastAPI'
series: 'fastapi-series'
seriesOrder: 3
summary: '의존성 주입(DI)의 개념과 원리를 이해하고, 실제 코드에 적용하는 방법을 알아봅니다.'
thumbnail: './fastapi-logo.png'
---

의존성 주입(Dependency Injection, DI)은 자주 언급되는 용어지만, 완전히 이해하고 설계로 연결하기가 꽤 어려운 주제입니다. 특히 Python 기반 프레임워크를 사용할 때는 더욱 그렇습니다. 자바 진영인 스프링에서는 프레임워크 단에서 DI가 설계되어 있기 때문에 주도적으로 사용이 가능하지만, FastAPI 같은 프레임워크에서는 사실상 함수 기능만 제공하고 있기 때문입니다.

먼저 의존성 주입을 제대로 이해하고, 이후에 FastAPI에는 어떻게 적용할 수 있을지 알아보겠습니다.

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

<br>

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
바로 **의존성 분리**라는 개념이 포함되는데, 이는 외부에서 객체를 넣어주는 것만이 아니라 상위 계층이 하위 계층에 직접 의존하지 않도록 해야 합니다. 이를 가능하게 해주는 원칙이 바로 **의존관계 역전 원칙(Dependency Inversion Principle, DIP)** 입니다.

<br>

기존에는 `Car`가 `Engine`이라는 구체적인 클래스에 의존했습니다.
하지만 DIP를 적용하면, `Car`는 `Engine`의 **인터페이스**(**Interface** or **Protocol**)에만 의존하고, 실제 구현은 나중에 주입됩니다.

<br>

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

이제 `Car`는 `GasEngine` 혹은 `ElectricEngine` 중 무엇이 들어올지 몰라도 동작이 가능합니다.
오로지 `Engine Interface`에만 의존하고 있습니다.
구현체의 변경에 영향을 받지 않기 때문에 유지보수성과 테스트 편의성이 향상됩니다.
또한 Interface 혹은 Protocol만 파악하고 있으면 코드 분석도 수월해집니다.


## IoC (Inversion of Control)
DIP가 적용되기 전인 기존 구조에서는 `Car`가 **직접 엔진을 제어**했습니다.
이후에는 제어의 흐름이 **외부에서 어떤 엔진을 줄지 결정**하는 방식으로 바뀌었습니다.

이러한 제어 주체의 전환을 제어의 역전(IoC)이라고 부릅니다.

<div style="overflow-x: auto; margin: 24px 0;">
  <table style="width: 100%; max-width: 800px; margin: 0 auto; border-collapse: collapse; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
    <thead>
      <tr style="background-color: #e6e6fa; color: #4a4a4a;">
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 32%;">용어</th>
        <th style="padding: 16px 20px; text-align: left; font-weight: 600; width: 68%;">의미</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">의존성(Dependency)</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">어떤 객체가 다른 객체를 필요로 하는 관계</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">주입(Injection)</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">필요한 객체를 외부에서 넣어주는 행위</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">의존성 분리(Separation)</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">구체 구현에 의존하지 않고, 추상화된 인터페이스에만 의존하게 만드는 설계</td>
      </tr>
      <tr style="background-color: #fdfdfd;">
        <td style="padding: 16px 20px; font-weight: 600; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; color: #495057;">DIP (의존관계 역전 원칙)</td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e9ecef;">상위 계층이 하위 구현이 아닌, 인터페이스(추상화)에 의존하도록 구조를 설계</td>
      </tr>
      <tr style="background-color: #ffffff;">
        <td style="padding: 16px 20px; font-weight: 600; background-color: #f8f9fa; color: #495057;">IoC (제어의 역전)</td>
        <td style="padding: 16px 20px;">객체 생성/제어의 책임을 외부로 위임하여 유연한 구조를 만드는 설계 패턴</td>
      </tr>
    </tbody>
  </table>
</div>

지금까지의 개념을 표로 정리해보았는데요, 추가적으로 IoC Container라는 개념도 있습니다.
IoC Container에서는 프레임워크나 컨테이너가 객체 생성, 관리 및 의존성 주입에 대한 제어권을 가집니다.
개발자가 직접 객체의 생명 주기와 의존성을 관리하는 것이 아니라 컨테이너에 위임하는 것입니다.

보통 자바(스프링)에서 많이 언급되는데, 이는 스프링이라는 프레임워크 자체가 객체의 생성을 비롯한 의존성 관리, 애플리케이션 흐름 제어 등을 프레임워크가 주도하도록 설계되었기 때문입니다.


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

<br>

**클래스 간의 강한 결합**

`Car`는 내부에서 `Engine`을 직접 생성하기 때문에 `Engine`에 강하게 결합되어 있습니다. 만약 `HybridEngine` 같은 새로운 엔진을 사용하고 싶으면 `Car` 클래스의 생성자를 수정해야 합니다. 다른 엔진을 장착하기 위해 생성자만 다르고 나머지 코드는 중복되는 각기 다른 `Car` 클래스들이 파생되는 것은 좋지 않습니다. 즉, 유연성이 떨어지고 확장에 취약한 구조가 됩니다.

<br>

**객체가 아닌 클래스 간의 관계**

올바른 객체지향적 설계에서는 객체 간의 관계가 중심이 되어야 합니다. 위의 예시에서 `Car`와 `Engine`은 객체들 간의 관계가 아니라 클래스들 간의 관계가 맺어져 있습니다. 결과적으로 `Car`는 다른 타입의 `Engine`이 존재한다는 사실조차 인식할 수 없습니다.

결국 이러한 문제들을 근본적으로 해결하기 위해, 하나의 객체가 어떤 객체(구체 클래스)에 의존할 것인지는 별도의 관심사로 두어야 합니다. 강하게 결합된 클래스들을 분리하고, 결합도를 낮추고, 유연성을 확보해주는 것이 핵심입니다.

<br>

정리하면, DI 방식 설계로 아래와 같은 장점들을 얻을 수 있습니다.

1. 객체를 외부에서 주입받아 클래스 간 결합도가 낮아집니다.
2. Mock 객체로 쉽게 교체할 수 있어 테스트가 쉬워집니다.
3. 생성 로직이 분리되어 유지보수와 확장이 편해집니다.
4. 컨테이너가 생명주기를 관리해 자원 사용이 효율적입니다.
5. 비즈니스 로직에 집중할 수 있어 코드가 더 명확해집니다.

## 참고 자료
- [DI(Dependency Injection)이란?](https://medium.com/@jang.wangsu/di-dependency-injection-%EC%9D%B4%EB%9E%80-1b12fdefec4f)
- [의존성 주입(Dependency Injection, DI)이란?](https://mangkyu.tistory.com/150) 
- [다양한 의존성 주입 방법과 생성자 주입을 사용해야 하는 이유](https://mangkyu.tistory.com/125)
