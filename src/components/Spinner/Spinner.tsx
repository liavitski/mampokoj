import * as React from 'react';
import { Loader } from 'react-feather';
import styled, { keyframes } from 'styled-components';

type SpinnerProps = {
  color?: string;
  size?: number;
};

function Spinner({ color, size }: SpinnerProps) {
  return (
    <Wrapper>
      <Loader color={color} size={size} />
    </Wrapper>
  );
}

const spin = keyframes`
  from {
    transform: rotate(-360deg);
  }
`;

const Wrapper = styled.div`
  display: block;
  width: min-content;
  height: min-content;
  /* @ts-ignore */
  animation: ${spin} 1000ms linear infinite;
  color: inherit;
  opacity: 0.6;

  svg {
    display: block;
    max-width: revert;
  }
`;

export default Spinner;
