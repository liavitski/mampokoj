import * as React from 'react';
import styled from 'styled-components';
import UnstyledButton from '../UnstyledButton';

type SizeConfig = {
  '--borderRadius': string;
  '--fontSize': string;
  '--padding': string;
};

const SIZES = {
  small: {
    '--borderRadius': 16 + 'px',
    '--fontSize': 16 / 16 + 'rem',
    '--padding': '4px 12px',
  },
  // medium: {
  //   "--borderRadius": 2 + "px",
  //   "--fontSize": 18 / 16 + "rem",
  //   "--padding": "14px 20px",
  // },
  // large: {
  //   "--borderRadius": 4 + "px",
  //   "--fontSize": 21 / 16 + "rem",
  //   "--padding": "18px 32px",
  // },
} satisfies Record<string, SizeConfig>;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: 'fill' | 'outline' | 'ghost';
  size: keyof typeof SIZES;
  children: React.ReactNode;
};

const Button = ({
  variant,
  size,
  children,
  ...delegated
}: ButtonProps) => {
  const styles = SIZES[size];

  let Component;
  if (variant === 'fill') {
    Component = FillButton;
  } else if (variant === 'outline') {
    Component = OutlineButton;
  } else if (variant === 'ghost') {
    Component = GhostButton;
  } else {
    throw new Error(`Unrecognized Button variant: ${variant}`);
  }

  return (
    <Component style={styles} {...delegated}>
      {children}
    </Component>
  );
};

const ButtonBase = styled(UnstyledButton)`
  font-size: var(--font-size);
  padding: var(--padding);
  border-radius: var(--borderRadius);
  border: 2px solid transparent;
  cursor: pointer;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }
`;

const FillButton = styled(ButtonBase)`
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);

  &:hover {
    background-color: var(--color-primary-hover);
  }
`;

const OutlineButton = styled(ButtonBase)`
  background-color: white;
  color: white;
  border: 2px solid currentColor;

  &:hover {
    background-color: white;
  }
`;

const GhostButton = styled(ButtonBase)`
  color: grey;
  background-color: transparent;

  &:focus {
    outline-color: grey;
  }

  &:hover {
    background: grey;
    color: grey;
  }
`;

export default Button;
