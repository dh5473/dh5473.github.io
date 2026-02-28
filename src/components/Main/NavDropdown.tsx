import React, { FunctionComponent, useState } from 'react'
import styled from '@emotion/styled'
import { Link } from 'gatsby'
import { sections } from 'styles/sections'
import { c, bp } from 'styles/theme'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faTimes, faChevronDown } from '@fortawesome/free-solid-svg-icons'

type NavDropdownProps = {
  selectedSection: string
  selectedCategory: string
  categoryCounts: Record<string, number>
}

// ─── Desktop nav ────────────────────────────────────────────────────

const DesktopNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 2px;

  ${bp.lg} {
    display: none;
  }
`

const AllLink = styled(Link)<{ active: boolean }>`
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: ${({ active }) => (active ? '600' : '500')};
  color: ${({ active }) => (active ? c.text : c.textMuted)};
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.15s ease;

  &:hover {
    color: ${c.text};
    background: ${c.bgSubtle};
  }
`

const SectionTabWrapper = styled.div`
  position: relative;

  &:hover .nav-dropdown-panel {
    display: block;
  }
`

const SectionTabButton = styled(Link)<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: ${({ active }) => (active ? '600' : '500')};
  color: ${({ active }) => (active ? c.text : c.textMuted)};
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.15s ease;
  cursor: pointer;

  svg {
    font-size: 10px;
    opacity: 0.6;
    transition: transform 0.2s ease;
  }

  &:hover {
    color: ${c.text};
    background: ${c.bgSubtle};
  }
`

// Outer panel: starts flush at 100% top with invisible padding as hover bridge
const DropdownPanel = styled.div`
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  padding-top: 8px;
  z-index: 300;
`

// Inner panel: the visible box
const DropdownInner = styled.div`
  background: ${c.bg};
  border: 1px solid ${c.border};
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
`

const CategoryItem = styled(Link)<{ active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: ${({ active }) => (active ? '600' : '400')};
  color: ${({ active }) => (active ? c.primary : c.text)};
  background: ${({ active }) => (active ? c.bgMuted : 'transparent')};
  text-decoration: none;
  transition: all 0.12s ease;
  white-space: nowrap;

  &:hover {
    background: ${c.bgSubtle};
    color: ${c.text};
  }
`

const CategoryItemDisabled = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 400;
  color: ${c.textMuted};
  opacity: 0.4;
  cursor: default;
  white-space: nowrap;
`

const CountBadge = styled.span`
  font-size: 11px;
  color: ${c.textMuted};
  background: ${c.bgMuted};
  border-radius: 10px;
  padding: 1px 7px;
  margin-left: 8px;
  font-weight: 500;
`

// ─── Mobile nav ─────────────────────────────────────────────────────

const MobileMenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid ${c.border};
  border-radius: 8px;
  background: ${c.bgSubtle};
  color: ${c.textMuted};
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${c.bgMuted};
    color: ${c.text};
  }

  ${bp.lg} {
    display: flex;
  }
`

const MobileOverlay = styled.div<{ open: boolean }>`
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 400;
  opacity: ${({ open }) => (open ? '1' : '0')};
  transition: opacity 0.25s ease;

  ${bp.lg} {
    display: block;
    pointer-events: ${({ open }) => (open ? 'auto' : 'none')};
  }
`

const MobileDrawer = styled.div<{ open: boolean }>`
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background: ${c.bg};
  border-right: 1px solid ${c.border};
  z-index: 500;
  overflow-y: auto;
  padding: 0 0 40px;
  transform: ${({ open }) => (open ? 'translateX(0)' : 'translateX(-100%)')};
  transition: transform 0.25s ease;

  ${bp.lg} {
    display: flex;
    flex-direction: column;
  }
`

const DrawerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid ${c.borderMuted};
  margin-bottom: 8px;
`

const DrawerLogo = styled.span`
  font-size: 17px;
  font-weight: 700;
  color: ${c.text};

  span {
    color: ${c.primary};
  }
`

const DrawerCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: ${c.textMuted};
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;

  &:hover {
    background: ${c.bgSubtle};
    color: ${c.text};
  }
`

const DrawerAllLink = styled(Link)`
  display: block;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: ${c.text};
  text-decoration: none;
  transition: color 0.15s;

  &:hover {
    color: ${c.primary};
  }
`

const DrawerSection = styled.div`
  margin-top: 4px;
`

const DrawerSectionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 20px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  text-align: left;
  transition: color 0.15s;

  &:hover {
    color: ${c.text};
  }

  svg {
    font-size: 11px;
    transition: transform 0.2s;
  }
`

const DrawerCategories = styled.div<{ open: boolean }>`
  overflow: hidden;
  max-height: ${({ open }) => (open ? '400px' : '0')};
  transition: max-height 0.25s ease;
`

const DrawerCategoryLink = styled(Link)<{ active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px 8px 32px;
  font-size: 13px;
  font-weight: ${({ active }) => (active ? '600' : '400')};
  color: ${({ active }) => (active ? c.primary : c.text)};
  text-decoration: none;
  transition: color 0.15s;

  &:hover {
    color: ${c.primary};
  }
`

const DrawerCategoryDisabled = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px 8px 32px;
  font-size: 13px;
  color: ${c.textMuted};
  opacity: 0.4;
`

// ─── Component ──────────────────────────────────────────────────────

const NavDropdown: FunctionComponent<NavDropdownProps> = function ({
  selectedSection,
  selectedCategory,
  categoryCounts,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSectionId, setOpenSectionId] = useState<string | null>(
    selectedSection !== 'all' ? selectedSection : null,
  )

  const handleClose = () => setMobileOpen(false)

  return (
    <>
      {/* Desktop */}
      <DesktopNav>
        <AllLink to="/" active={selectedSection === 'all'}>
          전체
        </AllLink>

        {sections.map(section => {
          const isActive = selectedSection === section.id
          return (
            <SectionTabWrapper key={section.id}>
              <SectionTabButton
                to={`/?section=${section.id}`}
                active={isActive}
              >
                {section.name}
                <FontAwesomeIcon icon={faChevronDown} />
              </SectionTabButton>

              <DropdownPanel className="nav-dropdown-panel">
                <DropdownInner>
                  {section.categories.map(cat => {
                    const count = categoryCounts[cat] ?? 0
                    const isCatActive = isActive && selectedCategory === cat
                    if (count === 0) {
                      return (
                        <CategoryItemDisabled key={cat}>
                          {cat}
                          <CountBadge>0</CountBadge>
                        </CategoryItemDisabled>
                      )
                    }
                    return (
                      <CategoryItem
                        key={cat}
                        to={`/?section=${section.id}&category=${cat}`}
                        active={isCatActive}
                      >
                        {cat}
                        <CountBadge>{count}</CountBadge>
                      </CategoryItem>
                    )
                  })}
                </DropdownInner>
              </DropdownPanel>
            </SectionTabWrapper>
          )
        })}
      </DesktopNav>

      {/* Mobile hamburger button */}
      <MobileMenuButton
        onClick={() => setMobileOpen(true)}
        aria-label="메뉴 열기"
      >
        <FontAwesomeIcon icon={faBars} />
      </MobileMenuButton>

      {/* Mobile overlay */}
      <MobileOverlay open={mobileOpen} onClick={handleClose} />

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen}>
        <DrawerHeader>
          <DrawerLogo>
            <span>don</span>tech
          </DrawerLogo>
          <DrawerCloseButton onClick={handleClose} aria-label="메뉴 닫기">
            <FontAwesomeIcon icon={faTimes} />
          </DrawerCloseButton>
        </DrawerHeader>

        <DrawerAllLink to="/" onClick={handleClose}>
          전체 글
        </DrawerAllLink>

        {sections.map(section => {
          const isExpanded = openSectionId === section.id
          const isActive = selectedSection === section.id
          return (
            <DrawerSection key={section.id}>
              <DrawerSectionButton
                onClick={() =>
                  setOpenSectionId(isExpanded ? null : section.id)
                }
              >
                {section.name}
                <FontAwesomeIcon
                  icon={faChevronDown}
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  }}
                />
              </DrawerSectionButton>

              <DrawerCategories open={isExpanded}>
                <DrawerCategoryLink
                  to={`/?section=${section.id}`}
                  active={isActive && selectedCategory === 'All'}
                  onClick={handleClose}
                >
                  All
                </DrawerCategoryLink>
                {section.categories.map(cat => {
                  const count = categoryCounts[cat] ?? 0
                  if (count === 0) {
                    return (
                      <DrawerCategoryDisabled key={cat}>
                        {cat}
                      </DrawerCategoryDisabled>
                    )
                  }
                  return (
                    <DrawerCategoryLink
                      key={cat}
                      to={`/?section=${section.id}&category=${cat}`}
                      active={isActive && selectedCategory === cat}
                      onClick={handleClose}
                    >
                      {cat}
                      <CountBadge>{count}</CountBadge>
                    </DrawerCategoryLink>
                  )
                })}
              </DrawerCategories>
            </DrawerSection>
          )
        })}
      </MobileDrawer>
    </>
  )
}

export default NavDropdown
