export const APP_TITLE = 'Mam Pokoj';
export const COLOR_THEME_COOKIE_NAME = 'color-theme';
export const MAX_TOASTS = 5;
export const PAGE_SIZE = 10;

/**
 * How many ads one account may have. Enforced by createAd; the dashboard only
 * hides the create form once the limit is reached.
 */
export const MAX_ADS_PER_USER = 2;

/** Upper bound on how many photos a single ad may have. */
export const MAX_IMAGES_PER_AD = 3;

export const LIGHT_COLORS = {
  '--color-text': 'hsl(217deg 32.5% 17.4%)',
  '--color-text-foreground': '#1e293b',
  '--color-background': 'hsl(20deg 5.8% 90%)',
  '--color-text-muted-foreground': '#6b7280',
  // 46% measured 3.86:1 on the page. The hover raises saturation
  // rather than lightness: against a near-white page, any lighter
  // hover falls back below the floor, so the link intensifies
  // instead of brightening.
  '--color-link': 'hsl(220deg 9% 41%)',
  '--color-link-hover': 'hsl(220deg 20% 41%)',
  '--color-border': 'hsl(24deg 5.7% 83%)',
  // The border is what delineates a field, so it has to read against the
  // fill it outlines: 3:1, where #d6d3d1 managed 1.49.
  '--color-border-input': 'hsl(28deg 4% 56%)',
  '--color-card-background': 'hsl(60deg 4.7% 95.8%)',
  '--color-input-background': '#ffffff',
  '--color-pricetag-background': '#e7e5e4',
  '--color-pricetag-background-hover': '#d8d6d5',
  '--color-accent': '#f3e5f5',
  // The success indicator sits on a card, so it needs 3:1 there;
  // #22c55e managed 2.08 against a near-white card.
  '--color-success': 'hsl(142deg 50% 40%)',
  // Dark enough that a white label clears 4.5:1 *and* the fill clears
  // 4.5:1 against a card; #ef4444 managed 3.76 and 3.44.
  '--color-destructive': 'hsl(0deg 84% 47%)',
  '--color-destructive-hover': 'hsl(0deg 84% 49%)',
  '--color-destructive-foreground': '#ffffff',

  // 66.6% left a white label at 4.48:1 -- a rounding error short of AA.
  '--color-primary': 'hsl(238.7deg 83.5% 65.5%)',
  '--color-primary-hover': 'hsla(238.7deg 83.5% 65.5% / 0.9)',
  '--color-primary-foreground': '#ffffff',
  '--color-secondary': 'hsl(24deg 5.7% 83%)',
  '--color-overlay-modal': 'hsla(24deg 5.7% 83% / 0.346)',
  '--color-secondary-foreground': 'hsl(215deg 13.7% 34%)',
  '--color-focus-ring': 'hsl(239deg 83.5% 66.6%)',
};

export const DARK_COLORS = {
  '--color-text': 'hsl(214deg 31.8% 91%)',
  '--color-text-foreground': '#e2e8f0',
  '--color-text-muted-foreground': '#9ca3af',
  '--color-background': 'hsl(30deg 11% 10.5%)',
  '--color-link': 'hsl(217.8deg 10.6% 65%)',
  '--color-link-hover': 'hsl(217.8deg 10.6% 75%)',
  '--color-border': 'hsl(25.7deg 6.4% 21.3%)',
  // Same job as the light theme's border, raised from #3a3633
  // (1.05 against the field fill).
  '--color-border-input': 'hsl(28deg 4% 50%)',
  '--color-card-background': 'hsl(25.7deg 8.6% 15.8%)',
  // Deliberately not `--color-background` or `--color-card-background`: a field
  // painted the same as the surface behind it reads as a hole, not an input.
  // It still cannot reach 3:1 against the page, because no fill that reads
  // as a field can -- which is why the contrast test pins it at 1.2 and
  // leaves the delineation to `--color-border-input`, asserted at 3:1
  // against this fill.
  '--color-input-background': 'hsl(25.7deg 8.6% 20%)',
  '--color-pricetag-background': '#1f1c19',
  '--color-pricetag-background-hover': '#1f1c19e5',
  '--color-accent': '#484441',
  '--color-success': '#4ade80',
  // A light fill with a dark label, as `--color-primary` has always
  // been in this theme: in dark mode no single red clears 4.5:1
  // against both a white label and the dark card behind it, so the
  // label darkens instead of the fill.
  '--color-destructive': 'hsl(0deg 72% 68%)',
  '--color-destructive-hover': 'hsl(0deg 72% 70%)',
  '--color-destructive-foreground': '#1e1b18',

  '--color-primary': 'hsl(234.4deg 89.4% 74%)',
  '--color-primary-hover': 'hsla(234.4deg 89.4% 74% / 0.9)',
  '--color-primary-foreground': '#1e1b18',
  '--color-secondary': 'hsl(25.7deg 6.4% 21.3%)',
  '--color-overlay-modal': 'hsla(25.7deg 6.4% 21.3% / 0.346)',
  '--color-secondary-foreground': 'hsl(216deg 12% 84%)',
  '--color-focus-ring': 'hsl(234.4deg 89.4% 74%)',
};

export const LIGHT_SHADOWS = {
  '--shadow-card': `
    0.1px 0.2px 0.3px hsl(24deg 3% 43% / 0.3),
    0.4px 0.7px 1px -0.5px hsl(24deg 3% 43% / 0.28),
    0.9px 1.5px 2.2px -1.1px hsl(24deg 3% 43% / 0.36),
    2.1px 3.5px 5.1px -1.6px hsl(24deg 3% 43% / 0.24)
  `,
};
export const DARK_SHADOWS = {
  '--shadow-card': 'none',
};

export const LIGHT_TOKENS = {
  ...LIGHT_COLORS,
  ...LIGHT_SHADOWS,
};

export const DARK_TOKENS = {
  ...DARK_COLORS,
  ...DARK_SHADOWS,
};

export const WEIGHTS = {
  normal: 500,
  medium: 600,
  bold: 800,
};

export const BREAKPOINTS = {
  phone: 600,
  tablet: 950,
  laptop: 1300,
};

export const QUERIES = {
  phoneAndSmaller: `(max-width: ${BREAKPOINTS.phone / 16}rem)`,
  tabletAndSmaller: `(max-width: ${BREAKPOINTS.tablet / 16}rem)`,
  laptopAndSmaller: `(max-width: ${BREAKPOINTS.laptop / 16}rem)`,
};

export const CZ_REGIONS = [
  { name_en: 'Prague', name_cs: 'Hlavní město Praha', code: 'PR' },
  {
    name_en: 'Central Bohemian Region',
    name_cs: 'Středočeský kraj',
    code: 'ST',
  },
  {
    name_en: 'South Bohemian Region',
    name_cs: 'Jihočeský kraj',
    code: 'JC',
  },
  { name_en: 'Plzeň Region', name_cs: 'Plzeňský kraj', code: 'PL' },
  {
    name_en: 'Karlovy Vary Region',
    name_cs: 'Karlovarský kraj',
    code: 'KV',
  },
  {
    name_en: 'Ústí nad Labem Region',
    name_cs: 'Ústecký kraj',
    code: 'US',
  },
  {
    name_en: 'Liberec Region',
    name_cs: 'Liberecký kraj',
    code: 'LI',
  },
  {
    name_en: 'Hradec Králové Region',
    name_cs: 'Královéhradecký kraj',
    code: 'HK',
  },
  {
    name_en: 'Pardubice Region',
    name_cs: 'Pardubický kraj',
    code: 'PA',
  },
  {
    name_en: 'Vysočina Region',
    name_cs: 'Kraj Vysočina',
    code: 'VY',
  },
  {
    name_en: 'South Moravian Region',
    name_cs: 'Jihomoravský kraj',
    code: 'JM',
  },
  {
    name_en: 'Olomouc Region',
    name_cs: 'Olomoucký kraj',
    code: 'OL',
  },
  { name_en: 'Zlín Region', name_cs: 'Zlínský kraj', code: 'ZL' },
  {
    name_en: 'Moravian-Silesian Region',
    name_cs: 'Moravskoslezský kraj',
    code: 'MS',
  },
] as const;

export const CZ_CITIES = [
  { name: 'Prague', region: 'PR' },
  { name: 'Brno', region: 'JM' },
  { name: 'Ostrava', region: 'MS' },
  { name: 'Plzeň', region: 'PL' },
  { name: 'Liberec', region: 'LI' },
  { name: 'Olomouc', region: 'OL' },
  { name: 'České Budějovice', region: 'JC' },
  { name: 'Hradec Králové', region: 'HK' },
  { name: 'Ústí nad Labem', region: 'US' },
  { name: 'Pardubice', region: 'PA' },
  { name: 'Zlín', region: 'ZL' },
  { name: 'Havířov', region: 'MS' },
  { name: 'Kladno', region: 'ST' },
  { name: 'Most', region: 'US' },
  { name: 'Opava', region: 'MS' },
  { name: 'Frýdek-Místek', region: 'MS' },
  { name: 'Jihlava', region: 'VY' },
  { name: 'Teplice', region: 'US' },
  { name: 'Karviná', region: 'MS' },
  { name: 'Chomutov', region: 'US' },
  { name: 'Děčín', region: 'US' },
  { name: 'Karlovy Vary', region: 'KV' },
  { name: 'Jablonec nad Nisou', region: 'LI' },
  { name: 'Mladá Boleslav', region: 'ST' },
  { name: 'Prostějov', region: 'OL' },
];
