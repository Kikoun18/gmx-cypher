import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  // 3Dmol is loaded lazily, only when a structure is opened.
  build: { chunkSizeWarningLimit: 700 },
})
