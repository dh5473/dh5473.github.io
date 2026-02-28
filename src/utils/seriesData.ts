// Display metadata for series (title, description, color)
// Structural data (which posts belong to a series) is now in post frontmatter

export interface SeriesMetadata {
  title: string
  description: string
  color?: string
}

export const seriesMetadata: Record<string, SeriesMetadata> = {
  'python-series': {
    title: 'Python 내부 동작',
    description: 'GIL, 참조 카운팅, GC, 스레드 동기화',
    color: '#3776ab',
  },
  'fastapi-series': {
    title: 'FastAPI 실전 가이드',
    description: '구조화, DI, 인증, 배포까지',
    color: '#099889',
  },
  'async-mq-series': {
    title: 'Async & Message Queue',
    description: 'Pub/Sub, 메시지 브로커, Celery',
    color: '#d62728',
  },
  'python-tooling-series': {
    title: 'Python Tooling',
    description: 'uv, 패키지 매니저 비교',
    color: '#2ca02c',
  },
  'ml-foundations': {
    title: 'ML 기초',
    description: 'ML 개요, 프로젝트 워크플로우',
    color: '#ff7f0e',
  },
}
