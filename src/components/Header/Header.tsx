import * as React from 'react';
import styled from 'styled-components';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import { Theme } from '@/types/theme';

type HeaderProps = {
  initialTheme: Theme;
};

function Header({ initialTheme }: HeaderProps) {
  return (
    <Wrapper>
      <Logo />
      <DarkLightToggle initialTheme={initialTheme} />
    </Wrapper>
  );
}

const Wrapper = styled.header`
  display: flex;
  justify-content: space-between;
  height: var(--header-height);
  align-items: center;
  margin-bottom: 1.5rem;
`;

export default Header;
