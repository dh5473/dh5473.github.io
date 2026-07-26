---
date: '2026-07-23'
title: 'vLLM 실전 서빙 가이드'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 8
tags: ['LLM Serving', 'vLLM', 'Structured Output', 'Tensor Parallelism', 'CUDA Graph']
summary: 'vLLM V1 엔진의 프로세스 구조부터 gpu_memory_utilization, max_model_len, CUDA graph, Structured Output, Tensor Parallelism까지 서빙 핵심 인자를 엔진 동작 원리로부터 설명합니다.'
thumbnail: './thumbnail.png'
---

vllm serve로 모델을 띄우고 nvidia-smi를 확인하면, 요청을 하나도 처리하지 않았는데 GPU 메모리가 이미 90% 넘게 차 있습니다. ps로 확인하면 프로세스도 하나가 아니라 서너 개씩 떠 있습니다. 처음 보면 뭔가 잘못된 것 같지만, 둘 다 의도된 설계입니다.

이번 글에서는 vLLM 서버를 실제로 띄울 때 마주치는 이런 현상들을 엔진 구조로부터 설명합니다. V1 엔진이 프로세스를 어떻게 나누는지 먼저 보고, 서빙 설정의 뼈대가 되는 엔진 인자들(`gpu_memory_utilization`, `max_model_len`, `max_num_seqs`, `max_num_batched_tokens`, `enforce_eager`)이 각각 엔진의 어디를 건드리는지 짚은 뒤, 출력 형식을 강제하는 structured output과 GPU 여러 장에 모델을 나누는 Tensor Parallelism까지 다룹니다. 기준은 vLLM v0.25.1(V1 엔진)입니다.

<br>

## 프로세스 셋으로 나뉘어 도는 V1 엔진

`vllm serve google/gemma-4-31B-it --tensor-parallel-size 2`를 실행하면 프로세스 4개가 뜹니다. API 서버 1개, EngineCore 1개, GPU 워커 2개(GPU당 1개)입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 460 340" style="width: 100%; height: auto; max-width: 460px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="vLLM V1 엔진의 프로세스 구조. HTTP 요청이 API 서버 프로세스로 들어가고, ZMQ로 EngineCore 프로세스에 전달된 뒤, shared memory 브로드캐스트로 GPU마다 하나씩 붙은 워커 프로세스로 내려갑니다.">
  <style>
    .vp1-box   { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .vp1-label { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .vp1-sub   { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: middle; }
    .vp1-note  { fill: var(--text-muted, #78716c); font-size: 17px; text-anchor: start; }
    .vp1-arrow { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; marker-end: url(#vp1Arrow); }
    .vp1-line  { stroke: var(--text-muted, #78716c); stroke-width: 1.5; fill: none; }
  </style>
  <defs>
    <marker id="vp1Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #78716c)"/>
    </marker>
  </defs>
  <text x="230" y="18" class="vp1-sub">HTTP 요청 / 응답</text>
  <path d="M230,26 L230,38" class="vp1-arrow"/>
  <rect x="20" y="40" width="420" height="72" rx="8" class="vp1-box"/>
  <text x="230" y="70" class="vp1-label">API 서버 (APIServer)</text>
  <text x="230" y="95" class="vp1-sub">요청 수신, 토큰화, 디토큰화, 스트리밍</text>
  <path d="M230,112 L230,140" class="vp1-arrow"/>
  <text x="240" y="131" class="vp1-note">ZMQ</text>
  <rect x="20" y="142" width="420" height="72" rx="8" class="vp1-box"/>
  <text x="230" y="172" class="vp1-label">EngineCore</text>
  <text x="230" y="197" class="vp1-sub">스케줄러 busy loop, KV Cache 블록 관리</text>
  <path d="M230,214 L230,238" class="vp1-line"/>
  <path d="M120,238 L340,238" class="vp1-line"/>
  <path d="M120,238 L120,258" class="vp1-arrow"/>
  <path d="M340,238 L340,258" class="vp1-arrow"/>
  <text x="240" y="232" class="vp1-note">shared memory</text>
  <rect x="20" y="260" width="200" height="68" rx="8" class="vp1-box"/>
  <text x="120" y="288" class="vp1-label">Worker_TP0</text>
  <text x="120" y="313" class="vp1-sub">GPU 0, forward 실행</text>
  <rect x="240" y="260" width="200" height="68" rx="8" class="vp1-box"/>
  <text x="340" y="288" class="vp1-label">Worker_TP1</text>
  <text x="340" y="313" class="vp1-sub">GPU 1, forward 실행</text>
</svg>
</div>

각자의 역할이 뚜렷합니다. API 서버는 HTTP 요청을 받아 프롬프트를 토큰으로 바꾸고, 생성된 토큰을 다시 텍스트로 바꿔 스트리밍합니다. EngineCore는 스케줄러가 도는 곳입니다. 매 스텝 어떤 요청의 어떤 토큰을 배치에 넣을지 결정하고 KV Cache 블록을 관리하는 busy loop를 돌립니다. 워커는 GPU마다 하나씩 붙어서 가중치를 올리고 forward를 실행합니다.

이렇게 나눈 이유가 이 구조의 핵심입니다. 토큰화, 디토큰화, HTTP 스트리밍은 전부 CPU 작업입니다. 이것들이 스케줄링 루프와 같은 프로세스에 있으면, 긴 프롬프트를 토큰화하는 동안 GPU에 일감을 주는 루프가 멈추고 GPU는 그 시간만큼 놉니다. V1은 CPU 작업을 API 서버 프로세스로 밀어내서 GPU 실행 루프와 겹쳐 돌아가게 만들었습니다. EngineCore는 오직 스케줄링과 실행만 합니다.

요청 하나의 생애주기를 따라가면 이렇습니다. HTTP로 들어온 요청을 API 서버가 토큰화해서 ZMQ로 EngineCore에 넘기고, 스케줄러가 배치에 실어 워커에 브로드캐스트하고, 워커가 forward로 다음 토큰을 만들면 결과가 역순으로 API 서버까지 돌아와 디토큰화된 뒤 클라이언트로 스트리밍됩니다. 같은 노드 안에서 API 서버와 EngineCore는 ZMQ(Unix 소켓)로, EngineCore와 워커들은 shared memory로 통신합니다.

:::info

**로그에서 확인하기**

vLLM 로그는 줄마다 `(APIServer pid=...)`, `(EngineCore pid=...)`, `(Worker_TP0 pid=...)` 프리픽스가 붙습니다. 어느 프로세스가 낸 로그인지 구분되므로, 위 구조를 로그에서 그대로 확인할 수 있습니다.

:::

<br>

## 시작하자마자 메모리를 다 잡는 이유

vLLM은 시작할 때 GPU 메모리의 일정 비율을 통째로 예약합니다. 그 비율이 `--gpu-memory-utilization`이고, 기본값은 0.92입니다. 여기서 중요한 것은 이 비율이 **전체 메모리 기준**이라는 점입니다. 다른 프로세스가 GPU를 쓰고 있으면 그만큼 양보하는 것이 아니라, 빈 메모리가 예약량보다 적으면 시작 자체가 실패합니다. 한 GPU에 vLLM 인스턴스 두 개를 올리려면 각각 0.45처럼 합이 1 아래가 되게 나눠 지정해야 합니다.

예약한 메모리를 어디에 쓰는지는 시작 순서를 보면 드러납니다. 가중치를 올린 다음, vLLM은 최대 크기 배치로 더미 forward를 한 번 돌려서 활성값이 정점에서 얼마나 먹는지, NCCL 버퍼 같은 PyTorch 밖 메모리가 얼마인지, CUDA graph가 얼마를 쓸지 측정하고 추정합니다. 그리고 예산에서 이것들을 뺀 **나머지 전부를 KV Cache 풀로** 만듭니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 212" style="width: 100%; height: auto; max-width: 480px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="80GB GPU에 gpu_memory_utilization 0.92를 적용한 73.6GB 예산을 모델 가중치, 활성값 피크와 CUDA graph, KV Cache 풀 세 몫으로 나눈 가로 막대. KV Cache 풀은 앞의 두 몫을 뺀 나머지 전부를 차지합니다.">
  <style>
    .vm1-title  { fill: var(--text, #1c1917); font-size: 21px; text-anchor: middle; }
    .vm1-fixed  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .vm1-act    { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #d97706); stroke-width: 1.5; }
    .vm1-kv     { fill: var(--primary, #0d9488); stroke: var(--primary, #0d9488); stroke-width: 1.5; }
    .vm1-in     { fill: var(--text, #1c1917); font-size: 18px; text-anchor: middle; }
    .vm1-legend { fill: var(--text, #1c1917); font-size: 18px; text-anchor: start; }
  </style>
  <text x="240" y="28" class="vm1-title">80GB GPU × 0.92 = 73.6GB 예산</text>
  <rect x="20" y="46" width="150" height="52" rx="4" class="vm1-fixed"/>
  <text x="95" y="78" class="vm1-in">가중치</text>
  <rect x="170" y="46" width="90" height="52" class="vm1-act"/>
  <text x="215" y="78" class="vm1-in">활성값</text>
  <rect x="260" y="46" width="200" height="52" rx="4" class="vm1-kv"/>
  <text x="360" y="78" class="vm1-in" fill="#ffffff">KV Cache 풀</text>
  <rect x="20" y="118" width="16" height="16" rx="3" class="vm1-fixed"/>
  <text x="46" y="131" class="vm1-legend">모델 가중치 (고정)</text>
  <rect x="20" y="152" width="16" height="16" rx="3" class="vm1-act"/>
  <text x="46" y="165" class="vm1-legend">활성값 피크 + CUDA graph (시작 시 추정)</text>
  <rect x="20" y="186" width="16" height="16" rx="3" class="vm1-kv"/>
  <text x="46" y="199" class="vm1-legend">KV Cache 풀 (남는 것 전부)</text>
</svg>
</div>

nvidia-smi가 시작부터 90% 넘게 차 있는 이유가 이것입니다. 요청이 많아지면 메모리를 늘려가는 것이 아니라, 쓸 수 있는 메모리를 미리 전부 KV Cache 풀로 확보해두고 그 안에서 블록을 할당합니다. 시작 로그에 이 계산의 결과가 그대로 찍힙니다.

```text
Available KV cache memory: 38.21 GiB
GPU KV cache size: 613,024 tokens
Maximum concurrency for 32,768 tokens per request: 18.71x
```

숫자는 환경마다 다르지만 세 줄의 의미는 같습니다. 첫 줄이 예산에서 가중치와 활성값을 빼고 남은 KV 몫, 둘째 줄이 그 메모리를 모델의 토큰당 KV 크기로 나눠 토큰 단위로 환산한 KV Cache 풀의 총용량입니다(이 예시는 토큰당 약 65KB인 모델입니다). 셋째 줄의 최대 동시성은 풀 총용량을 `max_model_len` 길이 요청 하나가 차지할 토큰 수로 나눈 값으로, 모든 요청이 최대 길이까지 갔을 때도 18개 요청을 동시에 감당한다는 뜻입니다.

기본값을 1.0으로 올리지 않는 이유도 이 구조에서 나옵니다. 더미 forward로 재는 활성값과 CUDA graph 메모리는 추정치라서 실제 운영에서 조금씩 어긋날 수 있고, GPU에는 드라이버 등 기본 점유도 있습니다. 여유 없이 꽉 채우면 운영 중 OOM으로 돌아옵니다. KV가 모자라면 vLLM은 진행 중인 요청을 잠시 내리고 나중에 다시 계산하는 preemption으로 버티는데, 이 preemption 로그가 잦다는 신호가 보일 때 0.95까지 올려보는 식으로, 기본값에서 출발해 조정하는 인자입니다.

<br>

## 요청 길이의 상한을 정하는 max_model_len

`--max-model-len`은 요청 하나가 가질 수 있는 최대 길이(프롬프트 + 출력)입니다. 지정하지 않으면 모델 설정의 컨텍스트 길이를 그대로 씁니다. Gemma 4 31B라면 256K입니다.

이 인자가 실제로 하는 일은 두 가지입니다. 우선 이 길이를 넘는 요청은 API에서 거부됩니다. 그리고 시작할 때 vLLM은 `max_model_len` 길이의 요청 **하나**가 KV Cache 풀에 들어가는지 검사합니다. 안 들어가면 "KV Cache 메모리가 부족하니 gpu_memory_utilization을 올리거나 max_model_len을 줄이라"는 에러와 함께 시작이 실패합니다. 256K 컨텍스트 모델을 작은 GPU에 올릴 때 흔히 만나는 에러인데, 해법은 에러 메시지 그대로 `max_model_len`을 실제 워크로드 길이로 내리는 것입니다.

내려야 하는 이유는 시작 검사 통과만이 아닙니다. 위에서 본 최대 동시성이 `max_model_len` 기준으로 계산되므로, 256K를 그대로 두면 실제로는 4K짜리 요청만 오는 서비스에서도 보장되는 동시성이 256K 요청 기준으로 계산됩니다. 요청당 KV는 PagedAttention이 실제 길이만큼만 블록을 할당하니 메모리 낭비는 없지만, 최악의 요청을 상정하는 기준선이 현실과 동떨어지게 됩니다. 워크로드의 p99 길이에 여유를 얹은 값으로 내려 잡는 것이 실전의 기본입니다.

<br>

## 스케줄러의 두 손잡이 max_num_seqs와 max_num_batched_tokens

V1 스케줄러는 매 스텝 토큰 예산(`max_num_batched_tokens`)을 채우는 방식으로 배치를 짭니다. decode 중인 요청들을 먼저 넣고, 남는 예산에 prefill을 잘라 넣습니다(chunked prefill, V1 기본 동작). `max_num_seqs`는 한 스텝에 올라갈 수 있는 요청 수의 상한입니다. 예산을 크게 잡으면 prefill이 빨리 끝나 첫 토큰이 빨라지는 대신 스텝이 무거워져 진행 중인 요청들의 토큰 간격이 벌어지고, 작게 잡으면 반대가 됩니다.

실전에서 알아둘 것은 이 둘의 기본값이 단일 숫자가 아니라 **하드웨어에 따라 다르다**는 점입니다.

| 인자 (OpenAI 호환 서버 기준) | H100급 (메모리 70GiB 이상, A100 제외) | 그 외 (A100 포함) |
|---|---|---|
| `max_num_seqs` | 1024 | 256 |
| `max_num_batched_tokens` | 8192 | 2048 |

A100이 예외로 빠져 있는 것은 큰 기본값이 A100에서 오히려 처리량을 떨어뜨렸기 때문입니다. 조정 방향은 명확합니다. KV가 부족해 preemption 로그가 잦으면 둘 중 하나를 낮추고, 큰 GPU에서 작은 모델의 처리량을 끌어올리려면 공식 문서 권장대로 `max_num_batched_tokens`를 8192보다 크게 잡습니다.

:::warning

**낡은 자료 주의**

인터넷의 vLLM 튜닝 자료 상당수가 V0 시절 이야기입니다. "`gpu_memory_utilization` 기본값 0.9"는 지금 0.92이고, `--enable-chunked-prefill`은 V1에서 기본 활성화라 넘길 필요가 없으며, `--swap-space`는 인자 자체가 사라졌습니다(V1은 KV가 부족하면 CPU로 옮기는 대신 preemption 후 재계산합니다).

:::

<br>

## decode의 커널 launch 비용을 없애는 CUDA graph

decode 한 스텝은 수십에서 수백 개 커널의 연속입니다. 그런데 decode는 토큰 하나씩 만드는 단계라 커널 하나하나가 작고, CPU가 커널을 하나씩 GPU에 launch하는 오버헤드가 상대적으로 커집니다. CUDA graph는 이 커널 시퀀스를 시작할 때 한 번 캡처해두고, 이후에는 launch 없이 통째로 재생하는 기능입니다. 커널 자체가 빨라지는 것이 아니라 커널 사이의 CPU 오버헤드가 사라집니다.

V1의 기본 모드는 FULL_AND_PIECEWISE입니다. 매 스텝 모양이 일정한 decode 배치는 전체를 그래프로 캡처하고, 길이가 들쭉날쭉한 prefill이 섞인 배치는 그래프에 담을 수 없는 일부 attention 연산만 밖에 두는 piecewise 방식으로 캡처합니다.

공짜는 아닙니다. 배치 크기별로 그래프를 미리 캡처해야 해서 시작 시간이 수십 초 늘고, 그래프가 GPU 메모리를 차지합니다. 시작 로그의 `Graph capturing finished in 17 secs, took 0.48 GiB` 같은 줄이 그 비용입니다. 이 메모리는 앞서 본 메모리 프로파일링 단계에서 미리 추정되어 예산에서 빠지는데, 추정이 기본 동작이 되면서 `gpu_memory_utilization` 기본값이 0.9에서 0.92로 오른 배경이기도 합니다.

`--enforce-eager`는 이 캡처를 전부 생략하고 매 스텝 PyTorch eager 모드로 실행하는 스위치입니다. 기동이 훨씬 빨라지므로 모델을 자주 다시 띄우는 개발 루프에서 유용하고, 메모리가 정말 빠듯할 때 그래프 몫을 회수하는 최후 수단도 됩니다. 대신 decode 성능을 계속 손해 봅니다.

:::warning

**주의**

개발 중에 붙인 `--enforce-eager`를 프로덕션 스크립트에 그대로 남기는 실수가 흔합니다. 서비스 배포에서는 떼는 것이 기본입니다. 매 decode 스텝에 launch 오버헤드를 계속 지불하게 됩니다.

:::

<br>

## 출력 형식을 강제하는 Structured Output

JSON만 받아야 하는 시스템에 LLM을 붙일 때, 프롬프트로 "JSON으로 답하라"고 지시하는 것만으로는 부족합니다. 모델은 언제든 설명 문장을 앞에 붙이거나 필드를 빼먹을 수 있습니다. structured output은 이 문제를 부탁이 아니라 강제로 풉니다. 요청에 JSON 스키마, 정규식, 선택지, 문법 중 하나를 걸면 형식을 벗어난 출력이 아예 생성되지 않습니다. guided decoding이라는 옛 이름으로도 불리는데, 같은 기능입니다.

원리는 샘플링 직전의 개입입니다. vLLM은 스키마를 문법 상태 기계로 컴파일해두고, decode 매 스텝 지금 문법상 허용되는 토큰의 비트마스크를 만들어 샘플링 직전에 나머지 토큰의 logit을 전부 차단합니다. 모델이 어떤 토큰을 원하든 문법에 맞는 토큰만 샘플링됩니다. 다만 보장되는 것은 형식이지 내용이 아닙니다. 공식 문서도 스키마를 걸었더라도 프롬프트에 원하는 구조를 함께 설명하면 결과가 눈에 띄게 좋아진다고 권합니다.

걱정되는 것은 비용인데, V1에서는 decode에 얹히는 비용이 거의 없습니다. 비트마스크 계산은 CPU 일이라, EngineCore가 GPU에 forward를 비동기로 던져놓고 GPU가 도는 동안 CPU가 마스크를 채워 샘플링에 넘깁니다. GPU를 기다리며 놀던 CPU 시간을 쓰는 셈입니다. 실제 비용은 새 스키마의 첫 요청에 있습니다. 스키마를 상태 기계로 컴파일하는 작업은 별도 스레드에서 돌고 그동안 해당 요청만 대기하는데, 결과가 캐시되므로 같은 스키마를 반복하는 서비스는 첫 요청만 이 지연을 냅니다. 반대로 요청마다 스키마가 달라지는 워크로드는 컴파일 비용을 계속 내게 됩니다.

이 마스크를 계산해주는 라이브러리가 백엔드입니다. 기본값 auto는 xgrammar를 먼저 쓰고, 스키마가 xgrammar가 지원하지 않는 기능(`multipleOf` 등)을 쓰면 guidance로 넘어갑니다. 대체로 xgrammar가 반복 스키마에서 빠르고, guidance가 지원하는 JSON 스키마 기능의 폭이 넓습니다. 백엔드를 지정하려면 `--structured-outputs-config.backend`를 씁니다.

사용법은 OpenAI 호환 API의 `response_format` 그대로입니다.

```json
{
  "model": "google/gemma-4-31B-it",
  "messages": [{"role": "user", "content": "다음 문장에서 이름과 나이를 추출해줘. ..."}],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "person",
      "schema": {
        "type": "object",
        "properties": {"name": {"type": "string"}, "age": {"type": "integer"}},
        "required": ["name", "age"]
      }
    }
  }
}
```

정규식, 선택지, 임의 문법이 필요하면 vLLM 확장 파라미터 `structured_outputs`(json, regex, choice, grammar)를 씁니다. thinking을 켠 모델에서는 사고 과정에는 마스크를 걸지 않고 최종 답변부터 형식을 강제합니다.

:::warning

**낡은 자료 주의**

`guided_json`, `guided_regex`, `guided_choice`, `guided_grammar` 파라미터와 `--guided-decoding-backend` 플래그는 v0.12.0에서 제거되었습니다. 검색으로 찾은 예제가 이 이름을 쓰고 있다면 현재 버전에서는 동작하지 않습니다.

:::

<br>

## 모델을 GPU 여러 장에 나누는 Tensor Parallelism

`--tensor-parallel-size N`은 모델의 각 레이어를 N장의 GPU에 나눕니다. 레이어를 통째로 나누는 것이 아니라 레이어 **안의** 가중치 행렬을 나눈다는 점이 핵심입니다.

나누는 방식은 연산 구조를 따라갑니다. attention은 head 단위로 배분합니다. head 32개짜리 모델을 TP=4로 돌리면 GPU마다 head 8개씩 맡고, head 하나의 attention 계산은 GPU 하나 안에서 끝납니다. MLP는 첫 번째 행렬을 열 방향으로, 두 번째 행렬을 행 방향으로 나눕니다. 이렇게 짝을 맞추면 중간의 활성함수 지점에서 GPU 간 통신이 필요 없고, 각 블록의 출력에서만 결과를 합치면 됩니다.

그래서 통신량이 정확히 계산됩니다. 레이어당 forward에서 all-reduce 2회, attention 출력에서 한 번과 MLP 출력에서 한 번입니다. 레이어 60개 모델이면 토큰 하나를 decode할 때마다 all-reduce 120회가 GPU들 사이를 오갑니다. NVLink처럼 빠른 인터커넥트로 묶인 GPU에서는 이 비용이 감춰지지만, PCIe로만 연결된 GPU에서는 all-reduce가 병목이 되어 TP의 이득이 크게 깎입니다.

KV Cache에도 같은 분할이 적용됩니다. KV head도 TP 수만큼 나뉘므로 KV Cache가 GPU마다 1/N씩 분산되고, 가중치 몫도 1/N로 줄어 있으니 GPU당 KV 여유가 이중으로 늘어납니다. 모델이 한 장에 들어가더라도 KV 풀을 키우려고 TP를 쓰는 경우가 있는 이유입니다. 다만 여러 query head가 KV head 하나를 공유하는 GQA 구조라 KV head가 몇 개 없는 모델에서, TP를 KV head 수보다 크게 잡으면, 같은 KV head를 여러 GPU가 복제해서 들고 가며 캐시 효율이 떨어집니다.

TP 값을 고를 때는 제약도 있습니다. attention head 수가 TP로 나누어떨어지지 않으면 시작 시 에러가 나고, 양자화 모델은 가중치를 일정 크기의 group으로 묶어 압축하므로, 나눈 조각이 그 group 크기로 떨어져야 해서 가능한 TP 조합이 더 좁습니다.

정리하면 판단 순서는 이렇습니다.

- 모델이 GPU 한 장에 여유 있게 들어가면 TP=1이 기본입니다. 작은 모델을 쪼개면 통신 비용이 이득을 넘어서고, GPU가 여러 장이라면 TP=1 인스턴스를 장수만큼 복제하는 쪽이 처리량에 유리합니다.
- 가중치는 들어가는데 KV 풀이 부족하면 TP가 선택지가 됩니다. 시작 로그의 KV cache size와 최대 동시성으로 효과를 바로 확인할 수 있습니다.
- 한 장에 안 들어가면 노드 안에서 TP를 키웁니다. 공식 문서의 관행은 "TP는 노드 안 GPU 수까지, 노드를 넘어야 하면 Pipeline Parallelism"입니다.

다른 병렬화 모드는 이 글의 범위에서는 이름만 알아두면 됩니다. Pipeline Parallelism은 레이어 방향으로 잘라 노드 경계를 넘을 때 쓰고, Data Parallelism은 모델 전체를 복제해 트래픽을 나누며, Expert Parallelism은 MoE 모델의 expert들을 GPU에 분산합니다. 단일 노드에서 dense 모델을 서빙한다면 대부분 TP만으로 충분합니다.

<br>

## 마치며

이번 글의 설정들은 결국 하나의 질문으로 모입니다. 가중치라는 고정비를 빼고 남는 메모리와 연산을 어디에 쓸 것인가. `gpu_memory_utilization`과 `max_model_len`은 남는 메모리를 KV 풀로 바꾸는 손잡이고, 스케줄러의 두 인자와 CUDA graph는 남는 연산을 배치와 커널 재생으로 채우는 손잡이며, TP는 그 판 자체를 GPU 여러 장으로 넓히는 선택입니다. 다음 글에서는 시리즈의 마지막으로, TTFT와 TPOT 같은 성능 지표를 정의하고 그 지표를 근거로 오늘 본 인자들을 튜닝하는 방법을 다루겠습니다.

<br>

## 함께 보면 좋은 글

- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [vLLM의 핵심 원리 PagedAttention 파헤치기](/llm/paged-attention/)
- [Continuous Batching과 Chunked Prefill 완전 이해](/llm/continuous-batching/)
- [서빙을 위한 양자화 가이드 FP8, AWQ, GPTQ](/llm/llm-quantization-serving/)

<br>

## 참고자료

- [vLLM Architecture Overview](https://docs.vllm.ai/en/latest/design/arch_overview/)
- [vLLM V1: A Major Upgrade to vLLM's Core Architecture](https://vllm.ai/blog/2025-01-27-v1-alpha-release)
- [vLLM Optimization and Tuning](https://docs.vllm.ai/en/latest/configuration/optimization.html)
- [vLLM Conserving Memory](https://docs.vllm.ai/en/latest/configuration/conserving_memory.html)
- [vLLM Parallelism and Scaling](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/)
- [vLLM CUDA Graphs Design](https://docs.vllm.ai/en/latest/design/cuda_graphs.html)
- [vLLM Structured Outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html)
- [XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models](https://arxiv.org/abs/2411.15100)
- [Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism](https://arxiv.org/abs/1909.08053)
