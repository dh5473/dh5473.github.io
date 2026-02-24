import React, { FunctionComponent } from 'react'
import { Helmet } from 'react-helmet'

type StructuredDataProps = {
  type: 'website' | 'article'
  title: string
  description: string
  url: string
  image: string
  author?: string
  datePublished?: string
  dateModified?: string
  category?: string
}

const StructuredData: FunctionComponent<StructuredDataProps> = function ({
  type,
  title,
  description,
  url,
  image,
  author = 'Donhyeok',
  datePublished,
  dateModified,
  category,
}) {
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: "Donhyeok's Blog",
    description: 'Python, FastAPI, AI/ML 등 개발 기술을 다루는 Donhyeok의 기술 블로그',
    url: 'https://dh5473.github.io/',
    author: {
      '@type': 'Person',
      name: 'Donhyeok',
    },
    publisher: {
      '@type': 'Person',
      name: 'Donhyeok',
    },
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    image: image,
    url: url,
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    author: {
      '@type': 'Person',
      name: author,
    },
    publisher: {
      '@type': 'Person',
      name: author,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    articleSection: category,
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://dh5473.github.io/',
      },
      ...(type === 'article' && category
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: category,
              item: `https://dh5473.github.io/?category=${category}`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: title,
              item: url,
            },
          ]
        : []),
    ],
  }

  const schemas = [
    websiteSchema,
    ...(type === 'article' ? [articleSchema, breadcrumbSchema] : []),
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
