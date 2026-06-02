'use client';
import * as Dialog from '@radix-ui/react-dialog';
import styled from 'styled-components';
import Icon from '@/components/Icon';
import UnstyledButton from '@/components/UnstyledButton';
import VisuallyHidden from '@/components/VisuallyHidden';
import { useRouter } from 'next/navigation';

type AdDialogProps = {
  children: React.ReactNode;
};

function AdModal({ children }: AdDialogProps) {
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
          <Dialog.Title style={{ margin: 0 }} />
          <Dialog.Description style={{ margin: 0 }} />
          <Close asChild>
            <UnstyledButton>
              <Icon id="x" strokeWidth={1.5}/>
              <VisuallyHidden>Close modal</VisuallyHidden>
            </UnstyledButton>
          </Close>
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
  background-color: white;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 420px;
  width: max-content;
  z-index: 1;
  color: var(--color-text);
   border-radius: 16px;
`;

const Close = styled(Dialog.Close)`
  position: absolute;
  top: -42px;
  right: -8px;
  z-index: 1;
  background-color: var(--color-pricetag-background);
  border-radius: 4px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
`;

export default AdModal;
