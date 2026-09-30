'use client';
import * as React from 'react';
import type { Theme } from '@/types/theme';
import Cookie from 'js-cookie';
import { LIGHT_TOKENS, DARK_TOKENS, COLOR_THEME_COOKIE_NAME } from '@/constants';

import Icon from '../Icon';
import Tooltip from '../Tooltip';
import {
  ControlButton,
  ControlIconAlways,
  ControlNameOnly,
} from '../HeaderControl';

type DarkLightToggleProps = {
  initialTheme: Theme;
};

function DarkLightToggle({ initialTheme }: DarkLightToggleProps) {
  const [theme, setTheme] = React.useState(initialTheme);

  function handleClick() {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    // 1 — Change the state variable, for the sun/moon icon
    setTheme(nextTheme);

    // 2 — Update the cookie, for the user's next visit
    Cookie.set(COLOR_THEME_COOKIE_NAME, nextTheme, {
      expires: 1000,
    });

    // 3 — Update the DOM to present the new colors
    const root = document.documentElement;
    const colors = nextTheme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;

    // 3.1 — Edit the data-attribute, so that we can apply CSS
    // conditionally based on the theme.
    root.setAttribute('data-color-theme', nextTheme);

    // 3.2 — Swap out the actual colors on the <html> tag.
    //       We do this by iterating over each CSS variable
    //       and setting it as a new inline style.
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // 3.3 — Do the same for `color-scheme`, which is written as an inline
    //       style by `layout.tsx` and is not one of the tokens above. Without
    //       it the user agent keeps painting scrollbars, the native date
    //       picker and `::selection` with the light palette.
    root.style.setProperty('color-scheme', nextTheme);
  }

  const TooltipTrigger = <Icon id={theme} />;

  return (
    <ControlButton
      type="button"
      onClick={handleClick}
      aria-pressed={theme === 'dark'}
    >
      {/* Icon-only at every width: the name is never visible, and the tooltip is
          the explanation. */}
      <ControlNameOnly>Toggle dark / light mode</ControlNameOnly>
      <ControlIconAlways>
        <Tooltip trigger={TooltipTrigger} content="Toggle theme" />
      </ControlIconAlways>
    </ControlButton>
  );
}

export default DarkLightToggle;
