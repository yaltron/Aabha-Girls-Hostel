import { describe, it, expect } from 'vitest'
import { getNavItemsForRole } from './nav'

describe('getNavItemsForRole', () => {
  it('gives owner the full nav including financial config, rooms, residents, fees, and requests', () => {
    const items = getNavItemsForRole('owner').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Financial Settings')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
    expect(items).toContain('Requests')
  })

  it('gives warden operational nav (rooms, residents, fees, requests) but not financial config', () => {
    const items = getNavItemsForRole('warden').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
    expect(items).toContain('Requests')
    expect(items).not.toContain('Financial Settings')
  })

  it('gives student their dashboard plus My Room, Maintenance, and Notices', () => {
    const items = getNavItemsForRole('student').map((i) => i.label)
    expect(items).toEqual(['Dashboard', 'My Room', 'Maintenance', 'Notices'])
  })

  it('gives guardian only their dashboard', () => {
    const items = getNavItemsForRole('guardian').map((i) => i.label)
    expect(items).toEqual(['Dashboard'])
  })
})
