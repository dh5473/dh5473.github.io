export type SectionId =
  | 'all'
  | 'cs-fundamentals'
  | 'languages-frameworks'
  | 'data-ai'
  | 'architecture'
  | 'infrastructure'

export const sections: Array<{
  id: SectionId
  name: string
  categories: string[]
}> = [
  {
    id: 'cs-fundamentals',
    name: 'CS Fundamentals',
    categories: ['Operating Systems', 'Data Structures', 'Networking', 'Database'],
  },
  {
    id: 'languages-frameworks',
    name: 'Languages & Frameworks',
    categories: ['Python', 'FastAPI', 'TypeScript', 'Next.js'],
  },
  {
    id: 'data-ai',
    name: 'Data & AI',
    categories: ['Machine Learning', 'Deep Learning', 'LLM'],
  },
  {
    id: 'architecture',
    name: 'Architecture',
    categories: ['System Design', 'Software Engineering'],
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    categories: ['Linux & Cloud', 'DevOps', 'MLOps'],
  },
]

export function getSectionById(id: string) {
  return sections.find(s => s.id === id)
}

export function getSectionForCategory(category: string): SectionId {
  const found = sections.find(s => s.categories.includes(category))
  return found?.id ?? 'all'
}
