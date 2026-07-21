-- Stage 2: rooms + beds
create type room_type as enum ('single', 'twin', 'triple');
create type bed_status as enum ('vacant', 'occupied', 'reserved', 'notice_given');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text unique not null,
  room_type room_type not null,
  capacity int not null,
  monthly_price numeric not null,
  created_at timestamptz not null default now()
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  bed_label text not null,
  status bed_status not null default 'vacant',
  unique (room_id, bed_label)
);

alter table public.rooms enable row level security;
alter table public.beds enable row level security;

create policy "rooms_owner_warden_full_access" on public.rooms
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "rooms_read_all_authenticated" on public.rooms
  for select
  using (public.current_role() in ('student', 'guardian'));

create policy "beds_owner_warden_full_access" on public.beds
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "beds_read_all_authenticated" on public.beds
  for select
  using (public.current_role() in ('student', 'guardian'));
