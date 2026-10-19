import React, { FunctionComponent } from 'react'
import { graphql, Link } from 'gatsby'
import styled from '@emotion/styled'
import Template from 'components/Common/Template'
import PageChrome from 'components/Common/PageChrome'
import PostItem from 'components/Main/PostItem'
import { PostListItemType } from 'types/PostItem.types'
import { seriesMetadata } from 'utils/seriesData'
import { c, bp } from 'styles/theme'

type SeriesTemplateProps = {
  data: {
    site: {
      siteMetadata: { title: string; siteUrl: string }
    }
    allMarkdownRemark: {
      edges: PostListItemType[]
    }
  }
  pageContext: {
    seriesId: string
  }
}

// ─── Intro ───────────────────────────────────────────────────────────

const Intro = styled.div`
  max-width: 840px;
  margin: 0 auto 12px;
  padding-left: 18px;
  border-left: 4px solid var(--series-tone);
`

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
  margin: 0;
  max-width: 620px;
  font-size: 16px;
  line-height: 1.75;
  color: ${c.textMuted};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 15px;
  }
`

// PostItem이 :last-child로 구분선을 지우므로 li로 감싸지 않고 바로 나열한다
const List = styled.div`
  max-width: 840px;
  margin: 0 auto;
`

const OtherSeries = styled.nav`
  max-width: 840px;
  margin: 56px auto 0;
  padding-top: 24px;
  border-top: 1px solid ${c.borderMuted};
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const SeriesChip = styled(Link)`
  padding: 6px 14px;
  border-radius: 100px;
  border: 1.5px solid ${c.border};
  font-size: 13px;
  font-weight: 500;
  color: ${c.textMuted};
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${c.primary};
    color: ${c.primary};
  }
`

const SeriesTemplate: FunctionComponent<SeriesTemplateProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
    allMarkdownRemark: { edges },
  },
  pageContext: { seriesId },
}) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  const meta = seriesMetadata[seriesId]
  const seriesTitle = meta?.title ?? seriesId
  const description = `${seriesTitle} 시리즈 ${edges.length}편을 읽는 순서대로 모았습니다. ${meta?.description ?? ''}`.trim()

  return (
    <Template
      title={`${seriesTitle} 시리즈 | ${siteTitle}`}
      description={description}
      url={`${baseUrl}/series/${seriesId}/`}
      image={`${baseUrl}/hero-image.jpg`}
      siteUrl={siteUrl}
    >
      <PageChrome crumb={`Series / ${seriesTitle}`} wide>
        <Intro
          style={{ '--series-tone': meta?.color ?? 'var(--primary)' } as React.CSSProperties}
        >
          <Title>{seriesTitle} 시리즈</Title>
          <Lead>
            {meta?.description}
            {meta?.description && '. '}
            {edges.length}편을 읽는 순서대로 정리했습니다.
          </Lead>
        </Intro>

        <List>
          {edges.map(({ node: { id, fields: { slug }, frontmatter } }) => (
            <PostItem {...frontmatter} link={slug} key={id} />
          ))}
        </List>

        <OtherSeries aria-label="다른 시리즈">
          {Object.entries(seriesMetadata)
            .filter(([id]) => id !== seriesId)
            .map(([id, { title }]) => (
              <SeriesChip key={id} to={`/series/${id}/`}>
                {title}
              </SeriesChip>
            ))}
        </OtherSeries>
      </PageChrome>
    </Template>
  )
}

export default SeriesTemplate

export const seriesQuery = graphql`
  query seriesQuery($seriesId: String!) {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
    allMarkdownRemark(
      filter: { frontmatter: { series: { eq: $seriesId } } }
      sort: { frontmatter: { seriesOrder: ASC } }
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
    }
  }
`
