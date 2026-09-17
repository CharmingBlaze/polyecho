import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist/**'],
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Each file builds its own happy-dom environment, so under parallel worker
    // contention a cold file's transform cost can land on its last test. The
    // tests themselves are fast; 5s was measuring the harness, not the code.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
