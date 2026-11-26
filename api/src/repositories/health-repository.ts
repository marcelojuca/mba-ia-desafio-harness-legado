import { prisma } from './prisma'

export interface DatabaseProbe {
  ping(): Promise<void>
}

class PrismaDatabaseProbe implements DatabaseProbe {
  async ping() {
    await prisma.$queryRaw`SELECT 1`
  }
}

export const databaseProbe: DatabaseProbe = new PrismaDatabaseProbe()
