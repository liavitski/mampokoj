'use client';

import * as Form from '@radix-ui/react-form';
import styled from 'styled-components';
import { createAd } from '@/server/actions';
import Modal from '../Modal';
import React from 'react';

function RoomListingForm() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onOpenChange={setOpen}>
        <Wrapper action={createAd}>
          <Field name="title">
            <Label>Title</Label>
            <Input name="title" required />
            <Error match="valueMissing">Title is required</Error>
          </Field>

          <Field name="price">
            <Label>Price</Label>
            <Input name="price" type="number" step="0.01" required />
            <Error match="valueMissing">Price is required</Error>
          </Field>

          <Field name="city">
            <Label>City</Label>
            <Input name="city" required />
            <Error match="valueMissing">City is required</Error>
          </Field>

          <Field name="region">
            <Label>Region</Label>
            <Input name="region" required />
          </Field>

          <Field name="availableFrom">
            <Label>Available From</Label>
            <Input
              name="availableFrom"
              type="datetime-local"
              required
            />
          </Field>

          <Field name="description">
            <Label>Description</Label>
            <Textarea name="description" required />
          </Field>

          <Field name="contactPhone">
            <Label>Contact Phone</Label>
            <Input name="contactPhone" required />
          </Field>

          <Button type="submit">Create Ad</Button>
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

const Button = styled(Form.Submit)`
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: black;
  color: white;
  cursor: pointer;
`;

export default RoomListingForm;
