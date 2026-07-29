/**
 * Assign GitHub-style ids to headings.
 *
 * gatsby-transformer-remark does not add heading ids on its own, so
 * `/postgres/mvcc-visibility/#가시성-판정-규칙` 같은 딥링크가 동작하지 않는다.
 * 퀴즈의 "이 내용 다시 읽기" 링크가 이 id에 의존한다.
 *
 * mdast-util-to-hast가 node.data.hProperties를 읽어 속성으로 옮기므로
 * 마크업이나 스타일은 그대로 두고 id만 붙는다.
 */

// 헤딩 텍스트 추출. inlineCode, strong 같은 인라인 노드를 모두 평탄화한다
function textOf(node) {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (node.children) return node.children.map(textOf).join('')
  return ''
}

// GitHub과 같은 규칙: 소문자화, 문자·숫자·공백·하이픈·언더스코어만 남기고, 공백은 하이픈으로
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

module.exports = ({ markdownAST }) => {
  const used = new Map()

  const visit = node => {
    if (node.type === 'heading') {
      const base = slugify(textOf(node))

      if (base) {
        // 같은 제목이 두 번 나오면 GitHub처럼 -1, -2를 붙인다
        const seen = used.get(base) ?? 0
        used.set(base, seen + 1)
        const id = seen === 0 ? base : `${base}-${seen}`

        node.data = node.data || {}
        node.data.id = id
        node.data.hProperties = { ...(node.data.hProperties || {}), id }
      }
    }

    if (node.children) node.children.forEach(visit)
  }

  visit(markdownAST)

  return markdownAST
}
