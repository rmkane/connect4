import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  appType: 'spa',
  plugins: [tailwindcss()],
  root: 'src',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // Default `public` would be under `src/`; keep assets beside this config.
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
