/**
 * Whether the signed-in user may view a dashboard.
 *
 * Extracted from the dashboard page so the check is a plain function that can
 * be tested directly. It is the one place in the app where a URL segment, not
 * the session, drives a database read, and the review noted it had no
 * coverage: deleting the guard, or moving it below the query, broke no test.
 */
export function canViewDashboard(
  sessionUserId: string | null,
  routeUserId: string
): boolean {
  return Boolean(sessionUserId) && sessionUserId === routeUserId;
}
