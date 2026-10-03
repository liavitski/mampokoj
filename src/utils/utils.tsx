import { CZ_REGIONS } from '@/constants';
import type { RegionCode } from '@/types/db-types';

export const range = (start: number, end?: number, step = 1) => {
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

/**
 * A price as the cards render it, and as metadata now quotes it.
 *
 * Lives here rather than in each component because it is used in three places
 * that have to agree: the grid card, the detail card, and the `description` /
 * `Offer.price` of an ad's metadata. A metadata description reading
 * "12 000 Kč" next to a card reading "12 000,00 Kč" would be a defect nobody
 * would notice until a search result disagreed with the page it described.
 *
 * Zero fraction digits, matching both cards: rent is quoted in whole koruna,
 * and the `numeric(10, 2)` column holds a scale the UI has never shown.
 *
 * Not server-only, unlike most of `src/lib` -- this is also used by client
 * components.
 */
export function formatPriceCZK(price: string | number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(price));
}
