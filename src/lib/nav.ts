export type Role = 'owner' | 'warden' | 'student' | 'guardian'
export type NavItem = { label: string; path: string }

const DASHBOARD: NavItem = { label: 'Dashboard', path: '/dashboard' }
const FINANCIAL_SETTINGS: NavItem = { label: 'Financial Settings', path: '/settings/financial' }

export function getNavItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case 'owner':
      return [DASHBOARD, FINANCIAL_SETTINGS]
    case 'warden':
      return [DASHBOARD]
    case 'student':
      return [DASHBOARD]
    case 'guardian':
      return [DASHBOARD]
  }
}
