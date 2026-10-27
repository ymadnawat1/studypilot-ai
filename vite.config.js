import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest runs logic tests in a Node environment by default.
// UI / storage tests opt in to jsdom with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    testTimeout: 30000,
  },
});
