// Único lugar do front que lê import.meta.env (G5). O `npm run up` grava VITE_API_URL em web/.env.local
// com a porta da API desta cópia; o valor abaixo é só o padrão de quem sobe na mão, sem o harness.
export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:4000'
