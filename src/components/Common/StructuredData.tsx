import React, { FunctionComponent } from 'react'
import { Helmet } from 'react-helmet'

type StructuredDataProps = {
  type: 'website' | 'article'
  title: string
  description: string
  url: string
  image: string
  siteUrl: string
  author?: string
  datePublished?: string
  dateModified?: string
  category?: string
  wordCount?: number
  keywords?: string[]
  authorSocial?: { github: string }
  logo?: string
  /** Home과 현재 페이지 사이에 끼는 상위 페이지. 시리즈 허브처럼 실제로 있는 URL만 넣는다 */
  breadcrumbParent?: { name: string; url: string }
}

// gatsby-config.js의 siteMetadata.description과 같게 유지한다
const SITE_DESCRIPTION =
  '머신러닝·통계, LLM 서빙과 AI 에이전트, PostgreSQL·ClickHouse, Python·FastAPI를 동작 원리부터 설명하는 기술 블로그'

const StructuredData: FunctionComponent<StructuredDataProps> = function ({
  type,
  title,
  description,
  url,
  image,
  siteUrl,
  author = 'Donhyeok Kang',
  datePublished,
  dateModified,
  category,
  wordCount,
  keywords,
  authorSocial,
  logo,
  breadcrumbParent,
}) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  // <title>용 " | dontech" 꼬리를 떼야 headline과 빵부스러기에 글 제목만 남는다
  const pageName = title.replace(/\s\|\s[^|]+$/, '')

  const authorObject = {
    '@type': 'Person' as const,
    name: author,
    url: `${baseUrl}/`,
    ...(authorSocial
      ? {
          sameAs: [authorSocial.github].filter(Boolean),
        }
      : {}),
  }

  const publisherObject = {
    '@type': 'Organization' as const,
    name: 'dontech',
    url: `${baseUrl}/`,
    ...(logo
      ? {
          logo: {
            '@type': 'ImageObject' as const,
            url: `${baseUrl}${logo}`,
          },
        }
      : {}),
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'dontech',
    description: SITE_DESCRIPTION,
    url: `${baseUrl}/`,
    inLanguage: 'ko',
    author: authorObject,
    publisher: publisherObject,
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: pageName,
    description: description,
    image: image,
    url: url,
    inLanguage: 'ko',
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    author: authorObject,
    publisher: publisherObject,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    articleSection: category,
    isAccessibleForFree: true,
    ...(wordCount ? { wordCount } : {}),
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
  }

  // 예전에는 카테고리 단계를 /?category=로 넣었는데, 그 URL은 canonical이 /로
  // 합쳐져 Google에게는 없는 페이지였다
  const crumbs = [
    { name: 'Home', item: `${baseUrl}/` },
    ...(breadcrumbParent
      ? [{ name: breadcrumbParent.name, item: breadcrumbParent.url }]
      : []),
    { name: pageName, item: url },
  ]

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      ...crumb,
    })),
  }

  const isHome = url.replace(/\/$/, '') === baseUrl

  const schemas = [
    websiteSchema,
    ...(type === 'article' ? [articleSchema] : []),
    ...(isHome ? [] : [breadcrumbSchema]),
  ]

  return (
    <Helmet>
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  )
}

export default StructuredData
