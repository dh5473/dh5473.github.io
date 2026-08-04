---
date: '2026-06-13'
title: 'Claude Fable 5, 출시 3일 만에 차단됐다고? AI 수출통제'
category: 'Issue'
tags: ['Claude', 'Fable 5', 'Anthropic', 'AI Export Control', 'AI 규제']
summary: '출시 사흘 만에 미국 정부가 수출통제로 Claude Fable 5와 Mythos 5를 막았습니다. 라이브 상용 AI 서비스에 적용된 전례 없는 수출통제와 그 파장, 그리고 투명성의 역설을 분석합니다.'
thumbnail: './thumbnail.png'
---

2026년 6월 9일에 공개된 Claude Fable 5는 "역대 최강"이라는 평가를 받았습니다. AI 연구자 Andrej Karpathy가 "major-version-bump-deserving step change forward"라고 표현했고, Anthropic이 출시 발표에서 인용한 사전 테스트에서는 Stripe가 자체적으로 2개월 걸릴 것으로 추산한 5,000만 라인 규모 마이그레이션을 하루 만에 끝냈다고 밝혔습니다. 그런데 그 모델이 **출시 사흘 만인 6월 12일 저녁에 접근 차단**됐습니다. 서버가 죽은 것도, 회사가 내린 것도 아닙니다. 미국 정부가 막았습니다.

더 정확히 말하면, 미 상무부가 국가안보를 근거로 한 **수출통제(export control) 지침**을 보냈고, Anthropic이 이를 따르느라 Fable 5와 Mythos 5를 전 사용자 대상으로 비활성화했습니다. 칩이나 모델 가중치가 아니라, 미국 서버에서 돌아가던 라이브 상용 서비스가 통제 대상이 됐습니다. 알려진 바로는 전례가 없는 적용 방식입니다. 이번 글에서는 무슨 일이 있었는지, 그리고 이게 왜 단순한 해프닝이 아니라 AI 산업 전체에 남는 선례인지 정리합니다.

## 사흘 동안 무슨 일이 있었나

출시부터 차단까지 걸린 시간은 정확히 사흘입니다. 압축하면 이렇습니다.

![6월 9일 출시부터 6월 12일 수출통제 지침, 전 세계 차단까지 단 3일간의 Claude Fable 5 사건 타임라인](./fable5-ban-timeline.png)

- **6월 9일**: Anthropic이 Claude Fable 5와 Mythos 5를 공개. "역대 최강" 호평이 쏟아짐
- **6월 9일~11일**: 시스템 카드에서 일부 작업의 성능을 사용자에게 알리지 않고 제한하는 장치가 발견되며 논란. Anthropic이 *"We made the wrong tradeoff and we apologize for not getting the balance right"* 라며 정책을 철회하고, 제한을 숨기지 않고 거부 사실을 명시적으로 알리는 방식으로 전환
- **6월 12일 오후 5시 21분(미 동부시간)**: 상무장관 Howard Lutnick이 Dario Amodei 앞으로 보낸 수출통제 지침 letter를 Anthropic이 수령
- **6월 12일 저녁**: Anthropic이 Fable 5와 Mythos 5를 전 세계 모든 사용자 대상으로 비활성화

출시 직후의 "보이지 않는 성능 제한" 논란은 회사가 사용자 모르게 모델 성능을 조절했다는, 말하자면 기업이 일방적으로 통제권을 쥔 사안이었습니다. 회사가 하루 만에 철회하며 수습하긴 했죠. 그런데 그게 정리되자마자, 이번에는 정부가 통제권을 쥐는 훨씬 큰 일이 회사 바깥에서 터졌습니다.

## 미 정부의 수출통제 지침

핵심부터 보겠습니다. 상무부가 보낸 지침의 내용은 **"Fable 5와 Mythos 5를 모든 외국 국적자(foreign national)에게 제공하지 말라"** 였습니다. 여기서 외국 국적자의 범위가 넓습니다.

:::warning

**차단 범위**

미국 밖의 모든 사용자뿐 아니라, **미국 내에 거주하는 외국 국적자**, 그리고 **Anthropic 자사의 외국 국적 직원**까지 포함됩니다. 즉 미국 시민이 아니면 누구도 쓸 수 없습니다.

:::

문제는 실시간으로 사용자의 국적을 가려낼 방법이 없다는 점입니다. 수억 명이 쓰는 상용 서비스에서 누가 미국 시민이고 누가 아닌지를 즉시 검증할 수 없으니, 선택적으로 차단하는 것 자체가 불가능했습니다. 결국 Anthropic은 전체를 끄는 것 외에 선택지가 없었습니다. 공식 성명의 표현이 이 상황을 그대로 담고 있습니다.

> "The net effect of this order is that we must abruptly disable Fable 5 and Mythos 5 for **all** our customers to ensure compliance." (Anthropic 공식 성명)

다행히 영향 범위는 두 모델로 한정됐습니다. Opus 4.8을 비롯한 나머지 Claude 모델은 그대로 쓸 수 있습니다. 다만 API에서 `claude-fable-5`를 직접 호출하도록 짜둔 통합은 즉시 깨졌고, Fable 5를 워크플로우에 넣었던 기업 고객들도 곧바로 영향을 받았습니다. 출시 사흘 만에 워크플로우를 짜두기엔 짧은 시간이었지만, 그 사흘 안에 통합한 곳들은 갑작스럽게 대응해야 했습니다.

## 정부의 이유 vs Anthropic의 반박

정부가 든 사유는 **"jailbreak"** 였습니다. 보도를 종합하면, 다른 한 업체가 Mythos를 jailbreak하는 방법을 찾았다고 주장했고, 이것이 행정부 내부에서 국가안보 우려로 번졌습니다. Fable 5와 Mythos 5는 출시 시점에 사이버보안 같은 고위험 영역의 응답을 막는 분류기를 갖추고 있었는데, 그 안전장치를 우회할 수 있다는 것이 문제로 지목된 셈입니다.

Anthropic의 반박은 세 갈래입니다.

| 쟁점 | 정부 측 주장 | Anthropic 반박 |
|---|---|---|
| **위험의 성격** | 안전장치를 뚫는 jailbreak 존재 | 특정 코드베이스를 읽고 결함을 찾는 좁고 비보편적인 jailbreak일 뿐, 모든 안전장치를 무력화하는 게 아님 |
| **고유성** | 국가안보 위협 | 같은 수준의 능력은 GPT-5.5 등 이미 공개된 다른 모델에서도 널리 쓸 수 있음 |
| **근거** | 수출통제 발동 | letter에 서면 근거 없이 구두 설명만 제공됨 |

Anthropic이 정부 지침을 법적으로 따르면서도 명확히 선을 그은 문장이 있습니다.

> "We disagree that the finding of a narrow potential jailbreak should be cause for recalling a commercial model deployed to hundreds of millions of people." (Anthropic 공식 성명)

회사의 논리는 일관됩니다. 좁은 jailbreak 하나를 근거로 수억 명에게 배포된 상용 모델을 회수하는 기준을 세운다면, 그 기준을 업계 전체에 똑같이 적용할 경우 **모든 프런티어(최첨단) 모델의 신규 출시가 사실상 멈춘다**는 것입니다. 어떤 모델이든 출시 직후 좁은 우회법 하나쯤은 발견되기 마련이니까요.

## 왜 이게 전례 없는 일인가

이 사건이 단순한 규제 해프닝이 아닌 이유는 **수출통제를 적용한 대상** 때문입니다. 기존의 AI 관련 수출통제는 물리적인 것, 즉 GPU 같은 하드웨어나 모델 가중치 파일을 대상으로 했습니다. 외국으로 "나가는" 무언가가 있었죠.

| 구분 | 기존 수출통제 | 이번 Fable 5 차단 |
|---|---|---|
| **대상** | GPU, 칩 제조 장비, 모델 가중치 | 미국 서버에서 돌아가는 라이브 상용 서비스 |
| **형태** | 국경을 넘는 물리적/디지털 자산 | 이미 배포돼 운영 중인 API 엔드포인트 |
| **실행 속도** | 심사와 고시 절차 | letter 한 통, 수 시간 내 셧다운 |

이번에는 국경을 넘는 게 아무것도 없습니다. 미국 데이터센터에서 돌아가는 서비스에 누가 접속하느냐를 통제했을 뿐입니다. 정책 분석가들이 주목한 지점도 여기입니다. 개별 품목이 한 당사자에서 다른 당사자로 이전되는 것을 전제로 설계된 권한을, API로 상시 접근 가능한 프런티어 모델에 적용했다는 것입니다. AI 모델을 **반도체에 준하는 전략 자산**으로 취급하기 시작했다는 신호로 읽힙니다.

속도도 이례적입니다. 정식 심사나 고시 절차가 아니라 letter 한 통으로, 그것도 서면 근거 없이, 수억 명이 쓰던 서비스가 몇 시간 만에 멈췄습니다.

## 투명성의 역설

이 사건에서 가장 곱씹어볼 지점은 따로 있습니다. 이번 차단의 직접적인 방아쇠는 타 업체의 jailbreak 주장이었지만, 그보다 더 근본적인 문제로 지적되는 것은 **자발적 투명성이 규제의 탄약이 되는 구조**입니다.

Anthropic은 상세한 시스템 카드와 책임 있는 스케일링 정책(Responsible Scaling Policy)으로 모델의 위험과 한계를 공개해 왔습니다. 사이버보안 능력이 어디까지인지, 어떤 안전장치를 뒀는지, 어떤 우회 가능성이 있는지를 자발적으로 문서화한 것입니다. 문제는 바로 그렇게 공개된 자료가, 규제 당국이 조치의 근거로 삼기에 가장 좋은 재료가 된다는 점입니다.

<div style="margin: 24px 0; text-align: center;">
<svg viewBox="0 0 400 264" style="width: 100%; height: auto; max-width: 380px;"
     xmlns="http://www.w3.org/2000/svg"
     font-family="Pretendard, -apple-system, sans-serif"
     role="img" aria-label="자발적 안전 공개가 규제 근거가 되고 그 결과 다음 공개가 위축되는 순환">
<style>
.tp-t { fill: var(--text, #1c1917); font-size: 16px; font-weight: 700; }
.tp-l { fill: var(--text, #1c1917); font-size: 14px; }
.tp-n { fill: var(--text-muted, #6d6762); font-size: 14px; }
.tp-box { fill: var(--bg-subtle, #f5f4f2); stroke: var(--border, #e7e5e4); stroke-width: 1.5; }
.tp-bad { fill: var(--bg-danger, #fef2f2); stroke: var(--text-danger, #cb2121); stroke-width: 1.5; }
.tp-a { stroke: var(--text-muted, #6d6762); stroke-width: 1.5; fill: none; marker-end: url(#tpArrow); }
</style>
<defs>
<marker id="tpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
<path d="M0 0 L10 5 L0 10 z" fill="var(--text-muted, #6d6762)"/>
</marker>
</defs>
<text class="tp-t" x="200" y="22" text-anchor="middle">투명성이 근거가 되는 순환</text>
<rect class="tp-box" x="110" y="38" width="180" height="48" rx="6"/>
<text class="tp-l" x="200" y="60" text-anchor="middle">안전 정보를</text>
<text class="tp-l" x="200" y="78" text-anchor="middle">자발적으로 공개</text>
<path class="tp-a" d="M255 88 L292 144"/>
<rect class="tp-box" x="215" y="150" width="165" height="48" rx="6"/>
<text class="tp-l" x="297" y="172" text-anchor="middle">규제 조치의</text>
<text class="tp-l" x="297" y="190" text-anchor="middle">근거로 사용</text>
<path class="tp-a" d="M213 174 L192 174"/>
<rect class="tp-bad" x="20" y="150" width="165" height="48" rx="6"/>
<text class="tp-l" x="102" y="172" text-anchor="middle">다음 출시에서</text>
<text class="tp-l" x="102" y="190" text-anchor="middle">공개가 위축</text>
<path class="tp-a" d="M108 148 L145 92"/>
<text class="tp-n" x="200" y="240" text-anchor="middle">투명할수록 불리해지는</text>
<text class="tp-n" x="200" y="258" text-anchor="middle">역인센티브</text>
</svg>
</div>

문제는 이 구조가 AI 안전 연구 전체에 던지는 메시지입니다. 프런티어 랩이 "우리 모델은 이런 위험이 있으니 특별한 통제가 필요하다"고 스스로 밝히는 순간, 정부는 그 진술을 곧바로 쓸 수 있는 명분으로 삼아 랩이 의도한 것보다 훨씬 거칠고 광범위한 통제를 가할 수 있습니다. 다음 출시 때 어느 회사가 이만큼 상세한 시스템 카드를 쓰려 할까요. 자발적 안전 공개를 위축시키는 방향으로 작동한다면, 이건 안전을 위한 조치가 오히려 안전 정보를 숨기게 만드는 자기모순입니다.

## 커뮤니티와 전문가 반응

반응은 크게 세 갈래로 갈렸습니다.

가장 큰 줄기는 선례에 대한 우려입니다. AI 정책 분석가 Dean W. Ball의 코멘트가 분위기를 압축합니다.

> "I can't tell if this is lawfare against Anthropic in particular or extreme national-security hawkery. Regardless, it is simply cartoonish."

Anthropic을 겨냥한 법적 압박(lawfare)인지 과도한 안보 매파주의인지 모르겠지만, 어느 쪽이든 어처구니없을 만큼 우스꽝스럽다는 것입니다.

실효성에 의문을 던지는 쪽은 한층 냉소적입니다. "지니를 다시 병에 넣을 수는 없다"는 반응이 대표적인데, 앞서 본 Anthropic의 반박과 같은 맥락에서, 같은 수준의 능력이 GPT-5.5를 비롯한 다른 모델에 이미 존재하고, 시간이 지나면 비슷한 성능의 open-weight 모델이 나오는 것이 거의 불가피하다는 지적입니다. 그렇다면 특정 모델 하나를 막는 것이 실질적으로 무엇을 막느냐는 물음이죠. 1990년대 강한 암호화 기술을 무기로 분류해 수출을 통제했던 "Crypto Wars"의 평행 사례를 드는 분석도 있었습니다. 결국 기술 확산을 막지 못했던 그 역사 말입니다.

마지막으로, 이 조치가 어디까지 번질지 경계하는 시각입니다. 수출통제가 라이브 서비스에까지 적용된다면 다음 차례는 클라우드 서비스 전반이라는 우려도 나왔습니다. 물론 무제한 LLM이 위험 정보를 제공할 수 있다는 점에서 민주적 접근과 책임 있는 배포 사이의 긴장은 실재한다는, 정부 측에 일부 공감하는 목소리도 함께 있었습니다.

:::info

**Microsoft의 차단은 별개입니다**

비슷한 시기에 Microsoft가 직원들의 Claude Fable 5 사용을 일시 금지했다는 보도가 있었는데, 이는 정부 수출통제와 전혀 다른 사안입니다. Anthropic의 **데이터 보존(data retention) 정책**에 따라 민감 정보가 노출될 수 있다는 사내 우려가 이유였습니다. 정부 차단과 혼동하지 않도록 주의가 필요합니다.

:::

:::info

**후속 (2026년 6월 30일)**

차단은 영구적이지 않았습니다. 6월 26일 일부 기업과 정부기관에 한해 Mythos 5 제공이 먼저 허용됐고, **6월 30일 수출통제가 해제**됐습니다.

Lutnick 상무장관은 Anthropic이 모델과 관련된 보안 위험을 선제적으로 탐지하고 해결하기로 했고, 앞으로의 모델 기준에 협력하며 악용 사례를 통보하기로 합의해 수출 라이선스가 불필요해졌다고 밝혔습니다. 회사가 정부와의 협의를 통해 접근권을 되찾은 셈입니다.

:::

## 그래서 무엇이 남나

모델이 다시 켜졌다고 해서 이 사건이 없던 일이 되지는 않습니다.

남는 것은 선례입니다. 미국 정부는 이번에 **라이브 상용 AI 서비스를 수 시간 만에, 서면 근거 없이, 국가안보를 이유로 멈춰 세울 수 있음**을 실제로 보여줬습니다. 프런티어 AI의 접근권이 회사의 사업 결정이나 기술적 한계의 문제가 아니라, 본질적으로 정치적인 문제가 되는 순간입니다. 모델의 능력이 전략적으로 의미 있는 수준에 도달하면, 누가 그것을 쓸 수 있는지는 더 이상 회사 혼자 정하는 문제가 아니게 됩니다.

해제 조건도 같은 이야기를 합니다. 접근권이 명문화된 절차가 아니라 회사와 정부 사이의 개별 합의로 복원됐다는 것은, 다음번에도 같은 방식으로 다뤄질 수 있다는 뜻입니다. 이 사건이 던지는 질문은 결국 거버넌스의 형태입니다. 통제의 손잡이를 회사의 일방적 결정(보이지 않는 성능 제한)에 맡길 수도, 정부의 일방적 지침(서면 근거 없는 셧다운)에 맡길 수도 없다면, 그 사이 어딘가에 가시적인 안전장치, 독립적인 평가, 명확한 이의제기 절차, 그리고 open-source 생태계의 역할을 인정하는 합의가 필요하다는 것입니다. Fable 5는 출시 사흘 만에 그 합의가 아직 존재하지 않는다는 사실을 가장 비싼 방식으로 증명했습니다.

## 함께 보면 좋은 글

- [Claude Fable 5: 성능은 역대 최강인데 왜 논란일까?](/issue/fable-5/) : 출시 당시의 성능과 정책 논란

## 참고자료

- [Anthropic 공식 성명: Statement on the US government directive to suspend access to Fable 5 and Mythos 5](https://www.anthropic.com/news/fable-mythos-access)
- [Al Jazeera: US orders Anthropic to disable AI models for all foreign nationals](https://www.aljazeera.com/news/2026/6/13/us-orders-anthropic-to-disable-ai-models-for-all-foreign-nationals)
- [CNBC: Anthropic disables access to Fable 5 and Mythos 5 to comply with government directive](https://www.cnbc.com/2026/06/12/anthropic-disables-access-to-fable-5-and-mythos-5-to-comply-with-government-directive.html)
- [CNBC: Trump admin has lifted export controls on Claude Fable 5 and Mythos 5](https://www.cnbc.com/2026/06/30/anthropic-says-trump-admin-has-lifted-export-controls-on-claude-fable-5-and-mythos-5.html)
- [Tech Policy Press: Did the US government just set an AI export precedent?](https://www.techpolicy.press/did-the-us-government-just-set-an-ai-export-precedent-by-blocking-mythos/)
- [Fortune: Anthropic disables Fable and Mythos AI models after U.S. government bars foreign access](https://fortune.com/2026/06/13/anthropic-disables-fable-mythos-export-controls-national-security-threat/)
- [Hacker News: Our response to the US ban on Fable 5 and Mythos 5](https://news.ycombinator.com/item?id=48512915)
