'use client';

import * as React from 'react';
import * as Form from '@radix-ui/react-form';
import styled from 'styled-components';

import { updateAd } from '@/server/actions/updateAd';
import { Ad } from '@/types/db-types';

import Modal from '../Modal';
import Button from '../Button';

type UpdateRoomListingForm = {
  ad: Ad;
};

function UpdateRoomListingForm({ ad }: UpdateRoomListingForm) {
  const [open, setOpen] = React.useState(false);

  const formattedDate = new Date(ad.availableFrom)
    .toISOString()
    .slice(0, 16);

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
        <Wrapper action={(formData) => updateAd(ad.id, formData)}>
          <Field name="title">
            <Label>Title</Label>
            <Input name="title" required defaultValue={ad.title} />
            <Error match="valueMissing">Title is required</Error>
          </Field>

          <Field name="price">
            <Label>Price</Label>
            <Input
              name="price"
              type="number"
              step="0.01"
              required
              defaultValue={ad.price}
            />
            <Error match="valueMissing">Price is required</Error>
          </Field>

          <Field name="city">
            <Label>City</Label>
            <Input name="city" required defaultValue={ad.city} />
            <Error match="valueMissing">City is required</Error>
          </Field>

          <Field name="region">
            <Label>Region</Label>
            <Input name="region" required defaultValue={ad.region} />
          </Field>

          <Field name="availableFrom">
            <Label>Available From</Label>
            <Input
              name="availableFrom"
              type="datetime-local"
              required
              defaultValue={formattedDate}
            />
          </Field>

          <Field name="description">
            <Label>Description</Label>
            <Textarea
              name="description"
              required
              defaultValue={ad.description}
            />
          </Field>

          <Field name="contactPhone">
            <Label>Contact Phone</Label>
            <Input
              name="contactPhone"
              required
              defaultValue={ad.contactPhone}
            />
          </Field>

          <SubmitButton type="submit">Update ad</SubmitButton>
        </Wrapper>
      </Modal>
    </>
  );
}

const Wrapper = styled(Form.Root)`
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  padding: 16px;
`;

const Field = styled(Form.Field)`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled(Form.Label)`
  font-size: 14px;
  font-weight: 500;
`;

const Input = styled.input`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
`;

const Textarea = styled.textarea`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  min-height: 100px;
`;

const Error = styled(Form.Message)`
  color: red;
  font-size: 12px;
`;

const SubmitButton = styled(Form.Submit)`
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: black;
  color: white;
  cursor: pointer;
`;

const ModalButton = styled(Button)`
  width: max-content;
`;

export default UpdateRoomListingForm;
