'use client';
import * as React from 'react';
import { motion } from 'motion/react';
import styled from 'styled-components';
import { CZ_REGIONS } from '@/constants';
import Link from 'next/link';

type RegionCode = (typeof CZ_REGIONS)[number]['code'];

type RegionNavigationProps = {
  currentRegion?: RegionCode;
};

function RegionNavigation({
  currentRegion = 'PR',
}: RegionNavigationProps) {
  const [hoveredNavItem, setHoveredNavItem] =
    React.useState<RegionCode | null>(null);
  const id = React.useId();

  return (
    <nav onMouseLeave={() => setHoveredNavItem(null)}>
      <RegionListWrapper>
        {CZ_REGIONS.map((region) => {
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
                href={'/'}
                $active={currentRegion === region.code}
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

const RegionLink = styled(Link)<{ $active?: boolean }>`
  font-size: 1rem;
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
