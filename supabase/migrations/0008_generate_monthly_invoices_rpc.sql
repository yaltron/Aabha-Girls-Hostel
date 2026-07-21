-- Stage 3: generate one invoice per checked-in student for a given month,
-- at their room's current price. Deliberately NOT security definer - runs
-- as the caller, so the invoices_owner_warden_full_access RLS policy from
-- Task 1 still gates who can successfully call this (owner/warden only).
-- Safely re-runnable: the unique(student_id, billing_month) constraint on
-- invoices makes "on conflict do nothing" a true no-op for students who
-- already have an invoice for that month.
create function public.generate_monthly_invoices(p_billing_month date)
returns void
language plpgsql
as $$
begin
  insert into public.invoices (student_id, billing_month, amount, due_date, status)
  select
    s.id,
    p_billing_month,
    r.monthly_price,
    p_billing_month + interval '7 days',
    'unpaid'
  from public.students s
  join public.beds b on b.id = s.bed_id
  join public.rooms r on r.id = b.room_id
  where s.bed_id is not null
  on conflict (student_id, billing_month) do nothing;
end;
$$;
