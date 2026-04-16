---
date: '2026-04-14'
title: 'PostgreSQL B-tree 인덱스의 해부학'
category: 'Database'
series: 'postgres'
seriesOrder: 4
tags: ['PostgreSQL', 'Index', 'B-tree', 'Query Performance']
summary: 'B-tree 페이지가 디스크 위에 어떻게 놓여 있는지, 루트에서 리프까지 한 건을 찾아가는 경로, composite index의 선두 컬럼 규칙이 생기는 이유, 그리고 Index-Only Scan이 Visibility Map에 의존하는 이유를 실제 페이지를 뜯어보며 따라갑니다.'
thumbnail: './thumbnail.png'
---

`users(email)`에 인덱스를 걸어뒀는데 `EXPLAIN`을 찍어보니 `Seq Scan on users`가 나옵니다. `(user_id, created_at)` composite index가 있는데 `WHERE created_at > '2026-01-01'`로 최근 데이터를 뽑으면 인덱스를 안 탑니다. 같은 조건에 `LIKE 'foo%'`는 인덱스를 타는데 `LIKE '%bar'`는 타지 않습니다.

세 현상 모두 "인덱스가 있으면 빨라진다"는 직관으로는 설명되지 않습니다. 그리고 셋 다 같은 원인에서 나옵니다. PostgreSQL의 인덱스 중 95%를 차지하는 B-tree가 **특정한 방식으로 정렬된 자료구조**이고, 그 구조가 허용하는 접근 패턴이 위 세 상황에서 각각 다르게 걸리는 겁니다.

이 글에서는 B-tree를 디스크 관점에서 열어봅니다. 루트·브랜치·리프 페이지가 8KB 단위로 어떻게 배치되는지, 한 건을 찾아갈 때 페이지를 몇 장 읽는지, 리프가 좌우로 이어져 있다는 사실이 `ORDER BY`와 range scan을 가능하게 만드는 원리, 그리고 composite index의 컬럼 순서 규칙이 "왜 하필 그렇게" 정해져 있는지까지. 지난 글에서 본 힙 페이지와 튜플 구조, MVCC의 가시성 개념이 여기서 다시 쓰입니다. 인덱스는 결국 힙의 `ctid`를 가리키는 자료구조이고, 그 포인터가 가리키는 곳에 튜플이 정말 보이는지를 확인해야 하기 때문입니다.

## B-tree는 왜 기본 인덱스인가

`CREATE INDEX ON t (col)`처럼 인덱스 타입을 명시하지 않으면 PostgreSQL은 B-tree를 만듭니다. GIN, GiST, BRIN, Hash 같은 다른 타입도 있는데 굳이 B-tree가 기본인 이유는, **실무에서 쓰는 거의 모든 조건 유형을 하나의 자료구조가 커버**하기 때문입니다.

- equality: `WHERE id = 42`
- range: `WHERE created_at BETWEEN ...`, `WHERE age > 30`
- prefix match: `WHERE name LIKE 'Kim%'`
- ORDER BY / 정렬된 결과: `ORDER BY created_at DESC LIMIT 10`
- uniqueness: `UNIQUE` 제약이 내부적으로 B-tree 사용
- NULL 처리: `IS NULL` / `IS NOT NULL`도 인덱스 가능

이 다섯 가지를 모두 지원하면서 삽입/삭제에 `O(log n)` 복잡도를 유지하는 자료구조가 B-tree입니다. 이름의 "B"는 정확한 기원이 논쟁거리지만, PostgreSQL이 채택한 버전은 Lehman과 Yao의 1981년 논문에서 출발해 Lanin-Shasha의 개선이 얹어진 변형입니다. 이 계열의 핵심 특징 하나는 **같은 레벨의 페이지들이 좌우로 연결된 doubly-linked list**라는 점인데, 뒤에서 range scan을 설명할 때 다시 돌아옵니다.

## 페이지 구조: 루트에서 리프까지

B-tree 인덱스도 디스크에 저장됩니다. 테이블과 같은 8KB 페이지 단위로요. 인덱스 파일 역시 [지난 글에서 본 relfilenode](/postgres/heap-page-tuple/) 구조로 관리되고, 페이지 하나마다 "그 안에 담긴 엔트리들 + 좌우 sibling 포인터 + 부모로 올라가는 high key"가 들어갑니다.

개념적 구조는 다음과 같습니다.

```
                      [ Root page ]
                     /      |      \
              [ Branch ] [ Branch ] [ Branch ]    ← 내부 노드
               /    \      /    \      /    \
           [Leaf]-[Leaf]-[Leaf]-[Leaf]-[Leaf]-[Leaf]   ← 리프 (좌우 연결)
             │      │      │      │      │      │
             ▼      ▼      ▼      ▼      ▼      ▼
           (heap tuple: ctid로 힙 페이지를 가리킴)
```

세 종류의 페이지가 역할을 나눠 갖습니다.

| 페이지 | 저장 내용 | 역할 |
|--------|-----------|------|
| 메타페이지 (0번) | 루트 페이지 번호, 레벨, 기타 메타데이터 | 탐색 시작점 |
| 내부 노드(루트/브랜치) | `(separator key, 자식 페이지 번호)` 쌍 | 탐색 라우팅 |
| 리프 | `(key, heap tuple의 ctid)` 쌍 | 힙으로 나가는 관문 |

키의 크기에 따라 페이지 하나에 수백 개의 엔트리가 들어갑니다(fanout). 그래서 수백만 행의 테이블이라도 트리 깊이는 보통 3-4 레벨에 머뭅니다. 한 번의 equality lookup은 "메타 → 루트 → (브랜치) → 리프 → 힙"으로 4-5장의 페이지만 읽고 끝난다는 뜻이고, 각 페이지가 shared_buffers에 캐시되어 있을 확률도 높기 때문에 실제 디스크 I/O는 더 적습니다. 이게 인덱스가 빠른 기계적 이유입니다.

키 크기에는 상한이 있습니다. PostgreSQL B-tree는 한 인덱스 엔트리가 페이지의 대략 1/3을 넘지 못하도록 막아둡니다. 한 페이지에 최소 세 개의 엔트리가 들어가야 인덱스 페이지가 꽉 찼을 때 둘로 쪼개는 페이지 분할(split)이 항상 성공할 수 있기 때문입니다. 엔트리 하나가 페이지를 거의 다 차지하면 나눌 방법이 없습니다.

## pageinspect로 실제 페이지 열어보기

개념도만으로는 와닿지 않으니 실제 페이지를 열어봅시다. `contrib` 패키지에 포함된 `pageinspect` 확장을 쓰면 인덱스 페이지의 바이트를 사람이 읽을 수 있는 형태로 덤프해줍니다. 이 확장의 모든 함수는 **슈퍼유저 권한이 필요**합니다(필요하면 개별 함수에 `GRANT EXECUTE`로 위임 가능).

```sql
CREATE EXTENSION pageinspect;

CREATE TABLE t_idx (id int PRIMARY KEY, val text);
INSERT INTO t_idx SELECT g, 'v' || g FROM generate_series(1, 100000) g;
ANALYZE t_idx;
```

먼저 메타페이지를 봅니다.

```sql
SELECT * FROM bt_metap('t_idx_pkey');
```

| magic | version | root | level | fastroot | fastlevel | ... |
|-------|---------|------|-------|----------|-----------|-----|
| 340322 | 4 | 3 | 1 | 3 | 1 | ... |

`root = 3`은 "루트 페이지가 3번 블록에 있다", `level = 1`은 "루트가 레벨 1, 리프가 레벨 0"이라는 뜻입니다. 10만 행짜리 테이블이면 루트 한 장 + 리프들 두 레벨 트리로 충분합니다.

이제 루트 페이지의 엔트리를 봅시다.

```sql
SELECT itemoffset, ctid, data
FROM bt_page_items('t_idx_pkey', 3)
LIMIT 5;
```

| itemoffset | ctid | data |
|------------|------|------|
| 1 | (1,0) | |
| 2 | (2,0) | 57 01 00 00 00 00 00 00 |
| 3 | (4,0) | ad 02 00 00 00 00 00 00 |
| 4 | (5,0) | 03 04 00 00 00 00 00 00 |
| 5 | (6,0) | 59 05 00 00 00 00 00 00 |

여기서 `ctid`는 **힙 튜플이 아니라 자식 인덱스 페이지 번호**를 가리킵니다. 1번 엔트리의 `ctid=(1,0)`은 1번 인덱스 페이지(첫 리프)를 의미하고, `data`는 해당 자식의 분기 기준 키입니다. 첫 엔트리는 키 부분이 잘려나간 "왼쪽 끝" pivot으로, 가장 왼쪽 자식을 가리키는 용도입니다. 2번 엔트리의 `data`가 `57 01 00 00 ...`인데, little-endian으로 읽으면 `0x00000157 = 343`. "2번 리프에는 id ≥ 343 인 값들이 들어있다"는 뜻입니다.

리프 페이지도 같은 함수로 볼 수 있습니다.

```sql
SELECT itemoffset, ctid, data
FROM bt_page_items('t_idx_pkey', 1)
LIMIT 5;
```

| itemoffset | ctid | data |
|------------|------|------|
| 1 | (0,1) | 01 00 00 00 00 00 00 00 |
| 2 | (0,2) | 02 00 00 00 00 00 00 00 |
| 3 | (0,3) | 03 00 00 00 00 00 00 00 |
| 4 | (0,4) | 04 00 00 00 00 00 00 00 |
| 5 | (0,5) | 05 00 00 00 00 00 00 00 |

리프에서는 `ctid`가 다시 **힙 튜플의 좌표**가 됩니다. id=1은 힙의 `(0,1)`에 있고, 2는 `(0,2)`에 있고... 지난 글에서 본 ctid가 그대로 인덱스에 기록되어 있는 겁니다. 인덱스의 역할이 "키를 정렬해 두고, 해당 키를 가진 힙 튜플의 좌표를 알려주는 것"이라는 사실이 여기서 물리적으로 확인됩니다.

## 검색 경로: 한 건을 어떻게 찾는가

`SELECT * FROM t_idx WHERE id = 50000`을 실행하면 PostgreSQL은 이렇게 움직입니다.

1. 루트 페이지 번호를 알아낸다. 매번 메타페이지를 읽는 게 아니라, 인덱스의 relcache 엔트리에 루트 위치가 캐시돼 있다
2. 루트 페이지에서 50000이 어느 자식 범위에 속하는지 이분 탐색으로 결정한다
3. 해당 자식(리프) 페이지를 읽고, 그 안에서 다시 이분 탐색으로 id=50000 엔트리를 찾는다
4. 엔트리의 ctid로 힙 페이지를 읽어 튜플을 가져온다
5. 그 튜플이 내 snapshot에서 보이는지 [가시성 판정](/postgres/mvcc-visibility/)을 한다

페이지 수로는 루트(1) + 리프(1) + 힙(1) = 3장. 이 모두가 shared_buffers에 올라와 있으면 디스크 I/O는 0이고, `EXPLAIN (ANALYZE, BUFFERS)`에 `shared hit=3` 같은 숫자로 찍힙니다. 메타페이지 자체는 루트가 분할되는 등으로 캐시가 무효화될 때만 다시 읽히므로, 일반 탐색 비용에 들어가지 않습니다. `bt_metap`에 있는 `fastroot`는 이 캐시를 한 단계 더 최적화한 것으로, 루트 아래가 한 자식만 가지는 트리 상단을 건너뛰고 실제 분기가 시작되는 레벨부터 탐색을 시작하게 해줍니다.

range 조회는 조금 다릅니다. `WHERE id BETWEEN 50000 AND 50500`이면 1-3단계는 같지만, 4단계 대신 **리프의 오른쪽 sibling 포인터를 따라** 계속 다음 리프로 넘어갑니다. 이게 아까 언급한 "리프가 좌우로 doubly-linked list로 연결돼 있다"는 구조의 쓸모입니다. 새로운 lookup을 다시 시작하지 않아도, 리프 체인을 걸어가며 범위를 훑을 수 있습니다. `ORDER BY id`가 인덱스만으로 해결되는 것도 같은 이유입니다. 리프 체인 자체가 이미 정렬 순서이기 때문입니다.

## Composite index와 선두 컬럼 규칙

실무에서 가장 자주 발목을 잡는 규칙입니다. `(a, b, c)` 순서로 만든 composite index가 있다고 해봅시다.

```sql
CREATE TABLE events (
    user_id bigint,
    created_at timestamptz,
    event_type text,
    payload jsonb
);
CREATE INDEX ON events (user_id, created_at);
INSERT INTO events
SELECT
    (random() * 10000)::bigint,
    now() - (random() * interval '30 days'),
    'click',
    '{}'::jsonb
FROM generate_series(1, 1000000);
ANALYZE events;
```

이 인덱스에서 다음 쿼리들은 어떻게 걸릴까요?

```sql
-- (1) 선두 컬럼 equality + 두 번째 컬럼 range: 최적
EXPLAIN SELECT * FROM events
WHERE user_id = 1234 AND created_at > now() - interval '1 day';
```

```
Index Scan using events_user_id_created_at_idx on events
  Index Cond: ((user_id = 1234) AND (created_at > ...))
```

```sql
-- (2) 두 번째 컬럼만: 예전 버전에서는 Seq Scan, PG 18부터는 경우에 따라 skip scan
EXPLAIN SELECT * FROM events
WHERE created_at > now() - interval '1 day';
```

```
Seq Scan on events
  Filter: (created_at > ...)
```

왜 (2)가 인덱스를 못 타거나 효과적으로 쓰지 못하는지는 인덱스가 정렬된 방식을 생각하면 즉시 이해됩니다. `(user_id, created_at)` 인덱스는 **user_id로 먼저 정렬되고, 같은 user_id 안에서만 created_at으로 정렬**됩니다. 전체로 봤을 때 created_at은 정렬돼 있지 않습니다. 특정 시간대에 해당하는 엔트리를 찾으려면 리프 체인 전체를 훑어야 하는데, 그럴 바엔 힙을 순차 스캔하는 게 싸다는 게 플래너의 판단입니다.

PG 18부터는 이 상황을 도와주는 **skip scan** 최적화가 추가됐습니다. 선두 컬럼의 각 distinct 값을 플래너가 "뛰어가며" 뒷 컬럼의 조건을 적용하는 방식입니다. 선두 컬럼의 distinct 값이 적거나(예: `is_deleted`처럼 2-3개 값) 아예 조건이 없을 때 특히 유리합니다. 반대로 선두 컬럼 distinct가 수천 수만이면 매 값마다 트리를 다시 내려가야 해서 비용이 커지고, 플래너가 선택하지 않는 경우가 많습니다. 이 경우엔 `(created_at)` 단독 인덱스를 따로 만드는 게 정답입니다.

그래서 composite index 설계의 실무 규칙은 간단합니다.

- **쿼리 패턴이 먼저다.** "이 컬럼 조합으로 항상 묻는다"가 있을 때만 composite으로 만든다
- **순서는 equality → equality → range.** equality 조건이 먼저 와야 뒤 컬럼의 정렬이 살아난다
- **선두 컬럼에 안 걸리는 쿼리는 인덱스를 못 쓴다.** skip scan은 보너스, 설계 원칙으로 기대하면 안 된다

`(user_id, created_at)`이 있는데 `WHERE user_id = ?`만 쓰는 쿼리가 있다면 그 쿼리도 인덱스를 탈 수 있습니다. prefix만 써도 나머지 컬럼은 "모든 값"으로 해석되기 때문입니다. 반대로 `WHERE created_at = ?` 단독은 prefix를 건너뛰므로 인덱스를 못 씁니다(앞서 본 skip scan 예외 제외).

## Index-Only Scan과 Visibility Map

`SELECT id FROM t_idx WHERE id BETWEEN 50000 AND 50500`처럼 **인덱스 키 안에 필요한 모든 컬럼이 이미 들어있는** 쿼리를 생각해봅시다. 리프 엔트리에 id 값과 ctid가 있으니, 힙을 안 읽고 바로 결과를 돌려주면 됩니다. 이게 **Index-Only Scan**입니다.

그런데 여기서 지난 글의 MVCC가 다시 발목을 잡습니다. 인덱스에는 xmin/xmax가 없습니다. 리프 엔트리가 가리키는 ctid의 튜플이 내 snapshot에서 보이는 튜플인지, 아니면 이미 죽은 튜플인지를 인덱스만 봐서는 알 수 없습니다. 그래서 순진하게 구현하면 "인덱스에서 키를 찾고 → 힙으로 가서 가시성 확인"이 되어 결국 힙을 읽어야 하고, Index-Only Scan의 의미가 사라집니다.

PostgreSQL이 이 문제를 푸는 방식이 **Visibility Map(VM)**입니다. 각 힙 페이지마다 "이 페이지의 모든 튜플이 모든 트랜잭션에게 보이는 상태다"라는 비트를 하나 달아둡니다. 이 비트가 서 있으면 "여긴 어떤 snapshot으로 읽어도 모든 튜플이 보이니까 안심하고 인덱스만 써라"가 되고, 서 있지 않으면 "여긴 아직 불확실하니 힙을 읽어 가시성을 확인해라"가 됩니다.

VM 비트를 세우는 것은 **VACUUM**의 일입니다. autovacuum이 돌면서 한 페이지의 모든 튜플이 충분히 오래전에 커밋되었다는 걸 확인하면 VM에 all-visible 비트를 세웁니다. 반대로 그 페이지에 UPDATE나 DELETE가 한 번이라도 일어나면 비트는 즉시 꺼집니다.

그 결과가 `EXPLAIN (ANALYZE, BUFFERS)`에 숫자로 찍힙니다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM t_idx WHERE id BETWEEN 50000 AND 50500;
```

```
Index Only Scan using t_idx_pkey on t_idx
  Index Cond: ((id >= 50000) AND (id <= 50500))
  Heap Fetches: 0
  Buffers: shared hit=5
```

`Heap Fetches: 0`이 핵심입니다. 501개의 row를 뽑는데 힙을 한 번도 안 읽었다는 뜻이고, Index-Only Scan이 진짜로 그대로 작동한 경우입니다. 반대로 방금 UPDATE를 친 뒤 VACUUM을 안 돌린 테이블에서는 `Heap Fetches: 501` 같은 숫자가 나와서, 이름만 Index-Only Scan이지 실제로는 매 튜플마다 힙을 읽고 있습니다. VACUUM이 VM 비트를 어떻게 세우는지는 뒤에 별도 글에서 다룹니다.

**INCLUDE로 covering index 만들기.** PG 11부터 `INCLUDE` 절로 검색 키가 아닌 컬럼을 인덱스 리프에 얹을 수 있습니다.

```sql
CREATE INDEX ON orders (customer_id) INCLUDE (total_amount, status);
```

`WHERE customer_id = ?`로 검색하면서 `SELECT total_amount, status`를 돌려받으면, 두 컬럼이 리프에 함께 저장되어 있으므로 Index-Only Scan으로 해결됩니다. `total_amount`, `status`는 정렬에 쓰이지 않고 단순히 payload로 얹히는 거라 B-tree의 정렬 규칙을 깨지 않습니다. 인덱스 크기는 커지지만, 자주 나가는 SELECT 몇 컬럼을 함께 돌려보내야 하는 경우에 효과적입니다.

## Partial index, expression index

두 가지 변형이 실무에서 자주 등장합니다.

**Partial index**는 조건을 건 인덱스입니다. 예를 들어 논리 삭제를 쓰는 시스템에서 `deleted_at IS NULL`인 레코드만 인덱싱하면:

```sql
CREATE INDEX idx_users_active_email
ON users (email)
WHERE deleted_at IS NULL;
```

인덱스 크기가 active 레코드 크기로만 한정되고, INSERT/UPDATE 때의 인덱스 유지 비용도 그만큼만 지출됩니다. 다만 쿼리가 **인덱스의 predicate를 포함하는 조건**을 써야 플래너가 이 인덱스를 선택합니다. `WHERE email = 'x@y.com' AND deleted_at IS NULL`처럼 명시하거나, `WHERE email = 'x@y.com'`만 써도 플래너가 predicate를 유추할 수 있는 경우에만 쓰입니다.

**Expression index**는 함수/표현식 결과를 인덱싱합니다.

```sql
CREATE INDEX idx_users_lower_email ON users (LOWER(email));

-- 이 쿼리는 인덱스를 탑니다
SELECT * FROM users WHERE LOWER(email) = 'kim@example.com';

-- 이 쿼리는 인덱스를 못 탑니다 (표현식이 불일치)
SELECT * FROM users WHERE email = 'kim@example.com';
```

case-insensitive 검색에서 전형적으로 쓰입니다. 마찬가지로 쿼리의 표현식이 인덱스 정의와 정확히 맞아야 합니다.

## LIKE와 B-tree의 궁합

앞에서 얘기한 마지막 현상입니다. `LIKE 'foo%'`는 인덱스를 타는데 `LIKE '%bar'`는 안 탑니다.

이유는 B-tree가 정렬된 자료구조라는 점에서 바로 따라나옵니다. `'foo%'`는 "foo로 시작하는" 문자열을 찾는 것이고, 정렬 순서로 보면 연속된 구간 `['foo', 'fop')`을 뽑는 range 쿼리와 동치입니다. B-tree는 연속된 range에 강합니다.

`'%bar'`는 "bar로 끝나는" 문자열인데, 정렬 순서 어디에도 연속된 구간이 아닙니다. `'abar'`, `'zbar'`, `'hmbar'`가 전부 다른 위치에 흩어져 있습니다. 이걸 B-tree로 찾으려면 리프 전체를 훑는 수밖에 없고, 그럴 거면 힙을 Seq Scan 하는 게 낫습니다.

한 가지 실무 함정이 있습니다. C locale이 아닌 환경에서 `LIKE 'foo%'`를 인덱스로 쓰려면 `text_pattern_ops` opclass로 인덱스를 만들어야 합니다.

```sql
CREATE INDEX idx_users_email_pattern ON users (email text_pattern_ops);
```

기본 B-tree는 locale-aware 비교(예: 한글 초성 정렬)를 쓰는데, 이 비교는 `'foo%'` range가 연속되는지 보장하지 못합니다. `text_pattern_ops`는 순수 바이트 비교로 정렬하므로 LIKE prefix match가 항상 range로 번역됩니다. 반대로 이 인덱스로는 `ORDER BY email`이 원하는 한글 정렬 순서가 안 나옵니다. 둘을 다 쓰려면 인덱스를 둘 만들어야 합니다.

## Deduplication: 같은 키가 많을 때

PG 13에서 들어온 B-tree 최적화입니다. 예를 들어 `status` 컬럼 같은 low-cardinality 컬럼에 인덱스를 걸면, 같은 키가 수만 번 반복됩니다. 예전에는 모든 엔트리가 `(status='active', ctid)` 쌍으로 하나씩 저장되어 공간을 많이 썼습니다.

PG 13부터는 같은 키를 가진 엔트리들을 **posting list 하나로 묶어** `(status='active', [ctid1, ctid2, ctid3, ...])` 형태로 저장합니다. 인덱스 크기가 크게 줄어들고 캐시 효율도 올라갑니다.

몇 가지 제약은 있습니다. UNIQUE 인덱스에서는 제한적으로만 동작합니다(대부분 MVCC 버전 변동을 흡수하는 용도). non-deterministic collation이나 일부 타입에서는 비활성됩니다. 그리고 `pg_upgrade`로 올라온 기존 인덱스는 `REINDEX`를 해야 이 최적화가 적용됩니다. 운영 중 새로 만드는 인덱스라면 신경 쓸 일은 거의 없고, 기본 동작으로 켜져 있습니다.

## 실전 체크리스트

composite index 설계 또는 Index-Only Scan이 기대대로 안 걸릴 때 점검할 4가지입니다.

1. **쿼리의 `WHERE` 조건에 인덱스의 선두 컬럼이 있는가.** 없으면 PG 18의 skip scan에 기대지 말고 별도 인덱스를 고려한다
2. **`SELECT` 컬럼이 인덱스 + `INCLUDE` 안에 전부 있는가.** 한 컬럼이라도 누락되면 Index-Only Scan이 아니라 Index Scan이 된다
3. **`Heap Fetches`가 0인가.** 0이 아니면 VM이 최신이 아니라는 뜻이다. bulk write 직후면 `VACUUM` 한 번으로 해소되는 경우가 많다
4. **locale과 pattern_ops.** `LIKE 'prefix%'`를 인덱스로 쓰고 싶은데 기본 인덱스로 안 걸리면 opclass 확인

## 마치며

인덱스가 디스크에 어떻게 올라가 있고, 한 쿼리가 루트부터 리프까지 어떻게 걸어가는지가 이제 보입니다. 선두 컬럼 규칙, Index-Only Scan이 VM에 의존하는 이유, LIKE의 궁합까지, 겉보기에 서로 달라 보이던 현상들이 모두 "B-tree는 정렬된 자료구조"라는 한 문장으로 설명됩니다.

다음 글에서는 B-tree가 못 하는 문제들을 봅니다. JSONB 포함 관계 조회, 전문 검색, 시계열 대용량 테이블, 지리 공간. 이 영역에서 GIN, GiST, BRIN, Hash가 각각 어떤 자료구조로 다른 접근 방식을 제공하는지 따라갑니다.
