import { supabase } from './supabase'

export type TicketStatus = 'open' | 'resolved'

export type Ticket = {
  id: string
  student_id: string
  description: string
  status: TicketStatus
  created_at: string
}

export type TicketWithStudent = Ticket & { student_name: string }

export async function fetchMyTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Ticket[]
}

export async function fetchOpenTickets(): Promise<TicketWithStudent[]> {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .select('*, students(profiles(full_name))')
    .eq('status', 'open')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    student_name: row.students?.profiles?.full_name ?? '',
  }))
}

export async function raiseTicket(description: string): Promise<void> {
  const { error } = await supabase.from('maintenance_tickets').insert({ description })
  if (error) throw error
}

export async function resolveTicket(ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('maintenance_tickets')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) throw error
}
