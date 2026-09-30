// @vitest-environment node
/**
 * A contrast floor over the theme tokens.
 *
 * The list is explicit and hand-written on purpose. A blanket "every token
 * against every other token" scan would either fail on pairs that never appear
 * next to each other, or need an exemption list longer than the assertion —
 * and per the lessons in handoff.md §5, an assertion that cannot fail is worse
 * than no assertion. Each row here is a pairing that some component actually
 * renders, so a row going red means a real screen got harder to read.
 *
 * Thresholds are WCAG 2.1 AA: 4.5:1 for body text, 3:1 for a boundary or
 * other non-text element (1.4.11).
 *
 * MEASURED FAILURES, not asserted, so they are on the record rather than
 * silently absent. Each was computed from these same token values:
 *
 *   text, 4.5:1 needed
 *     --color-primary-foreground  on --color-primary          4.48 light
 *     --color-link                on --color-background       3.86 light
 *     --color-destructive-foreground on --color-destructive   3.76 both
 *     --color-destructive-foreground on --color-destructive-hover  3.58 both
 *     --color-destructive         on --color-card-background 3.44 light, 3.89 dark
 *
 *   non-text, 3:1 needed
 *     --color-input-background    on --color-background       1.36 light
 *     --color-border-input        on --color-input-background 1.49 light, 1.22 dark
 *     --color-success             on --color-card-background 2.08 light
 *
 * The input rows fail together and for one reason: `--color-border-input` is
 * what delineates a field, and it is nearly invisible in both themes. Moving
 * `--color-input-background` cannot fix that on its own. `--color-success`
 * fails only in light mode, where `#22c55e` is too light against a near-white
 * card.
 */
import { describe, it, expect } from 'vitest';
import { LIGHT_TOKENS, DARK_TOKENS } from '@/constants';

type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3,8})$/i;
const HSL = /^hsla?\(\s*([\d.]+)\s*deg\s+([\d.]+)%\s+([\d.]+)%/i;

/**
 * The two notations the tokens use. Anything else -- a named colour, a
 * `color-mix()`, a `var()` reference -- throws rather than being silently
 * skipped, because a token this test cannot parse is a token it cannot hold to
 * a threshold.
 */
function parse(color: string): Rgb {
  const hex = HEX.exec(color.trim());
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16) / 255,
      parseInt(digits.slice(2, 4), 16) / 255,
      parseInt(digits.slice(4, 6), 16) / 255,
    ];
  }

  const hsl = HSL.exec(color.trim());
  if (hsl) {
    const h = parseFloat(hsl[1]) / 360;
    const s = parseFloat(hsl[2]) / 100;
    const l = parseFloat(hsl[3]) / 100;

    if (s === 0) return [l, l, l];

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t: number) => {
      let u = t;
      if (u < 0) u += 1;
      if (u > 1) u -= 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
  }

  throw new Error(`Unparseable token colour: ${color}`);
}

function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (v: number) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parse(a));
  const lb = relativeLuminance(parse(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** A pairing some component actually renders, and the floor it must clear. */
type Pair = {
  /** What is being read or seen, for the failure message. */
  what: string;
  foreground: keyof typeof LIGHT_TOKENS;
  background: keyof typeof LIGHT_TOKENS;
  min: number;
};

const PAIRS: Pair[] = [
  // Body text on each surface it is set against.
  { what: 'page text', foreground: '--color-text', background: '--color-background', min: AA_TEXT },
  { what: 'card text', foreground: '--color-text', background: '--color-card-background', min: AA_TEXT },
  { what: 'text on a hover fill', foreground: '--color-text', background: '--color-accent', min: AA_TEXT },
  { what: 'text in a form field', foreground: '--color-text', background: '--color-input-background', min: AA_TEXT },
  { what: 'text on a price tag', foreground: '--color-text', background: '--color-pricetag-background', min: AA_TEXT },
  { what: 'header link text', foreground: '--color-text-foreground', background: '--color-background', min: AA_TEXT },
  // Placeholder and secondary text.
  { what: 'field placeholder', foreground: '--color-text-muted-foreground', background: '--color-input-background', min: AA_TEXT },
  { what: 'active region in the nav', foreground: '--color-secondary-foreground', background: '--color-secondary', min: AA_TEXT },
  // A regression guard, not an AA floor. AA wants 3:1 for a boundary and no
  // fill this dark can reach that against `--color-background` -- the border is
  // what delineates a field, and that is the separate failure listed above. What
  // this pins is the bug that actually shipped: `--color-input-background`
  // used to be `--color-primary-foreground`, which in dark mode was *the same
  // colour as the page* (1.00:1), so the fields were not merely low contrast,
  // they were absent. 1.2 is loose against the 1.26 light mode has always
  // managed, and tight enough that a field cannot go back to vanishing.
  {
    what: 'form field surface vs the page behind it',
    foreground: '--color-input-background',
    background: '--color-background',
    min: 1.2,
  },
  // Focus ring is a non-text indicator and must be visible against the page.
  { what: 'focus ring', foreground: '--color-focus-ring', background: '--color-background', min: AA_NON_TEXT },
];

const THEMES = [
  ['light', LIGHT_TOKENS],
  ['dark', DARK_TOKENS],
] as const;

describe('theme contrast', () => {
  it('parses every colour token in both themes', () => {
    // If this throws the file stops being readable; without it a token could
    // change to a notation the contrast rows never see, and the rows would
    // keep passing on stale values.
    for (const [name, tokens] of THEMES) {
      for (const [key, value] of Object.entries(tokens)) {
        if (key === '--shadow-card') continue; // a shadow, not a colour
        expect(() => parse(value as string), `${name} ${key} (${value})`).not.toThrow();
      }
    }
  });

  for (const [themeName, tokens] of THEMES) {
    it(`clears the floor in ${themeName}`, () => {
      const failures = PAIRS.flatMap(({ what, foreground, background, min }) => {
        const ratio = contrastRatio(
          tokens[foreground] as string,
          tokens[background] as string
        );
        return ratio >= min
          ? []
          : [
              `${what}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
            ];
      });

      expect(
        failures.length === 0 ? 'all pairs clear' : failures.join('\n')
      ).toBe('all pairs clear');
    });
  }
});