---
date: '2026-04-12'
title: 'PostgreSQL 힙 페이지와 튜플 구조: 데이터를 디스크에 어떻게 올려두는가'
category: 'Database'
series: 'postgres'
seriesOrder: 2
tags: ['PostgreSQL', 'Storage', 'Heap', 'TOAST', 'HOT Update']
summary: 'PostgreSQL이 한 row를 8KB 페이지의 어디에 두는지, ctid가 가리키는 슬롯의 정체, 튜플 헤더 23바이트의 의미, HOT update와 FILLFACTOR의 인과 관계, 그리고 큰 컬럼이 TOAST로 빠져나가는 방식까지 페이지 안쪽을 직접 들여다봅니다.'
thumbnail: './thumbnail.png'
---

PostgreSQL의 모든 테이블에는 `ctid`라는 숨겨진 시스템 컬럼이 있습니다. row를 만들 때 우리가 직접 넣지 않아도 자동으로 따라붙고, 평소엔 보이지 않다가 `SELECT ctid, * FROM ...`처럼 명시적으로 꺼내야 모습을 드러냅니다. 정체는 단순합니다. **이 row가 디스크 위 어디에 놓여 있는지를 가리키는 좌표**입니다. `(0, 2)` 같은 모습으로 표시되는데, 0이 페이지 번호고 2가 그 페이지 안의 슬롯 번호입니다.

좌표라는 말은 곧 "옮겨질 수 있다"는 뜻이기도 합니다. 한번 자리를 잡으면 그대로 머무는 영구 ID가 아니라, 같은 row라도 PostgreSQL이 사정상 다른 자리로 옮기면 `ctid`가 바뀝니다. 그리고 사정이 만들어지는 가장 흔한 순간이 바로 **UPDATE**입니다.

```sql
CREATE TABLE users (id int PRIMARY KEY, email text);
INSERT INTO users VALUES (1, 'a@x.com'), (2, 'b@x.com'), (3, 'c@x.com');

SELECT ctid, id, email FROM users WHERE id = 2;
```

| ctid | id | email |
|------|----|-------|
| (0,2) | 2 | b@x.com |

```sql
UPDATE users SET email = 'B@x.com' WHERE id = 2;

SELECT ctid, id, email FROM users WHERE id = 2;
```

| ctid | id | email |
|------|----|-------|
| (0,4) | 2 | B@x.com |

같은 row인데 좌표가 `(0,2)`에서 `(0,4)`로 옮겨갔습니다. 그리고 한 번도 INSERT한 적이 없는데 4번 슬롯이 어디선가 나타났습니다. UPDATE가 row의 값만 바꾸는 단순한 동작이라면 이런 일이 일어날 이유가 없습니다. 그런데 PostgreSQL에서는 거의 항상 일어납니다. 그것도 의도된 결과로요.

이 두 가지 질문, "왜 자리가 바뀌었는가"와 "새 자리는 어디서 나왔는가"에 답하려면 PostgreSQL의 8KB 페이지가 안쪽에서 어떻게 생겼는지를 알아야 합니다. [지난 글](/postgres/architecture-overview/)에서 "shared_buffers에 캐싱되는 8KB 페이지"라고만 짚고 지나갔던 그 페이지의 내부를 이번 글에서 들여다봅니다. 페이지 안의 슬롯 디렉터리, 튜플 헤더 23바이트, UPDATE가 사실은 INSERT라는 사실, 그리고 8KB에 안 들어가는 큰 값을 어떻게 옆 동네로 떼어내는지(TOAST)까지. 운영 중에 마주치는 `bloat`, `FILLFACTOR` 튜닝 권장, "텍스트 컬럼이 갑자기 느려졌다" 같은 수많은 현상의 근원이 전부 이 8KB 안쪽 구조에서 출발합니다.

## ctid가 가리키는 곳

`ctid`는 PostgreSQL의 시스템 컬럼으로, 한 row가 디스크상의 어느 위치에 있는지를 가리키는 **(블록 번호, offset 번호) 쌍**입니다. `(0,2)`라면 "0번 블록의 2번째 슬롯". 블록 번호는 0부터 시작하고, offset 번호는 1부터 시작합니다.

```sql
SELECT ctid, id FROM users ORDER BY id;
```

| ctid | id | |
|------|----|--|
| (0,1) | 1 | |
| (0,4) | 2 | ← UPDATE 이후 새 자리 |
| (0,3) | 3 | |

세 row 중 id=2만 `(0,2)`가 아닌 `(0,4)`에 있습니다. 한 번 UPDATE한 결과로 같은 페이지 안에서 새 슬롯 4번이 생긴 겁니다. 여기서 "블록"은 곧 페이지(8KB)이고, "offset"은 그 페이지 안에 있는 슬롯 디렉터리의 인덱스입니다. 즉 `ctid`는 row 자체의 정체성이 아니라 **물리적 위치 포인터**입니다. 같은 row가 다른 위치로 옮겨지면 `ctid`는 바뀝니다. 인덱스도 내부적으로 이 `ctid`를 기록해두기 때문에, "인덱스가 가리키는 곳에 진짜 그 row가 있나?"가 곧 PostgreSQL 인덱스 구조의 핵심 질문이 됩니다(이건 B-tree 글에서 본격적으로 다룹니다).

같은 페이지 안에서 새 슬롯이 생기려면 페이지가 어떻게 생겼고 어디에 빈 자리가 있는지를 알아야 합니다. 페이지부터 들어가봅시다.

## Relfilenode와 세그먼트: 테이블의 실체는 파일이다

테이블은 추상적인 개념이지만, 디스크 위에서는 **그냥 파일**입니다. 정확히는 데이터 디렉터리 안의 하나(또는 여러 개)의 binary 파일입니다.

각 테이블에는 `pg_class.relfilenode`라는 정수 ID가 붙어 있고, 이 숫자가 곧 파일 이름이 됩니다. 위치는 `$PGDATA/base/<database_oid>/<relfilenode>`입니다. 직접 확인해보면:

```sql
CREATE TABLE demo (id int, val text);
INSERT INTO demo SELECT g, md5(g::text) FROM generate_series(1, 100) g;

SELECT pg_relation_filepath('demo');
```

| pg_relation_filepath |
|----------------------|
| base/16384/16459 |

`base/16384/16459`가 이 테이블의 실제 파일 경로입니다(데이터 디렉터리 기준 상대 경로). 16384는 데이터베이스 OID, 16459는 `relfilenode`. 이 파일이 1GB를 넘어가면 `16459.1`, `16459.2` 식으로 segment가 추가됩니다. PG 18 컴파일 기본값이 1GB 단위이고, 빌드 시 `--with-segsize` 옵션을 따로 주지 않는 한 바뀌지 않습니다.

테이블 하나는 사실 fork라고 부르는 여러 개의 파일 묶음으로 구성됩니다.

| Fork | 파일명 | 역할 |
|------|--------|------|
| **main** | `<relfilenode>` | 실제 heap 데이터(우리가 이 글에서 들여다볼 8KB 페이지들) |
| **fsm** | `<relfilenode>_fsm` | Free Space Map. 페이지별 여유 공간 요약. INSERT/UPDATE가 들어갈 페이지를 빠르게 찾는 용도 |
| **vm** | `<relfilenode>_vm` | Visibility Map. 페이지당 2비트로 all-visible / all-frozen 상태 표시. index-only scan과 VACUUM freeze를 가속 |
| **init** | `<relfilenode>_init` | UNLOGGED 테이블이 크래시 후 빈 상태로 되돌아가기 위한 초기 이미지 |

이 글에서는 main fork만 따라갑니다. fsm과 vm은 VACUUM과 인덱스 글에서, init은 UNLOGGED 테이블 이야기에서 다시 등장합니다.

main fork는 8KB 페이지의 연속입니다. 0번 페이지, 1번 페이지, 2번 페이지... 이 페이지 한 장이 PostgreSQL이 디스크와 shared_buffers 사이에서 주고받는 가장 작은 단위입니다.

## 8KB 페이지 안에는 무엇이 들어 있는가

페이지 한 장의 레이아웃은 다음과 같습니다.

```
┌──────────────────────────────────────┐  ← 0
│  PageHeaderData (24 bytes)           │
├──────────────────────────────────────┤  ← 24
│  ItemId 1 (4 bytes)                  │
│  ItemId 2 (4 bytes)                  │   line pointer 배열
│  ItemId 3 (4 bytes)                  │   (앞에서 뒤로 자람)
│  ...                                 │
│  ItemId N (4 bytes)                  │
├──────────────────────────────────────┤  ← pd_lower
│                                      │
│           free space                 │
│                                      │
├──────────────────────────────────────┤  ← pd_upper
│  Tuple N data                        │
│  ...                                 │   tuple data
│  Tuple 2 data                        │   (뒤에서 앞으로 자람)
│  Tuple 1 data                        │
├──────────────────────────────────────┤  ← pd_special
│  Special space                       │   힙은 비어 있음
└──────────────────────────────────────┘  ← 8192
```

핵심은 **양쪽에서 채워들어온다**는 것입니다. line pointer(`ItemIdData`)는 페이지 헤더 바로 뒤부터 앞에서 뒤로 쌓이고, 실제 튜플 데이터는 페이지 끝(`pd_special` 직전)에서부터 거꾸로 앞으로 쌓입니다. 두 방향이 만나는 가운데가 free space이고, `pd_lower`(line pointer 끝)와 `pd_upper`(tuple 시작)가 같아지는 순간 페이지가 가득 찬 것입니다.

왜 이런 구조일까요? 새 row를 INSERT할 때마다 line pointer 1개와 tuple 1개가 양쪽에서 추가되면, 가운데 free space만 정확히 줄어듭니다. 페이지 중간에서 데이터 이동을 안 해도 되고, line pointer 배열은 항상 인덱스로 빠르게 접근할 수 있는 fixed-size 슬롯을 유지합니다. `ctid`의 offset 번호가 1, 2, 3...으로 깔끔하게 매겨지는 것도 이 슬롯 디렉터리 덕분입니다.

### PageHeaderData (24 bytes)

페이지 맨 앞 24바이트에는 페이지 자체의 메타데이터가 들어 있습니다.

| 필드 | 크기 | 역할 |
|------|------|------|
| `pd_lsn` | 8B | 이 페이지를 마지막으로 변경한 WAL 레코드의 LSN. crash recovery에서 redo 적용 여부 판단 |
| `pd_checksum` | 2B | 페이지 체크섬(`initdb -k`로 활성화 시) |
| `pd_flags` | 2B | 페이지 상태 비트 (`PD_HAS_FREE_LINES`, `PD_PAGE_FULL`, `PD_ALL_VISIBLE` 등) |
| `pd_lower` | 2B | line pointer 배열 끝 오프셋 |
| `pd_upper` | 2B | tuple 영역 시작 오프셋 |
| `pd_special` | 2B | special space 시작 오프셋 (힙은 페이지 끝 = 8192) |
| `pd_pagesize_version` | 2B | 페이지 크기와 레이아웃 버전 |
| `pd_prune_xid` | 4B | HOT pruning 힌트. 이 페이지에서 가장 오래된 죽은 튜플의 xid |

운영에서 중요한 건 `pd_lsn`(WAL과 쌍을 이루는 페이지의 버전 표시)과 `pd_prune_xid`(HOT pruning이 트리거될 시점을 기록) 두 개입니다. 나머지는 페이지 내부 자료구조의 boundary 정보일 뿐입니다.

### ItemId (line pointer)

각 line pointer는 `ItemIdData`라는 4바이트 비트필드입니다.

```
┌─────────────────────────────────────┐
│ lp_off (15 bits) │ flags (2) │ lp_len (15) │
└─────────────────────────────────────┘
```

`lp_off`는 페이지 안에서 실제 튜플이 시작되는 오프셋, `lp_len`은 튜플 길이, `lp_flags`는 슬롯의 상태입니다. 상태는 네 가지가 있습니다.

- **LP_UNUSED** (0): 빈 슬롯. 새 튜플이 즉시 재사용 가능
- **LP_NORMAL** (1): 정상 튜플. `lp_off`/`lp_len`으로 실제 튜플 위치 지정
- **LP_REDIRECT** (2): HOT pruning 후 같은 페이지의 다른 line pointer로 점프하는 리다이렉트
- **LP_DEAD** (3): 죽은 튜플. VACUUM이 인덱스 정리 후 회수 대기

`LP_REDIRECT`와 `LP_DEAD`는 HOT update와 HOT pruning의 흔적입니다. 이 글 후반부에서 직접 보게 됩니다.

`ctid = (block, offset)`의 offset이 바로 이 line pointer 배열의 인덱스이고, **1부터 시작**합니다. PostgreSQL 소스의 `bufpage.h`에 `OffsetNumbers conventionally start at 1, not 0`이라고 주석으로 명시되어 있습니다.

## 튜플 헤더 23바이트

이제 line pointer가 가리키는 실제 튜플로 들어가봅시다. 각 튜플은 23바이트짜리 헤더 `HeapTupleHeaderData`로 시작합니다.

```
┌─────────────────────────────────────────┐  ← 0
│  t_xmin             4 bytes             │  이 튜플을 만든 트랜잭션 ID
├─────────────────────────────────────────┤  ← 4
│  t_xmax             4 bytes             │  이 튜플을 죽인 트랜잭션 ID (없으면 0)
├─────────────────────────────────────────┤  ← 8
│  t_cid / t_xvac     4 bytes (union)     │  CommandId 또는 VACUUM xid
├─────────────────────────────────────────┤  ← 12
│  t_ctid             6 bytes             │  자신 또는 HOT chain의 다음 버전 위치
├─────────────────────────────────────────┤  ← 18
│  t_infomask2        2 bytes             │  속성 개수 + HOT 관련 비트
├─────────────────────────────────────────┤  ← 20
│  t_infomask         2 bytes             │  null 여부, lock 비트, frozen 비트 등
├─────────────────────────────────────────┤  ← 22
│  t_hoff             1 byte              │  사용자 데이터 시작 오프셋
├─────────────────────────────────────────┤  ← 23
│  NULL bitmap (있을 경우)                │
│  alignment padding                      │
├─────────────────────────────────────────┤  ← t_hoff
│  user data (column values)              │
└─────────────────────────────────────────┘
```

여기서 잠깐 짚어둘 게 있습니다. struct 자체의 크기는 정확히 **23바이트**(`offsetof(HeapTupleHeaderData, t_bits)`)이지만, `t_hoff`는 MAXALIGN의 배수여야 하므로 x86-64(MAXALIGN=8) 환경에서는 NULL이 없는 일반 튜플의 사용자 데이터가 **24바이트 지점**부터 시작합니다. "23바이트 헤더"라는 표현은 struct 크기를, "튜플마다 24바이트 오버헤드"는 정렬까지 포함한 실제 오프셋을 가리킵니다.

이 헤더의 핵심은 **`t_xmin`, `t_xmax`, `t_ctid`, 그리고 두 개의 infomask** 필드입니다.

- **`t_xmin`**: 이 튜플을 INSERT한 트랜잭션의 ID. 트랜잭션이 commit되기 전까지는 다른 세션에서 이 튜플이 보이지 않습니다.
- **`t_xmax`**: 이 튜플을 DELETE 또는 UPDATE한 트랜잭션의 ID. 0이면 아직 살아 있는 튜플, 0이 아니면 어느 트랜잭션이 죽였다는 표식.
- **`t_ctid`**: 보통은 자기 자신을 가리키지만, 이 튜플이 UPDATE되어 새 버전이 생기면 **새 버전의 위치**를 가리키도록 갱신됩니다. 즉 한 row의 여러 버전이 단일 연결 리스트로 연결됩니다.
- **`t_infomask`**: 비트 플래그 모음. NULL 컬럼 존재 여부(`HEAP_HASNULL`), xmin/xmax의 commit·abort 결과를 캐싱하는 hint bit(`HEAP_XMIN_COMMITTED`, `HEAP_XMIN_INVALID`, `HEAP_XMAX_COMMITTED`, `HEAP_XMAX_INVALID`), xmax 잠금/멀티 관련 플래그 등이 들어갑니다. hint bit는 가시성 판정의 진실 소스가 아니라 `pg_xact`(commit log) 조회 결과를 튜플에 캐시해두는 것으로, 다음 가시성 판정이 `pg_xact`를 다시 안 읽어도 되게 해주는 최적화입니다.
- **`t_infomask2`**: 컬럼 개수(하위 11비트)와 HOT 관련 비트가 들어갑니다. `HEAP_HOT_UPDATED`(이 튜플이 HOT update의 옛 버전이라 뒤에 heap-only 후속자가 있다는 표시)와 `HEAP_ONLY_TUPLE`(이 튜플은 인덱스에서 직접 참조되지 않으며 HOT chain 순회로만 도달 가능하다는 표시)이 가장 자주 등장합니다.

이 23바이트가 곧 PostgreSQL MVCC의 모든 메타데이터입니다. "한 row인데 여러 버전이 동시에 존재한다"는 PostgreSQL의 동시성 모델은 결국 이 헤더의 `t_xmin`/`t_xmax`/`t_ctid`만 가지고 만들어집니다. 다음 글에서 가시성 판정 알고리즘을 따라가게 됩니다.

## UPDATE는 사실 INSERT다

이제 도입부의 수수께끼로 돌아갑니다. `UPDATE users SET email = 'B@x.com' WHERE id = 2`를 실행했을 때 PostgreSQL이 실제로 한 일은 이렇습니다.

1. `id = 2`인 기존 튜플을 PRIMARY KEY 인덱스로 찾아 위치(`(0,2)`) 확인
2. **새 튜플을 만들어서 같은 페이지의 빈 자리에 INSERT.** 새 위치는 `(0,4)`
3. 새 튜플의 `t_xmin` = 현재 트랜잭션 xid
4. 기존 튜플의 `t_xmax` = 현재 트랜잭션 xid (= "내가 죽였다")
5. 기존 튜플의 `t_ctid` = 새 튜플의 위치 `(0,4)` (= "내 다음 버전은 여기 있다")

원래 튜플은 자리에 그대로 남아 있고, 새 버전이 같은 페이지의 빈 슬롯에 추가됩니다. 그래서 `(0,2) → (0,4)`로 ctid가 "바뀐 것처럼" 보이는 겁니다. 정확히 말하면 한 row가 두 개의 물리적 튜플로 동시에 존재하는 상태이고, 새 트랜잭션이 보는 건 그 중 새 버전입니다.

이 동작은 당연히 비용을 만듭니다. UPDATE 한 번에 페이지 안에 dead tuple이 하나씩 쌓이고, 같은 row를 100번 UPDATE하면 같은 row의 dead 버전이 100개 누적됩니다. 이 dead tuple을 회수하는 게 VACUUM의 일이고, 회수가 늦어지면 페이지가 dead tuple로 가득 찬 상태가 됩니다. 이게 곧 bloat입니다.

### HOT update: 인덱스를 건드리지 않는 UPDATE

UPDATE가 INSERT를 동반한다면, 인덱스는 어떻게 될까요? 새 튜플의 위치 `(0,4)`를 인덱스에 추가해야 할 것 같지만, **항상 그렇지는 않습니다**. PostgreSQL에는 **HOT update**(Heap-Only Tuple update)라는 최적화가 있습니다.

HOT update가 성립하는 조건은 두 가지입니다.

1. **UPDATE된 컬럼이 그 테이블의 어떤 인덱스 정의에도 등장하지 않을 것**. "등장한다"는 말은 단순히 인덱스 키 컬럼만이 아니라, 표현식 인덱스의 식에서 참조되는 컬럼, 부분 인덱스의 `WHERE` predicate에 등장하는 컬럼까지 모두 포함합니다. 단 BRIN 같은 summarizing 인덱스는 이 검사에서 제외됩니다. 위 예시에서는 `id`에만 PRIMARY KEY가 있고 `email` 컬럼은 어떤 인덱스에도 등장하지 않으므로 조건 충족입니다.
2. **새 튜플이 같은 페이지의 빈 자리에 들어갈 만큼 free space가 있을 것**.

조건이 맞으면 **새 인덱스 엔트리를 만들지 않습니다**. 인덱스는 여전히 옛 위치 `(0,2)`를 가리키고, 검색 시 옛 튜플의 `t_infomask2`에서 `HEAP_HOT_UPDATED` 비트를 본 뒤 `t_ctid`를 따라 같은 페이지의 새 버전 `(0,4)`로 점프합니다. 이렇게 같은 페이지 안에서 옛 버전과 새 버전이 `t_ctid`로 연결된 사슬을 **HOT chain**이라고 부릅니다.

새 튜플(여기서는 `(0,4)`)에는 `HEAP_ONLY_TUPLE` 비트(역시 `t_infomask2`)가 붙어서 "나는 인덱스에서 직접 참조되지 않으며, 오직 HOT chain 순회로만 도달 가능한 튜플"임을 표시합니다.

나중에 HOT pruning이 일어나면 옛 line pointer 자체가 `LP_REDIRECT`로 바뀌고 옛 튜플 데이터는 사라집니다. 이때부터는 검색 경로가 살짝 짧아집니다. 인덱스 → 옛 line pointer(LP_REDIRECT) → 그 redirect가 가리키는 line pointer → 새 튜플. 옛 튜플 데이터를 거치지 않고 line pointer 단계에서 한 번에 점프합니다.

HOT update의 효과는 큽니다. 인덱스가 10개 있는 테이블에서 평범한 UPDATE는 인덱스 엔트리를 10개 추가해야 하지만, HOT update는 0개입니다. 인덱스 bloat가 거의 안 생기고, WAL 양도 줄어듭니다. update가 잦은 테이블의 성능을 결정하는 큰 변수 중 하나가 "내 UPDATE 중 몇 %가 HOT으로 처리되고 있는가"입니다.

### FILLFACTOR: 페이지를 처음부터 가득 채우지 않는 이유

HOT update의 두 번째 조건이 "같은 페이지에 빈 자리가 있어야 한다"이므로, **빈 자리를 의도적으로 남겨두면 HOT update 가능성이 올라갑니다**. 이게 `FILLFACTOR`입니다.

`FILLFACTOR`는 페이지의 몇 %까지만 INSERT로 채울지 정하는 storage parameter입니다. 기본값은 다음과 같습니다.

| 객체 | 기본 FILLFACTOR |
|------|----------------|
| 힙(테이블) | 100 |
| B-tree 인덱스 | 90 |
| Hash 인덱스 | 75 |
| GiST 인덱스 | 90 |
| SP-GiST 인덱스 | 80 |
| GIN, BRIN | (옵션 미지원) |

테이블 기본값이 100인 이유는 read-only 또는 append-only 테이블이 일반적이기 때문입니다. UPDATE가 잦은 좁은 row 테이블에는 80~90 정도로 낮춰두는 게 일반적인 권장입니다.

```sql
ALTER TABLE users SET (fillfactor = 80);
-- 이후 새로 INSERT되는 페이지는 80%까지만 채워지고
-- 20%는 미래의 HOT update를 위해 비워둠
```

이미 채워진 페이지는 즉시 다시 분배되지 않습니다. 새로 할당되거나 새로 쓰이는 페이지에만 새 fillfactor가 적용되고, 기존 페이지의 밀도를 실제로 바꾸려면 테이블을 통째로 다시 쓰는 `VACUUM FULL`이나 `CLUSTER`, 혹은 `pg_repack` 같은 작업이 필요합니다. 일반 `VACUUM`은 dead tuple만 회수할 뿐 fillfactor에 맞춰 페이지를 재구성하지 않습니다.

FILLFACTOR를 낮추는 게 항상 이득은 아닙니다. 100보다 낮으면 같은 row 수를 담는데 더 많은 페이지가 필요하므로 디스크와 shared_buffers 사용량이 비례해서 늘어납니다. 모든 테이블에 일괄 적용은 안티패턴이고, **update-heavy + 좁은 row + 인덱스 다수**라는 조건이 겹치는 테이블에 한해 의미가 있습니다.

### 실험: pageinspect로 페이지 안 직접 보기

`pageinspect` extension(PostgreSQL 배포에 기본 포함되는 contrib)을 설치하면 페이지의 모든 line pointer와 튜플 헤더를 직접 들여다볼 수 있습니다.

```sql
CREATE EXTENSION pageinspect;

CREATE TABLE hot_demo (id int PRIMARY KEY, val text) WITH (fillfactor = 80);
INSERT INTO hot_demo VALUES (1, 'a'), (2, 'b'), (3, 'c');

SELECT lp, lp_off, lp_flags, t_xmin, t_xmax, t_ctid, t_infomask2
FROM heap_page_items(get_raw_page('hot_demo', 0));
```

| lp | lp_off | lp_flags | t_xmin | t_xmax | t_ctid | t_infomask2 |
|----|--------|----------|--------|--------|--------|-------------|
| 1 | 8160 | 1 | 742 | 0 | (0,1) | 2 |
| 2 | 8128 | 1 | 742 | 0 | (0,2) | 2 |
| 3 | 8096 | 1 | 742 | 0 | (0,3) | 2 |

이제 `id = 2` row만 UPDATE해보고 같은 페이지를 다시 들여다봅니다.

```sql
UPDATE hot_demo SET val = 'B' WHERE id = 2;

SELECT lp, lp_off, lp_flags, t_xmin, t_xmax, t_ctid, t_infomask2
FROM heap_page_items(get_raw_page('hot_demo', 0));
```

| lp | lp_off | lp_flags | t_xmin | t_xmax | t_ctid | t_infomask2 | |
|----|--------|----------|--------|--------|--------|-------------|---|
| 1 | 8160 | 1 | 742 | 0 | (0,1) | 2 | |
| 2 | 8128 | 1 | 742 | 743 | (0,4) | 16386 | ← HEAP_HOT_UPDATED |
| 3 | 8096 | 1 | 742 | 0 | (0,3) | 2 | |
| 4 | 8064 | 1 | 743 | 0 | (0,4) | 32770 | ← HEAP_ONLY_TUPLE |

UPDATE 한 번으로 일어난 변화를 그대로 볼 수 있습니다.

- 슬롯 2번(원래 `id=2` row)의 `t_xmax`가 0에서 743(UPDATE 트랜잭션 xid)으로 바뀌었고, `t_ctid`가 `(0,2)`에서 `(0,4)`로 갱신되었습니다. "내 다음 버전은 슬롯 4에 있다"는 의미입니다.
- 슬롯 4번이 새로 생겼고, `t_xmin`이 743(같은 트랜잭션)이며 자기 자신을 가리킵니다.
- `t_infomask2`의 값이 달라졌는데, 16386은 `HEAP_HOT_UPDATED`(0x4000=16384) + 컬럼 수 2, 32770은 `HEAP_ONLY_TUPLE`(0x8000=32768) + 컬럼 수 2 입니다.
- `id` 컬럼에 PRIMARY KEY가 있지만 이번 UPDATE는 `val` 컬럼만 바꿨기 때문에 HOT update 조건이 성립했고, 인덱스 엔트리는 추가되지 않았습니다.

같은 페이지 안에서 dead chain의 정리는 다음 SELECT가 페이지를 읽을 때 **HOT pruning**으로 처리됩니다. VACUUM을 기다릴 필요 없이 페이지 단위로 정리되고, 슬롯 2번이 `LP_REDIRECT`로 바뀌어 슬롯 4번을 가리키게 됩니다. HOT pruning은 인덱스 정리 없이 페이지 안에서만 일어나는 가벼운 cleanup이고, 인덱스 엔트리까지 회수하는 본격적인 청소는 VACUUM의 몫입니다.

## TOAST: 8KB에 안 들어가는 큰 값

지금까지의 모든 이야기는 한 튜플이 8KB 페이지 한 장 안에 들어간다는 걸 전제로 했습니다. 그런데 만약 컬럼 하나에 1MB짜리 JSON을 넣으려면 어떻게 될까요? 한 페이지가 8KB인데 한 row가 1MB일 수는 없습니다.

PostgreSQL의 답이 **TOAST**(The Oversized-Attribute Storage Technique)입니다. 한 튜플의 크기가 임계값(`TOAST_TUPLE_THRESHOLD`, 기본 8KB 페이지에서 한 페이지에 4개 튜플이 들어가는 최대 크기, 약 2KB)을 넘으면 TOAST가 동작합니다. 큰 값은 압축을 시도하고, 그래도 크면 본 테이블에서 떼어내 옆에 만들어진 전용 테이블로 옮긴 뒤, 본 테이블에는 18바이트짜리 포인터만 남깁니다.

전용 테이블의 이름은 `pg_toast.pg_toast_<oid>` 형식이고, 메인 테이블 OID로 이름이 결정됩니다.

```sql
SELECT reltoastrelid::regclass FROM pg_class WHERE relname = 'demo';
```

| reltoastrelid |
|---------------|
| pg_toast.pg_toast_16459 |

큰 값은 이 TOAST 테이블 안에서 다시 chunk(보통 약 2KB)로 쪼개져 저장됩니다. SELECT 시에는 본 테이블에서 포인터를 읽고, 포인터가 가리키는 TOAST 테이블의 chunk들을 다시 읽어 합쳐서 원래 값을 복원합니다. 즉 **TOAST된 컬럼은 매번 추가 I/O가 필요**합니다.

### 4가지 storage strategy

각 컬럼은 네 가지 저장 전략 중 하나를 가집니다. variable-length 타입(text, bytea, jsonb, varchar, numeric, 배열 등)만 TOAST 대상이며, 고정 길이 타입(int, bigint, timestamp 등)은 PLAIN 외의 선택지가 없습니다.

| Strategy | 압축 | 외부 저장 | 기본값인 타입 |
|----------|------|----------|--------------|
| **PLAIN** | ❌ | ❌ | 고정 길이 타입(int, timestamp 등) |
| **EXTENDED** | ✅ | ✅ | variable-length 타입의 기본값(text, jsonb 등) |
| **EXTERNAL** | ❌ | ✅ | (수동 지정) substring 같은 부분 접근을 빠르게 하려는 경우 |
| **MAIN** | ✅ | 가능한 한 회피 | (수동 지정) in-line 유지를 우선시 |

`ALTER TABLE ... ALTER COLUMN ... SET STORAGE ...`로 변경할 수 있습니다. 압축 알고리즘은 PostgreSQL 18 기준 시스템 기본값이 여전히 `pglz`이고, PG 14부터 컬럼 단위로 LZ4를 선택할 수 있습니다(`SET COMPRESSION lz4`, 빌드 시 `--with-lz4` 필요).

### 실험: TOAST 동작 확인하기

```sql
CREATE TABLE big_text_demo (id int, content text);

-- 작은 텍스트
INSERT INTO big_text_demo VALUES (1, 'small');

-- 큰 반복 텍스트 (압축이 잘 됨 → 압축 후 in-line 유지)
INSERT INTO big_text_demo VALUES (2, repeat('a', 100000));

-- 큰 랜덤 텍스트 (압축 효과 없음 → 외부 저장)
INSERT INTO big_text_demo
SELECT 3, string_agg(md5(g::text), '') FROM generate_series(1, 5000) g;

SELECT id,
       length(content) AS logical_size,
       pg_column_size(content) AS column_size,
       pg_column_compression(content) AS compression
FROM big_text_demo
ORDER BY id;
```

| id | logical_size | column_size | compression |
|----|--------------|-------------|-------------|
| 1 | 5 | 6 | |
| 2 | 100000 | 1156 | pglz |
| 3 | 160000 | 160000 | |

세 row 모두 같은 텍스트 컬럼인데 동작은 전혀 다릅니다.

- **id=1**: 5바이트짜리 작은 값. `column_size`는 varlena 1바이트 헤더 + 5 = 6. TOAST 임계값 근처에도 못 미치니 TOAST는 동작하지 않습니다.
- **id=2**: 100KB짜리 `'aaaaa...'` 반복 텍스트. `pglz`로 압축되어 약 1.1KB로 줄었고, 임계값 아래로 내려갔으니 본 테이블에 그대로 in-line으로 들어갑니다. `compression` 컬럼이 `pglz`로 표시됩니다.
- **id=3**: 160KB짜리 랜덤 md5 해시. 압축이 거의 안 되니 외부 저장으로 빠집니다. `compression`이 비어 있는 게 그 증거입니다(외부 저장된 비압축 값). `column_size`가 160000 그대로 나오는 건 `pg_column_size`가 외부 저장된 값도 detoasted 후의 크기를 반환하기 때문이고, 본 테이블에 실제로 남는 건 18바이트짜리 포인터뿐입니다.

본 테이블과 TOAST 테이블의 실제 디스크 사용량을 비교하면 외부 저장이 일어났음을 더 확실히 볼 수 있습니다.

```sql
SELECT pg_size_pretty(pg_relation_size('big_text_demo')) AS main_size,
       pg_size_pretty(pg_relation_size(
           (SELECT reltoastrelid FROM pg_class WHERE relname = 'big_text_demo')
       )) AS toast_size;
```

| main_size | toast_size |
|-----------|------------|
| 8192 bytes | 168 kB |

본 테이블은 페이지 한 장(8192 bytes)에 그대로 머물러 있고, 큰 데이터는 TOAST 테이블 쪽에 168 kB가 쌓였습니다. 만약 외부 저장이 일어나지 않았다면 본 테이블이 최소 160KB 이상 부풀어야 했을 겁니다.

운영에서 이게 왜 중요할까요? `text`나 `jsonb` 컬럼이 들어 있는 테이블의 SELECT가 이상하게 느려졌다면, 그 컬럼이 TOAST되어 추가 I/O가 발생하고 있을 가능성이 큽니다. 필요 없을 때는 `SELECT *` 대신 큰 컬럼을 빼고 가져오는 것만으로도 체감 속도가 달라집니다. JSON 컬럼이 잦은 read/write의 핵심이라면 EXTERNAL로 전환해 압축 비용을 없애거나, 반대로 read만 많고 압축률이 좋다면 MAIN으로 in-line 유지를 시도해볼 수 있습니다.

## 마치며

PostgreSQL의 한 row가 디스크 위에서 어떻게 사는지를 따라왔습니다. relfilenode 파일 안의 8KB 페이지, 양쪽에서 채워들어오는 line pointer와 tuple, 23바이트 헤더에 박힌 `t_xmin`/`t_xmax`/`t_ctid`, UPDATE가 사실은 INSERT라는 사실, 같은 페이지에 빈 공간이 있을 때만 발동하는 HOT update와 그것을 의도적으로 유도하는 FILLFACTOR, 그리고 8KB에 안 맞는 큰 값을 옆 테이블로 떼어내는 TOAST까지. 운영 중에 마주치는 ctid 변동, bloat, FILLFACTOR 권장, "큰 컬럼이 든 SELECT가 느려진" 현상의 원인은 모두 이 페이지 한 장 안의 구조에서 나옵니다.

다음 글에서는 여기서 이름만 짚고 지나간 `t_xmin`과 `t_xmax`가 본격적으로 주인공이 됩니다. "같은 row의 여러 버전이 동시에 존재한다"는 PostgreSQL MVCC의 핵심 모델이 어떻게 가시성 판정으로 이어지고, snapshot이 실제로는 어떤 자료구조이고, `xid`가 32비트 한계에 부딪힐 때 무슨 일이 일어나는지 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 73. Database Physical Storage](https://www.postgresql.org/docs/18/storage.html)
- [Page Layout](https://www.postgresql.org/docs/18/storage-page-layout.html): PageHeaderData, ItemIdData, HeapTupleHeaderData 레이아웃
- [TOAST](https://www.postgresql.org/docs/18/storage-toast.html): 4가지 storage strategy 공식 설명
- [Heap-Only Tuples (README.HOT)](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/heap/README.HOT): HOT update와 HOT pruning의 정확한 메커니즘
- [`pageinspect`](https://www.postgresql.org/docs/18/pageinspect.html): 페이지 내부를 SQL로 들여다보는 contrib extension
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 1: Database Cluster, Databases, and Tables](https://www.interdb.jp/pg/pgsql01.html)
