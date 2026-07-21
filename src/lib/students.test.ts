import { describe, it, expect, vi } from 'vitest'

const mockStudentsData = [
  { id: 'student-1', full_name: 'Test Student', photo_url: null, guardian_name: 'Guardian', guardian_phone: '9800000000', bed_id: 'bed-1', check_in_date: '2026-07-01', monthly_fee: 14000 },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockStudentsData, error: null })),
    })),
    rpc: rpcMock,
  },
}))

describe('fetchStudents', () => {
  it('returns all students', async () => {
    const { fetchStudents } = await import('./students')
    const students = await fetchStudents()
    expect(students).toEqual(mockStudentsData)
  })
})

describe('checkInStudent', () => {
  it('calls the check_in_student RPC with the given fields', async () => {
    const { checkInStudent } = await import('./students')
    await checkInStudent({
      profileId: 'profile-1',
      guardianName: 'Guardian',
      guardianPhone: '9800000000',
      bedId: 'bed-1',
      checkInDate: '2026-07-01',
      monthlyFee: 14000,
    })
    expect(rpcMock).toHaveBeenCalledWith('check_in_student', {
      p_profile_id: 'profile-1',
      p_guardian_name: 'Guardian',
      p_guardian_phone: '9800000000',
      p_bed_id: 'bed-1',
      p_check_in_date: '2026-07-01',
      p_monthly_fee: 14000,
      p_photo_url: null,
    })
  })
})
