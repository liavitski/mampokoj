'use client';

import * as React from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import { WEIGHTS } from '@/constants';
import styled, { keyframes } from 'styled-components';

import { deleteAdById } from '@/server/actions/deleteAd';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

import Button from '../Button';

type DeleteButtonProps = {
  adId: string;
};

function DeleteAdButton({ adId }: DeleteButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [isPending, setIsPending] = React.useState(false);

  async function handleDelete(adId: string) {
    setIsPending(true);

    const res = await deleteAdById(adId);

    setIsPending(false);

    if (res.success) {
      showToast('Ad deleted successfully', 'success');
      router.push(`/dashboard/${res.userId}`);
      return;
    }

    showToast(res.error || 'Delete failed', 'error');
  }

  return (
    <Alert.Root>
      <Alert.Trigger asChild>
        <DeleteButtonStyled variant="fill" size="small">
          Delete
        </DeleteButtonStyled>
      </Alert.Trigger>

      <Alert.Portal>
        <Overlay />
        <Content>
          <Title>Are you absolutely sure?</Title>

          <Description>
            This action cannot be undone. This will permanently delete
            your ad and remove your ad data from our servers.
          </Description>
          <ActionsWrapper>
            <Alert.Cancel asChild>
              <Button variant="outline" size="small">
                Cancel
              </Button>
            </Alert.Cancel>
            <Alert.Action asChild>
              <DeleteButtonStyled
                variant="fill"
                size="small"
                onClick={() => handleDelete(adId)}
                disabled={isPending}
              >
                Yes, delete ad
              </DeleteButtonStyled>
            </Alert.Action>
          </ActionsWrapper>
        </Content>
      </Alert.Portal>
    </Alert.Root>
  );
}

const DeleteButtonStyled = styled(Button)`
  margin-left: auto;
  background-color: var(--color-destructive);
  color: var(--color-destructive-foreground);

  &:hover {
    background-color: var(--color-destructive-hover);
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

const Title = styled(Alert.Title)`
  font-weight: ${WEIGHTS.normal};
  font-size: 1.5rem;
  margin-top: -8px;
`;

const Description = styled(Alert.Description)`
  font-weight: ${WEIGHTS.normal};
  font-size: 1rem;
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

const ActionsWrapper = styled.div`
  display: flex;
`;

export default DeleteAdButton;
