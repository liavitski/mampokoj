import { createGlobalStyle } from 'styled-components';

const GlobalStyles = createGlobalStyle`
/*
  CSS RESET
  https://www.joshwcomeau.com/css/custom-css-reset/
*/
*,
*::before,
*::after {
  box-sizing: border-box;
}
* {
  margin: 0;
}
html {
  /* scrollbar-gutter: stable; */ // Dont using it because of Radix UI
  /*
    Create a stacking context, without a z-index.
    This ensures that all portal content (modals and tooltips) will
    float above the app.
  */
  isolation: isolate;
}
body {
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
img,
picture,
video,
canvas,
svg {
  display: block;
  max-width: 100%;
  height: auto;
}
input,
button,
textarea,
select {
  font: inherit;
}
p,
h1,
h2,
h3,
h4,
h5,
h6 {
  overflow-wrap: break-word;
}

/* THEME VARIABLES */
html {
  --content-width: 90rem;
  --viewport-padding: 0px 16px 0;
  --header-height: 5rem;
  --min-tap-target-height: 32px;
  --min-tap-target-width: 32px;
}

@media (pointer: coarse) {
  html {
    --min-tap-target-width: 48px;
    --min-tap-target-height: 48px;
  }
}

/* GLOBAL STYLES */

html {
  color: var(--color-text);
  font-family: var(--font-family), sans-serif;
  letter-spacing: -0, 025em;
  background-color: var(--color-background);

  transition-property: background-color, color;
  transition-duration: 0.4s;
  transition-timing-function: cubic-bezier(0.1, 0.9, 0, 1);
}

body {
  min-height: 100vh;
  min-height: 100svh;
}

em {
  font-style: italic;
}

p {
  font-size: 1.25rem;
}

button {
  padding: 0;
}

/* Input - removing carets */
/* Chrome, Safari, Edge */
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Firefox */
input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
}

input[type="date"]::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

`;

export default GlobalStyles;
