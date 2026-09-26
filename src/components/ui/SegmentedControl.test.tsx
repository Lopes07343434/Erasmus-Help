import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sparkles, UsersRound } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { renderUi, setupUiTests } from './testUtils'

setupUiTests()

type Mode = 'person' | 'train'

function Harness() {
  const [mode, setMode] = useState<Mode>('person')
  return (
    <>
      <SegmentedControl<Mode>
        aria-label="Modo de conversa"
        id="mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'person', label: 'Conversar com pessoa', icon: UsersRound, controls: 'panel-person' },
          { value: 'train', label: 'Treinar com a app', icon: Sparkles, controls: 'panel-train' },
        ]}
      />
      <output>{mode}</output>
    </>
  )
}

describe('SegmentedControl', () => {
  it('renders an ARIA tablist with one selected, focusable tab', () => {
    renderUi(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Modo de conversa' })).toBeInTheDocument()
    const person = screen.getByRole('tab', { name: 'Conversar com pessoa' })
    const train = screen.getByRole('tab', { name: 'Treinar com a app' })
    expect(person).toHaveAttribute('aria-selected', 'true')
    expect(person).toHaveAttribute('tabindex', '0')
    expect(person).toHaveAttribute('id', 'mode-tab-person')
    expect(person).toHaveAttribute('aria-controls', 'panel-person')
    expect(train).toHaveAttribute('aria-selected', 'false')
    expect(train).toHaveAttribute('tabindex', '-1')
  })

  it('selects on click', async () => {
    const user = userEvent.setup()
    renderUi(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'Treinar com a app' }))
    expect(screen.getByRole('tab', { name: 'Treinar com a app' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('train')
  })

  it('arrow keys, Home and End move focus and selection (wrapping)', async () => {
    const user = userEvent.setup()
    renderUi(<Harness />)
    const person = screen.getByRole('tab', { name: 'Conversar com pessoa' })
    const train = screen.getByRole('tab', { name: 'Treinar com a app' })
    person.focus()

    await user.keyboard('{ArrowRight}')
    expect(train).toHaveFocus()
    expect(train).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowRight}')
    expect(person).toHaveFocus()
    expect(person).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    expect(train).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(person).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(train).toHaveFocus()
  })
})
