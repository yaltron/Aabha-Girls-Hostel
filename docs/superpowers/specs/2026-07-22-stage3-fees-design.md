# Stage 3 (Fees) - Design Spec

Date: 2026-07-22
Status: Approved

## 1. Overview

Stage 3 is "the core" per the user's 5-stage plan: monthly invoices generated
from room price, payment recording, a dues dashboard, overdue flags, a
printable receipt, and guardian-visible fee status (RLS only - the
guardian-facing UI itself is Stage 5, once guardian-student linkage exists).

## 2. Data model

```sql
create type invoice_status as enum ('unpaid', 'paid');
create type payment_method as enum ('cash', 'esewa', 'khalti');

invoices:
  id uuid pk
  student_id uuid fk -> students(id)
  billing_month date not null      -- always the 1st of the month
  amount numeric not null          -- snapshot of the room's monthly_price
                                    -- at generation time - a later price
                                    -- change must not retroactively alter
                                    -- an already-generated invoice
  due_date date not null
  status invoice_status not null default 'unpaid'
  created_at timestamptz
  unique (student_id, billing_month)   -- one invoice per student per month

payments:
  id uuid pk
  invoice_id uuid fk -> invoices(id)
  amount numeric not null
  method payment_method not null
  reference text                    -- optional eSewa/Khalti transaction ref
  paid_at timestamptz not null default now()
  recorded_by uuid fk -> profiles(id)  -- who recorded it (owner/warden)
```

Overdue is not a stored value - it's computed at query/display time as
`due_date < current_date and status = 'unpaid'`. A stored "overdue" flag
would drift out of sync with the passage of time; deriving it keeps a
single source of truth (`due_date`).

Recording a payment sets `invoices.status = 'paid'` - Stage 3 doesn't need
partial-payment tracking (out of scope, not in the user's spec); a payment
row records what was actually collected for the audit trail, but "unpaid"
vs "paid" is the only invoice-level state.

## 3. Room pricing access change (resolves Stage 2's flagged caveat)

Stage 2 gave warden full read/write on `rooms` (including `monthly_price`)
with a note to revisit once "financial config" was concretely defined.
Per user decision: **room creation and price changes become owner-only.**
Warden keeps full read/write on `beds` (bed assignment is still an
operational, not financial, action) and keeps read-only on `rooms` (needs
to see room type/price to inform check-in, just can't change it).

## 4. Invoice generation

A manual trigger, not a scheduled job - no cron infrastructure exists or is
being added for this. An RPC `generate_monthly_invoices(p_billing_month
date)` (owner/warden only, gated by RLS the same way `check_in_student`
was - `security invoker`, not `definer`) inserts one invoice per
currently-checked-in student (a `students` row with a non-null `bed_id`)
who doesn't already have an invoice for that month, using their room's
current `monthly_price` via the `beds -> rooms` join. The `unique
(student_id, billing_month)` constraint makes this safely re-runnable -
calling it twice for the same month is a no-op for students who already
have one.

## 5. RLS

- `invoices`, `payments`: owner full read/write. Warden: read all, and
  write via the same `record_payment` RPC (not raw table INSERT - see
  below) - no direct UPDATE/DELETE policy for warden, matching the
  `check_in_student` precedent of RPC-mediated writes for non-owner
  operational actions.
- Student: read own invoices/payments only (`student_id = auth.uid()` via
  a join, or `invoices.student_id = auth.uid()` directly since `students.id
  = profiles.id = auth.uid()`).
- Guardian: no access yet (added in Stage 5 once the student-guardian link
  table exists) - RLS is not pre-built speculatively this time, since
  there's no linkage column to gate on yet; Stage 5 adds both the linkage
  and the guardian RLS policy together in the same migration, per the
  project's "RLS from creation" law.

`record_payment(p_invoice_id uuid, p_amount numeric, p_method
payment_method, p_reference text default null)` - an RPC (like
`check_in_student`) that inserts the payment row and flips the invoice to
`paid` in one transaction. `security invoker` so RLS still gates who can
call it successfully (owner/warden only, via a `for all` policy scoped to
those roles on both tables - same pattern as Stage 2).

## 6. UI (reusing established Stitch patterns)

- **Generate invoices**: a button on the Fees page ("Generate This Month's
  Invoices") - owner/warden only.
- **Dues dashboard**: a table of unpaid invoices (reusing the
  `ResidentList`-style table component pattern) - student name, amount,
  due date, overdue flag (computed, shown as a badge when overdue).
- **Record payment**: a small form (method select + optional reference
  text field + amount) opened per-invoice from the dues table.
- **Receipt**: a dedicated printable view (`window.print()` - no new PDF
  library dependency) showing the paid invoice's details in a clean,
  print-friendly layout using the existing design tokens.
- **Dashboard KPI**: "Fees Collected" (already in the Stitch admin mockup)
  - sum of `payments.amount` for the current calendar month.
- **Nav**: a new "Fees" item, visible to owner and warden (matches the
  Stitch admin sidebar's existing "Fees" label).

## 7. Testing plan (given to user at end of implementation)

- Generate invoices for the current month; confirm one invoice per
  checked-in student at their room's price; re-running the generation
  doesn't duplicate.
- Record a cash payment on one invoice; confirm it flips to paid and
  disappears from the dues dashboard.
- Confirm a student-role test user can see only their own invoice/payment
  history.
- Confirm warden can generate invoices and record payments, but cannot
  edit `rooms.monthly_price` or create a new room (owner-only now).
- Confirm an unpaid invoice past its due date shows an overdue badge.
