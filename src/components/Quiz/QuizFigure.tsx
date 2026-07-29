import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'

const Figure = styled.figure`
  margin: 0 0 20px;
  text-align: center;

  svg {
    max-width: 100%;
    height: auto;
  }
`

type QuizFigureProps = {
  svg: string
}

/**
 * quiz-assets의 SVG를 그대로 그린다.
 * 빌드 타임에 저장소의 파일을 읽어 pageContext로 실어온 문자열이라
 * 마크다운 본문과 같은 신뢰 수준의 콘텐츠다.
 */
const QuizFigure: FunctionComponent<QuizFigureProps> = function ({ svg }) {
  return <Figure dangerouslySetInnerHTML={{ __html: svg }} />
}

export default QuizFigure
