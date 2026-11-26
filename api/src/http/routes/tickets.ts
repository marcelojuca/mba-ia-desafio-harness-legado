import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '../errors'
import { currentUser } from '../middlewares/auth'
import type { Reply, Ticket } from '../../domain/ticket'
import type { HttpDependencies } from '../services'

function toTicketJson(t: Ticket) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    category: t.category,
    priority: t.priority,
    triageStatus: t.triageStatus,
    customerId: t.customerId,
    assigneeId: t.assigneeId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

function toReplyJson(r: Reply) {
  return {
    id: r.id,
    ticketId: r.ticketId,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    author: r.author,
  }
}

export function ticketRoutes({ auth, services }: HttpDependencies) {
  const router = Router()
  const upload = multer({ storage: multer.memoryStorage() })
  const tickets = services.tickets

  router.use(auth.requireAuth)

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = req.query as { status?: string; page?: string }
      const result = await tickets.list(currentUser(req), query)
      res.json({ ...result, items: result.items.map(toTicketJson) })
    }),
  )

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const ticket = await tickets.create(currentUser(req), req.body)
      res.status(201).json(toTicketJson(ticket))
    }),
  )

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const ticket = await tickets.getDetails(currentUser(req), req.params.id)
      res.json({
        ...toTicketJson(ticket),
        replies: ticket.replies.map(toReplyJson),
        attachments: ticket.attachments,
      })
    }),
  )

  router.post(
    '/:id/assign',
    asyncHandler(async (req, res) => {
      res.json(toTicketJson(await tickets.assign(currentUser(req), req.params.id)))
    }),
  )

  router.post(
    '/:id/resolve',
    asyncHandler(async (req, res) => {
      res.json(toTicketJson(await tickets.resolve(currentUser(req), req.params.id)))
    }),
  )

  router.post(
    '/:id/replies',
    asyncHandler(async (req, res) => {
      const reply = await tickets.addReply(currentUser(req), req.params.id, req.body)
      res.status(201).json(toReplyJson(reply))
    }),
  )

  router.post(
    '/:id/attachments',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const file = req.file && {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      }
      const attachment = await services.attachments.upload(currentUser(req), req.params.id, file)
      res.status(201).json(attachment)
    }),
  )

  router.post(
    '/:id/suggest-reply',
    asyncHandler(async (req, res) => {
      const suggestion = await services.suggestions.suggest(currentUser(req), req.params.id)
      res.json({ suggestion })
    }),
  )

  return router
}
