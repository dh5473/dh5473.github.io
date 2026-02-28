import React, { FunctionComponent, useState, useEffect } from 'react'
import styled from '@emotion/styled'
import PostItem from 'components/Main/PostItem'
import { PostListItemType } from 'types/PostItem.types'
import { c, bp } from 'styles/theme'
import { getSectionById } from 'styles/sections'

type PostListProps = {
  selectedSection: string
  selectedCategory: string
  posts: PostListItemType[]
}

const PostListWrapper = styled.div``

const PostContainer = styled.div``

const PaginationWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  margin: 64px 0;

  ${bp.md} {
    margin: 48px 0;
  }
`

const PageButton = styled.button<{ active?: boolean; disabled?: boolean }>`
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid
    ${({ active }) => (active ? c.primary : 'transparent')};
  background: ${({ active }) => (active ? c.primary : 'transparent')};
  color: ${({ active, disabled }) =>
    disabled ? c.border : active ? '#ffffff' : c.textMuted};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ active }) => (active ? c.primaryHov : c.bgSubtle)};
    color: ${({ active }) => (active ? '#ffffff' : c.text)};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`

const PageEllipsis = styled.span`
  padding: 0 4px;
  color: ${c.textMuted};
  font-size: 14px;
`

const POSTS_PER_PAGE = 10

const PostList: FunctionComponent<PostListProps> = function ({
  selectedSection,
  selectedCategory,
  posts,
}) {
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedSection, selectedCategory])

  const filteredPosts = posts.filter(
    ({
      node: {
        frontmatter: { category },
      },
    }: PostListItemType) => {
      // Section filter: if a section is selected, only show posts in that section's categories
      if (selectedSection !== 'all') {
        const sectionCats = getSectionById(selectedSection)?.categories ?? []
        if (!sectionCats.includes(category)) return false
      }
      // Category filter
      if (selectedCategory === 'All') return true
      return category === selectedCategory
    },
  )

  const startIdx = (currentPage - 1) * POSTS_PER_PAGE
  const endIdx = startIdx + POSTS_PER_PAGE
  const paginatedPosts = filteredPosts.slice(startIdx, endIdx)

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null

    const pageNumbers = []
    const maxVisible = 5

    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let endPage = Math.min(totalPages, startPage + maxVisible - 1)

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i)
    }

    return (
      <PaginationWrapper>
        <PageButton
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          이전
        </PageButton>

        {startPage > 1 && (
          <>
            <PageButton onClick={() => handlePageChange(1)}>1</PageButton>
            {startPage > 2 && <PageEllipsis>...</PageEllipsis>}
          </>
        )}

        {pageNumbers.map(page => (
          <PageButton
            key={page}
            active={currentPage === page}
            onClick={() => handlePageChange(page)}
          >
            {page}
          </PageButton>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <PageEllipsis>...</PageEllipsis>}
            <PageButton onClick={() => handlePageChange(totalPages)}>
              {totalPages}
            </PageButton>
          </>
        )}

        <PageButton
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          다음
        </PageButton>
      </PaginationWrapper>
    )
  }

  return (
    <>
      <PostListWrapper>
        <PostContainer>
          {paginatedPosts.map(
            ({
              node: {
                id,
                fields: { slug },
                frontmatter,
              },
            }: PostListItemType) => (
              <PostItem {...frontmatter} link={slug} key={id} />
            ),
          )}
        </PostContainer>
      </PostListWrapper>

      {renderPagination()}
    </>
  )
}

export default PostList
