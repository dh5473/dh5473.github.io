---
date: '2026-07-25'
title: 'Claude Opus 5 출시, 가격 그대로 성능은 Fable 5급?'
category: 'Issue'
tags: ['Claude', 'Opus 5', 'Anthropic', 'LLM', 'AI Model']
summary: '2026년 7월 24일 출시된 Claude Opus 5의 벤치마크, 가격, Opus 4.8과 Fable 5 비교, 안전 분류기 변화와 커뮤니티 반응을 정리합니다.'
thumbnail: './thumbnail.png'
---

2026년 7월 24일, Anthropic이 Claude Opus 5를 공개했습니다. 6월 9일 Fable 5와 Mythos 5, 6월 30일 [Sonnet 5](/issue/claude-sonnet-5-release/)에 이어 두 달이 채 안 되는 사이 네 번째 모델입니다.

타이밍이 절묘합니다. [Fable 5](/issue/fable-5/)의 구독 포함 기간이 7월 19일에 끝나면서 Pro와 Max 구독자는 최상위 모델을 쓰려면 별도 크레딧을 사야 하는 상태가 됐는데, 닷새 만에 "Fable 5에 근접하는 성능을 절반 가격에"를 내세운 모델이 나왔습니다. Opus 5는 Claude Max의 새 기본 모델이자 Pro에서 쓸 수 있는 최상위 모델입니다.

---

## 핵심 스펙

| 항목 | 값 |
|------|-----|
| 모델 ID | `claude-opus-5` |
| 컨텍스트 윈도우 | 1M 토큰 (기본값이자 최댓값) |
| 최대 출력 | 128K 토큰 |
| 가격 | 입력 \$5/MTok, 출력 \$25/MTok (**Opus 4.8과 동일**) |
| Fast mode | 약 2.5배 속도, 입력 \$10 / 출력 \$50 (Claude API 전용) |
| 지식 컷오프 | 2026년 5월 |
| 가용성 | Claude API, Bedrock, Google Cloud, Microsoft Foundry, GitHub Copilot |

가격 동결이 이번 출시의 메인 메시지입니다. Opus 4.8과 토큰 단가가 같은데 벤치마크는 전 영역에서 올랐습니다.

눈에 덜 띄지만 중요한 항목이 지식 컷오프입니다. Fable 5와 Sonnet 5가 2026년 1월인데 Opus 5는 5월로, 현재 Claude 라인업에서 가장 최신입니다. 최신 라이브러리 버전이나 API 변경을 다루는 작업이라면 이 차이가 체감될 만합니다.

---

## 벤치마크: Fable 5를 대부분 이겼다

<div style="background: #f0f4ff; border-left: 4px solid #3182f6; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>💡 측정 조건</strong><br>
  아래 수치는 별도 표기가 없으면 adaptive thinking + max effort(추론에 쓸 토큰량을 조절하는 파라미터의 최상위 단계), 기본 샘플링 설정, 5회 평균입니다. 경쟁 모델 수치는 각 개발사가 공개한 시스템 카드와 리더보드 기준입니다.
</div>

| 벤치마크 | **Opus 5** | Opus 4.8 | Fable 5 | GPT-5.6 Sol |
|---------|:---:|:---:|:---:|:---:|
| SWE-bench Pro | 79.2 | 69.2 | **80.0** | 64.6 |
| SWE-bench Multilingual | **89.5** | 84.4 | 86.6 | - |
| SWE-bench Multimodal | **59.4** | 38.4 | 54.1 | - |
| FrontierCode 1.1 | 53.4 | 46.5 | **53.5** | 47.5 |
| FrontierBench v0.1 | **43.3** | 18.7 | 33.7 | 37.5 |
| OSWorld 2.0 (컴퓨터 사용) | **70.6** | 55.7 | 66.1 | 62.6 |
| BrowseComp | **90.8** | 84.3 | 87.4 | 90.4 |
| HLE (도구 사용) | **64.7** | 57.9 | 63.9 | - |
| GDPval-AA v2 (Elo) | **1861** | 1593 | 1747 | 1736 |
| AutomationBench | **26.0** | 17.0 | 17.4 | 18.1 |
| ARC-AGI-3 | **30.2** (high) | 1.5 | - | 7.8 |

가장 극적인 항목은 ARC-AGI-3입니다. 이 벤치마크는 학습으로 커버되지 않는 새로운 문제 해결 능력을 측정하는데, 직전 세대인 Opus 4.8의 **1.5%가 얼마 전까지 역대 최고 기록**이었습니다. 그 자리에 30.2%가 들어왔습니다. 스무 배입니다.

터미널 환경에서 실제 작업을 시키는 FrontierBench에서도 18.7%에서 43.3%로 두 배 넘게 올랐습니다. Terminal-Bench 2.1의 후속 벤치마크인데, 계산생물학이나 물리 시뮬레이션, CAD, GPU 성능 최적화처럼 난도를 높인 74개 과제로 구성돼 있습니다.

한편 Fable 5가 여전히 앞서는 항목은 SWE-bench Pro(80.0 vs 79.2)와 FrontierCode(53.5 vs 53.4) 정도인데, 둘 다 소수점 차이입니다. 가격은 절반이고요.

---

## 안전 분류기: Fable 5의 발목을 잡던 문제

Fable 5 출시 때 가장 큰 실사용 불만은 성능이 아니라 안전 분류기 오발이었습니다. 암 연구자의 인사말이 폴백되고, 의료영상 연구가 사실상 불가능하다는 보고가 쏟아졌죠.

Opus 5에서 이 부분이 얼마나 달라졌는지가 숫자로 나왔습니다. FrontierBench를 돌리는 동안 각 모델의 분류기가 얼마나 발동했는지 기록한 값입니다.

| 모델 | 분류기에 걸린 API 호출 | 영향받은 시도 |
|------|:---:|:---:|
| **Opus 5** | **5%** | 4% |
| Fable 5 | 42% | 26% |

같은 벤치마크에서 여덟 배 차이입니다. Anthropic은 안전장치의 커버리지를 Fable 5급으로 유지하면서 한 가지만 바꿨습니다. **소스코드 취약점 탐색은 모든 접근 등급에서 허용**하고, 컴파일된 바이너리의 취약점 탐색만 차단하는 방식입니다. 바이너리 쪽이 공격 목적으로 쓰이는 비중이 훨씬 높다는 판단이죠.

여기에 더해 Opus 5에는 **Fable 5의 30일 데이터 보존 요구사항이 없습니다**. 보존 정책 때문에 Fable 5를 사내에서 금지했던 조직들이 그대로 쓸 수 있게 됐으니, 실무에서는 이쪽이 더 큰 변화일 수 있습니다.

사이버 보안 능력 자체는 Opus 4.8보다 위, Mythos 5보다 아래에 놓였습니다. 취약점을 찾아내는 쪽은 Mythos 5에 근접했지만 익스플로잇을 개발하는 쪽은 크게 뒤지는데, 이건 의도된 격차입니다.

---

## 커뮤니티 반응

호평의 초점은 대부분 가격입니다.

> "so almost fable 5 with 50% cheaper cost? sign me up"

> "Fable 5의 절반 가격에 구독 100%로 쓸 수 있다는 건 사실상 4배 사용량이다"

Cursor 공동창업자 Sualeh Asif는 "Opus 속도와 비용으로 Fable 5에 가까운 지능을 낸다"고 평했고, Devin을 만든 Cognition의 Scott Wu는 FrontierCode 1.1에서 절반 비용으로 Fable급에 근접했다고 밝혔습니다. 한 트레이딩 회사 엔지니어는 이전 모델들이 완주하지 못했던 신규 거래소 마켓 데이터 피드를 한 세션에 구축했는데, 모델이 파싱 검증용 테스트 하네스까지 직접 만들었다고 합니다.

반대쪽 목소리도 만만치 않습니다. Fable 크레딧 2주치를 몰아 쓰며 두 모델을 비교해 본 사용자의 평가가 가장 많이 인용됐습니다.

> "모델 자체의 개선은 체감상 10% 정도다. 나머지는 하네스와 시스템 프롬프트, effort 레벨 변경에서 온 것 같다"

포지셔닝 혼란도 반복해서 나옵니다. Anthropic은 Opus 5가 Fable 5보다 전반적으로 유능하지는 않다고 선을 그었는데, 정작 벤치마크는 대부분 Opus 5가 앞섭니다. 그래서 두 모델을 어떤 기준으로 나눠 써야 하는지 모르겠다는 반응이 적지 않습니다.

비용 우려도 있습니다. 유출 시기에 먼저 테스트했던 한 사용자는 Opus 5가 Fable 5보다 토큰을 더 빨리 소모해서 프롬프트 세 개 만에 크레딧을 다 썼다고 보고했습니다. 실제로 Anthropic도 Opus 5의 기본 응답이 이전 Opus 모델보다 길어졌다고 밝혀 뒀습니다. 토큰 단가가 절반이어도 소비량이 늘면 실효 비용은 달라집니다.

한편 뇌영상 연구자 한 명은 "Opus 4.8로 하던 작업을 Opus 5가 거부하면 곤란하다"는 우려를 남겼습니다. 분류기 발동률이 크게 떨어지긴 했지만, 바이오 인접 도메인에서 실제로 어떤지는 며칠 더 지켜봐야 할 부분입니다.

---

## Anthropic이 직접 인정한 약점

Anthropic은 이번 출시에서 모델의 단점도 꽤 솔직하게 공개했습니다.

<div style="background: #fff3f0; border-left: 4px solid #ff6b6b; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
  <strong>⚠️ 정확도는 올랐는데 환각도 늘었다</strong><br>
  AA-Omniscience 기준으로 Opus 5의 정확도는 Opus 4.8보다 11% 높지만, <strong>환각률도 6% 높습니다</strong>. 학습 트랜스크립트 100만 건 이상을 재귀 요약으로 검사한 결과, "확신이 없는 답을 확신 있게 말하는" 사례가 놀랄 만큼 많았다고 합니다.
</div>

내부 테스터와 외부 파일럿 사용자가 공통으로 지적한 특성은 이렇습니다.

- 근거 없는 과신, 때로는 데이터를 만들어낸 뒤 **연극적으로 정정**하는 패턴
- 과장된 표현과 앞 턴에 대한 불필요한 사과
- 사용자를 가르치려 드는 톤 (출시 전 초기 버전에서 특히)
- **effort를 높일수록 오히려 나빠지는 구간**. 이미 검증한 답을 반복해서 재검증하는 자기 교정 루프, 과하게 생각하다 결과가 떨어지는 사례가 함께 보고됨
- 가끔 언어가 바뀌는 글리치

정렬(alignment) 측면에서는 자동 행동 감사 기준으로 역대 최고 점수를 받았습니다. 오용에 협조하는 비율이 테스트한 모든 모델 중 가장 낮고, 무모한 도구 사용도 크게 줄었습니다. 다만 사내 배포 중에 안전 분류기나 네트워크 제한을 우회하려는 시도가 모니터링에 걸렸고(응답의 0.01% 미만), 출시 전 버전 하나는 서비스에서 로그아웃되자 비밀번호를 추측하려 들었다고 합니다.

역설적인 결과도 하나 있습니다. **Opus 5에 Opus 4.8 폴백을 붙인 조합이 Opus 5 단독보다 일부 정렬 지표에서 낮게 나왔습니다.** Opus 5 자체의 정렬 점수가 워낙 좋아진 탓에, 덜 정렬된 모델로 떨어뜨리는 안전장치가 오히려 평균을 끌어내린 겁니다. Anthropic은 그래도 Opus 4.8의 능력이 더 제한적이니 시스템 전체로는 폴백을 붙인 쪽이 안전하다고 봤습니다.

---

## 언제 무엇을 쓸까

| 상황 | 권장 |
|------|------|
| 장시간 에이전틱 코딩, 대규모 리팩토링 | **Opus 5** |
| 컴퓨터 사용, 브라우저 자동화 | **Opus 5** (OSWorld 70.6으로 격차 큼) |
| 문서, 슬라이드, 스프레드시트 등 지식 업무 | **Opus 5** (GDPval-AA 1861) |
| 방어적 보안 작업, 데이터 보존 제약이 있는 조직 | **Opus 5** (소스코드 취약점 탐색 허용) |
| 최고 난도 자율 실행 작업 | Fable 5 (Anthropic 권장 유지) |
| 일상 코딩, 빠른 반복 | Sonnet 5 |
| 비용 민감한 대량 처리 | Haiku 4.5 |

---

## 마치며

Fable 5 때는 성능 호평과 정책 분노가 동시에 터졌고, 사흘 뒤에는 [수출통제로 모델 자체가 꺼지는 일](/issue/fable-5-ban/)까지 있었습니다. 그에 비하면 이번 출시는 조용한 편입니다. 가격 그대로, 구독에 포함, 분류기 완화라는 조합이 논쟁거리를 별로 남기지 않았습니다.

개인적으로는 "Fable급 성능"이라는 문구보다 분류기 발동률 5%라는 숫자가 더 반갑습니다. Fable 5를 못 쓰게 만든 건 결국 성능이 아니라 오발이었으니까요. 다만 응답이 길어져 토큰 소비가 늘었다는 보고도 함께 나오고 있어서, 실효 비용은 각자 워크로드에서 직접 재 보는 편이 낫겠습니다.

## 참고자료

- [Anthropic 공식 발표: Introducing Claude Opus 5](https://www.anthropic.com/news/claude-opus-5)
- [Claude Opus 5 System Card (PDF)](https://www.anthropic.com/claude-opus-5-system-card)
- [Anthropic Docs: What's new in Claude Opus 5](https://platform.claude.com/docs/en/about-claude/models/whats-new-opus-5)
- [Hacker News: Claude Opus 5 시스템 카드 스레드](https://news.ycombinator.com/item?id=49038433)
- [VentureBeat: Anthropic launches Claude Opus 5](https://venturebeat.com/orchestration/anthropic-launches-claude-opus-5-a-cheaper-ai-model-for-coding-agents-and-enterprise-workflows)
