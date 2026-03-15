import React, { FunctionComponent, useState } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { c, bp } from 'styles/theme'
import { PostSeriesIndexProps, SeriesIndexPost } from 'types/PostItem.types'

const PAGE_SIZE = 5

const IndexWrapper = styled.div`
  width: 768px;
  margin: 40px auto 40px auto;
  border: 1px solid ${c.border};
  border-radius: 14px;
  overflow: hidden;

  ${bp.md} {
    width: calc(100% - 40px);
    margin: 28px 20px 32px 20px;
  }
`

const IndexHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  background: ${c.bgSubtle};
  border-bottom: 1px solid ${c.border};
`

const SeriesDot = styled.span<{ color?: string }>`
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ color }) => color ?? 'var(--primary)'};
  flex-shrink: 0;
`

const SeriesTitle = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${c.text};
`

const PostCount = styled.span`
  font-size: 12px;
  color: ${c.textMuted};
  margin-left: auto;
`

const PostList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 8px 0;
`

const PostItem = styled.li<{ isCurrent: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 20px;
  background: ${({ isCurrent }) => (isCurrent ? 'var(--bg-subtle)' : 'transparent')};
  border-left: 3px solid
    ${({ isCurrent }) => (isCurrent ? 'var(--primary)' : 'transparent')};
  transition: background 0.15s ease;

  &:hover {
    background: ${c.bgSubtle};
  }
`

const OrderNum = styled.span<{ isCurrent: boolean }>`
  flex-shrink: 0;
  width: 22px;
  font-size: 12px;
  font-weight: ${({ isCurrent }) => (isCurrent ? '700' : '400')};
  color: ${({ isCurrent }) => (isCurrent ? 'var(--primary)' : 'var(--text-muted)')};
  text-align: right;
`

const PostLink = styled(Link)`
  font-size: 13px;
  font-weight: 400;
  color: ${c.textMuted};
  text-decoration: none;
  line-height: 1.5;

  &:hover {
    color: ${c.text};
    text-decoration: underline;
  }
`

const CurrentTitle = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: ${c.text};
  line-height: 1.5;
`

const CurrentBadge = styled.span`
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;

  ${bp.md} {
    display: none;
  }
`

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 8px 14px;
  border-top: 1px solid ${c.border};
  background: ${c.bgSubtle};
`

const PageIndicator = styled.span`
  font-size: 12px;
  color: ${c.textMuted};
  margin-right: 8px;
`

const PageButton = styled.button<{ disabled: boolean }>`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid ${c.border};
  border-radius: 6px;
  background: ${c.bg};
  color: ${({ disabled }) => (disabled ? 'var(--text-muted)' : 'var(--text)')};
  font-size: 11px;
  cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.35 : 1)};
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover:not([disabled]) {
    background: ${c.bgMuted};
    border-color: ${c.primary};
    color: ${c.primary};
  }
`

const PostSeriesIndex: FunctionComponent<PostSeriesIndexProps> = ({
  seriesTitle,
  seriesColor,
  currentOrder,
  posts,
}) => {
  const totalPages = Math.ceil(posts.length / PAGE_SIZE)
  const initialPage = Math.floor((currentOrder - 1) / PAGE_SIZE)
  const [page, setPage] = useState(initialPage)

  const visiblePosts = posts.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const renderItem = (post: SeriesIndexPost) => {
    const isCurrent = post.seriesOrder === currentOrder
    return (
      <PostItem key={post.slug} isCurrent={isCurrent}>
        <OrderNum isCurrent={isCurrent}>{post.seriesOrder}</OrderNum>
        {isCurrent ? (
          <CurrentTitle>{post.title}</CurrentTitle>
        ) : (
          <PostLink to={post.slug}>{post.title}</PostLink>
        )}
        {isCurrent && <CurrentBadge>읽는 중</CurrentBadge>}
      </PostItem>
    )
  }

  return (
    <IndexWrapper>
      <IndexHeader>
        <SeriesDot color={seriesColor} />
        <SeriesTitle>{seriesTitle}</SeriesTitle>
        <PostCount>{posts.length}편</PostCount>
      </IndexHeader>
      <PostList>{visiblePosts.map(renderItem)}</PostList>
      {totalPages > 1 && (
        <Pagination>
          <PageIndicator>{page + 1} / {totalPages}</PageIndicator>
          <PageButton
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </PageButton>
          <PageButton
            disabled={page === totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </PageButton>
        </Pagination>
      )}
    </IndexWrapper>
  )
}

export default PostSeriesIndex
