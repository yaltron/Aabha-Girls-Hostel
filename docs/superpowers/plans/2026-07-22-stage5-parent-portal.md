# Stage 5 (Parent Portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardian login linked to exactly one student, showing that student's fee status, guardian-flagged notices, and a monthly personalized "all well" update the warden posts - with the project's closing law ("nothing else about the student is visible to anyone who is not the student, warden, or owner") enforced structurally, not just by UI hiding.

**Architecture:** One new column (`students.guardian_id`) and one new table (`guardian_updates`), plus a `security definer` helper `public.my_linked_student_id()` (same pattern as Stage 1's `current_role()`) that every new guardian RLS policy references instead of a raw subquery on `students`. This keeps guardians off the `students`/`rooms`/`beds` tables entirely - their only table-level grants are read access to their linked child's `profiles` row, `invoices`/`payments`, guardian-flagged `notices`, and their child's `guardian_updates`. Adding `students.guardian_id` also adds a *second* foreign key from `students` to `profiles` (alongside the existing `students.id -> profiles.id`), which makes every existing PostgREST embedded-select of the shape `students(profiles(...))` or `profiles(...)`-from-`students` ambiguous; this plan's Task 2 fixes all five existing call sites with explicit FK-name hints before the ambiguity can break anything in production.

**Tech Stack:** Same as Stages 1-4 - React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- `guardian_id` is one-to-one (a student has at most one linked guardian) - no join table.
- `guardian_updates`: one row per student per month (`unique (student_id, month)`), `month` is always stored as the 1st of the month (mirrors `invoices.billing_month`'s convention).
- **Guardians get zero direct table-level access to `students`, `rooms`, or `beds`.** Every guardian RLS policy added in this stage must reference `public.my_linked_student_id()` (for `invoices`/`payments`/`guardian_updates`, predicate `student_id = public.my_linked_student_id()`; for `profiles`, predicate `id = public.my_linked_student_id()`) - never a raw subquery against `students`, and never a direct grant on `students` itself.
- `notices` guardian policy is additionally gated on `guardian_visible = true` - guardians never see the full notice list students see, only the flagged subset.
- **Structural consequence of adding `students.guardian_id`, not covered by the design spec:** Postgres auto-names the new foreign key `students_guardian_id_fkey` (its existing `id -> profiles.id` FK is auto-named `students_id_fkey`). With two FKs from `students` to `profiles`, PostgREST can no longer infer which relationship an embedded select like `profiles(full_name)` (reached from `students`) or `students(id)` (reached from `profiles`) means, and errors instead of silently guessing. Every existing embedded select of that shape must be updated to name the FK explicitly (`profiles!students_id_fkey(...)`) *in the same stage that introduces the ambiguity* - this is fixed in Task 2, before any new guardian-linkage feature code is added, verified against the real constraint names via `information_schema`/`pg_constraint` rather than assumed.
- Migrations are applied manually in the Supabase SQL Editor (project `qektemgxthrxgnhfmgqg`) - no agent has DB credentials. Migration tasks end with an "apply + verify" step the user runs.
- Match the Stitch UI tokens already established - no new design language. No Stitch mockup exists for the guardian-facing `/my-child` page or the two new resident-row actions ("Link Guardian", "Post Monthly Update"); build them with the established tokens, same approach as every UI surface without a direct mockup in Stages 2-4.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0014_guardian_linkage.sql          # students.guardian_id column + guardian_updates table + RLS enabled
      0015_guardian_rls.sql              # my_linked_student_id() helper + guardian policies on 5 tables
  src/
    lib/
      students.ts                        # MODIFIED: FK-hint fix, guardian_id field, link-guardian additions
      students.test.ts                   # MODIFIED
      fees.ts                            # MODIFIED: FK-hint fix only
      transfers.ts                       # MODIFIED: FK-hint fix only
      maintenance.ts                     # MODIFIED: FK-hint fix only
      guardian.ts                        # NEW: guardian-facing + warden update-posting data access
      guardian.test.ts                   # NEW
      nav.ts                             # MODIFIED: MY_CHILD item for guardian
      nav.test.ts                        # MODIFIED
    routes/
      _authenticated.receipt.$invoiceId.tsx  # MODIFIED: FK-hint fix only
      _authenticated.residents.tsx           # MODIFIED: Link Guardian / Post Update wiring
      _authenticated.my-child.tsx            # NEW: guardian-facing page
    components/
      students/
        ResidentList.tsx                 # MODIFIED: guardian-link column + action buttons
        ResidentList.test.tsx            # MODIFIED
        LinkGuardianForm.tsx             # NEW
        LinkGuardianForm.test.tsx        # NEW
        PostUpdateForm.tsx               # NEW
        PostUpdateForm.test.tsx          # NEW
      guardian/
        FeeStatus.tsx                    # NEW: read-only invoice list for the guardian page
        FeeStatus.test.tsx               # NEW
        MonthlyUpdate.tsx                # NEW: this month's "all well" message
        MonthlyUpdate.test.tsx           # NEW
```

---

### Task 1: Migration 0014 - `students.guardian_id` column + `guardian_updates` table + RLS

**Files:**
- Create: `supabase/migrations/0014_guardian_linkage.sql`

**Interfaces:**
- Consumes: `public.students`, `public.profiles`, `public.current_role()` (Stages 1-2).
- Produces: `public.students.guardian_id` (nullable `uuid references public.profiles(id)`), `public.guardian_updates` table, RLS enabled with owner/warden-only policy (guardian read policy arrives in Task 3, once the helper function it depends on exists).

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0014_guardian_linkage.sql`:
```sql
-- Stage 5: guardian linkage on students + guardian_updates table.
-- RLS is enabled on guardian_updates in this same migration that creates
-- it, per project law. The guardian-facing read policy is added in
-- migration 0015 alongside the my_linked_student_id() helper it depends
-- on - until then this table is owner/warden only, which is a safe
-- default (never retrofitting RLS itself, only adding a policy).
alter table public.students add column guardian_id uuid references public.profiles(id);

create table public.guardian_updates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  message text not null,
  posted_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, month)
);

alter table public.guardian_updates enable row level security;

create policy "guardian_updates_owner_warden_full_access" on public.guardian_updates
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns
where table_name = 'students' and column_name = 'guardian_id';

select column_name from information_schema.columns
where table_name = 'guardian_updates' order by ordinal_position;

select relrowsecurity from pg_class where relname = 'guardian_updates';
-- expect true

-- Confirm the exact auto-generated FK constraint names before Task 2 relies on them:
select conname from pg_constraint
where conrelid = 'public.students'::regclass and contype = 'f'
order by conname;
-- expect: students_bed_id_fkey, students_guardian_id_fkey, students_id_fkey
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_guardian_linkage.sql
git commit -m "feat: add guardian_id column and guardian_updates table with RLS"
```

---

### Task 2: Fix ambiguous embedded-select FK relationships

**Files:**
- Modify: `src/lib/students.ts`, `src/lib/fees.ts`, `src/lib/transfers.ts`, `src/lib/maintenance.ts`, `src/routes/_authenticated.receipt.$invoiceId.tsx`

**Interfaces:**
- Consumes: the `students_id_fkey` and `students_guardian_id_fkey` constraint names verified in Task 1, Step 3.
- Produces: no new functions or types - every existing embedded select that traverses `students -> profiles` (in either direction) now names the FK explicitly, so it keeps resolving via the *original* (`id`) relationship instead of erroring on the new ambiguity introduced by `guardian_id`.

This task ships no new behavior and needs no new tests - the existing test suite (which mocks `supabase.from().select()` and does not assert exact select-string equality, only `cols.includes('students')`-style branching) is the regression guard. Run it before and after to confirm nothing broke.

- [ ] **Step 1: Run the existing suite as a baseline**

Run: `npx vitest run`
Expected: PASS (all existing tests green before this task's edits).

- [ ] **Step 2: Fix `src/lib/students.ts`**

In `fetchStudents`, change:
```typescript
const { data, error } = await supabase.from('students').select('*, profiles(full_name)')
```
to:
```typescript
const { data, error } = await supabase.from('students').select('*, profiles!students_id_fkey(full_name)')
```

In `fetchUnassignedStudentProfiles`, change:
```typescript
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, students(id)')
    .eq('role', 'student')
```
to:
```typescript
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, students!students_id_fkey(id)')
    .eq('role', 'student')
```

- [ ] **Step 3: Fix `src/lib/fees.ts`**

In `fetchDuesInvoices`, change:
```typescript
    .select('*, students(profiles(full_name))')
```
to:
```typescript
    .select('*, students(profiles!students_id_fkey(full_name))')
```

- [ ] **Step 4: Fix `src/lib/transfers.ts`**

In `fetchPendingTransferRequests`, change:
```typescript
    .select('*, students(profiles(full_name))')
```
to:
```typescript
    .select('*, students(profiles!students_id_fkey(full_name))')
```

- [ ] **Step 5: Fix `src/lib/maintenance.ts`**

In `fetchOpenTickets`, change:
```typescript
    .select('*, students(profiles(full_name))')
```
to:
```typescript
    .select('*, students(profiles!students_id_fkey(full_name))')
```

- [ ] **Step 6: Fix `src/routes/_authenticated.receipt.$invoiceId.tsx`**

In `fetchReceipt`, change:
```typescript
    .select('billing_month, amount, students(profiles(full_name))')
```
to:
```typescript
    .select('billing_month, amount, students(profiles!students_id_fkey(full_name))')
```

- [ ] **Step 7: Run the full suite and build**

Run: `npx vitest run` - expect all tests still pass (the mocks branch on `cols.includes('students')`, which remains true with the FK hint appended, so no test data/assertions need to change).
Run: `npm run build` - expect success.

- [ ] **Step 8: Commit**

```bash
git add src/lib/students.ts src/lib/fees.ts src/lib/transfers.ts src/lib/maintenance.ts src/routes/_authenticated.receipt.\$invoiceId.tsx
git commit -m "fix: disambiguate students-profiles embedded selects after adding guardian_id FK"
```

---

### Task 3: Migration 0015 - `my_linked_student_id()` helper + guardian RLS policies

**Files:**
- Create: `supabase/migrations/0015_guardian_rls.sql`

**Interfaces:**
- Consumes: `public.students.guardian_id` (Task 1), `public.profiles`, `public.invoices`, `public.payments`, `public.notices`, `public.guardian_updates` (Stages 1-4, Task 1).
- Produces: `public.my_linked_student_id() returns uuid` (`security definer`, `stable`), new `for select` guardian policies on `profiles`, `invoices`, `payments`, `notices`, `guardian_updates`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0015_guardian_rls.sql`:
```sql
-- Stage 5: guardian read access, entirely mediated through this helper so
-- guardians never receive a table-level grant on students/rooms/beds.
-- Mirrors the current_role() pattern from migration 0002.
create function public.my_linked_student_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.students where guardian_id = auth.uid();
$$;

-- profiles: a guardian may read their linked student's profile row (needed
-- to label "Fees for <name>" in the UI). This is additive to the existing
-- guardian_own_row_select policy from migration 0002 - a guardian's own
-- row and their linked child's row are both now selectable.
create policy "profiles_guardian_linked_student_select" on public.profiles
  for select
  using (id = public.my_linked_student_id());

-- invoices / payments: same student-scoping predicate used by the
-- student's own policies in migration 0006, but keyed off the helper
-- instead of auth.uid() directly since the caller here is the guardian.
create policy "invoices_guardian_select" on public.invoices
  for select
  using (student_id = public.my_linked_student_id());

create policy "payments_guardian_select" on public.payments
  for select
  using (invoice_id in (select id from public.invoices where student_id = public.my_linked_student_id()));

-- notices: guardians see only guardian-flagged notices, never the full
-- list students see (notices_read_all_students from migration 0011).
create policy "notices_guardian_select" on public.notices
  for select
  using (public.current_role() = 'guardian' and guardian_visible = true);

-- guardian_updates: read-only for the linked guardian; owner/warden
-- already have full access from migration 0014.
create policy "guardian_updates_guardian_select" on public.guardian_updates
  for select
  using (student_id = public.my_linked_student_id());
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select proname, prosecdef from pg_proc where proname = 'my_linked_student_id';
-- expect prosecdef = true (security definer)

select tablename, policyname from pg_policies
where tablename in ('profiles', 'invoices', 'payments', 'notices', 'guardian_updates')
and policyname like '%guardian%'
order by tablename;
-- expect: guardian_updates_guardian_select, invoices_guardian_select,
--         notices_guardian_select, payments_guardian_select,
--         profiles_guardian_linked_student_select

-- Confirm guardians still have NO policy at all on students/rooms/beds:
select tablename, policyname from pg_policies where tablename in ('students', 'rooms', 'beds');
-- expect only the owner/warden/own-row policies from Stages 1-2 - nothing new here
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_guardian_rls.sql
git commit -m "feat: add my_linked_student_id helper and guardian RLS policies"
```

---

### Task 4: `lib/students.ts` - guardian linkage additions

**Files:**
- Modify: `src/lib/students.ts`, `src/lib/students.test.ts`

**Interfaces:**
- Consumes: `supabase` (existing), `students_guardian_id_fkey` constraint name (Task 1).
- Produces:
  ```typescript
  export type Student = {
    id: string
    full_name: string
    photo_url: string | null
    guardian_name: string
    guardian_phone: string
    bed_id: string | null
    check_in_date: string | null
    monthly_fee: number | null
    guardian_id: string | null
  }
  export type UnlinkedGuardianProfile = { id: string; full_name: string }
  export async function fetchUnlinkedGuardianProfiles(): Promise<UnlinkedGuardianProfile[]>
  export async function linkGuardian(studentId: string, guardianProfileId: string): Promise<void>
  ```
  Consumed by `ResidentList` (Task 10), the Residents route (Task 11).

- [ ] **Step 1: Write the failing tests**

Replace the top of `src/lib/students.test.ts` (the mock data and `fetchStudents` describe block) with:
```typescript
import { describe, it, expect, vi } from 'vitest'

// Raw shape as Supabase actually returns it for
// `select('*, profiles!students_id_fkey(full_name)')`: the joined table
// still comes back nested under the table name regardless of the FK hint.
const mockStudentsRawData = [
  {
    id: 'student-1',
    photo_url: null,
    guardian_name: 'Guardian',
    guardian_phone: '9800000000',
    bed_id: 'bed-1',
    check_in_date: '2026-07-01',
    monthly_fee: 14000,
    guardian_id: null,
    profiles: { full_name: 'Test Student' },
  },
]

const mockUnassignedProfilesData = [
  { id: 'profile-1', full_name: 'Has Not Checked In', students: [] },
  { id: 'profile-2', full_name: 'Already Checked In', students: [{ id: 'student-2' }] },
]

const mockUnlinkedGuardiansData = [
  { id: 'guardian-1', full_name: 'Not Yet Linked', students: [] },
  { id: 'guardian-2', full_name: 'Already Linked', students: [{ id: 'student-3' }] },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => {
        if (table === 'profiles' && cols.includes('students!students_guardian_id_fkey')) {
          return {
            eq: vi.fn(() => Promise.resolve({ data: mockUnlinkedGuardiansData, error: null })),
          }
        }
        if (table === 'profiles') {
          return {
            eq: vi.fn(() => Promise.resolve({ data: mockUnassignedProfilesData, error: null })),
          }
        }
        return Promise.resolve({ data: mockStudentsRawData, error: null })
      }),
      update: updateMock,
    })),
    rpc: rpcMock,
  },
}))

describe('fetchStudents', () => {
  it('returns all students with full_name flattened from the joined profiles row', async () => {
    const { fetchStudents } = await import('./students')
    const students = await fetchStudents()
    expect(students).toEqual([
      {
        id: 'student-1',
        full_name: 'Test Student',
        photo_url: null,
        guardian_name: 'Guardian',
        guardian_phone: '9800000000',
        bed_id: 'bed-1',
        check_in_date: '2026-07-01',
        monthly_fee: 14000,
        guardian_id: null,
      },
    ])
  })
})

describe('fetchUnlinkedGuardianProfiles', () => {
  it('returns only guardian profiles not yet linked to any student', async () => {
    const { fetchUnlinkedGuardianProfiles } = await import('./students')
    const guardians = await fetchUnlinkedGuardianProfiles()
    expect(guardians).toEqual([{ id: 'guardian-1', full_name: 'Not Yet Linked' }])
  })
})

describe('linkGuardian', () => {
  it('updates the student row with the chosen guardian profile id', async () => {
    const { linkGuardian } = await import('./students')
    await linkGuardian('student-1', 'guardian-1')
    expect(updateMock).toHaveBeenCalledWith({ guardian_id: 'guardian-1' })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'student-1')
  })
})
```

Leave the rest of the file (the `fetchUnassignedStudentProfiles` and `checkInStudent` describe blocks) unchanged below this point.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students.test.ts`
Expected: FAIL - `guardian_id` missing from `fetchStudents` result, `fetchUnlinkedGuardianProfiles`/`linkGuardian` not exported.

- [ ] **Step 3: Update the implementation**

In `src/lib/students.ts`, add `guardian_id: string | null` to the `Student` type and its mapping in `fetchStudents`:
```typescript
export type Student = {
  id: string
  full_name: string
  photo_url: string | null
  guardian_name: string
  guardian_phone: string
  bed_id: string | null
  check_in_date: string | null
  monthly_fee: number | null
  guardian_id: string | null
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select('*, profiles!students_id_fkey(full_name)')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    full_name: row.profiles?.full_name ?? '',
    photo_url: row.photo_url,
    guardian_name: row.guardian_name,
    guardian_phone: row.guardian_phone,
    bed_id: row.bed_id,
    check_in_date: row.check_in_date,
    monthly_fee: row.monthly_fee,
    guardian_id: row.guardian_id,
  })) as Student[]
}
```

Add at the end of the file:
```typescript
export type UnlinkedGuardianProfile = { id: string; full_name: string }

export async function fetchUnlinkedGuardianProfiles(): Promise<UnlinkedGuardianProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, students!students_guardian_id_fkey(id)')
    .eq('role', 'guardian')
  if (error) throw error
  return (data ?? [])
    .filter((row: any) => !row.students || row.students.length === 0)
    .map((row: any) => ({ id: row.id, full_name: row.full_name }))
}

export async function linkGuardian(studentId: string, guardianProfileId: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ guardian_id: guardianProfileId })
    .eq('id', studentId)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/students.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/students.ts src/lib/students.test.ts
git commit -m "feat: add guardian linkage fields and functions to students module"
```

---

### Task 5: `lib/guardian.ts` - guardian-facing and warden update-posting data access

**Files:**
- Create: `src/lib/guardian.ts`
- Test: `src/lib/guardian.test.ts`

**Interfaces:**
- Consumes: `supabase`, `InvoiceStatus` (from `src/lib/fees.ts`, Stage 3).
- Produces:
  ```typescript
  export type ChildInvoice = { id: string; billing_month: string; amount: number; due_date: string; status: InvoiceStatus }
  export type GuardianUpdate = { id: string; student_id: string; month: string; message: string; created_at: string }
  export async function fetchMyChildProfile(): Promise<{ id: string; full_name: string } | null>
  export async function fetchChildInvoices(): Promise<ChildInvoice[]>
  export async function fetchMyChildUpdate(): Promise<GuardianUpdate | null>
  export async function fetchGuardianUpdateForStudent(studentId: string): Promise<GuardianUpdate | null>
  export async function postGuardianUpdate(studentId: string, message: string): Promise<void>
  ```
  Consumed by `FeeStatus`/`MonthlyUpdate` (Tasks 6-7) via the `/my-child` route (Task 12), and by `PostUpdateForm` (Task 9) via the Residents route (Task 11).

- [ ] **Step 1: Write the failing test**

`src/lib/guardian.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockChildProfile = { id: 'student-1', full_name: 'Anjali Adhikari' }
const mockChildInvoices = [
  { id: 'inv-1', billing_month: '2026-07-01', amount: 14000, due_date: '2026-07-10', status: 'unpaid' },
]
const mockUpdate = {
  id: 'update-1',
  student_id: 'student-1',
  month: '2026-07-01',
  message: 'Doing great this month!',
  created_at: '2026-07-05T00:00:00Z',
}

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockChildProfile, error: null })),
            })),
          })),
        }
      }
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockChildInvoices, error: null })),
          })),
        }
      }
      // guardian_updates
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockUpdate, error: null })),
            })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: mockUpdate, error: null })),
          })),
        })),
        upsert: upsertMock,
      }
    }),
  },
}))

describe('fetchMyChildProfile', () => {
  it('returns the linked child profile', async () => {
    const { fetchMyChildProfile } = await import('./guardian')
    const child = await fetchMyChildProfile()
    expect(child).toEqual(mockChildProfile)
  })
})

describe('fetchChildInvoices', () => {
  it('returns the linked child invoices', async () => {
    const { fetchChildInvoices } = await import('./guardian')
    const invoices = await fetchChildInvoices()
    expect(invoices).toEqual(mockChildInvoices)
  })
})

describe('fetchMyChildUpdate', () => {
  it('returns this month\'s update for the linked child', async () => {
    const { fetchMyChildUpdate } = await import('./guardian')
    const update = await fetchMyChildUpdate()
    expect(update).toEqual(mockUpdate)
  })
})

describe('fetchGuardianUpdateForStudent', () => {
  it('returns this month\'s update for a given student', async () => {
    const { fetchGuardianUpdateForStudent } = await import('./guardian')
    const update = await fetchGuardianUpdateForStudent('student-1')
    expect(update).toEqual(mockUpdate)
  })
})

describe('postGuardianUpdate', () => {
  it('upserts the update keyed on student_id and month', async () => {
    const { postGuardianUpdate } = await import('./guardian')
    await postGuardianUpdate('student-1', 'Doing great!')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 'student-1', message: 'Doing great!' }),
      { onConflict: 'student_id,month' },
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: FAIL - `Cannot find module './guardian'`

- [ ] **Step 3: Write the implementation**

`src/lib/guardian.ts`:
```typescript
import { supabase } from './supabase'
import type { InvoiceStatus } from './fees'

export type ChildInvoice = {
  id: string
  billing_month: string
  amount: number
  due_date: string
  status: InvoiceStatus
}

export type GuardianUpdate = {
  id: string
  student_id: string
  month: string
  message: string
  created_at: string
}

function currentMonthDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function fetchMyChildProfile(): Promise<{ id: string; full_name: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'student')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchChildInvoices(): Promise<ChildInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, billing_month, amount, due_date, status')
    .order('billing_month', { ascending: false })
  if (error) throw error
  return (data ?? []) as ChildInvoice[]
}

export async function fetchMyChildUpdate(): Promise<GuardianUpdate | null> {
  const { data, error } = await supabase
    .from('guardian_updates')
    .select('*')
    .eq('month', currentMonthDate())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchGuardianUpdateForStudent(studentId: string): Promise<GuardianUpdate | null> {
  const { data, error } = await supabase
    .from('guardian_updates')
    .select('*')
    .eq('student_id', studentId)
    .eq('month', currentMonthDate())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function postGuardianUpdate(studentId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('guardian_updates')
    .upsert({ student_id: studentId, month: currentMonthDate(), message }, { onConflict: 'student_id,month' })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian.test.ts
git commit -m "feat: add guardian data access module"
```

---

### Task 6: `FeeStatus` component (guardian-facing)

**Files:**
- Create: `src/components/guardian/FeeStatus.tsx`
- Test: `src/components/guardian/FeeStatus.test.tsx`

**Interfaces:**
- Consumes: `Invoice` (from `src/lib/fees.ts`), `isOverdue` (from `src/lib/dues.ts`, Stage 3).
- Produces: `export function FeeStatus({ invoices }: { invoices: Invoice[] })` - consumed by `/my-child` route (Task 12).

- [ ] **Step 1: Write the failing test**

`src/components/guardian/FeeStatus.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeeStatus } from './FeeStatus'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2026-06-10', status: 'paid' },
  { id: 'inv-2', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2026-07-10', status: 'unpaid' },
]

describe('FeeStatus', () => {
  it('renders each invoice with its billing month, amount, and status - and no payment action', () => {
    render(<FeeStatus invoices={invoices} />)
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText(/record payment/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/guardian/FeeStatus.test.tsx`
Expected: FAIL - `Cannot find module './FeeStatus'`

- [ ] **Step 3: Write the implementation**

`src/components/guardian/FeeStatus.tsx`:
```tsx
import type { Invoice } from '../../lib/fees'
import { isOverdue } from '../../lib/dues'

export function FeeStatus({ invoices }: { invoices: Invoice[] }) {
  const today = new Date()

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Billing Month</th>
            <th className="px-8 py-4">Amount</th>
            <th className="px-8 py-4">Due Date</th>
            <th className="px-8 py-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{invoice.billing_month}</td>
              <td className="px-8 py-5 text-on-surface">{invoice.amount}</td>
              <td className="px-8 py-5 text-on-surface-variant">{invoice.due_date}</td>
              <td className="px-8 py-5">
                {invoice.status === 'paid' ? (
                  <span className="bg-secondary-container text-secondary text-xs px-3 py-1 rounded-full uppercase">
                    Paid
                  </span>
                ) : isOverdue(invoice, today) ? (
                  <span className="bg-error-container text-on-error-container text-xs px-3 py-1 rounded-full uppercase">
                    Overdue
                  </span>
                ) : (
                  <span className="bg-surface-container text-on-surface-variant text-xs px-3 py-1 rounded-full uppercase">
                    Unpaid
                  </span>
                )}
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

Run: `npx vitest run src/components/guardian/FeeStatus.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/guardian/FeeStatus.tsx src/components/guardian/FeeStatus.test.tsx
git commit -m "feat: add guardian FeeStatus component"
```

---

### Task 7: `MonthlyUpdate` component (guardian-facing)

**Files:**
- Create: `src/components/guardian/MonthlyUpdate.tsx`
- Test: `src/components/guardian/MonthlyUpdate.test.tsx`

**Interfaces:**
- Consumes: `GuardianUpdate` (from `src/lib/guardian.ts`, Task 5).
- Produces: `export function MonthlyUpdate({ update }: { update: GuardianUpdate | null })` - consumed by `/my-child` route (Task 12).

- [ ] **Step 1: Write the failing test**

`src/components/guardian/MonthlyUpdate.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthlyUpdate } from './MonthlyUpdate'
import type { GuardianUpdate } from '../../lib/guardian'

const update: GuardianUpdate = {
  id: 'update-1',
  student_id: 'student-1',
  month: '2026-07-01',
  message: 'Doing great this month!',
  created_at: '2026-07-05T00:00:00Z',
}

describe('MonthlyUpdate', () => {
  it('renders the message when an update exists', () => {
    render(<MonthlyUpdate update={update} />)
    expect(screen.getByText('Doing great this month!')).toBeInTheDocument()
  })

  it('shows a placeholder when no update has been posted yet', () => {
    render(<MonthlyUpdate update={null} />)
    expect(screen.getByText(/no update posted yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/guardian/MonthlyUpdate.test.tsx`
Expected: FAIL - `Cannot find module './MonthlyUpdate'`

- [ ] **Step 3: Write the implementation**

`src/components/guardian/MonthlyUpdate.tsx`:
```tsx
import type { GuardianUpdate } from '../../lib/guardian'

export function MonthlyUpdate({ update }: { update: GuardianUpdate | null }) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
      <h3 className="font-display text-lg text-primary">This Month's Update</h3>
      {update ? (
        <p className="text-on-surface-variant">{update.message}</p>
      ) : (
        <p className="text-on-surface-variant italic">No update posted yet this month.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/guardian/MonthlyUpdate.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/guardian/MonthlyUpdate.tsx src/components/guardian/MonthlyUpdate.test.tsx
git commit -m "feat: add guardian MonthlyUpdate component"
```

---

### Task 8: `LinkGuardianForm` component (warden-facing)

**Files:**
- Create: `src/components/students/LinkGuardianForm.tsx`
- Test: `src/components/students/LinkGuardianForm.test.tsx`

**Interfaces:**
- Consumes: `linkGuardian`, `UnlinkedGuardianProfile` (from `src/lib/students.ts`, Task 4).
- Produces: `export function LinkGuardianForm({ studentId, unlinkedGuardians, onLinked }: { studentId: string; unlinkedGuardians: UnlinkedGuardianProfile[]; onLinked: () => void })` - consumed by the Residents route (Task 11).

- [ ] **Step 1: Write the failing test**

`src/components/students/LinkGuardianForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LinkGuardianForm } from './LinkGuardianForm'

const linkGuardian = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/students', () => ({
  linkGuardian: (...args: unknown[]) => linkGuardian(...args),
}))

const unlinkedGuardians = [
  { id: 'guardian-1', full_name: 'Ram Guardian' },
  { id: 'guardian-2', full_name: 'Sita Guardian' },
]

describe('LinkGuardianForm', () => {
  it('calls linkGuardian with the student id and selected guardian id on submit', async () => {
    const onLinked = vi.fn()
    render(<LinkGuardianForm studentId="student-1" unlinkedGuardians={unlinkedGuardians} onLinked={onLinked} />)

    fireEvent.change(screen.getByLabelText(/guardian account/i), { target: { value: 'guardian-2' } })
    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))

    await waitFor(() => expect(linkGuardian).toHaveBeenCalledWith('student-1', 'guardian-2'))
    expect(onLinked).toHaveBeenCalled()
  })

  it('shows an error and does not call onLinked when linkGuardian rejects', async () => {
    linkGuardian.mockRejectedValueOnce(new Error('Link failed'))
    const onLinked = vi.fn()
    render(<LinkGuardianForm studentId="student-1" unlinkedGuardians={unlinkedGuardians} onLinked={onLinked} />)

    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))

    await waitFor(() => expect(screen.getByText('Link failed')).toBeInTheDocument())
    expect(onLinked).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/LinkGuardianForm.test.tsx`
Expected: FAIL - `Cannot find module './LinkGuardianForm'`

- [ ] **Step 3: Write the implementation**

`src/components/students/LinkGuardianForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { linkGuardian, type UnlinkedGuardianProfile } from '../../lib/students'

export function LinkGuardianForm({
  studentId,
  unlinkedGuardians,
  onLinked,
}: {
  studentId: string
  unlinkedGuardians: UnlinkedGuardianProfile[]
  onLinked: () => void
}) {
  const [guardianId, setGuardianId] = useState(unlinkedGuardians[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await linkGuardian(studentId, guardianId)
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link guardian')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="guardianProfile" className="block text-sm font-medium text-on-surface-variant">
          Guardian Account
        </label>
        <select
          id="guardianProfile"
          value={guardianId}
          onChange={(e) => setGuardianId(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          {unlinkedGuardians.map((guardian) => (
            <option key={guardian.id} value={guardian.id}>
              {guardian.full_name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Link Guardian
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/students/LinkGuardianForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/LinkGuardianForm.tsx src/components/students/LinkGuardianForm.test.tsx
git commit -m "feat: add LinkGuardianForm component"
```

---

### Task 9: `PostUpdateForm` component (warden-facing)

**Files:**
- Create: `src/components/students/PostUpdateForm.tsx`
- Test: `src/components/students/PostUpdateForm.test.tsx`

**Interfaces:**
- Consumes: `postGuardianUpdate` (from `src/lib/guardian.ts`, Task 5).
- Produces: `export function PostUpdateForm({ studentId, initialMessage, onPosted }: { studentId: string; initialMessage: string; onPosted: () => void })` - consumed by the Residents route (Task 11). `initialMessage` prefills the field when a message already exists for the current month, so re-posting mid-month doesn't lose the existing text; the route (Task 11) fetches this value *before* rendering the form (never renders it with a stale empty default) so the field's initial state is always correct on mount.

- [ ] **Step 1: Write the failing test**

`src/components/students/PostUpdateForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostUpdateForm } from './PostUpdateForm'

const postGuardianUpdate = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/guardian', () => ({
  postGuardianUpdate: (...args: unknown[]) => postGuardianUpdate(...args),
}))

describe('PostUpdateForm', () => {
  it('prefills the message field with initialMessage', () => {
    render(<PostUpdateForm studentId="student-1" initialMessage="Already posted this month" onPosted={vi.fn()} />)
    expect(screen.getByLabelText(/this month's update/i)).toHaveValue('Already posted this month')
  })

  it('calls postGuardianUpdate with the student id and edited message on submit', async () => {
    const onPosted = vi.fn()
    render(<PostUpdateForm studentId="student-1" initialMessage="" onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/this month's update/i), { target: { value: 'All well!' } })
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))

    await waitFor(() => expect(postGuardianUpdate).toHaveBeenCalledWith('student-1', 'All well!'))
    expect(onPosted).toHaveBeenCalled()
  })

  it('shows an error and does not call onPosted when postGuardianUpdate rejects', async () => {
    postGuardianUpdate.mockRejectedValueOnce(new Error('Post failed'))
    const onPosted = vi.fn()
    render(<PostUpdateForm studentId="student-1" initialMessage="" onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/this month's update/i), { target: { value: 'All well!' } })
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))

    await waitFor(() => expect(screen.getByText('Post failed')).toBeInTheDocument())
    expect(onPosted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/PostUpdateForm.test.tsx`
Expected: FAIL - `Cannot find module './PostUpdateForm'`

- [ ] **Step 3: Write the implementation**

`src/components/students/PostUpdateForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { postGuardianUpdate } from '../../lib/guardian'

export function PostUpdateForm({
  studentId,
  initialMessage,
  onPosted,
}: {
  studentId: string
  initialMessage: string
  onPosted: () => void
}) {
  const [message, setMessage] = useState(initialMessage)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await postGuardianUpdate(studentId, message)
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post update')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="updateMessage" className="block text-sm font-medium text-on-surface-variant">
          This Month's Update
        </label>
        <textarea
          id="updateMessage"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
          required
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Post Update
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/students/PostUpdateForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/PostUpdateForm.tsx src/components/students/PostUpdateForm.test.tsx
git commit -m "feat: add PostUpdateForm component"
```

---

### Task 10: `ResidentList` - guardian-link column and row actions

**Files:**
- Modify: `src/components/students/ResidentList.tsx`, `src/components/students/ResidentList.test.tsx`

**Interfaces:**
- Consumes: `Student` (now with `guardian_id`, Task 4).
- Produces: `export function ResidentList({ students, onLinkGuardian, onPostUpdate }: { students: Student[]; onLinkGuardian?: (student: Student) => void; onPostUpdate?: (student: Student) => void })` - consumed by the Residents route (Task 11). Both callback props are optional so `ResidentList` still works with just `students` wherever else it might be used; the buttons only render when their handler is provided.

- [ ] **Step 1: Write the failing tests**

Replace `src/components/students/ResidentList.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResidentList } from './ResidentList'
import type { Student } from '../../lib/students'

const unlinkedStudent: Student = {
  id: 's-1',
  full_name: 'Anjali Adhikari',
  photo_url: null,
  guardian_name: 'G. Adhikari',
  guardian_phone: '9800000001',
  bed_id: 'bed-1',
  check_in_date: '2026-07-01',
  monthly_fee: 14000,
  guardian_id: null,
}

const linkedStudent: Student = { ...unlinkedStudent, id: 's-2', full_name: 'Sita Nepali', guardian_id: 'guardian-1' }

describe('ResidentList', () => {
  it('renders each resident name and guardian phone', () => {
    render(<ResidentList students={[unlinkedStudent]} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
  })

  it('shows a Link Guardian button for a student with no linked guardian, and calls the handler on click', () => {
    const onLinkGuardian = vi.fn()
    render(<ResidentList students={[unlinkedStudent]} onLinkGuardian={onLinkGuardian} />)
    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))
    expect(onLinkGuardian).toHaveBeenCalledWith(unlinkedStudent)
  })

  it('shows a Post Update button (not Link Guardian) for a student with a linked guardian', () => {
    const onPostUpdate = vi.fn()
    render(<ResidentList students={[linkedStudent]} onLinkGuardian={vi.fn()} onPostUpdate={onPostUpdate} />)
    expect(screen.queryByRole('button', { name: /link guardian/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))
    expect(onPostUpdate).toHaveBeenCalledWith(linkedStudent)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/ResidentList.test.tsx`
Expected: FAIL - no Link Guardian/Post Update buttons rendered yet.

- [ ] **Step 3: Update the implementation**

`src/components/students/ResidentList.tsx`:
```tsx
import type { Student } from '../../lib/students'

export function ResidentList({
  students,
  onLinkGuardian,
  onPostUpdate,
}: {
  students: Student[]
  onLinkGuardian?: (student: Student) => void
  onPostUpdate?: (student: Student) => void
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Guardian</th>
            <th className="px-8 py-4">Guardian Phone</th>
            <th className="px-8 py-4">Monthly Fee</th>
            <th className="px-8 py-4">Guardian Account</th>
            <th className="px-8 py-4">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {students.map((student) => (
            <tr key={student.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{student.full_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_phone}</td>
              <td className="px-8 py-5 text-on-surface">{student.monthly_fee}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_id ? 'Linked' : 'Not linked'}</td>
              <td className="px-8 py-5 space-x-4">
                {onLinkGuardian && !student.guardian_id && (
                  <button onClick={() => onLinkGuardian(student)} className="text-primary font-medium hover:underline">
                    Link Guardian
                  </button>
                )}
                {onPostUpdate && student.guardian_id && (
                  <button onClick={() => onPostUpdate(student)} className="text-primary font-medium hover:underline">
                    Post Update
                  </button>
                )}
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

Run: `npx vitest run src/components/students/ResidentList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/ResidentList.tsx src/components/students/ResidentList.test.tsx
git commit -m "feat: add guardian-link column and row actions to ResidentList"
```

---

### Task 11: Wire Link Guardian / Post Update into the Residents route

**Files:**
- Modify: `src/routes/_authenticated.residents.tsx`

**Interfaces:**
- Consumes: `fetchUnlinkedGuardianProfiles`, `type UnlinkedGuardianProfile` (Task 4), `fetchGuardianUpdateForStudent` (Task 5), `LinkGuardianForm` (Task 8), `PostUpdateForm` (Task 9), `ResidentList`'s new props (Task 10).
- Produces: no new exports - this task only changes route wiring.

Both click handlers fetch their supporting data *before* revealing the form (rather than revealing the form immediately and fetching in the background). This avoids two known bug shapes from earlier stages: a form mounting with a stale/empty default before its data arrives (the `PostUpdateForm.initialMessage` case - Task 9's interface note), and a guardian picker briefly showing the previous click's stale list.

- [ ] **Step 1: Replace `src/routes/_authenticated.residents.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  fetchStudents,
  fetchUnassignedStudentProfiles,
  fetchUnlinkedGuardianProfiles,
  type Student,
  type UnassignedProfile,
  type UnlinkedGuardianProfile,
} from '../lib/students'
import { fetchGuardianUpdateForStudent } from '../lib/guardian'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { ResidentList } from '../components/students/ResidentList'
import { CheckInForm } from '../components/students/CheckInForm'
import { LinkGuardianForm } from '../components/students/LinkGuardianForm'
import { PostUpdateForm } from '../components/students/PostUpdateForm'

function ResidentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [unassignedProfiles, setUnassignedProfiles] = useState<UnassignedProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [linkingStudent, setLinkingStudent] = useState<Student | null>(null)
  const [unlinkedGuardians, setUnlinkedGuardians] = useState<UnlinkedGuardianProfile[]>([])
  const [postingUpdateStudent, setPostingUpdateStudent] = useState<Student | null>(null)
  const [updateInitialMessage, setUpdateInitialMessage] = useState('')

  function refetchAll() {
    fetchStudents().then(setStudents)
    fetchRoomsWithBeds().then(setRooms)
    fetchUnassignedStudentProfiles().then((profiles) => {
      setUnassignedProfiles(profiles)
      setSelectedProfileId((current) => (profiles.some((p) => p.id === current) ? current : ''))
    })
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function handleCheckedIn() {
    setSelectedProfileId('')
    refetchAll()
  }

  function handleLinkGuardianClick(student: Student) {
    setPostingUpdateStudent(null)
    fetchUnlinkedGuardianProfiles().then((guardians) => {
      setUnlinkedGuardians(guardians)
      setLinkingStudent(student)
    })
  }

  function handleLinked() {
    setLinkingStudent(null)
    refetchAll()
  }

  function handlePostUpdateClick(student: Student) {
    setLinkingStudent(null)
    fetchGuardianUpdateForStudent(student.id).then((update) => {
      setUpdateInitialMessage(update?.message ?? '')
      setPostingUpdateStudent(student)
    })
  }

  function handlePosted() {
    setPostingUpdateStudent(null)
  }

  const vacantBeds = rooms.flatMap((r) => r.beds).filter((b) => b.status === 'vacant')

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Residents</h2>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Check In a Student</h3>
        {unassignedProfiles.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            No pending student accounts to check in - create one via the Supabase dashboard first
          </p>
        ) : (
          <div className="space-y-2">
            <label htmlFor="unassignedProfile" className="block text-sm font-medium text-on-surface-variant">
              Student Account
            </label>
            <select
              id="unassignedProfile"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
            >
              <option value="">Select a student...</option>
              {unassignedProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedProfileId && vacantBeds.length > 0 && (
          <CheckInForm vacantBeds={vacantBeds} profileId={selectedProfileId} onCheckedIn={handleCheckedIn} />
        )}
      </div>

      <ResidentList students={students} onLinkGuardian={handleLinkGuardianClick} onPostUpdate={handlePostUpdateClick} />

      {linkingStudent && (
        <div className="space-y-2">
          <h3 className="font-display text-lg text-on-surface">Link Guardian for {linkingStudent.full_name}</h3>
          {unlinkedGuardians.length === 0 ? (
            <p className="text-on-surface-variant text-sm">
              No unlinked guardian accounts - create one via the Supabase dashboard first
            </p>
          ) : (
            <LinkGuardianForm studentId={linkingStudent.id} unlinkedGuardians={unlinkedGuardians} onLinked={handleLinked} />
          )}
        </div>
      )}

      {postingUpdateStudent && (
        <div className="space-y-2">
          <h3 className="font-display text-lg text-on-surface">Post Update for {postingUpdateStudent.full_name}</h3>
          <PostUpdateForm
            studentId={postingUpdateStudent.id}
            initialMessage={updateInitialMessage}
            onPosted={handlePosted}
          />
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/residents')({
  component: ResidentsPage,
})
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.residents.tsx
git commit -m "feat: wire Link Guardian and Post Update actions into the Residents page"
```

---

### Task 12: `MY_CHILD` nav item + `/my-child` route

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Create: `src/routes/_authenticated.my-child.tsx`

**Interfaces:**
- Consumes: `fetchMyChildProfile`, `fetchChildInvoices`, `fetchMyChildUpdate`, `type GuardianUpdate` (Task 5), `fetchNotices`, `type Notice` (Stage 4 `src/lib/notices.ts`), `type Invoice` (Stage 3 `src/lib/fees.ts`), `FeeStatus` (Task 6), `MonthlyUpdate` (Task 7), `NoticesList` (Stage 4).
- Produces: guardian nav gains "My Child" (`getNavItemsForRole('guardian')` becomes `[DASHBOARD, MY_CHILD]`); new `/my-child` route.

- [ ] **Step 1: Update the nav test**

In `src/lib/nav.test.ts`, replace the guardian test case:
```typescript
it('gives guardian only their dashboard and My Child', () => {
  const items = getNavItemsForRole('guardian').map((i) => i.label)
  expect(items).toEqual(['Dashboard', 'My Child'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL - guardian nav is still `['Dashboard']`.

- [ ] **Step 3: Update `getNavItemsForRole`**

In `src/lib/nav.ts`, add:
```typescript
const MY_CHILD: NavItem = { label: 'My Child', path: '/my-child' }
```
And change the `guardian` case:
```typescript
    case 'guardian':
      return [DASHBOARD, MY_CHILD]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Add the `/my-child` route**

`src/routes/_authenticated.my-child.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyChildProfile, fetchChildInvoices, fetchMyChildUpdate, type GuardianUpdate } from '../lib/guardian'
import { fetchNotices, type Notice } from '../lib/notices'
import type { Invoice } from '../lib/fees'
import { FeeStatus } from '../components/guardian/FeeStatus'
import { MonthlyUpdate } from '../components/guardian/MonthlyUpdate'
import { NoticesList } from '../components/notices/NoticesList'

function MyChildPage() {
  const [childName, setChildName] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [update, setUpdate] = useState<GuardianUpdate | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    fetchMyChildProfile().then((child) => {
      if (!child) return
      setChildName(child.full_name)
      fetchChildInvoices().then((rows) =>
        setInvoices(rows.map((row) => ({ ...row, student_id: child.id, student_name: child.full_name }))),
      )
    })
    fetchMyChildUpdate().then(setUpdate)
    fetchNotices().then(setNotices)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">{childName || 'My Child'}</h2>
      <FeeStatus invoices={invoices} />
      <MonthlyUpdate update={update} />
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-child')({
  component: MyChildPage,
})
```

Run `npm run dev` once to let the TanStack Router Vite plugin regenerate `src/routeTree.gen.ts` with the new route, then stop the dev server.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add My Child nav item and guardian-facing /my-child route"
```

---

## Self-Review Notes

- **Spec coverage:** `guardian_id` one-to-one column (Task 1), `guardian_updates` table (Task 1), `my_linked_student_id()` helper mirroring `current_role()` (Task 3), guardian RLS on `profiles`/`invoices`/`payments`/`notices`/`guardian_updates` all keyed through the helper (Task 3), zero direct guardian access to `students`/`rooms`/`beds` (verified explicitly in Task 3's SQL check), warden "Link Guardian" and "Post Monthly Update" actions on the Residents page (Tasks 8-11), guardian-facing `/my-child` page with child name, fee status, guardian-flagged notices (reusing `NoticesList` as-is per the spec), and this month's update (Task 12). All Stage 5 spec items covered.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact SQL/dashboard action.
- **Type consistency:** `Student` (with `guardian_id`) defined once in `students.ts`; `ChildInvoice`/`GuardianUpdate` defined once in `guardian.ts`; `/my-child`'s invoice mapping builds full `Invoice` objects (from `fees.ts`) by combining `ChildInvoice` rows with the separately-fetched child id/name - never redefines `Invoice` itself, so `FeeStatus` can share the exact same type and `isOverdue` helper the owner/warden Fees page already uses.
- **Structural bug class caught before it could ship (not in the original spec):** adding `students.guardian_id` creates a second `students -> profiles` foreign key, which makes every pre-existing embedded select of the shape `profiles(...)` reached from `students` (or `students(...)` reached from `profiles`) ambiguous to PostgREST - it would have started erroring on every one of Stages 2-4's queries (`fetchStudents`, `fetchUnassignedStudentProfiles`, `fetchDuesInvoices`, `fetchPendingTransferRequests`, `fetchOpenTickets`, the receipt page) the moment this migration landed. Task 2 fixes all five call sites with explicit FK-name hints, verified against the real `pg_constraint` names rather than assumed, immediately after Task 1 introduces the ambiguity and before any new feature code is built on top of it.
- **Closing-law enforcement is structural, not just UI hiding:** the guardian never receives a table-level grant on `students` at any point in this plan (Task 3's verification step confirms `pg_policies` has no new guardian entries on `students`/`rooms`/`beds`) - `fetchMyChildProfile` reads the child's name via the `profiles` table (guardian-scoped through `my_linked_student_id()`), and `fetchChildInvoices`/`fetchMyChildUpdate` never join back to `students` at all, so there is no code path through which a guardian's query could expose `photo_url`, `bed_id`, `check_in_date`, or the recorded `guardian_name`/`guardian_phone` fields on the `students` row.
- **Known bug class from Stage 2/4 guarded against:** `PostUpdateForm`'s `initialMessage` is fetched and set into state *before* the form is revealed (Task 11's `handlePostUpdateClick`), not fetched in the background after an immediate reveal - avoiding the "component mounts with a stale/empty prop before async data arrives" shape, since `useState(initialMessage)` only reads its argument once, on mount.
- **Every new component is mounted somewhere:** `FeeStatus` and `MonthlyUpdate` are wired into `/my-child` (Task 12); `LinkGuardianForm` and `PostUpdateForm` are wired into the Residents route (Task 11) - none of Stage 2's "built but never mounted" bug repeated here.
