---
date: '2026-04-01'
title: 'Airflow DB 정리하는 법: db clean부터 VACUUM까지'
category: 'DevOps'
series: 'airflow'
seriesOrder: 4
tags: ['Airflow', 'DB Clean', 'XCom', 'PostgreSQL', 'VACUUM']
summary: 'Airflow 메타데이터 DB 정리의 모든 것. db clean 명령어 해부, 실행 로그 해석법, archive 테이블 함정, 용량 모니터링과 VACUUM까지 운영에 필요한 내용을 정리합니다.'
thumbnail: './thumbnail.png'
---

Airflow를 운영하다 보면 어느 순간 UI가 느려지고, Scheduler 응답이 밀리기 시작합니다. DAG을 추가한 것도 아니고, 설정을 바꾼 것도 없는데 점점 무거워지는 느낌. 원인은 의외로 단순한 곳에 있을 수 있습니다 — **메타데이터 DB에 데이터가 쌓이고 있는 겁니다.**

[3편](/airflow/airflow-no-host-supplied/)에서 Scheduler 메모리 부족 문제를 다뤘는데, DB 비대화도 비슷한 맥락입니다. 리소스 문제는 코드가 아니라 운영 환경에서 터지기 때문에 더 놓치기 쉽습니다.

이 글에서는 `airflow db clean` 명령어로 DB를 정리하는 방법을 처음부터 끝까지 다룹니다. 실제로 XCom 24만 건을 정리한 경험을 기반으로, 명령어 해부부터 실행 로그 해석, 숨어있는 함정, 용량 모니터링, 자동화 설정까지 운영에 필요한 내용을 빠짐없이 정리했습니다.

<br>

## Airflow가 점점 느려지는 이유?

Airflow는 모든 실행 이력을 메타데이터 DB에 저장합니다. DAG 실행 기록, Task 상태, 로그, 그리고 Task 간 데이터 전달에 쓰이는 **XCom(Cross Communication)** — 이 모든 게 테이블에 쌓입니다.

DAG이 몇 개 없을 때는 문제가 안 됩니다. 하지만 DAG 수가 늘어나고, [Dynamic Task Mapping](/airflow/airflow-dynamic-task-mapping/)처럼 한 번에 수십 개 Task를 생성하는 패턴을 쓰면 상황이 달라집니다. [1편](/airflow/airflow-dag-hash/)에서 다뤘던 DAG 직렬화도 결국 메타데이터 DB에 의존하는 구조이기 때문에, DB가 비대해지면 전반적인 성능에 영향을 줍니다. XCom 하나당 한 행이니까, 매일 수천 건씩 쌓이는 건 순식간입니다.

실제로 운영 중인 환경에서 30일 이전 데이터만 조회해봤는데, 이미 이 정도가 쌓여 있었습니다:

| 테이블 | 30일 이전 건수 |
|--------|----------------|
| `xcom` | **243,066건** |
| `task_instance` | 118,734건 |
| `dag_run` | 24,860건 |
| `log` | 280건 |

XCom이 압도적입니다. 배치 DAG 하나가 매 실행마다 수십 개의 XCom을 생성하고, 하루에 여러 번 돌아가니 한 달이면 수만 건이 쌓입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ XCom은 특히 주의</strong><br>
  XCom은 Task 간 데이터를 전달하는 용도인데, 기본적으로 <strong>메타데이터 DB에 직접 저장</strong>됩니다. 큰 데이터를 XCom으로 주고받으면 한 행이 수 MB가 될 수도 있습니다. 건수뿐 아니라 용량도 급격히 늘어나는 주범입니다.
</div>

<br>

## airflow db clean 명령어 해부

Airflow 2.3부터 도입된 `airflow db clean` 명령어는 오래된 메타데이터를 정리하는 공식 도구입니다. Docker 환경에서의 실행 형태를 하나씩 뜯어보겠습니다.

```bash
$ docker exec -it airflow-scheduler \
    airflow db clean \
    --clean-before-timestamp $(date -d '-30 days' '+%Y-%m-%d') \
    -y
```

### 각 부분의 역할

**`docker exec -it airflow-scheduler`** — 실행 중인 Scheduler 컨테이너 안에서 명령을 실행합니다. 컨테이너 이름은 환경마다 다르니 `docker ps`로 확인하세요.

**`airflow db clean`** — 메타데이터 DB 정리 명령. 아래 테이블들이 정리 대상입니다:

| 대상 테이블 | 설명 |
|-------------|------|
| `xcom` | Task 간 데이터 전달 기록 |
| `task_instance` | Task 실행 이력 |
| `dag_run` | DAG 실행 이력 |
| `log` | 이벤트 로그 |
| `job` | Scheduler/Worker Job 기록 |
| `session` | 웹 세션 |
| `task_reschedule` | Sensor 등의 재스케줄 기록 |
| `trigger` | Deferrable Operator 트리거 |
| `dag_version` | DAG 직렬화 버전 |
| `import_error` | DAG 파싱 에러 |

**`--clean-before-timestamp`** — 이 날짜보다 오래된 데이터를 삭제합니다. `$(date -d '-30 days' '+%Y-%m-%d')`는 현재 기준 30일 전 날짜를 계산합니다. 2026-04-01에 실행하면 `2026-03-02` 이전 데이터가 대상이 됩니다.

**`-y`** — 확인 프롬프트 없이 바로 실행합니다.

### 유용한 추가 옵션

```bash
# 실제 삭제 없이 몇 건이 삭제되는지 미리 확인
$ airflow db clean --clean-before-timestamp '2026-03-02' --dry-run

# 특정 테이블만 정리 (예: xcom과 task_instance만)
$ airflow db clean --clean-before-timestamp '2026-03-02' -t xcom,task_instance -y

# 대량 삭제 시 배치 크기 조절 (DB 부하 분산)
$ airflow db clean --clean-before-timestamp '2026-03-02' --batch-size 1000 -y
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 운영 환경에서는 --dry-run 먼저</strong><br>
  처음 실행할 때는 반드시 <code>--dry-run</code>으로 삭제 대상 건수를 확인하세요. 예상보다 훨씬 많은 데이터가 잡힐 수 있고, 대량 삭제는 DB에 부하를 줍니다. <code>--batch-size</code>를 낮게 잡으면 트랜잭션당 삭제 건수가 줄어 DB 락 시간이 짧아집니다.
</div>

<br>

## 실행 결과 분석: 로그 읽는 법

실제 실행 로그를 보면서 어떤 부분이 중요하고, 어떤 경고는 무시해도 되는지 정리하겠습니다.

### 정상 처리 확인

가장 먼저 봐야 할 건 각 테이블의 삭제 결과입니다:

```
Checking table xcom
Found 243066 rows meeting deletion criteria.
Performing Delete...
Moving data to table _airflow_deleted__xcom__20260401024053
Finished Performing Delete
```

`Found N rows` → `Performing Delete` → `Finished Performing Delete` 흐름이 나오면 정상입니다. 실제 실행에서 정리된 건수를 정리하면:

| 테이블 | 삭제 건수 | 비고 |
|--------|-----------|------|
| `xcom` | **243,066건** | 가장 많은 비중 |
| `task_instance` | 118,734건 | |
| `dag_run` | 24,860건 | |
| `task_instance_history` | 83건 | |
| `dag_version` | 69건 | |
| `session` | 61건 | |
| `job` | 58건 | |
| `log` | 280건 | |
| `dag` | 5건 | 더 이상 사용하지 않는 DAG |

### 무시해도 되는 경고들

실행 로그에 여러 Warning이 찍히는데, 대부분 무시해도 됩니다.

**DeprecationWarning — 설정 위치 변경 안내**

```
DeprecationWarning: The grid_view_sorting_order option in [webserver]
has been moved to the grid_view_sorting_order option in [api]
```

Airflow 3.x에서 일부 설정이 `[webserver]` 섹션에서 `[api]` 섹션으로 이동했다는 안내입니다. 지금 당장은 기존 설정대로 동작하지만, 향후 버전에서 깨질 수 있으니 `airflow.cfg`를 업데이트하는 게 좋습니다.

**SAWarning — DB 인덱스 리플렉션**

```
SAWarning: Skipped unsupported reflection of expression-based index
```

SQLAlchemy가 일부 표현식 기반 인덱스를 읽지 못한다는 경고인데, 실행에는 전혀 영향 없습니다.

**Table not found — 미사용 테이블**

```
WARNING - Table celery_taskmeta not found. Skipping.
WARNING - Table _xcom_archive not found. Skipping.
WARNING - Table sla_miss not found. Skipping.
```

Celery executor를 사용하지 않거나, 해당 기능을 쓰지 않으면 테이블 자체가 없습니다. 정상적인 skip입니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 성공 판단 기준</strong><br>
  <code>ERROR</code>가 없고, 각 테이블에서 <code>Finished Performing Delete</code>가 출력되면 성공입니다. Warning은 대부분 무시해도 됩니다.
</div>

<br>

## 주의: "삭제"가 아니라 "이동"이다

여기가 가장 중요한 포인트입니다. 실행 로그를 다시 보면:

```
Moving data to table _airflow_deleted__xcom__20260401024053
```

`airflow db clean`은 데이터를 **바로 삭제하지 않습니다.** `_airflow_deleted__<테이블명>__<타임스탬프>` 형태의 아카이브 테이블로 **이동**합니다. 이건 실수로 지웠을 때 복구할 수 있게 하려는 안전장치입니다.

```
정리 전:  xcom 테이블 (243,066건)
정리 후:  xcom 테이블 (정리됨)
          _airflow_deleted__xcom__20260401024053 (243,066건) ← 여기로 이동
```

**핵심은 이겁니다 — DB 용량은 줄지 않습니다.** 데이터가 다른 테이블로 옮겨졌을 뿐이니까요. 논리적으로는 정리됐지만, 디스크 공간은 그대로입니다.

### 아카이브 테이블 정리하기

아카이브 테이블은 **자동으로 삭제되지 않습니다.** 직접 정리해야 합니다. Airflow는 이를 위한 전용 명령어를 제공합니다:

```bash
# 아카이브 테이블 목록 확인 후 삭제
$ airflow db drop-archived -y

# 특정 테이블의 아카이브만 삭제
$ airflow db drop-archived -t xcom -y

# 삭제 전에 CSV로 백업하고 싶다면
$ airflow db export-archived --output-path /tmp/airflow-backup/
```

### --skip-archive: 아카이브 없이 바로 삭제

아카이브 자체를 만들지 않고 싶다면 `--skip-archive` 옵션을 사용합니다:

```bash
$ airflow db clean \
    --clean-before-timestamp $(date -d '-30 days' '+%Y-%m-%d') \
    --skip-archive -y
```

이 옵션을 쓰면 `_airflow_deleted__` 테이블이 생기지 않고, 데이터가 즉시 영구 삭제됩니다. 복구가 불가능하므로 주의가 필요합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ --skip-archive 버전 주의</strong><br>
  Airflow 2.10 이전 버전에서는 <code>--skip-archive</code>가 내부적으로 아카이브 테이블을 생성했다가 다시 삭제하는 방식으로 동작해서, 대량 삭제 시 statement timeout 문제가 발생할 수 있었습니다 (<a href="https://github.com/apache/airflow/issues/42003">#42003</a>). 최신 버전에서는 수정되었지만, 오래된 Airflow를 쓰고 있다면 테스트 후 사용하세요.
</div>

### 실무 권장 패턴

| 상황 | 권장 방식 |
|------|-----------|
| 운영 초기, 안정성 중시 | 기본 모드 (아카이브 생성) → 1~2주 후 `db drop-archived` |
| 안정화된 환경 | `--skip-archive`로 즉시 삭제 |
| DB 용량 긴급 | `--skip-archive` + `VACUUM FULL` |

<br>

## DB 용량 모니터링

정리 효과를 확인하려면 실제 용량을 봐야 합니다. PostgreSQL 기준으로 유용한 쿼리를 정리합니다.

### 테이블별 사이즈 확인

```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table_size,
    pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 20;
```

### 아카이브 테이블 용량 확인

`_airflow_deleted__` 테이블이 얼마나 용량을 차지하는지 따로 확인할 수 있습니다:

```sql
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '_airflow_deleted__%'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
```

### Dead Tuple 확인

PostgreSQL에서 `DELETE`는 실제로 디스크 공간을 해제하지 않습니다. 삭제된 행은 "dead tuple"로 남아 있다가 `VACUUM`이 처리합니다.

```sql
SELECT
    relname AS table_name,
    n_dead_tup AS dead_tuples,
    n_live_tup AS live_tuples,
    round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) AS dead_ratio_pct,
    last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

dead tuple 비율이 높으면 `VACUUM`이 필요하다는 신호입니다.

<br>

## PostgreSQL VACUUM: 진짜 용량 확보

`db clean` + `db drop-archived`(또는 `--skip-archive`)까지 했어도, PostgreSQL에서는 디스크 용량이 바로 줄지 않을 수 있습니다. `DELETE`는 행을 "삭제됨"으로 표시할 뿐, 물리적 공간은 그대로 유지하기 때문입니다.

### VACUUM vs VACUUM FULL

```sql
-- 일반 VACUUM: dead tuple 공간을 재사용 가능하게 표시
-- 테이블 잠금 없음, 운영 중 실행 가능
VACUUM ANALYZE xcom;
VACUUM ANALYZE task_instance;
VACUUM ANALYZE dag_run;

-- VACUUM FULL: 테이블을 물리적으로 재작성하여 디스크 공간 실제 회수
-- ⚠️ 테이블 잠금 발생 — 점검 시간에 실행 권장
VACUUM FULL xcom;
VACUUM FULL task_instance;
VACUUM FULL dag_run;
```

| 구분 | `VACUUM ANALYZE` | `VACUUM FULL` |
|------|-------------------|---------------|
| 디스크 공간 회수 | ❌ (재사용 가능 표시만) | ✅ 실제 회수 |
| 테이블 잠금 | 없음 | **배타적 잠금** |
| 운영 중 실행 | ✅ 가능 | ❌ 다운타임 필요 |
| 소요 시간 | 짧음 | 테이블 크기에 비례 |
| 권장 시점 | db clean 직후 | 대량 삭제 후 용량 확보 필요 시 |

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 실무 순서</strong><br>
  <code>airflow db clean</code> → <code>airflow db drop-archived</code> → <code>VACUUM ANALYZE</code> (즉시) → 용량 확보 필요 시 <code>VACUUM FULL</code> (점검 시간). PostgreSQL의 autovacuum이 자동으로 처리해주긴 하지만, 수십만 건 삭제 후에는 수동으로 돌리는 게 즉각적인 효과를 볼 수 있습니다.
</div>

<br>

## 운영 자동화

DB 정리는 한 번 하고 끝나는 게 아닙니다. 주기적으로 실행해야 쌓이는 걸 방지할 수 있습니다.

### 보존 기간 가이드

| 상황 | 권장 보존 기간 | 이유 |
|------|----------------|------|
| 일반 운영 | 30~60일 | 최근 장애 디버깅에 충분한 기간 |
| 안정적인 환경 | 14~30일 | XCom이 많으면 더 짧게 |
| 감사/규정 요구 | 90일 이상 | 규정에 따라 조정 |

너무 짧으면(1~3일) 장애 발생 시 과거 실행 기록을 확인할 수 없고, 너무 길면 DB가 다시 비대해집니다. 경험상 30일이 대부분의 환경에서 적절합니다.

### Cron으로 자동화

가장 간단한 방법은 호스트 cron에 등록하는 겁니다:

```bash
# 매주 일요일 새벽 3시에 실행 (30일 이전 데이터 정리)
0 3 * * 0 docker exec airflow-scheduler \
  airflow db clean --clean-before-timestamp "$(date -d '-30 days' '+\%Y-\%m-\%d')" --skip-archive -y \
  >> /var/log/airflow-db-clean.log 2>&1

# 같은 시간에 VACUUM도 실행
30 3 * * 0 docker exec airflow-postgres \
  psql -U airflow -d airflow -c "VACUUM ANALYZE xcom; VACUUM ANALYZE task_instance; VACUUM ANALYZE dag_run;" \
  >> /var/log/airflow-vacuum.log 2>&1
```

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ Airflow 3.x에서 DAG 기반 자동화의 한계</strong><br>
  Airflow 2.x에서는 <code>BashOperator</code>로 <code>airflow db clean</code>을 실행하는 DAG을 만드는 패턴이 널리 쓰였는데, Airflow 3.x에서는 이 방식이 정상 동작하지 않는 경우가 보고되고 있습니다 (<a href="https://github.com/apache/airflow/discussions/56281">Discussion #56281</a>). 안정적인 자동화가 필요하다면 cron이나 Kubernetes CronJob을 권장합니다.
</div>

<br>

## 한눈에 보는 체크리스트

운영 중인 Airflow가 있다면, 이 항목들을 정기적으로 점검하세요:

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 Airflow DB 관리 체크리스트</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li><code>airflow db clean</code>을 주기적으로 실행하고 있는가?</li>
    <li><code>_airflow_deleted__</code> 아카이브 테이블이 방치되어 있지 않은가?</li>
    <li>대량 삭제 후 <code>VACUUM ANALYZE</code>를 돌렸는가?</li>
    <li>XCom에 불필요하게 큰 데이터를 저장하고 있지 않은가?</li>
    <li>DB 테이블 사이즈를 주기적으로 모니터링하고 있는가?</li>
  </ul>
</div>

<br>

## 마치며

DB 정리는 화려한 작업은 아니지만, 안 하면 확실히 느려집니다. 특히 XCom을 많이 쓰는 환경에서는 수십만 건이 순식간에 쌓이기 때문에, 주기적인 정리가 필수입니다.

`airflow db clean`이 데이터를 "삭제"가 아니라 "이동"한다는 점, 그래서 `db drop-archived`나 `--skip-archive`로 한 단계 더 처리해야 진짜 정리가 된다는 점 — 이 두 가지만 기억해도 운영에서 큰 차이가 납니다.

<br>

## 참고자료

- [Airflow 공식 문서 — CLI Reference: db clean](https://airflow.apache.org/docs/apache-airflow/stable/cli-and-env-variables-ref.html#clean)
- [Airflow 공식 문서 — Best Practices: Database Backend](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html)
- [Airflow 2.3.0 Release — db clean 도입](https://airflow.apache.org/blog/airflow-2.3.0/)
- [PostgreSQL 공식 문서 — Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- [GitHub Discussion #52889 — Table size not shrinking after db clean](https://github.com/apache/airflow/discussions/52889)
