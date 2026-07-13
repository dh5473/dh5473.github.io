---
date: '2026-07-09'
title: 'vLLM의 핵심 원리 PagedAttention 파헤치기'
category: 'LLM'
series: 'llm-serving'
seriesOrder: 3
tags: ['LLM Serving', 'vLLM', 'PagedAttention', 'KV Cache', 'Memory Management']
summary: 'vLLM 이전의 서빙 시스템이 KV Cache 메모리의 60~80%를 낭비하던 이유와, PagedAttention이 운영체제의 페이징을 빌려 그 낭비를 4% 밑으로 줄인 원리를 파헤칩니다.'
thumbnail: './thumbnail.png'
---

요청 하나가 `max_tokens=2048`로 들어왔습니다. 그런데 모델은 100토큰만 생성하고 `<EOS>`를 내뱉으며 끝났습니다. 흔한 일입니다. 문제는 vLLM 이전의 서빙 시스템이 이 요청을 어떻게 처리했느냐입니다. 첫 토큰을 만들기도 전에, 2,048토큰치 KV Cache를 담을 연속된 메모리 덩어리를 통째로 예약해뒀습니다. 실제로는 100토큰만 썼으니, **나머지 1,948토큰치는 요청이 끝날 때까지 예약된 채로 비어 있었습니다.**

[2편](/llm/kv-cache/)에서 KV Cache가 진행 중인 모든 요청이 GPU에 들고 있어야 하는 상태이고, 이걸 한정된 메모리에 담아 관리하는 것이 서빙의 핵심 과제라고 했습니다. 그런데 그 한정된 공간을, 옛 시스템들은 이런 식으로 60~80%나 낭비하고 있었습니다. 아무리 GPU를 사도 실제로 쓰는 건 20~40%뿐이었다는 뜻입니다. 이 글에서는 그 낭비가 정확히 어디서 왔는지, 그리고 vLLM의 **PagedAttention**이 운영체제의 오래된 아이디어를 빌려 이 낭비를 4% 밑으로 줄인 방법을 파헤칩니다. 시리즈에서 "vLLM은 왜 빠른가"에 처음으로 직접 답하는 글입니다.

<br>

## 연속 할당이 강제한 낭비

왜 옛 시스템들은 미래에 쓸지도 모르는 메모리를 미리 잡아뒀을까요? 답은 어텐션 연산의 요구 조건에 있습니다. 소박하게 구현한 어텐션 커널은 한 시퀀스의 KV Cache가 메모리에 **하나의 연속된 배열**로 놓여 있다고 가정합니다. 텐서 하나처럼요. 그런데 시퀀스는 토큰이 생성될 때마다 길어집니다. 연속성을 계속 보장하려면, 뒤에 다른 요청이 끼어들어 자리를 뺏기 전에 **처음부터 최대 길이만큼 한 덩어리를 잡아두는 수밖에** 없었습니다.

이 연속 할당이 세 가지 낭비를 만들어냅니다.

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background: #f8f9fa;">
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">낭비 유형</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">언제 생기나</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>예약 낭비 (reserved)</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">아직 생성하지 않은 미래 토큰의 자리를 미리 잡아둠. 생성이 끝날 때까지 비어 있음</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>내부 단편화 (internal)</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">출력 길이를 모르니 <code>max_model_len</code>까지 과하게 잡음. 대부분 끝까지 안 씀</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>외부 단편화 (external)</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">요청마다 크기가 달라 연속 덩어리 사이에 어중간한 빈틈이 생김</td>
    </tr>
  </tbody>
</table>

특히 외부 단편화가 고약합니다. 남은 메모리를 총량으로 따지면 새 요청을 받을 공간이 충분한데, **연속된 자리로는 없어서** 요청을 거절해야 하는 상황이 벌어집니다. 조각조각 흩어진 빈 공간은 있지만, 큰 한 덩어리가 필요한데 그게 안 되는 것입니다.

```
연속 할당 방식의 KV 메모리 (요청 3개)

요청 A: [■■□□□□□□□□□□□□□□]  16칸 예약, 2칸만 사용
요청 B: [■■■■■□□□□□□□]      12칸 예약, 5칸만 사용
요청 C: [■■■□□□□□□□□□□□□□□□□□]  20칸 예약, 3칸만 사용
        ■ = 실제 사용   □ = 예약됐지만 빈 공간

→ 실제 사용 20~40%, 나머지 60~80%가 예약된 채 낭비
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 참고</strong><br>
  vLLM 이전의 대표적 시스템인 Orca, FasterTransformer가 이 연속 할당 방식을 썼습니다. PagedAttention 논문(Kwon et al., 2023)은 이들이 KV 메모리의 20~40%만 실제로 활용했다고 측정했습니다.
</div>

<br>

## 운영체제는 이미 이 문제를 풀었다

사실 "연속된 큰 메모리가 필요한데 단편화 때문에 못 쓴다"는 문제는 컴퓨터 과학에서 수십 년 전에 풀린 문제입니다. 바로 운영체제의 **가상 메모리(virtual memory)와 페이징(paging)**입니다.

프로그램은 자기가 0번지부터 쭉 이어진 연속 메모리를 쓰고 있다고 믿습니다. 하지만 실제 물리 메모리(RAM)에서는 그렇지 않습니다. 메모리는 **고정 크기 페이지(page)**로 잘게 나뉘어 있고, 프로그램이 쓰는 논리적으로 연속된 주소는 물리적으로는 여기저기 흩어진 페이지에 담깁니다. 이 논리 주소와 물리 페이지의 대응을 **페이지 테이블(page table)**이 관리합니다.

```
프로그램이 보는 주소 (연속)      물리 메모리 (흩어짐)
┌─────────────┐              ┌──────────────────┐
│ 논리 페이지 0 │──┐           │ ... 페이지 47 ... │
│ 논리 페이지 1 │  └─────────▶ │ ... 페이지 12 ... │
│ 논리 페이지 2 │──────┐       │ ... 페이지 91 ... │
└─────────────┘       └─────▶ │ ...              │
        │ 페이지 테이블이 매핑          └──────────────────┘
```

핵심은 이겁니다. 페이징에서는 **물리적으로 연속된 메모리가 애초에 필요 없습니다.** 페이지 하나씩, 빈 자리 아무 데나 할당하면 되니까요. 그래서 외부 단편화가 사라지고, 실제로 쓸 만큼만 페이지를 할당하니 예약 낭비도 사라집니다. PagedAttention의 출발점은 단순한 질문 하나였습니다. **KV Cache도 이렇게 관리하면 안 될까?**

<br>

## KV Cache를 블록으로 쪼개다

PagedAttention은 페이징을 KV Cache에 그대로 옮겨옵니다. 이름의 "Paged"가 여기서 나옵니다.

KV Cache를 하나의 연속 덩어리로 잡는 대신, **고정 크기 블록(block)**으로 잘게 나눕니다. 블록 하나는 기본적으로 **16개 토큰**의 Key와 Value를 담습니다(`--block-size`로 조정 가능). 그리고 각 시퀀스는 자신의 **블록 테이블(block table)**을 갖습니다. 페이지 테이블과 정확히 같은 역할로, 시퀀스의 논리 블록이 물리 메모리 어디의 블록에 담겨 있는지를 매핑합니다.

```
시퀀스의 논리 블록          물리 블록 풀 (흩어짐)
┌──────────────┐         ┌────────────────────────┐
│ 논리 블록 0    │──────▶  │ 블록 7   [토큰 0~15]     │
│  (토큰 0~15)   │         │ 블록 3   [토큰 16~31]    │
│ 논리 블록 1    │──────▶  │ 블록 9   [토큰 32~47]    │
│  (토큰 16~31)  │         │ ...                     │
│ 논리 블록 2    │──────▶  └────────────────────────┘
│  (토큰 32~47)  │           block table이 논리→물리 매핑
└──────────────┘
```

할당은 **필요할 때 한 블록씩(on-demand)** 이뤄집니다. 미리 최대 길이만큼 잡아두지 않습니다.

- 시퀀스가 첫 16토큰을 만들면, 빈 블록 풀에서 물리 블록 하나를 가져와 블록 테이블에 기록합니다.
- 17번째 토큰이 나오면, 두 번째 물리 블록을 가져옵니다. 이 블록은 첫 블록과 물리적으로 붙어 있을 필요가 전혀 없습니다. 풀에서 비어 있는 아무 블록이나 됩니다.

물리 블록이 흩어져 있으니, 어텐션을 계산할 때는 블록 테이블을 따라가며 필요한 블록들을 모읍니다(gather). 이 과정을 담당하는 특수 커널이 PagedAttention 커널입니다. 덕분에 KV가 물리적으로 비연속이어도 어텐션이 정상 동작합니다.

<div style="background: #f0fff4; border-left: 4px solid #51cf66; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>✅ 2편과 연결되는 지점</strong><br>
  이 물리 블록 풀은 vLLM이 시작할 때 미리 통째로 확보합니다. 2편에서 본 <code>GPU KV cache size: N tokens</code> 로그가 바로 이 풀의 전체 크기입니다. N = 전체 블록 수 × 블록당 토큰 수인 셈입니다. 블록의 할당과 반납은 빈 블록 목록(free list)에서 꺼내고 되돌리는 것이라 O(1)로 끝납니다.
</div>

<br>

## 낭비가 4% 밑으로

이제 낭비가 어디로 갔는지 따져봅시다. 세 가지 낭비가 각각 어떻게 됐는지 보면 명확합니다.

- **예약 낭비**: 사라졌습니다. 미리 최대 길이를 잡지 않고 필요할 때 블록을 하나씩 붙이니까요.
- **외부 단편화**: 사라졌습니다. 모든 블록이 같은 크기라, 빈 블록이 하나라도 있으면 어떤 요청에든 들어갑니다. 어중간해서 못 쓰는 빈틈이 생길 수가 없습니다.
- **내부 단편화**: 딱 하나 남습니다. 시퀀스의 **마지막 블록**은 16칸을 다 못 채우고 끝날 수 있습니다. 100토큰짜리 시퀀스는 블록 7개(112칸)를 쓰고 12칸을 남깁니다. 하지만 이 낭비는 시퀀스당 최대 15토큰(블록 크기 미만)뿐이라, 전체로 보면 미미합니다.

그 결과 낭비율이 **60~80%에서 4% 미만으로** 떨어집니다.

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead>
    <tr style="background: #f8f9fa;">
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">항목</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">연속 할당 (Orca 등)</th>
      <th style="padding: 12px 16px; border: 1px solid #e9ecef; text-align: left;">PagedAttention (vLLM)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>할당 단위</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">요청당 연속 덩어리 (max_len)</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">16토큰 블록, on-demand</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>KV 메모리 낭비</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">60~80%</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">4% 미만</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;"><strong>남는 낭비</strong></td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">예약 + 내부 + 외부</td>
      <td style="padding: 12px 16px; border: 1px solid #e9ecef;">마지막 블록의 빈칸뿐</td>
    </tr>
  </tbody>
</table>

이 4%라는 숫자가 왜 중요할까요? [1편](/llm/llm-inference-process/)에서 decode는 memory-bound라서, 배치를 키워 여러 요청을 동시에 처리하는 것이 처리량의 핵심이라고 했습니다. 그런데 배치를 키우려면 그만큼의 KV Cache가 GPU에 동시에 살아 있어야 합니다. 낭비가 60~80%면 실제로 담을 수 있는 요청 수가 그만큼 쪼그라들고, 낭비가 4%면 같은 GPU에 훨씬 많은 요청을 담을 수 있습니다.

> **PagedAttention은 KV Cache를 아끼는 기술이 아니라, 이 한정된 공간을 남김없이 쓰게 해주는 기술입니다.** 2편에서 본 그 빠듯한 KV 공간의 거의 전부를 실제 요청에 쓸 수 있게 되고, 그만큼 배치를 키울 여지가 생깁니다. vLLM이 이전 시스템 대비 처리량 2~4배를 낸 근원의 상당 부분이 여기에 있습니다.

<br>

## 같은 블록을 여러 요청이 나눠 쓴다

블록 테이블로 KV를 간접 참조하게 되면서 뜻밖의 선물이 딸려옵니다. 서로 다른 두 시퀀스의 블록 테이블이 **같은 물리 블록을 가리킬 수 있다**는 점입니다.

예를 들어 여러 요청이 똑같은 시스템 프롬프트로 시작한다면, 그 공통 프롬프트의 KV는 물리 메모리에 **딱 한 번만** 저장해두고 모든 요청이 공유하면 됩니다. 각자의 블록 테이블이 같은 블록을 가리키기만 하면 되니까요. 그러다 요청들이 서로 다른 토큰을 생성하며 갈라지는 순간, 그 블록만 복사해서 각자 쓰면 됩니다(copy-on-write).

이 블록 공유가 바로 **prefix caching**의 씨앗입니다. 여러 요청이 똑같은 시스템 프롬프트나 긴 문서를 반복해서 쓸 때, 그 공통 부분의 KV를 한 번만 저장해두고 재사용하는 기법입니다. 블록 단위로 관리한 덕분에 이런 공유가 자연스럽게 가능해졌습니다.

<br>

## 마치며

PagedAttention이 한 일을 한 문장으로 줄이면, KV Cache를 요청마다 통째로 잡는 뻣뻣한 덩어리에서, 아무 데나 끼워 넣고 공유할 수 있는 블록들의 풀로 바꾼 것입니다. 운영체제가 반세기 전에 물리 메모리를 다루려고 찾아낸 답을, LLM의 KV Cache에 그대로 적용한 셈입니다. 낭비가 사라졌고, 그만큼 더 많은 요청이 한 GPU에 올라가게 됐습니다.

그런데 블록들의 풀이 생기자 새로운 질문이 따라옵니다. 매 스텝마다 이 블록들을 어떤 요청에 내어줄지, 그리고 긴 프롬프트를 처리하는 요청이 다른 요청들의 생성을 막지 않게 하려면 어떻게 배치를 짜야 할지. 다음 글에서는 vLLM이 요청들을 매 스텝 어떻게 스케줄링하는지, continuous batching과 chunked prefill을 살펴봅니다.

<br>

## 참고자료

- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180)
- [vLLM Documentation - PagedAttention Design](https://docs.vllm.ai/en/latest/design/paged_attention/)
- [Inside vLLM: Anatomy of a High-Throughput LLM Inference System (vLLM Blog)](https://vllm.ai/blog/2025-09-05-anatomy-of-vllm)
- [How PagedAttention Resolves Memory Waste of LLM Systems (Red Hat Developer)](https://developers.redhat.com/articles/2025/07/24/how-pagedattention-resolves-memory-waste-llm-systems)
