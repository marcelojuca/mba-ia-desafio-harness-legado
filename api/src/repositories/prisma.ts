import { PrismaClient } from '@prisma/client'
import { databaseConfig } from '../config/env'

const db = databaseConfig()

export const prisma = new PrismaClient({
  datasources: { db: { url: db.DATABASE_URL } },
  log: db.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
