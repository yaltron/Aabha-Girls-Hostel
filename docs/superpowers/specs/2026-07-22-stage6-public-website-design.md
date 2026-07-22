# Stage 6 (Public Portfolio Website) - Design Spec

Date: 2026-07-22
Status: Approved

## 1. Overview

Stage 6 adds a public marketing website for Aabha Girls Hostel, in the
same repo, at the root routes (`/`, `/rooms`, `/life`, `/about`, etc.),
connected to the same Supabase project the admin/student/guardian system
already uses. The existing system is untouched - same routes, same RLS,
same tables, same posture.

The connection between the public site and the live system is
deliberately narrow: three read-only database views (never base tables)
and two insert-only write paths for anonymous visitors (inquiries,
bookings). Nothing else is exposed. This is the same "prove the RLS
denial" standard every prior stage has been held to, extended to an
`anon` (unauthenticated) caller for the first time - every previous
stage's RLS was written for *some* authenticated role; this stage is the
first where the caller might have no session at all.

## 2. Data model

```sql
-- Flexible photo store - serves home-page highlights, per-room-type
-- galleries, and facility photos from one table, one admin UI.
create table public.site_media (
  id uuid primary key default gen_random_uuid(),
  category text not null,        -- 'highlight' | 'room_single' | 'room_twin' | 'room_triple' | 'facility'
  url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Key/value editable copy - hero text, trust points, about text,
-- safety & rules, contact info. jsonb value so a key can hold a
-- structured field (e.g. trust_points as an array) without a new
-- migration per field.
create table public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Owner-entered testimonials - a real table (not JSON in site_content)
-- so admin gets add/remove/reorder instead of hand-edited text.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  quote text not null,
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

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
  room_type room_type not null,        -- reuses Stage 2's enum
  preferred_date date not null,
  status booking_status not null default 'pending',
  reserved_bed_id uuid references public.beds(id),
  created_at timestamptz not null default now()
);
```

A weekly menu also needs to exist - it doesn't yet, anywhere in the
project:

```sql
create type meal_type as enum ('breakfast', 'lunch', 'dinner');
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  meal meal_type not null,
  description text not null,
  unique (day_of_week, meal)
);
```

All six tables get RLS enabled in their own creation migration, per
project law. `site_media`/`site_content`/`reviews`/`menu_items`:
owner/warden `for all`, no anon policy (anon reads these through the
public views instead, in section 3). `inquiries`/`bookings`: owner/warden
`for all` (so the admin inbox works exactly like every other admin list
in this project), plus one `for insert` policy for `anon` on each -
**no** anon `select` policy on either, matching the "insert-only for
anonymous" law exactly: a visitor who submits the form gets a static
client-side thank-you message, never reads their own row back.

## 3. The read surface (why anon never touches a base table)

Three views, each owned so it can read the tables it needs while `anon`
is granted `select` on the view only - the same "narrow the surface to a
function/view instead of the table" instinct as Stage 5's
`my_linked_student_id()`, applied to views instead of a function:

```sql
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
```

`public_visible` is a new flag, distinct from Stage 4's
`guardian_visible` (which means "show to guardians," not "show to the
public"). This stage's migration adds it:

```sql
alter table public.notices add column public_visible boolean not null default false;
```

`min(monthly_price)` handles the (currently theoretical) case where two
physical rooms of the same `room_type` are priced differently - the
public page shows "starting from" that figure rather than assuming
uniform pricing across every room of a type.

Grants:

```sql
grant select on public.public_room_availability to anon;
grant select on public.public_weekly_menu to anon;
grant select on public.public_notices to anon;
```

No `grant select` is ever issued to `anon` on `rooms`, `beds`, `students`,
`notices`, `menu_items`, `site_media`, `site_content`, `reviews`,
`inquiries`, or `bookings`. Proving that is this stage's version of every
prior stage's "explain what each role provably cannot see": a `set role
anon` SQL Editor session selecting from any of those ten tables must
return a permission-denied error, not zero rows - zero rows would mean
RLS silently filtered the query; permission-denied means there's no grant
to query it at all, which is the stronger, correct guarantee here since
`anon` should have no reason to even attempt these tables.

## 4. Approving a reservation

`approve_booking(p_booking_id uuid, p_bed_id uuid)` - `security invoker`
(owner/warden already have direct write access to `bookings` and `beds`),
reusing the `select ... for update` lock pattern from Stages 2 and 4:

```sql
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
```

`check_in_student()` (Stage 2, migration 0005) currently requires a
`vacant` bed and raises otherwise. This stage relaxes that check to
accept `vacant` or `reserved`, so a reserved bed still goes through the
one existing check-in path rather than a second parallel one:

```sql
if (select status from public.beds where id = p_bed_id for update) not in ('vacant', 'reserved') then
  raise exception 'Bed % is not available for check-in', p_bed_id;
end if;
```

The warden's Check-In bed picker (Residents page) shows reserved beds
alongside vacant ones, labeled with the reservation's name, so the
warden knows which arriving student a reserved bed is meant for.

## 5. Routes

Public site lives at root: `/`, `/rooms`, `/life`, `/about`, plus the
inquiry and reserve-a-bed forms (likely `/contact` and inline on
`/rooms`, to be finalized once the Stitch screens are in hand). These
are a new top-level route group, sitting beside (not nested under)
`_authenticated`, code-split so a visitor to `/` never downloads the
admin/student/guardian bundle. `/login` and every existing
`_authenticated/*` route are unchanged.

## 6. Content management (owner-only, in the existing admin)

A new admin page (`/site-content`, owner-only - warden doesn't manage
marketing copy) with:
- A form bound to `site_content` keys: hero headline/subhead, the three
  trust points, about text, safety & rules text, contact info.
- A gallery manager for `site_media`: upload, caption, reorder, delete,
  scoped by category tab (Highlights / Single / Twin / Triple /
  Facilities).
- A reviews list: add/edit/remove/reorder, publish toggle.
- A weekly menu editor for `menu_items`: 7 days x 3 meals, plain text per
  cell.
- The existing Requests-page pattern (queue + status + action) reused
  for the new inquiries inbox (New/Contacted/Closed) and bookings queue
  (approve/decline, approve wired to `approve_booking`).

Photos upload to a new public Supabase Storage bucket (`site-media` -
distinct from Stage 2's *private* `student-photos` bucket, since these
images are meant to be publicly viewable), served through Supabase's CDN.

## 7. Performance

Staying inside the existing Vite + TanStack Router SPA - same repo, same
stack, per the instruction. The public route group is code-split from
the authenticated bundle; images are compressed and lazy-loaded from the
CDN-backed storage bucket. This will not paint as instantly on a slow
connection as a statically-generated or server-rendered marketing site
would - that would require a second rendering layer (e.g. Astro)
alongside this SPA, which is out of scope unless explicitly requested.
Within the current stack, code-splitting plus image discipline is the
available lever.

## 8. Testing plan (given to user at end of implementation)

- As an anonymous browser session (no login), load `/`, `/rooms`,
  `/life` - confirm availability counts, menu, and public notices render
  and match the admin data.
- Submit the inquiry form and the Reserve-a-Bed form; confirm both
  appear in the admin inbox with `New`/`pending` status.
- As owner/warden, approve a pending booking; confirm the bed shows
  `reserved` on the bed board and the public availability count for that
  room type drops by one, with no manual refresh step beyond reloading
  the public page.
- Check in the reserved bed's expected student via the normal Check-In
  flow; confirm it succeeds and the bed becomes `occupied`.
- In the SQL Editor, `set role anon;` and confirm: `select * from rooms`,
  `beds`, `students`, `notices`, `menu_items`, `site_media`,
  `site_content`, `reviews`, `inquiries`, `bookings` are all
  permission-denied (not empty-result) - and confirm `select * from
  public_room_availability` / `public_weekly_menu` / `public_notices`
  succeed and return only the intended aggregate/public shape.
- Confirm `insert into inquiries (...)` and `insert into bookings (...)`
  succeed as `anon`, and that `update`/`delete` on either, as `anon`, are
  denied.

## 9. Open item

The visual build (matching the Stitch screens exactly) is blocked on the
actual screens/exported code being pasted in. Everything above - schema,
views, RLS, RPC, route skeleton, content-management admin pages - is
buildable now, independent of the final visual design.
