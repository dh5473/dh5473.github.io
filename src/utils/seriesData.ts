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
    description: '구조화, DI, 인증, 배포까지',
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
  'stats-probability': {
    title: '확률과 정보이론',
    description: '확률 공리부터 정보이론까지, ML/DL의 수학적 기반',
    color: '#6366f1',
  },
}
