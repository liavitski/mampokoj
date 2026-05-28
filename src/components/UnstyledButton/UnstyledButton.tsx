import styled from 'styled-components';

type UnstyledButtonProps = {
  display?: string;
};

export default styled.button<UnstyledButtonProps>`
  display: ${(props) => props.display || 'block'};
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;

  &:focus {
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
