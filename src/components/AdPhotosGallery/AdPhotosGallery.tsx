'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';
import { deletePhotoByFileKey } from '@/server/actions/deletePhoto';

import styled from 'styled-components';
import Image from 'next/image';
import VisuallyHidden from '../VisuallyHidden';
import UnstyledButton from '../UnstyledButton';
import Icon from '../Icon';
import Tooltip from '../Tooltip';
import AlertDialog from '../AlertDialog';
import Button from '../Button';

type PhotoItem = {
  id: string;
  url: string;
  createdAt: Date;
  fileKey: string;
};

type AdPhotosGalleryProps = {
  photos: PhotoItem[];
  allowDeletePhoto?: boolean;
};

function AdPhotosGallery({
  photos,
  allowDeletePhoto = false,
}: AdPhotosGalleryProps) {
  const router = useRouter();

  const [selectedPhotoIndex, setSelectedPhotoIndex] =
    React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const { showToast } = useToast();

  async function handleDeletePhoto(fileKey: string) {
    setIsPending(true);

    const res = await deletePhotoByFileKey(fileKey);

    setIsPending(false);

    if (!res.success) {
      showToast(res.error || 'Delete failed', 'error');
      return;
    }

    const deletedIndex = selectedPhotoIndex;
    const nextPhotos = photos.filter((p) => p.fileKey !== fileKey);

    // Deleting the last remaining photo leaves an empty list, and
    // `nextPhotos.length - 1` would then be -1, which no image lookup
    // resolves and which would make the next delete read photos[-1].fileKey.
    setSelectedPhotoIndex(
      nextPhotos.length === 0
        ? 0
        : Math.min(deletedIndex, nextPhotos.length - 1)
    );

    showToast('Photo deleted successfully', 'success');
    router.refresh();
  }

  const hasPhotos = photos?.length > 0;

  const imageUrls = photos?.map((photo) => photo.url) ?? [];

  const image =
    imageUrls.length > 0
      ? (imageUrls[selectedPhotoIndex] ?? imageUrls[0])
      : '/globe.svg';

  const TooltipTrigger = allowDeletePhoto ? (
    <div>
      <Icon id="trash" />
      <VisuallyHidden>Delete photo</VisuallyHidden>
    </div>
  ) : undefined;

  return (
    <Wrapper>
      <PrimaryPhotoWrapper>
        <PrimaryPhoto
          src={image}
          alt="Ad photo - primary"
          fill
          sizes="(max-width: 500px) 100vw, 500px"
        />

        <AlertDialog
          open={open}
          onOpenChange={() => setOpen(!open)}
          description={
            'This action cannot be undone. This will permanently delete your photo and remove it from our servers.'
          }
          title={'Are you absolutely sure?'}
          cancel={
            <Button variant="outline" size="small">
              Cancel
            </Button>
          }
          action={
            <Button
              variant="fill"
              size="small"
              destructive={true}
              style={{ marginLeft: 'auto' }}
              onClick={() =>
                handleDeletePhoto(photos[selectedPhotoIndex].fileKey)
              }
              disabled={isPending}
            >
              Yes, delete photo
            </Button>
          }
          trigger={
            // `null` rather than `false`: this is handed to Radix's
            // `Trigger asChild`, which requires an element, not a falsy value.
            hasPhotos ? (
              <DeletePhotoButton>
                <Tooltip
                  trigger={TooltipTrigger}
                  content="Delete photo"
                />
              </DeletePhotoButton>
            ) : null
          }
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

const DeletePhotoButton = styled(UnstyledButton)`
  position: absolute;
  background-color: var(--color-destructive);
  border-radius: 8px;
  /* border: 1px solid var(--color-border); */
  box-shadow: var(--shadow-card);
  bottom: 0px;
  right: 0px;
  color: var(--color-destructive-foreground);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-destructive-hover);
    }
  }
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
