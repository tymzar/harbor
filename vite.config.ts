/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // Two apps: Harbor (index.html) and Cove, the team workspace (workspace.html).
  build: { rollupOptions: { input: { harbor: 'index.html', cove: 'workspace.html' } } },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Playwright writes reports/ and test-results/ while tests run; without this Vite
    // full-reloads the page under test whenever reports/e2e-metrics.json changes (observed).
    watch: { ignored: ['**/reports/**', '**/test-results/**', '**/research/experiments/out/**'] },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
