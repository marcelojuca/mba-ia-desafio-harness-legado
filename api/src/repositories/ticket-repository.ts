import type { Prisma } from '@prisma/client'
import type { Ticket, TicketCategory, TicketPriority, TicketStatus, TicketWithDetails } from '../domain/ticket'
import { prisma } from './prisma'

export type TicketFilter = {
  customerId?: string
  status?: TicketStatus
}

export type TicketUpdate = Partial<Pick<Ticket, 'status' | 'assigneeId' | 'category' | 'priority' | 'triageStatus'>>

type NewTicket = { title: string; description: string; customerId: string }

type TicketCounts = {
  byStatus: { status: TicketStatus; count: number }[]
  byCategory: { category: TicketCategory | null; count: number }[]
  byPriority: { priority: TicketPriority | null; count: number }[]
}

export interface TicketRepository {
  create(data: NewTicket): Promise<Ticket>
  findById(id: string): Promise<Ticket | null>
  findByIdWithDetails(id: string): Promise<TicketWithDetails | null>
  list(filter: TicketFilter, page: number, pageSize: number): Promise<{ items: Ticket[]; total: number }>
  update(id: string, data: TicketUpdate): Promise<Ticket>
}

export interface TriageQueue {
  findPendingTriage(limit: number): Promise<Ticket[]>
  update(id: string, data: TicketUpdate): Promise<Ticket>
}

export interface TicketStatsSource {
  countByGroups(): Promise<TicketCounts>
}

class PrismaTicketRepository implements TicketRepository, TriageQueue, TicketStatsSource {
  create(data: NewTicket) {
    return prisma.ticket.create({ data })
  }

  findById(id: string) {
    return prisma.ticket.findUnique({ where: { id } })
  }

  findByIdWithDetails(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  async list(filter: TicketFilter, page: number, pageSize: number) {
    const where: Prisma.TicketWhereInput = {}
    if (filter.customerId) where.customerId = filter.customerId
    if (filter.status) where.status = filter.status
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ])
    return { items, total }
  }

  update(id: string, data: TicketUpdate) {
    return prisma.ticket.update({ where: { id }, data })
  }

  findPendingTriage(limit: number) {
    return prisma.ticket.findMany({
      where: { triageStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async countByGroups(): Promise<TicketCounts> {
    const [statusRows, categoryRows, priorityRows] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
    ])
    return {
      byStatus: statusRows.map((r) => ({ status: r.status, count: r._count._all })),
      byCategory: categoryRows.map((r) => ({ category: r.category, count: r._count._all })),
      byPriority: priorityRows.map((r) => ({ priority: r.priority, count: r._count._all })),
    }
  }
}

export const ticketRepository = new PrismaTicketRepository()
