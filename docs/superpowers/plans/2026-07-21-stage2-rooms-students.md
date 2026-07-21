# Stage 2 (Rooms & Students) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rooms/beds/students on top of Stage 1's auth foundation: a color-coded bed board, a transactional check-in flow that creates a student record and assigns a bed, a resident list, and a live occupancy % on the dashboard.

**Architecture:** Three new Postgres migrations (rooms+beds, students+photo storage, a transactional check-in RPC), plain data-access modules wrapping `supabase-js` calls (mirroring `src/lib/supabase.ts`'s thin-wrapper style), and React components reusing the Stitch-derived design tokens already in `tailwind.config.ts`.

**Tech Stack:** Same as Stage 1 - React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- Data minimalism: `students` gets exactly the fields in the design spec (photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee) - name/phone already live on `profiles` from Stage 1, do not duplicate them onto `students`.
- RLS enabled on every table in the same migration that creates it - never a follow-up migration. This includes `storage.objects` policies for the photo bucket, added in the same migration that creates the bucket.
- Real Supabase keys already live in `.env.local` (gitignored) from Stage 1 - no new keys needed for this stage.
- Match the Stitch UI exactly for anything with a direct Stitch reference (the "Rooms & Fees" room-type cards, the Admin Dashboard's "Resident Directory" table and "Occupancy Rate" KPI card); the bed board itself has no direct Stitch mockup, so it reuses the same tokens/shadows/radii rather than inventing a new visual language.
- Migrations in this project are applied manually by the user pasting SQL into the Supabase SQL Editor (no DB credentials are available to any agent) - migration tasks end with an "apply + verify" step the user runs, not an automated CI step, exactly as in Stage 1.
- Supabase project: URL/anon key already in `.env.local`. Migrations 0001/0002 (Stage 1) are already applied to this live project.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0003_rooms_and_beds.sql
      0004_students_and_photos.sql
      0005_check_in_student_rpc.sql
  src/
    lib/
      rooms.ts                      # fetchRoomsWithBeds(), createRoom()
      rooms.test.ts
      students.ts                   # fetchStudents(), checkInStudent()
      students.test.ts
      occupancy.ts                  # calculateOccupancyRate() pure function
      occupancy.test.ts
    components/
      rooms/
        BedBoard.tsx                 # color-coded bed grid
        BedBoard.test.tsx
      students/
        CheckInForm.tsx              # minimal-field check-in form
        CheckInForm.test.tsx
        ResidentList.tsx             # reuses Stitch "Resident Directory" table style
        ResidentList.test.tsx
    routes/
      _authenticated.rooms.tsx        # bed board page
      _authenticated.residents.tsx    # resident list + check-in entry point
      _authenticated.dashboard.tsx    # MODIFIED: adds occupancy KPI
    lib/
      nav.ts                          # MODIFIED: adds Rooms/Residents nav items
      nav.test.ts                     # MODIFIED
```

---

### Task 1: Migration 0003 - `rooms` and `beds` tables + RLS

**Files:**
- Create: `supabase/migrations/0003_rooms_and_beds.sql`

**Interfaces:**
- Produces: `room_type` enum (`single`, `twin`, `triple`), `bed_status` enum (`vacant`, `occupied`, `reserved`, `notice_given`), `public.rooms` (`id uuid pk`, `room_number text unique not null`, `room_type room_type not null`, `capacity int not null`, `monthly_price numeric not null`, `created_at timestamptz not null default now()`), `public.beds` (`id uuid pk`, `room_id uuid not null references rooms(id) on delete cascade`, `bed_label text not null`, `status bed_status not null default 'vacant'`, `unique(room_id, bed_label)`). RLS: owner/warden full read+write on both; student/guardian read-only on both (reusing `public.current_role()` from Stage 1's migration 0002).

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0003_rooms_and_beds.sql`:
```sql
-- Stage 2: rooms + beds
create type room_type as enum ('single', 'twin', 'triple');
create type bed_status as enum ('vacant', 'occupied', 'reserved', 'notice_given');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text unique not null,
  room_type room_type not null,
  capacity int not null,
  monthly_price numeric not null,
  created_at timestamptz not null default now()
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  bed_label text not null,
  status bed_status not null default 'vacant',
  unique (room_id, bed_label)
);

alter table public.rooms enable row level security;
alter table public.beds enable row level security;

create policy "rooms_owner_warden_full_access" on public.rooms
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "rooms_read_all_authenticated" on public.rooms
  for select
  using (public.current_role() in ('student', 'guardian'));

create policy "beds_owner_warden_full_access" on public.beds
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "beds_read_all_authenticated" on public.beds
  for select
  using (public.current_role() in ('student', 'guardian'));
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select table_name, column_name, data_type from information_schema.columns
where table_name in ('rooms', 'beds') order by table_name, ordinal_position;

select relname, relrowsecurity from pg_class where relname in ('rooms', 'beds');
-- expect relrowsecurity = true for both
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_rooms_and_beds.sql
git commit -m "feat: add rooms and beds tables with RLS"
```

---

### Task 2: Migration 0004 - `students` table + photo storage bucket + RLS

**Files:**
- Create: `supabase/migrations/0004_students_and_photos.sql`

**Interfaces:**
- Consumes: `public.profiles` (Stage 1), `public.beds` (Task 1).
- Produces: `public.students` (`id uuid pk references profiles(id) on delete cascade`, `photo_url text`, `guardian_name text not null`, `guardian_phone text not null`, `bed_id uuid references beds(id)`, `check_in_date date`, `monthly_fee numeric`), a private Storage bucket `student-photos`, and RLS/storage policies.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0004_students_and_photos.sql`:
```sql
-- Stage 2: students + photo storage
create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  photo_url text,
  guardian_name text not null,
  guardian_phone text not null,
  bed_id uuid references public.beds(id),
  check_in_date date,
  monthly_fee numeric
);

alter table public.students enable row level security;

create policy "students_owner_warden_full_access" on public.students
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "students_own_row_select" on public.students
  for select
  using (id = auth.uid());

-- Private bucket for student photos. Objects are stored under
-- '<student profile id>/<filename>' so ownership is derivable from the path.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', false);

create policy "student_photos_owner_warden_full_access" on storage.objects
  for all
  using (bucket_id = 'student-photos' and public.current_role() in ('owner', 'warden'))
  with check (bucket_id = 'student-photos' and public.current_role() in ('owner', 'warden'));

create policy "student_photos_own_read" on storage.objects
  for select
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select table_name, column_name from information_schema.columns
where table_name = 'students' order by ordinal_position;

select id, public from storage.buckets where id = 'student-photos';
-- expect one row, public = false

select relrowsecurity from pg_class where relname = 'students';
-- expect true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_students_and_photos.sql
git commit -m "feat: add students table and private photo storage bucket with RLS"
```

---

### Task 3: Migration 0005 - transactional `check_in_student` RPC

**Files:**
- Create: `supabase/migrations/0005_check_in_student_rpc.sql`

**Interfaces:**
- Consumes: `public.profiles`, `public.students`, `public.beds` (Tasks 1-2).
- Produces: `public.check_in_student(p_profile_id uuid, p_guardian_name text, p_guardian_phone text, p_bed_id uuid, p_check_in_date date, p_monthly_fee numeric, p_photo_url text default null) returns void` - called by `src/lib/students.ts` (Task 6) via `supabase.rpc('check_in_student', {...})`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0005_check_in_student_rpc.sql`:
```sql
-- Stage 2: atomic check-in - creates the student row and occupies the bed
-- in one transaction (a Postgres function body is always one transaction).
-- Deliberately NOT security definer: it runs as the calling user, so the
-- existing owner/warden RLS policies on students and beds still gate who
-- can call this successfully - no privilege bypass introduced.
create function public.check_in_student(
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
  if (select status from public.beds where id = p_bed_id) <> 'vacant' then
    raise exception 'Bed % is not vacant', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied' where id = p_bed_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select routine_name, security_type from information_schema.routines
where routine_name = 'check_in_student';
-- expect security_type = 'INVOKER' (confirms NOT security definer)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_check_in_student_rpc.sql
git commit -m "feat: add transactional check_in_student RPC"
```

---

### Task 4: `lib/rooms.ts` - room/bed data access

**Files:**
- Create: `src/lib/rooms.ts`
- Test: `src/lib/rooms.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Stage 1).
- Produces:
  ```typescript
  export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'notice_given'
  export type Bed = { id: string; room_id: string; bed_label: string; status: BedStatus }
  export type Room = { id: string; room_number: string; room_type: 'single' | 'twin' | 'triple'; capacity: number; monthly_price: number; beds: Bed[] }
  export async function fetchRoomsWithBeds(): Promise<Room[]>
  export async function createRoom(input: { room_number: string; room_type: Room['room_type']; capacity: number; monthly_price: number }): Promise<void>
  ```
  Consumed by `BedBoard.tsx` (Task 5) and `occupancy.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

`src/lib/rooms.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockRoomsData = [
  { id: 'room-1', room_number: '101', room_type: 'twin', capacity: 2, monthly_price: 14000, beds: [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant' }] },
]

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockRoomsData, error: null })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

describe('fetchRoomsWithBeds', () => {
  it('returns rooms with their beds', async () => {
    const { fetchRoomsWithBeds } = await import('./rooms')
    const rooms = await fetchRoomsWithBeds()
    expect(rooms).toEqual(mockRoomsData)
  })
})

describe('createRoom', () => {
  it('inserts a room with the given fields', async () => {
    const { createRoom } = await import('./rooms')
    const { supabase } = await import('./supabase')
    await createRoom({ room_number: '202', room_type: 'single', capacity: 1, monthly_price: 18000 })
    expect(supabase.from).toHaveBeenCalledWith('rooms')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rooms.test.ts`
Expected: FAIL - `Cannot find module './rooms'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/rooms.ts`:
```typescript
import { supabase } from './supabase'

export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'notice_given'

export type Bed = {
  id: string
  room_id: string
  bed_label: string
  status: BedStatus
}

export type Room = {
  id: string
  room_number: string
  room_type: 'single' | 'twin' | 'triple'
  capacity: number
  monthly_price: number
  beds: Bed[]
}

export async function fetchRoomsWithBeds(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('*, beds(*)')
  if (error) throw error
  return (data ?? []) as Room[]
}

export async function createRoom(input: {
  room_number: string
  room_type: Room['room_type']
  capacity: number
  monthly_price: number
}): Promise<void> {
  const { error } = await supabase.from('rooms').insert(input)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rooms.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rooms.ts src/lib/rooms.test.ts
git commit -m "feat: add rooms/beds data access module"
```

---

### Task 5: `BedBoard` component

**Files:**
- Create: `src/components/rooms/BedBoard.tsx`
- Test: `src/components/rooms/BedBoard.test.tsx`

**Interfaces:**
- Consumes: `Room`, `Bed`, `BedStatus` types from `src/lib/rooms.ts` (Task 4).
- Produces: `export function BedBoard({ rooms }: { rooms: Room[] })` - consumed by `_authenticated.rooms.tsx` (Task 10).

- [ ] **Step 1: Write the failing test**

`src/components/rooms/BedBoard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BedBoard } from './BedBoard'
import type { Room } from '../../lib/rooms'

const rooms: Room[] = [
  {
    id: 'room-1',
    room_number: '101',
    room_type: 'twin',
    capacity: 2,
    monthly_price: 14000,
    beds: [
      { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant' },
      { id: 'bed-2', room_id: 'room-1', bed_label: 'B', status: 'occupied' },
    ],
  },
]

describe('BedBoard', () => {
  it('renders every room number and bed label', () => {
    render(<BedBoard rooms={rooms} />)
    expect(screen.getByText('101')).toBeInTheDocument()
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
Expected: FAIL - `Cannot find module './BedBoard'`

- [ ] **Step 3: Write minimal implementation**

`src/components/rooms/BedBoard.tsx`:
```tsx
import type { Bed, BedStatus, Room } from '../../lib/rooms'

const STATUS_CLASSES: Record<BedStatus, string> = {
  vacant: 'bg-secondary-container text-on-secondary-container',
  occupied: 'bg-primary text-on-primary',
  reserved: 'bg-surface-container-highest text-on-surface-variant',
  notice_given: 'bg-error-container text-on-error-container',
}

function BedTile({ bed }: { bed: Bed }) {
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-medium text-sm ${STATUS_CLASSES[bed.status]}`}>
      {bed.bed_label}
    </span>
  )
}

export function BedBoard({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
      {rooms.map((room) => (
        <div key={room.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-display text-lg text-primary">{room.room_number}</h3>
            <span className="text-xs uppercase tracking-wider text-secondary">{room.room_type}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {room.beds.map((bed) => (
              <BedTile key={bed.id} bed={bed} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/rooms/BedBoard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/rooms/BedBoard.tsx src/components/rooms/BedBoard.test.tsx
git commit -m "feat: add color-coded BedBoard component"
```

---

### Task 6: `lib/students.ts` - student data access + check-in

**Files:**
- Create: `src/lib/students.ts`
- Test: `src/lib/students.test.ts`

**Interfaces:**
- Consumes: `supabase` (Stage 1).
- Produces:
  ```typescript
  export type Student = { id: string; full_name: string; photo_url: string | null; guardian_name: string; guardian_phone: string; bed_id: string | null; check_in_date: string | null; monthly_fee: number | null }
  export async function fetchStudents(): Promise<Student[]>
  export async function checkInStudent(input: { profileId: string; guardianName: string; guardianPhone: string; bedId: string; checkInDate: string; monthlyFee: number; photoUrl?: string }): Promise<void>
  ```
  Consumed by `ResidentList.tsx` (Task 7) and `CheckInForm.tsx` (Task 8).

- [ ] **Step 1: Write the failing test**

`src/lib/students.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockStudentsData = [
  { id: 'student-1', full_name: 'Test Student', photo_url: null, guardian_name: 'Guardian', guardian_phone: '9800000000', bed_id: 'bed-1', check_in_date: '2026-07-01', monthly_fee: 14000 },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockStudentsData, error: null })),
    })),
    rpc: rpcMock,
  },
}))

describe('fetchStudents', () => {
  it('returns all students', async () => {
    const { fetchStudents } = await import('./students')
    const students = await fetchStudents()
    expect(students).toEqual(mockStudentsData)
  })
})

describe('checkInStudent', () => {
  it('calls the check_in_student RPC with the given fields', async () => {
    const { checkInStudent } = await import('./students')
    await checkInStudent({
      profileId: 'profile-1',
      guardianName: 'Guardian',
      guardianPhone: '9800000000',
      bedId: 'bed-1',
      checkInDate: '2026-07-01',
      monthlyFee: 14000,
    })
    expect(rpcMock).toHaveBeenCalledWith('check_in_student', {
      p_profile_id: 'profile-1',
      p_guardian_name: 'Guardian',
      p_guardian_phone: '9800000000',
      p_bed_id: 'bed-1',
      p_check_in_date: '2026-07-01',
      p_monthly_fee: 14000,
      p_photo_url: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students.test.ts`
Expected: FAIL - `Cannot find module './students'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/students.ts`:
```typescript
import { supabase } from './supabase'

export type Student = {
  id: string
  full_name: string
  photo_url: string | null
  guardian_name: string
  guardian_phone: string
  bed_id: string | null
  check_in_date: string | null
  monthly_fee: number | null
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select('*')
  if (error) throw error
  return (data ?? []) as Student[]
}

export async function checkInStudent(input: {
  profileId: string
  guardianName: string
  guardianPhone: string
  bedId: string
  checkInDate: string
  monthlyFee: number
  photoUrl?: string
}): Promise<void> {
  const { error } = await supabase.rpc('check_in_student', {
    p_profile_id: input.profileId,
    p_guardian_name: input.guardianName,
    p_guardian_phone: input.guardianPhone,
    p_bed_id: input.bedId,
    p_check_in_date: input.checkInDate,
    p_monthly_fee: input.monthlyFee,
    p_photo_url: input.photoUrl ?? null,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/students.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/students.ts src/lib/students.test.ts
git commit -m "feat: add students data access and check-in RPC wrapper"
```

---

### Task 7: `ResidentList` component

**Files:**
- Create: `src/components/students/ResidentList.tsx`
- Test: `src/components/students/ResidentList.test.tsx`

**Interfaces:**
- Consumes: `Student` type from `src/lib/students.ts` (Task 6).
- Produces: `export function ResidentList({ students }: { students: Student[] })` - consumed by `_authenticated.residents.tsx` (Task 10).

- [ ] **Step 1: Write the failing test**

`src/components/students/ResidentList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResidentList } from './ResidentList'
import type { Student } from '../../lib/students'

const students: Student[] = [
  { id: 's-1', full_name: 'Anjali Adhikari', photo_url: null, guardian_name: 'G. Adhikari', guardian_phone: '9800000001', bed_id: 'bed-1', check_in_date: '2026-07-01', monthly_fee: 14000 },
]

describe('ResidentList', () => {
  it('renders each resident name and guardian phone', () => {
    render(<ResidentList students={students} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/ResidentList.test.tsx`
Expected: FAIL - `Cannot find module './ResidentList'`

- [ ] **Step 3: Write minimal implementation**

`src/components/students/ResidentList.tsx` (mirrors the Stitch "Resident Directory" table style):
```tsx
import type { Student } from '../../lib/students'

export function ResidentList({ students }: { students: Student[] }) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Guardian</th>
            <th className="px-8 py-4">Guardian Phone</th>
            <th className="px-8 py-4">Monthly Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {students.map((student) => (
            <tr key={student.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{student.full_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_phone}</td>
              <td className="px-8 py-5 text-on-surface">{student.monthly_fee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/students/ResidentList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/ResidentList.tsx src/components/students/ResidentList.test.tsx
git commit -m "feat: add ResidentList component"
```

---

### Task 8: `CheckInForm` component

**Files:**
- Create: `src/components/students/CheckInForm.tsx`
- Test: `src/components/students/CheckInForm.test.tsx`

**Interfaces:**
- Consumes: `checkInStudent` from `src/lib/students.ts` (Task 6), `Bed` type from `src/lib/rooms.ts` (Task 4).
- Produces: `export function CheckInForm({ vacantBeds, onCheckedIn }: { vacantBeds: Bed[]; onCheckedIn: () => void })` - consumed by `_authenticated.residents.tsx` (Task 10). Fields are exactly the data-minimalism set: full name, phone, guardian name, guardian phone, bed selection, check-in date, monthly fee. (Photo upload is out of scope for this task's form - it's a nice-to-have the plan doesn't require for Stage 2's stated deliverable; `photo_url` stays optional/null until a later stage adds upload UI.)

- [ ] **Step 1: Write the failing test**

`src/components/students/CheckInForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CheckInForm } from './CheckInForm'
import type { Bed } from '../../lib/rooms'

const checkInStudent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/students', () => ({
  checkInStudent: (...args: unknown[]) => checkInStudent(...args),
}))

const vacantBeds: Bed[] = [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant' }]

describe('CheckInForm', () => {
  it('calls checkInStudent with the entered fields on submit', async () => {
    const onCheckedIn = vi.fn()
    render(<CheckInForm vacantBeds={vacantBeds} onCheckedIn={onCheckedIn} />)

    fireEvent.change(screen.getByLabelText(/guardian name/i), { target: { value: 'G. Adhikari' } })
    fireEvent.change(screen.getByLabelText(/guardian phone/i), { target: { value: '9800000001' } })
    fireEvent.change(screen.getByLabelText(/check-in date/i), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText(/monthly fee/i), { target: { value: '14000' } })
    fireEvent.change(screen.getByLabelText(/bed/i), { target: { value: 'bed-1' } })
    fireEvent.click(screen.getByRole('button', { name: /check in/i }))

    await waitFor(() => expect(checkInStudent).toHaveBeenCalled())
    expect(onCheckedIn).toHaveBeenCalled()
  })
})
```

Note: this test does not fill in a `profileId` field via the UI - the brief's Task 10 wiring passes the signed-in-to-be-checked-in student's `profileId` in separately (e.g. this form is reached from a flow where the student's `profiles` row already exists). For this task, add a hidden `profileId` prop (not a form field) defaulting to a placeholder in the test:

```tsx
render(<CheckInForm vacantBeds={vacantBeds} onCheckedIn={onCheckedIn} profileId="profile-1" />)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/CheckInForm.test.tsx`
Expected: FAIL - `Cannot find module './CheckInForm'`

- [ ] **Step 3: Write minimal implementation**

`src/components/students/CheckInForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { checkInStudent } from '../../lib/students'
import type { Bed } from '../../lib/rooms'

export function CheckInForm({
  vacantBeds,
  onCheckedIn,
  profileId,
}: {
  vacantBeds: Bed[]
  onCheckedIn: () => void
  profileId: string
}) {
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [checkInDate, setCheckInDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [bedId, setBedId] = useState(vacantBeds[0]?.id ?? '')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await checkInStudent({
      profileId,
      guardianName,
      guardianPhone,
      bedId,
      checkInDate,
      monthlyFee: Number(monthlyFee),
    })
    onCheckedIn()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="guardianName" className="block text-sm font-medium text-on-surface-variant">Guardian Name</label>
        <input id="guardianName" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="guardianPhone" className="block text-sm font-medium text-on-surface-variant">Guardian Phone</label>
        <input id="guardianPhone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="checkInDate" className="block text-sm font-medium text-on-surface-variant">Check-in Date</label>
        <input id="checkInDate" type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="monthlyFee" className="block text-sm font-medium text-on-surface-variant">Monthly Fee</label>
        <input id="monthlyFee" type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="bed" className="block text-sm font-medium text-on-surface-variant">Bed</label>
        <select id="bed" value={bedId} onChange={(e) => setBedId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
          {vacantBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Check In
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/students/CheckInForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/CheckInForm.tsx src/components/students/CheckInForm.test.tsx
git commit -m "feat: add CheckInForm component"
```

---

### Task 9: `calculateOccupancyRate` pure function + dashboard integration

**Files:**
- Create: `src/lib/occupancy.ts`
- Test: `src/lib/occupancy.test.ts`
- Modify: `src/routes/_authenticated.dashboard.tsx`

**Interfaces:**
- Consumes: `Room` type from `src/lib/rooms.ts` (Task 4).
- Produces: `export function calculateOccupancyRate(rooms: Room[]): number` (returns a 0-100 percentage, rounded to the nearest whole number; returns `0` when there are no beds at all, to avoid a divide-by-zero `NaN`).

- [ ] **Step 1: Write the failing test**

`src/lib/occupancy.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { calculateOccupancyRate } from './occupancy'
import type { Room } from './rooms'

function room(beds: Array<{ status: Room['beds'][number]['status'] }>): Room {
  return {
    id: 'r', room_number: '1', room_type: 'twin', capacity: beds.length, monthly_price: 0,
    beds: beds.map((b, i) => ({ id: `b${i}`, room_id: 'r', bed_label: String(i), status: b.status })),
  }
}

describe('calculateOccupancyRate', () => {
  it('returns 0 when there are no beds', () => {
    expect(calculateOccupancyRate([])).toBe(0)
  })

  it('calculates the percentage of occupied beds', () => {
    const rooms = [room([{ status: 'occupied' }, { status: 'vacant' }, { status: 'occupied' }, { status: 'vacant' }])]
    expect(calculateOccupancyRate(rooms)).toBe(50)
  })

  it('rounds to the nearest whole number', () => {
    const rooms = [room([{ status: 'occupied' }, { status: 'vacant' }, { status: 'vacant' }])]
    expect(calculateOccupancyRate(rooms)).toBe(33)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/occupancy.test.ts`
Expected: FAIL - `Cannot find module './occupancy'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/occupancy.ts`:
```typescript
import type { Room } from './rooms'

export function calculateOccupancyRate(rooms: Room[]): number {
  const allBeds = rooms.flatMap((room) => room.beds)
  if (allBeds.length === 0) return 0
  const occupied = allBeds.filter((bed) => bed.status === 'occupied').length
  return Math.round((occupied / allBeds.length) * 100)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/occupancy.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the KPI into the dashboard**

Replace `src/routes/_authenticated.dashboard.tsx`'s contents:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { calculateOccupancyRate } from '../lib/occupancy'

function DashboardPage() {
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 max-w-xs">
        <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
        <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})
```

- [ ] **Step 6: Run the full suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all tests pass, including the pre-existing `_authenticated.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/occupancy.ts src/lib/occupancy.test.ts src/routes/_authenticated.dashboard.tsx
git commit -m "feat: add occupancy rate calculation and wire it into the dashboard"
```

---

### Task 10: Nav items + routes for Rooms and Residents

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Create: `src/routes/_authenticated.rooms.tsx`, `src/routes/_authenticated.residents.tsx`

**Interfaces:**
- Consumes: `getNavItemsForRole` (Stage 1, modified here), `BedBoard` (Task 5), `fetchRoomsWithBeds` (Task 4), `ResidentList` (Task 7), `CheckInForm` (Task 8), `fetchStudents`/`checkInStudent` (Task 6).
- Produces: owner/warden now see "Rooms" and "Residents" in the sidebar; student/guardian do not (Stage 2 doesn't build their-facing views yet, matching the design spec's RLS-ready-but-no-UI-yet note).

- [ ] **Step 1: Update the nav test**

Modify `src/lib/nav.test.ts` - add two new items to the owner/warden expectations, leave student/guardian assertions as `['Dashboard']` (unchanged - Stage 2 doesn't add student/guardian-facing nav):

```typescript
it('gives owner the full nav including financial config, rooms, and residents', () => {
  const items = getNavItemsForRole('owner').map((i) => i.label)
  expect(items).toContain('Dashboard')
  expect(items).toContain('Financial Settings')
  expect(items).toContain('Rooms')
  expect(items).toContain('Residents')
})

it('gives warden operational nav (rooms, residents) but not financial config', () => {
  const items = getNavItemsForRole('warden').map((i) => i.label)
  expect(items).toContain('Dashboard')
  expect(items).toContain('Rooms')
  expect(items).toContain('Residents')
  expect(items).not.toContain('Financial Settings')
})
```
(Replace the existing "hides financial config from warden" test with this expanded one - same assertion plus the two new items - rather than having two separate tests for the same role.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL - owner/warden arrays don't contain 'Rooms'/'Residents' yet.

- [ ] **Step 3: Update `getNavItemsForRole`**

In `src/lib/nav.ts`, add the two new nav items and include them for owner and warden:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Add the Rooms route**

`src/routes/_authenticated.rooms.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { BedBoard } from '../components/rooms/BedBoard'

function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Rooms</h2>
      <BedBoard rooms={rooms} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/rooms')({
  component: RoomsPage,
})
```

- [ ] **Step 6: Add the Residents route**

`src/routes/_authenticated.residents.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchStudents, type Student } from '../lib/students'
import { ResidentList } from '../components/students/ResidentList'

function ResidentsPage() {
  const [students, setStudents] = useState<Student[]>([])

  useEffect(() => {
    fetchStudents().then(setStudents)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Residents</h2>
      <ResidentList students={students} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/residents')({
  component: ResidentsPage,
})
```

Run `npm run dev` once to let the TanStack Router Vite plugin regenerate `src/routeTree.gen.ts` with the two new routes, then stop the dev server.

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Rooms and Residents nav items and routes"
```

---

## Self-Review Notes

- **Spec coverage:** rooms/beds tables with capacity+price (Task 1), color-coded bed board (Task 5), student records with the exact minimal field set (Task 2, 6), check-in flow assigning a bed transactionally (Task 3, 6, 8), occupancy % on dashboard (Task 9). Resident list (Task 7) supports the check-in flow's natural companion view, matching the Stitch "Resident Directory" reference already established as this project's UI baseline.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact SQL/dashboard action.
- **Type consistency:** `Room`/`Bed`/`BedStatus` defined once in `src/lib/rooms.ts` and imported everywhere else; `Student` defined once in `src/lib/students.ts`.
- **Note on CheckInForm's `profileId`:** this task doesn't build the "create the underlying `profiles` row for a new student" flow - it assumes a `profiles` row (role `student`) already exists and this form attaches hostel-specific data to it. If that gap needs closing before check-in is fully usable end-to-end, flag it during Task 10's manual testing and we'll add a small follow-up task rather than silently expanding this task's scope.
