export const APP_TITLE = 'Mam Pokoj';
export const COLOR_THEME_COOKIE_NAME = 'color-theme';

export const LIGHT_COLORS = {
  '--color-text': 'hsl(217deg 32.5% 17.4%)',
  '--color-background': 'hsl(20deg 5.8% 90%)',
  '--color-link': 'hsl(220deg 9% 46%)',
  '--color-link-hover': 'hsl(220deg 9% 56%)',
  '--color-border': 'hsl(24deg 5.7% 83%)',


  '--color-primary': 'hsl(223deg 33% 53%)',
  '--color-accent': 'hsl(223deg 49% 62%)',
  '--color-focus-ring': 'hsl(239deg 83.5% 66.6%)',
};

export const DARK_COLORS = {
  '--color-text': 'hsl(214deg 31.8% 91%)',
  '--color-background': 'hsl(30deg 11% 10.5%)',
  '--color-link': 'hsl(217.8deg 10.6% 65%)',
  '--color-link-hover': 'hsl(217.8deg 10.6% 75%)',
  '--color-border': 'hsl(25.7deg 6.4% 21.3%)',

  '--color-primary': 'hsl(223deg 33% 47%)',
  '--color-secondary': 'hsl(223deg 41% 27%)',
  '--color-focus-ring': 'hsl(234.4deg 89.4% 74%)',
};

export const LIGHT_SHADOWS = {
  '--shadow-page': `
    0px 1px 2px hsl(50deg 60% 50% / 0.25),
    0px 3px 6px hsl(50deg 60% 50% / 0.25),
    0px 9px 18px hsl(50deg 60% 50% / 0.25),
    0px 18px 36px hsl(50deg 60% 50% / 0.25),
    0px 54px 108px hsl(50deg 60% 50% / 0.25)
  `,
  '--shadow-card': `
    0px 1px 2px hsl(50deg 20% 50% / 0.2),
    0px 2px 4px hsl(50deg 20% 50% / 0.2),
    0px 4px 8px hsl(50deg 20% 50% / 0.2),
    0px 8px 16px hsl(50deg 20% 50% / 0.2)
  `,
};
export const DARK_SHADOWS = {
  '--shadow-page': 'none',
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
