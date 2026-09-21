import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 8443,
    strictPort: true,
    proxy: {
      '/api/sih3-tma': {
        target: 'https://www.sih3.bbwsserayuopak.id',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
  preview: { host: '0.0.0.0', port: 8443 },
})
