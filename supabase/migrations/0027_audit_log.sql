create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- No insert/update/delete policy for any role, on purpose - the only
-- way a row enters this table is through write_audit_log()'s security
-- definer trigger below. This is the actual "cannot be bypassed from
-- application code" enforcement (spec section 10.2), not just the
-- trigger's existence - even an owner's own client cannot
-- `insert into audit_log` directly.
create policy "audit_log_owner_read" on public.audit_log
  for select
  using (public.current_role() = 'owner');

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before_data, after_data)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger audit_payments
  after insert on public.payments
  for each row execute function public.write_audit_log();

-- insert = new allotment (check-in); update of bed_id = reallotment
-- (a transfer's bed change) - not a bare "after update", so routine
-- non-allotment student edits don't spam the log.
create trigger audit_students
  after insert or update of bed_id on public.students
  for each row execute function public.write_audit_log();

-- update of role, combined with the when() guard, fires only on an
-- actual role change - not merely because the role column was named
-- in an unrelated update statement.
create trigger audit_profiles_role
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.write_audit_log();
