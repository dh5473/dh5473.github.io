---
date: '2026-03-23'
title: 'Prisma P3006 에러 해결: PostgreSQL enum의 트랜잭션 제약과 Shadow DB 문제'
category: 'Troubleshooting'
summary: 'prisma migrate dev의 P3006 에러 원인과, Shadow DB를 우회하는 수동 마이그레이션 해결법을 정리합니다.'
thumbnail: './thumbnail.png'
tags: ['Prisma', 'PostgreSQL', 'Migration', 'Shadow Database']
---

사내 인증 시스템에 SSO를 붙이면서, 기존 `Role` enum에 `PENDING` 값을 추가하는 마이그레이션을 작성했습니다. (웬만하면 enum은 쓰지 않는게 좋습니다.) 로컬 개발 DB에는 문제없이 적용됐고, 스테이징에도 잘 올라갔습니다. 그런데 며칠 뒤 다른 스키마 변경을 하려고 `prisma migrate dev`를 실행하는 순간, 전혀 예상하지 못한 에러가 터졌습니다.

<br>

## 에러 상황: P3006 Migration failed to apply cleanly

`prisma migrate dev`를 실행하자 다음과 같은 에러가 발생했습니다.

```
Error: P3006

Migration `20260319074550_add_pending_role` failed to apply cleanly
to the shadow database.
Error:
ERROR: unsafe use of new value "PENDING" of enum type "Role"
HINT: New enum values must be committed before they can be used.

0: schema_core::state::DevDiagnostic
   at schema-engine/core/src/state.rs:314
```

문제의 마이그레이션 파일(`20260319074550_add_pending_role/migration.sql`)을 열어보면, Prisma가 자동 생성한 SQL은 이렇게 생겼습니다.

```sql
-- 1) enum에 PENDING 값 추가
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 2) 바로 다음 줄에서 PENDING을 DEFAULT로 사용
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

언뜻 보면 자연스러운 흐름입니다. enum에 값을 추가하고, 그 값을 기본값으로 설정하는 것이니까요. 하지만 이 두 SQL문이 **하나의 트랜잭션** 안에서 실행되면 PostgreSQL이 거부합니다.

이미 성공적으로 적용된 마이그레이션인데 왜 갑자기 에러가 나는 걸까요? 그 답은 Prisma의 **Shadow Database** 메커니즘에 있습니다.

<br>

## 원인 분석: PostgreSQL enum과 트랜잭션의 제약

### ALTER TYPE ... ADD VALUE의 트랜잭션 제약

PostgreSQL에서 enum 타입은 시스템 카탈로그(`pg_enum`)에 저장되는 특수한 데이터 타입입니다. 일반 테이블 데이터와 달리, enum 값의 추가는 **카탈로그 수준의 DDL 변경**이기 때문에 트랜잭션 처리에 특별한 제약이 따릅니다.

핵심은 이겁니다: `ALTER TYPE ... ADD VALUE`로 추가된 enum 값은 **해당 트랜잭션이 커밋된 후에야 사용 가능**합니다. PostgreSQL이 이런 제약을 두는 이유는 enum 값의 OID(Object Identifier) 할당과 관련이 있습니다.

```sql
-- 트랜잭션 시작 (Prisma가 마이그레이션 파일 전체를 하나의 트랜잭션으로 실행)
BEGIN;

-- 새 enum 값 'PENDING'에 OID가 할당됨
-- 하지만 이 OID는 아직 다른 세션/문맥에서 "보이지 않는" 상태
ALTER TYPE "Role" ADD VALUE 'PENDING';

-- 같은 트랜잭션에서 'PENDING'을 참조하려 하면?
-- PostgreSQL: "이 값은 아직 커밋되지 않았으므로 사용할 수 없습니다"
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
-- ERROR: unsafe use of new value "PENDING" of enum type "Role"

COMMIT;
```

PostgreSQL 내부적으로, `ADD VALUE`는 `pg_enum` 카탈로그에 새 행을 삽입하면서 `enumsortorder` 값을 할당합니다. 하지만 **트랜잭션 격리(Transaction Isolation)** 규칙에 의해, 이 새 행은 트랜잭션이 커밋되기 전까지는 "확정된 값"으로 취급되지 않습니다. 만약 트랜잭션이 롤백되면 그 enum 값도 사라져야 하는데, 이미 그 값을 참조하는 행이 있다면 정합성이 깨지기 때문입니다.

이것은 PostgreSQL의 의도된 동작이며, [공식 문서](https://www.postgresql.org/docs/current/sql-altertype.html)에도 명시되어 있습니다.

> `ADD VALUE` (the form that adds a new value to an enum type) cannot be executed inside a transaction block.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고: PostgreSQL 12 이후의 변화</strong><br>
  PostgreSQL 12부터 <code>ALTER TYPE ... ADD VALUE</code>를 트랜잭션 내에서 실행하는 것 자체는 허용되었습니다. 하지만 <strong>같은 트랜잭션 안에서 그 새 값을 참조하는 것</strong>은 여전히 금지됩니다. 즉, <code>ADD VALUE</code>와 그 값을 사용하는 <code>ALTER TABLE</code>을 별도의 트랜잭션(또는 별도의 마이그레이션 파일)으로 분리해야 합니다.
</div>

### Prisma Shadow Database가 문제를 증폭시키는 구조

여기서 한 가지 의문이 생깁니다. "이 마이그레이션은 며칠 전에 이미 성공적으로 적용됐는데, 왜 지금 에러가 나는 거지?"

답은 Prisma의 **Shadow Database** 메커니즘에 있습니다. `prisma migrate dev`를 실행하면, Prisma는 단순히 새 마이그레이션만 적용하는 게 아닙니다. 내부적으로 다음과 같은 과정을 거칩니다.

<div style="text-align: center; margin: 24px 0;">
<svg width="520" height="680" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif">
  <rect width="520" height="680" fill="#fafbfc" rx="12"/>
  <text x="260" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#1f2937">prisma migrate dev 내부 동작</text>
  <rect x="145" y="56" width="230" height="44" rx="8" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/>
  <text x="260" y="83" text-anchor="middle" font-size="13" font-weight="600" fill="#065f46">① prisma migrate dev 실행</text>
  <line x1="260" y1="100" x2="260" y2="130" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#arrowGray)"/>
  <rect x="145" y="130" width="230" height="44" rx="8" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/>
  <text x="260" y="149" text-anchor="middle" font-size="13" font-weight="600" fill="#065f46">② Shadow DB 생성</text>
  <text x="260" y="165" text-anchor="middle" font-size="11" fill="#6b7280">(빈 임시 데이터베이스)</text>
  <line x1="260" y1="174" x2="260" y2="204" stroke="#9ca3af" stroke-width="1.5" marker-end="url(#arrowGray)"/>
  <rect x="50" y="204" width="420" height="280" rx="8" fill="#ffffff" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="260" y="228" text-anchor="middle" font-size="13" font-weight="700" fill="#374151">③ 모든 마이그레이션 순차 Replay</text>
  <rect x="90" y="244" width="340" height="36" rx="6" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="1"/>
  <text x="120" y="267" font-size="12" fill="#065f46">Migration 1: init</text>
  <text x="390" y="267" text-anchor="end" font-size="12" font-weight="600" fill="#10b981">✓ OK</text>
  <rect x="90" y="288" width="340" height="36" rx="6" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="1"/>
  <text x="120" y="311" font-size="12" fill="#065f46">Migration 2: add_user_table</text>
  <text x="390" y="311" text-anchor="end" font-size="12" font-weight="600" fill="#10b981">✓ OK</text>
  <text x="260" y="340" text-anchor="middle" font-size="14" fill="#9ca3af">···</text>
  <rect x="90" y="352" width="340" height="56" rx="6" fill="#fef2f2" stroke="#ef4444" stroke-width="2"/>
  <text x="120" y="372" font-size="12" font-weight="600" fill="#991b1b">Migration N: add_pending_role</text>
  <text x="390" y="372" text-anchor="end" font-size="13" font-weight="700" fill="#ef4444">✗ FAIL</text>
  <text x="120" y="396" font-size="10.5" fill="#991b1b" font-family="JetBrains Mono, monospace">ALTER TYPE + SET DEFAULT → 같은 트랜잭션</text>
  <rect x="90" y="420" width="340" height="52" rx="6" fill="#ef4444" stroke="#dc2626" stroke-width="1.5"/>
  <text x="260" y="440" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">P3006: unsafe use of new value "PENDING"</text>
  <text x="260" y="458" text-anchor="middle" font-size="11" fill="#fecaca">Shadow DB에서 재실행할 때마다 반복 실패!</text>
  <rect x="145" y="510" width="230" height="44" rx="8" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="260" y="537" text-anchor="middle" font-size="13" fill="#9ca3af">④ schema.prisma와 diff 비교</text>
  <text x="395" y="538" font-size="16" fill="#d1d5db">✗</text>
  <text x="395" y="554" font-size="9" fill="#d1d5db">도달 불가</text>
  <line x1="260" y1="554" x2="260" y2="584" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arrowLightGray)"/>
  <rect x="145" y="584" width="230" height="44" rx="8" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text x="260" y="611" text-anchor="middle" font-size="13" fill="#9ca3af">⑤ Shadow DB 삭제</text>
  <text x="395" y="612" font-size="16" fill="#d1d5db">✗</text>
  <text x="395" y="628" font-size="9" fill="#d1d5db">도달 불가</text>
  <text x="260" y="660" text-anchor="middle" font-size="11" fill="#9ca3af">③에서 실패하면 이후 모든 prisma migrate dev가 차단됨</text>
  <defs>
    <marker id="arrowGray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af"/>
    </marker>
    <marker id="arrowLightGray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#d1d5db"/>
    </marker>
  </defs>
</svg>
</div>

<p align="center" style="color: #888; font-size: 14px;">
  <em>prisma migrate dev의 Shadow DB 워크플로우 — ③에서 enum 트랜잭션 제약에 걸려 실패한다</em>
</p>

1. **Shadow DB 생성**: 완전히 빈 임시 데이터베이스를 생성합니다.
2. **전체 마이그레이션 재실행**: `prisma/migrations/` 폴더에 있는 **모든 마이그레이션을 처음부터 순차적으로** 실행합니다.
3. **스키마 비교**: Shadow DB의 최종 스키마와 현재 `schema.prisma` 파일을 비교하여 새로 필요한 마이그레이션을 생성합니다.
4. **Shadow DB 삭제**: 임시 데이터베이스를 제거합니다.

Shadow DB가 존재하는 이유는 **마이그레이션 히스토리의 무결성 검증**입니다. 모든 마이그레이션을 처음부터 재실행해서, 마이그레이션 파일들이 정확하게 현재 스키마를 재현할 수 있는지 확인하는 것이죠. 실제 개발 DB는 수동 변경이나 직접 SQL 실행으로 인해 마이그레이션 히스토리와 어긋날 수 있기 때문에, "깨끗한 상태에서의 재현"이 필요합니다.

문제는 2단계에 있습니다. Shadow DB에서 마이그레이션을 재실행할 때, Prisma는 **각 마이그레이션 파일의 SQL을 하나의 트랜잭션으로 실행**합니다. 그래서 `add_pending_role` 마이그레이션의 두 SQL문이 같은 트랜잭션에 묶이고, PostgreSQL의 enum 트랜잭션 제약에 걸리는 겁니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 핵심 포인트</strong><br>
  최초 <code>prisma migrate dev</code> 실행 시에는 개발 DB에 직접 적용되므로 성공할 수 있습니다(이미 커밋된 상태에서 이어서 실행). 하지만 <strong>이후 모든 <code>prisma migrate dev</code> 호출</strong>에서 Shadow DB가 이 마이그레이션을 재실행할 때마다 실패합니다. 결과적으로 <strong>새로운 마이그레이션을 전혀 생성할 수 없는</strong> 상태가 됩니다.
</div>

이것은 Prisma가 자동 생성하는 SQL의 알려진 한계입니다. Prisma는 enum 값 추가와 해당 값 사용을 트랜잭션 분리 없이 단일 마이그레이션 파일에 넣어버립니다. [Prisma GitHub 이슈](https://github.com/prisma/prisma/issues/7815)에서도 꾸준히 보고되고 있는 문제입니다.

<br>

## 해결 방법: Shadow DB를 우회하는 수동 마이그레이션

`prisma migrate dev`가 Shadow DB를 사용하기 때문에 문제가 발생하므로, Shadow DB를 거치지 않는 수동 마이그레이션 방식으로 우회할 수 있습니다. Prisma 공식 문서에서도 이런 상황에 대해 3단계 수동 적용 방식을 권장합니다.

### Step 1: prisma migrate diff로 SQL 생성

현재 데이터베이스 상태와 `schema.prisma` 파일의 차이를 SQL로 생성합니다. 이 명령은 Shadow DB를 사용하지 않고, 실제 DB의 현재 스키마를 직접 읽어서 비교합니다.

```bash
$ npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > prisma/migrations/<timestamp>_<migration_name>/migration.sql
```

생성된 SQL 파일을 꼭 확인하세요. 의도한 변경 사항만 포함되어 있는지 눈으로 검증하는 것이 중요합니다.

### Step 2: prisma db execute로 직접 실행

생성된 SQL을 데이터베이스에 직접 실행합니다. 이 과정은 Shadow DB를 거치지 않으므로, enum 트랜잭션 문제의 영향을 받지 않습니다.

```bash
$ npx prisma db execute \
    --file prisma/migrations/<timestamp>_<migration_name>/migration.sql \
    --schema prisma/schema.prisma
```

### Step 3: prisma migrate resolve로 히스토리 등록

마지막으로, 방금 수동으로 적용한 마이그레이션을 Prisma의 마이그레이션 히스토리(`_prisma_migrations` 테이블)에 "적용됨"으로 등록합니다.

```bash
$ npx prisma migrate resolve --applied <migration_name>
```

모든 과정이 끝나면 `prisma migrate status`로 상태를 확인합니다.

```bash
$ npx prisma migrate status

Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database

20260101000000_init
20260215120000_add_user_table
20260319074550_add_pending_role
20260323100000_new_migration

Database schema is up to date!
```

모든 마이그레이션이 정상 적용된 것으로 표시되면 성공입니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 팁</strong><br>
  이 방식은 prod/dev 히스토리를 깨뜨리지 않습니다. <code>prisma migrate resolve</code>는 마이그레이션 히스토리 테이블에 기록만 남기므로, 기존에 적용된 마이그레이션과 충돌하지 않습니다.
</div>

<br>

## 재발 방지

### 방법 1: 마이그레이션 파일 수동 분리

Prisma가 생성한 마이그레이션 SQL에서 enum 값 추가와 사용이 같은 파일에 있다면, 수동으로 두 개의 마이그레이션으로 분리할 수 있습니다.

```sql
-- ❌ Before: 하나의 마이그레이션 파일
ALTER TYPE "Role" ADD VALUE 'PENDING';
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

```sql
-- ✅ After: 마이그레이션 1 (add_pending_value)
ALTER TYPE "Role" ADD VALUE 'PENDING';
```

```sql
-- ✅ After: 마이그레이션 2 (set_pending_default)
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'PENDING';
```

`prisma migrate dev --create-only`로 마이그레이션 파일만 생성한 뒤 SQL을 직접 편집하고, 필요하다면 폴더를 분리하면 됩니다.

### 방법 2: enum 대신 String 타입 사용

근본적으로, PostgreSQL의 enum은 값 추가/삭제 시 이런 종류의 제약이 계속 따라옵니다. 값이 자주 변하는 컬럼이라면 **String(TEXT) 타입 + 애플리케이션 레벨 검증**으로 전환하는 것이 실용적입니다.

```prisma
// ❌ Before: Prisma enum
enum Role {
  ADMIN
  USER
  PENDING
}

model User {
  role Role @default(PENDING)
}

// ✅ After: String 타입 + 애플리케이션 레벨 검증
model User {
  role String @default("PENDING")
}
```

실제로 이번 프로젝트에서도 SSO 전환 과정에서 `Role`을 enum에서 TEXT 컬럼으로 변경했습니다(`remove_role_enum` 마이그레이션). 이후로는 같은 문제가 발생하지 않고 있습니다.

<div style="background: #f8f9fa; border: 1px solid #e9ecef; padding: 20px; margin: 24px 0; border-radius: 8px;">
  <strong>📌 핵심 요약</strong><br><br>
  <ul style="margin: 0; padding-left: 20px;">
    <li>PostgreSQL에서 <code>ALTER TYPE ... ADD VALUE</code>로 추가한 enum 값은 같은 트랜잭션 내에서 사용할 수 없다</li>
    <li>Prisma의 Shadow DB는 모든 마이그레이션을 처음부터 재실행하므로, 이 문제가 한 번 발생하면 이후 모든 <code>migrate dev</code>가 막힌다</li>
    <li><code>prisma migrate diff</code> → <code>db execute</code> → <code>migrate resolve</code> 3단계로 Shadow DB를 우회할 수 있다</li>
    <li>장기적으로는 자주 변하는 enum을 String 타입으로 전환하는 것이 안전하다</li>
  </ul>
</div>

<br>

## 마치며

Prisma는 대부분의 마이그레이션을 깔끔하게 자동 생성해주지만, PostgreSQL의 enum 트랜잭션 제약과 만나면 이런 함정에 빠질 수 있습니다. 특히 Shadow DB 때문에 "이미 적용된 마이그레이션이 갑자기 실패하는" 상황은 처음 겪으면 상당히 당황스럽습니다.

경험상, enum에 새 값을 추가하는 마이그레이션을 작성할 때는 `--create-only` 옵션으로 먼저 SQL을 확인하고, 필요하다면 수동으로 분리하는 습관을 들이는 것이 좋습니다. 혹은 애초에 값 변동이 잦은 컬럼은 String 타입으로 설계하는 것도 실용적인 선택입니다.

<br>

## 참고자료

- [PostgreSQL ALTER TYPE 공식 문서](https://www.postgresql.org/docs/current/sql-altertype.html)
- [Prisma — Production troubleshooting](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-troubleshooting)
- [Prisma GitHub Issue #7815 — Enum migration transaction issue](https://github.com/prisma/prisma/issues/7815)
- [Prisma — prisma migrate diff](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-diff)
