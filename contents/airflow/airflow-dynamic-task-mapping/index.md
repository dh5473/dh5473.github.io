---
date: '2026-03-25'
title: 'Airflow Dynamic Task Mapping: 병렬 처리와 동시 실행 제한 전략'
category: 'DevOps'
series: 'airflow'
seriesOrder: 2
tags: ['Airflow', 'Dynamic Task Mapping', 'Pool', 'max_active_tis_per_dag', 'expand']
summary: 'Airflow Dynamic Task Mapping으로 대량 Task를 병렬 처리할 때, 동시 실행을 제한하는 세 가지 전략과 실전 패턴을 비교합니다.'
thumbnail: './thumbnail.png'
---

Airflow에서 배치 처리를 하다 보면, 런타임에 Task 수가 결정되는 상황을 자주 만납니다. 책 한 권의 페이지별 OCR 처리, 수백 개 파일의 TTS 변환, 데이터 파티션별 ETL처럼 실행 전까지 몇 개의 Task가 필요한지 알 수 없는 경우입니다.

Dynamic Task Mapping은 이런 상황에서 `expand()`로 런타임에 Task를 동적으로 생성하는 기능입니다. 편리하지만, 아무 제한 없이 쓰면 Worker가 한꺼번에 수백 개의 Task를 처리하려다 외부 API rate limit에 걸리거나, 메모리가 터지는 일이 생깁니다.

이 글에서는 Dynamic Task Mapping의 동시 실행을 제한하는 세 가지 전략을 비교하고, 실제로 어떤 상황에서 어떤 방식을 쓰는 게 좋은지 정리합니다.

## Dynamic Task Mapping 기본 개념

기존 방식에서는 Task 수를 코드에 하드코딩해야 했습니다.

```python
# ❌ 정적 Task 생성: 페이지 수를 미리 알아야 함
for i in range(20):
    extract_page_task = extract_kc_task.override(task_id=f"extract_page_{i}")
```

Dynamic Task Mapping은 `expand()`를 사용해 **런타임에 입력 데이터의 크기만큼** Task를 자동 생성합니다.

```python
# ✅ Dynamic Task Mapping: 런타임에 페이지 수만큼 Task 생성
pages = get_pages_dynamically()
extract_kc_per_page.expand(page_config=pages["page_configs"])
```

20개 페이지면 20개 Task, 100개 페이지면 100개 Task가 만들어집니다. 여기서 중요한 건 **Task가 늘어나는 시점**입니다. 코드에 적힌 Task 정의는 끝까지 하나뿐이고, DAG Run 안에서 입력 길이가 확정되는 순간 `map_index`가 0번부터 붙은 Task Instance가 그 개수만큼 펼쳐집니다. 위 예처럼 목록을 업스트림 Task가 만들어 준다면 그 Task가 끝나야 몇 개로 펼쳐질지 정해집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 424" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="DAG 정의에는 Task가 하나뿐이지만 DAG Run이 만들어질 때 map_index 0번부터 19번까지 Task Instance 20개로 펼쳐지는 모습">
  <defs>
    <marker id="dtm1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <style>
    .dtm1-h { font-size: 15px; fill: var(--text, #1c1917); font-weight: 700; }
    .dtm1-code { font-size: 15px; fill: var(--primary, #0d9488); font-family: "JetBrains Mono", monospace; }
    .dtm1-sub { font-size: 14px; fill: var(--text-muted, #78716c); }
    .dtm1-mid { font-size: 15px; fill: var(--text, #1c1917); }
    .dtm1-idx { font-size: 15px; fill: var(--text, #1c1917); }
  </style>
  <!-- 1단계: DAG 정의 -->
  <text class="dtm1-h" x="20" y="22">1. DAG 정의 (파싱 시점)</text>
  <rect x="20" y="32" width="360" height="66" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
  <text class="dtm1-code" x="200" y="60" text-anchor="middle">extract.expand(page_config=pages)</text>
  <text class="dtm1-sub" x="200" y="82" text-anchor="middle">Task 정의는 언제나 1개</text>
  <!-- 펼침 화살표 -->
  <line x1="200" y1="100" x2="200" y2="132" stroke="var(--text-muted, #78716c)" stroke-width="2" marker-end="url(#dtm1Arrow)"/>
  <text class="dtm1-mid" x="200" y="154" text-anchor="middle">입력 길이가 정해지면 펼쳐짐</text>
  <!-- 2단계: DAG Run -->
  <text class="dtm1-h" x="20" y="182">2. DAG Run (실행 시점)</text>
  <rect x="20" y="192" width="360" height="196" rx="8" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)"/>
  <!-- map_index 0-4 -->
  <rect x="50" y="212" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="76" y="233" text-anchor="middle">0</text>
  <rect x="112" y="212" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="138" y="233" text-anchor="middle">1</text>
  <rect x="174" y="212" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="200" y="233" text-anchor="middle">2</text>
  <rect x="236" y="212" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="262" y="233" text-anchor="middle">3</text>
  <rect x="298" y="212" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="324" y="233" text-anchor="middle">4</text>
  <!-- map_index 5-9 -->
  <rect x="50" y="253" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="76" y="274" text-anchor="middle">5</text>
  <rect x="112" y="253" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="138" y="274" text-anchor="middle">6</text>
  <rect x="174" y="253" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="200" y="274" text-anchor="middle">7</text>
  <rect x="236" y="253" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="262" y="274" text-anchor="middle">8</text>
  <rect x="298" y="253" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="324" y="274" text-anchor="middle">9</text>
  <!-- map_index 10-14 -->
  <rect x="50" y="294" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="76" y="315" text-anchor="middle">10</text>
  <rect x="112" y="294" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="138" y="315" text-anchor="middle">11</text>
  <rect x="174" y="294" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="200" y="315" text-anchor="middle">12</text>
  <rect x="236" y="294" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="262" y="315" text-anchor="middle">13</text>
  <rect x="298" y="294" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="324" y="315" text-anchor="middle">14</text>
  <!-- map_index 15-19 -->
  <rect x="50" y="335" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="76" y="356" text-anchor="middle">15</text>
  <rect x="112" y="335" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="138" y="356" text-anchor="middle">16</text>
  <rect x="174" y="335" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="200" y="356" text-anchor="middle">17</text>
  <rect x="236" y="335" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="262" y="356" text-anchor="middle">18</text>
  <rect x="298" y="335" width="52" height="32" rx="5" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)"/>
  <text class="dtm1-idx" x="324" y="356" text-anchor="middle">19</text>
  <!-- 하단 캡션 -->
  <text class="dtm1-sub" x="200" y="410" text-anchor="middle">숫자는 map_index. 제한이 없으면 20개가 동시에 실행</text>
</svg>
</div>

*제한을 걸어야 할 대상은 위의 Task 정의가 아니라 아래에 펼쳐진 Task Instance입니다.*

편리하지만, 여기서 바로 문제가 시작됩니다. **동시에 100개 Task가 돌면 어떻게 될까요?**

## 동시 실행을 제한하는 세 가지 방법

제한 설정을 하나씩 보기 전에, 이들이 서로 다른 층에 놓여 있다는 점부터 짚고 갑니다. 몇 개를 **만들 것인가**를 정하는 설정과 만들어진 것을 한 번에 몇 개나 **돌릴 것인가**를 정하는 설정은 층이 다르고, 그래서 서로를 대체하지 못합니다. 게다가 돌릴 개수를 정하는 설정은 하나가 아니라 여럿인데, 이 중 하나만 통과하면 되는 게 아니라 전부 통과해야 Task가 뜹니다. 실제 동시 실행 수가 늘 그중 가장 작은 값이 되는 이유입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 614" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="펼침 층에서는 max_map_length가 만들 수 있는 Task 수를 제한하고, 조임 층에서는 max_active_tis_per_dag, max_active_tis_per_dagrun, Pool, parallelism이 차례로 동시 실행 수를 제한하는 구조">
  <defs>
    <marker id="dtm2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <style>
    .dtm2-h { font-size: 15px; fill: var(--text, #1c1917); font-weight: 700; }
    .dtm2-name { font-size: 17px; fill: var(--primary, #0d9488); font-family: "JetBrains Mono", monospace; }
    .dtm2-sub { font-size: 14px; fill: var(--text-muted, #78716c); }
    .dtm2-mid { font-size: 15px; fill: var(--text, #1c1917); }
    .dtm2-goal { font-size: 16px; fill: var(--text-success, #16a34a); font-weight: 700; }
  </style>
  <!-- 펼침 층 -->
  <text class="dtm2-h" x="20" y="20">펼침 층: 몇 개를 만들 것인가</text>
  <rect x="14" y="28" width="372" height="102" rx="10" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
  <rect x="28" y="40" width="344" height="78" rx="6" fill="var(--bg, #fafaf8)" stroke="var(--accent, #d97706)"/>
  <text class="dtm2-name" x="44" y="64">max_map_length</text>
  <text class="dtm2-sub" x="44" y="86">배포 전역 · 기본값 1024</text>
  <text class="dtm2-sub" x="44" y="106">넘으면 소스 Task가 실패</text>
  <!-- 연결 -->
  <line x1="200" y1="132" x2="200" y2="158" stroke="var(--text-muted, #78716c)" stroke-width="2" marker-end="url(#dtm2Arrow)"/>
  <text class="dtm2-mid" x="200" y="180" text-anchor="middle">Task Instance N개</text>
  <!-- 조임 층 -->
  <text class="dtm2-h" x="20" y="208">조임 층: 한 번에 몇 개를 돌릴 것인가</text>
  <rect x="14" y="216" width="372" height="300" rx="10" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
  <rect x="28" y="228" width="344" height="60" rx="6" fill="var(--bg, #fafaf8)" stroke="var(--primary, #0d9488)"/>
  <text class="dtm2-name" x="44" y="253">max_active_tis_per_dag</text>
  <text class="dtm2-sub" x="44" y="275">그 DAG의 활성 Run 전체에서 셈</text>
  <rect x="28" y="300" width="344" height="60" rx="6" fill="var(--bg, #fafaf8)" stroke="var(--primary, #0d9488)"/>
  <text class="dtm2-name" x="44" y="325">max_active_tis_per_dagrun</text>
  <text class="dtm2-sub" x="44" y="347">DAG Run 하나 안에서만 셈</text>
  <rect x="28" y="372" width="344" height="60" rx="6" fill="var(--bg, #fafaf8)" stroke="var(--primary, #0d9488)"/>
  <text class="dtm2-name" x="44" y="397">Pool (pool_slots)</text>
  <text class="dtm2-sub" x="44" y="419">배포 전역 · 여러 DAG가 슬롯을 나눠 씀</text>
  <rect x="28" y="444" width="344" height="60" rx="6" fill="var(--bg, #fafaf8)" stroke="var(--primary, #0d9488)"/>
  <text class="dtm2-name" x="44" y="469">parallelism</text>
  <text class="dtm2-sub" x="44" y="491">스케줄러 하나당 상한 · 기본 32</text>
  <!-- 실행 -->
  <line x1="200" y1="518" x2="200" y2="544" stroke="var(--text-muted, #78716c)" stroke-width="2" marker-end="url(#dtm2Arrow)"/>
  <rect x="100" y="552" width="200" height="46" rx="8" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)"/>
  <text class="dtm2-goal" x="200" y="581" text-anchor="middle">Worker에서 실제 실행</text>
</svg>
</div>

### 1. max_active_tis_per_dag: 가장 간단하고 실용적

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

여기서 놓치기 쉬운 게 **세는 단위**입니다. 이름에 `per_dag`가 붙어 있으니 DAG Run마다 5개씩인 것처럼 읽히지만, 공식 문서는 "this applies to all copies of that task against all active DagRuns, not just to this one specific DagRun"이라고 못 박습니다. 활성 Run이 몇 개든 전부 합쳐서 5개입니다.

DAG Run 하나하나에 5개씩 주고 싶다면 이름이 한 마디 다른 파라미터를 씁니다.

```python
@task(max_active_tis_per_dagrun=5)
def extract_kc_per_page(page_config):
    # DAG Run 하나마다 각각 최대 5개씩 동시 실행
    return process_page(page_config)
```

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 392" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="활성 DAG Run이 3개일 때 max_active_tis_per_dag를 4로 두면 세 Run 합쳐서 4개만 실행되고, max_active_tis_per_dagrun을 4로 두면 Run마다 4개씩 모두 12개가 실행되는 비교">
  <style>
    .dtm3-name { font-size: 16px; fill: var(--primary, #0d9488); font-family: "JetBrains Mono", monospace; }
    .dtm3-sub { font-size: 14px; fill: var(--text-muted, #78716c); }
    .dtm3-row { font-size: 14px; fill: var(--text, #1c1917); }
    .dtm3-tot { font-size: 15px; fill: var(--text, #1c1917); font-weight: 700; }
    .dtm3-run { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); }
    .dtm3-wait { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-dasharray: 3 2; }
  </style>
  <!-- 위 패널: per_dag -->
  <rect x="12" y="6" width="376" height="162" rx="10" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
  <text class="dtm3-name" x="26" y="30">max_active_tis_per_dag = 4</text>
  <text class="dtm3-sub" x="26" y="50">활성 Run 전체를 통틀어 셈</text>
  <text class="dtm3-row" x="26" y="78">Run 1</text>
  <rect class="dtm3-run" x="82" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="119" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="156" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="193" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="62" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="62" width="32" height="22" rx="4"/>
  <text class="dtm3-row" x="26" y="108">Run 2</text>
  <rect class="dtm3-run" x="82" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="119" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="156" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="193" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="92" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="92" width="32" height="22" rx="4"/>
  <text class="dtm3-row" x="26" y="138">Run 3</text>
  <rect class="dtm3-run" x="82" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="119" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="156" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="193" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="122" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="122" width="32" height="22" rx="4"/>
  <text class="dtm3-tot" x="26" y="160">동시 실행 합계 4개</text>
  <!-- 아래 패널: per_dagrun -->
  <rect x="12" y="186" width="376" height="162" rx="10" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
  <text class="dtm3-name" x="26" y="210">max_active_tis_per_dagrun = 4</text>
  <text class="dtm3-sub" x="26" y="230">DAG Run 하나마다 따로 셈</text>
  <text class="dtm3-row" x="26" y="258">Run 1</text>
  <rect class="dtm3-run" x="82" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="119" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="156" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="193" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="242" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="242" width="32" height="22" rx="4"/>
  <text class="dtm3-row" x="26" y="288">Run 2</text>
  <rect class="dtm3-run" x="82" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="119" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="156" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="193" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="272" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="272" width="32" height="22" rx="4"/>
  <text class="dtm3-row" x="26" y="318">Run 3</text>
  <rect class="dtm3-run" x="82" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="119" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="156" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-run" x="193" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="230" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="267" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="304" y="302" width="32" height="22" rx="4"/>
  <rect class="dtm3-wait" x="341" y="302" width="32" height="22" rx="4"/>
  <text class="dtm3-tot" x="26" y="340">동시 실행 합계 12개</text>
  <!-- 범례 -->
  <rect class="dtm3-run" x="60" y="366" width="18" height="14" rx="3"/>
  <text class="dtm3-sub" x="84" y="378">실행 중</text>
  <rect class="dtm3-wait" x="200" y="366" width="18" height="14" rx="3"/>
  <text class="dtm3-sub" x="224" y="378">슬롯 대기</text>
</svg>
</div>

책 세 권을 동시에 처리하는데 뒤에 걸린 두 권이 첫 권 끝날 때까지 한 발도 못 나가는 게 문제라면 `max_active_tis_per_dagrun`이 맞습니다. 반대로 외부 API rate limit처럼 **총량**을 지켜야 한다면 `max_active_tis_per_dag`가 맞습니다. 둘 다 걸어두면 더 빡빡한 쪽이 실제 상한이 됩니다.

경험상, 대부분의 경우 이것만으로 충분합니다. 설정이 간단하고, Pool을 별도로 만들 필요도 없습니다.

### 2. Pool: 여러 DAG 간 리소스 공유

앞의 두 파라미터는 이름 그대로 그 DAG 안에서만 셉니다. 여러 DAG가 같은 리소스(GPU, DB 커넥션, 외부 API 등)를 공유할 때는 **Pool**이 필요합니다. Pool은 배포 전체에서 공유되는 슬롯 묶음이라, DAG가 몇 개든 슬롯을 나눠 씁니다.

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

Pool의 가장 큰 장점은 **런타임에 크기를 조정**할 수 있다는 점입니다. `max_active_tis_per_dag`를 바꾸려면 코드를 고치고 재파싱을 기다려야 하지만, Pool 크기는 UI(`Admin -> Pools`)나 CLI에서 바꾸면 그대로 반영됩니다. 리소스 상황에 따라 그때그때 조절할 수 있습니다.

`pool`을 지정하지 않은 Task는 전부 `default_pool`로 들어갑니다. 기본 슬롯 수는 128이고 이것도 UI나 CLI에서 바꿀 수 있습니다.

`pool_slots` 파라미터를 활용하면 Task마다 다른 리소스 비중을 줄 수도 있습니다.

```python
# GPU가 4개인 환경에서 Pool 크기 = 4

@task(pool="gpu_pool", pool_slots=2)  # GPU 2개 사용
def train_model(model_config):
    return train_with_gpu(model_config)

@task(pool="gpu_pool", pool_slots=1)  # GPU 1개 사용
def inference(data_batch):
    return predict(data_batch)
```

### 3. max_map_length: Task 생성 자체를 제한

위 두 방법이 "동시 실행 수"를 제한하는 것과 달리, `max_map_length`는 **생성 가능한 Task 수 자체**를 제한하는 설정입니다. Scheduler 과부하나 메모리 폭발을 막는 안전장치 역할이라고 보면 됩니다.

```ini
# airflow.cfg
[core]
max_map_length = 1024  # 기본값
```

Task 인자가 아니라 `[core]` 설정이라 배포 전체에 한 번 걸립니다. Task마다 다른 값을 주는 건 불가능하고, 특정 DAG만 낮추고 싶으면 결국 코드에서 리스트를 잘라야 합니다.

```python
# 코드 레벨에서 직접 제한
@task
def get_pages():
    pages = get_all_pages()
    return pages[:50]  # 최대 50개만 반환
```

주의할 점은 초과했을 때 실패하는 쪽이 매핑된 Task가 아니라 **리스트를 push한 업스트림 Task**라는 겁니다. 설정 설명 그대로 "the task pushing the XCom will be failed automatically"입니다. `get_pages()`가 1,025개짜리 리스트를 반환하면 `get_pages` 자체가 failed로 끝나고, 그 뒤의 매핑 Task는 아예 만들어지지 않습니다. 동시 실행을 "늦추는" 게 아니라 파이프라인을 그 자리에서 끊는 셈이라, 이 설정은 제한보다는 **보호 장치**로 다루는 것이 적절합니다.

## 어떤 방법을 써야 할까?

| 방법 | 제어 대상 | 세는 단위 | 기본값 | 추천 상황 |
|------|-----------|-----------|--------|-----------|
| `max_active_tis_per_dag` | 동시 실행 수 | 그 DAG의 활성 Run 전체 | 없음 (Task 인자) | 대부분의 경우 |
| `max_active_tis_per_dagrun` | 동시 실행 수 | DAG Run 하나 | 없음 (Task 인자) | Run별로 공평하게 나눠야 할 때 |
| `Pool` | 동시 실행 수 | 배포 전역, DAG 무관 | `default_pool` 128슬롯 | 여러 DAG가 같은 리소스를 쓸 때 |
| `max_map_length` | 만들 수 있는 Task 수 | 배포 전역 (`[core]`) | 1024 | 시스템 안전장치 |
| `parallelism` | 동시 실행 수 | 스케줄러 하나 | 32 | 인프라 레벨 상한선 |

`parallelism`은 "시스템 전역"이라고 알려진 경우가 많은데, 공식 설명은 "the maximum number of task instances that can run concurrently **per scheduler**"입니다. Scheduler를 두 대로 늘리면 실질 상한도 두 배가 되므로, HA 구성에서는 이 값을 배포 전체의 상한선으로 믿으면 안 됩니다.

개인적으로는 **`max_active_tis_per_dag`를 기본으로 쓰고, 필요할 때만 Pool을 추가**하는 조합을 권장합니다. 실제로 저도 대부분의 DAG에서 이 패턴으로 충분했습니다.

```python
@task(
    max_active_tis_per_dag=5,       # 기본: 이 DAG의 활성 Run 전체에서 5개
    pool="heavy_compute_pool",      # 추가: 배포 전역 리소스 제한 (필요한 경우만)
    pool_slots=2                    # Task 하나가 차지하는 슬롯 수
)
def heavy_processing(data):
    return expensive_computation(data)
```

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

1,000건을 개별 처리하면 1,000개 Task가 생기지만, 5개씩 청크로 묶으면 200개로 줄어듭니다. `max_map_length` 기본값 1024를 넘길 위험도 함께 사라집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 236" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="데이터 1000건을 개별 처리하면 Task가 1000개 생기지만 5건씩 청크로 묶으면 200개로 줄어드는 막대 비교">
  <style>
    .dtm4-t { font-size: 15px; fill: var(--text, #1c1917); font-weight: 700; }
    .dtm4-l { font-size: 15px; fill: var(--text, #1c1917); }
    .dtm4-v { font-size: 17px; fill: var(--text, #1c1917); font-weight: 700; }
    .dtm4-n { font-size: 14px; fill: var(--text-muted, #78716c); }
  </style>
  <text class="dtm4-t" x="20" y="24">1,000건을 처리할 때 만들어지는 Task 수</text>
  <text class="dtm4-l" x="20" y="54">개별 처리</text>
  <rect x="20" y="62" width="280" height="36" rx="5" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)"/>
  <text class="dtm4-v" x="380" y="87" text-anchor="end">1,000개</text>
  <text class="dtm4-l" x="20" y="134">5건씩 청크로 묶기</text>
  <rect x="20" y="142" width="56" height="36" rx="5" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)"/>
  <text class="dtm4-v" x="380" y="167" text-anchor="end">200개</text>
  <text class="dtm4-n" x="20" y="202">막대 길이는 Task 수에 비례</text>
  <text class="dtm4-n" x="20" y="222">처리하는 데이터는 양쪽 다 1,000건</text>
</svg>
</div>

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

[`Variable.get()`을 DAG 최상위에서 호출하면](/airflow/airflow-dag-hash/) 파싱할 때마다 `dag_hash`가 달라집니다. `expand()`에 넣을 목록을 만들 때도 마찬가지라, 외부 API 호출 같은 동적 리소스 접근은 Task 함수 본문 안에 두어야 합니다.

## 문제가 생겼을 때 확인할 것들

Dynamic Task Mapping 관련 문제가 생겼을 때 확인해볼 포인트를 정리합니다.

:::warning

**Task가 scheduled 상태에서 안 넘어간다면**

Pool 크기가 꽉 찼거나, `max_active_runs`에 걸려 있을 가능성이 높습니다. 아래 명령어로 확인해보세요.

:::

**확인 방법:**

```bash
# Pool 크기와 사용량 확인
$ airflow pools list

# DAG의 max_active_runs 확인
$ airflow dags details <dag_id> | grep max_active_runs
```

**메모리 부족이 발생한다면:**
- 청크 기반 처리로 전환해 Task 수 자체를 줄입니다
- `max_active_tis_per_dag`나 Pool 크기를 낮춰 동시에 뜨는 Task Instance 수를 줄입니다
- `max_map_length`는 넘는 순간 업스트림 Task를 실패시키므로, 메모리 튜닝 손잡이가 아니라 마지막 안전선으로만 씁니다

**API Rate Limit에 걸린다면:**
- 총량을 지켜야 하므로 `max_active_tis_per_dagrun`이 아니라 `max_active_tis_per_dag`를 줄입니다
- `retry_delay`를 늘려서 재시도 간격을 확보합니다

## 마치며

처음에는 아무 제한 없이 `expand()`를 썼다가 외부 API rate limit에 걸려서 수백 개 Task가 동시에 실패한 적이 있습니다. 그 뒤로 `max_active_tis_per_dag`를 습관적으로 넣게 됐고, 이것 하나만으로도 대부분의 상황을 커버할 수 있었습니다.

`expand()`는 펼치기만 할 뿐 조여주지 않습니다. 조이는 손잡이는 Task 인자(`max_active_tis_per_dag`, `max_active_tis_per_dagrun`), Pool, 그리고 `[core]` 설정으로 층이 나뉘어 있고, 각각 세는 단위가 다릅니다. 새 DAG에 `expand()`를 쓴다면 어느 층에서 조일지도 같이 정해두는 편이 좋습니다.

## 참고자료

- [Airflow 공식 문서: Dynamic Task Mapping](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html)
- [Airflow 공식 문서: Placing Limits on Mapped Tasks](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html#placing-limits-on-mapped-tasks)
- [Airflow 공식 문서: Pools](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/pools.html)
- [Airflow 공식 문서: Configuration Reference (`max_map_length`, `parallelism`)](https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html)
- [Airflow Task SDK API: BaseOperator 파라미터 (`max_active_tis_per_dag`, `max_active_tis_per_dagrun`)](https://airflow.apache.org/docs/task-sdk/stable/api.html)
- [Astronomer: Create dynamic Airflow tasks](https://www.astronomer.io/docs/learn/dynamic-tasks)
- [Astronomer: DAG Writing Best Practices](https://www.astronomer.io/docs/learn/dag-best-practices)
