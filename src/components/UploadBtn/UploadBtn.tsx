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
