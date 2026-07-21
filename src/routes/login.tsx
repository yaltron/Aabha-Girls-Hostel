import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { error } = await signIn(email, password)
    if (error) {
      setError(error)
    } else {
      navigate({ to: '/dashboard' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-margin-mobile">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6"
      >
        <h1 className="font-display text-3xl text-primary text-center">Aabha</h1>
        <p className="text-center text-on-surface-variant">Sign in to your account</p>

        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-on-surface-variant">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-on-surface-variant">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
            required
          />
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
})
