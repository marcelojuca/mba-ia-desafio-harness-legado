# Ambiente por cópia

`npm run up` sobe o Balcão inteiro da cópia em que é rodado (clone ou worktree). `npm run down` derruba
só o que essa cópia subiu. Os scripts ficam em `scripts/up.sh`, `scripts/down.sh` e `scripts/lib/`.

## Como uma cópia se distingue da outra

A identidade da cópia é o caminho absoluto da raiz (`scripts/lib/copia.sh`): o nome da pasta mais um hash
do caminho, por exemplo `copia-a-1f2e3d`. Dele saem:

| Recurso | Isolamento |
|---|---|
| Postgres | um projeto compose por cópia (`docker compose -p balcao-<cópia>`): container e volume próprios |
| Banco | `balcao_<cópia>` (e `balcao_<cópia>_test` para os testes de integração) |
| Portas | primeira livre a partir de 4000 (API), 5173 (front) e 5432 (Postgres); guardadas em `.harness/estado.env` |
| Anexos | `<cópia>/.harness/uploads` |
| Processos | API, worker e front em grupos de processos próprios; pids em `.harness/pids/` |
| Front ↔ API | `web/.env.local` recebe `VITE_API_URL` e `WEB_PORT`; `api/.env` recebe `CORS_ORIGIN` com o front da cópia |

O down só derruba um pid se a linha de comando do processo cita a raiz da cópia: uma cópia nunca mata
processos de outra, mesmo que a pasta `.harness/` tenha sido copiada junto.

## O que o `npm run up` faz

1. Para os processos que uma subida anterior desta cópia deixou rodando.
2. `npm ci` na raiz, em `api/` e em `web/` quando falta `node_modules` ou o lockfile mudou.
3. Ativa o hook do Git (`git config core.hooksPath .githooks`).
4. Escolhe as portas (reaproveita as da cópia se estiverem livres).
5. Sobe o Postgres da cópia e cria o banco de testes.
6. Grava `api/.env` (a partir de `api/.env.example`) e `web/.env.local`.
7. `prisma generate`, `prisma migrate deploy` (banco principal e de testes) e a seed (idempotente, com upsert).
8. Inicia API (`tsx watch`), worker (`tsx watch`) e front (Vite) em segundo plano e espera cada um responder.
9. Imprime API, front, banco, pasta de anexos e logs.

Rodar de novo sem derrubar é seguro: os processos são reiniciados nas mesmas portas e a seed não duplica.

## Problemas comuns

- **Docker parado**: o up para com "o Docker não está respondendo". Abra o Docker e rode de novo.
- **Algo não subiu**: o up mostra o fim do log que falhou; os logs completos ficam em `.harness/logs/`.
- **Chamado parado em "Em triagem"**: veja `.harness/logs/worker.log`; `npm run up` reinicia o worker.
- **Erro de CORS**: abra o front pelo endereço que o up imprimiu (`http://localhost:<porta>`), não por `127.0.0.1`.
- **Começar do zero nesta cópia**: `npm run down -- --limpar` e depois `npm run up`.
- **Testes de integração**: `cd api && npm run test:integration` usa o banco `_test` da cópia, já migrado pelo up.
