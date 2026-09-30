import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import RegionSelectBlock from '../RegionSelectBlock';

// The block is display:none by default and only shown under a media query,
// which jsdom does not evaluate, so it is hidden from the accessibility tree.
const COMBOBOX = { hidden: true } as const;

beforeEach(() => {
  push.mockClear();
});

describe('RegionSelectBlock', () => {
  it('shows the placeholder when no region is selected', () => {
    render(<RegionSelectBlock />);

    expect(screen.getByRole('combobox', COMBOBOX)).toHaveTextContent(
      'Select region'
    );
  });

  it('reflects the region already in the URL', () => {
    render(<RegionSelectBlock currentRegion="PR" />);

    expect(screen.getByRole('combobox', COMBOBOX)).toHaveTextContent('Prague');
  });

  it('passes an undefined value rather than an empty string', () => {
    // Radix reserves the empty string, so a controlled select must not be
    // given one. An undefined value keeps it uncontrolled and lets the
    // placeholder show.
    render(<RegionSelectBlock />);

    expect(screen.getByRole('combobox', COMBOBOX)).toHaveAttribute(
      'data-placeholder'
    );
  });

  // Choosing a region is not asserted here: Radix Select opens its content in
  // a portal and will not do so in jsdom while the trigger is display:none,
  // which is this block's default state. That path wants an E2E test.
});
