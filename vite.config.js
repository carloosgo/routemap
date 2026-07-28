import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['mapbox-gl/esm'],
  },
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
          if (id.includes('mapbox-gl')) return 'mapboxgl';
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
});
