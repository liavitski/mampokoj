'use client';

import React from 'react';
import * as Form from '@radix-ui/react-form';
import styled from 'styled-components';
import { QUERIES, WEIGHTS, MAX_ADS_PER_USER } from '@/constants';
import { CZ_REGIONS } from '@/constants';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';
import { createAd } from '@/server/actions/createAd';

import RegionSelect from '../RegionSelect';
import Datepicker from '../Datepicker';
import Button from '../Button';
import Modal from '../Modal';

/**
 * What the last submission returned, as far as the form is concerned.
 *
 * `error` is `null` rather than `''` before anything has been submitted, so
 * "nothing has gone wrong yet" and "it went wrong but said nothing" stay
 * distinguishable. `createAd` always returns a message on failure, so the
 * fallback here is unreachable in practice and exists only so a missing message
 * cannot render as a blank alert.
 */
type CreateAdFormState = {
  error: string | null;
};

const INITIAL_STATE: CreateAdFormState = { error: null };

function RoomListingForm() {
  const [open, setOpen] = React.useState(false);

  const router = useRouter();
  const { showToast } = useToast();

  /**
   * `useActionState`, per `10-error-handling.md`: the action returns the state
   * the form renders, and `pending` comes from React's action queue.
   *
   * **This replaced a `useState` flag, and the flag never worked.** A *client*
   * function passed to `<form action>` is not run inside a transition, so
   * `setIsPending(true)` on the first line of the handler was not flushed until
   * the action settled -- by which point the handler had already set it back to
   * false. `disabled={isPending}` was therefore inert: the button stayed enabled
   * for the whole request. Nothing about it looked wrong, and the handler read
   * as though it were guarding the button.
   *
   * The consequence was a duplicate row rather than an error message:
   * `createAd`'s slot loop puts a second insert in the next free slot, so a
   * double submission consumed two of the user's ad allowance and reported
   * success both times. Reachable without touching the button at all, because
   * Enter in a text field is implicit submission, which a disabled button does
   * not block.
   *
   * The `action` prop rather than a click handler is also what makes the form
   * post without JavaScript; see the note on `progressive enhancement` below.
   */
  const [state, formAction, pending] = React.useActionState(
    async (
      _prev: CreateAdFormState,
      formData: FormData
    ): Promise<CreateAdFormState> => {
      const res = await createAd(formData);

      if (res.success) {
        showToast('Ad created successfully', 'success');
        setOpen(false);
        router.push(`/dashboard/${res.userId}`);

        return { error: null };
      }

      /**
       * No toast for a refusal. It duplicated the message now rendered in the
       * form, and it vanished after a few seconds -- so the only lasting record
       * of a failure was the one the visitor had already stopped looking at.
       */
      return { error: res.error || 'Create failed' };
    },
    INITIAL_STATE
  );

  return (
    <>
      <ModalButtonWrapper>
        <ModalButton
          variant="fill"
          size="small"
          onClick={() => setOpen(true)}
        >
          Create ad
        </ModalButton>
        <Text>Maximum {MAX_ADS_PER_USER} ads per user</Text>
      </ModalButtonWrapper>
      <Modal
        open={open}
        onOpenChange={setOpen}
        disableOutsideClose={true}
      >
        {/*
         * Progressive enhancement: with `action` pointing at React's own form
         * action, the server-rendered form carries the action id and submits
         * without JavaScript. That is not yet true here -- the modal is only
         * rendered once `open` is true, which requires a click -- so the claim
         * is aspirational until the form is reachable without a click. It is
         * still the right shape, because a client function as `action` can never
         * do this.
         */}
        <Wrapper action={formAction}>
          <Field name="title">
            <LabelWrapper>
              <Label>Title</Label>
              <Error match="valueMissing">Title is required</Error>
              <Error match="tooLong">Title is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Input name="title" required maxLength={60} />
            </Form.Control>
          </Field>

          <Field name="price">
            <LabelWrapper>
              <Label>Price</Label>
              <Error match="valueMissing">Price is required</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Input
                name="price"
                type="number"
                step="0.01"
                required
                min={0}
                max={99999999.99}
              />
            </Form.Control>
          </Field>

          <Field name="city">
            <LabelWrapper>
              <Label>City</Label>
              <Error match="valueMissing">City is required</Error>
              <Error match="tooLong">City is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Input name="city" required maxLength={80} />
            </Form.Control>
          </Field>

          <Field name="region">
            <LabelWrapper>
              <Label>Region</Label>
              <Error match="valueMissing">Region is required</Error>
              <Error match="tooLong">Region is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <RegionSelect data={CZ_REGIONS} />
            </Form.Control>
          </Field>

          <Field name="availableFrom">
            <LabelWrapper>
              <Label>Available from</Label>
              <Error match="valueMissing">Date is required</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Datepicker />
            </Form.Control>
          </Field>

          <Field name="description">
            <LabelWrapper>
              <Label>Description</Label>
              <Error match="valueMissing">
                Description is required
              </Error>
              <Error match="tooLong">Description is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Textarea name="description" required maxLength={500} />
            </Form.Control>
          </Field>

          <Field name="contactPhone">
            <LabelWrapper>
              <Label>Contact phone</Label>
              <Error match="valueMissing">Phone is required</Error>
              <Error match="patternMismatch">
                Phone must be 7–15 digits and may start with +
              </Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Input
                name="contactPhone"
                required
                maxLength={16}
                pattern="^\+?[0-9]{7,15}$"
                title="Phone must be 7–15 digits, optional leading + (e.g. +420123456789)"
              />
            </Form.Control>
          </Field>

          {/*
           * The refusal, in the form.
           *
           * `!pending` because `useActionState` holds the previous state until
           * the new action resolves, so a retry would otherwise leave the last
           * refusal on screen throughout the request -- telling the visitor their
           * ad failed while a fresh attempt is in flight, and telling them
           * nothing about how the new one is going.
           *
           * `role="alert"` because this is the only feedback a failed submission
           * produces now that the toast is gone, and a message that is drawn but
           * not announced is not received by a screen reader.
           *
           * Placed directly above the submit button rather than at the top: the
           * visitor is looking at the button they just pressed, and the form is
           * a scrollable modal, so a message at the top of it can be off-screen.
           */}
          {state.error && !pending && (
            <SubmitError role="alert">{state.error}</SubmitError>
          )}

          {/*
           * `aria-busy` rather than a changing label. The button used to read
           * "Creating ad…" while pending, which changes its accessible name
           * mid-interaction -- a screen reader announces a different control
           * from the one the visitor just pressed, and anything matching on the
           * name ("the Create ad button") stops matching. `aria-busy` carries
           * the same information without moving the name.
           */}
          <SubmitButton type="submit" disabled={pending} aria-busy={pending}>
            Create ad
          </SubmitButton>
        </Wrapper>
      </Modal>
    </>
  );
}

const ModalButtonWrapper = styled.div`
  display: flex;
  gap: 16px;
  align-items: baseline;

  @media ${QUERIES.phoneAndSmaller} {
    justify-content: space-between;
  }
`;

const Text = styled.span`
  font-size: 0.875rem;
  font-weight: ${WEIGHTS.normal};
`;

const Wrapper = styled(Form.Root)`
  width: min(500px, 95vw);
  height: fit-content;

  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  padding: 16px;
`;

const Field = styled(Form.Field)`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const LabelWrapper = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
`;

const Label = styled(Form.Label)``;

const Input = styled.input`
  background-color: var(--color-input-background);
  border: 1px solid var(--color-border-input);
  padding: 6px 16px;
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  color: var(--color-text);
  border-radius: 16px;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  /* remove number arrows */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  -moz-appearance: textfield;
`;

const Textarea = styled.textarea`
  padding: 10px;
  border: 1px solid var(--color-border-input);
  background-color: var(--color-input-background);
  font-weight: ${WEIGHTS.normal};
  color: var(--color-text);
  border-radius: 16px;
  min-height: 100px;
  resize: none;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }
`;

const Error = styled(Form.Message)`
  color: var(--color-destructive);
  font-size: 0.875rem;
`;

/**
 * A refusal from the action.
 *
 * `border` rather than a bare colour change: the form's own validation messages
 * (`Error` above) are plain red text, and a form that reports one problem in red
 * text and another in a red border reads as two unrelated systems.
 */
const SubmitError = styled.p`
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-destructive);
  border-radius: 8px;
  background-color: var(--color-secondary);
  color: var(--color-destructive);
  font-size: 0.875rem;
  font-weight: ${WEIGHTS.medium};
  text-align: center;
`;

const SubmitButton = styled(Form.Submit)`
  font-size: 1rem;
  padding: 4px 12px;
  border-radius: 16px;
  border: 2px solid transparent;
  cursor: pointer;
  font-weight: ${WEIGHTS.normal};
  width: max-content;
  margin: auto;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  background-color: var(--color-primary);
  color: var(--color-primary-foreground);

  &:hover {
    background-color: var(--color-primary-hover);
  }
`;

const ModalButton = styled(Button)`
  width: max-content;
`;

export default RoomListingForm;
