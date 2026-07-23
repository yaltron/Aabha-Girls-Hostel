-- A Postgres identity column, not a manually-computed max()+1 - atomic
-- under concurrent payment recording, and backfills every existing
-- payment row with a number in insertion order automatically.
alter table public.payments add column receipt_no bigint generated always as identity;
