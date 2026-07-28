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

이 글에서는 병렬 쿼리가 언제 켜지고 왜 안 켜지는지, 파티션 pruning이 걸리는 조건과 자주 놓치는 함정, 그리고 두 메커니즘이 만났을 때 어떤 효과가 나는지 순서대로 봅니다. [조인 알고리즘](/postgres/join-algorithms/)은 여기서도 이어집니다. 병렬 쿼리에는 Parallel Hash Join이 들어오고, 파티셔닝된 두 테이블을 같은 파티션 키로 나눠 대응되는 조각끼리만 조인하는 partitionwise join이라는 별도 최적화도 붙기 때문입니다.

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

```text
 Finalize HashAggregate  (cost=... rows=3)
   ->  Gather  (cost=... rows=6)
         Workers Planned: 2
         Workers Launched: 2
         ->  Partial HashAggregate  (cost=... rows=3)
               ->  Parallel Seq Scan on logs  (cost=... rows=4166667)
```

읽는 순서는 여전히 안쪽부터입니다.

- 가장 안쪽 `Parallel Seq Scan`: 각 프로세스가 테이블의 서로 다른 블록 범위를 할당받아 스캔합니다. 한 범위를 다 읽은 프로세스가 shared memory에서 다음 범위를 받아 가는 방식이라 같은 블록을 두 번 읽지 않습니다.
- `Partial HashAggregate`: 각 worker와 leader가 자기 몫에 대해 부분 집계를 만듭니다.
- `Gather`: leader가 worker들의 tuple queue에서 부분 집계 결과를 모읍니다. `Workers Planned: 2`는 플래너가 2명을 쓰겠다고 계획한 값이고, `Workers Launched: 2`는 실행 시점에 실제로 뜬 수입니다.
- `Finalize HashAggregate`: leader가 부분 집계들을 최종 합칩니다.

세 개의 실행 흐름이 어떻게 갈라졌다가 다시 모이는지를 그림으로 보면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 512" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="leader와 worker 두 개가 각각 테이블의 서로 다른 블록 범위를 스캔해 부분 집계를 만들고, 그 결과를 Gather 노드가 모아 Finalize HashAggregate로 넘기는 구조">
<style>
.pq1-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pq1-lead { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0d9488); stroke-width: 2; }
.pq1-role { font-size: 20px; font-weight: 700; fill: var(--text, #1c1917); }
.pq1-roleon { font-size: 20px; font-weight: 700; fill: var(--primary, #0d9488); }
.pq1-op { font-size: 18px; fill: var(--text, #1c1917); }
.pq1-sub { font-size: 17px; fill: var(--text-muted, #78716c); }
.pq1-ttl { font-size: 21px; font-weight: 700; fill: var(--primary, #0d9488); }
.pq1-fin { font-size: 20px; font-weight: 700; fill: var(--text, #1c1917); }
.pq1-ln { stroke: var(--text-muted, #78716c); stroke-width: 1.8; fill: none; }
.pq1-note { font-size: 17px; fill: var(--text-muted, #78716c); }
</style>
<defs>
<marker id="pq1Arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- leader lane -->
<rect class="pq1-lead" x="60" y="20" width="396" height="68" rx="8"/>
<text class="pq1-roleon" x="76" y="50">leader</text>
<text class="pq1-sub" x="76" y="76">블록 약 1/3</text>
<text class="pq1-op" x="196" y="50">Parallel Seq Scan</text>
<text class="pq1-op" x="196" y="76">→ Partial HashAggregate</text>
<!-- worker 1 lane -->
<rect class="pq1-box" x="60" y="104" width="396" height="68" rx="8"/>
<text class="pq1-role" x="76" y="134">worker 1</text>
<text class="pq1-sub" x="76" y="160">블록 약 1/3</text>
<text class="pq1-op" x="196" y="134">Parallel Seq Scan</text>
<text class="pq1-op" x="196" y="160">→ Partial HashAggregate</text>
<!-- worker 2 lane -->
<rect class="pq1-box" x="60" y="188" width="396" height="68" rx="8"/>
<text class="pq1-role" x="76" y="218">worker 2</text>
<text class="pq1-sub" x="76" y="244">블록 약 1/3</text>
<text class="pq1-op" x="196" y="218">Parallel Seq Scan</text>
<text class="pq1-op" x="196" y="244">→ Partial HashAggregate</text>
<!-- collector spine -->
<path class="pq1-ln" d="M 60 54 L 32 54"/>
<path class="pq1-ln" d="M 60 138 L 32 138"/>
<path class="pq1-ln" d="M 60 222 L 32 222"/>
<path class="pq1-ln" d="M 32 54 L 32 345 L 52 345" marker-end="url(#pq1Arw)"/>
<!-- gather -->
<rect class="pq1-lead" x="60" y="318" width="396" height="54" rx="8"/>
<text class="pq1-ttl" x="258" y="343" text-anchor="middle">Gather</text>
<text class="pq1-sub" x="258" y="365" text-anchor="middle">Workers Planned: 2, Launched: 2</text>
<path class="pq1-ln" d="M 258 372 L 258 392" marker-end="url(#pq1Arw)"/>
<!-- finalize -->
<rect class="pq1-box" x="60" y="396" width="396" height="48" rx="8"/>
<text class="pq1-fin" x="258" y="427" text-anchor="middle">Finalize HashAggregate</text>
<!-- notes -->
<text class="pq1-note" x="240" y="472" text-anchor="middle">worker는 요청한 수만큼 못 뜰 수도 있다.</text>
<text class="pq1-note" x="240" y="494" text-anchor="middle">그래서 Launched &lt; Planned 인 경우가 생긴다.</text>
</svg>
</div>

`Workers Planned: 2`인데 일하는 흐름이 셋인 이유는 `parallel_leader_participation`이 기본 `on`이라 leader도 `Gather` 아래 plan을 직접 실행하기 때문입니다. worker 수 2는 leader를 제외한 값입니다. 그리고 요청한 worker가 항상 뜨는 건 아닙니다. 서버 전체 worker 풀이 이미 차 있으면 `Workers Launched`가 `Workers Planned`보다 작게 나오고, plan은 그대로인 채 실제 병렬도만 떨어집니다.

이 예시처럼 부분 집계가 해시 기반이면 `Gather` + `Finalize HashAggregate`가 붙습니다. 반면 부분 집계가 정렬 순서를 갖는 경우(정렬된 입력을 요구하는 `GroupAggregate`, 또는 `ORDER BY`가 위에 있는 경우)에는 정렬된 스트림을 유지하며 합치기 위해 `Gather Merge`가 쓰입니다.

### 언제 켜지는가

병렬 쿼리는 **자동으로 켜지거나 꺼집니다**. 결정은 플래너가 합니다. 켜지는 조건은 크게 세 가지입니다.

1. **대상 테이블 크기 ≥ `min_parallel_table_scan_size`** (기본 8MB). 인덱스 스캔이면 `min_parallel_index_scan_size`(기본 512kB)를 봅니다.
2. **병렬로 추가된 오버헤드를 감수할 만큼 총 cost가 크다고 추정됨.** `parallel_setup_cost`(기본 1000)와 `parallel_tuple_cost`(기본 0.1)가 반영된 병렬 plan의 cost가 직렬보다 낮아야 합니다.
3. **해당 쿼리 노드가 병렬 안전함** (`PARALLEL SAFE` 함수만 사용 등).

세 조건이 AND로 붙어서 하나라도 빠지면 병렬이 꺼집니다. 그래서 "같은 쿼리가 어느 날은 병렬, 어느 날은 단일"인 상황이 생깁니다. 추정 결과가 작으면 병렬이 해제되고, 통계가 갱신되거나 데이터가 불어나면 다시 켜집니다.

흔히 놓치는 비활성 조건들도 있습니다. 아래는 PG 18 기준입니다.

- **데이터를 쓰거나 행을 잠그는 쿼리**: `INSERT`/`UPDATE`/`DELETE`가 최상위에 있든 CTE 안에 있든, 그 쿼리 전체에 병렬 plan이 만들어지지 않습니다. `INSERT ... SELECT`도 예외가 아니라 SELECT 쪽만 병렬로 도는 일은 없습니다. 병렬 INSERT는 PG 14 개발 중에 커밋됐다가 릴리스 전에 되돌려졌고 아직 들어오지 않았습니다. 유일한 예외는 새 테이블을 만들면서 채우는 `CREATE TABLE ... AS`, `SELECT INTO`, `CREATE MATERIALIZED VIEW`, `REFRESH MATERIALIZED VIEW`로, 이때는 밑에 깔린 SELECT가 병렬로 돕니다.
- **`SELECT ... FOR UPDATE` / `FOR SHARE`**: 행 락을 걸기 때문에 위와 같은 이유로 병렬이 꺼집니다.
- **중간에 멈출 수 있는 쿼리**: `DECLARE CURSOR`로 만든 커서는 병렬 plan을 쓰지 않습니다. 부분 실행이 일어날 수 있는 상황이면 플래너가 아예 병렬을 후보에서 뺍니다. PL/pgSQL의 `FOR x IN query LOOP`도 내부적으로 같은 이유로 직렬입니다. 다만 `RETURN QUERY`는 PG 14부터 병렬로 돌 수 있습니다.
- **사용자 정의 함수가 `PARALLEL UNSAFE`**: 기본값이 unsafe라 `CREATE FUNCTION`에 명시하지 않으면 그 함수를 쓴 쿼리는 병렬로 돌지 않습니다.

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
EXPLAIN (ANALYZE, TIMING OFF)
SELECT level, COUNT(*) FROM logs GROUP BY level;
```

```text
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

EXPLAIN (ANALYZE, TIMING OFF)
SELECT level, COUNT(*) FROM logs GROUP BY level;
```

```text
 HashAggregate
   ->  Seq Scan on logs  (rows=10000000)
 Execution Time: 1843.228 ms
```

`Workers Launched` 라인이 사라지고 실행 시간은 약 3배가 됐습니다. worker 2명에 leader 1명까지 세 개의 실행 흐름이 일을 나눠 처리한 만큼 거의 선형에 가깝게 빨라진 셈입니다. 단, 실제 scaling은 테이블 크기·쿼리 모양·I/O 상황에 따라 들쭉날쭉합니다. worker를 4명, 8명으로 늘린다고 같은 배수만큼 빨라지진 않습니다.

### 관련 GUC

병렬과 관련된 파라미터는 서로 얽혀 있습니다. 기본값은 PG 18 기준입니다.

| 파라미터 | 기본값 | 역할 |
|----------|--------|------|
| `max_worker_processes` | 8 | 서버 전체가 띄울 수 있는 background worker 상한 |
| `max_parallel_workers` | 8 | 그중 병렬 쿼리용으로 쓸 수 있는 상한 |
| `max_parallel_workers_per_gather` | 2 | `Gather` 노드 하나가 쓸 수 있는 worker 상한 (0이면 병렬 비활성) |
| `parallel_leader_participation` | on | leader가 `Gather` 아래 plan을 직접 실행할지 |
| `min_parallel_table_scan_size` | 8MB | 이 크기 이하 테이블은 병렬 후보 제외 |
| `parallel_setup_cost` | 1000 | worker 시작 오버헤드 cost 반영값 |

운영 현장에서 자주 만지는 건 `max_parallel_workers_per_gather`입니다. 기본 2가 보수적이라 집계 쿼리가 많은 OLAP성 워크로드에서는 4\~8로 올려 쓰는 경우가 많습니다. 단, 커넥션 수 × per_gather × `Gather` 노드 수가 서버 전체 `max_parallel_workers`를 넘으면 뒷 쿼리들은 worker 요청이 거절돼 단일로 떨어집니다.

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

```text
 Aggregate
   ->  Append
         ->  Seq Scan on logs_2026_04 logs_1
               Filter: (created_at >= '2026-04-15')
         ->  Seq Scan on logs_2026_05 logs_2
               Filter: (created_at >= '2026-04-15')
```

3, 4, 5월 세 파티션 중 `logs_2026_03`이 plan에서 제외됐습니다. 플래너가 "3월 파티션은 `< 2026-04-01`이니 `>= 2026-04-15` 조건과 겹치지 않는다"고 판단한 결과입니다. 이게 **plan-time pruning**입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 380" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="created_at이 2026-04-15 이상이라는 조건에서 3월 파티션은 점선 회색으로 건너뛰고 4월과 5월 파티션만 teal 실선으로 읽는 파티션 프루닝 결과">
<style>
.pp1-q { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pp1-read { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0d9488); stroke-width: 2; }
.pp1-skip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--text-muted, #78716c); stroke-width: 1.6; stroke-dasharray: 7 5; }
.pp1-qt { font-size: 19px; font-weight: 600; fill: var(--text, #1c1917); }
.pp1-name { font-size: 20px; font-weight: 700; fill: var(--text, #1c1917); }
.pp1-nameoff { font-size: 20px; font-weight: 700; fill: var(--text-muted, #78716c); }
.pp1-stat { font-size: 18px; font-weight: 700; fill: var(--primary, #0d9488); }
.pp1-statoff { font-size: 18px; font-weight: 700; fill: var(--text-muted, #78716c); }
.pp1-rng { font-size: 17px; fill: var(--text-muted, #78716c); }
.pp1-mk { fill: none; stroke: var(--primary, #0d9488); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.pp1-mkoff { fill: none; stroke: var(--text-muted, #78716c); stroke-width: 2.6; stroke-linecap: round; }
.pp1-ln { stroke: var(--text-muted, #78716c); stroke-width: 1.8; fill: none; }
.pp1-note { font-size: 17px; fill: var(--text-muted, #78716c); }
</style>
<defs>
<marker id="pp1Arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- query -->
<rect class="pp1-q" x="30" y="12" width="420" height="46" rx="8"/>
<text class="pp1-qt" x="240" y="41" text-anchor="middle">WHERE created_at &gt;= '2026-04-15'</text>
<path class="pp1-ln" d="M 240 58 L 240 84" marker-end="url(#pp1Arw)"/>
<!-- 2026-03: pruned -->
<rect class="pp1-skip" x="30" y="88" width="420" height="64" rx="8"/>
<path class="pp1-mkoff" d="M 44 111 L 62 129 M 62 111 L 44 129"/>
<text class="pp1-nameoff" x="80" y="114">logs_2026_03</text>
<text class="pp1-statoff" x="228" y="114">건너뜀</text>
<text class="pp1-rng" x="80" y="138">범위 2026-03-01 ~ 2026-04-01</text>
<!-- 2026-04: scanned -->
<rect class="pp1-read" x="30" y="162" width="420" height="64" rx="8"/>
<path class="pp1-mk" d="M 44 194 L 51 202 L 64 184"/>
<text class="pp1-name" x="80" y="188">logs_2026_04</text>
<text class="pp1-stat" x="228" y="188">읽음</text>
<text class="pp1-rng" x="80" y="212">범위 2026-04-01 ~ 2026-05-01</text>
<!-- 2026-05: scanned -->
<rect class="pp1-read" x="30" y="236" width="420" height="64" rx="8"/>
<path class="pp1-mk" d="M 44 268 L 51 276 L 64 258"/>
<text class="pp1-name" x="80" y="262">logs_2026_05</text>
<text class="pp1-stat" x="228" y="262">읽음</text>
<text class="pp1-rng" x="80" y="286">범위 2026-05-01 ~ 2026-06-01</text>
<!-- notes -->
<text class="pp1-note" x="240" y="336" text-anchor="middle">조건과 겹치지 않는 파티션은 plan에서 빠진다.</text>
<text class="pp1-note" x="240" y="360" text-anchor="middle">Append 아래 남는 자식 노드는 2개.</text>
</svg>
</div>

plan-time pruning으로 잘려나간 파티션은 `EXPLAIN` 출력에 흔적조차 남지 않습니다. 그래서 pruning이 걸렸는지 확인하는 방법은 `Append` 아래 자식 노드 개수를 세는 것입니다.

PG 11부터는 **execution-time pruning**도 붙었습니다. `PREPARE`로 만든 구문의 파라미터, 서브쿼리가 돌려주는 값, parameterized nested loop join의 안쪽 값처럼 플래너가 미리 확정할 수 없는 값에 대해서도 실행 도중에 파티션이 잘려 나갑니다. 잘린 시점에 따라 관찰 방법이 갈립니다.

- **plan 초기화 단계에서 잘린 경우**: 해당 노드가 출력에 나타나지 않고 `Subplans Removed: N`으로 개수만 요약됩니다. 단, 이 단계에서 잘린 파티션도 실행 시작 시점에는 이미 락이 잡혀 있습니다.
- **실행 도중에 잘린 경우**: 노드는 남아 있고 `EXPLAIN ANALYZE`의 `loops` 값이 파티션마다 달라집니다. 매번 잘렸다면 `(never executed)`로 찍힙니다.

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
- **Partitionwise Aggregate** (PG 11+, 기본 off): 파티션별로 부분 집계한 뒤 합치는 최적화입니다. `enable_partitionwise_aggregate = on`으로 켭니다.

기본 off인 partitionwise 옵션들을 켜면 plan 선택지가 넓어지는 만큼 planning 비용도 같이 늘어나기 때문에 파티션 수가 많은 환경에서는 도입 전 실측이 필요합니다.

## 실전에서는

**1. "큰 테이블 집계가 느리다" → `Workers Launched` 라인부터 확인.** 병렬이 아예 안 켜진 상태라면 쿼리 비용 추정이 작거나 `PARALLEL UNSAFE` 함수가 섞였을 가능성입니다. 테이블 크기가 `min_parallel_table_scan_size` 위인지도 같이 봅니다.

**2. "파티션 pruning이 안 된다" → `EXPLAIN`의 Append 밑 자식 노드 개수 확인.** 파티션 키에 함수/CAST가 씌워졌는지, prepared statement의 generic plan 때문인지, 파티션 키가 조건에 등장은 하는지 순서로 봅니다.

**3. "파티션을 몇 개로 쪼갤까" → 한 파티션이 수 GB 범위, 총 개수는 수십\~100여 개가 일반적.** 수백 개를 넘기면 plan 시간을 확인해야 하고, 일 단위로 쪼개면 1년만 지나도 365개가 되어 planning 오버헤드가 체감됩니다.

**4. "병렬이 켜졌는데도 기대만큼 안 빠르다" → I/O 병목 의심.** worker 4명이 있어도 디스크 I/O가 병목이면 선형 scaling이 안 됩니다. `EXPLAIN (ANALYZE, BUFFERS)`의 `shared read` 값, iostat 결과를 같이 봅니다.

## 흔한 오해

- **"파티션 키에는 자동으로 인덱스가 붙는다"**: 아닙니다. 파티션 키로 범위 조건을 걸어도, 그 범위 안에서 특정 행을 빠르게 찾으려면 별도 인덱스가 필요합니다. Pruning은 "어떤 파티션을 읽을지"만 결정하고, 그 파티션 안을 탐색하는 건 여전히 인덱스의 영역입니다.
- **"병렬이 켜지면 무조건 빠르다"**: worker 시작과 tuple queue 전송 비용이 있어 결과가 작거나 이미 인덱스로 좁혀지는 쿼리는 오히려 손해입니다.
- **"파티션을 많이 쪼갤수록 빠르다"**: pruning이 잘 걸릴 때만 그렇습니다. 개수가 많아지면 plan 시간이 늘고, partitionwise 최적화의 planning 비용도 비례해 커집니다.
- **"파티셔닝하면 VACUUM 부담이 줄어든다"**: 파티션마다 autovacuum이 돌아야 해서 총 부담은 오히려 늘어납니다. 대신 오래된 파티션을 통째로 `DROP TABLE`해서 대량 DELETE를 대체할 수 있다는 운영상 이점은 따로 있습니다.

## 마치며

병렬 쿼리와 파티셔닝은 둘 다 "데이터를 쪼개 처리한다"는 공통 목적을 갖지만, 하나는 실행 시점에 CPU를 나눠 쓰는 전략이고 다른 하나는 저장 시점부터 테이블 자체를 나누는 전략입니다. 같은 큰 테이블이라도 집계가 주라면 병렬이, 조건이 파티션 키로 자주 좁혀진다면 파티셔닝이 자연스러운 선택입니다. 두 기능은 배타적이지 않아서 Parallel Append 같은 조합도 가능합니다.

인덱스에서 시작해 통계, 조인, 쪼개기까지 단일 쿼리가 빨라지는(혹은 느려지는) 축들을 훑어왔습니다. 다음 글부터는 동시성과 내구성 쪽으로 방향을 틉니다. 첫 주제는 **VACUUM과 bloat**입니다. MVCC가 남긴 dead tuple을 누가, 언제, 어떻게 치우는지, 왜 운영 환경에서 VACUUM이 쉽게 말썽의 중심이 되는지 다룹니다.
