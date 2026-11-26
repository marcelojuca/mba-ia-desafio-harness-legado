# Balcão

Central de chamados da empresa. Clientes abrem chamados, uma IA faz a triagem (categoria e prioridade)
em segundo plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma e o worker de triagem (processo separado).
- `web/`: front em React + Vite.
- `blackbox/`: suíte caixa-preta da API (o contrato HTTP).
- `kit-gates/`: kit que planta violações e confere se os gates as barram.
- `scripts/`, `.githooks/`, `docs/`, `AGENTS.md`: o harness (ambiente, gates, hook e documentação).

Este repositório traz um **harness** para que vários agentes trabalhem ao mesmo tempo, cada um na sua
worktree: um comando sobe tudo, cada cópia é isolada e um comando de gates prova que nada quebrou.

## O ciclo

```mermaid
graph LR
  A["AGENTS.md"] --> U["npm run up"]
  U --> C["Mudança no código<br/>(worktree da cópia)"]
  C --> G["npm run gates"]
  G -->|violação| C
  G -->|passa| H["pre-commit<br/>(.githooks)"]
  H -->|bloqueia| C
  H -->|commit| V["caixa-preta<br/>+ npm run smoke"]
  V -->|falha| C
  V -->|passa| PR["Push / pull request"]
  C -. erro do agente .-> I[("docs/incidentes.md")]
  I -. nova regra, script ou doc .-> A
  I -.-> G
```

| Peça | Lê | Produz |
|---|---|---|
| `AGENTS.md` | — | Índice: como subir, derrubar, rodar os gates, contas e regras de camada; aponta para `docs/` |
| `npm run up` | `api/.env.example`, `.harness/estado.env` | Postgres, API, worker e front da cópia; `api/.env`, `web/.env.local`; endereços impressos |
| `npm run gates` | `api/`, `web/`, configs das ferramentas | Lista final `<ID> <arquivo>` por violação; código 1 se algo falhar |
| `.githooks/pre-commit` | o commit em andamento | Roda os gates (G1 tipos e G2 lint incluídos) e bloqueia o commit se falharem |
| `blackbox/` | API da cópia (`API_URL`) | 51 testes do contrato HTTP |
| `npm run smoke` | front da cópia | Login, triagem e anexo em Chromium headless |
| `kit-gates/` | violações plantadas, uma por vez | `barrada` ou a lacuna da regra |
| `docs/incidentes.md` | erros reais dos agentes | Mudança no harness (gate, hook, script ou doc) com o hash do commit |

O agente só recebe a saída das ferramentas, não a opinião de quem escreveu as regras: a lista final dos
gates diz o ID da regra e o arquivo, e `docs/gates.md` diz como corrigir. Quando um erro passa pelo ciclo,
ele vira entrada em `docs/incidentes.md` e uma mudança no harness, para o próximo agente acertar de primeira.

## Como rodar

**Pré-requisitos:** Linux ou macOS, Git, Docker (com `docker compose` v2) e Node.js LTS (22 ou superior).
Nada mais: o Postgres roda em container e as dependências são instaladas pelo próprio comando de subida.

```bash
npm run up      # sobe Postgres, migrations, seed, API, worker e front desta cópia
npm run down    # derruba tudo o que a subida desta cópia iniciou (outras cópias não são tocadas)
npm run gates   # roda todas as verificações e lista as violações
```

`npm run up` funciona a partir de um clone limpo e pode ser repetido sem derrubar antes. No fim, ele
informa os endereços daquela cópia:

```
Balcão no ar (cópia copia-a-1f2e3d)
  API:     http://localhost:4000   (saúde: http://localhost:4000/api/health)
  Front:   http://localhost:5173
  Banco:   postgresql://balcao:balcao@localhost:5432/balcao_copia_a_1f2e3d
           (container do projeto compose balcao-copia-a-1f2e3d)
  Anexos:  /caminho/da/copia-a/.harness/uploads
  Worker:  triagem rodando (IA em modo fake)
  Logs:    /caminho/da/copia-a/.harness/logs/{api,worker,web}.log
```

Uma segunda cópia (`git worktree add ../copia-b && cd ../copia-b && npm run up`) recebe as próximas
portas livres (ex.: 4001, 5174, 5433), o seu próprio banco, a sua pasta de anexos e o seu worker.
`npm run down -- --limpar` apaga também o banco e os anexos da cópia.

A IA roda em modo fake por padrão (`AI_MODE=fake`): classifica por palavras-chave e não precisa de chave.
Para a OpenAI, coloque `AI_MODE=openai` e `OPENAI_API_KEY` em `api/.env` e rode `npm run up` de novo.

Outras verificações:

```bash
cd blackbox && npm ci && API_URL=http://localhost:4000 npm test   # contrato HTTP; use a API da sua cópia
npm run smoke                                                      # front da cópia, em Chromium headless
cd api && npm run test:integration                                 # testes de integração (banco _test da cópia)
```

O `npm run smoke` precisa, uma vez por máquina, de `npx playwright install chromium`.

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

A seed roda em toda subida e é idempotente: não duplica nada e garante que as três contas entram.

## Gates

`npm run gates` roda tudo, mesmo quando algo falha, e termina com uma linha por violação no formato
`<ID> <arquivo> <detalhe>` (para dependência sem uso: `G10 api/package.json <dependência> ...`).
Sai com código diferente de zero se qualquer regra falhar. Detalhe e como corrigir: [docs/gates.md](docs/gates.md).

| ID | Regra | Ferramenta |
|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` |
| G2 | Lint sem erro e sem warning (variável/import sem uso, `any` explícito) | ESLint + typescript-eslint |
| G3 | Testes unitários da API passam | Vitest |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | `scripts/gates/check-source.mjs` (AST) |
| G6 | `api/src/services/` não importa `express`, `multer` nem `api/src/http/` (nem só tipo) | dependency-cruiser |
| G7 | `openai` só em `api/src/integrations/` | dependency-cruiser |
| G8 | `web/` não importa `api/` (nem só tipo) | dependency-cruiser |
| G9 | Sem import circular em `api/src` e `web/src` | dependency-cruiser |
| G10 | Sem arquivo, export ou dependência sem uso em `api/` e `web/` | knip |
| R1 | Sem endereço fixo (`localhost`, `127.0.0.1`, `/tmp/`...) fora de `config/` | `scripts/gates/check-source.mjs` (AST) |
| R2 | `@prisma/client` só em `api/src/repositories/` | dependency-cruiser |
| R3 | O worker (`api/src/jobs/`) não importa `api/src/http/` nem express | dependency-cruiser |

Nenhum arquivo de `api/src` ou `web/src` fica fora das ferramentas, e comentários de supressão não valem:
o ESLint roda com `noInlineConfig` e `ban-ts-comment`, então `eslint-disable` e `@ts-ignore` viram erro.

**Hook do Git.** O `npm run up` ativa `.githooks/pre-commit` (`git config core.hooksPath .githooks`), que roda
os gates (G1 tipos e G2 lint incluídos, junto com as demais regras) e bloqueia o commit se algo falhar.

**Kit.** `bash kit-gates/verificar.sh . "npm run gates"` planta cada violação do kit, uma por vez, e confere a lista.

### Regras próprias e como aplicar o exemplo de violação

Motivação completa em [docs/gates.md](docs/gates.md#regras-próprias-motivação-e-exemplo-de-violação).

- **R1 — sem endereço fixo.** O CORS, a URL da API no front e a pasta de anexos eram fixos; com duas
  worktrees, uma cópia falava com a API da outra e as duas gravavam anexos no mesmo lugar.
- **R2 — Prisma só nos repositórios.** O worker criava o próprio `PrismaClient` com `process.env.DATABASE_URL`.
- **R3 — worker sem HTTP.** O worker é um processo separado e não pode depender da camada HTTP.

Os exemplos ficam em `kit-gates/violacoes/R1-*`, `R2-*` e `R3-*`. Com o `git status` limpo:

```bash
bash kit-gates/verificar.sh . "npm run gates" R1
bash kit-gates/verificar.sh . "npm run gates" R2
bash kit-gates/verificar.sh . "npm run gates" R3
```

O kit aplica cada exemplo dentro de `api/src`/`web/src`, confere que os gates falham com a linha da regra e
desfaz. Na mão: copie o arquivo `.modelo` para o caminho que ele espelha (sem `.modelo`), rode `npm run gates`
e apague o arquivo.

## Decisões

**Isolamento das cópias.** Cada cópia é identificada pelo caminho absoluto da raiz. Dele saem o projeto compose
(um container Postgres e um volume por cópia), o nome do banco e a pasta `.harness/` com portas, pids, logs e
anexos. As portas são as primeiras livres a partir de 4000/5173/5432 e ficam guardadas para a próxima subida.
O up grava `api/.env` (porta, banco, `CORS_ORIGIN`, `UPLOAD_DIR`) e `web/.env.local` (`VITE_API_URL`, `WEB_PORT`),
então cada front conversa com a API da sua cópia. API, worker e front rodam em grupos de processos próprios;
o down só mata processos cuja linha de comando cita a raiz da cópia. A seed passou a usar `upsert`.
Detalhe: [docs/ambiente.md](docs/ambiente.md).

**Como as violações existentes foram corrigidas** (sem mudar a API; a caixa-preta passou 51/51 antes e depois):

- Configuração: `api/src/config/env.ts` é o único leitor de `process.env` (com zod, um bloco por consumidor);
  `web/src/config/env.ts` é o único leitor de `import.meta.env`.
- HTTP: as rotas viraram fábricas que recebem os serviços; `api/src/main.ts` é a raiz de composição. As
  consultas de estatística e saúde saíram das rotas para repositórios e serviços.
- Serviços: lançam `DomainError`; `http/errors.ts` traduz o código em status. O upload recebe um
  `UploadedFile` em vez do `Request` do Express. A sugestão de resposta saiu da rota para um serviço que usa
  `integrations/ai-client.ts` (o prompt da OpenAI passou a ser um só).
- Worker: usa o repositório de chamados em vez de criar o próprio `PrismaClient`.
- Front: os tipos do contrato foram duplicados em `web/src/api/tickets.ts`; `any` em `catch` virou `unknown`.
- Ciclo `ticket-service` ↔ `notification-service`: `formatTicketRef` foi para o domínio.
- Código morto removido: `utils/legacy-sla.ts`, `calculateSlaDeadline`, `formatCurrency`, `lodash` e `axios`.

**Documentação para agentes.** O `CLAUDE.md` antigo mentia: citava `npm run migrate` (não existia), pastas que
não existem (`controllers/`, `tests/`, `store/`), mandava usar `any`, axios e `kill -9` nas portas e proibia
mudar 4000/5173/5432. Ele virou um ponteiro para o `AGENTS.md`, um índice de menos de 60 linhas com subir,
derrubar, gates, contas e regras de camada, que aponta para `docs/` (divulgação progressiva). Todo comando
citado existe; `npm run migrate` passou a existir em `api/`.

## Registro de incidentes

Erros reais dos agentes durante este trabalho e a mudança no harness que impede cada um de se repetir:
[docs/incidentes.md](docs/incidentes.md).
