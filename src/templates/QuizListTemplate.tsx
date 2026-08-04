import React, { FunctionComponent } from 'react'
import { graphql } from 'gatsby'
import { Helmet } from 'react-helmet'
import styled from '@emotion/styled'
import Template from 'components/Common/Template'
import QuizChrome from 'components/Quiz/QuizChrome'
import ScenarioBlock from 'components/Quiz/ScenarioBlock'
import ExplanationPanel from 'components/Quiz/ExplanationPanel'
import {
  DifficultyBadge,
  DifficultySpread,
  TagBadge,
} from 'components/Quiz/QuizMeta'
import { QuizPostGroup, QuizQuestion, QuizScopeSummary } from 'types/quiz.types'
import { seriesMetadata, inkOn } from 'utils/seriesData'
import { c, bp } from 'styles/theme'

type QuizListTemplateProps = {
  data: {
    site: { siteMetadata: { title: string; siteUrl: string } }
  }
  pageContext: {
    scope: QuizScopeSummary
    posts: QuizPostGroup[]
  }
}

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 800;
  color: ${c.text};

  ${bp.sm} {
    font-size: 25px;
  }
`

const Lead = styled.p`
  margin: 0 0 20px;
  font-size: 15.5px;
  line-height: 1.7;
  color: ${c.textMuted};
  word-break: keep-all;
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: ${c.textMuted};
`

const SpreadSlot = styled.div`
  flex: 1;
  max-width: 180px;
`

const StartLink = styled.a`
  display: inline-block;
  margin-bottom: 40px;
  padding: 11px 20px;
  border-radius: 10px;
  background: ${c.primary};
  color: var(--on-fill);
  font-size: 14.5px;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    background: ${c.primaryHov};
  }
`

const PostSection = styled.section`
  margin-bottom: 56px;
`

const PostHeading = styled.h2`
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  color: ${c.text};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 18px;
  }
`

const PostLink = styled.a`
  display: inline-block;
  margin-bottom: 20px;
  font-size: 13.5px;
  font-weight: 600;
  color: ${c.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`

const Item = styled.article`
  padding: 22px 0 26px;
  border-top: 1px solid ${c.border};
`

const ItemMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
`

const Question = styled.h3`
  margin: 0 0 16px;
  font-size: 17.5px;
  font-weight: 700;
  line-height: 1.6;
  color: ${c.text};
  word-break: keep-all;

  ${bp.sm} {
    font-size: 16px;
  }
`

const ChoiceList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const Choice = styled.li<{ correct: boolean }>`
  padding: 12px 14px;
  border-radius: 10px;
  border: 1.5px solid
    ${({ correct }) => (correct ? 'var(--text-success)' : c.border)};
  background: ${({ correct }) => (correct ? 'var(--bg-success)' : c.bgSubtle)};
`

const ChoiceText = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: ${c.text};
  word-break: keep-all;
`

const Verdict = styled.span`
  display: inline-block;
  margin-right: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-success);
`

const Why = styled.p`
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.75;
  color: ${c.textMuted};
`

const Foot = styled.p`
  margin: 48px 0 0;
  padding: 16px 18px;
  border-radius: 10px;
  background: ${c.bgSubtle};
  border: 1px solid ${c.border};
  font-size: 14px;
  line-height: 1.75;
  color: ${c.textMuted};
  word-break: keep-all;
`

const StaticQuestion: FunctionComponent<{ question: QuizQuestion }> = function ({
  question,
}) {
  return (
    <Item id={question.id}>
      <ItemMeta>
        <DifficultyBadge level={question.difficulty} />
        {question.chain && <TagBadge label="연결 문항" />}
        {question.source === 'extended' && <TagBadge label="확장" />}
        {question.tags?.map(tag => (
          <TagBadge key={tag} label={tag} />
        ))}
      </ItemMeta>

      {question.scenario && <ScenarioBlock scenario={question.scenario} />}

      <Question>{question.question}</Question>

      <ChoiceList>
        {question.choices.map((choice, i) => (
          <Choice key={i} correct={Boolean(choice.correct)}>
            <ChoiceText>
              {choice.correct && <Verdict>정답</Verdict>}
              {choice.text}
            </ChoiceText>
            <Why>{choice.why}</Why>
          </Choice>
        ))}
      </ChoiceList>

      <ExplanationPanel question={question} />
    </Item>
  )
}

const QuizListTemplate: FunctionComponent<QuizListTemplateProps> = function ({
  data: {
    site: {
      siteMetadata: { title: siteTitle, siteUrl },
    },
  },
  pageContext: { scope, posts },
}) {
  const baseUrl = siteUrl.replace(/\/$/, '')
  const accent = seriesMetadata[scope.series]?.color ?? 'var(--primary)'
  const allQuestions = posts.flatMap(post => post.questions)

  // Google이 FAQ 리치 결과를 제한한 뒤로 스니펫은 기대하지 않는다. 의미 전달용 마크업이다.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allQuestions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.explanation,
      },
    })),
  }

  return (
    <Template
      title={`${scope.title} 퀴즈 전체 문항 | ${siteTitle}`}
      description={`${scope.title} 문항 ${scope.questionCount}개와 선택지별 해설을 한 번에 봅니다. ${scope.description}`}
      url={`${baseUrl}/quiz/${scope.id}/list/`}
      image={`${baseUrl}/hero-image.jpg`}
      siteUrl={siteUrl}
    >
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <QuizChrome crumb={`Quiz / ${scope.title} / 전체 문항`}>
        <Title>{scope.title} 전체 문항</Title>
        <Lead>
          {scope.description}. 문항과 선택지별 해설을 글 순서대로 나열했습니다.
        </Lead>

        <MetaRow>
          <span>
            {scope.questionCount}문항 · 글 {scope.postCount}편
          </span>
          <SpreadSlot>
            <DifficultySpread spread={scope.difficultySpread} />
          </SpreadSlot>
        </MetaRow>

        <StartLink
          href={`/quiz/${scope.id}/`}
          style={{ background: accent, color: inkOn(accent) }}
        >
          직접 풀어보기 →
        </StartLink>

        {posts.map(post => (
          <PostSection key={post.slug}>
            <PostHeading>{post.title ?? post.slug}</PostHeading>
            <PostLink href={post.slug}>원문 읽기 →</PostLink>
            {post.questions.map(question => (
              <StaticQuestion key={question.id} question={question} />
            ))}
          </PostSection>
        ))}

        <Foot>
          이 페이지는 문항 품질을 점검하는 용도로도 씁니다. 한 화면에서 전부
          훑어야 중복된 문항, 쏠린 난이도, 소거법으로 풀리는 선택지가 보입니다.
        </Foot>
      </QuizChrome>
    </Template>
  )
}

export default QuizListTemplate

export const quizListQuery = graphql`
  query quizListQuery {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
  }
`
