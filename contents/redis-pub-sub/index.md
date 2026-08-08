---
date: '2025-06-06'
title: 'Redis Pub/Sub 활용하기'
category: 'System Design'
summary: 'Redis Pub/Sub은 메시지를 저장하지 않는 at-most-once 전달입니다. 구독자가 없을 때 메시지가 사라지는 이유와 구독 상태의 명령 제약을 실제 출력으로 확인합니다.'
thumbnail: './redis-pub-sub-background.png'
---

서비스를 개발하다 보면 하나의 이벤트에 여러 시스템이 동시에 반응해야 하는 상황을 자주 마주합니다. 고객이 쇼핑몰에서 주문을 완료하면 결제 처리, 재고 차감, 배송 준비, 알림 발송, 포인트 적립, 통계 갱신이 함께 일어나야 합니다.

가장 직관적인 방법은 주문 처리 코드에서 각 시스템을 순서대로 호출하는 것입니다. 하지만 중간의 한 단계가 실패하면 뒤에 남은 단계가 전부 멈춥니다. 기능을 하나 붙일 때마다 주문 코드를 다시 손봐야 하는 부담도 따라옵니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="순차 호출은 한 단계가 막히면 뒤 단계가 전부 멈추고, Pub Sub은 브로커가 여러 구독자에게 동시에 전달해 한 구독자의 장애가 다른 구독자로 번지지 않는다는 대비">
<style>
.ps-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.ps-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.ps-l { fill: var(--text, #1c1917); font-size: 14px; }
.ps-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.ps-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ps-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.ps-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ps-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.ps-hub { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.ps-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#psArrow); }
.ps-x { stroke: var(--text-danger, #cb2121); stroke-width: 2; fill: none; }
.ps-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="psArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="ps-t" x="200" y="22" text-anchor="middle">순차 호출과 팬아웃</text>
<!-- 위 패널: 순차 호출 -->
<text class="ps-h" x="20" y="48">순차 호출</text>
<rect class="ps-box" x="16" y="58" width="76" height="32" rx="5"/>
<text class="ps-l" x="54" y="79" text-anchor="middle">주문</text>
<path class="ps-a" d="M92 74 L106 74"/>
<rect class="ps-box" x="110" y="58" width="76" height="32" rx="5"/>
<text class="ps-l" x="148" y="79" text-anchor="middle">결제</text>
<path class="ps-a" d="M186 74 L200 74"/>
<rect class="ps-bad" x="204" y="58" width="76" height="32" rx="5"/>
<text class="ps-l" x="242" y="79" text-anchor="middle">재고</text>
<path class="ps-x" d="M290 68 L302 80 M302 68 L290 80"/>
<rect class="ps-box" x="308" y="58" width="76" height="32" rx="5"/>
<text class="ps-n" x="346" y="79" text-anchor="middle">배송</text>
<text class="ps-d" x="200" y="118" text-anchor="middle">뒤 단계 전부 중단</text>
<line class="ps-div" x1="20" y1="142" x2="380" y2="142"/>
<!-- 아래 패널: Pub/Sub -->
<text class="ps-h" x="20" y="170">Pub/Sub</text>
<rect class="ps-box" x="16" y="196" width="76" height="32" rx="5"/>
<text class="ps-l" x="54" y="217" text-anchor="middle">주문</text>
<path class="ps-a" d="M92 212 L106 212"/>
<rect class="ps-hub" x="110" y="196" width="86" height="32" rx="5"/>
<text class="ps-w" x="153" y="217" text-anchor="middle">브로커</text>
<path class="ps-a" d="M196 208 L266 184"/>
<path class="ps-a" d="M196 212 L266 212"/>
<path class="ps-a" d="M196 216 L266 240"/>
<rect class="ps-box" x="270" y="164" width="104" height="30" rx="5"/>
<text class="ps-l" x="322" y="184" text-anchor="middle">결제</text>
<rect class="ps-bad" x="270" y="197" width="104" height="30" rx="5"/>
<text class="ps-l" x="322" y="217" text-anchor="middle">재고</text>
<rect class="ps-box" x="270" y="230" width="104" height="30" rx="5"/>
<text class="ps-l" x="322" y="250" text-anchor="middle">배송</text>
<text class="ps-n" x="200" y="286" text-anchor="middle">구독자 간 장애 전파 없음</text>
</svg>
</div>

이벤트를 발행하기만 하면 관심 있는 시스템이 알아서 처리하도록 만들자는 발상이 Publish-Subscribe 패턴입니다.

## Publish-Subscribe

분산 시스템에서 컴포넌트끼리 메시지를 주고받는 방식을 메시징 패턴이라고 부릅니다. Request-Reply, Publish-Subscribe, Push-Pull이 대표적입니다. 그중 Publish-Subscribe는 세 축으로 이루어집니다.

- **Publisher**: 메시지를 만들어 특정 토픽에 발행
- **Broker**: 발행된 메시지를 받아 구독자에게 전달하는 중개자
- **Subscriber**: 관심 있는 토픽을 구독하고 메시지를 수신

발행자와 구독자는 서로를 모르는 채로 통신합니다. 덕분에 서비스 간 결합도가 낮아지고, 소비 측을 늘릴 때 발행 코드를 건드릴 필요가 없습니다. 실시간 브로드캐스트가 필요한 채팅이나 알림, 모니터링처럼 하나의 이벤트를 여러 곳이 동시에 봐야 하는 자리에 잘 맞습니다.

대신 상태 관리 부담이 소비자 쪽으로 넘어갑니다. 메시지를 실제로 받았는지, 같은 메시지를 두 번 처리하지는 않았는지를 브로커가 아니라 애플리케이션이 책임져야 합니다. 이 부담을 브로커가 대신 져 주기를 원한다면 Apache Kafka 같은 시스템을 봐야 합니다.

## Redis Pub/Sub

Redis Pub/Sub은 Redis에 내장된 메시징 기능입니다. `PUBLISH`로 채널에 메시지를 보내면 그 채널을 구독 중인 모든 클라이언트에게 그대로 밀어 넣습니다. 채널을 미리 선언할 필요도 없고, 큐도 인덱스도 저장도 없습니다.

### 메시지는 저장되지 않습니다

Redis 공식 문서는 Pub/Sub의 전달 보장을 at-most-once로 못 박습니다. 한 번 보내면 끝이고, 받지 못한 쪽에 다시 보내는 경로가 아예 없습니다. 발행 시점에 구독자가 없었다면 그 메시지는 그대로 없어집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 384" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="구독자가 둘일 때는 PUBLISH가 2를 반환하고 둘 다 메시지를 받지만, 구독자가 없을 때는 0을 반환하고 메시지가 사라져서 뒤늦게 접속한 구독자도 받지 못한다는 대비">
<style>
.fp-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.fp-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.fp-l { fill: var(--text, #1c1917); font-size: 14px; }
.fp-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.fp-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.fp-ok { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.fp-no { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.fp-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.fp-good { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.fp-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.fp-hub { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.fp-ghost { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 5 4; }
.fp-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#fpArrow); }
.fp-cut { stroke: var(--text-danger, #cb2121); stroke-width: 1.5; fill: none; stroke-dasharray: 5 4; }
.fp-x { stroke: var(--text-danger, #cb2121); stroke-width: 2; fill: none; }
.fp-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="fpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="fp-t" x="200" y="24" text-anchor="middle">구독자가 있을 때와 없을 때</text>
<!-- 위 패널: 구독자 2 -->
<text class="fp-h" x="20" y="56">구독자 2</text>
<rect class="fp-box" x="16" y="70" width="88" height="34" rx="5"/>
<text class="fp-l" x="60" y="92" text-anchor="middle">발행자</text>
<path class="fp-a" d="M104 87 L134 87"/>
<rect class="fp-hub" x="138" y="70" width="86" height="34" rx="5"/>
<text class="fp-w" x="181" y="92" text-anchor="middle">news</text>
<path class="fp-a" d="M224 80 L262 62"/>
<path class="fp-a" d="M224 94 L262 112"/>
<rect class="fp-good" x="266" y="46" width="114" height="32" rx="5"/>
<text class="fp-l" x="323" y="67" text-anchor="middle">구독자 A</text>
<rect class="fp-good" x="266" y="98" width="114" height="32" rx="5"/>
<text class="fp-l" x="323" y="119" text-anchor="middle">구독자 B</text>
<text class="fp-ok" x="200" y="156" text-anchor="middle">PUBLISH 반환값 2</text>
<line class="fp-div" x1="20" y1="180" x2="380" y2="180"/>
<!-- 아래 패널: 구독자 0 -->
<text class="fp-h" x="20" y="210">구독자 0</text>
<rect class="fp-box" x="16" y="224" width="88" height="34" rx="5"/>
<text class="fp-l" x="60" y="246" text-anchor="middle">발행자</text>
<path class="fp-a" d="M104 241 L134 241"/>
<rect class="fp-hub" x="138" y="224" width="86" height="34" rx="5"/>
<text class="fp-w" x="181" y="246" text-anchor="middle">news</text>
<path class="fp-cut" d="M224 241 L240 241"/>
<path class="fp-x" d="M244 234 L258 248 M258 234 L244 248"/>
<rect class="fp-bad" x="266" y="224" width="114" height="34" rx="5"/>
<text class="fp-no" x="323" y="246" text-anchor="middle">메시지 소멸</text>
<text class="fp-no" x="200" y="288" text-anchor="middle">PUBLISH 반환값 0</text>
<rect class="fp-ghost" x="100" y="308" width="200" height="34" rx="5"/>
<text class="fp-n" x="200" y="330" text-anchor="middle">뒤늦게 접속한 구독자</text>
<text class="fp-n" x="200" y="368" text-anchor="middle">받을 메시지 없음</text>
</svg>
</div>

`redis-cli`로 바로 확인할 수 있습니다. 구독자가 하나도 없는 상태에서 발행하면 이렇게 나옵니다.

```text
$ redis-cli PUBLISH news "before-anyone-subscribes"
(integer) 0
```

이제 다른 터미널에서 구독을 겁니다.

```text
$ redis-cli SUBSCRIBE news
1) "subscribe"
2) "news"
3) (integer) 1
```

세 원소짜리 배열이 구독 확인 응답입니다. 첫 번째가 메시지 종류, 두 번째가 채널 이름, 세 번째가 이 연결이 현재 구독 중인 채널과 패턴의 총합입니다. 이 상태에서 다시 발행합니다.

```text
$ redis-cli PUBLISH news "hello"
(integer) 1
```

구독자 터미널에는 방금 보낸 `hello`만 찍힙니다.

```text
1) "message"
2) "news"
3) "hello"
```

앞서 보낸 `before-anyone-subscribes`는 어디에도 남아 있지 않습니다. 나중에 구독을 걸어도, 같은 채널을 몇 번을 다시 구독해도 그 메시지는 다시 오지 않습니다.

:::warning

**도입 전에 확인할 것**

Redis Pub/Sub을 쓰다가 생기는 대표적인 사고는 이 성질을 모른 채 중요한 이벤트를 실어 보내는 것입니다. 구독자를 배포하느라 몇 초 재시작하는 동안 들어온 메시지는 전부 사라집니다. 평소에는 정상으로 보이다가 배포할 때마다 조용히 몇 건씩 유실됩니다.

:::

`PUBLISH`의 반환값은 유일한 피드백이지만, 수신 확인이 아니라 **메시지가 닿은 구독의 수**입니다. 한 클라이언트가 같은 메시지에 걸리는 구독을 두 개 갖고 있으면 그 클라이언트 하나가 2로 집계됩니다. 공식 문서는 이 값을 클라이언트 수라고 적고 있으니, 채널 구독과 패턴 구독을 함께 거는 코드에서는 문서 그대로 받아들이면 안 됩니다. 클러스터 모드에서는 발행 클라이언트와 같은 노드에 붙은 대상만 세어집니다.

메시지가 사라지는 경로는 하나 더 있습니다. 구독자가 메시지를 제때 소비하지 못해 출력 버퍼가 한도를 넘으면 서버가 그 연결을 끊어 버립니다. 다시 붙어도 끊겨 있던 동안의 메시지는 되찾을 수 없습니다.

```text
$ redis-cli CONFIG GET client-output-buffer-limit
1) "client-output-buffer-limit"
2) "normal 0 0 0 slave 268435456 67108864 60 pubsub 33554432 8388608 60"
```

`pubsub` 항목의 세 숫자가 하드 한도 32MB, 소프트 한도 8MB, 소프트 지속 시간 60초입니다. 버퍼가 32MB를 넘는 즉시, 또는 8MB를 60초 동안 계속 넘고 있으면 연결이 닫힙니다. 일반 클라이언트는 기본값이 0이라 한도가 없습니다.

메시지 순서에 대해서는 오해가 흔합니다. Redis는 명령을 단일 스레드로 처리하므로 서버가 접수한 순서 그대로 모든 구독자에게 같은 순서로 전달합니다. 정해져 있지 않은 것은 서로 다른 클라이언트가 동시에 보낸 두 메시지 중 어느 쪽이 먼저 접수되는가뿐이고, 이건 어떤 메시징 시스템이든 마찬가지입니다.

Redis Pub/Sub이 메시지 큐로 취급되지 않는 더 근본적인 이유는 전달 모양이 다르기 때문입니다. Pub/Sub은 하나의 메시지가 모든 구독자에게 가는 팬아웃이고, 메시지 큐는 하나의 메시지를 정확히 한 소비자가 가져가는 작업 분배입니다. 애초에 풀려는 문제가 다릅니다.

### 구독 상태에서는 대부분의 명령이 막힙니다

RESP2로 접속한 클라이언트가 `SUBSCRIBE`를 보내는 순간 그 연결은 구독 모드로 들어갑니다. 이때 허용되는 명령은 `SUBSCRIBE`, `UNSUBSCRIBE`, `PSUBSCRIBE`, `PUNSUBSCRIBE`, `SSUBSCRIBE`, `SUNSUBSCRIBE`, `PING`, `QUIT`, `RESET`뿐입니다. 나머지는 서버가 거절합니다.

```text
ERR Can't execute 'get': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context
```

그래서 애플리케이션은 커넥션 풀에서 하나를 떼어 구독 전용으로 붙잡아 두는 구조가 됩니다. 같은 연결로 `GET`이나 `SET`을 함께 쓰고 싶다면 `HELLO 3`으로 RESP3에 접속해야 합니다. RESP3에서는 구독 중에도 일반 명령이 그대로 동작합니다.

채널 이름은 데이터베이스 번호와 무관하다는 점도 함께 알아 둘 만합니다. `SELECT 10`에서 발행한 메시지를 `SELECT 1`에 있는 구독자가 그대로 받습니다. 개발과 운영이 하나의 Redis 인스턴스를 db 번호로만 나눠 쓰고 있다면 채널 이름에 환경 접두사를 붙여야 합니다.

### 클러스터에서는 샤드 Pub/Sub

Redis 7.0부터 `SSUBSCRIBE`, `SUNSUBSCRIBE`, `SPUBLISH`로 샤드 Pub/Sub을 쓸 수 있습니다. 일반 Pub/Sub은 클러스터의 모든 노드로 메시지를 퍼뜨리지만, 샤드 Pub/Sub은 채널 이름을 슬롯에 해싱해 그 슬롯을 가진 샤드 안에서만 전달합니다. 클러스터 버스를 지나는 데이터가 그만큼 줄어들어, 샤드를 추가하는 방식으로 Pub/Sub 사용량을 늘릴 수 있습니다.

주의할 점은 두 계열의 채널 이름 공간이 분리돼 있다는 것입니다. `SPUBLISH news hello`로 보낸 메시지는 `SUBSCRIBE news`로 구독한 클라이언트에게 가지 않습니다. 이름이 같아도 서로 다른 채널입니다.

## 파이썬으로 써보기

`redis` 패키지를 설치하면 바로 쓸 수 있습니다.

### 발행자

```python
import redis

client = redis.Redis(host="localhost", port=6379)

for i in range(5):
    delivered = client.publish("news", f"hello {i + 1}")
    print(f"[PUBLISH] news <- hello {i + 1} (delivered: {delivered})")
```

`redis.Redis()`는 기본적으로 `localhost:6379`에 연결합니다. `publish()`가 돌려주는 `delivered`가 곧 `PUBLISH`의 반환값이라, 이 값이 0인지 감시하면 구독자가 전부 떨어져 나간 상황을 잡아낼 수 있습니다.

### 구독자

```python
import redis

client = redis.Redis(host="localhost", port=6379)
pubsub = client.pubsub()
pubsub.subscribe("news")

for message in pubsub.listen():
    if message["type"] == "message":
        print(f"[RECEIVE] news -> {message['data'].decode()}")
```

`listen()`은 메시지가 올 때까지 블로킹하는 제너레이터입니다. `type` 검사를 빼면 안 되는 이유가 있습니다. 구독 확인 메시지의 `type`은 `"subscribe"`이고, 그 `data`는 bytes가 아니라 현재 구독 중인 채널과 패턴의 수를 담은 정수입니다. 그대로 `.decode()`를 부르면 `AttributeError`가 납니다.

:::tip

**구독자를 다룰 때**

- 확인 메시지를 아예 받고 싶지 않다면 `client.pubsub(ignore_subscribe_messages=True)`로 만들면 됩니다.
- `listen()`으로 스레드를 붙잡아두는 대신 `get_message()`로 폴링하거나 `run_in_thread()`로 백그라운드에 넘길 수 있습니다.
- 하나의 채널에 여러 구독자가 붙으면 전원이 같은 메시지를 받습니다.

:::

### 패턴 구독

`psubscribe()`는 글로브 패턴으로 여러 채널을 한 번에 구독합니다. `news:*`는 `news:korea`, `news:world`, `news:tech`에 모두 걸립니다.

```python
import redis

client = redis.Redis(host="localhost", port=6379)
pubsub = client.pubsub()
pubsub.psubscribe("news:*")

for message in pubsub.listen():
    if message["type"] == "pmessage":
        channel = message["channel"].decode()
        print(f"[RECEIVE] {channel} -> {message['data'].decode()}")
```

패턴으로 들어온 메시지는 `type`이 `"pmessage"`이고, 매칭된 패턴은 `message["pattern"]`에, 실제로 발행된 채널은 `message["channel"]`에 담깁니다.

여기서 걸리기 쉬운 함정이 하나 있습니다. 한 클라이언트가 채널 구독과 그 채널에 걸리는 패턴 구독을 동시에 갖고 있으면, 같은 메시지를 `message`와 `pmessage`로 두 번 받습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 330" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="한 클라이언트가 채널 구독과 패턴 구독을 함께 걸어 두면 같은 메시지를 message와 pmessage로 두 번 받고 PUBLISH 반환값도 2가 된다는 그림">
<style>
.dp-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.dp-l { fill: var(--text, #1c1917); font-size: 14px; }
.dp-b { fill: var(--text, #1c1917); font-size: 14px; font-weight: 700; }
.dp-w { fill: var(--on-fill, #ffffff); font-size: 14px; }
.dp-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.dp-warn { fill: var(--text-warn, #9d5604); font-size: 14px; font-weight: 700; }
.dp-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.dp-hub { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.dp-focus { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
.dp-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#dpArrow); }
</style>
<defs>
<marker id="dpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="dp-t" x="200" y="24" text-anchor="middle">채널 구독과 패턴 구독이 겹칠 때</text>
<rect class="dp-hub" x="90" y="44" width="220" height="36" rx="5"/>
<text class="dp-w" x="200" y="68" text-anchor="middle">PUBLISH news:tech</text>
<path class="dp-a" d="M200 80 L200 96 L107 96 L107 112"/>
<path class="dp-a" d="M200 80 L200 96 L300 96 L300 112"/>
<!-- 왼쪽: 채널 구독 -->
<rect class="dp-box" x="14" y="116" width="186" height="84" rx="5"/>
<text class="dp-b" x="107" y="140" text-anchor="middle">채널 구독</text>
<text class="dp-l" x="107" y="164" text-anchor="middle">SUBSCRIBE news:tech</text>
<text class="dp-n" x="107" y="188" text-anchor="middle">message 수신</text>
<!-- 오른쪽: 패턴 구독 -->
<rect class="dp-box" x="214" y="116" width="172" height="84" rx="5"/>
<text class="dp-b" x="300" y="140" text-anchor="middle">패턴 구독</text>
<text class="dp-l" x="300" y="164" text-anchor="middle">PSUBSCRIBE news:*</text>
<text class="dp-n" x="300" y="188" text-anchor="middle">pmessage 수신</text>
<path class="dp-a" d="M107 200 L107 224 L172 224 L172 244"/>
<path class="dp-a" d="M300 200 L300 224 L228 224 L228 244"/>
<rect class="dp-focus" x="100" y="248" width="200" height="36" rx="5"/>
<text class="dp-l" x="200" y="272" text-anchor="middle">같은 클라이언트 1개</text>
<text class="dp-warn" x="200" y="314" text-anchor="middle">2회 수신, PUBLISH 반환값 2</text>
</svg>
</div>

이때 `PUBLISH`는 2를 반환합니다. 붙어 있는 클라이언트는 하나뿐인데도 그렇습니다. 반환값을 클라이언트 수로 읽고 있었다면 여기서 어긋납니다.

## 무엇을 대신 쓸 것인가

한계가 걸리는 지점은 대체로 셋 중 하나입니다.

| 필요한 것 | 대안 |
|---|---|
| 재접속 후 밀린 메시지 재생, 컨슈머 그룹 | Redis Streams |
| 장기 보존, 대용량 처리, 파티션 기반 확장 | Apache Kafka |
| 라우팅 규칙, 개별 ACK, 데드레터 큐 | RabbitMQ |

Redis Streams는 같은 Redis 안에 있어서 이동 비용이 가장 낮습니다. 메시지가 로그로 남고, 컨슈머 그룹이 어디까지 읽었는지를 서버가 기억하며, at-most-once와 at-least-once를 모두 지원합니다. Pub/Sub으로 시작했다가 유실이 문제가 됐다면 여기부터 보는 편이 낫습니다.

반대로 놓친 메시지를 굳이 다시 볼 필요가 없는 신호라면 Redis Pub/Sub이 가장 가볍습니다. 캐시 무효화 알림, 설정 변경 브로드캐스트, 지금 접속해 있는 사용자에게만 의미가 있는 실시간 알림이 그렇습니다.

## 마치며

Redis Pub/Sub의 값어치는 단순함에 있습니다. 서버에 이미 들어 있고, 채널을 미리 만들 필요도 없고, 발행과 구독 두 명령이 전부입니다. 놓쳐도 다음 신호가 곧 오는 일에는 이보다 가벼운 선택지를 찾기 어렵습니다.

문제는 그 단순함이 곧 한계라는 점입니다. 발행 시점에 구독자가 없으면 메시지는 남지 않고, 구독자가 잠깐 재시작하는 동안 도착한 메시지도 남지 않습니다. 주문 처리나 결제 정산처럼 한 건을 놓치면 안 되는 일에 이 구조를 쓰면 평소에는 잘 돌다가 배포하는 순간 조용히 몇 건이 빠집니다.

그래서 도입 전에 던져야 할 질문은 "빠른가"가 아니라 "이 메시지를 놓쳐도 되는가"입니다. 놓치면 안 된다는 답이 나오면 Redis Streams부터 검토하고, 보존 기간이나 라우팅 요구가 그 이상으로 커질 때 Kafka나 RabbitMQ로 넘어가도 늦지 않습니다.

## 함께 보면 좋은 글

- [Streaming Replication과 Logical Replication](/postgres/replication/) : 메시지를 로그에 남기고 어디까지 보냈는지 기억하는 반대편 설계
- [FastAPI Lifespan으로 앱의 시작과 끝을 관리하는 법](/fastapi/fastapi-lifespan/) : 구독 전용 Redis 연결을 어디서 열고 닫을지

## 참고자료

- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/)
- [PUBLISH](https://redis.io/docs/latest/commands/publish/)
- [SUBSCRIBE](https://redis.io/docs/latest/commands/subscribe/)
- [Redis client handling](https://redis.io/docs/latest/develop/reference/clients/)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [redis-py: Advanced features](https://redis.readthedocs.io/en/stable/advanced_features.html)
