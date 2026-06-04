'use client';
import * as Dialog from '@radix-ui/react-dialog';
import styled, { keyframes } from 'styled-components';
import Icon from '@/components/Icon';
import UnstyledButton from '@/components/UnstyledButton';
import VisuallyHidden from '@/components/VisuallyHidden';
import { useRouter } from 'next/navigation';
import { QUERIES } from '@/constants';

type AdDialogProps = {
  children: React.ReactNode;
};

function Modal({ children }: AdDialogProps) {
  const router = useRouter();

  return (
    <Dialog.Root
      open={true}
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Close asChild>
            <UnstyledButton>
              <Icon id="x" strokeWidth={1.5} />
              <VisuallyHidden>Close modal</VisuallyHidden>
            </UnstyledButton>
          </Close>

          <Dialog.Title style={{ margin: 0 }} />
          <Dialog.Description style={{ margin: 0 }} />
          <ScrollArea>{children}</ScrollArea>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const overlayShow = keyframes`
    from {
      opacity: 0
    } to {
      opacity: 1
    }
  `;

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1;
  background-color: var(--color-overlay-modal);
  animation: ${overlayShow} 150ms cubic-bezier(0.16, 1, 0.3, 1);
`;

const Content = styled(Dialog.Content)`
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

  @media (${QUERIES.phoneAndSmaller}) {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
`;

const Close = styled(Dialog.Close)`
  position: absolute;
  z-index: 1;
  background-color: var(--color-card-background);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  top: 8px;
  right: 8px;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-pricetag-background-hover);
    }
  }

  @media (${QUERIES.tabletAndSmaller}) {
  }
`;

const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch; // smoth scroll on mobile
`;

export default Modal;
