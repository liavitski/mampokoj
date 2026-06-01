import * as React from 'react';
import styled from 'styled-components';
import { Sun, Moon, X } from 'react-feather';

const icons = {
  light: Sun,
  dark: Moon,
  x: X,
};

type IconId = keyof typeof icons;

type IconProps = {
  id: IconId;
  color?: string;
  size?: number;
  strokeWidth?: number;
};

function Icon({
  id,
  color,
  size = 24,
  strokeWidth = 1.5,
  ...delegated
}: IconProps) {
  const Component = icons[id];

  if (!Component) throw new Error(`No icon found for ID: ${id}`);

  return (
    <Wrapper $strokeWidth={strokeWidth} {...delegated}>
      <Component color={color} size={size} />
    </Wrapper>
  );
}

const Wrapper = styled.div<{ $strokeWidth: number }>`
  width: var(--min-tap-target-width);
  height: var(--min-tap-target-height);
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;

  & > svg {
    display: block;
    stroke-width: ${(p) => p.$strokeWidth + 'px'};
  }
`;

export default Icon;
