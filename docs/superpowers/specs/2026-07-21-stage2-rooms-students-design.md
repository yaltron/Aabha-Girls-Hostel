# Stage 2 (Rooms & Students) - Design Spec

Date: 2026-07-21
Status: Approved

## 1. Overview

Stage 2 adds rooms, beds, and student records on top of Stage 1's auth
foundation. It delivers: a color-coded bed board, a check-in flow that
creates a student record and assigns a bed, and an occupancy % KPI on the
dashboard. Per the user's 5-stage plan, this is scoped exactly to what was
specified - no fields, screens, or flows beyond it.

## 2. Data model

```sql
create type room_type as enum ('single', 'twin', 'triple');
create type bed_status as enum ('vacant', 'occupied', 'reserved', 'notice_given');

rooms:
  id uuid pk
  room_number text unique not null
  room_type room_type not null
  capacity int not null           -- matches bed count for the room
  monthly_price numeric not null
  created_at timestamptz

beds:
  id uuid pk
  room_id uuid fk -> rooms
  bed_label text not null         -- 'A', 'B', 'C' within a room
  status bed_status not null default 'vacant'
  unique (room_id, bed_label)

students:
  id uuid pk                      -- FK to profiles.id (a profiles row with role='student')
  photo_url text                  -- Supabase Storage path
  guardian_name text not null
  guardian_phone text not null
  bed_id uuid fk -> beds, nullable
  check_in_date date
  monthly_fee numeric
```

`students.id` reuses `profiles.id` rather than a separate table with its own
PK - a student's identity is one `profiles` row (name/phone already live
there from Stage 1) extended with hostel-specific fields. This keeps the
data-minimalism law enforceable in one place: `students` has exactly the
fields the law allows, nothing else.

A `bed` moving from `vacant` to `occupied` and a `student.bed_id` being set
happen in the same transaction (the check-in flow), so the two are never
out of sync.

## 3. RLS (Stage 2 additions)

- `rooms`, `beds`: owner and warden get full read/write (operations,
  per the law - room/bed configuration is not "financial config", so
  warden keeps access here; monthly *pricing* on `rooms` is still editable
  by warden at this stage since the law only restricts warden from
  financial *config* in the fee-invoicing sense arriving Stage 3 - revisit
  if this reads wrong once Stage 3 defines "financial config" concretely).
  Student and guardian: read-only on `rooms`/`beds` (a student can see the
  room/bed board's public shape, e.g. availability, but this stage doesn't
  yet build a student-facing bed board screen - RLS is ready ahead of it).
- `students`: owner/warden full read/write. Student: read own row only, no
  write (their record is warden/owner-managed). Guardian: nothing yet
  (Stage 5 adds the linkage).

## 4. UI

Reuses the Stitch admin dashboard's established visual language (gold/cream
tokens, `premium`/`premium-lg` shadows, `rounded-xxl` cards) - no new design
system introduced.

- **Bed board**: grid of room cards, each showing its beds as small colored
  tiles (vacant=green, occupied=the brand gold/primary, notice_given=amber,
  reserved=grey/outline) - reusing the existing badge-pill pattern from the
  Stitch "Rooms & Fees" mockup (`bg-secondary-container` pills) adapted to
  status colors.
- **Check-in flow**: a form (reusing the trimmed-down admission-form layout
  from the Stitch export, data-minimalism-scoped per the earlier agreement)
  that, on submit, in one transaction: creates the `profiles` row (role
  `student`, if it doesn't already exist) or reuses an existing one, creates
  the `students` row, sets `bed_id`, and flips the bed's status to
  `occupied`.
- **Dashboard KPI**: "Occupancy Rate" card (already in the Stitch admin
  mockup) now computed live: `count(beds where status='occupied') /
  count(beds) * 100`.

## 5. Testing plan (given to user at end of implementation)

- Create a room with 2 beds; confirm both show `vacant` on the board.
- Check in a student to one bed; confirm it flips to `occupied`, the
  student record has the minimal fields only, and the dashboard occupancy
  % updates.
- Confirm a `student`-role test user can read their own `students` row but
  RLS blocks reading any other student's row.
- Confirm `warden` can create/edit rooms and beds; confirm no
  `guardian`-role user can read `students` at all yet (Stage 5 territory).
