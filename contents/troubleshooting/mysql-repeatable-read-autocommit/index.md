---
date: '2026-04-04'
title: 'MySQL SELECT가 변경을 못 읽는 이유: REPEATABLE READ와 autocommit의 함정'
category: 'Troubleshooting'
summary: 'MySQL에서 UPDATE 후에도 SELECT 결과가 바뀌지 않는 현상의 원인과 해결법을 정리합니다. REPEATABLE READ 격리 수준과 PyMySQL autocommit=False 기본값이 만드는 스냅샷 고정 문제를 다룹니다.'
thumbnail: './thumbnail.png'
tags: ['MySQL', 'REPEATABLE READ', 'PyMySQL', 'Transaction', 'Troubleshooting']
---

MySQL에서 분명히 데이터를 UPDATE하고 COMMIT까지 했는데, 다른 커넥션에서 SELECT하면 변경 전 값이 계속 나오는 경우가 있습니다. 캐시도 없고, 쿼리도 틀린 게 없는데 말입니다. 서버를 재시작하면 또 잘 보입니다.

이 현상의 원인은 MySQL의 **트랜잭션 격리 수준**과 PyMySQL의 **기본 설정**이 만드는 조합에 있습니다. 이 글에서는 왜 이런 일이 벌어지는지, 그리고 어떻게 해결하는지를 정리합니다.

## 어떤 상황에서 발생하는가

먼저 전제를 하나 못박아 둡니다. 이 현상은 **커넥션 하나를 서버 시작부터 종료까지 붙잡아두는 구조**에서 나타납니다. 모듈 전역에 커넥션을 하나 만들어 두고 계속 재사용하는 코드가 대표적입니다. SQLAlchemy 같은 커넥션 풀은 커넥션을 반납할 때 ROLLBACK을 날려 트랜잭션을 끊어주므로, 풀을 쓰고 있다면 이 증상이 잘 재현되지 않습니다.

전형적인 재현 흐름은 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 272" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="커넥션 하나에서 트랜잭션이 끝나지 않아 세 번의 SELECT가 모두 같은 옛 값을 돌려주는 흐름">
<style>
.ms-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.ms-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.ms-l { fill: var(--text, #1c1917); font-size: 14px; }
.ms-w { fill: var(--on-fill, #14100e); font-size: 14px; }
.ms-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ms-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.ms-bar { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ms-hit { fill: var(--primary, #0a756c); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.ms-tick { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.ms-up { stroke: var(--text-danger, #cb2121); stroke-width: 1.5; fill: none; stroke-dasharray: 4 3; marker-end: url(#msArrow); }
</style>
<defs>
<marker id="msArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-danger, #cb2121)"/>
</marker>
</defs>
<text class="ms-t" x="200" y="22" text-anchor="middle">끝나지 않는 트랜잭션</text>
<text class="ms-h" x="20" y="46">내 커넥션</text>
<text class="ms-n" x="80" y="68" text-anchor="middle">SELECT 1</text>
<text class="ms-n" x="200" y="68" text-anchor="middle">SELECT 2</text>
<text class="ms-n" x="330" y="68" text-anchor="middle">SELECT 3</text>
<path class="ms-tick" d="M80 74 L80 88"/>
<path class="ms-tick" d="M200 74 L200 88"/>
<path class="ms-tick" d="M330 74 L330 88"/>
<rect class="ms-bar" x="30" y="90" width="354" height="36" rx="5"/>
<text class="ms-l" x="207" y="113" text-anchor="middle">트랜잭션 하나, COMMIT 없음</text>
<text class="ms-d" x="80" y="148" text-anchor="middle">PENDING</text>
<text class="ms-d" x="200" y="148" text-anchor="middle">PENDING</text>
<text class="ms-d" x="330" y="148" text-anchor="middle">PENDING</text>
<text class="ms-h" x="20" y="186">다른 커넥션</text>
<rect class="ms-hit" x="100" y="196" width="130" height="30" rx="5"/>
<text class="ms-w" x="165" y="216" text-anchor="middle">UPDATE + COMMIT</text>
<path class="ms-up" d="M165 196 L165 130"/>
<text class="ms-n" x="200" y="254" text-anchor="middle">스냅샷은 SELECT 1에서 고정</text>
</svg>
</div>

관리자 페이지에서 주문 상태를 `PENDING`에서 `SHIPPING`으로 바꾸고 COMMIT까지 했는데, API 서버 쪽 SELECT는 몇 번을 다시 던져도 계속 `PENDING`을 돌려줍니다. 서버를 재시작해서 커넥션을 새로 만들어야 비로소 `SHIPPING`이 보입니다. SELECT 쿼리만 실행하고 있는데 왜 이럴까요?

## MySQL 트랜잭션 격리 수준

원인을 이해하려면 먼저 MySQL의 트랜잭션 격리 수준을 알아야 합니다. SQL 표준은 4가지 격리 수준을 정의하고 있고, MySQL InnoDB의 기본값은 **REPEATABLE READ**입니다.

아래 표의 이상 현상 표기는 **SQL 표준 기준**입니다.

| 격리 수준 | Dirty Read | Non-Repeatable Read | Phantom Read | MySQL의 스냅샷 갱신 시점 |
|-----------|:---:|:---:|:---:|-----------------|
| READ UNCOMMITTED | O | O | O | 즉시 (커밋 전 포함) |
| READ COMMITTED | X | O | O | 매 SELECT마다 |
| **REPEATABLE READ** (기본값) | X | X | O | **첫 SELECT 시점 고정** |
| SERIALIZABLE | X | X | X | 공유 잠금으로 직렬화 |

MySQL InnoDB의 실제 동작은 표준보다 강합니다. REPEATABLE READ에서 일반 SELECT는 MVCC 스냅샷을 읽으므로 Phantom Read가 보이지 않고, `SELECT ... FOR UPDATE` 같은 잠금 읽기나 DML은 Gap Lock으로 막습니다. 표의 Phantom Read 열이 O인데 본문이 "막힌다"고 하는 것은 이 차이 때문입니다.

핵심은 "스냅샷 갱신 시점" 열입니다. MySQL 공식 문서에 따르면, REPEATABLE READ의 스냅샷은 `BEGIN` 시점이 아니라 **트랜잭션 내 첫 번째 SELECT가 실행되는 순간** 생성됩니다. 이후 같은 트랜잭션 안에서는 동일한 SELECT를 몇 번 실행해도 항상 그 스냅샷 기준의 결과를 반환합니다. 보고서 생성이나 일관된 데이터 처리에 유용한 기능입니다.

트랜잭션을 여는 시점에 스냅샷을 잡고 싶다면 `START TRANSACTION WITH CONSISTENT SNAPSHOT`이라는 별도 구문이 있습니다.

:::note

**스냅샷은 일반 SELECT에만 적용됩니다**

같은 트랜잭션 안이라도 `SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE` 같은 잠금 읽기와 `UPDATE`, `DELETE`는 스냅샷이 아니라 **최신 커밋 버전**을 읽습니다. 그래서 "SELECT는 옛날 값을 주는데 UPDATE는 최신 행을 건드리는" 상황이 실제로 벌어질 수 있습니다.

:::

**그런데 문제는 이 "트랜잭션"이 언제 시작되고 끝나느냐입니다.**

## autocommit=False가 만드는 영원한 트랜잭션

PyMySQL의 `connect()` 함수는 `autocommit` 파라미터의 기본값이 **False**입니다.

```python
import pymysql

# autocommit 명시하지 않으면 False가 기본값
conn = pymysql.connect(
    host='db.example.com',
    user='api_user',
    password='...',
    database='myapp'
)
# conn.autocommit(False)와 동일한 상태
```

`autocommit=False`인 상태에서 첫 번째 SQL 문이 실행되면, MySQL은 **암묵적으로 트랜잭션을 시작**합니다. 그리고 이 트랜잭션은 명시적으로 `COMMIT` 또는 `ROLLBACK`을 호출하기 전까지 **절대 끝나지 않습니다**.

여기에 REPEATABLE READ가 결합되면, 첫 SELECT가 트랜잭션을 열면서 동시에 스냅샷을 고정시킵니다. 그 뒤로는 몇 번을 조회해도 같은 스냅샷을 읽습니다.

:::warning

**핵심 함정**

"쓰기를 안 하니까 트랜잭션은 신경 안 써도 되겠지"라는 가정이 함정입니다. SELECT도 트랜잭션 안에서 실행되며, `autocommit=False`일 때는 트랜잭션이 자동으로 시작되고 자동으로 끝나지 않습니다.

:::

## 해결: autocommit=True

가장 깔끔한 해결법은 읽기 전용 커넥션에 `autocommit=True`를 설정하는 것입니다.

```python
conn = pymysql.connect(
    host='db.example.com',
    user='api_user',
    password='...',
    database='myapp',
    autocommit=True  # 이 한 줄이 핵심
)
```

`autocommit=True`면 각 SQL 문이 **독립적인 트랜잭션**으로 실행됩니다. SELECT 하나가 곧 하나의 트랜잭션이고, 실행이 끝나면 자동으로 COMMIT됩니다. 매 SELECT마다 새로운 스냅샷을 읽으므로, 다른 커넥션에서 COMMIT한 변경이 즉시 반영됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 270" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="autocommit이 꺼져 있으면 세 SELECT가 한 트랜잭션에 묶이고 켜져 있으면 각각 별도 트랜잭션이 되는 대비">
<style>
.ac-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.ac-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.ac-l { fill: var(--text, #1c1917); font-size: 14px; }
.ac-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.ac-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.ac-s { fill: var(--text-success, #107836); font-size: 14px; }
.ac-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ac-br { stroke: var(--text-danger, #cb2121); stroke-width: 1.5; fill: none; }
.ac-bg { stroke: var(--text-success, #107836); stroke-width: 1.5; fill: none; }
.ac-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="ac-t" x="200" y="22" text-anchor="middle">트랜잭션 경계와 스냅샷</text>
<text class="ac-h" x="20" y="46">autocommit=False</text>
<rect class="ac-box" x="36" y="56" width="104" height="30" rx="5"/>
<text class="ac-l" x="88" y="76" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="148" y="56" width="104" height="30" rx="5"/>
<text class="ac-l" x="200" y="76" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="260" y="56" width="104" height="30" rx="5"/>
<text class="ac-l" x="312" y="76" text-anchor="middle">SELECT</text>
<path class="ac-br" d="M36 94 L36 104 L364 104 L364 94"/>
<text class="ac-d" x="200" y="128" text-anchor="middle">트랜잭션 1개, 스냅샷 1개</text>
<line class="ac-div" x1="20" y1="148" x2="380" y2="148"/>
<text class="ac-h" x="20" y="176">autocommit=True</text>
<rect class="ac-box" x="36" y="186" width="104" height="30" rx="5"/>
<text class="ac-l" x="88" y="206" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="148" y="186" width="104" height="30" rx="5"/>
<text class="ac-l" x="200" y="206" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="260" y="186" width="104" height="30" rx="5"/>
<text class="ac-l" x="312" y="206" text-anchor="middle">SELECT</text>
<path class="ac-bg" d="M36 224 L36 234 L140 234 L140 224"/>
<path class="ac-bg" d="M148 224 L148 234 L252 234 L252 224"/>
<path class="ac-bg" d="M260 224 L260 234 L364 234 L364 224"/>
<text class="ac-s" x="200" y="258" text-anchor="middle">조회마다 새 스냅샷</text>
</svg>
</div>

## 대안: autocommit=True 외의 방법

상황에 따라 `autocommit=True`를 적용하기 어려울 수도 있습니다. 같은 커넥션으로 읽기와 쓰기를 모두 한다면, 무조건 autocommit을 켜는 것이 답은 아닙니다.

### 방법 1: 읽기 전에 명시적 COMMIT

```python
conn.commit()  # 조회 전에 이전 트랜잭션을 끊어줍니다

with conn.cursor() as cursor:
    cursor.execute("SELECT * FROM orders WHERE order_id = %s", (order_id,))
    row = cursor.fetchone()
```

기존 트랜잭션을 COMMIT으로 명시적으로 종료하면, 다음 SELECT에서 새로운 트랜잭션(= 새 스냅샷)이 시작됩니다. 쓰기 작업이 섞여 있어서 autocommit을 쓸 수 없는 경우에 유용합니다.

### 방법 2: 세션 격리 수준 변경

격리 수준을 READ COMMITTED로 낮추면, `autocommit=False`여도 매 SELECT마다 새 스냅샷을 읽습니다. 다만 **실행 시점이 중요합니다.**

`SET SESSION`은 진행 중인 트랜잭션에는 영향을 주지 않습니다. 이미 첫 SELECT로 트랜잭션이 열려 스냅샷에 갇힌 커넥션에 이 문장을 던지면, 에러 하나 없이 조용히 통과하고는 여전히 낡은 값을 돌려줍니다. 고쳐진 줄 착각하기 딱 좋은 자리입니다.

```python
# 커넥션을 만든 직후, 첫 쿼리를 실행하기 전에 설정합니다
conn = pymysql.connect(...)

with conn.cursor() as cursor:
    cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
```

이미 트랜잭션이 열려 있는 커넥션이라면 먼저 끊어야 합니다.

```python
conn.rollback()  # 열려 있던 트랜잭션을 종료

with conn.cursor() as cursor:
    cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
```

이 경우 동일 트랜잭션 내에서 반복 읽기 일관성을 포기하는 것이므로, 트레이드오프를 이해하고 사용해야 합니다.

### 어떤 방법을 선택할까?

| 상황 | 추천 방법 |
|------|----------|
| 읽기만 하는 커넥션 | `autocommit=True` |
| 읽기/쓰기 혼합, 쓰기에 트랜잭션 필요 | 읽기 전 `conn.commit()` |
| 항상 최신 데이터를 읽어야 하는 특수한 경우 | 커넥션 생성 직후 `READ COMMITTED`로 변경 |

:::tip

**읽기와 쓰기를 나누세요**

읽기 전용 커넥션과 쓰기 커넥션을 분리하면 가장 깔끔합니다. 읽기 커넥션은 `autocommit=True`, 쓰기 커넥션은 `autocommit=False`로 설정하면 각각의 목적에 맞는 트랜잭션 동작을 보장할 수 있습니다.

:::

## ORM을 쓰면 괜찮을까?

"raw 커넥션이 아니라 ORM을 사용하면 이 문제를 피할 수 있지 않을까?"라는 생각이 들 수 있습니다. 결론부터 말하면, **ORM에 따라 다릅니다.**

### Django ORM: 기본적으로 안전

Django는 기본이 **autocommit 모드**입니다. 각 쿼리가 독립적으로 커밋되기 때문에 REPEATABLE READ 스냅샷 고정 문제가 발생하지 않습니다. `@transaction.atomic()` 블록 안에서만 트랜잭션이 열리고, 블록이 끝나면 자동으로 커밋됩니다.

### SQLAlchemy: 패턴에 따라 다름

SQLAlchemy 2.0은 **autobegin 패턴**을 사용합니다. 쿼리를 실행하면 자동으로 트랜잭션이 시작되고, 반드시 `session.commit()` 또는 `session.rollback()`으로 끝내야 합니다. `Session(autocommit=True)` 옵션은 2.0에서 제거되었습니다.

여기에 더해 SQLAlchemy의 커넥션 풀은 커넥션을 반납할 때 기본적으로 ROLLBACK을 날립니다. 그래서 웹 프레임워크에서 request 단위로 세션을 관리하면(FastAPI의 `Depends(get_db)`, Flask의 `@app.teardown_appcontext`) request마다 트랜잭션이 끊기므로 **대체로 안전**합니다. 하지만 배치 스크립트나 Celery worker처럼 세션을 오래 열어두는 경우에는 raw 커넥션과 동일한 문제가 발생할 수 있습니다.

:::info

**DBAPI 레벨 autocommit**

SQLAlchemy에서 읽기 전용 작업에 DBAPI 레벨 autocommit을 쓰고 싶다면 `create_engine(..., isolation_level="AUTOCOMMIT")` 또는 커넥션 단위로 `connection.execution_options(isolation_level="AUTOCOMMIT")`을 설정할 수 있습니다.

:::

## 다른 드라이버의 기본값은?

이 함정이 PyMySQL에만 있는 건 아닐까요? 주요 Python DB 드라이버의 `autocommit` 기본값을 정리해보겠습니다.

| 드라이버 | 기본 autocommit | DB 기본 격리 수준 | 이 문제 발생? |
|---------|:---:|-----------|:---:|
| **PyMySQL** | `False` | REPEATABLE READ | **O** |
| **mysqlclient** | `False` | REPEATABLE READ | **O** |
| **psycopg2** (PostgreSQL) | `False` | READ COMMITTED | X |

Python DB-API 2.0(PEP 249)은 auto-commit 기능이 있는 데이터베이스라면 **초기 상태는 꺼져 있어야 한다**고 규정합니다. 권장이 아니라 규정이며, 그래서 위 드라이버들은 모두 기본이 `False`입니다.

그런데 psycopg2는 같은 `autocommit=False`인데 왜 이 문제가 안 생길까요? PostgreSQL의 기본 격리 수준이 **READ COMMITTED**이기 때문입니다. READ COMMITTED는 매 SELECT마다 새 스냅샷을 읽으므로, 트랜잭션이 열려 있어도 다른 커넥션의 COMMIT이 보입니다. 결국 이 문제는 **MySQL의 기본 격리 수준(REPEATABLE READ)과 PEP 249의 기본값(autocommit=False)이라는 두 기본값이 만나야** 발생하는 함정입니다.

:::warning

**MySQL만의 문제가 아닙니다**

PostgreSQL에서도 격리 수준을 REPEATABLE READ로 올리면 동일한 문제가 발생합니다. "MySQL만의 문제"가 아니라 "REPEATABLE READ + autocommit=False 조합"의 문제입니다.

:::

## 읽기 전용 커넥션 체크리스트

Python에서 DB를 읽기 전용으로 연결할 때 확인할 항목들을 정리합니다.

:::summary

**읽기 전용 커넥션 점검 항목**

- `autocommit=True`가 명시적으로 설정되어 있는가?
- 커넥션 풀을 사용한다면, 반납 시 rollback이나 reset을 수행하는가?
- ORM을 쓰지 않고 raw 커넥션을 쓴다면, PEP 249 기본값(`autocommit=False`)을 인지하고 있는가?
- 읽기와 쓰기 커넥션이 분리되어 있는가?
- 장시간 유지되는 커넥션(서버 시작 시 생성, 종료까지 유지)이 있다면, 해당 커넥션의 트랜잭션 수명을 확인했는가?

:::

## 마치며

이 문제가 까다로운 이유는 "SELECT만 하는데 트랜잭션이 왜 중요하지?"라는 선입견 때문입니다. 쓰기를 하지 않으니 트랜잭션을 신경 쓸 필요가 없다고 생각하기 쉽습니다.

핵심은 하나입니다. **MySQL에서 모든 SQL 문은 트랜잭션 안에서 실행됩니다.** `autocommit=False`면 첫 번째 SELECT가 트랜잭션을 열고, 명시적 COMMIT 없이는 그 트랜잭션이 영원히 유지됩니다. REPEATABLE READ 격리 수준에서 이는 곧 첫 번째 SELECT 시점의 데이터에 갇히는 것을 의미합니다.

## 함께 보면 좋은 글

- [PostgreSQL 격리 수준과 잠금](/postgres/isolation-and-locks/) : 같은 격리 수준을 PostgreSQL은 어떻게 구현하는지
- [MVCC와 가시성 판정](/postgres/mvcc-visibility/) : 스냅샷이 "어떤 행을 보여줄지" 결정하는 원리

## 참고자료

- [MySQL 공식 문서: Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html)
- [MySQL 공식 문서: Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html)
- [MySQL 공식 문서: SET TRANSACTION](https://dev.mysql.com/doc/refman/8.0/en/set-transaction.html)
- [PyMySQL 공식 문서: Connection](https://pymysql.readthedocs.io/en/latest/modules/connections.html)
- [PEP 249: Python Database API Specification v2.0](https://peps.python.org/pep-0249/)
