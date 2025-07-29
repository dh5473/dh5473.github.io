import { SeriesInfo } from '../types/PostItem.types'

// 나중에 리팩토링

// 시리즈 메타데이터
export const seriesData: SeriesInfo[] = [
  {
    id: 'python-series',
    title: 'Python',
    description: 'Python 파헤치기',
    postCount: 4,
    color: '#3776ab',
  },
  {
    id: 'fastapi-series',
    title: 'FastAPI',
    description: 'FastAPI 파헤치기',
    postCount: 3,
    color: '#099889',
  },
]

// Python 시리즈에 속하는 포스트들의 slug 패턴
export const seriesPostPatterns = {
  'python-series': [
    '/python-series/reference-counting/',
    '/python-series/garbage-collection/',
    '/python-series/global-interpreter-lock/',
    '/python-series/synchronize-thread/',
  ],
  'fastapi-series': [
    '/fastapi-series/why-fastapi/',
    '/fastapi-series/how-to-structure-fastapi-projects/',
    '/fastapi-series/dependency-injection/',
  ],
}

// 포스트가 특정 시리즈에 속하는지 확인
export const isPostInSeries = (slug: string, seriesId: string): boolean => {
  const patterns =
    seriesPostPatterns[seriesId as keyof typeof seriesPostPatterns]
  return patterns ? patterns.includes(slug) : false
}

// 시리즈 ID로 시리즈 정보 가져오기
export const getSeriesById = (id: string): SeriesInfo | undefined => {
  return seriesData.find(series => series.id === id)
}

// 모든 시리즈 정보 가져오기
export const getAllSeries = (): SeriesInfo[] => {
  return seriesData
}
