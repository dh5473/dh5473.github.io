import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { c, bp, shadow } from 'styles/theme'
import { PostSeriesNavProps, SeriesNavPost } from 'types/PostItem.types'

const NavWrapper = styled.nav`
  width: 768px;
  margin: 0 auto;
  padding: 0 0 40px 0;
  display: flex;
  gap: 16px;

  ${bp.md} {
    width: 100%;
    padding: 0 20px 40px 20px;
    flex-direction: column;
  }
`

const NavCard = styled(Link)<{ direction: 'prev' | 'next' }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid ${c.border};
  background: ${c.bg};
  text-decoration: none;
  color: inherit;
  transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  align-items: flex-start;
  text-align: left;

  &:hover {
    background: ${c.bgSubtle};
    border-color: ${c.primary};
    box-shadow: ${shadow.sm};
  }
`

const NavPlaceholder = styled.div`
  flex: 1;
`

const DirectionLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${c.textMuted};
  font-weight: 500;
`

const NavSeriesBadge = styled.span<{ color?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: ${c.textMuted};
  font-weight: 500;

  &::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ color }) => color ?? 'var(--primary)'};
    flex-shrink: 0;
  }
`

const NavTitle = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${c.text};
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${bp.md} {
    font-size: 14px;
  }
`

const PostSeriesNav: FunctionComponent<PostSeriesNavProps> = ({
  seriesTitle,
  seriesColor,
  prevPost,
  nextPost,
}) => {
  const renderCard = (post: SeriesNavPost, direction: 'prev' | 'next') => (
    <NavCard to={post.slug} direction={direction} key={direction}>
      <DirectionLabel>
        {direction === 'prev' && <FontAwesomeIcon icon={faArrowLeft} />}
        {direction === 'prev' ? '이전 글' : '다음 글'}
        {direction === 'next' && <FontAwesomeIcon icon={faArrowRight} />}
      </DirectionLabel>
      <NavSeriesBadge color={seriesColor}>{seriesTitle}</NavSeriesBadge>
      <NavTitle>{post.title}</NavTitle>
    </NavCard>
  )

  return (
    <NavWrapper aria-label="시리즈 탐색">
      {prevPost ? renderCard(prevPost, 'prev') : <NavPlaceholder />}
      {nextPost ? renderCard(nextPost, 'next') : <NavPlaceholder />}
    </NavWrapper>
  )
}

export default PostSeriesNav
