'use client';

import * as React from 'react';
import styled from 'styled-components';
import { CZ_REGIONS, WEIGHTS } from '@/constants';
import Link from 'next/link';
import type { RegionCode } from '@/types/db-types';
import type { Route } from 'next';
import {
  useRouter,
} from 'next/navigation';
import { useTransition } from 'react';

type RegionNavigationProps = {
  currentRegion?: string;
};

function RegionNavigation({ currentRegion }: RegionNavigationProps) {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [hoveredNavItem, setHoveredNavItem] =
    React.useState<RegionCode | null>(null);

  return (
    <nav onMouseLeave={() => setHoveredNavItem(null)}>
      <RegionListWrapper>
        {CZ_REGIONS.map((region) => {
          /*
           * The `Route` annotation is what makes this checked rather than
           * asserted. `typedRoutes` (`next.config.ts`) only forms a template
           * literal type when there is a contextual one to infer from, so an
           * unannotated `const` widens to `string` and `router.push` then
           * rejects it. With the annotation, `region.code` distributes over
           * the fourteen codes and every one of them is checked against the
           * generated route table -- rename `?region=` and this fails to
           * compile, rather than 14 links quietly going nowhere.
           *
           * `as Route` on the whole expression would pass the check without
           * performing it.
           */
          const href: Route = `/?region=${region.code}`;

          return (
            <LinkWrapper key={region.code}>
              {hoveredNavItem === region.code && <LinkBackground />}
              <RegionLink
                href={href}
                $active={currentRegion === region.code}
                $pending={isPending}
                onMouseEnter={() => setHoveredNavItem(region.code)}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  /*
                   * Plain left clicks only.
                   *
                   * This handler exists to put the navigation inside a
                   * transition, so `$pending` can show a `wait` cursor while the
                   * server answers -- and `router.push` is how that transition
                   * gets started. Everything else is a gesture the *browser*
                   * owns: a modified click or a middle click means "open this
                   * somewhere else", and the one thing it does is follow the
                   * `href`.
                   *
                   * The guard used to be absent, so `preventDefault()` consumed
                   * those clicks too. The visible effect was that a visitor
                   * comparing two regions in two tabs could not do it from the
                   * navigation: cmd-click and middle-click did nothing at all,
                   * with nothing thrown or logged. A fix that checked only
                   * `metaKey`/`ctrlKey` would have left middle click broken, and
                   * both are asserted separately in
                   * `__tests__/RegionNavigation.test.tsx`.
                   *
                   * Left as `router.push` rather than the documented
                   * `useLinkStatus` alternative, which would drop the handler
                   * entirely: that hook reports no pending state when the
                   * destination was prefetched, and it is pending per link
                   * rather than for the whole list. This navigation is a list of
                   * fourteen links to one dynamic route, so a prefetched
                   * destination is the common case and the `wait` cursor would
                   * mostly never appear. Revisit if the region pages ever get a
                   * `loading.tsx` worth showing.
                   */
                  const isPlainLeftClick =
                    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey;

                  if (isPending || !isPlainLeftClick) return;

                  e.preventDefault();
                  startTransition(() => {
                    router.push(href);
                  });
                }}
              >
                {region.name_en}
              </RegionLink>
            </LinkWrapper>
          );
        })}
      </RegionListWrapper>
    </nav>
  );
}

const RegionListWrapper = styled.ul`
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 12px;
  margin-left: -8px;
`;

const LinkWrapper = styled.li`
  list-style-type: none;
  position: relative;
`;

/**
 * The 4px bar marking the hovered region.
 *
 * A plain `div`, and that is the whole change. This was `styled(motion.div)` with
 * a `layoutId`, which made the bar *slide* from the previously hovered region to
 * the current one. That was `motion-dom` -- 41 KB of projection engine, and the
 * single largest reason `motion` was in the client bundle at all (HANDOFF.md §7).
 * The slide was polish and it has been removed rather than reimplemented:
 * the bar still appears under the hovered region, it just arrives instead of
 * travelling.
 *
 * Nothing was lost but the motion. The region you are on is carried by
 * `$active` on the link itself, and the hover is carried by this bar, so the
 * indicator never needed to be animated to be legible.
 */
const LinkBackground = styled.div`
  background-color: var(--color-secondary);
  position: absolute;
  left: 0;
  width: 4px;
  height: 100%;
`;

const RegionLink = styled(Link)<{
  $active?: boolean;
  $pending?: boolean;
}>`
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  width: fit-content;
  padding: 4px 8px;
  border-radius: 4px;
  text-decoration: none;
  color: ${({ $active }) =>
    $active
      ? 'var(--color-secondary-foreground)'
      : 'var(--color-link)'};
  background-color: ${({ $active }) =>
    $active ? 'var(--color-secondary)' : 'transparent'};

  cursor: ${({ $pending }) => ($pending ? 'wait' : 'pointer')};
  /* opacity: ${({ $pending }) => ($pending ? 0.6 : 1)}; */

  &:hover {
    color: var(--color-link-hover);
    color: ${({ $active }) =>
      $active
        ? 'var(--color-secondary-foreground)'
        : 'var(--color-link-hover)'};
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 0px;
  }
`;

export default RegionNavigation;
