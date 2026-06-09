import { CZ_REGIONS } from '@/constants';
import type { RegionCode } from '@/types/db-types';

export const range = (start: number, end: number, step = 1) => {
  const output: number[] = [];
  if (typeof end === 'undefined') {
    end = start;
    start = 0;
  }
  for (let i = start; i < end; i += step) {
    output.push(i);
  }
  return output;
};

export function formatCZPhone(input: string) {
  let d = input.replace(/\D/g, '');

  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('420')) d = d.slice(3);

  if (d.length === 9) {
    return `+420 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }

  return input;
}

export function isRegionCode(value: string): value is RegionCode {
  return CZ_REGIONS.some((r) => r.code === value);
}

