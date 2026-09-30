// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { canViewDashboard } from '../dashboard-access';

const OWNER = 'user-a';

describe('canViewDashboard', () => {
  it('allows a user to view their own dashboard', () => {
    expect(canViewDashboard(OWNER, OWNER)).toBe(true);
  });

  it("refuses another user's dashboard", () => {
    expect(canViewDashboard(OWNER, 'user-b')).toBe(false);
  });

  it('refuses everyone when nobody is signed in', () => {
    expect(canViewDashboard(null, OWNER)).toBe(false);
  });

  it('refuses an empty route segment', () => {
    expect(canViewDashboard(OWNER, '')).toBe(false);
  });

  it('refuses when both are nullish', () => {
    expect(canViewDashboard(null, '')).toBe(false);
  });
});
