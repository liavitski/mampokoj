'use client';
import * as React from 'react';
import Button from '../Button';
import { deleteAdAction } from '@/server/actions';

type DeleteButtonProps = {
  adId: string;
};

function DeleteButton({ adId }: DeleteButtonProps) {
  return (
    <Button
      variant="fill"
      size="small"
      onClick={() => deleteAdAction(adId)}
    >
      Delete
    </Button>
  );
}

export default DeleteButton;
