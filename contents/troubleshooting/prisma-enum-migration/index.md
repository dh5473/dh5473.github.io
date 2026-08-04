---
date: '2026-03-23'
title: 'Prisma P3006 에러 해결: PostgreSQL enum의 트랜잭션 제약과 Shadow DB 문제'
category: 'Troubleshooting'
summary: 'prisma migrate dev의 P3006 에러 원인과, Shadow DB를 우회하는 수동 마이그레이션 해결법을 정리합니다.'
thumbnail: './thumbnail.png'
tags: ['Prisma', 'PostgreSQL', 'Migration', 'Shadow Database']
---

사내 인증 시스템에 SSO를 붙이면서, 기존 `Role` enum에 `PENDING` 값을 추가하고 그 값을 컬럼 기본값으로 거는 마이그레이션을 작성했습니다. 흔한 변경이고, Prisma가 SQL도 알아서 만들어 줍니다. 그런데 이 조합은 처음 적용할 때부터 깨지고, 한 번 깨진 뒤로는 이후의 모든 `prisma migrate dev`가 막혀버립니다.

## 두 개의 에러 코드

이 문제는 에러 코드가 두 번 바뀌면서 나타납니다. 순서를 헷갈리면 원인을 엉뚱한 곳에서 찾게 되므로 먼저 정리하고 시작하겠습니다.

**처음 적용할 때는 P3018입니다.** 마이그레이션 파일 자체가 실행되지 못하고 그 자리에서 실패합니다.

```text
Applying migration `20260319074550_add_pending_role`

Error: P3018
Database error code: 55P04

ERROR: unsafe use of new value "PENDING" of enum type "Role"
HINT: New enum values must be committed before they can be used.
```

**그 실패를 수동으로 수습해 마이그레이션 히스토리에 남긴 뒤부터는 P3006입니다.** 이제는 새 마이그레이션을 만들려고 할 때마다 Shadow DB 재실행 단계에서 같은 파일이 다시 걸립니다.

```text
Error: P3006

Migration `20260319074550_add_pending_role` failed to apply cleanly
to the shadow database.
Error:
ERROR: unsafe use of new value "PENDING" of enum type "Role"
HINT: New enum values must be committed before they can be used.

0: schema_core::state::DevDiagnostic
   at schema-engine/core/src/state.rs:314
```

문제의 마이그레이션 파일을 열어보면, Prisma가 자동 생성한 SQL은 이렇게 생겼습니다.

```sql
-- 1) enum에 PENDING 값 추가
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 2) 바로 다음 줄에서 PENDING을 DEFAULT로 사용
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

언뜻 보면 자연스러운 흐름입니다. enum에 값을 추가하고, 그 값을 기본값으로 설정하는 것이니까요. 하지만 이 두 SQL문이 **하나의 트랜잭션** 안에서 실행되면 PostgreSQL이 거부합니다.

## 원인: PostgreSQL enum과 트랜잭션의 제약

### 새 enum 값은 커밋 전까지 쓸 수 없습니다

PostgreSQL에서 enum 타입은 시스템 카탈로그(`pg_enum`)에 저장되는 특수한 데이터 타입입니다. `ALTER TYPE ... ADD VALUE`는 이 카탈로그에 새 행을 삽입하는데, 그 행은 트랜잭션이 커밋되기 전까지 확정된 값으로 취급되지 않습니다. 만약 트랜잭션이 롤백되었는데 이미 그 값을 참조하는 데이터가 남아 있다면 정합성이 깨지기 때문입니다.

버전에 따라 제약의 모양이 다릅니다. 이 구분이 중요합니다.

| PostgreSQL | `ADD VALUE`를 트랜잭션 안에서 실행 | 같은 트랜잭션에서 그 값을 사용 |
|---|---|---|
| 11 이하 | 불가 | 불가 |
| 12 이상 | **가능** | 여전히 불가 |

PostgreSQL 12부터는 트랜잭션 블록 안에서 `ADD VALUE`를 실행하는 것 자체는 허용됩니다. 현재 공식 문서의 문장도 이렇게 바뀌어 있습니다.

> If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed.

즉 지금 문제가 되는 것은 `ADD VALUE` 자체가 아니라 **그 다음 줄의 `SET DEFAULT 'PENDING'`** 입니다. 새로 만든 값을 같은 트랜잭션에서 참조했기 때문입니다.

```sql
BEGIN;

-- PG 12 이상에서는 이 문장 자체는 통과합니다
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 문제는 여기입니다. 아직 커밋되지 않은 값을 참조합니다
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
-- ERROR: unsafe use of new value "PENDING" of enum type "Role"

COMMIT;
```

예외가 하나 있습니다. **같은 트랜잭션 안에서 그 enum 타입을 `CREATE`했다면** 커밋 전에도 값을 쓸 수 있습니다. 새로 만든 타입은 아직 아무도 참조하지 않으므로 롤백해도 정합성이 깨질 일이 없기 때문입니다.

### 트랜잭션은 누가 여는 걸까

여기서 짚어둘 것이 있습니다. Prisma가 마이그레이션 파일에 `BEGIN`을 써넣는 것이 아닙니다. Prisma는 파일 내용을 한 번에 보내고, **PostgreSQL이 여러 문장으로 된 쿼리를 하나의 암묵적 트랜잭션으로 처리합니다.**

이 구분이 중요한 이유는 뒤에 나옵니다. "Shadow DB를 안 거치면 괜찮다"는 식의 해결책이 왜 성립하지 않는지가 여기서 갈립니다.

## 왜 한 번 깨지면 계속 막히는가

`prisma migrate dev`를 실행하면, Prisma는 단순히 새 마이그레이션만 적용하는 게 아닙니다. **Shadow Database**라는 빈 임시 데이터베이스를 만들고, `prisma/migrations/` 폴더의 모든 마이그레이션을 처음부터 순차적으로 재실행합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 376" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="migrate dev가 빈 shadow DB에 모든 마이그레이션을 재실행하다 문제의 파일에서 매번 실패하는 경로">
<style>
.sh-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.sh-l { fill: var(--text, #1c1917); font-size: 14px; }
.sh-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.sh-ok { fill: var(--text-success, #107836); font-size: 14px; }
.sh-bad { fill: var(--text-danger, #cb2121); font-size: 14px; }
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
<text class="sh-ok" x="350" y="183" text-anchor="end">OK</text>
<rect class="sh-box" x="36" y="198" width="328" height="28" rx="5"/>
<text class="sh-l" x="50" y="217">add_user_table</text>
<text class="sh-ok" x="350" y="217" text-anchor="end">OK</text>
<rect class="sh-fail" x="36" y="232" width="328" height="28" rx="5"/>
<text class="sh-l" x="50" y="251">add_pending_role</text>
<text class="sh-bad" x="350" y="251" text-anchor="end">FAIL</text>
<path class="sh-a" d="M200 272 L200 288"/>
<rect class="sh-dim" x="60" y="292" width="280" height="32" rx="5"/>
<text class="sh-n" x="200" y="313" text-anchor="middle">schema.prisma와 diff 비교</text>
<text class="sh-bad" x="200" y="352" text-anchor="middle">새 마이그레이션 생성 불가</text>
</svg>
</div>

Shadow DB가 존재하는 이유는 **마이그레이션 히스토리의 무결성 검증**입니다. 모든 마이그레이션을 처음부터 재실행해서, 마이그레이션 파일들이 정확하게 현재 스키마를 재현할 수 있는지 확인하는 것이죠. 실제 개발 DB는 수동 변경이나 직접 SQL 실행으로 인해 마이그레이션 히스토리와 어긋날 수 있기 때문에, "깨끗한 상태에서의 재현"이 필요합니다.

문제는 재실행 단계입니다. 실패한 마이그레이션 파일이 히스토리에 남아 있는 한, 그 파일은 **매번** 재실행되고 **매번** 같은 지점에서 걸립니다. 개발 DB에는 이미 적용이 끝나 있어도 소용없습니다. Shadow DB는 언제나 빈 상태에서 출발하기 때문입니다.

:::warning

**한 번 히스토리에 남으면 계속 막힙니다**

이 상태가 되면 새로운 마이그레이션을 아예 생성할 수 없습니다. `prisma migrate dev`는 물론이고, 파일만 만들어 주는 `prisma migrate dev --create-only`도 Shadow DB를 쓰기 때문에 똑같이 P3006으로 막힙니다.

:::

이것은 Prisma가 자동 생성하는 SQL의 알려진 한계입니다. Prisma는 enum 값 추가와 해당 값 사용을 트랜잭션 분리 없이 단일 마이그레이션 파일에 넣어버립니다. [Prisma GitHub 이슈 #8424](https://github.com/prisma/prisma/issues/8424)에 같은 증상이 보고되어 있습니다.

## 우회: 수동 마이그레이션 3단계

`prisma migrate dev`가 막혀 있어도, 스키마 변경을 계속 반영해야 하는 상황이 있습니다. Prisma 공식 문서가 실패한 마이그레이션을 수습할 때 쓰는 절차를 이 상황에도 응용할 수 있습니다.

:::warning

**이 절차는 `migrate dev`를 되살리지 않습니다**

문제의 마이그레이션 파일이 `prisma/migrations/`에 그대로 남아 있는 한 Shadow DB 재실행은 계속 실패합니다. 아래 3단계는 앞으로의 모든 스키마 변경을 손으로 처리하겠다는 뜻입니다. 근본 복구는 마지막 절에서 다룹니다.

:::

### Step 1: prisma migrate diff로 SQL 생성

현재 데이터베이스 상태와 `schema.prisma` 파일의 차이를 SQL로 생성합니다. 이 명령은 Shadow DB를 사용하지 않고, 실제 DB의 현재 스키마를 직접 읽어서 비교합니다.

리다이렉션은 디렉터리를 만들어주지 않으므로 먼저 만들어야 합니다.

```bash
$ mkdir -p prisma/migrations/<timestamp>_<migration_name>

$ npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > prisma/migrations/<timestamp>_<migration_name>/migration.sql
```

생성된 SQL 파일을 꼭 확인하세요. 의도한 변경 사항만 포함되어 있는지 눈으로 검증하는 것이 중요합니다.

### Step 2: prisma db execute로 직접 실행

생성된 SQL을 데이터베이스에 직접 실행합니다.

```bash
$ npx prisma db execute \
    --file prisma/migrations/<timestamp>_<migration_name>/migration.sql \
    --schema prisma/schema.prisma
```

:::warning

**db execute도 트랜잭션 제약을 피해가지 못합니다**

이 단계가 무사히 넘어가는 이유는 "Shadow DB를 거치지 않아서"가 아닙니다. 이번 diff에 enum 조작이 들어 있지 않아서일 뿐입니다. `db execute`도 파일 내용을 한 번에 보내므로 앞서 설명한 암묵적 트랜잭션에 그대로 묶입니다. 스크립트 안에 `ADD VALUE`와 그 값을 쓰는 문장이 함께 있으면 여기서도 똑같이 실패합니다. enum이 섞이면 파일을 나눠 `db execute`를 두 번 실행해야 합니다.

:::

### Step 3: prisma migrate resolve로 히스토리 등록

마지막으로, 방금 수동으로 적용한 마이그레이션을 Prisma의 마이그레이션 히스토리(`_prisma_migrations` 테이블)에 "적용됨"으로 등록합니다. 인자로는 타임스탬프를 포함한 **디렉터리 이름 전체**를 넘겨야 합니다. 이름만 넘기면 P3017이 납니다.

```bash
$ npx prisma migrate resolve --applied <timestamp>_<migration_name>
```

모든 과정이 끝나면 `prisma migrate status`로 상태를 확인합니다.

```text
$ npx prisma migrate status

Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "devdb", schema "public" at "localhost:5432"

4 migrations found in prisma/migrations

Database schema is up to date!
```

## 근본 복구와 재발 방지

### 마이그레이션 파일을 둘로 나누기

문제의 원인은 한 파일 안에 `ADD VALUE`와 그 값의 사용이 같이 들어간 것이므로, 둘을 별도 마이그레이션으로 나누면 해결됩니다.

```sql
-- 마이그레이션 1 (add_pending_value)
ALTER TYPE "Role" ADD VALUE 'PENDING';
```

```sql
-- 마이그레이션 2 (set_pending_default)
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

:::warning

**적용된 마이그레이션 파일은 함부로 고칠 수 없습니다**

Prisma는 각 마이그레이션의 체크섬을 `_prisma_migrations` 테이블에 저장해 둡니다. 이미 적용된 파일의 내용을 바꾸면 체크섬이 어긋나고, Prisma는 `The migration was modified after it was applied`라며 스키마 리셋을 요구합니다. 그러니 파일 분리는 **아직 적용하기 전**에 하는 것이 원칙입니다.

이미 히스토리에 남아버린 뒤라면 선택지는 둘입니다. 개발 DB를 버려도 되는 상황이면 `prisma migrate reset`으로 히스토리를 다시 쌓는 것이 가장 간단합니다. 그럴 수 없다면 파일을 나눈 뒤 `_prisma_migrations` 테이블의 해당 행까지 손으로 맞춰야 합니다.

:::

애초에 이 상황을 만들지 않는 방법은 `prisma migrate dev --create-only`로 파일만 먼저 생성해 SQL을 확인하는 것입니다. 다만 이 옵션도 Shadow DB를 쓰므로, **이미 P3006에 빠진 뒤에는 쓸 수 없습니다.** 사고 예방용이지 사후 복구용이 아닙니다.

### enum 대신 String 타입 사용

근본적으로, PostgreSQL의 enum은 값 추가나 삭제 때 이런 종류의 제약이 계속 따라옵니다. 값이 자주 변하는 컬럼이라면 **String(TEXT) 타입과 애플리케이션 레벨 검증**으로 전환하는 것이 실용적입니다.

```prisma
// Before: Prisma enum
enum Role {
  ADMIN
  USER
  PENDING
}

model User {
  id   Int    @id @default(autoincrement())
  role Role   @default(PENDING)
}
```

```prisma
// After: String 타입 + 애플리케이션 레벨 검증
model User {
  id   Int    @id @default(autoincrement())
  role String @default("PENDING")
}
```

한 줄 바꾸면 끝나는 일은 아닙니다. 컬럼 타입 변경과 기존 행의 데이터 마이그레이션이 따라오고, 애플리케이션 쪽에도 허용 값을 검증하는 코드가 필요합니다. 그래도 값이 계속 늘어날 컬럼이라면 한 번에 치르는 편이 낫습니다.

:::summary

**핵심 요약**

- PostgreSQL 12부터 `ALTER TYPE ... ADD VALUE`를 트랜잭션 안에서 실행하는 것 자체는 가능하지만, 같은 트랜잭션에서 그 값을 사용하는 것은 여전히 막힙니다.
- Prisma는 파일 내용을 한 번에 보내고, PostgreSQL이 그것을 하나의 암묵적 트랜잭션으로 처리합니다. `db execute`도 마찬가지입니다.
- 처음 적용할 때는 P3018로 깨지고, 그 파일이 히스토리에 남으면 이후 모든 `migrate dev`가 Shadow DB 재실행 단계에서 P3006으로 막힙니다.
- `migrate diff`, `db execute`, `migrate resolve` 3단계는 우회일 뿐입니다. 근본 복구는 마이그레이션 파일을 나누는 것입니다.
- 값이 자주 변하는 컬럼이라면 enum 대신 String 타입을 고려하는 편이 낫습니다.

:::

## 마치며

Prisma는 대부분의 마이그레이션을 깔끔하게 자동 생성해주지만, PostgreSQL의 enum 트랜잭션 제약과 만나면 이런 함정에 빠질 수 있습니다. 특히 에러 코드가 P3018에서 P3006으로 바뀌면서 증상이 "마이그레이션 실패"에서 "새 마이그레이션 생성 불가"로 옮겨가기 때문에, 처음 겪으면 원인을 엉뚱한 곳에서 찾기 쉽습니다.

경험상, enum에 새 값을 추가하는 마이그레이션을 작성할 때는 `--create-only` 옵션으로 먼저 SQL을 확인하고, 필요하다면 수동으로 분리하는 습관을 들이는 것이 좋습니다. 혹은 애초에 값 변동이 잦은 컬럼은 String 타입으로 설계하는 것도 실용적인 선택입니다.

## 함께 보면 좋은 글

- [MySQL SELECT가 변경을 못 읽는 이유](/troubleshooting/mysql-repeatable-read-autocommit/) : 트랜잭션 경계를 오해했을 때 벌어지는 또 다른 사고

## 참고자료

- [PostgreSQL ALTER TYPE 공식 문서](https://www.postgresql.org/docs/current/sql-altertype.html)
- [PostgreSQL 12 릴리스 노트](https://www.postgresql.org/docs/release/12.0/)
- [Prisma: Shadow database](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
- [Prisma: Patching and hotfixing](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)
- [Prisma GitHub Issue #8424](https://github.com/prisma/prisma/issues/8424)
