-- Stage 6: editable marketing content - photos, key/value copy, testimonials.
create table public.site_media (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  url text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  quote text not null,
  display_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.site_media enable row level security;
alter table public.site_content enable row level security;
alter table public.reviews enable row level security;

create policy "site_media_owner_warden_full_access" on public.site_media
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "site_content_owner_warden_full_access" on public.site_content
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

create policy "reviews_owner_warden_full_access" on public.reviews
  for all
  using (public.current_role() in ('owner', 'warden'))
  with check (public.current_role() in ('owner', 'warden'));

-- Public bucket: a public:true bucket serves objects via a public URL
-- with no RLS involved on read, so anon never needs a storage.objects
-- select policy here - only owner/warden need write access.
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true);

create policy "site_media_bucket_owner_warden_write" on storage.objects
  for all
  using (bucket_id = 'site-media' and public.current_role() in ('owner', 'warden'))
  with check (bucket_id = 'site-media' and public.current_role() in ('owner', 'warden'));
