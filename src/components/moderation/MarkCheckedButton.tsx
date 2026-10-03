'use client';

import * as React from 'react';

import { setAdChecked } from '@/server/actions/setAdChecked';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

import ConfirmDialog from '../ConfirmDialog';

type MarkCheckedButtonProps = {
  adId: string;
};

/**
 * Marks an ad as reviewed and legitimate, so it can never be reported again.
 *
 * Confirms first, and this is the interesting asymmetry on the page.
 * `TakeDownButton` confirms because it destroys something. This one confirms
 * because it changes what *visitors* can do: after it runs, no report against
 * this ad will ever be accepted, and if the ad was reported the report is
 * cleared along with it. That consequence is invisible in the button label --
 * "Mark checked" sounds like bookkeeping -- so the dialog copy is the only place
 * it can be stated, and stating it is the reason the dialog exists.
 *
 * Not styled `destructive`, unlike `TakeDownButton`: nothing is deleted here. The
 * ad stays up on the public grid and stays deletable from either list, so a
 * mistaken check is a bounded mistake, not a destroyed listing.
 *
 * `router.refresh()` on success only, for the reason `TakeDownButton` gives:
 * both lists here are rendered from the server, so without it the ad would sit
 * in the reported queue looking untouched -- and the moderator would press the
 * button again.
 */
function MarkCheckedButton({ adId }: MarkCheckedButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  async function handleMarkChecked() {
    setIsPending(true);

    try {
      const res = await setAdChecked(adId);

      if (res.success) {
        showToast('Ad marked checked. It cannot be reported now.', 'success');
        router.refresh();
        return;
      }

      showToast(res.error || 'Could not mark the ad checked', 'error');
    } catch {
      // The action is documented never to throw; handling it keeps a future
      // change from leaving the dialog stuck open with a disabled button.
      showToast('Could not mark the ad checked', 'error');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <ConfirmDialog
      triggerLabel="Mark checked"
      // The visible label repeats on every row, so the accessible name carries
      // the id -- otherwise a moderator tabbing through a queue of twenty
      // identical "Mark checked" buttons has no way to tell which is focused.
      // Phrased so it still opens with the action, matching how TakeDownButton
      // reads ("Take down ad <id>").
      triggerLabelOverride={`Mark checked for ad ${adId}`}
      dialogTitle="Mark this ad as checked?"
      description="This tells the site nobody can report this ad any more. If anybody has already reported it, the report is cleared and the ad leaves the queue. You can undo this from the all ads list, but the report will not come back."
      confirmLabel="Yes, mark it checked"
      onConfirm={handleMarkChecked}
      isPending={isPending}
    />
  );
}

export default MarkCheckedButton;