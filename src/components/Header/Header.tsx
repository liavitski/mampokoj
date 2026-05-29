import * as React from 'react';
import styled from 'styled-components';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import { Theme } from '@/types/theme';
import AuthButton from '../AuthButton';

type HeaderProps = {
  initialTheme: Theme;
};

function Header({ initialTheme }: HeaderProps) {
  return (
    <Wrapper>
      <Logo />
      <ButtonsWrapper>
        <DarkLightToggle initialTheme={initialTheme} />
        <AuthButton />
      </ButtonsWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.header`
  display: flex;
  justify-content: space-between;
  height: var(--header-height);
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 4px dotted var(--color-border);
`;

const ButtonsWrapper = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
`

export default Header;
