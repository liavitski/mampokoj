import * as React from 'react';
import styled from 'styled-components';
import { CZ_REGIONS } from '@/constants';
import Link from 'next/link';

function RegionNavigation() {
  return (
    <aside>
      <nav>
        <RegionListWrapper>
          {CZ_REGIONS.map((region) => {
            return (
              <RegionLink key={region.code} href={'/'}>
                {region.name_en}
              </RegionLink>
            );
          })}
        </RegionListWrapper>
      </nav>
    </aside>
  );
}

const RegionListWrapper = styled.ul`
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 16px;
`;

const RegionLink = styled(Link)`
  font-size: 1rem;
  text-decoration: none;
  color: var(--color-link);

  &:hover {
    color: var(--color-link-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 0px;
  }
`;

export default RegionNavigation;
