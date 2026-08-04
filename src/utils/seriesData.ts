// Display metadata for series (title, description, color)
// Structural data (which posts belong to a series) is now in post frontmatter

export interface SeriesMetadata {
  title: string
  description: string
  color?: string
}

export const seriesMetadata: Record<string, SeriesMetadata> = {
  'python': {
    title: 'Python',
    description: 'GIL, 참조 카운팅, GC, 스레드 동기화',
    color: '#3776ab',
  },
  'fastapi': {
    title: 'FastAPI',
    description: '구조화, DI, Pydantic, Lifespan까지',
    color: '#099889',
  },
  'ml': {
    title: 'ML 기초',
    description: '회귀, 분류, 앙상블, 클러스터링까지 머신러닝의 핵심 알고리즘',
    color: '#ff7f0e',
  },
  'llm': {
    title: 'LLM',
    description: 'LLM 아키텍처, 추론, 파인튜닝',
    color: '#7c3aed',
  },
  'stats': {
    title: '확률과 통계',
    description: '확률론부터 통계적 추론과 응용 통계까지, ML/DL의 수학적 기반',
    color: '#6366f1',
  },
  'airflow': {
    title: 'Airflow',
    description: '데이터 파이프라인 운영에서 쌓은 Airflow 실전 경험',
    color: '#017cee',
  },
  'postgres': {
    title: 'PostgreSQL',
    description: '내부 구조부터 실전 DBA까지, 쿼리가 느린 이유를 원리로 설명',
    color: '#336791',
  },
  'clickhouse': {
    title: 'ClickHouse',
    description: '컬럼 지향 OLAP 엔진의 설계 원리부터 실전 운영까지',
    color: '#FFCC00',
  },
  'agent': {
    title: 'AI Agent',
    description: '에이전트 아키텍처와 설계 패턴',
    color: '#f97316',
  },
  'llm-serving': {
    title: 'LLM Serving',
    description: 'vLLM의 동작 원리로부터 이해하는 LLM 서빙과 추론 최적화',
    color: '#0ea5e9',
  },
}

const INK_LIGHT = '#ffffff'
const INK_DARK = '#14100e'

/** sRGB 상대 휘도. hex가 아니면 NaN. */
function relativeLuminance(color: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return NaN
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 시리즈 브랜드색 위에 얹을 글자색.
 *
 * 브랜드색은 밝기가 제각각이라(ClickHouse #FFCC00부터 PostgreSQL #336791까지)
 * 잉크를 하나로 고정하면 한쪽은 반드시 깨진다. 흰 글자로 고정했을 때
 * ClickHouse는 1.51:1, LLM Serving은 2.77:1이었다. 대비가 큰 쪽을 고른다.
 * 토큰 참조처럼 hex가 아닌 값이 오면 테마가 알아서 뒤집는 --on-fill에 맡긴다.
 */
export function inkOn(background: string): string {
  const bg = relativeLuminance(background)
  if (Number.isNaN(bg)) return 'var(--on-fill)'
  const contrast = (a: number, b: number) =>
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return contrast(1, bg) >= contrast(relativeLuminance(INK_DARK), bg)
    ? INK_LIGHT
    : INK_DARK
}
