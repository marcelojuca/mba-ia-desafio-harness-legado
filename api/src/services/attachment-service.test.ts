import { describe, expect, it } from 'vitest'
import { AttachmentService, type UploadedFile } from './attachment-service'
import { DomainError } from '../domain/errors'
import type { Attachment, CurrentUser, Ticket } from '../domain/ticket'
import type { AttachmentRepository, NewAttachment } from '../repositories/attachment-repository'

type TicketRef = Pick<Ticket, 'id' | 'customerId'>

function fakeTicketService(ticket: TicketRef) {
  return {
    getById: async (user: CurrentUser, id: string) => {
      if (id !== ticket.id || (user.role === 'customer' && user.id !== ticket.customerId)) {
        throw new DomainError('not_found', 'Chamado não encontrado')
      }
      return ticket as Ticket
    },
  }
}

const fakeAttachments: AttachmentRepository = {
  create: async (data: NewAttachment): Promise<Attachment> => ({ id: 'att1', createdAt: new Date(), ...data }),
  findById: async () => null,
}

const ticket: TicketRef = { id: 't1', customerId: 'c1' }
const customer: CurrentUser = { id: 'c1', role: 'customer' }

function arquivo(size: number, mimeType: string, originalName: string): UploadedFile {
  return { size, mimeType, originalName, buffer: Buffer.from('') }
}

describe('AttachmentService', () => {
  const service = new AttachmentService(fakeAttachments, fakeTicketService(ticket), '/dev/null/nunca-usado')

  it('exige arquivo', async () => {
    await expect(service.upload(customer, 't1', undefined)).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('recusa arquivo maior que 5 MB', async () => {
    const file = arquivo(5 * 1024 * 1024 + 1, 'text/plain', 'a.txt')
    await expect(service.upload(customer, 't1', file)).rejects.toMatchObject({ code: 'file_too_large' })
  })

  it('recusa tipo não suportado', async () => {
    const file = arquivo(10, 'image/gif', 'a.gif')
    await expect(service.upload(customer, 't1', file)).rejects.toMatchObject({ code: 'unsupported_type' })
  })

  it('não deixa outro cliente enviar', async () => {
    const other: CurrentUser = { id: 'c2', role: 'customer' }
    await expect(service.upload(other, 't1', undefined)).rejects.toMatchObject({ code: 'not_found' })
  })
})
