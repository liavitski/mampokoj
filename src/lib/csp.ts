/**
 * The Content Security Policy, as one pure function.
 *
 * Zero imports on purpose. `src/proxy.ts` builds this string, and `proxy.md`
 * warns that proxy "should not attempt relying on shared modules or globals" --
 * so this module must not pull in the database, `server-only`, or any vendor
 * schema. The one value that *could* have been derived at request time (the
 * UploadThing router config) is a literal here instead, held honest by a test
 * that recomputes it from the real router:
 * `src/lib/__tests__/csp.test.ts`.
 *
 * The spec, and the measurements behind every entry, are in `HANDOFF.md` §3.
 */

/**
 * The request header the nonce is passed down in.
 *
 * Next parses the nonce out of the `Content-Security-Policy` *request* header,
 * not this one (`content-security-policy.md:185-193`); the docs' pattern sets
 * both. `x-nonce` is what app code reads if it ever needs to render a `<Script>`
 * by hand.
 */
export const NONCE_HEADER = 'x-nonce';

/**
 * The exact `dangerouslySetInnerHTML` payload `@uploadthing/react`'s SSR plugin
 * injects, verbatim:
 *
 *   const html = [`globalThis.__UPLOADTHING = ${JSON.stringify(props.routerConfig)};`]
 *
 * `routerConfig` is `extractRouterConfig(ourFileRouter)` from
 * `src/app/api/uploadthing/core.ts`, so this string is a function of that file.
 * The plugin offers no `nonce` prop, so a content hash is the only way to let it
 * through a `script-src` with no `'unsafe-inline'`.
 *
 * If `core.ts` changes, `__tests__/csp.test.ts` fails on the mismatch. That is
 * the whole point of keeping it here rather than computing it at request time.
 */
export const UPLOADTHING_ROUTER_CONFIG_SCRIPT =
  'globalThis.__UPLOADTHING = [{"slug":"imageUploader","config":{"image":{"maxFileSize":"4MB","maxFileCount":1,"minFileCount":1,"contentDisposition":"inline"}}}];';

/**
 * sha256 of `UPLOADTHING_ROUTER_CONFIG_SCRIPT`, base64, per the CSP hash-source
 * syntax. Asserted against the real router in `__tests__/csp.test.ts`.
 *
 * Note this keeps working under `'strict-dynamic'`: that keyword makes browsers
 * ignore *host* sources such as `'self'` and scheme sources, but nonce and hash
 * sources are not host-based and are still matched.
 */
export const UPLOADTHING_ROUTER_CONFIG_HASH =
  "'sha256-9rh1hg0t8gzBb+71sg04fUOw1ZnwOMplqN4Jqi1j5o4='";

/**
 * Origins the browser may `connect-src` to beyond `'self'`.
 *
 * UploadThing hands the client a presigned URL to `PUT` the file to, and that
 * host is minted by UploadThing's infrastructure rather than named in this repo.
 * It is derivable rather than guessed -- `uploadthing`'s `ParsedToken` defaults
 * `ingestHost` to `ingest.uploadthing.com`
 * (`shared-schemas-*.js:29`) and this app's `UPLOADTHING_TOKEN` decodes to
 * `regions: ["sea1"]` with no `ingestHost` override, so the upload goes to
 * `https://sea1.ingest.uploadthing.com`.
 *
 * A `*.` pattern is used instead of the exact `sea1.` host because re-deriving
 * that vendor token schema at request time would duplicate it into our code,
 * where it can drift; and because an exact host breaks silently the day a
 * second region is enabled. The bare host is listed too, since `*.host` does not
 * match `host` itself.
 */
const CONNECT_SRC_EXTERNAL = [
  'https://ingest.uploadthing.com',
  'https://*.ingest.uploadthing.com',
];

/**
 * The one remote image origin, and it is not one of the four in
 * `next.config.ts`'s `images.remotePatterns`.
 *
 * next-auth v4's built-in sign-in page is a standalone document built by
 * next-auth's own Preact `renderToString`, and it pulls its provider logo from
 * `authjs.dev` (`next-auth/src/core/pages/signin.tsx:111`) -- the local
 * `public/google.svg` fallback does not exist in this repo.
 *
 * The four `remotePatterns` hosts are deliberately absent: every `<Image>` uses
 * the default `next/image` loader, so the browser only ever requests
 * `/_next/image?url=...` on our own origin and the optimizer fetches the remote
 * bytes server-side. `remotePatterns` is the optimizer's allowlist, not a CSP
 * one.
 */
const IMG_SRC_EXTERNAL = ['https://authjs.dev'];

/**
 * Builds the policy.
 *
 * `isDev` adds `'unsafe-eval'` and nothing else. React uses `eval` in
 * development to reconstruct server-side error stacks in the browser
 * (`content-security-policy.md:42`); neither React nor Next use `eval` in
 * production, and `'unsafe-eval'` must be *absent* from the production policy
 * for it to mean anything. `__tests__/csp.test.ts` asserts both halves, because
 * the cost of getting the condition backwards is a production XSS gap that
 * nothing else in the suite would notice.
 */
export function buildCsp({ nonce, isDev }: { nonce: string; isDev: boolean }) {
  // An empty nonce would emit `'nonce-'`, which matches nothing and reads like
  // a working policy. Fail loudly at the one call site instead.
  if (!nonce) {
    throw new Error('buildCsp: nonce must be a non-empty string');
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${UPLOADTHING_ROUTER_CONFIG_HASH}${
      isDev ? " 'unsafe-eval'" : ''
    }`,
    // 'unsafe-inline' is required here and cannot be removed. Three
    // independent blockers, any one fatal: next-auth v4's own sign-in page
    // emits inline CSS and supports no nonce; `global-error.tsx` uses inline
    // `style` objects by design; and styled-components re-injects on the
    // client. Because 'unsafe-inline' is present, a style-src nonce would be
    // ignored anyway -- which is why `src/lib/registry.tsx` is left alone.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${IMG_SRC_EXTERNAL.join(' ')}`,
    "font-src 'self'",
    `connect-src 'self' ${CONNECT_SRC_EXTERNAL.join(' ')}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // `upgrade-insecure-requests` is intentionally absent, though every
    // example in content-security-policy.md includes it. It upgrades
    // *subresource* requests, so on any http:// deployment -- including
    // `next start` on http://localhost:3000, which is what E2E_BASE_URL points
    // the Playwright suite at -- every same-origin script and stylesheet would
    // be requested over https and fail. HSTS covers production and is ignored
    // by browsers when received over http. See HANDOFF.md §3 before "fixing".
  ].join('; ');
}

/**
 * Parses one directive out of a policy string, for tests and for the one place
 * that needs to check what was actually built. Returns the whole value string,
 * e.g. `'self' 'nonce-abc' 'strict-dynamic'`.
 */
export function cspDirective(policy: string, name: string): string | undefined {
  for (const part of policy.split(';')) {
    const [directive, ...values] = part.trim().split(/\s+/);
    if (directive === name) return values.join(' ');
  }
  return undefined;
}