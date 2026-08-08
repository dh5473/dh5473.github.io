---
date: '2026-03-23'
title: 'Prisma가 만든 enum 마이그레이션이 P3006으로 막히는 이유'
category: 'Troubleshooting'
summary: '새 enum 값은 커밋 전까지 같은 트랜잭션에서 쓸 수 없습니다. 이 PostgreSQL 제약이 Prisma의 Shadow DB 재실행과 만나 P3006이 되는 과정을 짚습니다.'
thumbnail: './thumbnail.png'
tags: ['Prisma', 'PostgreSQL', 'Migration', 'Shadow Database']
---

사내 인증 시스템에 SSO를 붙이면서 기존 `Role` enum에 `PENDING` 값을 추가하고, 그 값을 컬럼 기본값으로 걸었습니다. 스키마로는 두 줄짜리 변경입니다.

```prisma
enum Role {
  ADMIN
  USER
  PENDING
}

model User {
  id   Int  @id @default(autoincrement())
  role Role @default(PENDING)
}
```

Prisma가 SQL도 알아서 만들어 주니 평소처럼 `prisma migrate dev`를 돌리면 끝날 일로 보였습니다. 그런데 이 조합은 처음 적용할 때부터 깨지고, 한 번 깨진 뒤로는 이후의 모든 `prisma migrate dev`가 막혀버립니다.

## 두 개의 에러 코드

이 문제는 에러 코드가 두 번 바뀌면서 나타납니다. 순서를 헷갈리면 원인을 엉뚱한 곳에서 찾게 되므로 먼저 정리하겠습니다.

처음 적용할 때는 **P3018**입니다. 마이그레이션 파일이 실행되다가 그 자리에서 실패합니다.

```text
Applying migration `20260319074550_add_pending_role`

Error: P3018
Database error code: 55P04

ERROR: unsafe use of new value "PENDING" of enum type "Role"
HINT: New enum values must be committed before they can be used.
```

그 실패를 수동으로 수습해 마이그레이션 히스토리에 남긴 뒤부터는 **P3006**으로 바뀝니다. 이제는 새 마이그레이션을 만들려고 할 때마다 Shadow DB 재실행 단계에서 같은 파일이 다시 걸립니다.

```text
Error: P3006

Migration `20260319074550_add_pending_role` failed to apply cleanly
to the shadow database.
Error:
ERROR: unsafe use of new value "PENDING" of enum type "Role"
HINT: New enum values must be committed before they can be used.
```

증상이 "마이그레이션 실패"에서 "새 마이그레이션 생성 불가"로 옮겨가지만, 안쪽의 PostgreSQL 에러는 처음부터 끝까지 같습니다. 문제의 마이그레이션 파일을 열어보면 Prisma가 자동 생성한 SQL은 이렇게 생겼습니다.

```sql
-- enum에 PENDING 값 추가
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 바로 다음 줄에서 PENDING을 DEFAULT로 사용
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

enum에 값을 추가하고 그 값을 기본값으로 설정하는, 언뜻 자연스러운 흐름입니다. 하지만 이 두 문장이 하나의 트랜잭션 안에서 실행되면 PostgreSQL이 거부합니다.

## PostgreSQL enum과 트랜잭션의 제약

여기서 흔히 두 가지가 뒤섞입니다. `ALTER TYPE ... ADD VALUE`를 트랜잭션 블록 안에서 실행할 수 있는지, 그리고 그렇게 추가한 값을 같은 트랜잭션에서 쓸 수 있는지는 **서로 다른 질문**입니다.

| PostgreSQL | 트랜잭션 블록 안에서 ADD VALUE | 같은 트랜잭션에서 그 값 사용 |
|---|---|---|
| 11 이하 | 불가 (25001) | 불가 |
| 12 이상 | 가능 | 불가 (55P04) |

PostgreSQL 11까지는 `ADD VALUE` 자체가 트랜잭션 블록 안에서 거부됐습니다. `ERROR: ALTER TYPE ... ADD cannot run inside a transaction block`이 여기서 나옵니다. 12에서 이 제한이 풀렸고, 릴리스 노트는 그 변화를 이렇게 적고 있습니다.

> Previously, `ALTER TYPE ... ADD VALUE` could not be called in a transaction block, unless it was part of the same transaction that created the enumerated type. Now it can be called in a later transaction, so long as the new enumerated value is not referenced until after it is committed.

풀린 것은 실행 제한뿐이고, 뒷문장이 남은 제약입니다. 현재 `ALTER TYPE` 문서의 문장도 같은 이야기를 합니다.

> If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed.

그래서 문제가 되는 것은 `ADD VALUE`가 아니라 **그 다음 줄의 `SET DEFAULT 'PENDING'`** 입니다. 아직 커밋되지 않은 값을 참조했기 때문입니다.

```sql
BEGIN;

-- PostgreSQL 12 이상에서는 이 문장 자체는 통과합니다
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 아직 커밋되지 않은 값을 참조하는 순간 걸립니다
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
-- ERROR:  55P04: unsafe use of new value "PENDING" of enum type "Role"
-- HINT:  New enum values must be committed before they can be used.

COMMIT;
```

`ADD VALUE`는 시스템 카탈로그 `pg_enum`에 새 행을 넣습니다. 그 행은 트랜잭션이 커밋되기 전까지 확정된 값이 아니므로, 그 값을 참조하는 기본값이나 데이터를 먼저 만들어 두면 롤백됐을 때 존재하지 않는 라벨을 가리키게 됩니다. PostgreSQL은 그 상황을 아예 만들지 않는 쪽을 택합니다. 이 동작은 PostgreSQL 18까지 그대로입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 470" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="새 enum 값을 같은 트랜잭션에서 쓰면 전체가 롤백되고, 커밋으로 트랜잭션을 나누면 기본값이 적용되는 두 경우를 위아래로 비교한 그림">
<style>
.tx-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.tx-h { fill: var(--text, #1c1917); font-size: 14px; font-weight: 700; }
.tx-l { fill: var(--text, #1c1917); font-size: 14px; }
.tx-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.tx-ok { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.tx-bad { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.tx-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.tx-row { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); stroke-width: 1; }
.tx-fail { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.tx-pass { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.tx-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#txArrow); }
</style>
<defs>
<marker id="txArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="tx-t" x="200" y="22" text-anchor="middle">트랜잭션 경계에 따라 갈리는 결과</text>
<!-- 패널 1: 한 트랜잭션 -->
<rect class="tx-panel" x="16" y="36" width="368" height="180" rx="8"/>
<text class="tx-h" x="32" y="61">하나의 트랜잭션</text>
<rect class="tx-row" x="30" y="72" width="340" height="32" rx="5"/>
<text class="tx-l" x="44" y="93">ADD VALUE 'PENDING'</text>
<text class="tx-ok" x="356" y="93" text-anchor="end">✓ 통과</text>
<rect class="tx-fail" x="30" y="110" width="340" height="32" rx="5"/>
<text class="tx-l" x="44" y="131">SET DEFAULT 'PENDING'</text>
<text class="tx-bad" x="356" y="131" text-anchor="end">✗ 55P04</text>
<path class="tx-a" d="M200 142 L200 156"/>
<rect class="tx-fail" x="30" y="160" width="340" height="32" rx="5"/>
<text class="tx-bad" x="200" y="181" text-anchor="middle">트랜잭션 전체 롤백</text>
<text class="tx-n" x="200" y="206" text-anchor="middle">enum 값·기본값 모두 미반영</text>
<!-- 패널 2: 두 트랜잭션 -->
<rect class="tx-panel" x="16" y="236" width="368" height="222" rx="8"/>
<text class="tx-h" x="32" y="261">두 개의 트랜잭션</text>
<rect class="tx-row" x="30" y="272" width="340" height="32" rx="5"/>
<text class="tx-l" x="44" y="293">ADD VALUE 'PENDING'</text>
<text class="tx-ok" x="356" y="293" text-anchor="end">✓ 통과</text>
<path class="tx-a" d="M200 304 L200 316"/>
<rect class="tx-pass" x="120" y="320" width="160" height="30" rx="5"/>
<text class="tx-ok" x="200" y="340" text-anchor="middle">COMMIT</text>
<path class="tx-a" d="M200 350 L200 362"/>
<rect class="tx-row" x="30" y="366" width="340" height="32" rx="5"/>
<text class="tx-l" x="44" y="387">SET DEFAULT 'PENDING'</text>
<text class="tx-ok" x="356" y="387" text-anchor="end">✓ 통과</text>
<text class="tx-ok" x="200" y="424" text-anchor="middle">기본값 적용 완료</text>
</svg>
</div>

예외가 하나 있습니다. 같은 트랜잭션 안에서 그 enum 타입을 `CREATE`했다면 커밋 전에도 값을 쓸 수 있습니다. 새로 만든 타입은 아직 아무도 참조하지 않으므로 롤백해도 깨질 정합성이 없기 때문입니다. Prisma가 처음 만드는 마이그레이션이 멀쩡히 통과하는 이유가 여기에 있습니다. 문제는 **이미 존재하던** enum에 값을 더할 때 생깁니다.

그렇다면 트랜잭션은 누가 여는 걸까요. Prisma가 마이그레이션 파일에 `BEGIN`을 써넣지는 않습니다. 파일 내용을 한 번에 보내고, PostgreSQL이 여러 문장으로 된 하나의 쿼리를 암묵적 트랜잭션으로 묶습니다. Prisma 팀도 공식 논의에서 같은 설명을 했습니다.

> Prisma itself doesn't explicitly wrap migrations in a transaction. However, depending on the database, all statements sent from a single migration file may still be executed within one transaction. This is typically the case with PostgreSQL.

이 구분을 잡아두면 뒤에 나오는 "Shadow DB를 안 거치면 괜찮다"는 식의 해결책이 왜 성립하지 않는지가 보입니다.

## 왜 한 번 깨지면 계속 막히는가

`prisma migrate dev`는 새 마이그레이션만 적용하는 명령이 아닙니다. **Shadow Database**라는 빈 임시 데이터베이스를 만들고, `prisma/migrations/` 폴더의 모든 마이그레이션을 처음부터 순차적으로 재실행합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 376" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="migrate dev가 빈 shadow DB에 모든 마이그레이션을 재실행하다 문제의 파일에서 매번 실패해 새 마이그레이션을 만들지 못하는 경로">
<style>
.sh-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.sh-l { fill: var(--text, #1c1917); font-size: 14px; }
.sh-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.sh-ok { fill: var(--text-success, #107836); font-size: 14px; font-weight: 700; }
.sh-bad { fill: var(--text-danger, #cb2121); font-size: 14px; font-weight: 700; }
.sh-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.sh-fail { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 2; }
.sh-wrap { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 6 3; }
.sh-dim { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 4 3; }
.sh-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#shArrow); }
</style>
<defs>
<marker id="shArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="sh-t" x="200" y="22" text-anchor="middle">migrate dev가 매번 밟는 경로</text>
<rect class="sh-box" x="60" y="36" width="280" height="32" rx="5"/>
<text class="sh-l" x="200" y="57" text-anchor="middle">migrate dev 실행</text>
<path class="sh-a" d="M200 68 L200 80"/>
<rect class="sh-box" x="60" y="84" width="280" height="32" rx="5"/>
<text class="sh-l" x="200" y="105" text-anchor="middle">빈 Shadow DB 생성</text>
<path class="sh-a" d="M200 116 L200 128"/>
<rect class="sh-wrap" x="20" y="132" width="360" height="140" rx="8"/>
<text class="sh-n" x="200" y="154" text-anchor="middle">모든 마이그레이션 순차 재실행</text>
<rect class="sh-box" x="36" y="164" width="328" height="28" rx="5"/>
<text class="sh-l" x="50" y="183">init</text>
<text class="sh-ok" x="350" y="183" text-anchor="end">✓ OK</text>
<rect class="sh-box" x="36" y="198" width="328" height="28" rx="5"/>
<text class="sh-l" x="50" y="217">add_user_table</text>
<text class="sh-ok" x="350" y="217" text-anchor="end">✓ OK</text>
<rect class="sh-fail" x="36" y="232" width="328" height="28" rx="5"/>
<text class="sh-l" x="50" y="251">add_pending_role</text>
<text class="sh-bad" x="350" y="251" text-anchor="end">✗ FAIL</text>
<path class="sh-a" d="M200 272 L200 288"/>
<rect class="sh-dim" x="60" y="292" width="280" height="32" rx="5"/>
<text class="sh-n" x="200" y="313" text-anchor="middle">schema.prisma와 diff 비교</text>
<text class="sh-bad" x="200" y="352" text-anchor="middle">새 마이그레이션 생성 불가</text>
</svg>
</div>

Shadow DB가 존재하는 이유는 마이그레이션 히스토리의 무결성 검증입니다. 실제 개발 DB는 손으로 실행한 SQL 때문에 히스토리와 어긋나 있을 수 있으므로, 빈 상태에서 파일만으로 스키마를 재현해 보고 그 결과를 개발 DB와 대조합니다. 이 과정에서 스키마 드리프트를 잡아내고, 새로 만들 마이그레이션이 데이터 손실을 일으키는지도 함께 판단합니다.

문제는 재실행 단계입니다. 실패한 마이그레이션 파일이 폴더에 남아 있는 한 그 파일은 매번 재실행되고 매번 같은 지점에서 걸립니다. 개발 DB에는 이미 적용이 끝나 있어도 소용없습니다. Shadow DB는 언제나 빈 상태에서 출발하기 때문입니다. 이 상태가 되면 파일만 만들어 주는 `prisma migrate dev --create-only`도 같은 재실행을 거치므로 똑같이 P3006으로 막힙니다.

Prisma가 enum 값 추가와 그 값의 사용을 트랜잭션 분리 없이 한 파일에 넣는 것은 [GitHub 이슈 #8424](https://github.com/prisma/prisma/issues/8424)로 2021년에 보고됐고, 아직 닫히지 않았습니다.

## 마이그레이션 파일을 고치는 법

원인이 한 트랜잭션에 `ADD VALUE`와 그 값의 사용이 같이 들어간 것이므로, 트랜잭션 경계를 하나 넣어주면 해결됩니다. 방법은 둘입니다.

첫째, 두 개의 마이그레이션으로 나눕니다. 파일이 다르면 실행도 따로 되므로 앞 파일이 커밋된 뒤에 뒤 파일이 돕니다.

```sql
-- 20260319074550_add_pending_value/migration.sql
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 20260319074551_set_pending_default/migration.sql
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

둘째, 한 파일 안에서 `COMMIT`으로 트랜잭션을 끊습니다. 암묵적 트랜잭션이 그 지점에서 끝나고 뒤의 문장은 새 트랜잭션에서 실행됩니다.

```sql
ALTER TYPE "Role" ADD VALUE 'PENDING';
COMMIT;
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

두 방법 모두 Shadow DB 재실행에서도 통과하므로 P3006까지 같이 풀립니다. 다만 중간 `COMMIT`은 그 파일이 더 이상 전부 아니면 전무로 적용되지 않는다는 뜻이기도 합니다. 뒤쪽 문장이 실패하면 enum 값만 추가된 상태로 남습니다. 되돌릴 지점을 분명히 하고 싶다면 파일을 나누는 쪽이 낫습니다.

:::warning

**적용된 마이그레이션 파일은 함부로 고칠 수 없습니다**

Prisma는 각 마이그레이션의 체크섬을 `_prisma_migrations` 테이블에 저장합니다. 이미 적용된 파일의 내용을 바꾸면 체크섬이 어긋나고, `The migration was modified after it was applied`와 함께 스키마 리셋을 요구합니다. 파일 수정은 **아직 적용하기 전**에 하는 것이 원칙입니다.

이미 히스토리에 남아버린 뒤라면 선택지는 둘입니다. 개발 DB를 버려도 되는 상황이면 `prisma migrate reset`으로 히스토리를 다시 쌓는 것이 가장 간단합니다. 그럴 수 없다면 파일을 고친 뒤 `_prisma_migrations` 테이블의 해당 행까지 손으로 맞춰야 합니다.

:::

애초에 이 상황을 만들지 않으려면 `prisma migrate dev --create-only`로 파일만 먼저 만들어 SQL을 확인하고, 필요하면 그 자리에서 나누면 됩니다. 다만 이 옵션도 Shadow DB를 쓰므로 이미 P3006에 빠진 뒤에는 쓸 수 없습니다. 사고 예방용이지 사후 복구용이 아닙니다.

## 이미 히스토리에 남아버렸다면

개발 DB를 리셋할 수 없어서 `migrate dev`가 막힌 채로 스키마 변경을 계속 반영해야 하는 상황이 있습니다. Prisma 공식 문서가 실패한 마이그레이션을 수습할 때 쓰는 절차를 그대로 응용할 수 있습니다.

:::warning

**이 절차는 `migrate dev`를 되살리지 않습니다**

문제의 파일이 `prisma/migrations/`에 그대로 남아 있는 한 Shadow DB 재실행은 계속 실패합니다. 아래 세 단계는 앞으로의 스키마 변경을 손으로 처리하겠다는 뜻입니다. 근본 복구는 앞 절의 파일 수정입니다.

:::

### migrate diff로 SQL 만들기

실제 DB의 현재 스키마와 `schema.prisma`의 데이터 모델을 비교해 SQL을 생성합니다. 이 조합은 로컬 `migrations` 디렉터리를 읽지 않으므로 Shadow DB를 쓰지 않습니다. 리다이렉션은 디렉터리를 만들어 주지 않으니 먼저 만들어야 합니다.

```bash
mkdir -p prisma/migrations/20260323101500_add_pending_default

npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20260323101500_add_pending_default/migration.sql
```

Prisma 6 이하에서는 플래그 이름이 `--from-schema-datasource`와 `--to-schema-datamodel`이었고 스키마 파일 경로를 인자로 받았습니다. 7에서 접속 정보가 `prisma.config.ts`로 옮겨가면서 각각 `--from-config-datasource`, `--to-schema`로 바뀌었습니다. 생성된 SQL은 반드시 열어서 의도한 변경만 들어 있는지 확인하세요.

### db execute로 직접 적용하기

생성된 SQL을 데이터베이스에 그대로 실행합니다.

```bash
npx prisma db execute \
  --file prisma/migrations/20260323101500_add_pending_default/migration.sql
```

이 명령도 Prisma 7에서 `--schema`와 `--url`이 사라졌습니다. 접속 정보는 `prisma.config.ts`에서 읽고, 다른 설정 파일을 쓰려면 `--config prisma.config.prod.ts`를 붙입니다.

:::warning

**db execute도 트랜잭션 제약을 피해가지 못합니다**

이 단계가 무사히 넘어가는 이유는 Shadow DB를 거치지 않아서가 아닙니다. 이번 diff에 enum 조작이 들어 있지 않아서일 뿐입니다. `db execute`도 파일 내용을 한 번에 보내므로 앞서 설명한 암묵적 트랜잭션에 그대로 묶입니다. 스크립트 안에 `ADD VALUE`와 그 값을 쓰는 문장이 함께 있으면 여기서도 똑같이 실패합니다.

:::

### migrate resolve로 히스토리에 등록하기

수동으로 적용한 마이그레이션을 `_prisma_migrations` 테이블에 적용됨으로 기록합니다. 인자로는 타임스탬프를 포함한 **디렉터리 이름 전체**를 넘겨야 합니다. 이름만 넘기면 P3017이 납니다.

```bash
npx prisma migrate resolve --applied 20260323101500_add_pending_default
```

`migrate resolve`는 Shadow DB를 쓰지 않는 명령이라 P3006 상태에서도 동작합니다. 끝나면 `prisma migrate status`로 히스토리와 실제 DB가 맞는지 확인합니다.

## enum 대신 String 타입

PostgreSQL의 enum은 값을 더하거나 뺄 때마다 이런 종류의 제약이 따라옵니다. 값이 자주 변하는 컬럼이라면 문자열 컬럼과 애플리케이션 레벨 검증으로 옮기는 편이 실용적입니다.

```prisma
// enum Role 선언을 통째로 지우고 컬럼을 문자열로
model User {
  id   Int    @id @default(autoincrement())
  role String @default("PENDING")
}
```

한 줄 바꾸면 끝나는 일은 아닙니다. 컬럼 타입 변경과 기존 행의 데이터 마이그레이션이 따라오고, 애플리케이션 쪽에도 허용 값을 검증하는 코드가 필요합니다. DB가 잡아주던 오타를 이제 코드가 잡아야 한다는 점도 감수해야 합니다. 그래도 값이 계속 늘어날 컬럼이라면 한 번에 치르는 편이 낫습니다.

## 마치며

이 사고의 핵심은 PostgreSQL이 새 enum 값의 사용을 막는 것이 버그가 아니라 정합성 보호 장치라는 점입니다. `ADD VALUE`가 롤백될 수 있는 한 그 값을 참조하는 기본값을 미리 만들어 둘 수는 없습니다. PostgreSQL 12에서 풀린 것은 실행 제한이지 사용 제한이 아니고, 그 구분을 놓치면 버전만 올리면 될 문제로 오해하기 쉽습니다.

Prisma 쪽 증상이 P3018에서 P3006으로 옮겨가는 것도 같은 원인의 두 얼굴입니다. 개발 DB에 무엇이 적용됐든 Shadow DB는 늘 빈 상태에서 파일을 다시 밟기 때문에, 파일을 고치지 않는 한 어떤 우회도 임시방편에 머뭅니다. `migrate diff`와 `db execute`, `migrate resolve` 세 단계는 급한 불을 끄는 용도이고, 실제로 복구하는 것은 파일에 트랜잭션 경계를 넣는 일입니다.

그래서 enum에 값을 더하는 마이그레이션은 `--create-only`로 SQL을 먼저 확인하는 습관이 값을 합니다. 확인할 것은 한 가지뿐입니다. `ADD VALUE`와 그 값을 쓰는 문장이 한 파일에 같이 들어 있는지 보면 됩니다.

## 함께 보면 좋은 글

- [MySQL SELECT가 변경을 못 읽는 이유](/troubleshooting/mysql-repeatable-read-autocommit/) : 트랜잭션 경계를 오해했을 때 벌어지는 또 다른 사고
- [PostgreSQL MVCC와 튜플 가시성](/postgres/mvcc-visibility/) : 커밋 전 변경이 누구에게 보이지 않는가
- [트랜잭션 격리 수준과 락](/postgres/isolation-and-locks/) : 동시 트랜잭션이 서로를 어떻게 막는지

## 참고자료

- [PostgreSQL: ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)
- [PostgreSQL 12 Release Notes](https://www.postgresql.org/docs/release/12.0/)
- [Prisma: Error reference](https://www.prisma.io/docs/orm/reference/error-reference)
- [Prisma: Shadow database](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
- [Prisma: Patching and hotfixing](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)
- [Prisma Discussion #3774: Is a migration script wrapped inside a transaction?](https://github.com/prisma/prisma/discussions/3774)
