# Fee Model Extension (Spec §6.5, scoped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the fee model with itemized charges (`fee_heads`), check-in proration, numbered receipts, and a trigger-written audit log - scoped down from the full spec per the owner's explicit instruction (no multi-cycle billing, no automated late fees, no `fee_structures` bundles).

**Architecture:** Four independent, additive migrations (nothing drops or renames an existing column - every existing consumer of `invoices.amount` keeps working unchanged). New RPC/lib functions follow the exact patterns already established in this codebase (`record_guardian_payment`'s lock-and-guard shape, `RoomTypeForm`'s owner-only create pattern, `write_audit_log`'s trigger-only-write shape matching this project's "no raw DB error, no bypassable write path" discipline).

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- **No multi-cycle billing, no automated late fees, no `fee_structures` bundles.** Explicitly out of scope per the owner's instruction - do not add a billing-cycle field, a late-fee rule, or a room-type-to-fee-head bundle table.
- **No checkout-side proration.** No checkout/vacate workflow exists in this codebase yet - proration applies only to the check-in side of `generate_monthly_invoices`.
- **`invoices.amount` remains the single source of truth for what's owed.** Every existing consumer (`lib/dues.ts`, `fees.tsx`, `record_guardian_payment`, the receipt page) reads it as one number - `add_invoice_item` keeps it in sync atomically, never replaced by a computed sum at read time.
- **No PDF-generation library added.** "Downloadable" receipts means the browser's native print-to-PDF via `window.print()` - the receipt page's print-clean CSS (`print:hidden` on the sidebar/topbar, `print:ml-0 print:pt-0` on the main content area) already exists in `AdminShell`/`Sidebar`/`TopBar` from a prior stage; this plan only adds the receipt number to the existing page, no new print CSS needed.
- **`audit_log` has no insert/update/delete RLS policy for any role.** The only way a row enters the table is through `write_audit_log()`'s `security definer` trigger - this is the actual "cannot be bypassed from application code" enforcement, not just the trigger's existence.
- **`generate_monthly_invoices` keeps its exact existing signature** (`p_billing_month date) returns void`) - `create or replace function` is safe for it, unlike the room-management plan's `approve_booking` case which needed a drop-and-recreate for an arity change.
- Migrations are applied manually by the user in the Supabase SQL Editor - no agent has DB credentials.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0024_fee_heads_and_invoice_items.sql   # NEW
      0025_generate_invoices_proration.sql   # NEW
      0026_payments_receipt_no.sql           # NEW
      0027_audit_log.sql                     # NEW
  src/
    lib/
      fees.ts                                 # MODIFIED: fee head + charge functions
      fees.test.ts                            # MODIFIED
    components/
      fees/
        DuesTable.tsx                          # MODIFIED: onAddCharge action
        DuesTable.test.tsx                     # MODIFIED
        FeeHeadForm.tsx                        # NEW
        FeeHeadForm.test.tsx                   # NEW
        AddChargeForm.tsx                      # NEW
        AddChargeForm.test.tsx                 # NEW
    routes/
      _authenticated.fees.tsx                  # MODIFIED: wire fee heads + charges
      _authenticated.receipt.$invoiceId.tsx    # MODIFIED: receipt_no
```

---

### Task 1: Migration 0024 - `fee_heads` + `invoice_items` + `add_invoice_item` RPC

**Files:**
- Create: `supabase/migrations/0024_fee_heads_and_invoice_items.sql`

**Interfaces:**
- Produces: `public.fee_heads`, `public.invoice_items`, `public.add_invoice_item(uuid, uuid, numeric, text default null)`.

No automated test - SQL, manually applied and verified by the user.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0024_fee_heads_and_invoice_items.sql`:
```sql
create table public.fee_heads (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.fee_heads (name, is_recurring) values ('Rent', true);

alter table public.fee_heads enable row level security;

create policy "fee_heads_owner_full_access" on public.fee_heads
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

create policy "fee_heads_read_all_authenticated" on public.fee_heads
  for select
  using (public.current_role() in ('warden', 'student', 'guardian'));

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fee_head_id uuid not null references public.fee_heads(id),
  description text,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table public.invoice_items enable row level security;

create policy "invoice_items_owner_warden_full_access" on public.invoice_items
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "invoice_items_own_select" on public.invoice_items
  for select
  using (invoice_id in (select id from public.invoices where student_id = auth.uid()));

-- Keeps invoices.amount (the single number every existing consumer reads)
-- and the itemized breakdown atomic - not security definer, the caller
-- already has direct RLS write access to invoices via
-- invoices_owner_warden_full_access.
create function public.add_invoice_item(p_invoice_id uuid, p_fee_head_id uuid, p_amount numeric, p_description text default null)
returns void
language plpgsql
as $$
begin
  if (select status from public.invoices where id = p_invoice_id for update) <> 'unpaid' then
    raise exception 'Invoice % is not unpaid', p_invoice_id;
  end if;

  insert into public.invoice_items (invoice_id, fee_head_id, description, amount)
  values (p_invoice_id, p_fee_head_id, p_description, p_amount);

  update public.invoices set amount = amount + p_amount where id = p_invoice_id;
end;
$$;

revoke execute on function public.add_invoice_item(uuid, uuid, numeric, text) from public;
grant execute on function public.add_invoice_item(uuid, uuid, numeric, text) to authenticated;
```

- [ ] **Step 2: Self-review**

Confirm: `fee_heads` RLS matches `room_types`' exact owner-write/read-all-authenticated split; `invoice_items`'s own-select policy correctly scopes a student to only their own invoices' items (mirrors `payments_own_select`'s subquery shape from `0006`); `add_invoice_item` locks the invoice row (`for update`) before checking status, same discipline as `record_guardian_payment`; the seeded `'Rent'` row has `is_recurring = true`.

- [ ] **Step 3: Apply and verify**

```sql
select name, is_recurring from public.fee_heads;
-- expect one row: Rent, true

select proname from pg_proc where proname = 'add_invoice_item';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0024_fee_heads_and_invoice_items.sql
git commit -m "feat: add fee_heads, invoice_items, and add_invoice_item RPC"
```

---

### Task 2: Migration 0025 - check-in proration in `generate_monthly_invoices`

**Files:**
- Create: `supabase/migrations/0025_generate_invoices_proration.sql`

**Interfaces:**
- Produces: updated `public.generate_monthly_invoices(date)` (same signature as `0008`/`0023`).

No automated test - SQL, manually applied and verified by the user.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0025_generate_invoices_proration.sql`:
```sql
-- Prorate a student's invoice for the billing month they joined in,
-- based on remaining days in that month from check_in_date. No
-- checkout-side proration - no checkout/vacate flow exists yet to
-- prorate against. Signature unchanged from 0023, so create or replace
-- is safe (no overload/grant-loss risk).
create or replace function public.generate_monthly_invoices(p_billing_month date)
returns void
language plpgsql
as $$
begin
  insert into public.invoices (student_id, billing_month, amount, due_date, status)
  select
    s.id,
    p_billing_month,
    case
      when s.check_in_date >= p_billing_month and s.check_in_date < (p_billing_month + interval '1 month')
        then round(rt.base_rent * (extract(day from (p_billing_month + interval '1 month' - interval '1 day')) - extract(day from s.check_in_date) + 1) / extract(day from (p_billing_month + interval '1 month' - interval '1 day')))
      else rt.base_rent
    end,
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

- [ ] **Step 2: Self-review**

Confirm: a student who joined before the target billing month (the common case) still gets the full `rt.base_rent` (the `case` falls to `else`); a student joining on the 1st of the target month gets the full fraction too (`(days_in_month - 1 + 1) / days_in_month = 1`); the days-in-month calculation (`extract(day from (p_billing_month + interval '1 month' - interval '1 day'))`) correctly handles 28/29/30/31-day months without a lookup table; `round()` matches every other money field in this schema.

- [ ] **Step 3: Apply and verify**

```sql
select proname, prosrc like '%case%' as has_proration from pg_proc where proname = 'generate_monthly_invoices';
-- expect has_proration = true
```

Manual functional check (safe to run against real data - `on conflict do nothing` makes it a no-op for students already invoiced this month):
```sql
select generate_monthly_invoices(date_trunc('month', current_date)::date);
select student_id, billing_month, amount from public.invoices where billing_month = date_trunc('month', current_date)::date order by amount;
-- a student who checked in this month should show an amount less than a full-month student's, proportional to days remaining
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0025_generate_invoices_proration.sql
git commit -m "feat: prorate check-in-month invoices in generate_monthly_invoices"
```

---

### Task 3: Migration 0026 - `payments.receipt_no`

**Files:**
- Create: `supabase/migrations/0026_payments_receipt_no.sql`

**Interfaces:**
- Produces: `public.payments.receipt_no` (bigint, sequential).

No automated test - SQL, manually applied and verified by the user.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0026_payments_receipt_no.sql`:
```sql
-- A Postgres identity column, not a manually-computed max()+1 - atomic
-- under concurrent payment recording, and backfills every existing
-- payment row with a number in insertion order automatically.
alter table public.payments add column receipt_no bigint generated always as identity;
```

- [ ] **Step 2: Apply and verify**

```sql
select id, receipt_no from public.payments order by receipt_no limit 5;
-- expect every existing payment to have a distinct, sequential receipt_no
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0026_payments_receipt_no.sql
git commit -m "feat: add sequential receipt_no to payments"
```

---

### Task 4: Migration 0027 - `audit_log` + trigger

**Files:**
- Create: `supabase/migrations/0027_audit_log.sql`

**Interfaces:**
- Produces: `public.audit_log`, `public.write_audit_log()`, triggers on `payments`/`students`/`profiles`.

No automated test - SQL, manually applied and verified by the user.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0027_audit_log.sql`:
```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- No insert/update/delete policy for any role, on purpose - the only
-- way a row enters this table is through write_audit_log()'s security
-- definer trigger below. This is the actual "cannot be bypassed from
-- application code" enforcement (spec section 10.2), not just the
-- trigger's existence - even an owner's own client cannot
-- `insert into audit_log` directly.
create policy "audit_log_owner_read" on public.audit_log
  for select
  using (public.current_role() = 'owner');

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before_data, after_data)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger audit_payments
  after insert on public.payments
  for each row execute function public.write_audit_log();

-- insert = new allotment (check-in); update of bed_id = reallotment
-- (a transfer's bed change) - not a bare "after update", so routine
-- non-allotment student edits don't spam the log.
create trigger audit_students
  after insert or update of bed_id on public.students
  for each row execute function public.write_audit_log();

-- update of role, combined with the when() guard, fires only on an
-- actual role change - not merely because the role column was named
-- in an unrelated update statement.
create trigger audit_profiles_role
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.write_audit_log();
```

- [ ] **Step 2: Self-review**

Confirm: `audit_log` has exactly one RLS policy (owner select-only) and no write policy for any role; `write_audit_log()` has `security definer` and `set search_path = public`; `audit_students`'s trigger is `update of bed_id`, not a bare `after update`; `audit_profiles_role`'s `when` clause correctly guards against non-role-changing updates.

- [ ] **Step 3: Apply and verify**

```sql
select tgname, tgrelid::regclass from pg_trigger where tgname like 'audit_%';
-- expect audit_payments on payments, audit_students on students, audit_profiles_role on profiles

select count(*) from public.audit_log;
-- expect 0 immediately after migration (no triggering action has happened yet)
```

Functional check: record a real payment or check in a student through the app, then:
```sql
select action, entity, entity_id, created_at from public.audit_log order by created_at desc limit 5;
-- expect a new row matching the action just taken
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0027_audit_log.sql
git commit -m "feat: add audit_log table with a security-definer trigger, no bypassable write path"
```

---

### Task 5: `lib/fees.ts` - fee head and charge functions

**Files:**
- Modify: `src/lib/fees.ts`, `src/lib/fees.test.ts`

**Interfaces:**
- Produces: `FeeHead` type, `fetchFeeHeads()`, `createFeeHead(name, isRecurring)`, `addInvoiceItem(invoiceId, feeHeadId, amount, description?)` - consumed by Tasks 6-9.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/fees.test.ts` (extend the existing `vi.mock('./supabase', ...)` - the mocked `from` needs to handle the `'fee_heads'` table alongside the existing `'invoices'`-shaped calls; the existing mock's `from` is a single `vi.fn()` returning one fixed shape, so widen it to branch on the table name argument):
```typescript
// Replace the existing vi.mock('./supabase', ...) block with:
const mockInvoicesRawData = [
  {
    id: 'invoice-1',
    student_id: 'student-1',
    billing_month: '2026-07-01',
    amount: 14000,
    due_date: '2026-07-08',
    status: 'unpaid',
    students: { profiles: { full_name: 'Anjali Adhikari' } },
  },
]

const mockFeeHeadsData = [{ id: 'fh-1', name: 'Rent', is_recurring: true }]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

const fromMock = vi.fn((table: string) => {
  if (table === 'invoices') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: mockInvoicesRawData, error: null })),
      })),
    }
  }
  if (table === 'fee_heads') {
    return {
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockFeeHeadsData, error: null })) })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    }
  }
  throw new Error(`unexpected table: ${table}`)
})

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

// New describe blocks, added alongside the existing fetchDuesInvoices/generateMonthlyInvoices/recordPayment ones:
describe('fetchFeeHeads', () => {
  it('returns all fee heads', async () => {
    const { fetchFeeHeads } = await import('./fees')
    const feeHeads = await fetchFeeHeads()
    expect(feeHeads).toEqual(mockFeeHeadsData)
  })
})

describe('createFeeHead', () => {
  it('inserts a fee head with the given name and recurring flag', async () => {
    const { createFeeHead } = await import('./fees')
    await createFeeHead('Mess Charge', false)
    expect(fromMock).toHaveBeenCalledWith('fee_heads')
  })
})

describe('addInvoiceItem', () => {
  it('calls the add_invoice_item RPC with the given fields', async () => {
    const { addInvoiceItem } = await import('./fees')
    await addInvoiceItem('invoice-1', 'fh-1', 500, 'Extra mess charge')
    expect(rpcMock).toHaveBeenCalledWith('add_invoice_item', {
      p_invoice_id: 'invoice-1',
      p_fee_head_id: 'fh-1',
      p_amount: 500,
      p_description: 'Extra mess charge',
    })
  })

  it('sends null description when omitted', async () => {
    const { addInvoiceItem } = await import('./fees')
    await addInvoiceItem('invoice-1', 'fh-1', 500)
    expect(rpcMock).toHaveBeenCalledWith('add_invoice_item', {
      p_invoice_id: 'invoice-1',
      p_fee_head_id: 'fh-1',
      p_amount: 500,
      p_description: null,
    })
  })
})
```

(The existing `fetchDuesInvoices`/`generateMonthlyInvoices`/`recordPayment` describe blocks stay exactly as they are - only the mock setup above them changes shape, from a single fixed `from` mock to one that branches on table name.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/fees.test.ts`
Expected: FAIL - `fetchFeeHeads`/`createFeeHead`/`addInvoiceItem` not exported yet.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/fees.ts`:
```typescript
export type FeeHead = {
  id: string
  name: string
  is_recurring: boolean
}

export async function fetchFeeHeads(): Promise<FeeHead[]> {
  const { data, error } = await supabase.from('fee_heads').select('*').order('name')
  if (error) throw error
  return (data ?? []) as FeeHead[]
}

export async function createFeeHead(name: string, isRecurring: boolean): Promise<void> {
  const { error } = await supabase.from('fee_heads').insert({ name, is_recurring: isRecurring })
  if (error) throw error
}

export async function addInvoiceItem(invoiceId: string, feeHeadId: string, amount: number, description?: string): Promise<void> {
  const { error } = await supabase.rpc('add_invoice_item', {
    p_invoice_id: invoiceId,
    p_fee_head_id: feeHeadId,
    p_amount: amount,
    p_description: description ?? null,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/fees.test.ts`
Expected: PASS (all describe blocks, existing and new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fees.ts src/lib/fees.test.ts
git commit -m "feat: add fee head and invoice item functions to lib/fees"
```

---

### Task 6: `FeeHeadForm` component

**Files:**
- Create: `src/components/fees/FeeHeadForm.tsx`, `src/components/fees/FeeHeadForm.test.tsx`

**Interfaces:**
- Consumes: `createFeeHead` (Task 5).
- Produces: `export function FeeHeadForm({ onSaved }: { onSaved: () => void })` - consumed by the route (Task 9). Create-only (no edit) - a fee head is just a name plus a flag, matching the "just enough" scope, not a full CRUD surface.

- [ ] **Step 1: Write the failing tests**

`src/components/fees/FeeHeadForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeeHeadForm } from './FeeHeadForm'

const createFeeHead = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/fees', () => ({
  createFeeHead: (...args: unknown[]) => createFeeHead(...args),
}))

describe('FeeHeadForm', () => {
  it('creates a fee head with the entered name and recurring flag, then resets the form', async () => {
    const onSaved = vi.fn()
    render(<FeeHeadForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Mess Charge' } })
    fireEvent.click(screen.getByLabelText(/recurring/i))
    fireEvent.click(screen.getByRole('button', { name: /add fee head/i }))

    await waitFor(() => expect(createFeeHead).toHaveBeenCalledWith('Mess Charge', true))
    expect(onSaved).toHaveBeenCalled()
    expect(screen.getByLabelText(/name/i)).toHaveValue('')
  })

  it('shows an error when saving rejects', async () => {
    createFeeHead.mockRejectedValueOnce(new Error('Fee head name already exists'))
    render(<FeeHeadForm onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Rent' } })
    fireEvent.click(screen.getByRole('button', { name: /add fee head/i }))

    await waitFor(() => expect(screen.getByText('Fee head name already exists')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/fees/FeeHeadForm.test.tsx`
Expected: FAIL - `Cannot find module './FeeHeadForm'`

- [ ] **Step 3: Write the implementation**

`src/components/fees/FeeHeadForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { createFeeHead } from '../../lib/fees'

export function FeeHeadForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createFeeHead(name, isRecurring)
      setName('')
      setIsRecurring(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save fee head')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="feeHeadName" className="block text-sm font-medium text-on-surface-variant">Name</label>
        <input id="feeHeadName" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <label className="flex items-center gap-2">
        <input id="feeHeadRecurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        Recurring
      </label>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Add Fee Head
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/fees/FeeHeadForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/fees/FeeHeadForm.tsx src/components/fees/FeeHeadForm.test.tsx
git commit -m "feat: add FeeHeadForm component"
```

---

### Task 7: `AddChargeForm` component

**Files:**
- Create: `src/components/fees/AddChargeForm.tsx`, `src/components/fees/AddChargeForm.test.tsx`

**Interfaces:**
- Consumes: `addInvoiceItem`, `FeeHead` (Task 5).
- Produces: `export function AddChargeForm({ invoiceId, feeHeads, onAdded }: { invoiceId: string; feeHeads: FeeHead[]; onAdded: () => void })` - consumed by the route (Task 9).

- [ ] **Step 1: Write the failing tests**

`src/components/fees/AddChargeForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddChargeForm } from './AddChargeForm'
import type { FeeHead } from '../../lib/fees'

const addInvoiceItem = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/fees', () => ({
  addInvoiceItem: (...args: unknown[]) => addInvoiceItem(...args),
}))

const feeHeads: FeeHead[] = [
  { id: 'fh-1', name: 'Rent', is_recurring: true },
  { id: 'fh-2', name: 'Mess Charge', is_recurring: false },
]

describe('AddChargeForm', () => {
  it('adds a charge with the entered fields, defaulting to the first fee head', async () => {
    const onAdded = vi.fn()
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={onAdded} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Late night pass' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(addInvoiceItem).toHaveBeenCalledWith('invoice-1', 'fh-1', 500, 'Late night pass'))
    expect(onAdded).toHaveBeenCalled()
  })

  it('sends undefined description when left blank', async () => {
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(addInvoiceItem).toHaveBeenCalledWith('invoice-1', 'fh-1', 500, undefined))
  })

  it('shows an error when adding rejects', async () => {
    addInvoiceItem.mockRejectedValueOnce(new Error('Invoice invoice-1 is not unpaid'))
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(screen.getByText('Invoice invoice-1 is not unpaid')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/fees/AddChargeForm.test.tsx`
Expected: FAIL - `Cannot find module './AddChargeForm'`

- [ ] **Step 3: Write the implementation**

`src/components/fees/AddChargeForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { addInvoiceItem, type FeeHead } from '../../lib/fees'

export function AddChargeForm({ invoiceId, feeHeads, onAdded }: { invoiceId: string; feeHeads: FeeHead[]; onAdded: () => void }) {
  const [feeHeadId, setFeeHeadId] = useState(feeHeads[0]?.id ?? '')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addInvoiceItem(invoiceId, feeHeadId, amount, description || undefined)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add charge')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="chargeFeeHead" className="block text-sm font-medium text-on-surface-variant">Fee Head</label>
        <select id="chargeFeeHead" value={feeHeadId} onChange={(e) => setFeeHeadId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required>
          {feeHeads.map((fh) => (
            <option key={fh.id} value={fh.id}>{fh.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="chargeAmount" className="block text-sm font-medium text-on-surface-variant">Amount</label>
        <input id="chargeAmount" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="chargeDescription" className="block text-sm font-medium text-on-surface-variant">Description (optional)</label>
        <input id="chargeDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Add Charge
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/fees/AddChargeForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/fees/AddChargeForm.tsx src/components/fees/AddChargeForm.test.tsx
git commit -m "feat: add AddChargeForm component"
```

---

### Task 8: `DuesTable` - add the "Add Charge" action

**Files:**
- Modify: `src/components/fees/DuesTable.tsx`, `src/components/fees/DuesTable.test.tsx`

**Interfaces:**
- Consumes: `Invoice` (existing `lib/fees.ts`).
- Produces: `DuesTable` gains an optional `onAddCharge?: (invoice: Invoice) => void` prop - consumed by the route (Task 9). When provided, an "Add Charge" button appears per row alongside the existing "Record Payment" button; when omitted, `DuesTable` renders exactly as it did before this task (existing callers/tests unaffected).

- [ ] **Step 1: Update the test**

Replace `src/components/fees/DuesTable.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DuesTable } from './DuesTable'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2099-01-01', status: 'unpaid' },
]

describe('DuesTable', () => {
  it('renders invoice rows with a Record Payment action', () => {
    const onSelectInvoice = vi.fn()
    render(<DuesTable invoices={invoices} onSelectInvoice={onSelectInvoice} />)
    expect(screen.getByText('Anjali')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /record payment/i }))
    expect(onSelectInvoice).toHaveBeenCalledWith(invoices[0])
  })

  it('does not render an Add Charge action when onAddCharge is omitted', () => {
    render(<DuesTable invoices={invoices} onSelectInvoice={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /add charge/i })).not.toBeInTheDocument()
  })

  it('renders an Add Charge action when onAddCharge is provided, and calls it with the invoice', () => {
    const onAddCharge = vi.fn()
    render(<DuesTable invoices={invoices} onSelectInvoice={vi.fn()} onAddCharge={onAddCharge} />)

    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))
    expect(onAddCharge).toHaveBeenCalledWith(invoices[0])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/fees/DuesTable.test.tsx`
Expected: FAIL - no `onAddCharge` prop exists yet, "Add Charge" button never renders.

- [ ] **Step 3: Update the implementation**

In `src/components/fees/DuesTable.tsx`, update the props destructuring and the Action cell:
```tsx
export function DuesTable({
  invoices,
  onSelectInvoice,
  onAddCharge,
}: {
  invoices: Invoice[]
  onSelectInvoice: (invoice: Invoice) => void
  onAddCharge?: (invoice: Invoice) => void
}) {
```
And in the Action `<td>`, add the second button alongside the existing "Record Payment" one:
```tsx
              <td className="px-8 py-5 space-x-4">
                <button
                  onClick={() => onSelectInvoice(invoice)}
                  className="text-primary font-medium hover:underline"
                >
                  Record Payment
                </button>
                {onAddCharge && (
                  <button
                    onClick={() => onAddCharge(invoice)}
                    className="text-primary font-medium hover:underline"
                  >
                    Add Charge
                  </button>
                )}
              </td>
```
(Everything else in the file - the table structure, `isOverdue` usage, the Name/Amount/Due Date/Status columns - is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/fees/DuesTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/fees/DuesTable.tsx src/components/fees/DuesTable.test.tsx
git commit -m "feat: add an Add Charge action to DuesTable"
```

---

### Task 9: Wire fee heads and charges into `/fees`

**Files:**
- Modify: `src/routes/_authenticated.fees.tsx`

**Interfaces:**
- Consumes: `fetchFeeHeads` (Task 5), `FeeHeadForm` (Task 6), `AddChargeForm` (Task 7), `DuesTable`'s new `onAddCharge` prop (Task 8), `useAuth` (existing `lib/auth`).
- Produces: no new exports - route wiring only.

- [ ] **Step 1: Update `src/routes/_authenticated.fees.tsx`**

Add the imports:
```tsx
import { useAuth } from '../lib/auth'
import { fetchFeeHeads, type FeeHead } from '../lib/fees'
import { FeeHeadForm } from '../components/fees/FeeHeadForm'
import { AddChargeForm } from '../components/fees/AddChargeForm'
```

Add state and a fee-heads fetch, a charging-invoice selection, and an owner-only fee-head-adding toggle, inside `FeesPage`:
```tsx
function FeesPage() {
  const { role } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [lastPaidInvoiceId, setLastPaidInvoiceId] = useState<string | null>(null)
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [chargingInvoice, setChargingInvoice] = useState<Invoice | null>(null)
  const [addingFeeHead, setAddingFeeHead] = useState(false)
  const canManage = role === 'owner'

  function refetch() {
    fetchDuesInvoices().then(setInvoices)
    fetchFeeHeads().then(setFeeHeads)
  }

  useEffect(() => {
    refetch()
  }, [])
```

Add a handler for a successful charge, alongside the existing `handleGenerate`/`handleRecorded`:
```tsx
  function handleChargeAdded() {
    setChargingInvoice(null)
    refetch()
  }

  function handleFeeHeadSaved() {
    setAddingFeeHead(false)
    refetch()
  }
```

In the JSX, add an owner-only "Add Fee Head" toggle button next to the existing "Generate This Month's Invoices" button, render `FeeHeadForm` when toggled, pass `onAddCharge` to `DuesTable`, and render `AddChargeForm` when an invoice is selected for charging:
```tsx
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl text-on-surface">Fees</h2>
        <div className="flex gap-4">
          {canManage && (
            <button
              onClick={() => setAddingFeeHead(true)}
              className="text-primary font-medium hover:underline"
            >
              Add Fee Head
            </button>
          )}
          <button
            onClick={handleGenerate}
            className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
          >
            Generate This Month's Invoices
          </button>
        </div>
      </div>

      {addingFeeHead && <FeeHeadForm onSaved={handleFeeHeadSaved} />}

      {/* ... existing lastPaidInvoiceId block, unchanged ... */}

      <DuesTable invoices={invoices} onSelectInvoice={setSelectedInvoice} onAddCharge={setChargingInvoice} />

      {selectedInvoice && (
        <RecordPaymentForm
          invoiceId={selectedInvoice.id}
          defaultAmount={selectedInvoice.amount}
          onRecorded={handleRecorded}
        />
      )}

      {chargingInvoice && (
        <AddChargeForm invoiceId={chargingInvoice.id} feeHeads={feeHeads} onAdded={handleChargeAdded} />
      )}
```

(The rest of the file - `currentBillingMonth`, `handleGenerate`, `handleRecorded`, the `lastPaidInvoiceId` receipt-link block - is unchanged.)

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.fees.tsx
git commit -m "feat: wire fee head management and invoice charges into /fees"
```

---

### Task 10: Receipt number on the receipt page

**Files:**
- Modify: `src/routes/_authenticated.receipt.$invoiceId.tsx`

**Interfaces:**
- Consumes: `payments.receipt_no` (Task 3, migration).
- Produces: no new exports - final task, display-only change.

- [ ] **Step 1: Update the query and type**

In `src/routes/_authenticated.receipt.$invoiceId.tsx`, add `receipt_no` to the `ReceiptData` type and the `payments` select:
```tsx
type ReceiptData = {
  receiptNo: number
  studentName: string
  billingMonth: string
  amount: number
  method: string
  reference: string | null
  paidAt: string
}
```
```tsx
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('receipt_no, method, reference, paid_at')
    .eq('invoice_id', invoiceId)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (paymentError) throw paymentError
  if (!payment) return null

  const row = invoice as any
  return {
    receiptNo: payment.receipt_no,
    studentName: row.students?.profiles?.full_name ?? '',
    billingMonth: row.billing_month,
    amount: row.amount,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paid_at,
  }
```

- [ ] **Step 2: Display it**

In the JSX, add the receipt number as the first line, above "Student":
```tsx
      <div className="space-y-2 text-on-surface">
        <p><span className="text-on-surface-variant">Receipt No:</span> {receipt.receiptNo}</p>
        <p><span className="text-on-surface-variant">Student:</span> {receipt.studentName}</p>
```

- [ ] **Step 3: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass (this route has no dedicated test, per this project's established convention that thin route-wiring files are tested via their composed components/lib functions).
Run: `npm run build` - expect success.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated.receipt.\$invoiceId.tsx
git commit -m "feat: display the sequential receipt number on the receipt page"
```

---

## Self-Review Notes

- **Spec coverage:** `fee_heads` + itemized charges (Tasks 1, 5-9); check-in proration (Task 2); numbered receipts (Tasks 3, 10) - reusing the print-clean CSS that already exists in `AdminShell`/`Sidebar`/`TopBar` rather than rebuilding it; trigger-written `audit_log` with no bypassable write path (Task 4). All plan items covered. Deliberately-excluded items (multi-cycle billing, automated late fees, `fee_structures`, checkout-side proration, discounts/waivers/refunds, an in-app audit log viewer, a PDF library) are listed in the design spec's section 6 and should be repeated to the owner in the final handoff message, per their explicit request to "report what you built vs. what you deliberately left out."
- **Placeholder scan:** no TBD/TODO; every step has full code or exact SQL.
- **Type consistency:** `FeeHead` (Task 5) is used identically by `AddChargeForm` (Task 7) and the route (Task 9) - no redefinition. `addInvoiceItem`'s RPC name (`add_invoice_item`) and parameter names match Task 1's migration exactly. `DuesTable`'s new `onAddCharge` prop (Task 8) is optional, so Task 8's own diff cannot break any pre-existing caller - verified by Task 8's own test asserting the button is absent when the prop is omitted.
- **Known bug classes from this project's history, guarded against proactively:**
  - *`invoices.amount` drifting from what it actually represents*: `add_invoice_item` (Task 1) updates the total in the same transaction as the item row insert, under a row lock - no code path can add an item without the total reflecting it.
  - *A migration silently breaking billing by relocating a column another RPC reads*: not applicable here - no column is dropped or moved in this plan, only added (`receipt_no`) or newly created (`fee_heads`, `invoice_items`, `audit_log`); `generate_monthly_invoices`'s signature is unchanged, so `create or replace` (Task 2) carries none of the arity risk the room-management plan's `approve_booking` case had.
  - *A raw DB error leaking to the user*: `add_invoice_item`'s unpaid-only guard raises a specific, readable exception (`'Invoice % is not unpaid'`), not a raw constraint violation.
  - *A component built but never mounted*: `FeeHeadForm` and `AddChargeForm` are both wired into the route in the same task group (Task 9) as their creation, none left dangling.
  - *An audit trail that can be bypassed from application code*: `audit_log`'s RLS has no write policy for any role - re-confirmed explicitly in Task 4's Global Constraints and self-review, matching spec section 10.2's literal wording.
