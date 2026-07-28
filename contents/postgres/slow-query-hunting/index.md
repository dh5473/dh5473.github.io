---
date: '2026-05-05'
title: '느린 쿼리를 추적하는 법: pg_stat_statements부터 wait_event까지'
category: 'Database'
series: 'postgres'
seriesOrder: 13
tags: ['PostgreSQL', 'pg_stat_statements', 'auto_explain', 'Performance', 'Monitoring']
summary: '"DB가 느려요"라는 모호한 증상에서 출발해, pg_stat_statements로 전체 워크로드의 병목을 찾고, auto_explain으로 실행 계획을 자동 수집하고, pg_stat_activity의 wait_event로 지금 무엇에 막혀 있는지 진단하는 체계를 만듭니다.'
thumbnail: './thumbnail.png'
---

"DB가 느려요."

이 말을 들었을 때 가장 먼저 무엇을 봐야 할까요? EXPLAIN을 찍어보자니 어떤 쿼리가 문제인지 모르고, 서버 메트릭을 봐도 CPU와 IO가 전체적으로 높다는 것 외에는 단서가 없습니다.

느린 쿼리를 잡는 일은 **범위를 좁혀가는 과정**입니다. 전체 워크로드에서 병목을 찾고, 그 쿼리의 실행 계획을 확인하고, 지금 이 순간 무엇에 막혀 있는지를 확인합니다. 이 글에서는 그 과정에서 쓰는 도구들을 순서대로 따라갑니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 330" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="관측 도구의 세 층위. pg_stat_statements는 전체 워크로드에서 어떤 쿼리가 시간을 가장 많이 쓰는지, EXPLAIN ANALYZE는 그 쿼리 한 번이 어디에서 시간을 쓰는지, wait_event는 지금 그 쿼리가 무엇을 기다리는지를 보여준다">
<defs>
<marker id="sqfArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<style>
.sqf-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sqf-h { font-size: 20px; font-weight: 700; fill: var(--primary, #0d9488); }
.sqf-s { font-size: 17px; fill: var(--text, #1c1917); }
.sqf-tag { font-size: 17px; fill: var(--text-muted, #78716c); }
.sqf-n { font-size: 17px; fill: var(--text-muted, #78716c); }
.sqf-ln { stroke: var(--text-muted, #78716c); stroke-width: 1.6; fill: none; }
</style>
<!-- layer 1: whole workload -->
<rect class="sqf-box" x="20" y="16" width="440" height="84" rx="8"/>
<text class="sqf-h" x="40" y="44">pg_stat_statements</text>
<text class="sqf-tag" x="440" y="44" text-anchor="end">워크로드 전체</text>
<text class="sqf-s" x="40" y="68">전체 워크로드 중 어떤 쿼리가</text>
<text class="sqf-s" x="40" y="88">시간을 가장 많이 쓰는가</text>
<!-- narrowing 1 -->
<line class="sqf-ln" x1="240" y1="100" x2="240" y2="122" marker-end="url(#sqfArrow)"/>
<text class="sqf-n" x="252" y="118">쿼리 하나로 좁힌다</text>
<!-- layer 2: one query -->
<rect class="sqf-box" x="60" y="124" width="360" height="84" rx="8"/>
<text class="sqf-h" x="80" y="152">EXPLAIN ANALYZE</text>
<text class="sqf-tag" x="400" y="152" text-anchor="end">쿼리 하나</text>
<text class="sqf-s" x="80" y="176">그 쿼리 한 번의 실행이</text>
<text class="sqf-s" x="80" y="196">어디에서 시간을 쓰는가</text>
<!-- narrowing 2 -->
<line class="sqf-ln" x1="240" y1="208" x2="240" y2="230" marker-end="url(#sqfArrow)"/>
<text class="sqf-n" x="252" y="226">그 순간의 대기로 좁힌다</text>
<!-- layer 3: one moment -->
<rect class="sqf-box" x="100" y="232" width="280" height="84" rx="8"/>
<text class="sqf-h" x="120" y="260">wait_event</text>
<text class="sqf-tag" x="360" y="260" text-anchor="end">한 순간</text>
<text class="sqf-s" x="120" y="284">지금 그 쿼리가</text>
<text class="sqf-s" x="120" y="304">무엇을 기다리는가</text>
</svg>
</div>

## "느리다"의 네 가지 유형

추적 방법을 고르기 전에, "느리다"가 어떤 상황인지를 먼저 분류해야 합니다.

| 유형 | 증상 | 접근 |
|------|------|------|
| 특정 쿼리가 느리다 | 특정 페이지만 느림, 특정 API 타임아웃 | 해당 쿼리의 EXPLAIN 분석 |
| 전체가 느리다 | 모든 요청이 느림, connection 대기 발생 | 워크로드 전체 분석 + 리소스 병목 확인 |
| 갑자기 느려졌다 | 어제까지 정상, 오늘 갑자기 | 통계 변동, lock 경합, checkpoint spike 의심 |
| 점점 느려진다 | 주 단위로 성능 하락 | bloat 누적, 데이터 증가 대비 인덱스 미비 |

유형에 따라 들여다볼 곳이 다르지만, 어떤 경우든 출발점은 같습니다. "**어떤 쿼리가 전체 시간을 가장 많이 쓰고 있는가**"를 먼저 파악하는 것입니다.

## pg_stat_statements: 전체 워크로드를 한눈에

### 설치와 활성화

`pg_stat_statements`는 PostgreSQL에 포함된 extension입니다. 서버에서 실행된 모든 SQL의 실행 통계를 누적해서 보여줍니다.

```sql
-- postgresql.conf에 추가 후 재시작
-- shared_preload_libraries = 'pg_stat_statements'

-- extension 활성화
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

활성화하면 PostgreSQL은 쿼리 텍스트를 정규화(파라미터를 `$1`, `$2`로 치환)해서 같은 패턴의 쿼리를 하나로 묶고, 호출 횟수·실행 시간·읽은 블록 수 등을 누적합니다.

### 상위 쿼리 뽑기

가장 먼저 할 일은 "전체 실행 시간을 가장 많이 차지하는 쿼리"를 찾는 것입니다.

```sql
SELECT
    queryid,
    substr(query, 1, 80) AS query_preview,
    calls,
    round(total_exec_time::numeric, 1) AS total_ms,
    round(mean_exec_time::numeric, 1) AS mean_ms,
    rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

```text
 queryid  |                         query_preview                          | calls  | total_ms  | mean_ms | rows
----------+----------------------------------------------------------------+--------+-----------+---------+--------
 38291048 | SELECT u.*, p.* FROM users u JOIN posts p ON p.user_id = u.id  |  84200 |  192847.3 |    2.3  | 421000
 72910384 | UPDATE user_sessions SET last_active_at = $1 WHERE id = $2     | 520100 |  156220.1 |    0.3  | 520100
 19384710 | SELECT * FROM notifications WHERE user_id = $1 ORDER BY crea.. |  41000 |   98410.5 |    2.4  |  82000
```

이 결과를 읽는 핵심은 `total_exec_time`입니다. 한 번에 2.3ms밖에 안 걸리는 쿼리라도 84,000번 호출되면 전체 시간의 상당 부분을 차지합니다. mean이 낮다고 무시하면 안 됩니다.

:::info

**통계 리셋**

`pg_stat_statements_reset()`을 호출하면 통계가 초기화됩니다. 배포 직후나 점검 직후에 리셋해두면 "이번 기간에 무엇이 문제였는가"를 더 명확하게 볼 수 있습니다.

:::

:::info

**추적 범위**

기본 설정(`pg_stat_statements.track = 'top'`)에서는 최상위 문장만 추적됩니다. PL/pgSQL 함수나 프로시저 안에서 실행되는 SQL은 보이지 않습니다. 내부 쿼리까지 추적하려면 `pg_stat_statements.track = 'all'`로 설정합니다.

:::

### 어떤 컬럼을 봐야 하나

| 컬럼 | 의미 | 높으면 의심할 것 |
|------|------|-----------------|
| `total_exec_time` | 누적 실행 시간 | 가장 먼저 정렬할 기준 |
| `calls` | 호출 횟수 | ORM의 N+1, 불필요한 반복 호출 |
| `mean_exec_time` | 평균 실행 시간 | 단일 쿼리 자체가 느린 경우 |
| `stddev_exec_time` | 표준편차 | 편차가 크면 특정 조건에서만 느린 것 |
| `shared_blks_read` | 디스크에서 읽은 블록 | cache miss 높음 → 풀스캔, bloat, 또는 working set 초과 |
| `shared_blks_hit` | shared_buffers에서 읽은 블록 | 정상적으로 캐시 활용 중 |
| `total_plan_time` | 누적 계획 시간 (PG 13+) | 파티션 많거나 조인 복잡 시 planning 자체가 병목 |

`shared_blks_read`가 비정상적으로 높다는 것은 shared_buffers에서 miss가 많이 발생한다는 뜻입니다. 원인으로는 인덱스가 없어서 풀스캔을 하는 경우, 테이블 [bloat](/postgres/vacuum-and-bloat/)로 불필요한 페이지까지 읽는 경우, working set이 shared_buffers보다 큰 경우 등이 있습니다.

### 시간대별 변화를 보고 싶다면

`pg_stat_statements` 자체는 누적 카운터일 뿐, 시계열 데이터를 제공하지 않습니다. 시간대별 추이를 보려면 주기적으로(5분~15분) 스냅샷을 찍어서 별도 테이블에 저장하거나, pganalyze 같은 모니터링 도구를 연동합니다.

## auto_explain: 실행 계획을 자동으로 남기기

### EXPLAIN만으로는 왜 부족한가

`EXPLAIN ANALYZE`는 쿼리를 실제로 실행한 뒤 [플래너가 세운 계획](/postgres/planner-statistics/)과 실제 결과를 나란히 보여줍니다. 하지만 운영 환경에서는 "그 느린 순간"을 재현하기 어렵습니다.

- 파라미터 바인딩 값에 따라 plan이 달라진다
- 통계가 갱신된 직후와 직전에 plan이 바뀐다
- 동시 접속이 높을 때만 lock 대기가 걸린다

`auto_explain`은 이 문제를 해결합니다. 설정한 threshold보다 오래 걸린 쿼리의 실행 계획을 **자동으로 서버 로그에 기록**합니다. 문제가 발생한 바로 그 순간의 plan을 사후에 확인할 수 있습니다.

### 설정

```sql
-- postgresql.conf (또는 ALTER SYSTEM)
-- shared_preload_libraries = 'auto_explain'  -- 재시작 필요

-- 런타임에 설정 가능한 파라미터
ALTER SYSTEM SET auto_explain.log_min_duration = '1s';
ALTER SYSTEM SET auto_explain.log_analyze = on;
ALTER SYSTEM SET auto_explain.log_buffers = on;
ALTER SYSTEM SET auto_explain.log_format = 'json';
SELECT pg_reload_conf();
```

| 파라미터 | 권장값 | 설명 |
|---------|--------|------|
| `log_min_duration` | 운영: 1s, 디버깅: 100ms | 이 시간보다 오래 걸린 쿼리만 로깅 |
| `log_analyze` | on | 실제 실행 후 actual rows/time 포함 |
| `log_buffers` | on | shared_blks_hit/read 포함 |
| `log_format` | json 또는 text | json이면 파싱 쉬움 |

:::warning

**주의**

`log_analyze = on`은 실행 중인 쿼리에 노드별 계측(instrumentation)을 추가해서 actual rows와 actual time을 기록합니다. 쿼리를 다시 실행하는 것은 아니지만, 각 노드에서 시간을 측정하는 소량의 오버헤드가 발생합니다. 오버헤드가 걱정된다면 `auto_explain.log_timing = off`로 시간 측정만 끄고 actual rows만 수집할 수 있습니다. threshold를 너무 낮게 잡으면 로그 볼륨이 급격히 늘어나므로, 운영에서는 1초부터 시작해서 점진적으로 낮추는 게 안전합니다.

:::

### 세션 단위로 켜기

특정 문제를 디버깅할 때는 전역 설정 없이 세션에서만 켤 수 있습니다.

```sql
LOAD 'auto_explain';
SET auto_explain.log_min_duration = '100ms';
SET auto_explain.log_analyze = on;

-- 이 세션에서 실행하는 쿼리 중 100ms 넘는 것만 로그에 plan이 남음
SELECT * FROM large_table WHERE some_condition;
```

이렇게 하면 운영 서버 전체에 영향을 주지 않고 특정 트랜잭션의 plan만 수집할 수 있습니다. 단, `LOAD`는 superuser 권한이 필요합니다.

## pg_stat_activity: 지금 무엇에 막혀 있는가

`pg_stat_statements`가 "과거에 무엇이 느렸는가"를 보여준다면, `pg_stat_activity`는 "**지금 이 순간 무엇이 일어나고 있는가**"를 보여줍니다.

### 활성 세션 확인

```sql
SELECT
    pid,
    state,
    wait_event_type,
    wait_event,
    now() - query_start AS duration,
    substr(query, 1, 60) AS query
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY query_start;
```

```text
  pid  |        state        | wait_event_type |  wait_event   |  duration   |                    query
-------+---------------------+-----------------+---------------+-------------+----------------------------------------------
 12847 | active              | IO              | DataFileRead  |  00:00:03.2 | SELECT * FROM orders WHERE created_at > $1..
 12891 | active              | Lock            | transactionid |  00:00:07.8 | UPDATE accounts SET balance = $1 WHERE id..
 12903 | idle in transaction |                 |               |  00:02:14.0 | UPDATE orders SET status = $1 WHERE id = $2
```

이 출력에서 핵심은 `wait_event_type`과 `wait_event`입니다.

### wait_event 읽는 법

| wait_event_type | 의미 | 다음 단계 |
|----------------|------|----------|
| **Lock** | 다른 트랜잭션이 잡은 락을 기다리는 중 | `pg_blocking_pids(pid)`로 블로커 확인 |
| **IO** | 디스크 읽기/쓰기 대기 | shared_buffers 부족, bloat, checkpoint 시점 |
| **LWLock** | 내부 경량 락 대기 | 동시성 높을 때 WAL insert lock 등 |
| **BufferPin** | 버퍼 핀 대기 | [hot standby 충돌](/postgres/replication/)에서 자주 발생 |
| (NULL) | 대기 없이 CPU에서 실행 중 | 반복 관찰되면 쿼리 자체가 무거움 (plan 확인) |

`Lock` 대기가 보이면 [`pg_blocking_pids`](/postgres/isolation-and-locks/)로 누가 그 락을 잡고 있는지 찾습니다. 인자로 넘긴 pid를 막고 있는 세션의 pid 배열을 돌려주는 함수입니다.

```sql
-- Lock 대기 중인 세션의 블로커 찾기
SELECT
    blocked.pid AS blocked_pid,
    blocked.query AS blocked_query,
    blocker.pid AS blocker_pid,
    blocker.query AS blocker_query,
    blocker.state AS blocker_state
FROM pg_stat_activity blocked
JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocker_pid ON true
JOIN pg_stat_activity blocker ON blocker.pid = blocker_pid
WHERE blocked.wait_event_type = 'Lock';
```

### idle in transaction의 위험

위 출력에서 `idle in transaction` 상태로 2분이 넘은 세션이 보입니다. 이 상태는 BEGIN 이후 COMMIT이나 ROLLBACK 없이 어플리케이션이 멈춰있는 것입니다. 위험한 이유가 두 가지입니다.

1. **VACUUM 차단**: 이 트랜잭션이 열려 있는 동안 시스템의 xmin horizon이 전진하지 못하므로, 그 이후에 삭제·갱신된 dead tuple을 [VACUUM이 치울 수 없습니다](/postgres/vacuum-and-bloat/). 테이블이 점점 부풀어갑니다.
2. **락 점유**: 이 트랜잭션이 row-level lock을 잡고 있다면, 같은 row를 수정하려는 다른 세션이 모두 대기합니다.

```sql
-- idle in transaction이 5분 넘은 세션 찾기
SELECT pid, now() - xact_start AS xact_duration, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '5 minutes';
```

:::tip

**팁**

`idle_in_transaction_session_timeout`을 설정하면 일정 시간 이상 idle in transaction 상태가 지속된 세션을 자동으로 종료합니다. 운영 환경에서는 이 값을 설정해두는 것을 권장합니다.

:::

## pg_stat_user_tables: 테이블 건강 체크

개별 쿼리가 아닌 테이블 단위로 상태를 점검하고 싶을 때는 `pg_stat_user_tables`를 봅니다.

```sql
SELECT
    schemaname || '.' || relname AS table_name,
    seq_scan,
    idx_scan,
    n_live_tup,
    n_dead_tup,
    last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
```

| 지표 | 건강한 상태 | 의심 신호 |
|------|------------|----------|
| `seq_scan` vs `idx_scan` | idx_scan이 압도적으로 높음 | seq_scan이 높으면 인덱스 누락 가능 |
| `n_dead_tup` | live 대비 10% 이하 | 30% 이상이면 bloat 시작 |
| `last_autovacuum` | 최근 수 시간~1일 이내 | NULL이거나 며칠 전이면 autovacuum 지연 |

`seq_scan`이 높다고 무조건 문제는 아닙니다. 작은 테이블(수백 행)은 seq scan이 더 빠릅니다. 수십만 행 이상인데 seq_scan이 idx_scan보다 높다면 [인덱스 설계](/postgres/btree-anatomy/)를 검토할 시점입니다.

### 사용하지 않는 인덱스 찾기

인덱스는 SELECT를 빠르게 하지만 INSERT/UPDATE/DELETE에 쓰기 비용을 추가합니다. 사용하지 않는 인덱스는 공간과 write 성능만 낭비합니다.

```sql
SELECT
    schemaname || '.' || indexrelname AS index_name,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

`idx_scan = 0`인 인덱스가 크기까지 크다면 삭제 후보입니다. 다만 통계를 리셋한 직후라면 아직 사용 기록이 쌓이지 않은 것일 수 있으니, 최소 1~2주의 데이터를 기준으로 판단합니다.

## 원인을 좁혀가는 흐름

지금까지 소개한 도구들을 언제 어떤 순서로 쓰는지 정리합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 948" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="느린 쿼리 진단 판단 트리. DB가 느리다는 신고에서 출발해 pg_stat_statements로 상위 쿼리를 고르고, EXPLAIN ANALYZE로 실행 계획을 읽고, pg_stat_activity로 지금 무엇을 기다리는지 보고, pg_stat_user_tables로 테이블 상태를 점검한다. 각 단계마다 관측된 조건과 그에 대응하는 다음 행동을 짝지어 보여준다">
<defs>
<marker id="sqtArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<style>
.sqt-start { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sqt-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sqt-t { font-size: 21px; font-weight: 700; fill: var(--text, #1c1917); }
.sqt-h { font-size: 20px; font-weight: 700; fill: var(--primary, #0d9488); }
.sqt-hs { font-size: 17px; fill: var(--text-muted, #78716c); }
.sqt-c { font-size: 17px; fill: var(--text, #1c1917); }
.sqt-a { font-size: 17px; fill: var(--primary, #0d9488); }
.sqt-sep { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.sqt-ln { stroke: var(--text-muted, #78716c); stroke-width: 1.6; fill: none; }
.sqt-dot { fill: var(--accent, #d97706); }
</style>
<!-- 출발점 -->
<rect class="sqt-start" x="120" y="14" width="240" height="44" rx="8"/>
<text class="sqt-t" x="240" y="43" text-anchor="middle">"DB가 느려요"</text>
<line class="sqt-ln" x1="240" y1="58" x2="240" y2="76" marker-end="url(#sqtArrow)"/>
<!-- 1단계: pg_stat_statements -->
<rect class="sqt-box" x="14" y="80" width="452" height="176" rx="8"/>
<text class="sqt-h" x="28" y="106">pg_stat_statements</text>
<text class="sqt-hs" x="452" y="106" text-anchor="end">워크로드 전체</text>
<line class="sqt-sep" x1="14" y1="120" x2="466" y2="120"/>
<circle class="sqt-dot" cx="26" cy="134" r="3"/>
<text class="sqt-c" x="38" y="139">mean_exec_time이 크다</text>
<text class="sqt-a" x="52" y="157">→ 그 쿼리를 EXPLAIN ANALYZE</text>
<circle class="sqt-dot" cx="26" cy="176" r="3"/>
<text class="sqt-c" x="38" y="181">shared_blks_read가 크다</text>
<text class="sqt-a" x="52" y="199">→ EXPLAIN (ANALYZE, BUFFERS)</text>
<circle class="sqt-dot" cx="26" cy="218" r="3"/>
<text class="sqt-c" x="38" y="223">calls가 비정상적으로 많다</text>
<text class="sqt-a" x="52" y="241">→ N+1 등 호출 패턴 점검</text>
<line class="sqt-ln" x1="240" y1="256" x2="240" y2="274" marker-end="url(#sqtArrow)"/>
<!-- 2단계: EXPLAIN ANALYZE -->
<rect class="sqt-box" x="14" y="278" width="452" height="218" rx="8"/>
<text class="sqt-h" x="28" y="304">EXPLAIN ANALYZE</text>
<text class="sqt-hs" x="452" y="304" text-anchor="end">쿼리 하나</text>
<line class="sqt-sep" x1="14" y1="318" x2="466" y2="318"/>
<circle class="sqt-dot" cx="26" cy="332" r="3"/>
<text class="sqt-c" x="38" y="337">추정 행 수와 실제 행 수가 다르다</text>
<text class="sqt-a" x="52" y="355">→ ANALYZE로 통계 갱신</text>
<circle class="sqt-dot" cx="26" cy="374" r="3"/>
<text class="sqt-c" x="38" y="379">큰 테이블에 Seq Scan</text>
<text class="sqt-a" x="52" y="397">→ WHERE 컬럼 인덱스 후보 검토</text>
<circle class="sqt-dot" cx="26" cy="416" r="3"/>
<text class="sqt-c" x="38" y="421">Nested Loop에서 행이 폭발</text>
<text class="sqt-a" x="52" y="439">→ 조인 순서와 조인 방식 재검토</text>
<circle class="sqt-dot" cx="26" cy="458" r="3"/>
<text class="sqt-c" x="38" y="463">Index Scan인데 읽은 블록이 많다</text>
<text class="sqt-a" x="52" y="481">→ shared_buffers 부족 또는 bloat</text>
<line class="sqt-ln" x1="240" y1="496" x2="240" y2="514" marker-end="url(#sqtArrow)"/>
<!-- 3단계: pg_stat_activity -->
<rect class="sqt-box" x="14" y="518" width="452" height="218" rx="8"/>
<text class="sqt-h" x="28" y="544">pg_stat_activity</text>
<text class="sqt-hs" x="452" y="544" text-anchor="end">지금 이 순간</text>
<line class="sqt-sep" x1="14" y1="558" x2="466" y2="558"/>
<circle class="sqt-dot" cx="26" cy="572" r="3"/>
<text class="sqt-c" x="38" y="577">wait_event_type = Lock</text>
<text class="sqt-a" x="52" y="595">→ pg_blocking_pids로 블로커 식별</text>
<circle class="sqt-dot" cx="26" cy="614" r="3"/>
<text class="sqt-c" x="38" y="619">wait_event_type = IO</text>
<text class="sqt-a" x="52" y="637">→ shared_buffers 부족, checkpoint</text>
<circle class="sqt-dot" cx="26" cy="656" r="3"/>
<text class="sqt-c" x="38" y="661">state = idle in transaction</text>
<text class="sqt-a" x="52" y="679">→ 트랜잭션 타임아웃 설정</text>
<circle class="sqt-dot" cx="26" cy="698" r="3"/>
<text class="sqt-c" x="38" y="703">wait_event가 비어 있다 (CPU)</text>
<text class="sqt-a" x="52" y="721">→ 쿼리 자체가 무거움, plan 확인</text>
<line class="sqt-ln" x1="240" y1="736" x2="240" y2="754" marker-end="url(#sqtArrow)"/>
<!-- 4단계: pg_stat_user_tables -->
<rect class="sqt-box" x="14" y="758" width="452" height="176" rx="8"/>
<text class="sqt-h" x="28" y="784">pg_stat_user_tables</text>
<text class="sqt-hs" x="452" y="784" text-anchor="end">테이블 건강</text>
<line class="sqt-sep" x1="14" y1="798" x2="466" y2="798"/>
<circle class="sqt-dot" cx="26" cy="812" r="3"/>
<text class="sqt-c" x="38" y="817">n_dead_tup 비율이 높다</text>
<text class="sqt-a" x="52" y="835">→ autovacuum 지연 점검</text>
<circle class="sqt-dot" cx="26" cy="854" r="3"/>
<text class="sqt-c" x="38" y="859">seq_scan이 idx_scan보다 많다</text>
<text class="sqt-a" x="52" y="877">→ 인덱스 누락 의심</text>
<circle class="sqt-dot" cx="26" cy="896" r="3"/>
<text class="sqt-c" x="38" y="901">last_autovacuum이 NULL</text>
<text class="sqt-a" x="52" y="919">→ autovacuum 설정 확인</text>
</svg>
</div>

핵심은 **넓은 것에서 좁은 것으로** 접근하는 것입니다. 전체 워크로드(pg_stat_statements) → 특정 쿼리(EXPLAIN) → 현재 상태(pg_stat_activity) → 테이블 건강(pg_stat_user_tables) 순서로 범위를 좁혀가면 대부분의 "느려요"에 답을 찾을 수 있습니다.

## 실전에서는

### 1. pg_stat_statements 스냅샷을 주기적으로 저장한다

누적 카운터는 "지난 며칠간의 합계"만 알려줍니다. 5~15분 간격으로 스냅샷을 찍어두면 "오늘 오후 3시부터 이 쿼리가 느려졌다"는 시계열 분석이 가능합니다. 크론으로 `INSERT INTO snapshot_table SELECT ... FROM pg_stat_statements`를 돌리는 정도로 시작할 수 있습니다.

### 2. auto_explain threshold는 보수적으로 시작한다

운영에서 `log_min_duration = 100ms`로 시작하면 로그가 폭발합니다. 1초부터 시작해서, 주요 병목을 해결할 때마다 점진적으로 낮추는 것이 안전합니다.

### 3. log_lock_waits를 켜둔다

```sql
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';
SELECT pg_reload_conf();
```

`deadlock_timeout`(기본 1초) 이상 대기한 lock 이벤트가 자동으로 서버 로그에 남습니다. 모니터링을 따로 안 달아도 "어제 밤에 lock 대기가 있었는지"를 사후에 확인할 수 있습니다.

### 4. 갑자기 느려진 경우 체크리스트

- `pg_stat_activity`에서 오래 떠 있는 idle in transaction 세션이 있는가?
- 최근에 `ANALYZE` 없이 대량 INSERT/DELETE가 있었는가? → 통계와 현실의 괴리
- [checkpoint](/postgres/wal-and-checkpoint/) 주기와 겹치는가? → `log_checkpoints = on`으로 확인
- 디스크 I/O가 높은 시간대와 일치하는가? → `pg_stat_checkpointer`(PG 17+) 또는 `pg_stat_bgwriter`(~PG 16)의 checkpoint 통계 확인

## 흔한 오해

### "EXPLAIN의 cost가 높으면 느린 거 아닌가요?"

cost는 **단위 없는 상대값**입니다. cost가 10000이라도 0.1ms에 끝날 수 있고, cost가 100이라도 10초 걸릴 수 있습니다. cost는 같은 DB 안에서 "플래너가 여러 plan 후보를 비교할 때" 쓰는 숫자이지, 절대적인 실행 시간을 의미하지 않습니다. 실제 성능은 반드시 `EXPLAIN ANALYZE`의 `actual time`으로 확인해야 합니다.

### "인덱스를 추가하면 무조건 빨라지지 않나요?"

인덱스는 읽기를 빠르게 하지만 쓰기를 느리게 합니다. INSERT마다 모든 인덱스에 엔트리를 추가해야 하고, UPDATE는 인덱스 컬럼이 바뀌면 인덱스도 갱신해야 합니다. 또한 [플래너 통계](/postgres/planner-statistics/)가 부정확하면 인덱스가 있어도 사용하지 않거나, 오히려 불리한 plan을 선택할 수 있습니다. 인덱스를 추가한 뒤에는 반드시 `ANALYZE`를 실행하고 실제로 사용되는지 `pg_stat_user_indexes`로 확인해야 합니다.

### "connection pool 없이도 괜찮지 않나요?"

PostgreSQL은 [프로세스 기반 아키텍처](/postgres/architecture-overview/)입니다. 클라이언트 하나당 백엔드 프로세스가 하나씩 fork됩니다. connection이 500개면 프로세스가 500개이고, 각각 수 MB의 기본 메모리를 차지합니다. 여기에 쿼리가 정렬이나 해시를 수행할 때마다 `work_mem` 단위의 메모리가 추가로 할당되므로, 동시 활성 쿼리가 많아지면 메모리 사용량이 급격히 커집니다. connection pool 없이 스케일하면 메모리 부족과 context switch 비용이 문제가 됩니다. 이 부분은 다음 글에서 자세히 다룹니다.

## 마치며

"DB가 느려요"에 대한 답은 하나의 쿼리가 아니라 도구를 조합하는 **체계**에 있습니다. pg_stat_statements로 범인 후보를 좁히고, auto_explain으로 그 순간의 plan을 잡아내고, pg_stat_activity로 지금 무엇이 막혀 있는지를 확인합니다. 여기서 나온 단서를 인덱스, 플래너, VACUUM, 락, WAL에 대한 이해와 붙이면 "왜 느린가"에 대한 답이 나옵니다.

다음 글에서는 connection pool, 메모리 파라미터, autovacuum 튜닝 등 운영 환경에서 가장 자주 손대는 설정들을 정리합니다.

---

## 참고자료

- [PostgreSQL 18 공식 문서: Chapter 27. Monitoring Database Activity](https://www.postgresql.org/docs/18/monitoring.html)
- [F.32. pg_stat_statements: track statistics of SQL planning and execution](https://www.postgresql.org/docs/18/pgstatstatements.html)
- [F.3. auto_explain: log execution plans of slow queries](https://www.postgresql.org/docs/18/auto-explain.html)
- [pg_stat_activity view](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW)
- [Table 27.4. Wait Event Types](https://www.postgresql.org/docs/18/monitoring-stats.html#WAIT-EVENT-TABLE)
- [PostgreSQL Wiki: Slow Query Questions](https://wiki.postgresql.org/wiki/Slow_Query_Questions)
