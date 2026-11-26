#!/usr/bin/env node
// Utilitários portáveis (Linux e macOS, só Node) usados por scripts/up.sh e scripts/down.sh.
//   free-port <inicio> [ocupada...]        imprime a primeira porta livre a partir de <inicio>
//   port-free <porta>                      sai 0 se a porta está livre
//   spawn <log> <pidfile> <cwd> <cmd...>   inicia em segundo plano, num grupo de processos próprio
//                                          (com BALCAO_ENV_FILE=<arquivo>, carrega esse .env no filho)
//   wait-http <url> <segundos>             espera a URL responder 2xx
//   set-env <arquivo> <modelo|-> K=V...    cria <arquivo> a partir de <modelo> (- = vazio) e grava as chaves
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { parseEnv } from 'node:util'

const [, , comando, ...args] = process.argv

function conecta(porta, host) {
  return new Promise((done) => {
    const s = net.connect({ port: porta, host })
    s.setTimeout(400)
    s.once('connect', () => {
      s.destroy()
      done(true)
    })
    s.once('timeout', () => {
      s.destroy()
      done(false)
    })
    s.once('error', () => done(false))
  })
}

function escuta(porta, host) {
  return new Promise((done) => {
    const srv = net.createServer()
    srv.once('error', (err) => done(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'))
    srv.listen({ port: porta, host, exclusive: true }, () => srv.close(() => done(true)))
  })
}

async function portaLivre(porta) {
  if ((await conecta(porta, '127.0.0.1')) || (await conecta(porta, '::1'))) return false
  for (const host of ['0.0.0.0', '127.0.0.1', '::']) {
    if (!(await escuta(porta, host))) return false
  }
  return true
}

async function main() {
  if (comando === 'port-free') {
    process.exit((await portaLivre(Number(args[0]))) ? 0 : 1)
  }
  if (comando === 'free-port') {
    const inicio = Number(args[0])
    const reservadas = new Set(args.slice(1).map(Number))
    for (let p = inicio; p < inicio + 500; p++) {
      if (!reservadas.has(p) && (await portaLivre(p))) {
        console.log(p)
        return
      }
    }
    console.error(`nenhuma porta livre entre ${inicio} e ${inicio + 499}`)
    process.exit(1)
  }
  if (comando === 'spawn') {
    const [log, pidfile, cwd, cmd, ...resto] = args
    const fd = openSync(log, 'a')
    // BALCAO_ENV_FILE: .env carregado aqui e passado ao filho. Não use --env-file nos argumentos:
    // o Node 22 interpreta --env-file mesmo depois do nome do script e procura o arquivo no cwd errado.
    const extra = process.env.BALCAO_ENV_FILE ? parseEnv(readFileSync(process.env.BALCAO_ENV_FILE, 'utf8')) : {}
    const env = { ...process.env, ...extra }
    delete env.BALCAO_ENV_FILE
    const filho = spawn(cmd, resto, { cwd, detached: true, stdio: ['ignore', fd, fd], env })
    writeFileSync(pidfile, `${filho.pid}\n`)
    filho.unref()
    return
  }
  if (comando === 'wait-http') {
    const [url, segundos] = args
    const limite = Date.now() + Number(segundos) * 1000
    while (Date.now() < limite) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (res.ok) return
      } catch {
        // ainda subindo
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    process.exit(1)
  }
  if (comando === 'set-env') {
    const [arquivo, modelo, ...pares] = args
    if (!existsSync(arquivo)) {
      if (modelo === '-') writeFileSync(arquivo, '')
      else copyFileSync(modelo, arquivo)
    }
    let linhas = readFileSync(arquivo, 'utf8').split('\n')
    for (const par of pares) {
      const i = par.indexOf('=')
      const chave = par.slice(0, i)
      const linha = `${chave}=${par.slice(i + 1)}`
      const pos = linhas.findIndex((l) => l.startsWith(`${chave}=`))
      if (pos >= 0) linhas[pos] = linha
      else {
        if (linhas.at(-1) === '') linhas.pop()
        linhas.push(linha, '')
      }
    }
    writeFileSync(arquivo, linhas.join('\n'))
    return
  }
  console.error(`comando desconhecido: ${comando}`)
  process.exit(2)
}

await main()
