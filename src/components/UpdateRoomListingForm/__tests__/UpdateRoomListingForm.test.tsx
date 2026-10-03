/**
 * The update form's submission behaviour.
 *
 * This is the second of the two forms that bypassed `useActionState`, and it is
 * here because the same change was made twice for the same reasons -- not
 * because the second one is more interesting. Read
 * `RoomListingForm.test.tsx` for the full account of the two findings; they
 * apply unchanged, with one difference worth stating:
 *
 * `updateAd` takes the ad id as a separate argument and edits a row that already
 * exists, so there is no equivalent of `createAd`'s slot loop to absorb a double
 * submit. The pre-existing defect was two `UPDATE`s of the same row: harmless to
 * the data, and still a duplicated round trip and a duplicated toast.
 *
 * `UpdateRoomListingForm` is also the form with a pre-filled default value on
 * every field, which is what makes the "React resets the form" behaviour
 * observable here as data loss rather than an empty form.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    updateAd: vi.fn(),
    showToast: vi.fn(),
    push: vi.fn(),
  },
}));

vi.mock('@/server/actions/updateAd', () => ({ updateAd: mocks.updateAd }));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

import UpdateRoomListingForm from '../UpdateRoomListingForm';

const AD_ID = '11111111-1111-4111-8111-111111111111';

/**
 * `price` is a string in the schema, not a number -- `numeric()` in Postgres
 * with a string drizzle mapping -- which the type here enforces. Worth noting
 * because the form posts it through a `type="number"` input, so it is typed as
 * text at both ends and only the database is numeric.
 */
const AD = {
  id: AD_ID,
  title: 'A room in Prague',
  price: '4200',
  city: 'Praha',
  region: 'PR',
  availableFrom: new Date('2030-01-01T00:00:00.000Z'),
  description: 'Bright, near the tram.',
  contactPhone: '+420123456789',
};

/** The two "Update ad" buttons once the modal is open, trigger first. */
function openModal(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getAllByRole('button', { name: /update ad/i })[0]);
}

/** The submit button, which is the *last* "Update ad" once the modal is open. */
function submitButton() {
  return screen.getAllByRole('button', { name: /update ad/i }).at(-1)!;
}

/**
 * The modal's contents, for assertions about the form itself. Scoped because the
 * page behind the modal carries other "Update ad" buttons -- one per ad on the
 * dashboard -- and an unscoped query finds them all.
 */
function inModal() {
  return within(screen.getByRole('dialog'));
}

/** Fills every required field, clearing first so it is safe to call twice. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const fields = [
    [/^title/i, 'A bigger room'],
    [/^price/i, '5000'],
    [/^city/i, 'Brno'],
    [/^description/i, 'Now with a balcony.'],
    [/contact phone/i, '+420987654321'],
  ] as const;

  for (const [label, value] of fields) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  }

  const date = document.querySelector(
    'input[name="availableFrom"]'
  ) as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;

  // `act` because the event reaches `Datepicker`'s own `useState`.
  act(() => {
    setValue.call(date, '2031-06-01');
    date.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateAd.mockResolvedValue({ success: false, error: 'Update failed' });
});

describe('the update form', () => {
  it('opens pre-filled from the ad it was given', async () => {
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);

    // The defaults are the point of this form -- it edits an existing row, so
    // the values have to arrive rather than be typed.
    expect(screen.getByLabelText(/^title/i)).toHaveValue(AD.title);
    expect(screen.getByLabelText(/^price/i)).toHaveValue(4200); // number input, so a number
    expect(screen.getByLabelText(/^city/i)).toHaveValue(AD.city);
    expect(screen.getByLabelText(/^description/i)).toHaveValue(AD.description);
  });

  it('updates the ad it was given, not one named by the form', async () => {
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() => expect(mocks.updateAd).toHaveBeenCalledTimes(1));
    // The id is the component's prop, not form input -- nothing in the markup
    // could redirect an edit to a different row.
    expect(mocks.updateAd.mock.calls[0][0]).toBe(AD_ID);

    const sent = mocks.updateAd.mock.calls[0][1] as FormData;
    expect(sent.get('title')).toBe('A bigger room');
    expect(sent.get('price')).toBe('5000');
    expect(sent.get('city')).toBe('Brno');
    expect(sent.get('contactPhone')).toBe('+420987654321');
    expect(sent.get('availableFrom')).toBe('2031-06-01');
  });

  /** The same finding as the create form: this never applied. */
  it('disables the submit button while the update is in flight', async () => {
    let release!: (value: unknown) => void;
    mocks.updateAd.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    expect(submitButton()).toBeDisabled();

    release({ success: false, error: 'Update failed' });
    await waitFor(() => expect(submitButton()).not.toBeDisabled());
  });

  /**
   * Both paths, because a disabled button does not stop Enter: implicit
   * submission is performed by the form, not the button.
   */
  it('does not send the update twice while the first is in flight', async () => {
    let release!: (value: unknown) => void;
    mocks.updateAd.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    await user.type(screen.getByLabelText(/^title/i), '{Enter}');
    await user.click(submitButton());

    expect(mocks.updateAd).toHaveBeenCalledTimes(1);

    release({ success: false, error: 'Update failed' });
    await waitFor(() => expect(mocks.updateAd).toHaveBeenCalledTimes(1));
  });

  it('shows a refusal in the form, where it stays', async () => {
    mocks.updateAd.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    expect(await inModal().findByRole('alert')).toHaveTextContent('Not found');
  });

  it('announces the refusal to assistive technology', async () => {
    mocks.updateAd.mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    // By role rather than by text: a refusal that is drawn but not announced is
    // not received by a screen reader, and this is the only feedback a failed
    // update produces now that the toast is gone.
    expect(await inModal().findByRole('alert')).toBeVisible();
  });

  it('shows nothing before the form has been submitted', async () => {
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);

    expect(inModal().queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * `useActionState` holds the previous state until the new action resolves, so
   * this needed `!pending` on the render -- otherwise a retry leaves the last
   * refusal up for the whole request.
   */
  it('clears the previous refusal while a retry is in flight', async () => {
    mocks.updateAd.mockResolvedValueOnce({
      success: false,
      error: 'Could not update the ad',
    });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    expect(await inModal().findByRole('alert')).toHaveTextContent(
      'Could not update the ad'
    );

    await fillForm(user);

    let release!: (value: unknown) => void;
    mocks.updateAd.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    await user.click(submitButton());

    await waitFor(() =>
      expect(inModal().queryByRole('alert')).not.toBeInTheDocument()
    );

    release({ success: true, userId: 'user-1' });
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  });

  /**
   * And the retry reports its own outcome rather than leaving the first message
   * up because it happens to be what is in state.
   */
  it('reports the new refusal after a retry', async () => {
    mocks.updateAd.mockResolvedValueOnce({
      success: false,
      error: 'Could not update the ad',
    });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    await inModal().findByText('Could not update the ad');

    await fillForm(user);
    mocks.updateAd.mockResolvedValueOnce({ success: false, error: 'Not found' });
    await user.click(submitButton());

    expect(await inModal().findByText('Not found')).toBeVisible();
    expect(inModal().queryByText('Could not update the ad')).not.toBeInTheDocument();
  });

  it('confirms and goes to the dashboard when the update succeeds', async () => {
    mocks.updateAd.mockResolvedValue({ success: true, userId: 'user-1' });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        'Ad updated successfully',
        'success'
      )
    );
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/user-1');
  });

  it('closes the modal after a successful update', async () => {
    mocks.updateAd.mockResolvedValue({ success: true, userId: 'user-1' });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() =>
      expect(screen.queryByLabelText(/^title/i)).not.toBeInTheDocument()
    );
  });

  it('does not also raise a toast for a refusal', async () => {
    mocks.updateAd.mockResolvedValue({ success: false, error: 'Not found' });
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await inModal().findByText('Not found');
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('does not navigate when the update is refused', async () => {
    const user = userEvent.setup();
    render(<UpdateRoomListingForm ad={AD} />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await inModal().findByText('Update failed');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
