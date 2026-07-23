# Guardian Payment + In-App Student Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guardian pay their linked child's own unpaid invoice, and let owner/warden create a student's login account in-app instead of requiring a manual Supabase Dashboard step first.

**Architecture:** Guardian payment is one new `security definer` RPC (mirroring `confirm_transfer`'s self-auth-check pattern) plus a small UI extension to the existing guardian fee list. Student enrollment is this project's first Supabase Edge Function - `service_role` lives only inside it, never touching client code, used exclusively to call `auth.admin.createUser()` after the function does its own owner/warden authorization check (Edge Functions run outside RLS, same discipline as every `security definer` function in this project).

**Tech Stack:** Same as every prior stage - React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`, plus Deno (Supabase Edge Functions' runtime) for the one new function.

## Global Constraints

- **Guardian payment amount is never trusted from the client.** `record_guardian_payment()` reads the amount from the invoice row itself inside the function body - a guardian can only ever pay exactly what's owed, never an arbitrary client-supplied number.
- **The invoice is locked with `for update` before the status check** in `record_guardian_payment()` - same TOCTOU discipline as every bed-status write in this project, closing a double-submit race (double-click, two tabs) that would otherwise insert two payment rows for one invoice.
- **The `is distinct from` null-safe check is mandatory** for the guardian-owns-this-invoice comparison - this is the exact bug shape (`v_student_id <> auth.uid()`-style comparisons silently passing on `NULL`) that produced this project's worst bug in Stage 4. `my_linked_student_id()` returns `null` for a non-guardian or unlinked guardian; `null is distinct from <uuid>` is `true`, so the check correctly denies rather than silently passing.
- **The Edge Function does its own authorization check before doing anything else.** It must query the caller's own role (via a client built with the anon key + the caller's forwarded `Authorization` header, so the query runs under normal RLS as the caller) and reject with 403 before ever touching the `service_role` client.
- **`service_role` is instantiated inside the Edge Function only**, using `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (a secret Supabase injects into every Edge Function automatically - no manual secret configuration needed). It is never written to `.env.local`, never imported into any client-side file, never returned in any response.
- **The synthesized login email is derived from the phone number already being collected** (`${phone}@aabha-hostel.internal`) - this is not a new personal-data field, just a technical login handle. No email is ever asked for in the enrollment form.
- **`email_confirm: true` is required** on `auth.admin.createUser()` - there's no real inbox behind the synthetic address, so skipping Supabase's confirmation-email flow is correct, not a shortcut.
- **The existing `handle_new_user()` trigger and `check_in_student()` RPC are unchanged** - enrollment only adds a new way to get a `profiles` row created; the trigger still hardcodes `role = 'student'`, and the actual bed assignment/check-in still goes through the same RPC as before.
- Migrations are applied manually in the Supabase SQL Editor by the user (project `qektemgxthrxgnhfmgqg`) - no agent has DB credentials. The Edge Function is deployed manually by the user via the Supabase CLI - no agent has CLI credentials either. Both get an explicit handoff at the end.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0022_record_guardian_payment_rpc.sql   # NEW
    functions/
      enroll-student/
        index.ts                              # NEW - Deno Edge Function
  src/
    lib/
      guardian.ts                              # MODIFIED: payGuardianInvoice
      guardian.test.ts                         # MODIFIED
      students.ts                              # MODIFIED: enrollStudent
      students.test.ts                         # MODIFIED
    components/
      guardian/
        GuardianPaymentForm.tsx                 # NEW
        GuardianPaymentForm.test.tsx            # NEW
        FeeStatus.tsx                           # MODIFIED: onPay prop
        FeeStatus.test.tsx                      # MODIFIED
      students/
        EnrollStudentForm.tsx                   # NEW
        EnrollStudentForm.test.tsx              # NEW
    routes/
      _authenticated.my-child.tsx               # MODIFIED: payment wiring
      _authenticated.residents.tsx              # MODIFIED: enrollment wiring
```

---

### Task 1: Migration 0022 - `record_guardian_payment` RPC

**Files:**
- Create: `supabase/migrations/0022_record_guardian_payment_rpc.sql`

**Interfaces:**
- Consumes: `public.my_linked_student_id()` (Stage 5), `public.invoices`/`public.payments` (Stage 3).
- Produces: `public.record_guardian_payment(p_invoice_id uuid, p_method payment_method, p_reference text default null) returns void`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0022_record_guardian_payment_rpc.sql`:
```sql
-- Guardians pay their own linked child's invoice. security definer
-- because the guardian caller has no direct RLS write access to
-- invoices/payments (by design - guardians get zero table-level write
-- grants anywhere in this project, everything mediated through a
-- narrow function, same as every other guardian capability).
create function public.record_guardian_payment(p_invoice_id uuid, p_method payment_method, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_amount numeric;
  v_status invoice_status;
begin
  select student_id, amount, status into v_student_id, v_amount, v_status
  from public.invoices where id = p_invoice_id for update;

  if v_student_id is distinct from public.my_linked_student_id() then
    raise exception 'Only the linked guardian can pay this invoice';
  end if;

  if v_status <> 'unpaid' then
    raise exception 'Invoice % is not unpaid', p_invoice_id;
  end if;

  insert into public.payments (invoice_id, amount, method, reference, recorded_by)
  values (p_invoice_id, v_amount, p_method, p_reference, auth.uid());

  update public.invoices set status = 'paid' where id = p_invoice_id;
end;
$$;

revoke execute on function public.record_guardian_payment(uuid, payment_method, text) from public;
grant execute on function public.record_guardian_payment(uuid, payment_method, text) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select proname, prosecdef from pg_proc where proname = 'record_guardian_payment';
-- expect prosecdef = true

select routine_name from information_schema.routines where routine_name = 'record_guardian_payment';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0022_record_guardian_payment_rpc.sql
git commit -m "feat: add record_guardian_payment RPC"
```

---

### Task 2: `lib/guardian.ts` - `payGuardianInvoice`

**Files:**
- Modify: `src/lib/guardian.ts`, `src/lib/guardian.test.ts`

**Interfaces:**
- Consumes: `supabase` (existing), `PaymentMethod` (Stage 3 `lib/fees.ts`).
- Produces: `export async function payGuardianInvoice(invoiceId: string, method: PaymentMethod, reference?: string): Promise<void>` - consumed by `GuardianPaymentForm` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/guardian.test.ts` (extend the existing `vi.mock('./supabase', ...)` to include an `rpc` mock, and add a new describe block):
```typescript
// Add `rpc: rpcMock` to the mocked supabase object, and declare above the mock:
const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

// New describe block:
describe('payGuardianInvoice', () => {
  it('calls the record_guardian_payment RPC with the given invoice, method, and reference', async () => {
    const { payGuardianInvoice } = await import('./guardian')
    await payGuardianInvoice('inv-1', 'esewa', 'TXN123')
    expect(rpcMock).toHaveBeenCalledWith('record_guardian_payment', {
      p_invoice_id: 'inv-1',
      p_method: 'esewa',
      p_reference: 'TXN123',
    })
  })

  it('sends null reference when omitted', async () => {
    const { payGuardianInvoice } = await import('./guardian')
    await payGuardianInvoice('inv-1', 'cash')
    expect(rpcMock).toHaveBeenCalledWith('record_guardian_payment', {
      p_invoice_id: 'inv-1',
      p_method: 'cash',
      p_reference: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: FAIL - `payGuardianInvoice` not exported, and `rpc` not yet part of the mock.

- [ ] **Step 3: Write the implementation**

In `src/lib/guardian.ts`, add the import and function:
```typescript
import type { PaymentMethod } from './fees'
```
(add alongside the existing `import type { InvoiceStatus } from './fees'` line)
```typescript
export async function payGuardianInvoice(invoiceId: string, method: PaymentMethod, reference?: string): Promise<void> {
  const { error } = await supabase.rpc('record_guardian_payment', {
    p_invoice_id: invoiceId,
    p_method: method,
    p_reference: reference ?? null,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian.test.ts
git commit -m "feat: add payGuardianInvoice to the guardian data access module"
```

---

### Task 3: `GuardianPaymentForm` + `FeeStatus` `onPay`

**Files:**
- Create: `src/components/guardian/GuardianPaymentForm.tsx`, `src/components/guardian/GuardianPaymentForm.test.tsx`
- Modify: `src/components/guardian/FeeStatus.tsx`, `src/components/guardian/FeeStatus.test.tsx`

**Interfaces:**
- Consumes: `payGuardianInvoice` (Task 2), `PaymentMethod` (Stage 3 `lib/fees.ts`).
- Produces: `export function GuardianPaymentForm({ invoiceId, onPaid }: { invoiceId: string; onPaid: () => void })`; `FeeStatus` gains an optional `onPay?: (invoice: Invoice) => void` prop - both consumed by `/my-child` (Task 4).

- [ ] **Step 1: Write the failing tests**

`src/components/guardian/GuardianPaymentForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GuardianPaymentForm } from './GuardianPaymentForm'

const payGuardianInvoice = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/guardian', () => ({
  payGuardianInvoice: (...args: unknown[]) => payGuardianInvoice(...args),
}))

describe('GuardianPaymentForm', () => {
  it('calls payGuardianInvoice with the entered method and reference', async () => {
    const onPaid = vi.fn()
    render(<GuardianPaymentForm invoiceId="inv-1" onPaid={onPaid} />)

    fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'khalti' } })
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'TXN456' } })
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))

    await waitFor(() => expect(payGuardianInvoice).toHaveBeenCalledWith('inv-1', 'khalti', 'TXN456'))
    expect(onPaid).toHaveBeenCalled()
  })

  it('shows an error and does not call onPaid when payGuardianInvoice rejects', async () => {
    payGuardianInvoice.mockRejectedValueOnce(new Error('Payment failed'))
    const onPaid = vi.fn()
    render(<GuardianPaymentForm invoiceId="inv-1" onPaid={onPaid} />)

    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))

    await waitFor(() => expect(screen.getByText('Payment failed')).toBeInTheDocument())
    expect(onPaid).not.toHaveBeenCalled()
  })
})
```

Replace `src/components/guardian/FeeStatus.test.tsx` (adds an `onPay` case to the existing file):
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeeStatus } from './FeeStatus'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2026-06-10', status: 'paid' },
  { id: 'inv-2', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2099-01-01', status: 'unpaid' },
  { id: 'inv-3', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-05-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
]

describe('FeeStatus', () => {
  it('renders each invoice with its billing month, amount, and status - and no payment action when onPay is omitted', () => {
    render(<FeeStatus invoices={invoices} />)
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText(/record payment/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument()
  })

  it('renders Unpaid badge for invoices with future due dates', () => {
    render(<FeeStatus invoices={invoices} />)
    const unpaidBadges = screen.getAllByText('Unpaid')
    expect(unpaidBadges.length).toBeGreaterThan(0)
    expect(unpaidBadges[0]).toBeInTheDocument()
  })

  it('renders Overdue badge for invoices with past due dates', () => {
    render(<FeeStatus invoices={invoices} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('shows a Pay Now button only on unpaid rows when onPay is provided, and calls it with that invoice', () => {
    const onPay = vi.fn()
    render(<FeeStatus invoices={invoices} onPay={onPay} />)
    const payButtons = screen.getAllByRole('button', { name: /pay now/i })
    expect(payButtons).toHaveLength(2)

    fireEvent.click(payButtons[0])
    expect(onPay).toHaveBeenCalledWith(invoices[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/guardian/GuardianPaymentForm.test.tsx src/components/guardian/FeeStatus.test.tsx`
Expected: FAIL - `GuardianPaymentForm` doesn't exist; `FeeStatus` has no `onPay` prop yet.

- [ ] **Step 3: Write the implementations**

`src/components/guardian/GuardianPaymentForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { payGuardianInvoice } from '../../lib/guardian'
import type { PaymentMethod } from '../../lib/fees'

export function GuardianPaymentForm({ invoiceId, onPaid }: { invoiceId: string; onPaid: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await payGuardianInvoice(invoiceId, method, reference || undefined)
      onPaid()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="guardianPaymentMethod" className="block text-sm font-medium text-on-surface-variant">Method</label>
        <select
          id="guardianPaymentMethod"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          <option value="cash">Cash</option>
          <option value="esewa">eSewa</option>
          <option value="khalti">Khalti</option>
          <option value="fonepay">FonePay</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="guardianPaymentReference" className="block text-sm font-medium text-on-surface-variant">Reference (optional)</label>
        <input
          id="guardianPaymentReference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Pay Now
      </button>
    </form>
  )
}
```

In `src/components/guardian/FeeStatus.tsx`, add the `onPay` prop and a conditional button in the status cell:
```tsx
import type { Invoice } from '../../lib/fees'
import { isOverdue } from '../../lib/dues'

export function FeeStatus({ invoices, onPay }: { invoices: Invoice[]; onPay?: (invoice: Invoice) => void }) {
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
            {onPay && <th className="px-8 py-4">Action</th>}
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
              {onPay && (
                <td className="px-8 py-5">
                  {invoice.status === 'unpaid' && (
                    <button onClick={() => onPay(invoice)} className="text-primary font-medium hover:underline">
                      Pay Now
                    </button>
                  )}
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

Run: `npx vitest run src/components/guardian/GuardianPaymentForm.test.tsx src/components/guardian/FeeStatus.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/guardian/GuardianPaymentForm.tsx src/components/guardian/GuardianPaymentForm.test.tsx src/components/guardian/FeeStatus.tsx src/components/guardian/FeeStatus.test.tsx
git commit -m "feat: add GuardianPaymentForm and wire an onPay action into FeeStatus"
```

---

### Task 4: Wire payment into `/my-child`

**Files:**
- Modify: `src/routes/_authenticated.my-child.tsx`

**Interfaces:**
- Consumes: `GuardianPaymentForm` (Task 3), `FeeStatus`'s new `onPay` prop (Task 3).
- Produces: no new exports - route wiring only.

- [ ] **Step 1: Replace `src/routes/_authenticated.my-child.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyChildProfile, fetchChildInvoices, fetchMyChildUpdate, type GuardianUpdate } from '../lib/guardian'
import { fetchNotices, type Notice } from '../lib/notices'
import type { Invoice } from '../lib/fees'
import { FeeStatus } from '../components/guardian/FeeStatus'
import { GuardianPaymentForm } from '../components/guardian/GuardianPaymentForm'
import { MonthlyUpdate } from '../components/guardian/MonthlyUpdate'
import { NoticesList } from '../components/notices/NoticesList'

function MyChildPage() {
  const [childName, setChildName] = useState('')
  const [childId, setChildId] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [update, setUpdate] = useState<GuardianUpdate | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  function refetchInvoices(id: string, name: string) {
    fetchChildInvoices().then((rows) =>
      setInvoices(rows.map((row) => ({ ...row, student_id: id, student_name: name }))),
    )
  }

  useEffect(() => {
    fetchMyChildProfile().then((child) => {
      if (!child) return
      setChildName(child.full_name)
      setChildId(child.id)
      refetchInvoices(child.id, child.full_name)
    })
    fetchMyChildUpdate().then(setUpdate)
    fetchNotices().then(setNotices)
  }, [])

  function handlePaid() {
    setSelectedInvoiceId(null)
    refetchInvoices(childId, childName)
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">{childName || 'My Child'}</h2>
      <FeeStatus invoices={invoices} onPay={(invoice) => setSelectedInvoiceId(invoice.id)} />
      {selectedInvoiceId && <GuardianPaymentForm invoiceId={selectedInvoiceId} onPaid={handlePaid} />}
      <MonthlyUpdate update={update} />
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-child')({
  component: MyChildPage,
})
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.my-child.tsx
git commit -m "feat: wire guardian fee payment into the /my-child page"
```

---

### Task 5: Edge Function `enroll-student`

**Files:**
- Create: `supabase/functions/enroll-student/index.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all auto-injected Edge Function secrets), `public.profiles` (for the caller's own role check, under RLS).
- Produces: an HTTP endpoint invoked via `supabase.functions.invoke('enroll-student', { body: { fullName, phone } })` (Task 6), returning `{ profileId: string; password: string }` on success.

This is Deno code with no automated test in this project's Vitest setup (no Deno runner configured) - correctness is verified by direct invocation after deployment (Step 3 below), matching how this project has always verified SQL migrations by manual application rather than a test framework.

- [ ] **Step 1: Write the function**

`supabase/functions/enroll-student/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  // Step 1: authorize the caller AS the caller, under normal RLS - this
  // client only ever sees what the calling user themselves can see.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await callerClient.auth.getUser()

  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401)
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !callerProfile || !['owner', 'warden'].includes(callerProfile.role)) {
    return jsonResponse({ error: 'Only owner or warden can enroll a student' }, 403)
  }

  // Step 2: parse and validate input.
  let body: { fullName?: string; phone?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const fullName = body.fullName?.trim()
  const phone = body.phone?.trim()
  if (!fullName || !phone) {
    return jsonResponse({ error: 'fullName and phone are required' }, 400)
  }

  // Step 3: create the account. service_role client, used only here,
  // only for this one call.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const email = `${phone}@aabha-hostel.internal`
  const password = generatePassword()

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  })

  if (createError || !created.user) {
    const isDuplicate = createError?.message?.toLowerCase().includes('already been registered')
    return jsonResponse({ error: isDuplicate ? 'A student with this phone number is already enrolled' : createError?.message ?? 'Could not create account' }, isDuplicate ? 409 : 400)
  }

  return jsonResponse({ profileId: created.user.id, password }, 200)
})
```

- [ ] **Step 2: Self-review the function against the plan's Global Constraints**

Confirm: the `service_role` client is built only inside this file, only used for the one `auth.admin.createUser()` call; the authorization check runs before that call, using a separate client scoped to the caller's own session; `email_confirm: true` is present; no email field is read from the request body (only `fullName`/`phone`); the generated `password` is returned in the response but never logged or stored anywhere else.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/enroll-student/index.ts
git commit -m "feat: add enroll-student Edge Function"
```

(Deployment and live verification happen in the final handoff, once the whole plan is done - see Self-Review Notes.)

---

### Task 6: `lib/students.ts` - `enrollStudent`

**Files:**
- Modify: `src/lib/students.ts`, `src/lib/students.test.ts`

**Interfaces:**
- Consumes: `supabase.functions.invoke` (supabase-js, existing dependency).
- Produces: `export async function enrollStudent(fullName: string, phone: string): Promise<{ profileId: string; password: string }>` - consumed by `EnrollStudentForm` (Task 7).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/students.test.ts` (extend the mocked `supabase` object with a `functions.invoke` mock, and add a new describe block):
```typescript
// Add to the top-level mocked supabase object (alongside `from`, `rpc`):
const invokeMock = vi.fn(() => Promise.resolve({ data: { profileId: 'new-profile-1', password: 'Ab3xY9kLmP2q' }, error: null }))
// ... and in the vi.mock('./supabase', ...) factory's returned `supabase` object, add:
//   functions: { invoke: invokeMock },

describe('enrollStudent', () => {
  it('invokes the enroll-student function and returns the profile id and password', async () => {
    const { enrollStudent } = await import('./students')
    const result = await enrollStudent('Priya Sharma', '9800000005')
    expect(invokeMock).toHaveBeenCalledWith('enroll-student', {
      body: { fullName: 'Priya Sharma', phone: '9800000005' },
    })
    expect(result).toEqual({ profileId: 'new-profile-1', password: 'Ab3xY9kLmP2q' })
  })

  it('throws when the function returns an error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('Only owner or warden can enroll a student') })
    const { enrollStudent } = await import('./students')
    await expect(enrollStudent('Priya Sharma', '9800000005')).rejects.toThrow('Only owner or warden can enroll a student')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/students.test.ts`
Expected: FAIL - `enrollStudent` not exported, `functions.invoke` not part of the mock.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/students.ts`:
```typescript
export async function enrollStudent(fullName: string, phone: string): Promise<{ profileId: string; password: string }> {
  const { data, error } = await supabase.functions.invoke('enroll-student', {
    body: { fullName, phone },
  })
  if (error) throw error
  return data as { profileId: string; password: string }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/students.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/students.ts src/lib/students.test.ts
git commit -m "feat: add enrollStudent to the students data access module"
```

---

### Task 7: `EnrollStudentForm` component

**Files:**
- Create: `src/components/students/EnrollStudentForm.tsx`, `src/components/students/EnrollStudentForm.test.tsx`

**Interfaces:**
- Consumes: `enrollStudent` (Task 6).
- Produces: `export function EnrollStudentForm({ onEnrolled }: { onEnrolled: (profileId: string) => void })` - consumed by the Residents route (Task 8). Shows the generated password once, in place, after a successful enrollment - it does not auto-dismiss, since the warden needs time to write it down.

- [ ] **Step 1: Write the failing test**

`src/components/students/EnrollStudentForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnrollStudentForm } from './EnrollStudentForm'

const enrollStudent = vi.fn()

vi.mock('../../lib/students', () => ({
  enrollStudent: (...args: unknown[]) => enrollStudent(...args),
}))

describe('EnrollStudentForm', () => {
  it('calls enrollStudent with the entered name and phone, shows the returned password, and calls onEnrolled', async () => {
    enrollStudent.mockResolvedValueOnce({ profileId: 'new-profile-1', password: 'Ab3xY9kLmP2q' })
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Sharma' } })
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9800000005' } })
    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(enrollStudent).toHaveBeenCalledWith('Priya Sharma', '9800000005'))
    expect(screen.getByText('Ab3xY9kLmP2q')).toBeInTheDocument()
    expect(onEnrolled).toHaveBeenCalledWith('new-profile-1')
  })

  it('shows an error and does not call onEnrolled when enrollStudent rejects', async () => {
    enrollStudent.mockRejectedValueOnce(new Error('A student with this phone number is already enrolled'))
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(screen.getByText('A student with this phone number is already enrolled')).toBeInTheDocument())
    expect(onEnrolled).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/students/EnrollStudentForm.test.tsx`
Expected: FAIL - `Cannot find module './EnrollStudentForm'`

- [ ] **Step 3: Write the implementation**

`src/components/students/EnrollStudentForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { enrollStudent } from '../../lib/students'

export function EnrollStudentForm({ onEnrolled }: { onEnrolled: (profileId: string) => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const result = await enrollStudent(fullName, phone)
      setGeneratedPassword(result.password)
      onEnrolled(result.profileId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll student')
    }
  }

  if (generatedPassword) {
    return (
      <div className="bg-secondary-container rounded-xxl p-6 space-y-2">
        <p className="font-medium text-secondary">Account created for {fullName}</p>
        <p className="text-sm text-on-surface-variant">Write this down and give it to the student now - it will not be shown again.</p>
        <p className="font-display text-lg text-on-surface">{generatedPassword}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="enrollFullName" className="block text-sm font-medium text-on-surface-variant">Full Name</label>
        <input id="enrollFullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="enrollPhone" className="block text-sm font-medium text-on-surface-variant">Phone</label>
        <input id="enrollPhone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Enroll Student
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/students/EnrollStudentForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/EnrollStudentForm.tsx src/components/students/EnrollStudentForm.test.tsx
git commit -m "feat: add EnrollStudentForm component"
```

---

### Task 8: Wire enrollment into Residents

**Files:**
- Modify: `src/routes/_authenticated.residents.tsx`

**Interfaces:**
- Consumes: `EnrollStudentForm` (Task 7).
- Produces: no new exports - route wiring only. This is the final task.

- [ ] **Step 1: Update `src/routes/_authenticated.residents.tsx`**

Add the import:
```tsx
import { EnrollStudentForm } from '../components/students/EnrollStudentForm'
```

Add a handler inside `ResidentsPage`, alongside the existing ones:
```tsx
function handleEnrolled(profileId: string) {
  refetchAll()
  setSelectedProfileId(profileId)
}
```

In the JSX, inside the existing "Check In a Student" card, add the enrollment form BEFORE the existing unassigned-profile `<select>` block (so a warden can either enroll someone new or pick an existing pending account, then continue into the same `CheckInForm`):
```tsx
<div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
  <h3 className="font-display text-lg text-on-surface">Check In a Student</h3>

  <div className="space-y-2">
    <p className="text-sm font-medium text-on-surface-variant">New student - create their account</p>
    <EnrollStudentForm onEnrolled={handleEnrolled} />
  </div>

  <div className="pt-2 border-t border-outline-variant space-y-2">
    <p className="text-sm font-medium text-on-surface-variant">Or pick an existing pending account</p>
    {unassignedProfiles.length === 0 ? (
      <p className="text-on-surface-variant text-sm">No pending student accounts.</p>
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
  </div>

  {selectedProfileId && vacantBeds.length > 0 && (
    <CheckInForm vacantBeds={vacantBeds} profileId={selectedProfileId} onCheckedIn={handleCheckedIn} reservedNames={reservedNames} />
  )}
</div>
```

(This replaces the existing "Check In a Student" card's contents - the `EnrollStudentForm` and the existing unassigned-profile picker both feed the same `selectedProfileId` state and the same `CheckInForm` below them, unchanged.)

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated.residents.tsx
git commit -m "feat: wire in-app student enrollment into the Residents check-in flow"
```

---

## Self-Review Notes

- **Spec coverage:** guardian payment's own-invoice check, amount-never-trusted-from-client, and `for update` lock (Task 1); the payment UI end to end (Tasks 2-4); the Edge Function's authorization-before-service-role ordering, synthetic email, `email_confirm: true`, and no-email-collected-from-form (Task 5); the enrollment UI end to end (Tasks 6-8), including the existing dropdown staying available alongside the new form rather than being replaced (Task 8). All spec items covered.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact SQL/dashboard/CLI action.
- **Type consistency:** `payGuardianInvoice`'s `PaymentMethod` parameter (Task 2) is the same type from `lib/fees.ts` already used by `RecordPaymentForm` - not redefined. `enrollStudent`'s return shape (`{ profileId, password }`) matches exactly what the Edge Function returns (Task 5) and what `EnrollStudentForm` destructures (Task 7).
- **Known bug classes from this project's history, guarded against proactively:**
  - *NULL-comparison auth bypass* (Stage 4's worst bug): `record_guardian_payment`'s ownership check uses `is distinct from`, not a bare `<>`, called out explicitly in this plan's Global Constraints.
  - *TOCTOU on shared mutable state* (bed double-booking, originally Stage 2): the invoice is locked with `for update` before its status is checked, preventing a double-submitted payment.
  - *Trusting a client-supplied value the server already knows better* (this project's general instinct, e.g. `recorded_by` always sourced server-side): the payment amount is read from the invoice row inside the function, never accepted as a parameter from the guardian.
  - *A new write surface silently getting a broader table-level grant than intended* (this project's guardian-scoping discipline since Stage 5): guardians get no new table-level grant on `payments`/`invoices` at all - the RPC is the only new surface, exactly like every other guardian capability.
  - *A component built but never mounted* (Stage 2's original instance, repeated and caught several times since): `GuardianPaymentForm` is wired into `/my-child` in the same task group (Task 4); `EnrollStudentForm` is wired into Residents in the same task group (Task 8) - neither is left dangling.
