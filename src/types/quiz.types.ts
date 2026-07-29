export type QuizQuestionType = 'single' | 'multi' | 'ox'

/** 1 개념 확인 · 2 상황 적용 · 3 분석과 판단. 라벨은 QuizMeta.tsx가 갖는다 */
export type QuizDifficulty = 1 | 2 | 3

export type QuizScenarioKind = 'sql' | 'log' | 'plan' | 'code' | 'svg' | 'text'

export type QuizScenario = {
  kind: QuizScenarioKind
  /** kind가 svg가 아닐 때의 본문 */
  body?: string
  /** kind가 code일 때의 prism 언어 */
  lang?: string
  /** kind가 svg일 때의 파일명 */
  asset?: string
  /** 빌드 타임에 인라인된 SVG 문자열 */
  svg?: string
}

export type QuizChoice = {
  text: string
  /** 정답 표시. 인덱스가 아니라 플래그라 선택지를 셔플해도 추적이 따라온다 */
  correct?: boolean
  /** 왜 이 선택지가 답인지 또는 답이 아닌지. 모든 선택지에 있어야 한다 */
  why: string
}

export type QuizChain = {
  id: string
  order: number
}

export type QuizQuestion = {
  id: string
  type: QuizQuestionType
  difficulty: QuizDifficulty
  /** post = 글 기반 · extended = 글 밖 확장이나 면접 질문 */
  source: 'post' | 'extended'
  tags?: string[]
  chain?: QuizChain
  scenario?: QuizScenario
  question: string
  choices: QuizChoice[]
  explanation: string
  explainAsset?: string
  /** 빌드 타임에 인라인된 해설 SVG 문자열 */
  explainSvg?: string
  postSlug: string
  postTitle?: string | null
  anchor?: string
}

export type QuizScopeSummary = {
  id: string
  title: string
  description: string
  /** seriesData.ts의 키. 색상을 그대로 재사용한다 */
  series: string
  questionCount: number
  postCount: number
  /** [난이도1, 난이도2, 난이도3] 문항 수 */
  difficultySpread: [number, number, number]
}

export type QuizPostGroup = {
  slug: string
  title: string | null
  seriesOrder: number
  questions: QuizQuestion[]
}
