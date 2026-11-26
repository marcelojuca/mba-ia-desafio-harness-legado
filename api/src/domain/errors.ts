// Erros de regra de negócio. Não sabem nada de HTTP: api/src/http/errors.ts traduz o código em status.
export type DomainErrorCode =
  | 'validation_error'
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'file_too_large'
  | 'unsupported_type'

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
