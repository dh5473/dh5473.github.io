import React, { FunctionComponent, useEffect } from 'react'
import styled from '@emotion/styled'
import CategoryList from 'components/Main/CategoryList'
import PostList from 'components/Main/PostList'
import { graphql } from 'gatsby'
import { PostListItemType } from 'types/PostItem.types'
import queryString, { ParsedQuery } from 'query-string'
import Template from 'components/Common/Template'

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

const Logo = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;

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

const SidebarTitle = styled.h3`
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

const PopularPostTitle = styled.h4`
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

const SeriesItem = styled.div`
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
`

const SeriesTitle = styled.h4`
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

const HeroTitle = styled.h1`
  font-size: 48px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: 32px;
  }
`

const HeroSubtitle = styled.p`
  font-size: 20px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;

  @media (max-width: 768px) {
    font-size: 16px;
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedCategory])

  // 인기 글 임시 데이터 (실제로는 조회수나 좋아요 수를 기반으로 가져와야 함)
  const popularPosts = edges.slice(0, 3).map(({ node }) => ({
    title: node.frontmatter.title,
  }))

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
              <PostList selectedCategory={selectedCategory} posts={edges} />
            </MainSection>

            <Sidebar>
              <SidebarSection>
                <SidebarTitle>인기있는 글</SidebarTitle>
                {popularPosts.map((post, index) => (
                  <PopularPostItem key={index}>
                    <PopularPostTitle>{post.title}</PopularPostTitle>
                  </PopularPostItem>
                ))}
              </SidebarSection>

              <SidebarSection>
                <SidebarTitle>아티클 시리즈</SidebarTitle>
                <SeriesItem>
                  <SeriesTitle>Python</SeriesTitle>
                  <SeriesDescription>
                    Python의 고급 기능과 패턴을 다루는 시리즈
                  </SeriesDescription>
                  <SeriesCount>아티클 4</SeriesCount>
                </SeriesItem>
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
