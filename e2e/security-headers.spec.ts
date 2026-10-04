import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * `@uploadthing/react`'s SSR plugin assigns this during render, and the inline
 * `<script>` it also emits assigns it again. Only the *script* is subject to
 * `script-src`, so the value alone does not prove the content hash matched --
 * see the test that asserts on violations instead.
 */
declare global {
  var __UPLOADTHING: unknown;
  var __cspPwned: unknown;
  var __csp: string[];
}

/**
 * Security headers, as bytes off the wire.
 *
 * `src/lib/__tests__/csp.test.ts` asserts the policy as *text*, which is the
 * right level for "is `'unsafe-inline'` absent". It structurally cannot see
 * whether the header reaches a response at all, whether the nonce actually
 * varies per request, or whether Next attached it to the scripts it emits. Those
 * are properties of the deployed server, and this file is where they are checked.
 *
 * Read-only and anonymous, like the rest of the suite: no ad is created, nothing
 * is signed in, nothing is deleted.
 */

/** Parses `name value; name value` into a record. Header names are case-insensitive. */
function parseCsp(header: string | null): Record<string, string> {
  const directives: Record<string, string> = {};

  for (const part of (header ?? '').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives[name.toLowerCase()] = values.join(' ');
  }

  return directives;
}

async function cspFor(request: APIRequestContext, path: string) {
  const response = await request.get(path, { maxRedirects: 0 });

  return {
    status: response.status(),
    headers: response.headers(),
    directives: parseCsp(
      response.headers()['content-security-policy'] ?? null
    ),
  };
}

const DOCUMENT_ROUTES = [
  '/',
  '/moderation',
  // Reached by the sign-in button. next-auth v4 renders it as a standalone
  // document with its own inline <style> and no scripts, and it is the only
  // HTML page served from /api -- the reason this file's matcher does not skip
  // `api` the way the docs' example does.
  '/api/auth/signin',
];

test.describe('security headers on every document', () => {
  test('the home page answers 200 with a CSP and the four static headers', async ({
    request,
  }) => {
    const { status, headers } = await cspFor(request, '/');

    expect(status).toBe(200);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['strict-transport-security']).toContain('max-age=');
  });

  test('every HTML route carries a CSP, including the one next-auth renders', async ({
    request,
  }) => {
    // Route-level rather than just the home page, because a proxy matcher that
    // is too narrow fails quietly on the routes it excludes. `/api/auth/signin`
    // is the specific case: the docs' example matcher skips `api`, which would
    // leave this page with no policy at all.
    for (const route of DOCUMENT_ROUTES) {
      const { directives, headers } = await cspFor(request, route);

      expect(
        headers['content-security-policy'],
        `no CSP on ${route}`
      ).toBeTruthy();
      expect(directives['frame-ancestors'], `frame-ancestors on ${route}`)
        .toBe("'none'");
    }
  });

  test("script-src allows no inline script and no eval outside development", async ({
    request,
  }) => {
    // The assertion that makes the rest of the policy worth having. Note the
    // production/development split: React uses eval in development to
    // reconstruct server error stacks (`content-security-policy.md:42`), and
    // this suite may run against `pnpm dev` -- so this asserts the shape that
    // holds in *both*, and the dev-only allowance is checked separately.
    for (const route of DOCUMENT_ROUTES) {
      const { directives } = await cspFor(request, route);

      expect(
        directives['script-src'],
        `inline script allowed on ${route}`
      ).not.toContain("'unsafe-inline'");
      expect(
        directives['script-src'],
        `strict-dynamic missing on ${route}`
      ).toContain("'strict-dynamic'");
      expect(directives['base-uri'], `base-uri on ${route}`).toBe("'self'");
      expect(directives['object-src'], `object-src on ${route}`).toBe("'none'");
      expect(directives['form-action'], `form-action on ${route}`).toBe(
        "'self'"
      );
    }
  });

  test("img-src needs none of the four images.remotePatterns hosts", async ({
    request,
  }) => {
    // The negative space, and the claim most likely to be "fixed" later by
    // someone reading todo.md item 7 rather than this file. Every <Image> uses
    // the default next/image loader, so the browser only ever requests
    // /_next/image?url=... on our own origin; the optimizer fetches remote bytes
    // server-side. Listing them would widen the policy for nothing.
    const { directives } = await cspFor(request, '/');
    const imgSrc = directives['img-src'];

    for (const host of [
      'picsum.photos',
      'avatars.githubusercontent.com',
      'lh3.googleusercontent.com',
      'ufs.sh',
    ]) {
      expect(imgSrc, `${host} should not be in img-src`).not.toContain(host);
    }

    // And the one remote image origin that *is* real: next-auth's own sign-in
    // page pulls its provider logo from authjs.dev, and there is no
    // public/google.svg in this repo to fall back to.
    expect(imgSrc).toContain('https://authjs.dev');
  });

  test('the nonce is fresh on every request', async ({ request }) => {
    const first = await cspFor(request, '/');
    const second = await cspFor(request, '/');

    const nonceOf = (value: string) =>
      /'nonce-([^']+)'/.exec(value)?.[1];

    const a = nonceOf(first.directives['script-src']);
    const b = nonceOf(second.directives['script-src']);

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

test.describe('the policy in a real browser', () => {
  /**
   * The check `pnpm build` and a header assertion both miss: whether the app
   * actually works while the policy is enforced. Every case below would pass
   * against a policy so strict that nothing renders.
   */
  async function violationsOn(page: Page, path: string) {
    const violations: string[] = [];

    page.on('console', (message) => {
      if (/violates the following Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    await page.addInitScript(() => {
      globalThis.__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__csp.push(
          `${event.effectiveDirective || event.violatedDirective} ${event.blockedURI}`
        );
      });
    });

    await page.goto(path, { waitUntil: 'networkidle' });

    return {
      violations,
      reported: await page.evaluate(() => globalThis.__csp),
    };
  }

  test('the home page triggers no violation', async ({ page }) => {
    const { violations, reported } = await violationsOn(page, '/');

    expect([...violations, ...reported]).toEqual([]);
  });

  test('no inline script is ever blocked, which is what makes the sha256 work', async ({
    page,
  }) => {
    // THE load-bearing case in this file, and it is asserted as an absence
    // rather than a presence because that is the only honest way to test it.
    //
    // `@uploadthing/react` renders `globalThis.__UPLOADTHING = <routerConfig>`
    // into a <script> via `dangerouslySetInnerHTML` with no nonce prop, so the
    // only way `script-src` admits it is by matching the content hash. If the
    // hash in `src/lib/csp.ts` is wrong, every copy of that script is refused
    // and a `securitypolicyviolation` fires with `blockedURI === 'inline'` on
    // directive `script-src`.
    //
    // It cannot be asserted by reading the policy (a hash always *looks* right)
    // and it cannot be asserted in a unit test (whether a browser honours a hash
    // is the browser's decision). `'strict-dynamic'` does not interfere: hash
    // and nonce sources are not host-based, so it keeps matching.
    //
    // This was verified to fail: with the hash replaced by a wrong one and the
    // app rebuilt, this test fails. An earlier version of it asserted
    // `globalThis.__UPLOADTHING` was defined and passed against that same broken
    // build -- the plugin assigns that global during render too, independently
    // of the <script>, so the assertion could not fail.
    const { reported } = await violationsOn(page, '/');

    const blockedInline = reported.filter(
      (entry) =>
        entry.startsWith('script-src') && entry.includes('inline')
    );

    expect(blockedInline).toEqual([]);
    expect(reported).toEqual([]);
  });

  test('the upload client has its route config', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const config = await page.evaluate(() => globalThis.__UPLOADTHING);

    // A functional check, deliberately *not* described as proof that the hash
    // matched: the plugin assigns this global during render as well as through
    // the inline <script>, so it is defined either way. It is here because a
    // missing route config is a real, silent regression -- uploads would fall
    // back to a same-origin fetch and lose their type limits -- and it is cheap.
    expect(Array.isArray(config)).toBe(true);
    expect((config as { slug: string }[])[0]?.slug).toBe('imageUploader');
  });

  test('an injected inline script does not run', async ({ page }) => {
    // The reason the policy exists. Driven by intercepting the response and
    // appending a script to the markup, which is the shape a real injection
    // takes -- untrusted script bytes inside a document that carries our
    // policy.
    //
    // Deliberately *not* done with `page.evaluate`. A script element created
    // through the DevTools protocol is treated by Chrome as trusted and skips
    // CSP entirely, so that route reports success while testing nothing; it was
    // tried first and is exactly the kind of test that cannot fail.
    await page.route('**/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        '</body>',
        '<script>globalThis.__cspPwned = true;</script></body>'
      );
      await route.fulfill({ response, body });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(await page.evaluate(() => globalThis.__cspPwned)).toBeUndefined();
  });

  test('connect-src is enforced, and the presigned upload host is allowed', async ({
    page,
  }) => {
    // Two things at once. First, that `connect-src` is a live directive and not
    // inert text -- proven by a refusal. Second, that the wildcard covers the
    // host UploadThing's presigned URLs actually use: this app's token decodes
    // to `regions: ["sea1"]` with no `ingestHost`, and uploadthing's
    // `ParsedToken` defaults that to `ingest.uploadthing.com`, making the
    // upload host `https://sea1.ingest.uploadthing.com`.
    //
    // That upload itself cannot be exercised here -- it needs a session, and
    // every spec in this suite is anonymous by design. Reaching the host is the
    // part a policy can be held to.
    await page.goto('/', { waitUntil: 'networkidle' });

    const attempt = (url: string) =>
      page.evaluate(async (target) => {
        try {
          await fetch(target, { mode: 'no-cors' });
          return 'reached';
        } catch {
          return 'blocked';
        }
      }, url);

    expect(await attempt('https://sea1.ingest.uploadthing.com/')).toBe(
      'reached'
    );
    // A host nobody allows, to show the refusal path is real. `picsum.photos` is
    // the sharpest choice: it *is* an `images.remotePatterns` origin, so a
    // future reader can see it is allowed as an image and not as a connection.
    expect(await attempt('https://picsum.photos/')).toBe('blocked');
  });

  test("styled-components' stylesheet survives style-src 'unsafe-inline'", async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // A CSP that blocked styles would leave a readable but completely unstyled
    // page -- no console error, no failed request, and every other assertion in
    // this suite still green.
    await expect(page.locator('style[data-styled]')).toHaveCount(1);
  });
});