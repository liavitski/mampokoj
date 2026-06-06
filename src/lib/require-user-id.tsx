'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function requireUserId() {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}

