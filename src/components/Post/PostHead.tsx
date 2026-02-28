import React, { FunctionComponent } from 'react'
import styled from '@emotion/styled'
import { GatsbyImage, IGatsbyImageData } from 'gatsby-plugin-image'
import PostHeadInfo, { PostHeadInfoProps } from './PostHeadInfo'
import { bp } from 'styles/theme'

type GatsbyImgProps = {
  image: IGatsbyImageData
  alt: string
  className?: string
}

type PostHeadProps = PostHeadInfoProps & {
  thumbnail?: IGatsbyImageData
}

const PostHeadWrapper = styled.div<{ hasThumbnail: boolean }>`
  position: relative;
  width: 100%;
  height: 400px;
  overflow: hidden;
  background: ${({ hasThumbnail }) =>
    hasThumbnail
      ? 'transparent'
      : 'linear-gradient(135deg, #0d9488 0%, #1c1917 100%)'};

  ${bp.md} {
    height: 300px;
  }
`

const BackgroundImage = styled((props: GatsbyImgProps) => (
  <GatsbyImage {...props} style={{ position: 'absolute' }} />
))`
  z-index: 0;
  width: 100%;
  height: 400px;
  object-fit: cover;
  filter: brightness(0.22);

  ${bp.md} {
    height: 300px;
  }
`

// Teal-to-transparent gradient overlay for a subtle color signature
const GradientOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    135deg,
    rgba(13, 148, 136, 0.15) 0%,
    transparent 60%
  );
`

const PostHead: FunctionComponent<PostHeadProps> = function ({
  title,
  date,
  category,
  thumbnail,
}) {
  return (
    <PostHeadWrapper hasThumbnail={!!thumbnail}>
      {thumbnail && <BackgroundImage image={thumbnail} alt="thumbnail" />}
      <GradientOverlay />
      <PostHeadInfo title={title} date={date} category={category} />
    </PostHeadWrapper>
  )
}

export default PostHead
