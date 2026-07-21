export type Role = 'owner' | 'warden' | 'student' | 'guardian'
export type NavItem = { label: string; path: string }

const DASHBOARD: NavItem = { label: 'Dashboard', path: '/dashboard' }
const FINANCIAL_SETTINGS: NavItem = { label: 'Financial Settings', path: '/settings/financial' }
const ROOMS: NavItem = { label: 'Rooms', path: '/rooms' }
const RESIDENTS: NavItem = { label: 'Residents', path: '/residents' }

export function getNavItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case 'owner':
      return [DASHBOARD, ROOMS, RESIDENTS, FINANCIAL_SETTINGS]
    case 'warden':
      return [DASHBOARD, ROOMS, RESIDENTS]
    case 'student':
      return [DASHBOARD]
    case 'guardian':
      return [DASHBOARD]
  }
}
