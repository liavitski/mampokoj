import 'server-only';

import { cache } from 'react';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export type SessionUser = { userId: string };

/**
 * The session, read at most once per request.
 *
 * Every layout, page and server component that needs to know who is signed in
 * shares this one read. `cache()` is scoped to the request, so it dedupes
 * during a render and does not leak between requests.
 *
 * Marked `server-only` rather than `use server`: these are read by server
 * components, not invoked from the client, and `use server` would publish
 * getCachedSession -- which returns the whole session object -- as a remotely
 * callable endpoint.
 */
export const getCachedSession = cache(() => getServerSession(authOptions));

/**
 * The signed-in user, or null.
 *
 * Components need both "am I signed in" and "is this ad mine". Those are the
 * same question, so they are answered from one session read rather than two.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getCachedSession();
  const userId = session?.user?.id;

  return userId ? { userId } : null;
});

/** The signed-in user's id, or null. */
export async function requireUserId(): Promise<string | null> {
  return (await getSessionUser())?.userId ?? null;
}
