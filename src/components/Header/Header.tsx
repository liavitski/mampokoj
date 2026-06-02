import * as React from 'react';
import styled from 'styled-components';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import { Theme } from '@/types/theme';
import AuthButton from '../AuthButton';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Link from 'next/link';
import { WEIGHTS } from '@/constants';

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
          <LinkWrapper href={`/dashboard/${userId}`}>
            My Ads
          </LinkWrapper>
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

const LinkWrapper = styled(Link)`
  text-decoration: none;
  padding: 4px 12px;
  color: var(--color-text-foreground);
  border-radius: 16px;
  border: 2px solid transparent;
  font-weight: ${WEIGHTS.normal};

  &:hover {
    background-color: var(--color-accent);
  }

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }
`;

export default Header;
