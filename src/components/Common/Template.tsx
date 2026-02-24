import React, { FunctionComponent, ReactNode } from 'react'
import styled from '@emotion/styled'
import GlobalStyle from 'components/Common/GlobalStyle'
import Footer from 'components/Common/Footer'
import StructuredData from 'components/Common/StructuredData'
import { Helmet } from 'react-helmet'

type TemplateProps = {
  title: string
  description: string
  url: string
  image: string
  children: ReactNode
  type?: 'website' | 'article'
  author?: string
  datePublished?: string
  dateModified?: string
  category?: string
}

const Container = styled.main`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`

const Template: FunctionComponent<TemplateProps> = function ({
  title,
  description,
  url,
  image,
  children,
  type = 'website',
  author = 'Donhyeok',
  datePublished,
  dateModified,
  category,
}) {
  return (
    <Container>
      <Helmet>
        <title>{title}</title>

        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html;charset=UTF-8" />

        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />

        <meta property="og:type" content={type} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:url" content={url} />
        <meta property="og:site_name" content="Donhyeok's Blog" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <meta name="twitter:image:alt" content={title} />
        <meta name="twitter:site" content="@dh5473" />
        <meta name="twitter:creator" content="@dh5473" />

        <meta
          name="google-site-verification"
          content="6XVBzencr6SkW_qtNsc8pZrsOARNn4-tPhVcPC9Vy0I"
        />
        <meta
          name="naver-site-verification"
          content="7ba00a2f54b28fc732e03fe4b645be26d4e5f4ed"
        />
      </Helmet>

      <StructuredData
        type={type}
        title={title}
        description={description}
        url={url}
        image={image}
        author={author}
        datePublished={datePublished}
        dateModified={dateModified}
        category={category}
      />

      <GlobalStyle />
      {children}
      <Footer />
    </Container>
  )
}

export default Template
