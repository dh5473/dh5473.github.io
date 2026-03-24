---
date: '2026-03-24'
title: 'Airflow DAG Hash가 계속 바뀌는 문제: Variable.get()의 함정'
category: 'DevOps'
series: 'airflow'
seriesOrder: 1
tags: ['Airflow', 'DAG Hash', 'Variable', 'DAG Serialization', 'dag-processor']
summary: 'Airflow DAG Hash가 30초마다 바뀌면서 Task가 실패하는 원인과, Variable.get()을 Task 실행 시점으로 옮겨 해결하는 방법을 정리합니다.'
thumbnail: './thumbnail.png'
---

TTS 배치 DAG의 Task들이 간헐적으로 실패하기 시작했습니다. 30개짜리 [Dynamic Task Mapping](/airflow/airflow-dynamic-task-mapping/) 중 앞쪽 13개는 성공하고, 뒤쪽 17개가 한꺼번에 실패하는 패턴이었습니다.

```
DAG 'tts_batch_dag' not found in serialized_dag table
```

이상한 건 빠르게 끝나는 DAG에서는 재현이 안 되고, 처리량이 많아서 시간이 좀 걸리는 DAG에서만 터진다는 점이었습니다. 처음엔 Worker 리소스 문제인 줄 알았는데, 원인은 전혀 다른 곳에 있었습니다.

<br>

## 에러 상황: Task 실행 중 "DAG not found"

에러 로그를 좀 더 자세히 뜯어보면, Scheduler가 Task를 Worker에 넘기려는 순간 DAG를 찾지 못하고 있었습니다.

```
scheduler  | ERROR - DAG 'tts_batch_dag' for task instance
  <TaskInstance: ...generate_tts map_index=14 [failed]>
  not found in serialized_dag table
```

이상한 건 실패한 Task들의 상태였습니다. 성공한 Task에는 `hostname=elastic`이 찍혀 있는데, 실패한 Task는 전부 `hostname=NULL`, `pid=NULL`이었습니다. Worker에 도달조차 못 한 겁니다.

```
map_index 0-13:  success ✓  (hostname=elastic)
map_index 14+:   failed  ✗  (hostname=NULL, pid=NULL)
```

DAG 코드에 문법 에러가 있는 것도 아니고, Worker 리소스가 부족한 것도 아니었습니다. 혹시 DAG 자체에 뭔가 이상이 있나 싶어 `serialized_dag` 테이블을 직접 조회해봤습니다.

```sql
SELECT last_updated, dag_hash
FROM serialized_dag
WHERE dag_id = 'tts_batch_dag'
ORDER BY last_updated DESC LIMIT 10;
```

```
      last_updated          |             dag_hash
-------------------------------+----------------------------------
 2025-12-09 00:48:24.773546+00 | 5005eb097fc4a58972cf320eac3dc6b7
 2025-12-08 10:27:17.520069+00 | e5db60def7aaa5b89307378afb4ff06c
 2025-12-08 10:14:12.194379+00 | fa0527965698f73c494e901d02ef2ecd
 2025-12-08 10:13:40.324092+00 | b7b40eb57a6e41a0f1160a63551d337a
 2025-12-08 10:13:08.285033+00 | 275b8935d0cb02eebbdbbe8c06bc2903
 2025-12-08 10:12:29.201299+00 | 2718a0e66f733bc924c70a2ea4b95cfa
 2025-12-08 10:11:57.912539+00 | 513c52b38417299fb49a3f48a5c4353e
 2025-12-08 10:11:26.426727+00 | 176e3e5dafbbbbe537340a43f037f416
 2025-12-08 10:10:54.996065+00 | 4f931b60bd4464284471031366dd84d6
 2025-12-08 10:10:22.857835+00 | 0c2ede2f5b25e5a1d974fb7d7fe204e6
```

DAG 파일을 전혀 수정하지 않았는데, `dag_hash`가 **30초 간격으로 계속 바뀌고** 있었습니다. 10개 행이 전부 다른 해시값입니다. 여기서 감이 왔습니다 — 이건 DAG 파싱 자체에 문제가 있는 겁니다.

<br>

## 원인 분석: DAG Serialization과 dag_hash의 역할

### Airflow의 DAG 처리 흐름

왜 `dag_hash`가 바뀌면 Task가 실패하는 걸까요? 먼저 Airflow 3.x의 DAG 처리 구조를 짚고 넘어가겠습니다.

<div style="text-align: center; margin: 24px 0;">
<svg width="520" height="420" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif">
  <rect width="520" height="420" fill="#fafbfc" rx="12"/>
  <text x="260" y="32" text-anchor="middle" font-size="15" font-weight="700" fill="#1f2937">Airflow 3.x DAG 처리 흐름</text>

  <!-- DAG File -->
  <rect x="30" y="60" width="120" height="50" rx="8" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/>
  <text x="90" y="82" text-anchor="middle" font-size="12" font-weight="600" fill="#065f46">DAG 파일</text>
  <text x="90" y="98" text-anchor="middle" font-size="10" fill="#6b7280">.py</text>

  <!-- Arrow 1 -->
  <line x1="150" y1="85" x2="190" y2="85" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#ah)"/>
  <text x="170" y="75" text-anchor="middle" font-size="9" fill="#9ca3af">30초마다</text>

  <!-- dag-processor -->
  <rect x="190" y="60" width="140" height="50" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="260" y="82" text-anchor="middle" font-size="12" font-weight="600" fill="#1e40af">dag-processor</text>
  <text x="260" y="98" text-anchor="middle" font-size="10" fill="#6b7280">파싱 + serialize</text>

  <!-- Arrow 2 -->
  <line x1="330" y1="85" x2="370" y2="85" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#ah)"/>
  <text x="350" y="75" text-anchor="middle" font-size="9" fill="#9ca3af">저장</text>

  <!-- DB -->
  <rect x="370" y="60" width="120" height="50" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"/>
  <text x="430" y="82" text-anchor="middle" font-size="12" font-weight="600" fill="#92400e">serialized_dag</text>
  <text x="430" y="98" text-anchor="middle" font-size="10" fill="#6b7280">DB 테이블</text>

  <!-- Arrow 3 (DB → scheduler) -->
  <line x1="430" y1="110" x2="430" y2="155" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#ah)"/>
  <text x="455" y="138" font-size="9" fill="#9ca3af">읽기</text>

  <!-- Scheduler -->
  <rect x="370" y="155" width="120" height="50" rx="8" fill="#faf5ff" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="430" y="177" text-anchor="middle" font-size="12" font-weight="600" fill="#6d28d9">scheduler</text>
  <text x="430" y="193" text-anchor="middle" font-size="10" fill="#6b7280">Task 스케줄링</text>

  <!-- Arrow 4 (scheduler → worker) -->
  <line x1="430" y1="205" x2="430" y2="250" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#ah)"/>

  <!-- Worker -->
  <rect x="370" y="250" width="120" height="50" rx="8" fill="#fff1f2" stroke="#f43f5e" stroke-width="1.5"/>
  <text x="430" y="272" text-anchor="middle" font-size="12" font-weight="600" fill="#be123c">worker</text>
  <text x="430" y="288" text-anchor="middle" font-size="10" fill="#6b7280">Task 실행</text>

  <!-- Key point box -->
  <rect x="30" y="330" width="460" height="70" rx="8" fill="#fef2f2" stroke="#ef4444" stroke-width="1.5"/>
  <text x="50" y="355" font-size="12" font-weight="600" fill="#991b1b">핵심: dag-processor가 30초마다 DAG를 재파싱하면서</text>
  <text x="50" y="375" font-size="12" font-weight="600" fill="#991b1b">dag_hash를 새로 계산 → DB에 덮어씀</text>
  <text x="50" y="392" font-size="11" fill="#991b1b">DAG 파일이 변하지 않았더라도 hash가 바뀔 수 있다!</text>

  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af"/>
    </marker>
  </defs>
</svg>
</div>

<p align="center" style="color: #888; font-size: 14px;">
  <em>Airflow 3.x의 DAG 처리 파이프라인 — dag-processor가 30초마다 재파싱하며 dag_hash를 갱신한다</em>
</p>

Airflow 3.x에서는 DAG 파일을 직접 읽는 게 아닙니다. `dag-processor`가 DAG 파일을 파싱하고 직렬화(serialize)해서 DB의 `serialized_dag` 테이블에 저장하면, `scheduler`가 이 DB에서 직렬화된 DAG를 읽어 Task를 스케줄링하고 `worker`가 실행하는 구조입니다.

여기서 핵심은 `dag-processor`가 **기본 30초 간격으로** DAG 파일을 반복 파싱한다는 점입니다. 파싱할 때마다 DAG의 구조를 해시로 만들어 `dag_hash`에 저장하는데, DAG 파일이 변하지 않았다면 이 해시값은 항상 같아야 합니다.

### dag_hash가 바뀌면 왜 Task가 실패할까?

문제는 DAG Run이 실행되는 **도중에** `dag_hash`가 바뀔 때 발생합니다. 실제로 겪었던 시나리오를 시간순으로 재구성하면 이렇습니다.

```
09:45:24  DAG Run 시작 (dag_hash: c60abd28)
          ├── Task 0~13 실행 시작 → 정상 완료 ✓

09:45:55  dag-processor가 DAG 재파싱
          └── 새로운 dag_hash 생성 (00f68c14) → DB 덮어쓰기

09:46:28  scheduler가 Task 14~29 실행 시도
          ├── Task들은 이전 dag_hash (c60abd28)를 참조
          ├── DB에는 새 dag_hash (00f68c14)만 존재
          └── ❌ "DAG not found" → Task 전부 실패!
```

DAG Run이 시작될 때의 `dag_hash`와, Task가 실행되려는 시점의 `dag_hash`가 달라져버린 겁니다. Scheduler 입장에서는 해당 DAG를 찾을 수 없으니 Task 실행을 포기하게 됩니다. 실행 시간이 짧은 DAG에서는 hash가 바뀌기 전에 모든 Task가 끝나버리니 문제가 안 되고, 오래 걸리는 DAG에서만 터졌던 이유가 바로 이겁니다.

### 근본 원인: DAG 파일 최상위의 Variable.get()

그러면 DAG 파일을 수정하지 않았는데 왜 `dag_hash`가 매번 달라졌을까요? 문제는 DAG 파일의 **최상위 스코프**에서 `Variable.get()`을 호출하는 코드에 있었습니다.

```python
# ❌ DAG 파일의 최상위 스코프 — DAG parsing 시 매번 실행됨

from airflow.sdk import Variable

# DAG 함수 바깥에서 Variable.get() 호출!
gemini_manager = GeminiManager(
    api_key=Variable.get("GOOGLE_API_KEY"),  # ← 이게 문제
    ftp_manager=ftp_manager,
)

@dag(...)
def tts_batch_pipeline():
    result_batches = generate_tts.partial(
        tts_manager=tts_manager,  # 위에서 생성한 Manager 전달
    ).expand(...)
```

Airflow의 `dag-processor`는 DAG 파일을 파싱할 때 **파일의 모든 최상위 코드를 실행**합니다. 즉, `Variable.get("GOOGLE_API_KEY")` 호출이 30초마다 반복되는 셈입니다.

3.x에서는 DAG를 직렬화할 때 Variable 접근 정보도 함께 포함시킵니다. 매번 `Variable.get()`이 호출되면서 직렬화 결과에 미세한 차이가 생기고, 결국 `dag_hash`가 매번 달라지는 것이었습니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ Airflow 3.x의 새로운 규칙</strong><br>
  Airflow 2.x에서는 DAG parsing 시 Variable/Connection 접근이 "권장하지 않음" 수준이었습니다. 하지만 <strong>Airflow 3.x에서는 사실상 금지</strong>입니다. Execution API 도입으로 DAG parsing과 Task execution의 분리가 더 엄격해졌고, parsing 시점에 외부 상태에 접근하면 dag_hash가 불안정해져 Task 실패로 이어집니다.
</div>

<br>

## 해결: Variable.get()을 Task 실행 시점으로 이동

해결 방법은 명확합니다. DAG 파일 최상위에서 `Variable.get()`을 호출하는 코드를 **Task 함수 내부**로 옮기면 됩니다.

```python
# ✅ After: DAG 파일에서는 Manager를 생성하지 않음

@dag(...)
def tts_batch_pipeline():
    result_batches = generate_tts.partial(
        requests_url=...,   # 정적 데이터만 전달
    ).expand(...)
```

```python
# ✅ Task 파일: 실행 시점에만 Variable 접근

@task
def generate_tts(requests_url, batch_idx, batch_size):
    # Task 실행 시에만 Variable 접근!
    from airflow.sdk import Variable

    api_key = Variable.get("GOOGLE_API_KEY")
    gemini_manager = GeminiManager(api_key=api_key, ...)

    # 작업 수행
    return run_generate_tts(...)
```

핵심은 `Variable.get()`을 `@task` 데코레이터가 붙은 함수 안으로 옮긴 것입니다. 이렇게 하면 `dag-processor`가 DAG를 파싱할 때는 Variable에 접근하지 않으므로, 직렬화 결과가 항상 동일해집니다.

수정 배포 후 DB를 다시 열어보는 순간 속이 시원했습니다. 차이가 확연합니다.

```
-- Before: dag_hash가 매번 다름
10:10:22 - 0c2ede2f5b25e5a1d974fb7d7fe204e6
10:10:54 - 4f931b60bd4464284471031366dd84d6
10:11:26 - 176e3e5dafbbbbe537340a43f037f416

-- After: dag_hash가 고정!
10:27:17 - e5db60def7aaa5b89307378afb4ff06c
10:28:00 - e5db60def7aaa5b89307378afb4ff06c ✓
10:29:00 - e5db60def7aaa5b89307378afb4ff06c ✓
```

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 Before / After 실행 타이밍 비교</strong><br><br>
  <strong>Before (❌)</strong><br>
  DAG Parsing (30초마다) → Variable.get() 호출 → dag_hash 매번 변경 → DB 저장 → Task 실패<br><br>
  <strong>After (✅)</strong><br>
  DAG Parsing (30초마다) → Variable 접근 없음 → dag_hash 항상 동일 → DB 저장<br>
  Task 실행 (필요할 때만) → Variable.get() 호출 → Manager 생성 → 작업 수행
</div>

<br>

## DAG Parsing vs Task Execution: 반드시 알아야 할 규칙

이 문제의 본질은 **"DAG 파싱 시점에 실행되는 코드"와 "Task 실행 시점에 실행되는 코드"의 구분**입니다. Airflow를 처음 쓸 때 가장 헷갈리는 부분이기도 합니다.

| 구분 | DAG Parsing | Task Execution |
|------|-------------|----------------|
| **발생 시점** | 30초마다 (계속) | Task 실행 시 (1회) |
| **실행 위치** | dag-processor | Worker |
| **목적** | DAG 구조 파악 | 실제 작업 수행 |
| **Variable 접근** | ❌ 금지 | ✅ 허용 |
| **Connection 접근** | ❌ 금지 | ✅ 허용 |
| **외부 API 호출** | ❌ 금지 | ✅ 허용 |

2.x에서는 DAG parsing 시 Variable 접근이 가능했습니다. 권장하지는 않았지만 동작은 했고, `dag_hash`도 비교적 안정적이었습니다. 하지만 3.x의 Execution API 도입 이후 DAG parsing과 Task execution이 완전히 분리되면서, parsing 시점의 외부 상태 접근이 곧바로 `dag_hash` 불안정으로 이어지게 됐습니다.

### 피해야 할 패턴

DAG 파일의 최상위 스코프(즉 `@task` 바깥)에서 절대 하면 안 되는 것들을 정리하면 이렇습니다.

```python
# ❌ DAG parsing 시 실행되는 최상위 코드들 — 전부 문제!

api_key = Variable.get("API_KEY")           # DB 조회 → 직렬화에 포함
conn = Connection.get("my_conn")            # DB 조회 → 직렬화에 포함
start_date = datetime.now()                 # 매번 다른 값 → 직렬화 결과 변경
data = requests.get("https://api.com/...")  # 외부 API → 응답이 직렬화에 포함될 수 있음
config = json.load(open("/tmp/config.json"))  # 파일 내용 변경 시 hash 변경
```

이 코드들은 전부 `@task` 함수 안으로 옮겨야 합니다. DAG 파일의 최상위에는 **정적 정의만** 있어야 합니다.

```python
# ✅ DAG 파일: 정적 정의만

@dag(
    schedule="@daily",
    start_date=datetime(2025, 1, 1),  # 고정값은 OK
    catchup=False,
)
def my_pipeline():
    result = my_task.partial(
        static_param="value",  # 정적 값만 전달
    ).expand(...)

# ✅ Task 파일: 동적 리소스는 여기서

@task
def my_task(static_param):
    from airflow.sdk import Variable

    api_key = Variable.get("API_KEY")
    conn = Connection.get("my_conn")
    manager = MyManager(api_key, conn)

    return manager.process(static_param)
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 import 위치도 신경 써야 합니다</strong><br>
  <code>from airflow.sdk import Variable</code> 같은 가벼운 import는 파일 최상단에 둬도 괜찮습니다. 하지만 <code>pandas</code>, <code>numpy</code>, <code>tensorflow</code> 같은 무거운 라이브러리는 top-level에서 import하면 30초마다 파싱할 때마다 로딩 비용이 발생합니다. <a href="https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html">공식 문서</a>에서도 무거운 import는 Task 함수 내부로 옮기는 것을 권장하고 있습니다.
</div>

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>DAG 파일의 최상위 스코프에서 <code>Variable.get()</code>, <code>Connection.get()</code>, <code>datetime.now()</code> 등을 호출하면 <code>dag_hash</code>가 매번 달라진다</li>
    <li><code>dag_hash</code>가 DAG Run 도중에 바뀌면 scheduler가 나머지 Task를 찾지 못해 "DAG not found"로 실패한다</li>
    <li>해결: 동적 리소스 접근을 <code>@task</code> 함수 내부로 이동. DAG 파일에는 정적 정의만 둔다</li>
    <li>진단: <code>SELECT dag_hash FROM serialized_dag</code>로 hash가 고정되어 있는지 확인</li>
  </ul>
</div>

<br>

## 마치며

디버깅 과정에서 가장 도움이 됐던 건 `serialized_dag` 테이블을 직접 조회해본 것이었습니다. `dag_hash`가 고정되어 있는지 확인하는 것만으로도 이 유형의 문제를 빠르게 진단할 수 있으니, Airflow에서 원인 모를 Task 실패가 발생하면 가장 먼저 확인해볼 만한 포인트입니다.

다음 글에서는 이번에 언급한 [Dynamic Task Mapping의 병렬 처리 제한 전략](/airflow/airflow-dynamic-task-mapping/)을 다뤄보겠습니다.

<br>

## 참고자료

- [Airflow 공식 문서 — DAG Serialization](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-serialization.html)
- [Airflow 공식 문서 — Best Practices](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html#top-level-python-code)
- [Airflow 3.0 Migration Guide](https://airflow.apache.org/docs/apache-airflow/stable/migrations-ref.html)
- [Airflow GitHub — DAG Processor Architecture](https://github.com/apache/airflow/blob/main/docs/apache-airflow/core-concepts/dag-run.rst)
