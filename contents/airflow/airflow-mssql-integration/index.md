---
date: '2026-04-03'
title: 'Airflow에서 15년 된 SQL Server 연결하기: pymssql 실패부터 Custom Hook까지'
category: 'DevOps'
series: 'airflow'
seriesOrder: 5
tags: ['Airflow', 'MSSQL', 'pyodbc', 'Custom Hook', 'SQL Server']
summary: 'Airflow에서 SQL Server 2008 R2에 연결하면서 만난 에러 5개와 해결 과정을 정리합니다. pymssql이 실패하는 진짜 이유(TDS 프로토콜)부터 pyodbc Custom Hook 구현, 실전 동기화 파이프라인까지 다룹니다.'
thumbnail: './thumbnail.png'
---

운영 중인 서비스의 데이터를 Airflow로 가져와야 했습니다. 문제는 그 DB가 **SQL Server 2008 R2**라는 것. 2010년에 출시된, 15년 된 레거시 데이터베이스입니다. DBeaver에서 jTDS 드라이버로 연결했을 때는 아무 문제가 없었기에 금방 될 거라 생각했는데, Airflow에서는 첫 시도부터 막혔습니다.

```
DB-Lib error message 20002, severity 9:
Adaptive Server connection failed
```

Airflow의 공식 MSSQL Provider(`apache-airflow-providers-microsoft-mssql`)는 내부적으로 `pymssql`을 사용하는데, 이 라이브러리가 SQL Server 2008 R2와 호환되지 않는 게 원인이었습니다. DBeaver는 되는데 Airflow는 안 되는 상황 — 이 차이에서 실마리를 찾기 시작했습니다.

<br>

## 왜 pymssql은 실패하는가 — TDS 프로토콜

원인을 이해하려면 **TDS(Tabular Data Stream)** 프로토콜부터 짚어야 합니다. SQL Server가 클라이언트와 통신할 때 사용하는 프로토콜인데, SQL Server 버전마다 지원하는 TDS 버전이 다릅니다.

| SQL Server 버전 | 출시 | TDS 버전 |
|----------------|------|----------|
| SQL Server 2005 | 2005 | TDS 7.2 |
| SQL Server 2008 R2 | 2010 | TDS 7.3 |
| SQL Server 2012+ | 2012 | TDS 7.4 |

`pymssql`은 내부적으로 **FreeTDS** 라이브러리를 사용합니다. FreeTDS는 `freetds.conf`의 TDS 버전 설정에 따라 프로토콜 핸드셰이크를 시도하는데, 최신 FreeTDS가 레거시 서버와의 프로토콜 협상을 제대로 처리하지 못하는 경우가 있습니다. `pymssql`에서 `tds_version='7.1'`을 명시하면 연결이 될 수도 있지만, 안정성이 보장되지 않습니다.

```
pymssql (FreeTDS)
└─ 프로토콜 핸드셰이크 실패
   └─ DB-Lib error 20002

jTDS (DBeaver)
└─ 레거시 TDS 프로토콜까지 유연하게 지원
   └─ SQL Server 2008 R2와 호환 → 연결 성공
```

DBeaver가 연결에 성공한 이유는 jTDS라는 순수 Java JDBC 드라이버를 사용하기 때문입니다. jTDS는 레거시 TDS 버전 지원에 특화되어 있습니다. "동작하는 사례가 있다"는 건 SQL Server 자체의 문제가 아니라 클라이언트 드라이버의 문제라는 뜻이었고, MS 공식 ODBC Driver를 쓰는 게 가장 확실한 해결책이라 판단했습니다.

<br>

## 해결 전략 — pyodbc + ODBC Driver 18

pymssql 대신 **pyodbc**를 선택한 이유는 네 가지입니다:

1. **Microsoft 공식 드라이버** — ODBC Driver for SQL Server는 MS가 직접 관리하며, SQL Server 2008 R2를 공식 지원합니다
2. **안정적인 프로토콜 협상** — MS 공식 Driver가 레거시 SQL Server까지 적절한 TDS 버전을 자동으로 협상합니다
3. **한글 인코딩** — CP949 인코딩을 명시적으로 설정할 수 있습니다
4. **ARM64 지원** — ODBC Driver 18은 ARM64 + AMD64 모두 지원합니다 (Debian 12 ARM64 패키지는 Driver 18부터 제공)

전체 계층 구조는 이렇습니다.

```
Python 코드 (Airflow Task)
    ↓
DB-API 2.0 (PEP 249)
    ↓
pyodbc (DB-API 구현체)
    ↓
ODBC Driver 18 for SQL Server
    ↓
TDS 프로토콜
    ↓
SQL Server 2008 R2
```

각 계층의 역할이 분리되어 있어서, 문제가 생겼을 때 어느 계층에서 터졌는지 추적하기 좋습니다. 실제로 이 글에서 다루는 에러들도 Docker 빌드, OpenSSL, pyodbc, Airflow XCom 등 각각 다른 계층에서 발생했습니다.

<br>

## Docker 환경 구축

Airflow를 Docker로 운영하고 있어서, 컨테이너 안에 ODBC Driver를 설치해야 합니다. Dockerfile 자체는 짧지만 생각보다 신경 쓸 부분이 많았습니다.

```dockerfile
FROM apache/airflow:3.1.0

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl gnupg2 ca-certificates ffmpeg \
        unixodbc unixodbc-dev && \
    # Microsoft GPG 키 추가 (gpg --dearmor 방식)
    curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | \
        gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/microsoft-prod.gpg] \
        https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y msodbcsql18 && \
    # SQL Server 2008 R2 호환을 위한 OpenSSL 레거시 SSL 설정
    printf '\n[openssl_init]\nssl_conf = ssl_sect\n\n[ssl_sect]\nsystem_default = system_default_sect\n\n[system_default_sect]\nOptions = UnsafeLegacyRenegotiation\n' \
        >> /etc/ssl/openssl.cnf && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

USER airflow
```

### msodbcsql18 — Driver 17이 아닌 이유

처음에는 ODBC Driver 17을 설치하려 했는데, `Unable to locate package msodbcsql17` 에러가 나왔습니다. Debian 12(bookworm) ARM64 환경에서는 **Driver 17 패키지가 제공되지 않았기 때문**입니다. 개발 환경이 Mac(ARM64)이라 빌드 자체가 안 됐고, Driver 18로 변경하니 ARM64와 AMD64 모두 정상 빌드가 가능했습니다.

### GPG 키 — apt-key add는 deprecated

`apt-key add` 방식은 Debian 12부터 deprecated되었습니다. `gpg --dearmor`로 키를 변환해서 `/usr/share/keyrings/`에 저장하고, `sources.list`에서 `signed-by`로 참조해야 합니다. 이전 방식대로 했다가 `NO_PUBKEY EB3E94ADBE1229CF` 에러를 만났습니다.

### OpenSSL UnsafeLegacyRenegotiation

가장 찾기 어려운 함정이었습니다. Driver 설치까지 끝내고 연결을 시도했더니:

```
SSL Provider:
[error:0A000152:SSL routines::unsafe legacy renegotiation disabled]
```

OpenSSL 3.x부터 레거시 SSL 재협상(renegotiation)이 기본 비활성화되었는데, SQL Server 2008 R2가 TLS 1.0/1.1 시절의 SSL 협상 방식을 사용하기 때문에 발생하는 문제입니다. OpenSSL 설정에서 `UnsafeLegacyRenegotiation`을 명시적으로 허용해야 합니다. 참고로 ODBC Driver 18은 기본값이 `Encrypt=yes`이기 때문에, 연결 문자열에서 `Encrypt=no`를 쓰더라도 이 설정을 넣어두면 나중에 암호화를 켤 때 별도 수정 없이 바로 동작합니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  <code>UnsafeLegacyRenegotiation</code>은 보안을 약간 낮추는 설정입니다. 내부망에서 레거시 DB에 연결하는 용도로만 사용하고, 외부 인터넷 통신에는 절대 적용하지 마세요.
</div>

<br>

## Custom MSSQLHook 구현

Airflow의 공식 MSSQL Provider가 pymssql 기반이라, pyodbc로 연결하려면 Hook을 직접 만들어야 합니다. Provider 패키지 자체는 Airflow UI에서 Connection 타입을 선택하기 위해 유지하고, 실제 연결은 Custom Hook이 담당합니다.

```toml
# pyproject.toml
dependencies = [
    "apache-airflow-providers-microsoft-mssql>=4.4.0",  # UI에서 Connection 타입 선택용
    "pyodbc>=5.3.0",  # 실제 MSSQL 연결용
]
```

Hook 코드는 다음과 같습니다.

**`src/hook/mssql_hook.py`**

```python
import pyodbc
from airflow.hooks.base import BaseHook


class MSSQLHook(BaseHook):
    conn_name_attr = "mssql_conn_id"
    default_conn_name = "mssql_default"

    def __init__(self, mssql_conn_id="mssql_default"):
        super().__init__()
        self.mssql_conn_id = mssql_conn_id

    def get_conn(self):
        conn = self.get_connection(self.mssql_conn_id)
        extra = conn.extra_dejson
        charset = extra.get("charset")

        connection_string = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={conn.host},{conn.port or 1433};"
            f"DATABASE={conn.schema};"
            f"UID={conn.login};"
            f"PWD={conn.password};"
            f"Encrypt=no;"
            f"TrustServerCertificate=yes;"
        )

        client = pyodbc.connect(connection_string)

        if charset:
            try:
                client.setdecoding(pyodbc.SQL_CHAR, encoding=charset)
                client.setdecoding(pyodbc.SQL_WCHAR, encoding=charset)
                client.setencoding(encoding=charset)
            except Exception:
                pass  # 인코딩 미지원 시 기본값 사용

        return client

    def run(self, sql):
        client = self.get_conn()
        try:
            cursor = client.cursor()
            cursor.execute(sql)
            results = cursor.fetchall()
            cursor.close()
            return results
        finally:
            client.close()
```

### Encrypt=no, TrustServerCertificate=yes

SQL Server 2008 R2는 TLS 1.2를 지원하지 않을 수 있습니다. `Encrypt=no`로 암호화를 끄고, `TrustServerCertificate=yes`로 자체 서명 인증서를 허용했습니다. 내부망 전용이라 보안 리스크는 수용 가능한 수준입니다.

### 인코딩은 강제하지 않는다

처음에는 모든 연결에 CP949 인코딩을 강제 적용했는데, UTF-8 데이터가 섞여 있는 테이블에서 `UnicodeDecodeError`가 터졌습니다. 결국 **Airflow Connection의 Extra JSON에 `charset`을 명시한 경우에만** 인코딩을 적용하는 방식으로 바꿨습니다.

```json
// Airflow Connection Extra (charset이 필요한 경우만)
{"charset": "cp949"}
```

강제보다 유연한 설정이 운영에서 훨씬 안전합니다.

### Connection Pooling은 불필요

Airflow Task는 단발성 실행이라, Task가 시작되면 연결하고 끝나면 닫으면 됩니다. 커넥션 풀을 유지할 이유가 없고, 관리 복잡도만 올라갑니다.

<br>

## 실전 파이프라인 — MSSQL → ClickHouse 동기화

연결이 되고 나면, 실제로 데이터를 어떻게 옮기느냐가 다음 문제입니다. 현재 MSSQL에서 데이터를 꺼내 ClickHouse로 동기화하는 일일 배치 파이프라인을 운영하고 있습니다.

### 증분 배치 동기화

전체 데이터를 매번 덤프하면 비효율적이기 때문에, **마지막으로 동기화한 ID 이후의 데이터만** 가져오는 증분 방식을 사용합니다.

```
1. ClickHouse에서 마지막 동기화된 max_idx 조회
2. MSSQL에서 max_idx 이후 데이터를 TOP N으로 배치 조회
3. pyodbc.Row → list 변환 + 데이터 검증
4. ClickHouse에 배치 INSERT
5. 다음 배치로 이동 (current_idx 갱신)
6. 전부 끝나면 OPTIMIZE TABLE FINAL (중복 제거)
```

핵심 Task 코드를 간략화하면 이렇습니다.

```python
@task(
    retries=1,
    retry_delay=timedelta(seconds=10),
    on_failure_callback=task_failure_callback,
)
def sync_orders(last_idx: int, batch_size: int = 1000):
    mssql_hook = MSSQLHook(mssql_conn_id="mssql_default")
    ch_hook = ClickHouseHook(clickhouse_conn_id="clickhouse")

    # MSSQL에서 최대 ID 조회
    max_result = mssql_hook.run("SELECT MAX(id) FROM orders")
    max_idx = max_result[0][0] if max_result and max_result[0][0] else 0

    if last_idx >= max_idx:
        logging.info("No new data to sync")
        return

    # 배치 단위 동기화
    ch_conn = ch_hook.get_conn()
    current_idx = last_idx
    total_synced = 0

    while current_idx < max_idx:
        sql = f"""
        SELECT TOP {batch_size} *
        FROM orders
        WHERE id > {current_idx}
        ORDER BY id
        """
        batch_data = mssql_hook.run(sql)

        if not batch_data:
            break

        # pyodbc.Row → list 변환
        processed = [list(row) for row in batch_data]

        ch_conn.insert(
            table="orders",
            data=processed,
            column_names=[...]
        )

        current_idx = processed[-1][0]
        total_synced += len(processed)
        logging.info(f"Synced {len(processed)} rows, total: {total_synced}")

    # ReplacingMergeTree 중복 제거
    try:
        ch_hook.run("OPTIMIZE TABLE orders FINAL")
    except Exception as e:
        logging.warning(f"OPTIMIZE TABLE failed (non-critical): {e}")
```

### 설계 포인트

**`pyodbc.Row` → `list` 변환이 필수입니다.** `pyodbc.Row` 객체는 ClickHouse INSERT나 Airflow XCom 직렬화에서 그대로 사용할 수 없습니다. `list(row)` 또는 `tuple(row)`로 변환해야 하고, 빠뜨리면 `TypeError: cannot serialize object of type <class 'pyodbc.Row'>` 에러가 발생합니다.

**`OPTIMIZE TABLE FINAL`은 `try-except`로 감쌌습니다.** ClickHouse의 ReplacingMergeTree 엔진은 OPTIMIZE가 실패해도 데이터가 유실되지 않고, 다음 자동 머지에서 중복이 제거됩니다. 비핵심 작업의 실패가 전체 파이프라인을 중단시킬 필요는 없습니다.

**`TOP N` 페이지네이션을 쓰는 이유가 있습니다.** SQL Server 2008 R2는 `OFFSET ... FETCH` 문법을 지원하지 않습니다. SQL Server 2012부터 추가된 기능이기 때문에, 레거시 호환을 위해 `WHERE id > {current_idx} ORDER BY id`와 `TOP N` 조합으로 페이지네이션을 구현했습니다.

<br>

## 만났던 에러 정리

연결 성공까지 거쳐간 에러들을 정리합니다. 각각 다른 계층에서 발생한 문제들이라, 레거시 MSSQL 연동을 시도하는 분들에게 참고가 될 수 있습니다.

| # | 에러 | 원인 | 해결 |
|---|------|------|------|
| 1 | `NO_PUBKEY EB3E94ADBE1229CF` | `apt-key add` deprecated (Debian 12+) | `gpg --dearmor` 방식으로 변경 |
| 2 | `Unable to locate package msodbcsql17` | Debian 12 ARM64 패키지 미제공 | Driver 18 사용 |
| 3 | `SSL routines::unsafe legacy renegotiation disabled` | OpenSSL 3.x 보안 정책 | `UnsafeLegacyRenegotiation` 설정 |
| 4 | `UnicodeDecodeError: 'cp949'` | CP949 강제 적용 시 UTF-8 데이터 충돌 | Connection Extra에서 charset 선택 적용 |
| 5 | `TypeError: cannot serialize pyodbc.Row` | XCom은 기본 타입만 직렬화 가능 | `list(row)` 변환 |

<br>

## 마치며

레거시 시스템 연동은 코드가 아니라 **프로토콜 레벨**에서 문제가 생깁니다. TDS 버전, SSL 핸드셰이크, 문자 인코딩 — 평소에는 의식하지 않는 계층들이 15년 된 DB 앞에서 하나씩 드러납니다. "DBeaver는 되는데 왜 안 되지?"라는 질문에서 출발해, 클라이언트 드라이버의 차이를 이해하고 나서야 올바른 방향을 잡을 수 있었습니다.

<br>

## 참고자료

- [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/microsoft-odbc-driver-for-sql-server)
- [pyodbc Wiki - Connecting to SQL Server](https://github.com/mkleehammer/pyodbc/wiki/Connecting-to-SQL-Server-from-Linux)
- [TDS Protocol Documentation](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/)
- [Airflow Custom Hooks Guide](https://airflow.apache.org/docs/apache-airflow/stable/howto/custom-operator.html)
