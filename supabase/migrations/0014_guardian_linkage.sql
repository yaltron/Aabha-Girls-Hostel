-- Stage 5: guardian linkage on students + guardian_updates table.
-- RLS is enabled on guardian_updates in this same migration that creates
-- it, per project law. The guardian-facing read policy is added in
-- migration 0015 alongside the my_linked_student_id() helper it depends
-- on - until then this table is owner/warden only, which is a safe
-- default (never retrofitting RLS itself, only adding a policy).
alter table public.students add column guardian_id uuid references public.profiles(id);

create table public.guardian_updates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  message text not null,
  posted_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, month)
);

alter table public.guardian_updates enable row level security;

create policy "guardian_updates_owner_warden_full_access" on public.guardian_updates
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));
