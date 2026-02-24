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
    description: `Python, FastAPI, AI/ML 등 개발 기술을 다루는 Donhyeok의 기술 블로그`,
    author: `Donhyeok`,
    siteUrl: `https://dh5473.github.io/`,
  },
  plugins: [
    // Google Analytics 4
    {
      resolve: `gatsby-plugin-gtag`,
      options: {
        trackingId: `G-WSM9M8LZ1S`,
        head: false,
        anonymize: true,
      },
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
          formats: ['auto', 'webp', 'avif'],
          quality: 85,
          placeholder: 'blurred',
          backgroundColor: 'transparent',
          breakpoints: [750, 1080, 1366, 1920],
        },
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-image`,

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
              quality: 85,
              withWebp: true,
              withAvif: true,
              loading: 'lazy',
              linkImagesToOriginal: false,
              backgroundColor: 'transparent',
              disableBgImageOnAlpha: true,
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
              rel: 'noopener noreferrer',
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
    {
      resolve: 'gatsby-plugin-sitemap',
      options: {
        query: `
          {
            site {
              siteMetadata {
                siteUrl
              }
            }
            allSitePage {
              nodes {
                path
              }
            }
            allMarkdownRemark {
              nodes {
                fields {
                  slug
                }
                frontmatter {
                  date
                }
              }
            }
          }
        `,
        resolvePages: ({
          allSitePage: { nodes: allPages },
          allMarkdownRemark: { nodes: allPosts },
        }) => {
          const postDateMap = allPosts.reduce((acc, post) => {
            acc[post.fields.slug] = post.frontmatter.date
            return acc
          }, {})

          return allPages.map(page => ({
            ...page,
            lastmod: postDateMap[page.path] || null,
          }))
        },
        serialize: ({ path, lastmod }) => ({
          url: path,
          lastmod: lastmod || undefined,
          changefreq: path === '/' ? 'daily' : 'weekly',
          priority: path === '/' ? 1.0 : 0.7,
        }),
        excludes: ['/info/', '/404/', '/404.html', '/dev-404-page/'],
      },
    },

    // robots.txt
    {
      resolve: 'gatsby-plugin-robots-txt',
      options: {
        policy: [{ userAgent: '*', allow: '/' }],
      },
    },
  ],
}
