import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.tsx'],
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      // These tests assert cross-package destroy() semantics, so resolve the
      // tracker from source. Without this they would run against whatever build
      // output happens to be on disk, and a stale dist would quietly test the
      // wrong tracker.
      '@litemetrics/tracker': resolve(import.meta.dirname, '../tracker/src/index.ts'),
    },
  },
});
