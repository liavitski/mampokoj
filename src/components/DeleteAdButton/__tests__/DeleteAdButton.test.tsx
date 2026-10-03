import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    deleteAdById: vi.fn(),
    showToast: vi.fn(),
    push: vi.fn(),
  },
}));

// The action is the network boundary; the toast system is a Radix portal that does
// not open reliably in jsdom. The router is mocked because Next throws outside an
// app router context.
vi.mock('@/server/actions/deleteAd', () => ({ deleteAdById: mocks.deleteAdById }));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

import DeleteAdButton from '../DeleteAdButton';

const AD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'oauth-account-id-42';

const source = readFileSync(
  join(process.cwd(), 'src/components/DeleteAdButton/DeleteAdButton.tsx'),
  'utf8'
);

/**
 * The file with its comments removed.
 *
 * The doc comment above deliberately names every one of the things the
 * assertions below forbid -- `Alert.Root`, `Overlay`, `Content`, `overlayShow`,
 * `@radix-ui/react-alert-dialog` -- because explaining what was removed is the
 * point of the comment. A raw `not.toContain` therefore fails on the prose, which
 * is the opposite of what it is for.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/** Opens the confirmation dialog and accepts it. */
async function confirmDelete() {
  const user = userEvent.setup();
  render(<DeleteAdButton adId={AD_ID} />);

  await user.click(screen.getByRole('button', { name: /delete ad/i }));
  await user.click(screen.getByRole('button', { name: /yes, delete ad/i }));

  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteAdById.mockResolvedValue({
    success: true,
    adId: AD_ID,
    userId: USER_ID,
  });
});

describe('DeleteAdButton', () => {
  it('deletes the ad it was given, once confirmed', async () => {
    await confirmDelete();

    await waitFor(() =>
      expect(mocks.deleteAdById).toHaveBeenCalledWith(AD_ID)
    );
  });

  it('confirms before destroying anything', async () => {
    // The owner's own listing and its photos. Destroying it cannot be undone, so
    // the click alone must not call the action.
    const user = userEvent.setup();
    render(<DeleteAdButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /delete ad/i }));

    expect(mocks.deleteAdById).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /yes, delete ad/i })
    ).toBeInTheDocument();
  });

  it('sends the owner back to their dashboard after a successful delete', async () => {
    await confirmDelete();

    // Not a refresh: the ad is gone and the dashboard is where the owner's
    // remaining ads are listed, so a redirect is what stops the control sitting
    // on a row that no longer exists.
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/dashboard/${USER_ID}`));
    expect(mocks.showToast).toHaveBeenCalledWith(
      'Ad deleted successfully',
      'success'
    );
  });

  it('stays put and explains itself when the delete is refused', async () => {
    mocks.deleteAdById.mockResolvedValue({
      success: false,
      error: 'Ad not found',
    });
    await confirmDelete();

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith('Ad not found', 'error')
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('re-enables itself after a refused delete, so a retry is possible', async () => {
    // Radix closes the dialog when the action is clicked, so the retry path is
    // reopening it rather than re-enabling a mounted button. What must not
    // happen is the trigger being left disabled.
    mocks.deleteAdById.mockResolvedValue({
      success: false,
      error: 'Ad not found',
    });
    const user = userEvent.setup();
    render(<DeleteAdButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', { name: /delete ad/i });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, delete ad/i }));

    await waitFor(() => expect(trigger).not.toBeDisabled());

    mocks.deleteAdById.mockResolvedValue({
      success: true,
      adId: AD_ID,
      userId: USER_ID,
    });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, delete ad/i }));

    await waitFor(() => expect(mocks.deleteAdById).toHaveBeenCalledTimes(2));
  });

  it('survives an action that rejects rather than leaving itself disabled forever', async () => {
    // `handleDelete` awaited the action with no try/catch, so a rejected promise
    // skipped the `setIsPending(false)` on every path and left the control
    // permanently disabled with no message. The same bug `ReportButton` and
    // `TakeDownButton` already guard against; this is the assertion that it does
    // not come back when the dialog was consolidated.
    mocks.deleteAdById.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<DeleteAdButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', { name: /delete ad/i });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, delete ad/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    await waitFor(() => expect(trigger).not.toBeDisabled());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('the consolidated dialog', () => {
  it('uses the shared ConfirmDialog', () => {
    // `ConfirmDialog` was extracted rather than copied so there would be one
    // dialog in the app. This file then grew its own copy anyway -- a second
    // Overlay, Content, Title, Description and keyframes animation, ~50 lines
    // that had to be kept in step with the first by hand. Asserted from source
    // because "there is no duplicated dialog here" is an absence, which no
    // rendered tree can distinguish from a dialog that has not been opened yet.
    expect(code).toContain("import ConfirmDialog from '../ConfirmDialog'");
  });

  it('no longer builds its own alert-dialog root or overlay styles', () => {
    // Each of these was one half of the copy. Named explicitly so the failure
    // says which half came back.
    expect(code, 'a second Alert.Root').not.toContain('Alert.Root');
    expect(code, 'a second overlay').not.toMatch(/styled\(Alert\.Overlay\)/);
    expect(code, 'a second dialog content panel').not.toMatch(
      /styled\(Alert\.Content\)/
    );
    expect(code, 'a second copy of the overlay keyframes').not.toContain(
      'overlayShow'
    );
    expect(code, 'a second radix alert-dialog import').not.toContain(
      '@radix-ui/react-alert-dialog'
    );
  });

  it('no longer declares styled-components of its own', () => {
    // With the dialog gone the file has no styling left to do, so it should not
    // import styled-components at all.
    expect(code).not.toContain('styled-components');
  });

  it('keeps the design-system button as the trigger, rather than the dialog default', () => {
    // The trigger sits in the owner's ad row and is styled by `Button` with a
    // `margin-left: auto` that pushes it to the right of the row. Falling back to
    // ConfirmDialog's internal button would change its look and its position --
    // a visual regression bought by a refactor, which is the reason the shared
    // dialog accepts a trigger element at all.
    //
    // Whitespace-tolerant because the element is written across lines, and a
    // formatter is free to move it.
    expect(code).toMatch(/trigger=\{\s*<Button/);
    expect(code).toContain('variant="fill"');
  });
});