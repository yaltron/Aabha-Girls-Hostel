# Role-Specific Dashboards (Spec §7, scoped) - Design Spec

Date: 2026-07-24
Status: Approved

## 1. Overview

Replaces the single shared `DashboardPage` (today: one occupancy card for
everyone, plus a fees-collected card for owner/warden) with four
role-specific dashboards, scoped to the owner's explicit "highest-value
pieces only" instruction - no charts/trends, no attendance-dependent
warden layout (attendance doesn't exist yet), no checkout-dependent
"vacating in 30 days" list (no checkout/vacate-notice date exists
anywhere in this schema - flagged as deferred, not built).

**No migrations in this plan.** Every data source needed already exists
(`fetchRoomsWithBeds`, `fetchRoomsWithStatus`, `fetchDuesInvoices`,
`fetchPendingBookings`, `fetchOpenTickets`, `fetchPendingTransferRequests`,
`fetchChildInvoices`) - this is pure UI composition, reusing what's
already built rather than adding backend surface. Notably: a student's
own `fetchDuesInvoices()` call already returns only their own invoice
today, for free, because `invoices_own_select` RLS (`0006`) scopes it
server-side regardless of what the client queries - no new lib function
needed for "my next due."

## 2. Route structure

One `/dashboard` route, branching into one of four components by role -
matches the existing `useAuth()` + role-branch pattern already used
throughout this codebase (`AdminShell`, `/room-board`, `/fees`), rather
than one large conditional block. Each dashboard is its own small,
independently testable component.

```
src/components/dashboard/
  OwnerDashboard.tsx
  WardenDashboard.tsx
  StudentDashboard.tsx
  GuardianDashboard.tsx
  DefaulterList.tsx              # used by OwnerDashboard
  PendingBookingsList.tsx        # used by OwnerDashboard
  PendingTransferRequestsList.tsx # used by WardenDashboard
```

## 3. Owner dashboard

- **Occupancy card**: `calculateOccupancyRate()` on `fetchRoomsWithBeds()` -
  identical to today's existing calculation, just relocated into the new
  component.
- **Vacant beds card**: count of beds with `status === 'vacant'` across
  the same `fetchRoomsWithBeds()` result. Links to `/room-board` (the
  existing availability view) rather than duplicating a filtered display.
- **Outstanding dues card**: `fetchDuesInvoices()` (owner sees every
  unpaid invoice via `invoices_owner_warden_full_access` RLS) - total
  amount and count. Clicking toggles an inline `DefaulterList` below the
  card (same expand-in-place interaction the floor grid already
  established for room tiles) - not a new route.
- **`DefaulterList`**: the subset of `fetchDuesInvoices()`'s result where
  `isOverdue()` (existing, `lib/dues.ts`) is true - a defaulter is
  specifically overdue, not merely unpaid-but-not-yet-due. Shows name,
  amount, due date.
- **Floor grid**: `fetchRoomsWithStatus()` fed into the existing
  `RoomGrid`, with no `onEditRoom`/`onDeleteRoom` passed - read-only,
  same component `/room-board` uses. See section 5 for a required small
  fix to `RoomGrid` this reuse surfaces.
- **Action list**: `PendingBookingsList` (from `fetchPendingBookings()`)
  and open complaints (`TicketList`, existing component, reused with no
  `onResolve` prop - already correctly hides the resolve action when
  omitted, confirmed by reading its current implementation, no changes
  needed there).
- **`PendingBookingsList`**: one row per pending booking - name, phone,
  room type, preferred date, a "Review" link to `/site-content` (where
  the actual approve/decline workflow already lives via `BookingsQueue`)
  - not a duplicate interactive approval form on the dashboard itself.

## 4. Warden dashboard

- Open complaints: `TicketList` (existing, reused, no `onResolve`).
- Pending transfer requests: new `PendingTransferRequestsList` - one row
  per pending request (student name, reason, preferred room type), a
  "Review" link to `/requests` (where `TransferRequestsQueue`'s actual
  approve/reject workflow already lives) - same "read-only summary,
  link to the real action screen" shape as `PendingBookingsList`.
- Floor grid: same `fetchRoomsWithStatus()` + `RoomGrid`, no edit
  callbacks - `RoomGrid`'s own `role === 'owner'` gate already makes this
  correctly read-only for a warden without any fix needed (the section 5
  fix only matters for the owner's dashboard embedding).

## 5. Required small fix: `RoomGrid`'s dead-button gap

`RoomGrid`'s current condition for showing Edit/Delete is `{canManage &&
(...)}`, where `canManage = role === 'owner'`. This means an owner
viewing a `RoomGrid` with no `onEditRoom`/`onDeleteRoom` passed (exactly
the owner dashboard's read-only embedding) would still see Edit/Delete
buttons rendered - just silently doing nothing when clicked, since the
optional callbacks are `undefined`. Fix: gate on `canManage &&
onEditRoom && onDeleteRoom` instead, so the controls only render when
BOTH the role allows it AND the callbacks were actually provided -
`/room-board`'s existing usage always passes both together already, so
this changes no current behavior there, only the new read-only
dashboard embedding.

## 6. Resident (Student) dashboard

- Occupancy card: kept as-is, per the owner's explicit "keep current
  simple cards" instruction (a student today already sees hostel-wide
  occupancy - unusual but unchanged, not this plan's call to remove).
- Next due card: `fetchDuesInvoices()` (RLS-scoped to the student's own
  invoice automatically, no new lib function), the earliest unpaid
  invoice's amount and due date. Read-only - no "Pay Now" button. No
  student-facing payment path exists anywhere in this app today, and
  building one is a real new feature, not a dashboard-scoped task; the
  card notes "Pay in person or via your guardian."

## 7. Guardian dashboard

- Occupancy card: kept as-is, same reasoning as section 6.
- Next due + pay now card: `fetchChildInvoices()` (existing,
  `lib/guardian.ts`, already RLS-scoped to the linked child), earliest
  unpaid invoice's amount and due date, with a "Pay Now" button that
  reveals the already-built `GuardianPaymentForm` inline - not a new
  payment path, the exact same component `/my-child` already uses,
  relocated onto the dashboard as a shortcut. Refetches on success.

## 8. Deliberately not built (report to the owner at handoff)

- Charts/trends of any kind - explicitly excluded.
- Warden's phone-first single-button attendance layout - attendance
  doesn't exist yet; deferred until it's built.
- "Students vacating within 30 days" - no vacate-notice date exists in
  the schema; deferred until a checkout/vacate workflow is built.
- Student-facing online payment - out of scope; students remain
  read-only on their own dues, same as before this plan.
- A dedicated defaulter-list route/report page - built as an inline
  toggle on the owner dashboard instead, matching the existing
  expand-in-place pattern rather than a new screen.

## 9. Self-Review

- **Placeholder scan**: none.
- **No backend changes**: confirmed every data source is an existing,
  already-RLS-correct lib function - this plan touches no migration.
- **Consistency check**: `RoomGrid`'s fix (section 5) is verified not to
  change `/room-board`'s existing behavior - both callbacks are already
  always passed together there.
- **Scope check**: every "not built" item in section 8 was explicitly
  named by the owner's own instruction (attendance deferred, "if not
  already there" for guardian pay) or surfaced during design as
  genuinely requiring new schema (vacating list, student payment) -
  none silently dropped.
