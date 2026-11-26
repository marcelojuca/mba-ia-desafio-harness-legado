import { z } from 'zod'

// Único lugar da API que lê process.env (G5). Cada bloco valida só o que o seu consumidor precisa,
// para que os testes unitários (sem banco) não exijam DATABASE_URL.

// Variável vazia no .env (ex.: "OPENAI_API_KEY=") vale como ausente, como no código antigo (`||`).
const opcional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema)

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const httpSchema = z.object({
  PORT: opcional(z.coerce.number().int().positive().default(4000)),
  JWT_SECRET: opcional(z.string().min(1).default('dev-secret')),
  CORS_ORIGIN: opcional(z.string().min(1).default('http://localhost:5173')),
  API_PUBLIC_URL: opcional(z.string().optional()),
})

const aiSchema = z.object({
  AI_MODE: z.enum(['fake', 'openai']).catch('fake').default('fake'),
  OPENAI_API_KEY: opcional(z.string().optional()),
})

const storageSchema = z.object({
  UPLOAD_DIR: opcional(z.string().min(1).default('/tmp/balcao/uploads')),
})

const workerSchema = z.object({
  TRIAGE_INTERVAL_MS: opcional(z.coerce.number().int().positive().catch(2000).default(2000)),
})

export function databaseConfig() {
  return databaseSchema.parse(process.env)
}

export function httpConfig() {
  const parsed = httpSchema.parse(process.env)
  return { ...parsed, publicUrl: parsed.API_PUBLIC_URL || `http://localhost:${parsed.PORT}` }
}

export function aiConfig() {
  return aiSchema.parse(process.env)
}

export function storageConfig() {
  return storageSchema.parse(process.env)
}

export function workerConfig() {
  return workerSchema.parse(process.env)
}
