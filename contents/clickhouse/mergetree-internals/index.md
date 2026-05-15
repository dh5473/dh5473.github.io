---
date: '2026-05-14'
title: 'MergeTree 해부: Part, Granule, 희소 인덱스'
category: 'Database'
series: 'clickhouse'
seriesOrder: 2
tags: ['ClickHouse', 'MergeTree', 'Sparse Index', 'Granule', 'Mark']
summary: 'MergeTree Part 디렉토리 안의 파일들을 하나하나 열어보고, Granule-Mark-희소 인덱스가 연결되는 구조를 따라가며, 쿼리가 수십억 행에서 필요한 Granule만 골라 읽는 과정을 Docker 실험으로 확인합니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/clickhouse/why-clickhouse/)에서 1,000만 행을 0.035초에 집계했습니다. 그런데 한 가지 의문이 남습니다. `WHERE category = '전자제품'`을 걸면 ClickHouse는 8개 카테고리 중 해당 데이터만 읽습니다. 전체를 스캔하지 않습니다. 어떻게 아는 걸까요?

PostgreSQL이라면 B-tree 인덱스가 정확한 행 위치를 가리킵니다. 1억 행이면 인덱스 엔트리도 1억 개입니다. ClickHouse는 다릅니다. 수십 KB짜리 파일 하나로 같은 일을 합니다. 그 파일이 `primary.idx`이고, 이것이 MergeTree 스토리지 엔진의 핵심입니다.

<br>

이 글에서는 MergeTree의 뚜껑을 엽니다. Part 디렉토리를 열어서 파일 하나하나의 역할을 확인하고, Granule-Mark-희소 인덱스가 어떻게 연결되는지 따라간 뒤, 쿼리가 도착했을 때 ClickHouse가 어떤 순서로 필요한 데이터만 골라 읽는지를 실험으로 확인합니다.

## Part — MergeTree의 저장 단위

### Part는 어떻게 만들어지는가

지난 글에서 다뤘듯이, INSERT가 실행되면 ClickHouse는 데이터를 `ORDER BY` 순서로 정렬한 뒤 **불변(immutable) Part**로 디스크에 씁니다. 한번 쓰인 Part는 절대 수정되지 않습니다. 새로운 INSERT가 오면 또 다른 Part가 생기고, 시간이 지나면 백그라운드 머지가 작은 Part들을 큰 Part로 합칩니다.

Part의 이름을 보면 그 이력을 알 수 있습니다. 지난 글의 실험에서 만든 `all_1_1_0`을 분해해봅시다.

```
all_1_1_0
 │  │ │ │
 │  │ │ └── level: 머지 횟수 (0 = 원본, 머지될 때마다 증가)
 │  │ └──── max_block: INSERT 카운터 상한
 │  └────── min_block: INSERT 카운터 하한
 └───────── partition_id: 파티션 값 (PARTITION BY 미지정 시 "all")
```

`all`은 파티션 키를 지정하지 않았기 때문에 모든 데이터가 하나의 파티션에 들어갔다는 뜻이고, `1_1`은 첫 번째 INSERT 블록이며, `0`은 아직 머지되지 않은 원본 Part라는 뜻입니다. INSERT를 세 번 나눠서 실행했다면 `all_1_1_0`, `all_2_2_0`, `all_3_3_0` 세 개의 Part가 생기고, 머지 후에는 `all_1_3_1`처럼 블록 범위가 합쳐지면서 level이 1로 올라갑니다. 머지의 상세한 동작은 [다음 글(#3)](/clickhouse/merge-and-mutation/)에서 다룹니다.

### Part 디렉토리 안을 열어보면

Part는 디스크에 하나의 디렉토리로 존재합니다. 그 안에 어떤 파일이 있는지가 MergeTree를 이해하는 출발점입니다.

| 파일 | 역할 |
|------|------|
| `primary.idx` | 희소 인덱스 — granule 경계의 PRIMARY KEY 값 |
| `{column}.bin` | 컬럼 데이터 (압축 블록 단위로 저장) |
| `{column}.mrk2` | Mark 파일 — granule 번호를 물리적 바이트 오프셋으로 변환 |
| `count.txt` | 이 Part의 총 행 수 |
| `columns.txt` | 컬럼 이름과 타입 목록 |
| `checksums.txt` | 모든 파일의 무결성 체크섬 |
| `default_compression_codec.txt` | 사용 중인 압축 코덱 (LZ4, ZSTD 등) |
| `partition.dat` / `minmax_*.idx` | 파티션 키 값과 파티션 컬럼의 min/max |

핵심 파일은 세 가지입니다. **`primary.idx`**(희소 인덱스), **`.bin`**(컬럼 데이터), **`.mrk2`**(Mark). 이 세 파일이 어떻게 연결되는지가 이 글의 주제입니다. 나머지는 메타데이터이거나 무결성 검증용입니다.

`orders` 테이블은 5개 컬럼이므로, Part 디렉토리 안에는 `order_id.bin`, `order_id.mrk2`, `user_id.bin`, `user_id.mrk2`, `price.bin`, `price.mrk2`, `category.bin`, `category.mrk2`, `created_at.bin`, `created_at.mrk2` — 컬럼당 `.bin` + `.mrk2` 한 쌍씩, 총 10개의 데이터 파일이 생깁니다. 여기에 `primary.idx`와 메타데이터 파일들이 더해지는 구조입니다.

### Wide 포맷 vs Compact 포맷

위에서 설명한 "컬럼마다 `.bin` + `.mrk2` 한 쌍"이 **Wide 포맷**입니다. 대부분의 프로덕션 Part는 Wide 포맷이고, 이 글의 모든 설명도 Wide 기준입니다.

작은 Part(기본 10MB 미만)에서는 **Compact 포맷**이 사용됩니다. 모든 컬럼 데이터가 하나의 `.bin` 파일에 합쳐지고, Mark 파일은 `.mrk3` 확장자를 씁니다. 수십 개의 작은 파일 대신 하나의 파일로 합쳐서 파일 시스템 오버헤드를 줄이려는 설계입니다. 빈번한 INSERT로 작은 Part가 많이 생길 때 의미가 있지만, 결국 백그라운드 머지로 큰 Part가 되면 Wide로 전환됩니다.

`system.parts`의 `part_type` 컬럼에서 현재 포맷을 확인할 수 있습니다. 기준값은 `min_bytes_for_wide_part`(기본 10MB)입니다.

## Granule — 데이터를 읽는 최소 단위

### Granule이란

Granule은 ClickHouse가 쿼리 시 데이터를 읽는 **최소 논리적 단위**입니다. 기본값은 **8,192행**(설정: `index_granularity`).

"논리적"이라는 점이 중요합니다. Granule은 디스크에 별도 파일로 존재하지 않습니다. 컬럼 데이터는 `.bin` 파일 안에 연속으로 저장되어 있고, "여기서부터 8,192행이 하나의 granule이다"라는 경계만 Mark 파일에 기록됩니다. 쿼리가 특정 granule을 읽어야 할 때, ClickHouse는 그 granule 전체(8,192행)를 읽습니다. 절반만 필요해도 전체를 읽어야 합니다.

1,000만 행 테이블이라면 granule 수는 10,000,000 / 8,192 = **1,221개**입니다(마지막 granule은 8,192행 미만).

### 왜 8,192행인가

Granule 크기는 인덱스 크기와 읽기 정밀도 사이의 트레이드오프입니다.

- **Granule이 작으면**: 인덱스 엔트리가 많아져서 메모리를 더 쓰지만, 불필요한 행을 덜 읽는다
- **Granule이 크면**: 인덱스가 작아서 메모리 효율이 좋지만, 필요 없는 행까지 더 많이 읽는다

8,192행은 이 트레이드오프의 균형점입니다. 10억 행 테이블이라도 인덱스 엔트리가 약 122,000개밖에 되지 않아 수 MB 수준으로 메모리에 전부 올립니다. PostgreSQL의 B-tree 인덱스가 10억 행이면 10억 개의 엔트리(수 GB)를 유지하는 것과 비교하면 극적인 차이입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 적응형 Granularity</strong><br>
  <code>index_granularity_bytes</code>(기본 10MB)가 활성화되어 있으면, 행 수뿐 아니라 데이터 크기도 granule 경계의 기준이 됩니다. 가변 길이 컬럼(String, Array 등)이 많아서 행마다 크기 차이가 클 때, 고정 행 수 대신 바이트 기준으로 granule을 나누면 각 granule의 메모리 사용량이 균일해집니다. 이 경우 Mark 파일에 granule당 실제 행 수(<code>rows_count</code>)가 추가로 기록됩니다.
</div>

### Granule과 컬럼 파일의 관계

Granule 경계는 **모든 컬럼에 동일하게 적용**됩니다. Granule 0은 모든 컬럼 파일에서 행 0~8,191을 의미합니다.

```
Granule 0 (행 0 ~ 8,191):
  order_id.bin:   [행 0의 값, 행 1의 값, ..., 행 8191의 값]
  price.bin:      [행 0의 값, 행 1의 값, ..., 행 8191의 값]
  category.bin:   [행 0의 값, 행 1의 값, ..., 행 8191의 값]
  created_at.bin: [행 0의 값, 행 1의 값, ..., 행 8191의 값]

Granule 1 (행 8,192 ~ 16,383):
  order_id.bin:   [행 8192의 값, ...]
  price.bin:      [행 8192의 값, ...]
  category.bin:   [행 8192의 값, ...]
  created_at.bin: [행 8192의 값, ...]
```

이 정렬 덕분에 ClickHouse는 `SELECT avg(price) FROM orders WHERE category = '전자제품'`을 실행할 때 `price.bin`과 `category.bin`만 열면 됩니다. `order_id.bin`, `user_id.bin`, `created_at.bin`은 열지도 않습니다. 그러면서도 행 정합성이 보장됩니다 — granule 0의 price 값과 category 값은 정확히 같은 행들의 데이터입니다.

## 압축 블록과 Column 파일

`.bin` 파일은 그 안에서 다시 **압축 블록(compressed block)** 단위로 나뉩니다. 각 블록은 비압축 기준 64KB~1MB 크기이며, LZ4나 ZSTD로 압축된 상태로 저장됩니다.

하나의 압축 블록 안에 여러 granule이 들어갈 수 있습니다. UInt32 컬럼의 경우 한 granule이 8,192 × 4바이트 = 약 32KB이므로, 두 granule 정도가 하나의 64KB 블록에 패킹됩니다.

```
price.bin 내부:
┌──────────────────────────────┐  ┌──────────────────────────────┐
│     Compressed Block 0       │  │     Compressed Block 1       │
│  ┌─────────┐  ┌─────────┐   │  │  ┌─────────┐  ┌─────────┐   │
│  │Granule 0│  │Granule 1│   │  │  │Granule 2│  │Granule 3│   │
│  └─────────┘  └─────────┘   │  │  └─────────┘  └─────────┘   │
└──────────────────────────────┘  └──────────────────────────────┘
```

왜 granule마다 따로 압축하지 않을까요? 압축 알고리즘은 데이터가 클수록 패턴을 더 잘 찾습니다. 32KB 단위로 쪼개면 압축률이 크게 떨어집니다. 여러 granule을 묶어서 압축하면 효율이 올라가는 대신, 특정 granule 하나만 읽으려 해도 블록 전체를 해제해야 합니다. 이것이 **read amplification**입니다. 하지만 OLAP 쿼리는 대부분 연속된 granule을 대량으로 읽기 때문에, 이 트레이드오프는 거의 문제가 되지 않습니다.

각 압축 블록에는 헤더(압축 전 크기, 압축 후 크기, 체크섬)가 붙어서 ClickHouse가 블록 단위로 점프하며 해제할 수 있게 합니다.

## Mark 파일 — Granule과 물리적 위치를 잇는 다리

### Mark의 구조

Granule은 논리적 개념이고, 데이터는 압축 블록 안에 들어 있습니다. "Granule N을 읽고 싶다"를 "`.bin` 파일의 몇 번째 바이트부터 읽어라"로 변환하는 것이 **Mark 파일(`.mrk2`)**의 역할입니다.

`.mrk2` 파일은 비압축 flat 배열입니다. Granule 하나당 엔트리 하나. 각 엔트리에는 세 개의 필드가 기록됩니다.

1. **`offset_in_compressed_file`** — `.bin` 파일에서 해당 압축 블록이 시작하는 바이트 위치
2. **`offset_in_decompressed_block`** — 압축을 해제한 블록 안에서 해당 granule이 시작하는 바이트 위치
3. **`rows_count`** — 이 granule에 포함된 행 수 (적응형 granularity를 위해 기록)

```
price.mrk2 (granule → 물리적 위치 매핑):
┌──────────┬───────────────────────┬───────────────────────────┐
│ Granule# │ compressed file 오프셋 │ decompressed block 오프셋  │
├──────────┼───────────────────────┼───────────────────────────┤
│    0     │           0           │             0             │
│    1     │           0           │          32768            │
│    2     │        24576          │             0             │
│    3     │        24576          │          32768            │
│   ...    │          ...          │            ...            │
└──────────┴───────────────────────┴───────────────────────────┘
```

Granule 0과 1은 같은 압축 블록(오프셋 0)에 들어 있습니다. Granule 0은 그 블록의 처음부터, Granule 1은 32,768바이트(= 8,192행 × 4바이트) 지점부터 시작합니다. Granule 2는 새로운 압축 블록(오프셋 24,576)의 처음부터 시작합니다.

### 왜 Mark 파일이 필요한가

Mark가 없다면 granule N의 데이터를 읽으려면 `.bin` 파일의 처음부터 모든 압축 블록을 순서대로 해제하면서 N번째 granule 위치를 찾아야 합니다. Mark가 있으면 **랜덤 액세스**가 가능합니다 — mark N의 오프셋을 읽고, `.bin` 파일의 정확한 위치로 점프해서 해당 블록만 해제하면 됩니다.

각 컬럼은 별도의 `.mrk2` 파일을 갖습니다. 같은 granule이라도 컬럼마다 데이터 타입과 크기가 다르기 때문에, 물리적 위치(바이트 오프셋)가 다릅니다. `price`(UInt32)와 `category`(LowCardinality(String))의 granule 0이 각각의 `.bin` 파일에서 다른 위치에 있는 것은 당연합니다.

### 전체 연결 — primary.idx → Mark → Column 파일

세 파일이 어떻게 연결되는지 한눈에 봅시다.

```
primary.idx                price.mrk2              price.bin
(희소 인덱스)               (Mark 파일)              (컬럼 데이터)

┌──────────────┐          ┌────────────────┐       ┌─────────────────────┐
│ 0: [가구, ...]│─── 0 ──▶│ off=0, dec=0   │──────▶│  ┌───────────────┐  │
│ 1: [가구, ...]│─── 1 ──▶│ off=0, dec=32K │──────▶│  │ Compressed    │  │
│ 2: [도서, ...]│─── 2 ──▶│ off=24K, dec=0 │──┐   │  │   Block 0     │  │
│ 3: [도서, ...]│─── 3 ──▶│ off=24K, dec=32K│─┐│   │  └───────────────┘  │
│ ...          │          │ ...            │ ││   ├─────────────────────┤
│ N: [전자, ...]│─── N ──▶│ off=XK, dec=0  │─┼┼──▶│  ┌───────────────┐  │
│ ...          │          │ ...            │ ││   │  │ Compressed    │  │
└──────────────┘          └────────────────┘ └┼──▶│  │   Block 1     │  │
                                              └──▶│  └───────────────┘  │
                                                  │  ...                │
                                                  └─────────────────────┘
```

1. `primary.idx`에서 "어느 granule을 읽어야 하는가"를 결정하고
2. `.mrk2`에서 "그 granule이 `.bin` 파일 어디에 있는가"를 찾고
3. `.bin`에서 해당 압축 블록을 읽어 해제합니다

이 3단계가 MergeTree의 읽기 경로 전체입니다.

## 희소 인덱스

### primary.idx의 구조

`primary.idx`는 비압축 flat 배열입니다. Granule 하나당 엔트리 하나, 각 엔트리에는 **해당 granule 첫 번째 행의 PRIMARY KEY 컬럼 값**이 기록됩니다.

`orders` 테이블의 `ORDER BY (category, created_at)`의 경우, primary.idx의 각 엔트리는 `[category값, created_at값]` 쌍입니다. 데이터가 이 순서로 정렬되어 있으므로, 엔트리들도 사전순으로 정렬된 상태입니다.

```
primary.idx (1,221개 엔트리):
┌──────────┬────────────────┬─────────────────────┐
│ Granule# │   category     │     created_at      │
├──────────┼────────────────┼─────────────────────┤
│    0     │ 가구           │ 2025-01-01 00:00:12 │
│    1     │ 가구           │ 2025-01-03 14:22:07 │
│    ...   │ ...            │ ...                 │
│   152    │ 도서           │ 2025-01-01 00:01:33 │
│   ...    │ ...            │ ...                 │
│   916    │ 전자제품       │ 2025-01-01 00:00:55 │
│   917    │ 전자제품       │ 2025-01-03 08:47:22 │
│   ...    │ ...            │ ...                 │
│  1068    │ 화장품         │ 2025-01-01 00:02:18 │
│   ...    │ ...            │ ...                 │
│  1220    │ 화장품         │ 2025-12-29 15:33:41 │
└──────────┴────────────────┴─────────────────────┘
```

이 인덱스는 메모리에 전부 상주합니다. 1,221개 엔트리에 불과하기 때문입니다. 10억 행이라도 약 122,000개 엔트리이니 수 MB면 충분합니다.

### B-tree와의 차이

| 특성 | B-tree (PostgreSQL) | 희소 인덱스 (ClickHouse) |
|------|---------------------|------------------------|
| 1억 행 기준 엔트리 수 | ~1억 개 | ~12,000개 |
| 메모리 사용량 | 수 GB | 수십~수백 KB |
| 포인트 쿼리 정밀도 | 정확한 행 | 8,192행 granule |
| 범위 쿼리 효율 | 좋음 | 매우 좋음 |
| 갱신 비용 | 높음 (리밸런싱) | 없음 (불변 Part) |
| 설계 목표 | OLTP (특정 행 조회) | OLAP (대량 집계) |

정확도를 8,192행 단위로 낮추는 대신 인덱스 크기를 수만 배 줄입니다. `WHERE id = 42`로 정확히 한 행을 찾아야 하는 OLTP에서는 치명적인 단점이지만, 수백만 행을 집계하는 OLAP에서는 완벽한 트레이드오프입니다.

### Granule Pruning — 쿼리가 인덱스를 사용하는 과정

`WHERE category = '전자제품'`이 들어오면 ClickHouse는 다음 순서로 동작합니다.

1. WHERE 조건에서 PRIMARY KEY 컬럼(`category`)에 대한 조건을 추출한다
2. `primary.idx`를 이진 탐색하여 `category = '전자제품'`에 해당하는 granule 범위를 찾는다
3. 해당 범위 밖의 granule은 전부 **skip**(pruning)한다
4. 선택된 granule만 Mark → Column 파일 경로로 읽는다

데이터가 `ORDER BY (category, created_at)` 순으로 정렬되어 있으므로, 같은 category의 행들은 연속된 granule에 모여 있습니다.

```
Granule:  [0: 가구] ... [152: 도서] ... [763: 의류] ... [916: 전자] [917: 전자] ... [1068: 화장품] ... [1220: 화장품]
                                                        ^^^^^^^^^^  ^^^^^^^^^^
                                                         SELECTED    SELECTED
          ◀──────────── SKIP ──────────────────────────▶             ◀────── SKIP ──────▶
```

1,221개 granule 중 `전자제품`에 해당하는 약 153개만 읽고 나머지 1,068개는 건드리지 않습니다. 디스크 I/O가 약 1/8로 줄어드는 것입니다.

반면 `WHERE user_id = 42`를 쿼리하면 어떨까요? `user_id`는 `ORDER BY`에 포함되어 있지 않으므로 `primary.idx`에 기록되어 있지 않습니다. Pruning이 불가능하고 모든 granule을 읽어야 합니다. 어떤 컬럼을 `ORDER BY` 앞에 놓느냐에 따라 pruning 효과가 극적으로 달라집니다. 이 설계 전략은 [#5(PRIMARY KEY 설계)](/clickhouse/primary-key-design/)에서 집중적으로 다룹니다.

## 쿼리 실행 흐름 — 처음부터 끝까지

모든 구성 요소를 연결해서, `SELECT avg(price) FROM orders WHERE category = '전자제품'`이 실행되는 전체 경로를 따라갑시다.

```
SELECT avg(price) FROM orders WHERE category = '전자제품'
     │
     ▼
① primary.idx 이진 탐색
     │  category = '전자제품'인 granule 범위 결정
     │  → granule 916 ~ 1068 중 해당 범위 선택 (예: mark 916~1068)
     ▼
② price.mrk2에서 선택된 mark 조회
     │  → 각 mark의 [compressed offset, decompressed offset] 획득
     ▼
③ price.bin에서 해당 압축 블록만 읽기 + 해제
     │  → 선택된 granule들의 price 값 추출
     ▼
④ WHERE 필터 적용 + avg() 집계
     │  (granule 경계에서 다른 category가 섞일 수 있으므로 정확한 필터링 수행)
     ▼
⑤ 결과 반환
```

핵심은 **읽지 않는 것**에 있습니다. `order_id.bin`, `user_id.bin`, `created_at.bin`은 열지도 않습니다. `category.bin`도 WHERE 필터가 granule 내부에서 필요할 때만 읽습니다. 전체 1,221개 granule 중 약 150개만, 전체 5개 컬럼 중 1~2개만 읽으니, 원본 데이터의 극히 일부만 디스크에서 가져오는 셈입니다.

④ 단계에서 WHERE 필터를 다시 적용하는 이유가 있습니다. 희소 인덱스는 granule 단위로 선택하기 때문에, granule 경계에 다른 category의 행이 포함될 수 있습니다. 예를 들어 pruning으로 선택된 첫 번째 granule의 앞쪽 행에는 이전 카테고리(`의류`)가 남아있을 수 있습니다. 이 granule의 첫 행이 `의류`이더라도 `전자제품`이 포함될 가능성이 있으면 전체 granule이 선택됩니다. 그래서 granule을 읽은 뒤 행 단위 필터링이 한 번 더 필요합니다.

## 실험 — Docker로 직접 확인하기

[지난 글](/clickhouse/why-clickhouse/)의 Docker 환경(`ch-test` 컨테이너)과 `orders` 테이블을 그대로 사용합니다. 컨테이너가 없다면 지난 글의 "환경 준비" 섹션을 먼저 실행하세요.

### Part 디렉토리 탐색

Part의 물리적 위치와 메타데이터를 확인합니다.

```sql
SELECT
    name,
    part_type,
    rows,
    marks,
    formatReadableSize(bytes_on_disk) AS size,
    path
FROM system.parts
WHERE table = 'orders' AND active
FORMAT Vertical;
```

```
Row 1:
──────
name:      all_1_1_0
part_type: Wide
rows:      10000000
marks:     1221
size:      57.64 MiB
path:      /var/lib/clickhouse/store/xxx/xxxyyyyy/all_1_1_0/
```

`part_type`이 `Wide`이고, `marks`가 1,221개입니다(10,000,000 / 8,192 = 1,220.7, 올림하면 1,221). 실제 Part 디렉토리를 열어봅시다.

```bash
$ docker exec ch-test ls /var/lib/clickhouse/data/default/orders/all_1_1_0/
```

```
category.bin                  created_at.mrk2
category.mrk2                 default_compression_codec.txt
checksums.txt                 metadata_version.txt
columns.txt                   order_id.bin
count.txt                     order_id.mrk2
created_at.bin                price.bin
                              price.mrk2
                              primary.idx
                              serialization.json
                              user_id.bin
                              user_id.mrk2
```

앞서 설명한 파일들이 그대로 있습니다. 컬럼 5개 × (`.bin` + `.mrk2`) = 10개 데이터 파일, `primary.idx`, 그리고 메타데이터 파일들. `count.txt`를 확인해보면 `10000000`이 적혀 있습니다.

### Granule 수 검증

Granule 수와 행 수의 관계를 검증합니다.

```sql
SELECT
    name,
    rows,
    marks,
    round(rows / marks) AS approx_rows_per_granule
FROM system.parts
WHERE table = 'orders' AND active;
```

```
┌─name──────┬─────rows─┬─marks─┬─approx_rows_per_granule─┐
│ all_1_1_0 │ 10000000 │  1221 │                    8190 │
└───────────┴──────────┴───────┴─────────────────────────┘
```

1,221개의 mark가 1,221개의 granule에 대응합니다. granule당 약 8,190행 — 마지막 granule이 8,192행에 못 미치기 때문에 평균이 살짝 낮게 나옵니다. 정확히 예상대로입니다.

### Granule Pruning 실험

pruning의 효과를 직접 확인합니다. `EXPLAIN indexes = 1`을 쓰면 쿼리가 인덱스를 얼마나 활용했는지 볼 수 있습니다.

먼저 `category`로 필터링하는 경우입니다. `category`는 `ORDER BY`의 첫 번째 컬럼이므로 pruning이 강력하게 작동해야 합니다.

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders WHERE category = '전자제품';
```

```
┌─explain───────────────────────────────────────────────────────┐
│ Expression ((Project names + Projection))                     │
│   AggregatingTransform                                        │
│     Expression (Before GROUP BY)                              │
│       Filter (WHERE)                                          │
│         ReadFromMergeTree (default.orders)                    │
│         Indexes:                                              │
│           PrimaryKey                                          │
│             Keys: category                                    │
│             Condition: (category in ['전자제품', '전자제품'])    │
│             Parts: 1/1                                        │
│             Granules: 153/1221                                │
└───────────────────────────────────────────────────────────────┘
```

**`Granules: 153/1221`** — 1,221개 중 153개만 선택됐습니다. 전체의 약 12.5%, 즉 8개 카테고리 중 1개에 해당하는 비율과 정확히 일치합니다.

이번에는 `user_id`로 필터링합니다. `user_id`는 `ORDER BY`에 포함되지 않습니다.

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders WHERE user_id = 42;
```

```
┌─explain───────────────────────────────────────────────────────┐
│ Expression ((Project names + Projection))                     │
│   AggregatingTransform                                        │
│     Expression (Before GROUP BY)                              │
│       Filter (WHERE)                                          │
│         ReadFromMergeTree (default.orders)                    │
│         Indexes:                                              │
│           PrimaryKey                                          │
│             Condition: true                                   │
│             Parts: 1/1                                        │
│             Granules: 1221/1221                               │
└───────────────────────────────────────────────────────────────┘
```

**`Granules: 1221/1221`** — pruning이 전혀 작동하지 않아 모든 granule을 읽습니다. `Condition: true`가 이를 명확히 보여줍니다. 인덱스에서 `user_id`를 필터링할 방법이 없기 때문입니다.

같은 테이블, 같은 데이터인데 WHERE 조건의 컬럼이 ORDER BY에 있느냐 없느냐에 따라 읽는 데이터 양이 **8배** 차이납니다.

### Mark 파일 크기 확인

컬럼별 Mark 파일 크기를 확인합니다.

```sql
SELECT
    column,
    type,
    formatReadableSize(data_compressed_bytes) AS compressed,
    formatReadableSize(data_uncompressed_bytes) AS uncompressed,
    formatReadableSize(marks_bytes) AS marks_size
FROM system.parts_columns
WHERE table = 'orders' AND active
ORDER BY data_uncompressed_bytes DESC;
```

```
┌─column─────┬─type──────────────────┬─compressed─┬─uncompressed─┬─marks_size─┐
│ order_id   │ UInt64                │ 12.51 MiB  │ 76.29 MiB    │ 28.61 KiB  │
│ created_at │ DateTime              │ 5.73 MiB   │ 38.15 MiB    │ 28.61 KiB  │
│ user_id    │ UInt32                │ 19.14 MiB  │ 38.15 MiB    │ 28.61 KiB  │
│ price      │ UInt32                │ 19.07 MiB  │ 38.15 MiB    │ 28.61 KiB  │
│ category   │ LowCardinality(String)│ 1.53 MiB   │ 9.54 MiB     │ 28.61 KiB  │
└────────────┴───────────────────────┴────────────┴──────────────┴────────────┘
```

`marks_size`가 모든 컬럼에서 동일하게 **28.61 KiB**입니다. 1,221개 mark × 24바이트(오프셋 2개 + rows_count, 각 8바이트) = 29,304바이트 ≈ 28.61 KiB. 컬럼의 데이터 크기나 타입과 무관하게, granule 수가 같으면 Mark 파일 크기도 같습니다.

### ORDER BY가 Pruning에 미치는 영향 (맛보기)

같은 데이터를 다른 ORDER BY로 저장하면 pruning 결과가 어떻게 달라지는지 확인합니다.

```sql
CREATE TABLE orders_by_user AS orders
ENGINE = MergeTree()
ORDER BY (user_id, created_at);

INSERT INTO orders_by_user SELECT * FROM orders;
```

이제 `orders_by_user`에서 같은 쿼리를 실행합니다.

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders_by_user WHERE category = '전자제품';
```

```
┌─explain───────────────────────────────────────────────────────┐
│         ReadFromMergeTree (default.orders_by_user)            │
│         Indexes:                                              │
│           PrimaryKey                                          │
│             Condition: true                                   │
│             Parts: 1/1                                        │
│             Granules: 1221/1221                               │
└───────────────────────────────────────────────────────────────┘
```

`category`는 이 테이블의 ORDER BY에 없으니 **전체 스캔**입니다. 반대로 `user_id`로 필터링하면:

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders_by_user WHERE user_id = 42;
```

```
┌─explain───────────────────────────────────────────────────────┐
│         ReadFromMergeTree (default.orders_by_user)            │
│         Indexes:                                              │
│           PrimaryKey                                          │
│             Keys: user_id                                     │
│             Condition: (user_id in [42, 42])                  │
│             Parts: 1/1                                        │
│             Granules: 2/1221                                  │
└───────────────────────────────────────────────────────────────┘
```

**`Granules: 2/1221`** — `user_id`가 ORDER BY 첫 번째 컬럼이므로 극도로 정밀한 pruning이 작동합니다. 1,221개 중 2개만 읽습니다.

같은 데이터, 같은 쿼리인데 ORDER BY만 바꿨을 뿐입니다. ORDER BY 선택이 곧 인덱스 설계이고, 이것이 쿼리 성능을 결정합니다. 이 주제는 [#5(PRIMARY KEY 설계)](/clickhouse/primary-key-design/)의 핵심입니다.

## 실전에서는

MergeTree 내부 구조를 알면 운영에서 바로 활용할 수 있는 진단 포인트가 생깁니다.

**Part 수 모니터링** — `system.parts`에서 active Part 수를 추적합니다. Part가 수백 개 이상 쌓이면 "Too many parts" 에러의 전조입니다. INSERT 빈도가 높은 테이블에서 특히 주의가 필요합니다.

```sql
SELECT table, count() AS active_parts
FROM system.parts
WHERE active
GROUP BY table
ORDER BY active_parts DESC;
```

**컬럼별 압축률 확인** — `system.parts_columns`로 어떤 컬럼이 압축이 잘 되고 있는지, 어떤 컬럼이 비효율적인지 파악합니다. 압축률이 낮은 컬럼은 코덱을 변경하거나 ORDER BY 순서를 조정해서 개선할 수 있습니다.

**Granule Pruning이 작동하지 않는 패턴** — 쿼리가 예상보다 느리다면 `EXPLAIN indexes = 1`로 pruning 상태를 확인합니다. 다음 상황에서 pruning이 작동하지 않습니다.

- WHERE 조건이 ORDER BY 컬럼을 사용하지 않을 때
- ORDER BY가 `(a, b)`인데 WHERE에 `b`만 있을 때 (첫 번째 키 컬럼 `a`를 건너뛰면 이진 탐색 불가)
- 카디널리티가 극도로 높은 컬럼(예: UUID)이 ORDER BY 앞에 올 때 (granule마다 값이 고유해서 pruning 의미 없음)

이 패턴들을 어떻게 회피하는지는 [#5(PRIMARY KEY 설계)](/clickhouse/primary-key-design/)에서 구체적인 설계 전략으로 다룹니다.

## 마치며

이제 Part 디렉토리를 열었을 때 각 파일의 역할을 설명할 수 있고, 쿼리가 도착했을 때 `primary.idx` → `.mrk2` → `.bin`으로 이어지는 읽기 경로를 따라갈 수 있습니다. 희소 인덱스가 어떻게 수십억 행에서 필요한 granule만 골라 읽는지, 그리고 ORDER BY가 왜 인덱스 설계와 같은 의미인지도 실험으로 확인했습니다.

그런데 Part가 INSERT마다 계속 쌓이기만 하면 어떻게 될까요? 그리고 불변이라는 Part에서 UPDATE나 DELETE는 어떻게 처리할까요? 다음 글에서는 백그라운드 머지가 Part들을 합치는 과정과, 뮤테이션(Mutation)이 불변 Part 위에서 변경을 구현하는 메커니즘을 따라갑니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree Table Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse 공식 문서: A Practical Introduction to Primary Indexes](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)
- [Altinity Knowledge Base: ClickHouse Data Storage Format](https://kb.altinity.com/altinity-kb-schema-design/data-storage-format/)
