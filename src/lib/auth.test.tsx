import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './auth'

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}))

function Probe() {
  const { loading, session } = useAuth()
  return <div>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</div>
}

beforeEach(() => vi.clearAllMocks())

describe('AuthProvider', () => {
  it('resolves to signed-out when there is no session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
  })
})
