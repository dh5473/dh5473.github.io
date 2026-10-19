import React, { FunctionComponent, ReactNode } from 'react'
import styled from '@emotion/styled'
import SiteHeader, { HeaderIconLink } from 'components/Common/SiteHeader'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { c, bp } from 'styles/theme'

const Container = styled.div`
  min-height: 100vh;
  background: ${c.bg};
`

/**
 * 헤더는 사이트 폭을 그대로 쓰고 본문만 용도에 맞춘다.
 * wide는 목록을 훑는 허브용, 기본값은 읽고 푸는 칼럼용.
 */
const Main = styled.main<{ wide: boolean }>`
  max-width: ${({ wide }) => (wide ? '1200px' : '840px')};
  margin: 0 auto;
  padding: 32px 32px 96px;

  ${bp.md} {
    padding: 20px 20px 80px;
  }
`

type PageChromeProps = {
  crumb?: ReactNode
  /** 허브처럼 목록을 펼치는 페이지에서 사이트 폭을 그대로 쓴다. */
  wide?: boolean
  children: ReactNode
}

/** 홈과 글 페이지를 뺀 단독 페이지(퀴즈, 시리즈 허브, 전체 글)가 공유하는 헤더와 본문 컨테이너 */
const PageChrome: FunctionComponent<PageChromeProps> = function ({
  crumb,
  wide = false,
  children,
}) {
  return (
    <Container>
      <SiteHeader
        crumb={crumb}
        actions={
          <HeaderIconLink href="/" aria-label="블로그로" title="블로그로">
            <FontAwesomeIcon icon={faArrowLeft} />
          </HeaderIconLink>
        }
      />
      <Main wide={wide}>{children}</Main>
    </Container>
  )
}

export default PageChrome
