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

    /* 다이어그램 시맨틱 토큰 */
    --text-success: #16a34a;
    --bg-success:   #f0fdf4;
    --text-danger:  #dc2626;
    --bg-danger:    #fef2f2;
    --text-warn:    #d97706;
    --bg-warn:      #fffbeb;

    /* --primary·--accent처럼 진하게 칠한 도형 위에 얹는 글자색.
       두 테마 모두 중간 밝기의 색으로 칠하므로 값이 같다. 흰 글자는
       다크에서 2.49:1까지 떨어지지만 이 잉크는 5.05~8.81을 유지한다. */
    --on-fill:      #14100e;
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

    /* 다이어그램 시맨틱 토큰 */
    --text-success: #4ade80;
    --bg-success:   rgba(34, 197, 94, 0.12);
    --text-danger:  #f87171;
    --bg-danger:    rgba(239, 68, 68, 0.12);
    --text-warn:    #fbbf24;
    --bg-warn:      rgba(245, 158, 11, 0.12);
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

  /* 인라인 코드: prism-tomorrow 테마 덮어쓰기 */
  :not(pre) > code,
  :not(pre) > code[class*='language-'] {
    background: none !important;
    color: var(--primary) !important;
    padding: 0 !important;
    text-shadow: none !important;
    white-space: normal !important;
    font-size: 0.88em !important;
  }

  /* ─── Callout Blocks ───────────────────────────────────────────── */

  .callout {
    padding: 16px 20px;
    margin: 20px 0;
    border-radius: 4px;
    line-height: 1.7;
  }

  .callout > p:first-of-type {
    margin-top: 0;
  }

  .callout > p:last-of-type {
    margin-bottom: 0;
  }

  .callout ul,
  .callout ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  .callout-info {
    background: #f0f4ff;
    border-left: 4px solid #3182f6;
  }

  .callout-warning {
    background: #fff3f0;
    border-left: 4px solid #ff6b6b;
  }

  .callout-tip {
    background: #f0fff4;
    border-left: 4px solid #51cf66;
  }

  .callout-summary {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    padding: 20px;
    margin: 24px 0;
    border-radius: 8px;
  }

  .callout-note {
    background: #fff8e1;
    border-left: 4px solid #f59e0b;
  }

  [data-theme='dark'] .callout-info {
    background: rgba(49, 130, 246, 0.1);
    border-left-color: #5b9cf6;
  }

  [data-theme='dark'] .callout-warning {
    background: rgba(255, 107, 107, 0.1);
    border-left-color: #ff8a8a;
  }

  [data-theme='dark'] .callout-tip {
    background: rgba(81, 207, 102, 0.1);
    border-left-color: #6ed88a;
  }

  [data-theme='dark'] .callout-summary {
    background: rgba(255, 255, 255, 0.05);
    border-color: #3a3735;
  }

  [data-theme='dark'] .callout-note {
    background: rgba(245, 158, 11, 0.1);
    border-left-color: #f5b731;
  }
`

const GlobalStyle: FunctionComponent = function () {
  return <Global styles={defaultStyle} />
}

export default GlobalStyle
