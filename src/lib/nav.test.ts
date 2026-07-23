import { describe, it, expect } from 'vitest'
import { getNavItemsForRole } from './nav'

describe('getNavItemsForRole', () => {
  it('gives owner the full nav including rooms, residents, fees, requests, and site content', () => {
    const items = getNavItemsForRole('owner').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
    expect(items).toContain('Requests')
    expect(items).toContain('Site Content')
  })

  it('gives warden operational nav (rooms, residents, fees, requests) but not site content', () => {
    const items = getNavItemsForRole('warden').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
    expect(items).toContain('Requests')
    expect(items).not.toContain('Site Content')
  })

  it('gives student their dashboard plus My Room, Maintenance, and Notices', () => {
    const items = getNavItemsForRole('student').map((i) => i.label)
    expect(items).toEqual(['Dashboard', 'My Room', 'Maintenance', 'Notices'])
  })

  it('gives guardian only their dashboard and My Child', () => {
    const items = getNavItemsForRole('guardian').map((i) => i.label)
    expect(items).toEqual(['Dashboard', 'My Child'])
  })
})
