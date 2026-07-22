import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center gap-8 px-gutter py-4 border-b border-outline-variant bg-surface/90 backdrop-blur">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Aabha Girls Hostel" className="h-10 w-10 rounded-lg" />
          <span className="font-display text-xl text-primary">Aabha Girls Hostel</span>
        </Link>
        <div className="flex gap-6 ml-auto text-on-surface-variant text-sm uppercase tracking-wide">
          <Link to="/">Home</Link>
          <Link to="/transparency">Transparency</Link>
          <Link to="/rooms">Rooms & Fees</Link>
          <Link to="/booking">Booking</Link>
        </div>
        <Link to="/booking" className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-medium text-sm active:scale-95 transition-transform">
          Book a Visit
        </Link>
      </nav>

      <main className="flex-1 px-gutter py-section-gap max-w-container-max mx-auto w-full">{children}</main>

      <footer className="bg-surface-container-low px-gutter py-16 mt-auto">
        <div className="max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Aabha Girls Hostel" className="h-8 w-8 rounded" />
              <span className="font-display text-lg text-primary">Aabha Girls Hostel</span>
            </div>
            <p className="text-on-surface-variant text-sm max-w-xs">
              Nepal's premier boutique girls' hostel, dedicated to providing a safe, hygienic, and nurturing environment.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="uppercase tracking-wide text-xs text-on-surface-variant">Explore</p>
            <Link to="/rooms" className="block text-on-surface-variant hover:text-primary">Rooms &amp; Pricing</Link>
            <Link to="/transparency" className="block text-on-surface-variant hover:text-primary">Facilities &amp; Amenities</Link>
            <Link to="/transparency" className="block text-on-surface-variant hover:text-primary">Rules &amp; Regulations</Link>
            <Link to="/booking" className="block text-on-surface-variant hover:text-primary">Book a Visit</Link>
          </div>
          <div className="space-y-2 text-sm">
            <p className="uppercase tracking-wide text-xs text-on-surface-variant">Location</p>
            <p className="text-on-surface-variant">Mid-Baneshwor, Kathmandu</p>
            <p className="text-on-surface-variant">Opposite Global College</p>
          </div>
        </div>
        <p className="text-center text-xs text-on-surface-variant mt-12">
          © {new Date().getFullYear()} Aabha Girls Hostel. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
