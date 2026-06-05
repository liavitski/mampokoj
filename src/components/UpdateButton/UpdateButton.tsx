'use client';
import * as React from 'react';
import Button from '../Button';
// import { deleteAdAction } from '@/server/actions';

type UpdateButtonProps = {
  adId: string;
};

function UpdateButton({ adId }: UpdateButtonProps) {
  return (
    <Button
      variant="fill"
      size="small"
      // onClick={() => deleteAdAction(adId)}
    >
      Update 
    </Button>
  );
}

export default UpdateButton;
