import type { AttachmentService } from '../services/attachment-service'
import type { AuthService } from '../services/auth-service'
import type { HealthService } from '../services/health-service'
import type { StatsService } from '../services/stats-service'
import type { SuggestionService } from '../services/suggestion-service'
import type { TicketService } from '../services/ticket-service'
import type { Auth } from './middlewares/auth'

// Tudo o que a camada HTTP recebe pronto de main.ts. Rotas não montam serviços nem repositórios (G4).
export type HttpDependencies = {
  auth: Auth
  corsOrigin: string
  services: {
    attachments: AttachmentService
    auth: AuthService
    health: HealthService
    stats: StatsService
    suggestions: SuggestionService
    tickets: TicketService
  }
}
