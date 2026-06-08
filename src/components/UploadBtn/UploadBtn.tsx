'use client';

import * as React from 'react';
import styled from 'styled-components';

import { UploadButton } from '@/utils/uploadthing';
import { WEIGHTS } from '@/constants';

import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

type UploadBtnProps = {
  adId: string;
};

function UploadBtn({ adId }: UploadBtnProps) {
  const router = useRouter();
  const { showToast } = useToast();

  return (
    <StyledUploadButton
      endpoint="imageUploader"
      input={{ adId }}
      onUploadError={(error) => {
        showToast(error.message || 'Upload failed', 'error');
      }}
      onClientUploadComplete={(res) => {
        const data = res?.[0]?.serverData;

        if (!data) {
          showToast('No server response', 'error');
          return;
        }

        if (data.success) {
          showToast('Image uploaded successfully!', 'success');
        } else {
          showToast(data.error || 'Failed to save image', 'error');
        }

        router.refresh();
      }}
    />
  );
}

const StyledUploadButton = styled(UploadButton)`
  width: fit-content;
  display: block;
  text-align: center;

  label {
    background-color: var(--color-primary) !important;
    color: var(--color-primary-foreground) !important;
    border-radius: 16px;
    font-weight: ${WEIGHTS.normal} !important;
    height: 36px;
    padding-left: 12px !important;
    padding-right: 12px !important;
    width: 118px;

    &:hover {
      background-color: var(--color-primary-hover) !important;
    }
  }
`;

export default UploadBtn;
