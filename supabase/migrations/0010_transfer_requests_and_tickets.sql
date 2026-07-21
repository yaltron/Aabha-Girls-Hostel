-- Stage 4: transfer requests + maintenance tickets
create type transfer_status as enum ('pending', 'awaiting_confirmation', 'confirmed', 'rejected');
create type ticket_status as enum ('open', 'resolved');

create table public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) default auth.uid(),
  reason text not null,
  preferred_room_type room_type not null,
  status transfer_status not null default 'pending',
  from_bed_id uuid not null references public.beds(id),
  to_bed_id uuid references public.beds(id),
  price_diff numeric,
  reject_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- A student can only have one active (not yet decided, or decided but not
-- yet confirmed/rejected) transfer request at a time. This is what makes
-- from_bed_id trustworthy at approval time - without it, a second request
-- could change the student's real bed before an earlier request is
-- approved, leaving the earlier request's from_bed_id stale.
create unique index transfer_requests_one_active_per_student
  on public.transfer_requests (student_id)
  where status in ('pending', 'awaiting_confirmation');

create table public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) default auth.uid(),
  description text not null,
  status ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

alter table public.transfer_requests enable row level security;
alter table public.maintenance_tickets enable row level security;

create policy "transfer_requests_owner_warden_full_access" on public.transfer_requests
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "transfer_requests_own_insert" on public.transfer_requests
  for insert
  with check (student_id = auth.uid());

create policy "transfer_requests_own_select" on public.transfer_requests
  for select
  using (student_id = auth.uid());

create policy "maintenance_tickets_owner_warden_full_access" on public.maintenance_tickets
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "maintenance_tickets_own_insert" on public.maintenance_tickets
  for insert
  with check (student_id = auth.uid());

create policy "maintenance_tickets_own_select" on public.maintenance_tickets
  for select
  using (student_id = auth.uid());
