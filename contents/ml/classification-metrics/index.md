---
date: '2026-01-25'
title: 'Accuracy 99%가 거짓말일 때 보는 Precision과 Recall'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 25
tags: ['Model Evaluation', '모델 평가', 'Precision', 'Recall', 'F1-Score', 'ROC-AUC', 'PR-AUC', 'Confusion Matrix', '머신러닝']
summary: '혼동 행렬의 네 칸에서 Precision, Recall, F1, AUC가 어떻게 나오는지, 클래스가 불균형할 때 어떤 지표가 모델을 과대평가하는지 정리한다.'
thumbnail: './thumbnail.png'
---

신용카드 거래 1만 건 중 사기가 100건이라고 하자. 모든 거래를 "정상"이라고 찍는 모델을 만들면 Accuracy는 99%가 나온다. 사기는 한 건도 못 잡았는데 성적표는 훌륭하다.

이게 Accuracy Paradox다. 양성이 소수인 데이터에서 Accuracy는 사실상 다수 클래스를 맞힌 비율이고, 정작 궁금한 소수 클래스의 성능은 그 숫자 뒤에 숨는다. 그리고 현실의 분류 문제는 거의 다 이렇다. 스팸 메일, 질병 진단, 이상 탐지, 제조 불량 검출 전부 양성이 소수다.

Accuracy가 못 쓸 지표라는 말은 아니다. 클래스 비율이 대체로 균형 잡혀 있고 두 방향의 오분류 비용이 비슷하다면 Accuracy로 충분하다. 문제는 그런 조건이 드물다는 것이다.

그래서 필요한 건 "몇 개 맞혔나"가 아니라 "어떤 종류의 실수를 얼마나 했나"다.

## 혼동 행렬의 네 칸

예측 결과를 실제 클래스와 예측 클래스의 조합으로 갈라 놓은 표가 혼동 행렬(Confusion Matrix)이다. 이진 분류라면 네 칸이 나온다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 275" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="혼동 행렬 2x2. 행은 실제 클래스, 열은 예측 클래스다. 예측 Positive 열 전체가 Precision의 분모이고, 실제 Positive 행 전체가 Recall의 분모다">
<style>
.cm1-h { font-size: 15px; fill: var(--text, #1c1917); }
.cm1-m { font-size: 14px; fill: var(--text-muted, #6d6762); }
.cm1-code { font-size: 18px; font-weight: 700; }
.cm1-sub { font-size: 14px; fill: var(--text, #1c1917); }
.cm1-tag { font-size: 15px; font-weight: 700; }
.cm1-cell { stroke: var(--border, #e7e5e4); stroke-width: 1; }
.cm1-mark { fill: none; stroke-width: 2.5; stroke-linecap: round; }
</style>
<!-- 축 라벨 -->
<text class="cm1-m" x="48" y="44" text-anchor="middle">예측 →</text>
<text class="cm1-h" x="146.5" y="44" text-anchor="middle">Positive</text>
<text class="cm1-h" x="263.5" y="44" text-anchor="middle">Negative</text>
<text class="cm1-m" x="48" y="90" text-anchor="middle">실제</text>
<text class="cm1-h" x="48" y="110" text-anchor="middle">Positive</text>
<text class="cm1-m" x="48" y="182" text-anchor="middle">실제</text>
<text class="cm1-h" x="48" y="202" text-anchor="middle">Negative</text>
<!-- 네 칸 -->
<rect class="cm1-cell" x="88" y="52" width="117" height="90" rx="4" fill="var(--bg-success, #f0fdf4)"/>
<rect class="cm1-cell" x="205" y="52" width="117" height="90" rx="4" fill="var(--bg-danger, #fef2f2)"/>
<rect class="cm1-cell" x="88" y="144" width="117" height="90" rx="4" fill="var(--bg-danger, #fef2f2)"/>
<rect class="cm1-cell" x="205" y="144" width="117" height="90" rx="4" fill="var(--bg-success, #f0fdf4)"/>
<!-- 맞음 표시 -->
<path class="cm1-mark" d="M98 68 l4 5 l9 -12" stroke="var(--text-success, #107836)"/>
<path class="cm1-mark" d="M215 160 l4 5 l9 -12" stroke="var(--text-success, #107836)"/>
<!-- 틀림 표시 -->
<path class="cm1-mark" d="M215 62 l10 10 M225 62 l-10 10" stroke="var(--text-danger, #cb2121)"/>
<path class="cm1-mark" d="M98 154 l10 10 M108 154 l-10 10" stroke="var(--text-danger, #cb2121)"/>
<!-- 칸 이름 -->
<text class="cm1-code" x="146.5" y="95" text-anchor="middle" fill="var(--text-success, #107836)">TP</text>
<text class="cm1-sub" x="146.5" y="118" text-anchor="middle">진양성</text>
<text class="cm1-code" x="263.5" y="95" text-anchor="middle" fill="var(--text-danger, #cb2121)">FN</text>
<text class="cm1-sub" x="263.5" y="118" text-anchor="middle">위음성</text>
<text class="cm1-code" x="146.5" y="187" text-anchor="middle" fill="var(--text-danger, #cb2121)">FP</text>
<text class="cm1-sub" x="146.5" y="210" text-anchor="middle">위양성</text>
<text class="cm1-code" x="263.5" y="187" text-anchor="middle" fill="var(--text-success, #107836)">TN</text>
<text class="cm1-sub" x="263.5" y="210" text-anchor="middle">진음성</text>
<!-- 지표가 읽는 구역 -->
<rect x="86" y="50" width="121" height="186" rx="4" fill="none" stroke="var(--primary, #0a756c)" stroke-width="2" stroke-dasharray="7 4"/>
<rect x="86" y="50" width="238" height="94" rx="4" fill="none" stroke="var(--accent, #9d5604)" stroke-width="2" stroke-dasharray="2 3"/>
<text class="cm1-tag" x="146.5" y="258" text-anchor="middle" fill="var(--primary, #0a756c)">Precision</text>
<text class="cm1-tag" x="361" y="102" text-anchor="middle" fill="var(--accent, #9d5604)">Recall</text>
</svg>
</div>

암 검진으로 읽으면 이렇다. TP는 환자를 환자라고 진단한 것, TN은 정상인을 정상이라고 진단한 것이다. FN은 환자를 정상이라고 돌려보낸 것이고, FP는 정상인에게 암 소견을 준 것이다. 같은 오답이지만 무게가 전혀 다르다. FN은 치료 시기를 놓치게 하고 FP는 추가 검사 비용을 만든다.

주요 지표는 전부 이 네 칸의 조합이다. 중요한 건 **각 지표가 표의 어느 방향을 읽느냐**다. Precision은 예측 Positive **열**을 세로로 읽고, Recall은 실제 Positive **행**을 가로로 읽는다. 둘이 TP를 공유하되 분모가 다르다는 것이 이 두 지표를 헷갈리게 만드는 지점이다.

| 지표 | 정의 | 읽는 방향 | 묻는 것 |
|---|---|---|---|
| Accuracy | $\frac{TP+TN}{TP+TN+FP+FN}$ | 대각선 대 전체 | 전체 중 맞힌 비율은 |
| Precision | $\frac{TP}{TP+FP}$ | 예측 Positive 열 | 양성이라 한 것 중 진짜는 |
| Recall | $\frac{TP}{TP+FN}$ | 실제 Positive 행 | 진짜 양성 중 잡은 것은 |
| Specificity | $\frac{TN}{TN+FP}$ | 실제 Negative 행 | 진짜 음성 중 걸러낸 것은 |

Precision은 모델이 "이건 양성이다"라고 말했을 때 그 말을 얼마나 믿을 수 있는지를 잰다. Recall은 세상에 존재하는 양성 중 몇 퍼센트를 건져 올렸는지를 잰다.

:::warning

**scikit-learn의 혼동 행렬은 위 그림과 축 순서가 다르다**

`confusion_matrix`는 레이블을 오름차순(0, 1)으로 놓기 때문에 행렬이 `[[TN, FP], [FN, TP]]` 형태로 나온다. 교과서 그림은 보통 Positive를 먼저 놓아서 TP가 좌상단에 오는데, 코드로 뽑으면 TP가 우하단에 있다. 인덱스를 손으로 꺼내 쓸 때 이 순서를 착각하면 Precision 자리에 NPV(음성 예측의 적중률)가, Recall 자리에 Specificity(음성의 재현율)가 들어간 값을 얻게 된다.

:::

```python
from sklearn.metrics import confusion_matrix

y_true = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0]
y_pred = [1, 0, 1, 0, 0, 1, 1, 0, 1, 0]

tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
print(tn, fp, fn, tp)   # 4 1 1 4
```

## 정밀도와 재현율은 같은 손잡이의 양 끝

Precision과 Recall은 독립적으로 올릴 수 있는 값이 아니다. 로지스틱 회귀든 부스팅이든 확률을 출력하는 모델은 그 확률을 임계값(threshold)과 비교해서 양성/음성을 정한다. 기본값은 0.5지만 이건 그냥 기본값이다. 임계값을 움직이면 두 지표가 반대 방향으로 움직인다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 285" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 열 개 샘플에 임계값 0.25와 0.65를 적용한 비교. 임계값이 낮으면 Recall 5/5에 Precision 5/8, 높으면 Precision 3/3에 Recall 3/5가 된다">
<style>
.pr1-t { font-size: 15px; font-weight: 700; fill: var(--text, #1c1917); }
.pr1-v { font-size: 14px; fill: var(--text, #1c1917); }
.pr1-m { font-size: 14px; fill: var(--text-muted, #6d6762); }
.pr1-z { font-size: 14px; fill: var(--primary, #0a756c); }
.pr1-neg { fill: var(--bg-subtle, #f5f4f2); stroke: var(--text-muted, #6d6762); stroke-width: 1.5; }
.pr1-pos { fill: var(--primary, #0a756c); }
.pr1-axis { stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.pr1-cut { stroke: var(--accent, #9d5604); stroke-width: 2; }
.pr1-zone { fill: var(--primary, #0a756c); fill-opacity: 0.10; }
</style>
<!-- 범례 -->
<circle class="pr1-neg" cx="46" cy="14" r="7"/>
<text class="pr1-m" x="60" y="19">음성 샘플</text>
<path class="pr1-pos" d="M150 6 l8 14 l-16 0 Z"/>
<text class="pr1-m" x="164" y="19">양성 샘플</text>
<!-- 위: 낮은 임계값 -->
<text class="pr1-t" x="30" y="52">threshold 0.25</text>
<text class="pr1-v" x="375" y="52" text-anchor="end">Precision 5/8 · Recall 5/5</text>
<rect class="pr1-zone" x="123.75" y="60" width="251.25" height="54"/>
<text class="pr1-z" x="249" y="78" text-anchor="middle">양성으로 예측</text>
<line class="pr1-axis" x1="40" y1="114" x2="375" y2="114"/>
<line class="pr1-cut" x1="123.75" y1="60" x2="123.75" y2="122"/>
<circle class="pr1-neg" cx="66.8" cy="95" r="7"/>
<circle class="pr1-neg" cx="100.3" cy="95" r="7"/>
<circle class="pr1-neg" cx="140.5" cy="95" r="7"/>
<circle class="pr1-neg" cx="194.1" cy="95" r="7"/>
<circle class="pr1-neg" cx="244.35" cy="95" r="7"/>
<path class="pr1-pos" d="M160.6 87 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M224.25 87 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M274.5 87 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M311.35 87 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M351.55 87 l8 14 l-16 0 Z"/>
<!-- 아래: 높은 임계값 -->
<text class="pr1-t" x="30" y="174">threshold 0.65</text>
<text class="pr1-v" x="375" y="174" text-anchor="end">Precision 3/3 · Recall 3/5</text>
<rect class="pr1-zone" x="257.75" y="182" width="117.25" height="54"/>
<text class="pr1-z" x="316" y="200" text-anchor="middle">양성으로 예측</text>
<line class="pr1-axis" x1="40" y1="236" x2="375" y2="236"/>
<line class="pr1-cut" x1="257.75" y1="182" x2="257.75" y2="244"/>
<circle class="pr1-neg" cx="66.8" cy="217" r="7"/>
<circle class="pr1-neg" cx="100.3" cy="217" r="7"/>
<circle class="pr1-neg" cx="140.5" cy="217" r="7"/>
<circle class="pr1-neg" cx="194.1" cy="217" r="7"/>
<circle class="pr1-neg" cx="244.35" cy="217" r="7"/>
<path class="pr1-pos" d="M160.6 209 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M224.25 209 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M274.5 209 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M311.35 209 l8 14 l-16 0 Z"/>
<path class="pr1-pos" d="M351.55 209 l8 14 l-16 0 Z"/>
<text class="pr1-m" x="207" y="266" text-anchor="middle">모델이 출력한 양성 확률</text>
</svg>
</div>

임계값을 0.25로 내리면 양성 다섯 개를 하나도 놓치지 않는다(Recall 100%). 대신 음성 세 개가 딸려 들어와 Precision이 62.5%로 떨어진다. 0.65로 올리면 양성이라 부른 셋이 전부 진짜 양성이지만(Precision 100%), 애매한 위치의 양성 둘을 놓쳐 Recall이 60%가 된다. 두 분포가 완전히 갈라지지 않는 한 이 교환은 피할 수 없다.

그래서 지표를 고르는 일은 사실 **어느 쪽 오류를 더 아프게 볼 것인가**를 정하는 일이다.

| 도메인 | 더 아픈 실수 | 우선 지표 |
|---|---|---|
| 스팸 필터 | FP. 업무 메일이 스팸함으로 사라진다 | Precision |
| 상품 추천 | FP. 엉뚱한 추천이 이탈을 부른다 | Precision |
| 암 조기 검진 | FN. 환자를 정상이라며 돌려보낸다 | Recall |
| 악성코드 탐지 | FN. 감염이 조용히 퍼진다 | Recall |

임계값을 0에서 1까지 훑으면서 (Recall, Precision) 쌍을 기록하면 PR 곡선(Precision-Recall Curve)이 된다. 곡선이 우상단 꼭짓점에 붙을수록 좋은 모델이고, 이 곡선 아래 면적을 요약한 값이 AP(Average Precision), 흔히 PR-AUC라 부르는 숫자다.

## F1이 조화평균인 이유

Precision과 Recall을 한 숫자로 합치고 싶을 때 산술평균을 쓰면 안 된다. Precision 1.0, Recall 0.01인 모델은 양성을 사실상 하나도 못 잡는데 산술평균은 0.505라는 멀쩡한 점수를 준다.

F1은 조화평균을 쓴다.

$$F_1 = 2 \cdot \frac{P \cdot R}{P + R}$$

산술평균은 큰 값에 끌려가고 조화평균은 작은 값에 끌려간다. 두 값 중 하나가 0에 가까우면 곱 $P \cdot R$이 먼저 무너지기 때문에 결과도 같이 무너진다. 위 예에서 F1은 $2 \times 0.01 / 1.01 = 0.02$다.

| Precision | Recall | 산술평균 | F1 |
|---|---|---|---|
| 0.9 | 0.9 | 0.90 | 0.90 |
| 0.8 | 0.6 | 0.70 | 0.69 |
| 0.6 | 0.4 | 0.50 | 0.48 |
| 1.0 | 0.01 | 0.505 | 0.02 |

두 값이 비슷하면 두 평균이 거의 같고, 벌어질수록 F1이 훨씬 인색해진다.

F1은 Precision과 Recall에 같은 무게를 준다. 한쪽이 더 중요한 상황이라면 $F_\beta$로 기울인다.

$$F_\beta = (1 + \beta^2) \cdot \frac{P \cdot R}{\beta^2 P + R}$$

$\beta$는 **Recall을 Precision보다 몇 배 중요하게 볼 것인가**를 뜻한다. $\beta = 2$면 놓치지 않는 쪽에 무게를 싣고($F_2$, 암 검진), $\beta = 0.5$면 헛경보를 줄이는 쪽에 무게를 싣는다($F_{0.5}$, 스팸 필터). $\beta = 1$이 F1이다.

```python
from sklearn.metrics import fbeta_score

f2 = fbeta_score(y_true, y_pred, beta=2)      # 놓치지 않는 게 우선
f05 = fbeta_score(y_true, y_pred, beta=0.5)   # 헛경보를 줄이는 게 우선
```

## ROC 곡선과 AUC

ROC(Receiver Operating Characteristic) 곡선도 임계값을 훑으면서 그리지만 세로축과 가로축이 다르다. 세로축은 TPR로 Recall과 같은 값이고, 가로축은 FPR, 즉 실제 음성 중 양성으로 잘못 분류한 비율이다.

$$\text{TPR} = \frac{TP}{TP+FN}, \qquad \text{FPR} = \frac{FP}{FP+TN} = 1 - \text{Specificity}$$

임계값 1에서 시작하면 아무것도 양성으로 부르지 않으니 원점 (0, 0)이고, 임계값 0이면 전부 양성으로 부르니 (1, 1)이다. 그 사이를 어떻게 지나가느냐가 모델의 실력이다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 408" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="ROC 곡선 그림. 가로축이 FPR, 세로축이 TPR이고 대각선이 무작위 기준선이다. 좌상단으로 부푼 곡선 아래를 칠한 면적이 AUC 0.85다.">
<style>
.roc1-t { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.roc1-l { font-size: 15px; fill: var(--text, #1c1917); }
.roc1-m { font-size: 14px; fill: var(--text-muted, #6d6762); }
.roc1-ax { stroke: var(--text-muted, #6d6762); stroke-width: 1.4; fill: none; }
.roc1-diag { stroke: var(--text-muted, #6d6762); stroke-width: 2; stroke-dasharray: 6 4; fill: none; }
.roc1-curve { stroke: var(--primary, #0a756c); stroke-width: 2.5; fill: none; stroke-linejoin: round; }
.roc1-area { fill: var(--primary, #0a756c); fill-opacity: 0.16; stroke: none; }
</style>
<text class="roc1-t" x="200" y="26" text-anchor="middle">ROC 곡선과 AUC 면적</text>
<!-- 플롯 영역 -->
<rect x="68" y="48" width="260" height="260" rx="4" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/>
<!-- 곡선 아래 면적 -->
<path class="roc1-area" d="M 68.0 308.0 L 68.2 297.8 L 68.4 289.9 L 68.7 282.7 L 69.1 276.6 L 69.6 269.3 L 70.3 260.5 L 71.4 250.0 L 72.9 237.6 L 73.9 230.7 L 75.2 223.3 L 76.7 215.3 L 78.5 206.8 L 80.7 197.8 L 83.3 188.3 L 86.5 178.3 L 90.3 167.8 L 94.9 156.9 L 100.5 145.7 L 107.3 134.3 L 115.5 122.8 L 125.4 111.3 L 137.3 100.0 L 151.7 89.0 L 169.1 78.8 L 190.1 69.4 L 215.5 61.3 L 246.2 54.7 L 283.2 50.1 L 328.0 48.0 L 328.0 308.0 Z"/>
<!-- 무작위 기준선 -->
<path class="roc1-diag" d="M 68 308 L 328 48"/>
<!-- ROC 곡선 -->
<path class="roc1-curve" d="M 68.0 308.0 L 68.2 297.8 L 68.4 289.9 L 68.7 282.7 L 69.1 276.6 L 69.6 269.3 L 70.3 260.5 L 71.4 250.0 L 72.9 237.6 L 73.9 230.7 L 75.2 223.3 L 76.7 215.3 L 78.5 206.8 L 80.7 197.8 L 83.3 188.3 L 86.5 178.3 L 90.3 167.8 L 94.9 156.9 L 100.5 145.7 L 107.3 134.3 L 115.5 122.8 L 125.4 111.3 L 137.3 100.0 L 151.7 89.0 L 169.1 78.8 L 190.1 69.4 L 215.5 61.3 L 246.2 54.7 L 283.2 50.1 L 328.0 48.0"/>
<!-- 축 -->
<path class="roc1-ax" d="M 68 48 L 68 308 L 328 308"/>
<path class="roc1-ax" d="M 63 48 L 68 48 M 63 178 L 68 178 M 63 308 L 68 308"/>
<path class="roc1-ax" d="M 68 308 L 68 313 M 198 308 L 198 313 M 328 308 L 328 313"/>
<!-- 눈금 -->
<text class="roc1-m" x="62" y="53" text-anchor="end">1.0</text>
<text class="roc1-m" x="62" y="183" text-anchor="end">0.5</text>
<text class="roc1-m" x="62" y="313" text-anchor="end">0</text>
<text class="roc1-m" x="68" y="328" text-anchor="middle">0</text>
<text class="roc1-m" x="198" y="328" text-anchor="middle">0.5</text>
<text class="roc1-m" x="328" y="328" text-anchor="middle">1.0</text>
<!-- 축 이름 -->
<text class="roc1-l" x="26" y="178" text-anchor="middle" transform="rotate(-90 26 178)">TPR (Recall)</text>
<text class="roc1-l" x="198" y="350" text-anchor="middle">FPR (1 - Specificity)</text>
<!-- 면적 값 -->
<text class="roc1-t" x="245" y="248" text-anchor="middle">AUC 0.85</text>
<!-- 범례 -->
<path class="roc1-curve" d="M 95 369 L 129 369"/>
<text class="roc1-l" x="137" y="374">ROC 곡선</text>
<path class="roc1-diag" d="M 95 391 L 129 391"/>
<text class="roc1-l" x="137" y="396">무작위 기준선 (AUC 0.5)</text>
</svg>
</div>

AUC는 이 곡선 아래 면적이다. 무작위로 찍는 분류기는 대각선을 그리므로 AUC가 0.5이고, 완벽한 분류기는 좌상단 꼭짓점을 지나 1이 된다.

AUC에는 깔끔한 확률적 해석이 있다. **양성 샘플 하나와 음성 샘플 하나를 무작위로 뽑았을 때, 모델이 양성 쪽에 더 높은 점수를 줄 확률**이 곧 AUC다. AUC 0.85는 그 순서 맞히기를 100번 중 85번 성공한다는 뜻이다. 임계값을 하나로 고정하지 않고 순위 매기는 능력만 보기 때문에, 임계값을 정하기 전 모델끼리 비교하는 데 편하다.

```python
from sklearn.metrics import roc_curve, roc_auc_score

fpr, tpr, thresholds = roc_curve(y_true, y_scores)
auc = roc_auc_score(y_true, y_scores)
```

## 불균형에서는 PR 곡선을 봐라

AUC가 임계값에 독립적이라는 장점은 그대로 함정이 되기도 한다. 음성이 압도적으로 많으면 FPR의 분모가 커져서 어지간한 오탐으로는 눈금이 움직이지 않는다.

음성 9,900개, 양성 100개인 사기 탐지를 보자. 모델이 200건을 사기로 지목했고 그중 90건이 진짜였다고 하자.

$$\text{TPR} = \frac{90}{100} = 0.90, \qquad \text{FPR} = \frac{110}{9900} \approx 0.011$$

ROC 평면에서 (0.011, 0.90)은 좌상단에 바짝 붙은 훌륭한 점이다. 그런데 같은 결과를 Precision으로 보면 $90 / 200 = 0.45$다. 사기라고 경보를 울린 것의 절반 이상이 헛것이다. 조사 인력을 배정해야 하는 현장에서는 이쪽이 진실에 가깝다.

차이의 원인은 하나다. FPR은 분모에 TN을 쓰고 Precision은 쓰지 않는다. 음성이 많을수록 TN이 FP를 희석해서 ROC 곡선을 낙관적으로 만든다.

| 기준 | ROC 곡선 | PR 곡선 |
|---|---|---|
| 축 | FPR 대 TPR | Recall 대 Precision |
| TN 사용 | 쓴다(FPR의 분모) | 쓰지 않는다 |
| 무작위 기준선 | 대각선, AUC 0.5 | 양성 비율 높이의 수평선 |
| 불균형 데이터 | 낙관적으로 보인다 | 성능 저하가 그대로 드러난다 |

무작위 기준선이 다르다는 점도 실무에서 자주 걸린다. ROC-AUC 0.5는 어떤 데이터에서도 무작위지만, PR-AUC의 기준선은 양성 비율 그 자체다. 양성이 1%인 데이터에서 PR-AUC 0.4는 기준선 0.01의 40배이므로 나쁘지 않은 성적이다. 절대값만 보고 낮다고 판단하면 안 된다.

```python
from sklearn.metrics import roc_auc_score, average_precision_score

print(f"ROC-AUC: {roc_auc_score(y_true, y_scores):.3f}")
print(f"PR-AUC : {average_precision_score(y_true, y_scores):.3f}")
```

## 다중 클래스에서 평균 내는 세 가지 방법

클래스가 셋 이상이면 Precision, Recall, F1은 클래스마다 하나씩 나온다. 이걸 대표값 하나로 합치는 방식이 세 가지다.

| 방식 | 계산 | 성격 |
|---|---|---|
| Macro | 클래스별 지표를 단순 평균 | 클래스마다 같은 무게. 샘플 열 개짜리 소수 클래스가 점수를 크게 흔든다 |
| Micro | 전체 TP, FP, FN을 먼저 합산한 뒤 계산 | 샘플마다 같은 무게. 샘플이 많은 클래스가 점수를 거의 정한다 |
| Weighted | 클래스별 지표를 샘플 수로 가중 평균 | Micro와 Macro 사이. 다수 클래스 쪽으로 기운다 |

샘플 하나가 정확히 한 레이블을 갖는 보통의 다중 분류에서는 Micro Precision, Micro Recall, Micro F1이 전부 Accuracy와 같은 값이 된다. 틀린 예측 하나는 자기가 지목한 클래스에 FP를, 정답 클래스에 FN을 하나씩 남기므로 $\sum FP = \sum FN$이고, 그래서 Micro Precision과 Micro Recall이 같아진다. 두 값이 같으면 조화평균인 Micro F1도 같은 값이다. 게다가 샘플마다 예측이 정확히 하나씩이니 $\sum TP + \sum FP = n$이고, 결국 $\sum TP / n$, 곧 Accuracy다. 단일 레이블 문제에서 Micro F1을 보고하는 건 Accuracy를 다른 이름으로 부르는 셈이다.

소수 클래스가 중요한 문제라면 Macro F1을 본다. 클래스마다 같은 표를 주기 때문에 소수 클래스가 망가지면 점수가 바로 내려간다.

## 지표 고르기

| 상황 | 지표 |
|---|---|
| 클래스가 대체로 균형이고 두 오류 비용이 비슷하다 | Accuracy |
| 헛경보가 비싸다 | Precision, $F_{0.5}$ |
| 놓치는 게 비싸다 | Recall, $F_2$ |
| 둘 다 챙겨야 한다 | F1 |
| 양성이 극소수다 | PR-AUC |
| 임계값을 정하기 전 모델끼리 비교한다 | ROC-AUC |
| 클래스가 여럿이고 소수 클래스가 중요하다 | Macro F1 |

:::tip

**주 지표 하나에 보조 지표 두엇을 붙여라**

의사결정 기준은 하나여야 실험이 굴러가지만, 보고에는 반대편 지표를 반드시 같이 적는다. 암 검진 모델의 주 지표를 Recall로 잡았다면 Precision이 어디까지 내려갔는지 함께 본다. 헛경보가 너무 잦으면 의료진이 알림 자체를 무시하기 시작해서, 장부상의 Recall이 현장에서 실현되지 않는다.

:::

불균형 데이터라면 보고서에 양성 비율을 같이 적는 습관도 도움이 된다. 그 숫자가 없으면 PR-AUC를 읽는 사람이 기준선을 모르고, Accuracy를 읽는 사람은 99%가 어디서 왔는지 모른다.

## 마치며

분류 지표를 고르는 일은 통계 문제가 아니라 비용 문제다. 혼동 행렬의 네 칸 중 FP와 FN 가운데 무엇이 더 비싼지를 먼저 정하면 지표는 거의 자동으로 따라온다. 그 판단 없이 F1이나 AUC를 습관처럼 집으면, 실제로는 아무도 원하지 않는 균형점에서 모델을 최적화하게 된다.

임계값이 하이퍼파라미터라는 사실도 같이 기억할 만하다. 학습이 끝난 모델의 성능은 고정된 하나의 숫자가 아니라 임계값을 따라 움직이는 곡선이고, Precision과 Recall은 그 곡선 위의 서로 다른 두 좌표다. 배포 직전에 검증 데이터로 임계값을 다시 고르는 것만으로 재학습 없이 원하는 균형을 만들 수 있는 경우가 많다.

다음 글에서는 연속값을 예측하는 회귀 모델을 다룬다. 맞았다와 틀렸다로 나눌 수 없는 예측을 어떤 자로 재는지가 주제다.

## 함께 보면 좋은 글

- [로지스틱 회귀](/ml/logistic-regression/) : 임계값과 비교할 확률 출력이 어디서 나오는지
- [결정 경계](/ml/decision-boundary/) : 임계값을 움직이면 경계가 어느 쪽으로 밀리는지
- [교차 검증](/ml/cross-validation/) : 이 지표들을 흔들리지 않게 재는 방법

## 참고자료

- [Scikit-learn, Metrics and scoring: quantifying the quality of predictions](https://scikit-learn.org/stable/modules/model_evaluation.html)
- [Scikit-learn, sklearn.metrics.confusion_matrix](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html)
- [Saito & Rehmsmeier, "The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets", PLOS ONE (2015)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0118432)
- [Gareth James et al., "An Introduction to Statistical Learning", Chapter 4](https://www.statlearning.com/)
