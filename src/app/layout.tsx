import { plusJakartaSans } from '@/utils/fonts';
import { cookies } from 'next/headers';
import type { Theme } from '@/types/theme';

import { NextSSRPlugin } from '@uploadthing/react/next-ssr-plugin';
import { extractRouterConfig } from 'uploadthing/server';
import { ourFileRouter } from '@/app/api/uploadthing/core';
import { MotionConfig } from 'motion/react';
import { getCachedSession } from '@/lib/session';

import '@uploadthing/react/styles.css';
import './globals.css';
import { APP_TITLE, LIGHT_TOKENS, DARK_TOKENS, COLOR_THEME_COOKIE_NAME } from '@/constants';
import StyledComponentsRegistry from '@/lib/registry';

import Header from '@/components/Header';
import MaxWidthWrapper from '@/components/MaxWidthWrapper';
import Footer from '@/components/Footer';

import ToastProvider from '@/components/ToastProvider';

export const metadata = {
  title: {
    template: `%s • ${APP_TITLE}`,
    default: APP_TITLE,
  },
  description: 'An app that helps you rent a room',
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>;

async function RootLayout({ children, modal }: RootLayoutProps) {
  const cookieStore = await cookies();
  const theme: Theme =
    cookieStore.get(COLOR_THEME_COOKIE_NAME)?.value === 'dark'
      ? 'dark'
      : 'light';

  const themeColors = theme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;

  // Read once here and handed to the header, which is the only consumer that
  // needs it on the client. There is deliberately no `SessionProvider` around
  // the tree: nothing calls `useSession()` any more, since the header was the
  // last thing that did, and with it there is no client-side session copy to
  // serialise into the payload and no refetch on window focus. Re-add the
  // provider only together with a caller that needs it -- `signIn`/`signOut`
  // in AuthButton work without it.
  const session = await getCachedSession();

  return (
    <html
      lang="en"
      translate="no"
      data-color-theme={theme}
      style={
        {
          ...themeColors,
          // Tells the user agent which built-in widget palette to paint with,
          // so scrollbars, the native date picker, focus rings and ::selection
          // follow the theme instead of staying light. Inline, so it is correct
          // on the first paint rather than after hydration. `DarkLightToggle`
          // keeps it in sync with the token swap below it.
          colorScheme: theme,
        } as React.CSSProperties
      }
      className={`${plusJakartaSans.variable} notranslate`}
    >
      <body>
        <MotionConfig reducedMotion="user">
          <StyledComponentsRegistry>
            <MaxWidthWrapper>
              <ToastProvider>
                <Header initialTheme={theme} session={session} />
                {children}
                {modal}
                <Footer />
              </ToastProvider>
            </MaxWidthWrapper>
            <NextSSRPlugin
              routerConfig={extractRouterConfig(ourFileRouter)}
            />
          </StyledComponentsRegistry>
        </MotionConfig>
      </body>
    </html>
  );
}

export default RootLayout;
