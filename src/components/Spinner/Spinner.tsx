import * as React from 'react';
import styles from './Spinner.module.css';

import Icon from '../Icon';

type SpinnerProps = {
  color?: string;
  size?: number;
};

function Spinner({ color, size = 24 }: SpinnerProps) {
  return (
    <div className={styles.wrapper}>
      <Icon id="loader" color={color} size={size} />
    </div>
  );
}

export default Spinner;
