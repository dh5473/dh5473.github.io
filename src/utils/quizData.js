/**
 * contents/ 아래에 흩어진 quiz.json을 모아 범위별로 묶는다.
 *
 * 문항 추가가 "파일 하나 떨구는 것"으로 끝나야 하므로 등록 절차를 두지 않고
 * 글롭으로 수집한다. quiz-assets/*.svg는 여기서 문자열로 인라인해서
 * pageContext에 실어 보낸다. 빌드 타임 콘텐츠라 렌더링 시
 * dangerouslySetInnerHTML을 써도 안전하다.
 *
 * gatsby-node.js가 require하므로 CommonJS로 유지한다.
 */

const fs = require('fs')
const path = require('path')
const { quizScopes } = require('./quizScopes')

const CONTENTS_DIR = path.resolve(__dirname, '../../contents')

function readAsset(assetDir, name) {
  const file = path.join(assetDir, name)
  if (!fs.existsSync(file)) {
    throw new Error(`quiz asset not found: ${path.relative(CONTENTS_DIR, file)}`)
  }
  return fs.readFileSync(file, 'utf8').trim()
}

// 목록 페이지를 글 순서대로 보여주기 위해 frontmatter에서 두 값만 가볍게 긁는다
function readPostMeta(postDir) {
  const md = path.join(postDir, 'index.md')
  if (!fs.existsSync(md)) return { title: null, seriesOrder: Number.MAX_SAFE_INTEGER }

  const head = fs.readFileSync(md, 'utf8').slice(0, 3000)
  const title = head.match(/^title:\s*['"](.+)['"]\s*$/m)
  const order = head.match(/^seriesOrder:\s*(\d+)\s*$/m)

  return {
    title: title ? title[1] : null,
    seriesOrder: order ? Number(order[1]) : Number.MAX_SAFE_INTEGER,
  }
}

function collectScope(scope) {
  const scopeDir = path.join(CONTENTS_DIR, scope.dir)
  if (!fs.existsSync(scopeDir)) return { questions: [], posts: [] }

  const candidates = fs
    .readdirSync(scopeDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !scope.slugs || scope.slugs.includes(name))

  const posts = []

  candidates.forEach(slug => {
    const postDir = path.join(scopeDir, slug)
    const quizFile = path.join(postDir, 'quiz.json')
    if (!fs.existsSync(quizFile)) return

    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(quizFile, 'utf8'))
    } catch (e) {
      throw new Error(`quiz.json 파싱 실패: ${scope.dir}/${slug} (${e.message})`)
    }

    const assetDir = path.join(postDir, 'quiz-assets')
    const meta = readPostMeta(postDir)
    const defaultSlug = `/${scope.dir}/${slug}/`

    const questions = (parsed.questions || []).map(q => {
      const hydrated = {
        ...q,
        postSlug: q.postSlug || defaultSlug,
        postTitle: meta.title,
      }

      if (q.scenario && q.scenario.kind === 'svg') {
        hydrated.scenario = {
          ...q.scenario,
          svg: readAsset(assetDir, q.scenario.asset),
        }
      }
      if (q.explainAsset) {
        hydrated.explainSvg = readAsset(assetDir, q.explainAsset)
      }

      return hydrated
    })

    if (questions.length === 0) return

    posts.push({
      slug: defaultSlug,
      title: meta.title,
      seriesOrder: meta.seriesOrder,
      questions,
    })
  })

  posts.sort((a, b) => a.seriesOrder - b.seriesOrder)

  return { posts, questions: posts.flatMap(p => p.questions) }
}

function difficultySpread(questions) {
  return [1, 2, 3].map(
    level => questions.filter(q => q.difficulty === level).length,
  )
}

/**
 * 문항이 하나라도 있는 범위만 돌려준다.
 * 스코프는 미리 등록해두고 문항이 채워지면 자동으로 페이지가 생기는 구조다.
 */
function collectQuizzes() {
  return quizScopes
    .map(scope => {
      const { posts, questions } = collectScope(scope)
      return {
        ...scope,
        posts,
        questions,
        questionCount: questions.length,
        postCount: posts.length,
        difficultySpread: difficultySpread(questions),
      }
    })
    .filter(scope => scope.questionCount > 0)
}

/** 허브와 홈 진입점에 쓰는 요약. 문항 본문은 빼고 숫자만 담는다 */
function toScopeSummary(scope) {
  return {
    id: scope.id,
    title: scope.title,
    description: scope.description,
    series: scope.series,
    questionCount: scope.questionCount,
    postCount: scope.postCount,
    difficultySpread: scope.difficultySpread,
  }
}

module.exports = { collectQuizzes, toScopeSummary }
