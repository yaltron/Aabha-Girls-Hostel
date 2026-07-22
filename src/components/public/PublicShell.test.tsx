import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    createRoute({ getParentRoute: () => rootRoute, path: '/rooms', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/life', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/about', component: TestPage }),
    createRoute({ getParentRoute: () => rootRoute, path: '/contact', component: TestPage }),
  ])
  const router = createRouter({ routeTree })
  return render(<RouterProvider router={router} />)
}

describe('PublicShell', () => {
  it('renders nav links to every public page and the children', async () => {
    renderWithRouter()
    expect(await screen.findByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /rooms/i })).toHaveAttribute('href', '/rooms')
    expect(screen.getByRole('link', { name: /life at aabha/i })).toHaveAttribute('href', '/life')
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('href', '/contact')
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })
})
