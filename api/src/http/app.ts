import express from 'express'
import cors from 'cors'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { ticketRoutes } from './routes/tickets'
import { attachmentRoutes } from './routes/attachments'
import { statsRoutes } from './routes/stats'
import { errorHandler, notFoundHandler } from './errors'
import type { HttpDependencies } from './services'

export function createApp(deps: HttpDependencies) {
  const app = express()

  app.use(cors({ origin: deps.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', healthRoutes(deps))
  app.use('/api/auth', authRoutes(deps))
  app.use('/api/tickets', ticketRoutes(deps))
  app.use('/api/attachments', attachmentRoutes(deps))
  app.use('/api/stats', statsRoutes(deps))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
