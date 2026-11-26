import { workerConfig } from '../config/env'
import { classifyTicket } from '../integrations/ai-client'
import { ticketRepository } from '../repositories/ticket-repository'
import type { TriageQueue } from '../repositories/ticket-repository'

const queue: TriageQueue = ticketRepository
const interval = workerConfig().TRIAGE_INTERVAL_MS

async function runOnce() {
  const tickets = await queue.findPendingTriage(10)

  for (const ticket of tickets) {
    try {
      const result = await classifyTicket(ticket)
      await queue.update(ticket.id, { category: result.category, priority: result.priority, triageStatus: 'done' })
      console.log(`chamado ${ticket.id} triado: ${result.category}/${result.priority}`)
    } catch (err) {
      console.log(`falha na triagem do chamado ${ticket.id}: ${err instanceof Error ? err.message : String(err)}`)
      await queue.update(ticket.id, { triageStatus: 'failed' })
    }
  }
}

async function loop() {
  try {
    await runOnce()
  } catch (err) {
    console.log('erro no worker', err)
  }
  setTimeout(loop, interval)
}

console.log(`worker de triagem rodando a cada ${interval}ms`)
loop()
