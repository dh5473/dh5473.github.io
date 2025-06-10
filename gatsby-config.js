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
    // Google Analytics 4
    {
      resolve: `gatsby-plugin-google-gtag`,
      options: {
        trackingIds: [process.env.GATSBY_GA_TRACKING_ID],
        gtagConfig: {
          anonymize_ip: true,
        },
        pluginConfig: {
          head: true,
          respectDNT: true,
          exclude: ['/preview/**', '/do-not-track/me/too/'],
        },
      },
      // 환경변수가 없으면 플러그인 비활성화
      ...(process.env.GATSBY_GA_TRACKING_ID ? {} : { disable: true }),
    },

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
