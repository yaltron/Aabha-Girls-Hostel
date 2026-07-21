-- Stage 3: room creation/pricing is financial config - owner-only from here.
-- Warden keeps full read/write on beds (bed assignment stays operational)
-- and keeps read-only on rooms (still needs to see room type/price to
-- inform check-in), just can no longer create rooms or change price.
drop policy "rooms_owner_warden_full_access" on public.rooms;
drop policy "rooms_read_all_authenticated" on public.rooms;

create policy "rooms_owner_full_access" on public.rooms
  for all
  using (public.current_role() = 'owner')
  with check (public.current_role() = 'owner');

create policy "rooms_read_all_authenticated" on public.rooms
  for select
  using (public.current_role() in ('warden', 'student', 'guardian'));
