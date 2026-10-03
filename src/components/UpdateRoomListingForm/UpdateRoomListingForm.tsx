'use client';

import * as React from 'react';
import * as Form from '@radix-ui/react-form';
import styled from 'styled-components';

import { updateAd } from '@/server/actions/updateAd';
import { Ad } from '@/types/db-types';
import { WEIGHTS, CZ_REGIONS } from '@/constants';
import { toDateInputValue } from '@/utils/date';
import { useToast } from '../ToastProvider';
import { useRouter } from 'next/navigation';

import RegionSelect from '../RegionSelect';
import Datepicker from '../Datepicker';
import Button from '../Button';
import Modal from '../Modal';

type UpdateRoomListingFormProps = {
  /**
   * Only the fields the form edits. The dashboard deliberately does not pass
   * the whole ad row: this is a client component, so anything included here is
   * serialised into the RSC payload, and the row also carries the poster's
   * account id and phone number.
   */
  ad: Pick<
    Ad,
    | 'id'
    | 'title'
    | 'price'
    | 'city'
    | 'region'
    | 'availableFrom'
    | 'description'
    | 'contactPhone'
  >;
};

/**
 * What the last submission returned, as far as the form is concerned.
 *
 * Identical in shape to `RoomListingForm`'s, and deliberately not shared: the two
 * forms are separate components with separate state, and a shared type would
 * couple them for no gain. `error: null` before anything is submitted, so "no
 * failure yet" and "a failure that said nothing" stay distinguishable.
 */
type UpdateAdFormState = {
  error: string | null;
};

const INITIAL_STATE: UpdateAdFormState = { error: null };

function UpdateRoomListingForm({ ad }: UpdateRoomListingFormProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const formattedDate = toDateInputValue(new Date(ad.availableFrom));

  /**
   * `useActionState`, per `10-error-handling.md`, for the same reasons and with
   * the same history as `RoomListingForm` -- read that file's comment first;
   * the short version is that the `useState` pending flag this replaces never
   * applied, because a *client* function passed to `<form action>` is not run
   * inside a transition.
   *
   * That mattered more here than in the create form. This one edits an ad that
   * already exists, and `updateAd` takes the id as a separate argument, so the
   * slot loop that stops `createAd` duplicating an insert has no equivalent: a
   * double submit was two `UPDATE`s of the same row. Harmless to the data and
   * still wrong -- two round trips for one edit, and two toasts.
   *
   * `ad.id` is closed over rather than bound into the action. Binding would work
   * and would keep the action itself a direct server reference; the closure is
   * here because the action passed to `useActionState` has to be
   * `(prevState, formData)` while `updateAd` is `(adId, formData)`, so one of
   * the two has to give. See the note on progressive enhancement below.
   */
  const [state, formAction, pending] = React.useActionState(
    async (
      _prev: UpdateAdFormState,
      formData: FormData
    ): Promise<UpdateAdFormState> => {
      const res = await updateAd(ad.id, formData);

      if (res.success) {
        showToast('Ad updated successfully', 'success');
        setOpen(false);
        router.push(`/dashboard/${res.userId}`);

        return { error: null };
      }

      /** No toast: the message is rendered in the form, where it stays. */
      return { error: res.error || 'Update failed' };
    },
    INITIAL_STATE
  );

  return (
    <>
      <ModalButton
        variant="fill"
        size="small"
        onClick={() => setOpen(true)}
      >
        Update ad
      </ModalButton>
      <Modal open={open} onOpenChange={setOpen}>
        {/*
         * Progressive enhancement: pointing `action` at React's own form action
         * is the shape that lets the server-rendered form post without
         * JavaScript. Not yet true here -- the modal only exists once `open` is
         * set by a click -- but a client function as `action` can never do it,
         * so this is the form that could.
         */}
        <Wrapper action={formAction}>
          <Field name="title">
            <LabelWrapper>
              <Label>Title</Label>
              <Error match="valueMissing">Title is required</Error>
              <Error match="tooLong">Title is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Input
                name="title"
                required
                maxLength={60}
                defaultValue={ad.title}
              />
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
                defaultValue={ad.price}
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
              <Input
                name="city"
                required
                maxLength={80}
                defaultValue={ad.city}
              />
            </Form.Control>
          </Field>

          <Field name="region">
            <LabelWrapper>
              <Label>Region</Label>
              <Error match="valueMissing">Region is required</Error>
              <Error match="tooLong">Region is too long</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <RegionSelect
                data={CZ_REGIONS}
                defaultValue={ad.region}
              />
            </Form.Control>
          </Field>

          <Field name="availableFrom">
            <LabelWrapper>
              <Label>Available from</Label>
              <Error match="valueMissing">Date is required</Error>
            </LabelWrapper>

            <Form.Control asChild>
              <Datepicker defaultValue={formattedDate} />
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
              <Textarea
                name="description"
                required
                maxLength={500}
                defaultValue={ad.description}
              />
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
                defaultValue={ad.contactPhone}
              />
            </Form.Control>
          </Field>

          {/*
           * `!pending` because `useActionState` holds the previous state until
           * the new action resolves, so a retry would leave the last refusal on
           * screen for the whole request -- saying the update failed while a new
           * attempt is in flight.
           *
           * `role="alert"` because this is now the only feedback a failed
           * update produces, and `aria-busy` rather than a changing label so the
           * button keeps its accessible name while pending. `RoomListingForm`
           * explains both at more length.
           */}
          {state.error && !pending && (
            <SubmitError role="alert">{state.error}</SubmitError>
          )}

          <SubmitButton type="submit" disabled={pending} aria-busy={pending}>
            Update ad
          </SubmitButton>
        </Wrapper>
      </Modal>
    </>
  );
}

const Wrapper = styled(Form.Root)`
  width: min(500px, 95vw);
  max-height: fit-content;

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
 * A refusal from the action. Styled as `RoomListingForm`'s of the same name, and
 * for the same reason: the form's own validation messages above are plain red
 * text, so a bordered box is what keeps a server refusal from reading as an
 * unrelated second system.
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

export default UpdateRoomListingForm;
