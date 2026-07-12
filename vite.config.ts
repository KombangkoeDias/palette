import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'esnext',
  },
  server: {
    // A stable port keeps content-script HMR reliable during development.
    port: 5173,
    strictPort: true,
  },
});
