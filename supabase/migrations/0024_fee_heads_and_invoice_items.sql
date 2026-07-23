create table public.fee_heads (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.fee_heads (name, is_recurring) values ('Rent', true);

alter table public.fee_heads enable row level security;

create policy "fee_heads_owner_full_access" on public.fee_heads
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

create policy "fee_heads_read_all_authenticated" on public.fee_heads
  for select
  using (public.current_role() in ('warden', 'student', 'guardian'));

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fee_head_id uuid not null references public.fee_heads(id),
  description text,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table public.invoice_items enable row level security;

create policy "invoice_items_owner_warden_full_access" on public.invoice_items
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "invoice_items_own_select" on public.invoice_items
  for select
  using (invoice_id in (select id from public.invoices where student_id = auth.uid()));

-- Keeps invoices.amount (the single number every existing consumer reads)
-- and the itemized breakdown atomic - not security definer, the caller
-- already has direct RLS write access to invoices via
-- invoices_owner_warden_full_access.
create function public.add_invoice_item(p_invoice_id uuid, p_fee_head_id uuid, p_amount numeric, p_description text default null)
returns void
language plpgsql
as $$
begin
  if (select status from public.invoices where id = p_invoice_id for update) <> 'unpaid' then
    raise exception 'Invoice % is not unpaid', p_invoice_id;
  end if;

  insert into public.invoice_items (invoice_id, fee_head_id, description, amount)
  values (p_invoice_id, p_fee_head_id, p_description, p_amount);

  update public.invoices set amount = amount + p_amount where id = p_invoice_id;
end;
$$;

revoke execute on function public.add_invoice_item(uuid, uuid, numeric, text) from public;
grant execute on function public.add_invoice_item(uuid, uuid, numeric, text) to authenticated;
