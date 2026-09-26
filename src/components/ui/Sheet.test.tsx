import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OptionList } from './OptionList'
import { Sheet } from './Sheet'
import { renderUi, setupUiTests } from './testUtils'

setupUiTests()

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState<'pt' | 'en' | 'pl'>('en')
  const close = () => {
    onClose?.()
    setOpen(false)
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Sheet open={open} onClose={close} title="Idioma">
        <OptionList
          aria-label="Idioma"
          value={lang}
          onChange={(v) => {
            setLang(v)
            close()
          }}
          options={[
            { value: 'pt', label: 'Português', badge: 'PT' },
            { value: 'en', label: 'Inglês', badge: 'EN' },
            { value: 'pl', label: 'Polaco', badge: 'PL' },
          ]}
        />
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
  it('opens as a labelled modal dialog, focuses the selected option and locks page scroll', async () => {
    const user = userEvent.setup()
    renderUi(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    const dialog = screen.getByRole('dialog', { name: 'Idioma' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('option', { name: 'Inglês' })).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('closes on Escape, restores focus to the trigger and unlocks scroll', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderUi(<Harness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Abrir' })
    await user.click(trigger)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('closes from the localized close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderUi(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    renderUi(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog')

    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('OptionList: arrows move focus without selecting, Enter selects', async () => {
    const user = userEvent.setup()
    renderUi(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Polaco' })).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Português' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('option', { name: 'Português' })).toHaveAttribute('aria-selected', 'true')
  })
})
