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
        author: string
        authorSocial: {
          github: string
        }
        logo: string
        ogDefaultImage: {
          width: number
          height: number
        }
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
            series: string | null
            keywords: string[] | null
            dateModified: string | null
            thumbnail: {
              childImageSharp: {
                gatsbyImageData: IGatsbyImageData
                resize: {
                  width: number
                  height: number
                } | null
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
      siteMetadata: { title: siteTitle, siteUrl, author, authorSocial, logo, ogDefaultImage },
    },
    allMarkdownRemark: { edges },
  },
  pageContext: { seriesId, seriesCurrentOrder, seriesTotal, seriesPosts, prevPost, nextPost },
}) {
  const {
    node: {
      html,
      fields: { slug },
      frontmatter: {
        title, summary, date, rawDate, category, series,
        keywords: frontmatterKeywords, dateModified: frontmatterDateModified,
        thumbnail,
      },
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

  const derivedKeywords: string[] =
    frontmatterKeywords && frontmatterKeywords.length > 0
      ? frontmatterKeywords
      : [category, series].filter(Boolean) as string[]
  const resolvedDateModified = frontmatterDateModified || rawDate
  const ogImageWidth = thumbnail?.childImageSharp?.resize?.width ?? ogDefaultImage.width
  const ogImageHeight = thumbnail?.childImageSharp?.resize?.height ?? ogDefaultImage.height

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
      author={author}
      datePublished={rawDate}
      dateModified={resolvedDateModified}
      category={category}
      wordCount={words}
      keywords={derivedKeywords}
      ogImageWidth={ogImageWidth}
      ogImageHeight={ogImageHeight}
      authorSocial={authorSocial}
      logo={logo}
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
        author
        authorSocial {
          github
        }
        logo
        ogDefaultImage {
          width
          height
        }
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
            series
            keywords
            dateModified
            thumbnail {
              childImageSharp {
                gatsbyImageData
                resize(width: 1200) {
                  width
                  height
                }
              }
              publicURL
            }
          }
        }
      }
    }
  }
`
