-- Stage 5: guardian read access, entirely mediated through this helper so
-- guardians never receive a table-level grant on students/rooms/beds.
-- Mirrors the current_role() pattern from migration 0002.
create function public.my_linked_student_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.students where guardian_id = auth.uid();
$$;

-- profiles: a guardian may read their linked student's profile row (needed
-- to label "Fees for <name>" in the UI). This is additive to the existing
-- guardian_own_row_select policy from migration 0002 - a guardian's own
-- row and their linked child's row are both now selectable.
create policy "profiles_guardian_linked_student_select" on public.profiles
  for select
  using (public.current_role() = 'guardian' and id = public.my_linked_student_id());

-- invoices / payments: same student-scoping predicate used by the
-- student's own policies in migration 0006, but keyed off the helper
-- instead of auth.uid() directly since the caller here is the guardian.
create policy "invoices_guardian_select" on public.invoices
  for select
  using (public.current_role() = 'guardian' and student_id = public.my_linked_student_id());

create policy "payments_guardian_select" on public.payments
  for select
  using (public.current_role() = 'guardian' and invoice_id in (select id from public.invoices where student_id = public.my_linked_student_id()));

-- notices: guardians see only guardian-flagged notices, never the full
-- list students see (notices_read_all_students from migration 0011).
create policy "notices_guardian_select" on public.notices
  for select
  using (public.current_role() = 'guardian' and guardian_visible = true);

-- guardian_updates: read-only for the linked guardian; owner/warden
-- already have full access from migration 0014.
create policy "guardian_updates_guardian_select" on public.guardian_updates
  for select
  using (public.current_role() = 'guardian' and student_id = public.my_linked_student_id());
