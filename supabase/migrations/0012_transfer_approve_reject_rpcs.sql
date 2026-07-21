-- Stage 4: approve/reject a transfer request. Both NOT security definer -
-- the calling warden/owner already has direct RLS write access to every
-- table touched here (transfer_requests, beds, students are all
-- owner+warden `for all`; rooms is read-only for warden, which is all
-- this function needs from it).
create function public.approve_transfer_request(p_request_id uuid, p_to_bed_id uuid)
returns void
language plpgsql
as $$
declare
  v_from_bed_id uuid;
  v_old_room_price numeric;
  v_new_room_price numeric;
  v_diff numeric;
  v_student_id uuid;
begin
  select from_bed_id, student_id into v_from_bed_id, v_student_id
  from public.transfer_requests where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Transfer request % is not pending', p_request_id;
  end if;

  select r.monthly_price into v_old_room_price
  from public.beds b join public.rooms r on r.id = b.room_id
  where b.id = v_from_bed_id;

  select r.monthly_price into v_new_room_price
  from public.beds b join public.rooms r on r.id = b.room_id
  where b.id = p_to_bed_id;

  v_diff := v_new_room_price - v_old_room_price;

  if v_diff = 0 then
    if (select status from public.beds where id = p_to_bed_id for update) <> 'vacant' then
      raise exception 'Bed % is not vacant', p_to_bed_id;
    end if;

    update public.beds set status = 'vacant' where id = v_from_bed_id;
    update public.beds set status = 'occupied' where id = p_to_bed_id;
    update public.students set bed_id = p_to_bed_id where id = v_student_id;

    update public.transfer_requests
    set status = 'confirmed', to_bed_id = p_to_bed_id, price_diff = 0,
        reviewed_by = auth.uid(), reviewed_at = now(), confirmed_at = now()
    where id = p_request_id;
  else
    update public.transfer_requests
    set status = 'awaiting_confirmation', to_bed_id = p_to_bed_id, price_diff = v_diff,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;
  end if;
end;
$$;

create function public.reject_transfer_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  update public.transfer_requests
  set status = 'rejected', reject_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Transfer request % is not pending', p_request_id;
  end if;
end;
$$;
