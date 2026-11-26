# AGENTS.md — Balcão

Central de chamados: `api/` (Express + Prisma + worker de triagem), `web/` (React + Vite), Postgres no Docker.
Este arquivo é o índice. O detalhe está nos documentos de `docs/`.

## Ambiente (cada cópia/worktree é isolada)

- Subir tudo: `npm run up` (portas livres, banco e anexos próprios; pode repetir sem derrubar).
- Derrubar esta cópia: `npm run down` (`npm run down -- --limpar` apaga também banco e anexos).
- Endereços, banco e pasta de anexos: saem no fim do `npm run up` e ficam em `.harness/estado.env`.
- Logs: `.harness/logs/api.log`, `worker.log`, `web.log`. A API e o worker recarregam sozinhos ao salvar.
- Nunca suba processos na mão, não fixe portas e não use `kill -9` em porta: rode `npm run up` de novo.
- `api/.env` e `web/.env.local` são gerados pelo up. Configuração nova entra em `api/src/config/env.ts`
  (e em `api/.env.example`) ou em `web/src/config/env.ts`.
- IA em modo fake por padrão (`AI_MODE=fake`), sem chave. `[falha-ia]` no título força falha na triagem.

## Contas da seed (recriadas a cada `npm run up`)

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Provar que não quebrou nada

1. `npm run gates` — todas as regras; a lista final traz `ID arquivo` por violação. Precisa passar.
2. `cd blackbox && npm ci && API_URL=<API desta cópia> npm test` — contrato HTTP (51 testes).
3. `npm run smoke` — front desta cópia em Chromium headless (1ª vez: `npx playwright install chromium`).
   Não abra navegador interativo para validar o front.

O hook `pre-commit` (`.githooks/pre-commit`) roda os gates; commit com violação é bloqueado.

## Regras de camada (os gates barram; detalhe e correção em `docs/gates.md`)

- `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` (G4); recebe serviços de `api/src/main.ts`.
- `api/src/services/` não importa `express`, `multer` nem `api/src/http/`, nem só tipo (G6). Erro de regra é `DomainError`.
- `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` (G5).
- `openai` só em `api/src/integrations/` (G7). `@prisma/client` só em `api/src/repositories/` (R2).
- `web/` não importa nada de `api/`, nem tipo (G8): duplique o tipo em `web/src/api/`.
- Sem ciclos (G9), sem código/arquivo/dependência sem uso (G10), sem endereço fixo fora de `config/` (R1).
- Worker (`api/src/jobs/`) não importa `http/` nem express (R3).
- Proibido suprimir: nada de `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`,
  nem `ignore`/`exclude` de arquivos de `api/src` ou `web/src` nas configs.

## Ao mexer no harness

- Mudou config de gate (`eslint.config.mjs`, `.dependency-cruiser.cjs`, `*/knip.json`, `scripts/gates.mjs`)?
  Commite e rode `bash kit-gates/verificar.sh . "npm run gates"`: opção errada desliga regra em silêncio.
- Para desfazer um teste, apague só o que você criou. Não use `git checkout`/`git restore` em arquivo
  que tenha mudança sua ainda não commitada.
- Errou de um jeito que o harness poderia ter evitado? Registre em `docs/incidentes.md` e mude o harness.

## Onde está o detalhe

- `README.md` — visão para humanos e decisões. `docs/gates.md` — cada regra, ferramenta e como corrigir.
- `docs/ambiente.md` — como as cópias são isoladas e problemas comuns. `docs/incidentes.md` — erros e correções.
