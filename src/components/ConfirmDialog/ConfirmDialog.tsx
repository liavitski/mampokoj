'use client';

import * as React from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import styled, { keyframes } from 'styled-components';

import { WEIGHTS } from '@/constants';

type ConfirmDialogProps = {
  /**
   * The visible label on the control that opens the dialog.
   *
   * Ignored when `trigger` is given, since that element brings its own label.
   */
  triggerLabel: string;
  /**
   * A custom control to open the dialog, for a caller whose trigger is styled by
   * the design system rather than by this file.
   *
   * Radix's `asChild` merges its trigger props onto whatever it is given, so the
   * element has to be a real button that forwards a ref -- `Button` is, being a
   * styled `<button>`. The alternative was letting the owner's delete control fall
   * back to `ButtonLike` and change its appearance and position as a side effect
   * of a refactor.
   */
  trigger?: React.ReactNode;
  dialogTitle: string;
  /** What will happen, in plain words. This is the whole point of the dialog. */
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  isPending?: boolean;
  /**
   * Accessible name for the trigger, when the visible label is not enough.
   *
   * Applied as `aria-label`, so it names the control without replacing what it
   * says. It used to be rendered *as* the trigger's content, which meant the ad
   * id ended up on screen: "Take down ad d3927b26-9fa0-4284-89b2-75913c37dc90",
   * wrapping to two lines in the moderation page's columns and pushing the two
   * buttons in a row onto separate lines. `aria-label` gives the same
   * disambiguation to a screen reader and leaves the visible label short.
   */
  triggerLabelOverride?: string;
};

/**
 * A confirmation for an action that cannot be undone.
 *
 * Extracted because more than one control needs it: `DeleteAdButton` (the owner
 * removing their own ad), `TakeDownButton` and `MarkCheckedButton` (a moderator).
 * Copying the dialog a second time would put two sets of overlay, title,
 * description and action styles in the tree, and the two would drift --
 * which is how the nested-card regression in `AdCardCompact.styles.tsx` happened
 * in the first place.
 *
 * **This did in fact get copied once.** `DeleteAdButton` grew its own `Alert.Root`,
 * `Overlay`, `Content`, `Title`, `Description` and a second `overlayShow`
 * keyframes animation after this was extracted, which is the erosion `HANDOFF.md`
 * §9.5 warns about. It now uses this component, and a source-read assertion in
 * `DeleteAdButton.test.tsx` fails if a second dialog is ever built alongside it.
 *
 * Client-side because Radix needs it. All three callers are client components.
 */
function ConfirmDialog({
  triggerLabel,
  dialogTitle,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  isPending = false,
  triggerLabelOverride,
  trigger,
}: ConfirmDialogProps) {
  return (
    <Alert.Root>
      <Alert.Trigger asChild>
        {trigger ?? (
          <ButtonLike
            $destructive={destructive}
            type="button"
            aria-label={triggerLabelOverride}
          >
            {triggerLabel}
          </ButtonLike>
        )}
      </Alert.Trigger>

      <Alert.Portal>
        <Overlay />
        <Content>
          <Title>{dialogTitle}</Title>

          <Description>{description}</Description>

          <Actions>
            <Alert.Cancel asChild>
              <ButtonLike type="button">Cancel</ButtonLike>
            </Alert.Cancel>

            <Alert.Action asChild>
              <ButtonLike
                $destructive={destructive}
                type="button"
                onClick={onConfirm}
                disabled={isPending}
              >
                {confirmLabel}
              </ButtonLike>
            </Alert.Action>
          </Actions>
        </Content>
      </Alert.Portal>
    </Alert.Root>
  );
}

const overlayShow = keyframes`
  from { opacity: 0 }
  to   { opacity: 1 }
`;

/**
 * The trigger and the actions share one look.
 *
 * Not `components/Button`: that one reads size and radius from custom
 * properties its own wrapper sets, and these are inside a dialog where there is
 * no size context to establish.
 */
const ButtonLike = styled.button<{ $destructive?: boolean }>`
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  font-family: inherit;
  padding: 4px 12px;
  border-radius: 16px;
  cursor: pointer;

  background-color: ${({ $destructive }) =>
    $destructive ? 'var(--color-destructive)' : 'var(--color-card-background)'};
  color: ${({ $destructive }) =>
    $destructive ? 'var(--color-destructive-foreground)' : 'var(--color-text)'};
  border: ${({ $destructive }) =>
    $destructive ? '2px solid transparent' : '1px solid var(--color-border)'};

  &:hover:not(:disabled) {
    background-color: ${({ $destructive }) =>
      $destructive
        ? 'var(--color-destructive-hover)'
        : 'var(--color-accent)'};
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 4px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
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

const Actions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

export default ConfirmDialog;
