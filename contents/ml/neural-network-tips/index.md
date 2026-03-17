---
date: '2026-01-24'
title: '신경망 학습 안정화: Dropout, Batch Normalization, 가중치 초기화'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 24
tags: ['Dropout', 'Batch Normalization', 'Weight Initialization', '신경망', '과적합', '머신러닝']
summary: '신경망 학습을 안정적으로 만드는 세 가지 핵심 기법. Xavier/He 초기화, Batch Normalization, Dropout의 원리와 실전 적용법.'
thumbnail: './thumbnail.png'
---

신경망의 구조([퍼셉트론과 MLP](/ml/neural-network-basics/)), 예측([순전파](/ml/forward-propagation/)), 학습([역전파](/ml/backpropagation/)), 비선형성([활성화 함수](/ml/activation-functions/)), 최적화([옵티마이저](/ml/optimizers/))까지 모두 배웠다. 이론적으로 완벽하다. 그런데 실제로 신경망을 학습시키면... 잘 안 된다. Loss가 줄지 않거나, 줄다가 갑자기 발산하거나, 훈련은 잘 되는데 테스트에서 무너진다.

이건 이론이 틀려서가 아니다. 신경망은 수만~수백만 개의 파라미터를 동시에 최적화해야 하는 시스템이라, **초기 조건**, **학습 중 내부 분포 변화**, **과적합** 같은 실전 문제가 끊임없이 발생한다. 이번 글에서 다루는 세 가지 기법 -- 가중치 초기화, Batch Normalization, Dropout -- 은 이 문제들을 정면으로 해결한다. 여기에 Early Stopping과 Data Augmentation까지 더하면, 신경망 학습의 실전 도구상자가 완성된다.

---

## 1. 가중치 초기화 (Weight Initialization)

### 왜 초기값이 중요한가

[역전파](/ml/backpropagation/)에서 배웠듯이, 신경망 학습은 그래디언트를 체인 룰로 전파하면서 가중치를 업데이트한다. 이때 **초기 가중치**가 어떤 값이냐에 따라 학습의 성패가 갈린다.

### 제로 초기화: 대칭성 문제

모든 가중치를 0으로 초기화하면 어떻게 될까?

```python
# 모든 가중치를 0으로
W1 = np.zeros((input_dim, hidden_dim))
W2 = np.zeros((hidden_dim, output_dim))
```

같은 층의 모든 뉴런이 동일한 입력을 받고, 동일한 가중치를 가지므로, **동일한 출력**을 낸다. 역전파 때도 동일한 그래디언트를 받아 동일하게 업데이트된다. 100개의 뉴런을 넣어도 실질적으로 1개와 같다. 이걸 **대칭성 문제(Symmetry Breaking Problem)** 라고 한다.

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>핵심</strong>: 가중치를 0으로 초기화하면 모든 뉴런이 같은 것을 학습한다. 여러 뉴런을 두는 의미가 사라진다. 반드시 <strong>서로 다른 값</strong>으로 초기화해야 한다.
</div>

### 랜덤 초기화: 크기가 문제다

그러면 랜덤으로 초기화하면 될까? 대칭성은 깨지지만, **값의 크기**가 문제다.

```
너무 큰 초기값 (예: W ~ N(0, 1), 뉴런 수가 많을 때)
→ 순전파: 활성값이 층마다 기하급수적으로 커짐
→ 역전파: 그래디언트도 기하급수적으로 커짐
→ 가중치 폭발 (Exploding Gradients) → Loss = NaN

너무 작은 초기값 (예: W ~ N(0, 0.001))
→ 순전파: 활성값이 층마다 0에 수렴
→ 역전파: 그래디언트도 0에 수렴
→ 가중치 소실 (Vanishing Gradients) → 학습 정지
```

핵심은 **각 층의 출력 분산을 일정하게 유지**하는 것이다. 입력의 분산이 1이면, 출력의 분산도 1에 가깝게 만들어야 층을 깊이 쌓아도 신호가 살아남는다.

### Xavier/Glorot 초기화: Sigmoid, Tanh용

2010년 Xavier Glorot가 제안한 방법이다. 선형 활성화 함수를 가정하고, 순전파와 역전파 모두에서 분산이 유지되도록 설계했다.

```
Xavier 초기화:

W ~ N(0, 1/n_in)         ← 순전파 기준
W ~ N(0, 1/n_out)        ← 역전파 기준
W ~ N(0, 2/(n_in + n_out))  ← 절충안 (가장 많이 사용)

n_in  = 이전 층의 뉴런 수
n_out = 현재 층의 뉴런 수
```

**왜 이렇게 되는가?** 선형 층의 출력 z = W * x에서, x의 각 요소가 평균 0, 분산 1이고 W의 각 요소가 평균 0, 분산 sigma^2라면:

```
Var(z) = n_in * sigma^2

Var(z) = 1이 되려면 sigma^2 = 1/n_in
```

Xavier 초기화는 **Sigmoid, Tanh** 같은 S자 활성화 함수에서 잘 작동한다. 이 함수들은 입력이 0 근처일 때 거의 선형이라, Xavier의 선형 가정이 성립하기 때문이다.

### He 초기화: ReLU용

2015년 Kaiming He가 제안했다. [활성화 함수 글](/ml/activation-functions/)에서 배운 ReLU를 떠올려보자. ReLU는 입력이 음수면 출력이 0이다. 즉, **뉴런의 절반이 죽는다.**

```
He 초기화:

W ~ N(0, 2/n_in)

Xavier 대비 분산이 2배
```

ReLU가 음수 입력을 모두 0으로 만들면, 출력의 분산이 절반으로 줄어든다. 이를 보상하려면 초기 가중치의 분산을 2배로 키워야 한다. 그래서 `1/n_in`이 `2/n_in`이 된다.

```
Xavier: Var(W) = 2 / (n_in + n_out)  ← Sigmoid, Tanh
He:     Var(W) = 2 / n_in            ← ReLU, Leaky ReLU
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>실전 규칙</strong><br>
  ReLU 계열 활성화 함수 → <strong>He 초기화</strong><br>
  Sigmoid/Tanh 활성화 함수 → <strong>Xavier 초기화</strong><br>
  현대 신경망은 대부분 ReLU를 쓰므로 He 초기화가 기본이다.
</div>

### 코드로 비교

```python
import numpy as np

def simulate_forward(init_std, layers=10, neurons=256, activation='relu'):
    """각 층의 활성값 분산을 추적"""
    x = np.random.randn(1000, neurons)  # 입력: 평균 0, 분산 1
    variances = []

    for _ in range(layers):
        W = np.random.randn(neurons, neurons) * init_std
        z = x @ W

        if activation == 'relu':
            x = np.maximum(0, z)
        elif activation == 'tanh':
            x = np.tanh(z)
        else:
            x = z  # 선형

        variances.append(np.var(x))

    return variances

n = 256

# 나쁜 초기화: 고정 표준편차
bad = simulate_forward(init_std=0.01, neurons=n)
# → [3.3e-05, 2.6e-09, ...] 분산 급감 → 신호 소실

# Xavier 초기화 + ReLU (불일치)
xavier_relu = simulate_forward(init_std=np.sqrt(1/n), neurons=n)
# → 분산이 층마다 서서히 줄어듦

# He 초기화 + ReLU (올바른 조합)
he_relu = simulate_forward(init_std=np.sqrt(2/n), neurons=n)
# → [1.01, 0.98, 1.03, ...] 분산 안정 유지!
```

10개 층을 통과한 후 분산:

| 초기화 방식 | 10번째 층 분산 | 상태 |
|------------|--------------|------|
| 고정 (std=0.01) | ~10^-30 | 신호 소실 |
| Xavier + ReLU | ~0.1 | 느리게 감소 |
| He + ReLU | ~1.0 | 안정 유지 |

He 초기화가 ReLU와 결합했을 때 분산을 안정적으로 유지하는 것이 확인된다.

---

## 2. Batch Normalization

### 문제: Internal Covariate Shift

신경망을 학습하면, 각 층의 가중치가 매 스텝마다 바뀐다. 그러면 다음 층이 받는 입력의 분포도 계속 바뀐다. 2번째 층 입장에서는, 자기가 학습한 규칙의 전제(입력 분포)가 매번 달라지는 셈이다.

```
Epoch 1: 2번째 층 입력 분포 → 평균 0.5, 분산 2.0
Epoch 2: 2번째 층 입력 분포 → 평균 -1.2, 분산 0.3
Epoch 3: 2번째 층 입력 분포 → 평균 3.7, 분산 8.1
```

이러면 각 층이 매번 변하는 입력 분포에 적응하느라 학습이 느려진다. 이 현상을 **Internal Covariate Shift**라 한다. 2015년 Ioffe & Szegedy가 이 문제를 해결하기 위해 Batch Normalization(BatchNorm)을 제안했다.

### 핵심 아이디어

**각 층의 입력을 미니배치 단위로 정규화한다.** 입력의 평균을 0, 분산을 1로 맞추면 분포가 안정된다.

### 알고리즘

미니배치 B = {x_1, x_2, ..., x_m}에 대해:

```
1. 배치 평균:   mu_B = (1/m) * SUM(x_i)

2. 배치 분산:   sigma_B^2 = (1/m) * SUM((x_i - mu_B)^2)

3. 정규화:      x_hat_i = (x_i - mu_B) / sqrt(sigma_B^2 + epsilon)

4. 스케일·시프트: y_i = gamma * x_hat_i + beta
```

4번이 핵심이다. 단순히 평균 0, 분산 1로 정규화하면, 활성화 함수의 비선형성을 잃을 수 있다. 예를 들어 Sigmoid의 입력이 항상 0 근처에 몰리면 거의 선형 구간만 사용하게 된다. **gamma(스케일)** 와 **beta(시프트)** 는 학습 가능한 파라미터로, 네트워크가 필요하면 원래 분포로 되돌릴 수 있게 한다.

<div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>gamma와 beta가 왜 필요한가?</strong><br>
  극단적으로, gamma = sigma_B, beta = mu_B이면 정규화를 완전히 취소할 수 있다. 즉 네트워크가 "정규화가 도움이 안 되는 층에서는 알아서 원래대로 돌린다." 최적의 분포를 네트워크 스스로 결정하게 하는 것이다.
</div>

### 어디에 넣을까?

```
선형 변환 → BatchNorm → 활성화 함수

z = W * x + b
z_norm = BatchNorm(z)
a = ReLU(z_norm)
```

원 논문은 활성화 함수 **전에** 넣는 것을 제안했다. 실제로는 활성화 함수 **후에** 넣어도 잘 작동한다는 연구도 있다. 실무에서는 둘 다 시도해보고 더 나은 쪽을 선택한다.

### BatchNorm의 효과

| 효과 | 설명 |
|------|------|
| 학습 속도 향상 | 입력 분포가 안정되므로 더 큰 학습률 사용 가능 |
| 초기화 의존도 감소 | 정규화가 초기값의 영향을 상쇄 |
| 약한 규제 효과 | 미니배치 통계의 노이즈가 일종의 규제로 작용 |
| 깊은 네트워크 학습 가능 | 그래디언트 소실/폭발 완화 |

### 추론(Inference) 시의 차이

학습 때는 미니배치의 평균과 분산을 사용한다. 하지만 추론 때는 입력이 1개일 수도 있다. 배치가 없으면 배치 통계를 구할 수 없다.

해결: 학습 중에 배치 평균과 분산의 **이동 평균(Running Average)** 을 계속 기록해두고, 추론 때는 이 값을 사용한다.

```python
# 학습 시: 배치 통계 사용 + 이동 평균 업데이트
running_mean = momentum * running_mean + (1 - momentum) * batch_mean
running_var  = momentum * running_var  + (1 - momentum) * batch_var

# 추론 시: 저장된 이동 평균 사용
x_hat = (x - running_mean) / sqrt(running_var + epsilon)
y = gamma * x_hat + beta
```

이것이 PyTorch에서 `model.train()`과 `model.set_eval_mode()`을 반드시 구분해야 하는 이유다. 추론 모드에서는 BatchNorm이 이동 평균을 사용한다.

### Layer Normalization

BatchNorm은 미니배치 차원으로 정규화한다. 즉 같은 뉴런의 값을 여러 샘플에 걸쳐 정규화한다. 이는 배치 크기에 의존적이라는 한계가 있다.

**Layer Normalization(LayerNorm)** 은 반대로, 같은 샘플의 값을 여러 뉴런에 걸쳐 정규화한다.

```
BatchNorm: 같은 뉴런, 여러 샘플 → 배치 의존
LayerNorm: 같은 샘플, 여러 뉴런 → 배치 독립
```

Transformer 구조에서는 시퀀스 길이가 가변적이고 배치 크기가 작을 수 있어서 LayerNorm이 표준이다. CNN에서는 여전히 BatchNorm이 주로 쓰인다.

---

## 3. Dropout

### 문제: 과적합

[편향-분산 트레이드오프](/ml/bias-variance/)에서 배운 것처럼, 모델이 복잡할수록 훈련 데이터에 과적합될 위험이 커진다. 신경망은 파라미터 수가 수만~수백만에 달하므로 과적합이 쉽게 발생한다. [규제(Regularization)](/ml/regularization/)에서 Ridge와 Lasso가 선형 모델의 과적합을 막는 방법을 봤다면, Dropout은 **신경망 전용 규제 기법**이다.

### 핵심 아이디어

학습 중 각 층에서 뉴런을 **확률 p로 랜덤하게 비활성화**한다. 매 순전파마다 다른 뉴런들이 꺼진다.

```
일반 순전파:      [o] [o] [o] [o] [o]   ← 5개 뉴런 모두 활성
Dropout (p=0.4):  [o] [x] [o] [x] [o]   ← 2개 랜덤 비활성화
다음 순전파:      [x] [o] [o] [o] [x]   ← 다른 2개 비활성화
```

### 왜 작동하는가: 앙상블 효과

매 순전파마다 다른 뉴런 조합이 살아남으므로, 사실상 **매번 다른 서브 네트워크**로 학습하는 것과 같다. n개의 뉴런이 있으면 2^n개의 서브 네트워크가 가능하다. Dropout은 이들의 앙상블을 근사하는 효과를 낸다.

[규제 글](/ml/regularization/)에서 L2 규제가 가중치의 크기를 제한했다면, Dropout은 **특정 뉴런에 과도하게 의존하는 것을 방지**한다. 어떤 뉴런이든 꺼질 수 있으므로, 네트워크는 여러 뉴런에 정보를 분산시키는 방향으로 학습한다.

### Inverted Dropout

단순히 뉴런을 끄면, 학습 때와 추론 때의 출력 스케일이 달라진다. 학습 때는 뉴런의 (1-p) 비율만 살아있지만, 추론 때는 전부 활성화되기 때문이다.

**Inverted Dropout**: 학습 때 살아남은 뉴런의 출력을 `1/(1-p)`로 스케일링한다. 이러면 추론 때 아무 조정 없이 그대로 사용할 수 있다.

```python
def dropout_forward(x, p=0.5, training=True):
    if not training:
        return x  # 추론 시: 변경 없음

    # 학습 시: 마스크 생성 + 스케일 보정
    mask = (np.random.rand(*x.shape) > p).astype(float)
    return x * mask / (1 - p)  # 살아남은 뉴런을 1/(1-p)로 스케일링

# 예시: p=0.5
# 학습 시: 절반 꺼지고, 살아남은 것은 2배로 → 기대값 유지
# 추론 시: 전부 켜지고, 스케일 조정 없음 → 기대값 동일
```

### 실전 가이드

| 위치 | 권장 Dropout 비율 |
|------|------------------|
| 입력층 | 0.0 ~ 0.1 (보통 안 씀) |
| 은닉층 | 0.2 ~ 0.5 |
| 출력층 | 0.0 (절대 안 씀) |

- **p = 0.5**가 가장 많은 서브 네트워크 조합을 만들어내므로 이론적 최적값이다.
- 하지만 실전에서는 **p = 0.2 ~ 0.3**이 대부분의 경우 잘 작동한다.
- 과적합이 심하면 p를 높이고, 과소적합이면 p를 낮추거나 Dropout을 빼라.

<div style="background: #fff8f0; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>주의</strong>: Dropout은 <strong>학습 때만</strong> 적용한다. 추론 때는 반드시 꺼야 한다. PyTorch에서 추론 모드 전환을 빠뜨리면 결과가 매번 달라지는 버그가 생긴다. BatchNorm과 마찬가지로 train/inference 모드 전환은 필수다.
</div>

---

## 4. Early Stopping

[편향-분산 트레이드오프](/ml/bias-variance/)에서 모델 복잡도가 올라가면 훈련 오차는 계속 줄지만 검증 오차는 어느 순간부터 다시 올라간다는 걸 봤다. 신경망에서 "모델 복잡도"에 해당하는 것이 **학습 에폭 수**다.

```
에폭 1~20:   훈련 Loss ↓, 검증 Loss ↓  → 학습 중
에폭 20~50:  훈련 Loss ↓, 검증 Loss ↑  → 과적합 시작
에폭 50~100: 훈련 Loss ↓↓, 검증 Loss ↑↑ → 심각한 과적합
```

**Early Stopping**: 검증 Loss가 더 이상 줄지 않으면 학습을 멈춘다.

```python
import copy

best_val_loss = float('inf')
patience = 10       # 개선이 없어도 기다리는 에폭 수
patience_counter = 0
best_weights = None

for epoch in range(max_epochs):
    train_loss = train_one_epoch(model, train_loader)
    val_loss = evaluate(model, val_loader)

    if val_loss < best_val_loss:
        best_val_loss = val_loss
        patience_counter = 0
        best_weights = copy.deepcopy(model.state_dict())  # 최적 가중치 저장
    else:
        patience_counter += 1

    if patience_counter >= patience:
        print(f"Early stopping at epoch {epoch}")
        model.load_state_dict(best_weights)  # 최적 가중치로 복원
        break
```

**Patience**가 중요하다. 검증 Loss는 노이즈 때문에 일시적으로 올라갈 수 있다. Patience가 너무 작으면 아직 학습 중인데 조기 종료하고, 너무 크면 이미 과적합된 뒤에야 멈춘다. 보통 **5~20** 정도로 설정한다.

---

## 5. Data Augmentation

과적합의 가장 근본적인 해결책은 **데이터를 더 모으는 것**이다. 하지만 현실에서 데이터 수집은 비싸다. Data Augmentation은 기존 데이터를 변형해서 새 훈련 샘플을 만든다.

### 이미지

```
원본 이미지 → 좌우 반전 (Horizontal Flip)
           → 회전 (Rotation, ±15도)
           → 랜덤 자르기 (Random Crop)
           → 색상 변형 (Color Jitter: 밝기, 대비, 채도)
           → 스케일 변환 (Random Resize)
```

```python
from torchvision import transforms

train_transform = transforms.Compose([
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomRotation(15),
    transforms.RandomCrop(224, padding=16),
    transforms.ColorJitter(brightness=0.2, contrast=0.2),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])
```

### 텍스트

- 동의어 치환 (Synonym Replacement)
- 역번역 (Back-translation): 한국어 → 영어 → 한국어
- 랜덤 삽입/삭제/교환

Data Augmentation은 원본 데이터의 의미를 보존하면서 표현을 다양화하는 것이 핵심이다. "고양이 사진을 좌우 반전해도 고양이"지만, "6을 상하 반전하면 9"가 되므로 도메인에 맞게 적용해야 한다.

---

## 6. 전체 조합: 실전 학습 레시피

지금까지 배운 기법을 하나로 합치면 이렇게 된다:

```
가중치 초기화: He 초기화
     ↓
각 은닉층:    Linear → BatchNorm → ReLU → Dropout(0.3)
     ↓
옵티마이저:   Adam (lr=0.001)
     ↓
학습 전략:    Early Stopping (patience=10) + Data Augmentation
```

PyTorch로 구현하면:

```python
import torch
import torch.nn as nn

class StableNet(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim, dropout_rate=0.3):
        super().__init__()
        self.net = nn.Sequential(
            # 은닉층 1
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout_rate),

            # 은닉층 2
            nn.Linear(hidden_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout_rate),

            # 은닉층 3
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.BatchNorm1d(hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout_rate),

            # 출력층 (Dropout, BatchNorm 없음)
            nn.Linear(hidden_dim // 2, output_dim),
        )
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity='relu')  # He 초기화
                nn.init.zeros_(m.bias)

    def forward(self, x):
        return self.net(x)

# 사용
model = StableNet(input_dim=784, hidden_dim=256, output_dim=10)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
criterion = nn.CrossEntropyLoss()
```

**sklearn MLPClassifier**로는 이렇게 된다:

```python
from sklearn.neural_network import MLPClassifier

mlp = MLPClassifier(
    hidden_layer_sizes=(256, 256, 128),
    activation='relu',           # → He 초기화 자동 적용
    solver='adam',               # Adam 옵티마이저
    alpha=0.001,                 # L2 규제 (Dropout 대신)
    batch_size=64,
    learning_rate_init=0.001,
    early_stopping=True,         # Early Stopping
    validation_fraction=0.1,
    n_iter_no_change=10,         # patience
    max_iter=500,
)
```

sklearn의 MLPClassifier는 BatchNorm과 Dropout을 직접 지원하지 않는다. 대신 `alpha` 파라미터로 L2 규제를 적용한다. 본격적인 딥러닝에서는 PyTorch나 TensorFlow를 사용해야 이 모든 기법을 자유롭게 조합할 수 있다.

---

## 7. 흔한 학습 실패와 디버깅

신경망 학습이 잘 안 될 때, 증상별 원인과 해결법을 정리한다.

### Loss가 줄지 않는다

```
가능한 원인                해결법
-----------------------------------------------------------
학습률이 너무 작다        → lr을 10배 키워본다 (0.001 → 0.01)
학습률이 너무 크다        → lr을 10배 줄여본다 (0.001 → 0.0001)
가중치 초기화 실패        → He 초기화 확인
데이터 전처리 누락        → 입력을 정규화했는지 확인 (평균 0, 분산 1)
배치 크기가 너무 크다     → 32 또는 64로 줄여본다
```

### Loss가 NaN이 된다

```
원인: 그래디언트 폭발
-----------------------------------------------------------
→ 학습률 줄이기
→ Gradient Clipping 적용
→ BatchNorm 추가
→ He 초기화 확인
```

```python
# Gradient Clipping 예시
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

### 훈련은 좋은데 테스트가 나쁘다 (과적합)

```
→ Dropout 비율 높이기 (0.3 → 0.5)
→ 데이터 증강 적용
→ L2 규제 강화 (weight_decay 증가)
→ 모델 크기 줄이기 (뉴런 수, 층 수 감소)
→ Early Stopping 적용
```

### 훈련도 나쁘고 테스트도 나쁘다 (과소적합)

```
→ 모델 크기 키우기 (뉴런 수, 층 수 증가)
→ 학습 에폭 늘리기
→ Dropout 비율 줄이기 또는 제거
→ 학습률 올리기
→ 더 좋은 특성(feature) 찾기
```

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>디버깅 순서</strong><br>
  1. 작은 데이터(100개)로 과적합이 되는지 확인 → 안 되면 모델/코드 문제<br>
  2. 과적합 확인되면, 전체 데이터로 학습 + 규제 기법 추가<br>
  3. 학습률은 로그 스케일로 탐색 (0.1, 0.01, 0.001, 0.0001)
</div>

---

## Phase 5 마무리: 신경망, 처음부터 끝까지

Phase 5에서 6개 글에 걸쳐 신경망을 바닥부터 쌓아올렸다.

```
#19  퍼셉트론과 MLP       → 신경망의 구조를 만들었다
#20  순전파               → 입력에서 출력까지 예측하는 법을 배웠다
#21  역전파               → 오차를 되돌려 보내 학습하는 원리를 이해했다
#22  활성화 함수           → 비선형성을 부여해 표현력을 확보했다
#23  옵티마이저            → SGD부터 Adam까지, 효율적으로 최적화하는 법을 배웠다
#24  학습 안정화 (이번 글)  → 실전에서 학습을 망치는 문제들과 해결법을 정리했다
```

이것으로 신경망의 기초가 완성됐다. 구조를 설계하고, 데이터를 흘려보내 예측하고, 오차를 역전파하고, 최적화하고, 안정적으로 학습시키는 전체 파이프라인을 이해한 것이다.

### Classical ML vs Neural Networks

Phase 1~4에서 배운 고전 머신러닝과 Phase 5의 신경망, 언제 무엇을 쓸까?

| 기준 | 고전 ML (선형, 트리, 앙상블) | 신경망 (MLP, CNN, RNN, ...) |
|------|---------------------------|---------------------------|
| 데이터 양 | 수백~수만 행이면 충분 | 수만 행 이상에서 진가 발휘 |
| 데이터 유형 | 정형 데이터 (테이블) | 비정형 데이터 (이미지, 텍스트, 음성) |
| 해석 가능성 | 높음 (특성 중요도, 계수 해석) | 낮음 (블랙박스) |
| 학습 시간 | 빠름 | 느림 (GPU 필요) |
| 하이퍼파라미터 | 상대적으로 적음 | 매우 많음 (초기화, lr, 층 수, BatchNorm, Dropout...) |
| Kaggle 정형 데이터 | XGBoost/LightGBM이 지배 | MLP가 가끔 경쟁 |
| 이미지/텍스트 | 불가능에 가까움 | 압도적 |

핵심 메시지: **정형 데이터에서는 여전히 트리 기반 앙상블이 강하다.** 신경망이 빛나는 영역은 이미지, 텍스트, 음성 같은 비정형 데이터다. "모든 곳에 딥러닝"이 정답이 아니라, 문제에 맞는 도구를 고르는 것이 정답이다.

---

## 다음: Phase 6 모델 평가

지금까지 Phase 1~5에서 다양한 모델을 배웠다. 선형 회귀, 로지스틱 회귀, KNN, 결정 트리, 랜덤 포레스트, 부스팅, 신경망. 하지만 정작 중요한 질문을 다루지 않았다.

> "이 모델들 중 어떤 게 **진짜** 좋은 거야?"

정확도(Accuracy)만 보면 될까? 암 진단에서 정확도 99%인 모델이 "모두 정상"이라고 예측하는 것일 수도 있다. Precision과 Recall은 뭐고, F1 Score는 왜 필요하고, ROC-AUC는 어떻게 해석할까?

다음부터는 [분류 모델 평가 지표](/ml/classification-metrics/)로 넘어간다. 지금까지 배운 모든 지도학습 모델(선형, 트리, 신경망)을 공정하게 비교하고 평가하는 방법을 다룬다. Phase 6에서 만나자.
