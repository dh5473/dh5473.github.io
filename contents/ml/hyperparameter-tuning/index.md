---
date: '2026-01-28'
title: '하이퍼파라미터 튜닝, Grid Search보다 Random Search가 나은 이유'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 28
tags: ['Hyperparameter Tuning', '하이퍼파라미터', 'Grid Search', 'Random Search', 'Bayesian Optimization', 'Optuna', '머신러닝']
summary: '학습 전에 사람이 정하는 값을 탐색하는 방법. 격자 탐색이 정해진 예산을 어디에 낭비하는지, 무작위 탐색과 베이지안 최적화가 그 예산을 어떻게 다시 쓰는지 정리한다.'
thumbnail: './thumbnail.png'
---

랜덤 포레스트의 트리를 100그루로 할지 500그루로 할지, XGBoost의 `learning_rate`를 0.1로 할지 0.01로 할지. 모델 구조는 그대로인데 이 선택만으로 검증 점수가 몇 퍼센트포인트씩 움직인다. 문제는 후보 조합이 금방 수천 개가 되고, 조합 하나를 평가하려면 교차 검증 폴드 수만큼 모델을 다시 학습시켜야 한다는 것이다. 결국 튜닝은 "가장 좋은 조합을 찾는 문제"가 아니라 **정해진 학습 횟수를 어디에 쓸 것인가**의 문제다.

## 파라미터와 하이퍼파라미터

둘은 자주 혼동되지만 정해지는 시점이 다르다.

| 구분 | 정해지는 방식 | 예 |
|---|---|---|
| 파라미터 | 학습 과정에서 모델이 스스로 찾는다 | 선형 회귀의 가중치와 편향, 신경망 각 층의 가중치 행렬, 결정 트리 각 노드의 분기 기준값 |
| 하이퍼파라미터 | 데이터를 보기 전에 사람이 정한다 | 랜덤 포레스트의 `n_estimators`·`max_depth`, XGBoost의 `learning_rate`·`reg_lambda`, 신경망의 학습률·배치 크기·은닉층 수 |

파라미터는 경사 하강법 같은 옵티마이저가 알아서 최적화한다. 하이퍼파라미터에는 그런 자동 장치가 없다. 값을 넣어보고, 학습시키고, 점수를 보고, 다시 넣어보는 수밖에 없다. 그래서 탐색 전략이 필요하다.

## 탐색 방법 네 가지

자동 탐색기는 결국 "다음에 어떤 조합을 평가할지" 고르는 규칙이다. 그 규칙이 방법을 가른다.

| 방법 | 다음 후보를 고르는 규칙 | 예산의 성격 | 쓸 자리 |
|---|---|---|---|
| Grid Search | 미리 정한 격자의 모든 조합 | 후보 개수의 곱으로 정해진다 | 파라미터 2~3개, 후보가 명확할 때 |
| Random Search | 각 파라미터의 분포에서 독립적으로 뽑는다 | 시도 횟수를 직접 정한다 | 기본 선택 |
| Bayesian (Optuna) | 지금까지의 결과로 만든 대리 모델이 제안한다 | 시도 횟수를 직접 정한다 | 학습 한 번이 비쌀 때 |
| Successive Halving | 무작위 후보를 적은 자원으로 걸러낸다 | 살아남은 후보에만 자원을 몰아준다 | 후보가 많고 시간이 빠듯할 때 |

sklearn에서는 앞의 둘이 `GridSearchCV`와 `RandomizedSearchCV`다. 인터페이스가 거의 같아서 바꿔 끼우기 쉽다.

```python
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV
from sklearn.ensemble import RandomForestClassifier
from scipy.stats import randint

# 격자: 3 x 4 x 2 = 24개 조합, 5-fold면 학습 120번
grid = GridSearchCV(
    RandomForestClassifier(random_state=42),
    param_grid={
        'n_estimators': [100, 200, 300],
        'max_depth': [5, 10, 15, 20],
        'max_features': ['sqrt', 'log2'],
    },
    cv=5, scoring='accuracy', n_jobs=-1,
)

# 무작위: 조합 수가 아니라 n_iter가 예산을 정한다
rand = RandomizedSearchCV(
    RandomForestClassifier(random_state=42),
    param_distributions={
        'n_estimators': randint(100, 500),
        'max_depth': randint(3, 20),
        'max_features': ['sqrt', 'log2'],
        'min_samples_split': randint(2, 20),
        'min_samples_leaf': randint(1, 10),
    },
    n_iter=60, cv=5, scoring='accuracy', random_state=42, n_jobs=-1,
)

rand.fit(X_train, y_train)
print(rand.best_params_, rand.best_score_)
```

두 객체의 차이는 `param_grid` 대 `param_distributions`, 그리고 `n_iter`의 유무다. 이 사소해 보이는 차이가 탐색 결과를 크게 갈라놓는다.

## 격자는 예산을 어디에 쓰는가

파라미터가 $d$개이고 각각 후보를 $c$개씩 두면 조합 수는 $c^d$다. $c = 4$일 때 파라미터 3개면 64개지만, 7개면 16,384개, 10개면 백만 개가 넘는다. XGBoost처럼 손댈 만한 하이퍼파라미터가 열 개 이상인 모델에서 완전 탐색은 선택지가 아니다.

격자에는 조합 폭발 말고도 두 가지 결함이 더 있다. 하나는 **격자점 사이를 영원히 보지 못한다**는 것이다. `learning_rate` 후보를 `[0.01, 0.1, 1.0]`으로 잡았는데 실제 최적값이 0.03이라면, 예산을 아무리 늘려도 그 값에는 닿지 못한다. 촘촘하게 만들면 조합 수가 다시 폭발한다.

다른 하나가 더 중요하다. 격자는 **모든 하이퍼파라미터를 동등하게 취급한다.** 현실의 탐색 공간은 그렇지 않다. `learning_rate`를 0.01에서 0.3으로 옮기면 점수가 확 달라지지만, `n_estimators`는 어느 정도 크기만 되면 100이든 300이든 비슷하다. 성능에 실제로 영향을 주는 축은 보통 한두 개고 나머지는 거의 평평하다.

여기서 격자와 무작위가 갈린다. 예산 9회를 같이 쓰되 파라미터가 2개이고 그중 하나만 중요하다고 하자. 3 × 3 격자는 중요한 축에서 **서로 다른 값을 3개만** 시도한다. 나머지 6번의 학습은 이미 본 3개 값을 덜 중요한 축의 다른 위치에서 반복하는 데 쓰인다. 무작위 샘플링은 9번 모두 다른 값을 뽑으므로, 같은 축에서 **9개 값**을 본다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 600" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 9회 예산으로 Grid Search와 Random Search가 찍는 점의 분포 비교. 위쪽 Grid Search는 3 곱하기 3 격자라 중요한 축에서 서로 다른 값을 3개만 시도하고, 아래쪽 Random Search는 같은 9회로 중요한 축의 서로 다른 값 9개를 시도한다">
<style>
.ht1-t { fill: var(--text, #1c1917); }
.ht1-m { fill: var(--text-muted, #6d6762); }
.ht1-dot { fill: var(--primary, #0a756c); }
.ht1-tick { stroke: var(--accent, #9d5604); stroke-width: 3; }
</style>
<!-- 위 패널: Grid Search -->
<text x="200" y="24" class="ht1-t" font-size="17" font-weight="700" text-anchor="middle">위 · Grid Search 9회</text>
<rect x="72" y="40" width="240" height="200" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="54" y="140" class="ht1-m" font-size="14" text-anchor="middle" transform="rotate(-90 54 140)">덜 중요한 축</text>
<circle class="ht1-dot" cx="120" cy="80" r="5.5"/>
<circle class="ht1-dot" cx="192" cy="80" r="5.5"/>
<circle class="ht1-dot" cx="264" cy="80" r="5.5"/>
<circle class="ht1-dot" cx="120" cy="140" r="5.5"/>
<circle class="ht1-dot" cx="192" cy="140" r="5.5"/>
<circle class="ht1-dot" cx="264" cy="140" r="5.5"/>
<circle class="ht1-dot" cx="120" cy="200" r="5.5"/>
<circle class="ht1-dot" cx="192" cy="200" r="5.5"/>
<circle class="ht1-dot" cx="264" cy="200" r="5.5"/>
<!-- 위 패널: 중요한 축으로의 사영 -->
<line x1="72" y1="254" x2="312" y2="254" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<line class="ht1-tick" x1="120" y1="246" x2="120" y2="262"/>
<line class="ht1-tick" x1="192" y1="246" x2="192" y2="262"/>
<line class="ht1-tick" x1="264" y1="246" x2="264" y2="262"/>
<text x="200" y="286" class="ht1-m" font-size="14" text-anchor="middle">중요한 축에서 시도한 값 3개</text>
<!-- 아래 패널: Random Search -->
<text x="200" y="324" class="ht1-t" font-size="17" font-weight="700" text-anchor="middle">아래 · Random Search 9회</text>
<rect x="72" y="340" width="240" height="200" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<text x="54" y="440" class="ht1-m" font-size="14" text-anchor="middle" transform="rotate(-90 54 440)">덜 중요한 축</text>
<circle class="ht1-dot" cx="91" cy="484" r="5.5"/>
<circle class="ht1-dot" cx="113" cy="402" r="5.5"/>
<circle class="ht1-dot" cx="134" cy="516" r="5.5"/>
<circle class="ht1-dot" cx="158" cy="370" r="5.5"/>
<circle class="ht1-dot" cx="180" cy="450" r="5.5"/>
<circle class="ht1-dot" cx="209" cy="498" r="5.5"/>
<circle class="ht1-dot" cx="235" cy="388" r="5.5"/>
<circle class="ht1-dot" cx="262" cy="464" r="5.5"/>
<circle class="ht1-dot" cx="293" cy="422" r="5.5"/>
<!-- 아래 패널: 중요한 축으로의 사영 -->
<line x1="72" y1="554" x2="312" y2="554" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
<line class="ht1-tick" x1="91" y1="546" x2="91" y2="562"/>
<line class="ht1-tick" x1="113" y1="546" x2="113" y2="562"/>
<line class="ht1-tick" x1="134" y1="546" x2="134" y2="562"/>
<line class="ht1-tick" x1="158" y1="546" x2="158" y2="562"/>
<line class="ht1-tick" x1="180" y1="546" x2="180" y2="562"/>
<line class="ht1-tick" x1="209" y1="546" x2="209" y2="562"/>
<line class="ht1-tick" x1="235" y1="546" x2="235" y2="562"/>
<line class="ht1-tick" x1="262" y1="546" x2="262" y2="562"/>
<line class="ht1-tick" x1="293" y1="546" x2="293" y2="562"/>
<text x="200" y="586" class="ht1-m" font-size="14" text-anchor="middle">중요한 축에서 시도한 값 9개</text>
</svg>
</div>

Bergstra와 Bengio는 2012년 논문 "Random Search for Hyper-Parameter Optimization"에서 이 관찰을 정리했다. 탐색 공간의 명목 차원이 높아도 성능을 실제로 좌우하는 **유효 차원은 낮고**, 그 유효 차원이 어느 축인지는 미리 모른다. 격자는 유효 차원을 맞히지 못하면 예산을 통째로 낭비하지만, 무작위 샘플링은 어느 축을 사영해도 시도 횟수만큼의 서로 다른 값을 남긴다. 어느 축이 중요한지 모르는 상태에서는 이쪽이 안전하다.

실전 기준은 단순하다. 파라미터가 3개 이하이고 후보 값이 명확하면 Grid Search, 그 외에는 Random Search가 기본이다.

:::tip

**Random Search의 예산은 조합 수와 무관하다**

격자는 후보를 하나 추가하면 조합 수가 곱셈으로 늘지만, `n_iter=60`은 파라미터를 5개로 늘리든 10개로 늘리든 60번이다. 탐색 공간을 넓히는 비용과 계산 예산이 분리된다는 점이 실무에서는 성능 차이만큼 중요하다.

:::

## 이전 결과를 활용하는 베이지안 최적화

Grid Search와 Random Search의 공통 약점은 각 시도가 **독립**이라는 것이다. 99번째 결과가 100번째 선택에 아무 영향을 주지 않는다. 좋은 영역을 이미 찾아놓고도 그 근처를 다시 뽑을 이유를 갖지 못한다.

베이지안 최적화는 지금까지의 (하이퍼파라미터, 점수) 쌍으로 **대리 모델**을 만든다. 실제 목적 함수는 평가 한 번에 모델 학습이 필요하지만, 대리 모델은 예측만 하므로 값싸다. 여기에 **획득 함수**를 얹어 다음 지점을 고른다. 획득 함수는 지금까지 좋았던 영역 근처를 파는 활용과, 아직 안 가본 영역을 찍어보는 탐색 사이에서 균형을 잡는다. 흔히 쓰는 것이 현재 최고 점수 대비 개선 기댓값을 최대화하는 EI(Expected Improvement)다.

절차는 초기 몇 점을 무작위로 평가해 대리 모델을 세우고, 획득 함수가 고른 지점에서 실제 모델을 학습하고, 결과를 대리 모델에 반영해 다시 고르는 순환이다. 시도가 쌓일수록 제안이 좋아지므로, 학습 한 번에 수 분에서 수 시간이 드는 상황에서 예산을 크게 아낀다.

Optuna는 이 과정을 감싼 라이브러리다. 기본 샘플러는 좋은 결과 영역과 나쁜 결과 영역의 밀도를 따로 추정하는 TPE(Tree-structured Parzen Estimator)다.

```python
import optuna
import xgboost as xgb
from sklearn.model_selection import cross_val_score

def objective(trial):
    params = {
        'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'subsample': trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
        'reg_lambda': trial.suggest_float('reg_lambda', 1e-3, 10.0, log=True),
        'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
    }
    model = xgb.XGBClassifier(**params, tree_method='hist',
                              random_state=42, eval_metric='logloss')
    return cross_val_score(model, X_train, y_train, cv=5,
                           scoring='accuracy').mean()

sampler = optuna.samplers.TPESampler(seed=42)
study = optuna.create_study(direction='maximize', sampler=sampler)
study.optimize(objective, n_trials=100)

print(study.best_params, study.best_value)
```

탐색 공간이 `objective` 함수 **안에서** 정의된다는 점이 sklearn과 다르다. `if` 문으로 조건부 하이퍼파라미터를 쓸 수 있고(부스터가 `dart`일 때만 `rate_drop`을 뽑는 식), 탐색 도중 성능이 나쁜 시도를 중간에 끊는 프루닝도 붙일 수 있다. 끝난 뒤에는 `optuna.visualization.plot_param_importances(study)`로 어떤 하이퍼파라미터가 점수를 움직였는지 확인한다. 다음 라운드에서 탐색 범위를 좁힐 축을 여기서 고른다.

## 튜닝 점수를 최종 성능으로 보고하면 안 된다

`grid_search.best_score_`는 하이퍼파라미터를 고르는 데 이미 쓰인 점수다. 수십 개 조합 중 검증 폴드에서 가장 잘 나온 하나를 골랐으니, 그 값에는 검증 데이터에 맞춘 만큼의 낙관적 편향이 섞여 있다. 조합을 많이 시도할수록 편향은 커진다.

**Nested CV**는 고르는 루프와 재는 루프를 분리해 이 편향을 없앤다. 바깥 5-Fold가 평가를 맡고, 안쪽 3-Fold가 튜닝을 맡는다. 바깥 Fold 1이 테스트로 빠지면 남은 넷을 안쪽에서 다시 3-Fold로 나눠 최적 조합을 찾고, 그 조합으로 넷 전체를 학습해 Fold 1에서 평가한다. 바깥 Fold마다 조합을 새로 찾으므로, 각 테스트 점수는 자기 자신이 튜닝에 쓰이지 않은 점수다.

sklearn에서는 탐색기 객체를 그대로 `cross_val_score`에 넣으면 된다.

```python
from sklearn.model_selection import cross_val_score, GridSearchCV

inner = GridSearchCV(
    RandomForestClassifier(random_state=42),
    param_grid={'n_estimators': [100, 200, 300], 'max_depth': [5, 10, 15]},
    cv=3, scoring='accuracy', n_jobs=-1,
)
outer_scores = cross_val_score(inner, X, y, cv=5, scoring='accuracy')
print(f"{outer_scores.mean():.4f} ± {outer_scores.std():.4f}")
```

비용은 안쪽 폴드 수와 바깥 폴드 수의 곱이라 만만치 않다. 그래서 실무에서는 역할을 나눈다. 모델 후보를 비교하고 성능을 보고할 때는 Nested CV를 쓰고, 배포할 최종 모델은 전체 데이터에 일반 CV로 튜닝해 학습한다.

## 탐색 공간을 설계하는 법

탐색기를 고르는 것보다 탐색 공간을 잘 잡는 쪽이 결과에 더 크게 기여할 때가 많다.

### 스케일이 넓으면 로그로 뽑는다

`learning_rate`를 0.001부터 1.0까지 균등 분포로 뽑으면, 0.001~0.01 구간이 전체 범위의 1%도 되지 않아 샘플이 거의 떨어지지 않는다. 절반은 0.5 이상에서 뽑힌다. 로그 균등 분포로 바꾸면 자릿수마다 비슷한 밀도로 탐색한다.

```python
trial.suggest_float('lr', 1e-3, 1.0)             # 절반이 0.5~1.0에 몰린다
trial.suggest_float('lr', 1e-3, 1.0, log=True)   # 자릿수마다 약 1/3
```

학습률, 규제 강도, `weight_decay`처럼 여러 자릿수에 걸친 값은 예외 없이 로그다. Random Search에서는 `scipy.stats.loguniform`을 쓴다.

### 넓게 시작해서 좁힌다

처음부터 촘촘한 격자를 짜는 것은 어디가 좋은지 모르는 상태에서 해상도를 올리는 셈이다. 1차로 범위를 크게 잡아 Random Search를 돌려 유망한 영역을 찾고, 2차로 그 근처만 좁게 다시 탐색한다.

```python
# 1차: learning_rate 0.001~0.3, max_depth 3~15 → 0.1과 5 근처가 좋았다
# 2차
param_dist_fine = {
    'learning_rate': loguniform(0.05, 0.25),
    'max_depth': randint(4, 8),
    'n_estimators': randint(200, 600),
}
```

### 튜닝할 파라미터 자체를 줄인다

부스팅 계열에서 `n_estimators`는 조기 종료로 없앨 수 있다. 크게 잡아두고 검증 점수가 개선을 멈추면 멈추게 하면, 탐색 축이 하나 사라진다.

```python
model = xgb.XGBClassifier(n_estimators=1000, early_stopping_rounds=50, **params)
model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
score = model.best_score
```

후보가 아주 많고 시간이 빠듯하면 `HalvingRandomSearchCV`가 축을 줄이는 대신 자원을 줄인다. 후보 전부를 적은 데이터로 한 번씩 평가하고, 하위를 탈락시키면서 살아남은 후보에만 데이터를 늘려준다. `factor=3`이면 이렇게 진행된다.

| 라운드 | 남은 후보 | 후보당 데이터 |
|---|---|---|
| 1 | 100 | 1배 |
| 2 | 34 | 3배 |
| 3 | 12 | 9배 |
| 4 | 4 | 27배 |

전체 데이터로 100번 학습하는 대신 대부분의 후보를 싼 값에 걸러낸다. sklearn에서는 아직 실험적 기능이라 `from sklearn.experimental import enable_halving_search_cv`를 먼저 import해야 한다.

### 어디부터 손댈지

모든 축을 한꺼번에 열면 공간이 감당되지 않는다. 영향이 큰 것부터 순서대로 잡는다. XGBoost와 LightGBM이라면 `learning_rate`와 라운드 수를 먼저 고정하고, 다음이 트리 복잡도(`max_depth`, `min_child_weight`), 그다음이 샘플링(`subsample`, `colsample_bytree`), 마지막이 규제(`reg_lambda`, `reg_alpha`)다.

| 하이퍼파라미터 | 역할 | 탐색 범위 | 스케일 |
|---|---|---|---|
| `learning_rate` | 각 트리의 기여도 | 0.01~0.3 | **log** |
| `max_depth` | 트리 깊이 | 3~10 | linear |
| `n_estimators` | 부스팅 라운드 수 | 100~1000 | linear |
| `subsample` | 행 샘플링 비율 | 0.6~1.0 | linear |
| `colsample_bytree` | 열 샘플링 비율 | 0.6~1.0 | linear |
| `reg_lambda` | L2 규제 강도 | 0.001~10 | **log** |
| `reg_alpha` | L1 규제 강도 | 0.001~10 | **log** |
| `min_child_weight` | 리프 최소 헤시안 합 | 1~10 | linear |

랜덤 포레스트는 축이 훨씬 적다. `n_estimators`는 100~500 사이에서 크게만 잡으면 수익이 금방 체감되고, 실제로 성능을 움직이는 것은 트리를 얼마나 자라게 둘지(`max_depth`, `min_samples_leaf`)와 노드마다 몇 개 특성을 볼지(`max_features`)다. 이 셋만 잡아도 대부분 충분하다.

마지막으로 `random_state`와 샘플러 시드를 고정한다. 시드가 흔들리면 두 조합의 점수 차이가 진짜 차이인지 재실행 노이즈인지 구분할 수 없다.

## 마치며

하이퍼파라미터 튜닝을 "더 촘촘한 격자를 짜는 일"로 보면 계산량만 늘고 결과는 잘 나아지지 않는다. 정해진 학습 횟수를 어디에 배분할 것인가로 보면 선택이 달라진다. 무작위 탐색이 격자를 이기는 이유도 더 똑똑한 알고리즘이어서가 아니라, 어느 축이 중요한지 모르는 상황에서 모든 축에 고르게 값을 남기기 때문이다. 베이지안 최적화는 여기서 한 걸음 더 나아가, 이미 쓴 예산으로 다음 예산의 방향을 정한다.

탐색기의 선택보다 앞서는 것이 탐색 공간의 설계다. 로그 스케일로 뽑아야 할 값을 선형으로 뽑고 있으면 어떤 탐색기를 써도 좋은 영역에 샘플이 떨어지지 않는다. 넓게 한 번 돌려 유망한 영역을 확인하고, 거기서 좁혀 들어가는 두 단계가 실무에서 가장 안정적으로 통한다.

그리고 튜닝으로 얻은 점수는 그 자체로 성능이 아니다. 조합을 고르는 데 쓴 점수와 성능을 보고하는 점수를 분리해두지 않으면, 실제 서비스에서 재현되지 않는 숫자를 들고 다니게 된다.

다음 글에서는 튜닝을 다 해도 점수가 오르지 않을 때 무엇을 먼저 봐야 하는지, 학습 곡선과 오차 분석으로 진단하는 방법을 다룬다.

## 함께 보면 좋은 글

- [교차 검증](/ml/cross-validation/) : 탐색 점수를 믿을 수 있게 만드는 평가 절차
- [XGBoost와 LightGBM](/ml/xgboost-vs-lightgbm/) : 손댈 하이퍼파라미터가 가장 많은 모델
- [규제](/ml/regularization/) : 로그 스케일로 탐색해야 하는 대표적인 하이퍼파라미터
- [랜덤 포레스트](/ml/random-forest/) : 예제에 쓴 모델의 파라미터가 각각 무슨 일을 하는지

## 참고자료

- [Bergstra & Bengio, "Random Search for Hyper-Parameter Optimization", JMLR 13 (2012)](https://jmlr.org/papers/v13/bergstra12a.html)
- [Bergstra et al., "Algorithms for Hyper-Parameter Optimization", NIPS 2011](https://papers.nips.cc/paper_files/paper/2011/hash/86e8f7ab32cfd12577bc2619bc635690-Abstract.html)
- [Scikit-learn, Tuning the hyper-parameters of an estimator](https://scikit-learn.org/stable/modules/grid_search.html)
- [Optuna: A hyperparameter optimization framework](https://optuna.readthedocs.io/en/stable/)
