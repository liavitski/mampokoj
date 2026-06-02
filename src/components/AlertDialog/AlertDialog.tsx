'use client';
import * as React from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';

type AlertDialogProps = {
  children: React.ReactNode;
};

function AlertDialog({ children }: AlertDialogProps) {
  return (
    <Alert.Root>
      <Alert.Trigger asChild>
        <Button>Create ad</Button>
      </Alert.Trigger>
      <Alert.Portal>
        <Alert.Overlay />
        <Alert.Content>
          <Alert.Title />
          <Alert.Description />
          <Alert.Cancel />
          <Alert.Action />
          {children}
        </Alert.Content>
      </Alert.Portal>
    </Alert.Root>
  );
}

const Button = styled.button`
  font-size: var(--font-size);
  padding: 4px 12px;
  border-radius: 16px;
  border: 2px solid transparent;
  cursor: pointer;
  font-weight: ${WEIGHTS.normal};
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  height: min-content;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  &:hover {
    background-color: var(--color-primary-hover);
  }
`;

export default AlertDialog;
