'use client';

import * as React from 'react';

import { reportAd } from '@/server/actions/reportAd';
import { useToast } from '../ToastProvider';

import Button from '../Button';

type ReportButtonProps = {
  adId: string;
};

/**
 * Flags a listing for the moderation queue.
 *
 * No confirmation dialog, unlike `DeleteAdButton`: reporting does not remove
 * anything, so the cost of a mistaken click is one row in a queue a human
 * reads. Asking twice to do something harmless teaches people that dialogs
 * mean nothing.
 *
 * A client component rather than a form, because it needs the action's result
 * to choose between two toasts and has to disable itself while the write is in
 * flight. `AdCardCompact` is an async Server Component and cannot hold either.
 */
function ReportButton({ adId }: ReportButtonProps) {
  const { showToast } = useToast();

  const [isPending, setIsPending] = React.useState(false);
  // Local rather than read back from the ad: `reportedAt` is withheld from
  // every public payload, so the server cannot tell this component the ad is
  // already flagged. Within a session this is accurate; across a reload it
  // resets, and the action refuses a second report anyway.
  const [isReported, setIsReported] = React.useState(false);

  async function handleReport() {
    setIsPending(true);

    try {
      const res = await reportAd(adId);

      if (res.success) {
        setIsReported(true);
        showToast('Thank you. This ad has been reported.', 'success');
        return;
      }

      // The action returns one message for already-reported, own ad and no such
      // ad alike, and shows it as-is rather than inventing a friendlier string
      // that would disagree with the server about what happened.
      showToast(res.error || 'Could not report this ad', 'error');
    } catch {
      // The action is documented never to throw. Handling it anyway keeps a
      // future change from leaving this control permanently disabled.
      showToast('Could not report this ad', 'error');
    } finally {
      setIsPending(false);
    }
  }

  if (isReported) {
    // Stays a button so it is still announced as a control, but inert: there is
    // no un-report and no second report, so there is nothing left to do.
    return (
      <Button
        variant="outline"
        size="small"
        disabled
        aria-label="Reported"
      >
        Reported
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="small"
      onClick={handleReport}
      disabled={isPending}
      aria-label="Report this ad"
    >
      Report ad
    </Button>
  );
}

export default ReportButton;
