-- =====================================================================
--  Fam Bam Fitness Challenge — database schema
--  Paste this whole file into Supabase → SQL Editor → Run.
--  It's safe to re-run: it only creates things that don't exist yet
--  and replaces the functions.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null unique,          -- digits only, last 10 digits (e.g. 5551234567)
  sprite      text not null default 'megan', -- mark, jaimi, megan, nate, matthew, riley, julia, staci, carol
  created_at  timestamptz not null default now()
);

create table if not exists sessions (
  token       uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- A goal is flexible along two axes:
--   cadence: 'daily'  -> every day
--            'days'   -> specific days of the week (days_of_week, 0=Sun … 6=Sat)
--            'weekly' -> N times (or N units) per week, Mon–Sun
--            'monthly'-> N times (or N units) per calendar month
--   kind:    'check'  -> just check it off
--            'amount' -> log a number (unit, e.g. miles / minutes / pages)
--   target:  check + weekly/monthly -> how many times per period
--            amount + daily/days    -> amount needed that day to count
--            amount + weekly/monthly-> total amount per period
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references members(id) on delete cascade,
  title         text not null,
  emoji         text,
  cadence       text not null check (cadence in ('daily','days','weekly','monthly')),
  kind          text not null default 'check' check (kind in ('check','amount')),
  target        numeric not null default 1 check (target > 0),
  unit          text,
  days_of_week  smallint[] not null default '{}',
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  start_date    date not null default current_date,
  archived_at   timestamptz
);
create index if not exists goals_member_idx on goals(member_id);

create table if not exists logs (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references goals(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  log_date    date not null,
  done        boolean not null default false,
  amount      numeric,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (goal_id, log_date)
);
create index if not exists logs_member_date_idx on logs(member_id, log_date);

-- A daily note that isn't tied to one goal ("rest day, knee sore")
create table if not exists day_notes (
  member_id   uuid not null references members(id) on delete cascade,
  log_date    date not null,
  note        text not null,
  updated_at  timestamptz not null default now(),
  primary key (member_id, log_date)
);

-- ---------- Lock the tables down -------------------------------------
-- Nobody touches tables directly. The app only talks to the functions
-- below, which check the session token first.
alter table members   enable row level security;
alter table sessions  enable row level security;
alter table goals     enable row level security;
alter table logs      enable row level security;
alter table day_notes enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on members, sessions, goals, logs, day_notes from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on members, sessions, goals, logs, day_notes from authenticated';
  end if;
end $$;

-- ---------- Helpers ---------------------------------------------------

create or replace function fb_norm_phone(p text) returns text
language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

-- Keep phones normalized no matter how they're typed into the table editor
create or replace function fb_members_norm() returns trigger
language plpgsql as $$
begin
  new.phone := fb_norm_phone(new.phone);
  new.sprite := lower(coalesce(new.sprite, 'megan'));
  return new;
end $$;

drop trigger if exists members_norm on members;
create trigger members_norm before insert or update on members
for each row execute function fb_members_norm();

create or replace function fb_member_for(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  update sessions set last_seen = now() where token = p_token returning member_id into v;
  if v is null then
    raise exception 'not_logged_in' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function fb_member_json(m members) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', m.id, 'name', m.name, 'sprite', m.sprite)
$$;

-- ---------- API (called from the app) -------------------------------

create or replace function fb_login(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; t uuid;
begin
  select * into m from members where phone = fb_norm_phone(p_phone);
  if m.id is null then
    raise exception 'unknown_phone' using errcode = '28000';
  end if;
  insert into sessions(member_id) values (m.id) returning token into t;
  return jsonb_build_object('token', t, 'member', fb_member_json(m));
end $$;

create or replace function fb_logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token;
$$;

create or replace function fb_me(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where id = fb_member_for(p_token);
  return fb_member_json(m);
end $$;

create or replace function fb_set_sprite(p_token uuid, p_sprite text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  update members set sprite = p_sprite where id = fb_member_for(p_token) returning * into m;
  return fb_member_json(m);
end $$;

-- Everything the app needs for a date range, for one person or everyone.
--   p_everyone = false -> just me (Today / Goals screens)
--   p_everyone = true  -> the whole fam (Fam screen)
create or replace function fb_board(p_token uuid, p_from date, p_to date, p_everyone boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  return jsonb_build_object(
    'me', me,
    'members', coalesce((
      select jsonb_agg(fb_member_json(m) order by m.name)
      from members m where p_everyone or m.id = me), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(to_jsonb(g) - 'created_at' order by g.sort_order, g.created_at)
      from goals g
      where (p_everyone or g.member_id = me)
        and g.start_date <= p_to
        and (g.archived_at is null or g.archived_at::date >= p_from)), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'goal_id', l.goal_id, 'member_id', l.member_id, 'log_date', l.log_date,
        'done', l.done, 'amount', l.amount, 'note', l.note, 'updated_at', l.updated_at))
      from logs l
      where (p_everyone or l.member_id = me)
        and l.log_date between p_from and p_to), '[]'::jsonb),
    'day_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', d.member_id, 'log_date', d.log_date, 'note', d.note, 'updated_at', d.updated_at))
      from day_notes d
      where (p_everyone or d.member_id = me)
        and d.log_date between p_from and p_to), '[]'::jsonb)
  );
end $$;

create or replace function fb_save_goal(p_token uuid, p_goal jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token); g goals;
begin
  if nullif(p_goal->>'id', '') is null then
    insert into goals(member_id, title, emoji, cadence, kind, target, unit, days_of_week, sort_order, start_date)
    values (
      me,
      p_goal->>'title',
      nullif(p_goal->>'emoji', ''),
      p_goal->>'cadence',
      coalesce(p_goal->>'kind', 'check'),
      coalesce((p_goal->>'target')::numeric, 1),
      nullif(p_goal->>'unit', ''),
      coalesce(array(select jsonb_array_elements_text(p_goal->'days_of_week')::smallint), '{}'),
      coalesce((select max(sort_order) + 1 from goals where member_id = me), 0),
      coalesce((p_goal->>'start_date')::date, current_date)
    ) returning * into g;
  else
    update goals set
      title        = p_goal->>'title',
      emoji        = nullif(p_goal->>'emoji', ''),
      cadence      = p_goal->>'cadence',
      kind         = coalesce(p_goal->>'kind', 'check'),
      target       = coalesce((p_goal->>'target')::numeric, 1),
      unit         = nullif(p_goal->>'unit', ''),
      days_of_week = coalesce(array(select jsonb_array_elements_text(p_goal->'days_of_week')::smallint), '{}')
    where id = (p_goal->>'id')::uuid and member_id = me
    returning * into g;
    if g.id is null then raise exception 'not_your_goal'; end if;
  end if;
  return to_jsonb(g) - 'created_at';
end $$;

create or replace function fb_archive_goal(p_token uuid, p_goal_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  update goals set archived_at = now() where id = p_goal_id and member_id = me;
  -- a goal created today and archived with no history is just removed
  delete from goals g where g.id = p_goal_id and g.member_id = me
    and not exists (select 1 from logs l where l.goal_id = g.id);
end $$;

create or replace function fb_save_log(
  p_token uuid, p_goal_id uuid, p_date date, p_done boolean, p_amount numeric, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token); l logs;
begin
  if not exists (select 1 from goals where id = p_goal_id and member_id = me) then
    raise exception 'not_your_goal';
  end if;
  if p_date > current_date + 1 then
    raise exception 'future_date';
  end if;
  if not coalesce(p_done, false) and p_amount is null and nullif(trim(coalesce(p_note, '')), '') is null then
    delete from logs where goal_id = p_goal_id and log_date = p_date;
    return null;
  end if;
  insert into logs(goal_id, member_id, log_date, done, amount, note)
  values (p_goal_id, me, p_date, coalesce(p_done, false), p_amount, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (goal_id, log_date) do update set
    done = excluded.done, amount = excluded.amount, note = excluded.note, updated_at = now()
  returning * into l;
  return to_jsonb(l);
end $$;

create or replace function fb_save_day_note(p_token uuid, p_date date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := fb_member_for(p_token);
begin
  if nullif(trim(coalesce(p_note, '')), '') is null then
    delete from day_notes where member_id = me and log_date = p_date;
  else
    insert into day_notes(member_id, log_date, note) values (me, p_date, trim(p_note))
    on conflict (member_id, log_date) do update set note = excluded.note, updated_at = now();
  end if;
end $$;

-- ---------- Permissions on the functions -----------------------------
do $$
declare r text;
begin
  -- internal helpers: nobody outside the database may call these
  foreach r in array array['fb_member_for(uuid)', 'fb_member_json(members)', 'fb_members_norm()', 'fb_norm_phone(text)']
  loop
    execute format('revoke execute on function %s from public', r);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach r in array array[
      'fb_login(text)', 'fb_logout(uuid)', 'fb_me(uuid)', 'fb_set_sprite(uuid,text)',
      'fb_board(uuid,date,date,boolean)', 'fb_save_goal(uuid,jsonb)', 'fb_archive_goal(uuid,uuid)',
      'fb_save_log(uuid,uuid,date,boolean,numeric,text)', 'fb_save_day_note(uuid,date,text)']
    loop
      execute format('grant execute on function %s to anon, authenticated', r);
    end loop;
  end if;
end $$;
