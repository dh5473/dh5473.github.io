---
date: '2026-05-03'
title: 'Streaming Replication과 Logical Replication: WAL을 네트워크로 보내는 두 가지 방법'
category: 'Database'
series: 'postgres'
seriesOrder: 12
tags: ['PostgreSQL', 'Replication', 'Streaming Replication', 'Logical Replication', 'High Availability']
summary: 'WAL 바이트를 그대로 보내는 Streaming Replication과 row 단위로 디코딩하는 Logical Replication의 아키텍처, replication slot의 역할, hot standby 쿼리 충돌이 생기는 이유, 그리고 lag 측정과 failover까지 따라갑니다.'
thumbnail: './thumbnail.png'
---

[이전 글](/postgres/wal-and-checkpoint/)에서 WAL의 원칙을 봤습니다. 데이터를 바꾸기 전에 로그를 먼저 쓰고, crash가 나면 그 로그를 replay해서 복원한다. 이 메커니즘 덕분에 한 서버 안에서는 데이터가 안전합니다.

그런데 서버 자체가 죽으면 어떻게 될까요? 디스크가 물리적으로 고장 나거나 서버가 통째로 날아가면, WAL이 아무리 완벽해도 소용이 없습니다. 서비스 DB가 한 대뿐이라면 복구할 때까지의 시간이 곧 장애 시간입니다.

해결책은 단순합니다. WAL을 다른 서버에도 보내두면 됩니다. primary가 죽으면 WAL을 미리 받아둔 standby가 즉시 서비스를 이어받을 수 있습니다. 이 글에서는 WAL을 네트워크로 보내는 두 가지 방식, Streaming Replication과 Logical Replication의 아키텍처를 따라갑니다.

## 두 가지 방식의 차이

WAL을 다른 서버로 보내는 방법은 두 가지입니다.

**Streaming Replication**은 WAL record를 바이트 그대로 전송합니다. standby는 primary의 물리적 복제본이 됩니다. 데이터 파일이 byte-for-byte로 동일하고, standby에서는 읽기만 가능합니다.

**Logical Replication**은 WAL을 디코딩해서 INSERT/UPDATE/DELETE 단위의 논리적 변경으로 변환한 뒤 전송합니다. 특정 테이블만 골라서 복제할 수 있고, 받는 쪽은 독립된 데이터베이스이므로 자체 인덱스나 추가 테이블을 가질 수 있습니다.

| 구분 | Streaming | Logical |
|------|-----------|---------|
| 전송 단위 | WAL 바이트 스트림 | 디코딩된 row 변경 |
| 복제 범위 | 클러스터 전체 | 테이블 단위 선택 |
| standby 쓰기 | 불가(read-only) | 가능(독립 DB) |
| 주요 용도 | HA, 읽기 부하 분산 | 부분 복제, 버전 업그레이드 |
| 필요한 wal_level | replica | logical |

`wal_level`은 WAL에 얼마나 많은 정보를 기록할지를 결정합니다. `minimal` → `replica` → `logical` 세 단계가 있고, logical이 replica의 상위 집합입니다. `wal_level=logical`로 설정하면 streaming replication도 함께 사용할 수 있습니다.

## Streaming Replication 아키텍처

### walsender와 walreceiver

Streaming Replication의 핵심은 두 프로세스입니다.

```
Primary                              Standby
┌──────────────────┐                ┌──────────────────┐
│  backend         │                │  startup process │
│  backend         │                │  (WAL redo 적용)  │
│  backend         │                │       ▲          │
│                  │                │       │          │
│  walsender ──────┼── TCP ────────▶│  walreceiver     │
│       ▲          │  WAL 바이트     │       │          │
│       │          │                │       ▼          │
│   pg_wal/        │                │   pg_wal/        │
└──────────────────┘                └──────────────────┘
```

primary 측에서는 standby가 접속할 때마다 postmaster가 **walsender** 프로세스를 fork합니다. 일반 backend처럼 connection당 하나씩 생성되지만, 클라이언트 쿼리가 아니라 WAL 전송만 담당하는 특수한 backend입니다. walsender는 WAL buffer 또는 `pg_wal/` 세그먼트 파일에서 WAL을 읽어 TCP로 전송합니다.

standby 측에서는 **walreceiver**가 primary에 연결을 맺고 WAL을 수신합니다. 받은 WAL은 standby의 `pg_wal/`에 저장되고, **startup process**가 이를 읽어서 redo를 적용합니다. [이전 글](/postgres/wal-and-checkpoint/)에서 봤던 crash recovery와 본질적으로 같은 동작입니다. 차이는 crash recovery가 "WAL 끝까지 replay하고 끝"인 반면, startup process는 **새 WAL이 올 때까지 계속 대기하면서 실시간으로 replay**한다는 것입니다.

### 동기 vs 비동기 복제

기본 설정은 **비동기**(asynchronous)입니다. primary의 COMMIT은 로컬 WAL flush만 기다리고 클라이언트에 응답합니다. standby로의 전송은 best-effort로, primary가 먼저 commit을 확정한 뒤 walsender가 뒤따라 보냅니다. primary crash 시 아직 standby에 도착하지 못한 WAL이 있을 수 있습니다.

**동기**(synchronous) 복제로 바꾸면 COMMIT이 standby의 확인을 기다립니다. `synchronous_standby_names`로 동기 대상을 지정하고, `synchronous_commit` 설정으로 "어디까지 확인할 것인지" 수준을 정합니다.

| synchronous_commit | COMMIT이 기다리는 시점 |
|-------------------|---------------------|
| `off` | 아무것도 기다리지 않음(로컬 flush도 생략) |
| `local` | 로컬 디스크 flush만 |
| `remote_write` | 동기 standby의 OS write |
| `on`(기본) | 동기 standby의 디스크 flush |
| `remote_apply` | 동기 standby가 redo까지 적용 |

`synchronous_standby_names`가 비어 있으면(동기 standby 미지정) `on`은 로컬 flush만 기다립니다. 동기 standby가 설정돼 있을 때 `on`은 `remote_flush`와 같은 의미가 됩니다. [이전 글](/postgres/wal-and-checkpoint/)에서 `synchronous_commit=off`가 로컬 flush도 건너뛰는 설정이었던 것과 연결됩니다. replication에서는 이 스펙트럼이 네트워크 너머까지 확장되는 것입니다.

트레이드오프는 명확합니다. 동기 복제는 COMMIT latency에 네트워크 RTT가 추가됩니다. 같은 데이터센터 안이면 수백 마이크로초 수준이지만, 다른 리전이면 수십 밀리초가 붙습니다. `remote_apply`까지 켜면 standby의 redo 속도까지 latency에 영향을 줍니다.

## Replication Slot

### slot이 해결하는 문제

[이전 글](/postgres/wal-and-checkpoint/)에서 checkpoint 이후 오래된 WAL 세그먼트가 재활용되거나 삭제된다고 했습니다. 그런데 standby가 네트워크 문제로 잠시 끊겼다가 돌아왔는데, 그 사이 필요한 WAL이 이미 primary에서 삭제됐다면? 복제가 끊어집니다. `pg_basebackup`으로 처음부터 다시 세팅해야 합니다.

WAL을 보존하는 방법은 여러 가지입니다. `wal_keep_size`로 최소 보존량을 지정하거나 `archive_command`로 WAL을 별도 저장소에 보관할 수 있지만, 이 방법들은 "standby가 어디까지 소비했는지"를 추적하지 못합니다.

**Replication slot**은 이 문제를 정확히 해결합니다. slot은 "이 consumer가 여기까지 소비했다"는 위치(LSN)를 기록하고, primary는 slot이 가리키는 LSN 이후의 WAL을 삭제하지 않습니다.

### 물리 슬롯과 논리 슬롯

```sql
-- 물리 슬롯: Streaming Replication용
SELECT pg_create_physical_replication_slot('standby1');

-- 논리 슬롯: Logical Replication용
SELECT pg_create_logical_replication_slot('sub1', 'pgoutput');
```

물리 슬롯은 `restart_lsn`(WAL 보존 시작점)만 추적합니다. 논리 슬롯은 여기에 `confirmed_flush_lsn`(구독자가 확인한 마지막 위치)과 `catalog_xmin`(카탈로그 정보 보존을 위한 트랜잭션 경계)이 추가됩니다.

슬롯 상태는 이렇게 확인합니다.

```sql
SELECT slot_name, slot_type, active,
       restart_lsn,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
FROM pg_replication_slots;
```

```
 slot_name | slot_type | active | restart_lsn | retained_bytes
-----------+-----------+--------+-------------+---------------
 standby1  | physical  | t      | 0/5000000   |       16777216
 sub1      | logical   | f      | 0/4000000   |       33554432
```

여기서 `sub1`이 `active = f`(비활성)인데 `retained_bytes`가 32MB나 됩니다. 이것이 slot의 가장 큰 위험입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  비활성 slot은 WAL을 무한히 보존합니다. standby가 죽었는데 slot을 안 지우면 primary의 <code>pg_wal/</code> 디스크가 가득 찹니다. PG 13+에서는 <code>max_slot_wal_keep_size</code>로 slot이 보존할 수 있는 WAL 크기에 상한을 걸 수 있습니다. 이 한도를 넘으면 slot이 무효화(invalidate)됩니다.
</div>

논리 슬롯의 `catalog_xmin`은 [VACUUM 글](/postgres/vacuum-and-bloat/)에서 다뤘던 "VACUUM의 적"과도 연결됩니다. 논리 슬롯이 catalog_xmin을 잡고 있으면 해당 xid 이후의 시스템 카탈로그 변경을 VACUUM이 정리하지 못합니다. long-running transaction이 VACUUM을 막는 것과 같은 원리입니다.

## Hot Standby와 쿼리 충돌

`hot_standby = on`(기본값)이면 standby에서 read-only 쿼리를 실행할 수 있습니다. 읽기 부하를 분산하는 read replica로 활용하는 겁니다. 하지만 공짜는 아닙니다.

### 충돌이 생기는 이유

구체적인 시나리오를 봅시다.

1. standby에서 `SELECT * FROM orders WHERE status = 'pending'`이 실행 중입니다. 큰 테이블이라 Seq Scan으로 시간이 걸리고 있습니다.
2. 그 사이 primary에서 `VACUUM`이 `orders`의 dead tuple을 정리했고, 그 변경이 WAL로 standby에 도착합니다.
3. standby의 startup process가 이 WAL을 redo해야 하는데, 변경 대상 페이지를 SELECT가 아직 읽고 있습니다.

충돌에는 두 가지 유형이 있습니다. SELECT가 페이지에 buffer pin을 잡고 있어서 startup process가 해당 페이지를 수정하지 못하는 **buffer pin 충돌**, 그리고 VACUUM redo가 제거하려는 dead tuple을 SELECT의 snapshot이 아직 참조하고 있는 **snapshot 충돌**입니다.

어느 경우든 startup process에게는 두 가지 선택지가 있습니다.

- redo를 기다린다 → SELECT가 끝날 때까지 **replication lag이 계속 쌓인다**
- SELECT를 강제로 cancel한다 → 사용자가 에러를 받는다

`max_standby_streaming_delay`(기본 30초)가 이 판단을 결정합니다. startup process가 이 시간만큼 기다려도 충돌이 해소되지 않으면 쿼리를 cancel합니다.

```
ERROR: canceling statement due to conflict with recovery
DETAIL: User was holding shared buffer pin for too long.
```

`-1`로 설정하면 redo가 무한 대기합니다. 분석 쿼리가 중요한 read replica에서 쓸 수 있지만, lag이 끝없이 쌓일 수 있습니다. `0`이면 즉시 cancel입니다.

### 충돌 통계 확인

어떤 종류의 충돌이 얼마나 발생하는지는 standby에서 확인할 수 있습니다.

```sql
SELECT datname, confl_tablespace, confl_lock,
       confl_snapshot, confl_bufferpin, confl_deadlock
FROM pg_stat_database_conflicts;
```

`confl_snapshot`이 높다면 VACUUM redo와 쿼리의 충돌이 주원인입니다.

### hot_standby_feedback

`hot_standby_feedback = on`을 설정하면 standby가 자기 쿼리의 xmin을 primary에 주기적으로 알려줍니다. primary의 VACUUM은 이 xmin 이후에 삭제 처리된 dead tuple을 정리하지 않으므로, standby에서의 충돌이 줄어듭니다.

단, 이는 [VACUUM 글](/postgres/vacuum-and-bloat/)에서 봤던 "long-running transaction이 VACUUM을 막는" 상황을 primary에 만드는 것과 같습니다. standby에서 오래 도는 분석 쿼리가 있으면 primary의 bloat가 늘어날 수 있습니다. 충돌 감소와 primary bloat 사이의 트레이드오프입니다.

## Logical Replication

Streaming Replication의 구조와 운영 이슈를 봤으니, 이제 WAL을 다루는 다른 방식으로 넘어갑니다.

### Logical Decoding

Streaming Replication이 WAL 바이트를 그대로 보내는 반면, Logical Replication은 WAL을 먼저 **디코딩**합니다. WAL record를 해석해서 "어떤 테이블의 어떤 row가 INSERT/UPDATE/DELETE됐는지"를 논리적 변경으로 변환하는 것입니다.

이 변환을 담당하는 것이 **output plugin**입니다. PostgreSQL 기본 제공 플러그인은 `pgoutput`이고, publication/subscription 기능이 이를 사용합니다.

`test_decoding` 플러그인으로 logical decoding이 실제로 어떻게 동작하는지 확인할 수 있습니다.

```sql
-- 논리 슬롯 생성 (test_decoding 플러그인)
SELECT pg_create_logical_replication_slot('test_slot', 'test_decoding');

-- 데이터 변경
BEGIN;
INSERT INTO accounts VALUES (3, 500);
UPDATE accounts SET balance = 600 WHERE id = 3;
COMMIT;

-- 디코딩된 변경 확인
SELECT lsn, xid, data FROM pg_logical_slot_get_changes('test_slot', NULL, NULL);
```

```
    lsn     | xid |                          data
------------+-----+--------------------------------------------------------
 0/1A02000  | 741 | BEGIN 741
 0/1A02000  | 741 | table public.accounts: INSERT: id[integer]:3 balance[integer]:500
 0/1A02100  | 741 | table public.accounts: UPDATE: id[integer]:3 balance[integer]:600
 0/1A02180  | 741 | COMMIT 741
```

WAL의 바이너리 바이트가 "table public.accounts: INSERT: id=3 balance=500" 같은 논리적 변경으로 변환된 것이 보입니다. Logical Replication은 이 디코딩된 결과를 네트워크로 전송합니다.

### Publication과 Subscription

Logical Replication은 publisher(발행)와 subscriber(구독) 모델로 동작합니다.

```sql
-- Publisher (primary 서버)
CREATE PUBLICATION orders_pub FOR TABLE orders, order_items;

-- Subscriber (별도 서버)
CREATE SUBSCRIPTION orders_sub
    CONNECTION 'host=primary dbname=myapp'
    PUBLICATION orders_pub;
```

subscriber가 연결되면 두 단계로 동작합니다.

1. **초기 동기화**: 발행 테이블의 기존 데이터를 복사(table copy)
2. **실시간 수신**: 이후 변경분은 logical decoding으로 실시간 전송

subscriber 측에서는 **apply worker** 프로세스가 수신한 변경을 적용합니다. [아키텍처 글](/postgres/architecture-overview/)에서 봤던 logical replication launcher가 이 worker를 관리합니다.

Streaming Replication과의 핵심 차이는 subscriber가 **독립된 데이터베이스**라는 점입니다. 자체 인덱스, 추가 테이블, 추가 컬럼을 가질 수 있고, publisher와 다른 PostgreSQL major version에서도 동작합니다. 이것이 **major version 업그레이드에 logical replication을 활용하는 이유**입니다. 새 버전 서버를 subscriber로 세팅하고 데이터를 동기화한 뒤 애플리케이션을 전환하면 다운타임을 크게 줄일 수 있습니다.

### REPLICA IDENTITY

Logical Replication에서 UPDATE/DELETE를 subscriber에 적용하려면, "어떤 row를 변경할 것인지" 식별할 수 있어야 합니다. 이 식별 기준을 **REPLICA IDENTITY**라고 합니다.

| 설정 | 전송 내용 | 기본값 |
|------|----------|--------|
| `DEFAULT` | PK 컬럼 값만 | 예 |
| `FULL` | 모든 컬럼의 이전 값 | 아니오 |
| `USING INDEX` | 지정한 unique index 컬럼 값 | 아니오 |
| `NOTHING` | 식별 정보 미전송(UPDATE/DELETE 복제 불가) | 아니오 |

기본값(DEFAULT)에서는 PK로 row를 식별합니다. 문제는 **PK가 없는 테이블**입니다. REPLICA IDENTITY가 DEFAULT인데 PK가 없으면 publisher 측의 walsender가 UPDATE/DELETE를 디코딩할 수 없어서 에러를 발생시키고 복제가 멈춥니다.

```sql
-- publisher 측에서 발생하는 에러
ERROR: cannot update table "events" because it does not have
       a replica identity and publishes updates
```

실무에서 자주 빠지는 함정입니다. 복제 대상 테이블의 PK 유무를 사전에 반드시 점검해야 합니다.

## pg_basebackup과 pg_rewind

### standby 초기 세팅: pg_basebackup

standby를 처음 만들 때는 primary의 data directory 전체를 복사해야 합니다. `pg_basebackup`이 이 작업을 담당합니다.

```bash
pg_basebackup -h primary -D /var/lib/postgresql/18/standby \
    -R -P -X stream
```

`-R` 플래그가 핵심입니다. `standby.signal` 파일과 `primary_conninfo` 설정을 자동으로 만들어주기 때문에, 복사가 끝나면 standby를 바로 시작할 수 있습니다. `-X stream`은 백업 중에도 WAL을 동시에 스트리밍해서 백업 시작 시점 이후의 WAL까지 포함시킵니다.

### failover 후 복귀: pg_rewind

primary가 장애로 죽고 standby를 `pg_promote()`로 승격시켰다고 합시다. 이제 옛 primary를 새 standby로 복귀시켜야 합니다. `pg_basebackup`으로 전체를 다시 복사하는 것도 방법이지만, 수백 GB 데이터베이스에서는 시간이 너무 걸립니다.

**pg_rewind**는 timeline이 갈라진 시점 이후의 차이분만 되감아서 맞춥니다. 변경된 블록만 새 primary에서 가져오므로 `pg_basebackup`보다 훨씬 빠릅니다.

```bash
pg_rewind --target-pgdata=/var/lib/postgresql/18/old_primary \
    --source-server='host=new_primary dbname=postgres'
```

pg_rewind가 동작하려면 `wal_log_hints = on` 또는 data checksum이 활성화되어 있어야 합니다. 변경된 블록을 식별하는 데 hint bit 변경 기록이 필요하기 때문입니다.

## Lag 측정

### Streaming Replication lag

primary에서 `pg_stat_replication` 뷰로 각 standby의 lag을 확인합니다.

```sql
SELECT client_addr, state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
       replay_lag
FROM pg_stat_replication;
```

LSN이 4단계로 나뉘어 있어서 병목 위치를 진단할 수 있습니다.

```
sent_lsn → write_lsn → flush_lsn → replay_lsn

  전송         OS write      디스크 flush     redo 적용
```

- **sent와 write 사이 차이가 크면**: 네트워크 병목
- **write와 flush 사이 차이가 크면**: standby 디스크 I/O 병목
- **flush와 replay 사이 차이가 크면**: standby redo 처리 속도 병목 (heavy write 워크로드)

PG 10+에서는 `write_lag`, `flush_lag`, `replay_lag` 같은 시간 기반 컬럼도 제공합니다. 바이트와 시간 양쪽으로 확인하는 것이 좋습니다.

### Logical Replication lag

logical replication도 내부적으로 replication slot을 사용하므로, primary 측의 `pg_stat_replication`에서 walsender 단위로 lag을 확인할 수 있습니다. subscriber 측에서는 `pg_stat_subscription`으로 수신 상태를 봅니다.

```sql
-- subscriber에서 확인
SELECT subname, received_lsn, last_msg_send_time, last_msg_receipt_time,
       last_msg_receipt_time - last_msg_send_time AS transport_lag
FROM pg_stat_subscription;
```

`last_msg_send_time`과 `last_msg_receipt_time`의 차이로 전송 지연을 추정할 수 있습니다. 단, 이 두 시각은 서로 다른 서버의 시계를 기준으로 하므로 NTP 동기화가 되어 있어야 의미 있는 값입니다. 가장 정확한 lag 측정은 publisher의 `pg_stat_replication`에서 logical replication의 walsender를 확인하는 것입니다.

lag이 계속 증가하고 있다면 subscriber의 apply 속도가 publisher의 write 속도를 따라잡지 못하고 있는 것입니다. apply worker가 기본적으로 single-threaded이기 때문에 write가 많은 환경에서는 병목이 될 수 있습니다. PG 16+에서는 `streaming = parallel`로 대규모 트랜잭션의 병렬 적용이 가능합니다.

## 실전에서는

**replication slot은 반드시 모니터링한다.** `pg_replication_slots`에서 `active = false`인 slot이 있으면 WAL이 무한히 쌓입니다. `max_slot_wal_keep_size`를 설정해서 디스크 풀을 방지하고, 비활성 slot은 주기적으로 정리합니다. slot 모니터링을 빠뜨려서 primary 디스크가 가득 차는 것은 실무에서 자주 보는 장애 패턴입니다.

**hot standby 충돌은 워크로드에 맞춰 조율한다.** 분석 쿼리가 자주 cancel된다면 `max_standby_streaming_delay`를 늘리되 `-1`은 피합니다. `hot_standby_feedback`은 primary bloat와의 트레이드오프를 이해하고 켭니다. standby에서 도는 쿼리가 짧은(OLTP) 환경이라면 기본값 30초로 충분한 경우가 많습니다.

**failover는 사전에 테스트한다.** `pg_promote()` 또는 `pg_ctl promote`로 standby를 승격하고, 애플리케이션 connection string을 새 primary로 전환하는 과정까지 포함해서 시나리오 테스트를 해야 합니다. Patroni, pg_auto_failover 같은 자동화 도구가 이 과정을 담당하지만, 도구를 넣었다고 끝이 아니라 실제 failover 훈련이 필요합니다.

**logical replication 대상 테이블의 PK를 사전에 점검한다.** REPLICA IDENTITY DEFAULT에서 PK 없는 테이블은 UPDATE/DELETE 복제가 실패합니다. 복제 대상 테이블 목록을 뽑고 PK 유무를 확인하는 것이 세팅의 첫 번째 단계입니다.

**major version 업그레이드에 logical replication을 활용할 수 있다.** `pg_upgrade`(in-place)가 부담스러운 대규모 DB에서, 새 버전 서버를 subscriber로 세팅하고 동기화한 뒤 전환하면 다운타임을 크게 줄일 수 있습니다. 단, DDL은 자동 복제되지 않으므로 스키마 변경은 양쪽에 수동으로 적용해야 합니다.

## 흔한 오해

**"Streaming Replication이 있으면 백업이 필요 없다."** replication은 실시간 동기화이지 백업이 아닙니다. primary에서 `DROP TABLE`을 실행하면 그 변경도 standby에 즉시 반영됩니다. 실수로 데이터를 날렸을 때 특정 시점으로 되돌리려면 별도의 WAL 아카이빙과 base backup을 이용한 PITR(Point-In-Time Recovery)이 필요합니다.

**"Logical Replication은 DDL도 자동으로 복제된다."** DML(INSERT/UPDATE/DELETE)만 복제됩니다. `ALTER TABLE ADD COLUMN`, `CREATE INDEX` 같은 DDL은 subscriber에 수동으로 적용해야 합니다. publisher에서 컬럼을 추가했는데 subscriber에는 안 했다면 복제가 깨집니다. 스키마 변경 시 양쪽을 맞추는 절차가 필요합니다.

**"동기 복제면 failover 시 데이터 유실이 0이다."** `synchronous_commit=on`(동기 standby 설정 시)이면 확인된 WAL까지는 standby에 있지만, failover 과정에서 timeline이 갈라지는 시점의 미묘한 차이가 있을 수 있습니다. `remote_apply`까지 설정해야 "standby에서 읽을 수 있는 상태"가 보장되고, 그래도 자동화 도구가 승격을 판단하는 시점에 따라 edge case가 존재합니다. zero data loss를 확신하려면 자동화 도구 레벨에서의 검증이 필요합니다.

## 마치며

WAL을 네트워크로 보내는 두 가지 방식을 봤습니다. 바이트 그대로 보내면 primary의 물리적 복제본이 되고, 디코딩해서 보내면 독립된 데이터베이스가 됩니다. replication slot이 "어디까지 보냈는가"를 추적하고, hot standby에서는 redo와 쿼리가 같은 데이터를 놓고 충돌합니다. replication은 HA의 기반이지만 "설정하면 끝"이 아니라 lag, slot, 충돌을 지속적으로 관찰하는 운영의 영역입니다.

다음 글에서는 시리즈의 실전 편으로 넘어갑니다. "DB가 느려요"라는 말을 들었을 때 어디서부터 추적할 것인가. pg_stat_statements로 워크로드 전체에서 병목을 찾고, auto_explain으로 실행 계획을 로그에 남기고, 지금까지 쌓아온 인덱스, 플래너, VACUUM, WAL 지식을 동원해서 원인을 좁혀가는 흐름을 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 27. High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/18/high-availability.html)
- [Chapter 29. Logical Replication](https://www.postgresql.org/docs/18/logical-replication.html)
- [Chapter 31. Logical Decoding](https://www.postgresql.org/docs/18/logicaldecoding.html)
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 10: Streaming Replication](https://www.interdb.jp/pg/pgsql10.html)
- [pg_basebackup](https://www.postgresql.org/docs/18/app-pgbasebackup.html): standby 초기 세팅 유틸리티
- [pg_stat_replication](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW): replication lag 모니터링 뷰
