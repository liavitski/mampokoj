'use client';
import * as Dialog from '@radix-ui/react-dialog';
import styled from 'styled-components';
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
          {children}
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1;
  background-color: var(--color-overlay-modal);
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  color: var(--color-text);
  border-radius: 16px;

  @media ${QUERIES.tabletAndSmaller} {
    overflow-y: auto; /* enables vertical scrolling on mobile */
    -webkit-overflow-scrolling: touch; /* smoother iOS scroll */
  }

  @media (${QUERIES.phoneAndSmaller}) {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;

    border-radius: 0;
    top: 0;
    left: 0;
    transform: none;
  }
`;

const Close = styled(Dialog.Close)`
  position: absolute;
  top: -40px;
  right: 0;
  z-index: 1;
  background-color: var(--color-card-background);
  border-radius: 4px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-pricetag-background-hover);
    }
  }

  @media (${QUERIES.tabletAndSmaller}) {
    top: 8px;
    right: 8px;
  }
`;

export default Modal;
