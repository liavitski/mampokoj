'use client';
import * as React from 'react';
import { UploadButton } from '@/utils/uploadthing';

type UploadBtnProps = {
  adId: string;
  userId: string;
};

function UploadBtn({ adId, userId }: UploadBtnProps) {
  return (
    <UploadButton
      endpoint="imageUploader"
      input={{
        adId,
        userId,
      }}
    />
  );
}

export default UploadBtn;
