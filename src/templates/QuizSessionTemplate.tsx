import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { graphql, navigate } from 'gatsby'
import styled from '@emotion/styled'
import Template from 'components/Common/Template'
import QuizChrome from 'components/Quiz/QuizChrome'
import QuestionCard, { PreparedChoice } from 'components/Quiz/QuestionCard'
import { DifficultySpread, DIFFICULTY_LABEL } from 'components/Quiz/QuizMeta'
import { QuizDifficulty, QuizQuestion, QuizScopeSummary } from 'types/quiz.types'
import { seriesMetadata } from 'utils/seriesData'
import {
  clearSession,
  isCorrect,
  loadSession,
  pickQuestions,
  prepareChoices,
  saveSession,
} from 'utils/quizSession'
import { c, bp, shadow } from 'styles/theme'

type QuizSessionTemplateProps = {
  data: {
    site: { siteMetadata: { title: string; siteUrl: string } }
  }
  pageContext: {
    scope: QuizScopeSummary
    questions: QuizQuestion[]
  }
}

type Stage = 'setup' | 'playing' | 'result'

// ─── Setup ───────────────────────────────────────────────────────────

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 800;
  color: ${c.text};

  ${bp.sm} {
    font-size: 25px;
  }
`

const Lead = styled.p`
  margin: 0 0 28px;
  font-size: 15.5px;
  line-height: 1.7;
  color: ${c.textMuted};
  word-break: keep-all;
`

const Panel = styled.div`
  border: 1px solid ${c.border};
  border-radius: 14px;
  background: ${c.bg};
  padding: 24px 26px;
  box-shadow: ${shadow.sm};

  ${bp.sm} {
    padding: 20px 16px;
  }
`

const FieldLabel = styled.p`
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${c.textMuted};
`

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
`

const Chip = styled.button<{ active: boolean }>`
  padding: 9px 15px;
  border-radius: 999px;
  border: 1.5px solid ${({ active }) => (active ? c.primary : c.border)};
  background: ${({ active }) => (active ? c.bgMuted : c.bgSubtle)};
  color: ${({ active }) => (active ? c.primary : c.text)};
  font-family: inherit;
  font-size: 14px;
  font-weight: ${({ active }) => (active ? 700 : 500)};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${c.primary};
  }
`

const PrimaryButton = styled.button`
  width: 100%;
  padding: 15px;
  border: none;
  border-radius: 10px;
  background: ${c.primary};
  color: #ffffff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${c.primaryHov};
  }
`

const GhostButton = styled.button`
  width: 100%;
  margin-top: 10px;
  padding: 13px;
  border: 1.5px solid ${c.border};
  border-radius: 10px;
  background: ${c.bgSubtle};
  color: ${c.text};
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: ${c.primary};
    color: ${c.primary};
  }
`

const SetupMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  font-size: 14px;
  color: ${c.textMuted};
`

const SpreadSlot = styled.div`
  flex: 1;
  max-width: 180px;
`

const FootLink = styled.a`
  display: inline-block;
  margin-top: 22px;
  font-size: 14px;
  font-weight: 600;
  color: ${c.textMuted};
  text-decoration: none;

  &:hover {
    color: ${c.primary};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

/** 시작 전에 어떤 글이 범위인지 보여준다. 읽지 않은 글이 있으면 먼저 읽고 오게 된다. */
const CoverLabel = styled.p`
  margin: 34px 0 12px;
  font-size: 11px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const CoverGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;

  ${bp.sm} {
    grid-template-columns: 1fr;
  }
`

const CoverItem = styled.a`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid ${c.borderMuted};
  border-radius: 10px;
  background: ${c.bgSubtle};
  text-decoration: none;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${c.primary};
    background: ${c.bgMuted};
  }
`

const CoverTitle = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.45;
  color: ${c.text};
  word-break: keep-all;
`

const CoverCount = styled.span`
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: ${c.textMuted};
`

// ─── Playing ─────────────────────────────────────────────────────────

const ProgressWrap = styled.div`
  position: sticky;
  top: 60px;
  z-index: 50;
  margin: -32px -32px 20px;
  padding: 12px 32px;
  background: ${c.bg};
  border-bottom: 1px solid ${c.border};

  ${bp.md} {
    top: 54px;
    margin: -20px -16px 16px;
    padding: 10px 16px;
  }
`

const ProgressTrack = styled.div`
  height: 4px;
  border-radius: 2px;
  background: ${c.bgMuted};
  overflow: hidden;
`

const ProgressFill = styled.div<{ tone: string }>`
  height: 100%;
  background: ${({ tone }) => tone};
  transition: width 0.25s ease;
`

const ProgressMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: ${c.textMuted};
`

const QuitButton = styled.button`
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 13px;
  color: ${c.textMuted};
  cursor: pointer;

  &:hover {
    color: ${c.text};
    text-decoration: underline;
  }
`

const NextBar = styled.div`
  position: sticky;
  bottom: 0;
  margin: 20px -32px 0;
  padding: 14px 32px calc(14px + env(safe-area-inset-bottom));
  background: ${c.bg};
  border-top: 1px solid ${c.border};

  ${bp.md} {
    margin: 16px -16px 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }
`

const KeyHint = styled.p`
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: ${c.textMuted};

  ${bp.sm} {
    display: none;
  }
`

// ─── Result ──────────────────────────────────────────────────────────

const ScoreLine = styled.p`
  margin: 0 0 4px;
  font-size: 15px;
  color: ${c.textMuted};
`

const ScoreBig = styled.p`
  margin: 0 0 24px;
  font-size: 40px;
  font-weight: 800;
  color: ${c.text};

  small {
    font-size: 20px;
    font-weight: 600;
    color: ${c.textMuted};
  }
`

const BreakdownRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid ${c.borderMuted};
  font-size: 14px;
  color: ${c.text};

  span:last-of-type {
    margin-left: auto;
    color: ${c.textMuted};
  }
`

const MissTitle = styled.h2`
  margin: 32px 0 12px;
  font-size: 18px;
  font-weight: 700;
  color: ${c.text};
`

const MissItem = styled.li`
  padding: 14px 16px;
  margin-bottom: 10px;
  border: 1px solid ${c.border};
  border-left: 3px solid var(--text-danger);
  border-radius: 0 10px 10px 0;
  background: ${c.bgSubtle};
  list-style: none;
`

const MissQuestion = styled.p`
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.65;
  color: ${c.text};
  word-break: keep-all;
`

const MissLink = styled.a`
  font-size: 13.5px;
  font-weight: 600;
  color: ${c.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

const AllClear = styled.p`
  margin: 24px 0 0;
  padding: 18px;
  border-radius: 10px;
  background: var(--bg-success);
  border: 1px solid var(--text-success);
  color: var(--text-success);
  font-size: 15px;
  font-weight: 600;
  text-align: center;
`

// ─── Page ────────────────────────────────────────────────────────────

const COUNT_OPTIONS = [10, 20]

const QuizSessionTemplate: FunctionComponent<QuizSessionTemplateProps> =
  function ({
    data: {
      site: {
        siteMetadata: { title: siteTitle, siteUrl },
      },
    },
    pageContext: { scope, questions },
  }) {
    const baseUrl = siteUrl.replace(/\/$/, '')
    const tone = seriesMetadata[scope.series]?.color ?? 'var(--primary)'

    const byId = useMemo(() => {
      const map = new Map<string, QuizQuestion>()
      questions.forEach(q => map.set(q.id, q))
      return map
    }, [questions])

    // 범위에 들어간 글 목록. quiz.json이 글 순서대로 합쳐지므로 등장 순서를 그대로 쓴다
    const coveredPosts = useMemo(() => {
      const seen = new Map<string, { title: string; count: number }>()
      questions.forEach(q => {
        const found = seen.get(q.postSlug)
        if (found) found.count += 1
        else seen.set(q.postSlug, { title: q.postTitle ?? q.postSlug, count: 1 })
      })
      return Array.from(seen, ([slug, v]) => ({ slug, ...v }))
    }, [questions])

    const [stage, setStage] = useState<Stage>('setup')
    const [count, setCount] = useState<number | null>(
      COUNT_OPTIONS.find(n => n <= scope.questionCount) ?? null,
    )
    const [levels, setLevels] = useState<QuizDifficulty[]>([])

    const [order, setOrder] = useState<QuizQuestion[]>([])
    const [choiceMap, setChoiceMap] = useState<Record<string, PreparedChoice[]>>(
      {},
    )
    const [answers, setAnswers] = useState<Record<string, number[]>>({})
    const [index, setIndex] = useState(0)
    const [resumable, setResumable] = useState(false)

    const topRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
      setResumable(loadSession(scope.id) != null)
    }, [scope.id])

    const start = useCallback(
      (pool: QuizQuestion[], opts?: { count: number | null }) => {
        const picked =
          opts === undefined
            ? pickQuestions(pool, { count, difficulties: levels })
            : pickQuestions(pool, { count: opts.count, difficulties: [] })

        const choices: Record<string, PreparedChoice[]> = {}
        picked.forEach(q => {
          choices[q.id] = prepareChoices(q)
        })

        setOrder(picked)
        setChoiceMap(choices)
        setAnswers({})
        setIndex(0)
        setStage('playing')
        clearSession(scope.id)
      },
      [count, levels, scope.id],
    )

    const resume = useCallback(() => {
      const stored = loadSession(scope.id)
      if (!stored) return

      const picked = stored.questionIds
        .map(id => byId.get(id))
        .filter((q): q is QuizQuestion => q != null)
      if (picked.length === 0) return

      const choices: Record<string, PreparedChoice[]> = {}
      picked.forEach(q => {
        const saved = stored.choiceOrder[q.id]
        choices[q.id] = saved
          ? saved.map(key => ({ ...q.choices[key], key }))
          : prepareChoices(q)
      })

      setOrder(picked)
      setChoiceMap(choices)
      setAnswers(stored.answers ?? {})
      setIndex(Math.min(stored.index ?? 0, picked.length - 1))
      setStage('playing')
    }, [byId, scope.id])

    // 이탈 대비 임시 저장. 정오답 이력 저장과는 무관하고 탭이 닫히면 사라진다
    useEffect(() => {
      if (stage !== 'playing' || order.length === 0) return

      const choiceOrder: Record<string, number[]> = {}
      order.forEach(q => {
        choiceOrder[q.id] = (choiceMap[q.id] ?? []).map(ch => ch.key)
      })

      saveSession(scope.id, {
        questionIds: order.map(q => q.id),
        choiceOrder,
        answers,
        index,
      })
    }, [stage, order, choiceMap, answers, index, scope.id])

    const current = order[index]
    const graded = current ? answers[current.id] != null : false

    const toggle = useCallback(
      (key: number) => {
        if (!current || answers[current.id] != null) return

        if (current.type === 'multi') {
          setAnswers(prev => {
            const draft = prev[`${current.id}:draft`] ?? []
            const next = draft.includes(key)
              ? draft.filter(k => k !== key)
              : [...draft, key]
            return { ...prev, [`${current.id}:draft`]: next }
          })
          return
        }

        setAnswers(prev => ({ ...prev, [current.id]: [key] }))
      },
      [current, answers],
    )

    const grade = useCallback(() => {
      if (!current) return
      const draft = answers[`${current.id}:draft`] ?? []
      if (draft.length === 0) return
      setAnswers(prev => ({ ...prev, [current.id]: draft }))
    }, [current, answers])

    const goNext = useCallback(() => {
      if (!current || answers[current.id] == null) return

      if (index + 1 >= order.length) {
        setStage('result')
        clearSession(scope.id)
        setResumable(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      setIndex(i => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [current, answers, index, order.length, scope.id])

    const quit = useCallback(() => {
      if (!window.confirm('세션을 끝내고 결과를 볼까요?')) return
      setStage('result')
      clearSession(scope.id)
      setResumable(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [scope.id])

    // 키보드: 숫자로 선택, Enter/Space로 다음, Esc로 종료
    useEffect(() => {
      if (stage !== 'playing' || !current) return

      const onKey = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return

        if (event.key === 'Escape') {
          event.preventDefault()
          quit()
          return
        }

        if (event.key === 'Enter' || event.key === ' ') {
          if (answers[current.id] != null) {
            event.preventDefault()
            goNext()
          } else if (current.type === 'multi') {
            event.preventDefault()
            grade()
          }
          return
        }

        const num = Number(event.key)
        if (!Number.isNaN(num) && num >= 1 && num <= 9) {
          const choices = choiceMap[current.id] ?? []
          const target = choices[num - 1]
          if (target) {
            event.preventDefault()
            toggle(target.key)
          }
        }
      }

      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [stage, current, answers, choiceMap, toggle, grade, goNext, quit])

    const answered = order.filter(q => answers[q.id] != null)
    const missed = answered.filter(q => !isCorrect(q, answers[q.id]))
    const correctCount = answered.length - missed.length

    const chainPosition = (question: QuizQuestion) => {
      if (!question.chain) return undefined
      const members = order.filter(q => q.chain?.id === question.chain?.id)
      if (members.length < 2) return undefined
      return {
        order: members.findIndex(q => q.id === question.id) + 1,
        total: members.length,
      }
    }

    const toggleLevel = (level: QuizDifficulty) => {
      setLevels(prev =>
        prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level],
      )
    }

    return (
      <Template
        title={`${scope.title} 퀴즈 | ${siteTitle}`}
        description={`${scope.title} 문항 ${scope.questionCount}개로 원리를 다시 확인합니다.`}
        url={`${baseUrl}/quiz/${scope.id}/`}
        image={`${baseUrl}/hero-image.jpg`}
        siteUrl={siteUrl}
        noindex
      >
        <QuizChrome crumb={`Quiz / ${scope.title}`}>
          <div ref={topRef} />

          {stage === 'setup' && (
            <>
              <Title>{scope.title}</Title>
              <Lead>{scope.description}</Lead>

              <SetupMeta>
                <span>
                  전체 {scope.questionCount}문항 · 글 {scope.postCount}편
                </span>
                <SpreadSlot>
                  <DifficultySpread spread={scope.difficultySpread} />
                </SpreadSlot>
              </SetupMeta>

              <Panel>
                <FieldLabel>문항 수</FieldLabel>
                <ChipRow>
                  {COUNT_OPTIONS.filter(n => n < scope.questionCount).map(n => (
                    <Chip
                      key={n}
                      active={count === n}
                      onClick={() => setCount(n)}
                    >
                      {n}문항
                    </Chip>
                  ))}
                  <Chip active={count === null} onClick={() => setCount(null)}>
                    전체 {scope.questionCount}문항
                  </Chip>
                </ChipRow>

                <FieldLabel>난이도</FieldLabel>
                <ChipRow>
                  <Chip active={levels.length === 0} onClick={() => setLevels([])}>
                    전체
                  </Chip>
                  {([1, 2, 3] as const).map(level => (
                    <Chip
                      key={level}
                      active={levels.includes(level)}
                      onClick={() => toggleLevel(level)}
                    >
                      {DIFFICULTY_LABEL[level]}
                    </Chip>
                  ))}
                </ChipRow>

                <PrimaryButton onClick={() => start(questions)}>
                  시작하기
                </PrimaryButton>
                {resumable && (
                  <GhostButton onClick={resume}>
                    직전에 풀던 세션 이어서 풀기
                  </GhostButton>
                )}
              </Panel>

              <CoverLabel>포함된 글</CoverLabel>
              <CoverGrid>
                {coveredPosts.map(post => (
                  <CoverItem key={post.slug} href={post.slug}>
                    <CoverTitle>{post.title}</CoverTitle>
                    <CoverCount>{post.count}문항</CoverCount>
                  </CoverItem>
                ))}
              </CoverGrid>

              <FootLink href={`/quiz/${scope.id}/list/`}>
                전체 문항과 해설 한 번에 보기 →
              </FootLink>
            </>
          )}

          {stage === 'playing' && current && (
            <>
              <ProgressWrap>
                <ProgressTrack>
                  <ProgressFill
                    tone={tone}
                    style={{
                      width: `${((index + (graded ? 1 : 0)) / order.length) * 100}%`,
                    }}
                  />
                </ProgressTrack>
                <ProgressMeta>
                  <span>
                    {index + 1} / {order.length}
                  </span>
                  <QuitButton onClick={quit}>종료하고 결과 보기</QuitButton>
                </ProgressMeta>
              </ProgressWrap>

              <QuestionCard
                key={current.id}
                question={current}
                choices={choiceMap[current.id] ?? []}
                selected={
                  answers[current.id] ?? answers[`${current.id}:draft`] ?? []
                }
                graded={graded}
                chainPosition={chainPosition(current)}
                onToggle={toggle}
                onGrade={grade}
              />

              {graded && (
                <NextBar>
                  <PrimaryButton onClick={goNext}>
                    {index + 1 >= order.length ? '결과 보기' : '다음 문항'}
                  </PrimaryButton>
                  <KeyHint>
                    숫자키로 선택, Enter로 다음, Esc로 종료합니다.
                  </KeyHint>
                </NextBar>
              )}
            </>
          )}

          {stage === 'result' && (
            <>
              <Title>결과</Title>
              <ScoreLine>
                {order.length}문항 중 {answered.length}문항을 풀었습니다.
              </ScoreLine>
              <ScoreBig>
                {correctCount}
                <small> / {answered.length}</small>
              </ScoreBig>

              <Panel>
                <FieldLabel>난이도별</FieldLabel>
                {([1, 2, 3] as const).map(level => {
                  const inLevel = answered.filter(q => q.difficulty === level)
                  if (inLevel.length === 0) return null
                  const hit = inLevel.filter(q =>
                    isCorrect(q, answers[q.id]),
                  ).length
                  return (
                    <BreakdownRow key={level}>
                      <span>{DIFFICULTY_LABEL[level]}</span>
                      <span>
                        {hit} / {inLevel.length}
                      </span>
                    </BreakdownRow>
                  )
                })}
              </Panel>

              {missed.length > 0 ? (
                <>
                  <MissTitle>틀린 문항 {missed.length}개</MissTitle>
                  <ul style={{ margin: 0, padding: 0 }}>
                    {missed.map(q => (
                      <MissItem key={q.id}>
                        <MissQuestion>{q.question}</MissQuestion>
                        <MissLink href={`${q.postSlug}${q.anchor ?? ''}`}>
                          {q.postTitle ?? '원문 보기'} →
                        </MissLink>
                      </MissItem>
                    ))}
                  </ul>
                </>
              ) : (
                answered.length > 0 && <AllClear>전부 맞혔습니다.</AllClear>
              )}

              <div style={{ marginTop: 28 }}>
                {missed.length > 0 && (
                  <PrimaryButton
                    onClick={() => start(missed, { count: null })}
                  >
                    틀린 문항만 다시 풀기
                  </PrimaryButton>
                )}
                <GhostButton onClick={() => setStage('setup')}>
                  새 세션 시작
                </GhostButton>
                <GhostButton onClick={() => navigate(`/quiz/${scope.id}/list/`)}>
                  전체 문항과 해설 보기
                </GhostButton>
              </div>
            </>
          )}
        </QuizChrome>
      </Template>
    )
  }

export default QuizSessionTemplate

export const quizSessionQuery = graphql`
  query quizSessionQuery {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
  }
`
