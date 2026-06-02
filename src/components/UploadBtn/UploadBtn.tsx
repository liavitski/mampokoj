'use client';
import * as React from 'react';
import styled from 'styled-components';
import { UploadButton } from '@/utils/uploadthing';
import { WEIGHTS } from '@/constants';

type UploadBtnProps = {
  adId: string;
};

function UploadBtn({ adId }: UploadBtnProps) {
  return (
    <StyledUploadButton endpoint="imageUploader" input={{ adId }} />
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
    font-weight: ${WEIGHTS.normal};
    padding: 6px 12px;

    &:hover {
      background-color: var(--color-primary-hover) !important;
    }
  }
`;

export default UploadBtn;
