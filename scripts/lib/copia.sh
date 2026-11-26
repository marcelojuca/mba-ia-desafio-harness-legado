#!/usr/bin/env bash
# Identidade desta cópia do Balcão. Carregado por up.sh e down.sh (não execute direto).
# Cada cópia (clone ou worktree) é identificada pelo caminho absoluto da sua raiz: dele saem o nome
# do projeto compose, o banco e a pasta de estado .harness/ (portas, pids, logs e anexos).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
HARNESS="$ROOT/.harness"
ESTADO="$HARNESS/estado.env"
LOGS="$HARNESS/logs"
PIDS="$HARNESS/pids"
ANEXOS="$HARNESS/uploads"
NODE_HELPER="$ROOT/scripts/lib/harness.mjs"

_nome="$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-24)"
_hash="$(printf '%s' "$ROOT" | cksum | awk '{printf "%06x", $1 % 16777216}')"
COPIA="${_nome:-balcao}-${_hash}"
COMPOSE_PROJECT="balcao-${COPIA}"
DB_NAME="balcao_$(printf '%s' "$COPIA" | tr '-' '_')"

log() { printf '[balcao] %s\n' "$*"; }
falha() {
  printf '[balcao] ERRO: %s\n' "$*" >&2
  exit 1
}

compose() {
  BALCAO_DB_PORT="${DB_PORT:-5432}" BALCAO_DB_NAME="$DB_NAME" \
    docker compose -p "$COMPOSE_PROJECT" -f "$ROOT/docker-compose.yml" "$@"
}

# Um pid só é "nosso" se o processo existe e a linha de comando cita a raiz desta cópia.
# Isso impede que uma cópia derrube processos de outra (ex.: pasta copiada com .harness junto).
pid_nosso() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  ps -o command= -p "$pid" 2>/dev/null | grep -qF "$ROOT/"
}

parar_processo() {
  local nome="$1" arquivo="$PIDS/$1.pid" pid
  [ -f "$arquivo" ] || return 0
  pid="$(tr -dc '0-9' < "$arquivo")"
  if pid_nosso "$pid"; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
    log "parado: $nome (pid $pid)"
  fi
  rm -f "$arquivo"
}

ler_estado() {
  API_PORT="" WEB_PORT="" DB_PORT="" ESTADO_ROOT=""
  if [ -f "$ESTADO" ]; then
    # shellcheck disable=SC1090
    . "$ESTADO"
  fi
  # Estado copiado de outra pasta não vale para esta cópia.
  if [ "${ESTADO_ROOT:-}" != "$ROOT" ]; then
    API_PORT="" WEB_PORT="" DB_PORT=""
  fi
}
