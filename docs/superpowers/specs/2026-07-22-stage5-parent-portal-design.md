# Stage 5 (Parent Portal) - Design Spec

Date: 2026-07-22
Status: Approved

## 1. Overview

Stage 5 is the last of the user's 5-stage plan: guardian login linked to a
student, seeing fee status, guardian-flagged notices, and a monthly
personalized "all well" update the warden posts. The project's explicit
closing law - "nothing else about the student is visible to anyone who is
not the student, warden, or owner" - is the primary design constraint here,
more than any prior stage, since a guardian is by definition an outsider
to the hostel's day-to-day operations.

## 2. Data model

```sql
-- Added to the existing students table:
alter table public.students add column guardian_id uuid references public.profiles(id);

guardian_updates:
  id uuid pk
  student_id uuid fk -> students(id)
  month date not null            -- always the 1st of the month
  message text not null
  posted_by uuid fk -> profiles(id)
  created_at timestamptz
  unique (student_id, month)     -- one update per student per month,
                                  -- mirrors invoices' own uniqueness pattern
```

`guardian_id` is one-to-one (a student has at most one linked guardian,
per the user's decision) - no join table. `guardian_updates` is per
student per month, not a repost of general notices - a different guardian
reading their own child's row never sees another child's update.

## 3. The linkage-lookup security pattern (why guardians get zero direct table access)

A naive design would give guardians a read policy on `students` (`using
(guardian_id = auth.uid())`) so other tables' RLS policies could subquery
it (`student_id in (select id from students where guardian_id =
auth.uid())`). That would work, but it also hands guardians SELECT access
to the full `students` row - `photo_url`, `bed_id`, `check_in_date`,
`monthly_fee`, the recorded (different) guardian_name/phone fields - none
of which the spec says a guardian should see, and several of which
directly violate "nothing else about the student is visible."

Instead, this stage adds `public.my_linked_student_id()` - a `security
definer`, `stable` helper function, the same pattern as Stage 1's
`current_role()` - that internally queries `students.guardian_id =
auth.uid()` and returns the matched student's id (or null). Every guardian
RLS policy in this stage references `student_id = public.my_linked_student_id()`
instead of a raw subquery, so **guardians never get a table-level grant on
`students`, `rooms`, or `beds` at all** - their entire visible surface is
exactly: their own `profiles`-adjacent identification of the child, that
child's invoices/payments, guardian-visible notices, and that child's
`guardian_updates`. This is the tightest interpretation of the closing law
available without breaking the feature.

## 4. RLS additions (this stage's four migrations)

- `students`: no new guardian policy (per Section 3 - guardians get zero
  direct access to this table).
- `profiles`: new guardian policy, `for select`, `using (id =
  public.my_linked_student_id())` - lets a guardian read their linked
  student's `full_name` (needed to label "Fees for Anjali" in the UI) and
  incidentally `phone`/`role` (already-minimal Stage 1 fields, not new
  exposure).
- `invoices`, `payments`: new guardian `for select` policies using the
  same `student_id = public.my_linked_student_id()` predicate (payments
  via the existing invoice-scoped subquery pattern from Stage 3).
- `notices`: new guardian `for select` policy, `using (public.current_role()
  = 'guardian' and guardian_visible = true)` - guardians see only
  guardian-flagged notices, never the full notice list students see.
- `guardian_updates`: owner/warden `for all` (post/manage); guardian `for
  select` using `student_id = public.my_linked_student_id()`.

Linking itself (`update students set guardian_id = ...`) stays owner/warden
`for all` on `students`, unchanged from Stage 2 - no new write surface.

## 5. UI

**Warden-facing (extends the existing Residents page from Stage 2):**
- "Link Guardian" action per resident row - picks from `profiles` with
  `role = 'guardian'` not yet linked to any student (same "unassigned
  profile" pattern Stage 2 used for unassigned students at check-in).
- "Post Monthly Update" action per resident row - a short text field,
  posts (or updates, if one already exists this month) that student's
  `guardian_updates` row for the current month.

**Guardian-facing (one new page, `/my-child`, plus a `MY_CHILD` nav item -
guardian's nav becomes `[DASHBOARD, MY_CHILD]`; the existing generic
`/dashboard` route is left untouched, still shows Occupancy Rate to
everyone as it does today - out of scope for this stage to change):**
- Child's name (header).
- Fee status: same dues/paid presentation style as the owner/warden Fees
  page (Stage 3), scoped to just this one student's invoices via the new
  RLS.
- Guardian-visible notices list (reuses Stage 4's `NoticesList` component
  as-is - it already just renders whatever `Notice[]` it's given).
- This month's "all well" update, if the warden has posted one.

No Stitch mockup exists for either the guardian page or the two new
resident-row actions - built with the established design tokens, same
approach as every UI surface without a direct mockup in Stages 2-4.

## 6. Testing plan (given to user at end of implementation)

- Link a guardian test account to a student via the Residents page.
- Sign in as that guardian; confirm `/my-child` shows the linked student's
  name, fee status, and nothing else.
- Post a monthly update as warden; confirm the guardian sees it.
- Post a guardian-flagged notice; confirm the guardian sees it. Post a
  non-flagged notice; confirm the guardian does NOT see it.
- Confirm the guardian cannot query `students`/`rooms`/`beds` at all (SQL
  Editor RLS check, same `set local role authenticated` pattern used in
  every prior stage) - `select * from students` as the guardian should
  return zero rows even for their own linked child.
- Confirm a SECOND guardian, linked to a different student, sees only
  their own child's fees/updates - never the first guardian's child's data.
