import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ session: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('protected route', () => {
  it('redirects to /login when there is no session', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument())
  })
})
