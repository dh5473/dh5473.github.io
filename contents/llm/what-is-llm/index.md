---
date: '2026-08-13'
title: 'LLM이 푸는 문제: 다음 토큰 예측은 왜 근사가 아닌가'
category: 'LLM'
series: 'llm'
seriesOrder: 1
tags: ['LLM', 'Language Model', 'Next Token Prediction', 'N-gram', 'Perplexity']
summary: '언어 모델의 통계적 문제 정의를 n-gram부터 신경망 언어 모델까지 따라갑니다. 다음 토큰 예측이 결합확률의 정확한 분해인 이유, 세는 방식이 무너진 지점, 목적함수 하나에서 여러 능력이 나온 과정을 정리합니다.'
thumbnail: './thumbnail.png'
---

"결국 다음 단어 맞히는 기계 아닌가요." LLM을 두고 자주 나오는 말이고, 사실 관계로만 보면 맞습니다. 모델이 forward pass 한 번에 내놓는 결과물은 어휘 전체에 대한 확률 분포 하나가 전부입니다. 거기서 토큰을 하나 뽑고, 뽑은 토큰을 뒤에 붙여서 다시 넣는 루프가 우리가 보는 모든 것을 만들어냅니다.

문제는 이 문장이 대개 "그러니 별것 아니다"라는 뜻으로 쓰인다는 겁니다. 그런데 다음 토큰 예측이라는 형태는 계산을 쉽게 하려고 고른 근사가 아닙니다. 문장 전체에 확률을 매기겠다고 정한 순간 수학적으로 따라 나오는 결론이고, 그 자리에 붙는 것은 근사 기호가 아니라 등호입니다. 이 구분을 짚고 넘어가지 않으면 이후에 나오는 설계 결정들이 전부 임의의 취향처럼 보이게 됩니다.

이 시리즈는 지금의 LLM이 왜 이런 모습이 됐는지를 원 논문의 문제 정의부터 따라갑니다. 첫 글에서는 그 출발점을 정리합니다. 세는 방식이 어디서 무너졌고, 신경망이 무엇을 바꿨으며, 목적함수 하나를 낮추는 일이 어쩌다 번역과 코드 작성까지 끌고 왔는지까지.

<br>

## 언어 모델은 원래 채점기였다

언어 모델(Language Model)의 정의는 생각보다 좁습니다. **토큰 시퀀스를 받아서 그 시퀀스가 나타날 확률을 돌려주는 함수.** 이게 전부입니다.

생성기가 아니라 채점기처럼 들린다면 제대로 읽은 겁니다. 언어 모델은 오랫동안 채점기로 쓰였습니다. 음성 인식기가 "같이 가자"와 "가치 가자" 중 무엇을 들었는지 판정하지 못할 때, 기계 번역기가 후보 문장 열 개를 늘어놓고 어느 쪽이 더 한국어다운지 물어야 할 때, 그 판정을 맡는 부품이 언어 모델이었습니다. 텍스트를 직접 만들어내는 쪽은 오히려 곁가지였습니다.

그렇다면 $P(w_1, w_2, \ldots, w_n)$을 통째로 모델링하면 되지 않을까요. 안 됩니다. 길이가 제각각인 모든 가능한 문장에 확률값을 하나씩 배정한 표를 만들어야 하는데, 그런 표는 존재할 수 없습니다. 그래서 확률의 연쇄 법칙(chain rule)으로 쪼갭니다.

$$
P(w_1, w_2, \ldots, w_n) = \prod_{t=1}^{n} P(w_t \mid w_1, \ldots, w_{t-1})
$$

$w_t$는 $t$번째 토큰이고, 조건 자리에 놓인 $w_1, \ldots, w_{t-1}$은 그 앞에 이미 나온 토큰 전부입니다(줄여서 $w_{1:t-1}$로 적겠습니다). 오른쪽 곱의 각 항은 "앞을 전부 본 상태에서 다음 하나가 무엇일 확률"이고, 문장의 결합확률은 그 항들을 처음부터 끝까지 곱한 값과 같습니다.

여기서 중요한 것은 이 식에 **아무 가정도 들어가 있지 않다**는 점입니다. 조건부 확률의 정의인 $P(A, B) = P(A) \, P(B \mid A)$를 $n$번 반복 적용했을 뿐이라, 어떤 언어에 대해서도, 어떤 확률 분포에 대해서도 무조건 성립합니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 290" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="네 토큰 문장의 결합확률이 세 번의 조건부 확률로 분해되는 그림. 스텝마다 앞선 토큰이 모두 조건으로 남고 다음 토큰 하나가 예측 대상이 되며, 잘라낸 문맥이 없습니다.">
  <style>
    .nt1-chip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .nt1-new  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .nt1-t    { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .nt1-cap  { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: middle; }
    .nt1-lab  { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .nt1-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#nt1Arrow); }
  </style>
  <defs>
    <marker id="nt1Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <text x="240" y="26" class="nt1-cap">결합확률의 분해</text>
  <!-- Row 1 -->
  <rect x="20" y="46" width="84" height="40" rx="6" class="nt1-chip"/>
  <text x="62" y="73" class="nt1-t">민수는</text>
  <path d="M110,66 L134,66" class="nt1-ar"/>
  <rect x="140" y="46" width="70" height="40" rx="6" class="nt1-new"/>
  <text x="175" y="73" class="nt1-t">어제</text>
  <!-- Row 2 -->
  <rect x="20" y="106" width="84" height="40" rx="6" class="nt1-chip"/>
  <text x="62" y="133" class="nt1-t">민수는</text>
  <rect x="110" y="106" width="70" height="40" rx="6" class="nt1-chip"/>
  <text x="145" y="133" class="nt1-t">어제</text>
  <path d="M186,126 L210,126" class="nt1-ar"/>
  <rect x="216" y="106" width="70" height="40" rx="6" class="nt1-new"/>
  <text x="251" y="133" class="nt1-t">책을</text>
  <!-- Row 3 -->
  <rect x="20" y="166" width="84" height="40" rx="6" class="nt1-chip"/>
  <text x="62" y="193" class="nt1-t">민수는</text>
  <rect x="110" y="166" width="70" height="40" rx="6" class="nt1-chip"/>
  <text x="145" y="193" class="nt1-t">어제</text>
  <rect x="186" y="166" width="70" height="40" rx="6" class="nt1-chip"/>
  <text x="221" y="193" class="nt1-t">책을</text>
  <path d="M262,186 L286,186" class="nt1-ar"/>
  <rect x="292" y="166" width="84" height="40" rx="6" class="nt1-new"/>
  <text x="334" y="193" class="nt1-t">빌렸다</text>
  <!-- Legend -->
  <rect x="20" y="232" width="26" height="20" rx="4" class="nt1-chip"/>
  <text x="54" y="248" class="nt1-lab">조건 (앞선 토큰)</text>
  <rect x="212" y="232" width="26" height="20" rx="4" class="nt1-new"/>
  <text x="246" y="248" class="nt1-lab">예측 대상</text>
  <text x="240" y="280" class="nt1-cap">잘라낸 문맥 없음</text>
</svg>
</div>

그러니까 **문장 전체에 확률을 매기는 문제와 다음 토큰 하나를 예측하는 문제는 서로 같은 문제입니다.** 남은 일은 오른쪽 항 하나, $P(w_t \mid w_{1:t-1})$을 어떻게 계산하느냐뿐입니다. 이후 수십 년의 연구가 전부 이 항 하나에 매달렸습니다.

조건 자리에 무엇이 들어가야 하는지에 대해서도 이 식은 아무 제한을 두지 않습니다. 앞에 나온 토큰 전부가 조건입니다. 그 안에 문법이 들어 있든 사실 관계가 들어 있든 추론의 중간 단계가 들어 있든 상관없이 전부 조건입니다. 문제를 정직하게 만드는 것도, 동시에 감당하기 어렵게 만드는 것도 이 지점입니다.

### 순서는 왜 왼쪽에서 오른쪽인가

한 가지 짚고 갈 것이 있습니다. 연쇄 법칙은 분해 순서를 지정하지 않습니다. $P(w_1, w_2, w_3)$을 $P(w_1) P(w_2 \mid w_1) P(w_3 \mid w_1, w_2)$로 쪼개도 되고, $P(w_3) P(w_1 \mid w_3) P(w_2 \mid w_1, w_3)$로 쪼개도 등식은 똑같이 성립합니다. 토큰을 어떤 순서로 세우든 결합확률은 같은 값이니까요. 그렇다면 우리가 글을 읽는 순서를 그대로 따라간 데는 별도의 이유가 있어야 합니다.

실제로 다른 선택을 한 계열이 있었습니다. 2018년 BERT는 문장 곳곳을 가려놓고 그 자리를 양쪽 문맥으로 맞히는 masked language modeling을 목적함수로 삼았습니다. 문장을 분류하거나 이해하는 과제에서는 이쪽이 확실히 유리했습니다. 어느 토큰이든 앞뒤를 다 보고 판단하니까요.

대신 두 가지를 내줍니다. 하나는 그 목적함수가 시퀀스의 결합확률을 정의하지 않는다는 점입니다. 여러 자리를 한꺼번에 가리고 각각을 따로 맞히는 형태라 연쇄 법칙의 분해가 아니고, 따라서 문장 하나에 확률값을 매기는 원래 문제로 돌아갈 길이 없습니다. 2019년 XLNet이 분해 순서 자체를 무작위로 섞는 방식으로 이 간극을 메우려 했던 것도 같은 맥락입니다.

다른 하나는 생성입니다. 자기회귀 분해에서는 첫 토큰을 뽑고 그것을 조건에 넣어 다음을 뽑는 절차가, 그 자체로 분포에서 표본을 정확히 추출하는 방법이 됩니다. 순서를 고정한다는 제약이 곧 생성 알고리즘이 되는 셈입니다. 여기에 학습 효율까지 따라옵니다. 왼쪽에서 오른쪽으로 고정하면 길이 $T$짜리 문장 하나에서 $T$개의 예측을 전부 학습 신호로 쓸 수 있는 반면, 마스킹 방식은 가려놓은 자리에서만 신호가 나오므로 같은 텍스트에서 훨씬 적게 배웁니다.

<br>

## 세는 방식은 어디서 무너졌나

$P(w_t \mid w_{1:t-1})$을 추정하는 가장 단순한 방법은 세는 것입니다. 말뭉치에서 $w_{1:t-1}$이 등장한 횟수를 세고, 그중 다음에 $w_t$가 온 횟수를 세서 나눕니다. 이건 대충 만든 규칙이 아니라 [최대우도추정(MLE)](/stats/mle-and-mom/)이 이 상황에서 내놓는 정답이기도 합니다.

그런데 분모가 거의 항상 0입니다. 어휘 크기를 5만이라고 잡고 문맥 길이별로 가능한 조합을 세어보면 이유가 바로 보입니다.

| 문맥 길이 | 가능한 문맥의 수 |
|---|---|
| 2토큰 | 약 $10^{9}$ |
| 4토큰 | 약 $10^{19}$ |
| 10토큰 | 약 $10^{47}$ |

요즘 프론티어 모델이 쓰는 사전학습 코퍼스가 십조 토큰, 즉 $10^{13}$ 규모입니다. 문맥이 4토큰만 넘어가도 코퍼스 전체를 다 긁어모은 것보다 경우의 수가 백만 배 많아집니다. 대부분의 문맥은 세상의 텍스트를 전부 모아도 **단 한 번도 등장하지 않습니다.**

그래서 문맥을 잘랐습니다. 직전 $n-1$개만 조건으로 삼자는 마르코프 가정(Markov assumption)이고, 여기서 나온 것이 n-gram 모델입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 370" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="마르코프 가정의 대가를 보여주는 그림. 위쪽은 민수는 파리에서 자랐다 그래서 네 토큰을 모두 조건으로 삼아 불어를을 예측합니다. 아래쪽 3-gram은 직전 두 토큰만 조건으로 삼아 파리에서라는 결정적 단서를 버리고 예측하지 못합니다.">
  <style>
    .mk2-chip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .mk2-cut  { fill: var(--bg-muted, #eeecea); stroke: var(--text-danger, #cb2121); stroke-width: 1.5;
                stroke-dasharray: 5 3; }
    .mk2-new  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .mk2-unk  { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
    .mk2-t    { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .mk2-tcut { fill: var(--text-muted, #6d6762); font-size: 20px; text-anchor: middle; }
    .mk2-hA   { fill: var(--primary, #0a756c); font-size: 18px; }
    .mk2-hB   { fill: var(--accent, #9d5604); font-size: 18px; }
    .mk2-lab  { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .mk2-bad  { fill: var(--text-danger, #cb2121); font-size: 17px; }
    .mk2-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#mk2Arrow); }
    .mk2-x    { stroke: var(--text-danger, #cb2121); stroke-width: 2; }
  </style>
  <defs>
    <marker id="mk2Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <!-- Panel A -->
  <text x="20" y="28" class="mk2-hA">문맥 전체를 조건으로</text>
  <rect x="20" y="42" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="72" y="69" class="mk2-t">민수는</text>
  <rect x="132" y="42" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="184" y="69" class="mk2-t">파리에서</text>
  <rect x="244" y="42" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="296" y="69" class="mk2-t">자랐다</text>
  <rect x="356" y="42" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="408" y="69" class="mk2-t">그래서</text>
  <path d="M240,86 L240,104" class="mk2-ar"/>
  <rect x="180" y="108" width="120" height="40" rx="6" class="mk2-new"/>
  <text x="240" y="135" class="mk2-t">불어를</text>
  <text x="316" y="134" class="mk2-lab">조건 4토큰</text>
  <line x1="20" y1="172" x2="460" y2="172" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <!-- Panel B -->
  <text x="20" y="202" class="mk2-hB">3-gram: 직전 2토큰만</text>
  <rect x="20" y="216" width="104" height="40" rx="6" class="mk2-cut"/>
  <text x="72" y="243" class="mk2-tcut">민수는</text>
  <line x1="28" y1="236" x2="116" y2="236" class="mk2-x"/>
  <rect x="132" y="216" width="104" height="40" rx="6" class="mk2-cut"/>
  <text x="184" y="243" class="mk2-tcut">파리에서</text>
  <line x1="140" y1="236" x2="228" y2="236" class="mk2-x"/>
  <rect x="244" y="216" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="296" y="243" class="mk2-t">자랐다</text>
  <rect x="356" y="216" width="104" height="40" rx="6" class="mk2-chip"/>
  <text x="408" y="243" class="mk2-t">그래서</text>
  <path d="M240,260 L240,278" class="mk2-ar"/>
  <rect x="180" y="282" width="120" height="40" rx="6" class="mk2-unk"/>
  <text x="240" y="309" class="mk2-t">?</text>
  <text x="316" y="308" class="mk2-lab">조건 2토큰</text>
  <text x="20" y="352" class="mk2-bad">버려진 단서: 파리에서</text>
</svg>
</div>

n-gram이 조악한 임시방편이었다고만 기억하면 곤란합니다. 2007년 구글이 낸 기계 번역 논문의 제목이 문자 그대로 "Large Language Models in Machine Translation"이었고, 거기서 말하는 대형 언어 모델은 웹 텍스트 2조 토큰에서 뽑은 5-gram 카운트 테이블이었습니다. 데이터를 키울수록 번역 품질이 계속 올라간다는 것도 그때 이미 확인됐습니다. 스케일이 효과가 있다는 관찰 자체는 신경망보다 오래됐습니다.

그럼에도 n-gram에는 서로 성격이 다른 두 개의 한계가 있었습니다. 하나는 여전한 희소성입니다. 문맥을 5토큰으로 잘라도 대부분의 조합은 관측되지 않고, 관측되지 않은 조합에 확률 0을 주면 문장 전체의 확률이 0이 됩니다. Kneser-Ney를 비롯한 스무딩 기법들이 이 구멍을 메우려고 정교하게 발전했습니다.

다른 하나는 스무딩으로 손댈 수 없는 종류였습니다. **일반화가 없습니다.** "고양이가 사료를 먹는다"를 백 번 봤어도 "강아지가 사료를 먹는다"에 대해 아는 것이 하나도 늘지 않습니다. 두 문자열은 표에서 서로 무관한 칸을 차지할 뿐이고, 고양이와 강아지가 비슷한 단어라는 정보를 적어 넣을 자리가 애초에 없습니다. 단어를 원자적 심볼로 취급하는 한, $n$을 몇으로 잡든 이 문제는 그대로 남습니다.

<br>

## 심볼을 벡터로 바꾸다

2003년 벤지오 연구팀이 낸 "A Neural Probabilistic Language Model"이 이 지점을 정면으로 노렸습니다. 논문이 스스로 밝힌 목표가 "차원의 저주와 싸우는 것"입니다.

방법은 두 가지를 동시에 학습하는 것이었습니다. 각 단어에 대응하는 밀집 벡터(distributed representation), 그리고 그 벡터들을 받아 다음 토큰의 확률 분포를 내놓는 신경망. 표에 값을 채워 넣는 대신, 함수의 파라미터를 학습하는 쪽으로 문제를 옮긴 셈입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 380" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="n-gram의 심볼 테이블과 신경망 언어 모델의 벡터 공간 비교. 위쪽 표에서는 고양이가 사료를 먹는다가 12회 관측되고 강아지가 사료를 먹는다가 0회라 두 줄 사이에 아무 관계가 없습니다. 아래쪽 벡터 공간에서는 고양이와 강아지가 가까이 놓여 학습이 서로 옮겨갑니다.">
  <style>
    .vc3-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .vc3-t    { fill: var(--text, #1c1917); font-size: 20px; }
    .vc3-hA   { fill: var(--text-muted, #6d6762); font-size: 18px; }
    .vc3-lab  { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .vc3-bad  { fill: var(--text-danger, #cb2121); font-size: 17px; }
    .vc3-good { fill: var(--primary, #0a756c); font-size: 17px; }
    .vc3-dotA { fill: var(--primary, #0a756c); }
    .vc3-dotB { fill: var(--text-muted, #6d6762); }
    .vc3-link { stroke: var(--primary, #0a756c); stroke-width: 1.5; stroke-dasharray: 4 3; }
  </style>
  <!-- Panel A -->
  <text x="20" y="28" class="vc3-hA">n-gram: 심볼 테이블</text>
  <rect x="20" y="42" width="440" height="104" rx="8" class="vc3-box"/>
  <text x="38" y="80" class="vc3-t">고양이가 사료를 먹는다</text>
  <text x="360" y="80" class="vc3-lab">12회</text>
  <line x1="20" y1="94" x2="460" y2="94" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <text x="38" y="132" class="vc3-t">강아지가 사료를 먹는다</text>
  <text x="368" y="132" class="vc3-bad">0회</text>
  <text x="20" y="174" class="vc3-bad">두 줄 사이에 아무 관계 없음</text>
  <line x1="20" y1="196" x2="460" y2="196" stroke="var(--border, #e7e5e4)" stroke-width="1.5"/>
  <!-- Panel B -->
  <text x="20" y="226" class="vc3-hA">신경망 LM: 벡터 공간</text>
  <rect x="20" y="240" width="440" height="110" rx="8" class="vc3-box"/>
  <line x1="112" y1="278" x2="152" y2="302" class="vc3-link"/>
  <circle cx="112" cy="278" r="6" class="vc3-dotA"/>
  <text x="126" y="283" class="vc3-lab">고양이</text>
  <circle cx="152" cy="302" r="6" class="vc3-dotA"/>
  <text x="166" y="307" class="vc3-lab">강아지</text>
  <circle cx="404" cy="322" r="6" class="vc3-dotB"/>
  <text x="332" y="327" class="vc3-lab">자동차</text>
  <text x="20" y="376" class="vc3-good">가까운 벡터 → 비슷한 예측</text>
</svg>
</div>

효과는 두 갈래로 나타났습니다. 파라미터 수가 문맥 길이에 지수적으로 늘어나지 않습니다. $|V|^n$개의 칸 대신 어휘 크기에 비례하는 임베딩 행렬 하나와 신경망 하나면 되니까요. 그리고 더 중요한 쪽은, 비슷한 단어가 비슷한 벡터를 갖게 되면서 **한 문장에서 배운 것이 본 적 없는 문장으로 옮겨간다**는 점입니다. 고양이 문장으로 낮춘 loss가 강아지 문장의 확률도 같이 끌어올립니다. n-gram 표에서는 원리적으로 불가능했던 일입니다.

:::info

**참고**

임베딩이 "단어의 의미를 담는다"는 설명은 순서가 거꾸로입니다. 임베딩 벡터는 다음 토큰을 맞히려고 학습된 부산물이고, 비슷한 맥락에 등장하는 단어들이 비슷한 벡터를 갖게 된 결과일 뿐입니다. 의미를 넣어준 것이 아니라, 예측에 도움이 되는 방향으로 배치된 것입니다.

:::

물론 2003년의 모델에도 문맥 창이 고정 길이라는 제약이 남아 있었습니다. RNN이 그 제약을 원리적으로 풀었지만 순차 계산이라 병렬화가 안 되고 먼 곳의 정보가 흐려지는 문제를 안고 있었습니다. **어떤 함수 형태가 이 조건부 확률을 계산하기에 적합한가**는 그 자체로 하나의 큰 주제이고, 지금의 답은 Transformer입니다.

<br>

## 무엇을 최소화하는가

함수 형태가 정해지면 남는 것은 파라미터를 어떻게 맞출 것인가입니다. 목표는 단순합니다. 학습 코퍼스에 실제로 등장한 토큰들에 모델이 높은 확률을 주도록 만드는 것, 즉 로그 가능도를 최대화하는 것입니다. 부호를 뒤집어 최소화 문제로 적으면 이렇게 됩니다.

$$
\mathcal{L}(\theta) = -\frac{1}{T} \sum_{t=1}^{T} \log P_\theta (w_t \mid w_{1:t-1})
$$

$\theta$는 모델 파라미터 전체이고, $T$는 학습에 쓴 토큰의 총 개수, $P_\theta$는 파라미터 $\theta$를 가진 모델이 내놓는 확률 분포입니다. 각 위치에서 **실제로 나온 토큰 하나**에 모델이 매긴 확률을 로그로 바꿔 전부 더하고, 개수로 나눈 뒤 부호를 뒤집은 값입니다. 정답 토큰에만 1을 주는 분포와 모델 분포 사이의 [교차 엔트로피](/stats/information-theory/)와 같은 식이기도 합니다.

이 값을 그대로 읽기는 불편해서 보통 지수를 취해 **perplexity**로 바꿔 봅니다. perplexity가 20이라면 매 위치에서 후보 20개짜리 균등 분포로 찍는 것과 같은 수준의 불확실성이라는 뜻입니다. 숫자가 작을수록 모델이 다음에 올 토큰을 좁게 좁혀놨다는 의미가 됩니다.

여기서 짚어둘 것이 하나 있습니다. 다음 토큰을 잘 맞히는 능력과 텍스트를 짧게 압축하는 능력은 서로 다른 이름이 붙은 같은 양입니다. 확률 $p$인 사건을 $-\log_2 p$ 비트로 적는 것이 최적 부호화이므로, loss를 낮추는 일이 곧 같은 텍스트를 더 적은 비트로 적는 일이 됩니다. 섀넌이 1951년에 영어 텍스트의 엔트로피를 사람의 다음 글자 맞히기 실험으로 추정한 것도 정확히 이 등가 관계 때문이었습니다.

다만 여기서 한 걸음 더 나가는 주장, 그러니까 "압축을 잘하니 이해하는 것이다"는 별개의 명제이고 아직 정리되지 않은 논쟁입니다. 압축과 예측이 같다는 것은 정보이론의 결론이지만, 압축과 이해가 같다는 것은 아직 누구도 보이지 못했습니다.

<br>

## 목적함수 하나가 왜 여러 능력이 됐나

이제 이 글에서 가장 이상한 부분입니다. 학습 신호는 처음부터 끝까지 하나뿐입니다. 다음 토큰의 로그 확률. 그런데 그 하나를 낮추다 보면 번역기가 나오고 요약기가 나오고 코드 작성기가 나옵니다.

이유는 조건 자리가 아무 제한 없이 열려 있다는 데 있습니다. loss를 더 낮추려면 어떤 위치에서든 다음 토큰을 더 잘 맞혀야 하는데, 위치마다 그러려면 알아야 하는 것이 다릅니다.

| 문맥 | 다음 토큰을 맞히려면 |
|---|---|
| `1 + 1 = ` | 덧셈 |
| `프랑스의 수도는 ` | 사실 관계 |
| `def add(a, b):\n    return ` | 파이썬 문법과 함수 이름의 관례 |
| 추리소설 마지막 장의 `범인은 ` | 300페이지에 걸친 서사 추적 |

목적함수는 하나인데 그 하나를 낮추는 데 필요한 능력이 여러 갈래로 갈립니다. 태스크를 가르친 적이 없는데도 태스크 수행 능력이 따라 나오는 이유가 여기 있습니다. 2019년 GPT-2가 태스크별 학습 데이터 없이 독해와 요약과 번역을 어느 정도 해낸다는 것을 보였고, 2020년 GPT-3가 예시 몇 개만 프롬프트에 넣어주면 성능이 크게 올라간다는 것까지 확인했습니다. 태스크마다 모델을 따로 만들던 관행이 이 무렵 무너집니다.

여기까지가 널리 알려진 이야기인데, 문제는 이 서사가 "스케일만 키우면 나머지는 알아서 따라온다"로 요약되어 돌아다닌다는 점입니다. 실제로는 이 논리가 멈추는 지점이 꽤 이릅니다.

사전학습만 마친 모델은 지시를 따르지 않습니다. "이 문서를 요약해줘"를 넣으면 요약을 하는 대신 비슷한 요청 문장을 몇 개 더 이어 씁니다. 인터넷 텍스트의 분포에서는 그쪽이 더 그럴듯한 이어쓰기니까, 모델은 정확히 시킨 일을 하고 있는 겁니다. 사람이 원하는 행동은 애초에 loss 안에 들어 있지 않았습니다. 2022년 InstructGPT가 정면으로 다룬 문제가 이것이고, 오늘날 모든 모델이 사전학습 다음에 별도의 포스트트레이닝 단계를 거치는 이유이기도 합니다.

:::warning

**주의**

"다음 토큰 예측만으로 충분하다"와 "다음 토큰 예측은 통계적 흉내에 불과하다"는 양쪽 다 성급합니다. 확립된 사실은 목적함수 하나에서 태스크 전이가 실제로 일어난다는 관찰과, 그 목적함수만으로는 사람이 원하는 행동이 나오지 않는다는 관찰 두 가지입니다. 그 사이의 해석은 아직 열려 있습니다.

:::

<br>

## 이 정의식이 남긴 질문들

$P_\theta(w_t \mid w_{1:t-1})$은 짧은 식이지만, 실제로 계산하려고 들면 곧바로 답이 정해지지 않은 자리들이 드러납니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 480 434" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="다음 토큰 예측 정의식의 구성 요소마다 대응하는 연구 주제를 짝지은 표. 토큰의 단위는 토큰화, 조건부 확률 함수는 모델 구조, 분포에서 뽑는 방법은 생성 전략, 파라미터 학습은 사전학습, loss 밖의 목표는 포스트트레이닝, 실제 능력 측정은 평가로 이어집니다.">
  <style>
    .qm4-core { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 2; }
    .qm4-row  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .qm4-pill { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .qm4-eq   { fill: var(--text, #1c1917); font-size: 20px; text-anchor: middle; }
    .qm4-cap  { fill: var(--text-muted, #6d6762); font-size: 18px; text-anchor: middle; }
    .qm4-hd   { fill: var(--text-muted, #6d6762); font-size: 17px; }
    .qm4-t    { fill: var(--text, #1c1917); font-size: 17px; }
    .qm4-p    { fill: var(--primary, #0a756c); font-size: 17px; text-anchor: middle; }
    .qm4-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#qm4Arrow); }
  </style>
  <defs>
    <marker id="qm4Arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <text x="240" y="26" class="qm4-cap">하나의 정의식이 갈라놓는 주제</text>
  <rect x="110" y="42" width="260" height="48" rx="8" class="qm4-core"/>
  <text x="240" y="73" class="qm4-eq">P(w_t | w_1:t-1 ; θ)</text>
  <path d="M240,92 L240,106" class="qm4-ar"/>
  <text x="38" y="120" class="qm4-hd">정의식의 구성 요소</text>
  <text x="375" y="120" class="qm4-hd">주제</text>
  <!-- rows -->
  <rect x="20" y="128" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="155" class="qm4-t">토큰 w의 단위</text>
  <rect x="300" y="134" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="155" class="qm4-p">토큰화</text>
  <rect x="20" y="178" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="205" class="qm4-t">조건부 확률 함수</text>
  <rect x="300" y="184" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="205" class="qm4-p">모델 구조</text>
  <rect x="20" y="228" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="255" class="qm4-t">분포에서 뽑는 방법</text>
  <rect x="300" y="234" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="255" class="qm4-p">생성 전략</text>
  <rect x="20" y="278" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="305" class="qm4-t">파라미터 θ 학습</text>
  <rect x="300" y="284" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="305" class="qm4-p">사전학습</text>
  <rect x="20" y="328" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="355" class="qm4-t">loss 밖의 목표</text>
  <rect x="300" y="334" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="355" class="qm4-p">포스트트레이닝</text>
  <rect x="20" y="378" width="440" height="42" rx="6" class="qm4-row"/>
  <text x="38" y="405" class="qm4-t">실제 능력 측정</text>
  <rect x="300" y="384" width="150" height="30" rx="15" class="qm4-pill"/>
  <text x="375" y="405" class="qm4-p">평가</text>
</svg>
</div>

$w_t$의 단위부터 정해져 있지 않습니다. 글자인지 단어인지 그 중간 어디인지에 따라 어휘 크기도, 시퀀스 길이도, 모델이 다루기 쉬운 형태인지도 전부 달라집니다. 조건부 확률을 계산하는 함수의 모양은 지금도 매년 바뀌고 있고, 확률 분포를 얻은 다음 거기서 토큰 하나를 어떻게 고를지는 그 자체로 생성 품질을 좌우합니다. 파라미터를 얼마나 크게 잡고 데이터를 얼마나 먹일 것인가라는 질문에서 스케일링 법칙이 나왔고, loss에 담기지 않는 목표를 어떻게 주입할 것인가에서 포스트트레이닝 전체가 나왔습니다. 마지막으로 그렇게 만든 모델이 정말 잘하는지를 어떻게 재느냐는, 2026년 기준으로 가장 답이 없는 축에 속합니다.

이 시리즈는 이 질문들을 하나씩 따라갑니다. 각 답이 왜 그 형태여야 했는지, 그리고 그 선택이 무엇을 포기한 대가였는지까지.

<br>

## 마치며

다음 토큰 예측이라는 문제 정의는 좁아 보이지만, 조건 자리가 열려 있다는 이유 하나로 사실상 무제한의 요구를 담게 됐습니다. 앞으로 다룰 설계들은 대부분 이 정의식의 어느 항을 감당 가능한 형태로 만들려는 시도로 읽힙니다.

다음 글에서는 조건부 확률을 계산하는 함수, 즉 Transformer가 왜 그 모양이어야 했는지를 Q와 K와 V의 정의부터 따라가 보겠습니다.

<br>

## 함께 보면 좋은 글

- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [정보이론으로 보는 DL 손실함수: 엔트로피, KL 발산, 교차 엔트로피](/stats/information-theory/)
- [최대우도추정(MLE)과 적률법(MoM): 추정량을 체계적으로 찾는 두 가지 방법](/stats/mle-and-mom/)

<br>

## 참고자료

- [Speech and Language Processing (3rd ed. draft), Ch.3 N-gram Language Models](https://web.stanford.edu/~jurafsky/slp3/3.pdf)
- [A Neural Probabilistic Language Model (Bengio et al., JMLR 2003)](https://www.jmlr.org/papers/volume3/bengio03a/bengio03a.pdf)
- [Large Language Models in Machine Translation (Brants et al., EMNLP-CoNLL 2007)](https://aclanthology.org/D07-1090/)
- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165)
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155)
