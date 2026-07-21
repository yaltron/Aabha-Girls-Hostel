import { describe, it, expect } from 'vitest'
import { getNavItemsForRole } from './nav'

describe('getNavItemsForRole', () => {
  it('gives owner the full nav including financial config, rooms, residents, and fees', () => {
    const items = getNavItemsForRole('owner').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Financial Settings')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
  })

  it('gives warden operational nav (rooms, residents, fees) but not financial config', () => {
    const items = getNavItemsForRole('warden').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Rooms')
    expect(items).toContain('Residents')
    expect(items).toContain('Fees')
    expect(items).not.toContain('Financial Settings')
  })

  it('gives student only their own dashboard', () => {
    const items = getNavItemsForRole('student').map((i) => i.label)
    expect(items).toEqual(['Dashboard'])
  })

  it('gives guardian only their own dashboard', () => {
    const items = getNavItemsForRole('guardian').map((i) => i.label)
    expect(items).toEqual(['Dashboard'])
  })
})
