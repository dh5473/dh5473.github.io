---
date: '2026-04-11'
title: 'PostgreSQL 아키텍처 한눈에 보기'
category: 'Database'
series: 'postgres'
seriesOrder: 1
tags: ['PostgreSQL', 'Architecture', 'Process Model', 'Shared Memory']
summary: 'PostgreSQL이 왜 프로세스 덩어리로 돌아가는지, 쿼리 한 줄이 postmaster → backend → shared memory → executor를 어떻게 지나가는지 따라가며 시리즈 14편의 지도를 그립니다.'
thumbnail: './thumbnail.png'
---

"PostgreSQL은 어떻게 동작하는가"라는 질문에는 두 가지 답이 있습니다. 하나는 SQL 레벨의 답입니다. `SELECT`를 던지면 결과가 돌아오고, 트랜잭션을 열면 격리가 보장된다는 식이죠. 다른 하나는 운영체제 레벨의 답입니다. 그 SQL 한 줄을 받아서 결과로 만드는 과정에서 도대체 어떤 프로세스가, 어떤 메모리에 접근해서, 어떤 파일을 읽고 쓰는가. 이 두 번째 답을 모르고도 PostgreSQL을 쓸 수는 있지만, 운영하다 보면 결국 알아야 하는 순간이 옵니다. 커넥션 수가 어느 선을 넘으면 latency가 갑자기 튀고, autovacuum이 멈춘 것 같은 증상이 나오고, "왜 같은 쿼리가 어떤 날은 빠르고 어떤 날은 느린가"를 묻게 될 때입니다.

이 시리즈는 두 번째 답을 따라갑니다. 그 출발점으로 첫 글에서는 PostgreSQL이라는 데이터베이스가 한 대의 서버 안에서 어떤 모습으로 살아 있는지를 둘러봅니다. 가장 직관적인 시작은 동작 중인 서버에 접속해 프로세스 목록을 한 번 들여다보는 것입니다.

```
$ ps -ef | grep postgres
postgres  1021     1  0  postgres -D /var/lib/postgresql/data
postgres  1023  1021  0  postgres: checkpointer
postgres  1024  1021  0  postgres: background writer
postgres  1025  1021  0  postgres: walwriter
postgres  1026  1021  0  postgres: autovacuum launcher
postgres  1027  1021  0  postgres: logical replication launcher
postgres  1028  1021  0  postgres: io worker 0
postgres  1029  1021  0  postgres: io worker 1
postgres  1030  1021  0  postgres: io worker 2
postgres  2341  1021  0  postgres: myapp appuser 10.0.1.5(52014) idle
postgres  2342  1021  0  postgres: myapp appuser 10.0.1.5(52015) SELECT
```

수십 개의 프로세스가 뜹니다. PID 1021 하나가 부모(postmaster)이고 나머지는 모두 그 자식들인데, 각자 역할이 다릅니다. `checkpointer`, `walwriter`, `autovacuum launcher` 같은 시스템 프로세스가 옆에서 dirty buffer 정리·WAL 기록·VACUUM 스케줄링을 나눠 맡고 있고, 그 사이에 `appuser 10.0.1.5(52015) SELECT` 같은 줄이 섞여 있습니다. 마지막 줄이 바로 방금 던진 쿼리를 처리하고 있는 backend 프로세스입니다. 클라이언트 한 명이 한 프로세스를 차지하고 있는 모습입니다.

PostgreSQL은 이렇게 "프로세스 덩어리"로 돌아갑니다. MySQL에서 넘어오면 제일 먼저 낯선 부분입니다. MySQL은 커넥션마다 OS thread를 쓰지만, Postgres는 **커넥션마다 OS 프로세스를 fork**합니다. 이 한 가지 선택에서 Postgres의 거의 모든 운영 특성, 즉 강한 fault isolation, 무거운 커넥션 비용, 그리고 PgBouncer가 사실상 필수가 되는 이유가 모두 파생됩니다.

<br>

이 글에서는 그 "프로세스 덩어리"의 전체 지형을 둘러봅니다. postmaster가 어떻게 커넥션을 fork하는지, shared memory에 뭐가 들어 있는지, 그리고 `SELECT` 한 줄이 parser → planner → executor → storage를 어떻게 지나가는지까지.

## Postgres는 왜 "프로세스 덩어리"로 돌아갈까?

Postgres의 프로세스 모델을 한 줄로 요약하면 이렇습니다.

> **하나의 부모가 있고, 커넥션마다 자식을 fork한다. 그리고 공통 작업을 하는 background 프로세스 몇 개가 옆에서 돌아간다.** 여기서 부모가 postmaster입니다.

왜 thread가 아니라 process일까요? Postgres 코드베이스가 처음 설계되던 1980년대 후반\~90년대 초반에는 쓸 만한 thread 라이브러리가 없었다는 역사적 이유도 있지만, 지금까지 이 모델을 유지하는 건 **fault isolation** 때문입니다.

프로세스 하나가 segfault로 죽어도 OS가 그 프로세스의 메모리를 회수해줍니다. 다른 커넥션들은 영향을 받지 않고, postmaster가 문제를 감지해 공유 메모리를 정리한 뒤 나머지 backend를 안전하게 재시작시킵니다. thread 모델이라면 한 세션이 메모리를 밟는 순간 프로세스 전체가 함께 무너집니다. "DB는 절대 죽지 않아야 한다"는 Postgres 설계 철학에서, 이 격리는 양보할 수 없는 지점이었습니다.

대신 대가가 있습니다.

- **fork 비용**: 커넥션 하나를 여는 데 `fork()` + shared memory attach + 초기화가 필요합니다. 수 ms 수준이지만, 웹 서버가 매 요청마다 커넥션을 만들고 닫으면 이게 누적됩니다.
- **커넥션당 메모리**: 각 backend는 `work_mem`, catalog cache, plan cache 등으로 수 MB의 private 메모리를 가집니다. 커넥션 1,000개면 단순 계산으로도 수 GB입니다.
- **proc array 경합**: 동시에 살아있는 모든 backend의 상태를 담는 `proc array`는 트랜잭션이 스냅샷을 취할 때(`GetSnapshotData`)마다 선형으로 스캔됩니다. 커넥션이 많아질수록 스냅샷 한 번에 훑어야 할 slot이 늘어나고, 동시에 proc array에 걸리는 lock 경합도 심해집니다.

그래서 Postgres의 `max_connections`는 MySQL의 `max_connections`와 같은 단위로 생각하면 안 됩니다. 수천 개의 동시 커넥션은 현실적이지 않고, 애플리케이션 앞에 **PgBouncer 같은 connection pooler**를 두어서 수천 개의 클라이언트 연결을 수십\~수백 개의 backend로 multiplex하는 게 표준 구성입니다.

## postmaster와 background 프로세스들

`postmaster`는 Postgres 서버의 부모 프로세스입니다. `pg_ctl start`나 `systemctl start postgresql`이 실제로 띄우는 건 이 녀석 하나입니다. 역할은 세 가지입니다.

1. **포트 5432에서 listen**하며 들어오는 커넥션을 수락
2. 수락된 커넥션마다 **backend 프로세스를 fork**
3. **background 프로세스들을 기동하고 감시**: 죽으면 재시작

부모 입장에서 본 Postgres의 구조는 이렇습니다.

```
postmaster (PID 1021)
├── checkpointer
├── background writer
├── walwriter
├── autovacuum launcher
│   └── autovacuum worker (필요할 때 기동)
├── logical replication launcher
│   └── logical replication worker
├── io worker 0..2  (PG 18 기본 io_method=worker)
├── backend (appuser 10.0.1.5: SELECT)
├── backend (appuser 10.0.1.5: idle)
└── backend (other_user: COMMIT)
```

`postmaster`는 Postgres 초창기부터 쓰인 이름이지만, 실제 실행 파일명과 `ps` 출력에서 보이는 이름은 그냥 `postgres`입니다. 제일 위의 PID가 부모이고 나머지가 자식이라고 읽으면 됩니다.

background 프로세스 중 자주 마주치는 것들만 정리해봅시다.

| 프로세스 | 역할 |
|---------|------|
| **checkpointer** | checkpoint 시점에 shared_buffers의 dirty page를 모두 디스크에 flush하고 WAL에 checkpoint 레코드 기록 |
| **background writer** | shared_buffers에 clean buffer가 부족해지기 전에 일부 dirty buffer를 미리 flush해서, backend가 쿼리 처리 도중 직접 write하지 않아도 되도록 함 |
| **walwriter** | WAL buffer의 내용을 `pg_wal` 파일에 주기적으로 flush. `synchronous_commit=off`일 때 특히 중요 |
| **autovacuum launcher** | dead tuple이 쌓인 테이블을 감지하고, autovacuum worker가 필요하다는 신호를 postmaster에 보냄 (실제 fork는 postmaster가 수행) |
| **logical replication launcher** | logical replication의 apply/sync worker를 관리 |
| **io worker** (PG 18+) | `io_method=worker` 모드(기본값)에서 비동기 I/O 요청을 처리. `io_workers` 파라미터로 개수 조절(기본 3) |

이 외에도 `archiver`(WAL 아카이빙), `logging collector`(로그 파일 기록) 같은 프로세스가 설정에 따라 추가로 뜹니다. background writer에 대해 "checkpoint 부담을 분산시킨다"는 설명이 인터넷에 자주 돌아다니는데, 공식 문서의 표현을 엄밀히 따지면 주 목적은 **clean buffer 확보**이고 checkpoint 부담 분산은 부수 효과에 가깝습니다.

### PG 15: stats collector가 사라졌습니다

PostgreSQL 14 이전까지는 `stats collector`라는 별도 프로세스가 있었습니다. 각 backend가 UDP 패킷으로 통계 정보(테이블 접근 횟수, 튜플 변경량 등)를 이 프로세스에 보내고, `stats collector`는 그걸 파일로 덤프하는 방식이었습니다. 파일 I/O와 UDP drop 때문에 통계가 조금씩 밀리거나 유실되는 고질적인 문제가 있었습니다.

Postgres 15부터 이 구조가 완전히 바뀌었습니다. 공식 릴리즈 노트를 그대로 인용하면:

> Store cumulative statistics system data in shared memory. [...] There is no longer a separate statistics collector process.

이제 각 backend가 통계를 로컬에서 모았다가 주기적으로 **shared memory에 flush**합니다. UDP도 없고 파일도 없습니다. PG 15 이후 서버에서 `ps`를 쳤는데 `stats collector`가 안 보인다면 그건 정상입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고: PG 18의 비동기 I/O</strong><br>
  Postgres 18부터 비동기 I/O subsystem(<code>io_method</code> 설정)이 도입됐습니다. 기본값은 <code>worker</code>이고, 이 모드에서는 별도의 io worker 프로세스(<code>io_workers</code> 기본 3개)가 큐에 쌓인 I/O 요청을 백엔드 대신 처리합니다. Linux에서 <code>io_method=io_uring</code>으로 두면 io worker 없이 backend가 직접 커널 큐(io_uring)에 제출하는 방식으로 동작합니다. 이 기능으로 sequential scan, bitmap heap scan, VACUUM 같은 대량 읽기의 체감 성능이 개선됐고, <code>effective_io_concurrency</code> 기본값도 1에서 16으로 상향됐습니다.
</div>

## Backend process: 내 연결이 사는 곳

클라이언트가 `psql` 또는 애플리케이션 드라이버(psycopg, pg, asyncpg 등)로 Postgres에 접속하면, postmaster는 해당 커넥션을 위해 `fork()`로 backend 프로세스를 하나 만듭니다. 이 backend가 커넥션이 살아있는 동안 **그 클라이언트의 모든 쿼리를 처리**합니다. 다른 커넥션의 backend와는 private 메모리를 공유하지 않습니다.

현재 커넥션이 붙어 있는 backend의 PID는 `pg_backend_pid()`로 확인할 수 있습니다.

```sql
SELECT pg_backend_pid();
```

| pg_backend_pid |
|----------------|
| 2342 |

그리고 `pg_stat_activity` 뷰로 서버에 살아있는 모든 backend를 볼 수 있습니다.

```sql
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
       LEFT(query, 40) AS query
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

| pid | usename | application_name | state | wait_event_type | wait_event | query |
|-----|---------|------------------|-------|-----------------|------------|-------|
| 2341 | appuser | myapp | idle | | | COMMIT |
| 2342 | appuser | myapp | active | | | SELECT pid, usename, application_name |
| 2418 | appuser | myapp | idle in transaction | Client | ClientRead | UPDATE users SET last_seen ... |

`state`가 `active`면 지금 쿼리를 돌리는 중, `idle`이면 트랜잭션 없이 커넥션만 붙잡고 있는 상태, `idle in transaction`은 트랜잭션을 연 채로 아무것도 안 하고 있는 위험한 상태입니다. 세 번째 상태는 실제로 운영 환경에서 자주 문제가 되는데, 이유는 이렇습니다. 트랜잭션이 열려 있는 동안 해당 backend의 `backend_xmin`이 고정되면서 시스템 전체의 xmin horizon을 뒤로 끌어당깁니다. autovacuum은 xmin horizon보다 뒤에 있는 dead tuple을 "다른 트랜잭션이 여전히 볼 가능성이 있다"는 이유로 회수하지 못하고, 결과적으로 bloat가 누적됩니다. 애플리케이션 코드에서 예외 경로로 commit/rollback이 빠지거나, ORM이 트랜잭션을 암묵적으로 열어둔 채 long-running 작업을 도는 경우가 대표적인 시나리오입니다.

backend가 쓰는 메모리는 두 종류입니다. **private 메모리**는 해당 프로세스만 쓰는 work_mem, catalog cache 등이고, **shared memory**는 다른 backend와 공유하는 버퍼 풀, WAL 버퍼 등입니다. 다음 섹션은 이 shared memory 이야기입니다.

## Shared memory: 프로세스들이 만나는 광장

프로세스가 분리되어 있으면 서로 데이터를 어떻게 주고받을까요? Postgres는 서버 시작 시 운영체제에 **한 덩어리의 shared memory**를 요청해두고, 모든 backend와 background 프로세스가 거기에 `attach`합니다. 이 shared memory가 테이블 페이지 캐시, WAL 버퍼, 락 테이블, 트랜잭션 상태 등 **프로세스들이 협력하는 데 필요한 모든 공용 자료구조**를 담습니다.

주요 영역을 간단히 보면 이렇습니다.

```
┌─────────────────────────────────────────────────────────┐
│                  Shared Memory                          │
├─────────────────────────────────────────────────────────┤
│  shared_buffers    테이블/인덱스 페이지 캐시 (8KB 블록)    │
│                    기본 128MB, 권장 RAM의 25%             │
├─────────────────────────────────────────────────────────┤
│  WAL buffers       WAL 레코드 쓰기 전 버퍼                │
│                    기본 -1 (shared_buffers의 1/32)        │
├─────────────────────────────────────────────────────────┤
│  proc array        살아있는 backend의 상태 목록           │
│                    (xmin, xmax, snapshot 계산에 사용)     │
├─────────────────────────────────────────────────────────┤
│  lock table        heavyweight lock 관리                 │
├─────────────────────────────────────────────────────────┤
│  CLOG (pg_xact)    트랜잭션 상태 비트맵                   │
│                    (진행 중 / 커밋 / 롤백)                │
├─────────────────────────────────────────────────────────┤
│  cumulative stats  PG 15+ 통계 데이터                    │
├─────────────────────────────────────────────────────────┤
│  multixact, predicate locks, replication slots, ...     │
└─────────────────────────────────────────────────────────┘
```

주요 영역 세 가지를 짚어봅시다.

**shared_buffers**는 Postgres가 디스크에서 읽어온 8KB 페이지를 캐싱하는 공간입니다. 기본값은 128MB이지만, 전용 서버라면 공식 문서가 권장하는 출발점은 물리 메모리의 25% 정도입니다. 더 크게 잡는다고 해서 무조건 빨라지지 않습니다. OS의 페이지 캐시와 이중으로 캐싱되기 때문에 40%를 넘기면 효과가 빠르게 감소한다고 공식 문서도 언급합니다. 이 파라미터는 **서버 시작 시에만 변경 가능**합니다.

**WAL buffers**는 트랜잭션이 write한 WAL 레코드가 디스크로 flush되기 전 잠깐 머무는 공간입니다. 기본값 `-1`은 "자동 계산"을 의미하고, 실제 공식은 `shared_buffers`의 1/32, 단 최소 64kB, 최대 WAL 세그먼트 크기(보통 16MB)입니다. 대부분의 환경에서 기본값 그대로 두면 됩니다.

**CLOG**(commit log, 파일 시스템상 경로는 `pg_xact`)는 "트랜잭션 N번은 커밋됐나, 롤백됐나, 아직 진행 중인가"를 2비트로 기록한 테이블입니다. MVCC 가시성을 판정할 때마다 이 테이블을 참조합니다. 과거에는 `pg_clog`라는 이름이었는데, 일반 테이블인 `pg_class` 같은 이름과 혼동된다는 이유로 PG 10부터 `pg_xact`로 개명됐습니다.

실제로 지금 서버의 shared memory 할당 상태는 `pg_shmem_allocations` 뷰로 직접 들여다볼 수 있는데, 이 뷰의 사용 예시는 뒤쪽 실험 섹션에서 다룹니다.

## 쿼리 한 줄이 지나가는 경로

`psql`에서 `SELECT * FROM users WHERE email = 'foo@bar.com';`을 엔터로 쳤을 때, 이 한 줄이 서버 내부에서 거쳐가는 경로를 따라가봅시다. 공식 문서의 [Query Path](https://www.postgresql.org/docs/18/query-path.html) 는 이 과정을 **connection → parser → rewrite → planner → executor** 5단계로 기술하는데, 여기에 클라이언트↔서버 네트워크 경계와 storage 경계까지 포함하면 아래와 같습니다.

```
┌──────────┐
│  client  │  psql, psycopg, pg, asyncpg, ...
└────┬─────┘
     │ ① libpq 프론트엔드/백엔드 프로토콜 (TCP 5432)
     ▼
┌──────────┐
│postmaster│  ② accept() → fork() → backend 인계
└────┬─────┘
     │
     ▼
┌──────────┐
│ backend  │
│          │  ③ parser       SQL 문자열 → parse tree → query tree
│          │  ④ rewriter     view/rule 확장
│          │  ⑤ planner      cost 기반으로 plan 선택
│          │  ⑥ executor     plan 노드를 실행
└────┬─────┘
     │
     ▼
┌──────────┐
│  storage │  shared_buffers hit? → yes면 메모리에서
│          │                     → no면 OS로부터 read
└──────────┘
```

### ① libpq: 네트워크 경계

클라이언트 드라이버는 TCP 5432 포트로 Postgres 서버에 연결하고, **FE/BE 프로토콜**이라는 Postgres 전용 프로토콜로 메시지를 주고받습니다. 이 프로토콜은 "쿼리 보내기", "결과 받기" 같은 단순한 메시지만 있는 게 아니라, prepared statement 바인딩, COPY 스트림, 에러 알림 등 Postgres의 모든 기능을 담고 있습니다. `psycopg`나 `pg` 같은 드라이버가 하는 일이 결국 이 프로토콜을 구현하는 것입니다.

### ② postmaster accept와 fork

postmaster는 `accept()`로 새 커넥션을 받은 뒤 `fork()`해서 backend 프로세스를 만듭니다. 새로 만들어진 backend는 부모로부터 shared memory 매핑을 그대로 상속받은 채 시작해 `pg_hba.conf` 기반 인증을 수행하고, 세션 초기화를 거쳐 쿼리를 기다리는 상태로 들어갑니다.

여기서 중요한 점 하나. **이미 맺어진 커넥션**에서는 postmaster를 다시 거치지 않습니다. 같은 backend가 그대로 다음 쿼리를 처리합니다. 그래서 connection pooling이 효과가 있습니다. fork 비용과 인증 비용을 한 번만 내고, 이후의 모든 쿼리는 ③부터 시작합니다.

### ③ Parser: SQL 문자열을 트리로

backend는 받은 SQL 문자열을 lexer/parser로 통과시켜 **parse tree**를 만든 뒤, 이어서 `parse_analyze`가 parse tree의 이름들을 실제 카탈로그(`pg_class`, `pg_attribute` 등)와 매칭해 OID로 바꾸고 타입 체크를 수행해 **query tree**를 완성합니다. 공식 문서의 단계 구분에서는 이 두 작업이 "parser 단계" 하나로 묶여 있습니다. "테이블이 없습니다", "컬럼이 없습니다" 같은 에러가 나오는 지점도 여기입니다. 카탈로그를 자주 조회하는 단계라 backend의 private 메모리에 있는 `catalog cache`가 큰 역할을 합니다.

### ④ Rewriter: view와 rule 확장

query tree에 view가 포함돼 있으면 rewriter가 view의 정의를 펼쳐서 원래 쿼리에 합쳐 넣습니다. rule system도 같은 단계에서 적용됩니다. 대부분의 평범한 쿼리에서는 이 단계가 거의 아무것도 하지 않고 지나갑니다.

### ⑤ Planner/Optimizer: 가장 빠른 경로 선택

쿼리 경로에서 가장 중요한 단계입니다. planner는 query tree를 받아서 "어떤 인덱스를 쓸까, 어떤 조인 순서로 갈까, 어떤 조인 알고리즘을 쓸까"를 결정합니다. 기준은 `pg_statistic`에 쌓여 있는 통계와 cost 파라미터(`seq_page_cost`, `random_page_cost`, `cpu_tuple_cost` 등)입니다. 여러 개의 후보 plan을 만든 뒤 제일 cost가 싼 걸 고릅니다.

여기서 고른 plan이 `EXPLAIN`으로 출력되는 바로 그 트리입니다. 같은 SQL 한 줄이 테이블 크기·통계 상태·설정에 따라 전혀 다른 plan으로 번역될 수 있다는 점이 Postgres 튜닝의 거의 모든 출발점입니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>Parser와 rewriter는 "SQL 문자열을 내부 트리로 바꾸는" 앞단 작업으로, 대부분의 경우 병목이 아님</li>
    <li>Planner가 <code>pg_statistic</code>의 통계와 cost 파라미터로 최적 plan을 선택</li>
    <li>Executor는 그 plan 트리를 노드별 iterator 방식으로 실행하며 storage 경계를 넘나듦. <code>EXPLAIN (ANALYZE, BUFFERS)</code>의 <code>shared hit/read</code>로 측정 가능</li>
  </ul>
</div>

### ⑥ Executor: plan 트리를 실행

executor는 planner가 준 plan 트리를 공식 문서가 "demand-pull pipeline"이라고 부르는 방식으로 실행합니다(업계에서는 Volcano/iterator 모델로 알려진 방식과 같습니다). 각 plan 노드(SeqScan, IndexScan, HashJoin 등)는 `ExecProcNode()`가 호출될 때마다 자식 노드에서 튜플 하나를 끌어올리고, 변환·필터·조인을 거쳐 최상단 노드까지 올립니다. 최상단 튜플이 바로 클라이언트에게 돌아갈 row입니다.

executor가 실제로 데이터를 읽어야 할 때는 storage manager를 통해 shared_buffers를 먼저 들여다봅니다. 찾는 페이지가 이미 캐시되어 있으면 **buffer hit**, 없으면 `read()` 시스템 콜로 OS에게 요청하는 **buffer read**입니다. 이 `read`는 반드시 디스크 I/O를 뜻하지 않습니다. OS 페이지 캐시에서 응답이 오는 경우도 Postgres 입장에서는 똑같이 "read"로 집계됩니다. Postgres가 구분하는 건 "shared_buffers 안에서 찾았나, 아니면 OS에게 물어봤나"까지입니다.

## 실험: 쿼리 한 줄의 족적 따라가기

글로 설명한 경로를 실제 서버에서 눈으로 확인해봅시다. Docker 한 줄이면 됩니다.

```bash
docker run --name pg-arch -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17
docker exec -it pg-arch psql -U postgres
```

### 실험 1: 현재 backend의 정체 확인하기

현재 커넥션의 PID를 확인하고, `pg_stat_activity`에서 그 PID 행을 찾아봅니다.

```sql
SELECT pg_backend_pid();
```

| pg_backend_pid |
|----------------|
| 87 |

```sql
SELECT pid, backend_start, state, query
FROM pg_stat_activity
WHERE pid = pg_backend_pid();
```

| pid | backend_start | state | query |
|-----|---------------|-------|-------|
| 87 | 2025-11-02 14:07:22.118+00 | active | SELECT pid, backend_start, state, query... |

`backend_start`는 postmaster가 이 backend를 fork한 시각입니다. 커넥션을 연 뒤로 이 값은 바뀌지 않습니다. 같은 커넥션에서 쿼리를 몇 번을 실행하든, postmaster를 거치는 건 맨 처음 한 번뿐이라는 증거입니다.

### 실험 2: shared memory 할당 들여다보기

```sql
SELECT name, pg_size_pretty(allocated_size) AS size
FROM pg_shmem_allocations
WHERE allocated_size > 100 * 1024
ORDER BY allocated_size DESC
LIMIT 10;
```

| name | size |
|------|------|
| Buffer Blocks | 128 MB |
| `<anonymous>` | 10 MB |
| Buffer Descriptors | 1024 kB |
| XLOG Ctl | 4224 kB |
| commit_timestamp | 528 kB |
| subtransaction | 528 kB |
| multixact_offset | 264 kB |
| multixact_member | 528 kB |
| Checkpointer Data | 392 kB |
| Xact | 528 kB |

제일 위의 `Buffer Blocks`가 128MB로 가장 크게 잡혀 있는데, 이게 `shared_buffers`의 실체입니다. 그 아래로 WAL 제어 구조(`XLOG Ctl`), 커밋 타임스탬프, subtransaction, multixact, CLOG(`Xact`) 같은 영역이 이어집니다. 앞 섹션에서 설명한 shared memory 블록 다이어그램의 실물이 이 출력입니다.

### 실험 3: shared_buffers hit vs read

executor가 storage 경계를 어떻게 넘는지 직접 보려면 `EXPLAIN (ANALYZE, BUFFERS)`가 가장 좋은 창입니다. 간단한 테이블을 만들어봅시다.

```sql
CREATE TABLE demo AS
SELECT g AS id, md5(g::text) AS val
FROM generate_series(1, 1_000_000) g;
```

캐시를 비우기 위해 컨테이너를 재시작한 뒤 첫 쿼리를 돌립니다.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM demo WHERE id < 10000;
```

```text
                                              QUERY PLAN
------------------------------------------------------------------------------------------------
 Aggregate  (cost=19222.51..19222.52 rows=1 width=8) (actual time=84.312..84.314 rows=1 loops=1)
   Buffers: shared hit=12 read=8334
   ->  Seq Scan on demo  (cost=0.00..19197.51 rows=9995 width=0) (actual time=0.431..83.021 rows=9999)
         Filter: (id < 10000)
         Rows Removed by Filter: 990001
         Buffers: shared hit=12 read=8334
```

곧바로 같은 쿼리를 한 번 더 돌리면 같은 plan 안의 `Buffers` 줄만 달라집니다.

```text
   Buffers: shared hit=8346
```

첫 실행에서는 `shared hit=12 read=8334`가 나옵니다. 필요한 8,346개 페이지 중 12개만 이미 shared_buffers에 있었고, 8,334개는 OS에 `read()`를 요청해서 가져와야 했다는 뜻입니다. 곧바로 같은 쿼리를 다시 돌리면 `shared hit=8346, read=0`으로 바뀝니다. 이번엔 모든 페이지가 이미 shared_buffers에 올라와 있습니다.

`hit`와 `read`는 바로 **executor가 storage 경계를 넘는 횟수**를 센 숫자입니다. 쿼리 튜닝 시에 "같은 쿼리인데 어떤 날은 빠르고 어떤 날은 느린" 현상의 대부분은 이 두 숫자의 비율이 달라진 결과입니다.

## 마치며

PostgreSQL은 "프로세스 덩어리"로 돌아가는 DB이고, 그 덩어리는 사실 잘 짜인 역할 분담입니다. postmaster가 부모로서 커넥션을 받아 fork하고, background 프로세스들이 dirty buffer 정리와 WAL 기록, VACUUM 스케줄링을 나눠 맡고, 각 backend가 shared memory라는 공용 공간에서 데이터를 주고받으며 쿼리를 parser → rewriter → planner → executor로 흘려보냅니다. 운영 중에 마주치는 대부분의 성능/안정성 문제는 이 중 어느 한 단계에 원인이 있고, `ps`, `pg_stat_activity`, `pg_shmem_allocations`, `EXPLAIN (ANALYZE, BUFFERS)` 네 가지만 손에 익혀도 그 위치를 꽤 정확하게 특정할 수 있습니다.

다음 글에서는 여기서 "shared_buffers에 캐싱되는 8KB 페이지"라고만 짚고 지나간 그 페이지 안으로 들어갑니다. 8KB 안에 튜플이 어떻게 들어앉아 있는지, TOAST가 큰 값을 어떻게 떼어내는지, 그리고 튜플 헤더에 박혀 있는 필드가 MVCC의 기반이 되는 과정을 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 19. Server Administration / Chapter 20. Server Configuration](https://www.postgresql.org/docs/18/)
- [`wal_buffers` 기본값 계산식 (runtime-config-wal)](https://www.postgresql.org/docs/18/runtime-config-wal.html)
- [PG 15 Release Notes (shared memory 기반 cumulative statistics)](https://www.postgresql.org/docs/release/15.0/)
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 2: Process and Memory Architecture](https://www.interdb.jp/pg/pgsql02.html)
- PostgreSQL 공식 문서, [Chapter 66. Database Physical Storage](https://www.postgresql.org/docs/18/storage.html): 힙 페이지와 shared_buffers 캐싱 단위
- Bruce Momjian, [PostgreSQL Technical Writings](https://momjian.us/main/writings/pgsql/): Postgres 내부 구조 관련 글 모음
