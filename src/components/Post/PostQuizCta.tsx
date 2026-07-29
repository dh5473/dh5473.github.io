import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { c, bp } from 'styles/theme'

const Wrapper = styled.aside`
  width: 768px;
  margin: 0 auto 60px;

  ${bp.lg} {
    width: 100%;
    padding: 0 20px;
  }
`

const Box = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border: 1px solid ${c.border};
  border-left: 3px solid ${c.primary};
  border-radius: 0 12px 12px 0;
  background: ${c.bgSubtle};

  ${bp.sm} {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 16px;
  }
`

const Text = styled.div`
  flex: 1;
  min-width: 0;
`

const Heading = styled.p`
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: ${c.text};
`

const Sub = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: ${c.textMuted};
  word-break: keep-all;
`

const Action = styled.a`
  flex-shrink: 0;
  padding: 11px 20px;
  border-radius: 10px;
  background: ${c.primary};
  color: #ffffff;
  font-size: 14.5px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    background: ${c.primaryHov};
  }
`

type PostQuizCtaProps = {
  scopeId: string
  scopeTitle: string
  scopeQuestionCount: number
  postQuestionCount: number
}

/** 글을 막 읽은 시점이 퀴즈를 풀 동기가 가장 높다 */
const PostQuizCta: FunctionComponent<PostQuizCtaProps> = function ({
  scopeId,
  scopeTitle,
  scopeQuestionCount,
  postQuestionCount,
}) {
  return (
    <Wrapper>
      <Box>
        <Text>
          <Heading>읽은 내용을 확인해볼까요</Heading>
          <Sub>
            이 글에서 {postQuestionCount}문항, {scopeTitle} 전체로는{' '}
            {scopeQuestionCount}문항이 있습니다.
          </Sub>
        </Text>
        <Action href={`/quiz/${scopeId}/`}>풀어보기 →</Action>
      </Box>
    </Wrapper>
  )
}

export default PostQuizCta
