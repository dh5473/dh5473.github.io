---
date: '2026-07-18'
title: '서빙을 위한 양자화 가이드 FP8, AWQ, GPTQ'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 6
tags: ['LLM Serving', 'Quantization', 'FP8', 'AWQ', 'GPTQ']
summary: '양자화가 서빙 성능을 올리는 경로를 메모리, 대역폭, 연산 정밀도 셋으로 나눠서 세우고, GPTQ와 AWQ, FP8이 각각 어느 경로에 효과가 있는지 원리부터 살펴봅니다. 배치 크기와 GPU 세대에 따라 무엇을 골라야 하는지, KV Cache 양자화와 QAT까지 정리합니다.'
thumbnail: './thumbnail.png'
---

서빙할 모델을 받으러 Hugging Face에 가면 같은 모델이 여러 벌 올라와 있습니다. 이름 뒤에 FP8이 붙은 것, AWQ가 붙은 것, GPTQ가 붙은 것. 전부 "양자화된 모델"이라는 설명이 달려 있는데, 무엇을 받아야 할까요? 셋 다 모델을 가볍게 만든다는 건 알겠는데, 그럼 셋은 서로 뭐가 다를까요?

[5편](/llm/prefix-caching-radix-attention/)까지는 이미 있는 계산과 메모리를 아껴 쓰는 이야기였습니다. prefix caching은 이미 한 계산을 다시 하지 않는 기술이었지만, 캐시에 담기는 KV의 크기와 매 스텝 GPU가 읽는 가중치의 크기는 그대로였습니다. 양자화는 그 크기 자체를 줄입니다. 모델을 이루는 숫자들을 16비트 대신 8비트, 4비트로 표현하는 것입니다.

이 글에서는 양자화 기법들을 나열하는 대신, "무엇을 줄이면 무엇이 빨라지는가"라는 지도를 먼저 그리고 그 위에 FP8, AWQ, GPTQ를 올려놓습니다. vLLM은 v0.25.1을 기준으로 씁니다.

<br>

## 무엇을 줄이느냐가 먼저다

양자화 이름에 붙는 W와 A부터 풀겠습니다. W는 가중치(weight), A는 활성값(activation), 뒤의 숫자는 비트 수입니다. AWQ와 GPTQ는 가중치만 4비트로 줄이고 계산은 16비트로 하는 **W4A16**이고, FP8은 보통 가중치와 활성값을 모두 8비트로 줄이는 **W8A8**로 씁니다.

이 구분이 중요한 이유는, 양자화가 건드릴 수 있는 자원이 하나가 아니기 때문입니다.

```
양자화가 줄일 수 있는 세 가지

  ① 가중치가 차지하는 메모리    →  남는 GPU 메모리가 KV Cache 몫이 된다
  ② 매 스텝 가중치를 읽는 양    →  memory-bound한 decode가 빨라진다
  ③ 행렬곱의 연산 정밀도        →  저정밀 텐서코어로 연산 자체가 빨라진다
```

①은 [2편](/llm/kv-cache/)과 [3편](/llm/paged-attention/)에서 본 구도 그대로입니다. 가중치를 올리고 남은 메모리가 KV Cache 예산이고, 이 예산이 동시에 올려둘 수 있는 요청 수를 정합니다. 가중치가 절반으로 줄면 줄어든 만큼이 거의 그대로 KV Cache 예산에 더해집니다.

②는 [1편](/llm/llm-inference-process/)의 프레임입니다. decode는 토큰 하나를 뽑을 때마다 가중치 전체를 읽는 memory-bound 단계라, 읽을 데이터가 1/4이 되면 그 자체로 속도가 됩니다.

③은 하드웨어 이야기입니다. GPU 텐서코어는 FP8이나 INT8 같은 낮은 정밀도에서 16비트보다 높은 처리량을 냅니다. H100의 FP8 행렬곱 처리량은 16비트의 2배입니다. 다만 이 경로를 타려면 가중치만이 아니라 **활성값까지** 낮은 비트여야 합니다. 행렬곱의 두 피연산자가 모두 같은 저정밀 형식이어야 하기 때문입니다.

W4A16은 ①과 ②를 얻고 ③은 포기합니다. W8A8은 셋 다 얻는 대신 ①과 ②의 배율이 W4A16의 절반입니다(압축이 4배가 아니라 2배). 이 글의 나머지는 사실상 이 트레이드오프를 풀어가는 과정입니다.

<br>

## 가중치만 줄이는 W4A16, GPTQ와 AWQ

먼저 숫자로 크기를 보겠습니다.

```
Gemma 3 27B 기준

  bf16 가중치     27B × 2바이트  ≈ 54GB
  int4 가중치     약 14.1GB        (Google 공식 수치)

  decode 한 스텝 = 가중치 전체 읽기
  스텝마다 읽는 양이 약 1/4로 줄어든다
```

80GB GPU에 올린다고 하면 bf16으로는 가중치를 빼고 26GB가 남는데, 4비트로 줄이면 66GB가 남습니다. 활성값 버퍼 같은 고정 오버헤드를 빼고 남는 것이 전부 KV 예산이니, 저배치에서는 decode 지연이 직접 줄고 남은 메모리로 배치를 더 태울 수도 있습니다.

문제는 품질입니다. 16비트 숫자를 4비트로 내리면 표현할 수 있는 값이 16개뿐이라, 가장 가까운 값으로 반올림만 해서는(RTN, round-to-nearest) 모델이 눈에 띄게 나빠집니다. GPTQ와 AWQ는 이 손실을 줄이는 서로 다른 답입니다.

**GPTQ**는 "오차를 흡수시키는" 접근입니다. 목표를 가중치 값 보존이 아니라 **레이어 출력 보존**으로 잡습니다. calibration 데이터를 흘려 각 레이어의 입력 통계를 먼저 모읍니다. 그다음 가중치를 한 열씩 양자화하면서, 그 열에서 생긴 출력 오차를 상쇄하는 방향으로 아직 양자화하지 않은 나머지 가중치들을 갱신합니다(갱신량은 입력 통계의 2차 정보인 Hessian으로 계산합니다). 재학습이나 역전파 없이 한 번 훑는 것으로 끝나서, 175B 모델도 GPU 몇 시간이면 양자화됩니다.

**AWQ**는 "중요한 것을 지키는" 접근입니다. 출발점은 모든 가중치가 똑같이 중요하지 않다는 관찰입니다. 흥미로운 건 중요한 가중치를 고르는 기준인데, 가중치 자신의 크기가 아니라 **그 가중치에 곱해지는 활성값의 크기**로 골라야 품질이 지켜집니다. activation-aware라는 이름이 여기서 나왔습니다. 큰 활성값과 만나는 1% 남짓의 채널을 16비트로 남겨두면 좋겠지만 혼합 정밀도는 하드웨어에서 비효율적이라, 대신 그 채널의 가중치를 미리 키워두고 활성값 쪽을 줄이는 스케일링으로 같은 보호 효과를 냅니다. 오차 흡수 같은 재구성 과정이 없어 calibration 데이터도 GPTQ보다 훨씬 적게 필요합니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 GPTQ vs AWQ, 뭐가 더 낫나</strong><br>
  1차 소스끼리 결론이 갈립니다. AWQ 논문은 GPTQ가 calibration 데이터에 과적합될 수 있다고 지적하고, Red Hat(구 Neural Magic)의 대규모 평가는 양자화 범위의 상한을 조정하는 clipping까지 튜닝한 GPTQ가 AWQ보다 낫다고 보고합니다. 실무 관점의 결론은 "둘 다 정확도 회복률 96% 이상이고, 쓰려는 모델로 직접 평가해보기 전까지는 우열을 단정할 수 없다" 정도입니다.
</div>

한 가지 분명히 해둘 것이 있습니다. W4A16은 저장만 4비트고 **연산은 16비트**입니다. 행렬곱 직전에 가중치를 16비트로 복원해서 계산하므로, 연산 자체는 빨라지지 않습니다. 그래서 W4A16의 이득은 전부 ①메모리와 ②읽기량에서 나오고, 이 사실이 W8A8과의 승부 구도를 정합니다.

<br>

## 연산까지 빨라지는 W8A8, FP8

FP8은 이름 그대로 8비트 부동소수점입니다. 같은 8비트라도 정수(INT8)와는 값을 배치하는 방식이 다릅니다.

```
1바이트에 숫자를 담는 방법

  INT8    S IIIIIII      정수, 값 사이 간격이 균일          최대 ±127
  E4M3    S EEEE MMM     부동소수점, 0 근처가 촘촘          최대 ±448
  E5M2    S EEEEE MM     지수 비트를 늘려 범위를 넓힌 형식   최대 ±57344
```

LLM의 가중치와 활성값은 대부분 0 근처에 몰려 있고 가끔 큰 outlier가 섞여 있는 분포입니다. 균일 간격인 INT8은 outlier에 맞춰 간격을 잡으면 0 근처가 뭉개지는데, 부동소수점인 FP8은 0 근처를 촘촘하게 쓰면서 큰 값도 담습니다. FP8 형식을 제안한 NVIDIA와 Arm, Intel의 공동 논문은 같은 8비트 사후 양자화에서 INT8은 정확도가 크게 무너지고 E4M3는 유지된다는 것을 보였습니다. 추론에는 범위보다 정밀도가 중요해서 E4M3를 쓰고, E5M2는 값 범위가 널뛰는 학습 시 그래디언트용입니다.

FP8이 W4A16과 갈라지는 지점이 ③입니다. 활성값까지 8비트라 행렬곱이 FP8 텐서코어에서 그대로 돌고, prefill처럼 compute-bound한 구간이 실제로 빨라집니다. vLLM 공식 문서 기준으로 메모리 사용량은 절반이 되고 처리량은 최대 1.6배까지 개선됩니다.

vLLM에서 쓰는 방법은 두 갈래입니다. 사전 양자화된 FP8 체크포인트는 별도 플래그 없이 그냥 로드하면 됩니다(체크포인트 설정에서 양자화 방식을 자동 인식합니다). FP8 체크포인트가 없는 모델은 `--quantization fp8`을 주면 서빙 시작 시점에 즉석에서 양자화합니다. 준비물이 없어 간편하지만, 스케일을 텐서 하나에 값 하나로 뭉뚱그려 잡는 데다 활성값 스케일을 매 스텝 새로 계산해서 지연 개선 폭은 제한적입니다. 제대로 쓰려면 vLLM 프로젝트의 양자화 도구인 llm-compressor로 가중치를 채널 단위 스케일로 미리 양자화해둔 체크포인트를 만드는 쪽이 권장 경로입니다.

INT8 W8A8도 같은 자리에 있는 선택지입니다. FP8 텐서코어가 없는 GPU에서 활성값까지 양자화하려면 이 길뿐인데, 앞서 본 분포 문제 때문에 활성값을 그냥 INT8로 내리면 품질이 무너집니다. 그래서 양자화하기 어려운 활성값의 스케일을 미리 가중치 쪽으로 옮겨두는 SmoothQuant 계열 보정을 거쳐 만듭니다.

<br>

## 저배치는 W4A16, 고배치는 W8A8

이제 지도를 완성할 수 있습니다. W4A16과 W8A8 중 무엇이 빠른가에는 고정된 답이 없고, **배치 크기가 정합니다**.

배치가 작을 때 서빙 시간의 대부분은 memory-bound한 decode에 쓰입니다. 여기서는 매 스텝 읽는 가중치가 1/4인 W4A16이 이깁니다. 배치가 커지면 [4편](/llm/continuous-batching/)에서 본 continuous batching이 여러 요청의 연산을 한 행렬곱으로 묶으면서 GPU가 점점 compute-bound로 넘어갑니다. 읽어온 가중치를 여러 요청이 나눠 쓰니 읽기량의 이점은 희석되고, 저정밀 텐서코어로 연산 자체가 빠른 W8A8이 역전합니다.

Red Hat이 Llama 3.1 계열로 50만 회 이상 평가를 돌린 연구가 이 구도를 정량적으로 확인해줍니다. 요청을 하나씩 처리하는 동기 시나리오에서는 W4A16이 가장 효율적이었고(단일 스트림 평균 2.4배), 고배치 비동기 서빙에서는 대체로 W8A8이 최고 처리량을 냈습니다(평균 1.8배). 다만 비동기에서도 W4A16이 이기는 시나리오가 있고, 두 구간이 갈리는 경계 배치 크기도 모델과 하드웨어마다 달라서 보편적인 숫자는 없습니다. 정확도는 학술 벤치마크 평균으로 99% 안팎을 회복했고 가장 어려운 평가에서도 하한이 96%였는데, 특히 FP8은 모든 규모에서 사실상 무손실이었습니다.

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background: #f8f9fa;">
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">항목</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">W4A16 (AWQ, GPTQ)</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">W8A8 (FP8, INT8)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>가중치 압축</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">약 3.5배 (4비트 + 그룹 스케일 오버헤드)</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">약 2배</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>decode 가중치 읽기</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">약 1/4 (비트 수 기준)</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">약 1/2</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>저정밀 텐서코어 연산</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">없음 (16비트로 복원 후 연산)</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">있음</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>유리한 구간</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">저배치, 지연 민감</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">고배치, 처리량 중심</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>정확도 회복률</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">평균 99% 안팎</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">평균 99% 안팎, FP8은 사실상 무손실</td>
    </tr>
  </tbody>
</table>

정리하면, 혼자 쓰는 GPU에서 응답 속도가 아쉬울 때는 W4A16, 서비스 트래픽을 받아내는 서버라면 W8A8이 기본 선택입니다. 이 시리즈의 관심사인 서빙 처리량 관점에서는 FP8이 첫 번째 후보가 됩니다.

<br>

## GPU 세대가 선택지를 정한다

배치 크기 다음의 변수는 GPU입니다. ③연산 이득은 텐서코어가 해당 정밀도를 지원해야 존재하기 때문에, GPU 세대가 후보를 먼저 걸러냅니다.

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background: #f8f9fa;">
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">세대</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">대표 GPU</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">INT8</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">FP8</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">현실적인 선택</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">Ampere</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">A100</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">없음</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">AWQ, GPTQ, INT8 W8A8</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">Ada Lovelace</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">L4, L40S</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">FP8</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">Hopper</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">H100, H200</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">FP8</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">Blackwell</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">B200</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">vLLM 미지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">지원</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">FP8, 그리고 FP4</td>
    </tr>
  </tbody>
</table>

핵심 분기는 Ampere입니다. A100에는 FP8 텐서코어가 없습니다. 그래서 Ampere에서 활성값까지 양자화하려면 INT8 W8A8이 유일한 길이고, 그게 번거로우면 W4A16(AWQ, GPTQ)이 자연스러운 선택입니다. 한 줄로 줄이면 "Ampere까지는 AWQ와 GPTQ 그리고 INT8, Ada와 Hopper부터는 FP8"입니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 주의</strong><br>
  Ampere에서 FP8 체크포인트를 띄우면 에러 없이 그대로 돌아갑니다. 하지만 이때 vLLM은 가중치만 FP8로 두고 연산은 16비트로 하는 weight-only 모드(W8A16)로 폴백합니다. 메모리 절감은 그대로 얻지만 FP8 연산의 처리량 이득은 없다는 뜻입니다. 반대로 Blackwell에서는 INT8 W8A8이 지원되지 않아 FP8로 가야 합니다. "돌아간다"와 "의도한 이득을 얻는다"는 다른 문제이니, 양자화 모델을 고를 때는 GPU 세대를 먼저 확인해야 합니다.
</div>

Blackwell 세대부터는 4비트 부동소수점(NVFP4)이 텐서코어에 들어왔습니다. W4A16의 압축률과 W8A8의 연산 이득을 한 번에 노리는 방향인데, 아직 하드웨어와 생태계가 최신 세대에 국한되어 있어 이 글에서는 존재만 짚어둡니다.

<br>

## KV Cache도 FP8로 줄인다

지금까지는 가중치 이야기였는데, 양자화할 수 있는 대상이 하나 더 있습니다. 2편에서 세운 구도를 떠올려보면, 서빙 중 GPU 메모리의 나머지 큰 축은 KV Cache입니다. vLLM에서 `--kv-cache-dtype fp8`을 주면 KV를 16비트 대신 FP8(E4M3)로 저장합니다.

1차 효과는 메모리입니다. 같은 KV 예산에 두 배의 토큰이 들어가므로, 동시에 올려둘 수 있는 요청 수나 감당 가능한 컨텍스트 길이가 두 배로 늘어납니다. 3편의 블록으로 말하면 블록 하나에 같은 16토큰을 절반 크기로 담는 것입니다.

어텐션 연산까지 빨라지는지는 백엔드에 달려 있습니다. FlashAttention 3 백엔드에서는 쿼리까지 FP8로 양자화해 어텐션 자체를 저정밀 도메인에서 계산하지만, 그 외 백엔드에서는 FP8이 저장 형식일 뿐이고 커널 안에서 복원해 16비트로 계산합니다. 그러니 KV Cache 양자화는 "어텐션이 빨라지는 기능"이 아니라 "KV 예산이 두 배가 되는 기능"으로 이해하는 것이 안전합니다.

품질 쪽에서 신경 쓸 것은 스케일입니다. E4M3는 표현 범위가 좁아 값에 맞는 스케일이 필요한데, 기본값은 스케일 1.0이라 분포가 큰 모델에서는 outlier가 잘려나갈 수 있습니다. llm-compressor로 calibration 데이터를 흘려 K와 V의 스케일을 체크포인트에 구워두는 것이 좋습니다. 참고로 sliding window 레이어의 KV는 양자화에 상대적으로 민감하다고 알려져 있어, v0.25.1 기준으로 특정 레이어를 KV 양자화에서 제외하는 옵션(`--kv-cache-dtype-skip-layers`)도 있습니다.

<br>

## 아예 낮은 정밀도로 훈련하는 QAT

지금까지 본 방법은 전부 **PTQ**(post-training quantization)입니다. 다 학습된 모델을 나중에 줄이는 방식이라, 아무리 잘해도 모델은 16비트 세상에서 배운 그대로이고 양자화는 사후에 얹힌 근사입니다.

**QAT**(quantization-aware training)는 순서를 뒤집습니다. 학습 과정의 forward 연산에서 양자화를 시뮬레이션해서, 모델이 낮은 정밀도로 표현될 것을 아는 상태로 가중치를 배우게 합니다. 품질은 PTQ보다 잘 지켜지지만 학습 인프라와 데이터가 필요하므로, 사용자가 하는 일이 아니라 **모델 제작자가 릴리스하는 형태**로 만나게 됩니다.

Gemma가 대표적인 예입니다. Google은 Gemma 3에서 bf16 체크포인트의 출력 분포를 목표로 5,000스텝 남짓 추가 학습하는 증류 방식 QAT로 int4 체크포인트를 만들었고, 양자화로 인한 perplexity 상승(품질 저하)을 일반 PTQ 대비 54% 줄였다고 밝혔습니다(llama.cpp의 Q4_0 형식 기준 자체 측정). 앞에서 크기 예시로 든 27B의 int4 가중치 14.1GB가 바로 이 QAT 체크포인트입니다. Gemma 4에서는 여기서 더 나아가 vLLM이 바로 읽는 compressed-tensors 형식의 W4A16 QAT 체크포인트를 공식 배포해서, 받아서 `vllm serve`에 넘기면 끝입니다.

재미있는 것은 예외 쪽입니다. Gemma 4 라인업 중 여러 expert 가운데 일부만 골라 쓰는 MoE(mixture-of-experts) 모델인 26B A4B에는 W4A16 QAT가 없는데, vLLM 공식 레시피가 이유를 밝혀두었습니다. expert 하나하나의 행렬이 작아서(내부 차원 704) 4비트 양자화의 품질 손실이 과도하다는 것입니다. 행렬이 작을수록 양자화 오차를 흡수할 파라미터와 스케일 그룹의 수가 적어 오차가 출력에 그대로 드러나니, 몇 비트까지 안전한가는 모델 크기가 아니라 **행렬의 모양이 정하는** 문제입니다. 그 대안으로 레시피는 26B A4B에 8비트 weight-only 양자화를 권합니다.

방향 자체는 업계 전반의 흐름이기도 합니다. DeepSeek-V3는 아예 FP8로 학습해서 FP8 가중치가 원본이고, OpenAI의 gpt-oss는 MoE 가중치를 4비트(MXFP4)로 배포합니다. "16비트 원본을 받아서 직접 줄이는" 시대에서 "낮은 정밀도 체크포인트가 원본인" 시대로 넘어가는 중입니다.

<br>

## 마치며

양자화 지도를 한 장으로 접으면 이렇습니다. 무엇을 줄이느냐에 따라 효과가 다릅니다. 가중치 메모리를 줄이면 KV 예산이 늘고, 가중치 읽기를 줄이면 decode가 빨라지고, 활성값까지 줄여야 연산이 빨라집니다. W4A16(AWQ, GPTQ)은 앞의 둘을 크게 얻는 저배치의 답이고, W8A8(FP8, INT8)은 셋을 고르게 얻는 고배치 서빙의 답입니다. GPU 세대가 후보를 거르고(Ampere는 FP8 연산 불가), KV Cache는 FP8로 저장 공간을 한 번 더 벌 수 있으며, 품질이 아쉬우면 제작자가 내놓은 QAT 체크포인트를 찾아보면 됩니다.

그런데 양자화가 줄인 것은 한 스텝에 읽는 바이트입니다. decode가 토큰 하나마다 가중치 전체를 읽어야 한다는 구조 자체는 그대로 남아 있습니다. 다음 글에서는 이 구조를 건드리는 speculative decoding을 살펴봅니다. 작은 모델이 토큰 여러 개를 미리 그려놓으면 큰 모델이 한 번의 읽기로 검증하는, 읽는 횟수 자체를 줄이는 기법입니다.

<br>

## 참고자료

- [Quantization (vLLM Docs)](https://docs.vllm.ai/en/latest/features/quantization/)
- [GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers (arXiv 2210.17323)](https://arxiv.org/abs/2210.17323)
- [AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration (arXiv 2306.00978)](https://arxiv.org/abs/2306.00978)
- [FP8 Formats for Deep Learning (arXiv 2209.05433)](https://arxiv.org/abs/2209.05433)
- ["Give Me BF16 or Give Me Death"? Accuracy-Performance Trade-Offs in LLM Quantization (arXiv 2411.02355)](https://arxiv.org/abs/2411.02355)
- [Gemma 3 QAT Models: Bringing state-of-the-Art AI to consumer GPUs (Google Developers Blog)](https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/)
- [vLLM Gemma 4 Recipe (vllm-project/recipes)](https://github.com/vllm-project/recipes/blob/main/Google/Gemma4.md)
