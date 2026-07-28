---
date: '2026-03-26'
title: 'Airflow "No host supplied" 해결 과정: hostname_callable부터 메모리까지'
category: 'DevOps'
series: 'airflow'
seriesOrder: 3
tags: ['Airflow', 'Docker', 'hostname', 'Scheduler', 'Memory']
summary: 'Airflow "No host supplied" 에러의 원인을 hostname에서 찾았지만, 실제 원인은 Scheduler 메모리 부족이었던 디버깅 과정을 정리합니다.'
thumbnail: './thumbnail.png'
---

TTS 배치 DAG를 돌리면 뒤쪽 Task들이 무더기로 실패했고, 실패한 Task의 `task_instance` 행에서는 `hostname`과 `pid`가 둘 다 NULL이었습니다. [DAG Hash가 파싱 때마다 바뀌어 Task가 깨지던 문제](/airflow/airflow-dag-hash/)를 잡은 뒤에도 대량 Task를 돌리면 같은 증상이 간헐적으로 다시 나타났는데, 이번에는 에러 메시지가 달랐습니다.

```
Could not read served logs: Invalid URL
'http://:8793/log/dag_id=tts_batch_dag/run_id=.../task_id=.../map_index=51/attempt=1.log':
No host supplied
```

로그 URL에서 hostname 자리가 비어 있습니다. `http://:8793/...`은 그 Task가 어느 호스트에서 돌았는지 Airflow가 모른다는 뜻입니다. 자연스럽게 hostname 설정을 의심했고, 거기서부터 꽤 긴 삽질이 시작됐습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 460" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="증상 하나에 원인 후보 네 개가 달린 구조. 로그 URL에 호스트가 비어 있고 task_instance의 hostname과 pid가 NULL인 증상 아래로, hostname_callable 교체와 jwt_secret 고정과 DB 커넥션 풀 증가 세 가지 가설이 모두 효과 없음으로 기각되고, 네 번째인 스케줄러 컨테이너 메모리 부족만 진짜 원인으로 확인됩니다.">
<style>.nh1-h{font-size:21px;font-weight:700;fill:var(--text, #1c1917)}.nh1-t{font-size:21px;fill:var(--text, #1c1917)}.nh1-s{font-size:17px;fill:var(--text-muted, #78716c)}.nh1-c{font-size:18px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.nh1-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.nh1-ok{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #16a34a);stroke-width:2}.nh1-x{stroke:var(--text-muted, #78716c);stroke-width:2.5;fill:none;stroke-linecap:round}.nh1-ck{stroke:var(--text-success, #16a34a);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}.nh1-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="nh1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- 증상 -->
<text x="240" y="24" text-anchor="middle" class="nh1-h">관측된 증상</text>
<rect x="20" y="38" width="440" height="90" rx="8" class="nh1-box"/>
<text x="240" y="68" text-anchor="middle" class="nh1-c">Invalid URL 'http://:8793/...'</text>
<text x="240" y="92" text-anchor="middle" class="nh1-c">No host supplied</text>
<text x="240" y="116" text-anchor="middle" class="nh1-s">task_instance: hostname=NULL, pid=NULL</text>
<!-- 분기 화살표 -->
<line x1="240" y1="128" x2="240" y2="160" class="nh1-line" marker-end="url(#nh1Arrow)"/>
<!-- 후보 1 -->
<rect x="20" y="166" width="440" height="62" rx="8" class="nh1-box"/>
<path d="M42 191 L54 203 M54 191 L42 203" class="nh1-x"/>
<text x="76" y="194" class="nh1-t">hostname_callable 교체</text>
<text x="76" y="217" class="nh1-s">IP 기반 함수로 바꿔도 증상 그대로</text>
<!-- 후보 2 -->
<rect x="20" y="238" width="440" height="62" rx="8" class="nh1-box"/>
<path d="M42 263 L54 275 M54 263 L42 275" class="nh1-x"/>
<text x="76" y="266" class="nh1-t">jwt_secret 고정</text>
<text x="76" y="289" class="nh1-s">넣으나 빼나 에러 동일</text>
<!-- 후보 3 -->
<rect x="20" y="310" width="440" height="62" rx="8" class="nh1-box"/>
<path d="M42 335 L54 347 M54 335 L42 347" class="nh1-x"/>
<text x="76" y="338" class="nh1-t">DB 커넥션 풀 증가</text>
<text x="76" y="361" class="nh1-s">15개에서 40개로 늘려도 같은 지점에서 실패</text>
<!-- 후보 4 -->
<rect x="20" y="382" width="440" height="62" rx="8" class="nh1-ok"/>
<path d="M41 413 L47 420 L57 405" class="nh1-ck"/>
<text x="76" y="410" class="nh1-t">Scheduler 컨테이너 메모리</text>
<text x="76" y="433" class="nh1-s">4G 한도에서 OOM kill 반복. 진짜 원인</text>
</svg>
</div>

## 에러 상황: hostname=NULL인 Task들

실패한 Task들의 공통점은 `task_instance` 테이블에 hostname이 저장되지 않았다는 점입니다.

| map_index | 상태 | hostname | pid |
|---|---|---|---|
| 0 ~ 33 | success | `elastic` | `12345` |
| 34 이상 | failed | `NULL` | `NULL` |

성공한 Task에는 hostname과 pid가 정상적으로 찍혀 있는데, 실패한 Task는 둘 다 NULL입니다. 그리고 매번 다른 번호에서 끊겼습니다. 어떤 때는 34번째, 어떤 때는 28번째였습니다.

여기서 두 컬럼이 언제 채워지는지를 짚고 넘어갈 필요가 있습니다. Airflow 3.x에서 Task 실행 프로세스는 메타데이터 DB에 직접 쓰지 않습니다. Task SDK가 Task Execution API로 상태를 보고하고, API 서버가 대신 DB에 씁니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 496" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Airflow 3.x에서 hostname과 pid가 기록되기까지의 다섯 단계. 스케줄러가 TaskInstance를 queued로 올리고, LocalExecutor 워커가 스케줄러의 자식 프로세스로 뜨고, task supervisor가 Task 실행 프로세스를 fork하고, 그 프로세스가 Task Execution API에 state=running과 함께 hostname과 pid와 unixname을 전달하면, API 서버가 task_instance 행에 기록합니다.">
<style>.nh2-h{font-size:21px;font-weight:700;fill:var(--text, #1c1917)}.nh2-t{font-size:21px;fill:var(--text, #1c1917)}.nh2-s{font-size:17px;fill:var(--text-muted, #78716c)}.nh2-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.nh2-hi{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0d9488);stroke-width:2}.nh2-p{font-size:17px;fill:var(--primary, #0d9488)}.nh2-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="nh2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<text x="240" y="26" text-anchor="middle" class="nh2-h">hostname과 pid가 기록되는 경로</text>
<text x="240" y="50" text-anchor="middle" class="nh2-s">Airflow 3.1, LocalExecutor 기준</text>
<!-- 1 -->
<rect x="30" y="64" width="420" height="62" rx="8" class="nh2-box"/>
<text x="52" y="92" class="nh2-t">Scheduler</text>
<text x="52" y="115" class="nh2-s">TaskInstance를 queued로 전환</text>
<line x1="240" y1="126" x2="240" y2="148" class="nh2-line" marker-end="url(#nh2Arrow)"/>
<!-- 2 -->
<rect x="30" y="150" width="420" height="62" rx="8" class="nh2-box"/>
<text x="52" y="178" class="nh2-t">LocalExecutor 워커</text>
<text x="52" y="201" class="nh2-s">스케줄러 프로세스의 자식으로 기동</text>
<line x1="240" y1="212" x2="240" y2="234" class="nh2-line" marker-end="url(#nh2Arrow)"/>
<!-- 3 -->
<rect x="30" y="236" width="420" height="62" rx="8" class="nh2-box"/>
<text x="52" y="264" class="nh2-t">task supervisor</text>
<text x="52" y="287" class="nh2-s">Task 실행 프로세스를 fork</text>
<line x1="240" y1="298" x2="240" y2="320" class="nh2-line" marker-end="url(#nh2Arrow)"/>
<!-- 4 -->
<rect x="30" y="322" width="420" height="86" rx="8" class="nh2-hi"/>
<text x="52" y="350" class="nh2-t">Task Execution API 호출</text>
<text x="52" y="373" class="nh2-p">state=running 과 함께</text>
<text x="52" y="396" class="nh2-p">hostname, pid, unixname 전달</text>
<line x1="240" y1="408" x2="240" y2="430" class="nh2-line" marker-end="url(#nh2Arrow)"/>
<!-- 5 -->
<rect x="30" y="432" width="420" height="62" rx="8" class="nh2-box"/>
<text x="52" y="460" class="nh2-t">API Server</text>
<text x="52" y="483" class="nh2-s">task_instance 행에 두 값 기록</text>
</svg>
</div>

두 컬럼이 NULL이라는 건 이 사슬이 네 번째 칸에 닿기 전에 끊겼다는 뜻입니다. 값을 잘못 구한 게 아니라 값을 실어 나를 API 호출 자체가 없었다는 신호입니다. 이 사실을 알아채기까지 세 번을 헤맸습니다.

## 삽질 1: hostname_callable 변경 → 효과 없음

hostname이 비어있으니 가장 먼저 의심한 건 `hostname_callable` 설정이었습니다. 이 설정은 `[core]` 섹션에 있고 기본값은 `airflow.utils.net.getfqdn`입니다.

```ini
# airflow.cfg 기본값
[core]
hostname_callable = airflow.utils.net.getfqdn
```

`airflow.utils.net.getfqdn`은 표준 라이브러리의 `socket.getfqdn()`을 Airflow가 손본 버전입니다. 이름이 비어 있으면 `socket.gethostname()`으로 채운 다음 `getaddrinfo(..., AI_CANONNAME)`로 정식 이름을 찾습니다. 컨테이너 환경에서 이 이름이 실제로 도달 가능한 주소와 다르게 나오는 사례는 여러 번 보고됐고, 같은 "No host supplied" 문구가 찍힌 [GitHub 이슈](https://github.com/apache/airflow/issues/42136)도 있었습니다(다만 그쪽은 Airflow 2.10.1에 CeleryExecutor 조합이라 환경이 다릅니다).

공식 문서가 IP를 쓰고 싶을 때의 대안으로 안내하는 함수로 바꿔봤습니다.

```ini
# 문서가 안내하는 IP 기반 대안
hostname_callable = airflow.utils.net.get_host_ip_address
```

**결과: 효과 없음.** 여전히 대량 Task에서 같은 패턴으로 실패했습니다. `hostname_callable`을 되돌렸습니다.

사실 이 교체는 기대만큼의 변화를 줄 수 없는 것이었습니다. `get_host_ip_address`의 구현은 `socket.gethostbyname(getfqdn())`이라, 이름 해석을 건너뛰는 게 아니라 `getfqdn()`이 내놓은 이름을 한 번 더 IP로 바꿀 뿐입니다.

## 삽질 2: jwt_secret 고정 → 효과 없음

`hostname_callable`을 바꿨을 때 로그 조회에서 별도 에러가 나길래, Airflow 3.x의 내부 API 인증(JWT)과 hostname이 연관되어 있다는 글을 보고 `[api_auth] jwt_secret`도 고정해봤습니다. 컨테이너마다 시크릿이 다르면 Task Execution API 호출이 인증에서 막힐 수 있으니 아주 엉뚱한 가설은 아니었습니다.

```yaml
# docker-compose.yaml
AIRFLOW__API_AUTH__JWT_SECRET: "fixed-secret-key"
```

**결과: 역시 효과 없음.** 시크릿을 넣든 빼든 "No host supplied" 에러는 동일하게 발생했습니다. 이것도 되돌렸습니다.

이 시점에서 "hostname 문제가 아닐 수도 있다"는 생각이 들기 시작했습니다.

## 삽질 3: DB Connection Pool 증가 → 효과 없음

다음 의심은 DB connection pool이었습니다. `[core] parallelism` 기본값은 32인데 `[database]`의 커넥션 풀 기본값은 `sql_alchemy_pool_size = 5`에 `sql_alchemy_max_overflow = 10`, 합쳐서 동시 15개입니다. Task가 한꺼번에 몰리면 hostname 저장 자체가 밀릴 수 있겠다고 판단했습니다.

```ini
# 커넥션 풀을 넉넉하게
[database]
sql_alchemy_pool_size = 20
sql_alchemy_max_overflow = 20
```

**결과: 효과 없음.** pool을 넉넉하게 잡아도 같은 위치에서 실패했습니다. 되돌렸습니다.

## 진짜 원인: Scheduler 메모리 부족

세 번의 삽질을 거치고 나서야 `docker stats`를 실시간으로 띄워놓고 DAG를 돌려봤습니다.

```bash
$ docker stats
CONTAINER                CPU %     MEM USAGE / LIMIT     MEM %
airflow-scheduler-1      92.1%     3.8GiB / 4GiB         95.0%
# ... 잠시 후
airflow-scheduler-1      0.00%     0B / 0B               --      ← 죽음
# ... 몇 초 후 자동 재시작
airflow-scheduler-1      45.2%     1.2GiB / 4GiB         30.0%
```

**Scheduler가 메모리 100%를 찍고 죽었다가 다시 뜨는 걸 반복하고 있었습니다.** 컨테이너가 cgroup 메모리 한도에 닿으면 커널 OOM killer가 그 cgroup 안에서 프로세스 하나를 골라 죽입니다. 고르는 기준은 대체로 메모리를 많이 쓰는 쪽이고, 그게 컨테이너의 PID 1이면 컨테이너 자체가 종료 코드 137로 내려갑니다. Airflow 공식 `docker-compose.yaml`은 서비스마다 `restart: always`를 걸어두므로 곧바로 다시 뜨고, 다음 배치에서 같은 일이 반복됩니다.

### 왜 Scheduler OOM이 hostname=NULL을 만드는가

LocalExecutor는 스케줄러 노드에서 Task를 실행합니다. 워커가 **스케줄러 프로세스의 자식 프로세스**로 뜨고, 각 워커가 다시 Task 실행 프로세스를 fork합니다. Linux 기본값인 fork 모드에서는 copy-on-write로 인한 메모리 스파이크를 피하려고 워커를 `parallelism` 수만큼 한 번에 띄웁니다. 결과적으로 Task 실행에 드는 메모리가 전부 스케줄러 컨테이너 몫으로 잡힙니다. 공식 문서도 이 점을 명시적으로 경고합니다. 컨테이너 환경에서는 스케줄러 프로세스가 메모리를 과하게 쓰는 것처럼 보이고, 이 때문에 OOM으로 컨테이너가 재시작될 수 있으니 `parallelism`을 컨테이너 리소스 한도에 맞춰 조정하라는 내용입니다.

여기에 앞서 본 기록 경로를 겹치면 그림이 완성됩니다. 스케줄러 컨테이너가 내려가면 그 안의 워커와 Task 프로세스가 전부 함께 사라집니다. 이미 뜬 프로세스는 `state=running`을 보고했으니 hostname과 pid가 남아 있지만, 아직 뜨지 못한 Task는 보고할 프로세스 자체가 없었으므로 두 컬럼이 NULL 그대로입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 452" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="OOM 시점을 기준으로 Task의 운명이 갈리는 타임라인. 위쪽은 OOM 이전에 fork되어 실행된 Task 0에서 33번으로 state=running을 보고해 hostname과 pid가 기록된 상태. 가운데는 스케줄러 컨테이너가 메모리 한도를 넘어 OOM으로 내려가며 컨테이너 안 모든 프로세스가 함께 종료되는 지점. 아래쪽은 아직 fork되지 않아 보고 자체가 없었던 Task 34번 이후로 hostname과 pid가 NULL로 남고, 스케줄러 재시작 뒤 실패로 정리됩니다.">
<style>.nh3-h{font-size:21px;font-weight:700;fill:var(--text, #1c1917)}.nh3-t{font-size:21px;fill:var(--text, #1c1917)}.nh3-s{font-size:17px;fill:var(--text-muted, #78716c)}.nh3-ok{font-size:18px;fill:var(--text-success, #16a34a);font-family:"JetBrains Mono",monospace}.nh3-ng{font-size:18px;fill:var(--text-danger, #dc2626);font-family:"JetBrains Mono",monospace}.nh3-d{font-size:19px;fill:var(--text-danger, #dc2626)}.nh3-boxok{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #16a34a);stroke-width:2}.nh3-boxng{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #dc2626);stroke-width:2}.nh3-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.nh3-band{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #dc2626);stroke-width:2;stroke-dasharray:7 5}.nh3-axis{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}.nh3-ck{stroke:var(--text-success, #16a34a);stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round}.nh3-x{stroke:var(--text-danger, #dc2626);stroke-width:3;fill:none;stroke-linecap:round}</style>
<defs>
<marker id="nh3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<text x="240" y="26" text-anchor="middle" class="nh3-h">OOM 시점 전후로 갈리는 운명</text>
<!-- 시간 축 -->
<line x1="30" y1="44" x2="30" y2="424" class="nh3-axis" marker-end="url(#nh3Arrow)"/>
<text x="30" y="440" text-anchor="middle" class="nh3-s">시간</text>
<!-- OOM 이전 -->
<rect x="52" y="44" width="408" height="102" rx="8" class="nh3-boxok"/>
<path d="M424 82 L432 91 L446 71" class="nh3-ck"/>
<text x="72" y="76" class="nh3-t">Task 0~33: fork 후 실행</text>
<text x="72" y="100" class="nh3-s">Task Execution API에 state=running 보고</text>
<text x="72" y="128" class="nh3-ok">hostname=elastic, pid=12345</text>
<!-- OOM 밴드 -->
<rect x="52" y="164" width="408" height="82" rx="8" class="nh3-band"/>
<text x="72" y="196" class="nh3-d">Scheduler 컨테이너 OOM kill</text>
<text x="72" y="222" class="nh3-s">컨테이너 안 워커와 Task 프로세스가 함께 종료</text>
<!-- OOM 이후 -->
<rect x="52" y="264" width="408" height="102" rx="8" class="nh3-boxng"/>
<path d="M424 304 L446 326 M446 304 L424 326" class="nh3-x"/>
<text x="72" y="296" class="nh3-t">Task 34+: fork 전</text>
<text x="72" y="320" class="nh3-s">보고할 프로세스가 없었음</text>
<text x="72" y="348" class="nh3-ng">hostname=NULL, pid=NULL</text>
<!-- 사후 -->
<rect x="52" y="384" width="408" height="52" rx="8" class="nh3-box"/>
<text x="72" y="416" class="nh3-t">재시작 후 failed로 정리</text>
</svg>
</div>

갈림의 기준은 Task 번호가 아니라 OOM이 터진 시각입니다. 매번 다른 번호에서 끊기는 것도 이걸로 설명됩니다. 스케줄러가 한도에 닿는 시점이 그때그때의 Task 실행 상황에 따라 달라지기 때문입니다.

:::warning

**에러 메시지의 함정**

"No host supplied"라는 문구만 보면 hostname 설정 문제처럼 보입니다. 실제로 `hostname_callable`을 바꾸라는 조언도 흔합니다. 하지만 이 에러에서 물어야 할 것은 "hostname을 어떤 함수로 구하는가"가 아니라 "hostname을 기록하는 절차가 왜 시작되지 않았는가"입니다. hostname을 만드는 함수는 잘못된 값을 줄 수는 있어도 NULL을 주지는 않습니다. 컬럼이 비어 있다는 건 그 값을 실어 나를 프로세스가 뜨지 못했다는 신호입니다.

:::

## 해결: Scheduler 메모리 제한 올리기

```yaml
# docker-compose.yaml
services:
  airflow-scheduler:
    deploy:
      resources:
        limits:
          memory: 12G    # 4G → 8G → 최종 12G
```

한도를 한 번에 정하지 못하고 두 단계로 올렸습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 268" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="스케줄러 컨테이너 메모리 한도를 4기가, 8기가, 12기가로 올려가며 관측한 결과를 길이에 비례하는 가로 막대로 나타낸 그림. 4기가에서는 대량 Task를 돌릴 때마다 OOM이 났고, 8기가에서는 많이 나아졌지만 간헐적으로 터졌으며, 12기가에서는 스케줄러가 죽지 않았습니다.">
<style>.nh4-h{font-size:21px;font-weight:700;fill:var(--text, #1c1917)}.nh4-l{font-size:19px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.nh4-s{font-size:17px;fill:var(--text-muted, #78716c)}.nh4-bad{fill:var(--bg-danger, #fef2f2);stroke:var(--text-danger, #dc2626);stroke-width:2}.nh4-mid{fill:var(--bg-warn, #fffbeb);stroke:var(--text-warn, #d97706);stroke-width:2}.nh4-good{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #16a34a);stroke-width:2}.nh4-x{stroke:var(--text-danger, #dc2626);stroke-width:2.5;fill:none;stroke-linecap:round}.nh4-w{stroke:var(--text-warn, #d97706);stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}.nh4-ck{stroke:var(--text-success, #16a34a);stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}</style>
<text x="240" y="26" text-anchor="middle" class="nh4-h">한도와 결과</text>
<!-- 4G -->
<text x="20" y="70" class="nh4-l">4G</text>
<rect x="90" y="50" width="120" height="26" rx="4" class="nh4-bad"/>
<path d="M92 92 L104 104 M104 92 L92 104" class="nh4-x"/>
<text x="116" y="103" class="nh4-s">대량 Task를 돌릴 때마다 OOM</text>
<!-- 8G -->
<text x="20" y="150" class="nh4-l">8G</text>
<rect x="90" y="130" width="240" height="26" rx="4" class="nh4-mid"/>
<path d="M91 172 L105 172 L98 186 z" class="nh4-w" fill="none"/>
<text x="116" y="183" class="nh4-s">나아졌지만 간헐적으로 터짐</text>
<!-- 12G -->
<text x="20" y="230" class="nh4-l">12G</text>
<rect x="90" y="210" width="360" height="26" rx="4" class="nh4-good"/>
<path d="M91 258 L96 264 L106 250" class="nh4-ck"/>
<text x="116" y="263" class="nh4-s">스케줄러가 죽지 않음</text>
</svg>
</div>

4G에서 8G로 올렸을 때 상황이 많이 나아졌지만, TTS 배치처럼 수십 개 Task를 동시에 돌리는 DAG에서는 여전히 간헐적으로 터졌습니다. 12G로 올린 뒤에는 대량 Task를 돌려도 Scheduler가 죽지 않았고, 모든 Task의 hostname이 정상적으로 채워졌습니다. "No host supplied" 에러도 사라졌습니다.

:::info

**한도를 얼마로 잡을 것인가**

Task 프로세스 하나가 쓰는 메모리는 Task가 무슨 일을 하느냐에 따라 크게 달라져서 일반화된 수치가 없습니다. 공식 문서도 절대량을 제시하는 대신 컨테이너의 리소스 한도에 맞춰 `parallelism`을 조정하라고만 안내합니다. 그러니 실측이 먼저입니다. 대량 Task를 돌리는 동안 `docker stats`로 최대 사용량을 재고, 거기에 여유를 얹어 한도를 잡으세요.

[동시에 도는 매핑 Task 수를 `max_active_tis_per_dag`로 묶어두면](/airflow/airflow-dynamic-task-mapping/) 한도를 올리지 않고도 같은 압박을 줄일 수 있습니다. 한도를 키우는 쪽과 동시 실행을 줄이는 쪽 중 어느 것이 나은지는 배치 시간 여유가 얼마나 있느냐에 달려 있습니다.

:::

## 이 경험에서 배운 것

### 에러 메시지와 원인이 다른 레이어에 있을 수 있다

"No host supplied"라는 에러 메시지 자체는 정확합니다. 실제로 hostname이 비어 있으니까요. 문제는 그 메시지가 가리키는 방향(hostname 설정)과 실제 원인(메모리)이 전혀 다른 레이어에 있었다는 겁니다. `docker stats`로 메모리 사용량은 계속 보고 있었지만, 그게 hostname=NULL과 연결된다는 걸 떠올리지 못했습니다.

### hostname=NULL + pid=NULL의 의미

돌이켜보면 단서는 처음부터 있었습니다. hostname만 NULL이면 설정 문제일 수 있지만, **pid까지 NULL이라는 건 프로세스가 아예 안 떴다**는 뜻입니다. 설정이 아니라 리소스 쪽 신호였는데, 에러 메시지에 이끌려 hostname 설정만 팠던 거죠.

### 비슷한 상황을 만나면

```bash
# 1. 리소스부터 확인한다
$ docker stats --no-stream

# 2. Scheduler 컨테이너가 재시작한 흔적이 있는지 본다
$ docker inspect --format '{{.RestartCount}} {{.State.OOMKilled}} {{.State.ExitCode}}' \
    $(docker compose ps -q airflow-scheduler)

# 3. Scheduler 로그에서 fork 실패 흔적 확인
$ docker compose logs airflow-scheduler --tail=500 | grep -E "fork|OSError|MemoryError|killed"

# 4. 그래도 안 보이면 그때 hostname 설정 확인
$ docker compose exec airflow-scheduler python -c \
    "from airflow.utils.net import get_hostname; print(repr(get_hostname()))"
```

:::summary

**핵심 요약**

- "No host supplied" 에러는 hostname 설정 문제처럼 보이지만, 실제 원인은 Scheduler 메모리 부족일 수 있습니다
- Airflow 3.x에서 hostname과 pid는 Task 프로세스가 뜬 뒤 Task Execution API로 보고돼야 채워집니다. 둘 다 NULL이면 그 프로세스가 없었다는 뜻입니다
- LocalExecutor 워커는 스케줄러의 자식 프로세스라, Task 실행 메모리가 스케줄러 컨테이너 한도에 잡힙니다
- `hostname_callable` 변경, `jwt_secret` 고정, DB 커넥션 풀 증가는 이 경우 효과가 없었습니다
- 해결은 스케줄러 컨테이너 메모리 한도를 올리거나 `parallelism`을 줄여 동시에 뜨는 프로세스 수를 제한하는 것입니다
- 디버깅할 때 `docker stats`부터 확인하면 세 번의 우회를 건너뛸 수 있었습니다

:::

## 마치며

`hostname_callable` → `jwt_secret` → DB 커넥션 풀 → 메모리. 돌아돌아 결국 가장 기본적인 리소스 문제였습니다. `docker stats`는 계속 보고 있었는데, "Scheduler 메모리가 차는 것"과 "hostname이 NULL인 것"을 연결 짓지 못한 게 삽질의 원인이었습니다.

pid=NULL이라는 단서를 좀 더 일찍 주목했으면 방향을 빨리 잡았을 텐데, "No host supplied"에 꽂혀서 hostname 설정만 계속 건드린 셈입니다.

## 참고자료

- [Airflow GitHub Issue #42136: Invalid URL, No host supplied](https://github.com/apache/airflow/issues/42136)
- [Airflow 공식 문서: LocalExecutor](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/local.html) (워커가 스케줄러의 서브프로세스라 컨테이너 OOM으로 이어질 수 있다는 경고)
- [Airflow 공식 문서: Configuration Reference의 hostname_callable](https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html#hostname-callable)
- [Airflow Task SDK 문서](https://airflow.apache.org/docs/task-sdk/stable/) (Task가 Execution API로 상태를 보고하는 구조)
- [execution_api/datamodels/taskinstance.py](https://github.com/apache/airflow/blob/3.1.0/airflow-core/src/airflow/api_fastapi/execution_api/datamodels/taskinstance.py) (`TIEnterRunningPayload`가 hostname, pid, unixname을 싣는 지점)
- [airflow/utils/net.py](https://github.com/apache/airflow/blob/3.1.0/airflow-core/src/airflow/utils/net.py) (`getfqdn`과 `get_host_ip_address` 구현)
- [Airflow 공식 문서: Running Airflow in Docker](https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/index.html)
