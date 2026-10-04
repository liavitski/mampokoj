import { NextResponse, type NextRequest } from 'next/server';

import { buildCsp, NONCE_HEADER } from '@/lib/csp';

/**
 * Mints a per-request CSP nonce.
 *
 * This file is `proxy.ts` and not `middleware.ts` on purpose: the middleware
 * convention is **deprecated** in Next.js 16 and was renamed to proxy
 * (`01-app/03-api-reference/03-file-conventions/middleware.md`). Same behaviour,
 * current name.
 *
 * Why a proxy and not `headers()` in `next.config.ts`, which is where the
 * nonce-free version of this policy would go: a nonce has to be fresh and
 * unpredictable per request, and it has to reach the renderer so Next can
 * attach it to its own bootstrap scripts. Next reads it out of the
 * `Content-Security-Policy` *request* header (`content-security-policy.md:185-193`),
 * which is why that header is set on the way in as well as on the way out.
 *
 * The cost the docs warn about -- "you must use dynamic rendering to add
 * nonces" -- is zero for this app. `cookies()` in the root layout already makes
 * every HTML route `ƒ`, confirmed against a production build; the three static
 * routes (`/robots.txt`, `/sitemap.xml`, `/opengraph-image`) are not documents.
 * See SPEC-csp.md.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

  const policy = buildCsp({ nonce, isDev });

  // Only ever *added* to. Nothing here rewrites or removes a header the route
  // handler or next-auth needs -- `/api/auth/*` passes through this function,
  // and next-auth reads cookies, not request headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', policy);

  return response;
}

export const config = {
  matcher: [
    {
      /**
       * Static assets are excluded; `/api` is deliberately **not**.
       *
       * The docs' example matcher skips `api` as well
       * (`/((?!api|_next/static|_next/image|favicon.ico).*)`). That would leave
       * `/api/auth/signin` with no policy at all -- and it is the one place
       * next-auth renders a real HTML document, as a standalone page built by
       * its own Preact renderer rather than by Next. Its inline `<style>` is
       * permitted by `style-src 'unsafe-inline'`, it has no scripts to block,
       * and it serves the app's provider logo from `authjs.dev`, which is why
       * that host is in `img-src`.
       *
       * Prefetches are skipped, per the docs, so client-side navigation does not
       * pay to mint a nonce it would not use.
       */
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};