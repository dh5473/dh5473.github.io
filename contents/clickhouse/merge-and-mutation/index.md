---
date: '2026-05-19'
title: '백그라운드 머지와 뮤테이션: 불변 Part는 어떻게 관리되는가'
category: 'Database'
series: 'clickhouse'
seriesOrder: 3
tags: ['ClickHouse', 'MergeTree', 'Merge', 'Mutation', 'Part Lifecycle']
summary: 'INSERT마다 쌓이는 불변 Part를 백그라운드 머지가 어떻게 합치는지, 불변 Part 위에서 UPDATE/DELETE가 어떻게 구현되는지를 Part 생명주기, system.merges, system.mutations 실험으로 확인합니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/clickhouse/mergetree-internals/)에서 Part 이름의 구조를 분석했습니다. `all_1_1_0`에서 마지막 `0`은 머지 횟수라고 했습니다. INSERT를 세 번 실행하면 `all_1_1_0`, `all_2_2_0`, `all_3_3_0` 세 개의 Part가 생긴다고도 했습니다. 그런데 `system.parts`를 몇 초 뒤에 다시 조회하면, 세 Part가 사라지고 `all_1_3_1` 하나만 남아 있습니다. 무슨 일이 일어난 걸까요?

한 가지 더. Part는 불변(immutable)이라고 했습니다. 한번 디스크에 쓰이면 절대 수정되지 않습니다. 그렇다면 `ALTER TABLE orders UPDATE price = 0 WHERE order_id = 42`는 어떻게 동작할까요? 불변인 데이터를 어떻게 "수정"하는 걸까요?

<br>

이 글에서는 불변 Part를 관리하는 두 가지 메커니즘을 다룹니다. Part를 합치는 **백그라운드 머지**와, 불변 Part 위에서 변경을 구현하는 **뮤테이션(Mutation)**입니다.

## 왜 불변 Part인가: 설계 동기

PostgreSQL은 8KB 페이지 안에서 행을 직접 수정합니다(in-place update). UPDATE 하나에도 WAL 기록, 행 잠금, MVCC 버전 관리가 따라옵니다. 단건 트랜잭션 위주의 OLTP에서는 합리적인 설계지만, 초당 수십만 행을 쏟아붓는 OLAP 쓰기 패턴에서는 이 오버헤드가 심각한 병목이 됩니다.

MergeTree는 정반대의 선택을 합니다. INSERT가 들어오면 데이터를 `ORDER BY` 순서로 정렬해서 새로운 Part를 디스크에 **순차 쓰기(sequential write)**합니다. 기존 Part는 건드리지 않습니다. 락도 없고, 랜덤 I/O도 없습니다. 쓰기 처리량이 디스크 순차 대역폭에 비례해서 선형으로 스케일합니다.

```
In-place Update (RDB)              Append + Merge (MergeTree)

┌──────────────────┐               INSERT 1 → Part A (불변)
│  Page 내부에서     │               INSERT 2 → Part B (불변)
│  직접 수정         │ ← 락, WAL    INSERT 3 → Part C (불변)
│  (random I/O)     │                          │
└──────────────────┘                           ▼ 백그라운드 머지
                                   Part ABC (불변, 통합)
```

대신 읽기 비용이 생깁니다. Part가 여러 개 있으면 쿼리가 모든 Part를 확인해야 합니다. Part 10개에서 같은 `WHERE` 조건을 검색하려면, 각 Part의 `primary.idx`를 10번 탐색하고 해당 granule을 10번 읽어야 합니다.

이 읽기 비용을 줄이는 메커니즘이 **백그라운드 머지**입니다. 작은 Part 여러 개를 큰 Part 하나로 합쳐서, 쿼리가 확인해야 할 Part 수를 줄입니다. 쓰기 속도를 극대화하고, 읽기 비용은 머지로 점진적으로 상환하는 구조입니다. 이것이 MergeTree라는 이름의 핵심입니다.

## 백그라운드 머지

### 머지는 어떻게 동작하는가

ClickHouse는 백그라운드 스레드에서 주기적으로 Part 목록을 확인하고, 합칠 Part를 선택합니다. 선택된 Part들의 데이터를 `ORDER BY` 순서로 merge-sort하여 하나의 새 Part를 생성합니다.

[지난 글](/clickhouse/mergetree-internals/)에서 Part 이름 `all_1_1_0`을 분해했습니다. 머지가 일어나면 이름이 어떻게 바뀌는지 봅시다.

```
머지 전:
  all_1_1_0  (block 1~1, level 0)
  all_2_2_0  (block 2~2, level 0)
  all_3_3_0  (block 3~3, level 0)

         │  백그라운드 머지
         ▼

머지 후:
  all_1_3_1  (block 1~3, level 1)
```

`min_block`은 원본 Part들 중 최솟값(1), `max_block`은 최댓값(3), `level`은 기존 최댓값 + 1(0 + 1 = 1)이 됩니다. Part 이름만 봐도 "이 Part는 block 1부터 3까지를 한 번 머지한 결과"라는 이력을 읽을 수 있습니다.

머지가 완료되면 원본 Part 세 개는 **inactive** 상태로 전환됩니다. 새 Part가 이후의 모든 쿼리를 서빙하고, 원본은 일정 시간이 지나면 디스크에서 물리적으로 삭제됩니다.

핵심은 이 과정 전체가 **비차단(non-blocking)**이라는 점입니다. 머지가 진행되는 동안에도 원본 Part들은 쿼리에 정상적으로 응답합니다. 새 Part가 완성되면 메타데이터를 atomic하게 교체하여, 쿼리가 끊김 없이 새 Part로 전환됩니다.

### 파티션 경계와 머지 규칙

머지에는 절대적인 규칙이 하나 있습니다. **같은 파티션 안의 Part만 머지됩니다.** 서로 다른 파티션의 Part는 절대 합쳐지지 않습니다.

이 규칙 때문에 파티셔닝이 머지 효율에 직접적인 영향을 줍니다. 파티션을 너무 세밀하게 나누면 (예를 들어 일별 파티션에 INSERT가 시간당 한 번뿐이라면) 각 파티션에 Part가 하나씩만 존재해서 머지할 대상 자체가 없습니다. Part 수가 줄어들지 않고 계속 쌓이기만 합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  파티션 수가 많을수록 머지 효율이 떨어집니다. 파티셔닝은 "오래된 데이터를 통째로 DROP하기 위한 도구"이지, 쿼리 성능을 위한 도구가 아닙니다. 파티셔닝 전략은 <a href="/clickhouse/partitioning-and-indices/">#6(파티셔닝과 보조 인덱스)</a>에서 상세히 다룹니다.
</div>

머지 스케줄러가 어떤 Part를 선택하는가도 중요합니다. ClickHouse의 머지 알고리즘은 Part 크기, 개수, 총 재작성 비용 등을 종합적으로 고려하여 최적의 Part 조합을 선택합니다. 일반적으로 작은 Part가 먼저 머지되는 경향이 있는데, 비용 대비 Part 수 감소 효과가 크기 때문입니다. 이미 큰 Part는 머지 비용이 높아 나중에 처리됩니다.

### Part 생명주기

Part는 생성부터 삭제까지 세 단계를 거칩니다.

```
                 머지 완료                 old_parts_lifetime 경과
  ┌──────────┐ ──────────▶ ┌──────────┐ ──────────────────────▶ ┌──────────┐
  │  Active   │            │ Inactive  │                        │ 물리 삭제  │
  │ (active=1)│            │ (active=0)│                        │ (디스크    │
  │           │            │           │                        │  에서 제거) │
  └──────────┘             └──────────┘                         └──────────┘
       ▲
       │ INSERT
```

**Active**: INSERT로 생성된 직후부터 쿼리에 응답하는 상태입니다. `system.parts`에서 `active = 1`로 표시됩니다.

**Inactive**: 머지가 완료되어 새 Part로 대체된 상태입니다. `active = 0`이지만 디스크에는 남아 있습니다. 왜 바로 삭제하지 않을까요? 가장 큰 이유는 장애 복구입니다. 머지 직후 서버가 비정상 종료되어 새 Part가 손상되면, inactive 상태의 원본 Part로 복원할 수 있습니다. 또한 머지 직전에 시작된 쿼리가 아직 원본을 읽고 있을 수도 있습니다.

**물리 삭제**: `old_parts_lifetime`(기본 480초, 8분)이 지나면 inactive Part가 디스크에서 완전히 제거됩니다. `system.parts`에서도 사라집니다.

`system.parts`의 `modification_time`은 Part가 생성된 시각, `remove_time`은 inactive로 전환된 시각입니다. 두 시각의 차이가 Part의 active 수명입니다.

### 머지가 디스크에 미치는 영향

머지가 진행되는 동안 원본 Part와 새 Part가 동시에 디스크에 존재합니다. 10GB Part 세 개를 머지하면, 완료 시점에 원본 30GB + 신규 30GB = 총 60GB가 디스크를 차지합니다. 원본이 삭제되기까지 8분간 이 상태가 유지됩니다.

대규모 테이블에서 여러 머지가 동시에 진행되면 디스크 사용량이 급증할 수 있습니다. 디스크 여유 공간이 부족하면 머지가 실패하고, Part 수가 줄지 않아 읽기 성능이 저하되는 악순환에 빠집니다. `system.merges`에서 진행 중인 머지를 모니터링하는 것이 중요한 이유입니다.

## 뮤테이션: 불변 Part 위의 변경

### ALTER TABLE UPDATE / DELETE

RDB에서 `UPDATE`와 `DELETE`는 가장 기본적인 연산이지만, ClickHouse에서는 **뮤테이션(Mutation)**이라는 특별한 메커니즘으로 처리됩니다.

```sql
-- 뮤테이션: Part를 통째로 재작성
ALTER TABLE orders UPDATE price = 0 WHERE category = '전자제품';
ALTER TABLE orders DELETE WHERE order_id < 100;
```

이 명령이 실행되면 ClickHouse는 조건에 매칭될 수 있는 **모든 Part를 통째로 재작성**합니다. Part 안의 데이터를 처음부터 끝까지 읽으면서 조건에 맞는 행을 수정(또는 제거)한 새 Part를 생성하고, 원본 Part를 inactive로 전환합니다.

```
ALTER TABLE orders UPDATE price = 0 WHERE category = '전자제품'

all_1_3_1 (원본 Part, 1,000만 행)
    │
    ▼  전체 Part 읽기 → 조건 적용 → 새 Part 쓰기
    │
all_1_3_1 → inactive → 삭제
all_1_3_1_4 (새 Part, price 수정 반영)
```

1행만 수정해도 Part 전체(수백만 행)를 재작성합니다. 이것이 ClickHouse에서 뮤테이션이 "무거운 연산"인 이유입니다. 불변 Part를 "수정"하는 유일한 방법이 새 복사본을 만드는 것이기 때문입니다.

뮤테이션은 기본적으로 **비동기**입니다. `ALTER TABLE` 명령은 즉시 반환되고, 실제 Part 재작성은 백그라운드에서 진행됩니다. 진행 상태는 `system.mutations` 테이블에서 추적합니다.

```sql
SELECT
    command,
    is_done,
    parts_to_do,
    latest_fail_reason
FROM system.mutations
WHERE table = 'orders';
```

`is_done = 1`이면 완료, `parts_to_do`가 0이 아니면 아직 처리할 Part가 남아 있다는 뜻입니다. 완료를 기다려야 하는 상황이라면 `SETTINGS mutations_sync = 1`을 추가하면 됩니다.

```sql
ALTER TABLE orders
UPDATE price = 0
WHERE category = '전자제품'
SETTINGS mutations_sync = 1;  -- 완료까지 대기
```

### Lightweight DELETE: 더 가벼운 삭제

ALTER TABLE DELETE가 Part를 통째로 재작성한다면, `DELETE FROM`은 훨씬 가볍습니다.

```sql
-- Lightweight DELETE
DELETE FROM orders WHERE order_id < 100;
```

Lightweight DELETE는 모든 컬럼 파일을 재작성하지 않습니다. 내부적으로 `ALTER TABLE UPDATE _row_exists = 0 WHERE ...` 형태의 뮤테이션으로 변환됩니다. Wide Part의 경우 `_row_exists` 컬럼 파일만 새로 쓰고, 나머지 컬럼 파일은 **hardlink**로 연결하여 새 Part를 만듭니다. 전체 컬럼을 다시 쓰는 ALTER TABLE DELETE에 비해 I/O가 극적으로 줄어듭니다.

이후 SELECT 쿼리는 자동으로 `PREWHERE _row_exists = 1` 조건이 추가되어, 삭제 표시된 행을 건너뜁니다. 실제 물리적 제거는 다음 백그라운드 머지 때 일어납니다.

| 특성 | ALTER TABLE DELETE | DELETE FROM (Lightweight) |
|------|-------------------|--------------------------|
| Part 재작성 | 전체 컬럼 파일 재작성 | `_row_exists`만 재작성 + hardlink |
| 실행 속도 | 느림 (Part 크기에 비례) | 빠름 |
| 디스크 I/O | 무거움 | 가벼움 |
| 데이터 물리 제거 시점 | 뮤테이션 완료 시 (새 Part) | 다음 머지 시 |
| 쿼리 오버헤드 | 없음 | `_row_exists` 마스크 체크 |
| 주 용도 | 대량 일괄 삭제 | 선택적 행 삭제 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  Lightweight DELETE도 내부적으로는 뮤테이션의 일종이고, 새 Part를 생성합니다. 다만 Wide Part에서는 <code>_row_exists</code> 컬럼만 실제로 쓰고 나머지는 hardlink이므로 I/O가 최소화됩니다. Compact Part(기본 10MB 미만)에서는 모든 컬럼이 하나의 파일에 있어서 전체 재작성이 발생합니다.
</div>

대량 삭제가 필요한 경우에는 두 방법 모두 비효율적입니다. 오래된 데이터를 주기적으로 정리하는 패턴이라면, 파티션 단위로 `ALTER TABLE DROP PARTITION`을 사용하는 것이 가장 빠릅니다. 이 전략은 [#6(파티셔닝과 보조 인덱스)](/clickhouse/partitioning-and-indices/)에서 다룹니다.

### 뮤테이션의 한계와 올바른 사용법

RDB에서 UPDATE는 일상적인 연산입니다. 주문 상태를 변경하고, 사용자 프로필을 수정하고, 재고를 차감합니다. ClickHouse에서 뮤테이션은 그런 용도가 아닙니다. **잘못 들어간 데이터를 일괄 수정하거나, 규정 준수를 위해 개인정보를 삭제하는 등 비상 조치에 가깝습니다.**

만약 "사용자가 주문을 취소하면 상태를 변경해야 한다"거나 "같은 키의 데이터가 중복으로 들어올 수 있다"는 요구사항이 있다면, 뮤테이션으로 해결하려 하면 안 됩니다. 이것은 스키마 설계의 문제입니다.

기본 MergeTree는 머지할 때 Part의 데이터를 그대로 합칩니다. 중복을 제거하지도, 값을 집계하지도 않습니다. 이 한계를 해결하기 위해 설계된 것이 **MergeTree 변종 엔진**들입니다. ReplacingMergeTree는 같은 키의 중복을 머지 시점에 제거하고, CollapsingMergeTree는 상태 변경을 +1/-1 쌍으로 처리합니다. 다음 글에서 이 엔진들이 머지 과정에서 어떤 추가 로직을 수행하는지 다룹니다.

## 실험: Docker로 직접 확인하기

[이전 글](/clickhouse/mergetree-internals/)의 Docker 환경(`ch-test` 컨테이너)을 그대로 사용합니다. 컨테이너가 없다면 [첫 번째 글](/clickhouse/why-clickhouse/)의 Docker 실험 섹션을 참고하세요.

### 머지 과정 관찰

머지를 직접 관찰하려면 Part가 여러 개 존재해야 합니다. 기존 `orders` 테이블을 삭제하고, 세 번 나눠서 INSERT합니다.

```sql
DROP TABLE IF EXISTS orders;

CREATE TABLE orders
(
    order_id    UInt64,
    user_id     UInt32,
    price       UInt32,
    category    LowCardinality(String),
    created_at  DateTime
)
ENGINE = MergeTree()
ORDER BY (category, created_at);
```

```sql
-- 3번 나눠서 INSERT → Part 3개 생성
INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(3000000);

INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(3000000, 3000000);

INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(6000000, 4000000);
```

INSERT 직후 `system.parts`를 조회하면 세 개의 Part를 확인할 수 있습니다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size,
    modification_time
FROM system.parts
WHERE table = 'orders'
ORDER BY name;
```

```
┌─name──────┬─active─┬────rows─┬─size───────┬─modification_time───┐
│ all_1_1_0 │      1 │ 3000000 │ 33.38 MiB  │ 2026-05-19 12:00:01 │
│ all_2_2_0 │      1 │ 3000000 │ 33.37 MiB  │ 2026-05-19 12:00:03 │
│ all_3_3_0 │      1 │ 4000000 │ 44.48 MiB  │ 2026-05-19 12:00:05 │
└───────────┴────────┴─────────┴────────────┴─────────────────────┘
```

세 Part 모두 `active = 1`, level은 `0`입니다. 몇 초 후 다시 조회해봅시다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders'
ORDER BY active DESC, name;
```

```
┌─name──────┬─active─┬─────rows─┬─size───────┐
│ all_1_3_1 │      1 │ 10000000 │ 111.05 MiB │
│ all_1_1_0 │      0 │  3000000 │ 33.38 MiB  │
│ all_2_2_0 │      0 │  3000000 │ 33.37 MiB  │
│ all_3_3_0 │      0 │  4000000 │ 44.48 MiB  │
└───────────┴────────┴──────────┴────────────┘
```

`all_1_3_1`이 새로 생겼고, 원본 세 Part는 `active = 0`이 되었습니다. block 범위가 `1_3`으로 합쳐지고 level이 `1`로 올라간 것을 확인할 수 있습니다. 8분 후 다시 조회하면 inactive Part들은 디스크에서 제거되어 `all_1_3_1`만 남습니다.

머지가 진행 중일 때 `system.merges`를 조회하면 진행 상태를 볼 수 있습니다.

```sql
SELECT
    table,
    result_part_name,
    progress,
    elapsed,
    num_parts,
    formatReadableSize(total_size_bytes_compressed) AS total_size,
    is_mutation
FROM system.merges
WHERE table = 'orders';
```

```
┌─table──┬─result_part_name─┬─progress─┬─elapsed─┬─num_parts─┬─total_size─┬─is_mutation─┐
│ orders │ all_1_3_1        │     0.45 │    1.23 │         3 │ 111.23 MiB │           0 │
└────────┴──────────────────┴──────────┴─────────┴───────────┴────────────┴─────────────┘
```

`progress`는 0\~1 사이의 값(여기서는 45% 진행), `num_parts`는 머지에 참여하는 Part 수, `is_mutation`은 뮤테이션 여부(0이면 일반 머지)입니다. 머지가 빠르게 완료되면 이 쿼리가 빈 결과를 반환할 수도 있습니다.

### ALTER TABLE 뮤테이션 실험

머지가 완료된 상태에서 뮤테이션을 실행해봅시다. `전자제품` 카테고리의 price를 전부 0으로 변경합니다.

```sql
ALTER TABLE orders
UPDATE price = 0
WHERE category = '전자제품'
SETTINGS mutations_sync = 1;
```

`mutations_sync = 1`이므로 명령이 완료될 때까지 대기합니다. 완료 후 `system.mutations`를 확인합니다.

```sql
SELECT
    mutation_id,
    command,
    create_time,
    is_done,
    parts_to_do
FROM system.mutations
WHERE table = 'orders';
```

```
┌─mutation_id────┬─command──────────────────────────────────────┬─create_time─────────┬─is_done─┬─parts_to_do─┐
│ mutation_4.txt │ UPDATE price = 0 WHERE category = '전자제품' │ 2026-05-19 12:01:15 │       1 │           0 │
└────────────────┴──────────────────────────────────────────────┴─────────────────────┴─────────┴─────────────┘
```

`is_done = 1`, `parts_to_do = 0`. 뮤테이션이 완료되었습니다. `system.parts`를 확인하면 새 Part가 생성된 것을 볼 수 있습니다.

```sql
SELECT name, active, rows
FROM system.parts
WHERE table = 'orders'
ORDER BY active DESC, name;
```

```
┌─name────────┬─active─┬─────rows─┐
│ all_1_3_1_4 │      1 │ 10000000 │
│ all_1_3_1   │      0 │ 10000000 │
└─────────────┴────────┴──────────┘
```

원본 `all_1_3_1`이 inactive가 되고, 뮤테이션이 적용된 `all_1_3_1_4`가 active입니다. 데이터가 실제로 변경되었는지 확인합니다.

```sql
SELECT
    count() AS cnt,
    avg(price) AS avg_price
FROM orders
WHERE category = '전자제품';
```

```
┌─────cnt─┬─avg_price─┐
│ 1250000 │         0 │
└─────────┴───────────┘
```

`avg_price`가 0입니다. 1,000만 행 전체 Part를 재작성해서 `전자제품` 행의 price만 0으로 바꾼 것입니다.

### Lightweight DELETE 실험

이번에는 Lightweight DELETE를 사용해봅시다.

```sql
DELETE FROM orders WHERE order_id < 100;
```

이 명령은 거의 즉시 반환됩니다. 전체 컬럼 파일을 재작성하지 않기 때문입니다. `system.mutations`를 확인하면 내부적으로 어떤 연산이 실행되었는지 볼 수 있습니다.

```sql
SELECT mutation_id, command, is_done
FROM system.mutations
WHERE table = 'orders'
ORDER BY create_time DESC
LIMIT 1;
```

```
┌─mutation_id────┬─command──────────────────────────────────────────────┬─is_done─┐
│ mutation_5.txt │ UPDATE _row_exists = 0 WHERE order_id < 100         │       1 │
└────────────────┴──────────────────────────────────────────────────────┴─────────┘
```

`DELETE FROM`이 내부적으로 `UPDATE _row_exists = 0`으로 변환된 것을 직접 확인할 수 있습니다. 행이 실제로 조회에서 제외되는지 확인합니다.

```sql
SELECT count() FROM orders WHERE order_id < 100;
```

```
┌─count()─┐
│       0 │
└─────────┘
```

0건입니다. 쿼리에서는 이미 제외되었습니다. 하지만 `system.parts`를 보면 Part가 새로 생성되었지만 크기가 거의 변하지 않았습니다. `_row_exists` 컬럼만 새로 쓰이고 나머지 컬럼 파일은 hardlink로 연결되었기 때문입니다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders' AND active
ORDER BY name;
```

삭제된 행의 데이터는 물리적으로 남아 있고, `_row_exists = 0`으로 표시만 된 상태입니다. 실제 데이터 제거는 다음 백그라운드 머지 때 일어납니다. `OPTIMIZE TABLE`로 강제 머지를 실행하면 물리적으로도 제거됩니다.

```sql
OPTIMIZE TABLE orders FINAL;

SELECT
    name,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders' AND active;
```

```
┌─name──────┬─────rows─┬─size───────┐
│ all_1_3_1 │  9999900 │ 110.94 MiB │
└───────────┴──────────┴────────────┘
```

`rows`가 9,999,900으로 100만큼 줄었고, Part 크기도 소폭 감소했습니다. 삭제된 행의 데이터가 머지를 통해 물리적으로 정리된 것입니다.

핵심 차이를 정리하면: 앞서 실행한 ALTER TABLE UPDATE는 Part 재작성까지 수 초가 걸렸지만, DELETE FROM은 즉시 반환되었습니다. ALTER TABLE DELETE는 뮤테이션이 완료되면 물리적으로 깨끗한 Part를 남기고, Lightweight DELETE는 다음 머지까지 마스킹 상태로 남깁니다. 용도에 맞게 선택해야 합니다.

## 실전에서는

### 머지 모니터링

`system.merges`에서 현재 진행 중인 머지를 추적합니다. `progress`가 장시간 변하지 않는다면 디스크 I/O 병목이나 리소스 경합을 의심해야 합니다.

Part 수는 테이블 건강도의 핵심 지표입니다. active Part가 지속적으로 증가한다면, INSERT 빈도에 비해 머지가 따라가지 못하는 상황입니다.

```sql
SELECT
    table,
    count() AS active_parts
FROM system.parts
WHERE active
GROUP BY table
HAVING active_parts > 50
ORDER BY active_parts DESC;
```

Part가 수백 개 이상 쌓이면 결국 "Too many parts" 에러가 발생합니다. 이 문제의 근본 원인과 해결 패턴은 [#7(INSERT 패턴)](/clickhouse/insert-patterns/)에서 다룹니다.

### 뮤테이션 모니터링

실행 중이거나 실패한 뮤테이션을 확인합니다.

```sql
SELECT
    table,
    mutation_id,
    command,
    is_done,
    parts_to_do,
    latest_fail_reason
FROM system.mutations
WHERE NOT is_done
ORDER BY create_time;
```

`latest_fail_reason`이 비어 있지 않다면 뮤테이션이 실패한 것입니다. 멈춘 뮤테이션은 `KILL MUTATION`으로 중단할 수 있습니다.

```sql
KILL MUTATION WHERE mutation_id = 'mutation_4.txt';
```

뮤테이션은 제출된 순서대로 실행됩니다. 앞선 뮤테이션이 멈추면 뒤의 뮤테이션도 전부 대기합니다. 운영 환경에서 뮤테이션을 실행했다면 반드시 `system.mutations`를 확인해야 합니다.

### OPTIMIZE TABLE의 함정

`OPTIMIZE TABLE orders FINAL`은 모든 Part를 하나로 강제 머지합니다. 실험에서는 유용하지만, **프로덕션에서 정기적으로 실행하면 안 됩니다**. 수백 GB 테이블에서 FINAL을 실행하면 전체 데이터를 재작성하는 것과 같습니다. 디스크 I/O와 CPU를 장시간 점유하고, 머지가 진행되는 동안 디스크 사용량이 2배로 뛰어오릅니다.

백그라운드 머지 스케줄러를 신뢰하세요. ClickHouse는 자체적으로 최적의 시점에 최적의 Part를 선택해서 머지합니다. `OPTIMIZE TABLE`(FINAL 없이)을 실행하면 스케줄러에 "지금 머지를 시도해봐"라는 힌트를 줄 수 있지만, 이마저도 일상적으로 쓸 필요는 없습니다.

### DELETE 전략 선택 가이드

| 상황 | 권장 방법 | 비용 |
|------|----------|------|
| 오래된 파티션 통째로 삭제 | `ALTER TABLE DROP PARTITION` | 즉각, 거의 무비용 |
| 특정 조건의 행 삭제 | `DELETE FROM` (Lightweight) | 가벼움 |
| 조건부 데이터 수정 | `ALTER TABLE UPDATE` | 무거움 (Part 재작성) |
| 조건부 대량 삭제 | `ALTER TABLE DELETE` | 무거움 (Part 재작성) |
| 주기적 중복 제거 | ReplacingMergeTree | 머지 시 자동 처리 |

가장 빠른 것은 파티션 단위 DROP이고, 가장 무거운 것은 뮤테이션입니다. 삭제/수정 요구사항이 있다면, 먼저 파티셔닝이나 테이블 엔진으로 해결할 수 있는지 검토하는 것이 올바른 순서입니다.

## 마치며

불변 Part는 MergeTree의 쓰기 성능을 보장하는 핵심 설계이고, 그로 인한 읽기 비용은 백그라운드 머지가 상환합니다. 뮤테이션은 불변성 위에서 변경을 구현하는 비상 도구이지, RDB의 UPDATE처럼 일상적으로 쓸 연산이 아닙니다.

기본 MergeTree의 머지는 Part를 합칠 뿐, 중복을 제거하거나 값을 집계하지 않습니다. 다음 글에서는 머지 과정에 추가 로직을 끼워 넣는 MergeTree 변종들 (ReplacingMergeTree, SummingMergeTree, AggregatingMergeTree, CollapsingMergeTree) 이 각각 어떤 문제를 해결하는지 다룹니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree Table Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse 공식 문서: ALTER TABLE UPDATE](https://clickhouse.com/docs/sql-reference/statements/alter/update)
- [ClickHouse 공식 문서: ALTER TABLE DELETE](https://clickhouse.com/docs/sql-reference/statements/alter/delete)
- [ClickHouse 공식 문서: DELETE Statement (Lightweight Delete)](https://clickhouse.com/docs/sql-reference/statements/delete)
