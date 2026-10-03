import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    deleteAdAsModerator: vi.fn(),
    showToast: vi.fn(),
    refresh: vi.fn(),
  },
}));

// The action is the network boundary; the toast system is a Radix portal that
// does not open reliably in jsdom. The router is mocked so a refresh is
// observable -- Next throws outside an app router context otherwise.
vi.mock('@/server/actions/deleteAdAsModerator', () => ({
  deleteAdAsModerator: mocks.deleteAdAsModerator,
}));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import TakeDownButton from '../TakeDownButton';

const AD_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteAdAsModerator.mockResolvedValue({ success: true });
});

/** Opens the confirmation dialog and accepts it. */
async function confirmTakeDown() {
  const user = userEvent.setup();
  render(<TakeDownButton adId={AD_ID} />);

  await user.click(screen.getByRole('button', { name: /take down/i }));
  await user.click(screen.getByRole('button', { name: /yes, take it down/i }));

  return user;
}

describe('TakeDownButton', () => {
  it('removes the ad it was given', async () => {
    await confirmTakeDown();

    await waitFor(() =>
      expect(mocks.deleteAdAsModerator).toHaveBeenCalledWith(AD_ID)
    );
  });

  it('refreshes the queue once the ad is gone, so the row disappears', async () => {
    // The moderation page renders the queue from the server. Without a
    // refresh the deleted ad stays on screen until a manual reload, which
    // reads as a takedown that silently failed -- and a moderator working a
    // queue of reports would hit it on every single row.
    await confirmTakeDown();

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('does not refresh when the takedown was refused', async () => {
    // Refreshing on failure re-renders the same queue for no reason, and the
    // error toast is the only feedback the moderator needs. The assertion is
    // on the absence of a call, so it is only meaningful once the success case
    // above is known to make one.
    mocks.deleteAdAsModerator.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    await confirmTakeDown();

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('confirms before destroying the ad', async () => {
    // Unlike ReportButton, which costs nothing if mistaken. Destroying a
    // listing and its photos cannot be undone, so the click alone must not
    // call the action.
    const user = userEvent.setup();
    render(<TakeDownButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /take down/i }));

    expect(mocks.deleteAdAsModerator).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /yes, take it down/i })
    ).toBeInTheDocument();
  });

  it('leaves the control usable after a refusal, so a retry is possible', async () => {
    // Radix closes the dialog when the action is clicked, so the retry path is
    // reopening it -- not re-enabling a button that is no longer mounted.
    // What must not happen is the trigger being left disabled, which is the
    // shape of bug `ReportButton`'s rejected-promise test guards against.
    mocks.deleteAdAsModerator.mockResolvedValue({
      success: false,
      error: 'Could not take the ad down',
    });
    const user = userEvent.setup();
    render(<TakeDownButton adId={AD_ID} />);

    const trigger = screen.getByRole('button', { name: /take down/i });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, take it down/i }));

    await waitFor(() => expect(trigger).not.toBeDisabled());

    // The retry really does reach the action again.
    mocks.deleteAdAsModerator.mockResolvedValue({ success: true });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /yes, take it down/i }));

    await waitFor(() => expect(mocks.deleteAdAsModerator).toHaveBeenCalledTimes(2));
  });

  it('surfaces a rejected action instead of leaving the row stale', async () => {
    mocks.deleteAdAsModerator.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<TakeDownButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /take down/i }));
    await user.click(screen.getByRole('button', { name: /yes, take it down/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});