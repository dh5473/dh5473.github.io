---
date: '2026-07-26'
title: 'LLM 서빙 성능 지표와 튜닝'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 9
tags: ['LLM Serving', 'vLLM', 'TTFT', 'Goodput', 'MoE']
summary: 'TTFT, TPOT, ITL, Goodput 지표를 정의하고 대역폭과 KV 용량이라는 두 하드웨어 천장을 계산한 뒤, vllm bench로 측정한 지표를 근거로 서빙 인자를 조정하는 방법을 정리합니다.'
thumbnail: './thumbnail.png'
---

부하 테스트에서 동시성을 올렸더니 전체 처리량이 두 배가 됐습니다. 그런데 배포하고 나니 사용자들은 오히려 답변이 느려졌다고 합니다. 모순처럼 들리지만 둘 다 사실입니다. 서버가 초당 만들어내는 토큰의 총량과 사용자 한 명이 체감하는 속도는 서로 다른 지표이고, 배치를 키우면 앞의 것은 오르고 뒤의 것은 나빠집니다.

시리즈의 마지막인 이번 글은 이 간극을 다루는 도구를 정리합니다. 요청 하나의 시간을 쪼개는 지표(TTFT, TPOT, ITL)와 지연 목표(SLO)를 결합한 goodput을 정의하고, 처리량과 지연시간이 왜 반대로 움직이는지, 그 움직임의 끝에 있는 두 하드웨어 천장(대역폭과 KV 용량)이 무엇인지 계산한 뒤, 측정한 지표를 근거로 서빙 인자를 움직이는 순서로 갑니다. 기준은 vLLM v0.25.1입니다.

<br>

## 요청 하나의 시간을 쪼개는 네 가지 지표

LLM은 프롬프트 전체를 한 번에 읽어 첫 토큰을 만드는 prefill과, 그 뒤로 토큰을 하나씩 이어 만드는 decode의 두 단계로 응답을 생성합니다. 스트리밍으로 응답하는 서비스에서 요청 하나의 시간을 이 흐름대로 쪼개면 이렇게 나뉩니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 205" style="width: 100%; height: auto; max-width: 480px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="요청 하나의 시간을 쪼갠 타임라인. 요청 전송부터 첫 토큰까지가 TTFT이고, 첫 토큰 이후 토큰과 토큰 사이의 간격 하나하나가 ITL이며, 요청 전송부터 마지막 토큰까지 전체가 E2E 지연시간입니다. 토큰 간격 중 하나는 눈에 띄게 벌어져 있습니다.">
  <!-- ITL 안내 -->
  <text x="285" y="22" text-anchor="middle" font-size="13" fill="var(--text-muted, #78716c)">토큰 사이 간격 하나하나가 ITL</text>
  <path d="M150 42 H420" stroke="var(--text-muted, #78716c)" stroke-width="1.5" fill="none"/>
  <path d="M150 36 V48 M184 36 V48 M218 36 V48 M252 36 V48 M318 36 V48 M352 36 V48 M386 36 V48 M420 36 V48" stroke="var(--text-muted, #78716c)" stroke-width="1.5" fill="none"/>
  <path d="M150 50 V70 M184 50 V70 M218 50 V70 M252 50 V70 M318 50 V70 M352 50 V70 M386 50 V70 M420 50 V70" stroke="var(--border, #e7e5e4)" stroke-width="1" stroke-dasharray="3 3" fill="none"/>
  <!-- 타임라인: TTFT 구간(accent) + decode 구간(primary) -->
  <path d="M40 75 H150" stroke="var(--accent, #d97706)" stroke-width="3" fill="none"/>
  <path d="M150 75 H420" stroke="var(--primary, #0d9488)" stroke-width="3" fill="none"/>
  <path d="M40 64 V86" stroke="var(--accent, #d97706)" stroke-width="3" fill="none"/>
  <!-- 토큰 도착 지점 -->
  <circle cx="150" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="184" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="218" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="252" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="318" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="352" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="386" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <circle cx="420" cy="75" r="5.5" fill="var(--primary, #0d9488)"/>
  <!-- 이벤트 라벨 -->
  <text x="40" y="103" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">요청 전송</text>
  <text x="150" y="103" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">첫 토큰</text>
  <text x="420" y="103" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">마지막 토큰</text>
  <!-- TTFT 브래킷 -->
  <path d="M40 118 V128 H150 V118" stroke="var(--accent, #d97706)" stroke-width="2" fill="none"/>
  <text x="95" y="146" text-anchor="middle" font-size="14" fill="var(--accent, #d97706)">TTFT (큐 대기 + prefill)</text>
  <!-- E2E 브래킷 -->
  <path d="M40 162 V172 H420 V162" stroke="var(--text-muted, #78716c)" stroke-width="2" fill="none"/>
  <text x="230" y="190" text-anchor="middle" font-size="14" fill="var(--text, #1c1917)">E2E 지연시간</text>
</svg>
</div>

- **TTFT(Time To First Token)**: 요청을 보낸 순간부터 첫 토큰을 받을 때까지. 큐 대기와 prefill이 여기에 들어갑니다. 사용자가 "반응이 왔다"고 느끼는 시점입니다.
- **TPOT(Time Per Output Token)**: 첫 토큰 이후 토큰 하나당 걸린 평균 시간. (E2E 지연시간 - TTFT) ÷ (출력 토큰 수 - 1)로, 요청 하나에 값이 하나 나옵니다.
- **ITL(Inter-Token Latency)**: 토큰과 토큰 사이의 간격 하나하나. 요청 하나에서 출력 토큰 수보다 하나 적은 개수만큼 나옵니다.
- **E2E 지연시간**: 요청 전송부터 마지막 토큰까지의 전체 시간.

TPOT과 ITL은 같은 구간을 재지만 용도가 다릅니다. TPOT은 요청 단위 평균이라 "이 요청이 전반적으로 빨랐는가"를 말하고, ITL은 간격 하나하나의 분포라 중간에 한 번씩 길게 멈칫한 순간이 그대로 남습니다. decode 도중 다른 요청의 긴 prefill이 끼어들어 한 스텝이 밀리면, 요청 평균인 TPOT에서는 희석되지만 ITL P99에는 그 스파이크가 잡힙니다. TPOT P99가 가장 느린 요청을 찾는 지표라면, ITL P99는 가장 느린 순간을 찾는 지표인 셈입니다.

평균 대신 percentile을 보는 이유도 같은 맥락입니다. p50이 좋아도 p99가 나쁘면 100명 중 1명은 항상 느린 서비스를 겪는 중이고, 트래픽이 많을수록 그 1%는 절대 수로 커집니다.

vLLM에는 이 지표들을 재는 부하 테스트 도구가 내장되어 있습니다.

```bash
vllm bench serve \
  --model google/gemma-4-31B-it \
  --dataset-name random \
  --random-input-len 1024 --random-output-len 128 \
  --num-prompts 1000 --max-concurrency 64
```

실행이 끝나면 이런 표가 나옵니다(숫자는 예시입니다).

```text
============ Serving Benchmark Result ============
Successful requests:                     1000
Failed requests:                         0
Maximum request concurrency:             64
Benchmark duration (s):                  86.40
Total input tokens:                      1024000
Total generated tokens:                  128000
Request throughput (req/s):              11.57
Output token throughput (tok/s):         1481.48
Peak output token throughput (tok/s):    1650.00
Peak concurrent requests:                64
Total token throughput (tok/s):          13333.33
---------------Time to First Token----------------
Mean TTFT (ms):                          214.63
Median TTFT (ms):                        186.20
P99 TTFT (ms):                           841.87
-----Time per Output Token (excl. 1st token)------
Mean TPOT (ms):                          41.85
Median TPOT (ms):                        40.12
P99 TPOT (ms):                           58.90
---------------Inter-token Latency----------------
Mean ITL (ms):                           41.92
Median ITL (ms):                         38.75
P99 ITL (ms):                            97.43
==================================================
```

위쪽이 서버 전체의 처리량, 아래쪽이 개별 요청의 지연 분포입니다. 이 예시에서 TPOT P99는 59ms인데 ITL P99는 97ms입니다. 요청 평균으로 보면 다들 무난했지만, 토큰 간격 중에는 평소의 두 배 넘게 벌어진 순간이 있었다는 뜻입니다. vLLM은 매 스텝 진행 중인 요청들의 decode에 새 요청의 prefill 조각을 섞어 배치를 짜는데(chunked prefill), 그렇게 prefill이 끼어든 스텝일 가능성이 높습니다.

:::info

**어디서 재느냐에 따라 숫자가 다릅니다**

`vllm bench serve`의 TTFT는 클라이언트가 요청을 보낸 직후부터 첫 응답 청크를 받을 때까지라 네트워크 왕복이 포함됩니다. 반면 서버의 Prometheus 지표 `vllm:time_to_first_token_seconds`는 토큰화 시작 시점부터 잽니다. 두 값이 다르게 나오는 것이 정상입니다.

:::

<br>

## SLO를 지킨 처리량만 세는 Goodput

처리량 숫자에는 함정이 있습니다. 배치를 극단적으로 키우면 tok/s는 계속 오르는데, 그 사이 개별 요청의 TTFT와 토큰 간격은 계속 나빠집니다. 초당 토큰을 아무리 뽑아도 사용자가 기다리다 떠날 수준이면 의미가 없습니다. 그래서 목표를 "처리량 최대화"가 아니라 "지연 조건을 지키는 한도 안에서 처리량 최대화"로 다시 씁니다. 그 지연 조건이 SLO(Service Level Objective)이고, SLO를 지킨 요청만 세는 처리량이 **goodput**입니다. prefill과 decode를 서로 다른 GPU로 분리하는 구조를 제안한 DistServe 논문이 이 용어를 LLM 서빙에 가져왔습니다.

SLO는 워크로드마다 다릅니다. DistServe가 실험에 쓴 기준을 보면 감이 잡힙니다.

| 워크로드 | TTFT SLO | TPOT SLO | 배경 |
|---|---|---|---|
| 챗봇 | 250ms | 100ms | 사람이 읽는 속도보다 빠르면 충분 |
| 코드 자동완성 | 125ms | 200ms | 타이핑을 끊지 않아야 해서 첫 반응이 가장 빡빡 |
| 문서 요약 | 15s | 150ms | 긴 입력이라 첫 토큰은 기다려주지만, 나오기 시작하면 빨라야 |

`vllm bench serve`는 goodput도 바로 계산해줍니다. SLO를 ms 단위의 키:값 쌍으로 넘기면 됩니다.

```bash
vllm bench serve ... --goodput ttft:250 tpot:100
```

지정한 조건을 **전부** 만족한 요청만 good으로 세고, 결과에 `Request goodput (req/s)` 줄이 추가됩니다. 동시성을 올려가며 스윕할 때 처리량은 계속 오르는데 goodput이 꺾이기 시작하는 지점이 보이면, 거기가 이 SLO에서 이 서버의 실질 용량입니다.

<br>

## 처리량과 지연시간은 왜 함께 못 가는가

트레이드오프의 뿌리는 decode의 병목입니다. decode는 토큰 하나를 만들 때마다 모델 가중치 전체를 HBM(GPU의 온보드 고대역폭 메모리)에서 읽어야 해서, 연산 속도가 아니라 메모리 읽기 속도에 묶이는 memory-bound 단계입니다. 그런데 요청이 1개든 64개든 가중치는 한 번만 읽으면 됩니다. 배치를 키우면 같은 메모리 읽기 한 번으로 토큰을 64개 만들게 되고, 이것이 배칭이 처리량을 올리는 원리입니다.

공짜가 아닌 이유는 스텝이 무거워지기 때문입니다. 배치가 커지면 스텝당 연산량이 늘고, 각 요청이 쌓아둔 KV Cache 읽기도 늘어납니다. KV Cache는 이전 토큰들의 attention Key, Value 값을 저장해 재계산을 피하는 공간이라 시퀀스가 길수록 커집니다. 그렇게 한 스텝의 시간이 조금씩 길어지는데, 그 스텝 시간이 곧 진행 중인 모든 요청의 토큰 간격입니다. 전체 tok/s는 오르지만 개별 사용자의 토큰은 더 띄엄띄엄 나옵니다. 글 첫머리의 모순이 바로 이것입니다.

동시성을 계속 올리면 곡선은 세 구간을 지납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 255" style="width: 100%; height: auto; max-width: 480px;" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, -apple-system, sans-serif" role="img" aria-label="가로축 동시성, 세로축 전체 처리량 곡선. 왼쪽 선형 구간에서는 동시성만큼 처리량이 오르고 지연은 거의 그대로이며, 가운데 knee 구간에서 지연이 본격적으로 상승하고, 오른쪽 포화 구간에서는 처리량이 정체된 채 큐잉으로 TTFT만 증가합니다.">
  <!-- 구간 배경 -->
  <rect x="175" y="40" width="135" height="160" fill="var(--bg-subtle, #f5f4f2)"/>
  <rect x="310" y="40" width="148" height="160" fill="var(--bg-muted, #eeecea)"/>
  <!-- 축 -->
  <path d="M60 32 V200 H458" stroke="var(--text-muted, #78716c)" stroke-width="1.5" fill="none"/>
  <text x="52" y="22" font-size="15" fill="var(--text, #1c1917)">전체 처리량</text>
  <text x="458" y="243" text-anchor="end" font-size="15" fill="var(--text, #1c1917)">동시성</text>
  <!-- 구간 경계 -->
  <path d="M175 40 V200 M310 40 V200" stroke="var(--border, #e7e5e4)" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>
  <!-- 처리량 곡선 -->
  <path d="M60 200 L175 122 C215 96 250 76 300 68 C350 60 400 57 448 56" stroke="var(--primary, #0d9488)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- knee 강조 -->
  <circle cx="175" cy="122" r="6" fill="var(--primary, #0d9488)"/>
  <path d="M180 128 L214 143" stroke="var(--primary, #0d9488)" stroke-width="1.5" fill="none"/>
  <text x="250" y="156" text-anchor="middle" font-size="13" fill="var(--primary, #0d9488)">knee: 지연이 본격 상승</text>
  <text x="250" y="174" text-anchor="middle" font-size="12" fill="var(--text-muted, #78716c)">SLO 한도는 이 부근</text>
  <!-- 선형 구간 설명 -->
  <text x="117" y="64" text-anchor="middle" font-size="13" fill="var(--text-muted, #78716c)">동시성만큼 증가</text>
  <text x="117" y="82" text-anchor="middle" font-size="13" fill="var(--text-muted, #78716c)">지연은 그대로</text>
  <!-- 포화 구간 설명 -->
  <text x="384" y="125" text-anchor="middle" font-size="12" fill="var(--text-muted, #78716c)">처리량 정체</text>
  <text x="384" y="142" text-anchor="middle" font-size="12" fill="var(--text-muted, #78716c)">큐잉으로 TTFT 증가</text>
  <!-- 구간 이름 -->
  <text x="117" y="220" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">선형 구간</text>
  <text x="242" y="220" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">knee 구간</text>
  <text x="384" y="220" text-anchor="middle" font-size="15" fill="var(--text, #1c1917)">포화 구간</text>
</svg>
</div>

배치에 자리가 남는 동안은 동시성을 올린 만큼 처리량이 오르고 지연은 거의 그대로입니다. GPU가 포화에 가까워지면 처리량 증가가 둔해지면서 지연이 본격적으로 오르기 시작합니다. 배치 상한(`max_num_seqs`)까지 차면 처리량은 멈추고, 이후 들어오는 요청은 큐에서 기다리므로 TTFT만 늘어납니다. 튜닝의 목표를 한 문장으로 줄이면, 이 곡선 위에서 SLO를 아직 지키는 가장 오른쪽 지점을 찾는 일입니다.

반대 방향의 이야기도 하나 있습니다. 배치가 작아 GPU 대역폭이 놀고 있을 때는 그 여유를 지연 단축에 쓸 수 있습니다. draft 모델이 여러 토큰을 미리 만들고 본 모델이 한 번에 검증하는 speculative decoding이 그 방법인데, 남는 대역폭을 쓰는 기법인 만큼 동시성이 높아 여유가 없는 서버에서는 이득이 줄어듭니다.

<br>

## 서빙의 두 천장, 대역폭과 용량

곡선이 어디서 멈추는지는 결국 하드웨어가 정합니다. 천장은 두 개이고 성격이 다릅니다. **대역폭 천장**은 토큰이 얼마나 빨리 나오는가의 상한이고, **용량 천장**은 요청을 몇 개까지 동시에 올려둘 수 있는가의 상한입니다.

대역폭 천장부터 계산해보겠습니다. decode 한 스텝은 가중치 전체를 한 번 읽어야 하므로, 요청 하나만 있을 때 토큰 생성 속도의 이론상 상한은 메모리 대역폭을 모델 크기로 나눈 값입니다. Llama-3.3-70B를 H100 4장에 TP=4로 올린 서버를 예로 들겠습니다. TP에서는 GPU마다 가중치를 1/4씩 나눠 들고 동시에 읽으므로, 대역폭도 4장을 합산해서 칩니다.

```text
Llama-3.3-70B BF16 가중치     = 70.6B × 2byte ≈ 141GB
H100 SXM 4장 합산 대역폭 (TP=4) = 4 × 3.35TB/s = 13.4TB/s

단일 요청 decode 상한 = 13,400GB/s ÷ 141GB ≈ 초당 95토큰
```

커널을 아무리 최적화해도 이 서버에서 요청 하나는 초당 95토큰을 넘지 못합니다. 배칭은 이 한 번의 읽기로 여러 요청의 토큰을 만들어 전체 처리량을 올리는 것이지, 요청 하나의 속도를 올리는 것이 아닙니다. 지연을 줄이는 손잡이가 무엇인지도 이 식에서 나옵니다. TP를 8로 늘리면 합산 대역폭이 두 배가 되어 상한도 두 배로 오르고, 양자화로 가중치가 절반이 되면 읽을 바이트가 절반이라 역시 상한이 두 배로 오릅니다. 물론 TP에서는 스텝마다 GPU들이 부분 결과를 합치는 all-reduce 통신이 끼므로, 실제 속도가 상한 그대로 늘지는 않습니다.

배치가 커지면 읽어야 하는 것이 가중치만이 아니게 됩니다. 스텝마다 배치에 있는 모든 요청의 KV Cache도 읽으므로, 스텝 시간은 대략 이렇게 움직입니다.

```text
스텝 시간 ≈ (가중치 크기 + 배치 전체의 KV 총량) ÷ 메모리 대역폭
```

배치가 작을 때는 가중치 항이 압도적이라 요청을 더 태워도 스텝 시간이 거의 안 변하고, 그래서 배칭이 공짜에 가깝습니다. 배치가 크고 컨텍스트가 길어질수록 KV 항이 자라나 스텝이 눈에 띄게 느려집니다. 앞 섹션 곡선의 knee가 생기는 이유가 이 식 안에 있습니다.

용량 천장은 KV Cache 풀의 크기입니다. Llama-3.3-70B의 토큰당 KV는 모델 config 값으로 계산됩니다.

```text
2(K,V) × 80 레이어 × 8 KV head × 128 head_dim × 2byte = 320KB/토큰
```

H100 80GB 4장에 TP=4로 올리면, 전체 320GB에 vLLM이 기본으로 예약하는 비율 0.92(`gpu_memory_utilization` 기본값)를 곱한 294GB가 예산입니다. 여기서 가중치 141GB와 vLLM이 시작할 때 재서 미리 빼두는 활성값, CUDA graph 몫을 제하면 대략 140GB대가 KV 풀로 남습니다. 320KB로 나누면 약 44만 토큰입니다. 요청마다 8K 컨텍스트를 쓰는 워크로드라면 50개 남짓한 요청이 이 서버가 동시에 올려둘 수 있는 한계입니다.

어느 천장에 먼저 닿는지는 워크로드가 정합니다. 컨텍스트가 긴 워크로드는 요청 몇 개만으로 KV 풀이 차서 용량 천장에 먼저 닿습니다. 이때는 배치가 작아 대역폭에 여유가 남아 있는데도 동시성을 못 올립니다. 반대로 짧은 컨텍스트에 동시 요청이 많은 워크로드는 KV 풀이 차기 전에 스텝 시간이 먼저 SLO를 넘어섭니다. 대역폭 천장에 먼저 닿는 쪽입니다. 증상이 다르니 처방도 다릅니다. 용량이 병목이면 KV 풀을 키우는 손잡이(`gpu_memory_utilization` 상향, `max_model_len` 하향, KV Cache FP8, TP 확대)가 답이고, 대역폭이 병목이면 양자화, 더 빠른 GPU, 아니면 인스턴스 복제가 답입니다.

<br>

## MoE는 대역폭 벽에 더 일찍 닿는다

지금까지의 계산은 dense 모델 기준입니다. MoE(Mixture of Experts) 모델은 두 천장과 맺는 관계가 달라집니다.

MoE는 FFN 레이어를 여러 expert로 쪼개두고 토큰마다 라우터가 일부 expert만 골라 통과시키는 구조입니다. 그래서 파라미터 수가 두 종류로 나뉩니다.

| 모델 | 전체 파라미터 | 토큰당 활성 파라미터 |
|---|---|---|
| DeepSeek-V3 | 671B | 37B |
| Qwen3-235B-A22B | 235B | 22B |
| Gemma 4 26B-A4B | 25.2B | 3.8B |

연산은 활성 파라미터만큼만 하므로 MoE의 연산 비용은 작은 dense 모델급입니다. 문제는 메모리 쪽 두 천장이 전체 파라미터를 따라간다는 점입니다.

용량은 처음부터 전체 크기입니다. 어떤 토큰이 어떤 expert를 고를지 미리 알 수 없으니 expert 전부가 VRAM에 올라가 있어야 합니다. DeepSeek-V3는 FP8 체크포인트로도 가중치가 671GB를 넘어 H100 80GB 8장 노드(640GB)에조차 들어가지 않고, Gemma 4 26B-A4B도 연산은 3.8B지만 올릴 때는 25.2B 모델입니다.

대역폭 쪽은 배치 크기에 따라 양상이 달라집니다. 요청 하나만 decode할 때는 그 토큰이 고른 expert의 가중치만 읽으면 되니, 활성 3.8B짜리 모델은 작은 dense처럼 가볍게 돕니다. 그런데 배치가 커지면 토큰마다 다른 expert를 고르므로, 배치 안의 토큰을 전부 합치면 결국 거의 모든 expert가 호출됩니다. 스텝당 읽는 가중치가 활성분이 아니라 전체 크기에 수렴하는 것입니다. 배칭의 핵심인 "가중치 읽기 한 번을 여러 토큰이 나눠 갖는" 효과가 expert 수만큼 쪼개져 약해지고, 그래서 같은 배치 크기라도 MoE는 dense보다 대역폭 천장에 일찍 닿습니다. decode가 memory-bound인 것은 dense와 MoE가 같습니다. MoE는 그 벽에 도달하는 배치 크기가 앞당겨질 뿐입니다.

이 특성이 MoE 서빙의 병렬화 선택으로 이어집니다. vLLM은 `--enable-expert-parallel`로 Expert Parallelism을 켭니다. expert들을 GPU 여러 장에 나눠 올리고, 스텝마다 각 토큰을 담당 expert가 있는 GPU로 보냈다가(all-to-all 통신) 결과를 되돌려받는 방식입니다. GPU마다 expert 일부만 들면 되니 용량 문제가 풀리고, 각 GPU가 스텝마다 읽는 가중치도 자기 몫의 expert뿐이라 대역폭 부담도 나뉩니다. EP 크기를 정하는 별도 인자는 없고, TP 크기에 DP(Data Parallelism, 모델 전체를 복제해 트래픽을 나누는 방식) 크기를 곱한 값이 곧 EP 크기가 됩니다.

한 가지 짚어두면, KV Cache는 MoE라고 달라지지 않습니다. MoE가 바꾸는 것은 FFN이고 어텐션은 그대로라, 토큰당 KV는 dense와 같은 공식으로 계산하면 됩니다.

<br>

## 지표를 근거로 인자를 움직이는 법

이제 지표와 천장을 손에 들고 튜닝 절차를 정리합니다. vLLM의 auto_tune 스크립트와 클라우드 벤더 가이드들이 공통으로 쓰는 순서는 세 단계입니다.

1. SLO를 먼저 고정합니다 (예: P99 TTFT 500ms, P99 TPOT 50ms)
2. 동시성을 바꿔가며 `vllm bench serve`로 스윕합니다
3. SLO를 지키는 범위에서 처리량이 최대인 지점을 고릅니다. 그 처리량이 목표 트래픽에 모자라면 인자를 조정하거나 인스턴스를 늘립니다

```bash
for c in 8 16 32 64 128; do
  vllm bench serve \
    --model google/gemma-4-31B-it \
    --dataset-name random \
    --random-input-len 1024 --random-output-len 256 \
    --num-prompts $((c * 5)) --max-concurrency $c \
    --goodput ttft:500 tpot:50
done
```

`--num-prompts`는 공식 레시피가 권장하는 대로 동시성의 5배 이상으로 잡습니다. 짧게 돌리면 워밍업 구간이 결과를 흐립니다. 부하를 거는 방식은 두 가지인데 용도가 다릅니다. `--max-concurrency`는 동시 요청 수를 고정하는 방식이라 위처럼 용량 곡선을 그릴 때 쓰고, `--request-rate`는 초당 도착률을 고정하는 방식이라 예상 트래픽에서 SLO가 지켜지는지 최종 확인할 때 씁니다. 도착률을 고정하면 서버가 밀리기 시작할 때 대기 요청이 스스로 불어나, 실제 서비스에서 벌어지는 붕괴 양상까지 재현됩니다.

스윕 결과가 SLO에 어긋날 때, 어느 지표가 나쁜지에 따라 움직일 인자가 다릅니다.

- **ITL이 나쁠 때**: 스텝이 무겁다는 신호입니다. `max_num_batched_tokens`를 낮추면(2048 수준) 한 스텝에 끼어드는 prefill 양이 줄어 decode 간격이 고르게 유지됩니다. `max_num_seqs`를 낮춰 배치 자체를 줄이는 것도 같은 방향입니다. 대가는 처리량입니다.
- **TTFT가 나쁠 때**: prefill이 밀린다는 신호입니다. `max_num_batched_tokens`를 올리면(8192 이상) prefill이 한 번에 더 많이 소화됩니다. 동시성 초과로 큐에서 기다리는 것이 원인이라면 인자가 아니라 용량의 문제라, 인스턴스를 늘리는 쪽이 답입니다.
- **처리량이 모자랄 때**: 공식 문서는 큰 GPU에서 `max_num_batched_tokens`를 8192보다 크게 잡으라고 권장합니다. TP를 줄이고 인스턴스를 복제하는 선택지도 함께 봅니다.
- **동시성이 목표에 못 미칠 때**: 용량 천장 신호입니다. `gpu_memory_utilization`을 올리고, `max_model_len`을 워크로드에 맞게 내리고, 그래도 모자라면 KV Cache FP8이나 TP 확대로 풀을 키웁니다.
- **MoE 모델에서 처리량이 일찍 꺾일 때**: dense보다 대역폭 천장에 일찍 닿는 구조 특성입니다. `--enable-expert-parallel`로 expert를 GPU들에 나눠 스텝당 가중치 읽기를 분산합니다.

TP와 배치 크기의 큰 그림은 공식 레시피의 세 프리셋을 기준점으로 잡으면 됩니다. 처리량이 목표면 모델이 들어가는 최소 TP에 배치를 최대로, 지연이 목표면 TP 4에서 8에 배치를 작게, 균형이 목표면 TP 2에 배치 128 수준입니다.

서버 쪽에서 병목을 확인하는 창은 엔진 로그입니다. 운영 중 주기적으로 찍히는 이 줄에 신호가 다 들어 있습니다.

```text
Avg prompt throughput: 3021.4 tokens/s, Avg generation throughput: 512.7 tokens/s, Running: 64 reqs, Waiting: 12 reqs, Preemptions: 3, GPU KV cache usage: 97.2%, Prefix cache hit rate: 41.3%
```

Waiting이 계속 쌓이면 배치 상한이나 용량이 트래픽에 밀리는 중입니다. Preemptions가 0이 아니면 KV 풀이 모자라 진행 중인 요청을 내리고 다시 계산했다는 뜻이라, 용량 천장에 닿았다는 가장 직접적인 신호입니다. 같은 값들은 `/metrics` Prometheus 엔드포인트로도 노출됩니다.

스윕이 손에 익으면 자동화 도구에 맡길 수 있습니다. vLLM 저장소의 `auto_tune.sh` 스크립트는 "P99 E2E 지연 X ms 이하"라는 제약을 걸고 `max_num_seqs` × `max_num_batched_tokens` 조합을 돌면서 제약 안에서 처리량이 최대인 조합을 찾아주고, `vllm bench sweep`은 서버 인자와 벤치마크 인자의 조합 스윕과 결과 플롯까지 지원합니다. 수동 스윕으로 곡선의 감을 잡은 뒤 마지막 조합 탐색을 맡기기 좋은 도구들입니다.

<br>

## 마치며

이 글로 시리즈를 마칩니다. prefill과 decode의 비대칭에서 출발해 KV Cache라는 런타임 상태, 그것을 관리하는 PagedAttention과 스케줄링, 자원을 아끼는 양자화와 speculative decoding을 지나 엔진 인자와 성능 지표까지 왔습니다. 관통하는 생각은 하나였습니다. 엔진이 어떻게 동작하는지 알면 설정값은 외우는 목록이 아니라 유도하는 결론이 됩니다. 여러분의 서버에서도 지표를 먼저 재고, 어느 천장에 닿았는지 확인하고, 그에 맞는 손잡이를 움직이시길 바랍니다.

<br>

## 함께 보면 좋은 글

- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [KV Cache가 LLM 서빙을 바꾸는 방식](/llm/kv-cache/)
- [Continuous Batching과 Chunked Prefill 완전 이해](/llm/continuous-batching/)
- [Speculative Decoding으로 LLM 추론 속도 높이기](/llm/speculative-decoding/)
- [vLLM 실전 서빙 가이드](/llm/vllm-serving-in-practice/)

<br>

## 참고자료

- [vLLM Benchmark CLI](https://docs.vllm.ai/en/latest/benchmarking/cli.html)
- [vLLM Optimization and Tuning](https://docs.vllm.ai/en/latest/configuration/optimization.html)
- [DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving](https://arxiv.org/abs/2401.09670)
- [Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve](https://arxiv.org/abs/2403.02310)
- [NVIDIA LLM Inference Benchmarking: Fundamental Concepts](https://developer.nvidia.com/blog/llm-benchmarking-fundamental-concepts/)
- [LLM inference speed of light](https://zeux.io/2024/03/15/llm-inference-sol/)
- [How to Scale Your Model: All About Inference](https://jax-ml.github.io/scaling-book/inference/)
- [Lynx: Enabling Efficient MoE Inference through Dynamic Batch-Aware Expert Selection](https://arxiv.org/abs/2411.08982)
- [DeepSeek-V3 Technical Report](https://arxiv.org/abs/2412.19437)
- [vLLM Recipes: Llama 3.3 70B](https://github.com/vllm-project/recipes/blob/main/Llama/Llama3.3-70B.md)
