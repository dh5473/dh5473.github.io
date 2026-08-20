---
date: '2026-08-21'
title: '토큰은 왜 단어가 아닐까'
category: 'LLM'
series: 'llm'
seriesOrder: 3
tags: ['LLM', 'Tokenization', 'BPE', 'Embedding', 'Tokenizer']
summary: 'LLM이 텍스트를 단어도 글자도 아닌 토큰으로 쪼개는 이유를 BPE 알고리즘부터 따라갑니다. 토큰 ID를 벡터로 바꾸는 임베딩 테이블과 확률 분포로 되돌리는 lm_head까지, 비용의 단위인 토큰을 정의합니다.'
thumbnail: './thumbnail.png'
---

API 요금표는 토큰당 가격을 매기고, 컨텍스트 창은 토큰 수로 정해지고, LLM 추론 비용은 요청이 아니라 토큰 단위로 발생합니다. 모두가 토큰을 세는데, 정작 토큰이 무엇인지는 짚고 넘어가는 일이 드뭅니다. 단어 하나일 수도 있고 단어의 일부일 수도 있다는 정도로 얼버무리기 일쑤죠.

그 "일부"라는 말에 생각보다 많은 설계가 숨어 있습니다. 텍스트는 단어로 쪼갤 수도 있고 글자로 쪼갤 수도 있는데, 현대 LLM은 전부 그 중간 어딘가를 택했습니다. 사람이 고른 중간이 아니라 데이터가 고른 중간입니다.

이 글에서는 왜 단어도 글자도 아닌지에서 출발해, 토큰화(tokenization)의 표준 알고리즘인 BPE, 그리고 쪼개진 번호를 벡터로 바꾸는 임베딩과 다시 확률 분포로 되돌리는 lm_head까지, 텍스트가 모델을 드나드는 양 끝단을 짚습니다.

<br>

## 단어로 쪼개면 안 될까

가장 자연스러운 후보는 단어입니다. 신경망 기계 번역 초기에는 실제로 그렇게 했습니다. 자주 나오는 단어 3만에서 5만 개로 어휘(vocabulary)를 만들고, 목록에 없는 단어는 전부 `<UNK>`(unknown)라는 토큰 하나로 뭉갰습니다.

문제는 단어가 닫힌 집합이 아니라는 점입니다. 새 고유명사와 신조어가 계속 생기고, 한국어 같은 교착어에서는 동사 하나가 수십 가지 활용형으로 나타납니다. "먹었다", "먹는다", "먹으니"는 뿌리가 같은데 단어 단위 어휘에서는 전부 독립된 항목입니다. 어휘를 아무리 키워도 처음 보는 단어는 나오고, 그때마다 `<UNK>`가 등장하고요. 모델 입장에서 `<UNK>`는 정보가 0인 토큰입니다. 무엇이 있었는지는 사라지고, 모르는 무언가가 있었다는 사실만 남으니까요. 생성 쪽은 더 심합니다. 어휘에 없는 단어는 모델이 출력할 방법 자체가 없습니다.

반대 극단은 글자입니다. 한글 완성자는 11,172자, 영어 알파벳은 26자면 되니 모르는 단어라는 개념 자체가 사라집니다. 대신 시퀀스가 길어집니다. 뒤에서 재 볼 영어 예문은 77자짜리인데 서브워드로는 18토큰이니, 글자 단위는 서브워드 대비 4배가 넘는 길이입니다. 어텐션은 모든 토큰 쌍의 관계를 계산하기 때문에 길이가 4배면 계산량은 16배가 됩니다. 게다가 글자 하나에는 의미가 거의 실리지 않습니다. "좋"이라는 글자가 무엇을 뜻하는지는 "좋았다"까지 모아야 정해지니, 모델이 같은 내용을 배우는 데 더 먼 문맥을 봐야 합니다.

그래서 현대 토크나이저는 중간을 택합니다. 자주 나오는 덩어리는 통째로 토큰이 되고, 드문 부분은 잘게 쪼개집니다. 이 단위가 서브워드(subword)입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 440 285" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 문장을 세 가지 단위로 쪼갠 결과 비교. 단어 단위는 3토큰이지만 어휘가 폭발하고, 글자 단위는 9토큰으로 시퀀스가 길어지며, 서브워드 단위는 7토큰으로 자주 나온 덩어리를 뭉칩니다.">
  <style>
    .tk1-h    { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
    .tk1-n    { fill: var(--text-muted, #6d6762); font-size: 16px; text-anchor: end; }
    .tk1-chip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tk1-mg   { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tk1-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; }
  </style>
  <!-- 단어 단위 -->
  <text x="20" y="30" class="tk1-h">단어 단위</text>
  <text x="420" y="30" class="tk1-n">3토큰 · 어휘가 폭발</text>
  <rect x="20" y="42" width="90" height="36" rx="6" class="tk1-chip"/>
  <text x="65" y="66" class="tk1-t">오늘은</text>
  <rect x="118" y="42" width="90" height="36" rx="6" class="tk1-chip"/>
  <text x="163" y="66" class="tk1-t">날씨가</text>
  <rect x="216" y="42" width="90" height="36" rx="6" class="tk1-chip"/>
  <text x="261" y="66" class="tk1-t">좋았다</text>
  <!-- 글자 단위 -->
  <text x="20" y="122" class="tk1-h">글자 단위</text>
  <text x="420" y="122" class="tk1-n">9토큰 · 시퀀스가 폭발</text>
  <rect x="20" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="40" y="158" class="tk1-t">오</text>
  <rect x="66" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="86" y="158" class="tk1-t">늘</text>
  <rect x="112" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="132" y="158" class="tk1-t">은</text>
  <rect x="158" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="178" y="158" class="tk1-t">날</text>
  <rect x="204" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="224" y="158" class="tk1-t">씨</text>
  <rect x="250" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="270" y="158" class="tk1-t">가</text>
  <rect x="296" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="316" y="158" class="tk1-t">좋</text>
  <rect x="342" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="362" y="158" class="tk1-t">았</text>
  <rect x="388" y="134" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="408" y="158" class="tk1-t">다</text>
  <!-- 서브워드 단위 -->
  <text x="20" y="214" class="tk1-h">서브워드 단위</text>
  <text x="420" y="214" class="tk1-n">7토큰 · 실제 o200k 분할</text>
  <rect x="20" y="226" width="62" height="36" rx="6" class="tk1-mg"/>
  <text x="51" y="250" class="tk1-t">오늘</text>
  <rect x="88" y="226" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="108" y="250" class="tk1-t">은</text>
  <rect x="134" y="226" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="154" y="250" class="tk1-t">날</text>
  <rect x="180" y="226" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="200" y="250" class="tk1-t">씨</text>
  <rect x="226" y="226" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="246" y="250" class="tk1-t">가</text>
  <rect x="272" y="226" width="40" height="36" rx="6" class="tk1-chip"/>
  <text x="292" y="250" class="tk1-t">좋</text>
  <rect x="318" y="226" width="62" height="36" rx="6" class="tk1-mg"/>
  <text x="349" y="250" class="tk1-t">았다</text>
</svg>
</div>

위 그림의 서브워드 분할은 도식이 아니라 GPT 계열 토크나이저(o200k)의 실제 출력입니다. 자주 나오는 "오늘"과 "았다"는 하나로 뭉쳤고, "씨"와 "가"는 글자 그대로 남았습니다. 이 경계는 사람이 정하지 않았습니다. 그렇다면 누가 정했을까요?

<br>

## 압축 알고리즘을 빌려오다

답은 NLP가 아니라 데이터 압축에서 왔습니다. 1994년 Philip Gage가 발표한 BPE(Byte Pair Encoding)는 원래 파일 압축 기법입니다. 데이터에서 가장 자주 나오는 인접 바이트 쌍을 새 기호 하나로 치환하고 이 과정을 반복합니다. 자주 나오는 패턴일수록 짧은 기호로 줄어드니 전체 크기가 작아지는 원리죠.

2016년 Sennrich 연구진이 이 알고리즘을 기계 번역의 희귀 단어 문제로 가져왔습니다. 절차는 압축 때와 같습니다.

1. 코퍼스를 글자 단위로 쪼갠 상태에서 시작합니다
2. 가장 자주 인접해서 나타나는 쌍을 찾아 하나로 병합합니다
3. 병합된 덩어리를 새 어휘 항목으로 추가하고, 2로 돌아갑니다

작은 코퍼스로 따라가 보겠습니다. low가 5번, lower가 2번, newest가 6번, widest가 3번 나오는 코퍼스입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 440 470" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="BPE가 병합 규칙을 학습하는 과정. 글자 단위에서 시작해 가장 자주 인접하는 쌍인 es, est, lo, low가 차례로 병합되어 newest는 6토큰에서 4토큰으로, low는 3토큰에서 1토큰으로 줄어듭니다.">
  <style>
    .tk2-cp   { fill: var(--text-muted, #6d6762); font-size: 16px; }
    .tk2-h    { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
    .tk2-chip { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tk2-new  { fill: var(--bg-success, #f0fdf4); stroke: var(--text-success, #107836); stroke-width: 1.5; }
    .tk2-t    { fill: var(--text, #1c1917); font-size: 16px; text-anchor: middle; }
  </style>
  <!-- 코퍼스 -->
  <text x="20" y="26" class="tk2-cp">코퍼스: low ×5 · lower ×2 · newest ×6 · widest ×3</text>
  <!-- 시작 -->
  <text x="20" y="66" class="tk2-h">시작 · 글자 단위</text>
  <rect x="20" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="35" y="101" class="tk2-t">n</text>
  <rect x="55" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="70" y="101" class="tk2-t">e</text>
  <rect x="90" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="105" y="101" class="tk2-t">w</text>
  <rect x="125" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="140" y="101" class="tk2-t">e</text>
  <rect x="160" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="175" y="101" class="tk2-t">s</text>
  <rect x="195" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="210" y="101" class="tk2-t">t</text>
  <rect x="290" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="305" y="101" class="tk2-t">l</text>
  <rect x="325" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="340" y="101" class="tk2-t">o</text>
  <rect x="360" y="78" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="375" y="101" class="tk2-t">w</text>
  <!-- 1번째 병합 -->
  <text x="20" y="150" class="tk2-h">1번째 병합 · e+s → es (9회)</text>
  <rect x="20" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="35" y="185" class="tk2-t">n</text>
  <rect x="55" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="70" y="185" class="tk2-t">e</text>
  <rect x="90" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="105" y="185" class="tk2-t">w</text>
  <rect x="125" y="162" width="42" height="34" rx="5" class="tk2-new"/>
  <text x="146" y="185" class="tk2-t">es</text>
  <rect x="172" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="187" y="185" class="tk2-t">t</text>
  <rect x="290" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="305" y="185" class="tk2-t">l</text>
  <rect x="325" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="340" y="185" class="tk2-t">o</text>
  <rect x="360" y="162" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="375" y="185" class="tk2-t">w</text>
  <!-- 2번째 병합 -->
  <text x="20" y="234" class="tk2-h">2번째 병합 · es+t → est (9회)</text>
  <rect x="20" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="35" y="269" class="tk2-t">n</text>
  <rect x="55" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="70" y="269" class="tk2-t">e</text>
  <rect x="90" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="105" y="269" class="tk2-t">w</text>
  <rect x="125" y="246" width="52" height="34" rx="5" class="tk2-new"/>
  <text x="151" y="269" class="tk2-t">est</text>
  <rect x="290" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="305" y="269" class="tk2-t">l</text>
  <rect x="325" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="340" y="269" class="tk2-t">o</text>
  <rect x="360" y="246" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="375" y="269" class="tk2-t">w</text>
  <!-- 3번째 병합 -->
  <text x="20" y="318" class="tk2-h">3번째 병합 · l+o → lo (7회)</text>
  <rect x="20" y="330" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="35" y="353" class="tk2-t">n</text>
  <rect x="55" y="330" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="70" y="353" class="tk2-t">e</text>
  <rect x="90" y="330" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="105" y="353" class="tk2-t">w</text>
  <rect x="125" y="330" width="52" height="34" rx="5" class="tk2-chip"/>
  <text x="151" y="353" class="tk2-t">est</text>
  <rect x="290" y="330" width="42" height="34" rx="5" class="tk2-new"/>
  <text x="311" y="353" class="tk2-t">lo</text>
  <rect x="337" y="330" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="352" y="353" class="tk2-t">w</text>
  <!-- 4번째 병합 -->
  <text x="20" y="402" class="tk2-h">4번째 병합 · lo+w → low (7회)</text>
  <rect x="20" y="414" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="35" y="437" class="tk2-t">n</text>
  <rect x="55" y="414" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="70" y="437" class="tk2-t">e</text>
  <rect x="90" y="414" width="30" height="34" rx="5" class="tk2-chip"/>
  <text x="105" y="437" class="tk2-t">w</text>
  <rect x="125" y="414" width="52" height="34" rx="5" class="tk2-chip"/>
  <text x="151" y="437" class="tk2-t">est</text>
  <rect x="290" y="414" width="56" height="34" rx="5" class="tk2-new"/>
  <text x="318" y="437" class="tk2-t">low</text>
</svg>
</div>

e와 s가 붙어 나오는 횟수가 9회(newest 6 + widest 3)로 가장 많으니 es가 첫 병합입니다. 다음은 es와 t가 합쳐져 est가 되고, l과 o, lo와 w가 뒤를 잇습니다. 네 번 병합했더니 est와 low라는, 이 코퍼스에서 실제로 자주 쓰이는 덩어리가 어휘에 들어왔습니다. -est 같은 접미사가 통째로 토큰이 되는 게 우연이 아닌 거죠. 자주 나오니까 병합됐을 뿐인데 결과적으로 형태소와 비슷한 경계가 잡힙니다.

학습이 끝나면 남는 것은 순서가 매겨진 병합 규칙 목록입니다. 새 텍스트가 들어오면 글자 단위로 쪼갠 뒤 이 목록을 학습된 순서 그대로 적용합니다. 규칙과 순서가 고정이니 같은 텍스트는 언제 넣어도 같은 토큰 나열이 됩니다.

이 방식의 진가는 처음 보는 단어에서 드러납니다. lowest는 위 코퍼스에 한 번도 없었지만, low와 est가 어휘에 있으니 두 토큰으로 표현됩니다. 코퍼스에 있던 lower도 통째로는 병합되지 못했으니 low, e, r 세 토큰이 되고요. `<UNK>`로 뭉개는 대신 아는 조각의 조합으로 재구성하는 것. Sennrich 연구진이 노린 효과가 정확히 이것입니다. 아무리 낯선 단어가 와도 최악의 경우 글자까지 내려가면 되니, 표현하지 못하는 단어가 사라집니다.

여기서 중요한 사실 하나. **병합을 몇 번 할지가 곧 어휘 크기입니다.** 어휘 크기는 데이터에서 발견되는 값이 아니라 설계자가 정하는 하이퍼파라미터입니다. GPT-2의 어휘 구성이 이 구조를 그대로 드러냅니다.

```text
GPT-2 어휘 50,257 = 기본 바이트 256 + 병합 규칙 50,000 + 특수 토큰 1 (<|endoftext|>)
```

"기본 바이트 256개"라는 항에 설계가 하나 더 있습니다. 글자에서 시작하면 유니코드 16만 자 가까운 문자가 전부 기본 어휘에 들어가야 하고, 그래도 처음 보는 문자가 나오면 다시 `<UNK>`가 필요합니다. GPT-2는 시작점을 글자가 아니라 UTF-8 바이트로 내렸습니다. 어떤 텍스트든 256종 바이트의 나열이라 표현하지 못하는 입력이 원천적으로 사라집니다. 이 방식이 byte-level BPE입니다. 한글 한 글자는 UTF-8로 3바이트라서, 병합되기 전이라면 글자 하나가 3토큰인 셈입니다.

:::info

**SentencePiece와 Unigram**

서브워드를 만드는 알고리즘이 BPE만 있는 것은 아닙니다. Llama 초기 모델이 쓴 SentencePiece는 공백까지 일반 문자로 취급해 언어를 가리지 않고 처리하는 구현입니다(Llama는 그중 BPE 모드를 썼습니다). 같은 도구가 지원하는 Unigram 방식은 병합으로 어휘를 키워가는 대신 큰 후보 어휘에서 덜 유용한 조각을 덜어내는 반대 방향의 알고리즘입니다. 방향은 달라도 결과물은 닮았습니다. 자주 나오는 덩어리가 토큰이 된다는 원리가 같으니까요.

:::

특수 토큰은 이 병합 과정과 무관하게 어휘에 직접 박아 넣는 항목입니다. 생성 종료를 알리는 `<EOS>`, 챗 템플릿의 역할 구분자, 도구 호출을 감싸는 `<|tool_call|>` 같은 토큰들이죠. 모델 카드의 "시스템 역할을 토크나이저 수준에서 지원한다"는 말은 이런 토큰이 어휘의 정식 항목이라 사전학습 때부터 학습된다는 뜻입니다. 거꾸로 말하면, 배포된 모델에 특수 토큰을 나중에 끼워 넣으려면 어휘와 임베딩 행을 늘리고 다시 학습시켜야 합니다.

정리하면 토크나이저는 모델이 아닙니다. 모델 학습이 시작되기 전에 별도의 코퍼스 통계로 병합 규칙을 확정해 두고, 그 뒤로는 규칙을 기계적으로 적용하는 전처리기입니다. 모델은 텍스트를 본 적이 없습니다. 토크나이저가 넘겨준 번호의 나열만 봅니다.

<br>

## 색인 번호에서 벡터로

"오늘은 날씨가 좋았다"를 토크나이저에 넣으면 이렇게 나옵니다.

```text
"오늘은 날씨가 좋았다"
→ [149830, 4740, 61781, 68282, 4081, 32077, 69458]
   (오늘 · 은 · 날 · 씨 · 가 · 좋 · 았다)
```

이 번호는 어휘 목록의 색인일 뿐입니다. 149830번과 149831번은 이웃한 숫자지만 의미상 아무 관계가 없습니다. 그런데 신경망은 실수 벡터를 받아 실수 벡터를 내는 함수라서, 색인을 벡터로 바꿔주는 단계가 필요합니다.

그 일을 맡는 것이 **임베딩 테이블(embedding table)**입니다. 어휘 크기 $|V|$ 곱하기 $d_{model}$ 크기의 행렬 $E$를 두고, 토큰 ID가 들어오면 그 번호의 행을 꺼냅니다. 연산이라 부르기 민망할 만큼 단순한 조회(lookup)죠. ID를 one-hot 벡터로 만들어 행렬을 곱해도 결과는 같지만, 실제 구현은 그냥 행을 꺼냅니다.

여기서 $d_{model}$은 모델 전체가 쓰는 벡터의 폭입니다. 임베딩에서 나온 벡터도, Transformer 블록들이 주고받는 hidden state도 전부 이 차원이고, 모델 카드의 hidden size가 바로 이 값입니다. 행렬 $E$의 값은 처음에 무작위이고 다음 토큰을 맞히는 학습이 채웁니다. 비슷한 맥락에 나타나는 토큰들이 비슷한 벡터로 모이는 것은 그 학습의 부산물이고요.

모델의 반대쪽 끝에는 같은 모양의 행렬이 하나 더 있습니다. 마지막 Transformer 블록이 내놓은 hidden state를 어휘 전체의 점수로 되돌리는 행렬, 흔히 **lm_head** 또는 unembedding이라 부르는 부분입니다.

$$
P(w_{t+1} \mid w_{1:t}) = \mathrm{softmax}(W_U \, h_t), \qquad W_U \in \mathbb{R}^{|V| \times d_{model}}
$$

$h_t$는 마지막 위치의 hidden state이고 $W_U$가 lm_head입니다. 이 곱셈의 결과는 어휘 항목마다 하나씩, 총 $|V|$개의 점수(logit)이며 softmax가 이를 확률 분포로 바꿉니다. 모델이 매 스텝 어휘 전체에 대한 확률 분포를 내놓는다고 할 때, 그 분포가 물리적으로 계산되는 자리가 여기입니다.

$W_U$와 $E$는 전치 관계의 모양이라 아예 하나로 묶기도 합니다(weight tying). GPT-2가 그랬고, 지금은 갈립니다. 임베딩 비중이 큰 소형 모델에서는 묶는 쪽이 남는 장사라 Gemma 계열은 지금도 묶습니다. Llama는 8B 이상 주력 모델에서 따로 두지만, 소형인 3.2의 1B와 3B는 묶었습니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 640" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="텍스트가 모델을 통과하는 전체 흐름. 토크나이저가 텍스트를 토큰 ID로 바꾸고, 임베딩 테이블이 ID마다 d_model 차원 벡터를 꺼내며, Transformer 블록을 지난 hidden state를 lm_head가 어휘 크기의 확률 분포로 되돌립니다.">
  <style>
    .tk3-txt  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tk3-box  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tk3-core { fill: var(--bg-muted, #eeecea); stroke: var(--primary, #0a756c); stroke-width: 1.5; }
    .tk3-t    { fill: var(--text, #1c1917); font-size: 17px; text-anchor: middle; font-weight: 700; }
    .tk3-s    { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: middle; }
    .tk3-id   { fill: var(--text, #1c1917); font-size: 15px; text-anchor: middle; }
    .tk3-note { fill: var(--text-muted, #6d6762); font-size: 14px; text-anchor: end; }
    .tk3-ar   { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tk3Ar); }
    .tk3-div  { stroke: var(--border, #e7e5e4); stroke-width: 1.5; stroke-dasharray: 6 4; }
    .tk3-bar  { fill: var(--bg-muted, #eeecea); stroke: var(--border, #e7e5e4); stroke-width: 1; }
    .tk3-barh { fill: var(--primary, #0a756c); }
  </style>
  <defs>
    <marker id="tk3Ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="var(--text-muted, #6d6762)"/>
    </marker>
  </defs>
  <!-- 입력 텍스트 -->
  <rect x="80" y="16" width="240" height="40" rx="8" class="tk3-txt"/>
  <text x="200" y="42" class="tk3-t">"오늘은 날씨가 좋았다"</text>
  <line x1="200" y1="58" x2="200" y2="72" class="tk3-ar"/>
  <!-- 토크나이저 -->
  <rect x="60" y="76" width="280" height="56" rx="8" class="tk3-box"/>
  <text x="200" y="100" class="tk3-t">토크나이저</text>
  <text x="200" y="121" class="tk3-s">BPE 병합 규칙 적용</text>
  <line x1="200" y1="134" x2="200" y2="148" class="tk3-ar"/>
  <!-- 토큰 ID -->
  <rect x="60" y="152" width="280" height="38" rx="8" class="tk3-box"/>
  <text x="200" y="177" class="tk3-id">[149830, 4740, 61781, …]</text>
  <!-- 경계 -->
  <text x="380" y="212" class="tk3-note">여기까지 전처리 (CPU)</text>
  <line x1="20" y1="220" x2="380" y2="220" class="tk3-div"/>
  <text x="380" y="240" class="tk3-note">여기부터 모델</text>
  <line x1="200" y1="192" x2="200" y2="248" class="tk3-ar"/>
  <!-- 임베딩 -->
  <rect x="60" y="252" width="280" height="56" rx="8" class="tk3-core"/>
  <text x="200" y="276" class="tk3-t">임베딩 테이블 E</text>
  <text x="200" y="297" class="tk3-s">|V| × d_model · ID로 행 선택</text>
  <line x1="200" y1="308" x2="200" y2="322" class="tk3-ar"/>
  <!-- 벡터 -->
  <rect x="60" y="326" width="280" height="38" rx="8" class="tk3-box"/>
  <text x="200" y="351" class="tk3-id">토큰마다 d_model 차원 벡터</text>
  <line x1="200" y1="364" x2="200" y2="378" class="tk3-ar"/>
  <!-- Transformer -->
  <rect x="60" y="382" width="280" height="44" rx="8" class="tk3-core"/>
  <text x="200" y="410" class="tk3-t">Transformer 블록 × N</text>
  <line x1="200" y1="426" x2="200" y2="440" class="tk3-ar"/>
  <!-- hidden state -->
  <rect x="60" y="444" width="280" height="38" rx="8" class="tk3-box"/>
  <text x="200" y="469" class="tk3-id">마지막 위치 hidden state (d_model)</text>
  <line x1="200" y1="482" x2="200" y2="496" class="tk3-ar"/>
  <!-- lm_head -->
  <rect x="60" y="500" width="280" height="56" rx="8" class="tk3-core"/>
  <text x="200" y="524" class="tk3-t">lm_head (W_U)</text>
  <text x="200" y="545" class="tk3-s">|V| × d_model · 어휘 점수로 복원</text>
  <line x1="200" y1="556" x2="200" y2="570" class="tk3-ar"/>
  <!-- 확률 분포 -->
  <rect x="140" y="588" width="14" height="12" class="tk3-bar" transform="translate(0,-12)"/>
  <rect x="160" y="588" width="14" height="34" class="tk3-barh" transform="translate(0,-34)"/>
  <rect x="180" y="588" width="14" height="16" class="tk3-bar" transform="translate(0,-16)"/>
  <rect x="200" y="588" width="14" height="8" class="tk3-bar" transform="translate(0,-8)"/>
  <rect x="220" y="588" width="14" height="22" class="tk3-bar" transform="translate(0,-22)"/>
  <rect x="240" y="588" width="14" height="6" class="tk3-bar" transform="translate(0,-6)"/>
  <text x="200" y="616" class="tk3-s">다음 토큰 확률 분포 · |V|개</text>
</svg>
</div>

그림 가운데의 점선은 실무에서도 그대로 경계입니다. 토큰화와 디토큰화는 CPU 작업이라, 서빙 엔진들은 이 단계를 GPU 실행 루프와 별도 프로세스로 분리합니다. 긴 프롬프트를 쪼개는 동안 GPU에 일감을 주는 루프가 멈춰 있으면 그 시간만큼 GPU가 놀기 때문입니다.

:::info

**RAG의 임베딩과는 다른 물건입니다**

검색이나 RAG에서 말하는 임베딩은 별도의 임베딩 모델이 문장이나 문서 전체를 벡터 하나로 요약한 결과입니다. 이 글의 임베딩은 LLM 내부에서 토큰 하나마다 행 하나를 꺼내는 테이블이고요. 같은 단어를 쓰지만 만드는 주체도, 단위도, 용도도 다릅니다.

:::

<br>

## 토큰화가 만드는 실패들

토큰화는 공짜가 아닙니다. 가장 체감되는 비용은 언어 간 불균형입니다. 병합 규칙은 코퍼스 통계에서 나오는데, 학습 코퍼스는 영어가 압도적으로 많습니다. 그러니 영어는 긴 단어가 통째로 토큰이 되고, 다른 언어는 잘게 쪼개집니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 440 200" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="같은 의미의 문장을 어휘 10만 개의 GPT-4 토크나이저로 쪼갠 결과 비교. 영어 문장은 77자에 18토큰인데 한국어 문장은 31자에 39토큰으로, 글자 수는 절반 이하인데 토큰 수는 두 배가 넘습니다.">
  <style>
    .tk4-cp  { fill: var(--text-muted, #6d6762); font-size: 16px; }
    .tk4-h   { fill: var(--text, #1c1917); font-size: 17px; font-weight: 700; }
    .tk4-en  { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
    .tk4-ko  { fill: var(--bg-warn, #fffbeb); stroke: var(--accent, #9d5604); stroke-width: 1.5; }
    .tk4-n   { fill: var(--text, #1c1917); font-size: 17px; }
  </style>
  <text x="20" y="26" class="tk4-cp">같은 의미의 문장 · 어휘 10만(cl100k) 실측</text>
  <!-- 영어 -->
  <text x="20" y="66" class="tk4-h">영어 (77자)</text>
  <rect x="20" y="76" width="150" height="30" rx="4" class="tk4-en"/>
  <text x="180" y="97" class="tk4-n">18토큰</text>
  <!-- 한국어 -->
  <text x="20" y="146" class="tk4-h">한국어 (31자)</text>
  <rect x="20" y="156" width="325" height="30" rx="4" class="tk4-ko"/>
  <text x="353" y="177" class="tk4-n">39토큰</text>
</svg>
</div>

같은 의미의 문장을 GPT-4의 토크나이저(cl100k, 어휘 약 10만)로 쪼개 세어 보면 영어는 18토큰, 한국어는 39토큰입니다. 글자 수는 한국어가 절반도 안 되는데 토큰 수는 두 배를 넘습니다. 토큰이 곧 과금 단위이자 컨텍스트 창의 단위이니, 같은 내용을 다뤄도 한국어 사용자는 더 비싸게, 더 좁게 쓰는 셈입니다.

구조를 뜯어보면 한글은 출발선부터 다릅니다. byte-level 토크나이저에서 알파벳은 1바이트, 한글은 글자마다 3바이트에서 시작합니다. 거기서 얼마나 큰 덩어리로 병합되느냐는 코퍼스 등장 빈도가 정하는데, 병합 규칙의 자리는 코퍼스에 많은 영어 패턴부터 채워집니다. 덜 병합된 언어는 잘게 쪼개진 채 남습니다.

숫자도 피해자입니다. "12345"는 자주 나온 덩어리 기준으로 "123"과 "45"로 쪼개지고, "3.14159"는 "3", ".", "141", "59"가 됩니다. 자릿수 경계와 무관한 분할이라, 받아올림 같은 자릿수 연산을 배우기에 애초부터 불리한 표현입니다.

철자 질문은 더 근본적입니다. strawberry에 r이 몇 개냐는 질문에 모델이 헤매는 이유는, 앞에 공백이 붙은 " strawberry"가 통째로 토큰 하나이기 때문입니다. 모델이 받는 것은 그 토큰의 임베딩 벡터 하나이고, 그 안에 r이 세 번 나온다는 정보는 명시적으로 존재하지 않습니다. 모델은 글자를 본 적이 없으니, 철자를 답하려면 사전학습 어딘가에서 그 토큰과 철자의 관계를 통암기해 뒀어야 합니다.

마지막 한계는 고정성입니다. 병합 규칙과 어휘는 모델 학습 전에 확정되고 이후에는 바꿀 수 없습니다. 임베딩 테이블의 행 번호가 곧 어휘 항목이라, 어휘를 바꾸면 사전학습을 다시 해야 하니까요. 어휘가 다른 두 모델은 같은 텍스트를 서로 다른 ID 나열로 봅니다. draft 모델이 본체 대신 토큰을 미리 뽑는 speculative decoding에서 두 모델의 어휘가 같아야 하는 제약도 여기서 나옵니다.

<br>

## 어휘는 줄지 않고 늘었다

어휘 크기의 기준은 오랫동안 5만이었습니다. GPT-2와 GPT-3가 쓴 50,257이 사실상의 표준이었고, 언어 모델 계산에서 어휘를 5만으로 놓고 어림하는 관행도 여기서 나왔습니다. 그런데 최근 흐름은 정반대입니다.

```text
GPT-2   (2019)   50K
Llama 1 (2023)   32K
Llama 3 (2024)  128K
GPT-4o  (2024)  200K
Qwen3.5 (2026)  250K
Gemma 4 (2026)  262K
```

어휘를 키우는 이유는 방금 본 언어 간 불균형과 정확히 맞물립니다. 어휘가 크면 더 많은 덩어리가 통째로 토큰이 되고, 특히 영어 밖 언어가 덜 잘게 쪼개집니다. 위에서 39토큰이던 한국어 문장이 어휘 20만짜리 o200k에서는 18토큰입니다. 영어와 같은 수준까지 내려온 거죠. 어휘를 두 배로 키웠더니 한국어 처리 비용이 절반이 됐습니다. 같은 컨텍스트 창에 두 배의 내용이 들어가고, 토큰당 과금이라면 요금도 절반입니다.

물론 공짜는 아닙니다. 임베딩 테이블과 lm_head는 각각 $|V| \times d_{model}$ 크기라 어휘에 정비례해 커집니다. 어휘 26만에 $d_{model}$이 4096이면 행렬 하나가 10억 파라미터를 넘습니다. 수천억 파라미터 모델에서는 오차 수준이지만 수십억짜리 소형 모델에서는 전체의 상당 부분이 임베딩입니다. Gemma가 모델 크기를 말할 때 임베딩을 제외한 유효 파라미터를 따로 세는 이유가 이것입니다. 파라미터만의 문제도 아닙니다. 디코딩 매 스텝 lm_head 곱셈이 $|V|$개의 logit을 만들어야 하니, 어휘가 두 배면 이 곱셈의 비용도 두 배입니다.

참고로 Gemma 4의 262K는 어림수가 아니라 정확히 $2^{18}$, 즉 262,144입니다. 행렬 크기를 하드웨어가 다루기 좋은 2의 거듭제곱으로 맞추는 관행이 어휘 크기에도 적용된 결과입니다.

아예 토크나이저를 없애려는 연구도 있습니다. Meta의 BLT(Byte Latent Transformer)는 바이트를 직접 받되, 예측하기 어려운 지점을 기준으로 바이트를 동적 패치로 묶어 시퀀스 길이 문제를 피합니다. 다만 2026년 현재 이 방향은 연구 단계입니다. 8B 규모까지 스케일링이 확인됐을 뿐 프로덕션에 채택한 프론티어 모델은 없고, 지금 배포된 모델은 전부 BPE 계열 서브워드 토크나이저 위에서 돌아갑니다.

<br>

## 마치며

토큰은 모델이 세상을 받아들이는 해상도입니다. 그 경계는 압축 알고리즘 하나와 코퍼스 통계가 정했고, 한번 정해지면 모델과 함께 굳습니다. 요금표의 생김새부터 철자 질문의 오답까지, LLM을 쓰며 마주치는 특성 상당수가 모델에 들어가기도 전인 이 전처리 단계에서 이미 결정되어 있습니다.

모델의 출력이 어휘 전체에 대한 확률 분포라는 것까지 왔으니 다음 질문은 자연스럽습니다. 그 분포에서 토큰 하나를 실제로 어떻게 고를까요? 다음 글에서는 greedy, beam search, top-p, temperature 같은 생성 전략이 각각 어떤 확률적 의미인지 다룹니다.

<br>

## 함께 보면 좋은 글

- [LLM은 왜 다음 토큰 하나만 예측할까](/llm/what-is-llm/)
- [Transformer는 왜 Q, K, V 셋으로 나눴을까](/llm/transformer-architecture/)
- [Prefill과 Decode로 이해하는 LLM 추론 과정](/llm/llm-inference-process/)
- [One-Hot과 Label, 범주형 데이터 인코딩을 고르는 기준](/ml/categorical-encoding/)

<br>

## 참고자료

- [Neural Machine Translation of Rare Words with Subword Units (Sennrich et al., ACL 2016)](https://arxiv.org/abs/1508.07909)
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf)
- [SentencePiece: A simple and language independent subword tokenizer (Kudo & Richardson, EMNLP 2018)](https://arxiv.org/abs/1808.06226)
- [Using the Output Embedding to Improve Language Models (Press & Wolf, EACL 2017)](https://arxiv.org/abs/1608.05859)
- [Byte Latent Transformer: Patches Scale Better Than Tokens (Pagnoni et al., 2024)](https://arxiv.org/abs/2412.09871)
- [Let's build the GPT Tokenizer (Andrej Karpathy)](https://www.youtube.com/watch?v=zduSFxRajkE)
