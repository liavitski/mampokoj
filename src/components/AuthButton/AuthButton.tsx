'use client';

import * as React from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';
import styled from 'styled-components';
import Image from 'next/image';

import Icon from '../Icon';
import { QUERIES, WEIGHTS } from '@/constants';
import {
  ControlButton,
  ControlIcon,
  ControlLabel,
} from '../HeaderControl';

type AuthButtonProps = {
  /**
   * The session, from the server.
   *
   * This used to be `useSession()`, which resolves after hydration. The header
   * is a server component and already knew who was signed in, so the button
   * rendered a spinner and then swapped itself for a name, an avatar and a
   * "Sign out" button on every page load — a layout jump in the one place on
   * the page where nothing is supposed to move.
   *
   * `signIn` and `signOut` both navigate when they finish, so the server is
   * re-rendered and this prop changes on its own; nothing has to watch for it.
   */
  session: Session | null;
};

function AuthButton({ session }: AuthButtonProps) {
  const userName = session?.user?.name;
  const userAvatar = session?.user?.image || '/globe.svg';

  if (!session) {
    return (
      <ControlButton type="button" onClick={() => signIn()}>
        <ControlLabel>Sign in</ControlLabel>
        <ControlIcon>
          <Icon id="logIn" strokeWidth={1.5} />
        </ControlIcon>
      </ControlButton>
    );
  }

  return (
    <>
      {/* Name and avatar are one control, not two: they are two views of the
          same fact, and on a phone the label has already become the accessible
          name, so showing the name again as text would duplicate it. */}
      <Identity title={userName ?? 'Signed in'}>
        {userName && <UserName>{userName}</UserName>}
        <Avatar src={userAvatar} alt="" width={28} height={28} priority />
      </Identity>

      <ControlButton type="button" onClick={() => signOut({ callbackUrl: '/' })}>
        <ControlLabel>Sign out</ControlLabel>
        <ControlIcon>
          <Icon id="logOut" strokeWidth={1.5} />
        </ControlIcon>
      </ControlButton>
    </>
  );
}

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const UserName = styled.span`
  font-weight: ${WEIGHTS.normal};
  font-size: 1rem;
  line-height: 1.2;

  /* Truncate rather than wrap: a two-line name would double the height of the
     header bar on a narrow screen. */
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media ${QUERIES.phoneAndSmaller} {
    display: none;
  }
`;

const Avatar = styled(Image)`
  border-radius: 50%;
  flex-shrink: 0;
`;

export default AuthButton;