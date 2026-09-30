import { Redacted_Script, Plus_Jakarta_Sans } from 'next/font/google';

export const redactedScript = Redacted_Script({
  subsets: ['latin'],
  weight: ['400'],
  display: 'fallback',
});

/**
 * `--font-sans` because globals.css asks for `var(--font-sans)`.
 *
 * The name here and the `var()` that reads it live in two files, and neither
 * the compiler nor the build compares them: next/font will define a variable
 * nobody reads, and a stylesheet will read one nobody defines. A mismatch is
 * silent, because `font-family` is inherited -- an invalid-at-computed-value-
 * time declaration on <html> leaves the browser on its own default serif with
 * nothing logged. That shipped once already; the test now reads these
 * `variable:` values out of the source instead of trusting a hand-written list,
 * so renaming one fails until the matching `var()` moves with it.
 */
export const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'fallback',
  weight: 'variable',
});
