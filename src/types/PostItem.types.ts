import { IGatsbyImageData } from 'gatsby-plugin-image'

export type PostFrontmatterType = {
  title: string
  date: string
  category: string
  summary: string
  thumbnail: {
    childImageSharp: {
      gatsbyImageData: IGatsbyImageData
    }
    publicURL: string
  } | null
  series?: string | null
  seriesOrder?: number | null
}

export type PostListItemType = {
  node: {
    id: string
    fields: {
      slug: string
    }
    frontmatter: PostFrontmatterType
  }
}

export type PostPageItemType = {
  node: {
    html: string
    frontmatter: PostFrontmatterType
  }
}

export interface SeriesInfo {
  id: string
  title: string
  description: string
  postCount: number
  color?: string
}
