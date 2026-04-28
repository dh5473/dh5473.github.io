---
date: '2026-04-28'
title: '트랜잭션 격리 수준과 락: 쓰기 충돌은 어떻게 해결되는가'
category: 'Database'
series: 'postgres'
seriesOrder: 10
tags: ['PostgreSQL', 'Lock', 'Isolation', 'SSI', 'Deadlock']
summary: '두 트랜잭션이 같은 row를 동시에 UPDATE하면 어떤 일이 일어나는지, row-level lock이 튜플 헤더에 어떻게 기록되는지, 테이블 레벨 락 8단계, SSI가 write skew를 잡는 원리, 그리고 pg_locks로 블로킹을 진단하는 법까지 따라갑니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/postgres/vacuum-and-bloat/)까지 dead tuple이 어떻게 쌓이고 VACUUM이 어떻게 치우는지를 다뤘습니다. 하지만 VACUUM이 개입할 수 없는 영역이 있습니다. 두 트랜잭션이 동시에 같은 row를 수정하려는 순간입니다.

[MVCC 글](/postgres/mvcc-visibility/)에서 snapshot이 "읽기 충돌"을 해결하는 방식을 봤습니다. 같은 row를 두 트랜잭션이 동시에 읽어도, 각자의 snapshot이 서로 다른 버전을 보여주면 되니까 락 없이도 동작합니다. 하지만 **쓰기는 다릅니다.** 두 트랜잭션이 같은 row를 동시에 UPDATE하면 "둘 다 성공" 이 될 수 없습니다. 최소한 하나는 기다려야 합니다.

터미널 두 개를 열고 확인해봅시다.

```sql
CREATE TABLE accounts (id int PRIMARY KEY, balance int);
INSERT INTO accounts VALUES (1, 1000), (2, 1000);
```

```sql
-- Session A
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- (아직 COMMIT 안 함)
```

```sql
-- Session B (별도 터미널)
UPDATE accounts SET balance = balance + 500 WHERE id = 1;
-- 이 문장은 실행되지 않고 대기합니다
```

Session B는 멈춰 있습니다. Session A가 COMMIT하거나 ROLLBACK해야 풀립니다. 이 대기의 원인이 **row-level lock**이고, 이 글의 출발점입니다.

이 글에서는 PostgreSQL이 쓰기 충돌을 제어하는 락의 체계를 따라갑니다. row-level lock이 어디에 기록되는지, 테이블 레벨 락에서 실무적으로 중요한 것은 무엇인지, 격리 수준에 따라 충돌 후 동작이 어떻게 달라지는지, 그리고 Serializable이 SSI로 write skew를 잡아내는 방식까지 순서대로 봅니다.

## row-level lock

PostgreSQL의 row-level lock은 일반적인 RDBMS와 구현 방식이 다릅니다. **별도의 lock table에 행마다 엔트리를 만들지 않습니다.** 대신 [힙 페이지 글에서 본 튜플 헤더](/postgres/heap-page-tuple/)의 `t_xmax`와 `t_infomask` 비트를 이용합니다. UPDATE나 DELETE가 튜플의 xmax에 자기 xid를 기록하는 것 자체가 "이 행에 락을 잡았다"는 표시가 됩니다. 다른 트랜잭션이 같은 행을 수정하려 할 때 xmax를 확인하고, 아직 활성 중인 트랜잭션이 잡고 있으면 대기합니다.

이 방식의 장점은 **행 수에 비례하는 별도 메모리가 필요 없다**는 점입니다. 100만 행을 한 번에 UPDATE해도 lock table이 터지지 않습니다. 락 상태를 확인하려면 힙 페이지를 읽어야 하지만, UPDATE/DELETE 자체가 이미 힙 페이지를 읽는 작업이라 추가 비용은 거의 없습니다.

### 네 가지 row-level lock 모드

`SELECT ... FOR` 절로 명시적으로 row-level lock을 잡을 수 있고, 네 가지 강도가 있습니다.

| 모드 | 잡히는 시점 | 용도 |
|------|------------|------|
| `FOR KEY SHARE` | 외래 키 검사 시 자동 | 참조되는 행이 삭제/PK 변경되지 않게 보호 |
| `FOR SHARE` | 명시적 `SELECT ... FOR SHARE` | 행의 값이 바뀌지 않게 보호, 여러 트랜잭션이 동시에 잡을 수 있음 |
| `FOR NO KEY UPDATE` | FK에서 사용되는 unique index 컬럼을 변경하지 않는 UPDATE 시 자동 | 대부분의 일반 UPDATE가 여기 해당 |
| `FOR UPDATE` | FK에서 사용되는 unique index 컬럼을 변경하는 UPDATE, DELETE, 명시적 `SELECT ... FOR UPDATE` | 가장 강한 배타 락, 다른 모든 쓰기 락과 충돌 |

호환성 표는 이렇습니다.

|  | FOR KEY SHARE | FOR SHARE | FOR NO KEY UPDATE | FOR UPDATE |
|--|:--:|:--:|:--:|:--:|
| **FOR KEY SHARE** | O | O | O | X |
| **FOR SHARE** | O | O | X | X |
| **FOR NO KEY UPDATE** | O | X | X | X |
| **FOR UPDATE** | X | X | X | X |

핵심은 두 가지입니다. `FOR UPDATE`는 모든 다른 쓰기 락과 충돌하고, `FOR KEY SHARE`는 `FOR UPDATE`만 제외하면 대부분과 공존합니다. 외래 키가 있는 테이블에서 자식 행을 INSERT할 때 부모 행에 `FOR KEY SHARE`가 자동으로 잡히는데, 이게 `FOR NO KEY UPDATE`와 호환되기 때문에 부모의 일반 UPDATE와 자식의 INSERT가 동시에 진행될 수 있습니다. PG 9.3에서 이 네 단계를 도입한 이유가 바로 이 외래 키 시나리오에서의 불필요한 대기를 줄이기 위해서였습니다.

실무에서 가장 자주 쓰는 패턴은 `SELECT ... FOR UPDATE`입니다.

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
-- 여기서 balance를 확인하고 비즈니스 로직 수행
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

`FOR UPDATE`로 먼저 잡아두면 다른 트랜잭션은 이 행을 수정하려 할 때 대기하게 되므로, "읽은 값을 기반으로 계산해서 쓰는" 패턴에서 lost update를 방지합니다.

### multixact

row-level lock을 여러 트랜잭션이 동시에 잡을 수 있습니다. 예를 들어 세 트랜잭션이 같은 행에 `FOR SHARE`를 걸 수 있습니다. 이때 `t_xmax`에는 하나의 xid만 들어갈 수 있으므로, PostgreSQL은 **MultiXactId**라는 별도의 ID를 사용합니다. 여러 xid를 묶어서 하나의 MultiXactId로 표현하고, `t_infomask`에 `HEAP_XMAX_IS_MULTI` 비트를 세워 "이 xmax는 multixact다"라고 표시합니다. multixact의 멤버 목록은 `pg_multixact/` 디렉터리에 별도로 저장됩니다.

## 테이블 레벨 락

row-level lock과 별개로, 모든 SQL 문은 실행 시 테이블 레벨에서도 lock을 잡습니다. "어떤 트랜잭션이 이 테이블에 어떤 종류의 작업을 하고 있는가"를 서로 알려서, 동시에 호환되지 않는 작업이 겹치지 않게 하는 장치입니다.

PostgreSQL은 8단계의 테이블 레벨 lock mode를 정의합니다. 전부 외울 필요는 없고, 실무에서 마주치는 핵심 4개를 먼저 봅니다.

| Lock Mode | 잡히는 시점 | 핵심 |
|-----------|------------|------|
| `AccessShareLock` | `SELECT` | 가장 약함. 읽기만 해도 잡힘. `AccessExclusiveLock`하고만 충돌 |
| `RowExclusiveLock` | `INSERT`, `UPDATE`, `DELETE` | DML이면 잡힘. DDL과 충돌하지만 다른 DML과는 공존 |
| `ShareLock` | `CREATE INDEX` (non-concurrent) | 쓰기를 막지만 읽기는 허용 |
| `AccessExclusiveLock` | `ALTER TABLE`, `DROP TABLE`, `VACUUM FULL`, `LOCK TABLE` | **모든 것과 충돌**. `SELECT`조차 대기 |

나머지 4단계(`RowShareLock`, `ShareUpdateExclusiveLock`, `ShareRowExclusiveLock`, `ExclusiveLock`)는 `SELECT ... FOR UPDATE`, `VACUUM`, `CREATE INDEX CONCURRENTLY` 등에서 쓰이며, 위 4개의 사이를 세분화한 것입니다.

### "ALTER TABLE은 왜 서비스를 멈추는가"

`ALTER TABLE`이 `AccessExclusiveLock`을 잡는다는 사실에서 바로 따라나옵니다. 이 락은 `SELECT`의 `AccessShareLock`과도 충돌하므로, ALTER가 실행되는 동안 해당 테이블에 대한 모든 쿼리가 대기합니다.

더 위험한 상황은 **ALTER 자체가 대기하는 경우**입니다. 긴 트랜잭션이 `SELECT`로 `AccessShareLock`을 잡고 있으면 ALTER는 그 트랜잭션이 끝날 때까지 기다립니다. 그런데 ALTER가 대기하는 동안 **그 뒤에 들어오는 새 SELECT도 줄줄이 대기**합니다. PostgreSQL의 lock queue는 FIFO이고, 대기 중인 `AccessExclusiveLock` 뒤에 서는 `AccessShareLock`은 앞의 exclusive 요청이 해소될 때까지 진행할 수 없기 때문입니다. 한 건의 ALTER가 전체 서비스를 멈추는 사고가 이 패턴으로 발생합니다.

실무에서는 ALTER 실행 전에 `lock_timeout`을 짧게 설정합니다.

```sql
SET lock_timeout = '3s';
ALTER TABLE users ADD COLUMN last_login timestamptz;
-- 3초 안에 락을 못 잡으면 ERROR로 빠져나옴
```

## 격리 수준별 쓰기 충돌 처리

[MVCC 글](/postgres/mvcc-visibility/)에서 격리 수준별로 snapshot 획득 시점이 다르다는 점을 다뤘습니다. 여기서는 **같은 row에 쓰기 충돌이 생겼을 때** 각 격리 수준이 어떻게 반응하는지를 봅니다.

### Read Committed: 최신 버전을 다시 읽고 진행

도입부의 실험을 이어갑시다. Session B가 대기 중이고, Session A가 COMMIT합니다.

```sql
-- Session A
COMMIT;
```

Session B의 UPDATE가 즉시 실행됩니다. 이때 Session B는 **Session A가 커밋한 최신 버전**을 기준으로 UPDATE를 적용합니다. balance가 원래 1000이었고, Session A가 -100을 해서 900이 되었으면, Session B는 900 위에 +500을 적용해서 1400이 됩니다.

```sql
SELECT balance FROM accounts WHERE id = 1;
```

| balance |
|---------|
| 1400 |

이 동작을 내부적으로 **EvalPlanQual**이라고 부릅니다. RC에서 UPDATE가 대기 후 풀렸을 때, "내가 원래 읽었던 버전이 아니라 **최신 커밋된 버전**을 다시 읽어서 WHERE 조건을 다시 평가하고, 조건을 만족하면 그 위에 수정을 적용한다"는 동작입니다. Session A가 ROLLBACK했다면 Session B는 원래 버전(balance=1000) 위에 적용합니다.

### Repeatable Read: 충돌 시 에러

같은 상황을 RR에서 재현하면 결과가 다릅니다.

```sql
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
```

```sql
-- Session B
BEGIN ISOLATION LEVEL REPEATABLE READ;
UPDATE accounts SET balance = balance + 500 WHERE id = 1;
-- 대기...
```

```sql
-- Session A
COMMIT;
```

```
-- Session B
ERROR:  could not serialize access due to concurrent update
```

RR에서는 EvalPlanQual이 동작하지 않습니다. Session B의 snapshot에서 보이는 버전과 실제 최신 버전이 다르면 "직렬화할 수 없다"는 에러를 내고 트랜잭션을 abort합니다. 애플리케이션은 이 에러를 잡아서 트랜잭션을 처음부터 재시도해야 합니다.

이게 RC와 RR의 핵심 차이입니다. RC는 "최신 버전으로 갈아타서라도 진행"이고, RR은 "내 snapshot과 현실이 어긋나면 포기"입니다.

### Write Skew: Repeatable Read가 못 잡는 이상 현상

RR이 에러를 내서 충돌을 잘 잡아주는 것 같지만, 놓치는 케이스가 있습니다.

병원 당직 스케줄 예제를 봅시다. 규칙은 "최소 1명은 당직이어야 한다"입니다.

```sql
CREATE TABLE doctors (
    id int PRIMARY KEY,
    name text,
    on_call boolean
);
INSERT INTO doctors VALUES (1, 'Alice', true), (2, 'Bob', true);
```

두 의사가 동시에 당직을 빠지려고 합니다.

```sql
-- Session A (Alice)
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM doctors WHERE on_call = true;
-- 결과: 2 (Alice, Bob 둘 다 당직)
-- "2명이니까 나 하나 빠져도 되겠다"
UPDATE doctors SET on_call = false WHERE id = 1;  -- Alice 당직 해제
```

```sql
-- Session B (Bob) — 동시에
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM doctors WHERE on_call = true;
-- 결과: 2 (같은 snapshot, 둘 다 당직으로 보임)
-- "2명이니까 나 하나 빠져도 되겠다"
UPDATE doctors SET on_call = false WHERE id = 2;  -- Bob 당직 해제
```

두 세션이 수정하는 행이 서로 다릅니다(id=1 vs id=2). row-level lock이 충돌하지 않으므로 둘 다 COMMIT에 성공합니다.

```sql
SELECT * FROM doctors;
```

| id | name | on_call |
|----|------|---------|
| 1 | Alice | false |
| 2 | Bob | false |

당직이 0명이 됐습니다. 각 트랜잭션은 "2명 중 1명 빠져도 1명 남는다"고 판단했지만, 동시에 실행되면서 둘 다 빠져버린 겁니다. 이게 **write skew**이고, RR(snapshot isolation)에서는 원리적으로 막을 수 없습니다. 각 트랜잭션이 **서로 다른 행을 수정**하므로 row-level lock이 충돌하지 않고, snapshot도 서로의 미커밋 변경을 보지 못하기 때문입니다.

## Serializable과 SSI

Write skew를 막으려면 **Serializable** 격리 수준이 필요합니다. PostgreSQL의 Serializable은 RR의 snapshot에 **SSI(Serializable Snapshot Isolation)**라는 메커니즘을 추가한 것입니다.

### SSI의 핵심: rw-conflict

SSI는 트랜잭션들 사이의 **rw-conflict(읽기-쓰기 의존성)**을 추적합니다. rw-conflict란 "T1이 읽은 데이터를 T2가 수정했다"는 관계입니다.

위 당직 예제에서:
- Session A가 `doctors` 테이블을 읽었고(on_call = true인 행 전부), Session B가 id=2를 수정 → **Session A → Session B 방향의 rw-conflict**
- Session B가 `doctors` 테이블을 읽었고, Session A가 id=1을 수정 → **Session B → Session A 방향의 rw-conflict**

SSI는 이 rw-conflict 엣지들 중에서 **"dangerous structure"**를 감지합니다. dangerous structure란 **연속 두 개의 rw-conflict가 하나의 트랜잭션(pivot)을 거쳐 이어지는 패턴**(T_in → T_pivot → T_out)입니다. 위 예제에서는 두 트랜잭션이 서로를 향한 rw-conflict를 가지므로 각각이 상대방의 pivot이 되어 dangerous structure가 즉시 성립합니다. SSI는 이 구조를 감지하면 한쪽을 abort합니다.

Serializable로 같은 실험을 돌려봅시다.

```sql
-- Session A
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call = true;
UPDATE doctors SET on_call = false WHERE id = 1;
COMMIT;  -- 먼저 커밋 성공
```

```sql
-- Session B
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call = true;
UPDATE doctors SET on_call = false WHERE id = 2;
COMMIT;
```

```
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.
HINT:  The transaction might succeed if retried.
```

Session B의 COMMIT이 거부됩니다. row-level lock 충돌은 없었는데도 abort된 건, SSI가 dangerous structure를 감지했기 때문입니다.

### SIRead lock

SSI가 rw-conflict를 추적하려면 "어떤 트랜잭션이 어떤 데이터를 읽었는지"를 기록해야 합니다. 이를 위해 PostgreSQL은 **SIRead lock**(predicate lock이라고도 부릅니다)이라는 특수한 lock을 사용합니다.

일반 lock과 달리, SIRead lock은 **대기를 발생시키지 않습니다**. "이 트랜잭션이 이 데이터를 읽었다"는 사실만 기록해두고, 나중에 다른 트랜잭션이 해당 데이터를 수정하면 rw-conflict 엣지가 추가됩니다. 실행 도중에는 아무도 멈추지 않고, COMMIT 시점에 dangerous structure가 감지되면 그때 abort합니다.

SIRead lock은 행 단위, 페이지 단위, 테이블 단위로 잡힐 수 있고, 너무 많은 행 단위 lock이 쌓이면 페이지나 테이블 단위로 **에스컬레이션**됩니다. 에스컬레이션되면 감시 범위가 넓어져서 false positive(실제로는 문제없는 조합인데 abort되는 경우)가 늘어날 수 있습니다.

### SSI의 보수성

SSI는 **안전한 쪽으로 판단**합니다. 실제로는 직렬화 이상이 아닌 조합에서도 dangerous structure가 감지되면 abort합니다. 그래서 SSI가 abort하는 트랜잭션 중 일부는 통과시켜도 무방한 것일 수 있습니다(false positive). 하지만 놓치는 것(false negative)은 없으므로, 커밋에 성공한 트랜잭션은 반드시 직렬화 가능한 결과입니다.

이 보수성 때문에 Serializable을 쓸 때는 **재시도 로직이 필수**입니다. 에러 코드 `40001`(serialization_failure)을 잡아서 트랜잭션을 처음부터 다시 실행하는 wrapper를 애플리케이션에 넣어야 합니다.

## Deadlock

락이 있는 시스템에서는 deadlock이 항상 가능합니다. 두 세션이 서로의 락을 기다리는 상황을 만들어봅시다.

```sql
-- Session A
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
```

```sql
-- Session B
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 2;
```

여기까지는 문제없습니다. 서로 다른 행이니까요. 이제 교차로 접근합니다.

```sql
-- Session A
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- 대기 (Session B가 id=2를 잡고 있음)
```

```sql
-- Session B
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
-- 대기 (Session A가 id=1을 잡고 있음)
```

둘 다 서로를 기다리고 있습니다. PostgreSQL은 `deadlock_timeout`(기본 1초) 후에 deadlock detection을 실행하고, 한쪽을 abort합니다.

```
ERROR:  deadlock detected
DETAIL:  Process 12345 waits for ShareLock on transaction 789; blocked by process 12346.
         Process 12346 waits for ShareLock on transaction 788; blocked by process 12345.
HINT:  See server log for query details.
```

방지하는 가장 단순한 원칙은 **모든 트랜잭션이 같은 순서로 행을 잠그는 것**입니다. 위 예제에서 두 세션이 모두 id=1 → id=2 순서로 UPDATE했다면, 첫 번째 행에서 이미 한쪽이 대기하므로 순환이 만들어지지 않습니다.

## pg_locks로 블로킹 진단

운영 중에 "쿼리가 멈췄다"는 알림이 오면 가장 먼저 확인하는 것이 락 상태입니다. PG 9.6부터는 `pg_blocking_pids()` 함수로 간단하게 확인할 수 있습니다.

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, query, state,
       wait_event_type, wait_event
FROM pg_stat_activity
WHERE pg_blocking_pids(pid) != '{}';
```

| pid | blocked_by | query | state | wait_event_type | wait_event |
|-----|------------|-------|-------|-----------------|------------|
| 12346 | {12345} | UPDATE accounts SET ... | active | Lock | transactionid |

`blocked_by`에 찍힌 pid가 범인입니다. 해당 pid의 `state`가 `idle in transaction`이면 트랜잭션이 열린 채로 방치되어 있다는 뜻이고, [지난 글에서 다뤘듯이](/postgres/vacuum-and-bloat/) VACUUM을 막을 뿐 아니라 락을 오래 잡고 있으면 다른 세션의 DML까지 막을 수 있습니다.

## 실전에서는

1. **`idle in transaction` 세션이 락을 오래 잡고 있으면 뒤의 DML/DDL이 줄줄이 대기한다.** `idle_in_transaction_session_timeout`을 설정해서 자동 종료시키는 것이 권장된다
2. **DDL 실행 전에 `lock_timeout`을 짧게 설정한다.** ALTER TABLE이 `AccessExclusiveLock`을 기다리며 대기하면 그 뒤의 모든 쿼리가 줄줄이 멈춘다. 3~5초 안에 락을 못 잡으면 빠져나와서 나중에 재시도하는 것이 안전하다
3. **Serializable을 쓰면 재시도 로직이 필수다.** SSI가 false positive으로 abort할 수 있으므로, 에러 코드 `40001`을 잡아서 자동 재시도하는 wrapper가 애플리케이션에 있어야 한다. 대부분의 OLTP에서는 Read Committed로 충분하고, write skew가 비즈니스 규칙을 깨뜨리는 특정 시나리오에서만 Serializable을 쓰는 것이 현실적이다
4. **deadlock은 감지 + 재시도로 대응한다.** 완전히 방지하려면 모든 트랜잭션이 같은 순서로 행을 잠그면 되지만, 복잡한 비즈니스 로직에서는 현실적으로 어렵다. deadlock이 간헐적으로 발생하는 것은 정상이고, 빈번하면 트랜잭션 설계를 점검한다

## 흔한 오해

**"FOR UPDATE를 걸면 다른 세션이 SELECT도 못 한다."** row-level lock은 읽기를 막지 않습니다. MVCC 덕분에 다른 세션의 `SELECT`는 snapshot에서 보이는 버전을 그대로 읽습니다. `FOR UPDATE`가 막는 것은 다른 세션의 `UPDATE`, `DELETE`, `SELECT ... FOR UPDATE`뿐입니다.

**"Serializable이 가장 안전하니까 항상 쓰면 된다."** Serializable은 abort + 재시도 비용이 있습니다. SSI의 SIRead lock 추적도 메모리와 CPU를 씁니다. 대부분의 OLTP 워크로드에서 Read Committed는 lost update를 EvalPlanQual로 막고, 애플리케이션 레벨의 명시적 `FOR UPDATE`로 나머지를 커버합니다. Serializable이 진짜 필요한 상황은 write skew처럼 "서로 다른 행을 읽고 쓰는데 결합하면 일관성이 깨지는" 특정 패턴뿐입니다.

**"deadlock은 버그다."** 동시성이 있으면 deadlock은 항상 가능합니다. PostgreSQL의 deadlock detection은 정상적인 운영 메커니즘이지 장애가 아닙니다. 한쪽이 abort되면 애플리케이션이 재시도하면 됩니다. 다만 deadlock이 초당 수십 건씩 발생한다면 트랜잭션 설계(락 순서, 트랜잭션 범위)를 점검해야 합니다.

## 마치며

snapshot이 읽기 충돌을, 락이 쓰기 충돌을 각각 담당합니다. row-level lock은 튜플 헤더에 기록되어 별도 메모리 부담 없이 동작하고, 테이블 레벨 락 8단계가 DDL과 DML의 공존 범위를 정합니다. 충돌이 생겼을 때 RC는 최신 버전으로 갈아타고, RR은 에러를 내고, Serializable은 SSI로 write skew까지 잡아냅니다.

다음 글에서는 데이터의 내구성(durability)으로 넘어갑니다. PostgreSQL이 crash에서 살아남는 구조, WAL이 shared buffer보다 먼저 디스크에 써지는 이유, 그리고 checkpoint가 I/O spike의 원인이 되는 메커니즘을 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 13. Concurrency Control](https://www.postgresql.org/docs/18/mvcc.html)
- [Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html): 8단계 테이블 락, row-level lock 4모드, advisory lock
- [Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html): Read Committed, Repeatable Read, Serializable
- [Serializable Snapshot Isolation in PostgreSQL](https://wiki.postgresql.org/wiki/SSI): SSI 구현의 공식 위키 문서
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 5: Concurrency Control](https://www.interdb.jp/pg/pgsql05.html)
- Dan R. K. Ports, Kevin Grittner, "Serializable Snapshot Isolation in PostgreSQL" (VLDB 2012): SSI 알고리즘의 학술 논문
