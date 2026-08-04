---
date: '2026-04-03'
title: 'Airflow에서 15년 된 SQL Server 연결하기: pymssql 실패부터 Custom Hook까지'
category: 'DevOps'
series: 'airflow'
seriesOrder: 5
tags: ['Airflow', 'MSSQL', 'pyodbc', 'Custom Hook', 'SQL Server']
summary: 'Airflow에서 SQL Server 2008 R2에 연결하면서 만난 에러 5개와 해결 과정을 정리합니다. pymssql이 막힌 지점이 TDS 버전이 아니라 TLS 핸드셰이크였던 이유부터 pyodbc Custom Hook 구현, 실전 동기화 파이프라인까지 다룹니다.'
thumbnail: './thumbnail.png'
---

운영 중인 서비스의 데이터를 Airflow로 가져와야 했습니다. 문제는 그 DB가 **SQL Server 2008 R2**라는 것. 2010년에 출시된, 15년 된 레거시 데이터베이스입니다. DBeaver에서 jTDS 드라이버로 연결했을 때는 아무 문제가 없었기에 금방 될 거라 생각했는데, Airflow에서는 첫 시도부터 막혔습니다.

```
DB-Lib error message 20002, severity 9:
Adaptive Server connection failed
```

Airflow의 공식 MSSQL Provider(`apache-airflow-providers-microsoft-mssql`)는 내부적으로 `pymssql`을 씁니다. 같은 서버에 DBeaver는 붙는데 Airflow만 못 붙는다면 서버가 아니라 클라이언트 쪽 이야기입니다. 이 차이가 실마리였습니다.

## pymssql은 어디서 막혔나

먼저 에러 메시지부터 정직하게 읽어야 합니다. `DB-Lib error message 20002, Adaptive Server connection failed`는 FreeTDS의 DB-Library가 **연결 실패 전반에 쓰는 포괄 메시지**입니다. 포트가 막혔을 때도, 로그인이 거절됐을 때도, TLS 핸드셰이크가 깨졌을 때도 같은 번호가 찍힙니다. 이 메시지만으로는 어느 계층에서 끊겼는지 알 수 없고, 원인을 좁히려면 `TDSDUMP` 환경 변수로 상세 로그를 남겨야 합니다.

의심의 첫 순서는 **TDS(Tabular Data Stream)** 프로토콜 버전이었습니다. SQL Server가 클라이언트와 주고받는 프로토콜인데, 서버 버전마다 세대가 다릅니다.

| SQL Server 버전 | 출시 | TDS 버전 |
|----------------|------|----------|
| SQL Server 2005 | 2005 | TDS 7.2 |
| SQL Server 2008 / 2008 R2 | 2008 / 2010 | TDS 7.3 |
| SQL Server 2012+ | 2012 | TDS 7.4 |

그런데 이 방향은 금방 막힙니다. `pymssql`이 쓰는 **FreeTDS**는 4.2부터 8.0까지 전 세대를 구현하고 있고, SQL Server 상대로는 버전을 `auto`로 두고 자동 협상하라는 게 공식 권고입니다. 지원 목록만 놓고 보면 FreeTDS가 TDS 7.3을 못 다룰 이유가 없습니다.

실제로 걸린 곳은 그 아래였습니다. 뒤에서 ODBC Driver로 갈아탄 뒤 처음 받은 에러가 `unsafe legacy renegotiation disabled`, 즉 **TLS 핸드셰이크 실패**였습니다. FreeTDS 쪽에도 같은 계열의 보고가 있습니다. 새 FreeTDS로 올린 뒤 SQL Server 2008에 붙지 못하는데, 로그를 열어 보면 TDS 패킷 교환은 정상이고 `handshake failed`에서 끊긴다는 [이슈](https://github.com/FreeTDS/freetds/issues/118)입니다.

DBeaver가 성공한 이유도 같은 축에서 설명됩니다. DBeaver가 쓰는 jTDS는 순수 자바 JDBC 드라이버인데, `ssl` 속성의 **기본값이 `off`**입니다. 암호화를 아예 협상하지 않으니 TLS 핸드셰이크 자체가 일어나지 않고, 자바 구현이라 OpenSSL을 거치지도 않습니다. 덧붙여 jTDS가 낼 수 있는 가장 높은 프로토콜은 문서 표기로 `8.0`, 곧 SQL Server 2000/2005 세대입니다. 레거시 TDS를 더 잘 아는 게 아니라 **더 오래된 대화를 하고, TLS를 건너뛴다**는 쪽이 사실에 가깝습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 610" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 SQL Server 2008 R2를 향해 위쪽 pymssql 경로는 TLS 핸드셰이크에서 끊기고 아래쪽 jTDS 경로는 TLS 없이 로그인에 성공하는 모습을 위아래로 쌓아 비교한 그림">
<style>
.mi1-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.mi1-box { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); }
.mi1-srv { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.mi1-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); }
.mi1-good { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); }
.mi1-t { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
.mi1-h { fill: var(--text, #1c1917); font-size: 18px; font-weight: 700; text-anchor: middle; }
.mi1-s { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
.mi1-bt { fill: var(--text-danger, #cb2121); font-size: 14px; }
.mi1-gt { fill: var(--text-success, #107836); font-size: 14px; }
.mi1-ln { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.mi1-bl { stroke: var(--text-danger, #cb2121); stroke-width: 2.2; fill: none; }
.mi1-gl { stroke: var(--text-success, #107836); stroke-width: 2.2; fill: none; }
</style>
<defs>
<marker id="mi1Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
<marker id="mi1ArrowG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-success, #107836)"/>
</marker>
</defs>
<!-- 위 패널: pymssql 경로 -->
<rect class="mi1-panel" x="10" y="8" width="380" height="324" rx="8"/>
<text class="mi1-h" x="200" y="34">Airflow 컨테이너: pymssql</text>
<rect class="mi1-box" x="70" y="48" width="260" height="38" rx="6"/>
<text class="mi1-t" x="200" y="73">pymssql</text>
<line class="mi1-ln" x1="200" y1="88" x2="200" y2="100" marker-end="url(#mi1Arrow)"/>
<rect class="mi1-box" x="70" y="102" width="260" height="38" rx="6"/>
<text class="mi1-t" x="200" y="127">FreeTDS (C 라이브러리)</text>
<line class="mi1-ln" x1="200" y1="142" x2="200" y2="154" marker-end="url(#mi1Arrow)"/>
<rect class="mi1-bad" x="70" y="156" width="260" height="52" rx="6"/>
<text class="mi1-t" x="200" y="180">TLS 핸드셰이크</text>
<text class="mi1-s" x="200" y="199">OpenSSL 3.x가 거부</text>
<line class="mi1-bl" x1="200" y1="208" x2="200" y2="220" stroke-dasharray="4 3"/>
<circle cx="200" cy="232" r="11" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<path class="mi1-bl" d="M 195 227 L 205 237 M 205 227 L 195 237"/>
<text class="mi1-bt" x="220" y="237">여기서 끊김</text>
<rect class="mi1-srv" x="70" y="254" width="260" height="38" rx="6"/>
<text class="mi1-t" x="200" y="279">SQL Server 2008 R2</text>
<text class="mi1-bt" x="200" y="316" text-anchor="middle">DB-Lib error message 20002</text>
<!-- 아래 패널: jTDS 경로 -->
<rect class="mi1-panel" x="10" y="348" width="380" height="250" rx="8"/>
<text class="mi1-h" x="200" y="374">DBeaver: jTDS (ssl 기본값 off)</text>
<rect class="mi1-box" x="70" y="388" width="260" height="38" rx="6"/>
<text class="mi1-t" x="200" y="413">jTDS (순수 자바 JDBC)</text>
<line class="mi1-ln" x1="200" y1="428" x2="200" y2="440" marker-end="url(#mi1Arrow)"/>
<rect class="mi1-good" x="70" y="442" width="260" height="52" rx="6"/>
<text class="mi1-t" x="200" y="466">TLS 핸드셰이크 없음</text>
<text class="mi1-s" x="200" y="485">암호화를 협상하지 않음</text>
<line class="mi1-gl" x1="200" y1="494" x2="200" y2="506"/>
<circle cx="200" cy="518" r="11" fill="var(--bg-success, #f0fdf4)" stroke="var(--text-success, #107836)" stroke-width="2"/>
<path class="mi1-gl" d="M 195 518 L 199 523 L 206 512"/>
<text class="mi1-gt" x="220" y="523">로그인 진행</text>
<line class="mi1-gl" x1="200" y1="530" x2="200" y2="538" marker-end="url(#mi1ArrowG)"/>
<rect class="mi1-srv" x="70" y="540" width="260" height="38" rx="6"/>
<text class="mi1-t" x="200" y="565">SQL Server 2008 R2</text>
</svg>
</div>

:::note

**단정하지 않고 남겨 둔 부분**

`pymssql` 쪽에서 TDS 덤프를 떠서 핸드셰이크 실패를 직접 확인한 건 아닙니다. 확인된 사실은 세 가지입니다. 20002는 원인을 특정해 주지 않는 포괄 오류라는 것, 성공한 클라이언트와 실패한 클라이언트의 결정적 차이가 암호화 협상 여부라는 것, 그리고 최종 해결이 TLS 설정에서 났다는 것입니다.

:::

## 해결 전략: pyodbc + ODBC Driver 18

pymssql 대신 **pyodbc**를 선택한 이유는 네 가지입니다.

1. **Microsoft가 직접 관리하는 드라이버**: 다만 공식 호환 표에서 SQL Server 2008 R2는 ODBC Driver 17.3까지만 표시돼 있고 Driver 18 행에는 없습니다. 지원 목록에 있어서 고른 게 아니라, 붙여 보고 되는 걸 확인한 뒤에 쓰기로 한 조합입니다
2. **TLS 동작을 손으로 조절할 수 있음**: `Encrypt`, `TrustServerCertificate`, 그리고 컨테이너의 OpenSSL 설정까지 조합할 손잡이가 생깁니다
3. **한글 인코딩**: 커넥션 단위로 CP949 같은 인코딩을 지정할 수 있습니다
4. **ARM64 지원**: 리눅스용 Driver 17에는 arm64 빌드가 없고, Driver 18은 18.1부터 리눅스 arm64를, Debian 12는 18.3부터 지원합니다

요청이 지나가는 계층은 이렇게 쌓여 있습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 372" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="Airflow 태스크에서 SQL Server 2008 R2까지 요청이 지나가는 계층을 위에서 아래로 쌓고, OpenSSL 층에 실패 표시를 붙인 그림">
<style>
.mi2-wrap { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.mi2-box { fill: var(--bg, #fafaf8); stroke: var(--border, #e7e5e4); }
.mi2-srv { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.mi2-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); }
.mi2-t { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
.mi2-s { fill: var(--text-muted, #6d6762); font-size: 14px; }
.mi2-ln { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.mi2-bl { stroke: var(--text-danger, #cb2121); stroke-width: 2.2; fill: none; }
</style>
<defs>
<marker id="mi2Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<rect class="mi2-wrap" x="14" y="8" width="372" height="270" rx="8"/>
<text class="mi2-s" x="26" y="28">Airflow 컨테이너</text>
<rect class="mi2-box" x="44" y="38" width="300" height="44"/>
<text class="mi2-t" x="194" y="66">Airflow Task (Python)</text>
<rect class="mi2-box" x="44" y="82" width="300" height="44"/>
<text class="mi2-t" x="194" y="110">pyodbc (DB-API 2.0)</text>
<rect class="mi2-box" x="44" y="126" width="300" height="44"/>
<text class="mi2-t" x="194" y="154">unixODBC 드라이버 매니저</text>
<rect class="mi2-box" x="44" y="170" width="300" height="44"/>
<text class="mi2-t" x="194" y="198">ODBC Driver 18 for SQL Server</text>
<rect class="mi2-bad" x="44" y="214" width="300" height="44"/>
<text class="mi2-t" x="194" y="242">OpenSSL 3.x (TLS 핸드셰이크)</text>
<circle cx="364" cy="236" r="12" fill="var(--bg-danger, #fef2f2)" stroke="var(--text-danger, #cb2121)" stroke-width="2"/>
<path class="mi2-bl" d="M 359 231 L 369 241 M 369 231 L 359 241"/>
<line class="mi2-ln" x1="194" y1="278" x2="194" y2="312" stroke-dasharray="5 4" marker-end="url(#mi2Arrow)"/>
<text class="mi2-s" x="208" y="300">TCP 1433 · TDS</text>
<rect class="mi2-srv" x="44" y="316" width="300" height="44" rx="6"/>
<text class="mi2-t" x="194" y="344">SQL Server 2008 R2</text>
</svg>
</div>

이 글에서 다루는 에러들도 Docker 빌드, OpenSSL, pyodbc, Airflow XCom 등 각각 다른 층에서 발생했습니다.

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

### msodbcsql18을 쓴 이유

처음에는 ODBC Driver 17을 설치하려 했는데 `Unable to locate package msodbcsql17` 에러가 나왔습니다. Microsoft가 리눅스용으로 배포하는 Driver 17에는 arm64 빌드가 없습니다. 개발 환경이 Mac(ARM64)이라 빌드 자체가 안 됐고, Driver 18로 바꾸니 ARM64와 AMD64 모두 정상 빌드됐습니다. Driver 18은 18.1부터 리눅스 arm64를 지원하고, Debian 12용 arm64 패키지는 18.3부터 나옵니다.

### apt-key add는 deprecated

`apt-key`는 폐기된 도구입니다. apt 매뉴얼은 "Debian 11과 Ubuntu 22.04가 apt-key를 제공하는 마지막 릴리스"라고 못박고 있습니다. 대신 `gpg --dearmor`로 키를 변환해서 `/usr/share/keyrings/`에 저장하고, `sources.list`에서 `signed-by`로 참조해야 합니다. 예전 방식 그대로 갔다가 `NO_PUBKEY EB3E94ADBE1229CF` 에러를 만났습니다.

### OpenSSL UnsafeLegacyRenegotiation

가장 찾기 어려운 함정이었습니다. Driver 설치까지 끝내고 연결을 시도했더니:

```
SSL Provider:
[error:0A000152:SSL routines::unsafe legacy renegotiation disabled]
```

OpenSSL 3.x는 RFC 5746의 보안 재협상 확장을 지원하지 않는 상대와의 핸드셰이크를 기본적으로 거부합니다. SQL Server 2008 R2의 TLS 구현이 여기에 걸립니다. 그래서 `UnsafeLegacyRenegotiation`을 명시적으로 열어 줘야 합니다.

여기서 한 가지가 걸립니다. 연결 문자열에는 `Encrypt=no`를 쓸 텐데, 암호화를 껐는데 왜 TLS가 문제가 되느냐는 것입니다. 답은 TDS 프로토콜의 로그인 절차에 있습니다. Microsoft 문서는 "**`Encrypt` 설정과 무관하게 서버 로그인 자격 증명(사용자 이름과 비밀번호)은 항상 암호화된다**"고 못박습니다. TDS는 로그인 직전 PRELOGIN 단계에서 암호화 여부를 협상하는데, 클라이언트가 `ENCRYPT_OFF`(암호화 가능하지만 끔)를 보내고 서버도 같은 값으로 답하면 규격상 **로그인 패킷만 암호화**하게 됩니다.

즉 `Encrypt=no`는 "데이터 구간을 평문으로 보내겠다"는 뜻이지 "TLS를 안 쓰겠다"는 뜻이 아닙니다. 로그인 한 번을 위해 TLS 핸드셰이크는 반드시 일어나고, 그래서 OpenSSL 설정은 선택이 아니라 연결의 전제 조건입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 566" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="위쪽은 ODBC Driver 18에서 Encrypt를 no로 두어도 PRELOGIN 협상 결과 로그인 패킷 암호화를 위해 TLS 핸드셰이크가 일어나는 흐름, 아래쪽은 암호화를 아예 지원하지 않는다고 선언해 TLS 없이 평문 로그인하는 흐름을 보여주는 그림">
<style>
.mi3-panel { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.mi3-head { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); }
.mi3-warn { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); }
.mi3-good { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); }
.mi3-h { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; text-anchor: middle; }
.mi3-t { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
.mi3-l { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; }
.mi3-s { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
.mi3-life { stroke: var(--border, #e7e5e4); stroke-width: 1.4; stroke-dasharray: 4 4; }
.mi3-ln { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
</style>
<defs>
<marker id="mi3Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<!-- 위 패널: Encrypt=no 여도 TLS -->
<rect class="mi3-panel" x="10" y="8" width="380" height="296" rx="8"/>
<text class="mi3-h" x="200" y="32">ODBC Driver 18 (Encrypt=no)</text>
<rect class="mi3-head" x="36" y="44" width="108" height="32" rx="6"/>
<text class="mi3-l" x="90" y="65">클라이언트</text>
<rect class="mi3-head" x="256" y="44" width="108" height="32" rx="6"/>
<text class="mi3-l" x="310" y="65">SQL Server</text>
<line class="mi3-life" x1="90" y1="76" x2="90" y2="290"/>
<line class="mi3-life" x1="310" y1="76" x2="310" y2="290"/>
<text class="mi3-l" x="200" y="100">PRELOGIN: ENCRYPT_OFF</text>
<line class="mi3-ln" x1="90" y1="110" x2="310" y2="110" marker-end="url(#mi3Arrow)"/>
<text class="mi3-l" x="200" y="136">ENCRYPT_OFF</text>
<line class="mi3-ln" x1="310" y1="146" x2="90" y2="146" marker-end="url(#mi3Arrow)"/>
<rect class="mi3-warn" x="56" y="160" width="288" height="48" rx="6"/>
<text class="mi3-t" x="200" y="182">TLS 핸드셰이크 발생</text>
<text class="mi3-s" x="200" y="201">OpenSSL 설정이 여기서 걸림</text>
<text class="mi3-l" x="200" y="232">LOGIN7: 로그인 패킷 암호화</text>
<line class="mi3-ln" x1="90" y1="242" x2="310" y2="242" marker-end="url(#mi3Arrow)"/>
<text class="mi3-s" x="200" y="268">이후 쿼리와 결과는 평문</text>
<line class="mi3-ln" x1="90" y1="278" x2="310" y2="278" stroke-dasharray="5 4" marker-end="url(#mi3Arrow)"/>
<!-- 아래 패널: 암호화 미지원 선언 -->
<rect class="mi3-panel" x="10" y="320" width="380" height="236" rx="8"/>
<text class="mi3-h" x="200" y="344">jTDS 기본값 (ssl=off)</text>
<rect class="mi3-head" x="36" y="356" width="108" height="32" rx="6"/>
<text class="mi3-l" x="90" y="377">클라이언트</text>
<rect class="mi3-head" x="256" y="356" width="108" height="32" rx="6"/>
<text class="mi3-l" x="310" y="377">SQL Server</text>
<line class="mi3-life" x1="90" y1="388" x2="90" y2="542"/>
<line class="mi3-life" x1="310" y1="388" x2="310" y2="542"/>
<text class="mi3-l" x="200" y="412">PRELOGIN: ENCRYPT_NOT_SUP</text>
<line class="mi3-ln" x1="90" y1="422" x2="310" y2="422" marker-end="url(#mi3Arrow)"/>
<text class="mi3-l" x="200" y="448">ENCRYPT_NOT_SUP</text>
<line class="mi3-ln" x1="310" y1="458" x2="90" y2="458" marker-end="url(#mi3Arrow)"/>
<rect class="mi3-good" x="56" y="472" width="288" height="34" rx="6"/>
<text class="mi3-t" x="200" y="494">TLS 핸드셰이크 없음</text>
<text class="mi3-l" x="200" y="526">LOGIN7: 평문 로그인</text>
<line class="mi3-ln" x1="90" y1="536" x2="310" y2="536" marker-end="url(#mi3Arrow)"/>
</svg>
</div>

서버가 TLS 1.2를 못 쓰는 상태라면 여기서 한 단계 더 나갑니다. SQL Server 2008 R2는 기본 상태에서 TLS 1.2를 지원하지 않고 별도 업데이트를 설치한 빌드에서만 지원하는데, Debian 12의 기본 OpenSSL 설정은 TLS 1.2 미만과 낮은 보안 레벨을 막아 둡니다. 이 경우 `MinProtocol`과 `CipherString` 보안 레벨까지 함께 낮춰야 연결이 열립니다.

:::warning

**보안 범위를 좁혀서 쓰세요**

`UnsafeLegacyRenegotiation`은 컨테이너 전역의 OpenSSL 정책을 낮추는 설정입니다. 내부망 레거시 DB에 붙는 용도로만 쓰고, 같은 이미지에서 외부 인터넷 통신을 함께 처리한다면 그 통신까지 영향을 받는다는 점을 감안하세요.

:::

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
from airflow.sdk import BaseHook


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

Airflow 3에서는 Hook 기반 클래스가 Task SDK로 옮겨졌습니다. `airflow.hooks.base.BaseHook`은 여전히 임포트되지만 deprecated 경로이므로, 새로 쓰는 코드에서는 `airflow.sdk.BaseHook`을 씁니다.

### Encrypt=no와 TrustServerCertificate=yes

ODBC Driver 18은 `Encrypt`의 기본값이 `yes`입니다(17 이하는 `no`였습니다). 15년 된 서버에 전 구간 암호화를 그대로 켜기는 부담이 있어서 `Encrypt=no`로 데이터 구간 암호화를 끄고, `TrustServerCertificate=yes`로 자체 서명 인증서 검증을 건너뛰었습니다. 앞에서 본 대로 로그인 패킷은 이 설정과 무관하게 암호화되므로, 컨테이너의 OpenSSL 설정은 그대로 필요합니다. 서버 쪽에 강제 암호화(Force Encryption)가 켜져 있다면 `Encrypt=no`를 줘도 전 구간이 암호화된다는 점도 같이 기억해 둘 만합니다.

### 인코딩은 강제하지 않는다

처음에는 모든 연결에 CP949 인코딩을 강제 적용했는데, UTF-8 데이터가 섞여 있는 테이블에서 `UnicodeDecodeError`가 터졌습니다. 결국 **Airflow Connection의 Extra JSON에 `charset`을 명시한 경우에만** 인코딩을 적용하는 방식으로 바꿨습니다.

```json
// Airflow Connection Extra (charset이 필요한 경우만)
{"charset": "cp949"}
```

연결마다 필요한 인코딩이 다르니, 기본값은 건드리지 않고 필요한 연결에만 지정하는 편이 사고가 적습니다.

### Connection Pooling은 불필요

Airflow Task는 단발성 실행이라 Task가 시작되면 연결하고 끝나면 닫으면 됩니다. 커넥션 풀을 유지할 이유가 없고 관리 복잡도만 올라갑니다.

## 실전 파이프라인: MSSQL에서 ClickHouse로 동기화

연결이 되고 나면, 실제로 데이터를 어떻게 옮기느냐가 다음 문제입니다. 현재 MSSQL에서 데이터를 꺼내 ClickHouse로 동기화하는 일일 배치 파이프라인을 운영하고 있습니다.

### 증분 배치 동기화

전체 데이터를 매번 덤프하면 비효율적이기 때문에, **마지막으로 동기화한 ID 이후의 데이터만** 가져오는 증분 방식을 사용합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 402" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="ClickHouse에서 마지막 동기화 지점을 읽고, MSSQL 배치 조회와 변환과 INSERT를 반복한 뒤, 루프가 끝나면 OPTIMIZE TABLE FINAL을 실행하는 증분 동기화 흐름도">
<style>
.mi4-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); }
.mi4-loop { fill: none; stroke: var(--primary, #0a756c); stroke-width: 1.6; stroke-dasharray: 6 4; }
.mi4-t { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
.mi4-p { fill: var(--primary, #0a756c); font-size: 14px; }
.mi4-ln { stroke: var(--text-muted, #6d6762); stroke-width: 1.6; fill: none; }
.mi4-pl { stroke: var(--primary, #0a756c); stroke-width: 1.8; fill: none; }
</style>
<defs>
<marker id="mi4Arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
<marker id="mi4ArrowP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary, #0a756c)"/>
</marker>
</defs>
<rect class="mi4-box" x="70" y="36" width="260" height="44" rx="6"/>
<text class="mi4-t" x="200" y="64">ClickHouse에서 max_idx 조회</text>
<line class="mi4-ln" x1="200" y1="80" x2="200" y2="94" marker-end="url(#mi4Arrow)"/>
<rect class="mi4-loop" x="30" y="96" width="340" height="234" rx="8"/>
<text class="mi4-p" x="44" y="119">while current_idx &lt; max_idx</text>
<rect class="mi4-box" x="70" y="130" width="260" height="44" rx="6"/>
<text class="mi4-t" x="200" y="158">MSSQL에서 TOP N 배치 조회</text>
<line class="mi4-ln" x1="200" y1="174" x2="200" y2="188" marker-end="url(#mi4Arrow)"/>
<rect class="mi4-box" x="70" y="190" width="260" height="44" rx="6"/>
<text class="mi4-t" x="200" y="218">pyodbc.Row → list 변환</text>
<line class="mi4-ln" x1="200" y1="234" x2="200" y2="248" marker-end="url(#mi4Arrow)"/>
<rect class="mi4-box" x="70" y="250" width="260" height="44" rx="6"/>
<text class="mi4-t" x="200" y="278">ClickHouse에 배치 INSERT</text>
<path class="mi4-pl" d="M 200 294 L 200 312 L 52 312 L 52 152 L 66 152" marker-end="url(#mi4ArrowP)"/>
<line class="mi4-ln" x1="200" y1="330" x2="200" y2="344" marker-end="url(#mi4Arrow)"/>
<rect class="mi4-box" x="70" y="346" width="260" height="44" rx="6"/>
<text class="mi4-t" x="200" y="374">OPTIMIZE TABLE FINAL</text>
</svg>
</div>

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

## 만났던 에러 정리

연결 성공까지 거쳐간 에러들을 정리합니다. 각각 다른 계층에서 발생한 문제들이라, 레거시 MSSQL 연동을 시도하는 분들에게 참고가 될 수 있습니다.

| # | 에러 | 원인 | 해결 |
|---|------|------|------|
| 1 | `NO_PUBKEY EB3E94ADBE1229CF` | `apt-key add`는 폐기된 방식 | `gpg --dearmor` + `signed-by`로 변경 |
| 2 | `Unable to locate package msodbcsql17` | 리눅스용 Driver 17에 arm64 빌드 없음 | Driver 18 사용 |
| 3 | `SSL routines::unsafe legacy renegotiation disabled` | OpenSSL 3.x가 레거시 재협상을 차단 | `UnsafeLegacyRenegotiation` 허용 |
| 4 | `UnicodeDecodeError: 'cp949'` | CP949 강제 적용 시 UTF-8 데이터 충돌 | Connection Extra에서 charset 선택 적용 |
| 5 | `TypeError: cannot serialize pyodbc.Row` | XCom은 기본 타입만 직렬화 가능 | `list(row)` 변환 |

## 마치며

레거시 연동에서 발목을 잡는 건 애플리케이션 코드가 아니라 그 아래 계층입니다. 이번에는 TDS 버전이 아니라 그보다 한 층 아래, 로그인 직전에 일어나는 TLS 핸드셰이크가 문제였습니다. `Encrypt=no`를 써도 로그인 패킷은 암호화된다는 규격 한 줄을 모르면, 암호화를 껐는데 왜 SSL 에러가 나느냐는 자리에서 계속 맴돌게 됩니다.

"DBeaver는 되는데 왜 안 되지?"라는 질문이 유용했던 이유는, 서버가 아니라 클라이언트를 보게 만들었기 때문입니다. 같은 서버에 붙는 두 클라이언트를 놓고 무엇이 다른지 하나씩 지우다 보면 남는 게 원인입니다.

## 참고자료

- [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/microsoft-odbc-driver-for-sql-server)
- [ODBC DSN and connection string keywords](https://learn.microsoft.com/en-us/sql/connect/odbc/dsn-connection-string-attribute): `Encrypt` 기본값과 "로그인 자격 증명은 항상 암호화된다"는 서술
- [System Requirements, Installation, and Driver Files](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/system-requirements-installation-and-driver-files): 드라이버별 SQL Server 호환 표
- [MS-TDS: PRELOGIN](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tds/60f56408-0188-4cd5-8b90-25c6f2423868): 암호화 협상 값과 클라이언트 동작 표
- [FreeTDS: Choosing a TDS protocol version](https://www.freetds.org/userguide/ChoosingTdsProtocol.html)
- [FreeTDS Issue #118: Cannot connect to MS SQL Server 2008 with newer FreeTDS version](https://github.com/FreeTDS/freetds/issues/118)
- [jTDS FAQ](https://jtds.sourceforge.net/faq.html): `ssl`과 `tds` 연결 속성 기본값
- [pyodbc Wiki: Connecting to SQL Server from Linux](https://github.com/mkleehammer/pyodbc/wiki/Connecting-to-SQL-Server-from-Linux)
- [Airflow: Creating a custom Operator](https://airflow.apache.org/docs/apache-airflow/stable/howto/custom-operator.html)
