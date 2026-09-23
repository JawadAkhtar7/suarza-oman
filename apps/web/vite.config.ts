import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * One origin in development: the app calls /api/... exactly as it will in
 * production, so nothing in the client knows where the API lives and CORS
 * never enters the picture while you work.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    /*
     * Vite refuses requests whose Host header it does not recognise, which is
     * every tunnelled request. Allowing the ngrok domains lets the dev server
     * be shared for a demo; it changes nothing about how it runs locally.
     *
     * The tunnel still exposes an app with no login on it — see the README.
     */
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:4100', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
