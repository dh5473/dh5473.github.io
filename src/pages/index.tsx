import React, { FunctionComponent, useEffect } from 'react'
import styled from '@emotion/styled'
import CategoryList from 'components/Main/CategoryList'
import PostList from 'components/Main/PostList'
import { graphql, navigate } from 'gatsby'
import { PostListItemType } from 'types/PostItem.types'
import queryString, { ParsedQuery } from 'query-string'
import Template from 'components/Common/Template'
import { getAllSeries, isPostInSeries } from 'utils/seriesData'

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
    }
  }
}

const Container = styled.div`
  min-height: 100vh;
  background: #ffffff;
`

const Header = styled.header`
  background: #ffffff;
  border-bottom: 1px solid #f1f3f4;
  position: sticky;
  top: 0;
  z-index: 100;
`

const HeaderContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;

  @media (max-width: 768px) {
    padding: 0 16px;
    height: 56px;
  }
`

const Logo = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;

  span {
    color: #3182f6;
  }
`

const HeaderButtons = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;

  @media (max-width: 768px) {
    gap: 12px;
  }
`

const GitHubButton = styled.a`
  background: #3182f6;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-block;

  &:hover {
    background: #2563eb;
  }

  @media (max-width: 768px) {
    padding: 6px 12px;
    font-size: 13px;
  }
`

const MainContent = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;

  @media (max-width: 768px) {
    padding: 0 16px;
  }
`

const ContentLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 48px;
  margin-top: 32px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  @media (max-width: 768px) {
    gap: 24px;
  }
`

const MainSection = styled.section`
  min-width: 0;
`

const Sidebar = styled.aside`
  @media (max-width: 1024px) {
    order: -1;
  }
`

const SidebarSection = styled.div`
  margin-bottom: 48px;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    margin-bottom: 32px;
  }
`

const SidebarTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #3182f6;
`

const PopularPostItem = styled.div`
  padding: 16px 0;
  border-bottom: 1px solid #f1f3f4;

  &:last-child {
    border-bottom: none;
  }
`

const PopularPostTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const SeriesItem = styled.div<{ isActive?: boolean }>`
  padding: 16px;
  background: ${props => (props.isActive ? '#e8f2ff' : '#f8f9fa')};
  border: 2px solid ${props => (props.isActive ? '#3182f6' : 'transparent')};
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${props => (props.isActive ? '#d6e9ff' : '#e9ecef')};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`

const SeriesTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px 0;
`

const SeriesDescription = styled.p`
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 8px 0;
  line-height: 1.4;
`

const SeriesCount = styled.span`
  font-size: 11px;
  color: #3182f6;
  font-weight: 500;
`

const SeriesFilterInfo = styled.div`
  background: #e8f2ff;
  border: 1px solid #3182f6;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const SeriesFilterText = styled.span`
  font-size: 14px;
  color: #1a1a1a;
  font-weight: 500;
`

const SeriesFilterClear = styled.button`
  background: none;
  border: none;
  color: #3182f6;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`

const HeroSection = styled.section`
  padding: 40px 0;
  display: flex;
  justify-content: center;

  @media (max-width: 768px) {
    padding: 24px 0;
  }
`

const HeroImage = styled.img`
  width: 100%;
  max-width: 1200px;
  height: 300px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    height: 250px;
    border-radius: 12px;
  }
`

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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedCategory, selectedSeries])

  // 시리즈 클릭 핸들러
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

  // 인기 글 임시 데이터 (실제로는 조회수나 좋아요 수를 기반으로 가져와야 함)
  const popularPosts = edges.slice(0, 3).map(({ node }) => ({
    title: node.frontmatter.title,
  }))

  // 시리즈 데이터 가져오기
  const seriesList = getAllSeries()
  const currentSeries = selectedSeries
    ? seriesList.find(s => s.id === selectedSeries)
    : null

  // 시리즈 필터링된 글 목록
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
      image="/hero-image.jpg"
    >
      <Container>
        <Header>
          <HeaderContent>
            <Logo>
              <span>don</span>tech
            </Logo>
            <HeaderButtons>
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

          <CategoryList selectedCategory={selectedCategory} />

          <ContentLayout>
            <MainSection>
              {currentSeries && (
                <SeriesFilterInfo>
                  <SeriesFilterText>
                    "{currentSeries.title}" 시리즈의 글을 보고 있습니다
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
    }
  }
`
