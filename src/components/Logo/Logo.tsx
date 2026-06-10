import * as React from 'react';
import styled from 'styled-components';
import Link from 'next/link';
import { WEIGHTS, APP_TITLE } from '@/constants';

function Logo() {
  return <LinkWrapper href={'/'}>{APP_TITLE}</LinkWrapper>;
}

const LinkWrapper = styled(Link)`
  display: block;
  color: var(--text-color);
  text-decoration: none;
  font-size: 1.25rem;
  font-weight: ${WEIGHTS.normal};
  letter-spacing: -0.5px;
  transition: font-weight 400ms, transform 400ms;
  will-change: transform;

  @media (pointer: fine) {
    &:hover {
      font-weight: ${WEIGHTS.bold};
      transition: font-weight 150ms, transform 150ms;
      transform: translateX(-1px);
    }
  }
`;

export default Logo;
