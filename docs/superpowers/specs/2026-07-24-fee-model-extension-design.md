# Fee Model Extension (Spec §6.5, scoped) - Design Spec

Date: 2026-07-24
Status: Approved

## 1. Overview

Extends the fee model per spec section 6.5, deliberately scoped down from
the full spec per the owner's explicit instruction - no billing-cycle
choice (monthly/quarterly/annual), no `fee_structures` bundles, no
automated late fees. Four pieces, each independently useful:

1. `fee_heads` - a small, flat table so a payment/invoice can be itemized
   beyond a single rent number (e.g. an occasional mess charge), not the
   full spec's fee-structure-bundle system.
2. Proration on check-in only - a student who joins mid-month gets a
   prorated first invoice via `generate_monthly_invoices`. Checkout-side
   proration is explicitly deferred: no checkout/vacate workflow exists
   yet in this codebase (confirmed absent in the prior gap-report pass),
   so there is nothing to prorate an exit invoice against.
3. Numbered receipts via a Postgres identity column on `payments`,
   surfaced on the existing receipt page with print-clean CSS. No PDF
   library added - "downloadable" is the browser's native
   print-to-PDF, since no PDF-generation dependency exists in this
   project today and adding one is a bigger call than this scope needs.
4. `audit_log` - a table plus a `security definer` trigger function
   (never application code) firing on payment inserts, student
   allotment (check-in + bed reassignment), and role changes on
   `profiles`. No dedicated in-app viewer UI is built - the owner can
   browse `audit_log` via the Supabase Dashboard's table editor for now;
   an in-app viewer is a separate, explicitly deferred piece.

## 2. `fee_heads`

```sql
create table public.fee_heads (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.fee_heads (name, is_recurring) values ('Rent', true);
```

RLS mirrors `room_types`' exact pattern (owner-only write, read-all-
authenticated) - this is config data, same class as room pricing.

### 2.1 Itemizing an invoice

`invoices.amount` stays as the single source of truth for "what's owed"
(every existing consumer - `dues.ts`, `fees.tsx`, the guardian payment
RPC, the receipt page - reads it as one number, and none of that changes).
A new `invoice_items` table records what makes up that total, and a new
RPC keeps the two in sync atomically:

```sql
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fee_head_id uuid not null references public.fee_heads(id),
  description text,
  amount numeric not null,
  created_at timestamptz not null default now()
);

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
```

Not `security definer` - owner/warden already have direct RLS write
access to `invoices` (`invoices_owner_warden_full_access`), this
function exists to keep the item row and the running total atomic, not
to grant new privilege. The `for update` lock and unpaid-only guard
mirror `record_guardian_payment`'s established discipline - the amount
change must not race a concurrent payment.

### 2.2 UI

- `lib/fees.ts` gains `fetchFeeHeads()`, `createFeeHead(name, isRecurring)`,
  `addInvoiceItem(invoiceId, feeHeadId, amount, description?)`.
- New `AddChargeForm` component on the existing Fees page: pick a fee
  head, enter an amount, optional description, submit against a
  specific unpaid invoice - refetches on success so the invoice's total
  updates immediately.
- New minimal `FeeHeadForm` (owner-only, matching `RoomTypeForm`'s
  create-only shape - no edit needed for a flat name+flag) so the owner
  can add "Mess Charge", "Laundry", etc. beyond the seeded "Rent".

## 3. Proration on check-in

`generate_monthly_invoices` currently charges every checked-in student
the same full `room_types.base_rent` regardless of when they joined. Fix:
for a student whose `check_in_date` falls inside the target billing
month, prorate by remaining days in that month.

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

`extract(day from (p_billing_month + interval '1 month' - interval '1
day'))` is the number of days in the target month (handles 28/29/30/31
correctly without a lookup table). The proration fraction is `(days in
month - join day + 1) / days in month` - a student joining on day 1 gets
the full fraction (whole month), joining on the last day gets `1/days`.
`round()` to the nearest rupee, matching every other money field in this
schema (no fractional-paisa handling anywhere else in the codebase, not
introducing it here).

## 4. Numbered receipts

```sql
alter table public.payments add column receipt_no bigint generated always as identity;
```

A Postgres identity column, not a manually-computed `max(receipt_no) +
1` - atomic under concurrent payment recording (no race between two
staff members recording payments at the same moment), and backfills
every existing payment row with a number in insertion order automatically
when the column is added, so nothing needs a separate backfill step.

### 4.1 UI

- `_authenticated.receipt.$invoiceId.tsx`'s query gains `payments.receipt_no`
  in its select and its `ReceiptData` type.
- The receipt page displays the receipt number prominently, gains
  `@media print` CSS hiding the app shell/nav (print-clean, receipt
  content only) and a "Print / Save as PDF" button calling
  `window.print()` - the browser's native print dialog offers
  "Save as PDF" as a destination on every major OS, which is the
  "downloadable" requirement without a new dependency.

## 5. `audit_log`

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

create policy "audit_log_owner_read" on public.audit_log
  for select
  using (public.current_role() = 'owner');
```

No insert/update/delete policy for anyone, on any role - RLS defaults to
deny for any operation without a matching policy, so the only way a row
ever enters this table is through the trigger function below, which runs
`security definer` and therefore bypasses RLS entirely for its own
insert. This is the literal mechanism spec section 10.2 asks for:
"written by a database trigger so it cannot be bypassed from application
code" - no grant exists that would let even an owner's own client-side
code insert a row directly; only the trigger can.

```sql
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

create trigger audit_students
  after insert or update of bed_id on public.students
  for each row execute function public.write_audit_log();

create trigger audit_profiles_role
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.write_audit_log();
```

- `payments` insert = every payment recorded (cash/gateway-label,
  guardian or staff-recorded - both paths already funnel through the
  same `payments` table, so one trigger covers both).
- `students` insert = new allotment (check-in); `update of bed_id` =
  reallotment (a transfer's bed change). `update of bed_id` (not a bare
  `after update`) so routine, non-allotment student edits don't spam
  the log.
- `profiles` `update of role` combined with the `when (old.role is
  distinct from new.role)` guard - fires only on an actual role change,
  not just because the `role` column happened to be included in an
  unrelated `update ... set role = role, ...`-shaped statement (belt and
  suspenders; `update of role` alone would already only fire when that
  column is targeted, but the `when` clause is the precise trigger-level
  guarantee spec section 10.2 implies with "role changes").

`to_jsonb(OLD)`/`to_jsonb(NEW)` (not `row_to_json(...)::jsonb`) is the
direct, idiomatic Postgres cast from a row type to `jsonb` - functionally
identical, simpler.

## 6. Deliberately not built (report to the owner at handoff)

- Multi-cycle billing (quarterly/annual) - explicitly excluded.
- Automated late fees - explicitly excluded.
- `fee_structures` bundles, per-room-type fee packages - not built;
  `fee_heads` today is a flat list an operator manually attaches to an
  invoice, not an automatic per-type bundle.
- Checkout-side proration - no checkout/vacate flow exists yet to
  prorate against; deferred until one is built.
- Discounts, waivers, refunds, partial/advance payments - untouched,
  same as before this spec.
- Audit log in-app viewer - table + trigger only; the owner reads it via
  the Supabase Dashboard for now. A dedicated screen is a separate,
  explicitly deferred future request.
- PDF generation library - print-to-PDF via the browser instead.

## 7. Self-Review

- **Placeholder scan:** none - every SQL block is complete and runnable.
- **Data-safety check:** no `drop table`/`drop column` anywhere in this
  spec - every change is additive (`create table`, `alter table add
  column`, `create or replace function` on unchanged signatures only:
  `generate_monthly_invoices(date)` keeps its exact signature, so
  `create or replace` is safe here, unlike the room_types migration's
  `approve_booking` case).
- **Consistency check:** `add_invoice_item` and the proration change to
  `generate_monthly_invoices` both keep `invoices.amount` as the single
  total every existing consumer already reads - no downstream file
  (`dues.ts`, `fees.tsx`, `record_guardian_payment`, the receipt page)
  needs to change its assumption about what `amount` means.
- **Scope check:** `audit_log`'s RLS has no write policy for any role,
  confirmed as the actual enforcement mechanism (not just the trigger's
  `security definer` alone) - even an owner's own authenticated client
  cannot `insert into audit_log` directly, only the trigger can, which
  is the literal "cannot be bypassed from application code" requirement.
