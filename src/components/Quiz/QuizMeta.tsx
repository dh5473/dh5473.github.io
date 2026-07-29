import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { c } from 'styles/theme'
import { QuizDifficulty } from 'types/quiz.types'

/**
 * 답에 닿기까지 몇 단계가 필요한지로 나눈다. 무엇을 묻는지(문항 유형)와는 다른 축이다.
 * 도메인 용어를 라벨에 쓰지 않는다. "예측"은 ml, "추론"은 stats에서 주제어라
 * 난이도가 아니라 문항의 소재로 읽힌다.
 */
export const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  1: '개념 확인',
  2: '상황 적용',
  3: '분석과 판단',
}

const Badge = styled.span<{ tone: 'muted' | 'primary' | 'accent' }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid
    ${({ tone }) =>
      tone === 'primary'
        ? c.primary
        : tone === 'accent'
          ? c.accent
          : c.border};
  color: ${({ tone }) =>
    tone === 'primary' ? c.primary : tone === 'accent' ? c.accent : c.textMuted};
  background: ${c.bgSubtle};
`

const Dots = styled.span`
  letter-spacing: 1px;
  font-size: 10px;
`

type DifficultyBadgeProps = {
  level: QuizDifficulty
}

export const DifficultyBadge: FunctionComponent<DifficultyBadgeProps> =
  function ({ level }) {
    return (
      <Badge tone={level === 3 ? 'accent' : level === 2 ? 'primary' : 'muted'}>
        <Dots aria-hidden>{'●'.repeat(level) + '○'.repeat(3 - level)}</Dots>
        {DIFFICULTY_LABEL[level]}
      </Badge>
    )
  }

type TagBadgeProps = {
  label: string
}

export const TagBadge: FunctionComponent<TagBadgeProps> = function ({ label }) {
  return <Badge tone="muted">{label}</Badge>
}

const SpreadBar = styled.div`
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: ${c.bgMuted};
`

const SpreadFill = styled.div<{ level: 1 | 2 | 3 }>`
  background: ${({ level }) =>
    level === 1
      ? 'var(--border)'
      : level === 2
        ? 'var(--primary)'
        : 'var(--accent)'};
`

type DifficultySpreadProps = {
  spread: [number, number, number]
}

/** 난이도 1·2·3 비중을 한 줄 막대로 */
export const DifficultySpread: FunctionComponent<DifficultySpreadProps> =
  function ({ spread }) {
    const total = spread.reduce((a, b) => a + b, 0)
    if (total === 0) return null

    return (
      <SpreadBar
        role="img"
        aria-label={`난이도 분포: ${([1, 2, 3] as const)
          .map(level => `${DIFFICULTY_LABEL[level]} ${spread[level - 1]}`)
          .join(', ')}`}
      >
        {([1, 2, 3] as const).map(level => (
          <SpreadFill
            key={level}
            level={level}
            style={{ width: `${(spread[level - 1] / total) * 100}%` }}
          />
        ))}
      </SpreadBar>
    )
  }
