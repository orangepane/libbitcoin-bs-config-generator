import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the project under /<repo>/.
export default defineConfig({
  base: '/libbitcoin-bs-config-generator/',
  plugins: [react()],
  build: {
    target: 'es2022',
    cssMinify: true,
    reportCompressedSize: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    css: false,
  },
});
