// Raiz de composição da API: único lugar que liga config, repositórios, integrações, serviços e HTTP.
import { httpConfig, storageConfig } from './config/env'
import { createApp } from './http/app'
import { createAuth } from './http/middlewares/auth'
import { suggestReply } from './integrations/ai-client'
import { attachmentRepository } from './repositories/attachment-repository'
import { databaseProbe } from './repositories/health-repository'
import { replyRepository } from './repositories/reply-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { AttachmentService } from './services/attachment-service'
import { AuthService } from './services/auth-service'
import { HealthService } from './services/health-service'
import { StatsService } from './services/stats-service'
import { SuggestionService } from './services/suggestion-service'
import { TicketService } from './services/ticket-service'

const http = httpConfig()
const tickets = new TicketService(ticketRepository, replyRepository)

const app = createApp({
  auth: createAuth(http.JWT_SECRET),
  corsOrigin: http.CORS_ORIGIN,
  services: {
    attachments: new AttachmentService(attachmentRepository, tickets, storageConfig().UPLOAD_DIR),
    auth: new AuthService(userRepository),
    health: new HealthService(databaseProbe),
    stats: new StatsService(ticketRepository),
    suggestions: new SuggestionService(tickets, userRepository, suggestReply),
    tickets,
  },
})

app.listen(http.PORT, () => {
  console.log(`API rodando em ${http.publicUrl}`)
})
