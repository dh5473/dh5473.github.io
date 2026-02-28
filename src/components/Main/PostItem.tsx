import { Link } from 'gatsby'
import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { PostFrontmatterType } from 'types/PostItem.types'
import { GatsbyImage } from 'gatsby-plugin-image'
import { c, bp, shadow } from 'styles/theme'
import { seriesMetadata } from 'utils/seriesData'

type PostItemProps = PostFrontmatterType & {
  link: string
}

const categoryGradients: Record<string, string> = {
  Python: 'linear-gradient(135deg, #3776ab 0%, #1a5276 100%)',
  FastAPI: 'linear-gradient(135deg, #099889 0%, #065a52 100%)',
  'Machine Learning': 'linear-gradient(135deg, #ff7f0e 0%, #a04000 100%)',
  'Deep Learning': 'linear-gradient(135deg, #e74c3c 0%, #922b21 100%)',
  LLM: 'linear-gradient(135deg, #8e44ad 0%, #6c2f8e 100%)',
  'Operating Systems': 'linear-gradient(135deg, #2c3e50 0%, #1a252f 100%)',
  'Data Structures': 'linear-gradient(135deg, #1abc9c 0%, #0e6655 100%)',
  Networking: 'linear-gradient(135deg, #3498db 0%, #1a5276 100%)',
  Database: 'linear-gradient(135deg, #e67e22 0%, #a04000 100%)',
  'System Design': 'linear-gradient(135deg, #34495e 0%, #1c2833 100%)',
  'Software Engineering': 'linear-gradient(135deg, #16a085 0%, #0e6655 100%)',
  'Linux & Cloud': 'linear-gradient(135deg, #f39c12 0%, #9a7d0a 100%)',
  DevOps: 'linear-gradient(135deg, #27ae60 0%, #1e8449 100%)',
  MLOps: 'linear-gradient(135deg, #2980b9 0%, #1a5276 100%)',
  TypeScript: 'linear-gradient(135deg, #3178c6 0%, #1e4f8c 100%)',
  'Next.js': 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
}

const getGradient = (category: string) =>
  categoryGradients[category] ?? 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'

// ─── Styled ─────────────────────────────────────────────────────────

const PostItemWrapper = styled(Link)`
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding: 28px 0;
  border-bottom: 1px solid ${c.borderMuted};
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
  border-radius: 12px;
  position: relative;

  &:hover {
    background: ${c.bgSubtle};
    margin: 0 -20px;
    padding: 28px 20px;
    box-shadow: ${shadow.sm};
  }

  &:last-child {
    border-bottom: none;
  }

  ${bp.md} {
    flex-direction: column;
    gap: 14px;
    padding: 22px 0;

    &:hover {
      margin: 0 -14px;
      padding: 22px 14px;
    }
  }
`

const PostTextContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`

const PostMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
`

const CategoryPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 100px;
  background: ${c.bgMuted};
  border: 1px solid ${c.borderMuted};
  font-size: 11px;
  font-weight: 600;
  color: ${c.primary};
  letter-spacing: 0.02em;
`

const PostDate = styled.span`
  font-size: 12px;
  color: ${c.textMuted};
`

const Dot = styled.span`
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: ${c.border};
  flex-shrink: 0;
`

const PostTitle = styled.h2`
  font-size: 18px;
  font-weight: 600;
  line-height: 1.45;
  color: ${c.text};
  margin: 0 0 8px 0;
  transition: color 0.2s ease;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${PostItemWrapper}:hover & {
    color: ${c.primary};
  }

  ${bp.md} {
    font-size: 16px;
  }
`

const PostSummary = styled.p`
  font-size: 14px;
  line-height: 1.65;
  color: ${c.textMuted};
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;

  ${bp.md} {
    font-size: 13px;
    -webkit-line-clamp: 3;
  }
`

const SeriesBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: ${c.textMuted};
  font-weight: 500;

  &::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${c.border};
  }
`

const ThumbnailWrapper = styled.div`
  flex-shrink: 0;
  width: 160px;
  height: 110px;
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  ${PostItemWrapper}:hover & {
    transform: scale(1.02);
    box-shadow: ${shadow.sm};
  }

  ${bp.md} {
    width: 100%;
    height: 180px;
    border-radius: 10px;
    order: -1;
  }

  ${bp.sm} {
    height: 160px;
  }
`

const ThumbnailImage = styled(GatsbyImage)`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const ThumbnailFallback = styled.div<{ gradient: string }>`
  width: 100%;
  height: 100%;
  background: ${({ gradient }) => gradient};
`

// ─── Component ──────────────────────────────────────────────────────

const PostItem: FunctionComponent<PostItemProps> = function ({
  title,
  date,
  category,
  summary,
  thumbnail,
  series,
  link,
}) {
  const gatsbyImageData = thumbnail?.childImageSharp?.gatsbyImageData ?? null
  const gradient = getGradient(category)
  const seriesTitle = series ? (seriesMetadata[series]?.title ?? series) : null

  return (
    <PostItemWrapper to={link}>
      <PostTextContent>
        <PostMeta>
          <CategoryPill>{category}</CategoryPill>
          <Dot />
          <PostDate>{date}</PostDate>
        </PostMeta>

        <PostTitle>{title}</PostTitle>
        <PostSummary>{summary}</PostSummary>

        {seriesTitle && <SeriesBadge>{seriesTitle}</SeriesBadge>}
      </PostTextContent>

      <ThumbnailWrapper>
        {gatsbyImageData ? (
          <ThumbnailImage image={gatsbyImageData} alt={title} />
        ) : (
          <ThumbnailFallback gradient={gradient} />
        )}
      </ThumbnailWrapper>
    </PostItemWrapper>
  )
}

export default PostItem
