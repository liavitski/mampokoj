'use client';
import * as React from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import styled, { keyframes } from 'styled-components';
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
        <Overlay />
        <Content>
          <Alert.Title />
          <Alert.Description />
          <Alert.Action />
          {children}
          <Alert.Cancel />
        </Content>
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
  width: max-content;


  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  &:hover {
    background-color: var(--color-primary-hover);
  }
`;

const overlayShow = keyframes`
    from {
      opacity: 0
    } to {
      opacity: 1
    }
  `;

const Overlay = styled(Alert.Overlay)`
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay-modal);
  animation: ${overlayShow} 150ms cubic-bezier(0.16, 1, 0.3, 1);
`;

const Content = styled(Alert.Content)`
  position: fixed;
  inset: 0;
  max-height: 100dvh;
  min-width: min(600px, 90vw);

  z-index: 1;
  color: var(--color-text);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-self: center;
  justify-self: center;
`;

export default AlertDialog;
