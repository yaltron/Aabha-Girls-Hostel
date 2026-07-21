import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginPage } from './login'

const signIn = vi.fn().mockResolvedValue({ error: null })
const navigate = vi.fn()

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ signIn }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('LoginPage', () => {
  it('calls signIn with the entered email and password', async () => {
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'owner@aabha.test' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('owner@aabha.test', 'secret123'))
  })
})
