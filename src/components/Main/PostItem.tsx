import { Link } from 'gatsby'
import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { PostFrontmatterType } from 'types/PostItem.types'
import { GatsbyImage } from 'gatsby-plugin-image'
import { c, bp, shadow } from 'styles/theme'

type PostItemProps = PostFrontmatterType & {
  link: string
}

const PostItemWrapper = styled(Link)`
  display: block;
  padding: 32px 0;
  border-bottom: 1px solid ${c.borderMuted};
  text-decoration: none;
  color: inherit;
  transition: all 0.25s ease;
  border-radius: 12px;

  &:hover {
    background: ${c.bgSubtle};
    margin: 0 -24px;
    padding: 32px 24px;
    box-shadow: ${shadow.md};
    transform: translateY(-2px);
  }

  &:last-child {
    border-bottom: none;
  }

  ${bp.md} {
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

  ${bp.md} {
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
  color: ${c.text};
  margin: 0 0 8px 0;
  transition: color 0.25s ease;

  ${PostItemWrapper}:hover & {
    color: ${c.primary};
  }

  ${bp.md} {
    font-size: 18px;
  }
`

const PostSummary = styled.p`
  font-size: 15px;
  line-height: 1.6;
  color: ${c.textMuted};
  margin: 0 0 16px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${bp.md} {
    font-size: 14px;
  }
`

const PostCategory = styled.span`
  font-size: 13px;
  color: ${c.primary};
  font-weight: 500;
`

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${c.textMuted};

  ${bp.md} {
    font-size: 12px;
  }
`

const PostDate = styled.span``

const PostDivider = styled.span`
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: ${c.border};
`

const PostThumbnail = styled.div`
  flex-shrink: 0;
  width: 160px;
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.25s ease;

  ${PostItemWrapper}:hover & {
    transform: scale(1.04);
  }

  ${bp.md} {
    width: 100%;
    height: 200px;
  }

  ${bp.sm} {
    height: 180px;
  }
`

const ThumbnailImage = styled(GatsbyImage)`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s ease;

  ${PostItemWrapper}:hover & {
    transform: scale(1.08);
  }
`

const PostItem: FunctionComponent<PostItemProps> = function ({
  title,
  date,
  category,
  summary,
  thumbnail,
  link,
}) {
  const gatsbyImageData = thumbnail?.childImageSharp?.gatsbyImageData ?? null

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

        {gatsbyImageData && (
          <PostThumbnail>
            <ThumbnailImage image={gatsbyImageData} alt={title} />
          </PostThumbnail>
        )}
      </PostContent>
    </PostItemWrapper>
  )
}

export default PostItem
