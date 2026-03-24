---
date: '2026-03-24'
title: 'Airflow Dynamic Task Mapping: 병렬 처리와 동시 실행 제한 전략'
category: 'DevOps'
series: 'airflow'
seriesOrder: 2
tags: ['Airflow', 'Dynamic Task Mapping', 'Pool', 'max_active_tis_per_dag', 'parallelism']
summary: 'Airflow Dynamic Task Mapping으로 대량 Task를 병렬 처리할 때, 동시 실행을 제한하는 세 가지 전략과 실전 패턴을 비교합니다.'
thumbnail: './thumbnail.png'
---

Airflow에서 배치 처리를 하다 보면, 런타임에 Task 수가 결정되는 상황을 자주 만납니다. 책 한 권의 페이지별 OCR 처리, 수백 개 파일의 TTS 변환, 데이터 파티션별 ETL — 실행 전까지 몇 개의 Task가 필요한지 알 수 없는 경우입니다.

Dynamic Task Mapping은 이런 상황에서 `expand()`로 런타임에 Task를 동적으로 생성하는 기능입니다. 편리하지만, 아무 제한 없이 쓰면 Worker가 한꺼번에 수백 개의 Task를 처리하려다 외부 API rate limit에 걸리거나, 메모리가 터지는 일이 생깁니다.

이 글에서는 Dynamic Task Mapping의 동시 실행을 제한하는 세 가지 전략을 비교하고, 실제로 어떤 상황에서 어떤 방식을 쓰는 게 좋은지 정리합니다.

<br>

## Dynamic Task Mapping이란?

기존 방식에서는 Task 수를 코드에 하드코딩해야 했습니다.

```python
# ❌ 정적 Task 생성 — 페이지 수를 미리 알아야 함
for i in range(20):
    extract_page_task = extract_kc_task.override(task_id=f"extract_page_{i}")
```

Dynamic Task Mapping은 `expand()`를 사용해 **런타임에 입력 데이터의 크기만큼** Task를 자동 생성합니다.

```python
# ✅ Dynamic Task Mapping — 런타임에 페이지 수만큼 Task 생성
pages = get_pages_dynamically()
extract_kc_per_page.expand(page_config=pages["page_configs"])
```

20개 페이지면 20개 Task, 100개 페이지면 100개 Task가 만들어집니다. 편리하지만, 여기서 바로 문제가 시작됩니다 — **동시에 100개 Task가 돌면 어떻게 될까요?**

<br>

## 동시 실행을 제한하는 세 가지 방법

### 1. max_active_tis_per_dag — 가장 간단하고 실용적

`@task` 데코레이터에 파라미터 하나만 추가하면 됩니다.

```python
@task(max_active_tis_per_dag=5)
def extract_kc_per_page(page_config):
    # 이 DAG의 모든 실행에서 합쳐서 최대 5개만 동시 실행
    return process_page(page_config)
```

같은 DAG가 여러 번 트리거되더라도, 해당 Task는 전체를 합쳐서 설정한 수만큼만 동시에 실행됩니다.

```bash
# 같은 DAG 3번 실행
$ airflow dags trigger kc_pipeline --conf '{"book_id": 1}'
$ airflow dags trigger kc_pipeline --conf '{"book_id": 2}'
$ airflow dags trigger kc_pipeline --conf '{"book_id": 3}'

# 결과: 3개 실행을 통틀어서 최대 5개 Task만 동시 실행
```

경험상, 대부분의 경우 이것만으로 충분합니다. 설정이 간단하고, Pool을 별도로 만들 필요도 없습니다.

### 2. Pool — 여러 DAG 간 리소스 공유

`max_active_tis_per_dag`는 DAG 하나 안에서만 동작합니다. 여러 DAG가 같은 리소스(GPU, DB 커넥션, 외부 API 등)를 공유할 때는 **Pool**이 필요합니다.

```bash
# Pool 생성 (CLI 또는 UI에서)
$ airflow pools set kc_extraction_pool 5 "KC 추출 전용 Pool"
```

```python
@task(pool="kc_extraction_pool", pool_slots=1)
def extract_kc_per_page(page_config):
    # 전체 시스템에서 Pool 크기(5)만큼만 동시 실행
    return process_page(page_config)
```

Pool의 장점은 **런타임에 크기를 조정**할 수 있다는 점입니다. Airflow UI에서 Pool 크기를 변경하면 즉시 반영되므로, 리소스 상황에 따라 유연하게 대응할 수 있습니다.

`pool_slots` 파라미터로 Task마다 다른 리소스 비중을 줄 수도 있습니다.

```python
# GPU가 4개인 환경에서 Pool 크기 = 4

@task(pool="gpu_pool", pool_slots=2)  # GPU 2개 사용
def train_model(model_config):
    return train_with_gpu(model_config)

@task(pool="gpu_pool", pool_slots=1)  # GPU 1개 사용
def inference(data_batch):
    return predict(data_batch)
```

### 3. max_map_length — Task 생성 자체를 제한

위 두 방법은 "동시 실행 수"를 제한하는 반면, `max_map_length`는 **생성 가능한 Task 수 자체**를 제한합니다. Scheduler 과부하나 메모리 폭발을 막는 안전장치 역할입니다.

```ini
# airflow.cfg
[core]
max_map_length = 1024  # 기본값
```

```python
# 또는 코드 레벨에서 직접 제한
@task
def get_pages():
    pages = get_all_pages()
    return pages[:50]  # 최대 50개만 반환
```

주의할 점은 `max_map_length`를 초과하면 **Task 생성 자체가 실패**한다는 겁니다. 동시 실행을 "늦추는" 게 아니라 아예 막아버리므로, 데이터 손실이 발생할 수 있습니다. 이 설정은 제한보다는 **보호 장치**로 사용하는 것이 적절합니다.

<br>

## 어떤 방법을 써야 할까?

| 방법 | 제어 대상 | 적용 범위 | 설정 난이도 | 추천 상황 |
|------|-----------|-----------|-------------|-----------|
| `max_active_tis_per_dag` | 동시 실행 수 | DAG 내 | 매우 쉬움 | 대부분의 경우 |
| `Pool` | 동시 실행 수 | 전역 | 보통 | 여러 DAG 간 리소스 공유 |
| `max_map_length` | Task 생성 수 | 전역 | 쉬움 | 시스템 안전장치 |

개인적으로는 **`max_active_tis_per_dag`를 기본으로 쓰고, 필요할 때만 Pool을 추가**하는 조합을 권장합니다. 실제로 저도 대부분의 DAG에서 이 패턴으로 충분했습니다.

```python
@task(
    max_active_tis_per_dag=5,       # 기본: DAG 내 동시 실행 제한
    pool="heavy_compute_pool",      # 추가: 전역 리소스 제한 (필요한 경우만)
    pool_slots=2                    # 리소스 비중
)
def heavy_processing(data):
    return expensive_computation(data)
```

<br>

## 실전 패턴 모음

### Chunk 기반 처리

입력 데이터가 수백~수천 건일 때, 개별 처리 대신 **청크 단위**로 묶으면 Task 수를 줄이면서 처리량을 유지할 수 있습니다.

```python
@task
def create_chunks(items, chunk_size=5):
    return [items[i:i+chunk_size] for i in range(0, len(items), chunk_size)]

@task(max_active_tis_per_dag=3)
def process_chunk(chunk):
    return [process_item(item) for item in chunk]

chunks = create_chunks(large_dataset)
results = process_chunk.expand(chunk=chunks)
```

1,000건을 개별 처리하면 1,000개 Task가 생기지만, 5개씩 청크로 묶으면 200개로 줄어듭니다.

### Map-Reduce 패턴

병렬로 처리한 결과를 하나로 합쳐야 할 때 자주 쓰는 패턴입니다.

```python
@task(max_active_tis_per_dag=8)
def map_process(data_chunk):
    return expensive_transform(data_chunk)

@task
def reduce_results(mapped_results):
    return combine_all_results(mapped_results)

# 워크플로우
chunks = create_data_chunks()
mapped = map_process.expand(data_chunk=chunks)
final_result = reduce_results(mapped)
```

`reduce_results`는 모든 `map_process` Task가 완료된 후에 자동으로 실행됩니다. Airflow가 의존성을 알아서 관리해주기 때문에 별도의 동기화 로직이 필요 없습니다.

### 외부 API 호출 시 백프레셔 제어

외부 API를 호출하는 Task에서는 동시 실행 제한과 함께 **재시도 전략**도 같이 설정하는 것이 중요합니다.

```python
@task(
    max_active_tis_per_dag=3,              # 동시 3개로 제한
    retries=3,                             # 실패 시 3번 재시도
    retry_delay=timedelta(minutes=2),      # 재시도 간격
    execution_timeout=timedelta(minutes=10) # 타임아웃
)
def api_heavy_task(data):
    return call_external_api(data)
```

[이전 글](/airflow/airflow-dag-hash/)에서 다룬 것처럼, 이런 설정들은 반드시 `@task` 데코레이터 안에서 정의해야 합니다. DAG 최상위에서 외부 리소스에 접근하면 `dag_hash` 불안정 문제가 발생할 수 있습니다.

<br>

## 문제가 생겼을 때 확인할 것들

Dynamic Task Mapping 관련 문제가 생겼을 때 확인해볼 포인트를 정리합니다.

**Task가 scheduled 상태에서 안 넘어간다면:**

```bash
# Pool 크기와 사용량 확인
$ airflow pools list

# DAG의 max_active_runs 확인
$ airflow dags details <dag_id> | grep max_active_runs
```

**메모리 부족이 발생한다면:**
- `max_map_length`를 줄이거나
- 청크 기반 처리로 전환하여 Task 수 자체를 줄이는 것을 고려해야 합니다

**API Rate Limit에 걸린다면:**
- `max_active_tis_per_dag`를 줄이고
- `retry_delay`를 늘려서 재시도 간격을 확보합니다

<br>

## 마치며

Dynamic Task Mapping은 Airflow에서 가장 유용한 기능 중 하나이지만, 동시 실행 제한 없이 쓰면 오히려 시스템을 불안정하게 만들 수 있습니다. `max_active_tis_per_dag` 하나만 잘 설정해도 대부분의 상황을 커버할 수 있으니, 새로운 DAG를 만들 때 습관적으로 넣어두는 것을 추천합니다.

다음 글에서는 Docker 환경에서 Airflow Worker 로그에 hostname이 비어 있는 문제를 다뤄보겠습니다.

<br>

## 참고자료

- [Airflow 공식 문서 — Dynamic Task Mapping](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html)
- [Airflow 공식 문서 — Placing Limits on Mapped Tasks](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html#placing-limits-on-mapped-tasks)
- [Airflow 공식 문서 — Pools](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/pools.html)
- [Astronomer — DAG Writing Best Practices](https://www.astronomer.io/docs/learn/dag-best-practices)
