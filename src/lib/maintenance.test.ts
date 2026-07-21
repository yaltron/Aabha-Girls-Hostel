import { describe, it, expect, vi } from 'vitest'

const mockMyTickets = [
  { id: 'ticket-1', student_id: 'student-1', description: 'Leaky faucet', status: 'open', created_at: '2026-07-01T00:00:00Z' },
]

const mockOpenRaw = [
  { id: 'ticket-2', student_id: 'student-2', description: 'Broken window latch', status: 'open', created_at: '2026-07-02T00:00:00Z', students: { profiles: { full_name: 'Anjali Adhikari' } } },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        if (cols.includes('students')) {
          return { eq: vi.fn(() => Promise.resolve({ data: mockOpenRaw, error: null })) }
        }
        return { order: vi.fn(() => Promise.resolve({ data: mockMyTickets, error: null })) }
      }),
      insert: insertMock,
      update: updateMock,
    })),
  },
}))

describe('fetchMyTickets', () => {
  it('returns the caller\'s own tickets', async () => {
    const { fetchMyTickets } = await import('./maintenance')
    const tickets = await fetchMyTickets()
    expect(tickets).toEqual(mockMyTickets)
  })
})

describe('fetchOpenTickets', () => {
  it('returns open tickets with the student name flattened in', async () => {
    const { fetchOpenTickets } = await import('./maintenance')
    const tickets = await fetchOpenTickets()
    expect(tickets[0].student_name).toBe('Anjali Adhikari')
  })
})

describe('raiseTicket', () => {
  it('inserts a ticket with the given description', async () => {
    const { raiseTicket } = await import('./maintenance')
    await raiseTicket('Leaky faucet')
    expect(insertMock).toHaveBeenCalledWith({ description: 'Leaky faucet' })
  })
})

describe('resolveTicket', () => {
  it('updates the ticket status to resolved', async () => {
    const { resolveTicket } = await import('./maintenance')
    await resolveTicket('ticket-2')
    expect(updateMock).toHaveBeenCalledWith({ status: 'resolved', resolved_at: expect.any(String) })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'ticket-2')
  })
})
