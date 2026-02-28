import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { bp } from 'styles/theme'

export type PostHeadInfoProps = {
  title: string
  date: string
  category: string
}

const PostHeadInfoWrapper = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: 768px;
  height: 100%;
  margin: 0 auto;
  padding: 60px 0;
  color: #ffffff;

  ${bp.md} {
    width: 100%;
    padding: 40px 20px;
  }
`

const PrevPageIcon = styled.div`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #1c1917;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: background 0.2s ease;

  &:hover {
    background: #ffffff;
  }

  ${bp.md} {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }
`

const CategoryBadge = styled.span`
  display: inline-block;
  margin-top: auto;
  margin-bottom: 12px;
  padding: 4px 10px;
  background: rgba(13, 148, 136, 0.8);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 20px;
  letter-spacing: 0.04em;
  width: fit-content;
`

const Title = styled.h1`
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: break-word;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 42px;
  font-weight: 800;
  margin: 0 0 12px 0;
  line-height: 1.25;

  ${bp.md} {
    font-size: 28px;
  }
`

const PostData = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 400;
  opacity: 0.75;

  ${bp.md} {
    font-size: 13px;
  }
`

const PostHeadInfo: FunctionComponent<PostHeadInfoProps> = function ({
  title,
  date,
  category,
}) {
  const goBackPage = () => {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <PostHeadInfoWrapper>
      <PrevPageIcon onClick={goBackPage}>
        <FontAwesomeIcon icon={faArrowLeft} />
      </PrevPageIcon>
      <CategoryBadge>{category}</CategoryBadge>
      <Title>{title}</Title>
      <PostData>
        <span>{date}</span>
      </PostData>
    </PostHeadInfoWrapper>
  )
}

export default PostHeadInfo
