#!/usr/bin/env node
// Verificações por AST que nenhuma ferramenta pronta faz do jeito que o Balcão precisa:
//   G5: process.env só em api/src/config/; import.meta.env só em web/src/config/.
//   R1: nenhum endereço fixo (localhost, 127.0.0.1, 0.0.0.0, /tmp/) fora das pastas config/.
// Saída: uma linha "<ID> <arquivo>:<linha> <motivo>" por achado; código 1 se houver algum.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const ALVOS = [
  { dir: 'api/src', config: 'api/src/config/' },
  { dir: 'web/src', config: 'web/src/config/' },
]
const EXTENSOES = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const ENDERECO_FIXO = /\blocalhost\b|\b127\.0\.0\.1\b|\b0\.0\.0\.0\b|\[::1\]|(^|[^\w.])\/tmp(\/|\b)/i

function listar(dir) {
  const abs = join(ROOT, dir)
  let entradas
  try {
    entradas = readdirSync(abs)
  } catch {
    return []
  }
  return entradas.flatMap((nome) => {
    if (nome === 'node_modules') return []
    const rel = `${dir}/${nome}`
    const st = statSync(join(ROOT, rel))
    if (st.isDirectory()) return listar(rel)
    return EXTENSOES.test(nome) ? [rel] : []
  })
}

// Nome "estático" de uma expressão: process, globalThis.process, globalThis['process'], (process as any)...
function semEnvoltorio(no) {
  let atual = no
  while (
    ts.isParenthesizedExpression(atual) ||
    ts.isAsExpression(atual) ||
    ts.isNonNullExpression(atual) ||
    ts.isTypeAssertionExpression(atual) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(atual))
  ) {
    atual = atual.expression
  }
  return atual
}

function nomeDoAcesso(no) {
  if (ts.isPropertyAccessExpression(no)) return no.name.text
  if (ts.isElementAccessExpression(no)) {
    const arg = semEnvoltorio(no.argumentExpression)
    if (ts.isStringLiteralLike(arg)) return arg.text
    return '<dinamico>'
  }
  return undefined
}

function verificar(rel, configPrefix) {
  const texto = readFileSync(join(ROOT, rel), 'utf8')
  const fonte = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const emConfig = rel.startsWith(configPrefix)
  const achados = []
  const linha = (no) => fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1
  const achar = (id, no, motivo) => achados.push(`${id} ${rel}:${linha(no)} ${motivo}`)

  // Nomes locais que apontam para o módulo process (import x from 'node:process', require('process')).
  const aliasesDeProcess = new Set(['process'])
  const ehModuloProcess = (s) => s === 'process' || s === 'node:process'

  function ehProcess(no) {
    const e = semEnvoltorio(no)
    if (ts.isIdentifier(e)) return aliasesDeProcess.has(e.text)
    const nome = nomeDoAcesso(e)
    return nome === 'process'
  }
  function ehImportMeta(no) {
    const e = semEnvoltorio(no)
    return ts.isMetaProperty(e) && e.keywordToken === ts.SyntaxKind.ImportKeyword && e.name.text === 'meta'
  }

  function visitar(no) {
    // --- G5: imports do módulo process ---
    if (ts.isImportDeclaration(no) && ts.isStringLiteral(no.moduleSpecifier) && ehModuloProcess(no.moduleSpecifier.text)) {
      const clausula = no.importClause
      if (clausula?.name) aliasesDeProcess.add(clausula.name.text)
      const nomeados = clausula?.namedBindings
      if (nomeados && ts.isNamespaceImport(nomeados)) aliasesDeProcess.add(nomeados.name.text)
      if (nomeados && ts.isNamedImports(nomeados)) {
        for (const el of nomeados.elements) {
          if ((el.propertyName ?? el.name).text === 'env' && !emConfig) achar('G5', el, 'importa env do módulo process')
        }
      }
    }
    if (
      ts.isVariableDeclaration(no) &&
      no.initializer &&
      ts.isCallExpression(semEnvoltorio(no.initializer)) &&
      ts.isIdentifier(semEnvoltorio(no.initializer).expression) &&
      semEnvoltorio(no.initializer).expression.text === 'require'
    ) {
      const arg = semEnvoltorio(no.initializer).arguments[0]
      if (arg && ts.isStringLiteralLike(arg) && ehModuloProcess(arg.text)) {
        if (ts.isIdentifier(no.name)) aliasesDeProcess.add(no.name.text)
        else if (!emConfig) achar('G5', no, 'desestrutura o módulo process')
      }
    }

    if (!emConfig) {
      // --- G5: process.env / process['env'] / globalThis.process.env / import.meta.env ---
      if (ts.isPropertyAccessExpression(no) || ts.isElementAccessExpression(no)) {
        const nome = nomeDoAcesso(no)
        if ((nome === 'env' || nome === '<dinamico>') && ehProcess(no.expression)) achar('G5', no, 'lê process.env fora de config/')
        if ((nome === 'env' || nome === '<dinamico>') && ehImportMeta(no.expression)) achar('G5', no, 'lê import.meta.env fora de config/')
      }
      // --- G5: const { env } = process / import.meta ; const p = process (apelido esconde o env) ---
      if (ts.isVariableDeclaration(no) && no.initializer) {
        const init = no.initializer
        if (ehProcess(init) || ehImportMeta(init)) {
          achar('G5', no, 'copia process/import.meta para uma variável (use o módulo config/)')
        }
      }
      if (ts.isBinaryExpression(no) && no.operatorToken.kind === ts.SyntaxKind.EqualsToken && (ehProcess(no.right) || ehImportMeta(no.right))) {
        achar('G5', no, 'copia process/import.meta para uma variável (use o módulo config/)')
      }
      // process/import.meta passados como argumento (Reflect.get(process, 'env'), Object.entries(import.meta)...)
      if (ts.isCallExpression(no)) {
        for (const arg of no.arguments) {
          if (ehProcess(arg) || ehImportMeta(arg)) achar('G5', arg, 'passa process/import.meta adiante (use o módulo config/)')
        }
      }

      // --- R1: endereço fixo em literal de texto ---
      if (ts.isStringLiteralLike(no) || ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no)) {
        if (!ts.isImportDeclaration(no.parent) && !ts.isExportDeclaration(no.parent) && ENDERECO_FIXO.test(no.text)) {
          achar('R1', no, `endereço fixo "${no.text.slice(0, 60)}" (leia de config/)`)
        }
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(fonte)
  return achados
}

const todos = []
for (const alvo of ALVOS) {
  for (const rel of listar(alvo.dir)) {
    todos.push(...verificar(rel.split(sep).join('/'), alvo.config))
  }
}
for (const a of todos) console.log(a)
if (todos.length === 0) console.log('check-source: nenhum achado (G5, R1).')
process.exitCode = todos.length ? 1 : 0
