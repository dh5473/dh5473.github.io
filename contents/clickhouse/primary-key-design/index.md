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

RDB에서는 테이블을 먼저 만들고, 성능이 필요한 쿼리에 맞춰 `CREATE INDEX`를 추가합니다. 인덱스는 테이블과 별개의 구조물입니다. ClickHouse는 다릅니다. `CREATE TABLE`의 `ORDER BY` 절이 곧 데이터의 물리적 정렬 순서이고, 동시에 [희소 인덱스](/clickhouse/mergetree-internals/)의 키입니다. 별도의 인덱스 생성 명령이 없습니다.

<br>

[지난 글](/clickhouse/mergetree-variants/)에서 네 가지 변종 엔진 모두 ORDER BY 키가 핵심 동작을 결정한다는 것을 확인했습니다. 이 글에서는 한 단계 더 나아가, ORDER BY 키를 어떻게 설계해야 하는지를 체계적으로 다룹니다.

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

이 패턴은 AggregatingMergeTree에서 유용합니다. 인덱스 크기를 줄이면서도 머지 로직에 필요한 넓은 정렬 키를 유지할 수 있기 때문입니다.

### RDB와의 결정적 차이

[두 번째 글](/clickhouse/mergetree-internals/)에서 다뤘지만 다시 강조합니다. ClickHouse의 PRIMARY KEY는 **유니크 제약(Unique Constraint)이 아닙니다.** 같은 PRIMARY KEY 값을 가진 행이 여러 개 있어도 아무 에러 없이 저장됩니다. ClickHouse에서 PRIMARY KEY는 "이 순서로 정렬하고, 이 값으로 인덱스를 만들겠다"는 선언일 뿐입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  ORDER BY는 테이블 생성 시 결정됩니다. <code>ALTER TABLE MODIFY ORDER BY</code>로 컬럼을 추가할 수는 있지만, 새로 추가하는 컬럼만 가능하고 기존 컬럼 순서를 바꾸거나 제거하는 것은 불가능합니다. 사실상 가장 레버리지 높은 설계 결정이므로, 쿼리 패턴을 분석한 뒤 신중하게 정해야 합니다.
</div>

## 카디널리티 순서의 원칙

ORDER BY 설계에서 가장 중요한 규칙은 컬럼의 카디널리티(cardinality, 고유 값의 수) 순서입니다.

### 첫 번째 컬럼은 바이너리 서치

[두 번째 글](/clickhouse/mergetree-internals/)에서 다뤘듯이, 희소 인덱스 탐색에서 첫 번째 컬럼은 바이너리 서치(binary search)로 찾습니다. O(log₂ n)이므로 카디널리티가 100이든 1억이든 효율적입니다. 첫 번째 컬럼의 카디널리티는 인덱스 탐색 성능 자체에는 큰 영향을 미치지 않습니다.

문제는 **두 번째 이후 컬럼**에서 발생합니다.

### 두 번째 이후 컬럼은 제네릭 배제 탐색

두 번째 이후 컬럼의 필터링은 "앞 컬럼이 같은 값인 구간" 안에서만 동작합니다. 이것이 핵심입니다.

앞 컬럼의 카디널리티가 **낮으면**, 같은 값이 연속되는 구간이 넓습니다. 넓은 구간 안에서 두 번째 컬럼이 정렬되어 있으므로, 두 번째 컬럼으로도 Granule을 효과적으로 건너뛸 수 있습니다.

앞 컬럼의 카디널리티가 **높으면**, 같은 값의 구간이 매우 좁습니다. 극단적으로 1 Granule 이하면, 두 번째 컬럼은 아무리 좋은 조건을 걸어도 추가로 건너뛸 Granule이 없습니다.

```
ORDER BY (status, user_id)  — status 카디널리티: 5
┌──────────────────────────────────────────────────────┐
│ status=1 │ status=1 │ status=1 │ status=2 │ status=2 │ ...
│ uid=100  │ uid=250  │ uid=400  │ uid=50   │ uid=180  │
│ (G0)     │ (G1)     │ (G2)     │ (G3)     │ (G4)     │
└──────────────────────────────────────────────────────┘
→ status=1인 구간이 3개 Granule에 걸침
→ 그 안에서 user_id 필터링으로 추가 스킵 가능


ORDER BY (user_id, status)  — user_id 카디널리티: 100,000+
┌──────────────────────────────────────────────────────┐
│ uid=1    │ uid=2    │ uid=3    │ uid=4    │ uid=5    │ ...
│ status=2 │ status=1 │ status=3 │ status=1 │ status=2 │
│ (G0)     │ (G0)     │ (G0)     │ (G0)     │ (G0)     │
└──────────────────────────────────────────────────────┘
→ user_id 하나당 행이 적어서 같은 Granule 안에 여러 user_id가 섞임
→ status 필터링으로 추가 스킵할 Granule이 없음
```

단일 값 동등 조건(`WHERE status = 1 AND user_id = 12345`)에서는 두 설계 모두 첫 번째 컬럼의 바이너리 서치로 Granule을 크게 줄입니다. 하지만 범위 조건이 섞이거나 첫 번째 컬럼 없이 필터링할 때 차이가 벌어집니다. `WHERE status IN (1, 2) AND user_id BETWEEN 10000 AND 20000` 같은 쿼리에서 첫 번째 설계는 카디널리티가 낮은 `status`로 넓은 구간을 먼저 좁히고 그 안에서 `user_id` 범위를 추가로 걸러냅니다.

### 원칙 요약

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 카디널리티 순서 원칙</strong><br>
  <strong>낮은 카디널리티 → 높은 카디널리티</strong> 순서로 배치합니다. 단, WHERE 절에 자주 등장하는 컬럼이 앞에 와야 합니다. 카디널리티가 낮아도 WHERE에 쓰이지 않는 컬럼을 앞에 두면 의미가 없습니다. ORDER BY 컬럼 수는 2~5개가 적당합니다. 그 이상이면 INSERT 성능이 저하됩니다.
</div>

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

```
ORDER BY (a, b, c) 테이블에서:

WHERE a = 1              → a로 바이너리 서치  ✅ 인덱스 활용
WHERE a = 1 AND b = 2    → a, b 모두 활용     ✅✅ 최대 효과
WHERE a = 1 AND b = 2 AND c = 3 → 전부 활용   ✅✅✅

WHERE b = 2              → 접두사 아님         ❌ 거의 전체 스캔
WHERE c = 3              → 접두사 아님         ❌ 거의 전체 스캔
WHERE a = 1 AND c = 3    → a만 활용, c는 무시  ✅❌ (a까지만)
```

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

주의할 점이 있습니다. 데이터 스키핑 인덱스는 **필터링 대상 값이 소수의 Granule에 집중되어 있을 때** 효과가 있습니다. ORDER BY에 의한 정렬과 상관관계가 높으면 자연스럽게 이 조건이 충족됩니다. 반면 `url` 같은 값이 모든 Granule에 골고루 분포해 있다면, `bloom_filter`를 달아도 스킵할 Granule이 거의 없습니다. 인덱스 타입에 따라 효과가 다르므로(minmax는 정렬 의존도가 높고, bloom_filter는 값 분포에 더 의존), 맹목적으로 추가하면 비용만 늘어납니다.

데이터 스키핑 인덱스와 Projection의 상세한 사용법은 다음 글에서 파티셔닝과 함께 다룹니다.

## 변종 엔진에서의 ORDER BY 설계

[이전 글](/clickhouse/mergetree-variants/)에서 다뤘듯이, 변종 엔진에서 ORDER BY는 단순한 정렬 키가 아닙니다. 엔진의 머지 로직이 ORDER BY에 의존합니다.

| 엔진 | ORDER BY의 의미 | 설계 시 고려사항 |
|------|----------------|----------------|
| ReplacingMergeTree | 중복 제거 키 | 비즈니스 유니크 키를 반드시 포함 |
| SummingMergeTree | GROUP BY 차원 | 집계 차원(날짜, 카테고리 등) |
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

[첫 번째 글](/clickhouse/why-clickhouse/)의 Docker 환경(`ch-test` 컨테이너)을 사용합니다.

### 실험 1: 카디널리티 순서에 따른 Granule 스킵 차이

동일한 데이터로 ORDER BY 순서만 다른 두 테이블을 만들고, 같은 쿼리의 Granule 스킵 차이를 확인합니다.

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

```
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

```
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

```
│           Granules: 3/13                     │ ← 3개만 읽음
```

```sql
EXPLAIN indexes = 1
SELECT count() FROM events_user_first
WHERE status IN (1, 2) AND user_id BETWEEN 10000 AND 20000;
```

```
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

```
│           Keys: a                            │
│           Granules: 7/62                     │ ← 62개 중 7개
```

```sql
-- 비접두사 컬럼 필터링
EXPLAIN indexes = 1
SELECT count() FROM prefix_test WHERE b = 500;
```

```
│           Granules: 62/62                    │ ← 전체 스캔
```

```sql
-- 접두사 + 비접두사 조합
EXPLAIN indexes = 1
SELECT count() FROM prefix_test WHERE a = 5 AND b = 500;
```

```
│           Keys: a, b                         │
│           Granules: 1/62                     │ ← 1개
```

`WHERE b = 500` 단독으로는 62개 Granule을 전부 읽어야 합니다. 하지만 `WHERE a = 5 AND b = 500`으로 접두사를 포함하면 1개까지 줄어듭니다. 접두사 규칙의 효과가 명확하게 드러납니다.

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

하나의 ORDER BY로 모든 쿼리를 최적화할 수는 없습니다. 다음 글에서는 파티셔닝, 데이터 스키핑 인덱스, Projection이 ORDER BY를 어떻게 보완하는지를 다룹니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse Best Practices: Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)
- [ClickHouse 공식 가이드: A Practical Introduction to Sparse Primary Indexes](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)
- [Altinity Knowledge Base: Pick ORDER BY / PRIMARY KEY / PARTITION BY](https://kb.altinity.com/engines/mergetree-table-engine-family/pick-keys/)
