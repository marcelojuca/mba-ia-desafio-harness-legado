// Mensagem para mostrar na tela a partir de qualquer coisa que um catch receba.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
