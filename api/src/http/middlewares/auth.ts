import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { CurrentUser, Role } from '../../domain/ticket'
import { HttpError } from '../errors'

type AuthenticatedRequest = Request & { user?: CurrentUser }

export function createAuth(secret: string) {
  function signToken(user: { id: string; role: string }) {
    return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '8h' })
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Token ausente' })
    }
    try {
      const payload = jwt.verify(header.slice(7), secret)
      if (typeof payload === 'string') throw new Error('payload inesperado')
      ;(req as AuthenticatedRequest).user = { id: String(payload.sub), role: payload.role as Role }
      next()
    } catch {
      return res.status(401).json({ error: 'unauthorized', message: 'Token inválido' })
    }
  }

  function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as AuthenticatedRequest).user
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: 'forbidden', message: 'Sem permissão' })
      }
      next()
    }
  }

  return { signToken, requireAuth, requireRole }
}

export type Auth = ReturnType<typeof createAuth>

// Usuário colocado na requisição por requireAuth. Só chame em rotas protegidas.
export function currentUser(req: Request): CurrentUser {
  const user = (req as AuthenticatedRequest).user
  if (!user) throw new HttpError(401, 'unauthorized', 'Token ausente')
  return user
}
