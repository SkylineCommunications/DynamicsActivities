import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: {
    outDir: mode === 'dataminer' ? 'dist-dataminer' : 'dist',
    emptyOutDir: true,
  },
}))
