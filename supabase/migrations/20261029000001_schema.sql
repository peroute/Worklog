-- Worklog schema (spec §5). Plain Postgres; only auth.users/auth.uid() are Supabase-specific.

-- ─── profiles: one row per team member, 1:1 with auth.users ───────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         text not null default 'member' check (role in ('lead', 'member')),
  created_at   timestamptz not null default now()
);

-- Create a profile automatically whenever an auth user is created (dashboard or admin API).
-- security definer: runs with the function owner's rights, because the auth service
-- inserting into auth.users has no rights on public.profiles.
-- search_path = '': forces fully-qualified names so nobody can shadow them.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── projects ─────────────────────────────────────────────────────────────────
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(trim(name)) > 0),
  description text,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- ─── tasks ────────────────────────────────────────────────────────────────────
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(trim(title)) > 0),
  explanation text,
  assigned_to uuid not null references public.profiles (id),
  deadline    date,
  status      text not null default 'todo' check (status in ('todo', 'done')),
  done_at     timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

-- Keep done_at in sync with status, so the app can never forget to set it.
create function public.set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at := now();
  elsif new.status = 'todo' then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_set_done_at
  before insert or update of status on public.tasks
  for each row execute function public.set_done_at();

-- ─── findings ─────────────────────────────────────────────────────────────────
create table public.findings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete set null,
  title        text not null check (char_length(trim(title)) > 0),
  explanation  text not null,
  -- "Today" in the team's timezone, not UTC (a finding at 23:30 Central stays on that day).
  finding_date date not null default (now() at time zone 'America/Chicago')::date,
  status       text not null default 'open' check (status in ('open', 'closed')),
  author_id    uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index findings_project_date_idx on public.findings (project_id, finding_date desc);
create index findings_date_idx on public.findings (finding_date);
create index findings_task_id_idx on public.findings (task_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger findings_set_updated_at
  before update on public.findings
  for each row execute function public.set_updated_at();

-- ─── finding_images: screenshot metadata; the file itself lives in Storage ────
create table public.finding_images (
  id           uuid primary key default gen_random_uuid(),
  finding_id   uuid not null references public.findings (id) on delete cascade,
  -- Path inside the bucket, e.g. findings/<finding_id>/<uuid>.webp. Never a URL (spec §9).
  storage_path text not null unique,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create index finding_images_finding_id_idx on public.finding_images (finding_id, position);
