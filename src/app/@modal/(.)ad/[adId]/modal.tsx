'use client';
import * as Dialog from '@radix-ui/react-dialog';
import styled from 'styled-components';

type AdDialogProps = {
  children: React.ReactNode;
};

function AdModal({ children }: AdDialogProps) {
  return (
    <Dialog.Root open={true}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Dialog.Title style={{ margin: 0 }} />
          <Dialog.Description style={{ margin: 0 }} />
          <Dialog.Close />
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
  z-index: 1;
  color: var(--color-text);
`;



export default AdModal;
