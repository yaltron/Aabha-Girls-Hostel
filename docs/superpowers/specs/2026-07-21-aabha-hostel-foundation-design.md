# Aabha Girls' Hostel Management System - Design Spec

Date: 2026-07-21
Status: Approved (pending user sign-off on written doc)

## 1. Overview

Aabha Girls' Hostel needs an operational management system behind an existing
marketing site design (built in Google Stitch). This is a **new, standalone
project** - a different business from the Yaltron agency site
(`healthtech-nepal-growth`) that lives in a sibling folder. It gets its own
repo, its own Supabase project, its own git history.

The system serves four roles:
- **Owner** - full access, including financial configuration
- **Warden** - day-to-day operations, no financial config
- **Student** - own record only
- **Guardian** - linked student's fees + notices only

Work proceeds in five stages, each stopping for user testing before the next
begins (per user instruction). This spec covers the **overall architecture**
and **Stage 1 (Foundation)** in detail. Stages 2-5 will each get a short
supplementary design note before their implementation plan, since the
functional requirements for all five stages were already specified in full by
the user - what remains to design per-stage is data model + UI wiring
specifics, not new requirements gathering.

## 2. Non-negotiable laws (from user, to be written into this project's CLAUDE.md)

1. **Data minimalism**: student record = name, photo, phone, guardian name +
   phone, room/bed, check-in date, monthly fee. No other personal fields
   without explicit request. (This overrides the richer Stitch admission-form
   mockup, which asked for DOB, blood group, college, address, emergency
   contact, and document uploads - those are dropped. Layout/styling of that
   form is kept; fields are trimmed.)
2. **RLS on every table from creation**, never retrofitted.
3. **Keys in `.env.local`**, never committed, never the `service_role` key.
4. **Match existing Stitch UI exactly** - no redesign.

## 3. Stack

- React + Vite + Tailwind CSS v4
- TanStack Router (user's choice, consistent with existing Yaltron site's
  router family) for the app shell / role-based route guards
- Supabase: Postgres + Auth + Storage (student photos), RLS-first
- Supabase project: `qektemgxthrxgnhfmgqg` (URL derived from provided anon
  key; `.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`)

## 4. Design tokens (extracted from Stitch export)

Stitch generated a Material-3-flavored token set. These become the Tailwind
theme extension for this project (not the Yaltron site's navy/orange system -
that CLAUDE.md belongs to a different project and does not apply here).

**Colors** (light mode; the marketing pages also show a `dark:` variant on a
few surfaces, but the admin/portal screens are light-only in the mockups, so
Stage 1 ships light-mode only):
- `primary` #755b00 · `primary-container` #c9a227 · `on-primary` #ffffff
- `background` / `surface` #fff8f4
- `surface-container-lowest` #ffffff · `-low` #fff1e6 · `-` #fdebda ·
  `-high` #f7e5d4 · `-highest` #f2dfcf
- `secondary` #705a4c · `secondary-container` #f8dac8
- `on-background` / `on-surface` #231a10 · `on-surface-variant` #4d4635
- `outline` #7f7663 · `outline-variant` #d1c5af
- `error` #ba1a1a · `error-container` #ffdad6

**Typography**: Headings - Playfair Display (600/700). Body/UI - Inter.
Icons - Material Symbols Outlined.

**Shape & elevation**: `rounded-full` pill buttons, `24px`-`32px` rounded
cards, two elevation levels via soft box-shadows
(`0px 4px 20px rgba(61,43,31,.05)` and `0px 10px 30px rgba(61,43,31,.1)`),
occasional `backdrop-blur` glass panels on nav bars.

**Spacing**: `base` 8px, `gutter` 24px, `margin-mobile` 20px,
`margin-desktop` 64px, `section-gap` 80px, `container-max` 1200px.

## 5. Screens observed in the Stitch export

Public/marketing (already designed, out of scope for app logic beyond
routing them as static pages later if desired): Home, Rooms & Fees,
Transparency & Safety.

App screens (drive Stage 1-5 build):
- **Admission/Booking flow**: 3-step (Information → Reservation/Payment →
  Confirmation) + separate Acceptance-of-Rules e-signature step (desktop +
  mobile variants)
- **Admin Dashboard**: fixed left sidebar (Residents / Fees / Staff /
  Facilities), top bar with search, KPI cards (Occupancy Rate, Fees
  Collected, Admission Requests), Resident Directory table, Recent Activity
  feed, Quick Actions panel
- **Fee Payment** (student-facing): outstanding balance, fee breakdown,
  payment method picker (eSewa/Khalti/FonePay/Bank), transaction history
- **Parent Portal Dashboard**: student summary card, financial overview,
  attendance calendar, "Contact Warden" panel, "Life at Aabha" updates feed
- **Message Center**: guardian ↔ warden chat UI

No login screen was included - Stage 1 designs one from scratch using the
same tokens (cream background, gold primary, centered glass card).

The sidebar nav labels (Residents/Fees/Staff/Facilities) map directly onto
this project's role-based nav for warden/owner; "Staff" and "Facilities" are
placeholders in the mockup with no corresponding requirement yet in the
user's 5-stage spec, so Stage 1 builds the sidebar shell with only the
sections that have real destinations so far (more get wired in as later
stages land).

## 6. Stage 1 - Foundation (this cycle's implementation target)

**Data model**:
- `profiles` table: `id` (FK to `auth.users`), `full_name`, `role` (enum:
  `owner` | `warden` | `student` | `guardian`), `phone`, timestamps.
- `role` enum type created in migration 0001.
- One seed script/migration creates one `owner` account (email/password
  supplied by user at run time, not hardcoded).

**Auth**: Supabase email/password auth. On sign-up/invite, a `profiles` row
is created (trigger on `auth.users` insert, or explicit insert right after
sign-up - decided in the implementation plan). Login screen matches Stitch
tokens: centered card, `Aabha` wordmark, email/password fields, "Sign in"
pill button.

**RLS (Stage 1 scope - profiles table only)**:
- `owner`: full read/write on all `profiles` rows.
- `warden`: read all `profiles` rows (needs to see students/guardians for
  operations); cannot write role or other users' rows.
- `student`: read/write only their own `profiles` row.
- `guardian`: read only their own `profiles` row (linkage to a specific
  student's row is Stage 2+, once the student table + guardian-link column
  exist).

**Admin shell**: sidebar (matches Stitch Admin Dashboard layout) with
role-based nav items - shows only the sections each role is allowed into.
Stage 1 has no real Residents/Fees data yet, so nav renders to empty-state
placeholder pages; the shell, auth guard, and role switching are what's
under test this stage.

**Out of scope for Stage 1** (later stages): rooms/beds, students, fees,
transfer requests, maintenance tickets, notices, guardian-student linkage.

## 7. Testing plan for Stage 1 (given to user at end of implementation)

- Sign in as the seeded owner account; confirm dashboard shell loads with
  full nav.
- Attempt to view the app unauthenticated; confirm redirect to login.
- Confirm a `warden`-role user (created manually in Supabase for testing)
  sees operational nav only, no financial-config nav item.
- Confirm a `student`-role test user only ever sees their own profile data
  (verified by attempting a direct query for another user's row - RLS must
  reject it).
- Confirm a `guardian`-role test user's access is likewise restricted to
  their own profile row (fee/notice visibility arrives in later stages).

**RLS negative-check to report to user**: what each role provably CANNOT
see, demonstrated via a rejected query, not just absence of a UI link.

## 8. Open items deferred to later stages (not gaps in this spec - explicitly future work)

- Guardian-to-student linkage mechanism (Stage 5 per user's plan, though the
  `profiles.role = guardian` case exists from Stage 1 so the enum doesn't
  need to change later).
- Storage bucket + policy for student photos (introduced in Stage 2 when the
  student record itself is built).
