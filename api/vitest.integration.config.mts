import { defineConfig } from 'vitest/config'

// Sem .env (clone novo, gates), os testes de integração apenas não acham o banco.
try {
  process.loadEnvFile('.env')
} catch {
  // ignora: .env é opcional aqui
}

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST || '',
    },
  },
})
