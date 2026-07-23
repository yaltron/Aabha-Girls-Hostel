-- Prorate a student's invoice for the billing month they joined in,
-- based on remaining days in that month from check_in_date. No
-- checkout-side proration - no checkout/vacate flow exists yet to
-- prorate against. Signature unchanged from 0023, so create or replace
-- is safe (no overload/grant-loss risk).
create or replace function public.generate_monthly_invoices(p_billing_month date)
returns void
language plpgsql
as $$
begin
  insert into public.invoices (student_id, billing_month, amount, due_date, status)
  select
    s.id,
    p_billing_month,
    case
      when s.check_in_date >= p_billing_month and s.check_in_date < (p_billing_month + interval '1 month')
        then round(rt.base_rent * (extract(day from (p_billing_month + interval '1 month' - interval '1 day')) - extract(day from s.check_in_date) + 1) / extract(day from (p_billing_month + interval '1 month' - interval '1 day')))
      else rt.base_rent
    end,
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
