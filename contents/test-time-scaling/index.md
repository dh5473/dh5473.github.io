---
date: '2025-06-12'
title: 'Test Time Scaling'
category: 'ML'
summary: 'Chain-of-Thought부터 Test-Time Compute까지, 이미 학습된 LLM의 추론 성능을 향상시키는 방법들을 알아봅시다.'
thumbnail: './image-06.png'
---



# Chain-of-Thought Prompting
흔히 CoT라 불리는 Chain-of-Thought 방식은 답을 도출하기 위해 필요한 중간 추론 단계를 설명하도록 하는 것입니다. 앞서 공부했던 복잡한 학습 방식에 비해 정말 간단하지만, 논리적이나 수학적으로 복잡한 문제를 해결하는데 꽤나 도움이 되는 방식입니다.

등장 배경을 조금 살펴보면, 기존에는 언어 모델의 크기를 확장함으로써 성능 및 샘플 효율성 향상과 같은 이점을 얻어낼 수 있었습니다. 하지만 단순히 모델 크기를 확장하는 것만으로는 arithmetic(산술), commonsense(상식), symbolic reasoning(상징적 추론)과 같은 복잡한 작업에서 여전히 높은 성능을 달성하기 어려웠습니다.

해당 연구에서는 다음과 같은 2가지 아이디어를 기반으로 LLM의 reasoning 능력 향상을 시도합니다.

- 산술 추론에서 정답에 도달하기까지의 자연어 기반 추론 과정을 생성하면 모델의 추론 능력이 향상될 수 있다.
- 몇 개의 입출력 예시(Few-shot)만으로도 LLM이 새로운 태스크를 수행할 수 있다. (in-context learning).

![Chain-of-Thought Prompting 예시](./image-01.png)
<p align="center" style="color: #666; font-size: 14px;"><em>Chain-of-Thought Prompting 예시 (출처: <a href="https://arxiv.org/pdf/2201.11903" target="_blank">Chain-of-Thought Prompting Elicits Reasoning in Large Language Models</a>)</em></p>

위의 예시는 CoT에서 등장하는 전형적인 예시로, 왼쪽은 일반적인 ICL이며 오른쪽은 CoT prompting입니다. 정답 예시에 산술 과정만 추가해주어도 다른 결과를 내는 것을 확인할 수 있습니다.

<br>

![CoT Prompting 성능 비교](./image-02.png)
<p align="center" style="color: #666; font-size: 14px;"><em>CoT Prompting 성능 비교 (출처: <a href="https://arxiv.org/pdf/2201.11903" target="_blank">Chain-of-Thought Prompting Elicits Reasoning in Large Language Models</a>)</em></p>

<br>

결과적으로 Chain-of-thought prompting은 다음과 같은 특성들을 가지고 있습니다.

- 원칙적으로, CoT는 복잡한 multi-step 문제들을 중간 단계로 분해할 수 있으며, 이는 더 많은 추론 단계를 요구하는 문제에서 추가적인 계산을 할당할 수 있다는 것을 의미한다.
- CoT는 모델의 동작 방식에 대해 해석 가능한 window를 제공한다. 특정 답에 어떻게 도달하는지 경로를 알 수 있기 때문에 어디서 잘못되었는지 디버깅할 수 있는 기회를 제공한다.
- CoT reasoning은 math word problems, commonsense reasoning, symbolic manipulation과 같은 task에 사용할 수 있으며, 사람이 언어를 통해 해결할 수 있는 어떤 과제에도 적용 가능하다. (원칙적으로는)
- 추가적인 파인 튜닝 없이도, few-shot 프롬프팅을 통해 원하는 형태의 답변을 이끌어낼 수 있다.

## Let's think step by step.

다음은 Large Language Models are Zero-Shot Reasoners이라는 논문을 베이스로 살펴보려고 합니다. 언어 모델의 크기를 확장하는 것은 최근 NLP 혁명의 핵심 요소였고, LLM의 성공은 in-context few-shot 혹은 zero-shot으로부터 기인합니다. 이는 task를 설명하는 간단한 몇 가지 예시 혹은 명령만으로 다양한 task를 해결할 수 있다는 것을 의미합니다. 이러한 방법을 "prompting"이라고 합니다.

물론 큰 규모의 LLM조차도 여러 단계의 추론을 필요로 하는 task에서는 어려움이 있었지만, 앞서 설명한 CoT prompting을 통해 추론 성능을 향상 시킬 수 있었습니다. 반면 해당 논문에서는 특정 task에 구애받지 않고 다양한 task에 똑같이 적용할 수 있는 zero-shot 기법을 제안합니다.

![Zero-shot CoT 예시](./image-03.png)
<p align="center" style="color: #666; font-size: 14px;"><em>Zero-shot CoT 예시 (출처: <a href="https://arxiv.org/pdf/2205.11916" target="_blank">Large Language Models are Zero-Shot Reasoners</a>)</em></p>

위의 예시 이미지와 같이 "Let's think step by step." 한 문장만 추가하더라도 기존 zero-shot 방식으로 해결하지 못했던 문제의 정답에 도달할 수 있습니다. 중요한 포인트는 Zero-shot-CoT 방식은 특정 task에 적합한 예시나 템플릿 없이도 범용적으로 적용이 가능하다는 점입니다.

<br>

![Zero-shot CoT 성능 비교](./image-04.png)
<p align="center" style="color: #666; font-size: 14px;"><em>Zero-shot CoT 성능 비교 (출처: <a href="https://arxiv.org/pdf/2205.11916" target="_blank">Large Language Models are Zero-Shot Reasoners</a>)</em></p>

여기까지 CoT에 관한 내용들을 간단히 살펴보았는데요, 사실 최근에는 LLM 성능이 크게 향상되어 위와 같은 방법론들이 큰 효과를 보지 못하는 경우도 많은 것 같습니다. 물론 마법의 문장이라고 불렸던 만큼 아예 효과가 없는 것은 아니지만, GPT-4가 등장하기도 전에 나왔던 기법이니 만큼 경우에 따라 얼마나 효과가 있는지 검증이 필요합니다. 특히 step by step은 답이 정확히 정해져 있는, 논리적 절차가 필요한 문제에서는 적합하지만 단순 사실 조회나 개인적인 의견 혹은 감정의 영역에서는 효과가 없는 경우가 있습니다.

# Test-Time Compute

오랫동안 많은 AI와 ML 리서처, 그리고 사용자들은 결과를 즉시 생성하는 모델을 선호해 왔습니다. 하지만 최근 openAI의 o1 모델과 함께 소개된 slow thinking 방식은 이러한 흐름을 완전히 바꾸어 놓았습니다. Chain-of-Thought reasoning으로 알려져 있는, 서두르지 않고 여러 단계를 거쳐 생각할 시간을 가질 때 추론 능력이 향상된다는 게 분명해졌습니다. 이러한 특성은 Test-Time Compute라는 주제와 연결됩니다.

Test-Time Compute(TTC)는 모델이 학습을 마친 후 실제로 사용될 때, 즉 실제로 응답을 생성하거나 task를 수행할 때 사용되는 계산 자원을 의미합니다. 즉, 모델이 학습되는 과정이 아닌, 실제로 사용될 때 필요한 처리 능력과 시간을 뜻합니다. TTC에는 Inference process와 Scaling at test time이라는 개념이 존재합니다. 

- **Inference process**: 사용자가 질문이나 프롬프트를 입력 시, 모델은 이를 처리하고 응답을 생성하는데, 이 과정에서 발생하는 비용을 test-time compute라고 합니다.
- **Scaling at test time**: OpenAI의 o1 시리즈 같은 고급 모델들은 추론 중에 동적으로 사고하는 시간을 늘릴 수 있습니다. 이는 복잡한 질문에 대해 더 오래 생각하게 하여, 더 높은 연산량을 할당하여 정확도를 높이는 것을 의미합니다.

다음으로 **Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters** 이라는 논문을 기반으로 TTC에 대해 더 자세히 살펴보겠습니다.

## Dynamic Resource Allocation for Test-Time Efficiency

LLM이 점점 더 복잡한 문제를 해결해야할 때, 계산 자원의 효율적인 사용이 중요해질 것으로 보입니다. 어려운 프롬프트를 다루기 위한 현재 접근 방식은 더 큰 모델 혹은 더 많은 사전학습에 의존하고 있습니다. 이는 간단한 문제들이 포함된 경우 과도한 계산 오버헤드가 발생할 수도 있습니다. 따라서 task의 난이도에 따라 할당할 자원을 조정하는 솔루션이 필요합니다.

compute-optimal scaling의 목표는 테스트 시점에 계산 자원이 효과적으로 사용되도록 하는 것입니다. 프롬프트의 복잡성에 따라 계산량을 동적으로 조정함으로써, 간단한 task에서는 불필요한 자원 소비를 방지하고 어려운 task에서는 성능을 향상시킵니다. 이러한 맞춤형 할당은 효율성을 증가시킬 뿐만 아니라, 더 큰 모델이 필요했던 시나리오에서 더 작은 모델을 배치할 수 있도록 합니다.

저자들은 해당 방식을 구현하기 위해, 반복적 수정(iterative revisions)과 병렬 샘플링(parallel sampling)이라는 2가지 주요 메커니즘을 제안합니다. 반복적 수정의 경우 모델이 초기 답변을 step-by-step 방식으로 응답을 개선해 나가는 방식입니다. 이는 간단한 문제들에 유용한데, 모델의 첫 번째 답변이 일반적으로 정답에 가깝지만 약간의 조정이 필요한 경우에 효과적입니다.

반면, 모델의 초기 응답이 올바른 방향이 아닐 수 있는 더 어려운 문제의 경우 병렬 샘플링이나 트리 탐색(tree-search) 방법이 더 효과적입니다. 병렬 샘플링은 모델이 동시에 여러 답변을 생성하고, 더 넓은 범위의 응답을 선택할 수 있도록 합니다. 이는 모델이 문제 해결을 위해 다양한 고수준 전략을 탐색할 수 있게 하며, 다양한 접근이 필요한 복잡한 task에 중요합니다.

## Compute-Optimal Scaling

연산 최적 확장 방법은 현재 task의 예측된 난이도에 따라 테스트 시점 계산 전략을 조정하여 작동합니다. 이 접근 방식은 성능을 극대화하면서 불필요한 오버헤드 없이 계산 자원이 효과적으로 할당되도록 보장합니다. 핵심 아이디어는 추론 중 문제의 복잡성에 맞게 계산량을 조정하여, 모든 프롬프트에 균일한 계산 할당의 비효율성을 피하는 것입니다.

사용되는 방법 중 하나로 앞서 언급한 반복적 수정이 있습니다. 이 방식의 경우 모델이 처음에 낸 답을 한 번에 끝내는 게 아니라 여러 번에 걸쳐 단계적으로 조금씩 수정해 나갑니다.

예를 들어, 모델이 팩토리얼을 계산하는 재귀 문제를 해결하도록 요청받는 작업을 고려해 보겠습니다. 처음에 모델은 재귀를 사용하지만 기본 사례(base case)가 없는 솔루션을 생성하여 무한 루프를 초래할 수 있습니다. 반복적 수정 과정에서 모델은 이 누락을 식별하고 특정 사례를 처리하기 위한 필요한 조건을 추가하여 이를 수정합니다. 각 반복은 솔루션을 정제하여 점진적으로 올바른 결과로 이어집니다.

```python
def factorial(n):
    return n * factorial(n - 1)

# => base case가 없어 무한 루프 오류 발생!
# 오류 식별 후 필요한 조건 추가하기
    
def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n - 1)
```

![Compute-Optimal Scaling 예시](./image-05.png)
<p align="center" style="color: #666; font-size: 14px;"><em>Parallel Sampling (출처: <a href="https://arxiv.org/pdf/2408.03314" target="_blank">Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters</a>)</em></p>

더 복잡한 작업의 경우, 여러 가능한 접근 방식을 동시에 탐색하는 병렬 샘플링이 사용됩니다. 이 경우, 모델은 동시에 여러 개의 독립적인 응답을 생성하여 다양한 고수준 전략을 탐색할 수 있게 합니다. 이 접근 방식은 모델의 첫 번째 응답이 충분하지 않을 수 있는 더 어려운 문제를 처리하는 데 중요합니다.

예를 들어, 모델이 지도상의 여러 도시 간 최단 경로를 찾는 최적화 문제를 해결하도록 요청받는 시나리오를 고려해 보겠습니다. 이 경우, 모델은 동시에 여러 가능한 경로를 생성합니다. 각 경로는 더 짧은 직선 거리를 우선시하거나 정차 횟수를 최소화하는 등 서로 다른 접근 방식을 나타냅니다. 이러한 여러 솔루션이 생성되면, 검증자가 각 솔루션을 전반적인 효율성에 따라 평가하여 생성된 응답 집합에서 최적의 경로를 선택합니다. 이를 통해 모델은 다양한 전략을 한 번에 탐색할 수 있으며, 최상의 솔루션을 보다 철저하게 검색할 수 있습니다.

연산 최적 확장의 핵심 아이디어는, 문제가 얼마나 복잡하냐에 따라 계산 자원을 다르게 쓰는 능력에 있습니다. 예를 들어 간단한 문제는 반복적으로 조금만 수정해도 충분하니까 계산을 적게 써도 되지만, 복잡한 문제는 여러 가지 방법을 동시에 시도해보거나(병렬 샘플링) 여러 단계로 깊이 파고 드는 전략(트리 탐색)이 필요하기 때문에 더 많은 계산이 필요합니다. 이 방식은 문제의 난이도를 먼저 예측한 뒤, 거기에 가장 잘 맞는 전략을 자동으로 선택해서 적용하는 효율적인 방식인 것이죠.

## Verifier Models

연산 최적 확장에서, 검증자의 선택은 모델의 응답 정확도를 평가하는 데 중요한 역할을 합니다. 검증자의 경우 아래와 같은 2가지 주요 유형이 도입되었습니다.

- **프로세스 기반 검증자 모델(Process-based Verifier Model, PRM)**
- **오라클 기반 검증자 모델(Oracle-based Verifier Model, ORM)**

PRM은 실제 정답 레이블에 의존하지 않고 테스트 시점에 모델의 응답을 평가합니다. 모델이 낸 답이 맞는지 틀렸는지를 직접 알 수 없을 때 사용하는 방식입니다. 즉, 정답이 뭔지 모르는 상황에서도 모델이 얼마나 논리적으로 단계적으로 생각했는지를 보고 점수를 매깁니다. 따라서 실제 서비스처럼 정답이 없는 환경에서도 쓸 수 있다는 장점이 있습니다.

반면, ORM은 실제 정답(ground-truth)에 접근할 수 있다고 가정하고, 이 정보를 활용하여 모델의 응답이 정확한지를 검증합니다. 이 접근 방식은 더 높은 정확성을 제공하지만, 실제 정답 데이터가 일반적으로 존재하지 않는 현실 세계 환경에서는 적용하기 어렵습니다. 즉, 정답을 이미 알고 있는 상황에서만 쓸 수 있습니다.

![Verifier Models 비교](./image-06.png)
<p align="center" style="color: #666; font-size: 14px;"><em>PRM (출처: <a href="https://arxiv.org/pdf/2408.03314" target="_blank">Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters</a>)</em></p>

<br>

PRM 안에서는 다음과 같은 방법들이 있습니다.

- **Best-of-N 샘플링**
    - 여러 개의 응답을 생성한 뒤, 검증자의 평가 피드백을 기준으로 가장 점수가 높은 응답 선택
    - 계산 효율은 높지만, 가능한 다양한 해결책을 충분히 탐색하지 못할 수 있음
- **Beam Search**
    - 여러 후보 응답을 동시에 유지하면서 한 단계씩 계속 수정해 나감
    - 이 과정에서 서로 다른 경로를 병렬로 탐색할 수 있기 때문에, 더 다양한 해결 가능성 존재
- **Lookahead Search**
    - 현재 후보 뿐만 아니라 앞으로 나올 수 있는 응답 경로까지 미리 내다보며 평가
    - 더 깊은 탐색이 필요한 복잡한 문제를 해결할 때 효과적

이러한 방법들은 모두 task의 복잡도를 다루는 서로 다른 접근 방식입니다. task에 적합한 방법을 선택함으로써, 연산 최적 확장(compute-optimal scaling)은 모델의 응답이 정확하면서도 계산 자원을 효율적으로 사용하는 결과를 만들어냅니다.

## Balancing Test-Time Compute

연산 최적 확장(compute-optimal scaling)의 가장 큰 장점 중 하나는, 기존 방식보다 최대 4배나 적은 계산으로도 비슷하거나 더 좋은 성능을 낼 수 있다는 점입니다. 예를 들어, 쉬운 문제나 중간 난이도의 문제에는 적은 자원만 쓰고, 남는 자원을 더 복잡한 문제에 집중적으로 사용하는 방식으로 전체 연산량을 효율적으로 줄일 수 있습니다.

이 논문에서는, 사전 학습할 때 드는 계산량과 모델을 실제로 사용할 때 드는 계산량(test-time compute) 사이의 균형 문제도 다루고 있습니다. 문제가 너무 어렵지 않다면, 큰 모델을 미리 열심히 훈련시키기보다는, 필요할 때 생각을 더 많이 하도록 만드는 게 더 효과적일 수 있다고요. 특히 정답을 뽑기 위해 길게 추론하지 않아도 되는 경우에는 이 전략이 더 잘 맞습니다.

실제로 저자들은 작은 모델에 테스트 시점 연산을 더한 경우와 그보다 14배나 더 큰 모델을 비교했는데, 결과는 다음과 같습니다. 추론해야 할 양(R 값)이 작을 경우, 작은 모델이 더 깊이 사고하도록 설정하는 쪽이 오히려 더 성능이 좋았고, 큰 모델보다 훨씬 효율적이었습니다. 즉, 무조건 큰 모델을 만들기보다는, 생각이 필요한 순간에만 계산을 집중하는 게 더 나을 수 있다는 뜻입니다. 하지만 반대로, 생각해야 할 양(R 값)이 아주 많아지면, 그때는 처음부터 잘 훈련된 큰 모델이 더 유리합니다.

결론적으로, 이 연구는 사전학습과 테스트 시점 연산 사이의 균형을 어떻게 잡느냐가 중요하다는 점을 보여줍니다. 즉, 작은 모델이라도 똑똑하게 계산을 조절하면, 특정 상황에서는 훨씬 더 큰 모델보다 잘 작동할 수 있다는 겁니다. 그리고 어떤 전략이 더 좋은지는, 이 문제를 푸는 데 얼마나 길게 생각해야 하느냐에 따라 달라진다는 걸 의미합니다. 단순히 사전 학습량을 늘리는 것보다 테스트 시점에서 계산 자원을 조절하는 방식이 효과적인 경우도 존재한다는 것이죠.

# Reference
- [Chain-of-Thought Prompting Elicits Reasoning in Large Language Models](https://arxiv.org/pdf/2201.11903)
- [Large Language Models are Zero-Shot Reasoners](https://arxiv.org/pdf/2205.11916)
- [논문리뷰: Chain-of-Thought Prompting Elicits Reasoning in Large Language Models (NeurIPS 2022)](https://velog.io/@kunha98/%EB%85%BC%EB%AC%B8%EB%A6%AC%EB%B7%B0Chain-of-Thought-Prompting-Elicits-Reasoningin-Large-Language-ModelsNeurIPS-2022)
- [Zero-shot CoT](https://kimjy99.github.io/%EB%85%BC%EB%AC%B8%EB%A6%AC%EB%B7%B0/zero-shot-cot/)
- [ChatGPT가 잘하는 논리적 추론](https://gagadi.tistory.com/50)
- [Zero-shot Chain-of-Thought Prompting이란?](https://revisioncrm.tistory.com/668)
- [Test-Time Compute](https://huggingface.co/blog/Kseniase/testtimecompute)
- [Search and Learn](https://huggingface.co/learn/cookbook/en/search_and_learn)
- [Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters](https://arxiv.org/pdf/2408.03314)
- [Scaling LLM Test-Time Compute Optimally - Medium](https://medium.com/@EleventhHourEnthusiast/scaling-llm-test-time-compute-optimally-can-be-more-effective-than-scaling-model-parameters-19a0c9fb7c44)