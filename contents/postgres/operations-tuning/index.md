---
date: '2026-05-06'
title: '연결, 메모리, autovacuum: 운영 환경에서 가장 자주 튜닝하는 파라미터들'
category: 'Database'
series: 'postgres'
seriesOrder: 14
tags: ['PostgreSQL', 'Performance Tuning', 'PgBouncer', 'Autovacuum', 'Connection Pooling']
summary: 'PostgreSQL 운영에서 가장 자주 건드리는 세 축인 연결 관리(max_connections, PgBouncer), 메모리 파라미터(shared_buffers, work_mem, effective_cache_size), autovacuum 튜닝의 의미와 관계를 정리하고, 실전 장애 시나리오 3가지로 접목합니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/postgres/slow-query-hunting/)에서 느린 쿼리의 원인을 추적하는 도구들을 살펴봤습니다. 원인을 찾았다면 이제 남은 질문은 하나입니다. **"어떤 설정을 어떻게 바꿔야 하는가?"**

PostgreSQL의 설정 파라미터는 300개가 넘지만, 운영 환경에서 실제로 손대는 파라미터는 많지 않습니다. 대부분의 튜닝은 세 가지 축을 중심으로 돌아갑니다.

- **연결 관리**: 커넥션을 몇 개까지 허용하고, 어떻게 재사용할 것인가
- **메모리**: 캐시, 정렬, 인덱스 생성에 얼마를 할당할 것인가
- **autovacuum**: dead tuple 정리를 얼마나 자주, 얼마나 공격적으로 할 것인가

이 글에서는 이 세 축의 파라미터들이 내부적으로 어떻게 동작하고 서로 어떤 관계에 있는지를 정리합니다. 그리고 마지막에 이 시리즈에서 다뤄온 지식을 실제 장애 시나리오에 접목해 봅니다.

## 연결 관리: 프로세스 기반 아키텍처의 현실

### 연결이 비싼 이유

[아키텍처 글](/postgres/architecture-overview/)에서 봤듯이, PostgreSQL은 클라이언트 커넥션 하나당 OS 프로세스를 하나씩 `fork()`합니다. 커넥션이 100개면 프로세스가 100개, 500개면 500개입니다.

프로세스 하나가 가지는 비용은 두 가지입니다.

- **fork 비용**: `fork()` + shared memory attach + 인증 + 세션 초기화. 수 ms 수준이지만, 매 요청마다 커넥션을 만들고 닫는 패턴이라면 누적됩니다.
- **메모리 비용**: 각 backend 프로세스는 catalog cache, plan cache 등 private 메모리로 수 MB를 차지합니다. 여기에 쿼리가 정렬이나 해시를 수행하면 `work_mem` 단위의 메모리가 추가로 할당됩니다.

여기서 핵심은, 프로세스가 많아지면 메모리뿐 아니라 **CPU context switch**와 **lock contention**도 함께 증가한다는 점입니다. 커넥션이 200개를 넘어가면 실제로 동시에 쿼리를 실행하는 프로세스도 그만큼 많아지고, 공유 리소스(shared_buffers, WAL buffers, lock table)에 대한 경합이 커집니다.

### max_connections: "높을수록 좋다"가 아닌 이유

`max_connections`(기본 100)은 "최대 몇 개의 커넥션을 허용하는가"입니다. 직관적으로는 높게 잡는 것이 여유로워 보이지만, 실제로는 반대입니다.

```
max_connections = 500일 때:
- 500개 프로세스 × 수 MB(기본 메모리) = 수 GB
- 500개 중 실제 활성 쿼리가 50개라도 → 450개는 idle 상태로 메모리만 차지
- 500개가 모두 동시에 쿼리를 실행하면 → CPU 경합, lock 경합 폭증
```

경험적으로 실제 동시 활성 쿼리 수는 CPU 코어 수의 2~4배를 넘으면 성능이 오히려 떨어집니다. 코어가 8개인 서버에서 동시 활성 쿼리가 32개를 넘기면 context switch 비용이 실제 작업 시간보다 커질 수 있습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 핵심 포인트</strong><br>
  <code>max_connections</code>이 결정하는 건 "최대 동시 커넥션 수"이지, "최대 동시 활성 쿼리 수"가 아닙니다. 대부분의 커넥션은 idle 상태이고, 이 idle 커넥션들도 메모리를 차지합니다. 필요한 건 높은 <code>max_connections</code>이 아니라 <strong>connection pooling</strong>입니다.
</div>

### PgBouncer: connection pooling이 거의 필수인 이유

PgBouncer는 클라이언트와 PostgreSQL 사이에서 커넥션을 **재사용**해주는 경량 proxy입니다. 클라이언트가 1,000개의 커넥션을 열어도, PgBouncer가 실제 PostgreSQL에 여는 커넥션은 30~50개로 유지할 수 있습니다.

```
                  클라이언트 (1000 커넥션)
                         │
                    ┌─────▼──────┐
                    │  PgBouncer  │  ← 커넥션 멀티플렉싱
                    └─────┬──────┘
                         │
                  PostgreSQL (30~50 커넥션)
```

PgBouncer는 세 가지 pooling 모드를 제공합니다.

| 모드 | 커넥션 반환 시점 | 제약 | 용도 |
|------|-----------------|------|------|
| **session** | 클라이언트 세션 종료 시 | 거의 없음 | pooling 효과 최소 |
| **transaction** | 트랜잭션 종료 시 | SET, PREPARE 등 세션 상태 유지 불가 | 가장 널리 사용 |
| **statement** | 문장 하나 실행 후 | 멀티 스테이트먼트 트랜잭션 불가 | 단순 읽기 전용 |

**transaction 모드**가 가장 많이 쓰입니다. 트랜잭션이 끝나면 PostgreSQL 커넥션을 풀에 반환하므로, idle 상태의 클라이언트는 실제 커넥션을 점유하지 않습니다.

다만 transaction 모드에서는 주의할 점이 있습니다. `SET` 명령으로 바꾼 세션 파라미터, `LISTEN` 등 세션 상태에 의존하는 기능은 트랜잭션이 끝나고 다른 커넥션으로 넘어가면 사라집니다. `NOTIFY`는 transaction 모드에서도 동작하지만, `LISTEN`은 세션이 유지되어야 하므로 사용할 수 없습니다. 이런 기능이 필요한 애플리케이션이라면 session 모드를 써야 합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  PgBouncer의 transaction 모드에서 <code>SET statement_timeout = '5s'</code>를 실행하면, 해당 트랜잭션 안에서는 적용되지만 다음 트랜잭션에서는 다른 커넥션으로 배정될 수 있어 설정이 유지되지 않습니다. 세션 단위 설정이 필요하면 <code>SET LOCAL</code>(현재 트랜잭션에만 적용)을 쓰거나, 애플리케이션 레벨에서 매 트랜잭션 시작 시 설정하는 패턴이 필요합니다.
</div>

### idle in transaction의 위험과 대응

[느린 쿼리 추적 글](/postgres/slow-query-hunting/)에서 `pg_stat_activity`로 `idle in transaction` 상태를 확인하는 방법을 다뤘습니다. 이 상태는 왜 위험할까요?

`BEGIN`으로 트랜잭션을 열고 아직 `COMMIT`이나 `ROLLBACK`을 하지 않은 세션은 VACUUM에 영향을 줄 수 있습니다. Repeatable Read 이상의 격리 수준에서는 트랜잭션 시작 시 잡은 snapshot이 계속 유지되므로 **xmin horizon을 직접 붙잡습니다.** 기본 격리 수준인 Read Committed에서는 문장 사이에 snapshot을 해제하므로, 읽기 전용 트랜잭션이라면 VACUUM을 차단하지 않습니다. 하지만 INSERT, UPDATE, DELETE를 한 번이라도 실행한 쓰기 트랜잭션은 xid를 할당받고, 이 xid가 xmin horizon 계산에 포함되어 dead tuple 회수를 지연시킵니다. [VACUUM 글](/postgres/vacuum-and-bloat/)에서 봤듯이, xmin horizon이 전진하지 않으면 autovacuum은 그 이후에 발생한 dead tuple을 회수할 수 없습니다. 실무에서 문제가 되는 건 대부분 쓰기 트랜잭션을 열어둔 채 방치하는 경우입니다.

대응 수단은 `idle_in_transaction_session_timeout` 파라미터입니다.

```sql
-- 전역 설정: idle in transaction 상태가 5분 이상 지속되면 강제 종료
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
SELECT pg_reload_conf();
```

이 값을 설정하면 지정된 시간 동안 아무 쿼리 없이 트랜잭션만 열어둔 세션을 PostgreSQL이 자동으로 종료합니다. 애플리케이션 쪽에서 트랜잭션을 빠르게 닫도록 수정하는 것이 근본적인 해결이지만, 안전장치로 이 파라미터를 걸어두는 것이 좋습니다.

## 메모리 파라미터: 누가 얼마를 쓰는가

PostgreSQL의 메모리는 크게 두 공간으로 나뉩니다. 모든 프로세스가 공유하는 **shared memory**와, 각 backend 프로세스가 독립적으로 사용하는 **private memory**입니다.

```
┌───────────────────────────────────────────────────────┐
│                    Shared Memory                       │
│  ┌─────────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ shared_buffers   │  │WAL buffers│  │  CLOG        │  │
│  │  (데이터 캐시)    │  │          │  │  (트랜잭션 상태)│  │
│  └─────────────────┘  └──────────┘  └──────────────┘  │
├───────────────────────────────────────────────────────┤
│             Backend Process (커넥션마다 1개)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ work_mem  │  │ catalog  │  │ temp_buffers         │ │
│  │ (정렬/해시)│  │ cache    │  │ (임시 테이블 캐시)     │ │
│  └──────────┘  └──────────┘  └──────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### shared_buffers

`shared_buffers`는 PostgreSQL이 디스크에서 읽어온 8KB 페이지를 캐싱하는 공간입니다. 테이블이든 인덱스든, 데이터에 접근하려면 이 버퍼를 거칩니다.

**기본값은 128MB**이지만, 전용 DB 서버라면 물리 메모리의 25% 정도가 출발점입니다. 16GB 서버라면 4GB, 64GB 서버라면 16GB.

그런데 왜 "25%"이고 "전부"가 아닐까요? PostgreSQL은 OS의 page cache 위에서 동작합니다. shared_buffers에서 밀려난 페이지도 OS의 page cache에는 남아있을 가능성이 높습니다. 즉 실제로는 **이중 캐싱**이 일어납니다.

```
┌─────────────────────────────────────┐
│          PostgreSQL                  │
│  shared_buffers (메모리의 25%)       │  ← 1차 캐시
│  "여기에 없으면 OS에 읽기 요청"       │
├─────────────────────────────────────┤
│          OS Page Cache               │
│  나머지 여유 메모리 (메모리의 50%+)   │  ← 2차 캐시
│  "여기에도 없으면 디스크 I/O 발생"    │
├─────────────────────────────────────┤
│          Disk                        │
└─────────────────────────────────────┘
```

shared_buffers를 너무 크게 잡으면 OS page cache에 남는 메모리가 줄어들어 오히려 전체 캐시 효율이 떨어질 수 있습니다. 공식 문서도 40% 이상에서는 효과가 감소한다고 언급합니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 checkpoint와의 관계</strong><br>
  shared_buffers가 크면 dirty page도 그만큼 많이 쌓일 수 있습니다. <a href="/postgres/wal-and-checkpoint/">WAL 글</a>에서 다뤘듯이, checkpoint는 이 dirty page들을 디스크에 flush하는 시점입니다. shared_buffers를 크게 잡으면 checkpoint 시 flush해야 할 데이터도 늘어나므로, <code>checkpoint_completion_target</code>으로 I/O를 분산시키는 것이 더욱 중요해집니다.
</div>

### work_mem

`work_mem`은 **정렬(ORDER BY, DISTINCT), 해시 조인, 해시 집계** 등의 연산에 사용되는 메모리입니다. 이 값보다 큰 데이터를 처리해야 하면 디스크에 임시 파일을 쓰게 되고, 성능이 급격히 떨어집니다.

기본값은 4MB이고, 이 값이 중요한 이유는 **할당 방식** 때문입니다.

`work_mem`은 "커넥션당"이 아니라 **"정렬이나 해시 연산 하나당"** 할당됩니다. 하나의 쿼리 안에 `ORDER BY`, `Hash Join`, `GROUP BY`가 모두 있으면, 각 연산마다 독립적으로 `work_mem`만큼 할당될 수 있습니다.

```
하나의 쿼리:
  Hash Join      → work_mem (4MB)
  └─ Sort        → work_mem (4MB)
  └─ Hash Agg    → work_mem (4MB)
  = 최대 12MB

동시 활성 쿼리 50개:
  50 × 12MB = 600MB (최악의 경우)
```

참고로, PG 15부터 `hash_mem_multiplier`의 기본값이 2.0으로 올라서 해시 연산(Hash Join, Hash Agg)은 `work_mem`의 2배까지 사용할 수 있습니다. 위 예시에서 해시 연산 두 개가 실제로는 각 8MB를 쓸 수 있어 최대 20MB가 됩니다. 정렬 연산에는 이 배수가 적용되지 않습니다.

그래서 `work_mem`을 올릴 때는 단순히 "4MB → 64MB"로 올리는 게 아니라, 동시 활성 커넥션 수와 쿼리당 연산 수를 함께 고려해야 합니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 실전 팁</strong><br>
  전역 <code>work_mem</code>은 보수적으로 유지하고(4~16MB), 대용량 정렬이 필요한 특정 쿼리/세션에서만 <code>SET work_mem = '256MB'</code>로 높이는 패턴이 안전합니다. 배치 작업용 세션에서만 올려쓰고, OLTP 트래픽에는 기본값을 적용하는 식입니다.
</div>

[조인 알고리즘 글](/postgres/join-algorithms/)에서 다뤘던 Hash Join의 batch split도 `work_mem`과 직결됩니다. `work_mem`이 부족하면 해시 테이블이 메모리에 다 안 들어가서 여러 batch로 나뉘고, 각 batch마다 디스크 I/O가 발생합니다. `EXPLAIN ANALYZE`에서 `Batches: 4`처럼 batch 수가 1보다 크면 `work_mem` 부족을 의심할 수 있습니다.

### maintenance_work_mem

`maintenance_work_mem`은 **VACUUM, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY** 같은 유지보수 작업에 사용되는 메모리입니다. 기본값은 64MB.

이 작업들은 동시에 많이 실행되지 않으므로 `work_mem`보다 넉넉하게 잡아도 됩니다. 256MB ~ 1GB 정도가 일반적입니다. 특히 `CREATE INDEX`에서 이 값이 클수록 정렬 단계가 빨라집니다.

autovacuum이 사용하는 메모리는 별도로 `autovacuum_work_mem`(기본 -1)으로 분리할 수 있습니다. -1이면 `maintenance_work_mem`을 따릅니다. autovacuum worker가 3개 동시에 돌고 `maintenance_work_mem`이 1GB라면 3GB를 쓸 수 있으므로, autovacuum에는 더 작은 값을 지정하고 싶을 때 이 파라미터를 씁니다.

### effective_cache_size

`effective_cache_size`는 다른 파라미터와 성격이 다릅니다. **실제로 메모리를 할당하지 않습니다.** 이 값은 플래너에게 "OS page cache까지 포함해서 대략 이 정도의 데이터가 메모리에 있을 것이다"라고 알려주는 **힌트**입니다.

기본값은 4GB이고, 전용 서버라면 물리 메모리의 50~75%가 적당합니다.

이 값이 중요한 이유는 [플래너 통계 글](/postgres/planner-statistics/)에서 다뤘던 **cost 계산**에 영향을 주기 때문입니다. `effective_cache_size`가 작으면 플래너는 "디스크 접근이 많겠구나"라고 판단해서 random I/O가 필요한 index scan보다 sequential scan을 선호하게 됩니다. 반대로 적절히 크게 잡으면 index scan의 cost가 낮아져서 인덱스를 더 적극적으로 활용합니다.

### 파라미터 한눈에 보기

| 파라미터 | 영향 범위 | 기본값 | 권장 출발점 | 변경 시 |
|---------|----------|--------|-----------|--------|
| `shared_buffers` | 전체 서버 | 128MB | RAM의 25% | restart 필요 |
| `work_mem` | 연산 하나당 | 4MB | 4~16MB (전역) | SET으로 세션별 변경 가능 |
| `maintenance_work_mem` | 유지보수 작업당 | 64MB | 256MB~1GB | SET으로 세션별 변경 가능 |
| `effective_cache_size` | 플래너 힌트 | 4GB | RAM의 50~75% | SET으로 세션별 변경 가능 |

## Autovacuum 튜닝: "알아서 해준다"를 넘어서

[VACUUM 글](/postgres/vacuum-and-bloat/)에서 autovacuum의 트리거 공식과 동작 원리를 다뤘습니다. 기본 설정으로도 대부분의 테이블은 잘 관리되지만, 테이블이 크거나 write가 많은 환경에서는 기본값이 부족합니다.

### 트리거 공식 복습

autovacuum은 다음 조건을 만족하면 해당 테이블에 대해 VACUUM을 실행합니다.

```
dead tuples > autovacuum_vacuum_threshold
              + autovacuum_vacuum_scale_factor × reltuples
```

기본값은 threshold = 50, scale_factor = 0.2입니다. 즉 **전체 행 수(`reltuples`)의 20% + 50개**만큼 dead tuple이 쌓이면 autovacuum이 발동합니다.

### 대형 테이블의 함정

이 공식의 문제는 **큰 테이블에서 드러납니다.**

| 테이블 크기 | live tuples | autovacuum 발동 기준 (dead tuples) |
|------------|-------------|----------------------------------|
| 10만 행 | 100,000 | 20,050 (20%) |
| 1,000만 행 | 10,000,000 | 2,000,050 (20%) |
| 1억 행 | 100,000,000 | 20,000,050 (20%) |

1억 행 테이블에서는 dead tuple이 **2천만 개** 쌓여야 autovacuum이 반응합니다. 그 사이에 Seq Scan 성능은 이미 크게 떨어져 있습니다.

해결책은 **테이블별로 설정을 override**하는 것입니다.

```sql
-- 1억 행 orders 테이블: 1%만 쌓여도 autovacuum 발동
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 1000
);
```

이렇게 하면 100만 개(1%)의 dead tuple이 쌓이면 바로 autovacuum이 실행됩니다.

### cost-based throttling

autovacuum은 I/O를 과도하게 쓰지 않도록 **cost 기반 조절(throttling)**을 합니다.

| 파라미터 | 기본값 | 의미 |
|---------|--------|------|
| `autovacuum_vacuum_cost_limit` | -1 (→ `vacuum_cost_limit` = 200) | 한 라운드에 소비할 수 있는 cost 한도 |
| `autovacuum_vacuum_cost_delay` | 2ms | cost 한도에 도달하면 쉬는 시간 |
| `vacuum_cost_page_hit` | 1 | shared_buffers에서 페이지 읽기 cost |
| `vacuum_cost_page_miss` | 2 | 디스크에서 페이지 읽기 cost |
| `vacuum_cost_page_dirty` | 20 | 페이지를 dirty로 만드는 cost |

동작 방식은 이렇습니다. autovacuum worker가 페이지를 처리하면서 cost를 누적하고, `cost_limit`(기본 200)에 도달하면 `cost_delay`(기본 2ms)만큼 쉽니다. 그러고 나서 cost를 리셋하고 다시 처리합니다.

이 구조의 의미는 **autovacuum이 자발적으로 속도를 늦춘다**는 것입니다. 기본 설정에서 dirty page 10개(cost 200)를 처리할 때마다 2ms를 쉬므로, 초당 처리할 수 있는 dirty page 수가 제한됩니다. write가 많은 환경에서 autovacuum이 dead tuple 생성 속도를 따라가지 못하면 `cost_limit`을 올려야 합니다.

```sql
-- autovacuum의 I/O 한도를 2배로 올림
ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 400;
SELECT pg_reload_conf();
```

### autovacuum_max_workers

`autovacuum_max_workers`(기본 3)는 동시에 실행할 수 있는 autovacuum worker 수입니다. 테이블이 많고 write가 활발하면 3개로는 부족할 수 있습니다.

다만 한 가지 함정이 있습니다. **`cost_limit`은 실행 중인 worker들 사이에 비례 배분됩니다.** 테이블별 `autovacuum_vacuum_cost_limit` override가 없는 경우, worker가 3개이고 전역 cost_limit이 200이면 각 worker는 약 67(200 ÷ 3)의 cost를 쓸 수 있습니다. worker를 6개로 늘리면 각각 33밖에 못 쓰므로, 개별 worker의 처리 속도는 오히려 느려집니다.

worker를 늘릴 때는 `cost_limit`도 **비례해서** 올려야 합니다.

```sql
-- worker를 6개로 늘리면서 cost_limit도 2배로
ALTER SYSTEM SET autovacuum_max_workers = 6;   -- postmaster context: 재시작 필요
ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 400;  -- sighup context: reload로 적용
-- cost_limit은 reload로 즉시 적용되지만, max_workers는 서버 재시작 후 반영됨
```

### wraparound 방지

[VACUUM 글](/postgres/vacuum-and-bloat/)에서 다뤘듯이, PostgreSQL의 트랜잭션 ID는 32비트 순환 카운터입니다. 약 21억 트랜잭션이 지나면 과거 데이터가 "미래의 트랜잭션"으로 보이는 wraparound가 발생할 수 있습니다. 이를 방지하기 위해 VACUUM은 오래된 xid를 frozen 상태로 바꾸는 freeze 작업도 수행합니다.

관련 파라미터:

| 파라미터 | 기본값 | 의미 |
|---------|--------|------|
| `autovacuum_freeze_max_age` | 2억 | 테이블의 가장 오래된 xid가 이 나이를 넘으면 강제 VACUUM |
| `vacuum_failsafe_age` (PG 14+) | 16억 | 이 나이를 넘으면 cost throttling을 무시하고 전력 질주 |

`autovacuum_freeze_max_age`에 도달하면 autovacuum이 테이블 크기와 무관하게 강제 실행됩니다. 이것마저 따라가지 못해 `vacuum_failsafe_age`(16억)에 도달하면, autovacuum은 cost throttling과 인덱스 정리를 모두 건너뛰고 오직 freeze에만 집중합니다.

이 상태까지 가면 autovacuum이 I/O를 전부 점유하면서 정상 쿼리 성능이 크게 떨어집니다. 평소에 autovacuum이 잘 돌고 있는지 모니터링하는 것이 중요한 이유입니다.

## Checkpoint 튜닝

[WAL 글](/postgres/wal-and-checkpoint/)에서 checkpoint의 동작 원리를 자세히 다뤘습니다. 여기서는 운영 관점에서 자주 조정하는 파라미터만 정리합니다.

### 핵심 파라미터 3개

| 파라미터 | 기본값 | 의미 |
|---------|--------|------|
| `checkpoint_timeout` | 5min | 마지막 checkpoint로부터 이 시간이 지나면 실행 |
| `max_wal_size` | 1GB | 마지막 checkpoint 이후 WAL이 이 크기를 넘으면 실행 |
| `checkpoint_completion_target` | 0.9 | dirty page flush를 다음 checkpoint까지 분산하는 비율 |

`checkpoint_timeout`과 `max_wal_size` 중 **먼저 도달하는 조건**이 checkpoint를 트리거합니다.

write가 많은 환경에서 로그에 이런 메시지가 자주 보인다면:

```
LOG: checkpoints are occurring too frequently (15 seconds apart)
HINT: Consider increasing the configuration parameter "max_wal_size".
```

이는 `max_wal_size`에 먼저 도달해서 5분을 기다리지 못하고 checkpoint가 발생하는 상황입니다. `max_wal_size`를 늘려야 합니다. 2GB ~ 8GB가 일반적이고, write가 매우 많으면 16GB까지도 설정합니다.

`checkpoint_completion_target = 0.9`는 거의 모든 환경에서 기본값 그대로 유지하면 됩니다. 이 값은 dirty page flush를 다음 checkpoint 예정 시점의 90% 구간에 걸쳐 분산시킨다는 의미입니다. 0.5로 낮추면 I/O가 한쪽에 몰리고, 1.0에 가까우면 checkpoint 완료 직전에도 flush가 진행되어 다음 checkpoint와 겹칠 위험이 있습니다.

### checkpoint 상태 확인

checkpoint가 잘 분산되고 있는지 확인하는 방법입니다.

```sql
-- PG 17+: pg_stat_checkpointer
SELECT num_timed,        -- timeout에 의한 정상 checkpoint
       num_requested,    -- WAL 크기 등에 의한 요청 checkpoint
       write_time / 1000 AS write_sec,
       sync_time / 1000 AS sync_sec
FROM pg_stat_checkpointer;

-- PG 16 이하: pg_stat_bgwriter
SELECT checkpoints_timed, checkpoints_req,
       checkpoint_write_time / 1000 AS write_sec,
       checkpoint_sync_time / 1000 AS sync_sec
FROM pg_stat_bgwriter;
```

`num_requested`(PG 16 이하에서는 `checkpoints_req`)가 `num_timed`보다 많다면 `max_wal_size`가 너무 작다는 신호입니다. 이상적으로는 대부분의 checkpoint가 시간 기반(timed)이어야 합니다.

## 실전 장애 시나리오 3가지

이 시리즈에서 다뤘던 내부 구조 지식을 실제 장애 상황에 접목해 봅니다.

### 시나리오 1: idle in transaction으로 인한 bloat 폭증

**증상**: 특별히 트래픽이 늘지 않았는데 쿼리가 점점 느려지고, 테이블 크기가 계속 커진다.

**진단 과정**:

```sql
-- 1. bloat 확인: dead tuple이 많은 테이블
SELECT schemaname, relname, n_dead_tup, n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- 2. autovacuum은 돌고 있는데 왜 못 치우나? → xmin horizon 확인
SELECT pid, state, xact_start, query_start,
       now() - xact_start AS tx_duration,
       LEFT(query, 60) AS query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start;
```

**원인**: 오래 열려있는 트랜잭션이 xmin horizon을 붙잡고 있어서, autovacuum이 실행되어도 dead tuple을 회수할 수 없는 상태.

**해결**:
1. 당장: 문제가 되는 idle in transaction 세션을 `pg_terminate_backend()`로 종료
2. 방지: `idle_in_transaction_session_timeout = '5min'` 설정
3. 근본: 애플리케이션에서 트랜잭션을 빠르게 닫도록 수정 (ORM의 autocommit 설정 확인)
4. bloat가 이미 심하면 `pg_repack`으로 테이블 재구성 (VACUUM은 공간을 OS에 반환하지 않음)

### 시나리오 2: wraparound 경고

**증상**: PostgreSQL 로그에 다음과 같은 경고가 나타난다.

```
WARNING: database "mydb" must be vacuumed within 10000000 transactions
HINT: To avoid XID assignment failures, execute a database-wide VACUUM in that database.
```

이 메시지가 나오면 심각한 상황입니다. 조치하지 않으면 PostgreSQL은 데이터 보호를 위해 **새 XID를 할당하는 명령(쓰기 트랜잭션)을 거부**합니다. 읽기 전용 트랜잭션은 여전히 시작할 수 있지만, INSERT, UPDATE, DELETE 등 데이터를 변경하는 명령은 실행할 수 없게 됩니다.

**진단 과정**:

```sql
-- 가장 오래된 frozen xid를 가진 테이블 확인
SELECT c.oid::regclass AS table_name,
       age(c.relfrozenxid) AS xid_age,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY age(c.relfrozenxid) DESC
LIMIT 10;
```

**원인**: 대형 테이블에서 autovacuum의 cost throttling 때문에 freeze가 쓰기 속도를 따라가지 못한 상황. 또는 [replication slot](/postgres/replication/)이 비활성 상태로 방치되어 VACUUM이 차단된 경우.

**해결**:
1. 당장: 가장 오래된 테이블에 수동 VACUUM FREEZE 실행
   ```sql
   VACUUM (FREEZE, VERBOSE) orders;
   ```
2. autovacuum 속도 향상: `autovacuum_vacuum_cost_limit`을 올리고, 해당 테이블의 `autovacuum_freeze_max_age`를 낮춤
3. 비활성 replication slot이 있다면 삭제
   ```sql
   SELECT slot_name, active FROM pg_replication_slots;
   -- 비활성 슬롯 삭제
   SELECT pg_drop_replication_slot('inactive_slot_name');
   ```

### 시나리오 3: 커넥션 폭증과 OOM

**증상**: 애플리케이션에서 "FATAL: sorry, too many clients already" 에러가 발생하거나, 서버가 OOM killer에 의해 프로세스가 종료된다.

**진단 과정**:

```sql
-- 현재 커넥션 현황
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state
ORDER BY count(*) DESC;

-- 대부분이 idle이라면 → pooling 미적용 의심
-- idle in transaction이 많다면 → 트랜잭션 관리 문제
```

**원인**: connection pooling 없이 `max_connections`을 높게 잡고 운영. 서비스 트래픽이 늘면서 커넥션이 급증하고, 각 프로세스의 메모리(기본 + work_mem 연산)가 합산되어 물리 메모리를 초과.

**해결**:
1. **PgBouncer 도입**: 실제 PostgreSQL 커넥션을 30~50개로 제한하고, 클라이언트 커넥션은 PgBouncer가 관리
2. **max_connections 축소**: pooling 도입 후 max_connections을 실제 필요한 수준(50~100)으로 줄임
3. **work_mem 확인**: 전역 work_mem이 너무 높지 않은지 확인. 동시 활성 쿼리 수 × 쿼리당 연산 수 × work_mem의 곱이 가용 메모리를 넘지 않도록
4. `superuser_reserved_connections`(기본 3)은 건드리지 않기. 장애 상황에서 관리자가 접속할 통로

## 파라미터 변경의 실전 규칙

PostgreSQL 파라미터는 변경 시 **적용 방식**이 다릅니다.

| context | 적용 방법 | 예시 |
|---------|----------|------|
| `postmaster` | 서버 재시작 필요 | `shared_buffers`, `max_connections`, `wal_level`, `autovacuum_max_workers` |
| `sighup` | `SELECT pg_reload_conf()` 또는 `pg_ctl reload` | `autovacuum_vacuum_cost_limit`, `checkpoint_timeout`, `checkpoint_completion_target` |
| `user` | 세션 단위로 `SET` 가능 (reload로도 전역 적용 가능) | `work_mem`, `maintenance_work_mem`, `effective_cache_size`, `statement_timeout` |

어떤 파라미터가 어떤 context인지 확인하려면:

```sql
SELECT name, context, setting, unit, pending_restart
FROM pg_settings
WHERE name IN ('shared_buffers', 'work_mem', 'max_connections',
               'autovacuum_vacuum_cost_limit', 'checkpoint_timeout');
```

`pending_restart = true`인 파라미터가 있다면 `ALTER SYSTEM`으로 값을 바꿨지만 아직 재시작하지 않은 것입니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 튜닝의 기본 원칙</strong><br>
  <strong>한 번에 하나만 바꾸고, 전후를 측정하라.</strong> 여러 파라미터를 동시에 바꾸면 어떤 변경이 효과가 있었는지 알 수 없습니다. 변경 전 <code>pg_stat_statements</code>를 리셋하고, 변경 후 동일 워크로드에서 상위 쿼리의 실행 시간과 블록 I/O를 비교하는 습관이 좋습니다.
</div>

## 마치며

이 시리즈는 [아키텍처](/postgres/architecture-overview/)에서 프로세스 구조를 훑고, [페이지와 튜플](/postgres/heap-page-tuple/)부터 [MVCC](/postgres/mvcc-visibility/)까지 저장 계층을 파고들었습니다. [인덱스](/postgres/btree-anatomy/)와 [플래너](/postgres/planner-statistics/)가 어떻게 쿼리를 최적화하는지, [VACUUM](/postgres/vacuum-and-bloat/)이 왜 필요한지, [WAL](/postgres/wal-and-checkpoint/)이 어떻게 데이터를 지키는지를 따라왔습니다.

결국 하나의 메시지로 수렴합니다. **PostgreSQL이 왜 그렇게 동작하는지를 알면, 장애 대응이 추측에서 추론으로 바뀝니다.** "일단 인덱스를 추가해보자"가 아니라 "플래너 통계가 오래되어서 selectivity 추정이 틀린 것 같다"로, "메모리를 늘려보자"가 아니라 "work_mem이 부족해서 Hash Join이 디스크로 내려간 것 같다"로 바뀝니다.

이 시리즈가 그 추론의 출발점이 되었기를 바랍니다.

---

## 참고자료

- [PostgreSQL 18 공식 문서: Chapter 20. Server Configuration](https://www.postgresql.org/docs/18/runtime-config.html)
- [PostgreSQL 18 공식 문서: Chapter 25. Routine Database Maintenance Tasks](https://www.postgresql.org/docs/18/maintenance.html)
- [PgBouncer 공식 문서](https://www.pgbouncer.org/)
- [Crunchy Data: PostgreSQL Connection Pooling](https://www.crunchydata.com/blog)
- [EDB: Tuning PostgreSQL for Performance](https://www.enterprisedb.com/blog)
