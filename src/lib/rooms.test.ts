import { describe, it, expect, vi } from 'vitest'

const mockRoomsData = [
  { id: 'room-1', room_number: '101', beds: [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant', hold_until: null }], room_types: { name: 'Twin' } },
]

const mockRoomTypesData = [
  { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: ['balcony'] },
]

const mockRoomsWithStatusData = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
]

const fromMock = vi.fn((table: string) => {
  if (table === 'rooms') {
    return {
      select: vi.fn(() => Promise.resolve({ data: mockRoomsData, error: null })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }
  }
  if (table === 'room_types') {
    return {
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockRoomTypesData, error: null })) })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }
  }
  if (table === 'rooms_with_status') {
    return {
      select: vi.fn(() => Promise.resolve({ data: mockRoomsWithStatusData, error: null })),
    }
  }
  throw new Error(`unexpected table: ${table}`)
})

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

describe('fetchRoomsWithBeds', () => {
  it('returns rooms with their beds and room type name', async () => {
    const { fetchRoomsWithBeds } = await import('./rooms')
    const rooms = await fetchRoomsWithBeds()
    expect(rooms).toEqual([
      { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: mockRoomsData[0].beds },
    ])
  })
})

describe('fetchRoomTypes', () => {
  it('returns all room types', async () => {
    const { fetchRoomTypes } = await import('./rooms')
    const types = await fetchRoomTypes()
    expect(types).toEqual(mockRoomTypesData)
  })
})

describe('createRoomType', () => {
  it('inserts a room type with the given fields', async () => {
    const { createRoomType } = await import('./rooms')
    await createRoomType({ name: 'Dormitory', capacity: 6, base_rent: 8000, deposit: 2000, amenities: [] })
    expect(fromMock).toHaveBeenCalledWith('room_types')
  })
})

describe('updateRoomType', () => {
  it('updates the room type with the given id', async () => {
    const { updateRoomType } = await import('./rooms')
    await updateRoomType('rt-1', { name: 'Twin', capacity: 2, base_rent: 15000, deposit: 5000, amenities: ['balcony', 'ac'] })
    expect(fromMock).toHaveBeenCalledWith('room_types')
  })
})

describe('fetchRoomsWithStatus', () => {
  it('returns rooms from the rooms_with_status view', async () => {
    const { fetchRoomsWithStatus } = await import('./rooms')
    const rooms = await fetchRoomsWithStatus()
    expect(rooms).toEqual(mockRoomsWithStatusData)
  })
})

describe('createRoom', () => {
  it('inserts a room with the given fields', async () => {
    const { createRoom } = await import('./rooms')
    await createRoom({ room_number: '202', floor: 2, wing: null, room_type_id: 'rt-1', admin_status: 'active' })
    expect(fromMock).toHaveBeenCalledWith('rooms')
  })
})

describe('updateRoom', () => {
  it('updates the room with the given id', async () => {
    const { updateRoom } = await import('./rooms')
    await updateRoom('room-1', { room_number: '202', floor: 2, wing: 'East', room_type_id: 'rt-1', admin_status: 'under_maintenance' })
    expect(fromMock).toHaveBeenCalledWith('rooms')
  })
})

describe('deleteRoom', () => {
  it('calls the delete_room RPC with the given id', async () => {
    const { deleteRoom } = await import('./rooms')
    await deleteRoom('room-1')
    expect(rpcMock).toHaveBeenCalledWith('delete_room', { p_room_id: 'room-1' })
  })

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error('Cannot delete room: 1 bed(s) are occupied, reserved, or on notice. Set the room to blocked instead.') })
    const { deleteRoom } = await import('./rooms')
    await expect(deleteRoom('room-1')).rejects.toThrow('Cannot delete room')
  })
})
