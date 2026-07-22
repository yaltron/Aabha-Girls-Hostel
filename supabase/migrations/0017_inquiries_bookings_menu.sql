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
  with check (status = 'new');

create policy "bookings_owner_warden_full_access" on public.bookings
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "bookings_anon_insert" on public.bookings
  for insert
  to anon
  with check (status = 'pending' and reserved_bed_id is null);

grant insert on public.inquiries to anon;
grant insert on public.bookings to anon;

create policy "menu_items_owner_warden_full_access" on public.menu_items
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));
