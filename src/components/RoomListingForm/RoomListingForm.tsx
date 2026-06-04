'use client';
import * as Form from '@radix-ui/react-form';
import { createAd } from '@/server/actions';
import styled from 'styled-components';

 function CreateAdForm() {
  return (
    <Root action={createAd}>
      <Form.Field name="title">
        <Form.Label>Title</Form.Label>
        <Form.Control asChild>
          <input name="title" required />
        </Form.Control>
      </Form.Field>

      <Form.Field name="price">
        <Form.Label>Price</Form.Label>
        <Form.Control asChild>
          <input name="price" type="number" step="0.01" required />
        </Form.Control>
      </Form.Field>

      <Form.Field name="city">
        <Form.Label>City</Form.Label>
        <Form.Control asChild>
          <input name="city" required />
        </Form.Control>
      </Form.Field>

      <Form.Field name="region">
        <Form.Label>Region</Form.Label>
        <Form.Control asChild>
          <input name="region" required />
        </Form.Control>
      </Form.Field>

      <Form.Field name="availableFrom">
        <Form.Label>Available From</Form.Label>
        <Form.Control asChild>
          <input
            name="availableFrom"
            type="datetime-local"
            required
          />
        </Form.Control>
      </Form.Field>

      <Form.Field name="contactPhone">
        <Form.Label>Phone</Form.Label>
        <Form.Control asChild>
          <input name="contactPhone" required />
        </Form.Control>
      </Form.Field>

      <Form.Field name="description">
        <Form.Label>Description</Form.Label>
        <Form.Control asChild>
          <textarea name="description" required />
        </Form.Control>
      </Form.Field>

      <Form.Submit asChild>
        <button type="submit">Create Ad</button>
      </Form.Submit>
    </Root>
  );
}

const Root = styled(Form.Root)`
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  padding: 16px;
`

export default CreateAdForm;