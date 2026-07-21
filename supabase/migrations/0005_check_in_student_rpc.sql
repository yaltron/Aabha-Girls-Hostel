-- Stage 2: atomic check-in - creates the student row and occupies the bed
-- in one transaction (a Postgres function body is always one transaction).
-- Deliberately NOT security definer: it runs as the calling user, so the
-- existing owner/warden RLS policies on students and beds still gate who
-- can call this successfully - no privilege bypass introduced.
create function public.check_in_student(
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
  if (select status from public.beds where id = p_bed_id) <> 'vacant' then
    raise exception 'Bed % is not vacant', p_bed_id;
  end if;

  insert into public.students (id, photo_url, guardian_name, guardian_phone, bed_id, check_in_date, monthly_fee)
  values (p_profile_id, p_photo_url, p_guardian_name, p_guardian_phone, p_bed_id, p_check_in_date, p_monthly_fee);

  update public.beds set status = 'occupied' where id = p_bed_id;
end;
$$;
