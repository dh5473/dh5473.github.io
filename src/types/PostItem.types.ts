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

export type SeriesNavPost = {
  slug: string
  title: string
}

export type SeriesIndexPost = {
  slug: string
  title: string
  seriesOrder: number
}

export type PostSeriesIndexProps = {
  seriesTitle: string
  seriesColor?: string
  currentOrder: number
  posts: SeriesIndexPost[]
}

export type PostSeriesNavProps = {
  seriesId: string
  seriesTitle: string
  seriesColor?: string
  currentOrder: number
  total: number
  prevPost: SeriesNavPost | null
  nextPost: SeriesNavPost | null
}
