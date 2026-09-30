// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: { getServerSession: vi.fn() },
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
  default: vi.fn(),
}));

const { getSessionUser, requireUserId, getCachedSession } = await import(
  '../session'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSessionUser', () => {
  it('returns the signed-in user id', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-a', name: 'Pavel' },
    });

    const result = await getSessionUser();

    expect(result).toEqual({ userId: 'user-a' });
  });

  it('returns null when nobody is signed in', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    expect(await getSessionUser()).toBeNull();
  });

  it('returns null for a session with no user id', async () => {
    mocks.getServerSession.mockResolvedValue({ user: {} });

    expect(await getSessionUser()).toBeNull();
  });

  it('reads the session exactly once per call', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-a' } });

    await getSessionUser();

    // Components need both "am I signed in" and "is this my ad". Deriving
    // both from one read is the point of this helper: AdCard previously
    // called getServerSession and requireUserId, reading the session twice.
    expect(mocks.getServerSession).toHaveBeenCalledTimes(1);
  });
});

describe('requireUserId', () => {
  it('returns the user id when signed in', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-a' } });

    expect(await requireUserId()).toBe('user-a');
  });

  it('returns null when nobody is signed in', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    expect(await requireUserId()).toBeNull();
  });
});

describe('getCachedSession', () => {
  it('returns the raw session for SessionProvider', async () => {
    const session = { user: { id: 'user-a' }, expires: 'later' };
    mocks.getServerSession.mockResolvedValue(session);

    expect(await getCachedSession()).toEqual(session);
  });
});
