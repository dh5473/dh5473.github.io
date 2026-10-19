import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { c, bp } from 'styles/theme'
import { seriesMetadata } from 'utils/seriesData'

const FooterWrapper = styled.footer`
  display: grid;
  place-items: center;
  gap: 20px;
  margin-top: auto;
  padding: 48px 20px;
  font-size: 14px;
  text-align: center;
  line-height: 1.6;
  color: ${c.textMuted};
  border-top: 1px solid ${c.borderMuted};

  ${bp.md} {
    font-size: 13px;
    padding: 36px 20px;
  }
`

// 홈은 최신 10편만, 글은 같은 시리즈 이웃만 링크해서 오래된 글로 가는 길이
// 좁았다. 모든 페이지 바닥에 허브 링크를 깔아 어느 글이든 두 번 안에 닿게 한다
const FooterNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 16px;
  max-width: 720px;
  font-size: 13px;

  ${bp.md} {
    font-size: 12.5px;
  }
`

const FooterLink = styled(Link)`
  color: ${c.textMuted};
  text-decoration: none;

  &:hover {
    color: ${c.primary};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

const AllPostsLink = styled(FooterLink)`
  font-weight: 600;
  color: ${c.text};
`

const Footer: FunctionComponent = function () {
  return (
    <FooterWrapper>
      <FooterNav aria-label="시리즈와 전체 글">
        <AllPostsLink to="/posts/">전체 글</AllPostsLink>
        {Object.entries(seriesMetadata).map(([id, { title }]) => (
          <FooterLink key={id} to={`/series/${id}/`}>
            {title}
          </FooterLink>
        ))}
      </FooterNav>
      Thank You for Visiting My Blog, Have a Good Day 😆
    </FooterWrapper>
  )
}

export default Footer
