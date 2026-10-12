/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any static host or sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // Two pages: the app, and the shared Loved list at loved/ (its own small page, see src/share).
    rollupOptions: { input: { main: 'index.html', loved: 'loved/index.html' } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
