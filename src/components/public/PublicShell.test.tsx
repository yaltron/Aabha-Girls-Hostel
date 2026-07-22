import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { PublicShell } from './PublicShell'

function TestPage() {
  return (
    <PublicShell>
      <p>Page content</p>
    </PublicShell>
  )
}

function renderWithRouter() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/transparency', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/rooms', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/booking', component: TestPage }),
  ])
  const router = createRouter({ routeTree })
  return render(<RouterProvider router={router} />)
}

describe('PublicShell', () => {
  it('renders the logo, nav links to every public page, a Book a Visit CTA, and the children', async () => {
    renderWithRouter()
    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(screen.getAllByAltText(/aabha girls hostel/i)[0]).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /transparency/i })).toHaveAttribute('href', '/transparency')
    expect(within(nav).getByRole('link', { name: /rooms & fees/i })).toHaveAttribute('href', '/rooms')
    expect(within(nav).getByRole('link', { name: /^booking$/i })).toHaveAttribute('href', '/booking')
    expect(within(nav).getByRole('link', { name: /book a visit/i })).toHaveAttribute('href', '/booking')
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.getAllByText(/aabha girls hostel/i).length).toBeGreaterThan(0)
  })
})
