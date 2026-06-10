import * as React from 'react';
import * as Select from '@radix-ui/react-select';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';
import Icon from '../Icon';

type Region = {
  name_en: string;
  name_cs: string;
  code: string;
};

type RegionSelectProps = {
  data: readonly Region[];
} & Omit<
  React.ComponentPropsWithoutRef<typeof Select.Root>,
  'children'
>;

function RegionSelect({ data, ...rootProps }: RegionSelectProps) {
  return (
    <Select.Root {...rootProps}>
      <Trigger>
        <Select.Value placeholder="Select region" />
      </Trigger>

      <Content>
        <ScrollUpButton>
          <Icon id="chevronUp" />
        </ScrollUpButton>
        <Viewport>
          {data.map((r) => (
            <Item key={r.code} value={r.code}>
              <Select.ItemText>{r.name_en}</Select.ItemText>
            </Item>
          ))}
        </Viewport>
        <ScrollDownButton>
          <Icon id="chevronDown" />
        </ScrollDownButton>
      </Content>
    </Select.Root>
  );
}

const Trigger = styled(Select.Trigger)`
  background-color: var(--color-primary-foreground);
  border: 1px solid var(--color-border-input);
  padding: 6px 16px;
  font-size: 1rem;
  font-weight: ${WEIGHTS.normal};
  color: var(--color-text);
  border-radius: 16px;
  text-align: left;
  cursor: pointer;

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 4px;
  }

  &[data-placeholder] {
    color: var(--color-text-muted-foreground);
    font-weight: 300;
  }
`;

const Content = styled(Select.Content)`
  background-color: var(--color-primary-foreground);
  border: 1px solid var(--color-border-input);
  border-radius: 16px;
  padding: 6px;
  margin-top: 6px;
  width: max-content;
  z-index: 2;
  box-shadow: var(--shadow-card);
`;

const ScrollUpButton = styled(Select.ScrollUpButton)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 25px;
  background-color: var(--color-primary-foreground);
  color: var(--color-text);
  cursor: default;
`;

const ScrollDownButton = styled(Select.ScrollDownButton)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 25px;
  background-color: var(--color-primary-foreground);
  color: var(--color-text);
  cursor: default;
`;

const Viewport = styled(Select.Viewport)`
  padding: 8px;
`;

const Item = styled(Select.Item)`
  font-weight: ${WEIGHTS.normal};
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 8px;

  &:hover {
    background-color: var(--color-accent);
  }

  &:focus {
    outline-color: var(--color-focus-ring);
    outline-offset: 2px;
  }
`;
export default RegionSelect;
