import React, { FunctionComponent } from 'react'
import { graphql, Link } from 'gatsby'
import styled from '@emotion/styled'
import Template from 'components/Common/Template'
import PageChrome from 'components/Common/PageChrome'
import { sections } from 'styles/sections'
import { c, bp } from 'styles/theme'

type PostsPageProps = {
  data: {
    site: {
      siteMetadata: { title: string; siteUrl: string }
    }
    allMarkdownRemark: {
      nodes: {
        id: string
        fields: { slug: string }
        frontmatter: { title: string; date: string; category: string }
      }[]
    }
  }
}

// 홈 목록은 페이지 버튼이 JS로만 넘어가서 크롤러가 최신 10편 너머를 못 본다.
// 이 페이지는 모든 글을 정적 링크 한 장으로 펼쳐 둔다

const Title = styled.h1`
  margin: 0 0 10px;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${c.text};

  ${bp.sm} {
    font-size: 26px;
  }
`

const Lead = styled.p`
  margin: 0 0 40px;
  font-size: 16px;
  line-height: 1.75;
  color: ${c.textMuted};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 15px;
  }
`

const Section = styled.section`
  & + & {
    margin-top: 48px;
  }
`

const SectionTitle = styled.h2`
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 800;
  color: ${c.text};
`

const CategoryTitle = styled.h3`
  margin: 24px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: ${c.primary};
  letter-spacing: 0.02em;
`

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li`
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 7px 0;
  border-bottom: 1px solid ${c.borderMuted};

  ${bp.sm} {
    flex-direction: column;
    gap: 2px;
  }
`

const PostDate = styled.span`
  flex-shrink: 0;
  width: 88px;
  font-size: 12.5px;
  color: ${c.textMuted};
  font-variant-numeric: tabular-nums;
`

const PostLink = styled(Link)`
  font-size: 15px;
  line-height: 1.5;
  color: ${c.text};
  text-decoration: none;

  &:hover {
    color: ${c.primary};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

const PostsPage: FunctionComponent<PostsPageProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
    allMarkdownRemark: { nodes },
  },
}) {
  const baseUrl = siteUrl.replace(/\/$/, '')

  const groups = sections
    .map(section => ({
      ...section,
      categories: section.categories
        .map(category => ({
          category,
          posts: nodes.filter(n => n.frontmatter.category === category),
        }))
        .filter(g => g.posts.length > 0),
    }))
    .filter(section => section.categories.length > 0)

  return (
    <Template
      title={`전체 글 | ${siteTitle}`}
      description={`${siteTitle}에 올라온 글 ${nodes.length}편을 분야별로 모은 목록입니다.`}
      url={`${baseUrl}/posts/`}
      image={`${baseUrl}/hero-image.jpg`}
      siteUrl={siteUrl}
    >
      <PageChrome crumb="전체 글">
        <Title>전체 글</Title>
        <Lead>{nodes.length}편을 분야별로, 최신 글부터 모았습니다.</Lead>

        {groups.map(section => (
          <Section key={section.id}>
            <SectionTitle>{section.name}</SectionTitle>
            {section.categories.map(({ category, posts }) => (
              <div key={category}>
                <CategoryTitle>{category}</CategoryTitle>
                <List>
                  {posts.map(({ id, fields: { slug }, frontmatter }) => (
                    <Row key={id}>
                      <PostDate>{frontmatter.date}</PostDate>
                      <PostLink to={slug}>{frontmatter.title}</PostLink>
                    </Row>
                  ))}
                </List>
              </div>
            ))}
          </Section>
        ))}
      </PageChrome>
    </Template>
  )
}

export default PostsPage

export const postsPageQuery = graphql`
  query postsPageQuery {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
    allMarkdownRemark(
      sort: [{ frontmatter: { date: DESC } }, { frontmatter: { title: ASC } }]
    ) {
      nodes {
        id
        fields {
          slug
        }
        frontmatter {
          title
          date(formatString: "YYYY.MM.DD.")
          category
        }
      }
    }
  }
`
