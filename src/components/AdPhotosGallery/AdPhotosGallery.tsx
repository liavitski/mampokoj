'use client';
import * as React from 'react';
import styled from 'styled-components';
import Image from 'next/image';
import VisuallyHidden from '../VisuallyHidden';
import UnstyledButton from '../UnstyledButton';

type PhotoItem = {
  id: string;
  url: string;
  createdAt: Date;
};

type AdPhotosGalleryProps = {
  photos: PhotoItem[];
};

function AdPhotosGallery({ photos }: AdPhotosGalleryProps) {
  const [selectedPhotoIndex, setSelectedPhotoIndex] =
    React.useState(0);

  const image =
    photos?.[selectedPhotoIndex ?? 0]?.url ?? '/globe.svg';
  const imageUrls = photos.map((photo) => photo.url);

  return (
    <Wrapper>
      <PrimaryPhotoWrapper>
        <PrimaryPhoto
          src={image}
          alt="Ad photo - primary"
          fill
          sizes="(max-width: 500px) 100vw, 500px"
        />
      </PrimaryPhotoWrapper>

      <ButtonsWrapper>
        {imageUrls.map((imageUrl, index) => {
          const isSelected = selectedPhotoIndex === index;

          return (
            <ToggleButton
              key={index}
              onClick={() => setSelectedPhotoIndex(index)}
            >
              <VisuallyHidden>
                Toggle image #{index + 1}
              </VisuallyHidden>
              <ThumbnailImage
                alt=""
                src={imageUrl}
                width={70}
                height={70}
              ></ThumbnailImage>
              <SelectedRing opacity={isSelected ? 1 : 0} />
            </ToggleButton>
          );
        })}
      </ButtonsWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const PrimaryPhotoWrapper = styled.div`
  position: relative;
  flex: 1 0 auto;
  margin-bottom: 12px;
  min-height: 400px;
`;

const PrimaryPhoto = styled(Image)`
  border-radius: 4px;
  object-fit: contain;
  display: block;
`;

const ButtonsWrapper = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`;

const ToggleButton = styled(UnstyledButton)`
  position: relative;
  border-radius: 4px;
  overflow: hidden;
`;

const ThumbnailImage = styled(Image)`
  pointer-events: none;
  width: 70px;
  height: 70px;
  object-fit: cover;
`;

const SelectedRing = styled.span<{ opacity?: number }>`
  opacity: ${({ opacity }) => opacity};
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0px;
  border: 3px solid var(--color-focus-ring);
  border-radius: 4px;
  transition: opacity 200ms;
`;

export default AdPhotosGallery;
