---
date: '2026-04-22'
title: 'PostgreSQL 병렬 쿼리와 파티셔닝'
category: 'Database'
series: 'postgres'
seriesOrder: 8
tags: ['PostgreSQL', 'Parallel Query', 'Partitioning', 'Query Performance']
summary: '대용량 테이블을 나눠 처리하는 두 가지 방식, 병렬 쿼리와 파티셔닝을 비교합니다. 병렬이 언제 켜지고 왜 안 켜지는지, 파티션 pruning이 걸리는 조건과 자주 놓치는 함정, 그리고 두 메커니즘이 만났을 때 어떤 효과가 나는지 짚어봅니다.'
thumbnail: './thumbnail.png'
---

1억 행짜리 로그 테이블에 `SELECT COUNT(*)`를 날렸을 때, 어떤 실행에서는 `EXPLAIN ANALYZE`에 `Parallel Seq Scan`과 `Gather` 노드가 찍혀 8초에 끝납니다. 파라미터 값이 조금 달라지거나 통계가 갱신되면 같은 쿼리가 병렬 없이 20초가 걸리기도 합니다. `created_at` 기준으로 RANGE 파티션을 만들어둔 테이블에 `WHERE created_at > '2026-04-01'`을 걸었는데, `EXPLAIN`을 보니 모든 파티션이 스캔되기도 합니다.

두 현상은 모두 PostgreSQL이 **대용량 데이터를 쪼개서 처리하는 두 가지 방식**과 맞닿아 있습니다. 하나는 **병렬 쿼리**로, 테이블 자체는 그대로 두고 실행 엔진이 여러 worker 프로세스에 작업을 나눠 줍니다. 다른 하나는 **파티셔닝**으로, 테이블을 아예 물리적인 조각들로 쪼개서 쿼리 조건에 해당하는 조각만 읽게 만듭니다. 둘 다 "데이터를 쪼갠다"는 공통 목적을 갖지만 작동하는 층이 다르고, 켜지는 조건도 다릅니다.

이 글에서는 병렬 쿼리가 언제 켜지고 왜 안 켜지는지, 파티션 pruning이 걸리는 조건과 자주 놓치는 함정, 그리고 두 메커니즘이 만났을 때 어떤 효과가 나는지 순서대로 봅니다. [지난 글에서 다룬 조인 알고리즘](/postgres/join-algorithms/)이 여기서도 이어지는데, 병렬 쿼리에도 Parallel Hash Join이 들어오고, 파티셔닝된 두 테이블을 같은 파티션 키로 나눠 대응되는 조각끼리만 조인하는 partition wise join이라는 별도 최적화도 붙기 때문입니다.

## 쪼개기의 두 축

비교를 위해 두 축을 먼저 표로 정리합니다.

| 구분 | 병렬 쿼리 | 파티셔닝 |
|------|-----------|----------|
| 쪼개는 주체 | 실행 엔진 (런타임) | 테이블 정의 (DDL) |
| 쪼개는 시점 | 쿼리 실행 중 | 테이블 생성·데이터 적재 시점 |
| 쪼개는 대상 | 스캔·조인·집계 작업 | 물리적인 행 저장소 |
| 주된 효과 | CPU 멀티코어 활용 | I/O 절감 (읽을 조각만 읽음) |
| 잘 맞는 상황 | 큰 테이블 전체를 훑는 집계 | 시계열, 조건이 파티션 키로 자주 좁혀지는 경우 |

두 방식은 겹치기도 하지만 본질이 다릅니다. 병렬은 "어차피 다 읽을 거면 여러 코어가 나눠 읽자"이고, 파티셔닝은 "애초에 다 읽을 필요 없게 나눠 저장하자"입니다.

## 병렬 쿼리

### 구조: Leader와 worker

병렬 쿼리가 켜지면 PostgreSQL은 원래 쿼리를 돌리는 **leader 프로세스** 외에 **worker 프로세스**를 추가로 fork해서 스캔·조인·집계의 일부를 나눠서 수행합니다. `EXPLAIN ANALYZE`에서는 이렇게 보입니다.

```
 Finalize HashAggregate  (cost=... rows=3)
   ->  Gather  (cost=... rows=6)
         Workers Planned: 2
         Workers Launched: 2
         ->  Partial HashAggregate  (cost=... rows=3)
               ->  Parallel Seq Scan on logs  (cost=... rows=4166667)
```

읽는 순서는 여전히 안쪽부터입니다.

- 가장 안쪽 `Parallel Seq Scan` — worker마다 전체 테이블의 일부 블록을 할당받아 스캔합니다. 한 블록은 한 worker만 읽도록 shared memory에서 조율됩니다.
- `Partial HashAggregate` — 각 worker(그리고 leader)가 자기 조각에 대해 부분 집계를 만듭니다.
- `Gather` — leader가 worker들의 tuple queue에서 부분 집계 결과를 모읍니다. `Workers Planned: 2`는 플래너가 2명을 쓰겠다고 했고, `Workers Launched: 2`는 실제로 2명이 뜬 상태입니다.
- `Finalize HashAggregate` — leader가 부분 집계들을 최종 합칩니다.

이 예시처럼 부분 집계가 해시 기반이면 `Gather` + `Finalize HashAggregate`가 붙습니다. 반면 부분 집계가 정렬 순서를 갖는 경우(정렬된 입력을 요구하는 `GroupAggregate`, 또는 `ORDER BY`가 위에 있는 경우)에는 정렬된 스트림을 유지하며 합치기 위해 `Gather Merge`가 쓰입니다.

### 언제 켜지는가

병렬 쿼리는 **자동으로 켜지거나 꺼집니다**. 결정은 플래너가 합니다. 켜지는 조건은 크게 세 가지입니다.

1. **대상 테이블 크기 ≥ `min_parallel_table_scan_size`** (기본 8MB). 인덱스 스캔이면 `min_parallel_index_scan_size`(기본 512kB)를 봅니다.
2. **병렬로 추가된 오버헤드(`parallel_setup_cost=1000`, `parallel_tuple_cost=0.1`)를 감수할 만큼 총 cost가 크다고 추정됨.**
3. **해당 쿼리 노드가 병렬 안전함** (`PARALLEL SAFE` 함수만 사용 등).

세 조건이 AND로 붙어서 하나라도 빠지면 병렬이 꺼집니다. 그래서 "같은 쿼리가 어느 날은 병렬, 어느 날은 단일"인 상황이 생깁니다. 추정 결과가 작으면 병렬이 해제되고, 통계가 갱신되거나 데이터가 불어나면 다시 켜집니다.

흔히 놓치는 비활성 조건들도 있습니다.

- **DML 안쪽 쿼리** — `INSERT ... SELECT`의 SELECT 쪽은 일찍부터 병렬이 가능했고, INSERT 자체의 병렬 수행은 PG 14부터 들어왔습니다. `UPDATE`/`DELETE`는 현재(PG 16 기준)까지도 직렬로 돌아갑니다.
- **`SELECT ... FOR UPDATE` / `FOR SHARE`** — 행 락을 걸어야 하므로 병렬 비활성.
- **커서 내부 쿼리** — 전통적으로 병렬이 비활성이었고, PG 15부터 일부 fetch 패턴에 한해 완화됐습니다. 완전히 다 되는 건 아닙니다.
- **사용자 정의 함수가 `PARALLEL UNSAFE`** — 기본값이 unsafe라 `CREATE FUNCTION` 시 명시하지 않으면 그 함수를 쓴 쿼리는 병렬 불가.

### 실험: 병렬 on/off 체감하기

직접 확인해봅니다.

```sql
CREATE TABLE logs (
    id bigserial PRIMARY KEY,
    created_at timestamptz,
    level text,
    msg text
);

INSERT INTO logs (created_at, level, msg)
SELECT
    now() - (random() * interval '365 days'),
    (ARRAY['INFO','WARN','ERROR'])[floor(random()*3)::int + 1],
    'message ' || g
FROM generate_series(1, 10000000) g;
ANALYZE logs;
```

1천만 행을 넣은 뒤 집계를 돌립니다.

```sql
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT level, COUNT(*) FROM logs GROUP BY level;
```

```
 Finalize HashAggregate
   ->  Gather
         Workers Planned: 2
         Workers Launched: 2
         ->  Partial HashAggregate
               ->  Parallel Seq Scan on logs  (rows=4166667)
 Execution Time: 612.451 ms
```

같은 쿼리를 병렬을 꺼놓고 돌려봅니다.

```sql
SET max_parallel_workers_per_gather = 0;

EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)
SELECT level, COUNT(*) FROM logs GROUP BY level;
```

```
 HashAggregate
   ->  Seq Scan on logs  (rows=10000000)
 Execution Time: 1843.228 ms
```

`Workers Launched` 라인이 사라지고 실행 시간은 약 3배가 됐습니다. worker 2명에 leader 1명까지 세 개의 실행 흐름이 일을 나눠 처리한 만큼 거의 선형에 가깝게 빨라진 셈입니다. 단, 실제 scaling은 테이블 크기·쿼리 모양·I/O 상황에 따라 들쭉날쭉합니다. worker를 4명, 8명으로 늘린다고 같은 배수만큼 빨라지진 않습니다.

### 관련 GUC

병렬과 관련된 파라미터는 서로 얽혀 있습니다.

| 파라미터 | 기본값 | 역할 |
|----------|--------|------|
| `max_worker_processes` | 8 | 서버 전체가 띄울 수 있는 background worker 상한 |
| `max_parallel_workers` | 8 | 그중 병렬 쿼리용으로 쓸 수 있는 상한 |
| `max_parallel_workers_per_gather` | 2 | `Gather` 노드 하나가 쓸 수 있는 worker 상한 |
| `min_parallel_table_scan_size` | 8MB | 이 크기 이하 테이블은 병렬 후보 제외 |
| `parallel_setup_cost` | 1000 | worker 시작 오버헤드 cost 반영값 |

운영 현장에서 자주 만지는 건 `max_parallel_workers_per_gather`입니다. 기본 2가 보수적이라 집계 쿼리가 많은 OLAP성 워크로드에서는 4~8로 올려 쓰는 경우가 많습니다. 단, 커넥션 수 × per_gather × `Gather` 노드 수가 서버 전체 `max_parallel_workers`를 넘으면 뒷 쿼리들은 worker 요청이 거절돼 단일로 떨어집니다.

## 파티셔닝

### 구조: 부모와 자식

파티셔닝은 한 테이블을 **논리적으로 하나**, **물리적으로 여러 조각**으로 쪼개는 기능입니다. 부모 테이블은 스키마만 들고 있고, 데이터는 각 자식 파티션에 저장됩니다.

```sql
CREATE TABLE logs (
    id bigserial,
    created_at timestamptz NOT NULL,
    level text,
    msg text
) PARTITION BY RANGE (created_at);

CREATE TABLE logs_2026_03 PARTITION OF logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE logs_2026_04 PARTITION OF logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE logs_2026_05 PARTITION OF logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

`pg_class`에서 보면 부모는 `relkind='p'`(partitioned table), 자식은 `relkind='r'`(ordinary table)입니다. INSERT는 부모로 들어가고 파티션 키에 따라 자동으로 적절한 자식으로 라우팅됩니다.

파티션 전략은 세 가지입니다.

| 전략 | 키 형태 | 대표 사례 |
|------|---------|-----------|
| RANGE | 범위 | 시계열 (월·주 단위 로그) |
| LIST | 특정 값 집합 | 지역·카테고리 등 범주형 |
| HASH | 해시 값 | 균등 분산이 필요한 키 (user_id) |

실전에서는 RANGE가 압도적으로 많이 쓰입니다. 오래된 파티션을 통째로 `DROP`해서 데이터 보관 정책을 구현하는 운영 방식과 궁합이 좋기 때문입니다.

### 효과의 핵심: Partition pruning

파티셔닝의 진짜 이득은 **pruning**에서 나옵니다. 쿼리 조건이 특정 파티션에만 해당된다는 걸 플래너가 알아채면, 나머지 파티션은 plan에서 아예 빠집니다. 안 읽힙니다.

```sql
EXPLAIN
SELECT COUNT(*) FROM logs WHERE created_at >= '2026-04-15';
```

```
 Aggregate
   ->  Append
         ->  Seq Scan on logs_2026_04 logs_1
               Filter: (created_at >= '2026-04-15')
         ->  Seq Scan on logs_2026_05 logs_2
               Filter: (created_at >= '2026-04-15')
```

3, 4, 5월 세 파티션 중 `logs_2026_03`이 plan에서 제외됐습니다. 플래너가 "3월 파티션은 `< 2026-04-01`이니 `>= 2026-04-15` 조건과 겹치지 않는다"고 판단한 결과입니다. 이게 **plan-time pruning**입니다.

PG 11부터는 **execution-time pruning**도 붙었습니다. 파라미터 바인딩되는 값이 실행 시점에 정해지는 prepared statement나 `EXISTS` 서브쿼리에서, 플래너가 미리 파티션을 확정할 수 없어도 실행 도중에 제외가 일어납니다. `EXPLAIN ANALYZE`에서 제외된 파티션의 노드에 `never executed`가 표시되는 것으로 관찰할 수 있습니다(plan-time pruning은 해당 파티션이 plan에서 아예 빠지고, `Subplans Removed: N`으로 요약됩니다).

### Pruning이 안 되는 흔한 함정

생각만큼 pruning이 안 걸릴 때가 많은데, 원인은 몇 가지로 수렴합니다.

**1. 파티션 키를 함수로 감싼 조건**

```sql
-- created_at 대신 date(created_at)을 쓰면 pruning이 안 걸린다
EXPLAIN
SELECT COUNT(*) FROM logs WHERE date(created_at) = '2026-04-15';
```

`date(created_at)`은 플래너 입장에서 원본 컬럼과 다른 값입니다. 모든 파티션을 스캔합니다. 해법은 함수를 걷어내고 범위로 쓰는 것입니다.

```sql
WHERE created_at >= '2026-04-15' AND created_at < '2026-04-16'
```

**2. 타임존이 섞인 비교**

```sql
-- 파티션 경계는 'YYYY-MM-01' timestamptz로 잡혀 있는데
-- 쿼리 쪽에서 date 타입이나 다른 타임존 문자열이 섞여 들어오면
SELECT COUNT(*) FROM logs
WHERE created_at >= '2026-04-15'::date;
```

`date` ↔ `timestamptz` 암묵적 변환은 세션 타임존에 의존하는 `STABLE` 함수로 처리됩니다. 플랜 시점에 상수로 확정되지 않으면 plan-time pruning이 막히고 execution-time pruning으로 넘어가는데, 런타임 상황에 따라 기대만큼 조각이 잘려 나가지 않을 수 있습니다. 파티션 키 타입과 정확히 일치하는 리터럴을 쓰는 쪽이 안전합니다.

**3. prepared statement의 generic plan**

같은 쿼리를 여러 번 실행하면 PostgreSQL이 값 무관 generic plan으로 캐싱할 수 있는데, 이때 plan-time pruning이 어려워집니다. 대신 execution-time pruning이 보완하지만, 일부 조건에서는 둘 다 약해집니다. 문제 상황이면 `plan_cache_mode = force_custom_plan`을 세션에 걸어보고 차이를 확인합니다.

### 현실 제약

파티셔닝은 공짜가 아닙니다. 알고 쓰지 않으면 오히려 손해입니다.

- **글로벌 UNIQUE 제약 없음**: `PRIMARY KEY`와 `UNIQUE`는 파티션 키를 포함할 때만 만들 수 있습니다. `id bigserial`만으로 PK를 걸면 실패합니다. 파티션 키와 함께 복합 PK를 만들거나 `id` 단독 유일성을 애플리케이션에서 보장해야 합니다.
- **인덱스는 파티션마다**: PG 11+에서 부모에 `CREATE INDEX`하면 자식들에 자동 전파되지만, 물리적으로는 각 파티션에 별도 인덱스가 만들어집니다. 크기 합계는 파티션을 안 했을 때와 비슷하거나 조금 더 큽니다.
- **파티션 개수가 많으면 planning 오버헤드**: 수천 개 넘어가면 plan 시간이 눈에 띄게 늘어납니다. 한 파티션이 너무 작아지지 않도록 주기를 조절합니다(월 단위가 무난, 일 단위는 오래 쌓이면 과잉).
- **파티션 키를 바꾸는 UPDATE**: PG 11부터 허용되지만 내부적으로 DELETE + INSERT로 처리돼 비쌉니다. 파티션 키 자체는 가급적 변경 없는 값(`created_at` 같은)으로 잡습니다.

## 병렬 × 파티셔닝

두 기능이 맞물리면 몇 가지 추가 최적화가 가능합니다.

- **Parallel Append** (PG 11+): `Append` 노드 아래 여러 파티션 스캔을 worker들이 나눠서 동시에 수행합니다. "파티션 10개를 worker 4명이 나눠 훑는다"는 조합이 가능해집니다.
- **Partitionwise Join** (PG 11+, 기본 off): 같은 파티션 기준으로 나뉜 두 테이블을 조인할 때, 대응되는 파티션끼리만 조인합니다. `enable_partitionwise_join = on`으로 켜야 합니다.
- **Partitionwise Aggregate**: 파티션별로 부분 집계한 뒤 합치는 최적화. `enable_partitionwise_aggregate = on`.

기본 off인 partitionwise 옵션들을 켜면 plan 선택지가 넓어지는 만큼 planning 비용도 같이 늘어나기 때문에 파티션 수가 많은 환경에서는 도입 전 실측이 필요합니다.

## 실전에서는

**1. "큰 테이블 집계가 느리다" → `Workers Launched` 라인부터 확인.** 병렬이 아예 안 켜진 상태라면 쿼리 비용 추정이 작거나 `PARALLEL UNSAFE` 함수가 섞였을 가능성입니다. 테이블 크기가 `min_parallel_table_scan_size` 위인지도 같이 봅니다.

**2. "파티션 pruning이 안 된다" → `EXPLAIN`의 Append 밑 자식 노드 개수 확인.** 파티션 키에 함수/CAST가 씌워졌는지, prepared statement의 generic plan 때문인지, 파티션 키가 조건에 등장은 하는지 순서로 봅니다.

**3. "파티션을 몇 개로 쪼갤까" → 한 파티션이 수 GB 범위, 총 개수는 수십~100여 개가 일반적.** 수백 개를 넘기면 plan 시간을 확인해야 하고, 일 단위로 쪼개면 1년만 지나도 365개가 되어 planning 오버헤드가 체감됩니다.

**4. "병렬이 켜졌는데도 기대만큼 안 빠르다" → I/O 병목 의심.** worker 4명이 있어도 디스크 I/O가 병목이면 선형 scaling이 안 됩니다. `EXPLAIN (ANALYZE, BUFFERS)`의 `shared read` 값, iostat 결과를 같이 봅니다.

## 흔한 오해

- **"파티션 키에는 자동으로 인덱스가 붙는다"** — 아닙니다. 파티션 키로 범위 조건을 걸어도, 그 범위 안에서 특정 행을 빠르게 찾으려면 별도 인덱스가 필요합니다. Pruning은 "어떤 파티션을 읽을지"만 결정하고, 그 파티션 안을 탐색하는 건 여전히 인덱스의 영역입니다.
- **"병렬이 켜지면 무조건 빠르다"** — worker 시작과 tuple queue 전송 비용이 있어 결과가 작거나 이미 인덱스로 좁혀지는 쿼리는 오히려 손해입니다.
- **"파티션을 많이 쪼갤수록 빠르다"** — pruning이 잘 걸릴 때만 그렇습니다. 개수가 많아지면 plan 시간이 늘고, partitionwise 최적화의 planning 비용도 비례해 커집니다.
- **"파티셔닝하면 VACUUM 부담이 줄어든다"** — 파티션마다 autovacuum이 돌아야 해서 총 부담은 오히려 늘어납니다. 대신 오래된 파티션을 통째로 `DROP TABLE`해서 대량 DELETE를 대체할 수 있다는 운영상 이점이 분리해서 존재합니다. 이건 다음 글의 주제와도 이어집니다.

## 마치며

병렬 쿼리와 파티셔닝은 둘 다 "데이터를 쪼개 처리한다"는 공통 목적을 갖지만, 하나는 실행 시점에 CPU를 나눠 쓰는 전략이고 다른 하나는 저장 시점부터 테이블 자체를 나누는 전략입니다. 같은 큰 테이블이라도 집계가 주라면 병렬이, 조건이 파티션 키로 자주 좁혀진다면 파티셔닝이 자연스러운 선택입니다. 두 기능은 배타적이지 않아서 Parallel Append 같은 조합도 가능합니다.

여기까지가 Phase 2의 마지막 편입니다. 인덱스에서 시작해 통계, 조인, 쪼개기까지 단일 쿼리가 빨라지는(혹은 느려지는) 축들을 훑어왔습니다. 다음 글부터는 동시성과 내구성 쪽으로 방향을 틉니다. 첫 주제는 **VACUUM과 bloat**입니다. MVCC가 남긴 dead tuple을 누가, 언제, 어떻게 치우는지, 왜 운영 환경에서 VACUUM이 쉽게 말썽의 중심이 되는지 다룹니다.
