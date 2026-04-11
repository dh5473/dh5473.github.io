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
  'stats': {
    title: '확률과 통계',
    description: '확률론, 통계적 추론, 응용 통계 — ML/DL의 수학적 기반',
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
}
