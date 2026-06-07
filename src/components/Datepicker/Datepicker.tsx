'use client';
import * as React from 'react';

import styled from 'styled-components';
import Icon from '../Icon';
import { WEIGHTS } from '@/constants';

type DatepickerProps = {
  defaultValue?: Date;
};

function Datepicker({ defaultValue }: DatepickerProps) {
  const [value, setValue] = React.useState(
    defaultValue ? defaultValue.toISOString().slice(0, 10) : ''
  );

  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <Wrapper>
      <NativeDatepicker
        ref={inputRef}
        name="availableFrom"
        type="date"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        tabIndex={-1}
      />
      <PresentationalBit
        tabIndex={0}
        onClick={() => inputRef.current?.showPicker()}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.showPicker();
          }
        }}
      >
        {value || <Text>Select date</Text>}
        <IconWrapper>
          <Icon id="calendar" strokeWidth={1.5} />
        </IconWrapper>
      </PresentationalBit>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  width: 100%;
`;

const NativeDatepicker = styled.input.attrs({ type: 'date' })`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  appearance: none;
`;

const PresentationalBit = styled.div`
  background-color: var(--color-primary-foreground);
  border: 1px solid var(--color-border-input);
  padding: 6px 16px;
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  color: var(--color-text);
  border-radius: 16px;
  pointer-events: none;
  z-index: 1;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }
`;

const IconWrapper = styled.div`
  position: absolute;
  top: 2px;
  bottom: 0;
  right: 14px;
  margin: auto;
  pointer-events: none;
`;

const Text = styled.span`
  color: var(--color-text-muted-foreground);
  font-weight: 300;
`;

export default Datepicker;
