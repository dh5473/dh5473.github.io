---
date: '2026-04-04'
title: 'REPEATABLE READ와 autocommit 때문에 MySQL SELECT가 옛 값을 돌려주는 이유'
category: 'Troubleshooting'
summary: 'REPEATABLE READ 스냅샷은 트랜잭션 시작이 아니라 첫 SELECT 시점에 고정됩니다. autocommit=False와 만나면 커넥션이 옛 데이터에 갇히는 이유와 해결법을 MySQL 8.4에서 확인합니다.'
thumbnail: './thumbnail.png'
tags: ['MySQL', 'REPEATABLE READ', 'PyMySQL', 'Transaction', 'Troubleshooting']
---

MySQL에서 분명히 데이터를 UPDATE하고 COMMIT까지 했는데, 다른 커넥션에서 SELECT하면 변경 전 값이 계속 나오는 경우가 있습니다. 캐시도 없고, 쿼리도 틀린 게 없는데 말입니다. 서버를 재시작하면 또 잘 보입니다.

원인은 MySQL의 트랜잭션 격리 수준과 PyMySQL의 기본 설정이 만드는 조합에 있습니다. 이 글의 모든 동작은 **MySQL 8.4.11**에서 두 세션을 직접 띄워 확인한 것입니다.

## 어떤 상황에서 발생하는가

먼저 전제를 하나 못박아 둡니다. 이 현상은 **커넥션 하나를 서버 시작부터 종료까지 붙잡아두는 구조**에서 나타납니다. 모듈 전역에 커넥션을 하나 만들어 두고 계속 재사용하는 코드가 대표적입니다. SQLAlchemy 같은 커넥션 풀은 커넥션을 반납할 때 ROLLBACK을 날려 트랜잭션을 끊어주므로, 풀을 쓰고 있다면 이 증상이 잘 재현되지 않습니다.

관리자 페이지에서 주문 상태를 `PENDING`에서 `SHIPPING`으로 바꾸고 COMMIT까지 했는데, API 서버 쪽 SELECT는 몇 번을 다시 던져도 계속 `PENDING`을 돌려줍니다. 서버를 재시작해서 커넥션을 새로 만들어야 비로소 `SHIPPING`이 보입니다.

두 세션으로 그대로 재현됩니다.

```sql
-- 세션 A: autocommit을 끄고 조회
SET autocommit = 0;
SELECT status FROM orders WHERE order_id = 1;   -- PENDING

-- 세션 B: 다른 커넥션에서 변경하고 커밋
UPDATE orders SET status = 'SHIPPING' WHERE order_id = 1;
COMMIT;

-- 세션 A: 같은 쿼리를 다시 던져도
SELECT status FROM orders WHERE order_id = 1;   -- PENDING
SELECT status FROM orders WHERE order_id = 1;   -- PENDING

-- 세션 A: 자기 트랜잭션을 끊은 뒤에야
COMMIT;
SELECT status FROM orders WHERE order_id = 1;   -- SHIPPING
```

세션 A는 SELECT만 던졌습니다. 그런데도 세션 A를 가둔 것은 세션 A 자신의 트랜잭션입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 412" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="세션 A의 첫 SELECT에서 스냅샷이 고정되고 다른 커넥션이 COMMIT해도 옛 값이 유지되다가 세션 A가 COMMIT한 뒤에야 최신 값이 보이는 시간 순서">
<style>
.sp-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.sp-l { fill: var(--text, #1c1917); font-size: 15px; }
.sp-v { font-size: 15px; font-weight: 700; }
.sp-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.sp-old { fill: var(--text-danger, #cb2121); }
.sp-new { fill: var(--text-success, #107836); }
.sp-acc { fill: var(--accent, #9d5604); }
.sp-boxa { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sp-boxb { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sp-dota { fill: var(--primary, #0a756c); }
.sp-dotb { fill: var(--accent, #9d5604); }
.sp-ring { fill: none; stroke: var(--primary, #0a756c); stroke-width: 2; }
.sp-spine { stroke: var(--border, #e7e5e4); stroke-width: 2; }
</style>
<text class="sp-t" x="200" y="24" text-anchor="middle">스냅샷이 고정되는 시점</text>
<circle class="sp-dota" cx="96" cy="46" r="5"/>
<text class="sp-n" x="108" y="51">내 커넥션</text>
<circle class="sp-dotb" cx="208" cy="46" r="5"/>
<text class="sp-n" x="220" y="51">다른 커넥션</text>
<line class="sp-spine" x1="44" y1="70" x2="44" y2="392"/>
<!-- row 1 -->
<rect class="sp-boxa" x="62" y="70" width="322" height="34" rx="5"/>
<circle class="sp-dota" cx="44" cy="87" r="5"/>
<text class="sp-l" x="76" y="92">SET autocommit = 0</text>
<!-- row 2 -->
<rect class="sp-boxa" x="62" y="112" width="322" height="34" rx="5"/>
<circle class="sp-dota" cx="44" cy="129" r="5"/>
<text class="sp-l" x="76" y="134">START TRANSACTION</text>
<text class="sp-n" x="370" y="134" text-anchor="end">스냅샷 없음</text>
<!-- row 3: snapshot pinned here -->
<rect class="sp-boxa" x="62" y="154" width="322" height="52" rx="5"/>
<circle class="sp-ring" cx="44" cy="180" r="10"/>
<circle class="sp-dota" cx="44" cy="180" r="6"/>
<text class="sp-l" x="76" y="176">SELECT</text>
<text class="sp-v sp-old" x="370" y="176" text-anchor="end">× PENDING</text>
<text class="sp-n" x="76" y="196">여기서 스냅샷 고정</text>
<!-- row 4: other connection writes -->
<rect class="sp-boxb" x="62" y="214" width="322" height="34" rx="5"/>
<circle class="sp-dotb" cx="44" cy="231" r="5"/>
<text class="sp-l" x="76" y="236">UPDATE + COMMIT</text>
<text class="sp-v sp-acc" x="370" y="236" text-anchor="end">SHIPPING</text>
<!-- row 5 -->
<rect class="sp-boxa" x="62" y="256" width="322" height="34" rx="5"/>
<circle class="sp-dota" cx="44" cy="273" r="5"/>
<text class="sp-l" x="76" y="278">SELECT</text>
<text class="sp-v sp-old" x="370" y="278" text-anchor="end">× PENDING</text>
<!-- row 6: snapshot released -->
<rect class="sp-boxa" x="62" y="298" width="322" height="52" rx="5"/>
<circle class="sp-dota" cx="44" cy="324" r="5"/>
<text class="sp-l" x="76" y="320">COMMIT</text>
<text class="sp-n" x="76" y="340">스냅샷 해제</text>
<!-- row 7 -->
<rect class="sp-boxa" x="62" y="358" width="322" height="34" rx="5"/>
<circle class="sp-dota" cx="44" cy="375" r="5"/>
<text class="sp-l" x="76" y="380">SELECT</text>
<text class="sp-v sp-new" x="370" y="380" text-anchor="end">✓ SHIPPING</text>
</svg>
</div>

## MySQL의 트랜잭션 격리 수준

SQL 표준은 4가지 격리 수준을 정의하고 있고, MySQL InnoDB의 기본값은 REPEATABLE READ입니다. `SELECT @@transaction_isolation`을 던지면 `REPEATABLE-READ`가 나옵니다.

| 격리 수준 | 표준이 허용하는 이상 현상 | InnoDB의 스냅샷 갱신 시점 |
|-----------|--------------------------|--------------------------|
| READ UNCOMMITTED | Dirty, Non-Repeatable, Phantom | 커밋 전 데이터까지 즉시 |
| READ COMMITTED | Non-Repeatable, Phantom | 매 SELECT마다 새로 |
| REPEATABLE READ (기본값) | Phantom | 첫 SELECT 시점에 고정 |
| SERIALIZABLE | 없음 | 잠금 읽기로 직렬화 |

두 번째 열은 SQL 표준 기준입니다. InnoDB의 실제 동작은 표준보다 강해서, REPEATABLE READ에서 일반 SELECT는 MVCC 스냅샷을 읽으므로 Phantom Read가 보이지 않습니다. `SELECT ... FOR UPDATE` 같은 잠금 읽기나 DML은 갭 잠금으로 막습니다.

이 글에서 중요한 것은 세 번째 열입니다.

## 스냅샷은 언제 고정되는가

여기가 제일 틀리기 쉬운 대목입니다. REPEATABLE READ의 스냅샷은 `START TRANSACTION` 시점이 아니라 **트랜잭션 안에서 첫 번째 일관된 읽기가 실행되는 순간** 만들어집니다. MySQL 레퍼런스도 "all consistent reads within the same transaction read the snapshot established by the first such read in that transaction"이라고 적고 있습니다.

차이는 실측으로 갈립니다. 트랜잭션만 열어두고 아직 아무것도 읽지 않았다면, 그 사이에 들어온 커밋은 그대로 보입니다.

```sql
-- 세션 A
SET autocommit = 0;
START TRANSACTION;      -- 트랜잭션은 열렸지만 스냅샷은 아직 없음

-- 세션 B: UPDATE ... 'SHIPPING' 후 COMMIT

-- 세션 A: 이 트랜잭션의 첫 읽기
SELECT status FROM orders WHERE order_id = 1;   -- SHIPPING
```

트랜잭션을 여는 시점에 스냅샷을 잡고 싶다면 별도 구문이 있습니다. 같은 시나리오에서 결과가 뒤집힙니다.

```sql
-- 세션 A
START TRANSACTION WITH CONSISTENT SNAPSHOT;   -- 이 순간 스냅샷 고정

-- 세션 B: UPDATE ... 'SHIPPING' 후 COMMIT

-- 세션 A
SELECT status FROM orders WHERE order_id = 1;   -- PENDING
```

:::note

**스냅샷을 우회하는 읽기가 있습니다**

같은 트랜잭션 안이라도 `SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE` 같은 잠금 읽기와 `UPDATE`, `DELETE`는 스냅샷이 아니라 최신 커밋 버전을 읽습니다. 한 트랜잭션 안에서 두 결과가 공존합니다.

```sql
SELECT status FROM orders WHERE order_id = 1;              -- PENDING
SELECT status FROM orders WHERE order_id = 1 FOR SHARE;    -- SHIPPING
SELECT status FROM orders WHERE order_id = 1 FOR UPDATE;   -- SHIPPING
SELECT status FROM orders WHERE order_id = 1;              -- PENDING
```

잠금 읽기가 최신 값을 봤다고 해서 스냅샷이 갱신되지는 않습니다. 마지막 줄이 다시 `PENDING`으로 돌아갑니다.

:::

## autocommit=False가 만드는 끝나지 않는 트랜잭션

PyMySQL의 `connect()`는 `autocommit` 파라미터의 기본값이 `False`입니다. 소스의 시그니처가 `autocommit=False`이고, 독스트링도 "Autocommit mode. None means use server default. (default: False)"라고 적고 있습니다. 서버 쪽 `@@autocommit`은 기본이 `1`이므로, 이 값을 끄는 주체는 서버가 아니라 드라이버입니다.

```python
import pymysql

conn = pymysql.connect(
    host='db.example.com',
    user='api_user',
    password='...',
    database='myapp',
)
# autocommit을 명시하지 않았으므로 conn.autocommit(False)와 같은 상태
```

`autocommit=False`인 상태에서 첫 번째 SQL 문이 실행되면 MySQL은 암묵적으로 트랜잭션을 시작하고, 이 트랜잭션은 `COMMIT` 또는 `ROLLBACK`을 호출하기 전까지 끝나지 않습니다. 여기에 REPEATABLE READ가 결합되면 첫 SELECT가 트랜잭션을 열면서 동시에 스냅샷을 고정시킵니다.

의심스러우면 서버 쪽에서 바로 확인할 수 있습니다. 평범한 SELECT 한 번을 던진 뒤 다른 커넥션에서 조회하면 트랜잭션이 잡혀 있습니다.

```sql
SELECT trx_state, trx_isolation_level FROM information_schema.innodb_trx;
```

```text
RUNNING    REPEATABLE READ
```

이 행은 해당 커넥션이 `COMMIT`이나 `ROLLBACK`을 부를 때까지 사라지지 않습니다.

:::warning

**핵심 함정**

"쓰기를 안 하니까 트랜잭션은 신경 안 써도 되겠지"라는 가정이 함정입니다. SELECT도 트랜잭션 안에서 실행되며, `autocommit=False`일 때는 트랜잭션이 자동으로 시작되고 자동으로 끝나지 않습니다.

:::

## autocommit=True로 해결하기

가장 깔끔한 해결법은 읽기 전용 커넥션에 `autocommit=True`를 설정하는 것입니다.

```python
conn = pymysql.connect(
    host='db.example.com',
    user='api_user',
    password='...',
    database='myapp',
    autocommit=True,
)
```

이러면 각 SQL 문이 독립적인 트랜잭션으로 실행됩니다. SELECT 하나가 곧 하나의 트랜잭션이고, 실행이 끝나면 자동으로 커밋됩니다. 매 SELECT마다 새 스냅샷을 읽으므로 다른 커넥션의 COMMIT이 즉시 반영됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 272" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="autocommit이 꺼져 있으면 세 번의 SELECT가 한 트랜잭션에 묶이고 켜져 있으면 각각 별도 트랜잭션이 되는 대비">
<style>
.ac-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.ac-h { fill: var(--text, #1c1917); font-size: 15px; font-weight: 700; }
.ac-l { fill: var(--text, #1c1917); font-size: 15px; }
.ac-d { fill: var(--text-danger, #cb2121); font-size: 14px; }
.ac-s { fill: var(--text-success, #107836); font-size: 14px; }
.ac-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.ac-br { stroke: var(--text-danger, #cb2121); stroke-width: 1.5; fill: none; }
.ac-bg { stroke: var(--text-success, #107836); stroke-width: 1.5; fill: none; }
.ac-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text class="ac-t" x="200" y="24" text-anchor="middle">트랜잭션 경계와 스냅샷</text>
<text class="ac-h" x="20" y="50">autocommit=False</text>
<rect class="ac-box" x="36" y="60" width="104" height="30" rx="5"/>
<text class="ac-l" x="88" y="80" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="148" y="60" width="104" height="30" rx="5"/>
<text class="ac-l" x="200" y="80" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="260" y="60" width="104" height="30" rx="5"/>
<text class="ac-l" x="312" y="80" text-anchor="middle">SELECT</text>
<path class="ac-br" d="M36 98 L36 108 L364 108 L364 98"/>
<text class="ac-d" x="200" y="132" text-anchor="middle">× 트랜잭션 1개, 스냅샷 1개</text>
<line class="ac-div" x1="20" y1="152" x2="380" y2="152"/>
<text class="ac-h" x="20" y="180">autocommit=True</text>
<rect class="ac-box" x="36" y="190" width="104" height="30" rx="5"/>
<text class="ac-l" x="88" y="210" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="148" y="190" width="104" height="30" rx="5"/>
<text class="ac-l" x="200" y="210" text-anchor="middle">SELECT</text>
<rect class="ac-box" x="260" y="190" width="104" height="30" rx="5"/>
<text class="ac-l" x="312" y="210" text-anchor="middle">SELECT</text>
<path class="ac-bg" d="M36 228 L36 238 L140 238 L140 228"/>
<path class="ac-bg" d="M148 228 L148 238 L252 238 L252 228"/>
<path class="ac-bg" d="M260 228 L260 238 L364 238 L364 228"/>
<text class="ac-s" x="200" y="262" text-anchor="middle">✓ 조회마다 새 스냅샷</text>
</svg>
</div>

## autocommit을 켤 수 없을 때

같은 커넥션으로 읽기와 쓰기를 모두 한다면 무조건 autocommit을 켜는 것이 답은 아닙니다. 쓰기 쪽에서 여러 문장을 하나의 단위로 묶어야 한다면 autocommit은 그 묶음을 깨뜨립니다.

### 조회 전에 명시적으로 COMMIT하기

```python
conn.commit()

with conn.cursor() as cursor:
    cursor.execute("SELECT * FROM orders WHERE order_id = %s", (order_id,))
    row = cursor.fetchone()
```

기존 트랜잭션을 끝내면 다음 SELECT가 새 트랜잭션을 열고 새 스냅샷을 잡습니다. `ROLLBACK`도 같은 효과를 냅니다. 쓰기 작업이 섞여 있어서 autocommit을 쓸 수 없는 경우에 적합합니다.

### 세션 격리 수준을 READ COMMITTED로 낮추기

격리 수준을 READ COMMITTED로 낮추면 `autocommit=False`여도 매 SELECT마다 새 스냅샷을 읽습니다. 다만 실행 시점이 중요합니다.

```python
conn = pymysql.connect(...)

with conn.cursor() as cursor:
    cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
```

이미 트랜잭션이 열려 있는 커넥션이라면 `conn.rollback()`이나 `conn.commit()`으로 먼저 끊어야 합니다. 이 방법은 동일 트랜잭션 안의 반복 읽기 일관성을 포기하는 것이므로, 보고서처럼 여러 쿼리가 같은 시점을 봐야 하는 작업에는 쓰면 안 됩니다.

:::warning

**SET SESSION은 진행 중인 트랜잭션을 바꾸지 않습니다**

이미 스냅샷에 갇힌 커넥션에 이 문장을 던지면 에러 없이 통과하고, `@@transaction_isolation`은 즉시 `READ-COMMITTED`를 돌려줍니다. 그런데도 같은 트랜잭션의 SELECT는 여전히 옛 값을 냅니다. 고쳐진 줄 착각하기 딱 좋은 자리입니다.

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- 통과
SELECT @@transaction_isolation;                           -- READ-COMMITTED
SELECT status FROM orders WHERE order_id = 1;             -- PENDING
```

`SESSION`을 빼면 그때는 막힙니다. `SET TRANSACTION ISOLATION LEVEL READ COMMITTED`는 `ERROR 1568 (25001): Transaction characteristics can't be changed while a transaction is in progress`로 거절됩니다.

:::

### 상황별 선택

| 상황 | 방법 |
|------|------|
| 읽기만 하는 커넥션 | `autocommit=True` |
| 읽기와 쓰기 혼합 | 조회 전 `conn.commit()` |
| 항상 최신 값이 필요한 경우 | 커넥션 생성 직후 `READ COMMITTED` |

읽기 전용 커넥션과 쓰기 커넥션을 아예 분리하면 이 표를 고민할 일이 없어집니다. 읽기 쪽은 `autocommit=True`, 쓰기 쪽은 `autocommit=False`로 두면 각자의 목적에 맞는 트랜잭션 경계를 갖습니다.

## ORM을 쓰면 괜찮은가

raw 커넥션 대신 ORM을 쓰면 피할 수 있을지는 어느 ORM이냐에 따라 갈립니다.

Django는 기본이 autocommit 모드입니다. 공식 문서가 "Django's default behavior is to run in autocommit mode. Each query is immediately committed to the database, unless a transaction is active"라고 못박고 있어서, 스냅샷 고정 문제가 생기지 않습니다. 트랜잭션은 `transaction.atomic()` 블록 안에서만 열립니다.

SQLAlchemy 2.0은 autobegin 방식입니다. 쿼리를 실행하면 자동으로 트랜잭션이 시작되고, `session.commit()` 또는 `session.rollback()`으로 끝내야 합니다. 레거시였던 `Session(autocommit=True)` 옵션은 2.0에서 제거되었습니다. 대신 커넥션 풀이 커넥션을 반납할 때 ROLLBACK을 날리므로, 웹 프레임워크에서 request 단위로 세션을 관리하면(FastAPI의 `Depends(get_db)`, Flask의 `@app.teardown_appcontext`) request마다 트랜잭션이 끊겨 대체로 안전합니다. 위험한 쪽은 배치 스크립트나 Celery worker처럼 세션을 오래 열어두는 코드입니다. 읽기 전용 작업이라면 `create_engine(..., isolation_level="AUTOCOMMIT")`이나 `connection.execution_options(isolation_level="AUTOCOMMIT")`으로 DBAPI 레벨 autocommit을 쓸 수 있습니다.

## 다른 드라이버의 기본값

이 함정이 PyMySQL만의 것은 아닙니다.

| 드라이버 | 기본 autocommit | DB 기본 격리 수준 | 증상 |
|---------|:---:|-----------|:---:|
| PyMySQL | `False` | REPEATABLE READ | 발생 |
| mysqlclient | `False` | REPEATABLE READ | 발생 |
| psycopg2 | `False` | READ COMMITTED | 없음 |

세 드라이버가 모두 `False`인 데는 이유가 있습니다. PEP 249는 `.commit()` 항목에서 "if the database supports an auto-commit feature, this must be initially off"라고 규정합니다. 권장이 아니라 요구사항입니다.

그렇다면 psycopg2는 왜 같은 `autocommit=False`인데 증상이 없을까요. PostgreSQL의 기본 격리 수준이 READ COMMITTED이기 때문입니다. READ COMMITTED는 매 SELECT마다 새 스냅샷을 읽으므로, 트랜잭션이 열려 있어도 다른 커넥션의 COMMIT이 보입니다. 결국 이 문제는 MySQL의 기본 격리 수준과 PEP 249의 기본값이라는 **두 기본값이 만나야** 발생합니다.

표의 "없음"은 기본값을 그대로 뒀을 때의 이야기입니다. PostgreSQL에서도 격리 수준을 REPEATABLE READ로 올리면 같은 일이 벌어집니다. psycopg2 문서가 다는 경고도 같은 취지입니다. 단순한 SELECT 하나도 트랜잭션을 시작하므로, 오래 도는 프로그램에서 아무 조치를 안 하면 세션이 "idle in transaction" 상태로 남아 잠금을 쥐고 테이블을 부풀린다는 것입니다.

## 마치며

이 문제가 까다로운 이유는 증상과 원인이 서로 다른 커넥션에 있기 때문입니다. 값이 안 바뀌는 쪽은 읽는 커넥션인데, 사람은 쓰는 쪽을 먼저 의심합니다. 쓰기 세션에서 아무리 COMMIT을 확인해도 답이 안 나옵니다.

점검 순서는 단순합니다. 증상이 나오는 커넥션이 오래 살아 있는지, 그 커넥션의 드라이버 `autocommit`이 무엇인지, `information_schema.innodb_trx`에 그 커넥션의 트랜잭션이 잡혀 있는지를 보면 됩니다. 세 가지가 모두 걸리면 원인은 확정입니다.

기억할 것은 하나입니다. MySQL에서 SELECT도 트랜잭션을 엽니다. `autocommit=False`면 첫 SELECT가 트랜잭션을 열면서 스냅샷을 고정하고, 명시적으로 끊기 전까지 그 커넥션은 그 시점의 데이터베이스를 계속 보게 됩니다.

## 함께 보면 좋은 글

- [트랜잭션 격리 수준과 락](/postgres/isolation-and-locks/) : 같은 격리 수준을 PostgreSQL은 어떻게 구현하는지
- [PostgreSQL MVCC와 튜플 가시성](/postgres/mvcc-visibility/) : 스냅샷이 어떤 행을 보여줄지 결정하는 원리
- [VACUUM과 bloat의 정체](/postgres/vacuum-and-bloat/) : 끝나지 않는 트랜잭션이 정리 작업을 어떻게 막는지

## 참고자료

- [MySQL 8.4 Reference: Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)
- [MySQL 8.4 Reference: Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)
- [MySQL 8.4 Reference: SET TRANSACTION](https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html)
- [PyMySQL Documentation: Connection](https://pymysql.readthedocs.io/en/latest/modules/connections.html)
- [PEP 249: Python Database API Specification v2.0](https://peps.python.org/pep-0249/)
- [Django Documentation: Database transactions](https://docs.djangoproject.com/en/5.2/topics/db/transactions/)
