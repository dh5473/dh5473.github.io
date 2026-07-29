import { QuizDifficulty, QuizQuestion } from 'types/quiz.types'
import { PreparedChoice } from 'components/Quiz/QuestionCard'

/**
 * 출제 단위. 체인 문항은 항상 붙어서, 정해진 순서로 나와야 하므로
 * 섞기 전에 하나의 단위로 묶는다.
 */
export type QuizUnit = {
  chainId: string | null
  questions: QuizQuestion[]
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function buildUnits(questions: QuizQuestion[]): QuizUnit[] {
  const units: QuizUnit[] = []
  const chains = new Map<string, QuizUnit>()

  questions.forEach(question => {
    const chainId = question.chain?.id
    if (!chainId) {
      units.push({ chainId: null, questions: [question] })
      return
    }

    let unit = chains.get(chainId)
    if (!unit) {
      unit = { chainId, questions: [] }
      chains.set(chainId, unit)
      units.push(unit)
    }
    unit.questions.push(question)
  })

  chains.forEach(unit => {
    unit.questions.sort((a, b) => (a.chain?.order ?? 0) - (b.chain?.order ?? 0))
  })

  return units
}

export type SessionOptions = {
  /** null이면 전체 */
  count: number | null
  /** 빈 배열이면 전체 */
  difficulties: QuizDifficulty[]
}

/**
 * 난이도 필터는 문항이 아니라 단위 기준으로 적용한다.
 * 체인 중간 문항만 걸러내면 앞뒤 맥락이 끊겨 오히려 못 푸는 문항이 되기 때문이다.
 */
export function pickQuestions(
  questions: QuizQuestion[],
  { count, difficulties }: SessionOptions,
): QuizQuestion[] {
  const units = buildUnits(questions).filter(
    unit =>
      difficulties.length === 0 ||
      unit.questions.some(q => difficulties.includes(q.difficulty)),
  )

  const shuffled = shuffle(units)
  if (count == null) return shuffled.flatMap(unit => unit.questions)

  // 체인은 쪼개지 않는다. 목표 개수를 채우면서 마지막 체인은 끝까지 담는다.
  const picked: QuizQuestion[] = []
  for (const unit of shuffled) {
    if (picked.length >= count) break
    picked.push(...unit.questions)
  }
  return picked
}

export function prepareChoices(question: QuizQuestion): PreparedChoice[] {
  const keyed = question.choices.map((choice, index) => ({
    ...choice,
    key: index,
  }))
  // 정답이 index가 아니라 correct 플래그라 섞어도 추적이 따라온다
  return shuffle(keyed)
}

export function correctKeys(question: QuizQuestion): number[] {
  return question.choices
    .map((choice, index) => (choice.correct ? index : -1))
    .filter(index => index >= 0)
}

export function isCorrect(question: QuizQuestion, selected: number[]): boolean {
  const answer = correctKeys(question)
  if (answer.length !== selected.length) return false
  return answer.every(key => selected.includes(key))
}

export type StoredSession = {
  questionIds: string[]
  choiceOrder: Record<string, number[]>
  answers: Record<string, number[]>
  index: number
}

const storageKey = (scopeId: string) => `quiz-session:${scopeId}`

/** 이탈 후 돌아왔을 때 이어서 풀기 위한 임시 저장. 정오답 이력과는 무관하다 */
export function saveSession(scopeId: string, session: StoredSession): void {
  try {
    sessionStorage.setItem(storageKey(scopeId), JSON.stringify(session))
  } catch {
    // 저장 실패는 세션 진행을 막지 않는다
  }
}

export function loadSession(scopeId: string): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(scopeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!Array.isArray(parsed.questionIds) || parsed.questionIds.length === 0) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearSession(scopeId: string): void {
  try {
    sessionStorage.removeItem(storageKey(scopeId))
  } catch {
    // noop
  }
}
