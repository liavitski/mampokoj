'use client';
import * as Dialog from '@radix-ui/react-dialog';
import styled, { keyframes } from 'styled-components';
import Icon from '@/components/Icon';
import UnstyledButton from '@/components/UnstyledButton';
import VisuallyHidden from '@/components/VisuallyHidden';
import { QUERIES } from '@/constants';

type ModalProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
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
  /* z-index: 1; */
  background-color: var(--color-overlay-modal);
  animation: ${overlayShow} 150ms cubic-bezier(0.16, 1, 0.3, 1);
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  inset: 0;
  max-height: 95dvh;
  width: min(800px, 95vw);

  z-index: 1;
  color: var(--color-text);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-self: center;
  justify-self: center;

  @media (${QUERIES.phoneAndSmaller}) {
    height: 95dvh;
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
  top: 12px;
  right: 12px;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-pricetag-background-hover);
    }
  }
`;

const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch; // smoth scroll on mobile
`;

export default Modal;
