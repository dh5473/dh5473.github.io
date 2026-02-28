import { graphql } from 'gatsby'
import React, { FunctionComponent } from 'react'
import Template from 'components/Common/Template'
import PostHead from 'components/Post/PostHead'
import PostContent from 'components/Post/PostContent'
import CommentWidget from 'components/Post/CommentWidget'
import { IGatsbyImageData } from 'gatsby-plugin-image'

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
}

const PostTemplate: FunctionComponent<PostTemplateProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
    allMarkdownRemark: { edges },
  },
}) {
  const {
    node: {
      html,
      fields: { slug },
      frontmatter: { title, summary, date, rawDate, category, thumbnail },
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

  return (
    <Template
      title={`${title} | ${siteTitle}`}
      description={summary}
      url={pageUrl}
      image={absoluteImage}
      type="article"
      datePublished={rawDate}
      category={category}
    >
      <PostHead
        title={title}
        date={date}
        category={category}
        thumbnail={gatsbyImageData}
      />
      <PostContent html={html} />
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
