/**
 * Configure your Gatsby site with this file.
 *
 * See: https://www.gatsbyjs.com/docs/reference/config-files/gatsby-config/
 */

/**
 * @type {import('gatsby').GatsbyConfig}
 */
module.exports = {
  siteMetadata: {
    title: `Donhyeok's Blog`,
    description: `Donhyeok's Blog`,
    author: `Donhyeok`,
    siteUrl: `https://dh5473.github.io/`,
  },
  plugins: [
    // TypeScript 지원
    {
      resolve: 'gatsby-plugin-typescript',
      options: {
        isTSX: true,
        allExtensions: true,
      },
    },

    // 기본 플러그인
    `gatsby-plugin-emotion`,
    `gatsby-plugin-react-helmet`,

    // 파일 시스템
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `contents`,
        path: `${__dirname}/contents`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/static`,
      },
    },

    // 이미지 처리
    {
      resolve: `gatsby-plugin-sharp`,
      options: {
        defaults: {
          formats: ['auto', 'webp'],
          quality: 100,
          placeholder: 'blurred',
        },
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-image`,
    `gatsby-plugin-sharp`,

    // 마크다운 변환
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          // 스마트 문장 부호
          {
            resolve: 'gatsby-remark-smartypants',
            options: {
              dashes: 'oldschool',
            },
          },

          // 코드 하이라이팅
          {
            resolve: 'gatsby-remark-prismjs',
            options: {
              classPrefix: 'language-',
            },
          },

          // 이미지 최적화
          {
            resolve: 'gatsby-remark-images',
            options: {
              maxWidth: 768,
              quality: 100,
              withWebp: true,
            },
          },

          // 파일 복사
          {
            resolve: 'gatsby-remark-copy-linked-files',
            options: {},
          },

          // 외부 링크
          {
            resolve: 'gatsby-remark-external-links',
            options: {
              target: '_blank',
              rel: 'nofollow',
            },
          },
        ],
      },
    },

    // Canonical URLs
    {
      resolve: 'gatsby-plugin-canonical-urls',
      options: {
        siteUrl: 'https://dh5473.github.io/',
        stripQueryString: true,
      },
    },

    // Sitemap
    'gatsby-plugin-sitemap',

    // robots.txt
    {
      resolve: 'gatsby-plugin-robots-txt',
      options: {
        policy: [{ userAgent: '*', allow: '/' }],
      },
    },
  ],
}
