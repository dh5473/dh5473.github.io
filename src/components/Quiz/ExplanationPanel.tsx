import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { c, bp } from 'styles/theme'
import { QuizQuestion } from 'types/quiz.types'
import QuizFigure from 'components/Quiz/QuizFigure'

const Panel = styled.div`
  margin-top: 20px;
  padding: 18px 20px;
  border-radius: 10px;
  border: 1px solid ${c.border};
  background: ${c.bgSubtle};

  ${bp.sm} {
    padding: 16px;
  }
`

const Label = styled.p`
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${c.textMuted};
`

const Body = styled.p`
  margin: 0;
  font-size: 15.5px;
  line-height: 1.8;
  color: ${c.text};

  ${bp.sm} {
    font-size: 14.5px;
  }
`

const FigureSlot = styled.div`
  margin-top: 18px;
`

const SourceLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 14px;
  font-weight: 600;
  color: ${c.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

type ExplanationPanelProps = {
  question: QuizQuestion
  /** 목록 페이지에서는 원문 링크를 문항마다 반복하지 않는다 */
  showSourceLink?: boolean
}

/** 정답 여부와 무관하게 항상 노출되는 원리 설명 + 해설 그림 + 원문 링크 */
const ExplanationPanel: FunctionComponent<ExplanationPanelProps> = function ({
  question,
  showSourceLink = true,
}) {
  const href = `${question.postSlug}${question.anchor ?? ''}`

  return (
    <Panel>
      <Label>해설</Label>
      <Body>{question.explanation}</Body>

      {question.explainSvg && (
        <FigureSlot>
          <QuizFigure svg={question.explainSvg} />
        </FigureSlot>
      )}

      {showSourceLink && (
        <SourceLink href={href}>이 내용 다시 읽기 →</SourceLink>
      )}
    </Panel>
  )
}

export default ExplanationPanel
