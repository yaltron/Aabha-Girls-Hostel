import { describe, it, expect, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

describe('supabase client', () => {
  it('is created with the URL and anon key from env', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase.supabaseUrl).toBe('https://example.supabase.co')
    expect(supabase.supabaseKey).toBe('test-anon-key')
  })
})
