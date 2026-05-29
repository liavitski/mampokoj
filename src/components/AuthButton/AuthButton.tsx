'use client';
import * as React from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Spinner from '../Spinner';
import styled from 'styled-components';
import UnstyledButton from '../UnstyledButton';

function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Spinner />;

  if (session) {
    return (
      <>
        <div>{session?.user?.name}</div>
        <SignButton onClick={() => signOut()}>Sign Out</SignButton>
      </>
    );
  }
  return <SignButton onClick={() => signIn()}>Sign In</SignButton>;
}

const SignButton = styled(UnstyledButton)`
  background-color: var(--color-primary);
  padding: 4px 16px;
  border-radius: 16px;
  color: var(--color-primary-foreground);
`;

export default AuthButton;
