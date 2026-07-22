import { supabase } from './supabase'
import type { InvoiceStatus } from './fees'

export type ChildInvoice = {
  id: string
  billing_month: string
  amount: number
  due_date: string
  status: InvoiceStatus
}

export type GuardianUpdate = {
  id: string
  student_id: string
  month: string
  message: string
  created_at: string
}

function currentMonthDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function fetchMyChildProfile(): Promise<{ id: string; full_name: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'student')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchChildInvoices(): Promise<ChildInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, billing_month, amount, due_date, status')
    .order('billing_month', { ascending: false })
  if (error) throw error
  return (data ?? []) as ChildInvoice[]
}

export async function fetchMyChildUpdate(): Promise<GuardianUpdate | null> {
  const { data, error } = await supabase
    .from('guardian_updates')
    .select('*')
    .eq('month', currentMonthDate())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchGuardianUpdateForStudent(studentId: string): Promise<GuardianUpdate | null> {
  const { data, error } = await supabase
    .from('guardian_updates')
    .select('*')
    .eq('student_id', studentId)
    .eq('month', currentMonthDate())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function postGuardianUpdate(studentId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('guardian_updates')
    .upsert({ student_id: studentId, month: currentMonthDate(), message }, { onConflict: 'student_id,month' })
  if (error) throw error
}
