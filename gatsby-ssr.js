/**
 * Implement Gatsby's SSR (Server Side Rendering) APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/reference/config-files/gatsby-ssr/
 */

const React = require('react')

/**
 * @type {import('gatsby').GatsbySSR['onRenderBody']}
 */
exports.onRenderBody = ({ setHtmlAttributes, setHeadComponents }) => {
  setHtmlAttributes({ lang: `ko` })

  setHeadComponents([
    React.createElement('link', {
      key: 'preconnect-cdn',
      rel: 'preconnect',
      href: 'https://cdn.jsdelivr.net',
      crossOrigin: 'anonymous',
    }),
    React.createElement('link', {
      key: 'preconnect-gfonts',
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com',
    }),
    React.createElement('link', {
      key: 'preconnect-gstatic',
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossOrigin: 'anonymous',
    }),
    // Pretendard: preload + async load to avoid render-blocking
    React.createElement('link', {
      key: 'preload-pretendard',
      rel: 'preload',
      as: 'style',
      href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
    }),
    React.createElement('link', {
      key: 'font-pretendard',
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
      media: 'print',
      onLoad: "this.media='all'",
    }),
    // JetBrains Mono: preload + async load
    React.createElement('link', {
      key: 'preload-jetbrains',
      rel: 'preload',
      as: 'style',
      href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
    }),
    React.createElement('link', {
      key: 'font-jetbrains',
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
      media: 'print',
      onLoad: "this.media='all'",
    }),
    // Fallback for no-JS: load fonts normally
    React.createElement('noscript', { key: 'font-fallback' },
      React.createElement('link', {
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
      }),
      React.createElement('link', {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
      }),
    ),
    // Dark mode flash prevention — runs synchronously before paint
    React.createElement('script', {
      key: 'theme-init',
      src: '/theme-init.js',
    }),
  ])
}
