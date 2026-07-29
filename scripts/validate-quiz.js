#!/usr/bin/env node
/**
 * quiz.json 검증기.
 *
 * 문항이 수백 개가 되면 수작업 점검이 불가능해진다. 빌드를 깨는 오류(error)와
 * 사람이 판단할 여지가 있는 경고(warn)를 나눠서 보고한다.
 *
 *   node scripts/validate-quiz.js            검증
 *   node scripts/validate-quiz.js --coverage 퀴즈가 없는 글까지 함께 출력
 */

const fs = require('fs')
const path = require('path')
const { quizScopes } = require('../src/utils/quizScopes')

const ROOT = path.resolve(__dirname, '..')
const CONTENTS = path.join(ROOT, 'contents')

const ID_PATTERN = /^[a-z0-9-]+-\d{2}$/
const DIFFICULTY_TARGET = [0.2, 0.5, 0.3]
const DIFFICULTY_TOLERANCE = 0.18
const MIN_SVG_FONT_SIZE = 14

const errors = []
const warns = []

const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warns.push(`${where}: ${message}`)

/** SQL 문 같은 코드 선택지. 세미콜론으로 끝나면 코드로 본다 */
function isCodeChoice(text) {
  return /;$/.test((text ?? '').trim())
}

/**
 * 문체 판정. 경어체(~니다)와 해라체(~다)를 한 파일 안에서 섞지 않기 위한 것이다.
 * 어느 쪽을 쓸지는 원문 글을 따른다. postgres는 경어체, ml과 stats는 해라체다.
 */
function registerOf(text) {
  const trimmed = (text ?? '').trim().replace(/[.?!]$/, '')
  if (/니다$/.test(trimmed)) return 'polite'
  if (/다$/.test(trimmed)) return 'plain'
  return null
}

// gatsby-remark-heading-ids와 같은 규칙이어야 한다
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

function headingIds(markdown) {
  const ids = []
  let inFence = false

  markdown.split('\n').forEach(line => {
    if (/^```/.test(line)) inFence = !inFence
    if (inFence) return
    const match = line.match(/^#{1,6}\s+(.*)$/)
    if (match) ids.push(slugify(match[1].replace(/`/g, '')))
  })

  return ids
}

function checkSvg(where, file) {
  const svg = fs.readFileSync(file, 'utf8')

  if (/<svg[^>]*\s(width|height)=/.test(svg)) {
    fail(where, 'svg 루트에 width/height 속성이 있습니다. viewBox와 style을 쓰세요')
  }
  if (!/viewBox=/.test(svg)) {
    fail(where, 'viewBox가 없습니다')
  }

  // <svg> 안의 빈 줄은 마크다운에 인라인될 때 그림을 통째로 날린다
  const inner = svg.slice(svg.indexOf('<svg'), svg.lastIndexOf('</svg>'))
  if (/\n[ \t]*\n/.test(inner)) {
    fail(where, '<svg> 안에 빈 줄이 있습니다')
  }

  const viewBox = svg.match(/viewBox="0 0 ([\d.]+)/)
  const width = viewBox ? Number(viewBox[1]) : null

  const sizes = [...svg.matchAll(/font-size[:=]\s*"?([\d.]+)/g)].map(m =>
    Number(m[1]),
  )
  const smallest = sizes.length ? Math.min(...sizes) : null

  if (width && smallest != null && smallest < MIN_SVG_FONT_SIZE * (width / 360)) {
    warn(
      where,
      `font-size 최소값 ${smallest}는 viewBox ${width} 기준으로 모바일에서 12px 미만입니다`,
    )
  }
}

function checkQuestion(where, question, seen, postDir, assetDir) {
  const id = question.id
  const at = `${where} ${id ?? '(id 없음)'}`

  if (!id) {
    fail(where, 'id가 없습니다')
  } else if (!ID_PATTERN.test(id)) {
    fail(at, 'id 형식이 {post-slug}-{2자리}가 아닙니다')
  } else if (seen.has(id)) {
    fail(at, 'id가 중복됩니다')
  } else {
    seen.add(id)
  }

  const choices = question.choices ?? []
  const correct = choices.filter(choice => choice.correct)

  if (choices.length < 2) fail(at, '선택지가 2개 미만입니다')

  if (question.type === 'single' || question.type === 'ox') {
    if (correct.length !== 1) {
      fail(at, `${question.type} 문항의 정답이 ${correct.length}개입니다`)
    }
  } else if (question.type === 'multi') {
    if (correct.length < 2) fail(at, 'multi 문항의 정답이 2개 미만입니다')
    if (correct.length === choices.length) fail(at, 'multi 문항의 모든 선택지가 정답입니다')
  } else {
    fail(at, `알 수 없는 type: ${question.type}`)
  }

  choices.forEach((choice, i) => {
    if (!choice.why || !choice.why.trim()) {
      fail(at, `${i + 1}번 선택지에 why가 없습니다`)
    }
    // 코드 선택지는 세미콜론이 종결 부호 역할을 하므로 마침표를 요구하지 않는다
    if (!isCodeChoice(choice.text) && !/[.?!]$/.test((choice.text ?? '').trim())) {
      fail(at, `${i + 1}번 선택지가 마침표로 끝나지 않습니다`)
    }
  })

  if (![1, 2, 3].includes(question.difficulty)) {
    fail(at, `difficulty가 1~3이 아닙니다: ${question.difficulty}`)
  }
  if (!['post', 'extended'].includes(question.source)) {
    fail(at, `source가 post 또는 extended가 아닙니다: ${question.source}`)
  }
  if (!question.explanation || !question.explanation.trim()) {
    fail(at, 'explanation이 없습니다')
  }

  // 정답이 유독 길면 길이만 보고 찍을 수 있다
  if (correct.length === 1 && choices.length > 2) {
    const others = choices.filter(choice => !choice.correct)
    const longest = Math.max(...others.map(choice => choice.text.length))
    if (correct[0].text.length > longest * 1.6) {
      warn(at, '정답 선택지가 다른 선택지보다 60% 이상 깁니다')
    }
  }

  const emDash = [question.question, question.explanation]
    .concat(choices.flatMap(choice => [choice.text, choice.why]))
    .some(text => typeof text === 'string' && text.includes('—'))
  if (emDash) fail(at, 'em dash가 쓰였습니다')

  // 에셋
  const assets = []
  if (question.scenario?.kind === 'svg') {
    if (!question.scenario.asset) fail(at, 'scenario.kind가 svg인데 asset이 없습니다')
    else assets.push(question.scenario.asset)
  }
  if (question.explainAsset) assets.push(question.explainAsset)

  assets.forEach(name => {
    const file = path.join(assetDir, name)
    if (!fs.existsSync(file)) {
      fail(at, `에셋이 없습니다: quiz-assets/${name}`)
      return
    }
    checkSvg(`${at} ${name}`, file)
  })

  // 원문 링크와 anchor
  const postSlug = question.postSlug
  if (!postSlug) {
    fail(at, 'postSlug가 없습니다')
    return
  }

  const targetDir = path.join(CONTENTS, postSlug.replace(/^\/|\/$/g, ''))
  const targetMd = path.join(targetDir, 'index.md')
  if (!fs.existsSync(targetMd)) {
    fail(at, `postSlug가 가리키는 글이 없습니다: ${postSlug}`)
    return
  }

  if (question.anchor) {
    const anchor = question.anchor.replace(/^#/, '')
    const ids = headingIds(fs.readFileSync(targetMd, 'utf8'))
    if (!ids.includes(anchor)) {
      fail(at, `anchor에 해당하는 헤딩이 없습니다: #${anchor}`)
    }
  }

  void postDir
}

function run() {
  const seen = new Set()
  const allQuestions = []
  const covered = new Set()
  const scopeStats = []

  quizScopes.forEach(scope => {
    const scopeDir = path.join(CONTENTS, scope.dir)
    if (!fs.existsSync(scopeDir)) {
      warn(`scope ${scope.id}`, `contents/${scope.dir}/ 가 없습니다`)
      return
    }

    const slugs = fs
      .readdirSync(scopeDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !scope.slugs || scope.slugs.includes(name))

    if (scope.slugs) {
      scope.slugs
        .filter(slug => !slugs.includes(slug))
        .forEach(slug =>
          fail(`scope ${scope.id}`, `등록된 slug가 없습니다: ${scope.dir}/${slug}`),
        )
    }

    const scopeQuestions = []

    slugs.forEach(slug => {
      const postDir = path.join(scopeDir, slug)
      const quizFile = path.join(postDir, 'quiz.json')
      if (!fs.existsSync(quizFile)) return

      covered.add(`${scope.dir}/${slug}`)

      let parsed
      try {
        parsed = JSON.parse(fs.readFileSync(quizFile, 'utf8'))
      } catch (e) {
        fail(`${scope.dir}/${slug}/quiz.json`, `JSON 파싱 실패 (${e.message})`)
        return
      }

      const where = `${scope.dir}/${slug}`
      const assetDir = path.join(postDir, 'quiz-assets')
      ;(parsed.questions ?? []).forEach(question => {
        checkQuestion(where, question, seen, postDir, assetDir)
        scopeQuestions.push(question)
        allQuestions.push(question)
      })

      // 한 파일 안에서 선택지 문체가 섞이지 않아야 한다
      const registers = new Set(
        (parsed.questions ?? [])
          .flatMap(question => question.choices ?? [])
          .filter(choice => !isCodeChoice(choice.text))
          .map(choice => registerOf(choice.text))
          .filter(Boolean),
      )
      if (registers.size > 1) {
        fail(where, '선택지에 경어체와 해라체가 섞여 있습니다')
      }
    })

    if (scopeQuestions.length > 0) {
      scopeStats.push({ scope, questions: scopeQuestions })
    }

    /*
     * 세션은 선택지를 섞지만 전체 문항 페이지는 파일 순서를 그대로 보여준다.
     * 정답이 늘 같은 자리에 있으면 그 페이지에서 위치가 답을 알려준다.
     */
    const singles = scopeQuestions.filter(q => q.type !== 'multi')
    if (singles.length >= 5) {
      const positions = new Map()
      singles.forEach(q => {
        const index = (q.choices ?? []).findIndex(choice => choice.correct)
        positions.set(index, (positions.get(index) ?? 0) + 1)
      })
      const [topIndex, topCount] = [...positions.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]
      if (topCount / singles.length > 0.5) {
        warn(
          `scope ${scope.id}`,
          `정답이 ${topIndex + 1}번에 몰려 있습니다 (${topCount}/${singles.length})`,
        )
      }
    }
  })

  // 체인 무결성
  const chains = new Map()
  allQuestions.forEach(question => {
    if (!question.chain) return
    if (!chains.has(question.chain.id)) chains.set(question.chain.id, [])
    chains.get(question.chain.id).push(question)
  })
  chains.forEach((members, chainId) => {
    if (members.length < 2) {
      warn(`chain ${chainId}`, '체인에 문항이 하나뿐입니다')
    }
    const orders = members.map(m => m.chain.order).sort((a, b) => a - b)
    const expected = orders.map((_, i) => i + 1)
    if (orders.join(',') !== expected.join(',')) {
      fail(`chain ${chainId}`, `order가 1부터 연속이 아닙니다: ${orders.join(',')}`)
    }
  })

  // 난이도 분포
  scopeStats.forEach(({ scope, questions }) => {
    const total = questions.length
    const spread = [1, 2, 3].map(
      level => questions.filter(q => q.difficulty === level).length / total,
    )
    spread.forEach((ratio, i) => {
      if (Math.abs(ratio - DIFFICULTY_TARGET[i]) > DIFFICULTY_TOLERANCE) {
        warn(
          `scope ${scope.id}`,
          `난이도 ${i + 1} 비중이 ${(ratio * 100).toFixed(0)}%로 목표 ${
            DIFFICULTY_TARGET[i] * 100
          }%에서 벗어납니다`,
        )
      }
    })

    const extended =
      questions.filter(q => q.source === 'extended').length / total
    if (extended > 0.3) {
      warn(
        `scope ${scope.id}`,
        `확장 문항 비중이 ${(extended * 100).toFixed(0)}%로 상한 30%를 넘습니다`,
      )
    }
  })

  // 리포트
  console.log(`\n문항 ${allQuestions.length}개, 범위 ${scopeStats.length}개 검사`)
  scopeStats.forEach(({ scope, questions }) => {
    const spread = [1, 2, 3].map(
      level => questions.filter(q => q.difficulty === level).length,
    )
    console.log(
      `  ${scope.id.padEnd(18)} ${String(questions.length).padStart(3)}문항  난이도 ${spread.join('/')}`,
    )
  })

  if (process.argv.includes('--coverage')) {
    console.log('\n퀴즈가 없는 글')
    quizScopes.forEach(scope => {
      const scopeDir = path.join(CONTENTS, scope.dir)
      if (!fs.existsSync(scopeDir)) return
      fs.readdirSync(scopeDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !scope.slugs || scope.slugs.includes(name))
        .filter(name => !covered.has(`${scope.dir}/${name}`))
        .forEach(name => console.log(`  ${scope.dir}/${name}`))
    })
  }

  if (warns.length > 0) {
    console.log(`\n경고 ${warns.length}건`)
    warns.forEach(message => console.log(`  ! ${message}`))
  }

  if (errors.length > 0) {
    console.log(`\n오류 ${errors.length}건`)
    errors.forEach(message => console.log(`  x ${message}`))
    process.exit(1)
  }

  console.log('\n오류 없음\n')
}

run()
