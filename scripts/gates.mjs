#!/usr/bin/env node
// Gates do Balcão. Uso: `npm run gates` (tudo), `npm run gates -- G1 G2` (só essas regras),
// `npm run gates -- --verbose` (mostra a saída de todas as ferramentas, mesmo as que passaram).
// Roda todas as verificações, mesmo quando uma falha, e termina com a lista final:
// uma linha por violação, "<ID> <arquivo> <detalhe>". Sai com 1 se houver qualquer violação.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = mkdtempSync(join(tmpdir(), 'balcao-gates-'))
const bin = (pasta, nome) => join(ROOT, pasta, 'node_modules', '.bin', nome)
const rel = (p, base = ROOT) => relative(ROOT, isAbsolute(p) ? p : join(base, p)).split('\\').join('/')

function rodar(cmd, args, cwd = ROOT) {
  return new Promise((done) => {
    let saida = ''
    const filho = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' } })
    filho.stdout.on('data', (d) => (saida += d))
    filho.stderr.on('data', (d) => (saida += d))
    filho.on('error', (err) => done({ code: 127, saida: `${saida}\nnão consegui rodar ${cmd}: ${err.message}` }))
    filho.on('close', (code) => done({ code: code ?? 1, saida }))
  })
}

function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    return null
  }
}

// ---------- cada gate devolve { saida, violacoes: [[id, arquivo, detalhe]], falhou } ----------

async function tipos(projeto) {
  const { code, saida } = await rodar(bin(projeto, 'tsc'), ['-p', `${projeto}/tsconfig.json`, '--noEmit', '--pretty', 'false'])
  const violacoes = []
  for (const m of saida.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm)) {
    violacoes.push(['G1', rel(m[1]), `linha ${m[2]} ${m[3]}: ${m[4]}`])
  }
  return { saida, violacoes, falhou: code !== 0 }
}

async function lint() {
  const arquivo = join(TMP, 'eslint.json')
  const { code, saida } = await rodar(bin('.', 'eslint'), ['api', 'web', '--max-warnings', '0', '--format', 'json', '--output-file', arquivo])
  const violacoes = []
  for (const r of lerJson(arquivo) ?? []) {
    for (const m of r.messages) {
      violacoes.push(['G2', rel(r.filePath), `linha ${m.line} ${m.ruleId ?? 'eslint'}: ${m.message}`])
    }
  }
  return { saida: saida || violacoes.map((v) => v.join(' ')).join('\n'), violacoes, falhou: code !== 0 }
}

async function testes() {
  const arquivo = join(TMP, 'vitest.json')
  const api = join(ROOT, 'api')
  const { code, saida } = await rodar(bin('api', 'vitest'), ['run', '--reporter=default', '--reporter=json', `--outputFile.json=${arquivo}`], api)
  const violacoes = []
  for (const r of lerJson(arquivo)?.testResults ?? []) {
    if (r.status !== 'passed') violacoes.push(['G3', rel(r.name), 'teste falhando'])
  }
  return { saida, violacoes, falhou: code !== 0 }
}

async function dependencias() {
  const { code, saida } = await rodar(bin('.', 'depcruise'), [
    // Não use --exclude node_modules: ele apaga as arestas para pacotes npm e cega G4/G6/G7/R2.
    'api/src',
    'web/src',
    'web/vite.config.ts',
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ])
  const json = (() => {
    try {
      return JSON.parse(saida)
    } catch {
      return null
    }
  })()
  const violacoes = []
  const texto = []
  for (const v of json?.summary?.violations ?? []) {
    const id = v.rule.name.split('-')[0]
    const destino = v.cycle?.length ? `ciclo ${[v.from, ...v.cycle.map((c) => c.name ?? c)].join(' -> ')}` : `importa ${v.to}`
    violacoes.push([id, v.from, `${destino} (${v.rule.name})`])
    // Num ciclo, todos os arquivos dele entram na lista: qualquer um pode ser "o" arquivo da violação.
    for (const membro of v.cycle ?? []) violacoes.push([id, membro.name ?? membro, `${destino} (${v.rule.name})`])
    texto.push(`${v.rule.name}: ${v.from} -> ${v.to}`)
  }
  if (!json) texto.push(saida)
  // Guarda contra configuração que cega as regras: se nenhum import chega a node_modules (ex.: alguém
  // pôs --exclude node_modules), G4/G6/G7/R2 passariam em silêncio. Isso já aconteceu (docs/incidentes.md).
  const vePacotes = (json?.modules ?? []).some((m) => m.source.includes('node_modules/'))
  if (json && !vePacotes) {
    violacoes.push(['G7', '.dependency-cruiser.cjs', 'o cruiser não viu nenhum pacote npm: regras de pacote estão cegas'])
  }
  return { saida: texto.join('\n') || 'dependency-cruiser: nenhuma violação.', violacoes, falhou: code !== 0 || !json || !vePacotes }
}

async function fonte() {
  const { code, saida } = await rodar(process.execPath, [join(ROOT, 'scripts/gates/check-source.mjs')])
  const violacoes = []
  for (const m of saida.matchAll(/^(G5|R1) (\S+?):(\d+) (.*)$/gm)) violacoes.push([m[1], m[2], `linha ${m[3]} ${m[4]}`])
  return { saida, violacoes, falhou: code !== 0 }
}

const KNIP_DEPENDENCIA = ['dependencies', 'devDependencies', 'optionalPeerDependencies', 'binaries', 'unlisted', 'unresolved']
const KNIP_EXPORT = ['exports', 'types', 'nsExports', 'nsTypes', 'enumMembers', 'classMembers', 'duplicates']

async function semUso(projeto) {
  const { code, saida } = await rodar(bin('.', 'knip'), ['--directory', projeto, '--reporter', 'json', '--no-progress', '--no-config-hints'])
  const inicio = saida.indexOf('{')
  const json = (() => {
    try {
      return JSON.parse(saida.slice(inicio))
    } catch {
      return null
    }
  })()
  const base = join(ROOT, projeto)
  const violacoes = []
  for (const arq of json?.files ?? []) violacoes.push(['G10', rel(arq, base), 'arquivo sem uso'])
  for (const issue of json?.issues ?? []) {
    const arquivo = rel(issue.file, base)
    for (const f of issue.files ?? []) violacoes.push(['G10', rel(f.name ?? issue.file, base), 'arquivo sem uso'])
    for (const tipo of KNIP_DEPENDENCIA) {
      for (const d of issue[tipo] ?? []) violacoes.push(['G10', arquivo, `${d.name} (${tipo} sem uso/sem declaração)`])
    }
    for (const tipo of KNIP_EXPORT) {
      for (const e of issue[tipo] ?? []) {
        const nome = Array.isArray(e) ? e.map((x) => x.name).join(', ') : e.name
        violacoes.push(['G10', arquivo, `${tipo} sem uso: ${nome}`])
      }
    }
  }
  const texto = violacoes.map((v) => v.join(' ')).join('\n')
  return { saida: json ? texto || `knip (${projeto}): nada sem uso.` : saida, violacoes, falhou: code !== 0 || !json }
}

// ---------- orquestração ----------

const GATES = [
  { nome: 'G1 tipos (api)', ids: ['G1'], rodar: () => tipos('api') },
  { nome: 'G1 tipos (web)', ids: ['G1'], rodar: () => tipos('web') },
  { nome: 'G2 lint (api e web)', ids: ['G2'], rodar: lint },
  { nome: 'G3 testes unitários (api)', ids: ['G3'], rodar: testes },
  { nome: 'G4 G6 G7 G8 G9 R2 R3 dependências', ids: ['G4', 'G6', 'G7', 'G8', 'G9', 'R2', 'R3'], rodar: dependencias },
  { nome: 'G5 R1 env e endereço fixo', ids: ['G5', 'R1'], rodar: fonte },
  { nome: 'G10 sem uso (api)', ids: ['G10'], rodar: () => semUso('api') },
  { nome: 'G10 sem uso (web)', ids: ['G10'], rodar: () => semUso('web') },
]

const filtro = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase())
const escolhidos = filtro.length ? GATES.filter((g) => g.ids.some((id) => filtro.includes(id))) : GATES

const faltando = ['.', 'api', 'web'].filter((p) => !existsSync(join(ROOT, p, 'node_modules')))
if (faltando.length) {
  console.error(`gates: faltam dependências em ${faltando.join(', ')}. Rode "npm run up" ou "npm ci" nessas pastas.`)
  process.exit(2)
}

const inicio = Date.now()
const resultados = await Promise.all(
  escolhidos.map(async (g) => {
    const t = Date.now()
    const r = await g.rodar()
    return { ...g, ...r, segundos: ((Date.now() - t) / 1000).toFixed(1) }
  }),
)

// Saída completa só das ferramentas que falharam (ou de todas, com --verbose).
const verboso = process.argv.includes('--verbose')
for (const r of resultados) {
  if (!verboso && !r.falhou && r.violacoes.length === 0) continue
  console.log(`\n===== ${r.nome} (${r.segundos}s) =====`)
  console.log(r.saida.trim() || '(sem saída)')
}

const linhas = []
const vistas = new Set()
for (const r of resultados) {
  const lista = r.violacoes.length || !r.falhou ? r.violacoes : [[r.ids[0], r.nome, 'a ferramenta falhou sem lista; veja a saída acima']]
  for (const [id, arquivo, detalhe] of lista) {
    const linha = `${id} ${arquivo} ${detalhe}`.replace(/\s+/g, ' ').trim()
    if (!vistas.has(linha)) {
      vistas.add(linha)
      linhas.push(linha)
    }
  }
}

console.log('\n===== Resumo =====')
for (const r of resultados) {
  const ok = !r.falhou && r.violacoes.length === 0
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${r.nome}${ok ? '' : ` (${r.violacoes.length || '?'})`}`)
}
console.log(`tempo total: ${((Date.now() - inicio) / 1000).toFixed(1)}s`)

rmSync(TMP, { recursive: true, force: true })
if (linhas.length) {
  console.log(`\n===== Violações (${linhas.length}) =====`)
  for (const l of linhas) console.log(l)
  console.log('\nDetalhe de cada regra: docs/gates.md')
  process.exit(1)
}
console.log('\nGates: tudo passou.')
