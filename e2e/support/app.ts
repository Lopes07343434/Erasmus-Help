import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

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

/** A new person on their own device (separate browser context = separate anonymous chat account). */
export async function newUser(browser: Browser, person: Person, viewport?: { width: number; height: number }): Promise<User> {
  const context = await browser.newContext(viewport ? { viewport } : {})
  await stubThirdParties(context)
  const page = await context.newPage()
  const errors = collectErrors(page)
  await onboard(page, person)
  const publicId = await readMyPublicId(page)
  return { ...person, context, page, publicId, errors }
}

/** "7" → "07", 15 → "15" (how the app shows IDs). */
export const shownId = (n: number): string => String(n).padStart(2, '0')
