import { supabase } from './supabase'

export type TransferStatus = 'pending' | 'awaiting_confirmation' | 'confirmed' | 'rejected'

export type TransferRequest = {
  id: string
  student_id: string
  reason: string
  preferred_room_type: 'single' | 'twin' | 'triple'
  status: TransferStatus
  from_bed_id: string
  to_bed_id: string | null
  price_diff: number | null
  reject_reason: string | null
  created_at: string
}

export type TransferRequestWithStudent = TransferRequest & { student_name: string }

export async function fetchMyTransferRequests(): Promise<TransferRequest[]> {
  const { data, error } = await supabase
    .from('transfer_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TransferRequest[]
}

export async function fetchPendingTransferRequests(): Promise<TransferRequestWithStudent[]> {
  const { data, error } = await supabase
    .from('transfer_requests')
    .select('*, students(profiles(full_name))')
    .eq('status', 'pending')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    reason: row.reason,
    preferred_room_type: row.preferred_room_type,
    status: row.status,
    from_bed_id: row.from_bed_id,
    to_bed_id: row.to_bed_id,
    price_diff: row.price_diff,
    reject_reason: row.reject_reason,
    created_at: row.created_at,
    student_name: row.students?.profiles?.full_name ?? '',
  }))
}

export async function submitTransferRequest(input: {
  fromBedId: string
  reason: string
  preferredRoomType: TransferRequest['preferred_room_type']
}): Promise<void> {
  const { error } = await supabase.from('transfer_requests').insert({
    from_bed_id: input.fromBedId,
    reason: input.reason,
    preferred_room_type: input.preferredRoomType,
  })
  if (error) throw error
}

export async function approveTransferRequest(requestId: string, toBedId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_transfer_request', {
    p_request_id: requestId,
    p_to_bed_id: toBedId,
  })
  if (error) throw error
}

export async function rejectTransferRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_transfer_request', {
    p_request_id: requestId,
    p_reason: reason,
  })
  if (error) throw error
}

export async function confirmTransfer(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_transfer', { p_request_id: requestId })
  if (error) throw error
}
