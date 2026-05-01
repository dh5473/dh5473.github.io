---
date: '2026-04-21'
title: 'PostgreSQL 조인 알고리즘: Nested Loop, Hash Join, Merge Join'
category: 'Database'
series: 'postgres'
seriesOrder: 7
tags: ['PostgreSQL', 'Join', 'Query Performance', 'work_mem']
summary: '같은 JOIN 쿼리가 왜 어떤 날은 Nested Loop, 어떤 날은 Hash Join이 되는지, work_mem이 Hash Join의 성능을 좌우하는 이유, 그리고 플래너가 조인 순서를 결정하는 원리를 세 알고리즘의 cost 공식과 함께 따라갑니다.'
thumbnail: './thumbnail.png'
---

`users JOIN orders ON o.user_id = u.id`에 `WHERE u.id = 42`를 붙이면 Nested Loop가 나오고, `WHERE u.created_at > '2026-01-01'`로 바꾸면 Hash Join이 됩니다. `work_mem`을 4MB에서 16MB로 올렸을 뿐인데 같은 쿼리가 10배 빨라집니다. 테이블 세 개를 조인할 때 순서를 바꿔 쓰면 `EXPLAIN`의 cost가 100배 차이 나는 경우도 있습니다.

세 상황 모두 플래너가 **조인을 실행하는 방법 세 가지**와 **조인 순서**를 저마다 다르게 고른 결과입니다. PostgreSQL은 JOIN 한 번을 Nested Loop, Hash Join, Merge Join 중 하나로 실행하는데, 각 알고리즘의 cost 공식이 양쪽 입력 크기·인덱스 유무·메모리 한계에서 서로 다르게 반응하기 때문에 같은 SQL이라도 상황에 따라 전혀 다른 plan으로 풀립니다.

이 글에서는 세 알고리즘의 내부 동작, 각각이 언제 이기고 언제 지는지, 그리고 [지난 글에서 다룬 통계](/postgres/planner-statistics/)가 플래너의 선택에 어떻게 연결되는지를 차례로 봅니다.

## 조인은 결국 "두 집합을 어떻게 짝짓는가"

`SELECT u.email, o.amount FROM users u JOIN orders o ON o.user_id = u.id`는 수학적으로 보면 `users × orders` 전체 쌍에서 조건을 만족하는 것만 뽑는 작업입니다. 실제로 모든 쌍을 만들어 확인하면 `|users| × |orders|` 연산이 필요하니, 실행 엔진은 이 비용을 줄이기 위해 **짝을 효율적으로 찾는 전략**을 씁니다.

PostgreSQL이 쓰는 전략은 세 가지입니다.

| 알고리즘 | 한 줄 요약 | 유리한 상황 |
|----------|------------|-------------|
| Nested Loop | 바깥을 순회하면서 각 행마다 안쪽에서 매칭 찾기 | outer가 작고 inner에 인덱스가 있을 때 |
| Hash Join | 작은 쪽으로 해시 테이블을 짓고 큰 쪽에서 probe | 양쪽 다 클 때, `=` 조건, 메모리 충분 |
| Merge Join | 정렬된 두 스트림을 지퍼처럼 맞물리기 | 양쪽이 이미 정렬돼 있을 때 |

플래너는 각 알고리즘에 cost를 매겨 가장 싼 것을 고릅니다. cost 공식이 양쪽 입력 크기와 메모리 한계에 따라 다르게 반응하기 때문에, 같은 쿼리도 조건 값만 바뀌면 알고리즘이 뒤집힙니다.

## Nested Loop: 바깥 × 안쪽

가장 단순한 전략부터 봅니다. 바깥 집합을 한 번 순회하고, 각 행마다 안쪽 집합에서 매칭되는 행을 찾습니다. 의사코드로 쓰면 이렇습니다.

```
for each row r in outer:
    for each row s in inner:
        if match(r, s):
            emit (r, s)
```

순진하게 구현하면 `|outer| × |inner|` 비용입니다. 실전에서 유용한 이유는 **안쪽에 인덱스가 있으면** 안쪽 루프가 인덱스 조회 한 번으로 끝나기 때문입니다. 이 경우 cost는 대략 `outer_rows × inner_index_lookup_cost` 로 줄어듭니다.

실제로 찍어봅니다.

```sql
CREATE TABLE users (id bigserial PRIMARY KEY, email text);
CREATE TABLE orders (id bigserial PRIMARY KEY, user_id bigint, amount numeric);
CREATE INDEX ON orders (user_id);

INSERT INTO users (email) SELECT 'u' || g FROM generate_series(1, 10000) g;
INSERT INTO orders (user_id, amount)
SELECT floor(random() * 10000)::int + 1, random() * 1000
FROM generate_series(1, 100000);
ANALYZE;

EXPLAIN ANALYZE
SELECT u.email, o.amount
FROM users u JOIN orders o ON o.user_id = u.id
WHERE u.id = 42;
```

```
 Nested Loop  (cost=0.42..45.23 rows=10 width=36)
              (actual time=0.021..0.089 rows=9 loops=1)
   ->  Index Scan using users_pkey on users u
         (cost=0.29..8.31 rows=1 width=32)
         Index Cond: (id = 42)
   ->  Index Scan using orders_user_id_idx on orders o
         (cost=0.13..36.82 rows=10 width=12)
         Index Cond: (user_id = 42)
```

outer에서 1행(`id=42`)을 뽑고, 그 1행으로 inner 인덱스를 한 번 타서 9행을 가져왔습니다. 총 비용은 거의 "인덱스 조회 두 번" 수준입니다.

이번엔 outer 조건을 느슨하게 바꿉니다.

```sql
EXPLAIN ANALYZE
SELECT u.email, o.amount
FROM users u JOIN orders o ON o.user_id = u.id
WHERE u.id < 10000;
```

```
 Hash Join  (cost=271.00..2437.00 rows=99900 width=36)
   Hash Cond: (o.user_id = u.id)
   ->  Seq Scan on orders o  (cost=0.00..1834.00 rows=100000 width=12)
   ->  Hash  (cost=196.00..196.00 rows=9999 width=32)
         ->  Seq Scan on users u  (cost=0.00..196.00 rows=9999 width=32)
               Filter: (id < 10000)
```

같은 쿼리지만 outer가 1만 행으로 늘자 플래너가 Hash Join으로 갈아탔습니다. outer가 커지면 Nested Loop의 `outer_rows × inner_lookup` 비용이 선형으로 불어나서, 어느 시점에는 "양쪽을 한 번씩만 훑는" Hash Join이 싸집니다.

### Nested Loop가 위험해지는 지점

Nested Loop의 함정은 **플래너가 outer 크기를 작게 잘못 추정할 때** 나타납니다. 추정 1행이 실제 10만 행이 되면 inner 인덱스를 10만 번 타게 되는데, 그동안 Hash Join이었다면 한 번만 훑고 끝났을 것이기 때문입니다. [통계 갱신 지연이나 상관 컬럼 문제](/postgres/planner-statistics/)로 estimate가 틀어졌을 때 가장 극적으로 느려지는 조인이 바로 Nested Loop입니다.

## Hash Join: 해시 테이블을 짓고 probe한다

Hash Join은 두 단계로 동작합니다.

1. **Build phase** — 더 작은 쪽(build side)을 통째로 훑으면서 조인 키를 해시해 메모리에 해시 테이블을 만듭니다.
2. **Probe phase** — 더 큰 쪽(probe side)을 훑으면서 각 행의 조인 키를 해시해 테이블에서 매칭을 찾습니다.

cost는 `build_rows + probe_rows`로, 양쪽 크기에 선형입니다. Nested Loop와 달리 **곱셈이 아닌 덧셈**이라는 게 핵심입니다. 대신 `=` 조건에만 쓸 수 있습니다. `<`, `LIKE` 같은 조건은 해시로 매칭할 수 없기 때문입니다.

### work_mem 경계: batch split

문제는 해시 테이블이 메모리에 다 안 들어갈 때입니다. `work_mem`(기본 4MB)을 초과하면 PostgreSQL은 양쪽을 해시 값 기준으로 여러 **batch**로 쪼개 디스크에 내려둔 뒤, 한 batch씩 올려가며 처리합니다. batch 수가 늘수록 디스크 I/O가 배로 붙습니다.

`EXPLAIN ANALYZE`에서 직접 확인할 수 있습니다.

```sql
SET work_mem = '64kB';

EXPLAIN (ANALYZE, BUFFERS)
SELECT u.email, o.amount
FROM users u JOIN orders o ON o.user_id = u.id;
```

```
 Hash Join  (...)
   ->  Hash  (cost=196.00..196.00 rows=10000 width=32)
         Buckets: 2048  Batches: 16  Memory Usage: 49kB
         Buffers: shared hit=96, temp read=384 written=384
```

`Batches: 16`이 보이고, `temp read/written` 값이 붙습니다. 해시 테이블을 16조각으로 쪼개 디스크를 16번 오간 겁니다. 이제 `work_mem`을 키웁니다.

```sql
SET work_mem = '16MB';

EXPLAIN (ANALYZE, BUFFERS)
SELECT u.email, o.amount
FROM users u JOIN orders o ON o.user_id = u.id;
```

```
 Hash Join  (...)
   ->  Hash  (...)
         Buckets: 16384  Batches: 1  Memory Usage: 705kB
         Buffers: shared hit=96
```

`Batches: 1`로 떨어지고 `temp` 관련 지표가 사라졌습니다. "work_mem을 올렸더니 쿼리가 빨라졌다"는 체감은 대부분 이 batch 수가 1로 내려간 순간입니다.

다만 `work_mem`은 세션·쿼리·노드별로 곱해져서 할당됩니다. 한 커넥션이 JOIN 노드를 세 개 쓰는 쿼리를 돌리면 최대 `work_mem × 3`을 쓸 수 있고, 여기에 커넥션 수가 곱해지면 서버 메모리가 금세 바닥납니다. 무작정 올릴 수 있는 값이 아닙니다.

## Merge Join: 정렬된 두 스트림 맞물리기

Merge Join은 두 입력이 모두 **조인 키로 정렬**돼 있다는 전제 하에 동작합니다. 정렬된 두 리스트를 동시에 앞에서부터 훑으면서 같은 값이 나오면 매칭 쌍을 만들고, 한쪽이 크면 그쪽을 넘기는 방식입니다.

```
outer: [1, 3, 5, 7, 9]
inner: [2, 3, 5, 8, 9]
        → (3,3), (5,5), (9,9)
```

cost는 `sort_cost_outer + sort_cost_inner + merge_cost`입니다. 양쪽이 이미 B-tree 인덱스로 정렬돼 있거나 `ORDER BY`가 따라붙으면 Sort 비용이 0에 가까워지면서 경쟁력이 생기지만, 그런 상황이 아니면 Sort 비용 때문에 Hash Join에 밀리는 경우가 많습니다. 실전에서는 세 알고리즘 중 가장 적게 보이고, 양쪽 인덱스가 이미 정렬을 제공하거나 non-equality 조인(`a.val BETWEEN b.lo AND b.hi`) 같은 특수 상황에서 쓰입니다. 일반적인 equality JOIN 튜닝에서는 Merge Join 자체를 크게 신경 쓸 일이 많지 않습니다.

## 플래너는 어떻게 고르는가

세 알고리즘에 각각 cost를 계산한 뒤 가장 싼 것을 고르는 건 단일 JOIN 이야기고, 테이블이 여러 개면 **조인 순서**도 함께 정해야 합니다. `A JOIN B JOIN C`를 `(A⋈B)⋈C`로 할지 `A⋈(B⋈C)`로 할지에 따라 중간 결과 크기가 수십 배 달라지고, 중간 결과가 작아야 다음 단계가 싸지기 때문입니다.

PostgreSQL은 두 전략을 씁니다.

- **동적 프로그래밍** — 테이블 수가 `geqo_threshold`(기본 12) 미만이면 가능한 조인 순서 조합을 전부 cost로 비교해 최적을 고릅니다. 이때 명시적 `JOIN` 트리를 얼마나 펼쳐서 탐색 대상에 포함할지는 `join_collapse_limit`(기본 8)이, 서브쿼리를 상위 FROM 리스트로 펼치는 범위는 `from_collapse_limit`(기본 8)이 각각 제어합니다.
- **GEQO**(Genetic Query Optimizer) — 테이블 수가 `geqo_threshold`(기본 12)를 넘으면 조합이 폭발하니 유전자 알고리즘으로 근사해를 찾습니다. 빠르지만 최적해를 놓칠 수 있습니다.

테이블 10개 넘는 JOIN에서 plan이 이상하면 `geqo_threshold`를 올려보거나 `join_collapse_limit`을 키워 탐색 범위를 넓히는 방법, 또는 쿼리를 CTE로 쪼개 조인 블록을 분리하는 방법이 자주 먹힙니다.

PostgreSQL은 MySQL의 `STRAIGHT_JOIN`이나 Oracle의 `/*+ USE_NL */` 같은 **공식 힌트 구문이 없습니다**. 대신 `enable_nestloop = off`, `enable_hashjoin = off` 같은 GUC로 특정 알고리즘을 임시로 막아 대안 plan을 볼 수는 있고, `pg_hint_plan` 확장을 쓰면 힌트 비슷한 지시를 넣을 수 있습니다. 운영에서 GUC를 끄는 건 디버깅용이고, 상시로 쓰는 수단은 아닙니다.

## 실전에서는

조인이 느려 보일 때 확인 순서를 정해두면 원인을 빠르게 좁힐 수 있습니다.

**1. `EXPLAIN ANALYZE`에서 각 JOIN 노드의 추정 행 vs 실제 행을 먼저 본다.** 두 값이 10배 넘게 벌어진 노드가 있으면 문제는 조인 알고리즘이 아니라 **통계**입니다. 선행 작업은 `ANALYZE` 또는 `CREATE STATISTICS`입니다.

**2. Hash Join에서 `Batches`가 2 이상이면 work_mem 부족.** 해당 쿼리만 올려보고 싶으면 세션 단위로 `SET work_mem = '...'`를 걸어 plan이 바뀌는지 확인합니다. 전역으로 올릴 때는 커넥션 수 × JOIN 노드 수를 곱한 메모리 상한을 계산해보고 바꿉니다.

**3. Nested Loop인데 outer 실제 행이 크게 나오면 가장 위험한 상태.** outer estimate가 1로 찍혀 있지만 실제로 수만 행이면, 안쪽 인덱스를 그만큼 반복해서 탑니다. 이 경우 `ANALYZE` 갱신과 상관 컬럼 보정이 우선입니다.

**4. 조인 순서가 이상해 보이면 테이블 수와 `join_collapse_limit` / `geqo_threshold`부터 확인.** 테이블이 `geqo_threshold`(기본 12) 이상이면 GEQO가 돌고 있고, 그 영향일 가능성이 큽니다.

짧게 Materialize와 Memoize 노드도 알아둘 만합니다. Materialize는 Nested Loop의 안쪽 입력이 여러 번 재평가되는 걸 막으려고 중간 결과를 메모리에 잠깐 쌓아두는 노드고, Memoize는 PG 14부터 들어온 LRU 캐시 노드로 안쪽의 자주 쓰이는 키를 기억해 반복 조회를 건너뜁니다. 둘 다 "Nested Loop 안쪽을 저렴하게 만들기"라는 같은 목표의 서로 다른 최적화입니다.

## 흔한 오해

- **"Nested Loop는 항상 나쁘다"** — outer가 1행이고 inner에 인덱스가 있으면 세 알고리즘 중 가장 쌉니다. 문제는 outer estimate가 틀어졌을 때입니다.
- **"Hash Join이 Merge Join보다 항상 빠르다"** — 양쪽이 이미 정렬돼 있고 ORDER BY가 따라붙는 쿼리는 Merge Join이 이깁니다. 빈도가 낮을 뿐 "항상"은 아닙니다.
- **"work_mem을 크게 주면 무조건 이득"** — 쿼리 하나 × 노드 여러 개 × 커넥션 다수로 곱해지는 메모리라 서버가 OOM 나기 쉽습니다. 전역보다 세션·쿼리 단위로 조정하는 편이 안전합니다.
- **"PostgreSQL도 조인 힌트를 준다"** — 공식 문법은 없습니다. GUC나 `pg_hint_plan` 확장이 대안입니다.

## 마치며

세 조인 알고리즘은 각각 다른 cost 공식을 갖고 있고, 플래너는 양쪽 입력 크기·인덱스·메모리 상황을 통계로 추정해 그중 가장 싼 것을 고릅니다. 같은 쿼리가 상황마다 다른 plan으로 풀리는 이유는 이 비교의 결과가 달라지기 때문이고, bad plan 대부분은 알고리즘 자체가 아니라 **추정치가 틀어져서** 발생합니다.

다음 글에서는 한 쿼리를 여러 worker가 나눠 처리하는 **병렬 쿼리**와 테이블을 작게 쪼개 필요한 조각만 스캔하는 **파티셔닝**을 다룹니다. 대용량 데이터를 다루는 두 가지 서로 다른 축을 비교하며 언제 어느 것이 유효한지 살펴봅니다.
