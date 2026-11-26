/**
 * Regras de dependência do Balcão (G4, G6, G7, G8, G9 e as próprias R2, R3).
 * Rode pelos gates: `npm run gates`. O nome de cada regra começa com o ID que aparece na lista final.
 *
 * `tsPreCompilationDeps: true` faz o cruiser enxergar imports só de tipo (`import type`,
 * `import('x').T`), que o TypeScript apaga na compilação. Sem isso G6 e G8 ficam cegas para tipos.
 * Não acrescente `exclude`/`pathNot` para pastas de api/src ou web/src: esconder arquivo é violação.
 */

// Módulos npm: o caminho resolvido passa por node_modules; sem resolução, o cruiser usa o próprio nome.
const npm = (names) => `(^|node_modules/)(${names.join('|')})(/|$)`

const PRISMA = npm(['@prisma/client', '\\.prisma/client'])
const EXPRESS = npm(['express', 'multer', '@types/express', '@types/multer', '@types/express-serve-static-core', 'express-serve-static-core'])
const OPENAI = npm(['openai'])

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'G4-http-sem-prisma-nem-repositorio',
      severity: 'error',
      comment: 'api/src/http/ fala com services/, nunca com @prisma/client nem com api/src/repositories/.',
      from: { path: '^api/src/http/' },
      to: { path: [PRISMA, '^api/src/repositories/'] },
    },
    {
      name: 'G6-servico-sem-express-nem-http',
      severity: 'error',
      comment: 'api/src/services/ não conhece express, multer nem api/src/http/ (inclusive imports só de tipo).',
      from: { path: '^api/src/services/' },
      to: { path: [EXPRESS, '^api/src/http/'] },
    },
    {
      name: 'G7-openai-so-em-integrations',
      severity: 'error',
      comment: 'O pacote openai só é importado em api/src/integrations/.',
      from: { path: '^(api|web)/', pathNot: '^api/src/integrations/' },
      to: { path: OPENAI },
    },
    {
      name: 'G8-web-nao-importa-api',
      severity: 'error',
      comment: 'Nada em web/ importa arquivos de api/ (inclusive imports só de tipo). Duplique o tipo em web/src.',
      from: { path: '^web/' },
      to: { path: '^api/' },
    },
    {
      name: 'G9-sem-import-circular',
      severity: 'error',
      comment: 'Nenhum ciclo de imports em api/src nem em web/src (imports só de tipo contam).',
      from: { path: '^(api|web)/src/' },
      to: { circular: true },
    },
    {
      name: 'R2-prisma-so-em-repositories',
      severity: 'error',
      comment:
        'Só api/src/repositories/ importa @prisma/client. O worker criava o próprio PrismaClient lendo process.env; ' +
        'services, jobs e integrations recebem repositórios.',
      from: { path: '^api/src/', pathNot: '^api/src/repositories/' },
      to: { path: PRISMA },
    },
    {
      name: 'R3-worker-sem-http',
      severity: 'error',
      comment:
        'O worker (api/src/jobs/) é um processo separado da API: não importa api/src/http/, express nem multer.',
      from: { path: '^api/src/jobs/' },
      to: { path: [EXPRESS, '^api/src/http/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    detectJSDocImports: true,
    moduleSystems: ['es6', 'cjs', 'tsd'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      mainFields: ['types', 'typings', 'main', 'module'],
    },
  },
}
