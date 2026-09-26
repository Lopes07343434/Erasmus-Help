import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Moon } from 'lucide-react'
import { ListGroup, ListSwitchRow } from './List'
import { Switch } from './Switch'
import { renderUi, setupUiTests } from './testUtils'

setupUiTests()

function Controlled({ onChange }: { onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(false)
  return (
    <Switch
      aria-label="Modo escuro"
      checked={on}
      onCheckedChange={(v) => {
        setOn(v)
        onChange?.(v)
      }}
    />
  )
}

describe('Switch', () => {
  it('exposes role="switch" with aria-checked and toggles on click and keyboard', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderUi(<Controlled onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Modo escuro' })
    expect(sw).toHaveAttribute('aria-checked', 'false')

    await user.click(sw)
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(sw).toHaveAttribute('aria-checked', 'true')

    sw.focus()
    await user.keyboard(' ')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.keyboard('{Enter}')
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderUi(<Switch aria-label="X" checked={false} onCheckedChange={onChange} disabled />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ListSwitchRow makes the whole row the switch, named by its label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderUi(
      <ListGroup>
        <ListSwitchRow icon={Moon} label="Notificações" checked onCheckedChange={onChange} />
      </ListGroup>,
    )
    const row = screen.getByRole('switch', { name: 'Notificações' })
    expect(row).toHaveAttribute('aria-checked', 'true')
    await user.click(row)
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
