import React, { FunctionComponent, ReactNode, useEffect, useState } from 'react'
import styled from '@emotion/styled'
import { navigate } from 'gatsby'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { c, bp } from 'styles/theme'

const Bar = styled.header`
  background: ${c.bg};
  border-bottom: 1px solid ${c.border};
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background 0.2s ease, border-color 0.2s ease;
`

/**
 * 컨테이너 폭은 페이지가 달라져도 고정이다.
 * 여기가 페이지마다 달라지면 이동할 때 로고가 좌우로 튄다.
 */
const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  height: 60px;
  gap: 16px;

  ${bp.md} {
    padding: 0 20px;
    height: 54px;
  }
`

const logoStyle = `
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  flex-shrink: 0;
  cursor: pointer;
`

const LogoHeading = styled.h1`
  ${logoStyle}
  color: ${c.text};

  span {
    color: ${c.primary};
  }
`

const LogoButton = styled.button`
  ${logoStyle}
  color: ${c.text};

  span {
    color: ${c.primary};
  }
`

/** 로고 오른쪽에 붙는 경로 표시. 좁은 화면에서는 페이지 제목이 대신한다. */
const Crumb = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${c.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::before {
    content: '/';
    color: ${c.border};
  }

  ${bp.sm} {
    display: none;
  }
`

const Center = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;

  ${bp.lg} {
    display: none;
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`

export const HeaderIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid ${c.border};
  border-radius: 8px;
  background: ${c.bgSubtle};
  color: ${c.textMuted};
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  text-decoration: none;

  &:hover {
    background: ${c.bgMuted};
    color: ${c.text};
    border-color: ${c.primary};
  }

  ${bp.md} {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }
`

export const HeaderIconLink = HeaderIconButton.withComponent('a')

/** 헤더 우측 끝 앵커. 페이지가 바뀌어도 색과 위치가 유지되도록 한 곳에서만 만든다. */
const GitHubButton = styled.a`
  background: ${c.primary};
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s ease;
  text-decoration: none;
  display: inline-block;
  flex-shrink: 0;

  &:hover {
    background: ${c.primaryHov};
  }

  ${bp.md} {
    padding: 6px 12px;
    font-size: 12px;
  }
`

type SiteHeaderProps = {
  /** 홈에서만 true. 로고가 문서의 h1 역할을 계속 하도록 둔다. */
  logoAsHeading?: boolean
  /** 로고 오른쪽 경로 표시 */
  crumb?: ReactNode
  /** 데스크톱 가운데 슬롯 (섹션 내비게이션 등) */
  center?: ReactNode
  /** 테마 토글 왼쪽 슬롯 */
  actions?: ReactNode
  /** GitHub 버튼 오른쪽 슬롯 (모바일 햄버거 등) */
  trailing?: ReactNode
}

/**
 * 홈, 퀴즈가 공유하는 상단 바.
 * 슬롯만 다르고 로고 위치와 우측 앵커는 어느 페이지에서나 같은 자리에 있다.
 */
const SiteHeader: FunctionComponent<SiteHeaderProps> = function ({
  logoAsHeading = false,
  crumb,
  center,
  actions,
  trailing,
}) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [])

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setIsDark(!isDark)
  }

  const Logo = logoAsHeading ? LogoHeading : LogoButton
  const logo = (
    <Logo onClick={() => navigate('/')}>
      <span>don</span>tech
    </Logo>
  )

  return (
    <Bar>
      <Inner>
        {logo}
        {crumb && <Crumb>{crumb}</Crumb>}
        <Center>{center}</Center>
        <Actions>
          {actions}
          <HeaderIconButton onClick={toggleTheme} aria-label="테마 전환">
            <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
          </HeaderIconButton>
          <GitHubButton
            href="https://github.com/dh5473"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </GitHubButton>
          {trailing}
        </Actions>
      </Inner>
    </Bar>
  )
}

export default SiteHeader
