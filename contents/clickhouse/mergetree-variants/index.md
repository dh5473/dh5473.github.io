---
date: '2026-05-21'
title: 'MergeTree 변종 엔진: Replacing, Summing, Aggregating, Collapsing'
category: 'Database'
series: 'clickhouse'
seriesOrder: 4
tags: ['ClickHouse', 'MergeTree', 'ReplacingMergeTree', 'SummingMergeTree', 'AggregatingMergeTree']
summary: '기본 MergeTree의 머지는 데이터를 합칠 뿐이지만, 변종 엔진들은 머지 과정에 중복 제거, 합산, 집계, 상쇄 로직을 끼워 넣습니다. 네 가지 변종의 설계 동기와 동작 차이를 Docker 실험으로 확인합니다.'
thumbnail: './thumbnail.png'
---

[지난 글](/clickhouse/merge-and-mutation/)에서 기본 MergeTree의 머지는 Part를 합칠 뿐이라고 했습니다. 중복을 제거하지도, 값을 집계하지도 않습니다. 그렇다면 CDC 파이프라인에서 같은 주문이 두 번 들어오면 어떻게 될까요? 기본 MergeTree에서는 두 행이 영원히 남습니다. [뮤테이션](/clickhouse/merge-and-mutation/)으로 지울 수는 있지만, Part 전체를 재작성해야 합니다.

주문 상태가 "접수"에서 "배송중"으로 바뀔 때도 마찬가지입니다. 불변 Part에 UPDATE를 하려면 뮤테이션이 필요하고, 이것은 비상 도구이지 일상적 연산이 아닙니다.

<br>

이런 요구사항을 머지 과정 자체에서 해결하는 것이 MergeTree 변종 엔진들입니다. 이 글에서는 ReplacingMergeTree, SummingMergeTree, AggregatingMergeTree, CollapsingMergeTree가 각각 머지 시점에 어떤 추가 로직을 수행하는지, 그리고 그 한계가 무엇인지를 다룹니다.

## 머지에 로직을 끼워 넣는다는 것

[지난 글](/clickhouse/merge-and-mutation/)에서 본 기본 MergeTree의 머지를 복습합시다. 백그라운드 스레드가 같은 파티션 내의 Part들을 선택하고, `ORDER BY` 순서로 merge-sort하여 하나의 새 Part를 만듭니다. 이것이 전부입니다. 데이터는 합쳐질 뿐, 내용이 변하지 않습니다.

변종 엔진은 이 merge-sort 과정에 한 단계를 추가합니다. 정렬하면서 **같은 ORDER BY 키를 가진 행들이 만나면**, 엔진별로 정해진 로직을 실행합니다.

```
기본 MergeTree 머지:

Part A ─┐
        ├─ merge-sort ──────────────────▶ Part C
Part B ─┘
         (데이터 그대로 합침)


변종 엔진 머지:

Part A ─┐
        ├─ merge-sort ─▶ [추가 로직] ──▶ Part C
Part B ─┘                    │
                             ▼
                  같은 ORDER BY 키의 행이 만나면:
                    Replacing  → 최신 버전만 유지
                    Summing    → 숫자 컬럼 합산
                    Aggregating → 집계 상태 병합
                    Collapsing → +1/-1 쌍 상쇄
```

여기서 반드시 기억해야 할 전제가 하나 있습니다. **이 추가 로직은 머지 시점에만 동작합니다.** INSERT할 때는 아무 일도 일어나지 않습니다. 머지가 일어나기 전까지 "중간 상태"(중복 행, 미합산 행, 상쇄되지 않은 +1/-1 쌍)가 그대로 존재합니다.

따라서 네 엔진 모두에 공통되는 실무 규칙이 있습니다. **쿼리 시 중간 상태를 올바르게 처리하는 것은 사용자의 책임입니다.** 이것을 모르면 "분명 ReplacingMergeTree인데 왜 중복이 보이지?"라는 함정에 빠집니다. 각 엔진의 처리 패턴을 섹션마다 다룹니다.

## ReplacingMergeTree

### 문제: 같은 키의 중복 행

CDC(Change Data Capture)로 외부 DB의 변경을 ClickHouse로 동기화하거나, 장애 복구 후 데이터를 재처리하면 같은 `order_id`를 가진 행이 여러 번 INSERT될 수 있습니다. 기본 MergeTree에서는 ORDER BY 키가 같은 행이 여러 개 존재해도 아무 문제 없이 전부 저장합니다. Primary Key가 유니크 제약이 아니기 때문입니다.

중복을 제거하려면? [지난 글](/clickhouse/merge-and-mutation/)에서 봤듯이 `ALTER TABLE DELETE`로 뮤테이션을 실행할 수 있지만, 이것은 Part 전체를 재작성하는 무거운 연산입니다. 정기적으로 중복이 들어오는 환경에서는 현실적이지 않습니다.

### ORDER BY 키 기준 중복 제거

ReplacingMergeTree는 머지 시점에 같은 ORDER BY 키를 가진 행 중 하나만 남기고 나머지를 삭제합니다.

```sql
CREATE TABLE orders_replacing
(
    order_id    UInt64,
    ver         UInt32,
    status      LowCardinality(String),
    price       UInt32
)
ENGINE = ReplacingMergeTree(ver)
ORDER BY order_id;
```

`ReplacingMergeTree(ver)`에서 `ver`은 버전 컬럼입니다. 같은 `order_id`를 가진 행이 여러 개 있으면, `ver` 값이 가장 큰 행 하나만 살아남습니다. `ver`을 지정하지 않으면 같은 키의 행 중 마지막에 INSERT된 행(Part 내 순서 기준)이 남습니다.

```
Part A                    Part B                    머지 결과
┌────────┬───┬─────┐     ┌────────┬───┬─────┐     ┌────────┬───┬─────┐
│order_id│ver│price│     │order_id│ver│price│     │order_id│ver│price│
├────────┼───┼─────┤     ├────────┼───┼─────┤     ├────────┼───┼─────┤
│   1    │ 1 │ 100 │     │   1    │ 2 │ 200 │     │   1    │ 2 │ 200 │ ← ver=2
│   2    │ 1 │ 300 │     │   3    │ 1 │ 400 │     │   2    │ 1 │ 300 │
└────────┴───┴─────┘     └────────┴───┴─────┘     │   3    │ 1 │ 400 │
                                                   └────────┴───┴─────┘
```

`order_id = 1`이 두 Part에 각각 존재했지만, 머지 후에는 `ver = 2`인 행만 남습니다.

### FINAL 키워드와 그 한계

머지가 아직 일어나지 않았다면? 서로 다른 Part에 있는 중복 행은 머지 전까지 모두 보입니다.

```sql
-- 머지 전: order_id=1이 두 행 보임
SELECT * FROM orders_replacing ORDER BY order_id;

-- FINAL: 쿼리 시점에 중복 제거
SELECT * FROM orders_replacing FINAL ORDER BY order_id;
```

`FINAL`을 붙이면 쿼리 실행 시점에 머지와 동일한 로직을 적용해서 결과를 반환합니다. 물리적 머지는 하지 않고 "읽기 전용 머지"를 한다고 생각하면 됩니다.

대신 비용이 있습니다. 모든 Part를 읽어서 키별로 중복을 제거하므로, 데이터가 많을수록 쿼리가 느려집니다. `FINAL` 없이 동일한 효과를 얻으려면 `argMax` 패턴을 사용합니다.

```sql
SELECT
    order_id,
    argMax(status, ver) AS status,
    argMax(price, ver) AS price
FROM orders_replacing
GROUP BY order_id;
```

`argMax(status, ver)`는 "ver이 가장 큰 행의 status"를 반환합니다. GROUP BY와 함께 사용하면 FINAL 없이도 최신 버전만 조회할 수 있습니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  ReplacingMergeTree는 머지 시점에만 중복을 제거합니다. 머지는 백그라운드에서 비동기로 일어나므로, <code>FINAL</code> 없이 SELECT하면 같은 ORDER BY 키의 행이 여러 개 보일 수 있습니다. "중복 없는 결과"가 필요하면 반드시 <code>FINAL</code>을 사용하거나 <code>argMax</code> 패턴을 적용하세요.
</div>

한 가지 더. `FINAL`은 **같은 파티션 내에서만** 중복을 제거합니다. 같은 `order_id`가 서로 다른 파티션에 들어갔다면, `FINAL`을 써도 중복이 남습니다. 파티셔닝 전략이 ReplacingMergeTree의 동작에 직접 영향을 미치는 것입니다. 이 부분은 [#6(파티셔닝과 보조 인덱스)](/clickhouse/partitioning-and-indices/)에서 다룹니다.

## SummingMergeTree

### 문제: 선집계가 필요한 대량 데이터

이벤트 로그 테이블에 하루 수억 건이 쌓인다고 합시다. "카테고리별 일별 매출 합계"를 매번 원본 테이블에서 `GROUP BY`로 구하면, 수억 행을 읽어야 합니다. 대시보드가 이 쿼리를 매 분마다 실행한다면 서버에 상당한 부하가 걸립니다.

해결책은 미리 합산된 요약 테이블을 만드는 것입니다. 원본 이벤트 대신 (카테고리, 날짜, 매출합계, 건수) 형태의 행을 INSERT하면, 쿼리는 수백 행만 읽으면 됩니다.

### 숫자 컬럼 자동 합산

SummingMergeTree는 머지 시점에 같은 ORDER BY 키를 가진 행들의 숫자 컬럼을 합산합니다.

```sql
CREATE TABLE daily_sales
(
    category    LowCardinality(String),
    sale_date   Date,
    revenue     UInt64,
    order_count UInt32
)
ENGINE = SummingMergeTree((revenue, order_count))
ORDER BY (category, sale_date);
```

`SummingMergeTree((revenue, order_count))`에서 괄호 안의 컬럼이 합산 대상입니다. 생략하면 ORDER BY에 포함되지 않은 모든 숫자 컬럼이 자동으로 합산됩니다.

```
Part A                              Part B
┌────────┬──────┬───────┬───────┐   ┌────────┬──────┬───────┬───────┐
│category│ date │revenue│ count │   │category│ date │revenue│ count │
├────────┼──────┼───────┼───────┤   ├────────┼──────┼───────┼───────┤
│ 도서   │05-01 │ 5000  │   2   │   │ 도서   │05-01 │ 3000  │   1   │
│ 의류   │05-01 │ 8000  │   3   │   │ 도서   │05-02 │ 7000  │   3   │
└────────┴──────┴───────┴───────┘   └────────┴──────┴───────┴───────┘

                    머지 결과
            ┌────────┬──────┬───────┬───────┐
            │category│ date │revenue│ count │
            ├────────┼──────┼───────┼───────┤
            │ 도서   │05-01 │ 8000  │   3   │ ← 합산
            │ 도서   │05-02 │ 7000  │   3   │
            │ 의류   │05-01 │ 8000  │   3   │
            └────────┴──────┴───────┴───────┘
```

(도서, 05-01) 키가 두 Part에 존재했지만, 머지 후에는 revenue 5000+3000=8000, count 2+1=3으로 합산된 하나의 행만 남습니다.

### 쿼리 시 주의점

ReplacingMergeTree와 마찬가지로, 머지 전에는 부분 합산 상태입니다. 같은 키의 행이 여러 Part에 걸쳐 존재할 수 있습니다. 정확한 합계를 보장하려면 쿼리에서도 `sum()`을 사용해야 합니다.

```sql
SELECT
    category,
    sale_date,
    sum(revenue) AS total_revenue,
    sum(order_count) AS total_orders
FROM daily_sales
GROUP BY category, sale_date;
```

"SummingMergeTree인데 왜 `sum()`을 또 써야 하지?"라고 생각할 수 있습니다. SummingMergeTree의 가치는 `sum()` 자체를 없애는 것이 아니라, **집계 대상 행 수를 극적으로 줄이는 것**에 있습니다. 원본 수억 건에서 GROUP BY하던 것을 수백~수천 행에서 GROUP BY하게 되니, 쿼리 성능이 수천 배 향상됩니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  SummingMergeTree는 단순 합산(sum)만 지원합니다. 평균(avg), 유니크 카운트(uniq), 퍼센타일 같은 집계는 합산으로 구할 수 없습니다. 임의의 집계 함수가 필요하면 AggregatingMergeTree를 사용합니다.
</div>

## AggregatingMergeTree

### 문제: 합산 이상의 집계가 필요할 때

"일별 고유 사용자 수(DAU)"를 선집계하고 싶다면? 두 Part에서 각각 구한 uniq(user_id)를 단순히 더할 수 없습니다. 사용자가 겹칠 수 있기 때문입니다. Part A에서 uniq = 100, Part B에서 uniq = 80이라도, 합계가 180이 아닐 수 있습니다.

평균, 퍼센타일도 마찬가지입니다. 부분 합산으로는 올바른 결과를 구할 수 없는 집계 함수가 많습니다. AggregatingMergeTree는 이 문제를 **집계 함수의 중간 상태(intermediate state)**를 저장하는 방식으로 해결합니다.

### AggregateFunction 타입과 -State/-Merge 콤비네이터

AggregatingMergeTree의 핵심은 `AggregateFunction` 타입입니다. 최종 결과가 아니라 집계의 중간 상태를 바이너리로 저장합니다.

```sql
CREATE TABLE daily_user_stats
(
    event_date   Date,
    category     LowCardinality(String),
    user_cnt     AggregateFunction(uniq, UInt32),
    revenue_sum  AggregateFunction(sum, UInt64),
    price_avg    AggregateFunction(avg, UInt32)
)
ENGINE = AggregatingMergeTree()
ORDER BY (event_date, category);
```

`AggregateFunction(uniq, UInt32)` 컬럼은 `uniq` 함수의 중간 상태를 저장합니다. HyperLogLog 스케치 같은 확률적 자료구조가 바이너리로 들어가는 것입니다.

INSERT할 때는 `-State` 접미사를 사용합니다.

```sql
INSERT INTO daily_user_stats
SELECT
    toDate(created_at) AS event_date,
    category,
    uniqState(user_id),
    sumState(price),
    avgState(price)
FROM orders
GROUP BY event_date, category;
```

`uniqState(user_id)`는 "uniq의 최종 값"이 아니라 "uniq 계산의 중간 상태"를 반환합니다. 이 상태는 나중에 다른 상태와 병합할 수 있습니다.

SELECT할 때는 `-Merge` 접미사를 사용합니다.

```sql
SELECT
    event_date,
    category,
    uniqMerge(user_cnt) AS unique_users,
    sumMerge(revenue_sum) AS total_revenue,
    avgMerge(price_avg) AS avg_price
FROM daily_user_stats
GROUP BY event_date, category;
```

`uniqMerge`는 저장된 중간 상태들을 병합해서 최종 결과를 도출합니다. 머지가 일어나면 같은 ORDER BY 키의 중간 상태끼리 자동으로 병합되므로, 시간이 지날수록 행 수가 줄어들면서도 정확도는 유지됩니다.

### 직접 INSERT vs Materialized View

위 예시처럼 직접 `INSERT INTO ... SELECT ... -State()` 패턴을 쓸 수도 있지만, 실무에서는 거의 항상 **Materialized View**를 통해 자동화합니다. 원본 테이블에 INSERT가 들어올 때마다 Materialized View가 자동으로 `-State` 변환을 실행하고 AggregatingMergeTree 테이블에 넣어줍니다.

AggregatingMergeTree + Materialized View 조합은 ClickHouse 실시간 집계의 표준 패턴입니다. Materialized View의 상세한 동작은 [#10(Materialized Views)](/clickhouse/materialized-views/)에서 다룹니다.

### 엔진별 비교

세 엔진의 차이를 정리합니다.

| 엔진 | 저장하는 것 | 머지 시 동작 | 쿼리 패턴 |
|------|-----------|------------|----------|
| MergeTree | 원본 행 | 합칠 뿐 | `GROUP BY` 직접 실행 |
| SummingMergeTree | 원본 행 (합산됨) | 숫자 컬럼 합산 | `sum() GROUP BY` |
| AggregatingMergeTree | 중간 집계 상태 | 상태 병합 | `-Merge() GROUP BY` |

MergeTree는 항상 정확하지만 매번 전체 데이터를 읽어야 합니다. SummingMergeTree는 단순 합산을 자동화하고, AggregatingMergeTree는 임의의 집계 함수를 지원합니다. 복잡도 대비 유연성의 트레이드오프입니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  <code>AggregateFunction</code> 타입 컬럼은 바이너리 상태를 저장하므로 <code>SELECT *</code>로 직접 읽으면 깨진 문자가 출력됩니다. 반드시 <code>-Merge</code> 콤비네이터(<code>uniqMerge</code>, <code>sumMerge</code>, <code>avgMerge</code> 등)를 통해 읽어야 합니다.
</div>

## CollapsingMergeTree

### 문제: 상태 변경을 어떻게 표현할 것인가

e-commerce 시스템에서 주문 상태가 변합니다. "접수" → "배송중" → "완료". RDB에서는 `UPDATE orders SET status = '배송중' WHERE order_id = 1`로 끝나지만, ClickHouse의 기본 MergeTree는 INSERT만 효율적입니다. 뮤테이션으로 UPDATE할 수 있지만 Part를 통째로 재작성합니다.

ReplacingMergeTree로 해결할 수도 있습니다. 하지만 ReplacingMergeTree는 이전 상태를 완전히 덮어쓰므로, "이전 상태를 기준으로 집계(취소된 주문 수, 상태별 통계)"가 필요한 경우에는 적합하지 않습니다.

CollapsingMergeTree는 다른 접근을 취합니다. **"이전 상태를 취소하는 행"을 INSERT하는 것**입니다.

### Sign 컬럼으로 삽입/취소

```sql
CREATE TABLE orders_collapsing
(
    order_id    UInt64,
    status      LowCardinality(String),
    price       UInt32,
    sign        Int8
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY order_id;
```

`sign` 컬럼이 핵심입니다.

- `sign = 1`: 이 행은 유효한 상태입니다 (state row)
- `sign = -1`: 이 행은 이전 상태를 취소합니다 (cancel row)

상태를 변경할 때는 두 행을 INSERT합니다.

```
1) 초기 INSERT (주문 접수):
   (order_id=1, status='접수', price=10000, sign=+1)

2) 상태 변경 (접수 → 배송중):
   (order_id=1, status='접수', price=10000, sign=-1)   ← 이전 상태 취소
   (order_id=1, status='배송중', price=10000, sign=+1)  ← 새 상태 삽입

3) 머지 후:
   (order_id=1, status='배송중', price=10000, sign=+1)  ← +1/-1 쌍 상쇄
```

머지할 때 같은 ORDER BY 키의 `+1`과 `-1` 쌍이 만나면 둘 다 삭제됩니다. 결과적으로 최종 상태만 남습니다.

### VersionedCollapsingMergeTree

CollapsingMergeTree에는 한 가지 함정이 있습니다. `+1` 행과 `-1` 행이 서로 다른 Part에 들어가면, 머지 순서에 따라 상쇄가 올바르게 일어나지 않을 수 있습니다. CollapsingMergeTree는 같은 Part 안에서 `+1`이 `-1`보다 앞에 있어야 정상 동작합니다. 분산 환경이나 동시 INSERT 상황에서는 이 순서가 보장되지 않습니다.

VersionedCollapsingMergeTree는 `version` 컬럼을 추가해서 이 문제를 해결합니다.

```sql
CREATE TABLE orders_versioned
(
    order_id    UInt64,
    status      LowCardinality(String),
    price       UInt32,
    sign        Int8,
    version     UInt32
)
ENGINE = VersionedCollapsingMergeTree(sign, version)
ORDER BY order_id;
```

같은 `version`을 가진 `+1`과 `-1` 쌍을 정확히 매칭해서 상쇄합니다. Part 내 순서에 의존하지 않으므로 분산 환경에서도 안전합니다. 실무에서는 VersionedCollapsingMergeTree를 사용하는 것이 더 안전합니다.

### 쿼리 시 주의점

머지 전에는 `+1`과 `-1` 행이 모두 보입니다. 올바른 현재 상태를 조회하려면 `sign`을 활용해야 합니다.

```sql
-- 현재 유효한 주문만 조회
SELECT
    order_id,
    argMax(status, version) AS current_status,
    sum(price * sign) AS effective_price
FROM orders_versioned
GROUP BY order_id
HAVING sum(sign) > 0;
```

`sum(sign) > 0`은 "취소되지 않은 행만"이라는 뜻입니다. `sum(price * sign)`은 유효한 행의 price 합계입니다. FINAL 키워드도 사용할 수 있지만, 대규모 데이터에서는 GROUP BY 패턴이 더 유연합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  CollapsingMergeTree를 사용하려면 상태를 취소할 때 "이전 상태의 정확한 복사본"을 <code>sign=-1</code>과 함께 INSERT해야 합니다. 애플리케이션이 이전 상태를 알지 못하면 cancel row를 만들 수 없습니다. 이전 상태를 추적하기 어려운 시스템에서는 ReplacingMergeTree가 더 적합합니다.
</div>

## 변종 엔진 선택 가이드

네 엔진의 선택 기준을 정리합니다.

| 요구사항 | 권장 엔진 | 쿼리 시 주의사항 |
|----------|----------|----------------|
| 같은 키의 최신 행만 유지 | ReplacingMergeTree | `FINAL` 또는 `argMax` |
| 숫자 컬럼 선집계 (합산) | SummingMergeTree | `sum() GROUP BY` |
| 임의 집계 함수 선집계 | AggregatingMergeTree | `-Merge() GROUP BY` |
| 상태 변경 추적 (이전 상태 알려짐) | CollapsingMergeTree | `sum(sign)` 필터 |
| 상태 변경 추적 (순서 보장 필요) | VersionedCollapsingMergeTree | `sum(sign)` 필터 |
| 위 모든 경우 + 복제 | `Replicated*` 접두사 추가 | 동일 |

복제가 필요하면 엔진 이름 앞에 `Replicated`를 붙입니다. `ReplicatedReplacingMergeTree`, `ReplicatedSummingMergeTree` 같은 형태입니다. 복제의 원리는 [#12(ReplicatedMergeTree와 Keeper)](/clickhouse/replication/)에서 다룹니다.

네 엔진 모두 ORDER BY 키가 핵심 동작을 결정합니다. ReplacingMergeTree에서는 중복 제거 키, SummingMergeTree에서는 집계 차원, CollapsingMergeTree에서는 상쇄 매칭 키입니다. ORDER BY를 잘못 설계하면 엔진이 의도대로 동작하지 않습니다. 정렬 키 설계 전략은 [#5(PRIMARY KEY 설계)](/clickhouse/primary-key-design/)에서 다룹니다.

모든 변종에 공통되는 원칙을 다시 강조합니다. **머지 전에는 중간 상태가 보입니다.** 쿼리 레벨에서 이를 처리하는 것은 사용자의 책임입니다.

## 실험: Docker로 직접 확인하기

[이전 글](/clickhouse/merge-and-mutation/)의 Docker 환경(`ch-test` 컨테이너)을 그대로 사용합니다. 컨테이너가 없다면 [첫 번째 글](/clickhouse/why-clickhouse/)의 Docker 실험 섹션을 참고하세요.

### 실험 1: ReplacingMergeTree로 중복 제거

같은 `order_id`를 다른 버전으로 두 번 INSERT하고, 머지 전후의 차이를 확인합니다.

```sql
DROP TABLE IF EXISTS orders_replacing;

CREATE TABLE orders_replacing
(
    order_id    UInt64,
    ver         UInt32,
    status      LowCardinality(String),
    price       UInt32
)
ENGINE = ReplacingMergeTree(ver)
ORDER BY order_id;
```

```sql
-- 첫 번째 INSERT (Part 1 생성)
INSERT INTO orders_replacing VALUES
    (1, 1, '접수', 10000),
    (2, 1, '접수', 20000),
    (3, 1, '접수', 30000);

-- 두 번째 INSERT (Part 2 생성, order_id=1의 상태 변경)
INSERT INTO orders_replacing VALUES
    (1, 2, '배송중', 10000),
    (4, 1, '접수', 40000);
```

머지 전에 조회하면 `order_id = 1`이 두 행 보입니다.

```sql
SELECT * FROM orders_replacing ORDER BY order_id, ver;
```

```
┌─order_id─┬─ver─┬─status──┬─price─┐
│        1 │   1 │ 접수    │ 10000 │
│        1 │   2 │ 배송중  │ 10000 │
│        2 │   1 │ 접수    │ 20000 │
│        3 │   1 │ 접수    │ 30000 │
│        4 │   1 │ 접수    │ 40000 │
└──────────┴─────┴─────────┴───────┘
```

`FINAL`을 붙이면 머지 없이도 중복이 제거됩니다.

```sql
SELECT * FROM orders_replacing FINAL ORDER BY order_id;
```

```
┌─order_id─┬─ver─┬─status──┬─price─┐
│        1 │   2 │ 배송중  │ 10000 │
│        2 │   1 │ 접수    │ 20000 │
│        3 │   1 │ 접수    │ 30000 │
│        4 │   1 │ 접수    │ 40000 │
└──────────┴─────┴─────────┴───────┘
```

`order_id = 1`은 `ver = 2`인 행만 남았습니다. 강제 머지 후에는 FINAL 없이도 동일한 결과가 나옵니다.

```sql
OPTIMIZE TABLE orders_replacing FINAL;
SELECT * FROM orders_replacing ORDER BY order_id;
```

```
┌─order_id─┬─ver─┬─status──┬─price─┐
│        1 │   2 │ 배송중  │ 10000 │
│        2 │   1 │ 접수    │ 20000 │
│        3 │   1 │ 접수    │ 30000 │
│        4 │   1 │ 접수    │ 40000 │
└──────────┴─────┴─────────┴───────┘
```

물리적으로도 중복이 제거되었습니다.

### 실험 2: SummingMergeTree로 자동 합산

같은 (카테고리, 날짜) 키로 세 번 INSERT하고, 머지 전후 행 수 변화를 확인합니다.

```sql
DROP TABLE IF EXISTS daily_sales;

CREATE TABLE daily_sales
(
    category    LowCardinality(String),
    sale_date   Date,
    revenue     UInt64,
    order_count UInt32
)
ENGINE = SummingMergeTree()
ORDER BY (category, sale_date);
```

```sql
INSERT INTO daily_sales VALUES ('전자제품', '2026-05-01', 50000, 2);
INSERT INTO daily_sales VALUES ('전자제품', '2026-05-01', 30000, 1);
INSERT INTO daily_sales VALUES ('전자제품', '2026-05-01', 80000, 3);
```

머지 전에는 세 행이 모두 보입니다.

```sql
SELECT * FROM daily_sales;
```

```
┌─category──┬──sale_date─┬─revenue─┬─order_count─┐
│ 전자제품  │ 2026-05-01 │   50000 │           2 │
│ 전자제품  │ 2026-05-01 │   30000 │           1 │
│ 전자제품  │ 2026-05-01 │   80000 │           3 │
└───────────┴────────────┴─────────┴─────────────┘
```

`sum() GROUP BY`를 사용하면 머지 여부와 관계없이 정확한 합계를 얻습니다.

```sql
SELECT
    category,
    sale_date,
    sum(revenue) AS total_revenue,
    sum(order_count) AS total_orders
FROM daily_sales
GROUP BY category, sale_date;
```

```
┌─category──┬──sale_date─┬─total_revenue─┬─total_orders─┐
│ 전자제품  │ 2026-05-01 │        160000 │            6 │
└───────────┴────────────┴───────────────┴──────────────┘
```

강제 머지 후에는 물리적으로도 하나의 행으로 합쳐집니다.

```sql
OPTIMIZE TABLE daily_sales FINAL;
SELECT * FROM daily_sales;
```

```
┌─category──┬──sale_date─┬─revenue─┬─order_count─┐
│ 전자제품  │ 2026-05-01 │  160000 │           6 │
└───────────┴────────────┴─────────┴─────────────┘
```

세 행이 하나로 합산되었습니다. revenue 50000+30000+80000=160000, order_count 2+1+3=6.

### 실험 3: CollapsingMergeTree로 상태 변경

주문 상태를 +1/-1 패턴으로 변경하고, 머지 전후의 동작을 확인합니다.

```sql
DROP TABLE IF EXISTS orders_collapsing;

CREATE TABLE orders_collapsing
(
    order_id    UInt64,
    status      LowCardinality(String),
    price       UInt32,
    sign        Int8
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY order_id;
```

```sql
-- 주문 접수
INSERT INTO orders_collapsing VALUES (1, '접수', 10000, 1);

-- 상태 변경: 접수 취소 + 배송중 삽입
INSERT INTO orders_collapsing VALUES
    (1, '접수', 10000, -1),
    (1, '배송중', 10000, 1);
```

머지 전에는 세 행이 모두 보입니다.

```sql
SELECT * FROM orders_collapsing ORDER BY order_id, sign;
```

```
┌─order_id─┬─status──┬─price─┬─sign─┐
│        1 │ 접수    │ 10000 │   -1 │
│        1 │ 접수    │ 10000 │    1 │
│        1 │ 배송중  │ 10000 │    1 │
└──────────┴─────────┴───────┴──────┘
```

sign을 활용한 쿼리로 현재 유효한 상태만 조회합니다.

```sql
SELECT
    order_id,
    anyLast(status) AS current_status,
    sum(price * sign) AS effective_price
FROM orders_collapsing
GROUP BY order_id
HAVING sum(sign) > 0;
```

```
┌─order_id─┬─current_status─┬─effective_price─┐
│        1 │ 배송중         │           10000 │
└──────────┴────────────────┴─────────────────┘
```

`sum(sign) = +1+(-1)+1 = 1 > 0`이므로 유효한 주문입니다. 강제 머지 후에는 상쇄된 쌍이 물리적으로 제거됩니다.

```sql
OPTIMIZE TABLE orders_collapsing FINAL;
SELECT * FROM orders_collapsing;
```

```
┌─order_id─┬─status──┬─price─┬─sign─┐
│        1 │ 배송중  │ 10000 │    1 │
└──────────┴─────────┴───────┴──────┘
```

(접수, +1)과 (접수, -1) 쌍이 상쇄되어 사라지고, (배송중, +1)만 남았습니다.

## 실전에서는

### 변종 엔진의 ORDER BY 설계

변종 엔진에서 ORDER BY는 단순한 정렬 키가 아닙니다. 엔진의 핵심 동작을 결정하는 키입니다.

- **ReplacingMergeTree**: ORDER BY가 곧 중복 제거 키입니다. 비즈니스 유니크 키(order_id, user_id 등)를 ORDER BY에 넣어야 합니다. 만약 `ORDER BY (category, order_id)`로 설정하면, (category, order_id) 조합이 같아야 중복으로 인식합니다.
- **SummingMergeTree**: ORDER BY가 곧 GROUP BY 키입니다. 집계 차원(category, date 등)을 ORDER BY에 넣습니다.
- **CollapsingMergeTree**: ORDER BY가 곧 상쇄 매칭 키입니다. 개별 엔티티를 식별하는 키(order_id 등)를 넣어야 합니다.

ORDER BY를 잘못 잡으면 엔진이 전혀 다른 행을 "같은 키"로 인식합니다. 정렬 키 설계의 상세 전략은 [#5(PRIMARY KEY 설계)](/clickhouse/primary-key-design/)에서 다룹니다.

### 머지 전 중간 상태 처리 패턴

모든 변종의 공통 과제입니다. 세 가지 접근이 있습니다.

**패턴 1: FINAL 키워드**. 가장 간단합니다. `SELECT ... FROM table FINAL`로 머지 전 중간 상태를 쿼리 시점에 처리합니다. 단점은 모든 Part를 읽어야 하므로 대용량 테이블에서 느려질 수 있다는 것입니다.

**패턴 2: GROUP BY + 집계 함수**. FINAL보다 유연하고 다른 조건과 함께 사용하기 좋습니다. ReplacingMergeTree에서는 `argMax`, SummingMergeTree에서는 `sum`, CollapsingMergeTree에서는 `sum(sign)` 패턴입니다. 쿼리가 약간 복잡해지지만 WHERE 조건이나 다른 집계와 자연스럽게 결합됩니다.

**패턴 3: Materialized View로 선집계**. 원본 테이블은 기본 MergeTree로 두고, Materialized View가 AggregatingMergeTree 요약 테이블에 자동으로 넣어줍니다. 가장 확장성이 좋은 패턴이며, [#10(Materialized Views)](/clickhouse/materialized-views/)에서 상세히 다룹니다.

### 모니터링

변종 엔진에서도 Part 수 추적은 기본 MergeTree와 동일합니다. `system.parts`에서 active Part 수를 모니터링하고, 지속적으로 증가하면 머지가 따라가지 못하는 상황입니다.

ReplacingMergeTree에서는 `SELECT count() FROM table`과 `SELECT count() FROM table FINAL`의 차이를 비교하면 현재 중복 비율을 추정할 수 있습니다. 차이가 크다면 머지가 충분히 진행되지 않은 것입니다.

[지난 글](/clickhouse/merge-and-mutation/)에서 다뤘듯이 `OPTIMIZE TABLE FINAL`은 프로덕션에서 정기적으로 실행하면 안 됩니다. 변종 엔진이라고 해서 예외가 아닙니다. 백그라운드 머지 스케줄러가 최적의 시점에 머지를 수행하도록 맡기는 것이 올바른 운영 방식입니다.

## 마치며

기본 MergeTree의 머지는 Part를 합칠 뿐이지만, 변종 엔진은 그 과정에 추가 로직을 끼워 넣습니다. ReplacingMergeTree는 중복을 제거하고, SummingMergeTree는 숫자를 합산하고, AggregatingMergeTree는 임의의 집계 상태를 병합하고, CollapsingMergeTree는 +1/-1 쌍을 상쇄합니다.

공통 원칙을 기억하세요. 이 로직은 머지 시점에만 동작하고, 쿼리 시 중간 상태를 처리하는 것은 사용자의 몫입니다. `FINAL`, `argMax`, `sum(sign)` 같은 패턴 없이 변종 엔진을 쓰면 "왜 중복이 보이지?"라는 함정에 빠집니다.

네 가지 엔진 모두 ORDER BY 키가 핵심 동작을 결정합니다. 다음 글에서는 ORDER BY가 인덱스이자 중복 제거 키이자 집계 키인 ClickHouse에서, 정렬 키를 어떻게 설계해야 하는지를 다룹니다.

---

## 참고자료

- [ClickHouse 공식 문서: ReplacingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree)
- [ClickHouse 공식 문서: SummingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/summingmergetree)
- [ClickHouse 공식 문서: AggregatingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/aggregatingmergetree)
- [ClickHouse 공식 문서: CollapsingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/collapsingmergetree)
- [ClickHouse 공식 문서: VersionedCollapsingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/versionedcollapsingmergetree)
- [ClickHouse 공식 문서: AggregateFunction Type](https://clickhouse.com/docs/sql-reference/data-types/aggregatefunction)
