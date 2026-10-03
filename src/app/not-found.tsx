import type { Metadata } from 'next';

import { Header } from './not-found.styles';

/**
 * The 404 page's title.
 *
 * **No `robots` field here, and that is deliberate.** Next.js emits
 * `<meta name="robots" content="noindex">` on its own for any response with a
 * 404 status, so declaring `robots` here produced *two* robots tags on the page
 * -- verified against a production build, and the second one is the only way
 * this file could have looked like it was doing something when it was not.
 *
 * That built-in tag is also the reason the status fix in `(browse)/loading.tsx`
 * matters beyond uptime monitors: before it, `/ad/<missing>` answered 200, and
 * a 200 does not get the automatic `noindex`. A removed listing then stayed
 * indexable on its own merits, because nothing was telling a crawler to drop it.
 *
 * The title is here because the built-in one is the bare template, which on a
 * 404 reads as the site name and nothing else.
 */
export const metadata: Metadata = {
  title: 'Stránka nenalezena',
};

export default function NotFound() {
  return <Header>404 - Page Not Found</Header>;
}
