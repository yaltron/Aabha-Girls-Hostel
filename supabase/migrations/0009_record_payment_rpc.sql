-- Stage 3: record a payment and flip the invoice to paid, atomically.
-- NOT security definer - runs as the caller (owner/warden, per RLS on
-- invoices/payments from Task 1). recorded_by is set server-side from
-- auth.uid(), never trusted from client input, so the audit trail can't
-- be spoofed to attribute a payment to someone else.
create function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_reference text default null
)
returns void
language plpgsql
as $$
begin
  insert into public.payments (invoice_id, amount, method, reference, recorded_by)
  values (p_invoice_id, p_amount, p_method, p_reference, auth.uid());

  update public.invoices set status = 'paid' where id = p_invoice_id;
end;
$$;
