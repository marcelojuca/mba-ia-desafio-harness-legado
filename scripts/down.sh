#!/usr/bin/env bash
# Derruba tudo o que `npm run up` iniciou NESTA cópia: front, worker, API e o container do Postgres.
# Outras cópias (outras worktrees/clones) não são tocadas. O volume do banco e os anexos ficam,
# para a próxima subida; use `npm run down -- --limpar` para apagar também banco e anexos desta cópia.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib/copia.sh"

LIMPAR=0
[ "${1:-}" = "--limpar" ] && LIMPAR=1

ler_estado
for p in web worker api; do parar_processo "$p"; done

if command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
  if [ "$LIMPAR" = 1 ]; then
    compose down -v --remove-orphans > /dev/null 2>&1 || true
    log "Postgres removido com o volume (projeto $COMPOSE_PROJECT)"
  else
    compose down --remove-orphans > /dev/null 2>&1 || true
    log "Postgres parado (projeto $COMPOSE_PROJECT; dados mantidos no volume)"
  fi
else
  log "Docker não está respondendo; nada a parar no compose."
fi

if [ "$LIMPAR" = 1 ]; then
  rm -rf "$ANEXOS" "$ESTADO"
  log "anexos e portas desta cópia apagados"
fi
log "cópia $COPIA derrubada"
