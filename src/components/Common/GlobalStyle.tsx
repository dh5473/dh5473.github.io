import React, { FunctionComponent } from 'react'
import { Global, css } from '@emotion/react'

const defaultStyle = css`
  /* ─── Design Tokens ─────────────────────────────────────────────── */

  /* 라이트의 전경 토큰은 색조·채도를 그대로 두고 명도만 낮춰, 가장 어두운
     표면인 --bg-muted 위에서 4.7:1을 넘도록 맞춘 값이다. 이전 값은 같은
     자리에서 2.70~4.07이라 본문 링크와 인라인 코드까지 AA 미만이었다.
     다크는 5.72~10.98이라 손대지 않았다. */
  :root {
    --bg:           #fafaf8;
    --bg-subtle:    #f5f4f2;
    --bg-muted:     #eeecea;
    --text:         #1c1917;
    --text-muted:   #6d6762;
    --primary:      #0a756c;
    /* 히어로 배지·그라디언트처럼 primary를 반투명하게 깔아야 하는 자리용.
       rgb(var(--primary-rgb) / 0.8) 로 쓴다. */
    --primary-rgb:  10 117 108;
    --primary-hov:  #075c55;
    --accent:       #9d5604;
    --border:       #e7e5e4;
    --border-muted: #f0edeb;
    --code-bg:      #1e1b18;

    /* 다이어그램 시맨틱 토큰 */
    --text-success: #107836;
    --bg-success:   #f0fdf4;
    --text-danger:  #cb2121;
    --bg-danger:    #fef2f2;
    --text-warn:    #9d5604;
    --bg-warn:      #fffbeb;

    /* --primary·--accent처럼 진하게 칠한 도형 위에 얹는 글자색.
       채움이 라이트에서는 어둡고 다크에서는 밝아 잉크 방향이 테마마다
       뒤집힌다. 한 값으로 두 테마를 덮으려 하면 반드시 한쪽이 깨진다. */
    --on-fill:      #ffffff;
    /* 진한 채움 위에 한 겹 더 얹는 반투명 판. 잉크가 계속 읽히도록
       라이트에서는 채움을 더 어둡게, 다크에서는 더 밝게 민다. */
    --on-fill-veil: rgba(0, 0, 0, 0.22);
  }

  [data-theme='dark'] {
    --bg:           #171412;
    --bg-subtle:    #211e1b;
    --bg-muted:     #2d2926;
    --text:         #f5f0eb;
    --text-muted:   #a8a29e;
    --primary:      #14b8a6;
    --primary-rgb:  20 184 166;
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

    /* 다크의 채움은 밝은 색이라 잉크가 어두워야 한다 (5.05~11.33) */
    --on-fill:      #14100e;
    --on-fill-veil: rgba(255, 255, 255, 0.25);
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
