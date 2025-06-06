import React, { FunctionComponent, useEffect } from 'react'
import styled from '@emotion/styled'

interface PostContentProps {
  html: string
}

const MarkdownRenderer = styled.div`
  // Renderer Style
  display: flex;
  flex-direction: column;
  width: 768px;
  margin: 0 auto;
  padding: 100px 0;
  word-break: break-all;

  // Markdown Style
  line-height: 1.8;
  font-size: 18px;
  font-weight: 400;

  // Apply Padding Attribute to All Elements
  p {
    padding: 3px 0;
    margin-bottom: 10px;
  }

  // Adjust Heading Element Style
  h1,
  h2,
  h3 {
    font-weight: 800;
    margin-bottom: 10px;
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

  // Adjust Quotation Element Style
  blockquote {
    margin: 20px 0;
    padding: 5px 15px;
    border-left: 2px solid #000000;
    font-weight: 800;
  }

  // Adjust List Element Style
  ol,
  ul {
    margin-left: 20px;
    padding: 20px 0;
  }

  li {
    margin-bottom: 6px;
    line-height: 1.7;
  }

  // Adjust Horizontal Rule style
  hr {
    border: 1px solid #000000;
    margin: 60px 0;
  }

  // Adjust Link Element Style
  a {
    color: #4263eb;
    text-decoration: underline;
  }

  // Adjust Code Style
  pre[class*='language-'] {
    margin: 20px 0;
    padding: 0;
    font-size: 16px;
    background: #1e1e1e !important;
    border-radius: 8px;
    overflow: hidden;
    position: relative;

    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 3px;
    }
  }

  /* 맥OS 헤더 */
  pre[class*='language-']:before {
    content: '';
    display: block;
    height: 35px;
    background: #333;
    position: relative;
  }

  /* 맥OS 버튼 (빨강, 노랑, 초록) */
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

  /* 코드 내용 */
  pre[class*='language-'] code {
    display: block;
    padding: 15px 20px;
    background: transparent !important;
  }

  /* 복사 버튼 스타일 */
  .copy-button {
    position: absolute;
    top: 8px;
    right: 12px;
    background: #4a4e54;
    border: none;
    border-radius: 4px;
    color: #ffffff;
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
    background: #5a5e64;
  }

  .copy-button.copied {
    background: #27ca3f;
    color: white;
  }

  code[class*='language-'],
  pre[class*='language-'] {
    tab-size: 2;
  }

  /* 인라인 코드 스타일 */
  code:not([class*='language-']) {
    background: #f1f3f4;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 16px;
  }

  // Markdown Responsive Design
  @media (max-width: 768px) {
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

    /* 모바일 맥OS 버튼 크기 조정 */
    pre[class*='language-']:after {
      top: 9px;
      left: 10px;
      width: 6px;
      height: 6px;
      box-shadow:
        12px 0 0 #ffbd2e,
        24px 0 0 #27ca3f;
    }

    /* 모바일 헤더 */
    pre[class*='language-']:before {
      height: 25px;
    }

    /* 모바일 코드 패딩 */
    pre[class*='language-'] code {
      padding: 12px 16px;
      font-size: 13px;
    }

    /* 모바일 복사 버튼 */
    .copy-button {
      top: 6px;
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
