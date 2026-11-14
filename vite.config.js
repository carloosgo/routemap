import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineServiceWorkerPlugin } from './src/pwa/offlineServiceWorkerPlugin.js';

export default defineConfig({
  plugins: [react(), offlineServiceWorkerPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
});
