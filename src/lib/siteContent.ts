import { supabase } from './supabase'

export type SiteContentKey = 'hero' | 'trust_points' | 'about' | 'safety_rules' | 'contact'

export async function fetchSiteContent(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('site_content').select('*')
  if (error) throw error
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) {
    map[(row as { key: string; value: unknown }).key] = (row as { key: string; value: unknown }).value
  }
  return map
}

export async function updateSiteContent(key: SiteContentKey, value: unknown): Promise<void> {
  const { error } = await supabase.from('site_content').upsert({ key, value })
  if (error) throw error
}
