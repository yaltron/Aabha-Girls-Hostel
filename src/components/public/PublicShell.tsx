import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="flex gap-6 px-gutter py-6 border-b border-outline-variant">
        <Link to="/" className="font-display text-lg text-primary">Aabha Girls Hostel</Link>
        <div className="flex gap-6 ml-auto text-on-surface-variant">
          <Link to="/">Home</Link>
          <Link to="/rooms">Rooms</Link>
          <Link to="/life">Life at Aabha</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </nav>
      <main className="px-gutter py-section-gap max-w-container-max mx-auto">{children}</main>
    </div>
  )
}
