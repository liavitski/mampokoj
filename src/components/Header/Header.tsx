'use client';

import * as React from 'react';
import styled from 'styled-components';
import { Theme } from '@/types/theme';

import Logo from '../Logo';
import DarkLightToggle from '../DarkLightToggle';
import AuthButton from '../AuthButton';
import Icon from '../Icon';
import { ControlIcon, ControlLabel, ControlLink } from '../HeaderControl';
import type { Session } from 'next-auth';

type HeaderProps = {
  initialTheme: Theme;
  /**
   * The session, read by the layout and passed down rather than re-read here.
   *
   * `Header` used to call `requireUserId()` while `AuthButton` called
   * `useSession()`. Those are two sources of truth for the same question, and
   * because only the client one resolves asynchronously the right-hand side of
   * the header rendered a spinner and then popped into a name, an avatar and a
   * button — on every navigation — underneath content that was already laid
   * out. One read, on the server, and both halves agree on first paint.
   */
  session: Session | null;
};

function Header({ initialTheme, session }: HeaderProps) {
  const userId = session?.user?.id ?? null;

  return (
    <Wrapper>
      <Logo />

      <Controls>
        {userId && (
          <ControlLink href={`/dashboard/${userId}`}>
            <ControlLabel>My Ads</ControlLabel>
            <ControlIcon>
              <Icon id="user" strokeWidth={1.5} />
            </ControlIcon>
          </ControlLink>
        )}

        <AuthButton session={session} />

        <DarkLightToggle initialTheme={initialTheme} />
      </Controls>
    </Wrapper>
  );
}

const Wrapper = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  /*
    Was 'height: var(--header-height)', which put an 80px band around a row of
    ~40px controls: the content was centred in it, so there was dead space above
    and below and the rule underneath sat far from what it belonged to. Padding
    is what a header needs -- it grows with its content, so a taller control on
    a touch device takes the bar with it instead of overflowing it.
  */
  padding: 12px 0;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--color-border);

  transition-property: border-color;
  transition-duration: 0.4s;
  transition-timing-function: cubic-bezier(0.1, 0.9, 0, 1);
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  /*
    The logo is the one thing allowed to give up room. Everything to its right
    is a control with a name and a target size, and truncating those is worse
    than truncating the wordmark.
  */
  min-width: 0;
`;

export default Header;