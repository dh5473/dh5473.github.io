---
date: '2026-04-18'
title: 'B-tree 너머: GIN, GiST, BRIN, Hash는 언제 쓰는가'
category: 'Database'
series: 'postgres'
seriesOrder: 5
tags: ['PostgreSQL', 'Index', 'GIN', 'GiST', 'BRIN']
summary: '전문 검색, JSONB 포함 관계, 시계열 거대 테이블처럼 B-tree가 다루지 못하는 영역이 있습니다. GIN·GiST·BRIN·Hash의 내부 구조가 각각 어떤 접근 패턴에 최적화돼 있는지, 언제 쓰고 언제 쓰면 안 되는지를 짚어봅니다.'
thumbnail: './thumbnail.png'
---

`articles(content)`에 B-tree 인덱스를 걸어뒀는데 `WHERE content LIKE '%postgres%'`를 던지면 여전히 Seq Scan입니다. `events(tags jsonb)`에 B-tree를 만들어도 `WHERE tags @> '["urgent"]'`는 인덱스를 안 탑니다. 1억 건짜리 로그 테이블 `logs(ts)`에 B-tree를 만들었더니 인덱스 하나가 2GB를 넘어갑니다.

세 현상은 모두 "인덱스 = B-tree"라는 암묵적 디폴트가 깨지는 지점입니다. [B-tree](/postgres/btree-anatomy/)는 **값을 한 줄로 쭉 세울 수 있는 타입**에 최적화된 자료구조입니다. 숫자처럼 크고 작음이 분명하거나, 문자열처럼 사전순으로 나열할 수 있으면 B-tree의 영역입니다. 그런데 문서 안에 들어 있는 단어 하나하나를 찾거나, JSON 안에 특정 키가 들어 있는지 묻거나, 도형 두 개가 겹치는지 물을 때는 "한 줄로 세우기"라는 전제가 성립하지 않습니다.

이 글에서는 PostgreSQL이 기본 제공하는 네 가지 대안, GIN·GiST·BRIN·Hash의 내부 구조와 각각이 커버하는 쿼리 패턴을 짚습니다. 각 인덱스가 어떤 자료구조 위에 올라가 있는지 알면 "왜 이 쿼리엔 이게 맞는지", 그리고 더 중요하게 "왜 이걸 쓰면 안 되는지"가 보입니다.

## B-tree가 손대지 못하는 영역

B-tree의 전제는 하나의 값에 하나의 자리가 있다는 것입니다. `name = 'Kim'`처럼 컬럼 값이 키 하나로 결정되면 리프에 `'Kim' → ctid`를 기록하면 끝납니다. 그런데 실무 쿼리 중에는 이 전제가 깨지는 경우가 있습니다.

- `content = '... postgres is great ...'`에서 **"postgres"라는 단어를 포함하는가**를 묻고 싶습니다. 하나의 문서에 단어는 수백 개입니다.
- `tags = '["urgent", "billing"]'` JSONB에서 **`"urgent"`를 포함하는가**를 묻고 싶습니다. 하나의 row에 태그는 여럿입니다.
- `geom` 컬럼의 **두 도형이 겹치는가**(`&&`). 도형의 한 차원 값만으로 순서를 매길 방법이 없습니다.
- `created_at`이 시간순으로 append-only로 쌓이는 로그 테이블에서 범위 스캔을 빠르게 하고 싶은데, 인덱스 크기는 최소로 두고 싶습니다.

앞의 세 질문은 "한 row가 여러 개의 인덱스 키로 쪼개지거나(문서, 태그 배열)" "값끼리 크고 작음으로 줄 세울 수 없는(도형 겹침)" 경우입니다. 네 번째는 B-tree로 풀 수는 있지만 **인덱스가 너무 커서 배보다 배꼽이 더 큰** 경우입니다. 각각에 대응하는 해법이 GIN·GiST·BRIN입니다. Hash는 결이 조금 다릅니다. `=` 하나만 쓰는 조회에서 인덱스를 B-tree보다 작게 만들 수 있느냐에 대한 답입니다.

## GIN: 역색인의 세계

GIN(Generalized Inverted Index)은 이름 그대로 **역색인**입니다. 책 뒤에 붙은 찾아보기(인덱스)를 떠올리면 쉽습니다. "이 책의 47쪽에 postgres가 나온다"를 반대로 뒤집어서 "postgres가 나오는 곳은 47쪽, 112쪽, 203쪽"으로 정리해 두는 구조입니다. 전문 검색, JSONB, 배열, `pg_trgm` 기반 `LIKE`처럼 "하나의 row가 여러 개의 인덱스 키로 쪼개지는" 패턴이면 GIN이 정답인 경우가 많습니다.

### 구조: posting list와 posting tree

GIN 내부에는 키를 정렬해 담은 B-tree가 하나 있고, 이것을 **entry tree**라고 부릅니다. 여기서 키는 인덱싱 대상 값을 쪼갠 조각입니다. `tsvector`라면 단어 하나, 배열이라면 원소 하나, trigram이라면 3글자 조각 하나입니다. entry tree의 리프에는 각 키에 대해 "이 키가 들어 있는 row들의 주소(`ctid`)" 묶음이 달립니다. 묶음이 작으면 키 값과 같은 인덱스 튜플 안에 **posting list**로 짧게 붙여두고, 한 튜플에 담기지 못할 만큼 커지면 **posting tree**라는 별도의 B-tree로 분리해 담습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 478" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 B-tree가 한 행의 문자열 전체를 키 하나로 저장해 문자열 안의 단어를 찾지 못하는 구조. 아래쪽은 GIN이 한 행을 여러 토큰으로 쪼개 엔트리 트리에 키를 한 번만 두고, 각 키 아래에 그 키를 가진 행 ID 목록인 posting list를 붙여 두는 역색인 구조.">
<style>.gg1-t{font-size:20px;font-weight:700;fill:var(--text, #1c1917)}.gg1-l{font-size:17px;fill:var(--text, #1c1917)}.gg1-k{font-size:18px;font-weight:600;fill:var(--text, #1c1917)}.gg1-m{font-size:17px;fill:var(--text-muted, #6d6762)}.gg1-box{fill:var(--bg-subtle, #f5f4f2);stroke:var(--border, #e7e5e4);stroke-width:1.5}.gg1-key{fill:var(--bg-muted, #eeecea);stroke:var(--primary, #0a756c);stroke-width:1.8}.gg1-pl{fill:var(--bg, #fafaf8);stroke:var(--primary, #0a756c);stroke-width:1.5}.gg1-ln{stroke:var(--text-muted, #6d6762);stroke-width:1.5;fill:none}</style>
<defs>
<marker id="gg1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 위 패널: B-tree -->
<text x="240" y="26" text-anchor="middle" class="gg1-t">위: B-tree, 한 행에 키 하나</text>
<rect x="20" y="44" width="210" height="38" rx="6" class="gg1-box"/>
<text x="125" y="69" text-anchor="middle" class="gg1-l">#1 postgres vacuum</text>
<line x1="236" y1="63" x2="266" y2="63" class="gg1-ln" marker-end="url(#gg1Arrow)"/>
<rect x="272" y="44" width="188" height="38" rx="6" class="gg1-key"/>
<text x="366" y="70" text-anchor="middle" class="gg1-k">'postgres vacuum'</text>
<line x1="20" y1="108" x2="460" y2="108" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<!-- 아래 패널: GIN -->
<text x="240" y="140" text-anchor="middle" class="gg1-t">아래: GIN, 한 행에 키 여럿</text>
<rect x="90" y="156" width="300" height="32" rx="6" class="gg1-box"/>
<text x="106" y="178" class="gg1-l">#1  postgres vacuum</text>
<rect x="90" y="194" width="300" height="32" rx="6" class="gg1-box"/>
<text x="106" y="216" class="gg1-l">#2  index tuning</text>
<rect x="90" y="232" width="300" height="32" rx="6" class="gg1-box"/>
<text x="106" y="254" class="gg1-l">#3  postgres index</text>
<line x1="240" y1="270" x2="240" y2="296" class="gg1-ln" marker-end="url(#gg1Arrow)"/>
<text x="252" y="290" class="gg1-m">토큰으로 분해</text>
<text x="240" y="316" text-anchor="middle" class="gg1-m">엔트리 트리: 키 하나에 한 줄</text>
<rect x="12" y="326" width="142" height="38" rx="6" class="gg1-key"/>
<text x="83" y="351" text-anchor="middle" class="gg1-k">'postgres'</text>
<rect x="169" y="326" width="142" height="38" rx="6" class="gg1-key"/>
<text x="240" y="351" text-anchor="middle" class="gg1-k">'index'</text>
<rect x="326" y="326" width="142" height="38" rx="6" class="gg1-key"/>
<text x="397" y="351" text-anchor="middle" class="gg1-k">'vacuum'</text>
<line x1="83" y1="364" x2="83" y2="390" class="gg1-ln" marker-end="url(#gg1Arrow)"/>
<line x1="240" y1="364" x2="240" y2="390" class="gg1-ln" marker-end="url(#gg1Arrow)"/>
<line x1="397" y1="364" x2="397" y2="390" class="gg1-ln" marker-end="url(#gg1Arrow)"/>
<rect x="12" y="396" width="142" height="36" rx="6" class="gg1-pl"/>
<text x="83" y="420" text-anchor="middle" class="gg1-l">#1, #3</text>
<rect x="169" y="396" width="142" height="36" rx="6" class="gg1-pl"/>
<text x="240" y="420" text-anchor="middle" class="gg1-l">#2, #3</text>
<rect x="326" y="396" width="142" height="36" rx="6" class="gg1-pl"/>
<text x="397" y="420" text-anchor="middle" class="gg1-l">#1</text>
<text x="240" y="456" text-anchor="middle" class="gg1-m">posting list: 그 키를 가진 행 ID 목록</text>
</svg>
</div>

핵심 차이는 **한 행이 인덱스 엔트리 몇 개가 되느냐**입니다. B-tree는 행 하나가 키 하나이므로 `'postgres vacuum'`이라는 문자열은 통째로 한 자리를 차지하고, 그 안의 `postgres`만 따로 찾을 방법이 없습니다. GIN은 같은 행을 `postgres`, `vacuum` 두 키로 쪼개 넣고, 각 키 아래에 그 키를 가진 행들의 `ctid`를 모읍니다. `'postgres'`가 1만 개 문서에 나와도 엔트리 트리에는 `'postgres'` 한 줄만 있고, 그 아래 ctid 1만 개가 붙습니다.

(PG 13부터는 B-tree도 중복 키를 posting list로 묶어 저장합니다. 다만 그건 같은 키가 여러 번 나올 때 압축하는 것이고, 하나의 값을 여러 키로 쪼개서 넣는 일은 GIN만 합니다.)

### 대표 용도

- **전문 검색**(`tsvector`): 문서 전체 텍스트를 단어 단위로 쪼개 저장하는 타입이 `tsvector`입니다. 여기에 GIN을 걸어두면 `WHERE doc @@ to_tsquery('postgres & index')` 같은 **"이 단어들을 포함하는 문서 찾기"** 쿼리가 인덱스를 탑니다.
- **JSONB 포함 관계**(containment): "내 JSON이 이 JSON을 포함하는가"를 묻는 `@>` 연산자가 대표입니다. 예: `tags @> '["urgent"]'`는 태그 배열에 `"urgent"`가 들어 있는 row를 찾습니다. 여기서 **opclass**(operator class, 인덱스가 이 타입에서 어떤 연산자를 어떻게 처리할지 정의한 묶음)가 두 가지입니다. 기본 `jsonb_ops`는 포함 관계 `@>`와 jsonpath 매칭 `@?`, `@@`에 더해 `?`(키 존재), `?|`(키 중 하나 존재), `?&`(모두 존재) 같은 키-유무 연산자까지 지원합니다. 경량 `jsonb_path_ops`는 키-유무 연산자를 빼고 `@>`, `@?`, `@@`만 지원하는 대신 인덱스가 훨씬 작고, 흔한 키가 섞인 조건에서 후보를 더 좁게 잡습니다. 키 존재 여부를 묻지 않는다면 `jsonb_path_ops`가 기본 선택입니다.
- **배열 포함 관계**: `int[]`, `text[]` 등의 배열에서 `@>`(포함), `<@`(반대 포함), `&&`(교집합 존재) 연산자.
- **Trigram 유사도**(`pg_trgm` + `gin_trgm_ops`): 문자열을 3글자 단위 조각으로 쪼개 인덱싱합니다. 예를 들어 `"postgres"`는 padding을 포함해 `{"  p"," po","pos","ost","stg","tgr","gre","res","es "}` 같은 trigram으로 분해됩니다(공식 함수 `show_trgm('postgres')`로 확인 가능). 이 구조 위에서 `LIKE '%foo%'`, `ILIKE`가 인덱스를 탑니다. 부분 문자열 검색을 인덱스로 푸는 거의 유일한 공식 경로입니다.

### 실험: JSONB에 GIN 걸기

```sql
CREATE TABLE events (
    id bigserial PRIMARY KEY,
    tags jsonb NOT NULL
);

INSERT INTO events (tags)
SELECT jsonb_build_array(
    (ARRAY['urgent','billing','auth','api','mobile'])[floor(random()*5)::int + 1],
    (ARRAY['p0','p1','p2','p3'])[floor(random()*4)::int + 1]
)
FROM generate_series(1, 500000);

ANALYZE events;

-- 인덱스 없이
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM events WHERE tags @> '["urgent"]';
--  Seq Scan on events (cost=0.00..10406.00 ...) (actual time=0.030..62.218 rows=99830 ...)
--    Filter: (tags @> '["urgent"]'::jsonb)
--    Buffers: shared hit=5406

CREATE INDEX events_tags_gin ON events USING gin (tags jsonb_path_ops);

EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM events WHERE tags @> '["urgent"]';
--  Bitmap Heap Scan on events (cost=... rows=100000 ...) (actual time=8.2..24.5 ...)
--    Recheck Cond: (tags @> '["urgent"]'::jsonb)
--    Heap Blocks: exact=5406
--    ->  Bitmap Index Scan on events_tags_gin (actual time=7.5..7.5 rows=99830 ...)
```

GIN의 plan을 보면 항상 **Bitmap Index Scan → Bitmap Heap Scan** 두 단계가 나옵니다. B-tree처럼 "정렬된 인덱스를 순서대로 훑으며 하나씩 힙을 읽는" 방식이 불가능하기 때문입니다. GIN 리프에는 "키 하나에 달린 ctid 묶음"만 들어 있어서, 일단 해당하는 ctid들을 모두 모아 비트맵을 만든 뒤 그 비트맵이 가리키는 힙 페이지들을 한꺼번에 스캔합니다.

`Recheck Cond` 줄도 이 과정의 일부입니다. 비트맵이 "이 페이지들에 후보가 있다"까지만 알려주기 때문에, 힙을 실제로 읽어서 조건을 최종 확인하는 단계가 필요합니다.

### 실험: `LIKE '%...%'`를 인덱스에 태우기

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE articles (
    id bigserial PRIMARY KEY,
    title text NOT NULL
);

INSERT INTO articles (title)
SELECT md5(random()::text) || ' ' || md5(random()::text)
FROM generate_series(1, 200000);

-- 기본 B-tree로는 prefix(LIKE 'abc%')만 가능
-- GIN + trgm은 contains(LIKE '%abc%')도 가능
CREATE INDEX articles_title_trgm ON articles USING gin (title gin_trgm_ops);

EXPLAIN (ANALYZE) SELECT * FROM articles WHERE title LIKE '%abcd%';
--  Bitmap Heap Scan on articles ...
--    Recheck Cond: (title ~~ '%abcd%'::text)
--    ->  Bitmap Index Scan on articles_title_trgm ...
```

B-tree + `text_pattern_ops`로는 `LIKE 'abc%'`만 걸 수 있었는데, trigram GIN으로는 `%abc%`가 인덱스를 탑니다. 대신 3글자 미만의 검색어는 추출 가능한 trigram이 거의 없어 인덱스 스캔이 full scan에 가까워집니다.

### 쓰기가 비싸다는 약점과 fastupdate

GIN의 약점은 **쓰기 비용**입니다. row 하나를 INSERT/UPDATE할 때마다 `tsvector`에 들어 있는 단어 수백 개 각각의 posting list를 건드려야 하니까, 키 하나만 건드리면 되는 B-tree와 비교가 안 됩니다. 쓰기 한 번에 인덱스를 수십\~수백 번 건드리는 셈입니다.

이 때문에 GIN은 `fastupdate` 저장 파라미터가 기본 `on`인 상태로 출발합니다. 새 엔트리를 곧바로 메인 구조에 반영하지 않고 **pending list**라는 정렬되지 않은 선형 영역에 먼저 모아둡니다. 이 리스트는 세 가지 계기에 한꺼번에 메인 구조로 병합됩니다. 테이블이 VACUUM 또는 autoanalyze될 때, `gin_clean_pending_list()`를 직접 호출할 때, 그리고 리스트가 `gin_pending_list_limit`(기본 4MB)을 넘을 때입니다.

트레이드오프: 쓰기는 빠르지만, pending list가 커진 상태에서 검색을 하면 pending list를 **선형으로 훑어야** 하므로 검색이 느려집니다. 쓰기 폭주가 심한 테이블에서는 pending list를 주기적으로 비워주는 `gin_clean_pending_list()` 호출이나, 극단적인 경우 `fastupdate = off`를 고려합니다.

이게 "GIN을 걸었는데 가끔 검색이 튄다"의 전형적인 원인입니다. `pageinspect` 확장의 `gin_metapage_info(get_raw_page('idx_name', 0))`로 `n_pending_pages`, `n_pending_tuples`를 확인할 수 있습니다.

## GiST: 확장 가능한 search tree

GiST(Generalized Search Tree)는 이름만큼 추상적인 인프라입니다. 한 문장으로 말하면 "트리 구조만 제공하고, 값끼리 어떤 포함 관계가 있는지는 타입별로 알아서 정의하게" 만든 프레임워크입니다.

### 구조: 경계 상자를 타고 내려가는 트리

B-tree는 값을 한 줄로 줄 세운 뒤 `<`, `=`, `>`로 비교만 하면 끝입니다. GiST는 다릅니다. 각 내부 노드가 "내 밑의 자식들이 가진 값들을 전부 감싸는 **경계 상자**"를 들고 있고, 검색은 "내가 찾는 값이 이 경계 상자 안에 들어갈 가능성이 있는가?"만 확인하면서 내려갑니다.

"경계 상자"의 구체적 모양은 데이터 타입마다 다릅니다.

- geometry라면 → 자식 도형들을 전부 감싸는 사각형(bounding box)
- range type이라면 → 자식 range들의 최소\~최대를 합친 큰 range
- 문자열(`pg_trgm`)이라면 → 자식들이 가진 모든 trigram 조각의 집합

즉 같은 GiST 인프라 위에 opclass만 바꿔 끼우면 "도형 겹침", "시간 범위 포함", "문자열 유사도"처럼 전혀 다른 쿼리를 지원할 수 있습니다.

### 대표 용도

- **Geometry**(PostGIS): 지도 위의 도형이나 좌표 데이터. `ST_Intersects`, `&&`(겹침), `<->`(두 도형 사이의 거리) 같은 공간 연산. PostGIS는 거의 전적으로 GiST 위에 올라갑니다.
- **Range types**: `tstzrange`(시간 범위), `int4range`(정수 범위) 같은 타입의 `&&`(겹침), `@>`(포함), `-|-`(인접) 연산.
- **`pg_trgm` 유사도 검색**: GIN은 `LIKE '%foo%'` 같은 "들어있냐 없냐"에 강하고, GiST는 **"가까운 순으로 정렬"**에 강합니다. 예를 들어 사용자가 "kim"을 검색했을 때 이름이 그와 가장 비슷한 상위 10건을 뽑는 쿼리는 이렇게 씁니다:

  ```sql
  SELECT name
  FROM users
  ORDER BY name <-> 'kim'
  LIMIT 10;
  ```

  여기서 `<->`는 "두 문자열의 trigram 거리(0이면 완전 일치, 1이면 완전히 다름)"를 계산하는 `pg_trgm` 연산자입니다. `ORDER BY name <-> 'kim'`은 "거리가 가까운 순으로 정렬"이고 `LIMIT 10`은 "상위 10개만". GiST는 트리를 거리 순으로 가지치기하며 내려갈 수 있어서 이런 쿼리를 전체 테이블 정렬 없이 풀어냅니다.
- **배타 제약**(`EXCLUDE USING gist`): "같은 방에 두 예약 시간이 겹치면 안 된다" 같은 제약을 DB 레벨에서 막을 때 필수.

### 실험: range 겹침 쿼리

```sql
-- GiST는 기본적으로 scalar `=`를 모르므로, 정수 컬럼에 `=`를 걸려면
-- btree_gist 확장이 제공하는 equality opclass가 필요합니다.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservations (
    id bigserial PRIMARY KEY,
    room_id int NOT NULL,
    during tstzrange NOT NULL,
    EXCLUDE USING gist (room_id WITH =, during WITH &&)
);

-- 이미 GiST 인덱스가 배타 제약으로 자동 생성됨
\d reservations

EXPLAIN (ANALYZE)
SELECT * FROM reservations
WHERE during && tstzrange('2026-04-20 10:00', '2026-04-20 12:00');
--  Index Scan using reservations_room_id_during_excl on reservations ...
--    Index Cond: (during && '["2026-04-20 10:00+00","2026-04-20 12:00+00")'::tstzrange)
```

`EXCLUDE USING gist`는 배타 제약으로서 "겹치는 예약이 들어오면 거부"를 DB가 보장하고, 동시에 질의용 GiST 인덱스 역할까지 합니다. 같은 쿼리를 B-tree로 풀려면 `start`와 `end`를 별도 컬럼으로 쪼개고 두 범위 조건을 복잡하게 걸어야 하는데, GiST는 range 자체를 한 타입으로 다룹니다.

### GIN vs GiST: 언제 뭘 고르나

GIN과 GiST는 영역이 살짝 겹쳐서 헷갈리는 대목입니다. 단순하게 나누면 이렇습니다.

- **GIN**: "한 row 안에 키가 여럿 있는" 구조. 전문 검색, JSONB/배열 포함 관계, `LIKE '%x%'` 부분 검색. 읽기는 빠르지만 쓰기 비용이 큽니다.
- **GiST**: "키 자체가 공간이나 범위를 가진" 구조. 지도 좌표, 시간 범위, 유사도 거리, 배타 제약. 읽기·쓰기 균형은 좋지만 순수한 포함 관계 검색은 GIN보다 느릴 수 있습니다.

`pg_trgm`처럼 둘 다 지원하는 경우가 대표적 혼란 지점입니다. 실무에서는 이렇게 외우면 틀리지 않습니다.

- `WHERE title LIKE '%kim%'` 처럼 **포함 여부**만 보면 → GIN
- `ORDER BY name <-> 'kim' LIMIT 10` 처럼 **가까운 순 정렬**이 필요하면 → GiST

## BRIN: 거대 테이블의 얇은 인덱스

BRIN(Block Range Index)은 앞의 셋과 완전히 다른 방식입니다. 개별 row 하나하나를 인덱스에 넣지 않고, **힙 페이지를 묶음 단위로 쪼갠 뒤 각 묶음의 요약만**(기본 128 페이지, 약 1MB 단위의 min/max) 저장합니다. 도서관에 비유하면 책 한 권 한 권의 위치를 다 적는 게 아니라 "이 책장엔 A-C로 시작하는 책이, 저 책장엔 D-F로 시작하는 책이 있다"만 메모해 두는 식입니다.

### 구조: 요약만 저장한다

인덱스에 들어가는 것은 "몇 번 페이지부터 몇 번 페이지까지의 최솟값과 최댓값"이 전부입니다. 조건이 그 구간에 걸리지 않는 묶음은 힙을 열어 보지도 않고 통째로 버립니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 294" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="BRIN이 연속된 힙 페이지 128개를 한 묶음으로 보고 그 묶음의 최솟값과 최댓값만 저장하는 구조. 조건과 겹치는 묶음 하나만 힙을 읽고 나머지 세 묶음은 통째로 건너뜁니다.">
<style>.gg2-t{font-size:20px;font-weight:700;fill:var(--text, #1c1917)}.gg2-l{font-size:17px;fill:var(--text, #1c1917)}.gg2-m{font-size:17px;fill:var(--text-muted, #6d6762)}.gg2-sum{fill:var(--bg-subtle, #f5f4f2);stroke:var(--primary, #0a756c);stroke-width:1.6}.gg2-skip{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.2;stroke-dasharray:3 2}.gg2-read{fill:var(--bg-warn, #fffbeb);stroke:var(--accent, #9d5604);stroke-width:1.4}.gg2-vs{font-size:17px;font-weight:600;fill:var(--text-success, #107836)}.gg2-vr{font-size:17px;font-weight:600;fill:var(--accent, #9d5604)}.gg2-ln{stroke:var(--accent, #9d5604);stroke-width:1.6;fill:none}</style>
<defs>
<marker id="gg2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="var(--accent, #9d5604)"/>
</marker>
</defs>
<text x="240" y="26" text-anchor="middle" class="gg2-t">BRIN: 128 페이지마다 요약 한 줄</text>
<text x="240" y="58" text-anchor="middle" class="gg2-m">WHERE ts BETWEEN '09:00' AND '09:59'</text>
<!-- 묶음 1 -->
<rect x="14" y="78" width="100" height="64" rx="6" class="gg2-sum"/>
<text x="64" y="104" text-anchor="middle" class="gg2-l">min 07:00</text>
<text x="64" y="128" text-anchor="middle" class="gg2-l">max 07:59</text>
<rect x="15" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="35" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="55" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="75" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="95" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<text x="64" y="206" text-anchor="middle" class="gg2-m">p0..p127</text>
<text x="64" y="236" text-anchor="middle" class="gg2-vs">건너뜀</text>
<!-- 묶음 2 -->
<rect x="132" y="78" width="100" height="64" rx="6" class="gg2-sum"/>
<text x="182" y="104" text-anchor="middle" class="gg2-l">min 08:00</text>
<text x="182" y="128" text-anchor="middle" class="gg2-l">max 08:59</text>
<rect x="133" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="153" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="173" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="193" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="213" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<text x="182" y="206" text-anchor="middle" class="gg2-m">p128..p255</text>
<text x="182" y="236" text-anchor="middle" class="gg2-vs">건너뜀</text>
<!-- 묶음 3: 조건과 겹침 -->
<rect x="250" y="78" width="100" height="64" rx="6" class="gg2-sum"/>
<text x="300" y="104" text-anchor="middle" class="gg2-l">min 09:00</text>
<text x="300" y="128" text-anchor="middle" class="gg2-l">max 09:59</text>
<line x1="300" y1="144" x2="300" y2="156" class="gg2-ln" marker-end="url(#gg2Arrow)"/>
<rect x="251" y="158" width="17" height="28" rx="2" class="gg2-read"/>
<rect x="271" y="158" width="17" height="28" rx="2" class="gg2-read"/>
<rect x="291" y="158" width="17" height="28" rx="2" class="gg2-read"/>
<rect x="311" y="158" width="17" height="28" rx="2" class="gg2-read"/>
<rect x="331" y="158" width="17" height="28" rx="2" class="gg2-read"/>
<text x="300" y="206" text-anchor="middle" class="gg2-m">p256..p383</text>
<text x="300" y="236" text-anchor="middle" class="gg2-vr">힙 읽음</text>
<!-- 묶음 4 -->
<rect x="368" y="78" width="100" height="64" rx="6" class="gg2-sum"/>
<text x="418" y="104" text-anchor="middle" class="gg2-l">min 10:00</text>
<text x="418" y="128" text-anchor="middle" class="gg2-l">max 10:59</text>
<rect x="369" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="389" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="409" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="429" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<rect x="449" y="158" width="17" height="28" rx="2" class="gg2-skip"/>
<text x="418" y="206" text-anchor="middle" class="gg2-m">p384..p511</text>
<text x="418" y="236" text-anchor="middle" class="gg2-vs">건너뜀</text>
<text x="240" y="276" text-anchor="middle" class="gg2-m">1천만 행 로그: B-tree 214MB vs BRIN 56kB</text>
</svg>
</div>

1억 행 테이블에서 페이지가 1천만 개라면 BRIN 엔트리는 약 7.8만 개(1천만 / 128)밖에 안 됩니다. 엔트리 수가 이 정도면 실제 인덱스 크기는 수 MB 수준에 불과합니다. 같은 테이블에 B-tree를 걸면 리프가 수백 MB\~수 GB로 부푸는 것과 대조적입니다.

검색 방식도 다릅니다. `WHERE ts BETWEEN 'A' AND 'B'`가 들어오면 각 페이지 묶음의 {min, max}를 보고 "이 범위와 겹치는 묶음만" 골라 힙을 훑습니다. 후보 묶음 안의 튜플은 하나하나 다 확인해야 하므로 정밀도는 떨어지지만, **읽지 않아도 될 페이지를 처음부터 제외하기 때문에 I/O가 확 줄어듭니다**.

### 대표 용도: 시계열 / append-only

BRIN이 위력을 발휘하는 전제는 **인덱싱 컬럼이 테이블의 물리 순서와 강한 상관관계를 가질 때**입니다. 대표가 시계열 테이블입니다.

- 로그 테이블은 보통 `created_at`이 거의 단조 증가
- 주문/이벤트 테이블도 시간순으로 append
- 시계열 파티션 내부

이 경우 "최근 1시간 데이터 스캔" 같은 쿼리는 요약 정보만 보고도 나머지 페이지 묶음을 전부 배제할 수 있습니다.

### 실험: B-tree vs BRIN 크기 비교

```sql
CREATE TABLE logs (
    id bigserial,
    ts timestamptz NOT NULL DEFAULT now(),
    level text,
    message text
);

INSERT INTO logs (ts, level, message)
SELECT now() - (g || ' seconds')::interval,
       (ARRAY['info','warn','error'])[1 + (g % 3)],
       md5(g::text)
FROM generate_series(1, 10000000) g;

-- g가 커질수록 ts는 과거로 내려갑니다. 물리 순서와 ts 순서가 단조 대응하므로
-- correlation의 절댓값이 1에 가깝고, BRIN은 이 경우에도 똑같이 잘 동작합니다.
CREATE INDEX logs_ts_btree ON logs (ts);
CREATE INDEX logs_ts_brin ON logs USING brin (ts);

SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'logs';
--  logs_ts_btree  |  214 MB
--  logs_ts_brin   |  56 kB
```

1천만 행 테이블에서 B-tree가 200MB 이상, BRIN은 수십 KB로 약 **4000배** 차이가 납니다. 물론 BRIN으로 단일 행을 콕 집어 조회하면 B-tree보다 훨씬 느리지만, 대량 범위 스캔에서는 비슷한 시간에 풀면서 인덱스 크기만 극단적으로 작아집니다.

### 치명적 함정: 값이 섞여 있으면 무용지물

BRIN의 힘은 "디스크 저장 순서와 값의 크기 순서가 거의 일치한다"는 데서 나옵니다. 이게 깨지면 BRIN은 거의 전체 스캔과 다를 바 없어집니다. 예를 들어 `ts` 값이 페이지마다 `2024, 2026, 2025, 2024` 식으로 뒤죽박죽이면, 각 묶음의 {min, max}는 전부 "2024\~2026"이 되어버려서 어떤 쿼리를 던져도 "이 묶음은 건너뛸 수 있겠다"고 판단할 수가 없습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 404" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 상관관계가 0.998일 때 각 블록 범위의 최솟값과 최댓값 구간이 서로 겹치지 않아 조건에 걸린 범위 하나만 읽고 나머지는 건너뛰는 모습. 아래쪽은 상관관계가 0.01일 때 모든 범위의 구간이 전체를 덮어 어느 범위도 건너뛰지 못하는 모습.">
<style>.gg3-t{font-size:20px;font-weight:700;fill:var(--text, #1c1917)}.gg3-s{font-size:18px;font-weight:600;fill:var(--text, #1c1917)}.gg3-m{font-size:17px;fill:var(--text-muted, #6d6762)}.gg3-skip{fill:var(--bg-success, #f0fdf4);stroke:var(--text-success, #107836);stroke-width:1.6;stroke-dasharray:5 3}.gg3-read{fill:var(--bg-warn, #fffbeb);stroke:var(--accent, #9d5604);stroke-width:1.6}.gg3-vs{font-size:17px;font-weight:600;fill:var(--text-success, #107836)}.gg3-vr{font-size:17px;font-weight:600;fill:var(--accent, #9d5604)}.gg3-qf{fill:var(--bg-muted, #eeecea)}.gg3-qs{fill:none;stroke:var(--text-muted, #6d6762);stroke-width:1.4;stroke-dasharray:4 3}.gg3-ax{stroke:var(--text-muted, #6d6762);stroke-width:1.4}</style>
<text x="240" y="26" text-anchor="middle" class="gg3-t">BRIN의 성패를 가르는 correlation</text>
<!-- 위 패널: correlation 높음 -->
<text x="8" y="54" class="gg3-s">위: correlation 0.998, 시간순 적재</text>
<rect x="274" y="66" width="95" height="118" class="gg3-qf"/>
<text x="8" y="85" class="gg3-m">범위 1</text>
<rect x="84" y="70" width="95" height="20" rx="3" class="gg3-skip"/>
<text x="131" y="86" text-anchor="middle" class="gg3-vs">건너뜀</text>
<text x="8" y="113" class="gg3-m">범위 2</text>
<rect x="179" y="98" width="95" height="20" rx="3" class="gg3-skip"/>
<text x="226" y="114" text-anchor="middle" class="gg3-vs">건너뜀</text>
<text x="8" y="141" class="gg3-m">범위 3</text>
<rect x="274" y="126" width="95" height="20" rx="3" class="gg3-read"/>
<text x="321" y="142" text-anchor="middle" class="gg3-vr">읽음</text>
<text x="8" y="169" class="gg3-m">범위 4</text>
<rect x="369" y="154" width="95" height="20" rx="3" class="gg3-skip"/>
<text x="416" y="170" text-anchor="middle" class="gg3-vs">건너뜀</text>
<rect x="274" y="66" width="95" height="118" class="gg3-qs"/>
<line x1="84" y1="188" x2="464" y2="188" class="gg3-ax"/>
<text x="84" y="208" class="gg3-m">과거</text>
<text x="321" y="208" text-anchor="middle" class="gg3-m">쿼리 조건 범위</text>
<text x="464" y="208" text-anchor="end" class="gg3-m">현재</text>
<line x1="8" y1="230" x2="472" y2="230" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<!-- 아래 패널: correlation 낮음 -->
<text x="8" y="258" class="gg3-s">아래: correlation 0.01, 값이 뒤섞여 적재</text>
<rect x="274" y="268" width="95" height="118" class="gg3-qf"/>
<text x="8" y="287" class="gg3-m">범위 1</text>
<rect x="84" y="272" width="372" height="20" rx="3" class="gg3-read"/>
<text x="170" y="288" text-anchor="middle" class="gg3-vr">전부 읽음</text>
<text x="8" y="315" class="gg3-m">범위 2</text>
<rect x="88" y="300" width="368" height="20" rx="3" class="gg3-read"/>
<text x="170" y="316" text-anchor="middle" class="gg3-vr">전부 읽음</text>
<text x="8" y="343" class="gg3-m">범위 3</text>
<rect x="84" y="328" width="376" height="20" rx="3" class="gg3-read"/>
<text x="170" y="344" text-anchor="middle" class="gg3-vr">전부 읽음</text>
<text x="8" y="371" class="gg3-m">범위 4</text>
<rect x="90" y="356" width="366" height="20" rx="3" class="gg3-read"/>
<text x="170" y="372" text-anchor="middle" class="gg3-vr">전부 읽음</text>
<rect x="274" y="268" width="95" height="118" class="gg3-qs"/>
<line x1="84" y1="390" x2="464" y2="390" class="gg3-ax"/>
</svg>
</div>

각 막대는 블록 범위 하나가 요약하고 있는 값의 구간(min부터 max까지)입니다. 물리 순서와 값 순서가 맞아 있으면 구간들이 서로 겹치지 않아 조건에 걸린 하나만 읽으면 되지만, 값이 뒤섞이면 네 범위의 구간이 모두 전체를 덮어 어느 것도 배제할 수 없습니다.

이 "얼마나 정렬된 상태인가"를 확인하는 지표가 `pg_stats.correlation`입니다.

```sql
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'logs';
--  attname | correlation
--  ts      | -0.998
--  level   |  0.012
```

값은 -1\~1 사이이고, 절댓값이 1에 가까울수록 디스크 순서와 값 순서가 일치합니다. 부호는 방향만 알려줍니다. 여기서 `ts`가 음수인 것은 앞의 INSERT가 뒤로 갈수록 과거 시각을 넣었기 때문이고, 순서가 단조롭다는 점은 같아서 BRIN에는 똑같이 유리합니다. 0에 가까우면 완전히 뒤섞인 상태입니다. **BRIN을 고려한다면 이 값의 절댓값이 최소 0.9 이상**이어야 합니다. 위 예시의 `ts`(-0.998)는 훌륭한 후보지만, `level`(0.012) 같은 컬럼은 BRIN으로 만들면 안 됩니다.

`UPDATE`가 잦거나 랜덤 INSERT가 섞이면 correlation이 점차 떨어집니다. append-only 로그에선 괜찮지만, 일반 OLTP 테이블의 `created_at`도 나중에 UPDATE로 섞이면 BRIN 효율이 떨어지니 주기적으로 재점검이 필요합니다.

### 조정 옵션: `pages_per_range`

BRIN의 기본 `pages_per_range`는 128입니다. 범위를 좁히면(예: 32) 정밀도가 올라가는 대신 인덱스가 커집니다. 넓히면 인덱스는 더 작아지지만 스캔해야 할 힙 페이지가 많아집니다. 수십억 행 규모 테이블에서 범위 쿼리가 후보 페이지를 너무 많이 잡는다면 `pages_per_range`를 줄여 정밀도를 올립니다. 기본값 128이 대체로 무난해서 손댈 일은 많지 않습니다.

## Hash: 다시 쓸 만해진 인덱스

Hash는 `=` equality 하나만 지원하는 인덱스입니다. 내부 구조는 해시 버킷이고, `<`, `>`, `ORDER BY`, prefix match는 모두 안 됩니다.

### 왜 자주 안 쓰나

Hash는 실무 빈도가 낮습니다. B-tree도 equality를 잘 풀어내는 데다, Hash에는 없는 것이 많기 때문입니다. Hash는 단일 컬럼 인덱스만 지원해서 여러 컬럼을 묶을 수 없고, 유일성 검사를 못 해서 `UNIQUE` 제약이나 PK의 뒷단이 될 수 없습니다. 실제 컬럼 값을 저장하지 않으므로 인덱스 스캔이 항상 lossy이고, 힙에서 조건을 다시 확인하는 recheck가 따라붙습니다.

게다가 PG 10 이전의 Hash는 **WAL에 기록되지 않아서** crash 이후 복구되지 않고 replica에도 전달되지 않는 반쪽짜리 인덱스였습니다. 공식 문서가 "use B-tree instead"라고 안내할 정도였습니다. PG 10에서 WAL 로깅이 들어가면서 crash-safe한 인덱스가 됐지만, 이미 "Hash는 쓰지 말 것"이라는 인상이 오래 박혀 있습니다.

### 언제 고려하나

- **인덱스 컬럼이 매우 크고 equality만 조회**: 예를 들어 긴 URL 문자열이나 긴 해시값을 PK처럼 찾는 경우. B-tree는 키 전체를 저장하지만 Hash는 4바이트 해시값만 저장합니다. 수백 MB 단위로 공간을 아낄 수 있습니다.
- **정렬이나 범위가 절대 필요 없는 lookup 테이블**: 세션 토큰, API key, 캐시 키 같이 "주고 받기만 하는" 컬럼.

실무 기준은 "대부분은 B-tree, 키가 크고 equality만 쓰는 특수한 경우에만 Hash"입니다. 그 외에는 공간을 조금 아끼는 것보다 B-tree가 주는 기능이 더 값집니다. 행 수가 빠르게 늘어나는 테이블도 Hash와 잘 맞지 않습니다. 버킷을 늘리는 작업이 사용자 INSERT와 같은 흐름에서 일어나 쓰기 지연을 키우고, 한번 커진 Hash 인덱스는 `REINDEX` 말고는 줄일 방법이 없습니다.

## 선택 매트릭스

네 가지 인덱스를 상황별로 정리하면 다음과 같습니다.

| 쿼리 패턴 | 인덱스 | 이유 |
|-----------|--------|------|
| `WHERE id = N`, `BETWEEN`, `LIKE 'abc%'`, `ORDER BY` | B-tree | 줄 세울 수 있는 값의 거의 모든 연산 |
| 전문 검색 (`@@ to_tsquery(...)`) | GIN(`tsvector`) | 한 문서 여러 단어 구조 |
| JSONB 포함 관계 (`tags @> '[...]'`) | GIN(`jsonb_path_ops`) | 키 존재 연산자를 뺀 경량 opclass |
| 배열 포함 관계 (`arr @> ARRAY[...]`) | GIN | 같은 구조 |
| 부분 문자열 검색 (`title LIKE '%x%'`) | GIN + `gin_trgm_ops` | trigram 역색인 |
| 비슷한 순 정렬 (`name <-> 'x'` + `LIMIT`) | GiST + `gist_trgm_ops` | 거리 기반 정렬 |
| 공간 겹침 (`geom && box(...)`) | GiST | PostGIS 표준 |
| 시간 범위 겹침 (`during && tstzrange(...)`) | GiST | range 타입 |
| 배타 제약 `EXCLUDE` | GiST | `=`를 넘어선 제약 |
| 시계열 거대 테이블 범위 스캔 | BRIN | 페이지 범위 요약 |
| equality 전용 + 키가 매우 큼 | Hash | 공간 절약 |

타입별 특성으로 정리하면 이렇게 갈립니다.

| 인덱스 | 주 자료형 | 대표 연산자 | 인덱스 크기 | 쓰기 비용 | 정렬·범위 |
|---|---|---|---|---|---|
| B-tree | 순서를 매길 수 있는 스칼라 전반 | `=` `<` `>` `BETWEEN` `LIKE 'x%'` | 중간 | 낮음 | 지원 |
| GIN | `tsvector`, `jsonb`, 배열, trigram | `@@` `@>` `?` `%` | 키 중복이 제거돼 작음 | 높음 (`fastupdate`로 완충) | 미지원 (비트맵 전용) |
| GiST | geometry, range, trigram | `&&` `@>` `<->` `EXCLUDE` | 중간 | 중간 | 거리순 정렬(KNN) 지원 |
| BRIN | 물리 순서와 상관관계가 큰 스칼라 | `=` `<` `>` `BETWEEN` | 극단적으로 작음 | 매우 낮음 | 미지원 (비트맵 전용) |
| Hash | 값이 큰 단일 스칼라 컬럼 | `=` | 작음 (4바이트 해시만 저장) | 낮음 (버킷 확장 시 튐) | 미지원 |

이 표에 없는 것 중 한 줄만 언급하자면, **SP-GiST**는 비균형 트리가 자연스러운 데이터(IP 주소 prefix, 전화번호 trie 등)에 쓰이지만 실무 빈도가 낮아 이 시리즈에서는 다루지 않습니다. 필요해지는 순간이 오면 그때 공식 문서를 열면 됩니다.

## 실전에서는

### 전문 검색이 "느리다"는 말이 나올 때

대개 두 가지 중 하나입니다. (1) 인덱스가 아예 없어 Seq Scan을 하거나, (2) fastupdate pending list가 커진 상태에서 VACUUM이 따라가지 못하고 있거나. 후자라면 `gin_metapage_info`로 pending list 규모를 확인하고 `gin_clean_pending_list('idx_name')`로 강제 flush하거나, autovacuum 주기를 해당 테이블에 맞춰 줄입니다.

### 시계열 로그에 B-tree를 달았다면 한 번 의심

수천만\~수억 행 append-only 테이블에 `created_at` B-tree를 걸어뒀다면 인덱스 크기가 테이블의 몇십 %에 달할 수 있습니다. BRIN으로 바꾸면 인덱스가 수 MB 수준으로 줄면서 범위 스캔 성능은 큰 차이가 없는 경우가 많습니다. `pg_stats.correlation`이 0.9 이상인지부터 확인하면 됩니다.

### "GIN 걸었는데 왜 느리지?"의 단골 원인

- `EXPLAIN`에서 Seq Scan이 나온다면 opclass 불일치가 흔한 원인입니다. `jsonb_path_ops`로 걸어놓고 `?` 연산자를 쓴 경우 등.
- Bitmap Index Scan까지는 타는데 `Recheck Cond` 뒤 힙 페이지 수가 너무 많다면, 조건이 너무 broad해서 후보가 과도한 경우입니다. 추가 조건으로 좁히거나 partial index로 대상 문서를 줄입니다.
- 검색 지연이 간헐적으로 튄다면 pending list 규모를 먼저 확인합니다.

## 마치며

이 글에서 B-tree가 커버하지 못하는 영역을 네 가지 인덱스로 메웠습니다. 하지만 인덱스가 있다고 플래너가 꼭 쓰는 것도 아니고, 같은 SQL이 테이블 크기나 통계에 따라 다른 plan으로 가기도 합니다. "인덱스가 있는데 왜 안 타지?"의 답은 이제 인덱스 구조가 아니라 **플래너가 cost를 어떻게 계산하느냐**에 달려 있고, 그 계산의 재료가 `pg_statistic`에 쌓이는 통계입니다. 다음 글에서는 그 통계가 어떻게 모이고, `EXPLAIN` 출력의 숫자들이 어디서 나오는지 따라가겠습니다.

---

## 참고자료

- PostgreSQL 18 공식 문서: [Chapter 65. Built-in Index Access Methods](https://www.postgresql.org/docs/18/indextypes.html)
- [GIN Indexes](https://www.postgresql.org/docs/18/gin.html): entry tree와 posting list 구조, `fastupdate`와 pending list
- [GiST Indexes](https://www.postgresql.org/docs/18/gist.html): 경계 상자 기반 트리와 opclass가 채워야 할 인터페이스
- [BRIN Indexes](https://www.postgresql.org/docs/18/brin.html): block range 요약 방식과 `pages_per_range`
- [Hash Indexes](https://www.postgresql.org/docs/18/hash-index.html): 버킷 구조와 equality 전용이라는 제약
- [jsonb Indexing](https://www.postgresql.org/docs/18/datatype-json.html#JSON-INDEXING): `jsonb_ops`와 `jsonb_path_ops`가 지원하는 연산자 차이
- [pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html): trigram 분해, `gin_trgm_ops` / `gist_trgm_ops`, 거리 연산자 `<->`
