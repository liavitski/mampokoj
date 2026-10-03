import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    setAdChecked: vi.fn(),
    clearAdChecked: vi.fn(),
    showToast: vi.fn(),
    refresh: vi.fn(),
  },
}));

// The actions are the network boundary; the toast system is a Radix portal that
// does not open reliably in jsdom. The router is mocked so a refresh is
// observable -- Next throws outside an app router context otherwise.
vi.mock('@/server/actions/setAdChecked', () => ({
  setAdChecked: mocks.setAdChecked,
  clearAdChecked: mocks.clearAdChecked,
}));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import MarkCheckedButton from '../MarkCheckedButton';
import RemoveCheckButton from '../RemoveCheckButton';

const AD_ID = '11111111-1111-4111-8111-111111111111';

/**
 * The two components' source, for the assertions about what they do *not* do.
 *
 * Read rather than rendered, for the reason `moderation-gate.test.ts` gives:
 * "this control has no confirmation dialog" is an absence, and an absence is
 * something a rendered tree cannot distinguish from a dialog that simply has
 * not been opened yet. `Function.prototype.toString` is not used instead because
 * it changes shape under a transpiler, which would make these assertions fail
 * for a reason that has nothing to do with the code.
 *
 * Resolved from `process.cwd()` rather than `import.meta.url`, because this file
 * runs in jsdom -- where `import.meta.url` is not a file: URL -- and
 * `migrations.test.ts` already establishes cwd-relative resolution as this
 * repo's convention.
 */
function readComponentSource(fileName: string): string {
  return readFileSync(
    join(process.cwd(), 'src/components/moderation', fileName),
    'utf8'
  );
}

const markCheckedSource = readComponentSource('MarkCheckedButton.tsx');
const removeCheckSource = readComponentSource('RemoveCheckButton.tsx');

/**
 * The source with its comments removed.
 *
 * Both components below have doc comments that *name* the thing they are
 * asserted not to do -- the check button explains why it is not `destructive`,
 * the remove button explains why it has no `ConfirmDialog`. A `not.toContain`
 * against the raw source therefore fails on the prose, which is the opposite of
 * what the assertion is for. Stripping comments keeps the assertion about code.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setAdChecked.mockResolvedValue({ success: true });
  mocks.clearAdChecked.mockResolvedValue({ success: true });
});

/** Opens the confirmation dialog and accepts it. */
async function confirmCheck() {
  const user = userEvent.setup();
  render(<MarkCheckedButton adId={AD_ID} />);

  await user.click(screen.getByRole('button', { name: /mark checked/i }));
  await user.click(screen.getByRole('button', { name: /yes, mark it checked/i }));

  return user;
}

describe('MarkCheckedButton', () => {
  it('marks the ad it was given', async () => {
    await confirmCheck();

    await waitFor(() =>
      expect(mocks.setAdChecked).toHaveBeenCalledWith(AD_ID)
    );
  });

  it('confirms before doing it', async () => {
    // Unlike ReportButton, which costs nothing if mistaken. Checking an ad is
    // the one moderation action that changes what visitors can do: afterwards
    // nobody can report it, and if the ad was reported the report is cleared. The
    // click alone must not call the action.
    const user = userEvent.setup();
    render(<MarkCheckedButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /mark checked/i }));

    expect(mocks.setAdChecked).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /yes, mark it checked/i })
    ).toBeInTheDocument();
  });

  it('is not styled as destructive, because it deletes nothing', async () => {
    // TakeDownButton is destructive; this one removes no ad and no photo. The
    // dialog copy carries the consequence, which is where it belongs.
    expect(stripComments(markCheckedSource)).not.toContain('destructive');
  });

  it('keeps the ad id out of the visible label but in the accessible name', async () => {
    // Both halves matter and neither implies the other. The visible label stays
    // "Mark checked" so two buttons fit on one line in the moderation page's
    // columns; the accessible name carries the id so a screen reader moving down
    // a ten-row list can tell which row each control belongs to.
    //
    // Reaching the button by its full accessible name first is itself the
    // assertion that the id is still announced -- a name of plain "Mark checked"
    // would fail to match and this test would fail rather than pass vacuously.
    render(<MarkCheckedButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', {
      name: `Mark checked for ad ${AD_ID}`,
    });

    expect(trigger).toHaveTextContent('Mark checked');
    expect(trigger.textContent).not.toContain(AD_ID);
  });

  it('refreshes the page once the ad is checked, so the row leaves the queue', async () => {
    // The page renders both lists from the server. Without a refresh a checked
    // ad would stay in the reported queue on screen, which reads as a check that
    // silently did nothing -- and the moderator would press it again.
    await confirmCheck();

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('does not refresh when the check was refused', async () => {
    // The queue is unchanged on a refusal, so re-rendering it is noise, and the
    // error toast is the only feedback needed.
    mocks.setAdChecked.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    await confirmCheck();

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('says what checking will do, so the irreversible part is explicit', async () => {
    // The copy is the whole argument for the dialog. A moderator who does not
    // know the report is cleared and the ad becomes unreportable is being asked
    // to consent to something they have not been told.
    const user = userEvent.setup();
    render(<MarkCheckedButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /mark checked/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/report/i);
  });

  it('leaves the control usable after a refusal, so a retry is possible', async () => {
    // Radix closes the dialog when the action is clicked, so the retry path is
    // reopening it -- not re-enabling a button that is no longer mounted. What
    // must not happen is the trigger being left disabled.
    mocks.setAdChecked.mockResolvedValue({
      success: false,
      error: 'Could not check this ad',
    });
    const user = userEvent.setup();
    render(<MarkCheckedButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', { name: /mark checked/i });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, mark it checked/i }));

    await waitFor(() => expect(trigger).not.toBeDisabled());

    mocks.setAdChecked.mockResolvedValue({ success: true });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, mark it checked/i }));

    await waitFor(() => expect(mocks.setAdChecked).toHaveBeenCalledTimes(2));
  });

  it('surfaces a rejected action instead of refreshing a list that did not change', async () => {
    mocks.setAdChecked.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<MarkCheckedButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /mark checked/i }));
    await user.click(screen.getByRole('button', { name: /yes, mark it checked/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe('RemoveCheckButton', () => {
  it('clears the check on the ad it was given', async () => {
    const user = userEvent.setup();
    render(<RemoveCheckButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /remove check/i }));

    await waitFor(() =>
      expect(mocks.clearAdChecked).toHaveBeenCalledWith(AD_ID)
    );
  });

  it('does not ask first', async () => {
    // This is the undo for the check, so it cannot need its own undo -- and a
    // dialog here would mean every correction costs two clicks, which is how
    // people stop correcting things. It removes nothing and destroys nothing;
    // the worst case is that an ad becomes reportable again, which is the state
    // it was in a moment ago anyway.
    expect(stripComments(removeCheckSource)).not.toContain('ConfirmDialog');
  });

  it('refreshes the page so the row offers Mark checked again', async () => {
    const user = userEvent.setup();
    render(<RemoveCheckButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /remove check/i }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('does not refresh when the removal was refused', async () => {
    mocks.clearAdChecked.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    const user = userEvent.setup();
    render(<RemoveCheckButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /remove check/i }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('leaves the control usable after a refusal, so a retry is possible', async () => {
    mocks.clearAdChecked.mockResolvedValue({
      success: false,
      error: 'Could not uncheck this ad',
    });
    const user = userEvent.setup();
    render(<RemoveCheckButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', { name: /remove check/i });
    await user.click(trigger);

    await waitFor(() => expect(trigger).not.toBeDisabled());

    mocks.clearAdChecked.mockResolvedValue({ success: true });
    await user.click(trigger);

    await waitFor(() => expect(mocks.clearAdChecked).toHaveBeenCalledTimes(2));
  });

  it('surfaces a rejected action instead of refreshing', async () => {
    mocks.clearAdChecked.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<RemoveCheckButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /remove check/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});