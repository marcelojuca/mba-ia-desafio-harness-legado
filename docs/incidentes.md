# Registro de incidentes

Cada entrada é um erro real de um agente (Claude Code) durante a instalação deste harness, a mudança no
harness que impede a repetição e o commit dessa mudança (`git show --stat <hash>`).

## 1. Uma opção do dependency-cruiser desligou G7 e R2 sem aviso

- **O que aconteceu:** para não varrer `web/node_modules`, o agente rodou o cruiser com
  `--exclude '(^|/)(node_modules|dist)/'`. A opção apaga os módulos de `node_modules` do grafo, inclusive as
  arestas até eles. Os gates mostravam G4, G6, G8 e G9, mas G7 (`openai` na rota de tickets) e R2
  (`@prisma/client` no worker) sumiram, e nada indicava a falha. O agente só percebeu ao comparar com uma
  rodada anterior do cruiser.
- **Mudança no harness:** os gates agora **falham** quando o cruiser não enxerga nenhum pacote npm (a regra
  ficaria cega). A opção foi trocada por uma lista explícita de pastas, com um comentário em `scripts/gates.mjs`,
  e `docs/gates.md` e `AGENTS.md` mandam rodar o `kit-gates` depois de mexer em qualquer configuração de gate.
- **Commit:** `ff2f934`

## 2. `--env-file` nos argumentos de um script auxiliar quebrou a subida

- **O que aconteceu:** o `up.sh` iniciava a API com
  `node scripts/lib/harness.mjs spawn ... tsx watch --env-file=.env src/main.ts`. O Node 22 interpretou o
  `--env-file=.env` como opção dele, mesmo depois do nome do script, e procurou `.env` na raiz do repositório:
  `node: .env: not found`. A subida parava em silêncio, logo depois de migrar o banco.
- **Mudança no harness:** o helper de spawn passou a ler o arquivo indicado em `BALCAO_ENV_FILE` e a passar as
  variáveis ao processo filho. Nenhuma opção do Node vai mais nos argumentos, e um comentário no helper explica
  por quê. Também a partir daí, todo passo do up que falha mostra o fim do log correspondente.
- **Commit:** `77cf7e8`

## 3. Validação do front num navegador interativo travou

- **O que aconteceu:** para refazer o passo 3 do fluxo do avaliador (abrir chamado, ver a triagem, anexar
  um `.txt`), o agente abriu um navegador de verdade pelo MCP do Playwright. O clique em "Abrir chamado" não
  disparou o submit, o seletor de arquivos não abriu, e o agente teve de contornar pelo DOM. O usuário perguntou
  por que não usar o Playwright pela CLI, sem abrir navegador.
- **Mudança no harness:** `npm run smoke` (`scripts/smoke-web.mjs`) faz esse fluxo em Chromium headless contra
  a cópia em que roda: login do cliente, triagem em até 15s e anexo gravado na pasta de anexos da cópia.
  O `AGENTS.md` manda usar o smoke e não abrir navegador interativo.
- **Commit:** `4caf5ea`

## 4. `git checkout` para desfazer um teste apagou uma mudança não commitada

- **O que aconteceu:** depois de acrescentar a guarda do incidente 1 em `scripts/gates.mjs`, ainda sem commit,
  o agente plantou um `--exclude` de teste no mesmo arquivo e o "desfez" com `git checkout scripts/gates.mjs`.
  Isso apagou a guarda junto. O agente só percebeu ao procurar a guarda no arquivo e teve de reescrevê-la.
- **Mudança no harness:** o `AGENTS.md` ganhou a regra "para desfazer um teste, apague só o que você criou;
  não use `git checkout`/`git restore` em arquivo com mudança sua ainda não commitada", e manda testar
  configuração de gate pelo `kit-gates`, que só remove o que plantou e exige `git status` limpo.
- **Commit:** `9fdd2ba`
