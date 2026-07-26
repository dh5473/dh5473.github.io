---
date: '2026-05-19'
title: '백그라운드 머지와 뮤테이션: 불변 Part는 어떻게 관리되는가'
category: 'Database'
series: 'clickhouse'
seriesOrder: 3
tags: ['ClickHouse', 'MergeTree', 'Merge', 'Mutation', 'Part Lifecycle']
summary: 'INSERT마다 쌓이는 불변 Part를 백그라운드 머지가 어떻게 합치는지, 불변 Part 위에서 UPDATE/DELETE가 어떻게 구현되는지를 Part 생명주기와 뮤테이션 메커니즘으로 설명합니다.'
thumbnail: './thumbnail.png'
---

MergeTree는 INSERT 한 번에 [Part](/clickhouse/mergetree-internals/) 하나를 만듭니다. Part 이름 `all_1_1_0`의 마지막 자리는 머지 레벨이고, INSERT 직후의 Part는 아직 한 번도 머지되지 않았으므로 `0`입니다. 그래서 INSERT를 세 번 실행하면 `all_1_1_0`, `all_2_2_0`, `all_3_3_0` 세 개가 생깁니다. 그런데 `system.parts`를 몇 초 뒤에 다시 조회하면, 세 Part가 사라지고 `all_1_3_1` 하나만 남아 있습니다. 무슨 일이 일어난 걸까요?

한 가지 더. Part는 불변(immutable)입니다. 한번 디스크에 쓰이면 절대 수정되지 않습니다. 그렇다면 `ALTER TABLE orders UPDATE price = 0 WHERE order_id = 42`는 어떻게 동작할까요? 불변인 데이터를 어떻게 "수정"하는 걸까요?

<br>

이 글에서는 불변 Part를 관리하는 두 가지 메커니즘을 다룹니다. Part를 합치는 **백그라운드 머지**와, 불변 Part 위에서 변경을 구현하는 **뮤테이션(Mutation)**입니다.

## 왜 불변 Part인가: 설계 동기

PostgreSQL은 8KB 페이지 안에서 행을 직접 수정합니다(in-place update). UPDATE 하나에도 WAL 기록, 행 잠금, MVCC 버전 관리가 따라옵니다. 단건 트랜잭션 위주의 OLTP에서는 합리적인 설계지만, 초당 수십만 행을 쏟아붓는 OLAP 쓰기 패턴에서는 이 오버헤드가 심각한 병목이 됩니다.

MergeTree는 정반대의 선택을 합니다. INSERT가 들어오면 데이터를 `ORDER BY` 순서로 정렬해서 새로운 Part를 디스크에 **순차 쓰기(sequential write)**합니다. 기존 Part는 건드리지 않습니다. 락도 없고, 랜덤 I/O도 없습니다. 쓰기 처리량이 디스크 순차 대역폭에 비례해서 선형으로 스케일합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 500" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 RDB의 in-place update로 페이지 안에서 행을 직접 수정하며 락과 WAL, 랜덤 I/O가 따르는 구조. 아래쪽은 MergeTree의 append 방식으로 INSERT마다 불변 Part가 새로 생기고 백그라운드 머지가 이들을 하나로 합치는 구조.">
<style>.ch3a-h{font-size:21px;font-weight:700;fill:var(--text, #1c1917)}.ch3a-t{font-size:20px;fill:var(--text, #1c1917)}.ch3a-s{font-size:18px;fill:var(--text-muted, #78716c)}.ch3a-p{font-size:19px;fill:var(--primary, #0d9488)}.ch3a-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.ch3a-hi{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0d9488);stroke-width:2}.ch3a-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="ch3aArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- 위 패널: RDB -->
<text x="10" y="26" class="ch3a-h">위: RDB의 in-place update</text>
<text x="240" y="60" text-anchor="middle" class="ch3a-p">UPDATE</text>
<line x1="240" y1="70" x2="240" y2="86" class="ch3a-line" marker-end="url(#ch3aArrow)"/>
<rect x="120" y="92" width="240" height="60" rx="6" class="ch3a-box"/>
<text x="240" y="129" text-anchor="middle" class="ch3a-t">Page 안에서 직접 수정</text>
<text x="240" y="178" text-anchor="middle" class="ch3a-s">락 · WAL · 랜덤 I/O</text>
<line x1="10" y1="200" x2="470" y2="200" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<!-- 아래 패널: MergeTree -->
<text x="10" y="232" class="ch3a-h">아래: MergeTree의 append + merge</text>
<rect x="150" y="250" width="200" height="44" rx="6" class="ch3a-box"/>
<text x="250" y="279" text-anchor="middle" class="ch3a-t">Part A (불변)</text>
<text x="16" y="279" class="ch3a-s">INSERT 1</text>
<rect x="150" y="302" width="200" height="44" rx="6" class="ch3a-box"/>
<text x="250" y="331" text-anchor="middle" class="ch3a-t">Part B (불변)</text>
<text x="16" y="331" class="ch3a-s">INSERT 2</text>
<rect x="150" y="354" width="200" height="44" rx="6" class="ch3a-box"/>
<text x="250" y="383" text-anchor="middle" class="ch3a-t">Part C (불변)</text>
<text x="16" y="383" class="ch3a-s">INSERT 3</text>
<line x1="250" y1="404" x2="250" y2="432" class="ch3a-line" marker-end="url(#ch3aArrow)"/>
<text x="266" y="424" class="ch3a-p">백그라운드 머지</text>
<rect x="110" y="438" width="280" height="50" rx="6" class="ch3a-hi"/>
<text x="250" y="470" text-anchor="middle" class="ch3a-t">Part ABC (불변, 통합)</text>
</svg>
</div>

대신 읽기 비용이 생깁니다. Part가 여러 개 있으면 쿼리가 모든 Part를 확인해야 합니다. Part 10개에서 같은 `WHERE` 조건을 검색하려면, 각 Part의 `primary.idx`를 10번 탐색하고 해당 granule을 10번 읽어야 합니다.

이 읽기 비용을 줄이는 메커니즘이 **백그라운드 머지**입니다. 작은 Part 여러 개를 큰 Part 하나로 합쳐서, 쿼리가 확인해야 할 Part 수를 줄입니다. 쓰기 속도를 극대화하고, 읽기 비용은 머지로 점진적으로 상환하는 구조입니다. 이것이 MergeTree라는 이름의 핵심입니다.

## 백그라운드 머지

### 머지는 어떻게 동작하는가

ClickHouse는 백그라운드 스레드에서 주기적으로 Part 목록을 확인하고, 합칠 Part를 선택합니다. 선택된 Part들의 데이터를 `ORDER BY` 순서로 merge-sort하여 하나의 새 Part를 생성합니다.

[Part 이름](/clickhouse/mergetree-internals/) `all_1_1_0`은 `{파티션}_{min_block}_{max_block}_{level}` 형식입니다. 머지가 일어나면 이 이름이 어떻게 바뀌는지 봅시다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 464" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="머지 전 all_1_1_0, all_2_2_0, all_3_3_0 세 개의 level 0 Part가 백그라운드 머지를 거쳐 block 범위 1부터 3까지를 담은 level 1 Part인 all_1_3_1 하나로 합쳐지는 과정.">
<style>.ch3b-h{font-size:20px;fill:var(--text-muted, #78716c)}.ch3b-n{font-size:20px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.ch3b-m{font-size:18px;fill:var(--text-muted, #78716c)}.ch3b-p{font-size:19px;fill:var(--primary, #0d9488)}.ch3b-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.ch3b-hi{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0d9488);stroke-width:2}.ch3b-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="ch3bArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- 머지 전 -->
<text x="10" y="26" class="ch3b-h">머지 전</text>
<rect x="56" y="38" width="368" height="46" rx="6" class="ch3b-box"/>
<text x="76" y="68" class="ch3b-n">all_1_1_0</text>
<text x="404" y="68" text-anchor="end" class="ch3b-m">block 1~1, level 0</text>
<rect x="56" y="94" width="368" height="46" rx="6" class="ch3b-box"/>
<text x="76" y="124" class="ch3b-n">all_2_2_0</text>
<text x="404" y="124" text-anchor="end" class="ch3b-m">block 2~2, level 0</text>
<rect x="56" y="150" width="368" height="46" rx="6" class="ch3b-box"/>
<text x="76" y="180" class="ch3b-n">all_3_3_0</text>
<text x="404" y="180" text-anchor="end" class="ch3b-m">block 3~3, level 0</text>
<!-- 머지 -->
<text x="240" y="232" text-anchor="middle" class="ch3b-p">백그라운드 머지</text>
<line x1="240" y1="242" x2="240" y2="274" class="ch3b-line" marker-end="url(#ch3bArrow)"/>
<!-- 머지 후 -->
<text x="10" y="304" class="ch3b-h">머지 후</text>
<rect x="56" y="316" width="368" height="52" rx="6" class="ch3b-hi"/>
<text x="76" y="349" class="ch3b-n">all_1_3_1</text>
<text x="404" y="349" text-anchor="end" class="ch3b-m">block 1~3, level 1</text>
<!-- 이름 규칙 -->
<text x="240" y="398" text-anchor="middle" class="ch3b-m">min_block: 원본들의 최솟값 (1)</text>
<text x="240" y="422" text-anchor="middle" class="ch3b-m">max_block: 원본들의 최댓값 (3)</text>
<text x="240" y="446" text-anchor="middle" class="ch3b-m">level: 기존 최댓값 + 1 (1)</text>
</svg>
</div>

`level`은 원본들의 최댓값에 1을 더한 값이므로, level 0짜리 Part 세 개를 합치면 level 1이 됩니다. Part 이름만 봐도 "이 Part는 block 1부터 3까지를 한 번 머지한 결과"라는 이력을 읽을 수 있습니다.

머지가 완료되면 원본 Part 세 개는 **inactive** 상태로 전환됩니다. 새 Part가 이후의 모든 쿼리를 서빙하고, 원본은 일정 시간이 지나면 디스크에서 물리적으로 삭제됩니다.

핵심은 이 과정 전체가 **비차단(non-blocking)**이라는 점입니다. 머지가 진행되는 동안에도 원본 Part들은 쿼리에 정상적으로 응답합니다. 새 Part가 완성되면 메타데이터를 atomic하게 교체하여, 쿼리가 끊김 없이 새 Part로 전환됩니다.

### 파티션 경계와 머지 규칙

머지에는 절대적인 규칙이 하나 있습니다. **같은 파티션 안의 Part만 머지됩니다.** 서로 다른 파티션의 Part는 절대 합쳐지지 않습니다.

이 규칙 때문에 파티셔닝이 머지 효율에 직접적인 영향을 줍니다. 파티션을 너무 세밀하게 나누면 (예를 들어 일별 파티션에 INSERT가 시간당 한 번뿐이라면) 각 파티션에 Part가 하나씩만 존재해서 머지할 대상 자체가 없습니다. Part 수가 줄어들지 않고 계속 쌓이기만 합니다.

:::warning

**주의**

파티션 수가 많을수록 머지 효율이 떨어집니다. 파티셔닝은 "오래된 데이터를 통째로 DROP하기 위한 도구"이지, 쿼리 성능을 위한 도구가 아닙니다.

:::

머지 스케줄러가 어떤 Part를 선택하는가도 중요합니다. ClickHouse의 머지 알고리즘은 Part 크기, 개수, 총 재작성 비용 등을 종합적으로 고려하여 최적의 Part 조합을 선택합니다. 일반적으로 작은 Part가 먼저 머지되는 경향이 있는데, 비용 대비 Part 수 감소 효과가 크기 때문입니다. 이미 큰 Part는 머지 비용이 높아 나중에 처리됩니다.

### Part 생명주기

Part는 생성부터 삭제까지 세 단계를 거칩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 434" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Part 생명주기 3단계. INSERT로 Active 상태가 되어 쿼리에 응답하고, 머지가 완료되면 Inactive로 전환되어 디스크에 남아 있다가, old_parts_lifetime 기본 480초가 지나면 디스크에서 물리적으로 삭제된다.">
<style>.ch3c-n{font-size:21px;font-weight:700}.ch3c-s{font-size:18px;fill:var(--text-muted, #78716c)}.ch3c-p{font-size:19px;fill:var(--primary, #0d9488)}.ch3c-l{font-size:18px;fill:var(--text-muted, #78716c)}.ch3c-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="ch3cArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- INSERT -->
<text x="240" y="28" text-anchor="middle" class="ch3c-p">INSERT</text>
<line x1="240" y1="38" x2="240" y2="62" class="ch3c-line" marker-end="url(#ch3cArrow)"/>
<!-- Active -->
<rect x="90" y="68" width="300" height="72" rx="8" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-width="2"/>
<text x="240" y="100" text-anchor="middle" class="ch3c-n" fill="var(--text-success, #16a34a)">Active</text>
<text x="240" y="126" text-anchor="middle" class="ch3c-s">active = 1, 쿼리에 응답</text>
<!-- 머지 완료 -->
<line x1="240" y1="144" x2="240" y2="190" class="ch3c-line" marker-end="url(#ch3cArrow)"/>
<text x="254" y="173" class="ch3c-l">머지 완료</text>
<!-- Inactive -->
<rect x="90" y="196" width="300" height="94" rx="8" fill="var(--bg-warn, #fffbeb)" stroke="var(--text-warn, #d97706)" stroke-width="2"/>
<text x="240" y="228" text-anchor="middle" class="ch3c-n" fill="var(--text-warn, #d97706)">Inactive</text>
<text x="240" y="254" text-anchor="middle" class="ch3c-s">active = 0, 디스크에 잔존</text>
<text x="240" y="278" text-anchor="middle" class="ch3c-s">장애 복구 · 실행 중 쿼리 대비</text>
<!-- 수명 경과 -->
<line x1="240" y1="294" x2="240" y2="344" class="ch3c-line" marker-end="url(#ch3cArrow)"/>
<text x="254" y="314" class="ch3c-l">old_parts_lifetime</text>
<text x="254" y="336" class="ch3c-l">기본 480초 경과</text>
<!-- 물리 삭제 -->
<rect x="90" y="350" width="300" height="72" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="2" stroke-dasharray="6 4"/>
<text x="240" y="382" text-anchor="middle" class="ch3c-n" fill="var(--text-muted, #78716c)">물리 삭제</text>
<text x="240" y="408" text-anchor="middle" class="ch3c-s">디스크에서 완전히 제거</text>
</svg>
</div>

**Active**: INSERT로 생성된 직후부터 쿼리에 응답하는 상태입니다. `system.parts`에서 `active = 1`로 표시됩니다.

**Inactive**: 머지가 완료되어 새 Part로 대체된 상태입니다. `active = 0`이지만 디스크에는 남아 있습니다. 왜 바로 삭제하지 않을까요? 가장 큰 이유는 장애 복구입니다. 머지 직후 서버가 비정상 종료되어 새 Part가 손상되면, inactive 상태의 원본 Part로 복원할 수 있습니다. 또한 머지 직전에 시작된 쿼리가 아직 원본을 읽고 있을 수도 있습니다.

**물리 삭제**: `old_parts_lifetime`(기본 480초, 8분)이 지나면 inactive Part가 디스크에서 완전히 제거됩니다. `system.parts`에서도 사라집니다.

`system.parts`의 `modification_time`은 Part가 생성된 시각, `remove_time`은 inactive로 전환된 시각입니다. 두 시각의 차이가 Part의 active 수명입니다.

### 머지가 디스크에 미치는 영향

머지가 진행되는 동안 원본 Part와 새 Part가 동시에 디스크에 존재합니다. 10GB Part 세 개를 머지하면, 완료 시점에 원본 30GB + 신규 30GB = 총 60GB가 디스크를 차지합니다. 원본이 삭제되기까지 8분간 이 상태가 유지됩니다.

대규모 테이블에서 여러 머지가 동시에 진행되면 디스크 사용량이 급증할 수 있습니다. 디스크 여유 공간이 부족하면 머지가 실패하고, Part 수가 줄지 않아 읽기 성능이 저하되는 악순환에 빠집니다. `system.merges`에서 진행 중인 머지를 모니터링하는 것이 중요한 이유입니다.

## 뮤테이션: 불변 Part 위의 변경

### ALTER TABLE UPDATE / DELETE

RDB에서 `UPDATE`와 `DELETE`는 가장 기본적인 연산이지만, ClickHouse에서는 **뮤테이션(Mutation)**이라는 특별한 메커니즘으로 처리됩니다.

```sql
-- 뮤테이션: Part를 통째로 재작성
ALTER TABLE orders UPDATE price = 0 WHERE category = '전자제품';
ALTER TABLE orders DELETE WHERE order_id < 100;
```

이 명령이 실행되면 ClickHouse는 조건에 매칭될 수 있는 **모든 Part를 통째로 재작성**합니다. Part 안의 데이터를 처음부터 끝까지 읽으면서 조건에 맞는 행을 수정(또는 제거)한 새 Part를 생성하고, 원본 Part를 inactive로 전환합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 470" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="뮤테이션 처리 과정. ALTER TABLE UPDATE가 실행되면 원본 Part all_1_3_1 전체를 처음부터 끝까지 읽어 조건에 맞는 행을 바꾼 새 Part all_1_3_1_4를 기록하고, 원본은 inactive로 전환된다.">
<style>.ch3d-c{font-size:18px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.ch3d-n{font-size:19px;fill:var(--text, #1c1917);font-family:"JetBrains Mono",monospace}.ch3d-t{font-size:19px;fill:var(--text, #1c1917)}.ch3d-s{font-size:18px;fill:var(--text-muted, #78716c)}.ch3d-line{stroke:var(--text-muted, #78716c);stroke-width:2;fill:none}</style>
<defs>
<marker id="ch3dArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #78716c)"/>
</marker>
</defs>
<!-- 명령 -->
<text x="240" y="24" text-anchor="middle" class="ch3d-c">ALTER TABLE orders UPDATE price = 0</text>
<text x="240" y="48" text-anchor="middle" class="ch3d-c">WHERE category = '전자제품'</text>
<!-- 원본 Part -->
<rect x="80" y="66" width="320" height="66" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="240" y="96" text-anchor="middle" class="ch3d-n">all_1_3_1</text>
<text x="240" y="120" text-anchor="middle" class="ch3d-s">원본 Part · 1,000만 행</text>
<line x1="240" y1="136" x2="240" y2="158" class="ch3d-line" marker-end="url(#ch3dArrow)"/>
<!-- 재작성 -->
<rect x="50" y="164" width="380" height="76" rx="8" fill="var(--bg-muted, #eeecea)" stroke="var(--primary, #0d9488)" stroke-width="2" stroke-dasharray="6 4"/>
<text x="240" y="194" text-anchor="middle" class="ch3d-t">Part 전체를 처음부터 끝까지 읽기</text>
<text x="240" y="220" text-anchor="middle" class="ch3d-t">조건에 맞는 행을 바꿔 새 Part 기록</text>
<line x1="240" y1="244" x2="240" y2="266" class="ch3d-line" marker-end="url(#ch3dArrow)"/>
<!-- 결과 -->
<rect x="50" y="272" width="380" height="140" rx="8" fill="none" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<rect x="68" y="288" width="344" height="52" rx="6" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #16a34a)" stroke-width="2"/>
<text x="88" y="321" class="ch3d-n">all_1_3_1_4</text>
<text x="392" y="321" text-anchor="end" class="ch3d-s">active = 1</text>
<rect x="68" y="348" width="344" height="52" rx="6" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #dc2626)" stroke-width="2"/>
<text x="88" y="381" class="ch3d-n">all_1_3_1</text>
<text x="392" y="381" text-anchor="end" class="ch3d-s">inactive 전환</text>
<!-- 캡션 -->
<text x="240" y="446" text-anchor="middle" class="ch3d-s">1행만 바꿔도 Part 전체가 재작성됩니다</text>
</svg>
</div>

1행만 수정해도 Part 전체(수백만 행)를 재작성합니다. 이것이 ClickHouse에서 뮤테이션이 "무거운 연산"인 이유입니다. 불변 Part를 "수정"하는 유일한 방법이 새 복사본을 만드는 것이기 때문입니다.

뮤테이션은 기본적으로 **비동기**입니다. `ALTER TABLE` 명령은 즉시 반환되고, 실제 Part 재작성은 백그라운드에서 진행됩니다. 진행 상태는 `system.mutations` 테이블에서 추적합니다.

```sql
SELECT
    command,
    is_done,
    parts_to_do,
    latest_fail_reason
FROM system.mutations
WHERE table = 'orders';
```

`is_done = 1`이면 완료, `parts_to_do`가 0이 아니면 아직 처리할 Part가 남아 있다는 뜻입니다. 완료를 기다려야 하는 상황이라면 `SETTINGS mutations_sync = 1`을 추가하면 됩니다.

```sql
ALTER TABLE orders
UPDATE price = 0
WHERE category = '전자제품'
SETTINGS mutations_sync = 1;  -- 완료까지 대기
```

### Lightweight DELETE: 더 가벼운 삭제

ALTER TABLE DELETE가 Part를 통째로 재작성한다면, `DELETE FROM`은 훨씬 가볍습니다.

```sql
-- Lightweight DELETE
DELETE FROM orders WHERE order_id < 100;
```

Lightweight DELETE는 모든 컬럼 파일을 재작성하지 않습니다. 내부적으로 `ALTER TABLE UPDATE _row_exists = 0 WHERE ...` 형태의 뮤테이션으로 변환됩니다. Wide Part의 경우 `_row_exists` 컬럼 파일만 새로 쓰고, 나머지 컬럼 파일은 **hardlink**로 연결하여 새 Part를 만듭니다. 전체 컬럼을 다시 쓰는 ALTER TABLE DELETE에 비해 I/O가 극적으로 줄어듭니다.

이후 SELECT 쿼리는 자동으로 `PREWHERE _row_exists` 조건이 추가되어, 삭제 표시된 행을 건너뜁니다. 실제 물리적 제거는 다음 백그라운드 머지 때 일어납니다.

| 특성 | ALTER TABLE DELETE | DELETE FROM (Lightweight) |
|------|-------------------|--------------------------|
| Part 재작성 | 전체 컬럼 파일 재작성 | `_row_exists`만 재작성 + hardlink |
| 실행 속도 | 느림 (Part 크기에 비례) | 빠름 |
| 디스크 I/O | 무거움 | 가벼움 |
| 데이터 물리 제거 시점 | 뮤테이션 완료 시 (새 Part) | 다음 머지 시 |
| 쿼리 오버헤드 | 없음 | `_row_exists` 마스크 체크 |
| 주 용도 | 대량 일괄 삭제 | 선택적 행 삭제 |

:::info

**참고**

Lightweight DELETE도 내부적으로는 뮤테이션의 일종이고, 새 Part를 생성합니다. 다만 Wide Part에서는 `_row_exists` 컬럼만 실제로 쓰고 나머지는 hardlink이므로 I/O가 최소화됩니다. Compact Part(기본 10MiB 미만)에서는 모든 컬럼이 하나의 파일에 있어서 전체 재작성이 발생합니다.

:::

대량 삭제가 필요한 경우에는 두 방법 모두 비효율적입니다. 오래된 데이터를 주기적으로 정리하는 패턴이라면, 파티션 단위로 `ALTER TABLE DROP PARTITION`을 사용하는 것이 가장 빠릅니다.

### 뮤테이션의 한계와 올바른 사용법

RDB에서 UPDATE는 일상적인 연산입니다. 주문 상태를 변경하고, 사용자 프로필을 수정하고, 재고를 차감합니다. ClickHouse에서 뮤테이션은 그런 용도가 아닙니다. **잘못 들어간 데이터를 일괄 수정하거나, 규정 준수를 위해 개인정보를 삭제하는 등 비상 조치에 가깝습니다.**

만약 "사용자가 주문을 취소하면 상태를 변경해야 한다"거나 "같은 키의 데이터가 중복으로 들어올 수 있다"는 요구사항이 있다면, 뮤테이션으로 해결하려 하면 안 됩니다. 이것은 스키마 설계의 문제입니다.

기본 MergeTree는 머지할 때 Part의 데이터를 그대로 합칩니다. 중복을 제거하지도, 값을 집계하지도 않습니다. 이 한계를 해결하기 위해 설계된 것이 **MergeTree 계열 엔진**들입니다. ReplacingMergeTree는 같은 키의 중복을 머지 시점에 제거하고, CollapsingMergeTree는 상태 변경을 +1/-1 쌍으로 상쇄합니다. 다음 글에서 이 엔진들이 머지 과정에서 어떤 추가 로직을 수행하는지 다룹니다.

## 실험: Docker로 직접 확인하기

[이전 글](/clickhouse/mergetree-internals/)의 Docker 환경(`ch-test` 컨테이너)을 그대로 사용합니다. 컨테이너가 없다면 [첫 번째 글](/clickhouse/why-clickhouse/)의 Docker 실험 섹션을 참고하세요.

### 머지 과정 관찰

머지를 직접 관찰하려면 Part가 여러 개 존재해야 합니다. 기존 `orders` 테이블을 삭제하고, 세 번 나눠서 INSERT합니다.

```sql
DROP TABLE IF EXISTS orders;

CREATE TABLE orders
(
    order_id    UInt64,
    user_id     UInt32,
    price       UInt32,
    category    LowCardinality(String),
    created_at  DateTime
)
ENGINE = MergeTree()
ORDER BY (category, created_at);
```

```sql
-- 3번 나눠서 INSERT → Part 3개 생성
INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(3000000);

INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(3000000, 3000000);

INSERT INTO orders
SELECT number, rand() % 100000, 5000 + (rand() % 195000),
       arrayElement(['전자제품','도서','의류','식품','스포츠','가구','화장품','완구'], (rand()%8)+1),
       toDateTime('2025-01-01') + toIntervalSecond(rand() % (86400*365))
FROM numbers(6000000, 4000000);
```

INSERT 직후 `system.parts`를 조회하면 세 개의 Part를 확인할 수 있습니다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size,
    modification_time
FROM system.parts
WHERE table = 'orders'
ORDER BY name;
```

```text
┌─name──────┬─active─┬────rows─┬─size───────┬─modification_time───┐
│ all_1_1_0 │      1 │ 3000000 │ 33.38 MiB  │ 2026-05-19 12:00:01 │
│ all_2_2_0 │      1 │ 3000000 │ 33.37 MiB  │ 2026-05-19 12:00:03 │
│ all_3_3_0 │      1 │ 4000000 │ 44.48 MiB  │ 2026-05-19 12:00:05 │
└───────────┴────────┴─────────┴────────────┴─────────────────────┘
```

세 Part 모두 `active = 1`, level은 `0`입니다. 몇 초 후 다시 조회해봅시다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders'
ORDER BY active DESC, name;
```

```text
┌─name──────┬─active─┬─────rows─┬─size───────┐
│ all_1_3_1 │      1 │ 10000000 │ 111.05 MiB │
│ all_1_1_0 │      0 │  3000000 │ 33.38 MiB  │
│ all_2_2_0 │      0 │  3000000 │ 33.37 MiB  │
│ all_3_3_0 │      0 │  4000000 │ 44.48 MiB  │
└───────────┴────────┴──────────┴────────────┘
```

`all_1_3_1`이 새로 생겼고, 원본 세 Part는 `active = 0`이 되었습니다. block 범위가 `1_3`으로 합쳐지고 level이 `1`로 올라간 것을 확인할 수 있습니다. 8분 후 다시 조회하면 inactive Part들은 디스크에서 제거되어 `all_1_3_1`만 남습니다.

머지가 진행 중일 때 `system.merges`를 조회하면 진행 상태를 볼 수 있습니다.

```sql
SELECT
    table,
    result_part_name,
    progress,
    elapsed,
    num_parts,
    formatReadableSize(total_size_bytes_compressed) AS total_size,
    is_mutation
FROM system.merges
WHERE table = 'orders';
```

```text
┌─table──┬─result_part_name─┬─progress─┬─elapsed─┬─num_parts─┬─total_size─┬─is_mutation─┐
│ orders │ all_1_3_1        │     0.45 │    1.23 │         3 │ 111.23 MiB │           0 │
└────────┴──────────────────┴──────────┴─────────┴───────────┴────────────┴─────────────┘
```

`progress`는 0\~1 사이의 값(여기서는 45% 진행), `num_parts`는 머지에 참여하는 Part 수, `is_mutation`은 뮤테이션 여부(0이면 일반 머지)입니다. 머지가 빠르게 완료되면 이 쿼리가 빈 결과를 반환할 수도 있습니다.

### ALTER TABLE 뮤테이션 실험

머지가 완료된 상태에서 뮤테이션을 실행해봅시다. `전자제품` 카테고리의 price를 전부 0으로 변경합니다.

```sql
ALTER TABLE orders
UPDATE price = 0
WHERE category = '전자제품'
SETTINGS mutations_sync = 1;
```

`mutations_sync = 1`이므로 명령이 완료될 때까지 대기합니다. 완료 후 `system.mutations`를 확인합니다.

```sql
SELECT
    mutation_id,
    command,
    create_time,
    is_done,
    parts_to_do
FROM system.mutations
WHERE table = 'orders';
```

```text
┌─mutation_id────┬─command──────────────────────────────────────┬─create_time─────────┬─is_done─┬─parts_to_do─┐
│ mutation_4.txt │ UPDATE price = 0 WHERE category = '전자제품' │ 2026-05-19 12:01:15 │       1 │           0 │
└────────────────┴──────────────────────────────────────────────┴─────────────────────┴─────────┴─────────────┘
```

`is_done = 1`, `parts_to_do = 0`. 뮤테이션이 완료되었습니다. `system.parts`를 확인하면 새 Part가 생성된 것을 볼 수 있습니다.

```sql
SELECT name, active, rows
FROM system.parts
WHERE table = 'orders'
ORDER BY active DESC, name;
```

```text
┌─name────────┬─active─┬─────rows─┐
│ all_1_3_1_4 │      1 │ 10000000 │
│ all_1_3_1   │      0 │ 10000000 │
└─────────────┴────────┴──────────┘
```

원본 `all_1_3_1`이 inactive가 되고, 뮤테이션이 적용된 `all_1_3_1_4`가 active입니다. 데이터가 실제로 변경되었는지 확인합니다.

```sql
SELECT
    count() AS cnt,
    avg(price) AS avg_price
FROM orders
WHERE category = '전자제품';
```

```text
┌─────cnt─┬─avg_price─┐
│ 1250000 │         0 │
└─────────┴───────────┘
```

`avg_price`가 0입니다. 1,000만 행 전체 Part를 재작성해서 `전자제품` 행의 price만 0으로 바꾼 것입니다.

### Lightweight DELETE 실험

이번에는 Lightweight DELETE를 사용해봅시다.

```sql
DELETE FROM orders WHERE order_id < 100;
```

이 명령은 거의 즉시 반환됩니다. 전체 컬럼 파일을 재작성하지 않기 때문입니다. `system.mutations`를 확인하면 내부적으로 어떤 연산이 실행되었는지 볼 수 있습니다.

```sql
SELECT mutation_id, command, is_done
FROM system.mutations
WHERE table = 'orders'
ORDER BY create_time DESC
LIMIT 1;
```

```text
┌─mutation_id────┬─command──────────────────────────────────────────────┬─is_done─┐
│ mutation_5.txt │ UPDATE _row_exists = 0 WHERE order_id < 100         │       1 │
└────────────────┴──────────────────────────────────────────────────────┴─────────┘
```

`DELETE FROM`이 내부적으로 `UPDATE _row_exists = 0`으로 변환된 것을 직접 확인할 수 있습니다. 행이 실제로 조회에서 제외되는지 확인합니다.

```sql
SELECT count() FROM orders WHERE order_id < 100;
```

```text
┌─count()─┐
│       0 │
└─────────┘
```

0건입니다. 쿼리에서는 이미 제외되었습니다. 하지만 `system.parts`를 보면 Part가 새로 생성되었지만 크기가 거의 변하지 않았습니다. `_row_exists` 컬럼만 새로 쓰이고 나머지 컬럼 파일은 hardlink로 연결되었기 때문입니다.

```sql
SELECT
    name,
    active,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders' AND active
ORDER BY name;
```

```text
┌─name────────┬─active─┬─────rows─┬─size───────┐
│ all_1_3_1_5 │      1 │ 10000000 │ 111.08 MiB │
└─────────────┴────────┴──────────┴────────────┘
```

삭제된 행의 데이터는 물리적으로 남아 있고, `_row_exists = 0`으로 표시만 된 상태입니다. 실제 데이터 제거는 다음 백그라운드 머지 때 일어납니다. `OPTIMIZE TABLE`로 강제 머지를 실행하면 물리적으로도 제거됩니다.

```sql
OPTIMIZE TABLE orders FINAL;

SELECT
    name,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'orders' AND active;
```

```text
┌─name──────────┬─────rows─┬─size───────┐
│ all_1_3_2_5   │  9999900 │ 110.94 MiB │
└───────────────┴──────────┴────────────┘
```

`rows`가 9,999,900으로 100만큼 줄었고, Part 크기도 소폭 감소했습니다. 삭제된 행의 데이터가 머지를 통해 물리적으로 정리된 것입니다.

핵심 차이를 정리하면: 앞서 실행한 ALTER TABLE UPDATE는 Part 재작성까지 수 초가 걸렸지만, DELETE FROM은 즉시 반환되었습니다. ALTER TABLE DELETE는 뮤테이션이 완료되면 물리적으로 깨끗한 Part를 남기고, Lightweight DELETE는 다음 머지까지 마스킹 상태로 남깁니다. 용도에 맞게 선택해야 합니다.

## 실전에서는

### 머지 모니터링

`system.merges`에서 현재 진행 중인 머지를 추적합니다. `progress`가 장시간 변하지 않는다면 디스크 I/O 병목이나 리소스 경합을 의심해야 합니다.

Part 수는 테이블 건강도의 핵심 지표입니다. active Part가 지속적으로 증가한다면, INSERT 빈도에 비해 머지가 따라가지 못하는 상황입니다.

```sql
SELECT
    table,
    count() AS active_parts
FROM system.parts
WHERE active
GROUP BY table
HAVING active_parts > 50
ORDER BY active_parts DESC;
```

Part가 수백 개 이상 쌓이면 결국 "Too many parts" 에러가 발생합니다.

### 뮤테이션 모니터링

실행 중이거나 실패한 뮤테이션을 확인합니다.

```sql
SELECT
    table,
    mutation_id,
    command,
    is_done,
    parts_to_do,
    latest_fail_reason
FROM system.mutations
WHERE NOT is_done
ORDER BY create_time;
```

`latest_fail_reason`이 비어 있지 않다면 뮤테이션이 실패한 것입니다. 멈춘 뮤테이션은 `KILL MUTATION`으로 중단할 수 있습니다.

```sql
KILL MUTATION WHERE mutation_id = 'mutation_4.txt';
```

뮤테이션은 제출된 순서대로 실행됩니다. 앞선 뮤테이션이 멈추면 뒤의 뮤테이션도 전부 대기합니다. 운영 환경에서 뮤테이션을 실행했다면 반드시 `system.mutations`를 확인해야 합니다.

### OPTIMIZE TABLE의 함정

`OPTIMIZE TABLE orders FINAL`은 각 파티션 내의 모든 Part를 하나로 강제 머지합니다. 실험에서는 유용하지만, **프로덕션에서 정기적으로 실행하면 안 됩니다**. 수백 GB 테이블에서 FINAL을 실행하면 전체 데이터를 재작성하는 것과 같습니다. 디스크 I/O와 CPU를 장시간 점유하고, 머지가 진행되는 동안 디스크 사용량이 2배로 뛰어오릅니다.

백그라운드 머지 스케줄러를 신뢰하세요. ClickHouse는 자체적으로 최적의 시점에 최적의 Part를 선택해서 머지합니다. `OPTIMIZE TABLE`(FINAL 없이)을 실행하면 스케줄러에 "지금 머지를 시도해봐"라는 힌트를 줄 수 있지만, 이마저도 일상적으로 쓸 필요는 없습니다.

### DELETE 전략 선택 가이드

| 상황 | 권장 방법 | 비용 |
|------|----------|------|
| 오래된 파티션 통째로 삭제 | `ALTER TABLE DROP PARTITION` | 즉각, 거의 무비용 |
| 특정 조건의 행 삭제 | `DELETE FROM` (Lightweight) | 가벼움 |
| 조건부 데이터 수정 | `ALTER TABLE UPDATE` | 무거움 (Part 재작성) |
| 조건부 대량 삭제 | `ALTER TABLE DELETE` | 무거움 (Part 재작성) |
| 주기적 중복 제거 | ReplacingMergeTree | 머지 시 자동 처리 |

가장 빠른 것은 파티션 단위 DROP이고, 가장 무거운 것은 뮤테이션입니다. 삭제/수정 요구사항이 있다면, 먼저 파티셔닝이나 테이블 엔진으로 해결할 수 있는지 검토하는 것이 올바른 순서입니다.

## 마치며

불변 Part는 MergeTree의 쓰기 성능을 보장하는 핵심 설계이고, 그로 인한 읽기 비용은 백그라운드 머지가 상환합니다. 뮤테이션은 불변성 위에서 변경을 구현하는 비상 도구이지, RDB의 UPDATE처럼 일상적으로 쓸 연산이 아닙니다.

기본 MergeTree의 머지는 Part를 합칠 뿐, 중복을 제거하거나 값을 집계하지 않습니다. 다음 글에서는 머지 과정에 추가 로직을 끼워 넣는 네 가지 엔진(ReplacingMergeTree, SummingMergeTree, AggregatingMergeTree, CollapsingMergeTree)이 각각 어떤 문제를 해결하는지 다룹니다.

---

## 참고자료

- [ClickHouse 공식 문서: MergeTree Table Engine](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse 공식 문서: ALTER TABLE UPDATE](https://clickhouse.com/docs/sql-reference/statements/alter/update)
- [ClickHouse 공식 문서: ALTER TABLE DELETE](https://clickhouse.com/docs/sql-reference/statements/alter/delete)
- [ClickHouse 공식 문서: DELETE Statement (Lightweight Delete)](https://clickhouse.com/docs/sql-reference/statements/delete)
