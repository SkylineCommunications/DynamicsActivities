import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizePublicBasePath(path) {
  if (!path) return '/public/DynamicsActivities/'
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dataminerBasePath = normalizePublicBasePath(env.VITE_APP_BASE_PATH)

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || 'unknown'),
    },
    base: mode === 'dataminer' ? dataminerBasePath : './',
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
  }
})
