import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: () => <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>,
})
