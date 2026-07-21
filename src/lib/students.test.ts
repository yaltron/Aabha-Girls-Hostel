import { describe, it, expect, vi } from 'vitest'

// Raw shape as Supabase actually returns it for `select('*, profiles(full_name)')`:
// the joined table comes back as a nested object under the table name.
const mockStudentsRawData = [
  {
    id: 'student-1',
    photo_url: null,
    guardian_name: 'Guardian',
    guardian_phone: '9800000000',
    bed_id: 'bed-1',
    check_in_date: '2026-07-01',
    monthly_fee: 14000,
    profiles: { full_name: 'Test Student' },
  },
]

const mockUnassignedProfilesData = [
  { id: 'profile-1', full_name: 'Has Not Checked In', students: [] },
  { id: 'profile-2', full_name: 'Already Checked In', students: [{ id: 'student-2' }] },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === 'profiles') {
          return {
            eq: vi.fn(() => Promise.resolve({ data: mockUnassignedProfilesData, error: null })),
          }
        }
        return Promise.resolve({ data: mockStudentsRawData, error: null })
      }),
    })),
    rpc: rpcMock,
  },
}))

describe('fetchStudents', () => {
  it('returns all students with full_name flattened from the joined profiles row', async () => {
    const { fetchStudents } = await import('./students')
    const students = await fetchStudents()
    expect(students).toEqual([
      {
        id: 'student-1',
        full_name: 'Test Student',
        photo_url: null,
        guardian_name: 'Guardian',
        guardian_phone: '9800000000',
        bed_id: 'bed-1',
        check_in_date: '2026-07-01',
        monthly_fee: 14000,
      },
    ])
  })
})

describe('fetchUnassignedStudentProfiles', () => {
  it('returns only profiles without a corresponding students row', async () => {
    const { fetchUnassignedStudentProfiles } = await import('./students')
    const profiles = await fetchUnassignedStudentProfiles()
    expect(profiles).toEqual([{ id: 'profile-1', full_name: 'Has Not Checked In' }])
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
