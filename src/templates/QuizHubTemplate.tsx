import React, { FunctionComponent } from 'react'
import { graphql, navigate } from 'gatsby'
import styled from '@emotion/styled'
import Template from 'components/Common/Template'
import QuizChrome from 'components/Quiz/QuizChrome'
import { DifficultySpread, DIFFICULTY_LABEL } from 'components/Quiz/QuizMeta'
import { QuizScopeSummary, QuizDifficulty } from 'types/quiz.types'
import { seriesMetadata } from 'utils/seriesData'
import { c, bp, shadow } from 'styles/theme'

type QuizHubTemplateProps = {
  data: {
    site: {
      siteMetadata: { title: string; siteUrl: string }
    }
  }
  pageContext: {
    scopes: QuizScopeSummary[]
    total: number
  }
}

// ─── Intro ───────────────────────────────────────────────────────────

const Intro = styled.div`
  margin-bottom: 28px;
`

const Title = styled.h1`
  margin: 0 0 10px;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: ${c.text};

  ${bp.sm} {
    font-size: 26px;
  }
`

const Lead = styled.p`
  margin: 0;
  max-width: 620px;
  font-size: 16px;
  line-height: 1.75;
  color: ${c.textMuted};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 15px;
  }
`

const Stats = styled.div`
  display: flex;
  align-items: stretch;
  gap: 28px;
  margin-top: 22px;
  padding: 16px 20px;
  border: 1px solid ${c.border};
  border-radius: 12px;
  background: ${c.bgSubtle};

  ${bp.sm} {
    gap: 0;
    justify-content: space-between;
    padding: 14px 16px;
  }
`

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const StatValue = styled.strong`
  font-size: 22px;
  font-weight: 800;
  color: ${c.text};
  line-height: 1.2;

  ${bp.sm} {
    font-size: 19px;
  }
`

const StatLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${c.textMuted};
`

// ─── Layout ──────────────────────────────────────────────────────────

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 40px;
  align-items: start;

  ${bp.lg} {
    grid-template-columns: 1fr;
    gap: 0;
  }
`

const ScopeSection = styled.section`
  min-width: 0;
`

const SectionLabel = styled.p`
  font-size: 11px;
  font-weight: 700;
  color: ${c.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 12px 0;
`

/**
 * auto-fit이라 범위가 하나뿐이어도 빈 칸이 남지 않는다.
 * 범위가 늘어나면 폭에 맞춰 알아서 2열이 된다.
 */
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;

  ${bp.sm} {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`

// ─── Scope card ──────────────────────────────────────────────────────

const CardShell = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid ${c.border};
  border-radius: 14px;
  background: ${c.bg};
  overflow: hidden;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${c.primary};
    transform: translateY(-2px);
    box-shadow: ${shadow.md};
  }
`

const ColorBar = styled.span<{ tone: string }>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: ${({ tone }) => tone};
`

const CardMain = styled.button`
  display: block;
  width: 100%;
  flex: 1;
  padding: 20px 20px 16px 24px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;

  ${bp.sm} {
    padding: 16px 16px 14px 20px;
  }
`

const CardTitle = styled.span`
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: ${c.text};
  margin-bottom: 6px;
`

const CardDesc = styled.span`
  display: block;
  max-width: 46ch;
  font-size: 13.5px;
  line-height: 1.6;
  color: ${c.textMuted};
  margin-bottom: 14px;
  word-break: keep-all;
`

/** 범위가 하나뿐이라 카드가 넓어져도 막대가 화면을 가로지르지 않도록 묶는다 */
const SpreadSlot = styled.span`
  display: block;
  max-width: 220px;
`

const CardStats = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: ${c.textMuted};
  margin-bottom: 10px;
`

const Count = styled.strong`
  font-size: 20px;
  font-weight: 800;
  color: ${c.text};
`

const CardFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 0 20px 14px 24px;

  ${bp.sm} {
    padding: 0 16px 12px 20px;
  }
`

const ListLink = styled.a`
  font-size: 13px;
  font-weight: 600;
  color: ${c.textMuted};
  text-decoration: none;

  &:hover {
    color: ${c.primary};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

// ─── Sidebar ─────────────────────────────────────────────────────────

const Sidebar = styled.aside`
  position: sticky;
  top: 76px;

  ${bp.lg} {
    display: none;
  }
`

const Panel = styled.div`
  padding: 16px 16px 14px;
  margin-bottom: 24px;
  border: 1px solid ${c.borderMuted};
  border-radius: 10px;
  background: ${c.bgSubtle};
`

const PanelItem = styled.p`
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.65;
  color: ${c.textMuted};
  word-break: keep-all;

  &:last-child {
    margin-bottom: 0;
  }

  strong {
    display: block;
    font-size: 12.5px;
    font-weight: 700;
    color: ${c.text};
    margin-bottom: 2px;
  }
`

const LegendRow = styled.p`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 12.5px;
  color: ${c.textMuted};

  &:last-child {
    margin-bottom: 0;
  }
`

const LegendDots = styled.span<{ level: QuizDifficulty }>`
  font-size: 9px;
  letter-spacing: 1px;
  flex-shrink: 0;
  color: ${({ level }) =>
    level === 3 ? c.accent : level === 2 ? c.primary : c.border};
`

/** 데스크톱에서는 사이드바가 같은 내용을 담고 있어 숨긴다. */
const MobileNote = styled.p`
  display: none;

  ${bp.lg} {
    display: block;
    margin: 28px 0 0;
    padding: 16px 18px;
    border-radius: 10px;
    background: ${c.bgSubtle};
    border: 1px solid ${c.border};
    font-size: 13.5px;
    line-height: 1.75;
    color: ${c.textMuted};
    word-break: keep-all;
  }
`

const QuizHubTemplate: FunctionComponent<QuizHubTemplateProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
  },
  pageContext: { scopes, total },
}) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  const postTotal = scopes.reduce((sum, s) => sum + s.postCount, 0)
  const description = `블로그 글에서 뽑은 ${total}문항으로 원리를 다시 확인합니다. ${scopes
    .map(s => s.title)
    .join(', ')}`

  return (
    <Template
      title={`퀴즈 | ${siteTitle}`}
      description={description}
      url={`${baseUrl}/quiz/`}
      image={`${baseUrl}/hero-image.jpg`}
      siteUrl={siteUrl}
    >
      <QuizChrome crumb="Quiz" wide>
        <Intro>
          <Title>Quiz</Title>
          <Lead>
            글을 읽고 넘긴 내용을 다시 꺼내보기 위한 문항입니다. 단순 암기 확인
            대신 원리를 적용하고 예측하는 문제 위주로 구성했습니다.
          </Lead>
          <Stats>
            <Stat>
              <StatValue>{total}</StatValue>
              <StatLabel>문항</StatLabel>
            </Stat>
            <Stat>
              <StatValue>{postTotal}</StatValue>
              <StatLabel>다루는 글</StatLabel>
            </Stat>
            <Stat>
              <StatValue>{scopes.length}</StatValue>
              <StatLabel>범위</StatLabel>
            </Stat>
          </Stats>
        </Intro>

        <Row>
          <ScopeSection>
            <SectionLabel>범위 선택</SectionLabel>
            <Grid>
              {scopes.map(scope => {
                const tone =
                  seriesMetadata[scope.series]?.color ?? 'var(--primary)'

                return (
                  <CardShell key={scope.id}>
                    <ColorBar tone={tone} />
                    <CardMain onClick={() => navigate(`/quiz/${scope.id}/`)}>
                      <CardTitle>{scope.title}</CardTitle>
                      <CardDesc>{scope.description}</CardDesc>
                      <CardStats>
                        <Count>{scope.questionCount}</Count>
                        문항 · 글 {scope.postCount}편
                      </CardStats>
                      <SpreadSlot>
                        <DifficultySpread spread={scope.difficultySpread} />
                      </SpreadSlot>
                    </CardMain>
                    <CardFooter>
                      <ListLink href={`/quiz/${scope.id}/list/`}>
                        전체 문항 보기 →
                      </ListLink>
                    </CardFooter>
                  </CardShell>
                )
              })}
            </Grid>

            <MobileNote>
              정오답 이력은 저장하지 않습니다. 세션 도중 페이지를 벗어나면
              브라우저 탭이 살아 있는 동안만 진행 상태가 남아 이어서 풀 수
              있습니다.
            </MobileNote>
          </ScopeSection>

          <Sidebar>
            <SectionLabel>How it works</SectionLabel>
            <Panel>
              <PanelItem>
                <strong>문항 수와 난이도 선택</strong>
                범위를 고르면 시작 화면에서 몇 문항을 어느 난이도로 풀지
                정합니다.
              </PanelItem>
              <PanelItem>
                <strong>원문으로 바로 이동</strong>
                문항마다 근거가 되는 글의 해당 문단 링크가 붙어 있습니다.
              </PanelItem>
              <PanelItem>
                <strong>이력은 남기지 않음</strong>
                정오답을 저장하지 않습니다. 브라우저 탭이 살아 있는 동안만
                진행하던 세션을 이어서 풀 수 있습니다.
              </PanelItem>
            </Panel>

            <SectionLabel>Difficulty</SectionLabel>
            <Panel>
              {([1, 2, 3] as const).map(level => (
                <LegendRow key={level}>
                  <LegendDots level={level} aria-hidden>
                    {'●'.repeat(level) + '○'.repeat(3 - level)}
                  </LegendDots>
                  {DIFFICULTY_LABEL[level]}
                </LegendRow>
              ))}
            </Panel>
          </Sidebar>
        </Row>
      </QuizChrome>
    </Template>
  )
}

export default QuizHubTemplate

export const quizHubQuery = graphql`
  query quizHubQuery {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
  }
`
