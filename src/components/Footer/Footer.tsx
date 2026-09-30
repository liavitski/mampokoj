'use client';

import * as React from 'react';
import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

function Footer() {
  return <Wrapper>© 2026-present. All rights reserved.</Wrapper>;
}

const Wrapper = styled.footer`
  text-align: right;
  padding: 32px 0;
  font-weight: ${WEIGHTS.normal};

  @media ${QUERIES.phoneAndSmaller} {
    text-align: center;
  }
`;

export default Footer;
