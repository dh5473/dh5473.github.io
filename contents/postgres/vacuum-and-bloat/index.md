---
date: '2026-04-25'
title: 'VACUUM과 bloat의 정체: dead tuple은 누가 언제 치우는가'
category: 'Database'
series: 'postgres'
seriesOrder: 9
tags: ['PostgreSQL', 'VACUUM', 'Bloat', 'Autovacuum', 'Dead Tuple']
summary: 'UPDATE가 만든 dead tuple은 어디로 가는지, bloat가 쿼리 성능에 미치는 영향, VACUUM의 3단계 동작, autovacuum의 트리거 공식, 그리고 wraparound를 막는 freeze까지 PostgreSQL의 GC를 따라갑니다.'
thumbnail: './thumbnail.png'
---

[힙 페이지 글](/postgres/heap-page-tuple/)에서 PostgreSQL의 UPDATE는 기존 튜플의 xmax를 찍고 새 튜플을 INSERT하는 방식이라고 했습니다. DELETE도 비슷합니다. 물리적으로 지우는 게 아니라 xmax만 기록해두고, 모든 활성 트랜잭션이 더 이상 그 튜플을 볼 필요가 없어질 때까지 페이지에 남겨둡니다.

그러면 "볼 필요가 없어진" 튜플은 누가 치우는 걸까요? 아무도 안 치우면 어떻게 될까요?

간단한 실험으로 확인해봅시다.

```sql
CREATE TABLE bloat_demo (id int PRIMARY KEY, val text);
INSERT INTO bloat_demo
SELECT g, md5(g::text) FROM generate_series(1, 100000) g;

SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS before_update;
```

| before_update |
|---------------|
| 6904 kB |

```sql
UPDATE bloat_demo SET val = md5(val);

SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS after_update;
```

| after_update |
|-------------|
| 13 MB |

10만 행을 전부 UPDATE했더니 테이블 크기가 거의 두 배가 됐습니다. 데이터의 논리적 양은 같은데 물리적 공간이 늘어난 겁니다. 옛 버전 10만 개가 페이지 안에 그대로 남아있기 때문입니다. 이 남아있는 것들이 **dead tuple**이고, 공간이 부풀어 오른 상태가 **bloat**입니다. 그리고 이걸 치우는 게 **VACUUM**입니다.

이 글에서는 dead tuple이 쌓이면 어떤 문제가 생기는지, VACUUM이 이걸 어떻게 치우는지, autovacuum이 언제 자동으로 발동하는지, 그리고 VACUUM이 제때 못 돌면 일어나는 일(TXID wraparound)까지를 순서대로 따라갑니다.

## dead tuple이 만드는 문제

dead tuple은 아무 트랜잭션에도 보이지 않는 튜플입니다. 보이지 않지만 물리적 공간은 여전히 차지합니다. 문제는 두 군데서 나타납니다.

### 힙 bloat

Seq Scan은 테이블의 모든 페이지를 순서대로 읽습니다. dead tuple이 차지하는 페이지까지 전부 읽게 되므로, 논리적으로 필요한 것보다 더 많은 I/O를 씁니다. 위 실험에서 13MB가 된 테이블에 `SELECT COUNT(*)`를 걸면, 살아있는 10만 행을 세는 데 13MB를 전부 읽어야 합니다. VACUUM으로 dead tuple을 치운 후에는 6.9MB만 읽으면 됩니다.

### 인덱스 bloat

인덱스 엔트리는 힙의 ctid를 가리킵니다. dead tuple의 ctid를 가리키는 인덱스 엔트리도 남아있습니다. Index Scan 중에 이 엔트리를 따라 힙에 갔더니 dead tuple이면, 가시성 판정에서 걸러지긴 하지만 힙 페이지를 읽는 I/O는 이미 발생한 뒤입니다. dead tuple이 많으면 이런 헛수고가 쌓입니다. [B-tree 글](/postgres/btree-anatomy/)에서 본 Index-Only Scan도 영향을 받는데, dead tuple이 있는 페이지의 VM(Visibility Map) all-visible 비트가 꺼져 있으므로 매번 힙을 확인해야 합니다.

### bloat 측정

`pgstattuple` 확장으로 bloat 상태를 수치로 확인할 수 있습니다.

```sql
CREATE EXTENSION pgstattuple;

SELECT
    dead_tuple_count,
    dead_tuple_percent,
    free_space,
    free_percent
FROM pgstattuple('bloat_demo');
```

| dead_tuple_count | dead_tuple_percent | free_space | free_percent |
|------------------|--------------------|------------|--------------|
| 100000 | 49.18 | 36864 | 0.27 |

dead tuple이 테이블 공간의 약 절반을 차지하고 있습니다. `pg_stat_user_tables`에서도 간접적으로 확인됩니다.

```sql
SELECT n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'bloat_demo';
```

| n_live_tup | n_dead_tup | last_vacuum | last_autovacuum |
|------------|------------|-------------|-----------------|
| 100000 | 100000 | null | null |

`n_dead_tup`이 10만으로 찍혀 있습니다. VACUUM을 한 번도 안 돌렸으니 last_vacuum도 null입니다.

## VACUUM의 동작

VACUUM은 세 단계로 동작합니다.

### 1단계: dead tuple TID 수집

VACUUM은 힙을 처음부터 끝까지 스캔하면서 dead tuple의 **TID(block 번호 + offset)**를 메모리에 수집합니다. 여기서 "dead"의 기준은 **현재 활성 중인 모든 snapshot에서 보이지 않는 튜플**입니다. 어떤 트랜잭션이든 하나라도 이 튜플을 볼 가능성이 있으면 아직 dead가 아닙니다.

수집할 수 있는 TID 수의 상한은 `maintenance_work_mem`에 의해 결정됩니다. PG 17부터는 TID를 radix tree 기반의 TidStore에 저장해서 메모리 효율이 크게 개선되었고, 이전 버전에 있던 1GB 상한 제한도 제거되었습니다. 테이블이 매우 크면 이 한도를 넘겨서 여러 패스로 나뉩니다. 한 패스가 끝나면 2-3단계를 수행하고 다시 남은 구간을 스캔합니다.

### 2단계: 인덱스 정리

수집한 TID 목록을 가지고 해당 테이블의 **모든 인덱스**를 순회합니다. 각 인덱스에서 dead tuple의 ctid를 가리키는 엔트리를 찾아 제거합니다. 인덱스가 5개 있으면 이 단계를 5번 반복합니다. 큰 테이블에 인덱스가 많으면 이 단계가 VACUUM 시간의 대부분을 차지하기도 합니다.

PG 12부터는 dead tuple 수가 적을 때 인덱스 정리를 생략하는 최적화가 들어갔습니다. `INDEX_CLEANUP` 옵션으로 제어할 수 있고, autovacuum도 자체적으로 dead tuple이 적으면 인덱스 패스를 건너뛸 수 있습니다.

### 3단계: 힙 정리

인덱스에서 참조가 사라졌으니, 이제 힙에서 dead tuple을 실제로 정리합니다. 튜플의 line pointer를 `LP_DEAD`에서 `LP_UNUSED`로 바꿔서 **새 INSERT가 그 자리를 재사용할 수 있게** 만듭니다. 그리고 두 가지 보조 구조를 갱신합니다.

- **FSM(Free Space Map)**: 페이지별 여유 공간 정보를 갱신합니다. 새 INSERT가 들어올 때 여유 공간이 있는 페이지를 빨리 찾기 위한 맵입니다
- **VM(Visibility Map)**: 페이지의 모든 튜플이 모든 트랜잭션에게 보이는 상태이면 all-visible 비트를 세웁니다. [B-tree 글에서 다룬 Index-Only Scan](/postgres/btree-anatomy/)이 이 비트에 의존합니다

전체 과정을 그림으로 보면 이렇습니다.

```
VACUUM 시작
│
├── 1. 힙 스캔 → dead tuple TID 수집 (maintenance_work_mem까지)
│
├── 2. 인덱스 순회 → dead TID 가리키는 엔트리 제거
│   ├── idx_a: 제거
│   ├── idx_b: 제거
│   └── idx_c: 제거
│
├── 3. 힙 정리 → LP_DEAD → LP_UNUSED, FSM·VM 갱신
│
└── TID가 남았으면 → 1번으로 돌아가서 다음 구간
```

위 실험에서 VACUUM을 돌려보면 효과를 수치로 확인할 수 있습니다.

```sql
VACUUM bloat_demo;

SELECT dead_tuple_count, dead_tuple_percent
FROM pgstattuple('bloat_demo');
```

| dead_tuple_count | dead_tuple_percent |
|------------------|--------------------|
| 0 | 0 |

dead tuple이 전부 사라졌습니다. 하지만 테이블 크기를 다시 확인하면:

```sql
SELECT pg_size_pretty(pg_relation_size('bloat_demo'));
```

| pg_size_pretty |
|----------------|
| 13 MB |

크기는 여전히 13MB입니다. 일반 VACUUM은 **dead tuple이 차지하던 공간을 OS에 돌려주지 않습니다**. 해당 공간을 "재사용 가능"으로만 표시합니다. 이후에 INSERT가 들어오면 이 빈 공간부터 채우므로, 테이블이 더 커지지는 않습니다. 하지만 당장의 디스크 사용량은 줄지 않습니다. 이 차이가 뒤에서 다룰 VACUUM FULL과의 핵심 차이입니다.

### HOT update와 VACUUM 부담 감소

[힙 페이지 글](/postgres/heap-page-tuple/)에서 다뤘던 **HOT(Heap-Only Tuple) update**는 VACUUM의 부담을 크게 줄여주는 메커니즘입니다. 인덱스 컬럼이 변경되지 않고, 새 튜플이 같은 페이지 안에 들어갈 수 있으면, 인덱스 엔트리를 새로 만들지 않고 기존 엔트리가 체인으로 새 튜플을 가리킵니다. 인덱스에 dead 엔트리가 안 생기니 VACUUM의 2단계(인덱스 정리)가 가벼워지고, 심지어 pruning(흔히 micro-vacuum이라 불리는)이라는 페이지 내 정리가 일반 SELECT/UPDATE 도중에도 일어납니다.

HOT update의 조건을 충족시키려면 페이지에 빈 공간이 필요하고, `FILLFACTOR`를 100 미만(예: 80-90)으로 설정하면 INSERT 시 각 페이지에 여유를 남겨둡니다. UPDATE가 잦은 테이블에서 효과적입니다.

## autovacuum

수동으로 `VACUUM`을 돌리는 건 실무에서 거의 하지 않습니다. PostgreSQL은 **autovacuum**이라는 백그라운드 프로세스가 dead tuple이 일정 수준 쌓이면 자동으로 VACUUM을 실행합니다.

### 프로세스 구조

`autovacuum launcher`가 상주하면서 주기적으로 각 테이블의 상태를 확인합니다. VACUUM이 필요한 테이블을 발견하면 `autovacuum worker`를 띄워 그 테이블에 VACUUM을 실행합니다. 동시에 띄울 수 있는 worker 수는 `autovacuum_max_workers`(기본 3)로 제한됩니다.

### 트리거 공식

autovacuum이 테이블에 VACUUM을 걸지 말지를 결정하는 공식은 이렇습니다.

```
dead tuples > autovacuum_vacuum_threshold
              + autovacuum_vacuum_scale_factor × reltuples
```

기본값으로 풀어쓰면:

```
dead tuples > 50 + 0.2 × 전체 행 수
```

"전체 행의 20% + 50행이 dead가 되면 VACUUM을 건다"는 뜻입니다. 10만 행짜리 테이블이면 dead tuple이 20,050개를 넘으면 발동하고, 1억 행짜리라면 2천만 행이 쌓여야 발동합니다.

여기서 문제가 보입니다. **큰 테이블일수록 기준이 느슨합니다.** 1억 행 테이블에서 1천만 개의 dead tuple이 쌓여도 아직 10%라 autovacuum이 동작하지 않습니다. dead tuple 1천만 개면 힙 bloat가 이미 상당하고, Seq Scan 성능은 눈에 띄게 떨어집니다.

PG 18에서는 이 문제를 완화하기 위해 `autovacuum_vacuum_max_threshold`(기본 1억)가 추가되었습니다. 계산된 임계치가 이 값을 넘으면 잘라내므로, 아무리 큰 테이블이라도 dead tuple이 1억 개를 넘으면 반드시 autovacuum이 발동합니다. 그래도 1억은 여전히 큰 숫자이므로, 큰 테이블은 테이블별로 scale_factor를 낮추는 것이 권장됩니다.

```sql
ALTER TABLE large_orders SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 1000
);
```

이러면 "1% + 1,000행"으로 발동 기준이 20배 빡빡해집니다.

### cost-based throttling

autovacuum은 운영 중인 서비스와 I/O를 공유합니다. VACUUM이 너무 열심히 일하면 읽기 쿼리가 느려집니다. 이를 조율하는 게 **cost-based vacuum delay**입니다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `autovacuum_vacuum_cost_limit` | 200 (또는 `vacuum_cost_limit` 상속) | 한 번에 소비할 수 있는 cost 한도 |
| `autovacuum_vacuum_cost_delay` | 2ms | cost 한도에 도달하면 쉬는 시간 |
| `vacuum_cost_page_hit` | 1 | shared_buffers에 있는 페이지를 읽었을 때 cost |
| `vacuum_cost_page_miss` | 2 | 디스크에서 읽어야 할 때 cost |
| `vacuum_cost_page_dirty` | 20 | 페이지를 dirty로 만들었을 때 cost |

VACUUM이 페이지를 읽고 수정하면서 cost가 쌓이고, `cost_limit`에 도달하면 `cost_delay`만큼 잠시 쉽니다. 기본값이면 "cost 200을 채우면 2ms 쉬기"를 반복합니다. dead tuple이 빠르게 쌓이는 테이블에서 autovacuum이 쫓아가지 못하면, `cost_limit`을 올리거나 `cost_delay`를 줄여서 autovacuum의 처리 속도를 높여줘야 합니다.

### autovacuum 관찰

autovacuum이 실제로 언제 돌았는지, 어떤 테이블에 돌았는지는 `pg_stat_user_tables`에서 확인합니다.

```sql
SELECT relname, n_dead_tup, last_autovacuum, autovacuum_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

| relname | n_dead_tup | last_autovacuum | autovacuum_count |
|---------|------------|-----------------|------------------|
| orders | 52340 | 2026-04-25 03:15:22 | 47 |
| users | 120 | 2026-04-25 03:14:58 | 23 |
| logs | 0 | 2026-04-24 18:02:11 | 5 |

`n_dead_tup`이 높은 테이블에서 `last_autovacuum`이 오래전이면, autovacuum이 해당 테이블에 도달하지 못하고 있다는 신호입니다. worker 수가 부족하거나, 다른 테이블에 시간을 뺏기고 있을 수 있습니다.

## VACUUM vs VACUUM FULL vs pg_repack

세 가지 방식의 차이를 표로 정리합니다.

| 구분 | VACUUM | VACUUM FULL | pg_repack |
|------|--------|-------------|-----------|
| 공간 반환 | 재사용 가능으로 표시 (OS에 반환 안 함) | 테이블을 새로 써서 OS에 반환 | 테이블을 새로 써서 OS에 반환 |
| 락 수준 | ShareUpdateExclusiveLock (읽기/쓰기 가능) | AccessExclusiveLock (모든 접근 차단) | 마지막 swap 순간만 짧은 배타 락 |
| 운영 중 사용 | 가능 (일상적) | 사실상 불가 (서비스 중단) | 가능 (온라인) |
| 동작 원리 | dead tuple 정리, FSM/VM 갱신 | 살아있는 튜플만 새 파일에 복사, 옛 파일 삭제 | 살아있는 튜플을 새 테이블로 복사하면서 트리거로 변경분 추적, 완료 후 swap |
| 디스크 필요량 | 추가 없음 | 테이블 크기만큼 임시 공간 | 테이블 크기만큼 임시 공간 |

핵심은 이겁니다. **일반 VACUUM을 잘 돌리는 게 최선**이고, VACUUM FULL이나 pg_repack은 bloat가 이미 심하게 쌓인 뒤의 긴급 조치입니다. bloat가 테이블 크기의 50%를 넘어가고 자연스러운 재사용으로는 회복 불가능할 때만 고려합니다.

## TXID wraparound과 freeze

[MVCC 글](/postgres/mvcc-visibility/)에서 xid가 32비트이고, modular arithmetic으로 "과거 21억 / 미래 21억"을 구분한다고 했습니다. xid가 계속 소비되어 한 바퀴를 돌면, 과거에 committed된 xid가 갑자기 "미래"로 뒤집히면서 해당 트랜잭션이 만든 모든 튜플이 안 보이게 됩니다. 이게 **wraparound**이고, 사실상의 데이터 유실입니다.

이걸 막는 메커니즘이 **freeze**입니다. VACUUM은 충분히 오래된 튜플을 발견하면 `t_infomask`에 `HEAP_XMIN_FROZEN` 비트를 세웁니다. frozen 상태의 튜플은 xmin 값과 무관하게 "영원히 과거, 항상 보임"으로 판정됩니다.

### freeze 관련 파라미터

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `vacuum_freeze_min_age` | 5천만 | 이 나이 이상인 xmin을 freeze 후보로 삼음 |
| `vacuum_freeze_table_age` | 1.5억 | `relfrozenxid` 나이가 이 값을 넘으면 VACUUM이 전체 테이블을 훑으며 적극 freeze |
| `autovacuum_freeze_max_age` | 2억 | 이 나이를 넘으면 anti-wraparound VACUUM을 강제 발동 |

일반 VACUUM은 VM에서 all-visible로 표시된 페이지를 건너뛰지만, `relfrozenxid` 나이가 `vacuum_freeze_table_age`를 넘으면 **all-frozen이 아닌 모든 페이지를 스캔하는 aggressive VACUUM**으로 전환되어 오래된 xid를 적극적으로 freeze합니다.

`autovacuum_freeze_max_age`는 최후의 방어선입니다. 이 임계치에 도달하면 autovacuum이 꺼져 있어도 강제로 anti-wraparound VACUUM이 실행됩니다. 그마저도 진행되지 못하면(long-running transaction이 xmin horizon을 잡고 있거나 replication slot이 오래된 xid를 고정하고 있을 때) PostgreSQL은 더 이상의 write를 거부하고 read-only 모드로 전환됩니다.

### freeze 상태 모니터링

현재 테이블들의 freeze 상태는 `pg_class.relfrozenxid`로 확인합니다.

```sql
SELECT relname,
       age(relfrozenxid) AS xid_age,
       pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
ORDER BY age(relfrozenxid) DESC
LIMIT 5;
```

| relname | xid_age | size |
|---------|---------|------|
| large_orders | 85000000 | 12 GB |
| users | 32000000 | 256 MB |
| sessions | 15000000 | 1 GB |

`xid_age`가 1억을 넘으면 주의, 1.5억을 넘으면 aggressive VACUUM이 발생하는 구간, 2억에 가까워지면 위험 신호입니다. 운영 환경에서는 이 수치를 모니터링 대시보드에 올려두는 것이 일반적입니다.

## 실전에서는

1. **`n_dead_tup`이 계속 쌓이면 autovacuum이 쫓아가지 못하는 상황이다.** 테이블별 `autovacuum_vacuum_scale_factor`를 낮추거나, `autovacuum_vacuum_cost_limit`을 올려서 autovacuum의 처리량을 높인다
2. **`VACUUM VERBOSE`로 각 단계의 소요를 확인할 수 있다.** 인덱스 정리가 오래 걸리면 불필요한 인덱스를 정리하는 것이 근본 해법이다
3. **long-running transaction은 VACUUM의 적이다.** 활성 트랜잭션의 snapshot이 있는 한 그 시점 이후의 dead tuple은 수거 불가. `idle in transaction`이 오래 열려있는 세션이 있으면 VACUUM은 그 세션의 xmin 이후 dead tuple을 치울 수 없다. `idle_in_transaction_session_timeout`으로 자동 종료를 설정하는 것이 권장된다
4. **`VACUUM FULL`은 정말 필요할 때만.** bloat가 50%를 넘고 공간을 OS에 돌려받아야 할 때만 고려한다. 운영 중이면 `pg_repack`이 온라인으로 같은 효과를 준다

## 흔한 오해

**"VACUUM FULL을 주기적으로 돌려야 한다."** 일반 VACUUM으로 충분합니다. VACUUM FULL은 AccessExclusiveLock을 잡아서 해당 테이블에 모든 읽기/쓰기가 차단됩니다. 주기적으로 돌리면 매번 서비스가 중단되는 것이나 다름없습니다. bloat가 심각하게 쌓인 예외적 상황에서만 한 번 쓰는 것이고, 근본 해법은 autovacuum이 잘 돌게 만드는 겁니다.

**"autovacuum이 켜져 있으니 bloat 걱정 없다."** 기본 `scale_factor`가 0.2(20%)라서, 큰 테이블은 dead tuple이 수천만 개 쌓인 뒤에야 반응합니다. 그 사이에 Seq Scan 성능은 이미 크게 떨어질 수 있습니다. 대용량 테이블은 테이블별로 `scale_factor`를 0.01~0.05 수준으로 낮춰야 합니다.

**"VACUUM은 느리니까 끄는 게 낫다."** autovacuum을 끄면 dead tuple이 무한히 쌓이고, 결국 TXID wraparound까지 갑니다. wraparound가 임박하면 PostgreSQL이 강제로 anti-wraparound VACUUM을 돌리는데, 이 VACUUM은 cost-based throttling 없이 전력으로 동작하므로 서비스 부하가 훨씬 더 큽니다. 일상적으로 조금씩 돌리는 게 한 번에 몰아서 돌리는 것보다 낫습니다.

## 마치며

MVCC의 대가는 dead tuple이고, dead tuple의 청소부가 VACUUM입니다. UPDATE/DELETE가 발생하는 한 dead tuple은 계속 쌓이고, VACUUM이 제때 돌지 않으면 bloat → 성능 저하, 최악의 경우 wraparound → read-only 전환까지 이어집니다. 결국 PostgreSQL 운영의 상당 부분은 "autovacuum이 잘 쫓아가고 있는가"를 확인하는 일입니다.

다음 글에서는 VACUUM이 치울 수 없는 영역으로 넘어갑니다. 두 트랜잭션이 같은 row를 동시에 수정하면 무슨 일이 일어나는지, Read Committed에서 Serializable까지 격리 수준의 실제 동작과 락의 체계를 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 25. Routine Database Maintenance Tasks](https://www.postgresql.org/docs/18/maintenance.html)
- [VACUUM](https://www.postgresql.org/docs/18/sql-vacuum.html): VACUUM / VACUUM FULL 문법과 옵션
- [Routine Vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html): autovacuum 파라미터, freeze, wraparound 상세
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 6: VACUUM Processing](https://www.interdb.jp/pg/pgsql06.html)
- [pgstattuple](https://www.postgresql.org/docs/18/pgstattuple.html): bloat 측정 확장
- [pg_repack](https://reorg.github.io/pg_repack/): 온라인 테이블 재구성 확장
