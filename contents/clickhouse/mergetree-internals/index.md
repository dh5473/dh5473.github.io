---
date: '2026-05-14'
title: 'MergeTree 해부: Part, Granule, 희소 인덱스'
category: 'Database'
series: 'clickhouse'
seriesOrder: 2
tags: ['ClickHouse', 'MergeTree', 'Sparse Index', 'Granule', 'Mark']
summary: 'Part 디렉토리의 파일 구조부터 Granule, Mark, 희소 인덱스가 연결되는 읽기 경로까지. 쿼리가 수십억 행에서 필요한 Granule만 골라 읽는 원리를 설명합니다.'
thumbnail: './thumbnail.png'
---

[컬럼 지향 저장](/clickhouse/why-clickhouse/) 덕분에 ClickHouse는 1,000만 행 집계를 0.035초에 끝냅니다. 그런데 한 가지 의문이 남습니다. `WHERE category = '전자제품'`을 걸면 ClickHouse는 8개 카테고리 중 해당 데이터만 읽습니다. 전체를 스캔하지 않습니다. 어떻게 아는 걸까요?

PostgreSQL이라면 B-tree 인덱스가 정확한 행 위치를 가리킵니다. 1억 행이면 인덱스 엔트리도 1억 개입니다. ClickHouse는 다릅니다. 수십 KB짜리 파일 하나로 같은 일을 합니다. 그 파일이 `primary.idx`이고, 이것이 MergeTree 스토리지 엔진의 핵심입니다.

<br>

이 글에서는 MergeTree의 내부로 들어갑니다. Part 디렉토리 안의 파일들, Granule-Mark-희소 인덱스의 연결 구조, 그리고 쿼리가 도착했을 때 필요한 데이터만 골라 읽는 과정을 실험으로 확인합니다.

## Part: MergeTree의 저장 단위

### Part는 어떻게 만들어지는가

INSERT가 실행되면 ClickHouse는 데이터를 `ORDER BY` 순서로 정렬한 뒤 **불변(immutable) Part**로 디스크에 씁니다. 한번 쓰인 Part는 절대 수정되지 않습니다. 새로운 INSERT가 오면 또 다른 Part가 생기고, 시간이 지나면 백그라운드 머지가 작은 Part들을 큰 Part로 합칩니다.

Part 이름에는 이력이 담겨 있습니다. 1,000만 행을 한 번에 INSERT하면 `all_1_1_0`이라는 Part 하나가 만들어집니다. 이 이름을 분해해봅시다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 348" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Part 이름 all_1_1_0을 partition_id, min_block, max_block, level 네 부분으로 분해한 그림">
<style>
.pn-mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
.pn-name { font-size: 28px; fill: var(--text, #1c1917); }
.pn-num { font-size: 17px; fill: var(--on-fill, #14100e); font-weight: 600; }
.pn-key { font-size: 18px; fill: var(--text, #1c1917); font-weight: 600; }
.pn-desc { font-size: 18px; fill: var(--text-muted, #6d6762); }
.pn-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.pn-badge { fill: var(--primary, #0a756c); }
</style>
<!-- part 이름 -->
<text class="pn-mono pn-name" x="173" y="46" text-anchor="middle">a</text>
<text class="pn-mono pn-name" x="190" y="46" text-anchor="middle">l</text>
<text class="pn-mono pn-name" x="207" y="46" text-anchor="middle">l</text>
<text class="pn-mono pn-name" x="224" y="46" text-anchor="middle">_</text>
<text class="pn-mono pn-name" x="241" y="46" text-anchor="middle">1</text>
<text class="pn-mono pn-name" x="258" y="46" text-anchor="middle">_</text>
<text class="pn-mono pn-name" x="275" y="46" text-anchor="middle">1</text>
<text class="pn-mono pn-name" x="292" y="46" text-anchor="middle">_</text>
<text class="pn-mono pn-name" x="309" y="46" text-anchor="middle">0</text>
<!-- 이름 아래 번호 -->
<circle class="pn-badge" cx="190" cy="78" r="13"/>
<text class="pn-num" x="190" y="84" text-anchor="middle">1</text>
<circle class="pn-badge" cx="241" cy="78" r="13"/>
<text class="pn-num" x="241" y="84" text-anchor="middle">2</text>
<circle class="pn-badge" cx="275" cy="78" r="13"/>
<text class="pn-num" x="275" y="84" text-anchor="middle">3</text>
<circle class="pn-badge" cx="309" cy="78" r="13"/>
<text class="pn-num" x="309" y="84" text-anchor="middle">4</text>
<!-- 항목 1 -->
<rect class="pn-box" x="24" y="100" width="432" height="52" rx="6"/>
<circle class="pn-badge" cx="52" cy="126" r="13"/>
<text class="pn-num" x="52" y="132" text-anchor="middle">1</text>
<text class="pn-key" x="78" y="123">all · partition_id</text>
<text class="pn-desc" x="78" y="144">파티션 값. 미지정이면 all</text>
<!-- 항목 2 -->
<rect class="pn-box" x="24" y="160" width="432" height="52" rx="6"/>
<circle class="pn-badge" cx="52" cy="186" r="13"/>
<text class="pn-num" x="52" y="192" text-anchor="middle">2</text>
<text class="pn-key" x="78" y="183">1 · min_block</text>
<text class="pn-desc" x="78" y="204">INSERT 블록 번호 하한</text>
<!-- 항목 3 -->
<rect class="pn-box" x="24" y="220" width="432" height="52" rx="6"/>
<circle class="pn-badge" cx="52" cy="246" r="13"/>
<text class="pn-num" x="52" y="252" text-anchor="middle">3</text>
<text class="pn-key" x="78" y="243">1 · max_block</text>
<text class="pn-desc" x="78" y="264">INSERT 블록 번호 상한</text>
<!-- 항목 4 -->
<rect class="pn-box" x="24" y="280" width="432" height="52" rx="6"/>
<circle class="pn-badge" cx="52" cy="306" r="13"/>
<text class="pn-num" x="52" y="312" text-anchor="middle">4</text>
<text class="pn-key" x="78" y="303">0 · level</text>
<text class="pn-desc" x="78" y="324">머지 횟수. 0이면 원본</text>
</svg>
</div>

`all`은 파티션 키를 지정하지 않았기 때문에 모든 데이터가 하나의 파티션에 들어갔다는 뜻이고, `1_1`은 첫 번째 INSERT 블록이며, `0`은 아직 머지되지 않은 원본 Part라는 뜻입니다. INSERT를 세 번 나눠서 실행했다면 `all_1_1_0`, `all_2_2_0`, `all_3_3_0` 세 개의 Part가 생기고, 머지 후에는 `all_1_3_1`처럼 블록 범위가 합쳐지면서 level이 1로 올라갑니다. 머지의 상세한 동작은 다음 글에서 다룹니다.

### Part 디렉토리 안을 열어보면

Part는 디스크에 하나의 디렉토리로 존재합니다.

| 파일 | 역할 |
|------|------|
| `primary.idx` | 희소 인덱스: granule 경계의 PRIMARY KEY 값 |
| `{column}.bin` | 컬럼 데이터 (압축 블록 단위로 저장) |
| `{column}.mrk2` | Mark 파일: granule 번호를 물리적 바이트 오프셋으로 변환 |
| `count.txt` | 이 Part의 총 행 수 |
| `columns.txt` | 컬럼 이름과 타입 목록 |
| `checksums.txt` | 모든 파일의 무결성 체크섬 |
| `default_compression_codec.txt` | 사용 중인 압축 코덱 (LZ4, ZSTD 등) |
| `partition.dat` / `minmax_*.idx` | 파티션 키 값과 파티션 컬럼의 min/max |

핵심은 **`primary.idx`**(희소 인덱스), **`.bin`**(컬럼 데이터), **`.mrk2`**(Mark) 세 파일입니다. 나머지는 메타데이터이거나 무결성 검증용입니다.

`orders` 테이블은 5개 컬럼이므로, Part 디렉토리 안에는 `order_id.bin`, `order_id.mrk2`, `user_id.bin`, `user_id.mrk2`, `price.bin`, `price.mrk2`, `category.bin`, `category.mrk2`, `created_at.bin`, `created_at.mrk2`. 컬럼당 `.bin` + `.mrk2` 한 쌍씩, 총 10개의 데이터 파일이 생깁니다. 여기에 `primary.idx`와 메타데이터 파일들이 더해지는 구조입니다.

### Wide 포맷 vs Compact 포맷

위에서 설명한 "컬럼마다 `.bin` + `.mrk2` 한 쌍"이 **Wide 포맷**입니다. 대부분의 프로덕션 Part는 Wide 포맷이고, 이 글의 모든 설명도 Wide 기준입니다.

작은 Part(기본 10MB 미만)에서는 **Compact 포맷**이 사용됩니다. 모든 컬럼 데이터가 하나의 `.bin` 파일에 합쳐지고, Mark 파일은 `.mrk3` 확장자를 씁니다. 수십 개의 작은 파일 대신 하나의 파일로 합쳐서 파일 시스템 오버헤드를 줄이려는 설계입니다. 빈번한 INSERT로 작은 Part가 많이 생길 때 의미가 있지만, 결국 백그라운드 머지로 큰 Part가 되면 Wide로 전환됩니다.

`system.parts`의 `part_type` 컬럼에서 현재 포맷을 확인할 수 있습니다. 기준값은 `min_bytes_for_wide_part`(기본 10MB)입니다.

## Granule: 데이터를 읽는 최소 단위

### Granule이란

Granule은 ClickHouse가 쿼리 시 데이터를 읽는 **최소 논리적 단위**입니다. 기본값은 **8,192행**(설정: `index_granularity`).

Granule은 디스크에 별도 파일로 존재하지 않습니다. 컬럼 데이터는 `.bin` 파일 안에 연속으로 저장되어 있고, "여기서부터 8,192행이 하나의 granule이다"라는 경계만 Mark 파일에 기록됩니다. 쿼리가 특정 granule을 읽어야 할 때, ClickHouse는 그 granule 전체(8,192행)를 읽습니다. 절반만 필요해도 전체를 읽습니다.

1,000만 행 테이블이라면 granule 수는 10,000,000 / 8,192 = **1,221개**입니다(마지막 granule은 8,192행 미만).

### 왜 8,192행인가

Granule 크기는 인덱스 크기와 읽기 정밀도 사이의 트레이드오프입니다.

- **Granule이 작으면**: 인덱스 엔트리가 많아져서 메모리를 더 쓰지만, 불필요한 행을 덜 읽습니다
- **Granule이 크면**: 인덱스가 작아서 메모리 효율이 좋지만, 필요 없는 행까지 더 많이 읽습니다

8,192행은 이 트레이드오프의 균형점입니다. 10억 행 테이블이라도 인덱스 엔트리가 약 122,000개밖에 되지 않아 수 MB 수준으로 메모리에 전부 올립니다. 같은 10억 행에 대해 PostgreSQL의 B-tree는 10억 개의 엔트리를 수 GB 규모로 유지해야 합니다.

:::info

**적응형 Granularity**

`index_granularity_bytes`(기본 10MB)가 활성화되어 있으면, 행 수뿐 아니라 데이터 크기도 granule 경계의 기준이 됩니다. 가변 길이 컬럼(String, Array 등)이 많아서 행마다 크기 차이가 클 때, 고정 행 수 대신 바이트 기준으로 granule을 나누면 각 granule의 메모리 사용량이 균일해집니다. 이 경우 Mark 파일에 granule당 실제 행 수(`rows_count`)가 추가로 기록됩니다.

:::

### Granule과 컬럼 파일의 관계

Granule 경계는 **모든 컬럼에 동일하게 적용**됩니다. Granule 0은 모든 컬럼 파일에서 행 0\~8,191을 의미합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 268" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="네 개의 컬럼 bin 파일에 granule 경계가 동일하게 적용되어 같은 granule 번호가 모든 컬럼에서 같은 행 범위를 가리키는 그림">
<style>
.gc-mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
.gc-head { font-size: 18px; fill: var(--text, #1c1917); font-weight: 600; }
.gc-sub { font-size: 17px; fill: var(--text-muted, #6d6762); }
.gc-cell { font-size: 18px; fill: var(--text, #1c1917); }
.gc-lab { font-size: 17px; fill: var(--text, #1c1917); }
.gc-cap { font-size: 18px; fill: var(--text-muted, #6d6762); }
.gc-hbox { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gc-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gc-guide { stroke: var(--primary, #0a756c); stroke-width: 1.5; stroke-dasharray: 4 4; }
</style>
<!-- 헤더 -->
<rect class="gc-hbox" x="24" y="24" width="122" height="48"/>
<text class="gc-head" x="85" y="54" text-anchor="middle">컬럼 파일</text>
<rect class="gc-hbox" x="146" y="24" width="152" height="48"/>
<text class="gc-head" x="222" y="46" text-anchor="middle">Granule 0</text>
<text class="gc-sub" x="222" y="65" text-anchor="middle">행 0~8191</text>
<rect class="gc-hbox" x="298" y="24" width="144" height="48"/>
<text class="gc-head" x="370" y="46" text-anchor="middle">Granule 1</text>
<text class="gc-sub" x="370" y="65" text-anchor="middle">행 8192~16383</text>
<!-- order_id -->
<rect class="gc-box" x="24" y="80" width="122" height="34"/>
<text class="gc-mono gc-lab" x="32" y="103">order_id</text>
<rect class="gc-box" x="146" y="80" width="152" height="34"/>
<text class="gc-cell" x="222" y="103" text-anchor="middle">8192행</text>
<rect class="gc-box" x="298" y="80" width="144" height="34"/>
<text class="gc-cell" x="370" y="103" text-anchor="middle">8192행</text>
<text class="gc-sub" x="449" y="103" text-anchor="middle">…</text>
<!-- price -->
<rect class="gc-box" x="24" y="118" width="122" height="34"/>
<text class="gc-mono gc-lab" x="32" y="141">price</text>
<rect class="gc-box" x="146" y="118" width="152" height="34"/>
<text class="gc-cell" x="222" y="141" text-anchor="middle">8192행</text>
<rect class="gc-box" x="298" y="118" width="144" height="34"/>
<text class="gc-cell" x="370" y="141" text-anchor="middle">8192행</text>
<text class="gc-sub" x="449" y="141" text-anchor="middle">…</text>
<!-- category -->
<rect class="gc-box" x="24" y="156" width="122" height="34"/>
<text class="gc-mono gc-lab" x="32" y="179">category</text>
<rect class="gc-box" x="146" y="156" width="152" height="34"/>
<text class="gc-cell" x="222" y="179" text-anchor="middle">8192행</text>
<rect class="gc-box" x="298" y="156" width="144" height="34"/>
<text class="gc-cell" x="370" y="179" text-anchor="middle">8192행</text>
<text class="gc-sub" x="449" y="179" text-anchor="middle">…</text>
<!-- created_at -->
<rect class="gc-box" x="24" y="194" width="122" height="34"/>
<text class="gc-mono gc-lab" x="32" y="217">created_at</text>
<rect class="gc-box" x="146" y="194" width="152" height="34"/>
<text class="gc-cell" x="222" y="217" text-anchor="middle">8192행</text>
<rect class="gc-box" x="298" y="194" width="144" height="34"/>
<text class="gc-cell" x="370" y="217" text-anchor="middle">8192행</text>
<text class="gc-sub" x="449" y="217" text-anchor="middle">…</text>
<!-- 정렬 가이드 -->
<line class="gc-guide" x1="146" y1="20" x2="146" y2="234"/>
<line class="gc-guide" x1="298" y1="20" x2="298" y2="234"/>
<text class="gc-cap" x="240" y="256" text-anchor="middle">granule 번호가 같으면 모든 컬럼에서 같은 행 범위</text>
</svg>
</div>

이 정렬 덕분에 `SELECT avg(price) FROM orders WHERE category = '전자제품'`은 `price.bin`과 `category.bin`만 열면 됩니다. 나머지 컬럼 파일은 건드리지 않으면서도 행 정합성은 보장됩니다. Granule 0의 price 값과 category 값은 같은 행들의 데이터입니다.

## 압축 블록과 Column 파일

`.bin` 파일은 그 안에서 다시 **압축 블록(compressed block)** 단위로 나뉩니다. 각 블록은 비압축 기준 64KB~1MB 크기이며, LZ4나 ZSTD로 압축된 상태로 저장됩니다.

하나의 압축 블록 안에 여러 granule이 들어갈 수 있습니다. UInt32 컬럼의 경우 한 granule이 8,192 × 4바이트 = 약 32KB이므로, 두 granule 정도가 하나의 64KB 블록에 패킹됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 300" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="price.bin 파일 안의 압축 블록 두 개가 각각 granule 두 개씩을 담고 있는 구조를 보여주는 그림">
<style>
.cb-mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
.cb-title { font-size: 19px; fill: var(--text, #1c1917); font-weight: 600; }
.cb-blk { font-size: 18px; fill: var(--text-muted, #6d6762); }
.cb-gr { font-size: 18px; fill: var(--text, #1c1917); }
.cb-cap { font-size: 18px; fill: var(--text-muted, #6d6762); }
.cb-outer { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.cb-pill { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
</style>
<text class="cb-mono cb-title" x="24" y="30">price.bin</text>
<!-- 압축 블록 0 -->
<rect class="cb-outer" x="24" y="44" width="432" height="88" rx="8"/>
<text class="cb-mono cb-blk" x="42" y="70">Compressed Block 0</text>
<rect class="cb-pill" x="42" y="80" width="196" height="40" rx="6"/>
<text class="cb-mono cb-gr" x="140" y="105" text-anchor="middle">Granule 0 · 32KB</text>
<rect class="cb-pill" x="246" y="80" width="196" height="40" rx="6"/>
<text class="cb-mono cb-gr" x="344" y="105" text-anchor="middle">Granule 1 · 32KB</text>
<!-- 압축 블록 1 -->
<rect class="cb-outer" x="24" y="148" width="432" height="88" rx="8"/>
<text class="cb-mono cb-blk" x="42" y="174">Compressed Block 1</text>
<rect class="cb-pill" x="42" y="184" width="196" height="40" rx="6"/>
<text class="cb-mono cb-gr" x="140" y="209" text-anchor="middle">Granule 2 · 32KB</text>
<rect class="cb-pill" x="246" y="184" width="196" height="40" rx="6"/>
<text class="cb-mono cb-gr" x="344" y="209" text-anchor="middle">Granule 3 · 32KB</text>
<!-- 캡션 -->
<text class="cb-cap" x="240" y="264" text-anchor="middle">압축 블록 하나 = 비압축 64KB</text>
<text class="cb-cap" x="240" y="286" text-anchor="middle">granule 하나만 필요해도 블록 전체를 해제</text>
</svg>
</div>

granule마다 따로 압축하지 않는 이유는 간단합니다. 압축 알고리즘은 데이터가 클수록 패턴을 더 잘 찾기 때문입니다. 32KB 단위로 쪼개면 압축률이 크게 떨어집니다. 대신 여러 granule을 묶어서 압축하면, 특정 granule 하나만 읽으려 해도 블록 전체를 해제해야 합니다(**read amplification**). OLAP 쿼리는 대부분 연속된 granule을 대량으로 읽기 때문에, 실무에서 이 비용이 문제가 되는 경우는 드뭅니다.

각 압축 블록에는 헤더(압축 전 크기, 압축 후 크기, 체크섬)가 붙어서 ClickHouse가 블록 단위로 점프하며 해제할 수 있게 합니다.

## Mark 파일: Granule과 물리적 위치를 잇는 다리

### Mark의 구조

"Granule N을 읽고 싶다"를 "`.bin` 파일의 몇 번째 바이트부터 읽어라"로 변환하는 것이 **Mark 파일(`.mrk2`)**입니다.

`.mrk2` 파일은 비압축 flat 배열입니다. Granule 하나당 엔트리 하나. 각 엔트리에는 세 개의 필드가 기록됩니다.

1. **`offset_in_compressed_file`**: `.bin` 파일에서 해당 압축 블록이 시작하는 바이트 위치
2. **`offset_in_decompressed_block`**: 압축을 해제한 블록 안에서 해당 granule이 시작하는 바이트 위치
3. **`rows_count`**: 이 granule에 포함된 행 수 (적응형 granularity를 위해 기록)

`price.mrk2`가 담고 있는 granule → 물리적 위치 매핑은 이런 모습입니다.

| Granule # | compressed file 오프셋 | decompressed block 오프셋 |
|------|------|------|
| 0 | 0 | 0 |
| 1 | 0 | 32768 |
| 2 | 24576 | 0 |
| 3 | 24576 | 32768 |
| … | … | … |

Granule 0과 1은 같은 압축 블록(오프셋 0)에 들어 있습니다. Granule 0은 그 블록의 처음부터, Granule 1은 32,768바이트(= 8,192행 × 4바이트) 지점부터 시작합니다. Granule 2는 새로운 압축 블록(오프셋 24,576)의 처음부터 시작합니다.

### 왜 Mark 파일이 필요한가

Mark가 없다면 granule N의 데이터를 읽으려면 `.bin` 파일의 처음부터 모든 압축 블록을 순서대로 해제하면서 N번째 granule 위치를 찾아야 합니다. Mark가 있으면 **랜덤 액세스**가 가능합니다. Mark N의 오프셋을 읽고, `.bin` 파일의 정확한 위치로 점프해서 해당 블록만 해제하면 됩니다.

각 컬럼은 별도의 `.mrk2` 파일을 갖습니다. 같은 granule이라도 컬럼마다 데이터 타입과 크기가 다르기 때문에, 물리적 위치(바이트 오프셋)가 다릅니다. `price`(UInt32)와 `category`(LowCardinality(String))의 granule 0이 각각의 `.bin` 파일에서 다른 위치에 있는 것은 당연합니다.

### 전체 연결: primary.idx → Mark → Column 파일

세 파일의 연결을 한눈에 보면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 646" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="primary.idx가 granule 번호를 내놓고, price.mrk2가 그 번호를 바이트 오프셋으로 바꾸고, price.bin의 압축 블록을 읽는 3단계 읽기 경로를 위에서 아래로 보여주는 그림">
<style>
.rp-mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
.rp-title { font-size: 20px; fill: var(--text, #1c1917); font-weight: 600; }
.rp-th { font-size: 17px; fill: var(--text-muted, #6d6762); font-weight: 600; }
.rp-td { font-size: 18px; fill: var(--text, #1c1917); }
.rp-arrowlab { font-size: 18px; fill: var(--primary, #0a756c); font-weight: 600; }
.rp-blk { font-size: 18px; fill: var(--text, #1c1917); }
.rp-blksub { font-size: 17px; fill: var(--text-muted, #6d6762); }
.rp-panel { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.rp-head { fill: var(--bg-muted, #eeecea); stroke: none; }
.rp-line { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.rp-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.rp-arrow { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; }
</style>
<defs>
<marker id="rpArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<!-- 1단계: primary.idx -->
<text class="rp-title" x="240" y="26" text-anchor="middle">1. primary.idx (희소 인덱스)</text>
<rect class="rp-panel" x="24" y="38" width="432" height="150" rx="6"/>
<rect class="rp-head" x="25" y="39" width="430" height="29"/>
<text class="rp-th" x="88" y="59" text-anchor="middle">granule #</text>
<text class="rp-th" x="304" y="59" text-anchor="middle">PRIMARY KEY 첫 값</text>
<line class="rp-line" x1="24" y1="68" x2="456" y2="68"/>
<line class="rp-line" x1="152" y1="38" x2="152" y2="188"/>
<line class="rp-line" x1="24" y1="98" x2="456" y2="98"/>
<line class="rp-line" x1="24" y1="128" x2="456" y2="128"/>
<line class="rp-line" x1="24" y1="158" x2="456" y2="158"/>
<text class="rp-mono rp-td" x="88" y="88" text-anchor="middle">0</text>
<text class="rp-td" x="304" y="88" text-anchor="middle">가구 / 2025-01-01</text>
<text class="rp-mono rp-td" x="88" y="118" text-anchor="middle">1</text>
<text class="rp-td" x="304" y="118" text-anchor="middle">가구 / 2025-01-03</text>
<text class="rp-td" x="88" y="148" text-anchor="middle">…</text>
<text class="rp-td" x="304" y="148" text-anchor="middle">…</text>
<text class="rp-mono rp-td" x="88" y="178" text-anchor="middle">916</text>
<text class="rp-td" x="304" y="178" text-anchor="middle">전자제품 / 2025-01-01</text>
<!-- 화살표 1 -->
<line class="rp-arrow" x1="140" y1="196" x2="140" y2="228" marker-end="url(#rpArrow)"/>
<text class="rp-arrowlab" x="162" y="218">granule 번호</text>
<!-- 2단계: price.mrk2 -->
<text class="rp-title" x="240" y="262" text-anchor="middle">2. price.mrk2 (Mark 파일)</text>
<rect class="rp-panel" x="24" y="274" width="432" height="150" rx="6"/>
<rect class="rp-head" x="25" y="275" width="430" height="29"/>
<text class="rp-th" x="72" y="295" text-anchor="middle">granule #</text>
<text class="rp-th" x="204" y="295" text-anchor="middle">블록 오프셋</text>
<text class="rp-th" x="372" y="295" text-anchor="middle">블록 내 오프셋</text>
<line class="rp-line" x1="24" y1="304" x2="456" y2="304"/>
<line class="rp-line" x1="120" y1="274" x2="120" y2="424"/>
<line class="rp-line" x1="288" y1="274" x2="288" y2="424"/>
<line class="rp-line" x1="24" y1="334" x2="456" y2="334"/>
<line class="rp-line" x1="24" y1="364" x2="456" y2="364"/>
<line class="rp-line" x1="24" y1="394" x2="456" y2="394"/>
<text class="rp-mono rp-td" x="72" y="324" text-anchor="middle">0</text>
<text class="rp-mono rp-td" x="204" y="324" text-anchor="middle">0</text>
<text class="rp-mono rp-td" x="372" y="324" text-anchor="middle">0</text>
<text class="rp-mono rp-td" x="72" y="354" text-anchor="middle">1</text>
<text class="rp-mono rp-td" x="204" y="354" text-anchor="middle">0</text>
<text class="rp-mono rp-td" x="372" y="354" text-anchor="middle">32768</text>
<text class="rp-mono rp-td" x="72" y="384" text-anchor="middle">2</text>
<text class="rp-mono rp-td" x="204" y="384" text-anchor="middle">24576</text>
<text class="rp-mono rp-td" x="372" y="384" text-anchor="middle">0</text>
<text class="rp-td" x="72" y="414" text-anchor="middle">…</text>
<text class="rp-td" x="204" y="414" text-anchor="middle">…</text>
<text class="rp-td" x="372" y="414" text-anchor="middle">…</text>
<!-- 화살표 2 -->
<line class="rp-arrow" x1="140" y1="432" x2="140" y2="464" marker-end="url(#rpArrow)"/>
<text class="rp-arrowlab" x="162" y="454">바이트 오프셋</text>
<!-- 3단계: price.bin -->
<text class="rp-title" x="240" y="498" text-anchor="middle">3. price.bin (컬럼 데이터)</text>
<rect class="rp-box" x="24" y="510" width="432" height="56" rx="6"/>
<text class="rp-mono rp-blk" x="40" y="534">Compressed Block 0 · offset 0</text>
<text class="rp-mono rp-blksub" x="40" y="556">Granule 0, Granule 1</text>
<rect class="rp-box" x="24" y="574" width="432" height="56" rx="6"/>
<text class="rp-mono rp-blk" x="40" y="598">Compressed Block 1 · offset 24576</text>
<text class="rp-mono rp-blksub" x="40" y="620">Granule 2, Granule 3</text>
</svg>
</div>

1. `primary.idx`에서 "어느 granule을 읽어야 하는가"를 결정하고
2. `.mrk2`에서 "그 granule이 `.bin` 파일 어디에 있는가"를 찾고
3. `.bin`에서 해당 압축 블록을 읽어 해제합니다

이 3단계가 MergeTree의 읽기 경로 전체입니다.

## 희소 인덱스

### primary.idx의 구조

`primary.idx`는 비압축 flat 배열입니다. Granule 하나당 엔트리 하나, 각 엔트리에는 **해당 granule 첫 번째 행의 PRIMARY KEY 컬럼 값**이 기록됩니다.

`orders` 테이블의 `ORDER BY (category, created_at)`의 경우, primary.idx의 각 엔트리는 `[category값, created_at값]` 쌍입니다. 데이터가 이 순서로 정렬되어 있으므로, 엔트리들도 사전순으로 정렬된 상태입니다.

1,221개 엔트리가 이런 식으로 늘어섭니다.

| Granule # | category | created_at |
|------|------|------|
| 0 | 가구 | 2025-01-01 00:00:12 |
| 1 | 가구 | 2025-01-03 14:22:07 |
| … | … | … |
| 153 | 도서 | 2025-01-01 00:01:33 |
| … | … | … |
| 916 | 전자제품 | 2025-01-01 00:00:55 |
| 917 | 전자제품 | 2025-01-03 08:47:22 |
| … | … | … |
| 1069 | 화장품 | 2025-01-01 00:02:18 |
| … | … | … |
| 1220 | 화장품 | 2025-12-29 15:33:41 |

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

정확도를 8,192행 단위로 낮추는 대신 인덱스 크기를 수만 배 줄입니다. `WHERE id = 42`로 정확히 한 행을 찾아야 하는 OLTP에서는 치명적인 단점이지만, 수백만 행을 한꺼번에 집계하는 OLAP에서는 이 손해가 사실상 드러나지 않습니다.

### Granule Pruning: 쿼리가 인덱스를 사용하는 과정

`WHERE category = '전자제품'`이 들어오면 ClickHouse는 다음 순서로 동작합니다.

1. WHERE 조건에서 PRIMARY KEY 컬럼(`category`)에 대한 조건을 추출합니다
2. `primary.idx`를 이진 탐색하여 `category = '전자제품'`에 해당하는 granule 범위를 찾습니다
3. 해당 범위 밖의 granule은 전부 **skip**(pruning)합니다
4. 선택된 granule만 Mark → Column 파일 경로로 읽습니다

데이터가 `ORDER BY (category, created_at)` 순으로 정렬되어 있으므로, 같은 category의 행들은 연속된 granule에 모여 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 244" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전체 1221개 granule 중 전자제품에 해당하는 916번부터 1068번까지 153개만 선택되고 나머지 1068개는 건너뛰는 것을 막대로 보여주는 그림">
<style>
.gp-cat { font-size: 18px; fill: var(--text-success, #107836); font-weight: 600; }
.gp-skip { font-size: 18px; fill: var(--text-muted, #6d6762); font-weight: 600; }
.gp-sel { font-size: 17px; fill: var(--text-success, #107836); font-weight: 600; }
.gp-tick { font-size: 17px; fill: var(--text-muted, #6d6762); }
.gp-leg { font-size: 18px; fill: var(--text, #1c1917); }
.gp-sum { font-size: 19px; fill: var(--text, #1c1917); font-weight: 600; }
.gp-bar { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.gp-hit { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 2; }
.gp-conn { stroke: var(--text-success, #107836); stroke-width: 2; }
</style>
<!-- 선택 구간 라벨 -->
<text class="gp-cat" x="375" y="52" text-anchor="middle">전자제품</text>
<line class="gp-conn" x1="375" y1="58" x2="375" y2="68"/>
<!-- granule 막대 (길이가 실제 비율) -->
<rect class="gp-bar" x="24" y="70" width="432" height="44" rx="4"/>
<text class="gp-skip" x="186" y="98" text-anchor="middle">SKIP</text>
<text class="gp-skip" x="429" y="98" text-anchor="middle">SKIP</text>
<rect class="gp-hit" x="348" y="70" width="54" height="44" rx="4"/>
<text class="gp-sel" x="375" y="98" text-anchor="middle">153</text>
<text class="gp-tick" x="24" y="134">granule 0</text>
<text class="gp-tick" x="456" y="134" text-anchor="end">1220</text>
<!-- 범례 -->
<rect class="gp-hit" x="60" y="152" width="16" height="16" rx="3"/>
<text class="gp-leg" x="86" y="166">읽음 · granule 916~1068 (153개)</text>
<rect class="gp-bar" x="60" y="182" width="16" height="16" rx="3"/>
<text class="gp-leg" x="86" y="196">건너뜀 · 나머지 1068개</text>
<text class="gp-sum" x="240" y="228" text-anchor="middle">1,221개 중 153개 · 디스크 I/O 약 1/8</text>
</svg>
</div>

1,221개 granule 중 `전자제품`에 해당하는 약 153개만 읽고 나머지 1,068개는 건드리지 않습니다. 디스크 I/O가 약 1/8로 줄어드는 것입니다.

반면 `WHERE user_id = 42`를 쿼리하면 어떨까요? `user_id`는 `ORDER BY`에 포함되어 있지 않으므로 `primary.idx`에 기록되어 있지 않습니다. Pruning이 불가능하고 모든 granule을 읽어야 합니다. 어떤 컬럼을 `ORDER BY` 앞에 놓느냐에 따라 pruning 효과가 완전히 달라집니다.

## 쿼리 실행 흐름: 처음부터 끝까지

`SELECT avg(price) FROM orders WHERE category = '전자제품'`이 실행되는 전체 경로를 따라가 봅시다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 620" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="쿼리가 primary.idx 이진 탐색, mark 오프셋 조회, 압축 블록 해제, WHERE 필터와 집계, 결과 반환의 다섯 단계를 거치는 흐름과 열지 않는 파일 목록을 보여주는 그림">
<style>
.qf-mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
.qf-q { font-size: 17px; fill: var(--text, #1c1917); }
.qf-num { font-size: 17px; fill: var(--on-fill, #14100e); font-weight: 600; }
.qf-main { font-size: 18px; fill: var(--text, #1c1917); font-weight: 600; }
.qf-sub { font-size: 17px; fill: var(--text-muted, #6d6762); }
.qf-notet { font-size: 18px; fill: var(--text, #1c1917); font-weight: 600; }
.qf-qbox { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
.qf-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.qf-badge { fill: var(--primary, #0a756c); }
.qf-arrow { stroke: var(--text-muted, #6d6762); stroke-width: 2; fill: none; }
.qf-note { fill: none; stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 4; }
</style>
<defs>
<marker id="qfArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 쿼리 -->
<rect class="qf-qbox" x="24" y="16" width="432" height="58" rx="6"/>
<text class="qf-mono qf-q" x="240" y="42" text-anchor="middle">SELECT avg(price) FROM orders</text>
<text class="qf-mono qf-q" x="240" y="64" text-anchor="middle">WHERE category = '전자제품'</text>
<line class="qf-arrow" x1="240" y1="76" x2="240" y2="90" marker-end="url(#qfArrow)"/>
<!-- 1 -->
<rect class="qf-box" x="24" y="94" width="432" height="64" rx="6"/>
<circle class="qf-badge" cx="54" cy="126" r="14"/>
<text class="qf-num" x="54" y="132" text-anchor="middle">1</text>
<text class="qf-main" x="82" y="121">primary.idx 이진 탐색</text>
<text class="qf-sub" x="82" y="143">granule 916~1068 선택</text>
<line class="qf-arrow" x1="240" y1="160" x2="240" y2="176" marker-end="url(#qfArrow)"/>
<!-- 2 -->
<rect class="qf-box" x="24" y="180" width="432" height="64" rx="6"/>
<circle class="qf-badge" cx="54" cy="212" r="14"/>
<text class="qf-num" x="54" y="218" text-anchor="middle">2</text>
<text class="qf-main" x="82" y="207">price.mrk2, category.mrk2</text>
<text class="qf-sub" x="82" y="229">선택된 mark의 오프셋 조회</text>
<line class="qf-arrow" x1="240" y1="246" x2="240" y2="262" marker-end="url(#qfArrow)"/>
<!-- 3 -->
<rect class="qf-box" x="24" y="266" width="432" height="64" rx="6"/>
<circle class="qf-badge" cx="54" cy="298" r="14"/>
<text class="qf-num" x="54" y="304" text-anchor="middle">3</text>
<text class="qf-main" x="82" y="293">price.bin, category.bin</text>
<text class="qf-sub" x="82" y="315">해당 압축 블록만 읽고 해제</text>
<line class="qf-arrow" x1="240" y1="332" x2="240" y2="348" marker-end="url(#qfArrow)"/>
<!-- 4 -->
<rect class="qf-box" x="24" y="352" width="432" height="64" rx="6"/>
<circle class="qf-badge" cx="54" cy="384" r="14"/>
<text class="qf-num" x="54" y="390" text-anchor="middle">4</text>
<text class="qf-main" x="82" y="379">WHERE 필터 + avg() 집계</text>
<text class="qf-sub" x="82" y="401">granule 경계의 잉여 행 제거</text>
<line class="qf-arrow" x1="240" y1="418" x2="240" y2="434" marker-end="url(#qfArrow)"/>
<!-- 5 -->
<rect class="qf-box" x="24" y="438" width="432" height="64" rx="6"/>
<circle class="qf-badge" cx="54" cy="470" r="14"/>
<text class="qf-num" x="54" y="476" text-anchor="middle">5</text>
<text class="qf-main" x="82" y="476">결과 반환</text>
<!-- 열지 않는 파일 -->
<rect class="qf-note" x="24" y="522" width="432" height="82" rx="6"/>
<text class="qf-notet" x="44" y="548">끝까지 열지 않는 파일</text>
<text class="qf-mono qf-sub" x="44" y="572">order_id.bin, user_id.bin,</text>
<text class="qf-mono qf-sub" x="44" y="594">created_at.bin</text>
</svg>
</div>

핵심은 **읽지 않는 것**입니다. `order_id.bin`, `user_id.bin`, `created_at.bin`은 열지도 않습니다. 전체 1,221개 granule 중 약 153개만, 전체 5개 컬럼 중 2개만 읽으니 원본 데이터의 극히 일부만 디스크에서 가져옵니다.

4단계에서 WHERE 필터를 다시 적용하는 이유는 이렇습니다. 희소 인덱스는 granule 단위로 선택하기 때문에, granule 경계에 다른 category의 행이 섞일 수 있습니다. 선택된 첫 번째 granule의 앞쪽 행에 이전 카테고리(`의류`)가 남아있거나, 마지막 granule의 뒤쪽 행에 다음 카테고리(`화장품`)가 포함될 수 있습니다. 그래서 granule을 읽은 뒤 행 단위 필터링이 한 번 더 필요합니다.

## 실험: Docker로 직접 확인하기

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

```text
Row 1:
──────
name:      all_1_1_0
part_type: Wide
rows:      10000000
marks:     1221
size:      57.64 MiB
path:      /var/lib/clickhouse/store/xxx/xxxyyyyy/all_1_1_0/
```

`part_type`이 `Wide`이고, `marks`가 1,221개(10,000,000 / 8,192 = 1,220.7, 올림). 실제 Part 디렉토리를 열어봅시다.

```bash
$ docker exec ch-test ls /var/lib/clickhouse/data/default/orders/all_1_1_0/
```

```text
category.bin                   order_id.bin
category.mrk2                  order_id.mrk2
checksums.txt                  price.bin
columns.txt                    price.mrk2
count.txt                      primary.idx
created_at.bin                 serialization.json
created_at.mrk2                user_id.bin
default_compression_codec.txt  user_id.mrk2
metadata_version.txt
```

컬럼 5개 × (`.bin` + `.mrk2`) = 10개 데이터 파일, `primary.idx`, 그리고 메타데이터 파일들. `count.txt`를 열어보면 `10000000`이 적혀 있습니다.

### Granule 수 검증

Granule 수와 행 수의 관계를 확인합니다.

```sql
SELECT
    name,
    rows,
    marks,
    round(rows / marks) AS approx_rows_per_granule
FROM system.parts
WHERE table = 'orders' AND active;
```

```text
┌─name──────┬─────rows─┬─marks─┬─approx_rows_per_granule─┐
│ all_1_1_0 │ 10000000 │  1221 │                    8190 │
└───────────┴──────────┴───────┴─────────────────────────┘
```

granule당 약 8,190행. 마지막 granule이 8,192행에 못 미치기 때문에 평균이 살짝 낮습니다.

### Granule Pruning 실험

`EXPLAIN indexes = 1`로 pruning 효과를 직접 확인합니다. `category`는 `ORDER BY`의 첫 번째 컬럼이므로 pruning이 강하게 작동해야 합니다.

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders WHERE category = '전자제품';
```

```text
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

**`Granules: 153/1221`**: 1,221개 중 153개만 선택됐습니다. 전체의 약 12.5%, 즉 8개 카테고리 중 1개에 해당하는 비율과 정확히 일치합니다.

이번에는 `user_id`로 필터링합니다. `user_id`는 `ORDER BY`에 포함되지 않습니다.

```sql
EXPLAIN indexes = 1
SELECT avg(price) FROM orders WHERE user_id = 42;
```

```text
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

**`Granules: 1221/1221`**: pruning이 전혀 작동하지 않아 모든 granule을 읽습니다. `Condition: true`가 이를 명확히 보여줍니다. 인덱스에서 `user_id`를 필터링할 방법이 없기 때문입니다.

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

```text
┌─column─────┬─type──────────────────┬─compressed─┬─uncompressed─┬─marks_size─┐
│ order_id   │ UInt64                │ 12.51 MiB  │ 76.29 MiB    │ 28.61 KiB  │
│ created_at │ DateTime              │ 5.73 MiB   │ 38.15 MiB    │ 28.61 KiB  │
│ user_id    │ UInt32                │ 19.14 MiB  │ 38.15 MiB    │ 28.61 KiB  │
│ price      │ UInt32                │ 19.07 MiB  │ 38.15 MiB    │ 28.61 KiB  │
│ category   │ LowCardinality(String)│ 1.53 MiB   │ 9.54 MiB     │ 28.61 KiB  │
└────────────┴───────────────────────┴────────────┴──────────────┴────────────┘
```

`marks_size`가 모든 컬럼에서 동일하게 **28.61 KiB**입니다. 1,221개 mark × 24바이트(오프셋 2개 + `rows_count`, 각 8바이트) = 29,304바이트 ≈ 28.61 KiB. 컬럼의 데이터 크기나 타입과 무관하게, granule 수가 같으면 Mark 파일 크기도 같습니다.

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

```text
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

```text
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

**`Granules: 2/1221`**: `user_id`가 ORDER BY 첫 번째 컬럼이므로 극도로 정밀한 pruning이 작동합니다. 1,221개 중 2개만 읽습니다.

같은 데이터, 같은 쿼리인데 ORDER BY만 바꿨을 뿐입니다. ORDER BY 선택이 곧 인덱스 설계이고, 이것이 쿼리 성능을 결정합니다.

## 실전에서는

MergeTree 내부 구조를 알면 운영에서 바로 쓸 수 있는 진단 포인트가 생깁니다.

**Part 수 모니터링**: `system.parts`에서 active Part 수를 추적합니다. Part가 수백 개 이상 쌓이면 "Too many parts" 에러의 전조입니다. INSERT 빈도가 높은 테이블에서 특히 주의가 필요합니다.

```sql
SELECT table, count() AS active_parts
FROM system.parts
WHERE active
GROUP BY table
ORDER BY active_parts DESC;
```

**컬럼별 압축률 확인**: `system.parts_columns`로 어떤 컬럼이 압축이 잘 되고 있는지, 어떤 컬럼이 비효율적인지 파악합니다. 압축률이 낮은 컬럼은 코덱을 변경하거나 ORDER BY 순서를 조정해서 개선할 수 있습니다.

**Granule Pruning이 작동하지 않는 패턴**: 쿼리가 예상보다 느리다면 `EXPLAIN indexes = 1`로 pruning 상태를 확인합니다. 다음 상황에서 pruning이 작동하지 않습니다.

- WHERE 조건이 ORDER BY 컬럼을 사용하지 않을 때
- ORDER BY가 `(a, b)`인데 WHERE에 `b`만 있을 때 (첫 번째 키 컬럼 `a`를 건너뛰면 이진 탐색 불가)
- 카디널리티가 극도로 높은 컬럼(예: UUID)이 ORDER BY 앞에 올 때 (granule마다 값이 고유해서 pruning 의미 없음)

이 패턴들을 피하려면 ORDER BY 키 설계가 중요합니다.

## 마치며

Part 디렉토리 안의 파일 구조, `primary.idx` → `.mrk2` → `.bin`으로 이어지는 읽기 경로, 그리고 ORDER BY가 곧 인덱스 설계라는 점을 실험으로 확인했습니다.

Part가 INSERT마다 계속 쌓이기만 하면 어떻게 될까요? 불변인 Part에서 UPDATE나 DELETE는? 다음 글에서는 백그라운드 머지가 Part들을 합치는 과정과, 뮤테이션(Mutation)이 불변 Part 위에서 변경을 구현하는 메커니즘을 다룹니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree Table Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse 공식 문서: A Practical Introduction to Primary Indexes](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)
- [ClickHouse 공식 문서: Table Parts](https://clickhouse.com/docs/parts)
