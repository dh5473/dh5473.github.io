const CALLOUT_TYPES = ['info', 'warning', 'tip', 'summary', 'note']
const CALLOUT_RE = /^:::(\w+)\s*$/

function getTextContent(node) {
  if (!node) return ''
  if (node.type === 'text') return node.value || ''
  if (node.type === 'html') return node.value || ''
  if (node.children) return node.children.map(getTextContent).join('')
  if (node.value) return node.value
  return ''
}

module.exports = ({ markdownAST }) => {
  const children = markdownAST.children
  let i = 0

  while (i < children.length) {
    const node = children[i]
    const text = getTextContent(node).trim()
    const match = text.match(CALLOUT_RE)

    if (match && CALLOUT_TYPES.includes(match[1])) {
      const type = match[1]

      // Find closing :::
      let j = i + 1
      while (j < children.length) {
        const closeText = getTextContent(children[j]).trim()
        if (closeText === ':::') break
        j++
      }

      if (j < children.length) {
        // Replace opening marker with HTML open tag
        children[i] = {
          type: 'html',
          value: `<div class="callout callout-${type}">`,
        }
        // Replace closing marker with HTML close tag
        children[j] = {
          type: 'html',
          value: '</div>',
        }
        i = j + 1
        continue
      }
    }

    i++
  }

  return markdownAST
}
