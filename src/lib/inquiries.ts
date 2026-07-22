import { supabase } from './supabase'

export type InquiryStatus = 'new' | 'contacted' | 'closed'

export type Inquiry = {
  id: string
  name: string
  phone: string
  message: string | null
  status: InquiryStatus
  created_at: string
}

export async function fetchInquiries(): Promise<Inquiry[]> {
  const { data, error } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Inquiry[]
}

export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
  const { error } = await supabase.from('inquiries').update({ status }).eq('id', id)
  if (error) throw error
}
