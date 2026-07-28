---
date: '2026-04-13'
title: 'PostgreSQL MVCC와 튜플 가시성'
category: 'Database'
series: 'postgres'
seriesOrder: 3
tags: ['PostgreSQL', 'MVCC', 'Snapshot', 'Transaction', 'Visibility']
summary: '두 트랜잭션이 같은 row를 읽었을 때 왜 다른 값이 보이는지, xmin/xmax와 snapshot의 조합으로 가시성이 어떻게 결정되는지, 그리고 xid가 42억을 넘기면 무슨 일이 일어나는지 손으로 풀어봅니다.'
thumbnail: './thumbnail.png'
---

PostgreSQL에서는 한 row의 값이 보는 사람에 따라 달라질 수 있습니다. 정확히는 "보는 사람"이 아니라 "보는 시점", 더 정확히는 "어느 트랜잭션이 어떤 snapshot을 들고 보느냐"에 따라 달라집니다.

간단한 상황을 만들어봅시다. 터미널 두 개를 열고 같은 DB에 접속합니다.

```sql
CREATE TABLE accounts (id int PRIMARY KEY, balance int);
INSERT INTO accounts VALUES (1, 1000);
```

세션 두 개로 동시에 작업합니다.

```sql
-- Session A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 1;
```

| balance |
|---------|
| 1000 |

```sql
-- Session B (별도 터미널)
UPDATE accounts SET balance = 2000 WHERE id = 1;
-- (auto-commit으로 즉시 커밋됨)
```

```sql
-- Session A (같은 트랜잭션 안에서 다시 읽기)
SELECT balance FROM accounts WHERE id = 1;
```

| balance |
|---------|
| 1000 |

Session B가 balance를 2000으로 바꾸고 커밋까지 마쳤는데, Session A에는 여전히 1000이 보입니다. 이걸 Repeatable Read 격리 수준의 동작이라고 부르긴 하지만, 실제로 이 동작이 **어떻게 구현되는지**를 알려면 한 단계 더 들어가야 합니다.

힙에 저장되는 모든 튜플은 [튜플 헤더](/postgres/heap-page-tuple/)에 `t_xmin`과 `t_xmax`라는 두 개의 필드를 달고 다닙니다. 각각 "이 튜플을 만든 트랜잭션"과 "이 튜플을 죽인 트랜잭션"의 ID입니다. 이 글에서는 그 xmin/xmax를 가지고 **"이 튜플이 지금 보이느냐 안 보이느냐"를 결정하는 규칙** 전체를 따라갑니다. 그 규칙의 중심에는 **snapshot**이라는 자료구조가 있고, 이 snapshot이 격리 수준에 따라 재획득되거나 고정되는 차이가 위 시나리오의 차이를 만듭니다. 마지막으로 xid가 32비트 한계에 부딪힐 때 일어나는 일(wraparound)과 그걸 막기 위한 freeze까지 다룹니다.

## 트랜잭션 ID(xid)

PostgreSQL에서 데이터를 변경하는 모든 트랜잭션에는 고유한 번호가 붙습니다. 이걸 **트랜잭션 ID**(xid)라고 부르고, 내부적으로 32비트 unsigned 정수(`TransactionId`)입니다. 0, 1, 2는 시스템이 예약한 값이고, 일반 트랜잭션은 3부터 순차적으로 부여됩니다.

현재 트랜잭션의 xid는 `pg_current_xact_id()` 함수로 확인할 수 있습니다. 한 가지 주의할 점은, 이 함수를 호출하면 원래 read-only여서 xid가 없던 트랜잭션에도 xid가 강제 할당됩니다. 불필요한 xid 소비를 피하려면 `pg_current_xact_id_if_assigned()`를 쓰는 게 좋지만, 여기서는 값을 확인하는 용도로 전자를 사용합니다.

```sql
BEGIN;
SELECT pg_current_xact_id();
```

| pg_current_xact_id |
|--------------------|
| 748 |

```sql
COMMIT;
```

다른 세션에서 같은 함수를 부르면 749, 750... 순서대로 올라갑니다. 32비트이므로 전체 공간은 약 42.9억(2^32)이지만, xid의 순서 비교는 단순한 대소 비교가 아니라 **modular arithmetic**(원형 비교)으로 동작합니다. 그래서 전체 공간의 절반인 약 21억(2^31)만 "과거"로, 나머지 절반이 "미래"로 해석됩니다. 이 한계가 뒤에서 다룰 wraparound 문제의 원인입니다.

튜플 헤더의 `t_xmin`과 `t_xmax`에 적혀 있는 숫자가 바로 이 xid입니다. `t_xmin = 748`이면 "xid 748 트랜잭션이 이 튜플을 INSERT했다"는 뜻이고, `t_xmax = 750`이면 "xid 750이 이 튜플을 UPDATE 또는 DELETE했다"는 뜻입니다.

## Snapshot: "지금 세상이 어떤 모습인가"의 사진

xid만 가지고는 가시성을 판정할 수 없습니다. "xid 748이 이 튜플을 만들었다"는 사실은 알지만, "그래서 지금 보여야 하는가?"를 결정하려면 **"xid 748의 트랜잭션은 이미 끝났는가, 아직 진행 중인가"**를 알아야 합니다. 이 질문에 대한 답을 미리 찍어둔 것이 **snapshot**입니다.

snapshot은 트랜잭션이 "지금 세상의 상태"를 사진처럼 저장해둔 자료구조이고, 세 가지 핵심 필드로 구성됩니다.

- **xmin**: 이 snapshot 생성 시점에 활성 중이던 가장 작은 xid. 이보다 작은 xid의 트랜잭션은 모두 완료되어 더 이상 활성 상태가 아닙니다. committed인지 aborted인지는 CLOG에서 개별 확인합니다
- **xmax**: 가장 최근에 할당된 xid + 1. 이 값 이상의 xid는 snapshot 생성 시점에 아직 시작조차 하지 않은 미래
- **xip[]**: xmin과 xmax 사이에서 snapshot 생성 시점에 아직 진행 중이었던 xid들의 목록

이 세 필드를 xid 번호선 위에 올려보면 이렇습니다. xmin이 748, xmax가 752이고 xip[]에 748과 750이 들어 있는 snapshot을 예로 들었습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 320" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="xid 번호선 위에서 snapshot의 xmin(748)과 xmax(752)가 번호선을 과거 구간, xip 배열이 흩어진 구간, 미래 구간의 셋으로 나누는 그림">
<defs>
<marker id="mv1Arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--primary, #0d9488)"/></marker>
</defs>
<style>
.mv1-t { fill: var(--text, #1c1917); }
.mv1-m { fill: var(--text-muted, #78716c); }
.mv1-k { fill: var(--primary, #0d9488); font-weight: 600; }
.mv1-a { fill: var(--accent, #d97706); font-weight: 600; }
</style>
<!-- 제목 -->
<text x="240" y="30" text-anchor="middle" font-size="20" font-weight="600" class="mv1-t">xid 번호선 위의 snapshot</text>
<!-- xmin / xmax 포인터 -->
<text x="140" y="64" text-anchor="middle" font-size="18" class="mv1-k">xmin = 748</text>
<text x="400" y="64" text-anchor="middle" font-size="18" class="mv1-k">xmax = 752</text>
<line x1="140" y1="72" x2="140" y2="92" stroke="var(--primary, #0d9488)" stroke-width="2" marker-end="url(#mv1Arrow)"/>
<line x1="400" y1="72" x2="400" y2="92" stroke="var(--primary, #0d9488)" stroke-width="2" marker-end="url(#mv1Arrow)"/>
<!-- 세 구간 -->
<rect x="18" y="96" width="89" height="50" rx="4" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<rect x="107" y="96" width="260" height="50" rx="4" fill="var(--bg-warn, #fffbeb)" stroke="var(--accent, #d97706)"/>
<rect x="367" y="96" width="95" height="50" rx="4" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-dasharray="4 3"/>
<!-- 번호선 눈금 -->
<text x="30" y="122" text-anchor="middle" font-size="17" class="mv1-m">…</text>
<text x="75" y="122" text-anchor="middle" font-size="17" class="mv1-t">747</text>
<text x="140" y="122" text-anchor="middle" font-size="17" class="mv1-a">748</text>
<text x="205" y="122" text-anchor="middle" font-size="17" class="mv1-t">749</text>
<text x="270" y="122" text-anchor="middle" font-size="17" class="mv1-a">750</text>
<text x="335" y="122" text-anchor="middle" font-size="17" class="mv1-t">751</text>
<text x="400" y="122" text-anchor="middle" font-size="17" class="mv1-m">752</text>
<text x="447" y="122" text-anchor="middle" font-size="17" class="mv1-m">…</text>
<!-- xip[] 표시 점 -->
<circle cx="140" cy="136" r="4" fill="var(--accent, #d97706)"/>
<circle cx="270" cy="136" r="4" fill="var(--accent, #d97706)"/>
<!-- 구간 설명 -->
<rect x="20" y="180" width="22" height="22" rx="4" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/>
<text x="52" y="186" font-size="18" class="mv1-t">xmin(748) 미만: 모두 종료됨</text>
<text x="52" y="209" font-size="18" class="mv1-m">committed / aborted는 CLOG로 확인</text>
<rect x="20" y="236" width="22" height="22" rx="4" fill="var(--bg-warn, #fffbeb)" stroke="var(--accent, #d97706)"/>
<text x="52" y="242" font-size="18" class="mv1-t">748 ~ 751: 주황 점이 찍힌 748·750만</text>
<text x="52" y="265" font-size="18" class="mv1-m">아직 진행 중, 나머지는 이미 종료됨</text>
<rect x="20" y="281" width="22" height="22" rx="4" fill="var(--bg, #fafaf8)" stroke="var(--border, #e7e5e4)" stroke-dasharray="4 3"/>
<text x="52" y="298" font-size="18" class="mv1-t">xmax(752) 이상: 아직 시작하지 않은 미래</text>
</svg>
</div>

`pg_current_snapshot()` 함수로 현재 트랜잭션의 snapshot을 직접 볼 수 있습니다.

```sql
SELECT pg_current_snapshot();
```

| pg_current_snapshot |
|---------------------|
| 748:752:748,750 |

출력 형식은 `xmin:xmax:xip_list`입니다. 이 결과는 "748 미만은 모두 종료, 752 이상은 미래, 그 사이에서 748과 750이 아직 진행 중"이라고 읽습니다. xip 목록에 없는 749, 751 같은 xid는 이 구간에 있지만 이미 종료된 것입니다.

## 가시성 판정 규칙

이제 핵심에 들어갑니다. executor가 힙 페이지에서 튜플 하나를 집었을 때, **이 튜플이 현재 snapshot에서 보이는가?** 를 판정하는 규칙입니다. 내부적으로는 `HeapTupleSatisfiesMVCC`라는 함수가 이 일을 합니다.

전체 규칙은 여러 분기가 있지만, 핵심을 두 단계로 단순화할 수 있습니다.

### Step 1: t_xmin 검사 (이 튜플을 만든 트랜잭션이 보이는가?)

이 단계를 통과하지 못하면 튜플은 **존재 자체를 모르는 것**이 됩니다. INSERT가 아직 확정되지 않았으니까요.

- **xmin이 현재 자기 트랜잭션이면**: 보입니다. 자기가 INSERT한 건 자기 눈에 보여야 합니다. (단, 같은 트랜잭션 안에서도 현재 명령 이전에 INSERT된 것만 보입니다. 이 세부 판정에는 command id가 쓰입니다.)
- **xmin이 committed이고 snapshot 시점에서 과거이면**: 보입니다. 해당 INSERT가 확정되었고, snapshot을 찍기 전에 일어난 일이니까요.
- **xmin이 snapshot 기준으로 아직 진행 중이면**(xip[]에 들어 있거나 snapshot의 xmax 이상): 안 보입니다. INSERT가 아직 확정되지 않았으니까요.
- **xmin이 aborted이면**: 안 보입니다. 롤백된 INSERT이므로 처음부터 없었던 것으로 취급합니다. aborted 여부는 xip[]가 아니라 CLOG에서 확인합니다.

여기서 "committed인가 aborted인가"는 **CLOG**(`pg_xact`)에 기록되어 있습니다. 트랜잭션당 2비트로 in_progress / committed / aborted / sub_committed 네 가지 상태를 저장합니다. 하지만 매번 CLOG를 읽는 건 비쌉니다. 그래서 한 번 조회한 결과를 튜플 헤더의 `t_infomask`에 **hint bit**(`HEAP_XMIN_COMMITTED`, `HEAP_XMIN_INVALID` 등)로 캐싱합니다. 다음 세션이 같은 튜플을 보면 hint bit만 확인하고 CLOG는 안 읽어도 됩니다. 이때 페이지가 dirty로 마킹되면서, hint bit를 세팅한 것만으로도 이후 checkpoint에서 디스크에 쓰게 됩니다.

### Step 2: t_xmax 검사 (이 튜플을 죽인 트랜잭션이 유효한가?)

Step 1을 통과해서 "이 튜플이 생성된 건 보인다"까지 확인됐으면, 이제 "그 뒤에 누가 죽이지는 않았나?"를 봅니다.

- **t_infomask에 `HEAP_XMAX_INVALID` 플래그가 세팅되어 있으면**: 아무도 이 튜플을 건드리지 않았거나, 삭제를 시도한 트랜잭션이 abort되어 무효화됨. 이 튜플은 **살아 있음 → 보입니다**.
- **xmax가 committed이고 snapshot 시점에서 과거이면**: 삭제가 확정됨. 이 튜플은 **죽은 것 → 안 보입니다**.
- **xmax가 진행 중이면**(xip[]에 포함): 삭제가 아직 확정되지 않음. 이 튜플은 **아직 살아 있음 → 보입니다**.
- **xmax가 abort됨이면**: 삭제 시도가 무효화됨. 이때 `HEAP_XMAX_INVALID` hint bit가 세팅되어 이후 조회부터는 위의 첫 번째 분기(`HEAP_XMAX_INVALID`)로 빠집니다. **보입니다**.

두 단계를 위에서 아래로 이어 붙이면 판정 흐름 전체가 이렇게 됩니다. 초록 체크는 보임, 빨강 X는 안 보임입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 1004" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="튜플 가시성 판정 흐름도. Step 1에서 t_xmin을 검사해 현재 트랜잭션인지, committed 과거인지, aborted인지를 따지고, 통과한 튜플만 Step 2로 내려가 t_xmax의 네 가지 상태에 따라 보임 또는 안 보임을 결정합니다">
<defs>
<marker id="mv2Arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="var(--primary, #0d9488)"/></marker>
</defs>
<style>
.mv2-t { fill: var(--text, #1c1917); }
.mv2-m { fill: var(--text-muted, #78716c); }
.mv2-h { fill: var(--text, #1c1917); font-weight: 600; }
.mv2-ok { fill: var(--text-success, #16a34a); font-weight: 600; }
.mv2-no { fill: var(--text-danger, #dc2626); font-weight: 600; }
.mv2-go { fill: var(--primary, #0d9488); font-weight: 600; }
.mv2-card { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.mv2-bar { fill: var(--primary, #0d9488); }
.mv2-ck { fill: none; stroke: var(--text-success, #16a34a); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
.mv2-xx { fill: none; stroke: var(--text-danger, #dc2626); stroke-width: 2.8; stroke-linecap: round; }
.mv2-dn { fill: none; stroke: var(--primary, #0d9488); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
<!-- 시작 -->
<rect x="126" y="16" width="228" height="42" rx="21" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0d9488)"/>
<text x="240" y="44" text-anchor="middle" font-size="19" class="mv2-t">튜플 하나를 집음</text>
<line x1="240" y1="60" x2="240" y2="86" stroke="var(--primary, #0d9488)" stroke-width="2" marker-end="url(#mv2Arrow)"/>
<!-- Step 1 헤더 -->
<text x="18" y="110" font-size="19" class="mv2-h">Step 1. t_xmin 검사</text>
<text x="18" y="132" font-size="17" class="mv2-m">이 튜플을 만든 트랜잭션이 보이는가?</text>
<!-- 분기 1-1 -->
<rect x="18" y="146" width="444" height="112" rx="8" class="mv2-card"/>
<rect x="18" y="146" width="5" height="112" rx="2.5" class="mv2-bar"/>
<text x="38" y="173" font-size="18" class="mv2-t">t_xmin이 현재 트랜잭션인가?</text>
<rect x="32" y="189" width="418" height="26" rx="6" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-opacity="0.4"/>
<path class="mv2-ck" d="M-6,0.5 L-2,4.5 L6,-4.5" transform="translate(46,201)"/>
<text x="64" y="207" font-size="18" class="mv2-ok">현재 명령 이전에 INSERT → 보임</text>
<rect x="32" y="219" width="418" height="26" rx="6" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)" stroke-opacity="0.4"/>
<path class="mv2-xx" d="M-5,-5 L5,5 M5,-5 L-5,5" transform="translate(46,231)"/>
<text x="64" y="237" font-size="18" class="mv2-no">현재 명령 이후에 INSERT → 안 보임</text>
<!-- 분기 1-2 -->
<rect x="18" y="272" width="444" height="134" rx="8" class="mv2-card"/>
<rect x="18" y="272" width="5" height="134" rx="2.5" class="mv2-bar"/>
<text x="38" y="299" font-size="18" class="mv2-t">t_xmin이 committed이고</text>
<text x="38" y="321" font-size="18" class="mv2-t">snapshot 기준 과거인가?</text>
<rect x="32" y="337" width="418" height="26" rx="6" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0d9488)" stroke-opacity="0.4"/>
<path class="mv2-dn" d="M-5,-4 L0,3 L5,-4" transform="translate(46,349)"/>
<text x="64" y="355" font-size="18" class="mv2-go">예 → Step 2로 내려감</text>
<rect x="32" y="367" width="418" height="26" rx="6" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)" stroke-opacity="0.4"/>
<path class="mv2-xx" d="M-5,-5 L5,5 M5,-5 L-5,5" transform="translate(46,379)"/>
<text x="64" y="385" font-size="18" class="mv2-no">아니오(진행 중·미래) → 안 보임</text>
<!-- 분기 1-3 -->
<rect x="18" y="420" width="444" height="82" rx="8" class="mv2-card"/>
<rect x="18" y="420" width="5" height="82" rx="2.5" class="mv2-bar"/>
<text x="38" y="447" font-size="18" class="mv2-t">t_xmin이 aborted인가?</text>
<rect x="32" y="463" width="418" height="26" rx="6" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)" stroke-opacity="0.4"/>
<path class="mv2-xx" d="M-5,-5 L5,5 M5,-5 L-5,5" transform="translate(46,475)"/>
<text x="64" y="481" font-size="18" class="mv2-no">안 보임 (INSERT가 롤백됨)</text>
<!-- Step 2 헤더 -->
<line x1="240" y1="510" x2="240" y2="532" stroke="var(--primary, #0d9488)" stroke-width="2" marker-end="url(#mv2Arrow)"/>
<text x="18" y="558" font-size="19" class="mv2-h">Step 2. t_xmax 검사</text>
<text x="18" y="580" font-size="17" class="mv2-m">이 튜플을 죽인 트랜잭션이 유효한가?</text>
<!-- 분기 2-1 -->
<rect x="18" y="594" width="444" height="82" rx="8" class="mv2-card"/>
<rect x="18" y="594" width="5" height="82" rx="2.5" class="mv2-bar"/>
<text x="38" y="621" font-size="18" class="mv2-t">t_infomask에 HEAP_XMAX_INVALID</text>
<rect x="32" y="637" width="418" height="26" rx="6" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-opacity="0.4"/>
<path class="mv2-ck" d="M-6,0.5 L-2,4.5 L6,-4.5" transform="translate(46,649)"/>
<text x="64" y="655" font-size="18" class="mv2-ok">보임 (아무도 죽이지 않음)</text>
<!-- 분기 2-2 -->
<rect x="18" y="690" width="444" height="82" rx="8" class="mv2-card"/>
<rect x="18" y="690" width="5" height="82" rx="2.5" class="mv2-bar"/>
<text x="38" y="717" font-size="18" class="mv2-t">xmax가 committed이고 과거</text>
<rect x="32" y="733" width="418" height="26" rx="6" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)" stroke-opacity="0.4"/>
<path class="mv2-xx" d="M-5,-5 L5,5 M5,-5 L-5,5" transform="translate(46,745)"/>
<text x="64" y="751" font-size="18" class="mv2-no">안 보임 (삭제 확정)</text>
<!-- 분기 2-3 -->
<rect x="18" y="786" width="444" height="82" rx="8" class="mv2-card"/>
<rect x="18" y="786" width="5" height="82" rx="2.5" class="mv2-bar"/>
<text x="38" y="813" font-size="18" class="mv2-t">xmax가 아직 진행 중</text>
<rect x="32" y="829" width="418" height="26" rx="6" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-opacity="0.4"/>
<path class="mv2-ck" d="M-6,0.5 L-2,4.5 L6,-4.5" transform="translate(46,841)"/>
<text x="64" y="847" font-size="18" class="mv2-ok">보임 (삭제가 아직 미확정)</text>
<!-- 분기 2-4 -->
<rect x="18" y="882" width="444" height="106" rx="8" class="mv2-card"/>
<rect x="18" y="882" width="5" height="106" rx="2.5" class="mv2-bar"/>
<text x="38" y="909" font-size="18" class="mv2-t">xmax가 aborted</text>
<rect x="32" y="925" width="418" height="26" rx="6" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-opacity="0.4"/>
<path class="mv2-ck" d="M-6,0.5 L-2,4.5 L6,-4.5" transform="translate(46,937)"/>
<text x="64" y="943" font-size="18" class="mv2-ok">보임 (삭제 시도가 무효화됨)</text>
<text x="38" y="969" font-size="17" class="mv2-m">이후 HEAP_XMAX_INVALID로 캐싱됨</text>
</svg>
</div>

### 도입부 시나리오를 손으로 풀어보기

이 규칙을 처음에 만든 시나리오에 대입해봅시다.

**상황**: `accounts` 테이블, id=1, balance=1000인 원래 튜플이 있습니다. Session A가 Repeatable Read로 트랜잭션을 시작하면서 snapshot을 찍었고, 그 후 Session B가 balance를 2000으로 UPDATE하고 커밋했습니다.

페이지 안에는 이제 **두 개의 튜플**이 존재합니다.

| 튜플 | t_xmin | t_xmax | balance | 상태 |
|------|--------|--------|---------|------|
| 구 버전 | 740 (원래 INSERT) | 749 (Session B의 UPDATE) | 1000 | xmax=749, committed |
| 신 버전 | 749 (Session B의 INSERT) | 0 (HEAP_XMAX_INVALID) | 2000 | xmin=749, committed |

Session A의 snapshot이 `743:749:743` (xmin=743, xmax=749, 아직 진행 중인 트랜잭션은 743 하나)이라고 가정합니다. Session A가 이 트랜잭션을 시작한 시점에 xid 749는 아직 할당되지 않았으므로 xmax=749입니다.

**구 버전**(balance=1000)에 대해:
- Step 1: t_xmin=740. committed이고 snapshot의 xmin(743)보다 작으므로 과거. 통과.
- Step 2: t_xmax=749. snapshot의 xmax(749)와 같으므로 "미래"에 해당. 삭제가 아직 일어나지 않은 것으로 판정. → **보입니다.**

**신 버전**(balance=2000)에 대해:
- Step 1: t_xmin=749. snapshot의 xmax(749)와 같으므로 "미래" 트랜잭션이 만든 것. → **안 보입니다.**

결과: Session A에는 balance=1000만 보입니다. Session B가 커밋을 마쳤더라도, Session A의 snapshot에서는 xid 749가 "존재하지 않는 미래"이기 때문입니다.

## Read Committed vs Repeatable Read

위 시나리오에서 Session A가 Read Committed였다면 결과가 달라집니다. 차이는 단 하나입니다. **snapshot을 언제 새로 찍느냐.**

| 격리 수준 | snapshot 획득 시점 |
|-----------|-------------------|
| Read Committed | 매 SQL 문장(statement)마다 새 snapshot 획득 |
| Repeatable Read | 트랜잭션의 첫 번째 비트랜잭션제어 문(non-transaction-control statement) 실행 시 한 번만 획득하고 끝까지 재사용 |
| Serializable | Repeatable Read와 같은 snapshot + SSI(Serializable Snapshot Isolation) predicate locking 추가 |

Read Committed에서 Session A가 두 번째 `SELECT`를 실행하면, 그 시점에 새 snapshot을 찍습니다. 이 새 snapshot에서는 Session B의 xid 749가 이미 committed 과거이므로, 신 버전(balance=2000)의 t_xmin이 통과하고 구 버전의 t_xmax가 "죽음 확정"으로 판정됩니다. 결과는 2000.

Repeatable Read에서는 처음 `SELECT` 때 찍은 snapshot을 그대로 들고 있으므로, 두 번째 `SELECT`에서도 같은 판정이 나옵니다. 결과는 1000.

이걸 실험으로 직접 확인해봅시다.

```sql
-- Session A (Read Committed, 기본값)
BEGIN;
SELECT balance FROM accounts WHERE id = 1;
```

| balance |
|---------|
| 1000 |

```sql
-- Session B (별도 터미널)
UPDATE accounts SET balance = 3000 WHERE id = 1;
```

```sql
-- Session A
SELECT balance FROM accounts WHERE id = 1;
```

| balance |
|---------|
| 3000 |

Read Committed에서는 Session B의 커밋이 즉시 반영됩니다. 같은 트랜잭션 안인데 값이 바뀌었습니다. 이걸 **non-repeatable read**라고 부르고, Read Committed에서는 정상 동작입니다.

Repeatable Read에서는 같은 실험을 해도 Session A의 두 번째 SELECT가 원래 값을 돌려줍니다. "repeatable"하다는 이름 그대로입니다. 다만 Repeatable Read에서 Session A가 같은 row를 UPDATE하려고 하면 **serialization failure 에러**(`ERROR: could not serialize access due to concurrent update`)가 발생할 수 있습니다. 이건 snapshot에서 보이는 버전과 실제 최신 버전이 다르기 때문이고, 이 에러가 나면 애플리케이션이 트랜잭션을 재시도해야 합니다.

Serializable 격리 수준은 Repeatable Read의 snapshot에 SSI(Serializable Snapshot Isolation)라는 predicate locking 메커니즘을 추가한 것입니다. 단순히 "같은 row"뿐 아니라 "같은 조건의 범위 쿼리"까지 감시해서 직렬화 이상(serialization anomaly)을 탐지합니다. 이 메커니즘의 상세는 격리 수준과 락을 다루는 별도 글에서 본격적으로 들어갑니다.

## xid Wraparound와 Freeze

xid가 32비트이므로 전체 공간은 약 42.9억입니다. modular arithmetic으로 과거/미래를 구분하기 때문에 실제로 사용 가능한 "과거" 범위는 약 21억(2^31)입니다. write가 잦은 서비스에서 하루에 수백만\~수천만 xid를 소비한다면, 수백 일이면 21억에 도달합니다.

그 시점에 아무런 조치가 없으면 **wraparound**가 일어납니다. 과거에 committed된 트랜잭션의 xid가 modular arithmetic 상 "미래"로 뒤집어지면서, 해당 트랜잭션이 만든 모든 튜플이 갑자기 안 보이게 됩니다. 데이터가 실제로 사라지는 건 아니지만, 가시성 판정에서 "미래의 트랜잭션이 만든 것"으로 분류되면 SELECT 결과에 나오지 않습니다. 사실상의 데이터 유실입니다.

이걸 막기 위해 PostgreSQL은 **freeze**라는 메커니즘을 사용합니다. VACUUM이 충분히 오래된 튜플을 찾으면, 그 튜플의 `t_infomask`에 `HEAP_XMIN_FROZEN` 비트를 세팅합니다. 이 비트가 세팅된 튜플은 xmin 값과 무관하게 "영원히 과거, 항상 보임"으로 판정됩니다. 원래의 xmin 값은 지워지지 않고 보존되므로, 디버깅용으로 여전히 조회할 수 있습니다.

freeze가 제때 일어나지 않으면 PostgreSQL은 방어 장치를 작동시킵니다. `autovacuum_freeze_max_age` 파라미터(기본값 2억)는 "테이블의 relfrozenxid가 현재 xid에서 이 값 이상 뒤처지면 anti-wraparound VACUUM을 강제 발동한다"는 임계치입니다. 심지어 autovacuum이 꺼져 있어도 이 임계치에 도달하면 강제로 VACUUM이 실행됩니다. 그래도 VACUUM이 진행되지 못하면(idle in transaction이 xmin horizon을 잡고 있거나, replication slot의 xmin/catalog_xmin이 xmin horizon을 고정하여 오래된 튜플 정리를 막고 있거나) PostgreSQL은 더 이상의 write를 거부하고 서버가 read-only 모드로 전환됩니다. 이 상태가 되면 수동으로 `VACUUM FREEZE`를 돌릴 수밖에 없습니다.

### freeze 상태 모니터링

현재 테이블들의 freeze 진행 상태는 `pg_class.relfrozenxid`로 확인합니다. 이 값은 "이 테이블에서 freeze되지 않은 가장 오래된 xid"를 의미하고, `age()` 함수로 현재 xid와의 거리를 볼 수 있습니다.

```sql
SELECT relname,
       age(relfrozenxid) AS xid_age,
       pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
ORDER BY age(relfrozenxid) DESC
LIMIT 5;
```

| relname | xid_age | size |
|---------|---------|------|
| accounts | 15 | 8192 bytes |
| users | 12 | 8192 bytes |
| hot_demo | 8 | 8192 bytes |

`xid_age`가 `autovacuum_freeze_max_age`(기본 2억)에 가까워지면 위험 신호입니다. 운영 환경에서는 이 값이 1억을 넘어가기 시작하면 autovacuum이 정상 동작하고 있는지, xmin horizon을 잡고 있는 long-running 트랜잭션이 없는지 확인해야 합니다.

데이터베이스 전체의 freeze 상태는 `pg_database.datfrozenxid`로 볼 수 있습니다. 이 값은 해당 DB 내 모든 테이블의 relfrozenxid 중 가장 오래된 값입니다.

```sql
SELECT datname, age(datfrozenxid) AS db_xid_age
FROM pg_database
ORDER BY age(datfrozenxid) DESC;
```

| datname | db_xid_age |
|---------|------------|
| postgres | 15 |
| template1 | 15 |
| template0 | 15 |

## 마치며

이 글에서 따라간 흐름은 이렇습니다. 트랜잭션마다 xid가 붙고, snapshot이 "세상의 사진"을 찍고, 튜플의 xmin/xmax를 그 사진과 대조해서 보임/안 보임을 판정합니다. 격리 수준의 차이는 결국 이 사진을 언제 새로 찍느냐의 차이이고, xid가 32비트 한계에 가까워지면 freeze로 오래된 튜플을 "영원히 과거"로 못 박아서 wraparound를 방지합니다.

여기까지가 Phase 1(Storage & Architecture)이었습니다. 다음 글부터는 "보이느냐 안 보이느냐"가 아니라 "어떻게 빨리 찾느냐"로 넘어갑니다. B-tree 인덱스의 내부 구조, leaf page의 doubly-linked list, index-only scan이 왜 visibility map에 의존하는지를 따라갑니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 13. Concurrency Control](https://www.postgresql.org/docs/18/mvcc.html)
- [Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html): Read Committed, Repeatable Read, Serializable의 공식 정의
- [Routine Vacuuming](https://www.postgresql.org/docs/18/routine-vacuuming.html): freeze, wraparound, autovacuum_freeze_max_age 설명
- [pg_current_snapshot(), pg_current_xact_id()](https://www.postgresql.org/docs/18/functions-info.html): snapshot/xid 조회 함수
- Hironobu Suzuki, *The Internals of PostgreSQL*, [Chapter 5: Concurrency Control](https://www.interdb.jp/pg/pgsql05.html)
- `src/backend/access/heap/heapam_visibility.c`: HeapTupleSatisfiesMVCC 구현 (소스 레벨 참고)
