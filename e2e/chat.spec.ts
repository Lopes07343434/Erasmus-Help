import { expect, test } from '@playwright/test'
import { bubble, contextOptions, conversationRow, newUser, sendMessage, shownId, type User } from './support/app'

/**
 * The whole chat flow with four real accounts on four "devices", against the real local Supabase stack:
 * add by ID → direct chat both ways in real time → group created by IDs → group messages with authors →
 * add / remove members, promote an administrator → a removed member loses access.
 * Tests share the accounts and run in order.
 */
test.describe.configure({ mode: 'serial' })

/** Names are unique per run (the local database keeps earlier runs' accounts). Letters only: never read as an ID. */
const RUN = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')

let samuel: User
let ana: User
let joao: User
let pedro: User
let groupUrl = ''
const GROUP = `Erasmus Portugal ${RUN}`

test.beforeAll(async ({ browser }, testInfo) => {
  const options = contextOptions(testInfo)
  samuel = await newUser(browser, { name: `Samuel Lopes ${RUN}`, role: 'Monitor' }, options)
  ana = await newUser(browser, { name: `Ana Silva ${RUN}`, role: 'Aluno' }, options)
  joao = await newUser(browser, { name: `João Costa ${RUN}`, role: 'Aluno' }, options)
  pedro = await newUser(browser, { name: `Pedro Martins ${RUN}`, role: 'Aluno' }, options)
})

test.afterAll(async () => {
  for (const user of [samuel, ana, joao, pedro]) await user?.context.close()
})

test.afterEach(() => {
  // No console errors / uncaught exceptions on any device during the test.
  for (const user of [samuel, ana, joao, pedro]) expect(user.errors, `${user.name}: console errors`).toEqual([])
})

test('accounts get consecutive IDs', () => {
  expect([ana.publicId, joao.publicId, pedro.publicId]).toEqual([samuel.publicId + 1, samuel.publicId + 2, samuel.publicId + 3])
})

test('search by ID and by name', async () => {
  const page = samuel.page
  await page.goto('/chat')
  const search = page.getByRole('searchbox', { name: 'Pesquisar no chat' })

  await search.fill(shownId(ana.publicId))
  const anaResult = page.getByRole('button', { name: `Abrir conversa com ${ana.name}` })
  await expect(anaResult).toHaveAccessibleDescription(`${shownId(ana.publicId)} — ${ana.name} — Aluno`)
  await expect(anaResult).toContainText('ID exato')

  await search.fill(`joao costa ${RUN.toLowerCase()}`) // accent- and case-insensitive
  await expect(page.getByRole('button', { name: `Abrir conversa com ${joao.name}` })).toBeVisible()

  await search.fill('Ninguém Existe')
  await expect(page.getByText('Sem resultados para «Ninguém Existe».')).toBeVisible()
  await search.fill('')
})

test('Adicionar pessoa by ID → direct chat in real time, both ways', async () => {
  // Ana is looking at her (empty) chat list when Samuel adds her.
  await ana.page.goto('/chat')
  await expect(ana.page.getByText('Ainda não tens conversas.')).toBeVisible()

  const page = samuel.page
  await page.goto('/chat')
  await page.getByRole('button', { name: 'Adicionar pessoa' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Adicionar pessoa' })
  await sheet.getByRole('searchbox', { name: 'Introduzir ID' }).fill(shownId(ana.publicId))
  await expect(sheet.getByText('Utilizador encontrado')).toBeVisible()
  await sheet.getByRole('button', { name: `Adicionar ${ana.name} e abrir a conversa` }).click()

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  // Conversation header (h1 on mobile, h2 next to the list on desktop): name + "ID: 08".
  const header = page.locator('header').filter({ has: page.getByRole('heading', { name: ana.name }) })
  await expect(header.getByText(`ID: ${shownId(ana.publicId)}`, { exact: true })).toBeVisible()
  await sendMessage(page, 'Olá!')

  // Ana: the conversation appears in her list without reloading, with the unread message.
  const row = conversationRow(ana.page, samuel.name)
  await expect(row).toBeVisible()
  await expect(row).toHaveAccessibleName(/1 mensagem não lida/)
  await expect(row).toHaveAccessibleName(/Olá!/)
  await row.click()
  await expect(bubble(ana.page, 'Olá!')).toBeVisible()
  await sendMessage(ana.page, 'Olá, tudo bem?')

  // Samuel receives the answer in real time.
  await expect(bubble(page, 'Olá, tudo bem?')).toBeVisible()
  // Read receipt: Ana opened the conversation.
  await expect(bubble(page, 'Olá!').getByRole('img', { name: 'Lida' })).toBeVisible()
})

test('Criar grupo with participants picked by ID → group messages reach every member with the author', async () => {
  await ana.page.goto('/chat?tab=grupos')
  await joao.page.goto('/chat?tab=grupos')

  const page = samuel.page
  await page.goto('/chat?tab=grupos')
  await page.getByRole('button', { name: 'Criar grupo' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Criar grupo' })
  await sheet.getByRole('textbox', { name: 'Nome do grupo' }).fill(GROUP)
  const participants = sheet.getByRole('searchbox', { name: 'Adicionar participantes' })
  for (const person of [ana, joao]) {
    await participants.fill(shownId(person.publicId))
    await sheet.getByRole('checkbox', { name: new RegExp(`^${shownId(person.publicId)} — ${person.name}`) }).click()
  }
  await expect(sheet.getByText('2 selecionados')).toBeVisible()
  await sheet.getByRole('button', { name: 'Criar grupo' }).click()

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/)
  groupUrl = new URL(page.url()).pathname
  await expect(page.getByRole('button', { name: new RegExp(`Informações do grupo: ${GROUP}, 3 participantes`) })).toBeVisible()
  await sendMessage(page, 'Olá pessoal')

  for (const member of [ana, joao]) {
    const row = conversationRow(member.page, GROUP)
    await expect(row).toBeVisible()
    await row.click()
    const message = bubble(member.page, 'Olá pessoal')
    await expect(message).toBeVisible()
    await expect(message).toContainText(`${samuel.name} · ${shownId(samuel.publicId)}`)
  }

  await sendMessage(ana.page, 'Quando chegamos?')
  await expect(bubble(page, 'Quando chegamos?')).toContainText(`${ana.name} · ${shownId(ana.publicId)}`)
  await expect(bubble(joao.page, 'Quando chegamos?')).toBeVisible()
})

test('group administrator adds and removes members and promotes another administrator', async () => {
  await pedro.page.goto('/chat?tab=grupos')
  const page = samuel.page
  await page.goto(groupUrl)
  await page.getByRole('button', { name: 'Informações do grupo' }).last().click()
  let info = page.getByRole('dialog', { name: GROUP })
  await expect(info.getByText('3 participantes')).toBeVisible()
  await expect(info.getByText('Administrador').first()).toBeVisible()

  // Add Pedro by ID.
  await info.getByRole('button', { name: 'Adicionar membro' }).click()
  const add = page.getByRole('dialog', { name: 'Adicionar membro' })
  await add.getByRole('searchbox').fill(shownId(pedro.publicId))
  await add.getByRole('button', { name: `Adicionar ${pedro.name} ao grupo` }).click()
  info = page.getByRole('dialog', { name: GROUP })
  await expect(info.getByText('4 participantes')).toBeVisible()
  // Pedro sees the group appear without reloading.
  await expect(conversationRow(pedro.page, GROUP)).toBeVisible()

  // Remove João.
  await joao.page.goto('/chat?tab=grupos')
  await expect(conversationRow(joao.page, GROUP)).toBeVisible()
  await info.getByRole('button', { name: new RegExp(joao.name) }).click()
  const joaoSheet = page.getByRole('dialog', { name: `Opções para ${joao.name}` })
  await joaoSheet.getByRole('button', { name: 'Remover do grupo' }).click()
  await page.getByRole('dialog', { name: 'Remover do grupo?' }).getByRole('button', { name: 'Remover' }).click()
  info = page.getByRole('dialog', { name: GROUP })
  await expect(info.getByText('3 participantes')).toBeVisible()
  await expect(conversationRow(joao.page, GROUP)).toHaveCount(0)

  // Make Ana an administrator: she now gets the management actions.
  await info.getByRole('button', { name: new RegExp(ana.name) }).click()
  await page.getByRole('dialog', { name: `Opções para ${ana.name}` }).getByRole('button', { name: 'Tornar administrador' }).click()
  await expect(page.getByText(`${ana.name} é agora administrador do grupo`)).toBeVisible()

  await ana.page.goto(groupUrl)
  await ana.page.getByRole('button', { name: 'Informações do grupo' }).last().click()
  await expect(ana.page.getByRole('dialog', { name: GROUP }).getByRole('button', { name: 'Adicionar membro' })).toBeVisible()

  // Pedro (plain member) has no management actions.
  await pedro.page.goto(groupUrl)
  await pedro.page.getByRole('button', { name: 'Informações do grupo' }).last().click()
  const pedroInfo = pedro.page.getByRole('dialog', { name: GROUP })
  await expect(pedroInfo.getByText('3 participantes')).toBeVisible()
  await expect(pedroInfo.getByRole('button', { name: 'Adicionar membro' })).toHaveCount(0)
})

test('someone who is not a member cannot open the group', async () => {
  await joao.page.goto(groupUrl)
  await expect(joao.page.getByText('Conversa não encontrada')).toBeVisible()
  await expect(bubble(joao.page, 'Olá pessoal')).toHaveCount(0)
})

test('profile photo: upload to Storage, shown to other people, removable', async () => {
  const page = samuel.page
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Adicionar foto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Foto de perfil' })
  // A real picture: resized/re-encoded in the browser and uploaded to the public `avatars` bucket.
  await sheet.locator('input[type="file"]').setInputFiles('public/brand/pwa-512x512.png')
  await expect(page.getByText('Foto de perfil atualizada')).toBeVisible()
  const photo = page.locator('main img[src*="/storage/v1/object/public/avatars/users/"]').first()
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512)

  // Ana sees Samuel's photo in her conversation list.
  await ana.page.goto('/chat')
  await expect(conversationRow(ana.page, samuel.name).locator('img[src*="/avatars/users/"]')).toBeVisible()

  await page.getByRole('button', { name: 'Mudar foto' }).click()
  await page.getByRole('dialog', { name: 'Foto de perfil' }).getByRole('button', { name: 'Remover foto' }).click()
  await expect(page.getByText('Foto de perfil removida')).toBeVisible()
  await expect(page.locator('main img[src*="/avatars/users/"]')).toHaveCount(0)
})

test('screens for review', async ({}, testInfo) => {
  await samuel.page.goto('/chat')
  await expect(conversationRow(samuel.page, ana.name)).toBeVisible()
  await samuel.page.screenshot({ path: testInfo.outputPath('chat-list.png') })
  await samuel.page.goto(groupUrl)
  await expect(bubble(samuel.page, 'Quando chegamos?')).toBeVisible()
  await samuel.page.screenshot({ path: testInfo.outputPath('group.png') })
  await samuel.page.goto('/profile')
  await expect(samuel.page.getByText(`ID: ${shownId(samuel.publicId)}`).first()).toBeVisible()
  await samuel.page.screenshot({ path: testInfo.outputPath('profile.png') })
})
