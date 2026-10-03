import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    reportAd: vi.fn(),
    showToast: vi.fn(),
  },
}));

// The action is the network boundary; the toast system is a Radix portal that
// does not open reliably in jsdom.
vi.mock('@/server/actions/reportAd', () => ({ reportAd: mocks.reportAd }));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

import ReportButton from '../ReportButton';

const AD_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reportAd.mockResolvedValue({ success: true });
});

describe('ReportButton', () => {
  it('offers a control with a name a screen reader can read', () => {
    render(<ReportButton adId={AD_ID} />);

    // Role + name, not a text match: the name is what actually reaches
    // assistive technology, and this is the assertion that would catch the
    // label being lost to an icon or a styled span.
    expect(
      screen.getByRole('button', { name: /report this ad/i })
    ).toBeInTheDocument();
  });

  it('reports the ad it was given, once per click', async () => {
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /report this ad/i }));

    expect(mocks.reportAd).toHaveBeenCalledTimes(1);
    expect(mocks.reportAd).toHaveBeenCalledWith(AD_ID);
  });

  it('confirms when the report was accepted', async () => {
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /report this ad/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.stringMatching(/thank you/i),
        'success'
      )
    );
  });

  it('explains a refusal rather than claiming success', async () => {
    // The action returns one message for already-reported, own ad and no such
    // ad alike. Whichever it was, the visitor is not told a report was filed.
    mocks.reportAd.mockResolvedValue({
      success: false,
      error: 'Could not report this ad',
    });
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /report this ad/i }));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        'Could not report this ad',
        'error'
      )
    );
    expect(mocks.showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/thank you/i),
      'success'
    );
  });

  it('does not fire a second report while the first is in flight', async () => {
    // The write is first-report-wins, so a double click would cost nothing at
    // the database -- but it would produce a confusing error toast over a
    // successful action, so the control is inert until the first settles.
    let release!: (value: { success: boolean }) => void;
    mocks.reportAd.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    const button = screen.getByRole('button', { name: /report this ad/i });
    await user.click(button);
    expect(button).toBeDisabled();

    await user.click(button);
    expect(mocks.reportAd).toHaveBeenCalledTimes(1);

    release({ success: true });
    // Not "the button re-enables": on success it is replaced by the reported
    // state, so waiting on that would assert the wrong thing. The point here is
    // only that the pending state settles.
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
  });

  it('stops offering the control once the ad has been reported', async () => {
    // There is no un-report and no re-report, so once the flag is set there is
    // nothing left to do. Leaving a live "report" control would imply a second
    // report is still possible, which is the same reasoning BlurredPhone uses
    // for dropping its button after the number is revealed.
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    await user.click(screen.getByRole('button', { name: /report this ad/i }));

    expect(
      await screen.findByRole('button', { name: /reported/i })
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /report this ad/i })
    ).not.toBeInTheDocument();
  });

  it('re-enables itself after a refusal, so a retry is possible', async () => {
    mocks.reportAd.mockResolvedValueOnce({
      success: false,
      error: 'Could not report this ad',
    });
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    const button = screen.getByRole('button', { name: /report this ad/i });
    await user.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());

    expect(screen.getByRole('button', { name: /report this ad/i })).toBe(button);
  });

  it('surfaces a rejected action instead of hanging on a disabled button', async () => {
    // The action is documented never to throw, but a client component that
    // assumes it would leave the control permanently disabled if it ever did.
    mocks.reportAd.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<ReportButton adId={AD_ID} />);

    const button = screen.getByRole('button', { name: /report this ad/i });
    await user.click(button);

    await waitFor(() => expect(button).not.toBeDisabled());
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.any(String),
      'error'
    );
  });
});
