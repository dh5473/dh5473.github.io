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

[1편](/airflow/airflow-dag-hash/)에서 DAG Hash 문제를 디버깅할 때, 실패한 Task의 상태가 `hostname=NULL`, `pid=NULL`이었던 걸 기억하시나요? DAG Hash 문제를 해결한 뒤에도 대량 Task를 돌리면 비슷한 증상이 간헐적으로 나타났습니다. 이번에는 에러 메시지가 달랐습니다.

```
Could not read served logs: Invalid URL
'http://:8793/log/dag_id=tts_batch_dag/run_id=.../task_id=.../map_index=51/attempt=1.log':
No host supplied
```

로그 URL에서 hostname 자리가 비어 있습니다. `http://:8793/...` — Worker가 **어디서** 로그를 서빙하는지 모르는 상태입니다. 자연스럽게 hostname 설정을 의심했고, 거기서부터 꽤 긴 삽질이 시작됐습니다.

<br>

## 에러 상황: hostname=NULL인 Task들

실패한 Task들의 공통점은 `task_instance` 테이블에 hostname이 저장되지 않았다는 점입니다.

```
map_index 0-33:   success ✓  (hostname=elastic, pid=12345)
map_index 34+:    failed  ✗  (hostname=NULL, pid=NULL)
```

성공한 Task에는 hostname과 pid가 정상적으로 찍혀 있는데, 실패한 Task는 둘 다 NULL입니다. Worker에 도달조차 못 한 겁니다. 그리고 매번 다른 번호에서 끊겼습니다 — 어떤 때는 34번째, 어떤 때는 28번째.

<br>

## 삽질 1: hostname_callable 변경 → 효과 없음

hostname이 비어있으니 가장 먼저 의심한 건 `hostname_callable` 설정이었습니다. Airflow는 기본적으로 `getfqdn()`을 사용해 Worker의 hostname을 가져옵니다.

```ini
# airflow.cfg 기본 설정
[core]
hostname_callable = airflow.utils.net.getfqdn
```

`getfqdn()`은 DNS 역방향 조회(reverse DNS lookup)를 수행하는데, Docker `network_mode: host` 환경에서는 이게 빈 문자열을 반환할 수 있다는 걸 알고 있었습니다. [GitHub 이슈](https://github.com/apache/airflow/issues/42136)에서도 동일한 문제가 보고되어 있었고요.

그래서 DNS를 우회하는 IP 기반 함수로 바꿔봤습니다.

```ini
# getfqdn → IP 기반으로 변경
hostname_callable = airflow.utils.net.get_host_ip_address
```

**결과: 효과 없음.** 여전히 대량 Task에서 같은 패턴으로 실패했습니다. hostname_callable을 되돌렸습니다.

<br>

## 삽질 2: JWT_SECRET 설정 → 효과 없음

hostname_callable을 바꿨을 때 로그 조회에서 별도 에러가 나길래, Airflow 3.x의 내부 API 인증(JWT)과 hostname이 연관되어 있다는 글을 보고 JWT_SECRET도 추가해봤습니다.

```yaml
# docker-compose.yaml
AIRFLOW__API_AUTH__JWT_SECRET: "fixed-secret-key"
```

**결과: 역시 효과 없음.** JWT_SECRET을 넣든 빼든 "No host supplied" 에러는 동일하게 발생했습니다. 이것도 되돌렸습니다.

이 시점에서 "hostname 문제가 아닐 수도 있다"는 생각이 들기 시작했습니다.

<br>

## 삽질 3: DB Connection Pool 증가 → 효과 없음

다음 의심은 DB connection pool이었습니다. `parallelism=32`인데 기본 pool size는 15개(5+10)밖에 안 되니, Task가 동시에 몰리면 hostname 저장 자체가 밀릴 수 있겠다고 판단했습니다.

```ini
# sql_alchemy_pool_size를 올려봄
sql_alchemy_pool_size = 20
sql_alchemy_max_overflow = 20
```

**결과: 효과 없음.** pool을 넉넉하게 잡아도 같은 위치에서 실패했습니다. 되돌렸습니다.

<br>

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

**Scheduler가 메모리 100%를 찍고 OOM으로 죽었다가 다시 뜨는 걸 반복하고 있었습니다.** 대량 Task를 돌릴 때마다 메모리가 급격히 올라가면서 4GB 제한에 걸려 컨테이너가 kill되고, Docker가 자동 재시작하는 사이클이 반복되는 거였습니다.

### 왜 Scheduler OOM이 hostname=NULL을 만드는가?

LocalExecutor에서 Scheduler는 Task마다 새 프로세스를 fork합니다. fork된 프로세스가 `task_instance` 테이블에 hostname과 pid를 기록하는데, Scheduler가 OOM으로 죽으면 **실행 중이던 Task도 함께 날아가고, 아직 스케줄링되지 않은 Task는 기록 자체가 안 됩니다.**

```
DAG Run 시작 → Task 0~33 fork 성공 → 실행 중
  └── 메모리 급증 → Scheduler OOM kill
      ├── 실행 완료된 Task 0~33: hostname 정상 ✓
      └── 아직 실행 안 된 Task 34+: hostname=NULL, pid=NULL ✗
          └── Scheduler 재시작 후에도 이미 failed 처리됨
```

매번 다른 번호에서 끊기는 것도 이걸로 설명됩니다. Scheduler가 OOM에 도달하는 타이밍이 Task 실행 상황에 따라 매번 달라지기 때문입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 에러 메시지의 함정</strong><br>
  "No host supplied"라는 메시지만 보면 hostname 설정 문제처럼 보입니다. 실제로 hostname_callable을 바꾸라는 조언이 인터넷에 많고요. 하지만 이 에러는 <strong>"hostname이 왜 비어있는가"</strong>를 더 파고들어야 합니다. hostname 함수가 잘못된 게 아니라, hostname을 저장하는 프로세스 자체가 생성되지 못한 거였습니다.
</div>

<br>

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

처음에 4G → 8G로 올렸을 때 상황이 많이 나아졌지만, TTS 배치처럼 수십 개 Task를 동시에 돌리는 DAG에서는 여전히 간헐적으로 터졌습니다. 12G로 올린 뒤에야 완전히 안정화됐습니다.

12G로 올린 뒤에는 대량 Task를 돌려도 Scheduler가 죽지 않았고, 모든 Task의 hostname이 정상적으로 채워졌습니다. "No host supplied" 에러는 완전히 사라졌습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 메모리 산정 기준</strong><br>
  LocalExecutor에서 각 Task 프로세스는 대략 100~200MB를 사용합니다. <code>parallelism=32</code>면 최대 6.4GB가 필요하고, Scheduler 자체 프로세스까지 합하면 8~12GB가 안전한 범위입니다. <a href="/airflow/airflow-dynamic-task-mapping/">2편</a>에서 다뤘던 <code>max_active_tis_per_dag</code>로 동시 실행 수를 줄이는 것도 메모리 압박을 낮추는 데 효과적입니다.
</div>

<br>

## 이 경험에서 배운 것

### 에러 메시지와 원인이 다른 레이어에 있을 수 있다

"No host supplied"라는 에러 메시지 자체는 정확합니다 — 실제로 hostname이 비어있으니까요. 문제는 그 메시지가 가리키는 방향(hostname 설정)과 실제 원인(메모리)이 전혀 다른 레이어에 있었다는 겁니다. `docker stats`로 메모리 사용량은 계속 보고 있었지만, 그게 hostname=NULL과 연결된다는 걸 떠올리지 못했습니다.

### hostname=NULL + pid=NULL의 의미

돌이켜보면 단서는 처음부터 있었습니다. hostname만 NULL이면 설정 문제일 수 있지만, **pid까지 NULL이라는 건 프로세스가 아예 안 떴다**는 뜻입니다. 설정이 아니라 리소스 쪽 신호였는데, 에러 메시지에 이끌려 hostname 설정만 팠던 거죠.

### 비슷한 상황을 만나면

```bash
# 1. 먼저 리소스 확인 — 이걸 첫 번째로!
$ docker stats --no-stream

# 2. Scheduler 로그에서 fork 실패 흔적 확인
$ docker compose logs airflow-scheduler --tail=500 | grep -E "fork|OSError|MemoryError|killed"

# 3. 그래도 안 보이면 그때 hostname 설정 확인
$ docker compose exec airflow-worker python -c \
    "from airflow.utils.net import getfqdn; print(repr(getfqdn()))"
```

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>"No host supplied" 에러는 hostname 설정 문제처럼 보이지만, 실제 원인은 Scheduler 메모리 부족일 수 있다</li>
    <li>LocalExecutor에서 Scheduler가 OOM으로 죽으면 미실행 Task의 hostname/pid가 NULL로 남는다</li>
    <li>hostname_callable 변경, JWT_SECRET, DB pool 증가는 이 경우 효과가 없다</li>
    <li>해결: Scheduler의 <code>mem_limit</code>을 충분히 올리거나, <code>parallelism</code>을 줄여 동시 fork 수를 제한한다</li>
    <li>디버깅 시 <code>docker stats</code>를 가장 먼저 확인하는 습관이 중요하다</li>
  </ul>
</div>

<br>

## 마치며

hostname_callable → JWT_SECRET → DB pool → 메모리. 돌아돌아 결국 가장 기본적인 리소스 문제였습니다. `docker stats`는 계속 보고 있었는데, "Scheduler 메모리가 차는 것"과 "hostname이 NULL인 것"을 연결 짓지 못한 게 삽질의 원인이었습니다.

pid=NULL이라는 단서를 좀 더 일찍 주목했으면 방향을 빨리 잡았을 텐데, "No host supplied"에 꽂혀서 hostname 설정만 계속 건드린 셈입니다.

<br>

## 참고자료

- [Airflow GitHub Issue #42136 — Invalid URL: No host supplied](https://github.com/apache/airflow/issues/42136)
- [Airflow 공식 문서 — Configuration: hostname_callable](https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html#hostname-callable)
- [Airflow 공식 문서 — Running Airflow in Docker](https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/index.html)
