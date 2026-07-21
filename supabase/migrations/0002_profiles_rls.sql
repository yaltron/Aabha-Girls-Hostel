-- Stage 1 RLS: profiles
alter table public.profiles enable row level security;

-- Helper: current user's role, without recursing into RLS on profiles itself.
create function public.current_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Owner: full read/write on all rows.
create policy "owner_full_access" on public.profiles
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

-- Warden: read all rows, no writes.
create policy "warden_read_all" on public.profiles
  for select
  using (public.current_role() = 'warden');

-- Student: read/write own row only.
create policy "student_own_row_select" on public.profiles
  for select
  using (id = auth.uid());

create policy "student_own_row_update" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Guardian: read own row only (linked-student visibility arrives Stage 5).
create policy "guardian_own_row_select" on public.profiles
  for select
  using (id = auth.uid());
