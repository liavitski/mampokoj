import * as React from 'react';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';

function Footer() {
  return <Wrapper>© 2026-present. All rights reserved.</Wrapper>;
}

const Wrapper = styled.footer`
  text-align: right;
  padding: 32px;
  font-weight: ${WEIGHTS.normal};
`;

export default Footer;
