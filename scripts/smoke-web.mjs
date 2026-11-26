#!/usr/bin/env node
// Smoke test do front DESTA cópia, headless (sem abrir navegador): login do cliente, chamado novo
// triado em até 15s e anexo .txt gravado na pasta de anexos da cópia. Uso: npm run smoke (com a cópia no ar).
// Primeira vez na máquina: npx playwright install chromium
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let estado
try {
  estado = Object.fromEntries(
    readFileSync(join(ROOT, '.harness/estado.env'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^'|'$/g, '')]),
  )
} catch {
  console.error('smoke: esta cópia não está no ar. Rode "npm run up" antes.')
  process.exit(2)
}
const front = `http://localhost:${estado.WEB_PORT}`
const anexos = join(ROOT, '.harness/uploads')

let browser
try {
  browser = await chromium.launch()
} catch (err) {
  console.error(`smoke: não consegui abrir o Chromium headless (${err.message.split('\n')[0]}).`)
  console.error('Rode uma vez: npx playwright install chromium')
  process.exit(2)
}

let falhou = false
const passo = (ok, msg) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${msg}`)
  if (!ok) falhou = true
}

try {
  const page = await browser.newPage()
  await page.goto(`${front}/login`)
  await page.getByLabel('E-mail').fill('cliente@balcao.dev')
  await page.getByLabel('Senha').fill('Cliente@123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/tickets')
  passo(true, `login do cliente em ${front}`)

  const titulo = `Fatura em dobro, urgente (smoke ${Date.now()})`
  await page.goto(`${front}/tickets/new`)
  await page.getByLabel('Título').fill(titulo)
  await page.getByLabel('Descrição').fill('Paguei duas vezes a mesma fatura.')
  await page.getByRole('button', { name: 'Abrir chamado' }).click()
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}$/)
  try {
    await page.getByText('Financeiro / prioridade Urgente').waitFor({ timeout: 15000 })
    passo(true, 'chamado triado como "Financeiro / prioridade Urgente"')
  } catch {
    passo(false, 'chamado não saiu de "Em triagem" em 15s (o worker está no ar? veja .harness/logs/worker.log)')
  }

  const antes = new Set(readdirSync(anexos))
  const pasta = mkdtempSync(join(tmpdir(), 'balcao-smoke-'))
  const arquivo = join(pasta, 'smoke.txt')
  writeFileSync(arquivo, `smoke ${titulo}\n`)
  await page.locator('input[type=file]').setInputFiles(arquivo)
  await page.getByRole('button', { name: 'Enviar anexo' }).click()
  await page.getByText(/smoke\.txt \(\d+ B\)/).waitFor({ timeout: 5000 })
  const novos = readdirSync(anexos).filter((f) => !antes.has(f))
  passo(novos.length === 1, `anexo gravado em ${anexos}${novos.length ? ` (${novos[0]})` : ''}`)
} catch (err) {
  passo(false, err.message.split('\n')[0])
} finally {
  await browser.close()
}
process.exit(falhou ? 1 : 0)
