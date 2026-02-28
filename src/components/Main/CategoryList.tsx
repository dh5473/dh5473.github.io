import React, { FunctionComponent, ReactNode } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { c, bp } from 'styles/theme'

type CategoryItemProps = {
  active: boolean
}

type GatsbyLinkProps = {
  children: ReactNode
  className?: string
  to: string
} & CategoryItemProps

export type CategoryListProps = {
  selectedCategory: string
  categories: string[]
}

const CategoryWrapper = styled.div`
  position: relative;
  border-bottom: 1px solid ${c.border};
  margin-bottom: 32px;

  ${bp.md} {
    margin-bottom: 24px;
  }
`

const CategoryContainer = styled.div`
  display: flex;
  gap: 0;
  overflow-x: auto;

  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none;
  scrollbar-width: none;
`

// Fade gradient on the right to hint at horizontal scroll
const ScrollFade = styled.div`
  display: none;
  position: absolute;
  right: 0;
  top: 0;
  bottom: 1px;
  width: 48px;
  background: linear-gradient(to right, transparent, ${c.bg});
  pointer-events: none;

  ${bp.md} {
    display: block;
  }
`

const CategoryTab = styled(({ active, ...props }: GatsbyLinkProps) => (
  <Link {...props} />
))`
  display: flex;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 2px solid transparent;
  font-size: 15px;
  font-weight: 600;
  color: ${({ active }) => (active ? c.text : c.textMuted)};
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.2s ease, border-color 0.2s ease;

  ${({ active }) =>
    active &&
    `
    border-bottom-color: var(--primary);
    color: var(--text);
  `}

  &:hover {
    color: ${c.text};
  }

  ${bp.md} {
    padding: 12px 14px;
    font-size: 14px;
  }
`

const CategoryList: FunctionComponent<CategoryListProps> = function ({
  selectedCategory,
  categories,
}) {
  // Always show "전체" first, then alphabetical order
  const sortedCategories = [...categories].sort((a, b) => a.localeCompare(b))
  const tabs = [
    { key: 'All', name: '전체' },
    ...sortedCategories.map(cat => ({ key: cat, name: cat })),
  ]

  return (
    <CategoryWrapper>
      <CategoryContainer>
        {tabs.map(tab => (
          <CategoryTab
            to={`/?category=${tab.key}`}
            active={tab.key === selectedCategory}
            key={tab.key}
          >
            {tab.name}
          </CategoryTab>
        ))}
      </CategoryContainer>
      <ScrollFade />
    </CategoryWrapper>
  )
}

export default CategoryList
