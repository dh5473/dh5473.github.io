import React, { FunctionComponent, useEffect, useState } from 'react'
import styled from '@emotion/styled'
import CategoryList from 'components/Main/CategoryList'
import PostList from 'components/Main/PostList'
import { graphql, navigate } from 'gatsby'
import { PostListItemType } from 'types/PostItem.types'
import queryString, { ParsedQuery } from 'query-string'
import Template from 'components/Common/Template'
import { getAllSeries, isPostInSeries } from 'utils/seriesData'
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
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;

  ${bp.md} {
    padding: 0 16px;
    height: 56px;
  }
`

const Logo = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: ${c.text};
  margin: 0;

  span {
    color: ${c.primary};
  }
`

const HeaderButtons = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;

  ${bp.md} {
    gap: 8px;
  }
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
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;

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
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s ease;
  text-decoration: none;
  display: inline-block;

  &:hover {
    background: ${c.primaryHov};
  }

  ${bp.md} {
    padding: 6px 12px;
    font-size: 13px;
  }
`

const MainContent = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;

  ${bp.md} {
    padding: 0 16px;
  }
`

const ContentLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 48px;
  margin-top: 32px;

  ${bp.lg} {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  ${bp.md} {
    gap: 24px;
  }
`

const MainSection = styled.section`
  min-width: 0;
`

const Sidebar = styled.aside`
  ${bp.lg} {
    order: -1;
  }
`

const SidebarSection = styled.div`
  margin-bottom: 48px;

  &:last-child {
    margin-bottom: 0;
  }

  ${bp.md} {
    margin-bottom: 32px;
  }
`

const SidebarTitle = styled.h2`
  font-size: 15px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 16px 0;
`

const PopularPostItem = styled.div`
  padding: 12px 0;
  border-bottom: 1px solid ${c.borderMuted};

  &:last-child {
    border-bottom: none;
  }
`

const PopularPostTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  color: ${c.text};
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s ease;

  &:hover {
    color: ${c.primary};
  }
`

const SeriesItem = styled.div<{ isActive?: boolean }>`
  padding: 14px 16px;
  background: ${props => (props.isActive ? c.bgMuted : c.bgSubtle)};
  border: 1.5px solid ${props => (props.isActive ? c.primary : 'transparent')};
  border-radius: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${c.bgMuted};
    transform: translateY(-1px);
    box-shadow: ${shadow.sm};
  }
`

const SeriesTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${c.text};
  margin: 0 0 4px 0;
`

const SeriesDescription = styled.p`
  font-size: 12px;
  color: ${c.textMuted};
  margin: 0 0 8px 0;
  line-height: 1.4;
`

const SeriesCount = styled.span`
  font-size: 11px;
  color: ${c.primary};
  font-weight: 600;
`

const SeriesFilterInfo = styled.div`
  background: ${c.bgMuted};
  border: 1px solid ${c.border};
  border-left: 3px solid ${c.primary};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;

  &:hover {
    text-decoration: underline;
  }
`

const HeroSection = styled.section`
  padding: 40px 0;
  display: flex;
  justify-content: center;

  ${bp.md} {
    padding: 24px 0;
  }
`

const HeroImage = styled.img`
  width: 100%;
  max-width: 1200px;
  height: 300px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: ${shadow.lg};

  ${bp.md} {
    height: 200px;
    border-radius: 12px;
  }

  ${bp.sm} {
    height: 160px;
    border-radius: 10px;
  }
`

const IndexPage: FunctionComponent<IndexPageProps> = function ({
  location: { search },
  data: {
    site: {
      siteMetadata: { title, description, siteUrl },
    },
    allMarkdownRemark: { edges, distinct: categories },
  },
}) {
  const parsed: ParsedQuery<string> = queryString.parse(search)
  const selectedCategory: string =
    typeof parsed.category !== 'string' || !parsed.category
      ? 'All'
      : parsed.category

  const selectedSeries: string | null =
    typeof parsed.series === 'string' ? parsed.series : null

  const [isDark, setIsDark] = useState(false)

  // Sync toggle state with current data-theme on mount
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
  }, [selectedCategory, selectedSeries])

  const handleSeriesClick = (seriesId: string) => {
    const currentParams = queryString.parse(search)
    const newParams = {
      ...currentParams,
      series: selectedSeries === seriesId ? undefined : seriesId,
      category: 'All',
    }

    const newSearch = queryString.stringify(newParams, {
      skipNull: true,
      skipEmptyString: true,
    })
    navigate(`/?${newSearch}`)
  }

  const popularPosts = edges.slice(0, 3).map(({ node }) => ({
    title: node.frontmatter.title,
  }))

  const seriesList = getAllSeries()
  const currentSeries = selectedSeries
    ? seriesList.find(s => s.id === selectedSeries)
    : null

  const filteredPosts = selectedSeries
    ? edges.filter(({ node }) =>
        isPostInSeries(node.fields.slug, selectedSeries),
      )
    : edges

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
            <Logo>
              <span>don</span>tech
            </Logo>
            <HeaderButtons>
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
            </HeaderButtons>
          </HeaderContent>
        </Header>

        <MainContent>
          <HeroSection>
            <HeroImage src="/hero-image.jpg" alt="Hero Image" />
          </HeroSection>

          <CategoryList
            selectedCategory={selectedCategory}
            categories={categories}
          />

          <ContentLayout>
            <MainSection>
              {currentSeries && (
                <SeriesFilterInfo>
                  <SeriesFilterText>
                    &ldquo;{currentSeries.title}&rdquo; 시리즈의 글을 보고
                    있습니다
                  </SeriesFilterText>
                  <SeriesFilterClear
                    onClick={() => handleSeriesClick(selectedSeries!)}
                  >
                    전체 글 보기
                  </SeriesFilterClear>
                </SeriesFilterInfo>
              )}
              <PostList
                selectedCategory={selectedCategory}
                posts={filteredPosts}
              />
            </MainSection>

            <Sidebar>
              <SidebarSection>
                <SidebarTitle>아티클 시리즈</SidebarTitle>
                {seriesList.map(series => (
                  <SeriesItem
                    key={series.id}
                    isActive={selectedSeries === series.id}
                    onClick={() => handleSeriesClick(series.id)}
                  >
                    <SeriesTitle>{series.title}</SeriesTitle>
                    <SeriesDescription>{series.description}</SeriesDescription>
                    <SeriesCount>아티클 {series.postCount}</SeriesCount>
                  </SeriesItem>
                ))}
              </SidebarSection>
              <SidebarSection>
                <SidebarTitle>인기있는 글</SidebarTitle>
                {popularPosts.map((post, index) => (
                  <PopularPostItem key={index}>
                    <PopularPostTitle>{post.title}</PopularPostTitle>
                  </PopularPostItem>
                ))}
              </SidebarSection>
            </Sidebar>
          </ContentLayout>
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
