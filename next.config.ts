import type { NextConfig } from 'next';

/**
 * Security headers that need no per-request value, so they belong in
 * `headers()` rather than in `src/proxy.ts`: this applies to every response,
 * static assets included, which is exactly where `nosniff` matters most.
 *
 * The CSP is deliberately *not* here. It needs a fresh nonce per request, which
 * is what `proxy.ts` is for. One authority each -- see SPEC-csp.md.
 *
 * `Strict-Transport-Security` is sent unconditionally, including on
 * http://localhost. That is safe: browsers ignore an HSTS header received over
 * http, so it has no effect on local development or on the `next start` the
 * Playwright suite runs against.
 */
const securityHeaders = [
  // Prevents a browser from re-interpreting a response as a type other than the
  // one declared. Relevant on a site where users upload images.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Strictly stronger than the docs' `origin-when-cross-origin` example.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // `frame-ancestors 'none'` in the CSP is the modern control and this is its
  // predecessor, kept because `frame-ancestors` is ignored by older Safari and by
  // non-browser embedders. Nothing here should be framable: /moderation performs
  // destructive actions on a click.
  { key: 'X-Frame-Options', value: 'DENY' },
  // No `preload`. Preload is a submission to a browser vendor list that covers
  // the registrable domain *and every subdomain*; this app is deployed to a
  // Vercel-owned hostname, so claiming it would be a claim about someone else's
  // domain.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Everything is denied because nothing is needed. The app opens no camera
  // (upload is a file input), takes no payment, and asks for no location.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  /**
   * Drops `X-Powered-By: Next.js`. Nothing reads it, and it is free
   * reconnaissance: it tells a scanner which framework to try its published
   * paths against, before it has looked at a single byte of the app. Not a
   * vulnerability on its own, which is why it is a line and not a section in
   * SPEC-csp.md.
   */
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gtiivfj57h.ufs.sh',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
