# Gates

Um comando roda tudo: `npm run gates` (na raiz). Ele roda as ferramentas em paralelo, não para na
primeira falha e termina com a lista final, uma linha por violação:

```
G4 api/src/http/routes/stats.ts importa api/src/repositories/prisma.ts (G4-http-sem-prisma-nem-repositorio)
G10 api/package.json left-pad (dependencies sem uso/sem declaração)
```

Sai com código 1 se houver qualquer violação. Opções: `npm run gates -- G4 G6` roda só as ferramentas
dessas regras; `npm run gates -- --verbose` mostra a saída de todas as ferramentas.
O hook `.githooks/pre-commit` roda o mesmo comando antes de cada commit (o `npm run up` ativa o hook).

## Regras

| ID | Regra | Ferramenta | Configuração |
|---|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` de cada projeto | `api/tsconfig.json`, `web/tsconfig.json` |
| G2 | Lint sem erro nem warning (`no-unused-vars`, `no-explicit-any`, recomendados) | ESLint 10 + typescript-eslint | `eslint.config.mjs` |
| G3 | Testes unitários `api/src/**/*.test.ts` passam | Vitest | `api/vitest.config.mts` |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | `scripts/gates/check-source.mjs` (AST do TypeScript) | o próprio script |
| G6 | `api/src/services/` não importa `express`, `multer` nem `api/src/http/` (inclusive só tipo) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G7 | `openai` só em `api/src/integrations/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G8 | Nada em `web/` importa `api/` (inclusive só tipo) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G9 | Nenhum import circular em `api/src` e `web/src` (ciclos só de tipo contam) | dependency-cruiser | `.dependency-cruiser.cjs` |
| G10 | Nenhum arquivo, export (inclusive tipo) ou dependência sem uso em `api/` e `web/` | knip | `api/knip.json`, `web/knip.json` |
| R1 | Nenhum endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, `/tmp/`) em texto fora de `config/` | `scripts/gates/check-source.mjs` | o próprio script |
| R2 | `@prisma/client` só em `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| R3 | O worker (`api/src/jobs/`) não importa `api/src/http/`, `express` nem `multer` | dependency-cruiser | `.dependency-cruiser.cjs` |

### Como cada ferramenta enxerga imports só de tipo

- **dependency-cruiser** com `tsPreCompilationDeps: true` analisa o TypeScript antes da compilação, então
  `import type`, `export type ... from` e `import('x').T` contam. Sem essa opção, G6 e G8 ficariam cegas.
- Não use `--exclude node_modules` nem `exclude` para `node_modules` na config: isso apaga as arestas
  para pacotes e G4/G6/G7/R2 passam em silêncio. Os gates falham se o cruiser não enxergar nenhum pacote.
- `import()` dinâmico, `require`, `import x = require()` e reexportações também contam.

### G5 por AST, não por texto

O `check-source.mjs` lê a árvore sintática, então comentários não contam e estas formas são barradas
fora de `config/`: `process.env.X`, `process['env']`, `globalThis.process.env`, `const { env } = process`,
`import { env } from 'node:process'`, `(process as X).env`, `import.meta.env`, `import.meta['env']`,
`const { env } = import.meta` e copiar `process`/`import.meta` para outra variável.

## Como corrigir

- **G1/G2**: corrija o tipo. Em vez de `any`, use o tipo do domínio (`api/src/domain/ticket.ts`) ou `unknown`
  com verificação. Em `catch`, use `catch (err)` + `err instanceof Error`; sem uso, `catch {`.
- **G4**: a rota recebe o serviço por `HttpDependencies` (`api/src/http/services.ts`). O que falta no serviço
  vira método no serviço; o que falta no banco vira método no repositório. A ligação é feita em `api/src/main.ts`.
- **G5**: acrescente a variável no schema de `api/src/config/env.ts` (ou em `web/src/config/env.ts`) e
  receba o valor por parâmetro/construtor.
- **G6**: serviço lança `DomainError` (`api/src/domain/errors.ts`); `api/src/http/errors.ts` traduz o código
  em status. Arquivo enviado chega como `UploadedFile`, não como `Request`.
- **G7**: chame a IA por uma função de `api/src/integrations/ai-client.ts`, injetada no serviço.
- **G8**: duplique o tipo em `web/src/api/`. O contrato entre os dois lados é o JSON da API.
- **G9**: mova o que é compartilhado para um módulo de baixo (ex.: `formatTicketRef` foi para o domínio).
- **G10**: apague o que não é usado; deixe de exportar o que só é usado no próprio arquivo;
  `npm uninstall` a dependência sem uso.
- **R1**: o endereço vem da configuração da cópia (`npm run up` grava portas, URLs e a pasta de anexos).
- **R2**: precisa de dados? Use ou crie um método num repositório.
- **R3**: o worker usa repositórios, serviços e integrações, nunca a camada HTTP.

## Regras próprias: motivação e exemplo de violação

Os exemplos ficam em `kit-gates/violacoes/R*/`, no formato do kit (arquivos `.modelo`, fora de `api/src` e
`web/src` até a hora do teste). Para aplicar e conferir, com o `git status` limpo:

```bash
bash kit-gates/verificar.sh . "npm run gates" R1   # R2, R3 do mesmo jeito
```

O kit copia o exemplo para dentro de `api/src` ou `web/src`, roda os gates, confere a linha `R1 <arquivo>`
e desfaz. Para ver a falha na mão: copie o `.modelo` para o caminho indicado sem a extensão `.modelo`,
rode `npm run gates` e apague o arquivo.

- **R1 — sem endereço fixo.** O Balcão "achava que era a única cópia no mundo": CORS fixo em
  `http://localhost:5173`, front chamando `http://localhost:4000` em três lugares e anexos em
  `/tmp/balcao/uploads`. Com duas worktrees, a segunda cópia falava com a API da primeira e as duas
  gravavam anexos na mesma pasta. Exemplos: `R1-endereco-fixo-na-api` (pasta `/tmp/...` num serviço) e
  `R1-endereco-fixo-no-front` (`http://127.0.0.1:4000` no front).
- **R2 — Prisma só nos repositórios.** O worker criava o próprio `PrismaClient` lendo `process.env.DATABASE_URL`,
  fora da configuração e dos repositórios; um segundo cliente fica fora do log, da URL da cópia e dos testes.
  Exemplo: `R2-prisma-no-servico`.
- **R3 — worker sem HTTP.** O enunciado exige o worker como processo separado. Importar `http/` (ou Express)
  no worker acopla os dois processos e arrasta o Express para a triagem. Exemplo: `R3-worker-importa-http`.
