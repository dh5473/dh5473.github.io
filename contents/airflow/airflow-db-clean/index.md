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

Airflow를 운영하다 보면 어느 순간 UI가 느려지고, Scheduler 응답이 밀리기 시작합니다. DAG을 추가한 것도 아니고 설정을 바꾼 것도 없는데 점점 무거워집니다. 원인은 의외로 단순한 곳에 있습니다. **메타데이터 DB에 데이터가 쌓이고 있는 겁니다.**

리소스 문제는 코드가 아니라 운영 환경에서 터지기 때문에 놓치기 쉽습니다. [Scheduler가 메모리를 다 쓰고 죽는 문제](/airflow/airflow-no-host-supplied/)가 그랬듯이, DB 비대화도 DAG 코드를 아무리 들여다봐도 보이지 않습니다.

이 글에서는 `airflow db clean`으로 메타데이터 DB를 정리하는 과정을 끝까지 따라갑니다. 명령어가 실제로 무슨 일을 하는지, 실행 로그를 어떻게 읽는지, 왜 24만 건을 지웠는데 디스크가 안 줄어드는지, 그리고 그걸 마무리하는 PostgreSQL `VACUUM`까지 이어집니다.

## Airflow가 점점 느려지는 이유?

Airflow는 모든 실행 이력을 메타데이터 DB에 저장합니다. DAG 실행 기록, Task 상태, 이벤트 로그, Task 간 데이터 전달에 쓰이는 **XCom(Cross Communication)**까지 전부 테이블에 쌓입니다.

DAG이 몇 개 없을 때는 문제가 안 됩니다. 하지만 DAG 수가 늘어나고, [Dynamic Task Mapping](/airflow/airflow-dynamic-task-mapping/)처럼 한 번에 수십 개 Task를 생성하는 패턴을 쓰면 상황이 달라집니다. [DAG 직렬화](/airflow/airflow-dag-hash/) 역시 메타데이터 DB에 얹혀 있어서, DB가 비대해지면 Scheduler가 직렬화된 DAG을 읽어오는 경로부터 느려집니다. XCom은 값 하나당 한 행이니, 매일 수천 건씩 쌓이는 건 순식간입니다.

실제로 운영 중인 환경에서 30일 이전 데이터만 조회해봤더니 이 정도가 쌓여 있었습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 262" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="30일 이전 메타데이터 건수를 테이블별로 비교한 가로 막대 그래프. xcom 243066건이 압도적으로 길고 task_instance 118734건은 그 절반, dag_run 24860건은 짧은 토막, log 280건은 선 하나 굵기입니다">
<text x="8" y="20" font-size="17" font-weight="600" fill="var(--text, #1c1917)">30일 이전 데이터 건수</text>
<!-- xcom -->
<text x="8" y="58" font-size="15" fill="var(--text, #1c1917)">xcom</text>
<text x="392" y="58" font-size="15" font-weight="600" text-anchor="end" fill="var(--text, #1c1917)">243,066건</text>
<rect x="8" y="66" width="340" height="20" rx="3" fill="var(--primary, #0a756c)"/>
<!-- task_instance -->
<text x="8" y="110" font-size="15" fill="var(--text, #1c1917)">task_instance</text>
<text x="392" y="110" font-size="15" font-weight="600" text-anchor="end" fill="var(--text, #1c1917)">118,734건</text>
<rect x="8" y="118" width="166" height="20" rx="3" fill="var(--primary, #0a756c)"/>
<!-- dag_run -->
<text x="8" y="162" font-size="15" fill="var(--text, #1c1917)">dag_run</text>
<text x="392" y="162" font-size="15" font-weight="600" text-anchor="end" fill="var(--text, #1c1917)">24,860건</text>
<rect x="8" y="170" width="35" height="20" rx="3" fill="var(--primary, #0a756c)"/>
<!-- log -->
<text x="8" y="214" font-size="15" fill="var(--text, #1c1917)">log</text>
<text x="392" y="214" font-size="15" font-weight="600" text-anchor="end" fill="var(--text, #1c1917)">280건</text>
<rect x="8" y="222" width="3" height="20" rx="1" fill="var(--primary, #0a756c)"/>
<text x="20" y="237" font-size="14" fill="var(--text-muted, #6d6762)">(막대가 거의 보이지 않는 크기)</text>
</svg>
</div>

배치 DAG 하나가 매 실행마다 수십 개의 XCom을 만들고 하루에 여러 번 돌아가니, 한 달이면 수십만 건이 됩니다.

:::warning

**XCom은 건수보다 용량이 문제**

XCom은 Task 간에 값을 주고받는 용도인데, 기본 백엔드에서는 **메타데이터 DB의 `xcom` 테이블에 직접 저장**됩니다. DataFrame이나 큰 JSON을 그대로 넘기면 한 행이 수 MB가 되기도 합니다. 건수 대비 용량이 가장 빠르게 늘어나는 테이블입니다.

:::

## airflow db clean 명령어 해부

Airflow 2.3부터 도입된 `airflow db clean` 명령어는 오래된 메타데이터를 정리하는 공식 도구입니다. Docker 환경에서의 실행 형태를 하나씩 뜯어보겠습니다.

```bash
$ docker exec -it airflow-scheduler \
    airflow db clean \
    --clean-before-timestamp $(date -d '-30 days' '+%Y-%m-%d') \
    -y
```

### 각 부분의 역할

**`docker exec -it airflow-scheduler`**: 실행 중인 Scheduler 컨테이너 안에서 명령을 실행합니다. 컨테이너 이름은 환경마다 다르니 `docker ps`로 확인하세요.

**`airflow db clean`**: 메타데이터 DB 정리 명령입니다. 정리 대상 테이블은 코드에 하드코딩된 목록으로 정해져 있고, 테이블마다 "오래됨"을 판단하는 기준 컬럼이 따로 있습니다.

| 대상 테이블 | 기준 컬럼 | 내용 |
|-------------|-----------|------|
| `xcom` | `timestamp` | Task 간 데이터 전달 값 |
| `task_instance` | `start_date` | Task 실행 이력 |
| `task_instance_history` | `start_date` | 재시도로 밀려난 이전 시도 기록 |
| `dag_run` | `start_date` | DAG 실행 이력 |
| `log` | `dttm` | 이벤트 로그 |
| `job` | `latest_heartbeat` | Scheduler/Triggerer 등 Job 기록 |
| `dag` | `last_parsed_time` | 오랫동안 파싱되지 않은 DAG |
| `dag_version` | `created_at` | DAG 직렬화 버전 |
| `trigger` | `created_date` | Deferrable Operator 트리거 |
| `task_reschedule` | `start_date` | Sensor 등의 재스케줄 기록 |
| `asset_event` | `timestamp` | Asset 이벤트 |
| `import_error` | `timestamp` | DAG 파싱 에러 |

목록은 이게 전부가 아닙니다. `callback_request`, `celery_taskmeta`, `celery_tasksetmeta`, `sla_miss`, `deadline`, `task_state_store`, `revoked_token`, `connection_test_request`, `_xcom_archive`도 대상에 포함되고, `session`(웹 세션)은 FAB 인증 매니저를 쓰면서 세션 백엔드가 DB일 때만 목록에 추가됩니다. 버전마다 테이블이 늘고 줄기 때문에, 내가 쓰는 버전의 정확한 목록은 `airflow db clean --help`가 `-t` 옵션 설명에 그대로 찍어줍니다.

`dag_run`과 `dag_version`에는 예외가 걸려 있습니다. 기간 조건에 들어와도 `dag_id`별로 가장 최근 것 하나는 남깁니다(`dag_run`은 수동 실행을 뺀 기준). 오래 안 돌린 DAG의 마지막 실행 기록까지 통째로 사라지면 UI에서 그 DAG이 한 번도 안 돈 것처럼 보이기 때문입니다.

**`--clean-before-timestamp`**: 이 시각보다 오래된 데이터를 대상으로 삼습니다. `$(date -d '-30 days' '+%Y-%m-%d')`는 30일 전 날짜를 계산합니다. 2026-04-01에 실행하면 `2026-03-02` 이전이 대상입니다. 타임존을 안 붙이고 날짜만 주면 Airflow 기본 타임존의 그날 자정으로 해석되니, UTC 환경에서 KST 기준으로 자르고 싶다면 `'2026-03-02 00:00:00+09:00'`처럼 명시하는 편이 안전합니다.

**`-y`**: 확인 프롬프트 없이 바로 실행합니다.

### 유용한 추가 옵션

```bash
# 실제 삭제 없이 몇 건이 삭제되는지 미리 확인
$ airflow db clean --clean-before-timestamp '2026-03-02' --dry-run

# 특정 테이블만 정리 (예: xcom과 task_instance만)
$ airflow db clean --clean-before-timestamp '2026-03-02' -t xcom,task_instance -y

# 대량 삭제 시 배치 크기 조절 (DB 부하 분산)
$ airflow db clean --clean-before-timestamp '2026-03-02' --batch-size 1000 -y

# 특정 DAG만, 또는 특정 DAG만 빼고 정리
$ airflow db clean --clean-before-timestamp '2026-03-02' --dag-ids heavy_etl -y
$ airflow db clean --clean-before-timestamp '2026-03-02' --exclude-dag-ids audit_dag -y
```

:::tip

**운영 환경에서는 --dry-run 먼저**

처음 실행할 때는 `--dry-run`으로 삭제 대상 건수를 확인하세요. 예상보다 훨씬 많이 잡힐 수 있고, 대량 삭제는 DB에 부하를 줍니다.

`--batch-size`는 한 트랜잭션에서 처리할 최대 행 수입니다. 낮게 잡으면 긴 잠금이 줄어드는 대신 배치 수가 늘어납니다. 배치마다 별도의 아카이브 테이블이 만들어지고 이름 끝에 `__b1`, `__b2` 같은 접미사가 붙는다는 점도 알아두면 좋습니다.

:::

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

`Found N rows` → `Performing Delete` → `Moving data to table ...` → `Finished Performing Delete` 흐름이 나오면 정상입니다. 실제 실행에서 정리된 건수는 이렇습니다.

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

**DeprecationWarning: 설정 위치 변경 안내**

```
DeprecationWarning: The grid_view_sorting_order option in [webserver]
has been moved to the grid_view_sorting_order option in [api]
```

Airflow 3.x에서 웹 UI 관련 설정 일부가 `[webserver]`에서 `[api]` 섹션으로 옮겨갔다는 안내입니다. `grid_view_sorting_order`는 실제로 지금 `[api]` 섹션에 정의되어 있습니다. 당장은 기존 위치의 값도 읽어주지만 언젠가는 끊기므로 `airflow.cfg`를 옮겨두는 게 좋습니다.

**SAWarning: DB 인덱스 리플렉션**

```
SAWarning: Skipped unsupported reflection of expression-based index
```

`db clean`은 삭제 전에 테이블 구조를 SQLAlchemy로 다시 읽어옵니다(reflection). 이때 표현식 기반 인덱스는 SQLAlchemy가 표현하지 못해서 건너뛴다는 경고인데, 인덱스 자체는 DB에 그대로 있고 삭제 동작에도 영향이 없습니다.

**Table not found: 미사용 테이블**

```
WARNING - Table celery_taskmeta not found. Skipping.
WARNING - Table _xcom_archive not found. Skipping.
WARNING - Table sla_miss not found. Skipping.
```

Celery executor를 안 쓰거나 해당 기능을 안 쓰면 테이블 자체가 없습니다. 정상적인 skip입니다. `_xcom_archive`는 Airflow 2 시절 XCom 마이그레이션이 남기던 테이블이고, 뒤에 나올 `_airflow_deleted__` 아카이브와는 이름만 비슷할 뿐 다른 것입니다.

:::info

**성공 판단 기준**

`ERROR`가 없고 각 테이블에서 `Finished Performing Delete`가 출력되면 성공입니다. Warning은 대부분 무시해도 됩니다.

:::

## 주의: "삭제"가 아니라 "이동"이다

여기가 이 글에서 가장 중요한 부분입니다. 실행 로그를 다시 보면 삭제 직전에 이런 줄이 하나 끼어 있습니다.

```
Moving data to table _airflow_deleted__xcom__20260401024053
```

`airflow db clean`은 행을 바로 지우지 않습니다. `_airflow_deleted__<테이블명>__<타임스탬프>` 형태의 **아카이브 테이블을 새로 만들어 대상 행을 통째로 복사한 다음**, 원본에서 `DELETE`를 겁니다. 실수로 지웠을 때 되돌릴 수 있게 하려는 안전장치입니다.

문제는 그 결과입니다. 24만 건을 정리했는데 디스크는 줄지 않습니다. **오히려 잠시 늘어납니다.**

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 498" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="db clean 전후 디스크 상태를 세 단계로 비교한 그림. 실행 전에는 xcom 파일 하나에 오래된 행과 최근 행이 함께 있고, db clean 직후에는 xcom 파일 크기가 그대로인 채 아카이브 파일이 하나 더 생겨 디스크 사용량이 늘며, 아카이브를 지우고 VACUUM FULL을 돌린 뒤에야 xcom 파일이 최근 행 크기로 줄어듭니다">
<defs>
<marker id="db2Arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">
<path d="M0,0 L7,3.2 L0,6.4 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- panel 1 -->
<text x="20" y="20" font-size="17" font-weight="600" fill="var(--text, #1c1917)">1. db clean 실행 전</text>
<text x="20" y="44" font-size="14" fill="var(--text-muted, #6d6762)">xcom 테이블 파일</text>
<rect x="20" y="52" width="238" height="44" rx="4" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<text x="139" y="79" font-size="14" text-anchor="middle" fill="var(--text-danger, #cb2121)">30일 이전 243,066건</text>
<rect x="262" y="52" width="78" height="44" rx="4" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="301" y="79" font-size="14" text-anchor="middle" fill="var(--primary, #0a756c)">최근</text>
<!-- arrow 1 -->
<line x1="60" y1="106" x2="60" y2="134" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#db2Arrow)"/>
<text x="76" y="125" font-size="15" fill="var(--text, #1c1917)">airflow db clean</text>
<!-- panel 2 -->
<text x="20" y="166" font-size="17" font-weight="600" fill="var(--text, #1c1917)">2. db clean 직후</text>
<text x="20" y="190" font-size="14" fill="var(--text-muted, #6d6762)">xcom 테이블 파일 (크기 그대로)</text>
<rect x="20" y="198" width="238" height="44" rx="4" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5" stroke-dasharray="5 3"/>
<text x="139" y="225" font-size="14" text-anchor="middle" fill="var(--text-danger, #cb2121)">dead tuple로 남은 자리</text>
<rect x="262" y="198" width="78" height="44" rx="4" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="301" y="225" font-size="14" text-anchor="middle" fill="var(--primary, #0a756c)">최근</text>
<text x="20" y="266" font-size="14" fill="var(--text-muted, #6d6762)">_airflow_deleted__xcom__20260401024053</text>
<rect x="20" y="274" width="238" height="44" rx="4" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #9d5604)" stroke-width="1.5"/>
<text x="139" y="301" font-size="14" text-anchor="middle" fill="var(--text-warn, #9d5604)">243,066건 복사본</text>
<!-- arrow 2 -->
<line x1="60" y1="328" x2="60" y2="366" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#db2Arrow)"/>
<text x="76" y="344" font-size="15" fill="var(--text, #1c1917)">airflow db drop-archived</text>
<text x="76" y="362" font-size="15" fill="var(--text, #1c1917)">VACUUM FULL xcom</text>
<!-- panel 3 -->
<text x="20" y="398" font-size="17" font-weight="600" fill="var(--text, #1c1917)">3. 아카이브 삭제 + VACUUM FULL 후</text>
<text x="20" y="422" font-size="14" fill="var(--text-muted, #6d6762)">xcom 테이블 파일 (재작성되어 축소)</text>
<rect x="20" y="430" width="78" height="44" rx="4" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<text x="59" y="457" font-size="14" text-anchor="middle" fill="var(--primary, #0a756c)">최근</text>
</svg>
</div>

### 아카이브 테이블 정리하기

아카이브 테이블은 **자동으로 삭제되지 않습니다.** 직접 지워야 합니다. Airflow가 전용 명령어를 제공합니다.

```bash
# 아카이브 테이블 목록 확인 후 삭제
$ airflow db drop-archived -y

# 특정 테이블의 아카이브만 삭제
$ airflow db drop-archived -t xcom -y

# 삭제 전에 CSV로 백업하고 싶다면
$ airflow db export-archived --output-path /tmp/airflow-backup/
```

### --skip-archive: 아카이브를 남기지 않기

아카이브 테이블을 남기고 싶지 않다면 `--skip-archive`를 붙입니다.

```bash
$ airflow db clean \
    --clean-before-timestamp $(date -d '-30 days' '+%Y-%m-%d') \
    --skip-archive -y
```

여기서 오해하기 쉬운 지점이 있습니다. 옵션 이름은 "아카이브를 건너뛴다"지만, 실제로는 **아카이브 테이블을 똑같이 만들고 데이터를 똑같이 복사한 다음, 마지막에 그 테이블을 `DROP`합니다.** 복사 단계가 사라지는 게 아닙니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 256" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="db clean의 내부 삭제 절차 세 단계. 아카이브 테이블을 만들어 행을 복사하고, 원본에서 삭제하고, skip-archive 옵션을 준 경우에만 마지막에 아카이브 테이블을 드롭합니다">
<defs>
<marker id="db3Arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">
<path d="M0,0 L7,3.2 L0,6.4 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- step 1 -->
<rect x="20" y="16" width="360" height="56" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="34" y="41" font-size="16" font-weight="600" fill="var(--text, #1c1917)">1. CREATE TABLE ... AS SELECT</text>
<text x="34" y="62" font-size="14" fill="var(--text-muted, #6d6762)">오래된 행을 아카이브 테이블로 복사</text>
<line x1="200" y1="74" x2="200" y2="96" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#db3Arrow)"/>
<!-- step 2 -->
<rect x="20" y="98" width="360" height="56" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="34" y="123" font-size="16" font-weight="600" fill="var(--text, #1c1917)">2. DELETE FROM xcom</text>
<text x="34" y="144" font-size="14" fill="var(--text-muted, #6d6762)">방금 복사한 행을 원본에서 삭제</text>
<line x1="200" y1="156" x2="200" y2="178" stroke="var(--text-muted, #6d6762)" stroke-width="1.5" marker-end="url(#db3Arrow)"/>
<!-- step 3 -->
<rect x="20" y="180" width="360" height="56" rx="6" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #9d5604)" stroke-width="1.5" stroke-dasharray="5 3"/>
<text x="34" y="205" font-size="16" font-weight="600" fill="var(--text-warn, #9d5604)">3. DROP TABLE _airflow_deleted__...</text>
<text x="34" y="226" font-size="14" fill="var(--text-warn, #9d5604)">--skip-archive 를 줬을 때만 실행</text>
</svg>
</div>

:::warning

**--skip-archive는 삭제 부하를 줄여주지 않습니다**

`--skip-archive`를 줘도 대상 행을 새 테이블에 복사하는 트랜잭션은 그대로 돕니다. statement timeout이 짧은 환경에서 수십만 건을 한 번에 지우면 여기서 걸릴 수 있고, 이건 아직 [열려 있는 이슈](https://github.com/apache/airflow/issues/42003)입니다. 대량 정리라면 `--batch-size`로 쪼개거나 기간을 여러 번에 나눠 좁혀 들어가는 편이 안전합니다.

되돌릴 수 없다는 점도 그대로입니다. 아카이브 테이블이 남지 않으니 복구 경로가 없습니다.

:::

### 실무 권장 패턴

| 상황 | 권장 방식 |
|------|-----------|
| 운영 초기, 안정성 중시 | 기본 모드(아카이브 생성) 후 1~2주 뒤 `db drop-archived` |
| 안정화된 환경 | `--skip-archive`로 바로 정리 |
| DB 용량 긴급 | `--skip-archive` + `VACUUM FULL` |

마지막 줄에는 함정이 하나 있습니다. `VACUUM FULL`은 테이블을 새 파일에 다시 쓰는 방식이라 **작업이 끝날 때까지 원본과 사본이 동시에 존재합니다.** 디스크가 이미 꽉 차서 급한 상황이라면 오히려 실패합니다. 이럴 때는 아카이브 테이블을 `db drop-archived`로 먼저 날려서 여유 공간을 확보한 다음 `VACUUM FULL`로 넘어가야 합니다.

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

PostgreSQL에서 `DELETE`는 디스크 공간을 해제하지 않습니다. 삭제된 행은 파일 안에 "dead tuple"로 남아 있다가 `VACUUM`이 처리합니다.

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

## PostgreSQL VACUUM: 진짜 용량 확보

`db drop-archived`로 아카이브 테이블까지 지웠는데도 디스크가 기대만큼 안 줄어드는 경우가 있습니다. 아카이브 테이블은 `DROP TABLE`이라 파일이 통째로 사라지지만, **원본 `xcom` 테이블은 `DELETE`를 맞았을 뿐이라 파일 크기가 그대로**이기 때문입니다.

PostgreSQL의 `DELETE`는 행에 "이제 안 보임" 표시만 남깁니다. 그 자리를 정리하는 게 `VACUUM`인데, 여기서 한 번 더 갈립니다.

### VACUUM vs VACUUM FULL

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 466" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="테이블 파일을 8개 페이지로 표현해 DELETE 직후, VACUUM 후, VACUUM FULL 후를 비교한 그림. VACUUM은 dead tuple 자리를 재사용 가능한 빈칸으로 바꾸지만 파일 크기는 8페이지 그대로이고, VACUUM FULL은 살아있는 3페이지만 새 파일에 다시 써서 파일이 3페이지로 줄어듭니다">
<!-- panel 1 -->
<text x="20" y="20" font-size="17" font-weight="600" fill="var(--text, #1c1917)">DELETE 직후</text>
<text x="20" y="42" font-size="14" fill="var(--text-muted, #6d6762)">지운 행이 dead tuple로 파일 안에 그대로 남음</text>
<rect x="25" y="52" width="42" height="34" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M38,61 L54,77 M54,61 L38,77" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<rect x="69" y="52" width="42" height="34" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M82,61 L98,77 M98,61 L82,77" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<rect x="113" y="52" width="42" height="34" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M126,61 L142,77 M142,61 L126,77" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<rect x="157" y="52" width="42" height="34" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M170,61 L186,77 M186,61 L170,77" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<rect x="201" y="52" width="42" height="34" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M214,61 L230,77 M230,61 L214,77" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<rect x="245" y="52" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="266" cy="69" r="6" fill="var(--primary, #0a756c)"/>
<rect x="289" y="52" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="310" cy="69" r="6" fill="var(--primary, #0a756c)"/>
<rect x="333" y="52" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="354" cy="69" r="6" fill="var(--primary, #0a756c)"/>
<path d="M25,96 L25,102 M25,99 L375,99 M375,96 L375,102" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<text x="25" y="118" font-size="15" fill="var(--text, #1c1917)">파일 크기: 8페이지</text>
<!-- panel 2 -->
<text x="20" y="152" font-size="17" font-weight="600" fill="var(--text, #1c1917)">VACUUM 후</text>
<text x="20" y="174" font-size="14" fill="var(--text-muted, #6d6762)">빈칸은 재사용 가능. 파일 크기는 그대로.</text>
<rect x="25" y="184" width="42" height="34" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<rect x="69" y="184" width="42" height="34" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<rect x="113" y="184" width="42" height="34" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<rect x="157" y="184" width="42" height="34" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<rect x="201" y="184" width="42" height="34" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<rect x="245" y="184" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="266" cy="201" r="6" fill="var(--primary, #0a756c)"/>
<rect x="289" y="184" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="310" cy="201" r="6" fill="var(--primary, #0a756c)"/>
<rect x="333" y="184" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="354" cy="201" r="6" fill="var(--primary, #0a756c)"/>
<path d="M25,228 L25,234 M25,231 L375,231 M375,228 L375,234" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<text x="25" y="250" font-size="15" fill="var(--text-warn, #9d5604)">파일 크기: 8페이지 (안 줄어듦)</text>
<!-- panel 3 -->
<text x="20" y="284" font-size="17" font-weight="600" fill="var(--text, #1c1917)">VACUUM FULL 후</text>
<text x="20" y="306" font-size="14" fill="var(--text-muted, #6d6762)">살아있는 행만 새 파일에 다시 씀</text>
<rect x="25" y="316" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="46" cy="333" r="6" fill="var(--primary, #0a756c)"/>
<rect x="69" y="316" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="90" cy="333" r="6" fill="var(--primary, #0a756c)"/>
<rect x="113" y="316" width="42" height="34" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="134" cy="333" r="6" fill="var(--primary, #0a756c)"/>
<path d="M25,360 L25,366 M25,363 L155,363 M155,360 L155,366" stroke="var(--text-muted, #6d6762)" stroke-width="1.5"/>
<text x="25" y="382" font-size="15" font-weight="600" fill="var(--text-success, #107836)">파일 크기: 3페이지 (OS에 반환)</text>
<!-- legend -->
<rect x="25" y="404" width="20" height="18" rx="3" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<path d="M30,409 L40,419 M40,409 L30,419" stroke="var(--text-danger, #cb2121)" stroke-width="1.5"/>
<text x="53" y="418" font-size="14" fill="var(--text-muted, #6d6762)">dead tuple</text>
<rect x="145" y="404" width="20" height="18" rx="3" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 3"/>
<text x="173" y="418" font-size="14" fill="var(--text-muted, #6d6762)">재사용 가능한 빈칸</text>
<rect x="25" y="434" width="20" height="18" rx="3" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--primary, #0a756c)" stroke-width="1.5"/>
<circle cx="35" cy="443" r="5" fill="var(--primary, #0a756c)"/>
<text x="53" y="448" font-size="14" fill="var(--text-muted, #6d6762)">살아있는 행</text>
</svg>
</div>

```sql
-- 일반 VACUUM: dead tuple 자리를 재사용 가능한 빈칸으로 만든다
-- 읽기와 쓰기를 막지 않으므로 운영 중에 그냥 돌려도 된다
VACUUM ANALYZE xcom;
VACUUM ANALYZE task_instance;
VACUUM ANALYZE dag_run;

-- VACUUM FULL: 테이블을 새 파일에 다시 써서 디스크를 OS에 반환한다
-- ACCESS EXCLUSIVE 잠금이 걸리므로 점검 시간에 실행할 것
VACUUM FULL xcom;
VACUUM FULL task_instance;
VACUUM FULL dag_run;
```

| 구분 | `VACUUM` (일반) | `VACUUM FULL` |
|------|-----------------|---------------|
| dead tuple 처리 | 재사용 가능한 빈 자리로 표시 | 살아있는 행만 새 파일에 다시 씀 |
| OS에 공간 반환 | ❌ 원칙적으로 안 함 | ✅ 반환 |
| 잠금 수준 | `SHARE UPDATE EXCLUSIVE` | `ACCESS EXCLUSIVE` |
| 읽기·쓰기 병행 | ✅ 가능 | ❌ 전부 대기 |
| 추가 디스크 | 필요 없음 | 테이블 크기만큼 더 필요 |
| autovacuum이 대신 함 | ✅ | ❌ 절대 실행하지 않음 |

"원칙적으로 안 함"에는 예외가 하나 있습니다. 파일 **끝쪽 페이지가 통째로 비었고** 그 순간 배타 잠금을 쉽게 얻을 수 있으면, 일반 `VACUUM`도 그 꼬리만큼은 잘라내서 OS에 돌려줍니다. 다만 오래된 행이 파일 앞쪽에 흩어져 있는 보통의 경우에는 해당되지 않습니다. `xcom`처럼 시간순으로 append되는 테이블이면 오래된 행이 앞쪽에 모여 있으니 더더욱 안 잘립니다.

### autovacuum은 왜 이걸 해결해주지 못하나

"어차피 autovacuum이 돌 텐데 놔두면 되지 않나" 싶지만, 두 가지 이유로 안 됩니다.

**첫째, autovacuum은 `VACUUM FULL`을 절대 실행하지 않습니다.** 설계상 그렇습니다. 목표가 테이블을 최소 크기로 유지하는 게 아니라 디스크 사용량을 안정 상태로 유지하는 것이라서, 배타 잠금이 필요한 재작성은 아예 후보에 없습니다. 그래서 autovacuum이 아무리 부지런히 돌아도 부풀어버린 파일은 원래 크기로 돌아오지 않습니다.

**둘째, 큰 테이블일수록 늦게 돕니다.** autovacuum이 어떤 테이블을 청소할지 판단하는 기준은 대략 이렇습니다.

```
임계치 = autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × 전체 행 수
```

기본값이 각각 50과 0.2이므로, 전체 행의 **20%가 dead tuple이 되어야** 비로소 대상이 됩니다. 100만 행짜리 `xcom`이면 죽은 행이 20만 건을 넘겨야 청소가 시작됩니다. 그리고 마침내 돌더라도 결과는 위 그림의 가운데 단계, 즉 빈칸만 늘어난 똑같은 크기의 파일입니다.

정리하면 autovacuum은 "공간을 재사용 가능하게 만드는 일"까지만 대신 해주고, "파일을 줄여 OS에 돌려주는 일"은 사람이 시점을 잡아 직접 해야 합니다.

:::tip

**실무 순서**

`airflow db clean` → `airflow db drop-archived` → `VACUUM ANALYZE` (바로) → 디스크 회수가 필요하면 `VACUUM FULL` (점검 시간).

`VACUUM ANALYZE`를 명령 직후에 한 번 돌리는 이유는 공간 때문만이 아닙니다. `ANALYZE`가 통계를 다시 잡아줘야 24만 건이 사라진 `xcom`에 대해 플래너가 엉뚱한 실행 계획을 세우지 않습니다.

:::

## 운영 자동화

DB 정리는 한 번 하고 끝나는 게 아닙니다. 다시 쌓이기 전에 주기적으로 덜어내야 합니다.

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

:::warning

**Airflow 3에서는 DAG 안에서 db clean을 돌릴 수 없습니다**

Airflow 2에서는 `BashOperator`로 `airflow db clean`을 실행하는 관리 DAG을 만드는 패턴이 널리 쓰였습니다. Airflow 3에서는 이게 동작하지 않습니다. Task 코드의 메타데이터 DB 직접 접근이 차단되면서 워커 프로세스에는 진짜 접속 문자열 대신 `airflow-db-not-allowed:///` 자리표시자가 들어오고, `airflow db clean`은 SQLAlchemy URL을 파싱하는 단계에서 바로 실패합니다.

```
Could not parse SQLAlchemy URL from string 'airflow-db-not-allowed:///'
```

환경 변수로 실제 접속 정보를 주입하면 우회는 되지만, Airflow 3이 일부러 막아놓은 격리를 되돌리는 셈입니다. 호스트 cron이나 Kubernetes CronJob처럼 Airflow 바깥에서 돌리는 편이 맞습니다.

:::

## 한눈에 보는 체크리스트

운영 중인 Airflow가 있다면 이 항목들을 정기적으로 점검하세요.

:::summary

**Airflow DB 관리 체크리스트**

- `airflow db clean`을 주기적으로 실행하고 있는가?
- `_airflow_deleted__` 아카이브 테이블이 방치되어 있지 않은가?
- 대량 삭제 후 `VACUUM ANALYZE`를 돌렸는가?
- 부풀어버린 파일을 되돌릴 `VACUUM FULL` 시점을 잡아뒀는가?
- XCom에 불필요하게 큰 데이터를 저장하고 있지 않은가?
- 테이블별 사이즈를 주기적으로 모니터링하고 있는가?

:::

## 마치며

DB 정리는 화려한 작업은 아니지만, 안 하면 확실히 느려집니다. XCom을 많이 쓰는 환경에서는 수십만 건이 순식간에 쌓입니다.

기억할 건 정리가 두 단계로 나뉘어 있다는 사실입니다. `airflow db clean`은 행을 아카이브 테이블로 옮기는 데까지가 일이고, 디스크는 `db drop-archived`(또는 `--skip-archive`)와 PostgreSQL `VACUUM FULL`까지 가야 비로소 줄어듭니다. 명령 한 줄로 끝났다고 생각하고 용량 그래프를 보면 아무것도 안 변해 있습니다.

## 참고자료

- [Airflow 공식 문서: CLI Reference의 db clean](https://airflow.apache.org/docs/apache-airflow/stable/cli-and-env-variables-ref.html#clean)
- [Airflow 공식 문서: Purge history from metadata database](https://airflow.apache.org/docs/apache-airflow/stable/howto/usage-cli.html)
- [Airflow 공식 문서: Upgrading to Airflow 3의 Direct Database Access](https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html)
- [Airflow 2.3.0 릴리스 노트: db clean 도입](https://airflow.apache.org/blog/airflow-2.3.0/)
- [PostgreSQL 공식 문서: Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- [PostgreSQL 공식 문서: VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html)
- [GitHub Issue #42003: skip_archive should actually skip archive in db clean command](https://github.com/apache/airflow/issues/42003)
- [GitHub Discussion #52889: Massive metadata table even after clean with CLI](https://github.com/apache/airflow/discussions/52889)
- [GitHub Discussion #56281: Command airflow db clean does not work anymore with BashOperator in Airflow 3+](https://github.com/apache/airflow/discussions/56281)
