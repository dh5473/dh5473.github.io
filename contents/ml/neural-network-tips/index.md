---
date: '2026-01-24'
title: '신경망 학습을 안정시키는 가중치 초기화와 BatchNorm, Dropout'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 24
tags: ['Dropout', 'Batch Normalization', 'Weight Initialization', 'Xavier', 'He 초기화', '신경망', '과적합', '머신러닝']
summary: '초기 가중치의 분산이 층마다 신호를 키우거나 죽이는 원리, BatchNorm이 입력 분포를 고정하는 방식, Dropout이 앙상블을 흉내 내는 구조를 정리한다.'
thumbnail: './thumbnail.png'
---

구조를 설계하고 순전파와 역전파를 구현하고 옵티마이저까지 붙였는데 학습이 안 되는 일은 흔하다. 손실이 처음부터 꿈쩍하지 않거나, 잘 줄다가 갑자기 `NaN`이 되거나, 훈련 손실만 내려가고 검증 손실은 올라간다.

이론이 틀려서가 아니다. 수만에서 수백만 개의 파라미터를 동시에 움직이는 시스템에서는 **어디서 출발하는가**, **층 사이 신호의 크기가 유지되는가**, **훈련 데이터를 외워버리지 않는가**가 각각 독립된 문제로 나타난다. 가중치 초기화와 Batch Normalization, Dropout이 이 셋에 하나씩 대응한다.

## 가중치를 어떤 크기로 시작할 것인가

모든 가중치를 0으로 두면 학습이 시작조차 되지 않는다. 같은 층의 뉴런이 전부 같은 입력에 같은 가중치를 곱하니 출력이 같고, 역전파로 돌아오는 기울기도 같아서 갱신 후에도 여전히 같다. 뉴런 100개를 넣어도 하나짜리 층과 다를 바 없다. 이것을 **대칭성 문제(symmetry breaking problem)** 라 한다.

그래서 무작위로 초기화하는데, 이번에는 그 값의 **크기**가 문제가 된다. 왜 그런지는 층 하나를 지날 때 신호의 크기가 얼마나 변하는지 계산해 보면 나온다. 활성값 $a$ 에 가중치를 곱한 $z = Wa$ 에서, $W$ 의 각 원소가 평균 0에 분산 $\sigma^2$ 이고 입력 뉴런이 $n$ 개라면

$$\mathrm{Var}(z) = n\,\sigma^2\,\mathbb{E}[a^2]$$

이다. 여기에 ReLU를 통과시키면 음수 쪽 절반이 0으로 잘리므로 제곱 평균이 반으로 준다.

$$\mathbb{E}\bigl[\mathrm{ReLU}(z)^2\bigr] = \tfrac{1}{2}\mathrm{Var}(z)$$

두 식을 이으면 층을 하나 지날 때마다 신호의 크기에 $\dfrac{n\sigma^2}{2}$ 가 곱해진다는 결론이 나온다. 이 배율이 1보다 크면 층을 쌓을수록 활성값이 폭발해 손실이 `NaN`이 되고, 1보다 작으면 0으로 수렴해 앞쪽 층에 아무 신호도 닿지 않는다. **좋은 초기화란 이 배율을 1로 맞추는 초기화다.**

여기서 두 방법이 나온다. 2010년 Xavier Glorot가 제안한 **Xavier 초기화**는 활성화 함수가 원점 근처에서 거의 선형이라고 가정하고 순전파와 역전파 양쪽에서 분산이 유지되도록 절충한다.

$$\sigma^2 = \frac{1}{n_{in}} \;(\text{순전파 기준}), \qquad \sigma^2 = \frac{2}{n_{in} + n_{out}} \;(\text{절충안})$$

$n_{in}$ 은 그 층에 들어오는 뉴런 수, $n_{out}$ 은 나가는 뉴런 수다. 순전파에서 분산을 유지하려면 $1/n_{in}$ 이 맞고 역전파 기준으로는 $1/n_{out}$ 이 맞는데, 세 번째 식은 두 값의 조화평균이다.

시그모이드와 tanh는 입력이 0 근처일 때 기울기가 거의 일정해서 이 선형 가정이 성립한다. 하지만 ReLU에는 맞지 않는다. 위에서 본 $\frac{1}{2}$ 배 손실을 계산에 넣지 않았기 때문이다. 2015년 Kaiming He가 그 절반을 보상하는 값을 제시했다.

$$\sigma^2 = \frac{2}{n_{in}}$$

이 값을 배율식에 넣으면 $\frac{n \cdot (2/n)}{2} = 1$ 로 정확히 떨어진다. 폭이 256인 층 10개를 실제로 통과시켜 보면 차이가 분명하다.

| 초기화 | 층당 배율 | 10층 통과 후 신호 크기 |
|---|---|---|
| 표준편차 0.01 고정 | 0.0128 | 약 $10^{-19}$ |
| Xavier ($\sigma^2 = 1/n$) | 0.5 | 약 0.001 |
| He ($\sigma^2 = 2/n$) | 1.0 | 약 1.0 |

ReLU 계열에는 He, 시그모이드와 tanh에는 Xavier가 기본이다. 현대 신경망은 대부분 ReLU 계열을 쓰므로 실질적으로는 He가 기본값이다. PyTorch에서는 `nn.init.kaiming_normal_(w, nonlinearity='relu')` 한 줄이다.

깊은 망에서 기울기가 사라지는 문제는 활성화 함수의 도함수가 층마다 곱해지면서 생기는데, 초기화는 그중 가중치 쪽 몫을 담당한다. 배율을 1로 맞춰 두면 신호와 기울기가 층을 건너면서 줄어드는 속도가 크게 느려진다. 다만 활성화 함수 자체의 포화까지 없애 주지는 않는다.

## Batch Normalization

초기화를 잘 맞춰도 학습이 시작되면 가중치가 매 스텝 바뀐다. 그러면 다음 층이 받는 입력의 분포도 함께 움직인다. 두 번째 층 입장에서는 자기가 방금 학습한 규칙의 전제가 매번 달라지는 셈이다. 이 현상을 **Internal Covariate Shift**라 부른다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 352" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="어떤 층이 받는 입력 분포를 세 스텝에 걸쳐 막대로 나타낸 그림. 위쪽은 BatchNorm이 없을 때로 막대의 위치와 폭이 스텝마다 달라지고, 아래쪽은 BatchNorm을 적용해 세 막대가 모두 평균 0 분산 1의 같은 자리에 겹친다.">
<style>
.nt2-bad { fill: var(--bg-warn, #fffbeb); stroke: var(--text-warn, #9d5604); stroke-width: 1.5; }
.nt2-good { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
.nt2-tick { stroke: var(--text, #1c1917); stroke-width: 2; }
.nt2-zero { stroke: var(--text-muted, #6d6762); stroke-width: 1; stroke-dasharray: 4 3; }
.nt2-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.nt2-n { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.nt2-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
</style>
<text class="nt2-t" x="200" y="24" text-anchor="middle">층 입력 분포의 이동과 고정</text>
<!-- 위: BatchNorm 없음 -->
<text class="nt2-n" x="30" y="52">위: BatchNorm 없음</text>
<text class="nt2-h" x="370" y="52" text-anchor="end">평균·분산이 흔들림</text>
<path class="nt2-zero" d="M 230 68 L 230 152"/>
<text class="nt2-h" x="84" y="89" text-anchor="end">스텝 1</text>
<rect class="nt2-bad" x="188" y="76" width="131" height="16" rx="4"/>
<path class="nt2-tick" d="M 253 76 L 253 92"/>
<text class="nt2-h" x="84" y="117" text-anchor="end">스텝 2</text>
<rect class="nt2-bad" x="148" y="104" width="52" height="16" rx="4"/>
<path class="nt2-tick" d="M 174 104 L 174 120"/>
<text class="nt2-h" x="84" y="145" text-anchor="end">스텝 3</text>
<rect class="nt2-bad" x="272" y="132" width="84" height="16" rx="4"/>
<path class="nt2-tick" d="M 314 132 L 314 148"/>
<text class="nt2-h" x="230" y="168" text-anchor="middle">0</text>
<!-- 아래: BatchNorm 적용 -->
<text class="nt2-n" x="30" y="196">아래: BatchNorm 적용</text>
<text class="nt2-h" x="370" y="196" text-anchor="end">평균 0, 분산 1</text>
<path class="nt2-zero" d="M 230 212 L 230 296"/>
<text class="nt2-h" x="84" y="233" text-anchor="end">스텝 1</text>
<rect class="nt2-good" x="183" y="220" width="94" height="16" rx="4"/>
<path class="nt2-tick" d="M 230 220 L 230 236"/>
<text class="nt2-h" x="84" y="261" text-anchor="end">스텝 2</text>
<rect class="nt2-good" x="183" y="248" width="94" height="16" rx="4"/>
<path class="nt2-tick" d="M 230 248 L 230 264"/>
<text class="nt2-h" x="84" y="289" text-anchor="end">스텝 3</text>
<rect class="nt2-good" x="183" y="276" width="94" height="16" rx="4"/>
<path class="nt2-tick" d="M 230 276 L 230 292"/>
<text class="nt2-h" x="230" y="312" text-anchor="middle">0</text>
<!-- 범례 -->
<text class="nt2-h" x="200" y="338" text-anchor="middle">막대 = 평균 ± 표준편차</text>
</svg>
</div>

2015년 Ioffe와 Szegedy가 내놓은 해법이 **Batch Normalization**이다. 각 층의 입력을 미니배치 단위로 평균 0, 분산 1에 맞춘다. 미니배치 $B = \{x_1, \dots, x_m\}$ 에 대해

$$\mu_B = \frac{1}{m}\sum_i x_i, \qquad \sigma_B^2 = \frac{1}{m}\sum_i (x_i - \mu_B)^2$$

$$\hat{x}_i = \frac{x_i - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}, \qquad y_i = \gamma\,\hat{x}_i + \beta$$

마지막 줄이 핵심이다. 정규화만 하고 끝내면 모든 층의 입력이 0 근처에 몰려 활성화 함수의 비선형 구간을 제대로 쓰지 못한다. $\gamma$ 와 $\beta$ 는 학습되는 파라미터로, 극단적으로는 $\gamma = \sigma_B$, $\beta = \mu_B$ 를 학습해 정규화를 통째로 되돌릴 수도 있다. 정규화가 도움이 되는 층에서는 남겨 두고 방해가 되는 층에서는 걷어내는 결정을 망이 직접 하게 만든 장치다.

BatchNorm의 효과가 정말 Internal Covariate Shift 때문인지는 논쟁이 있다. Santurkar 등이 2018년에 낸 반론은 실제 기여가 손실 지형을 매끄럽게 펴서 더 큰 학습률을 견디게 만드는 데 있다고 본다. 원리에 대한 설명은 갈리지만, 학습이 빨라지고 초기값에 덜 민감해지며 미니배치 통계의 잡음이 약한 규제로 작용한다는 관찰 자체는 흔들리지 않았다.

넣는 자리는 보통 선형 변환과 활성화 함수 사이다.

```python
z = linear(x)            # W @ x + b
z_norm = batch_norm(z)
a = relu(z_norm)
```

원 논문이 제안한 순서가 이것이고, 활성화 함수 뒤에 넣어도 잘 된다는 보고도 많다. 둘 다 시도해 보고 고르는 것이 실무의 답이다.

한 가지 더 처리할 것이 있다. 학습 때는 미니배치의 통계를 쓰지만 추론 때는 입력이 하나뿐일 수 있어서 배치 통계를 구할 수 없다. 그래서 학습 중에 평균과 분산의 이동 평균을 따로 기록해 두고 추론 때 그 값을 쓴다. PyTorch에서 `model.train()`과 `model.eval()`을 반드시 구분해야 하는 이유가 여기에 있다.

:::warning

**PyTorch의 `momentum`은 반대로 읽힌다**

`nn.BatchNorm1d(momentum=0.1)` 의 0.1은 과거 통계를 얼마나 유지할지가 아니라 **새 배치 통계에 주는 가중치**다. 갱신식은 $\hat{x}_{new} = (1-\text{momentum})\,\hat{x} + \text{momentum}\cdot x_t$ 이다. 옵티마이저의 momentum과 방향이 반대라 값을 그대로 옮기면 의도한 것과 정반대의 이동 평균이 된다.

:::

BatchNorm은 미니배치 차원으로, 즉 같은 뉴런의 값을 여러 샘플에 걸쳐 정규화한다. 그래서 배치 크기가 작으면 통계가 부정확해진다. **Layer Normalization**은 축을 바꿔 같은 샘플의 값을 여러 뉴런에 걸쳐 정규화하므로 배치 크기와 무관하다. 시퀀스 길이가 들쭉날쭉하고 배치가 작아지기 쉬운 트랜스포머에서 LayerNorm이 표준인 이유다. CNN에서는 여전히 BatchNorm이 주로 쓰인다.

## Dropout

앞의 두 기법이 학습을 되게 만드는 쪽이라면, Dropout은 너무 잘 되는 것을 막는 쪽이다. 파라미터가 수십만 개인 망은 훈련 데이터를 통째로 외울 여력이 있고, 그러면 검증 성능이 무너진다.

방법은 단순하다. 학습 중 각 층에서 뉴런을 확률 $p$ 로 꺼버린다. 꺼진 뉴런은 그 스텝의 순전파와 역전파 양쪽에서 없는 것으로 친다. 매 스텝마다 꺼지는 뉴런이 달라진다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 400" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 신경망을 위아래로 두 번 그린 그림. 위쪽은 은닉층 뉴런 다섯 개가 모두 연결된 상태이고, 아래쪽은 그중 두 개가 점선 테두리에 엑스 표시로 꺼져 있으며 그 뉴런에 붙은 연결선도 함께 사라져 있다.">
<style>
.nt1-node { fill: var(--bg-subtle, #f5f4f2); stroke: var(--primary, #0a756c); stroke-width: 1.8; }
.nt1-off { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.6; stroke-dasharray: 3 2.5; }
.nt1-x { stroke: var(--text-danger, #cb2121); stroke-width: 2; stroke-linecap: round; }
.nt1-edge { stroke: var(--border, #e7e5e4); stroke-width: 1; fill: none; }
.nt1-t { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
.nt1-n { fill: var(--text, #1c1917); font-size: 15px; font-weight: 600; }
.nt1-h { fill: var(--text-muted, #6d6762); font-size: 14px; }
</style>
<text class="nt1-t" x="200" y="24" text-anchor="middle">Dropout이 만드는 서브 네트워크</text>
<!-- 위: 모든 뉴런 활성 -->
<text class="nt1-n" x="30" y="46">위: 모든 뉴런 활성</text>
<text class="nt1-h" x="370" y="46" text-anchor="end">은닉 5개 사용</text>
<g class="nt1-edge">
<path d="M 89 80 L 191 60"/><path d="M 89 80 L 191 90"/><path d="M 89 80 L 191 120"/><path d="M 89 80 L 191 150"/><path d="M 89 80 L 191 180"/>
<path d="M 89 120 L 191 60"/><path d="M 89 120 L 191 90"/><path d="M 89 120 L 191 120"/><path d="M 89 120 L 191 150"/><path d="M 89 120 L 191 180"/>
<path d="M 89 160 L 191 60"/><path d="M 89 160 L 191 90"/><path d="M 89 160 L 191 120"/><path d="M 89 160 L 191 150"/><path d="M 89 160 L 191 180"/>
<path d="M 209 60 L 311 105"/><path d="M 209 60 L 311 135"/>
<path d="M 209 90 L 311 105"/><path d="M 209 90 L 311 135"/>
<path d="M 209 120 L 311 105"/><path d="M 209 120 L 311 135"/>
<path d="M 209 150 L 311 105"/><path d="M 209 150 L 311 135"/>
<path d="M 209 180 L 311 105"/><path d="M 209 180 L 311 135"/>
</g>
<circle class="nt1-node" cx="80" cy="80" r="9"/>
<circle class="nt1-node" cx="80" cy="120" r="9"/>
<circle class="nt1-node" cx="80" cy="160" r="9"/>
<circle class="nt1-node" cx="200" cy="60" r="9"/>
<circle class="nt1-node" cx="200" cy="90" r="9"/>
<circle class="nt1-node" cx="200" cy="120" r="9"/>
<circle class="nt1-node" cx="200" cy="150" r="9"/>
<circle class="nt1-node" cx="200" cy="180" r="9"/>
<circle class="nt1-node" cx="320" cy="105" r="9"/>
<circle class="nt1-node" cx="320" cy="135" r="9"/>
<!-- 아래: Dropout 적용 -->
<text class="nt1-n" x="30" y="228">아래: Dropout (p = 0.4)</text>
<text class="nt1-h" x="370" y="228" text-anchor="end">은닉 2개 차단</text>
<g class="nt1-edge">
<path d="M 89 262 L 191 242"/><path d="M 89 262 L 191 302"/><path d="M 89 262 L 191 362"/>
<path d="M 89 302 L 191 242"/><path d="M 89 302 L 191 302"/><path d="M 89 302 L 191 362"/>
<path d="M 89 342 L 191 242"/><path d="M 89 342 L 191 302"/><path d="M 89 342 L 191 362"/>
<path d="M 209 242 L 311 287"/><path d="M 209 242 L 311 317"/>
<path d="M 209 302 L 311 287"/><path d="M 209 302 L 311 317"/>
<path d="M 209 362 L 311 287"/><path d="M 209 362 L 311 317"/>
</g>
<circle class="nt1-node" cx="80" cy="262" r="9"/>
<circle class="nt1-node" cx="80" cy="302" r="9"/>
<circle class="nt1-node" cx="80" cy="342" r="9"/>
<circle class="nt1-node" cx="200" cy="242" r="9"/>
<circle class="nt1-off" cx="200" cy="272" r="9"/>
<path class="nt1-x" d="M 194 266 L 206 278 M 206 266 L 194 278"/>
<circle class="nt1-node" cx="200" cy="302" r="9"/>
<circle class="nt1-off" cx="200" cy="332" r="9"/>
<path class="nt1-x" d="M 194 326 L 206 338 M 206 326 L 194 338"/>
<circle class="nt1-node" cx="200" cy="362" r="9"/>
<circle class="nt1-node" cx="320" cy="287" r="9"/>
<circle class="nt1-node" cx="320" cy="317" r="9"/>
<!-- 층 이름 -->
<text class="nt1-h" x="80" y="390" text-anchor="middle">입력</text>
<text class="nt1-h" x="200" y="390" text-anchor="middle">은닉</text>
<text class="nt1-h" x="320" y="390" text-anchor="middle">출력</text>
</svg>
</div>

매 스텝 다른 부분망으로 학습하는 셈이라, 뉴런이 $n$ 개면 최대 $2^n$ 개의 서로 다른 부분망이 존재한다. 학습이 끝나고 모든 뉴런을 켜면 그 부분망들을 평균 낸 것과 비슷하게 동작한다. 규제 효과의 다른 설명은 의존 구조 쪽이다. 어떤 뉴런이든 언제든 사라질 수 있으므로, 망은 특정 뉴런 하나에 판단을 몰아주지 못하고 여러 뉴런에 정보를 나눠 갖는 방향으로 학습한다.

여기서 스케일을 맞춰야 한다. 학습 때는 뉴런의 $(1-p)$ 만 살아 있는데 추론 때는 전부 켜지므로 다음 층이 받는 값의 크기가 달라진다. **Inverted Dropout**은 학습 때 살아남은 값을 $\frac{1}{1-p}$ 배로 키워 기댓값을 맞춘다. 그러면 추론 때는 아무것도 하지 않아도 된다.

```python
def dropout_forward(x, p=0.5, training=True):
    if not training:
        return x
    mask = (np.random.rand(*x.shape) > p).astype(float)
    return x * mask / (1 - p)
```

비율은 은닉층 기준 0.2에서 0.5 사이에서 고른다. $p = 0.5$ 가 가장 다양한 부분망 조합을 만들지만 그만큼 학습이 느려져서, 실무에서는 0.2에서 0.3 정도가 무난하다. 입력층에는 거의 쓰지 않고 출력층에는 쓰지 않는다. 과적합이 심하면 올리고, 훈련 손실조차 안 내려가면 낮추거나 뺀다.

:::warning

**추론 때는 반드시 꺼야 한다**

Dropout과 BatchNorm은 학습과 추론에서 동작이 달라지는 대표적인 두 층이다. PyTorch에서 `model.eval()`을 빠뜨리면 Dropout이 계속 켜져 같은 입력에 매번 다른 예측이 나오고, BatchNorm은 배치 통계를 계속 갱신해 저장된 이동 평균까지 오염시킨다.

:::

## 과적합을 늦추는 나머지 두 장치

신경망에서 모델 복잡도 노릇을 하는 것이 학습 에폭 수다. 오래 돌릴수록 훈련 손실은 계속 내려가지만 검증 손실은 어느 시점부터 올라간다. **Early Stopping**은 검증 손실이 개선되지 않는 상태가 일정 에폭 이어지면 학습을 멈추고, 가장 좋았던 시점의 가중치로 되돌린다.

```python
best_val, patience, wait = float('inf'), 10, 0

for epoch in range(max_epochs):
    train_one_epoch(model, train_loader)
    val_loss = evaluate(model, val_loader)

    if val_loss < best_val:
        best_val, wait = val_loss, 0
        best_weights = copy.deepcopy(model.state_dict())
    else:
        wait += 1
        if wait >= patience:
            model.load_state_dict(best_weights)
            break
```

관건은 `patience`다. 검증 손실은 잡음 때문에 일시적으로 올라갔다 내려온다. 너무 작으면 아직 학습 중인 모델을 잘라내고, 너무 크면 이미 과적합된 뒤에야 멈춘다. 보통 5에서 20 사이로 둔다.

과적합의 가장 근본적인 해법은 데이터를 더 모으는 것인데 대개 비싸다. **Data Augmentation**은 기존 데이터를 변형해 새 샘플을 만들어 그 비용을 우회한다. 이미지라면 좌우 반전, 소각도 회전, 랜덤 크롭, 색상 변형이 표준 조합이다.

```python
train_transform = transforms.Compose([
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomRotation(15),
    transforms.RandomCrop(224, padding=16),
    transforms.ColorJitter(brightness=0.2, contrast=0.2),
    transforms.ToTensor(),
])
```

텍스트에서는 동의어 치환, 한국어를 영어로 옮겼다 되돌리는 역번역, 무작위 삽입과 삭제를 쓴다. 어느 쪽이든 원본의 의미가 보존되는 변형만 골라야 한다. 고양이 사진은 좌우로 뒤집어도 고양이지만 숫자 6은 상하로 뒤집으면 9가 된다.

## 하나로 합치면

세 기법을 층 하나에 배치하는 표준 순서는 이렇다.

```python
class StableNet(nn.Module):
    def __init__(self, in_dim, hidden, out_dim, p=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(),
            nn.Dropout(p),

            nn.Linear(hidden, hidden // 2),
            nn.BatchNorm1d(hidden // 2),
            nn.ReLU(),
            nn.Dropout(p),

            nn.Linear(hidden // 2, out_dim),   # 출력층에는 둘 다 없음
        )
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
                nn.init.zeros_(m.bias)

    def forward(self, x):
        return self.net(x)
```

출력층에 BatchNorm과 Dropout을 붙이지 않는 것이 중요하다. 출력층의 값은 그대로 손실 함수에 들어가야 하는데, 여기서 분포를 건드리거나 일부를 꺼버리면 예측 자체가 망가진다.

## 학습이 안 될 때 어디를 보나

| 증상 | 먼저 의심할 것 | 조치 |
|---|---|---|
| 손실이 처음부터 안 줄어든다 | 학습률, 입력 정규화 | 학습률을 10배씩 위아래로 흔들고, 입력이 평균 0 분산 1인지 확인 |
| 손실이 `NaN`이 된다 | 기울기 폭발 | 학습률을 낮추고, `clip_grad_norm_(params, 1.0)` 적용, He 초기화 확인 |
| 훈련은 좋은데 검증이 나쁘다 | 과적합 | Dropout 비율 상향, Data Augmentation, weight decay 강화, 모델 축소 |
| 훈련도 검증도 나쁘다 | 과소적합 | 모델 확대, 에폭 증가, Dropout 축소 또는 제거, 특성 재검토 |

:::tip

**순서를 지키면 원인이 좁혀진다**

먼저 샘플 100개짜리 부분 데이터로 과적합이 되는지 본다. 여기서 훈련 손실이 0 근처까지 내려가지 않으면 규제가 아니라 모델이나 구현에 문제가 있다는 뜻이다. 과적합이 확인되면 그때 전체 데이터로 옮기고 규제를 하나씩 얹는다. 학습률은 0.1, 0.01, 0.001처럼 로그 간격으로 탐색한다.

:::

## 마치며

세 기법은 서로 다른 시점의 문제를 맡는다. 가중치 초기화는 학습이 시작되기 전에 층 사이 신호의 배율을 1로 맞춰 첫 스텝부터 기울기가 살아 있게 만든다. Batch Normalization은 학습이 진행되는 동안 그 배율이 다시 어긋나는 것을 매 스텝 되돌린다. Dropout은 학습이 잘 된 다음에 오는 문제, 즉 훈련 데이터를 외워버리는 상황을 막는다.

그래서 셋 중 하나가 다른 하나를 대신하지 못한다. BatchNorm을 넣었다고 초기화를 아무렇게나 해도 되는 것은 아니고, Dropout을 세게 걸었다고 학습이 안 되던 망이 학습되지도 않는다. 증상을 먼저 특정하고 그에 맞는 도구를 꺼내는 편이, 셋을 한꺼번에 넣고 어느 것이 효과가 있었는지 모르는 것보다 낫다.

그리고 이 모든 조정은 결국 검증 지표로 판정된다. 정확도 하나만 보면 판단을 그르치기 쉬운 상황이 생각보다 많다.

## 함께 보면 좋은 글

- [활성화 함수](/ml/activation-functions/) : 초기화가 상대해야 하는 기울기 소실의 다른 절반
- [옵티마이저](/ml/optimizers/) : 초기화 이후 기울기를 어떤 규칙으로 반영할지의 문제
- [규제](/ml/regularization/) : Dropout과 목적이 같은 파라미터 크기 제약
- [편향-분산 트레이드오프](/ml/bias-variance/) : 과적합과 과소적합을 가르는 기준
