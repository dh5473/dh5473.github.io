import { graphql } from 'gatsby'
import React, { FunctionComponent } from 'react'
import Template from 'components/Common/Template'
import PostHead from 'components/Post/PostHead'
import PostContent from 'components/Post/PostContent'
import PostSeriesNav from 'components/Post/PostSeriesNav'
import PostSeriesIndex from 'components/Post/PostSeriesIndex'
import CommentWidget from 'components/Post/CommentWidget'
import { IGatsbyImageData } from 'gatsby-plugin-image'
import { seriesMetadata } from 'utils/seriesData'

type PostTemplateProps = {
  data: {
    site: {
      siteMetadata: {
        title: string
        description: string
        siteUrl: string
      }
    }
    allMarkdownRemark: {
      edges: {
        node: {
          html: string
          wordCount: {
            words: number
          }
          fields: {
            slug: string
          }
          frontmatter: {
            title: string
            summary: string
            date: string
            rawDate: string
            category: string
            thumbnail: {
              childImageSharp: {
                gatsbyImageData: IGatsbyImageData
              }
              publicURL: string
            } | null
          }
        }
      }[]
    }
  }
  pageContext: {
    slug: string
    seriesId?: string
    seriesCurrentOrder?: number
    seriesTotal?: number
    seriesPosts?: { slug: string; title: string; seriesOrder: number }[]
    prevPost?: { slug: string; title: string }
    nextPost?: { slug: string; title: string }
  }
}

const PostTemplate: FunctionComponent<PostTemplateProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
    allMarkdownRemark: { edges },
  },
  pageContext: { seriesId, seriesCurrentOrder, seriesTotal, seriesPosts, prevPost, nextPost },
}) {
  const {
    node: {
      html,
      fields: { slug },
      frontmatter: { title, summary, date, rawDate, category, thumbnail },
      wordCount: { words },
    },
  } = edges[0]

  const gatsbyImageData =
    thumbnail?.childImageSharp?.gatsbyImageData ?? undefined
  const publicURL = thumbnail?.publicURL ?? null

  const baseUrl = siteUrl.replace(/\/$/, '')
  const pageUrl = `${baseUrl}${slug}`
  const absoluteImage = publicURL
    ? `${baseUrl}${publicURL}`
    : `${baseUrl}/hero-image.jpg`

  const seriesMeta = seriesId ? seriesMetadata[seriesId] : undefined
  const hasSeriesNav = !!(
    seriesId &&
    seriesCurrentOrder != null &&
    seriesTotal != null &&
    seriesMeta
  )

  return (
    <Template
      title={`${title} | ${siteTitle}`}
      description={summary}
      url={pageUrl}
      image={absoluteImage}
      siteUrl={siteUrl}
      type="article"
      datePublished={rawDate}
      category={category}
      wordCount={words}
    >
      <PostHead
        title={title}
        date={date}
        category={category}
        thumbnail={gatsbyImageData}
      />
      {hasSeriesNav && seriesPosts && (
        <PostSeriesIndex
          seriesTitle={seriesMeta!.title}
          seriesColor={seriesMeta?.color}
          currentOrder={seriesCurrentOrder!}
          posts={seriesPosts}
        />
      )}
      <PostContent html={html} />
      {hasSeriesNav && (
        <PostSeriesNav
          seriesId={seriesId!}
          seriesTitle={seriesMeta!.title}
          seriesColor={seriesMeta?.color}
          currentOrder={seriesCurrentOrder!}
          total={seriesTotal!}
          prevPost={prevPost ?? null}
          nextPost={nextPost ?? null}
        />
      )}
      <CommentWidget />
    </Template>
  )
}

export default PostTemplate

export const queryMarkdownDataBySlug = graphql`
  query queryMarkdownDataBySlug($slug: String) {
    site {
      siteMetadata {
        title
        description
        siteUrl
      }
    }
    allMarkdownRemark(filter: { fields: { slug: { eq: $slug } } }) {
      edges {
        node {
          html
          wordCount {
            words
          }
          fields {
            slug
          }
          frontmatter {
            title
            summary
            date(formatString: "YYYY.MM.DD.")
            rawDate: date
            category
            thumbnail {
              childImageSharp {
                gatsbyImageData
              }
              publicURL
            }
          }
        }
      }
    }
  }
`
