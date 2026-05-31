import { Plus_Jakarta_Sans } from "next/font/google";
import { APP_TITLE, LIGHT_TOKENS, DARK_TOKENS } from "@/constants";
import { cookies } from "next/headers";
import type { Theme } from "@/types/theme";
import StyledComponentsRegistry from "@/lib/registry";
import "./globals.css";
import "@uploadthing/react/styles.css";

import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "@/app/api/uploadthing/core";

import Header from "@/components/Header";
import MaxWidthWrapper from "@/components/MaxWidthWrapper";
import SessionProvider from "@/components/SessionProvider";
import { getServerSession } from "next-auth";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-family",
  subsets: ["latin"],
  display: "fallback",
  weight: "variable",
});

export const metadata = {
  title: {
    template: `%s • ${APP_TITLE}`,
    default: APP_TITLE,
  },
  description: "App that helps you to rent a room",
};

// TODO Do this and that

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme: Theme =
    cookieStore.get("color-theme")?.value === "dark" ? "dark" : "light";

  const themeColors = theme === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  const session = await getServerSession();

  return (
    <html
      lang="en"
      data-color-theme={theme}
      style={themeColors as React.CSSProperties}
      className={`${plusJakartaSans.variable}`}
    >
      <body>
        <StyledComponentsRegistry>
          <MaxWidthWrapper>
            <SessionProvider session={session}>
              <Header initialTheme={theme} />
              {children}
            </SessionProvider>
            <NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />
          </MaxWidthWrapper>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
