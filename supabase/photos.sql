-- =====================================================================
--  Photos + likes (run after schema.sql). Safe to re-run.
-- =====================================================================

create table if not exists upload_tickets (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '15 minutes'
);

create table if not exists photos (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  goal_id     uuid references goals(id) on delete set null,
  log_date    date not null,
  path        text not null unique,
  caption     text,
  created_at  timestamptz not null default now()
);
create index if not exists photos_created_idx on photos(created_at desc);
create index if not exists photos_member_date_idx on photos(member_id, log_date);

create table if not exists photo_likes (
  photo_id    uuid not null references photos(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (photo_id, member_id)
);

alter table upload_tickets enable row level security;
alter table photos         enable row level security;
alter table photo_likes    enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on upload_tickets, photos, photo_likes from anon, authenticated';
  end if;
end $$;

-- ---------- Storage bucket (Supabase only) ---------------------------
-- Photos live in a public "photos" bucket under random, unguessable paths.
-- Uploading needs a short-lived ticket that only a logged-in person can get.
create or replace function fb_ticket_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from upload_tickets t
    where t.id::text = split_part(p_name, '/', 1) and t.expires_at > now())
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
    execute 'drop policy if exists "fambam ticket uploads" on storage.objects';
    execute $p$create policy "fambam ticket uploads" on storage.objects
      for insert to anon, authenticated
      with check (bucket_id = 'photos' and public.fb_ticket_ok(name))$p$;
  end if;
end $$;

-- ---------- Photo API -------------------------------------------------

create or replace function fb_photo_ticket(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token); t uuid;
begin
  delete from upload_tickets where expires_at < now() - interval '1 day';
  insert into upload_tickets(member_id) values (me) returning id into t;
  return t;
end $$;

create or replace function fb_photo_json(p photos, me uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'member_id', p.member_id, 'goal_id', p.goal_id, 'log_date', p.log_date,
    'path', p.path, 'caption', p.caption, 'created_at', p.created_at,
    'likes', (select count(*) from photo_likes l where l.photo_id = p.id),
    'liked', exists (select 1 from photo_likes l where l.photo_id = p.id and l.member_id = me),
    'likers', coalesce((select jsonb_agg(m.name order by l.created_at)
                        from photo_likes l join members m on m.id = l.member_id
                        where l.photo_id = p.id), '[]'::jsonb))
$$;

create or replace function fb_add_photo(
  p_token uuid, p_path text, p_goal_id uuid, p_date date, p_caption text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token); p photos;
begin
  if not exists (select 1 from upload_tickets t
                 where t.member_id = me and t.id::text = split_part(p_path, '/', 1)) then
    raise exception 'bad_upload';
  end if;
  if p_goal_id is not null and not exists (select 1 from goals where id = p_goal_id and member_id = me) then
    raise exception 'not_your_goal';
  end if;
  if p_date > current_date + 1 then raise exception 'future_date'; end if;
  insert into photos(member_id, goal_id, log_date, path, caption)
  values (me, p_goal_id, p_date, p_path, nullif(trim(coalesce(p_caption, '')), ''))
  returning * into p;
  return fb_photo_json(p, me);
end $$;

create or replace function fb_update_photo(p_token uuid, p_photo_id uuid, p_caption text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  update photos set caption = nullif(trim(coalesce(p_caption, '')), '')
  where id = p_photo_id and member_id = me;
end $$;

create or replace function fb_delete_photo(p_token uuid, p_photo_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  delete from photos where id = p_photo_id and member_id = me;
end $$;

create or replace function fb_toggle_like(p_token uuid, p_photo_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token); p photos;
begin
  select * into p from photos where id = p_photo_id;
  if p.id is null then raise exception 'no_photo'; end if;
  if exists (select 1 from photo_likes where photo_id = p_photo_id and member_id = me) then
    delete from photo_likes where photo_id = p_photo_id and member_id = me;
  else
    insert into photo_likes(photo_id, member_id) values (p_photo_id, me);
  end if;
  return fb_photo_json(p, me);
end $$;

-- Newest first. Pass the created_at of the last photo you have to get older ones.
create or replace function fb_feed(p_token uuid, p_before timestamptz default null, p_limit int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(fb_member_json(m)) from members m), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(fb_photo_json(x, me) order by x.created_at desc)
      from (select * from photos
            where p_before is null or created_at < p_before
            order by created_at desc limit least(greatest(p_limit, 1), 50)) x), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'emoji', g.emoji))
      from goals g where g.id in (select goal_id from photos where goal_id is not null)), '[]'::jsonb)
  );
end $$;

-- Photos for a date range (used on Today), mine or everyone's
create or replace function fb_photos_between(p_token uuid, p_from date, p_to date, p_everyone boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  return coalesce((
    select jsonb_agg(fb_photo_json(p, me) order by p.created_at)
    from photos p
    where (p_everyone or p.member_id = me) and p.log_date between p_from and p_to), '[]'::jsonb);
end $$;

-- ---------- Permissions ------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['fb_photo_json(photos,uuid)'] loop
    execute format('revoke execute on function %s from public', r);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function fb_ticket_ok(text) to anon, authenticated';
    execute 'grant execute on function fb_photo_ticket(uuid) to anon, authenticated';
    execute 'grant execute on function fb_add_photo(uuid,text,uuid,date,text) to anon, authenticated';
    execute 'grant execute on function fb_update_photo(uuid,uuid,text) to anon, authenticated';
    execute 'grant execute on function fb_delete_photo(uuid,uuid) to anon, authenticated';
    execute 'grant execute on function fb_toggle_like(uuid,uuid) to anon, authenticated';
    execute 'grant execute on function fb_feed(uuid,timestamptz,integer) to anon, authenticated';
    execute 'grant execute on function fb_photos_between(uuid,date,date,boolean) to anon, authenticated';
  end if;
end $$;
