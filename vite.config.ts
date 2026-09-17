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
  build: {
    // The renderer only ever runs inside Electron's Chromium, so Vite's default
    // baseline-widely-available target just adds downleveled syntax and parse
    // work. chrome130 is a conservative floor well under the bundled runtime.
    target: 'chrome130',
    rollupOptions: {
      output: {
        // Vendor code changes far less often than app code, so giving it stable
        // chunk hashes lets Chromium reuse its V8 code cache across launches
        // instead of recompiling three.js every time the app changes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Reached only through dynamic import(); grouping these would pull
          // the GLTF exporter/loader back into the eager chunk.
          if (/[\\/]three[\\/]examples[\\/]/.test(id)) return
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/](vue|@vue|pinia)[\\/]/.test(id)) return 'vue'
        },
      },
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
