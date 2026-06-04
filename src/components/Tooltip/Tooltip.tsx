'use client';
import * as React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';

type TooltipProps = {
  trigger: React.ReactNode;
  content: string;
};

function Tooltip({ trigger, content }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{trigger}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <Content>
            {content}
            <Arrow />
          </Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

const Content = styled(RadixTooltip.Content)`
  background-color: var(--color-card-background);
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  padding: 4px 8px;
  font-size: 0.875rem;
  font-weight: ${WEIGHTS.normal};
`;

const Arrow = styled(RadixTooltip.Arrow)`
  fill: var(--color-card-background);
`;

export default Tooltip;
