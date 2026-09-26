import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderUi, setupUiTests } from '@/components/ui/testUtils'
import { AudioRecorderBar, type AudioRecorderBarProps } from './AudioRecorderBar'

setupUiTests()

function renderBar(props: Partial<AudioRecorderBarProps> = {}) {
  const onStop = vi.fn()
  const onCancel = vi.fn()
  renderUi(<AudioRecorderBar status="recording" elapsedMs={7000} levels={[0, 0.5, 1]} onStop={onStop} onCancel={onCancel} {...props} />)
  return { onStop, onCancel }
}

describe('AudioRecorderBar', () => {
  it('shows that recording is active with a timer and a live level meter', () => {
    renderBar()
    expect(screen.getAllByText('A gravar')).toHaveLength(2) // visible label (aria-hidden) + live region
    expect(screen.getByTestId('audio-recorder-timer')).toHaveTextContent('0:07')
    const bars = screen.getByTestId('audio-level-bars').children
    expect(bars).toHaveLength(3)
    expect((bars[0] as HTMLElement).style.transform).toBe('scaleY(0.140)') // silence keeps a minimum height
    expect((bars[2] as HTMLElement).style.transform).toBe('scaleY(1.000)')
    expect(screen.getByRole('status')).toHaveTextContent('A gravar')
  })

  it('cancel and send buttons call the parent', async () => {
    const user = userEvent.setup()
    const { onStop, onCancel } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Cancelar gravação' }))
    expect(onCancel).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem de voz' }))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it("stopAction='stop' labels the button as stop", () => {
    renderBar({ stopAction: 'stop' })
    expect(screen.getByRole('button', { name: 'Parar gravação' })).toBeEnabled()
  })

  it('announces the elapsed time only every 15 s (throttled live region)', () => {
    renderBar({ elapsedMs: 31_000 })
    expect(screen.getByRole('status')).toHaveTextContent('A gravar: 0:30')
  })

  it('warns when approaching the 2-minute limit', () => {
    renderBar({ elapsedMs: 112_300 })
    expect(screen.getByText('Faltam 8 s')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Limite de 2 minutos. A gravação termina automaticamente dentro de 10 segundos')
  })

  it('while requesting, sending is disabled; while stopping, cancel is disabled and send is busy', () => {
    const { unmount } = renderUi(<AudioRecorderBar status="requesting" elapsedMs={0} levels={[]} onStop={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Enviar mensagem de voz' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar gravação' })).toBeEnabled()
    unmount()

    renderBar({ status: 'stopping' })
    expect(screen.getByRole('button', { name: 'Cancelar gravação' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enviar mensagem de voz' })).toHaveAttribute('aria-busy', 'true')
  })
})
