import React, { FunctionComponent, ReactNode } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'

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
}

const CategoryWrapper = styled.div`
  border-bottom: 1px solid #f1f3f4;
  margin-bottom: 32px;

  @media (max-width: 768px) {
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

  @media (max-width: 768px) {
    gap: 0;
  }
`

const CategoryTab = styled(({ active, ...props }: GatsbyLinkProps) => (
  <Link {...props} />
))`
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 2px solid transparent;
  font-size: 16px;
  font-weight: 600;
  color: ${({ active }) => (active ? '#1a1a1a' : '#9ca3af')};
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s ease;
  position: relative;

  ${({ active }) =>
    active &&
    `
    border-bottom-color: #3182f6;
    color: #1a1a1a;
  `}

  &:hover {
    color: ${({ active }) => (active ? '#1a1a1a' : '#6b7280')};
  }

  @media (max-width: 768px) {
    padding: 12px 16px;
    font-size: 15px;
  }
`

const CategoryList: FunctionComponent<CategoryListProps> = function ({
  selectedCategory,
}) {
  const categories = [
    { key: 'All', name: '전체' },
    { key: 'Development', name: '개발' },
    { key: 'ML', name: 'ML' },
  ]

  return (
    <CategoryWrapper>
      <CategoryContainer>
        {categories.map(category => (
          <CategoryTab
            to={`/?category=${category.key}`}
            active={category.key === selectedCategory}
            key={category.key}
          >
            {category.name}
          </CategoryTab>
        ))}
      </CategoryContainer>
    </CategoryWrapper>
  )
}

export default CategoryList
