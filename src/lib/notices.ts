import { supabase } from './supabase'

export type Notice = {
  id: string
  title: string
  body: string
  guardian_visible: boolean
  created_at: string
}

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Notice[]
}

export async function postNotice(input: {
  title: string
  body: string
  guardianVisible: boolean
}): Promise<void> {
  const { error } = await supabase.from('notices').insert({
    title: input.title,
    body: input.body,
    guardian_visible: input.guardianVisible,
  })
  if (error) throw error
}
