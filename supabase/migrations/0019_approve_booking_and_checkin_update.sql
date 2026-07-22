-- Stage 6: approving a booking reserves a bed for that visitor.
-- security invoker, NOT definer - the calling warden/owner already has
-- direct RLS write access to both bookings and beds.
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

revoke execute on function public.approve_booking(uuid, uuid) from public;
grant execute on function public.approve_booking(uuid, uuid) to authenticated;

-- Stage 6: a reserved bed (from an approved booking) must still be
-- check-in-able through the one existing check-in path, not a second
-- parallel one. This is the only change from the Stage 2 original:
-- 'vacant' -> 'vacant' or 'reserved'.
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
  if (select status from public.beds where id = p_bed_id for update) not in ('vacant', 'reserved') then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied' where id = p_bed_id and status in ('vacant', 'reserved');

  if not found then
    raise exception 'Bed % is not available for check-in', p_bed_id;
  end if;
end;
$$;
