-- Public site visual redesign: the Reserve-a-Bed form is expanded to
-- collect a guardian name (previously only guardian_phone existed) and
-- one emergency contact, plus an optional free-text note - still well
-- within the project's data-minimalism law (no DOB, no documents, no
-- address). All four columns are nullable; the anon insert policy's
-- with check (status = 'pending' and reserved_bed_id is null) does not
-- reference them, so it needs no change.
alter table public.bookings add column guardian_name text;
alter table public.bookings add column emergency_contact_name text;
alter table public.bookings add column emergency_contact_phone text;
alter table public.bookings add column note text;

alter type payment_method add value 'fonepay';
