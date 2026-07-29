import React, { FunctionComponent, useMemo } from 'react'
import styled from '@emotion/styled'
import Prism from 'prismjs'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import { QuizScenario } from 'types/quiz.types'
import { c, bp } from 'styles/theme'
import QuizFigure from 'components/Quiz/QuizFigure'

// gatsby-remark-prismjs는 빌드 타임에 마크다운만 처리한다.
// quiz.json의 코드는 그 경로를 타지 않으므로 런타임에 직접 하이라이팅한다.
const HIGHLIGHTABLE: Record<string, string> = {
  sql: 'sql',
  code: '',
  plan: '',
}

const Frame = styled.div`
  margin: 0 0 20px;
  border-radius: 10px;
  background: var(--code-bg);
  overflow: hidden;
`

const Pre = styled.pre`
  margin: 0;
  padding: 16px 18px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'D2Coding', monospace;
  font-size: 13.5px;
  line-height: 1.65;
  color: #e6e1dc;
  tab-size: 2;

  ${bp.sm} {
    font-size: 12.5px;
    padding: 14px 14px;
  }

  ::-webkit-scrollbar {
    height: 6px;
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.25);
    border-radius: 3px;
  }
`

const TextBlock = styled.div`
  margin: 0 0 20px;
  padding: 14px 16px;
  border-left: 3px solid ${c.primary};
  border-radius: 0 8px 8px 0;
  background: ${c.bgSubtle};
  color: ${c.text};
  font-size: 15px;
  line-height: 1.75;
  white-space: pre-wrap;
`

type ScenarioBlockProps = {
  scenario: QuizScenario
}

const ScenarioBlock: FunctionComponent<ScenarioBlockProps> = function ({
  scenario,
}) {
  const { kind, body, lang, svg } = scenario

  const html = useMemo(() => {
    if (!body) return null
    const language = kind === 'code' ? lang : HIGHLIGHTABLE[kind]
    if (!language) return null
    const grammar = Prism.languages[language]
    if (!grammar) return null
    return Prism.highlight(body, grammar, language)
  }, [kind, body, lang])

  if (kind === 'svg') {
    return svg ? <QuizFigure svg={svg} /> : null
  }

  if (kind === 'text') {
    return <TextBlock>{body}</TextBlock>
  }

  return (
    <Frame>
      {html ? (
        <Pre
          className={`language-${kind === 'code' ? lang : kind}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <Pre>{body}</Pre>
      )}
    </Frame>
  )
}

export default ScenarioBlock
