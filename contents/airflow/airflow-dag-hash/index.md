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

특이한 건 빠르게 끝나는 DAG에서는 재현이 안 되고, 처리량이 많아서 시간이 좀 걸리는 DAG에서만 터진다는 점이었습니다. 처음엔 Worker 리소스 문제인 줄 알았는데, 원인은 전혀 다른 곳에 있었습니다.

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

DAG 파일을 전혀 수정하지 않았는데, `dag_hash`가 **30초 간격으로 계속 바뀌고** 있었습니다. 10개 행이 전부 다른 해시값입니다. Worker가 아니라 DAG 파싱 쪽을 의심할 차례였습니다.

## 원인 분석: DAG Serialization과 dag_hash의 역할

### Airflow의 DAG 처리 흐름

왜 `dag_hash`가 바뀌면 Task가 실패하는 걸까요? 먼저 Airflow 3.x의 DAG 처리 구조를 짚고 넘어가겠습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 560" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Airflow 3.x의 DAG 처리 흐름. DAG 파일을 dag-processor가 기본 30초마다 파싱해 직렬화하고 dag_hash를 다시 계산한 뒤 메타데이터 DB의 serialized_dag와 dag_version 테이블에 저장하면, scheduler가 그 버전을 조회해 Task를 큐에 넣고 worker가 실행합니다.">
<style>.dh1-h{font-size:18px;font-weight:700;fill:var(--text, #1c1917)}.dh1-t{font-size:17px;fill:var(--text, #1c1917)}.dh1-s{font-size:14px;fill:var(--text-muted, #6d6762)}.dh1-m{font-size:14px;fill:var(--text-muted, #6d6762);font-family:"JetBrains Mono",monospace}.dh1-w{font-size:15px;fill:var(--text-warn, #9d5604)}.dh1-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.dh1-hi{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0a756c);stroke-width:2}.dh1-warn{fill:var(--bg-warn, #fffbeb);stroke:var(--text-warn, #9d5604);stroke-width:1.5}.dh1-line{stroke:var(--text-muted, #6d6762);stroke-width:2;fill:none}</style>
<defs>
<marker id="dh1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text x="200" y="26" text-anchor="middle" class="dh1-h">Airflow 3.x DAG 처리 흐름</text>
<!-- DAG 파일 -->
<rect x="50" y="44" width="300" height="64" rx="8" class="dh1-box"/>
<text x="200" y="72" text-anchor="middle" class="dh1-t">DAG 파일 (.py)</text>
<text x="200" y="94" text-anchor="middle" class="dh1-s">파싱마다 최상위 코드 실행</text>
<line x1="200" y1="108" x2="200" y2="140" class="dh1-line" marker-end="url(#dh1Arrow)"/>
<text x="212" y="129" class="dh1-s">30초마다</text>
<!-- dag-processor -->
<rect x="50" y="140" width="300" height="90" rx="8" class="dh1-hi"/>
<text x="200" y="168" text-anchor="middle" class="dh1-t">dag-processor</text>
<text x="200" y="191" text-anchor="middle" class="dh1-s">파싱 후 직렬화, dag_hash 재계산</text>
<text x="200" y="215" text-anchor="middle" class="dh1-m">min_file_process_interval = 30</text>
<line x1="200" y1="230" x2="200" y2="262" class="dh1-line" marker-end="url(#dh1Arrow)"/>
<text x="212" y="251" class="dh1-s">직렬화 결과 저장</text>
<!-- 메타데이터 DB -->
<rect x="50" y="262" width="300" height="90" rx="8" class="dh1-hi"/>
<text x="200" y="290" text-anchor="middle" class="dh1-t">메타데이터 DB</text>
<text x="200" y="315" text-anchor="middle" class="dh1-m">serialized_dag</text>
<text x="200" y="339" text-anchor="middle" class="dh1-m">dag_version</text>
<line x1="200" y1="352" x2="200" y2="384" class="dh1-line" marker-end="url(#dh1Arrow)"/>
<text x="212" y="373" class="dh1-s">버전 단위로 조회</text>
<!-- scheduler -->
<rect x="50" y="384" width="300" height="64" rx="8" class="dh1-box"/>
<text x="200" y="412" text-anchor="middle" class="dh1-t">scheduler</text>
<text x="200" y="434" text-anchor="middle" class="dh1-s">Task를 큐에 등록</text>
<line x1="200" y1="448" x2="200" y2="480" class="dh1-line" marker-end="url(#dh1Arrow)"/>
<!-- worker -->
<rect x="50" y="480" width="300" height="64" rx="8" class="dh1-box"/>
<text x="200" y="508" text-anchor="middle" class="dh1-t">worker</text>
<text x="200" y="530" text-anchor="middle" class="dh1-s">Task 실행</text>
</svg>
</div>

Airflow 3.x에서는 `scheduler`가 DAG 파일을 직접 읽지 않습니다. `dag-processor`가 DAG 파일을 파싱하고 직렬화(serialize)해서 DB에 저장하면, `scheduler`가 DB에서 직렬화된 DAG를 읽어 Task를 스케줄링하고 `worker`가 실행합니다. 3.x부터는 이 `dag-processor`가 별도 프로세스로 반드시 떠 있어야 합니다. 공식 업그레이드 가이드도 "로컬이나 개발 환경에서도 dag-processor를 따로 띄워야 한다"고 안내합니다.

여기서 핵심은 `dag-processor`가 DAG 파일을 반복 파싱한다는 점입니다. 주기를 정하는 값은 `[dag_processor] min_file_process_interval`이고 기본값이 30초입니다(2.x에서는 같은 이름의 옵션이 `[scheduler]` 섹션에 있었습니다). 파싱할 때마다 직렬화 결과를 해시로 만들어 `dag_hash`에 저장하는데, DAG 파일이 변하지 않았다면 이 해시값은 항상 같아야 합니다.

### dag_hash가 바뀌면 왜 Task가 실패할까?

Airflow 3.0의 DAG 버저닝(AIP-66)에서는 직렬화 결과가 달라질 때마다 새로운 DAG 버전이 만들어지고, DAG Run은 시작 시점의 버전에 묶여 끝까지 실행됩니다. 문제는 DAG Run이 실행되는 **도중에** 직렬화 결과가 계속 바뀔 때 생깁니다. 실제로 겪었던 시나리오를 시간순으로 재구성하면 이렇습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 434" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="실행 중 dag_hash가 바뀐 순간의 타임라인. 09시 45분 24초에 dag_hash c60abd28로 DAG Run이 시작되어 Task 0번부터 13번까지는 정상 완료됩니다. 09시 45분 55초에 dag-processor가 재파싱하면서 dag_hash가 00f68c14로 바뀌고 DB의 직렬화 DAG가 교체됩니다. 09시 46분 28초에 Task 14번부터 29번까지를 스케줄링하려 할 때 전부 FAILED가 되고 hostname은 NULL로 남습니다.">
<style>.dh2-h{font-size:18px;font-weight:700;fill:var(--text, #1c1917)}.dh2-t{font-size:17px;fill:var(--text, #1c1917)}.dh2-s{font-size:14px;fill:var(--text-muted, #6d6762)}.dh2-m{font-size:14px;fill:var(--text-muted, #6d6762);font-family:"JetBrains Mono",monospace}.dh2-time{font-size:15px;fill:var(--text-muted, #6d6762);font-family:"JetBrains Mono",monospace}.dh2-okt{font-size:15px;fill:var(--text-success, #107836)}.dh2-wt{font-size:15px;fill:var(--text-warn, #9d5604)}.dh2-bt{font-size:15px;fill:var(--text-danger, #cb2121)}.dh2-n{font-size:15px;fill:var(--text, #1c1917)}.dh2-ok{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.5}.dh2-warn{fill:var(--bg-warn, #fffbeb);stroke:var(--text-warn, #9d5604);stroke-width:1.5}.dh2-bad{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #cb2121);stroke-width:1.5}.dh2-note{fill:var(--bg-muted, #eeecea);stroke:var(--border, #e7e5e4);stroke-width:1.5}.dh2-line{stroke:var(--text-muted, #6d6762);stroke-width:2;fill:none}.dh2-okmark{stroke:var(--text-success, #107836);stroke-width:2.5;fill:none;stroke-linecap:round}.dh2-badmark{stroke:var(--text-danger, #cb2121);stroke-width:2.5;fill:none;stroke-linecap:round}</style>
<defs>
<marker id="dh2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text x="200" y="26" text-anchor="middle" class="dh2-h">실행 도중 dag_hash가 바뀐 순간</text>
<!-- 09:45:24 -->
<rect x="20" y="44" width="360" height="112" rx="8" class="dh2-ok"/>
<text x="40" y="72" class="dh2-time">09:45:24</text>
<text x="40" y="98" class="dh2-t">DAG Run 시작</text>
<text x="40" y="121" class="dh2-m">dag_hash = c60abd28</text>
<path d="M40 140 L46 147 L58 133" class="dh2-okmark"/>
<text x="68" y="146" class="dh2-okt">Task 0~13 정상 완료</text>
<line x1="200" y1="156" x2="200" y2="184" class="dh2-line" marker-end="url(#dh2Arrow)"/>
<!-- 09:45:55 -->
<rect x="20" y="184" width="360" height="112" rx="8" class="dh2-warn"/>
<text x="40" y="212" class="dh2-time">09:45:55</text>
<text x="40" y="238" class="dh2-t">dag-processor 재파싱</text>
<text x="40" y="261" class="dh2-m">dag_hash = 00f68c14</text>
<text x="40" y="285" class="dh2-wt">DB의 직렬화 DAG 교체</text>
<line x1="200" y1="296" x2="200" y2="324" class="dh2-line" marker-end="url(#dh2Arrow)"/>
<!-- 09:46:28 -->
<rect x="20" y="324" width="360" height="94" rx="8" class="dh2-bad"/>
<text x="40" y="352" class="dh2-time">09:46:28</text>
<text x="40" y="378" class="dh2-t">Task 14~29 스케줄링 시도</text>
<path d="M40 398 L53 411 M53 398 L40 411" class="dh2-badmark"/>
<text x="64" y="410" class="dh2-bt">전부 FAILED (hostname=NULL)</text>
</svg>
</div>

Airflow 스케줄러는 큐에 넣을 Task를 고를 때 그 DAG Run에 해당하는 직렬화 DAG를 DB에서 다시 조회합니다. 조회에 실패하면 `DAG '...' for task instance ... not found in serialized_dag table`을 로그에 남기고, 해당 DAG의 `SCHEDULED` 상태 Task를 한꺼번에 `FAILED`로 바꿉니다. Worker에 넘기기 전 단계에서 끝나버리므로 `hostname`과 `pid`가 NULL로 남습니다. 실행 시간이 짧은 DAG에서는 재파싱이 일어나기 전에 모든 Task가 끝나므로 문제가 드러나지 않고, 오래 걸리는 DAG에서만 터졌던 이유가 이겁니다.

### 근본 원인: DAG 파일 최상위의 Variable.get()

그러면 DAG 파일을 수정하지 않았는데 왜 `dag_hash`가 매번 달라졌을까요? 문제는 DAG 파일의 **최상위 스코프**에서 `Variable.get()`을 호출하는 코드에 있었습니다.

```python
# ❌ DAG 파일의 최상위 스코프: DAG parsing 시 매번 실행됨

from airflow.sdk import Variable

# DAG 함수 바깥에서 Variable.get() 호출!
gemini_manager = GeminiManager(
    api_key=Variable.get("GOOGLE_API_KEY"),  # ← 이게 문제
    ftp_manager=ftp_manager,
)

@dag(...)
def tts_batch_pipeline():
    result_batches = generate_tts.partial(
        gemini_manager=gemini_manager,  # 위에서 생성한 Manager를 그대로 전달
    ).expand(...)
```

Airflow의 `dag-processor`는 DAG 파일을 파싱할 때 **파일의 모든 최상위 코드를 실행**합니다. 즉, `Variable.get("GOOGLE_API_KEY")` 호출이 30초마다 반복되는 셈입니다.

여기서 바로 해시가 달라지는 건 아닙니다. `dag_hash`는 직렬화된 DAG를 JSON으로 정렬해 만든 md5 값이라서, 직렬화 결과가 같으면 몇 번을 호출하든 해시도 같습니다. 문제는 그 다음 줄입니다. 최상위에서 만든 `gemini_manager` 객체를 `partial()`로 Task에 넘기고 있었고, 이 객체가 직렬화 대상에 포함됐습니다.

Airflow의 직렬화기는 자기가 아는 타입이 아니면 마지막에 `str()`로 떨어뜨립니다. `__repr__`을 따로 정의하지 않은 객체라면 그 결과는 `<myapp.GeminiManager object at 0x7f3d2c1a4e50>` 같은 문자열이고, 여기에는 파싱마다 달라지는 메모리 주소가 들어 있습니다. 직렬화 JSON이 달라지니 md5도 달라지고, 결국 `dag_hash`가 30초마다 새 값이 됩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 506" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="dag_hash가 만들어지는 경로. 최상위에서 만든 GeminiManager 객체를 partial로 Task에 전달하면, 직렬화 단계에서 아는 타입이 아니므로 str로 변환되어 메모리 주소가 담긴 문자열이 되고, 이 JSON을 정렬해 md5를 구하므로 dag_hash가 파싱마다 달라집니다. 아래 초록 상자는 객체 생성을 Task 안으로 옮기는 해결책을 보여줍니다.">
<style>.dh3-h{font-size:18px;font-weight:700;fill:var(--text, #1c1917)}.dh3-t{font-size:17px;fill:var(--text, #1c1917)}.dh3-mt{font-size:17px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.dh3-s{font-size:14px;fill:var(--text-muted, #6d6762)}.dh3-m{font-size:14px;fill:var(--text-muted, #6d6762);font-family:"JetBrains Mono",monospace}.dh3-bt{font-size:15px;fill:var(--text-danger, #cb2121)}.dh3-ot{font-size:15px;fill:var(--text-success, #107836)}.dh3-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.dh3-hi{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0a756c);stroke-width:2}.dh3-bad{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #cb2121);stroke-width:1.5}.dh3-ok{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.5}.dh3-line{stroke:var(--text-muted, #6d6762);stroke-width:2;fill:none}</style>
<defs>
<marker id="dh3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text x="200" y="26" text-anchor="middle" class="dh3-h">dag_hash가 만들어지는 경로</text>
<!-- 최상위 객체 -->
<rect x="30" y="44" width="340" height="80" rx="8" class="dh3-box"/>
<text x="200" y="74" text-anchor="middle" class="dh3-t">최상위에서 만든 객체</text>
<text x="200" y="102" text-anchor="middle" class="dh3-m">GeminiManager(api_key=...)</text>
<line x1="200" y1="124" x2="200" y2="156" class="dh3-line" marker-end="url(#dh3Arrow)"/>
<text x="212" y="145" class="dh3-s">partial()로 전달</text>
<!-- 직렬화 -->
<rect x="30" y="156" width="340" height="104" rx="8" class="dh3-hi"/>
<text x="200" y="185" text-anchor="middle" class="dh3-t">직렬화(serialize)</text>
<text x="200" y="209" text-anchor="middle" class="dh3-s">아는 타입이 아니면 str()로 변환</text>
<text x="200" y="237" text-anchor="middle" class="dh3-m">&lt;... object at 0x7f3d2c1a4e50&gt;</text>
<line x1="200" y1="260" x2="200" y2="292" class="dh3-line" marker-end="url(#dh3Arrow)"/>
<text x="212" y="281" class="dh3-s">정렬 후 md5</text>
<!-- dag_hash -->
<rect x="30" y="292" width="340" height="80" rx="8" class="dh3-bad"/>
<text x="200" y="322" text-anchor="middle" class="dh3-mt">dag_hash</text>
<text x="200" y="349" text-anchor="middle" class="dh3-bt">파싱마다 다른 값</text>
<!-- 해결 -->
<rect x="30" y="404" width="340" height="88" rx="8" class="dh3-ok"/>
<text x="200" y="433" text-anchor="middle" class="dh3-t">해결</text>
<text x="200" y="457" text-anchor="middle" class="dh3-ot">객체 생성을 Task 안으로 이동</text>
<text x="200" y="479" text-anchor="middle" class="dh3-ot">직렬화 결과 고정</text>
</svg>
</div>

:::warning

**금지가 아니라 "가급적 피하라"입니다**

공식 Best Practices 문서는 최상위 코드에 대해 "데이터베이스 접근, 무거운 연산, 네트워크 작업을 하지 말 것"이라고 적고, Airflow Variable에 대해서는 "최상위 파이썬 코드에서의 사용을 가능한 한 피해야 한다"고 씁니다. 표현은 강한 권고이고 이 문장은 2.x 문서에도 똑같이 있습니다. 3.x에서 새로 막힌 것도 아닙니다. 업그레이드 가이드는 Task 코드가 메타데이터 DB에 직접 접근하지 못하게 바뀌었다고 하면서도, "DAG 작성자 코드는 DAG File Processor와 Triggerer에서 여전히 DB 접근 권한을 가진 채 실행될 수 있다"고 덧붙입니다.

3.x에서 실제로 달라진 것은 DAG 버저닝입니다. 직렬화 결과가 바뀔 때마다 새 버전이 생기고 DAG Run이 특정 버전에 묶이므로, 예전 같으면 그냥 낭비였을 해시 흔들림이 실행 중인 Run을 깨뜨리는 사고로 번집니다.

:::

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

수정 배포 후 같은 쿼리를 다시 돌려봤습니다. 차이가 분명합니다.

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

`dag_hash`가 고정되면 `dag-processor`는 "직렬화 결과가 그대로다"라고 판단하고 DB 쓰기 자체를 건너뜁니다. 새 DAG 버전이 만들어지지 않으니 실행 중인 DAG Run이 흔들릴 일도 없습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 740" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Before와 After의 실행 타이밍 비교. Before에서는 DAG 파싱이 기본 30초마다 일어나면서 Variable.get을 호출하고 dag_hash가 매번 바뀌어 Task가 실패합니다. After에서는 파싱 시점에 Variable 접근이 없어 dag_hash가 고정되고, Variable.get 호출은 Task 실행 시점으로 옮겨져 필요할 때만 한 번 일어납니다.">
<style>.dh4-h{font-size:18px;font-weight:700;fill:var(--text, #1c1917)}.dh4-ph{font-size:17px;font-weight:700;fill:var(--text, #1c1917)}.dh4-lb{font-size:14px;fill:var(--text-muted, #6d6762)}.dh4-p{font-size:15px;fill:var(--text, #1c1917)}.dh4-bt{font-size:15px;fill:var(--text-danger, #cb2121)}.dh4-ot{font-size:15px;fill:var(--text-success, #107836)}.dh4-badpanel{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #cb2121);stroke-width:1.5}.dh4-okpanel{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.5}.dh4-pill{fill:var(--bg, #fafaf8);stroke:var(--border, #e7e5e4);stroke-width:1.5}.dh4-line{stroke:var(--text-muted, #6d6762);stroke-width:2;fill:none}.dh4-okmark{stroke:var(--text-success, #107836);stroke-width:2.5;fill:none;stroke-linecap:round}.dh4-badmark{stroke:var(--text-danger, #cb2121);stroke-width:2.5;fill:none;stroke-linecap:round}</style>
<defs>
<marker id="dh4Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text x="200" y="26" text-anchor="middle" class="dh4-h">Before / After 실행 타이밍</text>
<!-- Before 패널 -->
<rect x="16" y="42" width="368" height="260" rx="10" class="dh4-badpanel"/>
<text x="36" y="72" class="dh4-ph">Before: 최상위에서 호출</text>
<rect x="40" y="86" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="112" text-anchor="middle" class="dh4-p">DAG 파싱 (기본 30초마다)</text>
<line x1="200" y1="126" x2="200" y2="140" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="140" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="166" text-anchor="middle" class="dh4-p">Variable.get() 호출</text>
<line x1="200" y1="180" x2="200" y2="194" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="194" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="220" text-anchor="middle" class="dh4-p">dag_hash 매번 변경</text>
<line x1="200" y1="234" x2="200" y2="248" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="248" width="320" height="40" rx="6" class="dh4-pill"/>
<path d="M60 262 L73 275 M73 262 L60 275" class="dh4-badmark"/>
<text x="210" y="274" text-anchor="middle" class="dh4-bt">Task 실패</text>
<!-- After 패널 -->
<rect x="16" y="316" width="368" height="408" rx="10" class="dh4-okpanel"/>
<text x="36" y="346" class="dh4-ph">After: Task 안에서 호출</text>
<text x="36" y="372" class="dh4-lb">파싱 시점</text>
<rect x="40" y="382" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="408" text-anchor="middle" class="dh4-p">DAG 파싱 (기본 30초마다)</text>
<line x1="200" y1="422" x2="200" y2="436" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="436" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="462" text-anchor="middle" class="dh4-p">Variable 접근 없음</text>
<line x1="200" y1="476" x2="200" y2="490" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="490" width="320" height="40" rx="6" class="dh4-pill"/>
<path d="M60 510 L66 517 L78 503" class="dh4-okmark"/>
<text x="212" y="516" text-anchor="middle" class="dh4-ot">dag_hash 고정</text>
<text x="36" y="552" class="dh4-lb">실행 시점</text>
<rect x="40" y="562" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="588" text-anchor="middle" class="dh4-p">Task 실행 (필요할 때만)</text>
<line x1="200" y1="602" x2="200" y2="616" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="616" width="320" height="40" rx="6" class="dh4-pill"/>
<text x="200" y="642" text-anchor="middle" class="dh4-p">Variable.get() 호출</text>
<line x1="200" y1="656" x2="200" y2="670" class="dh4-line" marker-end="url(#dh4Arrow)"/>
<rect x="40" y="670" width="320" height="40" rx="6" class="dh4-pill"/>
<path d="M60 690 L66 697 L78 683" class="dh4-okmark"/>
<text x="212" y="696" text-anchor="middle" class="dh4-ot">작업 수행</text>
</svg>
</div>

## DAG Parsing vs Task Execution: 반드시 알아야 할 규칙

이 문제의 본질은 **"DAG 파싱 시점에 실행되는 코드"와 "Task 실행 시점에 실행되는 코드"의 구분**입니다. Airflow를 처음 쓸 때 가장 헷갈리는 부분이기도 합니다.

| 구분 | DAG Parsing | Task Execution |
|------|-------------|----------------|
| **발생 시점** | 기본 30초마다 (계속) | Task 실행 시 (1회) |
| **실행 위치** | dag-processor | Worker |
| **목적** | DAG 구조 파악 | 실제 작업 수행 |
| **Variable 접근** | ❌ 피할 것 | ✅ 여기서 |
| **Connection 접근** | ❌ 피할 것 | ✅ 여기서 |
| **외부 API 호출** | ❌ 피할 것 | ✅ 여기서 |

parsing 시점에 Variable에 접근하는 코드는 2.x에서도 3.x에서도 그대로 동작합니다. 달라진 것은 대가입니다. 3.x는 직렬화 결과가 바뀔 때마다 DAG 버전을 새로 만들고 실행 중인 DAG Run을 특정 버전에 묶기 때문에, 파싱마다 흔들리는 값 하나가 진행 중인 Run 전체를 무너뜨릴 수 있습니다.

파싱 단계에서 Variable 조회 자체를 줄여야 한다면 `[secrets] use_cache`를 켜는 선택지도 있습니다. DAG 파싱 구간에 한해 Variable을 로컬 캐시하는 실험적 옵션이라, 값 변경이 반영되기까지 `cache_ttl_seconds`만큼 지연됩니다. 다만 이 옵션은 조회 횟수를 줄여줄 뿐 해시가 흔들리는 원인을 없애주지는 않습니다.

### 피해야 할 패턴

DAG 파일의 최상위 스코프(즉 `@task` 바깥)에서 피해야 할 것들을 정리하면 이렇습니다.

```python
# ❌ DAG parsing 시 실행되는 최상위 코드들: 전부 문제!

api_key = Variable.get("API_KEY")             # 파싱마다 DB 조회
conn = BaseHook.get_connection("my_conn")     # 파싱마다 DB 조회
start_date = datetime.now()                   # 매번 다른 값 → 해시가 바뀜
data = requests.get("https://api.com/...")    # 파싱마다 네트워크 호출
config = json.load(open("/tmp/config.json"))  # 파일이 바뀌면 해시가 바뀜
```

위쪽 두 줄은 파싱마다 DB를 두드리는 비용 문제이고, 아래 세 줄은 그 값이 DAG 정의에 흘러 들어가면 곧바로 해시를 흔듭니다. 전부 `@task` 함수 안으로 옮기는 편이 안전합니다. DAG 파일의 최상위에는 **정적 정의만** 두세요.

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
    conn = BaseHook.get_connection("my_conn")
    manager = MyManager(api_key, conn)

    return manager.process(static_param)
```

:::tip

**import 위치도 신경 써야 합니다**

`from airflow.sdk import Variable` 같은 가벼운 import는 파일 최상단에 둬도 괜찮습니다. 하지만 `pandas`, `numpy`, `tensorflow` 같은 무거운 라이브러리를 최상위에서 import하면 30초마다 그 로딩 비용을 다시 냅니다. [공식 Best Practices 문서](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html#top-level-python-code)도 무거운 import를 파이썬 콜러블 안쪽의 지역 import로 바꾸라고 권합니다.

:::

:::summary

**핵심 요약**

- DAG 파일 최상위에서 만든 값이 DAG 정의에 흘러 들어가고 그 값이 파싱마다 달라지면, 직렬화 결과가 달라지면서 `dag_hash`도 매번 달라집니다. 최상위에서 만든 객체를 `partial()`로 넘기는 패턴이 대표적입니다.
- 3.x는 직렬화 결과가 바뀔 때마다 DAG 버전을 새로 만들고 DAG Run을 특정 버전에 묶습니다. 실행 중에 이게 반복되면 남은 Task가 "not found in serialized_dag table"로 한꺼번에 실패합니다.
- 해결: 동적 리소스 접근을 `@task` 함수 안으로 옮깁니다. DAG 파일에는 정적 정의만 둡니다.
- 진단: `SELECT last_updated, dag_hash FROM serialized_dag`로 해시가 고정되어 있는지 확인합니다.

:::

## 마치며

디버깅 과정에서 가장 도움이 됐던 건 `serialized_dag` 테이블을 직접 조회해본 것이었습니다. `dag_hash`가 고정되어 있는지 확인하는 것만으로도 이 유형의 문제를 빠르게 진단할 수 있으니, Airflow에서 원인 모를 Task 실패가 발생하면 가장 먼저 확인해볼 만한 지점입니다.

## 참고자료

- [Airflow 공식 문서: Best Practices (Top level Python Code)](https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html#top-level-python-code)
- [Airflow 공식 문서: DAG Serialization](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-serialization.html)
- [Airflow 공식 문서: Configuration Reference (`[dag_processor] min_file_process_interval`)](https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html#config-dag-processor-min-file-process-interval)
- [Airflow 공식 문서: Dag Bundles](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html)
- [Airflow 공식 문서: Upgrading to Airflow 3](https://airflow.apache.org/docs/apache-airflow/stable/installation/upgrading_to_airflow3.html)
- [Apache Airflow 3 is Generally Available (DAG versioning)](https://airflow.apache.org/blog/airflow-three-point-oh-is-here/)
