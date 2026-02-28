import React, { FunctionComponent, useEffect, useState } from 'react'
import styled from '@emotion/styled'
import PostList from 'components/Main/PostList'
import NavDropdown from 'components/Main/NavDropdown'
import HeroCarousel from 'components/Main/HeroCarousel'
import { graphql, navigate } from 'gatsby'
import { PostListItemType, SeriesInfo } from 'types/PostItem.types'
import queryString, { ParsedQuery } from 'query-string'
import Template from 'components/Common/Template'
import { seriesMetadata } from 'utils/seriesData'
import { getSectionForCategory } from 'styles/sections'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { c, bp, shadow } from 'styles/theme'

type IndexPageProps = {
  location: {
    search: string
  }
  data: {
    site: {
      siteMetadata: {
        title: string
        description: string
        siteUrl: string
      }
    }
    allMarkdownRemark: {
      edges: PostListItemType[]
      distinct: string[]
    }
  }
}

// ─── Layout ─────────────────────────────────────────────────────────

const Container = styled.div`
  min-height: 100vh;
  background: ${c.bg};
`

const Header = styled.header`
  background: ${c.bg};
  border-bottom: 1px solid ${c.border};
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background 0.2s ease, border-color 0.2s ease;
`

const HeaderContent = styled.div`
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

const Logo = styled.h1`
  font-size: 19px;
  font-weight: 700;
  color: ${c.text};
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;

  span {
    color: ${c.primary};
  }
`

const NavCenter = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;

  ${bp.lg} {
    display: none;
  }
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`

const ThemeToggle = styled.button`
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

const MobileNavWrapper = styled.div`
  display: none;

  ${bp.lg} {
    display: flex;
  }
`

// ─── Main ────────────────────────────────────────────────────────────

const MainContent = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px 80px;

  ${bp.md} {
    padding: 0 20px 60px;
  }
`

// ─── Series filter banner ────────────────────────────────────────────

const SeriesFilterInfo = styled.div`
  background: ${c.bgMuted};
  border: 1px solid ${c.border};
  border-left: 3px solid ${c.primary};
  border-radius: 10px;
  padding: 12px 20px;
  margin-top: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: ${shadow.sm};
`

const SeriesFilterText = styled.span`
  font-size: 14px;
  color: ${c.text};
  font-weight: 500;
`

const SeriesFilterClear = styled.button`
  background: none;
  border: none;
  color: ${c.primary};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  font-family: inherit;

  &:hover {
    text-decoration: underline;
  }
`

// ─── Content layout ──────────────────────────────────────────────────

const ContentRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 40px;
  align-items: start;
  margin-top: 32px;

  ${bp.lg} {
    grid-template-columns: 1fr;
    gap: 0;
  }
`

const PostSection = styled.section`
  min-width: 0;
`

const SeriesSidebar = styled.aside`
  position: sticky;
  top: 76px;

  ${bp.lg} {
    display: none;
  }
`

const SidebarLabel = styled.p`
  font-size: 11px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 12px 0;
`

const SidebarSeriesItem = styled.button<{ active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1.5px solid ${({ active }) => (active ? c.primary : c.borderMuted)};
  background: ${({ active }) => (active ? c.bgMuted : c.bgSubtle)};
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  font-family: inherit;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${c.bgMuted};
    border-color: ${({ active }) => (active ? c.primary : c.border)};
    transform: translateY(-1px);
  }
`

const SidebarSeriesTitle = styled.span<{ active: boolean }>`
  font-size: 13px;
  font-weight: ${({ active }) => (active ? '600' : '500')};
  color: ${({ active }) => (active ? c.primary : c.text)};
  line-height: 1.4;
`

const SidebarSeriesCount = styled.span`
  font-size: 11px;
  color: ${c.textMuted};
  font-weight: 500;
`

// ─── Page ────────────────────────────────────────────────────────────

const IndexPage: FunctionComponent<IndexPageProps> = function ({
  location: { search },
  data: {
    site: {
      siteMetadata: { title, description, siteUrl },
    },
    allMarkdownRemark: { edges },
  },
}) {
  const parsed: ParsedQuery<string> = queryString.parse(search)

  const selectedCategory: string =
    typeof parsed.category !== 'string' || !parsed.category
      ? 'All'
      : parsed.category

  const selectedSeries: string | null =
    typeof parsed.series === 'string' ? parsed.series : null

  const selectedSection: string = (() => {
    if (typeof parsed.section === 'string' && parsed.section) {
      return parsed.section
    }
    if (selectedCategory !== 'All') {
      return getSectionForCategory(selectedCategory)
    }
    return 'all'
  })()

  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setIsDark(current === 'dark')
  }, [])

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setIsDark(!isDark)
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedCategory, selectedSection, selectedSeries])

  const handleSeriesClick = (seriesId: string) => {
    const currentParams = queryString.parse(search)
    const newParams = {
      ...currentParams,
      series: selectedSeries === seriesId ? undefined : seriesId,
      category: 'All',
      section: undefined,
    }
    const newSearch = queryString.stringify(newParams, {
      skipNull: true,
      skipEmptyString: true,
    })
    navigate(`/?${newSearch}`)
  }

  // categoryCounts for NavDropdown
  const categoryCounts: Record<string, number> = {}
  edges.forEach(({ node }) => {
    const cat = node.frontmatter.category
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  })

  // Series list from frontmatter + display metadata
  const seriesList: SeriesInfo[] = Array.from(
    new Set(
      edges
        .map(({ node }) => node.frontmatter.series)
        .filter((s): s is string => Boolean(s)),
    ),
  ).map(id => ({
    id,
    title: seriesMetadata[id]?.title ?? id,
    description: seriesMetadata[id]?.description ?? '',
    postCount: edges.filter(({ node }) => node.frontmatter.series === id)
      .length,
    color: seriesMetadata[id]?.color,
  }))

  const currentSeries = selectedSeries
    ? seriesList.find(s => s.id === selectedSeries)
    : null

  const filteredPosts = selectedSeries
    ? edges.filter(({ node }) => node.frontmatter.series === selectedSeries)
    : edges

  // Featured posts for carousel: latest 3 (or 5 if available)
  const featuredPosts = edges.slice(0, 5)

  return (
    <Template
      title={title}
      description={description}
      url={siteUrl}
      image={`${siteUrl.replace(/\/$/, '')}/hero-image.jpg`}
    >
      <Container>
        <Header>
          <HeaderContent>
            <Logo onClick={() => navigate('/')}>
              <span>don</span>tech
            </Logo>

            <NavCenter>
              <NavDropdown
                selectedSection={selectedSection}
                selectedCategory={selectedCategory}
                categoryCounts={categoryCounts}
              />
            </NavCenter>

            <HeaderActions>
              <ThemeToggle onClick={toggleTheme} aria-label="테마 전환">
                <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
              </ThemeToggle>
              <GitHubButton
                href="https://github.com/dh5473"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </GitHubButton>
              {/* Mobile: hamburger is rendered inside NavDropdown */}
              <MobileNavWrapper>
                <NavDropdown
                  selectedSection={selectedSection}
                  selectedCategory={selectedCategory}
                  categoryCounts={categoryCounts}
                />
              </MobileNavWrapper>
            </HeaderActions>
          </HeaderContent>
        </Header>

        <MainContent>
          {/* Hero carousel */}
          <HeroCarousel posts={featuredPosts} />

          <ContentRow>
            {/* Post list */}
            <PostSection>
              {currentSeries && (
                <SeriesFilterInfo>
                  <SeriesFilterText>
                    &ldquo;{currentSeries.title}&rdquo; 시리즈의 글을 보고 있습니다
                  </SeriesFilterText>
                  <SeriesFilterClear onClick={() => handleSeriesClick(selectedSeries!)}>
                    전체 글 보기
                  </SeriesFilterClear>
                </SeriesFilterInfo>
              )}
              <PostList
                selectedSection={selectedSection}
                selectedCategory={selectedCategory}
                posts={filteredPosts}
              />
            </PostSection>

            {/* Right sidebar: series */}
            <SeriesSidebar>
              <SidebarLabel>SERIES</SidebarLabel>
              {seriesList.map(series => {
                const isActive = selectedSeries === series.id
                return (
                  <SidebarSeriesItem
                    key={series.id}
                    active={isActive}
                    onClick={() => handleSeriesClick(series.id)}
                  >
                    <SidebarSeriesTitle active={isActive}>
                      {series.title}
                    </SidebarSeriesTitle>
                    <SidebarSeriesCount>아티클 {series.postCount}개</SidebarSeriesCount>
                  </SidebarSeriesItem>
                )
              })}
            </SeriesSidebar>
          </ContentRow>
        </MainContent>
      </Container>
    </Template>
  )
}

export default IndexPage

export const getPostList = graphql`
  query getPostList {
    site {
      siteMetadata {
        title
        description
        siteUrl
      }
    }
    allMarkdownRemark(
      sort: [{ frontmatter: { date: DESC } }, { frontmatter: { title: ASC } }]
    ) {
      edges {
        node {
          id
          fields {
            slug
          }
          frontmatter {
            title
            summary
            date(formatString: "YYYY.MM.DD.")
            category
            series
            seriesOrder
            thumbnail {
              childImageSharp {
                gatsbyImageData(width: 768, height: 400)
              }
            }
          }
        }
      }
      distinct(field: { frontmatter: { category: SELECT } })
    }
  }
`
