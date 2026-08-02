---
date: '2026-05-22'
title: 'ORDER BY가 곧 인덱스다: Primary Key와 정렬 키 설계 전략'
category: 'Database'
series: 'clickhouse'
seriesOrder: 5
tags: ['ClickHouse', 'Primary Key', 'ORDER BY', 'Sparse Index', 'Schema Design']
summary: 'ClickHouse에서 ORDER BY는 데이터 정렬 순서이자 희소 인덱스의 키입니다. 카디널리티 순서, 복합 키 설계, 다중 쿼리 패턴 대응까지, 정렬 키 설계 전략을 정리합니다.'
thumbnail: './thumbnail.png'
---

같은 데이터, 같은 테이블, 같은 쿼리. ORDER BY 컬럼 순서만 바꿨는데 스캔 행 수가 100배 차이 난 적이 있다면, ClickHouse에서 ORDER BY가 무엇인지 정확히 이해할 때가 된 것입니다.

RDB에서는 테이블을 먼저 만들고, 성능이 필요한 쿼리에 맞춰 `CREATE INDEX`를 추가합니다. 인덱스는 테이블과 별개의 구조물입니다. ClickHouse는 다릅니다. `CREATE TABLE`의 `ORDER BY` 절이 곧 데이터의 물리적 정렬 순서이고, 동시에 [희소 인덱스](/clickhouse/mergetree-internals/)의 키입니다. 희소 인덱스를 위한 별도의 생성 명령이 없습니다.

<br>

ReplacingMergeTree의 중복 제거 키, SummingMergeTree의 집계 차원처럼 [변종 엔진](/clickhouse/mergetree-variants/)의 핵심 동작도 결국 ORDER BY 키가 결정합니다. 이 글에서는 그 ORDER BY 키를 어떻게 설계해야 하는지를 체계적으로 다룹니다.

## PRIMARY KEY와 ORDER BY의 관계

ClickHouse를 처음 접한 개발자가 가장 혼란스러워하는 부분입니다. "PRIMARY KEY와 ORDER BY가 왜 따로 있지?" 결론부터 말하면, 99%의 경우 둘은 같습니다.

### PRIMARY KEY를 지정하지 않으면

`PRIMARY KEY`를 명시하지 않으면 `ORDER BY`가 자동으로 PRIMARY KEY가 됩니다.

```sql
CREATE TABLE events
(
    event_date  Date,
    user_id     UInt64,
    event_type  LowCardinality(String),
    url         String
)
ENGINE = MergeTree()
ORDER BY (event_date, user_id, event_type);
-- PRIMARY KEY가 자동으로 (event_date, user_id, event_type)이 됨
```

이것이 가장 일반적인 패턴입니다. ORDER BY가 물리적 정렬 순서, 희소 인덱스(`primary.idx`)의 키, 그리고 변종 엔진의 동작 키를 모두 결정합니다.

### PRIMARY KEY를 별도로 지정하면

드문 경우지만, PRIMARY KEY를 ORDER BY와 다르게 지정할 수 있습니다. 단, PRIMARY KEY는 반드시 ORDER BY의 **접두사(prefix)**여야 합니다.

```sql
CREATE TABLE events_compact_index
(
    event_date  Date,
    user_id     UInt64,
    event_type  LowCardinality(String),
    url         String
)
ENGINE = MergeTree()
ORDER BY (event_date, user_id, event_type)
PRIMARY KEY (event_date, user_id);
```

이 경우 데이터는 `(event_date, user_id, event_type)` 순서로 물리 정렬되지만, `primary.idx`에는 `(event_date, user_id)`만 기록됩니다. `event_type`은 인덱스에 들어가지 않지만 정렬에는 참여하므로, 같은 `(event_date, user_id)` 안에서 `event_type`으로 데이터가 정렬됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 270" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="ORDER BY에 지정한 세 컬럼 중 앞의 두 컬럼만 PRIMARY KEY로 지정했을 때, 희소 인덱스에는 앞 두 컬럼만 기록되고 물리 정렬은 세 컬럼 전체를 따른다는 것을 보여주는 그림">
<style>
.pk5-t { fill: var(--text, #1c1917); }
.pk5-m { fill: var(--text-muted, #78716c); }
.pk5-p { fill: var(--primary, #0d9488); }
.pk5-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pk5-key { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0d9488); stroke-width: 2; }
.pk5-br { fill: none; stroke: var(--text-muted, #78716c); stroke-width: 1.5; }
.pk5-brp { fill: none; stroke: var(--primary, #0d9488); stroke-width: 2; }
</style>
<text class="pk5-t" x="240" y="22" text-anchor="middle" font-size="18">ORDER BY (event_date, user_id, event_type)</text>
<!-- 위쪽 괄호: primary.idx에 들어가는 접두사 -->
<text class="pk5-p" x="162" y="52" text-anchor="middle" font-size="18">primary.idx에 기록되는 키</text>
<path class="pk5-brp" d="M16 74 V62 H308 V74" />
<!-- 정렬 키 컬럼 상자 -->
<rect class="pk5-key" x="16" y="82" width="136" height="46" rx="6" />
<rect class="pk5-key" x="172" y="82" width="136" height="46" rx="6" />
<rect class="pk5-box" x="328" y="82" width="136" height="46" rx="6" />
<text class="pk5-t" x="84" y="111" text-anchor="middle" font-size="18">event_date</text>
<text class="pk5-t" x="240" y="111" text-anchor="middle" font-size="18">user_id</text>
<text class="pk5-m" x="396" y="111" text-anchor="middle" font-size="18">event_type</text>
<!-- 아래쪽 괄호: 물리 정렬은 세 컬럼 전체 -->
<path class="pk5-br" d="M16 136 V148 H464 V136" />
<text class="pk5-t" x="240" y="174" text-anchor="middle" font-size="18">데이터가 물리적으로 정렬되는 순서</text>
<!-- 보충 설명 -->
<text class="pk5-t" x="240" y="214" text-anchor="middle" font-size="18">PRIMARY KEY는 ORDER BY의 접두사만 가능</text>
<text class="pk5-m" x="240" y="240" text-anchor="middle" font-size="17">event_type은 인덱스 없이 정렬에만 참여</text>
</svg>
</div>

이 패턴은 AggregatingMergeTree에서 유용합니다. 인덱스 크기를 줄이면서도 머지 로직에 필요한 넓은 정렬 키를 유지할 수 있기 때문입니다.

### RDB와의 결정적 차이

한 번 더 강조할 필요가 있습니다. ClickHouse의 PRIMARY KEY는 **유니크 제약(Unique Constraint)이 아닙니다.** 같은 PRIMARY KEY 값을 가진 행이 여러 개 있어도 아무 에러 없이 저장됩니다. ClickHouse에서 PRIMARY KEY는 "이 순서로 정렬하고, 이 값으로 [희소 인덱스](/clickhouse/mergetree-internals/)를 만들겠다"는 선언일 뿐입니다.

:::warning

**주의**

ORDER BY는 테이블 생성 시 결정됩니다. `ALTER TABLE MODIFY ORDER BY`로 컬럼을 추가할 수는 있지만, 새로 추가하는 컬럼만 가능하고 기존 컬럼 순서를 바꾸거나 제거하는 것은 불가능합니다. 사실상 가장 레버리지 높은 설계 결정이므로, 쿼리 패턴을 분석한 뒤 신중하게 정해야 합니다.

:::

## 카디널리티 순서의 원칙

ORDER BY 설계에서 가장 중요한 규칙은 컬럼의 카디널리티(cardinality, 고유 값의 수) 순서입니다.

### 첫 번째 컬럼은 바이너리 서치

[희소 인덱스](/clickhouse/mergetree-internals/) 탐색에서 첫 번째 컬럼은 바이너리 서치(binary search)로 찾습니다. O(log₂ n)이므로 카디널리티가 100이든 1억이든 효율적입니다. 첫 번째 컬럼의 카디널리티는 인덱스 탐색 성능 자체에는 큰 영향을 미치지 않습니다.

문제는 **두 번째 이후 컬럼**에서 발생합니다.

### 두 번째 이후 컬럼은 제네릭 배제 탐색

두 번째 이후 컬럼의 필터링은 "앞 컬럼이 같은 값인 구간" 안에서만 동작합니다. 이것이 핵심입니다.

앞 컬럼의 카디널리티가 **낮으면**, 같은 값이 연속되는 구간이 넓습니다. 넓은 구간 안에서 두 번째 컬럼이 정렬되어 있으므로, 두 번째 컬럼으로도 Granule을 효과적으로 건너뛸 수 있습니다.

앞 컬럼의 카디널리티가 **높으면**, 같은 값의 구간이 매우 좁습니다. 극단적으로 1 Granule 이하면, 두 번째 컬럼은 아무리 좋은 조건을 걸어도 추가로 건너뛸 Granule이 없습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 470" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="정렬 키 순서에 따른 데이터 물리 배치 차이. 위는 카디널리티가 낮은 status를 앞에 둬서 같은 값의 구간이 세 Granule에 걸치는 경우, 아래는 카디널리티가 높은 user_id를 앞에 둬서 구간이 한 Granule보다 좁아지는 경우">
<style>
.cd5-t { fill: var(--text, #1c1917); }
.cd5-m { fill: var(--text-muted, #78716c); }
.cd5-ok { fill: var(--text-success, #16a34a); }
.cd5-no { fill: var(--text-danger, #dc2626); }
.cd5-p { fill: var(--primary, #0d9488); }
.cd5-cell { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.cd5-seg { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0d9488); stroke-width: 2; }
.cd5-br { fill: none; stroke: var(--primary, #0d9488); stroke-width: 2; }
.cd5-div { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
</style>
<!-- 위 패널: 낮은 카디널리티 컬럼이 앞 -->
<text class="cd5-t" x="240" y="24" text-anchor="middle" font-size="19">위: ORDER BY (status, user_id)</text>
<text class="cd5-m" x="240" y="48" text-anchor="middle" font-size="17">status는 5종, user_id는 50,000종</text>
<rect class="cd5-seg" x="16" y="66" width="87" height="56" rx="5" />
<rect class="cd5-seg" x="105" y="66" width="87" height="56" rx="5" />
<rect class="cd5-seg" x="194" y="66" width="87" height="56" rx="5" />
<rect class="cd5-cell" x="283" y="66" width="87" height="56" rx="5" />
<rect class="cd5-cell" x="372" y="66" width="87" height="56" rx="5" />
<text class="cd5-t" x="59" y="90" text-anchor="middle" font-size="17">status=1</text>
<text class="cd5-t" x="148" y="90" text-anchor="middle" font-size="17">status=1</text>
<text class="cd5-t" x="237" y="90" text-anchor="middle" font-size="17">status=1</text>
<text class="cd5-t" x="326" y="90" text-anchor="middle" font-size="17">status=2</text>
<text class="cd5-t" x="415" y="90" text-anchor="middle" font-size="17">status=2</text>
<text class="cd5-m" x="59" y="112" text-anchor="middle" font-size="17">uid=100</text>
<text class="cd5-m" x="148" y="112" text-anchor="middle" font-size="17">uid=250</text>
<text class="cd5-m" x="237" y="112" text-anchor="middle" font-size="17">uid=400</text>
<text class="cd5-m" x="326" y="112" text-anchor="middle" font-size="17">uid=50</text>
<text class="cd5-m" x="415" y="112" text-anchor="middle" font-size="17">uid=180</text>
<text class="cd5-m" x="59" y="140" text-anchor="middle" font-size="17">G0</text>
<text class="cd5-m" x="148" y="140" text-anchor="middle" font-size="17">G1</text>
<text class="cd5-m" x="237" y="140" text-anchor="middle" font-size="17">G2</text>
<text class="cd5-m" x="326" y="140" text-anchor="middle" font-size="17">G3</text>
<text class="cd5-m" x="415" y="140" text-anchor="middle" font-size="17">G4</text>
<path class="cd5-br" d="M16 152 V164 H281 V152" />
<text class="cd5-p" x="148" y="190" text-anchor="middle" font-size="18">status=1 구간 = 3 Granule</text>
<text class="cd5-ok" x="240" y="218" text-anchor="middle" font-size="18">✓ 그 안에서 user_id로 추가 스킵</text>
<line class="cd5-div" x1="16" y1="244" x2="464" y2="244" />
<!-- 아래 패널: 높은 카디널리티 컬럼이 앞 -->
<text class="cd5-t" x="240" y="278" text-anchor="middle" font-size="19">아래: ORDER BY (user_id, status)</text>
<text class="cd5-m" x="240" y="302" text-anchor="middle" font-size="17">user_id 값이 거의 매 행 바뀜</text>
<rect class="cd5-seg" x="16" y="320" width="443" height="60" rx="5" />
<rect class="cd5-cell" x="24" y="328" width="82" height="44" rx="4" />
<rect class="cd5-cell" x="109" y="328" width="82" height="44" rx="4" />
<rect class="cd5-cell" x="194" y="328" width="82" height="44" rx="4" />
<rect class="cd5-cell" x="279" y="328" width="82" height="44" rx="4" />
<rect class="cd5-cell" x="364" y="328" width="82" height="44" rx="4" />
<text class="cd5-t" x="65" y="348" text-anchor="middle" font-size="17">uid=1</text>
<text class="cd5-t" x="150" y="348" text-anchor="middle" font-size="17">uid=2</text>
<text class="cd5-t" x="235" y="348" text-anchor="middle" font-size="17">uid=3</text>
<text class="cd5-t" x="320" y="348" text-anchor="middle" font-size="17">uid=4</text>
<text class="cd5-t" x="405" y="348" text-anchor="middle" font-size="17">uid=5</text>
<text class="cd5-m" x="65" y="368" text-anchor="middle" font-size="17">status=2</text>
<text class="cd5-m" x="150" y="368" text-anchor="middle" font-size="17">status=1</text>
<text class="cd5-m" x="235" y="368" text-anchor="middle" font-size="17">status=3</text>
<text class="cd5-m" x="320" y="368" text-anchor="middle" font-size="17">status=1</text>
<text class="cd5-m" x="405" y="368" text-anchor="middle" font-size="17">status=2</text>
<text class="cd5-p" x="240" y="404" text-anchor="middle" font-size="18">다섯 행 전부가 G0 하나에 들어감</text>
<text class="cd5-no" x="240" y="434" text-anchor="middle" font-size="18">✗ user_id 구간이 Granule보다 좁음</text>
<text class="cd5-m" x="240" y="458" text-anchor="middle" font-size="17">status로 건너뛸 Granule이 없음</text>
</svg>
</div>

단일 값 동등 조건(`WHERE status = 1 AND user_id = 12345`)에서는 두 설계 모두 첫 번째 컬럼의 바이너리 서치로 Granule을 크게 줄입니다. 하지만 범위 조건이 섞이거나 첫 번째 컬럼 없이 필터링할 때 차이가 벌어집니다. `WHERE status IN (1, 2) AND user_id BETWEEN 10000 AND 20000` 같은 쿼리에서 첫 번째 설계는 카디널리티가 낮은 `status`로 넓은 구간을 먼저 좁히고 그 안에서 `user_id` 범위를 추가로 걸러냅니다.

### 원칙 요약

:::info

**카디널리티 순서 원칙**

**낮은 카디널리티에서 높은 카디널리티** 순서로 배치합니다. 단, WHERE 절에 자주 등장하는 컬럼이 앞에 와야 합니다. 카디널리티가 낮아도 WHERE에 쓰이지 않는 컬럼을 앞에 두면 의미가 없습니다. ORDER BY 컬럼 수는 2~5개가 적당합니다. 그 이상이면 INSERT 성능이 저하됩니다.

:::

## 복합 키 설계 실전

### 쿼리 패턴 분석이 먼저다

ORDER BY를 결정하기 전에 반드시 해야 할 일이 있습니다. "이 테이블에 어떤 WHERE 조건이 걸리는가"를 파악하는 것입니다.

실제 프로젝트에서 한 테이블에 들어오는 쿼리를 분류하면 보통 세 종류입니다.

- **대시보드 쿼리**: 일별/주별 집계, 시간 범위 + 카테고리 필터. 실행 빈도 높음
- **알림/모니터링 쿼리**: 특정 이벤트 타입 + 최근 N분, 실행 빈도 매우 높음
- **Ad-hoc 분석**: 다양한 조건의 탐색적 쿼리, 실행 빈도 낮음

ORDER BY는 실행 빈도가 가장 높은 쿼리 패턴에 맞춰 설계합니다. 모든 쿼리를 하나의 ORDER BY로 최적화할 수는 없습니다.

### 이벤트 로그 테이블 설계 예시

웹 이벤트 로그 테이블을 설계한다고 합시다. 컬럼은 `event_date`, `user_id`, `event_type`, `url` 등입니다.

**패턴 A**: 대시보드가 주요 쿼리. "오늘 날짜에 event_type별 집계"를 가장 많이 실행한다면:

```sql
ORDER BY (event_type, event_date, user_id)
```

`event_type`(카디널리티 낮음)이 앞, `event_date`가 그 다음, `user_id`(카디널리티 높음)가 뒤. 대시보드의 `WHERE event_type = 'purchase' AND event_date = today()` 쿼리에 최적입니다.

**패턴 B**: 사용자별 행동 분석이 주요 쿼리. "특정 사용자의 최근 7일 이벤트"를 가장 많이 실행한다면:

```sql
ORDER BY (user_id, event_date, event_type)
```

`user_id`(동등 조건)를 앞에 두면 바이너리 서치로 해당 사용자의 구간을 정확히 찾고, 그 안에서 `event_date` 범위 필터가 적용됩니다. `event_date`를 앞에 두면 BETWEEN 범위 조건이 걸리면서 `user_id` 인덱스 효과가 줄어듭니다.

두 설계 중 어느 것이 "정답"인지는 쿼리 패턴에 달려 있습니다.

### 파생 컬럼 활용

DateTime 컬럼 대신 파생 컬럼을 ORDER BY에 넣으면 인덱스 엔트리 크기를 줄일 수 있습니다.

```sql
CREATE TABLE events
(
    created_at  DateTime,
    event_date  Date MATERIALIZED toDate(created_at),
    user_id     UInt64,
    event_type  LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (event_date, event_type, user_id);
```

`DateTime`(4바이트) 대신 `Date`(2바이트)가 인덱스에 들어가므로, Granule당 인덱스 엔트리 크기가 줄어듭니다. 인덱스 전체가 메모리에 상주하므로 크기 절감이 곧 메모리 절감입니다.

`ALIAS` 컬럼은 물리적으로 저장되지 않으므로 ORDER BY에 사용할 수 없습니다. `MATERIALIZED`는 물리적으로 저장되므로 가능합니다.

## ORDER BY 접두사 규칙

ORDER BY 설계에서 컬럼 순서가 중요한 근본적인 이유입니다.

### 접두사 필터링만 효과가 있다

`ORDER BY (a, b, c)`로 정의된 테이블에서 희소 인덱스는 `(a, b, c)` 순서의 정렬에 기반합니다. 따라서 인덱스가 효과를 발휘하려면 **접두사(prefix)** 순서로 필터링해야 합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 388" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="ORDER BY (a, b, c) 테이블에서 WHERE 조건별로 a, b, c 중 어떤 컬럼이 희소 인덱스에 쓰이는지 정리한 표. 접두사 조건만 인덱스를 타고, b나 c 단독 조건은 전체 스캔이 됩니다">
<style>
.pf5-t { fill: var(--text, #1c1917); }
.pf5-m { fill: var(--text-muted, #78716c); }
.pf5-p { fill: var(--primary, #0d9488); }
.pf5-d { fill: var(--text-danger, #dc2626); }
.pf5-use { fill: var(--primary, #0d9488); }
.pf5-no { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #dc2626); stroke-width: 1.2; }
.pf5-w { fill: var(--on-fill, #14100e); }
</style>
<text class="pf5-t" x="240" y="24" text-anchor="middle" font-size="19">ORDER BY (a, b, c) 테이블</text>
<!-- 열 머리글 -->
<text class="pf5-m" x="16" y="56" font-size="17">WHERE 조건</text>
<text class="pf5-m" x="321" y="56" text-anchor="middle" font-size="17">a</text>
<text class="pf5-m" x="367" y="56" text-anchor="middle" font-size="17">b</text>
<text class="pf5-m" x="413" y="56" text-anchor="middle" font-size="17">c</text>
<!-- 그룹 1: 접두사 조건 -->
<text class="pf5-p" x="16" y="86" font-size="18">접두사 조건: 인덱스 활용</text>
<text class="pf5-t" x="16" y="118" font-size="17">a = 1</text>
<rect class="pf5-use" x="300" y="98" width="42" height="30" rx="4" />
<rect class="pf5-no" x="346" y="98" width="42" height="30" rx="4" />
<rect class="pf5-no" x="392" y="98" width="42" height="30" rx="4" />
<text class="pf5-w" x="321" y="119" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-d" x="367" y="119" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="413" y="119" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-t" x="16" y="154" font-size="17">a = 1 AND b = 2</text>
<rect class="pf5-use" x="300" y="134" width="42" height="30" rx="4" />
<rect class="pf5-use" x="346" y="134" width="42" height="30" rx="4" />
<rect class="pf5-no" x="392" y="134" width="42" height="30" rx="4" />
<text class="pf5-w" x="321" y="155" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-w" x="367" y="155" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-d" x="413" y="155" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-t" x="16" y="190" font-size="17">a = 1 AND b = 2 AND c = 3</text>
<rect class="pf5-use" x="300" y="170" width="42" height="30" rx="4" />
<rect class="pf5-use" x="346" y="170" width="42" height="30" rx="4" />
<rect class="pf5-use" x="392" y="170" width="42" height="30" rx="4" />
<text class="pf5-w" x="321" y="191" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-w" x="367" y="191" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-w" x="413" y="191" text-anchor="middle" font-size="18">✓</text>
<!-- 그룹 2: 접두사가 아닌 조건 -->
<text class="pf5-d" x="16" y="226" font-size="18">접두사 아님: 거의 전체 스캔</text>
<text class="pf5-t" x="16" y="258" font-size="17">b = 2</text>
<rect class="pf5-no" x="300" y="238" width="42" height="30" rx="4" />
<rect class="pf5-no" x="346" y="238" width="42" height="30" rx="4" />
<rect class="pf5-no" x="392" y="238" width="42" height="30" rx="4" />
<text class="pf5-d" x="321" y="259" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="367" y="259" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="413" y="259" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-t" x="16" y="294" font-size="17">c = 3</text>
<rect class="pf5-no" x="300" y="274" width="42" height="30" rx="4" />
<rect class="pf5-no" x="346" y="274" width="42" height="30" rx="4" />
<rect class="pf5-no" x="392" y="274" width="42" height="30" rx="4" />
<text class="pf5-d" x="321" y="295" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="367" y="295" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="413" y="295" text-anchor="middle" font-size="18">✗</text>
<!-- 그룹 3: 중간이 빠진 조건 -->
<text class="pf5-t" x="16" y="330" font-size="18">중간이 빠짐: a까지만 활용</text>
<text class="pf5-t" x="16" y="362" font-size="17">a = 1 AND c = 3</text>
<rect class="pf5-use" x="300" y="342" width="42" height="30" rx="4" />
<rect class="pf5-no" x="346" y="342" width="42" height="30" rx="4" />
<rect class="pf5-no" x="392" y="342" width="42" height="30" rx="4" />
<text class="pf5-w" x="321" y="363" text-anchor="middle" font-size="18">✓</text>
<text class="pf5-d" x="367" y="363" text-anchor="middle" font-size="18">✗</text>
<text class="pf5-d" x="413" y="363" text-anchor="middle" font-size="18">✗</text>
</svg>
</div>

`WHERE b = 2`는 `(a, b, c)` 정렬에서 b 값이 흩어져 있으므로 바이너리 서치가 불가능합니다. ClickHouse의 제네릭 배제 탐색이 일부 Granule을 건너뛸 수는 있지만, 실질적으로는 전체 스캔에 가깝습니다.

### 범위 조건과 동등 조건

동등 조건(`=`)은 뒤 컬럼까지 인덱스 효과를 전파합니다. 하지만 범위 조건(`>`, `<`, `BETWEEN`)은 해당 컬럼에서 인덱스 효과가 멈춥니다.

```sql
-- a로 동등 → b까지 인덱스 전파
WHERE a = 1 AND b > 100
-- a가 정확히 1인 구간 안에서 b의 범위를 찾을 수 있음 ✅

-- a로 범위 → b 인덱스 효과 없음
WHERE a > 1 AND b = 100
-- a > 1인 구간이 넓어서 b가 정렬되어 있지 않음 ❌
```

이 규칙에서 실전 설계 지침이 나옵니다. **동등 조건에 자주 쓰이는 컬럼을 앞에, 범위 조건에 쓰이는 컬럼을 뒤에 배치합니다.**

예를 들어 `event_type = 'purchase' AND event_date BETWEEN '2026-05-01' AND '2026-05-31'` 쿼리가 주력이라면, `ORDER BY (event_type, event_date, ...)`가 `ORDER BY (event_date, event_type, ...)`보다 효율적입니다.

## 여러 쿼리 패턴이 충돌할 때

하나의 ORDER BY로 모든 쿼리를 최적화할 수 없을 때가 있습니다. 대시보드는 `(event_type, event_date)` 순서가 좋고, 사용자 분석은 `(user_id, event_date)` 순서가 좋다면? 세 가지 접근이 있습니다.

### Projection

Projection은 같은 데이터를 **다른 ORDER BY로 물리적으로 저장**하는 기능입니다. 원본 테이블의 "숨겨진 사본"이라고 생각하면 됩니다.

```sql
CREATE TABLE events
(
    event_date  Date,
    user_id     UInt64,
    event_type  LowCardinality(String),
    url         String
)
ENGINE = MergeTree()
ORDER BY (event_type, event_date, user_id);

ALTER TABLE events ADD PROJECTION user_lookup
(
    SELECT * ORDER BY (user_id, event_date)
);

-- 기존 데이터에 Projection 적용
ALTER TABLE events MATERIALIZE PROJECTION user_lookup;
```

`event_type` 기반 쿼리는 원본 ORDER BY를 쓰고, `user_id` 기반 쿼리는 `user_lookup` Projection을 씁니다. ClickHouse가 쿼리를 분석해서 더 적합한 쪽을 자동으로 선택합니다.

대신 비용이 있습니다. 저장 공간이 Projection당 거의 2배, INSERT도 Projection마다 추가 정렬과 쓰기를 해야 하므로 느려집니다.

### Materialized View

Materialized View는 다른 ORDER BY의 **독립된 테이블**을 만들고, 원본에 INSERT가 들어올 때마다 자동으로 데이터를 넣어줍니다.

```sql
-- 사용자별 조회용 테이블
CREATE TABLE events_by_user
(
    event_date  Date,
    user_id     UInt64,
    event_type  LowCardinality(String),
    url         String
)
ENGINE = MergeTree()
ORDER BY (user_id, event_date);

-- 원본 INSERT 시 자동 동기화
CREATE MATERIALIZED VIEW events_to_user_mv
TO events_by_user
AS SELECT * FROM events;
```

Projection과 달리 완전히 독립된 테이블이므로 TTL, 엔진 타입, 파티셔닝을 별도로 설정할 수 있습니다. 더 유연하지만, 두 테이블을 관리해야 하는 복잡도가 추가됩니다.

### 데이터 스키핑 인덱스

ORDER BY를 보완하는 보조 인덱스입니다. `minmax`, `set`, `bloom_filter` 등의 타입이 있습니다.

```sql
ALTER TABLE events ADD INDEX idx_url url TYPE bloom_filter GRANULARITY 4;
ALTER TABLE events MATERIALIZE INDEX idx_url;
```

주의할 점이 있습니다. 데이터 스키핑 인덱스는 **필터링 대상 값이 소수의 Granule에 집중되어 있을 때** 효과가 있습니다. ORDER BY에 의한 정렬과 상관관계가 높으면 자연스럽게 이 조건이 충족됩니다. 반면 검색하는 특정 `url` 값이 대부분의 Granule에 존재한다면, `bloom_filter`를 달아도 스킵할 Granule이 거의 없습니다. 반대로 특정 값이 소수 Granule에만 존재하면 전체 분포와 무관하게 효과적입니다. 인덱스 타입에 따라 효과가 다르므로(minmax는 정렬 의존도가 높고, bloom_filter는 값 분포에 더 의존), 맹목적으로 추가하면 비용만 늘어납니다.

데이터 스키핑 인덱스는 ORDER BY를 대체하지 않습니다. 정렬 키를 먼저 확정하고, 그것으로 좁혀지지 않는 쿼리 패턴에 한해 보조 수단으로 붙이는 것이 순서입니다.

## 변종 엔진에서의 ORDER BY 설계

[변종 엔진](/clickhouse/mergetree-variants/)에서 ORDER BY는 단순한 정렬 키가 아닙니다. 엔진의 머지 로직이 ORDER BY에 의존합니다.

| 엔진 | ORDER BY의 의미 | 설계 시 고려사항 |
|------|----------------|----------------|
| ReplacingMergeTree | 중복 제거 키 | 비즈니스 유니크 키를 반드시 포함 |
| SummingMergeTree | GROUP BY 차원 | 집계 차원(날짜, 카테고리 등) |
| AggregatingMergeTree | 집계 차원 키 | 집계 차원 + 필요한 모든 GROUP BY 컬럼 |
| CollapsingMergeTree | 상쇄 매칭 키 | 엔티티 식별자(order_id 등) |

변종 엔진에서는 쿼리 성능과 머지 로직을 동시에 고려해야 합니다. 기본 MergeTree에서는 "쿼리에 가장 좋은 ORDER BY"를 고르면 되지만, 변종 엔진에서는 "머지 로직이 올바르게 동작하는 ORDER BY" 안에서 쿼리 성능을 최적화해야 합니다.

잘못된 예를 하나 봅시다.

```sql
-- ❌ 잘못된 설계
CREATE TABLE orders
(...)
ENGINE = ReplacingMergeTree(ver)
ORDER BY (category, order_id);
```

`category = '전자제품'`인 `order_id = 100`과 `category = '의류'`인 `order_id = 100`은 ORDER BY 키가 다르므로 **다른 행으로 취급**됩니다. 같은 주문이라도 카테고리가 변경되면 중복이 제거되지 않습니다.

```sql
-- ✅ 올바른 설계: 유니크 키만으로 ORDER BY
ORDER BY order_id;
```

`ORDER BY (order_id, category)`처럼 category를 추가하면, category가 변경된 경우 같은 order_id라도 다른 행으로 취급됩니다. ReplacingMergeTree에서는 비즈니스 유니크 키만으로 ORDER BY를 구성하는 것이 안전합니다. 쿼리 성능을 위해 컬럼을 추가해야 한다면, 해당 컬럼의 값이 같은 유니크 키에 대해 절대 변하지 않는 경우에만 가능합니다.

## 실험: Docker로 직접 확인하기

[Docker로 띄운 ClickHouse](/clickhouse/why-clickhouse/)(`ch-test` 컨테이너)에서 확인합니다.

### 실험 1: 카디널리티 순서에 따른 Granule 스킵 차이

같은 분포의 데이터로 ORDER BY 순서만 다른 두 테이블을 만들고, 같은 쿼리의 Granule 스킵 차이를 확인합니다.

```sql
-- 테이블 1: 낮은 카디널리티 → 높은 카디널리티
CREATE TABLE events_status_first
(
    status    UInt8,
    user_id   UInt64,
    value     UInt32
)
ENGINE = MergeTree()
ORDER BY (status, user_id);

-- 테이블 2: 높은 카디널리티 → 낮은 카디널리티
CREATE TABLE events_user_first
(
    status    UInt8,
    user_id   UInt64,
    value     UInt32
)
ENGINE = MergeTree()
ORDER BY (user_id, status);
```

10만 행을 넣습니다. `status`는 1~5, `user_id`는 1~50,000 범위입니다.

```sql
INSERT INTO events_status_first
SELECT
    (rand() % 5) + 1,
    (rand() % 50000) + 1,
    rand() % 10000
FROM numbers(100000);

INSERT INTO events_user_first
SELECT
    (rand() % 5) + 1,
    (rand() % 50000) + 1,
    rand() % 10000
FROM numbers(100000);
```

같은 조건으로 `EXPLAIN`을 실행합니다.

```sql
EXPLAIN indexes = 1
SELECT count() FROM events_status_first
WHERE status = 1 AND user_id = 12345;
```

```text
┌─explain──────────────────────────────────────┐
│ Expression ((Project names + Projection))    │
│   Aggregating                                │
│     Expression (Before GROUP BY)             │
│       ReadFromMergeTree                      │
│       Indexes:                               │
│         PrimaryKey                           │
│           Keys: status, user_id              │
│           Condition: and(...)                │
│           Parts: 1/1                         │
│           Granules: 1/13                     │ ← 13개 중 1개만 읽음
└──────────────────────────────────────────────┘
```

```sql
EXPLAIN indexes = 1
SELECT count() FROM events_user_first
WHERE status = 1 AND user_id = 12345;
```

```text
┌─explain──────────────────────────────────────┐
│ Expression ((Project names + Projection))    │
│   Aggregating                                │
│     Expression (Before GROUP BY)             │
│       ReadFromMergeTree                      │
│       Indexes:                               │
│         PrimaryKey                           │
│           Keys: user_id                      │
│           Condition: ...                     │
│           Parts: 1/1                         │
│           Granules: 1/13                     │ ← 비슷하게 1개
└──────────────────────────────────────────────┘
```

`user_id = 12345`라는 정확한 값으로 필터링하면 두 경우 모두 1 Granule까지 좁혀집니다. 두 번째 테이블의 EXPLAIN에서 `Keys: user_id`만 표시된 것을 주목하세요. `status`도 WHERE에 있지만, `user_id`(첫 번째 컬럼)의 카디널리티가 워낙 높아서 이미 1 Granule로 좁혀졌기 때문에 `status`로 추가 스킵할 여지가 없습니다. ClickHouse는 실제로 인덱스 효과가 있는 컬럼만 Keys에 표시합니다.

하지만 범위 쿼리에서 차이가 드러납니다.

```sql
-- status 범위 + user_id 범위
EXPLAIN indexes = 1
SELECT count() FROM events_status_first
WHERE status IN (1, 2) AND user_id BETWEEN 10000 AND 20000;
```

```text
│           Granules: 3/13                     │ ← 3개만 읽음
```

```sql
EXPLAIN indexes = 1
SELECT count() FROM events_user_first
WHERE status IN (1, 2) AND user_id BETWEEN 10000 AND 20000;
```

```text
│           Granules: 4/13                     │ ← 4개 읽음
```

`status`(카디널리티 5)를 앞에 둔 테이블이 범위 쿼리에서 더 적은 Granule을 읽습니다. 데이터가 커질수록 이 차이는 벌어집니다.

### 실험 2: 접두사 규칙 확인

`ORDER BY (a, b, c)` 테이블에서 접두사가 아닌 컬럼으로 필터링하면 어떤 일이 일어나는지 확인합니다.

```sql
CREATE TABLE prefix_test
(
    a UInt8,
    b UInt16,
    c UInt32,
    value UInt32
)
ENGINE = MergeTree()
ORDER BY (a, b, c);

INSERT INTO prefix_test
SELECT
    rand() % 10,
    rand() % 1000,
    rand() % 100000,
    rand()
FROM numbers(500000);
```

```sql
-- 접두사 컬럼 필터링
EXPLAIN indexes = 1
SELECT count() FROM prefix_test WHERE a = 5;
```

```text
│           Keys: a                            │
│           Granules: 7/62                     │ ← 62개 중 7개
```

```sql
-- 비접두사 컬럼 필터링
EXPLAIN indexes = 1
SELECT count() FROM prefix_test WHERE b = 500;
```

```text
│           Granules: 62/62                    │ ← 전체 스캔
```

```sql
-- 접두사 + 비접두사 조합
EXPLAIN indexes = 1
SELECT count() FROM prefix_test WHERE a = 5 AND b = 500;
```

```text
│           Keys: a, b                         │
│           Granules: 1/62                     │ ← 1개
```

세 쿼리가 읽는 Granule 수를 실제 비율대로 그리면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 325" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="전체 62개 Granule 중 세 쿼리가 각각 읽는 Granule 수를 비율대로 그린 막대. a는 7개, b 단독은 62개 전부, a와 b를 함께 걸면 1개만 읽습니다">
<defs>
<pattern id="gr5Tick" width="7.2258" height="34" patternUnits="userSpaceOnUse">
<line x1="7.2258" y1="0" x2="7.2258" y2="34" stroke="var(--bg, #fafaf8)" stroke-width="1" />
</pattern>
</defs>
<style>
.gr5-t { fill: var(--text, #1c1917); }
.gr5-m { fill: var(--text-muted, #78716c); }
.gr5-read { fill: var(--text-danger, #dc2626); }
.gr5-skip { fill: var(--bg-success, #f0fdf4); }
.gr5-out { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.gr5-sw { stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
</style>
<!-- 범례 -->
<rect class="gr5-read" x="16" y="10" width="18" height="18" rx="3" />
<text class="gr5-m" x="42" y="25" font-size="17">읽은 Granule</text>
<rect class="gr5-skip gr5-sw" x="180" y="10" width="18" height="18" rx="3" />
<text class="gr5-m" x="206" y="25" font-size="17">건너뛴 Granule</text>
<!-- 1. 접두사 컬럼 단독 -->
<text class="gr5-t" x="16" y="62" font-size="18">WHERE a = 5 → 7 / 62 Granule</text>
<rect class="gr5-skip" x="16" y="72" width="448" height="34" rx="3" />
<rect class="gr5-read" x="16" y="72" width="50.6" height="34" />
<rect x="16" y="72" width="448" height="34" fill="url(#gr5Tick)" />
<rect class="gr5-out" x="16" y="72" width="448" height="34" rx="3" />
<!-- 2. 비접두사 컬럼 단독 -->
<text class="gr5-t" x="16" y="146" font-size="18">WHERE b = 500 → 62 / 62 Granule</text>
<rect class="gr5-skip" x="16" y="156" width="448" height="34" rx="3" />
<rect class="gr5-read" x="16" y="156" width="448" height="34" rx="3" />
<rect x="16" y="156" width="448" height="34" fill="url(#gr5Tick)" />
<rect class="gr5-out" x="16" y="156" width="448" height="34" rx="3" />
<!-- 3. 접두사 + 후행 컬럼 -->
<text class="gr5-t" x="16" y="230" font-size="18">WHERE a = 5 AND b = 500 → 1 / 62</text>
<rect class="gr5-skip" x="16" y="240" width="448" height="34" rx="3" />
<rect class="gr5-read" x="16" y="240" width="7.2" height="34" />
<rect x="16" y="240" width="448" height="34" fill="url(#gr5Tick)" />
<rect class="gr5-out" x="16" y="240" width="448" height="34" rx="3" />
<text class="gr5-m" x="240" y="306" text-anchor="middle" font-size="17">전체 62 Granule (500,000행 ÷ 8,192)</text>
</svg>
</div>

`WHERE b = 500` 단독으로는 62개 Granule을 전부 읽어야 합니다. 하지만 `WHERE a = 5 AND b = 500`으로 접두사를 포함하면 1개까지 줄어듭니다.

## 흔한 실수 바로잡기

### 실수 1: 고카디널리티 컬럼을 맨 앞에

```sql
-- ❌ UUID를 첫 번째로
ORDER BY (request_id, event_date, event_type)
```

`request_id`(UUID)는 사실상 행마다 다릅니다. 첫 번째 컬럼이 모든 Granule에 유니크한 값을 가지므로, `event_date`와 `event_type`은 인덱스 효과를 전혀 얻지 못합니다. 게다가 같은 값이 연속되지 않으므로 압축률도 크게 떨어집니다.

`request_id`로 검색할 일이 거의 없다면 ORDER BY에서 빼는 것이 맞습니다.

### 실수 2: 컬럼이 너무 많다

```sql
-- ❌ 7개 컬럼
ORDER BY (date, region, category, sub_category, brand, product_id, user_id)
```

ORDER BY 컬럼이 많을수록 INSERT 시 정렬 비용이 증가하고, `primary.idx` 크기도 커집니다. 실제로 5개 이상의 컬럼이 동시에 WHERE 절에 등장하는 쿼리는 드뭅니다. 가장 빈번한 쿼리의 WHERE 패턴에 맞춰 2~4개로 줄이는 것이 좋습니다.

### 실수 3: RDB식 사고로 Unique Constraint 기대

```sql
-- ❌ 중복 방지를 기대하며 PRIMARY KEY 설정
CREATE TABLE users (user_id UInt64, name String)
ENGINE = MergeTree()
ORDER BY user_id;

-- 같은 user_id를 두 번 INSERT해도 에러 없이 저장됨!
```

ClickHouse의 PRIMARY KEY는 정렬과 인덱싱을 위한 것이지, 유니크 제약이 아닙니다. 중복 제거가 필요하면 [ReplacingMergeTree](/clickhouse/mergetree-variants/) + `FINAL` 패턴을 사용합니다.

## 마치며

ORDER BY는 ClickHouse에서 가장 레버리지가 높은 설계 결정입니다. 데이터의 물리적 정렬, 희소 인덱스의 키, 변종 엔진의 동작 키를 모두 결정합니다. 한번 정하면 사실상 바꾸기 어려우므로, 쿼리 패턴을 먼저 분석하고 카디널리티 순서와 접두사 규칙을 고려해서 결정해야 합니다.

하나의 ORDER BY로 모든 쿼리를 최적화할 수는 없습니다. 남는 패턴은 Projection, Materialized View, 데이터 스키핑 인덱스로 보완하되, 각각이 저장 공간과 INSERT 비용을 얼마나 더 요구하는지를 함께 계산한 뒤에 붙여야 합니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse Best Practices: Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)
- [ClickHouse 공식 가이드: A Practical Introduction to Sparse Primary Indexes](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)
- [Altinity Knowledge Base: Pick ORDER BY / PRIMARY KEY / PARTITION BY](https://kb.altinity.com/engines/mergetree-table-engine-family/pick-keys/)
