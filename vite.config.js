import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: {
    outDir: mode === 'dataminer' ? 'dist-dataminer' : 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/skyline-api': {
        target: 'https://api.skyline.be',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/skyline-api/, ''),
      },
    },
  },
}))
