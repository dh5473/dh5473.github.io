---
date: '2026-05-11'
title: 'ClickHouse는 왜 빠른가: 컬럼 지향 OLAP 엔진의 설계 철학'
category: 'Database'
series: 'clickhouse'
seriesOrder: 1
tags: ['ClickHouse', 'OLAP', 'Column Store', 'MergeTree']
summary: '1억 행 집계가 RDB에서 30초, ClickHouse에서 0.3초인 이유를 컬럼 저장, 벡터화 실행, 데이터 압축, MergeTree 구조의 설계 원리로 풀어냅니다.'
thumbnail: './thumbnail.png'
---

1억 행짜리 주문 테이블에서 `SELECT avg(price) FROM orders`를 실행합니다. PostgreSQL에서 30초, ClickHouse에서 0.3초. 100배 차이입니다. 하드웨어는 같은데 왜 이런 격차가 벌어질까요?

답은 "ClickHouse가 빠른 DB라서"가 아닙니다. 두 데이터베이스가 **근본적으로 다른 문제를 풀도록 설계**됐기 때문입니다. PostgreSQL은 특정 행을 빠르게 읽고 쓰는 데 최적화되어 있고, ClickHouse는 대량의 행에서 소수의 컬럼만 집계하는 데 최적화되어 있습니다. 이 한 가지 차이가 스토리지 레이아웃, 실행 엔진, 압축 전략, 심지어 INSERT 방식까지 완전히 다른 설계를 요구합니다.

<br>

이 글에서는 그 설계 차이의 핵심을 따라갑니다. OLTP와 OLAP 워크로드가 왜 같은 엔진으로 커버되지 않는지, 컬럼 저장이 왜 집계에 압도적인지, ClickHouse가 어떤 선택들로 그 장점을 극대화했는지. 그리고 Docker에서 직접 실험을 돌려 눈으로 확인합니다.

## OLTP vs OLAP: 같은 SQL, 다른 세계

데이터베이스 워크로드는 크게 두 종류로 나뉩니다.

**OLTP(Online Transaction Processing)**는 "이 사용자의 주문 1건을 조회한다", "이 상품의 재고를 1 줄인다" 같은 작업입니다. 한 번에 건드리는 행은 적지만, 그 행의 모든 컬럼을 읽거나 써야 하고, 초당 수천~수만 건의 트랜잭션을 동시에 처리해야 합니다.

**OLAP(Online Analytical Processing)**는 "지난달 전체 주문의 평균 가격은?", "카테고리별 매출 추이는?" 같은 작업입니다. 수억 행을 훑되, 실제로 필요한 컬럼은 1\~3개뿐이고, 트랜잭션 격리보다는 처리 속도가 중요합니다.

이 차이가 스토리지 설계를 어떻게 갈라놓는지 봅시다.

| 특성 | OLTP | OLAP |
|------|------|------|
| 접근 패턴 | 특정 행 1~수십 건 | 수억 행 스캔 |
| 필요 컬럼 | 행의 전체 컬럼 | 1~5개 컬럼 |
| 핵심 연산 | INSERT, UPDATE, DELETE | GROUP BY, SUM, AVG, COUNT |
| 동시성 | 수천 트랜잭션 | 수십 쿼리 |
| 대표 DB | PostgreSQL, MySQL | ClickHouse, BigQuery |

OLTP에서는 "한 행의 모든 컬럼을 한 번에 읽는" 구조가 유리합니다. 사용자 정보를 조회할 때 이름, 이메일, 주소를 따로따로 가져오는 것보다 한 블록에서 한꺼번에 읽는 게 빠르기 때문입니다. 그래서 PostgreSQL과 MySQL은 **행(row) 단위**로 데이터를 저장합니다.

반면 OLAP에서는 상황이 정반대입니다. 1억 행의 `avg(price)`를 구할 때 `user_name`, `address`, `phone` 같은 컬럼은 전혀 필요 없습니다. 행 기반 저장소에서는 그 불필요한 컬럼까지 전부 디스크에서 읽어야 합니다.

OLAP에는 또 한 가지 중요한 특성이 있습니다. UPDATE가 거의 없다는 점입니다. 로그, 이벤트, 센서 데이터는 한번 기록되면 수정되지 않습니다. 행 단위 수정을 포기할 수 있다면, 데이터를 완전히 다른 방식으로 배치할 수 있습니다. 컬럼 지향 저장이 가능해지는 전제 조건입니다.

## Row store vs Column store: 디스크 I/O의 관점

5개 컬럼, 1억 행짜리 `orders` 테이블을 두 가지 방식으로 저장한다고 생각해봅시다.

| order_id | user_id | price | category | created |
|---|---|---|---|---|
| 1 | 42 | 29900 | 전자제품 | 2026-01 |
| 2 | 17 | 5900 | 도서 | 2026-01 |
| ... | ... | ... | ... | ... |

### Row store (PostgreSQL 방식)

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 284" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="행 지향 저장에서는 한 행의 다섯 개 컬럼이 디스크 블록에 나란히 붙어 저장되므로, price 컬럼 하나만 필요한 집계에도 모든 컬럼을 함께 읽어야 한다는 것을 보여주는 그림">
<style>
.ch1-title { fill: var(--text, #1c1917); font-size: 21px; font-weight: 700; }
.ch1-lbl { fill: var(--text-muted, #6d6762); font-size: 18px; }
.ch1-cap { fill: var(--text-muted, #6d6762); font-size: 18px; }
.ch1-t { fill: var(--text-muted, #6d6762); font-size: 17px; }
.ch1-hit { fill: var(--primary, #0a756c); font-size: 17px; font-weight: 700; }
.ch1-cell { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ch1-cell-hit { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 2; }
</style>
<text class="ch1-title" x="240" y="28" text-anchor="middle">행 지향: 한 행이 통째로 붙어 있음</text>
<!-- block 1 -->
<text class="ch1-lbl" x="10" y="58">디스크 블록 1</text>
<rect class="ch1-cell" x="10" y="66" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="102" y="66" width="92" height="34" rx="4"/>
<rect class="ch1-cell-hit" x="194" y="66" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="286" y="66" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="378" y="66" width="92" height="34" rx="4"/>
<text class="ch1-t" x="56" y="88" text-anchor="middle">order_id</text>
<text class="ch1-t" x="148" y="88" text-anchor="middle">user_id</text>
<text class="ch1-hit" x="240" y="88" text-anchor="middle">price</text>
<text class="ch1-t" x="332" y="88" text-anchor="middle">category</text>
<text class="ch1-t" x="424" y="88" text-anchor="middle">created</text>
<rect class="ch1-cell" x="10" y="104" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="102" y="104" width="92" height="34" rx="4"/>
<rect class="ch1-cell-hit" x="194" y="104" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="286" y="104" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="378" y="104" width="92" height="34" rx="4"/>
<text class="ch1-t" x="56" y="126" text-anchor="middle">order_id</text>
<text class="ch1-t" x="148" y="126" text-anchor="middle">user_id</text>
<text class="ch1-hit" x="240" y="126" text-anchor="middle">price</text>
<text class="ch1-t" x="332" y="126" text-anchor="middle">category</text>
<text class="ch1-t" x="424" y="126" text-anchor="middle">created</text>
<!-- block 2 -->
<text class="ch1-lbl" x="10" y="164">디스크 블록 2</text>
<rect class="ch1-cell" x="10" y="172" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="102" y="172" width="92" height="34" rx="4"/>
<rect class="ch1-cell-hit" x="194" y="172" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="286" y="172" width="92" height="34" rx="4"/>
<rect class="ch1-cell" x="378" y="172" width="92" height="34" rx="4"/>
<text class="ch1-t" x="56" y="194" text-anchor="middle">order_id</text>
<text class="ch1-t" x="148" y="194" text-anchor="middle">user_id</text>
<text class="ch1-hit" x="240" y="194" text-anchor="middle">price</text>
<text class="ch1-t" x="332" y="194" text-anchor="middle">category</text>
<text class="ch1-t" x="424" y="194" text-anchor="middle">created</text>
<text class="ch1-lbl" x="240" y="228" text-anchor="middle">... 1억 행까지 같은 배치</text>
<!-- caption -->
<text class="ch1-cap" x="240" y="262" text-anchor="middle">avg(price)에 필요한 칸은 price뿐</text>
</svg>
</div>

한 행의 모든 컬럼이 연속으로 저장됩니다. `SELECT * FROM orders WHERE order_id = 42` 같은 OLTP 쿼리에 최적입니다. 인덱스로 해당 행의 위치를 찾으면, 한 번의 디스크 읽기로 그 행의 모든 컬럼을 가져올 수 있습니다.

### Column store (ClickHouse 방식)

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 356" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="컬럼 지향 저장에서는 컬럼마다 별도의 파일이 만들어져, avg(price) 쿼리가 price.bin 파일 하나만 읽고 나머지 네 개 파일은 열지 않는다는 것을 보여주는 그림">
<style>
.ch2-title { fill: var(--text, #1c1917); font-size: 21px; font-weight: 700; }
.ch2-name { fill: var(--text-muted, #6d6762); font-size: 18px; }
.ch2-name-hit { fill: var(--primary, #0a756c); font-size: 18px; font-weight: 700; }
.ch2-val { fill: var(--text-muted, #6d6762); font-size: 17px; }
.ch2-val-hit { fill: var(--primary, #0a756c); font-size: 17px; }
.ch2-tag { fill: var(--text-muted, #6d6762); font-size: 17px; }
.ch2-tag-hit { fill: var(--primary, #0a756c); font-size: 17px; font-weight: 700; }
.ch2-cap { fill: var(--text-muted, #6d6762); font-size: 18px; }
.ch2-bar { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ch2-bar-hit { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 2; }
</style>
<text class="ch2-title" x="240" y="28" text-anchor="middle">컬럼 지향: 컬럼마다 파일이 따로</text>
<!-- order_id -->
<text class="ch2-name" x="10" y="84">order_id.bin</text>
<rect class="ch2-bar" x="132" y="60" width="256" height="34" rx="4"/>
<text class="ch2-val" x="144" y="83">1, 2, 3, 4, ...</text>
<text class="ch2-tag" x="398" y="83">✕ 스킵</text>
<!-- user_id -->
<text class="ch2-name" x="10" y="128">user_id.bin</text>
<rect class="ch2-bar" x="132" y="104" width="256" height="34" rx="4"/>
<text class="ch2-val" x="144" y="127">42, 17, 88, ...</text>
<text class="ch2-tag" x="398" y="127">✕ 스킵</text>
<!-- price -->
<text class="ch2-name-hit" x="10" y="172">price.bin</text>
<rect class="ch2-bar-hit" x="132" y="148" width="256" height="34" rx="4"/>
<text class="ch2-val-hit" x="144" y="171">29900, 5900, ...</text>
<text class="ch2-tag-hit" x="398" y="171">✓ 읽음</text>
<!-- category -->
<text class="ch2-name" x="10" y="216">category.bin</text>
<rect class="ch2-bar" x="132" y="192" width="256" height="34" rx="4"/>
<text class="ch2-val" x="144" y="215">전자제품, 도서, ...</text>
<text class="ch2-tag" x="398" y="215">✕ 스킵</text>
<!-- created -->
<text class="ch2-name" x="10" y="260">created.bin</text>
<rect class="ch2-bar" x="132" y="236" width="256" height="34" rx="4"/>
<text class="ch2-val" x="144" y="259">2026-01, ...</text>
<text class="ch2-tag" x="398" y="259">✕ 스킵</text>
<!-- caption -->
<text class="ch2-cap" x="240" y="308" text-anchor="middle">avg(price)가 여는 파일은 price.bin 하나</text>
<text class="ch2-cap" x="240" y="332" text-anchor="middle">5개 컬럼 중 1개, 디스크 I/O는 1/5</text>
</svg>
</div>

같은 컬럼의 값들이 연속으로 저장됩니다. 이제 `SELECT avg(price) FROM orders`가 어떻게 달라지는지 봅시다.

**Row store**: 1억 행 × 5개 컬럼 전부를 디스크에서 읽고, 그중 `price`만 꺼내서 집계합니다. 필요한 데이터는 전체의 20%인데 100%를 읽어야 합니다.

**Column store**: `price.bin` 파일만 읽습니다. 나머지 4개 컬럼 파일은 열지도 않습니다. **디스크 I/O가 1/5로 줄어듭니다.**

실제로는 컬럼이 5개보다 훨씬 많습니다. 실무의 이벤트 테이블은 50\~100개 컬럼이 흔한데, 그중 집계에 쓰이는 건 2\~3개뿐인 경우가 대부분입니다. 100개 컬럼 중 2개만 읽으면 I/O가 **1/50**로 줄어드는 셈입니다.

숫자로 감을 잡아봅시다. 1억 행, 50개 컬럼, 컬럼당 평균 8바이트라고 가정하면 전체 데이터는 약 40GB입니다. Row store에서 `avg(price)`를 구하면 40GB를 읽어야 합니다. Column store에서는 `price` 컬럼 800MB만 읽으면 됩니다. SSD의 순차 읽기 속도가 3GB/s라면, row store는 13.3초, column store는 0.27초입니다. 여기에 압축까지 더하면 800MB가 100\~200MB로 줄어들고, 읽기 시간은 0.05초 이하가 됩니다. 서두에서 말한 100배 차이가 이런 구조에서 나옵니다.

### 압축까지 더해지면

컬럼 저장의 두 번째 장점은 **압축 효율**입니다. 같은 타입의 값이 연속으로 나열되면 패턴이 반복될 가능성이 높습니다. `category` 컬럼에 "전자제품"이 수백만 번 반복되면 압축률이 극도로 높아지고, `created` 컬럼의 타임스탬프는 정렬되어 있으면 인접 값의 차이(delta)가 작아서 Delta 인코딩으로 수십 배 압축됩니다.

Row store에서는 `[42, 29900, '전자제품', '2026-01-05']`처럼 서로 다른 타입의 값이 뒤섞이기 때문에 이런 압축이 불가능합니다.

ClickHouse 공식 블로그에 따르면, nginx 로그 데이터를 ClickHouse에 저장했을 때 원본 대비 **170배 압축**을 달성한 사례가 있습니다. ClickBench의 1억 행 hits 데이터셋에서도 같은 데이터를 PostgreSQL은 약 99GiB로, ClickHouse는 약 14GiB로 저장합니다. 7배 차이입니다.

## ClickHouse의 설계 선택들

컬럼 저장만으로 빠른 건 아닙니다. BigQuery, Redshift, Apache Druid 모두 컬럼 지향입니다. ClickHouse가 특히 빠른 이유는 컬럼 저장 위에 **벡터화 실행**, **적극적 압축**, **멀티코어 병렬 처리**를 쌓았기 때문입니다.

### 벡터화 실행 (Vectorized Execution)

전통적인 RDBMS의 실행 엔진은 Volcano 모델이라고 불리는 방식으로 동작합니다. 상위 노드가 하위 노드에 "다음 행을 달라"고 요청하면, 하위 노드가 튜플 하나를 건네주고, 상위가 처리한 뒤 다시 요청하는 pull 기반 반복입니다. PostgreSQL의 executor가 정확히 이 모델입니다. 직관적이지만 한 행마다 가상 함수 호출이 발생하고, 행 단위 해석 오버헤드가 쌓입니다.

ClickHouse는 다릅니다. 한 번에 최대 **65,536개의 값**(기본 `max_block_size`)을 하나의 컬럼 벡터로 묶어서 처리합니다. 같은 연산을 수만 개의 값에 루프로 돌리면 **SIMD(Single Instruction Multiple Data)** 명령어를 활용할 수 있습니다. ClickHouse는 컴파일러의 자동 벡터화뿐 아니라 핵심 연산에 직접 작성된 SIMD 인트린식도 포함하고 있습니다. AVX2 레지스터 하나가 256비트이니, 32비트 정수 8개를 한 번의 CPU 명령으로 처리할 수 있는 것입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 470" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="위쪽은 Volcano 모델이 행 하나마다 필터와 집계를 호출해 1억 번 반복하는 모습, 아래쪽은 벡터화 모델이 65,536행 블록 단위로 SIMD 필터와 집계를 수행해 약 1,500번만 반복하는 모습을 비교한 그림">
<style>
.ch3-title { fill: var(--text, #1c1917); font-size: 21px; font-weight: 700; }
.ch3-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ch3-box-v { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 2; }
.ch3-t { fill: var(--text, #1c1917); font-size: 18px; }
.ch3-tv { fill: var(--primary, #0a756c); font-size: 18px; font-weight: 700; }
.ch3-note { fill: var(--text-muted, #6d6762); font-size: 18px; }
.ch3-line { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
.ch3-div { stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<defs>
<marker id="ch3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- panel A -->
<text class="ch3-title" x="240" y="28" text-anchor="middle">위: Volcano 모델 (행 하나씩)</text>
<rect class="ch3-box" x="16" y="46" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="180" y="46" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="340" y="46" width="124" height="34" rx="4"/>
<text class="ch3-t" x="78" y="69" text-anchor="middle">행 1</text>
<text class="ch3-t" x="242" y="69" text-anchor="middle">필터</text>
<text class="ch3-t" x="402" y="69" text-anchor="middle">집계</text>
<path class="ch3-line" d="M 144 63 L 174 63" marker-end="url(#ch3Arrow)"/>
<path class="ch3-line" d="M 308 63 L 334 63" marker-end="url(#ch3Arrow)"/>
<rect class="ch3-box" x="16" y="90" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="180" y="90" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="340" y="90" width="124" height="34" rx="4"/>
<text class="ch3-t" x="78" y="113" text-anchor="middle">행 2</text>
<text class="ch3-t" x="242" y="113" text-anchor="middle">필터</text>
<text class="ch3-t" x="402" y="113" text-anchor="middle">집계</text>
<path class="ch3-line" d="M 144 107 L 174 107" marker-end="url(#ch3Arrow)"/>
<path class="ch3-line" d="M 308 107 L 334 107" marker-end="url(#ch3Arrow)"/>
<rect class="ch3-box" x="16" y="134" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="180" y="134" width="124" height="34" rx="4"/>
<rect class="ch3-box" x="340" y="134" width="124" height="34" rx="4"/>
<text class="ch3-t" x="78" y="157" text-anchor="middle">행 3</text>
<text class="ch3-t" x="242" y="157" text-anchor="middle">필터</text>
<text class="ch3-t" x="402" y="157" text-anchor="middle">집계</text>
<path class="ch3-line" d="M 144 151 L 174 151" marker-end="url(#ch3Arrow)"/>
<path class="ch3-line" d="M 308 151 L 334 151" marker-end="url(#ch3Arrow)"/>
<text class="ch3-note" x="240" y="196" text-anchor="middle">... 1억 행이면 1억 번 반복</text>
<text class="ch3-note" x="240" y="226" text-anchor="middle">행마다 가상 함수 호출: 1억 번</text>
<line class="ch3-div" x1="20" y1="252" x2="460" y2="252"/>
<!-- panel B -->
<text class="ch3-title" x="240" y="290" text-anchor="middle">아래: 벡터화 (블록 단위)</text>
<rect class="ch3-box-v" x="16" y="308" width="124" height="42" rx="4"/>
<rect class="ch3-box-v" x="180" y="308" width="124" height="42" rx="4"/>
<rect class="ch3-box-v" x="340" y="308" width="124" height="42" rx="4"/>
<text class="ch3-tv" x="78" y="335" text-anchor="middle">65,536행</text>
<text class="ch3-tv" x="242" y="335" text-anchor="middle">필터 SIMD</text>
<text class="ch3-tv" x="402" y="335" text-anchor="middle">집계 SIMD</text>
<path class="ch3-line" d="M 144 329 L 174 329" marker-end="url(#ch3Arrow)"/>
<path class="ch3-line" d="M 308 329 L 334 329" marker-end="url(#ch3Arrow)"/>
<rect class="ch3-box-v" x="16" y="360" width="124" height="42" rx="4"/>
<rect class="ch3-box-v" x="180" y="360" width="124" height="42" rx="4"/>
<rect class="ch3-box-v" x="340" y="360" width="124" height="42" rx="4"/>
<text class="ch3-tv" x="78" y="387" text-anchor="middle">다음 블록</text>
<text class="ch3-tv" x="242" y="387" text-anchor="middle">필터 SIMD</text>
<text class="ch3-tv" x="402" y="387" text-anchor="middle">집계 SIMD</text>
<path class="ch3-line" d="M 144 381 L 174 381" marker-end="url(#ch3Arrow)"/>
<path class="ch3-line" d="M 308 381 L 334 381" marker-end="url(#ch3Arrow)"/>
<text class="ch3-note" x="240" y="430" text-anchor="middle">... 1억 행이면 약 1,500 블록</text>
<text class="ch3-note" x="240" y="460" text-anchor="middle">블록마다 호출: 약 1,500번</text>
</svg>
</div>

함수 호출 오버헤드가 1억 번에서 약 1,500번으로 줄어들고, 각 루프 내부에서는 SIMD가 데이터 수준 병렬성까지 뽑아냅니다. ClickHouse는 런타임에 `cpuid` 명령어로 CPU를 감지해서 SSE 4.2, AVX2, AVX-512 중 최적의 커널을 선택합니다.

벡터화 실행이 제대로 작동하려면 데이터가 컬럼 단위로 연속 배치되어 있어야 합니다. 같은 타입의 값이 메모리에 연속으로 나열되어 있으면 CPU 캐시 라인에 빈틈 없이 들어가고, SIMD 레지스터에 한 번에 로드됩니다. Row store에서는 한 행의 여러 타입이 뒤섞여 있어서 이런 최적화가 불가능합니다. 결국 **컬럼 저장과 벡터화 실행은 독립된 최적화가 아니라, 하나가 다른 하나를 가능하게 하는 관계**입니다.

### 데이터 압축

ClickHouse는 모든 컬럼 데이터를 디스크에 압축해서 저장합니다. 기본 코덱은 **LZ4**입니다. LZ4는 압축률보다 속도에 초점을 맞춘 알고리즘으로, 해제 속도가 ZSTD 대비 3\~5배 빠릅니다. OLAP 쿼리에서는 디스크에서 읽은 데이터를 즉시 해제해야 하므로, 해제 속도가 곧 쿼리 속도입니다.

더 높은 압축률이 필요한 콜드 데이터에는 **ZSTD**를 지정할 수 있습니다. ZSTD는 LZ4보다 약 30% 더 작게 압축하지만 해제가 느립니다. I/O 병목이 심한(네트워크 스토리지 등) 환경에서는 ZSTD가 오히려 빠를 수 있습니다. 읽어야 할 바이트 자체가 줄어들기 때문입니다.

컬럼 특성에 맞는 **특수 코덱**을 추가로 쌓을 수도 있습니다.

| 코덱 | 대상 | 원리 |
|------|------|------|
| `Delta` | 정렬된 정수, 타임스탬프 | 인접 값의 차이만 저장 |
| `DoubleDelta` | 균일 간격 타임스탬프 | Delta의 Delta를 저장 (차이가 거의 0) |
| `Gorilla` | 부동소수점 (센서값 등) | XOR 기반, 유사한 값 연속 시 극도로 효율적 |

예를 들어 1초 간격으로 찍히는 타임스탬프 컬럼에 `DoubleDelta + LZ4`를 적용하면, 원본 대비 수십 배 압축이 됩니다. 같은 컬럼의 값이 연속으로 나열되는 컬럼 스토어이기 때문에 이런 특수 코덱이 효과를 발휘하는 것입니다. Row store에서는 불가능한 전략입니다.

### 멀티코어 병렬 처리

ClickHouse는 단일 쿼리를 **모든 가용 코어에 분산**합니다. 데이터가 granule(8,192행 단위) 단위로 쪼개져 있기 때문에, 각 코어가 서로 다른 granule 범위를 동시에 처리하고 마지막에 부분 결과를 합칩니다. 8코어 서버에서 `count(*)`를 돌리면 8개 스레드가 동시에 서로 다른 구간을 세고 있는 것입니다.

ClickHouse의 속도는 결국 세 단계의 병렬성이 곱해진 결과입니다.

1. **SIMD** (코어 내부): 한 CPU 명령으로 여러 값 동시 처리
2. **멀티코어** (노드 내부): 여러 코어가 서로 다른 데이터 범위를 동시 처리
3. **분산** (클러스터): 여러 노드가 각자의 샤드를 동시 처리 (분산 테이블 사용 시)

## MergeTree 맛보기

ClickHouse에서 테이블을 만들 때 `ENGINE = MergeTree()`를 지정합니다. 이것이 ClickHouse의 기본이자 핵심 스토리지 엔진입니다. 거의 모든 프로덕션 테이블이 MergeTree 또는 그 변형(ReplacingMergeTree, AggregatingMergeTree 등)을 씁니다.

MergeTree의 기본 구조를 요약하면 다음과 같습니다.

> INSERT가 들어오면 데이터를 PRIMARY KEY 순서로 정렬한 뒤 **불변(immutable) Part**로 디스크에 씁니다. 각 Part 안에서 컬럼별로 별도 파일이 만들어지고, 8,192행마다 하나의 **Granule** 경계가 기록됩니다. 이 경계를 가리키는 것이 **희소 인덱스(sparse index)**입니다. 시간이 지나면 백그라운드 프로세스가 작은 Part들을 하나의 큰 Part로 **머지(merge)**합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 312" style="width: 100%; height: auto; max-width: 380px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="INSERT 세 번이 각각 불변 Part를 하나씩 만들고, 백그라운드 머지가 세 Part를 하나의 큰 Part로 합치는 과정을 보여주는 그림">
<style>
.ch4-title { fill: var(--text, #1c1917); font-size: 21px; font-weight: 700; }
.ch4-in { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.ch4-part { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 2; }
.ch4-t { fill: var(--text, #1c1917); font-size: 18px; }
.ch4-tp { fill: var(--primary, #0a756c); font-size: 18px; font-weight: 700; }
.ch4-big { fill: var(--primary, #0a756c); font-size: 20px; font-weight: 700; }
.ch4-note { fill: var(--text-muted, #6d6762); font-size: 17px; }
.ch4-line { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; }
</style>
<defs>
<marker id="ch4Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="ch4-title" x="240" y="28" text-anchor="middle">INSERT마다 새 Part 생성</text>
<!-- row 1 -->
<rect class="ch4-in" x="14" y="50" width="160" height="40" rx="4"/>
<text class="ch4-t" x="94" y="76" text-anchor="middle">INSERT 1</text>
<path class="ch4-line" d="M 180 70 L 244 70" marker-end="url(#ch4Arrow)"/>
<rect class="ch4-part" x="250" y="50" width="180" height="40" rx="4"/>
<text class="ch4-tp" x="340" y="76" text-anchor="middle">Part_1 (불변)</text>
<!-- row 2 -->
<rect class="ch4-in" x="14" y="102" width="160" height="40" rx="4"/>
<text class="ch4-t" x="94" y="128" text-anchor="middle">INSERT 2</text>
<path class="ch4-line" d="M 180 122 L 244 122" marker-end="url(#ch4Arrow)"/>
<rect class="ch4-part" x="250" y="102" width="180" height="40" rx="4"/>
<text class="ch4-tp" x="340" y="128" text-anchor="middle">Part_2 (불변)</text>
<!-- row 3 -->
<rect class="ch4-in" x="14" y="154" width="160" height="40" rx="4"/>
<text class="ch4-t" x="94" y="180" text-anchor="middle">INSERT 3</text>
<path class="ch4-line" d="M 180 174 L 244 174" marker-end="url(#ch4Arrow)"/>
<rect class="ch4-part" x="250" y="154" width="180" height="40" rx="4"/>
<text class="ch4-tp" x="340" y="180" text-anchor="middle">Part_3 (불변)</text>
<!-- merge -->
<path class="ch4-line" d="M 340 200 L 340 244" marker-end="url(#ch4Arrow)"/>
<text class="ch4-note" x="326" y="228" text-anchor="end">백그라운드 머지</text>
<rect class="ch4-part" x="230" y="250" width="220" height="46" rx="4"/>
<text class="ch4-big" x="340" y="279" text-anchor="middle">Part_1_2_3</text>
</svg>
</div>

LSM-tree에서 영감받은 구조입니다. 일반적인 RDB의 B-tree 인덱스와 비교하면 차이가 선명합니다. B-tree는 기존 페이지 안에서 데이터를 제자리 수정(in-place update)합니다. 랜덤 I/O가 발생하지만, 인덱스 구조가 항상 최신 상태를 반영하므로 읽기가 단순합니다. MergeTree는 반대입니다. 쓰기 시점에 제자리 수정을 하지 않고 항상 새로운 Part를 추가하기 때문에, 쓰기가 순차 I/O로 이루어져 빠릅니다. 대신 읽기 시에는 여러 Part를 동시에 확인해야 하는데, 이 비용을 백그라운드 머지가 점진적으로 줄여줍니다.

이 구조에서 파생되는 실무 규칙이 있습니다. **1행씩 INSERT하면 안 됩니다.** INSERT마다 불변 Part가 하나 생기기 때문에, 1행씩 보내면 Part가 폭발적으로 늘어나고 "Too many parts" 에러로 이어집니다. 최소 수만~수십만 행 단위로 배치하는 것이 MergeTree의 설계 의도에 맞는 사용법입니다.

희소 인덱스도 짚어둘 필요가 있습니다. PostgreSQL의 B-tree 인덱스는 **모든 행**을 가리킵니다. 1억 행이면 인덱스 엔트리도 1억 개입니다. MergeTree의 희소 인덱스는 **8,192행마다 하나의 엔트리**만 기록합니다. 1억 행이면 인덱스 엔트리가 약 12,000개입니다. 이 인덱스는 메모리에 전부 올라갈 정도로 작기 때문에, 수십억 행 테이블에서도 쿼리가 "어느 granule을 읽어야 하는가"를 마이크로초 단위로 결정할 수 있습니다. 물론 이 방식은 포인트 쿼리(`WHERE id = 42`)에는 불리합니다. 정확히 한 행을 찾는 것이 아니라, 그 행이 포함된 8,192행 granule 전체를 읽어야 하기 때문입니다. OLAP 워크로드에서는 이 트레이드오프가 문제 되지 않습니다.

여기까지가 MergeTree의 설계 의도입니다. 실제 내부 구조는 [다음 글](/clickhouse/mergetree-internals/)에서 이어갑니다.

## 실험: Docker로 직접 확인하기

위에서 설명한 내용을 직접 돌려봅시다. Docker가 설치되어 있다면 3분이면 됩니다.

### 환경 준비

ClickHouse는 공식 Docker 이미지로 설치 없이 바로 시작할 수 있습니다.

```bash
docker run -d --name ch-test -p 8123:8123 -p 9000:9000 clickhouse/clickhouse-server
docker exec -it ch-test clickhouse-client
```

`clickhouse-client`에 접속하면 인터랙티브 셸이 열립니다. 포트 9000은 네이티브 프로토콜(CLI), 8123은 HTTP 인터페이스입니다.

### 테이블 생성과 데이터 투입

1,000만 행짜리 주문 테이블을 만들어봅시다. `numbers()` 테이블 함수를 이용하면 별도의 데이터 파일 없이 대량 행을 생성할 수 있습니다.

```sql
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

INSERT INTO orders
SELECT
    number AS order_id,
    rand() % 100000 AS user_id,
    5000 + (rand() % 195000) AS price,
    arrayElement(
        ['전자제품', '도서', '의류', '식품', '스포츠', '가구', '화장품', '완구'],
        (rand() % 8) + 1
    ) AS category,
    toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400 * 365)) AS created_at
FROM numbers(10000000);
```

```text
Ok.
0 rows in set. Elapsed: 2.817 sec. Processed 10.00 million rows, 80.00 MB (3.55 million rows/s., 28.40 MB/s.)
```

1,000만 행이 약 3초 만에 들어갑니다.

### 집계 쿼리 실행

```sql
SELECT
    category,
    count() AS cnt,
    avg(price) AS avg_price,
    max(price) AS max_price
FROM orders
GROUP BY category
ORDER BY cnt DESC;
```

```text
┌─category─┬─────cnt─┬────────avg_price─┬─max_price─┐
│ 가구     │ 1251039 │ 102399.273282902 │    199999 │
│ 식품     │ 1250976 │ 102473.727498498 │    199999 │
│ 의류     │ 1250426 │ 102462.420498498 │    199999 │
│ 도서     │ 1250358 │  102535.98529849 │    199999 │
│ 스포츠   │ 1250236 │ 102478.375698529 │    199999 │
│ 화장품   │ 1249730 │ 102480.612918652 │    199999 │
│ 완구     │ 1249240 │ 102454.814758947 │    199999 │
│ 전자제품 │ 1247995 │ 102438.478799279 │    199999 │
└──────────┴─────────┴──────────────────┴───────────┘

8 rows in set. Elapsed: 0.035 sec. Processed 10.00 million rows, 70.00 MB (283.87 million rows/s., 1.99 GB/s.)
```

1,000만 행 집계에 **0.035초**. 초당 약 2.8억 행을 처리했습니다. 이 속도가 나오는 이유가 위에서 설명한 세 가지(컬럼 저장으로 `category`와 `price` 컬럼만 읽고, 벡터화로 블록 단위 처리하고, 멀티코어로 병렬 집계한) 결과입니다.

### 압축률 확인

데이터가 얼마나 압축됐는지 `system.columns`에서 확인할 수 있습니다.

```sql
SELECT
    name,
    formatReadableSize(data_compressed_bytes) AS compressed,
    formatReadableSize(data_uncompressed_bytes) AS uncompressed,
    round(data_uncompressed_bytes / data_compressed_bytes, 2) AS ratio
FROM system.columns
WHERE table = 'orders' AND database = 'default'
ORDER BY data_uncompressed_bytes DESC;
```

```text
┌─name───────┬─compressed─┬─uncompressed─┬──ratio─┐
│ created_at │ 5.73 MiB   │ 38.15 MiB    │   6.66 │
│ user_id    │ 19.14 MiB  │ 38.15 MiB    │   1.99 │
│ price      │ 19.07 MiB  │ 38.15 MiB    │   2.00 │
│ order_id   │ 12.51 MiB  │ 76.29 MiB    │   6.10 │
│ category   │ 1.53 MiB   │ 9.54 MiB     │   6.24 │
└────────────┴────────────┴──────────────┴────────┘
```

`category`는 8종류의 문자열이 반복되므로 `LowCardinality` + LZ4로 6배 이상 압축됐고, `created_at`도 정렬된 타임스탬프라 높은 압축률을 보입니다. 반면 `user_id`와 `price`는 랜덤 값이라 압축 효과가 낮습니다. 실무 데이터는 패턴이 더 뚜렷하기 때문에 압축률은 이보다 훨씬 높아집니다.

`created_at`을 주목할 필요가 있습니다. 이 컬럼은 `ORDER BY`에 포함되어 있어서 Part 안에서 정렬된 상태로 저장됩니다. 정렬된 타임스탬프는 인접 값의 차이가 매우 작아 LZ4만으로도 6.66배 압축이 됩니다. 여기에 `CODEC(Delta, LZ4)`를 명시적으로 지정하면 압축률이 훨씬 더 올라갑니다. MergeTree의 `ORDER BY` 설계가 쿼리 성능뿐 아니라 압축률에도 직접적인 영향을 미치는 이유입니다.

### Part 상태 확인

방금 INSERT한 데이터가 디스크에 어떻게 저장됐는지 `system.parts`로 확인할 수 있습니다.

```sql
SELECT
    name,
    rows,
    formatReadableSize(bytes_on_disk) AS size,
    active
FROM system.parts
WHERE table = 'orders' AND active;
```

```text
┌─name──────┬─────rows─┬─size───────┬─active─┐
│ all_1_1_0 │ 10000000 │ 57.64 MiB  │      1 │
└───────────┴──────────┴────────────┴────────┘
```

`all_1_1_0`이라는 이름의 Part 하나에 1,000만 행이 모두 들어가 있고, 디스크에서 약 58MiB를 차지합니다. 비압축 기준 약 200MiB 대비 약 3.5배 압축된 셈입니다. INSERT를 여러 번 나눠서 실행했다면 Part가 여러 개 생기고, 시간이 지나면 백그라운드 머지로 합쳐지는 과정을 이 뷰에서 추적할 수 있습니다.

### EXPLAIN PIPELINE으로 병렬 처리 확인

ClickHouse가 쿼리를 어떤 파이프라인으로 처리하는지 `EXPLAIN PIPELINE`으로 들여다봅시다.

```sql
EXPLAIN PIPELINE
SELECT category, count(), avg(price)
FROM orders
GROUP BY category;
```

```text
┌─explain───────────────────────────────────────────┐
│ (Expression)                                       │
│ ExpressionTransform                                │
│   (Aggregating)                                    │
│   Resize 8 → 1                                     │
│     AggregatingTransform × 8                       │
│       StrictResize 8 → 8                           │
│         (Expression)                               │
│         ExpressionTransform × 8                    │
│           (ReadFromMergeTree)                       │
│           MergeTreeThread × 8 0 → 1                │
└────────────────────────────────────────────────────┘
```

핵심은 `MergeTreeThread × 8`과 `AggregatingTransform × 8`입니다. 8개 스레드가 동시에 MergeTree에서 데이터를 읽고(`MergeTreeThread × 8`), 8개 스레드가 동시에 집계를 수행한 뒤(`AggregatingTransform × 8`), `Resize 8 → 1`에서 부분 결과를 하나로 합칩니다. 컬럼 저장과 벡터화 실행은 이 파이프라인의 각 스레드 안에서 일어나고 있는 것입니다.

파이프라인 출력을 아래에서 위로 읽으면 데이터 흐름이 보입니다.

1. `MergeTreeThread × 8`: 8개 스레드가 Part에서 granule 단위로 데이터를 읽음
2. `ExpressionTransform × 8`: 각 스레드에서 expression 평가 (여기서는 컬럼 추출)
3. `AggregatingTransform × 8`: 각 스레드가 자기 담당 데이터를 부분 집계
4. `Resize 8 → 1`: 8개의 부분 결과를 하나로 합침
5. `ExpressionTransform`: 최종 결과 포맷팅

여기서 `× 8`이 나오는 이유는 서버의 코어 수(또는 `max_threads` 설정값)에 맞춰 자동 병렬화되기 때문입니다. 4코어 서버에서 같은 쿼리를 돌리면 `× 4`가 됩니다. 별도의 설정 없이 가용 자원을 최대로 활용하는 것이 ClickHouse의 기본 동작입니다.

## 실전에서는

ClickHouse는 "대량의 이벤트를 빠르게 집계해야 하는" 곳이면 어디든 쓰입니다. 대표적인 사례 세 가지를 짧게 소개합니다.

**Cloudflare(HTTP 분석)**: Cloudflare는 평균 초당 600만(피크 800만) HTTP 요청의 분석 데이터를 ClickHouse로 처리합니다. 모든 파이프라인을 합치면 초당 1,100만 행이 INSERT되고, 평균 삽입 대역폭은 47Gbps입니다. PostgreSQL + Citus 조합에서 ClickHouse로 마이그레이션한 사례입니다.

**PostHog(프로덕트 분석)**: 오픈소스 프로덕트 분석 플랫폼 PostHog는 ClickHouse를 메인 분석 백엔드로 사용합니다. 이벤트를 샤딩된 `sharded_events` 테이블에 쌓고, 자주 쓰이는 JSON 프로퍼티는 별도 컬럼으로 머터리얼라이즈해서 퍼널 분석, 트렌드 시각화, 유저 행동 필터링 같은 쿼리를 처리합니다. 컬럼 스토어의 강점을 스키마 설계에 직접 반영한 사례입니다.

**GitLab(Observability)**: GitLab은 FY23에 대용량, 삽입 위주 워크로드(Observability, Analytics 등)의 표준 데이터 스토어로 ClickHouse를 선택했습니다. FY23-Q2에는 Observability 팀이 에러 트래킹을 비롯한 관측 기능용 ClickHouse 데이터 플랫폼을 배포했고, 다른 팀들도 아키텍처에 편입하고 있습니다. Postgres와 Redis를 대체하려는 것이 아니라는 점을 GitLab 스스로 명시하고 있습니다.

세 사례 모두 공통점이 있습니다. **쓰기는 대량 배치, 읽기는 소수 컬럼 집계**라는 OLAP 패턴에 정확히 부합한다는 것입니다.

그 외에도 다양한 영역에서 ClickHouse가 활용됩니다.

- **로그 분석**: 애플리케이션/인프라 로그를 실시간으로 수집하고, 에러 패턴이나 지연 원인을 즉시 집계
- **실시간 대시보드**: 수십억 행의 메트릭 데이터 위에서 대시보드 쿼리를 서브초로 응답
- **이벤트/행동 분석**: 사용자 클릭스트림, 구매 이벤트 등을 퍼널 분석, 코호트 분석으로 처리
- **IoT/시계열**: 센서 데이터를 초당 수백만 행씩 수집하고, 시간 구간별 집계

반대로 ClickHouse가 맞지 않는 경우도 분명합니다. 행 단위 UPDATE가 빈번하거나, 트랜잭션 격리가 필수이거나, 포인트 쿼리(`WHERE id = 42`)가 주 워크로드인 경우에는 PostgreSQL이나 MySQL이 올바른 선택입니다. ClickHouse는 RDB를 대체하는 것이 아니라, RDB가 커버하지 못하는 분석 워크로드를 담당하는 도구입니다.

## 마치며

ClickHouse의 속도는 마법이 아니라 설계 선택의 결과입니다. 컬럼 저장으로 불필요한 I/O를 제거하고, 벡터화 실행으로 CPU를 극한까지 활용하고, MergeTree의 불변 Part 구조로 쓰기를 순차 I/O로 바꾼 결과가 그 0.3초입니다.

[다음 글](/clickhouse/mergetree-internals/)에서는 MergeTree 엔진 안으로 들어갑니다. Part 디렉토리 안에 어떤 파일들이 있는지, Granule과 Mark가 어떻게 연결되는지, 그리고 희소 인덱스가 어떻게 수십억 행에서 필요한 Granule만 골라 읽는지를 따라갑니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree Table Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse 공식 리소스: What is Columnar Storage?](https://clickhouse.com/resources/engineering/what-is-columnar-storage)
- [ClickHouse 공식 리소스: Vectorised Query Execution](https://clickhouse.com/resources/engineering/vectorised-query-execution)
- [ClickHouse 공식 블로그: Compressing nginx logs 170x with column storage](https://clickhouse.com/blog/log-compression-170x)
- [Cloudflare: HTTP Analytics for 6M requests per second using ClickHouse](https://blog.cloudflare.com/http-analytics-for-6m-requests-per-second-using-clickhouse/)
- [PostHog Docs: How PostHog Works, ClickHouse](https://posthog.com/docs/how-posthog-works/clickhouse)
- [PostHog Blog: The secrets of PostHog query performance](https://posthog.com/blog/secrets-of-posthog-query-performance)
- [GitLab Handbook: ClickHouse Datastore Working Group](https://handbook.gitlab.com/handbook/company/working-groups/clickhouse-datastore/)
- [ClickBench: a Benchmark For Analytical Databases](https://benchmark.clickhouse.com/)
