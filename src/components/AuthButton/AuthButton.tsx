'use client';
import * as React from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Spinner from '../Spinner';
import Button from '../Button';
import styled from 'styled-components';
import Image from 'next/image';
import { WEIGHTS } from '@/constants';

function AuthButton() {
  const { data: session, status } = useSession();
  if (status === 'loading') {
    return <Spinner />;
  }

  if (!session) {
    return (
      <Button variant="fill" size="small" onClick={() => signIn()}>
        Sign In
      </Button>
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

      <Button variant="fill" size="small" onClick={() => signOut()}>
        Sign Out
      </Button>
    </>
  );
}

const AvatarWrapper = styled.div`
  border-radius: 50%;
  overflow: hidden;
`;

const UserName = styled.span`
  font-weight: ${WEIGHTS.normal};
`;

export default AuthButton;
