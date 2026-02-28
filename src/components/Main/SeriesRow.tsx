import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { SeriesInfo } from 'types/PostItem.types'
import { c, bp } from 'styles/theme'

type SeriesRowProps = {
  seriesList: SeriesInfo[]
  selectedSeries: string | null
  onSeriesClick: (id: string) => void
}

const SectionLabel = styled.p`
  font-size: 11px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 10px 0;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;

  &::-webkit-scrollbar {
    display: none;
  }
`

const Chip = styled.button<{ active: boolean }>`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 100px;
  border: 1.5px solid
    ${({ active }) => (active ? c.primary : c.border)};
  background: ${({ active }) => (active ? c.primary : 'transparent')};
  color: ${({ active }) => (active ? '#ffffff' : c.textMuted)};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  font-family: inherit;

  &:hover {
    border-color: ${c.primary};
    color: ${({ active }) => (active ? '#ffffff' : c.primary)};
  }
`

const ChipCount = styled.span<{ active: boolean }>`
  font-size: 11px;
  font-weight: 600;
  background: ${({ active }) => (active ? 'rgba(255,255,255,0.25)' : c.bgMuted)};
  border-radius: 10px;
  padding: 1px 6px;
  color: ${({ active }) => (active ? '#ffffff' : c.textMuted)};
  transition: all 0.2s ease;
`

const Wrapper = styled.div`
  margin-top: 32px;

  ${bp.md} {
    margin-top: 24px;
  }
`

const SeriesRow: FunctionComponent<SeriesRowProps> = function ({
  seriesList,
  selectedSeries,
  onSeriesClick,
}) {
  if (seriesList.length === 0) return null

  return (
    <Wrapper>
      <SectionLabel>SERIES</SectionLabel>
      <Row>
        {seriesList.map(series => {
          const isActive = selectedSeries === series.id
          return (
            <Chip
              key={series.id}
              active={isActive}
              onClick={() => onSeriesClick(series.id)}
            >
              {series.title}
              <ChipCount active={isActive}>{series.postCount}</ChipCount>
            </Chip>
          )
        })}
      </Row>
    </Wrapper>
  )
}

export default SeriesRow
