# Role-Specific Dashboards (Spec §7, scoped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single shared dashboard with four role-specific dashboards (owner, warden, student, guardian), scoped to the highest-value pieces only - no charts/trends, no attendance-dependent layout, no checkout-dependent "vacating soon" list.

**Architecture:** Pure UI composition - no migrations, every data source already exists and is already RLS-correct. One `/dashboard` route branches by role into four small, independently testable components, matching the existing `useAuth()` role-branch pattern already used throughout this codebase (`AdminShell`, `/room-board`, `/fees`).

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- **No migrations.** Every fetch function this plan uses already exists: `fetchRoomsWithBeds`, `fetchRoomsWithStatus`, `fetchDuesInvoices`, `fetchPendingBookings`, `fetchOpenTickets`, `fetchPendingTransferRequests`, `fetchChildInvoices`.
- **Reusable components (not routes) use plain `<a href="...">` for navigation links, never `@tanstack/react-router`'s `<Link>`.** `Link` requires router context that isn't present when a component is unit-tested standalone with `render()` - confirmed by this codebase's own existing convention (`Sidebar.tsx` uses plain `<a href>` for exactly this reason, verified by reading its current source before writing this plan).
- **"Defaulter" means overdue, not merely unpaid.** `DefaulterList` filters via the existing `isOverdue()` (`lib/dues.ts`), not just `status === 'unpaid'`.
- **`PendingBookingsList`/`PendingTransferRequestsList` are read-only summaries with a link to the real action screen** (`/site-content`, `/requests`) - not duplicate interactive approve/reject forms on the dashboard. The existing `BookingsQueue`/`TransferRequestsQueue` components (which require bed-selection state) are not reused here.
- **Student dashboard's next-due card is read-only, no "Pay Now."** No student-facing payment path exists anywhere in this app; adding one is out of scope.
- **Guardian dashboard's "Pay Now" reuses the existing `GuardianPaymentForm`** (already built for `/my-child`) - not a new payment component.
- **`RoomGrid`'s Edit/Delete controls must only render when BOTH `role === 'owner'` AND the callbacks are actually provided** (Task 1) - required before embedding it read-only on the owner dashboard, or a dead (visible but non-functional) Edit/Delete would show.

---

## File Structure

```
aabha-hostel/
  src/
    components/
      rooms/
        RoomGrid.tsx                             # MODIFIED: gate fix
        RoomGrid.test.tsx                         # MODIFIED
      dashboard/
        DefaulterList.tsx                          # NEW
        DefaulterList.test.tsx                     # NEW
        PendingBookingsList.tsx                    # NEW
        PendingBookingsList.test.tsx               # NEW
        PendingTransferRequestsList.tsx            # NEW
        PendingTransferRequestsList.test.tsx        # NEW
        OwnerDashboard.tsx                         # NEW
        OwnerDashboard.test.tsx                    # NEW
        WardenDashboard.tsx                        # NEW
        WardenDashboard.test.tsx                   # NEW
        StudentDashboard.tsx                       # NEW
        StudentDashboard.test.tsx                  # NEW
        GuardianDashboard.tsx                      # NEW
        GuardianDashboard.test.tsx                 # NEW
    routes/
      _authenticated.dashboard.tsx                 # MODIFIED: full rewrite
```

---

### Task 1: `RoomGrid` - fix the dead-button gap

**Files:**
- Modify: `src/components/rooms/RoomGrid.tsx`, `src/components/rooms/RoomGrid.test.tsx`

**Interfaces:**
- No signature change - `RoomGrid`'s props are unchanged. Only the internal condition for rendering Edit/Delete changes.

- [ ] **Step 1: Write the failing test**

Add to `src/components/rooms/RoomGrid.test.tsx` (append a new `it` inside the existing `describe('RoomGrid', ...)` block, alongside the existing 5 tests):
```tsx
  it('does not show Edit/Delete for owner when no callbacks are provided (read-only embedding)', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rooms/RoomGrid.test.tsx`
Expected: FAIL - the current `{canManage && (...)}` condition renders the Edit/Delete buttons regardless of whether callbacks were passed, so `queryByRole('button', { name: /edit/i })` finds one.

- [ ] **Step 3: Fix the implementation**

In `src/components/rooms/RoomGrid.tsx`, change:
```tsx
          {canManage && (
```
to:
```tsx
          {canManage && onEditRoom && onDeleteRoom && (
```
(The rest of the file is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/RoomGrid.test.tsx`
Expected: PASS (all 6 tests, including the 5 pre-existing ones - `/room-board`'s real usage always passes both callbacks together, so this fix changes no existing behavior there)

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/RoomGrid.tsx src/components/rooms/RoomGrid.test.tsx
git commit -m "fix: only show RoomGrid Edit/Delete when callbacks are actually provided"
```

---

### Task 2: `DefaulterList` component

**Files:**
- Create: `src/components/dashboard/DefaulterList.tsx`, `src/components/dashboard/DefaulterList.test.tsx`

**Interfaces:**
- Consumes: `Invoice` (existing `lib/fees.ts`), `isOverdue` (existing `lib/dues.ts`).
- Produces: `export function DefaulterList({ invoices }: { invoices: Invoice[] })` - consumed by `OwnerDashboard` (Task 5).

- [ ] **Step 1: Write the failing tests**

`src/components/dashboard/DefaulterList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DefaulterList } from './DefaulterList'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
  { id: 'inv-2', student_id: 's-2', student_name: 'Sita', billing_month: '2026-07-01', amount: 14000, due_date: '2099-01-01', status: 'unpaid' },
  { id: 'inv-3', student_id: 's-3', student_name: 'Gita', billing_month: '2026-05-01', amount: 14000, due_date: '2020-01-01', status: 'paid' },
]

describe('DefaulterList', () => {
  it('shows only overdue, unpaid invoices', () => {
    render(<DefaulterList invoices={invoices} />)
    expect(screen.getByText('Anjali')).toBeInTheDocument()
    expect(screen.queryByText('Sita')).not.toBeInTheDocument()
    expect(screen.queryByText('Gita')).not.toBeInTheDocument()
  })

  it('shows an empty message when there are no overdue invoices', () => {
    render(<DefaulterList invoices={[invoices[1]]} />)
    expect(screen.getByText(/no overdue invoices/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/DefaulterList.test.tsx`
Expected: FAIL - `Cannot find module './DefaulterList'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/DefaulterList.tsx`:
```tsx
import type { Invoice } from '../../lib/fees'
import { isOverdue } from '../../lib/dues'

export function DefaulterList({ invoices }: { invoices: Invoice[] }) {
  const today = new Date()
  const defaulters = invoices.filter((invoice) => isOverdue(invoice, today))

  if (defaulters.length === 0) {
    return <p className="text-on-surface-variant text-sm">No overdue invoices.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Amount</th>
            <th className="px-8 py-4">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {defaulters.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{invoice.student_name}</td>
              <td className="px-8 py-5 text-on-surface">{invoice.amount}</td>
              <td className="px-8 py-5 text-on-surface-variant">{invoice.due_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/DefaulterList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DefaulterList.tsx src/components/dashboard/DefaulterList.test.tsx
git commit -m "feat: add DefaulterList component"
```

---

### Task 3: `PendingBookingsList` component

**Files:**
- Create: `src/components/dashboard/PendingBookingsList.tsx`, `src/components/dashboard/PendingBookingsList.test.tsx`

**Interfaces:**
- Consumes: `Booking` (existing `lib/bookings.ts`).
- Produces: `export function PendingBookingsList({ bookings }: { bookings: Booking[] })` - consumed by `OwnerDashboard` (Task 5).

- [ ] **Step 1: Write the failing tests**

`src/components/dashboard/PendingBookingsList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PendingBookingsList } from './PendingBookingsList'
import type { Booking } from '../../lib/bookings'

const bookings: Booking[] = [
  {
    id: 'booking-1', name: 'Priya Sharma', phone: '9800000001', guardian_name: null,
    guardian_phone: '9800000002', emergency_contact_name: null, emergency_contact_phone: null,
    note: null, room_type: 'twin', preferred_date: '2026-08-01', status: 'pending',
    reserved_bed_id: null, created_at: '2026-07-20T00:00:00Z',
  },
]

describe('PendingBookingsList', () => {
  it('renders each booking with name, phone, room type, and preferred date', () => {
    render(<PendingBookingsList bookings={bookings} />)
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
    expect(screen.getByText('twin')).toBeInTheDocument()
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
  })

  it('links each row to the site-content review screen', () => {
    render(<PendingBookingsList bookings={bookings} />)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/site-content')
  })

  it('shows an empty message when there are no pending bookings', () => {
    render(<PendingBookingsList bookings={[]} />)
    expect(screen.getByText(/no pending bookings/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/PendingBookingsList.test.tsx`
Expected: FAIL - `Cannot find module './PendingBookingsList'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/PendingBookingsList.tsx`:
```tsx
import type { Booking } from '../../lib/bookings'

export function PendingBookingsList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <p className="text-on-surface-variant text-sm">No pending bookings.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Phone</th>
            <th className="px-8 py-4">Room Type</th>
            <th className="px-8 py-4">Preferred Date</th>
            <th className="px-8 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{booking.name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.phone}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.room_type}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.preferred_date}</td>
              <td className="px-8 py-5">
                <a href="/site-content" className="text-primary font-medium hover:underline">
                  Review
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/PendingBookingsList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/PendingBookingsList.tsx src/components/dashboard/PendingBookingsList.test.tsx
git commit -m "feat: add PendingBookingsList component"
```

---

### Task 4: `PendingTransferRequestsList` component

**Files:**
- Create: `src/components/dashboard/PendingTransferRequestsList.tsx`, `src/components/dashboard/PendingTransferRequestsList.test.tsx`

**Interfaces:**
- Consumes: `TransferRequestWithStudent` (existing `lib/transfers.ts`).
- Produces: `export function PendingTransferRequestsList({ requests }: { requests: TransferRequestWithStudent[] })` - consumed by `WardenDashboard` (Task 6).

- [ ] **Step 1: Write the failing tests**

`src/components/dashboard/PendingTransferRequestsList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PendingTransferRequestsList } from './PendingTransferRequestsList'
import type { TransferRequestWithStudent } from '../../lib/transfers'

const requests: TransferRequestWithStudent[] = [
  {
    id: 'req-1', student_id: 's-1', reason: 'Noisy roommate', preferred_room_type: 'single',
    status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null,
    reject_reason: null, created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali Adhikari',
  },
]

describe('PendingTransferRequestsList', () => {
  it('renders each request with student name, reason, and preferred room type', () => {
    render(<PendingTransferRequestsList requests={requests} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('Noisy roommate')).toBeInTheDocument()
    expect(screen.getByText('single')).toBeInTheDocument()
  })

  it('links each row to the requests review screen', () => {
    render(<PendingTransferRequestsList requests={requests} />)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/requests')
  })

  it('shows an empty message when there are no pending requests', () => {
    render(<PendingTransferRequestsList requests={[]} />)
    expect(screen.getByText(/no pending transfer requests/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/PendingTransferRequestsList.test.tsx`
Expected: FAIL - `Cannot find module './PendingTransferRequestsList'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/PendingTransferRequestsList.tsx`:
```tsx
import type { TransferRequestWithStudent } from '../../lib/transfers'

export function PendingTransferRequestsList({ requests }: { requests: TransferRequestWithStudent[] }) {
  if (requests.length === 0) {
    return <p className="text-on-surface-variant text-sm">No pending transfer requests.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Student</th>
            <th className="px-8 py-4">Reason</th>
            <th className="px-8 py-4">Preferred Type</th>
            <th className="px-8 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{request.student_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{request.reason}</td>
              <td className="px-8 py-5 text-on-surface-variant">{request.preferred_room_type}</td>
              <td className="px-8 py-5">
                <a href="/requests" className="text-primary font-medium hover:underline">
                  Review
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/PendingTransferRequestsList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/PendingTransferRequestsList.tsx src/components/dashboard/PendingTransferRequestsList.test.tsx
git commit -m "feat: add PendingTransferRequestsList component"
```

---

### Task 5: `OwnerDashboard` component

**Files:**
- Create: `src/components/dashboard/OwnerDashboard.tsx`, `src/components/dashboard/OwnerDashboard.test.tsx`

**Interfaces:**
- Consumes: `fetchRoomsWithBeds`, `fetchRoomsWithStatus` (`lib/rooms.ts`), `fetchDuesInvoices` (`lib/fees.ts`), `fetchPendingBookings` (`lib/bookings.ts`), `fetchOpenTickets` (`lib/maintenance.ts`), `calculateOccupancyRate` (`lib/occupancy.ts`), `DefaulterList` (Task 2), `PendingBookingsList` (Task 3), `RoomGrid` (Task 1), `TicketList` (existing `components/maintenance/TicketList.tsx`).
- Produces: `export function OwnerDashboard()` - consumed by the route (Task 9). Fetches its own data on mount (self-contained, matching every other role dashboard in this plan - no props).

- [ ] **Step 1: Write the failing test**

`src/components/dashboard/OwnerDashboard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OwnerDashboard } from './OwnerDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
    { id: 'bed-2', room_id: 'room-1', bed_label: 'B', status: 'vacant', hold_until: null },
  ] },
]

const roomsWithStatus = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'partially_filled' },
]

const invoices = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
]

const bookings = [
  { id: 'booking-1', name: 'Priya Sharma', phone: '9800000001', guardian_name: null, guardian_phone: '9800000002', emergency_contact_name: null, emergency_contact_phone: null, note: null, room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-20T00:00:00Z' },
]

const tickets = [
  { id: 'ticket-1', student_id: 's-2', description: 'Broken fan', status: 'open', created_at: '2026-07-20T00:00:00Z', student_name: 'Sita' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return {
    ...actual,
    fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)),
    fetchRoomsWithStatus: vi.fn(() => Promise.resolve(roomsWithStatus)),
  }
})

vi.mock('../../lib/fees', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/fees')>()
  return { ...actual, fetchDuesInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

vi.mock('../../lib/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/bookings')>()
  return { ...actual, fetchPendingBookings: vi.fn(() => Promise.resolve(bookings)) }
})

vi.mock('../../lib/maintenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/maintenance')>()
  return { ...actual, fetchOpenTickets: vi.fn(() => Promise.resolve(tickets)) }
})

describe('OwnerDashboard', () => {
  it('shows occupancy, vacant beds, and outstanding dues cards', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('14000')).toBeInTheDocument()
  })

  it('toggles the defaulter list when the dues card is clicked', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())

    expect(screen.queryByText('Anjali')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/outstanding dues/i))
    expect(screen.getByText('Anjali')).toBeInTheDocument()
  })

  it('shows the pending bookings and open complaints action lists', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('Priya Sharma')).toBeInTheDocument())
    expect(screen.getByText('Broken fan')).toBeInTheDocument()
  })

  it('shows the room floor grid with no Edit/Delete controls', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/OwnerDashboard.test.tsx`
Expected: FAIL - `Cannot find module './OwnerDashboard'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/OwnerDashboard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, fetchRoomsWithStatus, type Room, type RoomWithStatus } from '../../lib/rooms'
import { fetchDuesInvoices, type Invoice } from '../../lib/fees'
import { fetchPendingBookings, type Booking } from '../../lib/bookings'
import { fetchOpenTickets, type TicketWithStudent } from '../../lib/maintenance'
import { calculateOccupancyRate } from '../../lib/occupancy'
import { DefaulterList } from './DefaulterList'
import { PendingBookingsList } from './PendingBookingsList'
import { RoomGrid } from '../rooms/RoomGrid'
import { TicketList } from '../maintenance/TicketList'

export function OwnerDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [showDefaulters, setShowDefaulters] = useState(false)

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchDuesInvoices().then(setInvoices)
    fetchPendingBookings().then(setBookings)
    fetchOpenTickets().then(setTickets)
  }, [])

  const vacantBedCount = rooms.flatMap((room) => room.beds).filter((bed) => bed.status === 'vacant').length
  const outstandingTotal = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter max-w-4xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        <a href="/room-board" className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 block">
          <p className="text-xs uppercase tracking-wider text-secondary">Vacant Beds</p>
          <p className="font-display text-4xl text-primary mt-2">{vacantBedCount}</p>
        </a>
        <button
          type="button"
          onClick={() => setShowDefaulters((current) => !current)}
          className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 text-left"
        >
          <p className="text-xs uppercase tracking-wider text-secondary">Outstanding Dues</p>
          <p className="font-display text-4xl text-primary mt-2">{outstandingTotal}</p>
          <p className="text-xs text-on-surface-variant mt-1">{invoices.length} invoice(s)</p>
        </button>
      </div>

      {showDefaulters && <DefaulterList invoices={invoices} />}

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Rooms</h3>
        <RoomGrid rooms={roomsWithStatus} role="owner" selectedRoomId={null} onSelectRoom={() => {}} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Pending Bookings</h3>
        <PendingBookingsList bookings={bookings} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Open Complaints</h3>
        <TicketList tickets={tickets} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/OwnerDashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/OwnerDashboard.tsx src/components/dashboard/OwnerDashboard.test.tsx
git commit -m "feat: add OwnerDashboard component"
```

---

### Task 6: `WardenDashboard` component

**Files:**
- Create: `src/components/dashboard/WardenDashboard.tsx`, `src/components/dashboard/WardenDashboard.test.tsx`

**Interfaces:**
- Consumes: `fetchRoomsWithStatus` (`lib/rooms.ts`), `fetchOpenTickets` (`lib/maintenance.ts`), `fetchPendingTransferRequests` (`lib/transfers.ts`), `PendingTransferRequestsList` (Task 4), `RoomGrid` (Task 1), `TicketList` (existing).
- Produces: `export function WardenDashboard()` - consumed by the route (Task 9).

- [ ] **Step 1: Write the failing test**

`src/components/dashboard/WardenDashboard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WardenDashboard } from './WardenDashboard'

const roomsWithStatus = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
]

const tickets = [
  { id: 'ticket-1', student_id: 's-1', description: 'Broken fan', status: 'open', created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali' },
]

const requests = [
  { id: 'req-1', student_id: 's-1', reason: 'Noisy roommate', preferred_room_type: 'single', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithStatus: vi.fn(() => Promise.resolve(roomsWithStatus)) }
})

vi.mock('../../lib/maintenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/maintenance')>()
  return { ...actual, fetchOpenTickets: vi.fn(() => Promise.resolve(tickets)) }
})

vi.mock('../../lib/transfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/transfers')>()
  return { ...actual, fetchPendingTransferRequests: vi.fn(() => Promise.resolve(requests)) }
})

describe('WardenDashboard', () => {
  it('shows open complaints, pending transfer requests, and the read-only room grid', async () => {
    render(<WardenDashboard />)
    await waitFor(() => expect(screen.getByText('Broken fan')).toBeInTheDocument())
    expect(screen.getByText('Noisy roommate')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/WardenDashboard.test.tsx`
Expected: FAIL - `Cannot find module './WardenDashboard'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/WardenDashboard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { fetchRoomsWithStatus, type RoomWithStatus } from '../../lib/rooms'
import { fetchOpenTickets, type TicketWithStudent } from '../../lib/maintenance'
import { fetchPendingTransferRequests, type TransferRequestWithStudent } from '../../lib/transfers'
import { PendingTransferRequestsList } from './PendingTransferRequestsList'
import { RoomGrid } from '../rooms/RoomGrid'
import { TicketList } from '../maintenance/TicketList'

export function WardenDashboard() {
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [requests, setRequests] = useState<TransferRequestWithStudent[]>([])

  useEffect(() => {
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchOpenTickets().then(setTickets)
    fetchPendingTransferRequests().then(setRequests)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Open Complaints</h3>
        <TicketList tickets={tickets} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Pending Transfer Requests</h3>
        <PendingTransferRequestsList requests={requests} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Rooms</h3>
        <RoomGrid rooms={roomsWithStatus} role="warden" selectedRoomId={null} onSelectRoom={() => {}} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/WardenDashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/WardenDashboard.tsx src/components/dashboard/WardenDashboard.test.tsx
git commit -m "feat: add WardenDashboard component"
```

---

### Task 7: `StudentDashboard` component

**Files:**
- Create: `src/components/dashboard/StudentDashboard.tsx`, `src/components/dashboard/StudentDashboard.test.tsx`

**Interfaces:**
- Consumes: `fetchRoomsWithBeds` (`lib/rooms.ts`), `fetchDuesInvoices` (`lib/fees.ts`), `calculateOccupancyRate` (`lib/occupancy.ts`).
- Produces: `export function StudentDashboard()` - consumed by the route (Task 9). Read-only - no payment action.

- [ ] **Step 1: Write the failing test**

`src/components/dashboard/StudentDashboard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StudentDashboard } from './StudentDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
  ] },
]

const invoices = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2026-08-01', status: 'unpaid' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)) }
})

vi.mock('../../lib/fees', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/fees')>()
  return { ...actual, fetchDuesInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

describe('StudentDashboard', () => {
  it('shows occupancy and next-due cards with no pay action', async () => {
    render(<StudentDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/2026-08-01/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/StudentDashboard.test.tsx`
Expected: FAIL - `Cannot find module './StudentDashboard'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/StudentDashboard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../../lib/rooms'
import { fetchDuesInvoices, type Invoice } from '../../lib/fees'
import { calculateOccupancyRate } from '../../lib/occupancy'

export function StudentDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    fetchDuesInvoices().then(setInvoices)
  }, [])

  const nextDue = [...invoices].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter max-w-2xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Next Due</p>
          {nextDue ? (
            <>
              <p className="font-display text-4xl text-primary mt-2">{nextDue.amount}</p>
              <p className="text-xs text-on-surface-variant mt-1">Due {nextDue.due_date}</p>
              <p className="text-xs text-on-surface-variant mt-2">Pay in person or via your guardian.</p>
            </>
          ) : (
            <p className="text-on-surface-variant mt-2">No dues outstanding.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/StudentDashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/StudentDashboard.tsx src/components/dashboard/StudentDashboard.test.tsx
git commit -m "feat: add StudentDashboard component"
```

---

### Task 8: `GuardianDashboard` component

**Files:**
- Create: `src/components/dashboard/GuardianDashboard.tsx`, `src/components/dashboard/GuardianDashboard.test.tsx`

**Interfaces:**
- Consumes: `fetchRoomsWithBeds` (`lib/rooms.ts`), `fetchChildInvoices` (`lib/guardian.ts`), `calculateOccupancyRate` (`lib/occupancy.ts`), `GuardianPaymentForm` (existing `components/guardian/GuardianPaymentForm.tsx`).
- Produces: `export function GuardianDashboard()` - consumed by the route (Task 9). "Pay Now" reveals the existing `GuardianPaymentForm` inline, exactly like `/my-child` already does.

- [ ] **Step 1: Write the failing test**

`src/components/dashboard/GuardianDashboard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GuardianDashboard } from './GuardianDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
  ] },
]

const invoices = [
  { id: 'inv-1', billing_month: '2026-07-01', amount: 14000, due_date: '2026-08-01', status: 'unpaid' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)) }
})

vi.mock('../../lib/guardian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/guardian')>()
  return { ...actual, fetchChildInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

describe('GuardianDashboard', () => {
  it('shows occupancy and next-due cards with a Pay Now button that reveals the payment form', async () => {
    render(<GuardianDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())
    expect(screen.getByText('100%')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /pay now/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))
    expect(screen.getByRole('button', { name: /^pay now$/i })).toBeInTheDocument()
  })
})
```

Note: `GuardianPaymentForm` (existing component) itself renders a submit button also labeled "Pay Now" - the dashboard's own toggle button is deliberately hidden once `paying` is true (see the implementation's `{!paying && (...)}` guard below), so after the click only the form's submit button remains with that label - `getByRole` finding exactly one match (not throwing on a duplicate) is itself the confirmation that the toggle correctly disappeared and the form correctly mounted.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/GuardianDashboard.test.tsx`
Expected: FAIL - `Cannot find module './GuardianDashboard'`

- [ ] **Step 3: Write the implementation**

`src/components/dashboard/GuardianDashboard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../../lib/rooms'
import { fetchChildInvoices, type ChildInvoice } from '../../lib/guardian'
import { calculateOccupancyRate } from '../../lib/occupancy'
import { GuardianPaymentForm } from '../guardian/GuardianPaymentForm'

export function GuardianDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [invoices, setInvoices] = useState<ChildInvoice[]>([])
  const [paying, setPaying] = useState(false)

  function refetchInvoices() {
    fetchChildInvoices().then(setInvoices)
  }

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    refetchInvoices()
  }, [])

  const nextDue = [...invoices].filter((invoice) => invoice.status === 'unpaid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  function handlePaid() {
    setPaying(false)
    refetchInvoices()
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter max-w-2xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Next Due</p>
          {nextDue ? (
            <>
              <p className="font-display text-4xl text-primary mt-2">{nextDue.amount}</p>
              <p className="text-xs text-on-surface-variant mt-1">Due {nextDue.due_date}</p>
              {!paying && (
                <button
                  type="button"
                  onClick={() => setPaying(true)}
                  className="mt-4 bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
                >
                  Pay Now
                </button>
              )}
            </>
          ) : (
            <p className="text-on-surface-variant mt-2">No dues outstanding.</p>
          )}
        </div>
      </div>

      {paying && nextDue && <GuardianPaymentForm invoiceId={nextDue.id} onPaid={handlePaid} />}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/GuardianDashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/GuardianDashboard.tsx src/components/dashboard/GuardianDashboard.test.tsx
git commit -m "feat: add GuardianDashboard component"
```

---

### Task 9: Wire the role-branch into `/dashboard`

**Files:**
- Modify: `src/routes/_authenticated.dashboard.tsx`

**Interfaces:**
- Consumes: `OwnerDashboard` (Task 5), `WardenDashboard` (Task 6), `StudentDashboard` (Task 7), `GuardianDashboard` (Task 8), `useAuth` (existing `lib/auth`).
- Produces: no new exports - final task, route wiring only.

- [ ] **Step 1: Replace `src/routes/_authenticated.dashboard.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { OwnerDashboard } from '../components/dashboard/OwnerDashboard'
import { WardenDashboard } from '../components/dashboard/WardenDashboard'
import { StudentDashboard } from '../components/dashboard/StudentDashboard'
import { GuardianDashboard } from '../components/dashboard/GuardianDashboard'

function DashboardPage() {
  const { role } = useAuth()

  switch (role) {
    case 'owner':
      return <OwnerDashboard />
    case 'warden':
      return <WardenDashboard />
    case 'student':
      return <StudentDashboard />
    case 'guardian':
      return <GuardianDashboard />
    default:
      return null
  }
}

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})
```

(`role` can be `null` briefly while `useAuth()` is still resolving - the `default: return null` case covers that, same as `AdminShell`'s own `if (!role) return null` guard for the same transient state.)

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.dashboard.tsx
git commit -m "feat: wire role-specific dashboards into /dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** owner (occupancy/vacant-beds/dues cards, floor grid, pending bookings + open complaints action list) in Task 5; warden (open complaints, pending transfers, read-only grid) in Task 6; resident (kept occupancy card, read-only next-due) in Task 7; guardian (kept occupancy card, next-due + reused Pay Now) in Task 8; the `RoomGrid` dead-button fix required for read-only embedding in Task 1. All plan items covered. Deliberately-excluded items (charts/trends, attendance-dependent warden layout, "vacating in 30 days," student-facing payment) are listed in the design spec's section 8 and should be repeated to the owner at handoff, matching this session's established reporting pattern.
- **Placeholder scan:** no TBD/TODO; every step has full code.
- **Type consistency:** `Booking`, `TicketWithStudent`, `TransferRequestWithStudent`, `Invoice`, `ChildInvoice`, `Room`, `RoomWithStatus` are all consumed with their existing, unmodified shapes from `lib/` - no redefinition anywhere in this plan.
- **No migrations, confirmed:** every fetch function this plan calls already exists and is already RLS-correct (verified against each lib file's actual current source before writing this plan, including the specific confirmation that a student's own `fetchDuesInvoices()` call is already scoped server-side by `invoices_own_select` RLS with zero new backend work needed).
- **Known bug classes from this project's history, guarded against proactively:**
  - *A reusable component using `<Link>` and breaking in isolated tests*: avoided from the start by using plain `<a href>` in `PendingBookingsList`/`PendingTransferRequestsList`, matching `Sidebar.tsx`'s established, verified-working pattern - confirmed by reading its actual source before writing this plan, not assumed.
  - *A dead, visible-but-non-functional control*: `RoomGrid`'s Edit/Delete gap (Task 1) is exactly this class, caught during design rather than after building the owner dashboard around it.
  - *A component built but never mounted*: all four dashboards are wired into the route in the same task group (Task 9) as their creation, none left dangling.
