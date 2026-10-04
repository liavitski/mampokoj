import { plusJakartaSans } from '@/utils/fonts';
import { cookies } from 'next/headers';
import type { Theme } from '@/types/theme';

import { NextSSRPlugin } from '@uploadthing/react/next-ssr-plugin';
import { extractRouterConfig } from 'uploadthing/server';
import { ourFileRouter } from '@/app/api/uploadthing/core';

import { getCachedSession } from '@/lib/session';

import '@uploadthing/react/styles.css';
import './globals.css';
import { LIGHT_TOKENS, DARK_TOKENS, COLOR_THEME_COOKIE_NAME } from '@/constants';
import StyledComponentsRegistry from '@/lib/registry';
import { rootMetadata, rootViewport } from './metadata';

import Header from '@/components/Header';
import MaxWidthWrapper from '@/components/MaxWidthWrapper';
import Footer from '@/components/Footer';

import ToastProvider from '@/components/ToastProvider';

/**
 * Re-exported from `metadata.ts` rather than declared here.
 *
 * Next.js reads `metadata` and `viewport` off the layout, so these have to be
 * exported from this module -- but they are *defined* one file down, because
 * `layout.tsx` cannot be imported by a test (it pulls in `next/font/google` and
 * the UploadThing SSR plugin). The rationale and the reason it is not a second
 * source of truth are in `metadata.ts`.
 */
export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * `LayoutProps<'/'>`, generated. Its `LayoutSlotMap` is what supplies the
 * `modal` key -- the `@modal` parallel route -- so the hand-written
 * `Readonly<{ children; modal }>` this replaces was a second, unverified copy
 * of a mapping Next derives from the directory tree. Adding a `@sidebar`
 * alongside `@modal` now types `props.sidebar` here without this file being
 * edited, and forgetting it is a `tsc` error rather than `undefined` rendered
 * into the document.
 */
async function RootLayout({ children, modal }: LayoutProps<'/'>) {
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
      /*
       * `cs`, not `en`.
       *
       * The app's users are in the Czech Republic and its copy is Czech
       * (`Mam Pokoj`, `Pronájem pokoje`, `Vyberte kraj`), prices are CZK and
       * dates are `cs-CZ`. `lang="en"` told screen readers to pronounce Czech
       * text with English phonetics, and told search engines the page was
       * English, which is the mismatch that costs a Czech query its ranking.
       *
       * `translate="no"` stays: it is a deliberate choice not to offer machine
       * translation of user-posted ads, and it is orthogonal to `lang`.
       */
      lang="cs"
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
        <StyledComponentsRegistry>
          <MaxWidthWrapper>
            <ToastProvider>
              <Header initialTheme={theme} session={session} />
              {children}
              {modal}
              <Footer />
            </ToastProvider>
          </MaxWidthWrapper>
          <NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}

export default RootLayout;
