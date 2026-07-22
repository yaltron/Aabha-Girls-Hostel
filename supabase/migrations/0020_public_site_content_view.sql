create view public.public_site_content as
  select key, value from public.site_content;

grant select on public.public_site_content to anon;

create view public.public_site_media as
  select id, category, url, caption, sort_order from public.site_media
  order by sort_order;

grant select on public.public_site_media to anon;
