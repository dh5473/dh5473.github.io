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

`users(email)`에 인덱스를 걸어뒀는데 어떤 날은 Index Scan을 타고 어떤 날은 Seq Scan이 됩니다. `EXPLAIN ANALYZE`를 찍어보니 `rows=1`이라 예상한 자리에서 실제로는 84만 행이 나옵니다. `EXPLAIN`의 cost는 더없이 낮게 찍히는데 정작 쿼리는 2초가 걸립니다.

세 현상은 모두 플래너가 쿼리를 실제로 돌려보지 않고 **`pg_statistic`에 담긴 숫자 몇 개로 비용을 추정**한다는 사실에서 출발합니다. 플래너는 "이 조건을 걸면 몇 행이 남는가"를 통계 기반으로 계산하고, 그 추정치 위에 cost를 얹어 plan을 고릅니다. 통계가 현실과 어긋나는 순간 조인 순서, 인덱스 선택, 병렬 여부가 줄줄이 잘못 결정됩니다.

이 글에서는 플래너가 cost를 만드는 과정, `EXPLAIN` 출력의 각 숫자가 무엇을 뜻하는지, 그리고 추정치가 크게 틀어졌을 때 원인을 좁혀가는 법을 순서대로 살펴봅니다. 플래너가 저울에 올리는 후보 중 하나는 [B-tree 인덱스](/postgres/btree-anatomy/)를 타고 내려가는 경로이고, 다른 하나는 테이블을 처음부터 끝까지 훑는 경로입니다. 둘 중 어느 쪽이 싼지는 "조건에 걸리는 행이 몇 개냐"에 달려 있고, 그 숫자를 통계가 정합니다.

## 플래너가 하는 일

쿼리 한 건이 파서를 거쳐 트리 구조로 바뀌면, 플래너는 그 트리를 실행 가능한 **plan**으로 변환합니다. 같은 SQL이라도 실행 방법은 여러 가지입니다.

- `users` 테이블을 처음부터 끝까지 읽을지 (Seq Scan)
- `users(email)` 인덱스를 타고 필요한 행만 찾을지 (Index Scan)
- `orders`와 조인할 때 Nested Loop와 Hash Join 중 어느 쪽을 쓸지

플래너는 각 후보에 **cost**라는 숫자를 매겨 가장 낮은 것을 고릅니다. 여기서 cost는 밀리초 단위의 실행 시간이 아니라 "`seq_page_cost`를 1.0으로 놓았을 때의 상대적인 비용"입니다. 절대값으로 해석하면 안 되고, **같은 쿼리 안에서 plan끼리 비교할 때만** 의미가 있다고 기억해두면 좋습니다.

cost를 만드는 데 쓰이는 주요 파라미터는 다섯 개뿐입니다.

| 파라미터 | 기본값 | 의미 |
|----------|--------|------|
| `seq_page_cost` | 1.0 | 디스크 페이지를 순차로 읽는 비용(기준) |
| `random_page_cost` | 4.0 | 랜덤 위치 페이지를 읽는 비용 |
| `cpu_tuple_cost` | 0.01 | 한 행을 처리하는 CPU 비용 |
| `cpu_index_tuple_cost` | 0.005 | 인덱스 엔트리 하나를 처리하는 비용 |
| `cpu_operator_cost` | 0.0025 | 연산자나 함수를 한 번 실행하는 비용 |

Seq Scan의 total cost는 이 값들의 단순 합입니다. 페이지 수 × `seq_page_cost` + 행 수 × `cpu_tuple_cost` + 행 수 × 조건 개수 × `cpu_operator_cost`. 뒤에서 볼 `cost=0.00..1972.00`도 이 덧셈의 결과입니다.

`random_page_cost`가 `seq_page_cost`보다 4배 비싸다는 설정은 HDD 시절의 유산입니다. SSD 환경에서는 이 차이가 거의 없어서 4.0을 그대로 두면 플래너가 인덱스를 지나치게 기피합니다. SSD를 쓰는 서버라면 `random_page_cost`를 1.1\~1.5 정도로 내려 잡는 편이 실측에 가깝습니다.

그런데 이 cost 공식 자체는 단순해 보여도, 여기서 `rows` 자리에 들어갈 숫자를 어떻게 구하는지가 진짜 핵심입니다. 플래너가 "몇 행이 남을 것"이라고 추정하는 근거가 다음 절의 주제입니다.

## pg_statistic: cost의 원료

cost를 계산하려면 "조건을 걸었을 때 몇 행이 남는가"를 먼저 알아야 합니다. 이걸 **selectivity**라 부릅니다. 플래너는 실제 테이블을 읽지 않고 `pg_statistic`에 저장된 표본 기반 통계로 selectivity를 추정합니다.

`ANALYZE`가 돌면 각 컬럼에 대해 세 가지가 저장됩니다.

- `n_distinct`: 고유값 개수. 양수면 절대값, 음수면 행 수 대비 비율입니다(-1이면 전부 다름).
- **MCV**(most_common_vals): 가장 자주 나오는 값 상위 100개(기본)와 각 값의 빈도.
- **histogram**: MCV에 뽑히지 않은 나머지 값을 대략 같은 개수씩 담도록 나눈 구간 경계선들.

등치 조건(`=`)이 MCV 안에 들어 있으면 그 값의 빈도를 바로 씁니다. MCV 밖이면 "MCV가 덮지 못한 나머지 비율"을 MCV에 없는 고유값 개수로 나눠 추정합니다. 범위 조건(`>`, `<`, `BETWEEN`)은 histogram 경계선을 따라 어느 위치까지 포함되는지를 보간해 비율을 계산합니다. MCV는 주로 카디널리티 낮은 범주형에서 위력을 발휘하고, histogram은 연속형 숫자·날짜 범위 조건을 받쳐주는 역할입니다.

둘은 서로의 빈자리를 메웁니다. histogram은 MCV에 뽑힌 값을 빼고 계산되기 때문에, MCV가 컬럼 전체를 덮어버리면 histogram은 아예 만들어지지 않습니다. 반대로 값이 거의 다 다른 컬럼은 MCV에 걸리는 값이 없다시피 해서 histogram이 분포를 통째로 떠맡습니다.

말로만 보면 잘 와닿지 않으니 직접 뜯어봅니다. 아래 실습과 출력은 모두 PostgreSQL 18.3에서 기본 설정 그대로(재현을 위해 `autovacuum`만 꺼둔 상태) 실행한 결과입니다.

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
        WHEN s.r < 0.85 THEN 'completed'
        WHEN s.r < 0.98 THEN 'pending'
        ELSE 'refunded'
    END,
    (random() * 1000)::numeric(10, 2)
FROM (SELECT random() AS r FROM generate_series(1, 100000)) s;

ANALYZE orders;

SELECT attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

```text
 attname | n_distinct |       most_common_vals       |       most_common_freqs
---------+------------+------------------------------+-------------------------------
 status  |          3 | {completed,pending,refunded} | {0.8502333,0.12996666,0.0198}
```

고유값은 3개, 그중 `completed`가 85.02%를 차지한다는 사실이 숫자로 박혀 있습니다. `most_common_freqs`는 표본에서 센 비율이라 데이터를 다시 만들면 소수점 아래가 조금씩 달라집니다. 세 값이 전부 MCV에 담겼기 때문에 이 컬럼의 `histogram_bounds`는 비어 있습니다.

이 테이블에 `WHERE status = 'completed'`를 걸면 플래너는 그 빈도를 그대로 곱해 `rows=85023`을 내놓습니다. 설령 `status`에 인덱스를 만들어둬도 이 쿼리는 Seq Scan이 이깁니다. 전체의 85%를 읽어야 하는 상황에서 인덱스 트리를 타고 다시 힙으로 가는 건 오히려 느립니다.

반면 `WHERE status = 'refunded'`는 `rows=1980`이라 인덱스 쪽이 훨씬 쌉니다. 실제로 인덱스를 만들어두고 찍어보면 Seq Scan은 `cost=0.00..1972.00` 그대로인데 Bitmap Heap Scan은 `cost=23.64..770.39`까지 내려가 이쪽이 선택됩니다. 13%인 `pending`도 `cost=149.02..1033.48`이라 여전히 Bitmap Heap Scan이 이깁니다. 경계를 정하는 건 인덱스의 유무가 아니라 조건 값의 빈도입니다. **같은 컬럼이어도 조건 값에 따라 plan이 달라지는 이유**가 이 통계에 있습니다.

같은 테이블의 `status`와 `amount`를 나란히 놓으면 MCV와 histogram이 각각 어떤 컬럼을 맡는지가 드러납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 538" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 status 컬럼의 MCV가 세 값의 빈도를 그대로 담아 조건 값에 따라 Seq Scan과 Bitmap Index Scan이 갈리는 모습, 아래쪽은 amount 컬럼이 히스토그램 버킷 100개로 분포를 근사해 범위 조건의 비율을 보간하는 모습을 보여주는 그림">
<style>
.ps1-t { fill: var(--text, #1c1917); }
.ps1-m { fill: var(--text-muted, #6d6762); }
.ps1-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps1-s1 { fill: var(--primary, #0a756c); }
.ps1-s2 { fill: var(--text-muted, #6d6762); }
.ps1-s3 { fill: var(--text, #1c1917); }
.ps1-lead { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; }
.ps1-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps1-bk { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps1-tick { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps1-cut { stroke: var(--accent, #9d5604); stroke-width: 2; stroke-dasharray: 5 4; }
</style>
<!-- 제목 -->
<text x="240" y="26" text-anchor="middle" font-size="21" font-weight="600" class="ps1-t">ANALYZE가 남기는 두 종류의 분포</text>
<!-- 위 패널: status, MCV -->
<rect x="16" y="42" width="448" height="278" rx="8" class="ps1-panel"/>
<text x="32" y="70" font-size="19" font-weight="600" class="ps1-t">위: status 컬럼 (고유값 3개)</text>
<text x="32" y="94" font-size="18" class="ps1-m">MCV: 세 값의 빈도를 그대로 저장</text>
<rect x="32" y="106" width="353.7" height="32" class="ps1-s1"/>
<rect x="385.7" y="106" width="54.07" height="32" class="ps1-s2"/>
<rect x="439.77" y="106" width="8.23" height="32" class="ps1-s3"/>
<line x1="209" y1="140" x2="209" y2="158" class="ps1-lead"/>
<text x="209" y="174" text-anchor="middle" font-size="17" class="ps1-t">completed 85.0%</text>
<line x1="413" y1="140" x2="413" y2="180" class="ps1-lead"/>
<text x="407" y="196" text-anchor="end" font-size="17" class="ps1-t">pending 13.0%</text>
<line x1="444" y1="140" x2="444" y2="202" class="ps1-lead"/>
<text x="438" y="218" text-anchor="end" font-size="17" class="ps1-t">refunded 2.0%</text>
<line x1="32" y1="238" x2="448" y2="238" class="ps1-div"/>
<text x="32" y="260" font-size="17" class="ps1-m">WHERE 조건 값에 따라 갈리는 plan</text>
<text x="32" y="286" font-size="18" class="ps1-t">'completed' → 85,023행 → Seq Scan</text>
<text x="32" y="308" font-size="18" class="ps1-t">'refunded' → 1,980행 → Bitmap Index Scan</text>
<!-- 아래 패널: amount, histogram -->
<rect x="16" y="336" width="448" height="186" rx="8" class="ps1-panel"/>
<text x="32" y="364" font-size="19" font-weight="600" class="ps1-t">아래: amount 컬럼 (값이 거의 다 다름)</text>
<text x="32" y="388" font-size="18" class="ps1-m">histogram 버킷 100개로 근사한 분포</text>
<rect x="32" y="402" width="416" height="32" class="ps1-bk"/>
<rect x="240" y="402" width="208" height="32" fill="var(--accent, #9d5604)" opacity="0.35"/>
<line x1="73.6" y1="402" x2="73.6" y2="434" class="ps1-tick"/>
<line x1="115.2" y1="402" x2="115.2" y2="434" class="ps1-tick"/>
<line x1="156.8" y1="402" x2="156.8" y2="434" class="ps1-tick"/>
<line x1="198.4" y1="402" x2="198.4" y2="434" class="ps1-tick"/>
<line x1="281.6" y1="402" x2="281.6" y2="434" class="ps1-tick"/>
<line x1="323.2" y1="402" x2="323.2" y2="434" class="ps1-tick"/>
<line x1="364.8" y1="402" x2="364.8" y2="434" class="ps1-tick"/>
<line x1="406.4" y1="402" x2="406.4" y2="434" class="ps1-tick"/>
<line x1="240" y1="394" x2="240" y2="442" class="ps1-cut"/>
<text x="32" y="458" font-size="17" class="ps1-m">0.02</text>
<text x="240" y="458" text-anchor="middle" font-size="17" class="ps1-m">498.78</text>
<text x="448" y="458" text-anchor="end" font-size="17" class="ps1-m">999.99</text>
<text x="32" y="484" font-size="18" class="ps1-t">버킷마다 같은 행 수 → 경계 위치 = 비율</text>
<text x="32" y="508" font-size="18" class="ps1-t">amount &gt; 500 → 49,861행 추정, 실제 49,948행</text>
</svg>
</div>

`status`는 세 값이 MCV를 다 채워 histogram이 필요 없고, `amount`는 반대로 MCV에 걸리는 값이 거의 없어 경계선 101개가 만든 버킷 100개가 분포를 통째로 표현합니다. 버킷마다 담긴 행 수가 같으므로 `amount > 500`은 "경계선 배열에서 500이 어디쯤인가"를 보간하는 문제로 바뀝니다.

## EXPLAIN 출력 한 줄 해석하기

위에서 만든 테이블로 간단한 쿼리를 찍어봅니다.

```sql
EXPLAIN SELECT * FROM orders WHERE amount > 500;
```

```text
 Seq Scan on orders  (cost=0.00..1972.00 rows=49861 width=23)
   Filter: (amount > '500'::numeric)
```

각 숫자의 의미는 이렇습니다.

- `cost=0.00..1972.00`: **startup cost**(첫 행 반환까지)와 **total cost**(전체 완료까지). Seq Scan은 바로 읽기 시작하니 startup이 0입니다. 앞 절의 덧셈을 그대로 대입하면 722페이지 + 100000 × 0.01 + 100000 × 0.0025 = 1972가 나옵니다.
- `rows=49861`: 플래너가 통계로 추정한 반환 행 수.
- `width=23`: 행 하나의 평균 크기(bytes).

여기까지는 전부 추정치입니다. `EXPLAIN ANALYZE`를 붙이면 실제 실행 결과가 함께 나옵니다.

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE amount > 500;
```

```text
 Seq Scan on orders  (cost=0.00..1972.00 rows=49861 width=23)
                     (actual time=0.003..6.633 rows=49948.00 loops=1)
   Filter: (amount > '500'::numeric)
   Rows Removed by Filter: 50052
   Buffers: shared hit=722
 Planning Time: 0.015 ms
 Execution Time: 8.209 ms
```

같은 노드에 괄호가 두 개 붙었습니다. 앞 괄호는 플래너가 실행 전에 계산한 값이고, 뒤 괄호는 실제로 돌려본 결과입니다. 실제 `psql`은 이 둘을 한 줄에 붙여서 출력하는데, 여기서는 폭에 맞추려고 뒤 괄호를 아랫줄로 내렸습니다. 헷갈리는 지점은 `rows=`가 양쪽에 한 번씩 나온다는 것입니다.

실측 쪽 `rows`에 소수점 두 자리가 붙는 것은 PostgreSQL 18부터입니다. 이 숫자는 원래 `loops`로 나눈 평균이라, 예전처럼 정수로 반올림하면 한 행도 못 찾은 노드와 두 번에 한 번꼴로 한 행씩 찾은 노드가 똑같이 `rows=0`으로 보였습니다. 이제는 `rows=0.00`과 `rows=0.50`으로 갈립니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 586" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="EXPLAIN 한 노드의 앞 괄호는 cost와 rows와 width로 된 추정치이고 뒤 괄호는 actual time과 rows와 loops로 된 실측치이며, 양쪽의 rows를 비교하는 것이 진단의 출발점임을 보여주는 그림">
<style>
.ps2-t { fill: var(--text, #1c1917); }
.ps2-m { fill: var(--text-muted, #6d6762); }
.ps2-c { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--text, #1c1917); }
.ps2-key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; fill: var(--primary, #0a756c); font-weight: 600; }
.ps2-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps2-hl { fill: var(--bg-muted, #eeecea); }
.ps2-band { fill: var(--bg-muted, #eeecea); }
.ps2-arr { stroke: var(--primary, #0a756c); stroke-width: 2; }
.ps2-arrh { fill: var(--primary, #0a756c); }
</style>
<!-- 제목 -->
<text x="240" y="28" text-anchor="middle" font-size="21" font-weight="600" class="ps2-t">한 노드에 붙는 추정과 실측</text>
<!-- 위: 추정치 -->
<rect x="16" y="48" width="448" height="204" rx="8" class="ps2-box"/>
<text x="32" y="76" font-size="19" font-weight="600" class="ps2-t">위: EXPLAIN이 내놓는 추정치</text>
<text x="32" y="104" font-size="19" class="ps2-c">cost=0.00..1972.00</text>
<text x="44" y="126" font-size="17" class="ps2-m">첫 행까지 0.00, 전체 완료까지 1972.00</text>
<text x="32" y="154" font-size="19" class="ps2-c">width=23</text>
<text x="44" y="176" font-size="17" class="ps2-m">행 하나의 평균 크기, 바이트 단위</text>
<rect x="26" y="188" width="134" height="27" rx="4" class="ps2-hl"/>
<text x="32" y="207" font-size="19" class="ps2-key">rows=49861</text>
<text x="44" y="234" font-size="17" class="ps2-m">플래너가 통계로 추정한 행 수</text>
<!-- 연결 -->
<polygon points="100,254 94,264 106,264" class="ps2-arrh"/>
<line x1="100" y1="264" x2="100" y2="280" class="ps2-arr"/>
<polygon points="100,290 94,280 106,280" class="ps2-arrh"/>
<text x="116" y="278" font-size="18" font-weight="600" class="ps2-t">이 둘을 비교</text>
<!-- 아래: 실측치 -->
<rect x="16" y="294" width="448" height="204" rx="8" class="ps2-box"/>
<text x="32" y="322" font-size="19" font-weight="600" class="ps2-t">아래: ANALYZE가 더해주는 실측치</text>
<rect x="26" y="334" width="164" height="27" rx="4" class="ps2-hl"/>
<text x="32" y="353" font-size="19" class="ps2-key">rows=49948.00</text>
<text x="44" y="380" font-size="17" class="ps2-m">실제로 반환된 행 수</text>
<text x="32" y="408" font-size="19" class="ps2-c">actual time=0.003..6.633</text>
<text x="44" y="430" font-size="17" class="ps2-m">첫 행 0.003ms, 마지막 행 6.633ms</text>
<text x="32" y="458" font-size="19" class="ps2-c">loops=1</text>
<text x="44" y="480" font-size="17" class="ps2-m">이 노드가 실행된 횟수</text>
<!-- 결론 -->
<rect x="16" y="514" width="448" height="62" rx="8" class="ps2-band"/>
<text x="240" y="542" text-anchor="middle" font-size="20" font-weight="600" class="ps2-t">같은 rows=인데 앞은 추정, 뒤는 실측</text>
<text x="240" y="566" text-anchor="middle" font-size="17" class="ps2-m">49,861 대 49,948이면 오차 0.2%</text>
</svg>
</div>

`actual time=0.003..6.633`의 앞 숫자는 첫 행이 나오기까지 걸린 시간, 뒷 숫자는 마지막 행까지 걸린 시간(ms)입니다. `loops=1`은 이 노드가 한 번만 실행됐다는 뜻입니다.

추정 49861, 실제 49948. 오차는 0.2% 수준이고, 이 정도면 통계가 현실을 잘 따라가고 있다고 봐도 됩니다.

버퍼 캐시 상황을 알려주는 `Buffers:` 줄은 PostgreSQL 18부터 `EXPLAIN ANALYZE`에 기본으로 따라붙습니다. 17 이하에서는 아래처럼 직접 켜야 같은 줄이 나오고, 반대로 18에서 이 줄이 거슬리면 `BUFFERS OFF`로 끕니다.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE amount > 500;
```

앞의 출력에 찍힌 `shared hit=722`는 이미 한 번 돌려본 뒤라 722페이지가 전부 메모리에 있었다는 뜻입니다. 서버를 막 재시작해 캐시가 빈 상태에서 같은 쿼리를 찍으면 이렇게 바뀝니다.

```text
 Seq Scan on orders  (cost=0.00..1972.00 rows=49861 width=23)
                     (actual time=0.079..6.430 rows=49948.00 loops=1)
   Filter: (amount > '500'::numeric)
   Rows Removed by Filter: 50052
   Buffers: shared read=722
 Planning:
   Buffers: shared hit=49 read=16
 Planning Time: 0.190 ms
 Execution Time: 7.803 ms
```

- `shared hit`: `shared_buffers`(메모리)에서 바로 가져온 8KB 페이지 수
- `shared read`: 메모리에 없어서 디스크(또는 OS 캐시)까지 갔던 페이지 수
- `Planning:` 아래의 `Buffers`: 실행이 아니라 **계획을 세우는 동안** 읽은 페이지입니다. 통계와 카탈로그를 읽느라 발생합니다.

같은 쿼리를 한 번 더 돌리면 같은 자리가 이렇게 바뀝니다.

```text
   Buffers: shared hit=722
 Planning:
   Buffers: shared hit=65
 Planning Time: 0.133 ms
 Execution Time: 6.992 ms
```

722페이지가 통째로 `read`에서 `hit`으로 넘어갔고, 계획 단계의 `read=16`도 사라졌습니다. plan은 한 글자도 바뀌지 않았는데 실행 시간만 7.803ms에서 6.992ms로 줄었습니다. 722페이지짜리 테이블이라 차이가 1ms 남짓이지만, 같은 비율이 수십만 페이지에서는 초 단위로 벌어집니다. "EXPLAIN만 봤을 땐 빨라 보였는데 실제로는 느리다"는 상황은 대개 이 `read` 값 때문이지 plan 탓이 아닙니다.

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

```text
 Nested Loop  (cost=4.66..50.48 rows=10 width=26)
              (actual time=0.006..0.010 rows=11.00 loops=1)
   Buffers: shared hit=16
   ->  Index Scan using users_pkey on users u
           (cost=0.29..8.30 rows=1 width=28)
           (actual time=0.002..0.002 rows=1.00 loops=1)
         Index Cond: (id = 42)
         Index Searches: 1
         Buffers: shared hit=3
   ->  Bitmap Heap Scan on orders o
           (cost=4.37..42.08 rows=10 width=14)
           (actual time=0.003..0.006 rows=11.00 loops=1)
         Recheck Cond: (user_id = 42)
         Heap Blocks: exact=11
         Buffers: shared hit=13
         ->  Bitmap Index Scan on orders_user_id_idx
                 (cost=0.00..4.37 rows=10 width=0)
                 (actual time=0.001..0.001 rows=11.00 loops=1)
               Index Cond: (user_id = 42)
               Index Searches: 1
               Buffers: shared hit=2
 Planning Time: 0.019 ms
 Execution Time: 0.014 ms
```

plan 트리를 읽는 규칙은 두 가지입니다.

- **안쪽이 먼저 실행됩니다.**(들여쓰기 깊은 노드) 바깥 노드는 안쪽의 출력을 입력으로 받습니다.
- **`loops`는 바깥 노드가 이 노드를 몇 번 호출했는지**입니다. Nested Loop에서 안쪽 노드의 실제 비용은 `actual time × loops`로 대략 계산합니다.

가장 안쪽의 `Bitmap Index Scan`이 먼저 돌아 `user_id = 42`인 위치를 모으고, `Bitmap Heap Scan`이 그 위치로 힙 블록 11개를 읽고, 마지막으로 `Nested Loop`가 `users`의 1행과 붙입니다. 결국 `users`에서 1행(id=42)을 뽑고 그 1행에 대해 `orders` 쪽을 한 번 조회해 11행을 가져온 것입니다. 추정 10행에 실제 11행이니 이쪽도 추정이 정확했습니다.

인덱스 노드에 붙은 `Index Searches: 1`도 PostgreSQL 18에서 새로 생긴 줄입니다. 인덱스를 처음부터 다시 타고 내려간 횟수라, `= ANY (...)`나 스킵 스캔처럼 한 노드 안에서 트리를 여러 번 뒤지는 경우에 1보다 큰 값이 찍힙니다.

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

```text
 Seq Scan on addresses  (cost=0.00..1700.00 rows=3813 width=17)
                        (actual time=0.003..3.240 rows=10000.00 loops=1)
   Filter: ((country = 'KR'::text) AND (city = 'Seoul'::text))
   Rows Removed by Filter: 70000
   Buffers: shared hit=500
```

`pg_stats`를 열어 보면 MCV에 `country`의 `KR`이 0.3765, `city`의 `Seoul`이 0.1266으로 잡혀 있습니다. 플래너는 두 조건이 무관하다고 보고 그냥 곱합니다. 0.3765 × 0.1266 = 0.04767, 여기에 8만 행을 곱해 3813행을 예상했습니다. 실제로는 `Seoul`이 `KR`에만 있어서 두 번째 조건이 첫 번째 조건을 하나도 걸러내지 못하고, `city = 'Seoul'`인 10000행이 그대로 남습니다. 2.6배 어긋난 것입니다.

이 오차가 이 노드에서 끝나지 않는다는 점이 문제입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 486" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="두 컬럼을 독립으로 가정해 선택도를 곱하면 3813행을 추정하지만 실제로는 10000행이 나오고, 이 노드가 조인의 바깥이면 플래너가 Nested Loop를 골라 실제 반복 횟수가 추정의 2.6배로 늘어나는 연쇄를 보여주는 그림">
<style>
.ps3-t { fill: var(--text, #1c1917); }
.ps3-m { fill: var(--text-muted, #6d6762); }
.ps3-neutral { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ps3-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.ps3-warn { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
.ps3-badt { fill: var(--text-danger, #cb2121); }
.ps3-warnt { fill: var(--text-warn, #9d5604); }
.ps3-arr { stroke: var(--text-muted, #6d6762); stroke-width: 2; }
.ps3-arrh { fill: var(--text-muted, #6d6762); }
</style>
<!-- 제목 -->
<text x="240" y="28" text-anchor="middle" font-size="21" font-weight="600" class="ps3-t">3,813 대 10,000이 남기는 것</text>
<!-- 1단계 -->
<rect x="24" y="46" width="432" height="66" rx="8" class="ps3-neutral"/>
<text x="42" y="74" font-size="20" class="ps3-t">MCV: KR 0.3765, Seoul 0.1266</text>
<text x="42" y="98" font-size="18" class="ps3-m">두 조건을 서로 독립으로 가정</text>
<line x1="240" y1="114" x2="240" y2="128" class="ps3-arr"/>
<polygon points="240,136 233,128 247,128" class="ps3-arrh"/>
<!-- 2단계 -->
<rect x="24" y="136" width="432" height="66" rx="8" class="ps3-neutral"/>
<text x="42" y="164" font-size="20" class="ps3-t">0.3765 × 0.1266 = 0.04767</text>
<text x="42" y="188" font-size="18" class="ps3-m">80,000행 × 0.04767 ≈ 3,813행 추정</text>
<line x1="240" y1="204" x2="240" y2="218" class="ps3-arr"/>
<polygon points="240,226 233,218 247,218" class="ps3-arrh"/>
<!-- 3단계 -->
<rect x="24" y="226" width="432" height="66" rx="8" class="ps3-bad"/>
<text x="42" y="254" font-size="20" font-weight="600" class="ps3-badt">실제로는 Seoul이 KR에만 존재</text>
<text x="42" y="278" font-size="18" class="ps3-t">10,000행이 남아 추정의 2.6배</text>
<line x1="240" y1="294" x2="240" y2="308" class="ps3-arr"/>
<polygon points="240,316 233,308 247,308" class="ps3-arrh"/>
<!-- 4단계 -->
<rect x="24" y="316" width="432" height="66" rx="8" class="ps3-warn"/>
<text x="42" y="344" font-size="20" font-weight="600" class="ps3-warnt">이 노드가 조인의 바깥이면</text>
<text x="42" y="368" font-size="18" class="ps3-t">3,813행을 기준으로 Nested Loop 선택</text>
<line x1="240" y1="384" x2="240" y2="398" class="ps3-arr"/>
<polygon points="240,406 233,398 247,398" class="ps3-arrh"/>
<!-- 5단계 -->
<rect x="24" y="406" width="432" height="66" rx="8" class="ps3-bad"/>
<text x="42" y="434" font-size="20" font-weight="600" class="ps3-badt">실제로는 10,000번 반복</text>
<text x="42" y="458" font-size="18" class="ps3-t">안쪽 조회가 2.6배</text>
</svg>
</div>

행 수 추정은 그 노드 하나의 문제로 끝나지 않고 위쪽 노드의 입력이 됩니다. 바깥이 3,813행일 줄 알고 Nested Loop를 골랐는데 실제로 10,000행이 들어오면, 안쪽 인덱스 조회가 그만큼 더 돌아갑니다. 조인이 두세 단 겹치면 이 배수가 곱해집니다.

PostgreSQL 10부터 이걸 교정할 수 있습니다.

```sql
CREATE STATISTICS addr_stats (dependencies, ndistinct)
ON country, city FROM addresses;
ANALYZE addresses;

EXPLAIN ANALYZE
SELECT * FROM addresses
WHERE country = 'KR' AND city = 'Seoul';
```

```text
 Seq Scan on addresses  (cost=0.00..1700.00 rows=9984 width=17)
                        (actual time=0.004..3.449 rows=10000.00 loops=1)
   Filter: ((country = 'KR'::text) AND (city = 'Seoul'::text))
   Rows Removed by Filter: 70000
   Buffers: shared hit=500
```

추정 9984에 실제 10000, 오차 0.2%입니다. `dependencies`가 "city 값을 알면 country가 정해진다"는 함수 종속을 표본에서 찾아내 두 조건을 곱하지 않도록 막아준 결과입니다. 두 컬럼이 강하게 연관된 경우 `CREATE STATISTICS`는 거의 항상 효과가 있습니다.

### 3. 극단적인 스큐

어떤 컬럼은 값 하나가 99%를 차지하고 나머지가 여기저기 흩어져 있을 수 있습니다. 기본 MCV 슬롯(100개)이 이걸 다 담지 못하면 histogram 쪽 추정이 엉킵니다.

컬럼별로 샘플 크기를 늘릴 수 있습니다.

```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;
```

이 값은 `most_common_vals`와 `histogram_bounds`에 들어갈 수 있는 최대 항목 수인 동시에 표본 크기를 정합니다. `ANALYZE`는 목표값 × 300행을 표본으로 뽑으므로, 기본값 100이면 3만 행을 읽고 1000이면 30만 행을 읽습니다. 실제로 `ANALYZE VERBOSE`를 찍어보면 기본 설정에서 `30000 rows in sample`이라고 나옵니다.

목표값의 상한은 10000입니다. 다만 올린 만큼 `ANALYZE` 시간과 플래너의 통계 조회 비용이 함께 늘어나므로, 문제가 확인된 컬럼에만 올리는 편이 낫습니다. 테이블 전체의 기본값은 `default_statistics_target`으로 조절합니다.

### 4. 표현식에 감싼 컬럼

```sql
SELECT * FROM users WHERE lower(email) = 'admin@example.com';
```

플래너는 `lower(email)`이라는 표현식 값의 분포를 모릅니다. `pg_statistic`에는 `email` 컬럼의 원본 분포만 있기 때문입니다. 결과적으로 등치 조건에 붙는 기본 선택도 0.5%가 그대로 적용됩니다. `email`이 UNIQUE라 1행만 나올 것이 뻔한데도 1만 행짜리 `users`에서 `rows=50`이라는 추정이 나옵니다.

```text
 Seq Scan on users  (cost=0.00..224.00 rows=50 width=28)
   Filter: (lower(email) = 'admin@example.com'::text)
```

해법은 **표현식 인덱스 + 그 인덱스에 대한 통계 생성**입니다.

```sql
CREATE INDEX users_email_lower ON users (lower(email));
ANALYZE users;
```

표현식 인덱스를 만들면 `ANALYZE`가 `lower(email)` 값 자체의 통계를 따로 수집합니다. 그때부터 추정이 제자리를 찾습니다.

```text
 Index Scan using users_email_lower on users  (cost=0.29..8.30 rows=1 width=28)
   Index Cond: (lower(email) = 'admin@example.com'::text)
```

`rows=50`이 `rows=1`이 되면서 plan도 Seq Scan에서 Index Scan으로 바뀌었습니다.

## 실전에서는

bad plan을 만났을 때 확인 순서를 정해두면 디버깅이 빨라집니다.

**1. 일단 `EXPLAIN`부터 찍습니다.** `ANALYZE` 옵션을 함께 주고, 17 이하라면 `BUFFERS`도 붙입니다. 추정 행과 실제 행의 비율이 10배 이상 벌어진 노드가 있는지 봅니다. 이게 원인 후보입니다.

**2. 해당 테이블의 `last_autoanalyze`를 확인합니다.**

```sql
SELECT relname, n_mod_since_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = '문제_테이블';
```

며칠째 갱신이 없거나 `n_mod_since_analyze`가 크면 수동 `ANALYZE`부터 돌려봅니다.

**3. 한 번만 느린 쿼리는 `auto_explain`으로 잡습니다.** 재현이 어려운 slow query는 항상 로그에 남겨둡니다.

```ini
# postgresql.conf
shared_preload_libraries = 'auto_explain'
auto_explain.log_min_duration = '500ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on
```

500ms 넘는 쿼리는 전부 plan과 함께 로그에 찍힙니다. 이벤트 순간의 plan을 나중에 볼 수 있다는 것만으로도 원인 파악이 쉬워집니다.

**4. "cost는 낮은데 실제로 느림"은 대체로 버퍼 미스입니다.** `Buffers: read=` 값이 크면 `shared_buffers` 크기나 워밍업 상태를 먼저 의심합니다. plan이 문제가 아닐 수 있습니다.

## 흔한 오해

- **"cost 숫자가 작으면 빠른 쿼리다"**: cost는 상대 비용입니다. 같은 쿼리의 plan끼리 비교할 때만 의미가 있고, 서로 다른 쿼리의 cost를 두고 "이게 더 빠르다"고 말할 수는 없습니다.
- **"ANALYZE는 인덱스를 갱신한다"**: `ANALYZE`는 통계만 갱신합니다. 인덱스 재구축과는 무관합니다.
- **"`VACUUM`을 돌리면 통계도 갱신된다"**: 기본 `VACUUM`은 통계를 건드리지 않습니다. `VACUUM ANALYZE`이거나 autovacuum에 딸린 autoanalyze가 돌아야 합니다.
- **"추정치 오차는 테이블이 작을수록 덜 나온다"**: 오히려 반대에 가깝습니다. 작은 테이블은 Seq Scan이 어차피 이겨서 오차가 드러나지 않을 뿐이고, 테이블이 커지는 순간 같은 오차가 plan을 뒤집습니다.

## 마치며

플래너는 실제 데이터를 보지 않습니다. `pg_statistic`에 박힌 숫자 몇 개로 비용을 추정하고, 가장 싼 plan을 고를 뿐입니다. 그 추정이 맞아야 plan도 맞습니다. `EXPLAIN ANALYZE`에서 추정 행과 실제 행의 괴리가 곧 진단의 출발점입니다.

다음 글에서는 같은 통계를 받아든 플래너가 Nested Loop, Hash Join, Merge Join 중 무엇을 왜 고르는지 살펴봅니다. 세 알고리즘의 cost 공식이 데이터 크기와 메모리 한계에서 어떻게 교차하는지가 핵심입니다.

## 참고자료

- PostgreSQL 18 공식 문서: [14.1. Using EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)
- [14.2. Statistics Used by the Planner](https://www.postgresql.org/docs/18/planner-stats.html): n_distinct, MCV, histogram, 확장 통계 개요
- [EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html): ANALYZE, BUFFERS, SETTINGS 등 옵션 목록
- [pg_stats](https://www.postgresql.org/docs/18/view-pg-stats.html): most_common_vals, most_common_freqs, histogram_bounds 컬럼 정의
- [69.1. Row Estimation Examples](https://www.postgresql.org/docs/18/row-estimation-examples.html): selectivity 계산을 손으로 따라가는 예제
- [69.2. Multivariate Statistics Examples](https://www.postgresql.org/docs/18/multivariate-statistics-examples.html): dependencies, ndistinct가 추정을 어떻게 고치는지
- [CREATE STATISTICS](https://www.postgresql.org/docs/18/sql-createstatistics.html): 확장 통계 문법과 통계 종류
- [19.7. Query Planning](https://www.postgresql.org/docs/18/runtime-config-query.html): seq_page_cost, random_page_cost 등 비용 상수와 default_statistics_target
- [auto_explain](https://www.postgresql.org/docs/18/auto-explain.html): 느린 쿼리의 plan을 로그로 남기는 확장
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 3: Query Processing](https://www.interdb.jp/pg/pgsql03.html)
