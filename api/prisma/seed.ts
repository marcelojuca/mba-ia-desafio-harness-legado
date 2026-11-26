import { Prisma, PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Idempotente: rodar de novo não duplica nada e garante que as três contas entram com as senhas abaixo.
// O `npm run up` roda a seed em toda subida.
async function upsertUser(name: string, email: string, password: string, role: 'admin' | 'agent' | 'customer') {
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role },
  })
}

async function createTicketOnce(data: Prisma.TicketUncheckedCreateInput) {
  const existing = await prisma.ticket.findFirst({ where: { title: data.title, customerId: data.customerId } })
  if (!existing) await prisma.ticket.create({ data })
}

async function main() {
  const admin = await upsertUser('Admin', 'admin@balcao.dev', 'Admin@123', 'admin')
  const agent = await upsertUser('Ana Atendente', 'agente@balcao.dev', 'Agente@123', 'agent')
  const customer = await upsertUser('Carlos Cliente', 'cliente@balcao.dev', 'Cliente@123', 'customer')

  await createTicketOnce({
    title: 'Não consigo emitir a segunda via do boleto',
    description: 'Quando clico em segunda via aparece uma tela em branco. Preciso pagar até sexta.',
    customerId: customer.id,
  })

  await createTicketOnce({
    title: 'Erro ao salvar o perfil',
    description: 'Ao alterar o telefone no perfil aparece a mensagem "erro inesperado".',
    status: 'in_progress',
    category: 'technical',
    priority: 'medium',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [{ authorId: agent.id, body: 'Oi, Carlos! Já estamos olhando o problema.' }],
    },
  })

  await createTicketOnce({
    title: 'Dúvida sobre troca de senha',
    description: 'Qual o tamanho mínimo de senha que o sistema aceita?',
    status: 'resolved',
    category: 'account',
    priority: 'low',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [
        { authorId: agent.id, body: 'A senha precisa ter pelo menos 8 caracteres.' },
        { authorId: customer.id, body: 'Obrigado!' },
      ],
    },
  })

  console.log(`seed ok: ${admin.email}, ${agent.email}, ${customer.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
