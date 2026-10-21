import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',').map(host => host.trim()).filter(Boolean) || [],
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:4000',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:4000',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
