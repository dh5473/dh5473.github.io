---
date: '2026-01-12'
title: '마진을 최대화하는 분류기 서포트 벡터 머신(SVM)'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 12
tags: ['SVM', 'Support Vector Machine', '커널 트릭', '마진 최대화', '힌지 손실', '머신러닝']
summary: '두 클래스 사이에 가장 넓은 도로를 내는 SVM. 마진과 서포트 벡터의 기하학, 힌지 손실과 C 파라미터, 변환 없이 비선형을 다루는 커널 트릭을 정리한다.'
thumbnail: './thumbnail.png'
---

두 클래스를 가르는 직선은 무수히 많다. 훈련 데이터를 100% 맞히는 직선만 추려도 여전히 무수히 많다. 그중 어느 것을 고를 것인가에 대한 SVM의 답은 명확하다. **두 클래스 사이에 가장 넓은 도로를 깔 수 있는 선.** 그 도로의 폭이 **마진(Margin)** 이다.

## 가장 넓은 도로를 내는 경계

경계를 초평면 $w^\top x + b = 0$ 으로 두면, 분류는 부호를 보는 일이 된다. $w^\top x + b$ 가 양수면 한쪽 클래스, 음수면 다른 쪽이다. 여기까지는 로지스틱 회귀와 같다. 갈리는 지점은 $w$ 와 $b$ 를 어떤 기준으로 정하느냐다.

레이블을 $y_i \in \{-1, +1\}$ 로 두고 모든 점이 경계에서 최소한 이만큼은 떨어져 있어야 한다고 요구한다.

$$y_i (w^\top x_i + b) \ge 1$$

이 부등식을 만족하는 $w$ 중에서 마진이 가장 넓은 것을 고른다. 마진의 폭은 $2 / \lVert w \rVert$ 이므로, 넓히는 것은 곧 $\lVert w \rVert$ 를 줄이는 것과 같다.

$$\min_{w,\,b} \frac{1}{2}\lVert w \rVert^2 \quad \text{s.t.} \quad y_i (w^\top x_i + b) \ge 1$$

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 360" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="결정 경계와 그 양쪽의 마진 경계, 마진 위에 정확히 놓여 경계를 지탱하는 서포트 벡터를 표시한 그림">
<defs>
<marker id="svm1ArrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text, #1c1917)"/></marker>
<marker id="svm1ArrS" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="var(--text, #1c1917)"/></marker>
</defs>
<style>
.svm1-a { fill: var(--primary, #0a756c); }
.svm1-b { fill: var(--accent, #9d5604); }
.svm1-h { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.svm1-t { font-size: 16px; fill: var(--text, #1c1917); }
.svm1-s { font-size: 14px; fill: var(--text-muted, #6d6762); }
.svm1-sv { fill: none; stroke: var(--text, #1c1917); stroke-width: 2; }
.svm1-m { fill: none; stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 4; }
</style>
<text x="200" y="24" text-anchor="middle" class="svm1-h">마진이 가장 넓은 경계</text>
<!-- 마진 띠와 세 직선 -->
<polygon points="19,209 319,59 361,141 61,291" fill="var(--bg-muted, #eeecea)"/>
<line x1="19" y1="209" x2="319" y2="59" class="svm1-m"/>
<line x1="61" y1="291" x2="361" y2="141" class="svm1-m"/>
<line x1="40" y1="250" x2="340" y2="100" stroke="var(--text, #1c1917)" stroke-width="2.5"/>
<line x1="49" y1="194" x2="91" y2="276" stroke="var(--text, #1c1917)" stroke-width="1.8" marker-start="url(#svm1ArrS)" marker-end="url(#svm1ArrE)"/>
<text x="116" y="243" text-anchor="middle" class="svm1-t">마진</text>
<!-- 클래스 A : 위쪽 -->
<circle cx="29" cy="154" r="6.5" class="svm1-a"/><circle cx="107" cy="122" r="6.5" class="svm1-a"/><circle cx="138" cy="71" r="6.5" class="svm1-a"/>
<circle cx="44" cy="107" r="6.5" class="svm1-a"/><circle cx="212" cy="68" r="6.5" class="svm1-a"/><circle cx="119" cy="92" r="6.5" class="svm1-a"/>
<!-- 클래스 B : 아래쪽 -->
<polygon points="119,281 126,293 112,293" class="svm1-b"/><polygon points="175,283 182,295 168,295" class="svm1-b"/><polygon points="256,225 263,237 249,237" class="svm1-b"/>
<polygon points="344,176 351,188 337,188" class="svm1-b"/><polygon points="302,242 309,254 295,254" class="svm1-b"/><polygon points="219,265 226,277 212,277" class="svm1-b"/>
<!-- 서포트 벡터 : 마진 위에 정확히 놓인 점 -->
<circle cx="94" cy="172" r="6.5" class="svm1-a"/><circle cx="94" cy="172" r="11" class="svm1-sv"/>
<circle cx="205" cy="116" r="6.5" class="svm1-a"/><circle cx="205" cy="116" r="11" class="svm1-sv"/>
<polygon points="196,217 203,229 189,229" class="svm1-b"/><circle cx="196" cy="224" r="11" class="svm1-sv"/>
<polygon points="295,167 302,179 288,179" class="svm1-b"/><circle cx="295" cy="174" r="11" class="svm1-sv"/>
<!-- 범례 -->
<line x1="95" y1="317" x2="123" y2="317" stroke="var(--text, #1c1917)" stroke-width="2.5"/><text x="129" y="322" class="svm1-s">결정 경계</text>
<line x1="215" y1="317" x2="243" y2="317" class="svm1-m"/><text x="249" y="322" class="svm1-s">마진 경계</text>
<circle cx="70" cy="339" r="6.5" class="svm1-a"/><text x="80" y="344" class="svm1-s">클래스 A</text>
<polygon points="152,332 159,344 145,344" class="svm1-b"/><text x="162" y="344" class="svm1-s">클래스 B</text>
<circle cx="236" cy="339" r="6.5" class="svm1-a"/><circle cx="236" cy="339" r="11" class="svm1-sv"/><text x="252" y="344" class="svm1-s">서포트 벡터</text>
</svg>
</div>

동그라미가 쳐진 네 점이 마진 경계에 정확히 걸쳐 있다. 부등식이 등호로 성립하는 점들, 즉 **서포트 벡터(Support Vector)** 다. 이름 그대로 경계를 지탱한다. 서포트 벡터가 아닌 점은 아무리 많아도, 아무리 멀리 옮겨도 경계가 움직이지 않고, 반대로 서포트 벡터 하나를 옮기면 경계 전체가 따라 움직인다. 여기서 SVM의 두 가지 성격이 한꺼번에 나온다. 학습이 끝나면 서포트 벡터만 남기고 나머지를 버려도 되니 모델이 가볍고, 데이터의 대다수가 결정에 관여하지 않으니 경계에서 먼 곳의 이상치 몇 개에는 흔들리지 않는다.

## 소프트 마진과 힌지 손실

위 부등식은 두 클래스가 직선 하나로 완벽히 갈린다고 가정한다. **하드 마진(Hard Margin)** 이다. 클래스가 조금이라도 겹치면 부등식을 전부 만족하는 $w$ 가 존재하지 않아 해가 없다.

그래서 실제로는 위반을 허용하되 값을 치르게 한다. 점 $i$ 가 마진 안쪽으로 얼마나 들어왔는지를 재는 **힌지 손실(Hinge Loss)** 을 목적 함수에 더하는 것이다. 마진 밖에 제대로 있으면 0이고, 안으로 들어온 만큼 선형으로 커진다. 이것이 **소프트 마진(Soft Margin)** 이다.

$$\min_{w,\,b} \; \frac{1}{2}\lVert w \rVert^2 + C \sum_{i=1}^{n} \max\left(0,\; 1 - y_i (w^\top x_i + b)\right)$$

앞의 항은 마진을 넓히려 하고 뒤의 항은 위반을 줄이려 한다. 둘의 힘겨루기를 조절하는 것이 **C**다. C가 크면 위반 하나하나가 비싸지므로 마진을 희생해서라도 훈련 데이터를 맞히려 들고, 작으면 몇 개쯤 틀려도 좋으니 마진을 넓히는 쪽으로 간다. 규제 항이 앞에 붙어 있는 구조이므로 C는 규제 강도의 역수로 동작한다. 이 방향이 헷갈리기 쉬운데, `LogisticRegression(C=1.0)` 의 C도 똑같이 "작을수록 규제가 세다".

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 570" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 점 배치에 C를 작게 잡으면 마진이 넓어지는 대신 마진 안쪽에 점 두 개가 들어오고, C를 크게 잡으면 마진 안쪽에 아무 점도 들이지 않는 대신 마진이 좁아진다는 것을 위아래 두 패널로 비교한 그림">
<defs>
<marker id="svm3ArrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text, #1c1917)"/></marker>
<marker id="svm3ArrS" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="var(--text, #1c1917)"/></marker>
</defs>
<style>
.svm3-a { fill: var(--primary, #0a756c); }
.svm3-b { fill: var(--accent, #9d5604); }
.svm3-h { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.svm3-p { font-size: 15px; font-weight: 600; fill: var(--text, #1c1917); }
.svm3-s { font-size: 14px; fill: var(--text-muted, #6d6762); }
.svm3-sv { fill: none; stroke: var(--text, #1c1917); stroke-width: 2; }
.svm3-m { fill: none; stroke: var(--text-muted, #6d6762); stroke-width: 1.5; stroke-dasharray: 5 4; }
.svm3-box { fill: none; stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<text x="200" y="24" text-anchor="middle" class="svm3-h">C가 정하는 마진의 폭</text>
<!-- 위 패널 : C 작음 -->
<text x="200" y="54" text-anchor="middle" class="svm3-p">위 : C 작음, 넓은 마진</text>
<text x="200" y="74" text-anchor="middle" class="svm3-s">마진 위반 2점</text>
<rect x="44" y="84" width="312" height="188" rx="6" class="svm3-box"/>
<rect x="45" y="137" width="310" height="70" fill="var(--bg-muted, #eeecea)"/>
<line x1="45" y1="137" x2="355" y2="137" class="svm3-m"/>
<line x1="45" y1="207" x2="355" y2="207" class="svm3-m"/>
<line x1="45" y1="172" x2="355" y2="172" stroke="var(--text, #1c1917)" stroke-width="2.5"/>
<line x1="90" y1="139" x2="90" y2="205" stroke="var(--text, #1c1917)" stroke-width="1.8" marker-start="url(#svm3ArrS)" marker-end="url(#svm3ArrE)"/>
<text x="100" y="162" class="svm3-s">마진</text>
<circle cx="70" cy="117" r="6.5" class="svm3-a"/><circle cx="110" cy="102" r="6.5" class="svm3-a"/><circle cx="190" cy="100" r="6.5" class="svm3-a"/>
<circle cx="230" cy="114" r="6.5" class="svm3-a"/><circle cx="270" cy="106" r="6.5" class="svm3-a"/><circle cx="310" cy="120" r="6.5" class="svm3-a"/>
<polygon points="80,230 87,242 73,242" class="svm3-b"/><polygon points="120,243 127,255 113,255" class="svm3-b"/><polygon points="160,220 167,232 153,232" class="svm3-b"/>
<polygon points="200,237 207,249 193,249" class="svm3-b"/><polygon points="280,225 287,237 273,237" class="svm3-b"/><polygon points="320,240 327,252 313,252" class="svm3-b"/>
<circle cx="150" cy="163" r="6.5" class="svm3-a"/><circle cx="150" cy="163" r="11" class="svm3-sv"/>
<polygon points="240,186 247,198 233,198" class="svm3-b"/><circle cx="240" cy="193" r="11" class="svm3-sv"/>
<!-- 아래 패널 : C 큼 -->
<text x="200" y="302" text-anchor="middle" class="svm3-p">아래 : C 큼, 좁은 마진</text>
<text x="200" y="322" text-anchor="middle" class="svm3-s">마진 위반 0점</text>
<rect x="44" y="332" width="312" height="188" rx="6" class="svm3-box"/>
<polygon points="45,397 355,438 355,456 45,415" fill="var(--bg-muted, #eeecea)"/>
<line x1="45" y1="397" x2="355" y2="438" class="svm3-m"/>
<line x1="45" y1="415" x2="355" y2="456" class="svm3-m"/>
<line x1="45" y1="406" x2="355" y2="447" stroke="var(--text, #1c1917)" stroke-width="2.5"/>
<circle cx="70" cy="365" r="6.5" class="svm3-a"/><circle cx="110" cy="350" r="6.5" class="svm3-a"/><circle cx="190" cy="348" r="6.5" class="svm3-a"/>
<circle cx="230" cy="362" r="6.5" class="svm3-a"/><circle cx="270" cy="354" r="6.5" class="svm3-a"/><circle cx="310" cy="368" r="6.5" class="svm3-a"/>
<polygon points="80,478 87,490 73,490" class="svm3-b"/><polygon points="120,491 127,503 113,503" class="svm3-b"/><polygon points="160,468 167,480 153,480" class="svm3-b"/>
<polygon points="200,485 207,497 193,497" class="svm3-b"/><polygon points="280,473 287,485 273,485" class="svm3-b"/><polygon points="320,488 327,500 313,500" class="svm3-b"/>
<circle cx="150" cy="411" r="6.5" class="svm3-a"/><circle cx="150" cy="411" r="11" class="svm3-sv"/>
<polygon points="240,434 247,446 233,446" class="svm3-b"/><circle cx="240" cy="441" r="11" class="svm3-sv"/>
<!-- 범례 -->
<circle cx="78" cy="548" r="6.5" class="svm3-a"/><text x="88" y="553" class="svm3-s">클래스 A</text>
<polygon points="156,541 163,553 149,553" class="svm3-b"/><text x="166" y="553" class="svm3-s">클래스 B</text>
<circle cx="238" cy="548" r="6.5" class="svm3-a"/><circle cx="238" cy="548" r="11" class="svm3-sv"/><text x="254" y="553" class="svm3-s">서포트 벡터</text>
</svg>
</div>

두 패널의 점 배치는 같고 C만 다르다. 위쪽은 두 점을 마진 안에 들이면서 도로를 넓게 냈고, 아래쪽은 아무도 들이지 않는 대신 도로가 좁아졌다. 어느 쪽이 나은지는 데이터가 정한다. 반달 모양 데이터에서 C만 바꿔가며 교차 검증 정확도를 재보면 양쪽 끝이 모두 나쁘다.

```python
from sklearn.svm import SVC
from sklearn.datasets import make_moons
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

X, y = make_moons(n_samples=200, noise=0.35, random_state=42)

for C in [0.01, 0.1, 1, 10, 100]:
    pipe = Pipeline([('scaler', StandardScaler()),
                     ('svc', SVC(kernel='rbf', C=C))])
    scores = cross_val_score(pipe, X, y, cv=5)
    print(f"C={C:6.2f} | 정확도: {scores.mean():.3f} (±{scores.std():.3f})")
```

```text
C=  0.01 | 정확도: 0.810 (±0.025)
C=  0.10 | 정확도: 0.840 (±0.025)
C=  1.00 | 정확도: 0.870 (±0.029)
C= 10.00 | 정확도: 0.860 (±0.044)
C=100.00 | 정확도: 0.840 (±0.044)
```

C=0.01에서는 경계가 너무 무뎌 과소적합이고, C=100에서는 잡음 하나까지 맞히려다 과적합이다. 표준편차가 C와 함께 커지는 것도 눈여겨볼 만하다. C가 클수록 결정 경계가 어느 폴드가 걸리느냐에 더 민감해진다.

`noise=0.35`는 두 반달이 실제로 겹치도록 크게 잡은 값이다. 같은 코드에서 잡음만 0.3으로 낮추면 C를 키울수록 정확도가 올라가기만 해서 오른쪽 끝의 과적합이 나타나지 않는다. C를 크게 잡는 것이 손해가 되려면 경계 근처에 겹치는 점이 애초에 있어야 한다는 뜻이고, 소프트 마진이 필요한 상황도 정확히 그 상황이다.

## 커널 트릭

여기까지의 SVM은 직선만 긋는다. 그런데 한 클래스가 다른 클래스를 원형으로 감싸고 있는 배치라면 어떤 직선으로도 갈라지지 않는다. 해법은 차원을 올리는 것이다. 원점에서의 거리 제곱을 새 축 $z = x_1^2 + x_2^2$ 로 추가하면 안쪽 점들은 $z$ 가 작고 바깥 점들은 크므로, 평면 하나로 깔끔하게 갈린다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 560" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="2차원에서 한 클래스가 다른 클래스를 원형으로 감싸 직선으로 나눌 수 없지만 원점 거리 제곱을 새 축으로 추가하면 평면 하나로 나뉘는 것을 보여주는 그림">
<defs>
<marker id="svm2Arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted, #6d6762)"/></marker>
</defs>
<style>
.svm2-a { fill: var(--primary, #0a756c); }
.svm2-b { fill: var(--accent, #9d5604); }
.svm2-h { font-size: 17px; font-weight: 700; fill: var(--text, #1c1917); }
.svm2-t { font-size: 15px; fill: var(--text, #1c1917); }
.svm2-s { font-size: 14px; fill: var(--text-muted, #6d6762); }
.svm2-no { font-size: 15px; fill: var(--text-danger, #cb2121); }
.svm2-ok { font-size: 15px; fill: var(--text-success, #107836); }
.svm2-p { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1; }
</style>
<!-- 위 : 원래의 2차원 -->
<text x="200" y="24" text-anchor="middle" class="svm2-h">2차원 원본</text>
<rect x="60" y="40" width="280" height="214" rx="6" class="svm2-p"/>
<circle cx="200" cy="149" r="6.5" class="svm2-a"/><circle cx="175" cy="135" r="6.5" class="svm2-a"/><circle cx="222" cy="160" r="6.5" class="svm2-a"/><circle cx="190" cy="175" r="6.5" class="svm2-a"/>
<circle cx="216" cy="128" r="6.5" class="svm2-a"/><circle cx="168" cy="163" r="6.5" class="svm2-a"/><circle cx="205" cy="120" r="6.5" class="svm2-a"/>
<polygon points="285,142 292,154 278,154" class="svm2-b"/><polygon points="260,82 267,94 253,94" class="svm2-b"/><polygon points="200,57 207,69 193,69" class="svm2-b"/><polygon points="140,82 147,94 133,94" class="svm2-b"/>
<polygon points="115,142 122,154 108,154" class="svm2-b"/><polygon points="140,202 147,214 133,214" class="svm2-b"/><polygon points="200,227 207,239 193,239" class="svm2-b"/><polygon points="260,202 267,214 253,214" class="svm2-b"/>
<polygon points="292,104 299,116 285,116" class="svm2-b"/><polygon points="162,50 169,62 155,62" class="svm2-b"/><polygon points="108,180 115,192 101,192" class="svm2-b"/><polygon points="238,234 245,246 231,246" class="svm2-b"/>
<text x="200" y="274" text-anchor="middle" class="svm2-no">선형 분리 불가</text>
<line x1="200" y1="290" x2="200" y2="316" stroke="var(--text-muted, #6d6762)" stroke-width="2" marker-end="url(#svm2Arr)"/>
<text x="212" y="308" class="svm2-t">z = x1² + x2² 추가</text>
<!-- 아래 : z 축을 더한 공간 -->
<text x="200" y="340" text-anchor="middle" class="svm2-h">z 축을 더한 공간</text>
<rect x="60" y="356" width="280" height="148" rx="6" class="svm2-p"/>
<text x="46" y="434" class="svm2-s">z</text>
<polygon points="88,385 95,397 81,397" class="svm2-b"/><polygon points="122,371 129,383 115,383" class="svm2-b"/><polygon points="156,391 163,403 149,403" class="svm2-b"/><polygon points="190,375 197,387 183,387" class="svm2-b"/>
<polygon points="224,387 231,399 217,399" class="svm2-b"/><polygon points="258,369 265,381 251,381" class="svm2-b"/><polygon points="292,383 299,395 285,395" class="svm2-b"/><polygon points="322,393 329,405 315,405" class="svm2-b"/>
<line x1="64" y1="435" x2="336" y2="435" stroke="var(--primary, #0a756c)" stroke-width="2.5"/>
<text x="332" y="424" text-anchor="end" class="svm2-s">분리 평면</text>
<circle cx="95" cy="482" r="6.5" class="svm2-a"/><circle cx="130" cy="470" r="6.5" class="svm2-a"/><circle cx="165" cy="478" r="6.5" class="svm2-a"/><circle cx="200" cy="466" r="6.5" class="svm2-a"/>
<circle cx="235" cy="480" r="6.5" class="svm2-a"/><circle cx="270" cy="472" r="6.5" class="svm2-a"/><circle cx="305" cy="484" r="6.5" class="svm2-a"/>
<text x="200" y="522" text-anchor="middle" class="svm2-s">원래 특성 x1</text>
<text x="200" y="546" text-anchor="middle" class="svm2-ok">선형 분리 가능</text>
</svg>
</div>

문제는 비용이다. 특성이 $d$ 개일 때 2차 다항식으로 올리면 새 특성이 $O(d^2)$ 개 생기고, 차수를 높이면 그 수가 폭발한다. 무한 차원으로 올리고 싶다면 아예 계산할 방법이 없다.

**커널 트릭(Kernel Trick)** 이 우회하는 지점이 여기다. SVM의 최적화 문제를 쌍대 형태로 바꾸면 데이터가 오직 두 점의 내적으로만 등장한다. 좌표 자체는 필요 없고 내적값만 있으면 된다는 뜻이다. 그렇다면 변환된 공간의 내적을 원래 좌표에서 바로 계산해주는 함수 $K$ 만 있으면, $\phi$ 로 실제로 옮길 이유가 없다.

$$K(x, x') = \phi(x)^\top \phi(x')$$

| 커널 | 함수 | 쓰는 자리 |
|---|---|---|
| Linear | $K(x,x') = x^\top x'$ | 특성이 많고 선형으로 갈리는 데이터 |
| Polynomial | $K(x,x') = (\gamma\, x^\top x' + r)^d$ | 차수를 정해둔 곡선 경계 |
| RBF | $K(x,x') = \exp(-\gamma \lVert x-x' \rVert^2)$ | 기본값. 무한 차원 매핑에 해당 |

RBF 커널이 대응하는 $\phi$ 는 무한 차원이라 물리적으로 계산이 불가능하다. 그런데도 쓸 수 있는 이유가 커널 트릭이다. 옮기지 않고 내적만 구하기 때문이다.

$\gamma$ 는 각 데이터 포인트의 영향이 미치는 반경을 정한다. 작으면 한 점의 영향이 멀리까지 퍼져 경계가 뭉툭해지고, 크면 각 점 주변에만 좁게 작용해 경계가 점 하나하나를 감싸듯 구불거린다. 결국 C와 같은 방향의 손잡이라, 둘 다 크면 확실하게 과적합한다.

앞의 C 실험과 같은 데이터에 커널만 바꿔가며 5-폴드 교차 검증을 돌리면 이렇게 나온다.

| 커널 | 교차 검증 정확도 |
|---|---|
| linear | 0.815 (±0.030) |
| rbf, $\gamma = 0.1$ | 0.805 (±0.019) |
| rbf, $\gamma = 1$ | 0.880 (±0.043) |
| rbf, $\gamma = 10$ | 0.855 (±0.053) |
| rbf, $\gamma = 100$ | 0.775 (±0.069) |

직선으로는 반달 두 개를 가를 수 없어 81.5%에서 멈춘다. $\gamma$ 가 0.1이면 경계가 거의 직선이라 선형 커널과 다를 게 없고, 1에서 88.0%로 가장 높다. 여기서 더 키우면 경계가 점을 하나씩 감싸기 시작해 100에서는 선형 커널보다도 못해진다.

:::warning

**C와 gamma는 따로 튜닝할 수 없다**

C는 위반을 얼마나 봐줄지, gamma는 경계를 얼마나 구불거리게 할지를 정한다. 한쪽을 고정하고 다른 쪽만 최적화하면 고정한 값에 맞춰진 국소해에 갇힌다. `GridSearchCV`로 두 축을 함께 훑어야 한다.

:::

## 실전 파이프라인

Breast Cancer 데이터셋으로 전처리와 탐색을 한 번에 묶어보자. 스케일링은 선택이 아니다. SVM은 두 점의 거리와 내적으로만 데이터를 보기 때문에, 단위가 큰 변수 하나가 커널 값을 독차지하면 나머지 변수는 없는 것이나 마찬가지가 된다.

```python
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, GridSearchCV

X_train, X_test, y_train, y_test = train_test_split(
    *load_breast_cancer(return_X_y=True), test_size=0.2, random_state=42
)

pipe = Pipeline([('scaler', StandardScaler()), ('svc', SVC())])
param_grid = {'svc__C': [0.1, 1, 10, 100],
              'svc__gamma': ['scale', 0.01, 0.1, 1]}

grid = GridSearchCV(pipe, param_grid, cv=5, n_jobs=-1).fit(X_train, y_train)
print(f"최적 파라미터: {grid.best_params_}")
print(f"CV 정확도: {grid.best_score_:.4f}  테스트: {grid.score(X_test, y_test):.4f}")
```

```text
최적 파라미터: {'svc__C': 1, 'svc__gamma': 'scale'}
CV 정확도: 0.9736  테스트: 0.9825
```

기본값이 그대로 최적으로 뽑혔다. `gamma='scale'` 은 특성 수와 분산에서 gamma를 자동으로 계산하는 값이라, 스케일링을 제대로 했다면 출발점으로 나쁘지 않다는 뜻이다. 같은 분할에서 다른 분류기와 견주면 이렇다.

| 모델 | 훈련 정확도 | 테스트 정확도 |
|---|---|---|
| 로지스틱 회귀 | 0.9868 | 0.9737 |
| KNN (k=5) | 0.9802 | 0.9474 |
| SVM (RBF) | 0.9890 | 0.9825 |

이 데이터에서 SVM이 가장 좋았고, 훈련 정확도가 가장 높은데도 테스트 정확도까지 가장 높다. 학습된 모델이 참조하는 점은 455개 중 104개뿐이다. 나머지 351개는 마진 밖에 안전하게 놓여 있어 경계 결정에 아무 표도 던지지 않았다.

## 언제 SVM을 고를까

SVM이 확실히 앞서는 자리는 특성 수가 표본 수에 견줄 만큼 많은 경우다. 마진 최대화 자체가 모델 복잡도에 제동을 걸기 때문에, 차원이 높아도 거리 기반 모델처럼 무너지지 않는다. 커널만 갈아 끼우면 결정 경계의 모양을 바꿀 수 있다는 점도 다른 모델에는 없는 유연함이다.

발목을 잡는 것은 규모다. libsvm을 쓰는 `SVC`의 학습 시간은 표본 수에 최소한 제곱으로 늘어나서, 수만 건을 넘어가면 현실적이지 않다. 이 구간에서는 `LinearSVC`나 `SGDClassifier`로 내려가거나, 트리 기반 모델과 신경망 쪽으로 넘어가는 편이 낫다.

확률이 필요할 때도 불리하다. SVM이 내놓는 값은 경계까지의 부호 있는 거리이지 확률이 아니라서, `probability=True` 로 Platt scaling을 붙여야 한다. 그런데 이 옵션은 내부에서 5-폴드 교차 검증을 한 번 더 돌리므로 학습이 크게 느려진다.

## 마치며

SVM의 핵심은 경계를 하나 고르는 방식에 있다. 훈련 데이터를 맞히는 경계는 얼마든지 있으니 맞히는 것 말고 다른 기준이 필요한데, SVM은 그 기준으로 여백을 골랐다. 양쪽에서 가장 멀리 떨어진 자리에 경계를 놓으면 새 데이터가 조금 흔들려도 같은 쪽에 떨어진다. 이 선택이 만드는 부수 효과가 서포트 벡터다. 경계가 마진에 걸친 소수의 점으로만 정해지니 모델이 가볍고 이상치에 둔감하다는 성질이 전부 여기서 따라 나온다. 커널 트릭은 이 구조 위에 얹힌 보너스에 가깝다. 최적화 문제가 내적으로만 데이터를 보게 되어 있었기 때문에, 좌표를 옮기지 않고 커널 함수만 바꿔 끼우는 일이 가능했다.

확률로 가르는 로지스틱 회귀, 거리로 가르는 KNN, 여백으로 가르는 SVM까지 왔다. 다음 글에서는 이 모델들이 공통으로 마주치는 문제, 즉 모델이 단순하면 패턴을 놓치고 복잡하면 잡음까지 외우는 편향과 분산의 맞바꿈을 다룬다.

## 함께 보면 좋은 글

- [K-최근접 이웃](/ml/knn/) : 마진 대신 이웃의 다수결로 경계를 정하는 분류기
- [규제](/ml/regularization/) : C의 역수에 해당하는 규제 강도를 회귀에서 다루는 방법
- [편향-분산 트레이드오프](/ml/bias-variance/) : C와 gamma를 왜 함께 조율해야 하는지의 배경

## 참고자료

- [Scikit-learn: Support Vector Machines](https://scikit-learn.org/stable/modules/svm.html)
- [StatQuest: Support Vector Machines (YouTube)](https://www.youtube.com/watch?v=efR1C6CvhmE)
- [An Introduction to Statistical Learning, Chapter 9](https://www.statlearning.com/)
