-- Stage 4: student confirms an awaiting-confirmation transfer. SECURITY
-- DEFINER because confirming needs to write to beds/students/invoices,
-- which a student has no direct RLS write access to (by design - see
-- Stages 2-3). Since this bypasses RLS, the function does its OWN
-- authorization check instead: the request's student_id must equal the
-- caller's auth.uid(), or it raises - this stands in for the RLS check
-- that would normally gate this write.
create function public.confirm_transfer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_bed_id uuid;
  v_to_bed_id uuid;
  v_price_diff numeric;
  v_student_id uuid;
begin
  select from_bed_id, to_bed_id, price_diff, student_id
  into v_from_bed_id, v_to_bed_id, v_price_diff, v_student_id
  from public.transfer_requests
  where id = p_request_id and status = 'awaiting_confirmation';

  if v_to_bed_id is null then
    raise exception 'Transfer request % is not awaiting confirmation', p_request_id;
  end if;

  if v_student_id <> auth.uid() then
    raise exception 'Only the requesting student can confirm this transfer';
  end if;

  if (select status from public.beds where id = v_to_bed_id for update) <> 'vacant' then
    raise exception 'Bed % is not vacant', v_to_bed_id;
  end if;

  update public.beds set status = 'vacant' where id = v_from_bed_id;
  update public.beds set status = 'occupied' where id = v_to_bed_id;
  update public.students set bed_id = v_to_bed_id where id = v_student_id;

  update public.invoices
  set amount = amount + v_price_diff
  where id = (
    select id from public.invoices
    where student_id = v_student_id and status = 'unpaid'
    order by billing_month asc
    limit 1
  );

  update public.transfer_requests
  set status = 'confirmed', confirmed_at = now()
  where id = p_request_id;
end;
$$;
