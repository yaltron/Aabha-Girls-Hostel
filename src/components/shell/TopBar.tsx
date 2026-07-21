import { useAuth } from '../../lib/auth'

export function TopBar() {
  const { signOut } = useAuth()

  return (
    <header className="fixed top-0 right-0 left-64 h-16 bg-surface/80 backdrop-blur-md shadow-premium flex justify-end items-center px-gutter">
      <button onClick={() => signOut()} className="text-on-surface-variant hover:text-primary transition-colors">
        Sign out
      </button>
    </header>
  )
}
