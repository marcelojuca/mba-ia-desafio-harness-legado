import type { DatabaseProbe } from '../repositories/health-repository'

export class HealthService {
  constructor(private database: DatabaseProbe) {}

  // Lança o erro do banco; quem chama decide como responder.
  async check() {
    await this.database.ping()
    return { status: 'ok', db: 'ok' }
  }
}
