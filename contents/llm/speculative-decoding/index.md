---
date: '2026-07-21'
title: 'Speculative Decoding으로 LLM 추론 속도 높이기'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 7
tags: ['LLM Serving', 'Speculative Decoding', 'EAGLE', 'MTP', 'vLLM']
summary: '작은 모델이 미리 그려놓은 토큰들을 큰 모델이 forward 한 번으로 검증하는 speculative decoding의 원리를 살펴봅니다. rejection sampling이 품질을 지키는 수학, draft를 구하는 네 가지 방법(draft 모델, n-gram, EAGLE, MTP), 배치 크기에 따라 이득이 달라지는 이유를 vLLM 설정 방법과 함께 정리합니다.'
thumbnail: './thumbnail.png'
---

[6편](/llm/llm-quantization-serving/)에서 양자화로 decode가 매 스텝 읽는 바이트를 줄였습니다. 그런데 줄어든 것은 한 번에 읽는 양이지 읽는 횟수가 아닙니다. 토큰 하나를 뽑을 때마다 가중치 전체를 한 번 읽는 구조는 4비트로 줄여도 그대로 남아 있습니다.

여기서 [1편](/llm/llm-inference-process/)의 장면 하나를 다시 떠올려 보겠습니다. prefill은 프롬프트 수천 토큰을 가중치 읽기 한 번으로 처리했습니다. Transformer는 이미 주어진 토큰들을 병렬로 계산할 수 있기 때문입니다. decode가 한 개씩 갈 수밖에 없는 이유는 계산 능력이 모자라서가 아니라, 다음 토큰이 무엇인지 이전 토큰이 정해지기 전까지 알 수 없어서입니다. GPU 입장에서는 이상한 상황입니다. 수천 토큰을 동시에 처리할 능력이 있는데, 다음 토큰을 모른다는 이유로 한 번에 하나씩만 일합니다.

**Speculative decoding**은 정확히 이 지점을 파고듭니다. 다음 토큰을 모른다면, 싸게 추측해서 미리 갖다 놓으면 됩니다. 작은 모델이 토큰 여러 개를 그려놓고, 큰 모델은 그것을 prefill처럼 병렬로 검증합니다. 이 글에서는 이 기법이 품질을 잃지 않는 이유와 draft를 구하는 방법들, 그리고 언제 켜야 이득인지를 살펴봅니다. vLLM은 v0.25.1 기준입니다.

<br>

## 미리 그려놓고 한 번에 검증한다

한 iteration은 이렇게 돌아갑니다. **draft** 역할의 작은 모델이 토큰 γ개를 평소처럼 자기회귀로 생성합니다. 작은 모델이라 γ번을 돌아도 큰 모델 한 번보다 쌉니다. 그다음 **target**인 큰 모델이 forward 한 번으로 γ개 위치의 확률분포를 전부 계산합니다. 프롬프트를 병렬로 처리하던 prefill과 같은 병렬성입니다. 이제 각 위치에서 draft가 내놓은 토큰을 target의 분포와 비교해 수락하거나 거절하고, 처음 거절이 난 지점에서는 target의 분포로 토큰을 다시 뽑습니다.

```
draft가 그린 다섯 토큰:   "이" "결과" "는" "매우" "흥미"

                          target이 forward 한 번으로 다섯 위치를 병렬 검증
                           ✓    ✓     ✓    ✗
                          앞 3개 수락, 4번째에서 거절

이번 iteration 확정:      "이" "결과" "는" + target이 다시 뽑은 1개 = 4토큰
```

iteration 하나가 확정하는 토큰은 최소 1개, 최대 γ+1개입니다. 첫 토큰부터 거절되면 target이 다시 뽑은 1개만 남고, 전부 수락되면 target이 이미 계산해둔 그다음 위치의 분포에서 하나를 공짜로 더 뽑습니다. 어느 쪽이든 target의 가중치 읽기는 한 번입니다.

검증이 거의 공짜인 이유는 1편의 프레임 그대로입니다. decode에서 행렬곱의 비용은 연산이 아니라 가중치를 HBM에서 읽어오는 시간이 지배합니다. 가중치를 한 번 읽어온 김에 토큰 1개를 계산하든 5개를 계산하든 읽기 시간은 같고, 놀고 있던 연산 유닛이 일을 더 할 뿐입니다. 그래서 γ개를 검증하는 지연은 토큰 1개를 생성하는 지연과 거의 같습니다.

재미있는 사실 하나. 이 아이디어는 2022년 말 Google과 DeepMind가 각각 독립적으로 발표했고, 두 논문 모두 상대를 동시 발견으로 인정합니다. 좋은 아이디어가 무르익으면 두 곳에서 동시에 나온다는 사례가 하나 더 늘었습니다.

<br>

## 품질은 rejection sampling이 지킨다

남는 질문은 품질입니다. 작은 모델이 그린 토큰이 큰 모델의 출력에 섞여도 되는 걸까요? speculative decoding의 답은 "섞이지 않는다"입니다. 수락 규칙이 수학적으로 target의 분포를 복원하기 때문입니다.

draft 모델의 분포를 q, target의 분포를 p라 하겠습니다. draft가 뽑은 토큰 x를 target은 확률 min(1, p(x)/q(x))로 수락합니다. 풀어 쓰면 이렇습니다.

- target이 그 토큰을 draft만큼, 혹은 더 원했다면(p ≥ q) 무조건 수락합니다.
- draft가 과대평가한 토큰이라면(q > p) p/q의 비율로만 수락합니다.
- 거절했다면 max(0, p − q)를 정규화한 분포, 즉 draft가 과소평가했던 토큰들만 남긴 분포에서 다시 뽑습니다.

과대평가된 토큰에서 깎아낸 확률 질량을 과소평가된 토큰들에게 정확히 돌려주는 구조라서, 이렇게 뽑은 토큰의 분포는 target 혼자 뽑았을 때의 분포 p와 정확히 일치합니다. 원 논문이 정리로 증명해둔 사실입니다.

"무손실"의 의미는 정확히 해둘 필요가 있습니다. 보장되는 것은 **분포의 동일성**입니다. temperature가 0보다 크면 난수를 소비하는 순서가 달라져서, 같은 시드로 돌려도 개별 문장은 일반 디코딩과 다르게 나올 수 있습니다. greedy(temperature 0)에서는 검증이 "draft 토큰이 target의 argmax와 같은가"라는 비교로 환원되어, 부동소수점 오차 범위 안에서 일반 디코딩과 같은 문장이 나옵니다.

그럼 얼마나 빨라질까요? 토큰 하나가 수락될 확률의 기댓값을 α라 하면, 원 논문의 공식으로 계산할 수 있습니다.

```
iteration당 기대 확정 토큰 수

  E = (1 - α^(γ+1)) / (1 - α)

  α: 토큰 하나가 수락될 확률의 기댓값
  γ: draft 토큰 수

  α = 0.8, γ = 4 라면   E = (1 - 0.8^5) / 0.2 ≈ 3.4

  → target 가중치 읽기 한 번에 평균 3.4토큰
```

draft도 공짜는 아니니 비용을 넣어보겠습니다. draft 1회 비용이 target 1회의 c배라 하면 전체 속도 개선은 E / (γc + 1)입니다. c = 0.05인 소형 draft라면 3.4 / 1.2로 약 2.8배가 나옵니다. 반대로 α가 낮으면 draft 비용만 얹혀서 손해가 됩니다. 그리고 한 가지 기억해둘 사실이 있는데, walltime이 줄어도 **산술 연산의 총량은 오히려 늘어납니다**. 거절된 draft에 들어간 계산은 전부 버려지기 때문입니다.

<br>

## draft를 어디서 구하는가

speculative decoding의 성능은 결국 α, 즉 draft가 target을 얼마나 잘 맞히느냐에 달려 있습니다. draft를 구하는 방법이 여러 갈래로 발전해온 이유입니다.

**별도 draft 모델**이 가장 직관적인 방법입니다. 같은 계열의 소형 모델을 그대로 씁니다. Qwen3 8B의 draft로 Qwen3 0.6B를 쓰는 식입니다. 토큰 ID 단위로 검증하기 때문에 두 모델의 vocabulary가 같아야 한다는 제약이 있습니다. 원 논문의 실측으로는 target보다 두 자릿수쯤 작은 draft가 보통 α 0.5에서 0.9 사이를 냅니다. draft를 키우면 α는 오르지만 비용 c도 함께 올라서, 최적점은 중간 어딘가에 있습니다.

**n-gram** 방식은 draft에 모델이 필요 없다는 발상입니다. 최근 생성된 토큰 몇 개를 프롬프트에서 검색해서, 매치된 지점 뒤에 이어지는 토큰들을 그대로 draft로 씁니다. 요약, 문서 기반 QA, 코드 수정처럼 **출력이 입력을 많이 복사하는 워크로드**에서는 이 공짜 draft(c가 사실상 0)가 놀랍도록 잘 맞습니다. vLLM 공식 실측에서 낮은 부하 기준 최대 2.8배로, 별도 모델을 쓴 방식보다 오히려 좋았습니다. RAG 파이프라인을 서빙한다면 가장 먼저 시도해볼 방식입니다.

**EAGLE**은 현재 사실상 표준이 된 계열입니다. 출발점은 별도 draft 모델의 한계입니다. 남의 머리로 생각하는 draft는 target과 정렬되는 데 한계가 있으니, target의 마지막 hidden state를 직접 이어받아 다음 토큰을 그리는 작은 모듈(decoder layer 1개 남짓)을 붙이자는 것입니다. embedding과 LM head도 target의 것을 재사용합니다. target이 방금 무슨 생각을 했는지를 입력으로 받으니 구조적으로 정렬이 좋고, 수락률도 높습니다. EAGLE-2는 draft의 확신도에 따라 후보 트리를 동적으로 조정해서 여러 갈래의 후보를 한 번에 검증하고(여러 개의 예측 head를 붙인 Medusa가 개척한 tree 검증 방식을 이어받았습니다), EAGLE-3는 학습 방식을 갈아엎어 학습 데이터를 늘릴수록 수락률이 계속 오르는 스케일링 성질을 얻었습니다. 학술 벤치마크(배치 1, temperature 0) 기준 최대 6.5배를 보고합니다.

**MTP**(multi-token prediction)는 모델이 draft를 내장하고 나오는 흐름입니다. DeepSeek-V3는 학습 품질을 올리려고 다음 토큰 하나를 더 예측하는 MTP 모듈을 뒀는데, 추론에서 이 모듈이 그대로 draft가 됩니다. 본체와 embedding, LM head를 공유하는 1레이어 모듈이라 EAGLE과 닮은꼴입니다. DeepSeek-V3 논문 기준으로 두 번째 토큰의 수락률이 주제를 가리지 않고 85%에서 90%, 생성 속도로는 1.8배입니다. Gemma 4도 같은 경로로 쓰는 공식 draft 체크포인트를 배포합니다. 별도 학습도 모델 탐색도 필요 없어서, 서빙하려는 모델이 MTP를 지원한다면 첫 번째 선택지입니다.

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background: #f8f9fa;">
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">방식</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">draft의 출처</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">준비물</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">특징</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>draft 모델</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">같은 계열 소형 모델</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">vocabulary가 같은 소형 모델</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">준비가 간단, 수락률은 낮은 편</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>n-gram</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">프롬프트 문자열 매칭</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">없음</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">요약, RAG, 코드 수정처럼 복사가 많은 워크로드에 강함</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>EAGLE-3</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">target의 hidden state를 받는 전용 모듈</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">학습된 speculator 체크포인트</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">높은 수락률, 사실상 표준</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>MTP</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">모델에 내장된 예측 모듈</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">모델 제작자가 제공해야 함</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">준비 없이 바로, DeepSeek과 Gemma 4 등이 제공</td>
    </tr>
  </tbody>
</table>

<br>

## 배치가 커지면 공짜 점심이 사라진다

검증이 공짜라는 논리에는 조건이 하나 숨어 있었습니다. **남는 연산이 있을 때** 이야기라는 것입니다. 그런데 [4편](/llm/continuous-batching/)에서 본 continuous batching이 바로 그 남는 연산을 처리량으로 바꾸는 기술이었습니다. 두 기법은 같은 자원, decode의 유휴 연산을 두고 경쟁합니다.

배치가 커지면 여러 요청의 연산이 한 행렬곱으로 묶이면서 decode도 compute-bound에 가까워집니다. 이 상태에서는 거절된 draft의 연산이 더는 공짜가 아니라, 다른 요청이 쓸 수 있었던 실비용입니다. 게다가 요청마다 draft를 γ개씩 들고 오면 검증 forward가 처리하는 토큰 수 자체가 (γ+1)배가 되어, compute-bound로 넘어가는 시점도 앞당겨집니다.

vLLM 공식 실측이 이 구도를 그대로 보여줍니다. 초당 요청 1건 수준의 낮은 부하에서는 draft 모델 방식이 최대 1.5배, n-gram이 최대 2.8배 빨랐지만, 부하를 올리자 speculative decoding을 켠 쪽이 오히려 1.4배에서 1.8배 느려졌습니다. 이미 포화된 GPU에 제안과 검증의 추가 연산이 얹힌 결과입니다.

예외가 하나 있습니다. 컨텍스트가 아주 길면 배치를 키워도 가중치가 아니라 KV Cache 읽기가 병목을 지배합니다. [2편](/llm/kv-cache/)에서 봤듯 KV 읽기는 배치와 컨텍스트 길이에 비례해 늘어나기 때문입니다. 이 경우 decode는 큰 배치에서도 memory-bound에 머물러서 speculative decoding의 이득이 유지된다는 것이 후속 연구(MagicDec)의 결론입니다.

수락률 α도 워크로드를 탑니다. temperature가 높을수록 분포가 평평해져 draft가 맞히기 어려워지고, 코드나 요약처럼 예측 가능한 텍스트에서는 높게, 창작 글쓰기에서는 낮게 나옵니다. 그리고 벤치마크 수치를 볼 때는 조건을 확인해야 합니다. EAGLE-3의 6.5배는 배치 1에 temperature 0인 학술 조건의 숫자입니다. Llama 4를 EAGLE 계열로 프로덕션 서빙하는 Meta가 보고한 수치는 대규모 배치 기준 1.4배에서 2.0배로, 실서비스에서 기대할 현실적인 상한은 2배 안팎으로 보는 것이 맞습니다.

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 켤까 말까의 판단 기준</strong><br>
  트래픽이 낮고 토큰 간 지연이 중요한 서비스라면 켭니다. GPU가 포화 상태인 고부하 처리량 최적화 상황이라면 끄거나 draft 길이를 줄입니다. 출력이 입력을 많이 복사하는 워크로드라면 준비물 없는 n-gram부터 시도합니다. 어느 쪽이든 최종 결정은 실제 트래픽의 temperature와 도메인에서 acceptance rate를 재본 다음에 내립니다.
</div>

<br>

## vLLM에서 켜고 확인하기

vLLM v0.25.1에서 speculative decoding 설정은 `--speculative-config`에 JSON 하나로 전달합니다. 옛 자료에 나오는 `--speculative-model` 같은 개별 플래그는 deprecated 되었습니다.

```bash
# n-gram: 준비물 없이 바로 켠다
vllm serve google/gemma-4-31b-it \
  --speculative-config '{"method": "ngram", "num_speculative_tokens": 4,
                         "prompt_lookup_max": 5, "prompt_lookup_min": 2}'

# EAGLE-3: 공개 speculator 체크포인트를 지정한다
vllm serve google/gemma-4-31b-it \
  --speculative-config '{"method": "eagle3",
                         "model": "RedHatAI/gemma-4-31B-it-speculator.eagle3",
                         "num_speculative_tokens": 3}'
```

MTP를 지원하는 모델은 `"method": "mtp"`를 씁니다. DeepSeek처럼 draft 모듈이 체크포인트에 내장된 경우 model 지정 없이 method와 `num_speculative_tokens`만 주면 되고, Gemma 4의 공식 draft 체크포인트도 이 경로로 붙입니다. EAGLE 계열의 공개 speculator가 없는 모델은 vLLM 프로젝트의 speculators 라이브러리로 직접 학습하는 길도 있습니다.

스케줄러 관점에서는 걱정할 것이 없습니다. 4편에서 본 것처럼 V1 스케줄러는 모든 요청을 토큰 예산으로만 다루기 때문에, draft 토큰도 그 예산 안의 토큰일 뿐입니다. chunked prefill, prefix caching과 자연스럽게 함께 동작합니다.

켠 다음에는 반드시 수락률을 확인합니다. 서버 로그에 주기적으로 `SpecDecoding metrics` 라인이 찍히고, 여기서 평균 acceptance length(draft 검증 한 번에 확정된 평균 토큰 수)와 수락률을 볼 수 있습니다. Prometheus 지표로는 `vllm:spec_decode_num_draft_tokens`와 `vllm:spec_decode_num_accepted_tokens`의 비율이 acceptance rate입니다. 이 숫자가 낮게 나온다면 draft 길이를 줄이거나 끄는 것이 처리량에 이롭습니다.

배치 크기에 따라 이득이 뒤집히는 문제도 설정으로 다룰 수 있습니다. 동시성 구간별로 draft 길이를 선언하는 방식입니다.

```bash
--speculative-config '{"method": "eagle3",
  "model": "RedHatAI/gemma-4-31B-it-speculator.eagle3",
  "num_speculative_tokens": 3,
  "num_speculative_tokens_per_batch_size": [[1, 64, 3], [65, 128, 1], [129, 512, 0]]}'
```

동시 요청 64개까지는 draft 3개, 128개까지는 1개, 그보다 많으면 speculation을 끕니다. 트래픽이 출렁이는 서비스에서 한가한 시간대의 지연 이득만 취하고, 피크 시간대에는 자동으로 물러나는 구성입니다.

<br>

## 마치며

speculative decoding은 memory-bound한 decode가 남기는 유휴 연산을 검증에 쓰는 기법입니다. rejection sampling이 출력 분포를 정확히 보존하므로 품질과 속도의 교환이 아니라 순수한 속도 이득이고, draft는 공짜인 n-gram부터 target의 속내를 읽는 EAGLE, 모델이 직접 들고 나오는 MTP까지 고를 수 있습니다. 다만 이득의 원천이 유휴 연산이라서, 배치가 커져 GPU가 포화되면 이득도 함께 사라집니다. 낮은 부하에서 지연을 줄이는 도구이지 처리량을 올리는 도구가 아니라는 것이 실전의 한 줄 요약입니다.

이것으로 원리와 최적화 도구가 다 모였습니다. 다음 글에서는 이 부품들을 실제 서빙 설정으로 조립합니다. `vllm serve` 한 줄에 붙는 엔진 인자들이 각각 엔진의 어떤 동작을 바꾸는지, 원리에서 설정으로 내려가는 실전 가이드입니다.

<br>

## 참고자료

- [Speculative Decoding (vLLM Docs)](https://docs.vllm.ai/en/latest/features/speculative_decoding/)
- [Fast Inference from Transformers via Speculative Decoding (arXiv 2211.17192)](https://arxiv.org/abs/2211.17192)
- [Accelerating Large Language Model Decoding with Speculative Sampling (arXiv 2302.01318)](https://arxiv.org/abs/2302.01318)
- [How Speculative Decoding Boosts vLLM Performance by up to 2.8x (vLLM Blog)](https://vllm.ai/blog/2024-10-17-spec-decode)
- [EAGLE-3: Scaling up Inference Acceleration of LLMs via Training-Time Test (arXiv 2503.01840)](https://arxiv.org/abs/2503.01840)
- [DeepSeek-V3 Technical Report (arXiv 2412.19437)](https://arxiv.org/abs/2412.19437)
- [MagicDec: Breaking the Latency-Throughput Tradeoff for Long Context Generation (arXiv 2408.11049)](https://arxiv.org/abs/2408.11049)
- [Efficient Speculative Decoding for Llama at Scale (arXiv 2508.08192)](https://arxiv.org/abs/2508.08192)
