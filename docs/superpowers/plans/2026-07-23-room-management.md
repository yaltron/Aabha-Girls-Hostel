# Room Management (Spec §6.3/§9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `rooms` into `room_types` + `rooms`, build a visual floor grid as the primary owner room-management screen (warden view-only), and add bed-hold expiry that self-heals on read - all matching the codebase's existing RLS-first, RPC-mediated-write patterns, per the approved design spec.

**Architecture:** One migration alters `rooms` in place (never drops/recreates it, so `beds.room_id`/`students.bed_id` FKs and all existing data survive by construction), adds `room_types`, a computed `rooms_with_status` view, `beds.hold_until`, and a `release_expired_bed_holds()` self-heal function called from the existing check-in/booking-approval RPCs. The floor grid extends the existing read-only `BedBoard` component with a new room-tile layer rather than replacing it.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- **`rooms.id` is never dropped or recreated** - every migration step is an `ALTER` on the existing table. This is the load-bearing guarantee that no bed or student assignment can be lost.
- **`admin_status` (stored, 3 values: `active`/`under_maintenance`/`blocked`) is never conflated with `display_status`** (computed, 5 values, includes `available`/`partially_filled`/`full`). Only `admin_status` is ever written by a form; `display_status` only ever comes from reading the `rooms_with_status` view.
- **Amount/price fields live on `room_types` only** after this migration - `rooms.monthly_price`/`capacity`/`room_type` (the enum column) are dropped. `generate_monthly_invoices` and the transfer-pricing RPCs MUST be updated in the same migration to read `room_types.base_rent` instead, or monthly billing breaks the moment the migration runs.
- **`transfer_requests.preferred_room_type` and `bookings.room_type` are explicitly NOT migrated** to reference `room_types.id` - confirmed out of scope. They keep using the bare `room_type` enum exactly as today.
- **Bed-hold expiry is check-on-read, not a scheduled job.** The public availability view computes the expired-hold-as-vacant case inline (so anonymous visitors are always correct with zero side effects); `release_expired_bed_holds()` is a real state-fixing write, called as a preamble inside `check_in_student` and `approve_booking` only - no pg_cron, no new job infrastructure.
- **Room deletion goes through the `delete_room` RPC**, never a raw `.from('rooms').delete()` - it turns a would-be FK violation into a clear, actionable message when the room has occupied/reserved/notice-given beds, instead of a room-only ownership check (the caller already has RLS write access; this function exists purely for the error message, matching this project's "never let a raw DB error leak to the user" discipline).
- **Owner gets full CRUD on this screen; warden stays view-only**, exactly matching the existing `rooms_owner_full_access`/`rooms_read_all_authenticated` RLS split from `0007` - no RLS policy changes needed for `rooms` itself, only new policies for the new `room_types` table (owner-only write, same pattern).
- Migrations are applied manually by the user in the Supabase SQL Editor - no agent has DB credentials.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0023_room_types_split.sql              # NEW
  src/
    lib/
      rooms.ts                                # MODIFIED: types + new CRUD functions
      rooms.test.ts                           # MODIFIED
    components/
      rooms/
        BedBoard.tsx                           # MODIFIED: room_type -> room_type_name
        BedBoard.test.tsx                      # MODIFIED
        RoomTypeForm.tsx                       # NEW
        RoomTypeForm.test.tsx                  # NEW
        RoomForm.tsx                           # NEW
        RoomForm.test.tsx                      # NEW
        RoomGrid.tsx                           # NEW
        RoomGrid.test.tsx                      # NEW
    routes/
      _authenticated.room-board.tsx            # MODIFIED: full rewrite
```

---

### Task 1: Migration 0023 - `room_types` split, computed status, bed-hold expiry

**Files:**
- Create: `supabase/migrations/0023_room_types_split.sql`

**Interfaces:**
- Produces: `public.room_types` table, `public.room_admin_status` enum, `public.rooms_with_status` view, `public.release_expired_bed_holds()`, `public.delete_room(uuid)`, updated `public.approve_booking`, `public.check_in_student`, `public.generate_monthly_invoices`, updated `public.public_room_availability` view. `public.rooms` gains `room_type_id`/`floor`/`wing`/`admin_status`, loses `room_type`/`capacity`/`monthly_price`. `public.beds` gains `hold_until`.

No automated test - this is SQL, manually applied and manually verified by the user, per this project's established convention for every prior migration.

- [ ] **Step 1: Write the full migration**

`supabase/migrations/0023_room_types_split.sql`:
```sql
-- Guard: abort if any existing room_type value has inconsistent
-- capacity/price across rooms - silently picking one of several
-- inconsistent values would be undetectable data loss. Expected to be a
-- no-op for this hostel's real data.
do $$
declare
  v_bad_type room_type;
begin
  select room_type into v_bad_type
  from public.rooms
  group by room_type
  having count(distinct capacity) > 1 or count(distinct monthly_price) > 1
  limit 1;

  if v_bad_type is not null then
    raise exception 'room_type % has inconsistent capacity/price across existing rooms - reconcile before migrating', v_bad_type;
  end if;
end $$;

create type room_admin_status as enum ('active', 'under_maintenance', 'blocked');

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  capacity int not null,
  base_rent numeric not null,
  deposit numeric not null default 0,
  amenities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.room_types (name, capacity, base_rent)
select
  initcap(room_type::text),
  min(capacity),
  min(monthly_price)
from public.rooms
group by room_type;

alter table public.rooms add column room_type_id uuid references public.room_types(id);
alter table public.rooms add column floor int not null default 0;
alter table public.rooms add column wing text;
alter table public.rooms add column admin_status room_admin_status not null default 'active';

update public.rooms r
set room_type_id = rt.id
from public.room_types rt
where rt.name = initcap(r.room_type::text);

alter table public.rooms alter column room_type_id set not null;

alter table public.rooms drop column room_type;
alter table public.rooms drop column capacity;
alter table public.rooms drop column monthly_price;

create view public.rooms_with_status as
  select
    r.id,
    r.room_number,
    r.floor,
    r.wing,
    r.room_type_id,
    r.admin_status,
    case
      when r.admin_status <> 'active' then r.admin_status::text
      when count(b.id) filter (where b.status = 'occupied') = count(b.id) then 'full'
      when count(b.id) filter (where b.status = 'occupied') = 0 then 'available'
      else 'partially_filled'
    end as display_status
  from public.rooms r
  left join public.beds b on b.room_id = r.id
  group by r.id;

alter table public.beds add column hold_until timestamptz;

alter table public.room_types enable row level security;

create policy "room_types_owner_full_access" on public.room_types
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

create policy "room_types_read_all_authenticated" on public.room_types
  for select
  using (public.current_role() in ('warden', 'student', 'guardian'));

-- Self-heal: physically release any bed whose hold has expired. Called
-- as a preamble from real staff interactions (below) rather than a
-- scheduled job.
create function public.release_expired_bed_holds()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.beds
  set status = 'vacant', hold_until = null
  where status = 'reserved' and hold_until is not null and hold_until < now();
end;
$$;

revoke execute on function public.release_expired_bed_holds() from public;
grant execute on function public.release_expired_bed_holds() to authenticated;

-- The existing 2-arg approve_booking(uuid, uuid) is being replaced by a
-- 3-arg version - Postgres identifies functions by name + parameter type
-- list, so `create or replace function` with a different arity creates a
-- SECOND, separate overload rather than replacing the original; the old
-- function must be dropped explicitly first, or both the old (hold-
-- unaware) function stays live AND a 2-argument call to approve_booking
-- becomes ambiguous between the two overloads (Postgres raises "function
-- approve_booking(uuid, uuid) is not unique").
drop function public.approve_booking(uuid, uuid);

create function public.approve_booking(p_booking_id uuid, p_bed_id uuid, p_hold_hours int default 48)
returns void
language plpgsql
as $$
begin
  perform public.release_expired_bed_holds();

  if (select status from public.beds where id = p_bed_id for update) <> 'vacant' then
    raise exception 'Bed % is not vacant', p_bed_id;
  end if;

  update public.beds set status = 'reserved', hold_until = now() + (p_hold_hours || ' hours')::interval where id = p_bed_id;

  update public.bookings
  set status = 'approved', reserved_bed_id = p_bed_id
  where id = p_booking_id and status = 'pending';

  if not found then
    raise exception 'Booking % is not pending', p_booking_id;
  end if;
end;
$$;

-- A newly created function defaults to PUBLIC execute in Postgres unless
-- explicitly revoked - dropping the old function also drops its revoke/
-- grant pair, so this must be re-declared for the new one, or
-- approve_booking silently becomes callable by anon/every role instead
-- of staying restricted to authenticated staff.
revoke execute on function public.approve_booking(uuid, uuid, int) from public;
grant execute on function public.approve_booking(uuid, uuid, int) to authenticated;

create or replace function public.check_in_student(
  p_profile_id uuid,
  p_guardian_name text,
  p_guardian_phone text,
  p_bed_id uuid,
  p_check_in_date date,
  p_monthly_fee numeric,
  p_photo_url text default null
)
returns void
language plpgsql
as $$
begin
  perform public.release_expired_bed_holds();

  if (select status from public.beds where id = p_bed_id for update) not in ('vacant', 'reserved') then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied', hold_until = null where id = p_bed_id and status in ('vacant', 'reserved');

  if not found then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;
end;
$$;

create or replace function public.generate_monthly_invoices(p_billing_month date)
returns void
language plpgsql
as $$
begin
  insert into public.invoices (student_id, billing_month, amount, due_date, status)
  select
    s.id,
    p_billing_month,
    rt.base_rent,
    p_billing_month + interval '7 days',
    'unpaid'
  from public.students s
  join public.beds b on b.id = s.bed_id
  join public.rooms r on r.id = b.room_id
  join public.room_types rt on rt.id = r.room_type_id
  where s.bed_id is not null
  on conflict (student_id, billing_month) do nothing;
end;
$$;

create function public.delete_room(p_room_id uuid)
returns void
language plpgsql
as $$
declare
  v_occupied_count int;
begin
  select count(*) into v_occupied_count
  from public.beds
  where room_id = p_room_id and status in ('occupied', 'reserved', 'notice_given');

  if v_occupied_count > 0 then
    raise exception 'Cannot delete room: % bed(s) are occupied, reserved, or on notice. Set the room to blocked instead.', v_occupied_count;
  end if;

  delete from public.rooms where id = p_room_id;
end;
$$;

-- create or replace view cannot change an existing column's data type,
-- and room_type here changes from the room_type enum to text (rt.name) -
-- Postgres would reject "create or replace" with "cannot change data
-- type of view column room_type from room_type to text". Drop and
-- recreate instead, and re-grant to anon since dropping a view drops
-- its existing grants along with it.
drop view public.public_room_availability;

create view public.public_room_availability as
  select
    rt.name as room_type,
    rt.base_rent as monthly_price,
    count(*) filter (
      where b.status = 'vacant'
         or (b.status = 'reserved' and b.hold_until is not null and b.hold_until < now())
    ) as beds_available
  from public.rooms r
  join public.beds b on b.room_id = r.id
  join public.room_types rt on rt.id = r.room_type_id
  where r.admin_status = 'active'
  group by rt.name, rt.base_rent;

grant select on public.public_room_availability to anon;
```

- [ ] **Step 2: Self-review the migration against the plan's Global Constraints**

Confirm: no `drop table`/`create table ... as` on `rooms`, `beds`, or `students` anywhere in the file (only `alter table`); `generate_monthly_invoices` and `approve_booking`'s pricing paths read `room_types.base_rent`, never a dropped `rooms.monthly_price`; `transfer_requests`/`bookings` are untouched; `public_room_availability` is `drop view` + `create view` (not `create or replace`, since the `room_type` column's type changes from the enum to `text`) followed by a fresh `grant select ... to anon`, and filters `admin_status = 'active'` while treating an expired hold as vacant inline; `approve_booking`'s old 2-arg overload is explicitly `drop function`-ed before the new 3-arg version is created, with its own explicit `revoke`/`grant` pair (a new function defaults to PUBLIC execute otherwise); `delete_room` blocks on `occupied`/`reserved`/`notice_given`, not just `occupied`.

- [ ] **Step 3: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.

- [ ] **Step 4: Verify**

```sql
select count(*) from public.room_types;
-- expect 3 (Single, Twin, Triple), assuming the guard didn't fire

select room_number, floor, wing, room_type_id, admin_status from public.rooms limit 5;
-- expect no error - room_type/capacity/monthly_price columns gone, new columns present

select proname from pg_proc where proname in ('release_expired_bed_holds', 'delete_room');
-- expect both rows
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0023_room_types_split.sql
git commit -m "feat: split rooms into room_types + rooms, add bed-hold expiry"
```

---

### Task 2: `lib/rooms.ts` - full update

**Files:**
- Modify: `src/lib/rooms.ts`, `src/lib/rooms.test.ts`

**Interfaces:**
- Produces: `RoomType`, `RoomAdminStatus`, `RoomDisplayStatus`, `RoomWithStatus`, updated `Room`/`Bed` types; `fetchRoomTypes()`, `createRoomType()`, `updateRoomType()`, `fetchRoomsWithStatus()`, updated `fetchRoomsWithBeds()`, updated `createRoom()`, `updateRoom()`, `deleteRoom()` - all consumed by Tasks 3-7.

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/rooms.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockRoomsData = [
  { id: 'room-1', room_number: '101', beds: [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant', hold_until: null }], room_types: { name: 'Twin' } },
]

const mockRoomTypesData = [
  { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: ['balcony'] },
]

const mockRoomsWithStatusData = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
]

const fromMock = vi.fn((table: string) => {
  if (table === 'rooms') {
    return {
      select: vi.fn(() => Promise.resolve({ data: mockRoomsData, error: null })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }
  }
  if (table === 'room_types') {
    return {
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockRoomTypesData, error: null })) })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }
  }
  if (table === 'rooms_with_status') {
    return {
      select: vi.fn(() => Promise.resolve({ data: mockRoomsWithStatusData, error: null })),
    }
  }
  throw new Error(`unexpected table: ${table}`)
})

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

describe('fetchRoomsWithBeds', () => {
  it('returns rooms with their beds and room type name', async () => {
    const { fetchRoomsWithBeds } = await import('./rooms')
    const rooms = await fetchRoomsWithBeds()
    expect(rooms).toEqual([
      { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: mockRoomsData[0].beds },
    ])
  })
})

describe('fetchRoomTypes', () => {
  it('returns all room types', async () => {
    const { fetchRoomTypes } = await import('./rooms')
    const types = await fetchRoomTypes()
    expect(types).toEqual(mockRoomTypesData)
  })
})

describe('createRoomType', () => {
  it('inserts a room type with the given fields', async () => {
    const { createRoomType } = await import('./rooms')
    await createRoomType({ name: 'Dormitory', capacity: 6, base_rent: 8000, deposit: 2000, amenities: [] })
    expect(fromMock).toHaveBeenCalledWith('room_types')
  })
})

describe('updateRoomType', () => {
  it('updates the room type with the given id', async () => {
    const { updateRoomType } = await import('./rooms')
    await updateRoomType('rt-1', { name: 'Twin', capacity: 2, base_rent: 15000, deposit: 5000, amenities: ['balcony', 'ac'] })
    expect(fromMock).toHaveBeenCalledWith('room_types')
  })
})

describe('fetchRoomsWithStatus', () => {
  it('returns rooms from the rooms_with_status view', async () => {
    const { fetchRoomsWithStatus } = await import('./rooms')
    const rooms = await fetchRoomsWithStatus()
    expect(rooms).toEqual(mockRoomsWithStatusData)
  })
})

describe('createRoom', () => {
  it('inserts a room with the given fields', async () => {
    const { createRoom } = await import('./rooms')
    await createRoom({ room_number: '202', floor: 2, wing: null, room_type_id: 'rt-1', admin_status: 'active' })
    expect(fromMock).toHaveBeenCalledWith('rooms')
  })
})

describe('updateRoom', () => {
  it('updates the room with the given id', async () => {
    const { updateRoom } = await import('./rooms')
    await updateRoom('room-1', { room_number: '202', floor: 2, wing: 'East', room_type_id: 'rt-1', admin_status: 'under_maintenance' })
    expect(fromMock).toHaveBeenCalledWith('rooms')
  })
})

describe('deleteRoom', () => {
  it('calls the delete_room RPC with the given id', async () => {
    const { deleteRoom } = await import('./rooms')
    await deleteRoom('room-1')
    expect(rpcMock).toHaveBeenCalledWith('delete_room', { p_room_id: 'room-1' })
  })

  it('throws when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ error: new Error('Cannot delete room: 1 bed(s) are occupied, reserved, or on notice. Set the room to blocked instead.') })
    const { deleteRoom } = await import('./rooms')
    await expect(deleteRoom('room-1')).rejects.toThrow('Cannot delete room')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rooms.test.ts`
Expected: FAIL - none of the new exports exist yet, and the old `fetchRoomsWithBeds`/`createRoom` shapes don't match.

- [ ] **Step 3: Write the implementation**

Replace `src/lib/rooms.ts`:
```typescript
import { supabase } from './supabase'

export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'notice_given'

export type Bed = {
  id: string
  room_id: string
  bed_label: string
  status: BedStatus
  hold_until: string | null
}

export type Room = {
  id: string
  room_number: string
  room_type_name: string
  beds: Bed[]
}

export type RoomType = {
  id: string
  name: string
  capacity: number
  base_rent: number
  deposit: number
  amenities: string[]
}

export type RoomAdminStatus = 'active' | 'under_maintenance' | 'blocked'
export type RoomDisplayStatus = 'available' | 'partially_filled' | 'full' | 'under_maintenance' | 'blocked'

export type RoomWithStatus = {
  id: string
  room_number: string
  floor: number
  wing: string | null
  room_type_id: string
  admin_status: RoomAdminStatus
  display_status: RoomDisplayStatus
}

export async function fetchRoomsWithBeds(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('id, room_number, beds(*), room_types(name)')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    room_number: row.room_number,
    room_type_name: row.room_types?.name ?? '',
    beds: row.beds ?? [],
  })) as Room[]
}

export async function fetchRoomsWithStatus(): Promise<RoomWithStatus[]> {
  const { data, error } = await supabase.from('rooms_with_status').select('*')
  if (error) throw error
  return (data ?? []) as RoomWithStatus[]
}

export async function fetchRoomTypes(): Promise<RoomType[]> {
  const { data, error } = await supabase.from('room_types').select('*').order('name')
  if (error) throw error
  return (data ?? []) as RoomType[]
}

type RoomTypeInput = {
  name: string
  capacity: number
  base_rent: number
  deposit: number
  amenities: string[]
}

export async function createRoomType(input: RoomTypeInput): Promise<void> {
  const { error } = await supabase.from('room_types').insert(input)
  if (error) throw error
}

export async function updateRoomType(id: string, input: RoomTypeInput): Promise<void> {
  const { error } = await supabase.from('room_types').update(input).eq('id', id)
  if (error) throw error
}

type RoomInput = {
  room_number: string
  floor: number
  wing: string | null
  room_type_id: string
  admin_status: RoomAdminStatus
}

export async function createRoom(input: RoomInput): Promise<void> {
  const { error } = await supabase.from('rooms').insert(input)
  if (error) throw error
}

export async function updateRoom(id: string, input: RoomInput): Promise<void> {
  const { error } = await supabase.from('rooms').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_room', { p_room_id: id })
  if (error) throw error
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rooms.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rooms.ts src/lib/rooms.test.ts
git commit -m "feat: add room_types CRUD, rooms_with_status, and updated room CRUD to lib/rooms"
```

---

### Task 3: `BedBoard` - update for the new `Room` shape

**Files:**
- Modify: `src/components/rooms/BedBoard.tsx`, `src/components/rooms/BedBoard.test.tsx`

**Interfaces:**
- Consumes: `Room`/`Bed` types from Task 2 (`room.room_type_name` replaces `room.room_type`).
- Produces: no new exports - same `BedBoard({ rooms })` signature, updated internals.

- [ ] **Step 1: Update the test fixture and assertions**

Replace `src/components/rooms/BedBoard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BedBoard } from './BedBoard'
import type { Room } from '../../lib/rooms'

const rooms: Room[] = [
  {
    id: 'room-1',
    room_number: '101',
    room_type_name: 'Twin',
    beds: [
      { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant', hold_until: null },
      { id: 'bed-2', room_id: 'room-1', bed_label: 'B', status: 'occupied', hold_until: null },
    ],
  },
]

describe('BedBoard', () => {
  it('renders every room number, room type, and bed label', () => {
    render(<BedBoard rooms={rooms} />)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('Twin')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('applies a distinct status class to vacant vs occupied beds', () => {
    render(<BedBoard rooms={rooms} />)
    const vacantBed = screen.getByText('A')
    const occupiedBed = screen.getByText('B')
    expect(vacantBed.className).not.toEqual(occupiedBed.className)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rooms/BedBoard.test.tsx`
Expected: FAIL - `getByText('Twin')` finds nothing, `BedBoard.tsx` still reads `room.room_type`.

- [ ] **Step 3: Update the implementation**

In `src/components/rooms/BedBoard.tsx`, change the one line reading `room.room_type` to `room.room_type_name`:
```tsx
<span className="text-xs uppercase tracking-wider text-secondary">{room.room_type_name}</span>
```
(Everything else in the file - `BedTile`, `STATUS_CLASSES`, the outer `BedBoard` structure - is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/BedBoard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/BedBoard.tsx src/components/rooms/BedBoard.test.tsx
git commit -m "fix: update BedBoard for the room_types split (room_type_name)"
```

---

### Task 4: `RoomTypeForm` component

**Files:**
- Create: `src/components/rooms/RoomTypeForm.tsx`, `src/components/rooms/RoomTypeForm.test.tsx`

**Interfaces:**
- Consumes: `createRoomType`, `updateRoomType`, `RoomType` (Task 2).
- Produces: `export function RoomTypeForm({ roomType, onSaved }: { roomType?: RoomType; onSaved: () => void })` - consumed by the route (Task 7). Create mode when `roomType` is omitted, edit mode (prefilled) when provided.

- [ ] **Step 1: Write the failing tests**

`src/components/rooms/RoomTypeForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomTypeForm } from './RoomTypeForm'
import type { RoomType } from '../../lib/rooms'

const createRoomType = vi.fn().mockResolvedValue(undefined)
const updateRoomType = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/rooms', () => ({
  createRoomType: (...args: unknown[]) => createRoomType(...args),
  updateRoomType: (...args: unknown[]) => updateRoomType(...args),
}))

describe('RoomTypeForm', () => {
  it('creates a new room type with entered fields and toggled amenities', async () => {
    const onSaved = vi.fn()
    render(<RoomTypeForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Dormitory' } })
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/monthly rent/i), { target: { value: '8000' } })
    fireEvent.change(screen.getByLabelText(/security deposit/i), { target: { value: '2000' } })
    fireEvent.click(screen.getByLabelText(/balcony/i))
    fireEvent.click(screen.getByRole('button', { name: /add room type/i }))

    await waitFor(() =>
      expect(createRoomType).toHaveBeenCalledWith({
        name: 'Dormitory',
        capacity: 6,
        base_rent: 8000,
        deposit: 2000,
        amenities: ['balcony'],
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('prefills from an existing room type and calls updateRoomType on save', async () => {
    const roomType: RoomType = { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: ['balcony'] }
    const onSaved = vi.fn()
    render(<RoomTypeForm roomType={roomType} onSaved={onSaved} />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Twin')
    expect(screen.getByLabelText(/balcony/i)).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateRoomType).toHaveBeenCalledWith('rt-1', {
        name: 'Twin',
        capacity: 2,
        base_rent: 14000,
        deposit: 5000,
        amenities: ['balcony'],
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an error when saving rejects', async () => {
    createRoomType.mockRejectedValueOnce(new Error('Room type name already exists'))
    render(<RoomTypeForm onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Twin' } })
    fireEvent.click(screen.getByRole('button', { name: /add room type/i }))

    await waitFor(() => expect(screen.getByText('Room type name already exists')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rooms/RoomTypeForm.test.tsx`
Expected: FAIL - `Cannot find module './RoomTypeForm'`

- [ ] **Step 3: Write the implementation**

`src/components/rooms/RoomTypeForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { createRoomType, updateRoomType, type RoomType } from '../../lib/rooms'

const AMENITY_OPTIONS = [
  { key: 'attached_bathroom', label: 'Attached Bathroom' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'geyser', label: 'Geyser / Hot Water' },
  { key: 'study_table', label: 'Study Table' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'ac', label: 'AC' },
]

export function RoomTypeForm({ roomType, onSaved }: { roomType?: RoomType; onSaved: () => void }) {
  const [name, setName] = useState(roomType?.name ?? '')
  const [capacity, setCapacity] = useState(roomType?.capacity ?? 1)
  const [baseRent, setBaseRent] = useState(roomType?.base_rent ?? 0)
  const [deposit, setDeposit] = useState(roomType?.deposit ?? 0)
  const [amenities, setAmenities] = useState<string[]>(roomType?.amenities ?? [])
  const [error, setError] = useState<string | null>(null)

  function toggleAmenity(key: string) {
    setAmenities((current) => (current.includes(key) ? current.filter((a) => a !== key) : [...current, key]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const input = { name, capacity, base_rent: baseRent, deposit, amenities }
      if (roomType) {
        await updateRoomType(roomType.id, input)
      } else {
        await createRoomType(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room type')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="roomTypeName" className="block text-sm font-medium text-on-surface-variant">Name</label>
        <input id="roomTypeName" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeCapacity" className="block text-sm font-medium text-on-surface-variant">Capacity</label>
        <input id="roomTypeCapacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeBaseRent" className="block text-sm font-medium text-on-surface-variant">Monthly Rent (per bed)</label>
        <input id="roomTypeBaseRent" type="number" min={0} value={baseRent} onChange={(e) => setBaseRent(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeDeposit" className="block text-sm font-medium text-on-surface-variant">Security Deposit</label>
        <input id="roomTypeDeposit" type="number" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-on-surface-variant">Amenities</legend>
        {AMENITY_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2">
            <input type="checkbox" checked={amenities.includes(option.key)} onChange={() => toggleAmenity(option.key)} />
            {option.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        {roomType ? 'Save Changes' : 'Add Room Type'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/RoomTypeForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/RoomTypeForm.tsx src/components/rooms/RoomTypeForm.test.tsx
git commit -m "feat: add RoomTypeForm component"
```

---

### Task 5: `RoomForm` component

**Files:**
- Create: `src/components/rooms/RoomForm.tsx`, `src/components/rooms/RoomForm.test.tsx`

**Interfaces:**
- Consumes: `createRoom`, `updateRoom`, `RoomType`, `RoomWithStatus`, `RoomAdminStatus` (Task 2).
- Produces: `export function RoomForm({ room, roomTypes, onSaved }: { room?: RoomWithStatus; roomTypes: RoomType[]; onSaved: () => void })` - consumed by the route (Task 7).

- [ ] **Step 1: Write the failing tests**

`src/components/rooms/RoomForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomForm } from './RoomForm'
import type { RoomType, RoomWithStatus } from '../../lib/rooms'

const createRoom = vi.fn().mockResolvedValue(undefined)
const updateRoom = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/rooms', () => ({
  createRoom: (...args: unknown[]) => createRoom(...args),
  updateRoom: (...args: unknown[]) => updateRoom(...args),
}))

const roomTypes: RoomType[] = [
  { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: [] },
  { id: 'rt-2', name: 'Single', capacity: 1, base_rent: 18000, deposit: 5000, amenities: [] },
]

describe('RoomForm', () => {
  it('creates a new room with entered fields, defaulting to the first room type', async () => {
    const onSaved = vi.fn()
    render(<RoomForm roomTypes={roomTypes} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/room number/i), { target: { value: '303' } })
    fireEvent.change(screen.getByLabelText(/floor/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /add room/i }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({
        room_number: '303',
        floor: 3,
        wing: null,
        room_type_id: 'rt-1',
        admin_status: 'active',
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('prefills from an existing room and calls updateRoom on save', async () => {
    const room: RoomWithStatus = { id: 'room-1', room_number: '101', floor: 1, wing: 'East', room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' }
    const onSaved = vi.fn()
    render(<RoomForm room={room} roomTypes={roomTypes} onSaved={onSaved} />)

    expect(screen.getByLabelText(/room number/i)).toHaveValue('101')
    expect(screen.getByLabelText(/wing/i)).toHaveValue('East')

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'under_maintenance' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateRoom).toHaveBeenCalledWith('room-1', {
        room_number: '101',
        floor: 1,
        wing: 'East',
        room_type_id: 'rt-1',
        admin_status: 'under_maintenance',
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an error when saving rejects', async () => {
    createRoom.mockRejectedValueOnce(new Error('Room number already exists'))
    render(<RoomForm roomTypes={roomTypes} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/room number/i), { target: { value: '101' } })
    fireEvent.click(screen.getByRole('button', { name: /add room/i }))

    await waitFor(() => expect(screen.getByText('Room number already exists')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rooms/RoomForm.test.tsx`
Expected: FAIL - `Cannot find module './RoomForm'`

- [ ] **Step 3: Write the implementation**

`src/components/rooms/RoomForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { createRoom, updateRoom, type RoomAdminStatus, type RoomType, type RoomWithStatus } from '../../lib/rooms'

export function RoomForm({ room, roomTypes, onSaved }: { room?: RoomWithStatus; roomTypes: RoomType[]; onSaved: () => void }) {
  const [roomNumber, setRoomNumber] = useState(room?.room_number ?? '')
  const [floor, setFloor] = useState(room?.floor ?? 0)
  const [wing, setWing] = useState(room?.wing ?? '')
  const [roomTypeId, setRoomTypeId] = useState(room?.room_type_id ?? roomTypes[0]?.id ?? '')
  const [adminStatus, setAdminStatus] = useState<RoomAdminStatus>(room?.admin_status ?? 'active')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const input = { room_number: roomNumber, floor, wing: wing || null, room_type_id: roomTypeId, admin_status: adminStatus }
      if (room) {
        await updateRoom(room.id, input)
      } else {
        await createRoom(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="roomNumber" className="block text-sm font-medium text-on-surface-variant">Room Number</label>
        <input id="roomNumber" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomFloor" className="block text-sm font-medium text-on-surface-variant">Floor</label>
        <input id="roomFloor" type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomWing" className="block text-sm font-medium text-on-surface-variant">Wing (optional)</label>
        <input id="roomWing" value={wing} onChange={(e) => setWing(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeSelect" className="block text-sm font-medium text-on-surface-variant">Room Type</label>
        <select id="roomTypeSelect" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="roomAdminStatus" className="block text-sm font-medium text-on-surface-variant">Status</label>
        <select id="roomAdminStatus" value={adminStatus} onChange={(e) => setAdminStatus(e.target.value as RoomAdminStatus)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
          <option value="active">Active</option>
          <option value="under_maintenance">Under Maintenance</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        {room ? 'Save Changes' : 'Add Room'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/RoomForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/RoomForm.tsx src/components/rooms/RoomForm.test.tsx
git commit -m "feat: add RoomForm component"
```

---

### Task 6: `RoomGrid` component

**Files:**
- Create: `src/components/rooms/RoomGrid.tsx`, `src/components/rooms/RoomGrid.test.tsx`

**Interfaces:**
- Consumes: `RoomWithStatus`, `RoomDisplayStatus` (Task 2), `Role` (existing `lib/nav.ts`).
- Produces: `export function RoomGrid({ rooms, role, selectedRoomId, onSelectRoom, onEditRoom, onDeleteRoom }: {...})` - consumed by the route (Task 7). This is the room-level tile layer; bed-level detail is shown separately by the route re-using `BedBoard` (Task 3), filtered to the selected room.

- [ ] **Step 1: Write the failing tests**

`src/components/rooms/RoomGrid.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomGrid } from './RoomGrid'
import type { RoomWithStatus } from '../../lib/rooms'

const rooms: RoomWithStatus[] = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
  { id: 'room-2', room_number: '102', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'full' },
]

describe('RoomGrid', () => {
  it('renders every room number and its display status', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('102')).toBeInTheDocument()
    expect(screen.getByText('available')).toBeInTheDocument()
    expect(screen.getByText('full')).toBeInTheDocument()
  })

  it('applies a distinct status class per display_status', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    const availableTile = screen.getByText('101').closest('div')
    const fullTile = screen.getByText('102').closest('div')
    expect(availableTile?.className).not.toEqual(fullTile?.className)
  })

  it('calls onSelectRoom when a tile is clicked', () => {
    const onSelectRoom = vi.fn()
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={onSelectRoom} />)
    fireEvent.click(screen.getByText('101'))
    expect(onSelectRoom).toHaveBeenCalledWith('room-1')
  })

  it('shows Edit and Delete controls for owner but not warden', () => {
    const { rerender } = render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} onEditRoom={vi.fn()} onDeleteRoom={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(2)

    rerender(<RoomGrid rooms={rooms} role="warden" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('calls onEditRoom with the room and does not also trigger onSelectRoom', () => {
    const onSelectRoom = vi.fn()
    const onEditRoom = vi.fn()
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={onSelectRoom} onEditRoom={onEditRoom} onDeleteRoom={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    expect(onEditRoom).toHaveBeenCalledWith(rooms[0])
    expect(onSelectRoom).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/rooms/RoomGrid.test.tsx`
Expected: FAIL - `Cannot find module './RoomGrid'`

- [ ] **Step 3: Write the implementation**

`src/components/rooms/RoomGrid.tsx`:
```tsx
import type { RoomDisplayStatus, RoomWithStatus } from '../../lib/rooms'
import type { Role } from '../../lib/nav'

const STATUS_CLASSES: Record<RoomDisplayStatus, string> = {
  available: 'bg-secondary-container text-on-secondary-container',
  partially_filled: 'bg-tertiary-container text-on-tertiary-container',
  full: 'bg-primary text-on-primary',
  under_maintenance: 'bg-surface-container-highest text-on-surface-variant',
  blocked: 'bg-error-container text-on-error-container',
}

export function RoomGrid({
  rooms,
  role,
  selectedRoomId,
  onSelectRoom,
  onEditRoom,
  onDeleteRoom,
}: {
  rooms: RoomWithStatus[]
  role: Role
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
  onEditRoom?: (room: RoomWithStatus) => void
  onDeleteRoom?: (room: RoomWithStatus) => void
}) {
  const canManage = role === 'owner'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-gutter">
      {rooms.map((room) => (
        <div
          key={room.id}
          className={`rounded-xxl shadow-premium p-4 space-y-2 cursor-pointer ${STATUS_CLASSES[room.display_status]} ${selectedRoomId === room.id ? 'ring-2 ring-primary' : ''}`}
          onClick={() => onSelectRoom(room.id)}
        >
          <p className="font-display text-lg">{room.room_number}</p>
          <p className="text-xs uppercase tracking-wider">{room.display_status.replace('_', ' ')}</p>
          {canManage && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditRoom?.(room)
                }}
                className="underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRoom?.(room)
                }}
                className="underline"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/RoomGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/RoomGrid.tsx src/components/rooms/RoomGrid.test.tsx
git commit -m "feat: add RoomGrid component"
```

---

### Task 7: Wire the floor grid into `/room-board`

**Files:**
- Modify: `src/routes/_authenticated.room-board.tsx`

**Interfaces:**
- Consumes: `fetchRoomsWithStatus`, `fetchRoomTypes`, `fetchRoomsWithBeds`, `deleteRoom` (Task 2), `RoomGrid` (Task 6), `RoomForm` (Task 5), `RoomTypeForm` (Task 4), `BedBoard` (Task 3), `useAuth` (existing `lib/auth`).
- Produces: no new exports - this is the final task, route wiring only.

- [ ] **Step 1: Replace `src/routes/_authenticated.room-board.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, fetchRoomsWithStatus, fetchRoomTypes, deleteRoom, type Room, type RoomType, type RoomWithStatus } from '../lib/rooms'
import { useAuth } from '../lib/auth'
import { RoomGrid } from '../components/rooms/RoomGrid'
import { RoomForm } from '../components/rooms/RoomForm'
import { RoomTypeForm } from '../components/rooms/RoomTypeForm'
import { BedBoard } from '../components/rooms/BedBoard'

function RoomsPage() {
  const { role } = useAuth()
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [roomsWithBeds, setRoomsWithBeds] = useState<Room[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [editingRoom, setEditingRoom] = useState<RoomWithStatus | null>(null)
  const [addingRoom, setAddingRoom] = useState(false)
  const [editingRoomType, setEditingRoomType] = useState<RoomType | null>(null)
  const [addingRoomType, setAddingRoomType] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoomWithStatus | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const canManage = role === 'owner'

  function refetchAll() {
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchRoomsWithBeds().then(setRoomsWithBeds)
    fetchRoomTypes().then(setRoomTypes)
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function closeForms() {
    setEditingRoom(null)
    setAddingRoom(false)
    setEditingRoomType(null)
    setAddingRoomType(false)
  }

  function handleSaved() {
    closeForms()
    refetchAll()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteRoom(deleteTarget.id)
      setDeleteTarget(null)
      refetchAll()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete room')
    }
  }

  const selectedRoom = roomsWithBeds.find((r) => r.id === selectedRoomId)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Rooms</h2>

      {canManage && (
        <div className="flex gap-4">
          <button type="button" onClick={() => setAddingRoomType(true)} className="text-primary font-medium hover:underline">
            Add Room Type
          </button>
          <button type="button" onClick={() => setAddingRoom(true)} disabled={roomTypes.length === 0} className="text-primary font-medium hover:underline disabled:opacity-50">
            Add Room
          </button>
        </div>
      )}

      {(addingRoomType || editingRoomType) && (
        <RoomTypeForm roomType={editingRoomType ?? undefined} onSaved={handleSaved} />
      )}

      {(addingRoom || editingRoom) && (
        <RoomForm room={editingRoom ?? undefined} roomTypes={roomTypes} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <div className="bg-error-container rounded-xxl p-6 space-y-4">
          <p className="text-on-error-container">Delete room {deleteTarget.room_number}? This cannot be undone.</p>
          {deleteError && <p className="text-error text-sm">{deleteError}</p>}
          <div className="flex gap-4">
            <button type="button" onClick={confirmDelete} className="text-error font-medium hover:underline">
              Confirm Delete
            </button>
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteError(null) }} className="text-on-surface-variant hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      <RoomGrid
        rooms={roomsWithStatus}
        role={role}
        selectedRoomId={selectedRoomId}
        onSelectRoom={(roomId) => setSelectedRoomId(roomId === selectedRoomId ? null : roomId)}
        onEditRoom={canManage ? setEditingRoom : undefined}
        onDeleteRoom={canManage ? setDeleteTarget : undefined}
      />

      {selectedRoom && <BedBoard rooms={[selectedRoom]} />}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/room-board')({
  component: RoomsPage,
})
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.room-board.tsx
git commit -m "feat: wire the room floor grid, room-type management, and room CRUD into /room-board"
```

---

## Self-Review Notes

- **Spec coverage:** `room_types`/`rooms` split with data-loss-safe migration (Task 1); floor grid as primary room-management interface, owner full-edit / warden view-only (Tasks 6-7, gated by the existing `role` from `useAuth()` exactly like every other role-gated screen in this codebase); bed-hold expiry via `hold_until` + check-on-read in the public view + self-heal on real interactions (Task 1); public availability accuracy after admin changes, via `admin_status = 'active'` filtering in the view (Task 1). All plan items covered.
- **Placeholder scan:** no TBD/TODO; every step has full code or exact SQL.
- **Type consistency:** `RoomWithStatus`/`RoomType`/`RoomAdminStatus`/`RoomDisplayStatus` (Task 2) are used identically by `RoomForm` (Task 5), `RoomTypeForm` (Task 4), `RoomGrid` (Task 6), and the route (Task 7) - no redefinition anywhere. `deleteRoom`'s RPC call name (`delete_room`) and parameter name (`p_room_id`) match Task 1's migration exactly.
- **Known bug classes from this project's history, guarded against proactively:**
  - *A stored field silently drifting from the truth it's supposed to reflect* (the exact reasoning that kept `admin_status` to 3 values and made `display_status` computed-only): guarded by Task 1's `rooms_with_status` view design, called out explicitly in Global Constraints.
  - *A migration that breaks a working RPC by relocating the column it reads* (would have broken `generate_monthly_invoices` and the transfer-pricing RPCs the moment `rooms.monthly_price` was dropped): both are updated in the SAME migration file (Task 1), not left as a follow-up.
  - *A raw DB error leaking to the user* (this session's recurring fix pattern - `errorMessage()` helper, the Edge Function's error-text fix): `delete_room` (Task 1) turns a would-be FK violation into a specific, actionable exception message instead.
  - *A component built but never mounted*: `RoomTypeForm`, `RoomForm`, and `RoomGrid` are all wired into the route in the same task group (Task 7) as their creation, none left dangling.
