/**
 * The region links have to behave like links.
 *
 * `RegionNavigation` renders a real `<Link>` and then intercepts the click to
 * drive its pending style through `startTransition`. That interception was
 * unconditional, which meant `preventDefault()` ran for *every* click --
 * including the modified ones a browser treats as "open this elsewhere".
 *
 * The consequence is the whole reason this file exists: a visitor comparing two
 * regions in two tabs could not do it from the navigation, because
 * cmd/ctrl-click and middle-click did nothing at all. Nothing threw, nothing
 * logged, and the link looked correct in every other respect.
 *
 * `router.push` is stubbed rather than the router module, because the question
 * is whether this component reaches for it *on its own*. A real navigation would
 * be evidence that the interception is gone; the absence of a call is what proves
 * the browser was left to do its job.
 *
 * jsdom prints `Not implemented: navigation to another Document` for the clicks
 * that reach here uncancelled. That is the assertion passing, not noise: it is
 * jsdom reporting that the browser took over and started following the `href`,
 * which is the one thing that was broken.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CZ_REGIONS } from '@/constants';

import RegionNavigation from '../RegionNavigation';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

/** The link for one region, which is what a visitor actually clicks. */
function linkFor(code: string) {
  return screen.getByRole('link', { name: CZ_REGIONS.find((r) => r.code === code)!.name_en });
}

beforeEach(() => {
  push.mockClear();
});

describe('the region links', () => {
  it('renders one link per region', () => {
    render(<RegionNavigation />);

    expect(screen.getAllByRole('link')).toHaveLength(CZ_REGIONS.length);
  });

  it('points at the region query rather than a path', () => {
    render(<RegionNavigation />);

    expect(linkFor('PR')).toHaveAttribute('href', '/?region=PR');
  });

  /**
   * A plain left click still navigates through the router, so this is the case
   * that was already working -- asserted here so the fix cannot have quietly
   * replaced the interception with "do nothing".
   */
  it('navigates through the router on a plain click', async () => {
    render(<RegionNavigation />);

    await userEvent.click(linkFor('PR'));

    expect(push).toHaveBeenCalledWith('/?region=PR');
  });

  /**
   * The regression, and the whole reason this file exists.
   *
   * `preventDefault()` on a modified click suppresses the browser's own "open
   * this in a new tab", and nothing catches that: the click is consumed, no
   * navigation is requested, and no tab appears. A visitor comparing two
   * regions in two tabs could not do it from the navigation.
   *
   * jsdom opens no tabs, so the assertion is that the component also did not
   * navigate itself -- either outcome means the browser never got to decide,
   * and only the second is visible to a user.
   */
  it.each([
    ['cmd', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['middle', { button: 1 }],
  ])('leaves a %s-click to the browser', (_gesture, init) => {
    render(<RegionNavigation />);

    fireEvent.click(linkFor('PR'), { button: 0, ...init });

    expect(push).not.toHaveBeenCalled();
  });

  /**
   * The other half of the same guard, and the reason it is one condition rather
   * than three separate modifier checks: a declined click must also leave its
   * default alone, or the browser suppresses "open in a new tab" *and* the
   * router never runs -- the click would simply die.
   *
   * `fireEvent` returns `dispatchEvent`'s result, which is `false` exactly when
   * something called `preventDefault()`. So the assertion reads directly, with
   * no negation to get backwards.
   */
  it('leaves the default of a click it declines to handle intact', () => {
    render(<RegionNavigation />);

    const notPrevented = fireEvent.click(linkFor('PR'), {
      button: 0,
      metaKey: true,
    });

    expect(notPrevented).toBe(true);
  });

  /**
   * The reachable half of the `isPending` guard: an ordinary click navigates,
   * exactly once, to the region's own href.
   *
   * The unreachable half -- a click arriving while a navigation is already in
   * flight is dropped -- cannot be driven from a test without rendering real
   * async work behind `startTransition`, and inventing that machinery to observe
   * one `if` would be a worse test than the one line it covers. The condition
   * is read in `RegionNavigation.tsx` and documented there; this pins the
   * behaviour around it, so a change to the handler that broke the common path
   * would fail here.
   */
  it('navigates once per click, to the region the link points at', async () => {
    render(<RegionNavigation />);

    await userEvent.click(linkFor('PR'));
    await userEvent.click(linkFor('PR'));

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith('/?region=PR');
  });
});
