import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { c, bp, shadow } from 'styles/theme'
import { QuizChoice, QuizQuestion } from 'types/quiz.types'
import { DifficultyBadge, TagBadge } from 'components/Quiz/QuizMeta'
import ScenarioBlock from 'components/Quiz/ScenarioBlock'
import ExplanationPanel from 'components/Quiz/ExplanationPanel'

const Card = styled.section`
  border: 1px solid ${c.border};
  border-radius: 14px;
  background: ${c.bg};
  padding: 24px 26px 26px;
  box-shadow: ${shadow.sm};

  ${bp.sm} {
    padding: 18px 16px 20px;
    border-radius: 12px;
  }
`

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
`

const ChainNote = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: ${c.primary};
  background: ${c.bgMuted};
  border: 1px solid ${c.primary};
`

const QuestionText = styled.h2`
  margin: 0 0 18px;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.6;
  color: ${c.text};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 17px;
  }
`

const ChoiceList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

type ChoiceState = 'idle' | 'picked' | 'correct' | 'wrong' | 'dimmed'

const ChoiceButton = styled.button<{ state: ChoiceState }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 13px 16px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 15.5px;
  line-height: 1.6;
  text-align: left;
  cursor: ${({ state }) =>
    state === 'idle' || state === 'picked' ? 'pointer' : 'default'};
  transition: all 0.15s ease;
  word-break: keep-all;

  border: 1.5px solid
    ${({ state }) =>
      state === 'correct'
        ? 'var(--text-success)'
        : state === 'wrong'
          ? 'var(--text-danger)'
          : state === 'picked'
            ? c.primary
            : c.border};
  background: ${({ state }) =>
    state === 'correct'
      ? 'var(--bg-success)'
      : state === 'wrong'
        ? 'var(--bg-danger)'
        : state === 'picked'
          ? c.bgMuted
          : c.bgSubtle};
  color: ${({ state }) => (state === 'dimmed' ? c.textMuted : c.text)};
  opacity: ${({ state }) => (state === 'dimmed' ? 0.65 : 1)};

  &:hover {
    border-color: ${({ state }) =>
      state === 'idle' ? c.primary : undefined};
  }

  ${bp.sm} {
    font-size: 14.5px;
    padding: 12px 14px;
  }
`

const Marker = styled.span<{ state: ChoiceState }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  border: 1.5px solid
    ${({ state }) =>
      state === 'correct'
        ? 'var(--text-success)'
        : state === 'wrong'
          ? 'var(--text-danger)'
          : state === 'picked'
            ? c.primary
            : c.border};
  color: ${({ state }) =>
    state === 'correct'
      ? 'var(--text-success)'
      : state === 'wrong'
        ? 'var(--text-danger)'
        : state === 'picked'
          ? c.primary
          : c.textMuted};
`

const ChoiceBody = styled.span`
  flex: 1;
  min-width: 0;
`

const Verdict = styled.span<{ tone: 'correct' | 'wrong' }>`
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: ${({ tone }) =>
    tone === 'correct' ? 'var(--text-success)' : 'var(--text-danger)'};
`

const Why = styled.p`
  margin: 8px 0 0 34px;
  padding-left: 12px;
  border-left: 2px solid ${c.border};
  font-size: 14px;
  line-height: 1.75;
  color: ${c.textMuted};

  ${bp.sm} {
    margin-left: 0;
  }
`

const GradeButton = styled.button`
  margin-top: 16px;
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 10px;
  background: ${c.primary};
  color: #ffffff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;

  &:disabled {
    background: ${c.bgMuted};
    color: ${c.textMuted};
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    background: ${c.primaryHov};
  }
`

const MultiHint = styled.p`
  margin: 0 0 12px;
  font-size: 13px;
  color: ${c.textMuted};
`

export type PreparedChoice = QuizChoice & { key: number }

type QuestionCardProps = {
  question: QuizQuestion
  choices: PreparedChoice[]
  selected: number[]
  graded: boolean
  chainPosition?: { order: number; total: number }
  onToggle: (key: number) => void
  onGrade: () => void
}

function stateOf(
  choice: PreparedChoice,
  isSelected: boolean,
  graded: boolean,
): ChoiceState {
  if (!graded) return isSelected ? 'picked' : 'idle'
  if (choice.correct) return 'correct'
  if (isSelected) return 'wrong'
  return 'dimmed'
}

const QuestionCard: FunctionComponent<QuestionCardProps> = function ({
  question,
  choices,
  selected,
  graded,
  chainPosition,
  onToggle,
  onGrade,
}) {
  const isMulti = question.type === 'multi'

  return (
    <Card>
      <MetaRow>
        <DifficultyBadge level={question.difficulty} />
        {chainPosition && (
          <ChainNote>
            연결 문항 {chainPosition.order} / {chainPosition.total}
          </ChainNote>
        )}
        {question.source === 'extended' && <TagBadge label="확장" />}
        {question.tags?.map(tag => (
          <TagBadge key={tag} label={tag} />
        ))}
      </MetaRow>

      {question.scenario && <ScenarioBlock scenario={question.scenario} />}

      <QuestionText>{question.question}</QuestionText>

      {isMulti && !graded && (
        <MultiHint>정답이 여러 개입니다. 고른 뒤 채점하세요.</MultiHint>
      )}

      <ChoiceList>
        {choices.map((choice, index) => {
          const isSelected = selected.includes(choice.key)
          const state = stateOf(choice, isSelected, graded)
          const showWhy = graded && (choice.correct || isSelected)

          return (
            <li key={choice.key}>
              <ChoiceButton
                type="button"
                state={state}
                disabled={graded}
                onClick={() => onToggle(choice.key)}
              >
                <Marker state={state} aria-hidden>
                  {graded
                    ? choice.correct
                      ? '✓'
                      : isSelected
                        ? '✗'
                        : index + 1
                    : index + 1}
                </Marker>
                <ChoiceBody>
                  {choice.text}
                  {graded && choice.correct && (
                    <Verdict tone="correct">
                      정답{isSelected ? ' · 내가 고른 답' : ''}
                    </Verdict>
                  )}
                  {graded && !choice.correct && isSelected && (
                    <Verdict tone="wrong">오답 · 내가 고른 답</Verdict>
                  )}
                </ChoiceBody>
              </ChoiceButton>
              {showWhy && <Why>{choice.why}</Why>}
            </li>
          )
        })}
      </ChoiceList>

      {isMulti && !graded && (
        <GradeButton disabled={selected.length === 0} onClick={onGrade}>
          채점하기
        </GradeButton>
      )}

      {graded && <ExplanationPanel question={question} />}
    </Card>
  )
}

export default QuestionCard
