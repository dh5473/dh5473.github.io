const path = require('path')
const { createFilePath } = require('gatsby-source-filesystem')

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
      context: { slug, ...seriesContext },
    })
  }

  // Generate Post Page And Passing Slug Props For Query
  edges.forEach(generatePostPage)
}
