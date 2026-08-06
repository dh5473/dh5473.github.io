---
date: '2026-01-23'
title: 'SGD에서 Adam까지, 옵티마이저는 무엇을 개선해왔나'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 23
tags: ['Optimizer', '옵티마이저', 'SGD', 'Momentum', 'RMSprop', 'Adam', 'AdamW', '경사하강법', '머신러닝']
summary: '미니배치 분할, Momentum의 관성, RMSProp의 파라미터별 학습률, 둘을 합친 Adam의 편향 보정까지 갱신식이 달라져 온 이유를 정리한다.'
thumbnail: './thumbnail.png'
---

경사하강법의 갱신식은 한 줄이다. 기울기를 구하고, 그 반대 방향으로 학습률만큼 간다.

$$w \leftarrow w - \alpha \frac{\partial J}{\partial w}$$

이 한 줄로 선형 회귀는 잘 학습된다. 그런데 데이터가 120만 장이고 파라미터가 2,500만 개인 신경망에서는 같은 식이 두 지점에서 무너진다. 기울기 한 번을 구하는 데 데이터 전체를 훑어야 하고, 모든 파라미터를 하나의 $\alpha$ 로 똑같이 움직여야 한다. 옵티마이저의 역사는 이 두 제약을 차례로 푸는 과정이었다.

## 전체 데이터로는 한 걸음도 못 뗀다

위 식의 기울기는 전체 데이터 $m$ 개의 평균으로 계산한다. 이것이 **Batch Gradient Descent**다.

$$\frac{\partial J}{\partial w} = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)\,x_i$$

데이터가 100개면 문제없지만 100만 개라면 파라미터를 한 번 움직이기 위해 100만 번의 순전파가 필요하다. 하루에 업데이트를 몇 번 하지도 못한다.

반대 극단이 **확률적 경사하강법(Stochastic Gradient Descent, SGD)** 이다. 샘플 하나로 기울기를 구하고 곧바로 갱신한다. 100만 번 움직일 수 있지만, 샘플 하나의 기울기는 전체 기울기와 방향이 꽤 다를 수 있어서 경로가 요동친다.

실전은 그 사이다. 데이터를 32에서 256 정도의 묶음으로 잘라 묶음 단위로 갱신하는 **미니배치 경사하강법**을 쓴다. 평균을 내는 표본이 수십 개면 방향이 충분히 안정되고, 갱신 횟수는 배치 크기로 나눈 만큼 늘어난다.

| 방식 | 한 번에 쓰는 데이터 | 갱신 빈도 | 기울기 안정성 | 실전 사용 |
|---|---|---|---|---|
| Batch GD | 전체 $m$ 개 | 낮음 | 매우 안정 | 소규모 데이터만 |
| SGD | 1개 | 매우 높음 | 요동 심함 | 거의 안 씀 |
| Mini-batch GD | $B$ 개 (32~256) | 높음 | 적당히 안정 | 사실상 표준 |

:::info

**용어**

**Epoch**: 전체 데이터셋을 한 번 훑는 것. 데이터 1,000개에 배치 크기 100이면 1 epoch은 10 iteration이다.

**Batch size**: 한 번의 갱신에 쓰는 샘플 수. 보통 32, 64, 128, 256 중에서 고른다.

**Iteration(step)**: 파라미터를 한 번 갱신하는 단위.

오늘날 "SGD"라고 부르는 것은 거의 전부 미니배치 방식이다. 샘플 하나짜리 순수 SGD는 실무에서 쓰지 않는다.

:::

## 갱신식 자체가 막히는 자리

속도 문제는 미니배치로 풀었다. 하지만 `w - α∇J` 라는 규칙 자체에 남는 한계가 세 가지 있다.

**차원마다 기울기 크기가 다르다.** 손실 지형의 등고선은 대체로 찌그러진 타원이다. 어떤 방향은 가파르고 어떤 방향은 완만한데, 모든 파라미터에 같은 $\alpha$ 를 적용하면 가파른 방향에서는 넘치고 완만한 방향에서는 기어간다. 결과는 좁은 축을 가로지르며 진동하고 긴 축으로는 느리게 전진하는 지그재그 경로다.

**안장점에서 멈춘다.** 파라미터가 수백만 개인 공간에서는 모든 방향으로 위로 휘는 지역 최솟값보다, 어떤 방향으로는 올라가고 어떤 방향으로는 내려가는 안장점이 압도적으로 많다. 안장점 근처에서는 기울기가 0에 가까워져서 갱신량이 거의 0이 된다.

**좋은 학습률이 학습 도중에 바뀐다.** 초반에는 크게 움직여야 하고 후반에는 세밀하게 다듬어야 하는데, 상수 하나로는 두 요구를 동시에 만족시킬 수 없다.

## Momentum, 관성을 더한다

첫 번째 돌파구는 물리에서 왔다. 공이 언덕을 굴러 내려가면 속도가 붙고, 작은 굴곡은 관성으로 넘어간다. 기울기를 그대로 쓰는 대신 기울기의 지수 가중 이동 평균을 속도 $v$ 로 두고, 그 속도로 움직인다.

$$v_t = \beta v_{t-1} + (1 - \beta)\,\nabla J(w_t)$$

$$w_{t+1} = w_t - \alpha\, v_t$$

$\beta$ 는 보통 0.9다. 현재 기울기의 기여는 10%뿐이고 나머지 90%는 과거 방향에서 온다. 이 한 줄이 앞 절의 두 문제를 동시에 건드린다.

좁은 축을 가로지르는 진동은 부호가 매 스텝 뒤집히므로 평균을 내면 서로 상쇄된다. 반대로 골짜기를 따라가는 성분은 부호가 계속 같으니 누적되어 속도가 붙는다. 진동은 줄고 전진은 빨라진다. 안장점에서도 기울기가 0에 가까워질 뿐 $v$ 에 남은 과거 속도가 관성으로 밀어주므로 멈추지 않고 지나간다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 380" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="좁고 긴 타원 등고선 위에서 두 옵티마이저의 이동 경로를 위아래로 비교한 그림. 위쪽 SGD는 좁은 축을 가로지르며 지그재그로 진동하다가 최솟값에 도달하고, 아래쪽 Momentum은 초반 진동이 곧 상쇄되어 골짜기를 따라 매끄럽게 미끄러진다.">
<style>
.op1-box { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.2; }
.op1-ct { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1.4; }
.op1-bad { fill: none; stroke: var(--text-danger, #cb2121); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.op1-good { fill: none; stroke: var(--text-success, #107836); stroke-width: 2.4; stroke-linecap: round; }
.op1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.op1-n { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.op1-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
</style>
<text class="op1-t" x="200" y="24" text-anchor="middle">같은 골짜기, 다른 궤적</text>
<!-- 위 패널: SGD -->
<text class="op1-n" x="30" y="52">위: SGD</text>
<text class="op1-h" x="374" y="52" text-anchor="end">좁은 축으로 진동</text>
<rect class="op1-box" x="30" y="62" width="344" height="120" rx="6"/>
<ellipse class="op1-ct" cx="202" cy="122" rx="170" ry="51"/>
<ellipse class="op1-ct" cx="202" cy="122" rx="113" ry="34"/>
<ellipse class="op1-ct" cx="202" cy="122" rx="57" ry="17"/>
<polyline class="op1-bad" points="50,110 60,136 72,106 86,139 102,104 120,140 138,106 154,137 168,110 180,133 190,115 196,129 200,120 202,123"/>
<circle cx="50" cy="110" r="4.5" fill="var(--accent, #9d5604)"/>
<text class="op1-h" x="50" y="96" text-anchor="middle">시작</text>
<circle cx="202" cy="122" r="4" fill="var(--text, #1c1917)"/>
<text class="op1-h" x="202" y="152" text-anchor="middle">최솟값</text>
<!-- 아래 패널: Momentum -->
<text class="op1-n" x="30" y="212">아래: Momentum</text>
<text class="op1-h" x="374" y="212" text-anchor="end">관성으로 매끄럽게</text>
<rect class="op1-box" x="30" y="222" width="344" height="120" rx="6"/>
<ellipse class="op1-ct" cx="202" cy="282" rx="170" ry="51"/>
<ellipse class="op1-ct" cx="202" cy="282" rx="113" ry="34"/>
<ellipse class="op1-ct" cx="202" cy="282" rx="57" ry="17"/>
<path class="op1-good" d="M 50 270 Q 62 300 84 286 Q 108 272 134 288 Q 164 294 202 282"/>
<circle cx="50" cy="270" r="4.5" fill="var(--accent, #9d5604)"/>
<text class="op1-h" x="50" y="256" text-anchor="middle">시작</text>
<circle cx="202" cy="282" r="4" fill="var(--text, #1c1917)"/>
<!-- 축척 고지 -->
<text class="op1-h" x="200" y="366" text-anchor="middle">등고선 = 같은 손실, 궤적 = 도식</text>
</svg>
</div>

:::warning

**표기법이 두 가지다**

여기서는 지수 가중 이동 평균 형태인 $v_t = \beta v_{t-1} + (1-\beta)\nabla J$ 를 썼지만, 대부분의 교과서와 PyTorch의 `torch.optim.SGD(momentum=0.9)` 는 $(1-\beta)$ 가 없는 $v_t = \beta v_{t-1} + \nabla J$ 를 쓴다. 수렴 거동은 같지만 실질 학습률이 $1/(1-\beta)$ 배, 즉 10배 차이가 난다. 다른 글의 학습률을 그대로 옮겨 쓸 때 이 차이를 확인해야 한다.

:::

**Nesterov 가속 경사(NAG)** 는 여기에 한 가지를 더한다. 현재 위치가 아니라 관성대로 한 발 나아간 자리 $w_t - \alpha\beta v_{t-1}$ 에서 기울기를 구한다. 갈 곳의 경사가 이미 반대로 기울어 있다면 도착하기 전에 제동을 걸 수 있어서 넘침이 줄어든다. PyTorch에서는 `SGD(momentum=0.9, nesterov=True)` 한 줄이다.

## RMSProp, 파라미터마다 보폭을 다르게

Momentum이 기울기의 방향을 손봤다면 RMSProp은 크기를 손본다. 기울기 제곱의 이동 평균을 파라미터마다 따로 들고 다니면서, 그 제곱근으로 보폭을 나눈다.

$$s_t = \beta s_{t-1} + (1 - \beta)\bigl(\nabla J(w_t)\bigr)^2$$

$$w_{t+1} = w_t - \frac{\alpha}{\sqrt{s_t} + \epsilon}\,\nabla J(w_t)$$

$\epsilon$ 은 0으로 나누는 것을 막는 $10^{-8}$ 정도의 상수다. 최근에 크게 흔들린 파라미터는 $\sqrt{s_t}$ 가 커져서 보폭이 줄고, 거의 움직이지 않던 파라미터는 보폭이 커진다. 학습률은 여전히 $\alpha$ 하나지만 각 파라미터가 겪는 실질 학습률은 자기 이력에 맞게 조정된다.

앞서 본 찌그러진 등고선에 대입해 보면 효과가 분명하다. 좁은 축은 기울기가 크니 보폭이 줄어 진동이 잦아들고, 긴 축은 기울기가 작으니 보폭이 커져 전진이 빨라진다. Momentum이 진동을 사후에 상쇄한다면 RMSProp은 애초에 덜 튀게 만든다.

RMSProp은 논문 없이 표준이 된 드문 사례다. Geoffrey Hinton이 2012년 Coursera 강의 슬라이드에서 제안했고, 인용할 때도 미출판으로 표기한다.

## Adam, 두 아이디어를 합친다

**Adam(Adaptive Moment Estimation)** 은 이름 그대로 두 모멘트를 함께 추적한다. 1차 모멘트 $m_t$ 는 Momentum의 속도이고, 2차 모멘트 $v_t$ 는 RMSProp의 기울기 제곱 평균이다.

$$m_t = \beta_1 m_{t-1} + (1 - \beta_1)\,g_t$$

$$v_t = \beta_2 v_{t-1} + (1 - \beta_2)\,g_t^2$$

여기에 Adam만의 처리가 하나 붙는다. $m_0 = v_0 = 0$ 에서 출발하므로 학습 초반의 $m_t$ 와 $v_t$ 는 진짜 평균보다 0쪽으로 끌려 있다. 이 치우침을 나눗셈으로 되돌린다.

$$\hat{m}_t = \frac{m_t}{1 - \beta_1^t}, \qquad \hat{v}_t = \frac{v_t}{1 - \beta_2^t}$$

$$w_{t+1} = w_t - \alpha\,\frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$$

보정이 왜 필요한지는 첫 스텝을 직접 대입하면 보인다. $\beta_1 = 0.9$ 일 때 $m_1 = 0.1\,g_1$ 이라 실제 기울기의 10분의 1밖에 안 된다. $1 - \beta_1^1 = 0.1$ 로 나누면 $\hat{m}_1 = g_1$ 으로 복원된다. $t$ 가 커지면 $\beta_1^t \to 0$ 이므로 분모가 1에 수렴하고 보정은 저절로 사라진다.

편향 보정에는 덤이 하나 붙는다. $t = 1$ 에서 $\hat{m}_1 = g_1$, $\hat{v}_1 = g_1^2$ 이므로 갱신량이 $\alpha\,g_1 / (|g_1| + \epsilon)$ 로 떨어진다. $\epsilon$ 이 $10^{-8}$ 이니 기울기가 100이든 0.001이든 이 값은 부호만 남은 $\pm\alpha$ 와 같다고 봐도 된다. 기울기 크기가 $\epsilon$ 근처까지 내려가야 비로소 보폭이 줄기 시작한다. Adam에서 학습률이 "한 스텝에 파라미터가 움직일 수 있는 최대치"에 가까운 의미를 갖는 이유가 여기에 있다.

| 하이퍼파라미터 | 기본값 | 역할 |
|---|---|---|
| $\alpha$ | 0.001 | 학습률 |
| $\beta_1$ | 0.9 | 1차 모멘트 감쇠율 (Momentum) |
| $\beta_2$ | 0.999 | 2차 모멘트 감쇠율 (RMSProp) |
| $\epsilon$ | $10^{-8}$ | 0으로 나누기 방지 |

$\beta_1$, $\beta_2$, $\epsilon$ 은 기본값을 그대로 두는 것이 보통이다. 실제로 만지는 것은 $\alpha$ 하나다. 갱신식을 NumPy로 옮기면 네 줄이다.

```python
import numpy as np

def adam_step(w, g, m, v, t, lr=0.001, b1=0.9, b2=0.999, eps=1e-8):
    m = b1 * m + (1 - b1) * g
    v = b2 * v + (1 - b2) * g ** 2
    m_hat = m / (1 - b1 ** t)
    v_hat = v / (1 - b2 ** t)
    return w - lr * m_hat / (np.sqrt(v_hat) + eps), m, v
```

## AdamW, weight decay를 떼어낸다

L2 규제는 비용 함수에 $\frac{\lambda}{2}\lVert w \rVert^2$ 를 더하는 것이고, 그 기울기는 $\lambda w$ 다. SGD에서는 이 항이 갱신식에 그대로 더해지므로 L2 규제와 weight decay가 수학적으로 같다.

$$w \leftarrow w - \alpha(\nabla J + \lambda w) = w - \alpha \nabla J - \alpha\lambda w$$

Adam에서는 같지 않다. $\lambda w$ 가 $g_t$ 에 섞여 들어가면 그 값도 $\sqrt{\hat{v}_t}$ 로 나눠지는데, 기울기가 큰 파라미터일수록 분모가 커서 규제가 약해진다. 규제를 가장 세게 받아야 할 파라미터에서 규제가 가장 약해지는 셈이다. 2017년 Loshchilov와 Hutter가 지적한 문제가 이것이다.

**AdamW**의 해법은 단순하다. weight decay를 기울기에서 빼내 갱신식 끝에 따로 붙인다.

$$w_{t+1} = w_t - \alpha\,\frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} - \alpha\lambda w_t$$

적응적 스케일링을 거치지 않으므로 모든 파라미터가 같은 비율로 줄어든다. 차이는 한 항의 위치뿐이지만 원 논문의 이미지 분류 실험에서 일반화 성능이 나아졌고, 지금은 트랜스포머 계열의 기본값이 AdamW다.

## 학습률은 고정하지 않는다

어떤 옵티마이저를 쓰든 $\alpha$ 를 처음부터 끝까지 붙박아 두는 것은 손해다. 가장 단순한 방식은 **step decay**로, 정해진 에폭마다 학습률에 일정 비율을 곱해 계단식으로 낮춘다. 30 에폭마다 10분의 1로 줄이는 식이다.

**Cosine annealing**은 계단 대신 코사인 곡선을 따라 부드럽게 낮춘다. 급격한 변화 없이 후반으로 갈수록 보폭이 줄어든다.

**Warmup**은 방향이 반대다. 학습 첫 구간에서 학습률을 0에서 목표치까지 선형으로 올린다. 초기 파라미터는 무작위라 손실 지형의 어디에 있는지 알 수 없고, 이 상태에서 큰 보폭으로 출발하면 엉뚱한 방향으로 크게 밀려나 회복이 어렵다. LayerNorm과 어텐션이 얽힌 트랜스포머에서 특히 두드러진다.

둘을 이어 붙인 warmup + cosine이 대형 모델의 표준 스케줄이다. 보통 전체 스텝의 5~10%를 warmup에 할당한다.

```python
import math

def warmup_cosine(step, total_steps, warmup_steps, max_lr=0.001):
    if step < warmup_steps:
        return max_lr * step / warmup_steps
    progress = (step - warmup_steps) / (total_steps - warmup_steps)
    return max_lr * 0.5 * (1 + math.cos(math.pi * progress))
```

## 전체 비교

| 옵티마이저 | 핵심 아이디어 | 얻는 것 | 치르는 비용 |
|---|---|---|---|
| SGD | 기울기 그대로 | 단순함 | 진동, 안장점에서 정체 |
| SGD + Momentum | 기울기의 이동 평균 | 진동 상쇄, 가속 | $\beta$ 가 하나 더 |
| NAG | Momentum + 앞자리 기울기 | 넘침 감소 | 구현이 조금 복잡 |
| RMSProp | 파라미터별 적응적 보폭 | 비균일 기울기 처리 | 방향은 개선 안 됨 |
| Adam | Momentum + RMSProp | 튜닝 부담이 가장 작음 | L2 규제와 궁합이 나쁨 |
| AdamW | Adam + 분리된 weight decay | 일반화 성능 개선 | 없음 |

## 무엇부터 시도할까

확신이 없으면 Adam을 학습률 0.001로 시작한다. 규제가 필요하면 AdamW로 바꾼다. 대부분의 문제에서 이 조합이 무난한 출발점이 된다.

다만 Adam이 항상 최선은 아니다. CNN 기반 이미지 분류에서는 SGD + Momentum(학습률 0.1, $\beta = 0.9$)에 step decay를 얹은 조합이 Adam보다 나은 일반화 성능을 내는 경우가 많다. ResNet 원 논문이 정확히 이 설정으로 학습하고, 오차가 정체될 때마다 학습률을 10분의 1로 줄인다. 대신 학습률 스케줄을 직접 설계해야 한다.

BERT, GPT 계열의 파인튜닝은 AdamW + warmup + cosine이 사실상 정해진 답이다.

```python
optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=5e-5,
    betas=(0.9, 0.999),
    weight_decay=0.01,
)

scheduler = torch.optim.lr_scheduler.OneCycleLR(
    optimizer,
    max_lr=5e-5,
    total_steps=total_steps,
    pct_start=0.1,          # 앞 10%를 warmup으로
    anneal_strategy='cos',
)
```

## 마치며

옵티마이저는 역전파가 계산해 준 기울기를 어떤 규칙으로 파라미터에 반영할 것인가의 문제다. 기울기 자체를 더 정확하게 만드는 일과는 무관하다. 같은 기울기를 놓고 그대로 쓸지, 과거와 평균 낼지, 크기로 나눌지를 정하는 것뿐이다.

그 선택은 두 축으로 갈렸다. 방향을 다듬는 축에서 Momentum이 나왔고, 크기를 다듬는 축에서 RMSProp이 나왔다. Adam은 두 축을 한 식에 합치고 초기 편향만 따로 보정했다. AdamW는 거기서 규제 항 하나를 분모 밖으로 꺼냈다. 이후의 변형들도 대체로 이 두 축 위 어딘가에 있다.

학습률 스케줄은 옵티마이저와 별개의 축이다. 어떤 옵티마이저를 고르든 $\alpha$ 를 시간에 따라 어떻게 움직일지는 따로 정해야 하고, 실무에서 성능 차이를 가르는 것은 옵티마이저 선택보다 이쪽인 경우가 적지 않다.

옵티마이저와 학습률을 정했다고 학습이 보장되지는 않는다. 초기 가중치의 크기가 어긋나면 첫 스텝부터 기울기가 폭발하거나 사라지고, 층이 깊어질수록 입력 분포가 흔들려 학습이 느려진다.

## 함께 보면 좋은 글

- [경사하강법](/ml/gradient-descent/) : 이 글의 모든 갱신식이 출발한 기본형
- [역전파](/ml/backpropagation/) : 옵티마이저가 받아 쓰는 기울기를 만드는 과정
- [신경망 학습 안정화](/ml/neural-network-tips/) : 초기화와 정규화로 학습을 무너지지 않게 만드는 법
- [규제](/ml/regularization/) : AdamW가 다루려 한 L2 규제의 원리

## 참고자료

- [Kingma & Ba, Adam: A Method for Stochastic Optimization (2014)](https://arxiv.org/abs/1412.6980)
- [Loshchilov & Hutter, Decoupled Weight Decay Regularization (AdamW, 2017)](https://arxiv.org/abs/1711.05101)
- [Tieleman & Hinton, CSC321 Lecture 6 Slides (RMSProp, 미출판)](https://www.cs.toronto.edu/~tijmen/csc321/slides/lecture_slides_lec6.pdf)
- [Sutskever et al., On the Importance of Initialization and Momentum in Deep Learning (ICML 2013)](https://proceedings.mlr.press/v28/sutskever13.html)
- [Loshchilov & Hutter, SGDR: Stochastic Gradient Descent with Warm Restarts (2016)](https://arxiv.org/abs/1608.03983)
