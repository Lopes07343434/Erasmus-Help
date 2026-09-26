// Test-only helpers for the design-system tests (not imported by app code).
import { createElement, type ReactNode } from 'react'
import { cleanup, render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { loadMessages } from '@/i18n/catalog'
import { useSettingsStore } from '@/stores/settingsStore'

/** Registers pt-PT messages before the suite and DOM cleanup after each test (vitest runs without globals). */
export function setupUiTests() {
  beforeAll(async () => {
    useSettingsStore.setState({ appLanguage: 'pt-PT' })
    await loadMessages('pt-PT')
  })
  afterEach(() => cleanup())
}

function Providers({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

/** Renders inside MemoryRouter + I18nProvider (pt-PT). */
export function renderUi(ui: ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options })
}
