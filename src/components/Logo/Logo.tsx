import * as React from 'react';
import styled from 'styled-components';
import Link from 'next/link';
import { WEIGHTS, APP_TITLE } from '@/constants';
import type { ComponentProps } from 'react';

type LogoProps = ComponentProps<'h1'>;

function Logo(props: LogoProps) {
  return (
    <LinkWrapper href={'/'}>
      <Wrapper {...props}>{APP_TITLE}</Wrapper>
    </LinkWrapper>
  );
}

const LinkWrapper = styled(Link)`
  color: var(--text-color);
  text-decoration: none;
`;

const Wrapper = styled.h1`
  font-size: 1.5rem;
  font-weight: ${WEIGHTS.bold};
`;

export default Logo;
