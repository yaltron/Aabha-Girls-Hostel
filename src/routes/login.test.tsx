import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginPage } from './login'

const signIn = vi.fn().mockResolvedValue({ error: null })

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ signIn }),
}))

describe('LoginPage', () => {
  it('calls signIn with the entered email and password', async () => {
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'owner@aabha.test' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('owner@aabha.test', 'secret123'))
  })
})
