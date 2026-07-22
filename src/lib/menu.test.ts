import { describe, it, expect, vi } from 'vitest'

const mockMenu = [
  { id: 'menu-1', day_of_week: 0, meal: 'breakfast', description: 'Poha' },
]

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockMenu, error: null })) })),
      upsert: upsertMock,
    })),
  },
}))

describe('fetchMenuItems', () => {
  it('returns all menu items', async () => {
    const { fetchMenuItems } = await import('./menu')
    expect(await fetchMenuItems()).toEqual(mockMenu)
  })
})

describe('upsertMenuItem', () => {
  it('upserts keyed on day_of_week and meal', async () => {
    const { upsertMenuItem } = await import('./menu')
    await upsertMenuItem(0, 'breakfast', 'Poha')
    expect(upsertMock).toHaveBeenCalledWith(
      { day_of_week: 0, meal: 'breakfast', description: 'Poha' },
      { onConflict: 'day_of_week,meal' },
    )
  })
})
