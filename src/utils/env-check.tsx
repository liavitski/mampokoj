import 'dotenv/config';

/**
 * Whether this environment has what the app needs to actually work.
 *
 * Exists because the worst failures in this app are silent ones. `MODERATORS`
 * unset does not throw, does not log, and does not render an error — the
 * moderation queue simply refuses every moderator forever, and the symptom
 * names nothing about the cause (`HANDOFF.md` §1). That cost an afternoon
 * twice. This makes the same check a command.
 *
 * **What this cannot do, stated plainly:** it reads *this* process's
 * environment, so `pnpm env:check` verifies your machine or a shell you export
 * into — never a Vercel deployment. Production env vars live in the dashboard,
 * are scoped per environment, and this file cannot see them. For production,
 * the check is a signed-in visit to `/moderation`; treat that as the smoke test
 * rather than expecting this to cover it.
 *
 * Only variables whose absence is *silent* are required. `DATABASE_URL` missing
 * throws loudly on the first query, so it is reported as info rather than
 * failing the check.
 */

/** Missing means the feature is silently broken rather than obviously broken. */
const REQUIRED: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: 'MODERATORS',
    why: 'the moderation queue refuses every moderator, silently and forever',
  },
  {
    name: 'GOOGLE_CLIENT_ID',
    why: 'sign-in fails at the provider, which looks like a broken button',
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    why: 'sign-in fails at the token exchange',
  },
  {
    name: 'NEXTAUTH_SECRET',
    why: 'sessions do not survive, so sign-in appears not to stick',
  },
  {
    name: 'NEXTAUTH_URL',
    why: 'the OAuth callback redirects somewhere wrong',
  },
  {
    name: 'UPLOADTHING_TOKEN',
    why: 'uploads are rejected after admission, so photos silently fail',
  },
];

/** Absent is loud, so these are reported but do not fail the check. */
const REPORTED: ReadonlyArray<string> = [
  'DATABASE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

/**
 * What "set" means here, precisely: **non-empty after trimming.** That catches
 * unset, empty and whitespace-only, which are the three real ways this goes
 * wrong by accident.
 *
 * It does **not** validate the shape. `MODERATORS=pavel@gmail.com` passes this
 * check and still refuses every moderator, because an email never matches an
 * account id. Nothing short of a signed-in request can catch that, which is
 * why the closing message tells you to visit the page rather than trusting a
 * green run. Stating the limit here so nobody reads a pass as proof.
 */

function main(): void {
  const missing = REQUIRED.filter(({ name }) => !process.env[name]?.trim());

  for (const name of REPORTED) {
    const status = process.env[name]?.trim() ? 'set' : 'MISSING';
    console.log(`  ${status.padEnd(8)} ${name}`);
  }

  console.log('');
  for (const { name, why } of REQUIRED) {
    if (missing.some((m) => m.name === name)) {
      console.log(`  MISSING  ${name} — ${why}`);
    } else {
      console.log(`  set      ${name}`);
    }
  }

  if (missing.length > 0) {
    console.log(
      `\n${missing.length} required variable(s) missing.\n` +
        'Local .env is gitignored, so it does NOT travel to Vercel. Set these in\n' +
        'the Vercel dashboard per environment (Settings -> Environment Variables),\n' +
        'and note that a Preview deployment needs its own copy.\n' +
        'See HANDOFF.md §1.'
    );
    process.exit(1);
  }

  console.log('\nAll required variables are set in this environment.');
  console.log(
    'That says nothing about Vercel. To check production, visit /moderation\n' +
      'while signed in: an empty queue with a "Reported ads" heading means the\n' +
      'allowlist matched, and "Not allowed." means it did not.'
  );
}

main();