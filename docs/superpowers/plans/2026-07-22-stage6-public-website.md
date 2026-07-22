# Stage 6 (Public Portfolio Website) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public marketing website at the site root, connected to the same Supabase project through three read-only views and two insert-only write paths for anonymous visitors, plus the owner-side content management (site copy, photos, reviews, weekly menu, inquiries inbox, bookings queue) that feeds it. The existing admin/student/guardian system is completely untouched.

**Architecture:** Six new tables, all RLS-enabled from creation. Anonymous reads never touch a base table — three views (`public_room_availability`, `public_weekly_menu`, `public_notices`) are the only things `anon` is ever granted `select` on. Anonymous writes are two `insert`-only RLS policies (`inquiries`, `bookings`) with no matching `select` policy for `anon`. `approve_booking()` is the one new RPC, `security invoker` (owner/warden already have direct write access to everything it touches), reusing the `select ... for update` bed-lock pattern from Stages 2 and 4. `check_in_student()` (Stage 2) gets a `create or replace` to accept a `reserved` bed alongside `vacant`, since Stage 5+ migrations can't retroactively edit an already-applied migration file — a behavior change to a live function needs a new migration that replaces it.

**Tech Stack:** Same as Stages 1-5 — React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Router, `@supabase/supabase-js`, Vitest + `@testing-library/react`.

## Global Constraints

- **Anon gets zero grants on base tables.** `rooms`, `beds`, `students`, `notices`, `menu_items`, `site_media`, `site_content`, `reviews`, `inquiries`, `bookings` — none of these ever get a `grant` or an `anon`-facing RLS policy beyond the two explicit `insert`-only policies on `inquiries`/`bookings`. Anonymous reads go exclusively through the three views, granted `select` directly (views run with their owner's privileges, same "narrow the surface" instinct as Stage 5's `my_linked_student_id()`, applied to views instead of a function).
- **No anon `select` on `inquiries`/`bookings`.** A visitor who submits either form gets a static client-side thank-you message, never reads their row back. This is what "insert-only" means literally — not insert-plus-read-your-own-write.
- `public_visible` (new column on `notices`) is distinct from Stage 4's `guardian_visible` — a notice can be flagged for guardians, the public, both, or neither, independently.
- `approve_booking(p_booking_id, p_bed_id)` is `security invoker`, matching `approve_transfer_request`'s posture from Stage 4 (the caller — owner/warden — already has direct RLS write access to `beds` and `bookings`).
- `check_in_student()`'s bed-status check changes from `= 'vacant'` to `in ('vacant', 'reserved')` via `create or replace function` in a new migration — the Stage 2 migration file itself is never edited; it's long since applied to the live database, unlike this session's earlier same-branch migrations which could still be edited in place before their first apply.
- Migrations are applied manually in the Supabase SQL Editor by the user (project `qektemgxthrxgnhfmgqg`) — no agent has DB credentials, exactly as established since Stage 1. Migration tasks end with an "apply + verify" step, plus this stage's specific proof step: `set role anon;` against every new/existing base table must return permission-denied, not empty rows.
- The public route group (`/`, `/rooms`, `/life`, `/about`, `/contact`) sits beside `_authenticated`, not nested under it — no login required, no `AdminShell`.
- **Visual build is explicitly deferred.** No Stitch screens have been provided yet. The public-facing route task in this plan (Task 16) builds a functional-but-unstyled skeleton using the project's existing design tokens as a placeholder, proving every read/write wire is correct end-to-end. Matching the real Stitch screens exactly is follow-up work once they're pasted in — not part of this plan's scope, and this plan's tasks/reviews should not be blocked on it.
- Match the established codebase patterns exactly: try/catch + local error state on every form (`CheckInForm`, `PostNoticeForm`, `LinkGuardianForm` are the reference shape), fetch-then-reveal for any form needing async-fetched initial data (Stage 5's `PostUpdateForm` wiring is the reference for why), and the existing per-role RLS style (`current_role() in (...)`) for every new policy.

---

## File Structure

```
aabha-hostel/
  supabase/
    migrations/
      0016_site_media_content_reviews.sql
      0017_inquiries_bookings_menu.sql
      0018_public_views.sql
      0019_approve_booking_and_checkin_update.sql
  src/
    lib/
      siteContent.ts
      siteContent.test.ts
      media.ts
      media.test.ts
      reviews.ts
      reviews.test.ts
      menu.ts
      menu.test.ts
      inquiries.ts
      inquiries.test.ts
      bookings.ts
      bookings.test.ts
      publicSite.ts
      publicSite.test.ts
    components/
      admin/
        SiteContentForm.tsx
        SiteContentForm.test.tsx
        MediaGalleryManager.tsx
        MediaGalleryManager.test.tsx
        ReviewsManager.tsx
        ReviewsManager.test.tsx
        MenuEditor.tsx
        MenuEditor.test.tsx
        InquiriesInbox.tsx
        InquiriesInbox.test.tsx
        BookingsQueue.tsx
        BookingsQueue.test.tsx
      public/
        PublicShell.tsx
        PublicShell.test.tsx
    routes/
      _authenticated.site-content.tsx   # NEW: owner-only admin page
      index.tsx                          # NEW: public home, "/"
      rooms.tsx                          # NEW: public rooms page
      life.tsx                           # NEW: public "Life at Aabha"
      about.tsx                          # NEW: public about page
      contact.tsx                        # NEW: public inquiry + reserve forms
    lib/
      nav.ts                              # MODIFIED: owner gains "Site Content"
      nav.test.ts                         # MODIFIED
```

---

### Task 1: Migration 0016 - `site_media`, `site_content`, `reviews` + storage bucket

**Files:**
- Create: `supabase/migrations/0016_site_media_content_reviews.sql`

**Interfaces:**
- Consumes: `public.current_role()` (Stage 1).
- Produces: `public.site_media`, `public.site_content`, `public.reviews`, all RLS-protected owner/warden `for all`; a public Supabase Storage bucket `site-media`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0016_site_media_content_reviews.sql`:
```sql
-- Stage 6: editable marketing content - photos, key/value copy, testimonials.
create table public.site_media (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  quote text not null,
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_media enable row level security;
alter table public.site_content enable row level security;
alter table public.reviews enable row level security;

create policy "site_media_owner_warden_full_access" on public.site_media
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "site_content_owner_warden_full_access" on public.site_content
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "reviews_owner_warden_full_access" on public.reviews
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

-- Public bucket: a public:true bucket serves objects via a public URL
-- with no RLS involved on read, so anon never needs a storage.objects
-- select policy here - only owner/warden need write access.
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true);

create policy "site_media_bucket_owner_warden_write" on storage.objects
  for all
  using (bucket_id = 'site-media' and public.current_role() in ('owner', 'warden'))
  with check (bucket_id = 'site-media' and public.current_role() in ('owner', 'warden'));
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor for project `qektemgxthrxgnhfmgqg` and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'site_media' order by ordinal_position;
select column_name from information_schema.columns where table_name = 'site_content' order by ordinal_position;
select column_name from information_schema.columns where table_name = 'reviews' order by ordinal_position;
select relrowsecurity from pg_class where relname in ('site_media', 'site_content', 'reviews');
-- expect true, true, true
select public from storage.buckets where id = 'site-media';
-- expect true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_site_media_content_reviews.sql
git commit -m "feat: add site_media, site_content, reviews tables and public storage bucket"
```

---

### Task 2: Migration 0017 - `inquiries`, `bookings`, `menu_items` + `notices.public_visible`

**Files:**
- Create: `supabase/migrations/0017_inquiries_bookings_menu.sql`

**Interfaces:**
- Consumes: `public.current_role()`, `public.beds` (Stage 2), `room_type` enum (Stage 2), `public.notices` (Stage 4).
- Produces: `inquiry_status`/`booking_status`/`meal_type` enums, `public.inquiries`, `public.bookings`, `public.menu_items`, `notices.public_visible boolean`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0017_inquiries_bookings_menu.sql`:
```sql
-- Stage 6: anonymous-facing inquiry/booking intake, plus the weekly menu.
create type inquiry_status as enum ('new', 'contacted', 'closed');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  message text,
  status inquiry_status not null default 'new',
  created_at timestamptz not null default now()
);

create type booking_status as enum ('pending', 'approved', 'declined');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  guardian_phone text not null,
  room_type room_type not null,
  preferred_date date not null,
  status booking_status not null default 'pending',
  reserved_bed_id uuid references public.beds(id),
  created_at timestamptz not null default now()
);

create type meal_type as enum ('breakfast', 'lunch', 'dinner');

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),
  meal meal_type not null,
  description text not null,
  unique (day_of_week, meal)
);

alter table public.notices add column public_visible boolean not null default false;

alter table public.inquiries enable row level security;
alter table public.bookings enable row level security;
alter table public.menu_items enable row level security;

create policy "inquiries_owner_warden_full_access" on public.inquiries
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

-- Insert-only for anonymous visitors - deliberately no matching select
-- policy for anon, so a visitor can submit but never read inquiries back.
create policy "inquiries_anon_insert" on public.inquiries
  for insert
  to anon
  with check (true);

create policy "bookings_owner_warden_full_access" on public.bookings
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "bookings_anon_insert" on public.bookings
  for insert
  to anon
  with check (true);

create policy "menu_items_owner_warden_full_access" on public.menu_items
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'bookings' order by ordinal_position;
select column_name from information_schema.columns where table_name = 'notices' and column_name = 'public_visible';
select relrowsecurity from pg_class where relname in ('inquiries', 'bookings', 'menu_items');
-- expect true, true, true
select policyname, roles from pg_policies where tablename in ('inquiries', 'bookings') and policyname like '%anon%';
-- expect inquiries_anon_insert / {anon}, bookings_anon_insert / {anon}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_inquiries_bookings_menu.sql
git commit -m "feat: add inquiries, bookings, menu_items tables and notices.public_visible"
```

---

### Task 3: Migration 0018 - the three public views

**Files:**
- Create: `supabase/migrations/0018_public_views.sql`

**Interfaces:**
- Consumes: `public.rooms`/`public.beds` (Stage 2), `public.menu_items`/`public.notices` (Task 2).
- Produces: `public.public_room_availability`, `public.public_weekly_menu`, `public.public_notices`, each granted `select` to `anon`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0018_public_views.sql`:
```sql
-- Stage 6: the entire anonymous read surface. Views run with their
-- owner's privileges (not the caller's), so anon can select from these
-- without ever being granted access to the base tables they read from.
create view public.public_room_availability as
  select
    r.room_type,
    min(r.monthly_price) as monthly_price,
    count(*) filter (where b.status = 'vacant') as beds_available
  from public.rooms r
  join public.beds b on b.room_id = r.id
  group by r.room_type;

create view public.public_weekly_menu as
  select day_of_week, meal, description from public.menu_items;

create view public.public_notices as
  select id, title, body, created_at from public.notices
  where public_visible = true;

grant select on public.public_room_availability to anon;
grant select on public.public_weekly_menu to anon;
grant select on public.public_notices to anon;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
set role anon;
select * from public.public_room_availability;
select * from public.public_weekly_menu;
select * from public.public_notices;
-- all three: expect success (rows or empty result, never an error)

select * from public.rooms;
select * from public.beds;
select * from public.notices;
select * from public.students;
select * from public.menu_items;
select * from public.site_media;
select * from public.site_content;
select * from public.reviews;
select * from public.inquiries;
select * from public.bookings;
-- all ten: expect "permission denied for table ..." on every one
reset role;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_public_views.sql
git commit -m "feat: add public_room_availability, public_weekly_menu, public_notices views"
```

---

### Task 4: Migration 0019 - `approve_booking` RPC + `check_in_student` update

**Files:**
- Create: `supabase/migrations/0019_approve_booking_and_checkin_update.sql`

**Interfaces:**
- Consumes: `public.bookings`, `public.beds` (Task 2, Stage 2).
- Produces: `public.approve_booking(p_booking_id uuid, p_bed_id uuid) returns void`; replaces `public.check_in_student(...)` (Stage 2, migration 0005) to accept a `reserved` bed in addition to `vacant`.

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/0019_approve_booking_and_checkin_update.sql`:
```sql
-- Stage 6: approving a booking reserves a bed for that visitor.
-- security invoker, NOT definer - the calling warden/owner already has
-- direct RLS write access to both bookings and beds.
create function public.approve_booking(p_booking_id uuid, p_bed_id uuid)
returns void
language plpgsql
as $$
begin
  if (select status from public.beds where id = p_bed_id for update) <> 'vacant' then
    raise exception 'Bed % is not vacant', p_bed_id;
  end if;

  update public.beds set status = 'reserved' where id = p_bed_id;

  update public.bookings
  set status = 'approved', reserved_bed_id = p_bed_id
  where id = p_booking_id and status = 'pending';

  if not found then
    raise exception 'Booking % is not pending', p_booking_id;
  end if;
end;
$$;

revoke execute on function public.approve_booking(uuid, uuid) from public;
grant execute on function public.approve_booking(uuid, uuid) to authenticated;

-- Stage 6: a reserved bed (from an approved booking) must still be
-- check-in-able through the one existing check-in path, not a second
-- parallel one. This is the only change from the Stage 2 original:
-- 'vacant' -> 'vacant' or 'reserved'.
create or replace function public.check_in_student(
  p_profile_id uuid,
  p_guardian_name text,
  p_guardian_phone text,
  p_bed_id uuid,
  p_check_in_date date,
  p_monthly_fee numeric,
  p_photo_url text default null
)
returns void
language plpgsql
as $$
begin
  if (select status from public.beds where id = p_bed_id for update) not in ('vacant', 'reserved') then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied' where id = p_bed_id and status in ('vacant', 'reserved');

  if not found then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL Editor and run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify**

```sql
select proname from pg_proc where proname in ('approve_booking', 'check_in_student');
-- expect both present

-- Confirm the replace actually changed the check: this should now
-- succeed for a bed you've manually set to 'reserved' (revert after):
update public.beds set status = 'reserved' where id = '<a real vacant bed id>';
select public.check_in_student('<a profile id with no student row>'::uuid, 'Test Guardian', '9800000000', '<same bed id>'::uuid, current_date, 10000);
-- expect success, bed now 'occupied' - then clean up the test row/bed status manually if this was just a smoke test
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_approve_booking_and_checkin_update.sql
git commit -m "feat: add approve_booking RPC, allow check_in_student on reserved beds"
```

---

### Task 5: `lib/siteContent.ts` - editable copy

**Files:**
- Create: `src/lib/siteContent.ts`
- Test: `src/lib/siteContent.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type SiteContentKey = 'hero' | 'trust_points' | 'about' | 'safety_rules' | 'contact'
  export async function fetchSiteContent(): Promise<Record<string, unknown>>
  export async function updateSiteContent(key: SiteContentKey, value: unknown): Promise<void>
  ```
  `fetchSiteContent` returns a map of `key -> value` (already-parsed jsonb) for every row - consumed by `SiteContentForm` (Task 12) and the public routes (Task 16, read-only via the same function since `site_content` itself has no anon grant - **correction, see below**).

  Note: `site_content` has no anon policy per this stage's law - it is owner/warden only. The public routes do NOT call `fetchSiteContent()`; marketing copy that must appear on the public site (hero text, about text, etc.) needs its own anon-readable path. Add a fourth view for this in Task 3's migration scope conceptually, but since Task 3 is already applied by the time this is discovered, see Task 5's Step 0 below - the fix belongs in this task, before the lib module is built around a false assumption.

- [ ] **Step 0: Add a public content view (build on Task 3, not a redo)**

`site_content` is owner/warden-only, but hero/about/trust-point copy must be readable by anonymous visitors. Rather than grant `anon` broad access to the whole table, add one more narrow view, in a new migration:

`supabase/migrations/0020_public_site_content_view.sql`:
```sql
create view public.public_site_content as
  select key, value from public.site_content;

grant select on public.public_site_content to anon;
```

Apply it in the SQL Editor (same project, same "Success. No rows returned" expectation), then verify:
```sql
set role anon;
select * from public.public_site_content;
-- expect success
reset role;
```
Commit: `git add supabase/migrations/0020_public_site_content_view.sql && git commit -m "feat: add public_site_content view"`

This view is unrestricted-by-row (every key is public) because everything stored in `site_content` in this stage's scope (hero, trust points, about, safety/rules, contact) is, by definition, marketing copy meant to be public. If a future key needs to stay admin-only, that's a new column/table split at that time, not a filter added here speculatively.

- [ ] **Step 1: Write the failing test**

`src/lib/siteContent.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockRows = [
  { key: 'hero', value: { headline: 'Home away from home', subhead: 'Safe, comfortable hostel living' } },
  { key: 'about', value: { text: 'Aabha Girls Hostel has been...' } },
]

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockRows, error: null })),
      upsert: upsertMock,
    })),
  },
}))

describe('fetchSiteContent', () => {
  it('returns a key-to-value map built from every row', async () => {
    const { fetchSiteContent } = await import('./siteContent')
    const content = await fetchSiteContent()
    expect(content).toEqual({
      hero: { headline: 'Home away from home', subhead: 'Safe, comfortable hostel living' },
      about: { text: 'Aabha Girls Hostel has been...' },
    })
  })
})

describe('updateSiteContent', () => {
  it('upserts the given key with the given value', async () => {
    const { updateSiteContent } = await import('./siteContent')
    await updateSiteContent('hero', { headline: 'New headline' })
    expect(upsertMock).toHaveBeenCalledWith({ key: 'hero', value: { headline: 'New headline' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteContent.test.ts`
Expected: FAIL - `Cannot find module './siteContent'`

- [ ] **Step 3: Write the implementation**

`src/lib/siteContent.ts`:
```typescript
import { supabase } from './supabase'

export type SiteContentKey = 'hero' | 'trust_points' | 'about' | 'safety_rules' | 'contact'

export async function fetchSiteContent(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('site_content').select('*')
  if (error) throw error
  const map: Record<string, unknown> = {}
  for (const row of data ?? []) {
    map[(row as { key: string; value: unknown }).key] = (row as { key: string; value: unknown }).value
  }
  return map
}

export async function updateSiteContent(key: SiteContentKey, value: unknown): Promise<void> {
  const { error } = await supabase.from('site_content').upsert({ key, value })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteContent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteContent.ts src/lib/siteContent.test.ts
git commit -m "feat: add siteContent data access module"
```

---

### Task 6: `lib/media.ts` - photo gallery data access

**Files:**
- Create: `src/lib/media.ts`
- Test: `src/lib/media.test.ts`

**Interfaces:**
- Consumes: `supabase` (table `site_media` and storage bucket `site-media`, both from Task 1).
- Produces:
  ```typescript
  export type MediaCategory = 'highlight' | 'room_single' | 'room_twin' | 'room_triple' | 'facility'
  export type MediaItem = { id: string; category: MediaCategory; url: string; caption: string | null; sort_order: number }
  export async function fetchMedia(category?: MediaCategory): Promise<MediaItem[]>
  export async function uploadMedia(file: File, category: MediaCategory, caption?: string): Promise<void>
  export async function deleteMedia(id: string): Promise<void>
  export async function reorderMedia(id: string, sortOrder: number): Promise<void>
  ```
  Consumed by `MediaGalleryManager` (Task 12) and the public routes (Task 16, reading through `public_room_availability`-adjacent needs - actually the public site reads media via a **plain `select` on `site_media` is not available to anon**; see Step 0 below, same gap shape as Task 5.

- [ ] **Step 0: Public media needs its own view too**

Same reasoning as Task 5: `site_media` is owner/warden-only, but photos must render on the public site. Add this to the same `0020` migration file from Task 5 (both gaps were discovered together, and both are one-line views — no reason to split into two migrations for two views found in the same review pass):

Append to `supabase/migrations/0020_public_site_content_view.sql`:
```sql
create view public.public_site_media as
  select id, category, url, caption, sort_order from public.site_media
  order by sort_order;

grant select on public.public_site_media to anon;
```

If Task 5 already applied `0020` before this task starts, re-open that same file, add these two statements, and apply only the new statements in the SQL Editor (a `create view` for a view that doesn't exist yet + its `grant` - this is additive, not a re-run of the whole file). Verify:
```sql
set role anon;
select * from public.public_site_media;
reset role;
```

- [ ] **Step 1: Write the failing test**

`src/lib/media.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockMedia = [
  { id: 'media-1', category: 'highlight', url: 'https://x.supabase.co/storage/v1/object/public/site-media/a.jpg', caption: 'Common room', sort_order: 0 },
]

const uploadMock = vi.fn(() => Promise.resolve({ data: { path: 'highlight/a.jpg' }, error: null }))
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/site-media/highlight/a.jpg' } }))
const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const deleteEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockMedia, error: null })) })),
        order: vi.fn(() => Promise.resolve({ data: mockMedia, error: null })),
      })),
      insert: insertMock,
      delete: vi.fn(() => ({ eq: deleteEqMock })),
      update: vi.fn(() => ({ eq: updateEqMock })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
  },
}))

describe('fetchMedia', () => {
  it('returns all media items ordered by sort_order', async () => {
    const { fetchMedia } = await import('./media')
    const items = await fetchMedia()
    expect(items).toEqual(mockMedia)
  })
})

describe('uploadMedia', () => {
  it('uploads the file then inserts a site_media row with the public URL', async () => {
    const { uploadMedia } = await import('./media')
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await uploadMedia(file, 'highlight', 'Common room')
    expect(uploadMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      category: 'highlight',
      url: 'https://x.supabase.co/storage/v1/object/public/site-media/highlight/a.jpg',
      caption: 'Common room',
    })
  })
})

describe('deleteMedia', () => {
  it('deletes the given media row', async () => {
    const { deleteMedia } = await import('./media')
    await deleteMedia('media-1')
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'media-1')
  })
})

describe('reorderMedia', () => {
  it('updates sort_order for the given media row', async () => {
    const { reorderMedia } = await import('./media')
    await reorderMedia('media-1', 2)
    expect(updateEqMock).toHaveBeenCalledWith('id', 'media-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/media.test.ts`
Expected: FAIL - `Cannot find module './media'`

- [ ] **Step 3: Write the implementation**

`src/lib/media.ts`:
```typescript
import { supabase } from './supabase'

export type MediaCategory = 'highlight' | 'room_single' | 'room_twin' | 'room_triple' | 'facility'

export type MediaItem = {
  id: string
  category: MediaCategory
  url: string
  caption: string | null
  sort_order: number
}

export async function fetchMedia(category?: MediaCategory): Promise<MediaItem[]> {
  let query = supabase.from('site_media').select('*')
  if (category) query = query.eq('category', category)
  const { data, error } = await query.order('sort_order')
  if (error) throw error
  return (data ?? []) as MediaItem[]
}

export async function uploadMedia(file: File, category: MediaCategory, caption?: string): Promise<void> {
  const path = `${category}/${file.name}`
  const { error: uploadError } = await supabase.storage.from('site-media').upload(path, file)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('site-media').getPublicUrl(path)

  const { error } = await supabase.from('site_media').insert({
    category,
    url: data.publicUrl,
    caption: caption ?? null,
  })
  if (error) throw error
}

export async function deleteMedia(id: string): Promise<void> {
  const { error } = await supabase.from('site_media').delete().eq('id', id)
  if (error) throw error
}

export async function reorderMedia(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('site_media').update({ sort_order: sortOrder }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/media.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/media.ts src/lib/media.test.ts
git commit -m "feat: add media data access module"
```

---

### Task 7: `lib/reviews.ts` - testimonial management

**Files:**
- Create: `src/lib/reviews.ts`
- Test: `src/lib/reviews.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type Review = { id: string; author_name: string; quote: string; display_order: number; is_published: boolean }
  export async function fetchReviews(): Promise<Review[]>
  export async function createReview(input: { authorName: string; quote: string }): Promise<void>
  export async function updateReview(id: string, input: { authorName?: string; quote?: string; isPublished?: boolean; displayOrder?: number }): Promise<void>
  export async function deleteReview(id: string): Promise<void>
  ```
  Consumed by `ReviewsManager` (Task 13). The public site reads published reviews via a fourth view - see Step 0.

- [ ] **Step 0: Public reviews view**

Append to the same `0020` migration (third and last view discovered in this review pass):
```sql
create view public.public_reviews as
  select id, author_name, quote from public.reviews
  where is_published = true
  order by display_order;

grant select on public.public_reviews to anon;
```
Apply and verify the same way as Task 5/6's Step 0.

- [ ] **Step 1: Write the failing test**

`src/lib/reviews.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockReviews = [
  { id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.', display_order: 0, is_published: true },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const deleteEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockReviews, error: null })) })),
      insert: insertMock,
      update: vi.fn(() => ({ eq: updateEqMock })),
      delete: vi.fn(() => ({ eq: deleteEqMock })),
    })),
  },
}))

describe('fetchReviews', () => {
  it('returns all reviews ordered by display_order', async () => {
    const { fetchReviews } = await import('./reviews')
    expect(await fetchReviews()).toEqual(mockReviews)
  })
})

describe('createReview', () => {
  it('inserts a review with the given fields', async () => {
    const { createReview } = await import('./reviews')
    await createReview({ authorName: 'Priya S.', quote: 'Felt like home.' })
    expect(insertMock).toHaveBeenCalledWith({ author_name: 'Priya S.', quote: 'Felt like home.' })
  })
})

describe('updateReview', () => {
  it('updates only the given fields', async () => {
    const { updateReview } = await import('./reviews')
    await updateReview('review-1', { isPublished: false })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'review-1')
  })
})

describe('deleteReview', () => {
  it('deletes the given review', async () => {
    const { deleteReview } = await import('./reviews')
    await deleteReview('review-1')
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'review-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reviews.test.ts`
Expected: FAIL - `Cannot find module './reviews'`

- [ ] **Step 3: Write the implementation**

`src/lib/reviews.ts`:
```typescript
import { supabase } from './supabase'

export type Review = {
  id: string
  author_name: string
  quote: string
  display_order: number
  is_published: boolean
}

export async function fetchReviews(): Promise<Review[]> {
  const { data, error } = await supabase.from('reviews').select('*').order('display_order')
  if (error) throw error
  return (data ?? []) as Review[]
}

export async function createReview(input: { authorName: string; quote: string }): Promise<void> {
  const { error } = await supabase.from('reviews').insert({ author_name: input.authorName, quote: input.quote })
  if (error) throw error
}

export async function updateReview(
  id: string,
  input: { authorName?: string; quote?: string; isPublished?: boolean; displayOrder?: number },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.authorName !== undefined) patch.author_name = input.authorName
  if (input.quote !== undefined) patch.quote = input.quote
  if (input.isPublished !== undefined) patch.is_published = input.isPublished
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder

  const { error } = await supabase.from('reviews').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reviews.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews.ts src/lib/reviews.test.ts
git commit -m "feat: add reviews data access module"
```

---

### Task 8: `lib/menu.ts` - weekly menu management

**Files:**
- Create: `src/lib/menu.ts`
- Test: `src/lib/menu.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type MealType = 'breakfast' | 'lunch' | 'dinner'
  export type MenuItem = { id: string; day_of_week: number; meal: MealType; description: string }
  export async function fetchMenuItems(): Promise<MenuItem[]>
  export async function upsertMenuItem(dayOfWeek: number, meal: MealType, description: string): Promise<void>
  ```
  Consumed by `MenuEditor` (Task 13). Public reads go through `public_weekly_menu` (Task 3) directly via `lib/publicSite.ts` (Task 11) - no separate public function needed here since that view was already anon-granted.

- [ ] **Step 1: Write the failing test**

`src/lib/menu.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockMenu = [
  { id: 'menu-1', day_of_week: 0, meal: 'breakfast', description: 'Poha' },
]

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockMenu, error: null })) })),
      upsert: upsertMock,
    })),
  },
}))

describe('fetchMenuItems', () => {
  it('returns all menu items', async () => {
    const { fetchMenuItems } = await import('./menu')
    expect(await fetchMenuItems()).toEqual(mockMenu)
  })
})

describe('upsertMenuItem', () => {
  it('upserts keyed on day_of_week and meal', async () => {
    const { upsertMenuItem } = await import('./menu')
    await upsertMenuItem(0, 'breakfast', 'Poha')
    expect(upsertMock).toHaveBeenCalledWith(
      { day_of_week: 0, meal: 'breakfast', description: 'Poha' },
      { onConflict: 'day_of_week,meal' },
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/menu.test.ts`
Expected: FAIL - `Cannot find module './menu'`

- [ ] **Step 3: Write the implementation**

`src/lib/menu.ts`:
```typescript
import { supabase } from './supabase'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type MenuItem = {
  id: string
  day_of_week: number
  meal: MealType
  description: string
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('menu_items').select('*').order('day_of_week')
  if (error) throw error
  return (data ?? []) as MenuItem[]
}

export async function upsertMenuItem(dayOfWeek: number, meal: MealType, description: string): Promise<void> {
  const { error } = await supabase
    .from('menu_items')
    .upsert({ day_of_week: dayOfWeek, meal, description }, { onConflict: 'day_of_week,meal' })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/menu.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu.ts src/lib/menu.test.ts
git commit -m "feat: add menu data access module"
```

---

### Task 9: `lib/inquiries.ts` - inquiry inbox

**Files:**
- Create: `src/lib/inquiries.ts`
- Test: `src/lib/inquiries.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type InquiryStatus = 'new' | 'contacted' | 'closed'
  export type Inquiry = { id: string; name: string; phone: string; message: string | null; status: InquiryStatus; created_at: string }
  export async function fetchInquiries(): Promise<Inquiry[]>
  export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<void>
  ```
  Consumed by `InquiriesInbox` (Task 14). The anonymous-facing `submitInquiry` lives in `lib/publicSite.ts` (Task 11), not here - this file is the admin-only read/update side.

- [ ] **Step 1: Write the failing test**

`src/lib/inquiries.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockInquiries = [
  { id: 'inq-1', name: 'Anita', phone: '9800000002', message: 'Any singles available?', status: 'new', created_at: '2026-07-01T00:00:00Z' },
]

const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockInquiries, error: null })) })),
      update: vi.fn(() => ({ eq: updateEqMock })),
    })),
  },
}))

describe('fetchInquiries', () => {
  it('returns all inquiries newest first', async () => {
    const { fetchInquiries } = await import('./inquiries')
    expect(await fetchInquiries()).toEqual(mockInquiries)
  })
})

describe('updateInquiryStatus', () => {
  it('updates the given inquiry to the given status', async () => {
    const { updateInquiryStatus } = await import('./inquiries')
    await updateInquiryStatus('inq-1', 'contacted')
    expect(updateEqMock).toHaveBeenCalledWith('id', 'inq-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/inquiries.test.ts`
Expected: FAIL - `Cannot find module './inquiries'`

- [ ] **Step 3: Write the implementation**

`src/lib/inquiries.ts`:
```typescript
import { supabase } from './supabase'

export type InquiryStatus = 'new' | 'contacted' | 'closed'

export type Inquiry = {
  id: string
  name: string
  phone: string
  message: string | null
  status: InquiryStatus
  created_at: string
}

export async function fetchInquiries(): Promise<Inquiry[]> {
  const { data, error } = await supabase.from('inquiries').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Inquiry[]
}

export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
  const { error } = await supabase.from('inquiries').update({ status }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/inquiries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/inquiries.ts src/lib/inquiries.test.ts
git commit -m "feat: add inquiries data access module"
```

---

### Task 10: `lib/bookings.ts` - reservation queue

**Files:**
- Create: `src/lib/bookings.ts`
- Test: `src/lib/bookings.test.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  ```typescript
  export type BookingStatus = 'pending' | 'approved' | 'declined'
  export type Booking = { id: string; name: string; phone: string; guardian_phone: string; room_type: 'single' | 'twin' | 'triple'; preferred_date: string; status: BookingStatus; reserved_bed_id: string | null; created_at: string }
  export async function fetchPendingBookings(): Promise<Booking[]>
  export async function approveBooking(bookingId: string, bedId: string): Promise<void>
  export async function declineBooking(bookingId: string): Promise<void>
  ```
  Consumed by `BookingsQueue` (Task 14). `approveBooking` calls the `approve_booking` RPC (Task 4).

- [ ] **Step 1: Write the failing test**

`src/lib/bookings.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockBookings = [
  { id: 'booking-1', name: 'Sita', phone: '9800000003', guardian_phone: '9800000004', room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-01T00:00:00Z' },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: mockBookings, error: null })) })),
      update: vi.fn(() => ({ eq: updateEqMock })),
    })),
    rpc: rpcMock,
  },
}))

describe('fetchPendingBookings', () => {
  it('returns only pending bookings', async () => {
    const { fetchPendingBookings } = await import('./bookings')
    expect(await fetchPendingBookings()).toEqual(mockBookings)
  })
})

describe('approveBooking', () => {
  it('calls the approve_booking RPC with the booking and bed ids', async () => {
    const { approveBooking } = await import('./bookings')
    await approveBooking('booking-1', 'bed-5')
    expect(rpcMock).toHaveBeenCalledWith('approve_booking', { p_booking_id: 'booking-1', p_bed_id: 'bed-5' })
  })
})

describe('declineBooking', () => {
  it('updates the booking to declined', async () => {
    const { declineBooking } = await import('./bookings')
    await declineBooking('booking-1')
    expect(updateEqMock).toHaveBeenCalledWith('id', 'booking-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookings.test.ts`
Expected: FAIL - `Cannot find module './bookings'`

- [ ] **Step 3: Write the implementation**

`src/lib/bookings.ts`:
```typescript
import { supabase } from './supabase'

export type BookingStatus = 'pending' | 'approved' | 'declined'

export type Booking = {
  id: string
  name: string
  phone: string
  guardian_phone: string
  room_type: 'single' | 'twin' | 'triple'
  preferred_date: string
  status: BookingStatus
  reserved_bed_id: string | null
  created_at: string
}

export async function fetchPendingBookings(): Promise<Booking[]> {
  const { data, error } = await supabase.from('bookings').select('*').eq('status', 'pending')
  if (error) throw error
  return (data ?? []) as Booking[]
}

export async function approveBooking(bookingId: string, bedId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_booking', { p_booking_id: bookingId, p_bed_id: bedId })
  if (error) throw error
}

export async function declineBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.from('bookings').update({ status: 'declined' }).eq('id', bookingId)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bookings.ts src/lib/bookings.test.ts
git commit -m "feat: add bookings data access module"
```

---

### Task 11: `lib/publicSite.ts` - the entire anonymous-facing data layer

**Files:**
- Create: `src/lib/publicSite.ts`
- Test: `src/lib/publicSite.test.ts`

**Interfaces:**
- Consumes: `supabase` (the four public views from Tasks 3/5/6/7, and `inquiries`/`bookings` insert policies from Task 2).
- Produces:
  ```typescript
  export type PublicRoomAvailability = { room_type: 'single' | 'twin' | 'triple'; monthly_price: number; beds_available: number }
  export type PublicMenuItem = { day_of_week: number; meal: 'breakfast' | 'lunch' | 'dinner'; description: string }
  export type PublicNotice = { id: string; title: string; body: string; created_at: string }
  export type PublicMediaItem = { id: string; category: string; url: string; caption: string | null }
  export type PublicReview = { id: string; author_name: string; quote: string }
  export async function fetchPublicRoomAvailability(): Promise<PublicRoomAvailability[]>
  export async function fetchPublicWeeklyMenu(): Promise<PublicMenuItem[]>
  export async function fetchPublicNotices(): Promise<PublicNotice[]>
  export async function fetchPublicSiteContent(): Promise<Record<string, unknown>>
  export async function fetchPublicMedia(category?: string): Promise<PublicMediaItem[]>
  export async function fetchPublicReviews(): Promise<PublicReview[]>
  export async function submitInquiry(input: { name: string; phone: string; message?: string }): Promise<void>
  export async function submitBooking(input: { name: string; phone: string; guardianPhone: string; roomType: 'single' | 'twin' | 'triple'; preferredDate: string }): Promise<void>
  ```
  This is the ONLY module the public routes (Task 16) import from `lib/` for data - it's the single seam between the public site and Supabase, deliberately kept in one file so the "does the public site ever touch a private table" question has one file to audit, not eight.

- [ ] **Step 1: Write the failing test**

`src/lib/publicSite.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

const mockAvailability = [{ room_type: 'twin', monthly_price: 12000, beds_available: 2 }]
const mockMenu = [{ day_of_week: 0, meal: 'breakfast', description: 'Poha' }]
const mockNotices = [{ id: 'notice-1', title: 'Holiday', body: 'Closed Dec 25', created_at: '2026-07-01T00:00:00Z' }]
const mockContent = [{ key: 'hero', value: { headline: 'Home away from home' } }]
const mockMedia = [{ id: 'media-1', category: 'highlight', url: 'https://x/a.jpg', caption: null }]
const mockReviews = [{ id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.' }]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const responses: Record<string, unknown> = {
        public_room_availability: mockAvailability,
        public_weekly_menu: mockMenu,
        public_notices: mockNotices,
        public_site_content: mockContent,
        public_site_media: mockMedia,
        public_reviews: mockReviews,
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: responses[table], error: null })),
        insert: insertMock,
      }
    }),
  },
}))

describe('fetchPublicRoomAvailability', () => {
  it('returns availability rows', async () => {
    const { fetchPublicRoomAvailability } = await import('./publicSite')
    expect(await fetchPublicRoomAvailability()).toEqual(mockAvailability)
  })
})

describe('fetchPublicWeeklyMenu', () => {
  it('returns menu rows', async () => {
    const { fetchPublicWeeklyMenu } = await import('./publicSite')
    expect(await fetchPublicWeeklyMenu()).toEqual(mockMenu)
  })
})

describe('fetchPublicNotices', () => {
  it('returns notice rows', async () => {
    const { fetchPublicNotices } = await import('./publicSite')
    expect(await fetchPublicNotices()).toEqual(mockNotices)
  })
})

describe('fetchPublicSiteContent', () => {
  it('returns a key-to-value map', async () => {
    const { fetchPublicSiteContent } = await import('./publicSite')
    expect(await fetchPublicSiteContent()).toEqual({ hero: { headline: 'Home away from home' } })
  })
})

describe('fetchPublicMedia', () => {
  it('returns media rows', async () => {
    const { fetchPublicMedia } = await import('./publicSite')
    expect(await fetchPublicMedia()).toEqual(mockMedia)
  })
})

describe('fetchPublicReviews', () => {
  it('returns review rows', async () => {
    const { fetchPublicReviews } = await import('./publicSite')
    expect(await fetchPublicReviews()).toEqual(mockReviews)
  })
})

describe('submitInquiry', () => {
  it('inserts an inquiry with the given fields', async () => {
    const { submitInquiry } = await import('./publicSite')
    await submitInquiry({ name: 'Anita', phone: '9800000002', message: 'Any singles?' })
    expect(insertMock).toHaveBeenCalledWith({ name: 'Anita', phone: '9800000002', message: 'Any singles?' })
  })
})

describe('submitBooking', () => {
  it('inserts a booking with the given fields', async () => {
    const { submitBooking } = await import('./publicSite')
    await submitBooking({ name: 'Sita', phone: '9800000003', guardianPhone: '9800000004', roomType: 'twin', preferredDate: '2026-08-01' })
    expect(insertMock).toHaveBeenCalledWith({
      name: 'Sita',
      phone: '9800000003',
      guardian_phone: '9800000004',
      room_type: 'twin',
      preferred_date: '2026-08-01',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publicSite.test.ts`
Expected: FAIL - `Cannot find module './publicSite'`

- [ ] **Step 3: Write the implementation**

`src/lib/publicSite.ts`:
```typescript
import { supabase } from './supabase'

export type PublicRoomAvailability = {
  room_type: 'single' | 'twin' | 'triple'
  monthly_price: number
  beds_available: number
}

export type PublicMenuItem = {
  day_of_week: number
  meal: 'breakfast' | 'lunch' | 'dinner'
  description: string
}

export type PublicNotice = {
  id: string
  title: string
  body: string
  created_at: string
}

export type PublicMediaItem = {
  id: string
  category: string
  url: string
  caption: string | null
}

export type PublicReview = {
  id: string
  author_name: string
  quote: string
}

export async function fetchPublicRoomAvailability(): Promise<PublicRoomAvailability[]> {
  const { data, error } = await supabase.from('public_room_availability').select('*')
  if (error) throw error
  return (data ?? []) as PublicRoomAvailability[]
}

export async function fetchPublicWeeklyMenu(): Promise<PublicMenuItem[]> {
  const { data, error } = await supabase.from('public_weekly_menu').select('*')
  if (error) throw error
  return (data ?? []) as PublicMenuItem[]
}

export async function fetchPublicNotices(): Promise<PublicNotice[]> {
  const { data, error } = await supabase.from('public_notices').select('*')
  if (error) throw error
  return (data ?? []) as PublicNotice[]
}

export async function fetchPublicSiteContent(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('public_site_content').select('*')
  if (error) throw error
  const map: Record<string, unknown> = {}
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    map[row.key] = row.value
  }
  return map
}

export async function fetchPublicMedia(category?: string): Promise<PublicMediaItem[]> {
  const { data, error } = await supabase.from('public_site_media').select('*')
  if (error) throw error
  const items = (data ?? []) as PublicMediaItem[]
  return category ? items.filter((item) => item.category === category) : items
}

export async function fetchPublicReviews(): Promise<PublicReview[]> {
  const { data, error } = await supabase.from('public_reviews').select('*')
  if (error) throw error
  return (data ?? []) as PublicReview[]
}

export async function submitInquiry(input: { name: string; phone: string; message?: string }): Promise<void> {
  const { error } = await supabase.from('inquiries').insert({
    name: input.name,
    phone: input.phone,
    message: input.message ?? null,
  })
  if (error) throw error
}

export async function submitBooking(input: {
  name: string
  phone: string
  guardianPhone: string
  roomType: 'single' | 'twin' | 'triple'
  preferredDate: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    name: input.name,
    phone: input.phone,
    guardian_phone: input.guardianPhone,
    room_type: input.roomType,
    preferred_date: input.preferredDate,
  })
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publicSite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicSite.ts src/lib/publicSite.test.ts
git commit -m "feat: add publicSite data access module - the sole seam between the public site and Supabase"
```

---

### Task 12: `SiteContentForm` + `MediaGalleryManager` components

**Files:**
- Create: `src/components/admin/SiteContentForm.tsx`, `src/components/admin/SiteContentForm.test.tsx`
- Create: `src/components/admin/MediaGalleryManager.tsx`, `src/components/admin/MediaGalleryManager.test.tsx`

**Interfaces:**
- Consumes: `fetchSiteContent`, `updateSiteContent` (Task 5); `fetchMedia`, `uploadMedia`, `deleteMedia` (Task 6).
- Produces: `export function SiteContentForm({ content, onSaved }: { content: Record<string, unknown>; onSaved: () => void })`; `export function MediaGalleryManager({ category, items, onChanged }: { category: MediaCategory; items: MediaItem[]; onChanged: () => void })` - both consumed by the `/site-content` admin route (Task 15).

- [ ] **Step 1: Write the failing tests**

`src/components/admin/SiteContentForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteContentForm } from './SiteContentForm'

const updateSiteContent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/siteContent', () => ({
  updateSiteContent: (...args: unknown[]) => updateSiteContent(...args),
}))

const content = {
  hero: { headline: 'Home away from home', subhead: 'Safe, comfortable living' },
  about: { text: 'Aabha Girls Hostel...' },
}

describe('SiteContentForm', () => {
  it('prefills fields from content and saves an edited hero headline', async () => {
    const onSaved = vi.fn()
    render(<SiteContentForm content={content} onSaved={onSaved} />)

    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('Home away from home')

    fireEvent.change(screen.getByLabelText(/hero headline/i), { target: { value: 'New headline' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(updateSiteContent).toHaveBeenCalledWith('hero', { headline: 'New headline', subhead: 'Safe, comfortable living' }),
    )
    expect(onSaved).toHaveBeenCalled()
  })
})
```

`src/components/admin/MediaGalleryManager.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MediaGalleryManager } from './MediaGalleryManager'
import type { MediaItem } from '../../lib/media'

const uploadMedia = vi.fn().mockResolvedValue(undefined)
const deleteMedia = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/media', () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
  deleteMedia: (...args: unknown[]) => deleteMedia(...args),
}))

const items: MediaItem[] = [
  { id: 'media-1', category: 'highlight', url: 'https://x/a.jpg', caption: 'Common room', sort_order: 0 },
]

describe('MediaGalleryManager', () => {
  it('renders existing items and deletes one on click', async () => {
    const onChanged = vi.fn()
    render(<MediaGalleryManager category="highlight" items={items} onChanged={onChanged} />)

    expect(screen.getByText('Common room')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteMedia).toHaveBeenCalledWith('media-1'))
    expect(onChanged).toHaveBeenCalled()
  })

  it('uploads a selected file for the given category', async () => {
    const onChanged = vi.fn()
    render(<MediaGalleryManager category="highlight" items={[]} onChanged={onChanged} />)

    const file = new File(['x'], 'b.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/upload photo/i), { target: { files: [file] } })

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledWith(file, 'highlight', undefined))
    expect(onChanged).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/admin/SiteContentForm.test.tsx src/components/admin/MediaGalleryManager.test.tsx`
Expected: FAIL - modules not found

- [ ] **Step 3: Write the implementations**

`src/components/admin/SiteContentForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { updateSiteContent } from '../../lib/siteContent'

type HeroContent = { headline: string; subhead: string }
type AboutContent = { text: string }

export function SiteContentForm({
  content,
  onSaved,
}: {
  content: Record<string, unknown>
  onSaved: () => void
}) {
  const hero = (content.hero as HeroContent) ?? { headline: '', subhead: '' }
  const about = (content.about as AboutContent) ?? { text: '' }

  const [heroHeadline, setHeroHeadline] = useState(hero.headline)
  const [heroSubhead, setHeroSubhead] = useState(hero.subhead)
  const [aboutText, setAboutText] = useState(about.text)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await updateSiteContent('hero', { headline: heroHeadline, subhead: heroSubhead })
      await updateSiteContent('about', { text: aboutText })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save content')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="heroHeadline" className="block text-sm font-medium text-on-surface-variant">Hero Headline</label>
        <input
          id="heroHeadline"
          value={heroHeadline}
          onChange={(e) => setHeroHeadline(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="heroSubhead" className="block text-sm font-medium text-on-surface-variant">Hero Subhead</label>
        <input
          id="heroSubhead"
          value={heroSubhead}
          onChange={(e) => setHeroSubhead(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="aboutText" className="block text-sm font-medium text-on-surface-variant">About</label>
        <textarea
          id="aboutText"
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Save
      </button>
    </form>
  )
}
```

`src/components/admin/MediaGalleryManager.tsx`:
```tsx
import { useState, type ChangeEvent } from 'react'
import { uploadMedia, deleteMedia, type MediaCategory, type MediaItem } from '../../lib/media'

export function MediaGalleryManager({
  category,
  items,
  onChanged,
}: {
  category: MediaCategory
  items: MediaItem[]
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await uploadMedia(file, category)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteMedia(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`upload-${category}`} className="block text-sm font-medium text-on-surface-variant">
          Upload Photo
        </label>
        <input id={`upload-${category}`} type="file" accept="image/*" onChange={handleUpload} />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.id} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
            <img src={item.url} alt={item.caption ?? ''} className="w-full h-32 object-cover" />
            <div className="p-3 space-y-2">
              {item.caption && <p className="text-xs text-on-surface-variant">{item.caption}</p>}
              <button onClick={() => handleDelete(item.id)} className="text-error text-xs font-medium hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/SiteContentForm.test.tsx src/components/admin/MediaGalleryManager.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SiteContentForm.tsx src/components/admin/SiteContentForm.test.tsx src/components/admin/MediaGalleryManager.tsx src/components/admin/MediaGalleryManager.test.tsx
git commit -m "feat: add SiteContentForm and MediaGalleryManager admin components"
```

---

### Task 13: `ReviewsManager` + `MenuEditor` components

**Files:**
- Create: `src/components/admin/ReviewsManager.tsx`, `src/components/admin/ReviewsManager.test.tsx`
- Create: `src/components/admin/MenuEditor.tsx`, `src/components/admin/MenuEditor.test.tsx`

**Interfaces:**
- Consumes: `fetchReviews`, `createReview`, `updateReview`, `deleteReview` (Task 7); `fetchMenuItems`, `upsertMenuItem` (Task 8).
- Produces: `export function ReviewsManager({ reviews, onChanged }: { reviews: Review[]; onChanged: () => void })`; `export function MenuEditor({ items, onChanged }: { items: MenuItem[]; onChanged: () => void })` - both consumed by `/site-content` (Task 15).

- [ ] **Step 1: Write the failing tests**

`src/components/admin/ReviewsManager.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewsManager } from './ReviewsManager'
import type { Review } from '../../lib/reviews'

const createReview = vi.fn().mockResolvedValue(undefined)
const deleteReview = vi.fn().mockResolvedValue(undefined)
const updateReview = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/reviews', () => ({
  createReview: (...args: unknown[]) => createReview(...args),
  deleteReview: (...args: unknown[]) => deleteReview(...args),
  updateReview: (...args: unknown[]) => updateReview(...args),
}))

const reviews: Review[] = [
  { id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.', display_order: 0, is_published: true },
]

describe('ReviewsManager', () => {
  it('renders existing reviews and adds a new one', async () => {
    const onChanged = vi.fn()
    render(<ReviewsManager reviews={reviews} onChanged={onChanged} />)

    expect(screen.getByText('Felt like home.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'Sita N.' } })
    fireEvent.change(screen.getByLabelText(/quote/i), { target: { value: 'Great mess food.' } })
    fireEvent.click(screen.getByRole('button', { name: /add review/i }))

    await waitFor(() => expect(createReview).toHaveBeenCalledWith({ authorName: 'Sita N.', quote: 'Great mess food.' }))
    expect(onChanged).toHaveBeenCalled()
  })

  it('deletes a review on click', async () => {
    const onChanged = vi.fn()
    render(<ReviewsManager reviews={reviews} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith('review-1'))
    expect(onChanged).toHaveBeenCalled()
  })
})
```

`src/components/admin/MenuEditor.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuEditor } from './MenuEditor'
import type { MenuItem } from '../../lib/menu'

const upsertMenuItem = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/menu', () => ({
  upsertMenuItem: (...args: unknown[]) => upsertMenuItem(...args),
}))

const items: MenuItem[] = [
  { id: 'menu-1', day_of_week: 0, meal: 'breakfast', description: 'Poha' },
]

describe('MenuEditor', () => {
  it('prefills an existing cell and saves an edit', async () => {
    const onChanged = vi.fn()
    render(<MenuEditor items={items} onChanged={onChanged} />)

    const cell = screen.getByLabelText(/sunday breakfast/i)
    expect(cell).toHaveValue('Poha')

    fireEvent.change(cell, { target: { value: 'Aloo paratha' } })
    fireEvent.blur(cell)

    await waitFor(() => expect(upsertMenuItem).toHaveBeenCalledWith(0, 'breakfast', 'Aloo paratha'))
    expect(onChanged).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/admin/ReviewsManager.test.tsx src/components/admin/MenuEditor.test.tsx`
Expected: FAIL - modules not found

- [ ] **Step 3: Write the implementations**

`src/components/admin/ReviewsManager.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { createReview, deleteReview, type Review } from '../../lib/reviews'

export function ReviewsManager({ reviews, onChanged }: { reviews: Review[]; onChanged: () => void }) {
  const [authorName, setAuthorName] = useState('')
  const [quote, setQuote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createReview({ authorName, quote })
      setAuthorName('')
      setQuote('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add review')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteReview(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete review')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex justify-between items-start gap-4">
            <div>
              <p className="text-on-surface">{review.quote}</p>
              <p className="text-on-surface-variant text-sm mt-1">- {review.author_name}</p>
            </div>
            <button onClick={() => handleDelete(review.id)} className="text-error text-sm font-medium hover:underline flex-shrink-0">
              Delete
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <div className="space-y-2">
          <label htmlFor="reviewAuthor" className="block text-sm font-medium text-on-surface-variant">Author</label>
          <input id="reviewAuthor" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="reviewQuote" className="block text-sm font-medium text-on-surface-variant">Quote</label>
          <textarea id="reviewQuote" value={quote} onChange={(e) => setQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
        </div>
        {error && <p className="text-error text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
          Add Review
        </button>
      </form>
    </div>
  )
}
```

`src/components/admin/MenuEditor.tsx`:
```tsx
import { useState } from 'react'
import { upsertMenuItem, type MealType, type MenuItem } from '../../lib/menu'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner']

export function MenuEditor({ items, onChanged }: { items: MenuItem[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)

  function descriptionFor(dayOfWeek: number, meal: MealType): string {
    return items.find((item) => item.day_of_week === dayOfWeek && item.meal === meal)?.description ?? ''
  }

  async function handleSave(dayOfWeek: number, meal: MealType, description: string) {
    setError(null)
    try {
      await upsertMenuItem(dayOfWeek, meal, description)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save menu item')
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Day</th>
              {MEALS.map((meal) => (
                <th key={meal} className="px-6 py-4 capitalize">{meal}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {DAYS.map((dayName, dayOfWeek) => (
              <tr key={dayName}>
                <td className="px-6 py-4 font-medium text-on-surface">{dayName}</td>
                {MEALS.map((meal) => (
                  <td key={meal} className="px-6 py-4">
                    <input
                      aria-label={`${dayName} ${meal}`}
                      defaultValue={descriptionFor(dayOfWeek, meal)}
                      onBlur={(e) => handleSave(dayOfWeek, meal, e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/ReviewsManager.test.tsx src/components/admin/MenuEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ReviewsManager.tsx src/components/admin/ReviewsManager.test.tsx src/components/admin/MenuEditor.tsx src/components/admin/MenuEditor.test.tsx
git commit -m "feat: add ReviewsManager and MenuEditor admin components"
```

---

### Task 14: `InquiriesInbox` + `BookingsQueue` components

**Files:**
- Create: `src/components/admin/InquiriesInbox.tsx`, `src/components/admin/InquiriesInbox.test.tsx`
- Create: `src/components/admin/BookingsQueue.tsx`, `src/components/admin/BookingsQueue.test.tsx`

**Interfaces:**
- Consumes: `fetchInquiries`, `updateInquiryStatus`, `type Inquiry` (Task 9); `approveBooking`, `declineBooking`, `type Booking` (Task 10); `type Bed` (`src/lib/rooms.ts`, Stage 2).
- Produces: `export function InquiriesInbox({ inquiries, onChanged }: { inquiries: Inquiry[]; onChanged: () => void })`; `export function BookingsQueue({ bookings, vacantBedsByType, onDecided }: { bookings: Booking[]; vacantBedsByType: (roomType: Booking['room_type']) => Bed[]; onDecided: () => void })` - both consumed by `/site-content` (Task 15). `BookingsQueue` mirrors `TransferRequestsQueue`'s per-row bed-picker shape exactly (same codebase, same pattern, same reason: the approving action needs a live vacant-bed choice at decision time).

- [ ] **Step 1: Write the failing tests**

`src/components/admin/InquiriesInbox.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InquiriesInbox } from './InquiriesInbox'
import type { Inquiry } from '../../lib/inquiries'

const updateInquiryStatus = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/inquiries', () => ({
  updateInquiryStatus: (...args: unknown[]) => updateInquiryStatus(...args),
}))

const inquiries: Inquiry[] = [
  { id: 'inq-1', name: 'Anita', phone: '9800000002', message: 'Any singles?', status: 'new', created_at: '2026-07-01T00:00:00Z' },
]

describe('InquiriesInbox', () => {
  it('renders inquiries and updates status on selection', async () => {
    const onChanged = vi.fn()
    render(<InquiriesInbox inquiries={inquiries} onChanged={onChanged} />)

    expect(screen.getByText('Anita')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/status for anita/i), { target: { value: 'contacted' } })

    await waitFor(() => expect(updateInquiryStatus).toHaveBeenCalledWith('inq-1', 'contacted'))
    expect(onChanged).toHaveBeenCalled()
  })
})
```

`src/components/admin/BookingsQueue.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookingsQueue } from './BookingsQueue'
import type { Booking } from '../../lib/bookings'
import type { Bed } from '../../lib/rooms'

const approveBooking = vi.fn().mockResolvedValue(undefined)
const declineBooking = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/bookings', () => ({
  approveBooking: (...args: unknown[]) => approveBooking(...args),
  declineBooking: (...args: unknown[]) => declineBooking(...args),
}))

const bookings: Booking[] = [
  { id: 'booking-1', name: 'Sita', phone: '9800000003', guardian_phone: '9800000004', room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-01T00:00:00Z' },
]

const vacantBeds: Bed[] = [{ id: 'bed-5', room_id: 'room-2', bed_label: 'B', status: 'vacant' }]

describe('BookingsQueue', () => {
  it('approves a booking with the selected bed', async () => {
    const onDecided = vi.fn()
    render(<BookingsQueue bookings={bookings} vacantBedsByType={() => vacantBeds} onDecided={onDecided} />)

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(approveBooking).toHaveBeenCalledWith('booking-1', 'bed-5'))
    expect(onDecided).toHaveBeenCalled()
  })

  it('declines a booking', async () => {
    const onDecided = vi.fn()
    render(<BookingsQueue bookings={bookings} vacantBedsByType={() => vacantBeds} onDecided={onDecided} />)

    fireEvent.click(screen.getByRole('button', { name: /decline/i }))

    await waitFor(() => expect(declineBooking).toHaveBeenCalledWith('booking-1'))
    expect(onDecided).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/admin/InquiriesInbox.test.tsx src/components/admin/BookingsQueue.test.tsx`
Expected: FAIL - modules not found

- [ ] **Step 3: Write the implementations**

`src/components/admin/InquiriesInbox.tsx`:
```tsx
import { updateInquiryStatus, type Inquiry, type InquiryStatus } from '../../lib/inquiries'

export function InquiriesInbox({ inquiries, onChanged }: { inquiries: Inquiry[]; onChanged: () => void }) {
  async function handleStatusChange(id: string, status: InquiryStatus) {
    await updateInquiryStatus(id, status)
    onChanged()
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Phone</th>
            <th className="px-8 py-4">Message</th>
            <th className="px-8 py-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {inquiries.map((inquiry) => (
            <tr key={inquiry.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{inquiry.name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{inquiry.phone}</td>
              <td className="px-8 py-5 text-on-surface-variant">{inquiry.message}</td>
              <td className="px-8 py-5">
                <select
                  aria-label={`Status for ${inquiry.name}`}
                  value={inquiry.status}
                  onChange={(e) => handleStatusChange(inquiry.id, e.target.value as InquiryStatus)}
                  className="bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="closed">Closed</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`src/components/admin/BookingsQueue.tsx`:
```tsx
import { useState } from 'react'
import { approveBooking, declineBooking, type Booking } from '../../lib/bookings'
import type { Bed } from '../../lib/rooms'

function BookingRow({
  booking,
  vacantBeds,
  onDecided,
}: {
  booking: Booking
  vacantBeds: Bed[]
  onDecided: () => void
}) {
  const [selectedBedId, setSelectedBedId] = useState(vacantBeds[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    try {
      await approveBooking(booking.id, selectedBedId)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function handleDecline() {
    setError(null)
    try {
      await declineBooking(booking.id)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decline failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
      <div>
        <p className="font-medium text-on-surface">{booking.name}</p>
        <p className="text-on-surface-variant text-sm">{booking.phone} - Guardian: {booking.guardian_phone}</p>
        <p className="text-xs uppercase tracking-wider text-secondary mt-1">
          {booking.room_type} - Preferred {booking.preferred_date}
        </p>
      </div>
      {vacantBeds.length > 0 && (
        <div className="space-y-2">
          <label htmlFor={`bed-${booking.id}`} className="block text-sm font-medium text-on-surface-variant">Assign Bed</label>
          <select
            id={`bed-${booking.id}`}
            value={selectedBedId}
            onChange={(e) => setSelectedBedId(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
          >
            {vacantBeds.map((bed) => (
              <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={vacantBeds.length === 0}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform disabled:opacity-50"
        >
          Approve
        </button>
        <button onClick={handleDecline} className="border border-error text-error px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Decline
        </button>
      </div>
    </div>
  )
}

export function BookingsQueue({
  bookings,
  vacantBedsByType,
  onDecided,
}: {
  bookings: Booking[]
  vacantBedsByType: (roomType: Booking['room_type']) => Bed[]
  onDecided: () => void
}) {
  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          vacantBeds={vacantBedsByType(booking.room_type)}
          onDecided={onDecided}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/InquiriesInbox.test.tsx src/components/admin/BookingsQueue.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/InquiriesInbox.tsx src/components/admin/InquiriesInbox.test.tsx src/components/admin/BookingsQueue.tsx src/components/admin/BookingsQueue.test.tsx
git commit -m "feat: add InquiriesInbox and BookingsQueue admin components"
```

---

### Task 15: `/site-content` admin route + nav item

**Files:**
- Modify: `src/lib/nav.ts`, `src/lib/nav.test.ts`
- Create: `src/routes/_authenticated.site-content.tsx`

**Interfaces:**
- Consumes: everything from Tasks 5-14, plus `fetchRoomsWithBeds` (Stage 2 `rooms.ts`), `useAuth` (Stage 1).
- Produces: owner nav gains "Site Content" (warden does not - marketing copy is owner-only, per the spec). New route.

- [ ] **Step 1: Update the nav test**

In `src/lib/nav.test.ts`, extend the owner test case and add an explicit "warden does not" assertion:
```typescript
it('gives owner the full nav including financial config, rooms, residents, fees, requests, and site content', () => {
  const items = getNavItemsForRole('owner').map((i) => i.label)
  expect(items).toContain('Dashboard')
  expect(items).toContain('Financial Settings')
  expect(items).toContain('Rooms')
  expect(items).toContain('Residents')
  expect(items).toContain('Fees')
  expect(items).toContain('Requests')
  expect(items).toContain('Site Content')
})

it('gives warden operational nav (rooms, residents, fees, requests) but not financial config or site content', () => {
  const items = getNavItemsForRole('warden').map((i) => i.label)
  expect(items).toContain('Dashboard')
  expect(items).toContain('Rooms')
  expect(items).toContain('Residents')
  expect(items).toContain('Fees')
  expect(items).toContain('Requests')
  expect(items).not.toContain('Financial Settings')
  expect(items).not.toContain('Site Content')
})
```
(Replace the existing owner/warden tests from Stage 4 with these.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL - "Site Content" missing from owner's nav.

- [ ] **Step 3: Update `getNavItemsForRole`**

In `src/lib/nav.ts`, add:
```typescript
const SITE_CONTENT: NavItem = { label: 'Site Content', path: '/site-content' }
```
And change the `owner` case only:
```typescript
    case 'owner':
      return [DASHBOARD, ROOMS, RESIDENTS, FEES, REQUESTS, FINANCIAL_SETTINGS, SITE_CONTENT]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Add the route**

`src/routes/_authenticated.site-content.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchSiteContent } from '../lib/siteContent'
import { fetchMedia, type MediaItem } from '../lib/media'
import { fetchReviews, type Review } from '../lib/reviews'
import { fetchMenuItems, type MenuItem } from '../lib/menu'
import { fetchInquiries, type Inquiry } from '../lib/inquiries'
import { fetchPendingBookings, type Booking } from '../lib/bookings'
import { fetchRoomsWithBeds, type Room, type Bed } from '../lib/rooms'
import { SiteContentForm } from '../components/admin/SiteContentForm'
import { MediaGalleryManager } from '../components/admin/MediaGalleryManager'
import { ReviewsManager } from '../components/admin/ReviewsManager'
import { MenuEditor } from '../components/admin/MenuEditor'
import { InquiriesInbox } from '../components/admin/InquiriesInbox'
import { BookingsQueue } from '../components/admin/BookingsQueue'

const MEDIA_CATEGORIES = ['highlight', 'room_single', 'room_twin', 'room_triple', 'facility'] as const

function SiteContentPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [media, setMedia] = useState<MediaItem[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  function refetchAll() {
    fetchSiteContent().then(setContent)
    fetchMedia().then(setMedia)
    fetchReviews().then(setReviews)
    fetchMenuItems().then(setMenuItems)
    fetchInquiries().then(setInquiries)
    fetchPendingBookings().then(setBookings)
    fetchRoomsWithBeds().then(setRooms)
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function vacantBedsByType(roomType: Booking['room_type']): Bed[] {
    return rooms
      .filter((r) => r.room_type === roomType)
      .flatMap((r) => r.beds)
      .filter((b) => b.status === 'vacant')
  }

  return (
    <div className="space-y-12">
      <h2 className="font-display text-2xl text-on-surface">Site Content</h2>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Copy</h3>
        <SiteContentForm content={content} onSaved={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Photos</h3>
        {MEDIA_CATEGORIES.map((category) => (
          <div key={category} className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-secondary">{category.replace('_', ' ')}</p>
            <MediaGalleryManager
              category={category}
              items={media.filter((m) => m.category === category)}
              onChanged={refetchAll}
            />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Reviews</h3>
        <ReviewsManager reviews={reviews} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Weekly Menu</h3>
        <MenuEditor items={menuItems} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Inquiries</h3>
        <InquiriesInbox inquiries={inquiries} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Bookings</h3>
        <BookingsQueue bookings={bookings} vacantBedsByType={vacantBedsByType} onDecided={refetchAll} />
      </section>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/site-content')({
  component: SiteContentPage,
})
```

Run `npm run dev` once to let the TanStack Router Vite plugin regenerate `src/routeTree.gen.ts` with the new route, then stop the dev server.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add /site-content admin page and Site Content nav item"
```

---

### Task 16: Public site skeleton

**Files:**
- Create: `src/components/public/PublicShell.tsx`, `src/components/public/PublicShell.test.tsx`
- Create: `src/routes/index.tsx`, `src/routes/rooms.tsx`, `src/routes/life.tsx`, `src/routes/about.tsx`, `src/routes/contact.tsx`

**Interfaces:**
- Consumes: every function in `lib/publicSite.ts` (Task 11).
- Produces: five public routes, no auth required, using `PublicShell` for shared nav (Home / Rooms / Life at Aabha / About / Contact). This task builds a **functional, unstyled-beyond-existing-tokens** skeleton - proving every read and write wire is correct end-to-end. Matching the Stitch screens exactly is deferred follow-up work once they're pasted in, not part of this task's acceptance bar.

- [ ] **Step 1: Write the failing test**

`src/components/public/PublicShell.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicShell } from './PublicShell'

describe('PublicShell', () => {
  it('renders nav links to every public page and the children', () => {
    render(
      <PublicShell>
        <p>Page content</p>
      </PublicShell>,
    )
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /rooms/i })).toHaveAttribute('href', '/rooms')
    expect(screen.getByRole('link', { name: /life at aabha/i })).toHaveAttribute('href', '/life')
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('href', '/contact')
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/public/PublicShell.test.tsx`
Expected: FAIL - `Cannot find module './PublicShell'`

- [ ] **Step 3: Write `PublicShell`**

`src/components/public/PublicShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="flex gap-6 px-gutter py-6 border-b border-outline-variant">
        <Link to="/" className="font-display text-lg text-primary">Aabha Girls Hostel</Link>
        <div className="flex gap-6 ml-auto text-on-surface-variant">
          <Link to="/">Home</Link>
          <Link to="/rooms">Rooms</Link>
          <Link to="/life">Life at Aabha</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </nav>
      <main className="px-gutter py-section-gap max-w-container-max mx-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/public/PublicShell.test.tsx`
Expected: PASS

- [ ] **Step 5: Add the five public routes**

`src/routes/index.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicSiteContent, fetchPublicMedia, fetchPublicReviews, type PublicMediaItem, type PublicReview } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function HomePage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [highlights, setHighlights] = useState<PublicMediaItem[]>([])
  const [reviews, setReviews] = useState<PublicReview[]>([])

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia('highlight').then(setHighlights)
    fetchPublicReviews().then(setReviews)
  }, [])

  const hero = (content.hero as { headline?: string; subhead?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-12">
        <div className="space-y-4">
          <h1 className="font-display text-4xl text-primary">{hero.headline ?? 'Aabha Girls Hostel'}</h1>
          <p className="text-on-surface-variant">{hero.subhead}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {highlights.map((item) => (
            <img key={item.id} src={item.url} alt={item.caption ?? ''} className="rounded-xxl w-full h-32 object-cover" loading="lazy" />
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-2xl text-on-surface">What Families Say</h2>
          {reviews.map((review) => (
            <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6">
              <p className="text-on-surface">{review.quote}</p>
              <p className="text-on-surface-variant text-sm mt-1">- {review.author_name}</p>
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
```

`src/routes/rooms.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicRoomAvailability, fetchPublicMedia, type PublicRoomAvailability, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function RoomsPage() {
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])
  const [media, setMedia] = useState<PublicMediaItem[]>([])

  useEffect(() => {
    fetchPublicRoomAvailability().then(setAvailability)
    fetchPublicMedia().then(setMedia)
  }, [])

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">Rooms</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availability.map((room) => (
            <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
              <img
                src={media.find((m) => m.category === `room_${room.room_type}`)?.url}
                alt={room.room_type}
                className="rounded-xxl w-full h-40 object-cover"
                loading="lazy"
              />
              <h3 className="font-display text-xl text-on-surface capitalize">{room.room_type} Sharing</h3>
              <p className="text-on-surface-variant">Starting from Rs. {room.monthly_price}/month</p>
              <p className="text-primary font-medium">{room.beds_available} beds left</p>
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/rooms')({
  component: RoomsPage,
})
```

`src/routes/life.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicWeeklyMenu, fetchPublicSiteContent, type PublicMenuItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function LifePage() {
  const [menu, setMenu] = useState<PublicMenuItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicWeeklyMenu().then(setMenu)
    fetchPublicSiteContent().then(setContent)
  }, [])

  const safetyRules = (content.safety_rules as { text?: string } | undefined)?.text ?? ''

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">Life at Aabha</h1>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-on-surface">This Week's Menu</h2>
          <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-outline-variant/10">
                {DAYS.map((dayName, dayOfWeek) => (
                  <tr key={dayName}>
                    <td className="px-4 py-3 font-medium">{dayName}</td>
                    {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                      <td key={meal} className="px-4 py-3 text-on-surface-variant">
                        {menu.find((m) => m.day_of_week === dayOfWeek && m.meal === meal)?.description ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {safetyRules && (
          <div className="space-y-2">
            <h2 className="font-display text-xl text-on-surface">Safety &amp; Rules</h2>
            <p className="text-on-surface-variant">{safetyRules}</p>
          </div>
        )}
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/life')({
  component: LifePage,
})
```

`src/routes/about.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicSiteContent } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function AboutPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
  }, [])

  const about = (content.about as { text?: string } | undefined)?.text ?? ''
  const contact = (content.contact as { phone?: string; address?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">About Aabha Girls Hostel</h1>
        <p className="text-on-surface-variant max-w-2xl">{about}</p>
        <div className="space-y-1">
          <p className="text-on-surface">{contact.address}</p>
          <p className="text-on-surface">{contact.phone}</p>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
```

`src/routes/contact.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { submitInquiry, submitBooking } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function ContactPage() {
  const [inquiryName, setInquiryName] = useState('')
  const [inquiryPhone, setInquiryPhone] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquirySent, setInquirySent] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)

  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [roomType, setRoomType] = useState<'single' | 'twin' | 'triple'>('single')
  const [preferredDate, setPreferredDate] = useState('')
  const [bookingSent, setBookingSent] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  async function handleInquirySubmit(e: FormEvent) {
    e.preventDefault()
    setInquiryError(null)
    try {
      await submitInquiry({ name: inquiryName, phone: inquiryPhone, message: inquiryMessage || undefined })
      setInquirySent(true)
    } catch (err) {
      setInquiryError(err instanceof Error ? err.message : 'Could not send inquiry')
    }
  }

  async function handleBookingSubmit(e: FormEvent) {
    e.preventDefault()
    setBookingError(null)
    try {
      await submitBooking({ name: bookingName, phone: bookingPhone, guardianPhone, roomType, preferredDate })
      setBookingSent(true)
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Could not send reservation request')
    }
  }

  return (
    <PublicShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
          <h2 className="font-display text-xl text-on-surface">Ask a Question</h2>
          {inquirySent ? (
            <p className="text-primary">Thanks - we'll get back to you soon.</p>
          ) : (
            <form onSubmit={handleInquirySubmit} className="space-y-4">
              <input value={inquiryName} onChange={(e) => setInquiryName(e.target.value)} placeholder="Name" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <input value={inquiryPhone} onChange={(e) => setInquiryPhone(e.target.value)} placeholder="Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <textarea value={inquiryMessage} onChange={(e) => setInquiryMessage(e.target.value)} placeholder="Message" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
              {inquiryError && <p className="text-error text-sm">{inquiryError}</p>}
              <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
                Send Inquiry
              </button>
            </form>
          )}
        </section>

        <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
          <h2 className="font-display text-xl text-on-surface">Reserve a Bed</h2>
          {bookingSent ? (
            <p className="text-primary">Reservation request sent - we'll confirm shortly.</p>
          ) : (
            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <input value={bookingName} onChange={(e) => setBookingName(e.target.value)} placeholder="Name" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <input value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} placeholder="Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="Guardian Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <select value={roomType} onChange={(e) => setRoomType(e.target.value as typeof roomType)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
                <option value="single">Single</option>
                <option value="twin">Twin</option>
                <option value="triple">Triple</option>
              </select>
              <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              {bookingError && <p className="text-error text-sm">{bookingError}</p>}
              <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
                Reserve a Bed
              </button>
            </form>
          )}
        </section>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/contact')({
  component: ContactPage,
})
```

Run `npm run dev` once to let the TanStack Router Vite plugin regenerate `src/routeTree.gen.ts` with all five new root-level routes, then stop the dev server.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run` - expect all tests pass.
Run: `npm run build` - expect success.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add public site skeleton - home, rooms, life, about, contact"
```

---

## Self-Review Notes

- **Spec coverage:** every read path (room availability, weekly menu, public notices, plus the site-content/media/reviews gaps found and closed via Task 5/6/7's Step 0) goes through a view granted to `anon`; every write path (inquiries, bookings) is insert-only for `anon` with no matching select; `approve_booking` + the `check_in_student` update connect a booking to the real bed board (Task 4); the content-management admin surface (Tasks 5-15) covers copy, photos, reviews, menu, inquiries, and bookings exactly as the spec lists them; the public skeleton (Task 16) proves every read/write wire works end-to-end while explicitly deferring Stitch-matched visual polish, per the spec's own "Open item."
- **A gap the spec's Task 5/6/7 wording didn't fully cover, found and fixed while writing this plan, not left for a reviewer to catch:** the design spec's read-surface section (Section 3) only named three views (`public_room_availability`, `public_weekly_menu`, `public_notices`), but Section 6's content-management scope requires the public site to also render `site_content` (hero/about text), `site_media` (photos), and `reviews` (testimonials) - none of which had an anon-readable path in the original three-view design. Tasks 5, 6, and 7 each add one narrow view for exactly this (`public_site_content`, `public_site_media`, `public_reviews`), all consolidated into one migration (`0020`) since they were all discovered in the same pass and are all one-line views - not three separate migrations for three near-identical grants.
- **Placeholder scan:** no TBD/TODO; every step has full code or an exact SQL/dashboard action.
- **Type consistency:** `Bed`/`Room` types (from `src/lib/rooms.ts`, Stage 2) are imported everywhere they're needed (`BookingsQueue`, the site-content route's `vacantBedsByType`), never redefined; `Booking['room_type']`/`room_type` enum values (`'single' | 'twin' | 'triple'`) match Stage 2's enum exactly across `lib/bookings.ts`, `lib/publicSite.ts`, and the public `rooms.tsx` route.
- **Known bug classes from this project's history, guarded against proactively:**
  - *Bed-status TOCTOU race* (Stage 2's original bug, repeated and fixed again in Stages 4 and 5): `approve_booking` locks the target bed with `select ... for update` before writing, same as every prior bed-status transition in this codebase.
  - *A component built but never mounted* (Stage 2's `CheckInForm`, caught at Stage 2's final review): every new component in Tasks 12-14 is wired into `/site-content` (Task 15) or a public route (Task 16) within this same plan, not left dangling for a later task to remember.
  - *Fetch-then-reveal for async-seeded form state* (Stage 5's `PostUpdateForm`/`key` prop lesson): `MenuEditor`'s cells use `defaultValue` + `onBlur`-save rather than a controlled value re-synced from a prop, sidestepping the whole stale-remount class of bug by never needing a remount to pick up fresh data in the first place.
  - *A second foreign key silently breaking existing embedded selects* (Stage 5's `guardian_id` lesson): this stage's new tables (`bookings.reserved_bed_id -> beds.id`) don't introduce any second relationship into an already-embedded-select pair - `beds` gains no second FK to anywhere it didn't already have exactly one, so no existing query needs an FK-hint fix this time.
