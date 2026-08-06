---
date: '2026-01-01'
title: '머신러닝은 데이터에서 규칙을 찾는다, 지도·비지도·강화학습'
category: 'Machine Learning'
series: 'ml'
seriesOrder: 1
tags: ['Machine Learning', '머신러닝', '지도학습', '비지도학습', '강화학습', 'Supervised Learning', 'Reinforcement Learning']
summary: '사람이 규칙을 짜던 자리에 데이터를 놓는 것이 머신러닝이다. 이 방향 전환이 무엇을 바꾸는지, 그리고 지도학습·비지도학습·강화학습이 어디에서 갈라지는지 정리한다.'
thumbnail: './thumbnail.png'
---

"AI 공부해야 하는데 어디서부터 시작하지?"

검색을 시작하면 딥러닝, 트랜스포머, LLM 같은 단어부터 쏟아진다. 정작 **머신러닝(Machine Learning)** 이 기존 프로그래밍과 무엇이 다른지, 지도학습과 비지도학습이 어디에서 갈리는지는 건너뛰기 쉽다. 알고리즘을 하나씩 익히기 전에 이 지도를 먼저 그려두면, 뒤에 무엇을 배우든 그게 왜 거기 쓰이는지가 보인다.

## 규칙을 짜는 대신 규칙을 찾는다

전통적인 프로그래밍과 머신러닝의 차이는 무엇이 입력이고 무엇이 출력인지에 있다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 268" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle"
     role="img" aria-label="전통적 프로그래밍은 데이터와 규칙을 넣어 결과를 얻고, 머신러닝은 데이터와 결과를 넣어 규칙을 얻는다는 입출력 방향 비교">
<defs><marker id="ovwAHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/></marker></defs>
<text x="200" y="24" font-size="17" font-weight="700" fill="var(--text, #1c1917)">전통적 프로그래밍</text>
<rect x="14" y="42" width="100" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="64" y="64" font-size="16" fill="var(--text, #1c1917)">데이터</text>
<rect x="14" y="84" width="100" height="34" rx="6" fill="var(--primary, #0a756c)" stroke="var(--primary, #0a756c)"/><text x="64" y="106" font-size="16" fill="var(--on-fill, #ffffff)">규칙</text>
<path d="M 118 59 L 146 74" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<path d="M 118 101 L 146 86" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<rect x="152" y="63" width="88" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="196" y="85" font-size="16" fill="var(--text, #1c1917)">프로그램</text>
<path d="M 244 80 L 270 80" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<rect x="276" y="63" width="104" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="328" y="85" font-size="16" fill="var(--text, #1c1917)">결과</text>
<line x1="14" y1="138" x2="386" y2="138" stroke="var(--border, #e7e5e4)" stroke-dasharray="4 4"/>
<text x="200" y="162" font-size="17" font-weight="700" fill="var(--text, #1c1917)">머신러닝</text>
<rect x="14" y="180" width="100" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="64" y="202" font-size="16" fill="var(--text, #1c1917)">데이터</text>
<rect x="14" y="222" width="100" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="64" y="244" font-size="16" fill="var(--text, #1c1917)">결과</text>
<path d="M 118 197 L 146 212" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<path d="M 118 239 L 146 224" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<rect x="152" y="201" width="88" height="34" rx="6" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="196" y="223" font-size="16" fill="var(--text, #1c1917)">학습</text>
<path d="M 244 218 L 270 218" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwAHead)"/>
<rect x="276" y="201" width="104" height="34" rx="6" fill="var(--primary, #0a756c)" stroke="var(--primary, #0a756c)"/><text x="328" y="223" font-size="16" fill="var(--on-fill, #ffffff)">규칙</text>
</svg>
</div>

스팸 메일 필터로 보면 분명하다. 전통적인 방식에서는 개발자가 규칙을 직접 쓴다. "제목에 '무료'가 들어가면 스팸", "모르는 도메인에서 왔으면 스팸". 문제는 스패머가 규칙을 우회할 때마다 사람이 규칙을 하나씩 덧붙여야 한다는 점이다. 규칙 목록은 계속 길어지고, 어느 순간부터 서로 충돌하기 시작한다.

머신러닝은 규칙을 쓰지 않는다. "스팸", "정상"으로 표시된 메일 수천 통을 넣으면 모델이 그 안에서 판별 기준을 스스로 만든다. 사람이 하는 일은 규칙을 정하는 쪽에서 데이터를 모으고 정답을 붙이는 쪽으로 옮겨간다.

그러면 모델은 무엇을 보고 규칙을 만들까. 어떤 신호를 쥐여주느냐에 따라 세 갈래로 나뉜다. 정답 레이블을 신호로 쓰는 지도학습, 신호 없이 데이터의 구조만 보는 비지도학습, 행동의 결과로 돌아온 보상을 신호로 쓰는 강화학습이다.

## 지도학습

지도학습은 **정답이 붙은 데이터로 모델을 훈련**시킨다. 문제와 정답을 함께 보여주는 과외에 가깝다. "이 입력의 정답은 이거야"를 수천 번 반복하면 모델이 입력과 출력 사이의 관계를 잡아낸다. 레이블이 학습을 감독(supervise)한다고 해서 붙은 이름이고, 레이블이 없으면 아예 성립하지 않는다.

예측하려는 정답의 종류에 따라 둘로 갈린다.

- **회귀(Regression)**: 연속적인 숫자를 예측한다. 면적·방 개수·위치로 집값을 맞히거나, 기온·습도로 내일 온도를 맞힌다.
- **분류(Classification)**: 정해진 카테고리 중 하나를 고른다. 메일이 스팸인지 아닌지, 사진 속 동물이 고양이인지 개인지.

scikit-learn으로 집값 예측 모델을 만들면 이렇다.

```python
from sklearn.linear_model import LinearRegression
import numpy as np

X_train = np.array([[50], [70], [90], [110], [130]])      # 면적(m²)
y_train = np.array([25000, 33000, 41000, 50000, 59000])   # 집값(만원)

model = LinearRegression()
model.fit(X_train, y_train)
model.predict([[80]])   # array([37350.])
```

`fit()`에 입력 `X_train`과 정답 `y_train`을 함께 넘긴 것이 전부다. 모델은 면적이 1m² 늘 때 값이 425만원 오른다는 관계를 데이터에서 직접 읽어냈고, 80m²에 그 관계를 적용해 37,350만원을 내놓았다.

## 비지도학습

비지도학습은 **정답 없이 데이터 자체의 구조를 찾는다**. 같은 `fit()`을 부르지만 인자가 다르다. 지도학습이 `model.fit(X, y)`로 입력과 정답을 함께 넘기는 자리에서, 비지도학습은 `model.fit(X)`로 입력만 넘긴다. 정답을 놓을 자리 자체가 없다.

현실에서 쌓이는 데이터는 대부분 레이블이 없다. 유저 행동 로그, 센서 측정값, 의료 이미지에 사람이 일일이 정답을 붙이려면 비용을 감당할 수 없다. 레이블 없이도 쓸 수 있다는 점이 비지도학습의 존재 이유이고, 쓰임새는 세 갈래다.

- **클러스터링(Clustering)**: 비슷한 데이터끼리 묶는다. 구매 패턴이 닮은 고객을 그룹으로 나눠 타겟팅하거나, 뉴스 기사를 주제별로 모은다.
- **차원 축소(Dimensionality Reduction)**: 수백 개의 특성을 핵심 축 몇 개로 압축한다. 2~3차원까지 줄이면 눈으로 볼 수 있고, 버려지는 축에 노이즈가 함께 실려 나간다.
- **이상 탐지(Anomaly Detection)**: 정상 패턴에서 벗어난 것을 찾는다. 카드 부정 사용 감지, 공장 장비의 이상 징후 탐지.

셋 다 "정답이 무엇인가"를 묻지 않고 "무엇이 서로 비슷한가"를 묻는다. 그래서 어떤 패턴이 있는지 아직 모르는 단계, 데이터를 처음 뜯어보는 탐색적 분석에서 특히 자주 쓰인다.

## 강화학습

강화학습은 앞의 둘과 결이 다르다. 정답도 없고, 미리 쌓아둔 데이터셋도 없다. **에이전트(Agent)가 환경(Environment)에서 행동하고, 그 결과로 돌아온 보상(Reward)을 크게 만드는 방향으로 행동 전략을 고쳐나간다.**

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 236" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle"
     role="img" aria-label="에이전트가 환경에 행동을 보내면 환경이 상태와 보상을 돌려주는 강화학습의 순환 구조">
<defs><marker id="ovwBHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted, #6d6762)"/></marker></defs>
<rect x="104" y="24" width="192" height="46" rx="8" fill="var(--bg-subtle, #f5f4f2)" stroke="var(--border, #e7e5e4)"/><text x="200" y="53" font-size="16" fill="var(--text, #1c1917)">에이전트 (Agent)</text>
<path d="M 152 72 L 152 160" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwBHead)"/>
<text x="142" y="121" font-size="15" text-anchor="end" fill="var(--text, #1c1917)">행동 (Action)</text>
<path d="M 248 164 L 248 76" fill="none" stroke="var(--text-muted, #6d6762)" stroke-width="1.6" marker-end="url(#ovwBHead)"/>
<text x="258" y="112" font-size="15" text-anchor="start" fill="var(--text, #1c1917)">상태 (State)</text>
<text x="258" y="134" font-size="15" font-weight="700" text-anchor="start" fill="var(--accent, #9d5604)">보상 (Reward)</text>
<rect x="104" y="166" width="192" height="46" rx="8" fill="var(--bg-muted, #eeecea)" stroke="var(--border, #e7e5e4)"/><text x="200" y="195" font-size="16" fill="var(--text, #1c1917)">환경 (Environment)</text>
</svg>
</div>

아이가 자전거를 배우는 과정과 같다. 페달을 어떻게 밟으라고 알려주는 사람은 없고, 넘어지면 아프고 잘 달리면 즐겁다는 신호만 반복해서 돌아온다. 각 순간에 무엇이 정답이었는지는 끝까지 알 수 없다. 결과가 좋았던 행동의 비중을 조금씩 늘려갈 뿐이다.

이 구조가 맞는 문제는 정해져 있다. 지금의 선택이 다음 상황을 바꾸는 순차적 의사결정 문제다. 바둑이나 Dota 2 같은 게임, 물체를 집는 로봇 팔, 클릭과 이탈을 보상으로 삼는 추천 시스템, 차선 유지와 장애물 회피를 배우는 자율주행이 여기 속한다.

:::warning

**보상으로 배우는 대신 시행착오의 횟수를 지불한다**

한 번의 행동이 좋았는지 나빴는지는 결과가 나올 때까지 알 수 없고, 그래서 필요한 경험의 양이 폭발한다. AlphaGo는 인간 챔피언을 이기기까지 백만 판 단위의 자가 대국을 거쳤다. 레이블을 확보할 수 있는 문제라면 지도학습이 비교할 수 없이 싸다.

:::

## 무엇을 언제 쓰는가

선택은 두 가지로 결정된다. 손에 있는 데이터가 어떤 형태인지, 그리고 무엇을 얻고 싶은지다.

| 가진 것 | 얻고 싶은 것 | 선택 |
|---|---|---|
| 입력 + 정답 레이블 | 연속값 예측 | 지도학습 (회귀) |
| 입력 + 정답 레이블 | 카테고리 판정 | 지도학습 (분류) |
| 입력만 | 데이터의 구조 파악 | 비지도학습 (클러스터링) |
| 입력만 | 고차원 데이터 압축·시각화 | 비지도학습 (차원 축소) |
| 환경과 보상 | 순차적 행동 전략 | 강화학습 |

실무에서는 지도학습이 압도적으로 많다. 예측 목표가 분명하고 레이블을 어떻게든 확보할 수 있는 문제가 대부분이기 때문이다. 비지도학습은 그 앞단에서 데이터를 훑거나 특성을 만들어내는 역할로 붙는 경우가 많고, 강화학습은 환경과의 상호작용 자체가 문제의 본질인 곳에 한정된다.

## 마치며

머신러닝은 사람이 규칙을 쓰던 자리에 데이터를 놓는다. 이 한 번의 방향 전환에서 나머지가 따라 나온다. 규칙 대신 데이터가 결과를 정하니 데이터의 품질이 곧 모델의 품질이 되고, 규칙을 눈으로 읽을 수 없으니 모델이 왜 그렇게 판단했는지를 따로 물어야 한다. 세 패러다임의 구분도 무엇을 학습 신호로 쓰는지에 따른 것이지 실무의 칸막이는 아니다. 레이블이 일부만 붙은 데이터를 다루는 준지도학습처럼 경계에 걸친 방식도 있고, 하나의 시스템 안에 셋이 섞여 있기도 하다.

다음 글에서는 알고리즘을 고르기 전에 반복해서 지나가야 하는 머신러닝 프로젝트의 전체 흐름을 다룬다.

## 함께 보면 좋은 글

- [머신러닝 프로젝트 전 과정](/ml/workflow/) : 문제 정의부터 배포까지 어떤 단계를 지나는가
- [선형 회귀](/ml/linear-regression/) : 지도학습에서 가장 단순한 모델이 데이터에 선을 맞추는 방법
- [K-Means 클러스터링](/ml/kmeans-clustering/) : 레이블 없이 데이터를 그룹으로 나누는 대표적인 알고리즘

## 참고자료

- [Scikit-learn: Machine Learning in Python](https://scikit-learn.org/stable/)
- [Andrew Ng, Machine Learning Specialization (Coursera)](https://www.coursera.org/specializations/machine-learning-introduction)
- [Stanford CS229: Machine Learning](https://cs229.stanford.edu/)
