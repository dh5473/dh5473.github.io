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
    description: 'ML 개요, 프로젝트 워크플로우',
    color: '#ff7f0e',
  },
  'llm': {
    title: 'LLM',
    description: 'LLM 아키텍처, 추론, 파인튜닝',
    color: '#7c3aed',
  },
}
