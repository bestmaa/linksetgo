import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // Payload inspects and, outside production, pushes one shared PostgreSQL schema.
    // Running integration files in parallel races that schema work and can exhaust
    // the database connection budget before each suite destroys its Payload pool.
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
