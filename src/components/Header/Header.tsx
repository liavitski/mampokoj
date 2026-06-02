import * as React from 'react';
import styled from 'styled-components';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import { Theme } from '@/types/theme';
import AuthButton from '../AuthButton';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Button from '../Button';
import Image from 'next/image';

type HeaderProps = {
  initialTheme: Theme;
};

async function Header({ initialTheme }: HeaderProps) {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  return (
    <Wrapper>
      <Logo />

      <ButtonsWrapper>
        <AuthButton />
        {userId && (
          <Button variant="fill" size="small">
            My Ads
          </Button>
        )}
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
