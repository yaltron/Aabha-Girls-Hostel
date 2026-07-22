-- Stage 6: the entire anonymous read surface. Views run with their
-- owner's privileges (not the caller's), so anon can select from these
-- without ever being granted access to the base tables they read from.
create view public.public_room_availability as
  select
    r.room_type,
    min(r.monthly_price) as monthly_price,
    count(*) filter (where b.status = 'vacant') as beds_available
  from public.rooms r
  join public.beds b on b.room_id = r.id
  group by r.room_type;

create view public.public_weekly_menu as
  select day_of_week, meal, description from public.menu_items;

create view public.public_notices as
  select id, title, body, created_at from public.notices
  where public_visible = true;

grant select on public.public_room_availability to anon;
grant select on public.public_weekly_menu to anon;
grant select on public.public_notices to anon;
