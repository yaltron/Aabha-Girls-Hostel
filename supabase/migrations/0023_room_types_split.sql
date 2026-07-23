-- Guard: abort if any existing room_type value has inconsistent
-- capacity/price across rooms - silently picking one of several
-- inconsistent values would be undetectable data loss. Expected to be a
-- no-op for this hostel's real data.
do $$
declare
  v_bad_type room_type;
begin
  select room_type into v_bad_type
  from public.rooms
  group by room_type
  having count(distinct capacity) > 1 or count(distinct monthly_price) > 1
  limit 1;

  if v_bad_type is not null then
    raise exception 'room_type % has inconsistent capacity/price across existing rooms - reconcile before migrating', v_bad_type;
  end if;
end $$;

create type room_admin_status as enum ('active', 'under_maintenance', 'blocked');

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  capacity int not null,
  base_rent numeric not null,
  deposit numeric not null default 0,
  amenities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.room_types (name, capacity, base_rent)
select
  initcap(room_type::text),
  min(capacity),
  min(monthly_price)
from public.rooms
group by room_type;

alter table public.rooms add column room_type_id uuid references public.room_types(id);
alter table public.rooms add column floor int not null default 0;
alter table public.rooms add column wing text;
alter table public.rooms add column admin_status room_admin_status not null default 'active';

update public.rooms r
set room_type_id = rt.id
from public.room_types rt
where rt.name = initcap(r.room_type::text);

alter table public.rooms alter column room_type_id set not null;

alter table public.rooms drop column room_type;
alter table public.rooms drop column capacity;
alter table public.rooms drop column monthly_price;

create view public.rooms_with_status as
  select
    r.id,
    r.room_number,
    r.floor,
    r.wing,
    r.room_type_id,
    r.admin_status,
    case
      when r.admin_status <> 'active' then r.admin_status::text
      when count(b.id) filter (where b.status = 'occupied') = count(b.id) then 'full'
      when count(b.id) filter (where b.status = 'occupied') = 0 then 'available'
      else 'partially_filled'
    end as display_status
  from public.rooms r
  left join public.beds b on b.room_id = r.id
  group by r.id;

alter table public.beds add column hold_until timestamptz;

alter table public.room_types enable row level security;

create policy "room_types_owner_full_access" on public.room_types
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

create policy "room_types_read_all_authenticated" on public.room_types
  for select
  using (public.current_role() in ('warden', 'student', 'guardian'));

-- Self-heal: physically release any bed whose hold has expired. Called
-- as a preamble from real staff interactions (below) rather than a
-- scheduled job.
create function public.release_expired_bed_holds()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.beds
  set status = 'vacant', hold_until = null
  where status = 'reserved' and hold_until is not null and hold_until < now();
end;
$$;

revoke execute on function public.release_expired_bed_holds() from public;
grant execute on function public.release_expired_bed_holds() to authenticated;

-- The existing 2-arg approve_booking(uuid, uuid) is being replaced by a
-- 3-arg version - Postgres identifies functions by name + parameter type
-- list, so `create or replace function` with a different arity creates a
-- SECOND, separate overload rather than replacing the original; the old
-- function must be dropped explicitly first, or both the old (hold-
-- unaware) function stays live AND a 2-argument call to approve_booking
-- becomes ambiguous between the two overloads (Postgres raises "function
-- approve_booking(uuid, uuid) is not unique").
drop function public.approve_booking(uuid, uuid);

create function public.approve_booking(p_booking_id uuid, p_bed_id uuid, p_hold_hours int default 48)
returns void
language plpgsql
as $$
begin
  perform public.release_expired_bed_holds();

  if (select status from public.beds where id = p_bed_id for update) <> 'vacant' then
    raise exception 'Bed % is not vacant', p_bed_id;
  end if;

  update public.beds set status = 'reserved', hold_until = now() + (p_hold_hours || ' hours')::interval where id = p_bed_id;

  update public.bookings
  set status = 'approved', reserved_bed_id = p_bed_id
  where id = p_booking_id and status = 'pending';

  if not found then
    raise exception 'Booking % is not pending', p_booking_id;
  end if;
end;
$$;

-- A newly created function defaults to PUBLIC execute in Postgres unless
-- explicitly revoked - dropping the old function also drops its revoke/
-- grant pair, so this must be re-declared for the new one, or
-- approve_booking silently becomes callable by anon/every role instead
-- of staying restricted to authenticated staff.
revoke execute on function public.approve_booking(uuid, uuid, int) from public;
grant execute on function public.approve_booking(uuid, uuid, int) to authenticated;

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
  perform public.release_expired_bed_holds();

  if (select status from public.beds where id = p_bed_id for update) not in ('vacant', 'reserved') then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied', hold_until = null where id = p_bed_id and status in ('vacant', 'reserved');

  if not found then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;
end;
$$;

create or replace function public.generate_monthly_invoices(p_billing_month date)
returns void
language plpgsql
as $$
begin
  insert into public.invoices (student_id, billing_month, amount, due_date, status)
  select
    s.id,
    p_billing_month,
    rt.base_rent,
    p_billing_month + interval '7 days',
    'unpaid'
  from public.students s
  join public.beds b on b.id = s.bed_id
  join public.rooms r on r.id = b.room_id
  join public.room_types rt on rt.id = r.room_type_id
  where s.bed_id is not null
  on conflict (student_id, billing_month) do nothing;
end;
$$;

create function public.delete_room(p_room_id uuid)
returns void
language plpgsql
as $$
declare
  v_occupied_count int;
begin
  select count(*) into v_occupied_count
  from public.beds
  where room_id = p_room_id and status in ('occupied', 'reserved', 'notice_given');

  if v_occupied_count > 0 then
    raise exception 'Cannot delete room: % bed(s) are occupied, reserved, or on notice. Set the room to blocked instead.', v_occupied_count;
  end if;

  delete from public.rooms where id = p_room_id;
end;
$$;

-- create or replace view cannot change an existing column's data type,
-- and room_type here changes from the room_type enum to text (rt.name) -
-- Postgres would reject "create or replace" with "cannot change data
-- type of view column room_type from room_type to text". Drop and
-- recreate instead, and re-grant to anon since dropping a view drops
-- its existing grants along with it.
drop view public.public_room_availability;

create view public.public_room_availability as
  select
    rt.name as room_type,
    rt.base_rent as monthly_price,
    count(*) filter (
      where b.status = 'vacant'
         or (b.status = 'reserved' and b.hold_until is not null and b.hold_until < now())
    ) as beds_available
  from public.rooms r
  join public.beds b on b.room_id = r.id
  join public.room_types rt on rt.id = r.room_type_id
  where r.admin_status = 'active'
  group by rt.name, rt.base_rent;

grant select on public.public_room_availability to anon;
