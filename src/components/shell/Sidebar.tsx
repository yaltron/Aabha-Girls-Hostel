import { getNavItemsForRole, type Role } from '../../lib/nav'

export function Sidebar({ role }: { role: Role }) {
  const items = getNavItemsForRole(role)

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container py-base px-4 flex flex-col print:hidden">
      <div className="px-2 mb-10">
        <h1 className="font-display text-xl text-primary">Aabha</h1>
        <p className="text-xs text-secondary">Hostel Management</p>
      </div>
      <nav className="flex-1 space-y-2">
        {items.map((item) => (
          <a
            key={item.path}
            href={item.path}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant hover:bg-secondary-container/50 transition-all"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  )
}
