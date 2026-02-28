import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { c, bp } from 'styles/theme'

const FooterWrapper = styled.footer`
  display: grid;
  place-items: center;
  margin-top: auto;
  padding: 48px 0;
  font-size: 14px;
  text-align: center;
  line-height: 1.6;
  color: ${c.textMuted};
  border-top: 1px solid ${c.borderMuted};

  ${bp.md} {
    font-size: 13px;
    padding: 36px 0;
  }
`

const Footer: FunctionComponent = function () {
  return (
    <FooterWrapper>
      Thank You for Visiting My Blog, Have a Good Day 😆
      <br />© 2025 Developer Donhyeok, Powered By Gatsby.
    </FooterWrapper>
  )
}

export default Footer
