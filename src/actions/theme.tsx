'use server';

import { cookies } from 'next/headers';
import type { Theme } from '../types/theme';

export async function setThemeCookie(theme: Theme) {
  const cookieStore = await cookies();
  cookieStore.set('color-theme', theme, {
    maxAge: 60 * 60 * 24 * 365,
  });
}
