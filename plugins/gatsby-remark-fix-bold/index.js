// remark-parse (micromark/CommonMark) fails to close ** when immediately
// followed by a Korean/CJK character without whitespace or punctuation.
// e.g. **OLTP(Online Transaction Processing)**는 → raw ** survives in HTML.
// This plugin rewrites only those broken patterns to <strong> before parsing.

const CJK_RE = /[가-힣ぁ-ヿ一-鿿]/

function fixBoldInLine(line) {
  const parts = []
  let i = 0

  while (i < line.length) {
    if (line[i] === '*' && line[i + 1] === '*' && line[i + 2] !== '*') {
      const open = i
      i += 2
      let close = -1
      while (i < line.length - 1) {
        if (line[i] === '*' && line[i + 1] === '*') {
          close = i
          break
        }
        i++
      }
      if (close !== -1) {
        const content = line.slice(open + 2, close)
        const after = line[close + 2] || ''
        if (CJK_RE.test(after)) {
          parts.push('<strong>' + content + '</strong>')
        } else {
          parts.push(line.slice(open, close + 2))
        }
        i = close + 2
      } else {
        parts.push(line.slice(open))
        break
      }
    } else {
      parts.push(line[i])
      i++
    }
  }

  return parts.join('')
}

exports.mutateSource = ({ markdownNode }) => {
  const lines = markdownNode.internal.content.split('\n')
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    lines[i] = fixBoldInLine(lines[i])
  }

  markdownNode.internal.content = lines.join('\n')
}
