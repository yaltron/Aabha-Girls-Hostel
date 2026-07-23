-- Guardians pay their own linked child's invoice. security definer
-- because the guardian caller has no direct RLS write access to
-- invoices/payments (by design - guardians get zero table-level write
-- grants anywhere in this project, everything mediated through a
-- narrow function, same as every other guardian capability).
create function public.record_guardian_payment(p_invoice_id uuid, p_method payment_method, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_amount numeric;
  v_status invoice_status;
begin
  select student_id, amount, status into v_student_id, v_amount, v_status
  from public.invoices where id = p_invoice_id for update;

  if v_student_id is distinct from public.my_linked_student_id() then
    raise exception 'Only the linked guardian can pay this invoice';
  end if;

  if v_status <> 'unpaid' then
    raise exception 'Invoice % is not unpaid', p_invoice_id;
  end if;

  insert into public.payments (invoice_id, amount, method, reference, recorded_by)
  values (p_invoice_id, v_amount, p_method, p_reference, auth.uid());

  update public.invoices set status = 'paid' where id = p_invoice_id;
end;
$$;

revoke execute on function public.record_guardian_payment(uuid, payment_method, text) from public;
grant execute on function public.record_guardian_payment(uuid, payment_method, text) to authenticated;
