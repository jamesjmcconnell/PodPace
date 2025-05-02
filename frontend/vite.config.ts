import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, '.'),
      '~/common': path.resolve(__dirname, '../common/src')
    },
  },
  server: {
    proxy: {
      // Proxy /api requests to our Bun backend server
      '/api': {
        target: 'http://127.0.0.1:3000', // Target the backend
        changeOrigin: true, // Recommended for virtual hosted sites
        secure: false,      // Don't verify SSL certs if backend were HTTPS (not needed here)
        // Optional: rewrite path if backend expects something different
        // rewrite: (path) => path.replace(/^\/api/, '')
        proxyTimeout: 300000
      }
    }
  }
})
