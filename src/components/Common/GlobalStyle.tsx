import React, { FunctionComponent } from 'react'
import { Global, css } from '@emotion/react'

const defaultStyle = css`
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

  * {
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    font-family:
      'Pretendard',
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      Roboto,
      'Helvetica Neue',
      'Segoe UI',
      'Apple SD Gothic Neo',
      'Noto Sans KR',
      'Malgun Gothic',
      'Apple Color Emoji',
      'Segoe UI Emoji',
      'Segoe UI Symbol',
      sans-serif;
  }

  html,
  body,
  #___gatsby {
    height: 100%;
  }

  a,
  a:hover {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  /* 코드 블록 전용 폰트 */
  code,
  pre,
  code[class*='language-'],
  pre[class*='language-'] {
    font-family:
      'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo,
      Courier, monospace !important;
  }
`

const GlobalStyle: FunctionComponent = function () {
  return <Global styles={defaultStyle} />
}

export default GlobalStyle
