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

<br>

## 어떤 상황에서 발생하는가

전형적인 재현 흐름은 이렇습니다.

```
[API 서버 시작]
  pymysql.connect(host=..., user=..., password=...)
  → 커넥션 생성 (autocommit=False가 기본값)

[첫 번째 API 요청]
  SELECT * FROM orders WHERE order_id = 1001
  → 결과: status = 'PENDING' (주문접수)

[관리자 페이지에서 상태 변경]
  다른 커넥션이 UPDATE orders SET status = 'SHIPPING' WHERE order_id = 1001 → COMMIT

[두 번째 API 요청]
  SELECT * FROM orders WHERE order_id = 1001
  → 결과: status = 'PENDING' (?? 변경이 안 보임)

[세 번째, 네 번째... 모든 후속 요청]
  → 결과: status = 'PENDING' (영원히 동일)

[서버 재시작]
  새 커넥션 생성 → 이제야 status = 'SHIPPING' 확인
```

SELECT 쿼리만 실행하고 있는데, 다른 커넥션에서 COMMIT한 변경이 전혀 보이지 않습니다. 대체 왜 그럴까요?

<br>

## MySQL 트랜잭션 격리 수준

원인을 이해하려면 먼저 MySQL의 트랜잭션 격리 수준을 알아야 합니다. SQL 표준은 4가지 격리 수준을 정의하고 있고, MySQL InnoDB의 기본값은 **REPEATABLE READ**입니다.

| 격리 수준 | Dirty Read | Non-Repeatable Read | Phantom Read | 스냅샷 갱신 시점 |
|-----------|:---:|:---:|:---:|-----------------|
| READ UNCOMMITTED | O | O | O | 즉시 (커밋 전 포함) |
| READ COMMITTED | X | O | O | 매 SELECT마다 |
| **REPEATABLE READ** (기본값) | X | X | O | **첫 SELECT 시점 고정** |
| SERIALIZABLE | X | X | X | 공유 잠금으로 직렬화 |

SQL 표준에서는 REPEATABLE READ에서 Phantom Read가 발생할 수 있지만, MySQL InnoDB는 Gap Lock을 통해 이를 방지합니다.

핵심은 REPEATABLE READ의 "스냅샷 갱신 시점" 컬럼입니다. MySQL 공식 문서에 따르면, REPEATABLE READ의 스냅샷은 `BEGIN` 시점이 아니라 **트랜잭션 내 첫 번째 SELECT가 실행되는 순간** 생성됩니다. 이후 같은 트랜잭션 안에서는 동일한 SELECT를 몇 번 실행해도 항상 그 스냅샷 기준의 결과를 반환합니다. 보고서 생성이나 일관된 데이터 처리에 유용한 기능입니다.

**그런데 문제는 이 "트랜잭션"이 언제 시작되고 끝나느냐입니다.**

<br>

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

여기에 REPEATABLE READ가 결합되면 어떤 일이 벌어질까요?

```
autocommit=False + REPEATABLE READ 조합:

[서버 시작]
  pymysql.connect()  →  커넥션 생성 (autocommit=False)

[첫 번째 API 요청]
  cursor.execute("SELECT ...")
  → 암묵적 트랜잭션 시작 + 첫 SELECT이므로 이 시점에 스냅샷 생성
  → 결과: status = 'PENDING'

[외부에서 데이터 변경 + COMMIT]

[두 번째 API 요청]
  cursor.execute("SELECT ...")
  → 같은 커넥션, 같은 트랜잭션 (COMMIT한 적이 없으므로)
  → 같은 스냅샷을 읽음
  → 결과: status = 'PENDING' (변경 반영 안 됨)

[세 번째, 네 번째... N번째 요청]
  → COMMIT이 없으니 스냅샷이 영원히 갱신되지 않음
  → 서버를 재시작하기 전까지 변경된 데이터를 볼 수 없음
```

이것이 문제의 원인입니다. **SELECT만 실행하는 읽기 전용 코드라도, autocommit=False면 첫 SELECT 시점의 스냅샷에 갇힙니다.** COMMIT을 명시적으로 호출하지 않는 한, 외부에서 아무리 데이터를 변경해도 이 커넥션에서는 보이지 않습니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 핵심 함정</strong><br>
  "쓰기를 안 하니까 트랜잭션은 신경 안 써도 되겠지" — 이 가정이 함정입니다. SELECT도 트랜잭션 안에서 실행되며, <code>autocommit=False</code>일 때는 트랜잭션이 자동으로 시작되고 자동으로 끝나지 않습니다.
</div>

<br>

## 해결: autocommit=True

가장 깔끔한 해결법은 읽기 전용 커넥션에 `autocommit=True`를 설정하는 것입니다.

```python
# ✅ 해결: autocommit=True 설정
conn = pymysql.connect(
    host='db.example.com',
    user='api_user',
    password='...',
    database='myapp',
    autocommit=True  # 이 한 줄이 핵심
)
```

`autocommit=True`면 각 SQL 문이 **독립적인 트랜잭션**으로 실행됩니다. SELECT 하나가 곧 하나의 트랜잭션이고, 실행이 끝나면 자동으로 COMMIT됩니다.

```
autocommit=True일 때:

[첫 번째 요청]
  SELECT ... → 암묵적 트랜잭션 시작 → 결과 반환 → 자동 COMMIT → 트랜잭션 종료

[외부에서 데이터 변경 + COMMIT]

[두 번째 요청]
  SELECT ... → 새 트랜잭션 시작 → 새 스냅샷 생성 → 변경된 값 확인!
```

매 SELECT마다 새로운 스냅샷을 읽으므로, 다른 커넥션에서 COMMIT한 변경이 즉시 반영됩니다.

<br>

## 대안: autocommit=True 외의 방법

상황에 따라 `autocommit=True`를 적용하기 어려울 수도 있습니다. 같은 커넥션으로 읽기와 쓰기를 모두 한다면, 무조건 autocommit을 켜는 것이 답은 아닙니다.

### 방법 1: 읽기 전에 명시적 COMMIT

```python
# 조회 전에 이전 트랜잭션을 끊어주면 새 스냅샷을 읽는다
conn.commit()
cursor.execute("SELECT * FROM orders WHERE order_id = %s", (order_id,))
```

기존 트랜잭션을 COMMIT으로 명시적으로 종료하면, 다음 SELECT에서 새로운 트랜잭션(= 새 스냅샷)이 시작됩니다. 쓰기 작업이 섞여 있어서 autocommit을 쓸 수 없는 경우에 유용합니다.

### 방법 2: 세션 격리 수준 변경

```python
cursor.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
```

격리 수준을 READ COMMITTED로 낮추면, autocommit=False여도 매 SELECT마다 새 스냅샷을 읽습니다. 다만 이 경우 동일 트랜잭션 내에서 반복 읽기 일관성(Repeatable Read)을 포기하는 것이므로, 트레이드오프를 이해하고 사용해야 합니다.

### 어떤 방법을 선택할까?

| 상황 | 추천 방법 |
|------|----------|
| 읽기만 하는 커넥션 | `autocommit=True` |
| 읽기/쓰기 혼합, 쓰기에 트랜잭션 필요 | 읽기 전 `conn.commit()` |
| 항상 최신 데이터를 읽어야 하는 특수한 경우 | `READ COMMITTED`로 변경 |

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 팁</strong><br>
  읽기 전용 커넥션과 쓰기 커넥션을 분리하면 가장 깔끔합니다. 읽기 커넥션은 <code>autocommit=True</code>, 쓰기 커넥션은 <code>autocommit=False</code>로 설정하면 각각의 목적에 맞는 트랜잭션 동작을 보장할 수 있습니다.
</div>

<br>

## ORM을 쓰면 괜찮을까?

"raw 커넥션이 아니라 ORM을 사용하면 이 문제를 피할 수 있지 않을까?"라는 생각이 들 수 있습니다. 결론부터 말하면, **ORM에 따라 다릅니다.**

### Django ORM — 기본적으로 안전

Django는 기본이 **autocommit 모드**입니다. 각 쿼리가 독립적으로 커밋되기 때문에 REPEATABLE READ 스냅샷 고정 문제가 발생하지 않습니다. `@transaction.atomic()` 블록 안에서만 트랜잭션이 열리고, 블록이 끝나면 자동으로 커밋됩니다.

### SQLAlchemy — 패턴에 따라 다름

SQLAlchemy 2.0은 **autobegin 패턴**을 사용합니다. 쿼리를 실행하면 자동으로 트랜잭션이 시작되고, 반드시 `session.commit()` 또는 `session.rollback()`으로 끝내야 합니다. `Session(autocommit=True)` 옵션은 2.0에서 제거되었습니다.

웹 프레임워크에서 request 단위로 세션을 관리하면 (FastAPI의 `Depends(get_db)`, Flask의 `@app.teardown_appcontext`) request마다 커밋/롤백이 일어나므로 **대체로 안전**합니다. 하지만 배치 스크립트나 Celery worker처럼 세션을 오래 열어두는 경우에는 raw 커넥션과 동일한 문제가 발생할 수 있습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  SQLAlchemy에서 읽기 전용 작업에 DBAPI 레벨 autocommit을 쓰고 싶다면 <code>create_engine(..., isolation_level="AUTOCOMMIT")</code> 또는 커넥션 단위로 <code>connection.execution_options(isolation_level="AUTOCOMMIT")</code>을 설정할 수 있습니다.
</div>

<br>

## 다른 드라이버의 기본값은?

이 함정이 PyMySQL에만 있는 건 아닐까요? 주요 Python DB 드라이버의 `autocommit` 기본값을 정리해보겠습니다.

| 드라이버 | 기본 autocommit | DB 기본 격리 수준 | 이 문제 발생? |
|---------|:---:|-----------|:---:|
| **PyMySQL** | `False` | REPEATABLE READ | **O** |
| **mysqlclient** | `False` | REPEATABLE READ | **O** |
| **psycopg2** (PostgreSQL) | `False` | READ COMMITTED | X |

Python DB-API 2.0 (PEP 249) 표준은 `autocommit=False`를 기본값으로 권장합니다. 그래서 위 드라이버들은 모두 기본이 `False`입니다.

그런데 psycopg2는 같은 `autocommit=False`인데 왜 이 문제가 안 생길까요? PostgreSQL의 기본 격리 수준이 **READ COMMITTED**이기 때문입니다. READ COMMITTED는 매 SELECT마다 새 스냅샷을 읽으므로, 트랜잭션이 열려 있어도 다른 커넥션의 COMMIT이 보입니다. 결국 이 문제는 **MySQL의 기본 격리 수준(REPEATABLE READ)과 PEP 249의 기본값(autocommit=False)이라는 두 기본값이 만나야** 발생하는 함정입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  PostgreSQL에서도 격리 수준을 REPEATABLE READ로 올리면 동일한 문제가 발생합니다. "MySQL만의 문제"가 아니라 "REPEATABLE READ + autocommit=False 조합"의 문제입니다.
</div>

<br>

## 읽기 전용 커넥션 체크리스트

Python에서 DB를 읽기 전용으로 연결할 때 확인할 항목들을 정리합니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 읽기 전용 커넥션 점검 항목</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><code>autocommit=True</code>가 명시적으로 설정되어 있는가?</li>
    <li>커넥션 풀을 사용한다면, 풀에서 꺼낸 커넥션의 autocommit 상태가 보장되는가?</li>
    <li>ORM을 쓰지 않고 raw 커넥션을 쓴다면, PEP 249 기본값(<code>autocommit=False</code>)을 인지하고 있는가?</li>
    <li>읽기와 쓰기 커넥션이 분리되어 있는가?</li>
    <li>장시간 유지되는 커넥션(서버 시작 시 생성 → 종료까지 유지)이 있다면, 해당 커넥션의 트랜잭션 수명을 확인했는가?</li>
  </ul>
</div>

<br>

## 마치며

이 문제가 까다로운 이유는 "SELECT만 하는데 트랜잭션이 왜 중요하지?"라는 선입견 때문입니다. 쓰기를 하지 않으니 트랜잭션을 신경 쓸 필요가 없다고 생각하기 쉽습니다.

핵심은 하나입니다. **MySQL에서 모든 SQL 문은 트랜잭션 안에서 실행됩니다.** `autocommit=False`면 첫 번째 SELECT가 트랜잭션을 열고, 명시적 COMMIT 없이는 그 트랜잭션이 영원히 유지됩니다. REPEATABLE READ 격리 수준에서 이는 곧 첫 번째 SELECT 시점의 데이터에 갇히는 것을 의미합니다.

## 참고자료

- [MySQL 공식 문서 — Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html)
- [PyMySQL 공식 문서 — Connection](https://pymysql.readthedocs.io/en/latest/modules/connections.html)
- [PEP 249 — Python Database API Specification v2.0](https://peps.python.org/pep-0249/)
- [MySQL 공식 문서 — Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html)
