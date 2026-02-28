import React, { FunctionComponent, useState, useEffect, useRef } from 'react'
import styled from '@emotion/styled'
import { navigate } from 'gatsby'
import { GatsbyImage } from 'gatsby-plugin-image'
import { PostListItemType } from 'types/PostItem.types'
import { c, bp, shadow } from 'styles/theme'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'

type HeroCarouselProps = {
  posts: PostListItemType[]
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

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: ${shadow.lg};
  margin-top: 28px;
  background: ${c.bgSubtle};
  border: 1px solid ${c.border};
  cursor: pointer;
  display: grid;
  grid-template-columns: 1fr 400px;
  min-height: 280px;
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: ${shadow.lg};
  }

  ${bp.lg} {
    grid-template-columns: 1fr 320px;
    min-height: 240px;
  }

  ${bp.md} {
    grid-template-columns: 1fr;
    min-height: 0;
    border-radius: 12px;
    margin-top: 20px;
  }
`

// ─── Left: text content ──────────────────────────────────────────────

const LeftPane = styled.div`
  position: relative;
  padding: 44px 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 280px;

  ${bp.lg} {
    padding: 36px 40px;
    min-height: 240px;
  }

  ${bp.md} {
    padding: 28px 28px 24px;
    min-height: 0;
  }
`

const SlideText = styled.div<{ active: boolean }>`
  opacity: ${({ active }) => (active ? 1 : 0)};
  transition: opacity 0.5s ease;
  position: absolute;
  top: 44px;
  left: 48px;
  right: 48px;
  pointer-events: ${({ active }) => (active ? 'auto' : 'none')};

  ${bp.lg} {
    top: 36px;
    left: 40px;
    right: 40px;
  }

  ${bp.md} {
    top: 28px;
    left: 28px;
    right: 28px;
  }
`

const CategoryPill = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 100px;
  background: ${c.bgMuted};
  border: 1px solid ${c.borderMuted};
  font-size: 12px;
  font-weight: 600;
  color: ${c.primary};
  letter-spacing: 0.04em;
  margin-bottom: 16px;

  ${bp.md} {
    margin-bottom: 12px;
  }
`

const Title = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${c.text};
  line-height: 1.4;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${bp.lg} {
    font-size: 19px;
  }

  ${bp.md} {
    font-size: 17px;
    margin: 0 0 8px 0;
  }
`

const Summary = styled.p`
  font-size: 14px;
  line-height: 1.7;
  color: ${c.textMuted};
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${bp.md} {
    -webkit-line-clamp: 2;
    font-size: 13px;
  }

  ${bp.sm} {
    display: none;
  }
`

// ─── Controls (bottom of left pane) ─────────────────────────────────

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  position: absolute;
  bottom: 44px;
  left: 48px;

  ${bp.lg} {
    bottom: 36px;
    left: 40px;
  }

  ${bp.md} {
    bottom: 24px;
    left: 28px;
  }
`

const ArrowButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid ${c.border};
  background: ${c.bg};
  color: ${c.textMuted};
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    border-color: ${c.primary};
    color: ${c.primary};
    background: ${c.bgMuted};
  }

  ${bp.md} {
    width: 34px;
    height: 34px;
    font-size: 12px;
  }
`

const DotsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
`

const Dot = styled.button<{ active: boolean }>`
  width: ${({ active }) => (active ? '20px' : '6px')};
  height: 6px;
  border-radius: 3px;
  border: none;
  background: ${({ active }) => (active ? c.primary : c.border)};
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;

  &:hover {
    background: ${({ active }) => (active ? c.primary : c.textMuted)};
  }
`

// ─── Right: image ────────────────────────────────────────────────────

const RightPane = styled.div`
  position: relative;
  overflow: hidden;

  ${bp.md} {
    height: 200px;
    order: -1;
  }

  ${bp.sm} {
    height: 160px;
  }
`

const SlideImage = styled.div<{ active: boolean; gradient: string }>`
  position: absolute;
  inset: 0;
  opacity: ${({ active }) => (active ? 1 : 0)};
  transition: opacity 0.5s ease;
  pointer-events: none;
  background: ${({ gradient }) => gradient};
`

const ThumbnailImage = styled(GatsbyImage)`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

// ─── Component ──────────────────────────────────────────────────────

const AUTO_INTERVAL = 5000

const HeroCarousel: FunctionComponent<HeroCarouselProps> = function ({ posts }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const isHovered = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const count = Math.min(posts.length, 5)
  const featured = posts.slice(0, count)

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (!isHovered.current) {
        setActiveIndex(i => (i + 1) % count)
      }
    }, AUTO_INTERVAL)
  }

  useEffect(() => {
    if (count <= 1) return
    startTimer()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [count])

  const goTo = (index: number) => {
    setActiveIndex(index)
    startTimer()
  }

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    goTo((activeIndex - 1 + count) % count)
  }

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    goTo((activeIndex + 1) % count)
  }

  if (featured.length === 0) return null

  return (
    <Wrapper
      onMouseEnter={() => { isHovered.current = true }}
      onMouseLeave={() => { isHovered.current = false }}
      onClick={() => navigate(featured[activeIndex].node.fields.slug)}
    >
      {/* Left: text slides */}
      <LeftPane>
        {featured.map(({ node }, index) => {
          const { frontmatter } = node
          return (
            <SlideText key={node.id} active={index === activeIndex}>
              <CategoryPill>{frontmatter.category}</CategoryPill>
              <Title>{frontmatter.title}</Title>
              <Summary>{frontmatter.summary}</Summary>
            </SlideText>
          )
        })}

        {count > 1 && (
          <Controls>
            <ArrowButton onClick={goPrev} aria-label="이전">
              <FontAwesomeIcon icon={faChevronLeft} />
            </ArrowButton>
            <ArrowButton onClick={goNext} aria-label="다음">
              <FontAwesomeIcon icon={faChevronRight} />
            </ArrowButton>
            <DotsGroup>
              {featured.map((_, i) => (
                <Dot
                  key={i}
                  active={i === activeIndex}
                  onClick={e => {
                    e.stopPropagation()
                    goTo(i)
                  }}
                  aria-label={`슬라이드 ${i + 1}`}
                />
              ))}
            </DotsGroup>
          </Controls>
        )}
      </LeftPane>

      {/* Right: image slides */}
      <RightPane>
        {featured.map(({ node }, index) => {
          const { frontmatter } = node
          const gatsbyImageData =
            frontmatter.thumbnail?.childImageSharp?.gatsbyImageData ?? null
          const gradient = getGradient(frontmatter.category)
          return (
            <SlideImage key={node.id} active={index === activeIndex} gradient={gradient}>
              {gatsbyImageData && (
                <ThumbnailImage image={gatsbyImageData} alt={frontmatter.title} />
              )}
            </SlideImage>
          )
        })}
      </RightPane>
    </Wrapper>
  )
}

export default HeroCarousel
