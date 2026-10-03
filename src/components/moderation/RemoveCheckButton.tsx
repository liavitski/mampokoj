'use client';

import * as React from 'react';

import { clearAdChecked } from '@/server/actions/setAdChecked';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';

import Button from '../Button';

type RemoveCheckButtonProps = {
  adId: string;
};

/**
 * Removes a moderator's check, putting an ad back into a reportable state.
 *
 * The only control on this page that does *not* ask first, and that is the whole
 * reason it is comfortable to: it is the undo for `MarkCheckedButton`. Making the
 * undo confirm would mean every correction costs two clicks and a dialog, which
 * is how people stop correcting things. It also has nothing to destroy -- no ad,
 * no photos, no data. The worst case is that an ad which had been marked solid
 * becomes reportable again, which is precisely the state it was in a moment ago
 * and the state a mistaken check needed to return to.
 *
 * Only rendered for an ad that is actually checked, so there is no need for a
 * "disabled" state or an already-removed state here.
 */
function RemoveCheckButton({ adId }: RemoveCheckButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, setIsPending] = React.useState(false);

  async function handleRemoveCheck() {
    setIsPending(true);

    try {
      const res = await clearAdChecked(adId);

      if (res.success) {
        showToast('Check removed. This ad can be reported again.', 'success');

        // The all-ads list is rendered from the server, so without this the row
        // keeps offering "Remove check" for an ad that no longer has one.
        router.refresh();
        return;
      }

      showToast(res.error || 'Could not remove the check', 'error');
    } catch {
      // The action is documented never to throw; handling it keeps a future
      // change from leaving this control permanently disabled.
      showToast('Could not remove the check', 'error');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="small"
      onClick={handleRemoveCheck}
      disabled={isPending}
      // Carries the id, for the reason `TakeDownButton` and `MarkCheckedButton`
      // both do: the visible label repeats down a ten-row list, so a moderator
      // tabbing through them otherwise has no way to tell which row they are on.
      // The visible text stays "Remove check" -- the id is for assistive tech,
      // not for the page.
      aria-label={`Remove check for ad ${adId}`}
    >
      Remove check
    </Button>
  );
}

export default RemoveCheckButton;