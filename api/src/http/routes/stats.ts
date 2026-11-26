import { Router } from 'express'
import { asyncHandler } from '../errors'
import type { HttpDependencies } from '../services'

export function statsRoutes({ auth, services }: HttpDependencies) {
  const router = Router()

  router.get(
    '/',
    auth.requireAuth,
    auth.requireRole('admin'),
    asyncHandler(async (_req, res) => {
      res.json(await services.stats.summary())
    }),
  )

  return router
}
