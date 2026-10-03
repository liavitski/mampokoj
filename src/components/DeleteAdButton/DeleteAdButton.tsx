'use client';

import * as React from 'react';

import { deleteAdById } from '@/server/actions/deleteAd';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

import Button from '../Button';
import ConfirmDialog from '../ConfirmDialog';

type DeleteButtonProps = {
  adId: string;
};

/**
 * Deletes one of the owner's own ads.
 *
 * On the shared `ConfirmDialog`, which it did not use before. It had been given
 * its own `Alert.Root`, `Overlay`, `Content`, `Title`, `Description` and a second
 * copy of the overlay keyframes -- roughly 50 lines duplicated from
 * `ConfirmDialog`, kept in step by hand and drifting. That is the erosion
 * `HANDOFF.md` §9.5 names as the way the moderation surface grows into an admin
 * UI by accident.
 *
 * It keeps `Button` as the trigger rather than taking the dialog's default button,
 * because this control sits in the owner's ad row with a `margin-left: auto` that
 * pushes it to the right edge; falling back would have changed how it looks and
 * where it sits as a side effect of a refactor. `ConfirmDialog` takes a trigger
 * element for exactly that case.
 *
 * The `try/catch` was added with the move. The handler used to await the action
 * with no `catch`, so a rejected promise skipped `setIsPending(false)` on every
 * path and left the button permanently disabled with nothing on screen to say why
 * -- the shape of bug `ReportButton` and `TakeDownButton` already guard against.
 */
function DeleteAdButton({ adId }: DeleteButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [isPending, setIsPending] = React.useState(false);

  async function handleDelete() {
    setIsPending(true);

    try {
      const res = await deleteAdById(adId);

      if (res.success) {
        showToast('Ad deleted successfully', 'success');

        /**
         * A redirect rather than a refresh: the ad is gone and the dashboard is
         * where the owner's remaining ads are listed, so staying would leave the
         * control on a row that no longer exists.
         */
        router.push(`/dashboard/${res.userId}`);
        return;
      }

      // The action's own message, rather than a friendlier string that could
      // disagree with the server about what happened.
      showToast(res.error || 'Delete failed', 'error');
    } catch {
      // The action is documented never to throw; handling it anyway is what keeps
      // a network failure from stranding this control in a permanently disabled
      // state with no explanation.
      showToast('Delete failed', 'error');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="fill"
          size="small"
          destructive
          style={{ marginLeft: 'auto' }}
        >
          Delete ad
        </Button>
      }
      triggerLabel="Delete ad"
      dialogTitle="Are you absolutely sure?"
      description="This action cannot be undone. This will permanently delete your ad and remove your ad data from our servers."
      confirmLabel="Yes, delete ad"
      onConfirm={handleDelete}
      destructive
      isPending={isPending}
    />
  );
}

export default DeleteAdButton;