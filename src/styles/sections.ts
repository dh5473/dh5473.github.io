export type SectionId =
  | 'all'
  | 'cs-fundamentals'
  | 'languages-frameworks'
  | 'data-ai'
  | 'architecture'
  | 'experience'

export const sections: Array<{
  id: SectionId
  name: string
  categories: string[]
}> = [
  {
    id: 'cs-fundamentals',
    name: 'CS Fundamentals',
    categories: ['Operating Systems', 'Data Structures', 'Networking', 'Database', 'Linux'],
  },
  {
    id: 'languages-frameworks',
    name: 'Languages & Frameworks',
    categories: ['Python', 'FastAPI', 'TypeScript', 'Next.js'],
  },
  {
    id: 'data-ai',
    name: 'Data & AI',
    categories: ['Statistics', 'Machine Learning', 'Deep Learning', 'LLM', 'MLOps'],
  },
  {
    id: 'architecture',
    name: 'Architecture',
    categories: ['System Design', 'Software Engineering', 'DevOps', 'Cloud'],
  },
  {
    id: 'experience',
    name: 'Experience',
    categories: ['Troubleshooting', 'Issue'],
  },
]

export function getSectionById(id: string) {
  return sections.find(s => s.id === id)
}

export function getSectionForCategory(category: string): SectionId {
  const found = sections.find(s => s.categories.includes(category))
  return found?.id ?? 'all'
}
