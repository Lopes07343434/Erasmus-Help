import { expect, test } from '@playwright/test'
import { newUser, shownId } from './support/app'

test('creating an account gives a sequential, permanent public ID shown in the profile', async ({ browser }) => {
  const first = await newUser(browser, { name: 'Conta Primeira', role: 'Aluno' })
  const second = await newUser(browser, { name: 'Conta Segunda', role: 'Monitor' })

  // Sequential and unique: the next account gets the next number.
  expect(second.publicId).toBe(first.publicId + 1)

  // Shown as "ID: 07" (two digits up to 9) and copyable.
  await expect(second.page.getByText(`ID: ${shownId(second.publicId)}`, { exact: true }).first()).toBeVisible()
  await expect(second.page.getByRole('button', { name: /Copiar/ }).first()).toBeVisible()

  // Permanent: reloading (same device, same account) keeps the same ID.
  await first.page.reload()
  await expect(first.page.getByText(`ID: ${shownId(first.publicId)}`, { exact: true }).first()).toBeVisible()

  expect(first.errors).toEqual([])
  expect(second.errors).toEqual([])
  await first.context.close()
  await second.context.close()
})
