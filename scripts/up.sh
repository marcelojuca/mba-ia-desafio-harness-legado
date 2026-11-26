#!/usr/bin/env bash
# Sobe o Balcão inteiro DESTA cópia: Postgres (container próprio), migrations, seed, API, worker e front.
# Uso: npm run up   (ou bash scripts/up.sh). Pode rodar de novo sem derrubar: reinicia os processos
# desta cópia, reaproveita portas e banco, e a seed não duplica nada.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib/copia.sh"

for cmd in node npm docker git; do
  command -v "$cmd" > /dev/null 2>&1 || falha "falta o comando '$cmd' no PATH."
done
docker info > /dev/null 2>&1 || falha "o Docker não está respondendo. Abra o Docker e rode de novo."
docker compose version > /dev/null 2>&1 || falha "falta o plugin 'docker compose' (v2)."

mkdir -p "$LOGS" "$PIDS" "$ANEXOS"
ler_estado

# 1. Para os processos que uma subida anterior DESTA cópia deixou rodando (libera as portas dela).
for p in web worker api; do parar_processo "$p"; done

# 2. Dependências: npm ci respeita o package-lock.json; só roda quando falta ou o lock mudou.
instalar() {
  local pasta="$1"
  if [ ! -d "$pasta/node_modules" ] || [ "$pasta/package-lock.json" -nt "$pasta/node_modules/.package-lock.json" ]; then
    local nome="${pasta#"$ROOT"}"
    log "instalando dependências em .${nome}/ (npm ci)"
    (cd "$pasta" && npm ci --no-audit --no-fund --loglevel=error) > "$LOGS/npm-install.log" 2>&1 \
      || { tail -30 "$LOGS/npm-install.log"; falha "npm ci falhou em $pasta"; }
  fi
}
instalar "$ROOT"
instalar "$ROOT/api"
instalar "$ROOT/web"

# 3. Hook do Git: os gates rodam antes de cada commit (vale para todas as worktrees do repositório).
git -C "$ROOT" config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/"* 2>/dev/null || true

# 4. Portas: reaproveita as desta cópia se ainda estiverem livres; senão pega as próximas livres.
porta_db_atual="$(compose port db 5432 2>/dev/null | awk -F: 'NF {print $NF}' | tail -1 || true)"
if [ -n "$porta_db_atual" ]; then
  DB_PORT="$porta_db_atual"
elif [ -z "$DB_PORT" ] || ! node "$NODE_HELPER" port-free "$DB_PORT"; then
  DB_PORT="$(node "$NODE_HELPER" free-port 5432)"
fi
if [ -z "$API_PORT" ] || ! node "$NODE_HELPER" port-free "$API_PORT"; then
  API_PORT="$(node "$NODE_HELPER" free-port 4000 "$DB_PORT")"
fi
if [ -z "$WEB_PORT" ] || ! node "$NODE_HELPER" port-free "$WEB_PORT"; then
  WEB_PORT="$(node "$NODE_HELPER" free-port 5173 "$DB_PORT" "$API_PORT")"
fi
cat > "$ESTADO" <<EOF
ESTADO_ROOT='$ROOT'
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
DB_PORT=$DB_PORT
EOF

API_URL="http://localhost:$API_PORT"
WEB_URL="http://localhost:$WEB_PORT"
DATABASE_URL="postgresql://balcao:balcao@localhost:$DB_PORT/$DB_NAME"

# 5. Postgres desta cópia.
log "Postgres: projeto compose $COMPOSE_PROJECT, porta $DB_PORT, banco $DB_NAME"
compose up -d --wait db > "$LOGS/compose.log" 2>&1 || compose up -d db >> "$LOGS/compose.log" 2>&1 \
  || { tail -20 "$LOGS/compose.log"; falha "docker compose não subiu o Postgres (veja $LOGS/compose.log)"; }
pronto=0
for _ in $(seq 1 60); do
  if compose exec -T db pg_isready -h 127.0.0.1 -U balcao -d "$DB_NAME" > /dev/null 2>&1; then pronto=1; break; fi
  sleep 1
done
[ "$pronto" = 1 ] || falha "o Postgres não ficou pronto em 60s (veja: docker compose -p $COMPOSE_PROJECT logs db)"
compose exec -T db psql -U balcao -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}_test'" | grep -q 1 \
  || compose exec -T db psql -U balcao -d postgres -c "CREATE DATABASE ${DB_NAME}_test" > /dev/null

# 6. Configuração desta cópia (api/.env e web/.env.local são gerados; não vão para o Git).
node "$NODE_HELPER" set-env "$ROOT/api/.env" "$ROOT/api/.env.example" \
  "DATABASE_URL=$DATABASE_URL" \
  "DATABASE_URL_TEST=postgresql://balcao:balcao@localhost:$DB_PORT/${DB_NAME}_test" \
  "PORT=$API_PORT" \
  "API_PUBLIC_URL=$API_URL" \
  "CORS_ORIGIN=$WEB_URL" \
  "UPLOAD_DIR=$ANEXOS"
node "$NODE_HELPER" set-env "$ROOT/web/.env.local" - \
  "VITE_API_URL=$API_URL" \
  "WEB_PORT=$WEB_PORT"

# 7. Prisma: cliente, migrations e seed (idempotente).
(
  cd "$ROOT/api"
  ./node_modules/.bin/prisma generate > "$LOGS/prisma.log" 2>&1
  ./node_modules/.bin/prisma migrate deploy >> "$LOGS/prisma.log" 2>&1
  DATABASE_URL="postgresql://balcao:balcao@localhost:$DB_PORT/${DB_NAME}_test" \
    ./node_modules/.bin/prisma migrate deploy >> "$LOGS/prisma.log" 2>&1  # banco dos testes de integração
  ./node_modules/.bin/tsx --env-file=.env prisma/seed.ts >> "$LOGS/prisma.log" 2>&1  # aqui o tsx é o próprio processo
) || { tail -30 "$LOGS/prisma.log"; falha "migrations ou seed falharam (veja $LOGS/prisma.log)"; }
log "banco migrado e seed carregada"

# 8. Processos em segundo plano, cada um no seu grupo (o down derruba o grupo inteiro).
iniciar() {
  local nome="$1" cwd="$2"
  shift 2
  : > "$LOGS/$nome.log"
  node "$NODE_HELPER" spawn "$LOGS/$nome.log" "$PIDS/$nome.pid" "$cwd" "$@"
}
export BALCAO_ENV_FILE="$ROOT/api/.env"
iniciar api "$ROOT/api" "$ROOT/api/node_modules/.bin/tsx" watch src/main.ts
iniciar worker "$ROOT/api" "$ROOT/api/node_modules/.bin/tsx" watch src/jobs/triage-worker.ts
unset BALCAO_ENV_FILE
iniciar web "$ROOT/web" "$ROOT/web/node_modules/.bin/vite"

node "$NODE_HELPER" wait-http "$API_URL/api/health" 60 \
  || { tail -30 "$LOGS/api.log"; falha "a API não respondeu em $API_URL/api/health (veja $LOGS/api.log)"; }
node "$NODE_HELPER" wait-http "$WEB_URL/" 60 \
  || { tail -30 "$LOGS/web.log"; falha "o front não respondeu em $WEB_URL (veja $LOGS/web.log)"; }
for _ in $(seq 1 20); do
  grep -q "worker de triagem rodando" "$LOGS/worker.log" 2>/dev/null && break
  sleep 0.5
done
pid_nosso "$(tr -dc '0-9' < "$PIDS/worker.pid")" && grep -q "worker de triagem rodando" "$LOGS/worker.log" \
  || { tail -30 "$LOGS/worker.log"; falha "o worker não subiu (veja $LOGS/worker.log)"; }

cat <<EOF

Balcão no ar (cópia $COPIA)
  API:     $API_URL   (saúde: $API_URL/api/health)
  Front:   $WEB_URL
  Banco:   $DATABASE_URL
           (container do projeto compose $COMPOSE_PROJECT)
  Anexos:  $ANEXOS
  Worker:  triagem rodando (IA em modo fake)
  Logs:    $LOGS/{api,worker,web}.log
  Contas:  admin@balcao.dev / Admin@123, agente@balcao.dev / Agente@123, cliente@balcao.dev / Cliente@123

Derrubar esta cópia: npm run down    Gates: npm run gates
EOF
