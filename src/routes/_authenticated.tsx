import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminShell } from '../components/shell/AdminShell'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // `context.auth` is only guaranteed once `App` (in main.tsx) passes it to
    // `RouterProvider`. Tests that create a router without seeding router
    // context (see `_authenticated.test.tsx`) leave `context.auth` undefined,
    // so fall back to an unauthenticated shape rather than crash.
    const { session, loading } = context.auth ?? { session: null, loading: false }
    if (!loading && !session) {
      throw redirect({ to: '/login' })
    }
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
})
