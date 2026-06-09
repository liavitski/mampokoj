import { plusJakartaSans } from '@/utils/fonts';
import { cookies } from 'next/headers';
import type { Theme } from '@/types/theme';

import { NextSSRPlugin } from '@uploadthing/react/next-ssr-plugin';
import { extractRouterConfig } from 'uploadthing/server';
import { ourFileRouter } from '@/app/api/uploadthing/core';
import { MotionConfig } from 'motion/react';
import { getServerSession } from 'next-auth';

import '@uploadthing/react/styles.css';
import GlobalStyles from '@/components/GlobalStyles';
import { APP_TITLE, LIGHT_TOKENS, DARK_TOKENS } from '@/constants';
import StyledComponentsRegistry from '@/lib/registry';

import Header from '@/components/Header';
import MaxWidthWrapper from '@/components/MaxWidthWrapper';
import SessionProvider from '@/components/SessionProvider';
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
    cookieStore.get('color-theme')?.value === 'dark'
      ? 'dark'
      : 'light';

  const themeColors = theme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
  const session = await getServerSession();

  return (
    <html
      lang="en"
      translate="no"
      data-color-theme={theme}
      style={themeColors as React.CSSProperties}
      className={`${plusJakartaSans.variable} notranslate`}
    >
      <body>
        <MotionConfig reducedMotion="user">
          <StyledComponentsRegistry>
            <MaxWidthWrapper>
              <SessionProvider session={session}>
                <ToastProvider>
                  <Header initialTheme={theme} />
                  {children}
                  {modal}
                  <Footer />
                  <GlobalStyles />
                </ToastProvider>
              </SessionProvider>
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
