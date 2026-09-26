import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page, type TestInfo } from '@playwright/test'

/**
 * Helpers for the chat end-to-end tests. Everything goes through the real UI and the real local Supabase stack;
 * the only stub is Open-Meteo (city search / weather), which the chat does not depend on.
 */

const LISBOA = {
  id: 2267057,
  name: 'Lisboa',
  latitude: 38.72,
  longitude: -9.13,
  country_code: 'PT',
  country: 'Portugal',
  admin1: 'Lisboa',
  timezone: 'Europe/Lisbon',
  population: 517802,
}

export interface Person {
  name: string
  role: 'Aluno' | 'Monitor'
}

export interface User extends Person {
  context: BrowserContext
  page: Page
  /** The public ID shown in the profile ("ID: 07" → 7). */
  publicId: number
  /** Console errors / uncaught exceptions seen on this page. */
  errors: string[]
}

async function stubThirdParties(context: BrowserContext): Promise<void> {
  await context.route(/open-meteo\.com/, (route) =>
    route.request().url().includes('geocoding') ? route.fulfill({ json: { results: [LISBOA] } }) : route.fulfill({ status: 503, json: {} }),
  )
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Open-Meteo is stubbed with 503 on purpose (weather card shows its error state).
    if (text.includes('503')) return
    errors.push(text)
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

/** First run of the app: splash → intro (skipped) → name → role → language → location → notifications (not now). */
export async function onboard(page: Page, { name, role }: Person): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /Erasmus Help/ }).click()
  await page.getByRole('button', { name: 'Saltar' }).click()
  await page.getByRole('textbox', { name: 'Nome' }).fill(name)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: new RegExp(`^${role}`) }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: 'Português' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: /País/ }).click()
  await page.getByRole('textbox', { name: 'Pesquisar país' }).fill('Portugal')
  await page.getByRole('option', { name: 'Portugal' }).click()
  await page.getByRole('textbox', { name: 'Cidade' }).fill('Lisboa')
  await page.getByRole('option', { name: 'Lisboa' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Agora não' }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** Reads the user's public ID from the profile once the chat account exists. */
export async function readMyPublicId(page: Page): Promise<number> {
  await page.goto('/profile')
  const label = page.getByText(/^ID: \d+$/).first()
  await expect(label).toBeVisible()
  const text = (await label.textContent()) ?? ''
  const id = Number(/\d+/.exec(text)?.[0])
  expect(Number.isSafeInteger(id) && id >= 1).toBe(true)
  return id
}

/** The project's context options (mobile / desktop), for contexts created outside the `page` fixture. */
export function contextOptions(testInfo: TestInfo): BrowserContextOptions {
  const { baseURL, locale, timezoneId, viewport, hasTouch } = testInfo.project.use
  return { baseURL, locale, timezoneId, viewport, hasTouch }
}

/** A new person on their own device (separate browser context = separate anonymous chat account). */
export async function newUser(browser: Browser, person: Person, options: BrowserContextOptions): Promise<User> {
  const context = await browser.newContext(options)
  await stubThirdParties(context)
  const page = await context.newPage()
  const errors = collectErrors(page)
  await onboard(page, person)
  const publicId = await readMyPublicId(page)
  return { ...person, context, page, publicId, errors }
}

/** "7" → "07", 15 → "15" (how the app shows IDs). */
export const shownId = (n: number): string => String(n).padStart(2, '0')

/** Message bubbles of the open conversation (each has id="msg-<uuid>"). */
export const bubbles = (page: Page): Locator => page.locator('[id^="msg-"]')

export const bubble = (page: Page, text: string): Locator => bubbles(page).filter({ hasText: text })

/** Types in the composer and taps "Enviar mensagem" (on touch screens Enter adds a new line). */
export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Mensagem' }).fill(text)
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await expect(bubble(page, text)).toBeVisible()
}

/** A conversation / group row of the Chat list. */
export const conversationRow = (page: Page, name: string | RegExp): Locator =>
  page.getByRole('link', { name: typeof name === 'string' ? new RegExp(`^${name}`) : name })
