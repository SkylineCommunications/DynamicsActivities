import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || 'unknown'),
  },
  base: mode === 'dataminer' ? '/public/DynamicsActivities/' : './',
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
