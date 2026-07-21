# Stage 4 (Requests & Operations) - Design Spec

Date: 2026-07-22
Status: Approved

## 1. Overview

Stage 4 delivers three operational features per the user's 5-stage plan:
room transfer requests (with warden approval, student confirmation of any
price change, and an audit trail), maintenance tickets, and notices. This
is also the first stage to build real student-facing UI - Stages 1-3 only
built the owner/warden admin shell; students had nothing beyond a bare
dashboard.

## 2. Data model

```sql
create type transfer_status as enum ('pending', 'awaiting_confirmation', 'confirmed', 'rejected');
create type ticket_status as enum ('open', 'resolved');

transfer_requests:
  id uuid pk
  student_id uuid fk -> students(id)
  reason text not null
  preferred_room_type room_type not null      -- reuses Stage 2's enum
  status transfer_status not null default 'pending'
  from_bed_id uuid fk -> beds(id)              -- snapshot at request time
  to_bed_id uuid fk -> beds(id), nullable      -- set on approval
  price_diff numeric, nullable                 -- new room price - old room price, set on approval
  reject_reason text, nullable
  reviewed_by uuid fk -> profiles(id), nullable
  reviewed_at timestamptz, nullable
  confirmed_at timestamptz, nullable
  created_at timestamptz

maintenance_tickets:
  id uuid pk
  student_id uuid fk -> students(id)
  description text not null
  status ticket_status not null default 'open'
  created_at timestamptz
  resolved_at timestamptz, nullable
  resolved_by uuid fk -> profiles(id), nullable

notices:
  id uuid pk
  title text not null
  body text not null
  guardian_visible boolean not null default false  -- RLS-ready for Stage 5;
                                                      -- no guardian UI reads this yet
  posted_by uuid fk -> profiles(id)
  created_at timestamptz
```

Audit trail for a transfer decision lives on the request row itself
(`reviewed_by`, `reviewed_at`, `from_bed_id`, `to_bed_id`) rather than a
separate audit-log table - each request is immutable once decided
(rejected requests never change again; confirmed requests' bed swap is the
terminal state), so the row IS the audit record. This matches the
data-minimalism instinct of not building infrastructure the spec didn't
ask for.

## 3. Transfer request state machine

```
pending --(warden approves, picks a specific vacant bed of preferred_room_type)-->
    if new room price == old room price:
        confirmed   (bed swap + no invoice change happen immediately, in the approval RPC)
    else:
        awaiting_confirmation   (NOTHING changes yet - no bed swap, no invoice touch)
            --(student confirms)--> confirmed (bed swap + next invoice amount updated, atomically)

pending --(warden rejects, with a reason)--> rejected  (terminal, no bed change)
```

Two RPCs, both `security invoker` (matching the `check_in_student` /
`generate_monthly_invoices` precedent from Stages 2-3):
- `approve_transfer_request(p_request_id, p_to_bed_id)` - owner/warden only
  (gated by table RLS). Looks up the room prices for `from_bed_id` and
  `p_to_bed_id`; if equal, does the bed swap immediately and sets status
  `confirmed`; if different, sets `to_bed_id`, `price_diff`, and status
  `awaiting_confirmation` without touching beds yet.
- `confirm_transfer(p_request_id)` - the requesting student only (gated by
  `student_id = auth.uid()` in RLS, `security invoker`). Only callable when
  status is `awaiting_confirmation`. Does the bed swap (free `from_bed_id`,
  occupy `to_bed_id`) and updates the student's next-unpaid-invoice amount
  by `price_diff`, if one exists; sets status `confirmed`.
- `reject_transfer_request(p_request_id, p_reason)` - owner/warden only.

## 4. RLS

- `transfer_requests`, `maintenance_tickets`: owner/warden full read/write
  (operational, not financial-config, matching the `students`/`beds`
  pattern). Student: insert their own (via direct RLS-gated INSERT, not an
  RPC - creating a request has no invariant worth wrapping in a function,
  unlike approval/confirmation which touch beds/invoices); read own rows.
- `notices`: owner/warden full read/write. Student: read all (no
  `guardian_visible` filtering for students - that flag is Stage 5's
  concern). Guardian: nothing yet.

## 5. UI

**Student-facing (new this stage):**
- Nav gains "My Room", "Maintenance", "Notices" for `student` role
  (`Dashboard` stays first).
- **My Room**: shows current bed/room. A "Request Transfer" button opens a
  small form (reason + preferred room type). If the student has a request
  in `awaiting_confirmation`, this page shows the price-diff confirmation
  UI instead (old room, new room, price difference, Confirm button) -
  takes priority over the request form.
- **Maintenance**: list of the student's own tickets + a "Raise a Ticket"
  form (description only).
- **Notices**: read-only list, newest first.

No Stitch mockup exists for any of these three screens - built with the
established design tokens (same approach as Stage 2's bed board, which
also had no direct mockup), not a new visual language.

**Owner/warden-facing:**
- One new nav item, "Requests", combining a transfer-requests queue (shows
  each pending request beside the live bed board for that room type - a
  compact list of vacant beds matching `preferred_room_type`, so approving
  is picking a bed from a real-time list, not guessing) and a maintenance
  queue, as two sections on one page.
- Notices get a simple "post a notice" form on the same or an adjacent
  page (title + body + guardian-visible checkbox), plus a list of past
  notices.

## 6. Testing plan (given to user at end of implementation)

- Submit a transfer request as a student; confirm it appears in the
  warden's Requests queue beside live availability for that room type.
- Approve a transfer to a same-priced room; confirm the bed swaps
  immediately with no student action needed.
- Approve a transfer to a different-priced room; confirm the student sees
  a confirmation prompt with the price difference, and NOTHING changes
  (bed, invoice) until they confirm.
- Confirm the transfer as the student; confirm the bed swap and invoice
  update happen together.
- Reject a request with a reason; confirm the student can see why.
- Raise and resolve a maintenance ticket.
- Post a notice; confirm it's visible to a student test account.
- Confirm a student-role user cannot approve/reject their own or anyone
  else's transfer request, resolve tickets, or post notices (RLS).
