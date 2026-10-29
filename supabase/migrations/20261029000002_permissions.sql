-- Permissions (spec §6). Three layers:
--   1. Grants: the `anon` role (not logged in) gets no table access at all.
--   2. RLS policies: which ROWS a logged-in user may read/insert/update/delete.
--   3. Guard triggers: which COLUMNS a non-owner may change (RLS can't express that).
-- A request with no user (service role / SQL editor) bypasses the guards: that's the admin path.

-- ─── 1. Not logged in = no access ─────────────────────────────────────────────
revoke all on public.profiles, public.projects, public.tasks, public.findings, public.finding_images
  from anon;

-- ─── Helper: is the current user the lead? ────────────────────────────────────
-- security definer so policies can read profiles without recursing into profiles' own RLS.
create function public.is_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'lead' from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_lead() from anon;

-- ─── 2. Row level security ────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.findings       enable row level security;
alter table public.finding_images enable row level security;

-- profiles: readable by the team; changed only by admins (no client write policies).
create policy "team can read profiles" on public.profiles
  for select to authenticated using (true);

-- projects: anyone on the team creates/edits; only the lead deletes.
create policy "team can read projects" on public.projects
  for select to authenticated using (true);
create policy "team can create projects" on public.projects
  for insert to authenticated with check (created_by = auth.uid());
create policy "team can edit projects" on public.projects
  for update to authenticated using (true) with check (true);
create policy "lead can delete projects" on public.projects
  for delete to authenticated using (public.is_lead());

-- tasks: anyone creates/assigns; column rules for updates live in tasks_guard.
create policy "team can read tasks" on public.tasks
  for select to authenticated using (true);
create policy "team can create tasks as themselves" on public.tasks
  for insert to authenticated with check (created_by = auth.uid());
create policy "team can update tasks (guarded)" on public.tasks
  for update to authenticated using (true) with check (true);
create policy "creator or lead can delete tasks" on public.tasks
  for delete to authenticated using (created_by = auth.uid() or public.is_lead());

-- findings: anyone logs as themselves; column rules for updates live in findings_guard.
create policy "team can read findings" on public.findings
  for select to authenticated using (true);
create policy "team can log findings as themselves" on public.findings
  for insert to authenticated with check (author_id = auth.uid());
create policy "team can update findings (guarded)" on public.findings
  for update to authenticated using (true) with check (true);
create policy "author or lead can delete findings" on public.findings
  for delete to authenticated using (author_id = auth.uid() or public.is_lead());

-- finding_images: same rights as editing the parent finding.
create policy "team can read finding images" on public.finding_images
  for select to authenticated using (true);
create policy "author or lead can add finding images" on public.finding_images
  for insert to authenticated with check (
    exists (select 1 from public.findings f
            where f.id = finding_id and (f.author_id = auth.uid() or public.is_lead()))
  );
create policy "author or lead can remove finding images" on public.finding_images
  for delete to authenticated using (
    exists (select 1 from public.findings f
            where f.id = finding_id and (f.author_id = auth.uid() or public.is_lead()))
  );
create policy "author or lead can reorder finding images" on public.finding_images
  for update to authenticated using (
    exists (select 1 from public.findings f
            where f.id = finding_id and (f.author_id = auth.uid() or public.is_lead()))
  );

-- ─── 3. Column guards ─────────────────────────────────────────────────────────
-- Trick: turn OLD and NEW rows into JSON, drop the columns a non-owner MAY change,
-- and compare what's left. Any difference = they touched something they shouldn't.

-- Findings: a non-author, non-lead may only toggle status.
create function public.findings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;  -- admin path (SQL editor / service role)
  end if;
  -- Nobody, not even the lead, can pin a finding on someone else.
  if new.author_id is distinct from old.author_id then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;
  if auth.uid() = old.author_id or public.is_lead() then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'only the author or lead can edit this finding' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger findings_guard
  before update on public.findings
  for each row execute function public.findings_guard();

-- Tasks: a non-creator, non-lead may only change status, and only on tasks assigned to them.
create function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;  -- admin path (SQL editor / service role)
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;
  if auth.uid() = old.created_by or public.is_lead() then
    return new;
  end if;
  if auth.uid() is distinct from old.assigned_to
     or (to_jsonb(new) - 'status' - 'done_at') is distinct from (to_jsonb(old) - 'status' - 'done_at') then
    raise exception 'not allowed to edit this task' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Named so it fires before tasks_set_done_at (Postgres runs same-timing triggers alphabetically).
create trigger tasks_guard
  before update on public.tasks
  for each row execute function public.tasks_guard();
