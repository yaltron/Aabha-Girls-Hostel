-- Stage 2: students + photo storage
create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  photo_url text,
  guardian_name text not null,
  guardian_phone text not null,
  bed_id uuid references public.beds(id),
  check_in_date date,
  monthly_fee numeric
);

alter table public.students enable row level security;

create policy "students_owner_warden_full_access" on public.students
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "students_own_row_select" on public.students
  for select
  using (id = auth.uid());

-- Private bucket for student photos. Objects are stored under
-- '<student profile id>/<filename>' so ownership is derivable from the path.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', false);

create policy "student_photos_owner_warden_full_access" on storage.objects
  for all
  using (bucket_id = 'student-photos' and public.current_role() in ('owner', 'warden'))
  with check (bucket_id = 'student-photos' and public.current_role() in ('owner', 'warden'));

create policy "student_photos_own_read" on storage.objects
  for select
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
