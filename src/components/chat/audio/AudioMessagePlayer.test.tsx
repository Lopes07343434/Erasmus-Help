import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderUi, setupUiTests } from '@/components/ui/testUtils'
import { createAudioPlayerController } from '@/hooks/useAudioPlayer'
import { FakeAudioElement } from '@/services/audio/testUtils'
import { AudioMessagePlayer } from './AudioMessagePlayer'

setupUiTests()

function setup() {
  const audio = new FakeAudioElement()
  const controller = createAudioPlayerController({ createAudio: () => audio.asElement() })
  return { audio, controller }
}

describe('AudioMessagePlayer', () => {
  it('shows the stored duration before playing, with an accessible slider', () => {
    const { controller } = setup()
    renderUi(<AudioMessagePlayer id="m1" src="https://cdn/m1.webm" durationMs={7400} tone="other" controller={controller} />)
    expect(screen.getByRole('button', { name: 'Reproduzir mensagem de voz' })).toBeInTheDocument()
    expect(screen.getByTestId('audio-elapsed')).toHaveTextContent('0:00')
    expect(screen.getByTestId('audio-total')).toHaveTextContent('0:07')
    const slider = screen.getByRole('slider', { name: 'Posição na mensagem de voz' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '7')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
    expect(slider).toHaveAttribute('aria-valuetext', '0 segundos de 7 segundos')
  })

  it('plays and pauses from the button (loading → playing → paused)', async () => {
    const user = userEvent.setup()
    const { audio, controller } = setup()
    renderUi(<AudioMessagePlayer id="m1" src="https://cdn/m1.webm" durationMs={7000} tone="own" controller={controller} />)
    await user.click(screen.getByRole('button', { name: 'Reproduzir mensagem de voz' }))
    expect(audio.play).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'A carregar o áudio…' })).toHaveAttribute('aria-busy', 'true')

    act(() => audio.fire('playing'))
    act(() => {
      audio.currentTime = 3.2
      audio.fire('timeupdate')
    })
    expect(screen.getByTestId('audio-elapsed')).toHaveTextContent('0:03')
    await user.click(screen.getByRole('button', { name: 'Pausar mensagem de voz' }))
    expect(audio.pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reproduzir mensagem de voz' })).toBeInTheDocument()
  })

  it('seeks ±5 s with the arrow keys, Home and End', async () => {
    const user = userEvent.setup()
    const { controller } = setup()
    renderUi(<AudioMessagePlayer id="m1" src="https://cdn/m1.webm" durationMs={102_000} tone="other" controller={controller} />)
    const slider = screen.getByRole('slider')
    slider.focus()
    await user.keyboard('{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '5')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '15')
    await user.keyboard('{ArrowLeft}')
    expect(slider).toHaveAttribute('aria-valuenow', '10')
    expect(slider).toHaveAttribute('aria-valuetext', '10 segundos de 1 minuto e 42 segundos')
    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuenow', '102')
    await user.keyboard('{Home}')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
    await user.keyboard('{ArrowLeft}')
    expect(slider).toHaveAttribute('aria-valuenow', '0') // clamped
  })

  it('resolves the signed URL only on the first play', async () => {
    const user = userEvent.setup()
    const { audio, controller } = setup()
    const resolve = vi.fn(() => Promise.resolve('https://signed/m1?token=abc'))
    renderUi(<AudioMessagePlayer id="m1" src={resolve} durationMs={4000} tone="other" controller={controller} />)
    expect(resolve).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reproduzir mensagem de voz' }))
    expect(resolve).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(audio.src).toBe('https://signed/m1?token=abc'))
    expect(audio.play).toHaveBeenCalledOnce()
  })

  it('shows an error with a retry button when the audio cannot be played', async () => {
    const user = userEvent.setup()
    const { audio, controller } = setup()
    renderUi(<AudioMessagePlayer id="m1" src="https://cdn/m1.webm" durationMs={4000} tone="other" controller={controller} />)
    await user.click(screen.getByRole('button', { name: 'Reproduzir mensagem de voz' }))
    act(() => {
      audio.error = { code: 4 }
      audio.fire('error')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Este dispositivo não consegue reproduzir este formato de áudio.')
    await user.click(screen.getByRole('button', { name: 'Tentar reproduzir outra vez' }))
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('starting another message pauses the one that was playing', async () => {
    const user = userEvent.setup()
    const { audio, controller } = setup()
    renderUi(
      <>
        <AudioMessagePlayer id="a" src="https://cdn/a.webm" durationMs={9000} tone="own" controller={controller} />
        <AudioMessagePlayer id="b" src="https://cdn/b.webm" durationMs={9000} tone="other" controller={controller} />
      </>,
    )
    const [playA, playB] = screen.getAllByRole('button', { name: 'Reproduzir mensagem de voz' })
    if (!playA || !playB) throw new Error('missing buttons')
    await user.click(playA)
    act(() => audio.fire('playing'))
    expect(screen.getAllByRole('button', { name: 'Pausar mensagem de voz' })).toHaveLength(1)

    await user.click(playB)
    act(() => audio.fire('playing'))
    expect(audio.src).toBe('https://cdn/b.webm')
    const pauseButtons = screen.getAllByRole('button', { name: 'Pausar mensagem de voz' })
    expect(pauseButtons).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Reproduzir mensagem de voz' })[0]).toBe(playA)
  })
})
