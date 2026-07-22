import { describe, it, expect, vi } from 'vitest'

const mockChildProfile = { id: 'student-1', full_name: 'Anjali Adhikari' }
const mockChildInvoices = [
  { id: 'inv-1', billing_month: '2026-07-01', amount: 14000, due_date: '2026-07-10', status: 'unpaid' },
]
const mockUpdate = {
  id: 'update-1',
  student_id: 'student-1',
  month: '2026-07-01',
  message: 'Doing great this month!',
  created_at: '2026-07-05T00:00:00Z',
}

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockChildProfile, error: null })),
            })),
          })),
        }
      }
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockChildInvoices, error: null })),
          })),
        }
      }
      // guardian_updates
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockUpdate, error: null })),
            })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: mockUpdate, error: null })),
          })),
        })),
        upsert: upsertMock,
      }
    }),
  },
}))

describe('fetchMyChildProfile', () => {
  it('returns the linked child profile', async () => {
    const { fetchMyChildProfile } = await import('./guardian')
    const child = await fetchMyChildProfile()
    expect(child).toEqual(mockChildProfile)
  })
})

describe('fetchChildInvoices', () => {
  it('returns the linked child invoices', async () => {
    const { fetchChildInvoices } = await import('./guardian')
    const invoices = await fetchChildInvoices()
    expect(invoices).toEqual(mockChildInvoices)
  })
})

describe('fetchMyChildUpdate', () => {
  it('returns this month\'s update for the linked child', async () => {
    const { fetchMyChildUpdate } = await import('./guardian')
    const update = await fetchMyChildUpdate()
    expect(update).toEqual(mockUpdate)
  })
})

describe('fetchGuardianUpdateForStudent', () => {
  it('returns this month\'s update for a given student', async () => {
    const { fetchGuardianUpdateForStudent } = await import('./guardian')
    const update = await fetchGuardianUpdateForStudent('student-1')
    expect(update).toEqual(mockUpdate)
  })
})

describe('postGuardianUpdate', () => {
  it('upserts the update keyed on student_id and month', async () => {
    const { postGuardianUpdate } = await import('./guardian')
    await postGuardianUpdate('student-1', 'Doing great!')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 'student-1', message: 'Doing great!' }),
      { onConflict: 'student_id,month' },
    )
  })
})
