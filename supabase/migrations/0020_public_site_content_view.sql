create view public.public_site_content as
  select key, value from public.site_content;

grant select on public.public_site_content to anon;
