import { describe, it, expect, vi } from 'vitest'

const mockOwnRequests = [
  { id: 'req-1', student_id: 'student-1', reason: 'Too noisy', preferred_room_type: 'single', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-01T00:00:00Z' },
]

const mockPendingRaw = [
  { id: 'req-2', student_id: 'student-2', reason: 'Roommate conflict', preferred_room_type: 'twin', status: 'pending', from_bed_id: 'bed-2', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-02T00:00:00Z', students: { profiles: { full_name: 'Sita Nepali' } } },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => {
        if (cols.includes('students')) {
          return { eq: vi.fn(() => Promise.resolve({ data: mockPendingRaw, error: null })) }
        }
        return { order: vi.fn(() => Promise.resolve({ data: mockOwnRequests, error: null })) }
      }),
      insert: insertMock,
    })),
    rpc: rpcMock,
  },
}))

describe('fetchMyTransferRequests', () => {
  it('returns the caller\'s own requests', async () => {
    const { fetchMyTransferRequests } = await import('./transfers')
    const requests = await fetchMyTransferRequests()
    expect(requests).toEqual(mockOwnRequests)
  })
})

describe('fetchPendingTransferRequests', () => {
  it('returns pending requests with the student name flattened in', async () => {
    const { fetchPendingTransferRequests } = await import('./transfers')
    const requests = await fetchPendingTransferRequests()
    expect(requests[0].student_name).toBe('Sita Nepali')
    expect(requests[0].id).toBe('req-2')
  })
})

describe('submitTransferRequest', () => {
  it('inserts a transfer request with the given fields', async () => {
    const { submitTransferRequest } = await import('./transfers')
    await submitTransferRequest({ fromBedId: 'bed-1', reason: 'Too noisy', preferredRoomType: 'single' })
    expect(insertMock).toHaveBeenCalledWith({
      from_bed_id: 'bed-1',
      reason: 'Too noisy',
      preferred_room_type: 'single',
    })
  })
})

describe('approveTransferRequest', () => {
  it('calls the approve_transfer_request RPC', async () => {
    const { approveTransferRequest } = await import('./transfers')
    await approveTransferRequest('req-2', 'bed-5')
    expect(rpcMock).toHaveBeenCalledWith('approve_transfer_request', { p_request_id: 'req-2', p_to_bed_id: 'bed-5' })
  })
})

describe('rejectTransferRequest', () => {
  it('calls the reject_transfer_request RPC', async () => {
    const { rejectTransferRequest } = await import('./transfers')
    await rejectTransferRequest('req-2', 'No vacancy')
    expect(rpcMock).toHaveBeenCalledWith('reject_transfer_request', { p_request_id: 'req-2', p_reason: 'No vacancy' })
  })
})

describe('confirmTransfer', () => {
  it('calls the confirm_transfer RPC', async () => {
    const { confirmTransfer } = await import('./transfers')
    await confirmTransfer('req-1')
    expect(rpcMock).toHaveBeenCalledWith('confirm_transfer', { p_request_id: 'req-1' })
  })
})
