'use client';

import * as Dialog from '@radix-ui/react-dialog';
import styled, { keyframes } from 'styled-components';
import { QUERIES } from '@/constants';

import Icon from '@/components/Icon';
import UnstyledButton from '@/components/UnstyledButton';
import VisuallyHidden from '@/components/VisuallyHidden';

type ModalProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disableOutsideClose?: boolean;
  children: React.ReactNode;
};

function Modal({
  open,
  defaultOpen,
  onOpenChange,
  disableOutsideClose = false,
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
        <Content
          // Marks the box for AdCardCompact.styles.tsx, which drops the card's
          // own surface inside it. Renaming this without updating that selector
          // brings back the nested-card look.
          data-modal-box=""
          onPointerDownOutside={(e) =>
            disableOutsideClose && e.preventDefault()
          }
          onInteractOutside={(e) =>
            disableOutsideClose && e.preventDefault()
          }
        >
          <Close asChild>
            <UnstyledButton>
              <Icon id="x" strokeWidth={1.5} />
              <VisuallyHidden>Close modal</VisuallyHidden>
            </UnstyledButton>
          </Close>

          <Dialog.Title style={{ margin: 0 }} />
          <Dialog.Description style={{ margin: 0 }} />
          <ScrollArea data-modal-scroll="">{children}</ScrollArea>
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
  background-color: var(--color-overlay-modal);
  animation: ${overlayShow} 150ms cubic-bezier(0.16, 1, 0.3, 1);
`;

/**
 * The dialog box.
 *
 * This was `position: fixed; inset: 0` with `align-self`/`justify-self: center`.
 * Both alignment properties were inert: they position a flex or grid *item*
 * inside its parent, and this element's parent is `body`, because `Dialog.Portal`
 * renders it there. So `Content` was a transparent, viewport-sized box, and its
 * `border-radius` and `max-height` applied to nothing the user could see. The
 * dialog's visible size came entirely from its content, which is why it grew and
 * shrank with the photo count and the length of the description.
 *
 * Now it is a real box: a fixed height and width, centred by its own alignment
 * properties, painted with a surface so it reads as a dialog rather than as text
 * floating on the overlay.
 */
const Content = styled(Dialog.Content)`
  position: fixed;
  z-index: 1;

  /*
    Centred by offsetting and translating, not by inset plus align-self. With
    inset: 0 and an explicit width, the box is pinned to the top-left corner and
    the alignment properties centre its *children* rather than itself, which is
    how it ended up off-centre with a viewport-sized transparent frame.

    align-items/justify-content are kept as a no-op-safe default for the single
    child, ScrollArea, which is the only thing in the box that needs filling.
  */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  align-items: center;
  justify-content: center;

  display: flex;
  flex-direction: column;

  /*
    A fixed height is the point. Content longer than this scrolls inside
    ScrollArea rather than resizing the dialog, so every modal is the same size
    whatever it contains. min() rather than a plain height, so a short viewport
    (a landscape phone) still fits.

    No backticks in this comment: it is inside a template literal, so one would
    close the string and take the rest of the stylesheet with it.
  */
  width: min(800px, calc(100vw - 48px));
  height: min(720px, calc(100dvh - 48px));

  color: var(--color-text);
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);

  /*
    The card inside brings its own surface, border, radius and padding. Keeping
    them would draw a card within a card, so AdCardCompact's Wrapper drops them
    when it is rendered here. See AdCardCompact.styles.tsx.

    No backticks in this comment: it is inside a template literal, so one would
    close the string and take the rest of the stylesheet with it.
  */

  /* A phone gets the full screen: the 48px gutter costs too much of it. */
  @media (${QUERIES.phoneAndSmaller}) {
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
    border: none;
  }
`;

const Close = styled(Dialog.Close)`
  position: absolute;
  z-index: 1;
  background-color: var(--color-card-background);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  top: 6px;
  right: 6px;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-pricetag-background-hover);
    }
  }
`;

/**
 * The only part of the dialog that scrolls.
 *
 * `min-height: 0` is load-bearing: a flex item defaults to `min-height: auto`,
 * which refuses to shrink below its content, so without it the box would grow to
 * fit the card rather than letting this overflow.
 */
const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch; // smoth scroll on mobile
`;

export default Modal;
