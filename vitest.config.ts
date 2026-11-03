import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    // A suíte E2E é do Playwright, não do Vitest.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@omi-bomba/rules': at('./packages/rules/src/index.ts'),
      '@omi-bomba/bot': at('./packages/bot/src/index.ts'),
      '@omi-bomba/store/redis': at('./packages/store/src/redis.ts'),
      '@omi-bomba/store': at('./packages/store/src/index.ts'),
      '@omi-bomba/protocol/validate': at('./packages/protocol/src/validate.ts'),
      '@omi-bomba/protocol': at('./packages/protocol/src/index.ts'),
      '@omi-bomba/room': at('./packages/room/src/index.ts'),
    },
  },
});
