-- Flat team: activity history (docs/superpowers/specs/2026-11-03-flat-team-design.md §5).
-- An append-only log of what happened to each project / task / finding: created, edited, status
-- changed, deleted / restored, files added / removed, checklist changes. Written ONLY by the
-- database triggers below, so a client can't forge or erase history.
--
-- Contract the client relies on (action -> details):
--   created, deleted, restored                       {}
--   edited                                           {"fields": {"<col>": {"from": v, "to": v} | null}}
--                                                    (null = long text changed, values not stored)
--   status_changed                                   {"from": s, "to": s, "reason"?: blocked_reason}
--   file_added, file_removed                         {"file_name": n}   (finding screenshots: "Screenshot")
--   checklist_added / _renamed / _removed /
--   _ticked / _unticked                              {"title": t}  (_renamed adds "from")
--
-- Design notes:
--   * "after insert or update" row triggers: they see the final NEW row, after the before-triggers
--     (stamp_deleted, guards, set_done_at) have run, so we log what was really saved.
--   * Writers are security definer (owned by the migration role) so they can insert into a table that
--     clients have no write privileges on. actor_id = auth.uid(); null for admin (SQL editor), and
--     admin changes are still logged.

-- ─── 1. Table ─────────────────────────────────────────────────────────────────
create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete cascade,
  finding_id uuid references public.findings (id) on delete cascade,
  actor_id   uuid references public.profiles (id),
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_one_subject check (num_nonnulls(project_id, task_id, finding_id) = 1)
);

create index activity_task_idx    on public.activity (task_id, created_at);
create index activity_finding_idx on public.activity (finding_id, created_at);
create index activity_project_idx on public.activity (project_id, created_at);

alter table public.activity enable row level security;
create policy "team can read activity" on public.activity
  for select to authenticated using (true);
-- No insert / update / delete policies, and no privileges either (second lock).
revoke all on public.activity from anon, authenticated;
grant select on public.activity to authenticated;

-- ─── 2. Helpers ───────────────────────────────────────────────────────────────
-- Compare two rows (as jsonb) over the listed columns. Short columns keep from/to values; long ones
-- are recorded as null. Returns null when nothing changed.
create function public.activity_diff(p_old jsonb, p_new jsonb, p_short text[], p_long text[])
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  fields jsonb := '{}'::jsonb;
  col text;
begin
  foreach col in array p_short loop
    if p_old -> col is distinct from p_new -> col then
      fields := fields || jsonb_build_object(
        col, jsonb_build_object('from', p_old -> col, 'to', p_new -> col));
    end if;
  end loop;
  foreach col in array p_long loop
    if p_old -> col is distinct from p_new -> col then
      fields := fields || jsonb_build_object(col, null);
    end if;
  end loop;
  if fields = '{}'::jsonb then
    return null;
  end if;
  return jsonb_build_object('fields', fields);
end;
$$;

-- Insert one activity row. Exactly one of the three ids should be non-null (the check enforces it).
create function public.activity_log(
  p_project uuid, p_task uuid, p_finding uuid, p_action text, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (project_id, task_id, finding_id, actor_id, action, details)
  values (p_project, p_task, p_finding, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb));
$$;
-- Only the trigger functions (also security definer, same owner) may call the writer.
revoke execute on function public.activity_log(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.activity_diff(jsonb, jsonb, text[], text[]) from public, anon, authenticated;

-- ─── 3. Projects ──────────────────────────────────────────────────────────────
create function public.projects_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(new.id, null, null, 'created');
    return null;
  end if;

  -- A delete or restore is logged, and any content change in the same update is still logged below.
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.activity_log(new.id, null, null, 'deleted');
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.activity_log(new.id, null, null, 'restored');
  end if;

  diff := public.activity_diff(to_jsonb(old), to_jsonb(new), array['name'], array['description']);
  if diff is not null then
    perform public.activity_log(new.id, null, null, 'edited', diff);
  end if;
  return null;
end;
$$;

create trigger projects_activity after insert or update on public.projects
  for each row execute function public.projects_activity();

-- ─── 4. Tasks ─────────────────────────────────────────────────────────────────
create function public.tasks_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
  det jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(null, new.id, null, 'created');
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.activity_log(null, new.id, null, 'deleted');
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.activity_log(null, new.id, null, 'restored');
  end if;

  if new.status is distinct from old.status then
    det := jsonb_build_object('from', old.status, 'to', new.status);
    if new.status = 'blocked' and new.blocked_reason is not null then
      det := det || jsonb_build_object('reason', new.blocked_reason);
    end if;
    perform public.activity_log(null, new.id, null, 'status_changed', det);
  end if;

  diff := public.activity_diff(
    to_jsonb(old), to_jsonb(new),
    array['title', 'deadline', 'start_date', 'assigned_to', 'project_id', 'needs_review'],
    array['explanation', 'submission_note']);
  if diff is not null then
    perform public.activity_log(null, new.id, null, 'edited', diff);
  end if;
  return null;
end;
$$;

create trigger tasks_activity after insert or update on public.tasks
  for each row execute function public.tasks_activity();

-- ─── 5. Findings ──────────────────────────────────────────────────────────────
create function public.findings_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  diff jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(null, null, new.id, 'created');
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform public.activity_log(null, null, new.id, 'deleted');
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.activity_log(null, null, new.id, 'restored');
  end if;

  if new.status is distinct from old.status then
    perform public.activity_log(null, null, new.id, 'status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  diff := public.activity_diff(
    to_jsonb(old), to_jsonb(new),
    array['title', 'project_id', 'task_id', 'finding_date'],
    array['explanation']);
  if diff is not null then
    perform public.activity_log(null, null, new.id, 'edited', diff);
  end if;
  return null;
end;
$$;

create trigger findings_activity after insert or update on public.findings
  for each row execute function public.findings_activity();

-- ─── 6. Files: logged on the PARENT item ──────────────────────────────────────
create function public.task_attachments_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(null, new.task_id, null, 'file_added',
      jsonb_build_object('file_name', new.file_name));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.activity_log(null, new.task_id, null, 'file_removed',
      jsonb_build_object('file_name', new.file_name));
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.activity_log(null, new.task_id, null, 'file_added',
      jsonb_build_object('file_name', new.file_name));
  end if;
  return null;
end;
$$;

create trigger task_attachments_activity after insert or update on public.task_attachments
  for each row execute function public.task_attachments_activity();

create function public.finding_images_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(null, null, new.finding_id, 'file_added',
      jsonb_build_object('file_name', 'Screenshot'));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.activity_log(null, null, new.finding_id, 'file_removed',
      jsonb_build_object('file_name', 'Screenshot'));
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.activity_log(null, null, new.finding_id, 'file_added',
      jsonb_build_object('file_name', 'Screenshot'));
  end if;
  return null;
end;
$$;

create trigger finding_images_activity after insert or update on public.finding_images
  for each row execute function public.finding_images_activity();

-- ─── 7. Checklist ─────────────────────────────────────────────────────────────
-- Position changes (reordering) are not logged.
create function public.task_checklist_items_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.activity_log(null, new.task_id, null, 'checklist_added',
      jsonb_build_object('title', new.title));
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- When the whole task is purged (admin hard delete), the cascade removes the items after the task
    -- is gone; logging then would reference a missing task and fail the purge. Skip it.
    if exists (select 1 from public.tasks where id = old.task_id) then
      perform public.activity_log(null, old.task_id, null, 'checklist_removed',
        jsonb_build_object('title', old.title));
    end if;
    return null;
  end if;

  if new.title is distinct from old.title then
    perform public.activity_log(null, new.task_id, null, 'checklist_renamed',
      jsonb_build_object('title', new.title, 'from', old.title));
  end if;
  if new.done and not old.done then
    perform public.activity_log(null, new.task_id, null, 'checklist_ticked',
      jsonb_build_object('title', new.title));
  elsif old.done and not new.done then
    perform public.activity_log(null, new.task_id, null, 'checklist_unticked',
      jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create trigger task_checklist_items_activity
  after insert or update or delete on public.task_checklist_items
  for each row execute function public.task_checklist_items_activity();

-- ─── 8. Backfill: one "created" row per existing item ─────────────────────────
insert into public.activity (project_id, actor_id, action, created_at)
select id, created_by, 'created', created_at from public.projects;
insert into public.activity (task_id, actor_id, action, created_at)
select id, created_by, 'created', created_at from public.tasks;
insert into public.activity (finding_id, actor_id, action, created_at)
select id, author_id, 'created', created_at from public.findings;
