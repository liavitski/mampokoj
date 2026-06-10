import * as React from 'react';
import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

import { requireUserId } from '@/lib/require-user-id';
import { Theme } from '@/types/theme';

import Link from 'next/link';
import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import VisuallyHidden from '../VisuallyHidden';
import AuthButton from '../AuthButton';
import Icon from '../Icon';

type HeaderProps = {
  initialTheme: Theme;
};

async function Header({ initialTheme }: HeaderProps) {
  const userId = await requireUserId();

  return (
    <Wrapper>
      <Logo />

      <ButtonsWrapper>
        {userId && (
          <>
            <LinkWrapper href={`/dashboard/${userId}`}>
              <LinkText>My Ads</LinkText>
              <IconWrapper>
                <Icon id="user" strokeWidth={1.5} />
                <VisuallyHidden>My ads</VisuallyHidden>
              </IconWrapper>
            </LinkWrapper>
          </>
        )}
        <AuthButton />
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
  font-weight: ${WEIGHTS.normal};

  &:hover {
    background-color: var(--color-accent);
  }

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  @media ${QUERIES.phoneAndSmaller} {
    padding: 0;
  }
`;

const LinkText = styled.span`
  display: inline-block;

  @media ${QUERIES.phoneAndSmaller} {
    display: none;
  }
`;

const IconWrapper = styled.div`
  display: none;

  @media ${QUERIES.phoneAndSmaller} {
    display: flex;
  }
`;

export default Header;
