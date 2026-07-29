import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons'
import { c, bp } from 'styles/theme'

const Row = styled(Link)`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 28px;
  padding: 13px 20px;
  border: 1px solid ${c.border};
  border-radius: 12px;
  background: ${c.bgSubtle};
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${c.primary};
    background: ${c.bgMuted};
  }

  ${bp.md} {
    padding: 12px 16px;
    margin-top: 20px;
  }
`

const Icon = styled.span`
  display: flex;
  color: ${c.primary};
  font-size: 15px;
  flex-shrink: 0;
`

const Label = styled.strong`
  font-size: 14.5px;
  font-weight: 700;
  color: ${c.text};
  flex-shrink: 0;
`

const Count = styled.span`
  font-size: 13.5px;
  color: ${c.textMuted};
  flex-shrink: 0;

  &::before {
    content: '·';
    margin-right: 8px;
  }
`

const Copy = styled.span`
  font-size: 13.5px;
  color: ${c.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::before {
    content: '·';
    margin-right: 8px;
  }

  ${bp.md} {
    display: none;
  }
`

const Arrow = styled.span`
  margin-left: auto;
  font-size: 13.5px;
  font-weight: 600;
  color: ${c.primary};
  flex-shrink: 0;
`

type QuizPromoProps = {
  scopeCount: number
  total: number
}

/**
 * 메인 홈 진입점. 글을 안 읽어도 들어올 경로가 하나는 필요하다.
 * 범위 선택은 허브가 하는 일이라 여기서는 반복하지 않고 한 줄만 차지한다.
 */
const QuizPromo: FunctionComponent<QuizPromoProps> = function ({
  scopeCount,
  total,
}) {
  if (scopeCount === 0) return null

  return (
    <Row to="/quiz/">
      <Icon>
        <FontAwesomeIcon icon={faCircleQuestion} />
      </Icon>
      <Label>Quiz</Label>
      <Count>{total}문항</Count>
      <Copy>읽고 넘긴 내용을 원리 단위로 다시 꺼내봅니다</Copy>
      <Arrow>풀어보기 →</Arrow>
    </Row>
  )
}

export default QuizPromo
