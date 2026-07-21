-- Stage 3: invoices + payments
create type invoice_status as enum ('unpaid', 'paid');
create type payment_method as enum ('cash', 'esewa', 'khalti');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  billing_month date not null,
  amount numeric not null,
  due_date date not null,
  status invoice_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  unique (student_id, billing_month)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric not null,
  method payment_method not null,
  reference text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id)
);

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

create policy "invoices_owner_warden_full_access" on public.invoices
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "invoices_own_select" on public.invoices
  for select
  using (student_id = auth.uid());

create policy "payments_owner_warden_full_access" on public.payments
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "payments_own_select" on public.payments
  for select
  using (invoice_id in (select id from public.invoices where student_id = auth.uid()));
