'use client';

import * as React from 'react';
import styled from 'styled-components';
import { QUERIES, WEIGHTS } from '@/constants';

/**
 * Custom properties a size sets on the element, and which `ButtonBase` reads
 * back with `var()`. They are spelled in kebab-case to match the `var()` calls
 * below, because React writes custom properties from a `style` object verbatim
 * and nothing in the type system connects the two: `--fontSize` set here and
 * `var(--font-size)` read there is a declaration that silently does nothing.
 */
type SizeConfig = {
  '--border-radius': string;
  '--font-size': string;
  '--padding': string;
};

const SIZES = {
  small: {
    '--border-radius': 16 + 'px',
    '--font-size': 16 / 16 + 'rem',
    '--padding': '4px 12px',
  },
} satisfies Record<string, SizeConfig>;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: 'fill' | 'outline' | 'ghost';
  size: keyof typeof SIZES;
  destructive?: boolean;
  children: React.ReactNode;
};

const Button = ({
  variant,
  size,
  destructive = false,
  children,
  style,
  ...delegated
}: ButtonProps) => {
  const sizeStyles = SIZES[size];

  const variantMap = {
    fill: FillButton,
    outline: OutlineButton,
    ghost: GhostButton,
  } as const;

  const Component = variantMap[variant];

  return (
    <Component
      $destructive={destructive}
      style={{
        ...sizeStyles,
        ...style,
      }}
      {...delegated}
    >
      {children}
    </Component>
  );
};

const ButtonBase = styled.button`
  font-size: var(--font-size);
  padding: var(--padding);
  border-radius: var(--border-radius);
  border: 2px solid transparent;
  cursor: pointer;
  font-weight: ${WEIGHTS.normal};

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  @media ${QUERIES.phoneAndSmaller} {
    font-size: 0.875rem;
  }
`;

const FillButton = styled(ButtonBase)<{ $destructive?: boolean }>`
  background-color: ${({ $destructive }) =>
    $destructive
      ? 'var(--color-destructive)'
      : 'var(--color-primary)'};

  color: ${({ $destructive }) =>
    $destructive
      ? 'var(--color-destructive-foreground)'
      : 'var(--color-primary-foreground)'};

  &:hover {
    background-color: ${({ $destructive }) =>
      $destructive
        ? 'var(--color-destructive-hover)'
        : 'var(--color-primary-hover)'};
  }
`;

const OutlineButton = styled(ButtonBase)<{ $destructive?: boolean }>`
  background-color: var(--color-card-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);

  &:hover {
    background-color: var(--color-accent);
  }
`;

const GhostButton = styled(ButtonBase)<{ $destructive?: boolean }>`
  color: var(--color-text);
  background-color: transparent;

  &:hover {
    background-color: var(--color-accent);
  }
`;

export default Button;
