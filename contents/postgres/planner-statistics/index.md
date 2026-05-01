---
date: '2026-04-19'
title: '플래너 통계와 EXPLAIN 읽는 법'
category: 'Database'
series: 'postgres'
seriesOrder: 6
tags: ['PostgreSQL', 'EXPLAIN', 'Planner', 'Statistics']
summary: '같은 쿼리가 어제는 Index Scan, 오늘은 Seq Scan이 되는 이유는 대부분 통계에 있습니다. 플래너가 pg_statistic의 숫자로 cost를 만드는 과정과 EXPLAIN 출력을 한 줄씩 해석하는 법, 추정치가 크게 틀어졌을 때 진단하는 법을 정리합니다.'
thumbnail: './thumbnail.png'
---

`users(email)`에 인덱스를 걸어뒀는데 어떤 날은 Index Scan을 타고 어떤 날은 Seq Scan이 됩니다. `EXPLAIN ANALYZE`를 찍어보니 `rows=1`이라 예상한 자리에서 실제로는 84만 행이 나옵니다. `EXPLAIN`만 보면 0.01ms로 찍히는데 실제 쿼리는 2초가 걸립니다.

세 현상은 모두 플래너가 쿼리를 실제로 돌려보지 않고 **`pg_statistic`에 담긴 숫자 몇 개로 비용을 추정**한다는 사실에서 출발합니다. 플래너는 "이 조건을 걸면 몇 행이 남는가"를 통계 기반으로 계산하고, 그 추정치 위에 cost를 얹어 plan을 고릅니다. 통계가 현실과 어긋나는 순간 조인 순서, 인덱스 선택, 병렬 여부가 줄줄이 잘못 결정됩니다.

이 글에서는 플래너가 cost를 만드는 과정, `EXPLAIN` 출력의 각 숫자가 무엇을 뜻하는지, 그리고 추정치가 크게 틀어졌을 때 원인을 좁혀가는 법을 순서대로 살펴봅니다. [지난 글에서 다룬 B-tree의 동작 원리](/postgres/btree-anatomy/)가 여기서도 이어지는데, 플래너는 결국 "인덱스를 탈 때의 cost"와 "테이블을 훑을 때의 cost"를 비교해 고르기 때문입니다.

## 플래너가 하는 일

쿼리 한 건이 파서를 거쳐 트리 구조로 바뀌면, 플래너는 그 트리를 실행 가능한 **plan**으로 변환합니다. 같은 SQL이라도 실행 방법은 여러 가지입니다.

- `users` 테이블을 처음부터 끝까지 읽을지 (Seq Scan)
- `users(email)` 인덱스를 타고 필요한 행만 찾을지 (Index Scan)
- `orders`와 조인할 때 Nested Loop와 Hash Join 중 어느 쪽을 쓸지

플래너는 각 후보에 **cost**라는 숫자를 매겨 가장 낮은 것을 고릅니다. 여기서 cost는 밀리초 단위의 실행 시간이 아니라 "`seq_page_cost`를 1.0으로 놓았을 때의 상대적인 비용"입니다. 절대값으로 해석하면 안 되고, **같은 쿼리 안에서 plan끼리 비교할 때만** 의미가 있다고 기억해두면 좋습니다.

cost를 만드는 데 쓰이는 주요 파라미터는 네 개뿐입니다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `seq_page_cost` | 1.0 | 디스크 페이지를 순차로 읽는 비용(기준) |
| `random_page_cost` | 4.0 | 랜덤 위치 페이지를 읽는 비용 |
| `cpu_tuple_cost` | 0.01 | 한 행을 처리하는 CPU 비용 |
| `cpu_index_tuple_cost` | 0.005 | 인덱스 엔트리 하나를 처리하는 비용 |

`random_page_cost`가 `seq_page_cost`보다 4배 비싸다는 설정은 HDD 시절의 유산입니다. SSD 환경에서는 이 차이가 거의 없어서 4.0을 그대로 두면 플래너가 인덱스를 지나치게 기피합니다. 요즘 운영 환경은 대부분 `random_page_cost`를 1.1~1.5 정도로 내려서 씁니다.

그런데 이 cost 공식 자체는 단순해 보여도, 여기서 `rows` 자리에 들어갈 숫자를 어떻게 구하는지가 진짜 핵심입니다. 플래너가 "몇 행이 남을 것"이라고 추정하는 근거가 다음 절의 주제입니다.

## pg_statistic: cost의 원료

cost를 계산하려면 "조건을 걸었을 때 몇 행이 남는가"를 먼저 알아야 합니다. 이걸 **selectivity**라 부릅니다. 플래너는 실제 테이블을 읽지 않고 `pg_statistic`에 저장된 표본 기반 통계로 selectivity를 추정합니다.

`ANALYZE`가 돌면 각 컬럼에 대해 세 가지가 저장됩니다.

- `n_distinct`: 고유값 개수. 양수면 절대값, 음수면 행 수 대비 비율입니다(-1이면 전부 다름).
- **MCV**(most_common_vals): 가장 자주 나오는 값 상위 100개(기본)와 각 값의 빈도.
- **histogram**: MCV에 뽑히지 않은 나머지 값을 같은 개수 구간으로 나눈 경계선들.

등치 조건(`=`)이 MCV 안에 들어 있으면 그 값의 빈도를 바로 씁니다. MCV 밖이면 "MCV에 포함되지 않은 나머지 비율"을 전체 고유값 수로 나눠 추정합니다. 범위 조건(`>`, `<`, `BETWEEN`)은 histogram 경계선을 따라 어느 위치까지 포함되는지를 보간해 비율을 계산합니다. MCV는 주로 카디널리티 낮은 범주형에서 위력을 발휘하고, histogram은 연속형 숫자·날짜 범위 조건을 받쳐주는 역할입니다.

말로만 보면 잘 와닿지 않으니 직접 뜯어봅니다.

```sql
CREATE TABLE orders (
    id bigserial PRIMARY KEY,
    status text,
    amount numeric
);

-- 약 85% completed, 약 13% pending, 약 2% refunded
INSERT INTO orders (status, amount)
SELECT
    CASE
        WHEN r < 0.85 THEN 'completed'
        WHEN r < 0.98 THEN 'pending'
        ELSE 'refunded'
    END,
    (random() * 1000)::numeric(10, 2)
FROM generate_series(1, 100000),
     LATERAL (SELECT random() AS r) sub;

ANALYZE orders;

SELECT attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

```
 attname | n_distinct |        most_common_vals         |    most_common_freqs
---------+------------+---------------------------------+--------------------------
 status  |          3 | {completed,pending,refunded}    | {0.8504,0.1296,0.02}
```

고유값은 3개, 그중 `completed`가 약 85%를 차지한다는 사실이 숫자로 박혀 있습니다. 이 테이블에 `WHERE status = 'completed'`를 걸면 플래너는 "10만 행 중 8만 5천 행쯤 남겠다"고 추정합니다. 설령 `status`에 인덱스를 만들어둬도 이 쿼리는 Seq Scan이 이깁니다. 전체의 85%를 읽어야 하는 상황에서 인덱스 트리를 타고 다시 힙으로 가는 건 오히려 느립니다.

반면 `WHERE status = 'refunded'`는 2%만 남으니 Index Scan이 훨씬 낫습니다. **같은 컬럼이어도 조건 값에 따라 plan이 달라지는 이유**가 이 통계에 있습니다.

## EXPLAIN 출력 한 줄 해석하기

위에서 만든 테이블로 간단한 쿼리를 찍어봅니다.

```sql
EXPLAIN SELECT * FROM orders WHERE amount > 500;
```

```
 Seq Scan on orders  (cost=0.00..1943.00 rows=50123 width=22)
   Filter: (amount > '500'::numeric)
```

각 숫자의 의미는 이렇습니다.

- `cost=0.00..1943.00` — **startup cost**(첫 행 반환까지)와 **total cost**(전체 완료까지). Seq Scan은 바로 읽기 시작하니 startup이 0입니다.
- `rows=50123` — 플래너가 통계로 추정한 반환 행 수.
- `width=22` — 행 하나의 평균 크기(bytes).

여기까지는 전부 추정치입니다. `EXPLAIN ANALYZE`를 붙이면 실제 실행 결과가 함께 나옵니다.

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE amount > 500;
```

```
 Seq Scan on orders  (cost=0.00..1943.00 rows=50123 width=22)
                     (actual time=0.013..8.421 rows=49872 loops=1)
   Filter: (amount > '500'::numeric)
   Rows Removed by Filter: 50128
 Planning Time: 0.082 ms
 Execution Time: 10.334 ms
```

`actual time=0.013..8.421`의 앞 숫자는 첫 행이 나오기까지 걸린 시간, 뒷 숫자는 마지막 행까지 걸린 시간(ms)입니다. `rows=49872`는 실제로 반환된 행 수, `loops=1`은 이 노드가 한 번만 실행됐다는 뜻입니다.

추정치 50123 vs 실제 49872. 오차는 0.5% 수준입니다. 이 정도면 추정이 잘 맞은 편입니다.

버퍼 캐시 상황까지 보려면 `BUFFERS`를 추가합니다.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE amount > 500;
```

```
 Seq Scan on orders  (...)
   Buffers: shared hit=636 read=7
```

- `shared hit=636` — `shared_buffers`(메모리)에서 바로 가져온 8KB 페이지 수
- `read=7` — 디스크에서 읽어야 했던 페이지 수

`read` 값이 크면 워밍업이 안 된 상태거나 `shared_buffers`가 작은 것입니다. "EXPLAIN만 봤을 땐 빨라 보였는데 실제로는 느리다"는 상황은 거의 이 `read` 값 때문입니다.

## JOIN이 섞인 plan 읽는 법

단일 테이블 plan을 읽었으니 JOIN이 추가됐을 때 출력이 어떻게 달라지는지 이어서 봅니다. `orders` 옆에 `users`를 붙여 조인해봅니다.

```sql
CREATE TABLE users (
    id bigserial PRIMARY KEY,
    email text UNIQUE
);

INSERT INTO users (email)
SELECT 'user' || g || '@example.com'
FROM generate_series(1, 10000) g;

ALTER TABLE orders ADD COLUMN user_id bigint;
UPDATE orders SET user_id = (floor(random() * 10000)::int + 1);
CREATE INDEX ON orders (user_id);
ANALYZE;

EXPLAIN ANALYZE
SELECT u.email, o.amount
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.id = 42;
```

```
 Nested Loop  (cost=0.42..45.23 rows=10 width=36)
              (actual time=0.021..0.089 rows=9 loops=1)
   ->  Index Scan using users_pkey on users u
           (cost=0.29..8.31 rows=1 width=32)
           (actual time=0.010..0.011 rows=1 loops=1)
         Index Cond: (id = 42)
   ->  Index Scan using orders_user_id_idx on orders o
           (cost=0.13..36.82 rows=10 width=12)
           (actual time=0.008..0.073 rows=9 loops=1)
         Index Cond: (user_id = 42)
```

plan 트리를 읽는 규칙은 두 가지입니다.

- **안쪽이 먼저 실행됩니다.**(들여쓰기 깊은 노드) 바깥 노드는 안쪽의 출력을 입력으로 받습니다.
- **`loops`는 바깥 노드가 이 노드를 몇 번 호출했는지**입니다. Nested Loop에서 안쪽 노드의 실제 비용은 `actual time × loops`로 대략 계산합니다.

여기서는 `users`에서 1행(id=42)을 뽑고, 그 1행마다 `orders` 인덱스를 한 번 타서 9행을 가져온 것입니다. 추정 10행 vs 실제 9행, 이쪽도 추정이 잘 맞았습니다.

플래너가 Nested Loop를 고른 이유는 바깥이 1행으로 줄어들 것임을 `users_pkey` 통계로 알았기 때문입니다. 바깥이 만 행 규모였다면 Nested Loop의 cost가 선형으로 불어나면서 Hash Join이나 Merge Join이 유리한 지점으로 넘어갑니다. 이 선택 과정은 다음 글에서 다룹니다.

## 추정치가 틀어질 때

건강한 쿼리는 추정 행과 실제 행이 비슷합니다. 오차가 10배를 넘어가면 plan 선택이 엉뚱해지기 시작합니다. 틀어지는 원인은 대개 네 가지로 나뉩니다.

### 1. 통계가 오래됐다

autovacuum이 돌 때 autoanalyze가 함께 통계를 갱신하지만, 임계값에 안 닿으면 며칠째 옛날 통계를 쓰고 있을 수 있습니다.

```sql
SELECT relname, n_live_tup, n_dead_tup, last_autoanalyze, last_analyze
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

`last_autoanalyze`가 며칠 전이고 그 사이에 대량 INSERT/UPDATE가 있었다면, 수동으로 `ANALYZE orders;`부터 돌려봅니다. 이 한 줄로 plan이 정상으로 돌아오는 경우가 많습니다. 도입부에서 언급한 "어제는 Index Scan, 오늘은 Seq Scan" 같은 상황이 설명되는 지점이 여기입니다. 코드도 스키마도 그대로인데 중간에 autoanalyze가 돌면서 MCV나 histogram이 바뀌면, 같은 WHERE 절이라도 selectivity 추정이 달라져 plan이 뒤집힙니다.

### 2. 상관된 두 컬럼

플래너는 기본적으로 두 컬럼이 서로 **독립**이라고 가정하고 selectivity를 곱합니다. 현실은 종종 그렇지 않습니다.

```sql
CREATE TABLE addresses (
    id bigserial PRIMARY KEY,
    country text,
    city text
);

-- 도시는 나라에 종속적이다
INSERT INTO addresses (country, city)
SELECT
    c.country,
    c.city
FROM (
    VALUES
        ('KR', 'Seoul'), ('KR', 'Busan'), ('KR', 'Incheon'),
        ('US', 'NewYork'), ('US', 'LA'), ('US', 'Chicago'),
        ('JP', 'Tokyo'), ('JP', 'Osaka')
) c(country, city),
generate_series(1, 10000);

ANALYZE addresses;

EXPLAIN ANALYZE
SELECT * FROM addresses
WHERE country = 'KR' AND city = 'Seoul';
```

```
 Seq Scan on addresses  (cost=0.00..1387.00 rows=3333 width=18)
                        (actual time=0.020..5.912 rows=10000 loops=1)
   Filter: ((country = 'KR'::text) AND (city = 'Seoul'::text))
```

플래너는 "country=KR이 전체의 37.5%, city=Seoul이 전체의 12.5%, 둘 다 걸리면 37.5% × 12.5% = 4.7%"로 계산해 3333행을 예상했습니다. 실제로는 `Seoul`은 오직 `KR`에만 있으니 `KR` 전체인 10000행이 나옵니다. 3배 오차입니다.

PostgreSQL 10부터 이걸 교정할 수 있습니다.

```sql
CREATE STATISTICS addr_stats (dependencies, ndistinct)
ON country, city FROM addresses;
ANALYZE addresses;

EXPLAIN ANALYZE
SELECT * FROM addresses
WHERE country = 'KR' AND city = 'Seoul';
```

```
 Seq Scan on addresses  (cost=0.00..1387.00 rows=10000 width=18)
                        (actual time=0.012..5.203 rows=10000 loops=1)
```

추정 10000, 실제 10000. 두 컬럼이 강하게 연관된 경우 `CREATE STATISTICS`는 거의 항상 효과가 있습니다.

### 3. 극단적인 스큐

어떤 컬럼은 값 하나가 99%를 차지하고 나머지가 여기저기 흩어져 있을 수 있습니다. 기본 MCV 슬롯(100개)이 이걸 다 담지 못하면 histogram 쪽 추정이 엉킵니다.

컬럼별로 샘플 크기를 늘릴 수 있습니다.

```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;
```

기본값은 100이고, 1000까지 올리면 `ANALYZE`가 더 많은 행을 표본으로 삼고 MCV 슬롯도 1000개까지 늘어납니다. 테이블 전체의 기본값은 `default_statistics_target`으로 조절합니다. 수백 개 컬럼에 일괄 적용할 거라면 이쪽을 건드리는 편이 낫습니다.

### 4. 표현식에 감싼 컬럼

```sql
SELECT * FROM users WHERE lower(email) = 'admin@example.com';
```

플래너는 `lower(email)`이라는 표현식 값의 분포를 모릅니다. `pg_statistic`에는 `email` 컬럼의 원본 분포만 있기 때문입니다. 결과적으로 "모르는 값은 기본 비율"을 적용해 selectivity가 부정확해집니다.

해법은 **표현식 인덱스 + 그 인덱스에 대한 통계 생성**입니다.

```sql
CREATE INDEX users_email_lower ON users (lower(email));
ANALYZE users;
```

표현식 인덱스를 만들면 `ANALYZE`가 `lower(email)` 값 자체의 통계를 수집합니다. 그때부터 플래너가 제대로 된 selectivity를 씁니다.

## 실전에서는

bad plan을 만났을 때 확인 순서를 정해두면 디버깅이 빨라집니다.

**1. 일단 `EXPLAIN`부터 찍습니다.** `ANALYZE, BUFFERS` 옵션을 함께 줍니다. 추정 행과 실제 행의 비율이 10배 이상 벌어진 노드가 있는지 봅니다. 이게 원인 후보입니다.

**2. 해당 테이블의 `last_autoanalyze`를 확인합니다.**

```sql
SELECT relname, n_mod_since_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = '문제_테이블';
```

며칠째 갱신이 없거나 `n_mod_since_analyze`가 크면 수동 `ANALYZE`부터 돌려봅니다.

**3. 한 번만 느린 쿼리는 `auto_explain`으로 잡습니다.** 재현이 어려운 slow query는 항상 로그에 남겨둡니다.

```
# postgresql.conf
shared_preload_libraries = 'auto_explain'
auto_explain.log_min_duration = '500ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on
```

500ms 넘는 쿼리는 전부 plan과 함께 로그에 찍힙니다. 이벤트 순간의 plan을 나중에 볼 수 있다는 것만으로도 원인 파악이 쉬워집니다.

**4. "EXPLAIN만 빠르고 실제 느림"은 대체로 버퍼 미스입니다.** `Buffers: read=` 값이 크면 `shared_buffers` 크기나 워밍업 상태를 먼저 의심합니다. plan이 문제가 아닐 수 있습니다.

## 흔한 오해

- **"cost 숫자가 작으면 빠른 쿼리다"** — cost는 상대 비용입니다. 같은 쿼리의 plan끼리 비교할 때만 의미가 있고, 서로 다른 쿼리의 cost를 두고 "이게 더 빠르다"고 말할 수는 없습니다.
- **"ANALYZE는 인덱스를 갱신한다"** — `ANALYZE`는 통계만 갱신합니다. 인덱스 재구축과는 무관합니다.
- **"`VACUUM`을 돌리면 통계도 갱신된다"** — 기본 `VACUUM`은 통계를 건드리지 않습니다. `VACUUM ANALYZE`이거나 autovacuum에 딸린 autoanalyze가 돌아야 합니다.
- **"추정치 오차는 테이블이 작을수록 덜 나온다"** — 오히려 반대에 가깝습니다. 작은 테이블은 Seq Scan이 어차피 이겨서 오차가 드러나지 않을 뿐이고, 테이블이 커지는 순간 같은 오차가 plan을 뒤집습니다.

## 마치며

플래너는 실제 데이터를 보지 않습니다. `pg_statistic`에 박힌 숫자 몇 개로 비용을 추정하고, 가장 싼 plan을 고를 뿐입니다. 그 추정이 맞아야 plan도 맞습니다. `EXPLAIN ANALYZE`에서 추정 행과 실제 행의 괴리가 곧 진단의 출발점입니다.

다음 글에서는 같은 통계를 받아든 플래너가 Nested Loop, Hash Join, Merge Join 중 무엇을 왜 고르는지 살펴봅니다. 세 알고리즘의 cost 공식이 데이터 크기와 메모리 한계에서 어떻게 교차하는지가 핵심입니다.
