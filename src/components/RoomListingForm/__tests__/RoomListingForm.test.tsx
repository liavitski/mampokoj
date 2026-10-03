/**
 * The create form's submission behaviour.
 *
 * Two things are asserted here that neither the action tests nor an E2E pass can
 * reach, and both were found by probing this component rather than by reading it.
 *
 * **The pending state never applied.** `disabled={isPending}` looked correct and
 * `setIsPending(true)` was the first line of the handler, but the button stayed
 * enabled for the whole request. The cause is that a *client* function passed to
 * `<form action>` is not run inside a transition, so `useState` updates from
 * within it are not flushed until the action settles -- by which point the
 * handler has already set the flag back to false. `useActionState` reports
 * `pending` from the action queue rather than from component state, which is why
 * the same `disabled` prop works there. A user could therefore submit twice, and
 * `createAd` would insert twice: the slot loop would put the second ad in the
 * next free slot, so the duplicate was invisible in the response and permanent in
 * the database.
 *
 * **A failed create was only ever a toast.** `showToast` fires and disappears;
 * nothing in the form said anything, and the form kept every value the user had
 * typed. The action's `error` is now state, rendered where the visitor is
 * looking, and the toast is gone for the failure case because a message that
 * vanishes is worse than one that stays.
 *
 * The action itself is mocked: it is the database boundary, and what is under
 * test is what this component does with its result.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    createAd: vi.fn(),
    showToast: vi.fn(),
    push: vi.fn(),
  },
}));

vi.mock('@/server/actions/createAd', () => ({ createAd: mocks.createAd }));
vi.mock('../../ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

import RoomListingForm from '../RoomListingForm';

const VALID = {
  title: 'A room in Prague',
  price: '4200',
  city: 'Praha',
  description: 'Bright, near the tram.',
  contactPhone: '+420123456789',
  availableFrom: '2030-01-01',
};

/** Opens the modal and returns the two "Create ad" buttons, trigger first. */
function openModal(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getAllByRole('button', { name: /create ad/i })[0]);
}

/**
 * Fills every required field.
 *
 * `availableFrom` is a controlled `input[type=date]` behind a Radix field, so
 * `userEvent.type` cannot reach it -- typing "2030-01-01" into a date input in
 * jsdom produces nothing. The native setter is used instead, which is what
 * React itself does, and an `input` event carries it into component state.
 *
 * `region` is a Radix `Select`, whose hidden input carries `name="region"` and is
 * not `required`, so it is left alone: an unset region is the server's problem,
 * and this file is about what happens after submission.
 */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const fields = [
    [/^title/i, VALID.title],
    [/^price/i, VALID.price],
    [/^city/i, VALID.city],
    [/^description/i, VALID.description],
    [/contact phone/i, VALID.contactPhone],
  ] as const;

  for (const [label, value] of fields) {
    const field = screen.getByLabelText(label);
    // Cleared before typing, not just typed into. React resets the form after a
    // submission, and that reset lands asynchronously -- so a `type` issued
    // straight after a submit appends to whatever is still there, producing
    // "A roomA room" and a form that fails `maxLength` on the phone field. The
    // retry tests refill, so this has to be idempotent.
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

  // `act` because the input event reaches `Datepicker`'s own `useState`, and an
  // unwrapped update warns.
  act(() => {
    setValue.call(date, VALID.availableFrom);
    date.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The submit button, which is the *last* "Create ad" once the modal is open. */
function submitButton() {
  return screen.getAllByRole('button', { name: /create ad/i }).at(-1)!;
}

/**
 * The modal's contents, for assertions about the form itself.
 *
 * Scoped because the page behind the modal carries its own copy of some strings
 * -- notably "Maximum 2 ads per user", which the create button's caption and
 * `createAd`'s refusal message share. Unscoped, `findByText` on that message
 * fails with "found multiple elements", which reads like a bug in the form and
 * is not one.
 */
function inModal() {
  return within(screen.getByRole('dialog'));
}

/** The refusal message, once the form has one. */
async function findRefusal(message: string) {
  return (await inModal().findByText(message)) as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAd.mockResolvedValue({ success: false, error: 'Create failed' });
});

describe('the create form', () => {
  it('sends the values that were typed', async () => {
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() => expect(mocks.createAd).toHaveBeenCalledTimes(1));
    const sent = mocks.createAd.mock.calls[0][0] as FormData;
    expect(sent.get('title')).toBe(VALID.title);
    expect(sent.get('price')).toBe(VALID.price);
    expect(sent.get('city')).toBe(VALID.city);
    expect(sent.get('description')).toBe(VALID.description);
    expect(sent.get('contactPhone')).toBe(VALID.contactPhone);
    expect(sent.get('availableFrom')).toBe(VALID.availableFrom);
  });

  /**
   * The first of the two findings. Before this was fixed the button stayed
   * enabled for the whole request, so this failed against the old code with
   * `disabled === false`.
   *
   * The promise is left unresolved on purpose: the assertion is about the state
   * of the button *while the write is in flight*, and a resolved mock would make
   * the window too short to observe.
   */
  it('disables the submit button while the ad is being created', async () => {
    let release!: (value: unknown) => void;
    mocks.createAd.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    expect(submitButton()).toBeDisabled();

    release({ success: false, error: 'Create failed' });
    await waitFor(() => expect(submitButton()).not.toBeDisabled());
  });

  /**
   * The user-visible consequence of the above, and the reason it matters: a
   * second submission is a second row in the database.
   *
   * Enter in a text field is implicit form submission, which the browser performs
   * regardless of whether the submit button is disabled -- so disabling the
   * button alone is not enough, and the duplicate is reachable without touching
   * the button at all. Both paths are asserted, because a fix that only disabled
   * the button would still fail the first.
   */
  it('does not create a second ad while the first is in flight', async () => {
    let release!: (value: unknown) => void;
    mocks.createAd.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    await user.type(screen.getByLabelText(/^title/i), '{Enter}');
    await user.click(submitButton());

    expect(mocks.createAd).toHaveBeenCalledTimes(1);

    release({ success: false, error: 'Create failed' });
    await waitFor(() => expect(mocks.createAd).toHaveBeenCalledTimes(1));
  });

  /**
   * The second finding. A refused create used to raise a toast and say nothing
   * in the form, so the only trace was gone within seconds.
   */
  it('shows the refusal in the form, where it stays', async () => {
    mocks.createAd.mockResolvedValue({
      success: false,
      error: 'Maximum 2 ads per user',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    expect(await findRefusal('Maximum 2 ads per user')).toBeVisible();
  });

  /**
   * Announced rather than merely drawn. A refusal the visitor cannot perceive
   * is the same as no refusal at all, and this message is the only feedback the
   * submission produces.
   */
  it('announces the refusal to assistive technology', async () => {
    mocks.createAd.mockResolvedValue({
      success: false,
      error: 'Maximum 2 ads per user',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    const message = await inModal().findByRole('alert');
    expect(message).toHaveTextContent('Maximum 2 ads per user');
  });

  /**
   * The form does *not* keep what was typed, and the reason is React rather
   * than this component: a form whose `action` is a function is reset after the
   * action completes (`recursivelyResetForms` in react-dom), so the fields come
   * back empty whichever action is used. Verified against the pre-change code,
   * which cleared them identically.
   *
   * Worth knowing, because "keep what the user typed after a failure" is the
   * usual expectation and it does not hold here. Preserving the values would
   * mean making every field controlled, which is a larger change than the
   * message this replaced and is not what was asked for. The message is the
   * part that was actually missing.
   */
  it('clears the fields after a refusal, because React resets a submitted form', async () => {
    mocks.createAd.mockResolvedValue({
      success: false,
      error: 'Could not create the ad',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await findRefusal('Could not create the ad');
    // Awaited rather than read straight away, because the reset is a commit
    // effect and lands after the action's promise resolves.
    await waitFor(() =>
      expect(screen.getByLabelText(/^title/i)).toHaveValue('')
    );
    expect(screen.getByLabelText(/^city/i)).toHaveValue('');
  });

  /**
   * A stale refusal has to go when a retry starts, or the visitor reads the
   * previous failure for the whole of the new request.
   *
   * `useActionState` holds the old state until the new action resolves, so this
   * needed `!pending` on the render rather than nothing at all -- without it the
   * message stayed up until the retry finished, which is exactly the interval
   * where it is most misleading.
   *
   * The form is refilled before the retry because React reset it after the first
   * submission (see the reset test above), and the required-field validation
   * would otherwise refuse the second click without ever calling the action.
   */
  it('clears the previous refusal while a retry is in flight', async () => {
    mocks.createAd.mockResolvedValueOnce({
      success: false,
      error: 'Could not create the ad',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    await findRefusal('Could not create the ad');

    await fillForm(user);

    let release!: (value: unknown) => void;
    mocks.createAd.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    await user.click(submitButton());

    await waitFor(() =>
      expect(inModal().queryByText('Could not create the ad')).not.toBeInTheDocument()
    );

    /*
     * Released and *awaited*, not released and left.
     *
     * An action left in flight when the test ends resolves during whichever test
     * runs next, against a component that has been unmounted -- and its
     * `showToast`/`router.push` calls then land in the next test's mocks. The
     * tests that follow assert those were *not* called, so they failed while
     * passing on their own, which is the least legible way for this to show up.
     */
    release({ success: true, adId: 'ad-1', userId: 'user-1' });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard/user-1'));
  });

  /**
   * And a retry that is refused again reports the *new* reason, rather than
   * leaving the first message up because it happens to be in state.
   */
  it('reports the new refusal after a retry', async () => {
    mocks.createAd.mockResolvedValueOnce({
      success: false,
      error: 'Could not create the ad',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());
    await findRefusal('Could not create the ad');

    await fillForm(user);
    mocks.createAd.mockResolvedValueOnce({
      success: false,
      error: 'Maximum 2 ads per user',
    });
    await user.click(submitButton());

    expect(await findRefusal('Maximum 2 ads per user')).toBeVisible();
    expect(inModal().queryByText('Could not create the ad')).not.toBeInTheDocument();
  });

  it('shows nothing before the form has been submitted', async () => {
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);

    expect(inModal().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirms and goes to the dashboard when the ad is created', async () => {
    mocks.createAd.mockResolvedValue({
      success: true,
      adId: 'ad-1',
      userId: 'user-1',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        'Ad created successfully',
        'success'
      )
    );
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/user-1');
  });

  it('closes the modal after a successful create', async () => {
    mocks.createAd.mockResolvedValue({
      success: true,
      adId: 'ad-1',
      userId: 'user-1',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await waitFor(() =>
      expect(
        screen.queryByLabelText(/^title/i)
      ).not.toBeInTheDocument()
    );
  });

  /**
   * No toast for a failure any more. It duplicated the in-form message and it
   * disappeared, so the two together meant the visitor's only lasting record of
   * a refusal was the one they had already stopped looking at.
   */
  it('does not also raise a toast for a refusal', async () => {
    mocks.createAd.mockResolvedValue({
      success: false,
      error: 'Maximum 2 ads per user',
    });
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await findRefusal('Maximum 2 ads per user');
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('does not navigate when the ad is refused', async () => {
    const user = userEvent.setup();
    render(<RoomListingForm />);
    await openModal(user);
    await fillForm(user);

    await user.click(submitButton());

    await findRefusal('Create failed');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  /**
   * `createAd` is documented never to throw, but the old `isPending` flag would
   * have been stuck true forever if it did. A throw now reaches the route's
   * `error.tsx` instead, so what is asserted here is only the negative that was
   * previously reachable: nothing treats a thrown action as a create.
   *
   * The rejection is awaited rather than left, for the reason given above -- an
   * escaping promise lands its side effects in the next test.
   */
  it('lets a thrown action escape rather than reporting it as a create', async () => {
    mocks.createAd.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();

    // No error boundary around the form, so React's rethrow of a failed action
    // surfaces here as an unhandled rejection. That is the point: the form must
    // not convert a crash into a success, and in the app the route's
    // `src/app/error.tsx` is what catches it. Asserting the escape is what
    // pins the boundary's job -- if this ever stopped escaping, something had
    // started swallowing the failure.
    // React rethrows the failed action into the nearest error boundary; there
    // isn't one here, so it reaches `window.onerror`. Caught rather than
    // prevented so vitest's own unhandled-error reporting stays quiet -- the
    // assertion below is that it escaped, not that it was swallowed.
    const escaped: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      event.preventDefault();
      event.stopPropagation();
      escaped.push(event.error ?? event.message);
    };
    window.addEventListener('error', onError);

    try {
      render(<RoomListingForm />);
      await openModal(user);
      await fillForm(user);

      await user.click(submitButton());

      await waitFor(() => expect(escaped.length).toBeGreaterThan(0));

      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.showToast).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', onError);
    }
  });
});
