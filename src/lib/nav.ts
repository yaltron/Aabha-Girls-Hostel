export type Role = 'owner' | 'warden' | 'student' | 'guardian'
export type NavItem = { label: string; path: string }

const DASHBOARD: NavItem = { label: 'Dashboard', path: '/dashboard' }
const ROOMS: NavItem = { label: 'Rooms', path: '/room-board' }
const RESIDENTS: NavItem = { label: 'Residents', path: '/residents' }
const FEES: NavItem = { label: 'Fees', path: '/fees' }
const REQUESTS: NavItem = { label: 'Requests', path: '/requests' }
const MY_ROOM: NavItem = { label: 'My Room', path: '/my-room' }
const MAINTENANCE: NavItem = { label: 'Maintenance', path: '/maintenance' }
const NOTICES: NavItem = { label: 'Notices', path: '/notices' }
const MY_CHILD: NavItem = { label: 'My Child', path: '/my-child' }
const SITE_CONTENT: NavItem = { label: 'Site Content', path: '/site-content' }

export function getNavItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case 'owner':
      return [DASHBOARD, ROOMS, RESIDENTS, FEES, REQUESTS, SITE_CONTENT]
    case 'warden':
      return [DASHBOARD, ROOMS, RESIDENTS, FEES, REQUESTS]
    case 'student':
      return [DASHBOARD, MY_ROOM, MAINTENANCE, NOTICES]
    case 'guardian':
      return [DASHBOARD, MY_CHILD]
  }
}
