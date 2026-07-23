# Guardian Payment + In-App Student Enrollment - Design Spec

Date: 2026-07-23
Status: Approved

## 1. Overview

This spec covers two new capabilities that came out of a role-permissions
audit:

1. **Guardian-initiated fee payment** - guardians have been read-only on
   fees since Stage 5; this adds one narrow write path so a guardian can
   pay their linked child's own unpaid invoice.
2. **In-app student enrollment** - today, a student's login account must
   be created manually via the Supabase Dashboard before a warden can
   check them in at all (`fetchUnassignedStudentProfiles()` only lists
   accounts that already exist). This adds a one-step "enroll" flow so
   owner/warden can create that account from inside the app.

The role-permissions audit itself found everything else already correct:
owner has full access everywhere (confirmed against every current RLS
policy), warden is correctly blocked from room-pricing/structural writes
since Stage 3's `0007` migration, warden's check-in/payment-recording/
transfer-approval/ticket-resolution capabilities are already built and
wired, and student's own-dues/tickets/transfers/notices are already
correctly scoped to `auth.uid()`. No RLS changes are needed for
owner/warden/student - only the two new capabilities above.

One separately-noted gap, explicitly **out of scope for this spec**:
`createRoom()` exists in `lib/rooms.ts` but has no UI anywhere, so nobody
- not even the owner - can create/edit/delete a room through the app
right now. RLS already correctly restricts this to owner-only
(`0007`); building the missing UI is a separate, smaller piece of work
that wasn't asked for here.

## 2. Guardian-initiated payment

### 2.1 RPC

```sql
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

`security definer` because the guardian caller has no direct RLS write
access to `payments`/`invoices` (by design, same as every other guardian
capability in this app - guardians get zero table-level write grants,
everything mediated through a narrow function). The `is distinct from`
check is the same null-safe pattern established after Stage 4's
`confirm_transfer` bug: `my_linked_student_id()` returns `null` for a
non-guardian or an unlinked guardian, and `null is distinct from
<real-uuid>` is `true`, so the check correctly denies rather than
silently passing.

The invoice is locked with `for update` before the status check, closing
the same double-submit race class this project has hit before (bed
double-booking, transfer double-approval) - without it, a guardian
double-clicking "Pay" or paying from two tabs at once could insert two
payment rows for one invoice.

**Amount is never trusted from the client** - it's read from the
invoice row itself inside the function, not passed as a parameter. A
guardian can only ever pay exactly what's actually owed.

### 2.2 UI

- `lib/guardian.ts` gains `payGuardianInvoice(invoiceId: string, method: PaymentMethod, reference?: string): Promise<void>`, calling the RPC.
- `components/guardian/FeeStatus.tsx` gains an optional `onPay` prop -
  when provided, unpaid rows get a "Pay Now" button (paid/no-callback
  rows get nothing).
- New `components/guardian/GuardianPaymentForm.tsx` - same shape as
  the existing admin `RecordPaymentForm` (method select, optional
  reference field, submit), calling `payGuardianInvoice` instead of
  `recordPayment`. Payment methods are the same four the admin side has
  (`cash`, `esewa`, `khalti`, `fonepay`).
- `/my-child` route: adds a `selectedInvoiceId` state, shows
  `GuardianPaymentForm` below the fee table when a row's "Pay Now" is
  clicked, refetches invoices on success so the guardian sees the
  updated status immediately - same `selectedInvoice`-then-refetch shape
  the existing Fees page already uses for the admin side.

## 3. In-app student enrollment

### 3.1 The constraint

Supabase Auth requires every account to have an email and a password.
This project's data-minimalism law never collects a student email
anywhere, and there's no point in the enrollment flow where the student
sets their own password - the warden is filling in the form, in person,
at check-in time. Creating an account *on someone else's behalf* also
requires `auth.admin.createUser()`, which needs the `service_role` key -
the one key this project's law has said, since Stage 1, must never be
requested or used.

**Approved exception, scoped narrowly:** a single Supabase Edge Function
handles this one operation. `service_role` lives only in that function's
server-side environment (Supabase injects `SUPABASE_SERVICE_ROLE_KEY`
into every Edge Function automatically - no manual secret-setting, and
it is never present in `.env.local`, the client bundle, or any file an
agent or the browser ever sees). This is the first Edge Function in the
project; everything else so far has been RLS + Postgres RPCs.

### 3.2 The function

`supabase/functions/enroll-student/index.ts` - Deno runtime (Supabase's
standard Edge Function environment).

Request body: `{ fullName: string; phone: string }` - exactly the two
fields already collected elsewhere in this app for a person, nothing new
collected beyond what data-minimalism already allows.

Steps inside the function:

1. **Authorize the caller itself** - Edge Functions run outside RLS
   entirely, so the function must do its own check, same discipline as
   every `security definer` RPC in this project. It builds a client
   using the **anon key** plus the caller's own forwarded `Authorization`
   header (automatically sent by `supabase.functions.invoke()` from an
   authenticated session) and queries `select role from profiles where
   id = auth.uid()` - this runs *as the caller*, under normal RLS, so it
   can only ever see the caller's own role. If the result isn't `owner`
   or `warden`, return `403`.
2. **Synthesize a login email from the phone number already being
   collected** - `${phone}@aabha-hostel.internal`. Not a new personal
   data field - a technical login handle derived from data already on
   the allowed field list.
3. **Generate a random temporary password** (e.g. 12 random alphanumeric
   characters).
4. Build a **second client using `service_role`** (server-side only,
   inside this function) and call `auth.admin.createUser({ email,
   password, email_confirm: true, user_metadata: { full_name: fullName,
   phone } })`. `email_confirm: true` skips Supabase's confirmation-email
   flow entirely - there's no real inbox behind the synthetic address,
   and the owner/warden calling this has already verified the person's
   identity in person.
5. The existing `handle_new_user()` trigger (Stage 1, unchanged) fires
   automatically on the new `auth.users` row, creating the `profiles`
   row with `role` hardcoded to `student` (the trigger has never trusted
   client-supplied role, and this function doesn't change that).
6. Return `{ profileId: <new user's id>, password: <the generated one> }`.
   If the phone/synthetic email is already in use, return a clear `409`.

### 3.3 UI

- `lib/students.ts` gains `enrollStudent(fullName: string, phone: string): Promise<{ profileId: string; password: string }>`, calling `supabase.functions.invoke('enroll-student', { body: { fullName, phone } })`.
- New `components/students/EnrollStudentForm.tsx` - two fields (name,
  phone), submits, and on success shows the generated password once in
  a clearly-labeled "write this down and give it to the student - it
  will not be shown again" banner.
- Residents route: this form sits alongside (not replacing) the existing
  "Select a student..." dropdown - the dropdown still works for accounts
  created via the Dashboard (e.g. staff testing), the new form is an
  additional path. On successful enrollment, the route auto-selects the
  new `profileId` (same as picking it from the dropdown) so the warden
  flows straight into the existing `CheckInForm` without any extra
  navigation - the actual check-in (bed assignment, guardian name/phone,
  monthly fee) still goes through `check_in_student()` unchanged.

### 3.4 Deployment

Edge Functions deploy via the Supabase CLI, run by the user (same
"no agent has credentials" boundary as every migration in this project):
`supabase functions deploy enroll-student`. No manual secret
configuration needed - `SUPABASE_SERVICE_ROLE_KEY` is already available
to every Edge Function in the project by default.

## 4. Testing plan (given to user at end of implementation)

- As guardian, open `/my-child`, click "Pay Now" on an unpaid invoice,
  pick a method, submit - confirm the invoice flips to Paid immediately
  and a payment row appears (admin side) attributed to the guardian.
- As guardian, confirm there is no way to pay an invoice that isn't
  their own linked child's (the RPC's own-child check).
- As owner/warden, open Residents, use "Enroll a Student" with a new
  name/phone - confirm a password is shown once, then use that new
  student in the existing Check-In flow immediately.
- Confirm the synthesized login email format doesn't collide if two
  students happen to share the same phone digits with different
  formatting (edge case worth a quick manual check, not a blocker).
- Confirm a student role (not owner/warden) calling the Edge Function
  directly gets a 403, not a created account.
