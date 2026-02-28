import React, { FunctionComponent, useEffect } from 'react'
import styled from '@emotion/styled'
import { c, bp } from 'styles/theme'

interface PostContentProps {
  html: string
}

const MarkdownRenderer = styled.div`
  display: flex;
  flex-direction: column;
  width: 768px;
  margin: 0 auto;
  padding: 100px 0;
  word-break: break-all;
  color: ${c.text};

  line-height: 1.8;
  font-size: 18px;
  font-weight: 400;

  p {
    padding: 3px 0;
    margin-bottom: 10px;
  }

  h1,
  h2,
  h3 {
    font-weight: 800;
    margin-bottom: 10px;
    color: ${c.text};
  }

  * + h1,
  * + h2,
  * + h3 {
    margin-top: 60px;
  }

  hr + h1,
  hr + h2,
  hr + h3 {
    margin-top: 0;
  }

  h1 {
    font-size: 34px;
  }

  h2 {
    font-size: 28px;
  }

  h3 {
    font-size: 22px;
  }

  blockquote {
    margin: 20px 0;
    padding: 8px 16px;
    border-left: 3px solid ${c.primary};
    background: ${c.bgSubtle};
    border-radius: 0 6px 6px 0;
    font-weight: 600;
    color: ${c.text};
  }

  ol,
  ul {
    margin-left: 20px;
    padding: 20px 0;
  }

  li {
    margin-bottom: 6px;
    line-height: 1.7;
  }

  hr {
    border: none;
    border-top: 1px solid ${c.border};
    margin: 60px 0;
  }

  a {
    color: ${c.primary};
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  a:hover {
    color: ${c.primaryHov};
  }

  /* Code blocks */
  pre[class*='language-'] {
    margin: 20px 0;
    padding: 0;
    font-size: 16px;
    background: var(--code-bg) !important;
    border-radius: 8px;
    overflow: hidden;
    position: relative;

    ::-webkit-scrollbar {
      height: 6px;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.25);
      border-radius: 3px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }
  }

  /* macOS header bar */
  pre[class*='language-']:before {
    content: '';
    display: block;
    height: 35px;
    background: #2a2623;
    position: relative;
  }

  /* macOS traffic lights */
  pre[class*='language-']:after {
    content: '';
    position: absolute;
    top: 14px;
    left: 15px;
    width: 10px;
    height: 10px;
    background: #ff5f56;
    border-radius: 50%;
    box-shadow:
      16px 0 0 #ffbd2e,
      32px 0 0 #27ca3f;
  }

  pre[class*='language-'] code {
    display: block;
    padding: 15px 20px;
    background: transparent !important;
  }

  /* Copy button */
  .copy-button {
    position: absolute;
    top: 8px;
    right: 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    z-index: 10;
  }

  pre[class*='language-']:hover .copy-button {
    opacity: 1;
  }

  .copy-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .copy-button.copied {
    background: #0d9488;
    border-color: #0d9488;
    color: #ffffff;
    opacity: 1;
  }

  code[class*='language-'],
  pre[class*='language-'] {
    tab-size: 2;
  }

  /* Inline code */
  code:not([class*='language-']) {
    background: ${c.bgMuted};
    color: ${c.text};
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 16px;
    border: 1px solid ${c.border};
  }

  /* Images */
  img {
    max-width: 100%;
    border-radius: 8px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    font-size: 15px;
  }

  th,
  td {
    padding: 10px 14px;
    border: 1px solid ${c.border};
    text-align: left;
  }

  th {
    background: ${c.bgSubtle};
    font-weight: 600;
  }

  tr:nth-of-type(even) td {
    background: ${c.bgSubtle};
  }

  /* Responsive */
  ${bp.md} {
    width: 100%;
    padding: 80px 20px;
    line-height: 1.6;
    font-size: 16px;

    * + h1,
    * + h2,
    * + h3 {
      margin-top: 40px;
    }

    h1,
    h2,
    h3 {
      margin-bottom: 16px;
    }

    h1 {
      font-size: 26px;
    }

    h2 {
      font-size: 23px;
    }

    h3 {
      font-size: 19px;
    }

    blockquote {
      font-size: 15px;
      margin: 16px 0;
    }

    pre[class*='language-'] {
      font-size: 14px;
      margin: 16px 0;
      border-radius: 6px;
    }

    pre[class*='language-']:after {
      top: 9px;
      left: 10px;
      width: 6px;
      height: 6px;
      box-shadow:
        12px 0 0 #ffbd2e,
        24px 0 0 #27ca3f;
    }

    pre[class*='language-']:before {
      height: 25px;
    }

    pre[class*='language-'] code {
      padding: 12px 16px;
      font-size: 13px;
    }

    .copy-button {
      top: 4px;
      right: 8px;
      padding: 3px 6px;
      font-size: 11px;
    }

    code:not([class*='language-']) {
      font-size: 14px;
    }

    img {
      width: 100%;
    }

    hr {
      margin: 40px 0;
    }

    table {
      font-size: 13px;
    }

    th,
    td {
      padding: 8px 10px;
    }
  }
`

const PostContent: FunctionComponent<PostContentProps> = function ({ html }) {
  useEffect(() => {
    // 복사 버튼 추가 함수
    const addCopyButtons = () => {
      const codeBlocks = document.querySelectorAll('pre[class*="language-"]')

      codeBlocks.forEach(block => {
        // 이미 버튼이 있으면 스킵
        if (block.querySelector('.copy-button')) return

        const button = document.createElement('button')
        button.className = 'copy-button'
        button.textContent = 'Copy'

        button.addEventListener('click', async () => {
          const code = block.querySelector('code')
          if (code) {
            try {
              await navigator.clipboard.writeText(code.textContent || '')
              button.textContent = 'Copied!'
              button.classList.add('copied')

              setTimeout(() => {
                button.textContent = 'Copy'
                button.classList.remove('copied')
              }, 2000)
            } catch (err) {
              // Fallback for older browsers
              const textArea = document.createElement('textarea')
              textArea.value = code.textContent || ''
              document.body.appendChild(textArea)
              textArea.select()
              document.execCommand('copy')
              document.body.removeChild(textArea)

              button.textContent = 'Copied!'
              button.classList.add('copied')

              setTimeout(() => {
                button.textContent = 'Copy'
                button.classList.remove('copied')
              }, 2000)
            }
          }
        })

        block.appendChild(button)
      })
    }

    // DOM이 로드된 후 복사 버튼 추가
    const timer = setTimeout(addCopyButtons, 100)

    return () => clearTimeout(timer)
  }, [html])

  return <MarkdownRenderer dangerouslySetInnerHTML={{ __html: html }} />
}

export default PostContent
