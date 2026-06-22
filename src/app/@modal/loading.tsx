'use client';
import * as React from 'react';

import { createPortal } from 'react-dom';
import Spinner from '@/components/Spinner';

import styled from 'styled-components';

function Loading() {
  if (typeof window === 'undefined') return null;

  return createPortal(
    <Wrapper>
      <Spinner size={32} />
    </Wrapper>,
    document.body
  );
}

const Wrapper = styled.div`
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 3;
`;

export default Loading;
