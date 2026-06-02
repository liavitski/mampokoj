'use client';
import * as React from 'react';
import styled from 'styled-components';
import Image from 'next/image';

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

  return (
    <Wrapper>
      <PrimaryPhotoWrapper>
        <PrimaryPhoto src={image} alt="Ad photo - primary" width={100} height={100}/>
      </PrimaryPhotoWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  flex: 1;
  max-width: 100%;
  max-height: 420px;
  display: flex;
  flex-direction: column;
`;

const PrimaryPhotoWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 420px;
  margin-bottom: 12px;
`;

const PrimaryPhoto = styled(Image)`
  border-radius: 4px;
  object-fit: contain;
`;

export default AdPhotosGallery;
