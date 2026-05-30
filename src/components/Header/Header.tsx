import * as React from 'react';
import styled from 'styled-components';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import { Theme } from '@/types/theme';
import AuthButton from '../AuthButton';
import UploadBtn from '../UploadBtn';

type HeaderProps = {
  initialTheme: Theme;
};

async function Header({ initialTheme }: HeaderProps) {
  return (
    <Wrapper>
      <Logo />
      <ButtonsWrapper>
        <AuthButton />
        <UploadBtn adId="2f6c9c7e-1c3a-4c2b-9f2e-8d5a6b1c4e90" />
        <DarkLightToggle initialTheme={initialTheme} />
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
`;

export default Header;
