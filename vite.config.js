import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || 'unknown'),
  },
  // A dev deploy passes VITE_APP_BASE_PATH (e.g. /public/DynamicsActivitiesDev/)
  // so asset URLs resolve from the dev folder. Falls back to the production base.
  base: process.env.VITE_APP_BASE_PATH || (mode === 'dataminer' ? '/public/DynamicsActivities/' : './'),
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
