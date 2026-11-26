import type { TicketStatsSource } from '../repositories/ticket-repository'

export class StatsService {
  constructor(private source: TicketStatsSource) {}

  async summary() {
    const counts = await this.source.countByGroups()

    const byStatus: Record<string, number> = { open: 0, in_progress: 0, resolved: 0 }
    for (const row of counts.byStatus) byStatus[row.status] = row.count

    const byCategory: Record<string, number> = { billing: 0, technical: 0, account: 0, other: 0, untriaged: 0 }
    for (const row of counts.byCategory) byCategory[row.category || 'untriaged'] = row.count

    const byPriority: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 0 }
    for (const row of counts.byPriority) byPriority[row.priority || 'untriaged'] = row.count

    return { byStatus, byCategory, byPriority }
  }
}
