# Room Management (Spec §6.3/§9) - Design Spec

Date: 2026-07-23
Status: Approved

## 1. Overview

Implements the room-management scope of `docs:spec.md.pdf` sections 6.3
("Room and bed management") and 9 (data model), against the codebase as it
exists today rather than rewriting it. Three parts, confirmed with the
owner:

1. Split the flat `rooms` table (which currently carries `room_type`,
   `capacity`, `monthly_price` inline per room) into `room_types` (shared
   definition: name, capacity, base rent, deposit, amenities) and `rooms`
   (physical inventory: number, floor, wing, a status an owner can set,
   and a reference to its type) - migrated in place with zero data loss.
2. A visual floor grid as the primary room-management screen, extending
   the existing (currently read-only, bed-level-only) `BedBoard`
   component on the `/room-board` route rather than building a new page.
   Owner gets full CRUD; warden keeps view-only, unchanged from today.
3. Bed-hold expiry: `beds.hold_until`, set when `approve_booking` reserves
   a bed for a booking. Expired holds are corrected via check-on-read
   logic, not a scheduled job - confirmed with the owner as the approach
   matching this project's existing patterns (no pg_cron, no new
   infrastructure class).

**Explicitly out of scope**, confirmed with the owner: `transfer_requests`
and `bookings` keep referencing the bare `room_type` enum
(`single`/`twin`/`triple`) exactly as today - they are NOT migrated to
reference `room_types.id`. This is a smaller, contained change; a future
normalization pass can widen it if ever needed.

## 2. Why this is safe for existing bed/student assignments

`rooms.id` never changes. The migration `ALTER`s the existing `rooms`
table in place - adds new columns, backfills them, drops the old ones -
and never drops or recreates the table itself. `beds.room_id` and
`students.bed_id` are foreign keys into stable primary keys that are
never touched, so no bed or student assignment can be lost or orphaned by
this migration, by construction.

## 3. Data model

### 3.1 `room_types` (new table)

```sql
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  capacity int not null,
  base_rent numeric not null,
  deposit numeric not null default 0,
  amenities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
```

- `amenities` is a JSON array of string keys (e.g.
  `["attached_bathroom", "balcony"]`) - the UI presents a fixed checkbox
  list, the column itself stays a simple untyped array (no separate join
  table - this is exactly the kind of "simple checkbox list" YAGNI called
  for, not a many-to-many amenities table).
- `name` is unique so the migration can safely map old `room_type` enum
  values onto rows here without collision.

### 3.2 `rooms` (altered)

Before (current, `0003_rooms_and_beds.sql`):
```
id, room_number, room_type (enum), capacity, monthly_price, created_at
```

After:
```
id, room_number, floor, wing, room_type_id (FK -> room_types), admin_status, created_at
```

```sql
create type room_admin_status as enum ('active', 'under_maintenance', 'blocked');
```

`admin_status` is deliberately a 3-value enum, not the 5-value
`available/partially_filled/full/under_maintenance/blocked` list spec
section 6.3 names. Those first three values are never independently true
- they're fully determined by comparing occupied-bed count to capacity,
and storing them as an editable column would let them silently drift out
of sync the moment a bed's occupancy changes without a room edit
happening in the same transaction - the exact class of bug the public
availability view was built from the start to avoid (`0018`'s view reads
live `beds.status`, never a cached count). `admin_status` stores only the
two states an owner genuinely toggles by hand (`under_maintenance`,
`blocked`) plus the default `active`; the derived three-way display
status is computed by a view (3.4), never stored. This distinction was
confirmed with the owner during design.

`floor` is `int not null default 0` (no existing data has floor
information - every migrated room defaults to floor 0, owner corrects via
the edit UI). `wing` is `text` nullable (optional per spec's own baseline
assumptions - "floors and wings exist as attributes of a room").

### 3.3 `beds` (altered)

```sql
alter table public.beds add column hold_until timestamptz;
```

Set by `approve_booking` (3.6), cleared by `release_expired_bed_holds()`
(3.6) or by an actual check-in.

### 3.4 Computed status view

```sql
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
```

This is the single source of truth for the floor grid's tile colour. It
intentionally does NOT treat `reserved` beds as occupied for the
available/partially_filled/full computation - a reserved-but-not-yet-
checked-in bed still shows the room as not fully occupied, matching how
`occupancy.ts`'s existing occupancy-rate calculation already only counts
`status = 'occupied'`.

## 4. Migration script shape (`0023_room_types_split.sql`)

Written as a single migration, in this order:

1. **Guard**: raise an exception if any `room_type` enum value has
   inconsistent `capacity` or `monthly_price` across existing rows (a
   `select ... group by room_type having count(distinct capacity) > 1 or
   count(distinct monthly_price) > 1` check) - if this fires, the owner
   must reconcile the live data manually before re-running, since silently
   picking one of several inconsistent values would be a real, undetectable
   data-loss risk. Expected to be a no-op for this hostel's actual data
   (every room of a given type has always shared one price), but the
   guard costs nothing and catches a genuine edge case honestly rather
   than assuming.
2. Create `room_types` table and `room_admin_status` enum.
3. Insert one `room_types` row per distinct `room_type` value found in
   `rooms`, named `'Single'`/`'Twin'`/`'Triple'` (capitalized from the
   enum label), taking `capacity`/`monthly_price` from any representative
   row of that type (safe post-guard), `deposit = 0`, `amenities = '[]'`.
4. `alter table rooms add column room_type_id uuid references
   room_types(id)`, `add column floor int not null default 0`,
   `add column wing text`, `add column admin_status room_admin_status not
   null default 'active'`.
5. Backfill `room_type_id` by joining old `rooms.room_type` to the new
   `room_types.name`.
6. `alter table rooms alter column room_type_id set not null`.
7. `alter table rooms drop column room_type`, `drop column capacity`,
   `drop column monthly_price`.
8. Create the `rooms_with_status` view (3.4).
9. `alter table beds add column hold_until timestamptz`.
10. RLS on `room_types`: owner-only full access (mirrors `0007`'s
    owner-only room pricing exactly - room type definitions ARE pricing),
    read-all-authenticated for warden/student/guardian (mirrors
    `rooms_read_all_authenticated`).
11. Update `rooms` RLS: no policy change needed - `0007`'s
    `rooms_owner_full_access` (owner: all) and `rooms_read_all_authenticated`
    (warden/student/guardian: select) already apply unchanged to the
    altered table shape.

## 5. RPC changes

### 5.1 `generate_monthly_invoices` (existing, `0008`) - must be updated

Currently reads `r.monthly_price` directly from `rooms`. After the split,
price lives on `room_types`, so this RPC's join must change from
`join public.rooms r on r.id = b.room_id` (reading `r.monthly_price`) to
additionally joining `room_types rt on rt.id = r.room_type_id` and reading
`rt.base_rent`. This is a required companion change, not optional - the
monthly billing run would break otherwise. Full corrected function body:

```sql
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
```

### 5.2 `transfer_confirm`/pricing RPCs (existing, `0012`) - must be updated

`0012_transfer_approve_reject_rpcs.sql` reads `r.monthly_price` twice
(old room price, new room price) to compute `price_diff`. Same fix:
join through `room_types` for `base_rent` in both places. No behavior
change, purely a column-location fix required by the split.

### 5.3 `release_expired_bed_holds` (new)

```sql
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
```

`security definer` because a warden calling this needs to write `beds`
rows that were reserved by someone else's approval action - same
reasoning class as every other cross-user write in this project. Called
as the first statement inside `check_in_student` and `approve_booking`
(5.4, 5.5) so real staff interactions self-heal the stored data over
time, with no separate scheduled job.

### 5.4 `approve_booking` (existing, `0019`) - extended

```sql
create or replace function public.approve_booking(p_booking_id uuid, p_bed_id uuid, p_hold_hours int default 48)
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
```

`p_hold_hours default 48` - a hold lasts 48 hours unless the caller
specifies otherwise (matches the existing pattern of sensible defaults
over required inputs, spec section 3.1's own stated design principle).

### 5.5 `check_in_student` (existing, `0019`) - self-heal preamble added

```sql
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
```

Only change from the current version: the `perform
release_expired_bed_holds()` preamble, and clearing `hold_until` on
successful check-in (so a later re-reservation of the same bed doesn't
inherit a stale timestamp).

### 5.6 `delete_room` (new)

```sql
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
```

Deliberately NOT `security definer` - the caller already has direct RLS
write access via `rooms_owner_full_access` (owner-only), this function
exists purely to turn a raw FK-violation Postgres error (beds
`on delete cascade` would otherwise silently delete the beds too, per
`0003`, orphaning nothing but destroying real bed-history rows without
warning) into the specific, actionable message the earlier informal
design conversation asked for - matching this project's established
"never let a raw DB error surface to the user" discipline (the same class
of fix as this session's `errorMessage()` helper and the Edge Function's
error-text fix).

## 6. Public availability view - update for hold-expiry correctness

`0018`'s `public_room_availability` view currently groups by
`r.room_type` directly and counts `b.status = 'vacant'`. Two required
changes: it must read through `room_types` now (the price/type columns
moved), and it must treat an expired-but-not-yet-self-healed hold as
vacant inline, so an anonymous website visitor never sees a stale
"unavailable" count purely because no authenticated action has run
`release_expired_bed_holds()` yet.

`create or replace view` cannot change an existing column's data type,
and `room_type` changes from the `room_type` enum to `text` (`rt.name`)
here - Postgres rejects that with "cannot change data type of view
column". Must be `drop view` + `create view`, with `grant select` to
`anon` reapplied afterward since dropping a view drops its grants too.

```sql
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

The `where r.admin_status = 'active'` clause is new and required: a room
set to `under_maintenance` or `blocked` must disappear from public
availability entirely (both the count and, if it were the only room of
that type, the room type itself no longer being listed) - this is the
literal requirement from the earlier informal conversation ("the public
website's live availability count must stay accurate after any admin
change here") made concrete by this migration's new admin-status field.

## 7. Test plan for hold-expiry (explicit, per the owner's request)

1. Unit-test `release_expired_bed_holds()`'s SQL logic is out of reach for
   this project's Vitest suite (no pg test runner) - instead, the
   `public_room_availability` view's CASE logic is the part that must be
   proven correct without a live database, and it's pure SQL with no
   client-side equivalent to unit test. The plan will call for a manual
   verification query (given to the user, same handoff pattern as every
   migration in this project) that: creates a booking, approves it with a
   short `p_hold_hours`, confirms `public_room_availability`'s count drops
   by one immediately, waits past the hold window (or directly backdates
   `hold_until` in a test query), re-queries `public_room_availability`
   and confirms the count is back up WITHOUT any check-in or
   `release_expired_bed_holds()` call having been made - proving the
   view's inline computation, not the self-heal function, is what the
   public site actually depends on.
2. Client-side (Vitest-coverable): `lib/rooms.ts`'s new
   `fetchRoomTypes`/`createRoomType`/`updateRoom`/`deleteRoom`/etc.
   functions each get a unit test against a mocked Supabase client,
   following this project's established pattern throughout.

## 8. UI

### 8.1 Floor grid (`/room-board`, extends existing `BedBoard`)

- New top layer: one tile per ROOM (not per bed), colour-coded by
  `rooms_with_status.display_status` (green=available,
  amber=partially_filled, red=full, grey=under_maintenance,
  dark=blocked) - matches spec section 7.1's exact colour scheme for the
  admin dashboard's own availability grid, reused here for consistency.
- Click a tile: expands to the existing bed-level `BedBoard` card for
  that room (bed-level view requirement from the original informal
  request is satisfied by keeping, not replacing, the current component).
- Owner-only controls surfaced on the same screen: "Add Room Type", "Add
  Room", edit pencil on each room tile (opens a form: room number, floor,
  wing, room type, admin status), "Delete" (confirm dialog required -
  money/deletion is the one place spec section 3.1 itself calls for a
  real confirmation, not undo-after-the-fact).
- Warden: same grid, read-only - no add/edit/delete controls rendered,
  matching `rooms_owner_full_access`/`rooms_read_all_authenticated`'s
  existing split exactly. The existing room-change-request path
  (`transfer_requests`) is untouched by this plan.

### 8.2 `lib/rooms.ts` - new functions

- `fetchRoomTypes(): Promise<RoomType[]>`
- `createRoomType(input): Promise<void>`
- `updateRoomType(id, input): Promise<void>`
- `fetchRoomsWithStatus(): Promise<RoomWithStatus[]>` (reads
  `rooms_with_status`, replaces/extends the current `fetchRoomsWithBeds`
  for the grid's top layer - `fetchRoomsWithBeds` itself is kept
  unchanged for the bed-level drill-down, since `Room`/`Bed` types and
  their existing consumers - `occupancy.ts`, `CheckInForm`,
  `_authenticated.residents.tsx` - are explicitly not being touched by
  this plan beyond the type-shape change described in 3.2).
- `createRoom(input): Promise<void>` (updated signature: `room_number,
  floor, wing, room_type_id, admin_status`, replacing the current
  `room_type, capacity, monthly_price` signature)
- `updateRoom(id, input): Promise<void>` (new)
- `deleteRoom(id): Promise<void>` (calls the `delete_room` RPC, surfaces
  its exception message directly - not swallowed/reworded)

## 9. Self-Review

- **Placeholder scan**: none - every SQL block above is complete,
  runnable SQL, not sketched.
- **Data-loss check**: re-verified section 2's claim holds for every step
  in section 4's ordered migration - no step drops or recreates `rooms`,
  `beds`, or `students`; only columns are added/backfilled/dropped on the
  existing `rooms` table.
- **Consistency check**: `generate_monthly_invoices` (5.1) and the
  transfer-pricing RPCs (5.2) are called out as REQUIRED companion
  changes precisely because section 4 drops `rooms.monthly_price` - if
  those weren't updated in the same migration, monthly billing would
  break the moment this migration ran. Confirmed both are addressed.
- **Scope check**: `transfer_requests.preferred_room_type` and
  `bookings.room_type` are explicitly, deliberately left untouched per
  the owner's confirmed choice (section 1) - not an oversight.
