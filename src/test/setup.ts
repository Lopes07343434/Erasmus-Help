import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library's auto-cleanup is not registered: do it for every test file.
afterEach(() => cleanup())

// Parallel runs slow jsdom down; the 1 s default made chained async assertions flaky.
configure({ asyncUtilTimeout: 3000 })
