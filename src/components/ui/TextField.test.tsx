import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from 'lucide-react'
import { TextField } from './TextField'
import { renderUi, setupUiTests } from './testUtils'

setupUiTests()

describe('TextField', () => {
  it('associates the label and forwards the ref and native props', () => {
    const ref = createRef<HTMLInputElement>()
    renderUi(<TextField label="Email da universidade" ref={ref} name="email" placeholder="nome@up.pt" />)
    const input = screen.getByLabelText('Email da universidade')
    expect(input).toBe(ref.current)
    expect(input).toHaveAttribute('name', 'email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('wires the error message with aria-invalid and aria-describedby', () => {
    renderUi(<TextField label="Email" error="Falta o domínio. Ex.: nome@up.pt" description="Usa o email da universidade" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Falta o domínio. Ex.: nome@up.pt')
    expect(screen.queryByText('Usa o email da universidade')).not.toBeInTheDocument()
  })

  it('describes the field with the success message or the description', () => {
    const { rerender } = renderUi(<TextField label="Email" description="Usa o email da universidade" aria-describedby="extra" />)
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toMatch(/^extra .+-message$/)

    rerender(<TextField label="Email" success="Email verificado" />)
    const input = screen.getByLabelText('Email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('Email verificado')
  })

  it('shows a localized clear button only while there is a value', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    function Harness() {
      const [q, setQ] = useState('')
      return (
        <TextField
          label="Pesquisar"
          leadingIcon={Search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => {
            onClear()
            setQ('')
          }}
        />
      )
    }
    renderUi(<Harness />)
    expect(screen.queryByRole('button', { name: 'Limpar' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Pesquisar'), 'metro')
    await user.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Pesquisar')).toHaveValue('')
  })
})
