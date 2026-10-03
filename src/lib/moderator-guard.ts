/**
 * Who may moderate.
 *
 * `MODERATORS` is a comma-separated list of OAuth account ids -- the same ids
 * `ads.userId` holds, so a GitHub id and a Google id are both valid entries.
 * There is no role column and no permissions table: adding one for a queue that
 * holds one list would be machinery the site does not need, and the ids are
 * already the identity everything else keys on.
 *
 * Fails closed. An unset, empty or malformed value means nobody moderates,
 * because the failure mode of an open allowlist on a live site is a takedown
 * button anyone can press. This is the same reasoning as `SEED_ALLOW` in
 * `seed-guard.ts`, which refuses rather than waving a fresh clone through.
 *
 * Not a secret, and not one: `.env` is copied to the Vercel host (§3), so the
 * list is readable in the deployed environment. That is fine -- it gates the
 * *web* surface, and anyone who can run a script with the repo's `.env` is
 * already fully privileged.
 *
 * Kept free of `server-only` and of any database or session import, so the rule
 * is testable without a connection, for the reason `seed-guard.ts` gives.
 *
 * Deliberately not `'use server'`: marking a module `'use server'` publishes its
 * exports as remotely callable endpoints, which `src/lib/session.ts` documents
 * for `getCachedSession` -- and this one reads an environment variable.
 */
export function parseModeratorAllowlist(
  raw: string | undefined
): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      // Trimmed, because `MODERATORS=alice, bob` is the obvious thing to type
      // and an untrimmed " bob" would silently never match anybody.
      .map((entry) => entry.trim())
      // Empty entries dropped: a trailing comma must not put '' in the set.
      .filter((entry) => entry.length > 0)
  );
}

/**
 * Whether this signed-in user may moderate.
 *
 * Compared whole, never by prefix or substring: a `startsWith` here would let
 * "alice-evil" moderate, and ids are opaque strings from two different
 * providers that share no format to normalise on.
 */
export function isModerator(
  userId: string | null,
  allowlist: ReadonlySet<string>
): boolean {
  if (!userId) return false;
  return allowlist.has(userId);
}
