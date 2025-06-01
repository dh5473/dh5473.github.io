import { Link } from 'gatsby'
import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { PostFrontmatterType } from 'types/PostItem.types'
import { GatsbyImage } from 'gatsby-plugin-image'

type PostItemProps = PostFrontmatterType & {
  link: string
}

const PostItemWrapper = styled(Link)`
  display: block;
  padding: 32px 0;
  border-bottom: 1px solid #f1f3f4;
  text-decoration: none;
  color: inherit;
  transition: all 0.3s ease;
  border-radius: 12px;

  &:hover {
    background: #fafbfc;
    margin: 0 -24px;
    padding: 32px 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    padding: 24px 0;

    &:hover {
      margin: 0 -16px;
      padding: 24px 16px;
      transform: translateY(-1px);
    }
  }
`

const PostContent = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-start;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 16px;
  }
`

const PostTextContent = styled.div`
  flex: 1;
  min-width: 0;
`

const PostTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: #1a1a1a;
  margin: 0 0 8px 0;
  transition: color 0.3s ease;

  ${PostItemWrapper}:hover & {
    color: #3182f6;
  }

  @media (max-width: 768px) {
    font-size: 18px;
  }
`

const PostSummary = styled.p`
  font-size: 16px;
  line-height: 1.5;
  color: #6b7280;
  margin: 0 0 16px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (max-width: 768px) {
    font-size: 14px;
  }
`

const PostCategory = styled.span`
  font-size: 14px;
  color: #9ca3af;
`

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #9ca3af;

  @media (max-width: 768px) {
    font-size: 13px;
  }
`

const PostDate = styled.span``

const PostDivider = styled.span`
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #d1d5db;
`

const PostThumbnail = styled.div`
  flex-shrink: 0;
  width: 160px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.3s ease;

  ${PostItemWrapper}:hover & {
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    width: 100%;
    height: 200px;
  }
`

const ThumbnailImage = styled(GatsbyImage)`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;

  ${PostItemWrapper}:hover & {
    transform: scale(1.1);
  }
`

// TODO: 카테고리 태그는 토스 블로그에서 포스트 리스트에 표시되지 않음
// 필요시 개별 포스트 페이지에 구현

const PostItem: FunctionComponent<PostItemProps> = function ({
  title,
  date,
  category,
  summary,
  thumbnail: {
    childImageSharp: { gatsbyImageData },
  },
  link,
}) {
  return (
    <PostItemWrapper to={link}>
      <PostContent>
        <PostTextContent>
          <PostTitle>{title}</PostTitle>
          <PostSummary>{summary}</PostSummary>
          <PostMeta>
            <PostDate>{date}</PostDate>
            <PostDivider />
            <PostCategory>{category}</PostCategory>
          </PostMeta>
        </PostTextContent>

        <PostThumbnail>
          <ThumbnailImage image={gatsbyImageData} alt={title} />
        </PostThumbnail>
      </PostContent>
    </PostItemWrapper>
  )
}

export default PostItem
