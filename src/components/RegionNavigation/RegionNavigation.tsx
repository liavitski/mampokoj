'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import styled from 'styled-components';
import { CZ_REGIONS, WEIGHTS } from '@/constants';
import Link from 'next/link';
import type { RegionCode } from '@/types/db-types';
import {
  usePathname,
  useSearchParams,
  useRouter,
} from 'next/navigation';
import { useTransition } from 'react';

type RegionNavigationProps = {
  currentRegion?: string;
};

function RegionNavigation({ currentRegion }: RegionNavigationProps) {
  const router = useRouter();
  const id = React.useId();

  const [isPending, startTransition] = useTransition();
  const [hoveredNavItem, setHoveredNavItem] =
    React.useState<RegionCode | null>(null);

  return (
    <nav onMouseLeave={() => setHoveredNavItem(null)}>
      <RegionListWrapper>
        {CZ_REGIONS.map((region) => {
          const href = `/?region=${region.code}`;

          return (
            <LinkWrapper key={region.code}>
              {hoveredNavItem === region.code && (
                <LinkBackground
                  layoutId={id}
                  transition={{
                    type: 'spring',
                    stiffness: 350,
                    damping: 30,
                  }}
                />
              )}
              <RegionLink
                href={href}
                $active={currentRegion === region.code}
                $pending={isPending}
                onMouseEnter={() => setHoveredNavItem(region.code)}
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

const LinkBackground = styled(motion.div)`
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
  opacity: ${({ $pending }) => ($pending ? 0.6 : 1)};

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
