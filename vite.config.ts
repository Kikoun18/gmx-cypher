import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Matrix's own code is imported from ../matrix (a git submodule), read-only.
  server: { fs: { allow: ['..'] } },
  // 3Dmol is loaded lazily, only when a structure is shown.
  build: { chunkSizeWarningLimit: 700 },
})
