import { describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toastContext'
import { renderUi, setupUiTests } from './testUtils'

setupUiTests()

function Trigger() {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show('Tradução copiada')}>
      go
    </button>
  )
}

describe('ToastProvider', () => {
  it('announces the message in a polite live region and hides it after 1.9s', () => {
    vi.useFakeTimers()
    try {
      renderUi(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      )
      const region = screen.getByRole('status')
      expect(region).toHaveAttribute('aria-live', 'polite')
      expect(region).toBeEmptyDOMElement()

      act(() => screen.getByRole('button', { name: 'go' }).click())
      expect(region).toHaveTextContent('Tradução copiada')

      act(() => vi.advanceTimersByTime(1899))
      expect(region).toHaveTextContent('Tradução copiada')
      act(() => vi.advanceTimersByTime(1))
      expect(region).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })
})
