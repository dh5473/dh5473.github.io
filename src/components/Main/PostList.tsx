import React, { FunctionComponent, useState } from 'react'
import styled from '@emotion/styled'
import PostItem from 'components/Main/PostItem'
import { PostListItemType } from 'types/PostItem.types'

type PostListProps = {
  selectedCategory: string
  posts: PostListItemType[]
}

const PostListWrapper = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 20px;
  width: 768px;
  margin: 0 auto;
  padding: 50px 0 100px;

  @media (max-width: 768px) {
    width: 100%;
    padding: 50px 20px;
    grid-template-columns: 1fr;
  }
`

const POSTS_PER_PAGE = 10

const PostList: FunctionComponent<PostListProps> = function ({
  selectedCategory,
  posts,
}) {
  const [currentPage, setCurrentPage] = useState(1)

  const startIdx = (currentPage - 1) * POSTS_PER_PAGE
  const endIdx = startIdx + POSTS_PER_PAGE
  const paginatedPosts = posts.slice(startIdx, endIdx)

  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE)

  return (
    <>
      <PostListWrapper>
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
      </PostListWrapper>
      <div style={{ textAlign: 'center', margin: '20px 0' }}>
        {Array.from({ length: totalPages }, (_, idx) => (
          <button
            key={idx + 1}
            onClick={() => setCurrentPage(idx + 1)}
            style={{
              margin: '0 5px',
              fontWeight: currentPage === idx + 1 ? 'bold' : 'normal',
            }}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </>
  )
}

export default PostList
