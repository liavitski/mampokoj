import { Redacted_Script, Plus_Jakarta_Sans } from 'next/font/google';

export const redactedScript = Redacted_Script({
  subsets: ['latin'],
  weight: ['400'],
  display: 'fallback',
});

export const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-family',
  subsets: ['latin'],
  display: 'fallback',
  weight: 'variable',
});
