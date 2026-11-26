import { Router } from 'express'
import type { HttpDependencies } from '../services'

export function healthRoutes({ services }: HttpDependencies) {
  const router = Router()

  router.get('/', async (_req, res) => {
    try {
      res.json(await services.health.check())
    } catch (err) {
      console.log('health: banco fora', err)
      res.status(503).json({ error: 'db_unavailable', message: 'Banco de dados não responde' })
    }
  })

  return router
}
