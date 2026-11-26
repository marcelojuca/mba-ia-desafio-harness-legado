import { Router } from 'express'
import { asyncHandler } from '../errors'
import { currentUser } from '../middlewares/auth'
import type { HttpDependencies } from '../services'

export function attachmentRoutes({ auth, services }: HttpDependencies) {
  const router = Router()

  router.get(
    '/:id/download',
    auth.requireAuth,
    asyncHandler(async (req, res) => {
      const { attachment, filePath } = await services.attachments.getForDownload(currentUser(req), req.params.id)
      const asciiName = attachment.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
      res.setHeader('Content-Type', attachment.mimeType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      )
      res.sendFile(filePath)
    }),
  )

  return router
}
