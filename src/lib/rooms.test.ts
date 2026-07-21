import { describe, it, expect, vi } from 'vitest'

const mockRoomsData = [
  { id: 'room-1', room_number: '101', room_type: 'twin', capacity: 2, monthly_price: 14000, beds: [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant' }] },
]

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockRoomsData, error: null })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

describe('fetchRoomsWithBeds', () => {
  it('returns rooms with their beds', async () => {
    const { fetchRoomsWithBeds } = await import('./rooms')
    const rooms = await fetchRoomsWithBeds()
    expect(rooms).toEqual(mockRoomsData)
  })
})

describe('createRoom', () => {
  it('inserts a room with the given fields', async () => {
    const { createRoom } = await import('./rooms')
    const { supabase } = await import('./supabase')
    await createRoom({ room_number: '202', room_type: 'single', capacity: 1, monthly_price: 18000 })
    expect(supabase.from).toHaveBeenCalledWith('rooms')
  })
})
