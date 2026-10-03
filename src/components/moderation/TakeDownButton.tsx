'use client';

import * as React from 'react';

import { deleteAdAsModerator } from '@/server/actions/deleteAdAsModerator';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

import ConfirmDialog from '../ConfirmDialog';

type TakeDownButtonProps = {
  adId: string;
};

/**
 * Removes a reported ad, for a moderator.
 *
 * Confirms first, unlike `ReportButton`: reporting adds a row to a queue and
 * costs nothing if mistaken, while this destroys somebody's listing and their
 * photos with no way back. The asymmetry is the reason one has a dialog and the
 * other does not.
 *
 * The page has already refused to render this for a non-moderator, and the
 * action refuses them again -- the client check is presentation, the server
 * check is the boundary, and neither is doing the other's job.
 */
function TakeDownButton({ adId }: TakeDownButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  async function handleTakeDown() {
    setIsPending(true);

    try {
      const res = await deleteAdAsModerator(adId);

      if (res.success) {
        showToast('Ad taken down', 'success');

        /**
         * The queue is rendered from the server, so without this the ad that
         * was just taken down stays on screen until a manual reload -- which
         * reads as a takedown that silently did nothing, on every row of a
         * queue a moderator is working through. Same pattern as
         * `UploadBtn` and `AdPhotosGallery` after their own writes.
         *
         * Success only: on a refusal the queue is unchanged, so re-rendering it
         * would be noise, and the error toast is the only feedback needed.
         */
        router.refresh();
        return;
      }

      showToast(res.error || 'Could not take the ad down', 'error');
    } catch {
      // The action is documented never to throw; handling it keeps a future
      // change from leaving the dialog stuck open with a disabled button.
      showToast('Could not take the ad down', 'error');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ConfirmDialog
      triggerLabel="Take down"
      triggerLabelOverride={`Take down ad ${adId}`}
      dialogTitle="Take this ad down?"
      description="This permanently deletes the ad, its photos and its report. It cannot be undone, and the person who posted it will not be told."
      confirmLabel="Yes, take it down"
      onConfirm={handleTakeDown}
      destructive
      isPending={isPending}
    />
  );
}

export default TakeDownButton;
