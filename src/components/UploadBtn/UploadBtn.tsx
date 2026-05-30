'use client';
import * as React from 'react';
import { UploadButton } from '@/utils/uploadthing';

type UploadBtnProps = {
  adId: string;
};

function UploadBtn({ adId }: UploadBtnProps) {
  return (
    <UploadButton
      endpoint="imageUploader"
      input={{
        adId,
      }}
    />
  );
}

export default UploadBtn;
