'use client';

import * as React from 'react';
import styled from 'styled-components';

import { UploadButton } from '@/utils/uploadthing';
import { WEIGHTS } from '@/constants';

import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';
import type { AddImageResult } from '@/server/attach-image';

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
        // Typed explicitly: UploadThing's inferred serverData widens away the
        // failure branch, so the union has to be restated to narrow on
        // `success`. This is a type-only import of a server-only module, so
        // nothing is pulled into the client bundle.
        const data = res?.[0]?.serverData as AddImageResult | undefined;

        if (!data) {
          showToast('No server response', 'error');
          return;
        }

        if (data.success) {
          showToast('Image uploaded successfully!', 'success');
          router.refresh();
        } else {
          showToast(data.error, 'error');
        }
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
