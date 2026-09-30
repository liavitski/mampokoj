import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Honours the `@/*` -> `./src/*` paths entry in tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws when imported outside a React Server Component
      // graph. Unit tests import server modules directly, so stub it out.
      'server-only': fileURLToPath(
        new URL('./src/test/stubs/server-only.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    // Component tests need a DOM; server-side unit tests opt into node with a
    // `// @vitest-environment node` docblock at the top of the file.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // `src/utils/seed.tsx` talks to a real database; never collect it.
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/utils/seed.tsx',
      ],
    },
  },
});
