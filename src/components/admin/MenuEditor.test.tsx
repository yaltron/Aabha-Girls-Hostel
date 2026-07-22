import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuEditor } from './MenuEditor'
import type { MenuItem } from '../../lib/menu'

const upsertMenuItem = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/menu', () => ({
  upsertMenuItem: (...args: unknown[]) => upsertMenuItem(...args),
}))

const items: MenuItem[] = [
  { id: 'menu-1', day_of_week: 0, meal: 'breakfast', description: 'Poha' },
]

describe('MenuEditor', () => {
  it('prefills an existing cell and saves an edit', async () => {
    const onChanged = vi.fn()
    render(<MenuEditor items={items} onChanged={onChanged} />)

    const cell = screen.getByLabelText(/sunday breakfast/i)
    expect(cell).toHaveValue('Poha')

    fireEvent.change(cell, { target: { value: 'Aloo paratha' } })
    fireEvent.blur(cell)

    await waitFor(() => expect(upsertMenuItem).toHaveBeenCalledWith(0, 'breakfast', 'Aloo paratha'))
    expect(onChanged).toHaveBeenCalled()
  })
})
