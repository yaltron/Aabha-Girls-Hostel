-- Stage 4: notices
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  guardian_visible boolean not null default false,
  posted_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.notices enable row level security;

create policy "notices_owner_warden_full_access" on public.notices
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "notices_read_all_students" on public.notices
  for select
  using (public.current_role() = 'student');
