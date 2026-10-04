// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  NONCE_HEADER,
  UPLOADTHING_ROUTER_CONFIG_HASH,
  UPLOADTHING_ROUTER_CONFIG_SCRIPT,
  buildCsp,
  cspDirective,
} from '../csp';

const NONCE = 'dGhpcy1pcy1hLW5vbmNl';

// Imported at the bottom of this file rather than beside the test that needs it,
// because `vi.mock` is hoisted and Vitest rejects a nested one. Only the hash
// test imports the upload router, and neither mocked module participates in the
// rest of this file.
vi.mock('@/server/attach-image', () => ({ addImageToAd: vi.fn() }));
vi.mock('@/server/upload-guard', () => ({ checkUploadAdmission: vi.fn() }));

describe('buildCsp', () => {
  it('puts the caller nonce in script-src', () => {
    const policy = buildCsp({ nonce: NONCE, isDev: false });

    expect(cspDirective(policy, 'script-src')).toContain(`'nonce-${NONCE}'`);
  });

  it('rejects an empty nonce rather than emitting a policy that matches nothing', () => {
    // `'nonce-'` is inert: a script would be blocked, and the header would read
    // as though a nonce policy were in force. One call site, so fail there.
    expect(() => buildCsp({ nonce: '', isDev: false })).toThrow(/non-empty/);
  });

  it('is a single line, because a header value cannot contain a newline', () => {
    const policy = buildCsp({ nonce: NONCE, isDev: false });

    expect(policy).not.toMatch(/[\n\r]/);
  });

  describe('script-src', () => {
    it('never allows inline script in production', () => {
      // The entire point of the exercise. If this regresses, an injected
      // <script> runs again and nothing else in the suite would notice.
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'script-src')
      ).not.toContain("'unsafe-inline'");
    });

    it('never allows eval in production', () => {
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'script-src')
      ).not.toContain("'unsafe-eval'");
    });

    it('allows eval in development only, because React needs it there', () => {
      // content-security-policy.md:42 -- React reconstructs server-side error
      // stacks with eval. The condition is easy to invert, and the cost of
      // inverting it is a production XSS gap that is invisible until exploited.
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: true }), 'script-src')
      ).toContain("'unsafe-eval'");
    });

    it('uses strict-dynamic, which is what makes omitting host sources safe', () => {
      // With 'strict-dynamic', CSP3 browsers ignore 'self' and scheme sources
      // in script-src -- so a nonce'd bootstrap script cannot pull in an
      // attacker-named host either. Nonce and hash sources are not host-based
      // and keep working, which is why the UploadThing hash survives this.
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'script-src')
      ).toContain("'strict-dynamic'");
    });

    it('carries the UploadThing router-config hash', () => {
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'script-src')
      ).toContain(UPLOADTHING_ROUTER_CONFIG_HASH);
    });
  });

  describe('the origins it allows', () => {
    it('does not need any of the four images.remotePatterns hostnames', () => {
      // Every <Image> uses the default next/image loader, so the browser only
      // requests /_next/image?url=... on our own origin and the optimizer
      // fetches remote bytes server-side. remotePatterns is the optimizer's
      // allowlist, not a CSP one. Listing them here would widen the policy by
      // four origins for no benefit.
      const imgSrc = cspDirective(
        buildCsp({ nonce: NONCE, isDev: false }),
        'img-src'
      );

      for (const host of [
        'picsum.photos',
        'avatars.githubusercontent.com',
        'lh3.googleusercontent.com',
        'ufs.sh',
      ]) {
        expect(imgSrc).not.toContain(host);
      }
    });

    it('allows the next-auth sign-in page its logo origin', () => {
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'img-src')
      ).toContain('https://authjs.dev');
    });

    it('allows blob: images, which is where a pasted image preview would live', () => {
      const imgSrc = cspDirective(
        buildCsp({ nonce: NONCE, isDev: false }),
        'img-src'
      );

      expect(imgSrc).toContain('blob:');
      expect(imgSrc).toContain('data:');
    });

    it('does not allow Google OAuth hosts, which are server-side only', () => {
      // accounts.google.com is a top-level navigation from a next-auth page,
      // which no shipped CSP directive gates; oauth2.googleapis.com and
      // openidconnect.googleapis.com are fetched by the Node process.
      const policy = buildCsp({ nonce: NONCE, isDev: false });

      expect(policy).not.toContain('accounts.google.com');
      expect(policy).not.toContain('googleapis.com');
    });

    it('allows the presigned UploadThing upload host for any region', () => {
      // This app's token decodes to regions: ["sea1"] with no ingestHost, and
      // uploadthing's ParsedToken defaults that to ingest.uploadthing.com --
      // so the PUT goes to https://sea1.ingest.uploadthing.com. The pattern
      // rather than the exact host, because an exact host breaks silently when a
      // second region is enabled.
      const connectSrc = cspDirective(
        buildCsp({ nonce: NONCE, isDev: false }),
        'connect-src'
      );

      expect(connectSrc).toContain('https://*.ingest.uploadthing.com');
      // `*.host` does not match `host` itself.
      expect(connectSrc).toContain('https://ingest.uploadthing.com');
    });
  });

  describe('the directives that do the non-script work', () => {
    it.each([
      ['object-src', "'none'"],
      ['frame-ancestors', "'none'"],
      ['frame-src', "'none'"],
      ['base-uri', "'self'"],
      ['default-src', "'self'"],
      ['form-action', "'self'"],
    ])('%s is %s', (directive, expected) => {
      // frame-ancestors is the clickjacking control, and /moderation performs
      // destructive actions on click -- the reason this item exists at all.
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), directive)
      ).toBe(expected);
    });

    it('omits upgrade-insecure-requests, which would break any http deployment', () => {
      // Every example in content-security-policy.md includes it. It upgrades
      // *subresource* requests, so on http://localhost:3000 -- exactly what
      // E2E_BASE_URL targets -- every same-origin script and stylesheet would be
      // requested over https and fail. HSTS covers production instead and is
      // ignored by browsers when received over http. See HANDOFF.md §3.
      expect(cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'upgrade-insecure-requests')).toBeUndefined();
      expect(buildCsp({ nonce: NONCE, isDev: false })).not.toContain(
        'upgrade-insecure-requests'
      );
    });

    it('allows inline style, because three independent things require it', () => {
      // next-auth v4's sign-in page emits inline CSS and supports no nonce;
      // global-error.tsx uses inline style objects by design; styled-components
      // re-injects on the client. Present-but-unnoticed is the likely way this
      // regresses -- it looks like a policy, and it stops working on a page
      // nobody tests.
      expect(
        cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'style-src')
      ).toContain("'unsafe-inline'");
    });
  });

  it('exposes the nonce header name proxy and app code agree on', () => {
    expect(NONCE_HEADER).toBe('x-nonce');
  });
});

describe('cspDirective', () => {
  it('returns undefined for a directive the policy does not set', () => {
    expect(cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'report-uri')).toBeUndefined();
  });

  it('does not confuse a directive with a source expression that names one', () => {
    // 'self' contains no directive name, but a value like 'nonce-default-src'
    // would be a realistic trap if a future value ever embedded one.
    expect(cspDirective(buildCsp({ nonce: NONCE, isDev: false }), 'nonce')).toBeUndefined();
  });
});

describe('the UploadThing router-config hash', () => {
  // This is the assertion that keeps the hash from rotting. `@uploadthing/react`
  // renders `globalThis.__UPLOADTHING = <routerConfig>` into a <script> with
  // `dangerouslySetInnerHTML` and no nonce prop, so the policy can only admit it
  // by hashing the exact bytes -- and those bytes are a function of
  // src/app/api/uploadthing/core.ts.
  //
  // Add a route, change maxFileSize, and this fails. Without it the failure is
  // silent: the script is blocked, @uploadthing/react falls back to fetching
  // /api/uploadthing (same origin, allowed), and uploads keep working one
  // request slower with a CSP violation nobody reads.

  it('matches the router config the SSR plugin would actually render', async () => {
    const { extractRouterConfig } = await import('uploadthing/server');
    const { ourFileRouter } = await import('@/app/api/uploadthing/core');

    // Verbatim from @uploadthing/react/next-ssr-plugin/index.js.
    const rendered = `globalThis.__UPLOADTHING = ${JSON.stringify(
      extractRouterConfig(ourFileRouter)
    )};`;

    expect(rendered).toBe(UPLOADTHING_ROUTER_CONFIG_SCRIPT);

    const digest = createHash('sha256')
      .update(rendered, 'utf8')
      .digest('base64');

    expect(UPLOADTHING_ROUTER_CONFIG_HASH).toBe(`'sha256-${digest}'`);
  });
});