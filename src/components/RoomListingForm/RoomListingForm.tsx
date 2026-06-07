'use client';

import React from 'react';
import * as Form from '@radix-ui/react-form';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import { CZ_REGIONS } from '@/constants';
import { useRouter } from 'next/navigation';
import { useToast } from '../ToastProvider';
import { createAd } from '@/server/actions/createAd';

import RegionSelect from '../RegionSelect';
import Datepicker from '../Datepicker';
import Button from '../Button';
import Modal from '../Modal';

function RoomListingForm() {
  const [open, setOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);

  const router = useRouter();
  const { showToast } = useToast();

  async function handleCreate(formData: FormData) {
    setIsPending(true);

    const res = await createAd(formData);

    setIsPending(false);

    if (res.success) {
      showToast('Ad created successfully', 'success');
      setOpen(false);
      router.push(`/dashboard/${res.userId}`);
      return;
    }

    showToast(res.error || 'Create failed', 'error');
  }

  return (
    <>
      <ModalButton
        variant="fill"
        size="small"
        onClick={() => setOpen(true)}
      >
        Create ad
      </ModalButton>
      <Modal
        open={open}
        onOpenChange={setOpen}
        disableOutsideClose={true}
      >
        <Wrapper action={handleCreate}>
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

          <SubmitButton type="submit" disabled={isPending}>
            Create ad
          </SubmitButton>
        </Wrapper>
      </Modal>
    </>
  );
}

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
  background-color: var(--color-primary-foreground);
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
  background-color: var(--color-primary-foreground);
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
