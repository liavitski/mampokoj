'use client';
import * as React from 'react';

import { LIGHT_TOKENS, DARK_TOKENS } from '@/constants';
import styled from 'styled-components';
import type { Theme } from '@/types/theme';
import { setThemeCookie } from '../../actions/theme';

import VisuallyHidden from '../VisuallyHidden';
import Icon from '../Icon';

type DarkLightToggleProps = {
  initialTheme: Theme;
};

function DarkLightToggle({ initialTheme }: DarkLightToggleProps) {
  const [theme, setTheme] = React.useState(initialTheme);

  async function handleToggleTheme() {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    await setThemeCookie(nextTheme);
  }

  return (
    <button onClick={handleToggleTheme}>
      <Icon id={theme} />
      <VisuallyHidden>Toggle dark / light mode</VisuallyHidden>
    </button>
  );
}

export default DarkLightToggle;
