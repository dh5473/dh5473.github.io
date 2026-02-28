import React, { FunctionComponent } from 'react'
import { Global, css } from '@emotion/react'

const defaultStyle = css`
  /* ─── Design Tokens ─────────────────────────────────────────────── */

  :root {
    --bg:           #fafaf8;
    --bg-subtle:    #f5f4f2;
    --bg-muted:     #eeecea;
    --text:         #1c1917;
    --text-muted:   #78716c;
    --primary:      #0d9488;
    --primary-hov:  #0f766e;
    --accent:       #d97706;
    --border:       #e7e5e4;
    --border-muted: #f0edeb;
    --code-bg:      #1e1b18;
  }

  [data-theme='dark'] {
    --bg:           #171412;
    --bg-subtle:    #211e1b;
    --bg-muted:     #2d2926;
    --text:         #f5f0eb;
    --text-muted:   #a8a29e;
    --primary:      #14b8a6;
    --primary-hov:  #0d9488;
    --accent:       #f59e0b;
    --border:       #292524;
    --border-muted: #221f1c;
    --code-bg:      #1e1b18;
  }

  /* ─── Reset ─────────────────────────────────────────────────────── */

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
    background: var(--bg);
    color: var(--text);
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
