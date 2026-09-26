import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderUi, setupUiTests } from '@/components/ui/testUtils'
import { MicButton } from './MicButton'

setupUiTests()

describe('MicButton', () => {
  it('is a 44px named toggle button that starts recording on click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderUi(<MicButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Gravar mensagem de voz' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveClass('size-11')
    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('reflects recording, requesting and disabled states', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = renderUi(<MicButton recording onClick={onClick} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')

    rerender(<MicButton requesting onClick={onClick} />)
    expect(screen.getByRole('button', { name: 'A pedir acesso ao microfone…' })).toHaveAttribute('aria-busy', 'true')

    rerender(<MicButton disabled onClick={onClick} />)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
