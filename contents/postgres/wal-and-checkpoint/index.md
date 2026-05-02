---
date: '2026-04-30'
title: 'WAL과 체크포인트: crash에서 살아남는 구조, 그리고 성능의 숨은 비용'
category: 'Database'
series: 'postgres'
seriesOrder: 11
tags: ['PostgreSQL', 'WAL', 'Checkpoint', 'Crash Recovery', 'Durability']
summary: 'COMMIT 직후 전원이 꺼져도 데이터가 사라지지 않는 이유, WAL record와 LSN의 구조, Full Page Write가 WAL 볼륨을 키우는 원리, checkpoint가 I/O spike를 만드는 메커니즘, 그리고 crash recovery가 redo를 적용하는 과정까지 따라갑니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/postgres/isolation-and-locks/)에서 두 트랜잭션이 같은 row를 동시에 수정할 때 벌어지는 일, 락과 격리 수준의 체계를 봤습니다. 그런데 한 가지 빠진 게 있습니다. 트랜잭션이 `COMMIT`을 받았으면, 그 변경은 정말로 안전한 걸까요?

한번 상황을 만들어 봅시다. `UPDATE accounts SET balance = 500 WHERE id = 1;`을 실행하고 `COMMIT`을 받았습니다. 이 순간 PostgreSQL은 변경 내용을 **shared_buffers** 안의 페이지에만 반영했을 뿐, 아직 실제 data file에는 쓰지 않았을 수 있습니다. 만약 이 직후에 서버 전원이 나간다면?

결론부터 말하면 **데이터는 살아 있습니다.** 그 이유가 바로 WAL(Write-Ahead Log)입니다. PostgreSQL은 데이터 페이지를 변경하기 전에 "무엇을 어떻게 바꿀 것인지"를 WAL에 먼저 기록하고, COMMIT 시점에 이 WAL을 디스크에 강제로 flush합니다. data file에는 아직 반영하지 않았더라도, WAL만 남아 있으면 재시작 시 그 내용을 그대로 다시 적용(redo)할 수 있습니다.

이 글에서는 WAL record의 구조, Full Page Write가 WAL 볼륨을 키우는 원리, checkpoint가 I/O spike를 만드는 메커니즘, crash recovery의 redo 과정, 그리고 `synchronous_commit=off`의 트레이드오프까지 순서대로 따라갑니다.

## Write-Ahead Logging 원칙

WAL의 핵심 규칙은 단순합니다.

> **데이터 페이지의 변경 내용이 디스크에 쓰이기 전에, 해당 변경을 기술하는 WAL record가 먼저 디스크에 써져야 한다.**

이 규칙만 지키면 data file 자체는 "아직 반영 안 된" 상태여도 괜찮습니다. crash 후 재시작 시 WAL을 처음부터 끝까지 replay하면 data file을 crash 직전 상태로 복원할 수 있기 때문입니다.

실제로 WAL record는 먼저 shared memory의 **WAL buffer**에 기록된 뒤, COMMIT 시점이나 walwriter에 의해 디스크(`pg_wal/`)로 flush됩니다. [아키텍처 글](/postgres/architecture-overview/)에서 봤던 shared memory 구성 요소 중 하나입니다.

WAL이 없는 대안을 생각해보면 이 설계의 이유가 선명해집니다. 매번 COMMIT할 때마다 변경된 모든 data page를 디스크에 fsync하는 방식도 가능하지만, 수십 개 페이지에 흩어진 변경을 매 트랜잭션마다 random I/O로 쓰는 건 현실적으로 감당하기 어렵습니다. 반면 WAL은 **순차 쓰기**(sequential write)입니다. 변경 내용을 한 줄로 쭉 이어서 append하기 때문에 I/O 비용이 훨씬 낮습니다.

## WAL record와 LSN

### WAL record의 구조

WAL에 기록되는 단위는 **WAL record**입니다. 각 record는 "어떤 리소스의 어떤 동작인지"를 기술하는 헤더와, 실제 변경 데이터를 담은 payload로 구성됩니다.

```
WAL Record
┌──────────────────────────────────────────────┐
│  Header                                      │
│  ├── xl_tot_len    record 전체 길이           │
│  ├── xl_xid        트랜잭션 ID                │
│  ├── xl_prev       이전 WAL record의 LSN      │
│  ├── xl_info       동작 종류 (insert/update…)  │
│  └── xl_rmid       리소스 관리자 ID            │
│                    (heap, btree, xact, …)     │
├──────────────────────────────────────────────┤
│  Block references  대상 페이지 + offset 정보   │
├──────────────────────────────────────────────┤
│  Payload           실제 변경 데이터            │
│                    (또는 Full Page Image)      │
└──────────────────────────────────────────────┘
```

`xl_rmid`(Resource Manager ID)가 이 record의 종류를 결정합니다. heap 테이블 변경이면 `RM_HEAP_ID`, B-tree 인덱스 변경이면 `RM_BTREE_ID`, 트랜잭션 commit/abort면 `RM_XACT_ID`입니다. 각 리소스 관리자가 redo 시 자기 record를 어떻게 적용할지 알고 있습니다.

`pg_waldump`로 실제 WAL record를 들여다볼 수 있습니다.

```bash
pg_waldump /var/lib/postgresql/18/main/pg_wal/000000010000000000000001 --limit=5
```

```
rmgr: Heap    len (rec/tot):     63/    63, tx:  736, lsn: 0/01A00100,
      prev 0/01A000C8, desc: INSERT off: 2, flags: 0x00
rmgr: Btree   len (rec/tot):     64/    64, tx:  736, lsn: 0/01A00140,
      prev 0/01A00100, desc: INSERT_LEAF off: 3
rmgr: Transaction len (rec/tot):    34/    34, tx:  736, lsn: 0/01A00180,
      prev 0/01A00140, desc: COMMIT 2026-04-30 09:15:00.123456 KST
```

한 INSERT 문이 heap record, btree record, commit record 세 개를 남겼습니다. `lsn` 값이 순차적으로 증가하는 것이 보입니다.

### LSN: WAL 내의 절대 위치

**LSN**(Log Sequence Number)은 WAL 스트림 전체에서의 바이트 위치를 나타내는 64비트 값입니다. `0/01A00100`처럼 상위/하위 32비트를 슬래시로 구분해 표기합니다. 이 값 자체는 WAL의 시작점으로부터의 절대 바이트 오프셋이고, 어떤 세그먼트 파일의 몇 바이트 위치인지는 세그먼트 크기(기본 16MB)로 나누어 계산합니다.

LSN이 중요한 이유는 **모든 데이터 페이지가 자신의 마지막 변경 LSN을 기억하고 있기** 때문입니다. [힙 페이지 글](/postgres/heap-page-tuple/)에서 봤던 PageHeaderData의 `pd_lsn` 필드가 바로 이것입니다. crash recovery 시 WAL record의 LSN과 페이지의 `pd_lsn`을 비교해서, WAL record의 LSN이 더 크면 "이 변경은 아직 페이지에 반영 안 됐다"고 판단하고 redo를 적용합니다. 이미 반영된 변경은 건너뜁니다.

현재 WAL의 기록 위치는 이렇게 확인합니다.

```sql
SELECT pg_current_wal_insert_lsn(),
       pg_current_wal_lsn(),
       pg_current_wal_flush_lsn();
```

세 함수는 각각 다른 시점을 가리킵니다. `pg_current_wal_insert_lsn()`은 WAL buffer에 마지막으로 insert된 위치, `pg_current_wal_lsn()`은 WAL buffer에서 OS로 write된 위치, `pg_current_wal_flush_lsn()`은 fsync까지 완료되어 디스크에 확실히 내려간 위치입니다. insert > write > flush 순서이고, insert와 flush의 차이가 크다면 WAL buffer에 아직 디스크에 확정되지 않은 데이터가 많다는 뜻입니다.

### WAL 세그먼트 파일

WAL은 물리적으로 `pg_wal/` 디렉토리 안의 세그먼트 파일로 저장됩니다. 기본 세그먼트 크기는 **16MB**이고, `initdb --wal-segsize`로 변경할 수 있습니다(1MB\~1GB). 파일명은 `000000010000000000000001` 같은 24자리 16진수로, timeline ID + segment number로 구성됩니다.

```bash
ls -la pg_wal/
-rw------- 1 postgres postgres 16777216 Apr 30 09:15 000000010000000000000001
-rw------- 1 postgres postgres 16777216 Apr 30 09:16 000000010000000000000002
-rw------- 1 postgres postgres 16777216 Apr 30 09:16 000000010000000000000003
```

오래된 세그먼트는 checkpoint 이후 재활용되거나 삭제됩니다. `max_wal_size`(기본 1GB)가 이 파일들의 총량 상한을 간접적으로 제어합니다.

## Full Page Write

### partial write 문제

WAL의 write-ahead 원칙만으로는 한 가지 문제가 해결되지 않습니다. PostgreSQL은 8KB 페이지 단위로 데이터를 관리하지만, 대부분의 OS와 파일 시스템은 **512바이트 또는 4KB 섹터** 단위로 디스크에 씁니다. checkpointer가 8KB 페이지를 디스크에 쓰는 도중 crash가 발생하면, 앞 4KB는 새 내용이고 뒤 4KB는 옛 내용인 **torn page**가 만들어질 수 있습니다.

이 상태에서 WAL redo를 적용하면 어떻게 될까요? WAL record는 "페이지의 offset X에 Y를 쓴다"는 식의 **차분**(diff) 정보입니다. 페이지 자체가 반쪽짜리로 깨져 있으면, 차분을 적용해도 올바른 결과가 나오지 않습니다.

### FPW(Full Page Write)의 해결 방식

PostgreSQL의 해결책은 **Full Page Write**(FPW)입니다. checkpoint 직후 특정 페이지가 처음으로 변경될 때, 차분만이 아니라 **페이지 전체 8KB 이미지를 WAL에 기록**합니다. 이 이미지를 **Full Page Image**(FPI) 또는 **backup block**이라고 부릅니다.

```
checkpoint 발생
    │
    ▼
페이지 P의 첫 변경 → WAL record에 페이지 P 전체 이미지 포함 (FPW)
페이지 P의 두번째 변경 → 차분만 기록
페이지 P의 세번째 변경 → 차분만 기록
    │
    ▼
다음 checkpoint 발생
    │
    ▼
페이지 P의 첫 변경 → 다시 FPW
```

crash recovery 시 torn page를 만나면, FPI로 페이지 전체를 복원한 뒤 이후의 WAL record를 순서대로 적용합니다. 페이지가 깨져 있더라도 FPI가 덮어쓰므로 문제가 없습니다.

### FPW의 비용

FPW의 대가는 **WAL 볼륨 증가**입니다. 한 row만 변경해도 8KB 전체가 WAL에 들어갑니다. checkpoint 직후에는 많은 페이지가 "첫 변경" 상태이므로 WAL 생성량이 일시적으로 급증합니다. `pg_waldump --stats`로 확인하면 FPI가 전체 WAL의 상당 부분을 차지하는 것을 볼 수 있습니다.

`full_page_writes=off`로 FPW를 끌 수 있지만, 이 경우 torn page로부터 복구할 수 없게 됩니다. 배터리 백업 스토리지(BBU) 같은 하드웨어 보호 장치가 있어서 partial write가 발생하지 않는 환경이 아니라면 끄면 안 됩니다.

PG 9.5부터 FPI에 대한 **WAL 압축**(`wal_compression`)이 도입됐습니다. 페이지 전체를 그대로 쓰는 대신 압축해서 기록하므로, WAL 볼륨을 상당히 줄일 수 있습니다. CPU 비용이 약간 추가되지만, 대부분의 환경에서 켜는 것이 유리합니다.

### data checksum과의 관계

data checksum(`initdb --data-checksums` 또는 PG 12+ `pg_checksums`)은 페이지에 CRC를 붙여서 **silent corruption**(디스크가 아무 에러 없이 잘못된 데이터를 돌려주는 상황)을 탐지합니다. FPW는 crash 시 torn page를 복구하는 메커니즘이고, checksum은 corruption을 탐지하는 메커니즘으로 역할이 다릅니다. 둘 다 켜는 것이 가장 안전하며, PG 18부터는 `initdb` 시 data checksum이 기본 활성화됩니다.

## Checkpoint

### checkpoint가 하는 일

checkpoint는 **특정 시점까지의 모든 변경이 data file에 반영됐음을 보장**하는 동작입니다. 구체적으로 세 단계를 수행합니다.

1. shared_buffers의 모든 dirty page를 data file에 flush
2. `pg_control` 파일에 checkpoint 위치를 기록 — 이 위치를 **REDO point**라고 부르며, crash recovery는 여기서부터 WAL을 다시 적용합니다
3. 더 이상 필요 없는 오래된 WAL 세그먼트를 재활용 또는 삭제

checkpoint가 완료되면 "이 시점 이전의 WAL은 crash recovery에 필요 없다"고 선언하는 것과 같습니다. 그래서 오래된 WAL 세그먼트를 정리할 수 있게 됩니다.

### checkpoint 트리거

checkpoint가 실행되는 조건은 두 가지입니다.

| 조건 | 기본값 | 의미 |
|------|--------|------|
| `checkpoint_timeout` | 5분 | 마지막 checkpoint로부터 이 시간이 지나면 실행 |
| `max_wal_size` | 1GB | 마지막 checkpoint 이후 WAL이 이 크기를 넘으면 실행 |

둘 중 **먼저 도달하는 조건**이 checkpoint를 트리거합니다. 대량 INSERT/UPDATE가 발생하면 5분을 기다리지 않고 `max_wal_size` 도달로 먼저 트리거될 수 있습니다. 이 경우 로그에 이런 경고가 남습니다.

```
LOG:  checkpoints are occurring too frequently (28 seconds apart)
HINT:  Consider increasing the configuration parameter "max_wal_size".
```

이 메시지가 보인다면 `max_wal_size`를 늘려야 합니다. checkpoint가 너무 자주 돌면 I/O 부담이 커지고, FPW도 그만큼 자주 발생합니다.

수동으로 checkpoint를 실행할 수도 있습니다.

```sql
CHECKPOINT;
```

### spread checkpoint: I/O 분산

checkpoint가 dirty page를 한꺼번에 flush하면 I/O spike가 발생합니다. 이를 완화하기 위해 PostgreSQL은 **spread checkpoint**를 사용합니다. dirty page flush를 다음 checkpoint 예정 시점까지의 시간에 걸쳐 분산하는 방식입니다.

`checkpoint_completion_target`(기본 0.9)이 분산 비율을 결정합니다. 0.9라면 다음 checkpoint까지 예상 시간의 90% 구간에 걸쳐 dirty page를 나눠서 씁니다.

```
checkpoint_timeout = 5분, checkpoint_completion_target = 0.9인 경우:

|--- checkpoint ---|---------- 4.5분에 걸쳐 dirty page flush ----------|-- 0.5분 유휴 --|--- 다음 checkpoint ---|
```

이 값을 1.0에 가깝게 올리면 I/O가 더 고르게 분산되지만, checkpoint 완료 시점과 다음 checkpoint 시작이 거의 겹칠 수 있습니다. 기본값 0.9가 대부분의 환경에서 적절합니다.

### I/O spike의 원인 진단

checkpoint 관련 I/O 문제를 진단하려면 먼저 `log_checkpoints=on`을 설정합니다.

```
LOG:  checkpoint starting: time
LOG:  checkpoint complete: wrote 12847 buffers (9.8%); 0 WAL file(s) added,
      0 removed, 3 recycled; write=269.035 s, sync=0.014 s, total=269.089 s;
      sync files=94, longest=0.007 s, average=0.000 s; distance=48621 kB,
      estimate=48621 kB; lsn=0/3A00100, redo lsn=0/39FF0E8
```

여기서 핵심 지표는 세 가지입니다.

- **wrote N buffers**: flush한 dirty page 수. 너무 많으면 write 워크로드가 크다는 뜻
- **write=269s**: 실제 write에 걸린 시간. `checkpoint_timeout`에 비해 짧으면 분산이 잘 되고 있는 것
- **distance=48621 kB**: 이 checkpoint 구간에서 생성된 WAL 양. `max_wal_size`에 비해 크면 checkpoint 빈도가 높아지는 원인

## Crash Recovery

서버가 비정상 종료된 뒤 다시 시작하면 PostgreSQL은 자동으로 crash recovery를 수행합니다. 과정은 아래와 같습니다.

```
1. pg_control에서 마지막 checkpoint의 REDO point 확인
2. REDO point부터 WAL 끝까지 순차적으로 읽기
3. 각 WAL record에 대해:
   - 대상 페이지의 pd_lsn과 WAL record의 LSN 비교
   - pd_lsn < WAL LSN이면 → redo 적용 (아직 반영 안 된 변경)
   - pd_lsn >= WAL LSN이면 → 건너뜀 (이미 반영된 변경)
4. 모든 WAL record 적용 완료
5. 새 checkpoint 기록
6. 정상 운영 모드 전환
```

3단계의 LSN 비교가 핵심입니다. 이 비교 덕분에 crash recovery는 **멱등**(idempotent)합니다. 같은 WAL을 두 번 적용해도 결과는 동일합니다. recovery 도중 다시 crash가 나더라도, 재시작하면 같은 과정이 반복되어 결국 올바른 상태에 도달합니다.

FPW가 있으면 torn page도 문제되지 않습니다. FPI가 페이지 전체를 복원한 뒤 이후 record를 순서대로 적용하면 됩니다. 반대로 FPW 없이 torn page 위에 차분을 적용하면 결과가 비결정적이 되어 멱등성이 깨집니다. crash recovery의 멱등성은 LSN 비교와 FPW가 함께 만드는 것입니다.

checkpoint가 자주 돌수록 REDO point가 최근으로 당겨져서 recovery 시간이 짧아집니다. 하지만 앞서 봤듯이 checkpoint 빈도가 높으면 I/O 부담과 FPW 볼륨이 늘어납니다. **recovery 시간 vs 정상 운영 I/O 부담**이 checkpoint 튜닝의 핵심 트레이드오프입니다.

## bgwriter, checkpointer, walwriter: 세 프로세스의 분담

[아키텍처 글](/postgres/architecture-overview/)에서 이 세 프로세스를 간단히 소개했습니다. 여기서는 WAL 흐름 안에서 각각의 역할을 정리합니다.

```
트랜잭션이 row 변경
    │
    ├──→ WAL record를 WAL buffer에 기록
    │         │
    │         └──→ walwriter가 주기적으로 pg_wal에 flush
    │              (COMMIT 시에는 backend가 직접 flush)
    │
    └──→ shared_buffers의 해당 페이지를 변경 (dirty 표시)
              │
              ├──→ bgwriter가 주기적으로 일부 dirty page를 data file에 flush
              │    (clean buffer 확보 목적)
              │
              └──→ checkpointer가 checkpoint 시 모든 dirty page를 data file에 flush
```

| 프로세스 | 대상 | 타이밍 | 목적 |
|---------|------|--------|------|
| **walwriter** | WAL buffer → pg_wal | `wal_writer_delay`(200ms) 주기 | WAL 디스크 기록 |
| **bgwriter** | dirty page → data file (일부) | `bgwriter_delay`(200ms) 주기 | clean buffer 확보 |
| **checkpointer** | dirty page → data file (전부) | checkpoint_timeout 또는 max_wal_size | durability 보장, WAL 정리 |

bgwriter가 평소에 dirty page를 조금씩 쓰면서 clean buffer를 확보해두면, backend가 새 페이지를 읽어야 할 때 빈 슬롯을 바로 사용할 수 있습니다. 만약 bgwriter가 clean buffer를 충분히 만들어두지 못하면 backend가 직접 dirty page를 evict해야 하는데, 이는 쿼리 처리 도중 I/O wait이 발생한다는 뜻입니다.

이 상황은 통계 뷰로 확인할 수 있습니다. PG 16까지는 `pg_stat_bgwriter` 하나에 모든 정보가 있었지만, PG 17부터 checkpointer 통계가 `pg_stat_checkpointer`로 분리됐습니다.

```sql
-- bgwriter가 쓴 page 수
SELECT buffers_clean FROM pg_stat_bgwriter;

-- checkpointer가 쓴 page 수 (PG 17+)
SELECT buffers_written FROM pg_stat_checkpointer;
```

backend가 직접 dirty page를 evict한 횟수는 PG 17+에서 `pg_stat_io` 뷰로 확인합니다.

```sql
SELECT writes, fsyncs
FROM pg_stat_io
WHERE backend_type = 'client backend' AND context = 'normal';
```

bgwriter의 `buffers_clean`에 비해 backend의 `writes`가 높다면 bgwriter가 충분히 일하지 못하고 있다는 신호입니다. `bgwriter_lru_maxpages`를 늘리거나 `shared_buffers`가 워크로드에 비해 너무 작은지 확인해야 합니다.

## synchronous_commit의 트레이드오프

기본 설정(`synchronous_commit=on`)에서 COMMIT은 WAL record가 디스크에 flush될 때까지 기다린 뒤 클라이언트에 응답합니다. 이 flush가 COMMIT latency의 상당 부분을 차지합니다.

`synchronous_commit=off`로 바꾸면 동작이 달라집니다. COMMIT 시 WAL buffer에만 기록하고 바로 응답합니다. 실제 디스크 flush는 walwriter가 다음 주기(`wal_writer_delay`, 기본 200ms)에 처리합니다.

```sql
-- 세션 단위로 설정 가능
SET synchronous_commit = off;
```

### 성능 이득

WAL flush 대기가 사라지므로 COMMIT latency가 크게 줄어듭니다. 초당 수천 건의 짧은 트랜잭션을 처리하는 워크로드에서 체감이 큽니다.

### 위험

crash 시 **마지막으로 flush된 시점 이후의 committed 트랜잭션이 유실**될 수 있습니다. walwriter는 최대 `wal_writer_delay × 3`(기본 약 600ms) 간격으로 flush하므로, 최악의 경우 약 600ms 분량의 트랜잭션이 사라집니다.

중요한 점은, 유실이 발생해도 **데이터 일관성은 깨지지 않는다**는 것입니다. "커밋됐는데 실제로는 적용 안 된" 트랜잭션이 통째로 없어질 뿐, 반쪽짜리 상태가 만들어지지는 않습니다.

### 언제 쓰는가

세션 데이터, 로그 적재, 통계 카운터 갱신처럼 "최근 몇백ms가 유실돼도 비즈니스에 영향이 없는" 워크로드에 적합합니다. 결제, 재고 차감 같은 유실 불가 트랜잭션에는 반드시 `on`을 유지해야 합니다. 세션 단위로 설정할 수 있기 때문에 같은 시스템 안에서 워크로드별로 다르게 적용할 수 있습니다.

## 실전에서는

**checkpoint_timeout과 max_wal_size 튜닝.** 기본값(5분, 1GB)은 write가 적은 환경에 맞춰져 있습니다. write 워크로드가 큰 시스템에서는 `max_wal_size`를 4\~16GB로, `checkpoint_timeout`을 10\~15분으로 늘려서 checkpoint 빈도를 낮추는 것이 일반적입니다. 단, checkpoint 간격이 길어지면 crash recovery 시간도 그만큼 늘어납니다.

**log_checkpoints=on은 필수.** checkpoint가 언제, 얼마나 자주, 얼마나 많은 page를 쓰는지 기록해줍니다. "checkpoints are occurring too frequently" 경고가 반복된다면 `max_wal_size`를 올려야 하고, checkpoint당 write 시간이 `checkpoint_timeout`에 육박한다면 다음 checkpoint와 겹치기 직전이므로 역시 간격을 넓혀야 합니다.

**buffer write 분포 확인.** `pg_stat_bgwriter`의 `buffers_clean`과 `pg_stat_io`에서 backend의 write 수를 비교합니다. backend write가 높다면 backend가 직접 dirty page를 쫓아내고 있다는 뜻이고, 쿼리 latency에 영향을 줍니다. `shared_buffers` 크기와 bgwriter 설정을 점검해야 합니다.

**WAL 볼륨 급증 시 FPW 점검.** `pg_waldump --stats`에서 FPI 비율이 높다면 checkpoint 빈도가 원인일 가능성이 큽니다. checkpoint 간격을 늘려서 FPW 빈도를 줄이거나, `wal_compression=on`으로 FPI 크기를 줄일 수 있습니다.

## 흔한 오해

**"VACUUM은 WAL을 많이 만들지 않는다."** VACUUM도 페이지를 수정하므로 WAL을 생성합니다. 특히 checkpoint 직후에 VACUUM이 돌면 수정하는 모든 페이지에 FPW가 발생합니다. 대량 VACUUM 후 WAL 볼륨이 예상보다 크다면 FPW 때문입니다. VACUUM이 visibility map과 free space map을 갱신하는 것도 각각 WAL record를 남깁니다.

**"checkpoint가 자주 돌면 안전하다."** crash recovery 시간은 짧아지지만, 정상 운영 중 I/O 부담이 커집니다. checkpoint마다 모든 dirty page를 flush하고, FPW가 다시 시작되어 WAL 볼륨도 늘어납니다. 안전성과 성능은 트레이드오프 관계이고, 대부분의 운영 환경에서는 checkpoint_timeout 10\~15분이 균형점입니다.

**"synchronous_commit=off면 데이터가 날아간다."** crash가 발생한 경우에만, 그것도 최대 수백ms 분량만 유실됩니다. 정상 종료(`pg_ctl stop`의 smart/fast 모드)나 일반적인 재시작에서는 shutdown checkpoint가 모든 WAL과 dirty page를 flush한 후 종료되므로 유실이 없습니다. 단, `pg_ctl stop -m immediate`는 crash와 동일하게 동작합니다. 그리고 유실되는 것은 committed 트랜잭션이 통째로 사라지는 것이지, 반쪽짜리 트랜잭션이 적용되는 것이 아닙니다.

## 마치며

WAL의 원칙은 단순합니다. 데이터를 바꾸기 전에 로그를 먼저 쓴다. 이 한 가지 규칙이 durability를 보장하고, checkpoint가 "어디까지 안전한가"의 기준선을 정하며, crash recovery가 그 기준선부터 WAL 끝까지 replay해서 데이터를 복원합니다. 운영에서 마주치는 I/O spike, WAL 볼륨 급증, checkpoint 경고는 대부분 이 메커니즘의 비용이 표면에 드러난 것입니다.

다음 글에서는 이 WAL을 네트워크로 보내는 이야기로 넘어갑니다. WAL을 바이트 스트림 그대로 전달하면 Streaming Replication, 디코딩해서 row 단위로 전달하면 Logical Replication이 됩니다. 두 방식의 아키텍처 차이, replication slot, hot standby에서 쿼리 충돌이 생기는 이유를 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 30. Reliability and the Write-Ahead Log](https://www.postgresql.org/docs/18/wal.html)
- [WAL Configuration](https://www.postgresql.org/docs/18/wal-configuration.html): synchronous_commit, wal_compression, checkpoint 파라미터
- [WAL Internals](https://www.postgresql.org/docs/18/wal-internals.html): WAL record 구조, LSN, 세그먼트 파일
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 9: Write Ahead Logging](https://www.interdb.jp/pg/pgsql09.html)
- [pg_waldump](https://www.postgresql.org/docs/18/pgwaldump.html): WAL 세그먼트 덤프 유틸리티
