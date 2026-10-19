const path = require('path')
const { createFilePath } = require('gatsby-source-filesystem')
const { collectQuizzes, toScopeSummary } = require('./src/utils/quizData')

// Setup Import Alias
exports.onCreateWebpackConfig = ({ getConfig, actions }) => {
  const output = getConfig().output || {}

  actions.setWebpackConfig({
    output,
    resolve: {
      alias: {
        components: path.resolve(__dirname, 'src/components'),
        utils: path.resolve(__dirname, 'src/utils'),
        hooks: path.resolve(__dirname, 'src/hooks'),
        styles: path.resolve(__dirname, 'src/styles'),
      },
    },
  })
}

// Generate a Slug Each Post Data
exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions

  if (node.internal.type === 'MarkdownRemark') {
    const slug = createFilePath({ node, getNode })

    createNodeField({
      node,
      name: 'slug',
      value: slug,
    })
  }
}

// 메인 홈에 퀴즈 진입점을 두려면 index.tsx도 범위 요약을 알아야 한다.
// 정적 페이지라 pageContext가 없으므로 여기서 다시 만들어 붙인다.
exports.onCreatePage = ({ page, actions }) => {
  const { createPage, deletePage } = actions

  if (page.path !== '/') return

  const scopes = collectQuizzes().map(toScopeSummary)

  deletePage(page)
  createPage({
    ...page,
    context: {
      ...page.context,
      quizScopes: scopes,
      quizTotal: scopes.reduce((sum, s) => sum + s.questionCount, 0),
    },
  })
}

// Define optional frontmatter fields for backward compatibility
exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  createTypes(`
    type MarkdownRemarkFrontmatter {
      keywords: [String]
      dateModified: Date @dateformat
    }
  `)
}

// Generate Post Page Through Markdown Data
exports.createPages = async ({ actions, graphql, reporter }) => {
  const { createPage } = actions

  // Get All Markdown Data For Paging
  const queryAllMarkdownData = await graphql(`
    {
      allMarkdownRemark(
        sort: [{ frontmatter: { date: DESC } }, { frontmatter: { title: ASC } }]
      ) {
        edges {
          node {
            fields {
              slug
            }
            frontmatter {
              title
              series
              seriesOrder
            }
          }
        }
      }
    }
  `)

  // Handling Graphql Query Error
  if (queryAllMarkdownData.errors) {
    reporter.panicOnBuild('Error while running GraphQL query.')
    return
  }

  // Import Post Template Component
  const PostTemplateComponent = path.resolve(
    __dirname,
    'src/templates/PostTemplate.tsx',
  )

  // Build series map: seriesId -> sorted array of { slug, title, seriesOrder }
  const edges = queryAllMarkdownData.data.allMarkdownRemark.edges
  const seriesMap = {}
  edges.forEach(({ node }) => {
    const { series, seriesOrder, title } = node.frontmatter
    if (series && seriesOrder != null) {
      if (!seriesMap[series]) seriesMap[series] = []
      seriesMap[series].push({ slug: node.fields.slug, title, seriesOrder })
    }
  })
  Object.values(seriesMap).forEach(arr =>
    arr.sort((a, b) => a.seriesOrder - b.seriesOrder),
  )

  // ── 퀴즈 ────────────────────────────────────────────────────────────
  // contents/**/quiz.json을 모아 범위별 세션 페이지와 list 페이지를 만든다.
  const quizScopeData = collectQuizzes()
  const quizSummaries = quizScopeData.map(toScopeSummary)
  const quizTotal = quizSummaries.reduce((sum, s) => sum + s.questionCount, 0)

  // 글 하단 진입점용: 글 slug -> 그 글이 속한 범위
  const quizByPostSlug = {}
  quizScopeData.forEach(scope => {
    scope.posts.forEach(post => {
      quizByPostSlug[post.slug] = {
        scopeId: scope.id,
        scopeTitle: scope.title,
        scopeQuestionCount: scope.questionCount,
        postQuestionCount: post.questions.length,
      }
    })
  })

  if (quizSummaries.length > 0) {
    createPage({
      path: '/quiz/',
      component: path.resolve(__dirname, 'src/templates/QuizHubTemplate.tsx'),
      context: { scopes: quizSummaries, total: quizTotal },
    })

    quizScopeData.forEach(scope => {
      const summary = toScopeSummary(scope)

      createPage({
        path: `/quiz/${scope.id}/`,
        component: path.resolve(
          __dirname,
          'src/templates/QuizSessionTemplate.tsx',
        ),
        context: { scope: summary, questions: scope.questions },
      })

      createPage({
        path: `/quiz/${scope.id}/list/`,
        component: path.resolve(
          __dirname,
          'src/templates/QuizListTemplate.tsx',
        ),
        context: { scope: summary, posts: scope.posts },
      })
    })

    reporter.info(
      `[quiz] ${quizSummaries.length}개 범위, ${quizTotal}문항으로 페이지 생성`,
    )
  }

  // Page Generating Function
  const generatePostPage = ({
    node: {
      fields: { slug },
      frontmatter: { series, seriesOrder },
    },
  }) => {
    let seriesContext = {}
    if (series && seriesOrder != null && seriesMap[series]) {
      const arr = seriesMap[series]
      const idx = arr.findIndex(p => p.slug === slug)
      const total = arr.length
      seriesContext = {
        seriesId: series,
        seriesCurrentOrder: seriesOrder,
        seriesTotal: total,
        seriesPosts: arr.map(p => ({ slug: p.slug, title: p.title, seriesOrder: p.seriesOrder })),
        prevPost: idx > 0 ? { slug: arr[idx - 1].slug, title: arr[idx - 1].title } : null,
        nextPost: idx < total - 1 ? { slug: arr[idx + 1].slug, title: arr[idx + 1].title } : null,
      }
    }

    createPage({
      path: slug,
      component: PostTemplateComponent,
      context: { slug, ...seriesContext, quiz: quizByPostSlug[slug] ?? null },
    })
  }

  // Generate Post Page And Passing Slug Props For Query
  edges.forEach(generatePostPage)

  // ── 시리즈 허브 ─────────────────────────────────────────────────────
  // 홈의 ?series= 필터는 canonical이 /로 합쳐져 Google에게 시리즈 목록 페이지가
  // 없었다. 시리즈마다 정적 URL을 하나씩 둔다
  Object.keys(seriesMap).forEach(seriesId => {
    createPage({
      path: `/series/${seriesId}/`,
      component: path.resolve(__dirname, 'src/templates/SeriesTemplate.tsx'),
      context: { seriesId },
    })
  })
}

// ── 옮긴 글의 옛 주소 ────────────────────────────────────────────────
// GitHub Pages는 서버 리다이렉트가 없어서, 폴더를 옮긴 글의 옛 주소에
// 새 주소로 넘기는 HTML을 남긴다. Google은 지연 0초 meta refresh를
// 영구 리다이렉트로 취급한다. 발행한 글의 폴더를 옮기면 여기에 추가한다
const LEGACY_REDIRECTS = {
  '/python-series/garbage-collection/': '/python/garbage-collection/',
  '/python-series/global-interpreter-lock/': '/python/global-interpreter-lock/',
  '/python-series/reference-counting/': '/python/reference-counting/',
  '/python-series/synchronize-thread/': '/python/synchronize-thread/',
  '/fastapi-series/dependency-injection/': '/fastapi/dependency-injection/',
  '/fastapi-series/dependency-injector/': '/fastapi/dependency-injector/',
  '/fastapi-series/how-to-structure-fastapi-projects/':
    '/fastapi/how-to-structure-fastapi-projects/',
  '/fastapi-series/why-fastapi/': '/fastapi/why-fastapi/',
  '/ml-foundations/ml-overview/': '/ml/overview/',
  '/ml-foundations/ml-workflow/': '/ml/workflow/',
  '/test-time-scaling/': '/llm/test-time-scaling/',
  '/gpt-5-1/': '/issue/gpt-5-1/',
}

exports.onPostBuild = async ({ graphql, reporter }) => {
  const fs = require('fs')

  const {
    data: { site, allSitePage },
  } = await graphql(`
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
    }
  `)
  const baseUrl = site.siteMetadata.siteUrl.replace(/\/$/, '')
  const livePaths = new Set(allSitePage.nodes.map(n => n.path))

  Object.entries(LEGACY_REDIRECTS).forEach(([from, to]) => {
    if (!livePaths.has(to)) {
      reporter.panicOnBuild(`[redirect] ${from} -> ${to}: 대상 페이지가 없다`)
      return
    }
    if (livePaths.has(from)) {
      reporter.panicOnBuild(`[redirect] ${from}: 실제 페이지와 겹친다`)
      return
    }

    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>페이지를 옮겼습니다</title>
<link rel="canonical" href="${baseUrl}${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.hash)</script>
</head>
<body><p><a href="${to}">새 주소로 이동합니다</a></p></body>
</html>
`
    const dir = path.join(__dirname, 'public', from)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), html)
  })

  reporter.info(
    `[redirect] 옛 주소 ${Object.keys(LEGACY_REDIRECTS).length}개에 리다이렉트를 남겼다`,
  )
}
