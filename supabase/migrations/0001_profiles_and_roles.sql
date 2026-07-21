-- Stage 1: profiles table + role enum + auto-create profile on signup
create type user_role as enum ('owner', 'warden', 'student', 'guardian');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'student',
  phone text,
  created_at timestamptz not null default now()
);

-- Auto-create a profiles row whenever a new auth.users row is created.
-- full_name/role are read from the signup call's user_metadata so the
-- client controls them at signup time (owner seeding sets role explicitly).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'student'),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
