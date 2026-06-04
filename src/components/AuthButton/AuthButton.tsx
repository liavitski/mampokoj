'use client';
import * as React from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Spinner from '../Spinner';
import Button from '../Button';
import styled from 'styled-components';
import Image from 'next/image';
import { QUERIES, WEIGHTS } from '@/constants';
import Icon from '../Icon';
import VisuallyHidden from '../VisuallyHidden';

function AuthButton() {
  const { data: session, status } = useSession();
  if (status === 'loading') {
    return <Spinner />;
  }

  if (!session) {
    return (
      <ButtonWrapper
        variant="fill"
        size="small"
        onClick={() => signIn()}
      >
        <ButtonText>Sign in</ButtonText>
        <IconWrapper>
          <Icon id="logIn" strokeWidth={1.5} content="Sign in" />
          <VisuallyHidden>Sign in</VisuallyHidden>
        </IconWrapper>
      </ButtonWrapper>
    );
  }

  const userAvatar = session.user?.image || '/globe.svg';
  const userName = session.user?.name;

  return (
    <>
      <UserName style={{ userSelect: 'none' }}>{userName}</UserName>
      <AvatarWrapper>
        <Image
          src={userAvatar}
          alt="user-avatar"
          width={32}
          height={32}
          priority
        />
      </AvatarWrapper>

      <ButtonWrapper
        variant="fill"
        size="small"
        onClick={() => signOut()}
      >
        <ButtonText>Sign Out</ButtonText>
        <IconWrapper>
          <Icon id="logOut" strokeWidth={1.5} content="Sign out" />
          <VisuallyHidden>Sign out</VisuallyHidden>
        </IconWrapper>
      </ButtonWrapper>
    </>
  );
}

const AvatarWrapper = styled.div`
  border-radius: 50%;
  overflow: hidden;

  @media ${QUERIES.phoneAndSmaller} {
    display: none;
  }
`;

const UserName = styled.span`
  font-weight: ${WEIGHTS.normal};

  @media (${QUERIES.phoneAndSmaller}) {
    display: none;
  }
`;

const ButtonWrapper = styled(Button)`
  @media (${QUERIES.phoneAndSmaller}) {
    padding: 0;
    border-radius: 50%;
  }
`;

const IconWrapper = styled.div`
  display: none;

  @media (${QUERIES.phoneAndSmaller}) {
    display: block;
    display: flex;
    justify-content: center;
    align-items: center;
  }
`;

const ButtonText = styled.span`
  display: inline;

  @media (${QUERIES.phoneAndSmaller}) {
    display: none;
  }
`;

export default AuthButton;
