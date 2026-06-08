'use client';
import * as React from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import styled, { keyframes } from 'styled-components';
import { WEIGHTS } from '@/constants';

type AlertDialogProps = {
  trigger: React.ReactNode;
  action: React.ReactNode;
  cancel: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;

  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function AlertDialog({
  trigger,
  action,
  cancel,
  title,
  description,
  open,
  onOpenChange,
}: AlertDialogProps) {
  return (
    <Alert.Root open={open} onOpenChange={onOpenChange}>
      <Alert.Trigger asChild>{trigger}</Alert.Trigger>

      <Alert.Portal>
        <Overlay />
        <Content>
          <Title>{title}</Title>
          <Description>{description}</Description>
          <ActionsWrapper>
            <Alert.Cancel asChild>{cancel}</Alert.Cancel>
            <Alert.Action asChild>{action}</Alert.Action>
          </ActionsWrapper>
        </Content>
      </Alert.Portal>
    </Alert.Root>
  );
}

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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: 500px;
  max-height: 85vh;

  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  padding: 16px;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Title = styled(Alert.Title)`
  font-weight: ${WEIGHTS.normal};
  font-size: 1.5rem;
  margin-top: -8px;
`;

const Description = styled(Alert.Description)`
  font-weight: ${WEIGHTS.normal};
  font-size: 1rem;
`;

const ActionsWrapper = styled.div`
  display: flex;
`;

export default AlertDialog;
