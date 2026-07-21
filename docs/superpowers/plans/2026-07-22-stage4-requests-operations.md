# Stage 4 (Requests & Operations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Room transfer requests (with warden approval, a student-confirm-before-price-change step, and an audit trail), maintenance tickets, notices, and the first real student-facing UI (My Room, Maintenance, Notices).

**Architecture:** Three new tables with RLS, three RPCs for the transfer lifecycle (`approve_transfer_request`, `reject_transfer_request` - both warden-only, `security invoker`; `confirm_transfer` - student-only, `security definer` with an explicit internal `auth.uid()` check, since a student confirming needs to write to `beds`/`students`/`invoices`, tables they have no RLS write access to by design). Tickets and notices need no RPCs - they're plain single-table CRUD under existing role-scoped RLS. New student-facing routes join the existing owner/warden admin shell (same `AdminShell`, role-gated nav).

**Tech Stack:** Same as Stages 1-3 - React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- `transfer_requests`/`maintenance_tickets`: `student_id uuid ... default auth.uid()` - the student never needs to (and, per RLS `with check`, cannot) supply someone else's id when creating their own request/ticket.
- `confirm_transfer` is the ONE function in this stage that must be `security definer` - every other RPC and every plain table write in this stage stays `security invoker`, matching the established pattern from Stages 2-3. Getting this backwards (making `approve_transfer_request` definer, or making `confirm_transfer` invoker) is a correctness bug: `approve_transfer_request` doesn't need definer (warden already has direct write access to every table it touches), and `confirm_transfer` MUST be definer (student has no direct write access to `beds`/`students`/`invoices`) with an explicit `if v_student_id <> auth.uid() then raise exception` check standing in for the RLS check that's bypassed.
- Bed-occupancy writes in this stage reuse the `for update` row-lock pattern from Stage 2's `check_in_student` fix (lock the bed row, verify `vacant`, then write) - this was a real bug found and fixed in Stage 2 for the exact same "TOCTOU on bed status" shape, so this stage builds it in from the start rather than shipping the same class of bug again.
- "Adjusts next invoice" means the single unpaid invoice with the earliest `billing_month` for that student - not every unpaid invoice they might have. If they have none (e.g. confirmed before this month's invoices were generated), the adjustment is a safe no-op; the next `generate_monthly_invoices` run will already use their new room's price since their `bed_id` is updated by then.
- Migrations are applied manually in the Supabase SQL Editor - no agent has DB credentials. Migration tasks end with an "apply + verify" step the user runs.
- Match the Stitch UI tokens already established - no new design language. No Stitch mockup exists for the three new student-facing pages or the warden Requests page; build them with the established tokens, same approach as Stage 2's bed board.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0010_transfer_requests_and_tickets.sql
      0011_notices.sql
      0012_transfer_approve_reject_rpcs.sql
      0013_confirm_transfer_rpc.sql
  src/
    lib/
      transfers.ts
      transfers.test.ts
      maintenance.ts
      maintenance.test.ts
      notices.ts
      notices.test.ts
    components/
      transfers/
        TransferRequestForm.tsx        # student: submit a new request
        TransferRequestForm.test.tsx
        TransferStatusCard.tsx         # student: shows pending/awaiting_confirmation/rejected state
        TransferStatusCard.test.tsx
        TransferRequestsQueue.tsx      # warden: pending requests beside live bed availability
        TransferRequestsQueue.test.tsx
      maintenance/
        TicketForm.tsx                 # student: raise a ticket
        TicketForm.test.tsx
        TicketList.tsx                 # shared: student's own list, or warden's open queue
        TicketList.test.tsx
      notices/
        NoticesList.tsx                # shared: read-only list
        NoticesList.test.tsx
        PostNoticeForm.tsx             # warden: post a notice
        PostNoticeForm.test.tsx
    routes/
      _authenticated.my-room.tsx        # student
      _authenticated.maintenance.tsx    # student
      _authenticated.notices.tsx        # student
      _authenticated.requests.tsx       # warden/owner: transfer queue + maintenance queue + notices
    lib/
      nav.ts                            # MODIFIED: student gets 3 new items, warden/owner get "Requests"
      nav.test.ts                       # MODIFIED
```

---

### Task 1: Migration 0010 - `transfer_requests` and `maintenance_tickets` tables + RLS

**Files:**
- Create: `supabase/migrations/0010_transfer_requests_and_tickets.sql`

**Interfaces:**
- Consumes: `public.students`, `public.beds`, `public.profiles`, `room_type` enum (Stages 1-2).
- Produces: `transfer_status` enum (`pending`, `awaiting_confirmation`, `confirmed`, `rejected`), `ticket_status` enum (`open`, `resolved`), `public.transfer_requests`, `public.maintenance_tickets`, both RLS-protected.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0010_transfer_requests_and_tickets.sql`:
```sql
-- Stage 4: transfer requests + maintenance tickets
create type transfer_status as enum ('pending', 'awaiting_confirmation', 'confirmed', 'rejected');
create type ticket_status as enum ('open', 'resolved');

create table public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) default auth.uid(),
  reason text not null,
  preferred_room_type room_type not null,
  status transfer_status not null default 'pending',
  from_bed_id uuid not null references public.beds(id),
  to_bed_id uuid references public.beds(id),
  price_diff numeric,
  reject_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) default auth.uid(),
  description text not null,
  status ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

alter table public.transfer_requests enable row level security;
alter table public.maintenance_tickets enable row level security;

create policy "transfer_requests_owner_warden_full_access" on public.transfer_requests
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "transfer_requests_own_insert" on public.transfer_requests
  for insert
  with check (student_id = auth.uid());

create policy "transfer_requests_own_select" on public.transfer_requests
  for select
  using (student_id = auth.uid());

create policy "maintenance_tickets_owner_warden_full_access" on public.maintenance_tickets
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "maintenance_tickets_own_insert" on public.maintenance_tickets
  for insert
  with check (student_id = auth.uid());

create policy "maintenance_tickets_own_select" on public.maintenance_tickets
  for select
  using (student_id = auth.uid());
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select table_name, column_name from information_schema.columns
where table_name in ('transfer_requests', 'maintenance_tickets') order by table_name, ordinal_position;

select relname, relrowsecurity from pg_class where relname in ('transfer_requests', 'maintenance_tickets');
-- expect true for both
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_transfer_requests_and_tickets.sql
git commit -m "feat: add transfer_requests and maintenance_tickets tables with RLS"
```

---

### Task 2: Migration 0011 - `notices` table + RLS

**Files:**
- Create: `supabase/migrations/0011_notices.sql`

**Interfaces:**
- Consumes: `public.profiles` (Stage 1).
- Produces: `public.notices`, RLS-protected.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0011_notices.sql`:
```sql
-- Stage 4: notices
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  guardian_visible boolean not null default false,
  posted_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.notices enable row level security;

create policy "notices_owner_warden_full_access" on public.notices
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "notices_read_all_students" on public.notices
  for select
  using (public.current_role() = 'student');
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'notices' order by ordinal_position;
select relrowsecurity from pg_class where relname = 'notices';
-- expect true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_notices.sql
git commit -m "feat: add notices table with RLS"
```

---

### Task 3: Migration 0012 - `approve_transfer_request` + `reject_transfer_request` RPCs

**Files:**
- Create: `supabase/migrations/0012_transfer_approve_reject_rpcs.sql`

**Interfaces:**
- Consumes: `public.transfer_requests`, `public.beds`, `public.rooms`, `public.students` (Task 1, Stage 2).
- Produces: `public.approve_transfer_request(p_request_id uuid, p_to_bed_id uuid) returns void`, `public.reject_transfer_request(p_request_id uuid, p_reason text) returns void` - both `security invoker` (warden already has direct write access to every table these touch: `transfer_requests`, `beds`, `students` are all owner+warden `for all`; `rooms` is owner-write/warden-read, and these functions only SELECT from `rooms`).

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0012_transfer_approve_reject_rpcs.sql`:
```sql
-- Stage 4: approve/reject a transfer request. Both NOT security definer -
-- the calling warden/owner already has direct RLS write access to every
-- table touched here (transfer_requests, beds, students are all
-- owner+warden `for all`; rooms is read-only for warden, which is all
-- this function needs from it).
create function public.approve_transfer_request(p_request_id uuid, p_to_bed_id uuid)
returns void
language plpgsql
as $$
declare
  v_from_bed_id uuid;
  v_old_room_price numeric;
  v_new_room_price numeric;
  v_diff numeric;
  v_student_id uuid;
begin
  select from_bed_id, student_id into v_from_bed_id, v_student_id
  from public.transfer_requests where id = p_request_id;

  select r.monthly_price into v_old_room_price
  from public.beds b join public.rooms r on r.id = b.room_id
  where b.id = v_from_bed_id;

  select r.monthly_price into v_new_room_price
  from public.beds b join public.rooms r on r.id = b.room_id
  where b.id = p_to_bed_id;

  v_diff := v_new_room_price - v_old_room_price;

  if v_diff = 0 then
    if (select status from public.beds where id = p_to_bed_id for update) <> 'vacant' then
      raise exception 'Bed % is not vacant', p_to_bed_id;
    end if;

    update public.beds set status = 'vacant' where id = v_from_bed_id;
    update public.beds set status = 'occupied' where id = p_to_bed_id;
    update public.students set bed_id = p_to_bed_id where id = v_student_id;

    update public.transfer_requests
    set status = 'confirmed', to_bed_id = p_to_bed_id, price_diff = 0,
        reviewed_by = auth.uid(), reviewed_at = now(), confirmed_at = now()
    where id = p_request_id;
  else
    update public.transfer_requests
    set status = 'awaiting_confirmation', to_bed_id = p_to_bed_id, price_diff = v_diff,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;
  end if;
end;
$$;

create function public.reject_transfer_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  update public.transfer_requests
  set status = 'rejected', reject_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select routine_name, security_type from information_schema.routines
where routine_name in ('approve_transfer_request', 'reject_transfer_request');
-- expect security_type = 'INVOKER' for both
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_transfer_approve_reject_rpcs.sql
git commit -m "feat: add approve/reject transfer request RPCs"
```

---

### Task 4: Migration 0013 - `confirm_transfer` RPC (security definer)

**Files:**
- Create: `supabase/migrations/0013_confirm_transfer_rpc.sql`

**Interfaces:**
- Consumes: `public.transfer_requests`, `public.beds`, `public.students`, `public.invoices` (Task 1, Stages 2-3).
- Produces: `public.confirm_transfer(p_request_id uuid) returns void` - the ONE `security definer` function in this stage, since the calling student has no direct RLS write access to `beds`, `students`, or `invoices`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0013_confirm_transfer_rpc.sql`:
```sql
-- Stage 4: student confirms an awaiting-confirmation transfer. SECURITY
-- DEFINER because confirming needs to write to beds/students/invoices,
-- which a student has no direct RLS write access to (by design - see
-- Stages 2-3). Since this bypasses RLS, the function does its OWN
-- authorization check instead: the request's student_id must equal the
-- caller's auth.uid(), or it raises - this stands in for the RLS check
-- that would normally gate this write.
create function public.confirm_transfer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_bed_id uuid;
  v_to_bed_id uuid;
  v_price_diff numeric;
  v_student_id uuid;
begin
  select from_bed_id, to_bed_id, price_diff, student_id
  into v_from_bed_id, v_to_bed_id, v_price_diff, v_student_id
  from public.transfer_requests
  where id = p_request_id and status = 'awaiting_confirmation';

  if v_to_bed_id is null then
    raise exception 'Transfer request % is not awaiting confirmation', p_request_id;
  end if;

  if v_student_id <> auth.uid() then
    raise exception 'Only the requesting student can confirm this transfer';
  end if;

  if (select status from public.beds where id = v_to_bed_id for update) <> 'vacant' then
    raise exception 'Bed % is not vacant', v_to_bed_id;
  end if;

  update public.beds set status = 'vacant' where id = v_from_bed_id;
  update public.beds set status = 'occupied' where id = v_to_bed_id;
  update public.students set bed_id = v_to_bed_id where id = v_student_id;

  update public.invoices
  set amount = amount + v_price_diff
  where id = (
    select id from public.invoices
    where student_id = v_student_id and status = 'unpaid'
    order by billing_month asc
    limit 1
  );

  update public.transfer_requests
  set status = 'confirmed', confirmed_at = now()
  where id = p_request_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select routine_name, security_type from information_schema.routines
where routine_name = 'confirm_transfer';
-- expect security_type = 'DEFINER' - the one exception in this stage
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_confirm_transfer_rpc.sql
git commit -m "feat: add confirm_transfer RPC (security definer, self-checked)"
```

---

### Task 5: `lib/transfers.ts` - transfer request data access

**Files:**
- Create: `src/lib/transfers.ts`
- Test: `src/lib/transfers.test.ts`

**Interfaces:**
- Consumes: `supabase`, `RoomType` (reuse the string literal type from `src/lib/rooms.ts`'s `Room['room_type']`).
- Produces:
  ```typescript
  export type TransferStatus = 'pending' | 'awaiting_confirmation' | 'confirmed' | 'rejected'
  export type TransferRequest = { id: string; student_id: string; reason: string; preferred_room_type: 'single' | 'twin' | 'triple'; status: TransferStatus; from_bed_id: string; to_bed_id: string | null; price_diff: number | null; reject_reason: string | null; created_at: string }
  export type TransferRequestWithStudent = TransferRequest & { student_name: string }
  export async function fetchMyTransferRequests(): Promise<TransferRequest[]>
  export async function fetchPendingTransferRequests(): Promise<TransferRequestWithStudent[]>
  export async function submitTransferRequest(input: { fromBedId: string; reason: string; preferredRoomType: TransferRequest['preferred_room_type'] }): Promise<void>
  export async function approveTransferRequest(requestId: string, toBedId: string): Promise<void>
  export async function rejectTransferRequest(requestId: string, reason: string): Promise<void>
  export async function confirmTransfer(requestId: string): Promise<void>
  ```
  Consumed by `TransferRequestForm.tsx`, `TransferStatusCard.tsx`, `TransferRequestsQueue.tsx` (Tasks 8-9, 12), and `_authenticated.my-room.tsx`/`_authenticated.requests.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

`src/lib/transfers.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockOwnRequests = [
  { id: 'req-1', student_id: 'student-1', reason: 'Too noisy', preferred_room_type: 'single', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-01T00:00:00Z' },
]

const mockPendingRaw = [
  { id: 'req-2', student_id: 'student-2', reason: 'Roommate conflict', preferred_room_type: 'twin', status: 'pending', from_bed_id: 'bed-2', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-02T00:00:00Z', students: { profiles: { full_name: 'Sita Nepali' } } },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: string) => {
        if (cols.includes('students')) {
          return { eq: vi.fn(() => Promise.resolve({ data: mockPendingRaw, error: null })) }
        }
        return { order: vi.fn(() => Promise.resolve({ data: mockOwnRequests, error: null })) }
      }),
      insert: insertMock,
    })),
    rpc: rpcMock,
  },
}))

describe('fetchMyTransferRequests', () => {
  it('returns the caller\'s own requests', async () => {
    const { fetchMyTransferRequests } = await import('./transfers')
    const requests = await fetchMyTransferRequests()
    expect(requests).toEqual(mockOwnRequests)
  })
})

describe('fetchPendingTransferRequests', () => {
  it('returns pending requests with the student name flattened in', async () => {
    const { fetchPendingTransferRequests } = await import('./transfers')
    const requests = await fetchPendingTransferRequests()
    expect(requests[0].student_name).toBe('Sita Nepali')
    expect(requests[0].id).toBe('req-2')
  })
})

describe('submitTransferRequest', () => {
  it('inserts a transfer request with the given fields', async () => {
    const { submitTransferRequest } = await import('./transfers')
    await submitTransferRequest({ fromBedId: 'bed-1', reason: 'Too noisy', preferredRoomType: 'single' })
    expect(insertMock).toHaveBeenCalledWith({
      from_bed_id: 'bed-1',
      reason: 'Too noisy',
      preferred_room_type: 'single',
    })
  })
})

describe('approveTransferRequest', () => {
  it('calls the approve_transfer_request RPC', async () => {
    const { approveTransferRequest } = await import('./transfers')
    await approveTransferRequest('req-2', 'bed-5')
    expect(rpcMock).toHaveBeenCalledWith('approve_transfer_request', { p_request_id: 'req-2', p_to_bed_id: 'bed-5' })
  })
})

describe('rejectTransferRequest', () => {
  it('calls the reject_transfer_request RPC', async () => {
    const { rejectTransferRequest } = await import('./transfers')
    await rejectTransferRequest('req-2', 'No vacancy')
    expect(rpcMock).toHaveBeenCalledWith('reject_transfer_request', { p_request_id: 'req-2', p_reason: 'No vacancy' })
  })
})

describe('confirmTransfer', () => {
  it('calls the confirm_transfer RPC', async () => {
    const { confirmTransfer } = await import('./transfers')
    await confirmTransfer('req-1')
    expect(rpcMock).toHaveBeenCalledWith('confirm_transfer', { p_request_id: 'req-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/transfers.test.ts`
Expected: FAIL - `Cannot find module './transfers'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/transfers.ts`:
```typescript
import { supabase } from './supabase'

export type TransferStatus = 'pending' | 'awaiting_confirmation' | 'confirmed' | 'rejected'

export type TransferRequest = {
  id: string
  student_id: string
  reason: string
  preferred_room_type: 'single' | 'twin' | 'triple'
  status: TransferStatus
  from_bed_id: string
  to_bed_id: string | null
  price_diff: number | null
  reject_reason: string | null
  created_at: string
}

export type TransferRequestWithStudent = TransferRequest & { student_name: string }

export async function fetchMyTransferRequests(): Promise<TransferRequest[]> {
  const { data, error } = await supabase
    .from('transfer_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TransferRequest[]
}

export async function fetchPendingTransferRequests(): Promise<TransferRequestWithStudent[]> {
  const { data, error } = await supabase
    .from('transfer_requests')
    .select('*, students(profiles(full_name))')
    .eq('status', 'pending')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    reason: row.reason,
    preferred_room_type: row.preferred_room_type,
    status: row.status,
    from_bed_id: row.from_bed_id,
    to_bed_id: row.to_bed_id,
    price_diff: row.price_diff,
    reject_reason: row.reject_reason,
    created_at: row.created_at,
    student_name: row.students?.profiles?.full_name ?? '',
  }))
}

export async function submitTransferRequest(input: {
  fromBedId: string
  reason: string
  preferredRoomType: TransferRequest['preferred_room_type']
}): Promise<void> {
  const { error } = await supabase.from('transfer_requests').insert({
    from_bed_id: input.fromBedId,
    reason: input.reason,
    preferred_room_type: input.preferredRoomType,
  })
  if (error) throw error
}

export async function approveTransferRequest(requestId: string, toBedId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_transfer_request', {
    p_request_id: requestId,
    p_to_bed_id: toBedId,
  })
  if (error) throw error
}

export async function rejectTransferRequest(requestId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_transfer_request', {
    p_request_id: requestId,
    p_reason: reason,
  })
  if (error) throw error
}

export async function confirmTransfer(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_transfer', { p_request_id: requestId })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/transfers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/transfers.ts src/lib/transfers.test.ts
git commit -m "feat: add transfer request data access module"
```

---

### Task 6: `lib/maintenance.ts` - maintenance ticket data access

**Files:**
- Create: `src/lib/maintenance.ts`
- Test: `src/lib/maintenance.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type TicketStatus = 'open' | 'resolved'
  export type Ticket = { id: string; student_id: string; description: string; status: TicketStatus; created_at: string }
  export type TicketWithStudent = Ticket & { student_name: string }
  export async function fetchMyTickets(): Promise<Ticket[]>
  export async function fetchOpenTickets(): Promise<TicketWithStudent[]>
  export async function raiseTicket(description: string): Promise<void>
  export async function resolveTicket(ticketId: string): Promise<void>
  ```
  No RPCs - all four are plain table operations, gated directly by the RLS from Task 1 (owner/warden `for all`, student insert-own/select-own). `resolveTicket` is a direct `.update()`, not an RPC, since it's a single-table write with no cross-table invariant.

- [ ] **Step 1: Write the failing test**

`src/lib/maintenance.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockMyTickets = [
  { id: 'ticket-1', student_id: 'student-1', description: 'Leaky faucet', status: 'open', created_at: '2026-07-01T00:00:00Z' },
]

const mockOpenRaw = [
  { id: 'ticket-2', student_id: 'student-2', description: 'Broken window latch', status: 'open', created_at: '2026-07-02T00:00:00Z', students: { profiles: { full_name: 'Anjali Adhikari' } } },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        if (cols.includes('students')) {
          return { eq: vi.fn(() => Promise.resolve({ data: mockOpenRaw, error: null })) }
        }
        return { order: vi.fn(() => Promise.resolve({ data: mockMyTickets, error: null })) }
      }),
      insert: insertMock,
      update: updateMock,
    })),
  },
}))

describe('fetchMyTickets', () => {
  it('returns the caller\'s own tickets', async () => {
    const { fetchMyTickets } = await import('./maintenance')
    const tickets = await fetchMyTickets()
    expect(tickets).toEqual(mockMyTickets)
  })
})

describe('fetchOpenTickets', () => {
  it('returns open tickets with the student name flattened in', async () => {
    const { fetchOpenTickets } = await import('./maintenance')
    const tickets = await fetchOpenTickets()
    expect(tickets[0].student_name).toBe('Anjali Adhikari')
  })
})

describe('raiseTicket', () => {
  it('inserts a ticket with the given description', async () => {
    const { raiseTicket } = await import('./maintenance')
    await raiseTicket('Leaky faucet')
    expect(insertMock).toHaveBeenCalledWith({ description: 'Leaky faucet' })
  })
})

describe('resolveTicket', () => {
  it('updates the ticket status to resolved', async () => {
    const { resolveTicket } = await import('./maintenance')
    await resolveTicket('ticket-2')
    expect(updateMock).toHaveBeenCalledWith({ status: 'resolved', resolved_at: expect.any(String) })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'ticket-2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/maintenance.test.ts`
Expected: FAIL - `Cannot find module './maintenance'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/maintenance.ts`:
```typescript
import { supabase } from './supabase'

export type TicketStatus = 'open' | 'resolved'

export type Ticket = {
  id: string
  student_id: string
  description: string
  status: TicketStatus
  created_at: string
}

export type TicketWithStudent = Ticket & { student_name: string }

export async function fetchMyTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Ticket[]
}

export async function fetchOpenTickets(): Promise<TicketWithStudent[]> {
  const { data, error } = await supabase
    .from('maintenance_tickets')
    .select('*, students(profiles(full_name))')
    .eq('status', 'open')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    student_name: row.students?.profiles?.full_name ?? '',
  }))
}

export async function raiseTicket(description: string): Promise<void> {
  const { error } = await supabase.from('maintenance_tickets').insert({ description })
  if (error) throw error
}

export async function resolveTicket(ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('maintenance_tickets')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/maintenance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenance.ts src/lib/maintenance.test.ts
git commit -m "feat: add maintenance ticket data access module"
```

---

### Task 7: `lib/notices.ts` - notice data access

**Files:**
- Create: `src/lib/notices.ts`
- Test: `src/lib/notices.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type Notice = { id: string; title: string; body: string; guardian_visible: boolean; created_at: string }
  export async function fetchNotices(): Promise<Notice[]>
  export async function postNotice(input: { title: string; body: string; guardianVisible: boolean }): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/notices.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockNotices = [
  { id: 'notice-1', title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardian_visible: true, created_at: '2026-07-01T00:00:00Z' },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockNotices, error: null })),
      })),
      insert: insertMock,
    })),
  },
}))

describe('fetchNotices', () => {
  it('returns notices newest first', async () => {
    const { fetchNotices } = await import('./notices')
    const notices = await fetchNotices()
    expect(notices).toEqual(mockNotices)
  })
})

describe('postNotice', () => {
  it('inserts a notice with the given fields', async () => {
    const { postNotice } = await import('./notices')
    await postNotice({ title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardianVisible: true })
    expect(insertMock).toHaveBeenCalledWith({
      title: 'Winter Break Schedule',
      body: 'Hostel closes Dec 20.',
      guardian_visible: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notices.test.ts`
Expected: FAIL - `Cannot find module './notices'`

- [ ] **Step 3: Write minimal implementation**

`src/lib/notices.ts`:
```typescript
import { supabase } from './supabase'

export type Notice = {
  id: string
  title: string
  body: string
  guardian_visible: boolean
  created_at: string
}

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Notice[]
}

export async function postNotice(input: {
  title: string
  body: string
  guardianVisible: boolean
}): Promise<void> {
  const { error } = await supabase.from('notices').insert({
    title: input.title,
    body: input.body,
    guardian_visible: input.guardianVisible,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notices.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notices.ts src/lib/notices.test.ts
git commit -m "feat: add notices data access module"
```

---

### Task 8: `TransferRequestForm` component

**Files:**
- Create: `src/components/transfers/TransferRequestForm.tsx`
- Test: `src/components/transfers/TransferRequestForm.test.tsx`

**Interfaces:**
- Consumes: `submitTransferRequest` from `src/lib/transfers.ts` (Task 5).
- Produces: `export function TransferRequestForm({ fromBedId, onSubmitted }: { fromBedId: string; onSubmitted: () => void })` - consumed by `_authenticated.my-room.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

`src/components/transfers/TransferRequestForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferRequestForm } from './TransferRequestForm'

const submitTransferRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  submitTransferRequest: (...args: unknown[]) => submitTransferRequest(...args),
}))

describe('TransferRequestForm', () => {
  it('calls submitTransferRequest with the entered fields on submit', async () => {
    const onSubmitted = vi.fn()
    render(<TransferRequestForm fromBedId="bed-1" onSubmitted={onSubmitted} />)

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Too noisy' } })
    fireEvent.change(screen.getByLabelText(/preferred room type/i), { target: { value: 'single' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() =>
      expect(submitTransferRequest).toHaveBeenCalledWith({
        fromBedId: 'bed-1',
        reason: 'Too noisy',
        preferredRoomType: 'single',
      }),
    )
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('shows an error and does not call onSubmitted when submitTransferRequest rejects', async () => {
    submitTransferRequest.mockRejectedValueOnce(new Error('Submission failed'))
    const onSubmitted = vi.fn()
    render(<TransferRequestForm fromBedId="bed-1" onSubmitted={onSubmitted} />)

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Too noisy' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => expect(screen.getByText('Submission failed')).toBeInTheDocument())
    expect(onSubmitted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/transfers/TransferRequestForm.test.tsx`
Expected: FAIL - `Cannot find module './TransferRequestForm'`

- [ ] **Step 3: Write minimal implementation**

`src/components/transfers/TransferRequestForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { submitTransferRequest, type TransferRequest } from '../../lib/transfers'

export function TransferRequestForm({
  fromBedId,
  onSubmitted,
}: {
  fromBedId: string
  onSubmitted: () => void
}) {
  const [reason, setReason] = useState('')
  const [preferredRoomType, setPreferredRoomType] = useState<TransferRequest['preferred_room_type']>('single')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await submitTransferRequest({ fromBedId, reason, preferredRoomType })
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="reason" className="block text-sm font-medium text-on-surface-variant">Reason</label>
        <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="preferredRoomType" className="block text-sm font-medium text-on-surface-variant">Preferred Room Type</label>
        <select
          id="preferredRoomType"
          value={preferredRoomType}
          onChange={(e) => setPreferredRoomType(e.target.value as TransferRequest['preferred_room_type'])}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          <option value="single">Single</option>
          <option value="twin">Twin</option>
          <option value="triple">Triple</option>
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Submit Request
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/transfers/TransferRequestForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/transfers/TransferRequestForm.tsx src/components/transfers/TransferRequestForm.test.tsx
git commit -m "feat: add TransferRequestForm component"
```

---

### Task 9: `TransferStatusCard` component

**Files:**
- Create: `src/components/transfers/TransferStatusCard.tsx`
- Test: `src/components/transfers/TransferStatusCard.test.tsx`

**Interfaces:**
- Consumes: `TransferRequest` type from `src/lib/transfers.ts` (Task 5), `confirmTransfer` from `src/lib/transfers.ts`.
- Produces: `export function TransferStatusCard({ request, onConfirmed }: { request: TransferRequest; onConfirmed: () => void })` - consumed by `_authenticated.my-room.tsx` (Task 14) when the student has a `pending`, `awaiting_confirmation`, or `rejected` request.

- [ ] **Step 1: Write the failing test**

`src/components/transfers/TransferStatusCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferStatusCard } from './TransferStatusCard'
import type { TransferRequest } from '../../lib/transfers'

const confirmTransfer = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  confirmTransfer: (...args: unknown[]) => confirmTransfer(...args),
}))

const baseRequest: TransferRequest = {
  id: 'req-1',
  student_id: 's-1',
  reason: 'Too noisy',
  preferred_room_type: 'single',
  status: 'pending',
  from_bed_id: 'bed-1',
  to_bed_id: null,
  price_diff: null,
  reject_reason: null,
  created_at: '2026-07-01T00:00:00Z',
}

describe('TransferStatusCard', () => {
  it('shows a pending message with no confirm button when status is pending', () => {
    render(<TransferStatusCard request={baseRequest} onConfirmed={vi.fn()} />)
    expect(screen.getByText(/pending review/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('shows the price difference and a Confirm button when awaiting confirmation', async () => {
    const onConfirmed = vi.fn()
    const request = { ...baseRequest, status: 'awaiting_confirmation' as const, to_bed_id: 'bed-9', price_diff: 4000 }
    render(<TransferStatusCard request={request} onConfirmed={onConfirmed} />)

    expect(screen.getByText(/4000/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(confirmTransfer).toHaveBeenCalledWith('req-1'))
    expect(onConfirmed).toHaveBeenCalled()
  })

  it('shows the reject reason when rejected', () => {
    const request = { ...baseRequest, status: 'rejected' as const, reject_reason: 'No vacancy' }
    render(<TransferStatusCard request={request} onConfirmed={vi.fn()} />)
    expect(screen.getByText('No vacancy')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/transfers/TransferStatusCard.test.tsx`
Expected: FAIL - `Cannot find module './TransferStatusCard'`

- [ ] **Step 3: Write minimal implementation**

`src/components/transfers/TransferStatusCard.tsx`:
```tsx
import { useState } from 'react'
import { confirmTransfer, type TransferRequest } from '../../lib/transfers'

export function TransferStatusCard({
  request,
  onConfirmed,
}: {
  request: TransferRequest
  onConfirmed: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    try {
      await confirmTransfer(request.id)
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
      <h3 className="font-display text-lg text-on-surface">Transfer Request</h3>
      {request.status === 'pending' && (
        <p className="text-on-surface-variant">Your transfer request is pending review.</p>
      )}
      {request.status === 'awaiting_confirmation' && (
        <div className="space-y-4">
          <p className="text-on-surface-variant">
            Your request was approved. The new room's price differs by{' '}
            <span className="font-medium text-on-surface">{request.price_diff}</span>. Confirm to complete the transfer.
          </p>
          {error && <p className="text-error text-sm">{error}</p>}
          <button
            onClick={handleConfirm}
            className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform"
          >
            Confirm
          </button>
        </div>
      )}
      {request.status === 'rejected' && (
        <p className="text-on-surface-variant">
          Your request was declined: <span className="text-error">{request.reject_reason}</span>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/transfers/TransferStatusCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/transfers/TransferStatusCard.tsx src/components/transfers/TransferStatusCard.test.tsx
git commit -m "feat: add TransferStatusCard component"
```

---

### Task 10: `TicketForm` + `TicketList` components

**Files:**
- Create: `src/components/maintenance/TicketForm.tsx`, `src/components/maintenance/TicketForm.test.tsx`, `src/components/maintenance/TicketList.tsx`, `src/components/maintenance/TicketList.test.tsx`

**Interfaces:**
- Consumes: `raiseTicket` from `src/lib/maintenance.ts` (Task 6); `Ticket`/`TicketWithStudent` types.
- Produces: `export function TicketForm({ onRaised }: { onRaised: () => void })`, `export function TicketList({ tickets, onResolve }: { tickets: Array<Ticket | TicketWithStudent>; onResolve?: (ticketId: string) => void })` - `onResolve` is optional so the same list renders for both a student (read-only, no resolve action) and a warden (with a Resolve button per row). Consumed by `_authenticated.maintenance.tsx` and `_authenticated.requests.tsx` (Task 14).

- [ ] **Step 1: Write the failing tests**

`src/components/maintenance/TicketForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TicketForm } from './TicketForm'

const raiseTicket = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/maintenance', () => ({
  raiseTicket: (...args: unknown[]) => raiseTicket(...args),
}))

describe('TicketForm', () => {
  it('calls raiseTicket with the entered description on submit', async () => {
    const onRaised = vi.fn()
    render(<TicketForm onRaised={onRaised} />)

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Leaky faucet' } })
    fireEvent.click(screen.getByRole('button', { name: /raise ticket/i }))

    await waitFor(() => expect(raiseTicket).toHaveBeenCalledWith('Leaky faucet'))
    expect(onRaised).toHaveBeenCalled()
  })
})
```

`src/components/maintenance/TicketList.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TicketList } from './TicketList'
import type { Ticket } from '../../lib/maintenance'

const tickets: Ticket[] = [
  { id: 'ticket-1', student_id: 's-1', description: 'Leaky faucet', status: 'open', created_at: '2026-07-01T00:00:00Z' },
]

describe('TicketList', () => {
  it('renders each ticket description', () => {
    render(<TicketList tickets={tickets} />)
    expect(screen.getByText('Leaky faucet')).toBeInTheDocument()
  })

  it('shows a Resolve button and calls onResolve when provided', () => {
    const onResolve = vi.fn()
    render(<TicketList tickets={tickets} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    expect(onResolve).toHaveBeenCalledWith('ticket-1')
  })

  it('does not show a Resolve button when onResolve is not provided', () => {
    render(<TicketList tickets={tickets} />)
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/maintenance/TicketForm.test.tsx src/components/maintenance/TicketList.test.tsx`
Expected: FAIL - modules not found

- [ ] **Step 3: Write minimal implementation**

`src/components/maintenance/TicketForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { raiseTicket } from '../../lib/maintenance'

export function TicketForm({ onRaised }: { onRaised: () => void }) {
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await raiseTicket(description)
      setDescription('')
      onRaised()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not raise ticket')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-on-surface-variant">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Raise Ticket
      </button>
    </form>
  )
}
```

`src/components/maintenance/TicketList.tsx`:
```tsx
import type { Ticket, TicketWithStudent } from '../../lib/maintenance'

export function TicketList({
  tickets,
  onResolve,
}: {
  tickets: Array<Ticket | TicketWithStudent>
  onResolve?: (ticketId: string) => void
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            {'student_name' in (tickets[0] ?? {}) && <th className="px-8 py-4">Student</th>}
            <th className="px-8 py-4">Description</th>
            <th className="px-8 py-4">Status</th>
            {onResolve && <th className="px-8 py-4">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              {'student_name' in ticket && <td className="px-8 py-5 text-on-surface-variant">{ticket.student_name}</td>}
              <td className="px-8 py-5 font-medium text-on-surface">{ticket.description}</td>
              <td className="px-8 py-5 text-on-surface-variant">{ticket.status}</td>
              {onResolve && (
                <td className="px-8 py-5">
                  <button onClick={() => onResolve(ticket.id)} className="text-primary font-medium hover:underline">
                    Resolve
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/maintenance/TicketForm.test.tsx src/components/maintenance/TicketList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/maintenance/
git commit -m "feat: add TicketForm and TicketList components"
```

---

### Task 11: `NoticesList` + `PostNoticeForm` components

**Files:**
- Create: `src/components/notices/NoticesList.tsx`, `src/components/notices/NoticesList.test.tsx`, `src/components/notices/PostNoticeForm.tsx`, `src/components/notices/PostNoticeForm.test.tsx`

**Interfaces:**
- Consumes: `Notice` type and `postNotice` from `src/lib/notices.ts` (Task 7).
- Produces: `export function NoticesList({ notices }: { notices: Notice[] })`, `export function PostNoticeForm({ onPosted }: { onPosted: () => void })`. Consumed by `_authenticated.notices.tsx` and `_authenticated.requests.tsx` (Task 14).

- [ ] **Step 1: Write the failing tests**

`src/components/notices/NoticesList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoticesList } from './NoticesList'
import type { Notice } from '../../lib/notices'

const notices: Notice[] = [
  { id: 'notice-1', title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardian_visible: true, created_at: '2026-07-01T00:00:00Z' },
]

describe('NoticesList', () => {
  it('renders each notice title and body', () => {
    render(<NoticesList notices={notices} />)
    expect(screen.getByText('Winter Break Schedule')).toBeInTheDocument()
    expect(screen.getByText('Hostel closes Dec 20.')).toBeInTheDocument()
  })
})
```

`src/components/notices/PostNoticeForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostNoticeForm } from './PostNoticeForm'

const postNotice = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/notices', () => ({
  postNotice: (...args: unknown[]) => postNotice(...args),
}))

describe('PostNoticeForm', () => {
  it('calls postNotice with the entered fields on submit', async () => {
    const onPosted = vi.fn()
    render(<PostNoticeForm onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Winter Break Schedule' } })
    fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Hostel closes Dec 20.' } })
    fireEvent.click(screen.getByLabelText(/visible to guardians/i))
    fireEvent.click(screen.getByRole('button', { name: /post notice/i }))

    await waitFor(() =>
      expect(postNotice).toHaveBeenCalledWith({
        title: 'Winter Break Schedule',
        body: 'Hostel closes Dec 20.',
        guardianVisible: true,
      }),
    )
    expect(onPosted).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/notices/NoticesList.test.tsx src/components/notices/PostNoticeForm.test.tsx`
Expected: FAIL - modules not found

- [ ] **Step 3: Write minimal implementation**

`src/components/notices/NoticesList.tsx`:
```tsx
import type { Notice } from '../../lib/notices'

export function NoticesList({ notices }: { notices: Notice[] }) {
  return (
    <div className="space-y-4">
      {notices.map((notice) => (
        <div key={notice.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
          <h3 className="font-display text-lg text-primary">{notice.title}</h3>
          <p className="text-on-surface-variant">{notice.body}</p>
        </div>
      ))}
    </div>
  )
}
```

`src/components/notices/PostNoticeForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { postNotice } from '../../lib/notices'

export function PostNoticeForm({ onPosted }: { onPosted: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [guardianVisible, setGuardianVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await postNotice({ title, body, guardianVisible })
      setTitle('')
      setBody('')
      setGuardianVisible(false)
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post notice')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-on-surface-variant">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="body" className="block text-sm font-medium text-on-surface-variant">Body</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <input type="checkbox" checked={guardianVisible} onChange={(e) => setGuardianVisible(e.target.checked)} />
        Visible to guardians
      </label>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Post Notice
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/notices/NoticesList.test.tsx src/components/notices/PostNoticeForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/notices/
git commit -m "feat: add NoticesList and PostNoticeForm components"
```

---

### Task 12: `TransferRequestsQueue` component

**Files:**
- Create: `src/components/transfers/TransferRequestsQueue.tsx`
- Test: `src/components/transfers/TransferRequestsQueue.test.tsx`

**Interfaces:**
- Consumes: `TransferRequestWithStudent` type, `approveTransferRequest`/`rejectTransferRequest` from `src/lib/transfers.ts` (Task 5), `Bed` type from `src/lib/rooms.ts`.
- Produces: `export function TransferRequestsQueue({ requests, vacantBedsByType, onDecided }: { requests: TransferRequestWithStudent[]; vacantBedsByType: (roomType: TransferRequestWithStudent['preferred_room_type']) => Bed[]; onDecided: () => void })` - for each request, shows a bed picker restricted to vacant beds of that request's `preferred_room_type` (computed by the caller via `vacantBedsByType`, so this component doesn't need the full room list, just a lookup function - keeps it focused). Consumed by `_authenticated.requests.tsx` (Task 14).

- [ ] **Step 1: Write the failing test**

`src/components/transfers/TransferRequestsQueue.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferRequestsQueue } from './TransferRequestsQueue'
import type { TransferRequestWithStudent } from '../../lib/transfers'
import type { Bed } from '../../lib/rooms'

const approveTransferRequest = vi.fn().mockResolvedValue(undefined)
const rejectTransferRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  approveTransferRequest: (...args: unknown[]) => approveTransferRequest(...args),
  rejectTransferRequest: (...args: unknown[]) => rejectTransferRequest(...args),
}))

const requests: TransferRequestWithStudent[] = [
  {
    id: 'req-1', student_id: 's-1', student_name: 'Sita Nepali', reason: 'Roommate conflict',
    preferred_room_type: 'twin', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null,
    price_diff: null, reject_reason: null, created_at: '2026-07-01T00:00:00Z',
  },
]

const vacantBeds: Bed[] = [{ id: 'bed-9', room_id: 'room-9', bed_label: 'A', status: 'vacant' }]
const vacantBedsByType = vi.fn(() => vacantBeds)

describe('TransferRequestsQueue', () => {
  it('renders the student name, reason, and a bed picker limited to vacantBedsByType', () => {
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={vi.fn()} />)
    expect(screen.getByText('Sita Nepali')).toBeInTheDocument()
    expect(screen.getByText('Roommate conflict')).toBeInTheDocument()
    expect(vacantBedsByType).toHaveBeenCalledWith('twin')
  })

  it('approves with the selected bed and calls onDecided', async () => {
    const onDecided = vi.fn()
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={onDecided} />)

    fireEvent.change(screen.getByLabelText(/assign bed/i), { target: { value: 'bed-9' } })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(approveTransferRequest).toHaveBeenCalledWith('req-1', 'bed-9'))
    expect(onDecided).toHaveBeenCalled()
  })

  it('rejects with the entered reason and calls onDecided', async () => {
    const onDecided = vi.fn()
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={onDecided} />)

    fireEvent.change(screen.getByLabelText(/reject reason/i), { target: { value: 'No vacancy' } })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))

    await waitFor(() => expect(rejectTransferRequest).toHaveBeenCalledWith('req-1', 'No vacancy'))
    expect(onDecided).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/transfers/TransferRequestsQueue.test.tsx`
Expected: FAIL - `Cannot find module './TransferRequestsQueue'`

- [ ] **Step 3: Write minimal implementation**

`src/components/transfers/TransferRequestsQueue.tsx`:
```tsx
import { useState } from 'react'
import { approveTransferRequest, rejectTransferRequest, type TransferRequestWithStudent } from '../../lib/transfers'
import type { Bed } from '../../lib/rooms'

function RequestRow({
  request,
  vacantBeds,
  onDecided,
}: {
  request: TransferRequestWithStudent
  vacantBeds: Bed[]
  onDecided: () => void
}) {
  const [selectedBedId, setSelectedBedId] = useState(vacantBeds[0]?.id ?? '')
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    try {
      await approveTransferRequest(request.id, selectedBedId)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function handleReject() {
    setError(null)
    try {
      await rejectTransferRequest(request.id, rejectReason)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
      <div>
        <p className="font-medium text-on-surface">{request.student_name}</p>
        <p className="text-on-surface-variant text-sm">{request.reason}</p>
        <p className="text-xs uppercase tracking-wider text-secondary mt-1">Preferred: {request.preferred_room_type}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={`bed-${request.id}`} className="block text-sm font-medium text-on-surface-variant">Assign Bed</label>
        <select
          id={`bed-${request.id}`}
          value={selectedBedId}
          onChange={(e) => setSelectedBedId(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          {vacantBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor={`reject-${request.id}`} className="block text-sm font-medium text-on-surface-variant">Reject Reason</label>
        <input
          id={`reject-${request.id}`}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-3">
        <button onClick={handleApprove} className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Approve
        </button>
        <button onClick={handleReject} className="border border-error text-error px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Reject
        </button>
      </div>
    </div>
  )
}

export function TransferRequestsQueue({
  requests,
  vacantBedsByType,
  onDecided,
}: {
  requests: TransferRequestWithStudent[]
  vacantBedsByType: (roomType: TransferRequestWithStudent['preferred_room_type']) => Bed[]
  onDecided: () => void
}) {
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          vacantBeds={vacantBedsByType(request.preferred_room_type)}
          onDecided={onDecided}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/transfers/TransferRequestsQueue.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/transfers/TransferRequestsQueue.tsx src/components/transfers/TransferRequestsQueue.test.tsx
git commit -m "feat: add TransferRequestsQueue component with live bed availability"
```

---

### Task 13: Nav items + student and warden routes

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Create: `src/routes/_authenticated.my-room.tsx`, `src/routes/_authenticated.maintenance.tsx`, `src/routes/_authenticated.notices.tsx`, `src/routes/_authenticated.requests.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5-12, plus `fetchStudents`/`Student` (Stage 2 `students.ts`), `fetchRoomsWithBeds`/`Room`/`Bed` (Stage 2 `rooms.ts`).
- Produces: student nav gains "My Room", "Maintenance", "Notices"; owner/warden nav gains "Requests". Four new routes.

- [ ] **Step 1: Update the nav test**

In `src/lib/nav.test.ts`, extend all four role test cases:
```typescript
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
```
(Replace the existing owner/warden/student/guardian tests from Stage 3 with these expanded versions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL - missing items.

- [ ] **Step 3: Update `getNavItemsForRole`**

In `src/lib/nav.ts`:
```typescript
const REQUESTS: NavItem = { label: 'Requests', path: '/requests' }
const MY_ROOM: NavItem = { label: 'My Room', path: '/my-room' }
const MAINTENANCE: NavItem = { label: 'Maintenance', path: '/maintenance' }
const NOTICES: NavItem = { label: 'Notices', path: '/notices' }

export function getNavItemsForRole(role: Role): NavItem[] {
  switch (role) {
    case 'owner':
      return [DASHBOARD, ROOMS, RESIDENTS, FEES, REQUESTS, FINANCIAL_SETTINGS]
    case 'warden':
      return [DASHBOARD, ROOMS, RESIDENTS, FEES, REQUESTS]
    case 'student':
      return [DASHBOARD, MY_ROOM, MAINTENANCE, NOTICES]
    case 'guardian':
      return [DASHBOARD]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Add the My Room route**

`src/routes/_authenticated.my-room.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchStudents, type Student } from '../lib/students'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { fetchMyTransferRequests, type TransferRequest } from '../lib/transfers'
import { TransferRequestForm } from '../components/transfers/TransferRequestForm'
import { TransferStatusCard } from '../components/transfers/TransferStatusCard'

function MyRoomPage() {
  const [student, setStudent] = useState<Student | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRequest, setActiveRequest] = useState<TransferRequest | null>(null)

  function refetch() {
    fetchStudents().then((students) => setStudent(students[0] ?? null))
    fetchRoomsWithBeds().then(setRooms)
    fetchMyTransferRequests().then((requests) => {
      const active = requests.find((r) => r.status === 'pending' || r.status === 'awaiting_confirmation' || r.status === 'rejected')
      setActiveRequest(active ?? null)
    })
  }

  useEffect(() => {
    refetch()
  }, [])

  if (!student) return null

  const currentRoom = rooms.find((r) => r.beds.some((b) => b.id === student.bed_id))
  const currentBed = currentRoom?.beds.find((b) => b.id === student.bed_id)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">My Room</h2>
      {currentRoom && currentBed && (
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Current Room</p>
          <p className="font-display text-2xl text-primary mt-2">{currentRoom.room_number} - Bed {currentBed.bed_label}</p>
        </div>
      )}
      {activeRequest ? (
        <TransferStatusCard request={activeRequest} onConfirmed={refetch} />
      ) : (
        student.bed_id && <TransferRequestForm fromBedId={student.bed_id} onSubmitted={refetch} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-room')({
  component: MyRoomPage,
})
```

- [ ] **Step 6: Add the Maintenance route**

`src/routes/_authenticated.maintenance.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyTickets, type Ticket } from '../lib/maintenance'
import { TicketForm } from '../components/maintenance/TicketForm'
import { TicketList } from '../components/maintenance/TicketList'

function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])

  function refetch() {
    fetchMyTickets().then(setTickets)
  }

  useEffect(() => {
    refetch()
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Maintenance</h2>
      <TicketForm onRaised={refetch} />
      <TicketList tickets={tickets} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/maintenance')({
  component: MaintenancePage,
})
```

- [ ] **Step 7: Add the Notices route (student)**

`src/routes/_authenticated.notices.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchNotices, type Notice } from '../lib/notices'
import { NoticesList } from '../components/notices/NoticesList'

function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    fetchNotices().then(setNotices)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Notices</h2>
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/notices')({
  component: NoticesPage,
})
```

- [ ] **Step 8: Add the Requests route (owner/warden)**

`src/routes/_authenticated.requests.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPendingTransferRequests, type TransferRequestWithStudent } from '../lib/transfers'
import { fetchOpenTickets, resolveTicket, type TicketWithStudent } from '../lib/maintenance'
import { fetchNotices, type Notice } from '../lib/notices'
import { fetchRoomsWithBeds, type Room, type Bed } from '../lib/rooms'
import { TransferRequestsQueue } from '../components/transfers/TransferRequestsQueue'
import { TicketList } from '../components/maintenance/TicketList'
import { PostNoticeForm } from '../components/notices/PostNoticeForm'
import { NoticesList } from '../components/notices/NoticesList'

function RequestsPage() {
  const [transferRequests, setTransferRequests] = useState<TransferRequestWithStudent[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  function refetch() {
    fetchPendingTransferRequests().then(setTransferRequests)
    fetchOpenTickets().then(setTickets)
    fetchNotices().then(setNotices)
    fetchRoomsWithBeds().then(setRooms)
  }

  useEffect(() => {
    refetch()
  }, [])

  function vacantBedsByType(roomType: TransferRequestWithStudent['preferred_room_type']): Bed[] {
    return rooms
      .filter((r) => r.room_type === roomType)
      .flatMap((r) => r.beds)
      .filter((b) => b.status === 'vacant')
  }

  async function handleResolve(ticketId: string) {
    await resolveTicket(ticketId)
    refetch()
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Requests</h2>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Transfer Requests</h3>
        <TransferRequestsQueue requests={transferRequests} vacantBedsByType={vacantBedsByType} onDecided={refetch} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Maintenance Tickets</h3>
        <TicketList tickets={tickets} onResolve={handleResolve} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Notices</h3>
        <PostNoticeForm onPosted={refetch} />
        <NoticesList notices={notices} />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/requests')({
  component: RequestsPage,
})
```

Run `npm run dev` once to let the TanStack Router Vite plugin regenerate `src/routeTree.gen.ts` with the four new routes, then stop the dev server.

- [ ] **Step 9: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add student and warden request/maintenance/notices routes and nav items"
```

---

## Self-Review Notes

- **Spec coverage:** transfer requests with warden approval + live bed availability (Task 12), student-confirm-before-price-change (Task 4's `confirm_transfer`, Task 9's `TransferStatusCard`), rejection with reason (Task 3, Task 12), full audit trail on the request row itself (Task 1's columns), maintenance tickets (Tasks 6, 10), notices with `guardian_visible` flag RLS-ready for Stage 5 (Task 2, Task 7). All Stage 4 spec items covered.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact SQL/dashboard action.
- **Type consistency:** `TransferRequest`/`TransferStatus`/`TransferRequestWithStudent` defined once in `transfers.ts`; `Ticket`/`TicketStatus`/`TicketWithStudent` once in `maintenance.ts`; `Notice` once in `notices.ts` - imported everywhere else, never redefined.
- **Security-critical design decision baked in upfront, not left for review to catch:** `confirm_transfer` is `security definer` (the only one in this stage) because the student caller has no direct write access to `beds`/`students`/`invoices`; it performs its own `auth.uid()` check to compensate for RLS being bypassed. `approve_transfer_request`/`reject_transfer_request` stay `security invoker` since the warden caller already has direct write access everywhere they touch. Getting this split wrong (either direction) is the single highest-risk mistake in this stage.
- **Known Stage 2 bug class prevented proactively:** both `approve_transfer_request`'s same-price branch and `confirm_transfer` use the `select ... for update` row-lock pattern on the target bed before writing, matching the fix that was needed for `check_in_student` in Stage 2 - not repeating that TOCTOU bug this time.
