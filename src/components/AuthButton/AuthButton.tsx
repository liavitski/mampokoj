'use client';
import * as React from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Spinner from '../Spinner';
import Button from '../Button';
import styled from 'styled-components';
import Image from 'next/image';

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

  return (
    <>
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

export default AuthButton;
